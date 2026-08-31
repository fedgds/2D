"use strict";
// Nhân vật đang mặc trang bị -- một bộ hình, hai chỗ dùng.
//
// Cùng một sprite HERO mà trận đấu đang vẽ, cộng thêm một lớp cho mỗi ô trang bị đang mặc.
// Bảng trạng thái in nó ra một <canvas> phóng to (`drawDoll`); màn chơi lấy đúng cái lưới ký tự
// ấy, cho js/anim.js bóp thành cả bộ khung đi/đứng/đánh rồi vẽ ra buffer (`wornFrame`). Một
// nguồn hình duy nhất, nên "mặc vào rồi ra màn chơi vẫn thấy đang mặc" không phải một bản vẽ
// thứ hai đi lệch dần khỏi cái trong bảng: nó *là* cái trong bảng.
//
// Không có art mới: mỗi ô góp một *hình dạng* viết bằng chữ, đúng như js/sprites.js viết HERO,
// và phẩm chất chỉ đổi *màu* -- cùng cái luật mà js/gear.js đã dùng cho hai mươi file PNG
// ("the slot picks the shape, the rarity picks the tint"). Nhờ thế thêm một phẩm chất thứ năm
// không cần vẽ thêm gì, và một cái mũ Huyền Thoại nhìn ra ngay là Huyền Thoại vì nó cam.
//
// Vì sao lưới ký tự chứ không phải lưới màu như bản trước: một lưới màu in ra được nhưng không
// *bóp* được -- js/anim.js làm việc trên ký tự. Ký tự riêng cho từng ô là cách để năm ô mang
// năm phẩm chất khác nhau cùng lúc mà vẫn chỉ có một lưới: '1' của mũ và '1' của giày là hai ký
// tự khác nhau sau khi dán, nên chúng tra ra hai màu khác nhau trong cùng một bảng màu.
//
// Bảng vẽ 13x16 chứ không 11x14: HERO đặt lệch vào (+1, +2) để có chỗ cho chóp mũ ở trên và hai
// miếng vai / hai chiếc găng / hai chiếc giày thò ra ngoài thân. Không có chỗ đó thì mọi món
// trang bị đều phải vẽ *vào trong* người, và một bộ giáp không làm nhân vật to ra thì không đọc
// ra là giáp.
const DOLL_W = 13, DOLL_H = 16, DOLL_DX = 1, DOLL_DY = 2;

// Thứ tự dán, không phải thứ tự trong GEAR_SLOTS: giáp phủ lên quần ở hông, còn găng phủ lên
// tay áo của giáp. Dán ngược lại thì chiếc găng biến mất dưới ống tay.
const DOLL_ORDER = ['pants', 'armor', 'gloves', 'boots', 'helmet'];

