/**
 * Protobuf wire format, the minimum this app needs.
 *
 * Deliberately schema-free: this layer only knows tags, wire types and
 * lengths. Message semantics live in lunaProto.ts. Keeping them apart means
 * the risky part — byte handling — is testable against real captures without
 * dragging a 53 KB schema into every test.
 */

export interface RawField {
  field: number;
  wire: number;
  /** varint payloads decode to a number; the rest stay as bytes. */
  value: number | Uint8Array;
}

export const WIRE_VARINT = 0;
export const WIRE_64BIT = 1;
export const WIRE_BYTES = 2;
export const WIRE_32BIT = 5;

/**
 * Multiplication rather than bit shifts: values like activate_time exceed
 * 32 bits, and JS bitwise operators silently truncate there.
 */
export function encodeVarint(value: number): number[] {
  const out: number[] = [];
  let rest = Math.max(0, Math.floor(value));
  while (rest > 0x7f) {
    out.push((rest % 128) | 0x80);
    rest = Math.floor(rest / 128);
  }
  out.push(rest);
  return out;
}

export const encodeTag = (field: number, wire: number): number[] => encodeVarint(field * 8 + wire);

export function encodeLengthDelimited(field: number, payload: Uint8Array): number[] {
  return [...encodeTag(field, WIRE_BYTES), ...encodeVarint(payload.length), ...payload];
}

export const zigzagEncode = (value: number): number => (value < 0 ? -value * 2 - 1 : value * 2);
export const zigzagDecode = (value: number): number =>
  value % 2 === 0 ? value / 2 : -(value + 1) / 2;

export function concatBytes(parts: number[][]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function readVarint(bytes: Uint8Array, at: number): { value: number; at: number } | null {
  let value = 0;
  let scale = 1;
  let cursor = at;
  for (;;) {
    if (cursor >= bytes.length) return null;
    const byte = bytes[cursor++]!;
    value += (byte & 0x7f) * scale;
    if ((byte & 0x80) === 0) return { value, at: cursor };
    scale *= 128;
    // A varint never exceeds 10 bytes; anything longer is corrupt
    if (scale > 2 ** 70) return null;
  }
}

/**
 * Decode one message into raw records. A truncated tail is dropped rather
 * than throwing — responses can be cut short, and a partial read should
 * degrade instead of taking down the UI.
 */
export function decodeRaw(bytes: Uint8Array): RawField[] {
  const out: RawField[] = [];
  let at = 0;
  while (at < bytes.length) {
    const tag = readVarint(bytes, at);
    if (!tag) break;
    at = tag.at;
    const field = Math.floor(tag.value / 8);
    const wire = tag.value % 8;
    if (field === 0) break;

    if (wire === WIRE_VARINT) {
      const value = readVarint(bytes, at);
      if (!value) break;
      at = value.at;
      out.push({ field, wire, value: value.value });
    } else if (wire === WIRE_BYTES) {
      const length = readVarint(bytes, at);
      if (!length || length.at + length.value > bytes.length) break;
      out.push({ field, wire, value: bytes.subarray(length.at, length.at + length.value) });
      at = length.at + length.value;
    } else if (wire === WIRE_64BIT || wire === WIRE_32BIT) {
      const width = wire === WIRE_64BIT ? 8 : 4;
      if (at + width > bytes.length) break;
      out.push({ field, wire, value: bytes.subarray(at, at + width) });
      at += width;
    } else {
      break; // groups are not used by this protocol
    }
  }
  return out;
}
