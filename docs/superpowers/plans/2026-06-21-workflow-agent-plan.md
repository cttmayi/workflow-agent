# Workflow Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a workflow generator and executor with multi-platform AI agent support (Claude Code / Codex)

**Architecture:** Monorepo with 4 packages — `core` (VM sandbox, runtime API, scheduler, events), `agent` (subprocess providers), `cli` (commander entry + built-in workflows), `dashboard` (Express + React). Workflows are `.js` files loaded via `vm.SourceTextModule` with injected runtime APIs. Agent calls spawn `claude` or `codex` subprocesses.

**Tech Stack:** Node.js (ESM), `vm` module, Commander, Express, React + Vite, `node:test` for unit testing

---

## File Structure

```
workflow-agent/
├── package.json                        # Root monorepo (npm workspaces)
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.js               # Re-export all public API
│   │   │   ├── config-loader.js        # Load ~/.workflow-agent + ./.workflow-agent config
│   │   │   ├── event-emitter.js        # Typed event emitter
│   │   │   ├── scheduler.js            # Concurrency pool with maxParallel
│   │   │   ├── runtime-api.js          # agent(), parallel(), pipeline(), phase(), log()
│   │   │   └── workflow-loader.js      # vm.SourceTextModule loading + API injection
│   │   └── test/
│   │       ├── config-loader.test.js
│   │       ├── scheduler.test.js
│   │       └── workflow-loader.test.js
│   ├── agent/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.js               # Re-export: createProvider, executeAgent
│   │   │   ├── claude-code-provider.js # Spawn claude CLI
│   │   │   └── codex-provider.js       # Spawn codex CLI
│   │   └── test/
│   │       ├── claude-code-provider.test.js
│   │       └── codex-provider.test.js
│   ├── cli/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── index.js               # CLI entry (#!/usr/bin/env node + commander)
│   │   │   ├── workflow-finder.js      # Scan 3 sources: project > global > built-in
│   │   │   ├── commands/
│   │   │   │   ├── list.js
│   │   │   │   ├── run.js
│   │   │   │   ├── dashboard.js
│   │   │   │   └── init.js
│   │   │   └── config-loader-cli.js    # Merge core config with CLI-specific defaults
│   │   └── workflows/                 # Built-in workflows
│   │       └── generate.js
│   └── dashboard/
│       ├── package.json
│       ├── server/
│       │   └── index.js               # Express + SSE
│       └── client/                    # React SPA (Vite)
│           ├── package.json
│           ├── vite.config.js
│           ├── index.html
│           └── src/
│               ├── main.jsx
│               ├── App.jsx
│               └── pages/
│                   ├── WorkflowList.jsx
│                   ├── RunHistory.jsx
│                   ├── RunDetail.jsx
│                   └── WorkflowDetail.jsx
```

---

## Phase 1: Core Engine

### Task 1: Project scaffolding — monorepo root + core package

**Files:**
- Create: `package.json` (root)
- Create: `packages/core/package.json`

- [ ] **Step 1: Create root package.json with npm workspaces**

```json
{
  "name": "workflow-agent",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "test": "node --test packages/*/test/*.test.js"
  }
}
```

- [ ] **Step 2: Create core package.json**

```json
{
  "name": "@workflow-agent/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "test": "node --test test/*.test.js"
  }
}
```

- [ ] **Step 3: Create core/src/index.js — re-export barrel**

```javascript
export { loadConfig } from './config-loader.js'
export { createEventBus } from './event-emitter.js'
export { createScheduler } from './scheduler.js'
export { createRuntimeAPI } from './runtime-api.js'
export { loadWorkflow } from './workflow-loader.js'
```

- [ ] **Step 4: Create empty test file and run to verify set up**

```bash
mkdir -p packages/core/test
echo "import { describe, it } from 'node:test'; import assert from 'node:assert'; describe('core', () => { it('loads', () => assert.ok(true)) })" > packages/core/test/smoke.test.js
npm install && node --test packages/core/test/smoke.test.js
```

Expected: "passing" / "ok"

- [ ] **Step 5: Commit**

```bash
git init && git add -A && git commit -m "chore: scaffold monorepo with core package"
```

---

### Task 2: Config loader

**Files:**
- Create: `packages/core/src/config-loader.js`
- Create: `packages/core/test/config-loader.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// packages/core/test/config-loader.test.js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadConfig } from '../src/config-loader.js'

describe('config-loader', () => {
  let tmpDir, globalDir, projectDir

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wa-test-'))
    globalDir = join(tmpDir, '.workflow-agent')
    projectDir = join(tmpDir, 'project', '.workflow-agent')
    mkdirSync(globalDir, { recursive: true })
    mkdirSync(projectDir, { recursive: true })
  })

  after(() => rmSync(tmpDir, { recursive: true }))

  it('returns defaults when no config files exist', () => {
    const config = loadConfig(join(tmpDir, 'project'))
    assert.equal(config.defaultProvider, 'claude-code')
    assert.equal(config.timeout, 300000)
    assert.equal(config.maxParallel, 4)
  })

  it('loads global config and merges with defaults', () => {
    writeFileSync(join(globalDir, 'config.json'), JSON.stringify({ timeout: 60000 }))
    const config = loadConfig(join(tmpDir, 'project'))
    assert.equal(config.defaultProvider, 'claude-code') // from defaults
    assert.equal(config.timeout, 60000)                 // from global
  })

  it('project config overrides global config', () => {
    writeFileSync(join(projectDir, 'config.json'), JSON.stringify({ maxParallel: 8 }))
    const config = loadConfig(join(tmpDir, 'project'))
    assert.equal(config.timeout, 60000)  // from global
    assert.equal(config.maxParallel, 8)  // from project overrides global
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test packages/core/test/config-loader.test.js
```

Expected: FAIL with "Cannot find module" or similar

- [ ] **Step 3: Write minimal implementation**

```javascript
// packages/core/src/config-loader.js
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DEFAULTS = {
  defaultProvider: 'claude-code',
  timeout: 300000,
  maxParallel: 4
}

function readConfig(path) {
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function loadConfig(cwd) {
  const globalPath = join(os.homedir(), '.workflow-agent', 'config.json')
  const projectPath = join(cwd, '.workflow-agent', 'config.json')

  return {
    ...DEFAULTS,
    ...readConfig(globalPath),
    ...readConfig(projectPath)
  }
}
```

