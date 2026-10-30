import type { GrillContext } from '../types.js';
import { type PreferenceMutation } from '../memory/store.js';
export declare const SETTINGS_CHANNEL = "/dsh-grill-first-settings";
/** Existing Connection RPC extension; this channel is never registered as an LLM tool. */
export interface BrowserPeer {
    principal: {
        kind: string;
    };
    signal?: AbortSignal;
}
export type RpcResult = {
    ok: true;
    value: unknown;
} | {
    ok: false;
    error: {
        code: string;
        message: string;
        details: object;
    };
};
export interface Connection {
    readonly browserPeer: BrowserPeer;
    rpc: {
        handle(channel: string, handler: (endpoint: string, payload: unknown, signal: AbortSignal, peer: BrowserPeer) => Promise<RpcResult>): () => Promise<void>;
    };
}
export interface Settings {
    describe(options?: {
        redactSecrets?: boolean;
    }): {
        ns: string;
        value: unknown;
        revision: number;
    }[];
    update(ns: string, patch: object, expectedRevision?: number): Promise<void>;
}
export interface WorkspaceRegistry {
    list(): {
        id: string;
        title: string;
        path: string;
    }[];
    get(id: string): {
        id: string;
        title: string;
        path: string;
        status(): Promise<'ok' | 'missing-dir'>;
    } | undefined;
}
export interface SettingsBridgeOptions {
    /** Exact settings namespace belonging to this plugin instance; never inferred from a client payload. */
    namespace: string | (() => string);
    projectScope?: () => 'project' | 'global';
    settings?: Settings;
}
export declare function validateSettingsPatch(value: unknown): Record<string, unknown>;
export declare function validateMutation(value: unknown): PreferenceMutation;
export declare function createSettingsHandler(connection: Connection, settings: Settings, workspaces: WorkspaceRegistry, options: SettingsBridgeOptions): (endpoint: string, payload: unknown, signal: AbortSignal, peer: BrowserPeer) => Promise<RpcResult>;
/** Call inside the owning plugin entry. Cordis effects dispose the channel on reload. */
export declare function installSettingsBridge(ctx: GrillContext, options: SettingsBridgeOptions): void;
