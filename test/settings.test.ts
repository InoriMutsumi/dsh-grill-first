import { describe, it, expect } from 'vitest'
import { apply } from '../src/index.js'
import type { GrillContext } from '../src/types.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createSettingsHandler, type BrowserPeer, type Connection, type Settings } from '../src/settings/bridge.js'

describe('settings owner bridge', () => {
  it('mounts transport before its own entry becomes active and resolves settings at request time', async () => {
    let entries: Array<{id: string; options: {id: string; name: string}}> = []
    let route: any
    let saved = { enabled: false, unrelated: 'preserved' }
    const owner = { principal: { kind: 'owner' } }
    const services: Record<string, any> = {
      configEditor: {
        entries: () => entries,
        configuration: () => entries.map(entry => ({entry, inherited: {}, override: saved})),
        edit: async (_entry: unknown, change: any) => { saved = change(saved, {}) },
      },
      connection: { browserPeer: owner, rpc: { handle: (channel: string, handler: any) => { route = { channel, handler }; return async () => {} } } },
      settings: {
        describe: () => [], // Ordinary fields are absent from SettingsForms.
        update: async (ns: string) => { if (ns !== 'entry:test') throw new Error('Unknown settings namespace') },
      },
      workspaceRegistry: { list: () => [] },
      tools: { register: () => () => {} },
    }
    services.webServer = {}
    const ctx = { get: (key: string) => services[key], inject: (_keys: string[], fn: any) => fn(ctx), effect: (fn: any) => fn(), extend: (props: any) => { expect(props.webServer).toBe(services.webServer); return {connection: services.connection} } }
    apply(ctx as unknown as GrillContext, { enabled: false })
    expect(route?.channel).toBe('/dsh-grill-first-settings')
    entries = [{id: 'runtime-entry', options: {id: 'entry:test', name: 'dsh-grill-first'}}]
    expect(await route.handler('read', {}, new AbortController().signal, owner)).toMatchObject({ok: true, value: {config: {enabled: false}}})
    const before = await route.handler('read', {}, new AbortController().signal, owner)
    expect(await route.handler('save', {revision: before.value.revision, patch: {enabled: true}}, new AbortController().signal, owner)).toMatchObject({ok: true})
    expect(saved).toEqual({enabled: true, unrelated: 'preserved'})
    expect(await route.handler('read', {}, new AbortController().signal, owner)).toMatchObject({ok: true, value: {config: {enabled: true}}})
    expect(await route.handler('save', {revision: before.value.revision, patch: {enabled: false}}, new AbortController().signal, owner)).toMatchObject({ok: false, error: {code: 'REVISION_CONFLICT'}})
  })

  async function fixture() {
    const root = await mkdtemp(path.join(tmpdir(), 'grill-settings-'))
    const owner: BrowserPeer = { principal: { kind: 'owner' } }
    const connection: Connection = { browserPeer: owner, rpc: { handle: () => async () => {} } }
    let revision = 1
    let config = { enabled: true, intensity: 'standard' }
    const settings: Settings = {
      describe: () => [{ ns: 'entry:test', revision, value: config }],
      update: async (_ns, patch, expected) => { if (expected !== revision) throw new Error('conflict'); config = { ...config, ...patch }; revision++ },
    }
    const registry = { list: () => [{ id: 'registered', title: '项目', path: root }], get: (id: string) => id === 'registered' ? { id, title: '项目', path: root, status: async () => 'ok' as const } : undefined }
    const handler = createSettingsHandler(connection, settings, registry, { namespace: 'entry:test' })
    const call = (endpoint: string, payload: unknown, peer = owner) => handler(endpoint, payload, new AbortController().signal, peer)
    return { root, call, owner }
  }
  it('rejects forged owner objects and remote peers before any operation', async () => {
    const f = await fixture()
    try {
      const forged = await f.call('read', {}, { principal: { kind: 'owner' } })
      expect(forged).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
      const remote = await f.call('save', { revision: 1, patch: { enabled: false } }, { principal: { kind: 'remote' } })
      expect(remote).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } })
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
  it('validates settings and detects stale revisions without overwriting', async () => {
    const f = await fixture()
    try {
      expect(await f.call('save', { revision: 1, patch: { maxRounds: 999 } })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
      expect(await f.call('save', { revision: 1, patch: { enabled: false } })).toMatchObject({ ok: true })
      expect(await f.call('save', { revision: 1, patch: { enabled: true } })).toMatchObject({ ok: false, error: { code: 'REVISION_CONFLICT' } })
      expect(await f.call('read', {})).toMatchObject({ ok: true, value: { config: { enabled: false }, revision: 2, workspaces: [{ id: 'registered', title: '项目' }] } })
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
  it('persists preference CRUD and prevents arbitrary paths, forged sources, and stale mutations', async () => {
    const f = await fixture()
    const request = { scope: 'project', workspaceId: 'registered' }
    async function list() {
      const result = await f.call('preferences', request)
      expect(result.ok).toBe(true)
      return (result as { ok: true; value: { revision: string; preferences: { id: string; text: string; enabled: boolean; source: string }[] } }).value
    }
    try {
      expect(await f.call('preferences', { ...request, workspaceId: f.root })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
      expect(await f.call('preferences', { ...request, workspaceRoot: f.root })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
      let snapshot = await list()
      expect(await f.call('mutate', { ...request, mutation: { action: 'add', text: '中文注释', source: 'system', revision: snapshot.revision } })).toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
      expect(await f.call('mutate', { ...request, mutation: { action: 'add', text: '中文注释', revision: snapshot.revision } })).toMatchObject({ ok: true })
      const staleRevision = snapshot.revision
      snapshot = await list()
      expect(snapshot.preferences).toMatchObject([{ text: '中文注释', source: 'user', enabled: true }])
      const id = snapshot.preferences[0]!.id
      expect(await f.call('mutate', { ...request, mutation: { action: 'delete', id, revision: staleRevision } })).toMatchObject({ ok: false, error: { code: 'REVISION_CONFLICT' } })
      expect(await f.call('mutate', { ...request, mutation: { action: 'update', id, text: '简短中文注释', revision: snapshot.revision } })).toMatchObject({ ok: true })
      snapshot = await list()
      expect(snapshot.preferences[0]!.text).toBe('简短中文注释')
      expect(await f.call('mutate', { ...request, mutation: { action: 'toggle', id, enabled: false, revision: snapshot.revision } })).toMatchObject({ ok: true })
      snapshot = await list()
      expect(snapshot.preferences[0]!.enabled).toBe(false)
      expect(await f.call('mutate', { ...request, mutation: { action: 'delete', id, revision: snapshot.revision } })).toMatchObject({ ok: true })
      expect((await list()).preferences).toEqual([])
    } finally { await rm(f.root, { recursive: true, force: true }) }
  })
})
