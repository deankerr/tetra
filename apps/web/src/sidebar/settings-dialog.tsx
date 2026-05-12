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

import { useOpenRouterApiKey } from '@/hooks/use-key-store'

export function SettingsDialog() {
  const [apiKey, setApiKey] = useOpenRouterApiKey()

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

        <div className="grid gap-2">
          <Label htmlFor="api-key">OpenRouter API Key</Label>
          <Input
            id="api-key"
            type="password"
            placeholder="sk-or-v1-..."
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value)
            }}
          />
          <p className="text-muted-foreground text-xs">
            Get a key at{' '}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              openrouter.ai/keys
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
