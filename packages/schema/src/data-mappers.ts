import type { Relation } from 'drizzle-orm'
import { type Column, getTableColumns, type Table } from 'drizzle-orm'
import { GraphQLError } from 'graphql'

export type TableNamedRelations = {
  relation: Relation
  targetTableName: string
}

export const remapToGraphQLCore = (
  key: string,
  // biome-ignore lint/suspicious/noExplicitAny: dynamic column value
  value: any,
  tableName: string,
  column: Column,
  relationMap?: Record<string, Record<string, TableNamedRelations>>,
  // biome-ignore lint/suspicious/noExplicitAny: dynamic return type
): any => {
  if (value instanceof Date) return value.toISOString()

  if (value instanceof Buffer) return Array.from(value)

  if (typeof value === 'bigint') return value.toString()

  if (Array.isArray(value)) {
    const rel = relationMap?.[tableName]?.[key]
    if (rel) {
      return remapToGraphQLArrayOutput(
        value,
        rel.targetTableName,
        rel.relation.referencedTable,
        relationMap,
      )
    }
    if (column.columnType === 'PgGeometry' || column.columnType === 'PgVector') return value

    return value.map((arrVal) => remapToGraphQLCore(key, arrVal, tableName, column, relationMap))
  }

  if (typeof value === 'object') {
    const rel = relationMap?.[tableName]?.[key]
    if (rel) {
      return remapToGraphQLSingleOutput(
        value,
        rel.targetTableName,
        rel.relation.referencedTable,
        relationMap,
      )
    }
    if (column.columnType === 'PgGeometryObject') return value

    if (column.dataType === 'json') return value

    return JSON.stringify(value)
  }

  return value
}

export const remapToGraphQLSingleOutput = (
  // biome-ignore lint/suspicious/noExplicitAny: dynamic query output
  queryOutput: Record<string, any>,
  tableName: string,
  table: Table,
  relationMap?: Record<string, Record<string, TableNamedRelations>>,
) => {
  for (const [key, value] of Object.entries(queryOutput)) {
    if (value === undefined || value === null) {
      delete queryOutput[key]
    } else {
      queryOutput[key] = remapToGraphQLCore(
        key,
        value,
        tableName,
        // biome-ignore lint/style/noNonNullAssertion: key comes from Object.entries of the query output which mirrors table columns
        table[key as keyof Table]! as Column,
        relationMap,
      )
    }
  }

  return queryOutput
}

export const remapToGraphQLArrayOutput = (
  // biome-ignore lint/suspicious/noExplicitAny: dynamic query output
  queryOutput: Record<string, any>[],
  tableName: string,
  table: Table,
  relationMap?: Record<string, Record<string, TableNamedRelations>>,
) => {
  for (const entry of queryOutput) {
    remapToGraphQLSingleOutput(entry, tableName, table, relationMap)
  }

  return queryOutput
}

// biome-ignore lint/suspicious/noExplicitAny: dynamic column value
export const remapFromGraphQLCore = (value: any, column: Column, columnName: string) => {
  switch (column.dataType) {
    case 'date': {
      const formatted = new Date(value)
      if (Number.isNaN(formatted.getTime()))
        throw new GraphQLError(`Field '${columnName}' is not a valid date!`)
      return formatted
    }

    case 'buffer': {
      if (!Array.isArray(value)) {
        throw new GraphQLError(`Field '${columnName}' is not an array!`)
      }
      return Buffer.from(value)
    }

    case 'json': {
      if (column.columnType === 'PgGeometryObject') return value
      return value
    }

    case 'array': {
      if (!Array.isArray(value)) {
        throw new GraphQLError(`Field '${columnName}' is not an array!`)
      }
      if (column.columnType === 'PgGeometry' && value.length !== 2) {
        throw new GraphQLError(
          `Invalid float tuple in field '${columnName}': expected array with length of 2, received ${value.length}`,
        )
      }
      return value
    }

    case 'bigint': {
      try {
        return BigInt(value)
      } catch {
        throw new GraphQLError(`Field '${columnName}' is not a BigInt!`)
      }
    }

    default: {
      return value
    }
  }
}

// biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
export const remapFromGraphQLSingleInput = (queryInput: Record<string, any>, table: Table) => {
  for (const [key, value] of Object.entries(queryInput)) {
    if (value === undefined) {
      delete queryInput[key]
    } else {
      const column = getTableColumns(table)[key]
      if (!column) throw new GraphQLError(`Unknown column: ${key}`)

      if (value === null && column.notNull) {
        delete queryInput[key]
        continue
      }

      queryInput[key] = remapFromGraphQLCore(value, column, key)
    }
  }

  return queryInput
}

// biome-ignore lint/suspicious/noExplicitAny: dynamically typed by table schema
export const remapFromGraphQLArrayInput = (queryInput: Record<string, any>[], table: Table) => {
  for (const entry of queryInput) remapFromGraphQLSingleInput(entry, table)
  return queryInput
}
