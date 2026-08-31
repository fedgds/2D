"use strict";
// ===========================================================================
// Kiểm mana + trang bị + hành trang, không cần browser.
//
// Câu quan trọng nhất của cả file này là câu cuối: *không mặc gì thì mọi con số phải y như
// trước khi có trang bị*. Ba harness kia (check-maps, check-weapons, check-boss) chốt cứng
// hàng chục con số sát thương và máu, nên nếu một hệ số nào của trang bị không đúng bằng 1 ở
// mức 0 thì chúng vỡ -- và vỡ theo kiểu khó đọc, vì lỗi hiện ra ở một con số dmg chứ không ở
// chỗ gây ra nó. Ở đây thì hiện ra đúng chỗ.
//
// Nạp giống check-maps.js: đọc <script src> của index.html theo đúng thứ tự trong trang rồi
// nối lại, nên thêm một file js/ vào trang là tự nó vào đây.
// ===========================================================================
const fs = require('fs'), path = require('path'), vm = require('vm');
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

let bad = 0;
function eq(name, got, want) {
  const ok = got === want;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + '  = ' + got + (ok ? '' : '  (cần ' + want + ')'));
}
function near(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + '  = ' + got.toFixed(3) +
              (ok ? '' : '  (cần ' + want + ' ±' + tol + ')'));
}
// Một bộ trang bị dựng bằng tay, không qua rng: harness phải nói được "cộng đúng 40 HP", và
// một món rơi ngẫu nhiên thì không nói được câu nào có số.
function item(slot, rar, stats) {
  return { slot: slot, rar: rar, stats: stats.map(s => ({ id: s[0], v: s[1] })), seed: 1 };
}
const NO_FOE = w => { w.foes.length = 0; w.tels.length = 0; w.danger = 0; w.boss = null; };

// ---- 1. bảng dữ liệu: phẩm chất quyết định số dòng ----
console.log('\n-- bảng phẩm chất --');
eq('năm ô trang bị', LAB.GEAR_SLOTS.length, 5);
eq('bốn phẩm chất', LAB.GEAR_RARITY.length, 4);
eq('mười hai chỉ số', LAB.GEAR_STATS.length, 12);
// Đúng mười hai cái tên người dùng đặt ra, đúng thứ tự đó không quan trọng nhưng đủ mặt thì có.
for (const n of ['+ATK', '+HP', '+Mana', '+DEF', '+Magic ATK', '+Crit rate', '+Crit damage',
                 '+Attack Speed', '+Move Speed', '+HP Regen/5s', '+Mana Regen/5s', '+%Dodge'])
  eq('có chỉ số ' + n, LAB.GEAR_STATS.some(s => s.name === n), true);
