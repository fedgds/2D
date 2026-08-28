"use strict";
// ===========================================================================
// 4. World: hero, dummy enemies, damage numbers, active effects.
//    (x, y) for every unit is (centre column, floor line) like scene.Actor, so the
//    sprite's feet are the sort key and the shadow anchor.
// ===========================================================================
const BOUND = { x0: 26, x1: WW - 26, y0: 40, y1: WH - 26 };
// `cyc` is how many world pixels one animation frame lasts, so the cycle is driven by
// distance covered rather than by time: a slime at 17 px/s hopping on the same 4.2 px cadence
// as the wraith took a full second per hop and read as gliding.
// `abil` lists the monster's telegraphed moves (see section 6b) longest reach first, so a
// brute that still has room quakes and only swipes once you are inside its arms. `keep` is
// the distance a ranged monster tries to hold: without it a spitter walks into your sword
// and its warning circle never has time to be read.
const KIND = {
  slime:    { hp: 90,  spd: 17, mass: 1.0, cyc: 2.0, label: 'Nhớt Xanh',
              abil: ['acid_burst'] },
  wraith:   { hp: 130, spd: 27, mass: 0.8, cyc: 4.2, label: 'Oan Hồn',
              abil: ['soul_lash'] },
  brute:    { hp: 320, spd: 11, mass: 2.2, cyc: 2.6, label: 'Đại Lực',
              abil: ['quake_slam', 'cleave'] },
  spitter:  { hp: 150, spd: 21, mass: 0.9, cyc: 2.4, label: 'Nhện Độc',
              keep: 84, abil: ['venom_pool'] },
  bomber:   { hp: 110, spd: 31, mass: 0.7, cyc: 2.2, label: 'Bọ Nổ',
              abil: ['detonate'] },
  sentinel: { hp: 260, spd: 8,  mass: 2.6, cyc: 3.4, label: 'Mắt Canh',
              keep: 108, abil: ['pierce_beam'] },
};
// Spawn weights, not an even roll: the two heavies and the suicide bomber are rare
// enough that meeting one is an event, and the slime is still the crowd.
const SPAWN_W = [['slime', 24], ['wraith', 18], ['spitter', 16],
                 ['bomber', 13], ['brute', 12], ['sentinel', 9]];
const SPAWN_TOT = SPAWN_W.reduce((s, r) => s + r[1], 0);
function pickKind(rng) {
  let r = rng() * SPAWN_TOT;
  for (let i = 0; i < SPAWN_W.length; i++) { r -= SPAWN_W[i][1]; if (r <= 0) return SPAWN_W[i][0]; }
  return 'slime';
}

function unit(kind, x, y) {
  const g = GRIDS[kind], k = KIND[kind];
  return { kind, x, y, w: g[0].length, h: g.length, vx: 0, vy: 0,
           hp: k.hp, maxhp: k.hp, spd: k.spd, mass: k.mass,
           flash: 0, flip: false, dim: 1, slow: 0, frozen: 0, dying: 0,
           // Casting state. `acd` is staggered from the spawn position instead of from a
           // random draw, so two monsters that walk in together do not wind up in lockstep.
           tel: null, chg: 0, acd: 1.1 + (Math.abs((x * 31 + y * 17) | 0) % 240) / 100,
           ph: (Math.abs(x * 7 + y * 13) % 400) / 100, mv: 0 };
}
const midY = f => f.y - f.h * 0.5;

// The view is centred on the hero and clamped to the world, and it is the *integer*
// camera that everything draws against, so the shell has to ask for it the same way
// renderWorld does -- otherwise the mouse would aim half a pixel off the picture.
function camTarget(w) { return { x: w.hero.x - W * 0.5, y: (w.hero.y - 6) - H * 0.5 }; }
function camInt(w) {
  return { x: clamp(Math.round(w.cam.x), 0, WW - W), y: clamp(Math.round(w.cam.y), 0, WH - H) };
}
function snapCam(w) {
  const t = camTarget(w);
  w.cam.x = clamp(t.x, 0, WW - W); w.cam.y = clamp(t.y, 0, WH - H);
}

