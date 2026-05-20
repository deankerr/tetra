import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { convertToModelMessages } from 'ai'
import type { ModelMessage } from 'ai'

import type { Accessors } from '#accessors'
import { RequestConfig } from '#db'
import type { RequestConfig as RequestConfigType, Rows } from '#db'
import type { RunnerInput } from '#runner'
import { resolveTools } from '#tools'

export interface ExecuteArgs {
  config?: Partial<RequestConfigType>
  content: string
}

export interface CredentialReader {
  get(id: string): string
}

export interface PreparedRun {
  abortController: AbortController
  assistantMessageId: string
  input: RunnerInput
  messages: Rows.Message[]
  requestId: string
  session: Rows.Session
}

export class Execute {
  private readonly accessors: Accessors
  private readonly credentials: CredentialReader

  constructor(accessors: Accessors, credentials: CredentialReader) {
    this.accessors = accessors
    this.credentials = credentials
  }

  async prepare(sessionId: string, args: ExecuteArgs): Promise<PreparedRun> {
    const session = this.accessors.sessions.get(sessionId)
    const config = RequestConfig.parse({ ...session.config, ...args.config })

    const openrouterApiKey = this.credentials.get('OPENROUTER_API_KEY').trim()
    if (openrouterApiKey === '') {
      throw new Error('OPENROUTER_API_KEY is required for model inference')
    }

    this.accessors.messages.create(sessionId, {
      parts: [{ text: args.content, type: 'text' }],
      role: 'user',
    })
    const assistantMessageId = this.accessors.messages.create(sessionId, {
      parts: [],
      role: 'assistant',
    })
    this.accessors.sessions.touch(sessionId)

    const requestId = this.accessors.requests.create({
      assistantMessageId,
      config,
      sessionId,
    })

    const messages = this.collectMessages(sessionId, {
      excludeMessageId: assistantMessageId,
      maxMessages: config.maxMessages,
    })
    const modelMessages = await Execute.toModelMessages(messages)
    const openrouter = createOpenRouter({ apiKey: openrouterApiKey })
    const abortController = new AbortController()

    return {
      abortController,
      assistantMessageId,
      input: {
        abortSignal: abortController.signal,
        config,
        messages: modelMessages,
        model: openrouter(config.modelId),
        providerOptions: config.providerOptions ?? {},
        system: this.resolveSystemPrompt(config),
        tools: resolveTools(config.toolIds ?? [], (id) => this.credentials.get(id)),
      },
      messages,
      requestId,
      session,
    }
  }

  private collectMessages(
    sessionId: string,
    args: { excludeMessageId: string; maxMessages?: number },
  ): Rows.Message[] {
    let messages = this.accessors.messages
      .listForSession(sessionId)
      .filter((message) => message.id !== args.excludeMessageId)

    if (args.maxMessages !== undefined) {
      messages = messages.slice(-args.maxMessages)
    }

    return messages
  }

  private resolveSystemPrompt(config: RequestConfigType): string | undefined {
    if (config.systemPromptId === undefined) {
      return undefined
    }

    return this.accessors.prompts.get(config.systemPromptId).content || undefined
  }

  private static async toModelMessages(messages: Rows.Message[]): Promise<ModelMessage[]> {
    return await convertToModelMessages(
      messages.map((message) => ({
        id: message.id,
        parts: message.parts,
        role: message.role,
      })),
    )
  }
}
