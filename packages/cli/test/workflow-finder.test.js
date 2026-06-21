import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createWorkflowFinder } from '../src/workflow-finder.js'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('workflow-finder', () => {
  let tmpDir, projectDir, globalDir
  const builtInDir = join(__dirname, '..', 'workflows')

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'waf-test-'))
    projectDir = join(tmpDir, 'project')
    globalDir = join(tmpDir, 'global')
    mkdirSync(join(projectDir, '.workflow-agent', 'workflow'), { recursive: true })
    mkdirSync(join(globalDir, '.workflow-agent', 'workflow'), { recursive: true })
  })

  after(() => rmSync(tmpDir, { recursive: true }))

  it('finds workflow in project dir with highest priority', () => {
    writeFileSync(join(projectDir, '.workflow-agent', 'workflow', 'test.js'), 'export const meta = { name: "test" }')
    const finder = createWorkflowFinder({ cwd: projectDir, globalHome: globalDir, builtInDir })
    const found = finder.find('test')
    assert.equal(found.path, join(projectDir, '.workflow-agent', 'workflow', 'test.js'))
    assert.equal(found.source, 'project')
  })

  it('falls back to global dir', () => {
    writeFileSync(join(globalDir, '.workflow-agent', 'workflow', 'global.js'), 'export const meta = { name: "global" }')
    const finder = createWorkflowFinder({ cwd: projectDir, globalHome: globalDir, builtInDir })
    const found = finder.find('global')
    assert.equal(found.source, 'global')
  })

  it('returns null for unknown workflow', () => {
    const finder = createWorkflowFinder({ cwd: projectDir, globalHome: globalDir, builtInDir })
    assert.equal(finder.find('nonexistent'), null)
  })

  it('lists all workflows from all sources', () => {
    const finder = createWorkflowFinder({ cwd: projectDir, globalHome: globalDir, builtInDir })
    const all = finder.listAll()
    assert.ok(all.length >= 1)
    assert.ok(all.some(w => w.name === 'test'))
    assert.ok(all.some(w => w.name === 'global'))
  })
})
