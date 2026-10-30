/**
 * 两个工具的行为单测：不依赖 DSH 宿主，用假的 deps 跑通
 * "模糊任务 → 澄清 → 确认放行" 的完整链路（R1/R3/R4/R5）。
 */
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG, type GrillConfig } from '../dist/config.js'
import { GateRegistry } from '../dist/gate/preExecute.js'
import { createGrillConfirmTool } from '../dist/tools/grillConfirm.js'
import { createGrillStartTool } from '../dist/tools/grillStart.js'
import { SessionRegistry } from '../dist/tools/sessions.js'

let home: string
let workspace: string
const originalHome = process.env.DSH_GRILL_HOME

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'grill-tools-home-'))
  workspace = await mkdtemp(path.join(tmpdir(), 'grill-tools-ws-'))
  process.env.DSH_GRILL_HOME = home
})

afterEach(async () => {
  if (originalHome === undefined) delete process.env.DSH_GRILL_HOME
  else process.env.DSH_GRILL_HOME = originalHome
  await rm(home, { recursive: true, force: true })
  await rm(workspace, { recursive: true, force: true })
})

/** 组装工具依赖。 */
function makeDeps(overrides: Partial<GrillConfig> = {}, ask?: (request: unknown) => Promise<unknown>) {
  const config: GrillConfig = { ...DEFAULT_CONFIG, ...overrides }
  const gates = new GateRegistry()
  const sessions = new SessionRegistry()
  const questions = ask ? { ask: ask as (request: never) => Promise<never> } : undefined
  const base = {
    config: () => config,
    gates,
    sessions,
    workspaceRoot: () => workspace,
  }
  return {
    gates,
    sessions,
    config,
    grillStart: createGrillStartTool(base),
    grillConfirm: createGrillConfirmTool({ ...base, questions: () => questions as never }),
  }
}

/** 假的工具执行上下文。 */
function execCtx(agentId = 'agent-1') {
  return { callId: 'call-1', name: 'grill_start', agent: { id: agentId } } as never
}

describe('grill_start', () => {
  it('模糊任务：返回 needs-clarification，门禁置 closed，并带轮次与追问方向', async () => {
    const { grillStart, gates } = makeDeps()
    const result = (await grillStart.execute({ task: '帮我做个爬虫' }, execCtx())) as Record<string, unknown>
    expect(result.verdict).toBe('needs-clarification')
    expect(result.gate_state).toBe('closed')
    expect(result.max_rounds).toBe(3)
    expect(result.max_questions_per_round).toBe(3)
    expect(Array.isArray(result.focus_hints)).toBe(true)
    expect(gates.stateOf('agent-1')).toBe('closed')
  })

  it('明确任务：skip=true 并放行门禁', async () => {
    const { grillStart, gates } = makeDeps()
    const result = (await grillStart.execute(
      { task: '只改 app.ts 的拼写，用 TypeScript，跑通 vitest 就算完成' },
      execCtx(),
    )) as Record<string, unknown>
    expect(result.skip).toBe(true)
    expect(result.verdict).toBe('clear')
    expect(gates.stateOf('agent-1')).toBe('open')
  })

  it('bypass 关键词：直接跳过（R4）', async () => {
    const { grillStart } = makeDeps()
    const result = (await grillStart.execute({ task: '直接做：把 README 错别字改掉' }, execCtx())) as Record<
      string,
      unknown
    >
    expect(result.skip).toBe(true)
    expect(result.reason).toBe('bypass-keyword')
  })

  it('总开关关闭：任何任务都 skip（S7）', async () => {
    const { grillStart, gates } = makeDeps({ enabled: false })
    const result = (await grillStart.execute({ task: '帮我做个爬虫' }, execCtx())) as Record<string, unknown>
    expect(result.skip).toBe(true)
    expect(result.reason).toBe('disabled')
    expect(gates.stateOf('agent-1')).toBe('closed')
  })

  it('缺少 task 参数：提示补齐，不改门禁', async () => {
    const { grillStart } = makeDeps()
    const result = (await grillStart.execute({}, execCtx())) as Record<string, unknown>
    expect(result.verdict).toBe('needs-clarification')
    expect(result.reason).toBe('empty-task')
  })

  it('把已确认的全局偏好带进 memory_context（R5）', async () => {
    const { grillStart, grillConfirm } = makeDeps({}, async () => ({ answers: [{ id: 'grill-confirm', selected: ['确认，按此开工'] }] }))
    await grillConfirm.execute(
      { requirements: '目标：改错别字\n范围：只改 README\n约束：用中文\n验收标准：跑通检查', preferences_learned: ['注释一律用中文'], confirmed: true },
      execCtx(),
    )
    const result = (await grillStart.execute({ task: '帮我做个爬虫' }, execCtx())) as Record<string, unknown>
    expect(String(result.memory_context)).toContain('注释一律用中文')
  })

  it('memoryEnabled=false 时不读记忆', async () => {
    const { grillStart, grillConfirm } = makeDeps({ memoryEnabled: false }, async () => ({ answers: [{ id: 'grill-confirm', selected: ['确认，按此开工'] }] }))
    await grillConfirm.execute(
      { requirements: '目标：X\n范围：Y\n约束：Z\n验收：跑通', preferences_learned: ['偏好P'], confirmed: true },
      execCtx(),
    )
    const result = (await grillStart.execute({ task: '帮我做个爬虫' }, execCtx())) as Record<string, unknown>
    expect(result.memory_context).toBe('')
  })
})

