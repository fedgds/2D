"use strict";
// ===========================================================================
// 5. Frame assembly -- the one draw order that keeps the player readable:
//    floor -> ground decals -> shadows -> hero light -> enemies -> VFX ->
//    damage numbers -> hero -> sparks. The hero is drawn *after* the effect, so a
//    burst centred on the player never swallows it; numbers land before the hero
//    because an 11px number on a 14px sprite deletes the sprite.
// ===========================================================================
const BAR_LO = hexc('#c0374a'), BAR_HI = hexc('#5ac26a'), BAR_BG = hexc('#14141f');

function drawFoe(f) {
  const fr = foeFrame(f);
  const alpha = f.dying ? c01(1 - f.dying / 0.30) : 1;
  let flash = f.flash, dim = 1;
  if (f.frozen > 0) { flash = Math.max(flash, 0.26); dim = 0.86; }
  else if (f.slow > 0) dim = 0.78;
  // A monster winding up is lit from inside and the pulse quickens as the timer fills, so
  // the body itself says "this one is casting" even if the floor mark is off screen.
  if (f.chg > 0 && !f.dying)
    flash = Math.max(flash, (0.10 + 0.30 * f.chg) * (0.65 + 0.35 * Math.sin(f.chg * 26)));
  blit(fr.g, Math.round(f.x - (f.w >> 1)), Math.round(f.y - f.h) + fr.dy,
       flash, f.flip, alpha, dim);
  if (!f.dying && f.hp < f.maxhp) {
    const bw = f.w, x0 = Math.round(f.x - (bw >> 1)), y0 = Math.round(f.y - f.h - 3);
    const n = Math.round(bw * f.hp / f.maxhp);
    for (let i = 0; i < bw; i++)
      setPix(x0 + i, y0, i < n ? (f.hp > f.maxhp * 0.35 ? BAR_HI : BAR_LO) : BAR_BG, 0.9);
  }
}

