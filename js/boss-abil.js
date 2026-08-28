"use strict";
// ===========================================================================
// 6d. Boss abilities -- the twelve moves sketched in assets/images/skills/boss/.
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

const BOSS_SHAPE = {
  // ---- sweep: a blade of fire dragged through an annulus wedge ------------------
  // The marked ground is everything the blade will pass over; the blade itself is a narrow
  // wedge inside it, and where it has got to is the clock. Two answers, both legible from the
  // picture: stand inside `r0` and let it pass over your head, or leave the wedge sideways.
  sweep: {
    hit(w, e, l) {
      const A = e.ab, d = Math.hypot(l.x, l.y);
      if (d > A.r + HERO_R || d < A.r0 - HERO_R) return false;
      const c = e.fired ? e.ang + bdir(e) * A.span * (1 - 2 * bq(e)) : e.ang;
      const half = (e.fired ? A.arc : A.arc + A.span) + Math.atan2(HERO_R, Math.max(d, 1));
      if (Math.abs(bangd(Math.atan2(l.y, l.x), c)) > half) return false;
      if (!e.fired) return true;
      if (e.got) return false;
      e.got = 1; return true;
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab, s = bdir(e), sw = (A.span + A.arc) * 2;
      const rm = (A.r0 + A.r) * 0.5, rt = A.r - A.r0;
      arc(e.x, e.y, rm, e.ang, sw, rt, A.col, 0.15 + 0.09 * urg, GSQ, 0.8, 1.4);
      arc(e.x, e.y, A.r, e.ang, sw, 1.5, WARN, 0.55 * eg, GSQ, 1.4, 1.6);
      arc(e.x, e.y, A.r0, e.ang, sw, 1.2, WARN, 0.40 * eg, GSQ, 1.4, 1.6);
      for (const g of [1, -1]) {
        const a = e.ang + g * (A.span + A.arc);
        line(bwx(e, Math.cos(a) * A.r0), bwy(e, Math.sin(a) * A.r0),
             bwx(e, Math.cos(a) * A.r), bwy(e, Math.sin(a) * A.r), 1.0, WARN, 0.45 * eg);
      }
      // The blade sits on the edge it will start from and three chevrons point the way it is
      // going: a sweep you cannot read the direction of is a coin flip, not a dodge.
      const a0 = e.ang + s * A.span, a1 = a0 - s * (0.20 + 0.5 * k);
      arc(e.x, e.y, rm, a0, A.arc * 2, rt * 0.9, A.hot, 0.30 * fl, GSQ, 1.0, 1.4);
      for (let i = 0; i < 3; i++) {
        const t = A.r0 + (A.r - A.r0) * (0.22 + i * 0.3);
        chevron(bwx(e, Math.cos(a1) * t), bwy(e, Math.sin(a1) * t),
                a1 - s * Math.PI / 2, 4.2, WARN, 0.50 * eg, 1.0, 0.8);
      }
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab, s = bdir(e), rm = (A.r0 + A.r) * 0.5, rt = A.r - A.r0;
      const a = e.ang + s * A.span * (1 - 2 * q);
      // The ground the blade has already crossed stays lit and cooling behind it. A stroke
      // with no wake reads as a strobe rather than as one continuous swing.
      for (let i = 4; i >= 1; i--) {
        const at = a + s * 0.26 * i;
        if (Math.abs(bangd(at, e.ang)) > A.span + A.arc) continue;
        arc(e.x, e.y, rm, at, A.arc * 1.8, rt * 0.8, A.col, 0.20 * fd / i, GSQ, 0.9, 1.4);
      }
      arc(e.x, e.y, rm, a, A.arc * 2.2, rt, A.hot, 0.32 * fd, GSQ, 0.9, 1.4);
      cracks(bwx(e, Math.cos(a) * rm), bwy(e, Math.sin(a) * rm), 5, rt * 0.5,
             A.col, 0.26 * fd, e.seed, 0.5, 1.0);
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab, s = bdir(e), rm = (A.r0 + A.r) * 0.5, rt = A.r - A.r0;
      const a = e.ang + s * A.span * (1 - 2 * q);
      for (let i = 0; i < 3; i++)
        arc(e.x, e.y - 4, rm - i * 2.5, a, A.arc * 2 * (1 - i * 0.14), rt * 0.5 - i * 1.6,
            i === 0 ? A.hot : A.col, (0.85 - i * 0.25) * fd, 0.62, 1.4, 2.0);
      const tx = bwx(e, Math.cos(a) * A.r), ty = bwy(e, Math.sin(a) * A.r) - 4;
      core(tx, ty, 5 * g, A.hot, 0.8 * fd, 1.6);
      sparks(tx, ty, 9, 2, 14, A.hot, 0.7 * fd, e.seed + 5, 1.0, 0.8, a - 1.2, a + 1.2, 6);
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
          if (A.art === 'pillar') column(x, y - hi, y, 3.6 * g, 2.4 * g, A.col, A.hot, 0.85 * fd);
          core(x, y - 4, A.nr * 0.55 * g, A.col, 0.75 * fd, 1.7);
          core(x, y - 4, A.nr * 0.22 * g, A.hot, 1.0 * fd);
          ring(x, y - 3, A.nr * (0.3 + eo(q)), 2.6 * (1 - q * 0.6) + 0.5, A.hot, 0.6 * fd, 0.9, 1.4);
          sparks(x, y - 2, 11, 3, A.nr * (0.8 + 0.9 * eo(q)), A.hot, 0.62 * fd, e.seed + i + 9,
                 1.0, 0.9, 0, TAU, 5 * (1 - q));
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
        line(e.x, e.y, x, y, A.thick * 0.8, A.col, 0.30 * fd, 1.0);
        line(e.x, e.y, x, y, A.thick * 0.30, A.hot, 0.42 * fd, 1.4);
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
          core(bwx(e, Math.cos(a) * t), bwy(e, Math.sin(a) * t) - 2 - 7 * ph,
               2.4 * (1 - ph) * g, A.hot, 0.70 * (1 - ph) * fd);
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
      this.lattice(w, e, 0.32 * fd, 0.40 * fd, A.hot);
      for (let i = 0; i < e.pts.length; i++)
        cracks(bwx(e, e.pts[i][0]), bwy(e, e.pts[i][1]), 5, A.nr * 1.1, A.col,
               0.24 * fd, e.seed + i, 0.5, 1.0);
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab;
      for (let i = 0; i < e.pts.length; i++) {
        const x = bwx(e, e.pts[i][0]), y = bwy(e, e.pts[i][1]);
        if (A.art === 'frost')
          shard(x, y, A.nr * (0.8 + 1.4 * eo(q)), 2.6 * g, A.col, A.hot, 0.72 * fd,
                (i & 1) ? 0.22 : -0.22);
        else {
          star(x, y - 3, A.hot, 6, 2, A.nr * (0.7 + 0.8 * eo(q)), 1.8, 0.6 * fd, e.seed + i);
          core(x, y - 3, 3.4 * g, A.hot, 0.9 * fd);
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
        arc(e.x, e.y, r, e.ang, A.arc * 2, A.band, A.col, 0.30 * a, GSQ, 0.9, 1.4);
        arc(e.x, e.y, r, e.ang, A.arc * 2, A.band * 0.45, A.hot, 0.42 * a, GSQ, 1.3, 1.5);
      }
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab, sp = 1 - (A.nw - 1) * A.gap;
      for (let i = 0; i < A.nw; i++) {
        const wq = (q - i * A.gap) / sp;
        if (wq <= 0 || wq > 1) continue;
        const r = wq * A.r, a = (1 - wq * 0.6) * fd;
        arc(e.x, e.y - 4, r, e.ang, A.arc * 2, A.band * 0.7 * g, A.hot, 0.55 * a, 0.62, 1.4, 1.8);
        for (const s of [1, -1]) {
          const ta = e.ang + s * A.arc;
          core(bwx(e, Math.cos(ta) * r), bwy(e, Math.sin(ta) * r) - 4, 2.6 * g, A.hot, 0.55 * a);
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
        const p = this.lane(e, i, q);
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
        const h = this.lane(e, i, Math.max(0.03, k));
        core(bwx(e, h[0]), bwy(e, h[1]), 3.0, WARN_H, 0.80 * fl);
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
        polyline(pts, A.rad * 0.55, A.col, 0.12 * fd, 0.9);
        const h = this.lane(e, i, q);
        puddle(bwx(e, h[0]), bwy(e, h[1]), A.rad, A.rad * GSQ, A.hot, 0.24 * fd, e.seed + i, 7, 1.5);
      }
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab;
      for (let i = 0; i < A.nl; i++) {
        const p = this.lane(e, i, q), p2 = this.lane(e, i, Math.min(1, q + 0.06));
        const x = bwx(e, p[0]), y = bwy(e, p[1]) - 4;
        const ta = Math.atan2((p2[1] - p[1]) * GSQ, p2[0] - p[0]);
        // A cutting edge, not a bullet: the head is an arc drawn across its own direction of
        // travel, which is the shape the sketch draws for a wind blade.
        arc(x, y, A.rad * 1.15, ta, 2.0, 1.9 * g, A.hot, 0.72 * fd, 1.0, 1.4, 1.8);
        arc(x, y, A.rad * 1.15, ta, 2.4, 0.9 * g, WHITE, 0.40 * fd, 1.0, 1.5, 1.8);
        core(x, y, 2.6 * g, A.hot, 0.85 * fd);
        sparks(x, y, 6, 1, 11, A.col, 0.50 * fd, e.seed + i * 7, 1.0, 0.9,
               ta + 2.4, ta + 3.9, 7);
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
      ring(e.x, e.y, r, A.band, A.col, 0.30 * fd, GSQ, 0.9);
      ring(e.x, e.y, r, A.band * 0.45, A.hot, 0.44 * fd, GSQ, 1.3);
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
           2.2, 0.5 * fd, e.seed);
      glare(e.x, cy, 17 * g, 11 * g, WHITE, 0.34 * fd);
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
      core(h[0], y, 4.2 * g, A.col, 0.60 * fd, 1.5);
      core(h[0], y, 2.2 * g, WHITE, 0.55 * fd);
      beam(h[0], y, ta, 0, A.r * 1.1, 3.2 * g, 0.8, A.hot, 0.42 * fd, 1.2, 1);
      arc(h[0], y, A.r * 1.25, ta, 2.2, 1.7 * g, A.hot, 0.66 * fd, 1.0, 1.4, 1.8);
      sparks(h[0], y, 7, 1, 12, A.col, 0.46 * fd, e.seed + 5, 1.0, 0.9, ta - 1.2, ta + 1.2, 6);
    },
  },

  // ---- spokes: a stomp at the feet, then the ground splitting outward --------------
  // Two beats and two different safe places, which is what makes it worth having next to a plain
  // disc. Beat one is the core the boss is standing in, so you leave. Beat two is eight channels
  // running out from it, so where you leave *to* has to be between two of them -- and both are
  // drawn from the first frame, so the second answer is available before the first beat lands.
  spokes: {
    init(w, e) { e.ph = mulberry32(e.seed).range(0, TAU); },
    ray(e, i) { return e.ph + i / e.ab.n * TAU; },
    hit(w, e, l) {
      const A = e.ab, d = Math.hypot(l.x, l.y);
      if (d > A.r + HERO_R) return false;
      // Beat one is the core only, beat two the channels only. `e.ticked` is incremented by
      // stepTel just before it asks, so 1 means "the stomp is what is landing right now".
      if (e.ticked <= 1) return d <= A.r0 + HERO_R;
      if (d < A.r0 - HERO_R) return false;
      const R = A.thick * 0.9 + HERO_R;
      for (let i = 0; i < A.n; i++) {
        const a = this.ray(e, i);
        if (bseg(l.x, l.y, Math.cos(a) * A.r0, Math.sin(a) * A.r0,
                 Math.cos(a) * A.r, Math.sin(a) * A.r) <= R) return true;
      }
      return false;
    },
    under(w, e, k, urg, fl, eg) {
      const A = e.ab;
      for (let i = 0; i < A.n; i++) {
        const a = this.ray(e, i);
        blane(e, a, A.r0 - 2, A.r, A.thick, k, fl, eg, A.col);
        chevron(bwx(e, Math.cos(a) * A.r), bwy(e, Math.sin(a) * A.r), a, 4.2, WARN,
                0.42 * eg, 1.0, 0.8);
      }
      bdisc(e, e.x, e.y, A.r0, Math.min(1, k * 2), urg, fl, eg, A.col, e.seed);
      // A dotted outer boundary, not a hard one: nothing crosses it, it is only where the
      // channels stop, and drawing it solid would claim the whole disc is marked.
      dial(e.x, e.y, A.r, 24, WARN, 0.22 * eg, GSQ, 0, 1, 0.03, 0.03);
    },
    boomUnder(w, e, q, fd) {
      const A = e.ab;
      // Beat one scorches the core, beat two the channels, and both stay for the rest of the
      // entry: the aftermath is the sketch's third panel, branches still smoking.
      puddle(e.x, e.y, A.r0, A.r0 * GSQ, A.col, 0.20 * fd, e.seed, 9, 1.4);
      cracks(e.x, e.y, A.n, A.r0 * 1.1, A.hot, 0.22 * fd, e.seed, GSQ, 1.2);
      if (e.ticked > 1) {
        const g = c01((q - A.ticks[1] / Math.max(e.dur - A.tell, 1e-3)) * 3);
        for (let i = 0; i < A.n; i++) {
          const a = this.ray(e, i), rr = A.r0 + (A.r - A.r0) * g;
          line(bwx(e, Math.cos(a) * A.r0), bwy(e, Math.sin(a) * A.r0),
               bwx(e, Math.cos(a) * rr), bwy(e, Math.sin(a) * rr),
               A.thick, A.col, 0.26 * fd, 0.9, 1);
          line(bwx(e, Math.cos(a) * A.r0), bwy(e, Math.sin(a) * A.r0),
               bwx(e, Math.cos(a) * rr), bwy(e, Math.sin(a) * rr),
               A.thick * 0.4, A.hot, 0.34 * fd, 1.3, 1);
        }
      }
      unlight(e.x, e.y, A.r0 * 0.8, 0.10 * fd, 1.4);
    },
    boomMid(w, e, q, fd, g) {
      const A = e.ab, cy = e.y - 5;
      core(e.x, cy, 6.5 * g, A.hot, 0.70 * fd, 1.6);
      core(e.x, cy, 3.0 * g, WHITE, 0.60 * fd);
      star(e.x, cy, A.hot, A.n, 3, A.r0 * (0.8 + 0.7 * eo(q)), 2.0, 0.50 * fd, e.seed);
      if (e.ticked > 1) {
        const t = c01((q - A.ticks[1] / Math.max(e.dur - A.tell, 1e-3)) * 3);
        for (let i = 0; i < A.n; i++) {
          const a = this.ray(e, i), rr = A.r0 + (A.r - A.r0) * t;
          bolt(bwx(e, Math.cos(a) * A.r0), bwy(e, Math.sin(a) * A.r0) - 4,
               bwx(e, Math.cos(a) * rr), bwy(e, Math.sin(a) * rr) - 4,
               A.col, A.hot, 0.60 * fd, 4, 3, e.seed + i * 9, 1.8, 1);
          core(bwx(e, Math.cos(a) * rr), bwy(e, Math.sin(a) * rr) - 4, 2.4 * g, A.hot, 0.70 * fd);
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
Object.assign(FOE_ABIL, {
  // ---- Chúa Lò: everything it does is aimed at the floor you are standing on ------
  // A slow, close, enormous fighter. Its long move (meteors) is the only one that can reach
  // across the arena, and it is also the slowest to land: the whole kit says "come here".
  flame_sweep: {
    name: 'Quét Lửa', shape: 'sweep', aim: 'dir', r: 62, r0: 14, arc: 0.34, span: 1.25,
    tell: 0.95, dur: 1.85, dmg: 40, shake: 3.0, range: 58, sample: true,
    cd: [4.2, 6.0], col: C.ember, hot: C.gold,
  },
  earthquake: {
    name: 'Địa Liệt', shape: 'veins', aim: 'self', r: 100, thick: 5.5, n: 7,
    tell: 1.15, dur: 2.00, dmg: 46, shake: 5.0, range: 90,
    cd: [5.6, 7.8], col: C.ember, hot: C.gold, boomv: 'big',
  },
  // Three pillars in a row where you were standing, 0.28 s apart: standing still is the only
  // way to eat all three, and walking anywhere at all beats every one of them.
  judgment: {
    name: 'Phán Quyết', shape: 'nodes', art: 'pillar', aim: 'hero', r: 44, nr: 12,
    tell: 1.20, dur: 2.50, dmg: 46, ticks: [0, 0.28, 0.56], shake: 3.6, range: 150, min: 30,
    cd: [5.0, 7.0], col: C.gold, hot: C.holyp,
  },
  meteor_rain: {
    name: 'Mưa Thiên Thạch', shape: 'nodes', art: 'meteor', aim: 'hero', r: 92, nr: 15,
    tell: 1.30, dur: 3.10, dmg: 30, ticks: [0, 0.24, 0.48, 0.72, 0.96, 1.20],
    shake: 2.6, range: 190, min: 40, cd: [6.4, 8.6], col: C.ember, hot: C.gold, boomv: 'big',
  },

  // ---- Vua Băng: four ways of saying "not there" ---------------------------------
  // It never wants to be next to you and has nothing for contact range, so its `keep` band is
  // wide and every move rewards reading a picture rather than reacting to a flash.
  frost_web: {
    name: 'Lưới Băng', shape: 'web', art: 'frost', aim: 'self',
    r: 78, r0: 10, n: 8, turns: 1.6, nr: 6, thick: 4.5,
    tell: 1.10, dur: 2.30, dmg: 26, ticks: [0, 0.42], shake: 2.2, range: 86,
    cd: [4.6, 6.4], col: C.ice, hot: C.pale,
  },
  sonic_tide: {
    name: 'Thủy Triều Âm', shape: 'waves', aim: 'dir', r: 118, arc: 0.60, nw: 3, band: 7,
    gap: 0.26, tell: 1.05, dur: 2.10, dmg: 30, shake: 2.8, range: 116, min: 30,
    sample: true, cd: [4.4, 6.2], col: C.cyan, hot: C.pale,
  },
  wind_blades: {
    name: 'Phong Nhận', shape: 'blades', aim: 'dir', nl: 3, spread: 0.30, r: 128, bend: 0.5,
    rad: 7, tell: 0.90, dur: 1.90, dmg: 28, shake: 1.8, range: 132, min: 34,
    sample: true, cd: [3.8, 5.4], col: C.steel, hot: C.pale,
  },
  // The one move in the game that moves the hero instead of asking him to move. Dash beats it.
  gravity_sink: {
    name: 'Hố Trọng Lực', shape: 'spiral', dir: 'in', pull: 52, aim: 'hero',
    r: 100, r0: 6, arms: 4, turns: 1.5, band: 8,
    tell: 1.30, dur: 2.40, dmg: 42, shake: 4.0, range: 130, sample: true,
    cd: [6.0, 8.0], col: C.deep, hot: C.cyan, boomv: 'big',
  },

  // ---- Sứ Giả Hư Không: three of its four are marks, not throws --------------------
  // The fastest and frailest of the three, and the only one whose kit punishes *habits*: a
  // sigil around where you stood, an echo of the path you walked, a spiral you leave by
  // standing still in the middle of it.
  death_spiral: {
    name: 'Vòng Xoáy Tử', shape: 'spiral', dir: 'out', aim: 'self',
    r: 90, r0: 6, arms: 3, turns: 1.25, band: 8,
    tell: 1.10, dur: 2.10, dmg: 38, shake: 3.2, range: 92, sample: true,
    cd: [4.8, 6.6], col: C.voidc, hot: C.lilac,
  },
  blood_sigil: {
    name: 'Huyết Ấn', shape: 'web', art: 'blood', aim: 'hero', r: 66, n: 5, skip: 2, nr: 8,
    thick: 5, tell: 1.15, dur: 2.00, dmg: 50, ticks: [0, 0.40], shake: 3.4, range: 150, min: 26,
    cd: [5.2, 7.2], col: C.blood, hot: C.blush,
  },
  delayed_echo: {
    name: 'Dư Ảnh Trễ', shape: 'echo', aim: 'self', r: 11,
    tell: 1.20, dur: 2.30, dmg: 34, shake: 1.6, range: 170,
    sample: true, cd: [4.6, 6.4], col: C.vio, hot: C.viop,
  },
  chain_stomp: {
    name: 'Chấn Liên Hoàn', shape: 'spokes', aim: 'self', r: 84, r0: 22, n: 8, thick: 4.5,
    tell: 1.05, dur: 2.00, dmg: 36, ticks: [0, 0.26], shake: 4.2, range: 86,
    cd: [4.8, 6.6], col: C.voidc, hot: C.volt, boomv: 'big',
  },
});
