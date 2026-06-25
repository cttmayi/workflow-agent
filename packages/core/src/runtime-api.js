import { createInterface } from 'node:readline'

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

    return new Promise(resolve => {
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

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const inputBuffer = []
  let inputResolve = null

  rl.on('line', line => {
    if (inputResolve) {
      inputResolve(line)
      inputResolve = null
    } else {
      inputBuffer.push(line)
    }
  })

  function input(prompt) {
    rl.setPrompt('>>> ' + (prompt || ''))
    rl.prompt()
    return new Promise(resolve => {
      if (inputBuffer.length > 0) {
        resolve(inputBuffer.shift())
      } else {
        inputResolve = resolve
      }
    })
  }

  function cleanup() {
    rl.close()
  }

  return { phase, log, parallel, pipeline, input, cleanup }
}
