# 用例视图

> 来源：[chargable-proxy-v1.yaml](../chargable-proxy-v1.yaml) `系统.子系统[].用例` + [decisions.md](../decisions.md)

## 追溯链路

### 业务用例 → 系统用例

| 业务用例 | 系统用例 |
|----------|----------|
| 给游戏下载提速 | 查询账户详情、绑定套餐、代理HTTP请求 |
| 运营代理服务 | 创建账户、创建套餐 |

### 系统用例 → 入口子系统用例

| 系统用例 | 入口 | 后续链路（通过 Include 推导） |
|----------|------|-------------------------------|
| 创建账户 | manager-ui.创建账户 | → manager-server.创建账户 |
| 创建套餐 | manager-ui.创建套餐 | → manager-server.创建套餐 |
| 查询账户详情 | manager-ui.查询账户详情 | → manager-server.查询账户详情 |
| 绑定套餐 | manager-ui.绑定套餐 | → manager-server.绑定套餐 |
| 代理HTTP请求 | proxy.Do Proxy | → manager-server.Get Available Packages, Sync Usage |

## 用例全景

```
                    manager-ui                          manager-server                         proxy
                   ┌──────────────────┐               ┌──────────────────┐               ┌──────────────────┐
Admin ────────────▶│ 创建账户          │──Include──▶│ 创建账户          │               │                  │
Admin ────────────▶│ 创建套餐          │──Include──▶│ 创建套餐          │               │                  │
Player ───────────▶│ 查询账户详情      │──Include──▶│ 查询账户详情      │               │                  │
Player ───────────▶│ 绑定套餐          │──Include──▶│ 绑定套餐          │               │                  │
                   └──────────────────┘               └──────────────────┘               │                  │
                                                      │ Get Available Packages │◄─Include──│ Do Proxy         │
                                                      │ Sync Usage             │◄─Include──│                  │
Switch Console ───────────────────────────────────────────────────────────────────────────▶│ Do Proxy         │
                                                                                           └──────────────────┘
```

---

## manager-server 用例

### 创建账户

| 属性 | 值 |
|------|-----|
| **执行者** | Admin |
| **API** | `POST /api/admin/accounts`（需 adminKey） |

**规则**：
- 需要 adminKey 验证
- 批量生成：指定 idPrefix 和 count，密码自动生成（8 位随机数字）
- 同时为每个账户创建一个初始 Package（Pending 状态）
- 初始 Package 的 domain、type、quota、effectiveDays 由调用者在请求中指定

### 创建套餐

| 属性 | 值 |
|------|-----|
| **执行者** | Admin |
| **API** | `POST /api/admin/coupons`（需 adminKey） |

**规则**：
- 需要 adminKey 验证
- 批量生成 Coupon 兑换码，格式 XXXX-XXXX-XXXX-XXXX
- 字符集排除易混淆字符（I/O/0/1），共 32 字符

### 查询账户详情

| 属性 | 值 |
|------|-----|
| **执行者** | Switch Game Player |
| **API** | `POST /api/account/query`（需 username + password） |

**规则**：
- 需要 username/password 验证（adminKey 也可作为密码使用）
- 返回用户名及其所有 Package 列表

### 绑定套餐

| 属性 | 值 |
|------|-----|
| **执行者** | Switch Game Player |
| **API** | `POST /api/account/bindPackage`（需 username + password + couponCode） |

**规则**：
- 需要 username/password 验证
- 用户提供兑换码，校验码有效且未被使用后，绑定 Coupon 并创建 Pending 状态的 Package
- 并发安全：使用条件 UPDATE（`WHERE bound_username IS NULL`）防止重复绑定

### Get Available Packages

| 属性 | 值 |
|------|-----|
| **执行者** | proxy |
| **API** | `GET /api/internal/available-packages`（内部，无认证） |

**规则**：
- 返回所有用户及其可用 Package 列表，供 proxy 缓存

### Sync Usage

| 属性 | 值 |
|------|-----|
| **执行者** | proxy |
| **API** | `POST /api/internal/sync-usage`（内部，无认证） |

**规则**：
- 接收 proxy 批量发送的 Request 记录
- 执行 upsert（按 proxyInstanceId + localRequestId 去重）
- 根据 readBytes 增量扣减对应用户的 Package 配额
- 扣减遵循[套餐扣减优先级](domain-model.md#套餐扣减优先级)

---

## manager-ui 用例

| 用例 | 执行者 | 关联 |
|------|--------|------|
| 查询账户详情 | Switch Game Player | Include → manager-server.查询账户详情 |
| 创建账户 | Admin | Include → manager-server.创建账户 |
| 创建套餐 | Admin | Include → manager-server.创建套餐 |
| 绑定套餐 | Switch Game Player | Include → manager-server.绑定套餐 |

前端用例均为对 manager-server 对应用例的 UI 包装，详细规则见 manager-server 侧。

---

## proxy 用例

### Do Proxy

| 属性 | 值 |
|------|-----|
| **执行者** | Switch Game Console |
| **关联** | Include → Get Available Packages, Sync Usage, Proxy HTTP Request |

**规则**：
- **认证**：使用 HTTP Basic Auth（Proxy-Authorization 头），失败返回 407 + `Proxy-Authenticate: Basic realm="proxy"`
- **放行**：根据 Account 的 Available Package 放行，只在建立连接时检查，下载到一半不会断开
- **非代理请求**：非 CONNECT 且无协议前缀的请求转发到本地资源服务地址（resaddr），不做认证
- **标签计算**：
  - `*.nintendo.com` / `*.nintendo.net` → nintendo
  - UA 含 "nn" 且 Host 为 `*.amazonaws.com` 且 Path 含 "upload" → nintendo
  - 其他 → freedom
- **数据加载**：每 10 秒从 manager-server 轮询所有用户数据
- **用量同步**：请求变更批量积攒，每 5 秒或满 1000 条同步一次

---

## API 端点汇总

| 端点 | 方法 | 认证 | 面向 |
|------|------|------|------|
| `/api/admin/accounts` | POST | adminKey | 用户 |
| `/api/admin/coupons` | POST | adminKey | 用户 |
| `/api/account/query` | POST | username + password | 用户 |
| `/api/account/bindPackage` | POST | username + password | 用户 |
| `/api/internal/available-packages` | GET | 无 | 内部（proxy） |
| `/api/internal/sync-usage` | POST | 无 | 内部（proxy） |
| `/api/internal/register-instance` | POST | 无 | 内部（proxy） |
