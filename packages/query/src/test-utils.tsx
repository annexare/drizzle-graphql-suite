/// <reference lib="dom" />

import './test-setup'

import { mock } from 'bun:test'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, createElement, createRef, type ReactNode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'

import { GraphQLProvider } from './provider'

// ─── Custom renderHook ───────────────────────────────────────

type RenderHookOptions = {
  wrapper?: (props: { children: ReactNode }) => ReactNode
}

type RenderHookResult<T> = {
  result: { current: T }
  rerender: () => void
  unmount: () => void
}

export function renderHook<T>(callback: () => T, options?: RenderHookOptions): RenderHookResult<T> {
  const result = createRef<T>()

  function TestComponent() {
    const value = callback()
    useEffect(() => {
      ;(result as { current: T }).current = value
    })
    return null
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  const element = options?.wrapper
    ? createElement(options.wrapper, null, createElement(TestComponent))
    : createElement(TestComponent)

  act(() => {
    root.render(element)
  })

  return {
    result: result as { current: T },
    rerender: () => {
      act(() => {
        root.render(element)
      })
    },
    unmount: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

// ─── Async renderHook ────────────────────────────────────────

/** Flush microtasks by yielding to the event loop */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Poll until `predicate` returns true, flushing React updates each iteration.
 * Times out after `timeout` ms (default 1000).
 */
async function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const deadline = Date.now() + timeout
  while (!predicate()) {
    if (Date.now() > deadline) break
    await act(async () => {
      await flushMicrotasks()
    })
  }
}

export async function renderHookAsync<T>(
  callback: () => T,
  options?: RenderHookOptions,
): Promise<RenderHookResult<T>> {
  const result = createRef<T>()

  function TestComponent() {
    const value = callback()
    // Write synchronously so result.current is up-to-date after every render
    ;(result as { current: T }).current = value
    return null
  }

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  const element = options?.wrapper
    ? createElement(options.wrapper, null, createElement(TestComponent))
    : createElement(TestComponent)

  await act(async () => {
    root.render(element)
  })

  // Wait for async queries to settle (isPending → false)
  await waitFor(() => {
    const cur = result.current
    if (cur != null && typeof cur === 'object') {
      // TanStack Query hooks expose isPending; wait until it's false
      if ('isPending' in cur && typeof cur.isPending === 'boolean') {
        return !cur.isPending
      }
    }
    return true
  })

  return {
    result: result as { current: T },
    rerender: async () => {
      await act(async () => {
        root.render(element)
      })
    },
    unmount: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  } as RenderHookResult<T>
}

// ─── Mock Factories ──────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: mock params for testing
type MockParams = any

export function createMockEntityClient() {
  return {
    query: mock<(p: MockParams) => Promise<Record<string, unknown>[]>>(() => Promise.resolve([])),
    querySingle: mock<(p: MockParams) => Promise<Record<string, unknown> | null>>(() =>
      Promise.resolve(null),
    ),
    count: mock<(p: MockParams) => Promise<number>>(() => Promise.resolve(0)),
    insert: mock<(p: MockParams) => Promise<Record<string, unknown>[]>>(() => Promise.resolve([])),
    insertSingle: mock<(p: MockParams) => Promise<Record<string, unknown> | null>>(() =>
      Promise.resolve(null),
    ),
    update: mock<(p: MockParams) => Promise<Record<string, unknown>[]>>(() => Promise.resolve([])),
    delete: mock<(p: MockParams) => Promise<Record<string, unknown>[]>>(() => Promise.resolve([])),
  }
}

// biome-ignore lint/suspicious/noExplicitAny: mock client for testing
export function createMockGraphQLClient(entityClient: any = createMockEntityClient()) {
  return {
    // biome-ignore lint/suspicious/noExplicitAny: mock entity name parameter
    entity: mock<(name: string) => any>(() => entityClient),
    url: 'http://localhost/graphql',
    schema: {},
    execute: mock(() => Promise.resolve({ data: {} })),
  }
}

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })
}

// biome-ignore lint/suspicious/noExplicitAny: mock client for testing
export function createWrapper(mockClient: any, queryClient?: QueryClient) {
  const qc = queryClient ?? createTestQueryClient()
  return function TestWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <GraphQLProvider client={mockClient}>{children}</GraphQLProvider>
      </QueryClientProvider>
    )
  }
}
