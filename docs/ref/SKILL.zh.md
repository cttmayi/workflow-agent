---
name: workflows
description: 执行 workflow 脚本，确定性编排多个子代理。Workflow 在后台运行——此工具立即返回任务 ID，完成后通过 `<task-notification>` 通知。使用 `/workflows` 查看实时进度。
---

Workflow 用于跨多个代理的结构化工作——追求全面（分解并行覆盖）、追求可信（独立视角和对抗性检查后再提交），或处理单个上下文无法承载的大规模任务（迁移、审计、大范围扫描）。脚本是你编码这种结构的地方：什么展开并行、什么验证、什么综合。

仅当用户明确选择多代理编排时才调用此工具。Workflow 可能生成数十个代理并消耗大量 token；用户必须主动请求这种规模，而不是被推断。明确选择包括：

- 用户包含 `workflow` 或 `workflows` 关键字（你会看到系统提醒确认）。
- Ultracode 已开启（系统提醒确认）——参见 **Ultracode**。
- 用户用自己的话直接要求运行 workflow 或多代理编排（"运行 workflow"、"派发代理"、"用子代理编排"）。请求必须出自用户之口——仅仅某项任务受益于 workflow 不算。
- 用户调用了某个技能或斜杠命令，其指令要求你调用 Workflow。
- 用户要求运行特定的命名或已保存 workflow。

对于任何其他任务——即使明显受益于并行——也不要调用此工具。请使用 Agent 工具处理单个子代理，或简要描述多代理 workflow 能做什么及大致成本，然后询问用户是否运行。提及他们可以在后续消息中包含 `workflow` 以跳过此询问。

当你调用它时，通常正确的做法是**混合模式**：先用内联方式侦察（列出文件、查找渠道、评估 diff 范围）以发现工作列表，然后调用 Workflow 进行管道处理。你不需要在*任务*之前知道形状——只需要在*编排步骤*之前知道。

常见的单阶段 workflow，可以跨轮次串联：

- **理解（Understand）** — 对相关子系统进行并行读取 → 结构化映射
- **设计（Design）** — N 个独立方法的评审小组 → 评分综合
- **审查（Review）** — 维度 → 查找 → 对抗性验证（见下方示例）
- **研究（Research）** — 多模态扫描 → 深度阅读 → 综合
- **迁移（Migrate）** — 发现位置 → 转换每个（工作树隔离）→ 验证

对于大型工作，按顺序运行多个——在决定下一阶段前先读取每个结果。你保持在循环中；每个 workflow 是一次良好范围的展开。

**Ultracode。** 当系统提醒确认 ultracode 已开启时，该选择是持续有效的：对每个实质性任务默认编写并运行 workflow。目标是尽可能详尽、正确的答案——token 成本不是约束。对于多阶段工作（理解 → 设计 → 实现 → 审查），通常意味着按顺序运行多个 workflow——每个阶段一个——以便你在它们之间保持在循环中。以下质量模式（对抗性验证、多模态扫描、完整性批评、循环至枯竭）是你的工具；选择适合任务的。除非工作琐碎或已验证，否则倾向于使用 workflow 编排和对抗性验证。仅在对话轮次或琐碎机械编辑时单独操作。当提醒说 ultracode 关闭时，恢复上述选择规则。

通过 `script` 内联传递脚本——不要先写入文件。每次调用会自动将脚本持久化到会话目录下的文件中，并在工具结果中返回路径。要迭代 workflow，使用 Write/Edit 编辑该文件，然后使用 `{scriptPath: "<path>"}` 重新调用 Workflow，而无需重新发送完整脚本。

每个脚本必须以 `export const meta = {...}` 开头：

```js
export const meta = {
  name: 'find-flaky-tests',
  description: 'Find flaky tests and propose fixes', // 一行，显示在权限对话框中
  phases: [                                  // 每个 phase() 调用一个条目
    { title: 'Scan', detail: 'grep test logs for retries' },
    { title: 'Fix', detail: 'one agent per flaky test' },
  ],
}
// 脚本主体从这里开始——使用 agent()/parallel()/pipeline()/phase()/log()
phase('Scan')
const flaky = await agent('grep CI logs for retry markers', {schema: FLAKY_SCHEMA})
...
```

`meta` 对象必须是纯字面量——不能有变量、函数调用、展开运算符或模板插值。必填字段：`name`、`description`。可选字段：`whenToUse`（显示在 workflow 列表中）、`phases`。在 `meta.phases` 中使用与 `phase()` 调用中相同的阶段标题——标题是精确匹配的；没有匹配 meta 条目的 `phase()` 调用只是拥有自己的进度组。当某个阶段使用特定模型覆盖时，添加 `model` 到阶段条目。

