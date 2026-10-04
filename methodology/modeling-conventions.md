# v6.2 建模约定

> v6.2 元模型的设计约定与使用规范。Schema 定义见 [meta-model.schema.yaml](meta-model.schema.yaml)，AI 建模指引见 [../apply/system-modeling-prompt.md](../apply/system-modeling-prompt.md)，参考实现见 [examples/chargable-proxy/model/](examples/chargable-proxy/model/)。

## 1. 视图分层

系统从 3 个固定视图描述，每个视图回答一类问题：

| 视图 | 回答 | 主要内容 |
|------|------|---------|
| **业务视图** | 谁？为谁创造什么价值？业务里有哪些核心概念？ | 业务执行者 / 业务用例 / 系统列表 / 系统用例 / **业务模型**（业务实体，四色建模，业务视图 details 的一部分） |
| **应用视图** | 软件由哪些应用组成？每个应用怎么实现？ | 应用（子系统）/ 应用拓扑 / 子系统用例 / 页面 / **应用领域模型**（DDD 构造块，每个 app 各一份，可选） |
| **系统部署视图** | 怎么部署？怎么配置？ | 物理拓扑 / 节点 / 端口 / 安全 / 配置 |

> 早期版本曾把"领域模型视图"和"业务模型"独立成视图。两者已按同一原则收编到所属层：**业务实体（业务模型）归业务视图**；**代码层结构（应用领域模型）归各 app 所在的应用视图**。

### 关键归属边界

- **系统、系统用例归业务视图**——它们是业务流程分析的产出，不是系统实现
- **业务模型归业务视图**——业务实体（含 archetype 四色）是业务概念在"世界里"长什么样，跨 app 共用，不是某个 app 的代码结构；物理上是 index.yaml `business.entity` + `business/entities.yaml`
- **应用领域模型归应用视图**——每个 app 内部用 DDD 构造块（Aggregate / VO / Repo / Service / Event）建模代码层结构；同一业务实体在不同 app 可有不同实现
- **应用视图的入口是"应用"**——业务视图说"系统提供什么能力"，应用视图说"应用怎么实现这些能力"
- **页面归应用视图**——是前端应用的一部分，不独立成视图

## 2. 三层用例结构

**"三层"指研究对象的三层（组织 / 系统 / 子系统），不是用例本身在分层。** 每一层的用例都是该层研究对象自己的用例——不存在"用例的层次"。

| 层级 | 研究对象 | 所在视图 | 定位 | 承载内容 |
|------|---------|---------|------|---------|
| **业务用例** | 组织 | 业务视图 | 组织对外的价值主张 | WHO（业务执行者）gets WHAT value，关联系统用例 |
| **系统用例** | 系统 | 业务视图 | 系统对外能力 | 系统提供给执行者的价值，能力声明 + entry 入口，**无规则** |
| **子系统用例** | 子系统（应用） | 应用视图（应用内）| 应用对外能力 | 该应用承担的部分，规则跟着负责的应用走，Include/Extend 链接 |

### 命名约定

- **动宾结构**，主语砍掉。例如 "取现金"、"回退会话"、"导出快照"
- 通过"卖"测试：「来啊来啊！我这里能 X！」听起来荒唐 → 不是用例（例：「能挂号」是步骤，「看病」才是价值）
- 系统味道词（新增/查看/录入/查询/修改/配置/管理）通常是步骤或设计映射，不是用例
- 价值 ≠ "可以这样做"——能做不等于卖得出去

### 追溯链路

```
页面 → 子系统用例 → 系统用例 → 业务用例
```

- 页面不直接关联业务用例
- `entry` 只指向入口子系统用例，后续通过 Include 链推导
- 业务用例拆分判断：**不同价值接收者 = 不同业务用例**

### 与传统用例方法（如潘加宇《软件方法》）的对照

传统方法只承认前两层（组织、系统），明确反对"子系统用例"——理由是「客户买的是整个系统」，子系统协作应该用序列图/组件图表达。

