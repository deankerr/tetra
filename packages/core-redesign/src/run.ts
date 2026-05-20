import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { convertToModelMessages, readUIMessageStream, stepCountIs, streamText } from 'ai'
import type { LanguageModel, ModelMessage, ToolSet, UIMessage } from 'ai'

import type { Accessors } from '#accessors'
import { RequestConfig } from '#db'
import type { RequestConfig as RequestConfigType, Rows, StepRecord } from '#db'
import { parseStep } from '#steps'
import { resolveTools } from '#tools'

const DURABLE_SNAPSHOT_INTERVAL_MS = 500

export interface CredentialReader {
  get(id: string): string
}

export interface RunStart {
  assistantMessageId: string
  config: RequestConfigType
  onSnapshot?: (message: UIMessage) => void
  requestId: string
  session: Rows.Session
  system?: string
  transcriptMessages: Rows.Message[]
}

export type RunStatus = 'cancelled' | 'completed' | 'error' | 'preparing' | 'streaming'

interface RunInit {
  accessors: Accessors
  credentials: CredentialReader
  start: RunStart
}

export class Run extends EventTarget {
  readonly abortController = new AbortController()
  readonly assistantMessageId: string
  readonly config: RequestConfigType
  readonly done: Promise<void>
  readonly requestId: string
  readonly session: Rows.Session
  readonly sessionId: string
  readonly system: string | undefined
  readonly transcriptMessages: Rows.Message[]

  error: unknown = null
  finalParts: UIMessage['parts'] | null = null
  lastDurableWriteAt = 0
  model: LanguageModel | null = null
  modelMessages: ModelMessage[] = []
  parts: UIMessage['parts'] = []
  result: ReturnType<typeof streamText> | null = null
  status: RunStatus = 'preparing'
  steps: StepRecord[] = []
  tools: ToolSet = {}

  private readonly accessors: Accessors
  private readonly credentials: CredentialReader
  private readonly doneController = Promise.withResolvers<undefined>()
  private readonly onSnapshot: ((message: UIMessage) => void) | undefined

  constructor(init: RunInit) {
    super()
    this.accessors = init.accessors
    this.assistantMessageId = init.start.assistantMessageId
    this.config = init.start.config
    this.credentials = init.credentials
    this.done = this.doneController.promise
    this.onSnapshot = init.start.onSnapshot
    this.requestId = init.start.requestId
    this.session = init.start.session
    this.sessionId = init.start.session.id
    this.system = init.start.system
    this.transcriptMessages = init.start.transcriptMessages
  }

  cancel(): void {
    this.abortController.abort('user-cancel')
  }

  start(): void {
    void this.stream()
  }

  private complete(parts: UIMessage['parts']): void {
    this.parts = [...parts]
    this.finalParts = [...parts]
    this.accessors.messages.update(this.assistantMessageId, { parts })
    this.accessors.requests.complete(this.requestId)
    this.setStatus('completed')
    this.dispatchEvent(new Event('finish'))
    this.doneController.resolve()
  }

  private fail(error: unknown): void {
    this.error = error
    if (this.abortController.signal.aborted) {
      this.accessors.requests.cancel(this.requestId, 'Request cancelled')
      this.setStatus('cancelled')
      this.dispatchEvent(new Event('cancel'))
      this.doneController.resolve()
      return
    }

    this.accessors.requests.fail(this.requestId, error)
    this.setStatus('error')
    this.dispatchEvent(new Event('error'))
    this.doneController.resolve()
  }

  private notifySnapshot(message: UIMessage): void {
    this.parts = [...message.parts]
    this.onSnapshot?.(message)
    this.dispatchEvent(new Event('snapshot'))
  }

  private recordStep(step: StepRecord): void {
    this.steps = [...this.steps, step]
    this.accessors.requests.appendStep(this.requestId, step)
    this.dispatchEvent(new Event('step'))
  }

  private resolveModel(): LanguageModel {
    const openrouterApiKey = this.credentials.get('OPENROUTER_API_KEY').trim()
    if (openrouterApiKey === '') {
      throw new Error('OPENROUTER_API_KEY is required for model inference')
    }

    return createOpenRouter({ apiKey: openrouterApiKey })(this.config.modelId)
  }

  private resolveTools(): ToolSet {
    return resolveTools(this.config.toolIds ?? [], (id) => this.credentials.get(id))
  }

  private setStatus(status: RunStatus): void {
    this.status = status
    this.dispatchEvent(new Event('status'))
  }

  private async stream(): Promise<void> {
    try {
      const config = RequestConfig.parse(this.config)
      const tools = this.resolveTools()
      const model = this.resolveModel()
      const modelMessages = await Run.toModelMessages(this.transcriptMessages, tools)

      this.model = model
      this.modelMessages = modelMessages
      this.tools = tools
      this.accessors.requests.startStreaming(this.requestId)
      this.setStatus('streaming')

      const result = streamText({
        abortSignal: this.abortController.signal,
        messages: modelMessages,
        model,
        onStepFinish: (step) => {
          this.recordStep(parseStep(step))
        },
        providerOptions: { openrouter: config.providerOptions ?? {} },
        stopWhen: stepCountIs(6),
        system: this.system,
        tools,
      })

      this.result = result

      let finalParts: UIMessage['parts'] = []
      for await (const message of readUIMessageStream({
        stream: result.toUIMessageStream({ sendReasoning: true }),
      })) {
        finalParts = message.parts
        this.notifySnapshot(message)
        this.writeDurableSnapshot(message)
      }

      this.complete(finalParts)
    } catch (error) {
      this.fail(error)
    }
  }

  private static async toModelMessages(
    messages: Rows.Message[],
    tools: ToolSet,
  ): Promise<ModelMessage[]> {
    return await convertToModelMessages(
      messages.map((message) => ({
        id: message.id,
        parts: message.parts,
        role: message.role,
      })),
      { tools },
    )
  }

  private writeDurableSnapshot(message: UIMessage): void {
    const now = Date.now()
    if (now - this.lastDurableWriteAt < DURABLE_SNAPSHOT_INTERVAL_MS) {
      return
    }

    this.accessors.messages.update(this.assistantMessageId, { parts: message.parts })
    this.lastDurableWriteAt = now
  }
}
