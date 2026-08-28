"use strict";
// ===========================================================================
// 6. The 16 skills, re-authored as time-parameterised versions of the sketches.
//    Each is { under, mid, over } drawing at progress p in [0,1] plus `hit`, which
//    applies damage on the frame p crosses a threshold.
// ===========================================================================
const C = {
  cyan: hexc('#8fd6ff'), pale: hexc('#eaf9ff'), ice: hexc('#2f8fdc'), deep: hexc('#0e2f5c'),
  ember: hexc('#ff7a2a'), gold: hexc('#ffd98a'), ash: hexc('#6a4a30'),
  volt: hexc('#b9d6ff'), voltc: hexc('#5a9cff'),
  blood: hexc('#c0374a'), blush: hexc('#ff8090'),
  voidc: hexc('#7a3cff'), lilac: hexc('#c8a8ff'),
  holy: hexc('#ffe9a8'), holyp: hexc('#fff6d8'),
  lime: hexc('#c8ff3a'), limeh: hexc('#f0ffc0'), smoke: hexc('#4a5a2a'),
  indigo: hexc('#5a4cff'), indigop: hexc('#b9b0ff'),
  spirit: hexc('#6affd0'), spiritp: hexc('#d8fff2'),
  toxic: hexc('#57d94a'), toxicp: hexc('#c2f57a'),
  sand: hexc('#e8c98a'), sandp: hexc('#fff0cc'),
  steel: hexc('#cfe0ff'), brass: hexc('#ffd98a'),
  vio: hexc('#9a5cff'), viop: hexc('#d8c4ff'),
};

const eo = p => 1 - (1 - p) * (1 - p);          // ease-out
const pop = (p, s) => c01(p / s);               // rise over the first s of the cast
// Fades are squared, never linear: a linearly fading translucent shape parks a ~25%
// ghost on the floor that reads as a rock instead of as energy.
function fade(p, s) { const f = 1 - c01((p - s) / (1 - s)); return f * f; }

const SKILLS = [];

// Cooldowns are the only balance knob in here, so all 16 are distinct and ordered by
// what a cast is actually worth: burst damage, area, and how much control it buys.
// Roughly 0.9 s for the basic melee sweep up to 9.5 s for a mass freeze. `cd` is always
// >= `dur`, so an effect can never overlap a second copy of itself, and X clears every
// cooldown when you just want to look at the effects back to back.

SKILLS.push({
  id: 'star_rupture', name: 'Sao Vỡ', mode: 'point', dur: 0.70, cd: 1.70, shake: 3.2,
  under(w, e, p) {
    const g = pop(p, 0.10), fd = fade(p, 0.22);
    puddle(e.x, e.y, 34 * g, 15 * g, C.cyan, 0.16 * fd, e.seed, 7);
    cracks(e.x, e.y, 8, 27 * g, C.cyan, 0.32 * fd, e.seed + 1, 0.45, 1.0);
    ring(e.x, e.y, 20 + 70 * eo(p), 2.4, C.cyan, 0.26 * fd, 0.34);
  },
  mid(w, e, p) {
    const g = pop(p, 0.08), fd = fade(p, 0.20), cy = e.y - 6;
    star(e.x, cy, C.cyan, 14, 6, (30 + 86 * eo(p)) * g, 3.0, 1.0 * fd, e.seed);
    ring(e.x, cy, 12 + 108 * eo(p), 3.4 * (1 - p * 0.7) + 0.6, C.pale, 0.65 * fd, 1, 1.4);
    core(e.x, cy, 24 * g * (1 - p * 0.45), C.cyan, 0.85 * fd, 1.6);
    core(e.x, cy, 9 * g, WHITE, 1.25 * fd);
    glare(e.x, cy, 72, 40, C.pale, 0.55 * fd);
  },
  over(w, e, p) {
    const fd = fade(p, 0.18);
    sparks(e.x, e.y - 6, 26, 16, 34 + 76 * eo(p), C.pale, 0.9 * fd, e.seed + 3, 1.1,
           1, 0, TAU, 7 * (1 - p));
  },
  hit(w, e) { if (crossed(e, 0.10)) hitCircle(w, e.x, e.y - 6, 44, 165, C.pale, false, 42); },
});
SKILLS.push({
  id: 'whirl_slash', name: 'Lốc Chém', mode: 'self', dur: 0.48, cd: 0.90, shake: 1.6,
  under(w, e, p) {
    const h = w.hero, fd = fade(p, 0.32), lead = e.ang + p * TAU * 1.2;
    for (let k = 0; k < 3; k++)                   // broken dust ring: a closed one is a donut
      arc(h.x, h.y - 1, 28, lead - k * 1.9, 1.5, 2.4, C.steel, 0.26 * fd, 0.36);
    puddle(h.x, h.y - 1, 26, 10, C.steel, 0.08 * fd, e.seed, 6);
  },
  mid(w, e, p) {
    const h = w.hero, cx = h.x, cy = h.y - 7, fd = fade(p, 0.40);
    // The crescent grows as the swing travels: a fixed-radius arc read as a collar
    // around the hero instead of as a blade going somewhere.
    const lead = e.ang + p * TAU * 1.2, r = 17 + 13 * eo(c01(p / 0.55));
    for (let k = 0; k < 3; k++) {                 // one live edge plus two cooling ones
      const a = (1.0 - k * 0.28) * fd;
      arc(cx, cy, r + k * 3.0, lead - k * 0.62, 1.7 - k * 0.20,
          3.4 - k * 0.70, k === 0 ? WHITE : C.steel, a, 0.62, 1.5, 2.4);
    }
    arc(cx, cy, r - 2, lead + Math.PI - 0.3, 1.25, 2.2, C.steel, 0.42 * fd, 0.62, 1.5, 2.4);
    const tx = cx + Math.cos(lead) * r, ty = cy + Math.sin(lead) * r * 0.62;
    core(tx, ty, 4.6, WHITE, 1.0 * fd);
    line(tx, ty, cx + Math.cos(lead + 0.5) * (r + 11),
         cy + Math.sin(lead + 0.5) * (r + 11) * 0.62, 1.3, WHITE, 0.75 * fd, 1.5, 0.7);
    sparks(tx, ty, 9, 0, 10, C.pale, 0.85 * fd, e.seed + 2, 1.0, 1, 0, TAU, 6);
  },
  hit(w, e) {
    const h = w.hero;
    if (crossed(e, 0.30)) hitCircle(w, h.x, h.y - 7, 32, 118, WHITE, false, 34);
  },
});

