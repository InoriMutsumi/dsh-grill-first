/**
 * 解析"当前会话的工作区根目录"——项目层记忆要落在用户真正在做的项目里。
 *
 * 解析顺序（阶段 1 实测的可用来源）：
 * 1. `DSH_GRILL_WORKSPACE` 环境变量（测试/特殊部署用，优先级最高）；
 * 2. `agent.session.header.cwd`（DSH 会话头里记录的 cwd，就是会话工作区）；
 * 3. `sandboxPolicy.resolve({ session }).workspaceRoot`（策略服务给的权威根目录）；
 * 4. `process.cwd()` 兜底。
 */
import path from 'node:path';
/** 取出会话头里的 cwd（拿不到就返回 undefined）。 */
function sessionCwd(agent) {
    const cwd = agent?.session?.header?.cwd;
    return typeof cwd === 'string' && cwd.trim() !== '' ? cwd : undefined;
}
/**
 * 解析工作区根目录（永远返回绝对路径）。
 * @param ctx 插件上下文（用于取 sandboxPolicy 服务）。
 * @param agent 当前 agent（可选，用于读会话 cwd）。
 */
export function resolveWorkspaceRoot(ctx, agent) {
    const explicit = process.env.DSH_GRILL_WORKSPACE;
    if (typeof explicit === 'string' && explicit.trim() !== '')
        return path.resolve(explicit);
    const cwd = sessionCwd(agent);
    if (cwd)
        return path.resolve(cwd);
    const policy = ctx.get('sandboxPolicy');
    if (policy && typeof policy.resolve === 'function') {
        try {
            const resolved = policy.resolve(agent?.session ? { session: agent.session } : {});
            const root = resolved?.workspaceRoot;
            if (typeof root === 'string' && root.trim() !== '')
                return path.resolve(root);
        }
        catch {
            // 策略服务解析失败就退到 cwd，不影响澄清流程。
        }
    }
    return path.resolve(process.cwd());
}
