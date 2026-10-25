/** 门禁档位：off=不拦截、warn=只记录、strict=拦截变更类工具、ask=先弹卡片问用户。 */
export type GateMode = 'off' | 'warn' | 'strict' | 'ask';
/** 项目层记忆的落点：project=跟着当前工作区走、global=全局共享一份。 */
export type MemoryScope = 'project' | 'global';
/** 追问力度。 */
export type Intensity = 'gentle' | 'standard' | 'grill';
/** 归一化后的插件配置。 */
export interface GrillConfig {
    /** 总开关（R4）：false 时任何任务都不触发提问，也不拦截。 */
    enabled: boolean;
    /** 门禁档位。 */
    gateMode: GateMode;
    /** 每轮最多问几个问题（R2）。 */
    maxQuestionsPerRound: number;
    /** 最多追问几轮（R2）。 */
    maxRounds: number;
    /** 追问力度。 */
    intensity: Intensity;
    /** 跳过关键词（R4）。 */
    bypassKeywords: string[];
    /** 是否启用两层记忆（R5）。 */
    memoryEnabled: boolean;
    /** 项目层记忆落在哪里（0.1.4 新增：有些项目不想被写进 .dsh/）。 */
    memoryScope: MemoryScope;
}
/** 默认配置（与工作表 3.7 的默认值一致）。 */
export declare const DEFAULT_CONFIG: GrillConfig;
/**
 * 把任意来源的配置归一化成合法配置（脏数据一律退回默认值，不抛错）。
 * @param raw 来自 cordis.yml / 设置界面的原始配置。
 */
export declare function normalizeConfig(raw: unknown): GrillConfig;
