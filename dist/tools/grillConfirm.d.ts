/**
 * `grill_confirm` 工具（R3/R5）：把整理好的需求清单交给用户确认，确认后才放行。
 *
 * 两条确认通道：
 * 1. 结构化提问（`ctx.userQuestions.ask`）——用户直接选"确认 / 要改"，最可靠；
 * 2. 兜底通道——`userQuestions` 不可用（或对子 agent 抛 DELEGATED_CALLER）时，
 *    返回 needs_user_confirmation，让模型改用内置 `ask_user_question` 问用户，
 *    用户同意后再调用 `grill_confirm(confirmed:true)`。
 *
 * R3 红线：需求清单只进记忆的 history 字段，绝不写任何需求文件。
 */
import type { GrillConfig } from '../config.js';
import type { GateRegistry } from '../gate/preExecute.js';
import type { GrillAgent, ToolDefinition, UserQuestionsService } from '../types.js';
import type { SessionRegistry } from './sessions.js';
/** 工具依赖（由 index.ts 装配注入）。 */
export interface GrillConfirmDeps {
    config: () => GrillConfig;
    gates: GateRegistry;
    sessions: SessionRegistry;
    /** 解析当前会话的工作区根目录（项目层记忆落点）。 */
    workspaceRoot: (agent?: GrillAgent) => string;
    /** 结构化提问服务（可能不存在）。 */
    questions: () => UserQuestionsService | undefined;
    logger?: {
        warn(message: string): void;
    };
}
/** grill_confirm 的返回体。 */
export interface GrillConfirmResult {
    confirmed: boolean;
    final_requirements?: string;
    feedback?: string;
    requirements?: string;
    needs_user_confirmation?: boolean;
    instructions?: string;
    user_note?: string;
    skipped?: boolean;
    reason?: string;
    error?: string;
    saved?: {
        history: boolean;
        preferences: number;
        project_context: boolean;
    };
}
/**
 * 创建 `grill_confirm` 工具定义。
 * @param deps 配置读取、门禁表、会话表、工作区根目录、结构化提问服务。
 */
export declare function createGrillConfirmTool(deps: GrillConfirmDeps): ToolDefinition;
