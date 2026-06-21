import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as core from '../src/index.js'

describe('core', () => {
  it('exports all expected modules', () => {
    assert.ok(core.loadConfig)
    assert.ok(core.createEventBus)
    assert.ok(core.createScheduler)
    assert.ok(core.createRuntimeAPI)
    assert.ok(core.loadWorkflow)
  })
})
