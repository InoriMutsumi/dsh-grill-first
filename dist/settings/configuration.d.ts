import type { Settings } from './bridge.js';
interface Entry {
    options: {
        id: string;
        name?: string;
    };
    fiber?: {
        config?: unknown;
    };
}
export interface ConfigurationEditor {
    entries(): Entry[];
    configuration(): Array<{
        entry: Entry;
        inherited: Record<string, unknown>;
        override: Record<string, unknown>;
    }>;
    edit(entry: Entry, change: (current: Record<string, unknown>, inherited: Record<string, unknown>) => Record<string, unknown>): Promise<void>;
}
/** Ordinary configuration must use Loader reconciliation, not volatile-only SettingsForms. */
export declare function createConfigurationSettings(editor: ConfigurationEditor, pluginName: string): Settings;
export {};
