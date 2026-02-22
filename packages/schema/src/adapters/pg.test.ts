import { describe, expect, test } from 'bun:test'
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { PgAdapter } from './pg'

// ─── Chainable mock DB ──────────────────────────────────────

type Call = { method: string; args: unknown[] }

function createChainableMock(resolvedValue: unknown[] = []) {
  const calls: Call[] = []

  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(resolvedValue)
      }
      if (prop === '_calls') return calls
      return (...args: unknown[]) => {
        calls.push({ method: prop as string, args })
        return new Proxy({}, handler)
      }
    },
  }

  return new Proxy({}, handler) as {
    _calls: Call[]
    // biome-ignore lint/suspicious/noExplicitAny: chainable mock
    [key: string]: (...args: any[]) => any
  }
}

function createMockDb(resolvedValue: unknown[] = []) {
  const insertChain = createChainableMock(resolvedValue)
  const updateChain = createChainableMock(resolvedValue)
  const deleteChain = createChainableMock(resolvedValue)

  return {
    db: {
      insert: () => insertChain,
      update: () => updateChain,
      delete: () => deleteChain,
    },
    insertCalls: insertChain._calls,
    updateCalls: updateChain._calls,
    deleteCalls: deleteChain._calls,
  }
}

// ─── Test table ─────────────────────────────────────────────

const testTable = pgTable('test', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
})

// ─── Tests ──────────────────────────────────────────────────

describe('PgAdapter', () => {
  const adapter = new PgAdapter()

  test('supportsReturning is true', () => {
    expect(adapter.supportsReturning).toBe(true)
  })

  test('isTable returns true for PgTable', () => {
    expect(adapter.isTable(testTable)).toBe(true)
  })

  test('isTable returns false for non-table', () => {
    expect(adapter.isTable({})).toBe(false)
    expect(adapter.isTable('not a table')).toBe(false)
    expect(adapter.isTable(null)).toBe(false)
  })

  describe('executeInsert', () => {
    test('calls values and onConflictDoNothing', async () => {
      const { db, insertCalls } = createMockDb([{ id: '1', name: 'test' }])
      // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
      const result = await adapter.executeInsert(db as any, testTable, [{ name: 'test' }])

      expect(result).toEqual([{ id: '1', name: 'test' }])
      expect(insertCalls.some((c) => c.method === 'values')).toBe(true)
      expect(insertCalls.some((c) => c.method === 'onConflictDoNothing')).toBe(true)
    })

    test('calls returning when returningColumns provided', async () => {
      const { db, insertCalls } = createMockDb([{ id: '1' }])
      const returningColumns = { id: testTable.id }
      // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
      await adapter.executeInsert(db as any, testTable, [{ name: 'test' }], returningColumns)

      expect(insertCalls.some((c) => c.method === 'returning')).toBe(true)
    })

    test('does not call returning when no returningColumns', async () => {
      const { db, insertCalls } = createMockDb([])
      // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
      await adapter.executeInsert(db as any, testTable, [{ name: 'test' }])

      expect(insertCalls.some((c) => c.method === 'returning')).toBe(false)
    })
  })

  describe('executeUpdate', () => {
    test('calls set', async () => {
      const { db, updateCalls } = createMockDb([{ id: '1', name: 'updated' }])
      const result = await adapter.executeUpdate(
        // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
        db as any,
        testTable,
        { name: 'updated' },
        undefined,
      )

      expect(result).toEqual([{ id: '1', name: 'updated' }])
      expect(updateCalls.some((c) => c.method === 'set')).toBe(true)
    })

    test('calls where when provided', async () => {
      const { db, updateCalls } = createMockDb([])
      const fakeSql = {} as import('drizzle-orm').SQL
      // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
      await adapter.executeUpdate(db as any, testTable, { name: 'x' }, fakeSql)

      expect(updateCalls.some((c) => c.method === 'where')).toBe(true)
    })

    test('does not call where when undefined', async () => {
      const { db, updateCalls } = createMockDb([])
      // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
      await adapter.executeUpdate(db as any, testTable, { name: 'x' }, undefined)

      expect(updateCalls.some((c) => c.method === 'where')).toBe(false)
    })

    test('calls returning when returningColumns provided', async () => {
      const { db, updateCalls } = createMockDb([])
      const returningColumns = { id: testTable.id }
      // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
      await adapter.executeUpdate(db as any, testTable, { name: 'x' }, undefined, returningColumns)

      expect(updateCalls.some((c) => c.method === 'returning')).toBe(true)
    })
  })

  describe('executeDelete', () => {
    test('executes delete', async () => {
      const { db, deleteCalls } = createMockDb([{ id: '1' }])
      // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
      const result = await adapter.executeDelete(db as any, testTable, undefined)

      expect(result).toEqual([{ id: '1' }])
      expect(deleteCalls).toBeDefined()
    })

    test('calls where when provided', async () => {
      const { db, deleteCalls } = createMockDb([])
      const fakeSql = {} as import('drizzle-orm').SQL
      // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
      await adapter.executeDelete(db as any, testTable, fakeSql)

      expect(deleteCalls.some((c) => c.method === 'where')).toBe(true)
    })

    test('does not call where when undefined', async () => {
      const { db, deleteCalls } = createMockDb([])
      // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
      await adapter.executeDelete(db as any, testTable, undefined)

      expect(deleteCalls.some((c) => c.method === 'where')).toBe(false)
    })

    test('calls returning when returningColumns provided', async () => {
      const { db, deleteCalls } = createMockDb([])
      const returningColumns = { id: testTable.id }
      // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
      await adapter.executeDelete(db as any, testTable, undefined, returningColumns)

      expect(deleteCalls.some((c) => c.method === 'returning')).toBe(true)
    })
  })
})
