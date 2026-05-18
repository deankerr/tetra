import { generateId } from '#model'
import type { Prompt } from '#model'
import type { TetraStore } from '#store'

export interface Prompts {
  create(args?: { content?: string; label?: string }): string
  delete(promptId: string): void
  get(promptId: string): Prompt
  list(): Prompt[]
  setContent(promptId: string, content: string): void
  setLabel(promptId: string, label: string): void
  update(promptId: string, patch: { content?: string; label?: string }): void
}

export function createPrompts({ store }: TetraStore): Prompts {
  function readPrompt(promptId: string): Prompt {
    if (!store.hasRow('prompts', promptId)) {
      throw new Error(`Prompt not found: ${promptId}`)
    }
    const row = store.getRow('prompts', promptId)
    return {
      content: row.content,
      id: promptId,
      label: row.label,
    }
  }

  return {
    create({ content = '', label = '' } = {}) {
      const promptId = generateId.prompt()
      store.setRow('prompts', promptId, {
        content,
        label,
      })
      console.log('[prompts] create', { promptId })
      return promptId
    },

    delete(promptId) {
      store.transaction(() => {
        for (const sessionId of store.getRowIds('sessions')) {
          const rawConfig = store.getCell('sessions', sessionId, 'config')
          if (
            typeof rawConfig === 'object' &&
            rawConfig !== null &&
            'systemPromptId' in rawConfig &&
            rawConfig.systemPromptId === promptId
          ) {
            const { systemPromptId: _systemPromptId, ...config } = rawConfig
            store.setPartialRow('sessions', sessionId, {
              config,
              updatedAt: Date.now(),
            })
          }
        }

        store.delRow('prompts', promptId)
      })
      console.log('[prompts] delete', { promptId })
    },

    get(promptId) {
      return readPrompt(promptId)
    },

    list() {
      return store
        .getRowIds('prompts')
        .map(readPrompt)
        .toSorted((a, b) => a.id.localeCompare(b.id))
    },

    setContent(promptId, content) {
      store.setCell('prompts', promptId, 'content', content)
      console.log('[prompts] setContent', { promptId })
    },

    setLabel(promptId, label) {
      store.setCell('prompts', promptId, 'label', label)
      console.log('[prompts] setLabel', { promptId })
    },

    update(promptId, patch) {
      store.setPartialRow('prompts', promptId, patch)
      console.log('[prompts] update', { promptId })
    },
  }
}
