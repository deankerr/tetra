import {
  Attachment,
  AttachmentInfo,
  AttachmentPreview,
  Attachments,
  getMediaCategory,
} from '@tetra/ui/components/ai-elements/attachments'
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
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@tetra/ui/components/ui/dialog'
import { Spinner } from '@tetra/ui/components/ui/spinner'
import type { DynamicToolUIPart, FileUIPart, SourceDocumentUIPart, ToolUIPart, UIMessage } from 'ai'

import { useMessage } from '@/tetra/hooks/transcripts'

export function MessageBubble({ messageId }: { messageId: string }) {
  const message = useMessage(messageId)

  if (message === null) {
    return null
  }

  return (
    <Message from={message.role}>
      {message.parts.length === 0 && message.role === 'assistant' ? (
        <MessageContent>
          <div className="flex items-center gap-2 py-2">
            <Spinner className="text-muted-foreground size-3" />
            <span className="text-muted-foreground text-xs">Thinking…</span>
          </div>
        </MessageContent>
      ) : (
        message.parts.map((part, index) => (
          <MessageBubblePart
            attachmentId={`${message.id}-attachment-${index}`}
            key={`${message.id}-part-${index}`}
            part={part}
          />
        ))
      )}
    </Message>
  )
}

function MessageBubblePart({
  attachmentId,
  part,
}: {
  attachmentId: string
  part: UIMessage['parts'][number]
}) {
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

  if (isAttachmentPart(part)) {
    return <AttachmentPart attachmentId={attachmentId} part={part} />
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

function AttachmentPart({
  attachmentId,
  part,
}: {
  attachmentId: string
  part: FileUIPart | SourceDocumentUIPart
}) {
  const attachment = { ...part, id: attachmentId }
  const isImageFile =
    part.type === 'file' && part.url !== '' && getMediaCategory(attachment) === 'image'

  if (!isImageFile) {
    return (
      <Attachments variant="grid">
        <Attachment data={attachment}>
          <AttachmentPreview />
          <AttachmentInfo showMediaType />
        </Attachment>
      </Attachments>
    )
  }

  return (
    <Dialog>
      <Attachments variant="grid">
        <DialogTrigger
          nativeButton={false}
          render={
            <Attachment
              className="focus-visible:outline-ring cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2"
              data={attachment}
            >
              <AttachmentPreview />
              <AttachmentInfo showMediaType />
            </Attachment>
          }
        />
      </Attachments>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[calc(100vh-2rem)] justify-center sm:max-w-5xl"
      >
        <DialogTitle className="sr-only">{part.filename ?? 'Image attachment'}</DialogTitle>
        <img
          alt={part.filename ?? 'Image attachment'}
          className="max-h-[calc(100vh-5rem)] w-auto max-w-full rounded-lg object-contain"
          src={part.url}
        />
      </DialogContent>
    </Dialog>
  )
}

function isAttachmentPart(
  part: UIMessage['parts'][number],
): part is FileUIPart | SourceDocumentUIPart {
  return part.type === 'file' || part.type === 'source-document'
}

function isToolPart(part: UIMessage['parts'][number]): part is ToolUIPart | DynamicToolUIPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-')
}
