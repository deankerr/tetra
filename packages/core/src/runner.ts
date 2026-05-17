import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { CredentialStore } from '@tetra/credentials'
import type { OnStepFinishEvent, UIMessage } from 'ai'
import { readUIMessageStream, streamText } from 'ai'

import { ModelConfig, StepRawUsage, generateId } from '#model'
import type { Sessions } from '#sessions'
import type { TetraStore } from '#store'
import { resolveTools } from '#tools'

export interface ExecuteArgs {
  config?: Partial<ModelConfig>
  content: string
  // Called on each UIMessage snapshot during streaming — for live rendering.
  // React passes streamingState.update; CLI passes a stdout printer.
  onSnapshot?: (msg: UIMessage) => void
}

export interface ExecuteResult {
  assistantMessageId: string
  requestId: string
}

export interface Runner {
  cancel(requestId: string): void
  execute(sessionId: string, args: ExecuteArgs): ExecuteResult
  // On startup: recover any requests interrupted by a process restart.
  recover(): void
}

// --- Step accounting ---
//
// Combines two sources into one structured object written to the steps table:
//   step.usage       — AI SDK normalised token counts (fully typed)
//   step.usage.raw   — verbatim provider JSON; sole source of cost data
//
// Model identity fields:
//   requestedModel   — the alias we sent (e.g. deepseek/deepseek-v4-flash)
//   servedModel      — the pinned version that actually ran
//   backendProvider  — the infrastructure backend (e.g. Novita, Azure, Parasail)
//   generationId     — OpenRouter's trace ID for this generation

function resolveTokens(step: OnStepFinishEvent, raw: StepRawUsage) {
  return {
    // Media tokens — only in raw; not in the SDK's normalised fields
    audioIn: raw.prompt_tokens_details?.audio_tokens ?? 0,
    audioOut: raw.completion_tokens_details?.audio_tokens ?? 0,
    // Cache breakdown (SDK normalised)
    cacheRead: step.usage.inputTokenDetails.cacheReadTokens ?? 0,
    cacheWrite: step.usage.inputTokenDetails.cacheWriteTokens ?? 0,
    imageOut: raw.completion_tokens_details?.image_tokens ?? 0,
    // Normalised counts from the AI SDK
    input: step.usage.inputTokens ?? 0,
    output: step.usage.outputTokens ?? 0,
    reasoning: step.usage.outputTokenDetails.reasoningTokens ?? 0,
    text: step.usage.outputTokenDetails.textTokens ?? 0,
    total: step.usage.totalTokens ?? 0,
    videoIn: raw.prompt_tokens_details?.video_tokens ?? 0,
  }
}

function resolveAccounting(step: OnStepFinishEvent) {
  // raw is the verbatim provider JSON — only source for cost and media tokens
  const raw = StepRawUsage.parse(step.usage.raw ?? {})

  // backendProvider lives in providerMetadata, not in usage
  const backendProvider =
    typeof step.providerMetadata?.openrouter?.provider === 'string'
      ? step.providerMetadata.openrouter.provider
      : ''

  return {
    backendProvider,
    cost: {
      completion: raw.cost_details?.upstream_inference_completions_cost ?? null,
      isByok: raw.is_byok ?? false,
      prompt: raw.cost_details?.upstream_inference_prompt_cost ?? null,
      total: raw.cost ?? null,
    },
    generationId: step.response.id,
    requestedModel: step.model?.modelId ?? '',
    servedModel: step.response.modelId,
    tokens: resolveTokens(step, raw),
  }
}

