import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@tetra/ui/components/ai-elements/conversation'
import { Button } from '@tetra/ui/components/ui/button'
import { Sheet, SheetClose, SheetContent } from '@tetra/ui/components/ui/sheet'
import { SidebarTrigger } from '@tetra/ui/components/ui/sidebar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tetra/ui/components/ui/tabs'
import { Code2Icon, MessagesSquareIcon, Settings2Icon, TableIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { TetraLogo } from '@/components/tetra-logo'
import { useOpenSessionIds, useSetOpenSessionIds } from '@/tetra/hooks/app-state'
import { useSession } from '@/tetra/hooks/sessions'
import { useSessionMessageIds } from '@/tetra/hooks/transcripts'

import { Composer } from './composer'
import { SessionExportButton } from './export-button'
import { MessageBubble } from './message-bubble'
import { MessageInspector } from './message-inspector'
import { RequestsTable } from './requests-table'
import { SessionSettings } from './settings'
import { PromptEditorSheet } from './settings/prompt-editor-sheet'

export function SessionView() {
  const openSessionIds = useOpenSessionIds()
  const setOpenSessionIds = useSetOpenSessionIds()

  if (openSessionIds.length === 0) {
    return null
  }

  return (
    <>
      {openSessionIds.map((sessionId, index) => (
        <ActiveSession
          key={sessionId}
          onClose={() => {
            setOpenSessionIds(openSessionIds.filter((id) => id !== sessionId))
          }}
          sessionId={sessionId}
          showSidebarTrigger={index === 0}
        />
      ))}
    </>
  )
}

/** Renders one session panel. Guards session existence — children can assume valid sessionId. */
function ActiveSession({
  onClose,
  sessionId,
  showSidebarTrigger,
}: {
  onClose: () => void
  sessionId: string
  showSidebarTrigger: boolean
}) {
  const session = useSession(sessionId)
  const messageIds = useSessionMessageIds(sessionId)
  const [detailOpen, setDetailOpen] = useState(false)
  const [promptSheetOpen, setPromptSheetOpen] = useState(false)

  if (session === null) {
    return null
  }

  return (
    <div className="flex min-h-0 min-w-[420px] flex-1 flex-col border-r last:border-r-0">
      {/* Main content */}
      <Tabs className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b px-2">
          {showSidebarTrigger && <SidebarTrigger />}
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {session.title ?? 'New session'}
          </span>
          <TabsList className="h-7">
            <TabsTrigger aria-label="Show chat view" value="chat">
              <MessagesSquareIcon />
            </TabsTrigger>
            <TabsTrigger aria-label="Show inspector view" value="inspector">
              <Code2Icon />
            </TabsTrigger>
            <TabsTrigger aria-label="Show requests table" value="requests">
              <TableIcon />
            </TabsTrigger>
          </TabsList>
          <SessionExportButton sessionId={sessionId} />
          <Button
            onClick={() => {
              setDetailOpen(true)
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Settings2Icon />
          </Button>
          <Button onClick={onClose} size="icon-sm" type="button" variant="ghost">
            <XIcon />
          </Button>
        </header>

        <TabsContent className="flex min-h-0 flex-1 flex-col" value="chat">
          <Conversation>
            <ConversationContent>
              {messageIds.length === 0 ? (
                <ConversationEmptyState
                  description="Send a message to get started."
                  icon={<TetraLogo className="size-5" />}
                  title="No messages yet"
                />
              ) : (
                messageIds.map((messageId) => (
                  <MessageBubble key={messageId} messageId={messageId} />
                ))
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <Composer sessionId={sessionId} />
        </TabsContent>

        <TabsContent className="flex min-h-0 flex-1 flex-col" value="inspector">
          <Conversation>
            <ConversationContent>
              {messageIds.length === 0 ? (
                <ConversationEmptyState
                  description="Send a message to get started."
                  icon={<TetraLogo className="size-5" />}
                  title="No messages yet"
                />
              ) : (
                messageIds.map((messageId) => (
                  <MessageInspector key={messageId} messageId={messageId} />
                ))
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <Composer sessionId={sessionId} />
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
            <SheetClose render={<Button variant="ghost" size="icon-sm" />}>
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
