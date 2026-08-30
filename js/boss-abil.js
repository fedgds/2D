"use strict";
// ===========================================================================
// 6d. Boss abilities -- the twelve moves sketched in images/skills/boss/.
//
//     A normal monster's warning is a disc, a wedge or a lance: one shape, static, gone in
//     one beat. Every sketch in that folder is instead something that *moves through* the
//     marked ground -- a blade sweeping, six meteors landing one after another, a wave front
//     leaving a wedge, a ring collapsing inward, your own footprints being walked by
//     something else. So the shape vocabulary grows by nine entries, and each one keeps the
//     four promises 6b makes, without exception:
//
//       * the ground is marked at full size on the first frame. What travels inside it is
//         the *timing*, never the extent -- you are told where before you are told when;
//       * hard red edge, ability-coloured fill, one bright element running out to that edge
//         as the clock, flicker in the last fifth, dry tick 0.20 s before impact;
//       * geometry in the unsquashed frame, art squashed back by GSQ, so what is marked is
//         exactly what hurts. `tools/check-boss.js` asserts that pair for all twelve;
//       * the caster is interruptible for the whole wind-up. Freeze a boss and its meteors
//         never arrive; that is 6b's `stepTel` doing it, and none of this code opts out.
//
//     Five of the twelve hurt continuously rather than on beats (`sample`), because a wave
//     front you can walk through between two `ticks[]` entries is a lie about the picture.
//     Those keep their own `e.got` ledger so one wave, one lane or one ghost can collect a
//     given hero exactly once.
// ===========================================================================

// Boom progress: 0 at impact, 1 at the end of the entry. `stepTel` hands `q` to the draw
// routines but not to `hit`, and the moving hitboxes below need it in both.
const bq = e => c01((e.t - e.ab.tell) / Math.max(e.dur - e.ab.tell, 1e-3));
// Which way a sweep or a spiral turns. Derived from the cast seed rather than fixed, so the
// answer is "watch the bright edge", never "it always goes left".
const bdir = e => (e.seed & 1) ? 1 : -1;
const bangd = (a, b) => ((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI;
// Local (unsquashed, caster-relative) to world. Every shape below computes in the first and
// draws in the second; mixing them up is the one bug that would break "marked == hurts".
const bwx = (e, lx) => e.x + lx;
const bwy = (e, ly) => e.y + ly * GSQ;
// Distance from p to segment ab, all in the unsquashed frame.
function bseg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 < 1e-6 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

// The house grammar for one marked patch of floor, so nine shapes cannot drift apart: tinted
// fill, hard red edge, ticks, and one bright ring travelling out to that edge as the clock.
function bdisc(e, x, y, r, k, urg, fl, eg, col, sd) {
  puddle(x, y, r, r * GSQ, col, 0.15 + 0.09 * urg, sd, 9, 1.4);
  ring(x, y, r, 1.5, WARN, 0.55 * eg, GSQ, 1.5);
  if (r > 20) dial(x, y, r, 12, WARN, 0.24 * eg, GSQ, 3, 1);
  ring(x, y, Math.max(1.5, r * k), 1.9, WARN_H, 0.55 * fl, GSQ, 1.6);
}
// The same grammar for a lane instead of a patch: tinted body, two hard edges, bright head
// running to the far end. The painted half-width is in screen space while the hit test is in
// the unsquashed frame -- exactly the compromise 6b's lance already makes, and settled the
// same way: the test uses 0.9 of it, so the player gets the benefit of the doubt.
function blane(e, ang, r0, r1, th, k, fl, eg, col) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const ax = bwx(e, c * r0), ay = bwy(e, s * r0);
  const bx = bwx(e, c * r1), by = bwy(e, s * r1);
  const sa = Math.atan2(by - ay, bx - ax);
  const nx = -Math.sin(sa) * th, ny = Math.cos(sa) * th;
  line(ax, ay, bx, by, th, col, 0.19 + 0.10 * eg, 0.8);
  line(ax + nx, ay + ny, bx + nx, by + ny, 1.0, WARN, 0.48 * eg);
  line(ax - nx, ay - ny, bx - nx, by - ny, 1.0, WARN, 0.48 * eg);
  const hk = Math.max(0.03, k);
  line(ax, ay, ax + (bx - ax) * hk, ay + (by - ay) * hk, th * 0.45, WARN_H, 0.40 * fl, 1.2);
  core(ax + (bx - ax) * hk, ay + (by - ay) * hk, 2.8, WARN_H, 0.75 * fl);
}

// Boss-wide punctuation. Shape code remains responsible for the exact hit area; these four
// helpers only supply the two things every boss move was missing in motion: a visible lock and
// charge before release, then a very short white-hot impulse that makes release a new beat rather
// than the same drawing with its red outline removed.
//
// The outer boundary of the whole move, in the same terms `tools/check-boss.js` measures it, but
// only for the five shapes whose mark really is a disc round its centre. Nine shapes each draw
// their own edge in their own idiom, and a player who has not learned that idiom yet still needs
// one line that says "this circle is the move" -- but a wedge, a fan of lanes or a rank of wave
// fronts is *not* a circle, and a ring round those would claim ground they never touch. A lying
// ring is worse than no ring, so those four return 0 and keep their own outline instead. Kept
// identical to the checker's `bnd` where it does return a number: if the two ever drift, the
// promise that what is marked is what hurts drifts with them.
function bossReach(A) {
  switch (A.shape) {
    case 'rain': case 'smite': return A.r + A.nr;
    case 'veins': case 'spokes': return A.r + A.thick * 0.9;
    case 'web': case 'sigil': return A.r + Math.max(A.nr, A.thick * 0.9);
    case 'spiral': case 'vortex': return A.r;
    default: return 0;    // sweep, waves, blades, echo: directional or a trail, never a disc
  }
}
function bossTellAccent(e, k, urg, fl, eg) {
  const A = e.ab, R = bossReach(A);
  const rr = 19 - 9 * eo(k), pulse = 0.78 + 0.22 * Math.sin(k * TAU * 4);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i / 4 * TAU;
    chevron(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr * GSQ,
      a + Math.PI, 4.6, WARN_H, (0.34 + 0.34 * k) * fl, 1.0, 0.7);
  }
  ring(e.x, e.y, 6 + 4 * (1 - k), 1.2, WARN, (0.38 + 0.34 * urg) * pulse, GSQ, 1.5);
  // Dotted rather than solid, because nothing crosses it and a solid ring would claim the whole
  // disc is marked. It also *closes*: at the start of the wind-up it sits a little outside the
  // true edge and settles onto it as the clock runs, which is the one motion in the whole
  // telegraph that means "time", not "space".
  if (R > 0) {
    dial(e.x, e.y, R, 34, WARN, 0.22 * eg, GSQ, 0, 1.1, 0.03, 0.03);
    ring(e.x, e.y, R * (1 + 0.07 * (1 - k)), 1.0, WARN, (0.24 + 0.20 * urg) * pulse, GSQ, 1.6);
  }
  if (urg > 0) {
    ring(e.x, e.y, 12 + 15 * (1 - urg), 1.5, WARN_H, 0.42 * urg * fl, GSQ, 1.4);
    star(e.x, e.y - 4, WARN_H, 4, 7, 15 + 10 * urg, 1.2, 0.32 * urg * fl,
      e.seed + 701, 0.12);
  }
  // The last sixth of the wind-up: three hard strobes over the centre of the mark, each one a
  // ring thrown out to a fifth of the reach. This is the cue that survives the thing every other
  // part of the telegraph loses to -- a second move's afterglow lying on top of this one's floor
  // mark, which is what happens constantly now that a boss casts every three seconds. It is
  // deliberately the *only* accent that pulses fast enough to catch peripheral vision.
  const st = c01((k - 0.84) / 0.16);
  if (st > 0) {
    const b = 0.42 + 0.58 * Math.abs(Math.sin(st * Math.PI * 3));
    ring(e.x, e.y, 3 + Math.max(R, 26) * 0.34 * st, 2.8, WARN_H, 0.60 * b, GSQ, 1.3);
    core(e.x, e.y, 5 + 8 * st, WARN_H, 0.34 * b, 1.8);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + st * 1.1;
      chevron(e.x + Math.cos(a) * 11, e.y + Math.sin(a) * 11 * GSQ, a + Math.PI,
        5.4, WARN, 0.52 * b, 1.3, 0.7);
    }
  }
}
function bossTellCharge(w, e, k, urg, fl) {
  const o = e.owner;
  if (!o || o.dying) return;
  const cy = midY(o), rr = 19 - 10 * eo(k);
  for (let i = 0; i < 4; i++) {
    const a = e.seed * 0.003 + i / 4 * TAU + k * 3.2;
    const x = o.x + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.68;
    core(x, y, 1.3 + 1.1 * k, i & 1 ? e.ab.hot : WARN_H, 0.42 + 0.35 * k, 1.4);
    line(x, y, o.x, cy, 0.7, e.ab.col, 0.20 + 0.22 * k, 1.4, 0.7);
  }
  // A tiny universal alarm survives every palette and every busy floor. Hero-targeted moves
  // pin the captured position; self/directional moves put it over the caster you can interrupt.
  // Nineteen pixels up, not twelve: the boss HP bar owns the four rows just above the head, and
  // an alarm sharing them is an alarm you read as part of the bar.
  const tx = e.ab.aim === 'hero' ? e.x : o.x;
  const ty = e.ab.aim === 'hero' ? e.y - 22 : o.y - o.h - 19;
  // In the last sixth the alarm doubles and rides a bar that empties left to right, so the
  // wind-up has a readable *quantity* of time left rather than only a brightness. A bar is worth
  // the eight pixels: brightness is a thing you compare against a memory of the last cast, and
  // length is a thing you read once.
  const st = c01((k - 0.84) / 0.16);
  text3x5('!', Math.round(tx - 1), Math.round(ty), WARN_H,
    (0.72 + 0.28 * urg) * (0.86 + 0.14 * fl));
  if (urg > 0) {
    const bw = 13;
    line(tx - bw, ty + 7, tx + bw, ty + 7, 0.8, WARN, 0.30 * urg);
    line(tx - bw, ty + 7, tx - bw + 2 * bw * (1 - k), ty + 7, 1.8, WARN_H, 0.72 * urg);
    glare(o.x, cy, 18 + 26 * urg, 9 + 15 * urg, WARN_H, 0.42 * urg * fl);
    star(o.x, cy, e.ab.hot, 8, 5, 17 + 16 * urg, 1.4, 0.38 * urg * fl,
      e.seed + 709, 0.22);
  }
  if (st > 0) {
    const b = 0.42 + 0.58 * Math.abs(Math.sin(st * Math.PI * 3));
    text3x5('!', Math.round(tx - 6), Math.round(ty - 1), WARN, 0.62 * b);
    text3x5('!', Math.round(tx + 4), Math.round(ty - 1), WARN, 0.62 * b);
    core(o.x, cy, 7 + 11 * st, WARN_H, 0.30 * b, 1.9);
  }
}
// Release. Two shockwaves rather than one: the white impulse on the frame of the hit, then a
// second, wider, colour-only ring a tenth of a second behind it. One ring reads as a flash on the
// floor; two read as something displacing air, and the gap between them is what gives a 320x180
// frame a sense of scale it cannot get from size alone.
function bossImpactUnder(e, q, fd) {
  const hit = 1 - c01(q / 0.24), go = eo(c01(q / 0.26));
  if (hit <= 0) return;
  const reach = 18 + Math.min(34, (e.ab.r || 36) * 0.34);
  ring(e.x, e.y, 5 + reach * go, 4.2 - 2.6 * go, e.ab.hot, 0.86 * hit, GSQ, 1.1);
  ring(e.x, e.y, 4 + reach * 0.68 * go, 1.3, WHITE, 0.68 * hit, GSQ, 1.4);
  const g2 = eo(c01((q - 0.10) / 0.30));
  if (g2 > 0)
    ring(e.x, e.y, 5 + reach * 1.35 * g2, 2.6 - 1.7 * g2, e.ab.col, 0.46 * hit * (1 - g2 * 0.4),
      GSQ, 1.2);
  cracks(e.x, e.y, 11, 15 + reach * 0.62 * go, e.ab.col, 0.42 * hit,
    e.seed + 727, 0.48, 1.2);
}
function bossImpactMid(e, q, fd, g) {
  const hit = 1 - c01(q / 0.24);
  if (hit <= 0) return;
  const cy = e.y - 6, reach = 30 + Math.min(36, (e.ab.r || 40) * 0.26);
  star(e.x, cy, e.ab.hot, 14, 4, reach * (0.72 + 0.52 * eo(q)), 2.6,
    0.96 * hit, e.seed + 733, 0.35);
  star(e.x, cy, WHITE, 6, 3, reach * 0.58, 1.3, 0.78 * hit, e.seed + 739, 0.20);
  glare(e.x, cy, 36 + 40 * g, 19 + 23 * g, WHITE, 0.78 * hit);
  core(e.x, cy, 10 * g, e.ab.hot, 1.0 * hit, 1.8);
  core(e.x, cy, 4.5 * g, WHITE, 1.3 * hit, 1.5);
  // Debris thrown up and out, then a low skirt of it kicked along the floor. The skirt is the
  // half that makes the blast read as *ground* rather than as a light on the ground.
  sparks(e.x, cy, 20, 4, reach * 0.78, e.ab.hot, 0.82 * hit, e.seed + 743,
    1.1, 0.76, 0, TAU, 9);
  sparks(e.x, e.y - 1, 14, 6, reach * (0.5 + 0.7 * eo(q)), e.ab.col, 0.56 * hit,
    e.seed + 747, 1.2, 0.34, 0, TAU, 11);
}

// ---- Sứ Giả Hư Không: a drawing vocabulary of its own ---------------------------------
// The other two bosses put geometry on the floor -- a wedge, a fan of lanes, a ring closing in.
// This one *writes* on it, and a written mark needs strokes that look drawn instead of plotted.
// So its four moves share six helpers rather than each inventing its own look: the kit reads as
// one hand, and "more detail" stays one edit rather than four.
//
// One stroke of ink. `t` is how much of it has been laid down, which is the whole reason this
// exists: a link that is half drawn has to be the *same object* as the finished one, or the
// progressive draw would be a different picture every fifth of the wind-up. Jagged from a seed,
// never straight -- a straight line reads as a wire, and none of these sketches is a wire.
function vhInk(ax, ay, bx, by, t, thick, col, hot, a, seed, jg) {
  if (t <= 0 || a <= 0) return;
  const x1 = ax + (bx - ax) * t, y1 = ay + (by - ay) * t;
  const pts = jag(ax, ay, x1, y1, 5, jg === undefined ? 1.7 : jg, mulberry32(seed));
  polyline(pts, thick * 1.9, col, a * 0.24, 2.0);
  polyline(pts, thick, col, a * 0.78);
  polyline(pts, Math.max(0.7, thick * 0.32), hot, a);
}
// A rune. Three chords of a tiny circle and a dot in the middle -- not a letter and not meant to
// read as one. What it has to do is be *dense* at five pixels across, because a knot drawn as a
// ring is a ring, and a ring with something inside it is a symbol.
function vhGlyph(x, y, r, rot, col, a, seed, squash) {
  if (a <= 0) return;
  const sq = squash === undefined ? GSQ : squash, rng = mulberry32(seed | 0);
  for (let i = 0; i < 3; i++) {
    const a0 = rot + rng.range(0, TAU), a1 = a0 + rng.range(1.9, 2.9);
    line(x + Math.cos(a0) * r, y + Math.sin(a0) * r * sq,
      x + Math.cos(a1) * r, y + Math.sin(a1) * r * sq, 0.8, col, a);
  }
  core(x, y, 1.3, col, a * 1.15);
}
// Beads running along a chord. This is what turns one 90 px line into a chain of marks: the
// figure is still complete and static, but something is *moving* inside every stroke of it, which
// is the difference between a diagram and a thing that is charging.
function vhBeads(ax, ay, bx, by, n, ph, r, col, a) {
  if (a <= 0) return;
  for (let i = 0; i < n; i++) {
    const t = ((i + ph) % n) / n;
    core(ax + (bx - ax) * t, ay + (by - ay) * t, r, col,
      a * (0.35 + 0.65 * Math.sin(t * Math.PI)), 1.5);
  }
}
// Rungs across a lane. Same trick for a channel instead of a chord, and it stays strictly inside
// the lane's own half-width, so it adds texture without claiming a pixel of extra ground.
function vhRungs(ax, ay, bx, by, n, th, col, a, phase) {
  if (a <= 0) return;
  const sa = Math.atan2(by - ay, bx - ax);
  const nx = -Math.sin(sa) * th, ny = Math.cos(sa) * th;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, s = 0.42 + 0.58 * Math.sin((t + (phase || 0)) * Math.PI * 2);
    const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
    line(x - nx * s, y - ny * s, x + nx * s, y + ny * s, 0.8, col, a * (0.5 + 0.5 * s));
  }
}
// A comet: head, tail trailing back along its own line of travel, a couple of sparks shed
// sideways. The vortex is thirty of these, and a spiral drawn as thirty comets reads as debris
// being thrown outward while the identical spiral drawn as a curve reads as a diagram of one.
function vhComet(x, y, ang, len, r, col, hot, a, seed) {
  if (a <= 0) return;
  beam(x, y, ang + Math.PI, 0, len, r * 1.5, 0.25, col, a * 0.52, 1.1, 0.9);
  core(x, y, r * 1.7, col, a * 0.70, 1.6);
  core(x, y, r * 0.72, hot, a * 1.05);
  sparks(x, y, 3, 1, len * 0.55, hot, a * 0.46, seed | 0, 0.9, GSQ,
    ang + Math.PI - 0.8, ang + Math.PI + 0.8, 3);
}
// Segment intersection in the unsquashed frame, used once at cast time to find where a star's
// own chords cross. The inner ring of a pentagram is not a separate drawing decision -- it is
// already implied by the five strokes, and solving for it means a `skip` of 2 or 3 and any point
// count all produce the right figure instead of one hard-coded pentagon.
function vhX2(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-6) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  return [a[0] + rx * t, a[1] + ry * t];
}

// ---- Chúa Lò: a drawing vocabulary of its own ------------------------------------------
// The herald writes on the floor; this one breaks it. Fire and torn ground share one problem in a
// 320x180 additive buffer: the honest way to draw either is a bright blob, and a bright blob has no
// silhouette, no grain and no direction -- which is the whole of what was wrong with these four
// moves. Every helper here exists to put an edge back onto something that would otherwise be a
// wash: an outline round the rock, teeth on the flame, a hole under the rubble, a wavefront on the
// crack. Four moves share the kit, so "more detail" stays one edit instead of four.
//
// A chunk of rock: closed irregular polygon, lit rim, dim body. The radii are drawn into an array
// *before* the outline is built, and that is not tidiness -- the closing vertex is vertex 0 again,
// and an rng asked twice answers twice, which comes out as a rock with a seam sliced through it.
function flRock(x, y, r, rot, col, hot, a, seed, squash) {
  if (a <= 0 || r <= 0.4) return;
  const sq = squash === undefined ? GSQ : squash, rng = mulberry32(seed | 0), n = 6, rr = [];
  for (let i = 0; i < n; i++) rr.push(r * rng.range(0.58, 1.30));
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const b = rot + (i % n) / n * TAU, q = rr[i % n];
    pts.push([x + Math.cos(b) * q, y + Math.sin(b) * q * sq]);
  }
  polyline(pts, Math.max(0.7, r * 0.22), col, a * 0.58, 1.8);
  polyline(pts, 0.7, hot, a);
  core(x, y, r * 0.55, col, a * 0.30, 1.7);
}
// A tongue of flame standing off the floor: three stacked licks of falling width sharing one lean,
// so what rises has a *shape* on any given frame rather than a wobble. `ph` (0..1) is the only
// animated input and the caller owns it, which is what keeps a dozen plumes on one stroke from all
// flickering in step -- twelve flames breathing together is one flame drawn twelve times.
function flPlume(x, y, h, w, col, hot, a, seed, ph) {
  if (a <= 0 || h <= 0.5) return;
  const rng = mulberry32(seed | 0), p = ph || 0;
  const lean = rng.range(-0.34, 0.34), sway = Math.sin(p * TAU + (seed | 0) * 0.017) * 0.26;
  for (let i = 0; i < 3; i++) {
    const f = 1 - i * 0.28, hh = h * f * (0.76 + 0.24 * Math.sin(p * TAU + i * 1.7));
    beam(x, y, -Math.PI / 2 + lean + sway * (i + 1) * 0.5, 0, hh, w * f + 0.45, 0.3,
      i === 2 ? hot : col, a * (0.70 - i * 0.13), 1.5, 0.85);
  }
  const ta = -Math.PI / 2 + lean + sway * 2;
  core(x + Math.cos(ta) * h * 0.80, y + Math.sin(ta) * h * 0.80, w * 0.5 + 0.7, hot, a * 0.85, 1.5);
}
// One piece of collapsed floor: the rock, the hole it came out of, and a rim of light while it is
// still hot. `heat` 1 is "it went just now", 0 is "it went a while ago and only the hole is left".
// The hole is `unlight` on purpose -- this ground is already glowing, so one more bright thing added
// to it reads as more fire, while light *removed* reads as a piece of floor that is no longer there.
function flRubble(x, y, r, col, hot, a, seed, heat) {
  if (a <= 0) return;
  const h = heat === undefined ? 0 : c01(heat);
  unlight(x, y + 1, r * 0.95, 0.26 * a, 1.4);
  if (h > 0.02) {
    puddle(x, y, r * 0.9, r * 0.9 * GSQ, hot, 0.26 * a * h, seed + 3, 7, 1.5);
    core(x, y, r * 0.5, WHITE, 0.30 * a * h * h, 1.6);
  }
  flRock(x - r * 0.28 * h, y - r * 0.58 * h, r * 0.70, (seed | 0) * 0.011,
    col, h > 0.3 ? WARN_H : col, a * (0.60 + 0.40 * h), seed + 11);
  if (h > 0.3)
    sparks(x, y, 3, 1, r * 1.6, hot, 0.40 * a * h, seed + 21, 0.9, GSQ, -2.6, -0.5, 4);
}
// A fissure, drawn as four passes along one jagged path: wide dim body, coloured body, hot spine,
// white core. `t` is how much of the path has opened, walked by arc length so a root a third open is
// a third of *this* root rather than a smaller copy of it. One line is a line; four is a crack with
// something at the bottom of it. Returns the tip, because every caller wants a head there.
function flRoot(pts, t, thick, col, hot, a, glow) {
  if (a <= 0 || t <= 0 || pts.length < 2) return null;
  let tot = 0;
  for (let i = 1; i < pts.length; i++)
    tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const want = tot * c01(t), cut = [pts[0]];
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (run + seg <= want || seg < 1e-6) { cut.push(pts[i]); run += seg; continue; }
    const f = c01((want - run) / seg);
    cut.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f,
              pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]);
    break;
  }
  if (cut.length < 2) return cut[0];
  polyline(cut, thick * 1.55, col, a * 0.20, 2.2);
  polyline(cut, thick, col, a * 0.62);
  polyline(cut, Math.max(0.7, thick * 0.36), hot, a * 0.90);
  if (glow > 0) polyline(cut, Math.max(0.6, thick * 0.14), WHITE, a * glow, 1.6);
  return cut[cut.length - 1];
}

// ---- Vua Băng: a drawing vocabulary of its own -----------------------------------------------
// Frost light is pale, and so is the ice arena's floor. A stroke drawn in one pale colour at one
// alpha is therefore a stroke that disappears, which is exactly what all four of these moves did:
// correct geometry, no image. Everything sharp in this kit is drawn as the same four-layer ramp
// instead -- a *saturated* halo wide enough to lift the stroke off the floor, the body in the
// ability's colour, a pale lip, and a white core about a pixel across.
//
// The halo is #2f8fdc and not a dimmer #cfe0ff on purpose. In an additive buffer quantised to 16
// levels a channel only shows once it clears 1/15, so a pale tone at 0.3 alpha lands under the
// first step on every channel at once and comes out as grey fog; a saturated one puts its whole
// budget on two channels and comes out as blue *light*. Saturation is what carries at low alpha.
const FK_HALO = C.ice;
// And a second one for *areas*. #2f8fdc spends so little on red that a wide fill at the 0.2-0.3 an
// interior can afford leaves red under the first quantisation step while green and blue clear it --
// a cone filled with it came out dark teal, which on this floor reads as murk rather than as light.
// #5a9cff clears the step on all three in the right order (1:2:3) and reads as blue at the same
// alpha. Strokes keep the saturated tone, because there the halo is narrow and next to a bright
// body: it is the wide dim shapes that expose the ratio.
const FK_FILL = C.voltc;

// One straight lit stroke. `th` is the half-width of the body and the other three layers are
// derived from it, so a single number controls a whole edge and no two callers can drift apart.
function fkStroke(ax, ay, bx, by, th, col, hot, a) {
  if (a <= 0.005) return;
  line(ax, ay, bx, by, th * 2.2, FK_HALO, a * 0.34, 1.1);
  line(ax, ay, bx, by, th, col, a * 0.78, 1.5);
  line(ax, ay, bx, by, Math.max(th * 0.40, 0.55), hot, a * 0.90, 2.1);
  line(ax, ay, bx, by, Math.max(th * 0.15, 0.34), WHITE, a * 0.80, 2.5);
}

