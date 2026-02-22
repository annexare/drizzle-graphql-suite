import {
  buildCountQuery,
  buildDeleteMutation,
  buildInsertMutation,
  buildListQuery,
  buildSingleQuery,
  buildUpdateMutation,
} from './query-builder'
import type {
  AnyEntityDefs,
  EntityDef,
  EntityDescriptor,
  InferResult,
  SchemaDescriptor,
} from './types'

export type EntityClient<TDefs extends AnyEntityDefs, TEntity extends EntityDef> = {
  query<S extends Record<string, unknown>>(params: {
    select: S
    where?: TEntity extends { filters: infer F } ? F : never
    limit?: number
    offset?: number
    orderBy?: TEntity extends { orderBy: infer O } ? O : never
  }): Promise<InferResult<TDefs, TEntity, S>[]>

  querySingle<S extends Record<string, unknown>>(params: {
    select: S
    where?: TEntity extends { filters: infer F } ? F : never
    offset?: number
    orderBy?: TEntity extends { orderBy: infer O } ? O : never
  }): Promise<InferResult<TDefs, TEntity, S> | null>

  count(params?: { where?: TEntity extends { filters: infer F } ? F : never }): Promise<number>

  insert<S extends Record<string, unknown>>(params: {
    values: TEntity extends { insertInput: infer I } ? I[] : never
    returning?: S
  }): Promise<InferResult<TDefs, TEntity, S>[]>

  insertSingle<S extends Record<string, unknown>>(params: {
    values: TEntity extends { insertInput: infer I } ? I : never
    returning?: S
  }): Promise<InferResult<TDefs, TEntity, S> | null>

  update<S extends Record<string, unknown>>(params: {
    set: TEntity extends { updateInput: infer U } ? U : never
    where?: TEntity extends { filters: infer F } ? F : never
    returning?: S
  }): Promise<InferResult<TDefs, TEntity, S>[]>

  delete<S extends Record<string, unknown>>(params: {
    where?: TEntity extends { filters: infer F } ? F : never
    returning?: S
  }): Promise<InferResult<TDefs, TEntity, S>[]>
}

// ─── Implementation ────────────────────────────────────────

export function createEntityClient<TDefs extends AnyEntityDefs, TEntity extends EntityDef>(
  entityName: string,
  entityDef: EntityDescriptor,
  schema: SchemaDescriptor,
  executeGraphQL: (
    query: string,
    variables: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>,
): EntityClient<TDefs, TEntity> {
  return {
    async query(params) {
      const { select, where, limit, offset, orderBy } = params
      const built = buildListQuery(
        entityName,
        entityDef,
        schema,
        select as Record<string, unknown>,
        where != null,
        orderBy != null,
        limit != null,
        offset != null,
      )

      const variables: Record<string, unknown> = {}
      if (where != null) variables.where = where
      if (orderBy != null) variables.orderBy = orderBy
      if (limit != null) variables.limit = limit
      if (offset != null) variables.offset = offset

      const data = await executeGraphQL(built.query, variables)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL response
      return data[entityDef.queryListName] as any
    },

    async querySingle(params) {
      const { select, where, offset, orderBy } = params
      const built = buildSingleQuery(
        entityName,
        entityDef,
        schema,
        select as Record<string, unknown>,
        where != null,
        orderBy != null,
        offset != null,
      )

      const variables: Record<string, unknown> = {}
      if (where != null) variables.where = where
      if (orderBy != null) variables.orderBy = orderBy
      if (offset != null) variables.offset = offset

      const data = await executeGraphQL(built.query, variables)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL response
      return (data[entityDef.queryName] as any) ?? null
    },

    async count(params) {
      const where = params?.where
      const built = buildCountQuery(entityName, entityDef, where != null)

      const variables: Record<string, unknown> = {}
      if (where != null) variables.where = where

      const data = await executeGraphQL(built.query, variables)
      return data[entityDef.countName] as number
    },

    async insert(params) {
      const { values, returning } = params
      const built = buildInsertMutation(
        entityName,
        entityDef,
        schema,
        returning as Record<string, unknown> | undefined,
        false,
      )

      const variables: Record<string, unknown> = { values }

      const data = await executeGraphQL(built.query, variables)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL response
      return data[entityDef.insertName] as any
    },

    async insertSingle(params) {
      const { values, returning } = params
      const built = buildInsertMutation(
        entityName,
        entityDef,
        schema,
        returning as Record<string, unknown> | undefined,
        true,
      )

      const variables: Record<string, unknown> = { values }

      const data = await executeGraphQL(built.query, variables)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL response
      return (data[entityDef.insertSingleName] as any) ?? null
    },

    async update(params) {
      const { set, where, returning } = params
      const built = buildUpdateMutation(
        entityName,
        entityDef,
        schema,
        returning as Record<string, unknown> | undefined,
        where != null,
      )

      const variables: Record<string, unknown> = { set }
      if (where != null) variables.where = where

      const data = await executeGraphQL(built.query, variables)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL response
      return data[entityDef.updateName] as any
    },

    async delete(params) {
      const { where, returning } = params
      const built = buildDeleteMutation(
        entityName,
        entityDef,
        schema,
        returning as Record<string, unknown> | undefined,
        where != null,
      )

      const variables: Record<string, unknown> = {}
      if (where != null) variables.where = where

      const data = await executeGraphQL(built.query, variables)
      // biome-ignore lint/suspicious/noExplicitAny: dynamic GraphQL response
      return data[entityDef.deleteName] as any
    },
  }
}
