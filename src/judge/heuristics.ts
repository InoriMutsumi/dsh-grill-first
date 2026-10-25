/**
 * 纯函数启发式判定（R1）：不调 LLM，只看任务文本判断"需求是否已经够清楚"。
 *
 * 判定顺序（先命中先返回）：bypass 关键词 → 追问/继续类消息 → 纯询问（问句/只读咨询）→ 文本过短且无动作 →
 * 四个需求维度（目标/范围/约束/验收标准）的覆盖度。
 */

/** 判定模式：新任务 / 任务中途的需求变更检查。 */
export type JudgeMode = 'new-task' | 'drift-check'

/** 追问力度：只影响判定阈值，不改变判定顺序。 */
export type JudgeIntensity = 'gentle' | 'standard' | 'grill'

/** 判定结论。 */
export type JudgeVerdict = 'clear' | 'needs-clarification'

/** 四个需求维度是否在文本里被提到。 */
export interface DimensionHit {
  goal: boolean
  scope: boolean
  constraint: boolean
  acceptance: boolean
}

/** 判定输入。 */
export interface JudgeInput {
  text: string
  mode: JudgeMode
  bypassKeywords?: readonly string[]
  /** 追问力度（默认 standard，保持旧行为）。 */
  intensity?: JudgeIntensity
}

/** 判定输出。 */
export interface JudgeResult {
  verdict: JudgeVerdict
  score: number
  focus_hints: string[]
  dimensions: DimensionHit
  reason: string
}

/** 默认跳过关键词（R4）。 */
export const DEFAULT_BYPASS_KEYWORDS: readonly string[] = ['直接做', '跳过提问', '不用问', 'skip']

/** 缺失维度对应的追问提示。 */
export const DIMENSION_HINTS: Record<keyof DimensionHit, string> = {
  goal: '目标不明确：最终要交付什么？给谁用？',
  scope: '范围不明确：要动哪些文件/模块，哪些明确不做？',
  constraint: '约束不明确：技术栈、依赖、兼容性、风格或时间上的限制？',
  acceptance: '验收标准缺失：怎样算完成？用什么方式验证？',
}

/** 维度关键词：目标（有动作、有产出）。 */
const GOAL_WORDS =
  /(做|写|实现|搭建|开发|创建|新增|加个|修复|改|优化|重构|迁移|升级|翻译|整理|分析|生成|设计|部署|发布|测试|排查|调研|对比|总结|转换|导出|导入|接入|对接|编写|画|制作|搞|弄|\b(?:fix|add|implement|build|create|refactor|migrate|write|update|remove|delete|optimi[sz]e|translate|generate|analy[sz]e|design|deploy|publish|rewrite|upgrade|install|configure|support|enable|disable|clean|split|merge|rename)\b)/i
/** 维度关键词：范围（边界、对象）。 */
const SCOPE_WORDS =
  /(只|仅|只要|只需要|范围|限定|针对|面向|所有|全部|部分|哪些|哪个|模块|页面|文件|目录|接口|字段|表|库|版本|第一步|先做|不含|除外|\b(?:only|all|each|every|field|fields|page|pages|file|files|directory|module|api|endpoint|component|table|schema|version|repo|repository|branch|config|first)\b)/i
/** 维度关键词：约束（技术栈、限制、风格）。忽略大小写，便于匹配 Python / UTF-8 这类写法。 */
const CONSTRAINT_WORDS =
  /(用|基于|必须|不能|不要|需要|依赖|兼容|保持|风格|注释|技术栈|框架|语言|不许|禁止|限制|预算|时间|截止|格式|规范|utf-?8|中文|英文|node|python|js|ts|react|vue|java|go|rust|\b(?:must|should|shall|need|needs|require|requires|required|use|using|based\s+on|compatible|compatibility|keep|preserve|avoid|without|existing)\b)/i
/** 维度关键词：验收标准。 */
const ACCEPTANCE_WORDS =
  /(验收|标准|测试|通过|算完成|完成标准|结果|输出|期望|应该|返回|效果|达到|满足|可运行|跑通|全绿|正确|不报错|可用|验证|检查|示例|样例|截图|对比|\b(?:acceptance|criteria|test|tests|pass|passes|passing|expect|expected|output|verify|verified|green|works|working|screenshot|sample|example)\b)/i
/** 动作动词（用于"短文本是否已构成一个可执行指令"）。 */
const ACTION_VERB =
  /(做|写|改|加|删|实现|搭建|开发|修复|优化|翻译|整理|分析|生成|设计|部署|测试|排查|调研|总结|转换|导出|接入|创建|重构|迁移|升级|安装|配置|画|制作)/
