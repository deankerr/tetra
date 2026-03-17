import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import { Provider } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

import { CoreContext } from '@/components/chat/use-core'
import { Spinner } from '@/components/ui/spinner'
import type { Core } from '@/lib/core'
import { getCore } from '@/lib/core'

export function CoreApp({ children }: { children: ReactNode }) {
  const [core, setCore] = useState<Core | null>(null)

  useEffect(() => {
    const init = async () => {
      setCore(await getCore())
    }
    void init()
  }, [])

  if (core === null) {
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
  const store = core.data.store as unknown as TinyStore
  // oxlint-disable-next-line no-unsafe-type-assertion
  const indexes = core.data.indexes as unknown as TinyIndexes

  return (
    <CoreContext value={core}>
      <Provider indexes={indexes} store={store}>
        {children}
        <Inspector />
      </Provider>
    </CoreContext>
  )
}
