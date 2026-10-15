/**
 * 注入系统提示的中文协议段（R7：全中文；≤600 字）。
 *
 * 这段文字是插件的"行为契约"：告诉模型什么时候调 grill_start、怎么追问、
 * 什么时候调 grill_confirm、以及未确认前不要动工作区。
 */
import type { Intensity } from '../config.js';
/** 提示段名（同一 name 重复注册会互相覆盖，卸载时按 name 撤销）。 */
export declare const PROTOCOL_SECTION_NAME = "dsh-grill-first:protocol";
/** 提示段排序权重（数值越大越靠后）。 */
export declare const PROTOCOL_SECTION_ORDER = 60;
/** 协议正文的长度上限（非空白字符）。 */
export declare const PROTOCOL_CHAR_LIMIT = 600;
/** 构建协议文本的入参。 */
export interface ProtocolOptions {
    maxRounds: number;
    maxQuestionsPerRound: number;
    bypassKeywords: readonly string[];
    intensity: Intensity;
}
/** 统计非空白字符数（用于 ≤600 字断言）。 */
export declare function protocolLength(text: string): number;
/**
 * 生成要注入的系统提示段。
 * @param options 由 Config 归一化得到的参数。
 */
export declare function buildProtocolText(options: ProtocolOptions): string;
