"use strict";
// ===========================================================================
// 3d. Weapons: the basic attack. Unlike the 16 skills -- which are drawn entirely
//     from the additive primitives above -- a swing plays a 16-frame painted sheet
//     from disk (the sets in kiem-frames/ ... gang-frames/, same art and the same
//     hitFrames/arc/travel tuning as test.html). The frames cannot be blitted with
//     drawImage because this renderer never touches a 2D context until the frame is
//     resolved, so each PNG is baked *once* into a small premultiplied float bitmap
//     and stamped into `buf` with an inverse-rotation sampler. That keeps the swing
//     inside the same HDR -> tonemap -> dither path as everything else, and it keeps
//     the sim headless: without a DOM nothing is baked and `drawSwing` falls back to
//     a procedural crescent, so the node harness still runs.
// ===========================================================================
const SPRITE_UP = -Math.PI / 2;                 // the painted sets all point up
// Vertical squash for anything drawn standing in the world: the camera is a 3/4 view,
// so a swing that is round on screen reads as lying flat on the floor. 0.72 is between
// the ground rings (0.34) and the mid-height crescents (0.62) the skills already use.
const SWING_SQ = 0.72;
// The held weapon is *matter*, so it is pixel art like the hero and not additive light.
// Each grid points up in its own frame (`SPRITE_UP`) and is rotated to wherever the hero
// aims; `hold.pv` is the cell the hand grips, which is the cell the rotation turns about.
// They are deliberately as long as the hero is tall -- test.html's held art is 55px against
// a 57px hero, and anything shorter reads as a knife at this scale.
const HELD = {
  kiem: [
    "...#...", "..+#+..", "..+#+..", "..+#+..", "..+#+..", "..+#+..",
    "..+#+..", "..+#+..", "..+#+..", "..+#+..", "..+#+..", "-#####-",
    "...=...", "...=...", "...=...", "...-...",
  ],
  // Single edge and a belly: the blade thickens on the left and the spine stays straight,
  // which is the whole reason a saber reads differently from a sword at 7px wide.
  dao: [
    "....#..", "...+#..", "...+#..", "..+#+..", "..+#+..", ".++#+..",
    ".++#+..", ".++#+..", ".++#...", "..+#...", "..+#...", "..-=-..",
    "...=...", "...=...", "...-...",
  ],
  // Limbs curve in toward the hero so the tips point at the target, the string closes them
  // across the grip, and the arrow runs up the middle -- a bow seen from above.
  cung: [
    "....#....", "...+#+...", "....#....", "....#....", "+.......+",
    ".+..#..+.", "..+.#.+..", "..+===+..", "....=....", "....-....",
  ],
  luoi_hai: [
    ".######..", "#+....=..", "#-....=..", "......=..", "......=..",
    "......=..", "......=..", "......=..", "......=..", "......=..",
    "......=..", "......=..", "......=..", "......-..",
  ],
  gang: [
    ".###.", "#+++#", "#+++#", "#+++#", ".#-#.", "..=..", "..-..",
  ],
};
const HELD_HAFT = hexc('#3a3244'), HELD_DARK = hexc('#141a28');
// Mild squash only: the hero sprite is unsquashed pixel art, so flattening the weapon to
// the 0.72 the swing arc uses would make it look like it belongs to a different character.
const HELD_SQ = 0.9;
const WEAPONS = [
  {
    id: 'kiem', name: 'Kiếm', label: 'KIẾM', skill: 'SEPHIRIA SLASH', art: 'assets/images/skills/kiem-frames',
    desc: 'cân bằng · 4 nhịp', col: hexc('#bcd8ff'), gain: 2.1,
    fps: 30, hits: [3, 6, 10, 13], dmg: 9, range: 44, arc: 1.50,
    size: 90, axis: SPRITE_UP, reach: 12, travel: 0, push: 20, cd: 0.55, shake: 1.1,
    hold: { art: 'kiem', pv: [3, 13], sweep: 1.45, ext: 4.5, rest: -0.80 },
  },
  {
    id: 'dao', name: 'Đao', label: 'ĐAO', skill: 'MOON TIDE', art: 'assets/images/skills/dao-frames',
    desc: 'nặng · 3 nhịp', col: hexc('#baf7ff'), gain: 2.0,
    fps: 32, hits: [4, 8, 12], dmg: 14, range: 43, arc: 1.55,
    size: 94, axis: -0.072, reach: 11, travel: 6, push: 16, cd: 0.60, shake: 1.3,
    hold: { art: 'dao', pv: [3, 12], sweep: 1.65, ext: 4.0, rest: -0.95 },
    // These sheets are trimmed to their painted bounds, so the frames differ in size.
    // frameBox scales them all against one shared box and the pivots keep the swing
    // centre still instead of sliding sideways as the crescent grows.
    frameBox: 303,
    pivots: [
      [.5126, .4259], [.5052, .4521], [.5370, .5147], [.4851, .5067],
      [.4700, .5075], [.5361, .4894], [.4758, .4756], [.5438, .4894],
      [.4757, .4944], [.4779, .4912], [.4753, .5278], [.5022, .5112],
      [.5440, .5181], [.4687, .5001], [.4294, .5098], [.5709, .4981],
    ],
  },
  {
    id: 'cung', name: 'Cung', label: 'CUNG', skill: 'CELESTIAL ARROW', art: 'assets/images/skills/cung-frames',
    desc: 'tầm xa · 1 nhịp', col: hexc('#d9fdff'), gain: 2.0,
    fps: 28, hits: [8], dmg: 34, range: 135, arc: 0.34,
    size: 78, axis: 0.515, reach: 13, travel: 72, push: 26, cd: 0.70, shake: 1.0,
    // A bow does not slash: it draws back and springs forward, so the sweep is tiny and
    // almost all of the motion is the grip pushing out on release.
    hold: { art: 'cung', pv: [4, 8], sweep: 0.30, ext: 3.2, rest: -0.10 },
    anchor: 'cast',                             // an arrow leaves the bow and keeps going
    frameBox: 338,
    pivots: [
      [.5646, .5886], [.4256, .4809], [.4004, .5667], [.3104, .5920],
      [.5477, .5349], [.5277, .5470], [.3802, .5261], [.3527, .5277],
      [.5930, .4610], [.4992, .4915], [.4562, .5054], [.4144, .5171],
      [.5464, .3693], [.4505, .3790], [.4142, .4012], [.3634, .4033],
    ],
  },
  {
    id: 'luoi-hai', name: 'Lưỡi Hái', label: 'LƯỠI HÁI', skill: 'REAPER SURGE', art: 'assets/images/skills/luoi-hai-frames',
    desc: 'quét rộng · 3 nhịp', col: hexc('#bdf9ff'), gain: 1.95,
    fps: 26, hits: [4, 9, 13], dmg: 13, range: 54, arc: 2.25,
    size: 100, axis: SPRITE_UP, reach: 12, travel: 10, push: 24, cd: 0.72, shake: 1.4,
    hold: { art: 'luoi_hai', pv: [6, 10], sweep: 1.85, ext: 5.0, rest: -1.10 },
  },
  {
    id: 'gang', name: 'Găng', label: 'GĂNG', skill: 'ABYSSAL FIST', art: 'assets/images/skills/gang-frames',
    desc: 'nhanh · 5 nhịp', col: hexc('#65dcec'), gain: 2.15,
    fps: 34, hits: [2, 5, 8, 11, 14], dmg: 7, range: 33, arc: 1.15,
    size: 72, axis: SPRITE_UP, reach: 10, travel: 16, push: 12, cd: 0.46, shake: 0.9,
    // Fists barely rotate -- a punch is reach, so `ext` carries the pose instead.
    hold: { art: 'gang', pv: [2, 5], sweep: 0.50, ext: 6.5, rest: -0.30 },
  },
];
const WEAPON_BY_ID = {};
for (const wp of WEAPONS) {
  WEAPON_BY_ID[wp.id] = wp;
  wp.frames = 16;
  wp.dur = wp.frames / wp.fps;
  wp.squash = SWING_SQ;
  // `col` stays the weapon's identity colour (icon, damage flash, sparks). The sheets are
  // already near-white line art, and tinting them at full strength is most of why a slash
  // looked washed out next to test.html, which draws them untinted: the white-hot centre
  // is what the eye reads as brightness. `lit` mixes the hue only part of the way in, so
  // the core stays white and the falloff still carries the weapon's colour.
  wp.lit = wp.col.map(c => c + (1 - c) * 0.5);
  // The held sprite shares the weapon's hue but reads as metal, not light: one bright edge,
  // one body tone, a dark outline and a neutral haft. Four tones is all an 7px blade can
  // carry, and keeping the outline dark is what stops it dissolving into the floor.
  wp.held = HELD[wp.hold.art];
  wp.hpal = {
    '#': wp.col.map(c => c + (1 - c) * 0.75),
    '+': wp.col.map(c => c * 0.78),
    '-': HELD_DARK,
    '=': HELD_HAFT,
  };
  // A swing is one fx entry like a cast, so it gets the same shape a skill has. The
  // hotbar, the cooldown sweep and `step` then treat the basic attack as slot zero
  // without a single special case.
  wp.sk = { id: wp.id, name: wp.name, mode: 'dir', dur: wp.dur, cd: wp.cd, shake: wp.shake,
            over(w, e, p) { drawSwing(w, e, p); }, hit(w, e) { swingHit(w, e); } };
}