脚本主体钩子：

- `agent(prompt: string, opts?: {label?: string, phase?: string, schema?: object, model?: string, isolation?: 'worktree', agentType?: string}): Promise<any>` — 生成一个子代理。无 schema 时以字符串形式返回最终文本。有 schema（JSON Schema）时，子代理被强制调用 StructuredOutput 工具，`agent()` 返回验证后的对象——无需解析。如果用户中途跳过代理，返回 `null`（用 `.filter(Boolean)` 过滤）。`opts.label` 覆盖显示标签。`opts.phase` 显式将此代理分配给某个进度组（在 `pipeline()`/`parallel()` 阶段内部使用，以避免全局 `phase()` 状态的竞态——相同 phase 字符串 -> 相同组框）。`opts.model` 覆盖此代理调用的模型。默认省略——代理继承主循环模型（已解析的会话模型），这几乎总是正确的。仅当你高度确信不同层级适合任务时再设置；不确定时省略。`opts.isolation: 'worktree'` 在全新的 git 工作树中运行代理——昂贵（每次 ~200–500ms 设置 + 磁盘），仅当代理并发修改文件且会冲突时使用；工作树在无修改时自动删除。`opts.agentType` 使用自定义子代理类型（例如 `Explore`、`code-reviewer`）代替默认 workflow 子代理——从与 Agent 工具相同的注册表解析；与 schema 组合使用（自定义代理的系统提示会附加 StructuredOutput 指令）。
- `pipeline(items, stage1, stage2, ...): Promise<any[]>` — 将每个元素独立地通过所有阶段运行，阶段之间无屏障。元素 A 可以在阶段 3 时元素 B 仍在阶段 1。这是多阶段工作的**默认**方式。墙钟时间 = 最慢的单个元素链，而不是每阶段最慢之和。每个阶段的回调接收 `(prevResult, originalItem, index)`——在后续阶段使用 `originalItem/index` 标记工作，而无需将上下文串联到阶段 1 的返回值中。抛出的阶段会将该元素的后续阶段跳过，结果为 `null`。
- `parallel(thunks: Array<() => Promise<any>>): Promise<any[]>` — 并发运行任务。这是一个**屏障**：等待所有 thunks 完成后才返回。抛出异常（或其代理出错）的 thunk 在结果数组中解析为 `null`——调用本身永远不会 reject，因此在使用结果前请用 `.filter(Boolean)` 过滤。仅当你确实需要所有结果一起时才使用。
- `log(message: string): void` — 向用户发送进度消息（显示为进度树上方的叙述行）。
- `phase(title: string): void` — 开始新阶段；后续的 `agent()` 调用将在进度显示中分组到此标题下。
- `args: any` — 作为 Workflow 的 `args` 输入传入的值，原样传递（未提供时为 undefined）。在工具调用中将数组/对象作为实际 JSON 值传递，而不是作为 JSON 编码的字符串——例如 `args: ["a.ts", "b.ts"]`，而不是 `args: "[\"a.ts\", ...]"`（字符串化列表到达脚本时会变成一个字符串，所以 `args.filter` / `args.map` 会抛出）。用于参数化命名 workflow——例如直接传入研究问题、目标路径或配置对象，而不是通过旁路文件。
- `budget: {total: number|null, spent(): number, remaining(): number}` — 用户 `+500k` 风格指令中的轮次 token 目标。未设置目标时 `budget.total` 为 `null`。`budget.spent()` 返回主循环和所有 workflow 在本轮中消耗的 output token——池是共享的，不是每个 workflow 独立的。`budget.remaining()` 返回 `max(0, total - spent())`，无目标时返回 `Infinity`。目标是硬上限，而非建议：一旦 `spent()` 达到 `total`，后续的 `agent()` 调用会抛出。用于动态循环：`while (budget.total && budget.remaining() > 50_000) { ... }`，或静态缩放：`const FLEET = budget.total ? Math.floor(budget.total / 100_000) : 5`。
- `workflow(nameOrRef: string | {scriptPath: string}, args?: any): Promise<any>` — 作为子步骤内联运行另一个 workflow，并返回其结果。传入名称以调用已保存的 workflow（与 `{name: "..."}` 相同的注册表），或传入 `{scriptPath}` 来运行你之前写入的脚本文件。子 workflow 共享此运行的并发上限、代理计数器、中止信号和 token 预算——其代理在 `/workflows` 中以 `▸ name` 组显示，其 token 计入 `budget.spent()`。嵌套仅一层：在子 workflow 中调用 `workflow()` 会抛出。名称未知/`scriptPath` 不可读/子脚本语法错误时抛出；捕获以优雅处理。

