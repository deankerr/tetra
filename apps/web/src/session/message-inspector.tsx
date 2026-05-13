import { CodeBlockContent } from '@tetra/ui/components/ai-elements/code-block'
import type { ToolPart } from '@tetra/ui/components/ai-elements/tool'
import { Badge } from '@tetra/ui/components/ui/badge'
import { Button } from '@tetra/ui/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tetra/ui/components/ui/collapsible'
import { cn } from '@tetra/ui/lib/utils'
import type { DynamicToolUIPart, ToolUIPart } from 'ai'
import {
  AlertCircleIcon,
  BracesIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  ClockIcon,
  CopyIcon,
  Loader2Icon,
  TrashIcon,
  WrenchIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'

import type { Message } from '@/runtime/hooks'
import { useMessage, useRequestForMessage } from '@/runtime/hooks'
import { useRuntime } from '@/runtime/use-runtime'

type MessagePart = Message['parts'][number]

function RawJsonCollapsible({
  defaultOpen = true,
  label,
  value,
}: {
  defaultOpen?: boolean
  label: string
  value: unknown
}) {
  return (
    <Collapsible
      defaultOpen={defaultOpen}
      className="border-border/50 bg-background/40 overflow-hidden rounded-sm border"
    >
      <CollapsibleTrigger className="text-muted-foreground hover:text-foreground data-[panel-open]:border-border/40 group bg-muted/25 flex w-full items-center justify-between gap-2 border-b border-transparent px-2 py-1.5 text-[0.625rem] font-semibold tracking-wider uppercase transition-colors">
        <span className="flex items-center gap-1">
          <BracesIcon className="size-3" />
          {label}
        </span>
        <ChevronDownIcon className="size-3 transition-transform group-data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="[&>div]:max-h-56">
        <CodeBlockContent
          code={JSON.stringify(value, null, 2)}
          language="json"
          className="bg-background/70 text-[0.625rem] whitespace-pre-wrap [&_code]:text-[0.625rem]"
        />
      </CollapsibleContent>
    </Collapsible>
  )
}

function ToolPart({ part }: { part: ToolUIPart | DynamicToolUIPart }) {
  const toolName = part.type.startsWith('tool-') ? part.type.slice(5) : part.type
  const { input, output, errorText, state, ...rest } = part

  return (
    <>
      <div className="text-foreground flex items-center gap-2 font-semibold">
        <WrenchIcon className="size-3.5 text-amber-500" />
        {toolName}
        <ToolStateIcon state={state} />
      </div>

      <RawJsonCollapsible label="input" value={input} />
      {output !== undefined && <RawJsonCollapsible label="output" value={output} />}
      {errorText !== undefined && <RawJsonCollapsible label="errorText" value={errorText} />}
      <RawJsonCollapsible defaultOpen={false} label="raw part" value={rest} />
    </>
  )
}

function Block({ children, className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'border-border/40 bg-muted/20 border-l-muted-foreground space-y-3 border border-l-2 px-3 py-2.5',
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
    <Block className={className}>
      <div className="text-muted-foreground/80 flex items-center justify-between gap-3 text-[0.625rem] font-semibold tracking-wide">
        {type}
        {status}
      </div>
      {children}
    </Block>
  )
}

function isToolPart(part: MessagePart): part is ToolUIPart | DynamicToolUIPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-')
}

// ------------------------------------------------------------------
// Request status badge
// ------------------------------------------------------------------

const requestStatusConfig = {
  completed: { className: 'text-emerald-500/70', icon: CheckIcon, label: 'Completed' },
  error: { className: 'text-destructive', icon: AlertCircleIcon, label: 'Error' },
  pending: { className: 'text-muted-foreground/40', icon: CircleDashedIcon, label: 'Pending' },
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
    return <CircleDashedIcon className="text-muted-foreground/20 size-3" />
  }

  const Icon = config.icon
  return <Icon className={cn('size-3', config.className)} aria-label={config.label} />
}

