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
// Màu của vết xé (vuốt, `rend` trong js/weapon.js). Cùng sắc hồng với `col` của vũ khí, nhưng
// sáng hơn hẳn: nó phải đọc được khi nằm cạnh một thanh máu đỏ.
const REND_C = hexc('#ffc2c8');

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
  const sourceScale = im ? im.scale : 1;
  const gw = fr.g[0].length / sourceScale, gh = fr.g.length / sourceScale;
  const gx = f.x - (fr.g[0].length - 1) / (2 * sourceScale);
  const gy = f.y - gh + fr.dy;
  // Đối thủ solo cầm một cây vũ khí thật, và nó vẽ hai lượt quanh thân đúng như cây vũ khí trong tay
  // nhân vật: nửa vòng ngắm chỉ ra xa camera đi trước, nửa còn lại đi sau. Chỉ nó dùng đường này --
  // `drawFoeHeld` (js/duel.js) tự thoát ở dòng đầu với mọi `f.kind` khác.
  if (typeof drawFoeHeld === 'function') drawFoeHeld(f, true);
  if (im && sourceScale > 1)
    blitFine(fr.g, gx, gy, sourceScale, flash, f.flip, alpha, dim, im.pal);
  else
    blit(fr.g, Math.round(gx), Math.round(gy), flash, f.flip, alpha, dim, im ? im.pal : null);
  if (typeof drawFoeHeld === 'function') drawFoeHeld(f, false);
  if (f.dying) return;
  // Vết xé, một điểm sáng mỗi vết, xếp thành cột bên phải thanh máu. Đếm điểm chứ không viết số:
  // bảng GLYPHS chỉ có chữ số và hai chữ cái, mà một chữ số cao 5 px đặt cạnh một con quái cao
  // 14 px thì xoá mất con quái. Cách nhau 2 px để năm vết còn đếm được bằng mắt.
  //
  // Vẽ bằng `setPix` -- đường vật chất, cùng thứ tiếng hai thanh máu đang nói -- chứ không bằng
  // ánh sáng cộng thêm: đây là một *con số*, không phải một quầng sáng để cảm nhận.
  if (f.rnd > 0) {
    const bw = f.boss ? BOSS_BAR_W : f.w;
    const x = Math.round(f.x - (bw >> 1)) + bw + (f.boss ? 3 : 2);
    const y = Math.round(f.y - f.h - (f.boss ? 4 : 3));
    for (let i = 0; i < f.rnd; i++) setPix(x, y - i * 2, REND_C, 0.92);
  }
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

// Con số chí mạng. Một con số 3x5 màu vàng nhạt giữa một trận có sáu quả cầu sáng là một con
// số không ai đọc, và chí mạng là con số duy nhất người chơi *cần* thấy ngay -- nên nó được ba
// thứ mà con số thường không có: gấp đôi cỡ, một viền đỏ sẫm để nó không tan vào nền sáng, và
// một quầng cộng sáng phía sau mang màu của chính chiêu vừa đánh (chữ thì luôn trắng-vàng, xem
// CRIT_C trong js/world.js -- danh tính của chiêu nằm ở quầng, không ở chữ).
//
// Cú nảy: vào ở 2.84 rồi rơi về 2.0 trong 0.16s. Cỡ đứng yên ngay từ khung đầu thì con số chỉ
// là to; nó phải *đập* một nhịp mới thành một cú chí mạng.
const CRIT_SC = 2.0, CRIT_POP = 0.16;
function drawCritNum(n, a) {
  const pop = n.t < CRIT_POP ? 1 + 0.42 * (1 - n.t / CRIT_POP) : 1;
  const sc = CRIT_SC * pop;
  const wid = textWScaled(n.s, sc), hgt = Math.round(5 * sc);
  // Neo ở *đáy*: con số phình lên trên chứ không nở ra hai phía, nên nó không bao giờ trùm
  // xuống cái đầu của con vừa ăn đòn.
  const y = Math.round(n.y) + 5 - hgt;
  core(n.cx, y + hgt * 0.5, wid * 0.42 * pop, n.glow, 0.42 * a * (pop - 0.55), 1.7);
  textScaled(n.s, Math.round(n.cx - wid / 2), y, n.col, a, sc, CRIT_KEY);
}

