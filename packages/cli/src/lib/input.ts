export interface ReadMessageOptions {
  message?: string
  parts: string[]
}

export async function readMessage({ message, parts }: ReadMessageOptions): Promise<string> {
  // Treat "-" as an explicit stdin placeholder inside the positional prompt.
  const shouldReadStdin = parts.includes('-') || (!process.stdin.isTTY && parts.length === 0)
  const stdin = shouldReadStdin ? await Bun.stdin.text() : ''

  // Compose prefix, argv, and stdin in the order a shell user would expect.
  const argvText = parts
    .filter((part) => part !== '-')
    .join(' ')
    .trim()
  return [message, argvText, stdin]
    .filter((part) => part !== undefined && part.trim() !== '')
    .join('\n\n')
}
