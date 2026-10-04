---
name: dcd-apply
description: 将 DCDDP 系统建模方法论应用到目标工程（原 aie-apply §D 剥离后的独立分发命令）
user_invocable: true
---

# /dcd-apply <target-path>

将 DCDDP 系统建模方法论（v6.2）注入目标工程：审查现状 → 检测 aie-apply §D 残留并迁移 → 推送最新内容 → 展示 diff → 用户确认后写入。

## 参数

- `<target-path>`：必填，目标工程的绝对路径（如 `/path/to/your-project`）。

## 本工程路径

`<dcd-root>` = 本仓库（dcd-ai-excellence）在用户机器上的绝对路径。通过 `pwd`（在本仓库根目录运行）或 `realpath` 当前 skill 文件位置的祖父目录得到。写入受管工程 `.claude/settings.local.json` 的 `dcd_root` 字段。

## 分工声明

本命令**只管** DCDDP 系统建模方法论层（"## 系统建模方法论"段、CLI 用法、方法论真身指针、静态 viewer 安装）。AI 协作规范层（CLAUDE.md 硬性约束、hooks、knowledge-structure、基础工具 skill）由 `ai-excellence/.claude/skills/aie-apply/` 分发，各写各的段，互不覆盖。

## 推送内容

### 1. CLAUDE.md 段（D-1）

在 `<target>/CLAUDE.md` 追加（或**接管更新**）章节"## 系统建模方法论（DCDDP v6.2）"。内容如下（保持完整，逐字推送）：

````markdown
## 系统建模方法论（DCDDP v6.2 · 存储 schema 7.0）

讨论系统现状、变更前对齐、实现拆解时，统一按本方法论的语言进行。

**三条铁律（先读这里）**

1. 模型只通过 `dcddp` CLI 读写：查看用 list / get / describe，修改用六个动词或 `import` 草稿。**不要 Read / Edit `docs/dcddp-modeling/` 下的 YAML**，不要用 python / grep 代替 CLI。
2. 动手前先 `dcddp validate`，有 `migration-report.md` 先读它。做完再 `validate`，零 error 才算完成。
3. CLI 跑不起来（`dcd_root` 缺失、路径不存在、没 `npm install`）→ **停下来告诉用户怎么配**，不要退回手写 YAML。

### 核心约定（摘要）

- **4 视图分层**：业务视图（参与方/业务用例/系统用例）、领域模型视图（实体/关系/状态机/规则）、系统逻辑视图（应用/拓扑/应用用例/页面）、系统部署视图。
- **Overview / Details 递归**：每个视图先一份精简 overview，再按需展开 details，层数不限。
- **三层用例**：业务用例（价值主张）→ 系统用例（系统对外能力，无规则）→ 应用用例（实现，含规则与 Include/Extend 链）。
- **声明式**：模型表达 What 与约束，AI 推导 How；配置量应远小于代码量。

### 模型存放

模型默认路径：`./docs/dcddp-modeling/`（schema 7.0：`index.yaml` 全览 + `business/`、`applications/` 下平铺细节文件；每个节点有不透明 id）。如需调整，直接编辑本段中的路径即可。

### 本地路径配置

下面引用的 `<dcd-root>` 是 dcd-ai-excellence 仓库在本机的绝对路径，存放在 `.claude/settings.local.json` 的 `dcd_root` 字段（gitignored，每台机器自己配）。**AI 在 Read 方法论文件前先读取该字段获取实际路径前缀，把 `<dcd-root>` 替换成它再做拼接**。

### 读模型：只用 CLI，禁止直接读 YAML

查模型内容（list / get / describe / validate）一律走 `dcddp` CLI，**不要** `ls docs/dcddp-modeling/` + Read YAML，也不要 `cat` / `grep` 原始文件。

原因：CLI 走 loader，会做双语字段归一化、别名合并、schema 校验；直接读 YAML 看到的是未归一化结构，字段名、别名、缺省值都可能与运行时不一致，非常容易得出错误结论。

命令模板：

