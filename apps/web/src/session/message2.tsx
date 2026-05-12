import type { Message, Request } from '@tetra/store'
import { Badge } from '@tetra/ui/components/ui/badge'
import { Button } from '@tetra/ui/components/ui/button'
import { cn } from '@tetra/ui/lib/utils'
import type {
  DynamicToolUIPart,
  FileUIPart,
  ReasoningUIPart,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  StepStartUIPart,
  TextUIPart,
  ToolUIPart,
} from 'ai'
import {
  AlertCircleIcon,
  BracesIcon,
  CopyIcon,
  FileIcon,
  LinkIcon,
  Loader2Icon,
  TrashIcon,
  WrenchIcon,
} from 'lucide-react'

import { useMessage, useRequestForMessage } from '@/runtime/hooks'
import { useRuntime } from '@/runtime/use-runtime'

// ------------------------------------------------------------------
// Types — explicit union so switch narrows correctly
// ------------------------------------------------------------------

type KnownPart =
  | TextUIPart
  | ReasoningUIPart
  | StepStartUIPart
  | FileUIPart
  | SourceUrlUIPart
  | SourceDocumentUIPart
  | ToolUIPart
  | DynamicToolUIPart

// Fallback for data-* and future types
interface UnknownPart {
  type: `data-${string}`
  [key: string]: unknown
}

type MessagePart = KnownPart | UnknownPart

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

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

// ------------------------------------------------------------------
// Raw JSON inspector — always visible, never hidden
// ------------------------------------------------------------------

function RawJson({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-0.5">
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

// ------------------------------------------------------------------
// Part border colours
// ------------------------------------------------------------------

const partBorderColors: Partial<Record<string, string>> = {
  'dynamic-tool': 'border-l-amber-500',
  file: 'border-l-pink-500',
  reasoning: 'border-l-violet-500',
  'source-document': 'border-l-sky-500',
  'source-url': 'border-l-sky-500',
  'step-start': 'border-l-orange-500',
  text: 'border-l-emerald-500',
}

// ------------------------------------------------------------------
// Known part renderers — each receives the narrowed type
// ------------------------------------------------------------------

function TextPartContent({ part }: { part: TextUIPart }) {
  return (
    <div className="space-y-1">
      <div className="text-foreground break-all whitespace-pre-wrap">{part.text}</div>
      {part.providerMetadata !== undefined && (
        <RawJson label="providerMetadata" value={part.providerMetadata} />
      )}
    </div>
  )
}

function ReasoningPartContent({ part }: { part: ReasoningUIPart }) {
  return (
    <div className="space-y-1">
      <div className="text-foreground break-all whitespace-pre-wrap">{part.text}</div>
      {part.providerMetadata !== undefined && (
        <RawJson label="providerMetadata" value={part.providerMetadata} />
      )}
    </div>
  )
}

function FilePartContent({ part }: { part: FileUIPart }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <FileIcon className="size-3 text-pink-500" />
        {part.filename !== undefined && (
          <span className="text-foreground font-medium">{part.filename}</span>
        )}
        <span className="text-muted-foreground text-[0.625rem]">{part.mediaType}</span>
      </div>
      <a
        className="inline-flex items-center gap-1.5 text-sky-400 underline hover:text-sky-300"
        href={part.url}
        rel="noreferrer"
        target="_blank"
      >
        <LinkIcon className="size-3" />
        {part.url}
      </a>
      {part.providerMetadata !== undefined && (
        <RawJson label="providerMetadata" value={part.providerMetadata} />
      )}
    </div>
  )
}

function SourceUrlPartContent({ part }: { part: SourceUrlUIPart }) {
  return (
    <a
      className="inline-flex items-center gap-1.5 text-sky-400 underline hover:text-sky-300"
      href={part.url}
      rel="noreferrer"
      target="_blank"
    >
      <LinkIcon className="size-3" />
      {part.title ?? part.url}
    </a>
  )
}

function SourceDocumentPartContent({ part }: { part: SourceDocumentUIPart }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <FileIcon className="size-3 text-sky-500" />
        <span className="text-foreground font-medium">{part.title}</span>
        {part.filename !== undefined && (
          <span className="text-muted-foreground text-[0.625rem]">{part.filename}</span>
        )}
        <span className="text-muted-foreground text-[0.625rem]">{part.mediaType}</span>
      </div>
      {part.providerMetadata !== undefined && (
        <RawJson label="providerMetadata" value={part.providerMetadata} />
      )}
    </div>
  )
}

function getToolName(type: string): string | null {
  if (type === 'dynamic-tool') {
    return 'dynamic-tool'
  }
  if (type.startsWith('tool-')) {
    return type.slice(5)
  }
  return null
}

