// Re-cut the alpha on the cung / luoi-hai weapon frames.
//
// Those two folders were keyed by whiteness -- every pixel's alpha came out roughly
// 255 - luminance -- which gets both ends wrong at once:
//
//   * outside the art, the render's soft white haze survived at alpha 5..80, so each frame
//     wears a ring of pale speckles that reads as dirt on the game's dark floor;
//   * inside the art, the white-hot core of the slash was *brightest*, so it keyed out
//     hardest: it is now a set of holes (alpha 0, and its RGB zeroed on top of that).
//
// kiem-frames was cut properly and is the reference: solid opaque body, white kept white,
// only a thin anti-aliased rim left partial.
//
// Whiteness alone cannot tell the haze outside from the core inside -- both are white.
// Topology can: the haze reaches the image border, the core is walled in by the coloured
// body of the slash. So flood-fill the border through the pale pixels and let the art
// itself be the wall. What the fill reaches is background and goes to alpha 0; pale pixels
// it cannot reach are the core and go opaque. Coloured pixels are never touched, which is
// what keeps the blue glow rim on the cung frames intact.
const fs = require('fs');
const path = require('path');
const { readPNG, writePNG } = require('./png.js');

const WHITE_MIN = 200;   // min(r,g,b) at or above this is "pale" -- haze or white-hot core
const WHITE_SAT = 42;    // ...and only if it is near-neutral, so pale blue stays art
const MIN_DEPTH = +(process.env.MIN_DEPTH || 3);  // smallest pocket worth calling a core

const isPale = (r, g, b) =>
  Math.min(r, g, b) >= WHITE_MIN && Math.max(r, g, b) - Math.min(r, g, b) <= WHITE_SAT;

function refilter(file) {
  const im = readPNG(file), { w, h, px } = im;
  const n = w * h;

  // 1. Drop every pale translucent pixel outright, wherever it is. Under this keying a
  //    partial alpha on a near-white pixel means "light grey in the source": soft haze off
  //    the edge of the art, not the art. The white-hot core is a different animal -- it was
  //    *pure* white, so it keyed all the way to alpha 0 -- and it is dealt with below. This
  //    one pass is what clears the speckled ring, and it needs no notion of inside/outside.
  let haze = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4, a = px[i + 3];
    if (a > 0 && a < 255 && isPale(px[i], px[i + 1], px[i + 2])) {
      px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 0;
      haze++;
    }
  }

  // 2. What is left at alpha 0 was pure white in the source: either the background, or the
  //    hot core of the slash. Only topology tells those apart -- the background reaches the
  //    image border, the core is walled in by the coloured body of the art.
  const cand = new Uint8Array(n);
  for (let p = 0; p < n; p++) if (px[p * 4 + 3] === 0) cand[p] = 1;

  // 3. How far every candidate sits from the nearest bit of art, in 4-steps. This is what
  //    separates a hot core from a hairline crack between two wisps: the core has room
  //    inside it, a crack is one or two pixels of nothing.
  const dist = new Int16Array(n).fill(-1);
  let q = [];
  for (let p = 0; p < n; p++) if (!cand[p]) { dist[p] = 0; q.push(p); }
  while (q.length) {
    const nq = [];
    for (const p of q) {
      const x = p % w, y = (p - x) / w, d = dist[p] + 1;
      if (x > 0 && dist[p - 1] < 0) { dist[p - 1] = d; nq.push(p - 1); }
      if (x < w - 1 && dist[p + 1] < 0) { dist[p + 1] = d; nq.push(p + 1); }
      if (y > 0 && dist[p - w] < 0) { dist[p - w] = d; nq.push(p - w); }
      if (y < h - 1 && dist[p + w] < 0) { dist[p + w] = d; nq.push(p + w); }
    }
    q = nq;
  }

  // 4. Flood the border across the candidates: 4-connected, so a diagonal chink is not a
  //    doorway. What it reaches is background and stays cut.
  const out = new Uint8Array(n);
  const stack = [];
  const push = p => { if (!out[p] && cand[p]) { out[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p - x) / w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (y > 0) push(p - w);
    if (y < h - 1) push(p + w);
  }

  // 5. Walk each walled-in pocket. One with real room inside it is the slash's own white
  //    core: paint it the white it used to be and make it solid, which is the whole point of
  //    the exercise. The rest are hairline gaps between wisps -- hundreds of them out in the
  //    feathery edge -- and filling those would replace a halo of pale speckles with a halo
  //    of hard white ones, so they are left alone.
  const seen = new Uint8Array(n);
  let core = 0, cracks = 0;
  for (let p0 = 0; p0 < n; p0++) {
    if (!cand[p0] || out[p0] || seen[p0]) continue;
    const comp = [p0]; seen[p0] = 1;
    let deep = 0;
    for (let k = 0; k < comp.length; k++) {
      const p = comp[k], x = p % w, y = (p - x) / w;
      if (dist[p] > deep) deep = dist[p];
      const nb = [];
      if (x > 0) nb.push(p - 1);
      if (x < w - 1) nb.push(p + 1);
      if (y > 0) nb.push(p - w);
      if (y < h - 1) nb.push(p + w);
      for (const m of nb) if (cand[m] && !out[m] && !seen[m]) { seen[m] = 1; comp.push(m); }
    }
    if (deep < MIN_DEPTH) { cracks += comp.length; continue; }
    for (const p of comp) {
      const i = p * 4;
      px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255;
    }
    core += comp.length;
  }

  // 6. Finally, normalise the colour under every fully transparent pixel to white, which is
  //    what kiem-frames stores. This renderer never sees it -- `ART.bake` skips alpha 0
  //    entirely and canvas downscaling averages premultiplied, so zeroed RGB cannot bleed
  //    dark into a neighbour -- but leaving black under the transparency is a trap for any
  //    consumer that composites these unpremultiplied, and matching the reference is free.
  let norm = 0;
  for (let p = 0; p < n; p++) {
    const i = p * 4;
    if (px[i + 3] !== 0) continue;
    if (px[i] === 255 && px[i + 1] === 255 && px[i + 2] === 255) continue;
    px[i] = 255; px[i + 1] = 255; px[i + 2] = 255;
    norm++;
  }

  writePNG(file, im);
  return { w, h, haze, core, cracks, norm };
}

const dirs = process.argv.slice(2);
if (!dirs.length) { console.error('usage: node tools/refilter-frames.js <dir>...'); process.exit(1); }
for (const d of dirs) {
  const files = fs.readdirSync(d).filter(f => f.toLowerCase().endsWith('.png')).sort();
  let hz = 0, co = 0, cr = 0, nm = 0;
  for (const f of files) {
    const r = refilter(path.join(d, f));
    hz += r.haze; co += r.core; cr += r.cracks; nm += r.norm;
    console.log(`  ${f} ${String(r.w + 'x' + r.h).padStart(8)}`
      + `  haze cut ${String(r.haze).padStart(6)}  core solid ${String(r.core).padStart(6)}`
      + `  cracks left ${String(r.cracks).padStart(5)}  bg whitened ${String(r.norm).padStart(6)}`);
  }
  console.log(`${d}: ${files.length} frames, ${hz} haze px cut, ${co} core px restored to `
    + `solid white, ${cr} px of hairline gap left transparent, ${nm} transparent px whitened`);
}
