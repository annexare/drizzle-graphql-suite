import { describe, expect, test } from 'bun:test'
import { relations } from 'drizzle-orm'
import { json, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { generateEntityDefs, generateSDL, generateTypes } from './codegen'
import { buildSchemaFromDrizzle } from './index'

// ─── Test Schema ───────────────────────────────────────────

const assetType = pgTable('assetType', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  label: text(),
  order: smallint().default(-1),
  updatedAt: timestamp({ mode: 'date' }).$onUpdateFn(() => new Date()),
})

const asset = pgTable('asset', {
  id: uuid().primaryKey().defaultRandom(),
  assetTypeId: uuid()
    .notNull()
    .references(() => assetType.id),
  name: text().notNull(),
  label: text(),
  value: json(),
  updatedAt: timestamp({ mode: 'date' }).$onUpdateFn(() => new Date()),
})

const attribute = pgTable('attribute', {
  id: uuid().primaryKey().defaultRandom(),
  assetId: uuid()
    .notNull()
    .references(() => asset.id),
  name: text().notNull(),
  default: json(),
  updatedAt: timestamp({ mode: 'date' }).$onUpdateFn(() => new Date()),
})

const assetTypeRelations = relations(assetType, ({ many }) => ({
  assets: many(asset),
}))

const assetRelations = relations(asset, ({ one, many }) => ({
  assetType: one(assetType, { fields: [asset.assetTypeId], references: [assetType.id] }),
  attributes: many(attribute),
}))

const attributeRelations = relations(attribute, ({ one }) => ({
  asset: one(asset, { fields: [attribute.assetId], references: [asset.id] }),
}))

const testSchema = {
  assetType,
  asset,
  attribute,
  assetTypeRelations,
  assetRelations,
  attributeRelations,
}

// ─── Build the GraphQL schema ──────────────────────────────

const { schema } = buildSchemaFromDrizzle(testSchema, {
  suffixes: { list: 's', single: '' },
  limitRelationDepth: 3,
  limitSelfRelationDepth: 1,
})

// ─── Tests ─────────────────────────────────────────────────

describe('generateSDL', () => {
  test('produces non-empty SDL', () => {
    const sdl = generateSDL(schema)
    expect(sdl).toBeString()
    expect(sdl.length).toBeGreaterThan(100)
    expect(sdl).toContain('type Query')
  })
})

describe('generateTypes', () => {
  test('produces TypeScript code with wire format types', () => {
    const code = generateTypes(schema, {
      drizzle: { importPath: './drizzle-schema' },
    })
    expect(code).toContain('AssetWire')
    expect(code).toContain('AssetTypeWire')
    expect(code).toContain('AttributeWire')
  })

  test('generates filter types', () => {
    const code = generateTypes(schema)
    expect(code).toContain('AssetFilters')
    expect(code).toContain('eq?:')
    expect(code).toContain('ilike?:')
  })

  test('generates insert input types', () => {
    const code = generateTypes(schema)
    expect(code).toContain('AssetInsertInput')
    expect(code).toContain('AssetTypeInsertInput')
  })

  test('generates update input types', () => {
    const code = generateTypes(schema)
    expect(code).toContain('AssetUpdateInput')
  })

  test('generates orderBy types', () => {
    const code = generateTypes(schema)
    expect(code).toContain('AssetOrderBy')
    expect(code).toContain("direction: 'asc' | 'desc'")
  })

  test('generates Drizzle imports when importPath configured', () => {
    const code = generateTypes(schema, {
      drizzle: { importPath: '@ir/core/db/schema' },
    })
    expect(code).toContain("from '@ir/core/db/schema'")
    expect(code).toContain('DrizzleAsset')
  })

  test('respects typeNames overrides for Drizzle imports', () => {
    const code = generateTypes(schema, {
      drizzle: {
        importPath: '@ir/core/db/schema',
        typeNames: { asset: 'MyAsset' },
      },
    })
    expect(code).toContain('DrizzleMyAsset')
  })
})

describe('generateEntityDefs', () => {
  test('produces schema object with entity definitions', () => {
    const code = generateEntityDefs(schema)
    expect(code).toContain('export const schema = {')
    expect(code).toContain('asset: {')
    expect(code).toContain('assetType: {')
    expect(code).toContain('attribute: {')
  })

  test('includes operation names', () => {
    const code = generateEntityDefs(schema)
    expect(code).toContain("queryListName: 'assets'")
    expect(code).toContain("queryName: 'asset'")
    expect(code).toContain("countName: 'assetCount'")
    expect(code).toContain("insertName: 'insertIntoAsset'")
    expect(code).toContain("updateName: 'updateAsset'")
    expect(code).toContain("deleteName: 'deleteFromAsset'")
  })

  test('includes scalar field names', () => {
    const code = generateEntityDefs(schema)
    expect(code).toContain("'id'")
    expect(code).toContain("'name'")
  })

  test('includes relation definitions', () => {
    const code = generateEntityDefs(schema)
    expect(code).toContain("assetType: { entity: 'assetType', type: 'one' }")
    expect(code).toContain("attributes: { entity: 'attribute', type: 'many' }")
  })

  test('produces EntityDefs type', () => {
    const code = generateEntityDefs(schema)
    expect(code).toContain('export type EntityDefs = {')
    expect(code).toContain('fields: AssetWire')
    expect(code).toContain('filters: AssetFilters')
  })

  test('produces TableNameMap type', () => {
    const code = generateEntityDefs(schema)
    expect(code).toContain('export type TableNameMap = {')
  })

  test('imports types from ./types', () => {
    const code = generateEntityDefs(schema)
    expect(code).toContain("from './types'")
  })
})

describe('pruned relations', () => {
  test('pruned-false relations are excluded from entity defs', () => {
    const { schema: prunedSchema } = buildSchemaFromDrizzle(testSchema, {
      suffixes: { list: 's', single: '' },
      limitRelationDepth: 3,
      pruneRelations: {
        'assetType.assets': false,
      },
    })

    const code = generateEntityDefs(prunedSchema)
    // assetType should NOT have 'assets' relation
    expect(code).not.toContain("assets: { entity: 'asset', type: 'many' }")
    // But asset should still have assetType relation
    expect(code).toContain("assetType: { entity: 'assetType', type: 'one' }")
  })
})
