import { Database } from 'bun:sqlite'

import { Command } from 'commander'
import { createSqliteBunPersister } from 'tinybase/persisters/persister-sqlite-bun/with-schemas'

import { ModelConfig } from '#model'

import { createCore } from './index.ts'

// Bootstrap: resolve API key from env, create store with SQLite persistence
async function bootstrap() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (apiKey === undefined || apiKey.length === 0) {
    console.error('Error: OPENROUTER_API_KEY is not set')
    process.exit(1)
  }

  const { indexes, runner, sessions, store } = createCore(() => apiKey)
  runner.recover()

  // Persist store to SQLite — tabular mode maps each TinyBase table to a real SQL table
  const db = new Database('./tetra.db')
  const persister = createSqliteBunPersister(store, db, {
    mode: 'tabular',
    tables: {
      load: {
        messages: { rowIdColumnName: 'id', tableId: 'messages' },
        requests: { rowIdColumnName: 'id', tableId: 'requests' },
        sessions: { rowIdColumnName: 'id', tableId: 'sessions' },
        steps: { rowIdColumnName: 'id', tableId: 'steps' },
      },
      save: {
        messages: { rowIdColumnName: 'id', tableName: 'messages' },
        requests: { rowIdColumnName: 'id', tableName: 'requests' },
        sessions: { rowIdColumnName: 'id', tableName: 'sessions' },
        steps: { rowIdColumnName: 'id', tableName: 'steps' },
      },
    },
  })
  await persister.load()
  await persister.startAutoSave()

  return { indexes, runner, sessions, store }
}

const program = new Command()
program.name('tetra').description('Tetra CLI').version('0.1.0')

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

// tetra config <id> [options] — show or update the session's stored inference config
program
  .command('config <id>')
  .description('Show or update session config')
  .option('-m, --model <modelId>', 'Model to use')
  .option('-s, --system <prompt>', 'System prompt')
  .option('-n, --max-messages <n>', 'Max messages for context window', Number.parseInt)
  .action(
    async (sessionId: string, opts: { maxMessages?: number; model?: string; system?: string }) => {
      const { sessions } = await bootstrap()

      // Merge any provided flags over the current config and persist
      const overrides: Partial<ModelConfig> = {
        ...(opts.maxMessages !== undefined && { maxMessages: opts.maxMessages }),
        ...(opts.model !== undefined && { modelId: opts.model }),
        ...(opts.system !== undefined && { systemPrompt: opts.system }),
      }

      if (Object.keys(overrides).length > 0) {
        const updated = ModelConfig.parse({ ...sessions.getConfig(sessionId), ...overrides })
        sessions.setConfig(sessionId, updated)
      }

      const config = sessions.getConfig(sessionId)
      console.log(`model:        ${config.modelId}`)
      console.log(`system:       ${config.systemPrompt ?? '(none)'}`)
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
      const parts = Array.isArray(msg.parts) ? msg.parts : []
      const text = parts
        .filter(
          (p): p is { type: string; text?: string } =>
            typeof p === 'object' && p !== null && 'type' in p,
        )
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
  .option('-s, --system <prompt>', 'System prompt override')
  .action(async (sessionId: string, message: string, opts: { model?: string; system?: string }) => {
    const { runner, store } = await bootstrap()

    // Only pass flags that were explicitly set — runner merges with the session's stored config
    const config: Partial<ModelConfig> = {
      ...(opts.model !== undefined && { modelId: opts.model }),
      ...(opts.system !== undefined && { systemPrompt: opts.system }),
    }

    // Print text parts incrementally on each UIMessage snapshot from the stream
    let lastLen = 0
    const requestId = runner.execute(sessionId, {
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
          const rawStatus = s.getCell(tableId, rowId, cellId)
          const status = typeof rawStatus === 'string' ? rawStatus : ''
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
  })

try {
  await program.parseAsync(process.argv)
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
