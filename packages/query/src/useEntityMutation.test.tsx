/// <reference lib="dom" />

import { describe, expect, mock, test } from 'bun:test'
import { act } from 'react'

import {
  createMockEntityClient,
  createMockGraphQLClient,
  createTestQueryClient,
  createWrapper,
  renderHookAsync,
} from './test-utils'
import { useEntityDelete, useEntityInsert, useEntityUpdate } from './useEntityMutation'

// ─── useEntityInsert ─────────────────────────────────────────

describe('useEntityInsert', () => {
  test('calls entity.insert() with values and returning', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.insert.mockResolvedValueOnce([{ id: '1', name: 'Alice' }])

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const returning = { id: true, name: true }

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityInsert(mockEntity as any, returning),
      { wrapper },
    )

    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock mutation params for testing
      result.current.mutate({ values: [{ name: 'Alice' }] } as any)
    })

    // Wait for mutation to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(mockEntity.insert).toHaveBeenCalledTimes(1)
    const call = mockEntity.insert.mock.calls[0][0]
    expect(call.values).toEqual([{ name: 'Alice' }])
    expect(call.returning).toEqual(returning)
  })

  test('invalidates queries with default key on success', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.insert.mockResolvedValueOnce([{ id: '1' }])

    const mockClient = createMockGraphQLClient(mockEntity)
    const queryClient = createTestQueryClient()
    // biome-ignore lint/suspicious/noExplicitAny: mock invalidateQueries signature
    const invalidateSpy = mock<(filters: any) => Promise<void>>(() => Promise.resolve())
    queryClient.invalidateQueries = invalidateSpy

    const wrapper = createWrapper(mockClient, queryClient)
    const returning = { id: true }

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityInsert(mockEntity as any, returning),
      { wrapper },
    )

    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock mutation params for testing
      result.current.mutate({ values: [{ name: 'Alice' }] } as any)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(invalidateSpy).toHaveBeenCalled()
    expect(invalidateSpy.mock.calls[0]?.[0]).toEqual({ queryKey: ['gql'] })
  })

  test('uses custom invalidateKey when provided', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.insert.mockResolvedValueOnce([{ id: '1' }])

    const mockClient = createMockGraphQLClient(mockEntity)
    const queryClient = createTestQueryClient()
    // biome-ignore lint/suspicious/noExplicitAny: mock invalidateQueries signature
    const invalidateSpy = mock<(filters: any) => Promise<void>>(() => Promise.resolve())
    queryClient.invalidateQueries = invalidateSpy

    const wrapper = createWrapper(mockClient, queryClient)

    const { result } = await renderHookAsync(
      () =>
        // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
        useEntityInsert(mockEntity as any, { id: true }, { invalidateKey: ['gql', 'users'] }),
      { wrapper },
    )

    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock mutation params for testing
      result.current.mutate({ values: [{ name: 'Alice' }] } as any)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(invalidateSpy.mock.calls[0]?.[0]).toEqual({ queryKey: ['gql', 'users'] })
  })

  test('skips invalidation when invalidate is false', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.insert.mockResolvedValueOnce([{ id: '1' }])

    const mockClient = createMockGraphQLClient(mockEntity)
    const queryClient = createTestQueryClient()
    // biome-ignore lint/suspicious/noExplicitAny: mock invalidateQueries signature
    const invalidateSpy = mock<(filters: any) => Promise<void>>(() => Promise.resolve())
    queryClient.invalidateQueries = invalidateSpy

    const wrapper = createWrapper(mockClient, queryClient)

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityInsert(mockEntity as any, { id: true }, { invalidate: false }),
      { wrapper },
    )

    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock mutation params for testing
      result.current.mutate({ values: [{ name: 'Alice' }] } as any)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  test('calls onSuccess callback with returned data', async () => {
    const mockEntity = createMockEntityClient()
    const returnedData = [{ id: '1', name: 'Alice' }]
    mockEntity.insert.mockResolvedValueOnce(returnedData)

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const onSuccess = mock()

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityInsert(mockEntity as any, { id: true, name: true }, { onSuccess }),
      { wrapper },
    )

    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock mutation params for testing
      result.current.mutate({ values: [{ name: 'Alice' }] } as any)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(onSuccess).toHaveBeenCalledWith(returnedData)
  })

  test('calls onError callback when mutation fails', async () => {
    const mockEntity = createMockEntityClient()
    const error = new Error('insert failed')
    mockEntity.insert.mockRejectedValueOnce(error)

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const onError = mock()

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityInsert(mockEntity as any, { id: true }, { onError }),
      { wrapper },
    )

    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock mutation params for testing
      result.current.mutate({ values: [{ name: 'Alice' }] } as any)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBe(error)
  })
})

// ─── useEntityUpdate ─────────────────────────────────────────

