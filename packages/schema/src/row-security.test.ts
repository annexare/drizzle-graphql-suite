import { describe, expect, test } from 'bun:test'
import type { GraphQLResolveInfo } from 'graphql'

import { mergeHooks, withRowSecurity } from './row-security'
import type { HooksConfig } from './types'

const mockInfo = {} as GraphQLResolveInfo

// ─── withRowSecurity ─────────────────────────────────────────

describe('withRowSecurity', () => {
  test('returns correct HooksConfig structure', () => {
    const hooks = withRowSecurity({
      posts: (ctx) => ({ authorId: { eq: ctx.user.id } }),
    })

    expect(hooks.posts).toBeDefined()
    expect(hooks.posts?.query).toBeDefined()
    expect(hooks.posts?.querySingle).toBeDefined()
    expect(hooks.posts?.count).toBeDefined()
    expect(hooks.posts?.update).toBeDefined()
    expect(hooks.posts?.delete).toBeDefined()
    // insert and insertSingle should NOT have hooks (no WHERE for inserts)
    expect(hooks.posts?.insert).toBeUndefined()
    expect(hooks.posts?.insertSingle).toBeUndefined()
  })

  test('generated hooks inject WHERE into args', async () => {
    const hooks = withRowSecurity({
      posts: (ctx) => ({ authorId: { eq: ctx.userId } }),
    })

    const queryHook = hooks.posts?.query
    expect(queryHook).toBeDefined()
    if (!queryHook || !('before' in queryHook) || !queryHook.before) return

    const result = await queryHook.before({
      args: { limit: 10 },
      context: { userId: '123' },
      info: mockInfo,
    })

    expect(result).toBeDefined()
    expect(result?.args).toEqual({
      limit: 10,
      where: { authorId: { eq: '123' } },
    })
  })

  test('generated hooks merge with existing WHERE', async () => {
    const hooks = withRowSecurity({
      posts: (ctx) => ({ authorId: { eq: ctx.userId } }),
    })

    const queryHook = hooks.posts?.query
    if (!queryHook || !('before' in queryHook) || !queryHook.before) return

    const result = await queryHook.before({
      args: { where: { title: { eq: 'test' } }, limit: 5 },
      context: { userId: '456' },
      info: mockInfo,
    })

    expect(result?.args?.where).toEqual({
      title: { eq: 'test' },
      authorId: { eq: '456' },
    })
    expect(result?.args?.limit).toBe(5)
  })

  test('security rule overrides user-supplied WHERE on same field', async () => {
    const hooks = withRowSecurity({
      posts: (ctx) => ({ authorId: { eq: ctx.userId } }),
    })

    const queryHook = hooks.posts?.query
    if (!queryHook || !('before' in queryHook) || !queryHook.before) return

    const result = await queryHook.before({
      args: { where: { authorId: { eq: 'attacker-id' } } },
      context: { userId: 'real-owner' },
      info: mockInfo,
    })

    // The security rule must win over the user-supplied value
    expect(result?.args?.where).toEqual({
      authorId: { eq: 'real-owner' },
    })
  })
})

// ─── mergeHooks ──────────────────────────────────────────────

