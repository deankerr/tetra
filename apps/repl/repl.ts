/**
 * Tetra REPL — interactive terminal interface to the runtime.
 *
 * Hosts a WebSocket sync server so the frontend can connect directly.
 * File persistence keeps data across restarts. No separate sync server needed.
 *
 * Usage: bun run --filter @tetra/repl start
 */
import { mkdirSync } from 'node:fs'
import * as readline from 'node:readline/promises'

import { createRuntime } from '@tetra/runtime'
import type { Message, SessionConfig } from '@tetra/runtime'
import type { MergeableStore, Store } from 'tinybase'
import { createFilePersister } from 'tinybase/persisters/persister-file'
import { createWsServer } from 'tinybase/synchronizers/synchronizer-ws-server'
import { WebSocketServer } from 'ws'

// --- ANSI ---

const ESC = '\u001B'
const RESET = `${ESC}[0m`

const dim = (s: string) => `${ESC}[2m${s}${RESET}`
const bold = (s: string) => `${ESC}[1m${s}${RESET}`
const green = (s: string) => `${ESC}[32m${s}${RESET}`
const red = (s: string) => `${ESC}[31m${s}${RESET}`
const cyan = (s: string) => `${ESC}[36m${s}${RESET}`

// --- Runtime ---

const WS_PORT = 8048
const DATA_DIR = './data'

mkdirSync(DATA_DIR, { recursive: true })

const runtime = createRuntime({ runtimeId: 'repl' })

// File persistence
const persister = createFilePersister(
  // oxlint-disable-next-line no-unsafe-type-assertion -- schema-aware store is a superset of Store
  runtime.store as unknown as MergeableStore & Store,
  `${DATA_DIR}/repl.json`,
)
await persister.startAutoLoad()
await persister.startAutoSave()

// WebSocket sync server — frontend connects here
const wss = new WebSocketServer({ port: WS_PORT })
createWsServer(
  wss,
  (pathId) => {
    if (pathId === '') {
      return persister
    }
    console.warn(`[repl] unexpected sync path "${pathId}"`)
    return persister
  },
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- createWsServer error handler
  (error: unknown) => {
    console.error('[repl] sync error:', error)
  },
)

runtime.start()
console.log(dim(`[repl] listening on ws://localhost:${WS_PORT}`))

// --- State ---

let activeSessionId: string | null = null
let config: SessionConfig = {
  modelId: 'anthropic/claude-sonnet-4',
}

// --- Rendering ---

function renderParts(parts: Message['parts']): string {
  return parts
    .map((p) => {
      if (p.type === 'text') {
        return p.text
      }
      if (p.type === 'reasoning') {
        return dim(`[thinking] ${p.text}`)
      }
      return dim(`[${p.type}]`)
    })
    .join('')
}

function renderMessage(msg: Message) {
  const label = msg.role === 'user' ? green('You') : cyan('Assistant')
  return `${label}: ${renderParts(msg.parts)}`
}

// Incremental streaming — prints only new content since last call
function renderPartsDiff(parts: Message['parts'], tracker: number[]) {
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i]
    if (part === undefined) {
      continue
    }

    const rendered = tracker[i] ?? 0

    if (part.type === 'text') {
      const newText = part.text.slice(rendered)
      if (newText.length > 0) {
        process.stdout.write(newText)
        tracker[i] = part.text.length
      }
    } else if (part.type === 'reasoning') {
      const newText = part.text.slice(rendered)
      if (newText.length > 0) {
        process.stdout.write(`${ESC}[2m${newText}${RESET}`)
        tracker[i] = part.text.length
      }
    }
  }
}

// --- Streaming ---

async function waitForCompletion(requestId: string): Promise<string> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping TinyBase's callback-based listener API
  return new Promise((resolve) => {
    // Check if already terminal (race condition guard)
    const current = runtime.store.getCell('requests', requestId, 'status')
    if (current === 'completed' || current === 'error' || current === 'cancelled') {
      resolve(current)
      return
    }

    const listenerId = runtime.store.addCellListener(
      'requests',
      requestId,
      'status',
      (_store, _tableId, _rowId, _cellId, newValue) => {
        if (newValue === 'completed' || newValue === 'error' || newValue === 'cancelled') {
          runtime.store.delListener(listenerId)
          // oxlint-disable-next-line no-unsafe-type-assertion -- status is a known string union
          resolve(newValue as string)
        }
      },
    )
  })
}