for (const r of LAB.GEAR_RARITY) eq(r.id + ': màu nền', /^#[0-9a-f]{6}$/.test(r.col), true);
eq('common xanh lá', LAB.RARITY_BY_ID.common.col, '#3faa55');
eq('rare xanh dương', LAB.RARITY_BY_ID.rare.col, '#3b7ddd');
eq('epic tím', LAB.RARITY_BY_ID.epic.col, '#9a5cd0');
eq('legendary cam', LAB.RARITY_BY_ID.legendary.col, '#e8871e');

console.log('\n-- roll: số dòng và không trùng dòng --');
const want = { common: 1, rare: 2, epic: 3, legendary: 4 };
for (const rar in want) {
  let worstLines = 99, dup = 0, unk = 0;
  // 400 lần mỗi phẩm chất: đủ để một chỗ trùng dòng lộ ra, và pool chỉ có 12 phần tử.
  const rng = LAB.mulberry32(7);
  for (let k = 0; k < 400; k++) {
    const it = LAB.rollGear(rng, LAB.GEAR_SLOTS[k % 5].id, rar);
    worstLines = Math.min(worstLines, it.stats.length);
    const seen = new Set();
    for (const s of it.stats) {
      if (seen.has(s.id)) dup++;
      seen.add(s.id);
      if (!LAB.STAT_BY_ID[s.id] || !(s.v >= 1)) unk++;
    }
    if (it.stats.length !== want[rar]) worstLines = -1;
  }
  eq(rar + ': số dòng', worstLines, want[rar]);
  eq(rar + ': dòng trùng nhau', dup, 0);
  eq(rar + ': dòng lạ hoặc trị 0', unk, 0);
}
// Ảnh: đúng đường dẫn mà thư mục images/gear đang có, và file phải tồn tại thật -- một ô
// trang bị vẽ ra ảnh vỡ là thứ chỉ thấy được bằng mắt, nên kiểm ở đây.
console.log('\n-- ảnh 5 ô × 4 phẩm chất --');
let miss = 0;
for (const sl of LAB.GEAR_SLOTS) for (const r of LAB.GEAR_RARITY) {
  const p = LAB.gearIcon({ slot: sl.id, rar: r.id });
  if (!fs.existsSync(path.join(root, p))) { miss++; console.log('     thiếu ' + p); }
}
eq('đủ 20 file png', miss, 0);
eq('tên món', LAB.gearName(item('helmet', 'epic', [])), 'Mũ Sử Thi');
eq('dòng chỉ số phẳng', LAB.statText({ id: 'hp', v: 30 }), '+HP 30');
eq('dòng chỉ số phần trăm', LAB.statText({ id: 'crit', v: 5 }), '+Crit rate 5%');

// ---- 2. gearSum: không mặc gì thì mọi khoá đều là 0 ----
console.log('\n-- gộp chỉ số --');
const zero = LAB.gearSum(null);
let nonzero = 0;
for (const s of LAB.GEAR_STATS) if (zero[s.id] !== 0) nonzero++;
eq('không có gì: mọi khoá = 0', nonzero, 0);
eq('mọi khoá đều có mặt', Object.keys(zero).length, 12);
const twoSet = { helmet: item('helmet', 'rare', [['hp', 20], ['atk', 5]]),
                 armor: item('armor', 'epic', [['hp', 30], ['def', 7], ['dodge', 3]]),
                 gloves: null, pants: null, boots: null };
const sum = LAB.gearSum(twoSet);
eq('cộng dồn cùng một chỉ số', sum.hp, 50);
eq('chỉ số chỉ ở một món', sum.def, 7);
eq('chỉ số không ai có', sum.mpr, 0);

// ---- 3. mana: có cổng chặn, có trừ, có hồi ----
console.log('\n-- mana --');
const w0 = LAB.newWorld(11, { wp: 'kiem', slots: [0, 1, 2] });
NO_FOE(w0);
eq('bắt đầu đầy mana', w0.hero.mp, LAB.HERO_MP);
eq('maxmp = HERO_MP', w0.hero.maxmp, LAB.HERO_MP);
let noMp = 0;
for (const sk of LAB.SKILLS) if (!(sk.mp > 0)) noMp++;
eq('cả 16 skill đều có giá mana', noMp, 0);
const sk0 = LAB.SKILLS[w0.slots ? w0.slots[0] : 0];
const cost0 = LAB.SKILLS[0].mp;
eq('niệm được lúc đủ mana', LAB.cast(w0, 0, w0.hero.x + 40, w0.hero.y), true);
eq('trừ đúng giá', w0.hero.mp, LAB.HERO_MP - cost0);
// Cạn mana thì `cast` trả false *và không trừ gì*, và cũng không đặt cooldown: một chiêu bị
// từ chối vì hết mana rồi lại phải chờ hồi chiêu là mất lượt hai lần cho một lỗi.
w0.cds.fill(0);
w0.hero.mp = 0;
eq('hết mana thì không niệm', LAB.cast(w0, 0, w0.hero.x + 40, w0.hero.y), false);
eq('vẫn 0 mana', w0.hero.mp, 0);
eq('không vào hồi chiêu', w0.cds[0], 0);
// Hồi mana: MP_REGEN mỗi giây, không phụ thuộc trang bị.
for (let i = 0; i < 60; i++) LAB.step(w0, 1 / 60);
near('một giây hồi ~MP_REGEN', w0.hero.mp, LAB.MP_REGEN, 0.6);
// Đánh thường và lướt né *không* tốn mana: cả hai là thứ người chơi bấm liên tục, và một cú
// né bị mana từ chối là chết vì một con số không hiện ở đâu cả.
const mpWas = w0.hero.mp;
w0.hero.mp = 0;
w0.dcd = 0;
eq('lướt né không cần mana', LAB.dash(w0, 1, 0), true);
eq('lướt né không trừ mana', w0.hero.mp, 0);
w0.hero.mp = mpWas;

// ---- 4. mặc / tháo / bỏ ----
console.log('\n-- hành trang --');
const w = LAB.newWorld(12, { wp: 'kiem', slots: [0, 1, 2] });
NO_FOE(w);
eq('túi rỗng lúc mở trận', w.bag.length, 0);
eq('không mặc gì lúc mở trận', LAB.GEAR_SLOTS.filter(s => w.equip[s.id]).length, 0);
const hp0 = w.hero.hp;
w.bag.push(item('helmet', 'rare', [['hp', 40], ['atk', 10]]));
eq('mặc được', LAB.equipGear(w, 0), true);
eq('món đã rời túi', w.bag.length, 0);
eq('maxhp cộng thêm', w.hero.maxhp, LAB.HERO_HP + 40);
// Cộng máu tối đa thì *cộng luôn máu hiện tại*: mặc một cái mũ +40 HP mà thanh máu tụt xuống
// 40 HP so với tối đa là phần thưởng đọc ra thành hình phạt.
eq('máu hiện tại cộng theo', w.hero.hp, hp0 + 40);
eq('gs.atk theo món đang mặc', w.gs.atk, 10);
eq('tháo được', LAB.unequipGear(w, 'helmet'), true);
eq('món về túi', w.bag.length, 1);
eq('maxhp trở lại', w.hero.maxhp, LAB.HERO_HP);
eq('máu hiện tại trở lại', w.hero.hp, hp0);
eq('gs về 0', w.gs.atk, 0);
// Tháo vào một cái túi đầy thì từ chối, chứ không xoá món đang mặc.
w.equip.helmet = w.bag.pop();
while (w.bag.length < LAB.BAG_MAX) w.bag.push(item('boots', 'common', [['hp', 1]]));
LAB.syncGear(w);
eq('túi đầy: không tháo', LAB.unequipGear(w, 'helmet'), false);
eq('món vẫn còn trên người', !!w.equip.helmet, true);
// Túi đầy thì món **vẫn rơi ra** -- nó chỉ nằm lại trên sàn. Đây là luật đã đổi: bản trước nuốt
// luôn món, thứ khiến một con boss đánh mãi mới chết có thể không cho gì mà không nói một chữ.
const fullDrop = LAB.dropLoot(w, true);
eq('túi đầy: vẫn rơi ra', !!fullDrop, true);
eq('túi đầy: món nằm trên sàn', w.orbs.length, 1);
eq('túi đầy: túi không dài thêm', w.bag.length, LAB.BAG_MAX);
w.orbs.length = 0;
eq('bỏ được một món', LAB.trashGear(w, 0), true);
eq('túi ngắn đi một', w.bag.length, LAB.BAG_MAX - 1);
eq('bỏ ô rỗng thì từ chối', LAB.trashGear(w, 99), false);
// Mặc một món cùng ô thì món cũ về túi: một vào một ra, nên không bao giờ tràn.
w.bag.length = 0;
w.bag.push(item('helmet', 'epic', [['hp', 5]]));
const wornWas = w.equip.helmet;
eq('đổi món cùng ô', LAB.equipGear(w, 0), true);
eq('món cũ về túi', w.bag[0], wornWas);
eq('món mới lên người', w.equip.helmet.rar, 'epic');

// ---- 5. rơi đồ ----
console.log('\n-- rơi đồ --');
const wd = LAB.newWorld(13, { wp: 'kiem', slots: [0, 1, 2] });
NO_FOE(wd);
let got = 0;
// `orbs.length = 0` mỗi vòng cũng vì lý do như `bag.length = 0`: mục này đo *tỉ lệ rơi*, và trần
// ORB_MAX = 32 món trên sàn sẽ chặn từ vòng thứ 33 nếu không dọn -- rồi tỉ lệ đo được là 16%
// của một cái trần, không phải của GEAR_DROP.
for (let k = 0; k < 200; k++) {
  if (LAB.dropLoot(wd, false)) got++;
  wd.bag.length = 0; wd.orbs.length = 0;
}
// 200 lần ở tỉ lệ 15% thì kỳ vọng 30. Ngưỡng rộng vì đây là kiểm "có rơi và không rơi tràn",
// không phải kiểm phân phối của mulberry32.
eq('quái thường có rơi', got > 8, true);
eq('quái thường không rơi mọi lần', got < 90, true);
eq('đếm loot bằng số lần rơi', wd.loot, got);
// `newGear` là badge "MÓN MỚI" của bảng trang bị, và nó đếm *món vào túi*, không đếm món rơi ra.
// Từ khi món nằm trên sàn thì hai con số ấy tách nhau: rơi ra mà chưa nhặt thì chưa có gì mới.
eq('rơi ra thì chưa tính là món mới', wd.newGear, 0);
const wb = LAB.newWorld(14, { wp: 'kiem', slots: [0, 1, 2] });
NO_FOE(wb);
let bossDrops = 0, legend = 0, plain = 0;
for (let k = 0; k < 200; k++) {
  const it = LAB.dropLoot(wb, true);
  if (it) { bossDrops++; if (it.rar === 'legendary') legend++; if (it.rar === 'common') plain++; }
  wb.bag.length = 0; wb.orbs.length = 0;
}
eq('boss rơi mọi lần', bossDrops, 200);
eq('boss có ra huyền thoại', legend > 0, true);
eq('boss vẫn ra được hàng thường', plain > 0, true);
eq('boss ra hàng tốt hơn quái thường', legend > 200 * 0.03, true);
// `w.grng` là dòng riêng: gieo cùng một seed thì hai world rơi cùng một chuỗi, và số lần
// `w.rng` được gọi không đổi chuỗi đó.
const a1 = LAB.newWorld(99), a2 = LAB.newWorld(99);
NO_FOE(a1); NO_FOE(a2);
for (let k = 0; k < 50; k++) a1.rng();
const d1 = [], d2 = [];
for (let k = 0; k < 20; k++) {
  const x = LAB.dropLoot(a1, true), y = LAB.dropLoot(a2, true);
  a1.bag.length = 0; a2.bag.length = 0;
  a1.orbs.length = 0; a2.orbs.length = 0;
  d1.push(x.slot + x.rar); d2.push(y.slot + y.rar);
}
eq('loot không phụ thuộc dòng sim', d1.join(','), d2.join(','));

// ---- 5b. món nằm trên sàn: bật ra khỏi xác, đáp xuống, đi tới thì tự vào túi ----
console.log('\n-- món trên sàn --');
// Đây là chỗ đầu tiên trong cả hệ trang bị mà một món *tồn tại ngoài túi*, nên nó là chỗ đầu tiên
// có những câu chỉ kiểm được bằng cách bước sim: "rơi ra rồi đi tới thì nhặt được", "túi đầy thì
// món ở lại chứ không bốc hơi", "món bay không bốc một con số nào của dòng sim". Ba câu ấy là ba
// lời hứa nếu chỉ đọc code, và là ba phép đo ở đây.
function floorW(seed) {
  const t = LAB.newWorld(seed, { wp: 'kiem', slots: [0, 1, 2] });
  NO_FOE(t);
  return t;
}
// Dọn quái mỗi khung: `step` tự đẩy đợt mới khi sân trống, và một con quái đi ngang qua món thì
// mọi phép đo khoảng cách ở dưới thành một phép đo khác.
function fstep(t, n, inp) {
  for (let i = 0; i < n; i++) { NO_FOE(t); LAB.step(t, 1 / 60, inp); }
}
const wo = floorW(71);
const drop = LAB.dropLoot(wo, true, wo.hero.x + 220, wo.hero.y + 40);
eq('rơi một món thì có một món trên sàn', wo.orbs.length, 1);
eq('món trên sàn đúng là món vừa bốc', wo.orbs[0].it, drop);
eq('mang theo phẩm chất của nó', wo.orbs[0].rar, drop.rar);
eq('bật ra từ chỗ con quái', Math.round(wo.orbs[0].sx), Math.round(wo.hero.x + 220));
eq('bắt đầu ở trên không', wo.orbs[0].z > 0, true);
eq('chưa đáp', wo.orbs[0].land, 0);
// Đường bay: lên cao hơn chỗ bật ra, rồi về đúng mặt sàn, và không bao giờ ra ngoài sân -- một món
// nằm ngoài BOUND là một món không đi tới được.
let flew = 0, top = 0;
while (wo.orbs.length && wo.orbs[0].land <= 0 && flew < 300) {
  top = Math.max(top, wo.orbs[0].z);
  fstep(wo, 1); flew++;
}
const orb = wo.orbs[0];
eq('có bay lên', top > 7, true);
eq('rồi đáp xuống mặt sàn', orb.z, 0);
eq('đáp trong vòng hai giây', flew > 4 && flew < 120, true);
eq('đã đánh dấu là đã đáp', orb.land > 0, true);
eq('không bay ra ngoài sân',
   orb.x >= LAB.BOUND.x0 && orb.x <= LAB.BOUND.x1 &&
   orb.y >= LAB.BOUND.y0 && orb.y <= LAB.BOUND.y1, true);
eq('nảy nhiều nhất một lần', orb.bounce <= 1, true);
// Khoảng chờ sau khi đáp. Đặt tay một món vừa đáp đúng dưới chân nhân vật: nếu không có
// `ORB_WAIT` thì một món rơi ngay chỗ mình đứng biến vào túi trước khi vẽ được một khung, và cả
// cái hiệu ứng lấp lánh -- thứ duy nhất người chơi yêu cầu -- chưa từng xuất hiện trên màn hình.
function land(t, o, x, y, waited) {
  o.z = 0; o.vx = 0; o.vy = 0; o.vz = 0;
  o.land = waited ? LAB.ORB_WAIT + 0.01 : 1e-4;
  o.x = x; o.y = y;
}
const ww = floorW(72);
LAB.dropLoot(ww, true, ww.hero.x, ww.hero.y);
const o2 = ww.orbs[0], it2 = o2.it;
land(ww, o2, ww.hero.x, ww.hero.y - 5, false);
fstep(ww, 6);                                    // 0,10 giây: ngắn hơn ORB_WAIT
eq('vừa đáp thì chưa nhặt', ww.orbs.length, 1);
eq('và túi vẫn rỗng', ww.bag.length, 0);
fstep(ww, 12);                                   // qua mốc 0,22 giây
eq('quá khoảng chờ thì vào túi', ww.orbs.length, 0);
eq('túi có đúng món đã rơi', ww.bag[0], it2);
eq('badge MÓN MỚI nhảy lúc nhặt, không lúc rơi', ww.newGear, 1);
eq('có cú nháy sáng ở người nhân vật', ww.got > 0, true);
eq('cú nháy mang màu phẩm chất của món', ww.gotR, it2.rar);
// Và cú nháy ấy tự tắt: nó là một cái đồng hồ đếm ngược, không phải một trạng thái.
fstep(ww, 40);
eq('cú nháy tắt sau non nửa giây', ww.got, 0);
// Câu người chơi nói ra: "người trời di chuyển đến thì tự động nhặt". Món nằm ngoài tầm hút, nhân
// vật đi tới -- không bấm gì thêm.
const wk = floorW(75);
LAB.dropLoot(wk, true, wk.hero.x + 60, wk.hero.y);
land(wk, wk.orbs[0], wk.hero.x + 60, wk.hero.y - 5, true);
const kIt = wk.orbs[0].it;
fstep(wk, 10, { dx: 0, dy: 0, ax: wk.hero.x + 40, ay: wk.hero.y });
eq('đứng yên ngoài tầm thì không nhặt được', wk.orbs.length, 1);
eq('và không bị hút', wk.orbs[0].pull, 0);
fstep(wk, 180, { dx: 1, dy: 0, ax: wk.hero.x + 40, ay: wk.hero.y });
eq('đi tới chỗ món thì tự nhặt', wk.bag.length, 1);
eq('đúng món đó', wk.bag[0], kIt);
eq('sàn sạch', wk.orbs.length, 0);
// Hút, không phải chạm. Bán kính hút rộng gấp gần bốn bán kính nhặt, nên "đi *gần*" là đủ: người
// chơi đang nhìn con quái tiếp theo, không nhìn xuống chân mình.
eq('tầm hút rộng hơn tầm nhặt', LAB.ORB_MAG > LAB.ORB_TAKE * 2, true);
const wm = floorW(73);
LAB.dropLoot(wm, true, wm.hero.x, wm.hero.y);
land(wm, wm.orbs[0], wm.hero.x + LAB.ORB_MAG - 2, wm.hero.y - 5, true);
const dm0 = wm.orbs[0].x - wm.hero.x;
fstep(wm, 8, { dx: 0, dy: 0, ax: wm.hero.x + 40, ay: wm.hero.y });
eq('vào tầm thì bắt đầu bị hút', wm.orbs.length && wm.orbs[0].pull > 0, true);
eq('và món lại gần hơn', wm.orbs[0].x - wm.hero.x < dm0, true);
// `pull` lên dần, nên món *không* giật một cái vào người ở đúng khung vừa vào tầm.
eq('không giật ngay vào người', wm.orbs.length, 1);
fstep(wm, 90, { dx: 0, dy: 0, ax: wm.hero.x + 40, ay: wm.hero.y });
eq('đứng yên thì món tự bay tới', wm.bag.length, 1);
// Túi đầy: món **ở lại nguyên chỗ đó**. Đường còn lại là lặng lẽ xoá một món Huyền Thoại của
// người chơi, và đó là thứ tệ hơn hẳn một cái sàn đầy đồ.
const wfull = floorW(74);
LAB.dropLoot(wfull, true, wfull.hero.x, wfull.hero.y);
land(wfull, wfull.orbs[0], wfull.hero.x, wfull.hero.y - 5, true);
while (wfull.bag.length < LAB.BAG_MAX) wfull.bag.push(item('boots', 'common', [['hp', 1]]));
LAB.syncGear(wfull);
const fpos = Math.round(wfull.orbs[0].x * 100) + '/' + Math.round(wfull.orbs[0].y * 100);
fstep(wfull, 120, { dx: 0, dy: 0, ax: wfull.hero.x + 40, ay: wfull.hero.y });
eq('túi đầy: món vẫn nằm trên sàn', wfull.orbs.length, 1);
eq('túi đầy: món không nhích đi đâu',
   Math.round(wfull.orbs[0].x * 100) + '/' + Math.round(wfull.orbs[0].y * 100), fpos);
eq('túi đầy: không bị hút', wfull.orbs[0].pull, 0);
eq('túi đầy: không có món nào chen vào túi', wfull.bag.length, LAB.BAG_MAX);
// Dọn một chỗ trong túi thì đúng món đang chờ ấy vào ngay.
LAB.trashGear(wfull, 0);
fstep(wfull, 60, { dx: 0, dy: 0, ax: wfull.hero.x + 40, ay: wfull.hero.y });
eq('dọn túi thì món đang chờ vào ngay', wfull.orbs.length, 0);
eq('và túi lại đầy', wfull.bag.length, LAB.BAG_MAX);
// Trần số món trên sàn. Cái chặn thật của `dropLoot` bây giờ là ORB_MAX, không phải BAG_MAX.
const wcap = floorW(76);
let capped = 0;
for (let k = 0; k < LAB.ORB_MAX + 25; k++) if (LAB.dropLoot(wcap, true)) capped++;
eq('sàn không quá ORB_MAX món', wcap.orbs.length, LAB.ORB_MAX);
eq('quá trần thì dropLoot trả null', capped, LAB.ORB_MAX);
// Đường bay bốc trên `w.grng`, cùng dòng đã bốc ra chính món ấy: hai trận cùng seed thì món rơi ở
// cùng chỗ và bay cùng đường, mà số hạt bụi một khung sinh ra vẫn không đổi được gì.
function orbSig(t) {
  return t.orbs.map(o => [Math.round(o.x * 1000), Math.round(o.y * 1000),
                          Math.round(o.z * 1000), o.rar].join(':')).join('/');
}
const s1 = floorW(88), s2 = floorW(88);
for (let k = 0; k < 40; k++) s1.rng();
for (let k = 0; k < 17; k++) s1.crng();
LAB.dropLoot(s1, true, 400, 400);
LAB.dropLoot(s2, true, 400, 400);
fstep(s1, 40); fstep(s2, 40);
eq('có một món để so', s1.orbs.length, 1);
eq('cùng seed thì món bay đúng cùng một đường', orbSig(s1), orbSig(s2));
// Và chiều ngược lại: món *bay* không bốc một con số nào của dòng nào cả. Nếu nó bốc, thì số món
// đang nằm trên sàn sẽ đổi mọi con số sát thương phía sau, và một trận có rơi đồ không lặp lại được.
function spy(fn, hit) {
  const f = function () { hit(); return fn.apply(null, arguments); };
  f.range = (a, b) => { hit(); return fn.range(a, b); };
  f.int = (a, b) => { hit(); return fn.int(a, b); };
  f.pick = a => { hit(); return fn.pick(a); };
  return f;
}
const wn = floorW(77);
for (let k = 0; k < 8; k++) LAB.dropLoot(wn, true, wn.hero.x + 200 + k * 9, wn.hero.y + 80);
eq('tám món trên sàn', wn.orbs.length, 8);
let nR = 0, nG = 0, nC = 0;
wn.rng = spy(wn.rng, () => nR++);
wn.grng = spy(wn.grng, () => nG++);
wn.crng = spy(wn.crng, () => nC++);
for (let i = 0; i < 120; i++)
  for (let j = wn.orbs.length - 1; j >= 0; j--) LAB.stepOrb(wn, wn.orbs[j], 1 / 60, j);
eq('hai giây bay không bốc số của dòng sim', nR, 0);
eq('cũng không bốc của dòng loot', nG, 0);
eq('cũng không bốc của dòng trang trí', nC, 0);
eq('tám món vẫn ở đó (ngoài tầm hút)', wn.orbs.length, 8);
// Bốn màu người chơi gọi tên -- xanh lá, xanh dương, tím, cam -- phải đúng là bốn màu của bảng
// trang bị. Một vệt sáng bay ra khỏi xác con quái mà lệch màu với cái khung trong túi thì người
// chơi học được một quy tắc sai, rồi bỏ qua đúng món đáng nhặt.
const hex3 = s => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255,
                   parseInt(s.slice(5, 7), 16) / 255].join(',');
