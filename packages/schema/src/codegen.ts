import type { GraphQLSchema } from 'graphql'
import {
  type GraphQLInputObjectType,
  type GraphQLObjectType,
  type GraphQLOutputType,
  type GraphQLType,
  isEnumType,
  isInputObjectType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  printSchema,
} from 'graphql'

import { capitalize, uncapitalize } from './case-ops'

// ─── Public Types ──────────────────────────────────────────

export type CodegenOptions = {
  drizzle?: {
    /** Import path for Drizzle schema types (e.g. '@ir/core/db/schema') */
    importPath: string
    /** Override mapping: Drizzle table name → export type name (e.g. { overrideToAsset: 'OverrideAsset' }) */
    typeNames?: Record<string, string>
  }
}

// ─── Internal Types ────────────────────────────────────────

type EntityInfo = {
  tableName: string
  typeName: string
  fields: string[]
  relations: Record<string, { entity: string; type: 'one' | 'many' }>
  queryName?: string
  queryListName?: string
  countName?: string
  insertName?: string
  insertSingleName?: string
  updateName?: string
  deleteName?: string
  hasFilters: boolean
  hasInsertInput: boolean
  hasUpdateInput: boolean
  hasOrderBy: boolean
}

// ─── Schema Introspection ──────────────────────────────────

function getEntitiesFromSchema(schema: GraphQLSchema): Map<string, EntityInfo> {
  const queryType = schema.getQueryType()
  const mutationType = schema.getMutationType()
  const entities = new Map<string, EntityInfo>()

  if (!queryType) return entities

  const queryFields = queryType.getFields()
  const mutationFields = mutationType?.getFields() ?? {}

  // Discover entities from query fields:
  // Look for *Count queries to identify entity names
  for (const [fieldName] of Object.entries(queryFields)) {
    if (!fieldName.endsWith('Count')) continue
    const tableName = fieldName.slice(0, -5) // strip 'Count'

    // Find the list query — could be tableName + 's' or just tableName
    const listName = queryFields[`${tableName}s`]
      ? `${tableName}s`
      : queryFields[tableName]
        ? tableName
        : undefined

    // Find the single query
    const singleName = queryFields[tableName] ? tableName : undefined

    if (!listName) continue

    const listField = queryFields[listName]
    if (!listField) continue

    // Unwrap the list query return type to get the SelectItem type
    const selectItemType = unwrapToObjectType(listField.type)
    if (!selectItemType) continue

    const selectFields = selectItemType.getFields()
    const scalarFields: string[] = []
    const relations: Record<string, { entity: string; type: 'one' | 'many' }> = {}

    for (const [sfName, sfField] of Object.entries(selectFields)) {
      const unwrapped = unwrapType(sfField.type)
      if (isObjectType(unwrapped.type)) {
        // This is a relation — store the GraphQL type for later entity matching
        const isList = unwrapped.isList
        relations[sfName] = {
          entity: sfName, // placeholder — resolved after all entities are discovered
          type: isList ? 'many' : 'one',
          _graphqlType: unwrapped.type, // temporary: used for field-based matching
        } as EntityInfo['relations'][string] & { _graphqlType: GraphQLObjectType }
      } else {
        scalarFields.push(sfName)
      }
    }

    // Detect mutations
    const capitalName = capitalize(tableName)
    const insertName = mutationFields[`insertInto${capitalName}`]
      ? `insertInto${capitalName}`
      : undefined
    const insertSingleName = mutationFields[`insertInto${capitalName}Single`]
      ? `insertInto${capitalName}Single`
      : undefined
    const updateName = mutationFields[`update${capitalName}`] ? `update${capitalName}` : undefined
    const deleteName = mutationFields[`deleteFrom${capitalName}`]
      ? `deleteFrom${capitalName}`
      : undefined

    // Detect input types
    const typeMap = schema.getTypeMap()
    const hasFilters = `${capitalName}Filters` in typeMap
    const hasInsertInput = `${capitalName}InsertInput` in typeMap
    const hasUpdateInput = `${capitalName}UpdateInput` in typeMap
    const hasOrderBy = `${capitalName}OrderBy` in typeMap

    entities.set(tableName, {
      tableName,
      typeName: capitalName,
      fields: scalarFields,
      relations,
      queryName: singleName,
      queryListName: listName,
      countName: fieldName,
      insertName,
      insertSingleName,
      updateName,
      deleteName,
      hasFilters,
      hasInsertInput,
      hasUpdateInput,
      hasOrderBy,
    })
  }

  // Resolve relation entity names. Each relation has a _graphqlType with scalar fields
  // that we can match against known entity field sets. This handles self-referencing
  // relations (asset.template → asset) and renamed relations (assetToAsset.childAsset → asset).
  const entityFieldSets = new Map<string, Set<string>>()
  for (const [name, info] of entities) {
    entityFieldSets.set(name, new Set(info.fields))
  }

  for (const entity of entities.values()) {
    for (const [, rel] of Object.entries(entity.relations)) {
      // biome-ignore lint/suspicious/noExplicitAny: temporary _graphqlType field for matching
      const graphqlType = (rel as any)._graphqlType as GraphQLObjectType | undefined
      // biome-ignore lint/suspicious/noExplicitAny: cleaning up temporary field
      delete (rel as any)._graphqlType

      if (!graphqlType) continue

      // Extract scalar field names from the relation's GraphQL type
      const relFields = graphqlType.getFields()
      const relScalarNames = new Set<string>()
      for (const [fname, ffield] of Object.entries(relFields)) {
        const unwrapped = unwrapType(ffield.type)
        if (!isObjectType(unwrapped.type)) {
          relScalarNames.add(fname)
        }
      }

      // Find the entity whose fields are a superset of (or equal to) the relation's scalars
      let bestMatch: string | undefined
      let bestOverlap = 0
      for (const [entityName, entityFields] of entityFieldSets) {
        // Count how many of the relation's scalars match the entity's fields
        let overlap = 0
        for (const f of relScalarNames) {
          if (entityFields.has(f)) overlap++
        }
        // Require all relation scalars to be present in the entity
        if (overlap === relScalarNames.size && overlap > bestOverlap) {
          bestOverlap = overlap
          bestMatch = entityName
        }
      }

      if (bestMatch) {
        rel.entity = bestMatch
      }
    }
  }

  return entities
}

