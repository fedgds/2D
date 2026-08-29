"use strict";
// ===========================================================================
// 6b. Monster abilities. Every monster cast is two beats: a *telegraph* that names the
//     ground it is about to hit, and then the hit. The warning is drawn by one routine
//     per shape rather than one per ability, so all six monsters speak the same visual
//     language and a move you have never seen is still readable the first time:
//
//       * the area appears at full size on the first frame -- it never grows *into* you,
//         because a zone you can be caught by while it expands is not a warning;
//       * a hard red outline says where the edge is, the ability's own colour tints the
//         inside so a poison pool still looks like poison;
//       * one bright edge sweeps from the middle out to that outline: how far it has got
//         is how much time is left, which is a clock you read without looking away;
//       * the last fifth flickers, and a dry tick plays 0.20 s before impact.
//
//     Geometry lives in an *unsquashed* frame (world y divided by GSQ) so one metric
//     covers discs, cones and lances; drawing squashes it back by the same factor. That
//     is the whole trick behind "what is marked is what hurts".
// ===========================================================================
const GSQ = 0.50;                    // ground-ellipse squash, shared by the art and the hit test
const HERO_R = 4.0;                  // the hero's hurt radius in that unsquashed frame
// How long a boss holds its release pose after the hit lands. A monster's wind-up ends the
// instant the floor goes off, which is right for 0.8 s of glow; a 1.3 s authored slam that
// disappears on the frame of impact reads as the boss teleporting back to its idle.
const REL_HOLD = 0.42;
// One warning colour for every monster, on purpose: the tint inside the shape carries the
// flavour, the red edge carries the meaning. Two abilities that both mean "leave" must not
// need two lessons.
const WARN = hexc('#ff5a4a'), WARN_H = hexc('#ffe1a8');

const FOE_ABIL = {
  // `range`/`min` are the band the caster will open from, and they are kept inside the
  // shape's own reach: a slime that starts a 30 px burst from 44 px away has warned you
  // about a patch of floor you were never standing on.
  acid_burst: {
    name: 'Bọt Axit', shape: 'circle', aim: 'self', r: 30,
    tell: 0.80, dur: 1.35, dmg: 20, shake: 1.6, range: 34,
    cd: [3.6, 5.6], col: C.toxic, hot: C.toxicp,
  },
  soul_lash: {
    name: 'Roi Hồn', shape: 'cone', aim: 'dir', r: 58, arc: 0.60,
    tell: 0.62, dur: 1.10, dmg: 26, shake: 1.8, range: 52,
    cd: [3.2, 4.8], col: C.vio, hot: C.viop,
  },
  cleave: {
    name: 'Vung Tay', shape: 'cone', aim: 'dir', r: 46, arc: 0.85,
    tell: 0.72, dur: 1.15, dmg: 32, shake: 2.4, range: 42,
    cd: [3.4, 5.0], col: C.blood, hot: C.blush,
  },
  quake_slam: {
    name: 'Chấn Địa', shape: 'circle', aim: 'self', r: 50,
    tell: 1.10, dur: 1.75, dmg: 48, shake: 4.6, range: 46, min: 26,
    cd: [5.4, 7.6], col: C.ember, hot: C.gold, boomv: 'big',
  },
  // The only mark that is *not* centred on its caster: it lands where you are standing
  // when the spitter opens its mouth, so walking anywhere at all beats it.
  venom_pool: {
    name: 'Vũng Độc', shape: 'circle', aim: 'hero', r: 27, linger: true,
    tell: 1.00, dur: 2.40, dmg: 11, ticks: [0, 0.38, 0.76, 1.14],
    shake: 1.2, range: 150, min: 40, cd: [3.4, 5.2], col: C.toxic, hot: C.limeh,
  },
  // A bomber that has started cannot stop, and it dies either way: the move is not "dodge
  // this attack", it is "decide right now whether this thing gets to reach you".
  detonate: {
    name: 'Tự Nổ', shape: 'circle', aim: 'self', r: 44,
    tell: 1.25, dur: 1.70, dmg: 58, shake: 5.2, range: 32,
    cd: [9, 9], col: C.ember, hot: C.holyp, suicide: true, boomv: 'big',
  },
  pierce_beam: {
    name: 'Tia Xuyên', shape: 'line', aim: 'dir', len: 136, thick: 6,
    tell: 1.15, dur: 1.60, dmg: 40, shake: 2.8, range: 120, min: 26,
    cd: [4.0, 5.8], col: C.indigo, hot: C.indigop,
  },
};

