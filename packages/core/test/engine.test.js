import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createEngine } from '../src/engine.js'
import { createEventBus } from '../src/event-emitter.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtures = join(__dirname, 'fixtures')

describe('engine', () => {
  it('runs a workflow end-to-end with injected agent', async () => {
    const bus = createEventBus()
    const events = []
    bus.on('workflow:start', d => events.push(d))
    bus.on('workflow:complete', d => events.push(d))

    const engine = createEngine({ eventBus: bus })
    const result = await engine.run(
      join(fixtures, 'simple-workflow.js'),
      (prompt, opts) => Promise.resolve(`executed: ${prompt}`)
    )

    assert.equal(result.result, 'executed: do something')
    assert.equal(events.length, 2)
    assert.equal(events[0].name, 'test-workflow')
    assert.equal(events[1].name, 'test-workflow')
  })
})
