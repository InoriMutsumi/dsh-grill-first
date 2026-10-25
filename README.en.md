# dsh-grill-first

![tests](https://img.shields.io/badge/tests-127%20passing-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)
![DSH plugin](https://img.shields.io/badge/DSH-plugin-blueviolet)

> A [DSH (DeepSeek Harness)](https://github.com/deepseek-ai/dsh) plugin that **interviews you before it starts working**: vague requests get clarified first, and the main task only starts once you confirm the summary.

**Agents rarely fail because they can't do the work. They fail because they do the wrong work, confidently.**

[中文](./README.md) · [Install](#install) · [Configuration](#configuration) · [Known limitations](#known-limitations)

## See it in 30 seconds

```text
you  optimize that page

it   1) Which page? 2) "Optimize" meaning speed, style or copy?
     3) How do we know it's done?

you  the login page, mostly styling — the alignment and spacing look off

it   GOAL      tidy up the login page's visuals
     SCOPE     styling only; structure and copy stay as-is
     CONSTRAINTS use the existing design tokens
     ACCEPTANCE key screens don't break on mobile
                          [ Confirm and start ]  [ Change something ]

you  confirm

it   (only now does it touch anything)
```

Without the plugin, the same sentence usually goes like this:

```text
you  optimize that page

it   Done! I've updated the homepage copy and color scheme ✨   ← you meant the login page
```

## The four gate modes

| | No plugin | `gateMode: warn` (default) | `gateMode: ask` | `gateMode: strict` |
|---|---|---|---|---|
| Vague request | Guesses and starts | Asks; actions not blocked | Asks; one confirmation card before acting | Asks; blocks writes and commands until confirmed |

`warn` is the default so upgrading never silently freezes a workflow you already had.

## How it works

Every new task starts with a check, not with work:

1. The model passes your request to `grill_start`.
2. If it's missing goal / scope / constraints / acceptance criteria, the plugin asks up to 3 questions per round, 3 rounds max, each round built on your previous answer.
3. Once the picture is clear, `grill_confirm` hands you a four-part summary (goal / scope / constraints / acceptance criteria).
4. "Confirm" releases the task; "change something" makes it revise and ask again.
5. One-liners and questions don't trigger any of this — nor do messages containing `直接做`, `跳过提问`, `不用问`, `skip`, `skip the questions`, `just do it`.

## Install

Quit any running task first. Any of these works:

**Plugin marketplace (recommended)** — DSH settings → Plugins → search `dsh-grill-first`.

**npm**

```bash
dsh plugin --profile <your-profile> add dsh-grill-first
```

**From source**

```bash
dsh plugin --profile <your-profile> add github:InoriMutsumi/dsh-grill-first
```

Live profiles hot-load the plugin — no restart needed (restart DSH once if it doesn't show up).

## What you get

- **A protocol paragraph** injected into the system prompt (~600 chars) telling the model to run `grill_start` before new work. If you can see `【开工前提问协议（grill-first）】` in the prompt, it's installed.
- **Two tools:**

| Tool | What it does |
|---|---|
| `grill_start` | Decides whether the request needs clarification. Returns `verdict`, `focus_hints` (what to ask), and `memory_context` (preferences you already confirmed, so it doesn't ask twice) |
| `grill_confirm` | Hands you the four-part summary; on confirmation releases the task and saves what you confirmed |

## When you don't want to be asked

- Put `直接做`, `跳过提问`, `不用问`, `skip`, `skip the questions` or `just do it` in the message → it starts immediately.
- Asks a question ("how is this plugin", "check my repos", "explain this code") → treated as a question, not a task, so nothing is clarified.
- Or turn `enabled` off / set `gateMode: off` in the config → fully silent.

## Configuration

DSH settings → Plugins → dsh-grill-first, eight options:

| Option | Type | Default | Meaning |
|---|---|---|---|
| `enabled` | boolean | `true` | Master switch. Off = no questions, no gate |
| `gateMode` | `off` / `warn` / `ask` / `strict` | `warn` | `off` never blocks; `warn` only logs; `ask` shows one confirmation card; `strict` blocks mutating tools until confirmed |
| `maxQuestionsPerRound` | 1–6 | `3` | Questions per round |
| `maxRounds` | 1–10 | `3` | Max clarification rounds; on the last round `grill_start` passes the task through |
| `intensity` | `gentle` / `standard` / `grill` | `standard` | How much detail counts as clear: `gentle` needs two dimensions, `standard` three, `grill` also requires acceptance criteria |
| `bypassKeywords` | string[] | `["直接做","跳过提问","不用问","skip"]` | Hit any of these → skip the interview |
| `memoryEnabled` | boolean | `true` | Enable the two-layer memory |
| `memoryScope` | `project` / `global` | `project` | Where project context lives: in the workspace, or in the global directory shared across projects |

### Editing the config

The plugin page only offers an enable/disable toggle, so edit the profile's patch layer, `<profile>/cordis.patch.yml`:

```yaml
- id: dsh-grill-first
  name: dsh-grill-first
  config:
    gateMode: ask
    maxQuestionsPerRound: 3
    maxRounds: 3
    intensity: standard
    memoryEnabled: true
    memoryScope: project
    bypassKeywords: [直接做, 跳过提问, 不用问, skip]
```

Only the keys you set are overridden; the rest keep their defaults. Config changes hot-reload, code changes need a DSH restart.

## Two-layer memory

Only what you actually confirmed is stored — never raw conversation, never the summary as a file.

| Layer | Location | Contents |
|---|---|---|
| Global | `<profile>/grill-first/global.json` (falls back to `~/.dsh-grill-first/global.json`) | Standing preferences, e.g. "comments in English" |
| Project | `<workspace>/.dsh/grill-first/memory.json` | Project background and task history (task name, summary, date; last 100 entries) |

Set `memoryScope: global` to keep project context in the global directory instead — handy when you don't want a `.dsh/` folder in every repo. Next interview, `grill_start` returns this as `memory_context`, so the same question is never asked twice.

## Development

```bash
npm install                 # dev dependencies (schemastery comes from the host at runtime)
npm run build               # TypeScript → dist/
npm test                    # build + 127 unit / end-to-end tests
node scripts/selfcheck.mjs  # static check: Chinese JSDoc, `any` usage, spec-to-code map
```

`dist/` is committed on purpose so `dsh plugin add github:…` works without compiling on your machine. CI runs `typecheck` + tests on Node 22.

## Compatibility

- Peer dependency: only `@deepseek-ai/schemastery` (`^3.18.1`, shipped by the host).
- No import of any `@deepseek-ai/dsh*` runtime package, so no `engines.dsh` and no DSH peer range to keep in sync. Verified against DSH `0.2.1-rc.2`.

## Known limitations

- The gate only applies to the **root agent** that talks to you. Delegated work isn't gated (but delegation tools themselves are, so a subagent can't be used to sidestep it). This is deliberate.
- `ask` mode asks **once per task** — otherwise a task that writes 20 files would show 20 cards. Use `strict` if you want every action blocked.
- The judge is **keyword heuristics**, not a semantic model: questions are detected by punctuation and interrogatives. Rare ambiguous sentences can be misjudged; say `直接做` or let the model call `grill_start` again to correct it.
- The judge runs in Chinese and English only. English keywords match on word boundaries (`skip` matches `skip` and `(skip)` but not `skipList`).
- Memory is plain local JSON, unencrypted.

## License

MIT — see [LICENSE](./LICENSE).
