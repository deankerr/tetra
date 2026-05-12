const JINA_API_KEY = 'tetra-jina-api-key'
const OPENROUTER_API_KEY = 'tetra-openrouter-api-key'

type Listener = () => void

const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) {
    listener()
  }
}

export function getOpenRouterApiKey(): string {
  return localStorage.getItem(OPENROUTER_API_KEY) ?? ''
}

export function getJinaApiKey(): string {
  return localStorage.getItem(JINA_API_KEY) ?? ''
}

export function setOpenRouterApiKey(value: string) {
  if (value === '') {
    localStorage.removeItem(OPENROUTER_API_KEY)
  } else {
    localStorage.setItem(OPENROUTER_API_KEY, value)
  }
  emit()
}

export function setJinaApiKey(value: string) {
  if (value === '') {
    localStorage.removeItem(JINA_API_KEY)
  } else {
    localStorage.setItem(JINA_API_KEY, value)
  }
  emit()
}

export function subscribeOpenRouterApiKey(listener: Listener): () => void {
  listeners.add(listener)

  // Other tabs can update the same locally persisted secret.
  const onStorage = (event: StorageEvent) => {
    if (event.key === OPENROUTER_API_KEY) {
      listener()
    }
  }
  window.addEventListener('storage', onStorage)

  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function subscribeJinaApiKey(listener: Listener): () => void {
  listeners.add(listener)

  // Other tabs can update the same locally persisted secret.
  const onStorage = (event: StorageEvent) => {
    if (event.key === JINA_API_KEY) {
      listener()
    }
  }
  window.addEventListener('storage', onStorage)

  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}