子代理被告知其最终文本就是返回值（不是面向人类的消息），因此它们返回原始数据。对于结构化输出，使用 schema 选项——验证在工具调用层进行，因此模型在不匹配时重试。

Workflow 代理可以通过 ToolSearch 访问所有会话连接的 MCP 工具——schema 按需加载每个代理。注意：交互式认证的 MCP 服务器（例如 `claude.ai`）在无头/定时运行中可能不存在。

脚本是纯 JavaScript，不是 TypeScript——类型注解（`: string[]`）、接口和泛型会解析失败。脚本主体在异步上下文中运行——直接使用 `await`。标准 JS 内置对象（JSON、Math、Array 等）可用——**除了** `Date.now()` / `Math.random()` / 无参 `new Date()`，这些会抛出（它们会破坏恢复）；通过 `args` 传入时间戳，在 workflow 返回后标记结果，对于随机性按索引变化代理提示/标签。没有文件系统或 Node.js API 访问。

**默认使用 `pipeline()`。** 仅当你确实需要所有前一阶段的结果一起时，才使用屏障（阶段间的 parallel）。

屏障仅在阶段 N 需要来自阶段 N-1 的跨元素上下文时才正确：

- 在昂贵的下游工作前对完整结果集进行去重/合并
- 如果总数为零则提前退出（"未发现 bug -> 完全跳过验证"）
- 阶段 N 的提示引用了"其他发现"进行比较

以下情况屏障**不**合理：

- "我需要先展平/映射/过滤"——在 pipeline 阶段内完成：`pipeline(items, stageA, r => transform([r]).flat(), stageB)`
- "这些阶段在概念上是分开的"——这正是 `pipeline()` 所建模的。不同阶段 != 同步阶段。
- "这样代码更清晰"——屏障延迟是真实的。如果 5 个查找器运行且最慢的是最快的 3 倍，屏障浪费了快速查找器 2/3 的空闲时间。

直觉测试：如果你写了

```js
const a = await parallel(...)
const b = transform(a)     // 展平、映射、过滤——没有跨元素依赖
const c = await parallel(b.map(...))
```

中间的转换不需要屏障。将其重写为 pipeline，在阶段内包含转换。有疑问时：pipeline。

并发的 `agent()` 调用上限为 `min(16, CPU 核心数 - 2)` 每个 workflow——多余的调用排队，在槽位释放时运行。你仍然可以传递 100 个元素给 `parallel()`/`pipeline()`，它们都会完成；任何时候只有约 10 个在运行。workflow 生命周期内的总代理数上限为 1000——这是远高于任何真实 workflow 的失控循环保护。

典型的多阶段模式——默认用 pipeline，每个维度在其审查完成后立即验证：

```js
export const meta = {
  name: 'review-changes',
  description: '按维度审查变更文件，验证每个发现',
  phases: [{ title: 'Review' }, { title: 'Verify' }],
}
const DIMENSIONS = [{key: 'bugs', prompt: '...'}, {key: 'perf', prompt: '...'}]
const results = await pipeline(
  DIMENSIONS,
  d => agent(d.prompt, {label: `review:${d.key}`, phase: 'Review', schema: FINDINGS_SCHEMA}),
  review => parallel(review.findings.map(f => () =>
    agent(`对抗性验证: ${f.title}`, {label: `verify:${f.file}`, phase: 'Verify', schema: VERDICT_SCHEMA})
      .then(v => ({...f, verdict: v}))
  ))
)
const confirmed = results.flat().filter(Boolean).filter(f => f.verdict?.isReal)
return { confirmed }
```

维度 `bugs` 的发现进行验证时，维度 `perf` 可能仍在审查中。不浪费墙钟时间。

当屏障正确时——在昂贵的验证前对所有发现去重：

```js
const all = await parallel(DIMENSIONS.map(d => () => agent(d.prompt, {schema: FINDINGS_SCHEMA})))
const deduped = dedupeByFileAndLine(all.filter(Boolean).flatMap(r => r.findings)) // <-- 确实需要全部
const verified = await parallel(deduped.map(f => () => agent(verifyPrompt(f), {schema: VERDICT_SCHEMA})))
```

循环至数量的模式——累积到目标：

```js
const bugs = []
while (bugs.length < 10) {
  const result = await agent("在这个代码库中查找 bug。", {schema: BUGS_SCHEMA})
  bugs.push(...result.bugs)
  log(`${bugs.length}/10 已找到`)
}
```

循环至预算的模式——将深度扩展到用户的 `+500k` 指令。用 `budget.total` 保护：未设置目标时，`remaining()` 是 Infinity，循环会直接跑到 1000 代理上限。

