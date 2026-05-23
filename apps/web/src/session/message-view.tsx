import type { RequestStatus, StepRecord, UsageSummary } from '@tetra/core'
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
import type { UIMessage } from 'ai'
import { CopyIcon, RefreshCwIcon, TrashIcon } from 'lucide-react'
import { useMemo } from 'react'

import { useTetra } from '@/tetra/provider'
import { typedTinybase } from '@/tetra/tinybase'

import { useMessage, useRequest } from './hooks'

type UIMessagePart = UIMessage['parts'][number]

interface StepInference {
  cost: StepRecord['cost']
  finishReason: string
  generationId: string
  model: string
  provider: string
  tokens: StepRecord['tokens']
}

interface TetraStep {
  inference: StepInference | null
  parts: UIMessagePart[]
  stepIndex: number
}

interface TetraTotals {
  cacheRead: number
  cacheWrite: number
  cost: number | null
  input: number
  output: number
  reasoning: number
  total: number
}

interface MessageGenerationOverlay {
  parts: UIMessagePart[]
  steps: StepRecord[]
  usage: UsageSummary
}

interface TetraMessage {
  createdAt: number
  id: string
  request: {
    errorMessage: string | null
    status: RequestStatus
    totals: TetraTotals | null
  } | null
  role: UIMessage['role']
  sessionId: string
  steps: TetraStep[]
  updatedAt: number
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
    <div
      className={cn('text-xxs space-y-2', role === 'assistant' && 'bg-muted/20', className)}
      {...props}
    >
      {/* message header */}
      <div className="flex items-center gap-2">
        <Badge className="rounded-none font-mono uppercase" variant="secondary">
          {role}
        </Badge>
        <KeyValue keyName="request" value={request?.status} className="text-muted-foreground" />
      </div>

      {steps.map(({ inference, parts, stepIndex }) => {
        const stepHeader = inference ? (
          <>
            step {stepIndex} <KeyValue keyName={inference.provider} value={inference.model} />
            <KeyValue keyName="input" value={inference.tokens.inputTotal} metric="tokens" />
            <KeyValue value={inference.finishReason} />
          </>
        ) : (
          'step'
        )

        return (
          <StepBlock key={`${id}-step-${stepIndex}`} header={stepHeader}>
            {parts.map((p, partIndex) => {
              const partId = `${id}-${stepIndex}-${partIndex}`

              if (p.type === 'reasoning') {
                return (
                  <Block
                    key={partId}
                    header={
                      <>
                        reasoning
                        <KeyValue
                          keyName="reasoning"
                          value={inference?.tokens.outputReasoning}
                          metric="tokens"
                        />
                      </>
                    }
                  >
                    {p.text}
                  </Block>
                )
              }

              if (p.type === 'text') {
                return (
                  <Block
                    key={partId}
                    header={
                      <>
                        text{' '}
                        <KeyValue
                          keyName="output"
                          value={inference?.tokens.outputText}
                          metric="tokens"
                        />
                      </>
                    }
                  >
                    {p.text}
                  </Block>
                )
              }

              if (isToolPart(p)) {
                return (
                  <Block
                    key={partId}
                    header={
                      <>
                        {p.type}
                        <KeyValue
                          keyName="output"
                          value={inference?.tokens.outputText}
                          metric="tokens"
                        />
                      </>
                    }
                  >
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
                  </Block>
                )
              }

              if (p.type === 'file') {
                const filename = p.filename ?? null
                const header = (
                  <>
                    file <KeyValue value={p.mediaType} />
                    <KeyValue keyName="filename" value={filename} />
                  </>
                )
                return (
                  <Block key={partId} header={header}>
                    {p.mediaType.startsWith('image/') && (
                      <img src={p.url} alt={filename ?? 'attachment'} className="max-h-48" />
                    )}
                  </Block>
                )
              }

              return <Block key={partId} header={p.type}></Block>
            })}
          </StepBlock>
        )
      })}

      {request?.errorMessage !== null && request?.errorMessage !== undefined && (
        <Block
          header="error"
          className="*:border-destructive/30 border-destructive/30 *:text-destructive text-destructive font-mono"
        >
          {request.errorMessage}
        </Block>
      )}

      <MessageFooter message={message} />
      {!isStreaming && <MessageActions isLastMessage={isLastMessage} message={message} />}
    </div>
  )
}

