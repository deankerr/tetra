import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tetra/ui/components/ui/alert-dialog'
import { Button } from '@tetra/ui/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@tetra/ui/components/ui/dialog'
import { Field, FieldContent, FieldDescription, FieldTitle } from '@tetra/ui/components/ui/field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tetra/ui/components/ui/tabs'
import { SettingsIcon } from 'lucide-react'

import { ApiKeysPanel } from '@/api-key-settings'
import { useApp } from '@/app'
import { deskReact, SettingsTabSchema } from '@/stores'
import { SyncPanel } from '@/sync-settings'

// One settings dialog for the whole app; the desk store's settingsTab value is both the
// open state (null is closed) and the active tab, so any surface can deep-link to a tab.
export function SettingsDialog() {
  const [tab, setTab] = deskReact.values.settingsTab.useState()
  const activeTab = tab ?? 'api-keys'

  return (
    <Dialog
      onOpenChange={(open) => {
        setTab(open ? activeTab : null)
      }}
      open={tab !== null}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>

        <Tabs
          onValueChange={(value) => {
            setTab(SettingsTabSchema.parse(value))
          }}
          value={activeTab}
        >
          <TabsList>
            <TabsTrigger value="api-keys">API keys</TabsTrigger>
            <TabsTrigger value="sync">Sync</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>
          {/* One always-active panel whose content we swap ourselves: Base UI's per-value panels
              wait on an animation-completion signal that never fires here, leaving stale panels
              mounted. Our tab state is store-driven anyway, so the conditional is the truth. */}
          <TabsContent className="min-h-64 pt-2" value={activeTab}>
            {activeTab === 'api-keys' && <ApiKeysPanel />}
            {activeTab === 'sync' && <SyncPanel />}
            {activeTab === 'data' && <DataPanel />}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

export function SettingsButton({ className }: { className?: string }) {
  const [, setSettingsTab] = deskReact.values.settingsTab.useState()

  return (
    <Button
      aria-label="Open settings"
      className={className}
      onClick={() => {
        setSettingsTab('api-keys')
      }}
      size="icon"
      title="Open settings"
      type="button"
      variant="ghost"
    >
      <SettingsIcon />
    </Button>
  )
}

// The data tab: your data lives only on this device, and leaving is a first-class gesture.
function DataPanel() {
  const { wipeAllData } = useApp()

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        Everything Tetra keeps — sessions, messages, the model catalog, API keys, and settings —
        lives only on this device.
      </p>

      <Field orientation="horizontal">
        <FieldContent>
          <FieldTitle>Delete all data</FieldTitle>
          <FieldDescription>
            Erase everything Tetra keeps on this device and start fresh.
          </FieldDescription>
        </FieldContent>
        <AlertDialog>
          <AlertDialogTrigger render={<Button type="button" variant="destructive" />}>
            Delete all data
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete all data?</AlertDialogTitle>
              <AlertDialogDescription>
                This erases everything Tetra keeps on this device: sessions and messages, the model
                catalog, API keys, settings, and the sync channel key. Other devices keep their own
                copies. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  void wipeAllData()
                }}
                variant="destructive"
              >
                Delete everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Field>
    </div>
  )
}
