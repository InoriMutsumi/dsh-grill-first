/**
 * 纯函数启发式判定（R1）：不调 LLM，只看任务文本判断"需求是否已经够清楚"。
 *
 * 判定顺序（先命中先返回）：bypass 关键词 → 追问/继续类消息 → 文本过短且无动作 →
 * 四个需求维度（目标/范围/约束/验收标准）的覆盖度。
 */
/** 默认跳过关键词（R4）。 */
export const DEFAULT_BYPASS_KEYWORDS = ['直接做', '跳过提问', '不用问', 'skip'];
/** 缺失维度对应的追问提示。 */
export const DIMENSION_HINTS = {
    goal: '目标不明确：最终要交付什么？给谁用？',
    scope: '范围不明确：要动哪些文件/模块，哪些明确不做？',
    constraint: '约束不明确：技术栈、依赖、兼容性、风格或时间上的限制？',
    acceptance: '验收标准缺失：怎样算完成？用什么方式验证？',
};
/** 维度关键词：目标（有动作、有产出）。 */
const GOAL_WORDS = /(做|写|实现|搭建|开发|创建|新增|加个|修复|改|优化|重构|迁移|升级|翻译|整理|分析|生成|设计|部署|发布|测试|排查|调研|对比|总结|转换|导出|导入|接入|对接|编写|画|制作|搞|弄)/;
/** 维度关键词：范围（边界、对象）。 */
const SCOPE_WORDS = /(只|仅|只要|只需要|范围|限定|针对|面向|所有|全部|部分|哪些|哪个|模块|页面|文件|目录|接口|字段|表|库|版本|第一步|先做|不含|除外)/;
/** 维度关键词：约束（技术栈、限制、风格）。忽略大小写，便于匹配 Python / UTF-8 这类写法。 */
const CONSTRAINT_WORDS = /(用|基于|必须|不能|不要|需要|依赖|兼容|保持|风格|注释|技术栈|框架|语言|不许|禁止|限制|预算|时间|截止|格式|规范|utf-?8|中文|英文|node|python|js|ts|react|vue|java|go|rust)/i;
/** 维度关键词：验收标准。 */
const ACCEPTANCE_WORDS = /(验收|标准|测试|通过|算完成|完成标准|结果|输出|期望|应该|返回|效果|达到|满足|可运行|跑通|全绿|正确|不报错|可用|验证|检查|示例|样例|截图|对比)/;
/** 动作动词（用于"短文本是否已构成一个可执行指令"）。 */
const ACTION_VERB = /(做|写|改|加|删|实现|搭建|开发|修复|优化|翻译|整理|分析|生成|设计|部署|测试|排查|调研|总结|转换|导出|接入|创建|重构|迁移|升级|安装|配置|画|制作)/;
/** 追问/继续类消息的开头。 */
const FOLLOW_UP_LEAD = /^(继续|接着|然后呢|然后|下一步|再来|嗯|好|可以|行|ok|OK|对|是的|收到|谢谢|辛苦)/;
/** 具体化信号：出现即说明用户给了可落地的细节。 */
const SPECIFIC_PATTERNS = [
    /[A-Za-z0-9_\-./\\]+\.(ts|js|mjs|cjs|tsx|jsx|json|md|py|go|rs|java|c|cc|cpp|h|hpp|yml|yaml|toml|txt|csv|xlsx|png|jpg|jpeg|svg|html|css|vue|sh|ps1)/i,
    /(^|[\s（("'])(\/|\.\/|\.\.\/|[A-Za-z]:\\)/,
    /```/,
    /https?:\/\//,
    /\d+\s*(个|条|字|行|秒|分钟|小时|天|次|元|%|万|k|K|MB|GB)/,
];
/** "把 X 改成/翻译成 Y"这类两端都明确的指令。 */
const TRANSFORM_PATTERN = /(把|将)[^，。；;]{1,60}(翻译|改|换|替换|转|转换|变|格式化成)(成|为)/;
/** 变更类语气词（drift-check 用）。 */
const DRIFT_MARKERS = /(算了|改成|换成|不做了|不做了|换个|推倒重来|重新做|别做了|不搞了|改主意)/;
/** 统计文本命中的维度。 */
export function detectDimensions(text) {
    return {
        goal: GOAL_WORDS.test(text),
        scope: SCOPE_WORDS.test(text),
        constraint: CONSTRAINT_WORDS.test(text),
        acceptance: ACCEPTANCE_WORDS.test(text),
    };
}
/** 已命中的维度个数。 */
export function satisfiedCount(hit) {
    return Number(hit.goal) + Number(hit.scope) + Number(hit.constraint) + Number(hit.acceptance);
}
/** 文本是否带具体化细节（路径、代码块、数量等）。 */
export function hasSpecifics(text) {
    return SPECIFIC_PATTERNS.some((pattern) => pattern.test(text));
}
/** 纯 ASCII 关键词（如 skip）的匹配用：把词边界定义成"不是字母/数字/下划线/连字符"。 */
const ASCII_WORD_CHARS = 'a-z0-9_-';
/** 单个关键词是否命中：中文按子串，纯英文按词边界（避免 skipList / bypass-keyword 这类标识符误判）。 */
function matchKeyword(lowerText, keyword) {
    const kw = keyword.trim().toLowerCase();
    if (kw === '')
        return false;
    // 含非 ASCII（中文等）的关键词：没有词边界概念，直接子串匹配
    // eslint-disable-next-line no-control-regex
    if (!/^[\x20-\x7e]+$/.test(kw))
        return lowerText.includes(kw);
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^${ASCII_WORD_CHARS}])${escaped}($|[^${ASCII_WORD_CHARS}])`).test(lowerText);
}
/** 是否命中用户显式跳过词（R4）。 */
export function hasBypassKeyword(text, keywords) {
    const lower = text.toLowerCase();
    return keywords.some((keyword) => matchKeyword(lower, keyword));
}
/** 是否是"继续/追问"类短消息（R1：不触发提问）。 */
export function isFollowUpMessage(text) {
    if (text.length >= 15)
        return false;
    if (!FOLLOW_UP_LEAD.test(text))
        return false;
    // "好，那帮我做个 X" 这类其实带新任务，别误判成追问。
    const withoutLead = text.replace(FOLLOW_UP_LEAD, '');
    return !ACTION_VERB.test(withoutLead);
}
/** 由缺失维度生成追问提示。 */
export function buildFocusHints(hit, extra = []) {
    const hints = [];
    for (const key of ['goal', 'scope', 'constraint', 'acceptance']) {
        if (!hit[key])
            hints.push(DIMENSION_HINTS[key]);
    }
    return [...extra, ...hints].slice(0, 4);
}
/**
 * 判定任务文本是否需要澄清（纯函数，可单测）。
 * @param input 任务文本 + 模式 + 跳过关键词。
 */
export function judgeTask(input) {
    const text = (input.text ?? '').trim();
    const keywords = input.bypassKeywords ?? DEFAULT_BYPASS_KEYWORDS;
    const dimensions = detectDimensions(text);
    const satisfied = satisfiedCount(dimensions);
    const score = satisfied * 25;
    if (text === '') {
        return {
            verdict: 'needs-clarification',
            score: 0,
            focus_hints: buildFocusHints(dimensions, ['没有收到任务内容：请把用户的原话或任务摘要传进来。']),
            dimensions,
            reason: 'empty-task',
        };
    }
    if (hasBypassKeyword(text, keywords)) {
        return { verdict: 'clear', score: 100, focus_hints: [], dimensions, reason: 'bypass-keyword' };
    }
    if (isFollowUpMessage(text)) {
        return { verdict: 'clear', score: 95, focus_hints: [], dimensions, reason: 'follow-up' };
    }
    if (input.mode === 'drift-check') {
        const drift = DRIFT_MARKERS.test(text);
        if (satisfied >= 3 && text.length >= 20) {
            return { verdict: 'clear', score, focus_hints: [], dimensions, reason: 'drift-well-specified' };
        }
        return {
            verdict: 'needs-clarification',
            score,
            focus_hints: buildFocusHints(dimensions, drift
                ? ['需求变更未说清：改成什么？原来哪部分不要了？新范围到哪里为止？']
                : ['这看起来是新目标：请确认是否要重新澄清需求。']),
            dimensions,
            reason: drift ? 'drift-vague' : 'drift-underspecified',
        };
    }
    if (text.length < 12 && !ACTION_VERB.test(text)) {
        return {
            verdict: 'needs-clarification',
            score,
            focus_hints: buildFocusHints(dimensions, ['任务描述太短：请把背景与期望结果说清楚。']),
            dimensions,
            reason: 'too-short',
        };
    }
    if (satisfied >= 3) {
        return { verdict: 'clear', score, focus_hints: [], dimensions, reason: 'dimensions-covered' };
    }
    if (satisfied === 2 && (hasSpecifics(text) || TRANSFORM_PATTERN.test(text))) {
        return { verdict: 'clear', score, focus_hints: [], dimensions, reason: 'small-explicit-task' };
    }
    return {
        verdict: 'needs-clarification',
        score,
        focus_hints: buildFocusHints(dimensions),
        dimensions,
        reason: 'dimensions-missing',
    };
}
