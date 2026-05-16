import type { JSONObject } from '@ai-sdk/provider'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { streamText } from 'ai'
import type { ModelMessage, UIMessage } from 'ai'

import { generateId, ModelConfig } from '#model'
import type { Sessions } from '#sessions'
import type { TetraStore } from '#store'

export interface Runner {
  cancel(requestId: string): void
  execute(sessionId: string, content: string, config?: Partial<ModelConfig>): string
  recover(): void
}

// Map ContentPart[] → UIMessage['parts'] for the message rendering cache.
// Only text and reasoning are handled for now; tool parts added when tools arrive.
function derivePartsFromContent(content: unknown[]): UIMessage['parts'] {
  const parts: UIMessage['parts'] = []

  for (const part of content) {
    if (typeof part !== 'object' || part === null) {
      continue
    }
    // eslint-disable-next-line typescript/no-unsafe-type-assertion -- content is ContentPart[] from AI SDK; object check above makes this safe
    const p = part as Record<string, unknown>
    if (p.type === 'text' && typeof p.text === 'string') {
      parts.push({ text: p.text, type: 'text' })
    } else if (p.type === 'reasoning' && typeof p.text === 'string') {
      parts.push({ text: p.text, type: 'reasoning' })
    }
  }

  return parts
}

export function createRunner(
  tetraStore: TetraStore,
  sessions: Sessions,
  getApiKey: () => string,
): Runner {
  const { indexes, store } = tetraStore

  // In-memory map of active AbortControllers, keyed by requestId
  const controllers = new Map<string, AbortController>()

  async function runStream(
    requestId: string,
    sessionId: string,
    assistantMessageId: string,
    messages: ModelMessage[],
    config: ModelConfig,
    abort: AbortController,
  ): Promise<void> {
    const apiKey = getApiKey()
    const openrouter = createOpenRouter({ apiKey })

    // Accumulate ContentPart[] across steps for the rendering cache
    const accumulatedContent: unknown[] = []

    // eslint-disable-next-line typescript/no-unsafe-type-assertion -- providerOptions is Zod-validated JSON config; Record<string,unknown> satisfies JSONObject at runtime
    const openrouterOptions = config.providerOptions as JSONObject | undefined

    try {
      const result = streamText({
        abortSignal: abort.signal,
        messages,
        model: openrouter(config.modelId),
        onStepFinish: (step) => {
          accumulatedContent.push(...step.content)

          const stepId = generateId.step()

          // Write step + update rendering cache atomically — React sees one state change
          store.transaction(() => {
            store.setRow('steps', stepId, {
              content: step.content,
              createdAt: Date.now(),
              finishReason: step.finishReason,
              messageId: assistantMessageId,
              model: step.model ?? {},
              // Raw cost data lives in providerMetadata.openrouter.usage — read from there
              providerMetadata: step.providerMetadata ?? {},
              requestId,
              responseMessages: step.response.messages,
              sessionId,
              stepNumber: step.stepNumber,
              // Spread to capture normalised fields + any provider-specific fields the SDK adds
              usage: { ...step.usage },
            })
            sessions.setMessageParts(assistantMessageId, derivePartsFromContent(accumulatedContent))
          })
        },
        providerOptions:
          openrouterOptions === undefined ? undefined : { openrouter: openrouterOptions },
        system: config.systemPrompt,
      })

      const totalUsage = await result.totalUsage
      store.setPartialRow('requests', requestId, {
        completedAt: Date.now(),
        status: 'completed',
        totalUsage: {
          inputTokens: totalUsage.inputTokens,
          outputTokens: totalUsage.outputTokens,
          totalTokens: totalUsage.totalTokens,
        },
      })
    } catch (error) {
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

    execute(sessionId, content, config) {
      // Merge session config with any caller overrides, then validate at the boundary
      const validConfig = ModelConfig.parse({ ...sessions.getConfig(sessionId), ...config })

      // Create messages through the sessions API — runner never writes message rows directly
      sessions.addMessage(sessionId, { content, role: 'user' })
      const assistantMessageId = sessions.addMessage(sessionId, { content: '', role: 'assistant' })

      const requestId = generateId.request()
      const abort = new AbortController()
      controllers.set(requestId, abort)

      // Write request row synchronously — CLI reads assistantMessageId from here immediately after
      store.setRow('requests', requestId, {
        assistantMessageId,
        // eslint-disable-next-line typescript/no-unsafe-type-assertion -- ModelConfig stored in TinyBase object cell; double-cast required to bridge domain type to AnyObject
        config: validConfig as unknown as Record<string, unknown>,
        createdAt: Date.now(),
        errorMessage: '',
        sessionId,
        status: 'streaming',
        totalUsage: {},
      })

      // Gather history synchronously before handing off to the async stream.
      // Returns ModelMessage[] — ResponseMessages from steps + user messages.
      const messages = sessions.gatherModelMessages(
        sessionId,
        assistantMessageId,
        validConfig.maxMessages,
      )

      // Fire-and-forget: runStream writes all outcomes (completed/error/cancelled) to TinyBase
      void runStream(requestId, sessionId, assistantMessageId, messages, validConfig, abort)

      return requestId
    },

    recover() {
      // On startup: any request still marked 'streaming' was interrupted — mark as error
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
