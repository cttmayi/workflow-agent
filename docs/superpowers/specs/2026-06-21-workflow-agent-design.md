# Workflow Agent — 设计规格

> 基于 Node.js 的工作流生成器与执行器，支持多平台 AI agent 编排

## 1. 概述

一个 CLI + Web Dashboard 工具。执行器通过 `vm.SourceTextModule` 加载并执行工作流脚本，内置 `agent()`、`parallel()`、`pipeline()`、`phase()`、`log()` API。Agent 步骤通过子进程调用 `claude` / `codex` CLI 执行。

工具自带内置工作流，其中一个就是生成器 — 用 AI 来自动生成新的工作流文件。

## 2. 架构

### 包结构 (Monorepo)

```
workflow-agent/
├── packages/
│   ├── core/              # 工作流引擎：VM 加载、API 注入、调度、状态机、事件
│   ├── agent/             # Agent 抽象层 + Claude Code / Codex 适配器
│   ├── cli/               # CLI 入口 + 内置 workflow
│   └── dashboard/         # Web Dashboard (Express + React)
├── examples/
└── docs/
```

### 分层

```
┌─────────────────────────────┐
│   CLI / Dashboard           │  用户界面层
├─────────────────────────────┤
│   Workflow Engine (core)    │  调度核心
│   ├── Workflow Loader       │  vm.SourceTextModule 加载
│   ├── Runtime APIs          │  agent/parallel/pipeline/phase/log
│   ├── Scheduler             │  并发控制、取消
│   └── Event Emitter         │  实时状态事件
├─────────────────────────────┤
│   Agent Layer               │  agent 执行抽象
│   ├── AgentProvider         │  接口
│   ├── ClaudeCodeProvider    │  claude --dangerously-skip-permissions -p
│   └── CodexProvider         │  codex exec --full-auto
└─────────────────────────────┘
```

## 3. 工作流来源

执行器有三个工作流来源，按优先级从高到低：

| 来源 | 路径 | 优先级 | 说明 |
|------|------|--------|------|
| **项目用户** | `.workflow-agent/workflow/` | 1 (最高) | 项目专用，覆盖全局和内置 |
| **全局用户** | `~/.workflow-agent/workflow/` | 2 | 跨项目共享，用户自建 |
| **内置 (built-in)** | `packages/cli/workflows/` | 3 (最低) | 随工具发布，只读，如生成器 |

执行 `workflow-agent run <name>` 时，按项目 → 全局 → 内置顺序查找，第一个命中即执行。`list` 命令显示每个 workflow 的来源标签。

## 4. 配置

### 配置文件

| 层级 | 路径 | 优先级 |
|------|------|--------|
| 项目 | `.workflow-agent/config.json` | 高 |
| 全局 | `~/.workflow-agent/config.json` | 低 |

项目配置覆盖全局配置，未设置的字段回退到全局，再回退到内置默认值。

### 配置项

```json
{
  "defaultProvider": "claude-code",
  "timeout": 300000,
  "maxParallel": 4
}
```

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `defaultProvider` | `string` | `"claude-code"` | 脚本中未指定 `provider` 的 `agent()` 调用使用此值 |
| `timeout` | `number` | `300000` | 单个 agent 调用的超时时间（毫秒）|
| `maxParallel` | `number` | `4` | `parallel()` 的最大并行数 |

## 5. 工作流文件模型

```javascript
// .workflow-agent/workflow/code-review.js
export const meta = {
  name: 'code-review',
  description: 'Review code changes for issues',
  providers: ['claude-code', 'codex']   // 可选，仅用于展示
}

const changed = await agent('列出本次变更的文件', { provider: 'claude-code' })
const reviews = await parallel(changed.map(f => () =>
  agent(`审查 ${f}`, { provider: 'codex' })
))
return { total: changed.length, reviews }
```

