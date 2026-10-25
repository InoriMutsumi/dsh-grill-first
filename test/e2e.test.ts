/**
 * 端到端场景测试（工作表 5.3 的 S1–S7）：用假宿主装配**真实的插件入口** dist/index.js，
 * 走完「插件加载 → 门禁拦截 → 追问 → 确认 → 放行 → 记忆落盘」的完整链路。
 *
 * 假宿主按阶段 1 实测的宿主契约实现：
 * - tools.register / agents.roots / sandboxPolicy.resolve / userQuestions.ask
 * - 事件 tools/pre-execute（waterfall）与 agent/inbox/inserted
 * - ctx.get / ctx.on / ctx.effect / ctx.inject / ctx.logger
 */
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apply, inject, name } from '../dist/index.js'
import { Config } from '../dist/configSchema.js'
import { PROTOCOL_SECTION_NAME, PROTOCOL_SECTION_ORDER } from '../dist/prompt/protocol.js'

let home: string
let workspace: string
const originalHome = process.env.DSH_GRILL_HOME

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), 'grill-e2e-home-'))
  workspace = await mkdtemp(path.join(tmpdir(), 'grill-e2e-ws-'))
  process.env.DSH_GRILL_HOME = home
})

afterEach(async () => {
  if (originalHome === undefined) delete process.env.DSH_GRILL_HOME
  else process.env.DSH_GRILL_HOME = originalHome
  await rm(home, { recursive: true, force: true })
  await rm(workspace, { recursive: true, force: true })
})

type Handler = (...args: never[]) => unknown

/** 极简假宿主：只实现插件真正用到的那部分契约。 */
function createHost(options: { roots?: string[]; config?: Record<string, unknown>; ask?: (request: unknown) => Promise<unknown> } = {}) {
  const definitions = new Map<string, Record<string, unknown>>()
  const sections: Record<string, unknown>[] = []
  const listeners = new Map<string, Handler[]>()
  const warnings: string[] = []
  const cleanups: (() => void)[] = []
  const roots = (options.roots ?? ['root-1']).map((id) => ({ id }))
  const questions = options.ask ? { ask: options.ask } : undefined

  const services: Record<string, unknown> = {
    tools: {
      register(definition: { name: string }) {
        definitions.set(definition.name, definition as unknown as Record<string, unknown>)
        return () => definitions.delete(definition.name)
      },
    },
    agents: { roots: () => roots, list: () => roots },
    sandboxPolicy: { resolve: () => ({ workspaceRoot: workspace }) },
    get userQuestions() {
      return questions
    },
  }

  const logger = {
    warn: (message: unknown) => warnings.push(String(message)),
    info: (message: unknown) => warnings.push(String(message)),
    error: (message: unknown) => warnings.push(String(message)),
  }

  const base = {
    logger,
    get: (service: string) => services[service],
    effect: (factory: () => unknown) => {
      const disposer = factory()
      if (typeof disposer === 'function') cleanups.push(disposer as () => void)
    },
    on: (event: string, handler: Handler) => {
      const list = listeners.get(event) ?? []
      list.push(handler)
      listeners.set(event, list)
      return () => {}
    },
  } as Record<string, unknown>

  const scoped = {
    ...base,
    systemPrompt: {
      section: (section: Record<string, unknown>) => {
        sections.push(section)
        return () => {}
      },
    },
  }
  base.inject = (_deps: string[], callback: (ctx: unknown) => void) => callback(scoped)

  // 宿主会用校验过的配置调用 apply（这里同样先过一遍真实 schema）。
  apply(base, Config(options.config ?? {}))

  return {
    definitions,
    sections,
    warnings,
    services,
    /** 触发 tools/pre-execute（waterfall 语义）。 */
    async preExecute(toolName: string, agentId = 'root-1') {
      const handlers = listeners.get('tools/pre-execute') ?? []
      const exec = { callId: 'call-x', name: toolName, arguments: {}, agent: { id: agentId } }
      type Decision = { kind: string; reason?: string; displayReason?: string }
      const run = async (index: number): Promise<Decision> => {
        if (index >= handlers.length) return { kind: 'allow' }
        return (await handlers[index](exec as never, (() => run(index + 1)) as never)) as Decision
      }
      return run(0)
    },
    /** 模拟新用户消息到达；text 决定插件判定"新任务"还是"追问"。 */
    inbox(agentId = 'root-1', role = 'user', text = '') {
      for (const handler of listeners.get('agent/inbox/inserted') ?? []) {
        handler({ agent: { id: agentId }, message: { role, text } } as never)
      }
    },
    /** 调用插件注册的工具。 */
    async callTool(toolName: string, args: unknown, agentId = 'root-1') {
      const definition = definitions.get(toolName)
      if (!definition) throw new Error(`工具未注册：${toolName}`)
      const execute = definition.execute as (args: unknown, exec: unknown) => Promise<unknown>
      return execute(args, { callId: 'call-1', name: toolName, arguments: args, agent: { id: agentId } })
    },
    /** 卸载插件。 */
    unload() {
      for (const cleanup of cleanups) cleanup()
    },
    /** 渲染工具返回值（走真实的 output.render）。 */
    render(toolName: string, value: unknown) {
      const definition = definitions.get(toolName)
      const output = definition?.output as { render: (args: unknown, value: unknown) => unknown }
      return output.render({}, value)
    },
  }
}

