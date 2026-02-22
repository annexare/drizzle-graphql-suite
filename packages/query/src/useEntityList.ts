import { type UseQueryResult, useQuery } from '@tanstack/react-query'
import type {
  AnyEntityDefs,
  EntityClient,
  EntityDef,
  InferResult,
} from 'drizzle-graphql-suite/client'

type EntityListParams<TEntity extends EntityDef, TSelect extends Record<string, unknown>> = {
  select: TSelect
  where?: TEntity extends { filters: infer F } ? F : never
  limit?: number
  offset?: number
  orderBy?: TEntity extends { orderBy: infer O } ? O : never
}

type EntityListOptions = {
  enabled?: boolean
  gcTime?: number
  staleTime?: number
  refetchOnWindowFocus?: boolean
  queryKey?: unknown[]
}

export function useEntityList<
  TDefs extends AnyEntityDefs,
  TEntity extends EntityDef,
  TSelect extends Record<string, unknown>,
>(
  entity: EntityClient<TDefs, TEntity>,
  params: EntityListParams<TEntity, TSelect>,
  options?: EntityListOptions,
): UseQueryResult<InferResult<TDefs, TEntity, TSelect>[]> {
  const queryKey = options?.queryKey ?? [
    'gql',
    'list',
    params.select,
    params.where,
    params.orderBy,
    params.limit,
    params.offset,
  ]

  return useQuery({
    queryKey,
    queryFn: async () => {
      // biome-ignore lint/suspicious/noExplicitAny: generic entity params
      return (await entity.query(params as any)) as InferResult<TDefs, TEntity, TSelect>[]
    },
    enabled: options?.enabled,
    gcTime: options?.gcTime,
    staleTime: options?.staleTime,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  })
}