- 纯 JS，无 TypeScript
- 无 Node.js API / 文件系统访问
- 无 npm 依赖
- 仅依赖注入的 API：`agent`、`parallel`、`pipeline`、`phase`、`log`
- `export const meta` 声明元数据
- 脚本内 `return` 作为工作流结果

## 6. 内置 Workflow：生成器 (`generate`)

生成器本身是一个 workflow，复用同一套执行体系。

### 核心设计

使用 `agent(..., { interactive: true })` 为用户启动完整的交互式 agent 会话。用户直接和 Claude Code / Codex 对话，agent 本身拥有完整的文件系统访问权限，可以直接在工作目录中操作文件。

### 执行流程

```
用户运行： workflow-agent run generate

1. phase('交互生成')
2. agent(..., { interactive: true })
   → spawn claude（不加 -p），透传 stdin/stdout/stderr
   → 用户获得完整的 Claude Code 交互式会话
   → 用户在会话中描述需求 → AI 生成代码 → AI 写入文件
   → 用户 /exit 退出会话
3. agent() 返回会话结束后的输出
4. 完成
```

### 实现示意

```javascript
// packages/cli/workflows/generate.js
export const meta = {
  name: 'generate',
  description: 'Generate a new workflow using AI',
  providers: ['claude-code', 'codex']
}

phase('交互生成')
const result = await agent(`你是 Workflow Agent 的生成助手。

你的任务是：
1. 通过对话了解用户想要什么样的 workflow
2. 生成符合规范的 workflow 脚本代码
3. 输出代码并在确认后写入 .workflow-agent/workflow/ 目录

生成的 workflow 脚本要求：
- export const meta = { name, description, providers }
- 使用 agent(), parallel(), pipeline(), phase(), log() API
- 纯 JS，无外部依赖
- 文件名与 meta.name 一致

请先了解用户的需求，设计方案，然后生成代码并写入文件。`, {
  interactive: true
})

phase('完成')
log('Workflow 生成完毕')
return { result }
```

### 交互模式的工作机制

`agent(..., { interactive: true })` 模式下：
- 不传 `-p` 参数，spawn 原生交互式进程
- 子进程的 stdin / stdout / stderr 直接绑定到用户终端
- 用户在完整的 AI 交互会话中完成工作
- 会话退出后（如 `/exit`），agent() resolve 返回会话输出内容
- 由于 agent 有完整文件系统访问，直接写文件，无需 `writeWorkflow()` 特权

### 实现对比

| | 普通 agent | 交互式 agent |
|--|-----------|-------------|
| spawn 命令 | `claude -p "prompt" --dangerously-skip-permissions` | `claude` (无参数) |
| stdin | pipe (发送 prompt) | 透传用户终端 |
| stdout | pipe (收集输出) | 透传用户终端 |
| 文件访问 | 无 | 有（子进程继承用户权限） |
| 适用场景 | 自动化任务 | 生成器、调试、人工审核 |

### 生成器的使用场景

1. 首次使用：`workflow-agent init`（初始化目录和配置） → `workflow-agent run generate`（创建第一个 workflow）
2. 生成新 workflow：`workflow-agent run generate` — AI 对话生成，直接写入 `.workflow-agent/workflow/`
3. 生成的 workflow 可以手改、重新生成、删除

## 7. 核心引擎设计

### 7.1 Workflow 加载

使用 `vm.SourceTextModule` 加载工作流脚本：

```javascript
import vm from 'node:vm'

const source = readFileSync(workflowPath, 'utf-8')

const module = new vm.SourceTextModule(source, {
  context: vm.createContext({
    agent, parallel, pipeline, phase, log,
    console, Promise, setTimeout
    // 不暴露 fs, process, require
  })
})

await module.link(() => {})
await module.evaluate()

const meta = module.namespace.meta
```

### 7.2 注入的 Runtime API

#### `agent(prompt, opts?)`

