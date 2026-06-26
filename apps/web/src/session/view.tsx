import { Link } from '@tanstack/react-router'
import { Button } from '@tetra/ui/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@tetra/ui/components/ui/sheet'
import { SidebarTrigger } from '@tetra/ui/components/ui/sidebar'
import { HomeIcon, Settings2Icon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { libraryTinybase } from '@/store'

import { ConversationView } from './conversation-view'
import { SessionPanelErrorBoundary } from './error-boundary'
import { useSessionRunConfig } from './run-config-state'
import { SessionSettings } from './settings'
import { ModelPickerSheet } from './settings/model-picker'
import { PromptEditorSheet } from './settings/prompt-editor-sheet'

export function SessionView({ sessionId }: { sessionId: string }) {
  return (
    <SessionPanelErrorBoundary key={sessionId} sessionId={sessionId}>
      <ActiveSession sessionId={sessionId} />
    </SessionPanelErrorBoundary>
  )
}

function MissingSession() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* Header */}
      <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-2">
        <SidebarTrigger title="Open sidebar" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">Session not found</span>
      </header>

      {/* Empty state */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex max-w-md flex-col gap-1">
          <h1 className="text-lg font-medium">Session not found</h1>
          <p className="text-muted-foreground text-sm">
            This session no longer exists in the local store.
          </p>
        </div>
        <Button nativeButton={false} render={<Link to="/" />} variant="outline">
          <HomeIcon />
          New session
        </Button>
      </div>
    </div>
  )
}

/** Renders one session panel. Guards session existence — children can assume valid sessionId. */
function ActiveSession({ sessionId }: { sessionId: string }) {
  const session = libraryTinybase.useEntity('sessions', sessionId)
  const [detailOpen, setDetailOpen] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [config, updateConfig] = useSessionRunConfig(sessionId)
  const [promptSheetOpen, setPromptSheetOpen] = useState(false)

  if (session === null) {
    return <MissingSession />
  }

  return (
    <div className="flex min-h-0 min-w-[420px] flex-1 flex-col border-r last:border-r-0">
      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-2">
          <SidebarTrigger />

          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {session.title ?? 'New session'}
          </span>

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
        </header>

        <ConversationView sessionId={sessionId} />
      </div>

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
              modelId={config.modelId}
              onOpenModelPicker={() => {
                setModelPickerOpen(true)
              }}
              onOpenPromptSheet={() => {
                setPromptSheetOpen(true)
              }}
              sessionId={sessionId}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Prompt sheet — sibling to settings sheet so portal events don't bubble through its popup */}
      <PromptEditorSheet
        onOpenChange={setPromptSheetOpen}
        open={promptSheetOpen}
        sessionId={sessionId}
      />

      {/* Model sheet — sibling to settings sheet for the same stacked overlay behavior. */}
      <ModelPickerSheet
        onOpenChange={setModelPickerOpen}
        onValueChange={(nextModelId) => {
          updateConfig({ modelId: nextModelId })
        }}
        open={modelPickerOpen}
        value={config.modelId}
      />
    </div>
  )
}
