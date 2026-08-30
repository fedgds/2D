// Sinh js/boss-frames.js từ images/animations/boss/<1|2|3>/<idle|cast|hit|death>/*.png.
//
// Chạy: node tools/gen-boss-frames.js
//
// Ảnh nguồn là art ~1024x1536, mỗi con 12 khung, tổng gần 50 MB -- không thể để game nạp
// trực tiếp, và cũng không nên: cả engine vẽ vào một buffer 320x180 rồi hạ xuống 16 mức mỗi
// kênh, nên mọi thứ vượt quá cỡ đó đều bị vứt ở bước cuối. Tool này làm sẵn phần bị vứt:
//
//   1. cắt theo bbox alpha của *từng khung* -- ba con có canvas khác cỡ nhau, riêng con 3 mỗi
//      khung một tỉ lệ khác, nên toạ độ tuyệt đối trên canvas không so được giữa các khung;
//   2. thu nhỏ bằng box filter trên alpha đã premultiply (không premultiply thì viền tối
//      của art loang thành quầng đen quanh người);
//   3. cắt alpha thành nhị phân. Đây là quyết định về *hình*, không phải về dung lượng: mọi
//      sprite khác trong game vẽ qua `blit`, mỗi ô hoặc là một màu palette hoặc là '.', nên
//      một con boss có viền mờ dần sẽ là thứ duy nhất trên màn hình không thuộc cùng một
//      thứ pixel art với phần còn lại;
//   4. lượng hoá màu bằng median cut về một palette riêng cho từng con, rồi ghi ra đúng
//      dạng lưới ký tự mà sprites.js đã dùng -- nên khung ảnh và khung vẽ tay đi qua *cùng*
//      một hàm vẽ, chỉ khác cái bảng màu truyền vào.
//
// Neo của mọi khung là (giữa bbox theo chiều ngang, đáy bbox): chân đứng yên tại chỗ và cánh
// tay giơ lên thì khung cao thêm về phía trên, đúng như bộ khung vẽ tay vẫn làm. Vì thế khung
// không cần offset nào cả -- render vẽ tại `y - số hàng của khung`.
const fs = require('fs'), path = require('path');
const { readPNG } = require('./png.js');

const root = path.join(__dirname, '..');
const SRC = path.join(root, 'images/animations/boss');
const OUT = path.join(root, 'js/boss-frames.js');

// Thư mục nào là con nào: 1 là áo choàng tím với dấu ấn hồng trên ngực, 2 là khối sắt có sừng
// và lò trong lồng ngực, 3 là vương miện băng. Đúng ba con boss đã có trong boss.js, nên bảng
// này là ánh xạ chứ không phải lựa chọn.
const KINDS = { voidherald: '1', forgelord: '2', frostking: '3' };
const ANIMS = ['idle', 'cast', 'hit', 'death'];

// Hai mẫu render cho mỗi pixel gameplay: thân vẫn cao đúng 40 đơn vị trong thế giới, nhưng
// browser nhận 80 mẫu ảnh thay vì thu xuống 40 rồi phóng ngược lên. boss-img.js chia cw/bw/bh
// cho SOURCE_SCALE nên hitbox, thanh máu và mọi tầm đánh không đổi.
const SOURCE_SCALE = 2;
const BODY_H = 40 * SOURCE_SCALE;
const PAL_N = 62;             // số màu mỗi con; ký tự thứ 63 trở đi sẽ không có chỗ trong CH
const A_CUT = 0.42;           // ngưỡng alpha: dưới mức này là '.'
const A_EDGE = 0.06;          // ngưỡng tính bbox trên ảnh gốc

const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function bbox(im) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++)
    for (let x = 0; x < im.w; x++)
      if (im.px[(y * im.w + x) * 4 + 3] > A_EDGE * 255) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new Error('khung trống rỗng');
  return { x0, y0, x1, y1 };
}