```bash
# 全览：index.yaml 就是模型目录（每个节点一行 id + name，嵌套即归属）——先读它
# 按 kind 列节点（id + name + 归属）
node <dcd-root>/apply/bin/dcddp list application -m ./docs/dcddp-modeling
node <dcd-root>/apply/bin/dcddp list app-use-case --parent application:web -m ./docs/dcddp-modeling

# 看单个节点（属性、内联规则、出边 / 入边、子节点）；用 id 或 "<kind>:<name>"
node <dcd-root>/apply/bin/dcddp get app-use-case auc-017 -m ./docs/dcddp-modeling
node <dcd-root>/apply/bin/dcddp get entity Tab -m ./docs/dcddp-modeling

# 词汇表：有哪些 kind、每个 kind 的属性 / 放置位置 / 默认文件
node <dcd-root>/apply/bin/dcddp describe
node <dcd-root>/apply/bin/dcddp describe entity

# 校验（孤儿 / 悬空引用 / 缺必填边 / 字段形状）
node <dcd-root>/apply/bin/dcddp validate -m ./docs/dcddp-modeling

# 写模型：add-node / update-node / remove-node / connect / update-edge / disconnect（各自 --help 看参数）
node <dcd-root>/apply/bin/dcddp add-node app-use-case CommandPicker --parent application:web --package "Claude Session" -m ./docs/dcddp-modeling
node <dcd-root>/apply/bin/dcddp add-node rule --parent app-use-case:CommandPicker --set content="…" -m ./docs/dcddp-modeling
```

节点用 id（`auc-017`）或 `<kind>:<name>` 定位；名字在 kind 内不唯一时 CLI 会要求用 id。`--set` 的值以 `[` / `{` 开头时按 JSON 解析，可写列表和结构（如 `fields`）。

完整命令列表见 `<dcd-root>/tools/docs/CLI_MANUAL.md`。

**唯一例外**：排查 loader / CLI 自身 bug、或需要精确定位 YAML 原始字段名 → 归一化 key 的映射关系时，才允许直接读 YAML。

### 写模型：只通过 CLI，禁止手写模型文件

模型文件（`index.yaml` 和 `business/`、`applications/` 下的 YAML）**只能由 `dcddp` 写入**。手写会漏掉 index 登记、取号、边的存储形状和级联清理——只写进细节文件而没进 `index.yaml` 的节点不存在（validate 报 orphan-entry）。

| 场景 | 做法 |
|---|---|
| 动手前 | 先跑 `dcddp validate -m ./docs/dcddp-modeling`：确认 CLI 可用、看当前有哪些问题；若存在 `migration-report.md`，先读它，里面的 dropped references 是待补的边 |
| 增量：加一个节点、连一条边、改名、挪 package、删节点 | 六个动词（add-node / update-node / remove-node / connect / update-edge / disconnect） |
| 批量：初建模型、补一整块（如"业务模型是空的"）、一次补一批节点和边 | 写一份**不带 id 的嵌套草稿** YAML（顶层 `<kind>: [条目]`，嵌套即归属，引用用 `<kind>:<name>` 或唯一的裸名字），`dcddp import draft.yaml --dry-run` 看计划，再去掉 `--dry-run` 写入。草稿格式与样板见 `<dcd-root>/methodology/examples/food-delivery/draft.yaml` |
| 写完 | `dcddp validate` 零 error 才算完成 |
| CLI 跑不起来（`dcd_root` 缺失、路径不存在、`node_modules` 没装） | **停下来告诉用户**，让用户在本机 clone dcd-ai-excellence、`npm install`、在 `.claude/settings.local.json` 写 `dcd_root`。不要退回手写 YAML，也不要用 python 脚本代替 validate |

```bash
node <dcd-root>/apply/bin/dcddp validate -m ./docs/dcddp-modeling
node <dcd-root>/apply/bin/dcddp import draft.yaml --dry-run -m ./docs/dcddp-modeling
node <dcd-root>/apply/bin/dcddp import draft.yaml -m ./docs/dcddp-modeling
```

### 方法论真身（按需 Read 阅读完整内容；`<dcd-root>` 见上）

- 建模约定：`<dcd-root>/methodology/modeling-conventions.md`
- 元模型 schema：`<dcd-root>/methodology/meta-model.schema.yaml`
- AI 建模 prompt：`<dcd-root>/apply/system-modeling-prompt.md`
- 参考样板：`<dcd-root>/methodology/examples/food-delivery/`（`draft.yaml` 展示批量草稿该怎么写）
- CLI 手册：`<dcd-root>/tools/docs/CLI_MANUAL.md`

### 模型 / 代码一致性（硬约束）

模型是 source of truth；代码必须完整反映模型。**这条 override 任何"分阶段做"、"先改一部分"的建议**。