SKILLS.push({
  id: 'ember_field', name: 'Ruộng Than', mode: 'point', dur: 1.20, cd: 3.40, shake: 1.4,
  under(w, e, p) {
    const g = pop(p, 0.18), fd = fade(p, 0.55);
    puddle(e.x, e.y, 44 * g, 19 * g, C.ash, 0.30, e.seed, 8);
    puddle(e.x, e.y, 30 * g, 13 * g, C.ember, 0.20 * (0.4 + 0.6 * fd), e.seed + 1, 6);
    cracks(e.x, e.y, 9, 30 * g, C.ember, 0.34 * fd, e.seed + 2, 0.45, 1.1);
    ring(e.x, e.y, 44 * g, 2.0, C.ember, 0.30 * fd, 0.42);
  },
  mid(w, e, p) {
    const rng = mulberry32(e.seed), g = pop(p, 0.16), fd = fade(p, 0.5);
    for (let i = 0; i < 7; i++) {                 // pillars at different ages
      const a = i / 7 * TAU + 0.3, rr = 38 * g;
      const px = e.x + Math.cos(a) * rr, py = e.y + Math.sin(a) * rr * 0.42;
      const ph = ((p * 2.6 + i * 0.37) % 1);
      const hh = (10 + 16 * Math.sin(Math.PI * ph)) * g;
      beam(px, py, -Math.PI / 2, 0, hh, 3.4, 0.6, C.ember, 0.95 * fd, 1.3, 1.1);
      beam(px, py, -Math.PI / 2, 0, hh * 0.62, 1.2, 0.4, C.gold, 0.9 * fd, 1.2, 1.2);
      core(px, py - 1, 4.0, C.ember, 0.7 * fd, 1.6);
      if (rng() > 0.4) sparks(px, py - hh * 0.7, 3, 0, 5, C.gold, 0.7 * fd,
                              e.seed + i, 0.9, 1, -Math.PI, 0, 4);
    }
    cloud(e.x, e.y - 12, 26, C.ash, 0.10 * fd, e.seed + 5, 7, 0.5);
    core(e.x, e.y - 3, 13 * g, C.ember, 0.55 * fd, 1.8);
  },
  hit(w, e) {
    for (const at of [0.16, 0.42, 0.68, 0.92])
      if (crossed(e, at)) hitCircle(w, e.x, e.y, 42, 46, C.gold, false, 6);
  },
});
SKILLS.push({
  id: 'frost_prison', name: 'Ngục Băng', mode: 'point', dur: 1.30, cd: 5.80, shake: 2.0,
  under(w, e, p) {
    const g = pop(p, 0.20), fd = fade(p, 0.60);
    puddle(e.x, e.y - 2, 46 * g, 19 * g, C.cyan, 0.22 * (0.5 + 0.5 * fd), e.seed, 7);
    for (const s of [[-48, 8, 15], [46, -8, 13], [14, 18, 12], [-26, -22, 10]])
      puddle(e.x + s[0], e.y + s[1], s[2] * g, s[2] * 0.42 * g, C.cyan, 0.13 * fd,
             e.seed + s[2], 6);
    cracks(e.x, e.y - 1, 9, 30 * g, C.cyan, 0.34 * fd, e.seed + 1, 0.45, 1.0);
    ring(e.x, e.y - 2, 64 * g, 2.4, C.cyan, 0.15 * fd, 0.34);
  },
  mid(w, e, p) {
    const rng = mulberry32(e.seed), g = pop(p, 0.22), fd = fade(p, 0.62);
    cloud(e.x, e.y - 4, 34, C.cyan, 0.10 * fd, e.seed + 13, 9, 0.34);
    for (const off of [-34, -18, 0, 18, 34])                 // inner cold half
      shard(e.x + off, e.y - 16, (14 + 7 * rng()) * g, 2.6 + rng(), C.deep, C.pale,
            0.70 * fd, off * 0.010);
    core(e.x, e.y - 20, 25 * g, C.deep, 0.60 * fd, 1.5);
    core(e.x, e.y - 22, 15 * g, C.ice, 0.55 * fd, 1.8);
    const s = g, dia = [[e.x, e.y - 48 * s], [e.x + 20 * s, e.y - 21 * s], [e.x, e.y + 3],
                        [e.x - 20 * s, e.y - 21 * s], [e.x, e.y - 48 * s]];
    polyline(dia, 1.6, C.pale, 0.90 * fd);
    for (const l of [[-9, -41, -3, -7], [10, -37, 4, -9], [-14, -26, 13, -24], [0, -46, 0, 0]])
      line(e.x + l[0] * s, e.y + l[1] * s, e.x + l[2] * s, e.y + l[3] * s, 1.0, C.pale, 0.42 * fd);
    for (const off of [-40, -26, -11, 11, 26, 40])           // outer bright cage
      shard(e.x + off, e.y + 5, (19 + 15 * rng()) * g, 3.4 + rng() * 1.2, C.ice, C.pale,
            1.0 * fd, off * 0.007);
    sparks(e.x, e.y - 26, 22, 12, 52 * g, C.pale, 0.80 * fd, e.seed + 21, 1.1);
  },
  over(w, e, p) {
    const snow = mulberry32(e.seed + 88), fd = fade(p, 0.35);
    for (let i = 0; i < 26; i++)
      core(snow.range(e.x - 90, e.x + 90), snow.range(e.y - 84, e.y + 60) + p * 14,
           snow.range(0.8, 1.5), C.pale, snow.range(0.3, 0.8) * fd, 1.3);
  },
  hit(w, e) {
    if (!crossed(e, 0.24)) return;
    for (const f of foesIn(w, e.x, e.y - 8, 40)) { hurt(w, f, 150, C.pale); f.frozen = 1.9; }
  },
});
SKILLS.push({
  id: 'chain_bolt', name: 'Sấm Chuỗi', mode: 'point', dur: 0.60, cd: 2.50, shake: 2.2,
  init(w, e) {
    const h = w.hero, picked = [];
    e.data.nodes = [[h.x + (h.flip ? -9 : 9), h.y - 15]];
    let cx = e.x, cy = e.y - 8;
    for (let i = 0; i < 3; i++) {
      const c = nearest(w, cx, cy, 5, 120).find(f => picked.indexOf(f) < 0);
      if (!c) break;
      picked.push(c); cx = c.x; cy = midY(c);
      e.data.nodes.push([cx, cy]);
    }
    if (!picked.length) e.data.nodes.push([e.x, e.y - 8]);
    e.data.foes = picked;
  },
  mid(w, e, p) {
    const n = e.data.nodes, fd = fade(p, 0.30);
    const flick = 0.58 + 0.42 * Math.sin(p * 47);      // arc flicker, not a steady tube
    for (let i = 0; i < n.length - 1; i++) {
      const on = c01((p - i * 0.13) / 0.10);
      if (on <= 0) continue;
      const a = on * fd * flick;
      bolt(n[i][0], n[i][1], n[i + 1][0], n[i + 1][1], C.voltc, C.pale, a,
           7, 6.5, e.seed + i * 7, 2.4, 2);
      core(n[i + 1][0], n[i + 1][1], 7, C.volt, 0.85 * on * fd, 1.8);
      core(n[i + 1][0], n[i + 1][1], 3, WHITE, 1.15 * on * fd);
      ring(n[i + 1][0], n[i + 1][1] + 5, 8 + 12 * eo(on), 1.6, C.volt, 0.40 * fd * on, 0.40);
      sparks(n[i + 1][0], n[i + 1][1], 6, 2, 12, C.pale, 0.7 * on * fd, e.seed + i, 1.0);
    }
    core(n[0][0], n[0][1], 6, C.volt, 0.9 * fd);
    core(n[0][0], n[0][1], 2.4, WHITE, 1.1 * fd);
  },
  hit(w, e) {
    e.data.foes.forEach((f, i) => {
      if (crossed(e, 0.04 + i * 0.13)) hurt(w, f, 132 - i * 26, C.pale, false, 0, 0);
    });
  },
});

