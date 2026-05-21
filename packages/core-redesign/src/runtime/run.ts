import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { convertToModelMessages, readUIMessageStream, stepCountIs, streamText } from 'ai'
import type { LanguageModel, ModelMessage, ToolSet, UIMessage } from 'ai'

import { RequestConfig } from '#db'
import type { RequestConfig as RequestConfigType, Rows, StepRecord } from '#db'
import type { Store } from '#store'
import { resolveTools } from '#tools'

import {
  appendStep,
  cancelRequest,
  completeRequest,
  failRequest,
  startStreaming,
} from './requests.ts'
import { StepEvent } from './steps.ts'

const DURABLE_SNAPSHOT_INTERVAL_MS = 500

export interface CredentialReader {
  get(id: string): string
}

export interface LanguageModelResolver {
  resolve(args: { config: RequestConfigType; credentials: CredentialReader }): LanguageModel
}

export interface RunStart {
  assistantMessageId: string
  config: RequestConfigType
  requestId: string
  session: Rows.Session
  system?: string
  transcriptMessages: Rows.Message[]
}

export type RunStatus = 'cancelled' | 'completed' | 'error' | 'preparing' | 'streaming'

interface RunInit {
  credentials: CredentialReader
  modelResolver: LanguageModelResolver
  start: RunStart
  store: Store
}

export const openRouterLanguageModelResolver: LanguageModelResolver = {
  resolve: ({ config, credentials }) => {
    const openrouterApiKey = credentials.get('OPENROUTER_API_KEY').trim()
    if (openrouterApiKey === '') {
      throw new Error('OPENROUTER_API_KEY is required for model inference')
    }

    return createOpenRouter({ apiKey: openrouterApiKey })(config.modelId)
  },
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

  private readonly credentials: CredentialReader
  private readonly store: Store
  private readonly doneController = Promise.withResolvers<undefined>()
  private readonly modelResolver: LanguageModelResolver

  constructor(init: RunInit) {
    super()
    this.assistantMessageId = init.start.assistantMessageId
    this.config = init.start.config
    this.credentials = init.credentials
    this.done = this.doneController.promise
    this.modelResolver = init.modelResolver
    this.store = init.store
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
    this.store.updateMessage(this.assistantMessageId, { parts })
    completeRequest(this.store.db, this.requestId)
    this.setStatus('completed')
    this.dispatchEvent(new Event('finish'))
    this.doneController.resolve()
  }

  private fail(error: unknown): void {
    this.error = error
    if (this.abortController.signal.aborted) {
      cancelRequest(this.store.db, this.requestId, 'Request cancelled')
      this.setStatus('cancelled')
      this.dispatchEvent(new Event('cancel'))
      this.doneController.resolve()
      return
    }

    failRequest(this.store.db, this.requestId, error)
    this.setStatus('error')
    this.dispatchEvent(new Event('error'))
    this.doneController.resolve()
  }

  private notifySnapshot(message: UIMessage): void {
    this.parts = [...message.parts]
    this.dispatchEvent(new Event('snapshot'))
  }

  private recordStep(step: StepRecord): void {
    this.steps = [...this.steps, step]
    appendStep(this.store.db, this.requestId, step)
    this.dispatchEvent(new Event('step'))
  }

  private resolveModel(): LanguageModel {
    return this.modelResolver.resolve({ config: this.config, credentials: this.credentials })
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
      startStreaming(this.store.db, this.requestId)
      this.setStatus('streaming')

      const result = streamText({
        abortSignal: this.abortController.signal,
        messages: modelMessages,
        model,
        onStepFinish: (step) => {
          this.recordStep(StepEvent.parse(step))
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
        terminateOnError: true,
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

    this.store.updateMessage(this.assistantMessageId, { parts: message.parts })
    this.lastDurableWriteAt = now
  }
}
