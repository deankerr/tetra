import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@tetra/ui/components/ai-elements/conversation'
import { Button } from '@tetra/ui/components/ui/button'
import { Sheet, SheetClose, SheetContent } from '@tetra/ui/components/ui/sheet'
import { SidebarTrigger } from '@tetra/ui/components/ui/sidebar'
import { Toggle } from '@tetra/ui/components/ui/toggle'
import { Code2Icon, MessagesSquareIcon, PanelRightIcon, TableIcon, XIcon } from 'lucide-react'
import { useState } from 'react'

import { useActiveSessionId, useSession, useSessionMessageIds } from '@/api'
import { TetraLogo } from '@/components/tetra-logo'

import { Composer } from './composer'
import { SessionExportButton } from './export-button'
import { MessageBubble } from './message-bubble'
import { MessageInspector } from './message-inspector'
import { RequestsTable } from './requests-table'
import { SessionSettings } from './settings'
import { SystemPromptSheet } from './settings/prompt-field'

type MessageView = 'chat' | 'debug' | 'requests'

export function SessionView() {
  const activeSessionId = useActiveSessionId()

  if (activeSessionId === undefined || activeSessionId === '') {
    return null
  }

  return <ActiveSession key={activeSessionId} sessionId={activeSessionId} />
}

/** Renders the active session. Guards session existence — children can assume valid sessionId. */
function ActiveSession({ sessionId }: { sessionId: string }) {
  const session = useSession(sessionId)
  const messageIds = useSessionMessageIds(sessionId)
  const [detailOpen, setDetailOpen] = useState(false)
  const [promptSheetOpen, setPromptSheetOpen] = useState(false)
  const [messageView, setMessageView] = useState<MessageView>('debug')

  if (session === null) {
    return null
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-(--header-height) shrink-0 items-center justify-between gap-2 border-b px-2">
          <SidebarTrigger />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {session.title ?? 'New session'}
          </span>
          <Toggle
            aria-label="Show chat view"
            onPressedChange={() => {
              setMessageView('chat')
            }}
            pressed={messageView === 'chat'}
            size="sm"
            variant="outline"
          >
            <MessagesSquareIcon />
          </Toggle>
          <Toggle
            aria-label="Show debug view"
            onPressedChange={() => {
              setMessageView('debug')
            }}
            pressed={messageView === 'debug'}
            size="sm"
            variant="outline"
          >
            <Code2Icon />
          </Toggle>
          <Toggle
            aria-label="Show requests"
            onPressedChange={() => {
              setMessageView('requests')
            }}
            pressed={messageView === 'requests'}
            size="sm"
            variant="outline"
          >
            <TableIcon />
          </Toggle>
          <SessionExportButton sessionId={sessionId} />
          <Button
            onClick={() => {
              setDetailOpen(true)
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <PanelRightIcon />
          </Button>
        </header>

        {/* Requests table view */}
        {messageView === 'requests' ? (
          <RequestsTable sessionId={sessionId} />
        ) : (
          <>
            {/* Messages */}
            <Conversation>
              <ConversationContent>
                {messageIds.length === 0 ? (
                  <ConversationEmptyState
                    description="Send a message to get started."
                    icon={<TetraLogo className="size-5" />}
                    title="No messages yet"
                  />
                ) : (
                  messageIds.map((messageId) =>
                    messageView === 'debug' ? (
                      <MessageInspector key={messageId} messageId={messageId} />
                    ) : (
                      <MessageBubble key={messageId} messageId={messageId} />
                    ),
                  )
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <Composer sessionId={sessionId} />
          </>
        )}
      </div>

      {/* Config panel */}
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
      <SystemPromptSheet
        onOpenChange={setPromptSheetOpen}
        open={promptSheetOpen}
        sessionId={sessionId}
      />
    </div>
  )
}