/** 四段式需求清单样例。 */
const REQUIREMENTS = '目标：做一个商品爬虫\n范围：只抓商品列表页\n约束：用 Python，UTF-8\n验收标准：跑通一遍并输出 CSV'

const CONFIRM_ANSWER = { answers: [{ id: 'grill-confirm', selected: ['确认，按此开工'] }] }

describe('插件装载（冒烟）', () => {
  it('导出名与依赖正确', () => {
    expect(name).toBe('dsh-grill-first')
    expect(inject).toContain('tools')
  })

  it('注册两个工具，形状符合宿主 ToolDefinition 契约', () => {
    const host = createHost()
    expect([...host.definitions.keys()].sort()).toEqual(['grill_confirm', 'grill_start'])
    for (const [, definition] of host.definitions) {
      expect(typeof definition.description).toBe('string')
      expect((definition.parameters as { type?: string }).type).toBe('object')
      expect(typeof definition.execute).toBe('function')
      const output = definition.output as { schema: unknown; render: unknown }
      expect(output.schema).toBeTruthy()
      expect(typeof output.render).toBe('function')
      expect(definition.isConcurrencySafe as unknown).toBeTypeOf('function')
    }
    const blocks = host.render('grill_start', { verdict: 'clear' }) as { type: string; text: string }[]
    expect(blocks[0]?.type).toBe('text')
    expect(blocks[0]?.text).toContain('clear')
  })

  it('注入协议提示段，且字数不超上限', () => {
    const host = createHost()
    expect(host.sections).toHaveLength(1)
    expect(host.sections[0]?.name).toBe(PROTOCOL_SECTION_NAME)
    expect(host.sections[0]?.order).toBe(PROTOCOL_SECTION_ORDER)
    expect(host.sections[0]?.interpolate).toBe(false)
    const text = String(host.sections[0]?.text ?? '')
    expect(text).toContain('grill_start')
    expect(text.replace(/\s/g, '').length).toBeLessThanOrEqual(600)
  })

  it('总开关关闭时不注入协议段（S7 的静态部分）', () => {
    const host = createHost({ config: { enabled: false } })
    expect(host.sections).toHaveLength(0)
  })

  it('卸载后工具被注销（ctx.effect 清理）', () => {
    const host = createHost()
    host.unload()
    expect(host.definitions.size).toBe(0)
  })
})