SKILLS.push({
  id: 'blood_rend', name: 'Xé Máu', mode: 'dir', dur: 0.50, cd: 1.30, shake: 2.4,
  init(w, e) {
    const h = w.hero;
    e.data.cx = h.x + Math.cos(e.ang) * 26;
    e.data.cy = h.y - 7 + Math.sin(e.ang) * 26 * 0.6;
  },
  under(w, e, p) {
    const d = e.data, fd = fade(p, 0.35), g = pop(p, 0.2);
    puddle(d.cx, d.cy + 7, 26 * g, 10 * g, C.blood, 0.26 * (0.5 + 0.5 * fd), e.seed, 6);
    dashline(d.cx, d.cy + 8, d.cx + Math.cos(e.ang) * 40, d.cy + 8 + Math.sin(e.ang) * 20,
             5, 1.6, C.blood, 0.30 * fd, 0.7);
  },
  mid(w, e, p) {
    const d = e.data, fd = fade(p, 0.28), sw = 1.5 + 0.5 * p;
    for (let k = 0; k < 2; k++)
      arc(d.cx, d.cy, 24 - k * 6, e.ang, sw, 3.2 - k * 1.4, k ? C.blush : C.blood,
          (1.0 - k * 0.25) * fd, 0.72, 1.4, 2.6);
    arc(d.cx, d.cy, 24, e.ang, sw * 0.55, 1.0, WHITE, 0.8 * fd, 0.72, 1.4, 3.0);
    for (const s of [1, -1]) {
      const b = e.ang + s * sw * 0.5;
      const tx = d.cx + Math.cos(b) * 24, ty = d.cy + Math.sin(b) * 24 * 0.72;
      sparks(tx, ty, 9, 0, 10, C.blush, 0.85 * fd, e.seed + s + 2, 1.1, 1,
             b - 0.7, b + 0.7, 9 * (1 - p));
    }
    core(d.cx, d.cy, 8, C.blood, 0.5 * fd, 1.8);
  },
  hit(w, e) {
    const d = e.data;
    if (crossed(e, 0.22))
      hitCircle(w, d.cx, d.cy, 27, 210, C.blush, true, 46);
  },
});
SKILLS.push({
  id: 'void_collapse', name: 'Hư Không Sụp', mode: 'point', dur: 1.10, cd: 6.50, shake: 2.6,
  under(w, e, p) {
    const g = pop(p, 0.25), fd = fade(p, 0.70);
    ring(e.x, e.y, 52 * g, 2.2, C.voidc, 0.38 * fd, 0.40);
    dial(e.x, e.y, 49 * g, 18, C.lilac, 0.35 * fd, 0.40, 3, 1.0);
    cracks(e.x, e.y, 7, 26 * g, C.voidc, 0.25 * fd, e.seed, 0.45, 1.0);
  },
  mid(w, e, p) {
    const g = pop(p, 0.18), fd = fade(p, 0.72), cy = e.y - 10;
    const shut = c01((p - 0.66) / 0.34);
    const r = 22 * g * (1 - 0.62 * shut);
    unlight(e.x, cy, r * 1.18, 1.6 * g);              // a real void, not a grey disc
    ring(e.x, cy, r * 1.02, 1.1, C.lilac, 1.0 * fd, 1, 1.6);
    ring(e.x, cy, r, 2.0, C.voidc, 0.85 * fd, 1, 1.3);
    spiral(e.x, cy, 3, 54 * (1 - 0.45 * p), r * 0.95, 0.9, C.lilac, 0.75 * fd,
           1.8, 0.58, p * 3.4, 20);
    sparks(e.x, cy, 20, r + 6, 56, C.viop, 0.75 * fd, e.seed + 4, 1.0, 0.6, 0, TAU,
           -6 * (1 - p));
    if (shut > 0) {                                    // the collapse pop
      const b = shut * fade(p, 0.80);
      star(e.x, cy, C.viop, 11, 4, 16 + 62 * eo(shut), 2.4, 1.0 * b, e.seed + 9);
      core(e.x, cy, 10 + 8 * shut, WHITE, 1.1 * b);
      ring(e.x, cy, 14 + 64 * eo(shut), 2.4, C.viop, 0.7 * b, 1, 1.4);
    }
  },
  hit(w, e) {
    const dt = (e.p - e.pt) * e.dur;
    if (e.p < 0.66) pullToward(w, e.x, e.y - 10, 72, 46, dt);
    for (const at of [0.30, 0.52]) if (crossed(e, at)) hitCircle(w, e.x, e.y - 10, 30, 72, C.lilac);
    if (crossed(e, 0.72)) hitCircle(w, e.x, e.y - 10, 48, 255, C.viop, true, 58);
  },
});
SKILLS.push({
  id: 'judgment_beam', name: 'Trụ Phán Xét', mode: 'point', dur: 0.95, cd: 8.00, shake: 3.6,
  under(w, e, p) {
    const g = pop(p, 0.14), fd = fade(p, 0.50);
    puddle(e.x, e.y, 52 * g, 22 * g, C.holy, 0.35 * fd, e.seed, 8);
    ring(e.x, e.y, 50 * g, 2.0, C.holy, 0.55 * fd, 0.42);
    dial(e.x, e.y, 47 * g, 24, C.holyp, 0.60 * fd, 0.42, 3, 1.1);
    ring(e.x, e.y, 40 * g, 3.4, C.holyp, 0.75 * fd, 0.42);
    ring(e.x, e.y, 30 * g, 2.5, C.holy, 0.90 * fd, 0.42);
    for (let i = 0; i < 8; i++) {                       // rune ticks on the seal
      const a = i / 8 * TAU + 0.2;
      const gx = e.x + Math.cos(a) * 35 * g, gy = e.y + Math.sin(a) * 35 * 0.42 * g;
      line(gx - 2.0, gy, gx + 2.0, gy, 1.0, C.holyp, 0.70 * fd);
      line(gx, gy - 1.6, gx, gy + 1.6, 1.0, C.holyp, 0.55 * fd);
    }
  },
  mid(w, e, p) {
    const drop = c01(p / 0.20), land = c01((p - 0.20) / 0.10), fd = fade(p, 0.42);
    // "The sky" is the top edge of the view, so the shaft has to be anchored to the
    // camera: with a fixed world y it would be off screen the moment you walk down.
    const sky = CAMY, yb = sky + (e.y - sky) * drop;
    column(e.x, sky, yb, 34, 13, C.holy, C.holy, 0.26 * fd);  // flared toward the sky
    core(e.x, sky + 2, 17, C.holyp, 0.70 * fd, 2.0);          // aperture
    column(e.x, sky, yb, 12, 21, C.holy, C.holyp, 1.10 * fd);
    column(e.x, sky, yb, 5, 8, C.holyp, WHITE, 0.95 * fd);
    if (land > 0) {
      for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
        const ax = e.x + s * (30 + k * 16);
        beam(ax, e.y + 2, -Math.PI / 2, 0, (54 - k * 12) * land, 4.0, 0.6,
             C.holy, (1.15 - k * 0.35) * fd, 1.2, 1.15);
        beam(ax, e.y + 2, -Math.PI / 2, 0, (42 - k * 10) * land, 1.2, 0.4,
             C.holyp, (1.10 - k * 0.30) * fd, 1.2, 1.30);
      }
      core(e.x, e.y, 19, C.holyp, 0.75 * land * fd, 2.4);
      core(e.x, e.y, 8, WHITE, 1.2 * land * fd);
      glare(e.x, e.y - 6, 62, 38, C.holyp, 0.50 * land * fd);
    }
    const rng = mulberry32(e.seed + 3);
    for (let i = 0; i < 14; i++) {                     // motes rising outside the shaft
      const s = rng() < 0.5 ? -1 : 1;
      const mx = e.x + s * rng.range(16, 48), my = e.y - rng.range(2, 60) - p * 12;
      core(mx, my, rng.range(0.8, 1.4), C.holyp, rng.range(0.3, 0.8) * fd, 1.3);
    }
  },
  hit(w, e) {
    if (!crossed(e, 0.24)) return;
    const inner = foesIn(w, e.x, e.y, 30);
    for (const f of inner) hurt(w, f, 430, C.holyp, true);
    for (const f of foesIn(w, e.x, e.y, 52))
      if (inner.indexOf(f) < 0) hurt(w, f, 90, C.holy, false, 0, 0);
  },
});
function alongPath(pts, seg, tot, p) {
  let d = p * tot;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const t = clamp(d / Math.max(seg[i], 1e-3), 0, 1);
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
              pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t, i, t];
    }
    d -= seg[i];
  }
  return [pts[0][0], pts[0][1], 0, 0];
}