// ---- món trang bị nằm trên sàn ---------------------------------------------------------------
// Hai màu cho mỗi phẩm chất, lấy từ đúng ramp mà js/doll.js dựng cho phẩm chất ấy. Không phải để
// tiết kiệm một dòng: cái vệt sáng bay ra khỏi con quái và miếng giáp người chơi sắp mặc vào là
// *cùng một màu*, nên "cái cam vừa rơi" và "cái cam đang trên vai" nối được với nhau mà không cần
// một chú thích nào. `c` là màu phẩm chất thuần (buffer là cộng sáng, nên nó cần độ bão hoà), `h`
// là bậc điểm nhấn gần trắng dùng cho hạt lõi và tia loé.
//
// `p` là **trọng số nổi bật**, và nó là thứ trả lời câu "món này có đáng chạy tới không?" trước
// khi người chơi đọc nổi màu. Nó nhân vào bán kính, vũng sáng, tia loé và số hạt bay lên, nên đồ
// Sử Thi và Huyền Thoại không chỉ khác màu mà khác *cỡ*: nhận ra được ở rìa màn hình, qua thân một
// con quái, hay khi cả sàn đang loé vì skill. Đồ Thường thì nhỏ hơn một chút so với trước -- khoảng
// cách giữa hai đầu bảng mới là tín hiệu, và nó rẻ hơn việc làm mọi món đều sáng rực.
const ORB_P = { common: 0.94, rare: 1.10, epic: 1.42, legendary: 1.72 };
const ORB_C = {};
for (let i = 0; i < GEAR_RARITY.length; i++) {
  const r = GEAR_RARITY[i];
  ORB_C[r.id] = { c: hexc(r.col), h: hexc(dollRamp(r.id)['4']), p: ORB_P[r.id] || 1, k: i };
}

// Chỗ món đang ở trên màn hình. `z` là độ cao trên sàn và là của sim; cái nhấp nhô lên xuống thì
// *của render*, vì một món nằm yên vẫn phải thở mà một phần điểm ảnh dao động trong sim là một
// phần điểm ảnh có thể lệch giữa hai trận cùng seed. Lệch pha theo `seed`, nên năm món nằm cạnh
// nhau không nhấp nhô cùng một nhịp -- năm cái đèn cùng pha đọc ra là một thanh đèn.
function orbPh(w, o) { return 0.5 + 0.5 * Math.sin(w.t * 3.1 + (o.seed & 63) * 0.1); }
function orbY(w, o) { return o.y - o.z - (o.land > 0 ? 1.3 + (orbPh(w, o) - 0.5) * 1.8 : 0); }

// Lớp sàn: vũng sáng và vành quanh nó. Đây là cái duy nhất còn nhìn ra được khi món nằm sau một
// cái cột hay dưới chân một con quái, nên nó rộng hơn thân món và phập phồng cùng nhịp với thân.
// Món đang bay thì chưa có vũng, chỉ một cái bóng nhỏ đậm dần khi nó xuống -- không có cái bóng
// ấy thì đường bay không nói được nó sắp chạm đất ở đâu.
//
// Hai bậc trên có thêm một vành ngoài rất mờ, rộng gần gấp đôi: nó không đọc ra như một cái vành
// nữa mà như một quầng sáng trên sàn, và đó là cái nhìn thấy được từ xa nhất trong cả hiệu ứng.
function drawOrbFloor(w, o) {
  const C = ORB_C[o.rar] || ORB_C.common, p = C.p;
  if (o.land <= 0) { shadowAt(o.x, o.y, 2.4, 1.2, 0.45 * c01(1 - o.z / 24)); return; }
  const ph = orbPh(w, o);
  puddle(o.x, o.y, (6.7 + ph * 1.5) * p, (2.6 + ph * 0.6) * p, C.c, 0.15 + 0.07 * ph, o.seed, 5, 1.3);
  ring(o.x, o.y, (7.7 + ph * 2.1) * p, 0.9, C.c, 0.11 + 0.06 * ph, 0.38, 1.5);
  if (C.k >= 2)
    ring(o.x, o.y, (12.5 + ph * 4.6) * p, 0.85, C.c, 0.075 + 0.055 * ph, 0.34, 1.15);
}

