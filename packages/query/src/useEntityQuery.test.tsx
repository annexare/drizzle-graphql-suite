/// <reference lib="dom" />

import { describe, expect, test } from 'bun:test'

import {
  createMockEntityClient,
  createMockGraphQLClient,
  createWrapper,
  renderHookAsync,
} from './test-utils'
import { useEntityQuery } from './useEntityQuery'

// ─── Tests ───────────────────────────────────────────────────

describe('useEntityQuery', () => {
  test('calls entity.querySingle() with provided params', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.querySingle.mockResolvedValueOnce({ id: '1', name: 'Alice' })

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true, name: true }, where: { id: { eq: '1' } } }

    // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
    await renderHookAsync(() => useEntityQuery(mockEntity as any, params as any), { wrapper })

    expect(mockEntity.querySingle).toHaveBeenCalledTimes(1)
    expect(mockEntity.querySingle.mock.calls[0][0]).toEqual(params)
  })

  test('returns data on successful query', async () => {
    const mockEntity = createMockEntityClient()
    const row = { id: '1', name: 'Alice' }
    mockEntity.querySingle.mockResolvedValueOnce(row)

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true, name: true } }

    // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
    const { result } = await renderHookAsync(() => useEntityQuery(mockEntity as any, params), {
      wrapper,
    })

    expect(result.current.data).toEqual(row)
  })

  test('returns null when querySingle returns null', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.querySingle.mockResolvedValueOnce(null)

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true } }

    // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
    const { result } = await renderHookAsync(() => useEntityQuery(mockEntity as any, params), {
      wrapper,
    })

    expect(result.current.data).toBeNull()
  })

  test('does not fetch when enabled is false', async () => {
    const mockEntity = createMockEntityClient()
    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true } }

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityQuery(mockEntity as any, params, { enabled: false }),
      { wrapper },
    )

    expect(mockEntity.querySingle).not.toHaveBeenCalled()
    expect(result.current.isFetching).toBe(false)
  })

  test('returns error state when querySingle rejects', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.querySingle.mockRejectedValueOnce(new Error('query failed'))

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const params = { select: { id: true } }

    // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
    const { result } = await renderHookAsync(() => useEntityQuery(mockEntity as any, params), {
      wrapper,
    })

    expect(result.current.isError).toBe(true)
    expect(result.current.error?.message).toBe('query failed')
  })
})
