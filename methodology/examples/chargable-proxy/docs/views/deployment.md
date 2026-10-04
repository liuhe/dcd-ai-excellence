# 部署视图

> 来源：[deployment.md](../deployment.md) + [decisions.md](../decisions.md) + [implementation-notes.md](../implementation-notes.md)

## 部署拓扑

```
                        ┌──────────────┐
                        │   MySQL 8.0  │
                        └──────┬───────┘
                               │
┌──────────────┐       ┌──────┴───────┐       ┌──────────────┐
│  manager-ui  │──────▶│manager-server│◀──────│  proxy (hs)  │
│  (Nginx/CDN) │  API  │  :8080       │  内部  │  :3128       │
└──────────────┘       └──────────────┘  API   ├──────────────┤
                                               │  proxy (xs)  │
       ┌───────────┐                           │  :3129       │
       │ Prometheus │◀─────────────────────────┘──────────────┘
       │            │       /metrics
       └───────────┘
```

## 子系统端口

| 子系统 | 默认端口 | 协议 |
|--------|----------|------|
| manager-server | 8080 | HTTP (REST) |
| manager-ui (dev) | 5173 | HTTP |
| proxy | 3128 | HTTP 代理 |
| proxy metrics | 9090 | HTTP (Prometheus) |

## 前置依赖

| 组件 | 版本 |
|------|------|
| JDK | 17+ |
| Maven | 3.8+ |
| Node.js | 18+ |
| Go | 1.21+ |
| MySQL | 8.0+ |

## 子系统配置

### manager-server

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `ADMIN_KEY` | 管理员密钥 | `admin123` |
| `DB_URL` | JDBC URL | `jdbc:mysql://localhost:3306/proxy_manager?...` |
| `DB_USER` | 数据库用户名 | `root` |
| `DB_PASS` | 数据库密码 | `root` |
| `CORS_ORIGINS` | 跨域来源 | `http://localhost:5173` |
| `SPRING_PROFILES_ACTIVE` | Profile（jpa / memory） | `jpa` |

- **memory 模式**：无需 MySQL，使用 H2 内存数据库，适用于本地开发和测试

### proxy

| 参数 | 环境变量 | 说明 | 默认值 |
|------|----------|------|--------|
| `-listen` | `PROXY_LISTEN` | 监听地址 | `:3128` |
| `-manager` | `MANAGER_URL` | manager-server 地址 | `http://localhost:8080` |
| `-domain` | `PROXY_DOMAIN` | 代理域名（host:port） | `localhost:3128` |
| `-resaddr` | `RES_ADDR` | 非代理请求转发地址 | `http://127.0.0.1:8080` |
| `-metrics` | `METRICS_ADDR` | Prometheus 端口 | `:9090` |
| `-verbose` | — | 详细日志 | `false` |

### manager-ui

- 开发模式：Vite 将 `/api` 代理到 `http://localhost:8080`
- 生产模式：静态文件部署到 Nginx/CDN，通过反向代理转发 `/api`

## 多实例部署

proxy 支持同一主机多端口部署，提供不同速度级别：

```bash
./proxy-server -listen :3128 -domain "hs01.example.com:3128" -metrics ":9090"   # 高速版
./proxy-server -listen :3129 -domain "xs01.example.com:3129" -metrics ":9091"   # 极速版
```

每个实例启动时自动向 manager-server 注册，获得唯一 instanceId。

## 安全要点

- **生产环境必须修改 ADMIN_KEY**
- **数据库密码**通过环境变量注入，不硬编码
- **内部 API**（`/api/internal/*`）通过防火墙限制仅允许 proxy 节点访问
- **Actuator 端点**不暴露到公网
- 跨主机部署建议使用 TLS 加密 proxy ↔ manager-server 通信

## 监控

| 子系统 | 健康检查 | Prometheus 指标 |
|--------|----------|-----------------|
| manager-server | `/actuator/health` | `/actuator/prometheus` |
| proxy | `:9090/health` | `:9090/metrics` |
