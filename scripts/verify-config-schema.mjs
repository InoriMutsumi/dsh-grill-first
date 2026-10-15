/**
 * 静态自检：用真实的 @deepseek-ai/schemastery（宿主提供的 peerDependency）校验配置 schema。
 *
 * 为什么需要：Config 是插件与真实宿主唯一的强耦合点——schema 里一旦用了宿主不支持的 API，
 * 插件会直接加载失败。单测跑的是归一化逻辑（config.ts），这里跑的是真实 Schema 的行为。
 *
 * 用法：node scripts/verify-config-schema.mjs
 */
import { Config } from '../dist/configSchema.js'
import { DEFAULT_CONFIG } from '../dist/config.js'

let failed = 0

/** 断言辅助。 */
function check(label, condition, detail) {
  const mark = condition ? '[OK]' : '[FAIL]'
  if (!condition) failed += 1
  const suffix = detail ? '  -> ' + detail : ''
  console.log(mark + ' ' + label + suffix)
}

/** 把拒绝原因压成一行。 */
function firstLine(error) {
  return String(error && error.message ? error.message : error).split('\n')[0]
}

console.log('schemastery 校验开始\n')

const defaults = Config({})
console.log('Config({}) = ' + JSON.stringify(defaults) + '\n')

check('7 个键齐全', Object.keys(defaults).length === 7, Object.keys(defaults).join(','))
check('enabled 默认 true', defaults.enabled === true)
check('gateMode 默认 warn', defaults.gateMode === 'warn')
check('maxQuestionsPerRound 默认 3', defaults.maxQuestionsPerRound === 3)
check('maxRounds 默认 3', defaults.maxRounds === 3)
check('intensity 默认 standard', defaults.intensity === 'standard')
check(
  'bypassKeywords 默认非空数组',
  Array.isArray(defaults.bypassKeywords) && defaults.bypassKeywords.length > 0,
  '长度 ' + String(defaults.bypassKeywords && defaults.bypassKeywords.length),
)
check('memoryEnabled 默认 true', defaults.memoryEnabled === true)
check(
  '默认值与 config.ts 的 DEFAULT_CONFIG 一致',
  JSON.stringify({ ...defaults, bypassKeywords: [...defaults.bypassKeywords] }) === JSON.stringify(DEFAULT_CONFIG),
)

const legal = Config({
  gateMode: 'strict',
  intensity: 'grill',
  maxRounds: 5,
  maxQuestionsPerRound: 2,
  enabled: false,
  memoryEnabled: false,
  bypassKeywords: ['快做'],
})
check(
  '合法值原样保留',
  legal.gateMode === 'strict' && legal.intensity === 'grill' && legal.maxRounds === 5 && legal.bypassKeywords.length === 1,
)

const illegalCases = [
  ['非法枚举 gateMode', { gateMode: 'block' }],
  ['越界 maxRounds', { maxRounds: 99 }],
  ['类型错误 enabled', { enabled: 'yes' }],
]
for (const item of illegalCases) {
  const label = item[0]
  let threw = false
  let message = ''
  try {
    Config(item[1])
  } catch (error) {
    threw = true
    message = firstLine(error)
  }
  check('真实 schema 会拒绝：' + label, threw, message || '竟然通过了，只能靠 config.ts 兜底')
}

const inner = Config.dict ?? {}
const descriptions = Object.entries(inner).map(([key, schema]) => [key, schema && schema.meta ? schema.meta.description : undefined])
check(
  '每个配置项都带 description（设置界面据此显示说明）',
  descriptions.length === 7 && descriptions.every(([, d]) => typeof d === 'string' && d.length >= 4),
  descriptions.map(([k, d]) => k + '=' + (typeof d === 'string' ? d.length : 0)).join(' '),
)
const schemaJson = JSON.stringify(Config.toJSON ? Config.toJSON() : {})
check(
  '枚举候选值出现在 schema JSON 里（供设置界面渲染下拉框）',
  ['off', 'warn', 'strict', 'gentle', 'standard', 'grill'].every((value) => schemaJson.includes('"' + value + '"')),
  schemaJson.length + ' 字符',
)
check('类型签名包含 7 个键', String(Config).startsWith('{ enabled?:'))

console.log(failed === 0 ? '\n结论：配置 schema 与真实 schemastery 兼容，全部通过。' : '\n结论：有 ' + failed + ' 项未通过。')
process.exit(failed === 0 ? 0 : 1)
