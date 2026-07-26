import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string) => ({
    addEventListener: () => {
      void query
    },
    dispatchEvent: () => false,
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: () => {
      void query
    },
  }),
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
