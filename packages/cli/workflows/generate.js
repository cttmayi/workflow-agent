export const meta = {
  name: 'generate',
  description: '使用 AI 生成新的 workflow',
  providers: ['claude-code', 'codex']
}

const MAX_REVIEWS = 3
const judgeSchema = {
  type: 'object',
  properties: {
    isApproved: { type: 'boolean' },
    feedback: { type: 'string' }
  }
}

// ---- Agent wrappers ----

async function generateStructuredReq(name, raw) {
  return await agent(`你是 Workflow Agent 生成助手，请将用户的需求整理为清晰的结构化描述。

Workflow 名称：${name}
用户描述：${raw}

请输出：
1. 核心功能：一句话总结这个 workflow 做什么
2. 输入：需要用户提供什么
3. 处理流程：大致需要几步
4. 输出：最终返回什么

用中文输出。`)
}

async function reviseRequirement(current, feedback, original) {
  return await agent(`根据反馈修正需求理解。

反馈意见：${feedback}

当前需求理解：
${current}

原始用户描述：${original}

输出修正后的结构化需求描述。`)
}

async function generateDesignPlan(name, requirement) {
  return await agent(`你是 Workflow Agent 生成助手。

需求：
- 名称：${name}
- 需求描述：${requirement}

重要限制：
- 可用 API：agent()（调用 AI）、phase()（标记阶段）、log()（输出信息）、input()（等待用户输入）、parallel()（并发）、pipeline()（管道）
- 不可用：fs、path、process、cwd、__dirname、__filename、require、import 及任何 Node.js 模块
- workflow 运行在沙箱中，只有标准 JS 全局对象和上述 API
- 如需文件系统或 shell 命令，通过 agent() 委托
- 默认原则：除非用户明确指定路径，否则默认处理当前目录下的文件
- 设计原则：默认用 pipeline() 串联处理，只有需要汇集全部结果时才用 parallel()

输出详细的设计方案，包括：整体流程、每个阶段的输入输出、使用的 API。不超过 500 字。`)
}

async function reviewDesign(plan) {
  return await agent(`你是审查代理，负责审查 workflow 设计方案的质量。

审查以下方案，检查：
1. 是否合理使用了可用 API（agent、phase、log、input、parallel、pipeline）
2. 是否使用了禁止的模块（fs、path、process、cwd 等）
3. 流程是否完整、合理
4. 是否有足够的错误处理考虑

方案：
${plan}

如果方案无问题，回复第一行为：通过
如果有问题，列出具体问题及修改建议。`)
}

async function reviseDesign(plan, review) {
  return await agent(`根据审查意见修改设计方案。

审查意见：
${review}

原方案：
${plan}

输出修改后的设计方案。`)
}

async function reviseDesignByUser(plan, feedback) {
  return await agent(`用户对设计方案提出修改意见，请修改。

修改意见：${feedback}

当前方案：
${plan}

输出修改后的设计方案。`)
}

