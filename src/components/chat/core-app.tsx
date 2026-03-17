import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import { Provider } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

import { Spinner } from '@/components/ui/spinner'
import { getDataLayer } from '@/lib/core/data'
import { ensureDefaults } from '@/lib/core/operations'
import type { Runtime } from '@/lib/core/runtime'
import { startRuntime } from '@/lib/core/runtime'
import { createDefaultTransport } from '@/lib/core/stream'

export function CoreApp({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const runtimeRef = useRef<Runtime | null>(null)

  useEffect(() => {
    let cancelled = false

    const boot = async () => {
      await getDataLayer().initialize()
      if (cancelled) {
        return
      }

      ensureDefaults(getDataLayer())
      runtimeRef.current = startRuntime(getDataLayer(), createDefaultTransport())
      setReady(true)
    }

    void boot()

    return () => {
      cancelled = true
      runtimeRef.current?.stop()
      runtimeRef.current = null
    }
  }, [])

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <Spinner className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Loading…</span>
        </div>
      </div>
    )
  }

  // Provider is schema-agnostic; typed hooks handle schema awareness via WithSchemas cast
  // oxlint-disable-next-line no-unsafe-type-assertion
  const store = getDataLayer().store as unknown as TinyStore
  // oxlint-disable-next-line no-unsafe-type-assertion
  const indexes = getDataLayer().indexes as unknown as TinyIndexes

  return (
    <Provider indexes={indexes} store={store}>
      {children}
      <Inspector />
    </Provider>
  )
}
