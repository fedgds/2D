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
eq('túi đầy: không rơi thêm', LAB.dropLoot(w, true), null);
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
for (let k = 0; k < 200; k++) { if (LAB.dropLoot(wd, false)) got++; wd.bag.length = 0; }
// 200 lần ở tỉ lệ 15% thì kỳ vọng 30. Ngưỡng rộng vì đây là kiểm "có rơi và không rơi tràn",
// không phải kiểm phân phối của mulberry32.
eq('quái thường có rơi', got > 8, true);
eq('quái thường không rơi mọi lần', got < 90, true);
eq('đếm loot bằng số lần rơi', wd.loot, got);
eq('đếm món mới bằng loot', wd.newGear, got);
const wb = LAB.newWorld(14, { wp: 'kiem', slots: [0, 1, 2] });
NO_FOE(wb);
let bossDrops = 0, legend = 0, plain = 0;
for (let k = 0; k < 200; k++) {
  const it = LAB.dropLoot(wb, true);
  if (it) { bossDrops++; if (it.rar === 'legendary') legend++; if (it.rar === 'common') plain++; }
  wb.bag.length = 0;
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
  d1.push(x.slot + x.rar); d2.push(y.slot + y.rar);
}
eq('loot không phụ thuộc dòng sim', d1.join(','), d2.join(','));

// ---- 6. mười hai chỉ số có tác dụng thật ----
console.log('\n-- chỉ số ăn vào sim --');
// Một hàm dựng world sạch: một con quái đúng chỗ, không quái khác, không cảnh báo.
function arena(gear) {
  const t = LAB.newWorld(21, { wp: 'kiem', slots: [0, 1, 2] });
  NO_FOE(t);
  if (gear) { for (const k in gear) t.equip[k] = gear[k]; LAB.syncGear(t); }
  const f = LAB.unit('brute', t.hero.x + 20, t.hero.y);
  f.maxhp = f.hp = 100000;
  t.foes.push(f);
  return { w: t, f: f };
}
// +ATK chỉ ăn vào đòn vũ khí, +Magic ATK chỉ ăn vào chiêu. Kiểm bằng cách gọi `hurt` hai lần
// với đúng cùng một con số, một lần đánh dấu phys và một lần không.
const base = arena(null);
LAB.hurt(base.w, base.f, 100, '#fff', false, 0, 0, true);
const dmgPlain = base.w.dmg;
const atkOnly = arena({ gloves: item('gloves', 'rare', [['atk', 25]]) });
LAB.hurt(atkOnly.w, atkOnly.f, 100, '#fff', false, 0, 0, true);
eq('+ATK 25% vào đòn vũ khí', atkOnly.w.dmg, Math.round(dmgPlain * 1.25));
LAB.hurt(atkOnly.w, atkOnly.f, 100, '#fff', false, 0, 0, false);
eq('+ATK không vào chiêu', atkOnly.w.dmg - Math.round(dmgPlain * 1.25), dmgPlain);
const magOnly = arena({ gloves: item('gloves', 'rare', [['mag', 50]]) });
LAB.hurt(magOnly.w, magOnly.f, 100, '#fff', false, 0, 0, false);
eq('+Magic ATK 50% vào chiêu', magOnly.w.dmg, Math.round(dmgPlain * 1.5));
LAB.hurt(magOnly.w, magOnly.f, 100, '#fff', false, 0, 0, true);
eq('+Magic ATK không vào đòn vũ khí', magOnly.w.dmg - Math.round(dmgPlain * 1.5), dmgPlain);
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

// ---- 8. hai thanh máu/mana vẽ được và nằm trong góc trên trái ----
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
