import { describe, expect, test } from 'bun:test'
import type { Column } from 'drizzle-orm'
import { getTableColumns } from 'drizzle-orm'
import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  json,
  pgEnum,
  pgTable,
  real,
  serial,
  smallint,
  smallserial,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import {
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLFloat,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLString,
} from 'graphql'

import { GraphQLJSON } from './scalars'
import { drizzleColumnToGraphQLType } from './type-builder'

// ─── Test Tables ─────────────────────────────────────────────

const statusEnum = pgEnum('status', ['active', 'inactive', 'pending'])

const allTypes = pgTable('all_types', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  label: varchar({ length: 255 }),
  age: integer().notNull(),
  score: smallint(),
  counter: serial(),
  smallCounter: smallserial(),
  rating: real(),
  precise: doublePrecision(),
  active: boolean().notNull(),
  createdAt: timestamp().notNull(),
  metadata: json(),
  bigNum: bigint({ mode: 'bigint' }),
  status: statusEnum(),
  withDefault: text().notNull().default('hello'),
})

const cols = getTableColumns(allTypes)

// ─── Core type mapping ───────────────────────────────────────

describe('core type mapping', () => {
  test('boolean maps to GraphQLBoolean', () => {
    const { type } = drizzleColumnToGraphQLType(cols.active, 'active', 'all_types', true)
    expect(type).toBe(GraphQLBoolean)
  })

  test('text maps to GraphQLString', () => {
    const { type } = drizzleColumnToGraphQLType(cols.label, 'label', 'all_types', true)
    expect(type).toBe(GraphQLString)
  })

  test('date maps to GraphQLString', () => {
    const { type, description } = drizzleColumnToGraphQLType(
      cols.createdAt,
      'createdAt',
      'all_types',
      true,
    )
    expect(type).toBe(GraphQLString)
    expect(description).toBe('Date')
  })

  test('bigint maps to GraphQLString', () => {
    const { type, description } = drizzleColumnToGraphQLType(
      cols.bigNum,
      'bigNum',
      'all_types',
      true,
    )
    expect(type).toBe(GraphQLString)
    expect(description).toBe('BigInt')
  })

  test('json maps to GraphQLJSON', () => {
    const { type, description } = drizzleColumnToGraphQLType(
      cols.metadata,
      'metadata',
      'all_types',
      true,
    )
    expect(type).toBe(GraphQLJSON)
    expect(description).toBe('JSON')
  })
})

// ─── Integer vs Float ────────────────────────────────────────

describe('integer vs float', () => {
  test('PgInteger maps to GraphQLInt', () => {
    const { type } = drizzleColumnToGraphQLType(cols.age, 'age', 'all_types', true)
    expect(type).toBe(GraphQLInt)
  })

  test('PgSmallInt maps to GraphQLInt', () => {
    const { type } = drizzleColumnToGraphQLType(cols.score, 'score', 'all_types', true)
    expect(type).toBe(GraphQLInt)
  })

  test('PgSerial maps to GraphQLInt', () => {
    const { type } = drizzleColumnToGraphQLType(cols.counter, 'counter', 'all_types', true)
    expect(type).toBe(GraphQLInt)
  })

  test('PgSmallSerial maps to GraphQLInt', () => {
    const { type } = drizzleColumnToGraphQLType(
      cols.smallCounter,
      'smallCounter',
      'all_types',
      true,
    )
    expect(type).toBe(GraphQLInt)
  })

  test('PgReal maps to GraphQLFloat', () => {
    const { type } = drizzleColumnToGraphQLType(cols.rating, 'rating', 'all_types', true)
    expect(type).toBe(GraphQLFloat)
  })

  test('PgDoublePrecision maps to GraphQLFloat', () => {
    const { type } = drizzleColumnToGraphQLType(cols.precise, 'precise', 'all_types', true)
    expect(type).toBe(GraphQLFloat)
  })
})

// ─── Enums ───────────────────────────────────────────────────

describe('enums', () => {
  test('generates GraphQLEnumType', () => {
    const { type } = drizzleColumnToGraphQLType(cols.status, 'status', 'all_types', true)
    expect(type).toBeInstanceOf(GraphQLEnumType)
    const enumType = type as GraphQLEnumType
    expect(enumType.name).toBe('All_typesStatusEnum')
    const values = enumType.getValues()
    expect(values.map((v) => v.value)).toEqual(['active', 'inactive', 'pending'])
  })

  test('caches enum across calls', () => {
    const { type: t1 } = drizzleColumnToGraphQLType(cols.status, 'status', 'all_types', true)
    const { type: t2 } = drizzleColumnToGraphQLType(cols.status, 'status', 'all_types', true)
    expect(t1).toBe(t2)
  })
})

// ─── Nullability ─────────────────────────────────────────────

describe('nullability', () => {
  test('notNull column wraps in GraphQLNonNull', () => {
    const { type } = drizzleColumnToGraphQLType(cols.name, 'name', 'all_types')
    expect(type).toBeInstanceOf(GraphQLNonNull)
  })

  test('nullable column returns bare type', () => {
    const { type } = drizzleColumnToGraphQLType(cols.label, 'label', 'all_types')
    expect(type).toBe(GraphQLString)
  })

  test('forceNullable overrides notNull', () => {
    const { type } = drizzleColumnToGraphQLType(cols.name, 'name', 'all_types', true)
    expect(type).toBe(GraphQLString)
  })

  test('defaultIsNullable makes columns with default nullable', () => {
    const { type } = drizzleColumnToGraphQLType(
      cols.withDefault,
      'withDefault',
      'all_types',
      false,
      true,
    )
    expect(type).toBe(GraphQLString)
  })

  test('defaultIsNullable does not affect columns without default', () => {
    const { type } = drizzleColumnToGraphQLType(cols.name, 'name', 'all_types', false, true)
    expect(type).toBeInstanceOf(GraphQLNonNull)
  })
})

// ─── Buffer ──────────────────────────────────────────────────

describe('buffer', () => {
  test('maps to List(NonNull(Int))', () => {
    const fakeCol = { dataType: 'buffer', notNull: false } as Column
    const { type } = drizzleColumnToGraphQLType(fakeCol, 'data', 'buf_test', true)
    expect(type).toBeInstanceOf(GraphQLList)
  })
})

// ─── Unknown type ────────────────────────────────────────────

describe('unknown type', () => {
  test('throws for unimplemented dataType', () => {
    const fakeCol = { dataType: 'xml', notNull: false } as import('drizzle-orm').Column
    expect(() => drizzleColumnToGraphQLType(fakeCol, 'x', 'tbl')).toThrow('Drizzle-GraphQL Error')
  })
})
