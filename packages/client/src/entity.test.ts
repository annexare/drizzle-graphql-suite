import { describe, expect, mock, test } from 'bun:test'

import { createEntityClient } from './entity'
import type { EntityDescriptor, SchemaDescriptor } from './types'

// ─── Fixtures ────────────────────────────────────────────────

const assetDef: EntityDescriptor = {
  queryName: 'asset',
  queryListName: 'assets',
  countName: 'assetCount',
  insertName: 'insertIntoAsset',
  insertSingleName: 'insertIntoAssetSingle',
  updateName: 'updateAsset',
  deleteName: 'deleteFromAsset',
  fields: ['id', 'name', 'label'],
  relations: {
    assetType: { entity: 'assetType', type: 'one' },
  },
}

const schema: SchemaDescriptor = {
  asset: assetDef,
  assetType: {
    queryName: 'assetType',
    queryListName: 'assetTypes',
    countName: 'assetTypeCount',
    insertName: 'insertIntoAssetType',
    insertSingleName: 'insertIntoAssetTypeSingle',
    updateName: 'updateAssetType',
    deleteName: 'deleteFromAssetType',
    fields: ['id', 'name'],
    relations: {},
  },
}

function createClient() {
  const executeMock =
    mock<(query: string, variables: Record<string, unknown>) => Promise<Record<string, unknown>>>()
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  const client = createEntityClient<any, any>('asset', assetDef, schema, executeMock)
  return { client, executeMock }
}

// ─── query ───────────────────────────────────────────────────

describe('query', () => {
  test('passes variables and returns data[queryListName]', async () => {
    const { client, executeMock } = createClient()
    const rows = [{ id: '1', name: 'Test' }]
    executeMock.mockResolvedValueOnce({ assets: rows })

    const result = await client.query({
      select: { id: true, name: true },
      where: { name: { eq: 'Test' } },
      limit: 10,
      offset: 5,
      orderBy: { name: 'asc' },
    })

    expect(result).toEqual(rows)
    expect(executeMock).toHaveBeenCalledTimes(1)
    const [, variables] = executeMock.mock.calls[0]
    expect(variables.where).toEqual({ name: { eq: 'Test' } })
    expect(variables.limit).toBe(10)
    expect(variables.offset).toBe(5)
    expect(variables.orderBy).toEqual({ name: 'asc' })
  })

  test('omits undefined optional variables', async () => {
    const { client, executeMock } = createClient()
    executeMock.mockResolvedValueOnce({ assets: [] })

    await client.query({ select: { id: true } })

    const [, variables] = executeMock.mock.calls[0]
    expect('where' in variables).toBe(false)
    expect('limit' in variables).toBe(false)
    expect('offset' in variables).toBe(false)
    expect('orderBy' in variables).toBe(false)
  })
})

// ─── querySingle ─────────────────────────────────────────────

describe('querySingle', () => {
  test('returns data[queryName]', async () => {
    const { client, executeMock } = createClient()
    const row = { id: '1', name: 'Test' }
    executeMock.mockResolvedValueOnce({ asset: row })

    const result = await client.querySingle({
      select: { id: true, name: true },
    })
    expect(result).toEqual(row)
  })

  test('returns null when data is undefined', async () => {
    const { client, executeMock } = createClient()
    executeMock.mockResolvedValueOnce({})

    const result = await client.querySingle({ select: { id: true } })
    expect(result).toBeNull()
  })
})

// ─── count ───────────────────────────────────────────────────

describe('count', () => {
  test('returns data[countName] as number', async () => {
    const { client, executeMock } = createClient()
    executeMock.mockResolvedValueOnce({ assetCount: 42 })

    const result = await client.count()
    expect(result).toBe(42)
  })

  test('passes where variable when provided', async () => {
    const { client, executeMock } = createClient()
    executeMock.mockResolvedValueOnce({ assetCount: 5 })

    await client.count({ where: { name: { eq: 'Test' } } })

    const [, variables] = executeMock.mock.calls[0]
    expect(variables.where).toEqual({ name: { eq: 'Test' } })
  })
})

// ─── insert ──────────────────────────────────────────────────

describe('insert', () => {
  test('passes values and returns data[insertName]', async () => {
    const { client, executeMock } = createClient()
    const inserted = [{ id: '1', name: 'New' }]
    executeMock.mockResolvedValueOnce({ insertIntoAsset: inserted })

    const result = await client.insert({
      values: [{ name: 'New' }],
      returning: { id: true, name: true },
    })
    expect(result).toEqual(inserted)

    const [, variables] = executeMock.mock.calls[0]
    expect(variables.values).toEqual([{ name: 'New' }])
  })
})

// ─── insertSingle ────────────────────────────────────────────

describe('insertSingle', () => {
  test('returns data[insertSingleName]', async () => {
    const { client, executeMock } = createClient()
    const row = { id: '1', name: 'New' }
    executeMock.mockResolvedValueOnce({ insertIntoAssetSingle: row })

    const result = await client.insertSingle({
      values: { name: 'New' },
      returning: { id: true, name: true },
    })
    expect(result).toEqual(row)
  })

  test('returns null when data is undefined', async () => {
    const { client, executeMock } = createClient()
    executeMock.mockResolvedValueOnce({})

    const result = await client.insertSingle({
      values: { name: 'New' },
    })
    expect(result).toBeNull()
  })
})

// ─── update ──────────────────────────────────────────────────

describe('update', () => {
  test('passes set and where', async () => {
    const { client, executeMock } = createClient()
    executeMock.mockResolvedValueOnce({ updateAsset: [{ id: '1' }] })

    await client.update({
      set: { name: 'Updated' },
      where: { id: { eq: '1' } },
      returning: { id: true },
    })

    const [, variables] = executeMock.mock.calls[0]
    expect(variables.set).toEqual({ name: 'Updated' })
    expect(variables.where).toEqual({ id: { eq: '1' } })
  })
})

// ─── delete ──────────────────────────────────────────────────

describe('delete', () => {
  test('passes where and returns data[deleteName]', async () => {
    const { client, executeMock } = createClient()
    executeMock.mockResolvedValueOnce({ deleteFromAsset: [{ id: '1' }] })

    const result = await client.delete({
      where: { id: { eq: '1' } },
      returning: { id: true },
    })
    expect(result).toEqual([{ id: '1' }])
  })

  test('omits where when not provided', async () => {
    const { client, executeMock } = createClient()
    executeMock.mockResolvedValueOnce({ deleteFromAsset: [] })

    await client.delete({ returning: { id: true } })

    const [, variables] = executeMock.mock.calls[0]
    expect('where' in variables).toBe(false)
  })
})
