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

import { typedTinybase } from '@/lib/tinybase'

import type { MessagePart } from './data'

export function MessageParts(props: { messageId: string; parts: MessagePart[] }) {
  const streamingParts = typedTinybase.useEntity('streamingMessageParts', props.messageId)
  const parts = streamingParts?.parts ?? props.parts

  return <PartList isStreaming messageId={props.messageId} parts={parts} />
}

function PartList({
  isStreaming = false,
  messageId,
  parts,
}: {
  isStreaming?: boolean
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
          return (
            <ReasoningPart
              isStreaming={isStreaming && partIndex === latestContentPartIndex}
              key={partKey}
              part={part}
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
  part,
}: {
  isStreaming: boolean
  part: Extract<MessagePart, { type: 'reasoning' }>
}) {
  if (part.text === '') {
    return null
  }

  return (
    <Reasoning className="mt-1" isStreaming={isStreaming}>
      <ReasoningTrigger />
      <ReasoningContent>{part.text}</ReasoningContent>
    </Reasoning>
  )
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
