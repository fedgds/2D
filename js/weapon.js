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
    desc: 'chuỗi nhịp · 4 nhịp', col: hexc('#bcd8ff'), gain: 2.1,
    fps: 30, hits: [3, 6, 10, 13], dmg: 9, range: 44, arc: 1.50,
    size: 90, axis: SPRITE_UP, reach: 12, travel: 0, push: 0, pushStep: 0, cd: 0.55, shake: 1.1,
    // Momentum. Land the fourth beat and a window opens: the next swing comes out faster and
    // hits harder, and landing *its* fourth beat opens it again. Knockback is zero on purpose
    // -- shoving the target out of reach would close the chain the weapon is built around, so
    // the sword gives up the one thing the other four melee weapons all have.
    momentum: { cd: 0.34, dmg: 1.30, win: 1.20 },
    hold: { art: 'kiem', pv: [3, 13], sweep: 1.45, ext: 4.5, rest: -0.80 },
  },
  {
    id: 'dao', name: 'Đao', label: 'ĐAO', skill: 'MOON TIDE', art: 'assets/images/skills/dao-frames',
    desc: 'xử trảm · cắm chân', col: hexc('#baf7ff'), gain: 2.0,
    fps: 32, hits: [4, 8, 12], dmg: 14, range: 43, arc: 1.55,
    size: 94, axis: -0.072, reach: 11, travel: 6, push: 16, cd: 0.60, shake: 1.3,
    // The saber commits. While the swing runs the legs are down to a shuffle -- you cannot
    // reposition out of a telegraph you mis-read -- and in exchange the hero takes 40% less.
    // The finisher then reads the target's own wounds: `exec` is a multiple of `dmg` scaled
    // by the fraction of HP already gone, so it is worth nothing against a fresh brute and
    // a great deal against the one you have been working on. Pick a target, then commit.
    exec: 1.20, plant: 0.30, guard: 0.60,
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
    desc: 'ba mũi · xuyên · càng xa càng mạnh', col: hexc('#d9fdff'), gain: 2.0,
    fps: 28, hits: [8], range: 42, arc: 0.34,
    size: 78, axis: 0.515, reach: 13, travel: 10, push: 0, pushStep: 0, cd: 0.70, shake: 1.0,
    // The only weapon here that does not resolve where it is aimed on the frame it is aimed.
    // `hits: [8]` is now the *release*: it puts an arrow in the air and the arrow decides,
    // later, who it caught and for how much. Hence no `dmg`, no cone and no knockback of its
    // own -- `range` is left only because `drawSwing` measures the release flourish against
    // it, and the shove belongs to the arrow. `near`/`far` are the ends of the damage ramp
    // and `ramp` is the distance the top is reached at, deliberately well short of `max` so
    // the strong band is something you can hold rather than a pixel you have to find. Up
    // close the bow is worth less than a punch; that is the trade.
    shot: { spd: 300, max: 210, ramp: 140, near: 14, far: 46, thick: 5, push: 26,
            // Một lần bật dây là ba mũi xoè hình nan quạt. Bản một mũi mạnh đúng ở chỗ khó
            // giữ nhất -- xa -- còn lúc quái đã áp mặt thì 14 sát thương cho một nhịp 0.7 s
            // không ra hình một đòn, và đó là toàn bộ cảm giác "phế": người chơi dùng cung
            // nhiều nhất ở đúng cái tầm nó vô dụng nhất.
            //
            // `spread` và `side` được chọn cùng nhau để hai bất biến của cung không đổi:
            //   · Trần một mục tiêu vẫn là `far`. Ở tầm ôm sát, ba mũi còn chồng lên cùng
            //     một thân địch, nhưng chồng nhau chỉ tới `r / sin(spread)` ≈ 32 px (bia rộng
            //     nhất trong game), và ở đó dải mới có `near + (far-near)·32/ramp` ≈ 21 -- nhân
            //     `1 + 2·side` = 2.1 vẫn ra 45, tức là không hơn một mũi bắn tới độ. Xa hơn
            //     32 px là hai mũi biên đã ra ngoài thân nó và mọi thứ về đúng như cũ.
            //   · Áp mặt vẫn là tay yếu nhất: 37 sát thương cho 0.7 s hồi là ~53 dps, thấp
            //     hơn cả bốn vũ khí kia, chỉ là nó không còn bằng không.
            // Còn tiền của nan quạt trả ở tầm xa là bề rộng chứ không phải sát thương: ở cuối
            // tầm hai mũi biên cách trục hơn 60 px, nên một đám đứng tụm là ba làn xuyên.
            fan: 3, spread: 0.30, side: 0.55 },
    // A bow does not slash: it draws back and springs forward, so the sweep is tiny and
    // almost all of the motion is the grip pushing out on release. The sheet stays with the
    // hero (no `anchor`) because it is the *draw*, and walking while you draw should carry
    // the bow with you -- what leaves and keeps going is the arrow, not the art.
    hold: { art: 'cung', pv: [4, 8], sweep: 0.30, ext: 3.2, rest: -0.10 },
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
    desc: 'gom bầy · kéo vào · hút máu', col: hexc('#bdf9ff'), gain: 1.95,
    fps: 26, hits: [4, 9, 13], dmg: 13, range: 54, arc: 2.25,
    size: 100, axis: SPRITE_UP, reach: 12, travel: 10, push: -34, pushStep: -6, cd: 0.72, shake: 1.4,
    // A negative `push` is a pull: `hitCone` sends the impulse along the angle from the hero to
    // the foe, so flipping the sign drags the target in instead of shoving it out, and each
    // later beat pulls harder. That turns the widest cone in the game from "I can reach more
    // of them" into "I can gather them", and `harvest` is what gathering is worth -- HP per
    // foe past the first, so one target is a hit and a crowd is a meal.
    harvest: 7,
    hold: { art: 'luoi_hai', pv: [6, 10], sweep: 1.85, ext: 5.0, rest: -1.10 },
  },
  {
    id: 'gang', name: 'Găng', label: 'GĂNG', skill: 'ABYSSAL FIST', art: 'assets/images/skills/gang-frames',
    desc: 'cắt phép · 5 nhịp', col: hexc('#65dcec'), gain: 2.15,
    fps: 34, hits: [2, 5, 8, 11, 14], dmg: 7, range: 33, arc: 1.15,
    size: 72, axis: SPRITE_UP, reach: 10, travel: 16, push: 12, cd: 0.46, shake: 0.9,
    // The fifth punch snuffs a cast. Monsters telegraph a shape on the floor and then hit it,
    // and until now nothing in a loadout could switch one off -- you could only leave. `cut`
    // is how long the caster is held: `stepTel` already drops a telegraph whose owner is
    // frozen (js/foe-abil.js), so a quarter second is all it takes and the interrupt costs no
    // new machinery. The shortest reach in the game buys the only answer to a wind-up.
    cut: 0.25,
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
  // How much each later beat of a combo adds to the knockback. It is a field and not a
  // constant because the sign and the size of it are weapon identity now: the sword needs
  // zero so its chain cannot shove the target out of reach, and the scythe needs it negative
  // so every beat pulls harder than the last.
  if (wp.pushStep === undefined) wp.pushStep = 4;
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
    // A bow has no cone at all: its one beat is the release, and everything after that
    // belongs to the arrow.
    if (wp.shot) { fireArrow(w, e, o); continue; }
    // Later beats of a combo hit harder: the fifth punch of a gauntlet flurry is the one
    // that should feel like it finished the job.
    const step = last > 0 ? 1 + 0.5 * (i / last) : 1;
    const crit = last > 0 && i === last;
    // `e.momo` was decided once, by `swing`, so the bonus covers the whole chain rather than
    // flickering on and off between beats as the window ticks down underneath it.
    const amount = wp.dmg * step * (e.momo ? wp.momentum.dmg : 1);
    const n = hitCone(w, o.x, o.y, e.ang, wp.range, wp.arc, amount,
                      wp.col, crit, wp.push + i * wp.pushStep, swingRiders(w, wp, crit));
    if (!n) continue;
    w.shake = Math.max(w.shake, wp.shake * 0.8);
    // Paid in blood rather than in damage, and only on the finisher: the earlier beats are
    // the gathering (each one pulls harder than the last), the last one is the reaping, and
    // it counts whoever the pull actually managed to drag into the cone. Per-beat healing
    // would turn a crowd into a fountain -- three foes would out-heal the contact drain by
    // a factor of two -- and would pay the scythe for swinging rather than for gathering.
    // The second foe onward, so one target is a hit and only a crowd is a meal.
    if (crit && wp.harvest && n > 1) healHero(w, wp.harvest * (n - 1));
    // Landing the finisher is what opens the sword's window. Whiffing it leaves the window
    // shut -- `swing` already spent whatever was there -- which is the whole bargain.
    if (crit && wp.momentum) w.momo = wp.momentum.win;
  }
}