DCDDP 的子系统用例是**工程性扩展**：用统一的用例符号承载内部责任分配，目的是建立 **业务用例 → 系统用例 → 子系统用例** 的完整追溯链。

取舍：
- 收益：单一符号串起内外视角，AI / 人都能用同一种方式描述各层，追溯链清晰
- 代价：与潘加宇等传统方法术语略有出入。读者需明确"子系统用例"在 DCDDP 里是用例符号承载的责任分配，不是"用例的子层"

## 3. Overview / Details 递归

### 原则

- 每个视图都先给 **overview**（精简、全局、必读），再按需展开 **details**
- Overview/Details 是相对的——每个层级都可再切（应用是应用视图 overview 的元素，但应用内部又有自己的 overview 和 details）

### Overview 该放什么

| 视图 | Overview |
|------|---------|
| 业务 | 业务执行者 / 业务用例 / 系统 / 系统用例；结构小，全放 overview 即可 |
| 应用视图 | 应用清单（name + tech_stack 概要）+ application_topology |
| 部署 | 物理节点 + 网络拓扑 |

### Details 该放什么

视图内部按主题拆，对应 details 目录下的多个文件：

- 业务 details：**业务模型**（`business/entities.yaml`——业务实体条目，含完整 fields / state_machine / rules / archetype / notes）；此外可选加复杂业务流程时序、外部参与方约定等
- 应用视图 details：每个应用一个目录（`applications/<id>-<name>/`），含 use-cases / pages / **可选 domain**（DDD 构造块）
- 部署 details：可选——安全配置、扩缩容策略、灾备方案

## 4. 文件组织规范（schema 7.0）

### Schema 版本声明

`index.yaml` 顶部必须声明当前模型遵循的元模型 schema 版本：

```yaml
schema_version: "7.0"
```

此字段让工具（loader / CLI）识别过时模型并提示升级。升级路径：`dcddp migrate`（会写 `migration-report.md`）。

### 两层存储：全览 + 平铺细节

```
<project>/docs/dcddp-modeling/
├── index.yaml                      # 全览：每个节点一行（id + name），嵌套即归属，package 即分组
├── business/                       # 业务视图细节（平铺，按 id 寻址）
│   ├── actors.yaml                 #   organization / business-worker / external-party / participant
│   ├── business-use-cases.yaml
│   ├── systems.yaml                #   system + system-use-case
│   └── entities.yaml               #   业务实体（含内联 rules）
├── applications/
│   ├── applications.yaml           #   application 条目 + topology
│   └── <app-id>-<app-name>/        #   如 app-001-web；loader 只认 id 前缀
│       ├── use-cases.yaml          #     app-use-case（含内联 rules）
│       ├── pages.yaml
│       └── domain.yaml             #     entity / value-object / enum / role / domain-service / domain-event
├── deployment.yaml                 # 部署视图（现状保留）
└── diagrams/                       # SVG 附件
```

三条规则：

1. **index.yaml 是唯一的存在性来源。** 节点在 index 里才存在；细节文件里出现但 index 没有的 id 是 validate 错误。index 的内容与 studio 侧边栏一一对应——AI 读模型先读它。
2. **细节文件是平铺的属性包。** 文件格式为 `<kind>: [条目]`，条目第一键是 `id`。**文件边界不承载语义**：loader 读 `business/` 和 `applications/` 下的全部 YAML；上面的布局只是工具的默认落点，超过约 400 行的文件会被拆成同名目录。
3. **归属边放 index，其他边随源节点。** 包含关系（系统 → 系统用例、应用 → 用例 / 页面 / 实体、聚合根 → 成员等）用嵌套表达；其余关系写在源节点的细节条目里，值是目标 id。

### 身份与命名

