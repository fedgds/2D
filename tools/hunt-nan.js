// Tìm chỗ nhiễm NaN/Inf vào `buf`, không cần browser.
//
// Chạy: node tools/hunt-nan.js
//
// Vì sao cần một harness riêng cho việc này: một điểm ảnh NaN **không** ném lỗi ở đâu cả. `setPixS`
// trộn `buf*inv + col*k`, và `NaN*0 = NaN`, nên một điểm đã nhiễm không sơn lại được kể cả bằng một
// nét đục hoàn toàn; cả `resolve()` lẫn shader biến NaN thành 0. Kết quả là một khung đen (hoặc một
// vệt đen) mà mọi assert về hình học, damage và hoạt ảnh vẫn xanh.
//
// Nó không kiểm một con số nào. Nó chạy sim thật rồi hỏi đúng một câu sau mỗi khung: mọi phần tử
// của `buf` còn hữu hạn không. Chỗ nào không, nó *bisect* ngay tại khung đó -- xoá từng danh sách
// của world rồi vẽ lại -- để nói ra lớp nào là nguồn, thay vì để lại một câu "có NaN ở đâu đó".
const fs = require('fs'), vm = require('vm'), path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let src = '';
for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  const s = /\bsrc="([^"]+)"/.exec(m[1]);
  if (!s) { src += m[2] + '\n'; continue; }
  const p = path.join(root, s[1]);
  if (!fs.existsSync(p)) continue;
  src += fs.readFileSync(p, 'utf8') + '\n';
}
const ctx = { console, Math, Date, performance: { now: () => 0 } };
ctx.globalThis = ctx;
vm.runInNewContext('"use strict";\n' + src, ctx, { filename: 'index.html' });
const LAB = ctx.LAB;
if (!LAB) { console.log('index.html không xuất globalThis.LAB'); process.exit(1); }

const W = LAB.W, H = LAB.H, buf = LAB.buf, FLOOR = LAB.FLOOR;
let bad = 0;
function eq(name, got, want) {
  const ok = got === want;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + '  = ' + got + (ok ? '' : '  (cần ' + want + ')'));
}
function sec(s) { console.log('\n-- ' + s + ' --'); }

// Quét một mảng float: trả về mô tả chỗ hỏng đầu tiên, cộng số điểm hỏng. Cả NaN và ±Infinity đều
// tính là hỏng, vì tonemap biến Infinity thành NaN (`Inf * (1/Inf)`) rồi ra đúng màu đen ấy.
function scan(arr, wide) {
  let first = -1, n = 0, nan = 0, inf = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (Number.isFinite(v)) continue;
    if (first < 0) first = i;
    n++;
    if (Number.isNaN(v)) nan++; else inf++;
  }
  if (first < 0) return null;
  const px = (first / 3) | 0;
  return { n, nan, inf, i: first, x: px % (wide || W), y: (px / (wide || W)) | 0,
           frac: +(n / arr.length).toFixed(4) };
}
function say(r) {
  return r ? r.n + ' điểm (' + r.nan + ' NaN, ' + r.inf + ' Inf, ' + (r.frac * 100).toFixed(1)
             + '% khung), đầu tiên ở (' + r.x + ',' + r.y + ')'
           : 'sạch';
}

// Nguồn nào? Vẽ lại đúng khung đó nhiều lần, mỗi lần rút một lớp ra. Lớp nào rút đi mà khung sạch
// thì lớp đó là nguồn. Rút *một* lớp mỗi lần, không cộng dồn, nên hai nguồn cùng lúc vẫn lộ cả hai.
const LAYERS = ['tels', 'fxs', 'foes', 'orbs', 'nums', 'puffs', 'amb'];
function blame(w) {
  const out = [];
  const fl = scan(FLOOR);
  if (fl) out.push('FLOOR (sàn/camera): ' + say(fl));
  for (const k of LAYERS) {
    const keep = w[k];
    if (!keep || !keep.length) continue;
    w[k] = [];
    LAB.renderWorld(w, null);
    const r = scan(buf);
    w[k] = keep;
    if (!r) out.push('w.' + k + ' (' + keep.length + ' phần tử)');
  }
  // Không lớp nào một mình gánh: in ra ai đang có mặt để lần tay.
  if (!out.length) {
    const who = LAYERS.filter(k => w[k] && w[k].length).map(k => k + '=' + w[k].length);
    out.push('không lớp nào một mình; đang có: ' + (who.join(' ') || 'không gì cả')
             + ', room=' + (w.room ? 'có' : 'không') + ', flash=' + w.flash + ', danger=' + w.danger);
  }
  return out.join(' | ');
}
// Ai trong danh sách? Rút từng phần tử một khỏi lớp đã bị chỉ tên.
function blameOne(w, k, label) {
  const keep = w[k].slice();
  for (let i = 0; i < keep.length; i++) {
    w[k] = keep.filter((_, j) => j !== i);
    LAB.renderWorld(w, null);
    const r = scan(buf);
    w[k] = keep;
    if (!r) return label(keep[i], i);
  }
  return null;
}

