# 设计决策记录

本文件记录在代码生成过程中，针对设计文档中模糊或未明确定义之处所做的决策。

## API 设计

### 端点定义

| 用途 | 方法 | 路径 | 认证 |
|------|------|------|------|
| 创建账户 | POST | `/api/admin/accounts` | adminKey |
| 创建套餐(Coupon) | POST | `/api/admin/coupons` | adminKey |
| 查询账户详情 | POST | `/api/account/query` | username+password |
| 绑定套餐 | POST | `/api/account/bindPackage` | username+password |
| 获取可用套餐(内部) | GET | `/api/internal/available-packages` | 无 |
| 同步用量(内部) | POST | `/api/internal/sync-usage` | 无 |
| 注册代理实例(内部) | POST | `/api/internal/register-instance` | 无 |

### 创建账户 API 参数

设计文档描述"批量生成：指定idPrefix和count，同时为每个账户创建一个初始Package(Pending状态)"。
**决策**：初始 Package 的 `domain`、`type`、`quota`、`effectiveDays` 由 API 调用者在请求中一并指定。

### 内部 API 无认证

面向 proxy 的内部 API（`/api/internal/*`）不使用统一响应包装，也不做认证（假设内网部署）。

## 端口与部署

| 子系统 | 默认端口 |
|--------|----------|
| manager-server | 8080 |
| manager-ui (dev) | 5173 |
| proxy | 3128 |

- manager-ui 独立部署，manager-server 通过 CORS 允许跨域访问。
- 生产环境下可通过反向代理统一入口。

## 时间与单位

- `activateTime`、`expireTime`、`boundTime` 均为毫秒级 Unix 时间戳。
- `expireTime = activateTime + effectiveDays × 86400000`。
- Expired 状态在查询时计算：若 `status == Active` 且 `System.currentTimeMillis() > expireTime`，则视为 Expired。

## 兑换码字符集

排除易混淆字符 `I`、`O`、`0`、`1`，使用以下 32 字符：
`2 3 4 5 6 7 8 9 A B C D E F G H J K L M N P Q R S T U V W X Y Z`

格式：`XXXX-XXXX-XXXX-XXXX`（共 16 位有效字符，约 32^16 种组合）。

## http-proxy 子系统

设计文档将 http-proxy 定义为"任意HTTP代理应用"。
**决策**：在 Go proxy 中使用标准库直接实现 HTTP CONNECT 隧道和 HTTP 正向代理功能，不依赖外部代理进程。http-proxy 作为 proxy 内部的代理引擎模块。

## proxy resaddr（本地资源服务）

设计文档描述"非代理请求转发到本地资源服务地址(resaddr)"。
**决策**：`resaddr` 为可配置的本地 HTTP 地址，默认 `http://127.0.0.1:8080`。用于为直接访问代理端口的非代理请求提供服务（如状态页面、PAC 文件等）。

## proxy 数据加载

"每10秒从manager-server轮询加载所有用户数据"——proxy 每 10 秒拉取所有用户及其可用 Package 列表，缓存在内存中用于认证和放行判断。

## Sync Usage 请求格式

proxy 批量发送 Request 记录（含 `proxyInstanceId`、`localRequestId`、`readBytes` 等），manager-server 执行 upsert（按 `proxyInstanceId + localRequestId` 去重），并根据 `readBytes` 增量扣减对应用户的 Package 配额。

## Package 扣减优先级（详细解释）

对于某用户某次 sync 的流量增量：
1. 精确匹配 tag 的 Active 套餐（activateTime 升序，旧的优先）
2. 精确匹配 tag 的 Pending 套餐（首次扣减时自动激活）
3. 若 tag 非 freedom，fallback 到 freedom 类型的 Active → Pending 套餐
4. Expired 套餐（expireTime 降序，新的优先）
5. Exhausted 套餐（id 降序，新的优先，可继续累计用量）

单个套餐不够扣时，扣满后继续扣下一个。

## Java 项目规范

- Java 17，Spring Boot 3.2.x
- Domain Model 使用 Java Record（不可变）
- 持久化 Entity 使用 JPA @Entity 类，通过 `toModel()` / `fromModel()` 方法与 Domain Model 互转
- Repository 接口返回 Domain Model
- 提供 JPA 实现（生产）和 InMemory 实现（测试/本地开发），通过 Spring Profile 切换

## React UI 规范

- Vite + React 18 + TypeScript
- react-router-dom v6 路由
- 使用 fetch API 调用后端
- 简洁实用的 UI，不引入重型 UI 框架
