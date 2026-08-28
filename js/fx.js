"use strict";
// ===========================================================================
// 1. Additive VFX primitives (port of skillfx/fx.py).
//    numpy evaluates every field over the whole 320x180 frame; in JS that is far
//    too slow at 60fps, so every primitive computes its own bounding box first and
//    only touches pixels inside it. Same maths, same look, ~40x less work.
// ===========================================================================
function core(x, y, r, col, a, power) {
  if (a <= 0) return;
  x -= CAMX; y -= CAMY;
  const rr = Math.max(r, 1e-3);
  if (power === undefined) power = 2;
  const x0 = Math.max(0, Math.floor(x - rr)), x1 = Math.min(W - 1, Math.ceil(x + rr));
  const y0 = Math.max(0, Math.floor(y - rr)), y1 = Math.min(H - 1, Math.ceil(y + rr));
  const c0 = col[0] * a, c1 = col[1] * a, c2 = col[2] * a, sq = power === 2;
  for (let py = y0; py <= y1; py++) {
    const dy = py - y;
    for (let px = x0; px <= x1; px++) {
      const dx = px - x, d = Math.sqrt(dx * dx + dy * dy) / rr;
      if (d >= 1) continue;
      let m = 1 - d; m = sq ? m * m : fpow(m, power);
      const i3 = (py * W + px) * 3;
      buf[i3] += m * c0; buf[i3 + 1] += m * c1; buf[i3 + 2] += m * c2;
    }
  }
}

function beam(x, y, ang, r0, r1, w0, w1, col, a, sharp, fade) {
  if (a <= 0 || r1 <= r0) return;
  x -= CAMX; y -= CAMY;
  if (sharp === undefined) sharp = 1.5;
  if (fade === undefined) fade = 2;
  const ca = Math.cos(ang), sa = Math.sin(ang), wm = Math.max(w0, w1) + 1;
  let ax = 1e9, bx = -1e9, ay = 1e9, by = -1e9;
  for (const u of [r0, r1]) for (const v of [-wm, wm]) {
    const px = x + u * ca - v * sa, py = y + u * sa + v * ca;
    if (px < ax) ax = px; if (px > bx) bx = px;
    if (py < ay) ay = py; if (py > by) by = py;
  }
  const x0 = Math.max(0, Math.floor(ax)), x1 = Math.min(W - 1, Math.ceil(bx));
  const y0 = Math.max(0, Math.floor(ay)), y1 = Math.min(H - 1, Math.ceil(by));
  const span = Math.max(r1 - r0, 1e-3);
  const c0 = col[0] * a, c1 = col[1] * a, c2 = col[2] * a;
  for (let py = y0; py <= y1; py++) {
    const dy = py - y;
    for (let px = x0; px <= x1; px++) {
      const dx = px - x, u = dx * ca + dy * sa;
      if (u < r0 || u > r1) continue;
      const v = -dx * sa + dy * ca, t = (u - r0) / span;
      const hw = Math.max(w0 + (w1 - w0) * t, 0.35);
      const e = 1 - Math.abs(v) / hw;
      if (e <= 0) continue;
      const m = fpow(e, sharp) * fpow(1 - t, fade);
      const i3 = (py * W + px) * 3;
      buf[i3] += m * c0; buf[i3 + 1] += m * c1; buf[i3 + 2] += m * c2;
    }
  }
}
function ring(x, y, r, thick, col, a, squash, sharp) {
  if (a <= 0) return;
  x -= CAMX; y -= CAMY;
  if (squash === undefined) squash = 1;
  if (sharp === undefined) sharp = 1.6;
  const th = Math.max(thick, 1e-3), sq = Math.max(squash, 1e-3);
  const x0 = Math.max(0, Math.floor(x - r - th)), x1 = Math.min(W - 1, Math.ceil(x + r + th));
  const ey = (r + th) * sq;
  const y0 = Math.max(0, Math.floor(y - ey)), y1 = Math.min(H - 1, Math.ceil(y + ey));
  const c0 = col[0] * a, c1 = col[1] * a, c2 = col[2] * a;
  for (let py = y0; py <= y1; py++) {
    const dy = (py - y) / sq;
    for (let px = x0; px <= x1; px++) {
      const dx = px - x, d = Math.sqrt(dx * dx + dy * dy);
      const e = 1 - Math.abs(d - r) / th;
      if (e <= 0) continue;
      const m = fpow(e, sharp), i3 = (py * W + px) * 3;
      buf[i3] += m * c0; buf[i3 + 1] += m * c1; buf[i3 + 2] += m * c2;
    }
  }
}

