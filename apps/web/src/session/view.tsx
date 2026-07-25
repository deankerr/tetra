import { Link } from '@tanstack/react-router'
import { Button } from '@tetra/ui/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@tetra/ui/components/ui/sheet'
import { HomeIcon, Settings2Icon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { MissingOpenRouterApiKeyButton, useRequireOpenRouterApiKey } from '@/api-key-settings'
import { WorkspacePane } from '@/components/workspace-pane'
import { libraryReact } from '@/stores'

import { ConversationView } from './conversation-view'
import { SessionPanelErrorBoundary } from './error-boundary'
import { PersistedRunConfigProvider, useRunConfig } from './run-config-providers'
import { SessionSettings } from './settings'
import { ModelPickerSheet } from './settings/model-picker'
import { PromptEditorSheet } from './settings/prompt-editor-sheet'

export function SessionView({ sessionId }: { sessionId: string }) {
  return <ActiveSession sessionId={sessionId} />
}

function MissingSession() {
  return (
    <WorkspacePane actions={<MissingOpenRouterApiKeyButton />} title="Session not found">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex max-w-md flex-col gap-1">
          <h1 className="text-lg font-medium">Session not found</h1>
          <p className="text-muted-foreground text-sm">
            This session no longer exists in the local store.
          </p>
        </div>
        <Button nativeButton={false} render={<Link to="/" />} variant="outline">
          <HomeIcon data-icon="inline-start" />
          New session
        </Button>
      </div>
    </WorkspacePane>
  )
}

/** Renders one session panel. Guards session existence — children can assume valid sessionId. */
function ActiveSession({ sessionId }: { sessionId: string }) {
  const session = libraryReact.sessions.useGet(sessionId)

  if (session === null) {
    return <MissingSession />
  }

  return <ActiveSessionWorkspace session={session} sessionId={sessionId} />
}

function ActiveSessionWorkspace({
  session,
  sessionId,
}: {
  session: { title: string }
  sessionId: string
}) {
  const [detailOpen, setDetailOpen] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [promptSheetOpen, setPromptSheetOpen] = useState(false)

  return (
    <WorkspacePane
      actions={
        <>
          <MissingOpenRouterApiKeyButton />
          <Button
            aria-label="Open session settings"
            onClick={() => {
              setDetailOpen(true)
            }}
            size="icon-sm"
            title="Open session settings"
            type="button"
            variant="ghost"
          >
            <Settings2Icon />
          </Button>
        </>
      }
      className="min-w-[420px] border-r last:border-r-0"
      title={session.title ?? 'New session'}
    >
      <SessionPanelErrorBoundary key={sessionId} sessionId={sessionId}>
        <PersistedRunConfigProvider sessionId={sessionId}>
          <ActiveSessionContent
            detailOpen={detailOpen}
            modelPickerOpen={modelPickerOpen}
            promptSheetOpen={promptSheetOpen}
            sessionId={sessionId}
            setDetailOpen={setDetailOpen}
            setModelPickerOpen={setModelPickerOpen}
            setPromptSheetOpen={setPromptSheetOpen}
          />
        </PersistedRunConfigProvider>
      </SessionPanelErrorBoundary>
    </WorkspacePane>
  )
}

function ActiveSessionContent({
  detailOpen,
  modelPickerOpen,
  promptSheetOpen,
  sessionId,
  setDetailOpen,
  setModelPickerOpen,
  setPromptSheetOpen,
}: {
  detailOpen: boolean
  modelPickerOpen: boolean
  promptSheetOpen: boolean
  sessionId: string
  setDetailOpen: (open: boolean) => void
  setModelPickerOpen: (open: boolean) => void
  setPromptSheetOpen: (open: boolean) => void
}) {
  const { config, updateConfig } = useRunConfig()
  const requireGenerateReady = useRequireOpenRouterApiKey()

  return (
    <>
      <ConversationView requireGenerateReady={requireGenerateReady} sessionId={sessionId} />
      {/* Settings sheet */}
      <Sheet onOpenChange={setDetailOpen} open={detailOpen}>
        <SheetContent className="w-80 sm:max-w-80">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
            <SheetClose
              render={
                <Button
                  aria-label="Close session settings"
                  size="icon-sm"
                  title="Close session settings"
                  variant="ghost"
                />
              }
            >
              <XIcon />
            </SheetClose>
          </SheetHeader>

          <div className="p-4">
            <SessionSettings
              onOpenModelPicker={() => {
                setModelPickerOpen(true)
              }}
              onOpenPromptSheet={() => {
                setPromptSheetOpen(true)
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Prompt sheet — sibling to settings sheet so portal events don't bubble through its popup */}
      <PromptEditorSheet onOpenChange={setPromptSheetOpen} open={promptSheetOpen} />

      {/* Model sheet — sibling to settings sheet for the same stacked overlay behavior. */}
      <ModelPickerSheet
        onOpenChange={setModelPickerOpen}
        onValueChange={(nextModelId) => {
          updateConfig({ modelId: nextModelId })
        }}
        open={modelPickerOpen}
        value={config.modelId}
      />
    </>
  )
}
