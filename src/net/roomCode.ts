export const ROOM_CODE_LENGTH = 6;

export const normalizeRoomCode = (value: string) => value.replace(/[\s-]/g, '');
export const isRoomCode = (value: string) => /^\d{6}$/.test(value);
export const formatRoomCode = (value: string) => `${value.slice(0, 3)} ${value.slice(3)}`;

/** Crypto randomness; keep leading zeroes and avoid modulo bias. */
export function createRoomCode(): string {
  let code = '';
  const bytes = new Uint8Array(16);
  while (code.length < ROOM_CODE_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < 250) code += byte % 10;
      if (code.length === ROOM_CODE_LENGTH) break;
    }
  }
  return code;
}
