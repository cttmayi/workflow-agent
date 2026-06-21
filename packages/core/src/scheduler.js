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
        if (nextIndex >= thunks.length || completed >= thunks.length) return
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

      for (let i = 0; i < Math.min(maxParallel, thunks.length); i++) {
        startNext()
      }
    })
  }

  return { runAll }
}