// The squashed world endpoint of a lance, and the hero in a cast's unsquashed local frame.
function telEnd(e) {
  const A = e.ab;
  return { x: e.x + Math.cos(e.ang) * A.len, y: e.y + Math.sin(e.ang) * A.len * GSQ };
}
function heroLocal(w, e) {
  const h = w.hero;
  return { x: h.x - e.x, y: ((h.y - 1) - e.y) / GSQ };
}
function heroIn(w, e) {
  const A = e.ab, l = heroLocal(w, e);
  // The nine boss shapes own both halves of their own answer -- the marked region while the
  // clock runs, the moving hitbox afterwards -- because for a sweep or a wave those are not
  // the same region. Everything below this line is 6b's original three.
  const S = BOSS_SHAPE[A.shape];
  if (S) return S.hit(w, e, l);
  if (A.shape === 'line') {
    const px = Math.cos(e.ang) * A.len, py = Math.sin(e.ang) * A.len;
    const t = clamp((l.x * px + l.y * py) / Math.max(px * px + py * py, 1e-6), 0, 1);
    // 0.9 of the painted half-width: on the two shapes where the drawn thickness is in
    // screen space and the test is not, the player gets the benefit of the doubt.
    return Math.hypot(l.x - t * px, l.y - t * py) <= A.thick * 0.9 + HERO_R;
  }
  const d = Math.hypot(l.x, l.y);
  if (d > A.r + HERO_R) return false;
  if (A.r0 && d < A.r0 - HERO_R) return false;
  if (A.shape !== 'cone' || d < 2) return true;
  let da = Math.atan2(l.y, l.x) - e.ang;
  da = Math.abs(((da + Math.PI) % TAU + TAU) % TAU - Math.PI);
  // Widened by the angle the hero's own body subtends, the same way hitCone does it, so
  // clipping the very edge of a cone at contact range is not a coin flip.
  return da <= A.arc + Math.atan2(HERO_R, Math.max(d, 1));
}

// The hero's damage path. God mode still flashes, still plays the hit and still counts as
// a dodge failed -- the lab shows you exactly what would have landed, it just declines to
// subtract the HP.
//
// I-frames are checked *before* the flash, unlike god mode: a dash that beat the blast
// should look and sound like it beat the blast, and a white flash plus a hurt grunt would
// tell the player they were hit when the whole point is that they were not.
function hitHero(w, amount, col) {
  const h = w.hero;
  if (h.inv > 0) {
    w.dodges++;
    w.nums.push({ s: 'NÉ', x: Math.round(h.x - textW('NÉ') / 2),
                  y: Math.round(h.y - h.h - 6), col: C.pale, t: 0, life: 0.7 });
    SFX.dodge();
    return 0;
  }
  h.flash = Math.min(0.6, h.flash + 0.5);
  SFX.hurt();
  if (w.god) return 0;
  // A weapon that plants the hero pays him back in armour, and the window is exactly as long
  // as the commitment: `w.sw` is the live swing, so the guard opens on the frame the saber
  // starts and shuts on the frame it ends. Nothing here knows which weapon that is -- it
  // reads `guard` off whatever is swinging, so a second planted weapon needs no new code.
  if (w.sw && w.sw.wp.guard) amount *= w.sw.wp.guard;
  amount = Math.round(amount);
  h.hp = Math.max(0, h.hp - amount); w.taken += amount;
  const s = String(amount);
  w.nums.push({ s, x: Math.round(h.x - textW(s) / 2), y: Math.round(h.y - h.h - 6),
                col: col || WARN, t: 0, life: 0.9 });
  return amount;
}

