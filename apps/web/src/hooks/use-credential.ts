import { credentialStore } from '@tetra/credentials'
import { useSyncExternalStore } from 'react'

export function useCredential(id: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    (listener) => credentialStore.subscribe(id, listener),
    () => credentialStore.get(id),
    () => '',
  )
  return [
    value,
    (nextValue) => {
      credentialStore.set(id, nextValue)
    },
  ]
}
