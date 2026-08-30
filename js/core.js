"use strict";
// ===========================================================================
// 0. Pixel core -- additive HDR buffer -> tonemap -> Bayer dither -> 16 levels.
//    Straight port of skillfx/core.py, so the frames look like the sketches.
// ===========================================================================
// SCALE là *cỡ tham chiếu* của khung 320x180 khi phóng lên (4x = 1280x720), dùng cho ảnh chụp
// ở tools/ và cho việc suy luận. Nó **không** còn là tỉ lệ mà browser dùng: shell.js chốt bộ
// đệm canvas theo số điểm ảnh vật lý của cửa sổ, nên tỉ lệ thật là số lẻ (4,75 chẳng hạn).
//
// Chiều cao 180 là bất biến của cả game -- mọi con số tầm, cỡ sprite và bố cục HUD đo theo nó.
// Bề rộng thì 320 chỉ là *mặc định*: trên điện thoại màn 20:9, index.html đặt `FRAME_W` trước
// khi file này chạy để khung rộng đúng bằng máy thay vì để lại hai dải đen. Kiểm lại ngay ở đây
// chứ không tin con số truyền vào: một W lẻ hay quá lớn là một bộ đệm cấp sai cỡ vĩnh viễn, và
// node (harness) không có FRAME_W nên vẫn là đúng 320 như mọi ảnh chụp đã kiểm.
const W = typeof FRAME_W === 'number' && FRAME_W >= 320 && FRAME_W <= 480 && FRAME_W % 20 === 0
        ? FRAME_W : 320;
const H = 180, SCALE = 4, EXPO = 1.3, LEVELS = 16;
// W/H remain the logical camera and gameplay grid.  The browser renders that grid at 2x
// internally before the final nearest-neighbour copy to the physical canvas.  This is the
// missing distinction test.html already has: painted weapon frames and boss art keep twice
// as many source samples, while ranges, movement and every authored world coordinate stay
// byte-for-byte identical.  Headless harnesses stay at 1x so their 320x180 golden captures
// and performance checks keep the same contract.
const RENDER_SCALE = typeof document !== 'undefined' ? 2 : 1;
const RW = W * RENDER_SCALE, RH = H * RENDER_SCALE;
const NP = RW * RH;
const buf = new Float32Array(NP * 3);

// The 320x180 frame is a *window* onto a much larger world (8 x 8 screens). Every
// primitive below takes world coordinates and subtracts the camera itself, so no skill
// and no draw call has to know where the view currently is -- that was the only way to
// move 16 hand-tuned effects into a scrolling world without re-authoring them.
// CAMX/CAMY are integers: a fractional camera would resample the baked floor every
// frame and the pixel grid would crawl.
const WW = 2560, WH = 1440;
let CAMX = 0, CAMY = 0;

const BAYER = new Float32Array(16);
{
  const b = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let i = 0; i < 16; i++) BAYER[i] = (b[i] + 0.5) / 16 - 0.5;
}

function hexc(s) {
  s = s.replace('#', '');
  return [parseInt(s.slice(0, 2), 16) / 255,
          parseInt(s.slice(2, 4), 16) / 255,
          parseInt(s.slice(4, 6), 16) / 255];
}

