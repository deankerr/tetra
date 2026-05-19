declare const process: { env: Record<string, string | undefined> }

function noopUnsubscribe() {
  // no-op: subscribe has no effect outside a browser environment
}

export interface CredentialDefinition {
  description: string
  id: string
  label: string
  placeholder: string
}

export const credentialRegistry = [
  {
    description: 'Required for model inference. Get a key at openrouter.ai/keys.',
    id: 'OPENROUTER_API_KEY',
    label: 'OpenRouter API Key',
    placeholder: 'sk-or-v1-...',
  },
  {
    description: 'Used by web search and URL reading tools. Get a key at jina.ai/reader.',
    id: 'JINA_API_KEY',
    label: 'Jina API Key',
    placeholder: 'jina_...',
  },
  {
    description: 'Used for neural web search via Exa. Get a key at dashboard.exa.ai/api-keys.',
    id: 'EXA_API_KEY',
    label: 'Exa API Key',
    placeholder: 'exa_...',
  },
] as const satisfies CredentialDefinition[]

export type CredentialId = (typeof credentialRegistry)[number]['id']

export class CredentialStore {
  readonly registry: Map<string, CredentialDefinition>
  private readonly listeners = new Map<string, Set<() => void>>()

  constructor(definitions: readonly CredentialDefinition[]) {
    this.registry = new Map(definitions.map((d) => [d.id, d]))
  }

  get(id: string): string {
    if (!this.registry.has(id)) {
      return ''
    }

    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem(id) ?? ''
      } catch (error) {
        console.error('[credentials] localStorage read failed', { error, id })
        return ''
      }
    }

    return process.env[id] ?? ''
  }

  set(id: string, value: string): void {
    if (typeof window === 'undefined') {
      return
    }
    try {
      if (value === '') {
        localStorage.removeItem(id)
      } else {
        localStorage.setItem(id, value)
      }
    } catch (error) {
      console.error('[credentials] localStorage write failed', { error, id })
    }
    for (const fn of this.listeners.get(id) ?? []) {
      fn()
    }
  }

  subscribe(id: string, listener: () => void): () => void {
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
}

export const credentialStore = new CredentialStore(credentialRegistry)
