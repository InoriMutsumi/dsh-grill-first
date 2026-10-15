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
/** 取首行作为任务摘要。 */
function firstLine(text) {
    const line = text.split('\n').map((t) => t.trim()).find((t) => t !== '');
    return line ?? text.trim();
}
/**
 * 创建 `grill_confirm` 工具定义。
 * @param deps 配置读取、门禁表、会话表、工作区根目录、结构化提问服务。
 */
export function createGrillConfirmTool(deps) {
    return {
        name: 'grill_confirm',
        description: '把整理好的中文需求清单交给用户确认（grill-first 插件）。用户确认后本次任务放行，并把确认过的内容写入两层记忆；用户选"要改"时返回 feedback，据此修订后再次调用。',
        parameters: PARAMETERS,
        output: textOutput(OUTPUT_SCHEMA),
        isConcurrencySafe: () => true,
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
            if (requirements === '') {
                return {
                    confirmed: false,
                    reason: 'empty-requirements',
                    instructions: 'requirements 不能为空：请把四段式需求清单全文放进 requirements 参数，再调用一次。',
                };
            }
            const session = deps.sessions.get(agentId);
            const task = session?.task ?? firstLine(requirements);
            /** 确认后的落库动作：历史 + 全局偏好 + 项目背景，然后放行门禁。 */
            const accept = async (channel) => {
                const saved = { history: false, preferences: 0, project_context: false };
                if (config.memoryEnabled) {
                    const root = deps.workspaceRoot(exec?.agent);
                    try {
                        await saveHistory(task, requirements, root);
                        saved.history = true;
                        for (const preference of preferences) {
                            await savePreference(preference, ['用户确认'], root);
                            saved.preferences += 1;
                        }
                        const context = requirements.replace(/\s+/g, ' ').slice(0, PROJECT_CONTEXT_LIMIT);
                        await saveProjectContext(context, root);
                        saved.project_context = true;
                    }
                    catch (error) {
                        deps.logger?.warn(`[grill-first] 写入记忆失败：${error instanceof Error ? error.message : String(error)}`);
                    }
                }
                deps.sessions.end(agentId);
                deps.gates.open(agentId);
                deps.logger?.warn?.(`[grill-first] 需求已确认（通道=${channel}，agent=${agentId}）`);
                return { confirmed: true, final_requirements: requirements, saved };
            };
            // 通道 2：模型已自行用 ask_user_question 拿到用户同意，直接放行。
            if (args.confirmed === true)
                return accept('agent-declared');
            const questions = deps.questions();
            if (!questions || typeof questions.ask !== 'function') {
                return {
                    confirmed: false,
                    needs_user_confirmation: true,
                    requirements,
                    instructions: '当前没有可用的结构化提问通道：请用 ask_user_question 把上面的需求清单展示给用户，得到明确同意后再调用 grill_confirm(confirmed:true)；用户要改则按意见修订后重新确认。',
                };
            }
            const request = {
                questions: [
                    {
                        id: 'grill-confirm',
                        header: '需求确认',
                        question: requirements,
                        detail: '确认后我才会开工；选择"要改"时请在下面写清要改哪里。',
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
                return {
                    confirmed: false,
                    needs_user_confirmation: true,
                    requirements,
                    error: message,
                    instructions: '结构化提问失败：请改用 ask_user_question 展示需求清单并请用户确认，用户同意后再调用 grill_confirm(confirmed:true)。',
                };
            }
            const item = answer?.answers?.find((entry) => entry.id === 'grill-confirm');
            const selected = Array.isArray(item?.selected) ? item.selected : [];
            const custom = typeof item?.custom === 'string' ? item.custom.trim() : '';
            const userConfirmed = selected.some((label) => label.includes('确认'));
            if (userConfirmed) {
                const result = await accept('structured-question');
                return custom === '' ? result : { ...result, user_note: custom };
            }
            return {
                confirmed: false,
                requirements,
                feedback: custom !== ''
                    ? custom
                    : '用户选择了"要改"，但没有写明改哪里：请追问具体修改点，修订需求清单后再次调用 grill_confirm。',
            };
        },
    };
}
