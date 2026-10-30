import type { GrillConfig } from '../config.js'
import type { ToolDefinition } from '../types.js'
import { researchGitHub } from '../research/index.js'
import { textOutput } from './grillStart.js'

/** 只发送明确的公开搜索词；实现选择仍由用户确认的需求约束。 */
export function createGrillResearchTool(config: () => GrillConfig): ToolDefinition {
  return {
    name: 'grill_research',
    description: '需求明确后，按设置查询 GitHub 候选库并核对来源；返回有界证据供比较，不安装、不执行仓库代码。失败时可继续本地方案。',
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        keywords: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 100 }, minItems: 1, maxItems: 12, description: '明确的公开技术关键词；禁止包含密钥、私有源码或用户隐私。' },
        applicable: { type: 'boolean', description: '当前是否为适合参考现有开源实现的软件任务；auto 模式必须明确为 true 才查询。' },
      }, required: ['keywords', 'applicable'],
    },
    output: textOutput({ type: 'object', additionalProperties: true }),
    isConcurrencySafe: () => true,
    async execute(raw) {
      const settings = config()
      const args = raw as { keywords?: unknown; applicable?: unknown } | null
      return researchGitHub({
        keywords: Array.isArray(args?.keywords) ? args.keywords as string[] : [],
        mode: settings.enabled ? settings.researchMode : 'off',
        depth: settings.researchDepth,
        autoEligible: args?.applicable === true,
        limit: 3,
      })
    },
  }
}
