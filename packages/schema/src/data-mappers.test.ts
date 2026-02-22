import { describe, expect, test } from 'bun:test'
import { getTableColumns } from 'drizzle-orm'
import {
  bigint,
  boolean,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { GraphQLError } from 'graphql'

import {
  remapFromGraphQLCore,
  remapFromGraphQLSingleInput,
  remapToGraphQLArrayOutput,
  remapToGraphQLCore,
  remapToGraphQLSingleOutput,
} from './data-mappers'

// ─── Helper: minimal column-like object ─────────────────────

const makeCol = (dataType: string, columnType = '') =>
  ({ dataType, columnType }) as import('drizzle-orm').Column

// ─── Table for remapFromGraphQL tests ───────────────────────

const testTable = pgTable('test', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  bio: varchar({ length: 255 }),
  age: integer(),
  createdAt: timestamp().notNull(),
  data: json(),
  score: bigint({ mode: 'bigint' }),
  active: boolean(),
})

const cols = getTableColumns(testTable)

// ─── remapToGraphQLCore ─────────────────────────────────────

describe('remapToGraphQLCore', () => {
  test('converts Date to ISO string', () => {
    const d = new Date('2024-01-15T10:30:00Z')
    const result = remapToGraphQLCore('createdAt', d, 'test', makeCol('date'))
    expect(result).toBe(d.toISOString())
  })

  test('converts Buffer to number array', () => {
    const buf = Buffer.from([1, 2, 3])
    const result = remapToGraphQLCore('data', buf, 'test', makeCol('buffer'))
    expect(result).toEqual([1, 2, 3])
  })

  test('converts BigInt to string', () => {
    const result = remapToGraphQLCore('score', BigInt(123456789), 'test', makeCol('bigint'))
    expect(result).toBe('123456789')
  })

  test('passes primitive values through', () => {
    expect(remapToGraphQLCore('name', 'hello', 'test', makeCol('string'))).toBe('hello')
    expect(remapToGraphQLCore('age', 42, 'test', makeCol('number'))).toBe(42)
    expect(remapToGraphQLCore('active', true, 'test', makeCol('boolean'))).toBe(true)
  })

  test('JSON.stringifies non-json objects', () => {
    const obj = { foo: 'bar' }
    const result = remapToGraphQLCore('data', obj, 'test', makeCol('string'))
    expect(result).toBe(JSON.stringify(obj))
  })

  test('passes json dataType objects through', () => {
    const obj = { foo: 'bar' }
    const result = remapToGraphQLCore('data', obj, 'test', makeCol('json'))
    expect(result).toBe(obj)
  })

  test('maps arrays of primitives', () => {
    const result = remapToGraphQLCore('data', [BigInt(1), BigInt(2)], 'test', makeCol('bigint'))
    expect(result).toEqual(['1', '2'])
  })

  test('passes PgGeometry arrays through', () => {
    const val = [1.0, 2.0]
    const result = remapToGraphQLCore('geo', val, 'test', makeCol('array', 'PgGeometry'))
    expect(result).toBe(val)
  })

  test('passes PgVector arrays through', () => {
    const val = [0.1, 0.2, 0.3]
    const result = remapToGraphQLCore('vec', val, 'test', makeCol('array', 'PgVector'))
    expect(result).toBe(val)
  })

  test('passes PgGeometryObject through', () => {
    const val = { x: 1, y: 2 }
    const result = remapToGraphQLCore('geo', val, 'test', makeCol('json', 'PgGeometryObject'))
    expect(result).toBe(val)
  })
})

// ─── remapToGraphQLSingleOutput ─────────────────────────────

describe('remapToGraphQLSingleOutput', () => {
  test('deletes null and undefined entries', () => {
    const output = { id: '1', name: null, bio: undefined, age: 42 }
    // biome-ignore lint/suspicious/noExplicitAny: mock data for testing
    remapToGraphQLSingleOutput(output as any, 'test', testTable)
    expect(output).toEqual({ id: '1', age: 42 })
  })
})