for (const r of LAB.GEAR_RARITY) {
  const C = LAB.ORB_C[r.id];
  eq(r.id + ': có màu tia sáng', !!C, true);
  if (!C) continue;
  eq(r.id + ': tia sáng đúng màu phẩm chất', C.c.join(','), hex3(r.col));
  eq(r.id + ': tâm sáng là bậc sáng nhất của giáp', C.h.join(','), hex3(LAB.dollRamp(r.id)['4']));
}
eq('bốn phẩm chất ra bốn màu khác nhau',
   new Set(LAB.GEAR_RARITY.map(r => LAB.ORB_C[r.id].c.join(','))).size, 4);
// Nhịp nhô lên hạ xuống của một món đã nằm im sống **chỉ trong render**. `o.y` là chỗ đứng -- cái
// mà bóng và thứ tự vẽ đọc -- nên nếu nhịp ấy nằm trong sim thì món sẽ tự trồi ra trước rồi lại
// lùi ra sau con quái đứng cạnh, mỗi nửa giây một lần.
const wy = floorW(78);
LAB.dropLoot(wy, true, wy.hero.x + 300, wy.hero.y + 60);
const oy = wy.orbs[0];
land(wy, oy, wy.hero.x + 300, wy.hero.y + 60, true);
const ySim = oy.y, bob = new Set();
for (let k = 0; k < 40; k++) { wy.t = k * 0.05; bob.add(Math.round(LAB.orbY(wy, oy) * 100)); }
eq('món nằm im vẫn nhấp nhô lúc vẽ', bob.size > 8, true);
eq('mà chỗ đứng trong sim không đổi', oy.y, ySim);
eq('nhịp nhô không quá 3 px', Math.max(...bob) - Math.min(...bob) < 300, true);
// Vẽ được. Ba hàm vẽ mới (vũng sáng dưới sàn, quả sáng, cú nháy lúc nhặt) là ba nhánh mới trong
// renderWorld, nên phải có ai chạy đủ cả ba.
const wr1 = floorW(81), wr2 = floorW(81);
for (const t of [wr1, wr2]) {
  while (t.bag.length < LAB.BAG_MAX) t.bag.push(item('boots', 'common', [['hp', 1]]));
  LAB.syncGear(t);
  for (let k = 0; k < 6; k++) LAB.dropLoot(t, true, t.hero.x + 26 + k * 9, t.hero.y + 14);
  fstep(t, 45);
}
eq('sáu món đáp xuống và ở lại (túi đầy)', wr1.orbs.length, 6);
function litFrame(t) {
  const p = new Uint8ClampedArray(LAB.W * LAB.H * 4);
  LAB.renderWorld(t, p);
  let n = 0;
  for (let i = 0; i < p.length; i += 4) if (p[i] + p[i + 1] + p[i + 2] > 150) n++;
  return n;
}
let orbErr = 'không', litWith = 0, litNone = 0;
try {
  litWith = litFrame(wr1);
  wr2.orbs.length = 0;                 // đúng cùng một khung, chỉ khác chỗ có món hay không
  litNone = litFrame(wr2);
} catch (e) { orbErr = String(e && e.message || e); }
eq('vẽ được khung có món trên sàn', orbErr, 'không');
// Hai world cùng seed, bước cùng số khung, nên phần trang trí của hai khung y hệt nhau: chênh lệch
// còn lại đúng là ánh sáng của sáu món. Một cái "vẽ được" mà không sáng gì là lỗi mắt bỏ qua.
eq('món trên sàn sáng thật trên buffer', litWith > litNone + 30, true);
let gotErr = 'không';
try {
  wr1.got = 0.3; wr1.gotR = 'legendary';
  LAB.renderWorld(wr1, new Uint8ClampedArray(LAB.W * LAB.H * 4));
} catch (e) { gotErr = String(e && e.message || e); }
eq('vẽ được cú nháy lúc nhặt', gotErr, 'không');