执行 AI agent。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `prompt` | `string` | 是 | 发给 agent 的指令文本 |
| `opts.provider` | `'claude-code' | 'codex'` | 否 | 指定 agent 平台。不指定则用 CLI `--provider` 默认值 |
| `opts.label` | `string` | 否 | 显示标签，在进度展示和日志中标识该 agent 调用 |
| `opts.phase` | `string` | 否 | 显式指定此 agent 归属阶段。用在 `pipeline()`/`parallel()` 内部避免阶段竞争 |
| `opts.schema` | `object` | 否 | JSON Schema。有 schema 时 prompt 尾部附加上格式要求，agent 用 bash 自校验，返回验证后的对象。无 schema 时直接返回文本 |
| `opts.interactive` | `boolean` | 否 | `true` 时透传终端，不传 `-p` 参数，启动原生交互式会话。会话退出后返回输出 |
| `opts.signal` | `AbortSignal` | 否 | 取消信号。传递后支持外部取消（Ctrl+C 或超时） |

**返回值：**

- 无 `schema`: `Promise<string>` — agent 输出的文本
- 有 `schema`: `Promise<object>` — JSON.parse 验证后的结构化数据
- agent 执行被跳过/取消: `null`

---

#### `parallel(thunks)`

并发执行多个任务。**这是 BARRIER**：等待所有 thunk 完成后才返回。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `thunks` | `Array<() => Promise<any>>` | 是 | 函数数组，每个函数返回一个 Promise。函数立即执行（不等待上一个）|

**返回值：** `Promise<any[]>` — 按传入顺序排列的结果数组。单项抛异常则该项为 `null`，调用本身不 reject。用 `.filter(Boolean)` 过滤失败项。

**使用原则：** 只在真正需要全部结果一起处理时才用。如果后续阶段可以逐个处理，用 `pipeline()` 代替。

---

#### `pipeline(items, ...stages)`

流水线处理。每项依次经过所有 stage，无 barrier。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `any[]` | 是 | 要处理的项目数组 |
| `...stages` | `(item) => Promise<any>[]` | 是 | 处理函数。每个 stage 接收 `(prevResult, originalItem, index)` |

**stage 回调签名：**

```
stage(prevResult, originalItem, index) => Promise<any>
```

| 参数 | 说明 |
|------|------|
| `prevResult` | 上一个 stage 对此项的返回值（stage 1 中等于 `originalItem`） |
| `originalItem` | `items` 中原始元素，用于给结果标记来源 |
| `index` | 此项在 `items` 中的索引 |

**行为：**
- 无 barrier：A 项在 stage 3 时，B 项可同时在 stage 1，互不等待
- stage 抛出异常：该项结果为 `null`，跳过该项的后续 stage
- 总耗时 ≈ 最慢单项的链式耗时，非各 stage 最慢之和

**返回值：** `Promise<any[]>` — 每项的最终 stage 结果。stage 抛出的项为 `null`。

---

#### `phase(title)`

标记当前阶段。后续的 `agent()` 调用归入此阶段，在进度展示中分组显示。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | `string` | 是 | 阶段名称 |

#### `log(message)`

输出日志行。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | `string` | 是 | 日志内容 |


### 7.3 调度机制

- 引擎不预构建 DAG（工作流脚本自身通过 `agent()` / `parallel()` / `pipeline()` 决定执行顺序）
- `parallel()` 内部实现并发池，默认最大并发 4
- `agent()` 串行执行，可通过 `parallel` 包装实现并行 agent
- 通过 AbortSignal 支持取消
- 支持超时控制

### 7.4 事件系统

| 事件 | 载荷 |
|------|------|
| `workflow:start` | `{ name, timestamp }` |
| `workflow:complete` | `{ name, result, duration }` |
| `workflow:error` | `{ name, error, duration }` |
| `agent:start` | `{ provider, prompt, label }` |
| `agent:complete` | `{ provider, output, data, exitCode, duration }` |
| `agent:log` | `{ line }` |
| `phase:change` | `{ title }` |

## 8. Agent Layer 设计

### 接口

