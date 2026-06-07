import { summarizeSteps } from '@tetra/core'
import type { Rows } from '@tetra/store-schema'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@tetra/ui/components/ai-elements/tool'
import type { ToolPart as ToolPartType } from '@tetra/ui/components/ai-elements/tool'
import { Badge } from '@tetra/ui/components/ui/badge'
import { Button } from '@tetra/ui/components/ui/button'
import { cn } from '@tetra/ui/lib/utils'
import {
  BanIcon,
  BracesIcon,
  CheckCircle2Icon,
  CopyIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  TrashIcon,
  XCircleIcon,
} from 'lucide-react'
import { useMemo } from 'react'

import { useJsonViewSheet } from '@/components/json-view-sheet'
import { typedTinybase } from '@/lib/tinybase'
import { useTetra } from '@/tetra-context'

import { useRunSteps } from './usage-hooks'

type UIMessagePart = Rows['messages']['parts'][number]
type RunStatus = Rows['runs']['status']

function useTetraMessage(messageId: string) {
  const message = typedTinybase.useEntity('messages', messageId)
  const streamingParts = typedTinybase.useEntity('streamingMessageParts', messageId)
  const run = useRunForMessage(messageId)
  const steps = useRunSteps(streamingParts?.runId ?? run?.id)

  return useMemo(() => {
    if (!message) {
      return null
    }

    const parts = streamingParts?.parts ?? message.parts
    const usage = summarizeSteps(steps)
    const totalTokens = usage.totalTokens ?? 0

    return {
      createdAt: message.createdAt,
      id: message.id,
      parentMessageId: message.parentMessageId,
      role: message.role,
      run: run
        ? {
            errorMessage: run.errorMessage ?? null,
            status: run.status,
            totals:
              totalTokens === 0
                ? null
                : {
                    cost: usage.costTotal ?? null,
                    total: totalTokens,
                  },
          }
        : null,
      sessionId: message.sessionId,
      stepGroups: groupPartsByStep(parts, steps),
      updatedAt: message.updatedAt,
    }
  }, [message, run, steps, streamingParts])
}

function useRunForMessage(messageId: string) {
  const ids = typedTinybase.useSliceRowIds('runsByTargetMessageNewestFirst', messageId)
  return typedTinybase.useEntity('runs', ids[0] ?? '')
}

// Groups a flat parts array into per-step buckets using step-start markers as boundaries.
function groupPartsByStep(parts: UIMessagePart[], stepRecords: Rows['steps'][]) {
  let current: UIMessagePart[] = []
  let hasSeenStepStart = false
  const groups: UIMessagePart[][] = []

  for (const part of parts) {
    if (part.type === 'step-start') {
      if (hasSeenStepStart) {
        groups.push(current)
      }
      current = []
      hasSeenStepStart = true
    } else {
      current.push(part)
    }
  }
  groups.push(current)

  return groups.map((stepParts, i) => {
    const record = stepRecords[i] ?? null
    return { inference: record, parts: stepParts, stepIndex: i }
  })
}

