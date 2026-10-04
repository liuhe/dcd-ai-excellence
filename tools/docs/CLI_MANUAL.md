# dcddp CLI

在命令行读写 DCDDP 模型（schema 7.0：`index.yaml` + 平铺细节文件 + 不透明 id）。

**重要**：对已有模型，这个 CLI 是**批准的 mutation 路径之一**（另两个是 kg-web 和手工编辑 YAML）。如果你需要的 mutation 这里没列，请求补齐命令 / vocabulary 条目。

架构：CLI 是 `@dcddp/core` 之上的薄 adapter。所有实际工作（vocabulary 查询、index 维护、YAML round-trip、图 ops、校验、迁移）都在 core，所以 CLI、kg-web、studio 共享同一套行为。见 [`DESIGN.md`](DESIGN.md) 和 [`STORAGE.md`](STORAGE.md)。

---

## 安装

稳定入口（受管工程用这个；自带运行时解析，任意目录可用）：

```bash
node <repo>/apply/bin/dcddp <cmd>
```

其他方式：`cd <repo>/tools/cli && npm link` 后直接 `dcddp`；或 `cd <repo> && npx dcddp`。下面的例子都用 `dcddp` 作简写。

---

## 全局选项与退出码

- `-m, --model <path>` — 模型根目录（含 `index.yaml`）。默认当前目录。
- `--json` — stdout 输出机器可读 JSON。错误始终到 stderr。

| Code | 含义 |
|------|------|
| 0 | 成功 |
| 1 | 命令错误（参数不对、目标找不到、名字歧义、mutation 失败） |
| 2 | 校验失败（`validate` 发现 error）或 migrate 无法开始 |

## 节点怎么定位

- **id**：`auc-017`（规范形式，永远无歧义）
- **`<kind>:<name>`**：`app-use-case:ChatPanel`——名字在该 kind 内唯一时可用；命中多个时报错并列出候选 id
- 带 `<kind>` 位置参数的命令（`get` / `update-node` / `remove-node`）第二个参数可直接写 id 或名字

`list` / `get` 永远同时显示 id 和 name。

---

## 读命令

### `dcddp list <kind> [--parent <ref>]`

列出 kind 的全部节点：id、name、所在容器（父节点 / package），再加少量短标量属性。`--parent` 只看某父节点下的。

```bash
dcddp list application
dcddp list app-use-case --parent application:web
dcddp list entity --json          # [{ id, kind, name, parent, package, file, data }]
```

### `dcddp get <kind> <idOrName>`

显示一个节点：id / name / 父节点 / package / 所在文件、全部属性（含内联 rules）、出边与入边、直接子节点。

```bash
dcddp get entity Account          # 业务实体与应用实体同名时会要求用 id
dcddp get app-use-case auc-017 --json
```

### `dcddp validate`

加载模型并报告：index 外的孤儿条目、重复 id、悬空引用、不允许的嵌套、缺 id、index 与细节名字不一致、序号计数落后、应用目录命名、缺必填边（如业务用例无 actor）、singleton 超额、值类型冲突、`fields` / `payload` 形状不对。任何 error 以退出码 2 结束。

### `dcddp describe [kind]`

内省 vocabulary：不带参数列出所有 node kind / rel kind；给 kind 打印属性、放置位置（视图顶层 / 可嵌在哪些父节点下）、默认细节文件；给 rel kind 打印端点与存储形态。`--format markdown` 生成 [`vocabulary-reference.md`](vocabulary-reference.md)。

---

## Mutation — 6 个图原语动词

所有写入通过 `yaml@2` round-trip——注释、空行、key 顺序保留。`--set` 的值自动 coerce：`true` / `false` / `null` / 数字；以 `[` 或 `{` 开头的值按 JSON 解析（可写列表和结构）。

### `dcddp add-node <kind> [name] [--parent <ref>] [--package <path>] [--set …]`

创建节点并打印分配的 id。视图顶层的 kind 不需要 `--parent`；其他 kind 必须给（`dcddp describe <kind>` 看允许的父 kind）。内联 kind（rule）不要名字。

