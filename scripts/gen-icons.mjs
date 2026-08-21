import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public', 'icons');

// CRC32 table
const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  crc32Table[i] = crc >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crc32Table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);

  const crcValue = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crcValue, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function setPixel(pixels, width, x, y, r, g, b, a) {
  if (x < 0 || x >= width || y < 0 || y >= width) return;
  const idx = (y * width + x) * 4;
  pixels[idx] = r;
  pixels[idx + 1] = g;
  pixels[idx + 2] = b;
  pixels[idx + 3] = a;
}

function fillRect(pixels, width, x1, y1, x2, y2, r, g, b, a) {
  const minX = Math.max(0, Math.floor(x1));
  const maxX = Math.min(width - 1, Math.floor(x2));
  const minY = Math.max(0, Math.floor(y1));
  const maxY = Math.min(width - 1, Math.floor(y2));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      setPixel(pixels, width, x, y, r, g, b, a);
    }
  }
}

function fillCircle(pixels, width, cx, cy, r, fill_r, fill_g, fill_b, fill_a, half = false) {
  const r2 = r * r;
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(width - 1, Math.floor(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = half ? Math.min(width - 1, Math.floor(cy)) : Math.min(width - 1, Math.floor(cy + r));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        setPixel(pixels, width, x, y, fill_r, fill_g, fill_b, fill_a);
      }
    }
  }
}

function generateIcon(size) {
  const pixels = new Uint8Array(size * size * 4);

  // Yellow background
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 0xff;     // R
    pixels[i + 1] = 0xd2; // G
    pixels[i + 2] = 0x00; // B
    pixels[i + 3] = 0xff; // A
  }

  const cx = size / 2;
  const cy = size / 2;
  const faceRadius = size * 0.3;
  const helmetRadius = faceRadius * 1.2;

  // Green face
  fillCircle(pixels, size, cx, cy, faceRadius, 0x3f, 0xa3, 0x4d, 0xff);

  // White helmet (half circle + brim)
  fillCircle(pixels, size, cx, cy - faceRadius * 0.4, helmetRadius, 0xf4, 0xf1, 0xe8, 0xff, true);
  const brimY = cy - faceRadius * 0.4 + helmetRadius - Math.round(size * 0.05);
  fillRect(pixels, size, cx - helmetRadius * 1.1, brimY, cx + helmetRadius * 1.1, brimY + Math.round(size * 0.06), 0xf4, 0xf1, 0xe8, 0xff);

  // Gray horn (3 stacked rects)
  const hornX = cx + Math.round(size * 0.05);
  const hornTopY = cy - faceRadius * 0.8;
  const hornHeight = Math.round(size * 0.04);
  const hornWidth1 = Math.round(size * 0.08);
  const hornWidth2 = Math.round(size * 0.06);
  const hornWidth3 = Math.round(size * 0.04);

  fillRect(pixels, size, hornX - hornWidth1 / 2, hornTopY, hornX + hornWidth1 / 2, hornTopY + hornHeight, 0x80, 0x80, 0x80, 0xff);
  fillRect(pixels, size, hornX - hornWidth2 / 2, hornTopY - hornHeight * 1.2, hornX + hornWidth2 / 2, hornTopY - hornHeight * 0.2, 0x80, 0x80, 0x80, 0xff);
  fillRect(pixels, size, hornX - hornWidth3 / 2, hornTopY - hornHeight * 2.4, hornX + hornWidth3 / 2, hornTopY - hornHeight * 1.4, 0x80, 0x80, 0x80, 0xff);

  // Black eyes
  const eyeY = cy - Math.round(size * 0.05);
  const eyeLineLength = Math.round(size * 0.05);
  const leftEyeX = cx - Math.round(size * 0.08);
  const rightEyeX = cx + Math.round(size * 0.08);
  fillRect(pixels, size, leftEyeX - eyeLineLength / 2, eyeY, leftEyeX + eyeLineLength / 2, eyeY + Math.round(size * 0.015), 0, 0, 0, 0xff);
  fillRect(pixels, size, rightEyeX - eyeLineLength / 2, eyeY, rightEyeX + eyeLineLength / 2, eyeY + Math.round(size * 0.015), 0, 0, 0, 0xff);

  // Black mouth
  const mouthY = cy + Math.round(size * 0.08);
  const mouthLineLength = Math.round(size * 0.04);
  fillRect(pixels, size, cx - mouthLineLength / 2, mouthY, cx + mouthLineLength / 2, mouthY + Math.round(size * 0.015), 0, 0, 0, 0xff);

  // Red border frame
  const frameThickness = Math.round(size * 0.04);
  const frameColor = [0xe5, 0x30, 0x2e, 0xff];
  // Top
  fillRect(pixels, size, 0, 0, size - 1, frameThickness, frameColor[0], frameColor[1], frameColor[2], frameColor[3]);
  // Bottom
  fillRect(pixels, size, 0, size - frameThickness, size - 1, size - 1, frameColor[0], frameColor[1], frameColor[2], frameColor[3]);
  // Left
  fillRect(pixels, size, 0, 0, frameThickness, size - 1, frameColor[0], frameColor[1], frameColor[2], frameColor[3]);
  // Right
  fillRect(pixels, size, size - frameThickness, 0, size - 1, size - 1, frameColor[0], frameColor[1], frameColor[2], frameColor[3]);

  return pixels;
}

function encodePixelsToPNG(pixels, size) {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);      // width
  ihdrData.writeUInt32BE(size, 4);      // height
  ihdrData[8] = 8;                      // bit depth
  ihdrData[9] = 6;                      // color type (RGBA)
  ihdrData[10] = 0;                     // compression method
  ihdrData[11] = 0;                     // filter method
  ihdrData[12] = 0;                     // interlace method

  const ihdr = chunk('IHDR', ihdrData);

  // IDAT chunk
  const raw = Buffer.alloc(size * (1 + size * 4));
  let rawIdx = 0;
  for (let y = 0; y < size; y++) {
    raw[rawIdx++] = 0; // filter type for this scanline
    for (let x = 0; x < size; x++) {
      const pixelIdx = (y * size + x) * 4;
      raw[rawIdx++] = pixels[pixelIdx];     // R
      raw[rawIdx++] = pixels[pixelIdx + 1]; // G
      raw[rawIdx++] = pixels[pixelIdx + 2]; // B
      raw[rawIdx++] = pixels[pixelIdx + 3]; // A
    }
  }

  const compressed = deflateSync(raw, { level: 1 });
  const idat = chunk('IDAT', compressed);

  // IEND chunk
  const iend = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function writePNG(filename, size) {
  const pixels = generateIcon(size);
  const pngBuffer = encodePixelsToPNG(pixels, size);
  writeFileSync(filename, pngBuffer);
  return pngBuffer.length;
}

// Create output directory
mkdirSync(publicDir, { recursive: true });

// Generate both icon sizes
const size192 = writePNG(join(publicDir, 'icon-192.png'), 192);
const size512 = writePNG(join(publicDir, 'icon-512.png'), 512);

console.log(`Generated icons:`);
console.log(`  public/icons/icon-192.png (${size192} bytes)`);
console.log(`  public/icons/icon-512.png (${size512} bytes)`);
