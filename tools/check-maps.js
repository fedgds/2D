// Kiểm tra mọi map đã đăng ký, không cần browser.
//
// Chạy: node tools/check-maps.js
//
// Không có bước build và cũng không có browser ở đây, nên đây là cách một file map mới
// được kiểm trước khi mở game: engine trong `js/` là tính toán thuần (phần shell browser
// nằm sau `if (typeof document !== 'undefined')` trong js/shell.js), nên node nối các file
// theo đúng thứ tự index.html nạp rồi lấy `globalThis.LAB` ra dùng.
//
// Ba thứ được kiểm, tương ứng ba cách một map mới hay sai:
//   1. tông sàn vượt cửa dither -> cửa sổ sàn dựng sẵn nói dối (xem map/README.md);
//   2. floor/props/emit/amb ném lỗi khi thật sự chạy chứ không chỉ khi nạp;
//   3. chiêu lướt né mặc định vẫn đúng trên sân mới (bất tử, hồi chiêu, chặn ở tường).
const fs = require('fs'), vm = require('vm'), path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Nối mọi <script> của index.html theo đúng thứ tự trong trang: map/ trước, rồi js/.
// Thứ tự là bắt buộc -- registry phải có sẵn trước khi js/arena.js gọi applyMap(MAPS[0])
// lúc nạp, và mỗi file engine chỉ chạy được sau những file nó dựa vào. Thân <script> viết
// thẳng trong trang (nếu có) cũng được lấy, nên cách đọc này đúng cho cả bản gộp một file.
const files = [];
let src = '';
// Bỏ comment HTML trước khi quét: một chữ `<script>` nằm trong comment thì browser không
// tính, và tool cũng không được tính -- nếu tính thì nó ăn mất thẻ ngay sau đó.
for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  const s = /\bsrc="([^"]+)"/.exec(m[1]);
  if (!s) { src += m[2] + '\n'; continue; }
  const p = path.join(root, s[1]);
  if (!fs.existsSync(p)) continue;
  files.push(s[1]);
  src += fs.readFileSync(p, 'utf8') + '\n';
}

const ctx = { console, Math, Date, performance: { now: () => 0 } };
ctx.globalThis = ctx;
vm.runInNewContext('"use strict";\n' + src, ctx, { filename: 'index.html' });
const LAB = ctx.LAB;
if (!LAB) { console.log('index.html không xuất globalThis.LAB'); process.exit(1); }

let bad = 0;
function eq(name, got, want) {
  const ok = got === want;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + '  = ' + got + (ok ? '' : '  (cần ' + want + ')'));
}

console.log('map: ' + files.filter(f => f.startsWith('map/')).join(' '));
console.log('engine: ' + files.filter(f => !f.startsWith('map/')).length + ' file js/');
console.log('đăng ký: ' + LAB.MAPS.map(m => m.id + '#' + m.order).join(', '));

// ---- 1. cửa dither: một tông phải resolve ra đúng một bộ byte ở cả 16 pha Bayer ----
console.log('\n-- cửa dither (16 pha Bayer / tông) --');
const px = new Uint8ClampedArray(LAB.W * LAB.H * 4);
for (const m of LAB.MAPS) {
  LAB.applyMap(m);
  eq(m.id + ': số ô tông', LAB.TONESET.length, 8);
  let worst = 0;
  for (const t of LAB.TONESET) {
    LAB.buf.fill(0);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const o = (y * LAB.W + x) * 3;
      LAB.buf[o] = t[0]; LAB.buf[o + 1] = t[1]; LAB.buf[o + 2] = t[2];
    }
    LAB.resolve(px, true);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) for (let c = 0; c < 3; c++)
      worst = Math.max(worst, Math.abs(px[(y * LAB.W + x) * 4 + c] - px[c]));
  }
  eq(m.id + ': lệch giữa các pha', worst, 0);
}

// ---- 2. bake, rải prop và vẽ thật ------------------------------------------------
console.log('\n-- 90 khung mỗi sân --');
for (const m of LAB.MAPS) {
  const w = LAB.newWorld(777, { map: m.id, wp: 'kiem', slots: [0, 1, 2] });
  let ok = 'ok';
  try {
    for (let f = 0; f < 90; f++) {
      LAB.step(w, 1 / 60, { dx: 1, dy: f & 1 ? 1 : -1, ax: w.hero.x + 40, ay: w.hero.y });
      LAB.renderWorld(w);
      LAB.resolve(px, true);
    }
  } catch (e) { ok = 'NÉM LỖI ' + (e && e.message || e); }
  eq(m.id + ': vẽ được', ok, 'ok');
  eq(m.id + ': có prop', LAB.PROPS.length > 200, true);
  eq(m.id + ': có mốc minimap', LAB.LANDMARKS.length > 0, true);
  console.log('     ' + LAB.PROPS.length + ' prop · ' + LAB.LANDMARKS.length + ' mốc · '
    + w.amb.length + ' hạt · ' + w.foes.length + ' quái');
}

// ---- 3. chiêu lướt né mặc định ---------------------------------------------------
console.log('\n-- lướt né --');
LAB.applyMap(LAB.MAPS[0]);
const w = LAB.newWorld(4, { map: LAB.MAPS[0].id, wp: 'kiem', slots: [0, 1, 2] });
const h = w.hero;
h.x = LAB.WW * 0.5; h.y = LAB.WH * 0.5;
const x0 = h.x;
eq('lướt được', LAB.dash(w, 1, 0), true);
eq('đang hồi thì không lướt', LAB.dash(w, 1, 0), false);
eq('bật bất tử', h.inv.toFixed(2), LAB.DASH_IV.toFixed(2));
for (let f = 0; f < 12; f++) LAB.step(w, 1 / 60, null);
eq('đi đủ DASH_LEN', Math.round(h.x - x0), LAB.DASH_LEN);
eq('đã hết trượt', h.dsh <= 0, true);
w.god = false;
const hp = h.hp;
eq('vẫn còn bất tử', h.inv > 0, true);
eq('đòn bị né', LAB.hitHero(w, 999, [1, 1, 1]), 0);
eq('không mất HP', h.hp, hp);
eq('đếm né', w.dodges, 1);
while (h.inv > 0) LAB.step(w, 1 / 60, null);
eq('hết bất tử thì ăn đòn', LAB.hitHero(w, 40, [1, 1, 1]) > 0, true);
while (w.dcd > 0) LAB.step(w, 1 / 60, null);
h.x = LAB.BOUND.x1 - 4;
eq('lướt vào tường', LAB.dash(w, 1, 0), true);
for (let f = 0; f < 12; f++) LAB.step(w, 1 / 60, null);
eq('dừng đúng ở BOUND', h.x, LAB.BOUND.x1);

console.log('\n' + (bad ? bad + ' LỖI' : 'tất cả đều đạt'));
process.exit(bad ? 1 : 0);