export function TetraMessageView({
  isLastMessage,
  messageId,
  className,
  ...props
}: { isLastMessage: boolean; messageId: string } & React.ComponentProps<'div'>) {
  const message = useTetraMessage(messageId)

  if (!message) {
    return <div>this should not be possible</div>
  }

  const { role, id, stepGroups, run } = message
  const isStreaming = run?.status === 'preparing' || run?.status === 'streaming'

  return (
    <div className={cn('text-xxs space-y-2.5 border border-dashed p-2.5', className)} {...props}>
      {/* message header */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <Badge className="rounded-xs font-mono uppercase" variant="secondary">
          {role}
        </Badge>
        {run && <RunStatusBadge status={run.status} />}
      </div>

      {stepGroups.map(({ inference, parts, stepIndex }) => (
        <div className="space-y-2.5" key={`${id}-step-${stepIndex}`}>
          {inference && (
            <StepHeader>
              <Badge className="rounded-xs" variant="secondary">
                {inference.model}
              </Badge>
              <Badge className="rounded-xs" variant="secondary">
                {inference.provider}
              </Badge>
              <Badge className="ml-auto" variant="secondary">
                {inference.finishReason}
              </Badge>
            </StepHeader>
          )}

          {parts.map((p, partIndex) => {
            const partId = `${id}-${stepIndex}-${partIndex}`

            if (p.type === 'reasoning') {
              return (
                <Block key={partId}>
                  <BlockHeader>
                    <span>reasoning</span>
                    <OutputTokens tokens={inference?.usage.output.reasoning} />
                  </BlockHeader>
                  <BlockContent className="text-muted-foreground">{p.text}</BlockContent>
                </Block>
              )
            }

            if (p.type === 'text') {
              return (
                <Block key={partId}>
                  <BlockHeader>
                    <span>text</span>
                    <OutputTokens tokens={inference?.usage.output.text} />
                  </BlockHeader>
                  <BlockContent>{p.text}</BlockContent>
                </Block>
              )
            }

            if (isToolPart(p)) {
              return (
                <Block key={partId}>
                  <BlockHeader>
                    <span>{p.type}</span>
                    <OutputTokens tokens={inference?.usage.output.text} />
                  </BlockHeader>
                  <BlockContent>
                    <Tool>
                      {p.type === 'dynamic-tool' ? (
                        <ToolHeader type={p.type} state={p.state} toolName={p.toolName} />
                      ) : (
                        <ToolHeader type={p.type} state={p.state} />
                      )}
                      <ToolContent>
                        <ToolInput input={p.input} />
                        <ToolOutput output={p.output} errorText={p.errorText} />
                      </ToolContent>
                    </Tool>
                  </BlockContent>
                </Block>
              )
            }

            if (p.type === 'file') {
              const filename = p.filename ?? null
              return (
                <Block key={partId}>
                  <BlockHeader>
                    <span>file</span>
                    <span className="text-muted-foreground ml-auto">
                      {[p.mediaType, filename].filter(Boolean).join(' · ')}
                    </span>
                  </BlockHeader>
                  <BlockContent>
                    {p.mediaType.startsWith('image/') && (
                      <img src={p.url} alt={filename ?? 'attachment'} className="max-h-48" />
                    )}
                  </BlockContent>
                </Block>
              )
            }

            return (
              <Block key={partId}>
                <BlockHeader>{p.type}</BlockHeader>
                <BlockContent />
              </Block>
            )
          })}
        </div>
      ))}

      {run && run.errorMessage !== '' && (
        <Block className="*:border-destructive/30 border-destructive/30 *:text-destructive text-destructive font-mono">
          <BlockHeader>error</BlockHeader>
          <BlockContent>{run.errorMessage}</BlockContent>
        </Block>
      )}

      {!isStreaming && <MessageFooter isLastMessage={isLastMessage} message={message} />}
    </div>
  )
}

function RunStatusBadge({ status }: { status: RunStatus }) {
  if (status === 'completed') {
    return (
      <Badge className="text-muted-foreground" variant="secondary">
        <CheckCircle2Icon />
      </Badge>
    )
  }

  if (status === 'error') {
    return (
      <Badge variant="destructive">
        <XCircleIcon />
      </Badge>
    )
  }

  if (status === 'cancelled') {
    return (
      <Badge className="text-muted-foreground" variant="secondary">
        <BanIcon />
      </Badge>
    )
  }

  return (
    <Badge className="text-muted-foreground" variant="secondary">
      <LoaderCircleIcon className="animate-spin" />
    </Badge>
  )
}

function MessageFooter({
  isLastMessage,
  message,
}: {
  isLastMessage: boolean
  message: NonNullable<ReturnType<typeof useTetraMessage>>
}) {
  const { runs, transcripts } = useTetra()
  const { openJsonView } = useJsonViewSheet()

  const messageText = message.stepGroups
    .flatMap((s) => s.parts)
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('')

  const isStreaming = message.run?.status === 'preparing' || message.run?.status === 'streaming'
  const canGenerate = isLastMessage && !isStreaming
  const canDelete = isLastMessage && !isStreaming
  const generateActionLabel = message.run === null ? 'Generate' : 'Regenerate'
  const deleteActionLabel = canDelete ? 'Delete' : 'Only leaf messages can be deleted'

  const totals = message.run?.totals

  return (
    <div className="flex items-center gap-1 px-1">
      <Button
        aria-label="Copy"
        disabled={messageText === ''}
        onClick={() => void navigator.clipboard.writeText(messageText)}
        size="icon-sm"
        title="Copy"
        variant="ghost"
      >
        <CopyIcon />
      </Button>
      <Button
        aria-label="Inspect JSON"
        onClick={() => {
          openJsonView({ title: `Message: ${message.id}`, value: message })
        }}
        size="icon-sm"
        title="Inspect JSON"
        variant="ghost"
      >
        <BracesIcon />
      </Button>
      {canGenerate && (
        <Button
          aria-label={generateActionLabel}
          onClick={() => {
            const session = transcripts.getSession(message.sessionId)
            if (message.run !== null) {
              const targetMessageId = session.appendMessage({
                parentMessageId: message.parentMessageId,
                parts: [],
                role: message.role,
              })
              runs.generate({ targetMessageId })
              return
            }

            const targetMessageId = session.appendMessage({
              parentMessageId: message.id,
              parts: [],
              role: 'assistant',
            })
            runs.generate({ targetMessageId })
          }}
          size="icon-sm"
          title={generateActionLabel}
          variant="ghost"
        >
          <RefreshCwIcon />
        </Button>
      )}
      <Button
        aria-label="Delete"
        disabled={!canDelete}
        onClick={() => {
          const session = transcripts.getSession(message.sessionId)
          if (session.getThread({ messageId: message.id }).hasChildren()) {
            return
          }

          session.deleteMessage(message.id)
        }}
        size="icon-sm"
        title={deleteActionLabel}
        variant="ghost"
      >
        <TrashIcon />
      </Button>

      <div className="ml-auto flex gap-2.5">
        {totals && (
          <>
            <span className="text-muted-foreground">{formatTokens(totals.total)} tokens</span>
            <span className="text-muted-foreground">
              {formatCurrency(totals.cost ?? undefined)}
            </span>
          </>
        )}

        <span className="text-muted-foreground">
          {new Date(message.updatedAt).toLocaleString()}
        </span>
      </div>
    </div>
  )
}

function isToolPart(part: UIMessagePart): part is ToolPartType {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-')
}

function StepHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="step-block-header"
      className={cn('text-muted-foreground flex items-center gap-1 border p-2', className)}
      {...props}
    />
  )
}

function Block({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('border', className)} {...props} />
}

function BlockHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="block-header"
      className={cn('text-muted-foreground flex items-center gap-2 border-b p-2', className)}
      {...props}
    />
  )
}

function BlockContent({ children, className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="block-content"
      className={cn('space-y-2 p-2 whitespace-pre-wrap', className)}
      {...props}
    >
      {children ?? <span className="text-muted-foreground opacity-50">[NO CONTENT]</span>}
    </div>
  )
}

function OutputTokens({ tokens }: { tokens: number | undefined }) {
  if (tokens === undefined) {
    return null
  }

  return <span className="text-muted-foreground ml-auto">{formatTokens(tokens)} tokens</span>
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
  }).format(value)
}

function formatCurrency(value: number | undefined): string {
  if (value === undefined) {
    return '—'
  }

  return new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value)
}