SKILLS.push({
  id: 'ricochet_shot', name: 'Đạn Nảy', mode: 'point', dur: 0.62, cd: 2.10, shake: 1.8,
  init(w, e) {
    const h = w.hero, picked = [];
    let cx = e.x, cy = e.y - 8;
    for (let i = 0; i < 3; i++) {
      const c = nearest(w, cx, cy, 5, 150).find(f => picked.indexOf(f) < 0);
      if (!c) break;
      picked.push(c); cx = c.x; cy = midY(c);
    }
    const pts = [[h.x + (h.flip ? -9 : 9), h.y - 15]];
    for (const f of picked) pts.push([f.x, midY(f)]);
    if (!picked.length) pts.push([e.x, e.y - 8]);
    const a = pts[pts.length - 1], b = pts[Math.max(0, pts.length - 2)];
    const dx = a[0] - b[0], dy = a[1] - b[1], dd = Math.max(Math.hypot(dx, dy), 1e-3);
    pts.push([a[0] + dx / dd * 58, a[1] + dy / dd * 58]);   // exit leg
    const seg = []; let tot = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      seg.push(L); tot += L;
    }
    tot = Math.max(tot, 1e-3);
    const arr = []; let acc = 0;
    for (const L of seg) { acc += L; arr.push(acc / tot); }
    e.data = { pts, seg, tot, arr, foes: picked };
  },
  under(w, e, p) {
    const d = e.data, fd = fade(p, 0.4);
    for (let k = 0; k < d.arr.length - 1; k++) {
      if (p <= d.arr[k]) continue;
      const P = d.pts[k + 1];
      puddle(P[0], P[1] + 6, 11 + k * 3, (11 + k * 3) * 0.45, C.smoke, 0.26 * fd,
             e.seed + k, 6);
    }
  },
  mid(w, e, p) {
    const d = e.data, fd = fade(p, 0.50);
    const at = alongPath(d.pts, d.seg, d.tot, p);
    const bx = at[0], by = at[1], li = at[2];
    for (let i = 0; i < d.pts.length - 1; i++) {
      const A = d.pts[i], B = d.pts[i + 1];
      const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
      if (i < li) {                                   // legs already flown: broken trail
        const age = 1 - (i + 1) / (li + 1);
        dashline(A[0], A[1], B[0], B[1], 7, 3.2, C.lime, 0.50 * fd * (0.35 + 0.65 * age), 0.55);
        for (const t of [0.42, 0.74])
          chevron(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, ang, 4.0,
                  C.limeh, 0.55 * fd);
      } else if (i === li) {                           // the live leg
        const trav = Math.hypot(bx - A[0], by - A[1]), tl = Math.min(trav, 26);
        const hx = bx - Math.cos(ang) * tl, hy = by - Math.sin(ang) * tl;
        if (trav > tl + 4)                             // older part of this leg: broken up
          dashline(hx, hy, A[0], A[1], Math.max(2, Math.round((trav - tl) / 9)), 2.4,
                   C.lime, 0.34 * fd, 0.9);
        line(bx, by, hx, hy, 3.6, C.lime, 0.26 * fd, 1.5, 0.85);
        line(bx, by, hx, hy, 1.7, C.lime, 0.80 * fd, 1.5, 0.8);
        line(bx, by, hx, hy, 0.8, C.limeh, 1.0 * fd, 1.5, 0.75);
      }
    }
    for (let k = 0; k < d.arr.length - 1; k++) {       // bounce impacts, each older
      if (p <= d.arr[k]) continue;
      const age = c01((p - d.arr[k]) / 0.24), s = 1 + k * 0.32, P = d.pts[k + 1];
      const liv = (1 - age) * fd;
      for (let q = 0; q < 3; q++)
        arc(P[0], P[1], 14 * s * (0.5 + 0.5 * eo(age)), q / 3 * TAU + 0.6, 1.5, 1.3,
            C.lime, 0.42 * liv);
      star(P[0], P[1], C.lime, 7, 2, 15 * s * (0.4 + 0.6 * eo(age)), 2.2,
           (1 - age * 0.75) * fd, e.seed + k);
      for (let q = 0; q < 4; q++)
        beam(P[0], P[1], q / 4 * TAU + 0.4, 1, 10 * s, 2.6, 0.6, C.lime, 0.80 * liv, 1.3);
      core(P[0], P[1], 4.2 * s * (1 - age * 0.5), C.lime, 0.80 * liv, 2.6);
      core(P[0], P[1], 1.8 * s, C.limeh, 1.30 * liv);
    }
    const m = d.pts[0], mf = fade(p, 0.10);
    star(m[0], m[1], C.lime, 5, 1, 13, 2.0, 0.9 * mf, e.seed + 1);
    core(m[0], m[1], 5, C.limeh, 1.0 * mf);
    cloud(m[0], m[1], 8, C.smoke, 0.22 * fade(p, 0.30), e.seed + 2, 5, 1);
    if (p < 1) {
      const A = d.pts[li], B = d.pts[li + 1];
      const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
      dashline(bx, by, bx - Math.cos(ang) * 18, by - Math.sin(ang) * 18, 5, 1.6,
               C.lime, 0.60 * fd, 0.85);
      beam(bx, by, ang, 0, 9, 1.6, 0.4, C.limeh, 0.90 * fd, 1.3, 1.4);
      core(bx, by, 4.4, C.lime, 1.0 * fd, 2.0);
      core(bx, by, 1.8, WHITE, 1.2 * fd);
    }
  },
  hit(w, e) {
    const d = e.data;
    d.foes.forEach((f, k) => {
      if (crossed(e, d.arr[k])) hurt(w, f, k === 2 ? 132 : 92, C.limeh, k === 2, 0, 0);
    });
  },
});
SKILLS.push({
  id: 'shadow_dash', name: 'Bóng Lướt', mode: 'point', dur: 0.55, cd: 3.00, shake: 1.2,
  init(w, e) {
    const h = w.hero;
    e.data.from = [h.x, h.y];
    e.data.to = [clamp(e.x, BOUND.x0, BOUND.x1), clamp(e.y, BOUND.y0, BOUND.y1)];
  },
  under(w, e, p) {
    const d = e.data, fd = fade(p, 0.35);
    ring(d.from[0], d.from[1] - 1, 12 + 16 * eo(p), 1.8, C.indigo, 0.40 * fd, 0.40);
    ring(d.to[0], d.to[1] - 1, 10 + 14 * eo(p), 2.0, C.indigop, 0.45 * fd, 0.40);
    dashline(d.from[0], d.from[1] - 1, d.to[0], d.to[1] - 1, 6, 2.2, C.indigo, 0.30 * fd, 0.6);
  },
  mid(w, e, p) {
    const d = e.data, fd = fade(p, 0.28);
    const ang = Math.atan2(d.to[1] - d.from[1], d.to[0] - d.from[0]);
    line(d.from[0], d.from[1] - 7, d.to[0], d.to[1] - 7, 5.0, C.indigo, 0.35 * fd);
    line(d.from[0], d.from[1] - 7, d.to[0], d.to[1] - 7, 1.6, C.indigop, 0.85 * fd);
    // A stopped ghost must be flash-white at low alpha: a dim sprite over a dark
    // floor is a smudge nobody can name.
    for (const t of [0.25, 0.5, 0.78]) {
      const gx = d.from[0] + (d.to[0] - d.from[0]) * t;
      const gy = d.from[1] + (d.to[1] - d.from[1]) * t;
      blit(HERO, Math.round(gx - 5), Math.round(gy - 14), 0.85, w.hero.flip,
           0.30 * fd * (0.5 + 0.5 * t), 1);
    }
    for (const t of [0.35, 0.68])
      chevron(d.from[0] + (d.to[0] - d.from[0]) * t, d.from[1] - 7 + (d.to[1] - d.from[1]) * t,
              ang, 5.0, C.indigop, 0.7 * fd);
    core(d.to[0], d.to[1] - 7, 9, C.indigo, 0.60 * fd, 1.8);
    sparks(d.to[0], d.to[1] - 7, 16, 3, 22, C.indigop, 0.85 * fd, e.seed, 1.1, 1,
           0, TAU, 6 * (1 - p));
  },
  hit(w, e) {
    if (!crossed(e, 0.14)) return;
    const h = w.hero, d = e.data;
    h.x = d.to[0]; h.y = d.to[1];
    hitLine(w, d.from[0], d.from[1] - 7, d.to[0], d.to[1] - 7, 9, 155, C.indigop, false, 32);
  },
});

