/** 判定启发式的单测（覆盖工作表 3.2 要求的分支：模糊、明确、bypass、追问、drift、过短、空）。 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BYPASS_KEYWORDS,
  buildFocusHints,
  detectDimensions,
  hasBypassKeyword,
  hasSpecifics,
  isFollowUpMessage,
  isInquiry,
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
    // 0.1.4 起英文关键词也参与维度统计，这句同时命中 goal/constraint/acceptance，
    // 会先走 dimensions-covered；两种放行理由都算对。
    expect(['dimensions-covered', 'small-explicit-task']).toContain(result.reason)
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
  it('正则识别真实空白、URL、数量与 Windows 路径', () => {
    expect(hasSpecifics('https://example.com')).toBe(true)
    expect(hasSpecifics('采集 20 条')).toBe(true)
    expect(hasSpecifics('C:\\project\\input.ts')).toBe(true)
    expect(detectDimensions('implement only files using Python verify output')).toEqual({ goal: true, scope: true, constraint: true, acceptance: true })
  })

  it('按任务类型返回可执行追问方向', () => {
    expect(judgeTask({ text: '做个爬虫', mode: 'new-task' }).focus_hints.join('')).toContain('字段')
    expect(judgeTask({ text: '帮我修复 bug', mode: 'new-task' }).focus_hints.join('')).toContain('复现')
    expect(judgeTask({ text: '写一份周报', mode: 'new-task' }).focus_hints.join('')).toContain('篇幅')
  })

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

// ---------------- 0.1.4 新增 ----------------

describe('isInquiry：纯询问不触发澄清（0.1.4）', () => {
  it('中文问句/查资料类判为询问', () => {
    expect(isInquiry('girll-first 的插件你认为还有需要优化的空间吗')).toBe(true)
    expect(isInquiry('这个插件怎么样？')).toBe(true)
    expect(isInquiry('检查下我的GitHub库，我想知道现在都有什么')).toBe(true)
    expect(isInquiry('解释一下这段代码')).toBe(true)
  })

  it('英文询问也识别（主人在中英混用）', () => {
    expect(isInquiry('look at my repo and tell me what is in it')).toBe(true)
    expect(isInquiry('please check my github repos')).toBe(true)
    expect(isInquiry('Can you describe the plugin?')).toBe(true)
  })

  it('带动手信号的不算询问（哪怕结尾是问号）', () => {
    expect(isInquiry('帮我把 README 改一下吗？')).toBe(false)
    expect(isInquiry('fix the failing test?')).toBe(false)
    expect(isInquiry('能不能把这段代码重构一下')).toBe(false)
  })

  it('咨询实现方法先回答，不因讨论动作误判成派活', () => {
    expect(isInquiry('如何实现登录页面？')).toBe(true)
    expect(isInquiry('How to fix this error?')).toBe(true)
    expect(isInquiry('解释一下如何部署')).toBe(true)
    expect(isInquiry('如何部署？然后帮我实现')).toBe(false)
  })

  it('空文本不算询问', () => {
    expect(isInquiry('   ')).toBe(false)
  })
})

describe('judgeTask：问句直接放行（0.1.4 修"问问题被要求先澄清"）', () => {
  it('中文询问 → clear / inquiry', () => {
    const result = judgeTask({ text: '这个插件怎么样', mode: 'new-task' })
    expect(result.verdict).toBe('clear')
    expect(result.reason).toBe('inquiry')
  })

  it('英文询问 → clear / inquiry', () => {
    const result = judgeTask({ text: 'please check my github repos', mode: 'new-task' })
    expect(result.verdict).toBe('clear')
    expect(result.reason).toBe('inquiry')
  })
})

describe('judgeTask：intensity 真正改变阈值（0.1.4）', () => {
  const text = '帮我写个脚本，把 data 目录下的 csv 转成 json'

  it('gentle 只问关键点：两维即可放行', () => {
    expect(judgeTask({ text: '实现一个登录页面', mode: 'new-task', intensity: 'gentle' }).verdict).toBe('clear')
  })

  it('standard 维持三维门槛', () => {
    expect(judgeTask({ text, mode: 'new-task', intensity: 'standard' }).verdict).toBe('clear')
    expect(judgeTask({ text: '实现一个登录页面', mode: 'new-task', intensity: 'standard' }).verdict).toBe(
      'needs-clarification',
    )
  })

  it('grill 额外要求验收标准：缺验收就继续问', () => {
    const result = judgeTask({ text, mode: 'new-task', intensity: 'grill' })
    expect(result.verdict).toBe('needs-clarification')
    expect(result.dimensions.acceptance).toBe(false)
  })

  it('缺省 intensity 等价 standard（旧调用方不受影响）', () => {
    const a = judgeTask({ text, mode: 'new-task' })
    const b = judgeTask({ text, mode: 'new-task', intensity: 'standard' })
    expect(a.verdict).toBe(b.verdict)
    expect(a.score).toBe(b.score)
  })
})

describe('否定式跳过指令（V1 复审实测：不要把"不要直接做"当成"直接做"）', () => {
  it('被否定词紧贴修饰的跳过词不算命中', () => {
    expect(hasBypassKeyword('不要直接做，先问清楚', DEFAULT_BYPASS_KEYWORDS)).toBe(false)
    expect(hasBypassKeyword('不要跳过提问，帮我做个网站', DEFAULT_BYPASS_KEYWORDS)).toBe(false)
    expect(hasBypassKeyword("don't skip, ask me first", DEFAULT_BYPASS_KEYWORDS)).toBe(false)
    expect(hasBypassKeyword('do not skip the questions', DEFAULT_BYPASS_KEYWORDS)).toBe(false)
  })

  it('否定词被标点或其它词隔断时仍算命中', () => {
    expect(hasBypassKeyword('不用问，直接做', DEFAULT_BYPASS_KEYWORDS)).toBe(true)
    expect(hasBypassKeyword('这个就别问了，直接搞', ['别问了'])).toBe(true)
  })

  it('judgeTask 不因否定式跳过而放行', () => {
    const result = judgeTask({ text: '不要直接做，先问清楚', mode: 'new-task' })
    expect(result.reason).not.toBe('bypass-keyword')
    expect(result.verdict).toBe('needs-clarification')
  })
})

describe('回归样例表：主人真实说过的 11 句话（0.1.4 实测基线）', () => {
  const cases: Array<{ text: string; verdict: 'clear' | 'needs-clarification'; reason: string }> = [
    { text: '检查下我的GitHub库，我想知道现在都有什么', verdict: 'clear', reason: 'inquiry' },
    { text: 'girll-first的插件你认为还有需要优化的空间吗', verdict: 'clear', reason: 'inquiry' },
    { text: '帮我把 README 改一下', verdict: 'needs-clarification', reason: 'dimensions-missing' },
    { text: '实现一个登录页面', verdict: 'needs-clarification', reason: 'dimensions-missing' },
    { text: '删掉那个文件', verdict: 'needs-clarification', reason: 'dimensions-missing' },
    { text: '我明天要交一份周报，帮我搞一下', verdict: 'needs-clarification', reason: 'dimensions-missing' },
    { text: '把 D:/proj/a.ts 里的 getUserName 改成 getUserName2', verdict: 'clear', reason: 'small-explicit-task' },
    { text: '嗯', verdict: 'clear', reason: 'follow-up' },
    { text: '继续', verdict: 'clear', reason: 'follow-up' },
    { text: 'look at my repo and tell me what is in it', verdict: 'clear', reason: 'inquiry' },
    { text: 'fix the bug in src/app.ts', verdict: 'clear', reason: 'small-explicit-task' },
  ]

  for (const item of cases) {
    it(`「${item.text}」→ ${item.verdict}`, () => {
      const result = judgeTask({ text: item.text, mode: 'new-task' })
      expect(result.verdict).toBe(item.verdict)
      expect(result.reason).toBe(item.reason)
    })
  }
})
