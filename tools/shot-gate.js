// Chụp cánh cổng boss và bốn phẩm chất đồ rơi thành contact sheet PNG, không cần browser.
//
// Chạy: node tools/shot-gate.js          (cả hai tấm)
//       node tools/shot-gate.js gate
//       node tools/shot-gate.js orbs
//
// check-boss.js chứng minh được mọi thứ đo được của cánh cổng -- mốc mở, đứng bao lâu thì vào,
// phòng hẹp hơn sân mà rộng hơn khung nhìn, `BOUND` trả về đúng cỡ lúc ra -- và không nói được
// câu duy nhất còn lại: *nhìn có ra một cánh cổng không*. Một vòng sáng "đúng chỗ" vẫn có thể mờ
// tới mức không ai thấy nó mở, và một cái miệng "có xoáy" vẫn có thể đọc ra là một vết sơn.
//
// Với đồ rơi thì câu hỏi còn hẹp hơn: check-gear.js đếm được số điểm sáng của bốn phẩm chất và
// chứng minh tím/cam nhiều hơn xanh, nhưng "nhiều hơn 1,25 lần" là một con số, không phải một
// cảm giác. Bốn quả sáng xếp cạnh nhau ở cùng một khung thì mắt trả lời trong một giây.
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

// ---- khung ảnh -----------------------------------------------------------------------------
function newSheet(view, n, cols) {
  const tw = view.w * view.scale, th = view.h * view.scale, rows = Math.ceil(n / cols);
  return { w: tw * cols, h: th * rows, tw, th, cols,
           px: Buffer.alloc(tw * cols * th * rows * 4, 0) };
}
// Cắt một khung nhìn quanh (cx,cy) khỏi khung vừa render rồi nhân điểm lên `scale`. Gốc cắt kẹp
// vào trong buffer: một ô đen một nửa vì crop trôi ra ngoài là một ô không so được với ô nào.
function tile(sheet, px, view, cx, cy, slot) {
  const cam = LAB.cam();
  const ox = Math.max(0, Math.min(LAB.W - view.w, Math.round(cx - cam.x - view.w / 2)));
  const oy = Math.max(0, Math.min(LAB.H - view.h, Math.round(cy - cam.y - view.h / 2 + (view.dy || 0))));
  const gx = (slot % sheet.cols) * sheet.tw, gy = Math.floor(slot / sheet.cols) * sheet.th;
  for (let y = 0; y < view.h; y++) for (let x = 0; x < view.w; x++) {
    const i4 = ((oy + y) * LAB.W + ox + x) * 4;
    const r = px[i4], g = px[i4 + 1], b = px[i4 + 2];
    for (let ky = 0; ky < view.scale; ky++) for (let kx = 0; kx < view.scale; kx++) {
      const o = ((gy + y * view.scale + ky) * sheet.w + gx + x * view.scale + kx) * 4;
      sheet.px[o] = r; sheet.px[o + 1] = g; sheet.px[o + 2] = b; sheet.px[o + 3] = 255;
    }
  }
}
function save(name, sheet, note) {
  const dir = path.join(__dirname, 'out');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, (process.env.SHOT_TAG ? process.env.SHOT_TAG + '-' : '') + name + '.png');
  writePNG(out, sheet);
  console.log(name + ' -> ' + path.relative(root, out) + '  (' + sheet.w + 'x' + sheet.h + ', ' + note + ')');
}

