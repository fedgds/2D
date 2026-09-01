"use strict";
// ===========================================================================
// 10. Cánh cổng boss và phòng boss.
// ===========================================================================
// Đủ mốc kill thì một cánh cổng mở ra cạnh người chơi. Đứng vào miệng cổng nửa giây thì vào phòng
// boss; đánh xong boss thì một cánh cổng thứ hai mở ra để về sân cũ.
//
// "Vẫn là map này nhưng thu nhỏ lại" được làm bằng cách thu **hai cái hình chữ nhật**, không phải
// bằng cách đổi cỡ thế giới:
//
//   * `BOUND` (js/world.js) -- hơn ba mươi chỗ kẹp vị trí đọc nó: bước đi, dash, cú lao của vũ khí,
//     chùm tia, mọi skill, cú hút của boss, cả chỗ món rơi xuống. Thu nó lại là *một* phép gán, và
//     tất cả những chỗ đó thu theo, không phải sửa chỗ nào.
//   * `CAMB` (js/core.js) -- mọi chỗ kẹp camera đi qua `camClampX`/`camClampY`, nên thu nó lại là
//     đủ để khung nhìn không bao giờ trôi ra ngoài phòng.
//
// Còn `WW`/`WH` thì là `const`, và cái sàn đã bake sẵn `WW*WH` ô tone trong `TID`: đổi cỡ thế giới
// nghĩa là bake lại 3,6 triệu ô mỗi lần ra vào cổng. Thu khung thì đúng nghĩa hơn *và* rẻ hơn --
// sàn trong phòng là đúng miếng sàn người chơi vừa đứng, cùng props, cùng thời tiết, cùng ánh sáng.
// Đúng cái map ấy, nhỏ lại.
//
// Chỗ ngoài phòng không bị xoá; nó bị **che** lúc vẽ (`drawRoom`). Không phải để tiết kiệm: ghi
// tone tường vào `TID` nghĩa là phải nhớ rồi hoàn nguyên hơn hai chục nghìn ô, và mọi lỗi trong
// đoạn hoàn nguyên đó là một vết tường vĩnh viễn giữa map. Che lúc vẽ thì không thể để lại vết.

// Cỡ thật của art, suy ra từ lưới đã bake. `mx`/`my` là tâm miệng cổng và nó **không** ở giữa hình:
// vòng lửa này lệch phải một pixel và thấp hơn giữa hình, nên chỗ người chơi phải đứng vào lấy từ
// đây chứ không lấy từ tâm khung.
const GATE_W = GATE_ART.cw / GATE_ART.scale;
const GATE_H = GATE_ART.ch / GATE_ART.scale;
const GATE_GAIN = 0.58;      // art gốc đủ sáng để trắng cả khung 320x180 nếu cộng nguyên
const GATE_OPEN = 0.72;      // giây để cổng nở ra hết; trong lúc đó chưa cho vào
const GATE_HOLD = 0.5;       // giây phải đứng trong miệng
// Bàn chân phải nằm trong hình ê-líp này. Hai số này **đi theo cỡ art**: miệng cổng trong lưới rộng
// khoảng 11,6 px thế giới, và ê-líp đứng phải rộng hơn cái lỗ một chút -- nó là sai số cho đôi chân,
// không phải một phép thử hình học. Trục y nén xuống hơn nửa vì thế giới nhìn 3/4: một vòng tròn
// thật trên sàn đọc ra là một hình bẹt.
const GATE_RX = 15, GATE_RY = 8;
const GATE_DIST = 104;       // cổng mở cách người chơi bấy nhiêu: thấy được mà không đè lên

// Phòng boss. Phải **rộng hơn khung nhìn** ở cả hai chiều, nếu không thì hai đầu kẹp camera đảo
// nhau. `W` lên tới 480 trên điện thoại (xem `FRAME_W`), nên 640 là mức thấp nhất còn dư.
const ROOM_W = 640, ROOM_H = 420;
// Camera được nhìn quá tường bấy nhiêu, và đó là lý do phòng *có tường để nhìn*: kẹp camera đúng
// vào mép phòng thì mép phòng luôn nằm ngoài khung, người chơi chỉ thấy mình dừng lại mà không
// thấy vì sao. 640+2*24 = 688 vẫn lớn hơn 480, nên kẹp không đảo.
const ROOM_PAD = 24;

