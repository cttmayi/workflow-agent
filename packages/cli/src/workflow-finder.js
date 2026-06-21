import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function createWorkflowFinder({ cwd, globalHome, builtInDir } = {}) {
  const projectDir = join(cwd || process.cwd(), '.workflow-agent', 'workflow')
  const globalDir = join(globalHome || os.homedir(), '.workflow-agent', 'workflow')
  const builtIn = builtInDir || join(__dirname, '..', 'workflows')

  function find(name) {
    const target = `${name}.js`
    if (existsSync(join(projectDir, target))) {
      return { name, path: join(projectDir, target), source: 'project' }
    }
    if (existsSync(join(globalDir, target))) {
      return { name, path: join(globalDir, target), source: 'global' }
    }
    if (existsSync(join(builtIn, target))) {
      return { name, path: join(builtIn, target), source: 'built-in' }
    }
    return null
  }

  function listSources(dir, source) {
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter(f => f.endsWith('.js'))
      .map(f => ({ name: f.replace(/\.js$/, ''), path: join(dir, f), source }))
  }

  function listAll() {
    return [
      ...listSources(projectDir, 'project'),
      ...listSources(globalDir, 'global'),
      ...listSources(builtIn, 'built-in')
    ]
  }

  return { find, listAll }
}
