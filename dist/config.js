/**
 * 插件配置的类型定义与归一化。
 *
 * 这里刻意不 import Schemastery：单测可以直接引用本模块，
 * 只有 `configSchema.ts`（设置界面用的 schema）才依赖宿主提供的 `@deepseek-ai/schemastery`。
 */
import { DEFAULT_BYPASS_KEYWORDS } from './judge/heuristics.js';
/** 默认配置（与工作表 3.7 的默认值一致）。 */
export const DEFAULT_CONFIG = {
    enabled: true,
    gateMode: 'warn',
    maxQuestionsPerRound: 3,
    maxRounds: 3,
    intensity: 'standard',
    bypassKeywords: [...DEFAULT_BYPASS_KEYWORDS],
    memoryEnabled: true,
    memoryScope: 'project',
};
/** 取整并夹到 [min, max]；非法值返回 fallback。 */
function clampInt(value, min, max, fallback) {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num) || !Number.isInteger(num))
        return fallback;
    return Math.min(max, Math.max(min, num));
}
/** 读布尔；非布尔返回 fallback。 */
function pickBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}
/** 读枚举；不在白名单内返回 fallback。 */
function pickEnum(value, allowed, fallback) {
    return typeof value === 'string' && allowed.includes(value) ? value : fallback;
}
/** 读字符串数组；接受单个字符串；非法返回 fallback。 */
function pickStringList(value, fallback) {
    if (typeof value === 'string') {
        const parts = value
            .split(/[,，\n]/)
            .map((item) => item.trim())
            .filter((item) => item !== '');
        return parts.length > 0 ? parts : [...fallback];
    }
    if (Array.isArray(value)) {
        const parts = value.filter((item) => typeof item === 'string' && item.trim() !== '');
        return parts.length > 0 ? parts : [...fallback];
    }
    return [...fallback];
}
/**
 * 把任意来源的配置归一化成合法配置（脏数据一律退回默认值，不抛错）。
 * @param raw 来自 cordis.yml / 设置界面的原始配置。
 */
export function normalizeConfig(raw) {
    const input = (raw ?? {});
    return {
        enabled: pickBoolean(input.enabled, DEFAULT_CONFIG.enabled),
        gateMode: pickEnum(input.gateMode, ['off', 'warn', 'strict', 'ask'], DEFAULT_CONFIG.gateMode),
        maxQuestionsPerRound: clampInt(input.maxQuestionsPerRound, 1, 6, DEFAULT_CONFIG.maxQuestionsPerRound),
        maxRounds: clampInt(input.maxRounds, 1, 10, DEFAULT_CONFIG.maxRounds),
        intensity: pickEnum(input.intensity, ['gentle', 'standard', 'grill'], DEFAULT_CONFIG.intensity),
        bypassKeywords: pickStringList(input.bypassKeywords, DEFAULT_CONFIG.bypassKeywords),
        memoryEnabled: pickBoolean(input.memoryEnabled, DEFAULT_CONFIG.memoryEnabled),
        memoryScope: pickEnum(input.memoryScope, ['project', 'global'], DEFAULT_CONFIG.memoryScope),
    };
}
