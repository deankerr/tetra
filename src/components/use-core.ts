import { createContext, useContext } from 'react'

import type { Core } from '@/lib/core'

export const CoreContext = createContext<Core | null>(null)

export function useCore(): Core {
  const core = useContext(CoreContext)
  if (core === null) {
    throw new Error('useCore must be used within App')
  }
  return core
}
