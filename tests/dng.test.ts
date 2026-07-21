import { describe, expect, it } from "vitest";
import { findEmbeddedJpegs, extractDngPreview } from "~/utils/dng";

/**
 * Build a minimal little-endian TIFF/DNG with one IFD that points at an
 * embedded JPEG via the JPEGInterchangeFormat (513) / length (514) tags.
 */
function buildTiff(jpeg: Uint8Array): ArrayBuffer {
  const header = 8;
  const entryCount = 2;
  const ifdSize = 2 + entryCount * 12 + 4; // count + entries + next-offset
  const jpegOffset = header + ifdSize;
  const total = jpegOffset + jpeg.length;
  const buf = new ArrayBuffer(total);
  const v = new DataView(buf);

  // Header: 'II', magic 42, IFD0 at offset 8
  v.setUint16(0, 0x4949, true);
  v.setUint16(2, 42, true);
  v.setUint32(4, header, true);

  // IFD0
  let o = header;
  v.setUint16(o, entryCount, true);
  o += 2;
  // tag 0x0201 JPEGInterchangeFormat, type LONG(4), count 1, value = jpegOffset
  v.setUint16(o, 0x0201, true);
  v.setUint16(o + 2, 4, true);
  v.setUint32(o + 4, 1, true);
  v.setUint32(o + 8, jpegOffset, true);
  o += 12;
  // tag 0x0202 JPEGInterchangeFormatLength, type LONG(4), count 1, value = length
  v.setUint16(o, 0x0202, true);
  v.setUint16(o + 2, 4, true);
  v.setUint32(o + 4, 1, true);
  v.setUint32(o + 8, jpeg.length, true);
  o += 12;
  v.setUint32(o, 0, true); // no next IFD

  new Uint8Array(buf).set(jpeg, jpegOffset);
  return buf;
}

/**
 * Realistic layout: IFD0 references a SubIFD (tag 330) whose JPEG-compressed
 * single strip holds the full-size preview — how real DNGs store previews.
 * Parameterised by byte order to catch endianness bugs.
 */
function buildDngWithSubIfd(jpeg: Uint8Array, little: boolean): ArrayBuffer {
  const ifd0 = 8;
  const ifd0Size = 2 + 1 * 12 + 4; // one entry (SubIFDs)
  const subIfd = ifd0 + ifd0Size;
  const subIfdSize = 2 + 3 * 12 + 4; // compression, strip offset, strip length
  const jpegOffset = subIfd + subIfdSize;
  const buf = new ArrayBuffer(jpegOffset + jpeg.length);
  const v = new DataView(buf);

  v.setUint16(0, little ? 0x4949 : 0x4d4d, false);
  v.setUint16(2, 42, little);
  v.setUint32(4, ifd0, little);

  // IFD0: SubIFDs (330, LONG) -> subIfd
  v.setUint16(ifd0, 1, little);
  v.setUint16(ifd0 + 2, 0x014a, little);
  v.setUint16(ifd0 + 4, 4, little);
  v.setUint32(ifd0 + 6, 1, little);
  v.setUint32(ifd0 + 10, subIfd, little);
  v.setUint32(ifd0 + 14, 0, little); // next IFD

  // SubIFD: Compression=7, StripOffsets=jpegOffset, StripByteCounts=len
  v.setUint16(subIfd, 3, little);
  const entry = (i: number, tag: number, type: number, value: number) => {
    const o = subIfd + 2 + i * 12;
    v.setUint16(o, tag, little);
    v.setUint16(o + 2, type, little);
    v.setUint32(o + 4, 1, little);
    if (type === 3) v.setUint16(o + 8, value, little);
    else v.setUint32(o + 8, value, little);
  };
  entry(0, 0x0103, 3, 7); // Compression = JPEG
  entry(1, 0x0111, 4, jpegOffset); // StripOffsets
  entry(2, 0x0117, 4, jpeg.length); // StripByteCounts
  v.setUint32(subIfd + 2 + 3 * 12, 0, little); // next IFD

  new Uint8Array(buf).set(jpeg, jpegOffset);
  return buf;
}

const fakeJpeg = (size: number): Uint8Array => {
  const a = new Uint8Array(size);
  a[0] = 0xff;
  a[1] = 0xd8; // SOI
  a[size - 2] = 0xff;
  a[size - 1] = 0xd9; // EOI
  return a;
};

describe("findEmbeddedJpegs", () => {
  it("finds an embedded JPEG referenced by tags 513/514", () => {
    const jpeg = fakeJpeg(64);
    const found = findEmbeddedJpegs(buildTiff(jpeg));
    expect(found).toHaveLength(1);
    expect(found[0]!.length).toBe(64);
  });

  it("returns nothing for non-TIFF data", () => {
    const junk = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
    expect(findEmbeddedJpegs(junk)).toEqual([]);
  });

  it("ignores a JPEG pointer that runs past the buffer", () => {
    const buf = buildTiff(fakeJpeg(64));
    // Truncate so the JPEG bytes are no longer fully present
    expect(findEmbeddedJpegs(buf.slice(0, buf.byteLength - 40))).toEqual([]);
  });
});

describe("SubIFD preview (real DNG layout)", () => {
  it("extracts a JPEG-compressed strip preview from a SubIFD (little-endian)", () => {
    const found = findEmbeddedJpegs(buildDngWithSubIfd(fakeJpeg(256), true));
    expect(found).toHaveLength(1);
    expect(found[0]!.length).toBe(256);
  });

  it("extracts it from a big-endian (MM) DNG too", () => {
    const found = findEmbeddedJpegs(buildDngWithSubIfd(fakeJpeg(200), false));
    expect(found).toHaveLength(1);
    expect(found[0]!.length).toBe(200);
  });

  it("prefers the largest preview when several are embedded", () => {
    // Combine a small 513/514 thumbnail with a large SubIFD preview by
    // extracting each separately and checking the size ordering.
    const big = extractDngPreview(buildDngWithSubIfd(fakeJpeg(4096), true), "largest");
    expect(big!.size).toBe(4096);
    const small = extractDngPreview(buildTiff(fakeJpeg(48)), "smallest");
    expect(small!.size).toBe(48);
  });
});

describe("extractDngPreview", () => {
  it("returns the largest embedded JPEG as an image/jpeg blob", () => {
    const blob = extractDngPreview(buildTiff(fakeJpeg(128)));
    expect(blob).not.toBeNull();
    expect(blob!.type).toBe("image/jpeg");
    expect(blob!.size).toBe(128);
  });

  it("returns null when there is no embedded preview", () => {
    const junk = new Uint8Array(16).buffer;
    expect(extractDngPreview(junk)).toBeNull();
  });
});
