/** 门禁判定的单测（覆盖工作表 3.6 要求：strict 拦 write、放行 read、open 放行一切、off 零拦截）。 */
import { describe, expect, it } from 'vitest'
import {
  GATE_ASK_REASON,
  GATE_DENY_REASON,
  GateRegistry,
  decideGate,
  isMutatingTool,
} from '../dist/gate/preExecute.js'

describe('isMutatingTool：变更类工具名单', () => {
  it('写类工具命中', () => {
    for (const tool of ['write', 'edit', 'ops_replace', 'ops_bash', 'pwsh', 'present', 'univer_execute', 'univer_import']) {
      expect(isMutatingTool(tool), tool).toBe(true)
    }
  })

  it('委派与装配类工具同样命中（堵住"先派个子代理去改"的绕行）', () => {
    for (const tool of ['spawn_teammate', 'subagent', 'subagent_fork', 'workflow', 'team_task_create', 'plugin_manager', 'ops_write']) {
      expect(isMutatingTool(tool), tool).toBe(true)
    }
  })

  it('只读工具放行', () => {
    for (const tool of [
      'read',
      'grep',
      'glob',
      'ops_grep',
      'ops_inspect_local_file',
      'search_context',
      'web_search',
      'univer_status',
      'univer_inspect',
      'ask_user_question',
      'grill_start',
      'grill_confirm',
    ]) {
      expect(isMutatingTool(tool), tool).toBe(false)
    }
  })

  it('未知工具与空名不拦截', () => {
    expect(isMutatingTool('some_unknown_tool')).toBe(false)
    expect(isMutatingTool('')).toBe(false)
  })
})

describe('decideGate：三种档位', () => {
  it('strict + 未确认 + 变更类工具 → 拒绝，文案与工作表一致', () => {
    const decision = decideGate({ toolName: 'write', state: 'closed', mode: 'strict' })
    expect(decision.action).toBe('deny')
    expect(decision.reason).toBe(GATE_DENY_REASON)
    expect(decision.reason).toContain('grill_confirm')
  })

  it('strict + 未确认 + 只读工具 → 放行', () => {
    expect(decideGate({ toolName: 'read', state: 'closed', mode: 'strict' }).action).toBe('allow')
  })

  it('strict + 已确认 → 全部放行', () => {
    expect(decideGate({ toolName: 'write', state: 'open', mode: 'strict' }).action).toBe('allow')
  })

  it('warn 档位不拦截', () => {
    expect(decideGate({ toolName: 'write', state: 'closed', mode: 'warn' }).action).toBe('allow')
  })

  it('off 档位不拦截', () => {
    expect(decideGate({ toolName: 'write', state: 'closed', mode: 'off' }).action).toBe('allow')
  })
})

describe('decideGate：ask 档位（0.1.4 新增，用宿主原生确认卡片）', () => {
  it('ask + 未确认 + 变更类工具 → action=ask，不直接拒绝', () => {
    const decision = decideGate({ toolName: 'write', state: 'closed', mode: 'ask' })
    expect(decision.action).toBe('ask')
    expect(decision.reason).toBe(GATE_DENY_REASON)
    // 卡片的展示文案走宿主的 displayReason，措辞要能给用户二选一
    expect(GATE_ASK_REASON).toContain('需求还没确认')
  })

  it('ask + 已确认 → 放行', () => {
    expect(decideGate({ toolName: 'write', state: 'open', mode: 'ask' }).action).toBe('allow')
  })

  it('ask + 只读工具 → 放行（问问题不该弹卡片）', () => {
    expect(decideGate({ toolName: 'read', state: 'closed', mode: 'ask' }).action).toBe('allow')
    expect(decideGate({ toolName: 'web_search', state: 'closed', mode: 'ask' }).action).toBe('allow')
  })
})

describe('GateRegistry：agent 级状态', () => {
  it('未登记的 agent 默认未确认', () => {
    const gates = new GateRegistry()
    expect(gates.stateOf('a1')).toBe('closed')
  })

  it('open/close/clear 生效且互不干扰', () => {
    const gates = new GateRegistry()
    gates.open('a1')
    expect(gates.stateOf('a1')).toBe('open')
    expect(gates.stateOf('a2')).toBe('closed')
    gates.close('a1')
    expect(gates.stateOf('a1')).toBe('closed')
    gates.open('a1')
    gates.clear()
    expect(gates.stateOf('a1')).toBe('closed')
  })
})
