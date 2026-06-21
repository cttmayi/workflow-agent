import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CodexProvider } from '../src/codex-provider.js'

describe('CodexProvider', () => {
  it('builds codex command with exec --full-auto in non-interactive mode', () => {
    const provider = new CodexProvider()
    const cmd = provider.buildCommand('test', { interactive: false })
    assert.equal(cmd.command, 'codex')
    assert.deepEqual(cmd.args, ['exec', 'test', '--full-auto'])
  })

  it('builds codex command without args in interactive mode', () => {
    const provider = new CodexProvider()
    const cmd = provider.buildCommand('', { interactive: true })
    assert.equal(cmd.command, 'codex')
    assert.deepEqual(cmd.args, [])
  })
})
