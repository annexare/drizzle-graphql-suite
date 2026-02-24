import type { GraphQLFieldConfig } from 'graphql'

import { capitalize } from './case-ops'
import type { BuildSchemaConfig, PermissionConfig, TableAccess } from './types'

// ─── Public Helpers ──────────────────────────────────────────

export const readOnly = (): TableAccess => ({
  query: true,
  insert: false,
  update: false,
  delete: false,
})

export const permissive = (
  id: string,
  tables?: Record<string, boolean | TableAccess>,
): PermissionConfig => ({
  id,
  mode: 'permissive',
  tables,
})

export const restricted = (
  id: string,
  tables?: Record<string, boolean | TableAccess>,
): PermissionConfig => ({
  id,
  mode: 'restricted',
  tables,
})

// ─── Internal: Config Merging ────────────────────────────────

type MergeResult = {
  config: BuildSchemaConfig
  /** Tables that need individual mutation entry points filtered after build */
  mutationFilter: Record<string, { insert: boolean; update: boolean; delete: boolean }>
}

/**
 * Converts a PermissionConfig into BuildSchemaConfig overrides.
 * Returns the merged config + a map of tables needing post-build mutation filtering.
 */
export function mergePermissionsIntoConfig(
  baseConfig: BuildSchemaConfig,
  permissions: PermissionConfig,
  allTableNames: string[],
): MergeResult {
  const excluded: string[] = [...(baseConfig.tables?.exclude ?? [])]
  const tableConfig: Record<string, { queries?: boolean; mutations?: boolean }> = {
    ...(baseConfig.tables?.config ?? {}),
  }
  const mutationFilter: MergeResult['mutationFilter'] = {}

  for (const tableName of allTableNames) {
    // Skip tables already excluded by base config
    if (excluded.includes(tableName)) continue

    const access = resolveTableAccess(permissions, tableName)

    if (access === false) {
      // Fully excluded
      excluded.push(tableName)
      continue
    }

    if (access === true) {
      // Fully allowed — no overrides needed
      continue
    }

    // Granular access — in restricted mode, undefined fields default to false
    const defaultAllow = permissions.mode === 'permissive'
    const queryAllowed = access.query ?? defaultAllow
    const insertAllowed = access.insert ?? defaultAllow
    const updateAllowed = access.update ?? defaultAllow
    const deleteAllowed = access.delete ?? defaultAllow

    if (!queryAllowed && !insertAllowed && !updateAllowed && !deleteAllowed) {
      // Nothing allowed — exclude entirely
      excluded.push(tableName)
      continue
    }

    tableConfig[tableName] = {
      ...tableConfig[tableName],
      queries: queryAllowed,
    }

    const anyMutation = insertAllowed || updateAllowed || deleteAllowed
    if (!anyMutation) {
      tableConfig[tableName] = { ...tableConfig[tableName], mutations: false }
    } else {
      // Some mutations allowed — keep mutations: true, but mark for post-filter
      tableConfig[tableName] = { ...tableConfig[tableName], mutations: true }
      if (!insertAllowed || !updateAllowed || !deleteAllowed) {
        mutationFilter[tableName] = {
          insert: insertAllowed,
          update: updateAllowed,
          delete: deleteAllowed,
        }
      }
    }
  }

  const config: BuildSchemaConfig = {
    ...baseConfig,
    tables: {
      exclude: excluded.length ? excluded : undefined,
      config: Object.keys(tableConfig).length ? tableConfig : undefined,
    },
  }

  return { config, mutationFilter }
}

/**
 * Resolves the effective access for a table given the permission config.
 * Returns `true` (full access), `false` (excluded), or a TableAccess object.
 */
function resolveTableAccess(
  permissions: PermissionConfig,
  tableName: string,
): boolean | TableAccess {
  const override = permissions.tables?.[tableName]

  if (permissions.mode === 'permissive') {
    // Everything allowed by default; overrides deny
    if (override === undefined) return true
    return override
  }

  // Restricted mode: nothing allowed by default; overrides grant
  if (override === undefined) return false
  return override
}

// ─── Internal: Mutation Post-Filter ──────────────────────────

/**
 * Removes disallowed mutation entry points from the mutations record.
 * Mutates and returns the same record.
 */
export function postFilterMutations(
  // biome-ignore lint/suspicious/noExplicitAny: matches GraphQL's own GraphQLFieldConfig signature
  mutations: Record<string, GraphQLFieldConfig<any, any>>,
  mutationFilter: MergeResult['mutationFilter'],
): void {
  for (const [tableName, flags] of Object.entries(mutationFilter)) {
    const cap = capitalize(tableName)
    if (!flags.insert) {
      delete mutations[`insertInto${cap}`]
      delete mutations[`insertInto${cap}Single`]
    }
    if (!flags.update) {
      delete mutations[`update${cap}`]
    }
    if (!flags.delete) {
      delete mutations[`deleteFrom${cap}`]
    }
  }
}