async function streamResponse(assistantMessageId: string, requestId: string) {
  // Ctrl+C → cancel
  const onSigint = () => {
    if (activeSessionId !== null) {
      runtime.cancelRequest(activeSessionId)
    }
  }
  process.on('SIGINT', onSigint)

  // Incremental rendering
  const tracker: number[] = []
  process.stdout.write(`\n${cyan('Assistant')}: `)

  const cellListener = runtime.store.addCellListener(
    'messages',
    assistantMessageId,
    'parts',
    () => {
      const msg = runtime.messages.get(assistantMessageId)
      if (msg === null) {
        return
      }
      renderPartsDiff(msg.parts, tracker)
    },
  )

  // Wait for terminal state
  const status = await waitForCompletion(requestId)

  runtime.store.delListener(cellListener)
  process.removeListener('SIGINT', onSigint)

  if (status === 'error') {
    const req = runtime.requests.get(requestId)
    process.stdout.write(`\n${red(`Error: ${req?.errorMessage ?? 'unknown'}`)}`)
  } else if (status === 'cancelled') {
    process.stdout.write(`\n${dim('[cancelled]')}`)
  }

  process.stdout.write('\n\n')
}

// --- Commands ---

async function cmdSend(text: string) {
  if (activeSessionId === null) {
    console.log(red('No active session. Use /new to create one.'))
    return
  }

  const result = runtime.sendMessage(activeSessionId, text, config)
  if (result === null) {
    console.log(red('Failed to send — active request exists or no config available.'))
    return
  }

  await streamResponse(result.assistantMessageId, result.requestId)
}

async function cmdRetry() {
  if (activeSessionId === null) {
    console.log(red('No active session.'))
    return
  }

  const result = runtime.regenerate(activeSessionId, config)
  if (result === null) {
    console.log(red('Nothing to retry — no assistant message found or active request exists.'))
    return
  }

  await streamResponse(result.assistantMessageId, result.requestId)
}

function cmdNew() {
  activeSessionId = runtime.createSession()
  console.log(green(`Created session ${activeSessionId}`))
}

function cmdSessions() {
  const ids = runtime.sessions.listIdsByRecency()
  if (ids.length === 0) {
    console.log(dim('No sessions.'))
    return
  }

  for (const id of ids) {
    const session = runtime.sessions.get(id)
    if (session === null) {
      continue
    }
    const active = id === activeSessionId ? green(' *') : ''
    const title = session.title.length > 0 ? session.title : dim('(untitled)')
    const date = new Date(session.updatedAt).toLocaleString()
    console.log(`  ${id}  ${title}  ${dim(date)}${active}`)
  }
}

function cmdSwitch(arg: string) {
  if (arg === '') {
    console.log(red('Usage: /switch <session-id>'))
    return
  }

  // Prefix match
  const ids = runtime.sessions.listIds()
  const matches = ids.filter((id) => id.startsWith(arg))

  if (matches.length === 0) {
    console.log(red(`No session matching "${arg}"`))
    return
  }
  if (matches.length > 1) {
    console.log(red(`Ambiguous — matches: ${matches.join(', ')}`))
    return
  }

  const [matchedId] = matches
  if (matchedId === undefined) {
    return
  }
  activeSessionId = matchedId
  const session = runtime.sessions.get(activeSessionId)
  const titleSuffix = session !== null && session.title.length > 0 ? ` — ${session.title}` : ''
  console.log(`${green(`Switched to ${activeSessionId}`)}${titleSuffix}`)

  // Show last few messages as context
  const messages = runtime.messages.listRecentBySession(activeSessionId, 4)
  if (messages.length > 0) {
    console.log()
    for (const msg of messages) {
      console.log(`  ${renderMessage(msg)}`)
    }
    console.log()
  }
}

