export function validateSchema(data, schema) {
  if (!schema || typeof schema !== 'object') return

  const errors = _validate(data, schema, '')
  if (errors.length > 0) {
    throw new Error(`schema validation failed:\n${errors.join('\n')}`)
  }
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

function _validate(data, schema, path) {
  const errors = []

  // --- type check ---
  if (schema.type) {
    const actual = typeOf(data)
    if (actual !== schema.type) {
      errors.push(`  ${path || '(root)'}: expected ${schema.type}, got ${actual}`)
      return errors
    }
  }

  // --- array items ---
  if (schema.type === 'array' && schema.items && Array.isArray(data)) {
    data.forEach((item, i) => {
      errors.push(..._validate(item, schema.items, `${path}[${i}]`))
    })
  }

  // --- object properties ---
  if (schema.type === 'object' && data && typeof data === 'object' && !Array.isArray(data)) {
    // required
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in data)) {
          errors.push(`  ${path ? path + '.' : ''}${key}: required but missing`)
        }
      }
    }

    // property types
    if (schema.properties && typeof schema.properties === 'object') {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in data) {
          errors.push(..._validate(data[key], propSchema, path ? `${path}.${key}` : key))
        }
      }
    }

    // additional properties (validate all keys that don't have an explicit property definition)
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
      for (const key of Object.keys(data)) {
        if (!schema.properties || !(key in schema.properties)) {
          errors.push(..._validate(data[key], schema.additionalProperties, path ? `${path}.${key}` : key))
        }
      }
    }
  }

  // --- enum ---
  if ('enum' in schema && Array.isArray(schema.enum)) {
    if (!schema.enum.includes(data)) {
      errors.push(`  ${path || '(root)'}: expected one of [${schema.enum.join(', ')}], got ${JSON.stringify(data)}`)
    }
  }

  // --- oneOf ---
  if (Array.isArray(schema.oneOf)) {
    const matchIndex = schema.oneOf.findIndex(s => _validate(data, s, path).length === 0)
    if (matchIndex === -1) {
      errors.push(`  ${path || '(root)'}: must match exactly one of the schemas in oneOf`)
    }
  }

  return errors
}