// ---- 5b. tím và cam phải nổi hơn xanh, đo trên buffer ----
console.log('\n-- phẩm chất cao nổi hơn hẳn --');
// Bốn màu đã đúng, nhưng màu chỉ đọc được khi người chơi *đã* nhìn vào món. Câu cần kiểm ở đây khác:
// một món Sử Thi hay Huyền Thoại phải chiếm nhiều ánh sáng hơn hẳn một món Thường, đủ để bắt mắt
// người đang nhìn chỗ khác. Đó là một con số trên buffer, không phải một ý định trong code -- nên nó
// đo bằng cách vẽ hai khung y hệt nhau, một khung có món và một khung không, rồi trừ nhau. Phần chênh
// lệch đúng là ánh sáng của một món, không lẫn sàn, không lẫn thời tiết.
//
// Đo trên nhiều pha thời gian rồi cộng lại: tần số nhấp nháy đổi theo phẩm chất, nên một khung đơn lẻ
// có thể bắt đúng lúc món Huyền Thoại đang ở đáy nhịp và món Thường đang ở đỉnh.
const PH = 24;
function prom(rarId) {
  const a = floorW(91), b = floorW(91);
  // Gọi spawnOrb ở cả hai world để hai dòng rng đi cùng nhịp, rồi mới dọn ở world đối chứng: hai
  // khung chỉ còn khác nhau đúng một thứ.
  for (const t of [a, b]) {
    LAB.spawnOrb(t, item('armor', rarId, [['hp', 10]]), t.hero.x + 62, t.hero.y + 18);
    land(t, t.orbs[0], t.hero.x + 62, t.hero.y + 18, true);
    t.orbs[0].t = 1;
  }
  const oy0 = a.orbs[0].y;
  b.orbs.length = 0;
  const pa = new Uint8ClampedArray(LAB.W * LAB.H * 4), pb = new Uint8ClampedArray(LAB.W * LAB.H * 4);
  let lit = 0, sum = 0, top = LAB.H;
  for (let k = 0; k < PH; k++) {
    a.t = b.t = 4 + k * 0.037;
    LAB.renderWorld(a, pa); LAB.renderWorld(b, pb);
    for (let i = 0, n = pa.length; i < n; i += 4) {
      const d = (pa[i] - pb[i]) + (pa[i + 1] - pb[i + 1]) + (pa[i + 2] - pb[i + 2]);
      if (d <= 0) continue;
      sum += d;
      if (d > 24) lit++;
      // Tầm với lên trên đo ở ngưỡng thấp hơn hẳn: cột sáng của hai bậc cao là một vệt mờ cố ý --
      // nó để nhìn thấy từ xa, không để chiếm chỗ -- nên đo nó bằng ngưỡng của quả sáng thì không
      // thấy gì. Món nằm cùng một chỗ trong cả bốn phép đo, nên số hàng này so trực tiếp được.
      if (d > 5) { const y = ((i >> 2) / LAB.W) | 0; if (y < top) top = y; }
    }
  }
  return { lit: lit / PH, sum: sum / PH, top: top, oy: oy0 };
}
const P = {};
for (const r of LAB.GEAR_RARITY) P[r.id] = prom(r.id);
const TOP0 = P.common.top;
for (const r of LAB.GEAR_RARITY) {
  const q = P[r.id];
  eq(r.id + ': có sáng lên thật', q.lit > 8, true);
  console.log('     ' + r.id + ': ' + Math.round(q.lit) + ' điểm sáng, tổng ' +
              Math.round(q.sum) + ', vươn lên cao hơn Thường ' + (TOP0 - q.top) + ' px');
}
// Bảng nhân cỡ phải tăng đều theo bậc, và cái đó là nguồn của mọi con số ở trên: nếu ai đó sửa
// ORB_P cho một bậc tụt xuống thì mọi phép đo dưới đây vẫn "đạt" ở một thế giới sai.
const PORD = LAB.GEAR_RARITY.map(r => LAB.ORB_P[r.id]);
eq('bảng cỡ tăng đều theo bậc', PORD.every((v, i) => i === 0 || v > PORD[i - 1]), true);
eq('bậc thấp nhất không to hơn 1', PORD[0] <= 1, true);
// Ba mốc, và cả ba đều là câu người chơi nói: "đồ tím với đồ cam thì hiệu ứng rõ hơn đồ xanh".
// Rõ hơn nghĩa là *rõ hơn hẳn*, nên mốc là một tỷ lệ chứ không phải một dấu lớn hơn.
eq('Hiếm sáng hơn Thường', P.rare.lit > P.common.lit, true);
eq('Sử Thi rộng hơn Hiếm ít nhất 1,25 lần', P.epic.lit > P.rare.lit * 1.25, true);
eq('Huyền Thoại rộng hơn Sử Thi ít nhất 1,1 lần', P.legendary.lit > P.epic.lit * 1.1, true);
eq('Sử Thi sáng hơn Thường ít nhất 1,6 lần', P.epic.sum > P.common.sum * 1.6, true);
eq('Huyền Thoại sáng hơn Thường ít nhất 2,2 lần', P.legendary.sum > P.common.sum * 2.2, true);
// Và cột sáng dựng lên: chỉ hai bậc cao có nó, và nó là thứ nhìn thấy được từ ngoài rìa khung hình
// khi quả sáng còn bị một cái cột đá che.
eq('cột sáng của Sử Thi vươn cao hơn quầng của Hiếm', P.rare.top - P.epic.top >= 4, true);
eq('cột sáng của Huyền Thoại vươn cao nhất', P.legendary.top <= P.epic.top, true);