// Frame sets live on disk as PNGs, and this renderer never blits: it accumulates light.
// So each sheet is decoded once, scaled to its world size, and kept as a premultiplied
// float bitmap that `stampFrame` can add straight into `buf`. Bake cost is paid on the
// menu (5 weapons x 16 frames, a few ms each); after that a swing is pure arithmetic.
const ART = (() => {
  const sets = {};                     // id -> array of 16 baked frames (or null)
  let started = false, done = 0, total = WEAPONS.length * 16, failed = 0;
  const bake = (img, wp, i) => {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return null;
    const fit = wp.size / (wp.frameBox || Math.max(nw, nh));
    const dw = Math.max(1, Math.round(nw * fit)), dh = Math.max(1, Math.round(nh * fit));
    const cv = document.createElement('canvas');
    cv.width = dw; cv.height = dh;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, dw, dh);
    const src = cx.getImageData(0, 0, dw, dh).data;
    const px = new Float32Array(dw * dh * 3);
    // Premultiplied on purpose: additive light has no notion of "behind", so a pixel's
    // contribution is just colour * coverage and the alpha channel can be thrown away.
    //
    // Coverage is lifted by a gamma rather than used raw. Fitting 320px art into ~90px
    // averages every hairline stroke with transparent black, so a stroke thinner than the
    // destination pixel arrives at a fraction of its painted alpha; because the tonemap is
    // concave, the same light spread thin resolves much darker than it did at full size.
    // The gamma pays that back and is the difference between a blade and a grey smear.
    for (let k = 0, n = dw * dh; k < n; k++) {
      const a = src[k * 4 + 3] / 255;
      if (a <= 0) continue;
      const cov = Math.pow(a, 0.7);
      px[k * 3]     = src[k * 4]     / 255 * cov;
      px[k * 3 + 1] = src[k * 4 + 1] / 255 * cov;
      px[k * 3 + 2] = src[k * 4 + 2] / 255 * cov;
    }
    const pv = (wp.pivots && wp.pivots[i]) || [0.5, 0.5];
    return { w: dw, h: dh, px, cx: pv[0] * dw, cy: pv[1] * dh };
  };
  return {
    // Missing art is not an error: `drawSwing` falls back to a procedural crescent, so a
    // 404 (or a headless run) costs the painted look and nothing else.
    frames(id) { return sets[id] || null; },
    progress() { return total ? done / total : 1; },
    failed() { return failed; },
    preload(onStep) {
      if (started || typeof document === 'undefined') return;
      started = true;
      for (const wp of WEAPONS) {
        const out = new Array(16).fill(null);
        sets[wp.id] = out;
        for (let i = 0; i < 16; i++) {
          const img = new Image();
          const fin = ok => { done++; if (!ok) failed++; if (onStep) onStep(done, total); };
          img.onload = () => { try { out[i] = bake(img, wp, i); fin(!!out[i]); } catch (err) { fin(false); } };
          img.onerror = () => fin(false);
          img.src = wp.art + '/frame_' + String(i + 1).padStart(2, '0') + '.png';
        }
      }
    },
  };
})();