- 每个节点有不透明 id：`<kind 前缀>-<序号>`（`buc-003` / `auc-017` / `rule-042`）。序号按前缀全模型递增、删除不复用，计数在 `index.yaml` 的 `sequences`。
- `name` 是展示名，可改、可跨 kind 重复。所有引用一律用 id；改名只动一处。
- 人和 AI 用 `<kind>:<name>` 定位也可以，但名字在该 kind 内必须唯一，否则 CLI 要求用 id。
- 应用目录名 `<id>-<name>`：改应用名时工具同步重命名目录；人手漏改只是 warning。

### Package 分组

任何 kind 的列表里都可以放 `- package: <名>` 包装项，内含同 kind 的子列表，可多级嵌套。package 不是节点、没有 id、不进细节文件；节点的 `package` 属性由 index 位置派生。

## 5. 跨文件引用

7.0 没有命名空间：引用就是 id。`actor: bw-001`、`uses: [suc-003]`、`entry: auc-017`、`relationships[].target: ent-009`、`related_entities: [ent-001]`。

工具责任：

- `dcddp validate` 报告 index 外的孤儿条目、重复 id、悬空引用、序号计数落后
- studio / kg-web 按 id 跳转；名字只用于展示

## 6. 图（Diagram）规范

### 格式

- 使用 **SVG**（替代 mermaid）——更灵活，未来由 AI skill 生成
- SVG 文件放在所属视图的 details 目录下：`./<view>/<topic>.svg`

### 引用方式

YAML 中通过 `diagram` 字段引用：

```yaml
# business/entities.yaml 的某个实体条目
docs:
  - { name: ER 图, type: image, path: ../diagrams/er.svg }   # 相对于该细节文件所在目录
```

Viewer 在该字段所在位置渲染 SVG。

### 关键约束

**SVG 是 YAML 的可视化呈现，不能携带 YAML 之外的信息**——保证图与数据不漂移。理论上 SVG 应可由 YAML 数据生成，未来 AI skill 实现这点。

## 7. 建模路径（入手点）

视图维度固定，但建模起点可变。按项目类型选：

| 项目类型 | 推荐起点 | 然后展开 |
|---------|---------|---------|
| **需求驱动 / 探索型** | 业务视图（业务用例） | → 业务模型（业务 details）→ 应用视图（含应用领域模型） → 部署 |
| **技术驱动 / 改造型** | 应用视图（应用拓扑） | → 业务视图回填（业务用例 + 业务模型）→ 应用领域模型 → 部署 |
| **数据中心型** | 业务模型（业务 details）| → 业务视图（业务用例）→ 应用视图（含应用领域模型）→ 部署 |

无论从哪入手，**最终三个视图都要补齐**。Overview 是必须的，details 按需展开。

## 8. 外部参与方结构

`business` 段下的 `external_parties` 取代了原来的 `stakeholders`。结构：

- `business_workers` 直接挂在 `business` 下（内部角色）
- `external_parties` 按"组织/方"分组：
  - **有参与者的方**：包含 `participants`（人/设备/系统）
  - **本身就是系统的方**：设 `type: system`
- 是否为"业务执行者"由 `business_use_cases` 的 `actor` 决定，不需要显式标注

```yaml
business:
  business_workers: [CustomerService]
  external_parties:
    - name: Customers
      participants:
        - name: Customer
          type: person
        - name: CustomerPhone
          type: device
    - name: PaymentProvider
      type: system
```

**设计理由**：顾客和顾客的手机天然属于同一个"方"，按组织分组比按类型分组（人/设备/系统）更符合现实。

### 判别：外部系统是 external_party 还是技术依赖？

不是所有"系统外的东西"都进 `external_parties`。判别口诀：

> **是用户的对手方** → external_party  
> **是系统调用的工具 / 服务 / 基础设施** → 不进业务视图，归到应用视图的 `application_topology`

具体看两点：
1. **谁在跟它打交道**：用户直接跟它互动（哪怕通过本系统中转）→ 对手方；只有本系统在调用它，用户无感知 → 工具。
2. **价值流向**：它提供价值给用户（用户为这个价值而来）→ 对手方；它只是让本系统能干活 → 工具。