// Box filter đúng nghĩa: mỗi điểm đích lấy trung bình *có trọng số diện tích* của vùng nguồn
// nó phủ, kể cả phần lẻ của điểm nguồn ở hai mép. Lấy mẫu điểm giữa (nearest) ở tỉ lệ 1:30
// thì một nét sáng rộng một pixel nguồn có thể trúng hoặc trượt tuỳ khung, và bộ khung đứng
// sẽ lấp lánh những chỗ art không hề đổi.
function resample(im, bb, ow, oh) {
  const sw = bb.x1 - bb.x0 + 1, sh = bb.y1 - bb.y0 + 1;
  const r = new Float64Array(ow * oh), g = new Float64Array(ow * oh);
  const b = new Float64Array(ow * oh), a = new Float64Array(ow * oh);
  for (let oy = 0; oy < oh; oy++) {
    const fy0 = bb.y0 + oy * sh / oh, fy1 = bb.y0 + (oy + 1) * sh / oh;
    for (let ox = 0; ox < ow; ox++) {
      const fx0 = bb.x0 + ox * sw / ow, fx1 = bb.x0 + (ox + 1) * sw / ow;
      let R = 0, G = 0, B = 0, A = 0, wt = 0;
      for (let y = Math.floor(fy0); y < Math.ceil(fy1); y++) {
        const wy = Math.min(fy1, y + 1) - Math.max(fy0, y);
        if (wy <= 0 || y < 0 || y >= im.h) continue;
        for (let x = Math.floor(fx0); x < Math.ceil(fx1); x++) {
          const wx = Math.min(fx1, x + 1) - Math.max(fx0, x);
          if (wx <= 0 || x < 0 || x >= im.w) continue;
          const o = (y * im.w + x) * 4, w = wx * wy, av = im.px[o + 3] / 255;
          R += im.px[o] * av * w; G += im.px[o + 1] * av * w; B += im.px[o + 2] * av * w;
          A += av * w; wt += w;
        }
      }
      const i = oy * ow + ox;
      a[i] = wt > 0 ? A / wt : 0;
      if (A > 1e-9) { r[i] = R / A; g[i] = G / A; b[i] = B / A; }
    }
  }
  return { w: ow, h: oh, r, g, b, a };
}

// ---- palette ---------------------------------------------------------------
// Median cut trên toàn bộ điểm thấy được của *cả 12 khung*, không phải từng khung một: một
// bảng màu riêng cho mỗi khung nghĩa là cùng một mảng giáp đổi màu giữa hai khung đứng, và
// cái nhấp nháy đó đọc ra thành "sprite bị lỗi" chứ không ra thành "đang thở".
function medianCut(px, n) {
  let boxes = [px];
  const spread = box => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (const p of box)
      for (let c = 0; c < 3; c++) { if (p[c] < lo[c]) lo[c] = p[c]; if (p[c] > hi[c]) hi[c] = p[c]; }
    return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  };
  while (boxes.length < n) {
    // Chọn hộp theo (cạnh dài nhất * số điểm): chia hộp to mà thưa trước thì mất các dải màu
    // đông đúc, chia hộp đông mà đã đơn sắc thì được hai màu y hệt nhau.
    let bi = -1, best = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const s = spread(boxes[i]), m = Math.max(s[0], s[1], s[2]);
      const score = m * Math.cbrt(boxes[i].length);
      if (m > 0 && score > best) { best = score; bi = i; }
    }
    if (bi < 0) break;                       // mọi hộp còn lại đều đơn sắc
    const box = boxes[bi], s = spread(box);
    const ax = s[0] >= s[1] && s[0] >= s[2] ? 0 : (s[1] >= s[2] ? 1 : 2);
    box.sort((p, q) => p[ax] - q[ax]);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.map(box => {
    let r = 0, g = 0, b = 0;
    for (const p of box) { r += p[0]; g += p[1]; b += p[2]; }
    return [Math.round(r / box.length), Math.round(g / box.length), Math.round(b / box.length)];
  });
}
const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
function nearest(pal, r, g, b) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const dr = pal[i][0] - r, dg = pal[i][1] - g, db = pal[i][2] - b;
    // Trọng số theo độ nhạy sáng: lệch một bậc ở kênh lục thấy rõ hơn hẳn ở kênh lam, nên
    // khoảng cách RGB trần sẽ tiêu palette vào những sắc lam mà mắt không phân biệt được.
    const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// ---- một con boss ----------------------------------------------------------