// Add one baked frame into the buffer, rotated by `rot` and flattened by `squash`.
// Forward transform is  d = R(rot) * (s - pivot)  then  dy *= squash;  the loop walks
// destination pixels and inverts it, which is the only way to avoid holes when a sprite
// is rotated and scaled at the same time.
function stampFrame(fr, x, y, rot, squash, a, col, gain) {
  if (!fr || a <= 0) return;
  x -= CAMX; y -= CAMY;
  const ca = Math.cos(rot), sa = Math.sin(rot), sq = Math.max(squash, 1e-3);
  const l = -fr.cx, r = fr.w - fr.cx, t = -fr.cy, b = fr.h - fr.cy;
  let ax = 1e9, bx = -1e9, ay = 1e9, by = -1e9;
  for (const u of [l, r]) for (const v of [t, b]) {
    const dx = u * ca - v * sa, dy = (u * sa + v * ca) * sq;
    if (x + dx < ax) ax = x + dx; if (x + dx > bx) bx = x + dx;
    if (y + dy < ay) ay = y + dy; if (y + dy > by) by = y + dy;
  }
  const x0 = Math.max(0, Math.floor(ax)), x1 = Math.min(W - 1, Math.ceil(bx));
  const y0 = Math.max(0, Math.floor(ay)), y1 = Math.min(H - 1, Math.ceil(by));
  if (x1 < x0 || y1 < y0) return;
  // The sheets are near-white line art, so the weapon's own colour is a tint applied on
  // the way in; gain compensates for the tonemap, which pulls a 1.0 sample down to 0.64.
  const g = a * (gain === undefined ? 1 : gain);
  const g0 = (col ? col[0] : 1) * g, g1 = (col ? col[1] : 1) * g, g2 = (col ? col[2] : 1) * g;
  const px = fr.px, fw = fr.w, fh = fr.h;
  for (let py = y0; py <= y1; py++) {
    const dyq = (py - y) / sq;
    for (let pxi = x0; pxi <= x1; pxi++) {
      const dx = pxi - x;
      const su = dx * ca + dyq * sa + fr.cx - 0.5, sv = -dx * sa + dyq * ca + fr.cy - 0.5;
      // Bilinear, not nearest. The squash alone drops better than one row in four, and a
      // rotated nearest fetch on a 90px sprite turns a hairline crescent into a dotted
      // line. Sampling smoothly costs three multiplies and keeps the blade continuous;
      // the pixel look still comes from the 320x180 grid and the dither, as it should.
      const sx = Math.floor(su), sy = Math.floor(sv);
      if (sx < -1 || sy < -1 || sx >= fw || sy >= fh) continue;
      const fx = su - sx, fy = sv - sy;
      const x0i = sx < 0 ? 0 : sx, x1i = sx + 1 >= fw ? fw - 1 : sx + 1;
      const y0i = sy < 0 ? 0 : sy, y1i = sy + 1 >= fh ? fh - 1 : sy + 1;
      const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy, w11 = fx * fy;
      const a00 = (y0i * fw + x0i) * 3, a10 = (y0i * fw + x1i) * 3;
      const a01 = (y1i * fw + x0i) * 3, a11 = (y1i * fw + x1i) * 3;
      const r0 = px[a00] * w00 + px[a10] * w10 + px[a01] * w01 + px[a11] * w11;
      const r1 = px[a00 + 1] * w00 + px[a10 + 1] * w10 + px[a01 + 1] * w01 + px[a11 + 1] * w11;
      const r2 = px[a00 + 2] * w00 + px[a10 + 2] * w10 + px[a01 + 2] * w01 + px[a11 + 2] * w11;
      if (r0 <= 0 && r1 <= 0 && r2 <= 0) continue;
      const i3 = (py * W + pxi) * 3;
      buf[i3] += r0 * g0; buf[i3 + 1] += r1 * g1; buf[i3 + 2] += r2 * g2;
    }
  }
}

