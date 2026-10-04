# Chargable Proxy — v6.2 示例

## 这是什么

以 v6.2 元模型（`../../meta-model.schema.yaml`）对 Switch 代理加速服务进行建模，并用 AI 生成代码。

## 文件说明

| 文件/目录 | 说明 |
|-----------|------|
| `docs/chargable-proxy-v1.yaml` | existing 项目的 v6.2 格式模型（v1 = 现有版本，作为生成基准） |
| `docs/decisions.md` | AI 生成代码时对建模文档模糊处的决策记录 |
| `docs/general-code-rules.md` | 代码生成的通用规则和约定 |
| `docs/deployment.md` | 部署方案（构建、运行、监控、安全） |
| `docs/implementation-notes.md` | 生成代码的架构说明、API 参考、目录结构 |
| `generated/<日期>-<序号>/` | AI 自动生成的代码，每次重新生成一个目录 |

## 相关资源

- v6.1 建模文件（md/yml）：`v6/v6.1/examples/chargable-proxy/`
- 真实项目代码：`_examples/chargable-proxy/existing`
- 需求说明：`_examples/chargable-proxy/docs/background.md`
