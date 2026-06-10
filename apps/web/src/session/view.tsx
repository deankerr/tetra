import { Button } from '@tetra/ui/components/ui/button'
import { Sheet, SheetClose, SheetContent } from '@tetra/ui/components/ui/sheet'
import { SidebarTrigger } from '@tetra/ui/components/ui/sidebar'
import { BracesIcon, Settings2Icon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { useJsonViewSheet } from '@/components/json-view-sheet'
import { WEB_UI_STORE_ID, typedTinybase, webUiTinybase } from '@/lib/tinybase'

import { ConversationView } from './conversation-view'
import { SessionPanelErrorBoundary } from './error-boundary'
import { SessionExportButton } from './export-button'
import { SessionSettings } from './settings'
import { ModelPickerSheet } from './settings/model-picker'
import { PromptEditorSheet } from './settings/prompt-editor-sheet'
import { SessionUsageMeter } from './usage-meter'

export function SessionView() {
  const [activeSessionId, setActiveSessionId] = webUiTinybase.useValueState(
    'activeSessionId',
    WEB_UI_STORE_ID,
  )

  if (activeSessionId === '') {
    return <NoSessionSelected />
  }

  return (
    <SessionPanelErrorBoundary
      key={activeSessionId}
      onClose={() => {
        setActiveSessionId('')
      }}
      sessionId={activeSessionId}
    >
      <ActiveSession
        onClose={() => {
          setActiveSessionId('')
        }}
        sessionId={activeSessionId}
      />
    </SessionPanelErrorBoundary>
  )
}

function NoSessionSelected() {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="flex h-(--header-height) shrink-0 items-center border-b px-2">
        <SidebarTrigger title="Open sidebar" />
      </header>
    </div>
  )
}

/** Renders one session panel. Guards session existence — children can assume valid sessionId. */
function ActiveSession({ onClose, sessionId }: { onClose: () => void; sessionId: string }) {
  const session = typedTinybase.useEntity('sessions', sessionId)
  const [detailOpen, setDetailOpen] = useState(false)
  const [modelPickerOpen, setModelPickerOpen] = useState(false)
  const [modelId, setModelId] = typedTinybase.useCellState(
    'sessionRunConfigs',
    sessionId,
    'modelId',
  )
  const [promptSheetOpen, setPromptSheetOpen] = useState(false)
  const { openJsonView } = useJsonViewSheet()

  if (session === null) {
    return null
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

          <SessionUsageMeter sessionId={sessionId} />

          <Button
            aria-label="Inspect JSON"
            onClick={() => {
              openJsonView({ title: `Session: ${session.id}`, value: session })
            }}
            size="icon-sm"
            title="Inspect JSON"
            variant="ghost"
          >
            <BracesIcon />
          </Button>

          <SessionExportButton sessionId={sessionId} />

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

          <Button
            aria-label="Close session"
            onClick={onClose}
            size="icon-sm"
            title="Close session"
            type="button"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </header>

        <ConversationView sessionId={sessionId} />
      </div>

      {/* Settings sheet */}
      <Sheet onOpenChange={setDetailOpen} open={detailOpen}>
        <SheetContent className="w-80 sm:max-w-80" showCloseButton={false}>
          <div className="flex h-(--header-height) shrink-0 items-center justify-between border-b px-2">
            <span className="px-2 text-xs font-medium">Settings</span>
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
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <SessionSettings
              modelId={modelId ?? ''}
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
          setModelId(nextModelId)
        }}
        open={modelPickerOpen}
        value={modelId ?? ''}
      />
    </div>
  )
}
