# Workflow Agent

A workflow generator and executor powered by multi-platform AI agents (Claude Code, Codex). Write `.js` workflow scripts using simple async APIs — `agent()`, `parallel()`, `pipeline()` — and run them against your preferred AI provider.

## Installation

```bash
git clone <repo>
cd workflow-agent
npm install
```

## Quick Start

```bash
# List available workflows
node packages/cli/src/index.js list

# Run the built-in self-test workflow
node packages/cli/src/index.js run test

# Generate a new workflow interactively
node packages/cli/src/index.js run generate
```

### Global Install (Optional)

```bash
npm link
workflow-agent list
workflow-agent run test
```

## Workflow Authoring

A workflow is a plain `.js` file with a `meta` export and top-level async code using the provided runtime APIs.

```javascript
// .workflow-agent/workflow/my-workflow.js
export const meta = {
  name: 'my-workflow',
  description: 'What this workflow does',
  providers: ['claude-code']
}

phase('Processing')
const result = await agent('Do something', { provider: 'claude-code' })

return { result }
```

### meta

Required export describing the workflow:

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Workflow name (used with `run <name>`) |
| `description` | `string` | Short description shown in listings |
| `providers` | `string[]` | Compatible providers |

### Runtime APIs

Available as globals in workflow code:

**`agent(prompt, opts)`** — Call an AI agent.

- `prompt` — Instruction string sent to the provider
- `opts.provider` — Provider name (`'claude-code'` or `'codex'`, defaults to config)
- `opts.interactive` — If `true`, runs the CLI interactively (passthrough stdin/stdout)
- `opts.schema` — JSON schema for structured output. Provider appends format requirements and validates the response
- `opts.label` — Label for logging/events
- Returns the agent's output text, or parsed JSON data when `schema` is provided

**`parallel(thunks)`** — Run multiple agent calls concurrently.

- `thunks` — Array of `() => agent(...)` functions
- Returns array of results in input order
- Respects `maxParallel` config (default: 4)
- Failed thunks produce `null` (no cascade)

```javascript
const [summary, analysis] = await parallel([
  () => agent('Summarize this document'),
  () => agent('Analyze the sentiment')
])
```

**`pipeline(items, ...stages)`** — Process items through sequential transform stages.

- `items` — Array of input items
- `stages` — Stage functions `(prevResult, originalItem, index) => Promise`
- Returns array of final results

```javascript
const processed = await pipeline(
  ['a', 'b', 'c'],
  (item) => agent(`Process ${item}`),
  (prev) => agent(`Refine: ${prev}`)
)
```

**`phase(title)`** — Emit a phase change event (shown in CLI output and dashboard).

**`log(message)`** — Emit a log message.

### Schema Validation

Pass a JSON schema to `agent()` for structured output. The provider appends format instructions to the prompt and automatically parses + validates the response.

```javascript
const user = await agent('Extract user info from the text', {
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' }
    },
    required: ['name']
  }
})
// user.name is a parsed string, user.age is a parsed number
```

If the agent wraps JSON in markdown code fences, the provider strips them automatically.

### Workflow Discovery

Workflows are resolved by name (priority order):

1. **Project** — `.workflow-agent/workflow/<name>.js`
2. **Global** — `~/.workflow-agent/workflow/<name>.js`
3. **Built-in** — `packages/cli/workflows/<name>.js`

## Configuration

Three-tier merge: defaults → global → project.

| Field | Default | Description |
|-------|---------|-------------|
| `defaultProvider` | `'claude-code'` | Default agent provider |
| `timeout` | `300000` | Per-agent timeout in ms |
| `maxParallel` | `4` | Max concurrent agent executions |

- **Global:** `~/.workflow-agent/config.json`
- **Project:** `<cwd>/.workflow-agent/config.json`

## CLI

```bash
workflow-agent list                        List all available workflows
workflow-agent run <name> [options]        Execute a workflow
workflow-agent dashboard [port]            Start the web dashboard (default: 3456)
workflow-agent init                        Initialize .workflow-agent directory

Options:
  --provider <name>    Agent provider (default: claude-code)
  --timeout <ms>       Per-agent timeout (default: 300000)
  --max-parallel <n>   Max parallel agents (default: 4)
```

## Dashboard

```bash
workflow-agent dashboard
# or with a custom port:
workflow-agent dashboard 8080
```

A real-time web dashboard with SSE-based event streaming showing workflow progress, agent calls, and results.

## Built-in Workflows

| Name | Description |
|------|-------------|
| `generate` | Interactive workflow generator — describes your workflow to an AI agent |
| `test` | Self-test — verifies all runtime APIs (agent, parallel, pipeline, phase, log, schema) |

## Project Structure

```
workflow-agent/
├── packages/
│   ├── core/          Engine, sandbox, scheduler, runtime API, event system
│   ├── agent/         Provider adapters (Claude Code, Codex)
│   ├── cli/           CLI entry point, workflow finder, built-in workflows
│   └── dashboard/     Web dashboard (HTTP + SSE)
└── .workflow-agent/   Project-level workflows and config (user-created)
```

## Development

```bash
# Run tests
node --test packages/core/test/*.test.js packages/cli/test/*.test.js
```
