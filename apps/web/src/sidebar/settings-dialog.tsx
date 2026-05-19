import type { CredentialDefinition } from '@tetra/credentials'
import { credentialRegistry } from '@tetra/credentials'
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
import { useEffect, useRef } from 'react'

import { useCredential } from '@/hooks/use-credential'
import { useTetra } from '@/tetra-provider'

export function SettingsDialog() {
  const tetra = useTetra()

  return (
    <Dialog
      onOpenChange={(open) => {
        tetra.setSettingsOpen(open)
      }}
      open={tetra.settingsOpen}
    >
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

        {credentialRegistry.map((definition) => (
          <CredentialField
            key={definition.id}
            active={tetra.activeCredentialId === definition.id}
            definition={definition}
          />
        ))}
      </DialogContent>
    </Dialog>
  )
}

function CredentialField({
  active,
  definition,
}: {
  active: boolean
  definition: CredentialDefinition
}) {
  const [value, setValue] = useCredential(definition.id)
  const inputId = `credential-${definition.id}`
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!active) {
      return
    }

    window.requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }, [active])

  return (
    <div className="grid gap-2">
      <Label htmlFor={inputId}>{definition.label}</Label>
      <Input
        id={inputId}
        onChange={(e) => {
          setValue(e.target.value)
        }}
        placeholder={definition.placeholder}
        ref={inputRef}
        type="password"
        value={value}
      />
      <p className="text-muted-foreground text-xs">{definition.description}</p>
    </div>
  )
}
