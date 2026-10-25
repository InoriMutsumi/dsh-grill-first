/**
 * 两层记忆存储（R5）：
 * - 全局层：跨项目的通用偏好，默认 `<home>/.dsh/grill-first/global.json`；
 * - 项目层：当前工作区的项目背景与历史需求，默认 `<workspace>/.dsh/grill-first/memory.json`。
 *
 * 写入一律"写临时文件 → rename"（原子写）；读取容错，坏 JSON 视为空结构而不抛错。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

/** 全局层的一条通用偏好。 */
export interface GlobalPreference {
  text: string
  tags: string[]
  updated: number
}

/** 全局层结构（global.json）。 */
export interface GlobalMemory {
  preferences: GlobalPreference[]
}

/** 项目层的一条历史需求记录。 */
export interface HistoryEntry {
  task: string
  requirements: string
  date: string
}

/** 项目层结构（memory.json）。 */
export interface ProjectMemory {
  project_context: string[]
  history: HistoryEntry[]
}

/** 两层记忆的快照。 */
export interface MemorySnapshot {
  global: GlobalMemory
  project: ProjectMemory
}

/** forget() 的作用范围。 */
export type MemoryScope = 'global' | 'project' | 'all'

/** 项目层记忆的落点（0.1.4）：跟着工作区走，或全局共享一份。 */
export type ProjectScope = 'project' | 'global'

/** 项目层历史条目的保留上限（0.1.4 修：以前只增不减，文件会越长越大）。 */
export const MAX_HISTORY = 100

/** 摘要长度上限（字符数），供注入提示用。 */
export const SUMMARY_LIMIT = 500

/** 摘要里各段的条数上限。 */
const SUMMARY_MAX_PREFERENCES = 5
const SUMMARY_MAX_CONTEXT = 5
const SUMMARY_MAX_HISTORY = 3

/** 空全局层。 */
export function emptyGlobal(): GlobalMemory {
  return { preferences: [] }
}

/** 空项目层。 */
export function emptyProject(): ProjectMemory {
  return { project_context: [], history: [] }
}

/** 空快照。 */
export function emptySnapshot(): MemorySnapshot {
  return { global: emptyGlobal(), project: emptyProject() }
}

/** 解析工作区根目录（未传时用进程 cwd）。 */
export function resolveWorkspace(workspaceRoot?: string): string {
  const raw = workspaceRoot && workspaceRoot.trim() !== '' ? workspaceRoot : process.cwd()
  return path.resolve(raw)
}

/**
 * 全局记忆文件路径。
 *
 * 优先 `DSH_GRILL_HOME` 环境变量（测试与自定义部署用）；否则 `<home>/.dsh/grill-first/global.json`。
 * 阶段 1 实测：DSH 没有把 profile 目录通过环境变量暴露给插件，因此无法可靠定位 profile 配置目录，
 * 固定到 `~/.dsh/grill-first/`（跨 profile 共享用户偏好，语义上也更合理）。
 */
export function globalMemoryPath(): string {
  const override = process.env.DSH_GRILL_HOME
  const base =
    override && override.trim() !== '' ? path.resolve(override) : path.join(homedir(), '.dsh', 'grill-first')
  return path.join(base, 'global.json')
}

/**
 * 项目记忆文件路径。
 * @param workspaceRoot 工作区根目录。
 * @param scope project（默认）= `<workspace>/.dsh/grill-first/memory.json`；
 *   global = 与 global.json 同目录的 `project.json`（不想往项目里写文件时用）。
 */
export function projectMemoryPath(workspaceRoot?: string, scope: ProjectScope = 'project'): string {
  if (scope === 'global') return path.join(path.dirname(globalMemoryPath()), 'project.json')
  return path.join(resolveWorkspace(workspaceRoot), '.dsh', 'grill-first', 'memory.json')
}

/** 归一化用于去重比较的文本（去空白、统一小写、去尾部标点）。 */
function normalizeKey(text: string): string {
  return text.replace(/\s+/g, '').replace(/[。；;，,！!？?]+$/g, '').toLowerCase()
}

/** 读取 JSON；文件不存在或解析失败都返回 fallback（容错，不抛错）。 */
async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(file, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback
    return parsed as T
  } catch {
    return fallback
  }
}

/** 原子写入 JSON（先写 .tmp 再 rename）。 */
async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  await rename(tmp, file)
}

/** 把任意来源的全局层数据补成合法结构。 */
function coerceGlobal(value: GlobalMemory | undefined): GlobalMemory {
  const list = Array.isArray(value?.preferences) ? value.preferences : []
  const preferences: GlobalPreference[] = []
  for (const item of list) {
    if (!item || typeof item.text !== 'string' || item.text.trim() === '') continue
    preferences.push({
      text: item.text.trim(),
      tags: Array.isArray(item.tags) ? item.tags.filter((t): t is string => typeof t === 'string') : [],
      updated: typeof item.updated === 'number' && Number.isFinite(item.updated) ? item.updated : 0,
    })
  }
  return { preferences }
}

/** 把任意来源的项目层数据补成合法结构。 */
function coerceProject(value: ProjectMemory | undefined): ProjectMemory {
  const context = Array.isArray(value?.project_context)
    ? value.project_context.filter((t): t is string => typeof t === 'string' && t.trim() !== '')
    : []
  const history: HistoryEntry[] = []
  const rawHistory = Array.isArray(value?.history) ? value.history : []
  for (const item of rawHistory) {
    if (!item || typeof item !== 'object') continue
    const task = typeof item.task === 'string' ? item.task : ''
    const requirements = typeof item.requirements === 'string' ? item.requirements : ''
    const date = typeof item.date === 'string' ? item.date : ''
    if (task.trim() === '' && requirements.trim() === '') continue
    history.push({ task, requirements, date })
  }
  return { project_context: context, history }
}

