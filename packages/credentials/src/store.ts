import { credentialsRegistryMap } from './registry.ts'

type Listener = () => void

const listeners = new Set<Listener>()

// All credential writes notify every local subscriber.
function emit() {
  for (const listener of listeners) {
    listener()
  }
}

export function getCredential(credentialId: string): string {
  const credentialDefinition = credentialsRegistryMap.get(credentialId)
  if (credentialDefinition === undefined) {
    throw new Error(`Unknown credential id: ${credentialId}`)
  }

  return localStorage.getItem(credentialDefinition.localStorageKey) ?? ''
}

export function setCredential(credentialId: string, value: string) {
  const credentialDefinition = credentialsRegistryMap.get(credentialId)
  if (credentialDefinition === undefined) {
    throw new Error(`Unknown credential id: ${credentialId}`)
  }

  const storageKey = credentialDefinition.localStorageKey
  if (value === '') {
    localStorage.removeItem(storageKey)
  } else {
    localStorage.setItem(storageKey, value)
  }
  emit()
}

export function subscribeCredential(credentialId: string, listener: Listener): () => void {
  const credentialDefinition = credentialsRegistryMap.get(credentialId)
  if (credentialDefinition === undefined) {
    throw new Error(`Unknown credential id: ${credentialId}`)
  }

  listeners.add(listener)

  // Other tabs can update the same locally persisted secret.
  const onStorage = (event: StorageEvent) => {
    if (event.key === credentialDefinition.localStorageKey) {
      listener()
    }
  }
  window.addEventListener('storage', onStorage)

  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}
