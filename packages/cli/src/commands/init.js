import { mkdirSync, existsSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export async function initProject() {
  const cwd = process.cwd()
  const workflowDir = join(cwd, '.workflow-agent', 'workflow')
  const configPath = join(cwd, '.workflow-agent', 'config.yaml')
  const globalConfigPath = join(os.homedir(), '.workflow-agent', 'config.yaml')
  const templatePath = join(__dirname, '..', '..', '..', 'core', 'src', 'config-defaults.yaml')

  mkdirSync(workflowDir, { recursive: true })
  console.log('✓ Created .workflow-agent/workflow/')

  if (existsSync(globalConfigPath)) {
    copyFileSync(globalConfigPath, configPath)
    console.log('✓ Copied global config to .workflow-agent/config.yaml')
  } else {
    copyFileSync(templatePath, configPath)
    console.log('✓ Created default .workflow-agent/config.yaml')
  }

  console.log('\nRun "workflow-agent run generate" to create your first workflow.')
}