SKILLS.push({
  id: 'spirit_summon', name: 'Triệu Linh', mode: 'point', dur: 1.00, cd: 3.80, shake: 1.6,
  under(w, e, p) {
    const g = pop(p, 0.20), fd = fade(p, 0.55);
    ring(e.x, e.y, 34 * g, 2.2, C.spirit, 0.50 * fd, 0.40);
    dial(e.x, e.y, 31 * g, 12, C.spiritp, 0.45 * fd, 0.40, 2, 1.0);
    puddle(e.x, e.y, 28 * g, 12 * g, C.spirit, 0.16 * fd, e.seed, 7);
  },
  mid(w, e, p) {
    const rise = eo(c01(p / 0.45)), fd = fade(p, 0.50);
    const cy = e.y - 6 - 26 * rise;
    beam(e.x, e.y + 1, -Math.PI / 2, 0, 30 + 26 * rise, 6.0, 1.0, C.spirit, 0.70 * fd, 1.3, 1.4);
    for (let k = 0; k < 2; k++)                       // twin wisps winding up the shaft
      spiral(e.x, cy + 14, 1, 16, 2, 0.75, C.spiritp, 0.65 * fd, 1.4, 0.55,
             p * 5.0 + k * Math.PI, 16);
    core(e.x, cy, 11 * (0.5 + 0.5 * rise), C.spirit, 0.85 * fd, 1.7);
    core(e.x, cy, 4.5, C.spiritp, 1.15 * fd);
    arc(e.x, cy + 3, 9, -Math.PI / 2, Math.PI * 1.1, 1.4, C.spiritp, 0.75 * fd, 1.2, 1.4, 2.4);
    for (const s of [-1, 1])                          // two trailing veils
      arc(e.x, cy + 8, 13, Math.PI / 2 + s * 0.55, 0.9, 2.0, C.spirit, 0.55 * fd, 1.4);
    sparks(e.x, cy + 6, 18, 4, 24, C.spiritp, 0.80 * fd, e.seed + 2, 1.0, 1.2,
           Math.PI, TAU, 0);
    glare(e.x, cy, 26, 20, C.spiritp, 0.35 * fd);
  },
  hit(w, e) {
    for (const at of [0.30, 0.55, 0.80])
      if (crossed(e, at)) hitCircle(w, e.x, e.y - 14, 34, 78, C.spiritp, false, 12);
  },
});
SKILLS.push({
  id: 'toxic_bloom', name: 'Nụ Độc', mode: 'point', dur: 1.50, cd: 4.20, shake: 1.0,
  under(w, e, p) {
    const g = pop(p, 0.22), fd = fade(p, 0.62);
    puddle(e.x, e.y, 40 * g, 17 * g, C.toxic, 0.24 * (0.45 + 0.55 * fd), e.seed, 7);
    for (const s of [[-30, 10, 11], [28, -6, 9], [6, 16, 8]])
      puddle(e.x + s[0], e.y + s[1], s[2] * g, s[2] * 0.45 * g, C.toxicp, 0.15 * fd,
             e.seed + s[2], 5);
    ring(e.x, e.y, 42 * g, 1.8, C.toxicp, 0.26 * fd, 0.44);
  },
  mid(w, e, p) {
    const rng = mulberry32(e.seed + 4), g = pop(p, 0.25), fd = fade(p, 0.55);
    cloud(e.x, e.y - 12, 34 * g, C.toxic, 0.20 * fd, e.seed + 1, 9, 0.62);
    cloud(e.x, e.y - 18, 22 * g, C.toxicp, 0.16 * fd, e.seed + 2, 7, 0.70);
    for (let i = 0; i < 9; i++) {                    // bubbles at staggered ages
      const ph = (p * 1.7 + i * 0.31) % 1;
      const a = rng.range(0, TAU), rr = rng.range(4, 34) * g;
      const bx = e.x + Math.cos(a) * rr, by = e.y + Math.sin(a) * rr * 0.5 - ph * 24;
      const br = 2.0 + 2.6 * (1 - ph);
      if (ph < 0.78) core(bx, by, br, C.toxicp, 0.75 * fd * (1 - ph), 1.6);
      else ring(bx, by, br * 2.2, 1.0, C.toxicp, 0.7 * fd * (1 - ph) * 4, 1, 1.4);
    }
    core(e.x, e.y - 8, 12 * g, C.toxic, 0.45 * fd, 1.8);
    sparks(e.x, e.y - 10, 12, 6, 34 * g, C.toxicp, 0.55 * fd, e.seed + 5, 0.9, 0.7);
  },
  hit(w, e) {
    for (const at of [0.22, 0.45, 0.68, 0.90]) {
      if (!crossed(e, at)) continue;
      for (const f of foesIn(w, e.x, e.y, 40)) { hurt(w, f, 44, C.toxicp); f.slow = 1.0; }
    }
  },
});

