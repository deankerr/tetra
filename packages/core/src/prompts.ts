import type { LibraryDb } from '@tetra/schemas/library'

import { createIdGenerator } from '#ids'
import type { RunConfigs } from '#run-configs'

// Prompts owns stored prompt records: creation, deletion, and resolving a
// system prompt id to prompt content at run start.
export class Prompts {
  private readonly nextPromptId = createIdGenerator('prpt')
  private readonly runConfigs: RunConfigs
  private readonly library: LibraryDb

  constructor({ library, runConfigs }: { library: LibraryDb; runConfigs: RunConfigs }) {
    this.runConfigs = runConfigs
    this.library = library
  }

  createPrompt(args: { content?: string; label?: string } = {}): string {
    const promptId = this.nextPromptId()
    const now = Date.now()

    this.library.prompts.create(promptId, {
      content: args.content ?? '',
      createdAt: now,
      label: args.label ?? '',
      updatedAt: now,
    })

    return promptId
  }

  updatePrompt(args: { content?: string; label?: string; promptId: string }): void {
    const hasContent = args.content !== undefined
    const hasLabel = args.label !== undefined
    if (!hasContent && !hasLabel) {
      throw new Error('No prompt fields provided')
    }

    // Prompt edits preserve creation metadata and touch updatedAt with the edited cells.
    this.library.prompts.update(args.promptId, {
      ...(hasContent && { content: args.content }),
      ...(hasLabel && { label: args.label }),
      updatedAt: Date.now(),
    })
  }

  // Removes the prompt and asks RunConfigs to unlink it from session configs.
  // Batches nest, so the unlink merges into this batch.
  deletePrompt(promptId: string): void {
    this.library.prompts.require(promptId)

    this.library.batch(() => {
      this.runConfigs.unlinkPrompt(promptId)
      this.library.prompts.delete(promptId)
    })
  }

  // Resolves a system prompt id to its content; '' is the "no prompt" sentinel.
  resolveContent(systemPromptId: string): string | undefined {
    if (systemPromptId === '') {
      return undefined
    }

    return this.library.prompts.require(systemPromptId).content
  }
}
