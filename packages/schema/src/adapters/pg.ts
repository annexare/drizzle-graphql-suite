import { type Column, is, type SQL, type Table } from 'drizzle-orm'
import { type PgColumn, type PgDatabase, PgTable } from 'drizzle-orm/pg-core'

import type { DbAdapter } from './types'

export class PgAdapter implements DbAdapter {
  readonly supportsReturning = true

  isTable(value: unknown): boolean {
    return is(value, PgTable)
  }

  async executeInsert(
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle generic parameters
    db: PgDatabase<any, any, any>,
    table: Table,
    // biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
    values: Record<string, any>[],
    returningColumns?: Record<string, Column>,
    // biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
  ): Promise<any[]> {
    let query = db.insert(table as PgTable).values(values)
    if (returningColumns) {
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle query builder chaining requires cast
      query = query.returning(returningColumns as Record<string, PgColumn>) as any
    }
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle query builder chaining requires cast
    query = query.onConflictDoNothing() as any
    return await query
  }

  async executeUpdate(
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle generic parameters
    db: PgDatabase<any, any, any>,
    table: Table,
    // biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
    set: Record<string, any>,
    where: SQL | undefined,
    returningColumns?: Record<string, Column>,
    // biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
  ): Promise<any[]> {
    let query = db.update(table as PgTable).set(set)
    if (where) {
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle query builder chaining requires cast
      query = query.where(where) as any
    }
    if (returningColumns) {
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle query builder chaining requires cast
      query = query.returning(returningColumns as Record<string, PgColumn>) as any
    }
    return await query
  }

  async executeDelete(
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle generic parameters
    db: PgDatabase<any, any, any>,
    table: Table,
    where: SQL | undefined,
    returningColumns?: Record<string, Column>,
    // biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
  ): Promise<any[]> {
    let query = db.delete(table as PgTable)
    if (where) {
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle query builder chaining requires cast
      query = query.where(where) as any
    }
    if (returningColumns) {
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle query builder chaining requires cast
      query = query.returning(returningColumns as Record<string, PgColumn>) as any
    }
    return await query
  }
}
