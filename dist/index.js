/**
 * dsh-grill-first 插件入口：装配两个工具 + 协议提示段 + 需求门禁。
 *
 * 生命周期：DSH 加载插件时调用一次 {@link apply}；`ctx.effect` 内注册的东西
 * 在插件卸载/配置变更重挂载时自动清理。
 */
import { normalizeConfig } from './config.js';
import { Config } from './configSchema.js';
import { GateRegistry, registerGate } from './gate/preExecute.js';
import { PROTOCOL_SECTION_NAME, PROTOCOL_SECTION_ORDER, buildProtocolText } from './prompt/protocol.js';
import { createGrillConfirmTool } from './tools/grillConfirm.js';
import { createGrillStartTool } from './tools/grillStart.js';
import { SessionRegistry } from './tools/sessions.js';
import { resolveWorkspaceRoot } from './workspace.js';
/** 插件名。 */
export const name = 'dsh-grill-first';
/** 硬依赖：工具注册服务（缺失则插件不挂载）。 */
export const inject = ['tools'];
/** 设置界面用的配置 schema（7 个配置项）。 */
export { Config };
/** 注册协议提示段（仅在 enabled=true 时注入）。 */
function installProtocolSection(ctx, config) {
    const text = buildProtocolText({
        maxRounds: config.maxRounds,
        maxQuestionsPerRound: config.maxQuestionsPerRound,
        bypassKeywords: config.bypassKeywords,
        intensity: config.intensity,
    });
    ctx.inject(['systemPrompt'], (scoped) => {
        const systemPrompt = scoped.systemPrompt;
        if (!systemPrompt || typeof systemPrompt.section !== 'function') {
            scoped.logger?.warn('[grill-first] systemPrompt 服务不可用，协议段未注入。');
            return;
        }
        scoped.effect(() => systemPrompt.section({
            name: PROTOCOL_SECTION_NAME,
            order: PROTOCOL_SECTION_ORDER,
            interpolate: false,
            text,
        }), 'dsh-grill-first: protocol section');
    });
}
/**
 * 插件装配入口。
 * @param ctx Cordis 上下文。
 * @param rawConfig 来自设置界面 / cordis.yml 的原始配置。
 */
export function apply(ctx, rawConfig) {
    const config = normalizeConfig(rawConfig);
    const gates = new GateRegistry();
    const sessions = new SessionRegistry();
    const readConfig = () => config;
    const workspaceRoot = (agent) => resolveWorkspaceRoot(ctx, agent);
    ctx.effect(() => {
        const tools = ctx.get('tools');
        if (!tools || typeof tools.register !== 'function') {
            ctx.logger?.warn('[grill-first] tools 服务不可用，工具未注册。');
            return () => { };
        }
        const disposers = [];
        const register = (definition) => {
            const dispose = tools.register(definition);
            if (typeof dispose === 'function')
                disposers.push(dispose);
        };
        register(createGrillStartTool({
            config: readConfig,
            gates,
            sessions,
            workspaceRoot,
            ...(ctx.logger ? { logger: ctx.logger } : {}),
        }));
        register(createGrillConfirmTool({
            config: readConfig,
            gates,
            sessions,
            workspaceRoot,
            questions: () => ctx.get('userQuestions'),
            ...(ctx.logger ? { logger: ctx.logger } : {}),
        }));
        return () => {
            for (const dispose of disposers) {
                try {
                    dispose();
                }
                catch (error) {
                    ctx.logger?.warn(`[grill-first] 卸载工具失败：${error instanceof Error ? error.message : String(error)}`);
                }
            }
            gates.clear();
            sessions.clear();
        };
    }, 'dsh-grill-first: tools');
    // 总开关关闭时既不加协议段，也不挂门禁（R4：Config 可整体关闭，零打扰）。
    if (!config.enabled) {
        ctx.logger?.info?.('[grill-first] 插件已停用（enabled=false），不注入协议段、不挂门禁。');
        return;
    }
    installProtocolSection(ctx, config);
    registerGate(ctx, gates, {
        mode: config.gateMode,
        onWarning: (toolName, agentId) => {
            ctx.logger?.warn(`[grill-first] 需求尚未确认（warn 模式，仅记录未拦截）：${toolName}（agent=${agentId}）`);
        },
    });
}
