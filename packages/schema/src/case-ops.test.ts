import { describe, expect, test } from 'bun:test'

import { capitalize, uncapitalize } from './case-ops'

describe('capitalize', () => {
  test('returns empty string unchanged', () => {
    expect(capitalize('')).toBe('')
  })

  test('capitalizes single character', () => {
    expect(capitalize('a')).toBe('A')
  })

  test('capitalizes first letter of normal string', () => {
    expect(capitalize('hello')).toBe('Hello')
  })

  test('returns already capitalized string unchanged', () => {
    expect(capitalize('Hello')).toBe('Hello')
  })
})

describe('uncapitalize', () => {
  test('returns empty string unchanged', () => {
    expect(uncapitalize('')).toBe('')
  })

  test('uncapitalizes single character', () => {
    expect(uncapitalize('A')).toBe('a')
  })

  test('uncapitalizes first letter of normal string', () => {
    expect(uncapitalize('Hello')).toBe('hello')
  })

  test('returns already lowercase string unchanged', () => {
    expect(uncapitalize('hello')).toBe('hello')
  })
})
