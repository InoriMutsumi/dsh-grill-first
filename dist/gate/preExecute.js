/** 变更类工具名单（宁松勿紧）。 */
export const MUTATING_TOOLS = [
    'write',
    'edit',
    'ops_replace',
    'ops_bash',
    'bash',
    'pwsh',
    'present',
    // 注：job_kill 属于"收尾/止损"操作，不纳入门禁，避免卡住正在跑的后台任务。
    'spawn_teammate',
    'subagent',
    'subagent_fork',
    'workflow',
    'team_task_create',
    // 注：plugin_manager 会改动 profile（装/卸插件），同属"动手"范畴，一并纳入。
    'plugin_manager',
];
/** 只读工具白名单：即使名字落在 univer_/ops_ 前缀里也一律放行。 */
export const READ_ONLY_TOOLS = [
    'read',
    'read_image',
    'grep',
    'glob',
    'ops_grep',
    'ops_glob',
    'ops_inspect_local_file',
    'search_context',
    'decompress',
    'acp_status',
    'acp_cache',
    'web_search',
    'web_fetch',
    'find_dsh_plugins',
    'cordis_inspect_list',
    'cordis_inspect_query',
    'univer_status',
    'univer_inspect',
    'univer_screenshot',
    'univer_lint',
    'univer_api',
    'univer_resources',
    'ask_user_question',
    'todo_write',
    'list_agents',
    'wait_agent',
    'send_message',
    'get_goal',
    'create_goal',
    'update_goal',
    'grill_start',
    'grill_confirm',
];
/** 拦截时给模型看的拒绝文案（工作表 3.6 原文）。 */
export const GATE_DENY_REASON = "需求尚未确认：请先调用 grill_confirm 完成需求确认，或让用户说'直接做'跳过。";
/** ask 档弹给用户看的说明（宿主用 displayReason 渲染卡片正文）。 */
export const GATE_ASK_REASON = '这次任务的需求还没确认，要照现在的理解直接动手吗？';
const READ_ONLY_SET = new Set(READ_ONLY_TOOLS.map((n) => n.toLowerCase()));
const MUTATING_SET = new Set(MUTATING_TOOLS.map((n) => n.toLowerCase()));
/** univer_* 里只有这几个是只读的，其余按写类处理。 */
const UNIVER_READ_ONLY = new Set(['univer_status', 'univer_inspect', 'univer_screenshot', 'univer_lint', 'univer_api', 'univer_resources']);
/**
 * 判断某个工具名是否属于"会真正改动工作区/交付物"的变更类工具。
 * @param name 工具名。
 */
export function isMutatingTool(name) {
    if (typeof name !== 'string' || name.trim() === '')
        return false;
    const tool = name.trim().toLowerCase();
    if (READ_ONLY_SET.has(tool))
        return false;
    if (MUTATING_SET.has(tool))
        return true;
    if (tool.startsWith('univer_'))
        return !UNIVER_READ_ONLY.has(tool);
    if (tool.startsWith('ops_'))
        return true;
    return false;
}
/**
 * 门禁核心判定（纯函数，可单测）。
 * @param input 工具名 + 当前门禁状态 + 档位。
 */
export function decideGate(input) {
    // off / warn 只记录不拦截（warn 的提示在 registerGate 里单独打日志）。
    if (input.mode === 'off' || input.mode === 'warn')
        return { action: 'allow' };
    if (input.state !== 'closed')
        return { action: 'allow' };
    if (!isMutatingTool(input.toolName))
        return { action: 'allow' };
    if (input.mode === 'ask')
        return { action: 'ask', reason: GATE_DENY_REASON };
    return { action: 'deny', reason: GATE_DENY_REASON };
}
/**
 * 从宿主的 inbox 负载里尽量捞出用户消息文本。
 *
 * 不同宿主版本的字段名不统一（text / content / parts），取不到时返回空串；
 * 空串表示"不知道用户说了什么"，此时保持旧行为（关门禁）最安全。
 * @param payload `agent/inbox/inserted` 的事件负载。
 */