// Crescent slash: annulus slice fading to nothing at both tips.
function arc(x, y, r, ang, sweep, thick, col, a, squash, sharp, taper) {
  if (a <= 0) return;
  x -= CAMX; y -= CAMY;
  if (squash === undefined) squash = 1;
  if (sharp === undefined) sharp = 1.5;
  if (taper === undefined) taper = 2;
  const th = Math.max(thick, 1e-3), sq = Math.max(squash, 1e-3);
  const half = Math.max(sweep * 0.5, 1e-3), inv = 1 / Math.max(taper, 1e-3);
  const x0 = Math.max(0, Math.floor(x - r - th)), x1 = Math.min(W - 1, Math.ceil(x + r + th));
  const ey = (r + th) * sq;
  const y0 = Math.max(0, Math.floor(y - ey)), y1 = Math.min(H - 1, Math.ceil(y + ey));
  const c0 = col[0] * a, c1 = col[1] * a, c2 = col[2] * a;
  for (let py = y0; py <= y1; py++) {
    const dy = (py - y) / sq;
    for (let px = x0; px <= x1; px++) {
      const dx = px - x, d = Math.sqrt(dx * dx + dy * dy);
      const e = 1 - Math.abs(d - r) / th;
      if (e <= 0) continue;
      let da = Math.atan2(dy, dx) - ang;
      da = Math.abs(((da + Math.PI) % TAU + TAU) % TAU - Math.PI);
      if (da >= half) continue;
      const m = fpow(e, sharp) * fpow(1 - da / half, inv);
      const i3 = (py * W + px) * 3;
      buf[i3] += m * c0; buf[i3 + 1] += m * c1; buf[i3 + 2] += m * c2;
    }
  }
}
function line(x0_, y0_, x1_, y1_, thick, col, a, sharp, fadeEnd) {
  if (a <= 0) return;
  if (sharp === undefined) sharp = 1.5;
  if (fadeEnd === undefined) fadeEnd = 0;
  const px_ = x1_ - x0_, py_ = y1_ - y0_, ln2 = px_ * px_ + py_ * py_;
  const th = Math.max(thick, 1e-3);
  // The degenerate case delegates to core(), which subtracts the camera itself, so this
  // early-out has to happen while the coordinates are still in world space.
  if (ln2 < 1e-6) { core(x0_, y0_, th, col, a); return; }
  x0_ -= CAMX; y0_ -= CAMY; x1_ -= CAMX; y1_ -= CAMY;
  const x0 = Math.max(0, Math.floor(Math.min(x0_, x1_) - th));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(x0_, x1_) + th));
  const y0 = Math.max(0, Math.floor(Math.min(y0_, y1_) - th));
  const y1 = Math.min(H - 1, Math.ceil(Math.max(y0_, y1_) + th));
  const c0 = col[0] * a, c1 = col[1] * a, c2 = col[2] * a;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      let t = ((px - x0_) * px_ + (py - y0_) * py_) / ln2;
      t = t < 0 ? 0 : (t > 1 ? 1 : t);
      const ex = px - x0_ - t * px_, ey = py - y0_ - t * py_;
      const e = 1 - Math.sqrt(ex * ex + ey * ey) / th;
      if (e <= 0) continue;
      let m = fpow(e, sharp);
      if (fadeEnd) { const f = 1 - fadeEnd * t; m *= f * f; }
      const i3 = (py * W + px) * 3;
      buf[i3] += m * c0; buf[i3 + 1] += m * c1; buf[i3 + 2] += m * c2;
    }
  }
}

function polyline(pts, thick, col, a, sharp) {
  for (let i = 0; i < pts.length - 1; i++)
    line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], thick, col, a, sharp);
}

// A solid stroke reads as something *drawn*; the same stroke broken into fading
// segments reads as something that already went past. Cheapest motion cue there is.
function dashline(x0, y0, x1, y1, n, thick, col, a, decay, gap) {
  if (decay === undefined) decay = 1;
  if (gap === undefined) gap = 0.45;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = t0 + (1 - gap) / n;
    const f = 1 - decay * t0, aa = a * f * f;
    if (aa <= 0 || f <= 0) continue;
    line(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0,
         x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1, thick, col, aa);
  }
}

