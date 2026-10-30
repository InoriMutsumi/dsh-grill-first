/**
 * `grill_start` 工具（R1/R2/R4/R6）：开工前判定任务是否已经说清楚。
 *
 * - clear：放行（门禁置 open），模型直接开工；
 * - needs-clarification：门禁置 closed，并返回记忆摘要、追问方向与轮次上限。
 */
import type { GrillConfig, MemoryScope } from '../config.js'
import type { GateRegistry } from '../gate/preExecute.js'
import { buildFocusHints, detectDimensions, judgeTask } from '../judge/heuristics.js'
import { loadMemory, summarize } from '../memory/store.js'
import type { GrillAgent, ToolDefinition, ToolRunContext } from '../types.js'
import { PLUGIN_VERSION } from '../version.js'
import type { SessionRegistry } from './sessions.js'

/** 工具依赖（由 index.ts 装配注入）。 */
export interface GrillStartDeps {
  config: () => GrillConfig
  gates: GateRegistry
  sessions: SessionRegistry
  /** 解析当前会话的工作区根目录（项目层记忆落点）。 */
  workspaceRoot: (agent?: GrillAgent) => string
  /** 项目层记忆落在工作区还是插件家目录（memoryScope 配置）。 */
  memoryScope?: () => MemoryScope
  logger?: { warn(message: string): void }
}

/** grill_start 的返回体。 */
export interface GrillStartResult {
  verdict: 'clear' | 'needs-clarification'
  skip: boolean
  reason: string
  score?: number
  memory_context?: string
  focus_hints?: string[]
  gate_state?: 'open' | 'closed'
  max_rounds?: number
  max_questions_per_round?: number
  intensity?: string
  mode?: string
  task_id?: string
  previous_task?: string
  hint?: string
  /** 已经追问过的轮数（达到 maxRounds 后不再追问）。 */
  rounds_used?: number
  clarification_history?: { answer: string; asked: (keyof import('../judge/heuristics.js').DimensionHit)[] }[]
  confirmation_required?: boolean
  /** 当前运行的插件版本（取自 package.json）：用于确认改动是否已随重启生效。 */
  version?: string
}

/** 把对象包成"回灌给模型的文本块"。 */
export function textOutput(schema: Record<string, unknown>): ToolDefinition['output'] {
  return {
    schema,
    render: (_args: unknown, value: unknown) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
  }
}

/** grill_start 的参数 schema。 */
const PARAMETERS: Record<string, unknown> = {
  type: 'object',
  properties: {
    task: {
      type: 'string',
      description: '新任务/变更时传用户任务原文；continue 时传当前任务原文，上一轮答案另放 answer_summary。',
    },
    mode: {
      type: 'string',
      enum: ['new-task', 'drift-check', 'continue'],
      description: 'new-task（默认）开始独立任务；drift-check 重置变更后的任务；continue 记录当前任务一轮问答并重新评估。',
    },
    answer_summary: { type: 'string', maxLength: 4000, description: 'continue 时填写上一轮用户答案摘要，与 asked_dimensions 同传；不要把假设写成用户答案。' },
    asked_dimensions: { type: 'array', uniqueItems: true, items: { type: 'string', enum: ['goal', 'scope', 'constraint', 'acceptance'] }, description: '上一轮实际问过的维度；仅与非空 answer_summary 一起提交才计一轮。' },
  },
  required: ['task'],
  additionalProperties: false,
}

/** grill_start 的返回 schema（宽松描述，host 只做展示与校验兜底）。 */
const OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['clear', 'needs-clarification'] },
    skip: { type: 'boolean', description: 'true=无需提问，直接开工' },
    reason: { type: 'string' },
    score: { type: 'number', description: '需求完整度打分（0-100）' },
    memory_context: { type: 'string', description: '两层记忆的紧凑摘要，可先向用户呈现' },
    focus_hints: { type: 'array', items: { type: 'string' }, description: '建议的追问方向' },
    gate_state: { type: 'string', enum: ['open', 'closed'] },
    max_rounds: { type: 'number' },
    max_questions_per_round: { type: 'number' },
    intensity: { type: 'string' },
    mode: { type: 'string' },
    task_id: { type: 'string' },
    previous_task: { type: 'string' },
    hint: { type: 'string' },
    rounds_used: { type: 'number', description: '已经追问过的轮数' },
    version: { type: 'string', description: '运行中的插件版本；若缺失说明宿主加载的是旧版代码，需重启 DSH' },
  },
  additionalProperties: true,
}

/**
 * 创建 `grill_start` 工具定义。
 * @param deps 配置读取、门禁表、会话表、工作区根目录。
 */
