'use client'

import {
  BotIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SendHorizonalIcon,
  SquareIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  Provider,
  useCell,
  useIndexes,
  useSliceRowIds,
  useStore,
  useValue,
} from 'tinybase/ui-react'

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup } from '@/components/ui/field'
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  cancelActiveCommand,
  createSession,
  getChatApp,
  getMessageText,
  retryLastAssistantMessage,
  selectSession,
  sendMessage,
  updateAgent,
} from '@/lib/chat/app'
import { CONFIG_STORE_ID, RUNTIME_INDEXES_ID, RUNTIME_STORE_ID } from '@/lib/chat/types'
import type { StoredMessage } from '@/lib/chat/types'

type SessionView = {
  activeCommandId: string
  agentId: string
  errorMessage: string
  status: 'idle' | 'streaming' | 'error'
  title: string
}

type CommandView = {
  createdAt: number
  errorMessage: string
  sessionId: string
  status: 'pending' | 'processing' | 'complete' | 'error' | 'canceled'
  type: 'send' | 'cancel' | 'retry'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isStoredMessage = (value: unknown): value is StoredMessage =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  (value.role === 'assistant' || value.role === 'system' || value.role === 'user') &&
  Array.isArray(value.parts)

const readString = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback)

const readNumber = (value: unknown, fallback = 0) => (typeof value === 'number' ? value : fallback)

const getStatusBadgeVariant = (status: SessionView['status']) => {
  if (status === 'error') {
    return 'destructive'
  }
  if (status === 'streaming') {
    return 'secondary'
  }
  return 'outline'
}

const getCommandBadgeVariant = (status: CommandView['status']) => {
  if (status === 'error') {
    return 'destructive'
  }
  if (status === 'processing') {
    return 'secondary'
  }
  return 'outline'
}

const useSessionView = (sessionId: string): SessionView => ({
  activeCommandId: readString(useCell('sessions', sessionId, 'activeCommandId', RUNTIME_STORE_ID)),
  agentId: readString(useCell('sessions', sessionId, 'agentId', RUNTIME_STORE_ID)),
  errorMessage: readString(useCell('sessions', sessionId, 'errorMessage', RUNTIME_STORE_ID)),
  status: (() => {
    const rawStatus = readString(useCell('sessions', sessionId, 'status', RUNTIME_STORE_ID))
    if (rawStatus === 'streaming' || rawStatus === 'error') {
      return rawStatus
    }
    return 'idle'
  })(),
  title: readString(useCell('sessions', sessionId, 'title', RUNTIME_STORE_ID), 'New session'),
})

const useCommandView = (commandId: string): CommandView => ({
  createdAt: readNumber(useCell('commands', commandId, 'createdAt', RUNTIME_STORE_ID)),
  errorMessage: readString(useCell('commands', commandId, 'errorMessage', RUNTIME_STORE_ID)),
  sessionId: readString(useCell('commands', commandId, 'sessionId', RUNTIME_STORE_ID)),
  status: (() => {
    const rawStatus = readString(useCell('commands', commandId, 'status', RUNTIME_STORE_ID))
    if (
      rawStatus === 'processing' ||
      rawStatus === 'complete' ||
      rawStatus === 'error' ||
      rawStatus === 'canceled'
    ) {
      return rawStatus
    }
    return 'pending'
  })(),
  type: (() => {
    const rawType = readString(useCell('commands', commandId, 'type', RUNTIME_STORE_ID))
    if (rawType === 'cancel' || rawType === 'retry') {
      return rawType
    }
    return 'send'
  })(),
})

const useStoredMessage = (messageId: string) => {
  const value = useCell('messages', messageId, 'message', RUNTIME_STORE_ID)
  return isStoredMessage(value) ? value : null
}

function StatusBadge({ status }: { status: SessionView['status'] }) {
  return <Badge variant={getStatusBadgeVariant(status)}>{status}</Badge>
}

function CommandStatusBadge({ status }: { status: CommandView['status'] }) {
  return <Badge variant={getCommandBadgeVariant(status)}>{status}</Badge>
}

function SessionList() {
  const runtimeStore = useStore(RUNTIME_STORE_ID)
  const sessionIds = useSliceRowIds('sessionsByRecency', 'all', RUNTIME_INDEXES_ID)
  const activeSessionId = readString(useValue('activeSessionId', RUNTIME_STORE_ID))

  if (runtimeStore === undefined) {
    return null
  }

  return (
    <ItemGroup className="gap-2">
      {sessionIds.map((sessionId) => (
        <SessionListItem
          active={sessionId === activeSessionId}
          key={sessionId}
          onSelect={() => {
            selectSession(runtimeStore, sessionId)
          }}
          sessionId={sessionId}
        />
      ))}
    </ItemGroup>
  )
}

