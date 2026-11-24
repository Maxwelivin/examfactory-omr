import { ID_CELL_COUNT, ID_STRIP } from './layout';

/** CRC-4/ITU（多項式 x^4 + x + 1），對 16 位元資料計算。 */
export function crc4(bits: number[]): number {
  let crc = 0;
  for (const b of bits) {
    const top = ((crc >> 3) & 1) ^ b;
    crc = (crc << 1) & 0xf;
    if (top) crc ^= 0x3;
  }
  return crc;
}

function toBits(value: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => (value >> (n - 1 - i)) & 1);
}

/** 考試識別碼（1–65535）→ 22 格黑白圖樣（1 = 塗黑）。 */
export function encodeExamCode(code: number): number[] {
  if (!Number.isInteger(code) || code < 1 || code > 0xffff) throw new RangeError('考試識別碼必須是 1–65535 的整數');
  const data = toBits(code, ID_STRIP.dataBits);
  const crc = toBits(crc4(data), ID_STRIP.crcBits);
  return [1, ...data, ...crc, 0];
}

/** 22 格讀值 → 識別碼；起止格或 CRC 不符時回傳 null。 */
export function decodeExamCode(cells: number[]): number | null {
  if (cells.length !== ID_CELL_COUNT) return null;
  if (cells[0] !== 1 || cells[ID_CELL_COUNT - 1] !== 0) return null;
  const data = cells.slice(1, 1 + ID_STRIP.dataBits);
  const crc = cells.slice(1 + ID_STRIP.dataBits, 1 + ID_STRIP.dataBits + ID_STRIP.crcBits);
  const crcVal = crc.reduce((a, b) => (a << 1) | b, 0);
  if (crc4(data) !== crcVal) return null;
  const code = data.reduce((a, b) => (a << 1) | b, 0);
  return code === 0 ? null : code;
}

export function randomExamCode(existing: Iterable<number> = []): number {
  const used = new Set(existing);
  for (;;) {
    const c = 1 + Math.floor(Math.random() * 0xffff);
    if (!used.has(c)) return c;
  }
}
