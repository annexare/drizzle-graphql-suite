import { describe, expect, test } from 'bun:test'
import { Kind } from 'graphql'

import { GraphQLJSON } from './scalars'

describe('GraphQLJSON', () => {
  describe('serialize', () => {
    test('returns value as-is', () => {
      expect(GraphQLJSON.serialize('hello')).toBe('hello')
      expect(GraphQLJSON.serialize(42)).toBe(42)
      expect(GraphQLJSON.serialize(null)).toBeNull()
      const obj = { a: 1 }
      expect(GraphQLJSON.serialize(obj)).toBe(obj)
    })
  })

  describe('parseValue', () => {
    test('returns value as-is', () => {
      expect(GraphQLJSON.parseValue('hello')).toBe('hello')
      expect(GraphQLJSON.parseValue(42)).toBe(42)
      const arr = [1, 2]
      expect(GraphQLJSON.parseValue(arr)).toBe(arr)
    })
  })

  describe('parseLiteral', () => {
    test('parses STRING kind', () => {
      expect(GraphQLJSON.parseLiteral({ kind: Kind.STRING, value: 'test' }, {})).toBe('test')
    })

    test('parses BOOLEAN kind', () => {
      expect(GraphQLJSON.parseLiteral({ kind: Kind.BOOLEAN, value: true }, {})).toBe(true)
      expect(GraphQLJSON.parseLiteral({ kind: Kind.BOOLEAN, value: false }, {})).toBe(false)
    })

    test('parses INT kind', () => {
      expect(GraphQLJSON.parseLiteral({ kind: Kind.INT, value: '42' }, {})).toBe(42)
    })

    test('parses FLOAT kind', () => {
      expect(GraphQLJSON.parseLiteral({ kind: Kind.FLOAT, value: '3.14' }, {})).toBe(3.14)
    })

    test('parses NULL kind', () => {
      expect(GraphQLJSON.parseLiteral({ kind: Kind.NULL }, {})).toBeNull()
    })

    test('parses OBJECT kind with nested fields', () => {
      const ast = {
        kind: Kind.OBJECT as const,
        fields: [
          {
            kind: Kind.OBJECT_FIELD as const,
            name: { kind: Kind.NAME as const, value: 'key' },
            value: { kind: Kind.STRING as const, value: 'val' },
          },
          {
            kind: Kind.OBJECT_FIELD as const,
            name: { kind: Kind.NAME as const, value: 'num' },
            value: { kind: Kind.INT as const, value: '10' },
          },
        ],
      }
      expect(GraphQLJSON.parseLiteral(ast, {})).toEqual({ key: 'val', num: 10 })
    })

    test('parses LIST kind with nested values', () => {
      const ast = {
        kind: Kind.LIST as const,
        values: [
          { kind: Kind.INT as const, value: '1' },
          { kind: Kind.STRING as const, value: 'two' },
        ],
      }
      expect(GraphQLJSON.parseLiteral(ast, {})).toEqual([1, 'two'])
    })

    test('returns undefined for unknown kind', () => {
      expect(GraphQLJSON.parseLiteral({ kind: Kind.ENUM, value: 'FOO' }, {})).toBeUndefined()
    })
  })
})
