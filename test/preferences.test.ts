import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_PREFERENCE_LENGTH, globalMemoryPath, projectMemoryPath, listPreferences, mutatePreference, loadMemory, savePreference, saveHistory, saveProjectContext, summarize } from '../dist/memory/store.js'
let root: string
let workspace: string
const originalHome = process.env.DSH_GRILL_HOME
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'grill-preferences-'))
  workspace = path.join(root, 'workspace')
  process.env.DSH_GRILL_HOME = root
})
afterEach(async () => {
  if (originalHome === undefined) delete process.env.DSH_GRILL_HOME
  else process.env.DSH_GRILL_HOME = originalHome
  await rm(root, { recursive: true, force: true })
})
describe('偏好管理', () => {
  it.each(['global', 'project'] as const)('%s 增改停用删除，ID 稳定且停用不进摘要', async scope => {
    let state = await listPreferences(workspace, scope)
    state = await mutatePreference(workspace, scope, { action: 'add', text: '使用中文', source: 'user', revision: state.revision })
    const id = state.preferences[0]!.id
    const updated = state.preferences[0]!.updated
    expect(state.preferences[0]).toMatchObject({ source: 'user', enabled: true })
    expect((await listPreferences(workspace, scope)).preferences[0]!.id).toBe(id)
    state = await mutatePreference(workspace, scope, { action: 'update', id, text: '注释使用中文', revision: state.revision })
    expect(state.preferences[0]).toMatchObject({ id, text: '注释使用中文', source: 'user' })
    expect(state.preferences[0]!.updated).toBeGreaterThan(updated)
    expect(summarize(await loadMemory(workspace))).toContain('注释使用中文')
    state = await mutatePreference(workspace, scope, { action: 'toggle', id, enabled: false, revision: state.revision })
    expect(summarize(await loadMemory(workspace))).not.toContain('注释使用中文')
    state = await mutatePreference(workspace, scope, { action: 'delete', id, revision: state.revision })
    expect(state.preferences).toEqual([])
    expect((await listPreferences(workspace, scope)).preferences).toEqual([])
  })
  it('迁移 legacy 尾部 literal 换行和稳定 ID，保留项目背景历史及扩展字段', async () => {
    const oldGlobal = { preferences: [{ text: '旧偏好', tags: ['语言'], updated: 123 }], extension: 'keep' }
    await writeFile(globalMemoryPath(), JSON.stringify(oldGlobal) + String.fromCharCode(92, 110))
    const file = projectMemoryPath(workspace)
    await mkdir(path.dirname(file), { recursive: true })
    const history = [{ task: '旧任务', requirements: '旧需求', date: '2020-01-01' }]
    await writeFile(file, JSON.stringify({ project_context: ['旧背景'], history, extra: 7 }))
    const old = await listPreferences(workspace, 'global')
    expect(old.preferences[0]).toMatchObject({ text: '旧偏好', updated: 123, source: 'legacy', enabled: true })
    expect((await listPreferences(workspace, 'global')).preferences[0]!.id).toBe(old.preferences[0]!.id)
    const next = await mutatePreference(workspace, 'global', { action: 'toggle', id: old.preferences[0]!.id, enabled: false, revision: old.revision })
    expect(next.preferences[0]!.id).toBe(old.preferences[0]!.id)
    expect(JSON.parse(await readFile(globalMemoryPath(), 'utf8')).extension).toBe('keep')
    const state = await listPreferences(workspace, 'project')
    await mutatePreference(workspace, 'project', { action: 'add', text: '项目偏好', revision: state.revision })
    const project = JSON.parse(await readFile(file, 'utf8'))
    expect(project).toMatchObject({ project_context: ['旧背景'], history, extra: 7 })
  })
  it('同 revision 的并发管理写只有一个成功，其他冲突', async () => {
    const state = await listPreferences(workspace, 'global')
    const results = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => mutatePreference(workspace, 'global', { action: 'add', text: `偏好${index}`, revision: state.revision })))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    for (const result of results) if (result.status === 'rejected') expect(result.reason.code).toBe('REVISION_CONFLICT')
    expect((await listPreferences(workspace, 'global')).preferences).toHaveLength(1)
  })
  it('旧 API 并发写不丢更新且无残留临时文件，旧写导致管理 revision 失效', async () => {
    const old = await listPreferences(workspace, 'global')
    await Promise.all(Array.from({ length: 30 }, (_, i) => savePreference(`偏好${i}`, [], workspace)))
    await Promise.all(Array.from({ length: 20 }, (_, i) => Promise.all([saveHistory(`任务${i}`, '需求', workspace), saveProjectContext(`背景${i}`, workspace)])))
    const memory = await loadMemory(workspace)
    expect(memory.global.preferences).toHaveLength(30)
    expect(memory.project.project_context).toHaveLength(20)
    expect(memory.project.history).toHaveLength(20)
    await expect(mutatePreference(workspace, 'global', { action: 'add', text: '冲突', revision: old.revision })).rejects.toMatchObject({ code: 'REVISION_CONFLICT' })
    expect((await readdir(root)).filter(name => name.endsWith('.tmp'))).toEqual([])
    expect((await readdir(path.dirname(projectMemoryPath(workspace)))).filter(name => name.endsWith('.tmp'))).toEqual([])
  })
  it('长度限制及错误输入不改变原文件，锁错误后仍可继续写入', async () => {
    const state = await listPreferences(workspace, 'global')
    for (const text of ['', ' ', 'x'.repeat(MAX_PREFERENCE_LENGTH + 1)]) {
      await expect(mutatePreference(workspace, 'global', { action: 'add', text, revision: state.revision })).rejects.toThrow()
    }
    const saved = await mutatePreference(workspace, 'global', { action: 'add', text: 'x'.repeat(MAX_PREFERENCE_LENGTH), revision: state.revision })
    const before = await readFile(globalMemoryPath(), 'utf8')
    await expect(mutatePreference(workspace, 'global', { action: 'update', id: saved.preferences[0]!.id, text: '', revision: saved.revision })).rejects.toThrow()
    await expect(mutatePreference(workspace, 'global', { action: 'delete', id: 'missing', revision: saved.revision })).rejects.toThrow()
    expect(await readFile(globalMemoryPath(), 'utf8')).toBe(before)
    await expect(savePreference('x'.repeat(MAX_PREFERENCE_LENGTH + 1), [], workspace)).rejects.toThrow()
  })
  it.each(['broken', 'null', '[]', '{"preferences":42}'])('坏数据 %s 的管理读写均拒绝且保留原字节', async raw => {
    await writeFile(globalMemoryPath(), raw)
    await expect(listPreferences(workspace, 'global')).rejects.toMatchObject({ code: 'MEMORY_READ_ERROR' })
    await expect(mutatePreference(workspace, 'global', { action: 'add', text: '新偏好', revision: 'missing' })).rejects.toMatchObject({ code: 'MEMORY_READ_ERROR' })
    expect(await readFile(globalMemoryPath(), 'utf8')).toBe(raw)
  })
  it('global 项目落点共享，默认项目偏好隔离；旧学习不会重新启用停用偏好', async () => {
    let state = await listPreferences(workspace, 'project', 'global')
    await mutatePreference(workspace, 'project', { action: 'add', text: '共享偏好', revision: state.revision }, 'global')
    expect((await listPreferences(path.join(root, 'other'), 'project', 'global')).preferences[0]!.text).toBe('共享偏好')
    expect((await listPreferences(workspace, 'project')).preferences).toEqual([])
    state = await listPreferences(workspace, 'global')
    await mutatePreference(workspace, 'global', { action: 'add', text: '停用偏好', enabled: false, revision: state.revision })
    await savePreference('停用 偏好。', [], workspace)
    expect(summarize(await loadMemory(workspace))).not.toContain('停用')
    expect((await listPreferences(workspace, 'global')).preferences[0]!.enabled).toBe(false)
  })
})