// A radial edge on the squashed floor with a real thickness taper: thick where it leaves the
// caster, a point where it ends. `beam` already tapers, but `beam` is straight in screen space and
// every edge here runs along the floor's squashed radius, so it is walked in `n` pieces with the
// width ramped across them.
function fkTaper(e, ang, r0, r1, w0, w1, col, a, n, sharp) {
  if (a <= 0.005) return;
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let j = 0; j < n; j++) {
    const t0 = j / n, t1 = (j + 1) / n;
    const ra = r0 + (r1 - r0) * t0, rb = r0 + (r1 - r0) * t1;
    line(bwx(e, c * ra), bwy(e, s * ra), bwx(e, c * rb), bwy(e, s * rb),
      Math.max(w0 + (w1 - w0) * t0, 0.35), col, a, sharp || 1.5);
  }
}

// Energy running along a link. Each pulse is a short streak, not a dot: a dot on a line is a bead,
// and a bead does not read as *flow* until it has a tail saying which way it is going. Both ends
// of the trip are dark, so nothing pops into or out of existence at a node.
function fkFlow(ax, ay, bx, by, n, ph, col, hot, a, len) {
  if (a <= 0.01) return;
  const dx = bx - ax, dy = by - ay;
  for (let i = 0; i < n; i++) {
    let u = (ph + i / n) % 1;
    if (u < 0) u += 1;
    const f = Math.sin(Math.PI * u);
    if (f < 0.08) continue;
    const u1 = Math.min(u + len, 1);
    line(ax + dx * u1, ay + dy * u1, ax + dx * u, ay + dy * u, 1.4, col, a * f * 0.75, 1.7);
    core(ax + dx * u1, ay + dy * u1, 1.7, hot, a * f, 1.7);
  }
}

// One frost knot. Every knot in a lattice is the same size and the same brightness on purpose --
// letting them vary made the net read as unfinished rather than alive. What varies is *when* each
// one brightens: `ph` staggers the twinkle so the net breathes out of step with itself, which is
// the whole difference between a diagram and a thing that is switched on.
function fkNode(x, y, r, col, hot, a, ph, seed) {
  if (a <= 0.01) return;
  const tw = 0.72 + 0.28 * Math.sin(ph);
  core(x, y, r * 1.6, FK_HALO, a * 0.30 * tw, 2.2);
  ring(x, y, r, 0.9, col, a * 0.90 * tw, GSQ, 2.1);
  core(x, y, r * 0.44, hot, a * 0.95 * tw, 1.7);
  core(x, y, r * 0.18, WHITE, a * 0.85 * tw, 2.0);
  const rng = mulberry32(seed);
  for (let i = 0; i < 3; i++) {
    const b = rng.range(0, TAU), L = r * rng.range(1.4, 2.2);
    line(x, y, x + Math.cos(b) * L, y + Math.sin(b) * L * GSQ, 0.7, col, a * 0.55 * tw, 2.1);
  }
}

// "This one is aimed at you." The hero carries a warm floor lamp of its own in every frame of
// every fight (heroLight, js/scene.js), so a warm patch under the feet says nothing; a ring that
// *closes* onto the captured spot says it in one frame and cannot be mistaken for the lamp.
function fkLock(e, x, y, k, fl, hot) {
  const pl = 0.70 + 0.30 * Math.sin(e.t * 15);
  reticle(x, y, 12 + 10 * (1 - k), hot, 0.60 * pl * fl, GSQ, 8, 1.1);
  ring(x, y, 7, 1.0, WARN, 0.58 * pl, GSQ, 1.9);
  core(x, y, 5.0, WARN_H, 0.55 * pl * fl, 1.6);
  core(x, y, 2.0, WHITE, 0.70 * pl * fl, 2.0);
  for (let i = 0; i < 4; i++) {
    const b = Math.PI / 4 + i / 4 * TAU, rr = 16 + 12 * (1 - k);
    chevron(x + Math.cos(b) * rr, y + Math.sin(b) * rr * GSQ, b + Math.PI,
      4.4, WARN_H, 0.50 * fl, 1.1, 0.7);
  }
}

// A hard, short flash where something is released or lands. Three frames of it at most: any longer
// and it stops being an event and becomes a lamp sitting on the floor.
function fkFlash(x, y, r, col, hot, a, seed) {
  if (a <= 0.012) return;
  glare(x, y, r * 2.3, r * 1.1, WHITE, 0.62 * a);
  core(x, y, r * 0.95, hot, 0.80 * a, 1.7);
  core(x, y, r * 0.36, WHITE, 0.95 * a, 2.0);
  ring(x, y, r * 1.5, 1.1, col, 0.60 * a, GSQ, 2.1);
  sparks(x, y, 8, r * 0.4, r * 2.0, hot, 0.62 * a, seed, 1.0, 0.85, 0, TAU, 6);
}

