import { spawn } from 'node:child_process'

export class ClaudeCodeProvider {
  constructor({ commandPath = 'claude', eventBus } = {}) {
    this.commandPath = commandPath
    this.eventBus = eventBus
  }

  buildCommand(prompt, { interactive }) {
    //if (interactive) {
    //  return { command: this.commandPath, args: [] }
    //}
    return {
      command: this.commandPath,
      args: ['--dangerously-skip-permissions', '--strict-mcp-config', '--tools', '"Read,Write,Bash,Edit,WebFetch,WebSearch"', '-p', prompt]
    }
  }

  execute({ prompt, interactive, schema, signal } = {}) {
    const finalPrompt = schema ? appendSchema(prompt, schema) : prompt
    const { command, args } = this.buildCommand(finalPrompt, { interactive })
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
          const result = { output, exitCode: exitCode || 0, duration, logs }

          if (schema) {
            try {
              result.data = parseJSON(output)
            } catch {
              return reject(new Error(`schema validation failed: output is not valid JSON`))
            }
          }

          resolve(result)
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

function parseJSON(raw) {
  try {
    return JSON.parse(raw)
  } catch {
    // Strip markdown code fences and surrounding text, then extract first JSON object
    const cleaned = raw.replace(/```(?:json)?\s*\n?/gi, '').trim()
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1))
    }
    throw new Error('no JSON object found in output')
  }
}

function appendSchema(prompt, schema) {
  return `${prompt}

Output ONLY valid JSON matching this schema, nothing else:
${JSON.stringify(schema, null, 2)}`
}