function unwrapToObjectType(type: GraphQLOutputType): GraphQLObjectType | null {
  if (isNonNullType(type)) return unwrapToObjectType(type.ofType)
  if (isListType(type)) return unwrapToObjectType(type.ofType)
  if (isObjectType(type)) return type
  return null
}

type UnwrappedType = {
  type: GraphQLType
  isList: boolean
  isNonNull: boolean
}

function unwrapType(type: GraphQLType): UnwrappedType {
  let isList = false
  let isNonNull = false
  let current = type

  if (isNonNullType(current)) {
    isNonNull = true
    current = current.ofType
  }
  if (isListType(current)) {
    isList = true
    current = current.ofType
    if (isNonNullType(current)) {
      current = current.ofType
    }
  }

  return { type: current, isList, isNonNull }
}

// ─── Filter Type Codegen ───────────────────────────────────

function generateFilterTypeCode(
  schema: GraphQLSchema,
  typeName: string,
  entities: Map<string, EntityInfo>,
): string {
  const typeMap = schema.getTypeMap()
  const filterType = typeMap[`${typeName}Filters`]
  if (!filterType || !isInputObjectType(filterType)) return ''

  const lines: string[] = []
  const fields = filterType.getFields()

  lines.push(`export type ${typeName}Filters = {`)

  for (const [fieldName, field] of Object.entries(fields)) {
    if (fieldName === 'OR') {
      lines.push(`  OR?: ${typeName}Filters[]`)
      continue
    }

    // Check if this is a relation filter
    const entity = entities.get(uncapitalize(typeName))
    const isRelation = entity?.relations[fieldName]

    if (isRelation) {
      const relType = capitalize(isRelation.entity)
      if (isRelation.type === 'one') {
        lines.push(`  ${fieldName}?: ${relType}Filters`)
      } else {
        lines.push(
          `  ${fieldName}?: { some?: ${relType}Filters; every?: ${relType}Filters; none?: ${relType}Filters }`,
        )
      }
      continue
    }

    // Column filter — generate operator type inline
    const filterInputType = field.type
    const unwrapped = isNonNullType(filterInputType) ? filterInputType.ofType : filterInputType
    if (isInputObjectType(unwrapped)) {
      const opFields = unwrapped.getFields()
      const columnType = inferColumnTsType(opFields)
      lines.push(`  ${fieldName}?: {`)
      lines.push(`    eq?: ${columnType} | null`)
      lines.push(`    ne?: ${columnType} | null`)
      lines.push(`    lt?: ${columnType} | null`)
      lines.push(`    lte?: ${columnType} | null`)
      lines.push(`    gt?: ${columnType} | null`)
      lines.push(`    gte?: ${columnType} | null`)
      lines.push(`    like?: string | null`)
      lines.push(`    notLike?: string | null`)
      lines.push(`    ilike?: string | null`)
      lines.push(`    notIlike?: string | null`)
      lines.push(`    inArray?: ${columnType}[] | null`)
      lines.push(`    notInArray?: ${columnType}[] | null`)
      lines.push(`    isNull?: boolean | null`)
      lines.push(`    isNotNull?: boolean | null`)
      lines.push(`    OR?: Array<Omit<${typeName}Filters['${fieldName}'], 'OR'>> | null`)
      lines.push(`  }`)
    }
  }

  lines.push('}')
  return lines.join('\n')
}

