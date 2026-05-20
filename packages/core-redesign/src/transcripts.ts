import { convertToModelMessages } from 'ai'
import type { ModelMessage, UIMessage } from 'ai'

import type { Accessors } from '#accessors'
import type { MessageRole as MessageRoleType, Rows } from '#db'

export interface MessagePatch {
  parts?: UIMessage['parts']
  role?: MessageRoleType
}

export class Transcripts {
  private readonly accessors: Accessors

  constructor(accessors: Accessors) {
    this.accessors = accessors
  }

  appendMessage(
    sessionId: string,
    args: { parts: UIMessage['parts']; role: MessageRoleType },
  ): string {
    this.accessors.sessions.require(sessionId)
    const messageId = this.accessors.messages.create(sessionId, args)
    this.accessors.sessions.touch(sessionId)

    return messageId
  }

  appendTextMessage(sessionId: string, args: { role: MessageRoleType; text: string }): string {
    return this.appendMessage(sessionId, {
      parts: [{ text: args.text, type: 'text' }],
      role: args.role,
    })
  }

  deleteMessage(messageId: string): void {
    const { sessionId } = this.get(messageId)

    this.accessors.messages.delete(messageId)
    this.accessors.sessions.touch(sessionId)
  }

  get(messageId: string): Rows.Message {
    return this.accessors.messages.get(messageId)
  }

  listMessages(sessionId: string): Rows.Message[] {
    this.accessors.sessions.require(sessionId)
    return this.accessors.messages.listForSession(sessionId)
  }

  async toModelMessages(
    sessionId: string,
    args: { excludeMessageId?: string; maxMessages?: number } = {},
  ): Promise<ModelMessage[]> {
    const uiMessages = this.toUIMessages(sessionId, args)
    return await convertToModelMessages(uiMessages)
  }

  toUIMessages(
    sessionId: string,
    args: { excludeMessageId?: string; maxMessages?: number } = {},
  ): UIMessage[] {
    let messages = this.listMessages(sessionId)

    if (args.excludeMessageId !== undefined) {
      messages = messages.filter((message) => message.id !== args.excludeMessageId)
    }

    if (args.maxMessages !== undefined) {
      messages = messages.slice(-args.maxMessages)
    }

    return messages.map(
      (message): UIMessage => ({
        id: message.id,
        parts: message.parts,
        role: message.role,
      }),
    )
  }

  updateMessage(messageId: string, patch: MessagePatch): void {
    const prior = this.get(messageId)

    this.accessors.messages.update(messageId, patch)
    this.accessors.sessions.touch(prior.sessionId)
  }
}