// A run is defined by its loadout: one weapon and three of the sixteen skills. `slots`
// holds *global* skill indices, so `w.cds` stays the full 16-entry table (a skill you
// left at home still has a cooldown slot -- simpler than remapping indices everywhere)
// and the hotbar just reads the three it was told to show.
function newWorld(seed, loadout) {
  const s = seed || 20260827;
  const lo = loadout || {};
  // The picker applies the arena the moment it is clicked, so this is normally a no-op.
  // It is here for the callers that are not the picker -- LAB, and anything that hands a
  // loadout straight to newWorld -- so a run can never open on the wrong floor.
  if (lo.map && MAP_BY_ID[lo.map] && MAPDEF !== MAP_BY_ID[lo.map]) applyMap(lo.map);
  const w = {
    t: 0, frame: 0, rng: mulberry32(s), crng: mulberry32((s ^ 0x5bf03) >>> 0),
    shake: 0, spawnT: 0,
    hero: { x: WW * 0.5, y: WH * 0.5, w: 11, h: 14, vx: 0, vy: 0, flash: 0, flip: false,
            hp: 400, maxhp: 400, glow: 0.5, ph: 0, it: 0, mv: 0, fi: 0, atk: -1,
            dsh: 0, dvx: 0, dvy: 0, inv: 0 },
    cam: { x: 0, y: 0 }, props: PROPS, puffs: [], amb: [],
    foes: [], fxs: [], tels: [], nums: [], aim: { x: 0, y: 0 },
    kills: 0, dmg: 0, taken: 0, dodges: 0, danger: 0, god: true, cds: new Float32Array(16),
    wp: (typeof lo.wp === 'string' ? WEAPON_BY_ID[lo.wp] : lo.wp) || WEAPONS[0],
    slots: (lo.slots && lo.slots.length === 3 ? lo.slots.slice() : [0, 1, 2]),
    wcd: 0, dcd: 0, sw: null,
  };
  snapCam(w);
  w.aim.x = w.hero.x + 60; w.aim.y = w.hero.y - 20;
  for (let i = 0; i < 7; i++) spawnFoe(w, true);
  return w;
}

// The world is 8x8 screens, so spawning on a world edge would mean nothing ever arrives.
// Fresh targets appear on an ellipse just outside the viewport instead: they walk in
// from off screen, which is also the only spawn that cannot pop into view.
function spawnFoe(w, near) {
  if (w.foes.length >= 14) return;
  const kind = pickKind(w.rng);
  const h = w.hero, ang = w.rng.range(0, TAU);
  const rad = near ? w.rng.range(0.22, 0.42) : w.rng.range(0.62, 0.95);
  const x = clamp(h.x + Math.cos(ang) * W * rad, BOUND.x0, BOUND.x1);
  const y = clamp(h.y + Math.sin(ang) * H * rad, BOUND.y0, BOUND.y1);
  // never drop a fresh target on top of the player
  if (Math.hypot(x - h.x, y - h.y) < 46) return;
  w.foes.push(unit(kind, x, y));
}

// Enemy flash is capped at 0.55: above that a hit enemy is just a white blob and you
// cannot tell what you hit. Poison/freeze use `dim` instead of flash for the same reason.
function hurt(w, f, amount, col, crit, kx, ky) {
  if (f.dying) return;
  amount = Math.round(amount);
  f.hp -= amount;
  f.flash = Math.min(0.55, f.flash + 0.45);
  if (kx || ky) { f.vx += (kx || 0) / f.mass; f.vy += (ky || 0) / f.mass; }
  const s = String(amount) + (crit ? '!' : '');
  w.nums.push({ s, x: Math.round(f.x - textW(s) / 2), y: Math.round(f.y - f.h - 5),
                col: col || hexc('#ffd98a'), t: 0, life: crit ? 1.0 : 0.8 });
  w.dmg += amount;
  // Sound is placed here rather than at the call sites so every one of the 16 skills,
  // and every tick of a damage-over-time field, is heard the same way.
  const pan = clamp((f.x - w.cam.x - W * 0.5) / (W * 0.5), -1, 1);
  if (f.hp <= 0) { f.hp = 0; f.dying = 0.001; SFX.die(pan); }
  else SFX.hit(amount, crit, pan);
}

function foesIn(w, x, y, r) {
  const out = [];
  for (const f of w.foes) {
    if (f.dying) continue;
    const dx = f.x - x, dy = midY(f) - y;
    if (Math.hypot(dx, dy) <= r + f.w * 0.35) out.push(f);
  }
  return out;
}

function hitCircle(w, x, y, r, amount, col, crit, kb) {
  const list = foesIn(w, x, y, r);
  for (const f of list) {
    const a = Math.atan2(midY(f) - y, f.x - x);
    hurt(w, f, amount, col, crit, Math.cos(a) * (kb || 0), Math.sin(a) * (kb || 0) * 0.5);
  }
  return list.length;
}

