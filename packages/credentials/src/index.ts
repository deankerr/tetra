declare const process: { env: Record<string, string | undefined> }

function noopUnsubscribe() {
  // no-op: subscribe has no effect outside a browser environment
}

export const credentialRegistry = [
  {
    description: 'Required for model inference. Get a key at openrouter.ai/keys.',
    id: 'OPENROUTER_API_KEY',
    label: 'OpenRouter API Key',
    placeholder: 'sk-or-v1-...',
  },
  {
    description: 'Used for neural web search via Exa. Get a key at dashboard.exa.ai/api-keys.',
    id: 'EXA_API_KEY',
    label: 'Exa API Key',
    placeholder: 'exa_...',
  },
] as const

export type CredentialId = (typeof credentialRegistry)[number]['id']
export type CredentialDefinition = (typeof credentialRegistry)[number]

export function getCredentialDefinition(id: CredentialId): CredentialDefinition {
  const definition = credentialRegistry.find((credential) => credential.id === id)
  if (definition === undefined) {
    throw new Error(`Unknown credential id: ${id}`)
  }

  return definition
}

function normalizeCredentialValue(value: string | null | undefined): string | undefined {
  const trimmedValue = value?.trim() ?? ''
  return trimmedValue === '' ? undefined : trimmedValue
}

export class CredentialsStore {
  readonly registry: Map<CredentialId, CredentialDefinition>
  private readonly listeners = new Map<CredentialId, Set<() => void>>()

  constructor(definitions: readonly CredentialDefinition[]) {
    this.registry = new Map(definitions.map((d) => [d.id, d]))
  }

  get(id: CredentialId): string | undefined {
    this.requireDefinition(id)

    if (typeof window !== 'undefined') {
      try {
        return normalizeCredentialValue(localStorage.getItem(id))
      } catch (error) {
        console.error('[credentials] localStorage read failed', { error, id })
        return undefined
      }
    }

    return normalizeCredentialValue(process.env[id])
  }

  has(id: CredentialId): boolean {
    return this.get(id) !== undefined
  }

  require(id: CredentialId): string {
    const value = this.get(id)
    if (value !== undefined) {
      return value
    }

    throw new Error(`${this.requireDefinition(id).label} is required`)
  }

  set(id: CredentialId, value: string): void {
    this.requireDefinition(id)

    if (typeof window === 'undefined') {
      return
    }

    const nextValue = normalizeCredentialValue(value)
    try {
      if (nextValue === undefined) {
        localStorage.removeItem(id)
      } else {
        localStorage.setItem(id, nextValue)
      }
    } catch (error) {
      console.error('[credentials] localStorage write failed', { error, id })
    }
    for (const fn of this.listeners.get(id) ?? []) {
      fn()
    }
  }

  subscribe(id: CredentialId, listener: () => void): () => void {
    this.requireDefinition(id)

    if (typeof window === 'undefined') {
      return noopUnsubscribe
    }

    const set = this.listeners.get(id) ?? new Set<() => void>()
    this.listeners.set(id, set)
    set.add(listener)

    // Other tabs can update the same locally persisted secret.
    const onStorage = (event: StorageEvent) => {
      if (event.key === id) {
        listener()
      }
    }
    window.addEventListener('storage', onStorage)

    return () => {
      this.listeners.get(id)?.delete(listener)
      window.removeEventListener('storage', onStorage)
    }
  }

  private requireDefinition(id: CredentialId): CredentialDefinition {
    const definition = this.registry.get(id)
    if (definition === undefined) {
      throw new Error(`Unknown credential id: ${id}`)
    }

    return definition
  }
}

export const credentialStore = new CredentialsStore(credentialRegistry)
