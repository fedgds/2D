"use strict";
// ===========================================================================
// 3b. Arenas and world dressing. A big empty floor reads as one room no matter how
//     far you walk, so the world is scattered with props from a fixed seed: they are
//     what turns distance into travel. Flat ones are floor matter drawn before the
//     shadows; tall ones sort with the units. The hero is still drawn last and on
//     top of everything -- occluding the player behind a pillar would cost more
//     readability than the depth cue is worth at 11x14 px.
//
//     None of that art lives here any more. Every arena is one file in map/ that
//     registers itself on globalThis.GAME_MAPS (contract in map/README.md); what is
//     left below is the machinery that reads one definition and turns it into the tone
//     tables, the world's tone ids, the palette, the prop list and the ambient hooks.
// ===========================================================================
const MAPS = (globalThis.GAME_MAPS || []).slice().sort((a, b) => a.order - b.order);
if (!MAPS.length) throw new Error('no arena registered -- check the <script src="map/*.js"> tags');
const MAP_BY_ID = {};
for (const m of MAPS) MAP_BY_ID[m.id] = m;

// Every primitive a map is allowed to draw with, bundled once. Rebuilding this per call
// would allocate on every prop that emits light, on every frame.
const FX = { core, beam, ring, arc, line, dashline, chevron, star, sparks, puddle, cloud,
             cracks, dial, glare, veil, setPix, setPixS, blit, text3x5, hexc,
             clamp, c01, TAU };

let MAPDEF = null;
let DUST = hexc('#8a7f6a');        // footfall dust, retinted per map
let MM_LM = hexc('#9a5cff');       // landmark dot on the minimap
const PROPS = [];                  // mutated in place: w.props holds this exact array
const LANDMARKS = [];

// The dither gate is why floor tones must stay dark (the argument is in map/README.md):
// a tone past it resolves to different bytes in different Bayer phases, and the prebuilt
// floor window would then disagree with resolve(). Throwing here beats shipping an arena
// whose floor quietly shimmers as the camera moves.
function checkTone(id, key, hex) {
  const c = hexc(hex), sum = Math.round((c[0] + c[1] + c[2]) * 255);
  if (sum > 198)
    throw new Error(`map ${id}: tone ${key} ${hex} sums to ${sum} > 198 -- past the dither `
      + 'gate, which would break the prebuilt floor window');
}

function applyMap(m) {
  if (typeof m === 'string') m = MAP_BY_ID[m];
  if (!m) m = MAPS[0];
  const t = m.tone;
  for (let i = 0; i < 4; i++) checkTone(m.id, 'floor[' + i + ']', t.floor[i]);
  for (const k of ['seam', 'wall', 'lip', 'void']) checkTone(m.id, k, t[k]);

  MAPDEF = m;
  if (m.init && !m.ready) { m.init(FX); m.ready = true; }

  TONESET.length = 0;
  for (const h of [t.floor[0], t.floor[1], t.floor[2], t.floor[3],
                   t.seam, t.wall, t.lip, t.void]) TONESET.push(asOutput(h));
  bakeToneTables();

  for (const k in m.pal) PAL[k] = hexc(m.pal[k]);
  DUST = hexc(m.amb.dust); HERO_GLOW = hexc(m.amb.glow); MM_LM = hexc(m.amb.lm);

  bakeWorldFloor(m);
  buildProps(m);
  syncFloor(true);
  return m;
}

// One weighted roll per cell, drawing from the rng in exactly the order the pre-map
// version used: position, then the kind roll, then the prop's own seed, then the bounds
// test. Keeping that order is what makes the cave's 977 props come out identical after
// the art moved into map/cave.js.
function buildProps(m) {
  PROPS.length = 0; LANDMARKS.length = 0;
  const defs = m.props, cell = m.cell || 56, dn = m.density || [0.56, 0.42];
  let tot = 0;
  for (const d of defs) tot += d.w;
  const rng = mulberry32(m.seed || 4242);
  for (let cy = 24; cy < WH; cy += cell) for (let cx = 24; cx < WW; cx += cell) {
    const n = rng() < dn[0] ? 1 : (rng() < dn[1] ? 2 : 0);
    for (let i = 0; i < n; i++) {
      const x = Math.round(cx + rng.range(4, cell - 4));
      const y = Math.round(cy + rng.range(4, cell - 4));
      const r = rng(), seed = rng.int(1, 1e9) | 0;
      if (x < 40 || x > WW - 40 || y < 60 || y > WH - 40) continue;
      let acc = 0, def = defs[defs.length - 1];
      for (const d of defs) { acc += d.w; if (r * tot < acc) { def = d; break; } }
      const p = { kind: def.kind, def, x, y, seed, tall: !!def.tall, px: null };
      // A def with px() is loose decal matter rather than a grid: its pixels are rolled
      // once, here, so drawing it every frame allocates nothing.
      if (def.px) p.px = def.px(mulberry32(seed));
      PROPS.push(p);
    }
  }
  PROPS.sort((a, b) => a.y - b.y);
  for (const p of PROPS) if (p.def.mark) LANDMARKS.push(p);
}

// PROPS is kept sorted by y, so the visible slice is two binary searches instead of a
// scan over ~900 props every frame. The list is a parameter so a test scene can run with
// the dressing switched off and still exercise the same code path.
function propLo(list, y) {
  let a = 0, b = list.length;
  while (a < b) { const m = (a + b) >> 1; if (list[m].y < y) a = m + 1; else b = m; }
  return a;
}
// `emit` fires in the same layer as the prop's own art, never in a pass of its own: a
// torch flame belongs behind the monster standing in front of the torch, and a lava
// pool's glow belongs under the shadows -- both of which a late light pass would invert.
function drawPropFlat(p, t) {
  const d = p.def;
  if (p.px) {
    for (const q of p.px) setPix(p.x + q[0], p.y + q[1], PAL[q[2]], q[3]);
  } else {
    const g = d.grid, off = d.off;
    blit(g, p.x + (off ? off[0] : -(g[0].length >> 1)),
            p.y + (off ? off[1] : -(g.length >> 1)), 0, (p.seed & 1) !== 0);
  }
  if (d.emit) d.emit(p, t, FX);
}
function drawPropTall(p, t) {
  const d = p.def, g = d.grid;
  blit(g, p.x - (g[0].length >> 1), p.y - g.length, 0, (p.seed & 2) !== 0);
  if (d.emit) d.emit(p, t, FX);
}

// Ambient particles. The list belongs to the world (w.amb) and is stepped on the cosmetic
// rng stream, so weather can never shift a seeded outcome. Both argument objects are
// reused -- this runs twice a frame for the life of the process.
const AMB_CAM = { x: 0, y: 0 };
const AMB_ARG = { w: null, dt: 0, list: null, rng: null, cam: AMB_CAM, FX,
                  clamp, c01, TAU };
function ambArg(w, dt) {
  AMB_ARG.w = w; AMB_ARG.dt = dt; AMB_ARG.list = w.amb; AMB_ARG.rng = w.crng;
  AMB_CAM.x = CAMX; AMB_CAM.y = CAMY;
  return AMB_ARG;
}

applyMap(MAPS[0]);