const BOSS_SHAPE = {
  // ---- sweep: one slow sword-stroke, and burnt ground behind it ------------------
  // The marked ground is everything the blade will pass over; the blade itself is a strip of
  // constant width laid along the radius, and where it has got to is the clock. Two answers, both
  // legible from the picture: stand inside `r0` and let it pass over your head, or leave the
  // annulus sideways -- and there is time to, because it crosses 172 degrees in 2.2 seconds.
  //
  // One stroke, not two. The version that swung back made the first half a feint: "which way is it
  // going" stopped being a question worth answering, because the answer was "both".
  //
  // The blade is drawn as a blade -- two hard edges, a fuller, a cross-guard, a point, and four
  // hard-edged afterimages behind it. It used to be a stack of arcs laid *along* the sweep, which
  // is the shape of a smear and not the shape of a sword: an arc is the blade's *path*, and drawing
  // the path is exactly how you get smoke. And the floor it crosses does not go back to normal --
  // it chars, and stays charred for the rest of the cast. That burnt ground is the only record of
  // where the blade has been, and without it a 2.2-second swing has no history at all.
  sweep: {
    init(w, e) {
      const A = e.ab, rng = mulberry32(e.seed), s = bdir(e), half = A.span + 0.12;
      e.got = 0;
      // `u` is where a patch sits *along the stroke*, measured from the edge the blade starts on.
      // That one number answers both "has the edge reached it" and "how long ago", which is the
      // whole of what the burning needs to know, so it is the only thing stored per patch.
      // The world position is stored with it: the centre cannot move for the life of a cast, and
      // a hundred and thirty patches redrawn every frame is not the place to recompute two sines.
      // The count is what decides whether the trail reads as one burnt swath or as a scatter of
      // spots; at eighty-eight the annulus is wide enough that they never touch.
      e.rb = [];
      for (let i = 0; i < 130; i++) {
        const u = rng.range(-half, half), a = e.ang + s * u,
              r = A.r0 + (A.r - A.r0) * Math.sqrt(rng());
        e.rb.push({ u, a, sz: rng.range(3.2, 8.0), sd: (e.seed + i * 37) | 0,
                    lo: rng.int(5, 9), cr: i % 3 === 0,
                    x: bwx(e, Math.cos(a) * r), y: bwy(e, Math.sin(a) * r) });
      }
    },
    // One stroke, at a constant angular speed. Constant is the point: a swing eased to arrive fast
    // at the far end is a swing whose safe side is only safe if you have read the easing curve.
    at(e, q) { return e.ang + bdir(e) * e.ab.span * (1 - 2 * c01(q)); },
    hit(w, e, l) {
      const A = e.ab, d = Math.hypot(l.x, l.y);
      if (d > A.r + HERO_R || d < A.r0 - HERO_R) return false;
      // A blade has a width, not an angle. `atan2(bw, d)` is that width expressed as an angle at
      // this distance, so the strip is as thick at the hilt as at the point -- which is what lets
      // the drawing be a sword instead of a fan. `arc` is the padding the mark adds on top, so the
      // painted wedge still covers the strip at the hilt end, where it is widest in angle.
      const half = (e.fired ? 0 : A.span) + Math.atan2(A.bw + HERO_R, Math.max(d, 1));
      const c = e.fired ? this.at(e, bq(e)) : e.ang;
      if (Math.abs(bangd(Math.atan2(l.y, l.x), c)) > half) return false;
      if (!e.fired) return true;
      // The blade crossing you is one hit; the same stroke covering you on nine consecutive frames
      // is still one.
      if (e.got) return false;
      e.got = 1; return true;
    },
    // Where the edge has got to, measured along the stroke from its start edge -- the same scale
    // the patches' `u` is on, so "has this ground burnt yet" is one comparison.
    ub(e, q) { return bdir(e) * bangd(this.at(e, q), e.ang); },
    // Tangential half-width at radial fraction `u`: a short ricasso at the hilt, full width through
    // the body, the last fifth tapered to a point.
    wid(A, u) {
      return u > 0.82 ? A.bw * 0.98 * (1 - (u - 0.82) / 0.18)
        : A.bw * (0.52 + 0.48 * c01(u / 0.15));
    },
    // A point on the blade: `t` px out along the stroke angle, `o` px sideways off its spine. Both
    // unsquashed caster-local, squash applied last -- the same order the hit test works in, which is
    // the only reason the drawn edge and the cutting edge are the same edge.
    bpt(e, a, t, o) {
      const c = Math.cos(a), s = Math.sin(a);
      return [bwx(e, c * t - s * o), bwy(e, s * t + c * o)];
    },

    // The blade, and the whole point of it is that it is a *shape* rather than a smear: two hard
    // edges meeting at a point, a fuller down the spine, a cross-guard at the hilt. Nothing here is
    // an arc laid along the sweep -- that arc is the blade's *path*, and drawing the path instead of
    // the object is the entire reason the old one read as smoke crossing the floor. The four
    // afterimages behind it are blades as well, hard-edged and narrowing, because that is what fast
    // steel looks like and it is precisely not what a cloud looks like.
    blade(e, a, amp, fl) {
      const A = e.ab, s = bdir(e), rt = A.r - A.r0, N = 15, lead = -s, tail = s;
      const edge = (ang, k, o) => {              // one edge of the blade, at width scale `k`
        const p = [];
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          p.push(this.bpt(e, ang, A.r0 + rt * u, o * this.wid(A, u) * k));
        }
        return p;
      };
      // Afterimages first, so the blade proper draws over them. Each is a narrower blade a little
      // way back along the stroke: hard edges, no fill, dimming fast.
      for (let i = 4; i >= 1; i--) {
        const ga = a + s * 0.052 * i, k = 1 - i * 0.13, al = 0.20 * amp / i;
        if (Math.abs(bangd(ga, e.ang)) > A.span + A.arc) continue;
        polyline(edge(ga, k, lead), 0.7, A.hot, al * 1.3, 2.0);
        polyline(edge(ga, k, tail), 0.7, A.col, al, 1.8);
      }
      // Body: five ribbons at fractions of the local half-width, so the fill follows the taper and
      // the point stays a point instead of ending in a blunt stub.
      for (const f of [0.78, 0.40, 0, -0.40, -0.78])
        polyline(edge(a, 1, f), 1.5, f === 0 ? A.hot : A.col, (f ? 0.26 : 0.34) * amp, 1.7);
      // The fuller, and a white filament inside it. This is the line the eye locks onto, and it is
      // dead straight from hilt to point -- which is the thing that says "steel" and not "flame".
      polyline(edge(a, 1, 0), 0.8, WARN_H, 0.52 * amp, 2.0);
      polyline(edge(a, 1, 0), 0.4, WHITE, 0.44 * amp * fl, 2.2);
      // The two edges are not the same edge: the one going forward is a white line with teeth on
      // it, the one trailing is duller and sheds. Facing has to be readable from a single frame.
      polyline(edge(a, 1, lead), 0.65, WHITE, 0.70 * amp * fl, 2.4);
      polyline(edge(a, 1, lead * 1.14), 0.5, WARN_H, 0.38 * amp * fl, 2.2);
      polyline(edge(a, 1, tail), 0.75, A.col, 0.46 * amp, 1.9);
      for (let i = 2; i < N - 1; i += 2) {
        const u = i / N, t = A.r0 + rt * u, hw = this.wid(A, u);
        const pl = this.bpt(e, a, t, lead * hw);
        chevron(pl[0], pl[1], a + lead * Math.PI / 2, 2.6, WARN_H, 0.40 * amp * fl, 0.8, 0.5);
        const pt = this.bpt(e, a, t, tail * hw);
        sparks(pt[0], pt[1], 3, 1, 7 + 5 * amp, A.col, 0.34 * amp,
          (e.seed + i * 29 + (a * 40 | 0)) | 0, 1.0, GSQ, a + tail * 0.5, a + tail * 1.6, 5);
      }
      // The point, with a little thrown past it: a sword reads as a sword mostly at the tip.
      const tp = this.bpt(e, a, A.r, 0), bd = this.bpt(e, a, A.r + 9 + 6 * amp, 0);
      line(tp[0], tp[1], bd[0], bd[1], 1.1 * amp + 0.3, WARN_H, 0.44 * amp, 2.0, 1);
      core(tp[0], tp[1], 2.6 * amp + 0.8, A.hot, 0.72 * amp, 1.7);
      core(tp[0], tp[1], 1.1 * amp + 0.4, WHITE, 0.80 * amp * fl, 1.6);
      // Cross-guard and grip. The hilt stops the near end reading as a torn-off stub, and it is the
      // marker for `r0` as well -- the circle you can stand inside and be missed.
      const g0 = this.bpt(e, a, A.r0 + 1, -A.bw * 2.1), g1 = this.bpt(e, a, A.r0 + 1, A.bw * 2.1);
      const gm = this.bpt(e, a, A.r0 + 1, 0), h0 = this.bpt(e, a, A.r0 - 11, 0);
      line(g0[0], g0[1], g1[0], g1[1], 1.2, A.hot, 0.56 * amp, 2.0);
      core(g0[0], g0[1], 1.6, WARN_H, 0.50 * amp, 1.6);
      core(g1[0], g1[1], 1.6, WARN_H, 0.50 * amp, 1.6);
      line(h0[0], h0[1], gm[0], gm[1], 1.6, A.col, 0.44 * amp, 1.8);
    },
    // What stands up off it. A floor mark cannot be a wall of fire, so the height lives in the mid
    // layer: tongues rising off the spine, tallest across the middle of the blade, and the brightest
    // one at the tip -- the tip travels furthest and is the part the eye tracks.
    bladeAir(e, a, amp, fl) {
      const A = e.ab, s = bdir(e), rt = A.r - A.r0;
      for (let i = 0; i < 9; i++) {
        const u = (i + 0.5) / 9, t = A.r0 + rt * u;
        const p = this.bpt(e, a, t, s * this.wid(A, u) * 0.6);
        const h = (7 + 16 * Math.sin(u * Math.PI)) * (0.45 + 0.75 * amp);
        beam(p[0], p[1], -Math.PI / 2 + s * 0.22, 0, h, 1.8 * amp + 0.7, 0.35,
          A.col, 0.44 * amp, 1.2, 0.85);
        core(p[0], p[1] - h * 0.88, 1.5 * amp + 0.5, A.hot, 0.54 * amp * fl, 1.6);
        if (i % 2 === 0)
          flPlume(p[0], p[1] - 1, 6 + 12 * amp, 1.9, A.col, A.hot, 0.34 * amp,
            (e.seed + i * 23) | 0, (u * 3 + amp) % 1);
      }
      const tp = this.bpt(e, a, A.r, 0);
      core(tp[0], tp[1] - 3, 3.6 * amp, A.hot, 0.64 * amp, 1.6);
      core(tp[0], tp[1] - 3, 1.5 * amp, WHITE, 0.74 * amp * fl, 1.5);
    },
    // The burnt ground, and this is the part the move was missing. Everything here is *behind* the
    // edge -- ground the stroke has already crossed -- so none of it is a warning and none of it
    // carries the red edge. It is not a wake that fades, either: once a patch has burnt it stays
    // burnt for the rest of the cast, darkened by `unlight` under a charred stain. A trail that
    // heals behind the blade says the swing was a light show; a trail that does not says the swing
    // took the floor with it, and it is the only record of where the blade has already been.
    char(w, e, q) {
      const A = e.ab, ub = this.ub(e, q);
      for (const c of e.rb) {
        if (c.u <= ub) continue;               // not reached yet -- the wind-up outlined it already
        const age = c.u - ub;                  // radians of stroke since the edge crossed it
        const co = c01(age / 0.42);             // 0 = cut just now and glowing, 1 = cold char
        // Scorched, and permanently. The *darkening* is what reads as burnt-out rather than as a
        // stain painted on: additive light can only ever make the floor brighter than it was.
        // The radius is barely wider than the patch and the falloff is tight, which is the whole
        // difference between charred ground and a hole: a hundred and thirty soft dark discs over
        // one sector accumulate, and the first attempt at this darkened the swept half to black.
        unlight(c.x, c.y, c.sz * 1.05, 0.095 + 0.05 * co, 1.7);
        puddle(c.x, c.y, c.sz * 1.15, c.sz * 1.15 * GSQ, A.col,
          0.18 - 0.06 * co, c.sd, c.lo, 1.35);
        if (c.cr) cracks(c.x, c.y, 3, c.sz * 2.6, A.col, 0.26 - 0.12 * co, c.sd, 0.5, 1.0);
        if (co < 1) {                          // still cooling: broken ground with heat left in it
          flRubble(c.x, c.y, c.sz, A.col, A.hot, 0.34 + 0.46 * (1 - co), c.sd, 1 - co);
          if (co < 0.34) {
            const f = 1 - co / 0.34;
            core(c.x, c.y, c.sz * (0.8 + 0.5 * f), A.hot, 0.34 * f, 1.7);
            flRock(c.x, c.y - 1, c.sz * 0.7, c.a + age * 3, A.col, WARN_H, 0.40 * f, c.sd);
          }
        }
      }
    },
    // The fire off it, capped. By the end of the stroke the burnt ground is eighty-eight patches
    // wide, and eighty-eight plumes is exactly the haze this move was accused of the first time.
    // Only the freshly cut edge vents.
    smoke(w, e, q) {
      const A = e.ab, ub = this.ub(e, q);
      let n = 0;
      for (const c of e.rb) {
        if (c.u <= ub) continue;
        const heat = 1 - c01((c.u - ub) / 0.30);
        if (heat <= 0.14 || n++ >= 11) continue;
        flPlume(c.x, c.y - 1, 6 + 15 * heat, 2.0, A.col, A.hot, 0.36 * heat, c.sd,
          (q * 1.7 + c.u) % 1);
        sparks(c.x, c.y - 2, 4, 2, 9 + 13 * heat, A.hot, 0.46 * heat, c.sd + 5,
          1.0, 0.7, -2.4, -0.7, 5);
      }
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab, s = bdir(e), sw = (A.span + A.arc) * 2;
      const rm = (A.r0 + A.r) * 0.5, rt = A.r - A.r0;
      // A 212-degree annulus is the largest mark in the game, and one soft arc 54 px thick across
      // it came out as warm haze -- the shape read as *lighting* rather than as ground. Four narrow
      // bands plus a radial hatch cost the same and read as hatched ground: the hatch is what makes
      // the two straight edges into the sides of a *region* instead of two stray lines.
      for (let i = 0; i < 4; i++)
        arc(e.x, e.y, A.r0 + rt * (0.13 + i * 0.25), e.ang, sw, rt * 0.13,
          A.col, 0.13 + 0.08 * urg, GSQ, 1.2, 1.4);
      for (let i = 0; i <= 12; i++) {
        const a = e.ang + (i / 12 * 2 - 1) * (A.span + A.arc);
        line(bwx(e, Math.cos(a) * A.r0), bwy(e, Math.sin(a) * A.r0),
          bwx(e, Math.cos(a) * A.r), bwy(e, Math.sin(a) * A.r), 0.8, WARN, 0.13 * eg, 1.6);
      }
      // The seams that will burn, outlined whole and in place before anything happens to them. This
      // is the difference between charred ground that reads as the floor giving way and charred
      // ground that reads as paint being added: by the time a patch blackens it was already there.
      for (const c of e.rb)
        flRock(c.x, c.y, c.sz * 0.62, c.a, A.col, WARN, 0.07 + 0.08 * urg, c.sd);
      arc(e.x, e.y, A.r, e.ang, sw, 1.7, WARN, 0.62 * eg, GSQ, 1.4, 1.6);
      arc(e.x, e.y, A.r0, e.ang, sw, 1.3, WARN, 0.46 * eg, GSQ, 1.4, 1.6);
      for (const g of [1, -1]) {
        const a = e.ang + g * (A.span + A.arc);
        line(bwx(e, Math.cos(a) * A.r0), bwy(e, Math.sin(a) * A.r0),
          bwx(e, Math.cos(a) * A.r), bwy(e, Math.sin(a) * A.r), 1.2, WARN, 0.55 * eg);
      }
      // The blade rests on the edge it starts from, in full detail, and the path it will take is
      // spelled out across the whole region: six ranks of chevrons walking from the start edge to
      // the far one, dimming as they go. There is one stroke now, so the arrows can tell the whole
      // truth in one direction -- and the far edge gets a dashed stop line, because where the swing
      // ends is the side that is safe to be standing on.
      const a0 = e.ang + s * A.span, a2 = e.ang - s * A.span;
      for (let j = 1; j <= 6; j++) {
        const aj = a0 - s * A.span * 2 * (j / 7), am = 0.36 - 0.034 * j;
        for (let i = 0; i < 3; i++) {
          const t = A.r0 + rt * (0.22 + i * 0.28);
          chevron(bwx(e, Math.cos(aj) * t), bwy(e, Math.sin(aj) * t),
            aj - s * Math.PI / 2, 3.4, WARN, am * eg, 0.9, 0.75);
        }
      }
      dashline(bwx(e, Math.cos(a2) * A.r0), bwy(e, Math.sin(a2) * A.r0),
        bwx(e, Math.cos(a2) * A.r), bwy(e, Math.sin(a2) * A.r), 9, 0.9, WARN_H, 0.34 * eg);
      this.blade(e, a0, 0.40 + 0.46 * k, fl);
    },
    mid(w, e, k) {
      this.bladeAir(e, e.ang + bdir(e) * e.ab.span, 0.24 + 0.34 * k, 0.5 + 0.5 * k);
    },
    // `fade(q, …)` is the right envelope for an explosion and the wrong one for a stroke that is
    // still swinging. The stroke runs the whole entry, q 0 -> 1, and `fade` is down to 0.17 by
    // q = 0.69 and 0.01 by q = 0.91. `hit` does not consult brightness, so the last third of the
    // swing was cutting at full damage while being drawn as a wisp: not a dodge, a coin flip. The
    // entry keeps its own envelope instead -- up in a tenth of a second, flat across the stroke, and
    // let go only once the blade has actually stopped.
    vis(q) { return pop(q, 0.06) * (1 - 0.62 * c01((q - 0.93) / 0.07)); },
    boomUnder(w, e, q, fd) {
      const A = e.ab, a = this.at(e, q), v = this.vis(q), rt = A.r - A.r0;
      // The burning first, so the blade draws over the ground it has just taken rather than under it.
      this.char(w, e, q);
      // The far edge stays lit for the whole stroke: it is where the blade stops, and that is the
      // one number still worth having once you have committed to a direction.
      const a2 = e.ang - bdir(e) * A.span;
      dashline(bwx(e, Math.cos(a2) * A.r0), bwy(e, Math.sin(a2) * A.r0),
        bwx(e, Math.cos(a2) * A.r), bwy(e, Math.sin(a2) * A.r), 9, 0.9, WARN, 0.30 * v);
      this.blade(e, a, v, 1.0);
      // Where the edge is biting *now*: cracks running out of the cut, at the cut, on every frame.
      for (let i = 0; i < 3; i++) {
        const t = A.r0 + rt * (0.22 + i * 0.30), p = this.bpt(e, a, t, 0);
        cracks(p[0], p[1], 4, rt * 0.20, A.col, 0.40 * v, (e.seed + i * 11) | 0, 0.5, 1.0);
      }
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab, a = this.at(e, q), v = this.vis(q);
      this.smoke(w, e, q);
      this.bladeAir(e, a, 0.85 * v + 0.15, 1.0);
      // The point is the fastest-moving thing on screen and the part the eye follows, so it gets the
      // release pop: the swing starts with the tip flaring rather than with the whole arc lighting.
      const tp = this.bpt(e, a, A.r, 0);
      core(tp[0], tp[1] - 4, 6 * g, A.hot, 0.95 * v, 1.6);
      core(tp[0], tp[1] - 4, 2.4 * g, WHITE, 1.0 * v, 1.5);
      sparks(tp[0], tp[1] - 4, 16, 2, 22, A.hot, 0.80 * v, e.seed + 5, 1.1, 0.8,
        a - 1.2, a + 1.2, 8);
      glare(tp[0], tp[1] - 5, 16 + 8 * v, 10 + 5 * v, A.hot, 0.26 * v);
    },
  },

  // ---- rain: a storm of drops, and no two of them the same thing ------------------
  // One disc per drop, only the drop that has just landed can hurt, and the stagger *is* the move:
  // some craters still smoking while eight marks have not gone off yet. So a drop reads its own
  // clock rather than the cast's, and the tell/boom split the other shapes use cannot say that --
  // the floor and the air are one routine each, called from both halves of the cast.
  //
  // The geometry was never what was wrong with this move. What was wrong was that every drop was
  // one vertical line and every crater one ring: twenty-four identical events in a row is one
  // event, and a player stops watching it after the third. So a drop has a *kind* now -- rock,
  // comet, slag, cluster, spinner -- and the kind owns its silhouette, the curve it falls on, how
  // hard it arrives and what it leaves behind. One in six is a *heavy* on top of that, which takes
  // the full circle. The hit radius stays one plain circle per drop, because that is the one part
  // of it the player has to be able to measure by eye.
  //
  // One clock per drop, and that is what makes forty of them readable. Everything a drop does is
  // measured backwards from its own impact and nothing from the cast's clock: the mark is on the
  // floor for the last 1.15 s, the fall is the last 0.62 s, the flash the 0.75 s after and the hot
  // crater the 0.85 s after that. So rock number thirty-nine behaves exactly like rock number two,
  // and the floor holds the next dozen rather than all forty. Measuring any of it as a fraction of
  // the mark's own wind-up -- which is what this did at twenty-four drops -- gives forty rings
  // painted from the first frame, the last rock hanging in the sky for two and a half seconds, and
  // its burst over in a quarter of one.
  //
  // Those windows are also the whole performance budget. Forty drops draw more than twenty-four no
  // matter what, so the rule is that nothing keeps costing after it has stopped being watched: a
  // spent flash drops its shards, a cold crater falls back to a two-call scar. Measured headless,
  // the move roughly doubles a frame's draw; without the windows it was closer to triple.
  rain: {
    fall: 0.62,
    flash: 0.75,
    init(w, e) {
      const A = e.ab, rng = mulberry32(e.seed), n = A.ticks.length;
      e.dr = [];
      for (let i = 0; i < n; i++) {
        // Drop nought lands where you stood. After that the storm walks outward on a golden-angle
        // turn instead of a fresh random draw each time, so the pattern has a *direction*: "away
        // from the last one" becomes a thought the player can actually have, forty times.
        const a = rng.range(0, TAU) + i * 2.39996, hop = i / Math.max(n - 1, 1);
        const rr = i === 0 ? 0 : A.r * (0.14 + 0.86 * Math.sqrt(rng() * 0.5 + hop * 0.5));
        const kind = i === 0 ? 0 : rng.int(0, 5);
        // A heavy is honest about being a heavy: `rad` is the number `hit` measures, so the one
        // that looks like it will take more room does take more room.
        const heavy = i > 0 && rng() < 0.17;
        const rad = heavy ? A.nr : A.nr * (kind === 1 ? 0.68 : kind === 0 ? 0.82
          : kind === 4 ? 0.90 : 1.0);
        const d = { x: Math.cos(a) * rr, y: Math.sin(a) * rr, rad, kind, heavy, fr: [],
                    sd: (e.seed + i * 101) | 0, h: rng.range(76, 138),
                    lean: rng.range(-0.66, 0.66), spin: rng.range(-7, 7),
                    wob: rng.range(1.3, 3.4), turns: rng.range(1.5, 3.1),
                    cw: rng() < 0.5 ? 1 : -1,
                    grav: kind === 2 ? 1.3 : kind === 1 ? 2.5 : kind === 4 ? 1.4 : 1.9 };
        // A cluster splits on the way down, and its fragments land inside its own circle: three
        // craters for no extra ground at all. The extra is only that they arrive as three.
        if (kind === 3) for (let j = 0; j < 3; j++) {
          const fa = rng.range(0, TAU);
          d.fr.push([Math.cos(fa) * rad * 0.52, Math.sin(fa) * rad * 0.52]);
        }
        e.dr.push(d);
      }
      // Weather, seeded once. Fourteen embers cross the frame and burn out; they carry no ground
      // mark, land on nothing and hurt no one, which is precisely why they are safe to draw. The
      // grammar of this move is "a circle on the floor is the threat, and it ends in a white
      // flash", so a streak with neither cannot be misread as one. Without them the sky holds only
      // however many rocks are in flight at that instant, and a meteor storm whose sky is empty
      // between drops is a list of events rather than weather.
      e.sk = [];
      for (let i = 0; i < 14; i++)
        e.sk.push({ x: rng.range(-A.r, A.r), y: rng.range(-A.r * 0.8, A.r * 0.55),
                    t0: rng(), sp: rng.range(0.34, 0.70), len: rng.range(8, 24),
                    lean: rng.range(-0.55, 0.55), br: rng.range(0.09, 0.26),
                    sd: (e.seed + 7000 + i * 53) | 0 });
    },
    hit(w, e, l) {
      const n = e.dr.length;
      // Before the first landing every mark is live; afterwards only the drop that just went off
      // can hurt, which is what makes stepping between the craters the answer.
      const i0 = e.fired ? Math.min(Math.max(e.ticked, 1), n) - 1 : 0;
      const i1 = e.fired ? i0 : n - 1;
      for (let i = i0; i <= i1; i++) {
        const d = e.dr[i];
        if (Math.hypot(l.x - d.x, l.y - d.y) <= d.rad + HERO_R) return true;
      }
      return false;
    },
    floor(w, e) {
      const A = e.ab;
      for (let i = 0; i < e.dr.length; i++) {
        const d = e.dr[i], x = bwx(e, d.x), y = bwy(e, d.y);
        const tf = A.tell + A.ticks[i], sp = Math.max(e.dur - tf, 1e-3);
        if (e.t < tf) {
          // A mark is only on the floor for the last 1.15 s before its own drop -- sixty px of
          // walking, so still ample warning -- and its panic runs on the same countdown. Painting
          // all forty from the first frame is what a carpet looks like: forty faint rings over the
          // whole disc, none of them saying "this one, now". So the floor holds the next dozen and
          // the rest are still weather. It is also the single biggest draw cost in the move, so the
          // window is as short as the warning can honestly be and no shorter.
          const k = c01(1 - (tf - e.t) / Math.min(tf, 1.15));
          if (k <= 0) continue;
          const urg = c01(1 - (tf - e.t) / 0.60);
          bdisc(e, x, y, d.rad, k, urg, 0.55 + 0.45 * Math.sin(k * 34) * urg,
            0.5 + 0.5 * urg, A.col, d.sd);
          // A heavy says so before it lands: a second rim just inside the first, and it is the only
          // mark on the floor with two. Reading "that one is bigger" has to be possible at a glance.
          if (d.heavy) ring(x, y, d.rad * 0.74, 0.8, WARN, 0.26 + 0.24 * urg, GSQ, 1.6);
          // Late in a mark's own countdown the incoming line is drawn on the floor as well: the
          // mark says *where*, this says *from which side*, which is the difference between
          // stepping out of the circle and stepping into the next one.
          if (tf - e.t < this.fall * 1.6) {
            const ld = c01(1 - (tf - e.t) / (this.fall * 1.6));
            const lx = -Math.sin(d.lean) * d.rad * 2.4, ly = -d.rad * 2.4;
            dashline(x + lx, y + ly, x, y, 5, 0.8, A.col, 0.30 * ld, 1.2, 0.5);
          }
          if (d.kind === 3) for (const f of d.fr)
            ring(x + f[0], y + f[1] * GSQ, d.rad * 0.30, 0.7, A.col, 0.24 * (0.4 + 0.6 * k), GSQ, 1.7);
          // The spinner is coming down turning, so its mark turns: the one mark that moves while
          // it waits, and the only warning of a burst that throws outward instead of upward.
          if (d.kind === 4)
            spiral(x, y, 2, d.rad * 0.22, d.rad * 0.86, 0.7, A.col, 0.22 + 0.20 * urg,
              0.8, GSQ, d.cw * e.t * 2.2 + d.sd * 0.01, 22, false);
        } else {
          // A crater is hot for 0.85 s -- the same fixed clock as everything else a drop owns --
          // and after that it is a scar, which is two draw calls instead of eight. Running the hot
          // detail on "time left in the cast" instead means the fortieth rock pays full price for
          // the first one's crater four seconds later, and forty of those is where the frame goes.
          const ag = e.t - tf;
          if (ag < 0.85) this.crater(e, d, x, y, c01(ag / 0.85), fade(c01(ag / 0.85), 0.25));
          else this.scar(e, d, x, y, fade(c01((ag - 0.85) / Math.max(sp - 0.85, 1e-3)), 0.55));
        }
      }
    },
    // What is left when a crater has stopped glowing: the ground is still out, and stays out for
    // the rest of the cast. Cheap on purpose -- there can be forty of these at once -- and dim on
    // purpose too: a wide soft `unlight` on its own is a hole in the floor, not a burn. The stain
    // is what carries the read, and the darkening only sits under it.
    scar(e, d, x, y, fd) {
      if (fd < 0.02) return;
      const A = e.ab, r = d.rad;
      unlight(x, y + 1, r * (d.heavy ? 0.7 : 0.55), 0.10 * fd, 1.8);
      puddle(x, y, r * 0.85, r * 0.85 * GSQ, A.col, 0.20 * fd, d.sd + 3, 7, 1.5);
      if (fd > 0.25) cracks(x, y, 4, r * 0.8, A.col, 0.16 * fd, d.sd + 8, 0.45, 1.0);
    },
    // Five kinds arrive, so five things are left behind. A crater the player can tell apart from
    // the one next to it is a crater they can remember standing in.
    crater(e, d, x, y, q, fd) {
      const A = e.ab, r = d.rad;
      if (fd < 0.006) return;
      if (d.kind === 0) {                       // rock: a pit, ringed by what came out of it
        unlight(x, y + 1, r * 0.85, 0.34 * fd, 1.4);
        puddle(x, y, r * 0.95, r * GSQ, A.col, 0.26 * fd, d.sd, 9, 1.4);
        cracks(x, y, 8, r * 1.05, A.col, 0.34 * fd, d.sd + 1, 0.45, 1.2);
        if (fd > 0.10) for (let j = 0; j < 5; j++) {
          const a = d.sd * 0.017 + j / 5 * TAU;
          flRock(x + Math.cos(a) * r * 1.15, y + Math.sin(a) * r * 1.15 * GSQ, 2.4,
            a, A.col, A.hot, 0.34 * fd, d.sd + j * 7);
        }
      } else if (d.kind === 1) {                // comet: a gouge, not a hole
        const ca = Math.PI / 2 + d.lean * 1.6;
        beam(x, y, ca, -r * 2.2, r * 0.7, r * 0.62, 0.8, A.col, 0.34 * fd, 1.4, 1.1);
        beam(x, y, ca, -r * 1.7, r * 0.4, r * 0.20, 0.5, A.hot, 0.40 * fd, 1.6, 1.2);
        cracks(x, y, 4, r * 1.3, A.hot, 0.28 * fd, d.sd + 2, 0.45, 1.0);
      } else if (d.kind === 2) {                // slag: it keeps spreading after it stops
        const sp = 0.7 + 0.5 * eo(q);
        puddle(x, y, r * sp, r * sp * GSQ, A.hot, 0.32 * fd, d.sd, 7, 1.2);
        puddle(x, y, r * sp * 0.6, r * sp * 0.6 * GSQ, WARN_H, 0.22 * fd, d.sd + 4, 6, 1.5);
        ring(x, y, r * sp, 1.1, A.col, 0.30 * fd, GSQ, 1.7);
      } else if (d.kind === 3) {                // cluster: three pits on three clocks
        for (let j = 0; j < d.fr.length; j++) {
          const sq = c01((q - j * 0.10) / 0.5);
          if (sq <= 0) continue;
          const fx = x + d.fr[j][0], fy = y + d.fr[j][1] * GSQ;
          unlight(fx, fy + 1, r * 0.34, 0.28 * fd * sq, 1.4);
          cracks(fx, fy, 5, r * 0.5, A.col, 0.32 * fd * sq, d.sd + j * 13, 0.45, 1.0);
          core(fx, fy, r * 0.22, A.hot, 0.26 * fd * sq, 1.7);
        }
      } else {                                  // spinner: it screws itself into the floor
        unlight(x, y + 1, r * 0.55, 0.24 * fd, 1.5);
        spiral(x, y, 3, r * 0.14, r * (0.72 + 0.34 * eo(q)), 0.9, A.col, 0.34 * fd,
          1.0, GSQ, d.cw * (2 + q * 3) + d.sd * 0.01, 20, true);
        puddle(x, y, r * 0.5, r * 0.5 * GSQ, A.hot, 0.24 * fd, d.sd + 5, 8, 1.5);
        ring(x, y, r * (0.5 + 0.7 * eo(q)), 1.0, A.hot, 0.26 * fd, GSQ, 1.8);
      }
      // A heavy leaves a heavy's mark: the pit is scored right out to the rim it warned about.
      if (d.heavy && fd > 0.05) {
        cracks(x, y, 10, r * 1.5, A.col, 0.22 * fd, d.sd + 41, 0.45, 1.0);
        ring(x, y, r * 1.02, 1.4, A.col, 0.22 * fd, GSQ, 1.5);
      }
      ring(x, y, r * (0.4 + 0.8 * eo(q)), 2.2, A.hot, 0.34 * fd, GSQ, 1.4);
    },
    air(w, e) {
      const A = e.ab;
      this.sky(w, e);
      for (let i = 0; i < e.dr.length; i++) {
        const d = e.dr[i], x = bwx(e, d.x), y = bwy(e, d.y);
        const tf = A.tell + A.ticks[i];
        if (e.t < tf) {
          // Nothing is in the sky until the last 0.62 s before its own impact. A rock that hangs
          // above you for two seconds is scenery; one that appears and arrives is a threat.
          const p = 1 - (tf - e.t) / this.fall;
          if (p > 0) this.drop(e, d, x, y, c01(p));
        } else {
          const q = (e.t - tf) / this.flash;
          if (q < 1) this.burst(e, d, x, y, q);
        }
      }
    },
    // Weather, and nothing but weather: no ground mark, no flash, no damage, and gone before it
    // gets anywhere. It exists so that the sky between two landings is not empty.
    sky(w, e) {
      const A = e.ab;
      for (const s of e.sk) {
        const u = (s.t0 + e.t * s.sp) % 1, f = 1 - (1 - u) * (1 - u);
        const a = s.br * Math.sin(Math.PI * u);
        if (a < 0.012) continue;
        const x = bwx(e, s.x) + Math.sin(s.lean) * 64 * f, y = bwy(e, s.y) - 64 * (1 - f);
        const ang = Math.PI / 2 + s.lean;
        beam(x, y, ang + Math.PI, 0, s.len * (0.5 + 0.5 * f), 0.8, 0.2, A.col, a, 1.6, 1.0);
        core(x, y, 1.0, A.hot, a * 1.2, 1.8);
      }
    },
    // The fall. `p` is nought when the drop appears and one at the floor; `grav` bends it, so a
    // slag blob wallows down and a comet arrives faster than the eye tracks it.
    drop(e, d, x, y, p) {
      const A = e.ab, f = fpow(p, d.grav), hv = d.heavy ? 1.34 : 1;
      const sw = d.kind === 4 ? Math.sin(p * d.turns * TAU) * d.rad * 1.5 * (1 - f * 0.7) : 0;
      const rx = x - Math.sin(d.lean) * d.h * (1 - f) + sw
        + Math.sin(p * d.wob * 6 + d.sd) * 2.2 * (1 - f);
      const ry = y - d.h * (1 - f);
      const ang = Math.atan2(y - ry, x - rx);
      // A shadow that grows into the mark as the thing comes down. The engine only adds light, so
      // this is the one way to say "it is close now" without making the sky brighter -- and it is
      // the difference between a rock in the air and a rock painted on the floor.
      unlight(x, y + 1, d.rad * (0.34 + 0.44 * f) * hv, 0.05 + 0.09 * f, 1.5);
      // A streak as long as the thing is fast: the same drop reads slow at the top and violent
      // in the last hand's width, without a single number changing anywhere else.
      const sl = (6 + 26 * f * (d.kind === 1 ? 1.5 : 1)) * hv;
      beam(rx, ry, ang + Math.PI, 0, sl, d.rad * 0.34 * hv + 0.6, 0.3, A.col, 0.34 + 0.20 * f, 1.4, 1.0);
      // and a dashed contrail behind that, which is what turns one bright dash into something
      // that has been falling.
      const bx = rx + (x - Math.sin(d.lean) * d.h - rx) * 0.4;
      const by = ry + (y - d.h - ry) * 0.4;
      dashline(rx, ry, bx, by, 5, 0.6, A.col, 0.09 + 0.13 * f, 1.5, 0.55);
      if (d.kind !== 2)
        sparks(rx, ry, 3, 1, 6 + 11 * f, A.hot, 0.24 + 0.14 * f, (d.sd + (p * 70 | 0)) | 0,
          0.8, 1, ang + 2.4, ang + 3.9, 5);
      if (d.kind === 0) {
        flRock(rx, ry, d.rad * 0.55 * hv, d.sd * 0.011 + p * d.spin, A.col, A.hot, 0.90, d.sd, 1);
        core(rx, ry, d.rad * 0.30 * hv, A.hot, 0.44 * f, 1.7);
      } else if (d.kind === 1) {
        beam(rx, ry, ang + Math.PI, 0, sl * 1.8, d.rad * 0.20 + 0.4, 0.2, A.hot, 0.40, 1.6, 0.9);
        core(rx, ry, d.rad * 0.62 * hv, A.col, 0.70, 1.7);
        core(rx, ry, d.rad * 0.26 * hv, WHITE, 0.95, 1.5);
      } else if (d.kind === 2) {
        // Four blobs on lagged clocks: it is one thing at the top and coming apart by the floor,
        // which is the whole reason a slag drop is worth telling from a rock.
        for (let j = 0; j < 4; j++) {
          const lg = f - j * 0.055 * f, ly = y - d.h * (1 - Math.max(lg, 0));
          core(rx + Math.sin(p * 5 + j * 1.9) * (1.4 + 1.6 * j * f), ly,
            d.rad * (0.42 - j * 0.07) * hv, j === 0 ? A.hot : A.col, 0.66 - j * 0.12, 1.7);
        }
      } else if (d.kind === 3) {
        const sp2 = c01((p - 0.55) / 0.45);      // the split, visible before it matters
        core(rx, ry, d.rad * 0.34 * (1 - sp2 * 0.5), A.col, 0.60, 1.7);
        for (let j = 0; j < d.fr.length; j++) {
          const fx = rx + d.fr[j][0] * sp2, fy = ry + d.fr[j][1] * sp2 * GSQ - 2 * sp2 * (1 - sp2) * 6;
          flRock(fx, fy, d.rad * 0.24, d.sd * 0.013 + p * d.spin + j, A.col, A.hot, 0.80, d.sd + j * 5, 1);
          core(fx, fy, d.rad * 0.12, A.hot, 0.50 * sp2, 1.6);
        }
      } else {
        // Spinner: it corkscrews on the way down, so the streak is a ribbon rather than a dash and
        // the head trails two sparks off its own tangent. `sw` above is the corkscrew itself.
        const tan = ang + Math.PI / 2 * d.cw;
        for (let j = 0; j < 5; j++) {
          const pj = Math.max(p - j * 0.055, 0), fj = fpow(pj, d.grav);
          const sj = Math.sin(pj * d.turns * TAU) * d.rad * 1.5 * (1 - fj * 0.7);
          core(x - Math.sin(d.lean) * d.h * (1 - fj) + sj, y - d.h * (1 - fj),
            d.rad * (0.36 - j * 0.055) * hv, j === 0 ? WARN_H : A.col, 0.72 - j * 0.13, 1.7);
        }
        core(rx, ry, d.rad * 0.16 * hv, WHITE, 0.80, 1.5);
        beam(rx, ry, tan, 0, 7 + 9 * f, 1.0, 0.2, A.hot, 0.40, 1.5, 1.0);
      }
    },
    // The arrival. Same five kinds, and each one throws something different upward, because the
    // half-second after a landing is the only part of a drop the player watches on purpose.
    burst(e, d, x, y, q) {
      const A = e.ab, fd = fade(q, 0.20), g = pop(q, 0.08);
      const kick = 1 - c01(q / 0.16), cy = y - 4, r = d.rad, hv = d.heavy ? 1.4 : 1;
      core(x, cy, r * 0.70 * g * hv, A.col, 0.86 * fd, 1.7);
      core(x, cy, r * 0.26 * g * hv, A.hot, 1.10 * fd);
      ring(x, y - 3, r * (0.3 + eo(q)) * hv, 2.6 * (1 - q * 0.6) + 0.5, A.hot, 0.58 * fd, 0.9, 1.4);
      if (d.kind === 0) {
        if (kick > 0) star(x, cy, A.hot, 12, 3, r * (1.4 + 1.2 * eo(q)), 2.2, 0.86 * kick, d.sd + 9, 0.35);
        flPlume(x, y - 2, (16 + 20 * (1 - q)) * hv, 3.4, A.col, A.hot, 0.52 * fd, d.sd, q * 1.4);
        for (let j = 0; j < 4; j++) {            // the pieces of it, on their way back down
          const a = -Math.PI / 2 + (j - 1.5) * 0.42, tr = r * (1.1 + 1.5 * eo(q));
          flRock(x + Math.cos(a) * tr, y + Math.sin(a) * tr - 6 * eo(q) * (1 - q),
            2.6, a + q * 6, A.col, A.hot, 0.54 * fd, d.sd + j * 31, 1);
        }
      } else if (d.kind === 1) {
        // A comet keeps its heading through the impact: the fan is thrown *forward*, so the shape
        // on the floor tells you which way the next step should not be.
        const ca = Math.PI / 2 + d.lean * 1.6;
        glare(x, cy, r * 2.6, r * 1.2, WHITE, 0.70 * kick + 0.20 * fd);
        for (let j = 0; j < 5; j++) {
          const fa = ca + (j - 2) * 0.30;
          beam(x, y - 2, fa, 0, r * (1.6 + 2.2 * eo(q)), 2.4 - Math.abs(j - 2) * 0.4, 0.4,
            j === 2 ? A.hot : A.col, (0.62 - Math.abs(j - 2) * 0.10) * fd, 1.4, 1.0);
        }
        sparks(x, y - 3, 11, 3, r * (1.6 + 2.4 * eo(q)), A.hot, 0.80 * fd, d.sd + 3,
          1.1, 0.8, ca - 1.1, ca + 1.1, 9);
      } else if (d.kind === 2) {
        unlight(x, y + 1, r * 1.1, 0.30 * fd, 1.3);
        for (let j = 0; j < 3; j++)
          flPlume(x + (j - 1) * r * 0.5, y - 1, 10 + 14 * (1 - q), 2.6,
            A.hot, WARN_H, 0.44 * fd, d.sd + j * 17, q * 1.1 + j * 0.3);
        sparks(x, y - 1, 9, 2, r * (1.0 + 1.4 * eo(q)), A.col, 0.60 * fd, d.sd + 6,
          1.2, GSQ, 0, TAU, 4);
      } else if (d.kind === 3) {
        for (let j = 0; j < d.fr.length; j++) {  // three pops, three clocks
          const sq = pop(c01((q - j * 0.09) / 0.5), 0.10), sf = fade(c01((q - j * 0.09) / 0.5), 0.20);
          if (sq <= 0) continue;
          const fx = x + d.fr[j][0], fy = y + d.fr[j][1] * GSQ;
          core(fx, fy - 3, r * 0.34 * sq, A.col, 0.80 * sf, 1.7);
          core(fx, fy - 3, r * 0.14 * sq, A.hot, 1.0 * sf);
          star(fx, fy - 3, A.hot, 7, 2, r * 0.8 * (0.6 + eo(sq)), 1.6, 0.60 * sf, d.sd + j * 23, 0.4);
          sparks(fx, fy - 1, 5, 2, r * 0.9, A.hot, 0.54 * sf, d.sd + j * 29, 1.0, 0.9, 0, TAU, 6);
        }
      } else {
        // Spinner: it was turning when it hit, so nothing goes up. Three arms unwind outward and a
        // ring of shards is thrown flat, which is the one arrival on the floor rather than above it.
        // The shards are gone by half-way: a piece of debris still hanging in the air at the end of
        // a flash is doing no visual work and costing the same as one that is.
        spiral(x, y - 1, 3, r * 0.2, r * (0.9 + 1.5 * eo(q)), 1.1, A.hot, 0.60 * fd,
          1.6 * (1 - q * 0.5) + 0.4, GSQ, d.cw * (1.5 + q * 5) + d.sd * 0.01, 16, true);
        if (q < 0.55) for (let j = 0; j < 6; j++) {
          const a = d.cw * q * 3.4 + j / 6 * TAU, tr = r * (0.7 + 1.5 * eo(q));
          shard(x + Math.cos(a) * tr, y + Math.sin(a) * tr * GSQ + 2, 5 + 4 * (1 - q), 2.2,
            A.col, A.hot, 0.56 * fd, Math.cos(a) * 0.9);
        }
        sparks(x, y - 2, 10, 2, r * (1.2 + 1.8 * eo(q)), A.hot, 0.66 * fd, d.sd + 8,
          1.0, GSQ, 0, TAU, 7);
      }
      // A heavy is the only arrival that puts a column of fire up through the frame, and the only
      // one that throws a shard fan on top of whatever its kind already does. Six of forty do it,
      // which is what makes it read as an event rather than as the move's normal volume.
      if (d.heavy) {
        column(x, y - (54 + 30 * (1 - q)), y + 1, r * 0.34, r * 0.9, A.col, A.hot, 0.44 * fd);
        if (q < 0.5) for (let j = 0; j < 5; j++) {
          const a = -Math.PI / 2 + (j - 2) * 0.34, tr = r * (1.3 + 1.8 * eo(q));
          shard(x + Math.cos(a) * tr, y + Math.sin(a) * tr * GSQ + 2, 7 + 6 * (1 - q), 2.6,
            A.col, WARN_H, 0.50 * fd, Math.cos(a) * 1.2);
        }
        ring(x, y - 2, r * (0.5 + 1.9 * eo(q)), 1.6 * (1 - q * 0.7) + 0.3, WARN_H, 0.44 * fd, 0.8, 1.5);
      }
      if (d.kind !== 1 && kick > 0) glare(x, cy, r * 1.8 * hv, r * hv, WHITE, 0.60 * kick);
      if (d.kind !== 3 && q < 0.72)
        sparks(x, y - 2, 11, 3, r * (1.0 + 1.2 * eo(q)) * hv, A.hot, 0.74 * fd, d.sd + 9,
          1.1, 0.9, 0, TAU, 8 * (1 - q));
    },
    under(w, e) { this.floor(w, e); },
    mid(w, e) { this.air(w, e); },
    boomUnder(w, e) { this.floor(w, e); },
    boomMid(w, e) { this.air(w, e); },
  },

  // ---- smite: a court you are inside, and eleven strikes that follow you ----------
  // The old judgment dropped three pillars on the spot you were standing when it started, which
  // is a move you beat by walking. This one is a four-second sentence instead: for as long as it
  // lasts, light keeps coming down where you *are*, and standing still is the only thing that is
  // certainly fatal. It is the hardest of the four to survive on foot, on purpose.
  //
  // Three rules keep that from being unfair, and all three are drawn:
  //   * the court -- one dotted circle at `r`, marked from frame nought, that no strike ever
  //     crosses. Every tracked point is clamped into it, so leaving is a real answer.
  //   * the lock -- a strike stops following `lock` seconds before it lands and goes hard red.
  //     That window, not the aiming, is the dodge; `nr + HERO_R` is 17 px and a sidestep covers
  //     19, so moving sideways beats it and moving up the screen does not.
  //   * beat nought never tracks. `S.step` runs before the release flip, so the first strike lands
  //     exactly on the mark the whole wind-up was showing.
  smite: {
    init(w, e) {
      e.tg = [];                                // x, y, locked -- all of them start on the mark
      for (let i = 0; i < e.ab.ticks.length; i++) e.tg.push([0, 0, 0]);
    },
    step(w, e, dt) {
      const A = e.ab;
      if (!e.fired) return;                     // the wind-up shows a still target, and means it
      const l = heroLocal(w, e), f = c01(dt * 7), d = Math.hypot(l.x, l.y);
      const k = d > A.r ? A.r / d : 1;          // the court is a promise, so the goal is clamped
      for (let i = 0; i < e.tg.length; i++) {
        const g = e.tg[i];
        if (g[2]) continue;
        if (e.t >= A.tell + A.ticks[i] - A.lock) { g[2] = 1; continue; }
        g[0] += (l.x * k - g[0]) * f;           // eased, not snapped: it reads as a thing hunting
        g[1] += (l.y * k - g[1]) * f;
      }
    },
    hit(w, e, l) {
      const A = e.ab, R = A.nr + HERO_R, n = e.tg.length;
      const i0 = e.fired ? Math.min(Math.max(e.ticked, 1), n) - 1 : 0;
      const i1 = e.fired ? i0 : n - 1;
      for (let i = i0; i <= i1; i++)
        if (Math.hypot(l.x - e.tg[i][0], l.y - e.tg[i][1]) <= R) return true;
      return false;
    },
    floor(w, e) {
      const A = e.ab, kk = c01(e.t / A.tell);
      // The court, from frame nought and for the whole four seconds. Eleven strikes is a lot of
      // information; this is the one line that reduces all of it to a single instruction.
      dial(e.x, e.y, A.r, 24, A.col, 0.13 + 0.09 * kk, GSQ, 6, 0.9, 0.045, 0.10);
      ring(e.x, e.y, A.r, 1.0, WARN, 0.12 + 0.10 * kk, GSQ, 1.9);
      for (let i = 0; i < e.tg.length; i++) {
        const g = e.tg[i], x = bwx(e, g[0]), y = bwy(e, g[1]);
        const tf = A.tell + A.ticks[i], sp = Math.max(e.dur - tf, 1e-3);
        if (e.t >= tf) {
          const q = c01((e.t - tf) / sp);
          this.scorch(e, i, x, y, q, fade(q, 0.25));
          continue;
        }
        // Beat nought gets the full wind-up the grammar asks for; the later ones appear a beat
        // ahead of themselves, because eleven discs on screen at once is no warning at all.
        const lead = i === 0 ? A.tell : 0.62, k = c01(1 - (tf - e.t) / lead);
        if (k <= 0) continue;
        const urg = k > 0.60 ? (k - 0.60) / 0.40 : 0;
        bdisc(e, x, y, A.nr, k, urg, 0.55 + 0.45 * Math.sin(k * 40) * urg,
          0.5 + 0.5 * urg, A.col, (e.seed + i * 7) | 0);
        if (g[2]) {
          // Locked. The circle has stopped moving, and this is the half-second worth reading:
          // hard edge, and four arrows pointing at the ground that is about to go.
          ring(x, y, A.nr + 1.6, 1.1, WARN, 0.46 + 0.34 * urg, GSQ, 1.7);
          for (let j = 0; j < 4; j++) {
            const a = i * 0.7 + j / 4 * TAU, tr = A.nr * 2.1;
            chevron(x + Math.cos(a) * tr, y + Math.sin(a) * tr * GSQ, a + Math.PI,
              3.2, WARN_H, 0.40 + 0.30 * urg, 1.0, 0.62);
          }
        } else {
          // Still hunting. A crosshair closing on you is the clearest way to say "this one is not
          // aimed at the floor, it is aimed at you".
          reticle(x, y, A.nr * (2.0 - 0.9 * k), A.hot, 0.38 + 0.30 * k, GSQ, 8, 1.1);
          line(x - A.nr * 1.5, y, x + A.nr * 1.5, y, 0.7, A.hot, 0.26 + 0.20 * k, 1.6);
        }
      }
    },
    // What eleven strikes leave behind: burnt ground, and enough of it that the court fills up
    // over four seconds. None of it hurts -- it is the record of where you already were.
    scorch(e, i, x, y, q, fd) {
      const A = e.ab, r = A.nr;
      unlight(x, y + 1, r * 0.90, 0.30 * fd, 1.4);
      puddle(x, y, r * 0.90, r * GSQ, A.col, 0.22 * fd, (e.seed + i * 5) | 0, 8, 1.4);
      cracks(x, y, 7, r * 1.05, A.hot, 0.30 * fd, (e.seed + i * 5 + 1) | 0, 0.45, 1.1);
      ring(x, y, r * (0.4 + 0.8 * eo(q)), 2.0, A.hot, 0.34 * fd, GSQ, 1.4);
      ring(x, y, r * 0.55, 0.8, WARN_H, 0.18 * fd, GSQ, 1.8);
    },
    air(w, e) {
      const A = e.ab, hi = 150;
      for (let i = 0; i < e.tg.length; i++) {
        const g = e.tg[i], x = bwx(e, g[0]), y = bwy(e, g[1]);
        const tf = A.tell + A.ticks[i], sp = Math.max(e.dur - tf, 1e-3);
        if (e.t >= tf) { this.strike(e, i, x, y, hi, c01((e.t - tf) / sp)); continue; }
        const lead = i === 0 ? A.tell : 0.62, k = c01(1 - (tf - e.t) / lead);
        if (k <= 0) continue;
        // A pillar does not fall, it builds: the shaft grows down out of the dark, so its second
        // clock is a height. Same information as a falling rock, opposite gesture -- and a strike
        // that has not gone off yet still carries a countdown you can read in the sky.
        const hh = hi * fpow(k, 0.70);
        column(x, y - hh, y, 0.5 + 1.5 * k, 0.35 + 1.1 * k, A.col, A.hot, 0.18 + 0.26 * k);
        core(x, y - hh, 1.4 + 2.6 * k, A.hot, 0.42 * k, 1.6);
        if (k > 0.70)
          dashline(x, y - hi * 0.92, x, y, 7, 0.7, WARN_H, 0.34 * (k - 0.70) / 0.30, 1.2, 0.55);
      }
    },
    strike(e, i, x, y, hi, q) {
      const A = e.ab, fd = fade(q, 0.20), g = pop(q, 0.08), kick = 1 - c01(q / 0.16);
      column(x, y - hi, y, 5.4 * g, 3.4 * g, A.col, A.hot, 1.0 * fd);
      column(x, y - hi, y, 1.4 * g, 0.9 * g, WHITE, WHITE, 0.78 * fd);
      // The shaft is straight, so the thing inside it must not be: a jagged core is what tells a
      // pillar of light apart from a rectangle of light.
      bolt(x + Math.sin(i * 1.7) * 7, y - hi, x, y, A.hot, WHITE, 0.74 * fd, 8, 6,
        (e.seed + i * 13) | 0, 2.2, 2);
      core(x, y - 4, A.nr * 0.74 * g, A.col, 0.90 * fd, 1.7);
      core(x, y - 4, A.nr * 0.28 * g, WHITE, 1.15 * fd);
      ring(x, y - 3, A.nr * (0.3 + eo(q)), 2.6 * (1 - q * 0.6) + 0.5, A.hot, 0.60 * fd, 0.9, 1.4);
      if (kick > 0) {
        star(x, y - 5, WHITE, 9, 3, A.nr * (1.5 + 1.3 * eo(q)), 2.4, 0.88 * kick,
          (e.seed + i * 17 + 9) | 0, 0.30);
        glare(x, y - 5, A.nr * 2.0, A.nr * 1.1, WHITE, 0.66 * kick);
        // A crown thrown outward along the floor. The pillar says "here"; the crown says "and
        // this much of the ground around here", which is the part still worth acting on.
        for (let j = 0; j < 6; j++) {
          const a = i * 0.9 + j / 6 * TAU;
          beam(x, y - 2, a, A.nr * 0.3, A.nr * (1.1 + 0.9 * eo(q)), 2.0, 0.4,
            A.hot, 0.50 * kick, 1.4, 1.0);
        }
      }
      sparks(x, y - 3, 18, 3, A.nr * (1.1 + 1.3 * eo(q)), A.hot, 0.76 * fd,
        (e.seed + i + 9) | 0, 1.1, 0.9, 0, TAU, 9 * (1 - q));
    },
    under(w, e) { this.floor(w, e); },
    mid(w, e) { this.air(w, e); },
    boomUnder(w, e) { this.floor(w, e); },
    boomMid(w, e) { this.air(w, e); },
  },

  // ---- veins: a root system torn out of the caster's own feet ---------------------
  // One root is always aimed at the hero, which sounds unfair and is the opposite. A star with a
  // random phase asks you to find the gap under time pressure; a star with one arm on you asks
  // you to step sideways. The second is a lesson, the first is a lottery.
  //
  // It used to be eight straight lines, which is the one thing a fissure is not. Now each arm is
  // a walk: the heading wobbles every segment and is pulled back outward, so it reaches the rim
  // without ever having been straight, and two arms of the same cast never read as one shape.
  // Branches sprout in the middle third only -- at the rim they would close the very gaps the
  // move asks you to find, and at the hub they would add nothing the hub does not already do.
  // Every vertex is clamped to `r`, so `r + thick*0.9` stays exactly the reach it claims.
  veins: {
    init(w, e) {
      const A = e.ab, rng = mulberry32(e.seed), br = A.br || 3;
      e.rt = [];
      const clamp = (x, y) => {
        const d = Math.hypot(x, y);
        return d > A.r ? [x * A.r / d, y * A.r / d] : [x, y];
      };
      const walk = (x0, y0, ang, len, segs, wob, pull) => {
        const pts = [clamp(x0, y0)], st = len / segs;
        let a = ang, x = x0, y = y0;
        for (let s = 0; s < segs; s++) {
          a += rng.range(-wob, wob) + bangd(ang, a) * pull;
          const d = st * rng.range(0.70, 1.30);
          x += Math.cos(a) * d; y += Math.sin(a) * d;
          pts.push(clamp(x, y));
        }
        return pts;
      };
      for (let i = 0; i < A.n; i++) {
        const a0 = e.ang + i / A.n * TAU + rng.range(-0.16, 0.16);
        const pts = walk(0, 0, a0, A.r * 1.16, 8, 0.30, 0.42);
        e.rt.push({ pts, hw: A.thick * 0.9, w: 1, main: 1, dl: 0 });
        for (let j = 0; j < br; j++) {
          const at = 0.30 + 0.40 * (j + rng()) / br;
          const idx = Math.max(1, Math.min(pts.length - 2, Math.round(at * (pts.length - 1))));
          const p0 = pts[idx], ba = Math.atan2(p0[1], p0[0])
            + (j % 2 ? 1 : -1) * rng.range(0.42, 0.92);
          e.rt.push({ pts: walk(p0[0], p0[1], ba, A.r * rng.range(0.18, 0.32), 4, 0.34, 0.30),
                      hw: A.thick * 0.54, w: 0.60, main: 0, dl: at * 0.55 });
        }
      }
      // `hit` works in the caster's unsquashed local frame and every drawing primitive works in
      // world pixels, so each path is kept twice. The centre cannot move for the life of a cast,
      // which is the only reason the world copy can be built once here instead of every frame.
      for (const p of e.rt) p.wp = p.pts.map(v => [bwx(e, v[0]), bwy(e, v[1])]);
    },
    hit(w, e, l) {
      for (const p of e.rt) {
        const R = p.hw + HERO_R;
        for (let i = 1; i < p.pts.length; i++)
          if (bseg(l.x, l.y, p.pts[i - 1][0], p.pts[i - 1][1], p.pts[i][0], p.pts[i][1]) <= R)
            return true;
      }
      return false;
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab;
      // The whole system is drawn whole from frame nought -- every root, every branch, at full
      // length -- because all of it hurts on the first beat. What the clock does is brighten it,
      // and it is deliberately kept dimmer than the boom: a tell that already looks like the
      // payoff has told you nothing about when the payoff is.
      for (const p of e.rt) {
        polyline(p.wp, p.hw * 1.50, A.col, 0.06 + 0.06 * k, 2.4);
        polyline(p.wp, Math.max(0.8, p.hw * 0.32), A.col, (0.13 + 0.15 * k) * p.w, 1.9);
        if (p.main) polyline(p.wp, Math.max(0.7, p.hw * 0.22), WARN, 0.22 * eg, 1.7);
      }
      // And the one bright element the grammar asks for: a head running each root to its tip.
      for (const p of e.rt) {
        if (!p.main) continue;
        const h = flRoot(p.wp, c01(k * 1.12), p.hw * 0.60, A.hot, WARN_H, 0.42 * fl, 0.26);
        if (h) core(h[0], h[1], 2.2 + 2.2 * k, WARN_H, 0.62 * fl, 1.6);
      }
      ring(e.x, e.y, A.r, 1.2, WARN, 0.24 * eg, GSQ, 1.6);
      core(e.x, e.y, 5 + 4 * k, A.col, 0.28 + 0.30 * k, 1.8);
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab;
      // Two beats, two events, and they are not the same event. First the fracture races outward
      // -- it arrives at the rim just as beat two lands -- and then the whole system goes off at
      // once. `fade` would have crushed the second one to a fifth, so `hi` holds a floor under it
      // and then lets go, which is also what makes the last second read as cooling rather than as
      // the same picture three times.
      const hi = Math.max(fd, 0.44 * (1 - c01((q - 0.40) / 0.34)));
      const wf = eo(c01(q / 0.34)), fl2 = 1 - c01(Math.abs(q - 0.31) / 0.13);
      for (const p of e.rt) {
        polyline(p.wp, p.hw * 1.55, A.col, 0.20 * hi, 2.4);
        polyline(p.wp, Math.max(0.8, p.hw * 0.42), A.col, 0.60 * hi * p.w, 1.8);
        polyline(p.wp, Math.max(0.7, p.hw * 0.20), A.hot, 0.46 * hi * p.w, 1.6);
        if (fl2 > 0) {
          polyline(p.wp, Math.max(0.8, p.hw * 0.60), WARN_H, 0.38 * fl2 * p.w, 1.6);
          polyline(p.wp, Math.max(0.7, p.hw * 0.18), WHITE, 0.54 * fl2 * p.w, 1.6);
        }
      }
      for (let i = 0; i < e.rt.length; i++) {
        const p = e.rt[i], t = c01(wf * 1.15 - p.dl);
        if (t <= 0) continue;
        const h = flRoot(p.wp, t, p.hw * 0.62, A.hot, WHITE, 0.58 * hi * p.w, 0.30 * hi);
        if (!h || t >= 1) continue;
        // The head is a thing that is happening, not a thing that has happened: a hot point, the
        // ground splitting a little ahead of it, and for the main roots a lump thrown clear.
        core(h[0], h[1], 3.0 + 3.2 * (1 - t), WARN_H, 0.70 * hi, 1.6);
        cracks(h[0], h[1], 3, A.thick * 3.4, A.col, 0.30 * hi, (e.seed + i * 13) | 0, 0.5, 1.0);
        if (p.main)
          flRock(h[0], h[1] - 2, 2.8, i * 0.7 + q * 4, A.col, WARN_H, 0.46 * hi,
            (e.seed + i * 5) | 0);
      }
      puddle(e.x, e.y, A.thick * 2.6, A.thick * 2.6 * GSQ, A.hot, 0.30 * hi, e.seed, 7, 1.5);
      if (fl2 > 0) core(e.x, e.y, 10 + 14 * fl2, WARN_H, 0.34 * fl2, 1.8);
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab, hi = Math.max(fd, 0.36 * (1 - c01((q - 0.40) / 0.34)));
      const wf = eo(c01(q / 0.34)), fl2 = 1 - c01(Math.abs(q - 0.31) / 0.13);
      // Magma does not stay on the floor. Every fissure vents *behind the head that opened it*,
      // so the venting is a wave too, and the ground looks torn open rather than painted over.
      let n = 0;
      for (let i = 0; i < e.rt.length; i++) {
        const p = e.rt[i], t = c01(wf * 1.15 - p.dl), m = p.wp.length;
        if (t <= 0) continue;
        for (let j = 1; j < m; j++) {
          const ft = j / (m - 1);
          if (ft > t) break;
          const heat = Math.max(1 - c01((t - ft) / 0.34), fl2 * 0.8, fd * 0.42);
          if (heat <= 0.06 || n++ > 52) continue;
          const v = p.wp[j], vx = v[0], vy = v[1];
          flPlume(vx, vy - 1, 6 + 16 * heat * p.w, 2.0 * g * p.w + 0.5, A.col, A.hot,
            0.48 * heat * hi, (e.seed + i * 31 + j * 7) | 0, (q * 1.6 + j * 0.13) % 1);
          if (heat > 0.42)
            sparks(vx, vy - 2, 4, 2, 8 + 12 * heat, A.hot, 0.44 * heat * hi,
              (e.seed + i * 17 + j) | 0, 1.0, 0.7, -2.5, -0.6, 5);
        }
      }
      sparks(e.x, e.y - 3, 14, 4, A.r * 0.40 * (0.5 + eo(q)), A.hot, 0.55 * fd, e.seed + 4,
        1.0, 0.55, 0, TAU, 4);
      if (fl2 > 0) glare(e.x, e.y - 4, 26 + 20 * fl2, 14 + 10 * fl2, WARN_H, 0.40 * fl2);
    },
  },

  // ---- web: a lattice laid on the floor, and the lattice *is* the hitbox ----------
  // A chain spiralling out of the caster. It bites along its links and at its knots and never
  // touches the space between them, which is why it leaves safe gaps between its turns. A lattice
  // is the one marked shape you are meant to stand *inside*, so every knot gets the hard red edge.
  //
  // Drawn correctly the first time and it still read as a wiring diagram, because correctness is
  // not the same as hierarchy. Every link had the same weight, every knot a slightly different
  // brightness, and nothing anywhere said where to look. Three changes, none of them more lines.
  // Links get *weight by depth*: fat and haloed at the hub, hairlines at the rim, so the eye is
  // told where the thing comes from. Every knot is now the same size and the same brightness and
  // only the *phase* of its twinkle differs, so the net looks alive rather than unfinished. And
  // light runs along the links continuously -- a lattice that does not move is furniture no matter
  // how well it is drawn.
  //
  // The detonation then travels the same way the light does: one wave per damage beat, washing out
  // of the hub along the chain. That is what joins the halves together. The old version replaced
  // the picture with a different picture at the moment of release, which is exactly why the last
  // frame looked like a second effect bolted on.
  web: {
    init(w, e) {
      const A = e.ab, rng = mulberry32(e.seed), n = A.n, ph = rng.range(0, TAU);
      e.pts = []; e.lnk = []; e.tw = [];
      for (let i = 0; i < n; i++) {
        // Radius jitter, inward only. Frost does not grow on a lathe, and a chain of knots each
        // exactly on the ideal curve is the single strongest reason the first pass read as a
        // drafting exercise. Inward only because the outermost knot has to stay inside `bnd` --
        // the number the checker holds this shape to, and the number the closing rim is drawn at.
        const t = i / (n - 1), r = (A.r0 + (A.r - A.r0) * t) * (1 - rng.range(0, 0.05));
        const a = ph + t * A.turns * TAU + rng.range(-0.035, 0.035);
        e.pts.push([Math.cos(a) * r, Math.sin(a) * r]);
        e.tw.push(rng.range(0, TAU));
      }
      for (let i = 0; i < n - 1; i++) e.lnk.push([i, i + 1]);
    },
    hit(w, e, l) {
      const A = e.ab;
      for (const p of e.pts) if (Math.hypot(l.x - p[0], l.y - p[1]) <= A.nr + HERO_R) return true;
      const R = A.thick * 0.9 + HERO_R;
      for (const g of e.lnk) {
        const a = e.pts[g[0]], b = e.pts[g[1]];
        if (bseg(l.x, l.y, a[0], a[1], b[0], b[1]) <= R) return true;
      }
      return false;
    },
    // The source. On from the first frame, which is what the first pass was missing entirely:
    // twenty-odd knots and no origin is a net the eye scans instead of reads. It is also what makes
    // the release continuous, because the light that comes out of the middle comes out of something
    // that was already there. Both rings sit outside the caster's own silhouette on purpose -- this
    // is a floor layer and the boss is drawn on top of it, so anything inside 11 px is a glow the
    // sprite eats.
    hub(e, a, g) {
      const A = e.ab, pl = 0.76 + 0.24 * Math.sin(e.t * 9);
      core(e.x, e.y, (14 + 8 * g) * pl, FK_HALO, 0.34 * a, 2.0);
      ring(e.x, e.y, 13 + 4 * g, 1.5, A.col, 0.80 * a * pl, GSQ, 1.9);
      ring(e.x, e.y, 22 + 9 * g, 0.9, A.col, 0.42 * a * pl, GSQ, 2.2);
      for (let i = 0; i < 6; i++) {
        const aa = i / 6 * TAU + e.t * 0.9 * bdir(e);
        chevron(bwx(e, Math.cos(aa) * (18 + 5 * g)), bwy(e, Math.sin(aa) * (18 + 5 * g)),
          aa, 3.2, A.hot, 0.40 * a * pl, 1.0, 0.8);
      }
    },
    // `wv` is null during the wind-up and a travelling band once a beat has landed: `u` is how far
    // along the chain the freeze has washed, `a` how bright it still is. `br` is the breath, and it
    // is applied to the *halo* layer only -- the body and the knots stay exactly on the hitbox, so
    // the net can appear to expand and contract without the picture ever lying about where it bites.
    lattice(e, la, na, col, hot, flow, wv, br) {
      const A = e.ab, n = e.lnk.length;
      for (let i = 0; i < n; i++) {
        const g = e.lnk[i], d = i / Math.max(n - 1, 1), wt = 1 - d * 0.70;
        const a = e.pts[g[0]], b = e.pts[g[1]];
        const ax = bwx(e, a[0]), ay = bwy(e, a[1]), bx = bwx(e, b[0]), by = bwy(e, b[1]);
        // The travelling band, and the whole reason the depth ordering exists: light leaves the hub
        // and arrives at the rim, so a link's place in the chain has to be legible before the wave
        // gets there or the wave is just a flicker.
        const lit = wv ? Math.max(0, 1 - Math.abs(d - wv.u) * 2.6) * wv.a : 0;
        const dw = 0.50 + 0.50 * wt;
        line(bwx(e, a[0] * br), bwy(e, a[1] * br), bwx(e, b[0] * br), bwy(e, b[1] * br),
          A.thick * (0.45 + 1.05 * wt), FK_HALO, la * (0.40 + 1.1 * lit) * wt, 1.0);
        line(ax, ay, bx, by, A.thick * (0.24 + 0.50 * wt), A.col, la * dw * (1 + 1.5 * lit), 1.5);
        line(ax, ay, bx, by, Math.max(A.thick * 0.20 * wt, 0.45), col,
          la * dw * (0.80 + 1.8 * lit), 2.2);
        if (lit > 0.02)
          line(ax, ay, bx, by, Math.max(A.thick * 0.12, 0.4), WHITE, 0.90 * lit, 2.5);
        if (flow > 0)
          fkFlow(ax, ay, bx, by, 2, e.t * 0.60 - i * 0.16, A.col, hot,
            flow * (0.40 + 0.60 * wt), 0.17);
      }
      for (let i = 0; i < e.pts.length; i++) {
        const d = i / Math.max(e.pts.length - 1, 1);
        const lit = wv ? Math.max(0, 1 - Math.abs(d - wv.u) * 2.6) * wv.a : 0;
        fkNode(bwx(e, e.pts[i][0]), bwy(e, e.pts[i][1]), A.nr * 0.82, col, hot,
          na * (1 + 1.5 * lit), e.tw[i] + e.t * 4.4, e.seed + i * 17);
      }
    },
    // Which beat is travelling, and how far along the chain. Every beat sends exactly one wave out
    // of the hub, and between beats nothing travels -- which is what makes the beats legible as
    // beats rather than as a continuous grind. It keeps a third of its brightness all the way to the
    // rim: a wave that dies at the halfway point never reaches the knots that are furthest away,
    // and those are the ones the player is standing among.
    wave(e, q) {
      const tk = e.ab.ticks || [0];
      let b = -1;
      for (let i = 0; i < tk.length; i++) if (q >= tk[i]) b = i;
      if (b < 0) return null;
      const nx = b + 1 < tk.length ? tk[b + 1] : 1;
      const u = c01((q - tk[b]) / Math.max((nx - tk[b]) * 0.95, 1e-3));
      return { u, a: 0.35 + 0.65 * (1 - u), b };
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab;
      // Inward-only breath: the halo contracts and releases, so it never claims ground the knots
      // do not stand on.
      const br = 1 - 0.05 * (0.5 + 0.5 * Math.sin(e.t * 3.0));
      this.lattice(e, 0.20 + 0.12 * urg, 0.30 + 0.22 * urg, A.col, A.hot,
        0.42 + 0.34 * urg, null, br);
      for (let i = 0; i < e.pts.length; i++) {
        const x = bwx(e, e.pts[i][0]), y = bwy(e, e.pts[i][1]);
        puddle(x, y, A.nr, A.nr * GSQ, FK_HALO, 0.13 + 0.08 * urg, e.seed + i, 7, 1.4);
        ring(x, y, A.nr, 1.3, WARN, 0.50 * eg, GSQ, 1.8);
      }
      this.hub(e, 0.55 + 0.45 * k, k);
      // One bright knot travels the whole chain. The lattice is drawn in full from the first
      // frame, so this is the only thing that says how much of the wind-up is left.
      const t = k * e.lnk.length, i = Math.min(e.lnk.length - 1, Math.floor(t)), f = t - i;
      const a = e.pts[e.lnk[i][0]], b = e.pts[e.lnk[i][1]];
      const cx = bwx(e, a[0] + (b[0] - a[0]) * f), cy = bwy(e, a[1] + (b[1] - a[1]) * f);
      core(cx, cy, 6.0, FK_HALO, 0.40 * fl, 2.0);
      core(cx, cy, 3.2, WARN_H, 0.85 * fl);
      core(cx, cy, 1.4, WHITE, 0.80 * fl, 2.2);
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab, wv = this.wave(e, q);
      const br = 1 - 0.05 * (0.5 + 0.5 * Math.sin(e.t * 3.0));
      // Same two colours as the wind-up, brighter. Swapping the body to the pale tone here was the
      // obvious move and the wrong one: on a buffer quantised to 16 levels a pale tone at the alpha
      // a floor layer can afford resolves to grey, so the net went *duller* at the moment it bit.
      // The escalation is carried by the wave and by the white core in it, not by the hue.
      this.lattice(e, 0.30 + 0.26 * fd, 0.46 + 0.34 * fd, A.hot, A.hot, 0.34, wv, br);
      for (let i = 0; i < e.pts.length; i++) {
        const d = i / Math.max(e.pts.length - 1, 1);
        const lit = wv ? Math.max(0, 1 - Math.abs(d - wv.u) * 2.6) * wv.a : 0;
        if (lit <= 0.08) continue;
        cracks(bwx(e, e.pts[i][0]), bwy(e, e.pts[i][1]), 5, A.nr * 1.4, A.col,
          0.34 * lit, e.seed + i, 0.5, 1.0);
      }
      this.hub(e, 0.60 + 0.40 * fd, 1);
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab, wv = this.wave(e, q);
      if (!wv) return;
      // Each beat is visibly *fired* from the middle: for the first fifth of its travel the hub
      // flares, and only then does the chain start lighting up. Drawn in `mid` rather than `under`
      // because the caster stands on his own hub and the floor layer goes behind him.
      const lf = 1 - c01(wv.u / 0.22);
      if (lf > 0.01) {
        core(e.x, e.y - 3, 5 + 13 * lf, FK_HALO, 0.40 * lf, 1.8);
        core(e.x, e.y - 3, 2 + 6 * lf, A.hot, 0.85 * lf, 1.7);
        core(e.x, e.y - 3, 1.6, WHITE, 0.90 * lf, 2.2);
        ring(e.x, e.y, 8 + 34 * (1 - lf), 1.1, A.hot, 0.55 * lf, GSQ, 2.2);
        sparks(e.x, e.y - 3, 8, 3, 22, A.hot, 0.50 * lf, e.seed + wv.b * 31, 1.0, 0.8, 0, TAU, 6);
      }
      for (let i = 0; i < e.pts.length; i++) {
        const d = i / Math.max(e.pts.length - 1, 1);
        const lit = Math.max(0, 1 - Math.abs(d - wv.u) * 2.6) * wv.a;
        if (lit <= 0.06) continue;
        const x = bwx(e, e.pts[i][0]), y = bwy(e, e.pts[i][1]);
        // Spikes come up as the wave reaches each knot, so the burst is the same figure arriving
        // rather than a second figure appearing.
        shard(x, y, A.nr * (0.8 + 2.6 * lit), 3.0 * g, A.col, A.hot, 0.95 * lit,
          (i & 1) ? 0.22 : -0.22);
        core(x, y - 2, 5.0 * lit, FK_HALO, 0.48 * lit, 2.0);
        core(x, y - 2, 1.7, WHITE, 0.85 * lit, 2.0);
        if (lit > 0.60)
          sparks(x, y - 2, 5, 1, 11 * lit, A.hot, 0.55 * lit, e.seed + i * 7, 1.0, 0.8, 0, TAU, 5);
      }
    },
  },

  // ---- sigil: a seal drawn around you, one stroke at a time -----------------------
  // The one wind-up in the game with a *quantity* in it rather than only a clock. Everything else
  // marks its ground and then runs a bright edge out to it; this one draws the figure itself,
  // stroke by stroke, and does not go off until the last stroke closes the star. So the question
  // it asks is not "how long have I got" but "how many strokes are left", which is a thing you can
  // count while doing something else -- and this boss is always making you do something else.
  //
  // The two promises 6d makes are both still kept, and the second one is what makes the first
  // possible: the ground is marked at full size on the first frame -- the whole figure is there,
  // ghosted, and the hit area is the whole figure for the entire wind-up -- while the *ink* is
  // what advances. What is being drawn is the timing. It is the same trick every other shape uses,
  // except here the travelling element is a pen instead of a ring.
  //
  // Then it bites four times, and each beat is a different part of its own figure: the chords you
  // watched being drawn, the five points, the inner ring where the chords cross, and finally
  // everything at once *plus the middle* -- the ground it was cast on. That last beat is the move:
  // the safe pocket for the first three is the middle, and the middle is the one place the fourth
  // one takes. You have from the first stroke to the last beat to walk out into one of the five
  // bays between the star's points, and at this size that is a decision you have to start early
  // and cannot change.
  sigil: {
    init(w, e) {
      const A = e.ab, n = A.n, rng = mulberry32(e.seed), ph = rng.range(0, TAU);
      e.ph = ph; e.pts = []; e.lnk = []; e.inr = [];
      for (let i = 0; i < n; i++)
        e.pts.push([Math.cos(ph + i / n * TAU) * A.r, Math.sin(ph + i / n * TAU) * A.r]);
      // Traversal order, not index order: chord j runs from the j-th knot the pen reaches to the
      // next one, so drawing `lnk` in order is one continuous stroke closing on itself. Same five
      // chords a `web` builds, in the order a hand would lay them down.
      for (let j = 0; j < n; j++) e.lnk.push([(j * A.skip) % n, ((j + 1) * A.skip) % n]);
      // Where the chords cross each other -- the inner ring is not a second drawing decision, it
      // is already implied by the five strokes. Solved rather than hard-coded so any `n`/`skip`
      // that makes a star makes the right inner ring too.
      for (let j = 0; j < n; j++) {
        const g = e.lnk[j], h = e.lnk[(j + 2) % n];
        const p = vhX2(e.pts[g[0]], e.pts[g[1]], e.pts[h[0]], e.pts[h[1]]);
        const a = ph + (j + 0.5) / n * TAU;
        e.inr.push(p && Math.hypot(p[0], p[1]) < A.r * 0.9
          ? p : [Math.cos(a) * A.r * 0.382, Math.sin(a) * A.r * 0.382]);
      }
      // A *ring* through those crossings, not the polygon they outline. The polygon's edges lie on
      // the chords themselves, so it would be the same ground beat one already takes -- a beat that
      // asks a question you have already answered is a beat that is not there. The ring runs
      // outside the polygon between crossings, through the bays, so it is new ground and the middle
      // is safe from it, which is exactly the setup the fourth beat needs.
      e.ir = 0;
      for (const p of e.inr) e.ir += Math.hypot(p[0], p[1]) / n;
    },
    // Which stroke the pen is on, and how far through it. Both halves of the shape need this: the
    // draw to place the nib, and `mid` to know which knots are already tied.
    pen(e, k) {
      const n = e.lnk.length, t = c01(k) * n;
      const i = Math.min(n - 1, Math.floor(t));
      return { i: i, f: t - i };
    },
    onChords(e, l, pad) {
      const R = e.ab.thick * 0.9 + HERO_R + (pad || 0);
      for (const g of e.lnk) {
        const a = e.pts[g[0]], b = e.pts[g[1]];
        if (bseg(l.x, l.y, a[0], a[1], b[0], b[1]) <= R) return true;
      }
      return false;
    },
    onKnots(e, l) {
      const R = e.ab.nr + HERO_R;
      for (const p of e.pts) if (Math.hypot(l.x - p[0], l.y - p[1]) <= R) return true;
      return false;
    },
    onInner(e, l) {
      return Math.abs(Math.hypot(l.x, l.y) - e.ir) <= e.ab.thick * 0.8 + HERO_R;
    },
    onEye(e, l) { return Math.hypot(l.x, l.y) <= e.ab.nr + HERO_R; },
    hit(w, e, l) {
      // Outside the figure's own boundary nothing can be live, in either half. Same line every
      // other shape opens with, and for the same reason: the knots reach `nr` past `r` and nothing
      // else does, so that sum is the only edge the player was ever shown.
      if (Math.hypot(l.x, l.y) > e.ab.r + Math.max(e.ab.nr, e.ab.thick * 0.9) + HERO_R)
        return false;
      // The whole figure is live for the whole wind-up. It has to be: what is drawn is what hurts,
      // and what is drawn from frame 0 is all of it.
      if (!e.fired) return this.onChords(e, l) || this.onKnots(e, l)
        || this.onInner(e, l) || this.onEye(e, l);
      switch (e.ticked) {
        case 1: return this.onChords(e, l);
        case 2: return this.onKnots(e, l);
        case 3: return this.onInner(e, l);
        // Everything, and the middle with it. Nothing here is outside the union above.
        default: return this.onChords(e, l) || this.onKnots(e, l)
          || this.onInner(e, l) || this.onEye(e, l);
      }
    },
    // The whole figure, ghosted -- body, both hard red edges, the five points, the inner ring, the
    // eye in the middle. This is the promise, and it is complete on the first frame: the wind-up
    // adds ink, never ground. Everything the four beats will ever ask about is already here.
    figure(w, e, urg, eg) {
      const A = e.ab, n = e.inr.length;
      for (const g of e.lnk) {
        const a = e.pts[g[0]], b = e.pts[g[1]];
        const ax = bwx(e, a[0]), ay = bwy(e, a[1]), bx = bwx(e, b[0]), by = bwy(e, b[1]);
        const sa = Math.atan2(by - ay, bx - ax);
        const nx = -Math.sin(sa) * A.thick, ny = Math.cos(sa) * A.thick;
        line(ax, ay, bx, by, A.thick, A.col, 0.13 + 0.08 * urg, 0.9);
        line(ax + nx, ay + ny, bx + nx, by + ny, 1.0, WARN, 0.40 * eg);
        line(ax - nx, ay - ny, bx - nx, by - ny, 1.0, WARN, 0.40 * eg);
      }
      for (let i = 0; i < n; i++) {
        const a = e.inr[i], b = e.inr[(i + 1) % n];
        const ax = bwx(e, a[0]), ay = bwy(e, a[1]), bx = bwx(e, b[0]), by = bwy(e, b[1]);
        line(ax, ay, bx, by, A.thick * 0.5, A.col, 0.09 + 0.05 * urg, 0.9);
        core(ax, ay, 2.0, A.col, 0.28 + 0.18 * urg, 1.4);
      }
      // The band through the crossings, in the same grammar as everything else: tinted body, hard
      // red edge on both sides. Beat three is this and nothing else, so it gets its own two edges.
      const ir = e.ir, th = A.thick * 0.8;
      ring(e.x, e.y, ir, th, A.col, 0.11 + 0.07 * urg, GSQ, 0.9);
      ring(e.x, e.y, ir + th, 1.0, WARN, 0.40 * eg, GSQ, 1.5);
      ring(e.x, e.y, Math.max(2, ir - th), 1.0, WARN, 0.40 * eg, GSQ, 1.5);
      for (let i = 0; i < e.pts.length; i++) {
        const x = bwx(e, e.pts[i][0]), y = bwy(e, e.pts[i][1]);
        puddle(x, y, A.nr, A.nr * GSQ, A.col, 0.12 + 0.07 * urg, e.seed + i, 7, 1.4);
        ring(x, y, A.nr, 1.4, WARN, 0.46 * eg, GSQ, 1.5);
      }
      puddle(e.x, e.y, A.nr, A.nr * GSQ, A.col, 0.10 + 0.06 * urg, e.seed + 91, 7, 1.4);
      ring(e.x, e.y, A.nr, 1.3, WARN, 0.38 * eg, GSQ, 1.5);
      // Dotted, like the stomp's boundary: it is only where the points sit, and drawing it solid
      // would claim the ring itself bites.
      dial(e.x, e.y, A.r, 30, WARN, 0.19 * eg, GSQ, 5, 1, 0.03, 0.05);
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab, n = e.lnk.length, p = this.pen(e, k);
      this.figure(w, e, urg, eg);
      // The ink. Closed strokes stay lit and keep something running along them; the stroke being
      // drawn stops dead at the nib. None of this widens the figure -- it is the same five chords
      // the ghost already claimed, laid down in the order a hand would lay them.
      for (let j = 0; j <= p.i; j++) {
        const g = e.lnk[j], a = e.pts[g[0]], b = e.pts[g[1]];
        const ax = bwx(e, a[0]), ay = bwy(e, a[1]), bx = bwx(e, b[0]), by = bwy(e, b[1]);
        vhInk(ax, ay, bx, by, j < p.i ? 1 : p.f, A.thick * 0.40, A.col, A.hot,
          0.60 + 0.22 * urg, e.seed * 7 + j, 1.8);
        if (j < p.i) vhBeads(ax, ay, bx, by, 7, e.t * 2.2 + j, 1.0, A.hot, 0.32 + 0.20 * urg);
      }
      // The nib is the clock, and it is a *count* rather than a bar: five strokes, and you can
      // read how many are left in the glance you can afford while running.
      const g0 = e.lnk[p.i], a0 = e.pts[g0[0]], b0 = e.pts[g0[1]], t1 = e.pts[g0[1]];
      const nx = bwx(e, a0[0] + (b0[0] - a0[0]) * p.f);
      const ny = bwy(e, a0[1] + (b0[1] - a0[1]) * p.f);
      core(nx, ny, 3.6, WARN_H, 0.88 * fl, 1.6);
      core(nx, ny, 1.5, WHITE, 0.78 * fl);
      sparks(nx, ny, 5, 1, 7, A.hot, 0.48 * fl, (e.seed + p.i) | 0, 0.9, GSQ);
      ring(bwx(e, t1[0]), bwy(e, t1[1]), A.nr * (1.35 - 0.35 * p.f), 1.2, WARN_H,
        0.34 * fl, GSQ, 1.4);
      // Points the pen has already tied burn, and each grows its own knot-mark. The one ahead of
      // it only has the closing ring above.
      for (let j = 0; j <= p.i; j++) {
        const q = e.pts[e.lnk[j][0]], x = bwx(e, q[0]), y = bwy(e, q[1]);
        ring(x, y, A.nr, 1.6, A.hot, 0.42 * eg, GSQ, 1.5);
        vhGlyph(x, y, A.nr * 0.55, e.t * 0.8 + j, A.hot, 0.50, e.seed + j * 13);
      }
      for (let j = 0; j < n; j++) {
        const a = -Math.PI / 2 + j / n * TAU;
        const x = bwx(e, Math.cos(a) * 7), y = bwy(e, Math.sin(a) * 7);
        if (j < p.i) core(x, y, 1.5, A.hot, 0.85);
        else ring(x, y, 1.6, 0.8, WARN, 0.40 * eg, GSQ, 1.2);
      }
    },
    mid(w, e, k) {
      const A = e.ab, p = this.pen(e, k), lift = 5 + 9 * k;
      // The seal lifting off the floor as it closes -- above the mark rather than on it, so it
      // cannot be misread as more ground. This is the thing the drawing is *for*.
      for (let j = 0; j < p.i; j++) {
        const g = e.lnk[j], a = e.pts[g[0]], b = e.pts[g[1]];
        line(bwx(e, a[0] * 0.40), bwy(e, a[1] * 0.40) - lift,
          bwx(e, b[0] * 0.40), bwy(e, b[1] * 0.40) - lift, 1.0, A.hot, 0.36 + 0.20 * k, 1.3);
      }
      vhGlyph(e.x, e.y - lift, 4 + 2 * k, e.t * 1.4, A.hot, 0.52 + 0.30 * k, e.seed + 5, 1);
      core(e.x, e.y - lift, 1.8 + 1.5 * (p.i / e.lnk.length), WARN_H, 0.48 + 0.36 * k);
    },
    // Which beat is landing, and how much of its own quarter-second is left. `stepTel` bumps
    // `e.ticked` just before it asks, so 1 means the chords are what is going off right now, and
    // the entry's global `fd` is far too slow to punctuate four beats inside one boom.
    beat(e, q) {
      const A = e.ab, sp = Math.max(e.dur - A.tell, 1e-3);
      const i = Math.max(0, Math.min(e.ticked, A.ticks.length) - 1);
      return { i: i, g: 1 - c01((q - A.ticks[i] / sp) * 5) };
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab, b = this.beat(e, q), n = e.inr.length;
      // `fd` is the entry fading out as a whole, and by the fourth beat it is down near a fifth --
      // fine for the cooling mark, useless for the beat that is landing right now. So the mark uses
      // `fd` and the beat highlight uses its own floor.
      const hi = Math.max(fd, 0.38);
      // The ink cools but the mark stays for the whole entry: a seal that vanished the moment it
      // went off would not be a seal. What each beat adds is one part of the figure going white.
      for (const lk of e.lnk) {
        const a = e.pts[lk[0]], c = e.pts[lk[1]];
        const ax = bwx(e, a[0]), ay = bwy(e, a[1]), bx = bwx(e, c[0]), by = bwy(e, c[1]);
        line(ax, ay, bx, by, A.thick, A.col, 0.19 * fd, 0.9);
        line(ax, ay, bx, by, A.thick * 0.30, A.hot,
          b.i === 0 || b.i >= 3 ? (0.24 + 0.42 * b.g) * hi : 0.22 * fd, 1.4);
      }
      // The band, not the polygon: the polygon's edges sit on the chords, so tinting them would be
      // tinting beat one's ground a second time. Small marks stay on the crossings themselves.
      const ir = e.ir, ith = A.thick * 0.8;
      ring(e.x, e.y, ir, ith, A.col,
        b.i === 2 || b.i >= 3 ? (0.16 + 0.24 * b.g) * hi : 0.12 * fd, GSQ, 0.9);
      for (let i = 0; i < n; i++) {
        const a = e.inr[i];
        core(bwx(e, a[0]), bwy(e, a[1]), 2.2, A.col,
          b.i === 2 || b.i >= 3 ? (0.24 + 0.30 * b.g) * hi : 0.18 * fd, 1.4);
      }
      for (let i = 0; i < e.pts.length; i++) {
        const x = bwx(e, e.pts[i][0]), y = bwy(e, e.pts[i][1]);
        puddle(x, y, A.nr, A.nr * GSQ, A.col,
          b.i === 1 || b.i >= 3 ? (0.14 + 0.20 * b.g) * hi : 0.13 * fd, e.seed + i, 7, 1.4);
        cracks(x, y, 5, A.nr * 1.15, A.hot, 0.20 * fd, e.seed + i, 0.5, 1.0);
      }
      // The middle only ever bites on the last beat, so it only ever scorches then -- and that is
      // the beat the first three spent teaching you to stand here.
      if (b.i >= 3) {
        puddle(e.x, e.y, A.nr * (0.55 + 0.65 * (1 - b.g)), A.nr * GSQ, A.hot, 0.30 * hi,
          e.seed + 3, 9, 1.5);
        cracks(e.x, e.y, 9, A.nr * 1.6, A.hot, 0.26 * hi, e.seed + 4, 0.5, 1.1);
        unlight(e.x, e.y, A.r * 0.30, 0.10 * hi, 1.5);
      }
    },
    boomMid(w, e, q, fd, gp) {
      const A = e.ab, b = this.beat(e, q), g = b.g;
      if (g <= 0.02) return;
      // Deliberately *not* scaled by `fd`. Four beats spread across the whole entry, and `fd` is a
      // single fade over that same span -- multiply and the fourth beat, the one the other three
      // were teaching, comes out at a fifth of the brightness of the first. `b.g` is each beat's
      // own clock, so every beat flares as hard as the one before it.
      if (b.i === 0 || b.i >= 3) for (const lk of e.lnk) {
        const a = e.pts[lk[0]], c = e.pts[lk[1]];
        bolt(bwx(e, a[0]), bwy(e, a[1]) - 3, bwx(e, c[0]), bwy(e, c[1]) - 3, A.col, A.hot,
          0.78 * g, 7, 2.4, e.seed + lk[0] * 17, 2.3 * g, 2);
      }
      if (b.i === 1 || b.i >= 3) for (let i = 0; i < e.pts.length; i++) {
        const x = bwx(e, e.pts[i][0]), y = bwy(e, e.pts[i][1]) - 3;
        star(x, y, A.hot, 8, 2, A.nr * (1.1 + 1.3 * (1 - g)), 2.2, 0.84 * g, e.seed + i);
        core(x, y, 4.8 * g, A.hot, 0.92 * g, 1.6);
        core(x, y, 2.0 * g, WHITE, 0.86 * g);
        sparks(x, y, 9, 2, A.nr * 1.5, A.col, 0.60 * g, e.seed + i * 5, 1.0, GSQ);
      }
      // Beat three is the band, so it flares as a band: one hot ring plus five arcs riding it out,
      // and a point on each crossing so the eye can tie the ring back to the figure it came from.
      if (b.i === 2 || b.i >= 3) {
        const ir = e.ir;
        ring(e.x, e.y - 3, ir, 2.2 + 2.6 * g, A.hot, 0.80 * g, GSQ, 1.4);
        ring(e.x, e.y - 3, ir * (1 + 0.30 * (1 - g)), 1.4, WHITE, 0.52 * g, GSQ, 1.6);
        for (let i = 0; i < e.inr.length; i++) {
          const a = e.inr[i];
          arc(e.x, e.y - 3, ir, Math.atan2(a[1], a[0]), 0.34 + 0.22 * (1 - g),
            1.8 + 1.8 * g, WHITE, 0.62 * g, GSQ, 1.6, 1);
          core(bwx(e, a[0]), bwy(e, a[1]) - 3, 3.4 * g, WHITE, 0.72 * g);
        }
      }
      if (b.i >= 3) {
        column(e.x, e.y - 2, e.y - 2 - 52 * g, A.nr * 1.5 * g, A.nr * 0.5 * g,
          A.col, A.hot, 0.80 * g);
        star(e.x, e.y - 6, A.hot, 12, 2, A.nr * (1.4 + 2.2 * (1 - g)), 2.6, 0.88 * g,
          e.seed + 21, 0.4);
        core(e.x, e.y - 6, 7.0 * g, WHITE, 0.95 * g, 1.6);
      }
    },
  },

  // ---- waves: fronts leaving a wedge, one after another --------------------------
  // The wedge is marked whole from the first frame; what travels is a series of fronts, and the
  // gaps between them are the move. You do not leave this one, you *time* it -- which is why it
  // hurts on contact every frame rather than on beats, and why each front keeps its own ledger
  // so walking outward alongside a front cannot be charged for twice.
  //
  // The first pass drew that correctly and read as a technical illustration: two hairline red rays,
  // an empty middle, and fronts of one soft thickness. Three things fixed it, and none of them is
  // more lines. The interior is *filled*, brightest at the mouth and dying toward the rim, so the
  // wedge has weight and a source. Both edges taper -- thick where they leave the mouth, a point
  // where they end -- with a saturated halo beneath, so they read as energy under pressure rather
  // than as pencil. And each front is built like a pressure wave: compression haze behind it, a
  // one-pixel white crest, a wake thinning out behind. Add sparks running outward along the edges
  // and the picture finally says which way the thing is going while it is still standing still.
  waves: {
    init(w, e) {
      e.got = 0;
      // Where the hero stood when the mouth opened, in the cone's own terms. `aim:'dir'` means
      // this was pointed at a person, and the lock mark below is the only thing on screen that
      // says so -- the warm patch under the hero's feet is the hero's own lamp, on in every frame
      // of every fight, so it can never mean "targeted".
      const l = heroLocal(w, e);
      e.ld = clamp(Math.hypot(l.x, l.y), 24, e.ab.r * 0.9);
      e.sp = mulberry32(e.seed).range(0, 1);
    },
    hit(w, e, l) {
      const A = e.ab, d = Math.hypot(l.x, l.y);
      if (d > A.r + HERO_R) return false;
      if (Math.abs(bangd(Math.atan2(l.y, l.x), e.ang)) >
        A.arc + Math.atan2(HERO_R, Math.max(d, 1))) return false;
      if (!e.fired) return true;
      const q = bq(e), sp = 1 - (A.nw - 1) * A.gap;
      for (let i = 0; i < A.nw; i++) {
        if (e.got & (1 << i)) continue;
        const wq = (q - i * A.gap) / sp;
        if (wq <= 0 || wq > 1 || Math.abs(d - wq * A.r) > A.band + HERO_R) continue;
        e.got |= (1 << i);
        return true;
      }
      return false;
    },
    // The filled interior, as six nested bands whose alpha falls with radius. One wedge at one
    // alpha is a stencil; a gradient that dies outward is the only cue in the whole figure that
    // says which end the sound is coming out of. Bands are spaced exactly their own half-thickness
    // apart so their tapered edges cross at half brightness and sum flat -- overlap them more and
    // the seams themselves become rings, which is a second set of arcs the shape did not ask for.
    fill(e, a) {
      const A = e.ab, sw = A.arc * 2, n = 6;
      for (let j = 0; j < n; j++) {
        const t = (j + 0.5) / n;
        arc(e.x, e.y, A.r * t, e.ang, sw * (1 - 0.05 * t), A.r / n, FK_FILL,
          a * (1 - 0.58 * t), GSQ, 0.7, 1.5);
      }
    },
    // Both edges of the mouth: halo, body, hot lip, each thick at the apex and a point at the rim.
    edges(e, col, a) {
      const A = e.ab;
      for (const s of [1, -1]) {
        const ea = e.ang + s * A.arc;
        fkTaper(e, ea, 0, A.r, 5.4, 0.8, FK_HALO, 0.30 * a, 7, 1.0);
        fkTaper(e, ea, 0, A.r, 2.4, 0.45, col, 0.78 * a, 7, 1.7);
        fkTaper(e, ea, 0, A.r, 0.75, 0.34, WARN_H, 0.40 * a, 7, 2.3);
      }
    },
    // Sparks running outward along both edges. Cheap, and the only part of the wind-up that gives
    // the cone a *direction* rather than just an extent.
    rail(e, a) {
      const A = e.ab;
      for (const s of [1, -1]) {
        const ea = e.ang + s * A.arc, c = Math.cos(ea), sn = Math.sin(ea);
        for (let j = 0; j < 4; j++) {
          const u = (e.sp + j / 4 + e.t * 0.72) % 1, f = Math.sin(Math.PI * u);
          if (f < 0.10) continue;
          const r = u * A.r;
          const x = bwx(e, c * r), y = bwy(e, sn * r);
          line(x, y, bwx(e, c * (r - 11)), bwy(e, sn * (r - 11)), 0.8, A.col, a * f * 0.55, 1.9);
          core(x, y, 1.7, A.hot, a * f, 1.7);
        }
      }
    },
    // One front. A wave, not a painted arc: compression haze *behind* the crest, the body, a hot
    // lip, a one-pixel white crest, and three thinning arcs of wake. The crest is thin and hard on
    // purpose -- one soft thickness across the whole front is the difference between a wave and a
    // smear, and the smear is what the first pass drew.
    front(e, r, a, g, sq) {
      const A = e.ab, sw = A.arc * 2;
      arc(e.x, e.y, r - A.band * 0.7, e.ang, sw, A.band * 1.3, FK_HALO, 0.44 * a, sq, 0.8, 1.4);
      arc(e.x, e.y, r, e.ang, sw, A.band * 0.7, A.col, 0.56 * a, sq, 1.1, 1.4);
      arc(e.x, e.y, r, e.ang, sw * 0.97, A.band * 0.30 * g, A.hot, 0.80 * a, sq, 1.7, 1.6);
      arc(e.x, e.y, r + 0.7, e.ang, sw * 0.92, Math.max(0.7, A.band * 0.10), WHITE,
        0.74 * a, sq, 2.5, 1.9);
      for (let j = 1; j <= 3; j++)
        arc(e.x, e.y, r - A.band * (1.0 + j * 0.9), e.ang, sw * (0.95 - j * 0.05),
          A.band * (0.30 - j * 0.07), A.col, 0.26 * a / j, sq, 1.5, 1.5);
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab, sw = A.arc * 2;
      this.fill(e, 0.19 + 0.13 * urg);
      // The fronts are stacked at the mouth before they leave: the picture has to say "this
      // arrives as a series", which one expanding arc cannot say until it has already expanded.
      for (let i = 0; i < A.nw; i++)
        arc(e.x, e.y, A.band * (1.3 + i * 1.5), e.ang, sw * 0.93, A.band * 0.55, A.col,
          (0.28 - 0.025 * i) * eg, GSQ, 1.3, 1.5);
      this.edges(e, WARN, eg);
      arc(e.x, e.y, A.r, e.ang, sw, 1.4, WARN, 0.62 * eg, GSQ, 1.8, 1.7);
      this.rail(e, 0.50 + 0.40 * urg);
      // The clock: one bright front running the mouth's whole width out to the rim.
      const kr = Math.max(3, A.r * k);
      arc(e.x, e.y, kr, e.ang, sw, 2.0, WARN_H, 0.60 * fl, GSQ, 1.7, 1.6);
      arc(e.x, e.y, kr, e.ang, sw * 0.9, 0.8, WHITE, 0.44 * fl, GSQ, 2.4, 1.8);
      // The mouth itself, loading.
      const lg = 0.35 + 0.65 * k;
      core(e.x, e.y - 2, 8 + 6 * lg, FK_HALO, 0.30 * lg * fl, 2.2);
      core(e.x, e.y - 2, 3.0 + 2.2 * lg, A.hot, 0.52 * lg * fl, 1.8);
      fkLock(e, bwx(e, Math.cos(e.ang) * e.ld), bwy(e, Math.sin(e.ang) * e.ld), k, fl, A.hot);
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab, sp = 1 - (A.nw - 1) * A.gap;
      this.fill(e, 0.12 * fd);
      this.edges(e, A.col, 0.45 * fd);
      for (let i = 0; i < A.nw; i++) {
        const wq = (q - i * A.gap) / sp;
        if (wq <= 0 || wq > 1) continue;
        // Live fronts are not scaled by `fd`: fade() is down to a sixth by the time the last
        // front is halfway out, and a front you cannot see is still a front that hurts.
        this.front(e, wq * A.r, (1 - wq * 0.42) * (0.45 + 0.55 * fd), 1, GSQ);
      }
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab, sp = 1 - (A.nw - 1) * A.gap;
      for (let i = 0; i < A.nw; i++) {
        const wq = (q - i * A.gap) / sp;
        if (wq <= 0 || wq > 1) continue;
        const r = wq * A.r, a = (1 - wq * 0.5) * (0.45 + 0.55 * fd);
        arc(e.x, e.y - 4, r, e.ang, A.arc * 2, A.band * 0.72 * g, A.hot, 0.78 * a, 0.62, 1.5, 1.8);
        arc(e.x, e.y - 4, r, e.ang, A.arc * 1.8, 0.9 * g, WHITE, 0.66 * a, 0.62, 2.3, 2.0);
        // The tips are where a front meets the marked edge, so that is where it throws chips.
        for (const s of [1, -1]) {
          const ta = e.ang + s * A.arc;
          const x = bwx(e, Math.cos(ta) * r), y = bwy(e, Math.sin(ta) * r) - 4;
          core(x, y, 5.0 * g, FK_HALO, 0.42 * a, 2.0);
          core(x, y, 3.2 * g, A.hot, 0.85 * a);
          sparks(x, y, 5, 1, 11, A.hot, 0.55 * a, e.seed + i * 31 + (s > 0 ? 1 : 2),
            1.0, 0.8, ta - 0.8, ta + 0.8, 6);
        }
        // A hard flash at the mouth as each front leaves. Five of them in sequence is the rhythm
        // of the volley, stated where the volley comes from.
        const lf = 1 - c01(wq / 0.13);
        if (lf > 0) fkFlash(e.x, e.y - 3, 9, A.col, A.hot, lf * lf, e.seed + i * 17);
      }
    },
  },

  // ---- blades: heads running down curved lanes -----------------------------------
  // Three cutting edges leave together on lanes that bend by their own amount, so the safe
  // ground is not the gap you see at the mouth -- it is the gap further out, and reading that
  // is the whole skill. The lanes are marked with both their hard edges, because a curve you
  // can only judge by its centre line is a curve you cannot stand next to.
  blades: {
    init(w, e) {
      const A = e.ab, rng = mulberry32(e.seed);
      e.bend = []; e.got = 0;
      for (let i = 0; i < A.nl; i++) e.bend.push(rng.range(-A.bend, A.bend));
    },
    // One formula for the art and for the hit test: base angle, plus this lane's bend times how
    // far down it you are. Generated rather than stored, so the two can never disagree.
    lane(e, i, t) {
      const A = e.ab;
      const b = e.ang + (i - (A.nl - 1) * 0.5) * A.spread + e.bend[i] * t;
      return [Math.cos(b) * A.r * t, Math.sin(b) * A.r * t];
    },
    // How far along its own lane blade `i` has got. The volley no longer leaves together: it
    // peels off across the fan over `stag` of the entry, so the gap you can stand in is between
    // the lane that has passed you and the lane that has not -- and that gap travels down the fan
    // instead of sitting still. Five lanes leaving at once is a wall you either cleared or did
    // not; five lanes leaving in sequence is one decision per lane, which is what makes the extra
    // two lanes more to read rather than less to do. Which end it starts from comes off the seed.
    prog(e, i, q) {
      const A = e.ab, st = A.stag || 0, n = Math.max(A.nl - 1, 1);
      const k = bdir(e) > 0 ? i : A.nl - 1 - i;
      return (q - k / n * st) / Math.max(1 - st, 1e-3);
    },
    // Three beats instead of one steady slide: the head sits at the mouth gathering (charge), snaps
    // across the middle of the lane (peak), then eases into the rim (fade). A blade that covers the
    // same ground every frame has no speed -- speed reads as a *change* of speed, and equal frame
    // spacing is exactly what made the old volley look like a diagram sliding outward. Position is
    // taken from here by the hit test as well as by the art, so the picture cannot lie about where
    // the edge is; `prog` still returns the raw clock, because the "has this lane left yet" gate is
    // a question about the clock and not about the distance.
    ease(t) {
      const u = c01(t);
      if (u < 0.22) return u * u * 2.1;
      if (u < 0.66) return 0.1016 + (u - 0.22) * 1.7209;
      const f = (u - 0.66) / 0.34;
      return 0.8588 + 0.1412 * (1 - (1 - f) * (1 - f));
    },
    head(e, i, q) { return this.lane(e, i, this.ease(this.prog(e, i, q))); },
    hit(w, e, l) {
      const A = e.ab, R = A.rad + HERO_R;
      if (!e.fired) {
        for (let i = 0; i < A.nl; i++)
          for (let s = 0; s < 8; s++) {
            const a = this.lane(e, i, s / 8), b = this.lane(e, i, (s + 1) / 8);
            if (bseg(l.x, l.y, a[0], a[1], b[0], b[1]) <= R) return true;
          }
        return false;
      }
      const q = bq(e);
      for (let i = 0; i < A.nl; i++) {
        if (e.got & (1 << i)) continue;
        // A lane that has not left yet has no head to be caught by -- a hitbox parked on the
        // caster's own feet for half a second is not something the picture said. One that has
        // finished stops at the rim it was drawn out to, which is marked ground either way.
        if (this.prog(e, i, q) <= 0) continue;
        const p = this.head(e, i, q);
        if (Math.hypot(l.x - p[0], l.y - p[1]) > R) continue;
        e.got |= (1 << i);
        return true;
      }
      return false;
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab;
      for (let i = 0; i < A.nl; i++) {
        const mid = [], ea = [], eb = [];
        for (let s = 0; s <= 8; s++) {
          const t = s / 8, p = this.lane(e, i, t), p2 = this.lane(e, i, Math.min(1, t + 0.05));
          const dx = p2[0] - p[0], dy = p2[1] - p[1], d = Math.max(Math.hypot(dx, dy), 1e-3);
          const nx = -dy / d * A.rad, ny = dx / d * A.rad;
          mid.push([bwx(e, p[0]), bwy(e, p[1])]);
          ea.push([bwx(e, p[0] + nx), bwy(e, p[1] + ny)]);
          eb.push([bwx(e, p[0] - nx), bwy(e, p[1] - ny)]);
        }
        // The corridor is filled in saturated ice rather than in the ability's pale steel: at the
        // alpha a floor mark is allowed to use, pale adds under one quantisation step on all three
        // channels and comes out as grey haze on a grey floor. This is the fix for "nhạt màu, chìm
        // vào nền" and it costs nothing -- same shape, different channel budget.
        polyline(mid, A.rad * 1.15, FK_HALO, 0.20 + 0.12 * urg, 0.9);
        polyline(mid, A.rad * 0.34, A.col, 0.22 + 0.14 * urg, 1.6);
        polyline(ea, 1.0, WARN, 0.46 * eg);
        polyline(eb, 1.0, WARN, 0.46 * eg);
        // Each head runs out on its *own* clock during the wind-up, on exactly the curve it will
        // travel on. So the order of fire is not a fact the player has to be told separately -- the
        // lane going first is the one whose light is furthest down it, and the one still sitting at
        // the mouth is the one you have the most time for.
        const t = c01(this.prog(e, i, k)), tv = Math.max(0.03, this.ease(t));
        const p = this.lane(e, i, tv);
        const x = bwx(e, p[0]), y = bwy(e, p[1]);
        core(x, y, 4.2 + 2.2 * t, FK_HALO, (0.26 + 0.24 * t) * fl, 2.0);
        core(x, y, 2.4 + 1.0 * t, WARN_H, (0.42 + 0.46 * t) * fl);
      }
      // The mouth loads. Seven lanes leaving out of nothing is seven events with no cause; a
      // brightening point they all leave *from* is the cause, and it is the same point the launch
      // flash will go off on.
      const lg = 0.30 + 0.70 * k;
      core(e.x, e.y - 2, 7 + 5 * lg, FK_HALO, 0.30 * lg * fl, 2.2);
      core(e.x, e.y - 2, 2.6 + 2.0 * lg, A.hot, 0.55 * lg * fl, 1.8);
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab;
      for (let i = 0; i < A.nl; i++) {
        const pts = [];
        for (let s = 0; s <= 8; s++) {
          const p = this.lane(e, i, s / 8);
          pts.push([bwx(e, p[0]), bwy(e, p[1])]);
        }
        polyline(pts, A.rad * 0.8, FK_HALO, 0.22 * fd, 0.9);
        polyline(pts, A.rad * 0.26, A.col, 0.20 * fd, 1.7);
        const t = this.prog(e, i, q);
        if (t <= 0) continue;
        const h = this.head(e, i, q);
        puddle(bwx(e, h[0]), bwy(e, h[1]), A.rad, A.rad * GSQ, A.hot,
          0.24 * (0.45 + 0.55 * fd), e.seed + i, 7, 1.5);
      }
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab;
      for (let i = 0; i < A.nl; i++) {
        const tr = this.prog(e, i, q);
        if (tr <= 0) continue;
        const tc = this.ease(tr);
        const p = this.lane(e, i, tc), p2 = this.lane(e, i, Math.min(1, tc + 0.06));
        const x = bwx(e, p[0]), y = bwy(e, p[1]) - 4;
        const ta = Math.atan2((p2[1] - p[1]) * GSQ, p2[0] - p[0]);
        // A blade is live and damaging until it reaches the rim, and with `stag` at 0.44 the last
        // lane is still travelling at q = 0.95 -- where `fd` has fallen to about a tenth. Scaling
        // the blade itself by `fd` therefore erased the back half of its own volley: the last lanes
        // arrived invisible and hit anyway. `la` keeps the moving part legible for its whole trip
        // and lets `fd` fade only what is genuinely aftermath.
        const la = 0.45 + 0.55 * fd;
        // The blade as a ribbon rather than a hairline: widest across the head, drawn back along
        // the way it came and narrowing to a point. Three passes -- saturated halo, body, hot
        // spine -- and `beam`'s own taper does the width ramp, so the tail is one call per layer.
        // A tail that is short at launch and long at speed is the other half of the speed cue that
        // `ease` starts: the shape itself stretches when the head is moving fastest.
        const tl = (10 + 30 * c01(tr * 1.6)) * (0.55 + 0.45 * fd);
        const back = ta + Math.PI;
        beam(x, y, back, 0, tl, A.rad * 1.15, 0.4, FK_HALO, 0.34 * la, 1.1, 1.7);
        beam(x, y, back, 0, tl * 0.86, A.rad * 0.62, 0.35, A.col, 0.52 * la, 1.6, 1.6);
        beam(x, y, back, 0, tl * 0.62, A.rad * 0.26, 0.3, A.hot, 0.62 * la, 2.1, 1.5);
        // The cutting edge: an arc drawn across the direction of travel, hard at high sharp so it
        // reads as an edge and not as a bruise.
        for (let k = 2; k >= 0; k--)
          arc(x - Math.cos(ta) * k * 3.4, y - Math.sin(ta) * k * 3.4, A.rad * (1.2 + k * 0.13),
            ta, 2.15, (2.4 - k * 0.55) * g, k === 0 ? A.hot : A.col,
            (0.88 - k * 0.24) * la, 1.0, 1.9, 1.9);
        arc(x, y, A.rad * 1.24, ta, 2.0, 0.85 * g, WHITE, 0.80 * la, 1.0, 2.4, 2.0);
        // Ripples shed off the head, one every third of a second, each one a crisp expanding
        // circle rather than a soft halo: thin and high-sharp is the difference between a ripple
        // and the blur the first pass produced.
        for (let s = 0; s < 2; s++) {
          const u = ((e.t * 3.1 + i * 0.37 + s * 0.5) % 1);
          ring(x, y, 3 + 15 * u, 0.8, A.col, 0.42 * (1 - u) * la, 1.0, 2.3);
        }
        core(x, y, 5.4 * g, FK_HALO, 0.50 * la, 2.0);
        core(x, y, 3.2 * g, A.hot, 1.0 * la);
        core(x, y, 1.5 * g, WHITE, 0.92 * la);
        // Chips thrown sideways off the edge, not backwards: a wind blade sheds what it cut.
        sparks(x, y, 7, 2, 14, A.hot, 0.60 * la, e.seed + i * 7, 1.0, 0.9,
          ta + 1.15, ta + 1.95, 8);
        sparks(x, y, 7, 2, 14, A.col, 0.52 * la, e.seed + i * 13, 1.0, 0.9,
          ta - 1.95, ta - 1.15, 8);
        // And the launch: a hard flash at the mouth for the first fifth of this lane's trip. Seven
        // of them in sequence is the volley's rhythm made audible in the picture.
        const lf = 1 - c01(tr / 0.20);
        if (lf > 0) fkFlash(e.x + Math.cos(ta) * 4, e.y - 3, 7.5, A.col, A.hot,
          lf * lf * 0.95, e.seed + i * 31);
      }
    },
  },

  // ---- spiral: a band travelling along spiral arms, outward or inward -------------
  // Two sketches again, and the only difference in the code is a direction. Death Spiral throws
  // its band out from the middle, so the middle is where you end up safe; Gravity Collapse drags
  // you toward the middle for the whole wind-up and then closes on it, so the middle is the one
  // place you must not be. Same picture, opposite answer, and the chevrons say which.
  //
  // What changed: the arms used to *be* the figure -- five overlapping bands at twenty samples
  // each -- and the result was a texture with no findable centre, which is fatal for a move whose
  // entire answer is "not the centre". The arms are now three, faint, and ground texture; the read
  // is carried by four rings drifting inward, thick and bright near the middle and thinning to
  // hairlines at the rim, so the direction of the collapse is legible from any single frame. One
  // tone per state, too: red while it is a warning, cyan once it is a thing that is happening. And
  // the lightning strobes on beats instead of firing every arm every frame -- a fringe that is
  // always on is not electricity, it is a border.
  spiral: {
    init(w, e) { e.got = 0; e.ph = mulberry32(e.seed).range(0, TAU); },
    front(e, q) {
      const A = e.ab;
      return A.dir === 'in' ? A.r - (A.r - A.r0) * q : A.r0 + (A.r - A.r0) * q;
    },
    step(w, e, dt) {
      const A = e.ab, h = w.hero;
      // The pull is real movement, not a slow: it is the reason this move needs no damage
      // scaling to be frightening. A dash beats it outright, which is the answer it is asking
      // for -- a pull you can only out-walk would be a stat check.
      if (!A.pull || e.fired || h.dsh > 0) return;
      const l = heroLocal(w, e), d = Math.hypot(l.x, l.y);
      if (d < 3) return;
      const g = A.pull * dt * (0.40 + 0.60 * c01(e.t / A.tell));
      h.x = clamp(h.x - l.x / d * g, BOUND.x0, BOUND.x1);
      h.y = clamp(h.y - l.y / d * g * GSQ, BOUND.y0, BOUND.y1);
    },
    hit(w, e, l) {
      const A = e.ab, d = Math.hypot(l.x, l.y);
      // The outer ring is the promise, in both halves. Without this line the travelling band
      // reaches `band + HERO_R` past it on the frame the front arrives at the edge, which is
      // eight pixels of damage outside the only line the player was given.
      if (d > A.r + HERO_R) return false;
      if (!e.fired) return true;
      if (e.got) return false;
      if (Math.abs(d - this.front(e, bq(e))) > A.band + HERO_R) return false;
      e.got = 1;
      return true;
    },
    // Four rings, always travelling the way the collapse will. Four is a number the eye counts
    // without trying; the weight ramp -- fat and bright in the middle, hairline at the rim -- is
    // what makes them read as one field flowing rather than as four separate circles.
    rings(e, a, col, sp) {
      const A = e.ab, inw = A.dir === 'in';
      for (let i = 0; i < 4; i++) {
        let u = (i / 4 + e.t * sp) % 1;
        if (u < 0) u += 1;
        const vis = c01(u / 0.12) * (1 - c01((u - 0.84) / 0.16));
        if (vis <= 0.01) continue;
        const rr = inw ? A.r0 + (A.r - A.r0) * (1 - u) : A.r0 + (A.r - A.r0) * u;
        const th = 0.75 + 2.5 * (inw ? u : 1 - u);
        ring(e.x, e.y, rr, th * 2.0, FK_HALO, a * vis * 0.30, GSQ, 1.2);
        ring(e.x, e.y, rr, th, col, a * vis * (0.40 + 0.55 * (inw ? u : 1 - u)), GSQ, 2.0);
      }
    },
    // Bolts on beats, not on frames. Nine a second, one or two arms each, picked off the seed so a
    // replay looks the same twice; each lands at full brightness on its own instant and is gone by
    // the next, which is the whole difference between electricity and a fringe.
    strobe(e, r, r1, a) {
      const A = e.ab, s = bdir(e), inw = A.dir === 'in';
      const t = (r - A.r0) / Math.max(A.r - A.r0, 1e-3);
      const beat = Math.floor(e.t * 9), rb = mulberry32(e.seed + beat * 977);
      // Holds a quarter of its brightness across the beat instead of fading linearly to nothing: a
      // strict sawtooth spends half of every beat too dim to see, so at 60 fps roughly every other
      // frame had no bolt in it at all and the "one or two per beat" rhythm read as flicker.
      const n = 1 + rb.int(0, 2), b = (1 - 0.72 * (e.t * 9 - beat)) * a;
      if (b <= 0.02) return;
      for (let j = 0; j < n; j++) {
        const i = rb.int(0, Math.max(A.arms, 1));
        const ang = e.ph + i / Math.max(A.arms, 1) * TAU + s * A.turns * TAU * t;
        const x0 = bwx(e, Math.cos(ang) * r), y0 = bwy(e, Math.sin(ang) * r) - 4;
        const x1 = bwx(e, Math.cos(ang) * r1), y1 = bwy(e, Math.sin(ang) * r1) - 4;
        bolt(x0, y0, x1, y1, A.col, A.hot, 0.95 * b, 6, 5, e.seed + beat * 31 + j, 2.0, 1);
        core(x1, y1, 5.0, FK_HALO, 0.55 * b, 2.0);
        core(x1, y1, 2.4, WHITE, 0.92 * b, 1.8);
        if (inw) core(x0, y0, 2.8, A.hot, 0.75 * b, 1.8);
      }
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab, s = bdir(e), inw = A.dir === 'in';
      // The floor stain is the *middle*, not the whole disc: a wash over 160 px of ground says
      // "all of this is marked", which is true and useless, whereas a stain that gets denser
      // toward the centre says the one thing the move needs said.
      puddle(e.x, e.y, A.r * 0.44, A.r * 0.44 * GSQ, FK_FILL, 0.13 + 0.09 * urg, e.seed, 9, 1.4);
      spiral(e.x, e.y, A.arms, A.r0, A.r, A.turns * s, A.col, 0.16 + 0.12 * eg, 1.4, GSQ,
        e.ph + e.t * (inw ? -1.9 : 1.9), 20, false);
      this.rings(e, 0.60 + 0.30 * urg, A.col, inw ? 0.30 : -0.30);
      // Red, and only red, for as long as this is a warning. The old version drew a cyan ring at
      // `front(e,0)`, which for an inward collapse is exactly the rim -- two colours on one line,
      // for the whole wind-up, which is why it read as a broken gradient rather than as a state.
      ring(e.x, e.y, A.r, 1.5, WARN, 0.58 * eg, GSQ, 1.7);
      dial(e.x, e.y, A.r, 12, WARN, 0.24 * eg, GSQ, 3, 1);
      const f0 = this.front(e, 0);
      if (!inw) ring(e.x, e.y, f0, 2.0, WARN, 0.34 * fl, GSQ, 1.7);
      for (let i = 0; i < 6; i++) {
        const a = e.ph + i / 6 * TAU, rr = Math.max(3, f0 + (inw ? -1 : 1) * (5 + 9 * k));
        chevron(bwx(e, Math.cos(a) * rr), bwy(e, Math.sin(a) * rr), a + (inw ? Math.PI : 0),
          4.0, WARN, 0.45 * eg, 1.0, 0.8);
      }
      ring(e.x, e.y, Math.max(1.5, A.r * k), 1.9, WARN_H, 0.50 * fl, GSQ, 1.7);
      // Aimed at where you stood, and now it says so. Inward, this doubles as the "do not be
      // here" mark, because where the reticle is is where the ring is going.
      fkLock(e, e.x, e.y, k, fl, A.hot);
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab, s = bdir(e), inw = A.dir === 'in', r = this.front(e, q);
      spiral(e.x, e.y, A.arms, A.r0, A.r, A.turns * s, A.col, 0.20 * fd, 1.3, GSQ,
        e.ph + e.t * (inw ? -2.6 : 2.6), 20, false);
      // Cyan from here on, on every line: the state changed, so the colour changed, once.
      this.rings(e, 0.55 * fd, A.hot, inw ? 0.52 : -0.52);
      ring(e.x, e.y, A.r, 1.0, A.hot, 0.30 * fd, GSQ, 1.8);
      // The live front is not scaled by `fd` alone -- fade() is down to a sixth by the time an
      // inward collapse is halfway home, and a band you cannot see is still a band that hurts.
      const la = 0.45 + 0.55 * fd;
      ring(e.x, e.y, r, A.band * 1.30, FK_HALO, 0.40 * la, GSQ, 0.9);
      ring(e.x, e.y, r, A.band * 0.60, A.col, 0.62 * la, GSQ, 1.4);
      ring(e.x, e.y, r, A.band * 0.24, A.hot, 0.82 * la, GSQ, 1.9);
      ring(e.x, e.y, r, Math.max(0.8, A.band * 0.11), WHITE, 0.70 * la, GSQ, 2.4);
      cracks(e.x, e.y, 9, A.r * 0.5, A.col, 0.18 * fd, e.seed + 1, 0.45, 1.1);
      // Inward it ends as a point of light in the middle; outward it leaves the sketch's little
      // dark crater where the arms came from. The aftermath is how you tell them apart in a
      // screenshot, which is the test for whether two moves are really two moves.
      if (inw) core(e.x, e.y, 4 + 16 * q * q, A.hot, 0.30 * fd, 1.8);
      else unlight(e.x, e.y, 7 + 5 * q, 0.10 * q, 1.4);
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab, inw = A.dir === 'in', r = this.front(e, q);
      // How long a bolt is has to scale with how big the field is. At r = 160 a nineteen-pixel arc
      // is a speck; a fifth of the radius reads as electricity from across the room, which is the
      // point of drawing one or two of them loudly instead of a dozen quietly.
      const bl = Math.max(20, A.r * 0.21);
      const r1 = inw ? Math.max(A.r0 * 0.4, r - bl) : Math.min(A.r, r + bl);
      this.strobe(e, r, r1, 0.45 + 0.55 * fd);
      const cy = e.y - 5;
      // The singularity. Inward, it is the thing everything has been falling into for two and a
      // half seconds, so it grows the whole way in rather than flashing once at release.
      if (inw) {
        const sg = eo(q);
        core(e.x, cy, 6 + 22 * sg, FK_HALO, 0.34 * (0.4 + 0.6 * fd), 2.2);
        core(e.x, cy, 3 + 9 * sg, A.hot, 0.80 * (0.4 + 0.6 * fd), 1.8);
        core(e.x, cy, 1.6 + 3.4 * sg, WHITE, 0.90 * (0.4 + 0.6 * fd), 2.0);
      }
      star(e.x, cy, A.hot, inw ? 6 : 10, 3, A.r * (inw ? 0.34 : 0.5) * (0.5 + 0.6 * eo(q)),
        2.5, 0.72 * fd, e.seed);
      glare(e.x, cy, 25 * g, 16 * g, WHITE, 0.56 * fd);
    },
  },

  // ---- vortex: arms of debris out of the middle, and the lanes between them --------
  // A ring closing on you is a stat check at this radius -- the front covers 150 px/s and the hero
  // walks 56, so "get out" would mean "dash or lose". So this one throws its arms instead: six
  // curved corridors out of the eye, then six more in the gaps once the first six are away, and
  // between them the ground stays clear. The safe lane is 15 px wide next to the boss and 68 at
  // the rim, which makes the answer "get away from it and pick a gap" rather than "hold a button".
  //
  // The corridors do not turn. That is the one decision the whole shape rests on: a rotating arm
  // would need about 690 px/s of tracking to stay in a gap, so it would be undodgeable by
  // arithmetic rather than hard by design. What moves is the debris travelling along fixed curves,
  // which is also the only reading under which the drawing tells the truth about the hitbox.
  vortex: {
    init(w, e) { e.got = 0; e.ph = mulberry32(e.seed).range(0, TAU); },
    // How far out it has thrown. Slow off the mark, faster later: the first thing that happens is
    // not the fastest thing that happens, so there is time to read which gap you are in.
    front(e, q) { const A = e.ab; return A.r0 + (A.r - A.r0) * (q * q * 0.55 + q * 0.45); },
    // The angle of arm `i` at radius `d` -- a function of radius and nothing else. Slots `0..arms-1`
    // are the first family, `arms..2*arms-1` fall in its gaps and wind the other way, so the second
    // wave is specifically the ground the first one told you to stand on.
    arm(e, i, d) {
      const A = e.ab, late = i >= A.arms;
      const t = clamp((d - A.r0) / Math.max(A.r - A.r0, 1e-3), 0, 1);
      return e.ph + (i % A.arms) / A.arms * TAU + (late ? Math.PI / A.arms : 0)
        + (late ? -1 : 1) * bdir(e) * A.turns * TAU * t;
    },
    live(e, q) { return q >= e.ab.late ? e.ab.arms * 2 : e.ab.arms; },
    // Angular half-width turned back into a distance at this radius, so one corridor is the same
    // number of pixels wide at 20 px out and at 180.
    onArm(e, i, d, th) {
      return Math.abs(bangd(th, this.arm(e, i, d))) * Math.max(d, 1)
        <= e.ab.band * 0.9 + HERO_R;
    },
    hit(w, e, l) {
      const A = e.ab, d = Math.hypot(l.x, l.y);
      if (d > A.r + HERO_R) return false;
      const th = Math.atan2(l.y, l.x);
      // Every corridor is marked from the first frame and every corridor is live, so the picture
      // and the answer are the same thing for the whole wind-up.
      if (!e.fired) {
        for (let i = 0; i < A.arms * 2; i++) if (this.onArm(e, i, d, th)) return true;
        return false;
      }
      const q = bq(e);
      // Nothing has been thrown past the front yet, so nothing out there can bite. The only
      // time-dependent line in the shape.
      if (d > this.front(e, q) + A.band) return false;
      const n = this.live(e, q);
      for (let i = 0; i < n; i++) {
        if (e.got & (1 << i)) continue;
        if (!this.onArm(e, i, d, th)) continue;
        e.got |= 1 << i;
        return true;
      }
      return false;
    },
    armPts(e, i, steps) {
      const A = e.ab, out = [];
      for (let s = 0; s <= steps; s++) {
        const d = A.r0 + (A.r - A.r0) * (s / steps), a = this.arm(e, i, d);
        out.push([bwx(e, Math.cos(a) * d), bwy(e, Math.sin(a) * d)]);
      }
      return out;
    },
    // One corridor in the house grammar: tinted channel, hard red edge down both sides. Curved, so
    // the edges are offset segment by segment -- there is no `blane` for a spiral arm, and faking
    // one with a straight lane would mark ground the arm never covers.
    corridor(e, i, body, edge, col, dash) {
      const A = e.ab, p = this.armPts(e, i, 11), th = A.band;
      for (let s = 0; s + 1 < p.length; s++) {
        const a = p[s], b = p[s + 1];
        const sa = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const nx = -Math.sin(sa) * th, ny = Math.cos(sa) * th;
        // Sharp, not soft, and a spine down the middle. Twelve channels crossing one disc: with a
        // soft falloff their skirts add up in the additive buffer until the whole disc is one purple
        // wash and the gaps -- the only thing the player has to read here -- disappear under ground
        // that never hurts. The spine is what the eye actually tracks; it turns a mass of tint into
        // six curves you can count, and count the spaces between.
        if (body > 0) {
          line(a[0], a[1], b[0], b[1], th, col, body, 1.15);
          line(a[0], a[1], b[0], b[1], 1.1, col, body * 2.4, 1.5);
        }
        if (edge <= 0) continue;
        if (dash) {
          dashline(a[0] + nx, a[1] + ny, b[0] + nx, b[1] + ny, 2, 1.0, WARN, edge, 0.35, 0.45);
          dashline(a[0] - nx, a[1] - ny, b[0] - nx, b[1] - ny, 2, 1.0, WARN, edge, 0.35, 0.45);
        } else {
          line(a[0] + nx, a[1] + ny, b[0] + nx, b[1] + ny, 1.0, WARN, edge);
          line(a[0] - nx, a[1] - ny, b[0] - nx, b[1] - ny, 1.0, WARN, edge);
        }
      }
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab, n2 = A.arms * 2;
      for (let i = 0; i < n2; i++) {
        const late = i >= A.arms;
        this.corridor(e, i, (late ? 0.055 : 0.085) + 0.045 * urg,
          (late ? 0.28 : 0.50) * eg, A.col, late);
        // Debris queued in the throat of its own arm, running out to the rim as the clock. This is
        // the bright element every boss telegraph owes the player, and it is doing double duty:
        // it also shows which way the corridor bends before anything is travelling down it.
        const hk = late ? Math.max(0.02, c01(k * 1.5 - 0.5)) : Math.max(0.03, k);
        const d = A.r0 + (A.r - A.r0) * hk, a = this.arm(e, i, d);
        vhComet(bwx(e, Math.cos(a) * d), bwy(e, Math.sin(a) * d), a, 9 + 7 * hk,
          late ? 1.4 : 2.0, A.col, WARN_H, (late ? 0.44 : 0.80) * fl, e.seed + i * 11);
        const ao = this.arm(e, i, A.r);
        chevron(bwx(e, Math.cos(ao) * A.r), bwy(e, Math.sin(ao) * A.r),
          ao + (late ? -1 : 1) * bdir(e) * 0.55, late ? 3.4 : 4.2, WARN,
          (late ? 0.28 : 0.42) * eg, 1.0, 0.8);
      }
      // The eye. The one part of the picture that is not a corridor, and the reason the middle is
      // never the answer here: everything comes out of it, so every arm covers it.
      puddle(e.x, e.y, A.r0 + 5, (A.r0 + 5) * GSQ, A.col, 0.16 + 0.10 * urg, e.seed, 7, 1.5);
      ring(e.x, e.y, A.r0 + 5, 1.4, WARN, 0.50 * eg, GSQ, 1.5);
      core(e.x, e.y, 2.2 + 1.6 * k, WARN_H, 0.58 * fl, 1.6);
      // Dotted, like the stomp's: it is where the arms end, not a wall of its own.
      dial(e.x, e.y, A.r, 36, WARN, 0.19 * eg, GSQ, 6, 1, 0.03, 0.05);
      ring(e.x, e.y, Math.max(2, A.r * k), 1.6, WARN_H, 0.32 * fl, GSQ, 1.5);
    },
    mid(w, e, k) {
      const A = e.ab, lift = 4 + 10 * k, r = 9 + 15 * k;
      // A pinwheel in the air over the eye, small enough that it cannot be misread as a claim on
      // ground. This is the one thing in the shape allowed to spin: it is not the hitbox, and the
      // wind-up needs somewhere to put the spin the corridors are refusing to have.
      for (let i = 0; i < A.arms; i++) {
        const a = e.ph + i / A.arms * TAU + bdir(e) * e.t * 2.2;
        line(e.x, e.y - lift, bwx(e, Math.cos(a) * r), bwy(e, Math.sin(a) * r) - lift,
          1.0, A.hot, 0.28 + 0.26 * k, 1.3);
      }
      vhGlyph(e.x, e.y - lift, 3.5 + 2.5 * k, e.t * 1.8, A.hot, 0.48 + 0.34 * k, e.seed + 7, 1);
      core(e.x, e.y - lift, 1.6 + 1.8 * k, WARN_H, 0.46 + 0.34 * k);
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab, n = this.live(e, q), f = this.front(e, q), st = 12;
      for (let i = 0; i < A.arms * 2; i++) {
        const on = i < n;
        this.corridor(e, i, (on ? 0.09 : 0.045) * fd, (on ? 0.18 : 0.26) * fd, A.col, !on);
      }
      // The swept part of each live arm goes hot behind the front: a corridor that has already been
      // used stops being a warning and becomes the trail of what came out of it, so the picture
      // keeps saying where the debris still *is* rather than where it once might be.
      for (let i = 0; i < n; i++) {
        for (let s = 0; s < st; s++) {
          const d0 = A.r0 + (A.r - A.r0) * (s / st);
          if (d0 > f) break;
          const d1 = A.r0 + (A.r - A.r0) * ((s + 1) / st);
          const a0 = this.arm(e, i, d0), a1 = this.arm(e, i, d1);
          line(bwx(e, Math.cos(a0) * d0), bwy(e, Math.sin(a0) * d0),
            bwx(e, Math.cos(a1) * d1), bwy(e, Math.sin(a1) * d1),
            A.band * 0.42, A.hot, 0.26 * fd, 1.5);
        }
      }
      cracks(e.x, e.y, A.arms, A.r0 * 3.0, A.hot, 0.22 * fd, e.seed, 0.5, 1.1);
      unlight(e.x, e.y, A.r0 + 7, 0.11 * fd, 1.4);
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab, n = this.live(e, q), per = 4;
      for (let i = 0; i < n; i++) {
        const late = i >= A.arms;
        for (let j = 0; j < per; j++) {
          // Each arm throws a small train rather than one head. A spiral drawn as a curve reads as
          // a diagram of a spiral; the same spiral drawn as forty comets reads as debris being
          // thrown, and this move has to look like the second one.
          const d = clamp(this.front(e, c01(q - (late ? A.late : 0) - j / per * 0.30)),
            A.r0, A.r);
          const a = this.arm(e, i, d), d2 = Math.min(A.r, d + 7), a2 = this.arm(e, i, d2);
          const x = bwx(e, Math.cos(a) * d), y = bwy(e, Math.sin(a) * d) - 3;
          const ta = Math.atan2((Math.sin(a2) * d2 - Math.sin(a) * d) * GSQ,
            Math.cos(a2) * d2 - Math.cos(a) * d);
          vhComet(x, y, ta, 9 + 5 * (1 - j / per), 2.4 - j * 0.30, A.col, A.hot,
            (0.90 - j * 0.14) * fd, e.seed + i * 31 + j);
        }
      }
      // The front, as one faint arc. The single number worth reading here is how far out it has
      // got, and inferring that from forty comets is work the drawing should not ask for.
      ring(e.x, e.y, this.front(e, q), 1.3, WARN_H, 0.24 * fd, GSQ, 1.5);
      core(e.x, e.y - 4, 6.5 * g, A.hot, 0.80 * fd, 1.6);
      glare(e.x, e.y - 4, 22 * g, 14 * g, WHITE, 0.42 * fd);
    },
  },

  // ---- echo: something walks the ground you just walked --------------------------
  // The one mark in the game that is not at full size on the first frame, and it cannot be: the
  // ground it marks is the ground the hero picks *during* the wind-up. He draws it himself, one
  // footprint at a time, and that is what makes it fair -- standing still is the only way to be
  // inside all of it at once, and the answer is not to dodge but to stop repeating yourself.
  echo: {
    init(w, e) { e.pts = [[w.hero.x, w.hero.y - 1]]; e.st = 0.085; e.got = 0; },
    step(w, e, dt) {
      if (e.fired) return;
      e.st -= dt;
      if (e.st > 0) return;
      e.st = 0.085;
      e.pts.push([w.hero.x, w.hero.y - 1]);
      if (e.pts.length > 26) e.pts.shift();
    },
    at(e, q) {
      const p = e.pts, n = p.length;
      if (n < 2) return p[0];
      const t = q * (n - 1), i = Math.min(n - 2, Math.floor(t)), f = t - i;
      return [p[i][0] + (p[i + 1][0] - p[i][0]) * f, p[i][1] + (p[i + 1][1] - p[i][1]) * f];
    },
    // Ghost `j`'s progress along the trail. They leave one after another and each travels faster
    // than the walk that drew the trail, so the third is still coming while you are getting clear
    // of the first: three passes over the same ground, staggered, out of one mark. This is the only
    // way this move can be hard without being unfair -- the ground is still ground you chose.
    gq(e, q, j) { return c01(q * e.ab.rush - j * e.ab.lag); },
    hit(w, e, l) {
      const A = e.ab, h = w.hero, R = A.r + HERO_R;
      const near = p => Math.hypot(p[0] - h.x, (p[1] - (h.y - 1)) / GSQ) <= R;
      // The newest six samples are under his own feet by definition, so they are not news: the
      // warning is about the part of the trail he has already left behind.
      if (!e.fired) {
        for (let i = 0; i < e.pts.length - 6; i++) if (near(e.pts[i])) return true;
        return false;
      }
      // One ledger bit per ghost, so each pass collects a given hero exactly once and standing in
      // the path of all three costs three times -- which is the whole point of there being three.
      const q = bq(e);
      for (let j = 0; j < A.ghosts; j++) {
        if (e.got & (1 << j)) continue;
        if (!near(this.at(e, this.gq(e, q, j)))) continue;
        e.got |= 1 << j;
        return true;
      }
      return false;
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab, p = e.pts;
      // Dashed rather than solid: a solid line reads as a wall you must not cross, and this is
      // the opposite -- a path something else is going to walk. The arrows say which way.
      for (let i = 0; i + 1 < p.length; i++) {
        const a = p[i], b = p[i + 1];
        const ta = Math.atan2((b[1] - a[1]) / GSQ, b[0] - a[0]);
        dashline(a[0], a[1], b[0], b[1], 2, A.r * 0.9, A.col, 0.15 + 0.09 * urg, 0.9, 0.45);
        dashline(a[0], a[1], b[0], b[1], 2, 1.0, WARN, 0.40 * eg, 1.0, 0.45);
        // A footprint at every sample, alternating left and right, well inside the channel the
        // dashes already claim. The mark is *his own*, and a line of prints says that where a
        // smear of light only says "here".
        const s = (i & 1) ? 1 : -1;
        const nx = -Math.sin(ta) * A.r * 0.42 * s, ny = Math.cos(ta) * A.r * 0.42 * GSQ * s;
        core(a[0] + nx, a[1] + ny, 1.5, A.col, 0.32 + 0.20 * urg, 1.4);
        line(a[0] + nx, a[1] + ny, a[0] + nx + Math.cos(ta) * 2.6,
          a[1] + ny + Math.sin(ta) * 2.6 * GSQ, 0.8, A.col, 0.24 + 0.16 * urg);
        if (i % 4 === 1)
          vhGlyph(a[0], a[1], A.r * 0.30, ta, A.col, 0.26 + 0.18 * urg, e.seed + i * 7);
        if (i % 3 === 2) chevron(b[0], b[1], ta, 3.6, WARN, 0.42 * eg, 1.0, 0.8);
      }
      // The oldest sample is where it starts from, so it gets the marker: you are told the
      // direction of travel before it moves, which is the only warning that matters here.
      reticle(p[0][0], p[0][1], A.r + 3, WARN, 0.44 * eg, GSQ, 6, 1.0);
      dial(p[0][0], p[0][1], A.r, 18, WARN, 0.21 * eg, GSQ, 4, 1, 0.03, 0.05);
      // One head per ghost, spaced exactly as they will leave. Three clocks, and the gap between
      // them is the number worth reading: it is how long you get between passes.
      for (let j = 0; j < A.ghosts; j++) {
        const h = this.at(e, Math.max(0.02, c01(k - j * A.lag)));
        core(h[0], h[1], 2.8 - j * 0.5, WARN_H, (0.78 - j * 0.20) * fl);
        ring(h[0], h[1], A.r * (1 - j * 0.10), 1.2, WARN_H, (0.38 - j * 0.10) * fl, GSQ, 1.4);
      }
    },
    mid(w, e, k) {
      const A = e.ab, p = e.pts[0];
      // The three of them queued at the oldest print, waiting to leave. Faint, and stacked, so the
      // count is readable before the first one moves -- knowing there are three is most of knowing
      // what to do about them.
      for (let j = A.ghosts - 1; j >= 0; j--) {
        const y = p[1] - 5 - j * 1.5, a = (0.26 + 0.30 * k) * (1 - j * 0.22);
        core(p[0] + j * 2.2, y, 3.4 - j * 0.5, A.col, a, 1.5);
        core(p[0] + j * 2.2, y, 1.5, A.hot, a * 0.9);
      }
      vhGlyph(p[0], p[1] - 7, 3 + 2 * k, e.t * 1.2, A.hot, 0.34 + 0.28 * k, e.seed + 9, 1);
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab, p = e.pts;
      const lead = this.gq(e, q, 0), last = this.gq(e, q, A.ghosts - 1);
      // The trail burns off behind the *last* ghost, not the first: while anything is still to
      // come, the ground it will walk has to stay marked. And the red edge survives only ahead of
      // the leader, so at a glance the floor says which part of it is still a warning.
      for (let i = 0; i + 1 < p.length; i++) {
        const t = i / Math.max(p.length - 1, 1);
        if (t < last - 0.10) continue;
        dashline(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], 2, A.r * 0.7, A.col,
          0.15 * fd, 0.9, 0.45);
        if (t > lead)
          dashline(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], 2, 1.0, WARN, 0.30 * fd, 1.0, 0.45);
      }
      for (let j = 0; j < A.ghosts; j++) {
        const h = this.at(e, this.gq(e, q, j)), rr = A.r * (1 - j * 0.12);
        puddle(h[0], h[1], rr, rr * GSQ, A.hot, (0.20 - j * 0.05) * fd, e.seed + j, 7, 1.5);
        cracks(h[0], h[1], 6, A.r * 0.8, A.col, 0.17 * fd, e.seed + j * 5, 0.5, 1.0);
      }
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab;
      // Back to front, so the leader is drawn over the ones still behind it.
      for (let j = A.ghosts - 1; j >= 0; j--) {
        const gq = this.gq(e, q, j);
        if (gq <= 0) continue;
        const h = this.at(e, gq), h2 = this.at(e, Math.min(1, gq + 0.05));
        const ta = Math.atan2((h2[1] - h[1]) / GSQ, h2[0] - h[0]);
        const y = h[1] - 5, s = 1 - j * 0.16, fa = fd * (1 - j * 0.20);
        // Deliberately not the hero's sprite. A ghost of the player would read as a second
        // player; what the sketch draws is a shape *doing* what the player did, so it is a body
        // of light with one swing in it and nothing to identify.
        core(h[0], y, 6.0 * g * s, A.col, 0.80 * fa, 1.5);
        core(h[0], y, 2.8 * g * s, WHITE, 0.78 * fa);
        beam(h[0], y, ta, 0, A.r * 1.5 * s, 4.2 * g * s, 0.8, A.hot, 0.62 * fa, 1.2, 1);
        for (let tr = 0; tr < 3; tr++)
          arc(h[0] - Math.cos(ta) * tr * 3, y - Math.sin(ta) * tr * 3,
            A.r * (1.35 + tr * 0.10) * s, ta, 2.3, (2.4 - tr * 0.45) * g,
            tr === 0 ? A.hot : A.col, (0.82 - tr * 0.20) * fa, 1.0, 1.4, 1.8);
        // After-images down its own line of travel. Without them a pass reads as a light being
        // switched on at each sample in turn; with them it reads as one thing moving fast.
        for (let b = 1; b <= 3; b++) {
          const hb = this.at(e, Math.max(0, gq - b * 0.045));
          core(hb[0], hb[1] - 5, (3.4 - b * 0.8) * s, A.col, (0.30 - b * 0.07) * fa, 1.5);
        }
        sparks(h[0], y, 12, 1, 18, A.col, 0.62 * fa, e.seed + j * 11, 1.1, 0.9,
          ta - 1.2, ta + 1.2, 9);
        vhGlyph(h[0], y - 6, 3.0, ta, A.hot, 0.44 * fa, e.seed + j * 3, 1);
      }
    },
  },

  // ---- spokes: a stomp at the feet, then the ground splitting outward --------------
  // Two beats and two different safe places, which is what makes it worth having next to a plain
  // disc. Beat one is the core the boss is standing in, so you leave. Beat two is eight channels
  // running out from it, so where you leave *to* has to be between two of them -- and both are
  // drawn from the first frame, so the second answer is available before the first beat lands.
  spokes: {
    init(w, e) { e.ph = mulberry32(e.seed).range(0, TAU); },
    // Slots `0..n-1` are the first volley; `n..2n-1` fall exactly in its gaps. So the second
    // volley is not "the same thing again with a different seed" -- it is specifically the ground
    // the first volley told you to stand on, which is the only way a repeat beat asks a new
    // question. Both sets are drawn from the first frame, so the answer is still chosen in
    // advance out of a complete picture; what you have to choose is a slot that survives *both*.
    ray(e, i) {
      const A = e.ab;
      return e.ph + (i % A.n) / A.n * TAU + (i >= A.n ? Math.PI / A.n : 0);
    },
    nray(e) { return (e.ab.ticks || [0]).length > 2 ? e.ab.n * 2 : e.ab.n; },
    // Which slots are live on the beat that is landing. `e.ticked` is incremented by stepTel just
    // before it asks, so 1 means "the stomp is what is landing right now". A fourth beat, if the
    // table asks for one, is both volleys at once -- the two answers the first three beats taught
    // you, and only the ground that survived *both* is still ground.
    vol(e) {
      const A = e.ab;
      if (e.ticked >= 4) return [0, A.n * 2];
      return e.ticked >= 3 ? [A.n, A.n * 2] : [0, A.n];
    },
    hit(w, e, l) {
      const A = e.ab, d = Math.hypot(l.x, l.y);
      if (d > A.r + HERO_R) return false;
      if (e.ticked <= 1) return d <= A.r0 + HERO_R;
      if (d < A.r0 - HERO_R) return false;
      const R = A.thick * 0.9 + HERO_R, v = this.vol(e);
      for (let i = v[0]; i < v[1]; i++) {
        const a = this.ray(e, i);
        if (bseg(l.x, l.y, Math.cos(a) * A.r0, Math.sin(a) * A.r0,
          Math.cos(a) * A.r, Math.sin(a) * A.r) <= R) return true;
      }
      return false;
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab, n2 = this.nray(e);
      for (let i = 0; i < n2; i++) {
        const a = this.ray(e, i), late = i >= A.n;
        // Second-volley channels are drawn dashed and dimmer, and their clock runs behind the
        // first set's. Same idiom, lower voice: "these too, but not yet". Drawn identically they
        // would read as sixteen simultaneous channels, which is a wall and a lie about both beats.
        if (late) {
          const th = A.thick * 0.8;
          const c = Math.cos(a), s = Math.sin(a);
          dashline(bwx(e, c * A.r0), bwy(e, s * A.r0), bwx(e, c * A.r), bwy(e, s * A.r),
            7, th, A.col, (0.17 + 0.10 * eg), 0.35, 0.42);
          dashline(bwx(e, c * A.r0), bwy(e, s * A.r0), bwx(e, c * A.r), bwy(e, s * A.r),
            7, 1.0, WARN, 0.30 * eg, 0.30, 0.42);
          const hk = Math.max(0.03, c01(k * 1.4 - 0.4));
          core(bwx(e, c * (A.r0 + (A.r - A.r0) * hk)), bwy(e, s * (A.r0 + (A.r - A.r0) * hk)),
            2.2, WARN_H, 0.34 * fl);
        } else {
          blane(e, a, A.r0 - 2, A.r, A.thick, k, fl, eg, A.col);
        }
        chevron(bwx(e, Math.cos(a) * A.r), bwy(e, Math.sin(a) * A.r), a, late ? 3.4 : 4.2, WARN,
          (late ? 0.28 : 0.42) * eg, 1.0, 0.8);
        // Texture strictly inside the channel's own half-width: rungs across it, a rune at the
        // mouth, a run of chevrons down it. None of it claims a pixel the two red edges did not
        // already claim -- which is the only kind of detail this grammar can afford, because
        // anything drawn outside them would be marked ground that never bites.
        const c2 = Math.cos(a), s2 = Math.sin(a);
        const ax2 = bwx(e, c2 * (A.r0 - 2)), ay2 = bwy(e, s2 * (A.r0 - 2));
        const bx2 = bwx(e, c2 * A.r), by2 = bwy(e, s2 * A.r);
        vhRungs(ax2, ay2, bx2, by2, 9, A.thick * 0.78, A.col,
          (late ? 0.20 : 0.32) + 0.12 * urg, e.t * 0.35 + i * 0.11);
        for (let c = 1; c <= 3; c++) {
          const t2 = c / 4;
          chevron(ax2 + (bx2 - ax2) * t2, ay2 + (by2 - ay2) * t2, a, 2.6, WARN,
            (late ? 0.18 : 0.28) * eg, 0.8, 0.75);
        }
        vhGlyph(bwx(e, c2 * (A.r0 + 6)), bwy(e, s2 * (A.r0 + 6)), 3.2, a + e.t * 0.6,
          late ? A.col : A.hot, (late ? 0.26 : 0.42) * eg, e.seed + i * 19);
      }
      bdisc(e, e.x, e.y, A.r0, Math.min(1, k * 2), urg, fl, eg, A.col, e.seed);
      // Inside the core, a ring of marks with the fracture lines already showing. The core is the
      // one thing here that bites on the *first* beat, so it is worth being the densest part of
      // the picture: it has the least time to be read.
      for (let i = 0; i < A.n; i++) {
        const a = e.ph + (i + 0.5) / A.n * TAU, rr = A.r0 * 0.62;
        vhGlyph(bwx(e, Math.cos(a) * rr), bwy(e, Math.sin(a) * rr), 2.6, a, A.hot,
          0.30 + 0.24 * eg, e.seed + i * 7);
      }
      cracks(e.x, e.y, A.n, A.r0 * 0.85, A.hot, 0.10 + 0.10 * urg, e.seed + 2, GSQ, 1.1);
      ring(e.x, e.y, A.r0 * 0.5, 1.0, WARN, 0.26 * eg, GSQ, 1.4);
      // A dotted outer boundary, not a hard one: nothing crosses it, it is only where the
      // channels stop, and drawing it solid would claim the whole disc is marked.
      dial(e.x, e.y, A.r, 24, WARN, 0.22 * eg, GSQ, 0, 1, 0.03, 0.03);
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab;
      // Beat one scorches the core, beat two the channels, beat three the channels between them,
      // and all of it stays for the rest of the entry: the aftermath is the sketch's third panel,
      // branches still smoking.
      puddle(e.x, e.y, A.r0, A.r0 * GSQ, A.col, 0.20 * fd, e.seed, 9, 1.4);
      cracks(e.x, e.y, A.n, A.r0 * 1.1, A.hot, 0.22 * fd, e.seed, GSQ, 1.2);
      if (e.ticked > 1) {
        const sp = Math.max(e.dur - A.tell, 1e-3), v = this.vol(e);
        const g = c01((q - A.ticks[Math.min(e.ticked, A.ticks.length) - 1] / sp) * 3);
        for (let i = v[0]; i < v[1]; i++) {
          const a = this.ray(e, i), rr = A.r0 + (A.r - A.r0) * g;
          line(bwx(e, Math.cos(a) * A.r0), bwy(e, Math.sin(a) * A.r0),
            bwx(e, Math.cos(a) * rr), bwy(e, Math.sin(a) * rr),
            A.thick, A.col, 0.40 * fd, 0.9, 1);
          line(bwx(e, Math.cos(a) * A.r0), bwy(e, Math.sin(a) * A.r0),
            bwx(e, Math.cos(a) * rr), bwy(e, Math.sin(a) * rr),
            A.thick * 0.45, A.hot, 0.58 * fd, 1.3, 1);
          line(bwx(e, Math.cos(a) * A.r0), bwy(e, Math.sin(a) * A.r0),
            bwx(e, Math.cos(a) * rr), bwy(e, Math.sin(a) * rr),
            Math.max(0.7, A.thick * 0.13), WHITE, 0.42 * fd, 1.5, 1);
          // Rungs and a scatter of debris inside the part that has already split, so a channel
          // opening reads as ground breaking rather than a bar being filled in.
          vhRungs(bwx(e, Math.cos(a) * A.r0), bwy(e, Math.sin(a) * A.r0),
            bwx(e, Math.cos(a) * rr), bwy(e, Math.sin(a) * rr), 7, A.thick * 0.7,
            A.hot, 0.30 * fd, q * 0.8 + i * 0.13);
          cracks(bwx(e, Math.cos(a) * (A.r0 + (rr - A.r0) * 0.5)),
            bwy(e, Math.sin(a) * (A.r0 + (rr - A.r0) * 0.5)), 3, A.thick * 1.4, A.col,
            0.20 * fd, e.seed + i * 23, 0.5, 1.0);
        }
        // The shock running out ahead of the split channels: one arc, so the number worth reading
        // -- how far this beat has got -- does not have to be inferred from sixteen lanes.
        ring(e.x, e.y, A.r0 + (A.r - A.r0) * g, 1.4, WARN_H, 0.24 * fd, GSQ, 1.5);
      }
      unlight(e.x, e.y, A.r0 * 0.8, 0.10 * fd, 1.4);
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab, cy = e.y - 5;
      core(e.x, cy, 9.0 * g, A.hot, 0.92 * fd, 1.6);
      core(e.x, cy, 3.8 * g, WHITE, 0.92 * fd);
      star(e.x, cy, A.hot, A.n * 2, 3, A.r0 * (1.0 + 1.0 * eo(q)), 2.4, 0.78 * fd, e.seed);
      if (e.ticked > 1) {
        const sp = Math.max(e.dur - A.tell, 1e-3), v = this.vol(e);
        const t = c01((q - A.ticks[Math.min(e.ticked, A.ticks.length) - 1] / sp) * 3);
        for (let i = v[0]; i < v[1]; i++) {
          const a = this.ray(e, i), rr = A.r0 + (A.r - A.r0) * t;
          bolt(bwx(e, Math.cos(a) * A.r0), bwy(e, Math.sin(a) * A.r0) - 4,
            bwx(e, Math.cos(a) * rr), bwy(e, Math.sin(a) * rr) - 4,
            A.col, A.hot, 0.82 * fd, 4, 3, e.seed + i * 9, 2.1, 1);
          const x = bwx(e, Math.cos(a) * rr), y = bwy(e, Math.sin(a) * rr) - 4;
          core(x, y, 3.4 * g, A.hot, 0.92 * fd);
          beam(x, y + 4, -Math.PI / 2, 0, 8 + 12 * t, 2.2 * g, 0.4,
            A.col, 0.55 * fd, 1.3, 0.8);
        }
      }
      sparks(e.x, cy, 12, 2, A.r0, A.col, 0.42 * fd, e.seed + 3, 1.1, 0.85, 0, TAU, 5);
    },
  },
};