LAB.applyMap(LAB.MAPS[0]);
function bench(seed, opt) {
  const w = LAB.newWorld(seed, Object.assign({ map: LAB.MAPS[0].id, wp: 'kiem', slots: [0, 1, 2] }, opt || {}));
  w.foes.length = 0; w.tels.length = 0;
  w.spawnT = 1e9; w.kills = 0; w.boss = null; w.bossN = 0;
  w.god = true;
  w.hero.x = Math.round(LAB.WW * 0.5); w.hero.y = Math.round(LAB.WH * 0.5);
  LAB.snapCam(w);
  return w;
}
function intoRoom(w) {
  w.kills = LAB.BOSS_AT * ((w.bossN || 0) + 1);
  LAB.bossGate(w);
  const g = w.gate;
  if (!g) return null;
  for (let i = 0; i < 60; i++) LAB.stepGate(w, LAB.GATE_OPEN / 40);
  for (let i = 0; i < 60 && !w.room; i++) {
    w.hero.x = g.ex; w.hero.y = g.ey;
    LAB.stepGate(w, LAB.GATE_HOLD / 20);
  }
  return w.room;
}

sec('camera không bao giờ chỉ ra ngoài map (sàn NaN bắt đầu ở đây)');
// `syncFloor` đọc `TID[(CAMY+y)*WW + CAMX+x]`. Một chỉ số ngoài mảng trả `undefined`, `TONE_F` của
// nó là `undefined`, và ghi cái đó vào một Float32Array ra NaN -- tức **cả** khung nhiễm cùng lúc,
// vì mỗi khung mở đầu bằng `buf.set(FLOOR)`. Nên đây là bất biến rẻ nhất phải giữ: hai đầu kẹp
// camera luôn nằm trong map, kể cả khi phòng boss thu chúng lại.
{
  const lim = { x0: 0, y0: 0, x1: LAB.WW - W, y1: LAB.WH - H };
  let out = 0, dirty = 0, rooms = 0;
  for (let s = 1; s <= 40; s++) {
    const w = bench(s * 7919);
    // Rải hero khắp sân trước khi mở cổng: phòng mọc quanh chỗ đứng, nên đây là cách duy nhất để
    // thử một phòng tì vào từng mép sân.
    const fx = (s % 8) / 7, fy = ((s * 3) % 8) / 7;
    w.hero.x = Math.round(LAB.BOUND.x0 + (LAB.BOUND.x1 - LAB.BOUND.x0) * fx);
    w.hero.y = Math.round(LAB.BOUND.y0 + (LAB.BOUND.y1 - LAB.BOUND.y0) * fy);
    LAB.snapCam(w);
    if (!intoRoom(w)) continue;
    rooms++;
    if (LAB.CAMB.x0 < lim.x0 || LAB.CAMB.x1 > lim.x1 ||
        LAB.CAMB.y0 < lim.y0 || LAB.CAMB.y1 > lim.y1) out++;
    // Và đi tì vào cả bốn mặt tường phòng: kẹp camera chỉ lộ ra khi có người đẩy vào nó.
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1]]) {
      for (let n = 0; n < 90; n++) LAB.step(w, 1 / 60, { dx, dy, ax: w.hero.x + 20, ay: w.hero.y });
      LAB.renderWorld(w, null);
      const c = LAB.cam();
      if (c.x < lim.x0 || c.x > lim.x1 || c.y < lim.y0 || c.y > lim.y1) out++;
      if (scan(FLOOR)) dirty++;
    }
  }
  eq('số phòng đã thử', rooms, 40);
  eq('camera/kẹp ra ngoài map', out, 0);
  eq('FLOOR nhiễm NaN', dirty, 0);
}

