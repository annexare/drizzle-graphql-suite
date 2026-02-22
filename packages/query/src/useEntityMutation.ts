import { type UseMutationResult, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  AnyEntityDefs,
  EntityClient,
  EntityDef,
  InferResult,
} from 'drizzle-graphql-suite/client'

// ─── Insert ────────────────────────────────────────────────

type InsertOptions<TResult> = {
  invalidate?: boolean
  invalidateKey?: unknown[]
  onSuccess?: (data: TResult) => void
  onError?: (error: Error) => void
}

export function useEntityInsert<
  TDefs extends AnyEntityDefs,
  TEntity extends EntityDef,
  TSelect extends Record<string, unknown>,
>(
  entity: EntityClient<TDefs, TEntity>,
  returning?: TSelect,
  options?: InsertOptions<InferResult<TDefs, TEntity, TSelect>[]>,
): UseMutationResult<
  InferResult<TDefs, TEntity, TSelect>[],
  Error,
  { values: TEntity extends { insertInput: infer I } ? I[] : never }
> {
  const queryClient = useQueryClient()
  const shouldInvalidate = options?.invalidate !== false

  return useMutation({
    mutationFn: async (params) => {
      // biome-ignore lint/suspicious/noExplicitAny: generic entity params
      return (await entity.insert({ ...params, returning } as any)) as InferResult<
        TDefs,
        TEntity,
        TSelect
      >[]
    },
    onSuccess: (data) => {
      if (shouldInvalidate) {
        const key = options?.invalidateKey ?? ['gql']
        queryClient.invalidateQueries({ queryKey: key })
      }
      options?.onSuccess?.(data)
    },
    onError: options?.onError,
  })
}

// ─── Update ────────────────────────────────────────────────

type UpdateParams<TEntity extends EntityDef> = {
  set: TEntity extends { updateInput: infer U } ? U : never
  where?: TEntity extends { filters: infer F } ? F : never
}

type UpdateOptions<TResult> = {
  invalidate?: boolean
  invalidateKey?: unknown[]
  onSuccess?: (data: TResult) => void
  onError?: (error: Error) => void
}

export function useEntityUpdate<
  TDefs extends AnyEntityDefs,
  TEntity extends EntityDef,
  TSelect extends Record<string, unknown>,
>(
  entity: EntityClient<TDefs, TEntity>,
  returning?: TSelect,
  options?: UpdateOptions<InferResult<TDefs, TEntity, TSelect>[]>,
): UseMutationResult<InferResult<TDefs, TEntity, TSelect>[], Error, UpdateParams<TEntity>> {
  const queryClient = useQueryClient()
  const shouldInvalidate = options?.invalidate !== false

  return useMutation({
    mutationFn: async (params) => {
      // biome-ignore lint/suspicious/noExplicitAny: generic entity params
      return (await entity.update({ ...params, returning } as any)) as InferResult<
        TDefs,
        TEntity,
        TSelect
      >[]
    },
    onSuccess: (data) => {
      if (shouldInvalidate) {
        const key = options?.invalidateKey ?? ['gql']
        queryClient.invalidateQueries({ queryKey: key })
      }
      options?.onSuccess?.(data)
    },
    onError: options?.onError,
  })
}

// ─── Delete ────────────────────────────────────────────────

type DeleteParams<TEntity extends EntityDef> = {
  where?: TEntity extends { filters: infer F } ? F : never
}

type DeleteOptions<TResult> = {
  invalidate?: boolean
  invalidateKey?: unknown[]
  onSuccess?: (data: TResult) => void
  onError?: (error: Error) => void
}

export function useEntityDelete<
  TDefs extends AnyEntityDefs,
  TEntity extends EntityDef,
  TSelect extends Record<string, unknown>,
>(
  entity: EntityClient<TDefs, TEntity>,
  returning?: TSelect,
  options?: DeleteOptions<InferResult<TDefs, TEntity, TSelect>[]>,
): UseMutationResult<InferResult<TDefs, TEntity, TSelect>[], Error, DeleteParams<TEntity>> {
  const queryClient = useQueryClient()
  const shouldInvalidate = options?.invalidate !== false

  return useMutation({
    mutationFn: async (params) => {
      // biome-ignore lint/suspicious/noExplicitAny: generic entity params
      return (await entity.delete({ ...params, returning } as any)) as InferResult<
        TDefs,
        TEntity,
        TSelect
      >[]
    },
    onSuccess: (data) => {
      if (shouldInvalidate) {
        const key = options?.invalidateKey ?? ['gql']
        queryClient.invalidateQueries({ queryKey: key })
      }
      options?.onSuccess?.(data)
    },
    onError: options?.onError,
  })
}
