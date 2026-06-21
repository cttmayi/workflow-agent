import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ClaudeCodeProvider } from '../src/claude-code-provider.js'

describe('ClaudeCodeProvider', () => {
  it('builds claude command with correct args in non-interactive mode', () => {
    const provider = new ClaudeCodeProvider()
    const cmd = provider.buildCommand('test prompt', { interactive: false })
    assert.equal(cmd.command, 'claude')
    assert.deepEqual(cmd.args, ['--dangerously-skip-permissions', '-p', 'test prompt'])
  })

  it('builds claude command without args in interactive mode', () => {
    const provider = new ClaudeCodeProvider()
    const cmd = provider.buildCommand('', { interactive: true })
    assert.equal(cmd.command, 'claude')
    assert.deepEqual(cmd.args, [])
  })

  it('rejects when claude is not installed', async () => {
    const provider = new ClaudeCodeProvider({ commandPath: '/usr/bin/nonexistent-claude' })
    await assert.rejects(
      provider.execute({ prompt: 'test', interactive: false }),
      /ENOENT|not found/
    )
  })
})
