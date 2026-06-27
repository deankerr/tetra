import { afterEach, expect, test } from 'bun:test'

import { CredentialsStore, credentialRegistry } from './index.ts'

const originalLocalStorage = globalThis.localStorage
const originalWindow = globalThis.window

afterEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: originalWindow,
  })
})

test('set trims browser credentials and treats blank values as missing', () => {
  const localStorage = installBrowserStorage()
  const store = new CredentialsStore(credentialRegistry)

  store.set('OPENROUTER_API_KEY', '  sk-or-v1-test  ')
  expect(localStorage.getItem('OPENROUTER_API_KEY')).toBe('sk-or-v1-test')
  expect(store.get('OPENROUTER_API_KEY')).toBe('sk-or-v1-test')
  expect(store.has('OPENROUTER_API_KEY')).toBe(true)

  store.set('OPENROUTER_API_KEY', '   ')
  expect(localStorage.getItem('OPENROUTER_API_KEY')).toBeNull()
  expect(store.get('OPENROUTER_API_KEY')).toBeUndefined()
  expect(store.has('OPENROUTER_API_KEY')).toBe(false)
  expect(() => store.require('OPENROUTER_API_KEY')).toThrow('OpenRouter API Key is required')
})

function installBrowserStorage(): Storage {
  const values = new Map<string, string>()
  const localStorage: Storage = {
    clear() {
      values.clear()
    },
    getItem(key) {
      return values.get(key) ?? null
    },
    key(index) {
      return [...values.keys()][index] ?? null
    },
    get length() {
      return values.size
    },
    removeItem(key) {
      values.delete(key)
    },
    setItem(key, value) {
      values.set(key, value)
    },
  }

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorage,
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      addEventListener() {},
      removeEventListener() {},
    },
  })

  return localStorage
}
