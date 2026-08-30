// Băng tuyết -- a frozen field under a hard blue night.
//
// Broad noise sheets instead of masonry: no tiles, no grid, just slow drifts of packed snow
// over darker ice, cut by long shallow cracks. `walk` gets a low wobble here so the cracks
// run for a distance in one direction, which is what makes them read as fracture rather
// than as the cave's short crumbling cracks. (This map went noise-first; the other two
// followed later, when their tile grids were taken out.)
//
// The tone budget bites hardest on this map: white snow is exactly what the dither gate
// forbids (see map/README.md), and `#224455` is about as pale as a blue can get and still
// stay under it. So the *brightness* of snow is faked entirely with additive light --
// glinting flakes, the shards' cold glow, and the hero's own colder lamp.
(() => {

// Filled by init(FX) the first time the map is applied -- FX.hexc is the engine's reader.
let SHARD_C, SHARD_H, MOON_C, MOON_H, SNOW_C, GLINT_C;

function flake(rng, cam, anywhere) {
  return { x: cam.x + rng.range(-20, 340),
           y: cam.y + (anywhere ? rng.range(-10, 190) : rng.range(-30, -8)),
           vx: rng.range(-13, 4), vy: rng.range(11, 26), r: rng.range(0.5, 1.2),
           ph: rng.range(0, 6.28), gl: rng() < 0.22, t: 0, life: rng.range(2.6, 6.0) };
}

(globalThis.GAME_MAPS = globalThis.GAME_MAPS || []).push({
  id: 'ice', name: 'Băng Tuyết', label: 'BĂNG TUYẾT', desc: 'tuyết phủ · băng nứt · gió lạnh',
  order: 2,
  tone: {
    floor: ['#000011', '#001122', '#112233', '#113344'],
    seam: '#224455', wall: '#111122', lip: '#223344', void: '#000000',
  },
  amb: { dust: '#b8d4ee', glow: '#9fd8ff', lm: '#66ccff' },
  pal: { D: '#5b7a99', d: '#2a3d55', P: '#a8ccee', p: '#dff0ff',
         Q: '#66ccff', q: '#2277aa', Z: '#ffffff', z: '#4a4038' },

  seed: 5521, cell: 56, density: [0.52, 0.38],

  init(FX) {
    SHARD_C = FX.hexc('#66ccff'); SHARD_H = FX.hexc('#def5ff');
    MOON_C = FX.hexc('#9eb8ff'); MOON_H = FX.hexc('#e6f0ff');
    SNOW_C = FX.hexc('#b8d6ff'); GLINT_C = FX.hexc('#f0faff');
  },

  floor(F) {
    const { WW, WH, tid, rng, vnoise, clamp, c01, walk, blob } = F, tile = 16;
    const tw = Math.ceil(WW / tile) + 2, th = Math.ceil(WH / tile) + 2;

    // Three octaves, weighted heavily toward the coarsest: the point is long slow drifts
    // you cross over several seconds of walking, with just enough fine grain that a single
    // patch is not a flat plane of one tone.
    //
    // What is stored per lattice point is a *continuous* 0..3, not a tone id. Snapping it
    // per tile is what made an earlier cut of this map read as a quilt of hard squares --
    // masonry, which is the one thing a snowfield must not look like. So the value is
    // interpolated across the lattice and then dithered against a per-pixel hash: adjacent
    // tones mix in a random speckle and the drift edges dissolve. The dither is in the tone
    // *id*, not in the resolved byte, so the prebuilt floor window is still exact.
    const val = new Float32Array(tw * th);
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      val[ty * tw + tx] = 3 * c01(0.20 + 0.86 * vnoise(tx >> 4, ty >> 4)
                                       + 0.30 * (vnoise(tx >> 2, ty >> 2) - 0.5)
                                       + 0.16 * (vnoise(tx, ty) - 0.5));
    }
    for (let y = 0; y < WH; y++) {
      const gy = y / tile, ry = gy | 0, fy = gy - ry, r0 = ry * tw, r1 = r0 + tw, o = y * WW;
      for (let x = 0; x < WW; x++) {
        const gx = x / tile, rx = gx | 0, fx = gx - rx;
        const a = val[r0 + rx], b = val[r0 + rx + 1], c = val[r1 + rx], d = val[r1 + rx + 1];
        const v = (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
        const lo = v | 0;
        tid[o + x] = clamp(lo + (v - lo > vnoise(x, y) ? 1 : 0), 0, 3);
      }
    }

    // Drifts: broad soft mounds of packed snow, wider than they are tall so they lie down
    // in the same squashed perspective everything else in the game uses.
    for (let i = 0; i < 260; i++)
      blob(rng.int(0, WW), rng.int(0, WH), rng.range(14, 46), rng.range(6, 20), 3, 0.6);

    // Fractures. Low wobble, long runs -- ice splits, it does not crumble.
    for (let i = 0; i < 210; i++)
      walk(rng.int(0, WW), rng.int(0, WH), rng.int(50, 220), 4, 0.22);
    // ...and their hairline branches.
    for (let i = 0; i < 380; i++)
      walk(rng.int(0, WW), rng.int(0, WH), rng.int(8, 30), 4, 0.5);

    // Glitter grain, biased upward so packed snow keeps catching a little more light.
    const specks = Math.round(420 * (WW * WH) / (320 * 180));
    for (let i = 0; i < specks; i++) {
      const px = rng.int(0, WW), py = rng.int(0, WH), o = py * WW + px;
      if (tid[o] > 3) continue;
      tid[o] = clamp(tid[o] + (rng() < 0.62 ? 1 : -1), 0, 3);
    }
  },

  props: [
    { kind: 'snowtuft', w: 22, off: [-2, -1], grid: [".p.p.", "ppppp"] },
    { kind: 'frost', w: 14, px(q) {
        const px = [];
        for (let k = 0; k < q.int(5, 11); k++)
          px.push([q.int(-5, 6), q.int(-3, 4), q() < 0.7 ? 'p' : 'P', q.range(0.35, 0.8)]);
        return px;
      } },
    { kind: 'crack', w: 12, px(q) {
        const px = [];
        let dx = q.int(-7, 8), dy = q.int(-2, 3);
        for (let k = 0, n = q.int(8, 15); k < n; k++) {
          px.push([dx, dy, 'P', q.range(0.30, 0.62)]);
          dx += q.int(1, 3); dy += q.int(-1, 2);
        }
        return px;
      } },
    { kind: 'icerock', w: 20, grid: [".DDD.", "DdPdD", "DdDdD", ".DDD."] },
    { kind: 'snowdrift', w: 13, tall: true,
      grid: ["..pp..", ".pPPp.", "pPppPp", "dPppPd", ".dddd."] },
    { kind: 'frozenpillar', w: 7, tall: true,
      grid: ["..DPD..", ".DdPdD.", ".DdPdD.", ".DdPdD.", ".DdDdD.", ".DdPdD.",
             ".DdPdD.", ".DdDdD.", "DddPddD", "ppPPPpp", ".pppppp"] },
    // Ice shards catching whatever light there is. This map's landmark, and its torch.
    { kind: 'iceshard', w: 5, tall: true, mark: true,
      grid: ["..Z..", ".ZQZ.", ".qQq.", "ZqQqZ", "QqZqQ", "QqqqQ", "pQQQp", ".ppp."],
      emit(p, t, FX) {
        // A slow swell with a faint fast shimmer laid over it.
        const fl = 0.74 + 0.26 * Math.sin(t * 1.6 + p.seed * 0.19) +
                          0.10 * Math.sin(t * 9.4 + p.seed * 0.71);
        FX.core(p.x, p.y - 5, 11 * fl, SHARD_C, 0.30, 2.0);
        FX.core(p.x, p.y - 6, 2.3, SHARD_H, 0.62 * fl);
        FX.core(p.x, p.y - 1, 13 * fl, SHARD_C, 0.13, 2.3);       // spill on the snow
      } },
    { kind: 'deadbush', w: 4, off: [-3, -3], tall: true,
      grid: ["z...z", ".z.z.", "..z..", ".zzz.", "..z.."] },
    // Moonstone: a low pale rock that keeps its own light. Rare, so it works as a waypoint.
    { kind: 'moonstone', w: 3, mark: true, off: [-2, -2],
      grid: [".ZPZ.", "ZPZPZ", "PZPZP", ".PZP."],
      emit(p, t, FX) {
        const fl = 0.82 + 0.18 * Math.sin(t * 0.9 + p.seed * 0.29);
        FX.core(p.x, p.y, 15 * fl, MOON_C, 0.22, 2.2);
        FX.core(p.x, p.y, 3.0, MOON_H, 0.44 * fl);
      } },
  ],

  // Snow blowing across the field. A fifth of the flakes are marked as glints and twinkle
  // hard -- that is where the map gets its sparkle, since the tone budget cannot supply it.
  ambStep(A) {
    const { list, dt, rng, cam } = A;
    while (list.length < 68) list.push(flake(rng, cam, true));
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      m.t += dt;
      m.x += (m.vx + 7 * Math.sin(m.t * 1.9 + m.ph)) * dt;
      m.y += m.vy * dt;
      if (m.t >= m.life || m.x < cam.x - 30 || m.x > cam.x + 350 ||
          m.y < cam.y - 40 || m.y > cam.y + 200) list[i] = flake(rng, cam, false);
    }
  },
  ambDraw(A) {
    for (const m of A.list) {
      const k = Math.sin(Math.PI * A.c01(m.t / m.life));
      if (m.gl) {
        const tw = Math.max(0, Math.sin(m.t * 11 + m.ph));
        A.FX.core(m.x, m.y, m.r + 0.5 * tw, GLINT_C, (0.22 + 0.70 * tw * tw) * k, 1.4);
      } else {
        A.FX.core(m.x, m.y, m.r, SNOW_C, 0.30 * k, 1.6);
      }
    }
  },
});

})();
