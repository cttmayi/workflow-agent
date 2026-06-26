import { spawn } from 'node:child_process'
import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { validateSchema } from './schema-validator.js'

export class CodexProvider {
  constructor({ commandPath, args: fixedArgs, eventBus } = {}) {
    this.commandPath = commandPath || 'codex'
    this.fixedArgs = fixedArgs || ['exec', '--full-auto']
    this.eventBus = eventBus
  }

  buildCommand(prompt, outputPath) {
    const args = this.fixedArgs.map(a =>
      a.replace(/\{prompt\}/g, prompt)
       .replace(/\{cwd\}/g, process.cwd())
       .replace(/\{output\}/g, outputPath || '')
    )
    return { command: this.commandPath, args }
  }

  async execute({ prompt, schema, signal } = {}) {
    const start = Date.now()
    const outputPath = schema
      ? join(tmpdir(), 'wa-' + process.pid + '-' + Date.now() + '-' + randomBytes(4).toString('hex') + '.json')
      : null

    try {
      const finalPrompt = schema ? appendSchema(prompt, schema, outputPath) : prompt
      const result = await this._spawn(finalPrompt, signal, start, outputPath)

      if (schema) {
        result.data = readOutput(result.output, outputPath)
        validateSchema(result.data, schema)
      }

      return result
    } finally {
      if (outputPath && existsSync(outputPath)) {
        try { unlinkSync(outputPath) } catch {}
      }
    }
  }

  _spawn(prompt, signal, start, outputPath) {
    const { command, args } = this.buildCommand(prompt, outputPath)

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
          reject(new Error(`codex exited with code ${exitCode}`))
        }
      })

      proc.on('error', (err) => {
        reject(err)
      })
    })
  }
}

function readOutput(stdout, filePath) {
  if (filePath && existsSync(filePath)) {
    try {
      const content = readFileSync(filePath, 'utf-8')
      return JSON.parse(content)
    } catch {}
  }
  return parseJSON(stdout)
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

function appendSchema(prompt, schema, outputPath) {
  return `${prompt}

Required JSON schema:
${JSON.stringify(schema, null, 2)}

Write the JSON to ${outputPath} using the bash tool (cat + heredoc).
Then validate with: node -e "JSON.parse(require('fs').readFileSync('${outputPath}','utf8'))"
If validation fails, fix the file and re-validate.
Once valid, output nothing except "DONE".`
}