// Where the swing is anchored this frame. Melee follows the hero (walk while swinging and
// the arc walks with you, as in test.html); a shot stays at the origin it was fired from.
function swingOrigin(w, e) {
  const wp = e.wp;
  if (wp.anchor === 'cast') return { x: e.ox, y: e.oy };
  const h = w.hero;
  return { x: h.x, y: h.y - h.h * 0.5 };
}

// Draw the swing. `p` is 0..1 over the sheet's own duration, so the frame index is
// exact at any refresh rate; the two trailing frames are the same 3-frame additive smear
// test.html uses, which is what makes a 16-frame sheet read as one continuous arc.
function drawSwing(w, e, p) {
  const wp = e.wp, o = swingOrigin(w, e);
  const last = wp.frames - 1;
  const fi = Math.min(last, Math.floor(p * wp.frames));
  const prog = Math.min(1, p * wp.frames / last);   // travel stays smooth between frames
  const off = wp.reach + wp.travel * prog;
  const x = o.x + Math.cos(e.ang) * off, y = o.y + Math.sin(e.ang) * off * wp.squash;
  const set = ART.frames(wp.id);
  const rot = e.ang - wp.axis;
  if (set && set[fi]) {
    // A soft halo under the sheet. The buffer resolves to 16 levels, which is enough for a
    // blade but throws away the gradient a real glow lives in -- everything below one step
    // simply vanishes. Laying an analytic arc underneath gives the quantiser something to
    // ramp through, and that ramp is what makes the swing look lit rather than pasted on.
    const k = Math.sin(Math.PI * Math.min(1, p * 1.15));
    arc(x, y, wp.size * 0.30, e.ang, wp.arc * 1.7, wp.size * 0.13, wp.lit,
        0.30 * k, wp.squash, 1.4, 1.5);
    for (let tr = 2; tr >= 0; tr--) {
      const fr = set[Math.max(0, fi - tr)];
      if (!fr) continue;
      stampFrame(fr, x, y, rot, wp.squash, tr === 0 ? 1 : 0.26 / tr, wp.lit, wp.gain);
    }
  } else {
    // Procedural stand-in: same reach, same arc, same colour, so a missing sheet is a
    // downgrade in looks and never a change in what the attack *is*. `arc` takes a full
    // sweep while `wp.arc` is the half-angle the hitbox uses, hence the doubling.
    const k = Math.sin(Math.PI * p);
    arc(x, y, wp.range * 0.5, e.ang, wp.arc * 2, 3.2, wp.lit, 0.85 * k, wp.squash, 1.5, 1.6);
    core(x, y, 3.4, wp.lit, 0.5 * k, 2);
  }
  // Every hit frame gets a one-frame flourish at the tip: the sheets are the same art for
  // all five weapons, and this is what tells you *this* is the beat that lands.
  for (const hf of wp.hits) {
    const d = fi - hf;
    if (d < 0 || d > 1) continue;
    const a = d === 0 ? 1 : 0.4;
    const tx = o.x + Math.cos(e.ang) * (off + wp.range * 0.5);
    const ty = o.y + Math.sin(e.ang) * (off + wp.range * 0.5) * wp.squash;
    core(tx, ty, 3.6, wp.col, 0.6 * a, 2);
    sparks(tx, ty, 7, 1, wp.range * 0.42, wp.col, 0.5 * a, (e.seed + hf * 31) | 0,
           0.8, wp.squash, e.ang - wp.arc * 0.5, e.ang + wp.arc * 0.5, 3);
  }
}

