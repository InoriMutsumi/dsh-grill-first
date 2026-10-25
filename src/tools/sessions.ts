/**
 * 会话态登记表：记录每个 agent "当前正在澄清的任务"，
 * 供门禁与 grill_confirm 关联（确认时把 task 一起写进历史）。
 */
import type { JudgeMode } from '../judge/heuristics.js'

/** 一个 agent 当前的澄清会话。 */
export interface GrillSession {
  agentId: string
  task: string
  mode: JudgeMode
  startedAt: number
  /** 已经追问过几轮（用户选"要改"算一轮），用于落实 maxRounds 上限。 */
  rounds?: number
}

/** agent → 会话 的内存态映射（进程内，不持久化）。 */
export class SessionRegistry {
  private readonly sessions = new Map<string, GrillSession>()

  /** 登记/覆盖一个 agent 的当前任务。 */
  start(session: GrillSession): void {
    if (!session.agentId) return
    this.sessions.set(session.agentId, { ...session, rounds: session.rounds ?? 0 })
  }

  /** 记一轮追问（用户选"要改"时调用），返回累计轮数。 */
  bumpRound(agentId: string): number {
    const session = this.sessions.get(agentId)
    if (!session) return 0
    session.rounds = (session.rounds ?? 0) + 1
    return session.rounds
  }

  /** 读取某个 agent 的当前任务。 */
  get(agentId: string): GrillSession | undefined {
    return this.sessions.get(agentId)
  }

  /** 结束某个 agent 的澄清会话（确认完成或跳过）。 */
  end(agentId: string): void {
    this.sessions.delete(agentId)
  }

  /** 清空（插件卸载时调用）。 */
  clear(): void {
    this.sessions.clear()
  }
}
