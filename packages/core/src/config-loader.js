import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { load as parseYaml } from 'js-yaml'

const DEFAULTS = {
  defaultProvider: 'claude-code',
  timeout: 300000,
  maxParallel: 4,
  providers: {
    'claude-code': {
      commandPath: 'claude',
      args: ['--dangerously-skip-permissions', '--bare', '--setting-sources', 'user', '-p', '{prompt}']
    },
    codex: {
      commandPath: 'codex',
      args: ['exec', '{prompt}', '--full-auto']
    }
  }
}

function readConfig(path) {
  try {
    const raw = readFileSync(path, 'utf-8')
    return parseYaml(raw) || {}
  } catch {
    return {}
  }
}

export function loadConfig(cwd, { globalHome = homedir() } = {}) {
  const globalPath = join(globalHome, '.workflow-agent', 'config.yaml')
  const projectPath = join(cwd, '.workflow-agent', 'config.yaml')

  return {
    ...DEFAULTS,
    ...readConfig(globalPath),
    ...readConfig(projectPath)
  }
}
