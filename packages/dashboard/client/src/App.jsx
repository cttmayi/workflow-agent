import React, { useState, useEffect, useRef } from 'react'

const styles = {
  phase: { background: '#f0f4ff', padding: '0.5rem 0.75rem', borderRadius: 6, borderLeft: '3px solid #3b82f6', fontSize: '0.9rem' },
  wfStart: { background: '#f0fdf4', padding: '0.5rem 0.75rem', borderRadius: 6, borderLeft: '3px solid #22c55e', fontSize: '0.9rem' },
  wfEnd: { background: '#f0fdf4', padding: '0.5rem 0.75rem', borderRadius: 6, borderLeft: '3px solid #22c55e', fontSize: '0.9rem' },
  agStart: { background: '#fefce8', padding: '0.5rem 0.75rem', borderRadius: 6, borderLeft: '3px solid #eab308', fontSize: '0.85rem' },
  agEnd: { background: '#fffbeb', padding: '0.5rem 0.75rem', borderRadius: 6, borderLeft: '3px solid #eab308', fontSize: '0.85rem' },
  log: { padding: '0.25rem 0.75rem', fontSize: '0.8rem', color: '#666' },
  time: { color: '#666', fontSize: '0.75rem' },
  muted: { color: '#aaa', fontSize: '0.7rem' },
}

function EventCard({ event }) {
  const time = new Date(event.ts).toLocaleTimeString()

  switch (event.type) {
    case 'phase':
      return <div style={styles.phase}>
        <span style={styles.time}>{time}</span> <strong>{event.title}</strong>
      </div>

    case 'workflow-start':
      return <div style={styles.wfStart}>
        <span style={styles.time}>{time}</span> ▶ Workflow <strong>{event.name}</strong> started
      </div>

    case 'workflow-end':
      return <div style={styles.wfEnd}>
        <span style={styles.time}>{time}</span> ✓ Workflow <strong>{event.name}</strong> completed ({event.duration}ms)
        {event.result && <pre style={{ fontSize: '0.75rem', margin: '0.25rem 0 0', overflow: 'auto' }}>{JSON.stringify(event.result, null, 2)}</pre>}
      </div>

    case 'agent-start':
      return <div style={styles.agStart}>
        <span style={styles.time}>{time}</span> → [{event.label || event.provider}] starting...
        {event.prompt && <div style={{ color: '#888', fontSize: '0.75rem', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.prompt}</div>}
      </div>

    case 'agent-end':
      return <div style={styles.agEnd}>
        <span style={styles.time}>{time}</span> ← [{event.provider}] done ({event.duration}ms)
        {event.output && <pre style={{ fontSize: '0.75rem', margin: '0.25rem 0 0', overflow: 'auto', maxHeight: 100, background: '#f9f9f9', padding: 4, borderRadius: 4 }}>{event.output}</pre>}
      </div>

    case 'log':
      return <div style={styles.log}>
        <span style={styles.muted}>{time}</span> {event.line}
      </div>
  }
}

export default function App() {
  const [events, setEvents] = useState([])
  const [connected, setConnected] = useState(false)
  const [port, setPort] = useState('3456')
  const bottomRef = useRef(null)

  useEffect(() => {
    setPort(location.port || '3456')
    const es = new EventSource('/events')
    es.onopen = () => setConnected(true)

    const handlers = {
      'phase:change': (d) => ({ type: 'phase', title: d.title, ts: d.timestamp || Date.now() }),
      'agent:start': (d) => ({ type: 'agent-start', provider: d.provider, label: d.label, prompt: d.prompt, ts: d.timestamp || Date.now() }),
      'agent:complete': (d) => ({ type: 'agent-end', provider: d.provider, output: d.output, duration: d.duration, ts: d.timestamp || Date.now() }),
      'agent:log': (d) => ({ type: 'log', line: d.line, ts: d.timestamp || Date.now() }),
      'workflow:start': (d) => ({ type: 'workflow-start', name: d.name, ts: d.timestamp || Date.now() }),
      'workflow:complete': (d) => ({ type: 'workflow-end', name: d.name, result: d.result, duration: d.duration, ts: d.timestamp || Date.now() }),
    }

    for (const [event, fn] of Object.entries(handlers)) {
      es.addEventListener(event, (e) => {
        const data = JSON.parse(e.data)
        setEvents(prev => [...prev, fn(data)])
      })
    }

    es.addEventListener('error', () => setConnected(false))
    return () => es.close()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 800, margin: '0 auto', padding: '1rem' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem' }}>Workflow Agent Dashboard</h1>
        <span style={{
          display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
          background: connected ? '#22c55e' : '#ef4444',
          transition: 'background 0.3s'
        }} />
        <span style={{ fontSize: '0.75rem', color: '#666' }}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </header>

      {events.length === 0 && (
        <p style={{ color: '#999' }}>Waiting for events — run a workflow with <code>--dashboard-port {port}</code></p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {events.map((ev, i) => <EventCard key={i} event={ev} />)}
      </div>
      <div ref={bottomRef} />
    </div>
  )
}
