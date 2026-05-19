import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@tetra/ui/components/ai-elements/conversation'
import { Button } from '@tetra/ui/components/ui/button'
import { ScrollArea } from '@tetra/ui/components/ui/scroll-area'
import { SidebarTrigger } from '@tetra/ui/components/ui/sidebar'
import { Toggle } from '@tetra/ui/components/ui/toggle'
import { BotIcon, Code2Icon, MessagesSquareIcon, PanelRightIcon, TableIcon } from 'lucide-react'
import { useState } from 'react'

import { useActiveSessionId, useSession, useSessionMessageIds } from '@/api'

import { Composer } from './composer'
import { SessionExportButton } from './export-button'
import { MessageBubble } from './message-bubble'
import { MessageInspector } from './message-inspector'
import { RequestsTable } from './requests-table'
import { SessionSettings } from './settings'

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
  const [detailOpen, setDetailOpen] = useState(true)
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
              setDetailOpen((prev) => !prev)
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
                    icon={<BotIcon className="size-5" />}
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
      {detailOpen && (
        <aside className="bg-muted/40 flex w-80 shrink-0 flex-col border-l">
          <ScrollArea className="flex-1">
            <div className="p-4">
              <SessionSettings sessionId={sessionId} />
            </div>
          </ScrollArea>
        </aside>
      )}
    </div>
  )
}
