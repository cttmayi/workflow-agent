import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const DEFAULTS = {
  defaultProvider: 'claude-code',
  timeout: 300000,
  maxParallel: 4
}

function readConfig(path) {
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function loadConfig(cwd, { globalHome = homedir() } = {}) {
  const globalPath = join(globalHome, '.workflow-agent', 'config.json')
  const projectPath = join(cwd, '.workflow-agent', 'config.json')

  return {
    ...DEFAULTS,
    ...readConfig(globalPath),
    ...readConfig(projectPath)
  }
}
