import type { GrillContext } from '../types.js'
import { listPreferences, mutatePreference, type PreferenceMutation } from '../memory/store.js'

export const SETTINGS_CHANNEL = '/dsh-grill-first-settings'
/** Existing Connection RPC extension; this channel is never registered as an LLM tool. */
export interface BrowserPeer { principal: { kind: string }; signal?: AbortSignal }
export type RpcResult = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string; details: object } }
export interface Connection {
  readonly browserPeer: BrowserPeer
  rpc: { handle(channel: string, handler: (endpoint: string, payload: unknown, signal: AbortSignal, peer: BrowserPeer) => Promise<RpcResult>): () => Promise<void> }
}
export interface Settings {
  describe(options?: { redactSecrets?: boolean }): { ns: string; value: unknown; revision: number }[]
  update(ns: string, patch: object, expectedRevision?: number): Promise<void>
}
export interface WorkspaceRegistry {
  list(): { id: string; title: string; path: string }[]
  get(id: string): { id: string; title: string; path: string; status(): Promise<'ok' | 'missing-dir'> } | undefined
}
export interface SettingsBridgeOptions {
  /** Exact settings namespace belonging to this plugin instance; never inferred from a client payload. */
  namespace: string | (() => string)
  projectScope?: () => 'project' | 'global'
  settings?: Settings
}
function invalid(message: string): never { throw Object.assign(new Error(message), { code: 'INVALID_INPUT' }) }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('请求必须是对象')
  return value as Record<string, unknown>
}
function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 16000) invalid(`${name} 无效`)
  return value
}
function keys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) invalid('请求包含不支持的字段')
}
export function validateSettingsPatch(value: unknown): Record<string, unknown> {
  const patch = object(value)
  const enums: Record<string, readonly string[]> = {
    intensity: ['gentle', 'standard', 'grill'], gateMode: ['off', 'warn', 'strict', 'ask'],
    memoryScope: ['project', 'global'], researchMode: ['off', 'auto', 'always'], researchDepth: ['quick', 'deep'],
  }
  keys(patch, ['enabled', 'memoryEnabled', 'maxRounds', 'maxQuestionsPerRound', 'bypassKeywords', ...Object.keys(enums)])
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'bypassKeywords') {
      if (!Array.isArray(value) || value.length < 1 || value.length > 50 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 100)) invalid('跳过词须为1至50个非空短词')
    } else if (key === 'enabled' || key === 'memoryEnabled') { if (typeof value !== 'boolean') invalid(`${key} 必须是布尔值`) }
    else if (key === 'maxRounds' || key === 'maxQuestionsPerRound') {
      if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > (key === 'maxRounds' ? 10 : 6)) invalid(`${key} 超出范围`)
    } else if (typeof value !== 'string' || !enums[key]?.includes(value)) invalid(`${key} 选项无效`)
  }
  return { ...patch }
}
export function validateMutation(value: unknown): PreferenceMutation {
  const data = object(value)
  const revision = text(data.revision, 'revision')
  const action = data.action
  if (action === 'delete' || action === 'toggle') {
    keys(data, action === 'delete' ? ['action', 'id', 'revision'] : ['action', 'id', 'revision', 'enabled'])
    const id = text(data.id, 'id')
    if (action === 'delete') return { action, id, revision }
    if (typeof data.enabled !== 'boolean') invalid('enabled 必须是布尔值')
    return { action, id, revision, enabled: data.enabled }
  }
  if (action !== 'add' && action !== 'update') invalid('未知偏好操作')
  // Source is provenance assigned by the Host, not an authority claim supplied by a caller.
  keys(data, action === 'add' ? ['action', 'text', 'tags', 'enabled', 'revision'] : ['action', 'id', 'text', 'tags', 'revision'])
  const body = text(data.text, '偏好文本')
  if (data.tags !== undefined && (!Array.isArray(data.tags) || data.tags.length > 50 || data.tags.some(tag => typeof tag !== 'string' || tag.length > 200))) invalid('标签无效')
  const tags = data.tags as string[] | undefined
  if (action === 'update') return { action, id: text(data.id, 'id'), text: body, tags, revision }
  if (data.enabled !== undefined && typeof data.enabled !== 'boolean') invalid('enabled 必须是布尔值')
  return { action, text: body, tags, enabled: data.enabled as boolean | undefined, source: 'user', revision }
}
export function createSettingsHandler(connection: Connection, settings: Settings, workspaces: WorkspaceRegistry, options: SettingsBridgeOptions) {
  return async (endpoint: string, payload: unknown, signal: AbortSignal, peer: BrowserPeer): Promise<RpcResult> => {
    try {
      // Check actual transport identity, never a client-provided flag or ambient missing agent.
      if (!peer || peer !== connection.browserPeer || peer.principal?.kind !== 'owner') {
        return { ok: false, error: { code: 'FORBIDDEN', message: '仅宿主所有者的浏览器可以管理需求澄清设置', details: {} } }
      }
      if (signal.aborted || peer.signal?.aborted) throw Object.assign(new Error('请求已取消'), { code: 'ABORTED' })
      const data = object(payload)
      const namespace = () => typeof options.namespace === 'function' ? options.namespace() : options.namespace
      const descriptor = () => {
        const result = settings.describe({ redactSecrets: true }).find(item => item.ns === namespace())
        if (!result) throw Object.assign(new Error('需求澄清设置命名空间尚未装配'), { code: 'NOT_READY' })
        return result
      }
      let value: unknown
      if (endpoint === 'read') {
        keys(data, [])
        const current = descriptor()
        // Only expose the fields managed by this page, not other plugin internals.
        const config = Object.fromEntries(Object.entries(object(current.value)).filter(([key]) => ['enabled', 'intensity', 'gateMode', 'maxRounds', 'maxQuestionsPerRound', 'memoryEnabled', 'memoryScope', 'researchMode', 'researchDepth', 'bypassKeywords'].includes(key)))
        value = { config, revision: current.revision, workspaces: workspaces.list().map(({ id, title }) => ({ id, title })) }
      } else if (endpoint === 'save') {
        keys(data, ['patch', 'revision'])
        if (!Number.isInteger(data.revision) || (data.revision as number) < 0) invalid('配置 revision 无效')
        if (descriptor().revision !== data.revision) throw Object.assign(new Error('设置已被其他页面修改，请重新载入'), { code: 'REVISION_CONFLICT' })
        await settings.update(namespace(), validateSettingsPatch(data.patch), data.revision as number)
        value = { saved: true }
      } else if (endpoint === 'preferences' || endpoint === 'mutate') {
        keys(data, endpoint === 'preferences' ? ['scope', 'workspaceId'] : ['scope', 'workspaceId', 'mutation'])
        if (data.scope !== 'global' && data.scope !== 'project') invalid('偏好范围无效')
        let root: string | undefined
        if (data.scope === 'project') {
          const workspace = workspaces.get(text(data.workspaceId, 'workspaceId'))
          if (!workspace || await workspace.status() !== 'ok') invalid('请选择有效的已登记工作区')
          root = workspace.path
        } else if (data.workspaceId !== undefined) invalid('全局偏好不接受工作区参数')
        if (signal.aborted) throw Object.assign(new Error('请求已取消'), { code: 'ABORTED' })
        value = endpoint === 'preferences'
          ? await listPreferences(root, data.scope, options.projectScope?.() ?? 'project')
          : await mutatePreference(root, data.scope, validateMutation(data.mutation), options.projectScope?.() ?? 'project')
      } else invalid('未知设置操作')
      return { ok: true, value }
    } catch (error) {
      const detail = error as { code?: unknown; message?: unknown }
      return { ok: false, error: { code: typeof detail.code === 'string' ? detail.code : 'SETTINGS_ERROR', message: typeof detail.message === 'string' ? detail.message : '设置操作失败', details: {} } }
    }
  }
}
/** Call inside the owning plugin entry. Cordis effects dispose the channel on reload. */
export function installSettingsBridge(ctx: GrillContext, options: SettingsBridgeOptions): void {
  ctx.inject(['connection', 'webServer', 'workspaceRegistry'], scoped => {
    const transportContext = scoped as unknown as { extend(properties: object): { connection: Connection } }
    const connection = transportContext.extend({ webServer: scoped.get('webServer') }).connection
    const settings = options.settings
    if (!settings) throw new Error('普通配置适配器未提供')
    const workspaces = scoped.get('workspaceRegistry') as WorkspaceRegistry
    const handler = createSettingsHandler(connection, settings, workspaces, options)
    scoped.effect(() => connection.rpc.handle(SETTINGS_CHANNEL, handler), 'grill-first: settings owner RPC')
  })
}