sec('setCam trả về số nguyên trong map, dù CAMB có gì trong đó');
// Mục trên đi qua đường thật (phòng boss → roomApply → camera tì vào mép). Mục này đánh thẳng vào
// bất biến, vì nó là chỗ duy nhất chặn được cả một lớp lỗi: `CAMB` là biến toàn cục mà `roomApply`
// viết lại mỗi tick từ hình chữ nhật của phòng, nên bất kỳ ai đổi ROOM_W, ROOM_PAD hay cách phòng
// mọc ra đều có thể nhét một cạnh lẻ vào đây. `setCam` phải chịu được, chứ không phải cầu cho đầu
// vào sạch: một `CAMY` lẻ là cả khung đen, không phải nửa điểm ảnh lệch.
{
  const keep = { x0: LAB.CAMB.x0, x1: LAB.CAMB.x1, y0: LAB.CAMB.y0, y1: LAB.CAMB.y1 };
  const NASTY = [954.7032587923552, 834.5854658862521, -12.5, 0.5, LAB.WW + 99, LAB.WH + 99,
                 NaN, Infinity, -Infinity];
  let notInt = 0, outside = 0, dirty = 0, off = 0, n = 0;
  for (const b0 of NASTY) for (const b1 of NASTY) {
    // Đặt cả hai đầu kẹp lệch, rồi đẩy camera ra ngoài cả hai phía để chắc chắn nó *bị* kẹp.
    LAB.CAMB.x0 = b0; LAB.CAMB.x1 = b1; LAB.CAMB.y0 = b0; LAB.CAMB.y1 = b1;
    for (const v of NASTY) {
      const y = b1 - 0.5;
      LAB.setCam(v, y); LAB.syncFloor(true);
      const c = LAB.cam();
      n++;
      if (!Number.isInteger(c.x) || !Number.isInteger(c.y)) notInt++;
      if (c.x < 0 || c.x > LAB.WW - W || c.y < 0 || c.y > LAB.WH - H) outside++;
      if (scan(FLOOR)) dirty++;
      // `camInt` là camera mà shell dùng để đổi chuột thành toạ độ thế giới. Lệch với camera đang
      // vẽ thì con trỏ ngắm vào một chỗ khác chỗ nhìn thấy, nên hai bên phải ra cùng một con số.
      const ci = LAB.camInt({ cam: { x: v, y: y } });
      if (ci.x !== c.x || ci.y !== c.y) off++;
    }
  }
  eq('số lần đã thử', n, 81 * 9);
  eq('CAMX/CAMY không nguyên', notInt, 0);
  eq('CAMX/CAMY ra ngoài map', outside, 0);
  eq('camInt lệch với camera đang vẽ', off, 0);
  eq('FLOOR nhiễm NaN', dirty, 0);
  LAB.CAMB.x0 = keep.x0; LAB.CAMB.x1 = keep.x1; LAB.CAMB.y0 = keep.y0; LAB.CAMB.y1 = keep.y1;
  LAB.setCam(0, 0);
}

sec('ba mươi giây đánh boss, mỗi khung một lần quét');
// Cái mà mọi mục hình học không thấy: một trận thật, vẽ *mỗi* khung, với hero vung vũ khí và niệm
// chiêu liên tục. Chín bộ (ba boss × ba vũ khí) và cả ba chiêu, vì nguồn nhiễm hay là chỗ hai lớp
// gặp nhau chứ không phải một lớp đứng một mình.
for (const k of LAB.BOSS_KINDS) {
  for (const wp of ['kiem', 'luoihai', 'cung']) {
    const w = bench(4242, { wp: wp, slots: [0, 1, 2] });
    intoRoom(w);
    if (w.boss) w.boss.dying = 0, w.foes.length = 0;
    w.boss = null;
    const f = LAB.spawnBoss(w, k);
    f.acd = 0.4;
    let firstBad = 0, r0 = null, why = '';
    for (let n = 1; n <= 1800; n++) {
      const a = n * 0.037;
      const inp = { dx: Math.cos(a), dy: Math.sin(a * 1.31), ax: f.x, ay: f.y };
      LAB.step(w, 1 / 60, inp);
      if (n % 7 === 0) LAB.swing(w, f.x, f.y);
      if (n % 23 === 0) LAB.cast(w, n % 3, f.x, f.y);
      if (n % 53 === 0) LAB.dash(w, Math.cos(a), Math.sin(a));
      LAB.renderWorld(w, null);
      const r = scan(buf);
      if (r && !firstBad) { firstBad = n; r0 = r; why = blame(w); }
    }
    eq(k + ' + ' + wp + ': khung nhiễm đầu tiên', firstBad, 0);
    if (firstBad) console.log('       ' + say(r0) + '\n       nguồn: ' + why);
  }
}

