import type { GrillAgent, GrillContext } from './types.js';
/**
 * 解析工作区根目录（永远返回绝对路径）。
 * @param ctx 插件上下文（用于取 sandboxPolicy 服务）。
 * @param agent 当前 agent（可选，用于读会话 cwd）。
 */
export declare function resolveWorkspaceRoot(ctx: GrillContext, agent?: GrillAgent): string;