const GATE_CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const GATE_WHITE = hexc('#e8f0ff');

// Đổi màu một bảng màu đã premultiply mà **không** làm mất lõi trắng. Nhân thẳng cả bảng với một
// màu thì hỏng: art này gần như không có kênh đỏ, nên nhân kiểu gì cũng không ra hổ phách được.
// Cách ở đây tách mỗi màu thành "sáng bao nhiêu" (`mx`, kênh lớn nhất) và "nhạt bao nhiêu"
// (`wh = min/max`), rồi chỉ nhuộm phần *đậm màu*. Sợi lửa trắng nóng có min≈max nên nó ở lại trắng,
// còn cả vòng lam thì đổi hẳn sang màu mới. Độ sáng giữ nguyên, nên cổng ra không tự dưng chói hơn.
function tintPal(pal, tint) {
  const out = {};
  for (let i = 0; i < pal.length; i++) {
    const c = hexc(pal[i]);
    const mx = Math.max(c[0], c[1], c[2]), mn = Math.min(c[0], c[1], c[2]);
    const wh = mx > 1e-4 ? mn / mx : 1;
    out[GATE_CH[i]] = [(tint[0] * (1 - wh) + wh) * mx,
                       (tint[1] * (1 - wh) + wh) * mx,
                       (tint[2] * (1 - wh) + wh) * mx];
  }
  return out;
}
// Hai cánh cổng, hai màu, và đó là toàn bộ phần giao diện của cơ chế này: lam lạnh là "đi vào chỗ
// nguy hiểm", hổ phách ấm là "về nhà". Không có chữ nào -- bảng ký tự trong js/sprites.js chỉ có
// chữ số với N và É, nên một cái nhãn là bất khả -- và cũng không cần: hai màu ngược nhau ở cùng
// một hình dáng nói đủ câu đó.
const GATE_PAL = {
  in: tintPal(GATE_ART.pal, [0.34, 0.56, 1.00]),
  out: tintPal(GATE_ART.pal, [1.00, 0.64, 0.20]),
};
const GATE_COL = { in: hexc('#3b7ddd'), out: hexc('#e8871e') };
const GATE_HOT = { in: hexc('#cfe0ff'), out: hexc('#ffe6b4') };

// ---- hai cái hình chữ nhật ---------------------------------------------------------------------
// Đồng bộ `BOUND` và `CAMB` theo trạng thái phòng của *world này*. Gọi ở đầu mỗi tick, không phải
// chỉ lúc ra vào cổng: hai bảng ấy là toàn cục, còn `w.room` là của từng trận, nên hai world sống
// cùng lúc (các harness trong tools/ tạo cả chục) sẽ kế thừa cái sân hẹp của nhau nếu chỉ gán một
// lần. Một phép gán mỗi tick rẻ hơn nhiều so với một lớp gián tiếp ở ba mươi chỗ đọc `BOUND`.
function roomApply(w) {
  const r = w && w.room;
  if (r) {
    BOUND.x0 = r.x0; BOUND.x1 = r.x1; BOUND.y0 = r.y0; BOUND.y1 = r.y1;
    CAMB.x0 = r.x0 - ROOM_PAD; CAMB.x1 = r.x1 + ROOM_PAD - W;
    CAMB.y0 = r.y0 - ROOM_PAD; CAMB.y1 = r.y1 + ROOM_PAD - H;
    // Phòng hẹp hơn khung nhìn thì hai đầu kẹp đảo nhau và camera nhảy loạn. Không xảy ra với
    // ROOM_W/ROOM_H hiện tại, nhưng ai đó sẽ sửa hai hằng đó, và lúc ấy thà camera đứng giữa.
    if (CAMB.x1 < CAMB.x0) CAMB.x0 = CAMB.x1 = (CAMB.x0 + CAMB.x1) * 0.5;
    if (CAMB.y1 < CAMB.y0) CAMB.y0 = CAMB.y1 = (CAMB.y0 + CAMB.y1) * 0.5;
  } else {
    BOUND.x0 = BOUND0.x0; BOUND.x1 = BOUND0.x1;
    BOUND.y0 = BOUND0.y0; BOUND.y1 = BOUND0.y1;
    CAMB.x0 = 0; CAMB.y0 = 0; CAMB.x1 = WW - W; CAMB.y1 = WH - H;
  }
}

