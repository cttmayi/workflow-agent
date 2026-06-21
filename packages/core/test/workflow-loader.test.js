import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadMeta, executeWorkflow } from '../src/workflow-loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtures = join(__dirname, 'fixtures')

describe('workflow-loader', () => {
  it('loads meta from workflow file', async () => {
    const meta = await loadMeta(join(fixtures, 'simple-workflow.js'))
    assert.equal(meta.name, 'test-workflow')
    assert.equal(meta.description, 'A test workflow')
  })

  it('injects APIs and executes workflow with return value', async () => {
    const agent = mock.fn(() => Promise.resolve('done'))
    const result = await executeWorkflow(
      join(fixtures, 'simple-workflow.js'),
      { agent, parallel: () => {}, pipeline: () => {}, phase: () => {}, log: () => {} }
    )
    assert.equal(result.result, 'done')
    assert.equal(agent.mock.calls.length, 1)
  })

  it('propagates host agent rejection across vm boundary', async () => {
    const agent = () => Promise.reject(new Error('agent failed'))
    await assert.rejects(
      executeWorkflow(join(fixtures, 'simple-workflow.js'), {
        agent,
        parallel: () => {}, pipeline: () => {}, phase: () => {}, log: () => {}
      }),
      /agent failed/
    )
  })

  it('does not expose fs in sandbox', async () => {
    await assert.rejects(
      executeWorkflow(join(fixtures, 'access-fs.js'), { agent: () => {} }),
      /fs is not defined/
    )
  })
})
