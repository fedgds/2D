// Chụp một chiêu (hoặc một nhát vũ khí) thành contact sheet PNG, không cần browser.
//
// Chạy: node tools/shot-skills.js whirl_slash blood_rend
//       node tools/shot-skills.js wp:cung
//       node tools/shot-skills.js --all
//
// Hiệu ứng là thứ duy nhất trong engine không kiểm được bằng con số: "trông đơn điệu" chỉ
// đọc ra được khi xem sáu khung cạnh nhau. Tool nạp engine đúng như check-maps.js (nối
// <script src> của index.html rồi chạy bằng node:vm), dựng một sân cố định, cast, rồi ghép
// các khung tại những mốc p đã chọn thành một ảnh.
const fs = require('fs'), vm = require('vm'), path = require('path');
const { writePNG } = require('./png.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let src = '';
for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  const s = /\bsrc="([^"]+)"/.exec(m[1]);
  if (!s) { src += m[2] + '\n'; continue; }
  const p = path.join(root, s[1]);
  if (fs.existsSync(p)) src += fs.readFileSync(p, 'utf8') + '\n';
}
const ctx = { console, Math, Date, performance: { now: () => 0 } };
ctx.globalThis = ctx;
vm.runInNewContext('"use strict";\n' + src, ctx, { filename: 'index.html' });
const LAB = ctx.LAB;

// Khung nhìn riêng cho từng chiêu: chiêu đánh quanh người thì crop chặt cho thấy rõ nét,
// chiêu rơi từ trời thì phải chừa phần trên màn hình.
const VIEW = {
  _default: { w: 180, h: 120, dy: -10, scale: 3 },
  arcane_rain: { w: 240, h: 160, dy: -18, scale: 2 },
  gale_vortex: { w: 200, h: 150, dy: -22, scale: 2 },
  // Trụ phán xét neo vào *mép trên* khung 320x180, không vào điểm ngắm: crop chặt là cắt mất
  // chỗ cây cột bắt đầu, và câu hỏi duy nhất về chiêu này là có thấy nó từ trên trời xuống hay
  // không. `h: 150` với `dy: -26` là đủ cao để mép trên khung nằm trong ảnh.
  judgment_beam: { w: 220, h: 150, dy: -26, scale: 2 },
  // Cú sụp kết bằng một sóng xung kích bán kính ~64: crop 180x120 cắt mất chính cái khung
  // đáng xem nhất của chiêu.
  void_collapse: { w: 220, h: 150, dy: -14, scale: 2 },
};
const MARKS = [0.06, 0.20, 0.36, 0.55, 0.74, 0.93];
const COLS = 3;

function newSheet(view, n) {
  const tw = view.w * view.scale, th = view.h * view.scale, rows = Math.ceil(n / COLS);
  return { w: tw * COLS, h: th * rows, tw, th, px: Buffer.alloc(tw * COLS * th * rows * 4, 0) };
}
// Cắt khung nhìn quanh (cx,cy) khỏi khung vừa render rồi nhân điểm lên `scale` vào ô `slot`.
function tile(sheet, px, view, cx, cy, slot) {
  const cam = LAB.cam();
  const ox = Math.round(cx - cam.x - view.w / 2);
  const oy = Math.round(cy - cam.y - view.h / 2 + view.dy);
  const gx = (slot % COLS) * sheet.tw, gy = Math.floor(slot / COLS) * sheet.th;
  for (let y = 0; y < view.h; y++) for (let x = 0; x < view.w; x++) {
    const sxp = ox + x, syp = oy + y;
    let r = 0, g = 0, b = 0;
    if (sxp >= 0 && sxp < LAB.W && syp >= 0 && syp < LAB.H) {
      const i4 = (syp * LAB.W + sxp) * 4;
      r = px[i4]; g = px[i4 + 1]; b = px[i4 + 2];
    }
    for (let ky = 0; ky < view.scale; ky++) for (let kx = 0; kx < view.scale; kx++) {
      const o = ((gy + y * view.scale + ky) * sheet.w + gx + x * view.scale + kx) * 4;
      sheet.px[o] = r; sheet.px[o + 1] = g; sheet.px[o + 2] = b; sheet.px[o + 3] = 255;
    }
  }
}
// Sân chụp: cùng một seed, cùng một chỗ đứng, không telegraph, hero bất tử. Hai lần chụp
// cách nhau vài lần sửa code thì phải so được với nhau.
function bench(wpId) {
  const w = LAB.newWorld(4242, { map: LAB.MAPS[0].id, wp: wpId, slots: [0, 1, 2] });
  const h = w.hero;
  h.x = Math.round(LAB.WW * 0.5); h.y = Math.round(LAB.WH * 0.5);
  w.foes.length = 0; w.tels.length = 0; w.god = true;
  return w;
}
function save(name, sheet, note) {
  const dir = path.join(__dirname, 'out');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir,
    (process.env.SHOT_TAG ? process.env.SHOT_TAG + '-' : '') + name + '.png');
  writePNG(out, sheet);
  console.log(name + ' -> ' + path.relative(root, out)
    + '  (' + sheet.w + 'x' + sheet.h + ', ' + note + ')');
}

