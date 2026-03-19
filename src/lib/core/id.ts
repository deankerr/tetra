import { customAlphabet } from 'nanoid'

const ID_LENGTH = 12
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const generate = customAlphabet(alphabet, ID_LENGTH)

const prefixed = (prefix: string) => () => `${prefix}_${generate()}`

export const generateId = {
  agent: prefixed('agnt'),
  message: prefixed('mesg'),
  request: prefixed('rqst'),
  session: prefixed('sess'),
}
