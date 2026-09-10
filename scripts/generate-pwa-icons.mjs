// Ícones determinísticos sem dependências: Node + PNG RGB + zlib.
// Execute: node scripts/generate-pwa-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const OUTPUT = new URL("../public/icons/", import.meta.url);
const BACKGROUND = [249, 115, 22];
const FOREGROUND = [255, 255, 255];
const SUPERSAMPLE = 4;

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function segmentDistance(x, y, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - x1 - t * dx, y - y1 - t * dy);
}

function insideCutlery(x, y, maskable) {
  // Toda a marca fica dentro do círculo seguro de raio 40% do maskable.
  const scale = maskable ? 0.86 : 1;
  x = (x - 0.5) / scale + 0.5;
  y = (y - 0.5) / scale + 0.5;
  const fork = [
    [0.29, 0.27, 0.29, 0.43],
    [0.37, 0.27, 0.37, 0.72],
    [0.45, 0.27, 0.45, 0.43],
    [0.29, 0.43, 0.37, 0.50],
    [0.45, 0.43, 0.37, 0.50],
    [0.66, 0.45, 0.66, 0.72],
  ];
  return fork.some((line) => segmentDistance(x, y, ...line) <= 0.025) ||
    ((x - 0.66) / 0.074) ** 2 + ((y - 0.365) / 0.115) ** 2 <= 1;
}

function png(size, maskable) {
  const stride = size * 3 + 1;
  const pixels = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let covered = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          if (insideCutlery((x + (sx + 0.5) / SUPERSAMPLE) / size,
            (y + (sy + 0.5) / SUPERSAMPLE) / size, maskable)) covered++;
        }
      }
      const alpha = covered / SUPERSAMPLE ** 2;
      for (let channel = 0; channel < 3; channel++) {
        pixels[y * stride + 1 + x * 3 + channel] = Math.round(
          BACKGROUND[channel] * (1 - alpha) + FOREGROUND[channel] * alpha,
        );
      }
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2; // RGB opaco: sem borda transparente no maskable.
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0)),
  ]);
}

await mkdir(OUTPUT, { recursive: true });
for (const [name, size, maskable] of [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
  ["apple-touch-icon.png", 180, false],
]) {
  const output = new URL(name, OUTPUT);
  await writeFile(output, png(size, maskable));
  process.stdout.write(`${fileURLToPath(output)} (${size}x${size})\n`);
}
