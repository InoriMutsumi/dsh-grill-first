/** 两层记忆存储。memoryEnabled 由调用者管控，本模块不读取插件配置。
 * 所有写入按文件在同进程串行执行；唯一临时文件 + rename 原子替换。
 * 不提供跨进程锁；revision 用于管理界面的乐观冲突检测。
 */
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
export class PreferenceConflictError extends Error {
    code = 'REVISION_CONFLICT';
    constructor() { super('偏好已被其他操作修改，请重新读取后重试'); this.name = 'PreferenceConflictError'; }
}
export class MemoryReadError extends Error {
    file;
    code = 'MEMORY_READ_ERROR';
    constructor(file, options) {
        super(`无法安全读取记忆文件，已拒绝覆盖：${file}`, options);
        this.file = file;
        this.name = 'MemoryReadError';
    }
}
export const MAX_HISTORY = 100;
export const SUMMARY_LIMIT = 500;
/** 按 JavaScript UTF-16 长度计，去首尾空白后校验。迁移不截断旧数据。 */
export const MAX_PREFERENCE_LENGTH = 2000;
export function emptyGlobal() { return { preferences: [] }; }
export function emptyProject() { return { project_context: [], history: [], preferences: [] }; }
export function emptySnapshot() { return { global: emptyGlobal(), project: emptyProject() }; }
export function resolveWorkspace(workspaceRoot) {
    return path.resolve(workspaceRoot?.trim() ? workspaceRoot : process.cwd());
}
export function globalMemoryPath() {
    const override = process.env.DSH_GRILL_HOME;
    return path.join(override?.trim() ? path.resolve(override) : path.join(homedir(), '.dsh', 'grill-first'), 'global.json');
}
export function projectMemoryPath(workspaceRoot, scope = 'project') {
    if (scope === 'global')
        return path.join(path.dirname(globalMemoryPath()), 'project.json');
    return path.join(resolveWorkspace(workspaceRoot), '.dsh', 'grill-first', 'memory.json');
}
function normalizeKey(text) {
    return text.replace(/\s+/g, '').replace(/[。；;，,！!？?]+$/g, '').toLowerCase();
}
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
async function readDocument(file) {
    let raw;
    try {
        raw = await readFile(file, 'utf8');
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return { data: {}, revision: 'missing' };
        throw new MemoryReadError(file, { cause: error });
    }
    try {
        // 只恢复旧版本已知的尾部 literal \\n 缺陷，不猜测修复其他坏 JSON。
        let data;
        try {
            data = JSON.parse(raw);
        }
        catch {
            data = JSON.parse(raw.replace(/(?:\\n)+\s*$/, ''));
        }
        if (!isRecord(data))
            throw new Error('记忆根节点必须是对象');
        for (const key of ['preferences', 'project_context', 'history']) {
            if (data[key] !== undefined && !Array.isArray(data[key]))
                throw new Error(`${key} 必须是数组`);
        }
        return { data, revision: hash(raw) };
    }
    catch (error) {
        throw new MemoryReadError(file, { cause: error });
    }
}
const pending = new Map();
async function locked(file, operation) {
    const key = process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);
    const previous = pending.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    pending.set(key, current);
    try {
        return await current;
    }
    finally {
        if (pending.get(key) === current)
            pending.delete(key);
    }
}
async function writeJsonAtomic(file, value) {
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${randomUUID()}.tmp`;
    const raw = `${JSON.stringify(value, null, 2)}\n`;
    try {
        await writeFile(tmp, raw, { encoding: 'utf8', flag: 'wx' });
        await rename(tmp, file);
    }
    finally {
        await unlink(tmp).catch((error) => { if (error.code !== 'ENOENT')
            throw error; });
    }
    return hash(raw);
}
function preferences(data, scope) {
    const list = Array.isArray(data.preferences) ? data.preferences : [];
    const used = new Set();
    return list.flatMap((item, index) => {
        const value = typeof item === 'string' ? { text: item } : item;
        if (!isRecord(value) || typeof value.text !== 'string' || !value.text.trim())
            return [];
        let id = typeof value.id === 'string' && value.id.trim() ? value.id : `legacy-${hash(`${scope}:${index}:${value.text}`).slice(0, 24)}`;
        if (used.has(id))
            id = `legacy-${hash(`${scope}:${index}:${id}:${value.text}`).slice(0, 24)}`;
        used.add(id);
        return [{
                ...value,
                id,
                text: value.text.trim(),
                tags: cleanTags(value.tags),
                source: typeof value.source === 'string' && value.source.trim() ? value.source : 'legacy',
                enabled: value.enabled !== false,
                updated: typeof value.updated === 'number' && Number.isFinite(value.updated) ? value.updated : 0,
            }];
    });
}
function cleanTags(tags) {
    return Array.isArray(tags) ? [...new Set(tags.filter((tag) => typeof tag === 'string' && !!tag.trim()).map(tag => tag.trim()))] : [];
}
function project(data) {
    return {
        project_context: Array.isArray(data.project_context) ? data.project_context.filter((v) => typeof v === 'string' && !!v.trim()) : [],
        history: Array.isArray(data.history) ? data.history.flatMap((v) => {
            if (!isRecord(v))
                return [];
            const task = typeof v.task === 'string' ? v.task : '';
            const requirements = typeof v.requirements === 'string' ? v.requirements : '';
            return task.trim() || requirements.trim() ? [{ task, requirements, date: typeof v.date === 'string' ? v.date : '' }] : [];
        }) : [],
        preferences: preferences(data, 'project'),
    };
}
/** 兼容旧读取的容错；管理读取和所有写入则传播错误，避免把坏文件覆盖为空。 */
export async function loadMemory(workspaceRoot, scope = 'project') {
    const safeRead = async (file) => { try {
        return (await readDocument(file)).data;
    }
    catch {
        return {};
    } };
    const [global, local] = await Promise.all([safeRead(globalMemoryPath()), safeRead(projectMemoryPath(workspaceRoot, scope))]);
    return { global: { preferences: preferences(global, 'global') }, project: project(local) };
}
function preferenceFile(workspaceRoot, scope, projectScope) {
    if (scope !== 'global' && scope !== 'project')
        throw new TypeError('scope 必须是 global 或 project');
    if (projectScope !== 'global' && projectScope !== 'project')
        throw new TypeError('projectScope 必须是 global 或 project');
    return scope === 'global' ? globalMemoryPath() : projectMemoryPath(workspaceRoot, projectScope);
}
export async function listPreferences(workspaceRoot, scope, projectScope = 'project') {
    const file = preferenceFile(workspaceRoot, scope, projectScope);
    return locked(file, async () => {
        const doc = await readDocument(file);
        return { scope, revision: doc.revision, preferences: preferences(doc.data, scope) };
    });
}
function validateText(text) {
    if (typeof text !== 'string' || !text.trim() || text.trim().length > MAX_PREFERENCE_LENGTH) {
        throw new RangeError(`偏好内容长度必须为 1–${MAX_PREFERENCE_LENGTH} 字符`);
    }
    return text.trim();
}
export async function mutatePreference(workspaceRoot, scope, mutation, projectScope = 'project') {
    const file = preferenceFile(workspaceRoot, scope, projectScope);
    return locked(file, async () => {
        const doc = await readDocument(file);
        if (!mutation || typeof mutation.revision !== 'string' || mutation.revision !== doc.revision)
            throw new PreferenceConflictError();
        const list = preferences(doc.data, scope);
        const now = Date.now();
        if (mutation.action === 'add') {
            if (mutation.enabled !== undefined && typeof mutation.enabled !== 'boolean')
                throw new TypeError('enabled 必须为布尔值');
            list.push({ id: randomUUID(), text: validateText(mutation.text), tags: cleanTags(mutation.tags), source: mutation.source?.trim() || 'manual', enabled: mutation.enabled ?? true, updated: now });
        }
        else {
            const index = list.findIndex(item => item.id === mutation.id);
            const item = list[index];
            if (!item)
                throw new RangeError('偏好不存在，请重新读取列表');
            switch (mutation.action) {
                case 'update':
                    item.text = validateText(mutation.text);
                    if (mutation.tags !== undefined)
                        item.tags = cleanTags(mutation.tags);
                    if (mutation.source !== undefined)
                        item.source = mutation.source.trim() || 'manual';
                    item.updated = Math.max(now, item.updated + 1);
                    break;
                case 'toggle':
                    if (typeof mutation.enabled !== 'boolean')
                        throw new TypeError('enabled 必须为布尔值');
                    item.enabled = mutation.enabled;
                    item.updated = Math.max(now, item.updated + 1);
                    break;
                case 'delete':
                    list.splice(index, 1);
                    break;
                default: throw new TypeError('未知偏好操作');
            }
        }
        const revision = await writeJsonAtomic(file, { ...doc.data, preferences: list });
        return { scope, revision, preferences: list };
    });
}
/** 旧 API：全局偏好按规范化文本去重；不重新启用用户主动停用的偏好。 */
export async function savePreference(text, tags, workspaceRoot) {
    if (!text.trim())
        return;
    const trimmed = validateText(text);
    const file = globalMemoryPath();
    await locked(file, async () => {
        const doc = await readDocument(file);
        const list = preferences(doc.data, 'global');
        const existing = list.find(item => normalizeKey(item.text) === normalizeKey(trimmed));
        if (existing) {
            existing.text = trimmed;
            existing.tags = [...new Set([...existing.tags, ...cleanTags(tags)])];
            existing.updated = Math.max(Date.now(), existing.updated + 1);
        }
        else
            list.push({ id: randomUUID(), text: trimmed, tags: cleanTags(tags), source: 'learned', enabled: true, updated: Date.now() });
        await writeJsonAtomic(file, { ...doc.data, preferences: list });
    });
    void workspaceRoot;
}
export async function saveProjectContext(text, workspaceRoot, scope = 'project') {
    const trimmed = text.trim();
    if (!trimmed)
        return;
    const file = projectMemoryPath(workspaceRoot, scope);
    await locked(file, async () => {
        const doc = await readDocument(file);
        const context = project(doc.data).project_context;
        if (!context.some(value => normalizeKey(value) === normalizeKey(trimmed)))
            context.push(trimmed);
        await writeJsonAtomic(file, { ...doc.data, project_context: context });
    });
}
export async function saveHistory(task, requirements, workspaceRoot, scope = 'project') {
    const file = projectMemoryPath(workspaceRoot, scope);
    await locked(file, async () => {
        const doc = await readDocument(file);
        const history = project(doc.data).history;
        history.push({ task: task.trim().slice(0, 200), requirements: requirements.trim().slice(0, 2000), date: new Date().toISOString().slice(0, 10) });
        await writeJsonAtomic(file, { ...doc.data, history: history.slice(-MAX_HISTORY) });
    });
}
/** 新增可选 projectScope 参数，旧调用保持原有默认行为。坏文件需要人工恢复，清除也不覆盖。 */
export async function forget(scope, workspaceRoot, projectScope = 'project') {
    if (!['global', 'project', 'all'].includes(scope))
        throw new TypeError('未知记忆范围');
    const clear = (file, empty) => locked(file, async () => {
        await readDocument(file);
        await writeJsonAtomic(file, empty);
    });
    if (scope === 'global' || scope === 'all')
        await clear(globalMemoryPath(), emptyGlobal());
    if (scope === 'project' || scope === 'all')
        await clear(projectMemoryPath(workspaceRoot, projectScope), emptyProject());
}
function clip(text, limit) {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}
export function summarize(memory) {
    const sections = [];
    for (const [title, items] of [['全局偏好', memory.global.preferences], ['项目偏好', memory.project.preferences ?? []]]) {
        const enabled = items.filter(item => item.enabled !== false).slice(-5);
        if (enabled.length)
            sections.push(`【${title}】\n${enabled.map(item => `- ${clip(item.text, 40)}`).join('\n')}`);
    }
    const context = memory.project.project_context.slice(-5);
    if (context.length)
        sections.push(`【项目背景】\n${context.map(text => `- ${clip(text, 60)}`).join('\n')}`);
    const history = memory.project.history.slice(-3);
    if (history.length)
        sections.push(`【历史需求】\n${history.map(item => `- ${clip(item.task, 30)} → ${clip(item.requirements, 60)}`).join('\n')}`);
    const joined = sections.join('\n');
    return joined.length <= SUMMARY_LIMIT ? joined : `${joined.slice(0, SUMMARY_LIMIT - 1)}…`;
}
