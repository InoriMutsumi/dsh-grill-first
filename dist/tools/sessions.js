/** agent → 会话 的内存态映射（进程内，不持久化）。 */
export class SessionRegistry {
    sessions = new Map();
    /** 登记/覆盖一个 agent 的当前任务。 */
    start(session) {
        if (!session.agentId)
            return;
        this.sessions.set(session.agentId, { ...session, rounds: session.rounds ?? 0 });
    }
    /** 记一轮追问（用户选"要改"时调用），返回累计轮数。 */
    bumpRound(agentId) {
        const session = this.sessions.get(agentId);
        if (!session)
            return 0;
        session.rounds = (session.rounds ?? 0) + 1;
        return session.rounds;
    }
    /** 读取某个 agent 的当前任务。 */
    get(agentId) {
        return this.sessions.get(agentId);
    }
    /** 结束某个 agent 的澄清会话（确认完成或跳过）。 */
    end(agentId) {
        this.sessions.delete(agentId);
    }
    /** 清空（插件卸载时调用）。 */
    clear() {
        this.sessions.clear();
    }
}