export function createGrillStartTool(deps: GrillStartDeps): ToolDefinition {
  return {
    name: 'grill_start',
    description:
      '开工前的需求判定（grill-first 插件）。任何新任务开始前先调用一次，把任务原文传进来：返回 verdict=clear 就直接开工；返回 needs-clarification 就按 focus_hints 用 ask_user_question 多轮追问，问清后用 grill_confirm 请用户确认。',
    parameters: PARAMETERS,
    output: textOutput(OUTPUT_SCHEMA),
    isConcurrencySafe: () => false,
    async execute(rawArgs: unknown, exec: ToolRunContext): Promise<GrillStartResult> {
      const args = (rawArgs ?? {}) as { task?: unknown; mode?: unknown; answer_summary?: unknown; asked_dimensions?: unknown }
      const config = deps.config()
      const agentId = exec?.agent?.id ?? ''
      const task = typeof args.task === 'string' ? args.task.trim() : ''
      const mode = args.mode === 'continue' ? 'continue' : args.mode === 'drift-check' ? 'drift-check' : 'new-task'

      if (!config.enabled) {
        return { verdict: 'clear', skip: true, reason: 'disabled', version: PLUGIN_VERSION }
      }
      if (task === '') {
        return {
          verdict: 'needs-clarification',
          skip: false,
          reason: 'empty-task',
          focus_hints: ['task 为空：请把用户的原话或任务摘要原样传进来，再调用一次 grill_start。'],
          hint: '缺少 task 参数。',
          version: PLUGIN_VERSION,
        }
      }

      const judged = judgeTask({
        text: mode === 'continue' && typeof args.answer_summary === 'string' ? `${task}\n${args.answer_summary}` : task,
        mode: mode === 'continue' ? 'new-task' : mode,
        bypassKeywords: config.bypassKeywords,
        intensity: config.intensity,
      })
      const previous = deps.sessions.get(agentId)

      // drift-check 是用户显式切换任务：必须重置会话，不能被 inquiry/follow-up 判定保留旧任务。
      const preserving = !!previous && mode !== 'drift-check' && (mode === 'continue' || judged.reason === 'follow-up' || judged.reason === 'inquiry')
      if (mode === 'continue' && !previous) {
        deps.gates.close(agentId)
        return { verdict: 'needs-clarification', skip: false, reason: 'no-active-task', gate_state: 'closed', hint: '没有待澄清任务，请用 new-task 提交任务原文。' }
      }
      if (judged.verdict === 'clear' && (!preserving || judged.reason === 'bypass-keyword')) {
        deps.sessions.end(agentId)
        deps.gates.open(agentId)
        return {
          verdict: 'clear',
          skip: true,
          reason: judged.reason,
          score: judged.score,
          gate_state: 'open',
          mode,
          version: PLUGIN_VERSION,
        }
      }

      const startedAt = preserving ? previous!.startedAt : Date.now()
      if (!preserving) deps.sessions.start({ agentId, task, mode: mode === 'drift-check' ? mode : 'new-task', startedAt, rounds: 0 })
      deps.gates.close(agentId)
      const answer = typeof args.answer_summary === 'string' ? args.answer_summary.trim() : ''
      const keys = ['goal', 'scope', 'constraint', 'acceptance'] as const
      const asked = Array.isArray(args.asked_dimensions)
        ? keys.filter((key) => args.asked_dimensions instanceof Array && args.asked_dimensions.includes(key)) : []
      if (mode === 'continue' && (answer.length > 4000 || (!!answer !== (asked.length > 0)))) {
        return { verdict: 'needs-clarification', skip: false, reason: 'invalid-continuation', gate_state: 'closed', hint: '答案摘要须不超过4000字，并与上一轮实际提问维度同时提供；未记录本轮。' }
      }
      if (mode === 'continue') deps.sessions.recordAnswer(agentId, answer, asked, config.maxRounds)
      const session = deps.sessions.get(agentId)
      const roundsUsed = session?.rounds ?? 0
      const combined = [session?.task ?? task, ...(session?.history ?? []).map((round) => round.answer)].join('\n')
      const evaluated = judgeTask({ text: combined, mode: 'new-task', intensity: config.intensity, bypassKeywords: [] })
      const atLimit = roundsUsed >= config.maxRounds
      const ready = preserving && evaluated.verdict === 'clear'
      const dimensions = detectDimensions(combined)
      const focus = atLimit || ready ? [] : buildFocusHints(dimensions, [], session?.task ?? task)

      let memoryContext = ''
      if (config.memoryEnabled) {
        try {
          memoryContext = summarize(await loadMemory(deps.workspaceRoot(exec?.agent), (deps.memoryScope?.() ?? 'project')))
        } catch (error) {
          deps.logger?.warn(`[grill-first] 读取记忆失败：${error instanceof Error ? error.message : String(error)}`)
          memoryContext = ''
        }
      }

      return {
        verdict: 'needs-clarification',
        skip: false,
        reason: atLimit ? 'max-rounds-reached' : ready ? 'confirmation-required' : preserving ? 'clarification-pending' : judged.reason,
        score: evaluated.score,
        memory_context: memoryContext,
        focus_hints: focus,
        hint: judged.reason === 'inquiry' && preserving
          ? '先回答当前咨询，再回到待确认任务；咨询不代表同意开工。'
          : atLimit || ready || focus.length === 0
            ? '停止追问，把需求及尚未验证的假设整理成四段清单，调用 grill_confirm；确认前不得开工。'
            : '结合已知偏好和已有答案，只问仍影响方案的歧义；问题数是上限，不必凑数。每轮回答后用 continue 记录答案摘要与实际问过的维度。',
        gate_state: 'closed',
        max_rounds: config.maxRounds,
        max_questions_per_round: config.maxQuestionsPerRound,
        intensity: config.intensity,
        mode,
        task_id: `${agentId}:${startedAt}`,
        rounds_used: roundsUsed,
        clarification_history: session?.history ?? [],
        confirmation_required: true,
        version: PLUGIN_VERSION,
        ...(previous?.task ? { previous_task: previous.task } : {}),
      }
    },
  }
}
