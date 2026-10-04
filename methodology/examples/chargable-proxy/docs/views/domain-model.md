# 领域模型视图

> 来源：[chargable-proxy-v1.yaml](../chargable-proxy-v1.yaml) `系统.数据模型` + [decisions.md](../decisions.md)

## 实体关系概览

```
Account ◄──────── Package (username)
   │
   │              Coupon ──绑定──▶ Package（兑换后创建）
   │                │
   │                └── boundUsername ──▶ Account
   │
   └──────────── Request (username)
                    │
                    └── proxyInstanceId ──▶ ProxyInstance
```

## Account（账户）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Long | 主键自增 |
| username | String | 唯一 |
| password | String | |

- **表名**：`proxy_user`
- **创建方式**：Admin 批量生成（指定 idPrefix + count，密码自动生成 8 位随机数字）
- **认证**：username + password 验证；adminKey 也可作为密码使用

## Package（套餐）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Long | 主键自增 |
| username | String | 关联 Account |
| domain | String | 代理域名，格式 host:port（如 hs01.example.com:80） |
| type | String | 套餐类型（如 nintendo, freedom） |
| quota | long | 流量配额（字节） |
| effectiveDays | int | 有效天数 |
| usedQuota | long | 已使用配额（字节） |
| status | PackageStatus | Pending / Active / Expired / Exhausted |
| activateTime | long | 激活时间（毫秒级 Unix 时间戳） |
| expireTime | long | 过期时间（= activateTime + effectiveDays × 86400000） |

- **表名**：`proxy_package`
- **同一主机可通过不同端口运行多个 proxy 实例，提供不同速度级别的代理服务**

### 状态机

```
          首次扣减
Pending ──────────▶ Active
                      │
          ┌───────────┼───────────┐
          │                       │
    usedQuota ≥ quota    当前时间 > expireTime
          │                       │
          ▼                       ▼
     Exhausted               Expired（查询时计算）
```

| 转换 | 触发条件 |
|------|----------|
| Pending → Active | 首次扣减时自动激活 |
| Active → Exhausted | usedQuota ≥ quota |
| Active → Expired | 当前时间 > expireTime（查询时计算，不写入数据库） |

**关键规则**：Expired 状态**不持久化**，在查询时根据 `activateTime + effectiveDays` 与当前时间比较计算得出。

### 套餐扣减优先级

1. 精确匹配 tag 的 **Active** 套餐（旧的优先）
2. 精确匹配 tag 的 **Pending** 套餐（首次扣减时自动激活）
3. 若 tag 非 freedom，fallback 到 **freedom** 类型套餐
4. **Expired** 套餐（新的优先）
5. **Exhausted** 套餐（新的优先，可继续累计用量）

单个套餐不够扣时，扣满后继续扣下一个。

## Coupon（兑换码）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Integer | 主键自增 |
| code | String | 兑换码，格式 XXXX-XXXX-XXXX-XXXX |
| domain | String | 代理域名，格式 host:port |
| type | String | 套餐类型 |
| quota | long | 流量配额（字节） |
| effectiveDays | int | 有效天数 |
| boundUsername | String | 已绑定的用户名 |
| boundTime | long | 绑定时间 |

- **表名**：`proxy_coupon`
- **兑换码字符集**：排除 I/O/0/1，使用 32 字符（`2-9 A-Z` 去除混淆字符）
- **兑换流程**：Coupon 兑换后创建对应的 Package（Pending 状态）

## Request（请求记录）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Long | 主键自增 |
| proxyInstanceId | long | 代理实例 ID |
| proxyDomain | String | 代理域名 |
| localRequestId | long | 本地请求 ID（与 proxyInstanceId 联合唯一） |
| username | String | 用户名 |
| clientAddr | String | 客户端地址 |
| host | String | 目标主机 |
| path | String | 请求路径 |
| userAgent | String | |
| secChUa | String | |
| tags | String | 标签（以 \| 分隔） |
| readBytes | long | 已读取字节数 |

- **表名**：`proxy_request`
- **去重**：proxyInstanceId + localRequestId 联合唯一，同步时执行 upsert

## ProxyInstance（代理实例）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | Long | 主键自增 |
| domain | String | 代理域名，格式 host:port |

- **表名**：`proxy_instance`
- proxy 启动时注册自身获得唯一 ID，用于 Request 记录中标识请求来源节点
