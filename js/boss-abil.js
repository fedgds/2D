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
    case 'nodes': return A.r + A.nr;
    case 'veins': case 'spokes': return A.r + A.thick * 0.9;
    case 'web': return A.r + Math.max(A.nr, A.thick * 0.9);
    case 'spiral': return A.r;
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

const BOSS_SHAPE = {
  // ---- sweep: a blade of fire dragged through an annulus wedge ------------------
  // The marked ground is everything the blade will pass over; the blade itself is a narrow
  // wedge inside it, and where it has got to is the clock. Two answers, both legible from the
  // picture: stand inside `r0` and let it pass over your head, or leave the wedge sideways --
  // and the second one now has to be a *committed* answer, because the blade comes back.
  sweep: {
    init(w, e) { e.got = 0; },
    // Out, then back. The hinge is at 58% of the entry and the return only recrosses 55% of the
    // wedge, so the two strokes are not the same stroke twice: the far side is crossed once and
    // the near side twice. Sidestepping the leading edge used to end the move's involvement with
    // you, which is exactly the kind of answer that stops being a decision after you have made it
    // twice; the ground you step onto to survive the first stroke is now the ground the second
    // one is walking back across, and both halves are drawn before either one moves.
    at(e, q) {
      const A = e.ab, s = bdir(e);
      return q < 0.58 ? e.ang + s * A.span * (1 - q / 0.58 * 2)
        : e.ang - s * A.span * (1 - (q - 0.58) / 0.42 * 1.55);
    },
    hit(w, e, l) {
      const A = e.ab, d = Math.hypot(l.x, l.y);
      if (d > A.r + HERO_R || d < A.r0 - HERO_R) return false;
      const q = e.fired ? bq(e) : 0;
      const c = e.fired ? this.at(e, q) : e.ang;
      const half = (e.fired ? A.arc : A.arc + A.span) + Math.atan2(HERO_R, Math.max(d, 1));
      if (Math.abs(bangd(Math.atan2(l.y, l.x), c)) > half) return false;
      if (!e.fired) return true;
      // One bit per stroke. The blade crossing you twice is two hits; the same stroke covering
      // you on nine consecutive frames is one.
      const bit = q < 0.58 ? 1 : 2;
      if (e.got & bit) return false;
      e.got |= bit; return true;
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab, s = bdir(e), sw = (A.span + A.arc) * 2;
      const rm = (A.r0 + A.r) * 0.5, rt = A.r - A.r0;
      // A 212-degree annulus is the largest mark in the game, and one soft arc 54 px thick across
      // it came out as warm haze -- the shape read as *lighting* rather than as ground. Three
      // narrow bands plus a radial hatch cost the same and read as hatched ground: the hatch is
      // what makes the two straight edges into the sides of a *region* instead of two stray lines.
      for (let i = 0; i < 3; i++)
        arc(e.x, e.y, A.r0 + rt * (0.20 + i * 0.30), e.ang, sw, rt * 0.20,
          A.col, 0.17 + 0.10 * urg, GSQ, 1.2, 1.4);
      for (let i = 0; i <= 8; i++) {
        const a = e.ang + (i / 8 * 2 - 1) * (A.span + A.arc);
        line(bwx(e, Math.cos(a) * A.r0), bwy(e, Math.sin(a) * A.r0),
          bwx(e, Math.cos(a) * A.r), bwy(e, Math.sin(a) * A.r), 0.8, WARN, 0.16 * eg, 1.6);
      }
      arc(e.x, e.y, A.r, e.ang, sw, 1.7, WARN, 0.62 * eg, GSQ, 1.4, 1.6);
      arc(e.x, e.y, A.r0, e.ang, sw, 1.3, WARN, 0.46 * eg, GSQ, 1.4, 1.6);
      for (const g of [1, -1]) {
        const a = e.ang + g * (A.span + A.arc);
        line(bwx(e, Math.cos(a) * A.r0), bwy(e, Math.sin(a) * A.r0),
          bwx(e, Math.cos(a) * A.r), bwy(e, Math.sin(a) * A.r), 1.2, WARN, 0.55 * eg);
      }
      // The blade sits on the edge it will start from and three chevrons point the way it is
      // going: a sweep you cannot read the direction of is a coin flip, not a dodge.
      const a0 = e.ang + s * A.span, a1 = a0 - s * (0.20 + 0.5 * k);
      arc(e.x, e.y, rm, a0, A.arc * 2, rt * 0.95, A.hot, 0.44 * fl, GSQ, 1.0, 1.4);
      arc(e.x, e.y, rm, a0, 0.13, rt, WARN_H, 0.42 * fl, GSQ, 1.5, 1.2);
      for (let i = 0; i < 3; i++) {
        const t = A.r0 + (A.r - A.r0) * (0.22 + i * 0.3);
        chevron(bwx(e, Math.cos(a1) * t), bwy(e, Math.sin(a1) * t),
          a1 - s * Math.PI / 2, 4.2, WARN, 0.50 * eg, 1.0, 0.8);
      }
      // The far edge is the hinge, so it gets a bright radial spine and its own dimmer ghost with
      // its chevrons pointing *back*. A move whose second half is a surprise is the one thing 6d
      // promised not to build, and half a warning for a two-stroke swing is worse than none: the
      // player who reads only the first arrow leaves in the direction of the second stroke.
      const a2 = e.ang - s * A.span, a3 = a2 + s * (0.20 + 0.5 * k);
      arc(e.x, e.y, rm, a2, A.arc * 1.7, rt * 0.7, A.col, 0.34 * fl, GSQ, 1.0, 1.4);
      arc(e.x, e.y, rm, a2, 0.15, rt, WARN_H, 0.30 * fl, GSQ, 1.5, 1.2);
      for (let i = 0; i < 3; i++) {
        const t = A.r0 + (A.r - A.r0) * (0.22 + i * 0.3);
        chevron(bwx(e, Math.cos(a3) * t), bwy(e, Math.sin(a3) * t),
          a3 + s * Math.PI / 2, 3.6, WARN, 0.34 * eg, 1.0, 0.8);
      }
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab, s = bdir(e), rm = (A.r0 + A.r) * 0.5, rt = A.r - A.r0;
      const a = this.at(e, q), wd = q < 0.58 ? s : -s;
      // The ground the blade has already crossed stays lit and cooling behind it, and "behind"
      // flips at the hinge along with the blade. A stroke with no wake reads as a strobe rather
      // than as one continuous swing; a wake on the wrong side reads as two different moves.
      for (let i = 4; i >= 1; i--) {
        const at = a + wd * 0.26 * i;
        if (Math.abs(bangd(at, e.ang)) > A.span + A.arc) continue;
        arc(e.x, e.y, rm, at, A.arc * 1.8, rt * 0.8, A.col, 0.30 * fd / i, GSQ, 0.9, 1.4);
      }
      arc(e.x, e.y, rm, a, A.arc * 2.2, rt, A.hot, 0.52 * fd, GSQ, 0.9, 1.4);
      arc(e.x, e.y, rm, a, A.arc * 1.7, Math.max(1.2, rt * 0.16), WHITE,
        0.62 * fd, GSQ, 1.4, 1.8);
      cracks(bwx(e, Math.cos(a) * rm), bwy(e, Math.sin(a) * rm), 5, rt * 0.5,
        A.col, 0.42 * fd, e.seed, 0.5, 1.0);
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab, rm = (A.r0 + A.r) * 0.5, rt = A.r - A.r0;
      const a = this.at(e, q);
      // The hinge is a beat of its own: for a fifth of a second at the turn the blade is standing
      // still on the far edge, and a swing that reverses without a visible stop reads as a
      // rendering glitch. This is the flash that says "that was not the end of it".
      const hg = 1 - c01(Math.abs(q - 0.58) / 0.10);
      for (let i = 0; i < 3; i++)
        arc(e.x, e.y - 4, rm - i * 2.5, a, A.arc * 2 * (1 - i * 0.14), rt * 0.5 - i * 1.6,
          i === 0 ? A.hot : A.col, (1.0 - i * 0.24) * fd, 0.62, 1.4, 2.0);
      arc(e.x, e.y - 4, rm, a, A.arc * 1.45, Math.max(1.0, rt * 0.10), WHITE,
        0.78 * fd, 0.62, 1.5, 2.2);
      if (hg > 0) {
        arc(e.x, e.y - 4, rm, a, A.arc * 2.6, rt * (0.6 + 0.5 * hg), WHITE, 0.34 * hg, 0.62, 1.2, 1.8);
        glare(bwx(e, Math.cos(a) * rm), bwy(e, Math.sin(a) * rm) - 5,
          20 + 16 * hg, 12 + 10 * hg, A.hot, 0.50 * hg);
      }
      const tx = bwx(e, Math.cos(a) * A.r), ty = bwy(e, Math.sin(a) * A.r) - 4;
      core(tx, ty, 7 * g, A.hot, 1.0 * fd, 1.6);
      core(tx, ty, 2.8 * g, WHITE, 1.1 * fd, 1.5);
      sparks(tx, ty, 16, 2, 20, A.hot, 0.86 * fd, e.seed + 5, 1.1, 0.8, a - 1.2, a + 1.2, 8);
    },
  },

  // ---- nodes: several marks on one disc, each with its own clock -----------------
  // Six meteors, or three pillars of judgment. The stagger *is* the move, so a node reads its
  // own clock rather than the cast's: some craters already smoking while two marks have not
  // gone off yet. The tell/boom split the other shapes use cannot say that, so the floor and
  // the air are one routine each, called from both halves of the cast.
  nodes: {
    init(w, e) {
      const A = e.ab, rng = mulberry32(e.seed);
      e.nd = [[0, 0]];                          // the first one always lands where you stand
      for (let i = 1; i < A.ticks.length; i++) {
        const a = rng.range(0, TAU), r = A.r * (0.34 + 0.66 * Math.sqrt(rng()));
        e.nd.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    },
    hit(w, e, l) {
      const A = e.ab, R = A.nr + HERO_R;
      // Before the first landing every mark is live; afterwards only the node that just went
      // off can hurt, which is what makes walking between the craters the answer.
      const i0 = e.fired ? e.ticked - 1 : 0, i1 = e.fired ? e.ticked - 1 : e.nd.length - 1;
      for (let i = Math.max(i0, 0); i <= Math.min(i1, e.nd.length - 1); i++)
        if (Math.hypot(l.x - e.nd[i][0], l.y - e.nd[i][1]) <= R) return true;
      return false;
    },
    floor(w, e) {
      const A = e.ab;
      for (let i = 0; i < e.nd.length; i++) {
        const x = bwx(e, e.nd[i][0]), y = bwy(e, e.nd[i][1]);
        const tf = A.tell + A.ticks[i], sp = Math.max(e.dur - tf, 1e-3);
        if (e.t < tf) {
          const k = c01(e.t / tf), urg = k > 0.78 ? (k - 0.78) / 0.22 : 0;
          bdisc(e, x, y, A.nr, k, urg, 0.55 + 0.45 * Math.sin(k * 34) * urg,
            0.5 + 0.5 * urg, A.col, e.seed + i);
        } else {
          const q = c01((e.t - tf) / sp), fd = fade(q, 0.25);
          puddle(x, y, A.nr * 0.95, A.nr * GSQ, A.col, 0.28 * fd, e.seed + i, 9, 1.4);
          cracks(x, y, 7, A.nr * 0.8, A.col, 0.30 * fd, e.seed + i, 0.45, 1.1);
          ring(x, y, A.nr * (0.4 + 0.8 * eo(q)), 2.2, A.hot, 0.38 * fd, GSQ, 1.4);
        }
      }
    },
    air(w, e) {
      const A = e.ab, hi = A.art === 'pillar' ? 132 : 74;
      for (let i = 0; i < e.nd.length; i++) {
        const x = bwx(e, e.nd[i][0]), y = bwy(e, e.nd[i][1]);
        const tf = A.tell + A.ticks[i], sp = Math.max(e.dur - tf, 1e-3);
        if (e.t < tf) {
          const k = c01(e.t / tf);
          if (A.art === 'pillar') {
            // A pillar does not fall, it builds: the shaft grows down out of the dark, so its
            // second clock is a height. Same information as a falling rock, opposite gesture.
            column(x, y - hi * k, y, 0.6 + 1.5 * k, 0.4 + 1.1 * k, A.col, A.hot, 0.26 * k);
          } else {
            const ry = y - hi * (1 - k * k);       // gravity, not a lerp
            line(x, ry - 12 - 10 * (1 - k), x, ry, 1.6, A.col, 0.40, 1.4);
            core(x, ry, 4.8, A.col, 0.45, 1.7);
            core(x, ry, 2.4, A.hot, 0.85);
          }
        } else {
          const q = c01((e.t - tf) / sp), fd = fade(q, 0.20), g = pop(q, 0.08);
          const kick = 1 - c01(q / 0.18), cy = y - 4;
          if (A.art === 'pillar') {
            column(x, y - hi, y, 5.0 * g, 3.2 * g, A.col, A.hot, 1.0 * fd);
            column(x, y - hi, y, 1.3 * g, 0.8 * g, WHITE, WHITE, 0.74 * fd);
          }
          core(x, cy, A.nr * 0.72 * g, A.col, 0.90 * fd, 1.7);
          core(x, cy, A.nr * 0.28 * g, A.hot, 1.15 * fd);
          ring(x, y - 3, A.nr * (0.3 + eo(q)), 2.6 * (1 - q * 0.6) + 0.5, A.hot, 0.6 * fd, 0.9, 1.4);
          if (kick > 0) {
            star(x, cy, A.hot, A.art === 'pillar' ? 8 : 12, 3,
              A.nr * (1.4 + 1.2 * eo(q)), 2.2, 0.88 * kick, e.seed + i * 17 + 9, 0.35);
            glare(x, cy, A.nr * 1.8, A.nr, WHITE, 0.64 * kick);
          }
          sparks(x, y - 2, 19, 3, A.nr * (1.0 + 1.2 * eo(q)), A.hot, 0.78 * fd,
            e.seed + i + 9, 1.1, 0.9, 0, TAU, 8 * (1 - q));
        }
      }
    },
    under(w, e) { this.floor(w, e); },
    mid(w, e) { this.air(w, e); },
    boomUnder(w, e) { this.floor(w, e); },
    boomMid(w, e) { this.air(w, e); },
  },

  // ---- veins: fissures torn outward from the caster's own feet -------------------
  // One ray is always aimed at the hero, which sounds unfair and is the opposite. A star with
  // a random phase asks you to find the gap under time pressure; a star with one ray on you
  // asks you to step sideways. The second is a lesson, the first is a lottery.
  veins: {
    init(w, e) {
      const A = e.ab, rng = mulberry32(e.seed);
      e.rays = [];
      for (let i = 0; i < A.n; i++) e.rays.push(e.ang + i / A.n * TAU + rng.range(-0.16, 0.16));
    },
    hit(w, e, l) {
      const A = e.ab, R = A.thick * 0.9 + HERO_R;
      for (const a of e.rays)
        if (bseg(l.x, l.y, 0, 0, Math.cos(a) * A.r, Math.sin(a) * A.r) <= R) return true;
      return false;
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab;
      for (const a of e.rays) blane(e, a, 0, A.r, A.thick, k, fl, eg, A.col);
      ring(e.x, e.y, A.r, 1.2, WARN, 0.28 * eg, GSQ, 1.6);
      core(e.x, e.y, 5 + 4 * k, A.col, 0.28 + 0.30 * k, 1.8);
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab, g = 0.35 + 0.65 * eo(q);
      // The crack opens outward at about the speed the bright head was travelling, so the
      // tell was a promise about the timing as well as about the ground.
      for (let i = 0; i < e.rays.length; i++) {
        const a = e.rays[i], L = A.r * g;
        const x = bwx(e, Math.cos(a) * L), y = bwy(e, Math.sin(a) * L);
        line(e.x, e.y, x, y, A.thick * 0.9, A.col, 0.44 * fd, 1.0);
        line(e.x, e.y, x, y, A.thick * 0.34, A.hot, 0.72 * fd, 1.4);
        line(e.x, e.y, x, y, Math.max(0.7, A.thick * 0.12), WHITE, 0.54 * fd, 1.5);
        cracks(bwx(e, Math.cos(a) * L * 0.8), bwy(e, Math.sin(a) * L * 0.8), 3, A.thick * 3,
          A.col, 0.24 * fd, e.seed + i, 0.5, 1.0);
      }
      puddle(e.x, e.y, A.thick * 2.4, A.thick * 2.4 * GSQ, A.hot, 0.28 * fd, e.seed, 7, 1.5);
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab;
      // Magma does not stay on the floor. Every fissure vents, and the vents are what make the
      // ground look torn open rather than painted over.
      for (let i = 0; i < e.rays.length; i++) {
        const a = e.rays[i], L = A.r * (0.35 + 0.65 * eo(q));
        for (let s = 1; s <= 3; s++) {
          const t = L * s / 3.4, ph = (q * 1.7 + s * 0.27 + i * 0.11) % 1;
          const vx = bwx(e, Math.cos(a) * t), vy = bwy(e, Math.sin(a) * t);
          beam(vx, vy, -Math.PI / 2, 0, 6 + 13 * (1 - ph),
            2.4 * (1 - ph) * g, 0.45, A.col, 0.58 * (1 - ph) * fd, 1.3, 0.7);
          core(vx, vy - 2 - 9 * ph, 2.8 * (1 - ph) * g, A.hot,
            0.88 * (1 - ph) * fd);
        }
      }
      sparks(e.x, e.y - 3, 14, 4, A.r * 0.5 * (0.5 + eo(q)), A.hot, 0.55 * fd, e.seed + 4,
        1.0, 0.55, 0, TAU, 4);
    },
  },

  // ---- web: a lattice laid on the floor, and the lattice *is* the hitbox ----------
  // Two sketches, one shape. The frost web is a chain spiralling out from the caster; the blood
  // sigil is a five-pointed star drawn around you. Both bite along their links and at their
  // knots, and neither touches the space between them -- which is why the sigil leaves a safe
  // pentagon in the middle and the web leaves safe gaps between its turns. A lattice is the one
  // marked shape you are meant to stand *inside*, so every link gets the hard red edge.
  web: {
    init(w, e) {
      const A = e.ab, rng = mulberry32(e.seed), n = A.n, ph = rng.range(0, TAU);
      e.pts = []; e.lnk = [];
      if (A.art === 'blood') {
        for (let i = 0; i < n; i++)
          e.pts.push([Math.cos(ph + i / n * TAU) * A.r, Math.sin(ph + i / n * TAU) * A.r]);
        for (let i = 0; i < n; i++) e.lnk.push([i, (i + A.skip) % n]);
      } else {
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1), r = A.r0 + (A.r - A.r0) * t, a = ph + t * A.turns * TAU;
          e.pts.push([Math.cos(a) * r, Math.sin(a) * r]);
        }
        for (let i = 0; i < n - 1; i++) e.lnk.push([i, i + 1]);
      }
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
    lattice(w, e, la, na, col) {
      const A = e.ab;
      for (const g of e.lnk) {
        const a = e.pts[g[0]], b = e.pts[g[1]];
        const ax = bwx(e, a[0]), ay = bwy(e, a[1]), bx = bwx(e, b[0]), by = bwy(e, b[1]);
        line(ax, ay, bx, by, A.thick, A.col, la, 0.9);
        line(ax, ay, bx, by, A.thick * 0.34, col, la * 0.85, 1.4);
      }
      for (const p of e.pts) ring(bwx(e, p[0]), bwy(e, p[1]), A.nr, 1.3, col, na, GSQ, 1.5);
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab;
      this.lattice(w, e, 0.17 + 0.10 * urg, 0.22 * eg, A.col);
      for (let i = 0; i < e.pts.length; i++) {
        const x = bwx(e, e.pts[i][0]), y = bwy(e, e.pts[i][1]);
        puddle(x, y, A.nr, A.nr * GSQ, A.col, 0.13 + 0.08 * urg, e.seed + i, 7, 1.4);
        ring(x, y, A.nr, 1.4, WARN, 0.50 * eg, GSQ, 1.5);
      }
      // One bright knot travels the whole chain. The lattice is drawn in full from the first
      // frame, so this is the only thing that says how much of the wind-up is left.
      const t = k * e.lnk.length, i = Math.min(e.lnk.length - 1, Math.floor(t)), f = t - i;
      const a = e.pts[e.lnk[i][0]], b = e.pts[e.lnk[i][1]];
      core(bwx(e, a[0] + (b[0] - a[0]) * f), bwy(e, a[1] + (b[1] - a[1]) * f),
        3.4, WARN_H, 0.85 * fl);
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab;
      this.lattice(w, e, 0.48 * fd, 0.62 * fd, A.hot);
      for (let i = 0; i < e.pts.length; i++)
        cracks(bwx(e, e.pts[i][0]), bwy(e, e.pts[i][1]), 5, A.nr * 1.1, A.col,
          0.24 * fd, e.seed + i, 0.5, 1.0);
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab;
      for (let i = 0; i < e.pts.length; i++) {
        const x = bwx(e, e.pts[i][0]), y = bwy(e, e.pts[i][1]);
        if (A.art === 'frost')
          shard(x, y, A.nr * (1.0 + 2.0 * eo(q)), 3.2 * g, A.col, A.hot, 0.92 * fd,
            (i & 1) ? 0.22 : -0.22);
        else {
          star(x, y - 3, A.hot, 8, 2, A.nr * (1.0 + 1.2 * eo(q)), 2.2, 0.82 * fd, e.seed + i);
          core(x, y - 3, 4.6 * g, A.hot, 1.0 * fd);
          core(x, y - 3, 2.0 * g, WHITE, 0.88 * fd);
        }
      }
      // The sigil's own interior is the safe ground, and after it has bitten it goes dark
      // instead of bright: the one place in the game where *removing* light is the aftermath.
      if (A.art === 'blood') unlight(e.x, e.y, A.r * 0.5, 0.09 * fd, 1.5);
    },
  },

  // ---- waves: fronts leaving a wedge, one after another --------------------------
  // The wedge is marked whole from the first frame; what travels is a series of fronts, and the
  // gaps between them are the move. You do not leave this one, you *time* it -- which is why it
  // hurts on contact every frame rather than on beats, and why each front keeps its own ledger
  // so walking outward alongside a front cannot be charged for twice.
  waves: {
    init(w, e) { e.got = 0; },
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
    under(w, e, k, urg, fl, eg) {
      const A = e.ab, sw = A.arc * 2;
      arc(e.x, e.y, A.r * 0.55, e.ang, sw, A.r * 0.60, A.col, 0.15 + 0.09 * urg, GSQ, 0.8, 1.5);
      arc(e.x, e.y, A.r, e.ang, sw, 1.5, WARN, 0.55 * eg, GSQ, 1.4, 1.6);
      for (const s of [1, -1]) {
        const a = e.ang + s * A.arc;
        line(e.x, e.y, bwx(e, Math.cos(a) * A.r), bwy(e, Math.sin(a) * A.r), 1.0, WARN, 0.45 * eg);
      }
      // The fronts are stacked at the mouth before they leave: the picture has to say "this
      // arrives as a series", which one expanding arc cannot say until it has already expanded.
      for (let i = 0; i < A.nw; i++)
        arc(e.x, e.y, A.band * (1.2 + i * 1.7), e.ang, sw * 0.94, A.band * 0.8, A.col,
          0.20 * eg, GSQ, 1.1, 1.5);
      arc(e.x, e.y, Math.max(2, A.r * k), e.ang, sw, 1.9, WARN_H, 0.55 * fl, GSQ, 1.5, 1.6);
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab, sp = 1 - (A.nw - 1) * A.gap;
      arc(e.x, e.y, A.r * 0.55, e.ang, A.arc * 2, A.r * 0.60, A.col, 0.10 * fd, GSQ, 0.9, 1.5);
      for (let i = 0; i < A.nw; i++) {
        const wq = (q - i * A.gap) / sp;
        if (wq <= 0 || wq > 1) continue;
        const r = wq * A.r, a = (1 - wq * 0.55) * fd;
        arc(e.x, e.y, r, e.ang, A.arc * 2, A.band * 1.18, A.col, 0.46 * a, GSQ, 0.9, 1.4);
        arc(e.x, e.y, r, e.ang, A.arc * 2, A.band * 0.55, A.hot, 0.76 * a, GSQ, 1.3, 1.5);
        arc(e.x, e.y, r, e.ang, A.arc * 1.85, Math.max(0.8, A.band * 0.15), WHITE,
          0.58 * a, GSQ, 1.5, 1.8);
      }
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab, sp = 1 - (A.nw - 1) * A.gap;
      for (let i = 0; i < A.nw; i++) {
        const wq = (q - i * A.gap) / sp;
        if (wq <= 0 || wq > 1) continue;
        const r = wq * A.r, a = (1 - wq * 0.6) * fd;
        arc(e.x, e.y - 4, r, e.ang, A.arc * 2, A.band * 0.85 * g, A.hot, 0.82 * a, 0.62, 1.4, 1.8);
        arc(e.x, e.y - 4, r, e.ang, A.arc * 1.8, 1.0 * g, WHITE, 0.62 * a, 0.62, 1.5, 2.0);
        for (const s of [1, -1]) {
          const ta = e.ang + s * A.arc;
          const x = bwx(e, Math.cos(ta) * r), y = bwy(e, Math.sin(ta) * r) - 4;
          core(x, y, 3.8 * g, A.hot, 0.82 * a);
          sparks(x, y, 5, 1, 9, A.hot, 0.55 * a, e.seed + i * 31 + (s > 0 ? 1 : 2),
            1.0, 0.8, ta - 0.8, ta + 0.8, 5);
        }
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
        const t = this.prog(e, i, q);
        if (t <= 0) continue;
        const p = this.lane(e, i, Math.min(t, 1));
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
        for (let s = 0; s <= 10; s++) {
          const t = s / 10, p = this.lane(e, i, t), p2 = this.lane(e, i, Math.min(1, t + 0.05));
          const dx = p2[0] - p[0], dy = p2[1] - p[1], d = Math.max(Math.hypot(dx, dy), 1e-3);
          const nx = -dy / d * A.rad, ny = dx / d * A.rad;
          mid.push([bwx(e, p[0]), bwy(e, p[1])]);
          ea.push([bwx(e, p[0] + nx), bwy(e, p[1] + ny)]);
          eb.push([bwx(e, p[0] - nx), bwy(e, p[1] - ny)]);
        }
        polyline(mid, A.rad, A.col, 0.15 + 0.09 * urg, 0.9);
        polyline(ea, 1.0, WARN, 0.46 * eg);
        polyline(eb, 1.0, WARN, 0.46 * eg);
        // Each head runs out on its *own* clock during the wind-up, exactly the clock it will
        // travel on. So the order of fire is not a fact the player has to be told separately --
        // the lane that is going first is the one whose light is furthest down it, and the one
        // still sitting at the mouth is the one you have the most time for.
        const t = c01(this.prog(e, i, k));
        core(bwx(e, this.lane(e, i, Math.max(0.03, t))[0]),
          bwy(e, this.lane(e, i, Math.max(0.03, t))[1]),
          2.4 + 1.0 * t, WARN_H, (0.42 + 0.46 * t) * fl);
      }
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab;
      for (let i = 0; i < A.nl; i++) {
        const pts = [];
        for (let s = 0; s <= 10; s++) {
          const p = this.lane(e, i, s / 10);
          pts.push([bwx(e, p[0]), bwy(e, p[1])]);
        }
        polyline(pts, A.rad * 0.65, A.col, 0.19 * fd, 0.9);
        const t = this.prog(e, i, q);
        if (t <= 0) continue;
        const h = this.lane(e, i, Math.min(t, 1));
        puddle(bwx(e, h[0]), bwy(e, h[1]), A.rad, A.rad * GSQ, A.hot, 0.24 * fd, e.seed + i, 7, 1.5);
      }
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab;
      for (let i = 0; i < A.nl; i++) {
        const t = this.prog(e, i, q);
        if (t <= 0) continue;
        const tc = Math.min(t, 1);
        const p = this.lane(e, i, tc), p2 = this.lane(e, i, Math.min(1, tc + 0.06));
        const x = bwx(e, p[0]), y = bwy(e, p[1]) - 4;
        const ta = Math.atan2((p2[1] - p[1]) * GSQ, p2[0] - p[0]);
        // A cutting edge, not a bullet: the head is an arc drawn across its own direction of
        // travel, which is the shape the sketch draws for a wind blade.
        for (let tr = 2; tr >= 0; tr--)
          arc(x - Math.cos(ta) * tr * 4, y - Math.sin(ta) * tr * 4, A.rad * (1.25 + tr * 0.12),
            ta, 2.15, (2.8 - tr * 0.6) * g, tr === 0 ? A.hot : A.col,
            (0.92 - tr * 0.25) * fd, 1.0, 1.4, 1.9);
        arc(x, y, A.rad * 1.28, ta, 2.0, 1.0 * g, WHITE, 0.72 * fd, 1.0, 1.5, 2.0);
        core(x, y, 3.8 * g, A.hot, 1.0 * fd);
        core(x, y, 1.7 * g, WHITE, 0.92 * fd);
        sparks(x, y, 10, 1, 15, A.col, 0.68 * fd, e.seed + i * 7, 1.0, 0.9,
          ta + 2.4, ta + 3.9, 9);
      }
    },
  },

  // ---- spiral: a band travelling along spiral arms, outward or inward -------------
  // Two sketches again, and the only difference in the code is a direction. Death Spiral throws
  // its band out from the middle, so the middle is where you end up safe; Gravity Collapse drags
  // you toward the middle for the whole wind-up and then closes on it, so the middle is the one
  // place you must not be. Same picture, opposite answer, and the chevrons say which.
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
    under(w, e, k, urg, fl, eg) {
      const A = e.ab, s = bdir(e), inw = A.dir === 'in';
      puddle(e.x, e.y, A.r, A.r * GSQ, A.col, 0.12 + 0.08 * urg, e.seed, 9, 1.4);
      spiral(e.x, e.y, A.arms, A.r0, A.r, A.turns * s, A.col, 0.26 + 0.22 * eg, 1.8, GSQ,
        e.ph + e.t * (inw ? -1.9 : 1.9), 20, false);
      ring(e.x, e.y, A.r, 1.5, WARN, 0.55 * eg, GSQ, 1.5);
      dial(e.x, e.y, A.r, 12, WARN, 0.24 * eg, GSQ, 3, 1);
      const f0 = this.front(e, 0);
      ring(e.x, e.y, f0, 2.2, A.hot, 0.32 * fl, GSQ, 1.4);
      for (let i = 0; i < 6; i++) {
        const a = e.ph + i / 6 * TAU, rr = Math.max(3, f0 + (inw ? -1 : 1) * (5 + 9 * k));
        chevron(bwx(e, Math.cos(a) * rr), bwy(e, Math.sin(a) * rr), a + (inw ? Math.PI : 0),
          4.0, WARN, 0.45 * eg, 1.0, 0.8);
      }
      ring(e.x, e.y, Math.max(1.5, A.r * k), 1.9, WARN_H, 0.50 * fl, GSQ, 1.6);
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab, s = bdir(e), inw = A.dir === 'in', r = this.front(e, q);
      spiral(e.x, e.y, A.arms, A.r0, A.r, A.turns * s, A.col, 0.24 * fd, 1.6, GSQ,
        e.ph + e.t * (inw ? -2.6 : 2.6), 20, false);
      ring(e.x, e.y, r, A.band * 1.15, A.col, 0.44 * fd, GSQ, 0.9);
      ring(e.x, e.y, r, A.band * 0.50, A.hot, 0.74 * fd, GSQ, 1.3);
      ring(e.x, e.y, r, Math.max(0.8, A.band * 0.13), WHITE, 0.52 * fd, GSQ, 1.5);
      cracks(e.x, e.y, 9, A.r * 0.5, A.col, 0.18 * fd, e.seed + 1, 0.45, 1.1);
      // Inward it ends as a point of light in the middle; outward it leaves the sketch's little
      // dark crater where the arms came from. The aftermath is how you tell them apart in a
      // screenshot, which is the test for whether two moves are really two moves.
      if (inw) core(e.x, e.y, 4 + 16 * q * q, A.hot, 0.30 * fd, 1.8);
      else unlight(e.x, e.y, 7 + 5 * q, 0.10 * q, 1.4);
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab, s = bdir(e), inw = A.dir === 'in', r = this.front(e, q);
      const t = (r - A.r0) / Math.max(A.r - A.r0, 1e-3);
      for (let i = 0; i < A.arms; i++) {
        const a = e.ph + i / A.arms * TAU + s * A.turns * TAU * t;
        const r1 = inw ? Math.max(A.r0 * 0.4, r - 17) : Math.min(A.r, r + 17);
        bolt(bwx(e, Math.cos(a) * r), bwy(e, Math.sin(a) * r) - 4,
          bwx(e, Math.cos(a) * r1), bwy(e, Math.sin(a) * r1) - 4,
          A.col, A.hot, 0.72 * fd, 5, 4, e.seed + i * 13, 2.0, 1);
        core(bwx(e, Math.cos(a) * r1), bwy(e, Math.sin(a) * r1) - 4, 3.0 * g, A.hot, 0.85 * fd);
      }
      const cy = e.y - 5;
      star(e.x, cy, A.hot, inw ? 6 : 10, 3, A.r * (inw ? 0.34 : 0.5) * (0.5 + 0.6 * eo(q)),
        2.5, 0.76 * fd, e.seed);
      glare(e.x, cy, 25 * g, 16 * g, WHITE, 0.56 * fd);
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
    hit(w, e, l) {
      const A = e.ab, h = w.hero, R = A.r + HERO_R;
      const near = p => Math.hypot(p[0] - h.x, (p[1] - (h.y - 1)) / GSQ) <= R;
      // The newest six samples are under his own feet by definition, so they are not news: the
      // warning is about the part of the trail he has already left behind.
      if (!e.fired) {
        for (let i = 0; i < e.pts.length - 6; i++) if (near(e.pts[i])) return true;
        return false;
      }
      if (e.got || !near(this.at(e, bq(e)))) return false;
      e.got = 1;
      return true;
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab, p = e.pts;
      // Dashed rather than solid: a solid line reads as a wall you must not cross, and this is
      // the opposite -- a path something else is going to walk. The arrows say which way.
      for (let i = 0; i + 1 < p.length; i++) {
        const a = p[i], b = p[i + 1];
        dashline(a[0], a[1], b[0], b[1], 2, A.r * 0.9, A.col, 0.17 + 0.10 * urg, 0.9, 0.45);
        dashline(a[0], a[1], b[0], b[1], 2, 1.0, WARN, 0.42 * eg, 1.0, 0.45);
        if (i % 3 === 2)
          chevron(b[0], b[1], Math.atan2((b[1] - a[1]) / GSQ, b[0] - a[0]), 3.6, WARN,
            0.44 * eg, 1.0, 0.8);
      }
      // The oldest sample is where it starts from, so it gets the marker: you are told the
      // direction of travel before it moves, which is the only warning that matters here.
      reticle(p[0][0], p[0][1], A.r + 3, WARN, 0.46 * eg, GSQ, 6, 1.0);
      const h = this.at(e, Math.max(0.02, k));
      core(h[0], h[1], 2.8, WARN_H, 0.78 * fl);
      ring(h[0], h[1], A.r, 1.2, WARN_H, 0.40 * fl, GSQ, 1.4);
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab, p = e.pts;
      // The trail burns off behind the ghost: what it has already walked stops being marked,
      // so the picture keeps saying where it still is going.
      for (let i = 0; i + 1 < p.length; i++) {
        const t = i / Math.max(p.length - 1, 1);
        if (t < q - 0.10) continue;
        dashline(p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], 2, A.r * 0.7, A.col,
          0.16 * fd, 0.9, 0.45);
      }
      const h = this.at(e, q);
      puddle(h[0], h[1], A.r, A.r * GSQ, A.hot, 0.22 * fd, e.seed, 7, 1.5);
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab, h = this.at(e, q), h2 = this.at(e, Math.min(1, q + 0.05));
      const ta = Math.atan2((h2[1] - h[1]) / GSQ, h2[0] - h[0]);
      const y = h[1] - 5;
      // Deliberately not the hero's sprite. A ghost of the player would read as a second
      // player; what the sketch draws is a shape *doing* what the player did, so it is a body
      // of light with one swing in it and nothing to identify.
      core(h[0], y, 6.0 * g, A.col, 0.82 * fd, 1.5);
      core(h[0], y, 2.8 * g, WHITE, 0.82 * fd);
      beam(h[0], y, ta, 0, A.r * 1.5, 4.2 * g, 0.8, A.hot, 0.64 * fd, 1.2, 1);
      for (let tr = 0; tr < 3; tr++)
        arc(h[0] - Math.cos(ta) * tr * 3, y - Math.sin(ta) * tr * 3,
          A.r * (1.35 + tr * 0.10), ta, 2.3, (2.4 - tr * 0.45) * g,
          tr === 0 ? A.hot : A.col, (0.84 - tr * 0.20) * fd, 1.0, 1.4, 1.8);
      sparks(h[0], y, 14, 1, 18, A.col, 0.70 * fd, e.seed + 5, 1.1, 0.9,
        ta - 1.2, ta + 1.2, 9);
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
    // before it asks, so 1 means "the stomp is what is landing right now".
    vol(e) {
      const A = e.ab;
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
      }
      bdisc(e, e.x, e.y, A.r0, Math.min(1, k * 2), urg, fl, eg, A.col, e.seed);
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
        }
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
  // The sweep now goes out *and comes back* (see `sweep`), which is why its wedge grew: a
  // stroke you answer by stepping behind it is answered once and then never thought about
  // again, and the second half of this one crosses the ground the first half just cleared.
  flame_sweep: {
    name: 'Quét Lửa', shape: 'sweep', aim: 'dir', r: 68, r0: 14, arc: 0.40, span: 1.45,
    tell: 0.95, dur: 2.00, dmg: 38, shake: 3.8, range: 58, sample: true,
    cd: [2.6, 3.6], col: C.ember, hot: C.gold,
  },
  // Nine fissures instead of seven, and they vent a second time 0.34 s after they open. The
  // gap between two of them is still four times the hero wide at the rim -- what the second
  // beat removes is the option of standing on one and reading the damage as a tax.
  earthquake: {
    name: 'Địa Liệt', shape: 'veins', aim: 'self', r: 100, thick: 5.5, n: 9,
    tell: 1.15, dur: 2.10, dmg: 44, ticks: [0, 0.34], shake: 6.0, range: 90,
    cd: [3.4, 4.6], col: C.ember, hot: C.gold, boomv: 'big',
  },
  // Four pillars in a row where you were standing, 0.24 s apart: standing still is the only
  // way to eat all four, and walking anywhere at all beats every one of them.
  judgment: {
    name: 'Phán Quyết', shape: 'nodes', art: 'pillar', aim: 'hero', r: 48, nr: 12,
    tell: 1.10, dur: 2.50, dmg: 44, ticks: [0, 0.24, 0.48, 0.72], shake: 4.4,
    range: 150, min: 30, cd: [3.0, 4.2], col: C.gold, hot: C.holyp,
  },
  meteor_rain: {
    name: 'Mưa Thiên Thạch', shape: 'nodes', art: 'meteor', aim: 'hero', r: 92, nr: 15,
    tell: 1.20, dur: 3.10, dmg: 28,
    ticks: [0, 0.22, 0.44, 0.66, 0.88, 1.10, 1.32, 1.54],
    shake: 3.4, range: 190, min: 40, cd: [3.6, 4.8], col: C.ember, hot: C.gold, boomv: 'big',
  },

  // ---- Vua Băng: four ways of saying "not there" ---------------------------------
  // It never wants to be next to you and has nothing for contact range, so its `keep` band is
  // wide and every move rewards reading a picture rather than reacting to a flash.
  //
  // Ten knots over nearly two full turns, and it bites three times. The radial spacing between
  // two turns of the chain is still twenty pixels of clear floor, so there is a corridor; what
  // there is no longer is time to stand in a gap and think about it.
  frost_web: {
    name: 'Lưới Băng', shape: 'web', art: 'frost', aim: 'self',
    r: 78, r0: 10, n: 10, turns: 1.9, nr: 6, thick: 4.5,
    tell: 1.10, dur: 2.30, dmg: 24, ticks: [0, 0.34, 0.68], shake: 3.0, range: 86,
    cd: [2.8, 3.8], col: C.ice, hot: C.pale,
  },
  // Four fronts out of a wider mouth. Consecutive fronts are half the reach apart, which is
  // fifty-odd pixels of clear ground between two bands twenty-four wide: the answer is still
  // four steps, and it is now four steps rather than three.
  sonic_tide: {
    name: 'Thủy Triều Âm', shape: 'waves', aim: 'dir', r: 118, arc: 0.70, nw: 4, band: 8,
    gap: 0.20, tell: 1.05, dur: 2.25, dmg: 28, shake: 3.6, range: 116, min: 30,
    sample: true, cd: [2.8, 3.8], col: C.cyan, hot: C.pale,
  },
  // Five lanes, and they no longer leave together: `blades` launches them a tenth of the travel
  // apart, near lane first, so the gap you can stand in slides down-range while the volley is in
  // the air. Standing still in the one safe corridor is no longer an answer; you have to walk it.
  wind_blades: {
    name: 'Phong Nhận', shape: 'blades', aim: 'dir', nl: 5, spread: 0.27, r: 128, bend: 0.62,
    rad: 7, stag: 0.40, tell: 0.85, dur: 1.95, dmg: 24, shake: 2.6, range: 132, min: 34,
    sample: true, cd: [2.4, 3.2], col: C.steel, hot: C.pale,
  },
  // The one move in the game that moves the hero instead of asking him to move. Dash beats it.
  gravity_sink: {
    name: 'Hố Trọng Lực', shape: 'spiral', dir: 'in', pull: 66, aim: 'hero',
    r: 100, r0: 6, arms: 5, turns: 1.7, band: 9,
    tell: 1.20, dur: 2.40, dmg: 42, shake: 5.0, range: 130, sample: true,
    cd: [3.6, 4.8], col: C.deep, hot: C.cyan, boomv: 'big',
  },

  // ---- Sứ Giả Hư Không: three of its four are marks, not throws --------------------
  // The fastest and frailest of the three, and the only one whose kit punishes *habits*: a
  // sigil around where you stood, an echo of the path you walked, a spiral you leave by
  // standing still in the middle of it.
  death_spiral: {
    name: 'Vòng Xoáy Tử', shape: 'spiral', dir: 'out', aim: 'self',
    r: 90, r0: 6, arms: 4, turns: 1.5, band: 9,
    tell: 1.05, dur: 2.10, dmg: 36, shake: 4.0, range: 92, sample: true,
    cd: [2.8, 3.8], col: C.voidc, hot: C.lilac,
  },
  blood_sigil: {
    name: 'Huyết Ấn', shape: 'web', art: 'blood', aim: 'hero', r: 70, n: 5, skip: 2, nr: 9,
    thick: 5, tell: 1.05, dur: 2.10, dmg: 44, ticks: [0, 0.30, 0.60], shake: 4.2,
    range: 150, min: 26, cd: [3.0, 4.2], col: C.blood, hot: C.blush,
  },
  delayed_echo: {
    name: 'Dư Ảnh Trễ', shape: 'echo', aim: 'self', r: 13,
    tell: 1.10, dur: 2.30, dmg: 32, shake: 2.4, range: 170,
    sample: true, cd: [2.8, 3.8], col: C.vio, hot: C.viop,
  },
  // Three beats now, and the third one opens the channels *between* the first eight -- the
  // ground you stepped into to survive beat two. Both sets are drawn from the first frame, so
  // the answer is picked once, in advance, out of a picture that shows all sixteen.
  chain_stomp: {
    name: 'Chấn Liên Hoàn', shape: 'spokes', aim: 'self', r: 88, r0: 26, n: 8, thick: 4.5,
    tell: 1.05, dur: 2.15, dmg: 32, ticks: [0, 0.22, 0.44], shake: 5.2, range: 86,
    cd: [2.8, 3.8], col: C.voidc, hot: C.volt, boomv: 'big',
  },
});
