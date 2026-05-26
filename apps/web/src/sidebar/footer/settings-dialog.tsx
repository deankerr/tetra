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

import { useCredential } from '@/use-credential'
import { WEB_UI_STORE_ID, webUiTinybase } from '@/web-ui-state'

export function SettingsDialog() {
  const [open, setOpen] = webUiTinybase.useValueState('settingsOpen', WEB_UI_STORE_ID)

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger
        render={
          <Button size="icon" variant="ghost">
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
          <CredentialField key={definition.id} definition={definition} />
        ))}
      </DialogContent>
    </Dialog>
  )
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
