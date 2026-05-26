import type { RequestStatus, Rows, StepRecord } from '@tetra/store-schema'
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

type UIMessagePart = Rows['messages']['parts'][number]

function useTetraMessage(messageId: string) {
  const message = typedTinybase.useEntity('messages', messageId)
  const generation = typedTinybase.useEntity('messageGenerations', messageId)
  const request = useRequestForMessage(messageId)

  return useMemo(() => {
    if (!message) {
      return null
    }

    const parts = generation?.parts ?? message.parts
    const stepRecords = generation?.steps ?? message.steps
    const usage = generation?.usage ?? message.usage
    const totalTokens = usage.totalTokens ?? 0

    return {
      createdAt: message.createdAt,
      id: message.id,
      request: request
        ? {
            errorMessage: request.errorMessage ?? null,
            status: request.status,
            totals:
              totalTokens === 0
                ? null
                : {
                    cost: usage.costTotal ?? null,
                    total: totalTokens,
                  },
          }
        : null,
      role: message.role,
      sessionId: message.sessionId,
      steps: groupPartsByStep(parts, stepRecords),
      updatedAt: message.updatedAt,
    }
  }, [generation, message, request])
}

function useRequestForMessage(messageId: string) {
  const ids = typedTinybase.useSliceRowIds('requestsByAssistantMessageNewestFirst', messageId)
  return typedTinybase.useEntity('requests', ids[0] ?? '')
}

// Groups a flat parts array into per-step buckets using step-start markers as boundaries.
function groupPartsByStep(parts: UIMessagePart[], stepRecords: StepRecord[]) {
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

  const { role, id, steps, request } = message
  const isStreaming = request?.status === 'preparing' || request?.status === 'streaming'

  return (
    <div className={cn('text-xxs space-y-2.5 border border-dashed p-2.5', className)} {...props}>
      {/* message header */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <Badge className="rounded-xs font-mono uppercase" variant="secondary">
          {role}
        </Badge>
        {request && <RequestStatusBadge status={request.status} />}
      </div>

      {steps.map(({ inference, parts, stepIndex }) => (
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
                    <OutputTokens tokens={inference?.tokens.outputReasoning} />
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
                    <OutputTokens tokens={inference?.tokens.outputText} />
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
                    <OutputTokens tokens={inference?.tokens.outputText} />
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

      {request && request.errorMessage !== '' && (
        <Block className="*:border-destructive/30 border-destructive/30 *:text-destructive text-destructive font-mono">
          <BlockHeader>error</BlockHeader>
          <BlockContent>{request.errorMessage}</BlockContent>
        </Block>
      )}

      {!isStreaming && <MessageFooter isLastMessage={isLastMessage} message={message} />}
    </div>
  )
}

function RequestStatusBadge({ status }: { status: RequestStatus }) {
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
  const { helpers, runs } = useTetra()
  const { openJsonView } = useJsonViewSheet()

  const messageText = message.steps
    .flatMap((s) => s.parts)
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('')

  const canRegenerate = isLastMessage

  const totals = message.request?.totals

  return (
    <div className="flex items-center gap-1 px-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Copy"
        disabled={messageText === ''}
        onClick={() => void navigator.clipboard.writeText(messageText)}
      >
        <CopyIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Inspect JSON"
        onClick={() => {
          openJsonView({ title: `Message: ${message.id}`, value: message })
        }}
      >
        <BracesIcon />
      </Button>
      {canRegenerate && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Regenerate"
          onClick={() => {
            runs.regenerate({ messageId: message.id })
          }}
        >
          <RefreshCwIcon />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Delete"
        onClick={() => {
          helpers.deleteMessage(message.id)
        }}
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
