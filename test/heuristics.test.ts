/** 判定启发式的单测（覆盖工作表 3.2 要求的分支：模糊、明确、bypass、追问、drift、过短、空）。 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BYPASS_KEYWORDS,
  buildFocusHints,
  detectDimensions,
  hasBypassKeyword,
  hasSpecifics,
  isFollowUpMessage,
  judgeTask,
  satisfiedCount,
} from '../dist/judge/heuristics.js'

describe('judgeTask：模糊任务触发澄清（R1）', () => {
  it('"帮我做个爬虫" 需要澄清，并给出缺失维度提示', () => {
    const result = judgeTask({ text: '帮我做个爬虫', mode: 'new-task' })
    expect(result.verdict).toBe('needs-clarification')
    expect(result.focus_hints.length).toBeGreaterThanOrEqual(2)
    expect(result.focus_hints.join('')).toContain('范围不明确')
  })

  it('一句话说不清的长需求也要澄清', () => {
    const result = judgeTask({ text: '帮我做一个插件，可以在我工作前问清楚我的需求', mode: 'new-task' })
    expect(result.verdict).toBe('needs-clarification')
    expect(result.score).toBeLessThan(75)
  })

  it('空文本视为需要澄清', () => {
    const result = judgeTask({ text: '   ', mode: 'new-task' })
    expect(result.verdict).toBe('needs-clarification')
    expect(result.reason).toBe('empty-task')
  })

  it('过短且没有动作动词的消息需要澄清', () => {
    const result = judgeTask({ text: '帮我看看这个', mode: 'new-task' })
    expect(result.verdict).toBe('needs-clarification')
    expect(result.reason).toBe('too-short')
  })
})

describe('judgeTask：明确任务直接放行（R1）', () => {
  it('四要素齐全的任务判为 clear', () => {
    const result = judgeTask({
      text: '帮我实现一个 CLI 工具：输入 CSV 输出 JSON，只支持 UTF-8，完成后跑 vitest 全绿',
      mode: 'new-task',
    })
    expect(result.verdict).toBe('clear')
    expect(result.reason).toBe('dimensions-covered')
  })

  it('"把……翻译成……"这类两端明确的指令判为 clear（S2 场景）', () => {
    const result = judgeTask({ text: '把这段文字翻译成英文：Hello world, this is a test.', mode: 'new-task' })
    expect(result.verdict).toBe('clear')
    expect(result.reason).toBe('small-explicit-task')
  })
})

describe('judgeTask：跳过机制（R4）', () => {
  it('命中默认跳过关键词', () => {
    const result = judgeTask({ text: '直接做：把 README 里错别字改掉', mode: 'new-task' })
    expect(result.verdict).toBe('clear')
    expect(result.reason).toBe('bypass-keyword')
  })

  it('支持自定义跳过关键词', () => {
    const result = judgeTask({ text: '别问了，直接搞', mode: 'new-task', bypassKeywords: ['别问了'] })
    expect(result.verdict).toBe('clear')
    expect(result.reason).toBe('bypass-keyword')
  })
})

describe('judgeTask：追问/继续类消息不触发提问（R1）', () => {
  it('"继续" 视为追问', () => {
    const result = judgeTask({ text: '继续', mode: 'new-task' })
    expect(result.verdict).toBe('clear')
    expect(result.reason).toBe('follow-up')
  })

  it('"嗯" 视为追问', () => {
    expect(judgeTask({ text: '嗯', mode: 'new-task' }).verdict).toBe('clear')
  })

  it('"好，那帮我做个下载器" 不算追问（含新任务）', () => {
    expect(isFollowUpMessage('好，那帮我做个下载器')).toBe(false)
  })
})

describe('judgeTask：需求变更检查（R6 / S6 场景）', () => {
  it('"算了改成做下载器" 触发重新澄清', () => {
    const result = judgeTask({ text: '算了改成做下载器', mode: 'drift-check' })
    expect(result.verdict).toBe('needs-clarification')
    expect(result.reason).toBe('drift-vague')
    expect(result.focus_hints.join('')).toContain('需求变更未说清')
  })

  it('说清楚的新目标直接放行', () => {
    const result = judgeTask({
      text: '算了，改成用 Python 重写，只要 HTTP/2 支持，跑通 pytest 就发布',
      mode: 'drift-check',
    })
    expect(result.verdict).toBe('clear')
    expect(result.reason).toBe('drift-well-specified')
  })
})

describe('辅助函数', () => {
  it('detectDimensions 能识别四要素', () => {
    const hit = detectDimensions('只改 app.ts，用 TypeScript，跑通单测就算完成')
    expect(hit.goal).toBe(true)
    expect(hit.scope).toBe(true)
    expect(hit.constraint).toBe(true)
    expect(hit.acceptance).toBe(true)
    expect(satisfiedCount(hit)).toBe(4)
  })

  it('hasSpecifics 能识别路径与代码块', () => {
    expect(hasSpecifics('改一下 /g/大肥鱼/a.ts')).toBe(true)
    expect(hasSpecifics('随便弄弄')).toBe(false)
  })

  it('hasBypassKeyword 大小写不敏感', () => {
    expect(hasBypassKeyword('SKIP this', DEFAULT_BYPASS_KEYWORDS)).toBe(true)
    expect(hasBypassKeyword('正常任务', DEFAULT_BYPASS_KEYWORDS)).toBe(false)
  })

  it('hasBypassKeyword：中文关键词按子串匹配', () => {
    expect(hasBypassKeyword('这个就别问了，直接搞', ['别问了'])).toBe(true)
    expect(hasBypassKeyword('直接做', DEFAULT_BYPASS_KEYWORDS)).toBe(true)
  })

  it('hasBypassKeyword：英文关键词按词边界，标识符不算（实测踩过：任务里写 skipList 被误判为"用户要跳过提问"）', () => {
    expect(hasBypassKeyword('修复 skipList 的渲染问题', ['skip'])).toBe(false)
    expect(hasBypassKeyword('把 bypass-keyword 改成 skip_list', ['skip'])).toBe(false)
    expect(hasBypassKeyword('调用 skipsBuffer() 清理', ['skip'])).toBe(false)
    expect(hasBypassKeyword('这是 skip，请照做', ['skip'])).toBe(true)
    expect(hasBypassKeyword('（skip）', ['skip'])).toBe(true)
  })

  it('hasBypassKeyword：关键词里的正则元字符被转义', () => {
    expect(hasBypassKeyword('用 c++ 重写这段', ['c++'])).toBe(true)
    expect(hasBypassKeyword('用 c 重写这段', ['c++'])).toBe(false)
  })

  it('buildFocusHints 最多给 4 条', () => {
    const hints = buildFocusHints({ goal: false, scope: false, constraint: false, acceptance: false }, ['额外'])
    expect(hints.length).toBe(4)
    expect(hints[0]).toBe('额外')
  })
})