// ------------------------------------------------------------------
// Tool part state icon
// ------------------------------------------------------------------

const toolStateConfig: Record<
  ToolPart['state'],
  { className: string; icon: React.ElementType; label: string }
> = {
  'approval-requested': {
    className: 'text-amber-400',
    icon: ClockIcon,
    label: 'Awaiting approval',
  },
  'approval-responded': {
    className: 'text-muted-foreground/60',
    icon: CheckIcon,
    label: 'Approval responded',
  },
  'input-available': {
    className: 'text-blue-400 animate-spin',
    icon: Loader2Icon,
    label: 'Running',
  },
  'input-streaming': {
    className: 'text-muted-foreground/40',
    icon: CircleDashedIcon,
    label: 'Streaming input',
  },
  'output-available': { className: 'text-emerald-500/70', icon: CheckIcon, label: 'Completed' },
  'output-denied': { className: 'text-amber-500', icon: AlertCircleIcon, label: 'Denied' },
  'output-error': { className: 'text-destructive', icon: AlertCircleIcon, label: 'Error' },
}

function ToolStateIcon({ state }: { state: ToolPart['state'] }) {
  const config = toolStateConfig[state]
  const Icon = config.icon
  return <Icon className={cn('size-3', config.className)} aria-label={config.label} />
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

  const { parts, role, id, createdAt, updatedAt } = message
  const isStreaming = request?.status === 'pending' || request?.status === 'streaming'
  const roleColor = role === 'user' ? 'border-l-emerald-500' : 'border-l-indigo-500'
  const reasoningColor = role === 'user' ? roleColor : 'border-l-violet-500'
  const toolColor = role === 'user' ? roleColor : 'border-l-amber-500'

  const messageText = parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('')

  return (
    <div className={cn('space-y-2 text-xs', className)} {...props}>
      <div className="space-y-2">
        {/* Header */}
        <Block className={cn('flex items-center gap-2 space-y-0 font-sans', roleColor, className)}>
          <Badge
            className={cn(
              'uppercase',
              role === 'user' ? 'bg-emerald-900 text-emerald-100' : 'bg-indigo-900 text-indigo-100',
            )}
          >
            {role}
          </Badge>

          <div className="text-muted-foreground/60 ml-auto flex items-center gap-1.5 text-[0.625rem]">
            {createdAt === updatedAt ? (
              <span>{new Date(createdAt).toLocaleTimeString()}</span>
            ) : (
              <span>{new Date(updatedAt).toLocaleTimeString()}</span>
            )}
          </div>

          <Badge variant="outline">
            <RequestStatusBadge status={request?.status} />
          </Badge>
        </Block>

        {/* Parts */}
        {parts.map((part, i) => {
          if (part.type === 'text') {
            return (
              <PartBlock key={`${id}-part-${i}`} className={roleColor} type={part.type}>
                <CodeBlockContent
                  code={part.text}
                  language="markdown"
                  className="p-0 text-xs whitespace-pre-wrap [&_code]:text-xs"
                />
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

          if (part.type === 'reasoning') {
            return (
              <PartBlock key={`${id}-part-${i}`} className={reasoningColor} type={part.type}>
                <CodeBlockContent
                  code={part.text}
                  language="markdown"
                  className="p-0 text-xs whitespace-pre-wrap [&_code]:text-xs"
                />
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
              <PartBlock
                key={`${id}-part-${i}`}
                className={cn('py-1.5', roleColor)}
                type={part.type}
              />
            )
          }

          if (isToolPart(part)) {
            return (
              <PartBlock key={`${id}-part-${i}`} className={toolColor} type={part.type}>
                <ToolPart part={part} />
              </PartBlock>
            )
          }

          return (
            <PartBlock key={`${id}-part-${i}`} className={roleColor} type={part.type}>
              <RawJsonCollapsible label="raw part" value={part} />
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
