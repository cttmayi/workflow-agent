import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateSchema } from '../src/schema-validator.js'

describe('validateSchema', () => {
  it('accepts valid data matching schema', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' }
      },
      required: ['name']
    }
    validateSchema({ name: 'Alice', age: 30 }, schema)
    // no throw
  })

  it('accepts data with only required fields', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' }
      },
      required: ['name']
    }
    validateSchema({ name: 'Alice' }, schema)
  })

  it('rejects missing required field', () => {
    const schema = {
      type: 'object',
      properties: {
        isApproved: { type: 'boolean' },
        feedback: { type: 'string' }
      },
      required: ['isApproved', 'feedback']
    }
    assert.throws(
      () => validateSchema({ isApproved: true }, schema),
      /required but missing/
    )
  })

  it('rejects wrong type', () => {
    const schema = {
      type: 'object',
      properties: {
        isApproved: { type: 'boolean' }
      }
    }
    assert.throws(
      () => validateSchema({ isApproved: 'yes' }, schema),
      /expected boolean, got string/
    )
  })

  it('validates nested objects', () => {
    const schema = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            name: { type: 'string' }
          },
          required: ['name']
        }
      },
      required: ['user']
    }
    assert.throws(
      () => validateSchema({ user: {} }, schema),
      /user\.name: required but missing/
    )
  })

  it('validates enum', () => {
    const schema = {
      type: 'object',
      properties: {
        status: { enum: ['active', 'inactive'] }
      }
    }
    validateSchema({ status: 'active' }, schema)
    assert.throws(
      () => validateSchema({ status: 'banned' }, schema),
      /expected one of/
    )
  })

  it('validates array items', () => {
    const schema = {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    }
    validateSchema({ tags: ['a', 'b'] }, schema)
    assert.throws(
      () => validateSchema({ tags: ['a', 1] }, schema),
      /expected string, got number/
    )
  })

  it('validates oneOf', () => {
    const schema = {
      type: 'object',
      properties: {
        value: {
          oneOf: [
            { type: 'string' },
            { type: 'number' }
          ]
        }
      }
    }
    validateSchema({ value: 'hello' }, schema)
    validateSchema({ value: 42 }, schema)
    assert.throws(
      () => validateSchema({ value: true }, schema),
      /must match exactly one/
    )
  })

  it('validates flat schema (non-object)', () => {
    const schema = { type: 'string', enum: ['a', 'b'] }
    validateSchema('a', schema)
    assert.throws(() => validateSchema('c', schema), /expected one of/)
  })

  it('rejects wrong type at root level', () => {
    const schema = { type: 'boolean' }
    assert.throws(() => validateSchema('true', schema), /expected boolean, got string/)
  })

  it('handles no schema gracefully', () => {
    validateSchema({ name: 'Alice' }, null)
    validateSchema({ name: 'Alice' }, undefined)
  })

  it('validates additionalProperties', () => {
    const schema = {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: { type: 'string' }
      }
    }
    validateSchema({ tags: ['a', 'b'], names: ['x'] }, schema)
    assert.throws(
      () => validateSchema({ tags: ['a', 1] }, schema),
      /expected string, got number/
    )
  })

  it('validates items via additionalProperties', () => {
    const schema = {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: {
          type: 'object',
          required: ['title', 'link'],
          properties: {
            title: { type: 'string' },
            link: { type: 'string' }
          }
        }
      }
    }
    validateSchema({ news: [{ title: 'A', link: 'http://a' }] }, schema)
    assert.throws(
      () => validateSchema({ news: [{ title: 'A' }] }, schema),
      /link: required but missing/
    )
  })
})
