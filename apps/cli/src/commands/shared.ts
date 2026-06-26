import type { Run, RunConfig } from '@tetra/core'
import type { LibraryRows } from '@tetra/schemas/library'

import type { CliAppContext } from '../app'

interface MessagePart {
  text?: string
  type: string
}

export interface ConfigOptions {
  maxMessages?: number
  model?: string
  prompt?: string
}

export async function readTextArgument(parts: string[]): Promise<string> {
  // A lone omitted argument reads piped stdin, while "-" marks stdin explicitly.
  const shouldReadStdin = parts.includes('-') || (!process.stdin.isTTY && parts.length === 0)
  const stdin = shouldReadStdin ? await Bun.stdin.text() : ''

  // Compose shell words and stdin in the same order the user supplied them.
  const argvText = parts
    .filter((part) => part !== '-')
    .join(' ')
    .trim()
  return [argvText, stdin].filter((part) => part.trim() !== '').join('\n\n')
}

export function configFromOptions(options: ConfigOptions): Partial<RunConfig> {
  // Only explicit flags become durable RunConfig edits.
  return {
    ...(options.maxMessages !== undefined && { maxMessages: options.maxMessages }),
    ...(options.model !== undefined && { modelId: options.model }),
    ...(options.prompt !== undefined && { systemPromptId: options.prompt }),
  }
}

export function requireActiveSessionId(ctx: CliAppContext): string {
  // The CLI active session is local workspace state, not a synchronized session field.
  const sessionId = ctx.workspace.getActiveSessionId()
  if (sessionId === undefined) {
    throw new Error('No active session. Run: tetra sessions use <id>')
  }

  return sessionId
}

export function requireSession(ctx: CliAppContext, sessionId: string): void {
  // Use the typed table boundary so missing ids fail loudly and consistently.
  ctx.stores.library.typedStore.tables.sessions.requireEntity(sessionId)
}

export function resolveSessionId(ctx: CliAppContext, sessionId: string | undefined): string {
  // Commands that accept an optional session id fall back to the explicit CLI selection.
  const resolvedSessionId = sessionId ?? requireActiveSessionId(ctx)
  requireSession(ctx, resolvedSessionId)
  return resolvedSessionId
}

export function printRunConfig(ctx: CliAppContext, sessionId: string): void {
  // Session config is colocated with the durable session row.
  const { config } = ctx.stores.library.typedStore.tables.sessions.requireEntity(sessionId)
  console.log(`session:      ${sessionId}`)
  console.log(`model:        ${config.modelId}`)
  console.log(`prompt:       ${config.systemPromptId === '' ? '(none)' : config.systemPromptId}`)
  console.log(`maxMessages:  ${config.maxMessages === 0 ? '(none)' : config.maxMessages}`)
}

export function formatSession(session: LibraryRows['sessions'], activeSessionId?: string): string {
  // Keep the list scan-friendly without hiding the full durable id.
  const marker = session.id === activeSessionId ? '*' : ' '
  const title = session.title.trim() || '(untitled)'
  const updated = new Date(session.updatedAt).toLocaleString()
  return `${marker} ${session.id}  ${title}  ${updated}`
}

export function printMessages(messages: LibraryRows['messages'][]): void {
  // Render only human-readable text-ish parts from stored UIMessage parts.
  for (const message of messages) {
    const parts = message.parts as MessagePart[]
    const text = parts
      .filter((part) => part.type === 'text' || part.type === 'reasoning')
      .map((part) => part.text ?? '')
      .join('')
    console.log(`\n[${message.role} ${message.id}]\n${text}`)
  }
}

export async function waitForRun(run: Run): Promise<void> {
  // The CLI owns this live Run object, so it waits on process-local liveness.
  await run.done
  if (run.status === 'completed') {
    return
  }

  // Run terminal errors are persisted already; this turns them into a CLI failure.
  if (run.error instanceof Error) {
    throw run.error
  }
  throw new Error(run.error === null ? run.status : JSON.stringify(run.error))
}