function inferColumnTsType(opFields: ReturnType<GraphQLInputObjectType['getFields']>): string {
  const eqField = opFields.eq
  if (!eqField) return 'unknown'

  return graphqlTypeToTs(eqField.type)
}

function graphqlTypeToTs(type: GraphQLType): string {
  if (isNonNullType(type)) return graphqlTypeToTs(type.ofType)
  if (isListType(type)) return `${graphqlTypeToTs(type.ofType)}[]`
  if (isScalarType(type)) {
    switch (type.name) {
      case 'String':
        return 'string'
      case 'Int':
      case 'Float':
        return 'number'
      case 'Boolean':
        return 'boolean'
      case 'JSON':
        return 'unknown'
      default:
        return 'unknown'
    }
  }
  if (isEnumType(type)) {
    return type
      .getValues()
      .map((v) => `'${v.value}'`)
      .join(' | ')
  }
  return 'unknown'
}

// ─── Input Type Codegen ────────────────────────────────────

function generateInputTypeCode(
  schema: GraphQLSchema,
  inputTypeName: string,
  exportName: string,
): string {
  const typeMap = schema.getTypeMap()
  const inputType = typeMap[inputTypeName]
  if (!inputType || !isInputObjectType(inputType)) return ''

  const lines: string[] = []
  const fields = inputType.getFields()

  lines.push(`export type ${exportName} = {`)

  for (const [fieldName, field] of Object.entries(fields)) {
    const isRequired = isNonNullType(field.type)
    const tsType = graphqlTypeToTs(field.type)
    const opt = isRequired ? '' : '?'
    const nullUnion = isRequired ? '' : ' | null'
    lines.push(`  ${fieldName}${opt}: ${tsType}${nullUnion}`)
  }

  lines.push('}')
  return lines.join('\n')
}

// ─── OrderBy Type Codegen ──────────────────────────────────

function generateOrderByTypeCode(schema: GraphQLSchema, typeName: string): string {
  const typeMap = schema.getTypeMap()
  const orderByType = typeMap[`${typeName}OrderBy`]
  if (!orderByType || !isInputObjectType(orderByType)) return ''

  const fields = orderByType.getFields()
  const fieldNames = Object.keys(fields)

  const lines: string[] = []
  lines.push(`export type ${typeName}OrderBy = {`)
  for (const name of fieldNames) {
    lines.push(`  ${name}?: { direction: 'asc' | 'desc'; priority: number }`)
  }
  lines.push('}')
  return lines.join('\n')
}

