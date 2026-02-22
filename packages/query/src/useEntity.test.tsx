/// <reference lib="dom" />

import { describe, expect, test } from 'bun:test'

import {
  createMockEntityClient,
  createMockGraphQLClient,
  createWrapper,
  renderHook,
} from './test-utils'
import { useEntity } from './useEntity'

// ─── Tests ───────────────────────────────────────────────────

describe('useEntity', () => {
  test('calls client.entity() with the correct entity name', () => {
    const mockEntity = createMockEntityClient()
    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)

    renderHook(() => useEntity('user'), { wrapper })

    expect(mockClient.entity).toHaveBeenCalledTimes(1)
    expect(mockClient.entity.mock.calls[0]?.[0]).toBe('user')
  })

  test('returns the EntityClient from client.entity()', () => {
    const mockEntity = createMockEntityClient()
    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)

    const { result } = renderHook(() => useEntity('user'), { wrapper })

    // biome-ignore lint/suspicious/noExplicitAny: mock entity for testing
    expect(result.current).toBe(mockEntity as any)
  })

  test('returns memoized result on re-render with same entity name', () => {
    const mockEntity = createMockEntityClient()
    const mockClient = createMockGraphQLClient(mockEntity)
    const wrapper = createWrapper(mockClient)

    const { result, rerender } = renderHook(() => useEntity('user'), { wrapper })
    const firstResult = result.current

    rerender()

    expect(result.current).toBe(firstResult)
  })
})