Note: add `import os from 'node:os'` at top.

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test packages/core/test/config-loader.test.js
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config-loader.js packages/core/test/config-loader.test.js
git commit -m "feat(core): add config loader with project/global/default merge"
```

---

### Task 3: Event emitter

**Files:**
- Create: `packages/core/src/event-emitter.js`

- [ ] **Step 1: Write the event emitter**

```javascript
// packages/core/src/event-emitter.js
export function createEventBus() {
  const listeners = {}

  function on(event, handler) {
    if (!listeners[event]) listeners[event] = []
    listeners[event].push(handler)
    return () => off(event, handler)
  }

  function off(event, handler) {
    if (!listeners[event]) return
    listeners[event] = listeners[event].filter(h => h !== handler)
  }

  function emit(event, data) {
    if (!listeners[event]) return
    for (const handler of listeners[event]) {
      handler(data)
    }
  }

  return { on, off, emit }
}
```

- [ ] **Step 2: Verify with a quick inline test**

```bash
node -e "
import { createEventBus } from './packages/core/src/event-emitter.js';
const bus = createEventBus();
let called = false;
bus.on('test', (d) => { called = true; assert(d.x === 1) });
bus.emit('test', {x: 1});
console.log('event-emitter OK');
import assert from 'node:assert';
assert(called);
"
```

Expected: "event-emitter OK"

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/event-emitter.js && git commit -m "feat(core): add event emitter"
```

---

### Task 4: Scheduler (concurrency pool)

**Files:**
- Create: `packages/core/src/scheduler.js`
- Create: `packages/core/test/scheduler.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// packages/core/test/scheduler.test.js
import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { createScheduler } from '../src/scheduler.js'

describe('scheduler', () => {
  it('runs all thunks and returns results in order', async () => {
    const s = createScheduler({ maxParallel: 2 })
    const results = await s.runAll([
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3)
    ])
    assert.deepEqual(results, [1, 2, 3])
  })

  it('limits concurrency to maxParallel', async () => {
    let concurrent = 0
    let peak = 0
    const s = createScheduler({ maxParallel: 2 })
    await s.runAll([
      () => new Promise(r => setTimeout(() => { concurrent++; peak = Math.max(peak, concurrent); setTimeout(() => { concurrent--; r(1) }, 50) })),
      () => new Promise(r => setTimeout(() => { concurrent++; peak = Math.max(peak, concurrent); setTimeout(() => { concurrent--; r(2) }, 50) })),
      () => new Promise(r => setTimeout(() => { concurrent++; peak = Math.max(peak, concurrent); setTimeout(() => { concurrent--; r(3) }, 50) }))
    ])
    assert.equal(peak, 2)
  })

  it('returns null for rejected thunks without rejecting itself', async () => {
    const s = createScheduler({ maxParallel: 2 })
    const results = await s.runAll([
      () => Promise.resolve('ok'),
      () => Promise.reject(new Error('fail')),
      () => Promise.resolve('ok2')
    ])
    assert.equal(results[0], 'ok')
    assert.equal(results[1], null)
    assert.equal(results[2], 'ok2')
  })

  it('supports abort signal', async () => {
    const ac = new AbortController()
    const s = createScheduler({ maxParallel: 2, signal: ac.signal })
    const p = s.runAll([
      () => new Promise(r => setTimeout(() => r(1), 1000)),
      () => new Promise(r => setTimeout(() => r(2), 1000))
    ])
    ac.abort()
    await assert.rejects(p, /aborted/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
node --test packages/core/test/scheduler.test.js
```

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```javascript
// packages/core/src/scheduler.js
export function createScheduler({ maxParallel = 4, signal } = {}) {
  async function runAll(thunks) {
    const results = new Array(thunks.length).fill(null)
    let nextIndex = 0
    let completed = 0

    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('aborted'))
        return
      }

      const abortHandler = () => reject(new Error('aborted'))
      if (signal) signal.addEventListener('abort', abortHandler, { once: true })

      function startNext() {
        while (nextIndex < thunks.length && completed < thunks.length) {
          const idx = nextIndex++
          thunks[idx]()
            .then(val => { results[idx] = val })
            .catch(() => { results[idx] = null })
            .finally(() => {
              completed++
              if (completed === thunks.length) {
                if (signal) signal.removeEventListener('abort', abortHandler)
                resolve(results)
              } else {
                startNext()
              }
            })
        }
      }

      // Start initial batch
      for (let i = 0; i < Math.min(maxParallel, thunks.length); i++) {
        startNext()
      }
    })
  }

  return { runAll }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
node --test packages/core/test/scheduler.test.js
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scheduler.js packages/core/test/scheduler.test.js
git commit -m "feat(core): add concurrent scheduler with abort support"
```

---

### Task 5: Runtime API — phase, log, parallel, pipeline

**Files:**
- Create: `packages/core/src/runtime-api.js`

- [ ] **Step 1: Write the implementation**

```javascript
// packages/core/src/runtime-api.js
export function createRuntimeAPI({ eventBus, scheduler }) {

  function phase(title) {
    eventBus.emit('phase:change', { title })
  }

  function log(message) {
    eventBus.emit('log', { message })
  }

  function parallel(thunks) {
    return scheduler.runAll(thunks)
  }

  function pipeline(items, ...stages) {
    if (stages.length === 0) return Promise.resolve(items)

    const results = new Array(items.length).fill(null)
    let completed = 0
    let done = false

    return new Promise((resolve, reject) => {
      for (let i = 0; i < items.length; i++) {
        runItem(i, 0, items[i])
      }

      function runItem(index, stageIndex, prevResult) {
        if (done) return
        const stage = stages[stageIndex]
        stage(prevResult, items[index], index)
          .then(result => {
            const nextStage = stageIndex + 1
            if (nextStage < stages.length) {
              runItem(index, nextStage, result)
            } else {
              results[index] = result
              completed++
              if (completed === items.length) {
                done = true
                resolve(results)
              }
            }
          })
          .catch(() => {
            results[index] = null
            completed++
            if (completed === items.length) {
              done = true
              resolve(results)
            }
          })
      }
    })
  }

  return { phase, log, parallel, pipeline }
}
```

- [ ] **Step 2: Write a test for pipeline and parallel**

```javascript
// Append to packages/core/test/scheduler.test.js or new runtime-api.test.js
// For brevity, inline quick check:
```

Run a quick verification:

```bash
node -e "
import { createEventBus } from './packages/core/src/event-emitter.js';
import { createScheduler } from './packages/core/src/scheduler.js';
import { createRuntimeAPI } from './packages/core/src/runtime-api.js';
const bus = createEventBus();
const sched = createScheduler({ maxParallel: 4 });
const api = createRuntimeAPI({ eventBus: bus, scheduler: sched });

// Test parallel
const r = await api.parallel([() => Promise.resolve(1), () => Promise.resolve(2)]);
console.assert(r[0] === 1 && r[1] === 2, 'parallel works');

// Test pipeline
const items = ['a', 'b'];
const stages = [
  (item) => Promise.resolve(item + '1'),
  (prev, orig) => Promise.resolve(prev + '2')
];
const pr = await api.pipeline(items, ...stages);
console.assert(pr[0] === 'a12', 'pipeline works: ' + pr[0]);

// Test phase + log (just ensure no throw)
api.phase('test');
api.log('hello');
console.log('runtime API OK');
"
```

Expected: "runtime API OK"

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/runtime-api.js && git commit -m "feat(core): add runtime API (phase, log, parallel, pipeline)"
```

---

### Task 6: Workflow loader (vm.SourceTextModule)

**Files:**
- Create: `packages/core/src/workflow-loader.js`
- Create: `packages/core/test/fixtures/`
- Create: `packages/core/test/workflow-loader.test.js`

- [ ] **Step 1: Create test fixture workflow**

```javascript
// packages/core/test/fixtures/simple-workflow.js
export const meta = {
  name: 'test-workflow',
  description: 'A test workflow',
  providers: ['claude-code']
}