// ---- the twelve moves -------------------------------------------------------
// Merged into 6b's table rather than kept in one of their own, so everything downstream --
// startCast, stepTel, the bestiary, the freeze cancel -- needs no idea that bosses exist.
//
// The numbers obey one rule the normal seven do not have to: a boss is on screen for a minute,
// so every entry must be survivable *while* another one is still fading. `dmg` therefore tops
// out near a normal monster's rather than above it, and what makes a boss a boss is that four
// of these overlap, not that any one of them is bigger.
//
// And one rule 6b already had, which four moves per caster make much easier to break: a mark
// centred on the caster must *reach* at least as far as the distance it opens from. First-match
// on two abilities could never violate it; a random pick among four can open a 78 px lattice at
// 150 px, and a boss standing there finishing a move that was never going to touch you is the
// single worst thing a four-move kit can do. So the self- and dir-aimed entries below carry a
// `range` no larger than their own reach. Only the hero-aimed ones are free of it, because what
// they throw lands on you rather than around the thrower.
//
// The `cd` column is the one number that decides whether the fight reads as a fight. At the
// pauses this table shipped with, a thirty-second boss produced five casts: twenty-five of
// those thirty seconds were a large sprite walking, and a move you meet once every six seconds
// is a cutscene you happen to be able to walk out of. Every pause below is roughly six tenths
// of what it was, which is about nine casts in the same window and about one every three
// seconds -- close enough that the *next* wind-up starts while the last blast is still fading,
// which is the whole reason a boss needs four moves instead of one. The floor is `dur`: a boss
// may not begin a move before the previous one has finished being on the floor.
//
// Nothing below raises `dmg` past what a normal monster deals. The teeth come from counts --
// four fronts instead of three, five lanes instead of three, eight meteors instead of six,
// three bites out of a lattice instead of two -- because a count is something the picture can
// still show you in advance, and a bigger number is not.
Object.assign(FOE_ABIL, {
  // ---- Chúa Lò: everything it does is aimed at the floor you are standing on ------
  // A slow, close, enormous fighter. Its long move (meteors) is the only one that can reach
  // across the arena, and it is also the slowest to land: the whole kit says "come here".
  //
  // The sweep is one stroke, and slow: 172 degrees in 2.2 seconds behind a 1.5-second wind-up.
  // `bw` is the blade's width in pixels rather than in radians, which is what lets it be drawn as
  // a sword instead of a fan, and it takes one hit off you rather than two. Everything here reaches
  // twice as far as it used to, and everything is correspondingly slower: at this size the answer
  // stops being reflexes and starts being where you chose to stand.
  flame_sweep: {
    name: 'Quét Lửa', shape: 'sweep', aim: 'dir', r: 136, r0: 26, bw: 7.0, arc: 0.42, span: 1.50,
    tell: 1.50, dur: 3.70, dmg: 44, shake: 4.2, range: 132, sample: true,
    cd: [3.9, 5.0], col: C.ember, hot: C.gold,
  },
  // A root system twice the old radius, and it vents a second time 0.42 s after it opens -- long
  // enough that the crack has reached the rim first, so the two beats are two readable events.
  // Eight arms rather than nine, because each one now carries three branches: the gap at the rim
  // is still there, it is just no longer a straight line pointing at it.
  earthquake: {
    name: 'Địa Liệt', shape: 'veins', aim: 'self', r: 200, thick: 5.0, n: 8, br: 3,
    tell: 1.25, dur: 2.60, dmg: 40, ticks: [0, 0.42], shake: 6.0, range: 130,
    cd: [3.4, 4.6], col: C.ember, hot: C.gold, boomv: 'big',
  },
  // Four seconds, eleven strikes, and every one of them follows you. `lock` is the whole design:
  // a strike stops tracking 0.34 s out, and 0.34 s of walking sideways covers 19 px against a
  // 17 px circle. So it is survivable on foot by a hair, survivable easily by dashing, and fatal
  // if you stand still or only move up and down the screen. `r` is the court it cannot leave.
  judgment: {
    name: 'Phán Quyết', shape: 'smite', aim: 'hero', r: 96, nr: 13, lock: 0.34,
    tell: 1.20, dur: 4.20, dmg: 22,
    ticks: [0, 0.26, 0.52, 0.78, 1.04, 1.30, 1.56, 1.82, 2.08, 2.34, 2.60],
    shake: 3.6, range: 150, min: 30, cd: [4.3, 5.5], col: C.gold, hot: C.holyp,
  },
  // Forty drops over four and a half seconds on a disc twice as wide, and the spacing is a
  // crescendo rather than a metronome: 0.16 s apart at the opening, 0.045 s apart in the last
  // third. A storm that arrives at a constant rate is a rate; one that tightens is a storm.
  // `dmg` is down to 13 because there are forty of them -- the pressure is in having somewhere to
  // be, not in any one rock, and forty rocks at the old 20 would just be a death sentence.
  meteor_rain: {
    name: 'Mưa Thiên Thạch', shape: 'rain', aim: 'hero', r: 184, nr: 17,
    tell: 1.30, dur: 4.50, dmg: 13,
    ticks: [0, 0.16, 0.31, 0.45, 0.58, 0.70,
            0.81, 0.91, 1.01, 1.11, 1.20, 1.29, 1.38, 1.47, 1.55, 1.63, 1.71, 1.79,
            1.86, 1.93, 2.00, 2.07, 2.14, 2.21, 2.27, 2.33, 2.39, 2.45, 2.51, 2.57,
            2.62, 2.67, 2.72, 2.76, 2.80, 2.84, 2.87, 2.90, 2.93, 2.96],
    shake: 3.4, range: 190, min: 40, cd: [4.8, 6.0], col: C.ember, hot: C.gold, boomv: 'big',
  },

  // ---- Vua Băng: four ways of saying "not there" ---------------------------------
  // It never wants to be next to you and has nothing for contact range, so its `keep` band is
  // wide and every move rewards reading a picture rather than reacting to a flash.
  //
  // Every reach here is about twice what it was, and that changes what the fight *is*: at r = 78 the
  // web was something you stepped around, at r = 156 it is something you have to already be
  // somewhere specific to survive. Wind-ups grew with the reach, because a mark you cannot cross in
  // time is not a choice, and per-hit damage came down, because each of these now covers most of a
  // room. Totals per cast are within a point or two of what they were.
  //
  // What did *not* double is `range` -- how far off he is willing to start the cast. The camera is
  // 320x180 and centred on the hero, so a boss standing 240 px away is off screen, and a telegraph
  // whose caster you cannot see teaches you nothing. He closes to roughly half his reach and fires;
  // the far edge of the shape is what covers the rest of the distance.
  //
  // Twenty-five knots over two and a half turns, biting four times. Knots per turn is the number
  // that decides whether this reads as frost or as a wireframe: at six per turn the chain is a
  // hexagon and every complaint about "technical diagram" is *correct*, at ten it is a curve with
  // corners. Fewer turns for the same reason -- the pitch between them is ~55 px of clear floor, so
  // there is a corridor to stand in, and what there is no longer is time to think about it there.
  frost_web: {
    name: 'Lưới Băng', shape: 'web', aim: 'self',
    r: 156, r0: 18, n: 25, turns: 2.4, nr: 7, thick: 4.5,
    tell: 1.35, dur: 2.90, dmg: 18, ticks: [0, 0.30, 0.58, 0.84], shake: 3.0, range: 120,
    cd: [3.2, 4.2], col: C.ice, hot: C.pale,
  },
  // Five fronts out of a narrower mouth. Consecutive fronts are 59 px apart and each band is 18 px
  // thick, so there is 40 px of clear ground between them -- but a front crosses that in a fifth of
  // a second and the hero walks 12 px in the same time. You do not out-walk this one; you leave the
  // cone sideways, or you dash through a band. Narrowing the arc from 0.70 to 0.62 is what makes
  // leaving sideways a real answer at twice the length.
  sonic_tide: {
    name: 'Thủy Triều Âm', shape: 'waves', aim: 'dir', r: 236, arc: 0.62, nw: 5, band: 9,
    gap: 0.125, tell: 1.30, dur: 3.05, dmg: 22, shake: 3.6, range: 150, min: 30,
    sample: true, cd: [3.2, 4.2], col: C.cyan, hot: C.pale,
  },
  // Seven lanes now, and they still do not leave together: `blades` peels them off across the fan
  // over `stag` of the travel, near lane first, so the gap you can stand in slides down-range while
  // the volley is in the air. Tightening `spread` with the extra lanes keeps the corridors at ~34 px
  // of clear floor: more to read, the same amount to do.
  //
  // `col` was C.steel. Steel is the right idea for a wind blade and the wrong tone for a moving
  // one: a head is drawn at half alpha for most of its trip, and #cfe0ff at half alpha is grey, so
  // the volley launched blue and arrived as smoke. #5a9cff carries at the alpha the travel actually
  // uses, and keeps the pale tone where it belongs -- the hot lip on the cutting edge.
  wind_blades: {
    name: 'Phong Nhận', shape: 'blades', aim: 'dir', nl: 7, spread: 0.215, r: 232, bend: 0.62,
    rad: 8, stag: 0.44, tell: 1.10, dur: 2.60, dmg: 19, shake: 2.6, range: 150, min: 34,
    sample: true, cd: [2.8, 3.8], col: C.voltc, hot: C.steel,
  },
  // The one move in the game that moves the hero instead of asking him to move. Dash beats it.
  //
  // Also the one that could not double. It aims at the hero and the camera is centred on the hero,
  // so its rim always lands centred on the screen: at r = 160 that rim exactly fills the 320 px
  // width, and one pixel further puts the only line saying where the pull ends off the frame. Fewer
  // arms over fewer turns because the wash is now three times the area -- five arms at 1.7 turns
  // filled it edge to edge and the ripples travelling through them had nowhere to be seen.
  //
  // `col` was C.deep. The buffer quantises to 16 levels a channel, so a channel has to clear 1/15
  // to appear at all, and #0e2f5c at the alpha a floor wash is allowed to use lands under that step
  // on red and green: it was not dim, it was absent. C.ice spends the same alpha on two channels.
  gravity_sink: {
    name: 'Hố Trọng Lực', shape: 'spiral', dir: 'in', pull: 66, aim: 'hero',
    r: 160, r0: 6, arms: 3, turns: 0.9, band: 11,
    tell: 1.45, dur: 2.95, dmg: 40, shake: 5.0, range: 140, sample: true,
    cd: [3.6, 4.8], col: C.ice, hot: C.cyan, boomv: 'big',
  },

  // ---- Sứ Giả Hư Không: three of its four are marks, not throws --------------------
  // The fastest and frailest of the three, and the only one whose kit punishes *habits*: a
  // sigil around where you stood, an echo of the path you walked, a spiral you leave by
  // standing still in the middle of it.
  //
  // All four reach roughly twice as far as they did, and the reach is the only number that
  // doubled: `dmg` came *down* on every one of them. Doubling both would not make the kit harder
  // to dodge, it would make it a coin flip with a bigger blast radius. What the extra reach buys
  // is that the answer is no longer "take two steps" -- at this size, each of these asks you to
  // pick a place and commit to it before it goes off, and three of the four now bite more than
  // once so a place that is only right for a moment is not right.
  //
  // `range` did not double with it. The camera is 320 px wide, so a caster that opens a 180 px
  // mark from 180 px away is a caster you cannot see doing it, and a boss off-screen is not a
  // harder fight -- it is a fight about nothing. So the three self-centred moves open from 120
  // and the reach rule below still holds with room to spare.
  death_spiral: {
    // `turns` is legibility, not difficulty -- the arms never rotate, so it only decides what shape
    // the corridors are. Past about 0.7 the bend at the rim goes nearly tangential (a full turn over
    // 172 px means 7 px sideways per px outward at d = 180) and twelve arms read as a stack of
    // concentric rings instead of arms thrown out of the middle. 0.62 keeps 223 degrees of curve.
    name: 'Vòng Xoáy Tử', shape: 'vortex', aim: 'self',
    r: 180, r0: 8, arms: 6, turns: 0.62, band: 10, late: 0.40,
    tell: 1.15, dur: 2.45, dmg: 26, shake: 4.4, range: 120, sample: true,
    cd: [2.9, 3.9], col: C.voidc, hot: C.lilac,
  },
  // The seal. Five strokes drawn one at a time, and it does not go off until the fifth closes it,
  // so the wind-up is a count rather than a bar. Then four beats out of its own figure: the
  // chords, the five points, the inner ring where the chords cross, and finally all of it *plus
  // the middle* -- so the pocket the first three beats teach you is the one the fourth takes.
  blood_sigil: {
    name: 'Huyết Ấn', shape: 'sigil', aim: 'hero', r: 140, n: 5, skip: 2, nr: 14,
    thick: 8, tell: 1.35, dur: 2.65, dmg: 34, ticks: [0, 0.26, 0.52, 0.80], shake: 4.4,
    range: 150, min: 26, cd: [3.2, 4.4], col: C.blood, hot: C.blush,
  },
  // Three of them now, leaving one after another and travelling faster than the walk that drew
  // the trail. Getting clear of the first is no longer getting clear.
  delayed_echo: {
    name: 'Dư Ảnh Trễ', shape: 'echo', aim: 'self', r: 26, ghosts: 3, lag: 0.17, rush: 1.45,
    tell: 1.10, dur: 2.40, dmg: 26, shake: 2.6, range: 170,
    sample: true, cd: [2.9, 3.9], col: C.vio, hot: C.viop,
  },
  // Four beats: the core, eight channels, the eight *between* them -- the ground you stepped into
  // to survive beat two -- and then both sets at once. All sixteen are drawn from the first frame,
  // so the answer is still picked once in advance; what beat four asks is that it survive all
  // three questions, which at this radius means being a long way out and in the right gap.
  chain_stomp: {
    name: 'Chấn Liên Hoàn', shape: 'spokes', aim: 'self', r: 176, r0: 52, n: 8, thick: 9,
    tell: 1.10, dur: 2.55, dmg: 28, ticks: [0, 0.20, 0.40, 0.62], shake: 5.4, range: 120,
    cd: [3.0, 4.0], col: C.voidc, hot: C.volt, boomv: 'big',
  },
});
