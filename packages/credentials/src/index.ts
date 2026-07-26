// The registry is pure data: which credentials exist and how surfaces describe them.
export const credentialRegistry = [
  {
    description: 'Required for model inference. Get a key at openrouter.ai/keys.',
    id: 'OPENROUTER_API_KEY',
    label: 'OpenRouter API Key',
    placeholder: 'sk-or-v1-...',
  },
] as const

export type CredentialId = (typeof credentialRegistry)[number]['id']
export type CredentialDefinition = (typeof credentialRegistry)[number]

function getCredentialDefinition(id: CredentialId): CredentialDefinition {
  const definition = credentialRegistry.find((credential) => credential.id === id)
  if (definition === undefined) {
    throw new Error(`Unknown credential id: ${id}`)
  }

  return definition
}

// What core needs at execution time: reads only. Each surface owns its
// storage — the web app a TinyBase store, the CLI process env — and wraps it in a reader.
export interface CredentialReader {
  get: (id: CredentialId) => string | undefined
  has: (id: CredentialId) => boolean
  require: (id: CredentialId) => string
}

// Wrap a raw lookup into a reader: trims values, treats blank as missing, and gives
// `require` its user-facing error message.
export function createCredentialReader(
  read: (id: CredentialId) => string | null | undefined,
): CredentialReader {
  const get = (id: CredentialId): string | undefined => {
    getCredentialDefinition(id)
    const value = read(id)?.trim() ?? ''
    return value === '' ? undefined : value
  }

  return {
    get,
    has: (id) => get(id) !== undefined,
    require(id) {
      const value = get(id)
      if (value === undefined) {
        throw new Error(`${getCredentialDefinition(id).label} is required`)
      }

      return value
    },
  }
}