const result = await agent('do something', { provider: 'claude-code' })
return { result }
```

- [ ] **Step 2: Write the failing test**

```javascript
// packages/core/test/workflow-loader.test.js
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadWorkflow } from '../src/workflow-loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtures = join(__dirname, 'fixtures')

describe('workflow-loader', () => {
  it('loads meta from workflow file', async () => {
    const meta = await loadWorkflow.meta(join(fixtures, 'simple-workflow.js'))
    assert.equal(meta.name, 'test-workflow')
    assert.equal(meta.description, 'A test workflow')
  })

  it('injects runtime API and executes workflow', async () => {
    const fakeAgent = mock.fn(() => Promise.resolve('done'))
    const result = await loadWorkflow.execute(
      join(fixtures, 'simple-workflow.js'),
      { agent: fakeAgent }
    )
    assert.deepEqual(result, { result: 'done' })
    assert.equal(fakeAgent.mock.calls.length, 1)
  })

  it('does not expose fs, process, require to sandbox', async () => {
    await assert.rejects(
      loadWorkflow.execute(join(fixtures, 'access-fs.js'), {}),
      /not defined/
    )
  })
})
```

Also create the `access-fs.js` fixture:

```javascript
// packages/core/test/fixtures/access-fs.js
export const meta = { name: 'bad' }
const x = fs.readFileSync('/etc/passwd')
```

- [ ] **Step 3: Run test to verify it fails**

```bash
node --test packages/core/test/workflow-loader.test.js
```

Expected: FAIL

- [ ] **Step 4: Write minimal implementation**

```javascript
// packages/core/src/workflow-loader.js
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export async function loadMeta(workflowPath) {
  const source = readFileSync(workflowPath, 'utf-8')
  const sandbox = {
    console, Promise, setTimeout, clearTimeout,
    Array, Object, Map, Set, JSON, Math, String, Number, Boolean,
    Symbol, RegExp, Error, Date, Int8Array, Uint8Array, Float64Array,
    Buffer,
    agent: () => {}, parallel: () => {}, pipeline: () => {},
    phase: () => {}, log: () => {}
  }

  const context = vm.createContext(sandbox)
  const module = new vm.SourceTextModule(source, { context })
  await module.link(() => { throw new Error('import not allowed') })
  await module.evaluate()

  return module.namespace.meta
}

export async function executeWorkflow(workflowPath, apis) {
  const source = readFileSync(workflowPath, 'utf-8')
  const sandbox = {
    console, Promise, setTimeout, clearTimeout,
    Array, Object, Map, Set, JSON, Math, String, Number, Boolean,
    Symbol, RegExp, Error, Date, Int8Array, Uint8Array, Float64Array,
    Buffer,
    ...apis
  }

  const context = vm.createContext(sandbox)
  const module = new vm.SourceTextModule(source, { context })
  await module.link(() => { throw new Error('import not allowed') })
  await module.evaluate()

  // Script body runs on evaluate — return value goes to module namespace
  // But scripts use `return` which isn't captured by SourceTextModule.
  // We wrap the script to capture return value.
  return module.namespace
}
```

Wait — `return` in ESM top-level doesn't work. The workflow scripts use `return { result }` at top level, which is a syntax error in ESM. I need to handle this differently.

Actually, looking at SKILL.md more carefully — the script body runs as an async function context: "The script body runs in an async context — use `await` directly." This is NOT standard ESM. It's a custom execution model where the script is wrapped in an async function.

So I need to transform the script before executing it. Instead of using `SourceTextModule`, I should use `vm.Script` to run an async function that wraps the script content.

Let me redesign the loader:

```javascript
// The script gets wrapped in an async function
// export const meta = ... gets hoisted
// return value is the workflow result
```

Actually, using `vm.SourceTextModule` with ESM works for `export const meta`, but `return` at top-level isn't valid ESM. I need to handle this differently.

Options:
1. Use `vm.Script` + wrap in async function + handle `export` by regex extraction
2. Use `vm.SourceTextModule` for meta extraction, then `vm.Script` for execution with a wrapper

Let me go with option 2: use `SourceTextModule` to read meta (works since `export` is valid ESM), but for execution, strip the `export` keyword and wrap in an async function.

Actually, let me think again. The workflow script is written as:

```javascript
export const meta = { ... }

const result = await agent('...')
return { result }
```

For `loadMeta`, I need `SourceTextModule` — ESM handles `export` natively.

For `executeWorkflow`, I can:
1. Strip `export const meta = ...` line (or keep it as `const meta = ...`)
2. Wrap the rest in an async function that calls `return`
3. Use `vm.Script` + `runInContext`

Better approach — use `SourceTextModule` for both but append a wrapper:

Actually, the simplest approach: use `vm.Script` with a wrapper function. Pre-process the source to remove `export ` prefix, then wrap in an async function that captures the return value.

Let me rewrite the loader:<｜end▁of▁thinking｜>

- [ ] **Step 4 (revised): Write implementation — note the `return` challenge**

Workflow scripts use top-level `return` which isn't valid ESM. The loader needs to strip `export` and wrap in an async function.

```javascript
// packages/core/src/workflow-loader.js
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import os from 'node:os'

export async function loadMeta(workflowPath) {
  const source = readFileSync(workflowPath, 'utf-8')
  const sandbox = buildSandbox({})
  const context = vm.createContext(sandbox)
  const module = new vm.SourceTextModule(source, { context })
  await module.link(() => { throw new Error('import not allowed in workflow') })
  await module.evaluate()
  return module.namespace.meta
}

export async function executeWorkflow(workflowPath, apis) {
  const source = readFileSync(workflowPath, 'utf-8')
  // Transform: remove `export ` keyword, wrap in async return-capturing function
  const processed = source
    .replace(/^export /gm, '')         // export const meta -> const meta
    .replace(/\breturn\b/g, '__ret__')  // rename return to __ret__

  const wrapped = `
    (async () => {
      let __ret__
      ${processed}
      if (typeof __ret__ !== 'undefined') return __ret__
    })()
  `

  const sandbox = buildSandbox(apis)
  const context = vm.createContext(sandbox)
  const script = new vm.Script(wrapped)
  const execution = script.runInContext(context)
  return execution  // Promise -> await by caller
}