function tryCast(w, f) {
  const list = KIND[f.kind].abil;
  if (!list || !list.length) return false;
  const h = w.hero, oy = f.y - 1;
  const d = Math.hypot(h.x - f.x, ((h.y - 1) - oy) / GSQ);
  // A boss picks at random among the moves that can reach; see 6c for why first-match down a
  // four-move list collapses to "always open with the longest reach".
  if (KIND[f.kind].boss) return bossCast(w, f, d);
  for (const key of list) {                 // listed longest reach first
    const A = FOE_ABIL[key];
    if (!A || d > A.range || d < (A.min || 0)) continue;
    return startCast(w, f, key);
  }
  return false;
}
function startCast(w, f, key) {
  const A = FOE_ABIL[key], h = w.hero, ox = f.x, oy = f.y - 1;
  const e = { ab: A, key: key, owner: f, seed: w.rng.int(1, 1e9) | 0,
              t: 0, p: 0, pt: 0, dur: A.dur, fired: false, tick: false, warned: 0, ticked: 0,
              x: ox, y: oy, ang: 0 };
  if (A.aim === 'hero') {
    e.x = clamp(h.x, BOUND.x0 - 10, BOUND.x1 + 10);
    e.y = clamp(h.y - 1, BOUND.y0 - 10, BOUND.y1 + 10);
  } else if (A.aim === 'dir') {
    e.ang = Math.atan2(((h.y - 1) - oy) / GSQ, h.x - ox);
  }
  // A boss shape may need state that only exists once the cast has a seed and a centre: which
  // way the blade turns, where six meteors will land, the hero's footprints so far.
  const S = BOSS_SHAPE[A.shape];
  if (S && S.init) S.init(w, e);
  w.tels.push(e);
  f.tel = e; f.chg = 0.001;
  // The recharge starts now, not when the cast lands, so `cd` reads as "how often" rather
  // than "how long after"; every entry above is comfortably longer than its own `dur`.
  f.acd = A.cd[0] + w.rng() * (A.cd[1] - A.cd[0]);
  f.flip = h.x < f.x;
  SFX.warn(A.shape, clamp((e.x - w.cam.x - W * 0.5) / (W * 0.5), -1, 1));
  return true;
}

function stepTel(w, e, dt, i) {
  const A = e.ab, o = e.owner;
  // Killing, freezing or otherwise stopping the caster cancels the move outright. A
  // warning you can switch off is worth far more than one you can only run from, and it
  // is what makes the freeze and stun skills feel like answers instead of damage.
  if (!e.fired && o && (o.dying || o.hp <= 0 || o.frozen > 0)) {
    if (o.tel === e) { o.tel = null; o.chg = 0; o.acd = Math.max(o.acd, 1.1); }
    w.tels.splice(i, 1);
    return;
  }
  e.pt = e.p; e.t += dt; e.p = c01(e.t / e.dur);
  const S = BOSS_SHAPE[A.shape];
  if (S && S.step) S.step(w, e, dt);
  const pan = clamp((e.x - w.cam.x - W * 0.5) / (W * 0.5), -1, 1);
  // Boss strings and staggered impacts need a countdown for every beat. One dry tick before
  // the first meteor and silence before the other five made the first circle feel dangerous
  // and the rest feel decorative. Normal attacks keep the old single cue.
  const beats = A.ticks || [0];
  if (S && beats.length > 1) {
    while (e.warned < beats.length && e.t >= A.tell + beats[e.warned] - 0.18) {
      e.warned++; SFX.tick(pan);
    }
  } else if (!e.tick && e.t >= A.tell - 0.20) { e.tick = true; SFX.tick(pan); }
  if (!e.fired && e.t >= A.tell) {
    e.fired = true;
    if (o && o.tel === e) { o.tel = null; o.chg = 0; }
    // The release pose outlives the hit, which is the whole reason bosses read at a minute's
    // length: the slam is still on screen while the floor it caused is going off.
    if (o) o.rel = REL_HOLD;
    w.shake = Math.max(w.shake, A.shake || 0);
    SFX.boom(A.boomv || A.shape, pan);
    // The bomber goes with its own blast. Set straight to dying rather than routed through
    // `hurt`, which would credit the player with 110 damage it never dealt.
    if (A.suicide && o && !o.dying) { o.hp = 0; o.dying = 0.001; SFX.die(pan); }
  }
  if (e.fired) {
    // Five of the boss moves hurt on *contact* rather than on beats: a wave front you could
    // walk through between two `ticks[]` entries is a lie about the picture. Each of those
    // keeps its own ledger inside `hit`, so one front collects a given hero exactly once.
    if (A.sample) {
      if (heroIn(w, e)) hitHero(w, A.dmg, A.col);
    } else {
      // Most moves land once; a lingering pool keeps asking. `ticked` is an index rather
      // than a timer so a long frame can never swallow a tick.
      const ticks = beats;
      while (e.ticked < ticks.length && e.t >= A.tell + ticks[e.ticked]) {
        e.ticked++;
        // The release flash happens once, but a meteor shower, a biting lattice and a two-beat
        // stomp all contain real later impacts. Give those beats their own physical response.
        if (S && e.ticked > 1) {
          w.shake = Math.max(w.shake, (A.shake || 0) * 0.62);
          SFX.boom(A.boomv || A.shape, pan);
        }
        if (heroIn(w, e)) hitHero(w, A.dmg, A.col);
      }
    }
  } else if (heroIn(w, e)) w.danger++;
  if (e.t >= e.dur) {
    if (o && o.tel === e) { o.tel = null; o.chg = 0; }
    w.tels.splice(i, 1);
  }
}

