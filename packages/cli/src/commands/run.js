import { createEngine, createEventBus } from '../../../core/src/index.js'
import { createProvider } from '../../../agent/src/index.js'
import { createWorkflowFinder } from '../workflow-finder.js'

export async function runWorkflow(name, options) {
  const finder = createWorkflowFinder()
  const found = finder.find(name)

  if (!found) {
    console.error(`Workflow "${name}" not found.`)
    console.error('Run "workflow-agent list" to see available workflows.')
    process.exit(1)
  }

  console.log(`Running "${name}" (from ${found.source})...\n`)

  const bus = createEventBus()

  bus.on('phase:change', ({ title }) => {
    console.log(`\n  ◆ ${title}`)
  })

  bus.on('agent:start', ({ provider, label }) => {
    console.log(`    → [${label || provider}] starting...`)
  })

  bus.on('agent:log', ({ line }) => {
    process.stdout.write(line)
  })

  const engine = createEngine({ eventBus: bus })

  async function agentFn(prompt, opts = {}) {
    const providerName = opts.provider || options.provider || 'claude-code'
    const provider = createProvider(providerName, { eventBus: bus })

    // Per-agent timeout from config/CLI option
    const timeoutMs = parseInt(options.timeout, 10) || 300000
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const combinedSignal = opts.signal
      ? AbortSignal.any([opts.signal, timeoutSignal])
      : timeoutSignal

    bus.emit('agent:start', { provider: providerName, prompt, label: opts.label })

    const result = await provider.execute({
      prompt,
      interactive: opts.interactive || false,
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
    console.log('\nCancelling...')
    ac.abort()
  })

  try {
    const result = await engine.run(found.path, agentFn, { signal: ac.signal })
    console.log('\n  ✓ Done.')
    if (result) {
      console.log('\nResult:', JSON.stringify(result, null, 2))
    }
    return result
  } catch (err) {
    console.error(`\n  ✗ Failed: ${err.message}`)
    process.exit(1)
  }
}
