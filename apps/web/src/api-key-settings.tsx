import type { CredentialDefinition } from '@tetra/credentials'
import { credentialRegistry } from '@tetra/credentials'
import { Button } from '@tetra/ui/components/ui/button'
import { Field, FieldDescription, FieldTitle } from '@tetra/ui/components/ui/field'
import { Input } from '@tetra/ui/components/ui/input'
import { toast } from '@tetra/ui/components/ui/sonner'
import { KeyRoundIcon } from 'lucide-react'
import { useCallback } from 'react'

import { deskReact } from '@/stores'
import { useCredential, useHasCredential } from '@/use-credential'

// The API keys tab of the settings dialog.
export function ApiKeysPanel() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Inference runs entirely in your browser. API keys are stored locally on this device.
      </p>
      {credentialRegistry.map((definition) => (
        <CredentialField key={definition.id} definition={definition} />
      ))}
    </div>
  )
}

export function MissingOpenRouterApiKeyButton() {
  const hasOpenrouterApiKey = useHasCredential('OPENROUTER_API_KEY')
  const [, setSettingsTab] = deskReact.values.settingsTab.useState()

  if (hasOpenrouterApiKey) {
    return null
  }

  return (
    <Button
      aria-label="Missing OpenRouter API key"
      onClick={() => {
        setSettingsTab('api-keys')
      }}
      size="sm"
      title="Missing OpenRouter API key"
      type="button"
      variant="destructive"
    >
      <KeyRoundIcon data-icon="inline-start" />
      Missing OpenRouter key
    </Button>
  )
}

export function useRequireOpenRouterApiKey(): () => void {
  const hasOpenrouterApiKey = useHasCredential('OPENROUTER_API_KEY')
  const [, setSettingsTab] = deskReact.values.settingsTab.useState()

  return useCallback(() => {
    if (hasOpenrouterApiKey) {
      return
    }

    toast.error('OpenRouter API key required', {
      description: 'Add an OpenRouter API key before running model inference.',
    })
    setSettingsTab('api-keys')
    throw new Error('OpenRouter API key required')
  }, [hasOpenrouterApiKey, setSettingsTab])
}

function CredentialField({ definition }: { definition: CredentialDefinition }) {
  const [value, setValue] = useCredential(definition.id)
  const inputId = `credential-${definition.id}`

  return (
    <Field>
      <FieldTitle>
        <label htmlFor={inputId}>{definition.label}</label>
      </FieldTitle>
      <Input
        id={inputId}
        onChange={(e) => {
          setValue(e.target.value)
        }}
        placeholder={definition.placeholder}
        type="password"
        value={value}
      />
      <FieldDescription>{definition.description}</FieldDescription>
    </Field>
  )
}
