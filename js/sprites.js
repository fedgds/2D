"use strict";
// ===========================================================================
// 2. Sprites (port of skillfx/sprites.py). No asset files: palette chars + grids.
//    Colours stay muted on purpose -- the neon VFX must be the brightest thing.
// ===========================================================================
const PAL = {};
{
  const raw = {
    K: '#0d0d16', E: '#1b1b2c', A: '#cdd7ea', a: '#7d8aa8',
    C: '#c0374a', c: '#7d2030', S: '#f0c39a', L: '#4a3a58', B: '#2b2338',
    G: '#5ac26a', g: '#2f7a44', V: '#9d86cf', v: '#584780', R: '#b85c36', r: '#74311d',
    // World dressing shared by every arena: bone and wood. Stone, foliage and crystal are
    // *not* here -- each map brings its own eight material chars (D d P p Q q Z z) and
    // applyMap merges them in, which is how one prop grid can be granite in the cave and
    // basalt in the lava field without a second copy of the art.
    O: '#b9b2a0', o: '#7d786b', W: '#4a3524', w: '#2e2015',
    // the three later monsters: toxic chitin, ember shell, arcane lens
    T: '#8fd94a', t: '#4a7a22', F: '#ffb84a', f: '#a3541a', I: '#7fd2ff', i: '#2f6f9c',
  };
  for (const k in raw) PAL[k] = hexc(raw[k]);
}
const WHITE = hexc('#ffffff');

const HERO = ["...KKKKK...", "..KAAAAAK..", "..KASSSAK..", "..KSESESK..",
              "...KSSSK...", "..KcAAAcK..", ".KCAAAAACK.", ".KCAaAaACK.",
              ".KCAAAAACK.", "..KcAAAcK..", "..KLLKLLK..", "..KLLKLLK..",
              "..KBBKBBK..", "...KK.KK..."];
const SLIME = ["...KKK...", ".KKGGGKK.", "KGGGGGGGK", "KGEGGGEGK",
               "KGGGGGGGK", ".KgggggK.", "..KKKKK.."];
const WRAITH = ["..KKKKK..", ".KVVVVVK.", "KVVVVVVVK", "KVEEVEEVK", "KVVVVVVVK",
                ".KVVVVVK.", "..KVVVK..", ".KvvvvvK.", "..Kv.vK..", "...K.K..."];
const BRUTE = ["K...........K", "KK..KKKKK..KK", ".KKKRRRRRKKK.", "..KRRRRRRRK..",
               "..KREERREEK..", "..KRRRRRRRK..", "..KKRRRRRKK..", ".KRRRRRRRRRK.",
               "KRRRRRRRRRRRK", "KRRrRRRRRrRRK", ".KRRRRRRRRRK.", "..KRRRRRRRK..",
               "..KRRKKKRRK..", "..KrrK.KrrK..", "..KKK...KKK.."];
// The three casters. Each silhouette has to be readable at 11px from its shape alone,
// because by the time you are reading the colour you have already been hit: the spitter
// is wide and low on four spindly legs, the bomber is a ball with a fuse, and the
// sentinel is the only tall thin thing in the game -- an eye that floats on a plinth.
const SPITTER = ["...KKKKK...", "..KTTTTTK..", ".KTTTTTTTK.", "KTTETTTETTK",
                 "KTTTTTTTTTK", ".KtttttttK.", "..KKKKKKK..", ".K.K...K.K.",
                 "K...K.K...K"];
const BOMBER = ["....F....", "...Kf....", "..KKKKK..", ".KRRRRRK.", "KRRFFFRRK",
                "KRFEFEFRK", "KRRFFFRRK", ".KrrrrrK.", "..KKKKK.."];
const SENTINEL = ["....KKK....", "...KXXXK...", "..KXXXXXK..", ".KXXIIIXXK.",
                  ".KXIEEEIXK.", ".KXXIIIXXK.", "..KXXXXXK..", "...KXXXK...",
                  "....KxK....", "...KxxxK...", "..KMMMMMK..", ".KMMMMMMMK.",
                  "..KKKKKKK.."];
const GRIDS = { hero: HERO, slime: SLIME, wraith: WRAITH, brute: BRUTE,
                spitter: SPITTER, bomber: BOMBER, sentinel: SENTINEL };

// '1' carries a flag and a base serif: as a bare right-hand stroke it left two blank
// columns, so "311" printed as "3 11" and "1533" as "l533".
const GLYPHS = {
  '0': ["###", "#.#", "#.#", "#.#", "###"], '1': [".#.", "##.", ".#.", ".#.", "###"],
  '2': ["###", "..#", "###", "#..", "###"], '3': ["###", "..#", "###", "..#", "###"],
  '4': ["#.#", "#.#", "###", "..#", "..#"], '5': ["###", "#..", "###", "..#", "###"],
  '6': ["###", "#..", "###", "#.#", "###"], '7': ["###", "..#", "..#", "..#", "..#"],
  '8': ["###", "#.#", "###", "#.#", "###"], '9': ["###", "#.#", "###", "..#", "..#"],
  '!': [".#.", ".#.", ".#.", "...", ".#."],
};

