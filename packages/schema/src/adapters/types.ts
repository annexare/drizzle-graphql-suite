import type { Column, SQL, Table } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'

export interface DbAdapter {
  /** Identifies tables in the schema (e.g., is(value, PgTable)) */
  isTable(value: unknown): boolean
  /** Whether mutations can return data (PG: yes via RETURNING, MySQL: no) */
  readonly supportsReturning: boolean
  executeInsert(
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle generic parameters
    db: PgDatabase<any, any, any>,
    table: Table,
    // biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
    values: Record<string, any>[],
    returningColumns?: Record<string, Column>,
    // biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
  ): Promise<any[]>
  executeUpdate(
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle generic parameters
    db: PgDatabase<any, any, any>,
    table: Table,
    // biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
    set: Record<string, any>,
    where: SQL | undefined,
    returningColumns?: Record<string, Column>,
    // biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
  ): Promise<any[]>
  executeDelete(
    // biome-ignore lint/suspicious/noExplicitAny: Drizzle generic parameters
    db: PgDatabase<any, any, any>,
    table: Table,
    where: SQL | undefined,
    returningColumns?: Record<string, Column>,
    // biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
  ): Promise<any[]>
}