export function createRunner(
  tetraStore: TetraStore,
  sessions: Sessions,
  credentials: CredentialStore,
): Runner {
  const { indexes, store } = tetraStore

  // Active abort controllers — keyed by requestId, removed on completion/error/cancel
  const controllers = new Map<string, AbortController>()

  async function runStream(
    requestId: string,
    sessionId: string,
    assistantMessageId: string,
    config: ModelConfig,
    abort: AbortController,
    onSnapshot?: (msg: UIMessage) => void,
  ): Promise<void> {
    const openrouter = createOpenRouter({ apiKey: credentials.get('OPENROUTER_API_KEY') })

    try {
      // History is read here, after execute() has synchronously written the new user
      // message and assistant placeholder — so they're already in the store.
      const messages = await sessions.gatherModelMessages(
        sessionId,
        assistantMessageId,
        config.maxMessages,
      )

      const { providerOptions = {}, toolIds: requestedToolIds } = config

      // Resolve tools and gather credentials if any tool IDs are configured.
      const toolsResolved =
        requestedToolIds !== undefined && requestedToolIds.length > 0
          ? resolveTools(requestedToolIds, (id) => credentials.get(id))
          : undefined

      const result = streamText({
        abortSignal: abort.signal,
        ...(toolsResolved !== undefined && {
          experimental_context: toolsResolved.toolContext,
          maxSteps: 10,
          tools: toolsResolved.tools,
        }),
        messages,
        model: openrouter(config.modelId),
        // Write a step record on each step completion — accounting only, no content.
        // Content is handled by the UIMessage stream below.
        onAbort: () => {
          console.warn('streamText aborted', { requestId })
        },
        onStepFinish: (step) => {
          const accounting = resolveAccounting(step)
          store.setRow('steps', generateId.step(), {
            accounting,
            createdAt: Date.now(),
            finishReason: step.finishReason,
            messageId: assistantMessageId,
            requestId,
            sessionId,
            stepNumber: step.stepNumber,
          })
        },
        providerOptions: { openrouter: providerOptions },
        ...(config.systemPrompt !== undefined && { system: config.systemPrompt }),
        onError: (event) => {
          console.error({ event, requestId })
        },
      })
      console.log('streamText start', { requestId })

      // readUIMessageStream converts the chunk stream into a sequence of assembled
      // UIMessage snapshots — one per meaningful update (text chunk, tool result, etc.).
      // Each snapshot goes to the caller for live rendering; the last one is the
      // complete message we persist.
      let finalParts: UIMessage['parts'] = []
      for await (const msg of readUIMessageStream({
        stream: result.toUIMessageStream({ sendReasoning: true }),
      })) {
        onSnapshot?.(msg)
        finalParts = msg.parts
      }

      // Write the fully assembled UIMessage parts once — this is the durable record.
      // Readers that missed the live stream (page reload, second client) read from here.
      store.setPartialRow('messages', assistantMessageId, {
        parts: finalParts,
        updatedAt: Date.now(),
      })

      // Mark completed immediately — don't block on usage so the UI can update.
      store.setPartialRow('requests', requestId, {
        completedAt: Date.now(),
        status: 'completed',
      })
      console.log('streamText complete', { requestId })

      // Best-effort usage update — resolves after the stream drains but may hang
      // or be unavailable for some providers.
      const totalUsage = await result.totalUsage
      store.setPartialRow('requests', requestId, {
        totalUsage: {
          inputTokens: totalUsage.inputTokens,
          outputTokens: totalUsage.outputTokens,
          totalTokens: totalUsage.totalTokens,
        },
      })
    } catch (error) {
      console.error({ error, requestId })
      const status = abort.signal.aborted ? 'cancelled' : 'error'
      store.setPartialRow('requests', requestId, {
        completedAt: Date.now(),
        errorMessage: String(error),
        status,
      })
    } finally {
      controllers.delete(requestId)
    }
  }

  return {
    cancel(requestId) {
      controllers.get(requestId)?.abort('user-cancel')
    },

    execute(sessionId, { config, content, onSnapshot }) {
      // Caller config overrides session config; both are validated at this boundary
      const validConfig = ModelConfig.parse({ ...sessions.getConfig(sessionId), ...config })

      // Write user message and assistant placeholder synchronously before the async stream
      // starts — so they're visible in the store immediately after execute() returns.
      sessions.addMessage(sessionId, { content, role: 'user' })
      const assistantMessageId = sessions.addMessage(sessionId, { content: '', role: 'assistant' })

      // Write the request record synchronously — callers read assistantMessageId from it
      const requestId = generateId.request()
      const abort = new AbortController()
      controllers.set(requestId, abort)
      store.setRow('requests', requestId, {
        assistantMessageId,
        config: validConfig,
        createdAt: Date.now(),
        errorMessage: '',
        sessionId,
        status: 'streaming',
        totalUsage: {},
      })

      // Fire-and-forget — runStream writes all outcomes to TinyBase (completed/error/cancelled)
      void runStream(requestId, sessionId, assistantMessageId, validConfig, abort, onSnapshot)

      return { assistantMessageId, requestId }
    },

    recover() {
      // Any request still marked 'streaming' at startup was interrupted — mark as error
      for (const sessionId of store.getRowIds('sessions')) {
        for (const requestId of indexes.getSliceRowIds('requestsBySession', sessionId)) {
          if (store.getCell('requests', requestId, 'status') === 'streaming') {
            store.setPartialRow('requests', requestId, {
              errorMessage: 'Request interrupted (process restart)',
              status: 'error',
            })
          }
        }
      }
    },
  }
}