// Buffer value that tonemaps to exactly this colour: floor tones authored this way
// land on the 16-step grid instead of drifting to maroon/teal one step away.
//
// Exact inverse of the tonemap in resolve(): that curve is applied to the *strongest*
// channel and the other two ride along on the original ratio, so inverting it means
// inverting one scalar (the max) and scaling the triple back up by it.
function asOutput(s) {
  const c = hexc(s), m = Math.max(c[0], c[1], c[2]);
  if (m <= 0) return [0, 0, 0];
  const l = -Math.log(1 - Math.min(m, 0.995)) / EXPO;
  return c.map(v => v / m * l);
}
// 16 levels means 255/15 == 17 exactly, so the output step is an integer.
//
// Most of a frame is untouched floor, and tonemapping it again every frame was the
// single most expensive thing the renderer did (~7.5 ms of a ~9 ms frame). So the
// resolved floor is baked once and memcpy'd in, and a pixel is only recomputed when
// its buffer value actually differs from the floor. Same output, byte for byte -- the
// baseline comes out of this very function.
let FLOOR_RGBA = null;
// One tonemapped triple, handed back through module-level slots. It is its own function so
// the two callers in resolve() -- one per uniform block, one per pixel -- cannot drift apart,
// and the outputs are hoisted rather than returned in an object because this runs up to 230k
// times a frame and must not allocate.
let TMR = 0, TMG = 0, TMB = 0, TMA = 0;
function tonemap(b0, b1, b2) {
  // Tonemap the *brightest* channel and let the other two keep their ratio to it.
  // Curving each channel on its own pulls all three toward 1 at different rates, so the
  // strongest saturates first and every colour bleaches as it brightens: a cyan #8fd6ff
  // cast resolved to #99bbcc at buffer 1.0 and #ddeeee at 2.6, which is why the VFX layer
  // read as grey haze -- nothing could be bright *and* its own colour. Peak brightness is
  // unchanged (the max channel goes through the same curve), hue and saturation now
  // survive the whole range, and it costs one exp() per pixel instead of three.
  const v0 = b0 > 0 ? b0 : 0, v1 = b1 > 0 ? b1 : 0, v2 = b2 > 0 ? b2 : 0;
  const l = v0 > v1 ? (v0 > v2 ? v0 : v2) : (v1 > v2 ? v1 : v2);
  let r = 0, g = 0, b = 0;
  if (l > 1e-6) {                              // below this the whole triple rounds to 0
    const s = (1 - Math.exp(-l * EXPO)) / l;
    r = v0 * s; g = v1 * s; b = v2 * s;
  }
  const lum = (r + g + b) / 3;
  const amp = (lum - 0.26) / 0.22;             // dither the light, not the flats
  TMR = r; TMG = g; TMB = b;
  TMA = amp < 0 ? 0 : (amp > 1 ? 1 : amp);
}
// A 2x2 block of render samples is one gameplay pixel, and the two layers that cover most of a
// frame -- the baked floor and every smooth additive glow -- hold the *same* value across all
// four. So at RENDER_SCALE 2 the frame is walked as blocks: a block still equal to the floor is
// skipped whole, a block whose four samples agree pays one exp() instead of four, and only the
// blocks that genuinely use the finer grid (imported art, thin geometry, sprite edges) go
// sample by sample. The dither is still read per sample from x&3 / y&3, so the bytes are exactly
// the ones the per-pixel loop in resolve() writes -- checked against it on floor, veil, glow,
// sprite, noise, signed, blocky, band and speckle buffers with `full` both ways, all identical.
//
// The write is a second copy rather than a shared helper because this runs up to 230k times a
// frame; the arithmetic that could actually drift, the tonemap, is already factored out above.
function resolve2x(out, base, n) {
  for (let by = 0; by < RH; by += 2) {
    const ra = by * RW, rb = (by + 1) * RW;
    for (let bx = 0; bx < RW; bx += 2) {
      const a = (ra + bx) * 3, b = (rb + bx) * 3;
      // Cheapest test first, and the one that fires for most of an idle frame: all four samples
      // are still untouched floor, so the memcpy in resolve() already left the right bytes
      // there. Order matters -- running the uniformity scan first cost 0.72 -> 0.95 ms on a
      // pure-floor 640x360 frame, work such a frame can never use. Skipping the scan is sound
      // only because the floor is uniform inside a block by construction (syncFloor writes one
      // logical tone across all four samples), so matching the floor already implies uniform.
      if (base && buf[a] === FLOOR[a] && buf[a + 1] === FLOOR[a + 1] && buf[a + 2] === FLOOR[a + 2]
               && buf[a + 3] === FLOOR[a + 3] && buf[a + 4] === FLOOR[a + 4] && buf[a + 5] === FLOOR[a + 5]
               && buf[b] === FLOOR[b] && buf[b + 1] === FLOOR[b + 1] && buf[b + 2] === FLOOR[b + 2]
               && buf[b + 3] === FLOOR[b + 3] && buf[b + 4] === FLOOR[b + 4] && buf[b + 5] === FLOOR[b + 5])
        continue;
      const b0 = buf[a], b1 = buf[a + 1], b2 = buf[a + 2];
      if (buf[a + 3] === b0 && buf[a + 4] === b1 && buf[a + 5] === b2
       && buf[b]     === b0 && buf[b + 1] === b1 && buf[b + 2] === b2
       && buf[b + 3] === b0 && buf[b + 4] === b1 && buf[b + 5] === b2) {
        tonemap(b0, b1, b2);
        for (let sy = 0; sy < 2; sy++) {
          const y = by + sy, brow = (y & 3) * 4, row = y * RW + bx;
          for (let sx = 0; sx < 2; sx++) {
            const d = BAYER[brow + ((bx + sx) & 3)] * 0.5 * TMA / n, i4 = (row + sx) * 4;
            let k = Math.round((TMR + d) * n); out[i4]     = (k < 0 ? 0 : k > n ? n : k) * 17;
            k = Math.round((TMG + d) * n);      out[i4 + 1] = (k < 0 ? 0 : k > n ? n : k) * 17;
            k = Math.round((TMB + d) * n);      out[i4 + 2] = (k < 0 ? 0 : k > n ? n : k) * 17;
            out[i4 + 3] = 255;
          }
        }
        continue;
      }
      for (let sy = 0; sy < 2; sy++) {
        const y = by + sy, brow = (y & 3) * 4;
        for (let sx = 0; sx < 2; sx++) {
          const x = bx + sx, i = y * RW + x, i3 = i * 3, i4 = i * 4;
          const p0 = buf[i3], p1 = buf[i3 + 1], p2 = buf[i3 + 2];
          if (base && p0 === FLOOR[i3] && p1 === FLOOR[i3 + 1] && p2 === FLOOR[i3 + 2]) continue;
          tonemap(p0, p1, p2);
          const d = BAYER[brow + (x & 3)] * 0.5 * TMA / n;
          let k = Math.round((TMR + d) * n); out[i4]     = (k < 0 ? 0 : k > n ? n : k) * 17;
          k = Math.round((TMG + d) * n);      out[i4 + 1] = (k < 0 ? 0 : k > n ? n : k) * 17;
          k = Math.round((TMB + d) * n);      out[i4 + 2] = (k < 0 ? 0 : k > n ? n : k) * 17;
          out[i4 + 3] = 255;
        }
      }
    }
  }
}
function resolve(out, full) {
  const n = LEVELS - 1;
  const base = !full && FLOOR_RGBA;
  if (base) out.set(FLOOR_RGBA);
  if (RENDER_SCALE === 2) { resolve2x(out, base, n); return; }
  // One sample at a time. This is what the headless harnesses run (RENDER_SCALE 1, where a block
  // *is* a pixel so the block tests could only add work), and it is the definition resolve2x is
  // measured against -- keeping it as a plain loop is what makes that comparison worth anything.
  for (let y = 0; y < RH; y++) {
    const brow = (y & 3) * 4;
    for (let x = 0; x < RW; x++) {
      const i = y * RW + x, i3 = i * 3, i4 = i * 4;
      const b0 = buf[i3], b1 = buf[i3 + 1], b2 = buf[i3 + 2];
      if (base && b0 === FLOOR[i3] && b1 === FLOOR[i3 + 1] && b2 === FLOOR[i3 + 2]) continue;
      tonemap(b0, b1, b2);
      const d = BAYER[brow + (x & 3)] * 0.5 * TMA / n;
      let k = Math.round((TMR + d) * n); out[i4]     = (k < 0 ? 0 : k > n ? n : k) * 17;
      k = Math.round((TMG + d) * n);      out[i4 + 1] = (k < 0 ? 0 : k > n ? n : k) * 17;
      k = Math.round((TMB + d) * n);      out[i4 + 2] = (k < 0 ? 0 : k > n ? n : k) * 17;
      out[i4 + 3] = 255;
    }
  }
}

