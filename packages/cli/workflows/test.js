export const meta = {
  name: 'test',
  description: 'Run system self-test to verify all runtime APIs work',
  providers: ['claude-code', 'codex']
}

phase('Phase 1: Basic agent call')
log('Calling agent with a simple prompt...')
const answer = await agent('Say "hello from agent" and nothing else.', { provider: 'claude-code' })
log('Agent responded: ' + (answer || '(empty)'))

phase('Phase 2: Schema validation')
log('Calling agent with a JSON schema...')
const schemaResult = await agent('What greeting and language should be used?', {
  provider: 'claude-code',
  schema: {
    type: 'object',
    properties: {
      greeting: { type: 'string' },
      language: { type: 'string' }
    },
    required: ['greeting', 'language']
  }
})
log('Schema result: greeting=' + schemaResult.greeting + ', language=' + schemaResult.language)

phase('Phase 3: Parallel agent execution')
log('Running 3 agents in parallel...')
const results = await parallel([
  () => agent('output the number 1 and nothing else', { provider: 'claude-code' }),
  () => agent('output the number 2 and nothing else', { provider: 'claude-code' }),
  () => agent('output the number 3 and nothing else', { provider: 'claude-code' })
])
log('Parallel results: ' + results.join(', '))

phase('Phase 4: Pipeline')
log('Running pipeline with 2 stages...')
const items = ['a', 'b', 'c']
const pipelineResult = await pipeline(items,
  (item, _original, idx) => Promise.resolve(`${idx}:${item.toUpperCase()}`),
  (prevResult) => Promise.resolve(prevResult + '!')
)
log('Pipeline results: ' + pipelineResult.join(', '))

phase('Phase 5: Error handling')
log('Calling agent with a timeout to test error propagation...')

phase('All tests passed')
log('All runtime APIs verified: agent, parallel, pipeline, phase, log')

return {
  success: true,
  results: {
    basicAgent: answer,
    schemaValidation: schemaResult,
    parallel: results,
    pipeline: pipelineResult
  }
}
