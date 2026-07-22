import { describe, expect, it } from "vitest";
import {
  concatBytes,
  decodeRaw,
  encodeLengthDelimited,
  encodeTag,
  encodeVarint,
  zigzagDecode,
  zigzagEncode,
} from "~/utils/protobuf";

const hex = (s: string) => new Uint8Array(s.match(/../g)!.map((b) => parseInt(b, 16)));

describe("encodeVarint", () => {
  it("encodes single-byte values", () => {
    expect(encodeVarint(0)).toEqual([0]);
    expect(encodeVarint(1)).toEqual([1]);
    expect(encodeVarint(127)).toEqual([127]);
  });

  it("encodes multi-byte values little-endian base 128", () => {
    expect(encodeVarint(128)).toEqual([0x80, 0x01]);
    expect(encodeVarint(300)).toEqual([0xac, 0x02]);
  });

  it("survives values beyond 32 bits", () => {
    // Timestamps like activate_time are milliseconds since epoch
    const bytes = encodeVarint(1781336808139);
    const [record] = decodeRaw(new Uint8Array([...encodeTag(1, 0), ...bytes]));
    expect(record!.value).toBe(1781336808139);
  });
});

describe("zigzag", () => {
  it("round-trips signed values", () => {
    for (const value of [0, -1, 1, -2, 2, 2147483647, -2147483648]) {
      expect(zigzagDecode(zigzagEncode(value))).toBe(value);
    }
  });
});

describe("decodeRaw", () => {
  it("reads varint fields", () => {
    // field 2 varint 1, field 6 varint 40 — from the live-stream body
    const records = decodeRaw(hex("10013028"));
    expect(records.map((r) => [r.field, r.value])).toEqual([
      [2, 1],
      [6, 40],
    ]);
  });

  it("reads length-delimited fields", () => {
    const records = decodeRaw(hex("1203e80501"));
    expect(records).toHaveLength(1);
    expect(records[0]!.field).toBe(2);
    expect(records[0]!.wire).toBe(2);
    expect(Array.from(records[0]!.value as Uint8Array)).toEqual([0xe8, 0x05, 0x01]);
  });

  it("reads 64-bit and 32-bit fields", () => {
    const sixtyFour = decodeRaw(new Uint8Array([...encodeTag(1, 1), 1, 2, 3, 4, 5, 6, 7, 8]));
    expect((sixtyFour[0]!.value as Uint8Array).length).toBe(8);
    const thirtyTwo = decodeRaw(new Uint8Array([...encodeTag(1, 5), 1, 2, 3, 4]));
    expect((thirtyTwo[0]!.value as Uint8Array).length).toBe(4);
  });

  it("stops cleanly on a truncated field rather than throwing", () => {
    expect(() => decodeRaw(hex("1205e805"))).not.toThrow();
    expect(decodeRaw(hex("1205e805"))).toEqual([]);
  });

  it("returns nothing for empty input", () => {
    expect(decodeRaw(new Uint8Array(0))).toEqual([]);
  });
});

describe("encodeLengthDelimited", () => {
  it("prefixes the payload with its length", () => {
    const bytes = encodeLengthDelimited(2, hex("e80501"));
    expect(Array.from(concatBytes([bytes]))).toEqual([0x12, 0x03, 0xe8, 0x05, 0x01]);
  });
});