function chevron(x, y, ang, size, col, a, thick, spread) {
  if (thick === undefined) thick = 1.2;
  if (spread === undefined) spread = 0.7;
  for (const s of [1, -1]) {
    const b = ang + Math.PI + s * spread;
    line(x, y, x + Math.cos(b) * size, y + Math.sin(b) * size, thick, col, a);
  }
}
// Radial burst of uneven beams -- uneven lengths keep it from reading as a wheel.
function star(x, y, col, rays, r0, r1, w, a, seed, jitter) {
  if (jitter === undefined) jitter = 0.45;
  const rng = mulberry32(seed);
  for (let i = 0; i < rays; i++) {
    const ang = (i / rays) * TAU + rng.range(-0.06, 0.06);
    const len = r1 * (1 - jitter * rng());
    beam(x, y, ang, r0, len, w * rng.range(0.7, 1.3), 0.5, col, a);
  }
}

function sparks(x, y, n, rmin, rmax, col, a, seed, size, squash, ang0, ang1, streak) {
  if (size === undefined) size = 1;
  if (squash === undefined) squash = 1;
  if (ang0 === undefined) ang0 = 0;
  if (ang1 === undefined) ang1 = TAU;
  if (streak === undefined) streak = 0;
  const rng = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const ang = rng.range(ang0, ang1);
    const r = rmin + (rmax - rmin) * Math.sqrt(rng());
    const px = x + Math.cos(ang) * r, py = y + Math.sin(ang) * r * squash;
    const s = size * rng.range(0.6, 1.5), aa = a * rng.range(0.5, 1);
    if (streak > 0) {
      line(px, py, px + Math.cos(ang) * streak * rng.range(0.4, 1),
           py + Math.sin(ang) * streak * rng.range(0.4, 1) * squash, s, col, aa);
    } else core(px, py, s, col, aa, 1.4);
  }
}

function spiral(x, y, arms, r0, r1, turns, col, a, thick, squash, phase, steps, taper) {
  if (thick === undefined) thick = 2;
  if (squash === undefined) squash = 1;
  if (phase === undefined) phase = 0;
  if (steps === undefined) steps = 22;
  if (taper === undefined) taper = true;
  for (let k = 0; k < arms; k++) {
    const base = phase + (k / arms) * TAU;
    let px = 0, py = 0;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, r = r0 + (r1 - r0) * t;
      const ang = base + turns * TAU * t;
      const nx = x + Math.cos(ang) * r, ny = y + Math.sin(ang) * r * squash;
      if (i > 0) {
        const tp = (i - 1) / steps, al = taper ? (1 - tp) * (1 - tp) : 1;
        line(px, py, nx, ny, thick * (al * 0.6 + 0.4), col, a * al);
      }
      px = nx; py = ny;
    }
  }
}
function jag(x0, y0, x1, y1, segs, jg, rng) {
  const dx = x1 - x0, dy = y1 - y0, ln = Math.max(Math.hypot(dx, dy), 1e-3);
  const nx = -dy / ln, ny = dx / ln, pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const off = (i === 0 || i === segs) ? 0 : rng.range(-jg, jg) * Math.sin(Math.PI * t);
    pts.push([x0 + dx * t + nx * off, y0 + dy * t + ny * off]);
  }
  return pts;
}

// Wide coloured halo, thin white-hot core, a couple of dead-end forks.
function bolt(x0, y0, x1, y1, col, hot, a, segs, jg, seed, thick, branches) {
  if (segs === undefined) segs = 7;
  if (jg === undefined) jg = 7;
  if (thick === undefined) thick = 2.6;
  if (branches === undefined) branches = 2;
  const rng = mulberry32(seed);
  const pts = jag(x0, y0, x1, y1, segs, jg, rng);
  polyline(pts, thick * 2.2, col, a * 0.30, 2.0);
  polyline(pts, thick, col, a * 0.85);
  polyline(pts, Math.max(thick * 0.42, 0.7), hot, a);
  for (let b = 0; b < branches; b++) {
    const i = rng.int(1, Math.max(segs - 1, 2));
    const ang = rng.range(0, TAU), L = rng.range(8, 20);
    const sub = jag(pts[i][0], pts[i][1], pts[i][0] + Math.cos(ang) * L,
                    pts[i][1] + Math.sin(ang) * L, 3, 3.5, rng);
    polyline(sub, thick * 0.75, col, a * 0.6);
    polyline(sub, Math.max(thick * 0.3, 0.6), hot, a * 0.8);
  }
}