// Per-target riders for the finisher, built only when there is one to build: the cone knows
// distance and angle, and neither of these can be expressed in those terms. The saber's
// bonus reads how wounded the target already is; the gauntlet's reads whether it is casting.
function swingRiders(w, wp, crit) {
  if (!crit || (!wp.exec && !wp.cut)) return null;
  const r = {};
  if (wp.exec) r.amp = f => wp.dmg * wp.exec * c01(1 - f.hp / f.maxhp);
  if (wp.cut) r.onHit = f => cutCast(w, f, wp.cut);
  return r;
}

// Snuff a wind-up. This deliberately does not stun and does not damage: `stepTel` drops any
// telegraph whose owner is frozen and pushes the owner's next attempt out by 1.1 s, so the
// whole interrupt is one field plus something to look at. The burst is its own fx entry
// because `swingHit` runs in the sim and has no draw phase of its own.
const CUT_C = hexc('#ffd24a'), CUT_H = hexc('#fff4c8');
const CUT_SK = {
  id: 'cut', name: 'Cắt Phép', mode: 'dir', dur: 0.34, cd: 0, shake: 0,
  mid(w, e, p) {
    const d = e.data, fd = fade(p, 0.18), g = eo(p);
    // Collapsing inward, the opposite of every cast in the game: the shape a telegraph makes
    // as it fills is a ring growing, so a ring closing reads as one being taken away.
    ring(d.x, d.y, 15 * (1 - g) + 3, 1.6, CUT_C, 0.85 * fd, 0.55);
    ring(d.x, d.y, 22 * (1 - g) + 4, 1.0, CUT_H, 0.45 * fd, 0.55);
    for (let i = 0; i < 4; i++)
      chevron(d.x, d.y, i / 4 * TAU + Math.PI * 0.25, 4.0 + 3 * (1 - g), CUT_C, 0.70 * fd);
    core(d.x, d.y, 4.5 * fd, CUT_H, 0.95 * fd, 2.2);
    sparks(d.x, d.y, 9, 2, 17, CUT_C, 0.60 * fd, e.seed, 0.9, 0.7, 0, TAU, 3);
  },
};
function cutCast(w, f, hold) {
  if (!f.tel || f.tel.fired) return;
  f.frozen = Math.max(f.frozen, hold);
  w.fxs.push({ sk: CUT_SK, i: -1, t: 0, dur: CUT_SK.dur, p: 0, pt: 0,
               seed: w.rng.int(1, 1e9) | 0, ox: f.x, oy: f.y, x: f.x, y: f.y, ang: 0,
               data: { x: f.x, y: f.y - f.h * 0.5 } });
  w.shake = Math.max(w.shake, 1.6);
  SFX.blocked();
}

