export class SessionRegistry {
    sessions = new Map();
    start(session) {
        if (!session.agentId)
            return;
        this.sessions.set(session.agentId, { ...session, rounds: session.rounds ?? 0, history: session.history ?? [] });
    }
    /** 只在实际追问得到答案后计数；相同摘要和维度的重试幂等。 */
    recordAnswer(agentId, answer, asked, maxRounds) {
        const session = this.sessions.get(agentId);
        if (!session)
            return 0;
        const history = session.history ??= [];
        const last = history.at(-1);
        if (!answer || !asked.length || (last?.answer === answer && last.asked.join() === asked.join()))
            return session.rounds ?? 0;
        if ((session.rounds ?? 0) >= maxRounds)
            return session.rounds ?? 0;
        history.push({ answer, asked: [...asked] });
        return this.bumpRound(agentId);
    }
    bumpRound(agentId) {
        const session = this.sessions.get(agentId);
        if (!session)
            return 0;
        return session.rounds = (session.rounds ?? 0) + 1;
    }
    get(agentId) { return this.sessions.get(agentId); }
    end(agentId) { this.sessions.delete(agentId); }
    clear() { this.sessions.clear(); }
}
