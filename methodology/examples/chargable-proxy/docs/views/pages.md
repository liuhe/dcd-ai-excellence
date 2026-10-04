# 页面视图

> 来源：[chargable-proxy-v1.yaml](../chargable-proxy-v1.yaml) `系统.子系统[manager-ui].页面`

## 页面清单

| 页面 | 面向 | 关联用例 |
|------|------|----------|
| **AccountPage** | Switch Game Player | 查询账户详情、绑定套餐 |
| **AdminPage** | Admin | 创建账户、创建套餐 |

页面通过系统用例间接关联到业务用例，追溯链路：**页面 → 系统用例 → 业务用例**。

---

## AccountPage（用户页面）

**面向**：Switch Game Player

### 功能

- 用户登录（username + password）后查看账户详情
- 查看所有套餐列表及状态
- 输入兑换码绑定新套餐

### 外部链接

| 链接文字 | URL |
|----------|-----|
| 购买账号 | https://item.taobao.com/item.htm?id=828597203393 |
| 购买券码 | https://item.taobao.com/item.htm?id=829129514317 |

### 显示映射规则

| 字段 | 映射规则 |
|------|----------|
| **套餐类型** | `nintendo` → "Switch加速包"，其他原样显示 |
| **速度版本** | host 前缀 `xs` → "(极速版)"，`hs` → "(高速版)" |
| **domain** | 按 `host:port` 拆分为"服务器"和"端口"两列 |

---

## AdminPage（管理页面）

**面向**：Admin

### 功能

- 批量创建账户（指定 idPrefix、count、初始套餐参数）
- 批量创建兑换码（指定 domain、type、quota、effectiveDays、count）
