import { getCredential, setCredential, subscribeCredential } from '@tetra/credentials/store'
import { useSyncExternalStore } from 'react'

export function useCredential(credentialId: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    (listener) => subscribeCredential(credentialId, listener),
    () => getCredential(credentialId),
    () => '',
  )
  return [
    value,
    (nextValue) => {
      setCredential(credentialId, nextValue)
    },
  ]
}
