// Generates the PWA icons with zero dependencies (raw PNG encoding via zlib).
// Run: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

function crc32(buf) {
  let c, table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(px, w, h) {
  // px: Uint8Array RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter none
    px.subarray(y * w * 4, (y + 1) * w * 4).forEach((v, i) => { raw[y * (w * 4 + 1) + 1 + i] = v; });
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ---- tiny software rasterizer ----
function makeCanvas(size) {
  const px = new Uint8Array(size * size * 4);
  const set = (x, y, r, g, b, a = 255) => {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const na = a / 255, oa = px[i + 3] / 255;
    px[i]     = r * na + px[i]     * oa * (1 - na);
    px[i + 1] = g * na + px[i + 1] * oa * (1 - na);
    px[i + 2] = b * na + px[i + 2] * oa * (1 - na);
    px[i + 3] = Math.min(255, (na + oa * (1 - na)) * 255);
  };
  const rect = (x, y, w, h, c) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, c[0], c[1], c[2], c[3] ?? 255);
  };
  const circle = (cx, cy, r, c) => {
    for (let yy = cy - r; yy <= cy + r; yy++) for (let xx = cx - r; xx <= cx + r; xx++) {
      if ((xx - cx) ** 2 + (yy - cy) ** 2 <= r * r) set(xx, yy, c[0], c[1], c[2], c[3] ?? 255);
    }
  };
  const tri = (x1, y1, x2, y2, x3, y3, c) => {
    const minX = Math.min(x1, x2, x3), maxX = Math.max(x1, x2, x3);
    const minY = Math.min(y1, y2, y3), maxY = Math.max(y1, y2, y3);
    const sign = (ax, ay, bx, by, px_, py) => (ax - px_) * (by - py) - (bx - px_) * (ay - py);
    for (let yy = minY; yy <= maxY; yy++) for (let xx = minX; xx <= maxX; xx++) {
      const d1 = sign(x1, y1, x2, y2, xx, yy), d2 = sign(x2, y2, x3, y3, xx, yy), d3 = sign(x3, y3, x1, y1, xx, yy);
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) set(xx, yy, c[0], c[1], c[2], c[3] ?? 255);
    }
  };
  return { px, set, rect, circle, tri, size };
}

function drawIcon(size, pad) {
  const c = makeCanvas(size);
  // design space is 512; pad shrinks content toward the center (maskable safe area)
  const Z = v => Math.round(v * (1 - pad) * size / 512);              // sizes
  const S = v => Math.round(size / 2 + (v - 256) * (1 - pad) * size / 512); // positions

  // night sky gradient
  for (let y = 0; y < size; y++) {
    const k = y / size;
    c.rect(0, y, size, 1, [7 + k * 20, 11 + k * 36, 30 + k * 60]);
  }
  // aurora bands
  for (let band = 0; band < 3; band++) {
    for (let x = 0; x < size; x++) {
      const yBase = S(90 + band * 52) + Math.sin(x / size * 6 + band * 2) * Z(26);
      const col = band === 0 ? [70, 230, 140, 60] : band === 1 ? [80, 210, 220, 55] : [150, 120, 230, 45];
      c.rect(x, yBase, 1, Math.max(1, Z(48)), col);
    }
  }
  // moon
  c.circle(S(430), S(84), Z(34), [244, 241, 222]);
  // snow ground
  for (let y = S(340); y < size; y++) {
    const k = (y - S(340)) / Math.max(1, size - S(340));
    c.rect(0, y, size, 1, [184 + k * 40, 205 + k * 30, 232 + k * 20]);
  }
  // brothers (simple, bold)
  const bro = (bx, hat, jacket) => {
    c.rect(bx - Z(26), S(300), Z(52), Z(96), jacket);          // body
    c.circle(bx, S(276), Z(30), [234, 184, 146]);              // head
    c.rect(bx - Z(30), S(238), Z(60), Z(22), hat);             // hat band
    c.circle(bx, S(244), Z(28), hat);                          // hat top (approx)
    c.rect(bx + Z(6), S(270), Z(8), Z(8), [30, 30, 30]);       // eye
    c.rect(bx - Z(26), S(396), Z(20), Z(30), [32, 36, 46]);    // leg
    c.rect(bx + Z(6), S(396), Z(20), Z(30), [32, 36, 46]);     // leg
  };
  bro(S(180), [193, 39, 45], [224, 112, 32]);
  bro(S(320), [46, 125, 50], [42, 109, 181]);
  // beard on bro 1
  c.circle(S(184), S(292), Z(14), [109, 76, 65]);
  // tomato between them
  c.circle(S(250), S(420), Z(22), [230, 57, 70]);
  c.rect(S(246), S(390), Z(8), Z(12), [46, 125, 50]);
  // meteor streak top-left
  c.circle(S(74), S(150), Z(20), [109, 76, 65]);
  c.tri(S(90), S(136), S(160), S(70), S(104), S(164), [255, 140, 60, 200]);

  return encodePNG(c.px, size, size);
}

function downscale(srcBuf, srcSize, dstSize) {
  // decode is overkill — just re-render at target size
  return null;
}

mkdirSync(new URL('../icons/', import.meta.url), { recursive: true });
writeFileSync(new URL('../icons/icon-512.png', import.meta.url), drawIcon(512, 0));
writeFileSync(new URL('../icons/icon-192.png', import.meta.url), drawIcon(192, 0));
writeFileSync(new URL('../icons/icon-maskable-512.png', import.meta.url), drawIcon(512, 0.12));
console.log('icons written');
