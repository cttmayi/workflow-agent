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
