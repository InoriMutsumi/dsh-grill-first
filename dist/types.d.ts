/**
 * DSH 宿主注入的最小接口声明（阶段 1 实测契约，来源：cordis_inspect_query 的
 * Service/Event provider + 已装插件 `dsh-ops` 的实例代码）。
 *
 * 本文件只声明本插件真正用到的部分，避免依赖宿主内部类型包。
 */
/** 会话头里本插件用得到的字段（取自沙箱策略服务的 SessionHeader 契约）。 */
export interface GrillSessionHeader {
    /** 会话工作区（项目层记忆的落点）。 */
    cwd?: string;
    /** `subagent` 表示这是派生出来的子会话。 */
    origin?: 'subagent';
    delegationDepth?: number;
}
/** 宿主侧的会话句柄（只用到 header）。 */
export interface GrillSessionHandle {
    readonly header?: GrillSessionHeader;
}
/** 宿主侧的 Agent 句柄；插件用它的 id 做门禁分桶，用 session.header.cwd 定位工作区。 */
export interface GrillAgent {
    readonly id: string;
    readonly session?: GrillSessionHandle;
}
/** 工具执行上下文（`tools/pre-execute` 的 exec 参数同型）。 */
export interface ToolRunContext {
    readonly callId: string;
    readonly name: string;
    readonly agent?: GrillAgent;
    readonly signal?: AbortSignal;
}
/** `tools/pre-execute` 的返回值联合。 */
export interface PreToolDecision {
    kind: 'allow' | 'deny' | 'cancel' | 'ask';
    reason?: string;
    displayReason?: string;
}
/** 工具输出定义：schema 描述返回值形状，render 决定回灌给模型的文本块。 */
export interface ToolOutputDefinition {
    schema: Record<string, unknown>;
    render(args: unknown, value: unknown): unknown[];
}
/** 工具定义（`ctx.tools.register()` 的入参）。 */
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    output: ToolOutputDefinition;
    execute(args: unknown, exec: ToolRunContext): Promise<unknown>;
    isConcurrencySafe?: () => boolean;
}
/** `ctx.tools` 服务。 */
export interface ToolsService {
    register(definition: ToolDefinition): () => void;
}
/** 系统提示段定义。 */
export interface PromptSection {
    name: string;
    order: number;
    text: string | ((context: unknown) => string);
    interpolate?: boolean;
}
/** `ctx.systemPrompt` 服务。 */
export interface SystemPromptService {
    section(section: PromptSection): () => void;
}
/** 结构化提问的选项。 */
export interface AskUserQuestionOption {
    label: string;
    description?: string;
}
/** 结构化提问的单条问题。 */
export interface AskUserQuestionItem {
    id: string;
    question: string;
    detail?: string;
    header?: string;
    options?: AskUserQuestionOption[];
    multiSelect?: boolean;
}
/** `ctx.userQuestions.ask()` 的请求。 */
export interface AskUserQuestionRequest {
    questions: AskUserQuestionItem[];
    agent?: GrillAgent;
    signal?: AbortSignal;
    wait?: {
        callId: string;
        timed?: boolean;
    };
}
/** 结构化提问的单条回答。 */
export interface AskUserQuestionAnswerItem {
    id: string;
    selected: string[];
    custom?: string;
}
/** 结构化提问的回答批次。 */
export interface AskUserQuestionAnswer {
    answers: AskUserQuestionAnswerItem[];
}
/** `ctx.userQuestions` 服务（仅声明本插件用到的 ask）。 */
export interface UserQuestionsService {
    ask(request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer>;
}
/** `ctx.agents` 服务（用于区分"能跟人对话的根 agent"与子 agent）。 */
export interface AgentsService {
    roots(): GrillAgent[];
    list(): GrillAgent[];
}
/** 宿主 logger 的最小面。 */
export interface GrillLogger {
    info(message: string): void;
    warn(message: string): void;
    debug?(message: string): void;
}
/**
 * 插件拿到的 Cordis 上下文（最小面）。
 *
 * 用 any 的理由：`ctx.on` 的回调签名随事件不同而变化（waterfall 事件还多一个 next 参数），
 * 这里无法用单一泛型表达；调用点都有显式参数类型注解兜底。
 */
export interface GrillContext {
    on(event: string, listener: (...args: any[]) => unknown): unknown;
    effect(callback: () => unknown, label?: string): unknown;
    inject(deps: string[], callback: (ctx: GrillContext) => unknown): unknown;
    get(name: string): unknown;
    tools?: ToolsService;
    systemPrompt?: SystemPromptService;
    userQuestions?: UserQuestionsService;
    agents?: AgentsService;
    logger?: GrillLogger;
}