function useTetraMessage(messageId: string): TetraMessage | null {
  const message = useMessage(messageId)
  const generation = useMessageGeneration(messageId)
  const request = useRequestForMessage(messageId)

  return useMemo(() => {
    if (!message) {
      return null
    }

    const parts = generation?.parts ?? message.parts
    const stepRecords = generation?.steps ?? message.steps
    const usage = generation?.usage ?? message.usage

    return {
      createdAt: message.createdAt,
      id: message.id,
      request: request
        ? {
            errorMessage: request.errorMessage || null,
            status: request.status,
            totals: formatUsageSummary(usage),
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
  const ids = typedTinybase.useSliceRowIds('requestsByAssistantMessage', messageId)
  return useRequest(ids[0] ?? '')
}

function useMessageGeneration(messageId: string): MessageGenerationOverlay | null {
  const generation = typedTinybase.useEntity('messageGenerations', messageId)
  if (messageId === '' || generation === null) {
    return null
  }

  return {
    parts: generation.parts,
    steps: generation.steps,
    usage: generation.usage,
  }
}

function formatUsageSummary(usage: UsageSummary): TetraTotals | null {
  const total = usage.totalTokens ?? 0
  if (total === 0) {
    return null
  }

  return {
    cacheRead: usage.cacheReadTokens ?? 0,
    cacheWrite: usage.cacheWriteTokens ?? 0,
    cost: usage.costTotal ?? null,
    input: usage.inputTokens ?? 0,
    output: usage.outputTokens ?? 0,
    reasoning: usage.reasoningTokens ?? 0,
    total,
  }
}

// Groups a flat parts array into per-step buckets using step-start markers as boundaries.
function groupPartsByStep(parts: UIMessagePart[], stepRecords: StepRecord[]): TetraStep[] {
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
    const inference: StepInference | null = record
      ? {
          cost: record.cost,
          finishReason: record.finishReason,
          generationId: record.generationId,
          model: record.model,
          provider: record.provider,
          tokens: record.tokens,
        }
      : null
    return { inference, parts: stepParts, stepIndex: i }
  })
}

function MessageActions({
  isLastMessage,
  message,
}: {
  isLastMessage: boolean
  message: TetraMessage
}) {
  const { runs, store } = useTetra()

  const messageText = message.steps
    .flatMap((s) => s.parts)
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('')

  const canRegenerate = isLastMessage

  return (
    <div className="flex items-center gap-0.5 pt-1">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Copy"
        disabled={messageText === ''}
        onClick={() => void navigator.clipboard.writeText(messageText)}
      >
        <CopyIcon />
      </Button>
      {canRegenerate && (
        <Button
          variant="ghost"
          size="icon-xs"
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
        size="icon-xs"
        aria-label="Delete"
        onClick={() => {
          store.deleteMessage(message.id)
        }}
      >
        <TrashIcon />
      </Button>
    </div>
  )
}

function MessageFooter({ message }: { message: TetraMessage }) {
  const { updatedAt, request } = message
  const totals = request?.totals
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono">
      <span>{new Date(updatedAt).toLocaleString()}</span>
      {totals && (
        <>
          <KeyValue keyName="total" value={totals.total} metric="tokens" />
          <KeyValue keyName="input" value={totals.input} metric="tokens" />
          <KeyValue keyName="output" value={totals.output} metric="tokens" />
          <KeyValue keyName="reasoning" value={totals.reasoning} metric="tokens" />
          <KeyValue keyName="cache-read" value={totals.cacheRead || null} metric="tokens" />
          <KeyValue keyName="cache-write" value={totals.cacheWrite || null} metric="tokens" />
          <KeyValue keyName="cost" value={totals.cost === null ? null : `$${totals.cost}`} />
        </>
      )}
    </div>
  )
}

function isToolPart(part: UIMessagePart): part is ToolPartType {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-')
}

function Block({
  header,
  children,
  className,
  ...props
}: { header: React.ReactNode } & React.ComponentProps<'div'>) {
  return (
    <div className={cn('border-2', className)} {...props}>
      <div data-slot="block-header" className="text-muted-foreground border-b-2 p-2 font-mono">
        {header}
      </div>
      <div data-slot="block-content" className="space-y-2 p-2 whitespace-pre-wrap">
        {children ?? <span className="text-muted-foreground opacity-50">[NO CONTENT]</span>}
      </div>
    </div>
  )
}

function StepBlock({
  header,
  children,
  className,
  ...props
}: { header: React.ReactNode } & React.ComponentProps<'div'>) {
  return (
    <div className={cn('', className)} {...props}>
      <div data-slot="step-block-header" className="text-muted-foreground border-2 p-2 font-mono">
        {header}
      </div>
      <div data-slot="step-block-content" className="space-y-2 py-2 whitespace-pre-wrap">
        {children ?? <span className="text-muted-foreground opacity-50">[NO CONTENT]</span>}
      </div>
    </div>
  )
}

function KeyValue({
  keyName,
  value,
  metric,
  className,
}: {
  keyName?: string
  value: React.ReactNode
  metric?: string
  className?: string
}) {
  if (value === null || value === undefined) {
    return null
  }

  const k = keyName === undefined ? null : `${keyName}: `
  const v = typeof value === 'number' ? value.toLocaleString() : value
  const m = metric === undefined ? null : ` ${metric}`
  return (
    <span className={className}>
      {' '}
      [{k}
      {v}
      {m}]
    </span>
  )
}
