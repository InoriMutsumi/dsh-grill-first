import type { Intensity } from '../config.js'

export const PROTOCOL_SECTION_NAME = 'dsh-grill-first:protocol'
export const PROTOCOL_SECTION_ORDER = 60
export const PROTOCOL_CHAR_LIMIT = 600

export interface ProtocolOptions {
  maxRounds: number
  maxQuestionsPerRound: number
  bypassKeywords: readonly string[]
  intensity: Intensity
  researchMode?: 'off' | 'auto' | 'always'
}

const INTENSITY_HINT: Record<Intensity, string> = {
  gentle: '快速：只问影响执行的关键歧义。',
  standard: '标准：问清目标、范围、约束和验收。',
  grill: '深入：再核对边界、异常与取舍；不问无关细节。',
}

export function protocolLength(text: string): number { return text.replace(/\s+/g, '').length }

export function buildProtocolText(options: ProtocolOptions): string {
  const bypass = options.bypassKeywords.filter((k) => k.trim() !== '').join('、') || '直接做'
  const research = options.researchMode === 'off' ? '' : options.researchMode === 'always'
    ? '7. 需求确认后调用 grill_research 获取调研指引，调研后再建议；不可用时说明限制。'
    : '7. 需求确认后，涉及外部事实或选型时按需调用 grill_research 获取调研指引，再给建议；不可用时说明限制。'
  return [
    '【开工前提问协议（grill-first）】',
    '1. 新任务先调 grill_start；clear 可开工。纯咨询先直接回答；咨询与“继续”不等于确认待办任务。',
    `2. needs-clarification 时用 ask_user_question，结合 memory_context 与已有答案，只问尚不明确且影响方案的问题；不重复询问已知偏好。每轮最多 ${options.maxQuestionsPerRound} 问，最多 ${options.maxRounds} 轮，不凑数。${INTENSITY_HINT[options.intensity]}`,
    '3. 每轮回答后调 grill_start(mode:"continue")，提交 answer_summary 与 asked_dimensions 记录实际问答，再根据答案收敛。',
    '4. 问清或达到上限就停止追问，整理目标/范围/约束/验收标准四段，标明假设并调用 grill_confirm。要改就修订再确认，不计追问轮数；失败、取消、无回答均不放行。',
    '5. 未确认前不动文件或运行变更命令。清单过长先分段摘要，不得截断后授权。',
    `6. 用户明确要求「${bypass}」时停止提问并开工；新任务用 new-task，目标/范围大改用 drift-check，轮数重置。`,
    research,
  ].filter(Boolean).join('\n')
}