// ---- the bow's arrow ------------------------------------------------------------------
// The other four weapons ask "is it in front of me right now". This one asks "will it still
// be there when the arrow gets there", and answers with how far the arrow had flown when it
// arrived. Distance stops being a number on the sheet and becomes something the player has
// to keep hold of, which is the only reason the weapon plays differently at all.
const ARR_C = hexc('#d9fdff'), ARR_H = hexc('#ffffff'), ARR_T = hexc('#6fb4d6');
const ARROW_SK = {
  id: 'arrow', name: 'Mũi Tên', mode: 'dir', dur: 1, cd: 0, shake: 0,
  mid(w, e, p) { drawArrow(w, e); },
  hit(w, e) { arrowHit(w, e); },
};
// One release, `fan` arrows. The offsets are symmetric about the aim, so the middle arrow of
// an odd fan is the aimed one and carries full power; everything off the centre line is a
// flanker at `side`. Each arrow is clipped against the arena on *its own* angle -- a fan
// loosed along a wall would otherwise keep its outer legs flying through the void.
function fireArrow(w, e, o) {
  const s = e.wp.shot, n = s.fan || 1, sp = s.spread || 0;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * sp;
    looseArrow(w, e, o, i, e.ang + off, off === 0 ? 1 : (s.side == null ? 1 : s.side));
  }
}
function looseArrow(w, e, o, i, ang, mul) {
  const wp = e.wp, s = wp.shot;
  // Clip the flight to the arena, or an arrow loosed at a wall keeps going through the void
  // with its trail still lit. Coarse steps: 8 px of overshoot on a 210 px flight is not a
  // thing anyone can see, and a slab test here would be exact about nothing that matters.
  const ca = Math.cos(ang), cy = Math.sin(ang) * wp.squash;
  let max = s.max;
  for (let d = 8; d <= s.max; d += 8) {
    const px = o.x + ca * d, py = o.y + cy * d;
    if (px < BOUND.x0 || px > BOUND.x1 || py < BOUND.y0 - 20 || py > BOUND.y1) { max = d; break; }
  }
  // `wp` stays out of the entry and inside `data`: `step` picks the live swing by looking for
  // `.wp`, and an arrow in flight is not a swing -- it must never drive the pose of the bow
  // in the hero's hands. `dur` is the real flight time, so `e.p` *is* the fraction flown.
  // The seeds are spread apart per arrow, or the three sets of ripening sparks would twinkle
  // in lockstep and the fan would read as one wide arrow instead of three.
  w.fxs.push({ sk: ARROW_SK, i: -1, t: 0, dur: max / s.spd, p: 0, pt: 0,
               seed: (e.seed * 7 + 13 + i * 1013) | 0, ox: o.x, oy: o.y, x: e.x, y: e.y,
               ang, data: { wp, s, max, mul, trav: 0, was: 0, hit: [] } });
}

