import { toast } from '@tetra/ui/components/ui/sonner'
import { createContext, useContext, useEffect, useState } from 'react'

import type { WebStores } from '@/stores'
import { getWebRuntime } from '@/stores/runtime'
import type { WebRuntime } from '@/stores/runtime'
import { consumeWipeReport } from '@/stores/wipe'

export type AppContextValue = WebRuntime['core'] & {
  sync: WebRuntime['sync']
  stores: WebStores
  wipeAllData: WebRuntime['wipeAllData']
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const runtime = useWebRuntime()

  // Runs after the gated children — including the Toaster — have mounted; firing the toast in
  // the same tick that resolves the runtime would drop it, since sonner does not replay.
  useEffect(() => {
    if (runtime !== null) {
      reportIncompleteWipe()
    }
  }, [runtime])

  if (runtime === null) {
    return null
  }

  // Reactive reads bind to module-level store instances, so no TinyBase Provider is needed;
  // this context only hands components the imperative core commands and store handles.
  const { core, stores, sync, wipeAllData } = runtime
  return <AppContext value={{ ...core, stores, sync, wipeAllData }}>{children}</AppContext>
}

function useWebRuntime(): WebRuntime | null {
  const [runtime, setRuntime] = useState<WebRuntime | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let mounted = true

    // The runtime is a page-lifetime singleton; the effect only mirrors it into React state.
    // Browser-only stores mean this resolves client-side, after hydration.
    void (async () => {
      try {
        const nextRuntime = await getWebRuntime()
        if (mounted) {
          setRuntime(nextRuntime)
        }
      } catch (nextError) {
        if (mounted) {
          setError(toError(nextError))
        }
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  if (error !== null) {
    throw error
  }

  return runtime
}

// A delete-all-data that could not erase everything must say so; silence means it was complete.
function reportIncompleteWipe(): void {
  const failures = consumeWipeReport()
  if (failures === undefined) {
    return
  }

  toast.error('Delete all data was incomplete', {
    description: `Some data may not have been fully removed: ${failures
      .map((failure) => failure.step)
      .join(', ')}`,
    duration: Infinity,
  })
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (ctx === null) {
    throw new Error('useApp must be used within AppProvider')
  }
  return ctx
}
