"use strict";
// ===========================================================================
// 6a-bis. Dash -- the one ability every run carries.
//
//     Deliberately *not* one of the sixteen. A dodge is not a build choice, it is the
//     movement verb: monsters telegraph a shape on the floor and then hit it, and at
//     56 px/s of walking the only counterplay to a wide mark is to have already left,
//     which is not counterplay. So every loadout gets this, on its own key and its own
//     cooldown, and none of the three skill slots pays for it.
//
//     It is committed on purpose. Once it starts it owns the hero's position for 0.155 s
//     -- no steering, no cancel -- and it hands back 0.30 s of invulnerability in
//     exchange. That trade is the whole skill: read the mark, spend the dash, and if you
//     spent it early you are standing in the blast with 1.05 s of nothing.
// ===========================================================================
const DASH_DUR = 0.155;         // travel time
const DASH_LEN = 62;            // a little over two seconds of walking, covered at once
const DASH_CD = 1.05;
const DASH_IV = 0.30;           // i-frames: the whole slide plus a beat of landing
// Cool and metallic, and nothing like the sixteen: this is a defensive move and it must
// never be mistaken on sight for a cast that deals damage.
const DASH_SK = {
  id: 'dash', name: 'Lướt', dur: 0.42,
  under(w, e, p) {
    const d = e.data, fd = fade(p, 0.30);
    ring(d.fx, d.fy - 1, 7 + 13 * eo(p), 1.6, C.steel, 0.34 * fd, 0.40);
    ring(d.tx, d.ty - 1, 6 + 10 * eo(p), 1.8, C.pale, 0.40 * fd, 0.40);
    dashline(d.fx, d.fy - 1, d.tx, d.ty - 1, 5, 1.8, C.steel, 0.26 * fd, 0.6);
  },
  over(w, e, p) {
    const d = e.data, fd = fade(p, 0.24);
    line(d.fx, d.fy - 7, d.tx, d.ty - 7, 3.4, C.steel, 0.24 * fd);
    line(d.fx, d.fy - 7, d.tx, d.ty - 7, 1.2, C.pale, 0.60 * fd);
    // Ghosts drawn flash-white at low alpha, the same trick shadow_dash uses: a dim
    // sprite on a dark floor is a smudge, not an afterimage.
    for (const t of [0.34, 0.66]) {
      const gx = d.fx + (d.tx - d.fx) * t, gy = d.fy + (d.ty - d.fy) * t;
      blit(HERO, Math.round(gx - 5), Math.round(gy - 14), 0.9, d.flip,
           0.26 * fd * (0.45 + 0.55 * t), 1);
    }
    chevron(d.tx, d.ty - 7, d.ang, 4.5, C.pale, 0.65 * fd);
    core(d.tx, d.ty - 7, 6, C.steel, 0.40 * fd, 1.8);
    // Grit kicked backwards out of the launch point, in a cone opposite the travel.
    sparks(d.fx, d.fy - 7, 9, 2, 14, C.pale, 0.55 * fd, e.seed, 1.0, 1,
           d.ang + Math.PI - 0.7, d.ang + Math.PI + 0.7, 5 * (1 - p));
  },
};
// Direction comes from the movement keys when there are any, and from the facing
// otherwise: holding a direction and dashing should go *there*, and a player who is
// standing still gets the lunge forward that a dodge button is expected to give.
function dash(w, dx, dy) {
  if (w.dcd > 0) return false;
  const h = w.hero;
  let l = Math.hypot(dx, dy);
  if (l < 1e-6) { dx = h.flip ? -1 : 1; dy = 0; l = 1; }
  dx /= l; dy /= l;
  // The 0.75 is the walk's own y/x ratio (42 px/s over 56): a dash covers the same
  // *shape* of ground as walking does, so dodging upward is not secretly better than
  // dodging sideways.
  const tx = clamp(h.x + dx * DASH_LEN, BOUND.x0, BOUND.x1);
  const ty = clamp(h.y + dy * DASH_LEN * 0.75, BOUND.y0, BOUND.y1);
  h.dsh = DASH_DUR;
  h.dvx = (tx - h.x) / DASH_DUR;
  h.dvy = (ty - h.y) / DASH_DUR;
  h.inv = Math.max(h.inv, DASH_IV);
  w.dcd = DASH_CD;
  w.fxs.push({ sk: DASH_SK, i: -1, t: 0, dur: DASH_SK.dur, p: 0, pt: 0,
               seed: w.rng.int(1, 1e9) | 0, ox: h.x, oy: h.y - h.h * 0.5,
               data: { fx: h.x, fy: h.y, tx, ty, flip: h.flip,
                       ang: Math.atan2(ty - h.y, tx - h.x) } });
  w.shake = Math.max(w.shake, 0.7);
  return true;
}