function shoot(id) {
  const idx = LAB.SKILLS.findIndex(s => s.id === id);
  if (idx < 0) { console.log('không có chiêu ' + id); return; }
  const sk = LAB.SKILLS[idx];
  const view = VIEW[id] || VIEW._default;
  const w = bench('kiem');
  const h = w.hero;
  // Bầy cố định: hitCircle làm quái loé trắng, mà loé trắng ngẫu nhiên thì hai lần chụp
  // không so được với nhau.
  for (const s of [[34, 6], [-30, 14], [8, -22], [56, -8], [-52, -16]])
    w.foes.push(LAB.unit('slime', h.x + s[0], h.y + s[1]));
  LAB.snapCam(w);

  const tx = h.x + 30, ty = h.y - 8;
  LAB.cast(w, idx, tx, ty);
  const e = w.fxs[w.fxs.length - 1];
  const cx = sk.mode === 'self' ? h.x : e.x, cy = sk.mode === 'self' ? h.y : e.y;

  const px = new Uint8ClampedArray(LAB.W * LAB.H * 4);
  const sheet = newSheet(view, MARKS.length);
  let shot = 0;
  const dt = 1 / 60;
  for (let f = 0; f < Math.ceil(sk.dur / dt) + 2 && shot < MARKS.length; f++) {
    LAB.step(w, dt, null);
    LAB.renderWorld(w, px);
    while (shot < MARKS.length && (e.p >= MARKS[shot] || e.p >= 1))
      tile(sheet, px, view, cx, cy, shot++);
  }
  save(id, sheet, 'p = ' + MARKS.join(' '));
}

// Vũ khí không có `p` để bám vào -- với cung thì nhát vung kết thúc từ lâu mà mũi tên vẫn
// còn bay -- nên mốc chụp là *giây*, và cửa sổ đáng xem phải tính ra: vũ khí cận chiến là
// đúng một nhát vung, vũ khí bắn là từ lúc bật dây cho tới lúc mũi tên hết tầm. Khung nhìn
// cũng phải dịch ra trước mặt (`dx`) để chứa cả đường bay chứ không chỉ chỗ người đứng.
const WP_VIEW = { _default: { w: 250, h: 150, dx: 84, dy: -12, scale: 2 } };

function shootWeapon(id) {
  const wp = LAB.WEAPON_BY_ID[id];
  if (!wp) { console.log('không có vũ khí ' + id); return; }
  const view = WP_VIEW[id] || WP_VIEW._default;
  const w = bench(id);
  const h = w.hero, oy = h.y - h.h * 0.5;
  // Bia dàn theo đúng các làn của vũ khí (không nan quạt thì một làn), hai lớp sâu: nan quạt
  // chỉ đọc ra được khi mỗi làn có thứ để trúng, còn lớp sau cho thấy nó xuyên.
  const s = wp.shot, lanes = s ? [0, -1, 1].map(k => k * (s.spread || 0)) : [0];
  for (const d of [86, 150]) for (const a of lanes) {
    const f = LAB.unit('slime', Math.round(h.x + d * Math.cos(a)), h.y);
    f.y = Math.round(oy + d * Math.sin(a) * wp.squash + f.h * 0.5);
    f.hp = f.maxhp = 1e6;  // chết ở khung thứ hai thì bốn khung sau không còn gì để xem
    w.foes.push(f);
  }
  LAB.snapCam(w);
  LAB.swing(w, h.x + 240, h.y);

  const span = s ? wp.hits[0] / wp.fps + s.max / s.spd : wp.dur;
  const marks = MARKS.map(m => m * span);
  const px = new Uint8ClampedArray(LAB.W * LAB.H * 4);
  const sheet = newSheet(view, marks.length);
  const dt = 1 / 60;
  let shot = 0, t = 0;
  while (shot < marks.length && t < span + 1) {
    LAB.step(w, dt, null); t += dt;
    LAB.renderWorld(w, px);
    while (shot < marks.length && t >= marks[shot])
      tile(sheet, px, view, h.x + view.dx, h.y, shot++);
  }
  save('wp-' + id, sheet, 't = ' + marks.map(m => m.toFixed(2)).join(' ') + ' s');
}

const args = process.argv.slice(2);
const ids = args.includes('--all')
  ? LAB.SKILLS.map(s => s.id).concat(LAB.WEAPONS.map(x => 'wp:' + x.id))
  : args;
if (!ids.length) {
  console.log('dùng: node tools/shot-skills.js <skill-id>... | wp:<weapon-id>... | --all');
  process.exit(1);
}
for (const id of ids) id.startsWith('wp:') ? shootWeapon(id.slice(3)) : shoot(id);