举例（同一个工程里要一致处理）：

| 外部系统 | 用户感知 | 判别 |
|---|---|---|
| 微信支付（用户在收银台付款，本系统对接回调） | 用户主动跟支付机构打交道 | external_party |
| Stripe（用户结账时填卡，本系统转给 Stripe） | 用户跟 Stripe 直接交付支付信息 | external_party |
| Claude API / 第三方 LLM 服务（用户跟本系统聊天，系统转发给 LLM） | 用户对接的是本系统的 chat 界面，不直接对 LLM | **工具，不入 external_parties** |
| Headless Chrome（用于导出 PDF） | 用户完全无感知 | 工具，不入 |
| Host File System / 数据库 | 用户无感知 | 工具，不入 |

**常见误区**：把"系统名字响亮 / 是个大厂服务"当成对手方。响亮不重要，**用户是否直接跟它发生业务关系**才重要。

## 9. Package 分组

见 §4「Package 分组」：package 是 index.yaml 里的包装项，可多级、适用于所有 kind。studio 在侧边栏渲染为文件夹，在用例图里画成子边界。

## 10. 实体 Archetype（四色建模，可选）

借自 Peter Coad《Java Modeling in Color With UML》。给实体打一个 `archetype` 标签，让 ER 图按颜色分类：

| Archetype | 颜色 | 含义 | 例 |
|-----------|------|------|-----|
| `moment-interval` | 粉 | 时刻 / 时段类，"什么发生了"。事件、过程、交易 | `Order`, `Payment`, `MediaFrame`, `ConnectionSession` |
| `role` | 黄 | 角色，"在某情境下扮演什么"。把 PPT 接入 MI | `Customer`, `Teacher`, `ConferenceHost` |
| `party-place-thing` | 绿 | 持续存在的人物地物（PPT），身份独立 | `Person`, `Node`, `Vehicle`, `Building` |
| `description` | 蓝 | 描述 / 规范 / 分类，可复用属性集 | `ProductType`, `MenuItem`, `PricingPlan` |

**判断顺口溜（按优先级）**：

1. 有时间发生 → MI（粉）
2. "X as Y in Z" 表达（X 是个角色） → Role（黄）
3. 长期存在的具体存在 → PPT（绿）
4. 共享的属性集 / 配置规格 → Description（蓝）

**用法**：在业务实体条目（`business/entities.yaml`）加 `archetype: <type>` 字段。可选——不写则 viewer 用中性灰。建议在系统的核心业务实体上标，让 ER 图一眼分清概念边界。

> **注意**：archetype 只用在**业务模型**（业务视图下）。应用领域模型（应用视图，每个 app 内）用 DDD 构造块表达，不用四色——见下一节。

### Role = 接口/契约 + implements 关系

四色里的 **黄色 Role** 不是普通实体，本质是**接口**：定义"扮演这个角色需要满足什么"。其他实体（PPT / MI / Description）通过 `relationships:` 中 `kind: implements` 声明扮演哪些角色（统一关系模型见下一节）。

```yaml
# business/entities.yaml
entity:
  - id: ent-003                      # 一个 Role 实体
    name: Customer
    archetype: role
    fields:
      - canPlaceOrder: "Boolean (capability), 能否下单"

  - id: ent-007                      # 一个 PPT 实体，扮演 Customer / Employee 角色
    name: Person
    archetype: party-place-thing
    relationships:
      - kind: implements
        target: ent-003              # 同为业务实体（archetype=role）
      - kind: implements
        target: ent-004
    fields:
      - id: "..."
```

特点：
- 一个 PPT 可同时扮演多个 Role（多重身份）
- 一个 Role 可被多个 PPT 实现
- 严格：业务层 implements 的目标必须是同为业务实体且 archetype=role 的实体；应用层 implements 的目标是 role 节点
- viewer 在 ER 图上用 UML realization 风格（虚线 + 空心三角箭头）渲染

