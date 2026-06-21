import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createScheduler } from '../src/scheduler.js'

describe('scheduler', () => {
  it('runs all thunks and returns results in order', async () => {
    const s = createScheduler({ maxParallel: 2 })
    const results = await s.runAll([
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3)
    ])
    assert.deepEqual(results, [1, 2, 3])
  })

  it('limits concurrency to maxParallel', async () => {
    let concurrent = 0
    let peak = 0
    const s = createScheduler({ maxParallel: 2 })
    await s.runAll([
      () => new Promise(r => setTimeout(() => { concurrent++; peak = Math.max(peak, concurrent); setTimeout(() => { concurrent--; r(1) }, 50) })),
      () => new Promise(r => setTimeout(() => { concurrent++; peak = Math.max(peak, concurrent); setTimeout(() => { concurrent--; r(2) }, 50) })),
      () => new Promise(r => setTimeout(() => { concurrent++; peak = Math.max(peak, concurrent); setTimeout(() => { concurrent--; r(3) }, 50) }))
    ])
    assert.equal(peak, 2)
  })

  it('returns null for rejected thunks without rejecting itself', async () => {
    const s = createScheduler({ maxParallel: 2 })
    const results = await s.runAll([
      () => Promise.resolve('ok'),
      () => Promise.reject(new Error('fail')),
      () => Promise.resolve('ok2')
    ])
    assert.equal(results[0], 'ok')
    assert.equal(results[1], null)
    assert.equal(results[2], 'ok2')
  })

  it('supports abort signal', async () => {
    const ac = new AbortController()
    const s = createScheduler({ maxParallel: 2, signal: ac.signal })
    const p = s.runAll([
      () => new Promise(r => setTimeout(() => r(1), 1000)),
      () => new Promise(r => setTimeout(() => r(2), 1000))
    ])
    ac.abort()
    await assert.rejects(p, /aborted/)
  })
})
