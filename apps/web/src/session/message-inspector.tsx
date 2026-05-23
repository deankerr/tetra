import { CodeBlockContent } from '@tetra/ui/components/ai-elements/code-block'
import type { ToolPart as ToolPartType } from '@tetra/ui/components/ai-elements/tool'
import { getStatusBadge } from '@tetra/ui/components/ai-elements/tool'
import { Badge } from '@tetra/ui/components/ui/badge'
import { Button } from '@tetra/ui/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tetra/ui/components/ui/collapsible'
import { cn } from '@tetra/ui/lib/utils'
import type { UIMessage } from 'ai'
import {
  AlertCircleIcon,
  BracesIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  CopyIcon,
  DotIcon,
  Loader2Icon,
  RefreshCwIcon,
  TrashIcon,
  WrenchIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import { useRequestForMessage } from '@/tetra/hooks/requests'
import { useMessage } from '@/tetra/hooks/transcripts'
import { useTetra } from '@/tetra/provider'

type MessagePart = UIMessage['parts'][number]

function RawJsonCollapsible({
  defaultOpen = true,
  label,
  value,
}: {
  defaultOpen?: boolean
  label: string
  value: unknown
}) {
  const json = JSON.stringify(value, null, 2)
  const charCount = json?.length ?? 0
  const byteSize = new TextEncoder().encode(json).byteLength
  const sizeLabel = byteSize >= 1024 ? `${(byteSize / 1024).toFixed(1)} KB` : `${byteSize} B`

  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="border-border/75 bg-background/50 overflow-hidden rounded-sm border"
    >
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground data-[panel-open]:border-border/40 group bg-muted/25 text-xxs flex w-full items-center justify-between gap-2 border-b border-transparent px-2 py-1.5 font-semibold tracking-wider transition-colors">
        <BracesIcon className="size-2.5" />
        {label}
        <div className="grow" />
        <span className="text-muted-foreground/50 font-mono font-normal">
          {charCount.toLocaleString()} chars · {sizeLabel}
        </span>
        <ChevronDownIcon className="size-3 transition-transform group-data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="[&>div]:max-h-56">
        <CodeBlockContent
          code={JSON.stringify(value, null, 2)}
          language="json"
          className="bg-background/70 text-xxs [&_code]:text-xxs break-all whitespace-pre-wrap"
        />
      </CollapsibleContent>
    </Collapsible>
  )
}

function UsageChip({ children }: { children: ReactNode }) {
  return (
    <span className="border-border/70 bg-background/60 text-muted-foreground rounded-full border px-1.5 py-0.5 font-mono">
      {children}
    </span>
  )
}

function ToolPart({ part }: { part: ToolPartType }) {
  const toolName = part.type.startsWith('tool-') ? part.type.slice(5) : part.type
  const { input, output, errorText, state, ...rest } = part
  const badge = getStatusBadge(state)
  return (
    <>
      <div className="text-foreground flex items-center gap-2 font-semibold">
        <WrenchIcon className="size-3.5 text-amber-500" />
        {toolName}
        {badge}
      </div>

      <RawJsonCollapsible label="input" value={input} />
      {output !== undefined && (
        <RawJsonCollapsible label="output" value={output} defaultOpen={false} />
      )}
      {errorText !== undefined && <RawJsonCollapsible label="errorText" value={errorText} />}
      <RawJsonCollapsible defaultOpen={false} label="raw part" value={rest} />
    </>
  )
}

function Block({ children, className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'border-border/40 bg-muted/20 border-l-muted-foreground border border-l-2 px-3 py-1.5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
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
  status?: ReactNode
  className?: string
}) {
  return (
    <Block className={cn('space-y-3', className)}>
      <div className="text-muted-foreground/80 text-xxs flex items-center justify-between gap-3 font-semibold tracking-wide not-only:mb-1.5">
        {type}
        {status}
      </div>
      {children}
    </Block>
  )
}

function isToolPart(part: MessagePart): part is ToolPartType {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-')
}

// ------------------------------------------------------------------
// Request status badge
// ------------------------------------------------------------------

const requestStatusConfig = {
  cancelled: { className: 'text-muted-foreground/40', icon: CircleDashedIcon, label: 'Cancelled' },
  completed: { className: 'text-emerald-500/70', icon: CheckIcon, label: 'Completed' },
  error: { className: 'text-destructive', icon: AlertCircleIcon, label: 'Error' },
  preparing: { className: 'text-amber-400 animate-spin', icon: Loader2Icon, label: 'Preparing' },
  streaming: { className: 'text-blue-400 animate-spin', icon: Loader2Icon, label: 'Streaming' },
} as const

function RequestStatusBadge({ status }: { status: string | undefined }) {
  const config = (
    requestStatusConfig as Record<
      string,
      (typeof requestStatusConfig)[keyof typeof requestStatusConfig] | undefined
    >
  )[status ?? '']

  if (config === undefined) {
    return <DotIcon className="text-muted-foreground/20 size-3" />
  }

  const Icon = config.icon
  return <Icon className={cn('size-3', config.className)} aria-label={config.label} />
}

function MessageActions({
  canRegenerate,
  messageId,
  messageText,
}: {
  canRegenerate: boolean
  messageId: string
  messageText: string
}) {
  const tetra = useTetra()

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
            tetra.runs.regenerate({ messageId })
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
          tetra.store.deleteMessage(messageId)
        }}
      >
        <TrashIcon />
      </Button>
    </div>
  )
}