SKILLS.push({
  id: 'gale_vortex', name: 'Xoáy Cuồng Phong', mode: 'point', dur: 1.20, cd: 5.20, shake: 1.4,
  under(w, e, p) {
    const g = pop(p, 0.20), fd = fade(p, 0.60);
    for (let k = 0; k < 3; k++)                      // broken, so it is a gust not a target
      arc(e.x, e.y, 46 * g, k / 3 * TAU - p * 3.4, 1.35, 2.2, C.sand, 0.40 * fd, 0.40);
    for (let k = 0; k < 2; k++)                      // spent dust: cooler, lagging behind
      arc(e.x, e.y, 33 * g, k * Math.PI - p * 2.2 + 0.9, 1.1, 1.8, C.smoke, 0.34 * fd, 0.40);
    puddle(e.x, e.y, 30 * g, 13 * g, C.sand, 0.13 * fd, e.seed, 8);
    for (let k = 0; k < 3; k++)                      // dust already thrown clear
      dashline(e.x, e.y, e.x + Math.cos(k / 3 * TAU + p * 2) * 58,
               e.y + Math.sin(k / 3 * TAU + p * 2) * 24, 5, 1.4, C.sand, 0.22 * fd, 0.8);
  },
  mid(w, e, p) {
    const g = pop(p, 0.22), fd = fade(p, 0.58);
    for (let k = 0; k < 4; k++) {                    // funnel: wide at the top, tight below
      const t = k / 3, yy = e.y - 6 - 30 * t;
      spiral(e.x, yy, 2, (10 + 26 * t) * g, 4 * g, 0.55, t > 0.5 ? C.smoke : C.sand,
             (0.85 - t * 0.10) * fd, 2.0 - t * 0.30, 0.42, p * 6.5 + k * 0.8, 18);
    }
    for (let k = 0; k < 2; k++) {                    // streaks winding up the outside
      const ph = p * 6.0 + k * Math.PI, pts = [];
      for (let s = 0; s <= 6; s++) {
        const t = s / 6, rr = (34 - 24 * t) * g, aa = ph + t * 2.4;
        pts.push([e.x + Math.cos(aa) * rr, e.y - 2 - 34 * t + Math.sin(aa) * rr * 0.35]);
      }
      for (let s = 0; s < 6; s++)
        line(pts[s][0], pts[s][1], pts[s + 1][0], pts[s + 1][1], 1.6 - s * 0.13,
             k ? C.sandp : C.sand, (0.60 - s * 0.06) * fd);
    }
    beam(e.x, e.y + 1, -Math.PI / 2, 0, 40 * g, 5.0, 1.2, C.sandp, 0.40 * fd, 1.3, 1.5);
    core(e.x, e.y - 4, 9 * g, C.sandp, 0.55 * fd, 1.8);
    const rng = mulberry32(e.seed + 7);
    for (let i = 0; i < 12; i++) {                   // debris riding the funnel
      const a = rng.range(0, TAU) + p * 7, rr = rng.range(6, 34) * g;
      const dx = e.x + Math.cos(a) * rr, dy = e.y - rng.range(0, 34) + Math.sin(a) * rr * 0.35;
      chevron(dx, dy, a + Math.PI / 2, rng.range(2.5, 4.5), C.sandp, 0.55 * fd, 1.0);
    }
  },
  hit(w, e) {
    const dt = (e.p - e.pt) * e.dur;
    pullToward(w, e.x, e.y, 60, 34, dt);
    for (const at of [0.25, 0.50, 0.75, 0.95])
      if (crossed(e, at)) hitCircle(w, e.x, e.y, 38, 52, C.sandp, false, 4);
  },
});
SKILLS.push({
  id: 'aegis_reflect', name: 'Khiên Phản', mode: 'self', dur: 0.85, cd: 4.60, shake: 1.8,
  under(w, e, p) {
    const h = w.hero, g = pop(p, 0.15), fd = fade(p, 0.45);
    ring(h.x, h.y - 1, 30 * g, 2.2, C.gold, 0.40 * fd, 0.38);
    dial(h.x, h.y - 1, 27 * g, 12, C.holyp, 0.35 * fd, 0.38, 2, 1.0);
  },
  mid(w, e, p) {
    const h = w.hero, g = pop(p, 0.12), fd = fade(p, 0.40);
    const cx = h.x, cy = h.y - 7;
    hexshield(cx, cy, 24 * g, C.gold, C.holyp, 0.95 * fd, e.seed, 7);
    hexshield(cx, cy, 24 * g + 5 + 22 * eo(c01((p - 0.30) / 0.70)), C.gold, C.holyp,
              0.45 * fade(p, 0.30), e.seed + 1, 3);          // the pulse going out
    for (let i = 0; i < 6; i++) {                            // reflected bolts
      const a = i / 6 * TAU + 0.3 + p * 0.6;
      const r0 = 24 * g, r1 = r0 + 16 + 30 * eo(c01((p - 0.22) / 0.6));
      beam(cx, cy, a, r0, r1, 2.2, 0.5, C.gold, 0.85 * fd, 1.3, 1.3);
      beam(cx, cy, a, r0, r1 * 0.8, 0.9, 0.35, C.holyp, 0.85 * fd, 1.2, 1.4);
    }
    core(cx, cy, 12 * g, C.gold, 0.40 * fd, 2.0);
    glare(cx, cy, 34, 24, C.holyp, 0.35 * fd);
    sparks(cx, cy, 14, 22 * g, 30 * g + 10, C.holyp, 0.7 * fd, e.seed + 3, 1.0, 0.9);
  },
  hit(w, e) {
    const h = w.hero;
    if (crossed(e, 0.16)) hitCircle(w, h.x, h.y - 7, 34, 96, C.holyp, false, 62);
    if (crossed(e, 0.52)) hitCircle(w, h.x, h.y - 7, 52, 64, C.gold, false, 34);
  },
});

