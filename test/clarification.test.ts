import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from '../dist/config.js'
import { GateRegistry } from '../dist/gate/preExecute.js'
import { SessionRegistry } from '../dist/tools/sessions.js'
import { createGrillStartTool } from '../dist/tools/grillStart.js'
import { createGrillConfirmTool } from '../dist/tools/grillConfirm.js'
import { buildProtocolText, protocolLength } from '../dist/prompt/protocol.js'

const exec = { callId: 'c', name: 'grill_start', agent: { id: 'a' } }
function setup(selected: string[] = [], throws = false) {
  const config = { ...DEFAULT_CONFIG, memoryEnabled: false, maxRounds: 2 }
  const gates = new GateRegistry()
  const sessions = new SessionRegistry()
  const deps = { config: () => config, gates, sessions, workspaceRoot: () => '.' }
  const start = createGrillStartTool(deps)
  const confirm = createGrillConfirmTool({ ...deps, questions: () => ({ ask: async () => {
    if (throws) throw new Error('ASK_ABORTED')
    return { answers: [{ id: 'grill-confirm', selected }] }
  } }) })
  return { gates, sessions, start, confirm }
}

describe('核心追问 V1 行为', () => {
  it('旧卡片不能放行新任务或被新消息重置的门禁', async () => {
    for (const replace of [true, false]) {
      const { gates, sessions } = setup()
      sessions.start({ agentId: 'a', task: 'A', mode: 'new-task', startedAt: 1 })
      let resolve!: (value: any) => void
      const confirm = createGrillConfirmTool({ config: () => ({ ...DEFAULT_CONFIG, memoryEnabled: false }), gates, sessions, workspaceRoot: () => '.', questions: () => ({ ask: () => new Promise(r => { resolve = r }) }) })
      const pending = confirm.execute({ requirements: '目标：A' }, exec)
      if (replace) sessions.start({ agentId: 'a', task: 'B', mode: 'new-task', startedAt: 2 })
      gates.close('a')
      resolve({ answers: [{ id: 'grill-confirm', selected: ['确认，按此开工'] }] })
      expect((await pending as any).reason).toBe('stale-confirmation')
      expect(gates.stateOf('a')).toBe('closed')
      expect(sessions.get('a')?.task).toBe(replace ? 'B' : 'A')
    }
  })

  it('兜底确认在新消息重置门禁后失效', async () => {
    const { confirm, gates } = setup([], true)
    expect((await confirm.execute({ requirements: '目标：A' }, exec) as any).needs_user_confirmation).toBe(true)
    gates.close('a')
    expect((await confirm.execute({ requirements: '目标：A', confirmed: true }, exec) as any).confirmed).toBe(false)
    expect(gates.stateOf('a')).toBe('closed')
  })

  it('未经兜底流程的布尔值不能绕过结构化确认', async () => {
    const { confirm, gates } = setup(['要改'])
    expect((await confirm.execute({ requirements: '目标：A', confirmed: true }, exec) as any).confirmed).toBe(false)
    expect(gates.stateOf('a')).toBe('closed')
  })

  it('连续回答里的显式跳过立即生效', async () => {
    const { start, gates } = setup()
    await start.execute({ task: '帮我做个爬虫' }, exec)
    const result = await start.execute({ task: '帮我做个爬虫', mode: 'continue', answer_summary: '不用问，直接做', asked_dimensions: ['scope'] }, exec) as any
    expect(result.reason).toBe('bypass-keyword')
    expect(gates.stateOf('a')).toBe('open')
  })

  it('实际问答累计，达到上限仍须确认；重复提交不重复计数，新任务重置', async () => {
    const { start, gates, sessions } = setup()
    await start.execute({ task: '做个爬虫' }, exec)
    const first = { task: '做个爬虫', mode: 'continue', answer_summary: '新闻来源', asked_dimensions: ['scope'] }
    await start.execute(first, exec)
    await start.execute(first, exec)
    expect(sessions.get('a')?.rounds).toBe(1)
    const result = await start.execute({ ...first, answer_summary: '每天一次', asked_dimensions: ['constraint'] }, exec) as any
    expect(result.reason).toBe('max-rounds-reached')
    expect(result.skip).toBe(false)
    expect(result.focus_hints).toEqual([])
    expect(gates.stateOf('a')).toBe('closed')
    await start.execute({ task: '帮我写篇文章' }, exec)
    expect(sessions.get('a')?.rounds).toBe(0)
    expect(sessions.get('a')?.history).toEqual([])
  })

  it('继续和咨询保留待确认；咨询先回答', async () => {
    const { start, gates, sessions } = setup()
    await start.execute({ task: '做个爬虫' }, exec)
    await start.execute({ task: '继续' }, exec)
    const result = await start.execute({ task: '这个插件怎么样？' }, exec) as any
    expect(result.hint).toContain('先回答')
    expect(sessions.get('a')?.task).toBe('做个爬虫')
    expect(gates.stateOf('a')).toBe('closed')
  })

  it('连续回答充分仍必须确认；显式跳过可结束澄清', async () => {
    const { start, gates } = setup()
    await start.execute({ task: '做个爬虫' }, exec)
    const result = await start.execute({ task: '做个爬虫', mode: 'continue', answer_summary: '只抓新闻，用 Python，输出 CSV 并核对测试样例', asked_dimensions: ['scope', 'constraint', 'acceptance'] }, exec) as any
    expect(result.reason).toBe('confirmation-required')
    expect(gates.stateOf('a')).toBe('closed')
    await start.execute({ task: '直接做', mode: 'continue' }, exec)
    expect(gates.stateOf('a')).toBe('open')
  })

  it.each([{ selected: [] }, { selected: ['不确认'] }, { selected: ['确认'] }, { selected: ['确认，按此开工', '要改'] }])('无效选项 $selected 不授权', async ({ selected }) => {
    const { confirm, gates } = setup(selected)
    gates.open('a')
    const result = await confirm.execute({ requirements: '目标：X' }, exec) as any
    expect(result.confirmed).toBe(false)
    expect(gates.stateOf('a')).toBe('closed')
  })

  it('取消不授权；要改不消耗追问轮数', async () => {
    const cancelled = setup([], true)
    cancelled.gates.open('a')
    expect((await cancelled.confirm.execute({ requirements: '目标：X' }, exec) as any).confirmed).toBe(false)
    expect(cancelled.gates.stateOf('a')).toBe('closed')
    const { start, confirm, sessions } = setup(['要改'])
    await start.execute({ task: '做个爬虫' }, exec)
    await confirm.execute({ requirements: '目标：X' }, exec)
    expect(sessions.get('a')?.rounds).toBe(0)
  })

  it('确认完整短清单后放行', async () => {
    const { confirm, gates } = setup(['确认，按此开工'])
    expect((await confirm.execute({ requirements: '目标：X\n范围：Y' }, exec) as any).confirmed).toBe(true)
    expect(gates.stateOf('a')).toBe('open')
  })

  it('否定式跳过不放行、也不删除待确认任务（V1 复审 P1）', async () => {
    for (const text of ['不要直接做，先问清楚', '不要跳过提问，帮我做个网站']) {
      const { start, gates, sessions } = setup()
      await start.execute({ task: '做个网站' }, exec)
      const result = (await start.execute({ task: text }, exec)) as any
      expect(result.reason).not.toBe('bypass-keyword')
      expect(result.skip).toBe(false)
      expect(gates.stateOf('a')).toBe('closed')
      expect(sessions.get('a')).toBeDefined()
    }
  })

  it('显式 drift-check 切换任务时重置旧会话（V1 复审 P2）', async () => {
    const { start, gates, sessions } = setup()
    await start.execute({ task: '做个网站' }, exec)
    const result = (await start.execute({ task: '解释安装流程', mode: 'drift-check' }, exec)) as any
    expect(result.reason).not.toBe('clarification-pending')
    expect(result.previous_task).toBeUndefined()
    expect(sessions.get('a')).toBeUndefined()
    expect(gates.stateOf('a')).toBe('open')

    const vague = (await start.execute({ task: '算了改成做下载器', mode: 'drift-check' }, exec)) as any
    expect(vague.reason).toBe('drift-vague')
    expect(sessions.get('a')?.task).toBe('算了改成做下载器')
  })

  it('协议用真实换行并将问题数定义为上限，研究模式可关闭', () => {
    const text = buildProtocolText({ ...DEFAULT_CONFIG, researchMode: 'auto' })
    expect(text).toContain('\n')
    expect(text).not.toContain('\\n')
    expect(text).toContain('每轮最多 3 问')
    expect(text).toContain('grill_research')
    expect(protocolLength(text)).toBeLessThanOrEqual(600)
    expect(buildProtocolText({ ...DEFAULT_CONFIG, researchMode: 'off' })).not.toContain('grill_research')
  })
})
