// Minimal 8-bit RGBA PNG codec on top of node's zlib -- no third-party deps available here.
const fs = require('fs'), zlib = require('zlib');

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(buf) {
  let c, t = crc32.t;
  if (!t) {
    t = crc32.t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
  }
  c = -1;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function readPNG(file) {
  const b = fs.readFileSync(file);
  if (!b.slice(0, 8).equals(SIG)) throw new Error('not a png: ' + file);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  const depth = b[24], ctype = b[25], inter = b[28];
  if (depth !== 8 || ctype !== 6 || inter !== 0)
    throw new Error(`unsupported png (depth ${depth} ctype ${ctype} interlace ${inter}): ${file}`);
  const parts = [];
  let o = 8;
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8);
    if (type === 'IDAT') parts.push(b.slice(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const px = Buffer.alloc(w * h * 4), stride = w * 4;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const row = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = px.slice(y * stride, y * stride + stride);
    row.copy(out);
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? out[i - 4] : 0, bb = prev[i], c = i >= 4 ? prev[i - 4] : 0;
      switch (ft) {
        case 0: break;
        case 1: out[i] = (out[i] + a) & 255; break;
        case 2: out[i] = (out[i] + bb) & 255; break;
        case 3: out[i] = (out[i] + ((a + bb) >> 1)) & 255; break;
        case 4: {
          const p = a + bb - c, pa = Math.abs(p - a), pb = Math.abs(p - bb), pc = Math.abs(p - c);
          out[i] = (out[i] + (pa <= pb && pa <= pc ? a : (pb <= pc ? bb : c))) & 255;
          break;
        }
        default: throw new Error('bad filter ' + ft);
      }
    }
    prev = out;
  }
  return { w, h, px };
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writePNG(file, img) {
  const { w, h, px } = img, stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {           // filter 0: zlib level 9 handles these fine
    raw[y * (stride + 1)] = 0;
    px.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  fs.writeFileSync(file, Buffer.concat([
    SIG, chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

module.exports = { readPNG, writePNG };
