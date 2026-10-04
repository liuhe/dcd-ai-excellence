# CLAUDE.md

## 项目定位

DCD AI Excellence — DCDDP 系统建模方法论的**开发 + 分发**工程。

职责：
1. **方法论本体开发**：维护元模型 schema、建模约定、AI 建模 prompt
2. **工具链**：`@dcddp/core`（共享逻辑）、`@dcddp/cli`（命令行）、`@dcddp/kg-web`（可视化编辑器）、`@dcddp/studio`（模型浏览器，原 viewer）
3. **分发到受管工程**：通过 `/dcd-apply` 把方法论注入目标工程，使 AI 在目标工程内按方法论协作

## 目录结构

按三块职责切分，目录名即职责：

```
dcd-ai-excellence/
├── methodology/                 # 块 1 方法论本体（人和 AI 读的内容，不含代码）
│   ├── meta-model.schema.yaml   #   元模型 Schema（core vocabulary 的人读镜像）
│   ├── modeling-conventions.md  #   建模约定
│   └── examples/chargable-proxy/  # 样板工程（schema v6.0）
├── tools/                       # 块 2 工具链（npm workspaces，core 是其余三个的共享依赖）
│   ├── core/                    #   @dcddp/core — loader / graph ops / vocabulary / yaml-io / migrations / types
│   ├── cli/                     #   @dcddp/cli — 6 图原语动词 + list/get/validate/describe/migrate
│   ├── kg-web/                  #   @dcddp/kg-web — G6 canvas + Express server，可视化编辑
│   ├── studio/                  #   @dcddp/studio — React 模型浏览 / 就地编辑（server/ + src/），由 `dcddp studio` 从本仓库起服务
│   └── docs/                    #   DESIGN / STORAGE / CLI_MANUAL / CHANGELOG / MIGRATION / VERIFICATION
│       ├── vocabulary-reference.md  # 自动生成：dcddp describe --format markdown
│       └── audits/              #   vocabulary 审计过程记录
├── apply/                       # 块 3 分发内容（受管工程引用的入口都在这里）
│   ├── bin/dcddp                #   CLI 稳定入口：受管工程只引用此路径，tools/ 内部可自由调整
│   ├── README.md                #   集成入口文档
│   └── system-modeling-prompt.md  # AI 建模 prompt
├── .claude/skills/dcd-apply/    # 分发命令（位置固定，Claude Code 由此发现 skill）
├── projects.local.json          # 受管工程登记表（gitignored）
└── package.json                 # monorepo workspace root
```

**块 1 与块 2 的重叠**：vocabulary 的 source of truth 是 `tools/core/src/vocabulary.ts`，`methodology/meta-model.schema.yaml` 是给人和 AI 读的镜像。改 kind 去 core，改完同步 schema。

## 硬性约束

- **语言约定**：
  - `.md` 文档：中文
  - CLI 工具输出（stdout / stderr / help / error）：英文
  - 代码注释 / 变量名 / 标识符：英文优先
  - YAML 数据（用户模型）：字段名英文，值可中英文混合
- **对外路径契约**：受管工程只允许引用 `apply/`、`methodology/`、`tools/docs/` 三个路径。`tools/` 和 `tools/studio/` 内部怎么摆是本仓库的事，不得泄露到注入模板里。

## 架构要点

- **KG 四层 stack**（详见 `tools/docs/DESIGN.md`）：Layer 1 KG substrate（三元组）→ Layer 2 Meta-model（封闭 vocabulary）→ Layer 2.5 Project vocabulary（未实现）→ Layer 3 Instance graph（YAML 目录）
- **Vocabulary 驱动**：所有 node-kind / rel-kind 声明在 `tools/core/src/vocabulary.ts`，加 kind = 加一条 registry 条目
- **6 个图原语动词**：add-node / update-node / remove-node / connect / update-edge / disconnect
- **三个界面共享 core**：CLI、kg-web、手工编辑 YAML。viewer 为只读第四界面
- **元模型**：3 视图（业务/应用/部署）、三层用例、业务模型 vs 应用领域模型
- **存储（schema 7.0）**：`index.yaml` 是唯一的存在性来源（id + name，嵌套即归属，package 即分组）；`business/`、`applications/<app-id>-<name>/` 下的细节文件是平铺的 `<kind>: [条目]`，文件边界无语义；非归属边存在源节点条目里，值是目标 id。详见 `tools/docs/STORAGE.md`
- **Schema 版本**：当前 `"7.0"`，版本常量在 `tools/core/src/version.ts`，迁移注册表在 `tools/core/src/migrations/`（6.0 → 7.0 真实迁移，写 migration-report.md）

