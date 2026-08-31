// Sinh js/gate-frames.js từ images/gates/gate-1.png.
//
// Chạy: node tools/gen-gate-frames.js
//
// Cùng đường đi với tools/gen-boss-frames.js -- cắt bbox alpha, box filter xuống cỡ thật, lượng
// hoá màu bằng median cut, ghi ra lưới ký tự mà `blit` đã biết đọc -- nhưng khác nó ở đúng một
// quyết định, và đó là quyết định quan trọng nhất của file này:
//
//   ảnh này là **ánh sáng**, không phải vật chất.
//
// Con boss là một khối thịt: nó che sàn, nên nó vẽ alpha-over và alpha bị cắt thành nhị phân.
// Cánh cổng là một vòng lửa lạnh: nó *cộng* vào buffer HDR. Nên ở đây alpha được **nhân thẳng
// vào màu** (premultiply) rồi bỏ đi, và cái grid mang ra là cường độ sáng sẵn sàng để cộng:
//
//   * viền mờ dần của art tự thành quầng sáng yếu -- không cần một tầng glow vẽ tay nào;
//   * cái lỗ đen giữa vòng premultiply ra 0, tức là *không cộng gì*, nên sàn hiện qua miệng
//     cổng đúng như nó phải hiện: một cái miệng, không phải một miếng sơn đen;
//   * không có ngưỡng alpha nhị phân, nên vòng sáng không bị răng cưa cứng như sprite.
//
// Neo là (giữa lưới theo chiều ngang, đáy lưới), y như bộ khung boss: cổng *đứng trên sàn*, nên
// render vẽ tại (x - nửa rộng, y - số hàng). `mx`/`my` là tâm khối sáng tính bằng pixel thế giới
// từ góc trên-trái của lưới: đó là miệng cổng thật, và js/gate.js lấy nó làm chỗ người chơi phải
// đứng vào chứ không phải lấy giữa hình -- vòng sáng này không đối xứng.
const fs = require('fs'), path = require('path');
const { readPNG } = require('./png.js');

const root = path.join(__dirname, '..');
const SRC = path.join(root, 'images/gates/gate-1.png');
const OUT = path.join(root, 'js/gate-frames.js');

// Hai mẫu cho mỗi pixel gameplay, hệt boss art: browser vẽ ở RENDER_SCALE 2 nên lưới dày gấp
// đôi là lưới không mất chi tiết ở bước cuối. gate.js chia cho SCALE nên cỡ thật không đổi.
const SCALE = 2;
// Bề rộng thật của cổng, tính bằng pixel thế giới. 62 px là hơn bốn lần bề ngang hero (11 px) và
// cao 51 px so với 14 px của hero: một cánh cổng phải *cao hơn cái thứ đi qua nó*, bằng không nó
// đọc ra là một vòng sáng nằm trên sàn. Ảnh gốc 1352x1163 nên phóng lên không mất chi tiết -- cái
// đổi theo con số này là GATE_RX/GATE_RY và các bán kính trong `drawGate` (xem js/gate.js).
const BODY_W = 62 * SCALE;
const PAL_N = 40;                  // vòng sáng này chỉ có lam + trắng: 40 màu là dư
const A_EDGE = 0.02;               // ngưỡng alpha để tính bbox trên ảnh gốc
const L_CUT = 0.035;               // dưới mức sáng này thì là '.', tức là không cộng gì

const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function bbox(im) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < im.h; y++)
    for (let x = 0; x < im.w; x++)
      if (im.px[(y * im.w + x) * 4 + 3] > A_EDGE * 255) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new Error('ảnh trống rỗng');
  return { x0, y0, x1, y1 };
}