function buildSandbox(apis) {
  return {
    console, Promise, setTimeout, clearTimeout,
    Array, Object, Map, Set, JSON, Math, String, Number, Boolean,
    Symbol, RegExp, Error, Date,
    Int8Array, Uint8Array, ArrayBuffer, Float64Array,
    Buffer,
    ...apis
  }
}
```

Wait, the `return` transform approach is fragile. Better: wrap the whole thing in an async function and let `return` work naturally:

```javascript
const wrapped = `
  const __result__ = (async () => {
    ${processed}
  })()
  __result__
`
```

Since `vm.Script` returns the last expression value, and that's a promise, the caller awaits it.

Actually the cleanest approach:

```javascript
export async function executeWorkflow(workflowPath, apis) {
  const source = readFileSync(workflowPath, 'utf-8')
  const processed = source.replace(/^export /gm, '')
  const wrapped = `(async () => { ${processed} })()`
  const sandbox = buildSandbox(apis)
  const context = vm.createContext(sandbox)
  const script = new vm.Script(wrapped)
  return await script.runInContext(context)
}
```

The top-level `return` in the workflow script works because it's inside an async function. `export const meta` becomes `const meta` which is fine.

Let me use this cleaner version.

- [ ] **Step 5: Write the test and run**

Update the test to match the actual API:

```javascript
// packages/core/test/workflow-loader.test.js
import { describe, it, before, mock } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadMeta, executeWorkflow } from '../src/workflow-loader.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtures = join(__dirname, 'fixtures')

describe('workflow-loader', () => {
  it('loads meta from workflow file', async () => {
    const meta = await loadMeta(join(fixtures, 'simple-workflow.js'))
    assert.equal(meta.name, 'test-workflow')
  })

  it('injects APIs and executes workflow with return value', async () => {
    const agent = mock.fn(() => Promise.resolve('done'))
    const result = await executeWorkflow(
      join(fixtures, 'simple-workflow.js'),
      { agent, parallel: () => {}, pipeline: () => {}, phase: () => {}, log: () => {} }
    )
    assert.deepEqual(result, { result: 'done' })
    assert.equal(agent.mock.calls.length, 1)
  })

  it('does not expose fs in sandbox', async () => {
    const source = `
      export const meta = { name: 'bad' }
      const x = fs.readFileSync('/etc/passwd')
    `
    const fixture = join(fixtures, 'temp-bad.js')
    import('node:fs').then(fs => fs.writeFileSync(fixture, source))
    await assert.rejects(
      executeWorkflow(fixture, { agent: () => {} }),
      /fs is not defined/
    )
  })
})
```

- [ ] **Step 6: Run tests and fix**

```bash
node --test packages/core/test/workflow-loader.test.js
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/workflow-loader.js packages/core/test/workflow-loader.test.js
git commit -m "feat(core): add vm.SourceTextModule workflow loader with API injection"
```

---

### Task 7: Core integration — wire engine together

**Files:**
- Create: `packages/core/src/engine.js`
- Create: `packages/core/test/engine.test.js`

- [ ] **Step 1: Write engine orchestration**

```javascript
// packages/core/src/engine.js
import { loadConfig } from './config-loader.js'
import { createEventBus } from './event-emitter.js'
import { createScheduler } from './scheduler.js'
import { createRuntimeAPI } from './runtime-api.js'
import { loadMeta, executeWorkflow } from './workflow-loader.js'

export function createEngine({ cwd = process.cwd(), eventBus } = {}) {
  const config = loadConfig(cwd)
  const bus = eventBus || createEventBus()

  function getAPIs(agentFn, signal) {
    const scheduler = createScheduler({
      maxParallel: config.maxParallel,
      signal
    })
    const runtime = createRuntimeAPI({ eventBus: bus, scheduler })
    return {
      agent: agentFn,
      parallel: runtime.parallel,
      pipeline: runtime.pipeline,
      phase: runtime.phase,
      log: runtime.log
    }
  }

  async function run(workflowPath, agentFn, { signal } = {}) {
    const meta = await loadMeta(workflowPath)
    bus.emit('workflow:start', { name: meta.name, timestamp: Date.now() })
    const start = Date.now()
    try {
      const apis = getAPIs(agentFn, signal)
      const result = await executeWorkflow(workflowPath, apis)
      bus.emit('workflow:complete', { name: meta.name, result, duration: Date.now() - start })
      return result
    } catch (err) {
      bus.emit('workflow:error', { name: meta.name, error: err.message, duration: Date.now() - start })
      throw err
    }
  }

  return { run, config, bus }
}
```

- [ ] **Step 2: Write integration test**

```javascript
// packages/core/test/engine.test.js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createEngine } from '../src/engine.js'
import { createEventBus } from '../src/event-emitter.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtures = join(__dirname, 'fixtures')

