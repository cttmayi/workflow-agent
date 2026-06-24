import { mkdirSync, createWriteStream, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createEngine, createEventBus } from '../../../core/src/index.js'
import { createProvider } from '../../../agent/src/index.js'
import { createWorkflowFinder } from '../workflow-finder.js'

export async function runWorkflow(name, options) {
  const projectConfig = join(process.cwd(), '.workflow-agent', 'config.yaml')
  if (!existsSync(projectConfig)) {
    console.error('  ✗ 未找到项目配置，请先执行 workflow-agent init')
    process.exit(1)
  }

  const finder = createWorkflowFinder()
  const found = finder.find(name)

  if (!found) {
    console.error(`Workflow "${name}" not found.`)
    console.error('Run "workflow-agent list" to see available workflows.')
    process.exit(1)
  }

  // Set up log file
  const logDir = join(process.cwd(), '.workflow-agent', 'log')
  mkdirSync(logDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const logPath = join(logDir, `${ts}.log`)
  const logStream = createWriteStream(logPath, { flags: 'a' })

  function writeLog(level, message) {
    const time = new Date().toLocaleTimeString()
    logStream.write(`[${time}][${level}] ${message}\n`)
  }

  console.log(`\n  ◆ ${name}`)

  const bus = createEventBus()

  bus.on('phase:change', ({ title }) => {
    writeLog('PHASE', title)
    console.log(`\n  ◆ ${title}`)
  })

  bus.on('agent:start', ({ provider, label, prompt }) => {
    writeLog('AGENT', `[${label || provider}] ${prompt.slice(0, 120)}...`)
  })

  bus.on('agent:complete', ({ provider, duration, exitCode }) => {
    writeLog('AGENT', `[${provider}] done (${duration}ms, exit ${exitCode})`)
  })

  bus.on('agent:log', ({ line }) => {
    logStream.write(line)
  })

  bus.on('workflow:start', ({ name }) => {
    writeLog('WORKFLOW', `start: ${name}`)
  })

  bus.on('workflow:complete', ({ name, duration }) => {
    writeLog('WORKFLOW', `complete: ${name} (${duration}ms)`)
  })

  bus.on('workflow:error', ({ name, error }) => {
    writeLog('WORKFLOW', `error: ${name} - ${error.message}`)
  })

  bus.on('log', ({ message }) => {
    writeLog('INFO', message)
  })

  // Forward events to dashboard server if --dashboard-port is set
  const dashboardPort = options.dashboardPort
  if (dashboardPort) {
    const dashboardUrl = `http://localhost:${dashboardPort}`
    const forward = (event, data) => {
      fetch(`${dashboardUrl}/api/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event, data }) }).catch(() => {})
    }
    bus.on('phase:change', data => forward('phase:change', data))
    bus.on('agent:start', data => forward('agent:start', data))
    bus.on('agent:complete', data => forward('agent:complete', data))
    bus.on('agent:log', data => forward('agent:log', data))
    bus.on('workflow:start', data => forward('workflow:start', data))
    bus.on('workflow:complete', data => forward('workflow:complete', data))
    bus.on('workflow:error', data => forward('workflow:error', data))
  }

  const engine = createEngine({ eventBus: bus })

  async function agentFn(prompt, opts = {}) {
    const providerName = opts.provider || options.provider || 'claude-code'
    const providerConfig = engine.config.providers?.[providerName] || {}
    const provider = createProvider(providerName, { eventBus: bus, ...providerConfig })

    const timeoutMs = parseInt(options.timeout, 10) || 300000
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const combinedSignal = opts.signal
      ? AbortSignal.any([opts.signal, timeoutSignal])
      : timeoutSignal

    bus.emit('agent:start', { provider: providerName, prompt, label: opts.label })

    const result = await provider.execute({
      prompt,
      schema: opts.schema,
      signal: combinedSignal
    })

    bus.emit('agent:complete', {
      provider: providerName,
      output: result.output,
      data: result.data,
      exitCode: result.exitCode,
      duration: result.duration
    })

    return result.data || result.output
  }

  const ac = new AbortController()
  process.on('SIGINT', () => {
    writeLog('SYSTEM', 'cancelled by user')
    ac.abort()
  })

  try {
    const result = await engine.run(found.path, agentFn, { signal: ac.signal })
    writeLog('SYSTEM', 'workflow finished')
    logStream.end()
    console.log('  ✓ Done.')
    if (result) {
      console.log('\nResult:', JSON.stringify(result, null, 2))
    }
    return result
  } catch (err) {
    writeLog('SYSTEM', `failed: ${err.message}`)
    logStream.end()
    console.log('\n  ✗ Failed.')
    console.error(err.message)
    process.exit(1)
  }
}