/** 追问/继续类消息的开头。 */
const FOLLOW_UP_LEAD = /^(继续|接着|然后呢|然后|下一步|再来|嗯|好|可以|行|ok|OK|对|是的|收到|谢谢|辛苦)/
/** 问句收尾：出现即说明用户在提问，而不是在派活。 */
const QUESTION_TAIL =
  /(吗|呢|么|嘛|是不是|能不能|可不可以|有没有|怎么样|如何|为什么|为啥|啥意思|多少|哪个好)\s*[？?]?$|[？?]\s*$/
/** 询问式开头：让我查/看/评估/解释，而不是让我动手。 */
const INQUIRY_LEAD =
  /^(?:please\s+|pls\s+|could you\s+|can you\s+)?(请问|问一下|想问|问下|看看|看一下|检查|查一下|查查|列出|列一下|统计|解释|说明|对比|评估|推荐|你觉得|你认为|这个|那个|现在|目前|为啥|为什么|look|check|see|show|list|tell|explain|describe|review|evaluate|summari[sz]e|search|find|verify|what|why|how|which)/i
/** 明确的动手信号：一旦出现就不算纯询问（"改一下这个吗"仍然要先澄清）。 */
const WRITE_SIGNAL =
  /(改|写|删|新建|实现|修复|重构|迁移|生成|替换|安装|部署|发布|合并|提交|制作|画|创建|搭建|开发|添加|增加|移除)|\b(?:fix|add|implement|build|create|refactor|migrate|write|update|remove|delete|change|edit|rename|move|split|merge|install|deploy|publish|upgrade|generate|replace)\b/i