// Lớp trên: chùm tia bật ra, vệt bay, thân món, tia loé, và mấy hạt bay lên. Vẽ *trên* nhân vật
// vì tất cả là ánh sáng cộng vào -- một món đang bị hút vào người thì cái sáng lên là người, và
// đó đúng là việc đang xảy ra.
function drawOrb(w, o) {
  const C = ORB_C[o.rar] || ORB_C.common, y = orbY(w, o), pw = C.p;
  // Chùm tia bật ra khỏi xác: 0,4 giây, và tính từ *chỗ bật* chứ không phải chỗ món đang bay tới.
  // Câu nó nói là "con này vừa trả đồ", nên nó phải đứng lại ở chỗ cái xác vừa nằm.
  if (o.t < 0.42) {
    const k = 1 - o.t / 0.42, e = 1 - k;
    sparks(o.sx, o.sy, 9 + C.k * 4, 1.5, (3 + e * 17) * pw, C.c, 0.55 * k * k, o.seed, 1, 0.62, 0, TAU, 3.2);
    star(o.sx, o.sy, C.h, 5, 0, (5 + e * 9) * pw, 1.1, 0.42 * k * k, (o.seed ^ 0x9e37) >>> 0, 0.4);
    core(o.sx, o.sy, (2.4 + e * 6) * pw, C.h, 0.5 * k * k, 1.8);
  }
  // Đang bay: vệt kéo theo đúng vận tốc *trên màn hình*, nên `vz` (đi lên) trừ vào y. Món vừa bật
  // ra có vệt dựng đứng, món sắp chạm đất có vệt gần ngang -- một vệt luôn nằm ngang thì cả đường
  // vòng cung biến thành một vật trượt trên sàn.
  if (o.land <= 0) {
    const sx = o.vx * 0.055, sy = (o.vy - o.vz) * 0.055;
    line(o.x - sx, y - sy, o.x, y, 1.5, C.c, 0.4, 1.4, 1);
  }
  const ph = orbPh(w, o), pl = o.pull;
  // Cột sáng mảnh dựng lên khỏi món, **chỉ** cho Sử Thi và Huyền Thoại. Đây là cái duy nhất trong
  // cả hiệu ứng vươn ra ngoài tầm mắt hướng xuống sàn: nó cao hơn thân quái, nên một món cam nằm
  // sau đàn quái vẫn tự chỉ chỗ nó. Mờ dần ở đầu trên (`fadeEnd`) để nó không thành một cây cột.
  if (C.k >= 2 && o.land > 0.1) {
    const bh = (13 + ph * 5) * pw, ba = (0.19 + 0.08 * ph) * (C.k >= 3 ? 1.35 : 1);
    line(o.x, y - 2, o.x, y - 2 - bh, 1.1 + C.k * 0.25, C.c, ba, 1.1, 1);
  }
  // Hai lõi: quầng màu phẩm chất, và một hạt gần trắng ở giữa. Không có hạt trắng thì một món
  // Thường (xanh lá tối) chìm hẳn vào sàn của arena rừng.
  core(o.x, y, (3.9 + ph * 0.9 + pl * 1.6) * pw, C.c, 0.5 + 0.12 * ph + pl * 0.25, 1.7);
  core(o.x, y, (1.45 + pl * 0.5) * pw, C.h, 0.85, 1.3);
  // Tia loé bốn cánh, và nó **tắt hẳn** nửa chu kỳ. Sáng liên tục thì món là một bóng đèn; tắt
  // rồi loé lại mới là lấp lánh, và chu kỳ riêng theo `seed` nên hai món cạnh nhau loé lệch nhau.
  // Cái quầng mềm một mình chỉ làm món *sáng hơn*; thứ mắt đọc ra là "lấp lánh" là bốn cái gai
  // vươn ra rồi thu về, nên có cả hai: quầng cho khối sáng, gai cho nhịp.
  //
  // Hai bậc trên loé nhanh hơn (`2.3 -> 3.1`) và thêm hai cánh nữa: cùng một cỡ, một cái nhấp
  // nháy gấp rưỡi vẫn bắt mắt hơn -- chuyển động là thứ thị giác ngoại vi đọc được, không phải màu.
  const tw = Math.sin(w.t * (2.3 + C.k * 0.26) + (o.seed & 255) * 0.05);
  if (tw > 0) {
    glare(o.x, y, (5.4 + tw * 3.4) * pw, (3.4 + tw * 2.4) * pw, C.h, 0.30 * tw);
    star(o.x, y, C.h, 4 + (C.k >= 2 ? 2 : 0), 0.5, (2.2 + tw * 5.4) * pw, 0.85, 0.55 * tw * tw, 0x2b1, 0);
  }
  // Mấy hạt bay lên khỏi món đã nằm yên: cái làm nó "lấp lánh bay ra" chứ không chỉ là một đốm
  // sáng đứng im. Mỗi hạt một đồng hồ riêng lệch pha, nên chúng không lên thành một hàng. Bậc càng
  // cao càng nhiều hạt (3 -> 6), và đó là cách rẻ nhất để một món trông "đang toả" thay vì "đang sáng".
  if (o.land > 0.1) {
    const n = 3 + C.k;
    for (let i = 0; i < n; i++) {
      const p = (w.t * 0.62 + i * 0.37 + ((o.seed >>> (i * 4)) & 15) * 0.06) % 1;
      const rx = Math.sin(i * 2.1 + (o.seed & 7) + p * 3.4) * 3.1 * pw;
      core(o.x + rx, y - 1 - p * 9 * pw, 0.85 + C.k * 0.08, C.h, 0.5 * (1 - p) * Math.min(1, p * 6), 1.3);
    }
  }
}

