"""把工作表的完成情况勾上，并追加"实际执行记录与偏差"附录。

用法：python scripts/update-worksheet.py <工作表路径>
"""
import re
import sys
from datetime import datetime

DONE = {
    "1.1", "1.2", "1.3", "1.4",
    "2.1", "2.2", "2.3", "2.4",
    "3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7",
    "4.1", "4.2", "4.3",
    "5.1", "5.2", "5.3", "5.4",
    "6.1", "6.2", "6.4",
    "7.1", "7.2", "7.4",
}

APPENDIX = """

---

## 附录 A：阶段执行记录与偏差（实际执行，{stamp}）

> 本附录由 `dsh-grill-first/scripts/update-worksheet.py` 写入，记录"实际怎么做的、与正文哪里不同、为什么"。

### A.1 阶段 1（格式核实）的偏差

- **1.1 未从 npm 下载参考插件**：改为直接读本机已安装插件的真实源码——`dsh-ops`（唯一的 `dsh-plugin.json` 新式清单样例）、`dsh-find-plugins`（最简 bundle 插件 + `cordis.patch.yml` 模板）、`dshmarket` / `dsh-univer-office`（Config 用 `@deepseek-ai/schemastery` 的实例）。理由：本机已装的就是"在当前 DSH 版本上确实能跑"的样本，证据比下载任意外部版本更硬，且省去网络依赖。
- **1.3 笔记落点**：未单独建 `G:\\大肥鱼\\_ref\\笔记.md`；契约记录直接进了 `src/*.ts` 的文件头注释与本工作表的 0.1 对照表 + `测试记录.md`。
- 关键实测结论（正文未列）：
  - 事件 `tools/pre-execute` 是 waterfall，不拦截必须显式 `return next()`；拒绝形态为 `{{ kind: 'deny', reason }}`。
  - `agent/inbox/inserted` 携带 `{{agent, message}}`，`message.role === 'user'` 才是用户消息。
  - `agents.roots()` 是区分"能跟人对话的根 agent"与子 agent 的可靠依据（子 agent 调 `userQuestions.ask` 会抛 `DELEGATED_CALLER`）。
  - `sandboxPolicy.resolve({{session}}).workspaceRoot` 与 `agent.session.header.cwd` 是工作区根目录的权威来源。
  - `@deepseek-ai/schemastery` 不随 profile 安装，但确实发布在 npm（3.18.4），故声明为 `peerDependencies` + 开发期装同版本拿真实类型。

### A.2 阶段 3（实现）与正文的差异

| 项 | 正文 | 实际 | 原因 |
|---|---|---|---|
| 工具数量 | 两个工具（3.4 / 3.5） | 一致，未额外做 `grill_record` / `grill_memory` | 工作表只要求两个；`forget()` 已在 store 里实现但未挂工具，README 里说明"删 json 即清空" |
| 记忆 API 签名 | `loadMemory()` 等不带参数 | 增加 `workspaceRoot?` 参数 | 项目层要落到会话工作区，必须由调用方传入；单测也需要指定临时目录 |
| 全局记忆位置 | profile 目录下 `grill-first/global.json` | `~/.dsh/grill-first/global.json`（可用 `DSH_GRILL_HOME` 覆盖） | 实测 DSH 不向插件暴露 profile 目录的环境变量，无法可靠定位 profile |
| Config 声明 | "若发现声明式 Config 更省事就用声明式" | 用 Schemastery 声明 7 项并在真实库上验证 | `dsh-univer-office` / `dshmarket` 都是这么做的，设置界面与 cordis.yml 校验共用一份 schema |
| 确认通道 | 只用 `user-questions/request` | 双通道：优先 `userQuestions.ask`，不可用时返回 `needs_user_confirmation` 让模型改用 `ask_user_question`，再带 `confirmed:true` 回调 | 子 agent 没有人工应答者（`DELEGATED_CALLER`），单通道会让委派场景卡死；真机已验证兜底路径 |
| warn 档语义 | "只在返回结果里附提示" | 放行 + 写日志 | `tools/pre-execute` 没有"放行且附带提示"的返回形态（只有 allow/deny/cancel/ask） |

### A.3 阶段 5（自检）实际证据

- 单测：`npm test` → 6 个文件 **86 个用例全绿**（heuristics 17 / config 11 / store 13 / tools 16 / e2e 19 / gate 10）。
- 端到端：`test/e2e.test.ts` 用假宿主装配真实 `dist/index.js`（假宿主实现了 `tools.register`、`agents.roots`、`sandboxPolicy.resolve`、`userQuestions.ask` 与两个事件），S1–S7 全绿。
- 真机：工作表 5.2 四项全部通过（包已挂载 / 两个工具已注册 / 配置 7 键可见 / 协议段已注入），另有子代理在真实宿主里实调 `grill_start` 两次 + `grill_confirm` 一次，三次都返回结构化 JSON。
- 配置 schema：`node scripts/verify-config-schema.mjs` 用真实 schemastery 校验 7 键默认值、合法值保留、三类非法值被拒、描述进入 meta。
- 静态自检：`node scripts/selfcheck.mjs` → 90 处导出全部带中文 JSDoc，`any` 仅 1 处（有理由注释）。

### A.4 阶段 6（安装应用）实际过程

- 安装命令：`plugin_manager install_bundle` → `_install\\dsh-grill-first-icon-0.1.0.tgz`（第一次用的是不含图标的 tgz）。
- **踩坑记录**：同一个版本号 + 同一个 `file:` 路径重新打包后再装，pnpm 认为没有变化，返回 `{{"changed": false, "application": "failed", "error": {{"code": "ambiguous-install"}}}}`。改成新路径的 tgz 后立刻成功（`changed: true`，`application: restart-required`）。**结论：本地文件依赖换内容时必须换路径或升版本号。**
- 设置界面：客户端**没有** Config 渲染器（`cordis_inspect_query` 实测 `Client Cordis inspect provider "Config" is not registered`），所以任何第三方插件都只有启用/停用开关。改配置走 profile 的补丁层 `cordis.patch.yml`（文件头自述"id-targeted config overrides"），已写入 strict 并用 profile 自带的 js-yaml 解析校验通过。
- **strict 生效是即时的**：写完补丁层后无需重启——DSH 配置热重载直接让插件 remount 成 strict；随后本代理的 `ops_bash` 当场被拒（拒绝文案与 `GATE_DENY_REASON` 完全一致），再调 `grill_start` 描述清楚的任务返回 `verdict=clear, score=100, gate_state=open` 后放行。**R3/R4 在真机上闭环。**

### A.5 阶段 7（发布）当前状态

- 已就绪：`README.md`（含 7 配置表、跳过词、记忆位置、patch 层改配置说明）、`LICENSE`（MIT，署名 ZTMYchelly）、`CHANGELOG.md`、`icon.png`、`package.json`（icon/author/repository/homepage/bugs/keywords/peerDependencies 齐备）、本地 git 仓库（2 次提交：`e64a4f8`、`149257d`）。
- `npm pack` 产物：30 个文件、约 98 KB，只含 dist + cordis.patch.yml + icon.png + 文档。
- **待用户**：GitHub 建仓库后运行 `G:\\大肥鱼\\推送dsh-grill-first.cmd`；npm 账号注册后再 `npm publish`（包名 `dsh-grill-first` 已确认未被占用）。
""".format(stamp=datetime.now().strftime("%Y-%m-%d %H:%M"))


def main() -> None:
    path = sys.argv[1] if len(sys.argv) > 1 else r"G:\大肥鱼\dsh-grill-first-工作表.md"
    text = open(path, encoding="utf-8").read()

    def repl(match: "re.Match[str]") -> str:
        return f"- [x] {match.group(1)}" if match.group(1) in DONE else match.group(0)

    updated = re.sub(r"- \[ \] (\d+\.\d+)", repl, text)
    if "## 附录 A：阶段执行记录与偏差" not in updated:
        updated = updated.rstrip() + APPENDIX + "\n"

    open(path, "w", encoding="utf-8", newline="\n").write(updated)

    total = len(re.findall(r"- \[[ x]\] \d+\.\d+", updated))
    done = len(re.findall(r"- \[x\] \d+\.\d+", updated))
    print(f"工作表已更新：{done}/{total} 项完成，附录已写入")


if __name__ == "__main__":
    main()