/**
 * 读取两层记忆。
 * @param workspaceRoot 工作区根目录；省略时用 `process.cwd()`。
 */
export async function loadMemory(workspaceRoot?: string, scope: ProjectScope = 'project'): Promise<MemorySnapshot> {
  const global = coerceGlobal(await readJson<GlobalMemory>(globalMemoryPath(), emptyGlobal()))
  const project = coerceProject(await readJson<ProjectMemory>(projectMemoryPath(workspaceRoot, scope), emptyProject()))
  return { global, project }
}

/**
 * 追加一条全局偏好（按文本去重，重复则刷新 updated 时间）。
 * @param text 偏好原文，例如"注释一律用中文"。
 * @param tags 分类标签，例如 `["语言"]`。
 * @param workspaceRoot 工作区根目录（仅用于定位项目层，写入的是全局层）。
 */
export async function savePreference(text: string, tags: string[], workspaceRoot?: string): Promise<void> {
  const trimmed = text.trim()
  if (trimmed === '') return
  const file = globalMemoryPath()
  const memory = coerceGlobal(await readJson<GlobalMemory>(file, emptyGlobal()))
  const key = normalizeKey(trimmed)
  const existing = memory.preferences.find((p) => normalizeKey(p.text) === key)
  const now = Date.now()
  if (existing) {
    existing.text = trimmed
    existing.updated = now
    if (Array.isArray(tags) && tags.length > 0) {
      const merged = new Set([...existing.tags, ...tags.filter((t) => typeof t === 'string' && t.trim() !== '')])
      existing.tags = [...merged]
    }
  } else {
    memory.preferences.push({
      text: trimmed,
      tags: Array.isArray(tags) ? tags.filter((t) => typeof t === 'string' && t.trim() !== '') : [],
      updated: now,
    })
  }
  void workspaceRoot
  await writeJsonAtomic(file, memory)
}

/**
 * 追加一条项目背景（按文本去重）。
 * @param text 项目背景原文。
 * @param workspaceRoot 工作区根目录。
 */
export async function saveProjectContext(
  text: string,
  workspaceRoot?: string,
  scope: ProjectScope = 'project',
): Promise<void> {
  const trimmed = text.trim()
  if (trimmed === '') return
  const file = projectMemoryPath(workspaceRoot, scope)
  const memory = coerceProject(await readJson<ProjectMemory>(file, emptyProject()))
  const key = normalizeKey(trimmed)
  if (!memory.project_context.some((t) => normalizeKey(t) === key)) {
    memory.project_context.push(trimmed)
  }
  await writeJsonAtomic(file, memory)
}

/**
 * 追加一条历史需求记录（R3：需求清单只进这里，绝不落盘成需求文件）。
 * @param task 任务原文或摘要。
 * @param requirements 用户确认过的四段式需求清单。
 * @param workspaceRoot 工作区根目录。
 */
export async function saveHistory(
  task: string,
  requirements: string,
  workspaceRoot?: string,
  scope: ProjectScope = 'project',
): Promise<void> {
  const file = projectMemoryPath(workspaceRoot, scope)
  const memory = coerceProject(await readJson<ProjectMemory>(file, emptyProject()))
  memory.history.push({
    task: task.trim().slice(0, 200),
    requirements: requirements.trim().slice(0, 2000),
    date: new Date().toISOString().slice(0, 10),
  })
  // 只保留最近 MAX_HISTORY 条：摘要只用最后 3 条，其余留着也读不到。
  if (memory.history.length > MAX_HISTORY) memory.history = memory.history.slice(-MAX_HISTORY)
  await writeJsonAtomic(file, memory)
}

/**
 * 清除记忆。
 * @param scope `global` 只清全局层、`project` 只清项目层、`all` 两层都清。
 * @param workspaceRoot 工作区根目录。
 */
export async function forget(scope: MemoryScope, workspaceRoot?: string): Promise<void> {
  if (scope === 'global' || scope === 'all') {
    await writeJsonAtomic(globalMemoryPath(), emptyGlobal())
  }
  if (scope === 'project' || scope === 'all') {
    await writeJsonAtomic(projectMemoryPath(workspaceRoot), emptyProject())
  }
}

/** 截断长文本并补省略号。 */
function clip(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`
}

/**
 * 生成注入提示用的紧凑中文摘要（上限 {@link SUMMARY_LIMIT} 字符）。
 * @param memory 两层记忆快照。
 */
export function summarize(memory: MemorySnapshot): string {
  const sections: string[] = []
  const preferences = memory.global.preferences.slice(-SUMMARY_MAX_PREFERENCES)
  if (preferences.length > 0) {
    sections.push(`【全局偏好】\n${preferences.map((p) => `- ${clip(p.text, 40)}`).join('\n')}`)
  }
  const context = memory.project.project_context.slice(-SUMMARY_MAX_CONTEXT)
  if (context.length > 0) {
    sections.push(`【项目背景】\n${context.map((t) => `- ${clip(t, 60)}`).join('\n')}`)
  }
  const history = memory.project.history.slice(-SUMMARY_MAX_HISTORY)
  if (history.length > 0) {
    sections.push(
      `【历史需求】\n${history.map((h) => `- ${clip(h.task, 30)} → ${clip(h.requirements, 60)}`).join('\n')}`,
    )
  }
  const joined = sections.join('\n')
  if (joined.length <= SUMMARY_LIMIT) return joined
  return `${joined.slice(0, SUMMARY_LIMIT - 1)}…`
}
