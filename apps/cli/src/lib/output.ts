import type { LibraryRows as Rows } from '@tetra/stores/library'

export function formatSession(session: Rows['sessions'], activeSessionId?: string): string {
  // Keep the list scan-friendly: active marker, stable short id, title, and update time.
  const marker = session.id === activeSessionId ? '*' : ' '
  const title = session.title.trim() ?? '(untitled)'
  const updated = new Date(session.updatedAt).toLocaleString()
  return `${marker} ${session.id}  ${title}  ${updated}`
}

export function printMessages(messages: Rows['messages'][]): void {
  // Render only human-readable text-ish parts from stored UIMessage parts.
  for (const msg of messages) {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- parts are stored as UIMessage parts; this renderer only needs text-bearing fields
    const parts = msg.parts as { text?: string; type: string }[]
    const text = parts
      .filter((part) => part.type === 'text' || part.type === 'reasoning')
      .map((part) => part.text ?? '')
      .join('')
    console.log(`\n[${msg.role} ${msg.id}]\n${text}`)
  }
}
