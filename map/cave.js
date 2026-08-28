// Hang động -- the original arena, lifted out of index.html unchanged.
//
// Damp tiled stone under torchlight: a grid with grout seams, four stone tones picked by
// two scales of value noise, and a speck pass that breaks up the repeat. This one is the
// reference for the map contract, so it is worth reading first: everything the other maps
// do differently, they do against this.
//
// The floor generator and the prop table are copied verbatim from the pre-map version
// (including the quirk in `crack`, where the loop bound is re-drawn every iteration --
// changing it would redraw 977 props' worth of art to fix nothing). That is deliberate:
// the refactor is checked by hashing TID and PROPS, and the hash has to come out the same.
//
// Everything lives inside an IIFE. Top-level `const` in a classic script lands in the
// shared global lexical scope, so two maps declaring the same helper name would be a hard
// SyntaxError at load -- and two maps declaring the same `function` would silently share
// one binding, which is worse. Maps keep their private art data to themselves.
(() => {

// Filled by init(FX) the first time the map is applied. FX.hexc is the engine's own hex
// reader, so these are exactly the triples the pre-map version added into the buffer --
// close-enough literals typed in by hand would not be.
let TORCH_C, TORCH_H, CRYS_C, CRYS_H, MOTE_C;

function mote(rng, cam, anywhere) {
  return { x: cam.x + rng.range(-10, 330),
           y: cam.y + (anywhere ? rng.range(-10, 190) : rng.range(150, 195)),
           vx: rng.range(-4, 4), vy: rng.range(-9, -3), r: rng.range(0.6, 1.4),
           t: 0, life: rng.range(2.2, 5.0) };
}

(globalThis.GAME_MAPS = globalThis.GAME_MAPS || []).push({
  id: 'cave', name: 'Hang Động', label: 'HANG ĐỘNG', desc: 'đá ẩm · đuốc · tinh thể',
  order: 0,
  tone: {
    floor: ['#111111', '#111122', '#222233', '#222244'],
    seam: '#333355', wall: '#2a2a3d', lip: '#33334d', void: '#050508',
  },
  amb: { dust: '#8a7f6a', glow: '#ffb066', lm: '#9a5cff' },
  // The eight material characters every map defines. Stone, bone, wood, crystal.
  pal: { D: '#3b3b54', d: '#272738', P: '#55557a', p: '#2f6b46',
         Q: '#7a4cd0', q: '#4a2a80', Z: '#c9a8ff', z: '#1d4530' },

  // Two streams, two seeds: 4242 lays out the props and 7 grits the floor. Both are the
  // numbers the pre-map version used, which is what keeps the TID and PROPS hashes intact.
  seed: 4242, fseed: 7, cell: 56, density: [0.56, 0.42],

  init(FX) {
    TORCH_C = FX.hexc('#ff7a2a'); TORCH_H = FX.hexc('#ffe9a8');
    CRYS_C = FX.hexc('#9a5cff'); CRYS_H = FX.hexc('#d8c4ff');
    MOTE_C = FX.hexc('#9e9480');
  },

  floor(F) {
    const { WW, WH, tid, rng, vnoise, clamp, c01 } = F, tile = 20;    const tw = Math.ceil(WW / tile), th = Math.ceil(WH / tile);
    // Coarse value noise at two scales, so walking a long way crosses slow patches of
    // brighter and darker stone instead of one texture repeated forever. The parity term
    // is what makes neighbouring tiles alternate inside a patch.
    const idx = new Uint8Array(tw * th);
    for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
      const lit = c01(0.12 + 1.05 * vnoise(tx >> 4, ty >> 4) + 0.34 * (vnoise(tx >> 2, ty >> 2) - 0.5));
      idx[ty * tw + tx] = clamp(Math.round(lit * 2) + ((tx + ty) & 1), 0, 3);
    }
    const colTile = new Int32Array(WW), colGrout = new Uint8Array(WW);
    for (let x = 0; x < WW; x++) {
      colTile[x] = Math.floor(x / tile); colGrout[x] = x % tile === 0 ? 1 : 0;
    }
    for (let y = 0; y < WH; y++) {
      const row = Math.floor(y / tile) * tw, o = y * WW, gy = y % tile === 0;
      for (let x = 0; x < WW; x++) tid[o + x] = (gy || colGrout[x]) ? 4 : idx[row + colTile[x]];
    }
    // Stamp the world wall now, before the specks: they skip any id above 3, so with the
    // wall already down they leave it alone. The engine stamps it again afterwards either
    // way -- this call is only about what the *later passes in here* can see.
    F.border();
    // Same speck density as one screen's worth, scaled up to the whole world.
    const specks = Math.round(380 * (WW * WH) / (320 * 180));
    for (let i = 0; i < specks; i++) {
      const px = rng.int(0, WW), py = rng.int(0, WH), o = py * WW + px;
      if (tid[o] > 3) continue;                             // never speckle a grout seam
      tid[o] = clamp(tid[o] + (rng.int(0, 2) * 2 - 1), 0, 3);
    }
  },

  props: [
    { kind: 'grass', w: 26, off: [-2, -2], grid: ["..p..", ".pzp.", "pzpzp"] },
    // Bones and cracks are a handful of pixels each, rolled once at build time so drawing
    // them every frame allocates nothing.
    { kind: 'bones', w: 14, px(q) {
        const px = [];
        for (let k = 0; k < q.int(4, 8); k++)
          px.push([q.int(-4, 5), q.int(-2, 3), q() < 0.5 ? 'O' : 'o', q.range(0.5, 0.95)]);
        return px;
      } },
    { kind: 'crack', w: 12, px(q) {
        const px = [];
        let dx = q.int(-6, 7), dy = q.int(-3, 4);
        // The bound is re-drawn every pass on purpose -- see the header note.
        for (let k = 0; k < q.int(7, 13); k++) {
          px.push([dx, dy, 'K', q.range(0.35, 0.7)]);
          dx += q.int(0, 2); dy += q.int(-1, 2);
        }
        return px;
      } },
    { kind: 'rock', w: 20, grid: [".KKK.", "KDPDK", "KdDdK", ".KKK."] },
    { kind: 'rock2', w: 14, tall: true,
      grid: ["..KK..", ".KDPK.", "KDPDDK", "KdDDdK", ".KKKK."] },
    { kind: 'pillar', w: 7, tall: true,
      grid: ["..KKK..", ".KDPDK.", ".KDPDK.", ".KdDdK.", ".KDPDK.", ".KDPDK.",
             ".KdDdK.", ".KDPDK.", ".KDPDK.", ".KdDdK.", "KDDPDDK", "KdDDDdK", ".KKKKK."] },
    { kind: 'torch', w: 5, tall: true, mark: true,
      grid: ["..K..", ".KWK.", ".KWK.", ".KWK.", ".KWK.", ".KWK.", ".KwK.", "KWWWK", ".KKK."],
      emit(p, t, FX) {
        // Two beat frequencies, so a wall of torches never blinks in unison.
        const fl = 0.82 + 0.18 * Math.sin(t * 7.3 + p.seed * 0.37) +
                          0.10 * Math.sin(t * 17.1 + p.seed * 1.13);
        const fy = p.y - 10;
        FX.core(p.x, fy, 3.4 * fl, TORCH_C, 0.95, 1.8);
        FX.core(p.x, fy - 1, 1.5, TORCH_H, 1.05);
        FX.core(p.x, p.y - 2, 15 * fl, TORCH_C, 0.16, 2.2);       // spill on the floor
      } },
    { kind: 'crystal', w: 2, tall: true, mark: true,
      grid: ["..K..", ".KZK.", ".KQK.", "KQZQK", "KQQQK", "KqQqK", "KQQQK", "KqqqK", ".KKK."],
      emit(p, t, FX) {
        const fl = 0.8 + 0.2 * Math.sin(t * 2.1 + p.seed * 0.11);
        FX.core(p.x, p.y - 5, 9 * fl, CRYS_C, 0.26, 2.0);
        FX.core(p.x, p.y - 5, 2.2, CRYS_H, 0.55 * fl);
      } },
  ],

  // Motes of dust hanging in the torchlight. Purely cosmetic: they are spawned around the
  // camera on the cosmetic stream, so they can never shift a seeded outcome.
  ambStep(A) {
    const { list, dt, rng, cam } = A;
    while (list.length < 34) list.push(mote(rng, cam, true));
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      m.t += dt; m.x += m.vx * dt; m.y += m.vy * dt;
      if (m.t >= m.life || m.x < cam.x - 20 || m.x > cam.x + 340 ||
          m.y < cam.y - 20 || m.y > cam.y + 200) list[i] = mote(rng, cam, false);
    }
  },
  ambDraw(A) {
    for (const m of A.list) {
      const k = Math.sin(Math.PI * A.c01(m.t / m.life));
      A.FX.core(m.x, m.y, m.r, MOTE_C, 0.20 * k, 1.6);
    }
  },
});

})();
