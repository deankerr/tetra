import { createContext, useContext } from 'react'

import type { TetraClient } from '@/lib/runtime'

export const RuntimeContext = createContext<TetraClient | null>(null)

export function useRuntime(): TetraClient {
  const runtime = useContext(RuntimeContext)
  if (runtime === null) {
    throw new Error('useRuntime must be used within App')
  }
  return runtime
}