// Năm bậc, không phải bốn: '0' viền, '1' tối nhất, '2' thân, '3' sáng, '4' điểm nhấn. Bốn bậc
// chỉ đủ vẽ một cái viền và một mảng đặc, nên mọi miếng giáp đọc ra là một phiến; bậc thứ năm
// là chỗ để một miếng vai có mép hắt sáng và một mũi giày có chóp bóng -- cùng lý do js/boss.js
// dùng ba bậc cho mỗi vật liệu của con boss thay vì hai.
//
// '.' để nguyên ô đang có. `y` là hàng đầu tiên trên bảng vẽ 13x16, và mỗi hàng phải đúng 13 ký
// tự -- tools/check-gear.js kiểm điều đó, vì một hàng thiếu một ký tự lệch cả nửa bộ giáp sang
// trái và trông vẫn "gần đúng".
//
// Hai lằn ranh không được bước qua, cả hai đến từ bộ khung trong js/anim.js:
//   * cột 6 là viền chung giữa hai chân -- nó không bao giờ bị bóp sang bên, nên hàng nào của
//     quần và giày cũng phải để '0' ở đó, không thì hai chân dính thành một khối khi bước.
//   * hàng 12-15 là khối chân (bóp khi bước), hàng 7-11 là khối thân (bóp khi thở). Một món
//     nằm vắt qua hai khối sẽ bị xé làm hai vào đúng khung có bóp.
const DOLL_ART = {
  // Mũ: chóp lông ở trên (hai hàng duy nhất nằm cao hơn đỉnh đầu), vòm che, một dải mày tối và
  // hai má chắn. Ba ô giữa hàng mắt để trống -- một cái mũ kín mặt thì hình nhân vật thành một
  // cái nồi, và người chơi mất luôn cái duy nhất là của mình.
  helmet: { y: 0, g: ['......4......',
                      '.....040.....',
                      '....03330....',
                      '..033333330..',
                      '..032222230..',
                      '..031...130..',
                      '...03...30...'] },
  // Giáp: hai miếng vai thò hẳn ra ngoài thân (hàng 7-8, tới cột 1 và 11 -- rộng hơn cả silhouette
  // của HERO), thân giáp chia sáng/tối theo cột để tay và ngực không thành một phiến, một viên
  // giữa ngực, phần bụng tối lại, và một cái thắt lưng sáng có khoá khép lại phía dưới.
  armor: { y: 7, g: ['.0330...0330.',
                     '.02323332320.',
                     '..023343320..',
                     '..021111120..',
                     '...0334330...'] },
  // Găng: ống tay loe ra ở hàng 9 rồi thu vào thành bàn tay, hai bên ngoài thân. Cột 4 và 8 để
  // '0' ở hàng 9 -- đó là chỗ tách chiếc găng khỏi tấm ngực, không có nó thì găng, vai và ngực
  // dính thành một vệt sáng liền.
  gloves: { y: 9, g: ['.0330...0330.',
                      '..034...430..',
                      '..032...230..'] },
  // Quần: hai miếng hông loe ra cột 2/10 (rộng hơn thắt lưng ở trên, nên đọc ra là hai tấm
  // che hông), rồi hai ống thu lại và tối dần xuống đầu gối.
  pants: { y: 12, g: ['..032202230..',
                      '...0210120...'] },
  // Giày: bàn chân rộng thêm một cột mỗi bên với chóp mũi hắt sáng, và một hàng đế tối dưới
  // cùng. Cả hai hàng đều nằm trong khối chân, nên chiếc giày bước cùng bàn chân.
  boots: { y: 14, g: ['..034202430..',
                      '..011101110..'] },
};

// Ký tự riêng của từng ô, năm cái một, theo đúng thứ tự GEAR_SLOTS. Chúng chỉ sống trong file
// này và trong bảng màu mà `wearPal` dựng ra, nên không tranh chỗ với PAL: bảng màu ấy *kế
// thừa* PAL rồi thêm hai lăm ký tự này lên trên. Chọn số và dấu vì không lưới nào trong game
// dùng chúng, và vì một lưới in ra để soi vẫn đọc được.
const WEAR_CH = ['01234', '56789', '!@#$%', '^&*()', '-+=[]'];
const WEAR_IX = {};
for (let i = 0; i < GEAR_SLOTS.length; i++) WEAR_IX[GEAR_SLOTS[i].id] = i;

function dollHex(t) {
  let s = '#';
  for (let i = 0; i < 3; i++) {
    const v = Math.max(0, Math.min(255, Math.round(t[i] * 255))).toString(16);
    s += v.length < 2 ? '0' + v : v;
  }
  return s;
}
function dollMix(a, b, k) {
  const A = hexc(a), B = hexc(b);
  return dollHex([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k]);
}
// Ô nào sáng bao nhiêu. Không phải trang trí: mặc cả bộ cùng một phẩm chất thì năm món ra đúng
// năm cái ramp giống nhau, và cả hình đọc thành *một khối* một màu -- đúng cái "nhìn xấu quá".
// Một chút lệch sáng theo chiều dọc (mũ sáng nhất, giày tối nhất) là cách rẻ nhất để mắt tách
// được đâu là mũ, đâu là thân, đâu là chân: nó chính là ánh sáng từ trên xuống, cùng lối mà
// js/sprites.js dùng 'a' cho tóc hai bên và 'c' cho tay áo.
//
// Số dương kéo về trắng, số âm kéo về đen. Chỉ ăn vào bậc 1..4 -- bậc '0' là viền, và một cái
// viền sáng dần theo món sẽ xé silhouette thành năm mảnh rời.
const DOLL_TONE = { helmet: 0.12, armor: 0, gloves: -0.07, pants: -0.15, boots: -0.24 };

