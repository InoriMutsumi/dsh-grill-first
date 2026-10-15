# dsh-grill-first

> DSH（DeepSeek Harness）插件：**开工前先刨根问底**——把模糊需求问成明确需求，你在对话里点头之后，主任务才开工。

## 它解决什么问题

AI 助手最常见的失败不是"不会做"，而是"做完了才发现做的不是你要的"。这个插件在**任何新任务开工前**插入一道需求澄清环节：

1. 模型先把你的任务原文交给 `grill_start` 判定；
2. 任务模糊（缺目标 / 范围 / 约束 / 验收标准）→ 它按轮追问你，每轮 3 个问题，最多 3 轮，每轮都基于你上一轮的回答继续深挖；
3. 问清后整理成中文四段清单（目标 / 范围 / 约束 / 验收标准），用 `grill_confirm` 请你确认；
4. 你点"确认，按此开工"→ 本次任务放行；你点"要改"→ 它按你的反馈修订后再来一次；
5. 一句话就能说清的小任务、以及带「直接做 / 跳过提问 / 不用问 / skip」字样的消息，**不会被打扰**。

严格档位（`gateMode: "strict"`）下，需求没确认前模型无法执行写文件、跑命令这类**变更类**操作——从机制上保证"没问清就不许动手"。

## 安装

装插件前请先退出正在跑的任务。三种方式任选：

**方式一：DSH 插件市场**（推荐）

在 DSH 设置 → 插件里搜索 `dsh-grill-first` 一键安装。

**方式二：npm 命令行**

```bash
dsh plugin --profile <你的 profile 名> add dsh-grill-first
```

**方式三：本地包 / GitHub 仓库**

```bash
dsh plugin --profile <你的 profile 名> add /绝对路径/dsh-grill-first-0.1.0.tgz
dsh plugin --profile <你的 profile 名> add github:ZTMYchelly/dsh-grill-first
```

装完**即生效**：本机实测 DSH 的 live profile 会热加载新插件，不需要重启（若你的 profile 是启动式、或列表里没出现，再完全退出 DSH 重开一次）。

## 使用

装好之后不需要你做什么：它靠两件事自动工作。

- **协议提示段**：插件往系统提示里注入一小段中文协议（约 600 字），告诉模型"接到新任务先调 `grill_start`"。你在系统提示里能看到 `【开工前提问协议（grill-first）】` 就说明装好了。
- **工具**：模型会用这两个工具推进澄清流程。

| 工具 | 作用 |
|---|---|
| `grill_start` | 判定任务是否需要澄清；返回 `verdict`、`focus_hints`（该问什么）、`memory_context`（已知偏好，避免重复问） |
| `grill_confirm` | 把四段式需求清单交给你确认；确认后放行任务，并把确认过的内容写进记忆 |

### 想跳过提问时

- 消息里带上「**直接做**」「**跳过提问**」「**不用问**」「**skip**」中任意一个 → 立刻开工；
- 或者在设置里把 `enabled` 关掉 / 把 `gateMode` 调成 `off` → 整个插件静默。

## 配置项

DSH 设置界面 → 插件 → dsh-grill-first，共 7 项：

| 配置 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | 布尔 | `true` | 总开关。关闭后既不追问也不拦截工具 |
| `gateMode` | `off` / `warn` / `strict` | `warn` | `off` 不拦截；`warn` 只在日志里记录"需求未确认"；`strict` 未确认前拦截变更类工具 |
| `maxQuestionsPerRound` | 1-6 | `3` | 每轮最多问几个问题 |
| `maxRounds` | 1-10 | `3` | 最多追问几轮 |
| `intensity` | `gentle` / `standard` / `grill` | `standard` | 追问力度：只问关键点 / 标准 / 刨根问底 |
| `bypassKeywords` | 字符串数组 | `["直接做","跳过提问","不用问","skip"]` | 命中即跳过提问 |
| `memoryEnabled` | 布尔 | `true` | 是否启用两层记忆 |

> 默认是 `warn` 而不是 `strict`：默认档位保证升级插件不会突然卡住你已有的工作流。想要硬门禁请手动切 `strict`。

### 怎么改配置

DSH 设置页里的插件条目目前只提供「启用 / 停用」开关（客户端的插件页不渲染第三方插件的配置表单），要改上面 7 项请编辑 **profile 的补丁层** `cordis.patch.yml`：

```yaml
# <profile 目录>/cordis.patch.yml
- id: dsh-grill-first
  name: dsh-grill-first
  config:
    gateMode: strict          # off | warn | strict
    maxQuestionsPerRound: 3   # 1-6
    maxRounds: 3              # 1-10
    intensity: standard       # gentle | standard | grill
    memoryEnabled: true
    bypassKeywords: [直接做, 跳过提问, 不用问, skip]
```

改完重启 DSH 生效。只写想改的项也可以，其余项用默认值。

## 两层记忆

只记录**你确认过**的内容，不记录对话原文，也不会把需求清单写成文件。

| 层 | 位置 | 内容 |
|---|---|---|
| 全局层 | `<profile 目录>/grill-first/global.json`（不可写时退化到 `~/.dsh-grill-first/global.json`） | 通用偏好，如"注释一律用中文" |
| 项目层 | `<工作区>/.dsh/grill-first/memory.json` | 项目背景、任务历史（任务名 + 需求摘要 + 日期） |

下次追问时，`grill_start` 会把这些内容作为 `memory_context` 返回，模型就不会重复问你同一件事。

## 开发

```bash
npm install          # 装开发依赖（schemastery 由宿主提供，仅开发期需要）
npm run build        # TypeScript → dist/
npm test             # 构建 + 86 个单测 / 端到端场景测试
node scripts/selfcheck.mjs   # 静态自检：中文 JSDoc、any 用量、需求→代码位置
```

代码结构：

```
src/
  index.ts              插件装配入口（工具 + 协议段 + 门禁）
  config.ts             配置归一化（不依赖宿主，可单测）
  configSchema.ts       Schemastery 配置声明（设置界面用，7 项）
  judge/heuristics.ts   任务模糊度判定（纯函数）
  prompt/protocol.ts    注入系统提示的中文协议文本
  tools/grillStart.ts   grill_start 工具
  tools/grillConfirm.ts grill_confirm 工具
  gate/preExecute.ts    变更类工具门禁（tools/pre-execute + 新消息重置）
  memory/store.ts       两层记忆的读写
```

## 已知限制

- 门禁只对**根 agent**（能直接跟你对话的那个）生效；子 agent / 团队成员不拦，否则正常的委派工作流会被卡死。
- `warn` 档位只能"记录不拦截"：DSH 的 `tools/pre-execute` 事件没有"放行但同时给模型提示"这种返回形态。
- 记忆是本地文件，不含加密；删掉对应 json 即清空。
- `grill_confirm` 优先走 DSH 的结构化提问通道；该通道不可用时（例如子 agent 内部）会返回 `needs_user_confirmation: true`，由模型改用内置提问工具兜底。

## 许可

MIT，见 [LICENSE](./LICENSE)。
