import type { CredentialId } from '@tetra/credentials'
import { credentialStore } from '@tetra/credentials'
import { useSyncExternalStore } from 'react'

export function useCredential(id: CredentialId): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    (listener) => credentialStore.subscribe(id, listener),
    () => credentialStore.get(id) ?? '',
    () => '',
  )
  return [
    value,
    (nextValue) => {
      credentialStore.set(id, nextValue)
    },
  ]
}

export function useHasCredential(id: CredentialId): boolean {
  return useSyncExternalStore(
    (listener) => credentialStore.subscribe(id, listener),
    () => credentialStore.has(id),
    () => false,
  )
}
