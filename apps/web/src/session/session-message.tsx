import { Message, MessageContent, MessageResponse } from '@tetra/ui/components/ai-elements/message'
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
import type { DynamicToolUIPart, ToolUIPart, UIMessage } from 'ai'

import { useMessage } from '@/runtime/hooks'

export function SessionMessage({ messageId }: { messageId: string }) {
  const message = useMessage(messageId)

  if (message === null) {
    return null
  }

  return (
    <Message from={message.role}>
      {message.parts.map((part, index) => (
        <SessionMessagePart key={`${message.id}-part-${index}`} part={part} />
      ))}
    </Message>
  )
}

function SessionMessagePart({ part }: { part: UIMessage['parts'][number] }) {
  if (part.type === 'text') {
    return (
      <MessageContent>
        <MessageResponse>{part.text}</MessageResponse>
      </MessageContent>
    )
  }

  if (part.type === 'reasoning') {
    return (
      <Reasoning defaultOpen={false}>
        <ReasoningTrigger />
        <ReasoningContent>{part.text}</ReasoningContent>
      </Reasoning>
    )
  }

  if (isToolPart(part)) {
    return (
      <Tool defaultOpen={part.state !== 'output-available'}>
        {part.type === 'dynamic-tool' ? (
          <ToolHeader state={part.state} toolName={part.toolName} type={part.type} />
        ) : (
          <ToolHeader state={part.state} type={part.type} />
        )}
        <ToolContent>
          {'input' in part && <ToolInput input={part.input} />}
          <ToolOutput
            errorText={'errorText' in part ? part.errorText : undefined}
            output={'output' in part ? part.output : undefined}
          />
        </ToolContent>
      </Tool>
    )
  }

  return null
}

function isToolPart(part: UIMessage['parts'][number]): part is ToolUIPart | DynamicToolUIPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-')
}