function column(x, ytop, ybot, wtop, wbot, col, hot, a) {
  x -= CAMX; ytop -= CAMY; ybot -= CAMY;
  const h = Math.max(ybot - ytop, 1e-3), wm = Math.max(wtop, wbot);
  const x0 = Math.max(0, Math.floor(x - wm)), x1 = Math.min(W - 1, Math.ceil(x + wm));
  const y0 = Math.max(0, Math.floor(ytop)), y1 = Math.min(H - 1, Math.ceil(ybot));
  for (let py = y0; py <= y1; py++) {
    const t = c01((py - ytop) / h), hw = Math.max(wtop + (wbot - wtop) * t, 0.4);
    for (let px = x0; px <= x1; px++) {
      const e = 1 - Math.abs(px - x) / hw;
      if (e <= 0) continue;
      const m1 = fpow(e, 1.3) * a, m2 = fpow(e, 5.0) * a;
      const i3 = (py * W + px) * 3;
      buf[i3] += m1 * col[0] + m2 * hot[0];
      buf[i3 + 1] += m1 * col[1] + m2 * hot[1];
      buf[i3 + 2] += m1 * col[2] + m2 * hot[2];
    }
  }
}
// Irregular ground splat -- radius wobbled by two harmonics so no circle shows.
function puddle(x, y, rw, rh, col, a, seed, lobes, power) {
  if (a <= 0) return;
  x -= CAMX; y -= CAMY;
  if (lobes === undefined) lobes = 5;
  if (power === undefined) power = 1.1;
  const rng = mulberry32(seed), ph1 = rng.range(0, TAU), ph2 = rng.range(0, TAU);
  const ew = rw * 1.32, eh = rh * 1.32;
  const x0 = Math.max(0, Math.floor(x - ew)), x1 = Math.min(W - 1, Math.ceil(x + ew));
  const y0 = Math.max(0, Math.floor(y - eh)), y1 = Math.min(H - 1, Math.ceil(y + eh));
  const iw = 1 / Math.max(rw, 1e-3), ih = 1 / Math.max(rh, 1e-3);
  const c0 = col[0] * a, c1 = col[1] * a, c2 = col[2] * a;
  for (let py = y0; py <= y1; py++) {
    const dy = (py - y) * ih;
    for (let px = x0; px <= x1; px++) {
      const dx = (px - x) * iw, th = Math.atan2(dy, dx);
      const wob = 1 + 0.17 * Math.sin(lobes * th + ph1) + 0.10 * Math.sin((lobes + 3) * th + ph2);
      const d = Math.sqrt(dx * dx + dy * dy) / wob;
      if (d >= 1) continue;
      const m = fpow(1 - d, power), i3 = (py * W + px) * 3;
      buf[i3] += m * c0; buf[i3 + 1] += m * c1; buf[i3 + 2] += m * c2;
    }
  }
}

// Gas volume: overlapping soft cores, never one clean disc.
function cloud(x, y, r, col, a, seed, blobs, squash) {
  if (blobs === undefined) blobs = 8;
  if (squash === undefined) squash = 1;
  const rng = mulberry32(seed);
  for (let i = 0; i < blobs; i++) {
    const ang = rng.range(0, TAU), rr = r * 0.55 * rng();
    core(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * squash,
         r * rng.range(0.4, 0.85), col, a * rng.range(0.5, 1), 1.7);
  }
}

// Radial floor fissures: they sell the weight of an impact better than glow does.
function cracks(x, y, n, length, col, a, seed, squash, thick) {
  if (squash === undefined) squash = 0.5;
  if (thick === undefined) thick = 1.2;
  const rng = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    let ang = (i / n) * TAU + rng.range(-0.3, 0.3);
    const L = length * rng.range(0.5, 1);
    let px = x, py = y;
    for (let s = 0; s < 3; s++) {
      ang += rng.range(-0.35, 0.35);
      const nx = px + Math.cos(ang) * L / 3, ny = py + Math.sin(ang) * L / 3 * squash;
      const f = 1 - s * 0.3;
      line(px, py, nx, ny, thick * (1 - s * 0.22), col, a * f * f);
      px = nx; py = ny;
    }
  }
}
// Ice spike out of the floor. An additive taper saturates through the middle and
// reads as a blunt tube, so both lit edges are drawn from base to tip.
function shard(x, ybase, h, w, col, hot, a, lean) {
  if (lean === undefined) lean = 0;
  const ang = -Math.PI / 2 + lean;
  beam(x, ybase, ang, 0, h, w, 0.5, col, a, 1.8, 0.9);
  const tx = x + Math.cos(ang) * h, ty = ybase + Math.sin(ang) * h;
  line(x + w * 0.34, ybase, tx, ty, 0.8, hot, a * 0.7);
  line(x - w * 0.34, ybase, tx, ty, 0.8, hot, a * 0.5);
  core(tx, ty, 2.0, hot, a * 0.9);
}

