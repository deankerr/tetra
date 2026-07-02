import { Button } from '@tetra/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tetra/ui/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldTitle } from '@tetra/ui/components/ui/field'
import { Input } from '@tetra/ui/components/ui/input'
import { Switch } from '@tetra/ui/components/ui/switch'
import { CloudIcon, CloudOffIcon, RefreshCwIcon } from 'lucide-react'

import { useApp } from '@/app'
import { webReact } from '@/store'
import { canResync, useSyncSnapshot } from '@/sync'
import type { SyncSnapshot } from '@/sync'

export function SyncSettingsDialog() {
  const [open, setOpen] = webReact.values.syncSettingsOpen.useState()
  const { sync } = useApp()
  const snapshot = useSyncSnapshot(sync)
  const statusText = getSyncStatusText(snapshot)
  const workerUrl = snapshot.config.workerUrl ?? ''
  const syncUnavailable = snapshot.config.hardDisabled || workerUrl === ''

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sync</DialogTitle>
          <DialogDescription>
            Remote sync is off until enabled. Local data stays on this device while sync is off.
          </DialogDescription>
        </DialogHeader>

        <Field orientation="horizontal">
          <FieldContent>
            <FieldTitle>Remote sync</FieldTitle>
            <FieldDescription>{statusText}</FieldDescription>
          </FieldContent>
          <Switch
            aria-label="Toggle remote sync"
            checked={snapshot.config.enabled}
            disabled={syncUnavailable}
            onCheckedChange={(enabled) => {
              sync.setEnabled(enabled)
            }}
          />
        </Field>

        <Field>
          <FieldTitle>Worker URL</FieldTitle>
          <Input disabled placeholder="No worker URL configured" readOnly value={workerUrl} />
          <FieldDescription>{getWorkerUrlDescription(snapshot)}</FieldDescription>
        </Field>

        <div className="flex items-center justify-between gap-2">
          <div className="text-muted-foreground text-xs">{formatSyncStats(snapshot)}</div>
          <Button
            disabled={!canResync(snapshot)}
            onClick={() => {
              void sync.resync()
            }}
            type="button"
            variant="outline"
          >
            <RefreshCwIcon />
            Resync
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function SyncSettingsButton({ className }: { className?: string }) {
  const [, setOpen] = webReact.values.syncSettingsOpen.useState()
  const { sync } = useApp()
  const snapshot = useSyncSnapshot(sync)
  const statusLabel = `Sync ${getSyncStatusText(snapshot)}`
  const Icon = snapshot.config.enabled ? CloudIcon : CloudOffIcon

  return (
    <Button
      aria-label={statusLabel}
      className={className}
      onClick={() => {
        setOpen(true)
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

function getSyncStatusText(snapshot: SyncSnapshot): string {
  if (snapshot.config.hardDisabled) {
    return 'disabled'
  }
  if (snapshot.connection.transfer !== 'idle') {
    return snapshot.connection.transfer
  }
  if (snapshot.connection.status === 'disabled') {
    return 'off'
  }
  if (snapshot.connection.status === 'unavailable') {
    return 'disabled'
  }

  return snapshot.connection.status
}

function formatSyncStats(snapshot: SyncSnapshot): string {
  const { stats } = snapshot.connection
  if (stats === undefined) {
    return snapshot.connection.lastError ?? snapshot.connection.status
  }

  return `${snapshot.connection.status} - ${stats.sends} sent - ${stats.receives} received`
}

function getWorkerUrlDescription(snapshot: SyncSnapshot): string {
  if (snapshot.config.hardDisabled) {
    return 'Remote sync is disabled by VITE_SYNC_ENABLED=false.'
  }

  return 'The current prototype reads this from VITE_SYNC_WORKER_URL.'
}
