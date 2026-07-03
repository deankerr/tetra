import { MessageResponse } from '@tetra/ui/components/ai-elements/message'
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@tetra/ui/components/ai-elements/reasoning'
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@tetra/ui/components/ai-elements/tool'
import type { ToolPart as ToolPartType } from '@tetra/ui/components/ai-elements/tool'
import { Badge } from '@tetra/ui/components/ui/badge'

import type { MessagePart } from './data'

export function MessageParts(props: {
  isStreaming: boolean
  messageId: string
  parts: MessagePart[]
}) {
  return (
    <PartList isStreaming={props.isStreaming} messageId={props.messageId} parts={props.parts} />
  )
}

function PartList({
  isStreaming,
  messageId,
  parts,
}: {
  isStreaming: boolean
  messageId: string
  parts: MessagePart[]
}) {
  const latestContentPartIndex = parts.findLastIndex((part) => part.type !== 'step-start')

  return (
    <div className="flex flex-col gap-3">
      {parts.map((part, partIndex) => {
        const partKey = `${messageId}-part-${partIndex}`

        if (part.type === 'step-start') {
          return null
        }

        if (isToolPart(part)) {
          return <ToolPartView key={partKey} part={part} />
        }

        if (part.type === 'reasoning') {
          // Merge only consecutive reasoning parts, rendered in place: a model may reason after a
          // tool call, so hoisting all reasoning to the top would misorder the transcript. Later
          // parts of a run fold into the block opened by its first part.
          if (parts[partIndex - 1]?.type === 'reasoning') {
            return null
          }

          const runParts = collectReasoningRun(parts, partIndex)
          const runEndIndex = partIndex + runParts.length - 1

          return (
            <ReasoningPart
              isStreaming={isStreaming && latestContentPartIndex === runEndIndex}
              key={partKey}
              parts={runParts}
            />
          )
        }

        if (part.type === 'text') {
          return <TextPart key={partKey} part={part} />
        }

        if (part.type === 'file') {
          return <FilePart key={partKey} part={part} />
        }

        return <UnsupportedPart key={partKey} part={part} />
      })}
    </div>
  )
}

function TextPart({ part }: { part: Extract<MessagePart, { type: 'text' }> }) {
  if (part.text === '') {
    return null
  }

  return <MessageResponse>{part.text}</MessageResponse>
}

function ReasoningPart({
  isStreaming,
  parts,
}: {
  isStreaming: boolean
  parts: Extract<MessagePart, { type: 'reasoning' }>[]
}) {
  const text = parts.map((part) => part.text).join('\n\n')
  if (text === '') {
    return null
  }

  // Sum the measured per-part durations; 0 means unmeasured (live stream or older message), so we
  // pass undefined and let the component fall back to its own timer / "a few seconds" label.
  const totalMs = parts.reduce((sum, part) => sum + getReasoningDurationMs(part), 0)
  const seconds = Math.ceil(totalMs / 1000)

  return (
    <Reasoning
      className="mt-1"
      isStreaming={isStreaming}
      {...(seconds > 0 && { duration: seconds })}
    >
      <ReasoningTrigger />
      <ReasoningContent>{text}</ReasoningContent>
    </Reasoning>
  )
}

function getReasoningDurationMs(part: Extract<MessagePart, { type: 'reasoning' }>): number {
  const value = part.providerMetadata?.tetra?.durationMs
  return typeof value === 'number' ? value : 0
}

function collectReasoningRun(
  parts: MessagePart[],
  startIndex: number,
): Extract<MessagePart, { type: 'reasoning' }>[] {
  const run: Extract<MessagePart, { type: 'reasoning' }>[] = []
  for (const part of parts.slice(startIndex)) {
    if (part.type !== 'reasoning') {
      break
    }
    run.push(part)
  }
  return run
}

function ToolPartView({ part }: { part: ToolPartType }) {
  return (
    <Tool>
      {part.type === 'dynamic-tool' ? (
        <ToolHeader state={part.state} toolName={part.toolName} type={part.type} />
      ) : (
        <ToolHeader state={part.state} type={part.type} />
      )}
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput errorText={part.errorText} output={part.output} />
      </ToolContent>
    </Tool>
  )
}

function FilePart({ part }: { part: Extract<MessagePart, { type: 'file' }> }) {
  const filename = part.filename ?? null
  const label = [part.mediaType, filename].filter(Boolean).join(' · ')

  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <div className="text-muted-foreground text-xxs flex items-center gap-2">
        <Badge className="rounded-xs" variant="secondary">
          file
        </Badge>
        {label}
      </div>

      {part.mediaType.startsWith('image/') && (
        <img alt={filename ?? 'attachment'} className="max-h-48 w-fit rounded-md" src={part.url} />
      )}
    </div>
  )
}

function UnsupportedPart({ part }: { part: MessagePart }) {
  return (
    <div className="text-muted-foreground text-xxs rounded-md border border-dashed p-2">
      Unsupported message part: <span className="font-mono">{part.type}</span>
    </div>
  )
}

function isToolPart(part: MessagePart): part is ToolPartType {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-')
}
