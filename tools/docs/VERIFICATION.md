# 验收指南（schema 7.0）

> 端到端验收 checklist。任何一步挂了就是**验收阻断**——报告出来。所有命令假设当前目录 = 仓库根目录。

## 0. 安装

```bash
npm install
```

## 1. 包级检查

```bash
(cd tools/core && npx tsc --noEmit && npx vitest run)      # 类型 + 24 个测试
(cd tools/cli && npx vitest run)                            # 迁移测试（6.0 fixture → 7.0）
(cd tools/kg-web && npm run typecheck)
(cd tools/studio && npx vite build)
```

## 2. 样板模型

```bash
M=methodology/examples/food-delivery/model
node apply/bin/dcddp validate -m $M            # ✓ model ok (N nodes, M edges)
node apply/bin/dcddp list application -m $M    # 4 个应用，id + name
node apply/bin/dcddp get entity ent-001 -m $M  # 属性 + 出入边
node apply/bin/dcddp describe entity           # 放置位置、默认文件、属性
```

## 3. 写入回归（在临时副本上）

```bash
rm -rf /tmp/v7 && cp -r $M /tmp/v7 && D="node apply/bin/dcddp"
$D add-node system "Proxy Platform" -m /tmp/v7
$D add-node system-use-case "Redeem Code" --parent "system:Proxy Platform" --package Core -m /tmp/v7
$D add-node app-use-case Ping --parent app-004 --package Ops/Health --set 'api=["GET /ping"]' -m /tmp/v7
$D add-node rule --parent app-use-case:Ping --set content="fast" -m /tmp/v7
$D connect buc-001 --rel uses --to "system-use-case:Redeem Code" -m /tmp/v7
$D update-node app-use-case Ping --set name=HealthPing --set package=Ops -m /tmp/v7   # index 里不留空 package
$D update-node application payment-gateway --set name=pay-gateway -m /tmp/v7                      # 目录同步改名
$D remove-node application order-service -m /tmp/v7                                     # 级联 + 清引用
$D validate -m /tmp/v7                                                                   # 0 error
```

## 4. 迁移

```bash
rm -rf /tmp/m6 && cp -r tools/cli/test/fixtures/chargable-proxy-6.0 /tmp/m6
node apply/bin/dcddp migrate -m /tmp/m6 --dry-run     # 列出将写 / 删的文件
node apply/bin/dcddp migrate -m /tmp/m6               # 写 migration-report.md
node apply/bin/dcddp validate -m /tmp/m6              # 只剩数据本身的问题（样板里 bu1 无 actor）
```

## 5. 界面

```bash
(cd tools/kg-web && npm run dev)       # http://localhost:5173；在设置里把 /tmp/v7 注册为工程，画布可增删节点与边
(cd tools/studio && npm run dev)                          # vite :5174（代理 /api → :5175）；http://localhost:5174/?model=<工程名>#/business
node apply/bin/dcddp studio -m /tmp/v7 --port 5190       # 单模型服务模式；节点页底部有属性 / 关系 / 子节点编辑卡
node apply/bin/dcddp studio -m /tmp/v7 --export /tmp/v7-static && python3 -m http.server -d /tmp/v7-static 8765   # 只读静态
```

studio 侧边栏结构照原设计（组织关系 / 业务用例 / 业务模型；应用 → 领域模型 / 页面 / 用例），内容来自 `index.yaml`；页面地址为 `#/n/<id>`。

## 6. 受管工程

```bash
cd <受管工程> && node <dcd-root>/apply/bin/dcddp validate -m ./docs/dcddp-modeling
```
