# 部署说明

## 前置条件

| 组件 | 版本要求 |
|------|----------|
| JDK | 17+ |
| Maven | 3.8+ |
| Node.js | 18+ |
| Go | 1.21+ |
| MySQL | 8.0+ |

## 1. 数据库准备

```bash
# 创建数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS proxy_manager CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 初始化表结构（应用启动时会自动执行 schema.sql，也可手动执行）
mysql -u root -p proxy_manager < manager-server/src/main/resources/schema.sql
```

## 2. manager-server 部署

### 2.1 构建

```bash
cd manager-server
mvn clean package -DskipTests
```

产物：`target/manager-server-1.0.0-SNAPSHOT.jar`

### 2.2 运行

```bash
java -jar target/manager-server-1.0.0-SNAPSHOT.jar \
  --spring.profiles.active=jpa \
  --server.port=8080
```

### 2.3 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ADMIN_KEY` | 管理员密钥，用于管理接口认证 | `admin123` |
| `DB_URL` | 数据库 JDBC URL | `jdbc:mysql://localhost:3306/proxy_manager?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC` |
| `DB_USER` | 数据库用户名 | `root` |
| `DB_PASS` | 数据库密码 | `root` |
| `CORS_ORIGINS` | 允许跨域的来源，逗号分隔 | `http://localhost:5173` |
| `SPRING_PROFILES_ACTIVE` | Spring Profile（`jpa` 或 `memory`） | `jpa` |

### 2.4 本地开发（内存模式）

无需 MySQL，使用 H2 内存数据库：

```bash
mvn spring-boot:run -Dspring-boot.run.profiles=memory
```

### 2.5 健康检查

```bash
curl http://localhost:8080/actuator/health
```

## 3. manager-ui 部署

### 3.1 开发模式

```bash
cd manager-ui
npm install
npm run dev
# 访问 http://localhost:5173
```

Vite 开发服务器会将 `/api` 请求代理到 `http://localhost:8080`。

### 3.2 生产构建

```bash
cd manager-ui
npm install
npm run build
```

产物在 `dist/` 目录，可部署到任意静态文件服务器（Nginx、CDN 等）。

### 3.3 Nginx 配置示例

```nginx
server {
    listen 80;
    server_name manager.example.com;

    root /var/www/manager-ui/dist;
    index index.html;

    # SPA 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Actuator 端点（可选，仅限内网）
    location /actuator/ {
        proxy_pass http://127.0.0.1:8080;
        allow 127.0.0.1;
        deny all;
    }
}
```

## 4. proxy 部署

### 4.1 构建

```bash
cd proxy
go mod tidy
go build -o proxy-server .
```

### 4.2 运行

```bash
./proxy-server \
  -listen :3128 \
  -domain "hs01.example.com:3128" \
  -manager "http://manager-server-host:8080" \
  -resaddr "http://127.0.0.1:8080" \
  -metrics ":9090" \
  -verbose
```

### 4.3 命令行参数 / 环境变量

| 参数 | 环境变量 | 说明 | 默认值 |
|------|----------|------|--------|
| `-listen` | `PROXY_LISTEN` | 代理监听地址 | `:3128` |
| `-manager` | `MANAGER_URL` | manager-server 地址 | `http://localhost:8080` |
| `-domain` | `PROXY_DOMAIN` | 代理域名（host:port），用于标识本实例 | `localhost:3128` |
| `-resaddr` | `RES_ADDR` | 非代理请求转发地址 | `http://127.0.0.1:8080` |
| `-metrics` | `METRICS_ADDR` | Prometheus 指标端口 | `:9090` |
| `-verbose` | — | 详细日志开关 | `false` |

### 4.4 多实例部署

可在同一主机上通过不同端口运行多个 proxy 实例，提供不同速度级别的服务：

```bash
# 高速版实例
./proxy-server -listen :3128 -domain "hs01.example.com:3128" -metrics ":9090"

# 极速版实例
./proxy-server -listen :3129 -domain "xs01.example.com:3129" -metrics ":9091"
```

每个实例在启动时会自动向 manager-server 注册，获得唯一的 `instanceId`。

### 4.5 健康检查

```bash
curl http://localhost:9090/health
```

## 5. systemd 服务配置示例

### manager-server.service

```ini
[Unit]
Description=Proxy Manager Server
After=network.target mysql.service

[Service]
Type=simple
User=proxy
WorkingDirectory=/opt/proxy-manager
ExecStart=/usr/bin/java -jar manager-server-1.0.0-SNAPSHOT.jar
Environment=ADMIN_KEY=your-secret-key
Environment=DB_URL=jdbc:mysql://localhost:3306/proxy_manager?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC
Environment=DB_USER=proxy
Environment=DB_PASS=your-db-password
Environment=CORS_ORIGINS=https://manager.example.com
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### proxy.service

```ini
[Unit]
Description=Chargable Proxy
After=network.target

[Service]
Type=simple
User=proxy
WorkingDirectory=/opt/proxy
ExecStart=/opt/proxy/proxy-server -domain "hs01.example.com:3128"
Environment=MANAGER_URL=http://127.0.0.1:8080
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 6. Prometheus 监控配置

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'manager-server'
    metrics_path: '/actuator/prometheus'
    static_configs:
      - targets: ['localhost:8080']

  - job_name: 'proxy'
    static_configs:
      - targets: ['localhost:9090']
    # 多实例时添加多个 target
    # - targets: ['localhost:9090', 'localhost:9091']
```

## 7. 部署拓扑

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

## 8. 安全注意事项

- **生产环境必须修改 `ADMIN_KEY`**，不要使用默认值
- **数据库密码** 通过环境变量注入，不要写入配置文件
- **内部 API**（`/api/internal/*`）应通过防火墙限制仅允许 proxy 节点访问
- **manager-ui** 的 Actuator 端点不应暴露到公网
- 建议使用 TLS 加密 proxy ↔ manager-server 的通信（如果跨主机部署）
