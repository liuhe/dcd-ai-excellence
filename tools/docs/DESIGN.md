# v7 设计原则

> v7 的架构原则。任何工具（CLI、viewer app、未来的编辑器）——一切读写 DCDDP 模型的地方——都要遵守。
>
> YAML 存储映射（schema 7.0：index.yaml + 平铺细节，哪个字段放哪个东西）：见 [STORAGE.md](STORAGE.md)
> CLI 具体用法：见 [CLI_MANUAL.md](CLI_MANUAL.md)

## 四层 stack

一切叠在这个 stack 上。每一层只感知它紧下面的一层。如果一个设计决定伸手越过它自己的层，停下来重新想。

**Layer 1 — KG substrate（数据模型本身）**  
原语：一切都是三元组 `(subject, predicate, object)`。节点有 URI（或是匿名 blank node）；边是有标签的 predicate；属性其实就是 object 为字面量（string / number / boolean）的三元组。这一层**没有"什么 predicate/attr 是允许的"的规则**——纯 KG、open-world。dcddp 对模型说的每一句话，在这一层都归约到三元组。

**Layer 2 — Meta-model（方法论固定的 schema，在 KG substrate 之上）**  
在 substrate 上，dcddp 定义了 **封闭 vocabulary**——允许的 node-kind、rel-kind，以及每个 kind 的 schema（哪些属性合法、边的端点是什么类型、存到 YAML 哪个槽位）。放在 `tools/core/src/vocabulary.ts`（source of truth），跟 `methodology/meta-model.schema.yaml`（给 AI/人看的 source of truth）镜像。**dcddp 版本演进时才动**，普通用户不扩展 Layer 2。

**Layer 2.5 — Project vocabulary（项目自己的类型，在 meta-model 之上）**  
用户声明的 VO 类型、枚举等。相对 Layer 2 的**可选精化**——先 untyped 起步，某种形状重复出现了再声明。v7 还没实现。

**Layer 3 — Instance graph（用户的具体项目数据）**  
Layer 2 kind 的具体实例——用户的 entity、use case、application，以及它们之间的边和属性。canonical 磁盘形态（schema 7.0）是一个目录：`index.yaml` 列出每个节点（id + name，嵌套即归属，package 即分组），`business/` 与 `applications/` 下的平铺细节文件按 id 装属性与非归属边。文件边界不承载语义。工具把它 materialize 成 Layer 1 上的一张有标签有向图。

### 为什么这样分

- **Layer 1 是"KG 语义处处适用"的根据**（add-node / connect / disconnect 骨子里就是三元组操作）。这一层不显式出来，meta-model 就像"任意的文件操作规则"；显式出来后，一切成了"受约束的 KG mutation"。
- **Layer 2 是"能做校验和自省"的根据**（`describe`、endpoint 检查、存储映射）。它是 schema 层，不是数据层。
- **Layer 2.5 是"Layer 2 太粗"的可选出口**——有些属性需要 Layer 2 没提供的 shape 检查。
- **Layer 3 是 git 追踪的东西，也是用户编辑的东西**（通过 CLI、App，或手工）。

## 界面层放在 core 之上，不属于任何单一工具

`@dcddp/core` 装所有共享逻辑：loader、types、vocabulary、graph ops、yaml round-trip helpers。**每个界面都消费 `@dcddp/core`。**

目前有三个界面：

1. **CLI（`tools/cli/`）**——`dcddp` 命令行。命令 dispatch、参数解析、终端输出格式化。
2. **Viewer（`tools/studio/`）**——React viewer（未来会加 editor）。渲染、UI 状态。
3. **手工直接编辑 YAML（人 + 文本编辑器）**——只要人能找到对的文件 + 对的槽位就合法。**由** `dcddp describe` 把存储位置用领域语言暴露 + [`STORAGE.md`](STORAGE.md) 系统性文档所有映射模式 **提供保障**。

第三种没有代码——只有一个人 + 一个编辑器。但它是**一等支持路径**，因为：

- Vocabulary registry（Layer 2）是 authoritative——describe 从它读，STORAGE.md 从它派生
- yaml@2 round-trip 保留注释和格式，手工编辑**能干净地和后续 CLI mutation 共存**
- `dcddp validate` catch 结构性错误，无论是谁写的

**实际保障**：`dcddp describe <kind>` 应该给人足够信息，让他能找到对的文件 + 对的槽位、手工填写正确。如果 describe 留有歧义，那是 describe 的 bug，**不是**"用户应该走 CLI 而不是手工"的借口。