// Box filter có trọng số diện tích, kể cả phần lẻ của pixel nguồn ở hai mép. Trả về màu **đã
// premultiply**: đây là chỗ alpha biến thành cường độ và không còn tồn tại như một kênh riêng.
function resample(im, bb, ow, oh) {
  const sw = bb.x1 - bb.x0 + 1, sh = bb.y1 - bb.y0 + 1;
  const r = new Float64Array(ow * oh), g = new Float64Array(ow * oh), b = new Float64Array(ow * oh);
  for (let oy = 0; oy < oh; oy++) {
    const fy0 = bb.y0 + oy * sh / oh, fy1 = bb.y0 + (oy + 1) * sh / oh;
    for (let ox = 0; ox < ow; ox++) {
      const fx0 = bb.x0 + ox * sw / ow, fx1 = bb.x0 + (ox + 1) * sw / ow;
      let R = 0, G = 0, B = 0, wt = 0;
      for (let y = Math.floor(fy0); y < Math.ceil(fy1); y++) {
        const wy = Math.min(fy1, y + 1) - Math.max(fy0, y);
        if (wy <= 0 || y < 0 || y >= im.h) continue;
        for (let x = Math.floor(fx0); x < Math.ceil(fx1); x++) {
          const wx = Math.min(fx1, x + 1) - Math.max(fx0, x);
          if (wx <= 0 || x < 0 || x >= im.w) continue;
          const o = (y * im.w + x) * 4, k = wx * wy, av = im.px[o + 3] / 255;
          R += im.px[o] / 255 * av * k; G += im.px[o + 1] / 255 * av * k;
          B += im.px[o + 2] / 255 * av * k; wt += k;
        }
      }
      const i = oy * ow + ox;
      if (wt > 0) { r[i] = R / wt; g[i] = G / wt; b[i] = B / wt; }
    }
  }
  return { r, g, b };
}

// Median cut, y như bên boss: chia hộp theo (cạnh dài nhất * căn bậc ba số điểm), rồi lấy trung
// bình mỗi hộp. Chạy trên giá trị 0..255 của màu đã premultiply.
function medianCut(px, n) {
  let boxes = [px];
  const spread = box => {
    const lo = [255, 255, 255], hi = [0, 0, 0];
    for (const p of box)
      for (let c = 0; c < 3; c++) { if (p[c] < lo[c]) lo[c] = p[c]; if (p[c] > hi[c]) hi[c] = p[c]; }
    return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  };
  while (boxes.length < n) {
    let bi = -1, best = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const s = spread(boxes[i]), m = Math.max(s[0], s[1], s[2]);
      const score = m * Math.cbrt(boxes[i].length);
      if (m > 0 && score > best) { best = score; bi = i; }
    }
    if (bi < 0) break;
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
    const d = dr * dr * 0.30 + dg * dg * 0.59 + db * db * 0.11;
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}
const lum = (r, g, b) => r * 0.30 + g * 0.59 + b * 0.11;

// Miệng cổng = lỗ tối **bên trong** vòng sáng, không phải giữa hình. Tô loang từ mép lưới qua các
// ô tối để đánh dấu "bên ngoài"; những ô tối còn sót lại là các lỗ kín, và lỗ to nhất là miệng.
// Làm thế này thay vì lấy trọng tâm khối sáng vì vòng lửa này lệch: thanh sáng ở chân cổng sẽ kéo
// trọng tâm tụt xuống dưới miệng, và người chơi sẽ phải đứng chệch chỗ.
function mouth(lit, ow, oh) {
  const out = new Uint8Array(ow * oh), st = [];
  const push = (x, y) => {
    const i = y * ow + x;
    if (x < 0 || y < 0 || x >= ow || y >= oh || out[i] || lit[i]) return;
    out[i] = 1; st.push(i);
  };
  for (let x = 0; x < ow; x++) { push(x, 0); push(x, oh - 1); }
  for (let y = 0; y < oh; y++) { push(0, y); push(ow - 1, y); }
  while (st.length) {
    const i = st.pop(), x = i % ow, y = (i - x) / ow;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  const seen = new Uint8Array(ow * oh);
  let best = null;
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    const i0 = y * ow + x;
    if (lit[i0] || out[i0] || seen[i0]) continue;
    const q = [i0]; seen[i0] = 1;
    let n = 0, sx = 0, sy = 0;
    while (q.length) {
      const i = q.pop(), cx = i % ow, cy = (i - cx) / ow;
      n++; sx += cx; sy += cy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= ow || ny >= oh) continue;
        const j = ny * ow + nx;
        if (lit[j] || out[j] || seen[j]) continue;
        seen[j] = 1; q.push(j);
      }
    }
    if (!best || n > best.n) best = { n, x: sx / n, y: sy / n };
  }
  return best || { n: 0, x: ow / 2, y: oh / 2 };
}

