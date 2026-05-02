import { BotIcon, PanelRightIcon } from 'lucide-react'
import { useState } from 'react'

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useRuntime } from '@/components/use-runtime'
import { useSession, useSessionMessageIds } from '@/lib/runtime/hooks'
import { useActiveSessionId } from '@/lib/ui'

import { Composer } from './composer'
import { DetailPanel } from './detail-panel'
import { TimelineMessage } from './message'
import { SessionConfig } from './session-config'
import { SessionDump } from './session-dump'

export function SessionView() {
  const activeSessionId = useActiveSessionId()

  if (activeSessionId === undefined || activeSessionId === '') {
    return null
  }

  return <ActiveSession key={activeSessionId} sessionId={activeSessionId} />
}

/** Renders the active session. Guards session existence — children can assume valid sessionId. */
function ActiveSession({ sessionId }: { sessionId: string }) {
  const runtime = useRuntime()
  const session = useSession(sessionId)
  const messageIds = useSessionMessageIds(sessionId)
  const [detailOpen, setDetailOpen] = useState(true)

  if (session === null) {
    return null
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-(--header-height) shrink-0 items-center justify-between gap-2 border-b px-2">
          <SidebarTrigger />
          <span className="min-w-0 flex-1 truncate font-medium text-sm">
            {session.title || 'New session'}
          </span>
          <SessionDump sessionId={sessionId} />
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
          <ConversationContent className="">
            {messageIds.length === 0 ? (
              <ConversationEmptyState
                description="Send a message to get started."
                icon={<BotIcon className="size-5" />}
                title="No messages yet"
              />
            ) : (
              messageIds.map((messageId, index) => (
                <TimelineMessage
                  isLast={index === messageIds.length - 1}
                  key={messageId}
                  messageId={messageId}
                  onRegenerate={() =>
                    runtime.commands.regenerate({
                      sessionId,
                      targetExecutorId: runtime.executorId,
                    })
                  }
                />
              ))
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
