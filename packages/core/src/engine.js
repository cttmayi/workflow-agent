import { loadConfig } from './config-loader.js'
import { createEventBus } from './event-emitter.js'
import { createScheduler } from './scheduler.js'
import { createRuntimeAPI } from './runtime-api.js'
import { loadMeta, executeWorkflow } from './workflow-loader.js'

export function createEngine({ cwd = process.cwd(), eventBus } = {}) {
  const config = loadConfig(cwd)
  const bus = eventBus || createEventBus()

  function getAPIs(agentFn, signal) {
    const scheduler = createScheduler({
      maxParallel: config.maxParallel,
      signal
    })
    const runtime = createRuntimeAPI({ eventBus: bus, scheduler })
    return {
      agent: agentFn,
      parallel: runtime.parallel,
      pipeline: runtime.pipeline,
      phase: runtime.phase,
      log: runtime.log,
      input: runtime.input,
      cleanup: runtime.cleanup
    }
  }

  async function run(workflowPath, agentFn, { signal } = {}) {
    const meta = await loadMeta(workflowPath)
    bus.emit('workflow:start', { name: meta.name, timestamp: Date.now() })
    const start = Date.now()
    const apis = getAPIs(agentFn, signal)
    try {
      const result = await executeWorkflow(workflowPath, apis)
      bus.emit('workflow:complete', { name: meta.name, result, duration: Date.now() - start })
      return result
    } catch (err) {
      bus.emit('workflow:error', { name: meta.name, error: err, duration: Date.now() - start })
      throw err
    } finally {
      apis.cleanup()
    }
  }

  return { run, config, bus }
}