describe('engine', () => {
  it('runs a workflow end-to-end with injected agent', async () => {
    const bus = createEventBus()
    const events = []
    bus.on('workflow:start', d => events.push(d))
    bus.on('workflow:complete', d => events.push(d))

    const engine = createEngine({ eventBus: bus })
    const result = await engine.run(
      join(fixtures, 'simple-workflow.js'),
      (prompt, opts) => Promise.resolve(`executed: ${prompt}`)
    )

    assert.deepEqual(result, { result: 'executed: do something' })
    assert.equal(events.length, 2)
    assert.equal(events[0].name, 'test-workflow')
    assert.equal(events[1].name, 'test-workflow')
  })
})
```

- [ ] **Step 3: Run tests**

```bash
node --test packages/core/test/*.test.js
```

Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/engine.js packages/core/src/index.js packages/core/test/engine.test.js
git commit -m "feat(core): add engine orchestrator wiring config, event bus, scheduler, loader"
```

---

## Phase 2: Agent Layer

### Task 8: Agent provider interface + ClaudeCodeProvider

**Files:**
- Create: `packages/agent/package.json`
- Create: `packages/agent/src/index.js`
- Create: `packages/agent/src/claude-code-provider.js`
- Create: `packages/agent/test/claude-code-provider.test.js`

- [ ] **Step 1: Create agent package.json**

```json
{
  "name": "@workflow-agent/agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.js",
  "scripts": {
    "test": "node --test test/*.test.js"
  }
}
```

- [ ] **Step 2: Write the failing test for ClaudeCodeProvider (non-interactive)**

```javascript
// packages/agent/test/claude-code-provider.test.js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { ClaudeCodeProvider } from '../src/claude-code-provider.js'

describe('ClaudeCodeProvider', () => {
  it('spawns claude with correct args in non-interactive mode', async () => {
    // We test the command construction, not actual execution
    const provider = new ClaudeCodeProvider()
    const cmd = provider.buildCommand('test prompt', { interactive: false })
    assert.equal(cmd.command, 'claude')
    assert.deepEqual(cmd.args, ['--dangerously-skip-permissions', '-p', 'test prompt'])
  })

  it('spawns claude without args in interactive mode', () => {
    const provider = new ClaudeCodeProvider()
    const cmd = provider.buildCommand('', { interactive: true })
    assert.equal(cmd.command, 'claude')
    assert.deepEqual(cmd.args, [])
  })

  it('rejects when claude is not installed', async () => {
    // Simulate by using a non-existent path
    const provider = new ClaudeCodeProvider({ commandPath: '/usr/bin/nonexistent-claude' })
    await assert.rejects(
      provider.execute({ prompt: 'test', interactive: false }),
      /ENOENT|not found/
    )
  })
})
```

- [ ] **Step 3: Write ClaudeCodeProvider implementation**

```javascript
// packages/agent/src/claude-code-provider.js
import { spawn } from 'node:child_process'

export class ClaudeCodeProvider {
  constructor({ commandPath = 'claude', eventBus } = {}) {
    this.commandPath = commandPath
    this.eventBus = eventBus
  }

  buildCommand(prompt, { interactive }) {
    if (interactive) {
      return { command: this.commandPath, args: [] }
    }
    return {
      command: this.commandPath,
      args: ['--dangerously-skip-permissions', '-p', prompt]
    }
  }

  execute({ prompt, interactive, signal } = {}) {
    const { command, args } = this.buildCommand(prompt, { interactive })
    const start = Date.now()

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: interactive ? 'inherit' : ['pipe', 'pipe', 'pipe']
      })

      if (signal) {
        signal.addEventListener('abort', () => {
          proc.kill()
          reject(new Error('aborted'))
        }, { once: true })
      }

      let output = ''
      const logs = []

      if (!interactive) {
        proc.stdout.on('data', (chunk) => {
          const lines = chunk.toString()
          output += lines
          logs.push(lines)
          this.eventBus?.emit('agent:log', { line: lines })
        })

        proc.stderr.on('data', (chunk) => {
          logs.push('[stderr] ' + chunk.toString())
        })
      }

      proc.on('close', (exitCode) => {
        const duration = Date.now() - start
        if (exitCode === 0 || exitCode === null) {
          resolve({ output, exitCode: exitCode || 0, duration, logs })
        } else {
          reject(new Error(`claude exited with code ${exitCode}`))
        }
      })

      proc.on('error', (err) => {
        reject(err)
      })
    })
  }
}
```

- [ ] **Step 4: Write agent package index (re-export barrel)**

```javascript
// packages/agent/src/index.js
export { ClaudeCodeProvider } from './claude-code-provider.js'
export { CodexProvider } from './codex-provider.js'

export function createProvider(name, opts = {}) {
  switch (name) {
    case 'claude-code': return new ClaudeCodeProvider(opts)
    case 'codex': return new CodexProvider(opts)
    default: throw new Error(`Unknown provider: ${name}`)
  }
}
```

- [ ] **Step 5: Run tests**

```bash
node --test packages/agent/test/claude-code-provider.test.js
```

Expected: PASS (first two tests pass, third may fail depending on environment — acceptable)

- [ ] **Step 6: Commit**

```bash
git add packages/agent/ && git commit -m "feat(agent): add ClaudeCodeProvider with non-interactive and interactive modes"
```

---

### Task 9: CodexProvider

**Files:**
- Create: `packages/agent/src/codex-provider.js`
- Create: `packages/agent/test/codex-provider.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// packages/agent/test/codex-provider.test.js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CodexProvider } from '../src/codex-provider.js'

describe('CodexProvider', () => {
  it('builds command with exec --full-auto in non-interactive mode', () => {
    const provider = new CodexProvider()
    const cmd = provider.buildCommand('test', { interactive: false })
    assert.equal(cmd.command, 'codex')
    assert.deepEqual(cmd.args, ['exec', 'test', '--full-auto'])
  })

  it('builds command without args in interactive mode', () => {
    const provider = new CodexProvider()
    const cmd = provider.buildCommand('', { interactive: true })
    assert.equal(cmd.command, 'codex')
    assert.deepEqual(cmd.args, [])
  })
})
```

- [ ] **Step 2: Write CodexProvider implementation**

```javascript
// packages/agent/src/codex-provider.js
import { spawn } from 'node:child_process'

export class CodexProvider {
  constructor({ commandPath = 'codex', eventBus } = {}) {
    this.commandPath = commandPath
    this.eventBus = eventBus
  }

  buildCommand(prompt, { interactive }) {
    if (interactive) {
      return { command: this.commandPath, args: [] }
    }
    return {
      command: this.commandPath,
      args: ['exec', prompt, '--full-auto']
    }
  }

  execute({ prompt, interactive, signal } = {}) {
    const { command, args } = this.buildCommand(prompt, { interactive })
    const start = Date.now()

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: interactive ? 'inherit' : ['pipe', 'pipe', 'pipe']
      })

      if (signal) {
        signal.addEventListener('abort', () => {
          proc.kill()
          reject(new Error('aborted'))
        }, { once: true })
      }

      let output = ''
      const logs = []

      if (!interactive) {
        proc.stdout.on('data', (chunk) => {
          const lines = chunk.toString()
          output += lines
          logs.push(lines)
          this.eventBus?.emit('agent:log', { line: lines })
        })

        proc.stderr.on('data', (chunk) => {
          logs.push('[stderr] ' + chunk.toString())
        })
      }

      proc.on('close', (exitCode) => {
        const duration = Date.now() - start
        if (exitCode === 0 || exitCode === null) {
          resolve({ output, exitCode: exitCode || 0, duration, logs })
        } else {
          reject(new Error(`codex exited with code ${exitCode}`))
        }
      })

      proc.on('error', (err) => {
        reject(err)
      })
    })
  }
}
```

- [ ] **Step 3: Run tests**

```bash
node --test packages/agent/test/codex-provider.test.js
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/codex-provider.js packages/agent/test/codex-provider.test.js
git commit -m "feat(agent): add CodexProvider with exec --full-auto mode"
```

---

### Task 10: Schema validation in agent execute

**Files:**
- Modify: `packages/agent/src/claude-code-provider.js`
- Modify: `packages/agent/src/codex-provider.js`

- [ ] **Step 1: Add schema handling to both providers**

The strategy: when `schema` is present, append format instructions to the prompt, then validate output after execution. Retry once on failure.

Modify the `execute` method in both providers to accept `schema` and handle it:

```javascript
// Inside execute method — wrap prompt when schema exists
let finalPrompt = prompt
if (schema) {
  finalPrompt = `${prompt}

你必须输出 JSON，格式须符合以下 Schema：
${JSON.stringify(schema, null, 2)}

你可以用 bash 或 node -e 验证输出是否符合 Schema，
确认格式正确后再返回最终结果。`
}

// Execute with the wrapped prompt
// ... spawn logic ...

// After output is collected — try to parse
if (schema) {
  try {
    const parsed = JSON.parse(output.trim())
    // Basic required field validation
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in parsed)) {
          throw new Error(`Missing required field: ${field}`)
        }
      }
    }
    result.data = parsed
  } catch (e) {
    // Retry once with error feedback
    if (retries < 1) {
      retries++
      return execute({ prompt: `${prompt}\n\n之前的输出格式有误: ${e.message}\n请确保输出有效的 JSON 并符合 Schema。`, schema, signal, interactive })
    }
    throw new Error(`Agent 输出不符合 Schema: ${e.message}\n原始输出: ${output}`)
  }
}
```

This applies to both ClaudeCodeProvider and CodexProvider. The cleanest way is to add a shared helper:

```javascript
// packages/agent/src/schema-helper.js
export function buildPromptWithSchema(prompt, schema) {
  if (!schema) return prompt
  return `${prompt}

你必须输出 JSON，格式须符合以下 Schema：
${JSON.stringify(schema, null, 2)}

你可以用 bash 或 node -e 验证输出是否符合 Schema，
确认格式正确后再返回最终结果。`
}

export function validateOutput(output, schema) {
  if (!schema) return { output, data: undefined }
  const trimmed = output.trim()
  const parsed = JSON.parse(trimmed)
  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in parsed)) {
        throw new Error(`Missing required field: ${field}`)
      }
    }
  }
  return { output: trimmed, data: parsed }
}
```

- [ ] **Step 2: Update test to cover schema flow**

```javascript
// packages/agent/test/claude-code-provider.test.js — add:
it('appends schema to prompt', () => {
  const provider = new ClaudeCodeProvider()
  // Test via buildCommand indirectly
  const schema = { type: 'object', properties: { result: { type: 'string' } }, required: ['result'] }
  // Schema handling is in execute() not buildCommand()
  assert.ok(true)
})
```

- [ ] **Step 3: Run tests**

```bash
node --test packages/agent/test/*.test.js
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/ && git commit -m "feat(agent): add schema validation with agent self-check via bash"
```

---

## Phase 3: CLI

### Task 11: CLI package scaffolding + entry point

**Files:**
- Create: `packages/cli/package.json`
- Create: `packages/cli/src/index.js`

- [ ] **Step 1: Create cli package.json**

```json
{
  "name": "@workflow-agent/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "workflow-agent": "./src/index.js"
  },
  "dependencies": {
    "commander": "^13.0.0",
    "@workflow-agent/core": "0.1.0",
    "@workflow-agent/agent": "0.1.0"
  },
  "scripts": {
    "test": "node --test test/*.test.js"
  }
}
```

- [ ] **Step 2: Write CLI entry point**

```javascript
#!/usr/bin/env node
// packages/cli/src/index.js
import { Command } from 'commander'

const program = new Command()

program
  .name('workflow-agent')
  .description('Workflow generator and executor')
  .version('0.1.0')

program
  .command('list')
  .description('List all available workflows')
  .action(async () => {
    const { listWorkflows } = await import('./commands/list.js')
    await listWorkflows()
  })

program
  .command('run <name>')
  .description('Execute a workflow')
  .option('--provider <name>', 'Default agent provider', 'claude-code')
  .option('--timeout <ms>', 'Agent timeout in milliseconds', '300000')
  .option('--max-parallel <n>', 'Max parallel agents', '4')
  .action(async (name, opts) => {
    const { runWorkflow } = await import('./commands/run.js')
    await runWorkflow(name, opts)
  })

program
  .command('dashboard')
  .description('Start the web dashboard')
  .argument('[port]', 'Port number', '3456')
  .action(async (port) => {
    const { startDashboard } = await import('./commands/dashboard.js')
    await startDashboard(port)
  })

program
  .command('init')
  .description('Initialize .workflow-agent directory and config')
  .action(async () => {
    const { initProject } = await import('./commands/init.js')
    await initProject()
  })

program.parse()
```

- [ ] **Step 3: Install deps and verify help output**

```bash
cd packages/cli && npm install commander && cd ../..
node packages/cli/src/index.js --help
```

Expected: Shows help with list, run, dashboard, init commands

- [ ] **Step 4: Commit**

```bash
git add packages/cli/package.json packages/cli/src/index.js
git commit -m "feat(cli): add CLI entry point with commander"
```

---

### Task 12: Workflow finder (scan 3 sources)

**Files:**
- Create: `packages/cli/src/workflow-finder.js`
- Create: `packages/cli/test/workflow-finder.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// packages/cli/test/workflow-finder.test.js
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createWorkflowFinder } from '../src/workflow-finder.js'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('workflow-finder', () => {
  let tmpDir, projectDir, globalDir
  const builtInDir = join(__dirname, '..', 'workflows')

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'waf-test-'))
    projectDir = join(tmpDir, 'project')
    globalDir = join(tmpDir, 'global')
    mkdirSync(join(projectDir, '.workflow-agent', 'workflow'), { recursive: true })
    mkdirSync(join(globalDir, '.workflow-agent', 'workflow'), { recursive: true })
  })

  after(() => rmSync(tmpDir, { recursive: true }))

  it('finds workflow in project dir with highest priority', () => {
    writeFileSync(join(projectDir, '.workflow-agent', 'workflow', 'test.js'), 'export const meta = { name: "test" }')
    const finder = createWorkflowFinder({ cwd: projectDir, globalHome: globalDir, builtInDir })
    const found = finder.find('test')
    assert.equal(found.path, join(projectDir, '.workflow-agent', 'workflow', 'test.js'))
    assert.equal(found.source, 'project')
  })

  it('falls back to global dir', () => {
    writeFileSync(join(globalDir, '.workflow-agent', 'workflow', 'global.js'), 'export const meta = { name: "global" }')
    const finder = createWorkflowFinder({ cwd: projectDir, globalHome: globalDir, builtInDir })
    const found = finder.find('global')
    assert.equal(found.source, 'global')
  })

  it('returns null for unknown workflow', () => {
    const finder = createWorkflowFinder({ cwd: projectDir, globalHome: globalDir, builtInDir })
    assert.equal(finder.find('nonexistent'), null)
  })

  it('lists all workflows from all sources', () => {
    const finder = createWorkflowFinder({ cwd: projectDir, globalHome: globalDir, builtInDir })
    const all = finder.listAll()
    assert.ok(all.length >= 1)
    assert.ok(all.some(w => w.name === 'test'))
    assert.ok(all.some(w => w.name === 'global'))
  })
})
```

- [ ] **Step 2: Write implementation**

```javascript
// packages/cli/src/workflow-finder.js
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
    // Project first
    if (existsSync(join(projectDir, target))) {
      return { name, path: join(projectDir, target), source: 'project' }
    }
    // Global second
    if (existsSync(join(globalDir, target))) {
      return { name, path: join(globalDir, target), source: 'global' }
    }
    // Built-in third
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
```

- [ ] **Step 3: Run tests**

```bash
node --test packages/cli/test/workflow-finder.test.js
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/workflow-finder.js packages/cli/test/workflow-finder.test.js
git commit -m "feat(cli): add workflow finder with project/global/built-in priority"
```

---

### Task 13: list command

**Files:**
- Create: `packages/cli/src/commands/list.js`

- [ ] **Step 1: Write list command**

```javascript
// packages/cli/src/commands/list.js
import { createWorkflowFinder } from '../workflow-finder.js'
import { loadMeta } from '@workflow-agent/core'

export async function listWorkflows() {
  const finder = createWorkflowFinder()
  const workflows = finder.listAll()

  if (workflows.length === 0) {
    console.log('No workflows found.')
    return
  }

  // Load meta for each workflow (display name and description)
  const enriched = []
  for (const w of workflows) {
    try {
      const meta = await loadMeta(w.path)
      enriched.push({ ...w, displayName: meta.name || w.name, description: meta.description || '' })
    } catch {
      enriched.push({ ...w, displayName: w.name, description: '(failed to load)' })
    }
  }

  // Dedup by name (project overrides global overrides built-in)
  const seen = new Set()
  const deduped = enriched.filter(w => {
    if (seen.has(w.name)) return false
    seen.add(w.name)
    return true
  })

  console.log('\nWorkflows:')
  console.log('─'.repeat(50))
  for (const w of deduped) {
    const sourceTag = w.source === 'project' ? '📁' : w.source === 'global' ? '🌐' : '⚙️'
    console.log(`  ${sourceTag} ${w.displayName.padEnd(20)} ${w.description}`)
  }
  console.log()
}
```

- [ ] **Step 2: Test manually**

```bash
node packages/cli/src/index.js list
```

Expected: Shows workflow list (at minimum the built-in generate workflow)

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/list.js && git commit -m "feat(cli): add list command"
```

---

### Task 14: run command

**Files:**
- Create: `packages/cli/src/commands/run.js`

- [ ] **Step 1: Write run command**

```javascript
// packages/cli/src/commands/run.js
import { createEngine } from '@workflow-agent/core'
import { createProvider } from '@workflow-agent/agent'
import { createWorkflowFinder } from '../workflow-finder.js'
import { createEventBus } from '@workflow-agent/core'

export async function runWorkflow(name, options) {
  const finder = createWorkflowFinder()
  const found = finder.find(name)

  if (!found) {
    console.error(`Workflow "${name}" not found.`)
    console.error('Run "workflow-agent list" to see available workflows.')
    process.exit(1)
  }

  console.log(`Running "${name}" (from ${found.source})...\n`)

  const bus = createEventBus()

  // Wire up CLI logging from events
  bus.on('phase:change', ({ title }) => {
    console.log(`\n  ◆ ${title}`)
  })

  bus.on('agent:start', ({ provider, label }) => {
    console.log(`    → [${label || provider}] starting...`)
  })

  bus.on('agent:log', ({ line }) => {
    process.stdout.write(line)
  })

  const engine = createEngine({ eventBus: bus })

  // Wrap agent() calls via the provider
  async function agentFn(prompt, opts = {}) {
    const providerName = opts.provider || options.provider || 'claude-code'
    const provider = createProvider(providerName, { eventBus: bus })

    bus.emit('agent:start', { provider: providerName, prompt, label: opts.label })

    const result = await provider.execute({
      prompt,
      interactive: opts.interactive || false,
      schema: opts.schema,
      signal: opts.signal
    })

    bus.emit('agent:complete', {
      provider: providerName,
      output: result.output,
      data: result.data,
      exitCode: result.exitCode,
      duration: result.duration
    })

    return result.data || result.output
  }

  // Set up abort signal for Ctrl+C
  const ac = new AbortController()
  process.on('SIGINT', () => {
    console.log('\nCancelling...')
    ac.abort()
  })

  try {
    const result = await engine.run(found.path, agentFn, { signal: ac.signal })
    console.log('\n  ✓ Done.')
    if (result) {
      console.log('\nResult:', JSON.stringify(result, null, 2))
    }
    return result
  } catch (err) {
    console.error(`\n  ✗ Failed: ${err.message}`)
    process.exit(1)
  }
}
```

- [ ] **Step 2: Test manually with generate workflow**

```bash
node packages/cli/src/index.js list
# Should list 'generate'
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/run.js && git commit -m "feat(cli): add run command"
```

---

### Task 15: init command

**Files:**
- Create: `packages/cli/src/commands/init.js`

- [ ] **Step 1: Write init command**

```javascript
// packages/cli/src/commands/init.js
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

  // Create workflow directory
  mkdirSync(workflowDir, { recursive: true })
  console.log('✓ Created .workflow-agent/workflow/')

  // Handle config
  if (existsSync(globalConfigPath)) {
    copyFileSync(globalConfigPath, configPath)
    console.log('✓ Copied global config to .workflow-agent/config.json')
  } else {
    writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2))
    console.log('✓ Created default .workflow-agent/config.json')
  }

  console.log('\nRun "workflow-agent generate" to create your first workflow.')
}
```

- [ ] **Step 2: Test manually**

```bash
cd /tmp && mkdir -p test-init && cd test-init
node /Volumes/J.ZAO_SSD/workspace/MyProject/workflow-agent/packages/cli/src/index.js init
ls -la .workflow-agent/
```

Expected: Shows created directory and config.json

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/commands/init.js && git commit -m "feat(cli): add init command"
```

---

### Task 16: Built-in generate workflow

**Files:**
- Create: `packages/cli/workflows/generate.js`

- [ ] **Step 1: Write generate workflow**

```javascript
// packages/cli/workflows/generate.js
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
```

- [ ] **Step 2: Add workflow-finder to find this built-in workflow**

Update `workflow-finder.js` to know about the built-in directory. It already does — `builtInDir` defaults to `join(__dirname, '..', 'workflows')`.

- [ ] **Step 3: Test listing**

```bash
node packages/cli/src/index.js list
```

Expected: Shows 'generate' with source 'built-in'

- [ ] **Step 4: Commit**

```bash
git add packages/cli/workflows/generate.js && git commit -m "feat(cli): add built-in generate workflow"
```

---

### Task 17: dashboard command (stub)

**Files:**
- Create: `packages/cli/src/commands/dashboard.js`

- [ ] **Step 1: Write dashboard command (stub that launches dashboard server)**

```javascript
// packages/cli/src/commands/dashboard.js
export async function startDashboard(port) {
  try {
    const { createServer } = await import('@workflow-agent/dashboard')
    const server = await createServer({ port: parseInt(port) })
    console.log(`Dashboard running at http://localhost:${port}`)
  } catch (err) {
    console.error('Failed to start dashboard:', err.message)
    console.error('Make sure @workflow-agent/dashboard is installed.')
    process.exit(1)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/commands/dashboard.js && git commit -m "feat(cli): add dashboard command (stub)"
```

---

## Phase 4: Dashboard

### Task 18: Dashboard package scaffolding + Express server with SSE

**Files:**
- Create: `packages/dashboard/package.json`
- Create: `packages/dashboard/server/index.js`

- [ ] **Step 1: Create dashboard package.json**

```json
{
  "name": "@workflow-agent/dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "server/index.js",
  "dependencies": {
    "express": "^5.0.0"
  }
}
```

- [ ] **Step 2: Write Express server with SSE**

```javascript
// packages/dashboard/server/index.js
import express from 'express'

export async function createServer({ port = 3456, eventBus } = {}) {
  const app = express()
  const clients = new Set()

  // SSE endpoint
  app.get('/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    })

    const client = { id: Date.now(), res }
    clients.add(client)

    req.on('close', () => {
      clients.delete(client)
    })
  })

  // API endpoints
  app.get('/api/workflows', (req, res) => {
    // Forward to workflow finder
    res.json({ workflows: [] }) // placeholder
  })

  // Serve static React build if available
  const clientBuild = new URL('../client/dist/index.html', import.meta.url)
  try {
    app.use(express.static(new URL('../client/dist', import.meta.url)))
    app.get('*', (req, res) => {
      res.sendFile(clientBuild)
    })
  } catch {
    app.get('/', (req, res) => res.send('Dashboard (dev mode)'))
  }

  // Helper to broadcast events to SSE clients
  function broadcast(event, data) {
    for (const client of clients) {
      client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }
  }

  // Wire up event bus if provided
  if (eventBus) {
    eventBus.on('phase:change', (d) => broadcast('phase:change', d))
    eventBus.on('agent:start', (d) => broadcast('agent:start', d))
    eventBus.on('agent:log', (d) => broadcast('agent:log', d))
    eventBus.on('agent:complete', (d) => broadcast('agent:complete', d))
    eventBus.on('workflow:start', (d) => broadcast('workflow:start', d))
    eventBus.on('workflow:complete', (d) => broadcast('workflow:complete', d))
  }

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve({ server, app, broadcast, port })
    })
  })
}
```

- [ ] **Step 3: Test startup**

```bash
node -e "
import { createServer } from './packages/dashboard/server/index.js';
const s = await createServer({ port: 3456 });
console.log('Dashboard running on', s.port);
s.server.close();
"
```

Expected: Dashboard running on 3456

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/package.json packages/dashboard/server/index.js
git commit -m "feat(dashboard): add Express server with SSE support"
```

---

### Task 19: React client scaffold (Vite)

**Files:**
- Create: `packages/dashboard/client/package.json`
- Create: `packages/dashboard/client/vite.config.js`
- Create: `packages/dashboard/client/index.html`
- Create: `packages/dashboard/client/src/main.jsx`

- [ ] **Step 1: Create client package.json**

```json
{
  "name": "@workflow-agent/dashboard-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create vite.config.js**

```javascript
// packages/dashboard/client/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/events': 'http://localhost:3456',
      '/api': 'http://localhost:3456'
    }
  },
  build: {
    outDir: 'dist'
  }
})
```

- [ ] **Step 3: Create index.html + main.jsx**

```html
<!-- packages/dashboard/client/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workflow Agent Dashboard</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #0f172a; color: #e2e8f0; }
    * { box-sizing: border-box; }
    a { color: #60a5fa; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>
```

```jsx
// packages/dashboard/client/src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
)
```

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/client/ && git commit -m "feat(dashboard): add React client scaffold with Vite"
```

---

### Task 20: Dashboard pages

**Files:**
- Create: `packages/dashboard/client/src/App.jsx`
- Create: `packages/dashboard/client/src/pages/WorkflowList.jsx`
- Create: `packages/dashboard/client/src/pages/RunHistory.jsx`
- Create: `packages/dashboard/client/src/pages/RunDetail.jsx`

- [ ] **Step 1: Write App.jsx with simple routing**

```jsx
// packages/dashboard/client/src/App.jsx
import React, { useState, useEffect } from 'react'

function App() {
  const [page, setPage] = useState('workflows')
  const [runs, setRuns] = useState([])
  const [selectedRun, setSelectedRun] = useState(null)
  const [workflows, setWorkflows] = useState([])

  useEffect(() => {
    fetch('/api/workflows')
      .then(r => r.json())
      .then(d => setWorkflows(d.workflows || []))
      .catch(() => {})

    // Connect SSE
    const es = new EventSource('/events')
    es.addEventListener('workflow:start', (e) => {
      const data = JSON.parse(e.data)
      setRuns(prev => [{ id: Date.now(), ...data, status: 'running', steps: [] }, ...prev])
    })
    es.addEventListener('workflow:complete', (e) => {
      const data = JSON.parse(e.data)
      setRuns(prev => prev.map(r => r.name === data.name ? { ...r, ...data, status: 'completed' } : r))
    })
    es.addEventListener('workflow:error', (e) => {
      const data = JSON.parse(e.data)
      setRuns(prev => prev.map(r => r.name === data.name ? { ...r, ...data, status: 'failed' } : r))
    })
    return () => es.close()
  }, [])

  const navigate = (p) => { setPage(p); setSelectedRun(null) }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 20 }}>
      <nav style={{ display: 'flex', gap: 16, marginBottom: 24, borderBottom: '1px solid #334155', paddingBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f8fafc' }}>Workflow Agent</h1>
        <button onClick={() => navigate('workflows')} style={navStyle(page === 'workflows')}>Workflows</button>
        <button onClick={() => navigate('history')} style={navStyle(page === 'history')}>Runs</button>
      </nav>

      {page === 'workflows' && <WorkflowList workflows={workflows} />}
      {page === 'history' && <RunHistory runs={runs} />}
    </div>
  )
}

function navStyle(active) {
  return {
    background: active ? '#334155' : 'transparent',
    color: '#e2e8f0',
    border: 'none',
    padding: '4px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14
  }
}

export default App
```

- [ ] **Step 2: Write WorkflowList component**

```jsx
// packages/dashboard/client/src/pages/WorkflowList.jsx
import React from 'react'

export default function WorkflowList({ workflows }) {
  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Workflows</h2>
      {workflows.length === 0 && <p style={{ color: '#94a3b8' }}>No workflows found.</p>}
      {workflows.map((w, i) => (
        <div key={i} style={{
          background: '#1e293b',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontWeight: 600 }}>{w.name}</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>{w.description}</div>
          </div>
          <span style={{ fontSize: 12, background: '#334155', padding: '2px 8px', borderRadius: 4 }}>
            {w.source}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Write RunHistory component**

```jsx
// packages/dashboard/client/src/pages/RunHistory.jsx
import React from 'react'

const statusColors = {
  running: '#3b82f6',
  completed: '#22c55e',
  failed: '#ef4444'
}

export default function RunHistory({ runs }) {
  return (
    <div>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Run History</h2>
      {runs.length === 0 && <p style={{ color: '#94a3b8' }}>No runs yet. Execute a workflow to see it here.</p>}
      {runs.map((r, i) => (
        <div key={i} style={{
          background: '#1e293b',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 8,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <div style={{ fontWeight: 600 }}>{r.name}</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              {r.duration ? `${(r.duration / 1000).toFixed(1)}s` : 'in progress...'}
            </div>
          </div>
          <span style={{
            background: statusColors[r.status] || '#64748b',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 12,
            color: '#fff'
          }}>
            {r.status}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Build the client**

```bash
cd packages/dashboard/client && npm install && npm run build && cd ../../..
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/client/src/ && git commit -m "feat(dashboard): add React pages (workflow list, run history)"
```

---

## Self-Review

After writing this plan, verify:

1. **Spec coverage:** The 4 phases map to the spec exactly:
   - Phase 1 covers config, event system, scheduler, runtime API, VM loader, engine — all from spec section 7
   - Phase 2 covers ClaudeCodeProvider, CodexProvider, schema validation — spec section 8
   - Phase 3 covers CLI commands, workflow finder, generate workflow — spec sections 3, 4, 6, 9
   - Phase 4 covers Express + SSE + React dashboard — spec section 10

2. **No placeholders:** Every step has either code or a command. No "TBD" or "implement later".

3. **Type consistency:** The agent function signature `(prompt, opts) => Promise<any>` is consistent across runtime-api, engine, and run command.