/** 具体化信号：出现即说明用户给了可落地的细节。 */
const SPECIFIC_PATTERNS: readonly RegExp[] = [
  /[A-Za-z0-9_\-./\\]+\.(ts|js|mjs|cjs|tsx|jsx|json|md|py|go|rs|java|c|cc|cpp|h|hpp|yml|yaml|toml|txt|csv|xlsx|png|jpg|jpeg|svg|html|css|vue|sh|ps1)/i,
  /(^|[\s（("'])(\/|\.\/|\.\.\/|[A-Za-z]:\\)/,
  /```/,
  /https?:\/\//,
  /\d+\s*(个|条|字|行|秒|分钟|小时|天|次|元|%|万|k|K|MB|GB)/,
]
/** "把 X 改成/翻译成 Y"这类两端都明确的指令。 */
const TRANSFORM_PATTERN = /(把|将)[^，。；;]{1,60}(翻译|改|换|替换|转|转换|变|格式化成)(成|为)/
/** 变更类语气词（drift-check 用）。 */
const DRIFT_MARKERS = /(算了|改成|换成|不做了|不做了|换个|推倒重来|重新做|别做了|不搞了|改主意)/

/** 统计文本命中的维度。 */
export function detectDimensions(text: string): DimensionHit {
  return {
    goal: GOAL_WORDS.test(text),
    scope: SCOPE_WORDS.test(text),
    constraint: CONSTRAINT_WORDS.test(text),
    acceptance: ACCEPTANCE_WORDS.test(text),
  }
}

/** 已命中的维度个数。 */
export function satisfiedCount(hit: DimensionHit): number {
  return Number(hit.goal) + Number(hit.scope) + Number(hit.constraint) + Number(hit.acceptance)
}

/** 文本是否带具体化细节（路径、代码块、数量等）。 */
export function hasSpecifics(text: string): boolean {
  return SPECIFIC_PATTERNS.some((pattern) => pattern.test(text))
}

/** 纯 ASCII 关键词（如 skip）的匹配用：把词边界定义成"不是字母/数字/下划线/连字符"。 */
const ASCII_WORD_CHARS = 'a-z0-9_-'

/** 单个关键词是否命中：中文按子串，纯英文按词边界（避免 skipList / bypass-keyword 这类标识符误判）。 */
function matchKeyword(lowerText: string, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase()
  if (kw === '') return false
  // 含非 ASCII（中文等）的关键词：没有词边界概念，直接子串匹配
  // eslint-disable-next-line no-control-regex
  if (!/^[\x20-\x7e]+$/.test(kw)) return lowerText.includes(kw)
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^${ASCII_WORD_CHARS}])${escaped}($|[^${ASCII_WORD_CHARS}])`).test(lowerText)
}

/** 是否命中用户显式跳过词（R4）。 */
export function hasBypassKeyword(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase()
  return keywords.some((keyword) => matchKeyword(lower, keyword))
}

/** 是否是"继续/追问"类短消息（R1：不触发提问）。 */
export function isFollowUpMessage(text: string): boolean {
  if (text.length >= 15) return false
  if (!FOLLOW_UP_LEAD.test(text)) return false
  // "好，那帮我做个 X" 这类其实带新任务，别误判成追问。
  const withoutLead = text.replace(FOLLOW_UP_LEAD, '')
  return !ACTION_VERB.test(withoutLead)
}

/** 由缺失维度生成追问提示。 */
export function buildFocusHints(hit: DimensionHit, extra: string[] = []): string[] {
  const hints: string[] = []
  for (const key of ['goal', 'scope', 'constraint', 'acceptance'] as const) {
    if (!hit[key]) hints.push(DIMENSION_HINTS[key])
  }
  return [...extra, ...hints].slice(0, 4)
}

/**
 * 是否是"纯询问"消息：问句或让我查/看/评估，且没有任何动手信号。
 *
 * 这类消息不需要澄清——用户就是要一个回答，继续追问反而是打扰。
 * @param text 用户原文。
 */
export function isInquiry(text: string): boolean {
  const flat = text.trim()
  if (flat === '') return false
  if (WRITE_SIGNAL.test(flat)) return false
  return QUESTION_TAIL.test(flat) || INQUIRY_LEAD.test(flat)
}

/** 各力度档位的判定阈值：维度下限 + 是否强制覆盖验收标准。 */
const INTENSITY_THRESHOLDS: Record<JudgeIntensity, { dims: number; needAcceptance: boolean }> = {
  gentle: { dims: 2, needAcceptance: false },
  standard: { dims: 3, needAcceptance: false },
  grill: { dims: 3, needAcceptance: true },
}

/**
 * 判定任务文本是否需要澄清（纯函数，可单测）。
 * @param input 任务文本 + 模式 + 跳过关键词。
 */
export function judgeTask(input: JudgeInput): JudgeResult {
  const text = (input.text ?? '').trim()
  const keywords = input.bypassKeywords ?? DEFAULT_BYPASS_KEYWORDS
  const dimensions = detectDimensions(text)
  const satisfied = satisfiedCount(dimensions)
  const score = satisfied * 25
  const intensity = input.intensity ?? 'standard'
  const threshold = INTENSITY_THRESHOLDS[intensity] ?? INTENSITY_THRESHOLDS.standard

  if (text === '') {
    return {
      verdict: 'needs-clarification',
      score: 0,
      focus_hints: buildFocusHints(dimensions, ['没有收到任务内容：请把用户的原话或任务摘要传进来。']),
      dimensions,
      reason: 'empty-task',
    }
  }
  if (hasBypassKeyword(text, keywords)) {
    return { verdict: 'clear', score: 100, focus_hints: [], dimensions, reason: 'bypass-keyword' }
  }
  if (isFollowUpMessage(text)) {
    return { verdict: 'clear', score: 95, focus_hints: [], dimensions, reason: 'follow-up' }
  }
  if (isInquiry(text)) {
    return { verdict: 'clear', score: 90, focus_hints: [], dimensions, reason: 'inquiry' }
  }

  if (input.mode === 'drift-check') {
    const drift = DRIFT_MARKERS.test(text)
    if (satisfied >= threshold.dims && text.length >= 20) {
      return { verdict: 'clear', score, focus_hints: [], dimensions, reason: 'drift-well-specified' }
    }
    return {
      verdict: 'needs-clarification',
      score,
      focus_hints: buildFocusHints(
        dimensions,
        drift
          ? ['需求变更未说清：改成什么？原来哪部分不要了？新范围到哪里为止？']
          : ['这看起来是新目标：请确认是否要重新澄清需求。'],
      ),
      dimensions,
      reason: drift ? 'drift-vague' : 'drift-underspecified',
    }
  }

  if (text.length < 12 && !ACTION_VERB.test(text)) {
    return {
      verdict: 'needs-clarification',
      score,
      focus_hints: buildFocusHints(dimensions, ['任务描述太短：请把背景与期望结果说清楚。']),
      dimensions,
      reason: 'too-short',
    }
  }
  if (satisfied >= threshold.dims && (!threshold.needAcceptance || dimensions.acceptance)) {
    return { verdict: 'clear', score, focus_hints: [], dimensions, reason: 'dimensions-covered' }
  }
  if (satisfied === 2 && (hasSpecifics(text) || TRANSFORM_PATTERN.test(text))) {
    return { verdict: 'clear', score, focus_hints: [], dimensions, reason: 'small-explicit-task' }
  }
  return {
    verdict: 'needs-clarification',
    score,
    focus_hints: buildFocusHints(dimensions),
    dimensions,
    reason: 'dimensions-missing',
  }
}