function build(kind, dir) {
  const raw = [];                             // { anim, name, im, bb } -> thêm ow/oh/sm sau
  for (const an of ANIMS) {
    const d = path.join(SRC, dir, an);
    const files = fs.readdirSync(d).filter(f => f.endsWith('.png')).sort();
    if (!files.length) throw new Error(kind + ': thiếu bộ ' + an);
    for (const f of files) {
      const im = readPNG(path.join(d, f));
      raw.push({ anim: an, name: f, im, bb: bbox(im) });
    }
  }
  // Tỉ lệ dùng chung cho cả 12 khung, lấy từ *trung vị* chiều cao bbox của bộ đứng. Chuẩn hoá
  // riêng từng khung về đúng BODY_H thì mất luôn cái đang cần giữ: khung giơ tay phải cao hơn
  // khung đứng, và khung chết phải thấp dần đi.
  const idleH = raw.filter(f => f.anim === 'idle').map(f => f.bb.y1 - f.bb.y0 + 1).sort((a, b) => a - b);
  const ref = idleH[idleH.length >> 1];
  const scale = BODY_H / ref;

  // Nửa bề rộng lớn nhất tính từ cột giữa của từng khung, nhân đôi cộng một: lưới rộng số lẻ
  // thì cột neo là một cột thật, và `flip` trong blit lật quanh đúng cột đó. Lưới rộng số chẵn
  // sẽ đẩy cả người sang một pixel mỗi lần boss đổi hướng.
  let half = 0;
  for (const f of raw) {
    const ow = Math.max(1, Math.round((f.bb.x1 - f.bb.x0 + 1) * scale));
    f.ow = ow; f.oh = Math.max(1, Math.round((f.bb.y1 - f.bb.y0 + 1) * scale));
    const hl = ow >> 1;
    half = Math.max(half, hl, ow - 1 - hl);
  }
  const cw = half * 2 + 1;

  // Resample tất cả, gom điểm để dựng palette.
  const pool = [];
  for (const f of raw) {
    f.sm = resample(f.im, f.bb, f.ow, f.oh);
    f.im = null;                              // 1.5 MB mỗi ảnh; thả ngay sau khi hạ cỡ
    for (let i = 0; i < f.ow * f.oh; i++)
      if (f.sm.a[i] >= A_CUT)
        pool.push([Math.round(f.sm.r[i]), Math.round(f.sm.g[i]), Math.round(f.sm.b[i])]);
  }
  const pal = medianCut(pool.slice(), Math.min(PAL_N, CH.length));

  // Lưới ký tự. Mỗi khung rộng cw, cao oh, neo ở đáy -- không có offset nào, render vẽ tại
  // `y - g.length`, nên khung cao hơn là khung cao thêm về phía đầu.
  const anim = {};
  for (const an of ANIMS) anim[an] = [];
  let solidMin = Infinity;
  for (const f of raw) {
    const ox = half - (f.ow >> 1);
    const g = [];
    for (let y = 0; y < f.oh; y++) {
      let line = '';
      for (let x = 0; x < cw; x++) {
        const sx = x - ox, i = y * f.ow + sx;
        if (sx < 0 || sx >= f.ow || f.sm.a[i] < A_CUT) { line += '.'; continue; }
        line += CH[nearest(pal, f.sm.r[i], f.sm.g[i], f.sm.b[i])];
      }
      g.push(line);
    }
    // Hàng rỗng ở đáy (mép dưới rụng sau khi cắt alpha) thì bỏ đi luôn: giữ lại là để cả con
    // boss lơ lửng trên mặt đất một pixel, mà lơ lửng *chỉ ở vài khung* thì thành giật.
    while (g.length && /^\.*$/.test(g[g.length - 1])) g.pop();
    while (g.length && /^\.*$/.test(g[0])) g.shift();
    solidMin = Math.min(solidMin, g.join('').replace(/\./g, '').length);
    anim[f.anim].push({ g, name: f.name });
  }
  // Hộp gameplay theo chiều ngang. bw là bán kính bị đánh trúng, và chỉ lấy bộ đứng: lấy theo
  // khung giơ tay ngang (rộng tới 46) sẽ cho boss một hitbox mà hơn 10 px mỗi bên là không khí
  // -- người chơi trúng đòn ở chỗ không có gì cả. Là một số cố định cho mọi khung, đúng như
  // lưới vẽ tay (một khổ duy nhất) vẫn là.
  //
  // Chiều cao *không* tính ở đây: boss-img.js còn cộng thêm một nhịp nhấp 1 px cho bộ đi, nên
  // chỗ duy nhất biết được người cao thật sự tới đâu là chỗ định nghĩa cái nhịp đó. Bake sẵn ở
  // đây từng cho ra một thanh máu cắt qua mũ trùm của con 1 đúng lúc nó đang đi.
  let bw = 0;
  for (const f of anim.idle) {
    let lo = cw, hi = -1;
    for (const line of f.g)
      for (let x = 0; x < cw; x++) if (line[x] !== '.') { if (x < lo) lo = x; if (x > hi) hi = x; }
    bw = Math.max(bw, Math.max(hi - half, half - lo) * 2 + 1);
  }
  return { kind, cw, bw, pal, anim, scale, ref, solidMin };
}

