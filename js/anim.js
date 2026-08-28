"use strict";
// ===========================================================================
// 3c. Animation. There is exactly one authored pose per character, so every other
//     frame is generated at load time by deforming it (see the rig rules: rows are
//     *remapped* with the source row clamped inside the block, so lifting a body
//     duplicates the boundary row instead of tearing a gap into it; the planted leg
//     never slides). All frames are built once -- nothing deforms at runtime.
// ===========================================================================
const rows = g => g.map(r => r.split(''));
const grid = rs => rs.map(r => r.join(''));

// Move rows [r0..r1] by dy, taking each destination row from a clamped source row:
// the row at the edge of the block is duplicated, never blanked.
function liftRows(rs, r0, r1, dy) {
  const src = rs.map(r => r.slice());
  for (let y = r0; y <= r1; y++) rs[y] = src[clamp(y - dy, r0, r1)].slice();
}
// Same idea but only inside columns [c0..c1], and the vacated row *is* cleared: this is
// a foot leaving the ground, so the hole under it is the point.
function liftPart(rs, r0, r1, c0, c1) {
  const src = rs.map(r => r.slice());
  for (let y = r0; y <= r1; y++)
    for (let c = c0; c <= c1; c++) rs[y][c] = y < r1 ? src[y + 1][c] : '.';
}
// Slide a box sideways; only ever applied to the leg that is swinging.
function slideBox(rs, r0, r1, c0, c1, dx) {
  const w = rs[0].length;
  for (let y = r0; y <= r1; y++) {
    const src = rs[y].slice();
    for (let c = c0; c <= c1; c++) rs[y][c] = '.';
    for (let c = c0; c <= c1; c++) {
      const t = c + dx;
      if (t < 0 || t >= w || src[c] === '.') continue;
      rs[y][t] = src[c];
    }
  }
}
// Resample rows [r0..r1] from source rows [s0..s1] (nearest, clamped). This is how a blob
// squashes and stretches without the outline breaking: every destination row is still a real
// source row, so no gap can open, and the rows outside the destination range are cleared --
// a squashed blob is *shorter*, it does not leave a ghost of its old top behind.
function remapRows(rs, r0, r1, s0, s1) {
  const src = rs.map(r => r.slice()), blank = rs[0].map(() => '.');
  const dn = r1 - r0, sn = s1 - s0;
  for (let y = 0; y < rs.length; y++) {
    if (y < r0 || y > r1) { rs[y] = blank.slice(); continue; }
    const t = dn === 0 ? 0 : (y - r0) / dn;
    rs[y] = src[clamp(s0 + Math.round(t * sn), 0, rs.length - 1)].slice();
  }
}
// The same for columns, used to narrow a blob as it stretches upward.
function remapCols(rs, c0, c1, s0, s1) {
  const dn = c1 - c0, sn = s1 - s0;
  for (let y = 0; y < rs.length; y++) {
    const src = rs[y].slice();
    for (let c = 0; c < src.length; c++) rs[y][c] = '.';
    for (let c = c0; c <= c1; c++) {
      const t = dn === 0 ? 0 : (c - c0) / dn;
      rs[y][c] = src[clamp(s0 + Math.round(t * sn), 0, src.length - 1)];
    }
  }
}
// A frame is a grid plus a vertical draw offset: the 1px body bounce of a walk cycle is
// an offset, not a deformation, because remapping the torso upward inside a 14-row grid
// would eat the top outline row of the head.
function fr(g, dy) { return { g: g, dy: dy || 0 }; }
const ANIM = {};
{
  // Hero legs: left foot cols 2-4, right foot cols 6-8, col 5 is the shared outline.
  const contact = right => {
    const rs = rows(HERO);
    slideBox(rs, 12, 13, right ? 6 : 2, right ? 8 : 4, right ? 1 : -1);   // foot forward
    slideBox(rs, 12, 13, right ? 2 : 6, right ? 4 : 8, right ? -1 : 1);   // other one back
    const hc = right ? 1 : 9, ho = right ? 0 : 10;      // the hand that swings forward
    rs[10][hc] = 'C'; rs[10][ho] = 'K';
    return grid(rs);
  };
  const pass = right => {
    const rs = rows(HERO);
    liftPart(rs, 10, 13, right ? 6 : 2, right ? 8 : 4);                   // foot off the floor
    return grid(rs);
  };
  const breathe = () => { const rs = rows(HERO); liftRows(rs, 5, 9, -1); return grid(rs); };
  // Attack poses. Only the right-hand version exists: the hero is blitted with `flip` when
  // it swings leftward, which mirrors the reach for free. Row 5-7 cols 9-10 are the arm --
  // cocked up for the wind-up, thrown out to shoulder height for the strike -- and the
  // strike frame also drops the body 1px so the whole sprite leans into the blow.
  const cock = () => {
    const rs = rows(HERO);
    rs[5][9] = 'C'; rs[5][10] = 'K'; rs[6][9] = 'C';
    return grid(rs);
  };
  const strike = () => {
    const rs = rows(HERO);
    rs[6][9] = 'C'; rs[6][10] = 'K'; rs[7][9] = 'C'; rs[7][10] = 'C';
    return grid(rs);
  };
  ANIM.hero = {
    walk: [fr(contact(true), 0), fr(pass(true), -1), fr(contact(false), 0), fr(pass(false), -1)],
    idle: [fr(HERO, 0), fr(breathe(), 0)],
    atk: [fr(cock(), -1), fr(strike(), 0)],
  };
  const wtail = dx => { const rs = rows(WRAITH); slideBox(rs, 8, 9, 3, 7, dx); return grid(rs); };
  // A slime is a blob, so its walk is squash and stretch, not legs: land flat (rows 0-1
  // cleared, the body resampled into what is left), rise, hop narrow, land soft. Four
  // *distinct* poses -- the first version was SLIME at four heights, which is a lift, not
  // an animation: the strip showed one shape sliding up and down.
  const squash = k => {
    const rs = rows(SLIME);
    remapRows(rs, k, 6, 0, 6);
    return grid(rs);
  };
  const stretch = () => {
    const rs = rows(SLIME);
    remapCols(rs, 1, 7, 0, 8);
    return grid(rs);
  };
  ANIM.slime  = { walk: [fr(squash(2), 0), fr(SLIME, -1), fr(stretch(), -3), fr(squash(1), -1)],
                  idle: [fr(SLIME, 0), fr(squash(1), 0)] };
  ANIM.wraith = { walk: [fr(WRAITH, 0), fr(wtail(1), -1), fr(WRAITH, -2), fr(wtail(-1), -1)],
                  idle: [fr(WRAITH, -1), fr(wtail(1), 0), fr(WRAITH, -2), fr(wtail(-1), -1)] };
  // The brute plods: one foot leaves the floor at a time (cols 2-5 and 7-10 are the legs),
  // and on the second pass the head sinks into the shoulders, so the four frames are four
  // shapes instead of one silhouette bobbing 1px.
  const bstep = right => {
    const rs = rows(BRUTE);
    liftPart(rs, 12, 14, right ? 7 : 2, right ? 10 : 5);
    return grid(rs);
  };
  const bhunch = () => { const rs = rows(BRUTE); liftRows(rs, 1, 6, 1); return grid(rs); };
  ANIM.brute  = { walk: [fr(bstep(false), 0), fr(BRUTE, -1), fr(bstep(true), 0), fr(bhunch(), -1)],
                  idle: [fr(BRUTE, 0), fr(bhunch(), -1)] };
  // The spitter's legs are two pairs (rows 7-8, cols 0-4 and 6-10) and they alternate;
  // the abdomen dips on the frame the front pair is planted, which is what stops eight
  // fast frames from reading as a bug on a conveyor belt.
  const sleg = right => {
    const rs = rows(SPITTER);
    liftPart(rs, 7, 8, right ? 6 : 0, right ? 10 : 4);
    return grid(rs);
  };
  const sdip = () => { const rs = rows(SPITTER); liftRows(rs, 1, 6, -1); return grid(rs); };
  ANIM.spitter = { walk: [fr(sleg(false), 0), fr(sdip(), 0), fr(sleg(true), 0), fr(SPITTER, -1)],
                   idle: [fr(SPITTER, 0), fr(sdip(), 0)] };
  // The bomber has no legs to move, so its cycle is the shell squatting and the fuse
  // whipping the other way -- a ball that rolls itself forward.
  const bfuse = dx => { const rs = rows(BOMBER); slideBox(rs, 0, 1, 2, 6, dx); return grid(rs); };
  const bsquat = () => { const rs = rows(BOMBER); liftRows(rs, 3, 8, -1); return grid(rs); };
  ANIM.bomber = { walk: [fr(bfuse(1), 0), fr(bsquat(), -1), fr(bfuse(-1), 0), fr(BOMBER, -1)],
                  idle: [fr(BOMBER, 0), fr(bfuse(1), -1)] };
  // The sentinel floats, so its "walk" is the same bob as the wraith's plus a pupil that
  // tracks sideways: the lens row is repainted rather than slid, because sliding it would
  // punch a hole in the white of the eye.
  const slook = dx => {
    const rs = rows(SENTINEL);
    for (let c = 3; c <= 7; c++) rs[4][c] = 'I';
    for (let c = 4; c <= 6; c++) rs[4][clamp(c + dx, 3, 7)] = 'E';
    return grid(rs);
  };
  ANIM.sentinel = { walk: [fr(slook(1), 0), fr(SENTINEL, -1), fr(slook(-1), -2), fr(SENTINEL, -1)],
                    idle: [fr(SENTINEL, 0), fr(slook(1), -1), fr(SENTINEL, -2), fr(slook(-1), -1)] };
}
function heroFrame(h) {
  const a = ANIM.hero;
  // A swing overrides the locomotion cycle: `h.atk` is the beat-local 0..1 that `step`
  // copies off the live swing, so a four-beat sword shows four wind-up/strike pairs and a
  // gauntlet flurry shows five, without the pose ever drifting out of sync with the hits.
  if (h.atk >= 0) return a.atk[h.atk < 0.34 ? 0 : 1];
  return h.mv > 0 ? a.walk[Math.floor(h.ph) & 3] : a.idle[Math.floor(h.it * 1.7) & 1];
}
function foeFrame(f) {
  const a = ANIM[f.kind];
  // Bosses are the only things with authored cast poses, and they override locomotion outright:
  // wind-up while the clock is in its first half, gather for the rest of it, and then the
  // release, which is held by `f.rel` past the frame the hit lands. A monster gets none of
  // this -- it glows from inside for 0.8 s and that is enough -- so `a.cast` is the whole test.
  if (a.cast) {
    if (f.chg > 0) return a.cast[f.chg < 0.45 ? 0 : 1];
    if (f.rel > 0) return a.cast[2];
  }
  const n = f.mv > 0.4 ? a.walk : a.idle;
  return n[Math.floor(f.ph) % n.length];
}