// Năm màu của một món, lấy từ đúng hai màu mà GEAR_RARITY đã có. `col` là màu khung trong bảng
// trang bị, nên miếng giáp trên hình và cái khung quanh ảnh món đó là *cùng một màu* -- đó là
// toàn bộ cách người chơi nối "cái mới mặc" với "chỗ vừa đổi trên hình".
//
// `slot` là tuỳ chọn: không truyền thì ra ramp gốc của phẩm chất, tức là câu "phẩm chất nào ra
// màu nào" vẫn kiểm được một mình, không lẫn với chuyện ô nào sáng hơn ô nào.
function dollRamp(rarId, slot) {
  const r = RARITY_BY_ID[rarId] || GEAR_RARITY[0];
  const t = (slot && DOLL_TONE[slot]) || 0;
  const bias = c => t === 0 ? c : dollMix(c, t > 0 ? '#ffffff' : '#000000', Math.abs(t));
  return { '0': '#0b0b12',
           '1': bias(dollMix(r.dim, r.col, 0.30)),
           '2': bias(dollMix(r.col, r.dim, 0.42)),
           '3': bias(dollMix(r.col, '#ffffff', 0.26)),
           '4': bias(dollMix(r.col, '#ffffff', 0.70)) };
}

// Lưới ký tự 13x16: HERO dán vào (+1, +2), rồi từng món dán lên theo DOLL_ORDER, mỗi món đổi
// '0'..'4' của nó sang năm ký tự riêng. Đây là thứ duy nhất cả bảng trạng thái và màn chơi đọc.
function wearBase(equip) {
  const rs = [];
  for (let r = 0; r < DOLL_H; r++) rs.push(new Array(DOLL_W).fill('.'));
  for (let r = 0; r < HERO.length; r++) {
    const ln = HERO[r];
    for (let c = 0; c < ln.length; c++) rs[r + DOLL_DY][c + DOLL_DX] = ln[c];
  }
  for (const sl of DOLL_ORDER) {
    const it = equip && equip[sl];
    if (!it) continue;
    const art = DOLL_ART[sl], ch = WEAR_CH[WEAR_IX[sl]];
    for (let r = 0; r < art.g.length; r++) {
      const ln = art.g[r], row = rs[art.y + r];
      if (!row) continue;
      for (let c = 0; c < ln.length && c < DOLL_W; c++) {
        if (ln[c] === '.') continue;
        row[c] = ch[+ln[c]];
      }
    }
  }
  return rs.map(r => r.join(''));
}

// Bảng màu cho lưới trên. Kế thừa PAL bằng prototype chứ không sao chép: thân người vẫn tra ra
// đúng màu PAL đang có (một arena đổi tám ký tự vật liệu của nó lúc chạy), còn hai lăm ký tự
// trang bị nằm ở lớp trên. `blit` chỉ đọc `P[ch]`, nên chuỗi prototype là đủ.
function wearPal(equip) {
  const p = Object.create(PAL);
  for (const sl of DOLL_ORDER) {
    const it = equip && equip[sl];
    if (!it) continue;
    const ramp = dollRamp(it.rar, sl), ch = WEAR_CH[WEAR_IX[sl]];
    for (let k = 0; k < 5; k++) p[ch[k]] = hexc(ramp[String(k)]);
  }
  return p;
}

// Chữ ký của bộ đồ đang mặc: ô nào, phẩm chất nào. Rỗng nghĩa là *không mặc gì*, và đó là một
// trường hợp riêng thật sự -- không phải để nhanh hơn mà để nhân vật trần vẽ ra đúng từng điểm
// ảnh như trước khi có hệ trang bị. Chỉ phẩm chất vào chữ ký, không phải id món: hai cái mũ
// Hiếm khác nhau vẫn là cùng một hình.
function wearSig(equip) {
  let s = '';
  for (const sl of DOLL_ORDER) {
    const it = equip && equip[sl];
    if (it) s += sl + ':' + it.rar + ';';
  }
  return s;
}

