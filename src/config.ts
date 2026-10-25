/**
 * 插件配置的类型定义与归一化。
 *
 * 这里刻意不 import Schemastery：单测可以直接引用本模块，
 * 只有 `configSchema.ts`（设置界面用的 schema）才依赖宿主提供的 `@deepseek-ai/schemastery`。
 */
import { DEFAULT_BYPASS_KEYWORDS } from './judge/heuristics.js'

/** 门禁档位：off=不拦截、warn=只记录、strict=拦截变更类工具、ask=先弹卡片问用户。 */
export type GateMode = 'off' | 'warn' | 'strict' | 'ask'

/** 项目层记忆的落点：project=跟着当前工作区走、global=全局共享一份。 */
export type MemoryScope = 'project' | 'global'

/** 追问力度。 */
export type Intensity = 'gentle' | 'standard' | 'grill'

/** 归一化后的插件配置。 */
export interface GrillConfig {
  /** 总开关（R4）：false 时任何任务都不触发提问，也不拦截。 */
  enabled: boolean
  /** 门禁档位。 */
  gateMode: GateMode
  /** 每轮最多问几个问题（R2）。 */
  maxQuestionsPerRound: number
  /** 最多追问几轮（R2）。 */
  maxRounds: number
  /** 追问力度。 */
  intensity: Intensity
  /** 跳过关键词（R4）。 */
  bypassKeywords: string[]
  /** 是否启用两层记忆（R5）。 */
  memoryEnabled: boolean
  /** 项目层记忆落在哪里（0.1.4 新增：有些项目不想被写进 .dsh/）。 */
  memoryScope: MemoryScope
}

/** 默认配置（与工作表 3.7 的默认值一致）。 */
export const DEFAULT_CONFIG: GrillConfig = {
  enabled: true,
  gateMode: 'warn',
  maxQuestionsPerRound: 3,
  maxRounds: 3,
  intensity: 'standard',
  bypassKeywords: [...DEFAULT_BYPASS_KEYWORDS],
  memoryEnabled: true,
  memoryScope: 'project',
}

/** 取整并夹到 [min, max]；非法值返回 fallback。 */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(num) || !Number.isInteger(num)) return fallback
  return Math.min(max, Math.max(min, num))
}

/** 读布尔；非布尔返回 fallback。 */
function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** 读枚举；不在白名单内返回 fallback。 */
function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

/** 读字符串数组；接受单个字符串；非法返回 fallback。 */
function pickStringList(value: unknown, fallback: string[]): string[] {
  if (typeof value === 'string') {
    const parts = value
      .split(/[,，\n]/)
      .map((item) => item.trim())
      .filter((item) => item !== '')
    return parts.length > 0 ? parts : [...fallback]
  }
  if (Array.isArray(value)) {
    const parts = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    return parts.length > 0 ? parts : [...fallback]
  }
  return [...fallback]
}

/**
 * 把任意来源的配置归一化成合法配置（脏数据一律退回默认值，不抛错）。
 * @param raw 来自 cordis.yml / 设置界面的原始配置。
 */
export function normalizeConfig(raw: unknown): GrillConfig {
  const input = (raw ?? {}) as Record<string, unknown>
  return {
    enabled: pickBoolean(input.enabled, DEFAULT_CONFIG.enabled),
    gateMode: pickEnum(input.gateMode, ['off', 'warn', 'strict', 'ask'] as const, DEFAULT_CONFIG.gateMode),
    maxQuestionsPerRound: clampInt(input.maxQuestionsPerRound, 1, 6, DEFAULT_CONFIG.maxQuestionsPerRound),
    maxRounds: clampInt(input.maxRounds, 1, 10, DEFAULT_CONFIG.maxRounds),
    intensity: pickEnum(input.intensity, ['gentle', 'standard', 'grill'] as const, DEFAULT_CONFIG.intensity),
    bypassKeywords: pickStringList(input.bypassKeywords, DEFAULT_CONFIG.bypassKeywords),
    memoryEnabled: pickBoolean(input.memoryEnabled, DEFAULT_CONFIG.memoryEnabled),
    memoryScope: pickEnum(input.memoryScope, ['project', 'global'] as const, DEFAULT_CONFIG.memoryScope),
  }
}
