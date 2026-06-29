import type { CredentialDefinition } from '@tetra/credentials'
import { credentialRegistry } from '@tetra/credentials'
import { Button } from '@tetra/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tetra/ui/components/ui/dialog'
import { Input } from '@tetra/ui/components/ui/input'
import { Label } from '@tetra/ui/components/ui/label'
import { toast } from '@tetra/ui/components/ui/sonner'
import { KeyRoundIcon } from 'lucide-react'
import { useCallback } from 'react'

import { webReact } from '@/store'
import { useCredential, useHasCredential } from '@/use-credential'

export function ApiKeySettingsDialog() {
  const [open, setOpen] = webReact.values.apiKeySettingsOpen.useState()

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>API keys</DialogTitle>
          <DialogDescription>
            Inference runs entirely in your browser. API keys are stored locally on this device.
          </DialogDescription>
        </DialogHeader>

        {credentialRegistry.map((definition) => (
          <CredentialField key={definition.id} definition={definition} />
        ))}
      </DialogContent>
    </Dialog>
  )
}

export function ApiKeySettingsButton({
  className,
  label = 'Open API key settings',
}: {
  className?: string
  label?: string
}) {
  const [, setOpen] = webReact.values.apiKeySettingsOpen.useState()

  return (
    <Button
      aria-label={label}
      className={className}
      onClick={() => {
        setOpen(true)
      }}
      size="icon"
      title={label}
      type="button"
      variant="ghost"
    >
      <KeyRoundIcon />
    </Button>
  )
}

export function MissingOpenRouterApiKeyButton() {
  const hasOpenrouterApiKey = useHasCredential('OPENROUTER_API_KEY')
  const [, setOpen] = webReact.values.apiKeySettingsOpen.useState()

  if (hasOpenrouterApiKey) {
    return null
  }

  return (
    <Button
      aria-label="Missing OpenRouter API key"
      onClick={() => {
        setOpen(true)
      }}
      size="sm"
      title="Missing OpenRouter API key"
      type="button"
      variant="destructive"
    >
      <KeyRoundIcon />
      Missing OpenRouter key
    </Button>
  )
}

export function useRequireOpenRouterApiKey(): () => void {
  const hasOpenrouterApiKey = useHasCredential('OPENROUTER_API_KEY')
  const [, setOpen] = webReact.values.apiKeySettingsOpen.useState()

  return useCallback(() => {
    if (hasOpenrouterApiKey) {
      return
    }

    toast.error('OpenRouter API key required', {
      description: 'Add an OpenRouter API key before running model inference.',
    })
    setOpen(true)
    throw new Error('OpenRouter API key required')
  }, [hasOpenrouterApiKey, setOpen])
}

function CredentialField({ definition }: { definition: CredentialDefinition }) {
  const [value, setValue] = useCredential(definition.id)
  const inputId = `credential-${definition.id}`

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>{definition.label}</Label>
      <Input
        id={inputId}
        onChange={(e) => {
          setValue(e.target.value)
        }}
        placeholder={definition.placeholder}
        type="password"
        value={value}
      />
      <p className="text-muted-foreground text-xs">{definition.description}</p>
    </div>
  )
}