// Cả bộ khung của nhân vật đang mặc đồ, dựng một lần cho mỗi bộ đồ. Dựng bằng đúng `heroSet`
// mà ANIM.hero dùng, chỉ khác `base` và chỗ lệch -- nên chiếc giày bước theo bàn chân và miếng
// vai thở theo lồng ngực mà không có một dòng nào ở đây biết "bước" hay "thở" là gì.
//
// Bàn tay vung lấy hai ký tự của găng (bậc sáng và viền) khi có găng, và của giáp khi chỉ có
// giáp: `heroSet` vẽ bàn tay bằng hai ký tự truyền vào, nên đây là toàn bộ cách một cú vung có
// bàn tay bọc sắt. Không có gì ở hai ô đó thì trả về undefined để `heroSet` dùng màu áo như cũ.
//
// `reach` 1: cánh tay của hai khung đánh đẩy ra thêm một cột, vì hai miếng vai đã chiếm đúng cột
// mà cú vung của nhân vật trần vươn tới. Xem `heroSet` trong js/anim.js.
let WEAR_SET = null, WEAR_SIG = '', WEAR_PAL = null;
function wearFrames(equip) {
  const sig = wearSig(equip);
  if (sig !== WEAR_SIG || !WEAR_SET) {
    const sl = equip && equip.gloves ? 'gloves' : (equip && equip.armor ? 'armor' : null);
    const ch = sl ? WEAR_CH[WEAR_IX[sl]] : null;
    WEAR_SIG = sig;
    WEAR_PAL = wearPal(equip);
    WEAR_SET = heroSet(wearBase(equip), DOLL_DX, DOLL_DY,
                       ch ? ch[3] : undefined, ch ? ch[0] : undefined, 1);
  }
  return WEAR_SET;
}

// Khung mà js/render.js vẽ ra màn chơi. Không mặc gì thì trả về đúng khung của ANIM.hero, `dx`
// bằng 0 và không có bảng màu riêng -- cùng một đường vẽ như trước. Có mặc thì lưới rộng ra hai
// cột và cao thêm hai hàng ở trên, nên phải kéo lại (-1, -2) để bàn chân vẫn đứng đúng chỗ cũ:
// hitbox của nhân vật không đổi khi mặc giáp, chỉ có hình là to ra.
function wornFrame(w, h) {
  if (!wearSig(w.equip)) { const f = heroFrame(h); return { g: f.g, dx: 0, dy: f.dy, pal: null }; }
  const f = heroPick(wearFrames(w.equip), h);
  return { g: f.g, dx: -DOLL_DX, dy: f.dy - DOLL_DY, pal: WEAR_PAL };
}

// Lưới màu để in ra <canvas> của bảng trạng thái: cùng lưới ký tự, cùng bảng màu, chỉ đổi sang
// chuỗi hex vì ở đây vẽ bằng fillRect chứ không qua buffer HDR. `null` là ô trong suốt.
function dollPixels(equip) {
  const g = wearBase(equip), pal = wearPal(equip), px = [];
  for (let r = 0; r < DOLL_H; r++) {
    const row = new Array(DOLL_W).fill(null), ln = g[r];
    for (let c = 0; c < DOLL_W; c++) {
      const ch = ln[c];
      if (ch === '.') continue;
      const t = pal[ch];
      if (t) row[c] = dollHex(t);
    }
    px.push(row);
  }
  return px;
}

// In ra canvas, một fillRect mỗi ô. `sc` là số nguyên -- một điểm ảnh của hình phải là một hình
// vuông đúng sc x sc, không thì hàng nào đó dày hơn hàng khác một điểm và cả cái hình lệch.
function drawDoll(cv, equip, sc) {
  sc = sc || 1;
  const cx = cv.getContext('2d');
  cv.width = DOLL_W * sc; cv.height = DOLL_H * sc;
  cx.imageSmoothingEnabled = false;
  cx.clearRect(0, 0, cv.width, cv.height);
  const px = dollPixels(equip);
  for (let r = 0; r < DOLL_H; r++)
    for (let c = 0; c < DOLL_W; c++) {
      const col = px[r][c];
      if (!col) continue;
      cx.fillStyle = col;
      cx.fillRect(c * sc, r * sc, sc, sc);
    }
}
