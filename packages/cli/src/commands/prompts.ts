import type { Command } from 'commander'

import type { bootstrap } from '../bootstrap'

type CliContext = Awaited<ReturnType<typeof bootstrap>>

export function registerPromptCommands(
  program: Command,
  getContext: () => Promise<CliContext>,
): void {
  // List stored system prompts.
  program
    .command('prompts')
    .description('List stored prompts')
    .action(async () => {
      const ctx = await getContext()
      const prompts = ctx.store.listPrompts()

      if (prompts.length === 0) {
        console.log('No prompts. Run: tetra prompt create [content]')
        return
      }

      for (const prompt of prompts) {
        const label = prompt.label.trim() ?? prompt.content.trim().slice(0, 60) ?? '(empty)'
        console.log(`${prompt.id}  ${label}`)
      }
    })

  // Prompt subcommands manage reusable system prompt records.
  const prompt = program.command('prompt').description('Manage stored prompts')

  prompt
    .command('create')
    .argument('[content]', 'Prompt content')
    .option('-l, --label <label>', 'Prompt label')
    .description('Create a stored prompt')
    .action(async (content: string | undefined, opts: { label?: string }) => {
      const ctx = await getContext()
      console.log(ctx.store.createPrompt({ content: content ?? '', label: opts.label ?? '' }))
    })

  prompt
    .command('show <id>')
    .description('Show a stored prompt')
    .action(async (promptId: string) => {
      const ctx = await getContext()
      const row = ctx.store.getPrompt(promptId)
      console.log(`id:      ${row.id}`)
      console.log(`label:   ${row.label ?? '(none)'}`)
      console.log(`content:\n${row.content}`)
    })

  prompt
    .command('update <id>')
    .argument('[content]', 'Prompt content')
    .option('-l, --label <label>', 'Prompt label')
    .description('Update a stored prompt')
    .action(async (promptId: string, content: string | undefined, opts: { label?: string }) => {
      const ctx = await getContext()
      ctx.store.updatePrompt(promptId, {
        ...(content !== undefined && { content }),
        ...(opts.label !== undefined && { label: opts.label }),
      })
      console.log(promptId)
    })

  prompt
    .command('delete <id>')
    .description('Delete a stored prompt')
    .action(async (promptId: string) => {
      const ctx = await getContext()
      ctx.store.deletePrompt(promptId)
      console.log(promptId)
    })
}