// ─── WireFormat Type ───────────────────────────────────────

function generateWireFormatType(
  entity: EntityInfo,
  drizzleImportPath: string | undefined,
  typeNameOverrides: Record<string, string>,
): string {
  const drizzleTypeName = typeNameOverrides[entity.tableName] ?? capitalize(entity.tableName)

  if (drizzleImportPath) {
    // Use Drizzle type with Date→string override
    return `export type ${entity.typeName}Wire = Omit<Drizzle${drizzleTypeName}, DateKeys<Drizzle${drizzleTypeName}>>\n  & { [K in DateKeys<Drizzle${drizzleTypeName}>]: string }`
  }

  // Fallback: generate field-by-field (less precise)
  return `// Wire format for ${entity.tableName} (no Drizzle import configured)\nexport type ${entity.typeName}Wire = Record<string, unknown>`
}

// ─── Public API ────────────────────────────────────────────

export function generateSDL(schema: GraphQLSchema): string {
  return printSchema(schema)
}

export function generateTypes(schema: GraphQLSchema, options?: CodegenOptions): string {
  const entities = getEntitiesFromSchema(schema)
  const drizzlePath = options?.drizzle?.importPath
  const typeOverrides = options?.drizzle?.typeNames ?? {}

  const lines: string[] = []

  lines.push('// ─── Auto-generated by drizzle-graphql-pg codegen ────────')
  lines.push('// Do not edit manually. Re-run the codegen script to update.')
  lines.push('')

  // Date key utility type
  lines.push('// biome-ignore lint/suspicious/noExplicitAny: utility type for date key extraction')
  lines.push(
    'type DateKeys<T> = { [K in keyof T]: T[K] extends Date | null ? K : T[K] extends Date ? K : never }[keyof T]',
  )
  lines.push('')

  // Drizzle type imports
  if (drizzlePath) {
    const imports: string[] = []
    for (const entity of entities.values()) {
      const drizzleTypeName = typeOverrides[entity.tableName] ?? capitalize(entity.tableName)
      imports.push(`  type ${drizzleTypeName} as Drizzle${drizzleTypeName}`)
    }
    lines.push(`import {`)
    lines.push(imports.join(',\n'))
    lines.push(`} from '${drizzlePath}'`)
    lines.push('')
  }

  // Wire format types
  lines.push('// ─── Wire Format Types ──────────────────────────────────')
  lines.push('// Drizzle types with Date fields converted to string (GraphQL serialization)')
  lines.push('')
  for (const entity of entities.values()) {
    lines.push(generateWireFormatType(entity, drizzlePath, typeOverrides))
    lines.push('')
  }

  // Filter types
  lines.push('// ─── Filter Types ──────────────────────────────────────')
  lines.push('')
  for (const entity of entities.values()) {
    if (!entity.hasFilters) continue
    const code = generateFilterTypeCode(schema, entity.typeName, entities)
    if (code) {
      lines.push(code)
      lines.push('')
    }
  }

  // Input types (insert/update)
  lines.push('// ─── Input Types ──────────────────────────────────────')
  lines.push('')
  for (const entity of entities.values()) {
    if (entity.hasInsertInput) {
      const code = generateInputTypeCode(
        schema,
        `${entity.typeName}InsertInput`,
        `${entity.typeName}InsertInput`,
      )
      if (code) {
        lines.push(code)
        lines.push('')
      }
    }
    if (entity.hasUpdateInput) {
      const code = generateInputTypeCode(
        schema,
        `${entity.typeName}UpdateInput`,
        `${entity.typeName}UpdateInput`,
      )
      if (code) {
        lines.push(code)
        lines.push('')
      }
    }
  }

  // OrderBy types
  lines.push('// ─── OrderBy Types ──────────────────────────────────────')
  lines.push('')
  for (const entity of entities.values()) {
    if (!entity.hasOrderBy) continue
    const code = generateOrderByTypeCode(schema, entity.typeName)
    if (code) {
      lines.push(code)
      lines.push('')
    }
  }

  return lines.join('\n')
}

