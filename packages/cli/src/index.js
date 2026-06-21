#!/usr/bin/env node
const [,, cmd, ...args] = process.argv

async function main() {
  switch (cmd) {
    case 'list': {
      const { listWorkflows } = await import('./commands/list.js')
      await listWorkflows()
      break
    }
    case 'run': {
      const name = args[0]
      if (!name) {
        console.error('Usage: workflow-agent run <name> [--provider <name>] [--timeout <ms>] [--max-parallel <n>]')
        process.exit(1)
      }
      const opts = { provider: 'claude-code', timeout: '300000', maxParallel: '4' }
      for (let i = 1; i < args.length; i++) {
        if (args[i] === '--provider') opts.provider = args[++i]
        else if (args[i] === '--timeout') opts.timeout = args[++i]
        else if (args[i] === '--max-parallel') opts.maxParallel = args[++i]
      }
      const { runWorkflow } = await import('./commands/run.js')
      await runWorkflow(name, opts)
      break
    }
    case 'dashboard': {
      const port = args[0] || '3456'
      const { startDashboard } = await import('./commands/dashboard.js')
      await startDashboard(port)
      break
    }
    case 'init': {
      const { initProject } = await import('./commands/init.js')
      await initProject()
      break
    }
    case '--help':
    case '-h':
    case undefined:
      console.log(`workflow-agent v0.1.0 - Workflow generator and executor

Usage:
  workflow-agent list                        List all available workflows
  workflow-agent run <name> [options]        Execute a workflow
  workflow-agent dashboard [port]            Start the web dashboard (default: 3456)
  workflow-agent init                        Initialize .workflow-agent directory

Options:
  --provider <name>    Default agent provider (default: claude-code)
  --timeout <ms>       Agent timeout in milliseconds (default: 300000)
  --max-parallel <n>   Max parallel agents (default: 4)`)
      break
    default:
      console.error(`Unknown command: ${cmd}`)
      console.error('Run "workflow-agent --help" for usage.')
      process.exit(1)
  }
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