// ---- the warning itself ----------------------------------------------------
function drawTellUnder(w, e) {
  const A = e.ab;
  if (e.fired) { drawBoomUnder(w, e); return; }
  const k = c01(e.t / A.tell);                       // how full the clock is
  const S = BOSS_SHAPE[A.shape];
  // Bosses enter the urgent half of their wind-up at 52% rather than 68%. A boss `tell` runs
  // 0.85-1.20 s, so the old ramp gave about a third of a second of "this is happening now" --
  // less than the reaction time it is asking for, and easy to miss entirely if you were reading
  // the previous move's afterglow. Just under half a second is enough to turn and walk.
  const urg = S ? (k > 0.52 ? (k - 0.52) / 0.48 : 0)
                : (k > 0.78 ? (k - 0.78) / 0.22 : 0);
  // Flicker on bosses swings the full way to zero at the end and beats twice as fast, so the last
  // fifth of the clock is a strobe rather than a shimmer. `eg` -- the hard-outline gain -- starts
  // dim and finishes brighter than white paint: the *edge* of the mark is the one thing that must
  // still be findable when two casts overlap on the same floor.
  const fl = S ? 0.70 + 0.30 * Math.sin(k * 72) * urg
               : 0.55 + 0.45 * Math.sin(k * 34) * urg;
  const eg = S ? 0.95 + 0.65 * urg : 0.5 + 0.5 * urg;
  if (S) { S.under(w, e, k, urg, fl, eg); bossTellAccent(e, k, urg, fl, eg); return; }
  if (A.shape === 'line') {
    const t2 = telEnd(e), sa = Math.atan2(t2.y - e.y, t2.x - e.x);
    const sl = Math.hypot(t2.x - e.x, t2.y - e.y);
    beam(e.x, e.y, sa, 0, sl, A.thick, A.thick, A.col, 0.20 + 0.10 * urg, 0.7, 0.25);
    for (const s of [1, -1]) {                       // the two hard edges of the lane
      const nx = -Math.sin(sa) * A.thick * s, ny = Math.cos(sa) * A.thick * s;
      line(e.x + nx, e.y + ny, t2.x + nx, t2.y + ny, 1.0, WARN, 0.50 * eg);
    }
    beam(e.x, e.y, sa, 0, Math.max(2, sl * k), A.thick * 0.45, A.thick * 0.45,
         WARN_H, 0.40 * fl, 1.2, 0.2);
    core(e.x + (t2.x - e.x) * k, e.y + (t2.y - e.y) * k, 3.4, WARN_H, 0.85 * fl);
    return;
  }
  if (A.shape === 'cone') {
    const sw = A.arc * 2;
    // One thick arc centred at half the reach fills the whole wedge in a single pass;
    // five nested thin ones cost five times as much and read exactly the same.
    arc(e.x, e.y, A.r * 0.55, e.ang, sw, A.r * 0.60, A.col, 0.17 + 0.09 * urg, GSQ, 0.8, 1.5);
    arc(e.x, e.y, A.r, e.ang, sw, 1.4, WARN, 0.55 * eg, GSQ, 1.4, 1.6);
    for (const s of [1, -1])
      line(e.x, e.y, e.x + Math.cos(e.ang + s * A.arc) * A.r,
           e.y + Math.sin(e.ang + s * A.arc) * A.r * GSQ, 1.0, WARN, 0.45 * eg);
    arc(e.x, e.y, Math.max(2, A.r * k), e.ang, sw, 1.9, WARN_H, 0.55 * fl, GSQ, 1.5, 1.6);
    return;
  }
  puddle(e.x, e.y, A.r, A.r * GSQ, A.col, 0.16 + 0.09 * urg, e.seed, 9, 1.4);
  if (A.r0) ring(e.x, e.y, A.r0, 1.2, WARN, 0.40 * eg, GSQ, 1.5);
  ring(e.x, e.y, A.r, 1.5, WARN, 0.55 * eg, GSQ, 1.5);
  dial(e.x, e.y, A.r, 12, WARN, 0.26 * eg, GSQ, 3, 1);
  ring(e.x, e.y, Math.max(1.5, A.r * k), 1.9, WARN_H, 0.55 * fl, GSQ, 1.6);
}

