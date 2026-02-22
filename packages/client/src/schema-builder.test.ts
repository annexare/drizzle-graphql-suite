import { describe, expect, test } from 'bun:test'
import { relations } from 'drizzle-orm'
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { buildSchemaDescriptor } from './schema-builder'

// ─── Test Schema ─────────────────────────────────────────────

const user = pgTable('user', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull(),
  email: text().notNull(),
})

const post = pgTable('post', {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  userId: uuid().notNull(),
})

const comment = pgTable('comment', {
  id: uuid().primaryKey().defaultRandom(),
  body: text().notNull(),
  postId: uuid().notNull(),
})

const userRelations = relations(user, ({ many }) => ({
  posts: many(post),
}))

const postRelations = relations(post, ({ one, many }) => ({
  author: one(user, { fields: [post.userId], references: [user.id] }),
  comments: many(comment),
}))

const commentRelations = relations(comment, ({ one }) => ({
  post: one(post, { fields: [comment.postId], references: [post.id] }),
}))

const schema = { user, post, comment, userRelations, postRelations, commentRelations }

// ─── Phase 1: Table discovery ────────────────────────────────

describe('Phase 1: table discovery', () => {
  test('discovers all tables with columns', () => {
    const desc = buildSchemaDescriptor(schema)
    expect(Object.keys(desc)).toEqual(['user', 'post', 'comment'])
    expect(desc.user.fields).toEqual(['id', 'name', 'email'])
    expect(desc.post.fields).toEqual(['id', 'title', 'userId'])
    expect(desc.comment.fields).toEqual(['id', 'body', 'postId'])
  })

  test('skips excluded tables', () => {
    const desc = buildSchemaDescriptor(schema, { tables: { exclude: ['comment'] } })
    expect(Object.keys(desc)).toEqual(['user', 'post'])
    expect(desc.comment).toBeUndefined()
  })
})

// ─── Phase 2: Relation resolution ────────────────────────────

describe('Phase 2: relation resolution', () => {
  test('resolves one and many relations', () => {
    const desc = buildSchemaDescriptor(schema)
    expect(desc.user.relations).toEqual({
      posts: { entity: 'post', type: 'many' },
    })
    expect(desc.post.relations).toEqual({
      author: { entity: 'user', type: 'one' },
      comments: { entity: 'comment', type: 'many' },
    })
    expect(desc.comment.relations).toEqual({
      post: { entity: 'post', type: 'one' },
    })
  })

  test('excluded table relations are not resolvable', () => {
    const desc = buildSchemaDescriptor(schema, { tables: { exclude: ['comment'] } })
    // post.comments relation target is excluded, so it won't appear
    expect(desc.post.relations.comments).toBeUndefined()
  })
})

// ─── Phase 3: pruneRelations ─────────────────────────────────

describe('Phase 3: pruneRelations', () => {
  test('false removes the relation', () => {
    const desc = buildSchemaDescriptor(schema, {
      pruneRelations: { 'user.posts': false },
    })
    expect(desc.user.relations.posts).toBeUndefined()
  })

  test('leaf keeps the relation', () => {
    const desc = buildSchemaDescriptor(schema, {
      pruneRelations: { 'user.posts': 'leaf' },
    })
    expect(desc.user.relations.posts).toEqual({ entity: 'post', type: 'many' })
  })

  test('{ only } keeps the relation', () => {
    const desc = buildSchemaDescriptor(schema, {
      pruneRelations: { 'post.author': { only: ['name'] } },
    })
    expect(desc.post.relations.author).toEqual({ entity: 'user', type: 'one' })
  })
})

// ─── Phase 4: Operation names ────────────────────────────────

describe('Phase 4: operation names', () => {
  test('generates correct operation names', () => {
    const desc = buildSchemaDescriptor(schema)
    expect(desc.user.queryName).toBe('user')
    expect(desc.user.queryListName).toBe('users')
    expect(desc.user.countName).toBe('userCount')
    expect(desc.user.insertName).toBe('insertIntoUser')
    expect(desc.user.insertSingleName).toBe('insertIntoUserSingle')
    expect(desc.user.updateName).toBe('updateUser')
    expect(desc.user.deleteName).toBe('deleteFromUser')
  })

  test('uses custom list suffix', () => {
    const desc = buildSchemaDescriptor(schema, { suffixes: { list: 'List' } })
    expect(desc.user.queryListName).toBe('userList')
    expect(desc.post.queryListName).toBe('postList')
  })
})
