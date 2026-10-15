/**
 * 会话态登记表：记录每个 agent "当前正在澄清的任务"，
 * 供门禁与 grill_confirm 关联（确认时把 task 一起写进历史）。
 */
import type { JudgeMode } from '../judge/heuristics.js';
/** 一个 agent 当前的澄清会话。 */
export interface GrillSession {
    agentId: string;
    task: string;
    mode: JudgeMode;
    startedAt: number;
}
/** agent → 会话 的内存态映射（进程内，不持久化）。 */
export declare class SessionRegistry {
    private readonly sessions;
    /** 登记/覆盖一个 agent 的当前任务。 */
    start(session: GrillSession): void;
    /** 读取某个 agent 的当前任务。 */
    get(agentId: string): GrillSession | undefined;
    /** 结束某个 agent 的澄清会话（确认完成或跳过）。 */
    end(agentId: string): void;
    /** 清空（插件卸载时调用）。 */
    clear(): void;
}