## 开发命令

```bash
# CLI（稳定入口，任意 cwd 可用）
node apply/bin/dcddp list application -m methodology/examples/chargable-proxy/model
node apply/bin/dcddp get entity ent-001 -m methodology/examples/chargable-proxy/model
node apply/bin/dcddp validate -m methodology/examples/chargable-proxy/model

# kg-web（可视化编辑器，含 API server）
cd tools/kg-web && npm run dev        # http://localhost:5173 + LAN

# studio（浏览 + 就地编辑）
cd tools/studio && npm run dev                        # vite :5174 + API :5175，读 projects.local.json
node apply/bin/dcddp studio -m <model>                # 单模型服务模式（受管工程用这条）
node apply/bin/dcddp studio -m <model> --export <dir> # 只读静态导出

# 类型检查
cd tools/core && npx tsc --noEmit
cd tools/kg-web && npm run typecheck

# 测试
cd tools/core && npx vitest run
cd tools/cli && npx vitest run

# 改了 vocabulary 后刷新人读参考
node apply/bin/dcddp describe --format markdown > tools/docs/vocabulary-reference.md
```

## 禁止写 memory

**本工程内一律不要往 auto memory（`~/.claude/projects/.../memory/`）写任何条目。** 所有需要跨会话保留的规则、约定、偏好，全部写进本 `CLAUDE.md` 或对应子目录的 CLAUDE.md / SKILL.md。

原因：memory 是个人的、隐藏的、会话外不可见；本工程规则需要对协作者、subagent、未来的自己都完全透明，走版本控制的 markdown 才能做到。看到"要不要记下来"的需求 → 直接编辑 CLAUDE.md，不要调 Write 去 memory 目录。

## 排查模型问题：先用 CLI，不要读原始 YAML

排查任何模型内容问题（不管本工程 examples 还是受管工程），**先读 `index.yaml` 看全览，再用 `dcddp` CLI**（`list` / `get` / `describe` / `validate`）读细节，不要直接 `cat` / `read` 细节 YAML 文件。

原因：CLI 走 loader，会做双语字段归一化、别名合并、schema 校验；直接读 YAML 看到的是未归一化结构，容易得出错误结论（例如误判字段名、把 `organizations` 当成不存在，或漏掉别名字段）。而且很多 bug 就在归一化层，只有对比 CLI 输出和原始 YAML 才能定位。

只有在以下情况才回退到直接读 YAML：排查 loader / CLI 自身 bug、需要精确定位字段名 → 归一化 key 的映射关系、CLI 明确报错且需要看源数据佐证。

## 受管工程操作原则

**绝不直接读写受管工程的模型文件。** 所有对受管工程模型的检查或修改，必须以 subagent 方式在目标工程目录下运行，让 subagent 读到目标工程的 CLAUDE.md、获取 `dcd_root`，再通过 CLI 工具完成操作。

**运行前必须先向用户展示完整 prompt 并获得确认，确认后才可启动 subagent。**

这条原则确保：
- 受管工程自身具备完整的方法论能力（不依赖外部手工介入）
- 操作路径与真实 AI 协作场景一致（目标工程内的 AI 用 CLI 自助）
- 用户对 subagent 的行为有完整的预期和控制

典型 subagent prompt 模式：
```
工作目录：<target-path>
任务：<具体任务描述>
步骤：
1. 读 .claude/settings.local.json 获取 dcd_root
2. 用 node <dcd_root>/apply/bin/dcddp <command> -m <model-path> 执行操作
3. ...
```

## 分发机制

目标工程通过 `/dcd-apply` 注入建模方法论（CLAUDE.md 段 + viewer 安装）。详见 `.claude/skills/dcd-apply/SKILL.md`，集成入口文档见 `apply/README.md`。

**判断哪些是受管工程**：读 `projects.local.json`（gitignored，本机维护），由 `/dcd-apply` 自动注册。不要通过搜索 CLAUDE.md 关键词来推断。此文件被 gitignore，glob 搜索工具会跳过它，必须用 `read` 直接按路径读取。


## 参考数据

- 淘宝店铺 SKU 结构详见 `methodology/examples/chargable-proxy/docs/taobao-sku-structure.md`
- 完整 changelog 见 `tools/docs/CHANGELOG.md`
- 设计原则见 `tools/docs/DESIGN.md`
- 存储映射见 `tools/docs/STORAGE.md`，节点/边清单见 `tools/docs/vocabulary-reference.md`