describe('grill_confirm', () => {
  it('没有结构化提问通道时，要求模型用 ask_user_question 兜底，且不放行', async () => {
    const { grillConfirm, gates } = makeDeps()
    const result = (await grillConfirm.execute({ requirements: '目标：X' }, execCtx())) as Record<string, unknown>
    expect(result.confirmed).toBe(false)
    expect(result.needs_user_confirmation).toBe(true)
    expect(String(result.instructions)).toContain('ask_user_question')
    expect(gates.stateOf('agent-1')).toBe('closed')
  })

  it('用户点"确认"：放行门禁 + 写入历史/偏好/项目背景（R3/R5）', async () => {
    const ask = vi.fn(async () => ({ answers: [{ id: 'grill-confirm', selected: ['确认，按此开工'] }] }))
    const { grillConfirm, gates } = makeDeps({}, ask)
    const requirements = '目标：做一个爬虫\n范围：只抓商品列表\n约束：用 Python\n验收标准：跑通一遍输出 CSV'
    const result = (await grillConfirm.execute(
      { requirements, preferences_learned: ['注释一律用中文'] },
      execCtx(),
    )) as Record<string, unknown>

    expect(ask).toHaveBeenCalledTimes(1)
    expect(result.confirmed).toBe(true)
    expect(result.final_requirements).toBe(requirements)
    expect(gates.stateOf('agent-1')).toBe('open')

    const project = JSON.parse(
      await readFile(path.join(workspace, '.dsh', 'grill-first', 'memory.json'), 'utf8'),
    ) as { project_context: string[]; history: { task: string; requirements: string }[] }
    expect(project.history).toHaveLength(1)
    expect(project.history[0]?.requirements).toContain('验收标准')
    expect(project.project_context.length).toBe(1)

    const global = JSON.parse(await readFile(path.join(home, 'global.json'), 'utf8')) as {
      preferences: { text: string }[]
    }
    expect(global.preferences.map((p) => p.text)).toEqual(['注释一律用中文'])
  })

  it('确认卡片：长标题被压成一行短标题，完整清单走 detail（长标题会挤掉选项区）', async () => {
    const ask = vi.fn(async (_request: unknown) => ({
      answers: [{ id: 'grill-confirm', selected: ['确认，按此开工'] }],
    }))
    const { grillConfirm } = makeDeps({}, ask)
    const requirements = `目标：${'很长的目标描述'.repeat(30)}\n范围：只改一个文件\n约束：不要新增依赖\n验收标准：单测全绿`

    await grillConfirm.execute({ requirements }, execCtx())

    const card = (ask.mock.calls[0]?.[0] as { questions: { question: string; detail: string }[] }).questions[0]!
    expect(card.question.length).toBeLessThanOrEqual(61) // 60 字 + 省略号
    expect(card.question.endsWith('…')).toBe(true)
    expect(card.question).not.toContain('\n')
    expect(card.detail).toContain(requirements) // 全文仍然完整可见
    expect(card.detail).toContain('确认后我才会开工')
    expect(card.detail).not.toContain('清单过长')
  })

  it('确认卡片：正文超过 6000 字时拒绝并要求分段摘要', async () => {
    const ask = vi.fn(async (_request: unknown) => ({
      answers: [{ id: 'grill-confirm', selected: ['确认，按此开工'] }],
    }))
    const { grillConfirm } = makeDeps({}, ask)
    const requirements = `目标：做个爬虫\n范围：${'范围说明'.repeat(1500)}\n约束：不要新增依赖\n验收标准：单测全绿`

    await grillConfirm.execute({ requirements }, execCtx())

    expect(ask).not.toHaveBeenCalled()
    const result = await grillConfirm.execute({ requirements, confirmed: true }, execCtx()) as Record<string, unknown>
    expect(result.confirmed).toBe(false)
    expect(result.reason).toBe('requirements-too-long')
    expect(result.instructions).toContain('分段')
  })

  it('确认卡片：清单不长时标题就是清单首行，正文原样带提示', async () => {
    const ask = vi.fn(async (_request: unknown) => ({
      answers: [{ id: 'grill-confirm', selected: ['确认，按此开工'] }],
    }))
    const { grillConfirm } = makeDeps({}, ask)
    const requirements = '目标：改错别字\n范围：只改 README\n约束：用中文\n验收标准：跑通检查'

    await grillConfirm.execute({ requirements }, execCtx())

    const card = (ask.mock.calls[0]?.[0] as { questions: { question: string; detail: string }[] }).questions[0]!
    expect(card.question).toBe('目标：改错别字')
    expect(card.detail).toContain(requirements)
    expect(card.detail).toContain('确认后我才会开工')
    expect(card.detail).not.toContain('清单过长')
  })

  it('用户点"要改"：返回 feedback 且不放行', async () => {
    const ask = vi.fn(async () => ({ answers: [{ id: 'grill-confirm', selected: ['要改'], custom: '范围太大，只改一个文件' }] }))
    const { grillConfirm, gates } = makeDeps({}, ask)
    const result = (await grillConfirm.execute({ requirements: '目标：X' }, execCtx())) as Record<string, unknown>
    expect(result.confirmed).toBe(false)
    expect(result.feedback).toBe('范围太大，只改一个文件')
    expect(gates.stateOf('agent-1')).toBe('closed')
  })

  it('结构化提问抛错（子 agent 场景）：退化为兜底通道而不是崩', async () => {
    const ask = vi.fn(async () => {
      throw new Error('DELEGATED_CALLER')
    })
    const { grillConfirm, gates } = makeDeps({}, ask)
    const result = (await grillConfirm.execute({ requirements: '目标：X' }, execCtx())) as Record<string, unknown>
    expect(result.confirmed).toBe(false)
    expect(result.needs_user_confirmation).toBe(true)
    expect(String(result.error)).toContain('DELEGATED_CALLER')
    expect(gates.stateOf('agent-1')).toBe('closed')
  })

  it('confirmed:true 兜底通道：同一会话同一清单取得兜底后放行并落库', async () => {
    const { grillConfirm, gates } = makeDeps()
    const pending = await grillConfirm.execute({ requirements: '目标：X\n范围：Y\n约束：Z\n验收标准：跑通' }, execCtx()) as Record<string, unknown>
    expect(pending.needs_user_confirmation).toBe(true)
    expect(gates.stateOf('agent-1')).toBe('closed')
    const result = (await grillConfirm.execute(
      { requirements: '目标：X\n范围：Y\n约束：Z\n验收标准：跑通', confirmed: true },
      execCtx(),
    )) as Record<string, unknown>
    expect(result.confirmed).toBe(true)
    expect(gates.stateOf('agent-1')).toBe('open')
  })

  it('总开关关闭时直接放行且不落库', async () => {
    const { grillConfirm } = makeDeps({ enabled: false })
    const result = (await grillConfirm.execute({ requirements: '目标：X' }, execCtx())) as Record<string, unknown>
    expect(result.confirmed).toBe(true)
    expect(result.skipped).toBe(true)
    await expect(stat(path.join(workspace, '.dsh'))).rejects.toThrow()
  })

  it('requirements 为空时拒绝并提示', async () => {
    const { grillConfirm } = makeDeps()
    const result = (await grillConfirm.execute({ requirements: '   ' }, execCtx())) as Record<string, unknown>
    expect(result.confirmed).toBe(false)
    expect(result.reason).toBe('empty-requirements')
  })

  it('R3 红线：需求清单只进记忆，不产生任何需求文件', async () => {
    const { grillConfirm } = makeDeps({}, async () => ({ answers: [{ id: 'grill-confirm', selected: ['确认，按此开工'] }] }))
    const requirements = '目标：做一个爬虫\n范围：只抓商品列表\n约束：用 Python\n验收标准：输出 CSV'
    await grillConfirm.execute({ requirements, confirmed: true }, execCtx())

    const topLevel = await readdir(workspace)
    expect(topLevel).toEqual(['.dsh'])
    const grillDir = await readdir(path.join(workspace, '.dsh', 'grill-first'))
    expect(grillDir).toEqual(['memory.json'])
    const raw = await readFile(path.join(workspace, '.dsh', 'grill-first', 'memory.json'), 'utf8')
    expect(raw).toContain('目标：做一个爬虫')
  })

  it('确认后会话态被清理（同一 agent 不会重复确认）', async () => {
    const { grillConfirm, sessions } = makeDeps({}, async () => ({ answers: [{ id: 'grill-confirm', selected: ['确认，按此开工'] }] }))
    await grillConfirm.execute({ requirements: '目标：X', confirmed: true }, execCtx())
    expect(sessions.get('agent-1')).toBeUndefined()
  })
})
