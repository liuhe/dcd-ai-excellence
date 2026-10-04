# 集成：DCDDP 系统建模方法论

> 集成入口文档：解释怎么把本仓库的 DCDDP 系统建模方法论启用到目标工程。

## 是什么

DCDDP 系统建模方法论是一套描述系统结构的语言：4 视图分层（业务 / 领域模型 / 系统逻辑 / 系统部署）、三层用例结构（业务用例 → 系统用例 → 应用用例）、声明式 What/How 分离。存储（schema 7.0）：`index.yaml` 全览 + 平铺细节文件，节点用不透明 id，归属即 index 嵌套。

**方法论本体（路径相对本仓库根）**：

- 建模约定：`methodology/modeling-conventions.md`
- 元模型 schema：`methodology/meta-model.schema.yaml`
- AI 建模 prompt：`apply/system-modeling-prompt.md`（本目录）
- 参考样板：`methodology/examples/chargable-proxy/`
- CLI 稳定入口：`apply/bin/dcddp`（本目录）；手册：`tools/docs/CLI_MANUAL.md`
- studio 应用：`tools/studio/`（React 模型浏览 / 编辑，`dcddp studio` 启动）

## 启用方式

在本仓库根目录跑 `/dcd-apply <target-path>`（如 `/dcd-apply /path/to/your-project`）：

1. 审查目标工程现状（是否有旧 aie-apply §D 残留 / 是否已装 viewer / settings.local.json 状态）
2. 生成 diff（CLAUDE.md 段更新、settings.local.json 写 `dcd_root`、viewer 安装、`.gitignore` 修补、`projects.local.json` 注册）
3. 用户确认后写入

详见 `.claude/skills/dcd-apply/SKILL.md`。

## 启用后的效果

- **CLAUDE.md 中追加"## 系统建模方法论（DCDDP v6.2）"段**：含核心约定摘要、CLI 用法（禁止直接读 YAML）、方法论真身路径指针、模型 / 代码一致性硬约束、AI 行为指引。CLAUDE.md 是常驻 context，方法论"贯穿所有 AI 交流"——讨论 bug、设计、实现都自动按本方法论的语言进行。
- **不往受管工程装任何文件，也不告知可视化工具**：注入段只含 CLI 与方法论指针。维护者在本仓库侧用 `dcddp studio -m <受管工程模型目录>` 查看 / 编辑。
- **`.claude/settings.local.json` 写入 `dcd_root`**：路径指针，让 CLAUDE.md 段中的 `<dcd-root>` 占位符可被 AI 解析。

## 路径耦合

受管工程 CLAUDE.md 中方法论段含 `<dcd-root>` 占位符，本机绝对路径写在 receiver 的 `.claude/settings.local.json` 的 `dcd_root` 字段（gitignored）。AI 在 Read 方法论文件前先读 settings.local.json 解析占位符。

这样做的好处：
- 本仓库与受管工程的 committed 文件都不含本机路径，可公开
- 多机协作时每台机器只需在 settings.local.json 写自己 clone 的实际位置
- 迁移机器只需改一处

## 与 ai-excellence（`/aie-apply`）的分工

一个受管工程可以被本命令与 `/aie-apply` 同时管，各写各的 CLAUDE.md 段，互不覆盖：

| | `/dcd-apply`（本仓库） | `/aie-apply`（ai-excellence） |
|---|---|---|
| 负责层 | DCDDP 建模方法论 | AI 协作规范 |
| 写入段 | `## 系统建模方法论（DCDDP v6.2）` | `## 硬性约束` / `## 工作模式` / `## ai-excellence 可选规范` 等 |
| 路径变量 | `dcd_root` | 不写 settings 字段（仅本命令执行期间用到 `<aie-root>`） |
| 团队模式依赖 | — | E 团队模式的产品/设计师 agent 引用 `<dcd-root>`，因此**启用 team-mode 前需先跑 `/dcd-apply`** |

## 历史

DCDDP 建模方法论最初借宿在 ai-excellence 的 `methodology/` 目录，通过 `aie-apply §D system-modeling` 分发。2026-08-29 剥离到本仓库（initiative：`projects/reclaim-d-section/`），完成后：

- ai-excellence 的 §D 整节删除；`aie_root` 字段废止
- 本仓库 dcd-apply 成为 DCDDP 方法论的唯一分发入口
- 受管工程首次接管时由 dcd-apply 检测并迁移旧残留（详见 dcd-apply/SKILL.md "aie-apply §D 残留接管迁移"节）