### 新代码放哪的规则

- **如果两个界面会想要同一个行为 → `core/`**
- **如果它是纯呈现**（help 格式化、JSX 组件、键位）→ 那个界面的包里
- **如果它是一份 spec / catalogue / vocabulary** → 文档形式（STORAGE.md / DESIGN.md / meta-model.schema.yaml），从同一份 registry 派生

第三种界面这条约束让每个人保持诚实：**如果一个 knob 只有 CLI 能操作、或只有 App 能操作、手工编辑找不到——那这个 knob 就不该存在**，或者应该提升到 core + 文档里。

## 三种原语，不多也不少

分类停在三个：**实体（node）**、**关系（edge）**、**属性（挂在两者之一上的 property）**。一切归约到这三种：

- 有名字的东西（BUC、App、Entity、DDD 构造块、Rule……）= 有 URI 的节点
- 匿名的连接器（composition、association、transition、has-rule……）= 边
- 其他一切（name、cardinality、type、archetype、from-role、to-role、content、notes……）= 属性

"类型"是属性。"kind"（节点/边的种类）是**元数据**。两者都是 vocabulary registry 里的**数据**，不是代码路径。

## 6 个图原语动词，由 vocabulary 驱动

```
add-node    <kind> [name] [--parent <ref>] [--package <path>] [--set k=v ...]
update-node <kind> <ref>  [--set k=v ...] [--unset k ...]      # name / package / parent 也走 --set
remove-node <kind> <ref>                                        # 级联子树 + 清引用

connect     <from> --rel <r> --to <to> [--set k=v ...]
update-edge <from> --rel <r> --to <to> [--set k=v ...] [--unset k ...]
disconnect  <from> --rel <r> --to <to>
```

`<ref>` 是节点 id（`auc-017`）或 `<kind>:<name>`。归属（父子）不是 connect 的对象——它由 `--parent` / `--set parent=` 决定，并体现在 index.yaml 的嵌套上。

每个动词都通过 Layer 2 做校验和存储映射。**加 kind = 加一条 registry 条目；不需要新动词**。如果你发现自己在写 `add-<kind>` 动词，那就违反了这条。

## Principle 1 — 用领域标识做 handle，永远不用位置

| 元素形态 | Handle |
|---------|--------|
| Named node | 它的 `name` |
| Qualified node | `parent.child` 或 `parent/child`（跟引用语法保持一致） |
| Reified 边（升级成节点，如 Rule） | 内容匹配或用户指定的名字 |
| Edge (from, rel, to) | 三元组本身——没有独立 id |
| Attribute | (owner, key) |
| Escape hatch | 位置（`--index N`）——永远不做默认 |

Handle 必须在插入、删除、并发编辑面前保持稳定。数组下标不满足这个。

## Principle 2 — 动词描述"图操作"，不描述 YAML 编辑

说 `connect entity:Account --rel associates --to entity:Package`，不说 `update relationships[0].target=Package`。

**文件路径是实现细节。** 动词不暴露改动落到哪个 YAML 文件。同一个逻辑边在不同布局下可能存到不同物理位置，动词应该一模一样。

## Principle 3 — 什么该是节点、什么该是边

一个新概念冒出来时，先问自己四个问题，按顺序判：

### 3.1 独立身份（Identity Independence）

**这东西离开任何关系还有意义吗？**

- 有 → **node**（它是"物"）
- 无 → 是"关系本身"，就是 **edge**

- `value-object:UsageRecord` — 离开谁用它也照样是个类型定义 → node
- `aggregate` — 一个聚合离开"根 + 成员"就没内容了；它就是"这组东西属于同一聚合"这件事本身 → edge (`aggregates`)
- `external-party:Taobao` — 离开使用它的 BUC 依然存在 → node
- `actor`（"BUC 由谁执行"的连接语义）— 单看没意义，是描述连接本身 → edge (`has-actor`)，其中执行者本身是 node

### 3.2 被多处引用（Reference Multiplicity）

**是不是会被 N 个地方引用？**

- 是 → **node**（值得抽出去共享，避免重复描述）
- 否，只属于一个宿主 → **attribute** 或 embedded

- `entity:Package` — 被 Account / PackageTemplate / ... 多方引用 → node
- `field` — 只属于某个 entity 的 schema，没别处引用 → attribute（`entity.fields[]`）

### 3.3 集合语义 vs 实体语义（Set-Semantics vs Entity-Semantics）