```bash
dcddp add-node business-worker Support
dcddp add-node system "Proxy Platform"
dcddp add-node system-use-case "Redeem Code" --parent "system:Proxy Platform"
dcddp add-node application feedback-api --set type=backend --set summary='Feedback service'
dcddp add-node app-use-case SubmitFeedback --parent application:feedback-api --package "Feedback/Intake" \
  --set 'api=["POST /api/feedback"]'
dcddp add-node entity Ticket --parent application:feedback-api \
  --set 'fields=[{"id":"Long, pk"},{"status":"TicketStatus, lifecycle"}]'
dcddp add-node entity TicketComment --parent entity:Ticket      # 嵌在 Ticket 下 = 聚合成员
dcddp add-node rule --parent app-use-case:SubmitFeedback --set content="同一用户每分钟最多 5 条"
dcddp add-node entity Ticket                                     # 不带 --parent = 业务实体
```

### `dcddp update-node <kind> <idOrName> [--set …] [--unset …]`

改属性。`--set` 支持 dot-path 改嵌套字段。三个 index 级属性走同一入口：

- `--set name=<新名>`：改展示名（index + 细节条目；application 的目录同步改名）
- `--set package=A/B` / `--unset package`：在 index 里移动到对应 package
- `--set parent=<ref>`：改归属（受 vocabulary 允许的父 kind 约束）

```bash
dcddp update-node app-use-case SubmitFeedback --set summary='…' --set package=Feedback
dcddp update-node application feedback-api --set tech_stack.language=Kotlin
dcddp update-node entity TicketComment --set parent=application:feedback-api   # 从聚合里移出来
```

### `dcddp remove-node <kind> <idOrName>`

删除节点及其整棵子树（index 嵌套 + 内联 rules），并清掉全模型里指向它们的引用。application 的目录在清空后一并删除。

### `dcddp connect <from> --rel <r> --to <to> [--set …]`

建一条边。`<from>` / `--to` 是节点 ref（id 或 `<kind>:<name>`）。vocabulary 校验端点与边属性。

```bash
dcddp connect "business-use-case:Activate Service" --rel uses --to "system-use-case:Redeem Code"
dcddp connect buc-002 --rel has-actor --to pt-001
dcddp connect ent-020 --rel associates --to ent-021 --set cardinality=one-to-many --set via=ticket_id
dcddp connect auc-001 --rel includes --to auc-005
dcddp connect ent-020 --rel realizes --to ent-001        # 应用实体实现业务实体
dcddp add-node resource "POST /api/session" --parent application:server --set type=api
dcddp connect auc-040 --rel exposes --to "resource:POST /api/session"             # 用例实现接口
dcddp connect auc-040 --rel uses --to entity:ClaudeSession --set mode=write       # 用例使用实体
dcddp add-node resource session.events --parent application:server --set type=topic
dcddp connect entity:ClaudeSession --rel uses --to resource:session.events --set mode=publish   # 实体使用资源
```

两类边不能 connect：

- **归属边**（has-uc / has-page / aggregates …）：用 `add-node --parent` 或 `update-node --set parent=`
- **派生边**（entity → value-object 的 uses）：改实体 `fields` 里的类型名

### `dcddp update-edge <from> --rel <r> --to <to> [--set …] [--unset …]`

改边属性（仅 struct-list 边：relationships 系列、transitions-to）。

### `dcddp disconnect <from> --rel <r> --to <to>`

删一条边。

---

## 批量：`dcddp import <file> [--dry-run]`

一次写一批节点和边。草稿是**不带 id 的嵌套 YAML**，CLI 负责取号、放进 index 与细节文件、解析引用、最后跑 validate。任何一个引用解析不了，整份草稿拒绝、什么都不写。`<file>` 为 `-` 时读 stdin。

草稿形状：顶层是 `<kind>: [条目]`；条目里的键按这个顺序解释：

| 键 | 含义 |
|---|---|
| `name` | 展示名（rule 这类 inline kind 可省） |
| `package` | index 里的 package 路径，如 `Auth/Login` |
| 某个 node kind | 子节点列表（归属），形状相同、可递归 |
| 某个 rel kind | 从本节点出发的边：一个引用、引用列表、或 `{ target, …边属性 }` 列表 |
| 该 rel 的存储字段名 | 同上（`actor` 等价于 `has-actor`） |
| 其他 | 当属性原样写入 |

