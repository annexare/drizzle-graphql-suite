import { describe, expect, test } from 'bun:test'
import { createTableRelationsHelpers, extractTablesRelationalConfig, relations } from 'drizzle-orm'
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'
import { graphql } from 'graphql'

import { permissive, readOnly, restricted } from './permissions'
import { SchemaBuilder } from './schema-builder'

// ─── Test Schema ─────────────────────────────────────────────

const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
})

const posts = pgTable('posts', {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  authorId: uuid()
    .notNull()
    .references(() => users.id),
})

const comments = pgTable('comments', {
  id: uuid().primaryKey().defaultRandom(),
  body: text().notNull(),
  postId: uuid()
    .notNull()
    .references(() => posts.id),
})

const audit = pgTable('audit', {
  id: uuid().primaryKey().defaultRandom(),
  action: text().notNull(),
})

const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}))

const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  comments: many(comments),
}))

const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
}))

const schema = { users, posts, comments, audit, usersRelations, postsRelations, commentsRelations }

// ─── Mock DB ─────────────────────────────────────────────────

function createMockDb() {
  const { tables, tableNamesMap } = extractTablesRelationalConfig(
    schema,
    createTableRelationsHelpers,
  )

  const findStub = {
    findMany: () => Promise.resolve([]),
    findFirst: () => Promise.resolve(null),
  }
  const query = Object.fromEntries(Object.keys(tables).map((name) => [name, findStub]))

  return {
    _: { fullSchema: schema, schema: tables, tableNamesMap },
    query,
    select: () => ({ from: () => ({ where: () => ({}) }) }),
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function buildWithPermissions() {
  const mockDb = createMockDb()
  // biome-ignore lint/suspicious/noExplicitAny: mock db for testing
  const builder = new SchemaBuilder(mockDb as any)
  return builder.build()
}

function getQueryFieldNames(gqlSchema: import('graphql').GraphQLSchema): string[] {
  const queryType = gqlSchema.getQueryType()
  if (!queryType) return []
  return Object.keys(queryType.getFields())
}

function getMutationFieldNames(gqlSchema: import('graphql').GraphQLSchema): string[] {
  const mutationType = gqlSchema.getMutationType()
  if (!mutationType) return []
  return Object.keys(mutationType.getFields())
}

// ─── Tests ───────────────────────────────────────────────────

describe('readOnly helper', () => {
  test('returns correct TableAccess', () => {
    expect(readOnly()).toEqual({
      query: true,
      insert: false,
      update: false,
      delete: false,
    })
  })
})

describe('permissive()', () => {
  test('no overrides → introspection matches full schema', () => {
    const { schema: fullSchema, withPermissions } = buildWithPermissions()
    const adminSchema = withPermissions(permissive('admin'))

    const fullQueries = getQueryFieldNames(fullSchema)
    const adminQueries = getQueryFieldNames(adminSchema)
    expect(adminQueries.sort()).toEqual(fullQueries.sort())

    const fullMutations = getMutationFieldNames(fullSchema)
    const adminMutations = getMutationFieldNames(adminSchema)
    expect(adminMutations.sort()).toEqual(fullMutations.sort())
  })

  test('audit: false → audit removed from types, relations, filters everywhere', () => {
    const { withPermissions } = buildWithPermissions()
    const s = withPermissions(permissive('no-audit', { audit: false }))

    const queries = getQueryFieldNames(s)
    expect(queries).not.toContain('audit')
    expect(queries).not.toContain('auditSingle')
    expect(queries).not.toContain('auditCount')

    const mutations = getMutationFieldNames(s)
    expect(mutations).not.toContain('insertIntoAudit')
    expect(mutations).not.toContain('insertIntoAuditSingle')
    expect(mutations).not.toContain('updateAudit')
    expect(mutations).not.toContain('deleteFromAudit')

    // Other tables should still exist
    expect(queries).toContain('users')
    expect(queries).toContain('posts')
  })

  test('users: readOnly() → user queries exist, no user mutations', () => {
    const { withPermissions } = buildWithPermissions()
    const s = withPermissions(permissive('read-only-users', { users: readOnly() }))

    const queries = getQueryFieldNames(s)
    expect(queries).toContain('users')
    expect(queries).toContain('usersSingle')
    expect(queries).toContain('usersCount')

    const mutations = getMutationFieldNames(s)
    expect(mutations).not.toContain('insertIntoUsers')
    expect(mutations).not.toContain('insertIntoUsersSingle')
    expect(mutations).not.toContain('updateUsers')
    expect(mutations).not.toContain('deleteFromUsers')

    // Other tables' mutations should still exist
    expect(mutations).toContain('insertIntoPosts')
  })
})

describe('restricted()', () => {
  test('no tables → only _empty query field, no mutations', () => {
    const { withPermissions } = buildWithPermissions()
    const s = withPermissions(restricted('anon'))

    const queries = getQueryFieldNames(s)
    expect(queries).toEqual(['_empty'])
    expect(s.getMutationType()).toBeUndefined()
  })

  test('posts: true → only post query + mutation entry points', () => {
    const { withPermissions } = buildWithPermissions()
    const s = withPermissions(restricted('posts-only', { posts: true }))

    const queries = getQueryFieldNames(s)
    expect(queries).toContain('posts')
    expect(queries).toContain('postsSingle')
    expect(queries).toContain('postsCount')
    expect(queries).not.toContain('users')
    expect(queries).not.toContain('audit')

    const mutations = getMutationFieldNames(s)
    expect(mutations).toContain('insertIntoPosts')
    expect(mutations).toContain('updatePosts')
    expect(mutations).toContain('deleteFromPosts')
    expect(mutations).not.toContain('insertIntoUsers')
  })

  test('posts: { query: true } → only post queries, no mutations', () => {
    const { withPermissions } = buildWithPermissions()
    const s = withPermissions(restricted('posts-read', { posts: { query: true } }))

    const queries = getQueryFieldNames(s)
    expect(queries).toContain('posts')
    expect(queries).toContain('postsSingle')
    expect(queries).toContain('postsCount')

    // No post mutations (insert/update/delete default to false in restricted mode)
    const mutations = getMutationFieldNames(s)
    expect(mutations).not.toContain('insertIntoPosts')
    expect(mutations).not.toContain('updatePosts')
    expect(mutations).not.toContain('deleteFromPosts')
  })

  test('posts: { query: true }, comments: { query: true } → two table queries only', () => {
    const { withPermissions } = buildWithPermissions()
    const s = withPermissions(
      restricted('user', { posts: { query: true }, comments: { query: true } }),
    )

    const queries = getQueryFieldNames(s)
    expect(queries).toContain('posts')
    expect(queries).toContain('comments')
    expect(queries).not.toContain('users')
    expect(queries).not.toContain('audit')
  })
})

describe('granular mutation control', () => {
  test('insert: true, update: true, delete: false → insert/update exist, no delete', () => {
    const { withPermissions } = buildWithPermissions()
    const s = withPermissions(
      permissive('no-delete-posts', {
        posts: { query: true, insert: true, update: true, delete: false },
      }),
    )

    const mutations = getMutationFieldNames(s)
    expect(mutations).toContain('insertIntoPosts')
    expect(mutations).toContain('insertIntoPostsSingle')
    expect(mutations).toContain('updatePosts')
    expect(mutations).not.toContain('deleteFromPosts')
  })

  test('insert: false, update: false, delete: true → only delete', () => {
    const { withPermissions } = buildWithPermissions()
    const s = withPermissions(
      restricted('delete-only', {
        posts: { query: true, insert: false, update: false, delete: true },
      }),
    )

    const mutations = getMutationFieldNames(s)
    expect(mutations).not.toContain('insertIntoPosts')
    expect(mutations).not.toContain('updatePosts')
    expect(mutations).toContain('deleteFromPosts')
  })
})

describe('caching', () => {
  test('same id returns same GraphQLSchema reference', () => {
    const { withPermissions } = buildWithPermissions()
    const a = withPermissions(restricted('cached', { posts: true }))
    const b = withPermissions(restricted('cached', { posts: true }))
    expect(a).toBe(b)
  })

  test('different id returns different schemas', () => {
    const { withPermissions } = buildWithPermissions()
    const a = withPermissions(restricted('role-a', { posts: true }))
    const b = withPermissions(restricted('role-b', { users: true }))
    expect(a).not.toBe(b)
  })
})

describe('edge cases', () => {
  test('unknown table names in permissions are silently ignored', () => {
    const { withPermissions } = buildWithPermissions()
    expect(() => withPermissions(permissive('unknown', { nonexistent: false }))).not.toThrow()
  })

  test('restricted with all tables false yields empty schema', () => {
    const { withPermissions } = buildWithPermissions()
    const s = withPermissions(
      restricted('none', { users: false, posts: false, comments: false, audit: false }),
    )
    const queries = getQueryFieldNames(s)
    expect(queries).toEqual(['_empty'])
  })
})

describe('introspection', () => {
  test('introspection query returns only permitted query fields', async () => {
    const { withPermissions } = buildWithPermissions()
    const s = withPermissions(restricted('intro-test', { posts: { query: true } }))

    const result = await graphql({
      schema: s,
      source: '{ __schema { queryType { fields { name } } } }',
    })

    expect(result.errors).toBeUndefined()
    // biome-ignore lint/suspicious/noExplicitAny: introspection result access
    const fieldNames = (result.data as any).__schema.queryType.fields.map(
      // biome-ignore lint/suspicious/noExplicitAny: introspection field shape
      (f: any) => f.name,
    )
    expect(fieldNames).toContain('posts')
    expect(fieldNames).toContain('postsSingle')
    expect(fieldNames).toContain('postsCount')
    expect(fieldNames).not.toContain('users')
    expect(fieldNames).not.toContain('audit')
  })

  test('excluded table types do not appear in introspection', async () => {
    const { withPermissions } = buildWithPermissions()
    const s = withPermissions(permissive('no-audit-intro', { audit: false }))

    const result = await graphql({
      schema: s,
      source: '{ __schema { types { name } } }',
    })

    expect(result.errors).toBeUndefined()
    // biome-ignore lint/suspicious/noExplicitAny: introspection result access
    const typeNames = (result.data as any).__schema.types.map(
      // biome-ignore lint/suspicious/noExplicitAny: introspection field shape
      (t: any) => t.name,
    ) as string[]
    expect(typeNames).not.toContain('AuditSelectItem')
    expect(typeNames).not.toContain('AuditItem')
    expect(typeNames).not.toContain('AuditInsertInput')
  })
})
