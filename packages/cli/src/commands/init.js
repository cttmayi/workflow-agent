import { mkdirSync, existsSync, copyFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'

const DEFAULT_CONFIG = {
  defaultProvider: 'claude-code',
  timeout: 300000,
  maxParallel: 4
}

export async function initProject() {
  const cwd = process.cwd()
  const workflowDir = join(cwd, '.workflow-agent', 'workflow')
  const configPath = join(cwd, '.workflow-agent', 'config.json')
  const globalConfigPath = join(os.homedir(), '.workflow-agent', 'config.json')

  mkdirSync(workflowDir, { recursive: true })
  console.log('✓ Created .workflow-agent/workflow/')

  if (existsSync(globalConfigPath)) {
    copyFileSync(globalConfigPath, configPath)
    console.log('✓ Copied global config to .workflow-agent/config.json')
  } else {
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2))
    console.log('✓ Created default .workflow-agent/config.json')
  }

  console.log('\nRun "workflow-agent generate" to create your first workflow.')
}
