"use strict";
// ===========================================================================
// 3. World floor, contact shadows, the hero's private light (port of scene.py).
//    The floor is far too big to keep as resolved pixels (2560x1440), so what is
//    stored is one *tone id per world pixel* (3.7 MB of Uint8) and the 320x180
//    FLOOR window is refilled from it whenever the integer camera moves.
//
//    That is only legal because of a property of resolve(): dither amplitude is
//    (lum - 0.26) / 0.22 clamped at 0, and every floor tone below is darker than
//    lum 0.26, so floor pixels are never dithered and a tone's resolved bytes do
//    not depend on where on screen it lands. The harness asserts exactly this
//    (all 16 Bayer phases identical) -- if a tone were ever brightened past the
//    gate, the window would disagree with resolve() and the fast path would lie.
// ===========================================================================
// Eight tone slots, filled by applyMap from the active map's `tone`: 0..3 floor (dark to
// light), 4 seam, 5 wall, 6 lip, 7 void. The last three are the engine's own world border
// and a map never draws them -- that is what keeps BOUND and the wall in agreement.
const TONESET = [];
const SHADOW = hexc('#07070c');
let HERO_GLOW = hexc('#ffb066');            // the hero's own lamp; tinted per map
const FLOOR = new Float32Array(NP * 3);
const TID = new Uint8Array(WW * WH);

// Coarse value noise: two hashed scales, so walking a long way crosses slow patches of
// brighter and darker stone instead of one uniform texture repeated forever.
function vnoise(a, b) {
  let x = Math.imul(a + 0x9e37, 0x85ebca6b) ^ Math.imul(b + 0x1b873, 0xc2b2ae35);
  x ^= x >>> 13; x = Math.imul(x, 0x27d4eb2d);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// The two scatter helpers every map gets in `F`. Both draw from the map's own floor rng,
// so a map that leans on them is still reproducible from its seed alone.
function mkWalk(tid, rng) {
  // A wandering one-pixel line. The 0.6 on dy is the world's usual ground squash, so a
  // crack laid down at a random angle lies flat instead of standing up.
  return (x, y, len, id, wob) => {
    wob = wob == null ? 1 : wob;
    let cx = x, cy = y, ang = rng.range(0, TAU);
    for (let i = 0; i < len; i++) {
      const ix = Math.round(cx), iy = Math.round(cy);
      if (ix >= 0 && ix < WW && iy >= 0 && iy < WH) tid[iy * WW + ix] = id;
      ang += rng.range(-0.5, 0.5) * wob;
      cx += Math.cos(ang); cy += Math.sin(ang) * 0.6;
    }
  };
}
function mkBlob(tid, rng) {
  // A soft-edged ellipse. `soft` is how likely a pixel is to be dropped as it nears the
  // rim, which dissolves the outline instead of stamping a hard oval on the floor.
  return (cx, cy, rw, rh, id, soft) => {
    soft = soft == null ? 0.4 : soft;
    const x0 = Math.max(0, Math.round(cx - rw)), x1 = Math.min(WW - 1, Math.round(cx + rw));
    const y0 = Math.max(0, Math.round(cy - rh)), y1 = Math.min(WH - 1, Math.round(cy + rh));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rw, dy = (y - cy) / rh, d = dx * dx + dy * dy;
      if (d > 1 || (soft > 0 && rng() < soft * d)) continue;
      tid[y * WW + x] = id;
    }
  };
}

// The world border: void, wall, lip. Engine-owned, and stamped over whatever the map wrote
// -- that is the one guarantee that keeps the visible wall and BOUND in agreement no matter
// what a map does to the floor. Only the 16 px band is walked, not the whole world.
function paintBorder(tid) {
  const band = (x, y) => {
    const d = Math.min(y, WH - 1 - y, x, WW - 1 - x);
    tid[y * WW + x] = d < 6 ? 7 : d < 14 ? 5 : 6;
  };
  for (let y = 0; y < WH; y++) {
    if (y < 16 || y >= WH - 16) { for (let x = 0; x < WW; x++) band(x, y); }
    else {
      for (let x = 0; x < 16; x++) band(x, y);
      for (let x = WW - 16; x < WW; x++) band(x, y);
    }
  }
}

