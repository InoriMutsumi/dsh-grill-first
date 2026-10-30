import { createHash } from 'node:crypto';
import { normalizeConfig } from '../config.js';
/** Ordinary configuration must use Loader reconciliation, not volatile-only SettingsForms. */
export function createConfigurationSettings(editor, pluginName) {
    function snapshot() {
        const rows = editor.configuration().filter(row => row.entry.options.name === pluginName);
        if (rows.length !== 1)
            throw new Error('设置入口需要唯一的已激活插件实例');
        const row = rows[0];
        const ns = row.entry.options.id;
        const fingerprint = JSON.stringify([row.inherited, row.override, row.entry.fiber?.config]);
        // Stable across plugin remounts; do not reset revision counters on every save.
        const revision = Number.parseInt(createHash('sha256').update(fingerprint).digest('hex').slice(0, 12), 16);
        return { row, ns, revision, value: normalizeConfig(row.entry.fiber?.config ?? { ...row.inherited, ...row.override }) };
    }
    return {
        describe: () => { const { ns, revision, value } = snapshot(); return [{ ns, revision, value }]; },
        update: async (ns, patch, expectedRevision) => {
            const initial = snapshot();
            const check = () => {
                const current = snapshot();
                if (current.ns !== ns || current.row.entry !== initial.row.entry || current.revision !== expectedRevision) {
                    throw Object.assign(new Error('设置已被其他页面修改，请重新载入'), { code: 'REVISION_CONFLICT' });
                }
            };
            check();
            await editor.edit(initial.row.entry, current => { check(); return { ...current, ...patch }; });
        },
    };
}