// One pass per frame over the segment the arrow covered since the last one, so a 300 px/s
// arrow cannot tunnel past a foe between frames. Everything is measured in the squashed
// frame `hitCone` uses, so a shot to the north and a shot to the east need the same aim.
function arrowHit(w, e) {
  const d = e.data, s = d.s, wp = d.wp;
  d.was = d.trav; d.trav = e.p * d.max;
  if (d.trav <= d.was) return;
  const ca = Math.cos(e.ang), sa = Math.sin(e.ang);
  for (const f of w.foes) {
    if (f.dying || d.hit.indexOf(f) >= 0) continue;
    const dx = f.x - e.ox, dy = (midY(f) - e.oy) / wp.squash;
    const t = dx * ca + dy * sa;                       // how far along the shaft it stands
    const r = s.thick + f.w * 0.35;
    if (t < d.was - r || t > d.trav + r) continue;      // not in the slice flown this frame
    if (Math.abs(dy * ca - dx * sa) > r) continue;      // beside the shaft, not on it
    // Pierce: the arrow keeps its speed and its ramp, and only the memory of who it already
    // hit stops it scoring the same foe twice. A line of monsters is the payoff for kiting.
    d.hit.push(f);
    const k = c01(Math.max(t, 0) / s.ramp);
    // `mul` là của riêng mũi này, nên hai mũi biên vừa đau ít hơn vừa đẩy nhẹ hơn, và không
    // được tính là đòn chí mạng: một con số 25 nhảy lên với viền chí mạng thì bảng số đọc ra
    // là mũi chính đã trúng, trong khi mũi chính vừa bay trượt.
    const amt = (s.near + (s.far - s.near) * k) * d.mul;
    hurt(w, f, amt, wp.col, k > 0.85 && d.mul >= 1,
         ca * s.push * k * d.mul, sa * s.push * k * 0.5 * d.mul);
  }
}

