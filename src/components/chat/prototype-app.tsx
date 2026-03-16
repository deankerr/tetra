import { Loader2Icon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Indexes as TinyIndexes, Store as TinyStore } from 'tinybase'
import { Provider } from 'tinybase/ui-react'
import { Inspector } from 'tinybase/ui-react-inspector'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getChatApp } from '@/lib/chat/app'
import { CONFIG_STORE_ID, RUNTIME_INDEXES_ID, RUNTIME_STORE_ID } from '@/lib/chat/schemas'

import { Workspace } from './workspace'

function LoadingState() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Loading TinyBase prototype</CardTitle>
          <CardDescription>Restoring config and runtime stores from IndexedDB.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Preparing local-first state…</span>
        </CardContent>
      </Card>
    </div>
  )
}

export function PrototypeApp() {
  const appRef = useRef(getChatApp())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    const initialize = async () => {
      await appRef.current.initialize()
      if (cancelled) {
        return
      }

      appRef.current.startRuntime()
      setReady(true)
    }

    void initialize()

    return () => {
      cancelled = true
    }
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Provider is schema-agnostic and expects the widened TinyBase Store type at the React context boundary.
  const configStore = appRef.current.configStore as unknown as TinyStore
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Provider is schema-agnostic and expects the widened TinyBase Store type at the React context boundary.
  const runtimeStore = appRef.current.runtimeStore as unknown as TinyStore
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Provider is schema-agnostic and expects the widened TinyBase Indexes type at the React context boundary.
  const runtimeIndexes = appRef.current.runtimeIndexes as unknown as TinyIndexes

  return ready ? (
    <Provider
      indexesById={{ [RUNTIME_INDEXES_ID]: runtimeIndexes }}
      storesById={{
        [CONFIG_STORE_ID]: configStore,
        [RUNTIME_STORE_ID]: runtimeStore,
      }}
    >
      <Workspace />
      <Inspector />
    </Provider>
  ) : (
    <LoadingState />
  )
}
