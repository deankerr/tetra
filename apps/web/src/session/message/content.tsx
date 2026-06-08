import type { Rows } from '@tetra/store-schema'
import { MessageContent as AiMessageContent } from '@tetra/ui/components/ai-elements/message'

import { getRunErrorMessage, isMessageRunStreaming } from './data'
import { PersistedMessagePartList, StreamingMessagePartList } from './parts'

type MessageRow = Rows['messages']
type RunRow = Rows['runs']

export function MessageContentView({ message, run }: { message: MessageRow; run: RunRow | null }) {
  return (
    <AiMessageContent className="group-[.is-assistant]:w-full">
      {isMessageRunStreaming(run) ? (
        <StreamingMessagePartList messageId={message.id} persistedParts={message.parts} />
      ) : (
        <PersistedMessagePartList messageId={message.id} parts={message.parts} />
      )}
      <MessageRunError run={run} />
    </AiMessageContent>
  )
}

function MessageRunError({ run }: { run: RunRow | null }) {
  const errorMessage = getRunErrorMessage(run)

  if (errorMessage === null) {
    return null
  }

  return (
    <div
      className="border-destructive/30 text-destructive text-xxs rounded-md border p-2 font-mono"
      role="alert"
    >
      {errorMessage}
    </div>
  )
}
