import type {
  GraphQLFieldConfig,
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLResolveInfo,
} from 'graphql'

// ─── Generated Entities ──────────────────────────────────────

export type GeneratedEntities = {
  // biome-ignore lint/suspicious/noExplicitAny: matches GraphQL's own GraphQLFieldConfig signature
  queries: Record<string, GraphQLFieldConfig<any, any>>
  // biome-ignore lint/suspicious/noExplicitAny: matches GraphQL's own GraphQLFieldConfig signature
  mutations: Record<string, GraphQLFieldConfig<any, any>>
  inputs: Record<string, GraphQLInputObjectType>
  types: Record<string, GraphQLObjectType>
}

// ─── Hook Types ──────────────────────────────────────────────

export type OperationType =
  | 'query'
  | 'querySingle'
  | 'count'
  | 'insert'
  | 'insertSingle'
  | 'update'
  | 'delete'

export type HookContext = {
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  args: any
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  context: any
  info: GraphQLResolveInfo
}

export type BeforeHookResult = {
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  args?: any
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  data?: any
}

export type BeforeHookFn = (
  ctx: HookContext,
) => Promise<BeforeHookResult | undefined> | BeforeHookResult | undefined

export type AfterHookContext = {
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  result: any
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  beforeData: any
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  context: any
  info: GraphQLResolveInfo
}

// biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
export type AfterHookFn = (ctx: AfterHookContext) => Promise<any> | any

export type ResolveHookContext = HookContext & {
  // biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
  defaultResolve: (overrideArgs?: any) => Promise<any>
}

// biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type
export type ResolveHookFn = (ctx: ResolveHookContext) => Promise<any> | any

export type OperationHooks =
  | {
      before?: BeforeHookFn
      after?: AfterHookFn
    }
  | {
      resolve: ResolveHookFn
    }

export type TableHookConfig = {
  [K in OperationType]?: OperationHooks
}

export type HooksConfig = {
  [tableName: string]: TableHookConfig
}

// ─── Permission Types ───────────────────────────────────────

export type TableAccess = {
  query?: boolean
  insert?: boolean
  update?: boolean
  delete?: boolean
}

export type PermissionConfig = {
  id: string
  mode: 'permissive' | 'restricted'
  tables?: Record<string, boolean | TableAccess>
}

// ─── Table Config Types ─────────────────────────────────────

export type TableOperations = {
  /** Generate query operations (list, single, count). @default true */
  queries?: boolean
  /** Generate mutation operations (insert, insertSingle, update, delete). @default follows global `mutations` */
  mutations?: boolean
}

// ─── Relation Pruning ───────────────────────────────────────

/**
 * Controls how a specific relation expands in the schema.
 * - `false`: relation field omitted entirely from parent type
 * - `'leaf'`: relation expands with scalar columns only (no child relations)
 * - `{ only: string[] }`: relation expands with only the listed child relation fields
 */
export type RelationPruneRule = false | 'leaf' | { only: string[] }

// ─── Build Schema Config ─────────────────────────────────────

export type BuildSchemaConfig = {
  /**
   * Set to `false` to omit mutations from the schema.
   * @default true
   */
  mutations?: boolean
  /**
   * Limits depth of generated relation fields on queries.
   * Non-negative integer or undefined (no limit).
   * Set to 0 to omit relations altogether.
   * @default 3
   */
  limitRelationDepth?: number
  /**
   * Max occurrences of the same table via direct self-relations in a type path.
   * - 1 = self-relation fields are omitted entirely (default)
   * - 2 = one level of self-relation expansion (e.g., item.parent exists but
   *   the nested item has no parent/children fields)
   * Only applies to direct self-relations (source table === target table).
   * Cross-table paths that revisit a table are governed by limitRelationDepth.
   * @default 1
   */
  limitSelfRelationDepth?: number
  /**
   * Customizes query name suffixes.
   * @default { list: '', single: 'Single' }
   */
  suffixes?: {
    list?: string
    single?: string
  }
  /**
   * Per-table hooks for queries and mutations.
   * Keys are table names as they appear in the Drizzle schema.
   */
  hooks?: HooksConfig
  /**
   * Per-table configuration: exclude tables or limit operations.
   * Table names must match the keys in the Drizzle schema object.
   */
  tables?: {
    /** Tables to completely exclude (no types, no operations, relations to them skipped). */
    exclude?: string[]
    /** Per-table operation overrides. Tables not listed get default behavior. */
    config?: Record<string, TableOperations>
  }
  /**
   * Fine-grained per-relation pruning rules.
   * Keys are `tableName.relationName` (e.g., `'asset.childAssets': false`).
   */
  pruneRelations?: Record<string, RelationPruneRule>
  /**
   * Enable debug logging for schema diagnostics.
   * - `true`: logs SDL byte size and type count
   * - `{ schemaSize?: boolean; relationTree?: boolean }`: selective logging
   */
  debug?: boolean | { schemaSize?: boolean; relationTree?: boolean }
}