function hexshield(x, y, r, col, hot, a, seed, cells) {
  if (cells === undefined) cells = 7;
  const rng = mulberry32(seed), pts = [];
  for (let i = 0; i <= 6; i++)
    pts.push([x + Math.cos(i / 6 * TAU - Math.PI / 2) * r,
              y + Math.sin(i / 6 * TAU - Math.PI / 2) * r * 0.92]);
  polyline(pts, 1.6, col, a);
  polyline(pts, 0.7, hot, a * 0.9);
  core(x, y, r, col, a * 0.35, 3.0);
  for (let k = 0; k < cells; k++) {
    const ang = rng.range(0, TAU), rr = r * rng.range(0.35, 0.88);
    const cx = x + Math.cos(ang) * rr, cy = y + Math.sin(ang) * rr * 0.92;
    const cr = rng.range(3, 6), sub = [];
    for (let i = 0; i <= 6; i++)
      sub.push([cx + Math.cos(i / 6 * TAU) * cr, cy + Math.sin(i / 6 * TAU) * cr * 0.92]);
    polyline(sub, 0.9, col, a * rng.range(0.35, 0.8));
  }
}

// Tick ring: n marks inside radius r, every long_every-th one longer and brighter.
function dial(x, y, r, n, col, a, squash, longEvery, thick, shortL, longL) {
  if (squash === undefined) squash = 1;
  if (longEvery === undefined) longEvery = 5;
  if (thick === undefined) thick = 1;
  if (shortL === undefined) shortL = 0.055;
  if (longL === undefined) longL = 0.115;
  for (let i = 0; i < n; i++) {
    const b = i / n * TAU, big = longEvery > 0 && i % longEvery === 0;
    const L = big ? longL : shortL;
    line(x + Math.cos(b) * r * (1 - L), y + Math.sin(b) * r * squash * (1 - L),
         x + Math.cos(b) * r, y + Math.sin(b) * r * squash,
         thick, col, big ? a : a * 0.5);
  }
}

// Anamorphic cross flare: wide horizontal streak crossed by a shorter vertical one.
function glare(x, y, w, h, col, a) {
  beam(x, y, 0, 0, w, 1.7, 0.35, col, a, 1.2, 1.7);
  beam(x, y, Math.PI, 0, w, 1.7, 0.35, col, a, 1.2, 1.7);
  beam(x, y, -Math.PI / 2, 0, h, 1.2, 0.35, col, a * 0.8, 1.2, 1.7);
  beam(x, y, Math.PI / 2, 0, h, 1.2, 0.35, col, a * 0.8, 1.2, 1.7);
}
// Flat target mark: a closed thin ellipse plus inward ticks. A *broken* ring squashed
// to 40% fuses into a pair of little wings, which is not a target.
function reticle(x, y, r, col, a, squash, ticks, thick) {
  if (squash === undefined) squash = 0.42;
  if (ticks === undefined) ticks = 8;
  if (thick === undefined) thick = 1.2;
  ring(x, y, r, thick, col, a, squash, 1.2);
  dial(x, y, r, ticks, col, a * 0.9, squash, 2, thick, 0.16, 0.30);
  core(x, y, 2.4, col, a * 0.9, 1.5);
}

// Flat additive wash. Above ~0.02 it pushes the floor tones off the 16-step grid and
// the whole arena visibly turns olive/maroon -- sell effects with geometry, not a wash.
function veil(col, a) {
  for (let i = 0; i < NP; i++) {
    const i3 = i * 3;
    buf[i3] += col[0] * a; buf[i3 + 1] += col[1] * a; buf[i3 + 2] += col[2] * a;
  }
}

// *Removes* light: the only way to draw a true void. resolve() clamps at zero.
function unlight(x, y, r, a, power) {
  if (power === undefined) power = 1.2;
  x -= CAMX; y -= CAMY;
  const rr = Math.max(r, 1e-3);
  const x0 = Math.max(0, Math.floor(x - rr)), x1 = Math.min(W - 1, Math.ceil(x + rr));
  const y0 = Math.max(0, Math.floor(y - rr)), y1 = Math.min(H - 1, Math.ceil(y + rr));
  for (let py = y0; py <= y1; py++) {
    const dy = py - y;
    for (let px = x0; px <= x1; px++) {
      const dx = px - x, d = Math.sqrt(dx * dx + dy * dy) / rr;
      if (d >= 1) continue;
      const m = fpow(1 - d, power) * a, i3 = (py * W + px) * 3;
      buf[i3] -= m; buf[i3 + 1] -= m; buf[i3 + 2] -= m;
    }
  }
}
