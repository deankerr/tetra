import { expect, test } from 'bun:test'

import { createCredentialReader } from './index.ts'

test('reader trims values and treats blank as missing', () => {
  const values = new Map<string, string>([['OPENROUTER_API_KEY', '  sk-or-v1-test  ']])
  const reader = createCredentialReader((id) => values.get(id))

  expect(reader.get('OPENROUTER_API_KEY')).toBe('sk-or-v1-test')
  expect(reader.has('OPENROUTER_API_KEY')).toBe(true)
  expect(reader.require('OPENROUTER_API_KEY')).toBe('sk-or-v1-test')

  values.set('OPENROUTER_API_KEY', '   ')
  expect(reader.get('OPENROUTER_API_KEY')).toBeUndefined()
  expect(reader.has('OPENROUTER_API_KEY')).toBe(false)
  expect(() => reader.require('OPENROUTER_API_KEY')).toThrow('OpenRouter API Key is required')
})
