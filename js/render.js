"use strict";
// ===========================================================================
// 5. Frame assembly -- the one draw order that keeps the player readable:
//    floor -> ground decals -> shadows -> hero light -> enemies -> VFX ->
//    damage numbers -> hero -> sparks. The hero is drawn *after* the effect, so a
//    burst centred on the player never swallows it; numbers land before the hero
//    because an 11px number on a 14px sprite deletes the sprite.
// ===========================================================================
const BAR_LO = hexc('#c0374a'), BAR_HI = hexc('#5ac26a'), BAR_BG = hexc('#14141f');
// A boss bar is wider than the boss, framed, and on from the first frame. A normal monster's
// bar appears only once it is hurt, which is right for something that dies in two hits; a
// minute-long fight needs a number you can watch, and one exactly as wide as a 21 px sprite
// cannot show the last 3% of 1500 HP.
const BAR_BOSS = hexc('#ffd98a');
const BOSS_BAR_W = 44;

function drawFoe(f) {
  // Boss nào có art trong ANIM_IMG thì vẽ art; còn lại (và cả khi chạy trong node vm không
  // nạp boss-frames.js) rơi về bộ lưới vẽ tay. Hai đường đi qua đúng cùng một `blit`, chỉ
  // khác cái palette truyền vào.
  const im = typeof ANIM_IMG !== 'undefined' ? ANIM_IMG[f.kind] : null;
  const fr = im ? foeImgFrame(f) : foeFrame(f);
  // Khung chết của art là ba tư thế đổ xuống đất, nên tan dần suốt 0,30 s là xoá chúng đi
  // trước khi kịp thấy: giữ đục tới 60% rồi mới mờ. Bộ vẽ tay không có khung chết nào cả,
  // với nó "tan dần" chính là toàn bộ hoạt ảnh chết, nên giữ nguyên.
  const alpha = f.dying ? (im ? c01((1 - f.dying / 0.30) / 0.40) : c01(1 - f.dying / 0.30)) : 1;
  let flash = f.flash, dim = 1;
  if (f.frozen > 0) { flash = Math.max(flash, 0.26); dim = 0.86; }
  else if (f.slow > 0) dim = 0.78;
  // A monster winding up is lit from inside and the pulse quickens as the timer fills, so
  // the body itself says "this one is casting" even if the floor mark is off screen.
  //
  // Boss có art thì chỉ lấy 40%: chính bộ khung cast đã nói câu đó rồi (tay giơ lên, lò trong
  // ngực bùng), nên phủ thêm một lớp trắng cộng lên trên là bạc màu đúng cái vừa dựng -- con
  // vua băng hoá ra trắng chứ không ra băng. Với quái thường thì lớp trắng đó *là* toàn bộ tín
  // hiệu, vì chúng không có khung cast nào.
  if (f.chg > 0 && !f.dying) {
    const g = (0.10 + 0.30 * f.chg) * (0.65 + 0.35 * Math.sin(f.chg * 26));
    flash = Math.max(flash, im ? g * 0.40 : g);
  }
  // Cỡ lấy từ *chính khung đang vẽ*, không từ f.w/f.h. Với lưới vẽ tay hai cái bằng nhau
  // (unit() đặt f.w/f.h từ lưới) nên không đổi gì; với art thì mỗi khung một cỡ, và neo là
  // (giữa lưới, đáy lưới) -- nên tay giơ lên thì cao thêm về phía đầu, chân vẫn tại chỗ.
  const gw = fr.g[0].length, gh = fr.g.length;
  blit(fr.g, Math.round(f.x - (gw >> 1)), Math.round(f.y - gh) + fr.dy,
       flash, f.flip, alpha, dim, im ? im.pal : null);
  if (f.dying) return;
  if (f.boss) {
    const bw = BOSS_BAR_W, x0 = Math.round(f.x - (bw >> 1)), y0 = Math.round(f.y - f.h - 5);
    const n = Math.round(bw * f.hp / f.maxhp);
    // Two rows plus a gold frame: at this width one row reads as a scratch on the floor, and
    // the frame is what says "this is the fight" rather than "this one has taken a hit".
    for (let i = -1; i <= bw; i++)
      for (let y = -1; y <= 2; y++) {
        const edge = i < 0 || i === bw || y < 0 || y === 2;
        if (edge) { setPix(x0 + i, y0 + y, BAR_BOSS, 0.55); continue; }
        setPix(x0 + i, y0 + y, i < n ? (f.hp > f.maxhp * 0.45 ? BAR_HI : BAR_LO) : BAR_BG, 0.92);
      }
    return;
  }
  if (f.hp < f.maxhp) {
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
  // Vòng ngắm của người chơi trên hiệu ứng của chính mình nhưng *dưới* cảnh báo của quái: nó là
  // thứ mình đang chủ động điều khiển nên không được che thứ đang sắp đánh mình.
  drawAimCue(w);
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
  drawWeaponCue(w);
  drawMinimap(w);
  if (out) resolve(out);
}

// The two weapon states that are decisions rather than events. Both are worn by the hero and
// both are invisible in the numbers, so they have to be on the sprite: a HUD readout for
// "your next swing is faster" is a thing you look away to check, and looking away is exactly
// what the sword is asking you not to do.
const MOMO_C = hexc('#bcd8ff'), MOMO_H = hexc('#eaf4ff'), GRD_C = hexc('#ffb066');
function drawWeaponCue(w) {
  const h = w.hero, sw = w.sw;
  // Planted: the ring sits on the ground and does not move, because the hero cannot either.
  // Two of them, one tight and one loose, so the state reads at a glance even mid-swing.
  if (sw && sw.wp.guard) {
    const a = 0.30 + 0.20 * Math.sin(w.t * 26);
    ring(h.x, h.y - 1, 10, 1.2, GRD_C, a, GSQ, 1.5);
    ring(h.x, h.y - 1, 13.5, 1.0, GRD_C, a * 0.55, GSQ, 1.6);
    for (let i = 0; i < 4; i++)
      chevron(h.x + Math.cos(i / 4 * TAU) * 12, h.y - 1 + Math.sin(i / 4 * TAU) * 12 * GSQ,
              i / 4 * TAU + Math.PI, 3.0, GRD_C, a * 0.8);
  }
  if (!(w.wp && w.wp.momentum && w.momo > 0)) return;
  // The window as a ring that *closes*: how much is left is how big it still is, so the
  // player reads the deadline off its size without reading a number. It tightens onto the
  // hero and the last third flickers, the same grammar the monster telegraphs use.
  const k = c01(w.momo / w.wp.momentum.win), cy = h.y - h.h * 0.55;
  const fl = k < 0.34 ? 0.55 + 0.45 * Math.sin(w.t * 40) : 1;
  ring(h.x, h.y - 1, 6 + 9 * k, 1.3, MOMO_C, 0.55 * fl, GSQ, 1.5);
  core(h.x, cy, 2.2 + 2.0 * k, MOMO_H, 0.35 * fl + 0.25 * k, 1.8);
  for (let i = 0; i < 3; i++) {
    const a0 = i / 3 * TAU + w.t * 3.4, rr = 6 + 10 * k;
    chevron(h.x + Math.cos(a0) * rr, cy + Math.sin(a0) * rr * 0.7, a0 + Math.PI,
            3.6, MOMO_H, 0.60 * fl, 1.0, 0.8);
  }
}
// Vòng ngắm của chế độ điện thoại. `w.aimUI` do shell dựng và chỉ tồn tại trong browser, nên ở
// harness node hàm này là một lệnh không làm gì -- không phải thêm nhánh nào cho nó.
//
// Nó vẽ bằng đúng những nét mà cảnh báo của quái đang dùng (ellipse nén GSQ trên sàn, mũi nhọn
// chỉ hướng, tâm sáng ở chỗ sẽ nổ), vì người chơi đã học đọc thứ ngôn ngữ đó suốt cả trận: một
// bộ hình thứ hai cho riêng phần ngắm là bắt học lại từ đầu đúng lúc đang bị ba con vây.
function drawAimCue(w) {
  const a = w.aimUI;
  if (!a || !a.on) return;
  const col = a.col, r = a.r;
  // Tầm xa nhất: một ellipse mảnh, mờ. Mảnh và mờ là *cố ý* -- nó là vạch giới hạn, không phải
  // một chiêu; đậm lên là nó tranh chỗ đọc với vùng đỏ của quái đang đứng trong đó.
  //
  // Hệ số nén lấy từ *chính thứ đang ngắm*: skill lấy GSQ như mọi hình vẽ trên sàn, còn lướt né
  // lấy 0,75 -- tỉ lệ y/x của phép đi lại -- vì với nó vòng này không phải hình trang trí mà là
  // đúng tập những chỗ chân hạ xuống được. Vẽ nó bằng GSQ là hứa một vùng mà cú lướt không tới.
  const sq = a.ky || GSQ;
  ring(a.hx, a.hy, r, 1.0, col, 0.18, sq, 2.0);
  const dx = a.x - a.hx, dy = a.y - a.hy;
  const ang = Math.atan2(dy, dx), len = Math.hypot(dx, dy);
  if (a.mode === 'dir') {
    // Chiêu theo hướng: cả nan quạt là con đường, nên vẽ một dải loe ra tới điểm ngắm rồi một mũi
    // nhọn ở đầu. Người chơi điều khiển *góc*, và góc chỉ đọc được khi có hai đầu để so.
    beam(a.hx, a.hy, ang, 4, Math.max(8, len), 2.2, 5.2, col, 0.22, 1.3, 0.55);
    // Ba mũi rải trên *đúng đoạn thẳng tới điểm ngắm*, không phải trên một cung dựng lại từ góc:
    // điểm ngắm đã nén trục y một lần rồi, nén thêm lần nữa là ba mũi trôi ra khỏi dải sáng.
    for (let i = 0; i < 3; i++) {
      const t = 1 - i * 0.15;
      chevron(a.hx + dx * t, a.hy + dy * t, ang, 4.4 - i * 0.8, col, 0.45 - i * 0.1, 1.0, 0.85);
    }
    return;
  }
  // Chiêu theo điểm: một sợi chỉ từ chân người tới đích, rồi một tâm ngắm. Sợi chỉ là thứ nói
  // "chiêu này của *mình*" khi đích rơi vào giữa một bầy quái đang có vùng cảnh báo riêng.
  if (len > 6) beam(a.hx, a.hy, ang, 5, len - 4, 0.6, 1.2, col, 0.20, 1.4, 0.5);
  ring(a.x, a.y, 7.5, 1.1, col, 0.5, GSQ, 1.5);
  ring(a.x, a.y, 3.0, 0.9, col, 0.3, GSQ, 1.6);
  core(a.x, a.y, 2.0, col, 0.34, 1.9);
  // Bốn mũi chụm vào tâm: ở cỡ 320x180 một vòng tròn 7 px giữa sàn sáng đọc ra là một hạt bụi,
  // còn bốn mũi chỉ vào nhau thì đọc ra là "chỗ này".
  for (let i = 0; i < 4; i++) {
    const t = i / 4 * TAU + Math.PI / 4;
    chevron(a.x + Math.cos(t) * 11, a.y + Math.sin(t) * 11 * GSQ, t + Math.PI, 3.2, col, 0.42, 1.0, 0.8);
  }
}
// The minimap is the only thing on screen that is *not* in world space: it is drawn
// through setPixS so the camera cannot drag it off the corner.
const MM_W = 62, MM_H = 35;
// Ở chế độ điện thoại góc dưới phải là chỗ đặt ngón cái, nên minimap dời lên góc trên phải.
// `MM` là hộp mà harness loại ra khỏi phép kiểm "mép màn hình phải là sàn", nên nó phải đi theo
// cùng một công tắc: một hằng số cứng ở đây và một chỗ khác vẽ là hai nguồn sự thật cho một con
// số, và bản trước của boss đã trả giá đúng chuyện đó. Node không có DOM nên mặc định là góc cũ.
let MM_TOP = false;
// The whole painted rectangle, border included -- exported so the harness can exclude it
// from the "the screen edge must be floor" check instead of quietly widening a threshold.
const MM = { x: W - MM_W - 4, y: H - MM_H - 4, w: MM_W + 2, h: MM_H + 2 };
function setMinimapTop(on) { MM_TOP = !!on; MM.y = MM_TOP ? 3 : H - MM_H - 4; }
const MM_BG = hexc('#0a0a12'), MM_ED = hexc('#3b3b54'), MM_VIEW = hexc('#8fd6ff');
const MM_FOE = hexc('#c0374a'), MM_HERO = hexc('#eaf9ff');
const MM_WARN = hexc('#ffd24a');
function drawMinimap(w) {
  const x0 = W - MM_W - 3, y0 = MM_TOP ? 4 : H - MM_H - 3;
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