// Bake every tone id in the world for one map. The map fills the interior with ids 0..4 and
// may call F.border() early if it wants its later passes to see the wall; either way the
// border is stamped again on the way out.
//
// The floor gets its own seed (`fseed`, defaulting to `seed`) because the two streams are
// independent: re-rolling a map's prop field should not also move every speck of grit.
function bakeWorldFloor(m) {
  const rng = mulberry32(m.fseed || m.seed || 7);
  const F = { WW, WH, tid: TID, rng, vnoise, clamp, c01,
              border: () => paintBorder(TID),
              walk: mkWalk(TID, rng), blob: mkBlob(TID, rng) };
  m.floor(F);
  paintBorder(TID);
}

// Per-tone lookup tables: the float triple the buffer wants and the packed RGBA word
// the fast path memcpy's. The bytes come out of resolve() itself, so the baseline can
// never drift from the real tonemap. Rebuilt every time the map changes.
const TONE_F = new Float32Array(8 * 3);
const TONE_U32 = new Uint32Array(8);
function bakeToneTables() {
  buf.fill(0);
  for (let i = 0; i < TONESET.length; i++) {
    const t = TONESET[i], i3 = i * 3;
    TONE_F[i3] = t[0]; TONE_F[i3 + 1] = t[1]; TONE_F[i3 + 2] = t[2];
    buf[i3] = t[0]; buf[i3 + 1] = t[1]; buf[i3 + 2] = t[2];
  }
  const probe = new Uint8ClampedArray(NP * 4);
  resolve(probe, true);
  const p32 = new Uint32Array(probe.buffer);
  for (let i = 0; i < TONESET.length; i++) TONE_U32[i] = p32[i];
  buf.fill(0);
}
FLOOR_RGBA = new Uint8ClampedArray(NP * 4);
const FLOOR_U32 = new Uint32Array(FLOOR_RGBA.buffer);

let floorCamX = -1, floorCamY = -1;
function syncFloor(force) {
  if (!force && floorCamX === CAMX && floorCamY === CAMY) return;
  floorCamX = CAMX; floorCamY = CAMY;
  for (let y = 0; y < H; y++) {
    const src = (CAMY + y) * WW + CAMX, dst = y * W;
    for (let x = 0; x < W; x++) {
      const t = TID[src + x], t3 = t * 3, i3 = (dst + x) * 3;
      FLOOR[i3] = TONE_F[t3]; FLOOR[i3 + 1] = TONE_F[t3 + 1]; FLOOR[i3 + 2] = TONE_F[t3 + 2];
      FLOOR_U32[dst + x] = TONE_U32[t];
    }
  }
}
function setCam(x, y) {
  CAMX = clamp(Math.round(x), 0, WW - W);
  CAMY = clamp(Math.round(y), 0, WH - H);
  syncFloor();
}
setCam(0, 0);

function shadowAt(cx, cy, rw, rh, a) {
  a = a === undefined ? 0.55 : a;
  for (let y = Math.floor(cy - rh) - 1; y <= Math.ceil(cy + rh) + 1; y++)
    for (let x = Math.floor(cx - rw) - 1; x <= Math.ceil(cx + rw) + 1; x++) {
      const dx = (x - cx) / rw, dy = (y - cy) / rh, d = dx * dx + dy * dy;
      if (d <= 1) setPix(x, y, SHADOW, a * (1 - d * 0.55));
    }
}

// A warm floor glow only the hero ever gets: when several enemies share a humanoid
// silhouette, colour difference loses, and this is what keeps the player findable.
function heroLight(cx, cy, strength, rw, rh) {
  rw = rw || 17; rh = rh || 9;
  cx -= CAMX; cy -= CAMY;
  for (let y = Math.floor(cy - rh); y <= Math.ceil(cy + rh); y++)
    for (let x = Math.floor(cx - rw); x <= Math.ceil(cx + rw); x++) {
      const dx = (x - cx) / rw, dy = (y - cy) / rh, d = dx * dx + dy * dy;
      if (d > 1 || x < 0 || y < 0 || x >= W || y >= H) continue;
      const f = (1 - d) * (1 - d), i3 = (y * W + x) * 3;
      buf[i3] += HERO_GLOW[0] * strength * f;
      buf[i3 + 1] += HERO_GLOW[1] * strength * f;
      buf[i3 + 2] += HERO_GLOW[2] * strength * f;
    }
}