function hitLine(w, x0, y0, x1, y1, thick, amount, col, crit, kb) {
  const px = x1 - x0, py = y1 - y0, ln2 = Math.max(px * px + py * py, 1e-6);
  const ang = Math.atan2(py, px);
  for (const f of w.foes) {
    if (f.dying) continue;
    const t = clamp(((f.x - x0) * px + (midY(f) - y0) * py) / ln2, 0, 1);
    const dx = f.x - x0 - t * px, dy = midY(f) - y0 - t * py;
    if (Math.hypot(dx, dy) <= thick + f.w * 0.35)
      hurt(w, f, amount, col, crit, Math.cos(ang) * (kb || 0), Math.sin(ang) * (kb || 0) * 0.5);
  }
}

// Fires once when progress crosses `at`, so a hit lands on the frame the VFX peaks
// even if the frame rate changes underneath it.
// Cone in front of `ang`, measured from the hero. `arc_` is the half-width tolerance, the
// same convention test.html uses (`|diff| > arc` rejects), which is deliberately more
// forgiving than the crescent looks -- a swing that visibly passes through something has
// to hurt it. Angles use the unsquashed frame (dy / SWING_SQ) so a hit sideways and a hit
// downwards need the same aim, matching how `arc()` decides which pixels it lights.
function hitCone(w, x, y, ang, range, arc_, amount, col, crit, kb) {
  let n = 0;
  for (const f of w.foes) {
    if (f.dying) continue;
    const dx = f.x - x, dy = (midY(f) - y) / SWING_SQ;
    const d = Math.hypot(dx, dy);
    if (d > range + f.w * 0.35) continue;
    if (d > 1e-3) {
      let da = Math.atan2(dy, dx) - ang;
      da = Math.abs(((da + Math.PI) % TAU + TAU) % TAU - Math.PI);
      // Close in, a fixed cone would miss a foe standing on top of you; widen it by the
      // angle its own body subtends so contact range never feels like a whiff.
      if (da > arc_ + Math.atan2(f.w * 0.5, Math.max(d, 1))) continue;
    }
    const a = Math.atan2(midY(f) - y, f.x - x);
    hurt(w, f, amount, col, crit, Math.cos(a) * (kb || 0), Math.sin(a) * (kb || 0) * 0.5);
    n++;
  }
  return n;
}

function crossed(e, at) { return e.pt < at && e.p >= at; }
function cast(w, i, tx, ty) {
  const sk = SKILLS[i];
  if (!sk || w.cds[i] > 0) return false;
  const h = w.hero;
  const e = { sk: sk, i: i, t: 0, dur: sk.dur, p: 0, pt: 0,
              seed: w.rng.int(1, 1e9) | 0, ox: h.x, oy: h.y - h.h * 0.5, data: {} };
  if (sk.mode === 'self') { e.x = h.x; e.y = h.y; }
  else { e.x = clamp(tx, BOUND.x0 - 18, BOUND.x1 + 18);
         e.y = clamp(ty, BOUND.y0 - 16, BOUND.y1 + 10); }
  e.ang = Math.atan2(e.y - h.h * 0.5 - e.oy, e.x - e.ox);
  if (sk.init) sk.init(w, e);
  w.fxs.push(e);
  w.cds[i] = sk.cd;
  w.shake = Math.max(w.shake, sk.shake || 0);
  h.flip = e.x < h.x;
  return true;
}

