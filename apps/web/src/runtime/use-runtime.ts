import type { TetraRuntime } from '@tetra/runtime'
import { createContext, useContext } from 'react'

export const RuntimeContext = createContext<TetraRuntime | null>(null)

export function useRuntime(): TetraRuntime {
  const runtime = useContext(RuntimeContext)
  if (runtime === null) {
    throw new Error('useRuntime must be used within App')
  }
  return runtime
}