// Deterministic stream for anything that affects gameplay; cosmetic-only jitter may
// use Math.random, but every skill's shape comes from a seeded rng so a replayed
// cast draws identically.
function mulberry32(seed) {
  let s = seed >>> 0;
  const f = function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => a + Math.floor(f() * (b - a));
  f.pick = arr => arr[Math.min(arr.length - 1, Math.floor(f() * arr.length))];
  return f;
}

const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const c01 = v => v < 0 ? 0 : (v > 1 ? 1 : v);
const TAU = Math.PI * 2;

// Falloff exponents are the hottest arithmetic in the renderer: one 14-ray star does
// ~200k Math.pow calls in a single frame. The exponents are a handful of authored
// constants on inputs already clamped to 0..1, so common ones are unrolled and the rest
// go through a 1024-entry table with linear interpolation (error ~1e-6, i.e. four orders
// of magnitude below the 1/15 output step, so the frame is unchanged).
const POWLUT = new Map();
function powTable(p) {
  let t = POWLUT.get(p);
  if (!t) {
    t = new Float32Array(1026);
    for (let i = 0; i <= 1025; i++) t[i] = Math.pow(Math.min(i / 1024, 1), p);
    POWLUT.set(p, t);
  }
  return t;
}
function fpow(v, p) {
  if (v <= 0) return 0;                      // also keeps the table index in range
  if (v >= 1) return 1;
  if (p === 2) return v * v;
  if (p === 1) return v;
  if (p === 1.5) return v * Math.sqrt(v);
  if (p === 3) return v * v * v;
  if (p === 4) { const q = v * v; return q * q; }
  if (p === 5) { const q = v * v; return q * q * v; }
  const t = powTable(p), f = v * 1024, i = f | 0, g = f - i;
  return t[i] + (t[i + 1] - t[i]) * g;
}
