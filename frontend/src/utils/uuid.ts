/**
 * RFC 9562 compliant UUIDv7 Generator.
 *
 * UUIDv7 embeds a 48-bit Unix timestamp in milliseconds into the most significant bits,
 * ensuring strict time-order sorting in IndexedDB B-tree indexes and backend databases.
 */
export function generateUUIDv7(): string {
  const timestamp = Date.now();
  const randomBytes = new Uint8Array(10);
  crypto.getRandomValues(randomBytes);

  // 48-bit timestamp as 12 hex characters
  const timestampHex = timestamp.toString(16).padStart(12, '0');

  // Random bytes to hex
  const rHex = Array.from(randomBytes, (b) => b.toString(16).padStart(2, '0')).join('');

  // Format: 8-4-4-4-12
  // Bits 48-51 are version 7 (0b0111 -> 0x7)
  // Bits 64-65 are variant 1 (0b10 -> 0x8, 0x9, 0xa, 0xb)
  const part1 = timestampHex.substring(0, 8);
  const part2 = timestampHex.substring(8, 12);
  const part3 = '7' + rHex.substring(0, 3);
  const variantNibble = ((parseInt(rHex.substring(3, 4), 16) & 0x3) | 0x8).toString(16);
  const part4 = variantNibble + rHex.substring(4, 7);
  const part5 = rHex.substring(7, 19);

  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}