SKILLS.push({
  id: 'arcane_rain', name: 'Mưa Ma Thuật', mode: 'point', dur: 1.45, cd: 7.20, shake: 1.2,
  init(w, e) {
    const rng = mulberry32(e.seed), ms = [];
    for (let i = 0; i < 9; i++) {
      const a = rng.range(0, TAU), r = 42 * Math.sqrt(rng());
      ms.push({ x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r * 0.55,
                at: 0.14 + i * 0.082, sx: rng.range(-30, 30), cls: i % 3 });
    }
    e.data.ms = ms;
  },
  under(w, e, p) {
    for (const m of e.data.ms) {
      const age = c01((p - m.at) / 0.42);
      if (p <= m.at) continue;
      const liv = 1 - age;
      ring(m.x, m.y, 15 * (1.0 + 0.35 * age), 3.0 * liv + 0.8, C.vio,
           (0.30 + 0.55 * liv) * fade(p, 0.72), 0.44);
      if (age < 0.5) puddle(m.x, m.y, 13, 6, C.vio, 0.18 * (1 - age * 2), e.seed + m.cls, 5);
    }
  },
  mid(w, e, p) {
    const fd = fade(p, 0.72);
    for (const m of e.data.ms) {
      if (p < m.at) {                                  // telegraph + the bolt in flight
        const fall = c01((p - (m.at - 0.34)) / 0.34);
        if (fall <= 0) continue;
        reticle(m.x, m.y, 17, C.vio, 0.75 * fall, 0.42, 8, 1.0);
        const wid = [2.5, 1.8, 1.2][m.cls], br = [1.0, 0.72, 0.46][m.cls];
        const col = m.cls === 2 ? C.vio : C.viop;
        const sx = m.x + m.sx * (1 - fall), sy = m.y - 130 * (1 - fall);
        const hx = m.x + m.sx * (1 - fall) * 0.4, hy = m.y - 34 * (1 - fall);
        line(sx, sy, hx, hy, wid * 1.9, col, 0.28 * br);
        line(sx, sy, hx, hy, wid * 0.55, C.viop, 0.85 * br);
        dashline(sx, sy, sx - m.sx * 0.2, sy - 26, 4, wid * 0.6, col, 0.35 * br, 0.9);
        core(hx, hy, wid * 1.6, C.viop, 1.0 * br, 1.8);
      } else {                                         // impact, ageing away
        const age = c01((p - m.at) / 0.40), liv = (1 - age) * fd;
        if (age > 0.55) {
          cloud(m.x, m.y - 4, 12, C.vio, 0.16 * liv, e.seed + m.cls, 5, 0.7);
          core(m.x, m.y - 2, 5, C.vio, 0.35 * liv, 1.8);
        } else {
          for (let q = 0; q < 5; q++)
            beam(m.x, m.y, q / 5 * TAU + 0.5, 1, 12 * (0.5 + eo(age)), 2.4, 0.5,
                 C.viop, 0.85 * liv, 1.3, 1.2);
          star(m.x, m.y, C.vio, 8, 2, 18 * (0.4 + 0.6 * eo(age)), 2.0, liv, e.seed + m.cls);
          core(m.x, m.y, 6 * (1 - age * 0.4), C.viop, 1.0 * liv, 2.2);
          core(m.x, m.y, 2.4, WHITE, 1.2 * liv);
        }
      }
    }
  },
  hit(w, e) {
    for (const m of e.data.ms)
      if (crossed(e, m.at)) hitCircle(w, m.x, m.y, 19, 62, C.viop, false, 14);
  },
});
SKILLS.push({
  id: 'time_halt', name: 'Ngưng Thời', mode: 'point', dur: 1.30, cd: 9.50, shake: 0.8,
  under(w, e, p) {
    const g = pop(p, 0.18), fd = fade(p, 0.65), SQ = 0.38;
    ring(e.x, e.y, 74 * g, 3.0, C.steel, 0.55 * fd, SQ);
    dial(e.x, e.y, 71 * g, 60, C.steel, 0.42 * fd, SQ, 5, 1.0, 0.030, 0.075);
    ring(e.x, e.y, 52 * g, 2.0, C.steel, 0.35 * fd, SQ);
    ring(e.x, e.y, 26 * g, 1.6, C.steel, 0.28 * fd, SQ);
    // real numerals: bar groups read as tally marks, and IIII at 9 o'clock reads as 4
    const marks = [['12', -Math.PI / 2], ['3', 0], ['6', Math.PI / 2], ['9', Math.PI]];
    for (const m of marks) {
      const nx = e.x + Math.cos(m[1]) * 62 * g, ny = e.y + Math.sin(m[1]) * 62 * SQ * g;
      text3x5(m[0], Math.round(nx - textW(m[0]) * 0.5), Math.round(ny - 2), C.steel, 0.85 * fd);
    }
    line(e.x, e.y, e.x + 46 * g, e.y - 10 * g, 2.0, C.brass, 0.95 * fd);
    line(e.x, e.y, e.x + 13 * g, e.y - 20 * g, 2.0, C.brass, 0.70 * fd);
    line(e.x, e.y, e.x - 30 * g, e.y + 15 * g, 1.1, C.steel, 0.55 * fd);
    dashline(e.x - 26 * g, e.y + 13 * g, e.x - 14 * g, e.y + 22 * g, 3, 1.0, C.steel, 0.35 * fd);
    core(e.x, e.y, 4.0, C.brass, 1.0 * fd);
  },
  mid(w, e, p) {
    const g = pop(p, 0.20), fd = fade(p, 0.60);
    arc(e.x, e.y - 20, 46 * g, -Math.PI / 2, Math.PI * 0.95, 1.6, C.steel, 0.30 * fd, 1.25);
    arc(e.x, e.y - 20, 46 * g, Math.PI / 2, Math.PI * 0.95, 1.6, C.steel, 0.14 * fd, 1.25);
    for (const f of w.foes) {                        // where each one *would* have been
      if (f.frozen <= 0 || f.dying) continue;
      if (Math.hypot(f.x - e.x, f.y - e.y) > 95) continue;
      const dx = w.hero.x - f.x, dy = (w.hero.y - 1) - f.y;
      const d = Math.max(Math.hypot(dx, dy), 1e-3);
      const gx = f.x + dx / d * 16, gy = f.y + dy / d * 10;
      blit(GRIDS[f.kind], Math.round(gx - (f.w >> 1)), Math.round(gy - f.h),
           0.90, f.flip, 0.22 * fd, 1);
      for (let k = 0; k < 3; k++)
        core(f.x + dx / d * (5 + k * 4), midY(f) + dy / d * (3 + k * 2.5), 1.0,
             C.steel, 0.34 * fd, 1.2);
    }
    for (let i = 0; i < 6; i++) {                    // rim chevrons pointing inward
      const a = i / 6 * TAU + 0.25;
      chevron(e.x + Math.cos(a) * 84 * g, e.y + Math.sin(a) * 84 * 0.38 * g,
              a + Math.PI, 4.5, C.steel, 0.50 * fd, 1.0);
    }
    const rng = mulberry32(e.seed + 5);
    for (let i = 0; i < 34; i++) {                   // suspended dust, a quarter with tails
      const mx = rng.range(e.x - 95, e.x + 95), my = rng.range(e.y - 60, e.y + 40);
      core(mx, my, rng.range(0.7, 1.3), C.steel, rng.range(0.25, 0.7) * fd, 1.3);
      if (rng() < 0.25)
        line(mx, my, mx + rng.range(-4, 4), my + rng.range(-3, 3), 0.7, C.steel, 0.28 * fd);
    }
  },
  over(w, e, p) { veil(C.steel, 0.014 * fade(p, 0.5)); },
  hit(w, e) {
    if (!crossed(e, 0.10)) return;
    for (const f of foesIn(w, e.x, e.y, 82)) { hurt(w, f, 42, C.steel); f.frozen = 2.4; }
  },
});