## 11. 应用领域模型（DDD 构造块，可选）

挂在 index.yaml 的 application 下（entity / value-object / enum / role / domain-service / domain-event），细节在 `applications/<app>/domain.yaml`。每个 app 一份，不强制——简单 frontend / proxy / external 通常不需要；有内核逻辑的 backend / client 才填。

### 与业务模型的关系

| 层 | 文件位置 | 工具 | 受众 |
|----|---------|------|------|
| 业务模型 | `business/entities.yaml` | 四色建模（archetype）| PO / 业务方 / 跨工程对齐 |
| 应用领域模型 | index.yaml 里挂在 application 下 + `applications/<app>/domain.yaml` | DDD 构造块 | 该 app 的开发者 |

- 同一业务实体可在不同 app 有不同的 DDD 实现（vchat-relay 的 `Peer` 是简单路由表项；vchat-client 的 `Peer` 是富 Aggregate）
- 也可以**不实现**——某 app 根本用不到某业务实体就不出现
- 跨层映射统一用 `relationships:` 段：`{kind: realizes, target: <业务实体 id>}`

### DDD 构造块

| 构造块 | 含义 | 例 |
|--------|------|-----|
| **Entity** | 独立实体：有身份、可持久化，但**无内含成员、无聚合级不变量**——不需要 Aggregate 外壳 | `Workspace`（只有自身字段，没有内含子实体或 VO） |
| **Aggregate** | 根实体 + 内含实体 + VO + 事务边界 + 不变量；没有包装节点，成员嵌套在根实体下 | `Order`（下面嵌 `OrderLine` 实体和 `ShippingAddress` VO） |
| **Value Object** | 不可变，按值相等 | `Money`, `Address`, `RouteState` |
| **Repository** | 对聚合的集合抽象 | `OrderRepository`（findById, save, findByCustomer 等） |
| **Domain Service** | 不属单一聚合的领域逻辑 | `PriceCalculator`（涉及 Order + Customer + Product） |
| **Domain Event** | 业务上有意义的状态变化通知 | `OrderShipped`（payload: orderId, trackingNo, shippedAt） |
| **Role** | 接口/契约：定义参与者要满足的能力（DDD 没现成构造块对应；本方法论显式建模） | `MessageDecoder`（method: decode(bytes)）, `RouteSelector`（method: pickRoute(peers)） |

### Role 与 implements 关系（应用领域层）

应用层 Role 与业务模型 Role 概念一致——都是接口契约。区别在范围：

- 业务模型 Role：跨 app 共享的业务能力契约（如 `Customer`、`Approver`）
- 应用 Role：本 app 内的代码层契约（如 `MessageDecoder`、`RouteSelector`、`PaymentGateway`），可能因实现技术不同而抽象出来

```yaml
# index.yaml（节选）
applications:
  application:
    - id: app-001
      name: order-service
      role:
        - { id: role-001, name: PriceQuoter }
      entity:
        - id: ent-020
          name: Order                        # 聚合根（本层实体，不是业务实体 Order）
          entity:
            - { id: ent-021, name: OrderLine }
          value-object:
            - { id: vo-003, name: ShippingAddress }

# applications/app-001-order-service/domain.yaml（节选）
role:
  - id: role-001
    name: PriceQuoter
    methods: ["quote(orderItems) -> Money"]
    summary: 给一组订单项报价；不同促销策略走不同实现
entity:
  - id: ent-020
    name: Order
    fields:
      - id: "Long, primary key"
      - status: "OrderStatus, ..."
    invariants: ["订单金额 = 各行小计之和"]
    relationships:
      - kind: realizes
        target: ent-001                  # 业务实体 Order
      - kind: implements
        target: role-001                 # 本 app 的 Role
  - id: ent-021
    name: OrderLine
    fields:
      - sku: "String, ..."
      - qty: "Int, ..."
```

