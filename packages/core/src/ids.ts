import { customAlphabet } from 'nanoid'

const alphanumericId = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
  12,
)

export function createIdGenerator(prefix: string): () => string {
  return () => `${prefix}_${alphanumericId()}`
}
