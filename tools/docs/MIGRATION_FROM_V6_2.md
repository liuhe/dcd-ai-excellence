# 从 v6.2 迁移到 v7

如果你有一份基于 v6.2 建的模型（跟着 [v6.2 方法论文档](../../v6/v6.2/) 建、经 `ai-excellence/methodology/v6.2/` 分发下来的），这份文档说清楚：**什么变了，怎么升级**。

## TL;DR

**YAML 字段和语义没变。** v7 工具能直接读 v6.2 模型文件。有两处**目录/头部小改动**要注意：

1. **业务模型 relocate**：`model/business-model.yaml` + `model/business-model/` → `model/business/business-model.yaml` + `model/business/business-model/`（嵌到 `business/` 下面，跟"业务模型是业务视图 details 的一部分"对齐）
2. **`schema_version: "2.0"` 强制**：写在 `business.yaml` 顶部（loader 缺失时会 warn；将来驱动数据 migrate）

其他一切——字段名、嵌套、双语 keys、detail 文件约定、diagram 引用、四色 archetype、DDD 构造块——**逐字未动**。

已有 v6.2 模型的最小升级步骤：

```bash
# 1. 把 business-model 挪到 business/ 下面
cd <model-root>
mkdir -p business
git mv business-model.yaml business/business-model.yaml
git mv business-model business/business-model

# 2. 校对 business/business-model.yaml 里的 detail: 指针
#    （它们应该仍然写作 ./business-model/<Entity>.yaml——因为路径是相对
#     business/business-model.yaml 的位置的，不用改）

# 3. business.yaml 顶部加 schema_version
sed -i.bak '1a\
schema_version: "2.0"\
' business.yaml && rm business.yaml.bak

# 4. 验证
dcddp validate -m .
```

（后续会有 `dcddp migrate --from-methodology v6.2 --to v7` 命令把这 4 步自动化。）

## 什么没变

| 方面 | 状态 |
|------|------|
| 顶层视图文件（`business.yaml` / `applications.yaml` / `deployment.yaml`） | **未变** |
| 业务模型挪到 `business/` 子目录 | ⚠️ 目录移动（见 TL;DR 步骤） |
| `business.yaml` 顶部 `schema_version: "2.0"` | ⚠️ v7 强制；v6.2 发布时还没这条 |
| 3 视图（业务 / 应用 / 部署） | **未变** |
| Overview / Details 递归 | **未变** |
| 双语（EN/ZH）keys | **未变** |
| 四色 archetype 的业务实体（`business/business-model/`） | **未变** |
| 每个 app 的 `domain_model:` 段（DDD 构造块） | **未变** |
| SVG diagram 通过 `diagram:` 字段引用 | **未变** |
| Viewer（React 应用）UI/UX | **未变**——同一个 viewer、同一个 models.json |

## 什么变了

### 1. CLI 面

v6.2 工具累积到 25+ 个命令（每种元素一个家族：`add-rule`、`update-rule`、`remove-rule`、`add-relationship`、`add-transition`、`add-association`、`add-member` / `remove-member`，加上按类型的 `add / update / remove / rename`）。

**v7 收敛到 6 个图原语动词**，由 vocabulary registry 驱动（`tools/core/src/vocabulary.ts`）：

```
dcddp add-node    <kind> <name>              [--set k=v ...]
dcddp update-node <kind> <name>              [--set k=v ...] [--unset k ...]
dcddp remove-node <kind> <name>
dcddp connect     <from> --rel <r> --to <to> [--set k=v ...]
dcddp update-edge <from> --rel <r> --to <to> [--set k=v ...] [--unset k ...]
dcddp disconnect  <from> --rel <r> --to <to>
```

加上读命令：`list / get / validate / describe / migrate`。

### 2. 概念框架（方法论文档）

v6.2 说的是"element"、"sub-resource"、每种类型自己的命令族。

v7 说的是**四层 stack**：

- **Layer 1（KG substrate）**——原语数据模型：一切是三元组 `(subject, predicate, object)`
- **Layer 2（meta-model）**——在 KG 之上的封闭 vocabulary，声明 node-kind / rel-kind（存放在 `tools/core/src/vocabulary.ts`）
- **Layer 2.5（project vocabulary）**——用户项目里声明的 VO 类型（可选，未实现）
- **Layer 3（instance graph）**——用户项目的具体图，over Layer 1

详见 [`DESIGN.md`](DESIGN.md)。

### 3. 命名清理（大多是收敛）

v7 里有些字段名/术语在方法论侧做了清理，但 loader 同时接受新旧名，兼容。canonical 名字见 `methodology/meta-model.schema.yaml`。

## 升级步骤

### 场景 A：项目由 ai-excellence 管理（典型）

1. **`ai-excellence/methodology/` 更新到包含 v7**（由 dcddp 侧 `/sync-to-aie` 自动完成）。sync 之后，`methodology/v6.2/`（冻结）和 `methodology/v7/`（当前 active）并存。
2. **在受管项目里**决定用哪套方法论。新项目直接上 v7；已有项目可继续留 v6.2 或选择切 v7。
3. **如果选切 v7**：把之前调的 v6.2 `dcddp`（在 aie/methodology/v6.2/cli/）换成 v7 的（aie/methodology/v7/cli/）。你已有的 YAML 不用改，新的 mutation 走 v7 命令。
4. 可选：切 v7 后跑一次 `dcddp validate -m <model-root>`，看 vocabulary registry 有没有对某些属性给 warning（比如属性名不在 vocabulary 里）。

### 场景 B：独立项目（不走 aie）

同理：

1. 装 v7 工具（从 `tools/cli` npm link 或走 workspace）
2. 继续用你已有的 YAML——v7 CLI 读得懂
3. 新的 mutation 走 v7 的 6 动词

## 回滚

`v6/v6.2/` 是冻结的，随时可以指回去。v6.2 和 v7 工具**并行不冲突**——它们共享同一个 YAML 格式。

## 数据 schema migration

跟 v6.2 → v7 的方法论升级独立。如果 dcddp 引入新的**数据** schema 版本（比如 `schema_version: "2.1"`），在 v7 里跑 `dcddp migrate --to 2.1 -m <model>` 升级数据文件。已注册的 migration 见 `core/src/migrations/`。

## 卡住时怎么反馈

- vocabulary 不包含你要的 kind → 提 issue / PR 到 `tools/core/src/vocabulary.ts`
- v6.2 用惯的某命令 v7 里没对应 → 先跑 `dcddp describe` 看看；确实缺就报请求。**不要退回手编 YAML。**
- schema 校验太严 / 太松 → 反馈；当前的严格模式是"未知属性 warn"，可以调