// ---- 6. mười hai chỉ số có tác dụng thật ----
console.log('\n-- chỉ số ăn vào sim --');
// Một hàm dựng world sạch: một con quái đúng chỗ, không quái khác, không cảnh báo.
function arena(gear) {
  const t = LAB.newWorld(21, { wp: 'kiem', slots: [0, 1, 2] });
  NO_FOE(t);
  // Không dao động: mục này đo *hệ số*, và một con số nhân thêm ±15% thì không đo được hệ số nào.
  // Bề rộng của khoảng dao động có mục riêng ở dưới.
  t.vary = 0;
  // Chí mạng nền của nhân vật cũng phải tắt, cùng một lý do và mạnh hơn: 15% nghĩa là cứ bảy phép
  // đo có một phép trả về con số nhân 1.5, nên một mục đo hệ số trang bị sẽ *thỉnh thoảng* đỏ.
  // Phần chí mạng nền có mục riêng ở dưới, đo bằng số lần quay chứ bằng một cú đánh.
  t.crit = 0; t.critd = 0;
  if (gear) { for (const k in gear) t.equip[k] = gear[k]; LAB.syncGear(t); }
  const f = LAB.unit('brute', t.hero.x + 20, t.hero.y);
  f.maxhp = f.hp = 100000;
  t.foes.push(f);
  return { w: t, f: f };
}
// +ATK chỉ ăn vào đòn vũ khí, +Magic ATK chỉ ăn vào chiêu, và cả hai là **số phẳng**: cộng
// thẳng vào cú đánh, không nhân phần trăm. Kiểm bằng cách gọi `hurt` hai lần với đúng cùng một
// con số, một lần đánh dấu phys và một lần không.
const base = arena(null);
LAB.hurt(base.w, base.f, 100, '#fff', false, 0, 0, true);
const dmgPlain = base.w.dmg;
eq('nền không trang bị đúng bằng số gọi vào', dmgPlain, 100);
const atkOnly = arena({ gloves: item('gloves', 'rare', [['atk', 25]]) });
LAB.hurt(atkOnly.w, atkOnly.f, 100, '#fff', false, 0, 0, true);
eq('+ATK 25 cộng phẳng vào đòn vũ khí', atkOnly.w.dmg, dmgPlain + 25);
LAB.hurt(atkOnly.w, atkOnly.f, 100, '#fff', false, 0, 0, false);
eq('+ATK không vào chiêu', atkOnly.w.dmg - (dmgPlain + 25), dmgPlain);
const magOnly = arena({ gloves: item('gloves', 'rare', [['mag', 50]]) });
LAB.hurt(magOnly.w, magOnly.f, 100, '#fff', false, 0, 0, false);
eq('+Magic ATK 50 cộng phẳng vào chiêu', magOnly.w.dmg, dmgPlain + 50);
LAB.hurt(magOnly.w, magOnly.f, 100, '#fff', false, 0, 0, true);
eq('+Magic ATK không vào đòn vũ khí', magOnly.w.dmg - (dmgPlain + 50), dmgPlain);
// Cộng phẳng thì *không* phụ thuộc cú đánh to hay nhỏ: đó là toàn bộ khác biệt so với bản %
// trước đó, và là câu duy nhất phân biệt được hai cách tính bằng một phép đo.
const flat = arena({ gloves: item('gloves', 'epic', [['mag', 30]]) });
LAB.hurt(flat.w, flat.f, 40, '#fff', false, 0, 0, false);
eq('cú 40 → 70', flat.w.dmg, 70);
LAB.hurt(flat.w, flat.f, 400, '#fff', false, 0, 0, false);
eq('cú 400 → 430, cộng đúng bấy nhiêu', flat.w.dmg - 70, 430);
// Hai stat này không được mang cờ pct, nếu không bảng chỉ số in ra dấu %.
eq('+ATK không phải phần trăm', !LAB.STAT_BY_ID.atk.pct, true);
eq('+Magic ATK không phải phần trăm', !LAB.STAT_BY_ID.mag.pct, true);
eq('dòng chỉ số +ATK in ra số trơn', LAB.statText({ id: 'atk', v: 7 }), '+ATK 7');
eq('dòng chỉ số +Magic ATK in ra số trơn', LAB.statText({ id: 'mag', v: 18 }), '+Magic ATK 18');
// +Crit rate 100% thì mọi đòn chí mạng, và +Crit damage nhân lên trên đó.
const critAll = arena({ helmet: item('helmet', 'legendary', [['crit', 100], ['critd', 50]]) });
LAB.hurt(critAll.w, critAll.f, 100, '#fff', false, 0, 0, true);
eq('crit 100% + 50% dmg', critAll.w.dmg, Math.round(dmgPlain * 1.5));
const critNone = arena({ helmet: item('helmet', 'rare', [['critd', 50]]) });
LAB.hurt(critNone.w, critNone.f, 100, '#fff', false, 0, 0, true);
eq('crit rate 0 thì không tự chí mạng', critNone.w.dmg, dmgPlain);
// +DEF giảm sát thương nhận vào theo 100/(100+DEF), và ở 0 thì đúng bằng 1.
eq('DEF 0 không đổi gì', LAB.defMul(arena(null).w), 1);
near('DEF 100 giảm nửa', LAB.defMul(arena({ armor: item('armor', 'epic', [['def', 100]]) }).w), 0.5, 1e-9);
// +%Dodge 100 thì không đòn nào vào được -- và `hitHero` trả về 0, không phải "trừ 0 máu".
const dodgy = arena({ boots: item('boots', 'legendary', [['dodge', 100]]) });
dodgy.w.hero.inv = 0;
eq('né 100% thì đòn thành 0', LAB.hitHero(dodgy.w, 50), 0);
eq('né 100% thì không mất máu', dodgy.w.hero.hp, dodgy.w.hero.maxhp);
eq('đếm né', dodgy.w.dodges, 1);
// +HP/+Mana đã kiểm ở mục 4. +HP Regen/5s: nền là 0, nên máu chỉ tự lên khi có trang bị.
const noReg = arena(null);
noReg.w.hero.hp = 100;
for (let i = 0; i < 60; i++) LAB.step(noReg.w, 1 / 60);
eq('không trang bị thì không tự hồi máu', noReg.w.hero.hp, 100);
const reg = arena({ armor: item('armor', 'epic', [['hpr', 50], ['mpr', 25]]) });
reg.w.hero.hp = 100; reg.w.hero.mp = 0;
for (let i = 0; i < 60; i++) LAB.step(reg.w, 1 / 60);
near('+HP Regen/5s 50 → 10 HP mỗi giây', reg.w.hero.hp - 100, 10, 0.4);
near('+Mana Regen/5s 25 → thêm 5 mỗi giây', reg.w.hero.mp, LAB.MP_REGEN + 5, 0.6);
// +Attack Speed rút ngắn hồi đòn thường; +Move Speed nhân vào bước đi.
const fast = arena({ gloves: item('gloves', 'epic', [['aspd', 100]]) });
const slow0 = arena(null);
LAB.swing(slow0.w, slow0.w.hero.x + 20, slow0.w.hero.y);
LAB.swing(fast.w, fast.w.hero.x + 20, fast.w.hero.y);
near('+Attack Speed 100% thì hồi đòn còn nửa', fast.w.wcd, slow0.w.wcd / 2, 1e-6);
function walk(t, sec) {
  const x0 = t.w.hero.x;
  const inp = { dx: 1, dy: 0, ax: t.w.hero.x + 40, ay: t.w.hero.y };
  for (let i = 0; i < sec * 60; i++) LAB.step(t.w, 1 / 60, inp);
  return t.w.hero.x - x0;
}
const slowWalk = walk(arena(null), 0.5);
const fastWalk = walk(arena({ boots: item('boots', 'rare', [['mspd', 50]]) }), 0.5);
near('+Move Speed 50% thì đi xa hơn 1,5 lần', fastWalk / slowWalk, 1.5, 0.05);

