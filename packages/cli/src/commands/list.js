import { createWorkflowFinder } from '../workflow-finder.js'
import { loadMeta } from '../../../core/src/index.js'

export async function listWorkflows() {
  const finder = createWorkflowFinder()
  const workflows = finder.listAll()

  if (workflows.length === 0) {
    console.log('No workflows found.')
    return
  }

  const enriched = []
  for (const w of workflows) {
    try {
      const meta = await loadMeta(w.path)
      enriched.push({ ...w, displayName: meta.name || w.name, description: meta.description || '' })
    } catch {
      enriched.push({ ...w, displayName: w.name, description: '(failed to load)' })
    }
  }

  const seen = new Set()
  const deduped = enriched.filter(w => {
    if (seen.has(w.name)) return false
    seen.add(w.name)
    return true
  })

  console.log('\nAvailable Workflows:')
  console.log('─'.repeat(50))
  for (const w of deduped) {
    const sourceTag = w.source === 'project' ? '📁' : w.source === 'global' ? '🌐' : '⚙️'
    console.log(`  ${sourceTag} ${w.displayName.padEnd(20)} ${w.description}`)
  }
  console.log()
}