describe('mergeHooks', () => {
  test('chains before hooks correctly (both run)', async () => {
    const calls: string[] = []

    const hooksA: HooksConfig = {
      posts: {
        query: {
          before: async (ctx) => {
            calls.push('A')
            return { args: { ...ctx.args, fromA: true } }
          },
        },
      },
    }

    const hooksB: HooksConfig = {
      posts: {
        query: {
          before: async (ctx) => {
            calls.push('B')
            return { args: { ...ctx.args, fromB: true } }
          },
        },
      },
    }

    const merged = mergeHooks(hooksA, hooksB)
    const hook = merged.posts?.query
    expect(hook).toBeDefined()
    if (!hook || !('before' in hook) || !hook.before) return

    const result = await hook.before({
      args: { original: true },
      context: {},
      info: mockInfo,
    })

    expect(calls).toEqual(['A', 'B'])
    // B receives A's modified args via ctx, and spreads them
    expect(result?.args?.fromA).toBe(true)
    expect(result?.args?.fromB).toBe(true)
  })

  test('chains after hooks correctly', async () => {
    const hooksA: HooksConfig = {
      posts: {
        query: {
          after: async (ctx) => {
            return [...ctx.result, 'fromA']
          },
        },
      },
    }

    const hooksB: HooksConfig = {
      posts: {
        query: {
          after: async (ctx) => {
            return [...ctx.result, 'fromB']
          },
        },
      },
    }

    const merged = mergeHooks(hooksA, hooksB)
    const hook = merged.posts?.query
    if (!hook || !('after' in hook) || !hook.after) return

    const result = await hook.after({
      result: ['initial'],
      beforeData: undefined,
      context: {},
      info: mockInfo,
    })

    expect(result).toEqual(['initial', 'fromA', 'fromB'])
  })

  test('resolve hooks — last one wins', () => {
    const hooksA: HooksConfig = {
      posts: {
        query: {
          resolve: async (ctx) => ctx.defaultResolve(),
        },
      },
    }

    const hooksB: HooksConfig = {
      posts: {
        query: {
          resolve: async () => 'custom',
        },
      },
    }

    const merged = mergeHooks(hooksA, hooksB)
    const hook = merged.posts?.query
    expect(hook).toBeDefined()
    if (!hook || !('resolve' in hook) || !hook.resolve) return
    // The resolve function should be from hooksB
    const bQuery = hooksB.posts?.query
    if (!bQuery || !('resolve' in bQuery)) return
    expect(hook.resolve).toBe(bQuery.resolve)
  })

  test('resolve hook (first) replaced by before/after hooks (second)', () => {
    const hooksA: HooksConfig = {
      posts: {
        query: {
          resolve: async () => 'custom',
        },
      },
    }

    const hooksB: HooksConfig = {
      posts: {
        query: {
          before: async () => ({ args: { replaced: true } }),
          after: async (ctx) => ctx.result,
        },
      },
    }

    const merged = mergeHooks(hooksA, hooksB)
    const hook = merged.posts?.query
    expect(hook).toBeDefined()
    // before/after should replace resolve entirely
    expect(hook && 'resolve' in hook).toBe(false)
    expect(hook && 'before' in hook).toBe(true)
    expect(hook && 'after' in hook).toBe(true)
  })

  test('before/after hooks (first) replaced by resolve hook (second)', () => {
    const hooksA: HooksConfig = {
      posts: {
        query: {
          before: async () => ({ args: { original: true } }),
          after: async (ctx) => ctx.result,
        },
      },
    }

    const hooksB: HooksConfig = {
      posts: {
        query: {
          resolve: async () => 'overridden',
        },
      },
    }

    const merged = mergeHooks(hooksA, hooksB)
    const hook = merged.posts?.query
    expect(hook).toBeDefined()
    // resolve should replace before/after entirely
    expect(hook && 'resolve' in hook).toBe(true)
    expect(hook && 'before' in hook).toBe(false)
    expect(hook && 'after' in hook).toBe(false)
  })

  test('handles undefined configs', () => {
    const hooksA: HooksConfig = {
      posts: {
        query: {
          before: async () => ({ args: { test: true } }),
        },
      },
    }

    const merged = mergeHooks(undefined, hooksA, undefined)
    expect(merged.posts?.query).toBeDefined()
  })

  test('merges hooks for different tables', () => {
    const hooksA: HooksConfig = {
      posts: {
        query: { before: async () => undefined },
      },
    }

    const hooksB: HooksConfig = {
      comments: {
        query: { before: async () => undefined },
      },
    }

    const merged = mergeHooks(hooksA, hooksB)
    expect(merged.posts?.query).toBeDefined()
    expect(merged.comments?.query).toBeDefined()
  })

  test('merges hooks for different operations on same table', () => {
    const hooksA: HooksConfig = {
      posts: {
        query: { before: async () => undefined },
      },
    }

    const hooksB: HooksConfig = {
      posts: {
        insert: { before: async () => undefined },
      },
    }

    const merged = mergeHooks(hooksA, hooksB)
    expect(merged.posts?.query).toBeDefined()
    expect(merged.posts?.insert).toBeDefined()
  })

  test('before hook passes modified args to next hook', async () => {
    const hooksA: HooksConfig = {
      posts: {
        query: {
          before: async (ctx) => {
            return { args: { ...ctx.args, step: 1 } }
          },
        },
      },
    }

    const hooksB: HooksConfig = {
      posts: {
        query: {
          before: async (ctx) => {
            // Should receive modified args from hooksA
            return { args: { ...ctx.args, step: (ctx.args.step ?? 0) + 1 } }
          },
        },
      },
    }

    const merged = mergeHooks(hooksA, hooksB)
    const hook = merged.posts?.query
    if (!hook || !('before' in hook) || !hook.before) return

    const result = await hook.before({
      args: {},
      context: {},
      info: mockInfo,
    })

    expect(result?.args?.step).toBe(2)
  })
})
