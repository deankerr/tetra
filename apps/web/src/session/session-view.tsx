import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@tetra/ui/components/ai-elements/conversation'
import { Button } from '@tetra/ui/components/ui/button'
import { SidebarTrigger } from '@tetra/ui/components/ui/sidebar'
import { Toggle } from '@tetra/ui/components/ui/toggle'
import { BotIcon, Code2Icon, MessagesSquareIcon, PanelRightIcon } from 'lucide-react'
import { useState } from 'react'

import { useActiveSessionId, useSession, useSessionMessageIds } from '@/runtime/hooks'

import { Composer } from './composer'
import { DetailPanel } from './detail-panel'
import { MessageInspector } from './message-inspector'
import { SessionConfig } from './session-config'
import { SessionExport } from './session-export'
import { SessionMessage } from './session-message'

type MessageView = 'chat' | 'debug'

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
            aria-label={messageView === 'chat' ? 'Show debug view' : 'Show chat view'}
            onPressedChange={() => {
              setMessageView((view) => (view === 'chat' ? 'debug' : 'chat'))
            }}
            pressed={messageView === 'chat'}
            size="sm"
            variant="outline"
          >
            {messageView === 'chat' ? <Code2Icon /> : <MessagesSquareIcon />}
            <span className="sr-only">
              {messageView === 'chat' ? 'Show debug view' : 'Show chat view'}
            </span>
          </Toggle>
          <SessionExport sessionId={sessionId} />
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
                  <SessionMessage key={messageId} messageId={messageId} />
                ),
              )
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <Composer sessionId={sessionId} />
      </div>

      {/* Config panel */}
      <DetailPanel open={detailOpen}>
        <SessionConfig sessionId={sessionId} />
      </DetailPanel>
    </div>
  )
}