// Pose of the held weapon, in the hero's own terms: `rot` is an offset from the aim angle
// and `ext` is how far the grip is pushed out from the body. `p` is the live swing's 0..1,
// or -1 when the hero is just standing there holding the thing.
function heldPose(wp, p) {
  const hd = wp.hold;
  if (p < 0) return { rot: hd.rest, ext: 0, t: -1 };
  // Which beat of the combo this is, and how far through it. A beat runs from a little
  // before its hit frame to a little after, so the arm peaks on the frame `swingHit` fires
  // -- that is what makes a four-beat sword look like four strikes instead of one long one.
  const hits = wp.hits, n = hits.length, f = p * wp.frames;
  let bi = 0;
  for (let i = 0; i < n; i++) if (f >= hits[i] - 2.6) bi = i;
  const s0 = Math.max(0, (hits[bi] - 2.6) / wp.frames);
  const s1 = Math.min(1, (hits[bi] + 2.2) / wp.frames);
  const t = c01((p - s0) / Math.max(1e-3, s1 - s0));
  // Wind up over the first third, then snap through. The 0.5 exponent front-loads the
  // rotation, which is the difference between a slash and a windscreen wiper.
  const k = t < 0.34 ? -(t / 0.34) : -1 + 2 * fpow((t - 0.34) / 0.66, 0.5);
  const dir = (bi & 1) ? -1 : 1;                  // consecutive beats cut the other way
  // Recovery. Without it the weapon is still mid-follow-through on the sheet's last frame
  // and snaps to the resting cant the instant the fx is dropped, which reads as a glitch
  // rather than a swing; easing back over the tail costs nothing and removes the pop.
  const end = Math.min(0.86, (hits[n - 1] + 2.2) / wp.frames);
  const rc = p > end ? c01((p - end) / Math.max(1e-3, 1 - end)) : 0;
  const raw = hd.rest + hd.sweep * k * dir;
  return { rot: raw + (hd.rest - raw) * rc, ext: hd.ext * c01(k + 0.35) * (1 - rc), t: t };
}

