import { Config } from './configSchema.js';
import type { GrillContext } from './types.js';
/** 插件名。 */
export declare const name = "dsh-grill-first";
/** 硬依赖：工具注册服务（缺失则插件不挂载）。 */
export declare const inject: string[];
/** 设置界面用的配置 schema（7 个配置项）。 */
export { Config };
/**
 * 插件装配入口。
 * @param ctx Cordis 上下文。
 * @param rawConfig 来自设置界面 / cordis.yml 的原始配置。
 */
export declare function apply(ctx: GrillContext, rawConfig: unknown): void;