function build() {
  const im = readPNG(SRC);
  const bb = bbox(im);
  const sw = bb.x1 - bb.x0 + 1, sh = bb.y1 - bb.y0 + 1;
  const ow = BODY_W, oh = Math.max(1, Math.round(ow * sh / sw));
  const { r, g, b } = resample(im, bb, ow, oh);

  const lit = new Uint8Array(ow * oh), px = [];
  for (let i = 0; i < ow * oh; i++)
    if (lum(r[i], g[i], b[i]) >= L_CUT) {
      lit[i] = 1;
      px.push([Math.round(r[i] * 255), Math.round(g[i] * 255), Math.round(b[i] * 255)]);
    }
  if (!px.length) throw new Error('không còn pixel nào sáng qua L_CUT');
  const pal = medianCut(px, Math.min(PAL_N, px.length));

  const rows = [];
  for (let y = 0; y < oh; y++) {
    let s = '';
    for (let x = 0; x < ow; x++) {
      const i = y * ow + x;
      s += lit[i] ? CH[nearest(pal, r[i] * 255, g[i] * 255, b[i] * 255)] : '.';
    }
    rows.push(s);
  }
  const m = mouth(lit, ow, oh);
  return { cw: ow, ch: oh, pal, rows, mx: m.x / SCALE, my: m.y / SCALE, lit: px.length, hole: m.n,
    sw: im.w, sh: im.h };
}

const a = build();
const L = [];
L.push('// SINH TỰ ĐỘNG bởi tools/gen-gate-frames.js -- đừng sửa tay, sửa ảnh gốc rồi chạy lại.');
L.push('//');
L.push('// Lưới ánh sáng của cánh cổng boss, lấy từ images/gates/gate-1.png. Màu ở đây **đã nhân');
L.push('// alpha**: nó là cường độ để *cộng* vào buffer HDR, không phải sprite để vẽ chồng. Dấu');
L.push("// '.' nghĩa là không cộng gì, nên miệng cổng để lộ nguyên cái sàn phía sau.");
L.push('//');
L.push('//   cw/ch  cỡ lưới (chia scale ra pixel thế giới)');
L.push('//   scale  số mẫu trên mỗi pixel thế giới');
L.push('//   mx/my  tâm miệng cổng, tính bằng pixel thế giới từ góc trên-trái của lưới');
L.push('"use strict";');
L.push('const GATE_ART = {');
L.push('  cw: ' + a.cw + ', ch: ' + a.ch + ', scale: ' + SCALE + ',');
L.push('  mx: ' + a.mx.toFixed(2) + ', my: ' + a.my.toFixed(2) + ',');
L.push('  pal: [' + a.pal.map(c => "'" + hex(c) + "'").join(', ') + '],');
L.push('  g: [');
for (const s of a.rows) L.push("    '" + s + "',");
L.push('  ],');
L.push('};');
fs.writeFileSync(OUT, L.join('\n') + '\n');
console.log('gate-1.png ' + a.sw + 'x' + a.sh + ' -> lưới ' + a.cw + 'x' + a.ch +
  ' (' + (a.cw / SCALE) + 'x' + (a.ch / SCALE) + ' px thế giới), ' + a.pal.length + ' màu, ' +
  a.lit + ' ô sáng, miệng ' + a.hole + ' ô tại (' + a.mx.toFixed(1) + ', ' + a.my.toFixed(1) + ')');
console.log('đã ghi ' + path.relative(root, OUT));

