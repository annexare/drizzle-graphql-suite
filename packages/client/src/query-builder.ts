import type { EntityDescriptor, SchemaDescriptor } from './types'

export type BuiltQuery = {
  query: string
  variables: Record<string, unknown>
  operationName: string
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ─── Selection Set Builder ─────────────────────────────────

function buildSelectionSet(
  select: Record<string, unknown>,
  schema: SchemaDescriptor,
  entityDef: EntityDescriptor,
  indent = 4,
): string {
  const pad = ' '.repeat(indent)
  const lines: string[] = []

  for (const [key, value] of Object.entries(select)) {
    if (value === true) {
      lines.push(`${pad}${key}`)
      continue
    }

    if (typeof value === 'object' && value !== null) {
      // Relation — look up the target entity
      const rel = entityDef.relations[key]
      if (!rel) continue

      const targetDef = schema[rel.entity]
      if (!targetDef) continue

      const inner = buildSelectionSet(
        value as Record<string, unknown>,
        schema,
        targetDef,
        indent + 2,
      )
      lines.push(`${pad}${key} {`)
      lines.push(inner)
      lines.push(`${pad}}`)
    }
  }

  return lines.join('\n')
}

// ─── Variable Type Mapping ─────────────────────────────────

function getFilterTypeName(entityName: string): string {
  return `${capitalize(entityName)}Filters`
}

function getOrderByTypeName(entityName: string): string {
  return `${capitalize(entityName)}OrderBy`
}

function getInsertInputTypeName(entityName: string): string {
  return `${capitalize(entityName)}InsertInput`
}

function getUpdateInputTypeName(entityName: string): string {
  return `${capitalize(entityName)}UpdateInput`
}

// ─── Query Builders ────────────────────────────────────────

export function buildListQuery(
  entityName: string,
  entityDef: EntityDescriptor,
  schema: SchemaDescriptor,
  select: Record<string, unknown>,
  hasWhere: boolean,
  hasOrderBy: boolean,
  hasLimit: boolean,
  hasOffset: boolean,
): BuiltQuery {
  const opName = entityDef.queryListName
  if (!opName) throw new Error(`Entity '${entityName}' has no list query`)

  const filterType = getFilterTypeName(entityName)
  const orderByType = getOrderByTypeName(entityName)
  const operationName = `${capitalize(opName)}Query`

  const varDefs: string[] = []
  const argPairs: string[] = []

  if (hasWhere) {
    varDefs.push(`$where: ${filterType}`)
    argPairs.push('where: $where')
  }
  if (hasOrderBy) {
    varDefs.push(`$orderBy: ${orderByType}`)
    argPairs.push('orderBy: $orderBy')
  }
  if (hasLimit) {
    varDefs.push('$limit: Int')
    argPairs.push('limit: $limit')
  }
  if (hasOffset) {
    varDefs.push('$offset: Int')
    argPairs.push('offset: $offset')
  }

  const varDefsStr = varDefs.length ? `(${varDefs.join(', ')})` : ''
  const argsStr = argPairs.length ? `(${argPairs.join(', ')})` : ''

  const selection = buildSelectionSet(select, schema, entityDef)
  const query = `query ${operationName}${varDefsStr} {\n  ${opName}${argsStr} {\n${selection}\n  }\n}`

  return { query, variables: {}, operationName }
}

export function buildSingleQuery(
  entityName: string,
  entityDef: EntityDescriptor,
  schema: SchemaDescriptor,
  select: Record<string, unknown>,
  hasWhere: boolean,
  hasOrderBy: boolean,
  hasOffset: boolean,
): BuiltQuery {
  const opName = entityDef.queryName
  if (!opName) throw new Error(`Entity '${entityName}' has no single query`)

  const filterType = getFilterTypeName(entityName)
  const orderByType = getOrderByTypeName(entityName)
  const operationName = `${capitalize(opName)}SingleQuery`

  const varDefs: string[] = []
  const argPairs: string[] = []

  if (hasWhere) {
    varDefs.push(`$where: ${filterType}`)
    argPairs.push('where: $where')
  }
  if (hasOrderBy) {
    varDefs.push(`$orderBy: ${orderByType}`)
    argPairs.push('orderBy: $orderBy')
  }
  if (hasOffset) {
    varDefs.push('$offset: Int')
    argPairs.push('offset: $offset')
  }

  const varDefsStr = varDefs.length ? `(${varDefs.join(', ')})` : ''
  const argsStr = argPairs.length ? `(${argPairs.join(', ')})` : ''

  const selection = buildSelectionSet(select, schema, entityDef)
  const query = `query ${operationName}${varDefsStr} {\n  ${opName}${argsStr} {\n${selection}\n  }\n}`

  return { query, variables: {}, operationName }
}

export function buildCountQuery(
  entityName: string,
  entityDef: EntityDescriptor,
  hasWhere: boolean,
): BuiltQuery {
  const opName = entityDef.countName
  if (!opName) throw new Error(`Entity '${entityName}' has no count query`)

  const filterType = getFilterTypeName(entityName)
  const operationName = `${capitalize(opName)}Query`

  const varDefs: string[] = []
  const argPairs: string[] = []

  if (hasWhere) {
    varDefs.push(`$where: ${filterType}`)
    argPairs.push('where: $where')
  }

  const varDefsStr = varDefs.length ? `(${varDefs.join(', ')})` : ''
  const argsStr = argPairs.length ? `(${argPairs.join(', ')})` : ''

  const query = `query ${operationName}${varDefsStr} {\n  ${opName}${argsStr}\n}`

  return { query, variables: {}, operationName }
}

export function buildInsertMutation(
  entityName: string,
  entityDef: EntityDescriptor,
  schema: SchemaDescriptor,
  returning: Record<string, unknown> | undefined,
  isSingle: boolean,
): BuiltQuery {
  const opName = isSingle ? entityDef.insertSingleName : entityDef.insertName
  if (!opName)
    throw new Error(
      `Entity '${entityName}' has no ${isSingle ? 'insertSingle' : 'insert'} mutation`,
    )

  const inputType = getInsertInputTypeName(entityName)
  const operationName = `${capitalize(opName)}Mutation`

  const valuesType = isSingle ? `${inputType}!` : `[${inputType}!]!`
  const varDefs = `($values: ${valuesType})`
  const argsStr = '(values: $values)'

  let selectionBlock = ''
  if (returning) {
    const selection = buildSelectionSet(returning, schema, entityDef)
    selectionBlock = ` {\n${selection}\n  }`
  }

  const query = `mutation ${operationName}${varDefs} {\n  ${opName}${argsStr}${selectionBlock}\n}`

  return { query, variables: {}, operationName }
}

export function buildUpdateMutation(
  entityName: string,
  entityDef: EntityDescriptor,
  schema: SchemaDescriptor,
  returning: Record<string, unknown> | undefined,
  hasWhere: boolean,
): BuiltQuery {
  const opName = entityDef.updateName
  if (!opName) throw new Error(`Entity '${entityName}' has no update mutation`)

  const updateType = getUpdateInputTypeName(entityName)
  const filterType = getFilterTypeName(entityName)
  const operationName = `${capitalize(opName)}Mutation`

  const varDefs: string[] = [`$set: ${updateType}!`]
  const argPairs: string[] = ['set: $set']

  if (hasWhere) {
    varDefs.push(`$where: ${filterType}`)
    argPairs.push('where: $where')
  }

  const varDefsStr = `(${varDefs.join(', ')})`
  const argsStr = `(${argPairs.join(', ')})`

  let selectionBlock = ''
  if (returning) {
    const selection = buildSelectionSet(returning, schema, entityDef)
    selectionBlock = ` {\n${selection}\n  }`
  }

  const query = `mutation ${operationName}${varDefsStr} {\n  ${opName}${argsStr}${selectionBlock}\n}`

  return { query, variables: {}, operationName }
}

export function buildDeleteMutation(
  entityName: string,
  entityDef: EntityDescriptor,
  schema: SchemaDescriptor,
  returning: Record<string, unknown> | undefined,
  hasWhere: boolean,
): BuiltQuery {
  const opName = entityDef.deleteName
  if (!opName) throw new Error(`Entity '${entityName}' has no delete mutation`)

  const filterType = getFilterTypeName(entityName)
  const operationName = `${capitalize(opName)}Mutation`

  const varDefs: string[] = []
  const argPairs: string[] = []

  if (hasWhere) {
    varDefs.push(`$where: ${filterType}`)
    argPairs.push('where: $where')
  }

  const varDefsStr = varDefs.length ? `(${varDefs.join(', ')})` : ''
  const argsStr = argPairs.length ? `(${argPairs.join(', ')})` : ''

  let selectionBlock = ''
  if (returning) {
    const selection = buildSelectionSet(returning, schema, entityDef)
    selectionBlock = ` {\n${selection}\n  }`
  }

  const query = `mutation ${operationName}${varDefsStr} {\n  ${opName}${argsStr}${selectionBlock}\n}`

  return { query, variables: {}, operationName }
}
