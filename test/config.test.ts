/** 配置归一化与协议文本的单测（工作表 3.3 / 3.7）。 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, normalizeConfig } from '../dist/config.js'
import { PROTOCOL_CHAR_LIMIT, buildProtocolText, protocolLength } from '../dist/prompt/protocol.js'

describe('normalizeConfig：7 个配置项', () => {
  it('空配置返回默认值', () => {
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_CONFIG)
    expect(normalizeConfig({})).toEqual(DEFAULT_CONFIG)
  })

  it('默认值与工作表一致', () => {
    expect(DEFAULT_CONFIG.enabled).toBe(true)
    expect(DEFAULT_CONFIG.gateMode).toBe('warn')
    expect(DEFAULT_CONFIG.maxQuestionsPerRound).toBe(3)
    expect(DEFAULT_CONFIG.maxRounds).toBe(3)
    expect(DEFAULT_CONFIG.intensity).toBe('standard')
    expect(DEFAULT_CONFIG.bypassKeywords).toContain('直接做')
    expect(DEFAULT_CONFIG.memoryEnabled).toBe(true)
  })

  it('合法值原样保留', () => {
    const config = normalizeConfig({
      enabled: false,
      gateMode: 'strict',
      maxQuestionsPerRound: 4,
      maxRounds: 5,
      intensity: 'grill',
      bypassKeywords: ['快做', '别问'],
      memoryEnabled: false,
    })
    expect(config).toEqual({
      enabled: false,
      gateMode: 'strict',
      maxQuestionsPerRound: 4,
      maxRounds: 5,
      intensity: 'grill',
      bypassKeywords: ['快做', '别问'],
      memoryEnabled: false,
    })
  })

  it('数字越界会被夹住，脏值退回默认', () => {
    expect(normalizeConfig({ maxRounds: 99 }).maxRounds).toBe(10)
    expect(normalizeConfig({ maxRounds: 0 }).maxRounds).toBe(1)
    expect(normalizeConfig({ maxQuestionsPerRound: 1.5 }).maxQuestionsPerRound).toBe(3)
    expect(normalizeConfig({ maxQuestionsPerRound: 'abc' }).maxQuestionsPerRound).toBe(3)
  })

  it('枚举非法值退回默认', () => {
    expect(normalizeConfig({ gateMode: 'block' }).gateMode).toBe('warn')
    expect(normalizeConfig({ intensity: 'hard' }).intensity).toBe('standard')
  })

  it('bypassKeywords 支持字符串（逗号/换行分隔）与数组', () => {
    expect(normalizeConfig({ bypassKeywords: '直接做, 别问' }).bypassKeywords).toEqual(['直接做', '别问'])
    expect(normalizeConfig({ bypassKeywords: ['a', '', 'b'] }).bypassKeywords).toEqual(['a', 'b'])
    expect(normalizeConfig({ bypassKeywords: '   ' }).bypassKeywords).toEqual(DEFAULT_CONFIG.bypassKeywords)
    expect(normalizeConfig({ bypassKeywords: [] }).bypassKeywords).toEqual(DEFAULT_CONFIG.bypassKeywords)
  })

  it('完全不相关的入参不抛错', () => {
    expect(() => normalizeConfig('垃圾')).not.toThrow()
    expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG)
  })
})

describe('buildProtocolText：注入的系统提示段', () => {
  const text = buildProtocolText({
    maxRounds: 3,
    maxQuestionsPerRound: 3,
    bypassKeywords: ['直接做', '跳过提问'],
    intensity: 'standard',
  })

  it('不超过 600 字（R7 字数上限）', () => {
    expect(protocolLength(text)).toBeLessThanOrEqual(PROTOCOL_CHAR_LIMIT)
  })

  it('包含六个关键动作', () => {
    for (const keyword of ['grill_start', 'grill_confirm', 'ask_user_question', 'drift-check', '目标', '验收标准']) {
      expect(text).toContain(keyword)
    }
  })

  it('把配置值写进提示（轮次与跳过词）', () => {
    expect(text).toContain('每轮 3 个问题')
    expect(text).toContain('最多 3 轮')
    expect(text).toContain('直接做')
  })

  it('力度档位影响提示文案', () => {
    const grill = buildProtocolText({
      maxRounds: 5,
      maxQuestionsPerRound: 2,
      bypassKeywords: ['直接做'],
      intensity: 'grill',
    })
    expect(grill).toContain('刨根问底')
    expect(grill).toContain('最多 5 轮')
    expect(protocolLength(grill)).toBeLessThanOrEqual(PROTOCOL_CHAR_LIMIT)
  })
})