// ---- sân chụp ------------------------------------------------------------------------------
// Cùng seed, cùng chỗ đứng, không quái phụ, hero bất tử: hai lần chụp cách nhau vài lần sửa code
// thì phải so được với nhau, nên không có gì trong đây được phép ngẫu nhiên.
function bench(seed) {
  const w = LAB.newWorld(seed || 20260901, { map: LAB.MAPS[0].id, wp: 'kiem', slots: [0, 1, 2] });
  w.hero.x = Math.round(LAB.WW * 0.5); w.hero.y = Math.round(LAB.WH * 0.5);
  w.foes.length = 0; w.tels.length = 0;
  w.spawnT = 1e9; w.kills = 0; w.boss = null; w.bossN = 0; w.god = true;
  LAB.snapCam(w);
  return w;
}
// Đi bằng input thật, không gán toạ độ: chỗ người chơi thực sự dừng lại là chỗ mọi phép kẹp cho
// phép, và trong phòng boss thì đúng cái đó là thứ cần xem.
function walkTo(w, x, y, lim) {
  const room0 = !!w.room;
  for (let i = 0; i < (lim || 900); i++) {
    const dx = x - w.hero.x, dy = y - w.hero.y, l = Math.hypot(dx, dy);
    if (l < 1.4 || !!w.room !== room0) break;   // tới chỗ, hoặc vừa đổi sàn giữa đường
    LAB.step(w, 1 / 60, { dx: dx / l, dy: dy / l, ax: x, ay: y });
  }
}
function hold(w, x, y, n) {
  for (let i = 0; i < n; i++) LAB.step(w, 1 / 60, { dx: 0, dy: 0, ax: x, ay: y });
}
// ---- tấm 1: trọn đường đi của một cánh cổng -------------------------------------------------
// Sáu ô, và sáu ô ấy là sáu câu người chơi phải đọc được mà không cần một chữ nào: cổng đang mở /
// cổng đứng chờ / mình đang bước vào / trận đấu bắt đầu / đây là tường phòng / đây là đường về.
const GV = { w: 176, h: 112, dy: -6, scale: 3 };
function shootGate() {
  const w = bench(), px = new Uint8ClampedArray(LAB.W * LAB.H * 4);
  const sheet = newSheet(GV, 6, 3);
  const shot = (cx, cy, slot) => { LAB.renderWorld(w, px); tile(sheet, px, GV, cx, cy, slot); };
  const notes = [];

  w.kills = LAB.BOSS_AT;
  LAB.bossGate(w);
  const g = w.gate;
  // 1. cú bung lúc mở: vành sáng còn đang nở, art mới sáng được một phần.
  hold(w, g.ex, g.ey, 10);
  shot(g.ex, g.my, 0); notes.push('mở (t=' + g.t.toFixed(2) + 's)');
  // 2. nở hết, đứng chờ.
  hold(w, g.ex, g.ey, 90);
  shot(g.ex, g.my, 1); notes.push('nở hết (t=' + g.t.toFixed(2) + 's)');
  // 3. đứng vào miệng, đồng hồ nửa giây đang chạy: cái vành tiến độ ở chân là thứ cần xem.
  walkTo(w, g.ex, g.ey);
  for (let i = 0; i < 40 && w.gate && w.gate.hold < LAB.GATE_HOLD * 0.62; i++) hold(w, g.ex, g.ey, 1);
  shot(g.ex, g.my, 2);
  notes.push('đứng vào (' + (w.gate ? w.gate.hold.toFixed(2) : LAB.GATE_HOLD) + '/' + LAB.GATE_HOLD + 's)');
  // 4. vào phòng. Không chụp ngay: khung đầu là một tấm trắng loá cố ý, và một tấm trắng thì không
  //    nói được gì về căn phòng phía sau nó. Chờ hẳn bốn giây còn vì `spawnBoss` cố tình đặt boss
  //    ngoài khung -- ở khung thứ 90 nó vẫn còn cách 133 px, tức là vẫn nằm trên mép trên. Tới lúc
  //    nó vào đúng khoảng cách nó muốn giữ (~102 px) thì cả hai mới cùng nằm trong một ô 176x112.
  for (let i = 0; i < 240 && !w.room; i++) hold(w, g.ex, g.ey, 1);
  const b = w.boss;
  for (let i = 0; i < 260; i++) LAB.step(w, 1 / 60, { dx: 0, dy: 0, ax: b.x, ay: b.y });
  shot((w.hero.x + b.x) / 2, (w.hero.y + b.y) / 2, 3);
  notes.push('vào phòng, ' + b.kind + ' cách ' +
             Math.round(Math.hypot(b.x - w.hero.x, b.y - w.hero.y)) + 'px');
  // 5. góc tường phòng: chỗ duy nhất thấy được cả hai mặt tường cùng lúc.
  walkTo(w, w.room.x0 - 40, w.room.y0 - 40);
  shot(w.hero.x + 34, w.hero.y + 22, 4);
  notes.push('góc phòng ' + Math.round(w.room.x1 - w.room.x0) + 'x' + Math.round(w.room.y1 - w.room.y0));
  // 6. boss chết, cổng về mở ở chỗ nó nằm xuống -- cùng hình, màu hổ phách.
  b.hp = 0; b.dying = 0.35;
  hold(w, w.hero.x, w.hero.y, 100);
  const go = w.gate;
  walkTo(w, go.ex + 30, go.ey + 14);
  hold(w, go.ex, go.ey, 30);
  shot(go.ex, go.my, 5); notes.push('cổng về (' + go.kind + ')');
  save('gate', sheet, notes.join(' | '));
}
// ---- tấm 2: bốn phẩm chất cạnh nhau ---------------------------------------------------------
// Bốn ô, cùng một khung, cùng một chỗ, cùng một hạt ngẫu nhiên -- chỉ khác đúng cái phẩm chất. Nên
// mọi chênh lệch nhìn thấy được trong tấm này là chênh lệch *cố ý*: cỡ quả sáng (ORB_P), cột sáng
// dựng lên của hai bậc trên, số cánh của tia loé, số hạt bay lên.
const OV = { w: 72, h: 72, dy: -4, scale: 5 };
function shootOrbs() {
  const R = LAB.GEAR_RARITY;
  const sheet = newSheet(OV, R.length, R.length);
  const px = new Uint8ClampedArray(LAB.W * LAB.H * 4);
  const notes = [];
  for (let i = 0; i < R.length; i++) {
    const w = bench(770001);
    const x = w.hero.x + 54, y = w.hero.y + 8;
    LAB.spawnOrb(w, LAB.rollGear(w.grng, 'armor', R[i].id), x, y);
    const o = w.orbs[0];
    // Đặt tay xuống mặt sàn thay vì chờ nó bay: đường bay dài ngắn theo rng, và bốn ô lệch pha
    // nhau vài khung thì cái đang so là bốn thời điểm khác nhau, không phải bốn phẩm chất.
    o.z = 0; o.vx = 0; o.vy = 0; o.vz = 0; o.x = x; o.y = y;
    o.land = LAB.ORB_WAIT + 0.01; o.t = 1;
    w.bag.length = 0;
    while (w.bag.length < LAB.BAG_MAX) w.bag.push(o.it);   // túi đầy: món ở lại để còn chụp được
    LAB.syncGear(w);
    w.t = 5.4;                                             // pha nhấp nháy chốt cứng cho cả bốn ô
    LAB.renderWorld(w, px);
    tile(sheet, px, OV, x, y, i);
    notes.push(R[i].name);
  }
  save('orbs', sheet, notes.join(' / ') + '  (cỡ ' + R.map(r => LAB.ORB_P[r.id]).join(' / ') + ')');
}

const args = process.argv.slice(2);
if (!args.length || args.includes('gate')) shootGate();
if (!args.length || args.includes('orbs')) shootOrbs();
