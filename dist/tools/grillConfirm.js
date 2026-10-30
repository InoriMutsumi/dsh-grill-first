import { saveHistory, savePreference, saveProjectContext } from '../memory/store.js';
import { textOutput } from './grillStart.js';
/** grill_confirm 的参数 schema。 */
const PARAMETERS = {
    type: 'object',
    properties: {
        requirements: {
            type: 'string',
            description: '四段式中文需求清单全文（目标 / 范围 / 约束 / 验收标准）。会原样展示给用户确认，不会写进任何文件。',
        },
        preferences_learned: {
            type: 'array',
            items: { type: 'string' },
            description: '本次对话里用户表露的通用偏好（例如"注释一律用中文"），确认后写入全局记忆。',
        },
        confirmed: {
            type: 'boolean',
            description: '仅用于兜底通道：已经用 ask_user_question 向用户展示过该清单并得到明确同意时传 true，直接开工；正常情况下不要传，让用户在本工具的确认卡片里选。',
        },
    },
    required: ['requirements'],
    additionalProperties: false,
};
/** grill_confirm 的返回 schema。 */
const OUTPUT_SCHEMA = {
    type: 'object',
    properties: {
        confirmed: { type: 'boolean' },
        final_requirements: { type: 'string' },
        feedback: { type: 'string', description: '用户选择"要改"时的修改意见' },
        needs_user_confirmation: { type: 'boolean' },
        instructions: { type: 'string' },
        skipped: { type: 'boolean' },
        reason: { type: 'string' },
        error: { type: 'string' },
    },
    additionalProperties: true,
};
/** 项目背景写入时截断的长度。 */
const PROJECT_CONTEXT_LIMIT = 300;
/**
 * 确认卡片标题（`question` 字段）的长度上限。
 *
 * 卡片高度被固定在 `min(60vh, 520px)`，而标题所在的 header 是 `flex-shrink: 0` 且**不滚动**：
 * 标题一旦长到几百字，就会把唯一可收缩的正文区（选项按钮、自定义输入框都在里面）压成 0 高，
 * 用户"选择不到开工选项"，只能关掉卡片手动打字。所以标题必须短，长清单一律走 `detail`。
 */
const CARD_TITLE_LIMIT = 60;
/** 确认卡片正文（`detail` 字段）的长度上限：正文在可滚动区里渲染，超长必须拒绝并要求摘要。 */
const CARD_DETAIL_LIMIT = 6000;
/** 卡片正文末尾的使用提示。 */
const CARD_DETAIL_HINT = '确认后我才会开工；选择"要改"时请在最下面的输入框里写清要改哪里。';
/** 取首行作为任务摘要。 */
function firstLine(text) {
    const line = text.split('\n').map((t) => t.trim()).find((t) => t !== '');
    return line ?? text.trim();
}
/** 压平空白（含换行）并截断，得到一行以内的卡片标题。 */
function cardTitle(text) {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > CARD_TITLE_LIMIT ? `${flat.slice(0, CARD_TITLE_LIMIT)}…` : flat;
}
/** 卡片正文：完整清单（超长已在入口拒绝）+ 使用提示。 */
function cardDetail(requirements) {
    return `${requirements}\n\n---\n\n${CARD_DETAIL_HINT}`;
}
/**
 * 创建 `grill_confirm` 工具定义。
 * @param deps 配置读取、门禁表、会话表、工作区根目录、结构化提问服务。
 */
