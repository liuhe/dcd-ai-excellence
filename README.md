# DCD AI Excellence — DCDDP 系统建模方法论与工具链

DCDDP 是一套面向 AI 协作的声明式系统建模方法论：用一组 YAML 文件把一个系统的业务视图、应用视图和部署视图描述成一张图（节点 + 边），再由工具链负责校验、查询、编辑和可视化。本仓库同时是方法论的开发仓库和分发源。

## 仓库布局

```
methodology/     方法论本体：元模型 schema、建模约定、样板工程（人和 AI 读）
tools/
  core/          @dcddp/core — loader / 图操作 / vocabulary / 校验 / 迁移
  cli/           @dcddp/cli — 六个图原语动词 + list / get / validate / describe / import / migrate / studio
  kg-web/        @dcddp/kg-web — G6 画布可视化编辑器
  studio/        @dcddp/studio — React 模型浏览与就地编辑
  docs/          设计、存储映射、CLI 手册、变更记录
apply/           分发内容：受管工程引用的稳定入口（apply/bin/dcddp）、集成文档、AI 建模 prompt
.claude/skills/dcd-apply/   把方法论注入目标工程的 Claude Code 命令
```

## 快速开始

```bash
npm install

# 看样板模型
node apply/bin/dcddp list application -m methodology/examples/chargable-proxy/model
node apply/bin/dcddp get entity ent-001 -m methodology/examples/chargable-proxy/model
node apply/bin/dcddp validate -m methodology/examples/chargable-proxy/model

# 建一个新模型并批量导入草稿
node apply/bin/dcddp init -m ./model --org "My Org"
node apply/bin/dcddp import draft.yaml --dry-run -m ./model

# 浏览 / 编辑
node apply/bin/dcddp studio -m ./model
```

## 从哪里读起

- 方法论：`methodology/modeling-conventions.md`，元模型：`methodology/meta-model.schema.yaml`
- 存储结构（schema 7.0）：`tools/docs/STORAGE.md`
- CLI 手册：`tools/docs/CLI_MANUAL.md`；节点 / 边清单：`tools/docs/vocabulary-reference.md`
- 把方法论用到你的工程：`apply/README.md`

## 开发

```bash
cd tools/core && npx tsc --noEmit && npx vitest run
cd tools/cli && npx vitest run
cd tools/studio && npm run typecheck && npx vite build
```
