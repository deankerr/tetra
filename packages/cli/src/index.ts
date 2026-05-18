import { ModelConfig } from '@tetra/core'
import { Command } from 'commander'

import { bootstrap } from './bootstrap'

const program = new Command()
program.name('tetra').description('Tetra CLI').version('0.1.0')

// tetra models — list available text-output models from OpenRouter
program
  .command('models')
  .description('List available models from OpenRouter')
  .option('-p, --provider <name>', 'Filter by provider name (case-insensitive)')
  .action(async (opts: { provider?: string }) => {
    const { models, store } = await bootstrap()
    await models.refresh({ force: true })

    const table = store.getTable('languageModels')
    const rows = Object.entries(table)
      .map(([id, row]) => ({
        contextLength: row.contextLength,
        createdAt: row.createdAt,
        id,
        inputModalities: row.inputModalities.split(',').filter(Boolean),
        name: row.name,
        outputModalities: row.outputModalities.split(',').filter(Boolean),
        provider: row.providerName || row.provider,
      }))
      // Only text-output models
      .filter((r) => r.outputModalities.includes('text'))
      // Optional provider filter
      .filter(
        (r) =>
          opts.provider === undefined ||
          r.provider.toLowerCase().includes(opts.provider.toLowerCase()),
      )
      // Sort: newest first
      .toSorted((a, b) => b.createdAt - a.createdAt)

    if (rows.length === 0) {
      console.log('No models found.')
      return
    }

    for (const r of rows) {
      const ctx = r.contextLength > 0 ? `${(r.contextLength / 1000).toFixed(0)}k` : '?'
      const mods = r.inputModalities.join('+') || 'text'
      console.log(`${r.id.padEnd(55)} ${r.name.padEnd(45)} ctx:${ctx.padStart(5)}  in:${mods}`)
    }
  })

// tetra sessions — list all sessions
program
  .command('sessions')
  .description('List all sessions')
  .action(async () => {
    const { sessions } = await bootstrap()
    const list = sessions.list()

    if (list.length === 0) {
      console.log('No sessions. Run: tetra new [title]')
      return
    }

    for (const s of list) {
      const date = new Date(s.createdAt).toLocaleString()
      console.log(`${s.id}  ${s.title || '(untitled)'}  ${date}`)
    }
  })

// tetra new [title] — create a session
program
  .command('new [title]')
  .description('Create a new session')
  .action(async (title?: string) => {
    const { sessions } = await bootstrap()
    const id = sessions.create(title)
    console.log(id)
  })

// tetra prompts — list stored system prompts
program
  .command('prompts')
  .description('List stored prompts')
  .action(async () => {
    const { prompts } = await bootstrap()
    const list = prompts.list()

    if (list.length === 0) {
      console.log('No prompts. Run: tetra prompt create [content]')
      return
    }

    for (const prompt of list) {
      const label = prompt.label.trim() || prompt.content.trim().slice(0, 60) || '(empty)'
      console.log(`${prompt.id}  ${label}`)
    }
  })

// tetra prompt <subcommand> — manage stored system prompts
const prompt = program.command('prompt').description('Manage stored prompts')

prompt
  .command('create [content]')
  .description('Create a stored prompt')
  .option('-l, --label <label>', 'Prompt label')
  .action(async (content: string | undefined, opts: { label?: string }) => {
    const { prompts } = await bootstrap()
    const id = prompts.create({ content: content ?? '', label: opts.label ?? '' })
    console.log(id)
  })

prompt
  .command('show <id>')
  .description('Show a stored prompt')
  .action(async (promptId: string) => {
    const { prompts } = await bootstrap()
    const row = prompts.get(promptId)
    console.log(`id:      ${row.id}`)
    console.log(`label:   ${row.label || '(none)'}`)
    console.log(`content:\n${row.content}`)
  })

prompt
  .command('update <id> [content]')
  .description('Update a stored prompt')
  .option('-l, --label <label>', 'Prompt label')
  .action(async (promptId: string, content: string | undefined, opts: { label?: string }) => {
    const { prompts } = await bootstrap()
    prompts.update(promptId, {
      ...(content !== undefined && { content }),
      ...(opts.label !== undefined && { label: opts.label }),
    })
    console.log(promptId)
  })

prompt
  .command('delete <id>')
  .description('Delete a stored prompt')
  .action(async (promptId: string) => {
    const { prompts } = await bootstrap()
    prompts.delete(promptId)
    console.log(promptId)
  })

