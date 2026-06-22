# Workflow Agent

基于多平台 AI 代理（Claude Code、Codex）的工作流生成与执行引擎。使用简单的异步 API — `agent()`、`parallel()`、`pipeline()` — 编写 `.js` 工作流脚本，并在你偏好的 AI 提供商上运行。

## 安装

```bash
git clone <repo>
cd workflow-agent
npm install
```

## 快速开始

```bash
# 列出可用工作流
node packages/cli/src/index.js list

# 运行内置自测工作流
node packages/cli/src/index.js run test

# 交互式生成新工作流
node packages/cli/src/index.js run generate
```

### 全局安装（可选）

```bash
npm link
workflow-agent list
workflow-agent run test
```

**从 GitHub 直接安装（无需 clone）：**

```bash
npm install -g cttmayi/workflow-agent
workflow-agent list
```

## 编写工作流

工作流是一个普通的 `.js` 文件，包含 `meta` 导出并使用提供的运行时 API 的顶层异步代码。

```javascript
// .workflow-agent/workflow/my-workflow.js
export const meta = {
  name: 'my-workflow',
  description: '这个工作流做什么',
  providers: ['claude-code']
}

phase('处理中')
const result = await agent('执行任务', { provider: 'claude-code' })

return { result }
```

### meta

描述工作流的必需导出：

| 字段 | 类型 | 说明 |
|-------|------|------|
| `name` | `string` | 工作流名称（用于 `run <name>`） |
| `description` | `string` | 列表中显示的简短说明 |
| `providers` | `string[]` | 兼容的提供商列表 |

### 运行时 API

在工作流代码中作为全局变量使用：

**`agent(prompt, opts)`** — 调用 AI 代理。

- `prompt` — 发送给提供商的指令文本
- `opts.provider` — 提供商名称（`'claude-code'` 或 `'codex'`，默认使用配置）
- `opts.interactive` — 如果为 `true`，交互式运行 CLI（透传 stdin/stdout）
- `opts.schema` — 结构化输出的 JSON schema。提供商追加格式要求并验证响应
- `opts.label` — 日志/事件的标签
- 返回代理的输出文本，当提供 schema 时返回解析后的 JSON 数据

**`parallel(thunks)`** — 并发执行多个代理调用。

- `thunks` — `() => agent(...)` 函数数组
- 按输入顺序返回结果数组
- 遵循 `maxParallel` 配置（默认：4）
- 失败的 thunk 返回 `null`（不会级联失败）

```javascript
const [summary, analysis] = await parallel([
  () => agent('总结这份文档'),
  () => agent('分析情感倾向')
])
```

**`pipeline(items, ...stages)`** — 将多个项目依次经过多个处理阶段。

- `items` — 输入项目数组
- `stages` — 阶段函数 `(prevResult, originalItem, index) => Promise`
- 返回最终结果数组

```javascript
const processed = await pipeline(
  ['a', 'b', 'c'],
  (item) => agent(`处理 ${item}`),
  (prev) => agent(`优化: ${prev}`)
)
```

**`input(prompt)`** — 等待用户输入。

- 设置提示文本并等待用户输入一行
- 返回用户输入的字符串
- 提示文本前缀为 `❯ `，以区别于其他输出

```javascript
const name = await input('请输入名称: ')
// 显示: ❯ 请输入名称:
```

**`phase(title)`** — 发出阶段变更事件（显示在 CLI 输出和仪表盘中）。

**`log(message)`** — 发送日志消息（写入日志文件，不输出到 stdout）。

### Schema 校验

向 `agent()` 传入 JSON schema 以获取结构化输出。提供商将格式要求追加到提示中，并自动解析和验证响应。

```javascript
const user = await agent('从文本中提取用户信息', {
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' }
    },
    required: ['name']
  }
})
// user.name 是解析后的字符串，user.age 是解析后的数字
```

如果代理将 JSON 包裹在 markdown 代码块中，提供商会自动去除。

### 日志系统

工作流执行日志写入 `.workflow-agent/log/`，文件名带时间戳（如 `2026-06-23T02-20-00.log`）。

- stdout 保留给交互式提示（`input()`）
- 所有代理调用、阶段变更和错误均记录在日志文件中
- 每条日志格式：`[HH:MM:SS][LEVEL] message`

### 工作流发现

按名称解析工作流（优先级顺序）：

1. **项目** — `.workflow-agent/workflow/<name>.js`
2. **全局** — `~/.workflow-agent/workflow/<name>.js`
3. **内置** — `packages/cli/workflows/<name>.js`

## 配置

三层合并：默认值 → 全局 → 项目。

| 字段 | 默认值 | 说明 |
|-------|---------|------|
| `defaultProvider` | `'claude-code'` | 默认代理提供商 |
| `timeout` | `300000` | 每个代理的超时时间（毫秒） |
| `maxParallel` | `4` | 最大并发代理执行数 |

- **全局：** `~/.workflow-agent/config.json`
- **项目：** `<cwd>/.workflow-agent/config.json`

## CLI

```bash
workflow-agent list                        列出所有可用工作流
workflow-agent run <name> [options]        执行工作流
workflow-agent dashboard [port]            启动 Web 仪表盘（默认：3456）
workflow-agent init                        初始化 .workflow-agent 目录

选项：
  --provider <name>    代理提供商（默认：claude-code）
  --timeout <ms>       每个代理的超时时间（默认：300000）
  --max-parallel <n>   最大并发代理数（默认：4）

运行日志写入 `.workflow-agent/log/`。`generate` 工作流还会在 `.workflow-agent/workflow/` 中生成工作流脚本。
```

## 仪表盘

```bash
workflow-agent dashboard
# 或使用自定义端口：
workflow-agent dashboard 8080
```

基于 SSE 事件流的实时 Web 仪表盘，展示工作流进度、代理调用和结果。

## 内置工作流

| 名称 | 说明 |
|------|------|
| `generate` | 交互式 workflow 生成器 — 7 阶段流程：收集需求 → 理解确认(agent 审查循环) → 生成设计方案 → 审查设计(自动审查循环) → 用户确认方案 → 生成代码 → 审查代码(自动审查循环) |
| `test` | 自测 — 验证所有运行时 API（agent、parallel、pipeline、phase、log、schema） |

## 项目结构

```
workflow-agent/
├── packages/
│   ├── core/          Engine、沙箱、调度器、运行时 API、事件系统
│   ├── agent/         提供商适配器（Claude Code、Codex）
│   ├── cli/           CLI 入口、工作流查找器、内置工作流
│   └── dashboard/     Web 仪表盘（HTTP + SSE）
├── .workflow-agent/
│   ├── workflow/       用户创建的工作流脚本
│   └── log/            执行日志（自动生成）
```

## 开发

```bash
# 运行测试
node --test packages/core/test/*.test.js packages/cli/test/*.test.js
```
