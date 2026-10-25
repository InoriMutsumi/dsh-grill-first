/** 全局层的一条通用偏好。 */
export interface GlobalPreference {
    text: string;
    tags: string[];
    updated: number;
}
/** 全局层结构（global.json）。 */
export interface GlobalMemory {
    preferences: GlobalPreference[];
}
/** 项目层的一条历史需求记录。 */
export interface HistoryEntry {
    task: string;
    requirements: string;
    date: string;
}
/** 项目层结构（memory.json）。 */
export interface ProjectMemory {
    project_context: string[];
    history: HistoryEntry[];
}
/** 两层记忆的快照。 */
export interface MemorySnapshot {
    global: GlobalMemory;
    project: ProjectMemory;
}
/** forget() 的作用范围。 */
export type MemoryScope = 'global' | 'project' | 'all';
/** 项目层记忆的落点（0.1.4）：跟着工作区走，或全局共享一份。 */
export type ProjectScope = 'project' | 'global';
/** 项目层历史条目的保留上限（0.1.4 修：以前只增不减，文件会越长越大）。 */
export declare const MAX_HISTORY = 100;
/** 摘要长度上限（字符数），供注入提示用。 */
export declare const SUMMARY_LIMIT = 500;
/** 空全局层。 */
export declare function emptyGlobal(): GlobalMemory;
/** 空项目层。 */
export declare function emptyProject(): ProjectMemory;
/** 空快照。 */
export declare function emptySnapshot(): MemorySnapshot;
/** 解析工作区根目录（未传时用进程 cwd）。 */
export declare function resolveWorkspace(workspaceRoot?: string): string;
/**
 * 全局记忆文件路径。
 *
 * 优先 `DSH_GRILL_HOME` 环境变量（测试与自定义部署用）；否则 `<home>/.dsh/grill-first/global.json`。
 * 阶段 1 实测：DSH 没有把 profile 目录通过环境变量暴露给插件，因此无法可靠定位 profile 配置目录，
 * 固定到 `~/.dsh/grill-first/`（跨 profile 共享用户偏好，语义上也更合理）。
 */
export declare function globalMemoryPath(): string;
/**
 * 项目记忆文件路径。
 * @param workspaceRoot 工作区根目录。
 * @param scope project（默认）= `<workspace>/.dsh/grill-first/memory.json`；
 *   global = 与 global.json 同目录的 `project.json`（不想往项目里写文件时用）。
 */
export declare function projectMemoryPath(workspaceRoot?: string, scope?: ProjectScope): string;
/**
 * 读取两层记忆。
 * @param workspaceRoot 工作区根目录；省略时用 `process.cwd()`。
 */
export declare function loadMemory(workspaceRoot?: string, scope?: ProjectScope): Promise<MemorySnapshot>;
/**
 * 追加一条全局偏好（按文本去重，重复则刷新 updated 时间）。
 * @param text 偏好原文，例如"注释一律用中文"。
 * @param tags 分类标签，例如 `["语言"]`。
 * @param workspaceRoot 工作区根目录（仅用于定位项目层，写入的是全局层）。
 */
export declare function savePreference(text: string, tags: string[], workspaceRoot?: string): Promise<void>;
/**
 * 追加一条项目背景（按文本去重）。
 * @param text 项目背景原文。
 * @param workspaceRoot 工作区根目录。
 */
export declare function saveProjectContext(text: string, workspaceRoot?: string, scope?: ProjectScope): Promise<void>;
/**
 * 追加一条历史需求记录（R3：需求清单只进这里，绝不落盘成需求文件）。
 * @param task 任务原文或摘要。
 * @param requirements 用户确认过的四段式需求清单。
 * @param workspaceRoot 工作区根目录。
 */
export declare function saveHistory(task: string, requirements: string, workspaceRoot?: string, scope?: ProjectScope): Promise<void>;
/**
 * 清除记忆。
 * @param scope `global` 只清全局层、`project` 只清项目层、`all` 两层都清。
 * @param workspaceRoot 工作区根目录。
 */
export declare function forget(scope: MemoryScope, workspaceRoot?: string): Promise<void>;
/**
 * 生成注入提示用的紧凑中文摘要（上限 {@link SUMMARY_LIMIT} 字符）。
 * @param memory 两层记忆快照。
 */
export declare function summarize(memory: MemorySnapshot): string;