// ---- mở cổng -----------------------------------------------------------------------------------
// `ex`/`ey` tính một lần ở đây: chỗ đứng để vào là *chân miệng cổng*, tức là tâm cái lỗ trong art
// chiếu xuống sàn, không phải giữa hình. Tính sẵn nên `stepGate` chỉ còn một phép so ê-líp.
function openGate(w, kind, x, y) {
  const gx = clamp(x, BOUND.x0 + GATE_W * 0.5, BOUND.x1 - GATE_W * 0.5);
  const gy = clamp(y, BOUND.y0 + GATE_H * 0.4, BOUND.y1 - 6);
  w.gate = {
    kind: kind, x: gx, y: gy, t: 0, hold: 0,
    ex: gx - GATE_W * 0.5 + GATE_ART.mx, ey: gy - 3,
    my: gy - GATE_H + GATE_ART.my,
    seed: w.rng.int(0, 0x7fffffff) >>> 0,
  };
  w.shake = Math.max(w.shake, 3.6);
  SFX.portal('open', clamp((gx - w.cam.x - W * 0.5) / (W * 0.5), -1, 1));
  return w.gate;
}

// Cổng vào mở cạnh người chơi, ở một góc bất kỳ trên vòng bán kính GATE_DIST. Trên `w.rng` (dòng
// của sim) nên hai trận cùng seed mở cổng ở cùng chỗ. Bán kính nhỏ hơn nửa bề rộng khung, nên cổng
// luôn nằm trong tầm mắt lúc nó mở -- một cánh cổng mở ngoài khung là một cánh cổng không ai thấy.
function openBossGate(w) {
  const h = w.hero, a = w.rng.range(0, TAU);
  return openGate(w, 'in', h.x + Math.cos(a) * GATE_DIST, h.y + Math.sin(a) * GATE_DIST * 0.62);
}

// ---- bước cổng ---------------------------------------------------------------------------------
// Vào cổng bằng cách **đứng vào rồi đứng yên nửa giây**, không phải bằng một nút. Hai lý do, và cả
// hai đều nặng hơn cái tiện của một phím: bàn phím đã hết phím rảnh (h i m space f t r c b x l g
// đều có chủ, xem js/shell.js), và bản cảm ứng không có nút tương tác nào cả. Đứng-để-vào thì cùng
// một cử chỉ chạy được trên cả hai, và nó còn tự chống cái tình huống tệ nhất của cơ chế này: lỡ
// chạy qua miệng cổng lúc đang tránh đòn mà bị hút vào phòng boss.
//
// Đồng hồ chạy ngược nhanh gấp đôi lúc bước ra (`dt * 2.2`), nên nhấp nhô một bước không mất hết
// tiến độ nhưng bỏ đi hẳn thì mất -- và cái vành tiến độ trong `drawGate` vẽ đúng con số này.
function stepGate(w, dt) {
  roomApply(w);
  if (w.flash > 0) w.flash = Math.max(0, w.flash - dt * 2.4);
  const g = w.gate;
  if (!g) return;
  g.t += dt;
  const h = w.hero;
  const dx = (h.x - g.ex) / GATE_RX, dy = (h.y - g.ey) / GATE_RY;
  if (g.t > GATE_OPEN && dx * dx + dy * dy <= 1) {
    g.hold += dt;
    if (g.hold >= GATE_HOLD) { if (g.kind === 'in') enterRoom(w); else exitRoom(w); return; }
  } else g.hold = Math.max(0, g.hold - dt * 2.2);
}

// Đồ còn nằm trên sàn lúc đổi sàn thì mất, vì phòng boss là một khoanh khác của map và món sẽ nằm
// ngoài tường. Nên quét hết vào túi trước khi đi. Túi đầy thì dừng và để lại -- y hệt `stepOrb`,
// và vì đúng cái lý do ấy: đường còn lại là lặng lẽ xoá một món Huyền Thoại của người chơi.
// `SFX.gate('pick', 55)` gộp cả loạt thành một tiếng, nên quét mười món không thành mười tiếng.
function sweepOrbs(w) {
  let n = 0;
  for (let i = w.orbs.length - 1; i >= 0; i--) {
    if (w.bag.length >= BAG_MAX) break;
    takeOrb(w, w.orbs[i], i); n++;
  }
  return n;
}

