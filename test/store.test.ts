/** 两层记忆存储的单测：写入/读取/去重/坏文件容错/清除/摘要长度（工作表 3.1）。 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SUMMARY_LIMIT,
  forget,
  globalMemoryPath,
  loadMemory,
  projectMemoryPath,
  saveHistory,
  savePreference,
  saveProjectContext,
  summarize,
} from '../dist/memory/store.js'

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

describe('路径解析', () => {
  it('全局层落在 DSH_GRILL_HOME，项目层落在工作区', () => {
    expect(globalMemoryPath()).toBe(path.join(home, 'global.json'))
    expect(projectMemoryPath(workspace)).toBe(path.join(workspace, '.dsh', 'grill-first', 'memory.json'))
  })
})

describe('写入与读取', () => {
  it('文件不存在时返回空结构且不报错', async () => {
    const memory = await loadMemory(workspace)
    expect(memory.global.preferences).toEqual([])
    expect(memory.project.project_context).toEqual([])
    expect(memory.project.history).toEqual([])
  })

  it('偏好、项目背景、历史都能落盘并读回', async () => {
    await savePreference('注释一律用中文', ['语言'], workspace)
    await saveProjectContext('这是一个 DSH 插件项目', workspace)
    await saveHistory('做个爬虫', '目标：抓取商品列表', workspace)

    const memory = await loadMemory(workspace)
    expect(memory.global.preferences).toHaveLength(1)
    expect(memory.global.preferences[0]?.text).toBe('注释一律用中文')
    expect(memory.global.preferences[0]?.tags).toEqual(['语言'])
    expect(memory.project.project_context).toEqual(['这是一个 DSH 插件项目'])
    expect(memory.project.history[0]?.task).toBe('做个爬虫')
    expect(memory.project.history[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const raw = await readFile(projectMemoryPath(workspace), 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
  })

  it('相同偏好去重，且刷新 updated', async () => {
    await savePreference('回答用中文', ['语言'], workspace)
    await savePreference('  回答用中文。 ', [], workspace)
    const memory = await loadMemory(workspace)
    expect(memory.global.preferences).toHaveLength(1)
    expect(memory.global.preferences[0]?.updated).toBeGreaterThan(0)
  })

  it('相同项目背景去重', async () => {
    await saveProjectContext('同一句话', workspace)
    await saveProjectContext('同一句话', workspace)
    const memory = await loadMemory(workspace)
    expect(memory.project.project_context).toHaveLength(1)
  })

  it('历史记录不去重（同任务多次确认是两条记录）', async () => {
    await saveHistory('任务A', '需求A', workspace)
    await saveHistory('任务A', '需求A', workspace)
    const memory = await loadMemory(workspace)
    expect(memory.project.history).toHaveLength(2)
  })

  it('空文本不写入', async () => {
    await savePreference('   ', [], workspace)
    await saveProjectContext('  ', workspace)
    const memory = await loadMemory(workspace)
    expect(memory.global.preferences).toHaveLength(0)
    expect(memory.project.project_context).toHaveLength(0)
  })
})

describe('容错', () => {
  it('坏 JSON 返回空结构而不抛错', async () => {
    await mkdir(path.dirname(globalMemoryPath()), { recursive: true })
    await writeFile(globalMemoryPath(), '{ 这不是 JSON', 'utf8')
    const memory = await loadMemory(workspace)
    expect(memory.global.preferences).toEqual([])
  })

  it('结构不对的 JSON 会被补成合法结构', async () => {
    await mkdir(path.dirname(projectMemoryPath(workspace)), { recursive: true })
    await writeFile(
      projectMemoryPath(workspace),
      JSON.stringify({ project_context: [1, 'ok', ''], history: [{ task: 't' }, 'bad'] }),
      'utf8',
    )
    const memory = await loadMemory(workspace)
    expect(memory.project.project_context).toEqual(['ok'])
    expect(memory.project.history).toHaveLength(1)
    expect(memory.project.history[0]?.requirements).toBe('')
  })

  it('坏文件之后仍能正常追加（自愈）', async () => {
    await mkdir(path.dirname(globalMemoryPath()), { recursive: true })
    await writeFile(globalMemoryPath(), 'not json at all', 'utf8')
    await savePreference('新偏好', [], workspace)
    const memory = await loadMemory(workspace)
    expect(memory.global.preferences.map((p) => p.text)).toEqual(['新偏好'])
  })
})

describe('forget 与 summarize', () => {
  it('forget 按范围清除', async () => {
    await savePreference('偏好1', [], workspace)
    await saveProjectContext('背景1', workspace)
    await forget('project', workspace)
    let memory = await loadMemory(workspace)
    expect(memory.global.preferences).toHaveLength(1)
    expect(memory.project.project_context).toHaveLength(0)

    await forget('all', workspace)
    memory = await loadMemory(workspace)
    expect(memory.global.preferences).toHaveLength(0)
  })

  it('summarize 生成中文摘要且不超过上限', () => {
    const memory = {
      global: {
        preferences: Array.from({ length: 10 }, (_v, i) => ({
          text: `偏好条目 ${i}：${'很长的偏好描述'.repeat(6)}`,
          tags: [],
          updated: i,
        })),
      },
      project: {
        project_context: Array.from({ length: 10 }, (_v, i) => `项目背景 ${i}：${'细节'.repeat(20)}`),
        history: Array.from({ length: 5 }, (_v, i) => ({
          task: `任务 ${i}`,
          requirements: '需求'.repeat(50),
          date: '2026-01-01',
        })),
      },
    }
    const text = summarize(memory)
    expect(text).toContain('【全局偏好】')
    expect(text).toContain('【项目背景】')
    expect(text).toContain('【历史需求】')
    expect(text.length).toBeLessThanOrEqual(SUMMARY_LIMIT)
  })

  it('空记忆的摘要为空串', () => {
    expect(summarize({ global: { preferences: [] }, project: { project_context: [], history: [] } })).toBe('')
  })
})
