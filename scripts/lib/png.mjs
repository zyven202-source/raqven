/**
 * A minimal PNG writer.
 *
 * RAVQEN's icon pipeline has no image dependency — not sharp, not pngjs, not
 * canvas. Everything the pipeline draws is rasterised by hand into an RGBA
 * buffer and encoded here. That is not asceticism: an icon generator that pulls
 * in a native image library is a generator that can break on a Node upgrade and
 * cannot be audited by reading it, and this repository would rather not have a
 * supply-chain dependency whose job is to write a few thousand bytes.
 *
 * PNG is chosen over JPEG because the favicon frames must keep hard alpha
 * edges, and over a raw BMP/ICO-only path because the 192 and 512 px icons are
 * served over HTTP, where PNG wins decisively on size.
 *
 * Only what the pipeline needs is implemented: 8-bit RGBA, no interlacing, one
 * IDAT chunk, filter type 0 (None) on every scanline. A compressor that picks
 * the filter per scanline would produce a smaller file, and for a flat two-tone
 * icon the difference is noise, so the simple correct thing wins.
 */

import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

/** CRC-32 as PNG defines it: the same polynomial as gzip, no final xor. */
export function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** One PNG chunk: length, type, payload, CRC over type+payload. */
export function chunk(type, body) {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, "ascii");
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/**
 * Encode a straight (non-premultiplied) RGBA buffer as a PNG.
 * `data` may be a Uint8ClampedArray view of any offset — the scanline copy goes
 * through `byteOffset` deliberately, because a subarray view is how the caller
 * hands over one tile of a larger buffer.
 */
export function encodePng({ size, data }) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(data.buffer, data.byteOffset + y * size * 4, size * 4).copy(
      raw,
      y * (size * 4 + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