// Cú nháy lúc món vào túi, ở *người nhân vật* chứ không ở chỗ món vừa nằm: câu nó nói là "cái này
// giờ là của bạn", và một vòng sáng nở ra ở chỗ khác thì nói đúng câu ngược lại. Màu là màu phẩm
// chất, nên nhặt được một món cam thì biết ngay mà không cần mở túi.
function drawGot(w) {
  const C = ORB_C[w.gotR] || ORB_C.common, h = w.hero, pw = C.p;
  const k = w.got / 0.34, e = 1 - k, y = h.y - h.h * 0.5;
  ring(h.x, y, (2 + e * 13) * pw, 1.2 + k * 1.4, C.c, 0.5 * k * k, 0.62, 1.5);
  core(h.x, y, (3 + e * 5) * pw, C.h, 0.4 * k * k, 1.8);
  star(h.x, y, C.h, 6, 1, (6 + e * 6) * pw, 1, 0.35 * k, 0x51e7, 0.35);
  // Nhặt được đồ tím hoặc cam thì có thêm một vành thứ hai đi sau, chậm hơn: hai vòng sáng nối
  // nhau đọc ra là "được cái tốt", và người chơi không phải mở túi mới biết.
  if (C.k >= 2) {
    const k2 = c01(k * 1.45 - 0.45), e2 = 1 - k2;
    if (k2 > 0) ring(h.x, y, (3 + e2 * 19) * pw, 1 + k2 * 1.2, C.h, 0.3 * k2 * k2, 0.62, 1.3);
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
  // Vũng sáng của món trên sàn, cùng lớp với bụi chân: nó nằm *trên* sàn và *dưới* mọi thứ đứng
  // trên sàn, nên một con quái đi qua che nó đúng như che một cái vũng nước.
  if (w.orbs) for (const o of w.orbs) drawOrbFloor(w, o);
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
    if (n.crit) { drawCritNum(n, a); continue; }
    text3x5(n.s, Math.round(n.cx - textW(n.s) / 2), Math.round(n.y), n.col, a);
  }
  // Nhân vật đang mặc gì thì trên màn chơi thấy đúng cái đó: `wornFrame` trả về khung của
  // ANIM.hero khi người trần, còn khi có trang bị thì là bộ khung dựng từ *cùng* lưới ký tự mà
  // bảng trạng thái đang in ra, cộng bảng màu riêng của bộ đồ (xem js/doll.js). `hf.dx`/`hf.dy`
  // kéo lưới 13x16 về đúng chỗ lưới 11x14 đứng, nên hitbox và bàn chân không xê dịch.
  const hf = wornFrame(w, h);
  drawHeld(w, true);
  blit(hf.g, Math.round(h.x - (h.w >> 1)) + hf.dx, Math.round(h.y - h.h) + hf.dy,
       h.flash, h.flip, 1, 1, hf.pal);
  drawHeld(w, false);
  for (const e of w.fxs) if (e.sk.over) e.sk.over(w, e, e.p);
  // Cánh cổng boss, trước món trên sàn: nó là một khối sáng to bằng một phần bảy bề rộng khung,
  // nên một viên đồ rơi ngay trước cổng phải nằm *trên* nó mới còn đọc được.
  if (w.gate) drawGate(w);
  // Món trên sàn, sau hiệu ứng chiêu: một chiêu đang nổ không được phép chôn cái vừa rơi ra.
  if (w.orbs) for (const o of w.orbs) drawOrb(w, o);
  if (w.got > 0) drawGot(w);
  // Weather last of the world layers: snow and embers are between the camera and
  // everything else, so they pass in front of the hero -- but still under the HUD.
  if (MAPDEF.ambDraw && w.amb && w.amb.length) MAPDEF.ambDraw(ambArg(w, 0));
  // Tường phòng boss sau *mọi* lớp thế giới, kể cả thời tiết: nó là một mặt nạ, và cái nó phải che
  // gồm cả bông tuyết đang rơi ngoài phòng. Trước HUD, vì HUD không thuộc thế giới.
  if (w.room) drawRoom(w);
  if (w.flash > 0) veil(GATE_WHITE, c01(w.flash) * 0.85);
  if (w.danger > 0) drawHeroWarn(w);
  drawWeaponCue(w);
  drawHeroBars(w);
  drawMinimap(w);
  if (out) resolve(out);
}

