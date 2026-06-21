export const meta = {
  name: 'test-workflow',
  description: 'A test workflow',
  providers: ['claude-code']
}

const result = await agent('do something', { provider: 'claude-code' })
return { result }