**它本质是"一组东西"还是"一件东西"？**

- 一组 → **edge**（承载"这组东西属于同一 X"的关系）
- 一件 → **node**

- `aggregate` = "Account 聚合了 {Package, ProxyTier}" 是分组关系 → edge
- `participant` = 具体的一个参与角色（Player）→ node

### 3.4 需要独立出边（Own Out-Edges）

**这个"关系"需要引用两个端点之外的其他东西吗？**

- 需要 → **升格为节点（reify）**。经典例子：`rule` 要引用 entity + 引用 app-uc，无法只作为"someone → rule → someone"的边元数据表达

边可以带轻量的限定属性（cardinality、from-role、via、trigger），但一旦"关系"要挂自己的出边，就必须 reify。

**Reify 不是 workaround，是复杂度增长时从"边"到"节点"的正确升级路径。**

### 决策矩阵（历史决策沉淀）

| 概念 | 3.1 独立身份 | 3.2 多处引用 | 3.3 语义 | 3.4 需要出边 | 结论 |
|---|:---:|:---:|:---:|:---:|:---:|
| `aggregate` | ✗ | — | 集合 | ✗ | edge |
| `value-object` | ✓ | ✓ | 实体 | ✓（引用其它 VO / 类型） | **node** |
| `role` | ✓ | ✓（多 entity implements） | 实体 | ✓ | **node** |
| `domain-event` | ✓ | ✓（emit / handle 两端引用） | 实体 | ✓ | **node** |
| `domain-service` | ✓ | ✓（跨聚合被调用） | 实体 | ✓ | **node** |
| `rule` | ✗（依附 owner） | ✗（每条独属一个 owner） | 实体 | ✓（多 entity / uc 引用） | **node**（3.4 触发 reify） |
| `child entity` | ✗（就是 entity 的一种角色） | — | — | — | 不拆，用 `entity` |
| `repository` | 弱 | — | — | — | 不加（基础设施层，无独立域语义） |
| `field` | ✗ | ✗ | — | — | attribute |
| `organization` / `business-worker` / `external-party` / `participant` | ✓ | ✓ | 实体 | ✓ | **node** |
| `has-actor` | ✗ | — | 关系 | ✗ | edge（derived from scalar attr） |
| `provides`（org 提供 BUC） | ✗ | — | 关系 | ✗ | edge |

### 灰色地带

有些概念可以两派解读，看应用场景：

- **`aggregate` 如果哪天要挂"聚合级不变量"、"聚合级并发策略"** 等只属于聚合而非任何单个 entity 的元数据，就该 reify 成 node
- **`field` 如果哪天要单独查询"哪些字段用了 UsageRecord 类型"** 且要维护字段级历史/权限，也应 reify

**规律**：先按 3.1–3.3 决定（默认最轻的编码）；后来若发现"关系"要挂更多东西，3.4 提示 reify。

## Principle 4 — 属性 vs 关系：禁止 attr-as-ref，值类型系统独立

**规则**：node attribute 的值不能是"对另一节点的引用"。所有节点间连接必须走 rel-kind。

**支撑基础**：独立的值类型系统（value-type，v6 引入），承担字段/属性的"类型标记"角色，不侵占节点关系空间。

### 值类型 taxonomy

- **Primitive**（内置）：`String` / `Long` / `Integer` / `Boolean` / `Double` / `LocalDateTime` / `Date`
- **Free-text**：明确"非结构化 prose"的 escape hatch，区别于 `String`
- **User-defined**（domain VT）：每个 VO 的 name（app-scoped）——VO **不是** node，是纯 value-type
- **Composite**：`List<T>` / `Map<K,V>` / `Optional<T>`（文本，递归）

### 三条例外，其余禁止

允许 attr-as-ref 的**受控例外**：

1. **Value-type 使用**：`entity.fields[].type: UsageRecord` 里的 `UsageRecord` 是 value-type 名字，不是 node 引用（VO 不是 node）。这**不算** attr-as-ref
2. **Scalar-storage rel 的 YAML 形状**：如 `buc.actor: Player` 看起来像 attr，但 vocabulary 声明它是 `has-actor` rel 的 scalar 存储。YAML 形状允许，语义上是 rel
3. **生态兼容**：以后如果 import SQL/HTML 之类外部数据，其"外键属性"暂时保留 attr-as-ref 形式再逐步 normalize——目前无此需求

除以上三类，任何"某 attr 的值 = 另一 node 的名字"**必须**在 vocabulary 里 formalize 为 rel-kind（explicit edge 或 scalar-storage rel）。