引用写 `<kind>:<name>`、裸名字（在该关系允许的目标 kind 内唯一，草稿与现有模型一起算）、或已有节点 id。草稿内节点可以互相引用，不分先后。

```yaml
business-worker:
  - name: Auditor
application:
  - name: audit-service
    type: backend
    resource:
      - { name: audit_log, type: table }
    entity:
      - name: AuditEntry
        fields: [{ id: "Long, 主键" }]
        uses: [{ target: audit_log, mode: write }]
    app-use-case:
      - name: RecordAudit
        package: Audit
        actor: Auditor
        uses: [{ target: AuditEntry, mode: write }]
        includes: [AutoFulfillOrder]
        rule:
          - content: 每笔销售一条记录
```

```bash
dcddp import draft.yaml --dry-run -m ./docs/dcddp-modeling   # 先看计划
dcddp import draft.yaml -m ./docs/dcddp-modeling             # 写入并校验
```

退出码：草稿被拒或写入后 validate 有 error → 2。`--json` 输出 `{ created, edges, skippedEdges, errors, findings }`。

## 值类型

`value-object` / `enum` 是节点（挂在 application 下，VO 也可挂在聚合根下），`add-node` 就能建。`dcddp vt` 是便捷别名：

```bash
dcddp vt list [--app <ref>]
dcddp vt describe [value-object|enum]
dcddp vt add Money --kind value-object --parent application:billing --set 'fields=[{"amount":"Long, cents"}]'
dcddp vt update vo-003 --kind value-object --set summary=…
dcddp vt remove enum-001 --kind enum
```

实体字段按**名字**引用值类型（`type: Money`），loader 在同一 application 内解析成 `uses` 边。

---

## 生命周期

### `dcddp init -m <path> --org <name>`

建一个空的 7.0 模型（index.yaml + 一个 organization）。

### `dcddp studio -m <model> [--port 5175] [--host 0.0.0.0] [--name <显示名>]`

启动 studio（API + 构建好的客户端，首次自动 `vite build`），单模型模式直接进入，局域网可访问。所有就地编辑经同一套 core 动词落到 YAML。

### `dcddp studio -m <model> --export <dir>`

导出只读静态版：SPA + `graph.json` + 模型附件，任意静态服务器可开（无编辑入口）。

### `dcddp migrate [--to <version>] [--dry-run]`

在 schema 版本之间迁移。版本从 `index.yaml`（7.0+）或 `business.yaml`（6.x）读取。6.0 → 7.0 会重构目录、分配 id、把所有名字引用改成 id、折叠聚合包装块、规则取号，并写 `migration-report.md`（name → id 对照表 + 无法解析的引用）。`--dry-run` 只列出将写 / 删的文件。

---

## JSON 输出形状

```json
// list
[{ "id": "auc-017", "kind": "app-use-case", "name": "…", "parent": "app-001", "package": "…", "file": "…", "data": { … } }]

// get
{ "id": "…", "kind": "…", "name": "…", "parent": "…", "file": "…", …attrs, "children": [...], "edges_out": [...], "edges_in": [...] }

// validate
{ "errors": 0, "warnings": 1, "nodes": 114, "edges": 171, "findings": [{ "severity": "warning", "code": "…", "message": "…", "nodeId": "…", "file": "…" }] }

// add-node / update-node / remove-node
{ "added": "<kind>", "id": "…", "name": "…", "file": "…" }
{ "updated": "<kind>", "id": "…", "file": "…", "changed": N }
{ "removed": "<kind>", "id": "…", "removedIds": [...], "files": [...] }

// connect / update-edge / disconnect
{ "connected": "<rel>", "from": "<id>", "to": "<id>", "file": "…" }
```

---

## 设计说明

- **Vocabulary 是 source of truth**：允许的 node kind、rel kind、端点、属性都在 `tools/core/src/vocabulary.ts`。**加 kind = 加一条 registry 条目**，CLI 不用改。
- **文件边界无语义**：`list` / `get` 的 `file` 字段只是告诉你条目现在在哪；把条目搬到同目录下另一个文件不影响任何命令。
- **id 不透明**：不要从 id 推断任何业务含义；需要人读的信息看 name。
