/**
 * 设置界面用的配置 schema（7 个配置项，工作表 3.7）。
 *
 * Schemastery 由 DSH 宿主提供：这里声明为 `peerDependencies`（与已装插件 dsh-univer-office 一致——
 * 它的入口 `lib/index.js` 顶部就是 `import z from "@deepseek-ai/schemastery"`）。
 * 开发期从 npm 安装同版本（`@deepseek-ai/schemastery@3.18.4`）以拿到真实类型，不再手写占位声明。
 * 故意与 `config.ts` 分开：本文件是唯一依赖宿主的模块，单测只引 `config.ts`。
 */
import z from '@deepseek-ai/schemastery';
/** 插件配置 schema：改了这里，设置界面与 cordis.yml 校验同时生效。 */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    enabled: z<boolean, boolean, "defined">;
    gateMode: z<"off" | "warn" | "strict" | "ask", "off" | "warn" | "strict" | "ask", "defined">;
    maxQuestionsPerRound: z<number, number, "defined">;
    maxRounds: z<number, number, "defined">;
    intensity: z<"gentle" | "standard" | "grill", "gentle" | "standard" | "grill", "defined">;
    bypassKeywords: z<string[], string[], "defined">;
    researchMode: z<"off" | "auto" | "always", "off" | "auto" | "always", "defined">;
    researchDepth: z<"quick" | "deep", "quick" | "deep", "defined">;
    memoryEnabled: z<boolean, boolean, "defined">;
    memoryScope: z<"project" | "global", "project" | "global", "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: z<boolean, boolean, "defined">;
    gateMode: z<"off" | "warn" | "strict" | "ask", "off" | "warn" | "strict" | "ask", "defined">;
    maxQuestionsPerRound: z<number, number, "defined">;
    maxRounds: z<number, number, "defined">;
    intensity: z<"gentle" | "standard" | "grill", "gentle" | "standard" | "grill", "defined">;
    bypassKeywords: z<string[], string[], "defined">;
    researchMode: z<"off" | "auto" | "always", "off" | "auto" | "always", "defined">;
    researchDepth: z<"quick" | "deep", "quick" | "deep", "defined">;
    memoryEnabled: z<boolean, boolean, "defined">;
    memoryScope: z<"project" | "global", "project" | "global", "defined">;
}>>, "plain">;
