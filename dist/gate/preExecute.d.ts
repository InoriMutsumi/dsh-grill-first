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
import type { GrillContext } from '../types.js';
/** 门禁档位：ask 档在拦截前先弹一张"要不要继续"的卡片，交给人决定（0.1.4 新增）。 */
export type GateMode = 'off' | 'warn' | 'strict' | 'ask';
/** 门禁状态：open = 已确认或无需确认；closed = 尚未确认。 */
export type GateState = 'open' | 'closed';
/** 变更类工具名单（宁松勿紧）。 */
export declare const MUTATING_TOOLS: readonly string[];
/** 只读工具白名单：即使名字落在 univer_/ops_ 前缀里也一律放行。 */
export declare const READ_ONLY_TOOLS: readonly string[];
/** 拦截时给模型看的拒绝文案（工作表 3.6 原文）。 */
export declare const GATE_DENY_REASON = "\u9700\u6C42\u5C1A\u672A\u786E\u8BA4\uFF1A\u8BF7\u5148\u8C03\u7528 grill_confirm \u5B8C\u6210\u9700\u6C42\u786E\u8BA4\uFF0C\u6216\u8BA9\u7528\u6237\u8BF4'\u76F4\u63A5\u505A'\u8DF3\u8FC7\u3002";
/** ask 档弹给用户看的说明（宿主用 displayReason 渲染卡片正文）。 */
export declare const GATE_ASK_REASON = "\u8FD9\u6B21\u4EFB\u52A1\u7684\u9700\u6C42\u8FD8\u6CA1\u786E\u8BA4\uFF0C\u8981\u7167\u73B0\u5728\u7684\u7406\u89E3\u76F4\u63A5\u52A8\u624B\u5417\uFF1F";
/**
 * 判断某个工具名是否属于"会真正改动工作区/交付物"的变更类工具。
 * @param name 工具名。
 */
export declare function isMutatingTool(name: string): boolean;
/** 门禁判定结果：ask = 弹卡片问用户后由其决定（宿主 PreToolDecision 支持）。 */
export interface GateDecision {
    action: 'allow' | 'deny' | 'ask';
    reason?: string;
}
/**
 * 门禁核心判定（纯函数，可单测）。
 * @param input 工具名 + 当前门禁状态 + 档位。
 */
export declare function decideGate(input: {
    toolName: string;
    state: GateState;
    mode: GateMode;
}): GateDecision;
/** 每个 agent 的门禁状态表（agent 级隔离）。 */
export declare class GateRegistry {
    private readonly states;
    /** 读取状态；未登记的 agent 默认 closed（新会话即"未确认"）。 */
    stateOf(agentId: string): GateState;
    /** 放行该 agent。 */
    open(agentId: string): void;
    /** 拦截该 agent（新用户消息到达时重置）。 */
    close(agentId: string): void;
    /** 清空（插件卸载时调用）。 */
    clear(): void;
}
/**
 * 判断某个 agent 是否是"根 agent"（能直接跟人对话）。
 * agents 服务不可用时返回 false —— 门禁退化为不拦截，避免误伤子 agent。
 */
export declare function isRootAgent(ctx: GrillContext, agentId: string): boolean;
/** 注册门禁所需的回调。 */
export interface GateOptions {
    mode: GateMode;
    /** warn 模式下的提示回调（默认写日志）。 */
    onWarning?: (toolName: string, agentId: string) => void;
    /**
     * 新用户消息到达时，是否把门禁重置为 closed。
     *
     * 0.1.4 修：以前每条用户消息都关门禁，导致"刚确认完、用户回一句继续"又被拦。
     * 现在由判定器看一眼消息内容——追问/询问/说了跳过词之类不关门禁。
     * 返回 true 才关门；未提供该回调时保持旧行为（一律关）。
     */
    shouldResetOnMessage?: (text: string) => boolean;
}
/**
 * 把门禁挂到宿主事件上：`tools/pre-execute` 拦截 + `agent/inbox/inserted` 重置。
 * @param ctx 插件上下文。
 * @param gates 门禁状态表。
 * @param options 档位与提示回调。
 */
export declare function registerGate(ctx: GrillContext, gates: GateRegistry, options: GateOptions): void;
