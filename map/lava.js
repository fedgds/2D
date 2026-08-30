// Dung nham -- basalt cracked open over something still molten.
//
// The floor is a broad sheet of chilled basalt, warmer where the rock has thinned, cut back
// open by two passes: wandering fissures at every angle, and seeps where a warm patch has a
// hot vein walked through the middle of it. No plates and no seams between them -- masonry
// at this scale only ever read as ruled lines across the arena.
//
// Everything that actually glows is a prop or a particle. It has to be: the floor tone
// budget tops out well below the dither gate (see map/README.md), so a lava *tone* can only
// ever be dark warm brown. What sells the heat is `emit` on the pools, vents and braziers
// pouring additive light over that brown, plus embers drifting up off the floor.
(() => {

// Filled by init(FX) the first time the map is applied -- FX.hexc is the engine's reader.
let LAVA_C, LAVA_H, POT_C, POT_H, VENT_C, EMBER_C;

function ember(rng, cam, anywhere) {
  return { x: cam.x + rng.range(-10, 330),
           y: cam.y + (anywhere ? rng.range(-10, 190) : rng.range(160, 200)),
           vx: rng.range(-5, 5), vy: rng.range(-19, -7), r: rng.range(0.5, 1.3),
           ph: rng.range(0, 6.28), t: 0, life: rng.range(1.4, 3.4) };
}

// One octave of value noise, sampled with a smoothstep ramp rather than held flat across a
// coarse cell and then stepped -- with four tones to spend, a stepped octave reads as a wall
// of tone rather than as rock thinning out. Same helper as the one in map/cave.js; the maps
// each keep their own copy because each file is its own IIFE (see map/README.md).
function oct(vnoise, a, b, s) {
  const xa = a / s, ya = b / s, ix = Math.floor(xa), iy = Math.floor(ya);
  const fx = xa - ix, fy = ya - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const t0 = vnoise(ix, iy) + (vnoise(ix + 1, iy) - vnoise(ix, iy)) * sx;
  const t1 = vnoise(ix, iy + 1) + (vnoise(ix + 1, iy + 1) - vnoise(ix, iy + 1)) * sx;
  return t0 + (t1 - t0) * sy;
}

(globalThis.GAME_MAPS = globalThis.GAME_MAPS || []).push({
  id: 'lava', name: 'Dung Nham', label: 'DUNG NHAM', desc: 'đá bazan · vực lửa · tro bay',
  order: 1,
  tone: {
    floor: ['#110000', '#221100', '#331111', '#442211'],
    seam: '#663311', wall: '#221122', lip: '#442233', void: '#000000',
  },
  amb: { dust: '#a08070', glow: '#ff9a55', lm: '#ff6622' },
  pal: { D: '#554433', d: '#2a2018', P: '#77665a', p: '#ff8833',
         Q: '#ff5511', q: '#aa2200', Z: '#ffdd88', z: '#443c38' },

  seed: 9137, cell: 56, density: [0.54, 0.40],

  init(FX) {
    LAVA_C = FX.hexc('#ff5410'); LAVA_H = FX.hexc('#ffd173');
    POT_C = FX.hexc('#ff731f'); POT_H = FX.hexc('#ffe699');
    VENT_C = FX.hexc('#ff3d0d');
    EMBER_C = FX.hexc('#ff8c33');
  },

  floor(F) {
    const { WW, WH, tid, rng, vnoise, clamp, c01, walk, blob } = F, cell = 28;
    const tw = Math.ceil(WW / cell) + 2, th = Math.ceil(WH / cell) + 2;

    // Broad sheets of chilled basalt, warmer where the rock is thinner. The value is kept
    // continuous on the lattice, bilerped per pixel, then dithered into a tone id against a
    // per-pixel hash (map/README.md).
    //
    // This used to be offset masonry -- one id per 28 px plate with a seam painted on every
    // plate edge. Staggering the rows kept the *vertical* seams from lining up, but the
    // horizontal ones still ran the full width of the world every 28 px, so the floor read
    // as ruled lines. There are no plates left to seam: the heat map is smooth, and what
    // breaks the rock open is the fissure pass below.
    //
    // The `2.5` (rather than 3) is the same dark skew the plates had: most of the floor sits
    // on id 0/1 and only the hottest noise reaches id 3, so the emissive props have
    // somewhere to read against.
    const val = new Float32Array(tw * th);
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      val[ty * tw + tx] = 2.5 * c01(0.06 + 0.92 * oct(vnoise, tx, ty, 8)
                                         + 0.30 * (oct(vnoise, tx, ty, 2) - 0.5)
                                         + 0.20 * (vnoise(tx, ty) - 0.5));
    }
    for (let y = 0; y < WH; y++) {
      const gy = y / cell, ry = gy | 0, fy = gy - ry, r0 = ry * tw, r1 = r0 + tw, o = y * WW;
      for (let x = 0; x < WW; x++) {
        const gx = x / cell, rx = gx | 0, fx = gx - rx;
        const t0 = val[r0 + rx] + (val[r0 + rx + 1] - val[r0 + rx]) * fx;
        const t1 = val[r1 + rx] + (val[r1 + rx + 1] - val[r1 + rx]) * fx;
        const v = t0 + (t1 - t0) * fy, lo = v | 0;
        tid[o + x] = clamp(lo + (v - lo > vnoise(x, y) ? 1 : 0), 0, 3);
      }
    }

    // Fissure networks: the long ones carry the map now that the plates are gone. Low wobble
    // so a fissure holds a heading for a while, at any angle -- never axis-aligned.
    for (let i = 0; i < 240; i++)
      walk(rng.int(0, WW), rng.int(0, WH), rng.int(60, 200), 4, 0.4);

    // Fissures: short wandering seams that cut across the sheet at any angle.
    for (let i = 0; i < 620; i++)
      walk(rng.int(0, WW), rng.int(0, WH), rng.int(14, 70), 4, 1.15);

    // Seeps: a warm patch with a hot vein through the middle. The blob goes down first so
    // the walk lands on top of it and stays readable.
    for (let i = 0; i < 110; i++) {
      const cx = rng.int(0, WW), cy = rng.int(0, WH);
      blob(cx, cy, rng.range(7, 22), rng.range(4, 12), 3, 0.55);
      walk(cx - 8, cy, rng.int(10, 26), 4, 0.8);
    }

    // Ash fall, thinner than the cave's grit. Fissures are left alone so they stay sharp.
    const specks = Math.round(300 * (WW * WH) / (320 * 180));
    for (let i = 0; i < specks; i++) {
      const px = rng.int(0, WW), py = rng.int(0, WH), o = py * WW + px;
      if (tid[o] > 3) continue;
      tid[o] = clamp(tid[o] + (rng.int(0, 2) * 2 - 1), 0, 3);
    }
  },

  props: [
    { kind: 'cinder', w: 22, off: [-2, -2], grid: ["z.z.z", ".zdz.", "z.z.z"] },
    { kind: 'scorch', w: 14, px(q) {
        const px = [];
        for (let k = 0; k < q.int(5, 10); k++)
          px.push([q.int(-5, 6), q.int(-3, 4), 'z', q.range(0.4, 0.85)]);
        return px;
      } },
    { kind: 'emberdust', w: 12, px(q) {
        const px = [];
        for (let k = 0; k < q.int(3, 7); k++)
          px.push([q.int(-4, 5), q.int(-2, 3), q() < 0.6 ? 'p' : 'Q', q.range(0.3, 0.7)]);
        return px;
      } },
    { kind: 'obsidian', w: 20, grid: [".ddd.", "dDPDd", "dDdDd", ".ddd."] },
    { kind: 'basalt', w: 13, tall: true,
      grid: ["..dd..", ".dDPd.", "dDPddD", "dDddDd", ".dDDd."] },
    { kind: 'spire', w: 7, tall: true,
      grid: ["..ddd..", ".dDPDd.", ".dDPDd.", ".dDdDd.", ".dDPDd.", ".dDPDd.",
             ".dDdDd.", "ddDPDdd", "dDDPDDd", ".dddddd"] },
    // Braziers hammered into the rock -- this map's torch. Same job, hotter colour.
    { kind: 'firepot', w: 5, tall: true, mark: true,
      grid: ["..z..", ".zZz.", ".zQz.", ".zqz.", ".zqz.", "zqQqz", "zZQZz", ".zzz."],
      emit(p, t, FX) {
        const fl = 0.80 + 0.20 * Math.sin(t * 6.1 + p.seed * 0.41) +
                          0.12 * Math.sin(t * 15.7 + p.seed * 1.07);
        const fy = p.y - 9;
        FX.core(p.x, fy, 3.8 * fl, POT_C, 0.98, 1.8);
        FX.core(p.x, fy - 1, 1.6, POT_H, 1.10);
        FX.core(p.x, p.y - 2, 17 * fl, POT_C, 0.17, 2.2);
      } },
    // A crack breathing heat. No tall art above the floor, so it reads purely as light.
    { kind: 'vent', w: 4, tall: true, mark: true,
      grid: ["zqQqz", ".zQz.", "..z.."],
      emit(p, t, FX) {
        // Slow breath: mostly off, then a surge. Two primes so a field of vents scatters.
        const br = Math.max(0, Math.sin(t * 1.7 + p.seed * 0.23));
        const fl = 0.25 + 0.95 * br * br;
        FX.core(p.x, p.y - 1, 11 * fl, VENT_C, 0.30, 2.1);
        FX.core(p.x, p.y - 3 - 5 * br, 2.4 * fl, LAVA_H, 0.42 * fl);
      } },
    // The pool itself. Flat, so it draws under everything and the light lands on top.
    { kind: 'lavapool', w: 3, off: [-3, -2], mark: true,
      grid: ["..QQQ..", ".QqQqQ.", "QqZQZqQ", ".QqQqQ.", "..QQQ.."],
      emit(p, t, FX) {
        const fl = 0.78 + 0.22 * Math.sin(t * 1.3 + p.seed * 0.17) +
                          0.09 * Math.sin(t * 3.9 + p.seed * 0.53);
        FX.core(p.x, p.y, 22 * fl, LAVA_C, 0.34, 2.2);
        FX.core(p.x, p.y, 6.5, LAVA_C, 0.60 * fl, 1.7);
        FX.core(p.x, p.y, 2.4, LAVA_H, 0.55 * fl);
      } },
  ],

  // Embers off the floor: rising, swaying, brightest in the middle of their life.
  ambStep(A) {
    const { list, dt, rng, cam } = A;
    while (list.length < 42) list.push(ember(rng, cam, true));
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      m.t += dt;
      m.x += (m.vx + 5 * Math.sin(m.t * 2.6 + m.ph)) * dt;
      m.y += m.vy * dt;
      if (m.t >= m.life || m.x < cam.x - 20 || m.x > cam.x + 340 ||
          m.y < cam.y - 20 || m.y > cam.y + 200) list[i] = ember(rng, cam, false);
    }
  },
  ambDraw(A) {
    for (const m of A.list) {
      const k = Math.sin(Math.PI * A.c01(m.t / m.life));
      A.FX.core(m.x, m.y, m.r, EMBER_C, 0.55 * k, 1.5);
    }
  },
});

})();
