export const meta = {
  name: 'generate',
  description: 'Generate a new workflow using AI',
  providers: ['claude-code', 'codex']
}

phase('Interactive Generation')
const result = await agent(`You are the Workflow Agent generator assistant.

Your task:
1. Talk to the user to understand what workflow they need
2. Generate a workflow script that follows these conventions:
   - export const meta = { name, description, providers }
   - Use agent(), parallel(), pipeline(), phase(), log() APIs
   - Pure JavaScript, no external dependencies or Node.js APIs
   - File name should match meta.name
3. Write the generated file to .workflow-agent/workflow/<name>.js
4. Ask the user if they want to run it right away

Start by greeting the user and asking what kind of workflow they want to build.`, {
  interactive: true
})

phase('Done')
log('Workflow generation complete.')
return { result }
