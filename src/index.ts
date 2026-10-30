/**
 * dsh-grill-first 插件入口：装配两个工具 + 协议提示段 + 需求门禁。
 *
 * 生命周期：DSH 加载插件时调用一次 {@link apply}；`ctx.effect` 内注册的东西
 * 在插件卸载/配置变更重挂载时自动清理。
 */
import { normalizeConfig, type GrillConfig } from './config.js'
import { judgeTask } from './judge/heuristics.js'
import { Config } from './configSchema.js'
import { GateRegistry, registerGate } from './gate/preExecute.js'
import { PROTOCOL_SECTION_NAME, PROTOCOL_SECTION_ORDER, buildProtocolText } from './prompt/protocol.js'
import { createGrillConfirmTool } from './tools/grillConfirm.js'
import { createGrillStartTool } from './tools/grillStart.js'
import { createGrillResearchTool } from './tools/grillResearch.js'
import { SessionRegistry } from './tools/sessions.js'
import { installSettingsBridge } from './settings/bridge.js'
import { createConfigurationSettings, type ConfigurationEditor } from './settings/configuration.js'
import type { GrillAgent, GrillContext, ToolsService, ToolDefinition, UserQuestionsService } from './types.js'
import { resolveWorkspaceRoot } from './workspace.js'

/** 插件名。 */
export const name = 'dsh-grill-first'

/** 硬依赖：工具注册服务（缺失则插件不挂载）。 */
export const inject = ['tools']

/** 设置界面用的配置 schema（7 个配置项）。 */
export { Config }

/** 注册协议提示段（仅在 enabled=true 时注入）。 */
function installProtocolSection(ctx: GrillContext, config: GrillConfig): void {
  const text = buildProtocolText({
    maxRounds: config.maxRounds,
    maxQuestionsPerRound: config.maxQuestionsPerRound,
    bypassKeywords: config.bypassKeywords,
    intensity: config.intensity,
    researchMode: config.researchMode,
  })
  ctx.inject(['systemPrompt'], (scoped: GrillContext) => {
    const systemPrompt = scoped.systemPrompt
    if (!systemPrompt || typeof systemPrompt.section !== 'function') {
      scoped.logger?.warn('[grill-first] systemPrompt 服务不可用，协议段未注入。')
      return
    }
    scoped.effect(
      () =>
        systemPrompt.section({
          name: PROTOCOL_SECTION_NAME,
          order: PROTOCOL_SECTION_ORDER,
          interpolate: false,
          text,
        }),
      'dsh-grill-first: protocol section',
    )
  })
}

/**
 * 插件装配入口。
 * @param ctx Cordis 上下文。
 * @param rawConfig 来自设置界面 / cordis.yml 的原始配置。
 */
export function apply(ctx: GrillContext, rawConfig: unknown): void {
  const config = normalizeConfig(rawConfig)
  const gates = new GateRegistry()
  const sessions = new SessionRegistry()
  const readConfig = (): GrillConfig => config
  const workspaceRoot = (agent?: GrillAgent): string => resolveWorkspaceRoot(ctx, agent)

  ctx.inject(['configEditor'], scoped => {
    const editor = scoped.get('configEditor') as ConfigurationEditor
    if (!editor || typeof editor.entries !== 'function') return
    installSettingsBridge(scoped, { namespace: () => {
      const entries = editor.entries().filter(entry => entry.options.name === name)
      if (entries.length !== 1) throw new Error('设置入口需要唯一的已激活插件实例')
      // Settings.describe/update use the composed options.id, not a runtime entry id.
      return entries[0]!.options.id
    }, projectScope: () => config.memoryScope, settings: createConfigurationSettings(editor, name) })
  })

  ctx.effect(() => {
    const tools = ctx.get('tools') as ToolsService | undefined
    if (!tools || typeof tools.register !== 'function') {
      ctx.logger?.warn('[grill-first] tools 服务不可用，工具未注册。')
      return () => {}
    }
    const disposers: Array<() => void> = []
    const register = (definition: ToolDefinition): void => {
      const dispose = tools.register(definition)
      if (typeof dispose === 'function') disposers.push(dispose)
    }

    register(
      createGrillStartTool({
        config: readConfig,
        gates,
        sessions,
        workspaceRoot,
        memoryScope: () => config.memoryScope,
        ...(ctx.logger ? { logger: ctx.logger } : {}),
      }),
    )
    register(
      createGrillConfirmTool({
        config: readConfig,
        gates,
        sessions,
        workspaceRoot,
        memoryScope: () => config.memoryScope,
        questions: () => ctx.get('userQuestions') as UserQuestionsService | undefined,
        ...(ctx.logger ? { logger: ctx.logger } : {}),
      }),
    )

    register(createGrillResearchTool(readConfig))

    return () => {
      for (const dispose of disposers) {
        try {
          dispose()
        } catch (error) {
          ctx.logger?.warn(`[grill-first] 卸载工具失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }
      gates.clear()
      sessions.clear()
    }
  }, 'dsh-grill-first: tools')

  // 总开关关闭时既不加协议段，也不挂门禁（R4：Config 可整体关闭，零打扰）。
  if (!config.enabled) {
    ctx.logger?.info?.('[grill-first] 插件已停用（enabled=false），不注入协议段、不挂门禁。')
    return
  }

  installProtocolSection(ctx, config)

  registerGate(ctx, gates, {
    mode: config.gateMode,
    // 新消息到达时先看一眼内容：追问/询问类不关门禁，否则"刚确认完又被拦"。
    shouldResetOnMessage: (text: string): boolean => {
      const judged = judgeTask({
        text,
        mode: 'new-task',
        bypassKeywords: config.bypassKeywords,
        intensity: config.intensity,
      })
      // 任务明确也不能让旧任务的确认卡继续有效；只保留咨询与普通追问。
      // 此处只更新门禁代次，不清除会话答案；grill_start 再决定继续或切换任务。
      return judged.reason !== 'follow-up' && judged.reason !== 'inquiry' && judged.reason !== 'bypass-keyword'
    },
    onWarning: (toolName: string, agentId: string) => {
      ctx.logger?.warn(
        `[grill-first] 需求尚未确认（warn 模式，仅记录未拦截）：${toolName}（agent=${agentId}）`,
      )
    },
  })
}
