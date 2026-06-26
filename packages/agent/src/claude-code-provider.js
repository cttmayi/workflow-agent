import { spawn } from 'node:child_process'
import { validateSchema } from './schema-validator.js'

export class ClaudeCodeProvider {
  constructor({ commandPath, args: fixedArgs, eventBus } = {}) {
    this.commandPath = commandPath || 'claude'
    this.fixedArgs = fixedArgs || ['--dangerously-skip-permissions', '--bare', '--setting-sources', 'user', '-p']
    this.eventBus = eventBus
  }

  buildCommand(prompt) {
    const args = this.fixedArgs.map(a =>
      a.replace(/\{prompt\}/g, prompt).replace(/\{cwd\}/g, process.cwd())
    )
    return { command: this.commandPath, args }
  }

  async execute({ prompt, schema, signal } = {}) {
    const start = Date.now()
    const finalPrompt = schema ? appendSchema(prompt, schema) : prompt
    const result = await this._spawn(finalPrompt, signal, start)

    if (schema) {
      result.data = parseJSON(result.output)
      validateSchema(result.data, schema)
    }

    return result
  }

  _spawn(prompt, signal, start) {
    const { command, args } = this.buildCommand(prompt)

    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32'
      })

      if (signal) {
        signal.addEventListener('abort', () => {
          proc.kill()
          reject(signal.reason || new Error('aborted'))
        }, { once: true })
      }

      let output = ''
      const logs = []

      proc.stdout.on('data', (chunk) => {
        const lines = chunk.toString()
        output += lines
        logs.push(lines)
        this.eventBus?.emit('agent:log', { line: lines })
      })

      proc.stderr.on('data', (chunk) => {
        logs.push('[stderr] ' + chunk.toString())
      })

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

function parseJSON(raw) {
  try {
    return JSON.parse(raw)
  } catch (e) {
    const extracted = extractJSON(raw)
    if (extracted !== null) return extracted

    throw new Error(
      `output is not valid JSON (${e.message}). ` +
      `Total output length: ${raw.length} chars.` +
      `\n--- BEGIN OUTPUT ---\n${raw}\n--- END OUTPUT ---`
    )
  }
}

function extractJSON(raw) {
  let cleaned = raw.replace(/^[\s\S]*?```(?:json)?\s*\n?/i, '').trim()
  cleaned = cleaned.replace(/```[\s\S]*$/i, '').trim()

  const start = cleaned.indexOf('{')
  if (start === -1) return null

  let depth = 0
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++
    else if (cleaned[i] === '}') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

function appendSchema(prompt, schema) {
  return `${prompt}

Required JSON schema:
${JSON.stringify(schema, null, 2)}

IMPORTANT: Before outputting the final JSON, use the bash tool to validate it with node -e.
If validation fails, fix the JSON and re-validate until it passes.
Output ONLY the final valid JSON, nothing else.`
}