export function createGrillConfirmTool(deps) {
    const fallback = new Map();
    return {
        name: 'grill_confirm',
        description: '把整理好的中文需求清单交给用户确认（grill-first 插件）。用户确认后本次任务放行，并把确认过的内容写入两层记忆；用户选"要改"时返回 feedback，据此修订后再次调用。',
        parameters: PARAMETERS,
        output: textOutput(OUTPUT_SCHEMA),
        isConcurrencySafe: () => false,
        async execute(rawArgs, exec) {
            const args = (rawArgs ?? {});
            const config = deps.config();
            const agentId = exec?.agent?.id ?? '';
            const requirements = typeof args.requirements === 'string' ? args.requirements.trim() : '';
            const preferences = Array.isArray(args.preferences_learned)
                ? args.preferences_learned.filter((item) => typeof item === 'string' && item.trim() !== '')
                : [];
            if (!config.enabled) {
                return { confirmed: true, skipped: true, reason: 'disabled' };
            }
            const previousGateRevision = deps.gates.revisionOf(agentId);
            deps.gates.close(agentId);
            if (!deps.sessions.get(agentId)) {
                deps.sessions.start({ agentId, task: firstLine(requirements) || '待确认需求', mode: 'new-task', startedAt: Date.now() });
            }
            if (requirements.length > CARD_DETAIL_LIMIT) {
                return { confirmed: false, reason: 'requirements-too-long', instructions: `清单超过 ${CARD_DETAIL_LIMIT} 字，未展示也未授权。请先分段整理摘要，保留全部约束和验收条件，再提交完整四段清单确认。` };
            }
            if (exec?.signal?.aborted)
                return { confirmed: false, reason: 'confirmation-cancelled' };
            if (requirements === '') {
                return {
                    confirmed: false,
                    reason: 'empty-requirements',
                    instructions: 'requirements 不能为空：请把四段式需求清单全文放进 requirements 参数，再调用一次。',
                };
            }
            const session = deps.sessions.get(agentId);
            const task = session?.task ?? firstLine(requirements);
            const sessionRevision = JSON.stringify(session);
            const gateRevision = deps.gates.revisionOf(agentId);
            const isCurrent = () => deps.gates.revisionOf(agentId) === gateRevision && deps.sessions.get(agentId) === session && JSON.stringify(session) === sessionRevision;
            const stale = () => ({ confirmed: false, reason: 'stale-confirmation', instructions: '任务已经变化，请展示当前任务的清单重新确认。' });
            /** 确认后的落库动作：历史 + 全局偏好 + 项目背景，然后放行门禁。 */
            const accept = async (channel) => {
                if (!isCurrent())
                    return stale();
                if (exec?.signal?.aborted)
                    return { confirmed: false, reason: 'confirmation-cancelled' };
                const saved = { history: false, preferences: 0, project_context: false };
                if (config.memoryEnabled) {
                    const root = deps.workspaceRoot(exec?.agent);
                    try {
                        const scope = deps.memoryScope?.() ?? 'project';
                        await saveHistory(task, requirements, root, scope);
                        saved.history = true;
                        for (const preference of preferences) {
                            await savePreference(preference, ['用户确认'], root);
                            saved.preferences += 1;
                        }
                        const context = requirements.replace(/\s+/g, ' ').slice(0, PROJECT_CONTEXT_LIMIT);
                        await saveProjectContext(context, root, scope);
                        saved.project_context = true;
                    }
                    catch (error) {
                        deps.logger?.warn(`[grill-first] 写入记忆失败：${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                if (!isCurrent())
                    return stale();
                if (exec?.signal?.aborted)
                    return { confirmed: false, reason: 'confirmation-cancelled' };
                deps.sessions.end(agentId);
                deps.gates.open(agentId);
                deps.logger?.warn?.(`[grill-first] 需求已确认（通道=${channel}，agent=${agentId}）`);
                return { confirmed: true, final_requirements: requirements, saved };
            };
            // 兜底声明只在本任务的同一清单确实进入兜底流程后有效。
            const issued = fallback.get(agentId);
            if (args.confirmed === true && issued && issued.session === session && issued.revision === sessionRevision && issued.gateRevision === previousGateRevision && issued.requirements === requirements) {
                fallback.delete(agentId);
                return accept('agent-declared-fallback');
            }
            const issueFallback = () => fallback.set(agentId, { session, revision: sessionRevision, gateRevision, requirements });
            const questions = deps.questions();
            if (!questions || typeof questions.ask !== 'function') {
                issueFallback();
                return {
                    confirmed: false,
                    needs_user_confirmation: true,
                    requirements,
                    instructions: '当前没有可用的结构化提问通道：请用 ask_user_question 把需求清单展示给用户——question 只写一句 60 字以内的短标题（确认卡片标题栏不滚动，标题一长就会把选项区压得点不到），完整四段清单放进 detail 字段；得到明确同意后再调用 grill_confirm(confirmed:true)；用户要改则按意见修订后重新确认。',
                };
            }
            const request = {
                questions: [
                    {
                        id: 'grill-confirm',
                        header: '需求确认',
                        // 标题只放一句短说明，完整清单走 detail：标题在固定头部（不可滚动），长了会挤掉选项区。
                        question: cardTitle(task),
                        detail: cardDetail(requirements),
                        options: [
                            { label: '确认，按此开工', description: '按上面的清单开始执行' },
                            { label: '要改', description: '我会说明需要修改的地方' },
                        ],
                        multiSelect: false,
                    },
                ],
                ...(exec?.agent ? { agent: exec.agent } : {}),
                ...(exec?.signal ? { signal: exec.signal } : {}),
                ...(exec?.callId ? { wait: { callId: exec.callId } } : {}),
            };
            let answer;
            try {
                answer = await questions.ask(request);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (!isCurrent())
                    return stale();
                if (exec?.signal?.aborted)
                    return { confirmed: false, reason: 'confirmation-cancelled' };
                issueFallback();
                return {
                    confirmed: false,
                    needs_user_confirmation: true,
                    requirements,
                    error: message,
                    instructions: '结构化提问失败：请改用 ask_user_question 展示需求清单并请用户确认（同样要求：question 用 60 字以内的短标题，完整清单放 detail），用户同意后再调用 grill_confirm(confirmed:true)。',
                };
            }
            if (!isCurrent())
                return stale();
            const item = answer?.answers?.find((entry) => entry.id === 'grill-confirm');
            const selected = Array.isArray(item?.selected) ? item.selected : [];
            const custom = typeof item?.custom === 'string' ? item.custom.trim() : '';
            if (exec?.signal?.aborted)
                return { confirmed: false, reason: 'confirmation-cancelled' };
            const userConfirmed = answer?.answers?.length === 1 && selected.length === 1 && selected[0] === '确认，按此开工';
            if (userConfirmed) {
                const result = await accept('structured-question');
                return custom === '' ? result : { ...result, user_note: custom };
            }
            if (selected.length !== 1 || selected[0] !== '要改') {
                return { confirmed: false, reason: 'confirmation-not-received', needs_user_confirmation: true, requirements, instructions: '未收到有效确认，请重新展示完整清单并等待明确选择。' };
            }
            const rounds = deps.sessions.get(agentId)?.rounds ?? 0;
            const maxRounds = config.maxRounds;
            const roundsLeft = Math.max(0, maxRounds - rounds);
            return {
                confirmed: false,
                requirements,
                feedback: custom !== ''
                    ? custom
                    : '用户选择了"要改"，但没有写明改哪里：请追问具体修改点，修订需求清单后再次调用 grill_confirm。',
                rounds_used: rounds,
                rounds_left: roundsLeft,
                ...(roundsLeft === 0
                    ? {
                        instructions: `已达追问轮数上限（${maxRounds} 轮）：按修改意见修订清单并标出假设，再调用 grill_confirm；确认前不得开工。`,
                    }
                    : {}),
            };
        },
    };
}