// tetra config <id> [options] — show or update the session's stored inference config
program
  .command('config <id>')
  .description('Show or update session config')
  .option('-m, --model <modelId>', 'Model to use')
  .option('-p, --prompt <promptId>', 'Stored system prompt id')
  .option('--no-prompt', 'Clear the stored system prompt')
  .option('-n, --max-messages <n>', 'Max messages for context window', Number.parseInt)
  .action(
    async (
      sessionId: string,
      opts: { maxMessages?: number; model?: string; prompt?: false | string },
    ) => {
      const { sessions } = await bootstrap()

      // Merge any provided flags over the current config and persist
      const overrides: Partial<ModelConfig> = {
        ...(opts.maxMessages !== undefined && { maxMessages: opts.maxMessages }),
        ...(opts.model !== undefined && { modelId: opts.model }),
        ...(typeof opts.prompt === 'string' && { systemPromptId: opts.prompt }),
      }

      if (Object.keys(overrides).length > 0 || opts.prompt === false) {
        const next = { ...sessions.getConfig(sessionId), ...overrides }
        if (opts.prompt === false) {
          delete next.systemPromptId
        }
        const updated = ModelConfig.parse(next)
        sessions.setConfig(sessionId, updated)
      }

      const config = sessions.getConfig(sessionId)
      console.log(`model:        ${config.modelId}`)
      console.log(`prompt:       ${config.systemPromptId ?? '(none)'}`)
      console.log(`maxMessages:  ${config.maxMessages ?? '(none)'}`)
    },
  )

// tetra history <id> — print message history for a session
program
  .command('history <id>')
  .description('Print message history for a session')
  .action(async (sessionId: string) => {
    const { sessions } = await bootstrap()
    const messages = sessions.getMessages(sessionId)

    if (messages.length === 0) {
      console.log('No messages in this session.')
      return
    }

    for (const msg of messages) {
      // eslint-disable-next-line typescript/no-unsafe-type-assertion -- parts stored as UIMessage['parts']; schema guarantees the shape
      const parts = msg.parts as { text?: string; type: string }[]
      const text = parts
        .filter((p) => p.type === 'text' || p.type === 'reasoning')
        .map((p) => p.text ?? '')
        .join('')
      console.log(`\n[${msg.role}]\n${text}`)
    }
  })

// tetra chat <id> <message> [--model x] — send a message and stream the response
program
  .command('chat <id> <message>')
  .description('Send a message and stream the response')
  .option('-m, --model <modelId>', 'Model to use')
  .option('-p, --prompt <promptId>', 'Stored system prompt id override')
  .option('--no-prompt', 'Send without a system prompt')
  .action(
    async (
      sessionId: string,
      message: string,
      opts: { model?: string; prompt?: false | string },
    ) => {
      const { runner, store } = await bootstrap()

      // Only pass flags that were explicitly set — runner merges with the session's stored config
      const config: Partial<ModelConfig> = {
        ...(opts.model !== undefined && { modelId: opts.model }),
        ...(typeof opts.prompt === 'string' && { systemPromptId: opts.prompt }),
      }

      if (opts.prompt === false) {
        config.systemPromptId = undefined
      }

      // Print text parts incrementally on each UIMessage snapshot from the stream
      let lastLen = 0
      const { requestId } = runner.execute(sessionId, {
        config,
        content: message,
        onSnapshot: (msg) => {
          const text = msg.parts
            .filter((p): p is { text: string; type: 'text' } => p.type === 'text')
            .map((p) => p.text)
            .join('')
          process.stdout.write(text.slice(lastLen))
          lastLen = text.length
        },
      })

      // eslint-disable-next-line promise/avoid-new -- TinyBase listeners are callback-based; promisification is required to await completion in a CLI context
      await new Promise<void>((resolve, reject) => {
        const reqListenerId = store.addCellListener(
          'requests',
          requestId,
          'status',
          (s, tableId, rowId, cellId) => {
            const status = s.getCell(tableId, rowId, cellId)
            if (status === 'completed') {
              store.delListener(reqListenerId)
              resolve()
            } else if (status === 'error' || status === 'cancelled') {
              store.delListener(reqListenerId)
              const rawErr = s.getCell(tableId, rowId, 'errorMessage')
              reject(new Error(typeof rawErr === 'string' ? rawErr : status))
            }
          },
        )
      })

      console.log()
    },
  )

try {
  await program.parseAsync(process.argv)
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
