/**
 * `grill_start` 工具（R1/R2/R4/R6）：开工前判定任务是否已经说清楚。
 *
 * - clear：放行（门禁置 open），模型直接开工；
 * - needs-clarification：门禁置 closed，并返回记忆摘要、追问方向与轮次上限。
 */
import type { GrillConfig } from '../config.js';
import type { GateRegistry } from '../gate/preExecute.js';
import type { GrillAgent, ToolDefinition } from '../types.js';
import type { SessionRegistry } from './sessions.js';
/** 工具依赖（由 index.ts 装配注入）。 */
export interface GrillStartDeps {
    config: () => GrillConfig;
    gates: GateRegistry;
    sessions: SessionRegistry;
    /** 解析当前会话的工作区根目录（项目层记忆落点）。 */
    workspaceRoot: (agent?: GrillAgent) => string;
    logger?: {
        warn(message: string): void;
    };
}
/** grill_start 的返回体。 */
export interface GrillStartResult {
    verdict: 'clear' | 'needs-clarification';
    skip: boolean;
    reason: string;
    score?: number;
    memory_context?: string;
    focus_hints?: string[];
    gate_state?: 'open' | 'closed';
    max_rounds?: number;
    max_questions_per_round?: number;
    intensity?: string;
    mode?: string;
    task_id?: string;
    previous_task?: string;
    hint?: string;
}
/** 把对象包成"回灌给模型的文本块"。 */
export declare function textOutput(schema: Record<string, unknown>): ToolDefinition['output'];
/**
 * 创建 `grill_start` 工具定义。
 * @param deps 配置读取、门禁表、会话表、工作区根目录。
 */
export declare function createGrillStartTool(deps: GrillStartDeps): ToolDefinition;
