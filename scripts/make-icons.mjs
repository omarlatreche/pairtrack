#!/usr/bin/env node
/**
 * Generate the PWA icons.
 *
 * Hand-rolled PNG encoder rather than a dependency: the icons are flat colour
 * on a rounded field, so this is a few hundred bytes of zlib-stored scanlines
 * and it keeps the dependency count where BRIEF §6 wants it.
 *
 * The mark is a bar pair: two verticals crossed by a jumper. Maskable variants
 * pad to the 40% safe zone so Android's circle mask does not crop it.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const OUT = join('public', 'icons');
mkdirSync(OUT, { recursive: true });

const BG = [13, 17, 23]; // --bg
const INK = [240, 246, 252]; // --text
const ACCENT = [63, 185, 80]; // --pass

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** `pixel(x, y)` returns [r, g, b]. */
function writePng(path, size, pixel) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  let offset = 0;

  for (let y = 0; y < size; y += 1) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < size; x += 1) {
      const [r, g, b] = pixel(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  writeFileSync(path, png);
  return png.length;
}

/**
 * The mark, in a 0..1 coordinate space so it scales to any size.
 * `inset` is the maskable safe-zone padding.
 */
function makePixel(size, inset) {
  const scale = 1 - inset * 2;

  return (px, py) => {
    const x = (px / size - inset) / scale;
    const y = (py / size - inset) / scale;

    if (x < 0 || x > 1 || y < 0 || y > 1) return BG;

    // Two verticals.
    const onVertical =
      (Math.abs(x - 0.32) < 0.075 || Math.abs(x - 0.68) < 0.075) && y > 0.12 && y < 0.88;

    // The jumper crossing them.
    const onJumper = Math.abs(y - 0.5) < 0.075 && x > 0.2 && x < 0.8;

    if (onJumper) return ACCENT;
    if (onVertical) return INK;
    return BG;
  };
}

const files = [
  ['icon-192.png', 192, 0.06],
  ['icon-512.png', 512, 0.06],
  ['maskable-192.png', 192, 0.2],
  ['maskable-512.png', 512, 0.2],
];

for (const [name, size, inset] of files) {
  const bytes = writePng(join(OUT, name), size, makePixel(size, inset));
  console.log(`icons/${name}  ${size}x${size}  ${bytes} bytes`);
}

// An SVG for the browser tab: sharp at any size, ~400 bytes.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" rx="22" fill="#0d1117"/>
  <rect x="24.5" y="12" width="15" height="76" rx="3" fill="#f0f6fc"/>
  <rect x="60.5" y="12" width="15" height="76" rx="3" fill="#f0f6fc"/>
  <rect x="20" y="42.5" width="60" height="15" rx="3" fill="#3fb950"/>
</svg>
`;
writeFileSync(join(OUT, 'icon.svg'), svg);
console.log('icons/icon.svg');
