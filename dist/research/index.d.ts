/** 独立 GitHub REST 调研：只发送显式关键词，不读工作区、不安装或执行仓库代码。 */
export type ResearchMode = 'off' | 'auto' | 'always';
export type ResearchDepth = 'quick' | 'deep';
export interface ResearchOptions {
    keywords: readonly string[];
    mode?: ResearchMode;
    depth?: ResearchDepth;
    limit?: 2 | 3;
    /** auto 模式由调用方判断是否适合调研；缺省不联网。 */
    autoEligible?: boolean;
    /** 每次请求（含读取响应体）的超时，夹到 1–15000ms。 */
    timeoutMs?: number;
    /** 单次响应字节上限，夹到 256–524288。 */
    maxResponseBytes?: number;
}
export interface ResearchDependencies {
    fetch?: typeof globalThis.fetch;
    now?: () => Date;
}
export type ResearchIssueCode = 'invalid-input' | 'timeout' | 'rate-limit' | 'http' | 'network' | 'too-large' | 'invalid-response';
export interface ResearchIssue {
    code: ResearchIssueCode;
    url?: string;
    status?: number;
    /** 原样保留有界的服务端提示，不自动等待或重试。 */
    retryAfter?: string;
}
export interface ResearchEvidence {
    kind: 'search' | 'metadata' | 'readme' | 'license' | 'releases';
    url: string;
    checkedAt: string;
    status: 'verified' | 'unavailable';
}
export interface ResearchedRepository {
    fullName: string;
    url: string;
    checkedAt: string;
    description: string;
    stars: number | null;
    archived: boolean | null;
    pushedAt: string | null;
    license: {
        spdxId: string;
        compatibility: 'not-assessed';
    };
    readme: {
        text: string;
        trust: 'external-untrusted';
        truncated: boolean;
    } | null;
    releases: Array<{
        tag: string;
        publishedAt: string | null;
    }>;
    evidence: ResearchEvidence[];
}
export interface ResearchResult {
    status: 'disabled' | 'skipped' | 'ok' | 'partial' | 'unavailable';
    checkedAt: string;
    repositories: ResearchedRepository[];
    evidence: ResearchEvidence[];
    issues: ResearchIssue[];
    /** 必须与摘录一起呈现给模型。 */
    notice: string;
}
/** 固定 GitHub host、禁止重定向、有限请求数量与响应大小；错误降级为结构化结果。 */
export declare function researchGitHub(options: ResearchOptions, dependencies?: ResearchDependencies): Promise<ResearchResult>;