function extractMessageText(payload) {
    const message = payload?.message;
    if (typeof message === 'string')
        return message.trim();
    if (!message || typeof message !== 'object')
        return '';
    const record = message;
    for (const key of ['text', 'content', 'body', 'prompt', 'parts']) {
        const value = record[key];
        if (typeof value === 'string' && value.trim() !== '')
            return value.trim();
        if (!Array.isArray(value))
            continue;
        const joined = value
            .map((part) => (typeof part === 'string' ? part : part?.text))
            .filter((part) => typeof part === 'string' && part.trim() !== '')
            .join('\n');
        if (joined.trim() !== '')
            return joined.trim();
    }
    return '';
}
/** 每个 agent 的门禁状态表（agent 级隔离）。 */
export class GateRegistry {
    states = new Map();
    /** 读取状态；未登记的 agent 默认 closed（新会话即"未确认"）。 */
    stateOf(agentId) {
        return this.states.get(agentId) ?? 'closed';
    }
    /** 放行该 agent。 */
    open(agentId) {
        if (agentId)
            this.states.set(agentId, 'open');
    }
    /** 拦截该 agent（新用户消息到达时重置）。 */
    close(agentId) {
        if (agentId)
            this.states.set(agentId, 'closed');
    }
    /** 清空（插件卸载时调用）。 */
    clear() {
        this.states.clear();
    }
}
/**
 * 判断某个 agent 是否是"根 agent"（能直接跟人对话）。
 * agents 服务不可用时返回 false —— 门禁退化为不拦截，避免误伤子 agent。
 */
export function isRootAgent(ctx, agentId) {
    if (!agentId)
        return false;
    const agents = ctx.get('agents');
    if (!agents || typeof agents.roots !== 'function')
        return false;
    try {
        return agents.roots().some((agent) => agent?.id === agentId);
    }
    catch {
        return false;
    }
}
/**
 * 把门禁挂到宿主事件上：`tools/pre-execute` 拦截 + `agent/inbox/inserted` 重置。
 * @param ctx 插件上下文。
 * @param gates 门禁状态表。
 * @param options 档位与提示回调。
 */
export function registerGate(ctx, gates, options) {
    ctx.on('tools/pre-execute', async (exec, next) => {
        const agentId = exec?.agent?.id ?? '';
        if (options.mode !== 'off' && agentId !== '' && isRootAgent(ctx, agentId)) {
            const state = gates.stateOf(agentId);
            const decision = decideGate({ toolName: exec?.name ?? '', state, mode: options.mode });
            if (decision.action === 'deny') {
                ctx.logger?.info?.(`[grill-first] 拦截 ${exec.name}（需求未确认，agent=${agentId}）`);
                return { kind: 'deny', reason: decision.reason ?? GATE_DENY_REASON };
            }
            if (decision.action === 'ask') {
                // 只问一次：卡片弹过之后无论用户点头还是否决，都由用户决定，插件不再逐次弹
                // （否则一次任务里写 20 个文件就会弹 20 张卡片）。
                ctx.logger?.info?.(`[grill-first] 询问 ${exec.name}（需求未确认，agent=${agentId}）`);
                gates.open(agentId);
                return {
                    kind: 'ask',
                    reason: decision.reason ?? GATE_DENY_REASON,
                    displayReason: GATE_ASK_REASON,
                };
            }
            if (options.mode === 'warn' && state === 'closed' && isMutatingTool(exec?.name ?? '')) {
                options.onWarning?.(exec.name, agentId);
            }
        }
        return next();
    });
    // 新用户消息到达 → 该 agent 的任务门禁重置为 closed（R1/R6 的入口）。
    ctx.on('agent/inbox/inserted', (payload) => {
        if (options.mode === 'off')
            return;
        if (payload?.message?.role !== 'user')
            return;
        const agentId = payload?.agent?.id ?? '';
        if (agentId === '' || !isRootAgent(ctx, agentId))
            return;
        const text = extractMessageText(payload);
        if (text !== '' && options.shouldResetOnMessage && !options.shouldResetOnMessage(text))
            return;
        gates.close(agentId);
    });
}