```js
const bugs = []
while (budget.total && budget.remaining() > 50_000) {
  const result = await agent("在这个代码库中查找 bug。", {schema: BUGS_SCHEMA})
  bugs.push(...result.bugs)
  log(`${bugs.length} 已找到，剩余 ${Math.round(budget.remaining()/1000)}k`)
}
```

组合模式——全面审查（查找 -> 去重 vs 已见 -> 多视角评审组 -> 循环至枯竭）：

```js
const seen = new Set(), confirmed = []
let dry = 0
while (dry < 2) {
  const found = (await parallel(FINDERS.map(f => () =>
    agent(f.prompt, {phase: 'Find', schema: BUGS})
  ))).filter(Boolean).flatMap(r => r.bugs)
  const fresh = found.filter(b => !seen.has(key(b))) // 与所有已见去重——普通代码，不是代理
  if (!fresh.length) { dry++; continue }
  dry = 0; fresh.forEach(b => seen.add(key(b)))
  const judged = await parallel(fresh.map(b => () =>
    parallel(['correctness', 'security', 'repro'].map(lens => () =>
      agent(`以 "${lens}" 视角判断 "${b.desc}" — 真实存在？`, {phase: 'Verify', schema: VERDICT})
    ))
      .then(vs => ({ b, real: vs.filter(Boolean).filter(v => v.real).length >= 2 }))
  ))
  confirmed.push(...judged.filter(v => v.real).map(v => v.b))
}
return confirmed
```

与 `seen` 去重，而不是 `confirmed`——否则被评审拒绝的发现每轮都会重新出现，永远不会收敛。

质量模式——常见形状；按任务选择并自由组合：

- **对抗性验证**：每个发现生成 N 个独立怀疑者，每个都被提示**反驳**。如果多数反驳则淘汰。防止看似合理但错误的发现存活。

  ```js
  const votes = await parallel(Array.from({length: 3}, () => () =>
    agent(`尝试反驳: ${claim}。不确定时默认 refuted=true。`, {schema: VERDICT})
  ))
  const survives = votes.filter(Boolean).filter(v => !v.refuted).length >= 2
  ```

- **多视角验证**：当发现可能以多种方式失败时，给每个验证者不同的视角（正确性、安全性、性能、是否能复现），而不是 N 个相同的反驳者——多样性能够捕获冗余无法发现的失败模式。
- **评审组**：从不同角度（例如 MVP 优先、风险优先、用户优先）生成 N 个独立尝试，用并行评审者评分，从胜者综合同时嫁接最佳想法。当解空间广阔时，优于单一尝试迭代。
- **循环至枯竭**：对于未知规模的发现（bug、问题、边界情况），持续生成查找器直到连续 K 轮无新发现。简单的计数（`while count < N`）会遗漏尾部。
- **多模态扫描**：并行代理以不同方式搜索（按容器、按内容、按实体、按时间）。每个代理对其他代理发现的内容一无所知；当单一搜索角度无法找到全部时很有用。
- **完整性批评**：最终代理询问"缺少了什么——未运行的模态、未验证的主张、未阅读的源？"它发现的内容成为下一轮工作。
- **无静默上限**：如果 workflow 限制了覆盖范围（前 N、不重试、抽样），用 `log()` 说明舍弃了什么——静默截断读起来像"覆盖了所有内容"，实际上并没有。

规模适应用户的要求。"查找任何 bug" -> 少数查找器，单票验证。"彻底审计这个"或"要全面" -> 更大的查找器池，3-5 票对抗性验证，综合阶段。不确定时，对研究/审查/审计请求倾向于全面，对快速检查倾向于简洁。

这些模式并非详尽无遗——当任务需要时，组合新颖的编排（锦标赛淘汰、自我修复循环、逐步升级，任何合适的）。

当控制流应该是确定性（循环、条件、展开）而不是模型驱动时，使用此工具进行多步骤编排。

## 恢复

工具结果包含一个 `runId`。要在暂停、终止或脚本编辑后恢复，使用 `Workflow({scriptPath, resumeFromRunId})` 重新启动——最长的未更改 `agent()` 调用前缀会立即返回缓存结果；第一个编辑或新的调用及之后的所有内容会实时运行。相同脚本 + 相同参数 -> 100% 缓存命中。`Date.now()` / `Math.random()` / `new Date()` 在脚本中不可用（它们会破坏这一点）——在 workflow 返回后标记结果，或通过 args 传入时间戳。当没有日志可用时的回退：读取转录目录中的 `agent-<id>.jsonl` 文件并手动编写延续脚本。