两种"实现"是两个 kind：
- `realizes` → 跨层（应用层实体 → 业务实体）；业务实体不属于本层，只通过此关系建立可跳转的映射
- `implements` → 同层接口实现（实体 → role）

### 聚合：聚合根实体就是聚合

7.0 没有聚合包装节点。一个实体"是聚合根"的表现，就是在 index.yaml 里有成员实体 / 聚合内 VO 嵌套在它下面：

```yaml
# index.yaml
applications:
  application:
    - id: app-001
      name: order-service
      entity:
        - id: ent-020
          name: Order                        # 聚合根
          entity:
            - { id: ent-021, name: OrderLine } # 成员：Order aggregates OrderLine
          value-object:
            - { id: vo-003, name: DeliveryAddress }  # 聚合内 VO
        - { id: ent-022, name: Payment }     # 普通实体
```

- 聚合级不变量写在根实体条目的 `invariants`；仓储写在根实体条目的 `repository`
- 跨层映射用根实体（或任何应用实体）的 `relationships: [{kind: realizes, target: <业务实体 id>}]`
- 成员只能嵌在一个根下；聚合不嵌套聚合

### Entity 还是聚合根（什么时候嵌套）

同时满足以下三条，就保持扁平实体；任一不满足，把成员移到它下面即可（`dcddp update-node entity <member> --set parent=<root>`）：

- 没有内含其他实体
- 没有内含 value object
- 没有聚合级不变量

动机：单实体、无内含成员的"聚合"和实体没区别——多裹一层只是命名重复、可视化噪音。详见 schema NOTE 17 / 18。

## 11.5 技术资源 / 集成点（resource）

API 端点、Kafka topic、共享表、Redis key 这类集成点会被多个用例（常常跨应用）同时指向，按"引用必须是节点"的原则建成 `resource` 节点，挂在拥有它的应用下（index 嵌套），`type` 取 api / topic / table / cache-key / queue / file / bucket，不为每类资源开 kind。细节在 `applications/<app>/resources.yaml`。

三条边把资源接进模型，数据路径是 **用例 → 实体 → 存储 / 消息**，接口只挂在用例上：

| 源 | 关系 | 目标 | mode |
|---|---|---|---|
| 应用用例 | `exposes` | api 资源 | 无：用例实现这个端点 |
| 应用用例 | `uses` | 实体 | read / write |
| 实体 | `uses` | table / cache-key / file / bucket | read / write |
| 实体 | `uses` | topic / queue | publish / subscribe |

调用方不连 API：web 用例调用 server 用例在本方法论里本来就是跨应用 include，API 只是那个用例的技术外壳。同步 / 异步由 mode 决定，publish / subscribe 对应拓扑边的 `type: sync`。

```bash
dcddp add-node resource "POST /api/session" --parent application:server --set type=api
dcddp connect auc-040 --rel exposes --to "resource:POST /api/session"
dcddp connect auc-040 --rel uses --to entity:ClaudeSession --set mode=write
dcddp add-node resource session.events --parent application:server --set type=topic --set spec="key = sessionId"
dcddp connect entity:ClaudeSession --rel uses --to resource:session.events --set mode=publish
```

- `app-use-case.api`（字符串列表）保留为轻量写法；端点被别的应用调用时升格为 resource
- 实体的 `table_name` 保持为属性，不与 table 类资源建边
- 例外情况（如 fire-and-forget 的 webhook）用边的 `note` 说明，不另加维度

## 12. 统一关系模型（Relationships）

实体用 `relationships:` 段表达**出向**关系，目标是 id。详见 schema NOTE 12。

### 5 种 kind