function drawArrow(w, e) {
  const d = e.data, s = d.s, sq = d.wp.squash;
  const ca = Math.cos(e.ang), sa = Math.sin(e.ang) * sq;
  const x = e.ox + ca * d.trav, y = e.oy + sa * d.trav;
  // Hai mũi biên vẽ nhạt hơn. Ba mũi cùng độ sáng thì cái nan quạt đọc ra là một vệt rộng và
  // người chơi mất luôn thứ duy nhất cần ngắm: mũi giữa là mũi mang đủ sát thương.
  const g = d.mul >= 1 ? 1 : 0.62;
  // A short streak behind the head, not a line back to the bow: an arrow is a thing in
  // flight, and a tracer all the way home is a thing that has already arrived.
  const tl = Math.min(d.trav, 22), bx = x - ca * tl, by = y - sa * tl;
  line(bx, by, x, y, 2.6, ARR_T, 0.22 * g, 1.5, 0.9);
  line(bx, by, x, y, 1.2, ARR_C, 0.70 * g, 1.5, 0.8);
  line(x - ca * 6, y - sa * 6, x, y, 0.8, ARR_H, 1.0 * g, 1.5, 0.7);
  chevron(x, y, e.ang, 3.4 * (d.mul >= 1 ? 1 : 0.82), ARR_C, 0.75 * g);
  core(x, y, 2.6, ARR_C, 0.80 * g, 2);
  core(x, y, 1.1, ARR_H, 1.10 * g);
  // The head brightens as the shot ripens, so the damage ramp is legible in the air instead
  // of being something the player infers from the numbers afterwards.
  const k = c01(d.trav / s.ramp);
  if (k > 0.5) {
    const gg = (k - 0.5) / 0.5;
    ring(x, y, 3 + 3 * gg, 1.1, ARR_H, 0.30 * gg * g, 0.7);
    sparks(x, y, 5, 1, 9, ARR_C, 0.35 * gg * g, e.seed, 0.7, sq,
           e.ang + Math.PI - 0.5, e.ang + Math.PI + 0.5, 3);
  }
}

// What the picker and the tooltip say a weapon does. Melee is `dmg` per beat times beats; a
// bow has neither, because its damage is a curve over distance and its reach is the flight --
// so it gets its own sentence rather than a `dmg` field that would have to lie.
function weaponStat(wp) {
  if (wp.shot) {
    const n = wp.shot.fan || 1;
    // `near`–`far` là dải của mũi giữa, nên khi có nan quạt thì phải nói ra số mũi: bằng
    // không dòng này đọc ra là cả đòn chỉ đáng bằng một mũi.
    return (n > 1 ? n + ' mũi · ' : '') +
           `${wp.shot.near}–${wp.shot.far} theo tầm · xuyên · bay ${wp.shot.max}`;
  }
  return `${wp.dmg}×${wp.hits.length} nhịp · tầm ${Math.round(wp.range)}`;
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
  // Spend the window here and not per beat, so the whole chain is either fast or it is not.
  // Clearing it on use is what makes momentum a thing you keep re-earning: the finisher of
  // *this* swing has to land again to open the next one.
  e.momo = !!(wp.momentum && w.momo > 0);
  if (e.momo) w.momo = 0;
  w.fxs.push(e);
  w.wcd = e.momo ? wp.momentum.cd : wp.cd;
  w.shake = Math.max(w.shake, wp.shake * 0.5);
  h.flip = e.x < h.x;
  SFX.cast(wp.id, clamp((h.x - w.cam.x - W * 0.5) / (W * 0.5), -1, 1));
  return true;
}

