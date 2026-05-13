export interface CredentialDefinition {
  helpLabel: string
  helpUrl: string
  label: string
  localStorageKey: string
  optional: boolean
  placeholder: string
  purpose: string
}

// Registry keys are the canonical credential ids shared by settings, storage, and tool metadata.
export const credentialRegistry = {
  jinaApiKey: {
    helpLabel: 'jina.ai/reader',
    helpUrl: 'https://jina.ai/reader/',
    label: 'Jina API Key',
    localStorageKey: 'tetra-jina-api-key',
    optional: true,
    placeholder: 'jina_...',
    purpose: 'Used by web search and URL reading tools.',
  },
  openRouterApiKey: {
    helpLabel: 'openrouter.ai/keys',
    helpUrl: 'https://openrouter.ai/keys',
    label: 'OpenRouter API Key',
    localStorageKey: 'tetra-openrouter-api-key',
    optional: false,
    placeholder: 'sk-or-v1-...',
    purpose: 'Used for model inference through OpenRouter.',
  },
} satisfies Record<string, CredentialDefinition>

export type CredentialId = keyof typeof credentialRegistry

export const credentialIds = Object.keys(credentialRegistry)
export const credentialsRegistryMap = new Map<string, CredentialDefinition>(
  Object.entries(credentialRegistry).map(([credentialId, credentialDefinition]) => [
    credentialId,
    credentialDefinition,
  ]),
)
