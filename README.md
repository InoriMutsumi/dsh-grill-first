# dsh-grill-first

![tests](https://img.shields.io/badge/tests-127%20passing-brightgreen)
![license](https://img.shields.io/badge/license-MIT-blue)
![DSH plugin](https://img.shields.io/badge/DSH-plugin-blueviolet)

> DSH（DeepSeek Harness）插件：**开工前先刨根问底**——把模糊需求问成明确需求，你在对话里点头之后，主任务才开工。

**Agent 不是不会做，是经常做完了你才发现不是你要的。**

[English](./README.en.md) · [安装](#安装) · [配置项](#配置项) · [已知限制](#已知限制)

## 30 秒看懂

```text
你  把那个页面优化一下

它  1) 是哪个页面？2) 「优化」指速度、样式还是文案？
    3) 怎么才算优化好了？

你  登录页，主要是样式，现在对齐和间距看着乱

它  【目标】整理登录页视觉
    【范围】只改样式，不动结构和文案
    【约束】沿用现有设计规范
    【验收标准】主要页面在移动端不错位
                     [ 确认，按此开工 ]  [ 要改 ]

你  确认

它  （这时才动手）
```

不装这个插件时，同一句话大概率是这样：

```text
你  把那个页面优化一下
它  好的，已经帮你调整了首页的文案和配色 ✨   ← 你要的是登录页
```

## 四种档位的区别

| | 不装插件 | `gateMode: warn`（默认） | `gateMode: ask` | `gateMode: strict` |
|---|---|---|---|---|
| 任务模糊时 | 直接猜着做 | 追问；动手不拦 | 追问；动手前弹一次确认卡片 | 追问；没确认前拦截写文件、执行命令 |

`warn` 是默认值：升级插件不会突然卡住你已有的工作流。

## 它解决什么问题

AI 助手最常见的失败不是"不会做"，而是"做完了才发现做的不是你要的"。这个插件在**任何新任务开工前**插入一道需求澄清环节：

1. 模型先把你的任务原文交给 `grill_start` 判定；
2. 任务模糊（缺目标 / 范围 / 约束 / 验收标准）→ 它按轮追问你，每轮 3 个问题，最多 3 轮，每轮都基于你上一轮的回答继续深挖；
3. 问清后整理成中文四段清单（目标 / 范围 / 约束 / 验收标准），用 `grill_confirm` 请你确认；
4. 你点"确认，按此开工"→ 本次任务放行；你点"要改"→ 它按你的反馈修订后再来一次；
5. 一句话就能说清的小任务、以及带「直接做 / 跳过提问 / 不用问 / skip」字样的消息，**不会被打扰**。

严格档位（`gateMode: "strict"`）下，需求没确认前模型无法执行写文件、跑命令这类**变更类**操作——从机制上保证"没问清就不许动手"。

`ask` 档位（0.1.4 新增）介于两者之间：需求没确认时，变更类操作会弹一张 DSH 原生确认卡片问你"照现在的理解直接动手吗"，你点「是」就放行，点「否」由你补一句需求——不写配置文件也能当场决定。

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
dsh plugin --profile <你的 profile 名> add /绝对路径/dsh-grill-first-0.1.5.tgz
dsh plugin --profile <你的 profile 名> add github:InoriMutsumi/dsh-grill-first
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
- 只是**问情况**（"这个插件怎么样""查一下我的仓库里有什么""解释一下这段代码"）→ 不算新任务，不追问；
- 或者在设置里把 `enabled` 关掉 / 把 `gateMode` 调成 `off` → 整个插件静默。

## 配置项

DSH 设置界面 → 插件 → dsh-grill-first，共 8 项：

| 配置 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `enabled` | 布尔 | `true` | 总开关。关闭后既不追问也不拦截工具 |
| `gateMode` | `off` / `warn` / `ask` / `strict` | `warn` | `off` 不拦截；`warn` 只在日志里记录"需求未确认"；`ask` 未确认时弹卡片问你；`strict` 未确认前直接拦截变更类工具 |
| `maxQuestionsPerRound` | 1-6 | `3` | 每轮最多问几个问题 |
| `maxRounds` | 1-10 | `3` | 最多追问几轮；问满后 `grill_start` 直接放行 |
| `intensity` | `gentle` / `standard` / `grill` | `standard` | 追问力度：`gentle` 两维齐就放行 / `standard` 三维 / `grill` 还要求写清验收标准 |
| `bypassKeywords` | 字符串数组 | `["直接做","跳过提问","不用问","skip"]` | 命中即跳过提问 |
| `memoryEnabled` | 布尔 | `true` | 是否启用两层记忆 |
| `memoryScope` | `project` / `global` | `project` | 项目背景/历史存哪：`project` 存工作区，`global` 存全局目录（跨项目共享） |

> 默认是 `warn` 而不是 `strict`：默认档位保证升级插件不会突然卡住你已有的工作流。想要硬门禁请手动切 `strict`。

### 怎么改配置

DSH 设置页里的插件条目目前只提供「启用 / 停用」开关（客户端的插件页不渲染第三方插件的配置表单），要改上面 8 项请编辑 **profile 的补丁层** `cordis.patch.yml`：

```yaml
# <profile 目录>/cordis.patch.yml
- id: dsh-grill-first
  name: dsh-grill-first
  config:
    gateMode: strict          # off | warn | ask | strict
    maxQuestionsPerRound: 3   # 1-6
    maxRounds: 3              # 1-10
    intensity: standard       # gentle | standard | grill
    memoryEnabled: true
    memoryScope: project      # project | global
    bypassKeywords: [直接做, 跳过提问, 不用问, skip]
```

改完重启 DSH 生效。只写想改的项也可以，其余项用默认值。

## 两层记忆

只记录**你确认过**的内容，不记录对话原文，也不会把需求清单写成文件。

| 层 | 位置 | 内容 |
|---|---|---|
| 全局层 | `<profile 目录>/grill-first/global.json`（不可写时退化到 `~/.dsh-grill-first/global.json`） | 通用偏好，如"注释一律用中文" |
| 项目层 | `<工作区>/.dsh/grill-first/memory.json` | 项目背景、任务历史（任务名 + 需求摘要 + 日期） |

项目层默认落在工作区；把 `memoryScope` 改成 `global` 后改落 `<全局目录>/project.json`——适合"所有项目通用"的背景约定，不想往每个仓库里塞 `.dsh/` 时也用这个。历史记录只保留最近 100 条（0.1.4 起）。

下次追问时，`grill_start` 会把这些内容作为 `memory_context` 返回，模型就不会重复问你同一件事。

## 开发

```bash
npm install          # 装开发依赖（schemastery 由宿主提供，仅开发期需要）
npm run build        # TypeScript → dist/
npm test             # 构建 + 127 个单测 / 端到端场景测试
node scripts/selfcheck.mjs   # 静态自检：中文 JSDoc、any 用量、需求→代码位置
```

推送到 GitHub 后 `.github/workflows/ci.yml` 会自动跑上面那两条（`npm ci` + `npm test`）。`dist/` 是**故意提交**的：这样 `dsh plugin add github:…` 装完即可用，不需要在你的机器上编译。

代码结构：

```
src/
  index.ts              插件装配入口（工具 + 协议段 + 门禁）
  config.ts             配置归一化（不依赖宿主，可单测）
  configSchema.ts       Schemastery 配置声明（设置界面用，8 项）
  version.ts            从 package.json 读版本号，供 grill_start 返回
  judge/heuristics.ts   任务模糊度判定（纯函数）
  prompt/protocol.ts    注入系统提示的中文协议文本
  tools/grillStart.ts   grill_start 工具
  tools/grillConfirm.ts grill_confirm 工具
  gate/preExecute.ts    变更类工具门禁（tools/pre-execute + 新消息重置）
  memory/store.ts       两层记忆的读写
```

## 兼容性与适配

本插件对外只有两处依赖，都不归 DSH 的"插件版本门禁"管：

- **peer 依赖**：只有 `@deepseek-ai/schemastery`（`^3.18.1`，宿主自带；DSH 0.2.1-rc.2 里解析到的实际版本是 3.18.5）。
- **宿主扩展点**：cordis 上下文 API —— `ctx.tools`（注册工具）、`ctx.get('userQuestions')`（结构化提问通道）、`ctx.inject(['systemPrompt'])`、事件 `tools/pre-execute` 与 `agent/inbox/inserted`。

它**不 import 任何 `@deepseek-ai/dsh*` 运行时包**，所以既没有 `engines.dsh`，也没有 `@deepseek-ai/dsh` peer。DSH 的 `plugin-compatibility` 检查（`dsh-app-boot` 里的 `evaluatePluginCompatibility`）只在插件声明了 `engines.dsh` 或 `@deepseek-ai/dsh*` peer 时才介入，判不过才会被拦；本插件两条都不沾，因此升 DSH 一般不需要改代码。

> 以后若要 import harness 内部包，请显式声明 peer 范围并带上预发布分支，例如
> `">=0.2.0-rc.2 <0.3.0-0 || >=0.2.1-rc.1 <0.3.0-0"`。
> DSH 自己的门禁用 `semver.satisfies(..., { includePrerelease: true })` 判定，`^0.2.0-rc.2` 能匹配 `0.2.1-rc.2`；
> 但标准 npm 语义（不加 `includePrerelease`）会判不匹配，所以上游要求写显式分支。

已验证的宿主版本：`0.2.0-rc.2`（0.1.x 开发期）、`0.2.1-rc.2`（2026-10-17 复核：`typecheck`、94 个单测、`verify-installed` 一致，且实测加载运行；0.1.4 起 127 个单测）。升完 DSH 后的自检三步：

```bash
node scripts/verify-installed.mjs   # 安装拷贝与仓库产物是否一致
# 调一次 grill_start：返回里的 version 就是当前正在跑的插件版本
# 再执行一个需要确认的任务：确认门禁仍然会拦（而不是悄悄放行）
```

## 已知限制

- 门禁只对**根 agent**（能直接跟你对话的那个）生效；子 agent / 团队成员不拦，否则正常的委派工作流会被卡死。因此**委派类工具本身**（`subagent`、`workflow`、`spawn_teammate`…）在未确认前也会被拦，防止"派个子代理替自己动手"绕过门禁。
- `ask` 档位**只问一次**：卡片弹过之后门禁即视为放行（否则一次任务里写 20 个文件就要弹 20 张卡片）。想每次都拦，请用 `strict`。
- 判定器是**关键词启发式**，不是语义模型：问句靠问号/疑问词/"查一下/看看"这类信号识别，极少数既像提问又像下令的句子可能判错；判错时直接说「直接做」或让模型调一次 `grill_start` 即可纠正。英文关键词按词边界匹配，中文按子串匹配。
- `warn` 档位只能"记录不拦截"：DSH 的 `tools/pre-execute` 事件没有"放行但同时给模型提示"这种返回形态。
- 记忆是本地文件，不含加密；删掉对应 json 即清空。
- `grill_confirm` 优先走 DSH 的结构化提问通道；该通道不可用时（例如子 agent 内部）会返回 `needs_user_confirmation: true`，由模型改用内置提问工具兜底。
- **改代码后必须重启 DSH**：DSH 加载的是 profile 里那份安装拷贝，而且插件**代码**改动不会热生效（实测：`cordis.patch.yml` 里的**配置**改动是热生效的，包代码不是）。判断运行中的是哪一版：调一次 `grill_start`，返回里的 `version` 字段就是当前在跑的版本；看不到 `version` 说明跑的是 0.1.0 之前的旧代码。
- 跳过关键词里**英文按词边界匹配**（`skip` 能命中 `skip`、`Skip this`、`（skip）`，但不会命中 `skipList`、`skip_list`、`bypass-keyword` 这类标识符）；中文关键词按子串匹配（`直接做` 命中 `那你直接做好了`）。

## 许可

MIT，见 [LICENSE](./LICENSE)。
