import { createContext, useContext } from 'react'

import type { Runtime } from '@/lib/runtime'

export const RuntimeContext = createContext<Runtime | null>(null)

export function useRuntime(): Runtime {
  const runtime = useContext(RuntimeContext)
  if (runtime === null) {
    throw new Error('useRuntime must be used within App')
  }
  return runtime
}