**判据**：想清楚 attr 的"值域"——是字面量还是节点？是节点就是 rel。

## 不可协商

- **绝不**用数组下标作匿名列表项的唯一 handle
- **绝不**在动词面暴露文件路径（`-m` 模型根目录例外）
- **绝不**允许 AI 在动词缺失时回退到手编 YAML。缺就停手 + 请求；没有例外
- **绝不**把共享逻辑放到界面包（`tools/cli/`、`tools/studio/`）里。它属于 `tools/core/`

## 反模式，以及它们为什么会挂

| 反模式 | 挂在哪 |
|--------|--------|
| 按 kind 一族一族的动词（`add-rule`、`add-relationship`…） | API 面随 kind 线性膨胀；加一种 kind 就得改代码；用户得记 N 个家族而不是学一套原语 |
| 基于 index 的 mutation（`update … --set rules.0.content=X`） | 插入就错位；并发编辑无声损坏 |
| 一个 `patch --json-patch '…'` 当唯一入口 | 要求用户脑子里装整个 schema 树；报错信息帮不了忙；AI 拼路径很难 |
| `edit <element>` 打开 $EDITOR | AI 和 CI 用不了；只帮到交互式的人类 |
| 把共享逻辑放在 `cli/` 或 `viewer/` 里 | 其他界面得重新实现或复制粘贴；漂移就此累积 |
| 用固定的 per-kind 命令加 `--kind` 路由参数 | 丢了 schema 感知；报错通用；AI 得记每个 kind 的路由参数 |

## Vocabulary 命名与语义卫生

Vocabulary 是**给人和机器同时读的语言**。跟自然语言一样会遇到：**同名多义**（signifier 歧义）和**同义多名**（signified 冗余）。这些**都是设计红旗**，识别到就处理。

**核心原则：一 kind 一语义（signifier ↔ signified 双射），拆比合安全**

三种典型信号，都要警觉：

| 信号 | 例子（v2 → v3 已修正） | 处理 |
|------|-----------|------|
| **同名多义**：一个 rel-kind 承担多个语义，靠 endpoint 隐式分裂 | 旧 `implements` 同时表示"OOP 实现"（entity→role）和"DDD 跨层实现"（app-entity→business-entity） | **拆开命名** → v3 拆为 `implements`（仅 OOP）+ `realizes`（DDD 跨层）。语义是 rel-kind 的一等属性，不该埋在 endpoint 里让人自己拼 |
| **同义多名**：多个 rel-kind 表达同一件事，只是走不同存储 | 旧 `about` / `related-to` / `rule-uses-uc` 都是"这里指到那里" | 命名收敛到同一动词 → v3 统一为 `references`，靠 `endpoints[]` 分派各 endpoint 独立 storage（page→uc / rule→entity / rule→uc） |
| **命名风格不一**：动词式 / 关系名词式 / OOP 术语混着用 | 旧 `system-uses`（动宾）、`entry-to`（关系名词）、`implements`（OOP）、`composition`（DDD）混用 | 收敛到两条 pattern → v3：**UML/DDD 术语原样保留**（includes / extends / composition / associates / depends-on / implements / realizes）；**其余用纯动词**（uses / has-entry / references / has-uc / has-rule） |

**规则**：如果两条 rel-kind 的语义靠人"记住 endpoint 隐式规则"才能区分——拆。如果两条 rel-kind 是同一件事——统一命名，用 `endpoints[]` 分派存储。规则性的语义永远比省几个词重要。

**Vocabulary 不能自己发现问题**——只能在 review 时 audit。计划：每次 vocabulary 有实质增补前先 audit 一次现有的命名一致性。上一次 audit 见 [`vocabulary-audit-2026-08-12.md`](vocabulary-audit-2026-08-12.md)。

## Vocabulary 需要扩展的时候

加一个新的 node-kind 或 rel-kind：

1. 在 `tools/core/src/vocabulary.ts` 加一条（声明存储映射、端点、属性）
2. 如果这个新映射引入了 STORAGE.md 里还没覆盖的模式，更新 STORAGE.md
3. 更新 `methodology/meta-model.schema.yaml`（AI/人面向的方法论 spec）描述新 kind
4. 完事——不改界面代码，不加新命令。现有动词自动认新 kind

如果你发现自己得改界面才能加一个 kind，说明设计逃逸了 vocabulary 驱动，很可能违反了上面某条原则。
