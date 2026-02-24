import type {
  BeforeHookFn,
  HooksConfig,
  OperationHooks,
  OperationType,
  TableHookConfig,
} from './types'

// ─── Row Security ────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: consumer-facing loose type for context
type RowSecurityRule = (context: any) => Record<string, unknown>

/**
 * Generates a HooksConfig that injects WHERE clauses from row-level security rules.
 * Rules are applied as `before` hooks on query, querySingle, count, update, and delete operations.
 *
 * ```ts
 * const hooks = withRowSecurity({
 *   posts: (context) => ({ authorId: { eq: context.user.id } }),
 * })
 * ```
 */
export function withRowSecurity(rules: Record<string, RowSecurityRule>): HooksConfig {
  const hooks: HooksConfig = {}

  for (const [tableName, rule] of Object.entries(rules)) {
    const before: BeforeHookFn = (ctx) => {
      const whereClause = rule(ctx.context)
      const existingWhere = ctx.args?.where
      // Security rules override user-supplied filters on conflicting keys
      const mergedWhere = existingWhere ? { ...existingWhere, ...whereClause } : whereClause
      return { args: { ...ctx.args, where: mergedWhere } }
    }

    const ops: OperationType[] = ['query', 'querySingle', 'count', 'update', 'delete']
    const tableHooks: TableHookConfig = {}
    for (const op of ops) {
      tableHooks[op] = { before }
    }
    hooks[tableName] = tableHooks
  }

  return hooks
}

// ─── Hook Merging ────────────────────────────────────────────

/**
 * Deep-merges multiple HooksConfig objects.
 * - `before` hooks are chained: each runs sequentially, passing the modified args forward.
 * - `after` hooks are chained: each runs sequentially, passing the modified result forward.
 * - `resolve` hooks: last one wins (cannot be composed).
 */
export function mergeHooks(...configs: (HooksConfig | undefined)[]): HooksConfig {
  const result: HooksConfig = {}

  for (const config of configs) {
    if (!config) continue

    for (const [tableName, tableHooks] of Object.entries(config)) {
      if (!result[tableName]) {
        result[tableName] = {}
      }
      const existing = result[tableName]

      for (const [op, hooks] of Object.entries(tableHooks) as [OperationType, OperationHooks][]) {
        if (!existing[op]) {
          existing[op] = hooks
          continue
        }

        const existingOp = existing[op]

        // resolve hook — last one wins
        if ('resolve' in hooks) {
          existing[op] = hooks
          continue
        }

        // before/after hooks — chain them
        if ('resolve' in existingOp) {
          // Existing is a resolve hook, new one has before/after — replace entirely
          existing[op] = hooks
          continue
        }

        const merged: { before?: BeforeHookFn; after?: typeof hooks.after } = {}

        // Chain before hooks
        if (hooks.before && existingOp.before) {
          const first = existingOp.before
          const second = hooks.before
          merged.before = async (ctx) => {
            const firstResult = await first(ctx)
            const nextCtx = firstResult?.args ? { ...ctx, args: firstResult.args } : ctx
            const secondResult = await second(nextCtx)
            return {
              args: secondResult?.args ?? firstResult?.args ?? undefined,
              data: secondResult?.data ?? firstResult?.data ?? undefined,
            }
          }
        } else {
          merged.before = hooks.before ?? existingOp.before
        }

        // Chain after hooks
        if (hooks.after && existingOp.after) {
          const first = existingOp.after
          const second = hooks.after
          merged.after = async (ctx) => {
            const firstResult = await first(ctx)
            return second({ ...ctx, result: firstResult })
          }
        } else {
          merged.after = hooks.after ?? existingOp.after
        }

        existing[op] = merged
      }
    }
  }

  return result
}