| kind | 中文 | 语义 | 视觉 |
|------|------|------|------|
| `depends-on` | 依赖 | A 临时用 B 完成工作（参数 / 调用），不持有引用 | 虚线 + 普通箭头 |
| `implements` | 实现 | A 实现 B 的契约（接口 / Role / 跨层业务实体） | 虚线 + UML 空心三角 |
| `associates` | 关联 | A 持有 B 的引用（字段 / ID 引用），可单向或双向 | 实线 + 普通箭头（`bidirectional: true` 时双端无箭头） |
| `composition` | 聚合 / 强所有权 | A 拥有 B；B 生命周期依附 A（值类型 / 嵌入式 / 内联） | 实线 + UML 实心菱形 |
| `realizes` | 跨层实现 | 应用层实体实现某业务实体（6.x 写作 `implements` + `target_kind: business-entity`） | 同 implements，跨视图跳转 |

### 字段

```yaml
relationships:
  - kind: depends-on | implements | associates | composition | realizes
    target: <id>                           # 目标节点 id（entity 或 role）
    bidirectional: true                    # optional, 仅 associates 可设
    cardinality: one-to-one | one-to-many | many-to-one | many-to-many   # optional
    via: <field>                           # optional, 持有引用的字段
    note: <string>                         # optional
```

### 存储约定

- 所有关系记在主动方（源实体）的细节条目里，目标为 id
- **双向关联**（`associates` + `bidirectional: true`）：只记一边即可，viewer 推导另一边
- **聚合**（根 → 成员）不走 relationships，用 index.yaml 嵌套（§11）

### Viewer 行为

- 加载所有构造块后，建立"出向 + 入向"双向索引
- 渲染时按 kind 用不同样式
- detail 页面同时展示主动出向关系**和**被动入向关系（"被谁依赖 / 被谁实现 / 被谁关联 / 被谁聚合"）

### 判断"什么需要 DDD 建模"

- **Aggregate**：有事务边界（一次操作改变多个东西，必须一起成功/失败）+ 有不变量（违反就是 bug）
- **VO**：纯描述无身份（删了再造一个等价的，没人在乎）；常见错例：把 `Address` 当 Entity（错——地址没身份）
- **Repository**：每个 Aggregate 一个 Repository（数据怎么存是 Repo 的事，业务逻辑不关心）
- **Domain Service**：跨多个 Aggregate 的逻辑（不属于任何单个 Aggregate）
- **Domain Event**：有业务方需要知道、可能触发其他流程的状态变化（不是普通日志）

## 13. 模型 / 代码一致性（硬约束）

> 这是 DCDDP 区别于"画图工具"的关键。模型不是装饰品，是 source of truth。

### 不变式

1. **代码反映模型，不是相反**。代码命名、类型签名、模块边界、文件组织必须跟模型一致。讨论一个概念时**只用模型里的命名**——模型说 `Peer`，代码就不能叫 `PeerRoute`。
2. **改模型 = 同步改代码**。模型变更（实体重命名 / 字段重组 / 关系调整 / 状态机调整 / archetype 调整）必须在**同一次工作**内伴随代码的对应改动落地。不允许只动模型不动代码，也不允许"模型先改，代码下次再排期"。
3. **改代码 = 先对齐模型**。系统变更（新增功能 / 修改流程 / 重构边界）必须先在模型层讨论清楚（涉及的实体 / 用例 / 规则 / 关系），再动代码。不允许先改代码再回头补模型。
4. **不分阶段、不留半成品**。改动量大时，先把模型改完整（产出一份完整的目标模型），再让代码追上；不允许"模型半重构"或"代码半重构"。
5. 模型与代码不一致即视为债务。检测到（旧名称残留、字段错配、用例缺失）下一个 commit 优先消除。

### AI 在受管工程内的具体行为

| 用户说 | AI 应该 |
|--------|---------|
| "改下代码 X" | 先看模型；X 在模型里叫什么？模型未表达 → 先补模型 |
| "加个新功能" | 先回到用例层（业务 → 系统 → 应用）对齐入口，再涉及实体/规则，最后才进代码 |
| "重命名 X" | 模型 + 代码 + 文档/测试/配置 一次同步改；单点改视为不完整 |
| "这块大改，怎么排期？" | **不要主动提议"先做 A 再做 B"的阶段拆分**——用户没要求时默认一次性彻底重构 |