function ToolPartHeader({
  toolName,
  state,
  toolCallId,
}: {
  toolName: string
  state: string
  toolCallId: string
}) {
  return (
    <div className="flex items-center gap-2">
      <WrenchIcon className="size-3 text-amber-500" />
      <span className="text-foreground font-semibold">{toolName}</span>
      <Badge variant="outline" className="text-[0.625rem]">
        {state}
      </Badge>
      <span className="text-muted-foreground text-[0.625rem]">id: {toolCallId}</span>
    </div>
  )
}

// ------------------------------------------------------------------
// PartContent — dispatches to renderer based on discriminated union
// ------------------------------------------------------------------

function PartContent({ part }: { part: MessagePart }) {
  // oxlint-disable-next-line typescript/switch-exhaustiveness-check -- default catches tool-*, data-*, dynamic-tool
  switch (part.type) {
    case 'text': {
      return <TextPartContent part={part} />
    }
    case 'reasoning': {
      return <ReasoningPartContent part={part} />
    }
    case 'step-start': {
      return null
    }
    case 'file': {
      return <FilePartContent part={part} />
    }
    case 'source-url': {
      return <SourceUrlPartContent part={part} />
    }
    case 'source-document': {
      return <SourceDocumentPartContent part={part} />
    }
    default: {
      const toolName = getToolName(part.type)
      const hasState = 'state' in part && typeof part.state === 'string'
      const hasToolCallId = 'toolCallId' in part && typeof part.toolCallId === 'string'

      return (
        <div className="space-y-1.5">
          {toolName !== null && hasState && hasToolCallId && (
            <ToolPartHeader
              toolName={toolName}
              state={String(part.state)}
              toolCallId={String(part.toolCallId)}
            />
          )}
          <RawJson label="raw part" value={part} />
        </div>
      )
    }
  }
}

// ------------------------------------------------------------------
// PartBlock — layout wrapper + PartContent
// ------------------------------------------------------------------

function PartBlock({ index, part }: { index: number; part: MessagePart }) {
  return (
    <div
      className={cn(
        'bg-muted/30 border-l-2 p-3',
        partBorderColors[part.type] ?? 'border-l-muted-foreground',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-[0.625rem]">{part.type}</span>
        <span className="text-muted-foreground text-[0.625rem]">{index}</span>
      </div>
      <div className="mt-2 empty:hidden">
        <PartContent part={part} />
      </div>
    </div>
  )
}

// ------------------------------------------------------------------
// Request status badge
// ------------------------------------------------------------------

function RequestStatusBadge({ request }: { request: Request | null }) {
  if (!request) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        no request
      </Badge>
    )
  }

  if (request.status === 'error') {
    return null
  }

  return (
    <Badge variant={statusBadgeVariant(request.status)} className="flex items-center gap-1">
      {(request.status === 'pending' || request.status === 'streaming') && (
        <Loader2Icon className="size-3 animate-spin" />
      )}
      {request.status}
    </Badge>
  )
}

// ------------------------------------------------------------------
// Message actions
// ------------------------------------------------------------------

function getMessageText(parts: Message['parts']): string {
  return parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

// ------------------------------------------------------------------
// Message2 — utilitarian message inspector
// ------------------------------------------------------------------

export function Message2({
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
      </div>

      {/* Request state for assistant messages */}
      {role === 'assistant' && (
        <div className="flex flex-wrap items-center gap-2 py-0.5">
          <RequestStatusBadge request={request} />
        </div>
      )}

      {/* Parts — never hide, even when empty */}
      {parts.length === 0 ? (
        <div className="border-l-muted-foreground/30 bg-muted/30 text-muted-foreground border-l-2 px-2 py-2 italic">
          no parts
        </div>
      ) : (
        <div className="space-y-1">
          {parts.map((part, i) => (
            <PartBlock key={`${id}-part-${i}`} index={i} part={part as MessagePart} />
          ))}
        </div>
      )}

      {/* Error — shown after parts */}
      {role === 'assistant' && request?.status === 'error' && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertCircleIcon className="size-3" />
            error
          </Badge>
          {request.errorMessage !== '' && (
            <span className="text-destructive break-all">{request.errorMessage}</span>
          )}
        </div>
      )}

      {/* Actions */}
      {!isStreaming && (
        <div className="flex items-center gap-0.5 pt-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Copy"
            disabled={getMessageText(parts) === ''}
            onClick={() => void navigator.clipboard.writeText(getMessageText(parts))}
          >
            <CopyIcon className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Delete"
            onClick={() => {
              runtime.commands.deleteMessage({ messageId })
            }}
          >
            <TrashIcon className="size-3" />
          </Button>
        </div>
      )}
    </div>
  )
}