// ---- 7. câu quan trọng nhất: không mặc gì ⇒ y như cũ ----
console.log('\n-- không trang bị thì bit-đối-bit như trước --');
// Chạy hai world cùng seed 900 khung: một cái để nguyên, một cái gọi syncGear thêm vài lần
// (thứ mà mặc/tháo làm) rồi tháo hết ra. Nếu một hệ số nào không đúng bằng 1 ở mức 0, hoặc
// một phép roll nào chạm vào dòng sim, hai bên lệch nhau.
function run(seed, touch) {
  const t = LAB.newWorld(seed, { wp: 'luoi-hai', slots: [0, 1, 2] });
  if (touch) {
    t.bag.push(item('armor', 'legendary', [['atk', 40], ['def', 30], ['crit', 100], ['mspd', 20]]));
    LAB.equipGear(t, 0);
    LAB.unequipGear(t, 'armor');
    t.bag.length = 0;
    LAB.syncGear(t);
  }
  for (let i = 0; i < 900; i++) {
    if (i % 90 === 20) LAB.swing(t, t.hero.x + 18, t.hero.y);
    LAB.step(t, 1 / 60, { dx: i % 180 < 90 ? 1 : -1, dy: 0,
                          ax: t.hero.x + 40, ay: t.hero.y });
  }
  return [t.dmg, t.kills, Math.round(t.hero.hp * 1000), Math.round(t.hero.x * 1000),
          Math.round(t.hero.y * 1000), t.foes.length, t.tels.length].join('/');
}
eq('mặc rồi tháo hết ⇒ cùng một trận', run(31, true), run(31, false));
eq('máu nền vẫn là HERO_HP', LAB.newWorld(1).hero.maxhp, LAB.HERO_HP);
eq('mana nền vẫn là HERO_MP', LAB.newWorld(1).hero.maxmp, LAB.HERO_MP);

// ---- 8. khoảng ngẫu nhiên của sát thương ----
console.log('\n-- sát thương dao động trong một khoảng --');
eq('DMG_VARY nằm trong khoảng đọc được', LAB.DMG_VARY > 0 && LAB.DMG_VARY < 0.5, true);
eq('trận mới bật dao động sẵn', LAB.newWorld(1).vary, LAB.DMG_VARY);
const wv1 = LAB.newWorld(55, { wp: 'kiem', slots: [0, 1, 2] });
NO_FOE(wv1);
// Tắt chí mạng: mục này đo *bề rộng của khoảng dao động*, và một cú nhân 1.5 sẽ vượt trần rồi
// làm đỏ đúng cái câu đang cần đúng. Chí mạng có mục riêng ngay dưới.
wv1.crit = 0;
const dummy = LAB.unit('brute', wv1.hero.x + 20, wv1.hero.y);
dummy.maxhp = dummy.hp = 1e9;
wv1.foes.push(dummy);
const spread = new Set();
let lowest = 1e9, highest = -1e9, tot = 0, prev = 0;
for (let k = 0; k < 400; k++) {
  LAB.hurt(wv1, dummy, 200, null, false, 0, 0, false);
  const d = wv1.dmg - prev; prev = wv1.dmg;
  spread.add(d);
  if (d < lowest) lowest = d;
  if (d > highest) highest = d;
  tot += d;
}
eq('400 cú không ra cùng một con số', spread.size > 12, true);
eq('không cú nào dưới sàn', lowest >= Math.round(200 * (1 - LAB.DMG_VARY)), true);
eq('không cú nào trên trần', highest <= Math.round(200 * (1 + LAB.DMG_VARY)), true);
// Không chỉ "có dao động" mà dao động *đủ rộng*: một khoảng ±15% khai báo mà thực tế chỉ chạy
// ±2% thì bảng số vẫn đọc ra là một con số duy nhất, và đó đúng là cái cần sửa.
eq('có cú gần sàn', lowest <= 200 * (1 - LAB.DMG_VARY * 0.8), true);
eq('có cú gần trần', highest >= 200 * (1 + LAB.DMG_VARY * 0.8), true);
near('trung bình vẫn là con số trong bảng', tot / 400, 200, 4);
wv1.vary = 0;
const onlyOne = new Set();
for (let k = 0; k < 20; k++) {
  const b = wv1.dmg;
  LAB.hurt(wv1, dummy, 200, null, false, 0, 0, false);
  onlyOne.add(wv1.dmg - b);
}
eq('vary = 0 thì mọi cú y hệt', onlyOne.size, 1);
// Câu người chơi thật sự nói ra: một chiêu thả vào một đám thì cả đám *không* nhận cùng một số.
const wpk = LAB.newWorld(57, { wp: 'kiem', slots: [0, 1, 2] });
NO_FOE(wpk);
wpk.crit = 0;
const pack = [];
for (let k = 0; k < 8; k++) {
  const f = LAB.unit('slime', wpk.hero.x + 6 + k * 3, wpk.hero.y + (k % 2 ? 5 : -5));
  f.maxhp = f.hp = 1e6; f.frozen = 1e9;
  wpk.foes.push(f); pack.push(f);
}
eq('cả đám đều trúng', LAB.hitCircle(wpk, wpk.hero.x + 16, wpk.hero.y, 70, 150, null, false, 0), 8);
eq('tám con nhận nhiều con số khác nhau', new Set(pack.map(f => 1e6 - f.hp)).size >= 5, true);

// ---- 9. con số chí mạng ----
console.log('\n-- con số chí mạng --');
// Một tỷ lệ duy nhất, và nó có sẵn từ đầu: 15% với +50% sát thương. Đây là câu trả lời cho lỗi
// "bảng ghi 0% mà đánh thường vẫn nổ chí mạng" -- không còn một tỷ lệ của vũ khí và một tỷ lệ của
// chiêu, chỉ còn `w.crit`, và bảng trạng thái in ra chính nó.
eq('chí mạng nền là 15%', LAB.CRIT_BASE, 15);
eq('sát thương chí mạng nền là +50%', LAB.CRIT_BASE_D, 50);
eq('trận mới đã có tỷ lệ nền', LAB.newWorld(1).crit, LAB.CRIT_BASE);
eq('trận mới đã có mức sát thương nền', LAB.newWorld(1).critd, LAB.CRIT_BASE_D);
// Không có trang bị nào, không truyền cờ nào: 4000 cú vẫn phải nổ chí mạng, và quanh 15%. Một tỷ
// lệ nền khai báo mà `hurt` không quay thì bảng chỉ số lại nói dối lần nữa, chỉ theo chiều kia.
const wcb = LAB.newWorld(63, { wp: 'kiem', slots: [0, 1, 2] });
NO_FOE(wcb);
wcb.vary = 0;
const cbt = LAB.unit('brute', wcb.hero.x + 20, wcb.hero.y);
cbt.maxhp = cbt.hp = 1e9;
wcb.foes.push(cbt);
let nCrit = 0, nHit = 4000, seenPlain = 0;
for (let k = 0; k < nHit; k++) {
  LAB.hurt(wcb, cbt, 100, null, false, 0, 0, false);
  if (wcb.nums[wcb.nums.length - 1].crit) nCrit++; else seenPlain++;
}
eq('người trần vẫn nổ chí mạng', nCrit > 0, true);
near('tỷ lệ chạy đúng quanh 15%', nCrit / nHit * 100, LAB.CRIT_BASE, 3);
eq('và phần lớn vẫn là cú thường', seenPlain > nCrit * 3, true);
// Cùng một tỷ lệ cho vũ khí và cho chiêu: `hurt` chỉ có một lần quay, nên hai đường sát thương
// không thể lệch nhau. Đo bằng cách quay riêng từng đường trên hai bản sao cùng seed.
function critRate(phys, seed) {
  const t = LAB.newWorld(seed, { wp: 'kiem', slots: [0, 1, 2] });
  NO_FOE(t);
  t.vary = 0;
  const f = LAB.unit('brute', t.hero.x + 20, t.hero.y);
  f.maxhp = f.hp = 1e9;
  t.foes.push(f);
  let c = 0;
  for (let k = 0; k < 2000; k++) {
    LAB.hurt(t, f, 100, null, false, 0, 0, phys);
    if (t.nums[t.nums.length - 1].crit) c++;
  }
  return c;
}
eq('vũ khí và chiêu dùng đúng một tỷ lệ', critRate(true, 71), critRate(false, 71));
// Cộng thêm từ trang bị thì cộng *lên trên* nền, chứ không thay nền.
const critAdd = arena({ helmet: item('helmet', 'rare', [['crit', 20]]) });
eq('trang bị cộng lên nền, không thay nền',
   LAB.CRIT_BASE + LAB.gearSum(critAdd.w.equip).crit, LAB.CRIT_BASE + 20);
