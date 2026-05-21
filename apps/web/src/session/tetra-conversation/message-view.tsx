import type { ToolPart as ToolPartType } from '@tetra/ui/components/ai-elements/tool'
import { Badge } from '@tetra/ui/components/ui/badge'
import { cn } from '@tetra/ui/lib/utils'
import type { UIMessage } from 'ai'

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

  return (
    <div className={cn('text-xxs space-y-2', className)} {...props}>
      {/* message header */}
      <div className="flex items-center gap-2">
        <Badge className="rounded-none font-mono uppercase" variant="secondary">
          {role}
        </Badge>
        {request && <span className="text-muted-foreground font-mono">{request.status}</span>}
      </div>

      {steps.map(({ inference, parts, stepIndex }) => {
        // output - reasoning = tokens attributable to text/tool output (step-level, not per-part)
        const outputTokens = inference ? inference.tokens.output - inference.tokens.reasoning : null
        const stepHeader = inference ? (
          <>
            step {stepIndex} <KeyValue keyName={inference.provider} value={inference.model} />
            <KeyValue keyName="input" value={inference.tokens.input} metric="tokens" />
            <KeyValue value={inference.finishReason} />
          </>
        ) : (
          'step'
        )

        return (
          <Block key={`${id}-step-${stepIndex}`} header={stepHeader}>
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
                          value={inference?.tokens.reasoning}
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
                        text <KeyValue keyName="output" value={outputTokens} metric="tokens" />
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
                        <KeyValue keyName="output" value={outputTokens} metric="tokens" />
                      </>
                    }
                  ></Block>
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
          </Block>
        )
      })}

      {request?.errorMessage !== null && request?.errorMessage !== undefined && (
        <div className="text-destructive border-destructive/30 border p-1 font-mono">
          {request.errorMessage}
        </div>
      )}

      <MessageFooter message={message} />
    </div>
  )
}

function MessageFooter({ message }: { message: TetraMessage }) {
  const { updatedAt, request } = message
  const totals = request?.totals ?? null
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono">
      <span>{new Date(updatedAt).toLocaleString()}</span>
      {totals && (
        <>
          <KeyValue keyName="total" value={totals.total} metric="tokens" />
          <KeyValue keyName="input" value={totals.input} metric="tokens" />
          <KeyValue keyName="output" value={totals.output} metric="tokens" />
          <KeyValue keyName="reasoning" value={totals.reasoning} metric="tokens" />

          <KeyValue keyName="cache-read" value={totals.cacheRead} metric="tokens" />

          <KeyValue keyName="cache-write" value={totals.cacheWrite} metric="tokens" />

          <KeyValue keyName="cost" value={`$${totals.cost}`} />
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

function KeyValue({
  keyName,
  value,
  metric,
}: {
  keyName?: string
  value: React.ReactNode
  metric?: string
}) {
  if (value === null || value === undefined) {
    return null
  }

  const k = keyName === undefined ? null : `${keyName}: `
  const v = typeof value === 'number' ? value.toLocaleString() : value
  const m = metric === undefined ? null : ` ${metric}`
  return (
    <span>
      {' '}
      [{k}
      {v}
      {m}]
    </span>
  )
}
