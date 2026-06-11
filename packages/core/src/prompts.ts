import type { TetraTypedStore } from '@tetra/store-schema'

import { createIdGenerator } from '#ids'

// Prompts owns stored prompt records: creation, deletion, and resolving a
// system prompt id to prompt content at run start.
export class Prompts {
  private readonly nextPromptId = createIdGenerator('prpt')
  private readonly typedStore: TetraTypedStore

  constructor({ typedStore }: { typedStore: TetraTypedStore }) {
    this.typedStore = typedStore
  }

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
  // The sessionRunConfigs sweep lives here temporarily; #22 moves it behind the RunConfigs module.
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

  // Resolves a system prompt id to its content; '' is the "no prompt" sentinel.
  resolveContent(systemPromptId: string): string | undefined {
    if (systemPromptId === '') {
      return undefined
    }

    return this.typedStore.tables.prompts.requireEntity(systemPromptId).content
  }
}
