# 存储映射（schema 7.0）

> `vocabulary.ts` 是磁盘上的 YAML（物理层）和 CLI / 界面操作的有标签图（语义层）之间的桥。这份文档说清楚 7.0 的桥怎么架：节点存哪、边存哪、为什么。
>
> [DESIGN.md](DESIGN.md) 的同伴文档——DESIGN 说 vocabulary registry *为什么*存在，这份说*怎么*把 YAML 槽位映射到图元素。方法论面向的 schema 见 `methodology/meta-model.schema.yaml`。

## 一句话

**index.yaml 决定节点存在，细节文件决定节点属性，源节点条目决定非包含边。**

```
model/
├── index.yaml                      # 存在性 + 归属（嵌套）+ package + sequences
├── business/*.yaml                 # 业务视图细节条目（平铺，<kind>: [entries]）
├── applications/applications.yaml  # application 条目 + topology
├── applications/<app-id>-<name>/   # 该应用的细节条目（use-cases / pages / domain）
└── deployment.yaml                 # 现状保留，不进图
```

6.x 的"按父节点嵌套、一实体一文件、一应用一文件"布局不再使用；`dcddp migrate` 负责 6.0 → 7.0，并写 `migration-report.md`。

## 节点

每个 node-kind spec（`NODE_KINDS[kind]`）声明：

| 字段 | 说的是什么 |
|------|------------|
| `idPrefix` | id 前缀；id = `<prefix>-<seq>`，序号来自 index.yaml 的 `sequences`，删除不复用 |
| `view` | 可以出现在哪个视图顶层（`business` / `applications`）；没有则必须有父节点 |
| `parents` | 可以嵌套在哪些 kind 的 index 条目下（= 包含关系） |
| `inline` | 内联 kind（rule）：不进 index，住在 owner 细节条目的 `inline.key` 列表里，但仍取号 |
| `valueType` | 值类型 kind（value-object / enum）：是节点，也可出现在 `type` 槽位 |
| `location` | 新条目默认写到哪个细节文件：`business/<file>.yaml`、`applications/<file>.yaml` 或 `applications/<app>/<file>.yaml`；entity 按祖先决定（有 application 祖先 → app 的 domain.yaml） |
| `attrs` | 允许的属性（开放清单——未知 attr warn 但仍写）；类型含 `field-list` / `string-list` / `free-text` / 标量 |
| `singleton` | 全模型最多一个 |

### index.yaml

```yaml
schema_version: "7.0"
sequences: { buc: 3, auc: 85, rule: 120 }
business:
  <kind>:
    - { id, name }                        # 叶子条目（流式）
    - id: sys-001                         # 有孩子的条目
      name: ...
      system-use-case:                    # 子 kind 列表 = has-uc 边
        - { id: suc-001, name: ... }
    - package: Auth                       # 分组包装，不是节点，可多级
      business-use-case: [ ... ]
applications:
  application:
    - id: app-001
      name: web
      app-use-case: [...]
      page: [...]
      entity:
        - id: ent-020                     # 聚合根
          name: Account
          entity: [...]                   # 成员 = aggregates 边
          value-object: [...]             # 聚合内 VO = has-value-type 边
```

读取用 js-yaml（`parseIndex`），写入用 yaml@2 Document（`index-file.ts`：addEntry / removeEntry / moveEntry / renameEntry / allocateId），注释与顺序保留，空 package 自动修剪。

### 细节文件

```yaml
# business/entities.yaml
entity:
  - id: ent-001
    name: Account          # 可读用；与 index 不一致时 index 为准（validate 给 warning）
    archetype: party-place-thing
    fields:
      - id: "Long, pk"
    rules:                 # 内联 rule 节点
      - id: rule-001
        content: ...
```

loader 读 `business/` 与 `applications/` 下**全部** YAML，按顶层 key（必须是 node-kind；`topology` 例外）收集条目，按 `id` 合并进 index 骨架。因此：