// ---- vào phòng, ra phòng -----------------------------------------------------------------------
// Phòng đặt quanh đúng chỗ người chơi đang đứng, kẹp vào trong sân gốc. Nên nó *là* miếng map ấy:
// cùng sàn, cùng cột đá, cùng thời tiết. Người chơi đi vào cổng ở giữa rừng thì đấu boss trong rừng.
//
// Nhân vật rơi xuống nửa dưới phòng, không rơi vào giữa: `spawnBoss` đặt boss cách nhân vật khoảng
// một phần ba khung, và nếu nhân vật đứng giữa thì một nửa số lần boss xuất hiện ngay sau lưng.
// Đứng dưới thì boss gần như luôn ở phía trên, tức là ở trong tầm mắt lúc trận bắt đầu.
function enterRoom(w) {
  const h = w.hero;
  sweepOrbs(w);
  w.ret = { x: h.x, y: h.y };
  // Làm tròn tâm phòng: `h.x`/`h.y` là số thực, và cả `BOUND`, `CAMB`, tường phòng lẫn hai đầu kẹp
  // camera đều mọc ra từ đúng hai con số này (ROOM_W/ROOM_H chia đôi vẫn nguyên). Phòng nằm trên
  // lưới điểm ảnh thì mép tường và cạnh kẹp camera cũng nằm trên lưới -- xem chú thích ở `setCam`
  // trong js/scene.js về cái giá của một cạnh lẻ.
  const cx = Math.round(clamp(h.x, BOUND0.x0 + ROOM_W * 0.5, BOUND0.x1 - ROOM_W * 0.5));
  const cy = Math.round(clamp(h.y, BOUND0.y0 + ROOM_H * 0.5, BOUND0.y1 - ROOM_H * 0.5));
  w.room = { cx: cx, cy: cy, x0: cx - ROOM_W * 0.5, x1: cx + ROOM_W * 0.5,
             y0: cy - ROOM_H * 0.5, y1: cy + ROOM_H * 0.5 };
  roomApply(w);
  // Sân dọn sạch: quái đang đuổi theo ở ngoài sẽ nằm ngoài tường, và một vòng cảnh báo còn sót của
  // một con quái không còn tồn tại là một cái bẫy không có ai đặt.
  w.foes.length = 0; w.tels.length = 0; w.boss = null;
  h.x = cx; h.y = cy + ROOM_H * 0.3;
  h.vx = 0; h.vy = 0; h.dsh = 0; h.dvx = 0; h.dvy = 0;
  w.gate = null; w.spawnT = 1e9;
  snapCam(w); setCam(w.cam.x, w.cam.y);
  w.flash = 1; w.shake = Math.max(w.shake, 6.5);
  spawnBoss(w);
  SFX.portal('in', 0);
  return w.room;
}

// Về sân cũ, đúng chỗ đã đứng lúc bước vào. Trả về chỗ khác thì người chơi mất phương hướng trên
// một cái map rộng 8x8 khung -- và cái minimap vừa đổi tỷ lệ hai lần trong ba giây.
function exitRoom(w) {
  sweepOrbs(w);
  const h = w.hero, r = w.ret;
  w.room = null; w.ret = null;
  roomApply(w);
  w.foes.length = 0; w.tels.length = 0; w.boss = null;
  if (r) { h.x = clamp(r.x, BOUND.x0, BOUND.x1); h.y = clamp(r.y, BOUND.y0, BOUND.y1); }
  h.vx = 0; h.vy = 0; h.dsh = 0; h.dvx = 0; h.dvy = 0;
  w.gate = null;
  snapCam(w); setCam(w.cam.x, w.cam.y);
  w.flash = 1; w.shake = Math.max(w.shake, 4.6);
  // Sân cũ phải có người ở: về một cái map trống rỗng thì cảm giác là trận đấu đã xoá mất sân chơi.
  // Một giây rưỡi trước con tiếp theo, đủ để nhặt nốt và nhìn quanh.
  w.spawnT = 1.5;
  for (let i = 0; i < 5; i++) spawnFoe(w, true);
  SFX.portal('out', 0);
}

