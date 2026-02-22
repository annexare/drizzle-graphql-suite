import { describe, expect, test } from 'bun:test'

import {
  buildCountQuery,
  buildDeleteMutation,
  buildInsertMutation,
  buildListQuery,
  buildSingleQuery,
  buildUpdateMutation,
} from './query-builder'
import type { SchemaDescriptor } from './types'

const schema = {
  asset: {
    queryName: 'asset',
    queryListName: 'assets',
    countName: 'assetCount',
    insertName: 'insertIntoAsset',
    insertSingleName: 'insertIntoAssetSingle',
    updateName: 'updateAsset',
    deleteName: 'deleteFromAsset',
    fields: ['id', 'name', 'label', 'assetTypeId'],
    relations: {
      assetType: { entity: 'assetType', type: 'one' },
      attributes: { entity: 'attribute', type: 'many' },
    },
  },
  assetType: {
    queryName: 'assetType',
    queryListName: 'assetTypes',
    countName: 'assetTypeCount',
    insertName: 'insertIntoAssetType',
    insertSingleName: 'insertIntoAssetTypeSingle',
    updateName: 'updateAssetType',
    deleteName: 'deleteFromAssetType',
    fields: ['id', 'name', 'label'],
    relations: {},
  },
  attribute: {
    queryName: 'attribute',
    queryListName: 'attributes',
    countName: 'attributeCount',
    insertName: 'insertIntoAttribute',
    insertSingleName: 'insertIntoAttributeSingle',
    updateName: 'updateAttribute',
    deleteName: 'deleteFromAttribute',
    fields: ['id', 'name', 'assetId'],
    relations: {
      asset: { entity: 'asset', type: 'one' },
    },
  },
} satisfies SchemaDescriptor

describe('buildListQuery', () => {
  test('builds basic list query with scalar fields', () => {
    const result = buildListQuery(
      'asset',
      schema.asset,
      schema,
      { id: true, name: true },
      false,
      false,
      false,
      false,
    )
    expect(result.query).toContain('query AssetsQuery')
    expect(result.query).toContain('assets')
    expect(result.query).toContain('id')
    expect(result.query).toContain('name')
  })

  test('includes where variable declaration', () => {
    const result = buildListQuery(
      'asset',
      schema.asset,
      schema,
      { id: true },
      true,
      false,
      false,
      false,
    )
    expect(result.query).toContain('$where: AssetFilters')
    expect(result.query).toContain('where: $where')
  })

  test('includes limit and offset', () => {
    const result = buildListQuery(
      'asset',
      schema.asset,
      schema,
      { id: true },
      false,
      false,
      true,
      true,
    )
    expect(result.query).toContain('$limit: Int')
    expect(result.query).toContain('$offset: Int')
  })

  test('includes orderBy', () => {
    const result = buildListQuery(
      'asset',
      schema.asset,
      schema,
      { id: true },
      false,
      true,
      false,
      false,
    )
    expect(result.query).toContain('$orderBy: AssetOrderBy')
  })

  test('builds nested relation selection', () => {
    const result = buildListQuery(
      'asset',
      schema.asset,
      schema,
      {
        id: true,
        name: true,
        assetType: { id: true, name: true },
        attributes: { id: true, name: true },
      },
      false,
      false,
      false,
      false,
    )
    expect(result.query).toContain('assetType {')
    expect(result.query).toContain('attributes {')
  })
})

describe('buildSingleQuery', () => {
  test('builds single query', () => {
    const result = buildSingleQuery(
      'asset',
      schema.asset,
      schema,
      { id: true, name: true },
      true,
      false,
      false,
    )
    expect(result.query).toContain('query AssetSingleQuery')
    expect(result.query).toContain('asset(')
    expect(result.query).toContain('$where: AssetFilters')
  })
})

describe('buildCountQuery', () => {
  test('builds count query without where', () => {
    const result = buildCountQuery('asset', schema.asset, false)
    expect(result.query).toContain('query AssetCountQuery')
    expect(result.query).toContain('assetCount')
    expect(result.query).not.toContain('$where')
  })

  test('builds count query with where', () => {
    const result = buildCountQuery('asset', schema.asset, true)
    expect(result.query).toContain('$where: AssetFilters')
    expect(result.query).toContain('where: $where')
  })
})

describe('buildInsertMutation', () => {
  test('builds bulk insert mutation', () => {
    const result = buildInsertMutation('asset', schema.asset, schema, { id: true }, false)
    expect(result.query).toContain('mutation InsertIntoAssetMutation')
    expect(result.query).toContain('[AssetInsertInput!]!')
    expect(result.query).toContain('insertIntoAsset(values: $values)')
  })

  test('builds single insert mutation', () => {
    const result = buildInsertMutation(
      'asset',
      schema.asset,
      schema,
      { id: true, name: true },
      true,
    )
    expect(result.query).toContain('mutation InsertIntoAssetSingleMutation')
    expect(result.query).toContain('AssetInsertInput!')
    expect(result.query).not.toContain('[AssetInsertInput!')
  })
})

describe('buildUpdateMutation', () => {
  test('builds update mutation', () => {
    const result = buildUpdateMutation(
      'asset',
      schema.asset,
      schema,
      { id: true, name: true },
      true,
    )
    expect(result.query).toContain('mutation UpdateAssetMutation')
    expect(result.query).toContain('$set: AssetUpdateInput!')
    expect(result.query).toContain('$where: AssetFilters')
    expect(result.query).toContain('updateAsset(set: $set, where: $where)')
  })
})

describe('buildDeleteMutation', () => {
  test('builds delete mutation with returning', () => {
    const result = buildDeleteMutation('asset', schema.asset, schema, { id: true }, true)
    expect(result.query).toContain('mutation DeleteFromAssetMutation')
    expect(result.query).toContain('$where: AssetFilters')
    expect(result.query).toContain('deleteFromAsset(where: $where)')
    expect(result.query).toContain('id')
  })

  test('builds delete mutation without returning', () => {
    const result = buildDeleteMutation('asset', schema.asset, schema, undefined, true)
    expect(result.query).toContain('deleteFromAsset(where: $where)')
    // No selection set after the operation — just the mutation wrapper braces
    expect(result.query).not.toContain('deleteFromAsset(where: $where) {')
  })
})
