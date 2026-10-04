# QuickBite 外卖订餐平台 — DCDDP 样板模型

## 这是什么

用 DCDDP 元模型（schema 7.0）对一个外卖订餐平台建模。领域人人都用过：顾客点餐付款、商家接单出餐、骑手取餐送达、售后退款，所以读者可以把注意力放在"方法论怎么表达一个系统"上，而不是先理解业务。

## 文件说明

| 文件 / 目录 | 说明 |
|---|---|
| `model/` | 模型本体，`index.yaml` 全览 + `business/`、`applications/` 平铺细节文件 |
| `draft.yaml` | 生成本模型的**导入草稿**：不带 id 的嵌套 YAML，`dcddp import` 一次导入。想知道"AI 应该写成什么样"，看这个文件 |
| `docs/background.md` | 需求背景：业务是怎么运转的 |

## 模型覆盖了什么

- **业务视图**：组织 QuickBite；业务工人（客服、运营）；外部方（顾客、餐厅、骑手、支付机构）与参与者；5 个业务用例，每个带相关方利益；系统 QuickBitePlatform 及 11 个系统用例，追溯到各应用的入口用例
- **业务模型**：9 个业务实体，四色原型齐全（role / description / moment-interval / mi-detail），订单、支付、配送、骑手、餐厅都有状态机，规则内联
- **应用视图**：7 个应用。两个后端（order-service、dispatch-service）有完整领域模型：聚合根 Order 嵌套 OrderLine 与值对象、枚举、Role、领域服务、领域事件，实体 `realizes` 业务实体；四个前端（顾客 App、商家后台、骑手 App、运营后台）有页面与用例，跨应用 `includes` 到后端用例；payment-gateway 是外部系统
- **方案**：2 个跨应用的关注点处理方案（订单履约、售后退款），`covers` 指向各应用的用例与实体，studio 画按应用分簇的用例图和实体关系图
- **技术资源**：后端用例 `exposes` API；实体 `uses` 表、缓存 key、Kafka topic（read / write / publish / subscribe）
- **监控**：6 个指标（3 个业务 KPI、3 个技术指标），`measures` 指向用例 / 实体，`sourced-from` 指向部署视图里的 3 个可观测性存储（Prometheus / Loki / ClickHouse），带 Grafana 站点，studio 上一键跳到 Grafana Explore
- **部署视图**：3 个数据源（MySQL / Redis / Kafka），表、缓存 key、topic 这些资源用 `stored-in` 指向存放它的数据源
- **拓扑与部署**：`applications.yaml` 的 `topology` 描述应用间调用与事件流；`deployment.yaml` 描述运行节点与网络

## 怎么用

```bash
# 在仓库根目录
node apply/bin/dcddp list application -m methodology/examples/food-delivery/model
node apply/bin/dcddp get entity Order -m methodology/examples/food-delivery/model   # 业务实体与应用实体同名 → 提示用 id
node apply/bin/dcddp get app-use-case CreateOrder -m methodology/examples/food-delivery/model
node apply/bin/dcddp validate -m methodology/examples/food-delivery/model
node apply/bin/dcddp studio -m methodology/examples/food-delivery/model

# 从草稿重建（得到同一份模型）
node apply/bin/dcddp init -m /tmp/qb --org QuickBite
node apply/bin/dcddp import methodology/examples/food-delivery/draft.yaml -m /tmp/qb
node apply/bin/dcddp update-node organization org-001 --set summary="外卖订餐平台：连接顾客、餐厅与骑手" -m /tmp/qb
for b in OrderMeal PrepareOrder DeliverOrder ResolveAfterSale OperateMarketplace; do
  node apply/bin/dcddp connect org-001 --rel provides --to business-use-case:$b -m /tmp/qb
done
```

组织是 singleton，由 `init` 创建，所以草稿里不声明它。`topology` 与 `deployment.yaml` 不是节点，草稿也不包含，重建后需手工补上。