const wcr = LAB.newWorld(61, { wp: 'kiem', slots: [0, 1, 2] });
NO_FOE(wcr);
wcr.vary = 0;
// Tắt tỷ lệ nền ở đây: mục này đo *cái nhãn* của một cú chí mạng, nên cú "thường" phải chắc chắn
// là thường. Cờ truyền vào `hurt` là đường buộc chí mạng, và nó còn tồn tại đúng vì chỗ này.
wcr.crit = 0;
const tgt = LAB.unit('brute', wcr.hero.x + 20, wcr.hero.y);
tgt.maxhp = tgt.hp = 1e6;
wcr.foes.push(tgt);
LAB.hurt(wcr, tgt, 100, null, false, 0, 0, false);
const numPlain = wcr.nums[wcr.nums.length - 1];
LAB.hurt(wcr, tgt, 100, null, true, 0, 0, false);
const numCrit = wcr.nums[wcr.nums.length - 1];
eq('cú thường không mang cờ chí mạng', numPlain.crit, false);
eq('cú chí mạng mang cờ', numCrit.crit, true);
eq('có dấu !', /!$/.test(numCrit.s), true);
eq('màu chí mạng cố định, không theo màu chiêu', numCrit.col, LAB.CRIT_C);
eq('con số chí mạng sống lâu hơn', numCrit.life > numPlain.life, true);
eq('chí mạng giật màn hình một nhịp', wcr.shake > 0, true);
// Cả năm chỗ đẩy số vào `w.nums` đều lưu *tâm*: con số chí mạng đổi cỡ theo khung, nên biên
// trái chỉ tính được lúc vẽ, và một chỗ còn lưu biên trái thì con số đó lệch sang trái.
let noCx = 0;
for (const n of wcr.nums) if (!(n.cx >= 0) || n.x !== undefined) noCx++;
eq('mọi con số lưu tâm, không lưu biên trái', noCx, 0);
eq('bề rộng ×1 khớp textW', LAB.textWScaled('123', 1), LAB.textW('123'));
eq('×2 thì rộng gấp đôi', LAB.textWScaled('123', 2), LAB.textW('123') * 2);
// Nhãn né đòn in ra chữ, không phải số: nếu bảng chữ thiếu một glyph thì `hitHero` đo đúng bề
// rộng của 'NÉ' rồi vẽ ra hai ô trống -- thứ chỉ thấy được bằng mắt.
for (const ch of 'NÉ0123456789!') eq('có glyph ' + ch, !!LAB.GLYPHS[ch], true);
// Đường vẽ chí mạng là một nhánh riêng, nên phải có ai chạy nó.
const pxc = new Uint8ClampedArray(LAB.W * LAB.H * 4);
let critErr = 'không';
try { LAB.renderWorld(wcr, pxc); } catch (e) { critErr = String(e && e.message || e); }
eq('vẽ được khung có số chí mạng', critErr, 'không');
function litCount(fn) {
  LAB.buf.fill(0);
  LAB.setCam(0, 0);
  fn();
  let n = 0;
  for (let i = 0; i < LAB.buf.length; i += 3)
    if (LAB.buf[i] + LAB.buf[i + 1] + LAB.buf[i + 2] > 0.05) n++;
  return n;
}
const litSmall = litCount(() => LAB.text3x5('123', 40, 40, LAB.CRIT_C, 1));
const litBig = litCount(() => LAB.textScaled('123', 40, 40, LAB.CRIT_C, 1, 2, LAB.CRIT_KEY));
eq('chữ chí mạng chiếm nhiều điểm hơn hẳn', litBig > litSmall * 2.5, true);
eq('chữ thường vẫn vẽ ra cái gì đó', litSmall > 20, true);

// ---- 10. hình nhân vật trong bảng trạng thái ----
console.log('\n-- hình nhân vật --');
for (const s of LAB.GEAR_SLOTS) {
  const art = LAB.DOLL_ART[s.id];
  eq(s.id + ': có hình', !!art, true);
  if (!art) continue;
  eq(s.id + ': mọi hàng đúng ' + LAB.DOLL_W + ' ký tự',
     art.g.filter(l => l.length !== LAB.DOLL_W).length, 0);
  eq(s.id + ': nằm trong bảng vẽ', art.y >= 0 && art.y + art.g.length <= LAB.DOLL_H, true);
  eq(s.id + ': chỉ dùng ký tự có màu', art.g.every(l => /^[.01234]+$/.test(l)), true);
  // Cột 6 là viền chung giữa hai chân, và js/anim.js *không bao giờ* bóp nó sang bên. Một món nằm
  // trong khối chân (hàng 12-15) mà bỏ trống cột đó thì hai chân dính thành một khối lúc bước.
  if (art.y >= 12) {
    let legMid = 0;
    for (const l of art.g) if (l[6] !== '0') legMid++;
    eq(s.id + ': giữ viền giữa hai chân', legMid, 0);
  }
}
eq('thứ tự vẽ đủ năm ô',
   LAB.DOLL_ORDER.slice().sort().join(','), LAB.GEAR_SLOTS.map(s => s.id).sort().join(','));