- 文件怎么切、叫什么名字都不影响语义；默认布局只是工具的落点
- 写入侧：目标文件超过 `SHARD_THRESHOLD_LINES`（默认 400，环境变量 `DCDDP_SHARD_LINES` 可改）时，新条目写到 `<file>/<shard>.yaml`
- 没有细节条目的 index 节点是合法的 stub；第一次写属性或边时自动建条目
- 应用目录 `applications/<app-id>-<name>/`：loader 和 writer 只按 id 前缀匹配目录；改名时 `update-node` 同步重命名

## 边 — 五种形态

每个 rel-kind endpoint 的 `storage.shape`：

### `containment`（隐式）

边就是 index.yaml 的嵌套（或 rule 的内联位置）。没有独立存储；`connect` / `disconnect` 对它报错，用 `add-node --parent` / `update-node --set parent=` 改。用在：has-uc / has-page / has-participant / has-role / has-domain-service / has-domain-event / has-entity / has-value-type / aggregates / has-rule。

### `string-list`

源条目上的字符串列表，每个字符串是目标 id。无法带边属性。

```yaml
uses: [suc-001, suc-003]       # business-use-case → system-use-case
includes: [auc-023]            # app-use-case → app-use-case
```

用在：provides / uses(buc→suc) / references / includes / extends / emits / handles。

### `scalar`

源条目上的单值字段，值是目标 id。同源同 kind 最多一条，重连报错。

```yaml
actor: bw-001                  # has-actor
entry: auc-017                 # has-entry
```

### `struct-list`

源条目列表里的 map，`kindField` 区分 rel-kind，map 本身携带边属性。

```yaml
relationships:
  - kind: composition          # ← 区分 rel-kind
    target: ent-009            # ← 目标 id
    cardinality: one-to-many   # ← 边属性
  - kind: realizes
    target: ent-001
```

用在：composition / associates / depends-on / implements / realizes（共享 `relationships[]`）；transitions-to（`state_machine.transitions[]`，`to` 是状态名，自环）。

### `derived`

没有独立存储，从源的其他结构属性算出来。`connect` / `disconnect` 报错，改底层属性即改边。

```yaml
fields:
  - lastUsage: "UsageRecord, ..."   # type 名匹配同一应用内的 value-object → uses 边
```

用在：uses（entity → value-object，按 `fields[].type` 的类型名在同一 application 内解析）。

## 加 kind 的决策指南

**新 node-kind**

1. 它有归属吗？→ `parents` 填父 kind；是视图顶层 → `view`
2. 它只有在 owner 里才有意义、侧边栏不该单独出现？→ `inline`（像 rule）
3. 它是类型？→ `valueType: true`
4. 新条目默认落在哪个文件 → `location`
5. 给个 `idPrefix`，加 `attrs` 和 `description`。不用改 loader / writer / CLI。

**新 rel-kind**

1. 是归属（父子）？→ 不加显式边；把子 kind 的 `parents` 填上，再加一条 `containment` rel 让图里有名字
2. 每源最多一条？→ `scalar`
3. 一组目标、无每边元数据？→ `string-list`
4. 需要边属性或与兄弟 rel 共用列表？→ `struct-list`
5. 边的语义已经被别的结构表达了？→ `derived`
6. 边需要自己的出边？→ 不是边，升级成节点（像 rule）

## 存储全表

完整清单由 registry 生成：[`vocabulary-reference.md`](vocabulary-reference.md)。刷新：

```sh
node apply/bin/dcddp describe --format markdown > tools/docs/vocabulary-reference.md
```

## 这份文档不是什么

- 不是 YAML schema 本身——那在 `methodology/meta-model.schema.yaml`
- 不是建模约定——那在 `methodology/modeling-conventions.md`
- 不是 CLI 手册——那是 [`CLI_MANUAL.md`](CLI_MANUAL.md)
- 不是设计原则——那是 [`DESIGN.md`](DESIGN.md)