function renderWorld(w, out) {
  setCam(w.cam.x, w.cam.y);           // integer camera + floor window for this frame
  buf.set(FLOOR);
  // Visible prop slice: props are y-sorted, so the window is a binary search plus a walk.
  // The margin covers the tallest sprite (13 px) and the torch spill.
  const props = w.props || PROPS;
  const lo = propLo(props, CAMY - 24), hi = propLo(props, CAMY + H + 24);
  for (let i = lo; i < hi; i++) {
    const p = props[i];
    if (p.tall || p.x < CAMX - 12 || p.x > CAMX + W + 12) continue;
    drawPropFlat(p, w.t);
  }
  for (const e of w.fxs) if (e.sk.under) e.sk.under(w, e, e.p);
  // Monster warnings go on last of the ground layers: a mark you cannot see because a
  // player effect is sitting on it is not a warning.
  for (const e of w.tels) drawTellUnder(w, e);
  for (const f of w.foes)
    shadowAt(f.x, f.y - 1, f.w * 0.5, Math.max(2, f.h * 0.14),
             0.55 * (f.dying ? c01(1 - f.dying / 0.30) : 1));
  const h = w.hero;
  shadowAt(h.x, h.y - 1, h.w * 0.5, Math.max(2, h.h * 0.14));
  heroLight(h.x, h.y - 1, h.glow);
  for (const p of w.puffs) {
    const k = 1 - p.t / p.life;
    core(p.x, p.y, p.r + (1 - k) * 1.6, DUST, 0.34 * k * k, 1.6);
  }
  // Tall props sort into the same y order as the units, so walking behind a pillar
  // puts the pillar in front of the enemy that is behind it.
  const order = [];
  for (let i = lo; i < hi; i++) {
    const p = props[i];
    if (p.tall && p.x > CAMX - 12 && p.x < CAMX + W + 12) order.push(p);
  }
  for (const f of w.foes) order.push(f);
  order.sort((a, b) => a.y - b.y);
  for (const o of order) { if (o.tall) drawPropTall(o, w.t); else drawFoe(o); }
  for (const e of w.fxs) if (e.sk.mid) e.sk.mid(w, e, e.p);
  for (const e of w.tels) drawTellMid(w, e);
  for (const n of w.nums) {
    const k = n.t / n.life, a = k < 0.6 ? 1 : c01((1 - k) / 0.4);
    text3x5(n.s, Math.round(n.x), Math.round(n.y), n.col, a);
  }
  const hf = heroFrame(h);
  drawHeld(w, true);
  blit(hf.g, Math.round(h.x - (h.w >> 1)), Math.round(h.y - h.h) + hf.dy,
       h.flash, h.flip, 1, 1);
  drawHeld(w, false);
  for (const e of w.fxs) if (e.sk.over) e.sk.over(w, e, e.p);
  // Weather last of the world layers: snow and embers are between the camera and
  // everything else, so they pass in front of the hero -- but still under the HUD.
  if (MAPDEF.ambDraw && w.amb && w.amb.length) MAPDEF.ambDraw(ambArg(w, 0));
  if (w.danger > 0) drawHeroWarn(w);
  drawMinimap(w);
  if (out) resolve(out);
}
// The minimap is the only thing on screen that is *not* in world space: it is drawn
// through setPixS so the camera cannot drag it off the corner.
const MM_W = 62, MM_H = 35;
// The whole painted rectangle, border included -- exported so the harness can exclude it
// from the "the screen edge must be floor" check instead of quietly widening a threshold.
const MM = { x: W - MM_W - 4, y: H - MM_H - 4, w: MM_W + 2, h: MM_H + 2 };
const MM_BG = hexc('#0a0a12'), MM_ED = hexc('#3b3b54'), MM_VIEW = hexc('#8fd6ff');
const MM_FOE = hexc('#c0374a'), MM_HERO = hexc('#eaf9ff');
const MM_WARN = hexc('#ffd24a');
function drawMinimap(w) {
  const x0 = W - MM_W - 3, y0 = H - MM_H - 3;
  const sx = MM_W / WW, sy = MM_H / WH;
  // Opaque, not blended. At 0.62 a torch standing behind the panel -- or any bright cast in
  // the bottom-right corner -- bled through as a warm haze and drowned the dots, because the
  // buffer underneath is additive HDR and can sit far above 1.0. A map you cannot read when
  // something is exploding is a map that is only readable when you do not need it.
  for (let y = 0; y < MM_H; y++)
    for (let x = 0; x < MM_W; x++) setPixS(x0 + x, y0 + y, MM_BG, 1);
  for (let x = -1; x <= MM_W; x++) {
    setPixS(x0 + x, y0 - 1, MM_ED, 1); setPixS(x0 + x, y0 + MM_H, MM_ED, 1);
  }
  for (let y = 0; y < MM_H; y++) {
    setPixS(x0 - 1, y0 + y, MM_ED, 1); setPixS(x0 + MM_W, y0 + y, MM_ED, 1);
  }
  for (const p of LANDMARKS)
    setPixS(x0 + Math.round(p.x * sx), y0 + Math.round(p.y * sy), MM_LM, 0.75);
  const vx = Math.round(CAMX * sx), vy = Math.round(CAMY * sy);
  const vw = Math.max(2, Math.round(W * sx)), vh = Math.max(2, Math.round(H * sy));
  for (let x = 0; x <= vw; x++) {
    setPixS(x0 + vx + x, y0 + vy, MM_VIEW, 0.85);
    setPixS(x0 + vx + x, y0 + vy + vh, MM_VIEW, 0.85);
  }
  for (let y = 0; y <= vh; y++) {
    setPixS(x0 + vx, y0 + vy + y, MM_VIEW, 0.85);
    setPixS(x0 + vx + vw, y0 + vy + y, MM_VIEW, 0.85);
  }
  // Casters are plotted in warning yellow with a one-pixel cross: on a 62x35 map that is
  // the difference between "there is a crowd north of me" and "something up there is
  // charging a move". Pending marks get a dot of their own, since a spitter's pool lands
  // nowhere near the spitter.
  for (const f of w.foes) {
    if (f.dying) continue;
    const warn = !!f.tel;
    const px = x0 + clamp(Math.round(f.x * sx), 0, MM_W - 1);
    const py = y0 + clamp(Math.round(f.y * sy), 0, MM_H - 1);
    setPixS(px, py, warn ? MM_WARN : MM_FOE, 0.95);
    if (warn) {
      setPixS(px + 1, py, MM_WARN, 0.45); setPixS(px - 1, py, MM_WARN, 0.45);
      setPixS(px, py + 1, MM_WARN, 0.45); setPixS(px, py - 1, MM_WARN, 0.45);
    }
  }
  for (const e of w.tels) {
    if (e.fired) continue;
    setPixS(x0 + clamp(Math.round(e.x * sx), 0, MM_W - 1),
            y0 + clamp(Math.round(e.y * sy), 0, MM_H - 1), MM_WARN, 0.8);
  }
  const hx = x0 + clamp(Math.round(w.hero.x * sx), 0, MM_W - 1);
  const hy = y0 + clamp(Math.round(w.hero.y * sy), 0, MM_H - 1);
  setPixS(hx, hy, MM_HERO, 1); setPixS(hx + 1, hy, MM_HERO, 0.5);
  setPixS(hx - 1, hy, MM_HERO, 0.5); setPixS(hx, hy - 1, MM_HERO, 0.5);
  setPixS(hx, hy + 1, MM_HERO, 0.5);
}
