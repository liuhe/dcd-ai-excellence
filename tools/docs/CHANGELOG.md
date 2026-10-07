# DCDDP v7 Changelog

格式遵循 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)，版本号遵循 [semver](https://semver.org/)。

范围：本仓库的一切——方法论文档、元模型 schema、`@dcddp/core`、`@dcddp/cli`、`@dcddp/kg-web`、`@dcddp/studio`。发布版本号是"包版本"级别，在 v7 方法论线内递增。

v7 之前（v1..v6.2 方法论迭代）的历史，见 `v6/v6.2/` 及其祖先。

## [Unreleased] — 2026-10-04（schema 7.0：存储结构重设计，未发布）

**Layer 3 breaking**：模型目录从"按父节点嵌套 + 一实体一文件 + 一应用一文件"改为"**index.yaml 全览 + 平铺细节文件**"，所有节点用不透明 id。6.0 模型由 `dcddp migrate` 一次性迁移（写 `migration-report.md`）。设计稿见 `projects/storage-v7/overview.md`。

### 存储

- `index.yaml`：唯一的存在性来源；每个节点一行 `{ id, name }`，嵌套 = 归属，`package:` 包装项 = 分组（可多级、适用所有 kind），`sequences` 为各前缀取号计数
- 细节文件：`business/{actors,business-use-cases,systems,entities}.yaml`、`applications/applications.yaml`、`applications/<app-id>-<name>/{use-cases,pages,domain}.yaml`；格式 `<kind>: [条目]`，条目以 `id` 开头。**文件边界无语义**，loader 读目录下全部 YAML；超过 400 行自动分片
- id：`<前缀>-<序号>`（org / bw / ep / pt / buc / sys / suc / app / auc / pg / ent / vo / enum / role / svc / evt / rule），单调递增不复用；所有引用改为 id，name 只是展示名
- 归属边放 index（containment 形态），其他边随源节点（string-list / scalar / struct-list / derived，值为目标 id）
- 聚合不再有包装块：根实体就是节点，成员与聚合内 VO 嵌套在它下面；invariants / repository 落在根实体
- 规则（rule）是内联节点：有 id、住在 owner 条目的 `rules[]`，不进 index

### Vocabulary（Layer 2，小改）

- `value-object` / `enum` 回归 node-kind（`valueType: true`），进 index 与侧边栏；`uses`（entity → value-object）派生边恢复，按同一 application 内的名字解析
- `has-actor` 新增 system-use-case / app-use-case → application 端点（6.0 里 68 条悬空边的根因）
- `implements` 新增 entity → entity 端点（业务层 PPT/MI 实现 archetype=role 的实体）；跨层实现统一为 `realizes`
- `fields` / `payload` 类型从 `free-text` 改为 `field-list`，validate 检查形状；`includes` / `extends` 改为 string-list
- 新增 containment rel：`has-value-type`；`aggregates` 改为 containment

### 2026-10-04 追加：resource（技术资源 / 集成点）

- 新 node-kind `resource`（前缀 res，挂在 application 下；attrs：type / spec / summary；type 封闭取值 api / topic / table / cache-key / queue / file / bucket）
- 第三个视图 **deployment**：index.yaml `deployment:` 段 + `deployment/` 细节目录。两个 kind：`data-source`（业务数据：mysql / redis / kafka / hive / cassandra / s3 / …，`endpoint`）与 `observability-store`（指标 / 日志 / 链路：prometheus / loki / tempo / …，`grafana_url`、`grafana_datasource_uid`）；两条 rel：资源 `stored-in` 数据源、指标 `sourced-from` 可观测性存储（都存 `store`）。studio 侧边栏“部署视图”（有节点才出现）、两类节点页、资源页“存放于”、指标与用例 / 实体页上的 Grafana Explore 深链（存储的 `ext.grafana_datasource_uid-<后缀>` 每个键再多一条链接）
- 新 kind `solution`（应用视图根，`applications/solutions.yaml`）与 rel `covers`（方案 → 任意应用的用例 / 实体）：按关注点切分应用层，如某实体的生命周期处理；studio 侧边栏“方案”组、方案页画按应用分簇的用例图和实体关系图
- 注入段：模型文件只由 CLI 写入，禁止手写；动手前先 `validate` 并读 `migration-report.md`；CLI 不可用时停下来让用户配置，不退回手写；行为指引新增“补一块模型”“dropped references”两行
- 新 kind `metric`（name + `expression`，数据来源等放 `ext`；业务指标在业务视图根，技术指标挂应用下）与 rel `measures`（指标 → 任一层用例 / 实体）；studio 侧边栏“指标”组、指标页、用例 / 实体页“监控指标”分区
- 任意节点可带 `ext` map 扩展属性：CLI 不再对它告警，validate 检查是 map，studio 只读展示 / JSON 编辑
- `uses` 新增 business-use-case → entity 与 system-use-case → entity 端点（mode read / write，存 `entities` 字段）；validate 检查目标必须是业务层实体（layer）。studio 业务 / 系统用例页“涉及的业务实体”，实体页“被哪些用例使用”含三层用例
- `dcddp import <draft.yaml>`：不带 id 的嵌套草稿一次导入（取号、放置、引用解析、校验；任一引用失败整份拒绝）。批量建模走它，增量操作走六个动词。同名引用按源节点所在范围优先，可用 `<kind>:<祖先名>/<name>` 限定
- 样板工程换成 `methodology/examples/food-delivery`（QuickBite 外卖平台，7 个应用，含生成它的 `draft.yaml`）；chargable-proxy 退役，6.0 迁移夹具保留
- 修复：`init` 生成的空文件是 flow 风格 `{}`，之后 add-node 写入的整个文件都变成 JSON 样式；现在根节点强制 block 风格
- 新 containment `has-resource`；新 rel `exposes`（app-use-case → api 资源：用例实现端点）；`uses` 新增 app-use-case → entity（mode read / write）与 entity → resource（table / cache-key / file / bucket 用 read / write，topic / queue 用 publish / subscribe）两条端点。数据路径：用例 → 实体 → 存储 / 消息
- validate 检查 resource.type、uses.mode 与资源类型的匹配、exposes 目标必须为 api、边端点 kind 必须在 vocabulary 允许之列（bad-endpoint）；studio：应用下"资源"组、用例页"接口 / 使用的实体"、实体页"使用的资源 / 被哪些用例使用"、资源页"由哪些用例实现 / 被哪些实体使用"，表单一步建资源并连边
- schema NOTE 19、建模约定 §11.5

### 工具

- core 重写：`index-file`（index 读写与取号）、`loader`（index + 平铺 → Graph）、`graph`（6 动词 + move + scaffold）、`validate`、`ref-cleanup`、`reader` 抽象；旧的文件形状 `Model` 类型与 `graph-view` 移除
- CLI：`list` / `get` 显示 id + name + 归属；`add-node --parent / --package`，`--set` 接受 JSON 结构值；`update-node --set name/package/parent`；`remove-node` 级联；新增 `init`；`migrate` 支持新建 / 删除文件与报告；`vt` 建在节点之上
- kg-web：server 线上形状保持 `kind:id`；client 新建节点走 parent；6.0 模型给迁移提示
- studio：侧边栏由 core `buildTree` 按 index 渲染；渲染层经 `graph-to-model.ts` 投影（过渡方案，加编辑能力时重写）
- studio：应用视图侧边栏按 application 的 package 折成 📦 文件夹（多级），与用例 / 资源列表同一套 `packageTree`；此前 application 的 package 只在 CLI 与详情页可见，侧边栏平铺

## [Unreleased] — 2026-08-13（vocabulary v6.0 audit round-4，未发布）

**架构级 breaking**（v7 未发布，无 alias）：

### 引入值类型系统（value-type）

- 独立于 node-type 的 schema 层类型 registry：
  - **Primitive**（内置）：`String` / `Long` / `Integer` / `Boolean` / `Double` / `LocalDateTime` / `Date`
  - **Free-text**（escape hatch）：`free-text` — 明确"非结构化 prose"
  - **User-defined**（domain VT）：每个 VO 的 name（app-scoped，`applications/<app>.yaml → domain_model.value_objects[]`）
  - **Composite**：`List<T>` / `Map<K,V>` / `Optional<T>`（文本，递归）
- 原则确立：**attr 不能作为对另一节点的引用**（禁止 attr-as-ref）。所有节点间连接必须走 rel-kind；字段的类型标记走 value-type 系统，不算 attr-as-ref
- 新 CLI 命令族 `dcddp vt <verb>`：add / update / remove / list / describe

### VO 从 node 重新定位为 value-type

- **`value-object` 从 NODE_KINDS 移除**；不再是图节点
- VO 存储位置不变（`applications/<app>.yaml → domain_model.value_objects[]`）
- 图上不再渲染 VO；`uses (entity → value-object)` endpoint 也移除
- Node kinds 15 → 14

### has-actor 从 derived 迁到 scalar 存储 rel

- Storage shape 从 `derived scalar-field` → `scalar`（9 endpoints, source × target 笛卡尔积）
- YAML 不变（`actor: Player`）
- `derived scalar-field` shape 从 vocabulary 移除；只保留 `derived field-type`
- `/api/vocabulary` endpoint 字段 `derivedFromField` 改为 `scalarField`；客户端 attr-editor picker 逻辑相应更新

### attrs schema 升级

- `NodeKindSpec.attrs` 从 `string[]` 升级为 `NodeAttrSpec[]`（`{name, type}`）
- 每个 attr 显式声明 value-type（`String` / `free-text` / `Long` / ...）
- `describe` 输出显示 name + type
- 结构化 attrs（fields / aggregates / relationships / methods 等）暂标 `free-text`

### Schema

- `CURRENT_SCHEMA_VERSION` 5.0 → 6.0
- 迁移 `migrations/v5-to-v6.ts`：仅 bump schema_version；无 YAML 数据结构改动
- chargable-proxy 已迁移

### kg-web

- vocabulary 反映新结构（15 node kinds，1 减少）
- graph-view.ts 不再渲染 VO；has-actor scalar-storage 通过通用 edge 派生正常工作
- 客户端 AttrEditSheet picker 检测机制迁移到 `scalarField`（等价语义）

## [Unreleased] — 2026-08-13（vocabulary v5.0 audit round-3，未发布）

**Breaking changes**（未发布 → 硬 breaking）：

### Vocabulary v5：补齐 actor 层

- 4 个新 node kinds：`organization` / `business-worker` / `external-party` / `participant`
  - 前 3 个都是 named，存 `business.yaml` 的 `organizations[]` / `business_workers[]` / `external_parties[]`
  - `participant` 是 qualified `<party>.<name>`，nested 存于 `external_parties[?name=party].participants[]`（跟 `system-use-case` 一样的 nested-lookup 模式）
- 1 个新 rel `has-actor`：source = BUC / SUC / app-use-case；target = business-worker / external-party / participant；**storage 为新 `scalar-field` derived 变体**（从 source 的 `actor:` 字段名字匹配到 actor pool）
- `DerivedSource` 扩展：新增 `{from: 'scalar-field', field, matchNodeKind}` 变体
- Node-kinds 12 → 16；rel-kinds 16 → 17

### Schema

- `CURRENT_SCHEMA_VERSION` 4.0 → 5.0
- 迁移 `migrations/v4-to-v5.ts`：
  - `organization: "X"` → `organizations: [{name: "X"}]`
  - `business_workers: [strA, ...]` → `business_workers: [{name: strA}, ...]`
  - `external_parties` 已是 struct，不动
  - `actor:` 字段全部保留字符串（has-actor 派生时读）
- chargable-proxy 已迁移

### kg-web

- `/api/vocabulary` 自动报告新 kinds
- `graph-view.ts` 渲染 organization / business-worker / external-party / participant + `has-actor` 派生边（actor 名字优先匹配 participant，然后 external-party，最后 business-worker）
- scaffold 模板升到 5.0，`organizations: [{name}]` 骨架

## [Unreleased] — 2026-08-13（vocabulary v4.0 audit round-2，未发布）

**Breaking changes**（v7 未发布，无 alias，硬 breaking）：

### Vocabulary v4：补齐 DDD 层 + fields 结构化

- **`NodeIdStrategy` 新增 `polymorphic` form**（bare 或 qualified）——`entity` 用之：bare `Account` = 业务作用域（`business/business-model/<name>.yaml`）；qualified `manager-server.Account` = app 作用域（`applications/<app>.yaml → domain_model.entities[]`）。
- **`RelStorage` 新增 `derived` shape**——从其它结构属性运行时派生边，无独立存储。`uses`（entity → value-object）用之：扫 entity 的 `fields[?].type` 匹配同 app 的 VO 名；CLI 不允许对 derived rel 用 connect/disconnect。
- **4 个新 node kinds**（都是 qualified `<app>.<name>`，都存 `applications/<app>.yaml → domain_model.<container>[]`）：
  - `value-object`（`value_objects[]`）
  - `domain-service`（`domain_services[]`）
  - `domain-event`（`domain_events[]`）
  - `role`（`roles[]`）
- **3 个新 rel kinds**：
  - `aggregates`（entity → entity，root → members，同 app）
  - `emits`（entity → domain-event）
  - `handles`（entity / domain-service → domain-event）
- **`implements` 收窄**：target 从 `entity` 改为 `role`。
- **`uses` 扩 endpoint**：新增 entity → value-object（derived）。
- **`fields:` schema 重构**（A-2）：所有出现 `fields:` 的地方（business entity / app entity / VO / event 的 payload）从 `{name: "type, desc"}` 单键 map 改为 `{name, type, desc}` 三键 map。派生 `uses` 边靠 `type` 字段精确匹配。
- Node-kinds 8 → 12；rel-kinds 13 → 16。

### Schema versioning

- `CURRENT_SCHEMA_VERSION` 3.0 → 4.0
- 迁移 `migrations/v3-to-v4.ts`：
  - `schema_version: "4.0"`
  - Flatten `domain_model.aggregates[]` → 平铺到 `domain_model.entities[]`；聚合的 `root`/`invariants`/`notes`/`relationships` 转移到 root entity；member 名字入 root 的 `aggregates: []` 字段
  - 递归重构所有 `fields:` 为 `{name, type, desc}`（split 首个"unbalanced comma"，`(...)`/`[...]`/`<...>` 内的逗号不算）
- `chargable-proxy` 示例已迁移完成。**注意 migration 通过 js-yaml 走，示例数据的 YAML 注释在此过程中丢失**（手工恢复 business.yaml 的顶部注释；其它文件的注释未恢复）。

### kg-web

- `/api/vocabulary` 自动报告新增的 4 nodes + 3 rels（vocabulary 派生）
- `graph-view.ts` 新增 app-scoped domain 渲染：entities（qualified）+ VOs + services + events + roles + aggregates/emits/handles 边 + uses derived 边（扫 fields.type 匹配 VO）+ realizes 跨作用域边 + implements 到 role

## [Unreleased] — 2026-08-13（vocabulary v3.0 audit，未发布）

**Breaking changes**（v7 未发布，无 alias，硬 breaking）：

### Vocabulary rename + 结构升级

- `RelKindSpec` 结构从 `{ sourceKinds, targetKinds, storage }` 改成 `{ endpoints: [{ source, target, storage, targetForm? }] }`——一 rel-kind 可覆盖多个 (src, tgt) 组合，每 endpoint 独立 storage。API 见 `allowedSourceKinds()` / `allowedTargetKinds()` / `resolveEndpoint()`。
- **Rel-kind 全量收敛到纯动词 pattern**（详见 [vocabulary-audit-2026-08-12.md](vocabulary-audit-2026-08-12.md)）：
  - `system-uses` → **`uses`**（buc → suc）
  - `entry-to` → **`has-entry`**（suc → app-uc）
  - `related-to` / `about` / `rule-uses-uc` → **`references`** (三 endpoint 合一)
  - `implements` **拆为** `implements`（OOP）+ `realizes`（DDD 跨层）
  - 保留 UML/DDD 术语：`includes` / `extends` / `composition` / `associates` / `depends-on` / `transitions-to`
- **新增 `system` node kind**（named，`business.yaml` 的 `systems:`）；`system-use-case` 现在有 first-class parent
- **新增 implicit rel `has-uc`**（system → suc）；`has-rule` 保持 implicit
- Node-kinds 7 → 8；rel-kinds 14 → 13（拆 1 合 3 加 1）

### Schema versioning

- `CURRENT_SCHEMA_VERSION` 2.0 → 3.0
- 迁移 `migrations/v2-to-v3.ts`：只 bump `schema_version`；storage 字段名未变故 YAML 数据无需字段级迁移；`kind: implements` 逐条 warn，让 reviewer 判 OOP vs DDD
- `chargable-proxy` 示例数据已迁移：3 处 `kind: implements`（target=business-entity）改为 `realizes`；2 处 role 保持 `implements`

### kg-web

- `/api/vocabulary` 增加 `endpoints[]` + `implicit` 字段
- 客户端 menu 走 endpoint-aware filter，跳过 implicit rels
- `graph-view.ts` 新增 `system` first-class 渲染 + implicit `has-uc` edge

## [1.0.0-alpha] — 2026-08-02

v7 方法论线的第一版：**KG × ArchiMate × DDD 四层 stack**（KG substrate → meta-model → project vocabulary → instance graph），配套 6 个图原语动词 + 共享 vocabulary registry。YAML 磁盘格式跟 v6.2 兼容（差异细节见 [MIGRATION_FROM_V6_2.md](MIGRATION_FROM_V6_2.md)）。

### 架构（全部放 `@dcddp/core`，共享给所有界面）

- **Meta-model as data**（`core/src/vocabulary.ts`）——声明式 registry，含 7 个 node-kind（business-use-case / system-use-case / application / app-use-case / page / entity / rule）和 13 个 rel-kind（system-uses / entry-to / related-to / includes / extends / composition / associates / depends-on / implements / has-rule / about / rule-uses-uc / transitions-to）。每条声明 YAML 存储形态、允许属性、端点约束。**加 kind = 加一条 registry 条目**，不用改代码。
- **Graph ops**（`core/src/graph.ts`）——通用 add-node / update-node / remove-node / connect / update-edge / disconnect，作用在磁盘 YAML 模型上。无 hardcode 的 kind 逻辑，纯粹按 registry 字段分发。
- **yaml@2 round-trip**（`core/src/yaml-io.ts`）——所有 mutation 保留注释、空行、key 顺序。
- **Loader / types / query / relationships / paths / migrations**——从 v6.2 core 沿用，统一在 `@dcddp/core` 下。

### CLI（`@dcddp/cli`，core 之上的薄 adapter）

6 个图原语动词 + 读命令：

```
dcddp add-node    <kind> <name>              [--set k=v ...]
dcddp update-node <kind> <name>              [--set k=v ...] [--unset k ...]
dcddp remove-node <kind> <name>
dcddp connect     <from> --rel <r> --to <to> [--set k=v ...]
dcddp update-edge <from> --rel <r> --to <to> [--set k=v ...] [--unset k ...]
dcddp disconnect  <from> --rel <r> --to <to>

dcddp list <kind> / get <kind> <name> / validate / describe [kind]
dcddp migrate --to <schema-version>
```

Handle 用 `<kind>:<name>` 格式（`entity:Account`、`app-use-case:manager-server.BatchCreateAccounts`）。边支持属性（property-graph 风）：`--set cardinality=many-to-one --set from-role=holder`。Vocabulary 校验：未知 kind 报错，未知 attr 给 warning 但仍写入。

### Viewer（`@dcddp/studio` / `app/`）

React 应用，通过 `@dcddp/core` 读模型。UI/UX 跟 v6.2 一致。当前只读，编辑能力后续加。

### 文档

- **`v7/docs/DESIGN.md`** — 架构原则（四层 stack、6 原语动词、handle-by-identity、界面/core 分工）
- **`v7/docs/STORAGE.md`** — vocabulary → YAML 存储映射目录（3 种边存储形态 + 4 种节点文件模式）
- **`v7/docs/MIGRATION_FROM_V6_2.md`** — v6.2 老模型升级指南
- **`v7/docs/VERIFICATION.md`** — 15 分钟验收 checklist
- **`v7/docs/CLI_MANUAL.md`** — CLI 完整手册
- **`v7/docs/modeling-conventions.md`** + **`v7/docs/system-modeling-prompt.md`** + **`v7/meta-model.schema.yaml`** — 方法论面向文档（从 v6.2 承接，同步了目录布局 + schema 版本）

### 跟 v6.2 兼容性

- YAML 目录结构：**逐字兼容** v6.2，除了 `business-model/` 挪到 `business/` 下
- `business.yaml` 顶部要求 `schema_version: "2.0"`（v6.2 收官版本也加了这条）
- 字段名、嵌套、四色 archetype、DDD 构造块：**未变**

### 测试

- 5 个 core loader 测试 + 20 个 core graph-verbs 测试 + 2 个 CLI migrate 测试 = **27 个测试全过**

### 1.0.0-alpha 已知空缺

- **Rule 作为节点** — vocabulary 里 `rule` 是 node-kind，但端到端 `add-node rule --parent X --link about=E1 --link about=E2` 语法糖还没落地。变通：手工用 `connect has-rule` + `connect about` 拼，或等语法糖
- **`rename` 命令** — 图级 rename 还没写；跨文件引用重写属于后续工作
- **`describe --json`** — 机器可读输出还没实现
- **Typed VOs（Layer 2.5）** — 用户声明的 VO shape 校验没实现；属性值实质 untyped