function step(w, dt, inp) {
  w.t += dt; w.frame++;
  const h = w.hero;
  let moved = 0;
  if (inp) { w.aim.x = inp.ax; w.aim.y = inp.ay; }
  if (h.dsh > 0) {
    // A dash owns the hero while it runs: WASD is read but not obeyed, and the clamp is
    // the same one walking uses, so a dash into the wall stops at the wall instead of
    // teleporting through it. `moved` stays 0 -- the legs hold the launch pose rather
    // than sprinting through four frames of walk cycle in a sixth of a second.
    const s = Math.min(dt, h.dsh);
    h.x = clamp(h.x + h.dvx * s, BOUND.x0, BOUND.x1);
    h.y = clamp(h.y + h.dvy * s, BOUND.y0, BOUND.y1);
    h.dsh -= dt;
    if (w.crng() < 22 * dt) footPuff(w, h, true);
  } else if (inp) {
    let dx = inp.dx, dy = inp.dy;
    const l = Math.hypot(dx, dy);
    if (l > 0) {
      dx /= l; dy /= l;
      const px = h.x, py = h.y;
      h.x = clamp(h.x + dx * 56 * dt, BOUND.x0, BOUND.x1);
      h.y = clamp(h.y + dy * 42 * dt, BOUND.y0, BOUND.y1);
      moved = Math.hypot(h.x - px, h.y - py);
    }
  }
  if (inp) h.flip = w.aim.x < h.x;
  // The walk cycle is driven by distance covered, not by time: at a wall the hero
  // stops moving and the legs stop with him instead of running on the spot.
  h.mv = moved > 1e-6 ? 1 : 0;
  if (h.mv) {
    h.it = 0;
    const was = Math.floor(h.ph);
    h.ph = (h.ph + moved / 5.5) % 4;
    if (Math.floor(h.ph) !== was) footPuff(w, h);
  } else { h.it += dt; }
  h.fi = h.mv ? Math.floor(h.ph) & 3 : Math.floor(h.it * 1.7) & 1;
  h.flash = Math.max(0, h.flash - dt * 3);
  if (h.inv > 0) h.inv = Math.max(0, h.inv - dt);
  for (let i = 0; i < 16; i++) if (w.cds[i] > 0) w.cds[i] = Math.max(0, w.cds[i] - dt);
  if (w.wcd > 0) w.wcd = Math.max(0, w.wcd - dt);
  if (w.dcd > 0) w.dcd = Math.max(0, w.dcd - dt);

  for (const e of w.fxs) {
    e.pt = e.p; e.t += dt; e.p = c01(e.t / e.dur);
    if (e.sk.hit) e.sk.hit(w, e);
  }
  for (let i = w.fxs.length - 1; i >= 0; i--) if (w.fxs[i].t >= w.fxs[i].dur) w.fxs.splice(i, 1);
  // Monster casts advance before the monsters do, so a telegraph that has just fired
  // hits the hero where he was standing this frame and not one frame of movement later.
  // `danger` is recounted from scratch every frame -- it is what the hero's own warning
  // ring and the HUD read, and a stale count would leave a ring on screen forever.
  w.danger = 0;
  for (let i = w.tels.length - 1; i >= 0; i--) stepTel(w, w.tels[i], dt, i);
  // The live swing, cached for the frame: the held weapon and the hero's attack pose both
  // need it, and neither wants to walk `fxs` looking for the one entry that has a weapon.
  // Gauntlets recover (0.46s) just before their sheet ends (0.47s), so two can briefly
  // overlap -- the newest wins, which is the one the player just asked for.
  w.sw = null;
  for (const e of w.fxs) if (e.wp) w.sw = e;
  h.atk = w.sw ? heldPose(w.sw.wp, w.sw.p).t : -1;

  for (let i = w.foes.length - 1; i >= 0; i--) {
    const f = w.foes[i];
    f.flash = Math.max(0, f.flash - dt * 2.6);
    if (f.slow > 0) f.slow -= dt;
    if (f.frozen > 0) f.frozen -= dt;
    if (f.dying) {
      f.dying += dt;
      if (f.dying > 0.30) { w.foes.splice(i, 1); w.kills++; }
      continue;
    }
    stepFoe(w, f, dt);
  }
  for (let i = w.nums.length - 1; i >= 0; i--) {
    const n = w.nums[i];
    n.t += dt; n.y -= dt * 13;
    if (n.t >= n.life) w.nums.splice(i, 1);
  }
  for (let i = w.puffs.length - 1; i >= 0; i--) {
    const p = w.puffs[i];
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += dt * 6;
    if (p.t >= p.life) w.puffs.splice(i, 1);
  }
  w.spawnT -= dt;
  if (w.spawnT <= 0) { spawnFoe(w); w.spawnT = 1.05; }
  w.shake = Math.max(0, w.shake - dt * 22);
  // Weather. Stepped on the cosmetic stream and around the *current* camera, before the
  // camera moves below -- one frame of lag on a snowflake is not a thing anyone can see,
  // and doing it here keeps the particle list out of the seeded sim entirely.
  if (MAPDEF.ambStep) MAPDEF.ambStep(ambArg(w, dt));

  // Camera last, so it follows where the hero actually ended up. Exponential lerp
  // (frame-rate independent) with a clamp, so the view never leaves the world.
  const ct = camTarget(w), k = 1 - Math.exp(-dt * 11);
  w.cam.x = clamp(w.cam.x + (ct.x - w.cam.x) * k, 0, WW - W);
  w.cam.y = clamp(w.cam.y + (ct.y - w.cam.y) * k, 0, WH - H);
}
// Footfall dust: 20 particles maximum, on the cosmetic RNG stream so it can never
// shift a seeded outcome. `quiet` is the dash trail -- same dust, no footstep voice,
// because a slide is one sound and not three steps.
function footPuff(w, h, quiet) {
  if (!quiet) SFX.step();
  if (w.puffs.length >= 20) return;
  w.puffs.push({ x: h.x + w.crng.range(-3, 3), y: h.y - w.crng.range(0, 1.4),
                 vx: w.crng.range(-7, 7), vy: w.crng.range(-9, -3),
                 t: 0, life: w.crng.range(0.20, 0.34), r: w.crng.range(0.7, 1.5) });
}
function stepFoe(w, f, dt) {
  const h = w.hero;
  const K = KIND[f.kind];
  if (f.acd > 0) f.acd = Math.max(0, f.acd - dt);
  if (!f.tel && f.acd <= 0 && f.frozen <= 0) tryCast(w, f);
  // A monster winding up is planted: the mark on the floor is a promise about where the
  // hit lands, and a caster that kept walking would break it. Knockback still moves it,
  // which is why hitting a caster is worth doing -- it can be shoved out of its own blast.
  const casting = !!f.tel;
  f.chg = casting ? c01(f.tel.t / f.tel.ab.tell) : Math.max(0, f.chg - dt * 5);
  let ax = 0, ay = 0;
  if (f.frozen <= 0 && !casting) {
    const dx = h.x - f.x, dy = (h.y - 1) - f.y, d = Math.max(Math.hypot(dx, dy), 1e-3);
    const spd = f.spd * (f.slow > 0 ? 0.34 : 1);
    // Ranged kinds hold a band instead of closing: outside it they advance, inside it
    // they back off, and in the band they stand and shoot.
    let want = 1;
    if (K.keep) want = d > K.keep * 1.15 ? 1 : (d < K.keep * 0.78 ? -1 : 0);
    ax = dx / d * spd * want; ay = dy / d * spd * 0.72 * want;
    f.flip = dx < 0;
    for (const o of w.foes) {              // light separation so they do not stack
      if (o === f || o.dying) continue;
      const ox = f.x - o.x, oy = (f.y - o.y) * 1.6, od = Math.hypot(ox, oy);
      if (od < 9 && od > 1e-3) { ax += ox / od * 14; ay += oy / od * 9; }
    }
  }
  const px = f.x, py = f.y;
  f.x = clamp(f.x + (ax + f.vx) * dt, BOUND.x0, BOUND.x1);
  f.y = clamp(f.y + (ay + f.vy) * dt, BOUND.y0, BOUND.y1);
  const k = Math.exp(-dt * 7);
  f.vx *= k; f.vy *= k;
  // Same rule as the hero: cycle speed comes from ground covered. A frozen or
  // separated-but-stuck foe idles instead of pedalling, and so does one mid-cast --
  // knockback drift must not make a planted monster look like it is walking.
  const d = Math.hypot(f.x - px, f.y - py);
  f.mv = (f.frozen > 0 || casting) ? 0 : d / Math.max(dt, 1e-4);
  f.ph = (f.ph + (f.mv > 0.4 ? d / K.cyc : dt * 1.6)) % 4;
  // Contact damage is a drain, not a hit, so it does not go through hitHero -- but the
  // dash's i-frames still have to cover it, or dashing *through* a pack would cost more
  // than walking around it and the dodge would be a trap.
  if (!w.god && f.frozen <= 0 && h.inv <= 0) {
    if (Math.hypot(f.x - h.x, (f.y - h.y) * 1.5) < 9) {
      h.hp = Math.max(0, h.hp - 22 * dt);
      h.flash = Math.min(0.6, h.flash + dt * 3);
      SFX.hurt();
    }
  }
}

function pullToward(w, x, y, r, force, dt) {
  for (const f of w.foes) {
    if (f.dying || f.frozen > 0) continue;
    const dx = x - f.x, dy = y - midY(f), d = Math.hypot(dx, dy);
    if (d > r || d < 1e-3) continue;
    const g = force * (1 - d / r) * dt;
    f.x += dx / d * g / f.mass;
    f.y += dy / d * g * 0.6 / f.mass;
  }
}

// Nearest n living foes to a point -- chain/ricochet targeting.
function nearest(w, x, y, n, maxr) {
  const list = w.foes.filter(f => !f.dying &&
      Math.hypot(f.x - x, midY(f) - y) <= (maxr || 1e9));
  list.sort((a, b) => Math.hypot(a.x - x, midY(a) - y) - Math.hypot(b.x - x, midY(b) - y));
  return list.slice(0, n);
}
