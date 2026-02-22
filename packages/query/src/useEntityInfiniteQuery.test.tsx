/// <reference lib="dom" />

import { describe, expect, test } from 'bun:test'

import {
  createMockEntityClient,
  createMockGraphQLClient,
  createWrapper,
  renderHookAsync,
} from './test-utils'
import { useEntityInfiniteQuery } from './useEntityInfiniteQuery'

// ─── Tests ───────────────────────────────────────────────────

describe('useEntityInfiniteQuery', () => {
  test('calls entity.query() and entity.count() for the first page', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.query.mockResolvedValueOnce([{ id: '1' }, { id: '2' }])
    mockEntity.count.mockResolvedValueOnce(5)

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true }, pageSize: 2 }

    // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
    await renderHookAsync(() => useEntityInfiniteQuery(mockEntity as any, params), { wrapper })

    expect(mockEntity.query).toHaveBeenCalledTimes(1)
    expect(mockEntity.count).toHaveBeenCalledTimes(1)

    // Verify offset = 0 and limit = pageSize for first page
    const queryCall = mockEntity.query.mock.calls[0][0]
    expect(queryCall.limit).toBe(2)
    expect(queryCall.offset).toBe(0)
  })

  test('returns page data with items and count', async () => {
    const items = [{ id: '1' }, { id: '2' }]
    const mockEntity = createMockEntityClient()
    mockEntity.query.mockResolvedValueOnce(items)
    mockEntity.count.mockResolvedValueOnce(5)

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true }, pageSize: 2 }

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityInfiniteQuery(mockEntity as any, params),
      { wrapper },
    )

    expect(result.current.data?.pages).toHaveLength(1)
    expect(result.current.data?.pages[0].items).toEqual(items)
    expect(result.current.data?.pages[0].count).toBe(5)
  })

  test('has next page when totalFetched < count', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.query.mockResolvedValueOnce([{ id: '1' }, { id: '2' }])
    mockEntity.count.mockResolvedValueOnce(5)

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true }, pageSize: 2 }

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityInfiniteQuery(mockEntity as any, params),
      { wrapper },
    )

    expect(result.current.hasNextPage).toBe(true)
  })

  test('has no next page when all items fetched', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.query.mockResolvedValueOnce([{ id: '1' }, { id: '2' }])
    mockEntity.count.mockResolvedValueOnce(2)

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true }, pageSize: 2 }

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityInfiniteQuery(mockEntity as any, params),
      { wrapper },
    )

    expect(result.current.hasNextPage).toBe(false)
  })

  test('does not fetch when enabled is false', async () => {
    const mockEntity = createMockEntityClient()
    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true }, pageSize: 10 }

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityInfiniteQuery(mockEntity as any, params, { enabled: false }),
      { wrapper },
    )

    expect(mockEntity.query).not.toHaveBeenCalled()
    expect(mockEntity.count).not.toHaveBeenCalled()
    expect(result.current.isFetching).toBe(false)
  })

  test('passes where filter to both query and count', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.query.mockResolvedValueOnce([])
    mockEntity.count.mockResolvedValueOnce(0)

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const where = { status: { eq: 'active' } }
    const params = { select: { id: true }, pageSize: 10, where }

    // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
    await renderHookAsync(() => useEntityInfiniteQuery(mockEntity as any, params as any), {
      wrapper,
    })

    const queryCall = mockEntity.query.mock.calls[0]?.[0]
    expect(queryCall.where).toEqual(where)

    const countCall = mockEntity.count.mock.calls[0]?.[0]
    expect(countCall.where).toEqual(where)
  })
})
