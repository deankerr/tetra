import { Button } from '@tetra/ui/components/ui/button'
import { Sheet, SheetClose, SheetContent } from '@tetra/ui/components/ui/sheet'
import { SidebarTrigger } from '@tetra/ui/components/ui/sidebar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tetra/ui/components/ui/tabs'
import { BracesIcon, Settings2Icon, TableIcon, TriangleIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { useJsonViewSheet } from '@/components/json-view-sheet'
import { WEB_UI_STORE_ID, typedTinybase, webUiTinybase } from '@/lib/tinybase'

import { TetraConversationView } from './conversation-view'
import { SessionExportButton } from './export-button'
import { RequestsTable } from './requests-table'
import { SessionSettings } from './settings'
import { PromptEditorSheet } from './settings/prompt-editor-sheet'
import { SessionUsageMeter } from './usage-meter'

export function SessionView() {
  const [activeSessionId, setActiveSessionId] = webUiTinybase.useValueState(
    'activeSessionId',
    WEB_UI_STORE_ID,
  )

  if (activeSessionId === '') {
    return null
  }

  return (
    <ActiveSession
      key={activeSessionId}
      onClose={() => {
        setActiveSessionId('')
      }}
      sessionId={activeSessionId}
    />
  )
}

/** Renders one session panel. Guards session existence — children can assume valid sessionId. */
function ActiveSession({ onClose, sessionId }: { onClose: () => void; sessionId: string }) {
  const session = typedTinybase.useEntity('sessions', sessionId)
  const [detailOpen, setDetailOpen] = useState(false)
  const [promptSheetOpen, setPromptSheetOpen] = useState(false)
  const { openJsonView } = useJsonViewSheet()

  if (session === null) {
    return null
  }

  return (
    <div className="flex min-h-0 min-w-[420px] flex-1 flex-col border-r last:border-r-0">
      {/* Main content */}
      <Tabs className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-2">
          <SidebarTrigger />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {session.title ?? 'New session'}
          </span>
          <SessionUsageMeter sessionId={sessionId} />
          <TabsList className="h-7">
            <TabsTrigger
              aria-label="Show Tetra conversation view"
              title="Show Tetra conversation view"
              value="tetra"
            >
              <TriangleIcon />
            </TabsTrigger>
            <TabsTrigger
              aria-label="Show requests table"
              title="Show requests table"
              value="requests"
            >
              <TableIcon />
            </TabsTrigger>
          </TabsList>
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

        <TabsContent className="flex min-h-0 flex-1 flex-col" value="tetra">
          <TetraConversationView sessionId={sessionId} />
        </TabsContent>

        <TabsContent className="flex min-h-0 flex-1 flex-col" value="requests">
          <RequestsTable sessionId={sessionId} />
        </TabsContent>
      </Tabs>

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
    </div>
  )
}
