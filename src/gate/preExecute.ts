/**
 * 需求门禁（R3/R4 的执行层）：未确认需求前拦住"实质变更类"工具。
 *
 * 三点设计约束（阶段 1 实测）：
 * 1. `tools/pre-execute` 是 waterfall：不拦截时必须显式 `return next()`；
 * 2. 只有"能跟人对话的根 agent"才纳入门禁——子 agent/teammate 由父 agent 派生，
 *    它们没有人类对话方（`userQuestions.ask` 对它们会抛 DELEGATED_CALLER），
 *    若一并拦截会把正常的委派工作流卡死；
 * 3. warn 模式只记录不拦截（pre-execute 没有"放行 + 附带提示"这种返回形态）。
 */
import type { GrillAgent, GrillContext, PreToolDecision, ToolRunContext } from '../types.js'

/** 门禁档位。 */
export type GateMode = 'off' | 'warn' | 'strict'

/** 门禁状态：open = 已确认或无需确认；closed = 尚未确认。 */
export type GateState = 'open' | 'closed'

/** 变更类工具名单（宁松勿紧）。 */
export const MUTATING_TOOLS: readonly string[] = [
  'write',
  'edit',
  'ops_replace',
  'ops_bash',
  'bash',
  'pwsh',
  'present',
  // 注：job_kill 属于"收尾/止损"操作，不纳入门禁，避免卡住正在跑的后台任务。
  'spawn_teammate',
  'subagent',
  'subagent_fork',
  'workflow',
  'team_task_create',
  // 注：plugin_manager 会改动 profile（装/卸插件），同属"动手"范畴，一并纳入。
  'plugin_manager',
]

/** 只读工具白名单：即使名字落在 univer_/ops_ 前缀里也一律放行。 */
export const READ_ONLY_TOOLS: readonly string[] = [
  'read',
  'read_image',
  'grep',
  'glob',
  'ops_grep',
  'ops_glob',
  'ops_inspect_local_file',
  'search_context',
  'decompress',
  'acp_status',
  'acp_cache',
  'web_search',
  'web_fetch',
  'find_dsh_plugins',
  'cordis_inspect_list',
  'cordis_inspect_query',
  'univer_status',
  'univer_inspect',
  'univer_screenshot',
  'univer_lint',
  'univer_api',
  'univer_resources',
  'ask_user_question',
  'todo_write',
  'list_agents',
  'wait_agent',
  'send_message',
  'get_goal',
  'create_goal',
  'update_goal',
  'grill_start',
  'grill_confirm',
  'grill_memory',
]

/** 拦截时给模型看的拒绝文案（工作表 3.6 原文）。 */
export const GATE_DENY_REASON =
  "需求尚未确认：请先调用 grill_confirm 完成需求确认，或让用户说'直接做'跳过。"

const READ_ONLY_SET = new Set(READ_ONLY_TOOLS.map((n) => n.toLowerCase()))
const MUTATING_SET = new Set(MUTATING_TOOLS.map((n) => n.toLowerCase()))
/** univer_* 里只有这几个是只读的，其余按写类处理。 */
const UNIVER_READ_ONLY = new Set(['univer_status', 'univer_inspect', 'univer_screenshot', 'univer_lint', 'univer_api', 'univer_resources'])

/**
 * 判断某个工具名是否属于"会真正改动工作区/交付物"的变更类工具。
 * @param name 工具名。
 */
export function isMutatingTool(name: string): boolean {
  if (typeof name !== 'string' || name.trim() === '') return false
  const tool = name.trim().toLowerCase()
  if (READ_ONLY_SET.has(tool)) return false
  if (MUTATING_SET.has(tool)) return true
  if (tool.startsWith('univer_')) return !UNIVER_READ_ONLY.has(tool)
  if (tool.startsWith('ops_')) return true
  return false
}

/** 门禁判定结果。 */
export interface GateDecision {
  action: 'allow' | 'deny'
  reason?: string
}

/**
 * 门禁核心判定（纯函数，可单测）。
 * @param input 工具名 + 当前门禁状态 + 档位。
 */
export function decideGate(input: { toolName: string; state: GateState; mode: GateMode }): GateDecision {
  if (input.mode !== 'strict') return { action: 'allow' }
  if (input.state !== 'closed') return { action: 'allow' }
  if (!isMutatingTool(input.toolName)) return { action: 'allow' }
  return { action: 'deny', reason: GATE_DENY_REASON }
}

/** 每个 agent 的门禁状态表（agent 级隔离）。 */
export class GateRegistry {
  private readonly states = new Map<string, GateState>()

  /** 读取状态；未登记的 agent 默认 closed（新会话即"未确认"）。 */
  stateOf(agentId: string): GateState {
    return this.states.get(agentId) ?? 'closed'
  }

  /** 放行该 agent。 */
  open(agentId: string): void {
    if (agentId) this.states.set(agentId, 'open')
  }

  /** 拦截该 agent（新用户消息到达时重置）。 */
  close(agentId: string): void {
    if (agentId) this.states.set(agentId, 'closed')
  }

  /** 清空（插件卸载时调用）。 */
  clear(): void {
    this.states.clear()
  }
}

/**
 * 判断某个 agent 是否是"根 agent"（能直接跟人对话）。
 * agents 服务不可用时返回 false —— 门禁退化为不拦截，避免误伤子 agent。
 */
export function isRootAgent(ctx: GrillContext, agentId: string): boolean {
  if (!agentId) return false
  const agents = ctx.get('agents') as { roots?: () => GrillAgent[] } | undefined
  if (!agents || typeof agents.roots !== 'function') return false
  try {
    return agents.roots().some((agent) => agent?.id === agentId)
  } catch {
    return false
  }
}

/** 注册门禁所需的回调。 */
export interface GateOptions {
  mode: GateMode
  /** warn 模式下的提示回调（默认写日志）。 */
  onWarning?: (toolName: string, agentId: string) => void
}

/**
 * 把门禁挂到宿主事件上：`tools/pre-execute` 拦截 + `agent/inbox/inserted` 重置。
 * @param ctx 插件上下文。
 * @param gates 门禁状态表。
 * @param options 档位与提示回调。
 */
export function registerGate(ctx: GrillContext, gates: GateRegistry, options: GateOptions): void {
  ctx.on('tools/pre-execute', async (exec: ToolRunContext, next: () => Promise<PreToolDecision>) => {
    const agentId = exec?.agent?.id ?? ''
    if (options.mode !== 'off' && agentId !== '' && isRootAgent(ctx, agentId)) {
      const state = gates.stateOf(agentId)
      const decision = decideGate({ toolName: exec?.name ?? '', state, mode: options.mode })
      if (decision.action === 'deny') {
        ctx.logger?.info?.(`[grill-first] 拦截 ${exec.name}（需求未确认，agent=${agentId}）`)
        return { kind: 'deny', reason: decision.reason ?? GATE_DENY_REASON } satisfies PreToolDecision
      }
      if (options.mode === 'warn' && state === 'closed' && isMutatingTool(exec?.name ?? '')) {
        options.onWarning?.(exec.name, agentId)
      }
    }
    return next()
  })

  // 新用户消息到达 → 该 agent 的任务门禁重置为 closed（R1/R6 的入口）。
  ctx.on('agent/inbox/inserted', (payload: { agent?: GrillAgent; message?: { role?: string } }) => {
    if (options.mode === 'off') return
    if (payload?.message?.role !== 'user') return
    const agentId = payload?.agent?.id ?? ''
    if (agentId === '' || !isRootAgent(ctx, agentId)) return
    gates.close(agentId)
  })
}
