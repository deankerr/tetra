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

import { useTetra } from '@/tetra/provider'

import type { TetraMessage } from './hooks'
import { useTetraMessage } from './hooks'

type UIMessagePart = UIMessage['parts'][number]

export function TetraMessageView({
  messageId,
  className,
  ...props
}: { messageId: string } & React.ComponentProps<'div'>) {
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
      {!isStreaming && <MessageActions message={message} />}
    </div>
  )
}

function MessageActions({ message }: { message: TetraMessage }) {
  const { runs, store } = useTetra()

  const messageText = message.steps
    .flatMap((s) => s.parts)
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('')

  const lastMessage = store.listMessages(message.sessionId).at(-1)
  const canRegenerate = lastMessage?.id === message.id

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