// ---- ghi file --------------------------------------------------------------
const built = {};
for (const k in KINDS) built[k] = build(k, KINDS[k]);

const L = [];
L.push('"use strict";');
L.push('// ===========================================================================');
L.push('// 2b. Khung boss dựng từ ảnh. SINH TỰ ĐỘNG bởi tools/gen-boss-frames.js từ');
L.push('//     images/animations/boss/** -- sửa tay ở đây là mất trong lần sinh sau.');
L.push('//');
L.push('//     Dạng dữ liệu cố tình *giống* bộ sprite vẽ tay ở sprites.js/boss.js: lưới ký');
L.push('//     tự, một ký tự một điểm, \'.\' là trong suốt. Khác duy nhất là bảng màu không');
L.push('//     phải PAL dùng chung mà là `pal` riêng của từng con (ký tự thứ i trong');
L.push('//     BOSS_ART_CH ứng với pal[i]), vì ba con art thật mang theo hơn 180 màu còn PAL');
L.push('//     chỉ còn chưa tới mười ký tự trống. Nhờ vậy chúng vẽ qua đúng `blit` của');
L.push('//     sprites.js, chỉ thêm một tham số palette.');
L.push('//');
L.push('//     Mỗi khung neo ở *đáy* lưới và giữa cột lưới: không có offset, render vẽ tại');
L.push('//     (x - nửa rộng, y - số hàng), nên khung giơ tay cao thêm về phía đầu và khung');
L.push('//     chết thấp dần xuống đất. `cw` là bề rộng lưới (lẻ, để `flip` lật quanh cột neo)');
L.push('//     và `bw` là bán kính bị đánh trúng; chiều cao hộp do boss-img.js tính, vì nó là');
L.push('//     file cộng thêm nhịp nhấp cho bộ đi.');
L.push('// ===========================================================================');
L.push('const BOSS_ART_SCALE = ' + SOURCE_SCALE + ';');
L.push("const BOSS_ART_CH = '" + CH + "';");
L.push('const BOSS_ART = {');
for (const k in built) {
  const A = built[k];
  L.push('  // ' + k + ': images/animations/boss/' + KINDS[k] + '/**, thu ' +
         (1 / A.scale).toFixed(1) + ':1 (bbox đứng ' + A.ref + ' px -> thân ' + BODY_H + ' px)');
  L.push('  ' + k + ': {');
  L.push('    cw: ' + A.cw + ', bw: ' + A.bw + ',');
  L.push('    pal: [');
  for (let i = 0; i < A.pal.length; i += 6)
    L.push('      ' + A.pal.slice(i, i + 6).map(c => "'" + hex(c) + "'").join(', ') + ',');
  L.push('    ],');
  L.push('    anim: {');
  for (const an of ANIMS) {
    L.push('      ' + an + ': [');
    for (const f of A.anim[an]) {
      L.push('        // ' + an + '/' + f.name + '  ' + A.cw + 'x' + f.g.length);
      L.push('        [' + f.g.map(r => "'" + r + "'").join(',\n         ') + '],');
    }
    L.push('      ],');
  }
  L.push('    },');
  L.push('  },');
}
L.push('};');
L.push('');
fs.writeFileSync(OUT, L.join('\n'));

for (const k in built) {
  const A = built[k];
  const n = ANIMS.map(a => a + ' ' + A.anim[a].length).join(', ');
  const gh = Math.max(...ANIMS.map(a => Math.max(...A.anim[a].map(f => f.g.length))));
  console.log(k.padEnd(11) + ' lưới ' + (A.cw + 'x' + gh).padEnd(9) +
              ' bw ' + String(A.bw).padEnd(4) +
              ' palette ' + String(A.pal.length).padEnd(3) +
              ' điểm/khung >= ' + String(A.solidMin).padEnd(5) + ' (' + n + ')');
}
console.log('-> ' + path.relative(root, OUT) + '  ' +
            (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