describe('S1 模糊任务：追问 → 确认 → 放行（主链路）', () => {
  it('走完完整链路，并满足 R3 红线', async () => {
    // 主链路验证硬拦截语义，所以显式开 strict 档位（默认是 warn，见最后一步）
    const host = createHost({ ask: async () => CONFIRM_ANSWER, config: { gateMode: 'strict' } })

    // 1) 新用户消息到达 → 门禁关闭：变更类拦、只读放行
    host.inbox()
    const denied = await host.preExecute('write')
    expect(denied.kind).toBe('deny')
    expect(denied.reason).toContain('grill_confirm')
    expect((await host.preExecute('ops_replace')).kind).toBe('deny')
    expect((await host.preExecute('ops_bash')).kind).toBe('deny')
    expect((await host.preExecute('univer_execute')).kind).toBe('deny')
    expect((await host.preExecute('read')).kind).toBe('allow')
    expect((await host.preExecute('grep')).kind).toBe('allow')
    expect((await host.preExecute('univer_inspect')).kind).toBe('allow')
    expect((await host.preExecute('quest_unknown_tool')).kind).toBe('allow')

    // 2) 模型判定任务模糊 → 追问
    const start = (await host.callTool('grill_start', { task: '帮我做个爬虫' })) as Record<string, unknown>
    expect(start.verdict).toBe('needs-clarification')
    expect(start.gate_state).toBe('closed')
    expect(start.max_rounds).toBe(3)
    expect(Array.isArray(start.focus_hints)).toBe(true)

    // 3) 整理清单 → 用户确认 → 放行 + 落库
    const confirm = (await host.callTool('grill_confirm', {
      requirements: REQUIREMENTS,
      preferences_learned: ['注释一律用中文'],
    })) as Record<string, unknown>
    expect(confirm.confirmed).toBe(true)
    expect(confirm.final_requirements).toBe(REQUIREMENTS)
    expect((await host.preExecute('write')).kind).toBe('allow')

    // 4) R3 红线：工作区里只有记忆文件，没有任何需求文档
    expect(await readdir(workspace)).toEqual(['.dsh'])
    expect(await readdir(path.join(workspace, '.dsh', 'grill-first'))).toEqual(['memory.json'])
    const memory = JSON.parse(await readFile(path.join(workspace, '.dsh', 'grill-first', 'memory.json'), 'utf8')) as {
      history: { task: string; requirements: string }[]
    }
    expect(memory.history[0]?.requirements).toContain('验收标准')
    const global = JSON.parse(await readFile(path.join(home, 'global.json'), 'utf8')) as { preferences: { text: string }[] }
    expect(global.preferences.map((item) => item.text)).toEqual(['注释一律用中文'])

    // 5) 默认档位（warn）：门禁只记录不拦截
    const warnHost = createHost({ config: {} })
    warnHost.inbox()
    expect((await warnHost.preExecute('write')).kind).toBe('allow')
    expect(warnHost.warnings.some((line) => line.includes('warn 模式'))).toBe(true)
  })
})

describe('S2 明确小任务：不打扰', () => {
  it('一句话说清的任务直接开工', async () => {
    const host = createHost({ config: { gateMode: 'strict' } })
    const result = (await host.callTool('grill_start', {
      task: '把这段文字翻译成英文：Hello world, this is a test.',
    })) as Record<string, unknown>
    expect(result.skip).toBe(true)
    expect(result.verdict).toBe('clear')
    expect((await host.preExecute('write')).kind).toBe('allow')
  })
})

describe('S3 跳过关键词', () => {
  it('"直接做"命中 bypass，立刻放行', async () => {
    const host = createHost({ config: { gateMode: 'strict' } })
    host.inbox()
    const result = (await host.callTool('grill_start', { task: '直接做：把 README 里的错别字改掉' })) as Record<string, unknown>
    expect(result.skip).toBe(true)
    expect(result.reason).toBe('bypass-keyword')
    expect((await host.preExecute('write')).kind).toBe('allow')
  })

  it('自定义 bypassKeywords 生效', async () => {
    const host = createHost({ config: { gateMode: 'strict', bypassKeywords: ['别问了'] } })
    const result = (await host.callTool('grill_start', { task: '别问了，直接搞' })) as Record<string, unknown>
    expect(result.skip).toBe(true)
    expect(result.reason).toBe('bypass-keyword')
    // 关键不变量：用户说了跳过词之后必须真的能干活，不能把会话永久卡在门禁后面
    expect(result.gate_state).toBe('open')
    expect((await host.preExecute('write')).kind).toBe('allow')
  })

  it('返回里带 version：宿主加载的是旧代码时缺这个字段，便于判断要不要重启', async () => {
    const host = createHost({ config: { gateMode: 'strict' } })
    const result = (await host.callTool('grill_start', { task: '帮我做个爬虫' })) as Record<string, unknown>
    expect(typeof result.version).toBe('string')
    expect(result.version as string).toMatch(/^\d+\.\d+\.\d+/)
  })
})

