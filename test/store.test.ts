import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_HISTORY, SUMMARY_LIMIT, forget, globalMemoryPath, loadMemory, projectMemoryPath, saveHistory, savePreference, saveProjectContext, summarize } from '../dist/memory/store.js'
let home: string
let workspace: string
const originalHome = process.env.DSH_GRILL_HOME
beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'grill-home-'))
  workspace = await mkdtemp(path.join(tmpdir(), 'grill-ws-'))
  process.env.DSH_GRILL_HOME = home
})
afterEach(async () => {
  if (originalHome === undefined) delete process.env.DSH_GRILL_HOME
  else process.env.DSH_GRILL_HOME = originalHome
  await rm(home, { recursive: true, force: true })
  await rm(workspace, { recursive: true, force: true })
})
describe('旧 API 兼容', () => {
  it('路径与不存在的记忆', async () => {
    expect(globalMemoryPath()).toBe(path.join(home, 'global.json'))
    expect(projectMemoryPath(workspace)).toBe(path.join(workspace, '.dsh', 'grill-first', 'memory.json'))
    const memory = await loadMemory(workspace)
    expect(memory.global.preferences).toEqual([])
    expect(memory.project.project_context).toEqual([])
    expect(memory.project.history).toEqual([])
  })
  it('偏好、背景、历史能落盘读回，写入有效 JSON 和真实换行', async () => {
    await savePreference('注释一律用中文', ['语言'], workspace)
    await saveProjectContext('DSH 插件项目', workspace)
    await saveHistory('做个爬虫', '目标：抓取商品列表', workspace)
    const memory = await loadMemory(workspace)
    expect(memory.global.preferences[0]).toMatchObject({ text: '注释一律用中文', tags: ['语言'] })
    expect(memory.project.project_context).toEqual(['DSH 插件项目'])
    expect(memory.project.history[0]).toMatchObject({ task: '做个爬虫', requirements: '目标：抓取商品列表' })
    expect(memory.project.history[0]?.date).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/)
    const raw = await readFile(projectMemoryPath(workspace), 'utf8')
    expect(raw.charCodeAt(raw.length - 1)).toBe(10)
    expect(JSON.parse(raw).history).toHaveLength(1)
  })
  it('去重真正忽略空白和尾部标点，合并标签；空文本不写入', async () => {
    await savePreference('回答 用中文', ['语言'], workspace)
    await savePreference(' 回答用中文。 ', ['格式'], workspace)
    await savePreference('  ', [], workspace)
    await saveProjectContext('同一句 话', workspace)
    await saveProjectContext('同一句话。', workspace)
    await saveProjectContext(' ', workspace)
    const memory = await loadMemory(workspace)
    expect(memory.global.preferences).toHaveLength(1)
    expect(memory.global.preferences[0]?.tags).toEqual(['语言', '格式'])
    expect(memory.global.preferences[0]?.updated).toBeGreaterThan(0)
    expect(memory.project.project_context).toHaveLength(1)
  })
  it('历史不去重，并仅保留最近 MAX_HISTORY 条', async () => {
    await saveHistory('相同任务', '需求', workspace)
    await saveHistory('相同任务', '需求', workspace)
    expect((await loadMemory(workspace)).project.history).toHaveLength(2)
    await forget('project', workspace)
    for (let i = 0; i < MAX_HISTORY + 5; i++) await saveHistory(`任务 ${i}`, '需求', workspace)
    const history = (await loadMemory(workspace)).project.history
    expect(history).toHaveLength(MAX_HISTORY)
    expect(history[0]?.task).toBe('任务 5')
    expect(history.at(-1)?.task).toBe(`任务 ${MAX_HISTORY + 4}`)
  })
  it('旧读取容错，坏文件写入拒绝且原字节不变', async () => {
    await writeFile(globalMemoryPath(), 'not json at all')
    expect((await loadMemory(workspace)).global.preferences).toEqual([])
    await expect(savePreference('新偏好', [], workspace)).rejects.toMatchObject({ code: 'MEMORY_READ_ERROR' })
    await expect(forget('global', workspace)).rejects.toMatchObject({ code: 'MEMORY_READ_ERROR' })
    expect(await readFile(globalMemoryPath(), 'utf8')).toBe('not json at all')
  })
  it('不规范的旧条目读取时被补成合法结构', async () => {
    const file = projectMemoryPath(workspace)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify({ project_context: [1, 'ok', ''], history: [{ task: 't' }, 'bad'] }))
    const memory = await loadMemory(workspace)
    expect(memory.project.project_context).toEqual(['ok'])
    expect(memory.project.history).toEqual([{ task: 't', requirements: '', date: '' }])
  })
  it('forget 按范围清除', async () => {
    await savePreference('偏好1', [], workspace)
    await saveProjectContext('背景1', workspace)
    await forget('project', workspace)
    expect((await loadMemory(workspace)).global.preferences).toHaveLength(1)
    expect((await loadMemory(workspace)).project.project_context).toEqual([])
    await forget('all', workspace)
    expect((await loadMemory(workspace)).global.preferences).toEqual([])
  })
  it('摘要兼容旧快照、长度受限、折叠空白', () => {
    const memory = {
      global: { preferences: [{ text: '中文\n\t回答', tags: [], updated: 0 }] },
      project: { project_context: ['背景'.repeat(100)], history: [{ task: '任务', requirements: '需求'.repeat(300), date: '' }] },
    }
    const text = summarize(memory)
    expect(text).toContain('中文 回答')
    for (const title of ['全局偏好', '项目背景', '历史需求']) expect(text).toContain(`【${title}】`)
    expect(text.length).toBeLessThanOrEqual(SUMMARY_LIMIT)
    expect(summarize({ global: { preferences: [] }, project: { project_context: [], history: [] } })).toBe('')
  })
  it('global 项目落点跨工作区共享，project 落点隔离，forget 可指定落点', async () => {
    expect(projectMemoryPath(workspace, 'global')).toBe(path.join(home, 'project.json'))
    await saveProjectContext('共享背景', workspace, 'global')
    const otherWorkspace = path.join(workspace, 'other')
    expect((await loadMemory(otherWorkspace, 'global')).project.project_context).toEqual(['共享背景'])
    expect((await loadMemory(workspace)).project.project_context).toEqual([])
    await saveProjectContext('本地背景', workspace)
    expect((await loadMemory(workspace, 'global')).project.project_context).toEqual(['共享背景'])
    await forget('project', workspace, 'global')
    expect((await loadMemory(workspace, 'global')).project.project_context).toEqual([])
    expect((await loadMemory(workspace)).project.project_context).toEqual(['本地背景'])
  })
})
