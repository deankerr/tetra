import { getHlcFunctions } from 'tinybase/common'

const [getNextHlc] = getHlcFunctions()

export function createIdGenerator(prefix: string): () => string {
  return () => `${prefix}_${getNextHlc()}`
}
