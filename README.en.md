# dsh-grill-first

> A DSH (DeepSeek Harness) plugin that clarifies vague requests and asks you to confirm the requirements before starting work.

[中文](./README.md) · [Configuration](#configuration) · [Two-layer memory](#two-layer-memory)

This document describes V1 (1.0.0). It is published on [npm](https://www.npmjs.com/package/dsh-grill-first) and pushed to the GitHub repository. The automated suite (173 tests) passes, and the user confirmed that adding a preference works on the settings page. The host login page cannot be entered by an automated browser, so batch operations are covered only by client-logic regression tests, without a full browser screenshot.

## How it works

1. The model sends the original task to `grill_start`, which checks the goal, scope, constraints and acceptance criteria.
2. For vague tasks, it asks only about ambiguities that affect the solution: up to 3 questions per round and 3 rounds by default. Each answer is recorded with `mode: continue`, an answer summary and the dimensions actually asked about.
3. Once enough information is available or the round limit is reached, it stops asking and submits a four-part summary, including unverified assumptions, to `grill_confirm`. **Reaching the limit still requires confirmation; it never automatically opens the gate.**
4. “Confirm and start” releases the task; “Change something” leads to a revised summary and another confirmation.
5. Clear small tasks and new tasks containing bypass keywords can proceed directly. Questions and follow-ups during clarification do not substitute for task confirmation.

For “optimize that page”, clarify which page, what changes are in scope, and what counts as done:

```text
GOAL: Tidy up the login page's visuals
SCOPE: Styling only; preserve structure and copy
CONSTRAINTS: Use the existing design tokens
ACCEPTANCE: Key screens do not break on mobile
[Confirm and start] [Change something]
```

## Three tools

| Tool | Purpose |
|---|---|
| `grill_start` | Determines whether clarification is needed; returns focus hints, rounds, answer history and `memory_context` |
| `grill_confirm` | Displays the requirements; explicit confirmation opens the gate and saves history/preferences when memory is enabled |
| `grill_research` | Queries open-source candidates and source evidence using public technical keywords after requirements are clear; never installs or executes candidate code |

`grill_confirm` prefers the host's structured question service. If that service is unavailable or throws, it returns `needs_user_confirmation: true`; the model must show the complete summary through the built-in question tool and obtain explicit agreement before submitting `confirmed: true`. This declaration is accepted only after **the same session and identical summary actually entered the fallback channel**. Passing `true` directly does not bypass a working structured question service. Summaries exceeding 6000 characters are rejected and must first be condensed while preserving all constraints and acceptance criteria.

## Gate modes

| `gateMode` | Before requirements are confirmed |
|---|---|
| `off` | Does not block tools; does not disable the entire plugin |
| `warn` (default) | Logs the unconfirmed state and allows tools |
| `ask` | Requests host approval for each mutating call; approval of one operation does not authorize the whole task |
| `strict` | Rejects mutating calls until requirements are confirmed or explicitly bypassed |

The gate applies to root agents. Read-only tools remain available; writes, commands and delegation tools are controlled. Returning an approval request is not evidence of approval. In `ask` mode, later mutations still require approval until a valid flow such as `grill_confirm` opens the task gate.

Set `enabled: false` to disable clarification, gating and research. Default bypass keywords are `直接做`, `跳过提问`, `不用问` and `skip`. English keywords match word boundaries; Chinese keywords match substrings. Immediately preceding negation, such as `不要直接做` or `don't skip`, prevents that occurrence from acting as a bypass. These are keyword heuristics, not full semantic understanding; complex negation and quotations can still be misclassified.

## Installation

Use DSH plugin management to install a selected version, or the CLI:

```bash
dsh plugin --profile <your-profile> add dsh-grill-first
# Development build: use the actual local package path
dsh plugin --profile <your-profile> add /absolute/path/dsh-grill-first-1.0.0.tgz
```

These are installation examples; the registry default is not necessarily the V1 described here. Check the installation result's application status. Editing repository sources does not update a running installed copy.

## Configuration

V1 provides a separate **DSH Settings → 需求澄清 (Requirements clarification)** page with ten options for the current plugin instance. The page needs the host's settings, connection and workspace services; loading and saving must still be checked after deployment.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `true` | Master switch |
| `gateMode` | `off` / `warn` / `ask` / `strict` | `warn` | Gate behavior described above |
| `maxQuestionsPerRound` | 1–6 | `3` | Maximum questions per round |
| `maxRounds` | 1–10 | `3` | Round limit; the summary still requires confirmation |
| `intensity` | `gentle` / `standard` / `grill` | `standard` | Clarity threshold: two dimensions / three / additionally requires acceptance criteria |
| `bypassKeywords` | string[] | `["直接做","跳过提问","不用问","skip"]` | Matching tasks bypass clarification |
| `memoryEnabled` | boolean | `true` | Enables automatic reads during clarification and writes on confirmation |
| `memoryScope` | `project` / `global` | `project` | Stores project memory in the workspace or global directory |
| `researchMode` | `off` / `auto` / `always` | `auto` | Disabled / query when applicable / attempt a query on every tool invocation |
| `researchDepth` | `quick` / `deep` | `quick` | Request budget and excerpt depth |

All options are editable on the page, with one bypass keyword per line. The profile's `cordis.patch.yml` can also configure the plugin entry; specify only the options to override:

```yaml
- id: dsh-grill-first
  name: dsh-grill-first
  config:
    gateMode: strict
    maxRounds: 3
    researchMode: auto
    researchDepth: quick
```

### Preference management

The same page supports listing, adding, editing, enabling, disabling and deleting global or project preferences. Edit text and tags and inspect provenance. Preferences are sorted newest first, and the current filtered results can be selected for batch enable, disable or delete; batch deletion asks for confirmation and stops with a partial-progress report if one item fails. Project preferences require a valid workspace registered with the host. Disabled preferences are omitted from future summaries; the page asks before deletion.

Saves check revisions for concurrent changes. Reload before editing again if a conflict occurs; malformed memory files are not silently overwritten. The management channel accepts only the host owner's browser and is not an LLM preference-writing tool. Turning `memoryEnabled` off stops automatic reads/writes but still permits managing existing preferences on the page.

## Two-layer memory

The automatic flow stores confirmed requirement summaries and preferences, not raw conversations. Users can also manage preferences directly on the settings page. No separate requirements document is generated.

| Layer | Actual default location | Contents |
|---|---|---|
| Global | `~/.dsh/grill-first/global.json` | Global preferences |
| Project | `<workspace>/.dsh/grill-first/memory.json` | Project preferences, background and the latest 100 history entries |

`DSH_GRILL_HOME` overrides the global directory, yielding `<DSH_GRILL_HOME>/global.json`. With `memoryScope: global`, project memory moves to `project.json` in that same global directory and is shared across projects; the global preference filename remains unchanged. These paths are not profile-relative, and an unwritable directory does not trigger a fallback to another location.

Memory uses unencrypted local JSON. Enabled preferences and project background are returned as `memory_context` during subsequent clarification. Writes are serialized within the process and use atomic temporary-file replacement; there is no cross-process lock.

## Research modes

Research runs only when `grill_research` is called; `always` does not start background research. `off` makes no network requests. `auto` requires `applicable: true`; `always` skips that applicability check. Disabling the plugin also disables research.

Only explicit public keywords are sent to the GitHub REST API; the tool does not read or upload workspace contents. It compares up to three candidates, checking repository metadata, README, license and releases, and returns source URLs, check times and failure states. `quick` returns up to 3000 characters of README and one release; `deep` returns up to 12000 characters and three releases with a larger bounded request budget.

External text is evidence, never instructions. A license of `unknown` means it was not verified; license compatibility is not assessed for any candidate. Timeouts, rate limits and network failures produce degraded results so a local solution can still proceed. Candidate code is never automatically installed or executed.

## Development and verification

```bash
npm install
npm run build
npx vitest run test/tools.test.ts test/e2e.test.ts
npm test
```

Tests import `dist/`, so build after changing sources. The two selected suites check tool behavior and plugin integration in a simulated host; they do not establish installed UI behavior. Historical test counts are not a current coverage claim.

Node.js 20 or later is required. The host supplies `@deepseek-ai/schemastery`. V1 also uses host connection, settings and workspace services and the client settings slot; compatibility needs verification on the target host.

## License

MIT. See [LICENSE](./LICENSE).
