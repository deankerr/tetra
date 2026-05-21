import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { convertToModelMessages, readUIMessageStream, stepCountIs, streamText } from 'ai'
import type { LanguageModel, ModelMessage, OnStepFinishEvent, ToolSet, UIMessage } from 'ai'
import { z } from 'zod'

import { RequestConfig } from '#db'
import type { RequestConfig as RequestConfigType, Rows, StepRecord } from '#db'
import { appendStep, cancelRequest, completeRequest, failRequest, startStreaming } from '#requests'
import type { Store } from '#store'
import { resolveTools } from '#tools'

const DURABLE_SNAPSHOT_INTERVAL_MS = 500

// Parses OpenRouter-specific cost and token details from the raw provider metadata.
const ProviderRaw = z.object({
  completion_tokens_details: z
    .object({
      audio_tokens: z.number().default(0),
      image_tokens: z.number().default(0),
    })
    .default({ audio_tokens: 0, image_tokens: 0 }),
  cost: z.number().optional(),
  cost_details: z
    .object({
      upstream_inference_completions_cost: z.number().optional(),
      upstream_inference_prompt_cost: z.number().optional(),
    })
    .default({}),
  is_byok: z.boolean().default(false),
  prompt_tokens_details: z
    .object({
      audio_tokens: z.number().default(0),
      video_tokens: z.number().default(0),
    })
    .default({ audio_tokens: 0, video_tokens: 0 }),
})

const StepEvent = z
  .object({
    finishReason: z.string(),
    model: z.object({ modelId: z.string() }).optional(),
    providerMetadata: z
      .object({ openrouter: z.object({ provider: z.string() }).optional() })
      .optional(),
    response: z.object({ id: z.string(), modelId: z.string() }),
    stepNumber: z.number(),
    usage: z.object({
      inputTokenDetails: z
        .object({ cacheReadTokens: z.number().default(0), cacheWriteTokens: z.number().default(0) })
        .default({ cacheReadTokens: 0, cacheWriteTokens: 0 }),
      inputTokens: z.number().default(0),
      outputTokenDetails: z
        .object({ reasoningTokens: z.number().default(0) })
        .default({ reasoningTokens: 0 }),
      outputTokens: z.number().default(0),
      raw: z.unknown().optional(),
      totalTokens: z.number().default(0),
    }),
  })
  .transform((event): StepRecord => {
    const raw = ProviderRaw.parse(event.usage.raw ?? {})
    return {
      cost: {
        completion: raw.cost_details.upstream_inference_completions_cost ?? null,
        isByok: raw.is_byok,
        prompt: raw.cost_details.upstream_inference_prompt_cost ?? null,
        total: raw.cost ?? null,
      },
      createdAt: Date.now(),
      finishReason: event.finishReason,
      generationId: event.response.id,
      model: event.response.modelId,
      provider: event.providerMetadata?.openrouter?.provider ?? '',
      stepNumber: event.stepNumber,
      tokens: {
        audioIn: raw.prompt_tokens_details.audio_tokens,
        audioOut: raw.completion_tokens_details.audio_tokens,
        cacheRead: event.usage.inputTokenDetails.cacheReadTokens,
        cacheWrite: event.usage.inputTokenDetails.cacheWriteTokens,
        imageOut: raw.completion_tokens_details.image_tokens,
        input: event.usage.inputTokens,
        output: event.usage.outputTokens,
        reasoning: event.usage.outputTokenDetails.reasoningTokens,
        total: event.usage.totalTokens,
        videoIn: raw.prompt_tokens_details.video_tokens,
      },
    }
  })

function parseStep(event: OnStepFinishEvent): StepRecord {
  return StepEvent.parse(event)
}

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
