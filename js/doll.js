"use strict";
// Hình nhân vật trong bảng trạng thái -- paper doll.
//
// Cùng một sprite HERO mà trận đấu đang vẽ, cộng thêm một lớp phủ cho mỗi ô trang bị đang mặc,
// rồi in ra một <canvas> phóng to. Không có art mới: mỗi ô góp một *hình dạng* viết bằng chữ,
// đúng như js/sprites.js viết HERO, và phẩm chất chỉ đổi *màu* -- cùng cái luật mà js/gear.js
// đã dùng cho hai mươi file PNG ("the slot picks the shape, the rarity picks the tint"). Nhờ
// thế thêm một phẩm chất thứ năm không cần vẽ thêm gì, và một cái mũ Huyền Thoại nhìn ra ngay
// là Huyền Thoại vì nó cam, không vì nó có thêm cái sừng.
//
// Vì sao dựng một mảng *màu* chứ không một lưới chữ rồi tra bảng như blit: năm ô có thể mang
// năm phẩm chất khác nhau cùng lúc, nên '1' ở vai và '1' ở giày không cùng một màu. Một lưới
// chữ sẽ cần năm bộ chữ riêng; một lưới màu thì không cần gì.
//
// Bảng vẽ 13x17 chứ không 11x14: HERO đặt lệch vào (+1, +2) để có chỗ cho chóp mũ ở trên và
// hai miếng vai / hai cái găng thò ra ngoài thân. Không có chỗ đó thì mọi món trang bị đều
// phải vẽ *vào trong* người, và một bộ giáp không làm nhân vật to ra thì không đọc ra là giáp.
const DOLL_W = 13, DOLL_H = 17, DOLL_DX = 1, DOLL_DY = 2;

// Thứ tự vẽ, không phải thứ tự trong GEAR_SLOTS: giáp phủ lên quần ở hông, còn găng phủ lên
// tay áo của giáp. Vẽ ngược lại thì cái găng biến mất dưới ống tay.
const DOLL_ORDER = ['pants', 'armor', 'gloves', 'boots', 'helmet'];

// '.' để nguyên ô đang có, '0' viền đen, '1' kim loại sáng, '2' kim loại tối, '3' điểm nhấn.
// `y` là hàng đầu tiên trên bảng vẽ 13x17. Mọi hàng phải đúng 13 ký tự -- tools/check-gear.js
// kiểm điều đó, vì một hàng thiếu một ký tự lệch cả nửa bộ giáp sang trái và trông vẫn "gần đúng".
const DOLL_ART = {
  // Mũ: vòm che đỉnh, hai má chắn, chóp ở trên. Ba ô giữa hàng mắt để trống -- một cái mũ kín
  // mặt thì hình nhân vật thành một cái nồi, và người chơi mất luôn cái duy nhất là của mình.
  helmet: { y: 0, g: ['......0......',
                      '.....030.....',
                      '...0111110...',
                      '..021111120..',
                      '..021...120..',
                      '...2.....2...'] },
  // Giáp: cổ giáp hai bên hàm (hàng 6), hai miếng vai thò hẳn ra ngoài thân (hàng 7), thân giáp
  // chia sáng/tối, một dải huy hiệu giữa ngực và một cái thắt lưng sáng khép lại phía dưới.
  armor: { y: 6, g: ['...3.....3...',
                     '.0111...1110.',
                     '..011112220..',
                     '..013333220..',
                     '..011112220..',
                     '...0333330...'] },
  // Găng: ống tay và mu bàn tay, hai bên ngoài thân. Hàng cuối chừa lại cột 3 và cột 9 cho cái
  // thắt lưng của giáp -- nếu không thì găng, thắt lưng và viền dính thành một vệt sáng liền.
  gloves: { y: 9, g: ['.011.....110.',
                      '.011.....110.',
                      '.03.......30.'] },
  // Quần: hai ống, giữ lại cột đen ở giữa để hai chân vẫn là hai chân, cộng hai miếng hông.
  pants: { y: 12, g: ['..211101112..',
                      '..222202222..'] },
  // Giày: ống chân, bàn chân rộng thêm một ô mỗi bên, và một hàng đế đen dưới cùng.
  boots: { y: 14, g: ['...1110111...',
                      '..322202223..',
                      '..0000.0000..'] },
};

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
// Bốn màu của một món, lấy từ đúng hai màu mà GEAR_RARITY đã có. `col` là màu khung trong bảng
// trang bị, nên miếng giáp trên hình và cái khung quanh ảnh món đó là *cùng một màu* -- đó là
// toàn bộ cách người chơi nối "cái mới mặc" với "chỗ vừa đổi trên hình".
function dollRamp(rarId) {
  const r = RARITY_BY_ID[rarId] || GEAR_RARITY[0];
  return { '0': '#0b0b12', '1': dollMix(r.col, '#ffffff', 0.30),
           '2': dollMix(r.col, r.dim, 0.55), '3': dollMix(r.col, '#ffffff', 0.74) };
}

// Trả về DOLL_H hàng × DOLL_W ô, mỗi ô là một chuỗi màu hoặc null (trong suốt). Không chạm vào
// canvas hay buffer nào, nên tools/check-gear.js đọc được nó trực tiếp.
function dollPixels(equip) {
  const px = [];
  for (let r = 0; r < DOLL_H; r++) px.push(new Array(DOLL_W).fill(null));
  for (let r = 0; r < HERO.length; r++) {
    const ln = HERO[r];
    for (let c = 0; c < ln.length; c++) {
      const p = PAL[ln[c]];
      if (p) px[r + DOLL_DY][c + DOLL_DX] = dollHex(p);
    }
  }
  for (const sl of DOLL_ORDER) {
    const it = equip && equip[sl];
    if (!it) continue;
    const art = DOLL_ART[sl], ramp = dollRamp(it.rar);
    for (let r = 0; r < art.g.length; r++) {
      const ln = art.g[r], row = px[art.y + r];
      if (!row) continue;
      for (let c = 0; c < ln.length; c++) if (ramp[ln[c]]) row[c] = ramp[ln[c]];
    }
  }
  return px;
}

// In ra canvas. `sc` là số điểm màn hình cho một điểm ảnh -- một số nguyên, và không dùng
// drawImage, nên không có phép nội suy nào chen vào giữa: từng ô là một hình chữ nhật đặc.
function drawDoll(cv, equip, sc) {
  sc = sc || 6;
  cv.width = DOLL_W * sc; cv.height = DOLL_H * sc;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, cv.width, cv.height);
  const px = dollPixels(equip);
  for (let r = 0; r < DOLL_H; r++) for (let c = 0; c < DOLL_W; c++) {
    const col = px[r][c];
    if (!col) continue;
    g.fillStyle = col;
    g.fillRect(c * sc, r * sc, sc, sc);
  }
}