// The caster's half of the warning, drawn over the sprite: light gathering inside the
// body plus three marks closing in on it. This is the cue that survives when the floor
// mark is behind you, and the reason a charging monster is worth interrupting.
function drawTellMid(w, e) {
  const A = e.ab;
  if (e.fired) { drawBoomMid(w, e); return; }
  const o = e.owner;
  if (!o || o.dying) return;
  const k = c01(e.t / A.tell), cy = midY(o);
  const S = BOSS_SHAPE[A.shape], u0 = S ? 0.52 : 0.68;   // see drawTellUnder for why bosses differ
  const urg = k > u0 ? (k - u0) / (1 - u0) : 0;
  const fl = 0.72 + 0.28 * Math.sin(k * (S ? 72 : 40)) * urg;
  core(o.x, cy, 3 + 7 * k, A.col, 0.30 + 0.45 * k, 1.7);
  core(o.x, cy, 1.6 + 2.4 * k, WARN_H, 0.45 + 0.50 * k);
  if (k > 0.25)
    for (let i = 0; i < 3; i++) {
      const a0 = e.seed * 0.011 + i / 3 * TAU + k * 4.2, rr = 4 + 14 * (1 - k);
      chevron(o.x + Math.cos(a0) * rr, cy + Math.sin(a0) * rr * 0.7, a0, 4.2,
              WARN, 0.5 * k, 1.0, 0.8);
    }
  // Bosses keep the body glow -- a caster is a caster -- and add whatever their own move puts
  // in the air during the wind-up: meteors still falling, a pillar growing down out of the dark.
  if (S && S.mid) S.mid(w, e, k);
  if (S) bossTellCharge(w, e, k, urg, fl);
}

function drawBoomUnder(w, e) {
  const A = e.ab, span = Math.max(e.dur - A.tell, 1e-3);
  const q = c01((e.t - A.tell) / span), fd = fade(q, 0.25);
  const S = BOSS_SHAPE[A.shape];
  if (S) { S.boomUnder(w, e, q, fd); bossImpactUnder(e, q, fd); return; }
  if (A.shape === 'line') {
    const t2 = telEnd(e), sa = Math.atan2(t2.y - e.y, t2.x - e.x);
    const sl = Math.hypot(t2.x - e.x, t2.y - e.y);
    beam(e.x, e.y, sa, 0, sl, A.thick * 0.7, A.thick * 0.4, A.col, 0.34 * fd, 1.0, 0.3);
    cracks((e.x + t2.x) * 0.5, (e.y + t2.y) * 0.5, 7, 17, A.col, 0.30 * fd, e.seed, 0.5, 1.0);
    return;
  }
  if (A.shape === 'cone') {
    arc(e.x, e.y, A.r * 0.55, e.ang, A.arc * 2, A.r * 0.60, A.col, 0.26 * fd, GSQ, 0.9, 1.5);
    return;
  }
  // A lingering pool keeps its own footprint at full strength for as long as it can still
  // tick: it has stopped being a warning and started being terrain.
  const lin = A.linger ? 0.32 * (1 - q * 0.55) : 0.26 * fd;
  puddle(e.x, e.y, A.r * (A.linger ? 1 : 0.9 + 0.1 * q), A.r * GSQ, A.col, lin, e.seed, 9, 1.4);
  if (A.linger) ring(e.x, e.y, A.r, 1.3, A.hot, 0.30 * (1 - q * 0.6), GSQ, 1.5);
  else {
    cracks(e.x, e.y, 9, A.r * 0.8, A.col, 0.30 * fd, e.seed + 1, 0.45, 1.1);
    ring(e.x, e.y, A.r * (0.4 + 0.75 * eo(q)), 2.4, A.hot, 0.40 * fd, GSQ, 1.4);
  }
}

