import type { TetraTypedStore } from '@tetra/store-schema'

import { createIdGenerator } from '#ids'

export class Helpers {
  readonly typedStore: TetraTypedStore

  private readonly nextPromptId = createIdGenerator('prpt')

  constructor({ typedStore }: { typedStore: TetraTypedStore }) {
    this.typedStore = typedStore
  }

  // ——— Prompts ———

  createPrompt(args: { content?: string; label?: string } = {}): string {
    const promptId = this.nextPromptId()
    const now = Date.now()

    this.typedStore.tables.prompts.setRow(promptId, {
      content: args.content ?? '',
      createdAt: now,
      label: args.label ?? '',
      updatedAt: now,
    })

    return promptId
  }

  // Removes the prompt and unlinks it from any sessions that reference it.
  deletePrompt(promptId: string): void {
    this.typedStore.tables.prompts.requireEntity(promptId)

    this.typedStore.transaction(() => {
      for (const sessionId of this.typedStore.tables.sessions.getRowIds()) {
        if (
          this.typedStore.tables.sessionRunConfigs.getCell(sessionId, 'systemPromptId') === promptId
        ) {
          this.typedStore.tables.sessionRunConfigs.setCell(sessionId, 'systemPromptId', '')
        }
      }

      this.typedStore.tables.prompts.deleteRow(promptId)
    })
  }
}