export function generateEntityDefs(schema: GraphQLSchema, options?: CodegenOptions): string {
  const entities = getEntitiesFromSchema(schema)
  const typeOverrides = options?.drizzle?.typeNames ?? {}

  const lines: string[] = []

  lines.push('// ─── Auto-generated by drizzle-graphql-pg codegen ────────')
  lines.push('// Do not edit manually. Re-run the codegen script to update.')
  lines.push('')
  lines.push('import type {')

  // Import wire types, filters, inputs, orderBy
  const typeImports: string[] = []
  for (const entity of entities.values()) {
    typeImports.push(`  ${entity.typeName}Wire`)
    if (entity.hasFilters) typeImports.push(`  ${entity.typeName}Filters`)
    if (entity.hasInsertInput) typeImports.push(`  ${entity.typeName}InsertInput`)
    if (entity.hasUpdateInput) typeImports.push(`  ${entity.typeName}UpdateInput`)
    if (entity.hasOrderBy) typeImports.push(`  ${entity.typeName}OrderBy`)
  }
  lines.push(typeImports.join(',\n'))
  lines.push("} from './types'")
  lines.push('')

  // Runtime schema object
  lines.push('export const schema = {')
  for (const entity of entities.values()) {
    lines.push(`  ${entity.tableName}: {`)
    if (entity.queryName) lines.push(`    queryName: '${entity.queryName}',`)
    if (entity.queryListName) lines.push(`    queryListName: '${entity.queryListName}',`)
    if (entity.countName) lines.push(`    countName: '${entity.countName}',`)
    if (entity.insertName) lines.push(`    insertName: '${entity.insertName}',`)
    if (entity.insertSingleName) lines.push(`    insertSingleName: '${entity.insertSingleName}',`)
    if (entity.updateName) lines.push(`    updateName: '${entity.updateName}',`)
    if (entity.deleteName) lines.push(`    deleteName: '${entity.deleteName}',`)
    lines.push(`    fields: [${entity.fields.map((f) => `'${f}'`).join(', ')}],`)
    lines.push(`    relations: {`)
    for (const [relName, rel] of Object.entries(entity.relations)) {
      lines.push(`      ${relName}: { entity: '${rel.entity}', type: '${rel.type}' },`)
    }
    lines.push(`    },`)
    lines.push(`  },`)
  }
  lines.push('} as const')
  lines.push('')

  // EntityDefs type (for client inference)
  lines.push('export type EntityDefs = {')
  for (const entity of entities.values()) {
    lines.push(`  ${entity.tableName}: {`)
    lines.push(`    fields: ${entity.typeName}Wire`)
    lines.push(`    relations: {`)
    for (const [relName, rel] of Object.entries(entity.relations)) {
      lines.push(`      ${relName}: { entity: '${rel.entity}'; type: '${rel.type}' }`)
    }
    lines.push(`    }`)
    if (entity.hasFilters) lines.push(`    filters: ${entity.typeName}Filters`)
    if (entity.hasInsertInput) lines.push(`    insertInput: ${entity.typeName}InsertInput`)
    if (entity.hasUpdateInput) lines.push(`    updateInput: ${entity.typeName}UpdateInput`)
    if (entity.hasOrderBy) lines.push(`    orderBy: ${entity.typeName}OrderBy`)
    lines.push(`  }`)
  }
  lines.push('}')
  lines.push('')

  // TableNameMap type (maps Drizzle table identifiers to entity keys)
  lines.push('export type TableNameMap = {')
  for (const entity of entities.values()) {
    const drizzleTypeName = typeOverrides[entity.tableName] ?? capitalize(entity.tableName)
    lines.push(`  ${drizzleTypeName}: '${entity.tableName}'`)
  }
  lines.push('}')
  lines.push('')

  return lines.join('\n')
}
