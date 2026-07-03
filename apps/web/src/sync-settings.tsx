import { Button } from '@tetra/ui/components/ui/button'
import { Field, FieldContent, FieldDescription, FieldTitle } from '@tetra/ui/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@tetra/ui/components/ui/input-group'
import { toast } from '@tetra/ui/components/ui/sonner'
import { Switch } from '@tetra/ui/components/ui/switch'
import { CloudIcon, CloudOffIcon, CopyIcon, DicesIcon, RefreshCwIcon } from 'lucide-react'
import { useState } from 'react'

import { useApp } from '@/app'
import { deskReact, prefsReact, syncReact } from '@/stores'
import type { SyncConnectionStatus, SyncTransferStatus } from '@/stores'
import { SyncKeySchema, generateSyncKey } from '@/stores/sync/controller'

// The sync tab of the settings dialog. Connection details (URL, transfer stats) live in the
// console; the panel keeps only the user-facing knobs: consent, the channel key, and resync.
export function SyncPanel() {
  const { sync } = useApp()
  const enabled = prefsReact.values.syncEnabled.use()
  const status = syncReact.values.status.use()
  const transfer = syncReact.values.transfer.use()
  const workerUrl = syncReact.values.workerUrl.use()
  const statusText = getSyncStatusText({ status, transfer })
  const syncUnavailable = workerUrl === null

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Tetra never stores your data on a server. Devices on the same channel key sync directly
        while they are online together.
      </p>

      <Field orientation="horizontal">
        <FieldContent>
          <FieldTitle>Remote sync</FieldTitle>
          <FieldDescription>{statusText}</FieldDescription>
        </FieldContent>
        <Switch
          aria-label="Toggle remote sync"
          checked={enabled}
          disabled={syncUnavailable}
          onCheckedChange={(nextEnabled) => {
            sync.setEnabled(nextEnabled)
          }}
        />
      </Field>

      <SyncKeyField />

      <div className="flex justify-end">
        <Button
          disabled={!(enabled && status === 'live')}
          onClick={() => {
            void sync.resync()
          }}
          type="button"
          variant="outline"
        >
          <RefreshCwIcon data-icon="inline-start" />
          Resync
        </Button>
      </div>
    </div>
  )
}

// The channel key is the pairing gesture: generate here, paste on the other device. Edits are
// committed on Enter or blur so a half-pasted key never dials a channel.
function SyncKeyField() {
  const { sync } = useApp()
  const storedKey = prefsReact.values.syncKey.use() ?? ''
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? storedKey
  const draftInvalid = draft !== null && draft !== '' && !SyncKeySchema.safeParse(draft).success

  const commitDraft = () => {
    if (draft === null) {
      return
    }

    const parsed = SyncKeySchema.safeParse(draft)
    if (parsed.success && parsed.data !== storedKey) {
      sync.setKey(parsed.data)
    }
    setDraft(null)
  }

  return (
    <Field data-invalid={draftInvalid || undefined}>
      <FieldTitle>Channel key</FieldTitle>
      <InputGroup>
        <InputGroupInput
          aria-invalid={draftInvalid || undefined}
          className="font-mono"
          onBlur={commitDraft}
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              commitDraft()
            }
          }}
          placeholder="Generate or paste a channel key"
          value={value}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label="Generate new channel key"
            onClick={() => {
              setDraft(null)
              sync.setKey(generateSyncKey())
            }}
            size="icon-xs"
            title="Generate new channel key"
          >
            <DicesIcon />
          </InputGroupButton>
          <InputGroupButton
            aria-label="Copy channel key"
            disabled={storedKey === ''}
            onClick={() => {
              void (async () => {
                await navigator.clipboard.writeText(storedKey)
                toast('Channel key copied')
              })()
            }}
            size="icon-xs"
            title="Copy channel key"
          >
            <CopyIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <FieldDescription>
        {draftInvalid
          ? 'Keys are 16-64 letters, numbers, hyphens, or underscores.'
          : 'Pasting a key joins its channel and merges libraries with the devices on it.'}
      </FieldDescription>
    </Field>
  )
}

// The sidebar's sync status indicator; opens the settings dialog on the sync tab.
export function SyncStatusButton({ className }: { className?: string }) {
  const [, setSettingsTab] = deskReact.values.settingsTab.useState()
  const enabled = prefsReact.values.syncEnabled.use()
  const status = syncReact.values.status.use()
  const transfer = syncReact.values.transfer.use()
  const statusLabel = `Sync ${getSyncStatusText({ status, transfer })}`
  const Icon = enabled ? CloudIcon : CloudOffIcon

  return (
    <Button
      aria-label={statusLabel}
      className={className}
      onClick={() => {
        setSettingsTab('sync')
      }}
      size="icon"
      title={statusLabel}
      type="button"
      variant="ghost"
    >
      <Icon />
    </Button>
  )
}

function getSyncStatusText(args: {
  status: SyncConnectionStatus
  transfer: SyncTransferStatus
}): string {
  if (args.transfer !== 'idle') {
    return args.transfer
  }
  if (args.status === 'disabled') {
    return 'off'
  }
  if (args.status === 'unconfigured') {
    return 'needs a channel key'
  }

  return args.status
}
