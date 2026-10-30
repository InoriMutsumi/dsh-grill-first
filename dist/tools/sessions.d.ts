import type { DimensionHit, JudgeMode } from '../judge/heuristics.js';
export interface ClarificationRound {
    answer: string;
    asked: (keyof DimensionHit)[];
}
/** 每个 agent 独立的待确认任务；确认修订不消耗追问轮数。 */
export interface GrillSession {
    agentId: string;
    task: string;
    mode: JudgeMode;
    startedAt: number;
    rounds?: number;
    history?: ClarificationRound[];
}
export declare class SessionRegistry {
    private readonly sessions;
    start(session: GrillSession): void;
    /** 只在实际追问得到答案后计数；相同摘要和维度的重试幂等。 */
    recordAnswer(agentId: string, answer: string, asked: (keyof DimensionHit)[], maxRounds: number): number;
    bumpRound(agentId: string): number;
    get(agentId: string): GrillSession | undefined;
    end(agentId: string): void;
    clear(): void;
}