function drawBoomMid(w, e) {
  const A = e.ab, span = Math.max(e.dur - A.tell, 1e-3);
  const q = c01((e.t - A.tell) / span), fd = fade(q, 0.20), g = pop(q, 0.08);
  const S = BOSS_SHAPE[A.shape];
  if (S) {
    if (S.boomMid) S.boomMid(w, e, q, fd, g);
    bossImpactMid(e, q, fd, g);
    return;
  }
  if (A.shape === 'line') {
    const t2 = telEnd(e), sa = Math.atan2(t2.y - e.y, t2.x - e.x);
    const sl = Math.hypot(t2.x - e.x, t2.y - e.y);
    beam(e.x, e.y - 3, sa, 0, sl, A.thick * 0.55 * g, 0.8, A.hot, 1.0 * fd, 1.6, 0.35);
    beam(e.x, e.y - 3, sa, 0, sl, 1.3 * g, 0.4, WHITE, 0.9 * fd, 1.4, 0.4);
    core(t2.x, t2.y - 3, 8 * g, A.col, 0.8 * fd, 1.6);
    sparks(t2.x, t2.y - 3, 12, 2, 16 + 20 * eo(q), A.hot, 0.75 * fd, e.seed + 2,
           1.0, 0.8, 0, TAU, 5);
    return;
  }
  if (A.shape === 'cone') {
    for (let k = 0; k < 3; k++)
      arc(e.x, e.y - 4, A.r * (0.5 + 0.5 * eo(q)) - k * 3, e.ang,
          A.arc * 2 * (1 - k * 0.12), 3.2 - k * 0.8, k === 0 ? A.hot : A.col,
          (0.9 - k * 0.25) * fd, 0.62, 1.5, 2.2);
    core(e.x + Math.cos(e.ang) * A.r * 0.5, e.y - 4 + Math.sin(e.ang) * A.r * 0.5 * GSQ,
         7 * g, A.hot, 0.7 * fd, 1.6);
    return;
  }
  if (A.linger) {                                    // a pool, not a blast: it bubbles
    const rng = mulberry32(e.seed);
    cloud(e.x, e.y - 3, A.r * 0.7, A.col, 0.10 * (1 - q * 0.5), e.seed + 7, 7, 0.45);
    for (let i = 0; i < 6; i++) {
      const a0 = rng.range(0, TAU), rr = rng.range(0, A.r * 0.8);
      const ph = (q * 2.2 + i * 0.31) % 1;
      core(e.x + Math.cos(a0) * rr, e.y + Math.sin(a0) * rr * GSQ - 1 - 5 * ph,
           2.2 * (1 - ph), A.hot, 0.65 * (1 - ph));
    }
    return;
  }
  const cy = e.y - 5;
  core(e.x, cy, A.r * 0.5 * g * (1 - q * 0.4), A.col, 0.8 * fd, 1.7);
  core(e.x, cy, A.r * 0.2 * g, A.hot, 1.1 * fd);
  ring(e.x, cy, A.r * (0.3 + 0.95 * eo(q)), 3.0 * (1 - q * 0.6) + 0.6, A.hot, 0.7 * fd, 0.9, 1.4);
  star(e.x, cy, A.hot, 10, 4, A.r * (0.7 + 0.6 * eo(q)), 2.4, 0.6 * fd, e.seed);
  glare(e.x, cy, A.r * 1.4, A.r * 0.8, A.hot, 0.35 * fd);
  sparks(e.x, e.y - 2, 16, 6, A.r * (0.7 + 0.8 * eo(q)), A.hot, 0.7 * fd, e.seed + 3,
         1.0, 0.9, 0, TAU, 5 * (1 - q));
}

// Standing inside a mark that has not gone off yet: the hero gets a ring of his own and a
// chevron over his head. Six monsters can bury the floor under light, and the one thing
// that must never be lost in it is "you, right now, are in the wrong place".
function drawHeroWarn(w) {
  const h = w.hero, ph = (w.t * 7) % 1;
  ring(h.x, h.y - 1, 7 + 5 * ph, 1.5, WARN, 0.55 * (1 - ph), GSQ, 1.5);
  ring(h.x, h.y - 1, 9.5, 1.2, WARN, 0.30 + 0.25 * Math.sin(w.t * 22), GSQ, 1.6);
  chevron(h.x, h.y - h.h - 6, Math.PI / 2, 5, WARN_H,
          0.55 + 0.35 * Math.sin(w.t * 20), 1.2, 0.7);
  veil(WARN, Math.min(0.016, 0.006 * w.danger));
}
