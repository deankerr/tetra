import { Badge } from '@tetra/ui/components/ui/badge'
import { Button } from '@tetra/ui/components/ui/button'
import { cn } from '@tetra/ui/lib/utils'
import type { DynamicToolUIPart, ToolUIPart } from 'ai'
import {
  AlertCircleIcon,
  BracesIcon,
  CopyIcon,
  Loader2Icon,
  TrashIcon,
  WrenchIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import type { Message, Request } from '@/runtime/hooks'
import { useMessage, useRequestForMessage } from '@/runtime/hooks'
import { useRuntime } from '@/runtime/use-runtime'

type MessagePart = Message['parts'][number]

function statusBadgeVariant(status: string) {
  switch (status) {
    case 'pending': {
      return 'secondary'
    }
    case 'streaming': {
      return 'default'
    }
    case 'completed': {
      return 'outline'
    }
    case 'error': {
      return 'destructive'
    }
    default: {
      return 'outline'
    }
  }
}

function RawJson({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground flex items-center gap-1 text-[0.625rem] font-semibold tracking-wider uppercase">
        <BracesIcon className="size-3" />
        {label}
      </div>
      <pre className="bg-background/50 text-muted-foreground max-h-48 overflow-auto rounded p-1.5 text-[0.625rem] leading-relaxed break-all whitespace-pre-wrap">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  )
}

function RawText({ text }: { text: string }) {
  return <div className="text-foreground text-xs break-all whitespace-pre-wrap">{text}</div>
}

function ToolPart({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const toolName = part.type.startsWith('tool-') ? part.type.slice(5) : part.type
  const { input, output, errorText, ...rest } = part

  return (
    <>
      <div className="text-foreground flex items-center gap-2 font-semibold">
        <WrenchIcon className="size-3.5 text-amber-500" />
        {toolName}
      </div>

      <RawJson label="input" value={input} />
      {output !== undefined && <RawJson label="output" value={output} />}
      {errorText !== undefined && <RawJson label="errorText" value={part.errorText} />}
      {rest !== undefined && <RawJson label="raw part" value={rest} />}
    </>
  )
}

function PartBlock({
  children,
  type,
  status,
  className,
}: {
  children?: ReactNode
  type: string
  status?: string
  className?: string
}) {
  return (
    <div
      className={cn('bg-muted/30 border-l-muted-foreground space-y-3 border-l-2 p-3', className)}
    >
      <div className="text-muted-foreground flex justify-between text-[0.625rem]">
        {type}
        {status !== undefined && <Badge variant="outline">{status}</Badge>}
      </div>
      {children}
    </div>
  )
}

function isToolPart(part: MessagePart): part is ToolUIPart | DynamicToolUIPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-')
}

// ------------------------------------------------------------------
// Request status badge
// ------------------------------------------------------------------

function RequestStatusBadge({ request }: { request: Request | null }) {
  if (!request) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        none
      </Badge>
    )
  }

  return (
    <Badge variant={statusBadgeVariant(request.status)} className="flex items-center gap-1">
      {(request.status === 'pending' || request.status === 'streaming') && (
        <Loader2Icon className="size-3 animate-spin" />
      )}
      {request.status === 'error' && <AlertCircleIcon className="size-3" />}
      {request.status}
    </Badge>
  )
}

export function MessageInspector({
  messageId,
  className,
  ...props
}: {
  messageId: string
} & React.ComponentProps<'div'>) {
  const runtime = useRuntime()
  const message = useMessage(messageId)
  const request = useRequestForMessage(messageId)

  if (!message) {
    return (
      <div
        className={cn(
          'border-destructive/30 bg-destructive/5 text-destructive space-y-1 border p-2 font-mono text-xs',
          className,
        )}
        {...props}
      >
        <Badge variant="destructive">MISSING</Badge>
        <span className="ml-2">message not found: {messageId}</span>
      </div>
    )
  }

  const { parts, role, seq, id, createdAt, updatedAt } = message
  const isStreaming = request?.status === 'pending' || request?.status === 'streaming'

  const messageText = parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('')

  return (
    <div className={cn('space-y-1 font-mono text-xs', className)} {...props}>
      {/* Header */}
      <div className="border-border/50 flex items-center gap-2 border-b pb-1">
        <Badge
          className={cn(
            'uppercase',
            role === 'user' ? 'bg-emerald-900 text-emerald-100' : 'bg-indigo-900 text-indigo-100',
          )}
        >
          {role}
        </Badge>

        <span className="text-muted-foreground/60 text-[0.625rem]">
          {id}-{seq.toString().padStart(3, '0')}
        </span>

        <div className="text-muted-foreground/60 ml-auto flex items-center gap-1.5 text-[0.625rem]">
          <span>{new Date(createdAt).toLocaleTimeString()}</span>
          {createdAt !== updatedAt && <span>→ {new Date(updatedAt).toLocaleTimeString()}</span>}
        </div>

        <RequestStatusBadge request={request} />
      </div>

      {/* Parts */}
      <div className="space-y-1">
        {parts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <PartBlock key={`${id}-part-${i}`} className="border-l-emerald-500" type={part.type}>
                <RawText text={part.text} />
                {part.providerMetadata !== undefined && (
                  <RawJson label="providerMetadata" value={part.providerMetadata} />
                )}
              </PartBlock>
            )
          }

          if (part.type === 'reasoning') {
            return (
              <PartBlock key={`${id}-part-${i}`} className="border-l-violet-500" type={part.type}>
                <RawText text={part.text} />
                {part.providerMetadata !== undefined && (
                  <RawJson label="providerMetadata" value={part.providerMetadata} />
                )}
              </PartBlock>
            )
          }

          if (part.type === 'step-start') {
            return <PartBlock key={`${id}-part-${i}`} type={part.type} />
          }

          if (isToolPart(part)) {
            return (
              <PartBlock
                key={`${id}-part-${i}`}
                className="border-l-amber-500"
                type={part.type}
                status={part.state}
              >
                <ToolPart part={part} />
              </PartBlock>
            )
          }

          return (
            <PartBlock key={`${id}-part-${i}`} type={part.type}>
              <RawJson label="raw part" value={part} />
            </PartBlock>
          )
        })}
      </div>

      {request?.status === 'error' && request.errorMessage !== '' && (
        <PartBlock className="border-l-destructive" type="error">
          <span className="text-destructive break-all">{request.errorMessage}</span>
        </PartBlock>
      )}

      {/* Actions */}
      {!isStreaming && (
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
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Delete"
            onClick={() => {
              runtime.commands.deleteMessage({ messageId })
            }}
          >
            <TrashIcon />
          </Button>
        </div>
      )}
    </div>
  )
}