describe('useEntityUpdate', () => {
  test('calls entity.update() with set, where, and returning', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.update.mockResolvedValueOnce([{ id: '1', name: 'Updated' }])

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const returning = { id: true, name: true }

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityUpdate(mockEntity as any, returning),
      { wrapper },
    )

    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock mutation params for testing
      result.current.mutate({ set: { name: 'Updated' }, where: { id: { eq: '1' } } } as any)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(mockEntity.update).toHaveBeenCalledTimes(1)
    const call = mockEntity.update.mock.calls[0][0]
    expect(call.set).toEqual({ name: 'Updated' })
    expect(call.where).toEqual({ id: { eq: '1' } })
    expect(call.returning).toEqual(returning)
  })

  test('invalidates queries on success', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.update.mockResolvedValueOnce([{ id: '1' }])

    const mockClient = createMockGraphQLClient(mockEntity)
    const queryClient = createTestQueryClient()
    // biome-ignore lint/suspicious/noExplicitAny: mock invalidateQueries signature
    const invalidateSpy = mock<(filters: any) => Promise<void>>(() => Promise.resolve())
    queryClient.invalidateQueries = invalidateSpy

    const wrapper = createWrapper(mockClient, queryClient)

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityUpdate(mockEntity as any, { id: true }),
      { wrapper },
    )

    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock mutation params for testing
      result.current.mutate({ set: { name: 'Updated' } } as any)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(invalidateSpy).toHaveBeenCalled()
    expect(invalidateSpy.mock.calls[0]?.[0]).toEqual({ queryKey: ['gql'] })
  })

  test('calls onError callback when mutation fails', async () => {
    const mockEntity = createMockEntityClient()
    const error = new Error('update failed')
    mockEntity.update.mockRejectedValueOnce(error)

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const onError = mock()

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityUpdate(mockEntity as any, { id: true }, { onError }),
      { wrapper },
    )

    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock mutation params for testing
      result.current.mutate({ set: { name: 'Updated' } } as any)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBe(error)
  })
})

// ─── useEntityDelete ─────────────────────────────────────────

describe('useEntityDelete', () => {
  test('calls entity.delete() with where and returning', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.delete.mockResolvedValueOnce([{ id: '1' }])

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const returning = { id: true }

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityDelete(mockEntity as any, returning),
      { wrapper },
    )

    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock mutation params for testing
      result.current.mutate({ where: { id: { eq: '1' } } } as any)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(mockEntity.delete).toHaveBeenCalledTimes(1)
    const call = mockEntity.delete.mock.calls[0][0]
    expect(call.where).toEqual({ id: { eq: '1' } })
    expect(call.returning).toEqual(returning)
  })

  test('invalidates queries on success', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.delete.mockResolvedValueOnce([{ id: '1' }])

    const mockClient = createMockGraphQLClient(mockEntity)
    const queryClient = createTestQueryClient()
    // biome-ignore lint/suspicious/noExplicitAny: mock invalidateQueries signature
    const invalidateSpy = mock<(filters: any) => Promise<void>>(() => Promise.resolve())
    queryClient.invalidateQueries = invalidateSpy

    const wrapper = createWrapper(mockClient, queryClient)

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityDelete(mockEntity as any, { id: true }),
      { wrapper },
    )

    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock mutation params for testing
      result.current.mutate({ where: { id: { eq: '1' } } } as any)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(invalidateSpy).toHaveBeenCalled()
    expect(invalidateSpy.mock.calls[0]?.[0]).toEqual({ queryKey: ['gql'] })
  })

  test('skips invalidation when invalidate is false', async () => {
    const mockEntity = createMockEntityClient()
    mockEntity.delete.mockResolvedValueOnce([{ id: '1' }])

    const mockClient = createMockGraphQLClient(mockEntity)
    const queryClient = createTestQueryClient()
    // biome-ignore lint/suspicious/noExplicitAny: mock invalidateQueries signature
    const invalidateSpy = mock<(filters: any) => Promise<void>>(() => Promise.resolve())
    queryClient.invalidateQueries = invalidateSpy

    const wrapper = createWrapper(mockClient, queryClient)

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityDelete(mockEntity as any, { id: true }, { invalidate: false }),
      { wrapper },
    )

    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock mutation params for testing
      result.current.mutate({ where: { id: { eq: '1' } } } as any)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  test('calls onError callback when mutation fails', async () => {
    const mockEntity = createMockEntityClient()
    const error = new Error('delete failed')
    mockEntity.delete.mockRejectedValueOnce(error)

    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)
    const onError = mock()

    const { result } = await renderHookAsync(
      // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
      () => useEntityDelete(mockEntity as any, { id: true }, { onError }),
      { wrapper },
    )

    await act(async () => {
      // biome-ignore lint/suspicious/noExplicitAny: mock mutation params for testing
      result.current.mutate({ where: { id: { eq: '1' } } } as any)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBe(error)
  })
})