describe('S4 strict 门禁只拦 root agent', () => {
  it('子 agent 的写操作不被拦', async () => {
    const host = createHost({ config: { gateMode: 'strict' }, roots: ['root-1'] })
    host.inbox('root-1')
    expect((await host.preExecute('write', 'root-1')).kind).toBe('deny')
    expect((await host.preExecute('write', 'sub-agent-9')).kind).toBe('allow')
  })

  it('非用户消息不重置门禁', async () => {
    const host = createHost({ config: { gateMode: 'strict' }, ask: async () => CONFIRM_ANSWER })
    await host.callTool('grill_confirm', { requirements: REQUIREMENTS, confirmed: true })
    expect((await host.preExecute('write')).kind).toBe('allow')
    host.inbox('root-1', 'tool')
    expect((await host.preExecute('write')).kind).toBe('allow')
  })
})

describe('S5 两层记忆', () => {
  it('确认过的偏好会出现在下一次追问的 memory_context 里', async () => {
    const host = createHost({ config: { gateMode: 'strict' } })
    await host.callTool('grill_confirm', {
      requirements: REQUIREMENTS,
      preferences_learned: ['回答一律用中文'],
      confirmed: true,
    })
    host.inbox()
    const result = (await host.callTool('grill_start', { task: '再帮我做个下载器' })) as Record<string, unknown>
    expect(result.verdict).toBe('needs-clarification')
    expect(String(result.memory_context)).toContain('回答一律用中文')
    expect(String(result.memory_context)).toContain('【项目背景】')
  })

  it('memoryEnabled=false 时不读不写', async () => {
    const host = createHost({ config: { memoryEnabled: false } })
    await host.callTool('grill_confirm', {
      requirements: REQUIREMENTS,
      preferences_learned: ['不该被记住'],
      confirmed: true,
    })
    const result = (await host.callTool('grill_start', { task: '再帮我做个下载器' })) as Record<string, unknown>
    expect(result.memory_context).toBe('')
    await expect(readdir(path.join(workspace, '.dsh'))).rejects.toThrow()
  })
})

describe('S6 需求变更（drift-check）', () => {
  it('确认后新消息到来会重新关闭门禁', async () => {
    const host = createHost({ config: { gateMode: 'strict' } })
    await host.callTool('grill_confirm', { requirements: REQUIREMENTS, confirmed: true })
    expect((await host.preExecute('write')).kind).toBe('allow')
    host.inbox()
    expect((await host.preExecute('write')).kind).toBe('deny')
  })

  it('中途大改目标会要求重新澄清', async () => {
    const host = createHost()
    const vague = (await host.callTool('grill_start', { task: '算了改成做下载器', mode: 'drift-check' })) as Record<
      string,
      unknown
    >
    expect(vague.verdict).toBe('needs-clarification')
    expect(vague.reason).toBe('drift-vague')
    const clear = (await host.callTool('grill_start', {
      task: '算了，改成用 Python 重写，只要 HTTP/2 支持，跑通 pytest 就发布',
      mode: 'drift-check',
    })) as Record<string, unknown>
    expect(clear.verdict).toBe('clear')
  })
})

describe('S7 总开关关闭', () => {
  it('不拦截、不追问、不落库', async () => {
    const host = createHost({ config: { enabled: false, gateMode: 'strict' } })
    host.inbox()
    expect((await host.preExecute('write')).kind).toBe('allow')
    const start = (await host.callTool('grill_start', { task: '帮我做个爬虫' })) as Record<string, unknown>
    expect(start.skip).toBe(true)
    expect(start.reason).toBe('disabled')
    const confirm = (await host.callTool('grill_confirm', { requirements: REQUIREMENTS })) as Record<string, unknown>
    expect(confirm.confirmed).toBe(true)
    expect(confirm.skipped).toBe(true)
    await expect(readdir(path.join(workspace, '.dsh'))).rejects.toThrow()
  })
})

