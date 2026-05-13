import { credentialIds, credentialsRegistryMap } from '@tetra/credentials/registry'
import { Button } from '@tetra/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tetra/ui/components/ui/dialog'
import { Input } from '@tetra/ui/components/ui/input'
import { Label } from '@tetra/ui/components/ui/label'
import { SettingsIcon } from 'lucide-react'

import { useCredential } from '@/hooks/use-credential'

export function SettingsDialog() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon">
            <SettingsIcon />
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Inference runs entirely in your browser. Your API key is stored locally on this device.
          </DialogDescription>
        </DialogHeader>

        {credentialIds.map((credentialId) => (
          <CredentialField key={credentialId} credentialId={credentialId} />
        ))}
      </DialogContent>
    </Dialog>
  )
}

function CredentialField({ credentialId }: { credentialId: string }) {
  const [value, setValue] = useCredential(credentialId)
  const definition = credentialsRegistryMap.get(credentialId)
  if (definition === undefined) {
    return null
  }

  const inputId = `credential-${credentialId}`

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>{definition.label}</Label>
      <Input
        id={inputId}
        type="password"
        placeholder={definition.placeholder}
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
        }}
      />
      <p className="text-muted-foreground text-xs">
        {definition.purpose} Get a key at{' '}
        <a
          href={definition.helpUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          {definition.helpLabel}
        </a>
      </p>
    </div>
  )
}
