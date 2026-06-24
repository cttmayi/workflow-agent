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
    const config = loadConfig(join(tmpDir, 'project'), { globalHome: tmpDir })
    assert.equal(config.defaultProvider, 'claude-code')
    assert.equal(config.timeout, 300000)
    assert.equal(config.maxParallel, 4)
  })

  it('loads global config and merges with defaults', () => {
    writeFileSync(join(globalDir, 'config.yaml'), 'timeout: 60000\n')
    const config = loadConfig(join(tmpDir, 'project'), { globalHome: tmpDir })
    assert.equal(config.defaultProvider, 'claude-code')
    assert.equal(config.timeout, 60000)
  })

  it('project config overrides global config', () => {
    writeFileSync(join(projectDir, 'config.yaml'), 'maxParallel: 8\n')
    const config = loadConfig(join(tmpDir, 'project'), { globalHome: tmpDir })
    assert.equal(config.timeout, 60000)
    assert.equal(config.maxParallel, 8)
  })
})
