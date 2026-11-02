// Minimal PNG decoder for tile atlas checks (non-interlaced, 8-bit or palette). Returns RGBA bytes.
import fs from 'node:fs';
import zlib from 'node:zlib';
export function readPng(file) {
  const b = fs.readFileSync(file);
  let i = 8, idat = [], pal = null, trns = null, w, h, bd, ct;
  while (i < b.length) {
    const n = b.readUInt32BE(i), t = b.toString('latin1', i + 4, i + 8), d = b.subarray(i + 8, i + 8 + n);
    i += 12 + n;
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; if (d[12] !== 0) throw new Error('interlaced'); }
    else if (t === 'PLTE') { pal = d; } else if (t === 'tRNS') { trns = d; } else if (t === 'IDAT') idat.push(d);
  }
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  const bpp = Math.max(1, (ch * bd) >> 3), stride = (w * ch * bd + 7) >> 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rows = []; let prev = new Uint8Array(stride), p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++]; const line = new Uint8Array(raw.subarray(p, p + stride)); p += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, up = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + up) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + up) >> 1)) & 255;
      else if (f === 4) { const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? up : c)) & 255; }
    }
    rows.push(line); prev = line;
  }
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const r = rows[y], o = (y * w + x) * 4; let px;
    if (ct === 3) {
      let k; if (bd === 8) k = r[x]; else { const per = 8 / bd; k = (r[Math.floor(x / per)] >> (8 - bd * (x % per + 1))) & ((1 << bd) - 1); }
      px = [pal[k * 3], pal[k * 3 + 1], pal[k * 3 + 2], trns && k < trns.length ? trns[k] : 255];
    } else if (ct === 6) px = [r[x * 4], r[x * 4 + 1], r[x * 4 + 2], r[x * 4 + 3]];
    else if (ct === 2) px = [r[x * 3], r[x * 3 + 1], r[x * 3 + 2], 255];
    else if (ct === 4) px = [r[x * 2], r[x * 2], r[x * 2], r[x * 2 + 1]];
    else px = [r[x], r[x], r[x], 255];
    data.set(px, o);
  }
  return { width: w, height: h, data };
}
