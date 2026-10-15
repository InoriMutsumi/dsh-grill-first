/** 提示段名（同一 name 重复注册会互相覆盖，卸载时按 name 撤销）。 */
export const PROTOCOL_SECTION_NAME = 'dsh-grill-first:protocol';
/** 提示段排序权重（数值越大越靠后）。 */
export const PROTOCOL_SECTION_ORDER = 60;
/** 协议正文的长度上限（非空白字符）。 */
export const PROTOCOL_CHAR_LIMIT = 600;
/** 力度档位对应的追问强度描述。 */
const INTENSITY_HINT = {
    gentle: '用户时间紧：只问最关键的歧义点，一轮能问清就不要拖到第二轮。',
    standard: '按标准强度追问：把目标、范围、约束、验收标准四件事问清即可收口。',
    grill: '刨根问底：连边界情况、异常路径、不做哪些事也要问清，直到没有解释空间为止。',
};
/** 统计非空白字符数（用于 ≤600 字断言）。 */
export function protocolLength(text) {
    return text.replace(/\s+/g, '').length;
}
/**
 * 生成要注入的系统提示段。
 * @param options 由 Config 归一化得到的参数。
 */
export function buildProtocolText(options) {
    const bypass = options.bypassKeywords.filter((k) => k.trim() !== '').join('、') || '直接做';
    return [
        '【开工前提问协议（grill-first）】',
        '1. 接到新任务，先调用 grill_start 提交任务原文；返回 verdict=clear 时立即开工，不要提问。',
        `2. 返回 needs-clarification 时：先按 memory_context 转述已知偏好（不要重复问），再用 ask_user_question 提问；每轮 ${options.maxQuestionsPerRound} 个问题，最多 ${options.maxRounds} 轮；每轮问题必须基于用户上一轮回答继续深挖。${INTENSITY_HINT[options.intensity]}`,
        '3. 收敛后把需求整理成中文四段——目标 / 范围 / 约束 / 验收标准，调用 grill_confirm 请用户确认。',
        '4. 用户选"要改"就按反馈修订后再次调用 grill_confirm；未确认前不要动文件或跑变更类命令（strict 模式下会被门禁拦截）。',
        `5. 用户消息含「${bypass}」等字样时立即停止提问并开工。`,
        '6. 任务中途用户大改目标或范围时，调用 grill_start(mode:"drift-check") 重新澄清。',
    ].join('\n');
}
