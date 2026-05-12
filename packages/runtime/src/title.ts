export const titleFromText = (text: string, maxLength = 128) => {
  const normalized = text.replaceAll(/\s+/gu, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }
  return `${normalized.slice(0, maxLength - 1)}…`
}