### 例外（很少）

- 调研 / 设计阶段：明确说"我在探讨方向"时，可以只在模型层 sketch，标记为草稿
- 临时验证：明确说"这是 PoC / 一次性脚本"时可以绕过模型，但不进 main 分支
- 代码层纯重命名（不改语义）：模型不变情况下可只动代码

## 14. 需求判断："不这样行吗"

> 写 `rules` 时常见的失败：把设计选项当成需求塞进去。判断方法：把一条规则反过来读——"如果不这样会怎样？"
>
> - 答案是 **"换种做法也能满足相同涉众利益"** → 这是设计，不是需求，**删掉**
> - 答案是 **"涉众的某个利益直接受损"** → 这是需求，**保留**

适用范围：应用用例的 `rules` / 实体的 `rules` / 聚合根的 invariants。

### 四类常见伪需求

| 类型 | 例（看起来像需求，其实是设计） | 真需求是什么 |
|------|--------------------------------|--------------|
| 界面交互细节 | "下拉框选择城市"、"列表每页 20 条" | "<3 秒返回结果"、"支持千条结果浏览" |
| 实现方案 | "用 Redis 缓存会话"、"采用三层架构"、"调用 OpenAI API" | 性能 / 准确率 / 可用性指标 |
| 内部流程 | "先写 DB 再发 MQ"、"调用 X 服务校验" | 涉众根本不关心系统内部怎么做 |
| 不可观测条件 | "用户已仔细阅读条款"、"操作员心情良好" | 前置/后置条件必须**系统能检测**——人脑状态不算 |

### 写 rule 的工作流

1. 先识别涉众利益（这条 rule 是在保护哪个涉众的什么诉求？）
2. 问"不这样不行吗"——如果换个做法也能保护同一利益，把 rule 改成那个利益本身，让设计者自由选实现
3. 涉众无法感知 / 系统无法检测的 → 删

### 与硬约束 §13 的关系

§13 管的是"模型变了代码必须跟上"——纪律层面；§14 管的是"模型里写下来的是不是真需求"——内容层面。两者一起保证模型既不漂移也不被设计噪音污染。

来源：潘加宇《软件方法（上）·业务建模和需求》（第 2 版）6.1.3.8。

## 决策日期

| 约定 | 确定日期 |
|------|---------|
| 三层用例结构 | 2026-03-14 |
| 外部参与方结构 | 2026-03-14 |
| 用例 Package 分组 | 2026-03-17 |
| 4 视图 / Overview-Details 递归 / 多文件 / SVG / 命名空间 | 2026-04-26 |
| 应用 type `client` / 网络 protocol `udp` / relation `composition` / 实体 archetype 4 色 | 2026-05-03 |
| 模型 / 代码一致性硬约束（第 13 节） | 2026-05-03 |
| 统一关系模型（第 12 节）：4 种 kind（depends-on / implements / associates / composition）+ relationships 段替代散落的 implements/business_entity/aggregate 字段 | 2026-05-04 |
| 业务模型 / 应用领域模型分层（第 11 节）+ 文件组织从 `domain/` → `business-model/` + 各 app 加 `domain_model` 段 | 2026-05-03 |
| 需求判断标准（第 14 节）："不这样行吗"——区分需求与设计，对照潘加宇《软件方法》6.1.3.8 | 2026-05-31 |
| 视图分层从 4 → 3：业务模型从顶层视图收编为业务视图 details（`business/business-model.yaml` + `business/business-model/`），与"应用领域模型嵌入 app"同构 | 2026-08-02 |
| Schema 版本字段（`business.yaml` 顶层 `schema_version: "2.0"`）— 从注释升为显式字段，供 loader / CLI 检测过时模型并驱动 `dcddp migrate` | 2026-08-02 |
