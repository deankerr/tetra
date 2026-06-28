import type { LibraryStoreInstance, LibraryBoundStore } from '@tetra/schemas/library'

import { createIdGenerator } from '#ids'
import type { RunConfigs } from '#run-configs'

// Prompts owns stored prompt records: creation, deletion, and resolving a
// system prompt id to prompt content at run start.
export class Prompts {
  private readonly nextPromptId = createIdGenerator('prpt')
  private readonly runConfigs: RunConfigs
  private readonly boundStore: LibraryBoundStore

  constructor({
    libraryStore,
    runConfigs,
  }: {
    libraryStore: LibraryStoreInstance
    runConfigs: RunConfigs
  }) {
    this.runConfigs = runConfigs
    this.boundStore = libraryStore.boundStore
  }

  createPrompt(args: { content?: string; label?: string } = {}): string {
    const promptId = this.nextPromptId()
    const now = Date.now()

    this.boundStore.tables.prompts.setRow(promptId, {
      content: args.content ?? '',
      createdAt: now,
      label: args.label ?? '',
      updatedAt: now,
    })

    return promptId
  }

  // Removes the prompt and asks RunConfigs to unlink it from session configs.
  // TinyBase transactions nest, so the unlink merges into this transaction.
  deletePrompt(promptId: string): void {
    this.boundStore.tables.prompts.requireEntity(promptId)

    this.boundStore.transaction(() => {
      this.runConfigs.unlinkPrompt(promptId)
      this.boundStore.tables.prompts.deleteRow(promptId)
    })
  }

  // Resolves a system prompt id to its content; '' is the "no prompt" sentinel.
  resolveContent(systemPromptId: string): string | undefined {
    if (systemPromptId === '') {
      return undefined
    }

    return this.boundStore.tables.prompts.requireEntity(systemPromptId).content
  }
}
