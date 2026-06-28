import type { Command } from 'commander'

import type { CliAppContext } from '../app'
import { readTextArgument } from './shared'

interface PromptOptions {
  label?: string
}

export function registerPromptCommands(
  program: Command,
  getContext: () => Promise<CliAppContext>,
): void {
  // Stored prompts are reusable system prompt records.
  const prompts = program.command('prompts').description('Manage stored prompts')

  // List stored prompt records.
  prompts
    .command('list')
    .description('List stored prompts')
    .action(async () => {
      const ctx = await getContext()
      const rows = ctx.stores.library.boundStore.tables.prompts
        .listEntities()
        .toSorted((a, b) => a.id.localeCompare(b.id))

      if (rows.length === 0) {
        console.log('No prompts. Run: tetra prompts create "Be terse."')
        return
      }

      for (const prompt of rows) {
        const label = prompt.label.trim() || prompt.content.trim().slice(0, 60) || '(empty)'
        console.log(`${prompt.id}  ${label}`)
      }
    })

  // Create a prompt from argv or stdin.
  prompts
    .command('create')
    .argument('[content...]', 'Prompt content, or "-" to read stdin')
    .option('-l, --label <label>', 'Prompt label')
    .description('Create a stored prompt')
    .action(async (parts: string[], options: PromptOptions) => {
      const ctx = await getContext()
      const content = await readTextArgument(parts)
      const promptId = ctx.prompts.createPrompt({
        content,
        label: options.label ?? '',
      })
      console.log(promptId)
    })

  // Show a prompt record.
  prompts
    .command('show <id>')
    .description('Show a stored prompt')
    .action(async (promptId: string) => {
      const ctx = await getContext()
      const row = ctx.stores.library.boundStore.tables.prompts.requireEntity(promptId)
      console.log(`id:      ${row.id}`)
      console.log(`label:   ${row.label || '(none)'}`)
      console.log(`content:\n${row.content}`)
    })

  // Update prompt content and label fields explicitly.
  prompts
    .command('update <id>')
    .argument('[content...]', 'Prompt content, or "-" to read stdin')
    .option('-l, --label <label>', 'Prompt label')
    .description('Update a stored prompt')
    .action(async (promptId: string, parts: string[], options: PromptOptions) => {
      const ctx = await getContext()
      const content = await readTextArgument(parts)
      const update = {
        ...(content !== '' && { content }),
        ...(options.label !== undefined && { label: options.label }),
        updatedAt: Date.now(),
      }
      if (!('content' in update) && !('label' in update)) {
        throw new Error('No prompt fields provided')
      }

      ctx.stores.library.boundStore.tables.prompts.updateRow(promptId, update)
      console.log(promptId)
    })

  // Delete a prompt and unlink it from session configs.
  prompts
    .command('delete <id>')
    .description('Delete a stored prompt')
    .action(async (promptId: string) => {
      const ctx = await getContext()
      ctx.prompts.deletePrompt(promptId)
      console.log(promptId)
    })
}
