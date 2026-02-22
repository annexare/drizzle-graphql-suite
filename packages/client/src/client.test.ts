import { afterEach, describe, expect, mock, test } from 'bun:test'
import { relations } from 'drizzle-orm'
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

import { createDrizzleClient, GraphQLClient } from './client'
import { GraphQLClientError, NetworkError } from './errors'
import type { SchemaDescriptor } from './types'

// ─── Fixtures ────────────────────────────────────────────────

const testSchema: SchemaDescriptor = {
  user: {
    queryName: 'user',
    queryListName: 'users',
    countName: 'userCount',
    insertName: 'insertIntoUser',
    insertSingleName: 'insertIntoUserSingle',
    updateName: 'updateUser',
    deleteName: 'deleteFromUser',
    fields: ['id', 'name'],
    relations: {},
  },
}

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function mockFetch(response: {
  ok?: boolean
  status?: number
  statusText?: string
  json?: () => Promise<unknown>
  throwError?: Error
}) {
  if (response.throwError) {
    globalThis.fetch = mock(() => Promise.reject(response.throwError)) as unknown as typeof fetch
    return
  }

  globalThis.fetch = mock(
    () =>
      Promise.resolve({
        ok: response.ok ?? true,
        status: response.status ?? 200,
        statusText: response.statusText ?? 'OK',
        json: response.json ?? (() => Promise.resolve({ data: {} })),
      }) as Promise<Response>,
  ) as unknown as typeof fetch
}

// ─── Constructor & entity ────────────────────────────────────

describe('GraphQLClient', () => {
  test('entity() returns EntityClient for valid name', () => {
    const client = new GraphQLClient({ url: 'http://test', schema: testSchema })
    const entity = client.entity('user')
    expect(entity).toBeDefined()
    expect(typeof entity.query).toBe('function')
    expect(typeof entity.count).toBe('function')
  })

  test('entity() throws for unknown name', () => {
    const client = new GraphQLClient({ url: 'http://test', schema: testSchema })
    // biome-ignore lint/suspicious/noExplicitAny: testing invalid input
    expect(() => client.entity('nonexistent' as any)).toThrow("Entity 'nonexistent' not found")
  })
})

// ─── execute ─────────────────────────────────────────────────

describe('execute', () => {
  test('sends POST with JSON body', async () => {
    mockFetch({ json: () => Promise.resolve({ data: { users: [] } }) })

    const client = new GraphQLClient({ url: 'http://test/graphql', schema: testSchema })
    await client.execute('query { users { id } }', { limit: 10 })

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [url, options] = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock
      .calls[0] as [string, RequestInit]
    expect(url).toBe('http://test/graphql')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body as string)).toEqual({
      query: 'query { users { id } }',
      variables: { limit: 10 },
    })
  })

  test('uses function URL', async () => {
    mockFetch({ json: () => Promise.resolve({ data: {} }) })

    const client = new GraphQLClient({ url: () => 'http://dynamic/gql', schema: testSchema })
    await client.execute('query { users { id } }')

    const [url] = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock.calls[0] as [string]
    expect(url).toBe('http://dynamic/gql')
  })

  test('merges static headers', async () => {
    mockFetch({ json: () => Promise.resolve({ data: {} }) })

    const client = new GraphQLClient({
      url: 'http://test',
      schema: testSchema,
      headers: { Authorization: 'Bearer token123' },
    })
    await client.execute('query {}')

    const [, options] = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = options.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers.Authorization).toBe('Bearer token123')
  })

  test('calls async function headers', async () => {
    mockFetch({ json: () => Promise.resolve({ data: {} }) })

    const client = new GraphQLClient({
      url: 'http://test',
      schema: testSchema,
      headers: async () => ({ 'X-Custom': 'async-value' }),
    })
    await client.execute('query {}')

    const [, options] = (globalThis.fetch as unknown as ReturnType<typeof mock>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const headers = options.headers as Record<string, string>
    expect(headers['X-Custom']).toBe('async-value')
  })

  test('returns json.data on success', async () => {
    mockFetch({ json: () => Promise.resolve({ data: { users: [{ id: '1' }] } }) })

    const client = new GraphQLClient({ url: 'http://test', schema: testSchema })
    const result = await client.execute('query { users { id } }')
    expect(result).toEqual({ users: [{ id: '1' }] })
  })
})

