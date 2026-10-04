# 淘宝店铺 SKU 结构

两个商品链接：
- 【新账号】(id=828597203393) — 新建代理账户 + 初始套餐
- 【流量包】(id=829129514317) — 给已有账户续费（兑换码）

两维 SKU 属性（淘宝属性名是伪装的），5 × 2 = 10 SKU/商品：

| 淘宝属性名 | 实际含义 | 选项 |
|---|---|---|
| 游戏版本 | 流量档位 | 新手版=100MB/3d, DLC拓展3=3GB/30d, DLC拓展6=6GB/30d, DLC拓展12=12GB/30d, 典藏版=80GB/365d |
| 语种分类 | 速度版本 | 英语=高速版(hs, ~30Mbps), 简体中文=极速版(xs, ~200Mbps) |

每个 SKU → SkuPackageMapping: (quotaBytes, validityDays, packageName, domain)