// ---- vẽ cổng -----------------------------------------------------------------------------------
// Art đi qua `blitLight`, tức là **cộng** vào buffer HDR chứ không vẽ chồng lên. Đó là quyết định
// gốc của cả file: cái ảnh này là một vòng lửa lạnh, không phải một tấm bìa. Nhờ vậy viền mờ của
// art tự thành quầng sáng, và cái lỗ giữa vòng cộng 0 -- tức là *sàn hiện qua miệng cổng*, đúng như
// một cái miệng phải hiện. Không có tầng glow nào vẽ tay, không có ngưỡng alpha nào để lại răng cưa.
//
// Cổng nở ra bằng cách sáng dần (`op` nhân vào gain) cộng một vành sáng bung ra: art là một lưới
// cố định, không co giãn được, nên cái *bung ra* phải là một hình vẽ bằng primitive.
function drawGate(w) {
  const g = w.gate;
  if (!g) return;
  const K = g.kind === 'out' ? 'out' : 'in';
  const C = GATE_COL[K], HT = GATE_HOT[K];
  const op = c01(g.t / GATE_OPEN);
  const br = 0.86 + 0.14 * Math.sin(w.t * 2.5 + (g.seed & 31) * 0.2);
  const hd = g.hold / GATE_HOLD;

  // Vũng sáng dưới chân cổng: cái duy nhất nói cho người chơi biết *đứng vào đâu*. Nó ăn theo `hd`
  // nên bước vào là nó sáng lên ngay -- phản hồi trước khi đồng hồ nửa giây kịp chạy hết. Bán kính
  // phủ trọn ê-líp GATE_RX/GATE_RY: cái vũng *là* hình vẽ của vùng đứng, nên nó nhỏ hơn vùng đó là
  // người chơi đứng đúng chỗ mà không thấy mình đã đứng đúng.
  puddle(g.ex, g.ey + 1, (17 + hd * 7) * op, (6.2 + hd * 2.7) * op, C, (0.15 + 0.1 * hd) * op,
         g.seed, 6, 1.3);

  blitLight(GATE_ART.g, g.x - GATE_W * 0.5, g.y - GATE_H, GATE_ART.scale, GATE_PAL[K],
            GATE_GAIN * op * br * (1 + hd * 0.45));

  // Xoáy trong miệng: ba cung quay khác tốc, khác chiều. Miệng cổng không được phép là một cái lỗ
  // tối đứng im -- đứng im thì nó đọc ra là một vết sơn, còn quay thì nó là một chỗ để đi qua. Ba
  // bán kính bò từ giữa lỗ ra tới quá mép nó một chút, nên cái xoáy đọc ra là *cái lỗ đang quay*
  // chứ không phải một vòng tròn nằm trong lỗ.
  for (let i = 0; i < 3; i++) {
    const sp = (i & 1) ? -1 : 1, r = 6.5 + i * 4.5;
    arc(g.ex, g.my, r, w.t * (1.5 + i * 0.5) * sp, 1.5 + i * 0.4, 1.2, i === 0 ? HT : C,
        (0.3 - i * 0.06) * op, 0.86, 1.4, 3);
  }
  // Hạt bay lên khỏi miệng, hạt mới mỗi khung (đổi seed theo `frame`): cổng đang thở ra.
  sparks(g.ex, g.my, 7, 3, 15.5, HT, 0.26 * op, (g.seed ^ (w.frame * 2654435761)) >>> 0,
         1, 0.8, -Math.PI * 0.95, -Math.PI * 0.05, 2.2);

  // Cú bung lúc mở: vành sáng nở ra rồi tắt, cộng một chùm tia. Đây là thứ bắt mắt người chơi đang
  // nhìn chỗ khác, và nó phải to hơn cả cánh cổng mới làm được việc đó.
  if (g.t < 0.62) {
    const k = 1 - g.t / 0.62, e = 1 - k;
    ring(g.ex, g.my, 8.5 + e * 48, 1.4 + k * 2, HT, 0.5 * k * k, 0.9, 1.4);
    star(g.ex, g.my, HT, 6, 2, 14 + e * 31, 1.2, 0.42 * k * k, g.seed, 0.4);
    core(g.ex, g.my, 7 + e * 17, HT, 0.42 * k * k, 1.8);
  }
  // Vành tiến độ ở *chân* người chơi, không ở giữa cổng: nó trả lời câu "tôi đã đứng đủ chưa", và
  // câu ấy nói về chỗ đôi chân đang ở. Đầy vòng là đi.
  if (hd > 0) {
    const h = w.hero;
    ring(h.x, h.y, 8.5, 0.8, C, 0.22, 0.45, 1.4);
    arc(h.x, h.y, 8.5, -Math.PI * 0.5 + Math.PI * hd, TAU * hd, 1.1, HT, 0.6, 0.45, 1.3, 6);
    core(h.x, h.y - 2, 2 + hd * 5, HT, 0.16 + 0.3 * hd, 1.7);
  }
}