1. **代码反映模型，不是相反**。命名、类型签名、模块边界都跟模型一致——模型说 `Peer`，代码就不能叫 `PeerRoute`。
2. **改模型 = 同步改代码**。模型变更（重命名 / 字段重组 / 关系调整 / 状态机 / archetype 调整）必须**同一次工作**内带代码改动落地，不允许"模型先改，代码下次再排期"。
3. **改代码 = 先对齐模型**。系统变更必须先在模型层讨论清楚（涉及的实体 / 用例 / 规则 / 关系），再动代码——不允许先改代码再回头补模型。
4. **不分阶段、不留半成品**。改动量大时先把模型改完整再让代码一次性追上；不允许"模型半重构"或"代码半重构"。
5. 模型与代码不一致即债务，下个 commit 优先消除。

### AI 行为指引

| 用户说 | AI 应该 |
|--------|---------|
| "改下代码 X" | 先看模型，X 在模型里叫什么？模型未表达 → 先补模型再写代码 |
| "加个新功能" | 先回到用例层（业务 → 系统 → 应用）对齐入口，再涉及实体/规则，最后才进代码 |
| "重命名 X" | 模型 + 代码 + 文档/测试/配置 一次同步改；单点改视为不完整 |
| "这块大改怎么排期？" | **不要主动提议阶段拆分**；用户没要求时默认一次性彻底重构 |
| "看下 xxx 模型 / 这个节点是什么" | 用 `dcddp` CLI（list / get / describe），不要 Read YAML |
| "模型里 xxx 是空的，补一下" / "把 xxx 建模" | 先 `validate` + 读 `migration-report.md`；从代码 / 文档分析出内容，写成草稿，`import --dry-run` 确认后导入；不要直接编辑 `business/*.yaml` |
| "migration-report 里有 dropped references" | 逐条用 `connect` 补边（目标用 id 或 `<kind>:<name>`），补完 `validate` |

补充：
- 用户讨论"某模块/功能/流程"时，先用 4 视图框架反问：当前在哪个视图层？涉及的用例是哪一层？是否已有相关模型文件？
- 模型已存在 → 动手前先用 `dcddp describe`；不存在 → 引导用户从最适合的视图（需求驱动从业务用例 / 技术驱动从系统架构 / 数据中心型从领域模型）开始。
- 用模型推动 AI 写代码（声明式），不是绕过模型直接 prompt。
- **例外**：明确说"我在探讨方向"或"这是一次性 PoC"时可绕过约束；探讨产物不进 main 分支。

集成入口：`<dcd-root>/apply/README.md`
````

### 2. 旧 viewer 残留清理（D-2）

受管工程**不安装也不被告知**任何可视化工具：注入段只有 CLI 与方法论指针。维护者需要看模型时，在本仓库侧用 `dcddp studio -m <受管工程>/docs/dcddp-modeling`（见 `tools/docs/CLI_MANUAL.md`），不写进受管工程。

接管旧安装：

1. 若 `<target>/docs/dcddp-modeling/viewer/`（或旧 `docs/modeling/viewer/`、`docs/modeling/static/`）存在，列入修改方案并在用户确认后删除；它读的是 6.x 布局，7.0 下已失效
2. `<target>/.gitignore` 里的 `docs/dcddp-modeling/viewer/` 一行可删可留（无害）
3. 若旧 `<target>/.claude/skills/model-build/` 或 `model-view/` 存在，列入修改方案并在用户确认后移除

合规检查：`<target>/docs/dcddp-modeling/viewer/` 不存在，`model-build` / `model-view` skill 不存在。

### 3. 注册到本仓库统一工程列表

在 `<dcd-root>/projects.local.json` 中追加该工程（若文件不存在则新建）。格式：

```json
{
  "projects": [
    { "name": "<工程名>", "path": "<target>/docs/dcddp-modeling" }
  ],
  "current": "<工程名>"
}
```

- 若文件已存在，merge 进 `projects` 数组（按 `name` 去重），`current` 不覆盖（保留原值）
- `<dcd-root>/projects.local.json` 已在 `.gitignore`，无需额外处理

### 4. 受管工程 settings.local.json

在 `<target>/.claude/settings.local.json` 写入（merge）：

```json
{ "dcd_root": "<dcd-root 实际绝对路径>" }
```

同时**删除**（如存在）旧字段 `aie_root`（原属 aie-apply §D，已剥离）—— 参见下方"aie-apply §D 残留接管迁移"。

