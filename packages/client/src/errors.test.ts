import { describe, expect, test } from 'bun:test'

import { GraphQLClientError, NetworkError } from './errors'

describe('GraphQLClientError', () => {
  test('joins error messages with semicolon', () => {
    const err = new GraphQLClientError([
      { message: 'Field not found' },
      { message: 'Invalid type' },
    ])
    expect(err.message).toBe('Field not found; Invalid type')
  })

  test('defaults status to 200', () => {
    const err = new GraphQLClientError([{ message: 'oops' }])
    expect(err.status).toBe(200)
  })

  test('accepts custom status', () => {
    const err = new GraphQLClientError([{ message: 'oops' }], 400)
    expect(err.status).toBe(400)
  })

  test('preserves errors array', () => {
    const errors = [
      { message: 'a', locations: [{ line: 1, column: 2 }] },
      { message: 'b', path: ['query', 'field'] },
    ]
    const err = new GraphQLClientError(errors)
    expect(err.errors).toEqual(errors)
  })

  test('is instanceof Error', () => {
    const err = new GraphQLClientError([{ message: 'test' }])
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('GraphQLClientError')
  })
})

describe('NetworkError', () => {
  test('stores message and status', () => {
    const err = new NetworkError('Connection refused', 0)
    expect(err.message).toBe('Connection refused')
    expect(err.status).toBe(0)
  })

  test('is instanceof Error', () => {
    const err = new NetworkError('timeout', 408)
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('NetworkError')
  })
})