sec('từng chiêu boss một, trọn một cast');
for (const k of LAB.BOSS_KINDS) for (const key of LAB.KIND[k].abil) {
  const w = bench(4242);
  const f = LAB.unit(k, w.hero.x + 40, w.hero.y);
  f.frozen = 1e9; w.foes.push(f);
  w.tels.length = 0; f.frozen = 0; f.tel = null; f.chg = 0; f.rel = 0;
  if (!LAB.startCast(w, f, key)) { eq(key + ': cast được', false, true); continue; }
  const e = w.tels[w.tels.length - 1];
  if (LAB.FOE_ABIL[key].shape === 'echo')
    for (let i = 0; i < 12; i++) { w.hero.x += 9; e.st = 0; LAB.BOSS_SHAPE.echo.step(w, e, 0.1); }
  let firstBad = 0, r0 = null, why = '';
  for (let n = 1; n <= 400 && w.tels.indexOf(e) >= 0; n++) {
    LAB.stepTel(w, e, 1 / 60, w.tels.indexOf(e));
    LAB.renderWorld(w, null);
    const r = scan(buf);
    if (r && !firstBad) { firstBad = n; r0 = r; why = blame(w); }
  }
  eq(key + ': khung nhiễm đầu tiên', firstBad, 0);
  if (firstBad) console.log('       ' + say(r0) + '\n       nguồn: ' + why);
}

sec('từng chiêu hero và từng vũ khí');
// Một con quái thường làm bia, không phải boss: chiêu hero nào cũng cần một mục tiêu để hút/nổ vào,
// và `slime` là loại rẻ nhất có đủ máu để đứng yên chịu ba trăm khung.
for (let i = 0; i < LAB.SKILLS.length; i++) {
  const w = bench(1234, { slots: [i, i, i] });
  const f = LAB.unit('slime', w.hero.x + 30, w.hero.y);
  w.foes.push(f);
  w.hero.mp = 9999;
  LAB.cast(w, 0, f.x, f.y);
  let firstBad = 0, r0 = null, why = '';
  for (let n = 1; n <= 300; n++) {
    w.hero.mp = 9999;
    LAB.step(w, 1 / 60, { dx: 0, dy: 0, ax: f.x, ay: f.y });
    if (n % 40 === 0) LAB.cast(w, 0, f.x, f.y);
    LAB.renderWorld(w, null);
    const r = scan(buf);
    if (r && !firstBad) { firstBad = n; r0 = r; why = blame(w); }
  }
  eq(LAB.SKILLS[i].id + ': khung nhiễm đầu tiên', firstBad, 0);
  if (firstBad) console.log('       ' + say(r0) + '\n       nguồn: ' + why);
}
for (const wp of LAB.WEAPONS) {
  const w = bench(1234, { wp: wp.id });
  const f = LAB.unit('slime', w.hero.x + 26, w.hero.y);
  w.foes.push(f);
  let firstBad = 0, r0 = null, why = '';
  for (let n = 1; n <= 300; n++) {
    LAB.step(w, 1 / 60, { dx: 0, dy: 0, ax: f.x, ay: f.y });
    LAB.swing(w, f.x, f.y);
    LAB.renderWorld(w, null);
    const r = scan(buf);
    if (r && !firstBad) { firstBad = n; r0 = r; why = blame(w); }
  }
  eq(wp.id + ': khung nhiễm đầu tiên', firstBad, 0);
  if (firstBad) console.log('       ' + say(r0) + '\n       nguồn: ' + why);
}

console.log('\n' + (bad ? bad + ' chỗ chưa đạt' : 'tất cả đều đạt'));
process.exit(bad ? 1 : 0);
