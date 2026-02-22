/// <reference lib="dom" />

import { describe, expect, test } from 'bun:test'

import {
  createMockEntityClient,
  createMockGraphQLClient,
  createWrapper,
  renderHookAsync,
} from './test-utils'
import { useEntityList } from './useEntityList'

// ─── Tests ───────────────────────────────────────────────────

describe('useEntityList', () => {
  test('calls entity.query() with provided params', async () => {
    const rows = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]
    const mockEntity = createMockEntityClient()
    mockEntity.query.mockResolvedValueOnce(rows)

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true, name: true }, limit: 10, offset: 0 }

    // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
    await renderHookAsync(() => useEntityList(mockEntity as any, params), { wrapper })

    expect(mockEntity.query).toHaveBeenCalledTimes(1)
    expect(mockEntity.query.mock.calls[0][0]).toEqual(params)
  })

  test('returns array of results on success', async () => {
    const rows = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]
    const mockEntity = createMockEntityClient()
    mockEntity.query.mockResolvedValueOnce(rows)

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true, name: true } }

    // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
    const { result } = await renderHookAsync(() => useEntityList(mockEntity as any, params), {
      wrapper,
    })

    expect(result.current.data).toEqual(rows)
  })

  test('returns empty array when no results', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.query.mockResolvedValueOnce([])

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true } }

    // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
    const { result } = await renderHookAsync(() => useEntityList(mockEntity as any, params), {
      wrapper,
    })

    expect(result.current.data).toEqual([])
  })

  test('does not fetch when enabled is false', async () => {
    const mockEntity = createMockEntityClient()
    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true } }

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityList(mockEntity as any, params, { enabled: false }),
      { wrapper },
    )

    expect(mockEntity.query).not.toHaveBeenCalled()
    expect(result.current.isFetching).toBe(false)
  })

  test('passes where, orderBy, limit, and offset params', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.query.mockResolvedValueOnce([])

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = {
      select: { id: true },
      where: { name: { eq: 'Alice' } },
      orderBy: { name: 'asc' },
      limit: 5,
      offset: 10,
    }

    // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
    await renderHookAsync(() => useEntityList(mockEntity as any, params as any), { wrapper })

    expect(mockEntity.query.mock.calls[0]?.[0]).toEqual(params)
  })

  test('returns error state when query rejects', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.query.mockRejectedValueOnce(new Error('list failed'))

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true } }

    // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
    const { result } = await renderHookAsync(() => useEntityList(mockEntity as any, params), {
      wrapper,
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.error?.message).toBe('list failed')
  })
})
