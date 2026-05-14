import { getHlcFunctions } from 'tinybase/common'

// Single shared HLC instance so the counter advances monotonically across all tables.
const [getNextHlc] = getHlcFunctions()

const prefixed = (prefix: string) => () => `${prefix}_${getNextHlc()}`

export const generateId = {
  message: prefixed('mesg'),
  request: prefixed('rqst'),
  session: prefixed('sess'),
}
