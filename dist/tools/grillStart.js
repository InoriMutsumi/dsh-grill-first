import { judgeTask } from '../judge/heuristics.js';
import { loadMemory, summarize } from '../memory/store.js';
/** 把对象包成"回灌给模型的文本块"。 */
export function textOutput(schema) {
    return {
        schema,
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    };
}
/** grill_start 的参数 schema。 */
const PARAMETERS = {
    type: 'object',
    properties: {
        task: {
            type: 'string',
            description: '任务原文或任务摘要（必填）：把用户这句话原样贴进来，不要自己改写。',
        },
        mode: {
            type: 'string',
            enum: ['new-task', 'drift-check'],
            description: 'new-task=开工前的常规判定（默认）；drift-check=任务中途用户大改目标/范围时的重新判定。',
        },
    },
    required: ['task'],
    additionalProperties: false,
};
/** grill_start 的返回 schema（宽松描述，host 只做展示与校验兜底）。 */
const OUTPUT_SCHEMA = {
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
    },
    additionalProperties: true,
};
/**
 * 创建 `grill_start` 工具定义。
 * @param deps 配置读取、门禁表、会话表、工作区根目录。
 */
export function createGrillStartTool(deps) {
    return {
        name: 'grill_start',
        description: '开工前的需求判定（grill-first 插件）。任何新任务开始前先调用一次，把任务原文传进来：返回 verdict=clear 就直接开工；返回 needs-clarification 就按 focus_hints 用 ask_user_question 多轮追问，问清后用 grill_confirm 请用户确认。',
        parameters: PARAMETERS,
        output: textOutput(OUTPUT_SCHEMA),
        isConcurrencySafe: () => true,
        async execute(rawArgs, exec) {
            const args = (rawArgs ?? {});
            const config = deps.config();
            const agentId = exec?.agent?.id ?? '';
            const task = typeof args.task === 'string' ? args.task.trim() : '';
            const mode = args.mode === 'drift-check' ? 'drift-check' : 'new-task';
            if (!config.enabled) {
                return { verdict: 'clear', skip: true, reason: 'disabled' };
            }
            if (task === '') {
                return {
                    verdict: 'needs-clarification',
                    skip: false,
                    reason: 'empty-task',
                    focus_hints: ['task 为空：请把用户的原话或任务摘要原样传进来，再调用一次 grill_start。'],
                    hint: '缺少 task 参数。',
                };
            }
            const judged = judgeTask({ text: task, mode, bypassKeywords: config.bypassKeywords });
            const previous = deps.sessions.get(agentId);
            if (judged.verdict === 'clear') {
                deps.sessions.end(agentId);
                deps.gates.open(agentId);
                return {
                    verdict: 'clear',
                    skip: true,
                    reason: judged.reason,
                    score: judged.score,
                    gate_state: 'open',
                    mode,
                };
            }
            const startedAt = Date.now();
            deps.sessions.start({ agentId, task, mode, startedAt });
            deps.gates.close(agentId);
            let memoryContext = '';
            if (config.memoryEnabled) {
                try {
                    memoryContext = summarize(await loadMemory(deps.workspaceRoot(exec?.agent)));
                }
                catch (error) {
                    deps.logger?.warn(`[grill-first] 读取记忆失败：${error instanceof Error ? error.message : String(error)}`);
                    memoryContext = '';
                }
            }
            return {
                verdict: 'needs-clarification',
                skip: false,
                reason: judged.reason,
                score: judged.score,
                memory_context: memoryContext,
                focus_hints: judged.focus_hints,
                gate_state: 'closed',
                max_rounds: config.maxRounds,
                max_questions_per_round: config.maxQuestionsPerRound,
                intensity: config.intensity,
                mode,
                task_id: `${agentId}:${startedAt}`,
                ...(previous?.task ? { previous_task: previous.task } : {}),
            };
        },
    };
}