function SessionListItem({
  active,
  onSelect,
  sessionId,
}: {
  active: boolean
  onSelect: () => void
  sessionId: string
}) {
  const session = useSessionView(sessionId)
  const messageIds = useSliceRowIds('messagesBySession', sessionId, RUNTIME_INDEXES_ID)
  const latestMessageId = messageIds.at(-1) ?? ''
  const latestMessage = useStoredMessage(latestMessageId)

  let preview = 'No messages yet'
  if (latestMessage !== null) {
    preview = getMessageText(latestMessage) || 'No text content yet'
  }

  return (
    <button className="w-full text-left" onClick={onSelect} type="button">
      <Item
        className={
          active ? 'border-primary/30 bg-primary/5' : 'hover:border-border hover:bg-muted/40'
        }
        variant="outline"
      >
        <ItemContent>
          <div className="flex items-center justify-between gap-2">
            <ItemTitle>{session.title}</ItemTitle>
            <StatusBadge status={session.status} />
          </div>
          <ItemDescription>{preview}</ItemDescription>
        </ItemContent>
      </Item>
    </button>
  )
}

function AgentPanel({ sessionId }: { sessionId: string }) {
  const configStore = useStore(CONFIG_STORE_ID)
  const session = useSessionView(sessionId)
  const model = readString(useCell('agents', session.agentId, 'model', CONFIG_STORE_ID))
  const systemPrompt = readString(
    useCell('agents', session.agentId, 'systemPrompt', CONFIG_STORE_ID),
  )

  if (configStore === undefined || session.agentId === '') {
    return null
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Agent</CardTitle>
        <CardDescription>
          Edit the seeded agent to evaluate config-store ergonomics.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field className="flex flex-col gap-2">
            <label className="font-medium text-xs/relaxed text-muted-foreground" htmlFor="model">
              Model
            </label>
            <Textarea
              id="model"
              onChange={(event) => {
                updateAgent(configStore, session.agentId, { model: event.target.value })
              }}
              rows={2}
              value={model}
            />
          </Field>
          <Field className="flex flex-col gap-2">
            <label
              className="font-medium text-xs/relaxed text-muted-foreground"
              htmlFor="system-prompt"
            >
              System prompt
            </label>
            <Textarea
              id="system-prompt"
              onChange={(event) => {
                updateAgent(configStore, session.agentId, { systemPrompt: event.target.value })
              }}
              rows={6}
              value={systemPrompt}
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

function RuntimePanel({ sessionId }: { sessionId: string }) {
  const commandIds = useSliceRowIds('commandsByCreatedAt', 'all', RUNTIME_INDEXES_ID).slice(0, 6)
  const session = useSessionView(sessionId)

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Runtime State</CardTitle>
        <CardDescription>
          Recent commands stay visible so failure and recovery paths are inspectable.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={session.status} />
          {session.activeCommandId ? (
            <Badge variant="secondary">active {session.activeCommandId}</Badge>
          ) : null}
          {session.errorMessage ? (
            <Badge variant="destructive">{session.errorMessage}</Badge>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          {commandIds.map((commandId) => (
            <RuntimeCommand key={commandId} commandId={commandId} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function RuntimeCommand({ commandId }: { commandId: string }) {
  const command = useCommandView(commandId)
  const subtitle =
    command.errorMessage === ''
      ? `${command.sessionId} at ${new Date(command.createdAt).toLocaleTimeString()}`
      : command.errorMessage

  return (
    <Item size="xs" variant="muted">
      <ItemContent>
        <div className="flex items-center justify-between gap-2">
          <ItemTitle>{command.type}</ItemTitle>
          <CommandStatusBadge status={command.status} />
        </div>
        <ItemDescription>{subtitle}</ItemDescription>
      </ItemContent>
    </Item>
  )
}

function MessageList({ sessionId }: { sessionId: string }) {
  const messageIds = useSliceRowIds('messagesBySession', sessionId, RUNTIME_INDEXES_ID)

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <Conversation className="h-full min-h-0 rounded-2xl border border-border/60 bg-background/60 shadow-sm">
        <ConversationContent className="gap-6 px-6 py-5">
          {messageIds.length === 0 ? (
            <ConversationEmptyState
              description="Start a conversation and watch the runtime write through TinyBase."
              icon={<BotIcon className="size-5" />}
              title="No messages yet"
            />
          ) : (
            messageIds.map((messageId) => <TimelineMessage key={messageId} messageId={messageId} />)
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  )
}

function TimelineMessage({ messageId }: { messageId: string }) {
  const message = useStoredMessage(messageId)

  if (message === null) {
    return null
  }

  const text = getMessageText(message)
  const assistantContent =
    text === '' ? (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" />
        <span>Streaming response…</span>
      </div>
    ) : (
      <MessageResponse>{text}</MessageResponse>
    )
  const content =
    message.role === 'assistant' ? (
      assistantContent
    ) : (
      <div className="whitespace-pre-wrap">{text}</div>
    )

  return (
    <Message from={message.role}>
      <MessageContent>{content}</MessageContent>
    </Message>
  )
}

function Composer({ sessionId }: { sessionId: string }) {
  const runtimeStore = useStore(RUNTIME_STORE_ID)
  const runtimeIndexes = useIndexes(RUNTIME_INDEXES_ID)
  const session = useSessionView(sessionId)
  const [draft, setDraft] = useState('')

  if (runtimeStore === undefined || runtimeIndexes === undefined) {
    return null
  }

  const sendDraft = () => {
    const commandId = sendMessage(runtimeStore, sessionId, draft)
    if (commandId !== null) {
      setDraft('')
    }
  }

  return (
    <Card className="border-t border-border/60 bg-background/90 backdrop-blur-sm">
      <CardContent className="flex flex-col gap-4 py-0">
        <Textarea
          className="min-h-28 border-0 bg-transparent px-0 py-4 shadow-none focus-visible:ring-0"
          onChange={(event) => {
            setDraft(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (session.status === 'streaming') {
                return
              }
              sendDraft()
            }
          }}
          placeholder="Send a prompt into the TinyBase runtime. Shift+Enter for newline."
          value={draft}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 py-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <StatusBadge status={session.status} />
            <span>Active session: {sessionId}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              disabled={session.status === 'streaming'}
              onClick={() => {
                retryLastAssistantMessage(runtimeStore, runtimeIndexes, sessionId)
              }}
              type="button"
              variant="outline"
            >
              <RefreshCwIcon data-icon="inline-start" />
              Retry
            </Button>
            {session.status === 'streaming' ? (
              <Button
                onClick={() => {
                  cancelActiveCommand(runtimeStore, sessionId)
                }}
                type="button"
                variant="outline"
              >
                <SquareIcon data-icon="inline-start" />
                Cancel
              </Button>
            ) : null}
            <Button
              disabled={session.status === 'streaming' || draft.trim() === ''}
              onClick={sendDraft}
              type="button"
            >
              <SendHorizonalIcon data-icon="inline-start" />
              Send
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Workspace() {
  const runtimeStore = useStore(RUNTIME_STORE_ID)
  const activeSessionId = readString(useValue('activeSessionId', RUNTIME_STORE_ID))

  if (runtimeStore === undefined || activeSessionId === '') {
    return null
  }

  return (
    <div className="grid h-svh grid-cols-[320px_1fr] overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(81,181,196,0.12),_transparent_32%),linear-gradient(to_bottom,_var(--color-background),_color-mix(in_oklch,var(--color-muted)_45%,white))]">
      <aside className="flex min-h-0 flex-col border-r border-border/60 bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-4">
          <div>
            <div className="font-medium text-sm">tinybasechat</div>
            <div className="text-muted-foreground text-xs">Initial slice prototype</div>
          </div>
          <Button
            onClick={() => {
              createSession(runtimeStore)
            }}
            size="icon-sm"
            type="button"
            variant="outline"
          >
            <PlusIcon />
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1 px-4 pb-4">
          <div className="flex flex-col gap-4">
            <SessionList />
            <Separator />
            <AgentPanel sessionId={activeSessionId} />
            <RuntimePanel sessionId={activeSessionId} />
          </div>
        </ScrollArea>
      </aside>
      <main className="flex min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border/60 bg-background/70 px-6 py-4 backdrop-blur-sm">
          <div className="font-medium text-sm">Evaluate the proposed TinyBase structure</div>
          <div className="text-muted-foreground text-xs">
            UI writes commands to the runtime store. The runtime owns streaming and recovery.
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-6 py-4">
          <MessageList sessionId={activeSessionId} />
          <Composer sessionId={activeSessionId} />
        </div>
      </main>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Loading TinyBase prototype</CardTitle>
          <CardDescription>Restoring config and runtime stores from IndexedDB.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Preparing local-first state…</span>
        </CardContent>
      </Card>
    </div>
  )
}

export function PrototypeApp() {
  const appRef = useRef(getChatApp())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    const initialize = async () => {
      await appRef.current.initialize()
      if (cancelled) {
        return
      }

      appRef.current.startRuntime()
      setReady(true)
    }

    void initialize()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Provider
      indexesById={{ [RUNTIME_INDEXES_ID]: appRef.current.runtimeIndexes }}
      storesById={{
        [CONFIG_STORE_ID]: appRef.current.configStore,
        [RUNTIME_STORE_ID]: appRef.current.runtimeStore,
      }}
    >
      {ready ? <Workspace /> : <LoadingState />}
    </Provider>
  )
}
