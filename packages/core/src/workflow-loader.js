import { readFileSync } from 'node:fs'
import vm from 'node:vm'

export async function loadMeta(workflowPath) {
  const source = readFileSync(workflowPath, 'utf-8')
  const prefix = 'export const meta = '
  const startIdx = source.indexOf(prefix)
  if (startIdx === -1) throw new Error('No meta export found')

  const metaStart = startIdx + prefix.length
  let depth = 0
  let metaEnd = metaStart
  for (let i = metaStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) { metaEnd = i + 1; break }
    }
  }

  const metaStr = source.slice(metaStart, metaEnd)
  const sandbox = buildSandbox({})
  const context = vm.createContext(sandbox)
  const script = new vm.Script(`(${metaStr})`)
  return script.runInContext(context)
}

export async function executeWorkflow(workflowPath, apis) {
  const source = readFileSync(workflowPath, 'utf-8')
  const processed = source.replace(/^export /gm, '')

  // Bridge host-context async results into the vm without awaiting host
  // Promises from within the vm, because AbortSignal-based rejections of
  // host Promises do not propagate across the vm boundary. Instead:
  //   1. The vm creates its own Promise and stores resolve/reject callbacks.
  //   2. The vm calls a fire-and-forget host function to start the work.
  //   3. The host completes the work and calls the stored vm callbacks.
  const { promise, resolve, reject } = Promise.withResolvers()
  let agentId = 0
  const pendingResolve = new Map()
  const pendingReject = new Map()

  const wrapped = `(async () => {
    try {
      const agent = (prompt, opts = {}) => new Promise((res, rej) => {
        const id = __wa_nextId();
        __wa_pending.set(id, res);
        __wa_pendingErr.set(id, rej);
        __wa_runAgent(id, prompt, opts);
      });
      const __result = (async () => { ${processed} })();
      __wa_resolve(await __result);
    } catch(e) {
      __wa_reject(e);
    }
  })()`

  const { agent: _unused, ...safeApis } = apis
  const sandbox = buildSandbox({
    ...safeApis,
    __wa_resolve: resolve,
    __wa_reject: reject,
    __wa_pending: pendingResolve,
    __wa_pendingErr: pendingReject,
    __wa_nextId: () => ++agentId,
    __wa_runAgent: (id, prompt, opts) => {
      apis.agent(prompt, opts)
        .then(result => {
          const fn = pendingResolve.get(id)
          if (fn) {
            pendingResolve.delete(id)
            pendingReject.delete(id)
            fn(result)
          }
        })
        .catch(err => {
          const fn = pendingReject.get(id)
          if (fn) {
            pendingResolve.delete(id)
            pendingReject.delete(id)
            fn(err)
          }
        })
    }
  })
  const context = vm.createContext(sandbox)
  const script = new vm.Script(wrapped)
  script.runInContext(context)

  return await promise
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