// The hero's own two bars, top-left, in the pixel buffer rather than in the DOM: the numbers
// they carry change every frame, and a DOM readout that far from the sprite is a thing the
// player looks *away* to read. Top-left is what is free -- the minimap owns bottom-right, and
// top-right on a phone (see `setMinimapTop`).
//
// Two separately framed capsules rather than one painted panel: the row between them and the
// four clipped corners of each frame are never written, so the world shows through around the
// bars and each one keeps its own silhouette. The capsule *interiors* are still opaque, for the
// reason the minimap is: the buffer underneath is additive HDR, so a brazier standing behind a
// see-through trough would wash the bars out exactly when a fight is worth reading them during.
// Both bars carry their number, centred in the track. Mana used to go without one, on the
// grounds that a bar you can see the end of is all the warning a cost needs -- but a caster
// deciding between two skills is comparing its number against their costs, and reading that
// off a bar length is doing arithmetic on a picture. They share a 3x4 digit set of their own
// (`HUD_DIG`) rather than the 3x5 damage font, so neither number crowds the bar it sits on.
//
// Every colour here goes through asOutput() rather than hexc(): these are UI, not light, so what
// is authored is what has to land on the screen, and hexc() would hand the tonemap a finished
// colour to darken again. They are written in doubled-nibble hex on top of that, because
// resolve() quantises each channel to 16 levels (steps of 17) -- so #667788 survives the round
// trip exactly and the frame stays the shade it was drawn as instead of dithering into one.
const HUD_BAR_W = 60;
// Frame: dark steel, lit from the top-left. A keyline outside so the capsule holds its edge
// against any floor, one bevel ring inside it (highlight along the top and left, shadow along
// the bottom and right, a mid tone on the two corners where those meet), and a two-pixel glint
// where that light would actually catch.
const FR_INK = asOutput('#000011'), FR_HI = asOutput('#667788'),
      FR_MID = asOutput('#334455'), FR_LO = asOutput('#112233'),
      FR_GLINT = asOutput('#aabbcc');
// Troughs are darker than the bevel's own shadow, which is what makes the empty part of a bar
// read as a recess rather than as more frame. Each is tinted toward its own bar so a drained bar
// still says which bar it is; `_D` is the inner shadow the recess casts along its top edge.
const TR_HP = asOutput('#221111'), TR_HP_D = asOutput('#110000'),
      TR_MP = asOutput('#111133'), TR_MP_D = asOutput('#000022');
