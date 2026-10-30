/** 兼容旧快照：旧调用者可以省略新字段。磁盘读取后总会补齐。 */
export interface GlobalPreference {
    text: string;
    tags: string[];
    updated: number;
    id?: string;
    source?: string;
    enabled?: boolean;
}
export interface Preference extends GlobalPreference {
    id: string;
    source: string;
    enabled: boolean;
}
export interface GlobalMemory {
    preferences: GlobalPreference[];
}
export interface HistoryEntry {
    task: string;
    requirements: string;
    date: string;
}
export interface ProjectMemory {
    project_context: string[];
    history: HistoryEntry[];
    preferences?: GlobalPreference[];
}
export interface MemorySnapshot {
    global: GlobalMemory;
    project: ProjectMemory;
}
export type MemoryScope = 'global' | 'project' | 'all';
export type ProjectScope = 'project' | 'global';
export type PreferenceScope = 'global' | 'project';
export interface PreferenceList {
    scope: PreferenceScope;
    revision: string;
    preferences: Preference[];
}
export type PreferenceMutation = {
    action: 'add';
    text: string;
    tags?: string[];
    source?: string;
    enabled?: boolean;
    revision: string;
} | {
    action: 'update';
    id: string;
    text: string;
    tags?: string[];
    source?: string;
    revision: string;
} | {
    action: 'toggle';
    id: string;
    enabled: boolean;
    revision: string;
} | {
    action: 'delete';
    id: string;
    revision: string;
};
export declare class PreferenceConflictError extends Error {
    readonly code = "REVISION_CONFLICT";
    constructor();
}
export declare class MemoryReadError extends Error {
    readonly file: string;
    readonly code = "MEMORY_READ_ERROR";
    constructor(file: string, options?: ErrorOptions);
}
export declare const MAX_HISTORY = 100;
export declare const SUMMARY_LIMIT = 500;
/** 按 JavaScript UTF-16 长度计，去首尾空白后校验。迁移不截断旧数据。 */
export declare const MAX_PREFERENCE_LENGTH = 2000;
export declare function emptyGlobal(): GlobalMemory;
export declare function emptyProject(): ProjectMemory;
export declare function emptySnapshot(): MemorySnapshot;
export declare function resolveWorkspace(workspaceRoot?: string): string;
export declare function globalMemoryPath(): string;
export declare function projectMemoryPath(workspaceRoot?: string, scope?: ProjectScope): string;
/** 兼容旧读取的容错；管理读取和所有写入则传播错误，避免把坏文件覆盖为空。 */
export declare function loadMemory(workspaceRoot?: string, scope?: ProjectScope): Promise<MemorySnapshot>;
export declare function listPreferences(workspaceRoot: string | undefined, scope: PreferenceScope, projectScope?: ProjectScope): Promise<PreferenceList>;
export declare function mutatePreference(workspaceRoot: string | undefined, scope: PreferenceScope, mutation: PreferenceMutation, projectScope?: ProjectScope): Promise<PreferenceList>;
/** 旧 API：全局偏好按规范化文本去重；不重新启用用户主动停用的偏好。 */
export declare function savePreference(text: string, tags: string[], workspaceRoot?: string): Promise<void>;
export declare function saveProjectContext(text: string, workspaceRoot?: string, scope?: ProjectScope): Promise<void>;
export declare function saveHistory(task: string, requirements: string, workspaceRoot?: string, scope?: ProjectScope): Promise<void>;
/** 新增可选 projectScope 参数，旧调用保持原有默认行为。坏文件需要人工恢复，清除也不覆盖。 */
export declare function forget(scope: MemoryScope, workspaceRoot?: string, projectScope?: ProjectScope): Promise<void>;
export declare function summarize(memory: MemorySnapshot): string;
