/// <reference lib="dom" />

import { describe, expect, test } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { useGraphQLClient } from './provider'
import { createMockGraphQLClient, createWrapper, renderHook } from './test-utils'

// ─── Tests ───────────────────────────────────────────────────

describe('GraphQLProvider', () => {
  test('useGraphQLClient throws when used outside <GraphQLProvider>', () => {
    const queryClient = new QueryClient()

    expect(() => {
      renderHook(() => useGraphQLClient(), {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        ),
      })
    }).toThrow('useGraphQLClient must be used within a <GraphQLProvider>')
  })

  test('useGraphQLClient returns the client when inside <GraphQLProvider>', () => {
    const mockClient = createMockGraphQLClient()
    const wrapper = createWrapper(mockClient)

    const { result } = renderHook(() => useGraphQLClient(), { wrapper })

    // biome-ignore lint/suspicious/noExplicitAny: mock client for testing
    expect(result.current).toBe(mockClient as any)
  })
})
