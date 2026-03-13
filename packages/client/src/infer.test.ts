import { describe, expect, test } from 'bun:test'
import { relations } from 'drizzle-orm'
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

import type { InferEntityDefs } from './infer'

// ─── Compile-time assertion helper ────────────────────────────
// Produces a compile error when T is not exactly `true`.
// Uses a conditional that distributes over union but NOT over `never`,
// thanks to the `[T]` wrapper (non-distributive conditional).
type ExpectTrue<T extends [T] extends [true] ? true : never> = T

// ─── Circular Schema Fixture ──────────────────────────────────
// Mirrors a real-world pattern: asset → override → overrideConnection → asset
// This creates circular relation paths that can cause TS7056 "inferred type
// exceeds maximum length" if InferEntityFilters recurses without depth limits.

const asset = pgTable('asset', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  assetTypeId: uuid()
    .notNull()
    .references(() => assetType.id),
})

const assetType = pgTable('asset_type', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
})

const override = pgTable('override', {
  id: uuid().primaryKey().defaultRandom(),
  assetId: uuid()
    .notNull()
    .references(() => asset.id),
  value: text(),
})

const overrideConnection = pgTable('override_connection', {
  id: uuid().primaryKey().defaultRandom(),
  overrideId: uuid()
    .notNull()
    .references(() => override.id),
  connectedAssetId: uuid()
    .notNull()
    .references(() => asset.id),
})

const assetRelations = relations(asset, ({ one, many }) => ({
  assetType: one(assetType, { fields: [asset.assetTypeId], references: [assetType.id] }),
  overrides: many(override),
}))

const assetTypeRelations = relations(assetType, ({ many }) => ({
  assets: many(asset),
}))

const overrideRelations = relations(override, ({ one, many }) => ({
  asset: one(asset, { fields: [override.assetId], references: [asset.id] }),
  connections: many(overrideConnection),
}))

const overrideConnectionRelations = relations(overrideConnection, ({ one }) => ({
  override: one(override, {
    fields: [overrideConnection.overrideId],
    references: [override.id],
  }),
  connectedAsset: one(asset, {
    fields: [overrideConnection.connectedAssetId],
    references: [asset.id],
  }),
}))

const circularSchema = {
  asset,
  assetType,
  override,
  overrideConnection,
  assetRelations,
  assetTypeRelations,
  overrideRelations,
  overrideConnectionRelations,
}

// ─── Type-level assertions ────────────────────────────────────
// These ensure InferEntityDefs compiles without TS7056 and produces
// correct filter/field types for circular schemas.

type Defs = InferEntityDefs<typeof circularSchema>

// Verify scalar fields are inferred
type _1 = ExpectTrue<Defs['asset']['fields']['name'] extends string ? true : false>
type _2 = ExpectTrue<Defs['override']['fields']['value'] extends string | null ? true : false>

// Verify relation defs are inferred
type _3 = ExpectTrue<
  Defs['asset']['relations']['overrides'] extends { entity: 'override'; type: 'many' }
    ? true
    : false
>

// Verify filter types include scalar filters
type AssetFilters = Defs['asset']['filters']
type _4 = ExpectTrue<AssetFilters extends { name?: { eq?: string | null } } ? true : false>

// Verify filter types include relation filters (default depth > 0)
type _5 = ExpectTrue<
  AssetFilters extends { overrides?: { some?: { assetId?: { eq?: string | null } } } }
    ? true
    : false
>

// ─── Config: table exclusions ─────────────────────────────────

type DefsExcluded = InferEntityDefs<
  typeof circularSchema,
  { tables: { exclude: readonly ['override'] } }
>
type _6 = ExpectTrue<'override' extends keyof DefsExcluded ? false : true>
type _7 = ExpectTrue<'asset' extends keyof DefsExcluded ? true : false>

// ─── Config: limitRelationDepth ───────────────────────────────
// Verify depth from config is respected

type DefsDepth2 = InferEntityDefs<typeof circularSchema, { limitRelationDepth: 2 }>

// At depth 2, override → asset (depth 1) → name should be filterable
type OverrideFiltersD2 = DefsDepth2['override']['filters']
type _8 = ExpectTrue<
  OverrideFiltersD2 extends { asset?: { name?: { eq?: string | null } } } ? true : false
>

// At depth 2, nested relation paths should expand:
// asset → overrides (depth 1) → asset (depth 2, has scalar filters)
type AssetFiltersD2 = DefsDepth2['asset']['filters']
type _9 = ExpectTrue<
  AssetFiltersD2 extends {
    overrides?: { some?: { asset?: { name?: { eq?: string | null } } } }
  }
    ? true
    : false
>

type DefsDepth0 = InferEntityDefs<typeof circularSchema, { limitRelationDepth: 0 }>

// At depth 0, filters should have scalar filters
type AssetFiltersD0 = DefsDepth0['asset']['filters']
type _10 = ExpectTrue<AssetFiltersD0 extends { name?: { eq?: string | null } } ? true : false>

// At depth 0, relation filter fields should NOT be among the type's own keys
type _11 = ExpectTrue<'overrides' extends keyof AssetFiltersD0 ? false : true>

// ─── Runtime tests ────────────────────────────────────────────

describe('InferEntityDefs', () => {
  test('circular schema produces entity defs for all tables', () => {
    // This test primarily validates that the type compiles (TS7056 regression).
    const _check: Defs = {} as Defs
    expect(true).toBe(true)
  })

  test('filter type allows scalar filter operations', () => {
    const filter: AssetFilters = {
      name: { eq: 'test' },
      assetTypeId: { inArray: ['a', 'b'] },
    }
    expect(filter.name?.eq).toBe('test')
  })

  test('filter type allows relation filter operations', () => {
    const filter: AssetFilters = {
      overrides: {
        some: {
          value: { like: '%test%' },
        },
      },
    }
    expect(filter.overrides?.some?.value?.like).toBe('%test%')
  })

  test('filter type allows OR combinator', () => {
    const filter: AssetFilters = {
      OR: [{ name: { eq: 'a' } }, { name: { eq: 'b' } }],
    }
    expect(filter.OR?.length).toBe(2)
  })
})
