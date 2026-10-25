/**
 * 纯函数启发式判定（R1）：不调 LLM，只看任务文本判断"需求是否已经够清楚"。
 *
 * 判定顺序（先命中先返回）：bypass 关键词 → 追问/继续类消息 → 纯询问（问句/只读咨询）→ 文本过短且无动作 →
 * 四个需求维度（目标/范围/约束/验收标准）的覆盖度。
 */
/** 判定模式：新任务 / 任务中途的需求变更检查。 */
export type JudgeMode = 'new-task' | 'drift-check';
/** 追问力度：只影响判定阈值，不改变判定顺序。 */
export type JudgeIntensity = 'gentle' | 'standard' | 'grill';
/** 判定结论。 */
export type JudgeVerdict = 'clear' | 'needs-clarification';
/** 四个需求维度是否在文本里被提到。 */
export interface DimensionHit {
    goal: boolean;
    scope: boolean;
    constraint: boolean;
    acceptance: boolean;
}
/** 判定输入。 */
export interface JudgeInput {
    text: string;
    mode: JudgeMode;
    bypassKeywords?: readonly string[];
    /** 追问力度（默认 standard，保持旧行为）。 */
    intensity?: JudgeIntensity;
}
/** 判定输出。 */
export interface JudgeResult {
    verdict: JudgeVerdict;
    score: number;
    focus_hints: string[];
    dimensions: DimensionHit;
    reason: string;
}
/** 默认跳过关键词（R4）。 */
export declare const DEFAULT_BYPASS_KEYWORDS: readonly string[];
/** 缺失维度对应的追问提示。 */
export declare const DIMENSION_HINTS: Record<keyof DimensionHit, string>;
/** 统计文本命中的维度。 */
export declare function detectDimensions(text: string): DimensionHit;
/** 已命中的维度个数。 */
export declare function satisfiedCount(hit: DimensionHit): number;
/** 文本是否带具体化细节（路径、代码块、数量等）。 */
export declare function hasSpecifics(text: string): boolean;
/** 是否命中用户显式跳过词（R4）。 */
export declare function hasBypassKeyword(text: string, keywords: readonly string[]): boolean;
/** 是否是"继续/追问"类短消息（R1：不触发提问）。 */
export declare function isFollowUpMessage(text: string): boolean;
/** 由缺失维度生成追问提示。 */
export declare function buildFocusHints(hit: DimensionHit, extra?: string[]): string[];
/**
 * 是否是"纯询问"消息：问句或让我查/看/评估，且没有任何动手信号。
 *
 * 这类消息不需要澄清——用户就是要一个回答，继续追问反而是打扰。
 * @param text 用户原文。
 */
export declare function isInquiry(text: string): boolean;
/**
 * 判定任务文本是否需要澄清（纯函数，可单测）。
 * @param input 任务文本 + 模式 + 跳过关键词。
 */
export declare function judgeTask(input: JudgeInput): JudgeResult;