function cmdDelete(arg: string) {
  const target = arg === '' ? activeSessionId : arg
  if (target === null || target === '') {
    console.log(red('No session to delete.'))
    return
  }

  // Prefix match
  const ids = runtime.sessions.listIds()
  const matches = ids.filter((id) => id.startsWith(target))

  if (matches.length === 0) {
    console.log(red(`No session matching "${target}"`))
    return
  }
  if (matches.length > 1) {
    console.log(red(`Ambiguous — matches: ${matches.join(', ')}`))
    return
  }

  const [deleteId] = matches
  if (deleteId === undefined) {
    return
  }
  runtime.deleteSession(deleteId)
  console.log(dim(`Deleted ${deleteId}`))

  if (deleteId === activeSessionId) {
    activeSessionId = null
    const recent = runtime.sessions.listIdsByRecency()
    if (recent.length > 0) {
      const [nextId] = recent
      if (nextId !== undefined) {
        activeSessionId = nextId
        console.log(dim(`Switched to ${activeSessionId}`))
      }
    }
  }
}

function cmdHistory(arg: string) {
  if (activeSessionId === null) {
    console.log(red('No active session.'))
    return
  }

  const limit = Number.parseInt(arg, 10) || 20
  const messages = runtime.messages.listRecentBySession(activeSessionId, limit)

  if (messages.length === 0) {
    console.log(dim('No messages in this session.'))
    return
  }

  console.log()
  for (const msg of messages) {
    console.log(renderMessage(msg))
    console.log()
  }
}

function cmdModel(arg: string) {
  if (arg === '') {
    console.log(`Model: ${bold(config.modelId)}`)
    return
  }
  config = { ...config, modelId: arg }
  console.log(green(`Model → ${arg}`))
}

function cmdSystem(arg: string) {
  if (arg === '') {
    const prompt = config.systemPrompt
    console.log(
      prompt !== undefined && prompt.length > 0
        ? `System prompt: ${prompt}`
        : dim('No system prompt set.'),
    )
    return
  }

  if (arg === 'clear') {
    const { systemPrompt: _, ...rest } = config
    config = rest
    console.log(dim('System prompt cleared.'))
  } else {
    config = { ...config, systemPrompt: arg }
    console.log(green('System prompt set.'))
  }
}

function cmdKey(arg: string) {
  if (arg === '') {
    const current = runtime.store.getValue('openrouterApiKey')
    if (typeof current === 'string' && current.length > 0) {
      console.log(`API key: ${current.slice(0, 8)}...${current.slice(-4)}`)
    } else {
      console.log(red('No API key set.'))
    }
    return
  }

  runtime.store.setValue('openrouterApiKey', arg)
  console.log(green('API key set.'))
}

function cmdCancel() {
  if (activeSessionId === null) {
    return
  }
  runtime.cancelRequest(activeSessionId)
  console.log(dim('[cancelled]'))
}

function cmdConfig() {
  const apiKey = runtime.store.getValue('openrouterApiKey')
  const keyDisplay =
    typeof apiKey === 'string' && apiKey.length > 0
      ? `${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`
      : red('not set')

  const systemDisplay =
    config.systemPrompt !== undefined && config.systemPrompt.length > 0
      ? config.systemPrompt.slice(0, 80)
      : dim('(none)')

  console.log(`  Model:    ${bold(config.modelId)}`)
  console.log(`  System:   ${systemDisplay}`)
  console.log(`  API Key:  ${keyDisplay}`)
  console.log(`  Session:  ${activeSessionId ?? dim('none')}`)
  if (config.maxMessages !== undefined) {
    console.log(`  Max msgs: ${config.maxMessages}`)
  }
  if (config.providerOptions !== undefined) {
    console.log(`  Options:  ${JSON.stringify(config.providerOptions)}`)
  }
}

function cmdMax(arg: string) {
  if (arg === '' || arg === 'clear') {
    const { maxMessages: _, ...rest } = config
    config = rest
    console.log(dim('Max messages cleared (sending all).'))
    return
  }

  const n = Number.parseInt(arg, 10)
  if (Number.isNaN(n) || n < 1) {
    console.log(red('Usage: /max <positive-integer> or /max clear'))
    return
  }

  config = { ...config, maxMessages: n }
  console.log(green(`Max messages → ${n}`))
}