```typescript
interface AgentProvider {
  name: 'claude-code' | 'codex'
  execute(params: {
    prompt?: string            // 非交互模式必填
    interactive?: boolean      // true = 交互模式，透传终端
    schema?: object            // JSON Schema，要求 agent 输出结构化数据
    label?: string
    signal?: AbortSignal       // 取消信号
  }): Promise<AgentResult>
}

interface AgentResult {
  output: string        // agent 输出文本
  data?: object         // schema 验证后的结构化数据
  exitCode: number
  duration: number
  logs?: string[]
}
```

### 实现

**ClaudeCodeProvider:**
- 非交互: `claude --dangerously-skip-permissions -p "${prompt}"`
- 交互: `claude`（不加参数，透传 stdin/stdout/stderr）

**CodexProvider:**
- 非交互: `codex exec "${prompt}" --full-auto`
- 交互: `codex`（不加参数，透传 stdin/stdout/stderr）

子进程管理：
- 非交互: pipe stdout/stderr，逐行读取 → 触发 `agent:log` 事件
- 交互: stdin/stdout/stderr 直接绑定 process.stdio，引擎不干预输出
- 超时后 kill 子进程
- AbortSignal → kill 子进程

### Schema 验证策略

有 `schema` 参数时，引擎在 prompt 尾部追加格式要求，告知 agent 用 bash 自校验：

```
[用户原始 prompt]

你必须输出 JSON，格式须符合以下 Schema：
{...}

你可以用 bash 或 node -e 验证输出是否符合 Schema，
确认格式正确后再返回最终结果。
```

引擎侧收到输出后做 `JSON.parse()`。解析失败则重试一次，带解析错误信息发给 agent 修正。两次均失败则抛出错误，终止 workflow。

## 9. CLI 设计

```
workflow-agent
├── list                        # 列出所有可用 workflow（用户 + 内置）
├── run <name> [options]        # 执行 workflow
│   ├── --provider <name>       # 默认 agent provider
│   ├── --timeout <ms>          # 超时
│   ├── --max-parallel <n>      # 最大并行数
│   └── --watch                 # 启动 dashboard
├── dashboard [port]            # 启动 Web Dashboard
└── init                        # 初始化 .workflow-agent/workflow/ + 运行 generate
```

- `list`：扫描用户目录 + 读取内置列表，VM 加载仅读取 meta
- `run`：先查用户目录再查内置，VM 加载执行，实时输出进度
- `--provider`：脚本中未指定 `provider` 的 `agent()` 调用使用此默认值
- `init`：创建 `.workflow-agent/workflow/` 目录。如果 `~/.workflow-agent/config.json` 存在则复制为项目配置，否则生成默认配置

## 10. Dashboard 设计

- **技术栈：** Express (server) + React (Vite)
- **数据源：** 通过 EventEmitter + SSE 实时推送，内存存储
- **页面：**
  - `/` — Workflow 列表（用户 + 内置）
  - `/runs` — 本次会话运行历史
  - `/runs/:id` — 运行详情（步骤树、实时日志）
  - `/workflow/:name` — 查看 meta，触发运行

## 11. 错误处理

| 场景 | 处理 |
|------|------|
| 脚本语法错误 | VM 抛异常 → CLI 输出位置信息，exit 1 |
| agent 子进程退出码非 0 | 捕获 stderr，标记失败 |
| agent 超时 | kill 子进程，标记 error |
| workflow 未找到 | 提示不存在，列出所有可用 |
| CLI 工具未安装 | spawn 失败 → 提示安装 |
| Ctrl+C | AbortSignal → kill 子进程 → 标记 cancelled |
| 生成器写文件失败 | 提示目录权限或磁盘空间 |

## 12. 开发路线

| 阶段 | 内容 |
|------|------|
| Phase 1 | `core` — VM 加载、API 注入、调度、事件 |
| Phase 2 | `agent` — ClaudeCode / Codex Provider、子进程管理 |
| Phase 3 | `cli` — list / run / init 命令 + 内置 generate workflow |
| Phase 4 | `dashboard` — Express + React + SSE |