const bare = LAB.dollPixels(null);
eq('bảng vẽ đúng cỡ', bare.length + 'x' + bare[0].length, LAB.DOLL_H + 'x' + LAB.DOLL_W);
// Không mặc gì thì hình đúng bằng sprite HERO của trận -- cùng một nhân vật, không phải một bản
// vẽ thứ hai đi lệch dần khỏi cái đang chạy.
let heroPx = 0;
for (const ln of LAB.GRIDS.hero) for (const ch of ln) if (LAB.PAL[ch]) heroPx++;
let barePx = 0;
for (const row of bare) for (const c of row) if (c) barePx++;
eq('không mặc gì: đúng bằng HERO', barePx, heroPx);
for (const s of LAB.GEAR_SLOTS) {
  const eqp = { helmet: null, armor: null, gloves: null, pants: null, boots: null };
  eqp[s.id] = item(s.id, 'legendary', [['hp', 1]]);
  const px = LAB.dollPixels(eqp);
  const art = LAB.DOLL_ART[s.id];
  let diff = 0, outside = 0;
  for (let r = 0; r < LAB.DOLL_H; r++) for (let c = 0; c < LAB.DOLL_W; c++)
    if (px[r][c] !== bare[r][c]) { diff++; if (r < art.y || r >= art.y + art.g.length) outside++; }
  eq(s.id + ': mặc vào thì ngoại hình đổi', diff > 5, true);
  eq(s.id + ': không đổi ngoài hàng của nó', outside, 0);
}
// Phẩm chất đổi màu, không đổi hình: bốn ảnh khác nhau nhưng cùng số điểm.
function dollSig(rar) {
  const e = { helmet: item('helmet', rar, []), armor: null, gloves: null, pants: null, boots: null };
  return LAB.dollPixels(e).map(row => row.map(c => c || '-').join('|')).join('/');
}
eq('bốn phẩm chất ra bốn hình khác màu', new Set(LAB.GEAR_RARITY.map(r => dollSig(r.id))).size, 4);
for (const r of LAB.GEAR_RARITY) {
  const ramp = LAB.dollRamp(r.id);
  eq(r.id + ': năm màu hợp lệ',
     ['0', '1', '2', '3', '4'].filter(k => !/^#[0-9a-f]{6}$/.test(ramp[k])).length, 0);
  // Năm bậc phải *khác nhau*: hai bậc trùng màu thì miếng giáp lại thành một phiến, đúng cái mà
  // bậc thứ năm được thêm vào để bỏ.
  eq(r.id + ': năm bậc không trùng nhau',
     new Set(['0', '1', '2', '3', '4'].map(k => ramp[k])).size, 5);
}
// Mặc cả bộ thì cả năm lớp đều còn thấy được: giáp vẽ sau quần và găng vẽ sau giáp, nên nếu
// thứ tự sai thì một trong hai món biến mất hẳn khỏi hình.
const full = {};
for (const s of LAB.GEAR_SLOTS) full[s.id] = item(s.id, s.id === 'gloves' ? 'common' : 'legendary', []);
const fullPx = LAB.dollPixels(full);
const glovC = LAB.dollRamp('common', 'gloves');
let glovSeen = 0;
for (const row of fullPx) for (const c of row) if (c === glovC['1'] || c === glovC['3']) glovSeen++;
eq('găng không bị giáp vẽ đè mất', glovSeen > 4, true);
// Năm ô mặc cùng một phẩm chất thì *không* ra năm bảng màu giống nhau: cả hình một màu đọc thành
// một khối, và đó đúng là cái phải sửa. Một chút lệch sáng theo chiều dọc là cách tách chúng ra.
const tones = LAB.GEAR_SLOTS.map(s => LAB.dollRamp('epic', s.id)['2']);
eq('năm ô không ra cùng một sắc độ', new Set(tones).size, 5);
const lum = h => parseInt(h.slice(1, 3), 16) * 0.3 + parseInt(h.slice(3, 5), 16) * 0.6
                 + parseInt(h.slice(5, 7), 16) * 0.1;
eq('mũ sáng hơn giày',
   lum(LAB.dollRamp('epic', 'helmet')['2']) > lum(LAB.dollRamp('epic', 'boots')['2']), true);
eq('không truyền ô thì ra ramp gốc của phẩm chất',
   LAB.dollRamp('epic')['2'], LAB.dollRamp('epic', 'armor')['2']);

// ---- 10b. cùng cái hình ấy ra màn chơi ----
console.log('\n-- trang bị hiện ra ngoài màn chơi --');
// Câu người chơi nói: "mặc xong ra màn chơi cũng phải thấy đang mặc như trong bảng trạng thái".
// Kiểm bằng cách so *lưới ký tự*: bảng trạng thái in `wearBase` ra canvas, còn màn chơi cho đúng
// lưới ấy qua js/anim.js. Một nguồn hình, nên đây là câu duy nhất cần đúng.
const wig = LAB.newWorld(65, { wp: 'kiem', slots: [0, 1, 2] });
NO_FOE(wig);
const wh = wig.hero;
wh.atk = -1; wh.mv = 0; wh.it = 0; wh.ph = 0;
const worn0 = LAB.wornFrame(wig, wh);
eq('người trần: đúng khung của ANIM.hero', worn0.g.join('/'), LAB.heroFrame(wh).g.join('/'));
eq('người trần: không lệch chỗ', worn0.dx, 0);
eq('người trần: không có bảng màu riêng', worn0.pal, null);
for (const s of LAB.GEAR_SLOTS) wig.equip[s.id] = item(s.id, 'legendary', []);
LAB.syncGear(wig);
const worn1 = LAB.wornFrame(wig, wh);
eq('mặc rồi: lưới rộng ra 13 cột', worn1.g[0].length, LAB.DOLL_W);
eq('mặc rồi: lưới cao 16 hàng', worn1.g.length, LAB.DOLL_H);
eq('mặc rồi: kéo lại đúng chỗ cũ', worn1.dx + '/' + (worn1.dy - LAB.heroFrame(wh).dy),
   (-LAB.DOLL_DX) + '/' + (-LAB.DOLL_DY));
eq('mặc rồi: có bảng màu riêng', !!worn1.pal, true);
// Dáng đứng của bộ khung có trang bị *là* cái bảng trạng thái vẽ: cùng lưới, từng ký tự.
eq('khung đứng = hình trong bảng trạng thái',
   LAB.wearFrames(wig.equip).idle[0].g.join('/'), LAB.wearBase(wig.equip).join('/'));
// Mọi ký tự trong lưới phải tra ra được một màu, không thì `blit` bỏ qua nó và món đồ *im lặng*
// biến mất trên màn chơi trong khi bảng trạng thái vẫn vẽ đủ.
const wpal = LAB.wearPal(wig.equip);
let noCol = '';
for (const a of ['walk', 'idle', 'atk'])
  for (const f of LAB.wearFrames(wig.equip)[a])
    for (const ln of f.g) for (const ch of ln) if (ch !== '.' && !wpal[ch]) noCol += ch;
eq('mọi ký tự của mọi khung đều có màu', noCol, '');
// Hai lăm ký tự trang bị không được đụng vào PAL: PAL hết chỗ, và một ký tự trùng nghĩa là một
// miếng giáp lấy màu đá của bản đồ.
let clash = '';
for (const row of LAB.WEAR_CH) for (const ch of row) if (LAB.PAL[ch] || ch === '.') clash += ch;
eq('ký tự trang bị không tranh chỗ với PAL', clash, '');
eq('hai lăm ký tự đều khác nhau', new Set(LAB.WEAR_CH.join('')).size, 25);
// Bộ khung có trang bị vẫn phải là *bốn* dáng đi khác nhau, không phải một hình nhấp nhô: đây là
// cùng cái luật mà js/anim.js đặt cho mọi con quái.
eq('bốn dáng đi khác nhau', new Set(LAB.wearFrames(wig.equip).walk.map(f => f.g.join(''))).size, 4);
// Và bốn dáng ấy phải khác nhau *ở chân*: một bộ khung đổi mỗi cái đầu thì đi vẫn là trượt.
eq('bốn dáng đi khác nhau ở khối chân',
   new Set(LAB.wearFrames(wig.equip).walk.map(f => f.g.slice(12).join(''))).size, 4);
// Cú vung phải *nới* silhouette ra, không chỉ tô lại một ô đã có màu. Đây là lỗi thật đã gặp:
// hai miếng vai của giáp chiếm đúng cột mà cánh tay của nhân vật trần vươn tới, nên mặc giáp vào
// là mất luôn dấu hiệu duy nhất cho biết mình đang đánh. Đo bằng bề rộng thật của từng hàng.
function widest(g) {
  let n = 0;
  for (const ln of g) {
    let l = -1, r = -1;
    for (let c = 0; c < ln.length; c++) if (ln[c] !== '.') { if (l < 0) l = c; r = c; }
    if (r - l + 1 > n) n = r - l + 1;
  }
  return n;
}
for (const [what, set] of [['trần', LAB.ANIM.hero], ['mặc cả bộ', LAB.wearFrames(wig.equip)]]) {
  // Khung vào đà là cánh tay *dựng lên*, nên nó không cần rộng hơn -- nó chỉ cần khác.
  eq(what + ': khung vào đà khác dáng đứng',
     set.atk[0].g.join('') !== set.idle[0].g.join(''), true);
  eq(what + ': khung đánh vươn rộng hơn dáng đứng',
     widest(set.atk[1].g) > widest(set.idle[0].g), true);
}
// Đổi phẩm chất thì cache phải dựng lại -- nếu không, đổi từ Thường sang Huyền Thoại vẫn ra màu cũ
// ngoài màn chơi trong khi bảng trạng thái đã đổi.
const sigA = LAB.wearSig(wig.equip);
wig.equip.helmet = item('helmet', 'common', []);
LAB.syncGear(wig);
eq('đổi phẩm chất thì chữ ký đổi', LAB.wearSig(wig.equip) !== sigA, true);
eq('và bảng màu đổi theo',
   LAB.wornFrame(wig, wh).pal[LAB.WEAR_CH[0][2]].join(',') !== worn1.pal[LAB.WEAR_CH[0][2]].join(','),
   true);
// Tháo hết thì về đúng nhân vật trần, từng ký tự -- "không mặc gì thì mọi thứ y như trước".
for (const s of LAB.GEAR_SLOTS) wig.equip[s.id] = null;
LAB.syncGear(wig);
eq('tháo hết: về đúng nhân vật trần', LAB.wornFrame(wig, wh).g.join('/'), LAB.heroFrame(wh).g.join('/'));

// ---- 11. hai thanh máu/mana vẽ được và nằm trong góc trên trái ----
console.log('\n-- thanh HP/mana trên buffer --');
const wv = LAB.newWorld(41, { wp: 'kiem', slots: [0, 1, 2] });
const px2 = new Uint8ClampedArray(LAB.W * LAB.H * 4);
let drawErr = 'không';
try { LAB.renderWorld(wv, px2); } catch (e) { drawErr = String(e && e.message || e); }
eq('vẽ được cả khung', drawErr, 'không');
const b = LAB.HUD_BOX;
eq('hộp HUD ở góc trên trái', b.x > 0 && b.y > 0 && b.x + b.w < LAB.W / 2 && b.y + b.h < LAB.H / 2, true);
// Hộp HUD không được chồng lên minimap ở bất kỳ chế độ nào -- kể cả chế độ điện thoại, nơi
// minimap dời lên góc trên phải.
function overlap(p, q) {
  return p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
}
LAB.MM && eq('không chồng minimap (góc dưới)', overlap(b, LAB.MM), false);
// Vẽ xong thì trong hộp phải có điểm sáng của thanh máu: một hộp đen tuyền là bảng vẽ nhưng
// thanh không vẽ, và đó đúng là lỗi mà mắt bỏ qua trên ảnh chụp.
let lit = 0;
for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
  const o = (y * LAB.W + x) * 4;
  if (px2[o] + px2[o + 1] + px2[o + 2] > 120) lit++;
}
eq('thanh máu có điểm sáng trong hộp', lit > 40, true);
// Trừ máu đi thì số điểm sáng phải *ít hơn*: đó là toàn bộ ý nghĩa của một cái thanh.
wv.hero.hp = wv.hero.maxhp * 0.2;
wv.hero.mp = 0;
LAB.renderWorld(wv, px2);
let lit2 = 0;
for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
  const o = (y * LAB.W + x) * 4;
  if (px2[o] + px2[o + 1] + px2[o + 2] > 120) lit2++;
}
eq('máu thấp thì thanh ngắn lại', lit2 < lit, true);

console.log(bad ? '\n' + bad + ' phép kiểm KHÔNG đạt' : '\ntất cả đều đạt');
process.exit(bad ? 1 : 0);