async function generateWorkflowCode(plan, name) {
  return await agent(`你是 Workflow Agent 生成助手。

根据下方批准的设计方案生成 workflow 脚本。

方案：
${plan}

关键 - 只能使用以下 API（注意参数说明）：
  - agent(prompt, opts) - 调用 AI 代理
    prompt: 指令文本
    opts.provider: 可选，'claude-code'（默认）或 'codex'
    opts.schema: 可选，JSON Schema 对象，要求 AI 返回结构化数据
    opts.label: 可选，日志标签
    返回: AI 输出的文本（有 schema 时返回解析后的对象）
  - parallel([thunks]) - 并发执行多个任务（屏障：等待全部完成）
    thunks: 无参异步函数数组，如 [() => task1(), () => task2()]
    注意: 某个 thunk 失败不会导致 parallel 整体 reject，其结果为 null
    返回: 所有结果的数组（失败的项为 null）
  - pipeline(items, ...stages) - 管道：各元素独立流经多个阶段，无等待
    items: 输入数组
    stages: 处理函数，每阶段接收 (prevResult, originalItem, index) 返回处理结果
    注意: 阶段间无屏障，A 元素到阶段 3 时 B 元素可能还在阶段 1
    注意: 某个阶段的失败会将该元素后续阶段跳过，最终结果为 null
    返回: 所有最终结果的数组（失败的项为 null）
  - 设计原则：默认使用 pipeline()；仅当确实需要所有结果汇集后才能继续时才用 parallel()
  - phase(title) - 标记 workflow 阶段（标题用中文）
  - log(message) - 输出信息（用中文）
  - input(prompt) - 等待用户输入
    prompt: 提示文字
    返回: 用户输入的字符串
  - return <value> - workflow 的最终结果，顶层 return 即可
    值会被引擎返回，CLI 自动打印为 JSON
    建议返回包含关键输出的对象，如 { success: true, data: ... }

代码结构规范（必须遵守）：
  - 使用 async function main() {} 包含主流程
  - 每个 agent() 调用必须用有意义的函数名封装，不要直接调用 agent()
  - 文件末尾用 return await main() 返回结果
  - input() 只接受用户的自然语言输入，绝不能让用户输入 JSON 或代码
  - 如需结构化数据，用 agent() + schema 解析用户的自然语言描述
    错误示范：await input('请输入 JSON 格式的配置')
    正确示范：先 input('请描述需求'), 再用 agent(prompt, { schema: {...} }) 提取结构化数据
  - 需要用户确认时，先用 console.log 展示内容，再用 agent 生成提问
    参考：
      async function askUser(content, purpose) {
        const q = await agent(\`根据内容和场景生成一句中文提问：\${content} 场景：\${purpose}\`)
        return q
      }
      // 使用：console.log(content); const q = await askUser(content); const reply = await input(q)

常用模式示例（参考以下写法）：

  1) 基本结构：
     export const meta = { name: 'xxx', description: 'xxx', providers: ['claude-code', 'codex'] }
     async function doTask() { return await agent('指令') }
     async function main() {
       phase('阶段一')
       const result = await doTask()
       phase('阶段二')
       const input = await input('请输入: ')
       log('完成')
       return { result }
     }
     return await main()

  2) Pipeline 多阶段处理：
     const items = ['任务A', '任务B']
     const results = await pipeline(
       items,
       (item) => agent('处理 ' + item),
       (prev) => agent('验证结果: ' + prev)
     )

  3) Parallel 并发独立任务：
     const [结果1, 结果2] = await parallel([
       () => agent('任务1'),
       () => agent('任务2')
     ])

  4) Schema 结构化输出：
     const data = await agent('提取信息', {
       schema: { type: 'object', properties: { name: { type: 'string' } } }
     })

  5) Agent 生成确认提问（先 console.log 展示内容，再用 input 提问）：
     async function askConfirm(content, purpose) {
       const q = await agent('根据内容生成确认提问。内容：' + content + ' 场景：' + purpose)
       return q
     }
     // console.log(content); const q = await askConfirm(content, '确认方案'); const reply = await input(q)

关键 - 限制：
  - 所有面向用户的文本必须使用中文（phase 标题、log 信息、input 提示）
  - 禁止使用 Node.js 模块（fs、path、process、os 等）
  - 禁止使用 cwd、__dirname、__filename、require、import
  - 禁止使用非标准 JS 全局对象
  - 禁止文件系统操作，需通过 agent() 委托执行
  - 默认原则：除非用户明确指定路径，否则默认处理当前目录下的文件
  - 纯 JavaScript，无外部依赖
  - export const meta = { name, description, providers }
  - meta.description 使用中文
  - 文件名：${name}.js

将完整文件写入 .workflow-agent/workflow/${name}.js，然后输出完整代码`)
}