// ---- vẽ tường phòng ----------------------------------------------------------------------------
// Ngoài phòng thì mờ dần về tone hư không của map (slot 7, cùng cái mà `paintBorder` dùng cho viền
// thế giới), nên phòng boss trông như một khoanh sàn còn sáng giữa chỗ đã tắt -- và nó *là* thế.
//
// Đây là một mặt nạ vẽ sau cùng, không phải một phép ghi vào `TID`. Ghi tone tường vào TID nghĩa là
// phải nhớ rồi hoàn nguyên hơn hai chục nghìn ô mỗi lần ra vào, và mọi lỗi trong đoạn hoàn nguyên
// đó là một vết tường vĩnh viễn nằm giữa map. Còn mặt nạ thì hết khung là hết.
//
// Chỉ quét bốn dải thật sự nằm ngoài phòng, không quét cả khung rồi `continue`: ROOM_PAD là 24 nên
// bốn dải cộng lại chưa tới một phần tám số điểm ảnh của khung.
const ROOM_FADE = 7;     // độ dày dải chuyển tiếp, tính bằng **điểm ảnh game** (nhân RENDER_SCALE
                         // ở dưới): ghi thẳng bằng điểm ảnh render thì bề dày cái tường đổi theo
                         // độ phân giải, và hai bản dựng cùng một cảnh sẽ trông khác nhau.
function drawRoom(w) {
  const r = w.room;
  if (!r) return;
  const S = RENDER_SCALE, FD = ROOM_FADE * S;
  const x0 = Math.round((r.x0 - CAMX) * S), x1 = Math.round((r.x1 - CAMX) * S);
  const y0 = Math.round((r.y0 - CAMY) * S), y1 = Math.round((r.y1 - CAMY) * S);
  const v0 = TONE_F[21], v1 = TONE_F[22], v2 = TONE_F[23];
  const strip = (ax, ay, bx, by) => {
    const px0 = Math.max(0, ax), py0 = Math.max(0, ay);
    const px1 = Math.min(RW, bx), py1 = Math.min(RH, by);
    for (let py = py0; py < py1; py++) {
      const dy = py < y0 ? y0 - py : (py >= y1 ? py - y1 + 1 : 0);
      for (let px = px0; px < px1; px++) {
        const dx = px < x0 ? x0 - px : (px >= x1 ? px - x1 + 1 : 0);
        // Chebyshev, nên dải chuyển tiếp là một hình chữ nhật đồng đều -- kể cả ở bốn góc.
        const d = dx > dy ? dx : dy;
        const k = d >= FD ? 0 : 1 - d / FD;
        const i3 = (py * RW + px) * 3, iv = 1 - k;
        buf[i3] = buf[i3] * k + v0 * iv;
        buf[i3 + 1] = buf[i3 + 1] * k + v1 * iv;
        buf[i3 + 2] = buf[i3 + 2] * k + v2 * iv;
      }
    }
  };
  strip(0, 0, RW, y0);              // trên
  strip(0, y1, RW, RH);             // dưới
  strip(0, y0, x0, y1);             // trái
  strip(x1, y0, RW, y1);            // phải

  // Đường rào sáng trên mép phòng: cái nói "đến đây là hết". Không có nó thì nhân vật chỉ đơn giản
  // dừng lại giữa sàn, và điều đó đọc ra là kẹt chứ không phải là tường. Nhịp thở chậm, mờ, và ăn
  // theo màu của cánh cổng đã dẫn vào đây.
  const a = 0.2 + 0.07 * Math.sin(w.t * 1.7), C = GATE_COL.in;
  line(r.x0, r.y0, r.x1, r.y0, 1.2, C, a, 1.3, 0);
  line(r.x0, r.y1, r.x1, r.y1, 1.2, C, a, 1.3, 0);
  line(r.x0, r.y0, r.x0, r.y1, 1.2, C, a, 1.3, 0);
  line(r.x1, r.y0, r.x1, r.y1, 1.2, C, a, 1.3, 0);
}