function cmdTitle(arg: string) {
  if (activeSessionId === null) {
    console.log(red('No active session.'))
    return
  }

  if (arg === '') {
    const session = runtime.sessions.get(activeSessionId)
    const title = session?.title
    console.log(title !== undefined && title.length > 0 ? `Title: ${title}` : dim('(untitled)'))
    return
  }

  runtime.updateSession(activeSessionId, arg)
  console.log(green(`Title → ${arg}`))
}

function cmdHelp() {
  console.log(`
${bold('Tetra REPL')} — chat with LLMs via the runtime engine

${bold('Commands:')}
  /new              Create a new session
  /sessions         List all sessions
  /switch <id>      Switch session (prefix match)
  /delete [id]      Delete session (current if omitted)
  /history [n]      Show recent messages (default: 20)
  /title [text]     Show or set session title
  /model [id]       Show or set model (e.g. anthropic/claude-sonnet-4)
  /system [prompt]  Show/set system prompt (/system clear to remove)
  /max [n]          Set max context messages (/max clear for unlimited)
  /key [key]        Show or set OpenRouter API key
  /cancel           Cancel active request
  /retry            Regenerate last response
  /config           Show current configuration
  /help             Show this help
  /quit             Exit

${bold('Shortcuts:')} /ls /sw /del /h /m /sys /q

${bold('Tips:')}
  Type any text to send a message.
  Press Ctrl+C during streaming to cancel.
  Sessions persist across restarts.
`)
}

// --- Main ---

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: process.stdin.isTTY ?? false,
})

// Startup: resume most recent session if one exists
const recentSessions = runtime.sessions.listIdsByRecency()
const [resumeId] = recentSessions
if (resumeId === undefined) {
  console.log(dim('No sessions found. Use /new to create one.'))
} else {
  activeSessionId = resumeId
  const session = runtime.sessions.get(activeSessionId)
  const titleSuffix = session !== null && session.title.length > 0 ? ` — ${session.title}` : ''
  console.log(`${dim(`Resumed ${activeSessionId}`)}${titleSuffix}`)
}

console.log(dim('Type /help for commands.\n'))

// REPL loop
while (true) {
  const label = activeSessionId === null ? 'none' : activeSessionId.slice(0, 9)
  const prompt = `${dim('tetra')}:${label}> `

  let input: string
  try {
    input = await rl.question(prompt)
  } catch {
    break
  }

  const trimmed = input.trim()
  if (trimmed === '') {
    continue
  }

  // Commands
  if (trimmed.startsWith('/')) {
    const spaceIdx = trimmed.indexOf(' ')
    const cmd = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)
    const arg = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()

    switch (cmd) {
      case '/new': {
        cmdNew()
        break
      }
      case '/sessions':
      case '/ls': {
        cmdSessions()
        break
      }
      case '/switch':
      case '/sw': {
        cmdSwitch(arg)
        break
      }
      case '/delete':
      case '/del': {
        cmdDelete(arg)
        break
      }
      case '/history':
      case '/h': {
        cmdHistory(arg)
        break
      }
      case '/title': {
        cmdTitle(arg)
        break
      }
      case '/model':
      case '/m': {
        cmdModel(arg)
        break
      }
      case '/system':
      case '/sys': {
        cmdSystem(arg)
        break
      }
      case '/max': {
        cmdMax(arg)
        break
      }
      case '/key': {
        cmdKey(arg)
        break
      }
      case '/cancel': {
        cmdCancel()
        break
      }
      case '/retry': {
        await cmdRetry()
        break
      }
      case '/config': {
        cmdConfig()
        break
      }
      case '/help':
      case '/?': {
        cmdHelp()
        break
      }
      case '/quit':
      case '/q': {
        runtime.stop()
        rl.close()
        // oxlint-disable-next-line no-process-exit
        process.exit(0)
        break // unreachable but required by no-fallthrough
      }
      default: {
        console.log(`${red(`Unknown command: ${cmd}`)}${dim(' — /help for commands')}`)
      }
    }
    continue
  }

  // Send message
  await cmdSend(trimmed)
}

// EOF cleanup
runtime.stop()
console.log(dim('\n[repl] stopped'))
