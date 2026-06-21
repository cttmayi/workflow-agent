import { mkdirSync, existsSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function parseYamlConfig(yaml) {
  const config = {}
  for (const line of yaml.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const sep = trimmed.indexOf(':')
    if (sep === -1) continue
    const key = trimmed.slice(0, sep).trim()
    let value = trimmed.slice(sep + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    else if (!isNaN(Number(value))) value = Number(value)
    config[key] = value
  }
  return config
}

export async function initProject() {
  const cwd = process.cwd()
  const workflowDir = join(cwd, '.workflow-agent', 'workflow')
  const configPath = join(cwd, '.workflow-agent', 'config.json')
  const globalConfigPath = join(os.homedir(), '.workflow-agent', 'config.json')
  const templatePath = join(__dirname, '..', '..', '..', 'core', 'src', 'config-defaults.yaml')

  mkdirSync(workflowDir, { recursive: true })
  console.log('✓ Created .workflow-agent/workflow/')

  if (existsSync(globalConfigPath)) {
    copyFileSync(globalConfigPath, configPath)
    console.log('✓ Copied global config to .workflow-agent/config.json')
  } else {
    const yaml = readFileSync(templatePath, 'utf-8')
    const defaults = parseYamlConfig(yaml)
    writeFileSync(configPath, JSON.stringify(defaults, null, 2))
    console.log('✓ Created default .workflow-agent/config.json')
  }

  console.log('\nRun "workflow-agent run generate" to create your first workflow.')
}