// ─── remapToGraphQLArrayOutput ──────────────────────────────

describe('remapToGraphQLArrayOutput', () => {
  test('processes each entry', () => {
    const output = [
      { id: '1', name: null },
      { id: '2', bio: undefined },
    ]
    // biome-ignore lint/suspicious/noExplicitAny: mock data for testing
    remapToGraphQLArrayOutput(output as any, 'test', testTable)
    expect(output).toEqual([{ id: '1' }, { id: '2' }])
  })
})

// ─── remapFromGraphQLCore ───────────────────────────────────

describe('remapFromGraphQLCore', () => {
  test('parses valid date string', () => {
    const result = remapFromGraphQLCore('2024-01-15T10:30:00Z', cols.createdAt, 'createdAt')
    expect(result).toBeInstanceOf(Date)
    expect((result as Date).toISOString()).toBe('2024-01-15T10:30:00.000Z')
  })

  test('throws GraphQLError for invalid date', () => {
    expect(() => remapFromGraphQLCore('not-a-date', cols.createdAt, 'createdAt')).toThrow(
      GraphQLError,
    )
  })

  test('converts valid array to Buffer', () => {
    const col = makeCol('buffer')
    const result = remapFromGraphQLCore([1, 2, 3], col, 'buf')
    expect(result).toBeInstanceOf(Buffer)
    expect(Array.from(result as Buffer)).toEqual([1, 2, 3])
  })

  test('throws for non-array buffer input', () => {
    const col = makeCol('buffer')
    expect(() => remapFromGraphQLCore('not-array', col, 'buf')).toThrow(GraphQLError)
  })

  test('converts valid bigint string', () => {
    const result = remapFromGraphQLCore('123456789', cols.score, 'score')
    expect(result).toBe(BigInt(123456789))
  })

  test('throws for invalid bigint', () => {
    expect(() => remapFromGraphQLCore('not-bigint', cols.score, 'score')).toThrow(GraphQLError)
  })

  test('validates array type for array dataType', () => {
    const col = makeCol('array', 'PgGeometry')
    expect(() => remapFromGraphQLCore('not-array', col, 'geo')).toThrow(GraphQLError)
  })

  test('validates PgGeometry array length', () => {
    const col = makeCol('array', 'PgGeometry')
    expect(() => remapFromGraphQLCore([1, 2, 3], col, 'geo')).toThrow(GraphQLError)
    expect(remapFromGraphQLCore([1, 2], col, 'geo')).toEqual([1, 2])
  })

  test('passes default dataType values through', () => {
    expect(remapFromGraphQLCore('hello', cols.name, 'name')).toBe('hello')
    expect(remapFromGraphQLCore(42, cols.age, 'age')).toBe(42)
  })

  test('passes json values through', () => {
    const val = { key: 'value' }
    expect(remapFromGraphQLCore(val, cols.data, 'data')).toBe(val)
  })
})

// ─── remapFromGraphQLSingleInput ────────────────────────────

describe('remapFromGraphQLSingleInput', () => {
  test('strips undefined values', () => {
    const input = { id: '1', name: undefined }
    // biome-ignore lint/suspicious/noExplicitAny: mock input for testing
    remapFromGraphQLSingleInput(input as any, testTable)
    expect(input).toEqual({ id: '1' })
  })

  test('throws for unknown column', () => {
    const input = { unknownCol: 'value' }
    expect(() => remapFromGraphQLSingleInput(input, testTable)).toThrow(GraphQLError)
  })

  test('skips null for notNull columns', () => {
    const input = { name: null, id: '1' }
    // biome-ignore lint/suspicious/noExplicitAny: mock input for testing
    remapFromGraphQLSingleInput(input as any, testTable)
    expect(input).toEqual({ id: '1' })
  })

  test('keeps null for nullable columns', () => {
    const input = { bio: null, id: '1' }
    // biome-ignore lint/suspicious/noExplicitAny: mock input for testing
    remapFromGraphQLSingleInput(input as any, testTable)
    expect('bio' in input).toBe(true)
  })
})