// Alpha-over write: sprites are matter, not light.
// setPixS is the screen-space one (HUD, minimap); setPix takes world coordinates like
// every other primitive, so blit/text3x5/shadowAt scroll with the camera for free.
function setPixS(x, y, col, a) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i3 = (y * W + x) * 3, k = a > 1 ? 1 : a, inv = 1 - k;
  buf[i3] = buf[i3] * inv + col[0] * k;
  buf[i3 + 1] = buf[i3 + 1] * inv + col[1] * k;
  buf[i3 + 2] = buf[i3 + 2] * inv + col[2] * k;
}
function setPix(x, y, col, a) { setPixS(x - CAMX, y - CAMY, col, a); }
// Enemies take a full white silhouette when hit (their identity is a coloured blob);
// the hero's flash is capped so its value structure survives.
//
// `pal` is optional and defaults to the shared PAL. It exists for the boss art baked out
// of images/animations/boss/**: three ~60-colour palettes cannot fit in the shared char
// space (PAL plus a map's eight material chars leaves fewer than ten free bytes), but the
// *grids* are the same char grids, so passing the table in is the whole difference between
// a hand-drawn sprite and a baked one. blitRot already took its palette this way.
const _tmp = [0, 0, 0];
function blit(grid, x, y, flash, flip, alpha, dim, pal) {
  flash = flash || 0; alpha = alpha === undefined ? 1 : alpha; dim = dim === undefined ? 1 : dim;
  const P = pal || PAL;
  const w = grid[0].length, h = grid.length;
  for (let row = 0; row < h; row++) {
    const ln = grid[row];
    for (let col = 0; col < w; col++) {
      const ch = flip ? ln[w - 1 - col] : ln[col];
      if (ch === '.') continue;
      const p = P[ch];
      if (!p) continue;
      _tmp[0] = p[0] * dim; _tmp[1] = p[1] * dim; _tmp[2] = p[2] * dim;
      if (flash > 0) {
        const f = flash > 1 ? 1 : flash, iv = 1 - f;
        _tmp[0] = _tmp[0] * iv + f; _tmp[1] = _tmp[1] * iv + f; _tmp[2] = _tmp[2] * iv + f;
      }
      setPix(x + col, y + row, _tmp, alpha);
    }
  }
}

// Same alpha-over write as `blit`, but the grid is rotated about a pivot given in cell
// coordinates and the palette is passed in rather than read from PAL -- a held weapon is
// tinted per weapon, and it has to point wherever the hero is aiming.
//
// Cells are scattered *forward* (source -> destination) rather than inverse-mapped the way
// `stampFrame` does. An inverse walk leaves some source cells with no destination pixel,
// and on art this small -- a bow limb is one pixel wide -- that means limbs and blade edges
// vanish at most angles. Scattering guarantees every filled cell lands somewhere; the
// transform only ever shrinks (squash < 1), so it cannot tear open gaps either. Dark tones
// go down first so a collision never buries the bright edge under its own outline.
const HELD_ORDER = ['-=', '+#'];
function blitRot(g, pal, x, y, pvx, pvy, ang, alpha, flash, squash) {
  alpha = alpha === undefined ? 1 : alpha;
  if (alpha <= 0) return;
  const gw = g[0].length, gh = g.length;
  const ca = Math.cos(ang), sa = Math.sin(ang), sq = Math.max(squash || 1, 1e-3);
  x -= CAMX; y -= CAMY;
  for (let pass = 0; pass < 2; pass++) {
    const want = HELD_ORDER[pass];
    for (let row = 0; row < gh; row++) {
      const ln = g[row], v = row - pvy;
      for (let col = 0; col < gw; col++) {
        const ch = ln[col];
        if (want.indexOf(ch) < 0) continue;
        const p = pal[ch];
        if (!p) continue;
        const u = col - pvx;
        const dx = u * ca - v * sa, dy = (u * sa + v * ca) * sq;
        _tmp[0] = p[0]; _tmp[1] = p[1]; _tmp[2] = p[2];
        if (flash > 0) {
          const f = flash > 1 ? 1 : flash, iv = 1 - f;
          _tmp[0] = _tmp[0] * iv + f; _tmp[1] = _tmp[1] * iv + f; _tmp[2] = _tmp[2] * iv + f;
        }
        setPixS(Math.round(x + dx), Math.round(y + dy), _tmp, alpha);
      }
    }
  }
}

function text3x5(s, x, y, colour, alpha, spacing) {
  alpha = alpha === undefined ? 1 : alpha;
  spacing = spacing === undefined ? 1 : spacing;
  let cx = x;
  for (const ch of s) {
    const g = GLYPHS[ch];
    if (!g) { cx += 2 + spacing; continue; }
    for (let row = 0; row < 5; row++)
      for (let cc = 0; cc < 3; cc++)
        if (g[row][cc] === '#') {
          setPix(cx + cc, y + row + 1, PAL.K, alpha * 0.75);   // drop shadow
          setPix(cx + cc, y + row, colour, alpha);
        }
    cx += 3 + spacing;
  }
  return cx - x;
}

const textW = s => s.length * 4 - 1;