describe('确认通道退化（R3 的宿主兼容性）', () => {
  it('没有 userQuestions 服务时要求模型用 ask_user_question 兜底', async () => {
    const host = createHost()
    const result = (await host.callTool('grill_confirm', { requirements: REQUIREMENTS })) as Record<string, unknown>
    expect(result.confirmed).toBe(false)
    expect(result.needs_user_confirmation).toBe(true)
    expect(String(result.instructions)).toContain('ask_user_question')
  })

  it('结构化提问对子 agent 抛错时同样退化', async () => {
    const host = createHost({
      ask: async () => {
        throw new Error('DELEGATED_CALLER')
      },
    })
    const result = (await host.callTool('grill_confirm', { requirements: REQUIREMENTS })) as Record<string, unknown>
    expect(result.confirmed).toBe(false)
    expect(result.needs_user_confirmation).toBe(true)
    expect(String(result.error)).toContain('DELEGATED_CALLER')
  })

  it('用户选"要改"时返回 feedback', async () => {
    const host = createHost({
      ask: async () => ({ answers: [{ id: 'grill-confirm', selected: ['要改'], custom: '范围太大，只改一个文件' }] }),
    })
    const result = (await host.callTool('grill_confirm', { requirements: REQUIREMENTS })) as Record<string, unknown>
    expect(result.confirmed).toBe(false)
    expect(result.feedback).toBe('范围太大，只改一个文件')
  })
})

describe('0.1.4 新增：ask 档位（宿主原生确认卡片，不再直接拒绝）', () => {
  it('未确认时变更类工具返回 ask + displayReason', async () => {
    const host = createHost({ ask: async () => CONFIRM_ANSWER, config: { gateMode: 'ask' } })
    host.inbox('root-1', 'user', '帮我改一下 README')

    const decision = await host.preExecute('write')
    expect(decision.kind).toBe('ask')
    expect(String(decision.displayReason)).toContain('需求还没确认')
    // 只读工具照旧放行
    expect((await host.preExecute('read')).kind).toBe('allow')
    // 只问一次：同一个任务里后续的变更类调用不再逐次弹卡片
    expect((await host.preExecute('edit')).kind).toBe('allow')
  })

  it('确认后放行', async () => {
    const host = createHost({ ask: async () => CONFIRM_ANSWER, config: { gateMode: 'ask' } })
    host.inbox('root-1', 'user', '帮我改一下 README')
    expect((await host.preExecute('write')).kind).toBe('ask')

    await host.callTool('grill_confirm', { requirements: REQUIREMENTS, confirmed: true })
    expect((await host.preExecute('write')).kind).toBe('allow')
  })
})

describe('0.1.4 新增：用户追问不该把门禁关回去', () => {
  it('"继续""嗯…" 保持放行，真新任务才重新关门', async () => {
    const host = createHost({ config: { gateMode: 'strict' } })
    await host.callTool('grill_confirm', { requirements: REQUIREMENTS, confirmed: true })
    expect((await host.preExecute('write')).kind).toBe('allow')

    host.inbox('root-1', 'user', '继续')
    expect((await host.preExecute('write')).kind).toBe('allow')

    host.inbox('root-1', 'user', '嗯，那个按钮再大一点')
    expect((await host.preExecute('write')).kind).toBe('allow')

    host.inbox('root-1', 'user', '帮我把 README 改一下')
    expect((await host.preExecute('write')).kind).toBe('deny')
  })

  it('assistant 自己的消息不触发重置', async () => {
    const host = createHost({ config: { gateMode: 'strict' } })
    await host.callTool('grill_confirm', { requirements: REQUIREMENTS, confirmed: true })
    host.inbox('root-1', 'assistant', '帮我把 README 改一下')
    expect((await host.preExecute('write')).kind).toBe('allow')
  })
})

describe('0.1.4 新增：maxRounds 真正生效（以前问多少轮都可以）', () => {
  it('问满上限后 grill_start 直接放行，门禁也开', async () => {
    const host = createHost({
      config: { gateMode: 'strict', maxRounds: 1 },
      ask: async () => ({ answers: [{ id: 'grill-confirm', selected: ['要改'], custom: '还是要改' }] }),
    })

    const first = (await host.callTool('grill_start', { task: '实现一个登录页面' })) as Record<string, unknown>
    expect(first.verdict).toBe('needs-clarification')
    expect(first.rounds_used).toBe(0)

    const feedback = (await host.callTool('grill_confirm', { requirements: REQUIREMENTS })) as Record<string, unknown>
    expect(feedback.confirmed).toBe(false)
    expect(feedback.rounds_used).toBe(1)
    expect(feedback.rounds_left).toBe(0)

    const second = (await host.callTool('grill_start', { task: '实现一个登录页面' })) as Record<string, unknown>
    expect(second.verdict).toBe('clear')
    expect(second.reason).toBe('max-rounds-reached')
    expect(second.rounds_used).toBe(1)
    expect((await host.preExecute('write')).kind).toBe('allow')
  })
})
