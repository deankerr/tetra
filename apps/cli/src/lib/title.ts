const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'vs',
  'with',
])

export function titleFromMessage(message: string): string {
  // Use the first meaningful line so piped content does not create paragraph-sized titles.
  const firstLine = message
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line !== '')

  if (firstLine === undefined) {
    return 'Untitled Session'
  }

  // Normalize whitespace and trim to a compact, list-friendly title.
  const compact = firstLine.replaceAll(/\s+/gu, ' ').slice(0, 80)
  return compact
    .split(' ')
    .map((word, index) => {
      const lower = word.toLowerCase()
      if (index > 0 && SMALL_WORDS.has(lower)) {
        return lower
      }
      return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`
    })
    .join(' ')
}
