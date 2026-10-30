import type { DimensionHit, JudgeMode } from '../judge/heuristics.js'

export interface ClarificationRound {
  answer: string
  asked: (keyof DimensionHit)[]
}

/** 每个 agent 独立的待确认任务；确认修订不消耗追问轮数。 */
export interface GrillSession {
  agentId: string
  task: string
  mode: JudgeMode
  startedAt: number
  rounds?: number
  history?: ClarificationRound[]
}

export class SessionRegistry {
  private readonly sessions = new Map<string, GrillSession>()

  start(session: GrillSession): void {
    if (!session.agentId) return
    this.sessions.set(session.agentId, { ...session, rounds: session.rounds ?? 0, history: session.history ?? [] })
  }

  /** 只在实际追问得到答案后计数；相同摘要和维度的重试幂等。 */
  recordAnswer(agentId: string, answer: string, asked: (keyof DimensionHit)[], maxRounds: number): number {
    const session = this.sessions.get(agentId)
    if (!session) return 0
    const history = session.history ??= []
    const last = history.at(-1)
    if (!answer || !asked.length || (last?.answer === answer && last.asked.join() === asked.join())) return session.rounds ?? 0
    if ((session.rounds ?? 0) >= maxRounds) return session.rounds ?? 0
    history.push({ answer, asked: [...asked] })
    return this.bumpRound(agentId)
  }

  bumpRound(agentId: string): number {
    const session = this.sessions.get(agentId)
    if (!session) return 0
    return session.rounds = (session.rounds ?? 0) + 1
  }

  get(agentId: string): GrillSession | undefined { return this.sessions.get(agentId) }
  end(agentId: string): void { this.sessions.delete(agentId) }
  clear(): void { this.sessions.clear() }
}