确保 `<target>/.gitignore` 含 `.claude/settings.local.json`。

## aie-apply §D 残留接管迁移（一次性）

本命令是原 `aie-apply/SKILL.md §D` 的接手方。若目标工程之前被老 aie-apply 覆盖过，会有以下残留，本命令负责一次性迁移干净（**不做兼容层**）：

| 残留 | 检测方式 | 迁移动作 |
|---|---|---|
| CLAUDE.md 里"## 系统建模方法论"段是旧 3 视图版本 | 段内含"3 视图分层"字样 | 整段替换为上面的 D-1 v6.2 内容 |
| CLAUDE.md 段中含 `<aie-root>` 占位符 | grep `<aie-root>` 在该段 | 替换为 `<dcd-root>` |
| CLAUDE.md 段引用 `<aie-root>/methodology/...` | 同上 | 路径改为 `<dcd-root>/...`（去掉 `methodology/` 层级，因为方法论已在 dcd-ai-excellence 根） |
| settings.local.json 里有 `aie_root` 字段 | 直接读 JSON | 若同时无 `dcd_root`，把 `aie_root` 的值改写到 `dcd_root`；然后**删除** `aie_root` 字段 |
| CLAUDE.md "## ai-excellence 可选规范" 段仍列 `system-modeling` | grep 该段 | 提示用户手动删除（该条目现在归 dcd-apply 管，不再由 aie-apply "可选规范" 维护） |
| 模型目录里有 `business.yaml` 而没有 `index.yaml`（6.x 存储） | `ls docs/dcddp-modeling` | 在目标工程目录下跑 `node <dcd-root>/apply/bin/dcddp migrate -m ./docs/dcddp-modeling`，审阅 `migration-report.md` 的"无法解析的引用"后随模型一起提交 |
| receiver 曾用 aie-apply D-2 装过静态 viewer | 检查 `docs/dcddp-modeling/viewer/` | 删除（D-2） |

所有迁移动作作为 diff 展示给用户确认后再写入。

## 执行步骤

1. **解析参数与 `<dcd-root>`**
   - 确认 `<target>` 存在
   - 计算 `<dcd-root>`（本 skill 文件位置的祖父目录 = `.claude/skills/dcd-apply/` 的上三级）

2. **审查 `<target>`**
   - 读 `<target>/CLAUDE.md`：
     - 是否已有"## 系统建模方法论"段？内容是 v6.2 4 视图 还是旧 3 视图？
     - 是否含 `<aie-root>` 占位符（旧 aie-apply §D 残留）？
     - "## ai-excellence 可选规范" 段是否列 `system-modeling`（过期条目）？
   - 读 `<target>/.claude/settings.local.json`：
     - `dcd_root` 是否已正确指向 `<dcd-root>`？
     - 是否残留 `aie_root` 字段？
   - 读 `<dcd-root>/projects.local.json`：该工程是否已注册？
   - 检查模型目录是否为 7.0（有 `index.yaml`）；6.x 列入迁移方案
   - 检查旧静态 viewer / 废弃 skill 是否残留（见 D-2）
   - 检查 `<target>/.gitignore` 是否含 `.claude/settings.local.json`

3. **输出审查报告**
   - 列出缺失项 / 不合规项 / aie-apply §D 残留项
   - 全合规 → 报 ok 直接结束

4. **生成修改方案（diff）**
   - CLAUDE.md：合并/接管更新（保留项目原有其它内容，把 D-1 段追加或整段替换到合适位置）
   - `<target>/.claude/settings.local.json`：写 `dcd_root`，删 `aie_root`（若有）
   - `<target>/.gitignore`：补 `.claude/settings.local.json`（如缺）
   - D-2：删除残留的静态 viewer / 废弃 skill（如有）
   - `<dcd-root>/projects.local.json`：merge 注册

5. **展示 diff，请用户逐项确认**

6. **写入并报告结果**
   - 提示：验证方式 = 在 `<target>` 下跑 `node <dcd-root>/apply/bin/dcddp validate -m ./docs/dcddp-modeling`

## 关键约束

- 所有写入前必须给 diff 让用户确认
- CLAUDE.md 是**合并**而非覆盖（其它段保留），只有"## 系统建模方法论"段本命令有权整段替换
- 不动目标工程的代码、模型数据、其它配置
- 不写 `aie_root`（该字段随原 aie-apply §D 剥离一起废止）
