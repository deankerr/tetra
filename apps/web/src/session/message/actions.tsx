import type { Rows } from '@tetra/store-schema'
import { MessageActions, MessageToolbar } from '@tetra/ui/components/ai-elements/message'
import { Button } from '@tetra/ui/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@tetra/ui/components/ui/tooltip'
import { BracesIcon, CopyIcon, ListTreeIcon, RefreshCwIcon, TrashIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'

import { useJsonViewSheet } from '@/components/json-view-sheet'
import { typedTinybase } from '@/lib/tinybase'
import { useTetra } from '@/tetra-context'

import { RunDetailSheet } from '../run-detail-sheet'
import { useSessionThreadSelection } from '../thread-view'
import { useMessageRunActive } from './data'
import type { MessagePart } from './data'
import { MessageForkControl } from './fork-control'

export function MessageActionsView({
  isThreadLeafMessage,
  message,
  run,
}: {
  isThreadLeafMessage: boolean
  message: Rows['messages']
  run: Rows['runs'] | null
}) {
  const { runs, transcripts } = useTetra()
  const { openJsonView } = useJsonViewSheet()
  const { selectThreadFromMessage } = useSessionThreadSelection(message.sessionId)
  const [runDetailOpen, setRunDetailOpen] = useState(false)
  const hasContinuations = useMessageHasContinuations(message)
  const messageText = getTextContent(message.parts)
  const isActive = useMessageRunActive(run)

  const canDelete = !hasContinuations && !isActive
  const canGenerate = isThreadLeafMessage && !isActive
  const deleteActionLabel = canDelete ? 'Delete' : 'Only leaf messages can be deleted'
  const generateActionLabel = run === null ? 'Generate' : 'Regenerate'

  return (
    <MessageToolbar className="mt-1">
      <MessageActions>
        <MessageForkControl message={message} />
        <MessageIconAction
          disabled={messageText === ''}
          label="Copy"
          onClick={() => void navigator.clipboard.writeText(messageText)}
          tooltip="Copy"
        >
          <CopyIcon />
        </MessageIconAction>
        <MessageIconAction
          label="Inspect JSON"
          onClick={() => {
            openJsonView({ title: `Message: ${message.id}`, value: message })
          }}
          tooltip="Inspect JSON"
        >
          <BracesIcon />
        </MessageIconAction>

        {run && (
          <>
            <MessageIconAction
              label="View run details"
              onClick={() => {
                setRunDetailOpen(true)
              }}
              tooltip="View run details"
            >
              <ListTreeIcon />
            </MessageIconAction>
            <RunDetailSheet onOpenChange={setRunDetailOpen} open={runDetailOpen} runId={run.id} />
          </>
        )}

        {canGenerate && (
          <MessageIconAction
            label={generateActionLabel}
            onClick={() => {
              const session = transcripts.getSession(message.sessionId)

              if (run !== null) {
                const targetMessageId = session.appendMessage({
                  parentMessageId: message.parentMessageId,
                  parts: [],
                  role: message.role,
                })
                runs.generate({ targetMessageId })
                selectThreadFromMessage(targetMessageId)
                return
              }

              const targetMessageId = session.appendMessage({
                parentMessageId: message.id,
                parts: [],
                role: 'assistant',
              })
              runs.generate({ targetMessageId })
              selectThreadFromMessage(targetMessageId)
            }}
            tooltip={generateActionLabel}
          >
            <RefreshCwIcon />
          </MessageIconAction>
        )}

        <MessageIconAction
          disabled={!canDelete}
          label="Delete"
          onClick={() => {
            if (hasContinuations) {
              return
            }

            transcripts.getSession(message.sessionId).deleteMessage(message.id)
          }}
          tooltip={deleteActionLabel}
        >
          <TrashIcon />
        </MessageIconAction>
      </MessageActions>

      <MessageMetadata message={message} />
    </MessageToolbar>
  )
}

function MessageIconAction({
  children,
  disabled = false,
  label,
  onClick,
  tooltip,
}: {
  children: ReactNode
  disabled?: boolean
  label: string
  onClick?: () => void
  tooltip: string
}) {
  const button = (
    <Button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      {children}
      <span className="sr-only">{label}</span>
    </Button>
  )

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>
        <p>{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  )
}

function MessageMetadata({ message }: { message: Rows['messages'] }) {
  return (
    <div className="text-muted-foreground text-xxs flex min-w-0 flex-wrap items-center justify-end gap-x-2.5 gap-y-1">
      <span>{formatDateTime(message.updatedAt)}</span>
    </div>
  )
}

function useMessageHasContinuations(message: Rows['messages']): boolean {
  const tetra = useTetra()
  const messageIds = typedTinybase.useSliceRowIds('messagesBySession', message.sessionId)

  return messageIds.some((messageId) => {
    const candidate = tetra.typedStore.tables.messages.requireEntity(messageId)
    return candidate.parentMessageId === message.id
  })
}

function getTextContent(parts: MessagePart[]): string {
  return parts
    .filter((part): part is Extract<MessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
