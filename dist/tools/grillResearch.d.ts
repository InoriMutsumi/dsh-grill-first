import type { GrillConfig } from '../config.js';
import type { ToolDefinition } from '../types.js';
/** 只发送明确的公开搜索词；实现选择仍由用户确认的需求约束。 */
export declare function createGrillResearchTool(config: () => GrillConfig): ToolDefinition;
