import http from 'node:http'
import fs from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
}

export async function createServer({ port = 3456, eventBus } = {}) {
  const clients = new Set()
  const distDir = join(__dirname, '..', 'client', 'dist')

  function broadcast(event, data) {
    for (const client of clients) {
      client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`)
    const path = url.pathname

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')

    // SSE endpoint
    if (path === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      })
      const client = { id: Date.now(), res }
      clients.add(client)
      req.on('close', () => clients.delete(client))
      return
    }

    // API - list workflows
    if (path === '/api/workflows') {
      res.writeHead(200, MIME['.json'])
      res.end(JSON.stringify({ workflows: [] }))
      return
    }

    // Serve static files from client/dist
    const filePath = path === '/' ? join(distDir, 'index.html') : join(distDir, path)
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = extname(filePath)
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        res.end(fs.readFileSync(filePath))
        return
      }
    } catch {}

    // Fallback to SPA: serve index.html for non-file routes
    try {
      const index = join(distDir, 'index.html')
      if (fs.existsSync(index)) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(fs.readFileSync(index))
        return
      }
    } catch {}

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`<!DOCTYPE html>
<html><head><title>Workflow Agent Dashboard</title></head>
<body>
  <h1>Workflow Agent Dashboard</h1>
  <p>Dev mode — build the React client with <code>npm run build</code> in packages/dashboard/client</p>
  <div id="root"></div>
  <script>
    const evtSource = new EventSource('/events')
    evtSource.addEventListener('message', e => console.log('SSE:', e.data))
  </script>
</body></html>`)
  })

  if (eventBus) {
    eventBus.on('phase:change', d => broadcast('phase:change', d))
    eventBus.on('agent:start', d => broadcast('agent:start', d))
    eventBus.on('agent:log', d => broadcast('agent:log', d))
    eventBus.on('agent:complete', d => broadcast('agent:complete', d))
    eventBus.on('workflow:start', d => broadcast('workflow:start', d))
    eventBus.on('workflow:complete', d => broadcast('workflow:complete', d))
  }

  return new Promise(resolve => {
    server.listen(port, () => {
      resolve({ server, broadcast, port })
    })
  })
}
