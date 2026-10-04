# 业务视图

> 来源：[chargable-proxy-v1.yaml](../chargable-proxy-v1.yaml) `业务` 部分

## 组织

**Download Accelerator Vendor** — 提供付费下载加速代理服务的供应商。

## 相关方

| 角色 | 类型 | 说明 |
|------|------|------|
| **Switch Game Player** | 业务执行者 | 最终用户，购买并使用代理加速服务 |
| **Admin** | 业务工人 | 系统运营者，管理账户和套餐 |
| **External E-Commerce Platform** | 外部系统 | 电商平台（淘宝），用于上架商品和用户购买 |
| **Switch Game Console** | 外部设备 | Switch 游戏机，配置代理并通过代理下载 |

## 业务用例

### ① 给游戏下载提速

| | |
|---|---|
| **执行者** | Switch Game Player |
| **价值接收者** | Switch Game Player |
| **系统用例** | 查询账户详情、绑定套餐、代理HTTP请求 |

| 相关方 | 利益 |
|--------|------|
| **Switch Game Player** | 快速下载游戏，减少等待时间，体验流畅 |
| **Download Accelerator Vendor** | 用户持续付费使用，业务可持续 |

### ② 运营代理服务

| | |
|---|---|
| **执行者** | Admin（代表组织） |
| **价值接收者** | Download Accelerator Vendor |
| **系统用例** | 创建账户、创建套餐 |

| 相关方 | 利益 |
|--------|------|
| **Download Accelerator Vendor** | 通过售卖流量套餐获取收入，套餐用量可追踪可计费 |
| **Admin** | 低运营成本管理账户和套餐，批量操作高效 |

### 业务流程全景

```
Switch Game Player                Admin                    External E-Commerce Platform
       │                           │                                │
       │    ① 上架商品（账号/券码） │                                │
       │                           ├───────────────────────────────▶│
       │                           │                                │
       │    ② 购买账号或券码        │                                │
       ├──────────────────────────────────────────────────────────▶│
       │                           │                                │
       │    ③ 绑定套餐（兑换券码）  │                                │
       ├──────────────────────────▶│                                │
       │                           │                                │
       │    ④ 配置代理（Switch上）  │                                │
       ├───────┐                   │                                │
       │       │                   │                                │
       │    ⑤ 下载加速             │                                │
       ├───────┘                   │                                │
```

### 系统级用例（Proxy System）

| 用例 | 执行者 | 说明 |
|------|--------|------|
| 创建账户 | Admin | 批量创建用户账户 |
| 创建套餐 | Admin | 批量生成兑换码 |
| 绑定套餐 | Switch Game Player | 用兑换码激活套餐 |
| 代理HTTP请求 | Switch Game Console | 实际的代理加速服务 |

### 外部系统交互

| 外部系统/设备 | 用例 | 执行者 |
|---------------|------|--------|
| External E-Commerce Platform | 上架 | Admin |
| External E-Commerce Platform | 购买 | Switch Game Player |
| Switch Game Console | 配置代理 | Switch Game Player |
| Switch Game Console | 下载 | Switch Game Player |