const HUD_INK = asOutput('#000000'), HUD_LIT = asOutput('#ffffff');
// The wash used for the two partial-alpha highlights. It is *not* HUD_LIT: asOutput('#ffffff')
// is buffer 4.08, which is what a glyph needs to resolve to pure white and roughly thirty times
// what a 12% wash over a red fill should be adding -- blending toward it turned the low-HP
// pulse pink. Buffer 1.0 is a lift, not a repaint.
const HUD_WASH = [1, 1, 1];
// Three stops per bar, interpolated across the track. Per row of fill: the top row is the gloss
// the light leaves on the lip, the row under it carries that away, and the bottom rows are the
// shadow the bevel drops inside the trough -- which is what gives a 4px-tall bar any roundness.
const HP_STOPS = ['#991122', '#dd4411', '#ffbb33'];
const MP_STOPS = ['#2244aa', '#3388dd', '#66ddff'];
// Mana is a row shorter than HP: both have to be tall enough to hold a centred 3x4 digit with
// its keyline (six rows), and past that the thicker bar is the one worth glancing at first.
const HP_LIT = [0.50, 0.22, 0.06, 0, -0.09, -0.20, -0.34];
const MP_LIT = [0.48, 0.18, 0.04, -0.06, -0.18, -0.30];
// One baked colour per (row, column) of a fill, mixed in display space and only then pushed
// through asOutput() -- mixing the *buffer* values instead bends the gradient, because that
// inverse is not linear. Baked at load: the bars redraw every frame and must not allocate.
function bakeFill(stops, lit, wid) {
  const cs = stops.map(hexc);
  return lit.map(k => {
    const row = [];
    for (let x = 0; x < wid; x++) {
      const f = x / (wid - 1) * (cs.length - 1);
      const i = Math.min(cs.length - 2, Math.floor(f)), t = f - i;
      const c = cs[i].map((v, j) => v + (cs[i + 1][j] - v) * t);
      row.push(asOutput(k >= 0 ? c.map(v => v + (1 - v) * k) : c.map(v => v * (1 + k))));
    }
    return row;
  });
}
const HP_FILL = bakeFill(HP_STOPS, HP_LIT, HUD_BAR_W);
const MP_FILL = bakeFill(MP_STOPS, MP_LIT, HUD_BAR_W);
// A capsule is its fill plus a keyline and a bevel ring on each side.
const HP_CAP_H = HP_LIT.length + 4, MP_CAP_H = MP_LIT.length + 4;
// The whole painted rectangle, exported next to `MM` and for the same reason: a harness that
// checks what is on the screen edge has to be able to exclude it by asking rather than by
// carrying a second copy of these numbers. HP capsule on rows 2..12, mana on 14..23, and the
// DOM HUD underneath is placed off this box (see #hud in index.html) -- growing it moves that.
const HUD_BOX = { x: 2, y: 2, w: HUD_BAR_W + 4, h: HP_CAP_H + 1 + MP_CAP_H };
// x,y,wid,hgt are the *outer* rectangle: keyline, bevel ring, then trough.
function hudFrame(x, y, wid, hgt, tr, trd) {
  const x1 = x + wid - 1, y1 = y + hgt - 1;
  // The four corners are left unwritten -- a clipped corner is how pixel art says "rounded",
  // and it lets the floor round the capsule off instead of a black notch doing it.
  for (let xx = x + 1; xx < x1; xx++) { setPixS(xx, y, FR_INK, 1); setPixS(xx, y1, FR_INK, 1); }
  for (let yy = y + 1; yy < y1; yy++) { setPixS(x, yy, FR_INK, 1); setPixS(x1, yy, FR_INK, 1); }
  // Shadow side first, lit side over it, so the only pixels left to patch are the two corners
  // where a highlight meets a shadow and neither answer is the right one.
  for (let xx = x + 1; xx < x1; xx++) setPixS(xx, y1 - 1, FR_LO, 1);
  for (let yy = y + 1; yy < y1; yy++) setPixS(x1 - 1, yy, FR_LO, 1);
  for (let xx = x + 1; xx < x1 - 1; xx++) setPixS(xx, y + 1, FR_HI, 1);
  for (let yy = y + 1; yy < y1 - 1; yy++) setPixS(x + 1, yy, FR_HI, 1);
  setPixS(x1 - 1, y + 1, FR_MID, 1); setPixS(x + 1, y1 - 1, FR_MID, 1);
  setPixS(x + 1, y + 1, FR_GLINT, 1); setPixS(x + 2, y + 1, FR_GLINT, 1);
  for (let yy = y + 2; yy <= y1 - 2; yy++)
    for (let xx = x + 2; xx <= x1 - 2; xx++) setPixS(xx, yy, yy === y + 2 ? trd : tr, 1);
}
// The gradient belongs to the track, not to the filled part: what is left of a bar is always the
// shades it was drawn with, so a nearly-empty HP bar is deep red on its own and nothing has to
// switch colour to make that true.
function hudFill(x, y, k, ramp) {
  const n = Math.round(c01(k) * HUD_BAR_W);
  for (let yy = 0; yy < ramp.length; yy++) {
    const row = ramp[yy];
    for (let xx = 0; xx < n; xx++) setPixS(x + xx, y + yy, row[xx], 1);
  }
  // The column the value ends on is the one the eye tracks, so it gets a highlight of its own.
  if (n > 0 && n < HUD_BAR_W)
    for (let yy = 0; yy < ramp.length; yy++) setPixS(x + n - 1, y + yy, HUD_WASH, 0.28);
  return n;
}
// A 3x4 digit set of the HUD's own. The 3x5 damage font is a row taller, and five rows plus the
// keyline around them filled a seven-row bar edge to edge -- the number stopped being a label on
// the bar and became the bar. Four rows leaves the gradient visible past it, and the same shapes
// as GLYPHS wherever a row could be dropped without making two digits agree.
const HUD_DIG_H = 4;
const HUD_DIG = {
  '0': ["###", "#.#", "#.#", "###"], '1': [".#.", "##.", ".#.", "###"],
  '2': ["###", ".##", "#..", "###"], '3': ["###", ".##", "..#", "###"],
  '4': ["#.#", "###", "..#", "..#"], '5': ["###", "#..", "..#", "###"],
  '6': ["###", "#..", "###", "###"], '7': ["###", "..#", ".#.", ".#."],
  '8': ["###", "#.#", "###", "###"], '9': ["###", "#.#", "###", "..#"],
};
// Digits with a black keyline on all eight sides: text3x5's single drop shadow is enough over a
// dark floor, but white strokes on bright orange dissolve unless something closed runs around
// them. Two passes rather than one, so no glyph's keyline can land on the next glyph's white.
//
// `x0, fy` is the fill's own origin and the number centres itself in it -- both numbers then sit
// on the same axis and read as a pair rather than as two labels that happen to be near each
// other, and neither one moves as its digit count changes. Screen space, so no CAMX/CAMY.
const OUT8 = [-1, -1, 0, -1, 1, -1, -1, 0, 1, 0, -1, 1, 0, 1, 1, 1];
function hudNum(s, x0, fy, rows) {
  // The 3x4 glyphs advance by 4 like the 3x5 ones (3 wide, 1 of spacing), so textW still fits.
  const x = x0 + ((HUD_BAR_W - textW(s)) >> 1), y = fy + ((rows - HUD_DIG_H) >> 1);
  for (let pass = 0; pass < 2; pass++) {
    let cx = x;
    for (const ch of s) {
      const g = HUD_DIG[ch];
      if (g) for (let row = 0; row < HUD_DIG_H; row++) for (let cc = 0; cc < 3; cc++) {
        if (g[row][cc] !== '#') continue;
        if (pass) setPixS(cx + cc, y + row, HUD_LIT, 1);
        else for (let i = 0; i < 16; i += 2)
          setPixS(cx + cc + OUT8[i], y + row + OUT8[i + 1], HUD_INK, 1);
      }
      cx += 4;
    }
  }
}
function drawHeroBars(w) {
  const h = w.hero, b = HUD_BOX;
  const x0 = b.x + 2, hy = b.y + 2, my = b.y + HP_CAP_H + 3;
  hudFrame(b.x, b.y, b.w, HP_CAP_H, TR_HP, TR_HP_D);
  hudFrame(b.x, b.y + HP_CAP_H + 1, b.w, MP_CAP_H, TR_MP, TR_MP_D);
  const n = hudFill(x0, hy, h.hp / h.maxhp, HP_FILL);
  hudFill(x0, my, h.mp / Math.max(h.maxmp, 1), MP_FILL);
  // Low HP still has to shout, and a pulse is what is left to do it with: the old colour switch
  // has nothing to say now that the gradient's own low end is already that red.
  if (h.hp <= h.maxhp * 0.35 && n > 0) {
    const a = 0.13 + 0.13 * Math.sin(w.t * 9);   // never negative: setPixS drops a <= 0, and a
                                                 // pulse that skips frames reads as a glitch
    for (let yy = 0; yy < HP_LIT.length; yy++)
      for (let xx = 0; xx < n; xx++) setPixS(x0 + xx, hy + yy, HUD_WASH, a);
  }
  hudNum(String(Math.max(0, Math.round(h.hp))), x0, hy, HP_LIT.length);
  hudNum(String(Math.max(0, Math.round(h.mp))), x0, my, MP_LIT.length);
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
  // Trong phòng boss thì minimap vẽ **cái phòng**, không vẽ cả thế giới: giữ tỷ lệ cũ thì cả trận
  // đấu gói vào một hình chữ nhật 16x10 điểm ảnh ở giữa bảng, và người chơi với con boss cách nhau
  // hai điểm ảnh. `ox`/`oy` là gốc toạ độ, `sx`/`sy` là tỷ lệ -- đổi cả hai cùng lúc là đủ, vì mọi
  // điểm trên bảng đều đi qua đúng phép biến đổi này.
  const rm = w.room;
  const ox = rm ? rm.x0 : 0, oy = rm ? rm.y0 : 0;
  const sx = MM_W / (rm ? ROOM_W : WW), sy = MM_H / (rm ? ROOM_H : WH);
  const px = v => x0 + clamp(Math.round((v - ox) * sx), 0, MM_W - 1);
  const py = v => y0 + clamp(Math.round((v - oy) * sy), 0, MM_H - 1);
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
  // Mốc của cả thế giới chỉ có nghĩa khi đang xem cả thế giới. Trong phòng thì mọi mốc đều nằm
  // ngoài khung và sẽ bị kẹp về bốn mép -- bốn cái điểm sai chỗ tệ hơn không có điểm nào.
  if (!rm) for (const p of LANDMARKS) setPixS(px(p.x), py(p.y), MM_LM, 0.75);
  // Khung nhìn, kẹp vào trong bảng: trong phòng camera được ra ngoài tường ROOM_PAD điểm ảnh, nên
  // nếu không kẹp thì cái khung này vẽ tràn ra ngoài viền minimap.
  const vx = clamp(Math.round((CAMX - ox) * sx), 0, MM_W - 1);
  const vy = clamp(Math.round((CAMY - oy) * sy), 0, MM_H - 1);
  const vw = clamp(Math.round((CAMX + W - ox) * sx), 0, MM_W - 1) - vx;
  const vh = clamp(Math.round((CAMY + H - oy) * sy), 0, MM_H - 1) - vy;
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
    const fx = px(f.x), fy = py(f.y);
    setPixS(fx, fy, warn ? MM_WARN : MM_FOE, 0.95);
    if (warn) {
      setPixS(fx + 1, fy, MM_WARN, 0.45); setPixS(fx - 1, fy, MM_WARN, 0.45);
      setPixS(fx, fy + 1, MM_WARN, 0.45); setPixS(fx, fy - 1, MM_WARN, 0.45);
    }
  }
  for (const e of w.tels) {
    if (e.fired) continue;
    setPixS(px(e.x), py(e.y), MM_WARN, 0.8);
  }
  // Món trên sàn, một điểm màu phẩm chất, nhấp nháy. Nó ở đây vì lý do rất cụ thể: món chỉ tự
  // bay vào túi trong bán kính 34px, nên một món rơi lúc đang chạy -- hoặc rơi lúc túi đầy -- là
  // một món *bị bỏ lại*, và không có cái điểm này thì cách duy nhất tìm lại nó là đi rà cả sân.
  // Nhấp nháy chứ không sáng đều: nó là thứ tạm, không phải một cái mốc như LANDMARKS.
  if (w.orbs && w.orbs.length) {
    const bl = 0.55 + 0.45 * Math.sin(w.t * 6);
    for (const o of w.orbs) {
      const C = ORB_C[o.rar] || ORB_C.common;
      setPixS(px(o.x), py(o.y), C.h, bl);
    }
  }
  // Cánh cổng, một điểm nhấp nháy chậm hơn món trên sàn và bằng màu của chính nó. Nó là thứ *duy
  // nhất* nói cho người chơi biết cổng vừa mở ở đâu khi họ đã chạy khỏi chỗ đó: một cánh cổng đứng
  // ngoài khung nhìn thì không có gì trên màn hình chỉ về phía nó cả.
  if (w.gate) {
    const g = w.gate, C = GATE_HOT[g.kind === 'out' ? 'out' : 'in'];
    const bl = 0.6 + 0.4 * Math.sin(w.t * 3.4);
    const gx = px(g.ex), gy = py(g.ey);
    setPixS(gx, gy, C, bl);
    setPixS(gx + 1, gy, C, bl * 0.5); setPixS(gx - 1, gy, C, bl * 0.5);
    setPixS(gx, gy + 1, C, bl * 0.5); setPixS(gx, gy - 1, C, bl * 0.5);
  }
  const hx = px(w.hero.x);
  const hy = py(w.hero.y);
  setPixS(hx, hy, MM_HERO, 1); setPixS(hx + 1, hy, MM_HERO, 0.5);
  setPixS(hx - 1, hy, MM_HERO, 0.5); setPixS(hx, hy - 1, MM_HERO, 0.5);
  setPixS(hx, hy + 1, MM_HERO, 0.5);
}