// Draw the weapon in the hero's hand. Called twice per frame: once before the hero blit for
// the half of the aim circle that points away from the camera, once after for the half that
// points toward it, so a sword raised northward passes behind the shoulder and one thrust
// south covers the hip. `back` says which pass this is.
function drawHeld(w, back) {
  const h = w.hero, wp = w.wp;
  if (!wp || !wp.held) return;
  const e = w.sw;
  const ang = e ? e.ang
    : Math.atan2((w.aim.y - (h.y - h.h * 0.5)) / HELD_SQ, w.aim.x - h.x);
  if ((Math.sin(ang) < -0.12) !== !!back) return;
  const ps = heldPose(wp, e ? e.p : -1);
  const sgn = h.flip ? -1 : 1;                    // the pose mirrors with the sprite
  const hf = heroFrame(h);
  const hx = h.x + 4 * sgn, hy = h.y - h.h + 7 + hf.dy;
  blitRot(wp.held, wp.hpal,
          hx + Math.cos(ang) * ps.ext, hy + Math.sin(ang) * ps.ext * HELD_SQ,
          wp.hold.pv[0], wp.hold.pv[1], ang + ps.rot * sgn - SPRITE_UP,
          1, h.flash, HELD_SQ);
}

// One hit per entry in `hits`, fired the frame that entry becomes current. `crossed` makes
// that exact regardless of dt, the way the skills already do it. The cone is measured from
// the hero (or, for a shot, from where it was fired) and not from the sprite's advancing
// centre: a swing that travels outward would otherwise leave a foe *behind* its own cone
// on the later beats of a combo, and the last two hits of a scythe would silently whiff.
function swingHit(w, e) {
  const wp = e.wp, hits = wp.hits, last = hits.length - 1;
  for (let i = 0; i < hits.length; i++) {
    if (!crossed(e, hits[i] / wp.frames)) continue;
    const o = swingOrigin(w, e);
    // Later beats of a combo hit harder: the fifth punch of a gauntlet flurry is the one
    // that should feel like it finished the job.
    const step = last > 0 ? 1 + 0.5 * (i / last) : 1;
    const crit = last > 0 && i === last;
    const n = hitCone(w, o.x, o.y, e.ang, wp.range, wp.arc, wp.dmg * step,
                      wp.col, crit, wp.push + i * 4);
    if (n) w.shake = Math.max(w.shake, wp.shake * 0.8);
  }
}

// Fire the basic attack. Same contract as `cast`: returns false when it is on cooldown,
// so the hotbar and the keyboard path can share one call.
function swing(w, tx, ty) {
  const wp = w.wp;
  if (!wp || w.wcd > 0) return false;
  const h = w.hero;
  const e = { sk: wp.sk, wp: wp, i: -1, t: 0, dur: wp.dur, p: 0, pt: 0,
              seed: w.rng.int(1, 1e9) | 0, ox: h.x, oy: h.y - h.h * 0.5, data: {} };
  e.x = clamp(tx, BOUND.x0 - 18, BOUND.x1 + 18);
  e.y = clamp(ty, BOUND.y0 - 16, BOUND.y1 + 10);
  e.ang = Math.atan2((e.y - h.h * 0.5 - e.oy) / wp.squash, e.x - e.ox);
  w.fxs.push(e);
  w.wcd = wp.cd;
  w.shake = Math.max(w.shake, wp.shake * 0.5);
  h.flip = e.x < h.x;
  SFX.cast(wp.id, clamp((h.x - w.cam.x - W * 0.5) / (W * 0.5), -1, 1));
  return true;
}

