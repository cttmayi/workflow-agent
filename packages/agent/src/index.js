import { ClaudeCodeProvider } from './claude-code-provider.js'
import { CodexProvider } from './codex-provider.js'

export { ClaudeCodeProvider, CodexProvider }

export function createProvider(name, opts = {}) {
  switch (name) {
    case 'claude-code': return new ClaudeCodeProvider(opts)
    case 'codex': return new CodexProvider(opts)
    default: throw new Error(`Unknown provider: ${name}`)
  }
}
