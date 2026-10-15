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
    'grill_memory',
];
/** 拦截时给模型看的拒绝文案（工作表 3.6 原文）。 */
export const GATE_DENY_REASON = "需求尚未确认：请先调用 grill_confirm 完成需求确认，或让用户说'直接做'跳过。";
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
    if (input.mode !== 'strict')
        return { action: 'allow' };
    if (input.state !== 'closed')
        return { action: 'allow' };
    if (!isMutatingTool(input.toolName))
        return { action: 'allow' };
    return { action: 'deny', reason: GATE_DENY_REASON };
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
        gates.close(agentId);
    });
}
