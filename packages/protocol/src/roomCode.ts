/**
 * Room codes are the invite (DECISIONS.md D40): five characters without look-alikes
 * (no 0, O, 1, I, L), 31^5 = about 28.6 million codes. Generation lives in the server,
 * which owns the randomness.
 */

export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const ROOM_CODE_LENGTH = 5

const CODE = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`)

export function isRoomCode(code: string): boolean {
  return CODE.test(code)
}

/** Cleans up a typed code: case, spaces and dashes. Returns null if it cannot be a code. */
export function normalizeRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, '')
  return isRoomCode(code) ? code : null
}

/** Maps random integers (any range) to a code; the server passes crypto-random values. */
export function roomCodeFrom(randoms: readonly number[]): string {
  if (randoms.length !== ROOM_CODE_LENGTH) throw new Error(`need ${ROOM_CODE_LENGTH} values`)
  return randoms.map((r) => ROOM_CODE_ALPHABET[Math.abs(Math.trunc(r)) % ROOM_CODE_ALPHABET.length]).join('')
}
