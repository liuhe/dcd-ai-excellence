# Implementation Notes

## 系统概述

本系统为 Switch 游戏玩家提供付费 HTTP 代理加速服务，包含以下子系统：

| 子系统 | 技术栈 | 职责 |
|--------|--------|------|
| **manager-server** | Java 17 / Spring Boot 3.2 / JPA / MySQL | 账户管理、套餐管理、流量统计 |
| **manager-ui** | React 18 / TypeScript / Vite | 用户查询界面、管理后台 |
| **proxy** | Go 1.21 / Prometheus | HTTP/HTTPS 代理、认证、流量计量 |

## 目录结构

```
chargable-proxy-v1/
├── docs/
│   ├── chargable-proxy-v1.yaml    # 系统设计文档
│   ├── general-code-rules.md      # 通用代码规则
│   └── decisions.md               # 设计决策记录
├── manager-server/
│   ├── pom.xml
│   └── src/main/java/com/proxy/manager/
│       ├── ManagerApplication.java
│       ├── common/                 # ApiResponse 等通用类
│       ├── config/                 # Spring 配置
│       ├── domain/                 # 领域模型（Record 类）
│       ├── repository/             # 仓储接口
│       ├── infrastructure/
│       │   ├── jpa/                # JPA 实现（Entity + Spring Data + Repository Impl）
│       │   └── memory/             # 内存实现（用于测试）
│       ├── service/                # 业务服务 + 策略类
│       └── controller/             # REST 控制器
├── manager-ui/
│   ├── package.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                 # 路由配置
│       ├── api/client.ts           # API 客户端
│       └── pages/
│           ├── AccountPage.tsx     # 用户查询/绑定套餐
│           └── AdminPage.tsx       # 管理后台
├── proxy/
│   ├── go.mod
│   ├── main.go                    # 入口
│   ├── config/config.go           # 配置
│   ├── auth/auth.go               # 认证模块
│   ├── handler/
│   │   ├── proxy.go               # HTTP/CONNECT 代理
│   │   └── tag.go                 # 标签计算
│   ├── sync/syncer.go             # 用量同步
│   ├── manager/client.go          # Manager API 客户端
│   └── metrics/metrics.go         # Prometheus 指标
└── implementation-notes.md         # 本文件
```

## 架构设计

### DDD 分层

manager-server 遵循 DDD 分层：
- **Domain 层** (`domain/`): Java Record 不可变领域模型，包含业务方法（如 `effectiveStatus()`、`activate()`）
- **Repository 接口** (`repository/`): 返回 Domain 模型的抽象接口
- **Infrastructure 层** (`infrastructure/`): JPA 和 InMemory 两套实现，通过 Spring Profile 切换
- **Service 层** (`service/`): 业务编排，事务管理
- **Controller 层** (`controller/`): REST API，参数校验

### Profile 切换

- `jpa` (默认): 使用 MySQL + JPA
- `memory`: 使用内存实现 + H2，适用于本地开发和测试

### 关键策略类

- **PackageDeductionStrategy**: 独立的套餐扣减策略，实现复杂的优先级扣减逻辑
- **CouponCodeGenerator**: 兑换码生成器，排除易混淆字符

## API 参考

### 面向用户（统一 ApiResponse 包装）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/account/query` | POST | 查询账户详情，需 username + password |
| `/api/account/bindPackage` | POST | 绑定兑换码，需 username + password + couponCode |
| `/api/admin/accounts` | POST | 批量创建账户，需 adminKey |
| `/api/admin/coupons` | POST | 批量创建兑换码，需 adminKey |

### 面向 proxy（内部 API，无包装）

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/internal/register-instance` | POST | 注册代理实例 |
| `/api/internal/available-packages` | GET | 获取所有用户可用套餐 |
| `/api/internal/sync-usage` | POST | 同步用量数据 |

### 监控端点

| 端点 | 子系统 | 说明 |
|------|--------|------|
| `/actuator/health` | manager-server | 健康检查 |
| `/actuator/prometheus` | manager-server | Prometheus 指标 |
| `/health` | proxy (:9090) | 健康检查 |
| `/metrics` | proxy (:9090) | Prometheus 指标 |

## 构建与运行

### manager-server

```bash
cd manager-server
# 使用 MySQL
mvn spring-boot:run

# 使用内存模式
mvn spring-boot:run -Dspring-boot.run.profiles=memory
```

环境变量：
- `ADMIN_KEY` - 管理员密钥（默认 admin123）
- `DB_URL` / `DB_USER` / `DB_PASS` - 数据库配置
- `CORS_ORIGINS` - 允许的跨域来源

### manager-ui

```bash
cd manager-ui
npm install
npm run dev
```

开发模式下通过 Vite proxy 转发 `/api` 到 manager-server。

### proxy

```bash
cd proxy
go mod tidy
go build -o proxy .
./proxy -listen :3128 -domain "hs01.example.com:3128" -manager "http://localhost:8080"
```

参数：
- `-listen` - 监听地址（默认 :3128）
- `-manager` - Manager Server URL
- `-domain` - 代理域名（host:port）
- `-resaddr` - 本地资源服务地址
- `-metrics` - Prometheus 端口（默认 :9090）
- `-verbose` - 详细日志

## 并发安全

- **Coupon 绑定**: 使用条件 UPDATE（`WHERE bound_username IS NULL`）防止重复绑定
- **Package 扣减**: 在事务内执行，通过 UPDATE 原子操作更新用量
- **Proxy 认证缓存**: 使用 `sync.RWMutex` 保护读写
- **请求批量同步**: 使用 `sync.Mutex` 保护 buffer 读写

## Package 状态机

```
Pending → Active（首次扣减时自动激活）
Active → Exhausted（用量超过配额）
Active → Expired（当前时间 > expireTime，查询时计算）
Expired / Exhausted 可继续扣减（作为兜底）
```

注意：Expired 状态**不写入数据库**，由查询时根据 `activateTime + effectiveDays` 计算得出。

## 标签计算规则

| 条件 | 标签 |
|------|------|
| Host 匹配 `*.nintendo.com` 或 `*.nintendo.net` | nintendo |
| UA 含 "nn" 且 Host 匹配 `*.amazonaws.com` 且 Path 含 "upload" | nintendo |
| 其他 | freedom |

## 套餐扣减优先级

1. 精确匹配 tag 的 Active 套餐（旧的优先）
2. 精确匹配 tag 的 Pending 套餐（自动激活）
3. 若 tag 非 freedom，fallback 到 freedom 类型套餐
4. Expired 套餐（新的优先）
5. Exhausted 套餐（新的优先，可继续累计）

## 已知限制与待办

- [ ] 缺少单元测试（PackageDeductionStrategy 测试待补充）
- [ ] Go proxy 缺少 `go.sum` 文件（需执行 `go mod tidy`）
- [ ] manager-ui 缺少 `node_modules`（需执行 `npm install`）
- [ ] 未实现日志文件轮转（当前仅输出到 stdout）
- [ ] 未实现 Docker 部署配置
- [ ] proxy CONNECT 隧道的字节计数仅计算下行流量
- [ ] 内部 API 无认证保护（假设内网部署）