// ─── Error paths ─────────────────────────────────────────────

describe('error handling', () => {
  test('fetch throws wraps in NetworkError', async () => {
    mockFetch({ throwError: new Error('ECONNREFUSED') })

    const client = new GraphQLClient({ url: 'http://test', schema: testSchema })
    try {
      await client.execute('query {}')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(NetworkError)
      expect((e as NetworkError).message).toBe('ECONNREFUSED')
      expect((e as NetworkError).status).toBe(0)
    }
  })

  test('non-ok response throws NetworkError', async () => {
    mockFetch({ ok: false, status: 500, statusText: 'Internal Server Error' })

    const client = new GraphQLClient({ url: 'http://test', schema: testSchema })
    try {
      await client.execute('query {}')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(NetworkError)
      expect((e as NetworkError).status).toBe(500)
    }
  })

  test('GraphQL errors throw GraphQLClientError', async () => {
    mockFetch({
      json: () =>
        Promise.resolve({
          errors: [{ message: 'Field not found' }],
        }),
    })

    const client = new GraphQLClient({ url: 'http://test', schema: testSchema })
    try {
      await client.execute('query {}')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(GraphQLClientError)
      expect((e as GraphQLClientError).errors[0].message).toBe('Field not found')
    }
  })

  test('no data in response throws GraphQLClientError', async () => {
    mockFetch({ json: () => Promise.resolve({}) })

    const client = new GraphQLClient({ url: 'http://test', schema: testSchema })
    try {
      await client.execute('query {}')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(GraphQLClientError)
      expect((e as GraphQLClientError).message).toBe('No data in response')
    }
  })

  test('fetch throws non-Error wraps in NetworkError with generic message', async () => {
    globalThis.fetch = mock(() => Promise.reject('network down')) as unknown as typeof fetch

    const client = new GraphQLClient({ url: 'http://test', schema: testSchema })
    try {
      await client.execute('query {}')
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(NetworkError)
      expect((e as NetworkError).message).toBe('Network request failed')
      expect((e as NetworkError).status).toBe(0)
    }
  })
})

// ─── createDrizzleClient factory ────────────────────────────

describe('createDrizzleClient', () => {
  const author = pgTable('author', {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
  })

  const post = pgTable('post', {
    id: uuid().primaryKey().defaultRandom(),
    title: text().notNull(),
    authorId: uuid()
      .notNull()
      .references(() => author.id),
  })

  const authorRelations = relations(author, ({ many }) => ({
    posts: many(post),
  }))

  const postRelations = relations(post, ({ one }) => ({
    author: one(author, { fields: [post.authorId], references: [author.id] }),
  }))

  test('creates a GraphQLClient with working entity()', () => {
    const client = createDrizzleClient({
      schema: { author, post, authorRelations, postRelations },
      config: {},
      url: 'http://test/graphql',
    })

    expect(client).toBeInstanceOf(GraphQLClient)
    const authorEntity = client.entity('author')
    expect(authorEntity).toBeDefined()
    expect(typeof authorEntity.query).toBe('function')
  })

  test('entity has correct operation methods', () => {
    const client = createDrizzleClient({
      schema: { author, post, authorRelations, postRelations },
      config: {},
      url: 'http://test/graphql',
    })

    const authorEntity = client.entity('author')
    expect(typeof authorEntity.query).toBe('function')
    expect(typeof authorEntity.querySingle).toBe('function')
    expect(typeof authorEntity.count).toBe('function')
    expect(typeof authorEntity.insert).toBe('function')
    expect(typeof authorEntity.update).toBe('function')
    expect(typeof authorEntity.delete).toBe('function')
  })
})