function MessagePartBlock({
  id,
  index,
  part,
  reasoningColor,
  roleColor,
  toolColor,
}: {
  id: string
  index: number
  part: MessagePart
  reasoningColor: string
  roleColor: string
  toolColor: string
}) {
  if (part.type === 'reasoning') {
    return (
      <PartBlock key={`${id}-part-${index}`} className={reasoningColor} type={part.type}>
        <div className="border-border/75 rounded-sm border p-2">
          <CodeBlockContent
            code={part.text}
            language="markdown"
            className="text-xxs [&_code]:text-xxs p-0 whitespace-pre-wrap brightness-70 [&_code]:leading-relaxed"
          />
        </div>
        {part.providerMetadata !== undefined && (
          <RawJsonCollapsible
            defaultOpen={false}
            label="providerMetadata"
            value={part.providerMetadata}
          />
        )}
      </PartBlock>
    )
  }

  if (part.type === 'text') {
    return (
      <PartBlock key={`${id}-part-${index}`} className={roleColor} type={part.type}>
        <div className="border-border/75 rounded-sm border p-2">
          <CodeBlockContent
            code={part.text}
            language="markdown"
            className="text-muted-foreground space-y-4 p-0 text-xs whitespace-pre-wrap brightness-90 [&_code]:text-xs [&_code]:leading-relaxed"
          />
        </div>
        {part.providerMetadata !== undefined && (
          <RawJsonCollapsible
            defaultOpen={false}
            label="providerMetadata"
            value={part.providerMetadata}
          />
        )}
      </PartBlock>
    )
  }

  if (part.type === 'step-start') {
    return (
      <PartBlock key={`${id}-part-${index}`} className={cn('py-1.5', roleColor)} type={part.type} />
    )
  }

  if (isToolPart(part)) {
    return (
      <PartBlock key={`${id}-part-${index}`} className={toolColor} type={part.type}>
        <ToolPart part={part} />
      </PartBlock>
    )
  }

  return (
    <PartBlock key={`${id}-part-${index}`} className={roleColor} type={part.type}>
      <RawJsonCollapsible label="raw" value={part} defaultOpen={false} />
    </PartBlock>
  )
}

function MessageParts({
  id,
  isStreaming,
  parts,
  reasoningColor,
  role,
  roleColor,
  toolColor,
}: {
  id: string
  isStreaming: boolean
  parts: UIMessage['parts']
  reasoningColor: string
  role: string
  roleColor: string
  toolColor: string
}) {
  if (isStreaming && parts.length === 0 && role === 'assistant') {
    return (
      <Block className={cn('flex items-center justify-center py-6', roleColor)}>
        <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
      </Block>
    )
  }

  return parts.map((part, i) => (
    <MessagePartBlock
      key={`${id}-part-${i}`}
      id={id}
      index={i}
      part={part}
      reasoningColor={reasoningColor}
      roleColor={roleColor}
      toolColor={toolColor}
    />
  ))
}

export function MessageInspector({
  messageId,
  className,
  ...props
}: {
  messageId: string
} & React.ComponentProps<'div'>) {
  const { store } = useTetra()
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

  const { parts, role, id, updatedAt } = message
  const isStreaming = request?.status === 'preparing' || request?.status === 'streaming'
  // Derive total tokens by summing message-owned inference steps.
  const totalTokens =
    message.steps.length > 0
      ? message.steps.reduce((sum, step) => sum + step.tokens.total, 0)
      : null
  const roleColor = role === 'user' ? 'border-l-emerald-500' : 'border-l-indigo-500'
  const reasoningColor = 'border-l-violet-500'
  const toolColor = 'border-l-blue-500'
  const lastMessage = store.listMessages(message.sessionId).at(-1)
  const canRegenerate = lastMessage?.id === message.id

  const messageText = parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('')

  return (
    <div className={cn('text-xs', className)} {...props}>
      <div className="space-y-1.5">
        <Block className={cn('flex items-center gap-2 space-y-0 font-sans', roleColor, className)}>
          <Badge
            className={cn(
              'uppercase',
              role === 'user' ? 'bg-emerald-900 text-emerald-100' : 'bg-indigo-900 text-indigo-100',
            )}
          >
            {role}
          </Badge>

          <div className="text-muted-foreground/60 text-xxs ml-auto flex items-center gap-1.5">
            {totalTokens !== null && totalTokens > 0 && (
              <UsageChip>{totalTokens.toLocaleString()} tok</UsageChip>
            )}
            <span>{new Date(updatedAt).toLocaleTimeString()}</span>
          </div>

          <Badge variant="outline">
            <RequestStatusBadge status={request?.status} />
          </Badge>
        </Block>

        <MessageParts
          id={id}
          isStreaming={isStreaming}
          parts={parts}
          reasoningColor={reasoningColor}
          role={role}
          roleColor={roleColor}
          toolColor={toolColor}
        />

        {request?.status === 'error' && request.errorMessage !== '' && (
          <PartBlock className="border-l-destructive" type="error">
            <span className="text-destructive break-all">{request.errorMessage}</span>
          </PartBlock>
        )}
      </div>

      {/* Actions */}
      {!isStreaming && (
        <MessageActions
          canRegenerate={canRegenerate}
          messageId={messageId}
          messageText={messageText}
        />
      )}
    </div>
  )
}