async function reviewCode(code) {
  return await agent(`你是代码审查代理，负责审查 workflow 脚本质量。

审查以下代码，检查：
1. 是否只使用了允许的 API（agent、phase、log、input、parallel、pipeline）
   - 特别注意：没有使用 cwd、fs、process 等禁止的变量/模块
2. 语法是否正确
3. 用户交互文本是否都是中文
4. 是否有合理的错误处理
5. 逻辑是否完整

代码：
${code}

如果代码无问题，回复第一行为：通过
如果有问题，列出具体问题及修改建议。`)
}

async function fixCode(code, review) {
  return await agent(`根据审查意见修改代码。

审查意见：
${review}

当前代码：
${code}

输出修改后的完整代码。`)
}

async function writeCodeFile(code, name) {
  await agent(`将以下完整代码写入 .workflow-agent/workflow/${name}.js，不要做任何修改：

${code}`)
}

async function askUser(content, purpose) {
  const question = await agent(`你是一个交互助手，根据以下内容和场景生成一句简洁的中文提问。

当前内容：
${content}

场景：${purpose}

要求：
- 只输出问题本身，不要输出内容
- 自然口语化的提问
- 让用户知道可以直接同意或提出修改意见`)
  return question
}

async function showContent(content) {
  console.log('\n' + content + '\n')
}

async function judgeApproval(content, userInput, context) {
  return await agent(`判断用户是否${context}。

当前内容：
${content}

用户反馈：${userInput}

如果用户表示同意或认可，isApproved 设为 true。
如果用户提出修改意见，isApproved 设为 false，并将修改意图整理到 feedback 中。`, { schema: judgeSchema })
}

// ---- Main flow ----

async function main() {
  phase('收集需求')
  const workflowName = await input('Workflow 名称: ')
  const description = await input('需求描述: ')

  phase('理解需求')
  let requirement = await generateStructuredReq(workflowName, description)
  await showContent(requirement)
  let question = await askUser(requirement, '向用户确认需求理解是否准确')
  let reply = await input(question)
  let result = await judgeApproval(requirement, reply, '确认以下需求理解')

  while (!result.isApproved) {
    requirement = await reviseRequirement(requirement, result.feedback, description)
    await showContent(requirement)
    question = await askUser(requirement, '根据修改后的需求再次向用户确认')
    reply = await input(question)
    result = await judgeApproval(requirement, reply, '确认以下需求理解')
  }

  phase('生成设计方案')
  let plan = await generateDesignPlan(workflowName, requirement)

  phase('审查设计方案')
  for (let i = 0; i < MAX_REVIEWS; i++) {
    const review = await reviewDesign(plan)
    if (review.trim().startsWith('通过')) {
      log('设计方案审查通过')
      break
    }
    log(`设计方案需修改（第 ${i + 1} 次）`)
    plan = await reviseDesign(plan, review)
  }

  phase('用户确认')
  await showContent(plan)
  question = await askUser(plan, '向用户确认是否批准设计方案')
  reply = await input(question)
  result = await judgeApproval(plan, reply, '批准以下设计方案')

  while (!result.isApproved) {
    plan = await reviseDesignByUser(plan, result.feedback)
    await showContent(plan)
    question = await askUser(plan, '向用户确认修改后的方案是否批准')
    reply = await input(question)
    result = await judgeApproval(plan, reply, '批准以下设计方案')
  }

  phase('生成代码')
  let code = await generateWorkflowCode(plan, workflowName)

  phase('审查代码')
  let codeModified = false
  for (let i = 0; i < MAX_REVIEWS; i++) {
    const review = await reviewCode(code)
    if (review.trim().startsWith('通过')) {
      log('代码审查通过')
      break
    }
    log(`代码需修改（第 ${i + 1} 次）`)
    codeModified = true
    code = await fixCode(code, review)
  }
  if (codeModified) await writeCodeFile(code, workflowName)

  phase('完成')
  log(`Workflow "${workflowName}" 已生成。`)
  return { name: workflowName, plan, code }
}

return await main()
