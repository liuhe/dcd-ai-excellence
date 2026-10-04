# 应用架构视图

> 来源：[chargable-proxy-v1.yaml](../chargable-proxy-v1.yaml) `系统.子系统` + [implementation-notes.md](../implementation-notes.md)

## 子系统组成

| 子系统 | 类型 | 语言 | 框架 | 存储 | 职责 |
|--------|------|------|------|------|------|
| **manager-ui** | 前端 | TypeScript | React, react-router-dom | — | 用户查询界面、管理后台 |
| **manager-server** | 后端 | Java 17 | Spring Boot 3.2, Spring Data JPA | MySQL | 账户管理、套餐管理、流量统计 |
| **proxy** | 代理 | Go 1.21 | — | — | HTTP/HTTPS 代理、认证、流量计量 |
| **http-proxy** | 外部 | — | 任意 HTTP 代理应用 | — | 底层代理引擎（实际内嵌于 proxy） |

## 交互拓扑

```
                         ┌─────────────────────┐
                         │  Switch Game Player  │
                         └──────────┬──────────┘
                                    │ 查询/绑定套餐
                                    ▼
┌──────────────┐  API   ┌──────────────────┐  内部 API  ┌──────────────┐
│  manager-ui  │───────▶│  manager-server  │◄───────────│    proxy     │
│  (React)     │        │  (Spring Boot)   │            │    (Go)      │
└──────────────┘        └────────┬─────────┘            └──────┬───────┘
                                 │                             │
                                 ▼                             ▼
                          ┌────────────┐              ┌────────────────┐
                          │   MySQL    │              │ Switch Console │
                          └────────────┘              │  (HTTP 代理)   │
                                                      └────────────────┘
```

## 数据流方向

| 从 | 到 | 方式 | 说明 |
|----|----|------|------|
| manager-ui | manager-server | call (REST) | 用户操作（查询、绑定、管理） |
| manager-server → proxy | sync (轮询) | proxy 每 10 秒拉取所有用户可用套餐 |
| proxy → manager-server | call (REST) | 请求变更批量同步（每 5 秒或满 1000 条） |
| proxy → manager-server | call (REST) | 启动时注册实例 |
| Switch Game Console → proxy | call (HTTP 代理) | 代理 HTTP/HTTPS 请求 |

**注意**：proxy ↔ manager-server 的交互是双向的——数据从 manager-server 流向 proxy（套餐信息），用量数据从 proxy 流向 manager-server。

## 内部架构

### manager-server（DDD 分层）

```
Controller 层 ─── REST API，参数校验
     │
Service 层 ────── 业务编排，事务管理
     │
Domain 层 ─────── Java Record 不可变领域模型
     │
Repository 层 ─── 接口（返回 Domain 模型）
     │
Infrastructure ── JPA 实现（生产） / InMemory 实现（测试）
```

- Profile 切换：`jpa`（MySQL）/ `memory`（H2 内存）
- 关键策略类：**PackageDeductionStrategy**（套餐扣减）、**CouponCodeGenerator**（兑换码生成）

### proxy

```
main.go ─────────── 入口、定时任务调度
     │
auth/ ───────────── HTTP Basic Auth 认证（Proxy-Authorization）
handler/proxy.go ── HTTP/CONNECT 代理处理
handler/tag.go ──── 请求标签计算（nintendo / freedom）
sync/syncer.go ──── 用量批量积攒 & 同步
manager/client.go ─ Manager API 客户端
metrics/ ────────── Prometheus 指标
```

### manager-ui

```
App.tsx ──────── 路由配置（react-router-dom v6）
api/client.ts ── API 客户端（fetch API）
pages/
  AccountPage ── 用户查询 / 绑定套餐
  AdminPage ──── 管理后台（创建账户 / 创建套餐）
```
