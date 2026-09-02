// Kiểm chín cơ chế riêng của chín vũ khí, không cần browser.
//
// Chạy: node tools/check-weapons.js
//
// Nạp giống tools/check-maps.js: nối mọi <script src> của index.html theo đúng thứ tự trang
// rồi lấy globalThis.LAB. Ở đây kiểm *tính chất thiết kế* chứ không kiểm lại con số trong
// bảng vũ khí -- một bài test chép lại đúng công thức của bản cài thì không chứng minh gì.
// Nên chỗ nào cũng so hai trường hợp với nhau (có chuỗi / không chuỗi, máu đầy / máu cạn,
// nhịp cuối / nhịp đầu): tinh chỉnh lại số trong bảng vẫn xanh, làm hỏng cơ chế thì đỏ.
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

let bad = 0;
function eq(name, got, want) {
  const ok = got === want;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + '  = ' + got + (ok ? '' : '  (cần ' + want + ')'));
}
// Sai số cho phép quanh chỗ `hurt` làm tròn từng đòn: bốn nhịp là bốn lần làm tròn.
function near(name, got, want, tol) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + '  = ' + got.toFixed(2)
    + (ok ? '' : '  (cần ' + want.toFixed(2) + ' ±' + tol + ')'));
}

// ---- sân chơi sạch ----------------------------------------------------------------
// Mọi bài test đứng trên một sân không có gì tự xảy ra: không quái tự sinh, không quái tự
// đi (frozen), hero ở giữa map. Chỉ khi đó "máu con quái tụt bao nhiêu" mới là câu trả lời
// cho đúng một nhát đánh.
LAB.applyMap(LAB.MAPS[0]);
function bench(wpId) {
  const w = LAB.newWorld(1234, { map: LAB.MAPS[0].id, wp: wpId, slots: [0, 1, 2] });
  w.foes.length = 0;
  w.spawnT = 1e9;
  // Tắt khoảng ngẫu nhiên của sát thương (xem DMG_VARY trong js/world.js). Cả file này chốt
  // cứng vài chục con số dmg với sai số ±1, nên một cú đánh dao động ±15% thì mọi phép đo ở
  // đây mất nghĩa. Bề rộng của khoảng đó được kiểm riêng trong tools/check-gear.js.
  w.vary = 0;
  // Và tắt chí mạng, cùng một lý do: nhân vật có 15% chí mạng sẵn từ đầu (CRIT_BASE), nên một
  // phép đo dmg chốt cứng sẽ đỏ khoảng một lần trong bảy nếu để nguyên. Tỷ lệ ấy được kiểm riêng
  // trong tools/check-gear.js.
  w.crit = 0;
  w.hero.x = LAB.WW * 0.5; w.hero.y = LAB.WH * 0.5;
  LAB.snapCam(w);
  return w;
}
// Quái đứng yên: `stepFoe` bỏ qua cả việc đi lại, việc niệm chiêu và việc chạm vào hero khi
// `frozen > 0`, nên một mục tiêu bị đóng băng là một cái bia đo được.
function target(w, kind, dx, dy, freeze) {
  const f = LAB.unit(kind, w.hero.x + dx, w.hero.y + dy);
  if (freeze !== false) f.frozen = 1e9;
  w.foes.push(f);
  return f;
}
// Một nhát đánh giải quyết trong một lần gọi: `crossed` chỉ so pt < at <= p, nên pt = 0 và
// p = 1 là "mọi nhịp vừa đi qua". `from` để cắt riêng nhịp cuối ra khỏi cả chuỗi.
function beats(w, wp, ang, opt) {
  const o = opt || {};
  const e = { wp, i: -1, t: wp.dur, dur: wp.dur, seed: 99, data: {},
              ox: w.hero.x, oy: w.hero.y - w.hero.h * 0.5,
              x: w.hero.x + 40, y: w.hero.y, ang: ang || 0,
              pt: o.from === undefined ? 0 : o.from, p: o.to === undefined ? 1 : o.to, momo: !!o.momo };
  LAB.swingHit(w, e);
  return e;
}
const LAST = wp => (wp.hits[wp.hits.length - 1] - 0.5) / wp.frames;  // chỉ nhịp cuối
const WP = LAB.WEAPON_BY_ID;
// Nhóm *quét một cái nón*. Rìu nện xuống một điểm (`slam`) nên nó không có `arc` chút nào, và
// `Math.max` trên một mảng có `undefined` không đỏ -- nó ra NaN, rồi mọi phép so với NaN đều
// false, tức là bài test vẫn chạy mà không còn kiểm gì. Nên chỗ nào so bề rộng nón cũng so
// trong nhóm này, và một vũ khí kiểu điểm về sau thêm vào cũng tự nằm ngoài.
const SWEEP = LAB.WEAPONS.filter(x => x.arc !== undefined);

// ---- 1. Kiếm: chuỗi nhịp ---------------------------------------------------------
console.log('-- kiếm · chuỗi nhịp --');
const kiem = WP.kiem;
eq('kiếm không đẩy', kiem.push === 0 && kiem.pushStep === 0, true);
eq('có cửa sổ chuỗi', !!kiem.momentum, true);
eq('chuỗi hồi nhanh hơn', kiem.momentum.cd < kiem.cd, true);
{
  const w = bench('kiem');
  const f = target(w, 'brute', 26, 0);
  const hp0 = f.hp;
  beats(w, kiem, 0);
  const base = hp0 - f.hp;
  // Đứng lại nối chuỗi được vì nhát vừa rồi không đẩy nó đi: knockback đúng bằng 0.
  eq('đánh xong địch không bị đẩy', f.vx === 0 && f.vy === 0, true);
  eq('trúng nhịp cuối thì mở cửa sổ', w.momo > 0, true);
  near('cửa sổ dài đúng win', w.momo, kiem.momentum.win, 1e-6);

  const f2 = target(w, 'brute', 26, 0);
  const hp2 = f2.hp;
  beats(w, kiem, 0, { momo: true });
  const boost = hp2 - f2.hp;
  near('chuỗi cộng damage đúng tỉ lệ', boost / base, kiem.momentum.dmg, 0.03);
}
{
  // Không trúng ai thì không có chuỗi: cửa sổ mua bằng cú đánh trúng, không bằng cú vung.
  const w = bench('kiem');
  beats(w, kiem, 0);
  eq('vung vào không khí không mở cửa sổ', w.momo, 0);
}
{
  // Cửa sổ chạy theo đồng hồ thật, nên chần chừ là mất -- đó là toàn bộ câu hỏi của kiếm.
  const w = bench('kiem');
  target(w, 'brute', 26, 0);
  beats(w, kiem, 0);
  for (let i = 0; i < 200 && w.momo > 0; i++) LAB.step(w, 1 / 60, null);
  eq('cửa sổ hết sau win giây', w.momo, 0);
}
{
  // `swing` là chỗ tiêu cửa sổ: một cú click quyết định cả chuỗi nhanh hay không, và tiêu
  // rồi là hết -- muốn nhanh nữa thì phải trúng nhịp cuối lần nữa.
  const w = bench('kiem');
  w.momo = kiem.momentum.win;
  eq('click được', LAB.swing(w, w.hero.x + 40, w.hero.y), true);
  near('hồi chiêu dùng bản chuỗi', w.wcd, kiem.momentum.cd, 1e-6);
  eq('cửa sổ bị tiêu ngay', w.momo, 0);
  const sw = w.fxs[w.fxs.length - 1];
  eq('nhát này mang cờ chuỗi', sw.momo, true);
  const w2 = bench('kiem');
  LAB.swing(w2, w2.hero.x + 40, w2.hero.y);
  near('không chuỗi thì hồi thường', w2.wcd, kiem.cd, 1e-6);
}

// ---- 2. Cung: mũi tên bay thật ----------------------------------------------------
console.log('\n-- cung · đạn bay --');
const cung = WP.cung;
eq('cung có đạn', !!cung.shot, true);
eq('gần yếu hơn xa', cung.shot.near < cung.shot.far, true);
eq('đỉnh ramp trước khi hết tầm', cung.shot.ramp < cung.shot.max, true);
{
  const w = bench('cung');
  // Bốn con xếp thành hàng trên đường bay: nếu đạn không xuyên thì chỉ con đầu mất máu.
  // Con thứ tư đứng ngay sau mốc `ramp` để chứng minh đỉnh damage tới ở ramp chứ không ở
  // cuối tầm -- dải mạnh nhất là chỗ giữ được, không phải một điểm phải tìm.
  const a = target(w, 'brute', 40, 0);
  const b = target(w, 'brute', 110, 0);
  const c = target(w, 'brute', cung.shot.ramp + 8, 0);
  const e4 = target(w, 'brute', 190, 0);
  const hp = [a.hp, b.hp, c.hp, e4.hp];
  LAB.swing(w, w.hero.x + 200, w.hero.y);
  // Bắn sang phải nên đừng để hero đi đâu cả: inp = null.
  for (let i = 0; i < 120; i++) LAB.step(w, 1 / 60, null);
  const arrows = w.fxs.filter(e => e.sk.id === 'arrow');
  eq('đạn đã bay xong', arrows.length, 0);
  const d = [hp[0] - a.hp, hp[1] - b.hp, hp[2] - c.hp, hp[3] - e4.hp];
  console.log('     sát thương theo tầm 40/110/' + (cung.shot.ramp + 8) + '/190: ' + d.join(' / '));
  eq('xuyên qua cả bốn', d.every(x => x > 0), true);
  eq('càng xa càng mạnh', d[0] < d[1] && d[1] < d[2], true);
  // Áp mặt thì cung là vũ khí tệ nhất trong tay: một chuỗi găng đủ 5 nhịp còn hơn.
  eq('gần thì yếu hơn cả một chuỗi găng', d[0] < WP.gang.dmg * WP.gang.hits.length, true);
  near('gần chưa tới nửa dải', d[0], cung.shot.near, (cung.shot.far - cung.shot.near) * 0.5);
  eq('qua ramp là đạt đỉnh', d[2], cung.shot.far);
  eq('quá ramp không mạnh thêm', d[3], cung.shot.far);
  eq('mỗi con chỉ trúng một lần', w.dmg, d[0] + d[1] + d[2] + d[3]);
}
{
  // Đạn không phải nhát vung. `step` nhận diện nhát đang chạy bằng `.wp`, nên một mũi tên
  // mang `.wp` sẽ chiếm luôn dáng cầm vũ khí của hero và ghim nó ở khung cuối cùng.
  const w = bench('cung');
  target(w, 'brute', 150, 0);
  LAB.swing(w, w.hero.x + 200, w.hero.y);
  let seen = [];
  for (let i = 0; i < 40 && !seen.length; i++) {
    LAB.step(w, 1 / 60, null);
    seen = w.fxs.filter(e => e.sk.id === 'arrow');
  }
  const one = seen[0];
  eq('một lần bật dây nhả đủ nan quạt', seen.length, cung.shot.fan);
  eq('mũi tên không phải nhát vung', seen.every(a => a.wp === undefined), true);
  eq('mũi tên không chiếm w.sw', seen.indexOf(w.sw) < 0, true);
  eq('mũi tên nhớ vũ khí trong data', one ? one.data.wp === cung : false, true);
  // Thời gian bay là thật: `dur` = tầm / tốc độ, nên `e.p` chính là phần đường đã đi.
  near('thời gian bay khớp tốc độ', one ? one.dur : 0,
       one ? one.data.max / cung.shot.spd : 0, 1e-9);
  // Nan quạt phải đối xứng quanh hướng ngắm: lệch một bên thì cung bắn chệch chỗ người chơi
  // đang trỏ, và cái đó không phải diện rộng mà là ngắm sai.
  const ang = seen.map(a => a.ang).sort((x, y) => x - y);
  near('xoè đối xứng quanh hướng ngắm', (ang[0] + ang[ang.length - 1]) / 2, 0, 1e-9);
  near('hai mũi kề cách đúng spread', ang[1] - ang[0], cung.shot.spread, 1e-9);
  // Đúng một mũi giữa mang đủ sát thương. Ba mũi đủ lực thì đòn này thành gấp ba, và cả cái
  // dải theo tầm bên trên hết nghĩa.
  const mul = seen.map(a => a.data.mul).sort((x, y) => x - y);
  eq('đúng một mũi mang đủ lực', mul.filter(m => m === 1).length, 1);
  eq('hai mũi biên nhân side', mul.filter(m => m === cung.shot.side).length, 2);
}
{
  // Trần một mục tiêu không đổi vì có nan quạt. Ở tầm ôm sát ba mũi còn chồng lên cùng một
  // thân địch nên đòn ấy mới ra hình một đòn, nhưng chồng bao nhiêu cũng không được vượt
  // `far` -- tức là không có khoảng nào bắn áp mặt lại hơn một mũi bắn tới độ.
  const prof = [];
  for (const dist of [16, 24, 32, 40, 56, 72, 96, 120, 148, 190]) {
    const w = bench('cung');
    const f = target(w, 'brute', dist, 0);         // bia rộng nhất: chồng nhau lâu nhất
    f.hp = f.maxhp = 1e6;
    LAB.swing(w, w.hero.x + 240, w.hero.y);
    for (let i = 0; i < 140; i++) LAB.step(w, 1 / 60, null);
    prof.push([dist, Math.round(1e6 - f.hp)]);
  }
  console.log('     một bia đúng trục: ' + prof.map(p => p[0] + 'px→' + p[1]).join('  '));
  const hi = Math.max(...prof.map(p => p[1]));
  eq('trần một mục tiêu vẫn là far', hi <= cung.shot.far, true);
  // Áp mặt vẫn là tay yếu nhất trong game, chỉ là không còn bằng không: một nhịp cung ở
  // 16 px chia cho `cd` phải thấp hơn dps của cả bốn vũ khí kia.
  const dps = prof[0][1] / cung.cd;
  // Mẫu dps của một vũ khí cận chiến: `dmg` × tổng bậc nhịp, chia hồi. Vuốt phải cộng thêm phần
  // `rend`, và không phải để cho nó dễ thở: gần hết sát thương của vuốt *nằm trong* chồng vết xé,
  // nên đem riêng `dmg` trơ của nó ra so là nói sai về vuốt chứ không phải nói đúng về cung. Lấy
  // ngay nhát *mở đầu* -- chồng còn trống, mỗi nhịp mới cộng được một vết -- tức là chặn dưới
  // thật của vuốt, không phải con số lúc đã bám đủ năm vết.
  const meleeDps = x => {
    const n = x.hits.length;
    let d = 0;
    for (let i = 0; i < n; i++) {
      const step = n > 1 ? 1 + 0.5 * (i / (n - 1)) : 1;
      d += x.dmg * step * (1 + (x.rend ? x.rend.add * Math.min(x.rend.max, i) : 0));
    }
    return d / x.cd;
  };
  const mel = LAB.WEAPONS.filter(x => !x.shot).map(meleeDps);
  console.log('     dps áp mặt: cung ' + dps.toFixed(0) + ' · cận chiến '
              + mel.map(x => x.toFixed(0)).join('/'));
  eq('áp mặt vẫn kém mọi vũ khí cận chiến', dps < Math.min(...mel), true);
  eq('áp mặt không còn bằng một mũi trơ', prof[0][1] > cung.shot.near * 1.5, true);
  // Ra khỏi khoảng ôm sát thì hai mũi biên đã lệch khỏi thân địch, nên từ đó trở đi dải theo
  // tầm là của riêng mũi giữa: không còn chỗ nào lùi lại gần mà lại đau hơn. (Không so ngặt
  // vì quá `ramp` là một đoạn phẳng ở đúng `far`.)
  const out = prof.filter(p => p[0] >= 40);
  eq('ngoài khoảng ôm sát thì không chỗ nào lùi lại mạnh hơn',
     out.every((p, i) => i === 0 || p[1] >= out[i - 1][1]), true);
  eq('trong dải ramp thì càng xa càng mạnh',
     out.filter(p => p[0] <= cung.shot.ramp)
        .every((p, i, a) => i === 0 || p[1] > a[i - 1][1]), true);
}
{
  // Cái nan quạt trả tiền bằng bề rộng. Ba con đứng đúng ba làn ở 120 px: cả ba mất máu, và
  // hai con ngoài mất đúng `side` phần so với con giữa. Đây là chỗ khác biệt thật so với bản
  // một mũi -- bản cũ chỉ có con giữa mất máu.
  //
  // `arrowHit` đo mọi thứ trong khung đã bỏ squash (`dy / squash`), nên muốn đặt một con
  // *đúng trên* làn biên thì phải nhân squash lại khi đặt, và `midY` là chỗ nó bị đo.
  const w = bench('cung');
  const oy = w.hero.y - w.hero.h * 0.5, sq = cung.squash;
  const lane = 120 * Math.sin(cung.shot.spread);
  const put = u => {
    const f = target(w, 'slime', 120, 0);
    f.y = oy + u * sq + f.h * 0.5;
    f.hp = f.maxhp = 1e6;
    return f;
  };
  const mid = put(0), up = put(-lane), dn = put(lane);
  LAB.swing(w, w.hero.x + 240, w.hero.y);
  for (let i = 0; i < 140; i++) LAB.step(w, 1 / 60, null);
  const dm = [mid, up, dn].map(f => Math.round(1e6 - f.hp));
  console.log('     ba làn ở 120px: giữa ' + dm[0] + ' · biên ' + dm[1] + '/' + dm[2]);
  eq('cả ba làn đều trúng', dm.every(x => x > 0), true);
  eq('hai làn biên đối xứng', dm[1], dm[2]);
  eq('làn biên đau ít hơn làn giữa', dm[1] < dm[0], true);
  near('làn biên đúng side phần', dm[1] / dm[0], cung.shot.side, 0.06);
}
{
  // Bắn vào tường: đường bay bị cắt ở BOUND chứ không kéo dài vào khoảng không. Mỗi mũi phải
  // được cắt trên *góc của chính nó*, bằng không hai mũi biên của một nan quạt bắn dọc tường
  // vẫn bay tiếp với vệt sáng đi trong khoảng không.
  const w = bench('cung');
  w.hero.x = LAB.BOUND.x1 - 30;
  LAB.swing(w, w.hero.x + 200, w.hero.y);
  let ar = [];
  for (let i = 0; i < 40 && !ar.length; i++) { LAB.step(w, 1 / 60, null); ar = w.fxs.filter(e => e.sk.id === 'arrow'); }
  eq('mọi mũi đều bị tường cắt', ar.length > 0 && ar.every(a => a.data.max < cung.shot.max), true);
}

// ---- 3. Lưỡi hái: gom bầy ---------------------------------------------------------
console.log('\n-- lưỡi hái · thu hoạch --');
const hai = WP['luoi-hai'];
eq('push âm là kéo', hai.push < 0, true);
eq('nhịp sau kéo mạnh hơn', hai.pushStep < 0, true);
eq('cung rộng nhất', hai.arc >= Math.max(...SWEEP.map(x => x.arc)), true);
{
  const w = bench('luoi-hai');
  w.hero.hp = 200;
  const a = target(w, 'slime', 30, -8);
  const b = target(w, 'slime', 30, 8);
  beats(w, hai, 0);
  eq('kéo con bên phải về bên trái', a.vx < 0 && b.vx < 0, true);
  eq('hai con thì hồi máu', w.hero.hp > 200, true);
  eq('hồi đúng harvest × (n-1)', w.hero.hp - 200, hai.harvest);
  eq('đếm vào tổng hồi của run', w.heals, hai.harvest);
}
{
  const w = bench('luoi-hai');
  w.hero.hp = 200;
  target(w, 'slime', 30, 0);
  beats(w, hai, 0);
  eq('một con thì không hồi', w.hero.hp, 200);
}
{
  // Ba con, và chỉ nhịp cuối trả máu: hồi từng nhịp thì một bầy ba con đã hồi gấp đôi mức
  // hao máu do bị vây, tức là trả tiền cho việc vung tay chứ không cho việc gom được. Nên
  // "cả chuỗi" và "chỉ nhịp cuối" phải cho ra đúng cùng một con số.
  const w = bench('luoi-hai');
  w.hero.hp = 200;
  target(w, 'slime', 30, -10); target(w, 'slime', 32, 0); target(w, 'slime', 30, 10);
  beats(w, hai, 0);
  eq('ba con hồi harvest × 2', w.hero.hp - 200, hai.harvest * 2);

  const w2 = bench('luoi-hai');
  w2.hero.hp = 200;
  target(w2, 'slime', 30, -10); target(w2, 'slime', 32, 0);
  beats(w2, hai, 0, { from: LAST(hai) });
  const onlyLast = w2.hero.hp - 200;
  const w3 = bench('luoi-hai');
  w3.hero.hp = 200;
  target(w3, 'slime', 30, -10); target(w3, 'slime', 32, 0);
  beats(w3, hai, 0);
  eq('chỉ nhịp cuối trả máu', onlyLast, hai.harvest);
  eq('cả chuỗi vẫn chỉ trả một lần', w3.hero.hp - 200, onlyLast);
}
{
  // Máu đầy thì không hồi được, và `healHero` phải trả về 0 chứ không tràn qua maxhp.
  const w = bench('luoi-hai');
  target(w, 'slime', 30, -8); target(w, 'slime', 30, 8);
  beats(w, hai, 0);
  eq('máu đầy không tràn', w.hero.hp, w.hero.maxhp);
  eq('không cộng vào tổng hồi', w.heals, 0);
}

// ---- 4. Găng: cắt phép -----------------------------------------------------------
console.log('\n-- găng · cắt phép --');
const gang = WP.gang;
eq('găng có cắt phép', gang.cut > 0, true);
eq('găng tầm ngắn nhất', gang.range <= Math.min(...LAB.WEAPONS.map(x => x.range)), true);
{
  const w = bench('gang');
  const f = target(w, 'brute', 20, 0);
  f.frozen = 0;                             // phải tỉnh mới niệm được
  eq('quái bắt đầu niệm', LAB.startCast(w, f, 'quake_slam'), true);
  eq('có cảnh báo trên sàn', w.tels.length, 1);
  beats(w, gang, 0, { from: LAST(gang) });   // chỉ nhịp cuối
  eq('nhịp cuối đóng băng caster', f.frozen > 0, true);
  near('giữ đúng cut giây', f.frozen, gang.cut, 1e-6);
  LAB.stepTel(w, w.tels[0], 1 / 60, 0);
  eq('cảnh báo bị dọn', w.tels.length, 0);
  eq('quái quên chiêu đang niệm', f.tel, null);
  eq('đẩy lần niệm sau ra xa', f.acd >= 1.1, true);
}
{
  // Nhịp đầu không cắt: phải áp sát cho tới nhịp thứ năm, đó là cái giá của tầm ngắn nhất.
  const w = bench('gang');
  const f = target(w, 'brute', 20, 0);
  f.frozen = 0;
  LAB.startCast(w, f, 'quake_slam');
  const e = { wp: gang, i: -1, t: 0, dur: gang.dur, seed: 9, data: {}, ang: 0,
              ox: w.hero.x, oy: w.hero.y - w.hero.h * 0.5, x: 0, y: 0,
              pt: 0, p: (gang.hits[0] + 0.5) / gang.frames };
  LAB.swingHit(w, e);
  eq('nhịp đầu có trúng', f.hp < f.maxhp, true);
  eq('nhịp đầu không cắt', f.frozen, 0);
  eq('cảnh báo vẫn còn', w.tels.length, 1);
}
{
  // Chiêu đã nổ thì không cắt được nữa: cắt phép là ngắt lời, không phải xoá đòn.
  const w = bench('gang');
  const f = target(w, 'brute', 20, 0);
  f.frozen = 0;
  LAB.startCast(w, f, 'quake_slam');
  f.tel.fired = true;
  beats(w, gang, 0, { from: LAST(gang) });
  eq('chiêu đã nổ thì không cắt', f.frozen, 0);
}
{
  // Bốn vũ khí kia không cắt được gì -- đây là trục counterplay riêng của găng.
  for (const id of ['kiem', 'dao', 'luoi-hai', 'khien']) {
    const w = bench(id);
    const f = target(w, 'brute', 20, 0);
    f.frozen = 0;
    LAB.startCast(w, f, 'quake_slam');
    beats(w, WP[id], 0, { from: LAST(WP[id]) });
    eq(id + ' không cắt được phép', f.frozen, 0);
  }
}

// ---- 5. Đao: xử trảm, cắm chân, đỡ đòn -------------------------------------------
console.log('\n-- đao · xử trảm --');
const dao = WP.dao;
eq('đao có xử trảm', dao.exec > 0, true);
eq('đao cắm chân', dao.plant < 1, true);
eq('đao đỡ đòn', dao.guard < 1, true);
{
  // Cùng một nhịp cuối, hai mục tiêu khác nhau ở đúng một chỗ: máu còn lại.
  const w = bench('dao');
  const fresh = target(w, 'brute', 24, -14);
  beats(w, dao, 0, { from: LAST(dao) });
  const dFresh = fresh.maxhp - fresh.hp;

  const w2 = bench('dao');
  const hurt80 = target(w2, 'brute', 24, 0);
  LAB.hurt(w2, hurt80, hurt80.maxhp * 0.8, [1, 1, 1], false, 0, 0);
  const before = hurt80.hp;
  beats(w2, dao, 0, { from: LAST(dao) });
  const dHurt = before - hurt80.hp;
  console.log('     nhịp cuối: máu đầy ' + dFresh + ' · còn 20% ' + dHurt);
  eq('máu càng cạn càng đau', dHurt > dFresh, true);
  near('cộng đúng dmg × exec × %máu đã mất', dHurt - dFresh, dao.dmg * dao.exec * 0.8, 1.5);
}
{
  // Máu đầy thì xử trảm cộng 0: nó là đòn kết thúc, không phải đòn mở đầu.
  const w = bench('dao');
  const f = target(w, 'brute', 24, 0);
  beats(w, dao, 0, { from: LAST(dao) });
  const withExec = f.maxhp - f.hp;
  const w2 = bench('dao');
  const f2 = target(w2, 'brute', 24, 0);
  const noExec = Object.assign({}, dao); delete noExec.exec;
  beats(w2, noExec, 0, { from: LAST(noExec) });
  eq('máu đầy thì xử trảm bằng 0', withExec, f2.maxhp - f2.hp);
}
{
  // Nhịp không phải nhịp cuối cũng không xử trảm: chỉ đòn kết thúc đọc được thương tích.
  const w = bench('dao');
  const f = target(w, 'brute', 24, 0);
  LAB.hurt(w, f, f.maxhp * 0.8, [1, 1, 1], false, 0, 0);
  const before = f.hp;
  const e = { wp: dao, i: -1, t: 0, dur: dao.dur, seed: 9, data: {}, ang: 0,
              ox: w.hero.x, oy: w.hero.y - w.hero.h * 0.5, x: 0, y: 0,
              pt: 0, p: (dao.hits[0] + 0.5) / dao.frames };
  LAB.swingHit(w, e);
  near('nhịp đầu không xử trảm', before - f.hp, dao.dmg, 1);
}
{
  // Cắm chân: cùng một input, cùng số khung, khác nhau đúng bằng `plant`. Và phải đúng ngay
  // ở khung đầu -- `step` giải chuyện này trước khi hero đi, chứ `w.sw` thì trễ một khung.
  const inp = { dx: 1, dy: 0, ax: 0, ay: 0 };
  function walk(id) {
    const w = bench(id);
    inp.ax = w.hero.x + 40; inp.ay = w.hero.y;
    const x0 = w.hero.x;
    LAB.swing(w, inp.ax, inp.ay);
    for (let i = 0; i < 10; i++) LAB.step(w, 1 / 60, inp);
    return w.hero.x - x0;
  }
  const dDao = walk('dao'), dKiem = walk('kiem');
  console.log('     10 khung vừa vung vừa đi: đao ' + dDao.toFixed(2)
    + ' · kiếm ' + dKiem.toFixed(2));
  near('đao chỉ đi được plant lần', dDao / dKiem, dao.plant, 0.02);
  eq('kiếm đi bình thường', dKiem > dDao, true);
}
{
  // Đỡ đòn mở đúng bằng bề dài của cú vung: `hitHero` đọc `guard` trên nhát đang chạy, nên
  // vung xong là hết đỡ. God mode phải tắt, và bất tử của lướt né phải bằng 0, không thì
  // đòn bị né và phép nhân không bao giờ chạy tới.
  const w = bench('dao');
  w.god = false; w.hero.inv = 0;
  LAB.swing(w, w.hero.x + 40, w.hero.y);
  LAB.step(w, 1 / 60, null);
  eq('đang vung', !!w.sw, true);
  const took = LAB.hitHero(w, 100, [1, 1, 1]);
  eq('vung thì chịu ít đòn', took, Math.round(100 * dao.guard));
  while (w.sw) LAB.step(w, 1 / 60, null);
  w.hero.inv = 0;
  eq('vung xong thì hết đỡ', LAB.hitHero(w, 100, [1, 1, 1]), 100);
}

// ---- 6. Khiên: lao lên ------------------------------------------------------------
console.log('\n-- khiên · lao lên --');
const khien = WP.khien;
eq('khiên có cú lao', !!khien.lunge, true);
eq('khiên đỡ đòn', khien.guard < 1, true);
eq('khiên hẩy mạnh nhất', khien.push >= Math.max(...LAB.WEAPONS.map(x => x.push)), true);
eq('nhịp sau hẩy mạnh hơn nhịp trước', khien.pushStep > 0, true);
// Chân phải đứng lại *trước* khi cạnh khiên tới, bằng không cú đánh xuất phát giữa lúc trượt
// và cả đòn đọc ra thành húc chứ không thành đánh.
eq('lao xong mới tới nhịp đầu', khien.lunge.dur < khien.hits[0] / khien.fps, true);
// Cú lao phải đọc ra là trườn tới, không phải dịch chuyển: nhanh hơn đi bộ nhưng chậm hơn hẳn
// lướt né, vì nếu bằng lướt né thì đòn đánh thường đã gồm luôn cú né.
{
  const spd = khien.lunge.len / khien.lunge.dur;
  console.log('     tốc lao ' + spd.toFixed(0) + ' px/s · lướt né '
              + (LAB.DASH_LEN / LAB.DASH_DUR).toFixed(0) + ' px/s');
  eq('lao nhanh hơn đi bộ', spd > 56, true);
  eq('lao chậm hơn lướt né', spd < LAB.DASH_LEN / LAB.DASH_DUR, true);
  // Bấm liên tục thì hero đi được `len / cd` px/s, và đó là chỗ khiên đổi tay: một vũ khí *áp sát*
  // chứ không phải một vũ khí đứng chờ. Hai đầu chặn nói ra cả điều khoản: nhanh hơn đi bộ (bằng
  // không cú lao chỉ là trang trí), mà không bằng lướt né (bằng không đánh thường đã gồm cú né).
  const chain = khien.lunge.len / khien.cd;
  console.log('     lao liên tục ' + chain.toFixed(0) + ' px/s · đi bộ 56 px/s');
  eq('bấm liên tục thì đi nhanh hơn đi bộ', chain > 56, true);
  eq('mà vẫn chậm hơn lướt né', chain < LAB.DASH_LEN / LAB.DASH_DUR, true);
  // Hồi vẫn dài hơn tấm hiệu ứng, nên nhát sau bắt đầu sau khi nhát trước vẽ xong -- `w.sw` chỉ
  // giữ được một nhát cho tư thế tay và cho `guard`, và hai nhát chồng nhau là hai nhát tranh nó.
  eq('hồi vẫn dài hơn tấm hiệu ứng', khien.cd > khien.dur, true);
}
// `null` cho inp: không có WASD nào bấm, nên mọi chỗ hero dịch được đều là do chính nhát đánh.
// Chạy dài hơn `lunge.dur` vài khung để cú trượt kết thúc trọn vẹn trong lúc đo.
function lunged(id, dx, dy, mut) {
  const w = bench(id);
  if (mut) mut(w);
  const x0 = w.hero.x, y0 = w.hero.y;
  LAB.swing(w, w.hero.x + dx, w.hero.y + dy);
  for (let i = 0, n = Math.ceil(khien.lunge.dur * 60) + 3; i < n; i++) LAB.step(w, 1 / 60, null);
  return { w, dx: w.hero.x - x0, dy: w.hero.y - y0 };
}
const noLunge = Object.assign({}, khien); delete noLunge.lunge;
{
  const R = lunged('khien', 40, 0);
  console.log('     lao sang phải: ' + R.dx.toFixed(1) + ' / ' + R.dy.toFixed(1) + ' px');
  near('đi đúng len px theo hướng ngắm', R.dx, khien.lunge.len, 0.5);
  near('không lệch ngang', R.dy, 0, 1e-6);
  // Cùng bảng số, cùng input, khác đúng một trường: chứng minh cú đi là của `lunge` chứ không
  // của riêng con khiên -- vũ khí thứ bảy chỉ cần thêm trường ấy là có cú lao.
  const N = lunged('khien', 40, 0, w => { w.wp = noLunge; });
  eq('bỏ trường lunge thì đứng yên', N.dx, 0);
  const K = lunged('kiem', 40, 0);
  eq('vũ khí khác không tự đi', K.dx === 0 && K.dy === 0, true);
  // Trục dọc phải mang squash: thế giới nhìn 3/4, lao lên bắc mà đi đủ 36 px thì hero trượt ra
  // khỏi chính tấm hiệu ứng của mình.
  const U = lunged('khien', 0, -60);
  near('lao lên bắc thì ngắn lại đúng squash', U.dy, -khien.lunge.len * khien.squash, 0.5);
  near('lao lên bắc không lệch ngang', U.dx, 0, 1e-6);
  const L = lunged('khien', -40, 0);
  near('lao sang trái là đi ngược lại', L.dx, -khien.lunge.len, 0.5);
}
{
  // Lao vào tường thì dừng ở tường: `step` kẹp `h.dsh` vào đúng BOUND mà bước đi vẫn dùng, nên
  // chuyện này không cần mã mới -- nhưng nó là chỗ dễ mất nhất nếu ai đó tự viết lại cú lướt.
  const w = bench('khien');
  w.hero.x = LAB.BOUND.x1 - 10;
  LAB.swing(w, w.hero.x + 40, w.hero.y);
  for (let i = 0; i < 20; i++) LAB.step(w, 1 / 60, null);
  near('dừng đúng ở mép sân', w.hero.x, LAB.BOUND.x1, 1e-6);
}
{
  // Cú lao *không* cho bất tử và *không* tiêu hồi chiêu của lướt né. Đây là ranh giới giữ cho
  // ba slot chiêu còn ý nghĩa: nếu đòn đánh thường đã né được đòn thì chẳng ai cần lướt nữa.
  const w = bench('khien');
  w.hero.inv = 0;
  LAB.swing(w, w.hero.x + 40, w.hero.y);
  let iv = 0;
  for (let i = 0; i < 20; i++) { LAB.step(w, 1 / 60, null); iv = Math.max(iv, w.hero.inv); }
  eq('lao không cho bất tử', iv, 0);
  eq('lao không tiêu hồi lướt né', w.dcd, 0);
  const w2 = bench('khien');
  LAB.dash(w2, 1, 0);
  eq('còn lướt né mới có bất tử', w2.hero.inv > 0, true);
}
{
  // Tầm hiệu dụng là `len + range` mà không có trường tầm thứ hai: `swingOrigin` đọc chỗ hero
  // đang đứng ở từng khung, nên cái nón sát thương tự đi theo chân. Con quái đứng ngoài tầm
  // lúc bấm và trong tầm lúc cạnh khiên tới -- bỏ trường `lunge` là nó không bị gì.
  const far = khien.range + khien.lunge.len * 0.55;
  function reach(mut) {
    const w = bench('khien');
    if (mut) mut(w);
    const f = target(w, 'slime', far, 0);
    f.hp = f.maxhp = 1e6;
    LAB.swing(w, w.hero.x + far, w.hero.y);
    for (let i = 0; i < 60; i++) LAB.step(w, 1 / 60, null);
    return Math.round(1e6 - f.hp);
  }
  const withL = reach(null), without = reach(w => { w.wp = noLunge; });
  console.log('     bia ở ' + far.toFixed(0) + 'px: có lao ' + withL + ' · không lao ' + without);
  eq('cú lao mang cả hộp sát thương đi theo', withL > 0, true);
  eq('đứng tại chỗ thì với không tới', without, 0);
}
{
  // Lướt *qua* con quái. Đây là chỗ con khiên từng trượt đòn: cả cú xông chỉ đo cái nón đúng hai
  // lần và cả hai đều sau khi chân đã dừng, nên con vừa bị xuyên qua lúc đó đã nằm sau lưng và
  // phép thử góc chối nó -- người chơi thấy cạnh khiên đi hết người con quái mà máu nó không tụt.
  // `swingHit` gom mẫu mỗi khung suốt quãng lao, nên tập ăn đòn là cái nón *trượt dọc* đường xông.
  function ram(dx, dy) {
    const w = bench('khien');
    const f = target(w, 'slime', dx, dy);
    f.hp = f.maxhp = 1e6;
    LAB.swing(w, w.hero.x + 40, w.hero.y);
    for (let i = 0; i < 60; i++) LAB.step(w, 1 / 60, null);
    return { dmg: Math.round(1e6 - f.hp), behind: w.hero.x - f.x };
  }
  const thru = ram(20, 0);
  console.log('     xông qua bia ở 20px: ' + thru.dmg + ' dmg · lúc đánh bia ở sau lưng '
    + thru.behind.toFixed(0) + 'px');
  // Hai điều khoản này *cùng nhau* mới là cái được kiểm: bia nằm sau lưng xa hơn nửa tầm nón, tức
  // là hình học lúc đánh không cách nào với tới nó, mà nó vẫn ăn đủ hai nhịp.
  eq('bị xông qua thì lúc đánh đã ở sau lưng', thru.behind > khien.range * 0.5, true);
  near('mà vẫn ăn đủ cả hai nhịp', thru.dmg, khien.dmg + khien.dmg * 1.5, 1);
  // Không phải "cứ ở gần là trúng": con đứng *sau lưng* ngay từ lúc bấm chưa bao giờ nằm trong
  // hình vẽ, và cái nón trượt cũng không đi qua nó. Gom bằng một vòng tròn quanh chân thì đỏ ở đây.
  eq('còn con đứng sẵn sau lưng thì không', ram(-30, 0).dmg, 0);
}
{
  // Giương khiên: cùng đúng trường `guard` mà đao dùng, nên chỉ cần chứng minh cửa sổ mở đúng
  // bằng bề dài nhát vung và đỡ tốt hơn đao. God mode phải tắt và bất tử phải bằng 0, bằng
  // không đòn bị né và phép nhân không bao giờ chạy tới.
  eq('khiên đỡ tốt hơn đao', khien.guard < dao.guard, true);
  const w = bench('khien');
  w.god = false; w.hero.inv = 0;
  LAB.swing(w, w.hero.x + 40, w.hero.y);
  LAB.step(w, 1 / 60, null);
  eq('đang vung', !!w.sw, true);
  eq('vung thì chịu ít đòn', LAB.hitHero(w, 100, [1, 1, 1]), Math.round(100 * khien.guard));
  while (w.sw) LAB.step(w, 1 / 60, null);
  w.hero.inv = 0;
  eq('vung xong thì hết đỡ', LAB.hitHero(w, 100, [1, 1, 1]), 100);
  // Và hết vung là hero lấy lại chân: `h.dsh` phải cạn từ lâu trước khi tấm sheet chạy hết.
  eq('vung xong hero tự đi được', w.hero.dsh <= 0, true);
}

// ---- 7. Rìu: một nhịp, chặt què chân ---------------------------------------------
console.log('\n-- rìu · một nhịp --');
const riu = WP.riu;
const MELEE = LAB.WEAPONS.filter(x => !x.shot);
eq('rìu đúng một nhịp', riu.hits.length, 1);
eq('rìu là vũ khí cận chiến duy nhất một nhịp',
   MELEE.filter(x => x.hits.length === 1).length, 1);
// Một nhịp thì con số phải to: cả cái đòn nằm gọn trong một lần `hurt`, nên nếu `dmg` không
// phải to nhất bảng thì rìu chỉ là một vũ khí chậm mà không được gì.
eq('rìu có dmg lớn nhất', riu.dmg, Math.max(...MELEE.map(x => x.dmg)));
eq('rìu hồi lâu nhất', riu.cd, Math.max(...MELEE.map(x => x.cd)));
eq('rìu không cộng hẩy theo nhịp', riu.pushStep, 0);   // không có nhịp sau để cộng vào
eq('rìu chặt què chân', riu.maul > 1, true);
{
  // `maul` treo trên *nhịp kết*, và nhịp duy nhất của rìu phải chính là nhịp kết. Đây là điều
  // khoản mà `fin = i === last` trong js/weapon.js giữ; hồi nó còn là `last > 0 && i === last`
  // thì cả cơ chế này im lặng không chạy mà không ai đỏ.
  const w = bench('riu');
  const f = target(w, 'brute', 26, 0);
  const hp0 = f.hp;
  beats(w, riu, 0);
  eq('nhịp duy nhất có ăn', hp0 - f.hp > 0, true);
  near('trúng rìu là bị chặt què', f.slow, riu.maul, 1e-6);
  // Chỉ nhịp cuối: cùng một nhịp ấy, chứng minh nó nằm trong cửa sổ nhịp kết chứ không phải
  // lọt lưới nhờ cả nhát vung được quét một lượt.
  const w2 = bench('riu');
  const f2 = target(w2, 'brute', 26, 0);
  beats(w2, riu, 0, { from: LAST(riu) });
  near('quét riêng nhịp kết cũng què', f2.slow, riu.maul, 1e-6);
  // Và vũ khí không có `maul` thì không chạm vào trường ấy: cú què là của trường, không của
  // riêng con rìu.
  const w3 = bench('kiem');
  const f3 = target(w3, 'brute', 26, 0);
  beats(w3, kiem, 0);
  eq('vũ khí khác không làm què', f3.slow, 0);
}
{
  // Một vũ khí một nhịp *nói chung* phải nhận đủ quyền nhịp kết, không riêng gì `maul`. Dựng
  // một cây kiếm giả chỉ còn một nhịp và treo `exec` lên: nếu `fin` lại bị chặn thì chỗ này đỏ.
  const one = Object.assign({}, kiem, { hits: [kiem.hits[0]], exec: 1 });
  const bare = Object.assign({}, one); delete bare.exec;
  const bite = wp => {
    const w = bench('kiem');
    const f = target(w, 'brute', 26, 0);
    // Máu tối đa to và máu hiện tại 2%: `exec` gần đủ phần mà con quái không chết giữa lúc đo --
    // chết là `hp` kẹp về 0 và hai trường hợp ra cùng một số dù có exec hay không.
    f.maxhp = 1e6; f.hp = f.maxhp * 0.02;
    const hp0 = f.hp;
    beats(w, wp, 0);
    return hp0 - f.hp;
  };
  const withE = bite(one), without = bite(bare);
  console.log('     một nhịp giả: có exec ' + withE + ' · không exec ' + without);
  eq('vũ khí một nhịp vẫn được quyền nhịp kết', withE > without, true);
}
{
  // Què chân phải *có nghĩa* ở js/world.js, bằng không `maul` chỉ là một con số đẹp: cùng seed,
  // cùng con quái, khác đúng trường `slow`.
  const walk = slow => {
    const w = bench('riu');
    const f = target(w, 'slime', 70, 0, false);
    if (slow) f.slow = 1e9;
    const x0 = f.x;
    for (let i = 0; i < 40; i++) LAB.step(w, 1 / 60, null);
    return Math.abs(f.x - x0);
  };
  const free = walk(false), lame = walk(true);
  console.log('     đi trong 40 khung: thường ' + free.toFixed(1) + ' · què ' + lame.toFixed(1) + ' px');
  eq('bị què thì đi chậm lại thật', lame < free, true);
}
{
  // Nện xuống *một điểm*, không quét một cái nón. Cả cơ chế nằm ở chỗ tâm vùng nổ dịch
  // `slam.dist` px về phía nhắm: vòng bán kính `slam.r` ấy không tính từ chân hero nữa.
  eq('rìu nện một điểm', !!riu.slam, true);
  eq('rìu không quét nón', riu.arc, undefined);
  // Một nguồn duy nhất cho tầm: `range` suy ra từ `slam` ở vòng hậu kỳ dưới bảng vũ khí, nên
  // bảng chỉ số, vòng ngắm của js/shell.js và `hitCone` không thể nói ba con số khác nhau.
  eq('tầm rìu suy ra từ slam', riu.range, riu.slam.dist + riu.slam.r);
  const bite = dx => {
    const w = bench('riu');
    const f = target(w, 'brute', dx, 0);
    const hp0 = f.hp;
    beats(w, riu, 0);
    return hp0 - f.hp > 0;
  };
  const D = riu.slam.dist;
  eq('đúng chỗ lưỡi rơi thì ăn', bite(D), true);
  // Hai bài dưới đây là chỗ vòng-dịch-về-trước khác một vòng quanh hero, và khác theo *hai
  // chiều*: xa hơn cả bán kính mà vẫn ăn, còn dán sát người mà lệch phía sau thì không.
  eq('xa hơn bán kính vẫn ăn nếu gần điểm nện', riu.slam.r < D + 22 && bite(D + 22), true);
  eq('đứng sát hero nhưng sau lưng thì không ăn', bite(-30), false);
  eq('quá tầm thì không ăn', bite(riu.range + 40), false);
  // Hẩy chạy theo bán kính *từ điểm nện*, không từ hero (`hitCone` lấy góc từ tâm vùng). Nên con
  // đứng lọt giữa hero và điểm nện bị đẩy *về phía hero*: muốn dọn chỗ thì nện ra xa, chứ không
  // nện vào chân mình. Đây là hệ quả của thiết kế, không phải lỗi -- ghim lại để khỏi ai "sửa".
  const w = bench('riu');
  const f = target(w, 'brute', Math.round(D * 0.4), 0);
  beats(w, riu, 0);
  eq('rìu có hẩy', riu.push > 0, true);
  eq('con lọt trong bị hẩy về phía hero', f.vx < 0, true);
}

// ---- 8. Thương: với xa, xuyên hàng, thưởng ở mũi ---------------------------------
console.log('\n-- thương · tầm và mũi --');
const thuong = WP.thuong;
eq('thương với xa nhất', thuong.range, Math.max(...MELEE.map(x => x.range)));
eq('thương có nón hẹp nhất', thuong.arc,
   Math.min(...MELEE.filter(x => x.arc !== undefined).map(x => x.arc)));
eq('thương đâm thẳng', !!thuong.thrust, true);
// Sheet của thương vẽ mũi chỉ sang *đông*, nên `axis` phải là 0: `rot = ang - axis`, tức là
// axis = 0 mới đưa cái +x của tấm sheet về trùng hướng nhắm. Đây là chỗ đã sai một lần -- để
// SPRITE_UP như mấy cây quét thì cây thương đâm ngang trong khi ảnh chỉ lên trời.
eq('trục thương là +x của sheet', thuong.axis, 0);
eq('thương thưởng ở mũi', thuong.tip > 1, true);
const noTip = Object.assign({}, thuong); delete noTip.tip;
// Đo cùng một bia, khác đúng trường `tip`: chênh lệch nào cũng là của cơ chế, không của bảng số.
function poke(wp, dx, opt) {
  const w = bench('thuong');
  const f = target(w, 'slime', dx, 0);
  f.hp = f.maxhp = 1e6;
  beats(w, thuong === wp ? thuong : wp, 0, opt);
  return Math.round(1e6 - f.hp);
}
{
  const near0 = poke(thuong, 20), near1 = poke(noTip, 20);
  const far0 = poke(thuong, Math.round(thuong.range * 0.95));
  const far1 = poke(noTip, Math.round(thuong.range * 0.95));
  console.log('     áp mặt ' + near0 + '/' + near1 + ' · tới mũi ' + far0 + '/' + far1
              + ' (có mũi / không mũi)');
  eq('áp mặt thì mũi không thưởng gì', near0, near1);
  eq('bỏ trường tip thì xa gần bằng nhau', far1, near1);
  eq('tới mũi thì đau hơn áp mặt', far0 > near0, true);
  near('phần thưởng đúng bằng tip', far0 / far1, thuong.tip, 0.08);
  // Dải thưởng phải *liên tục*: đứng lưng chừng được một phần, không phải bật/tắt ở một mốc.
  const mid = poke(thuong, Math.round(thuong.range * 0.62));
  console.log('     lưng chừng ' + mid);
  eq('lưng chừng nằm giữa hai đầu', mid > near0 && mid < far0, true);
}
{
  // Và thưởng ở *mọi* nhịp, không riêng nhịp kết: đây là chỗ `tip` khác `exec`/`cut`/`maul`.
  // Một cây thương dạy người chơi đứng đâu, nên nó phải trả tiền ngay từ nhịp đầu.
  const first = { to: (thuong.hits[0] + 0.5) / thuong.frames };
  const f0 = poke(thuong, Math.round(thuong.range * 0.95), first);
  const f1 = poke(noTip, Math.round(thuong.range * 0.95), first);
  console.log('     chỉ nhịp đầu: có mũi ' + f0 + ' · không mũi ' + f1);
  eq('nhịp đầu cũng được thưởng mũi', f0 > f1, true);
}
{
  // Xuyên hàng không cần mã mới: nón 0.30 rad là một cái *vạch*, nên hai con đứng cùng trục
  // đều nằm trong đó. Cái phải chứng minh là nón hẹp ấy vẫn với tới cả hai, và một cây nón
  // rộng-tầm-ngắn thì không.
  const line = wp => {
    const w = bench('thuong');
    const a = target(w, 'slime', 24, 0), b = target(w, 'slime', 64, 0);
    const h0 = a.hp, h1 = b.hp;
    beats(w, wp, 0);
    return [h0 - a.hp > 0, h1 - b.hp > 0];
  };
  const both = line(thuong);
  eq('thương xuyên cả hàng', both[0] && both[1], true);
  const g = line(WP.gang);
  eq('găng chỉ tới con đứng gần', g[0] && !g[1], true);
}

// ---- 9. Vuốt: vết xé cộng dồn -----------------------------------------------------
console.log('\n-- vuốt · vết xé --');
const vuot = WP.vuot;
eq('vuốt đánh nhẹ nhất mỗi nhịp', vuot.dmg, Math.min(...MELEE.map(x => x.dmg)));
eq('vuốt nhiều nhịp', vuot.hits.length >= 4, true);
eq('vuốt có vết xé', !!vuot.rend, true);
const noRend = Object.assign({}, vuot); delete noRend.rend;
function claw(w, wp, f) {
  const h0 = f.hp;
  beats(w, wp || vuot, 0);
  return h0 - f.hp;
}
{
  // Một nhát vung tự xây chồng cho chính nó: `amp` đọc `f.rnd` *trước* khi `onHit` cộng thêm
  // (js/world.js: hitCone gọi hurt rồi mới gọi onHit), nên nhịp đầu ăn không, nhịp sau ăn dần.
  const w = bench('vuot');
  const f = target(w, 'brute', 22, 0);
  f.hp = f.maxhp = 1e6;
  const s1 = claw(w, null, f);
  eq('một nhát vung để lại đúng số vết', f.rnd, Math.min(vuot.rend.max, vuot.hits.length));
  const s2 = claw(w, null, f);
  eq('vết xé chạm trần', f.rnd, vuot.rend.max);
  const s3 = claw(w, null, f);
  eq('trần rồi thì không lên nữa', f.rnd, vuot.rend.max);
  console.log('     ba nhát liền: ' + s1 + ' → ' + s2 + ' → ' + s3);
  eq('càng bám càng đau', s3 > s1, true);
  eq('nhát thứ ba không đau hơn nhát thứ hai bao nhiêu', s3 - s2 < s2 - s1, true);
  // Và cả phần cộng dồn ấy là của trường `rend`: bỏ trường ra thì nhát nào cũng như nhát nào.
  const w2 = bench('vuot');
  const g = target(w2, 'brute', 22, 0);
  g.hp = g.maxhp = 1e6;
  const b1 = claw(w2, noRend, g), b2 = claw(w2, noRend, g);
  eq('bỏ trường rend thì không cộng dồn', b1, b2);
  eq('bỏ trường rend thì không có vết nào', g.rnd, 0);
  eq('có rend thì nhát đầu đã đau hơn', s1 > b1, true);
}
{
  // Chồng vết nằm trên *một con*, và đó chính là điều nó nói: kiên nhẫn với một mục tiêu.
  const w = bench('vuot');
  const a = target(w, 'brute', 22, 0);
  const b = target(w, 'brute', -60, 0);                // sau lưng: ngoài nón
  beats(w, vuot, 0);
  eq('con bị đánh có vết', a.rnd > 0, true);
  eq('con bên cạnh không có vết', b.rnd, 0);
}
{
  // Hết hạn là rụng cả chồng một lượt, không rụng từng vết: thả mục tiêu ra thì mất hết công,
  // nên vũ khí này hỏi "có dám đứng lại với nó không" chứ không hỏi "có nhớ đánh thêm không".
  const w = bench('vuot');
  const f = target(w, 'brute', 22, 0);
  f.hp = f.maxhp = 1e6;
  claw(w, null, f);
  const kept = vuot.rend.life - 0.2;
  for (let i = 0; i < Math.floor(kept * 60); i++) LAB.step(w, 1 / 60, null);
  eq('trong thời hạn thì vết còn nguyên', f.rnd, Math.min(vuot.rend.max, vuot.hits.length));
  for (let i = 0; i < 20; i++) LAB.step(w, 1 / 60, null);
  eq('hết hạn thì rụng cả chồng', f.rnd, 0);
  eq('đồng hồ vết cũng về không', f.rndT, 0);
  // Đánh lại thì đồng hồ chạy lại từ đầu -- nếu không, chồng vết sẽ hết hạn giữa lúc đang bám.
  claw(w, null, f);
  const t0 = f.rndT;
  for (let i = 0; i < 30; i++) LAB.step(w, 1 / 60, null);
  const t1 = f.rndT;
  claw(w, null, f);
  eq('đánh tiếp thì gia hạn cả chồng', f.rndT > t1 && f.rndT === t0, true);
}

// ---- 10. Ngắm lại nhát đang chạy --------------------------------------------------
// Đánh thường trên điện thoại nổ ngay ở cú chạm, nên cử chỉ kéo ngắm chỉ có nghĩa nếu nó sửa
// được *chính nhát vừa bấm*. Bốn vũ khí còn kịp: cung bật dây ở nhịp 8, khiên còn đang lao,
// thương đâm ở nhịp 5, rìu nện ở nhịp 7 -- muộn nhất bảng.
console.log('\n-- ngắm lại nhát đang chạy --');
{
  // Bấm sang phải rồi ngắm lại sang trái *trước* nhịp bật dây: cả ba mũi phải bay sang trái. Bia
  // đặt hai bên, cùng khoảng cách, nên chỉ có góc quyết định con nào ăn đòn.
  function volley(reAt) {
    const w = bench('cung');
    const R = target(w, 'slime', 90, 0), L = target(w, 'slime', -90, 0);
    R.hp = R.maxhp = 1e6; L.hp = L.maxhp = 1e6;
    LAB.swing(w, w.hero.x + 60, w.hero.y);
    for (let i = 0; i < 120; i++) {
      if (reAt !== null && Math.abs(i / 60 - reAt) < 1 / 120) LAB.reswing(w, w.hero.x - 60, w.hero.y);
      LAB.step(w, 1 / 60, null);
    }
    return { r: Math.round(1e6 - R.hp), l: Math.round(1e6 - L.hp) };
  }
  const beat = cung.hits[0] / cung.fps;
  const plain = volley(null), turned = volley(beat * 0.5), late = volley(beat + 0.1);
  console.log('     nhịp bật dây ở ' + beat.toFixed(2) + 's · không ngắm lại: '
              + plain.r + '/' + plain.l + ' · ngắm lại sớm: ' + turned.r + '/' + turned.l
              + ' · ngắm lại muộn: ' + late.r + '/' + late.l);
  eq('không ngắm lại thì bay theo cú bấm', plain.r > 0 && plain.l === 0, true);
  eq('ngắm lại trước khi bật dây thì cả loạt đổi hướng', turned.l > 0 && turned.r === 0, true);
  near('đổi hướng không đổi sức', turned.l, plain.r, 1);
  eq('mũi đã rời dây thì không đổi được nữa', late.r > 0 && late.l === 0, true);
}
{
  // Bẻ cú lao giữa đường: quãng đi vẫn đúng `len` (chỉ đổi hướng, không đổi tốc), và đường đi là
  // một nét gấp -- nửa đầu sang phải, nửa sau lên bắc.
  const w = bench('khien');
  const x0 = w.hero.x, y0 = w.hero.y;
  LAB.swing(w, w.hero.x + 40, w.hero.y);
  const half = Math.round(khien.lunge.dur * 30);
  for (let i = 0; i < half; i++) LAB.step(w, 1 / 60, null);
  const midx = w.hero.x - x0;
  LAB.reswing(w, w.hero.x, w.hero.y - 60);
  for (let i = 0; i < 40; i++) LAB.step(w, 1 / 60, null);
  // Quãng *đi* chứ không phải khoảng dời chỗ: đường đi là một nét gấp, nên hai cạnh phải cộng lại
  // đúng `len` (trục dọc quy về hệ đã nén, đúng như mọi phép đo tầm khác).
  const legN = (y0 - w.hero.y) / khien.squash, gone = midx + legN;
  console.log('     bẻ ở giữa: đi ' + midx.toFixed(1) + 'px sang phải rồi '
              + legN.toFixed(1) + 'px lên bắc · tổng quãng ' + gone.toFixed(1) + 'px');
  eq('nửa đầu vẫn đi theo cú bấm', midx > 8, true);
  eq('bẻ rồi thì đi lên bắc', legN > 8, true);
  near('bẻ xong không đi ngang thêm nữa', w.hero.x - x0, midx, 1e-6);
  near('bẻ hướng không cho đi thêm quãng', gone, khien.lunge.len, 1.5);
}
{
  // Thương và rìu vào cùng cửa này vì cùng một lý do với cung và khiên: lúc bấm thì *chưa có
  // kết quả gì cả*. Thương đâm ở nhịp 5/30 khung (0,17 s), rìu nện ở nhịp 7/22 khung (0,32 s) --
  // muộn hơn cả nhịp bật dây của cung. Bia đặt hai bên đối xứng nên chỉ có góc quyết định con
  // nào ăn đòn, và cả ba trường hợp (không ngắm lại / ngắm lại kịp / ngắm lại muộn) chạy trên
  // cùng một sân.
  const both = (wp, dx, reAt) => {
    const w = bench(wp.id);
    const R = target(w, 'brute', dx, 0), L = target(w, 'brute', -dx, 0);
    R.hp = R.maxhp = 1e6; L.hp = L.maxhp = 1e6;
    let turned = null;
    LAB.swing(w, w.hero.x + dx, w.hero.y);
    for (let i = 0; i < 80; i++) {
      if (reAt !== null && Math.abs(i / 60 - reAt) < 1 / 120)
        turned = LAB.reswing(w, w.hero.x - dx, w.hero.y);
      LAB.step(w, 1 / 60, null);
    }
    return { r: Math.round(1e6 - R.hp), l: Math.round(1e6 - L.hp), turned };
  };
  for (const [wp, dx] of [[thuong, 60], [riu, riu.slam.dist]]) {
    const beat = wp.hits[0] / wp.fps;
    const plain = both(wp, dx, null), early = both(wp, dx, beat * 0.5),
          late = both(wp, dx, beat + 0.12);
    console.log('     ' + wp.id + ': nhịp đầu ở ' + beat.toFixed(2) + 's · thẳng '
                + plain.r + '/' + plain.l + ' · ngắm lại sớm ' + early.r + '/' + early.l
                + ' · muộn ' + late.r + '/' + late.l);
    eq(wp.id + ': không ngắm lại thì ăn theo cú bấm', plain.r > 0 && plain.l === 0, true);
    eq(wp.id + ': ngắm lại được', early.turned, true);
    eq(wp.id + ': ngắm lại kịp thì đòn đổi hướng', early.l > 0 && early.r === 0, true);
    near(wp.id + ': đổi hướng không đổi sức', early.l, plain.r, 1);
    // Muộn thì chỉ *phần chưa xảy ra* đổi hướng. Rìu một nhịp: nện rồi là xong, ngắm lại không
    // lấy lại được gì. Thương hai nhịp: mũi đầu vẫn ở hướng cũ, mũi sau theo hướng mới -- đúng
    // như nó phải thế, và đó là chỗ một cây nhiều nhịp khác một cây một nhịp.
    eq(wp.id + ': nhịp đã đi qua vẫn ăn ở hướng cũ', late.r > 0, true);
    eq(wp.id + ': nhịp còn lại đi theo hướng mới', late.l > 0, wp.hits.length > 1);
  }
}
{
  // Không bẻ được một cú lướt né: `dash()` cho 0,30 s bất tử cho một cú trượt 0,155 s, và
  // "không lái được" là cả điều khoản của nó. Bằng không đòn đánh thường của khiên đã thành
  // một cú né có lái.
  const w = bench('khien');
  LAB.dash(w, 1, 0);
  const vx = w.hero.dvx, vy = w.hero.dvy;
  LAB.reswing(w, w.hero.x, w.hero.y - 60);
  eq('lướt né vẫn giữ nguyên hướng', w.hero.dvx === vx && w.hero.dvy === vy, true);
}
{
  // Năm vũ khí còn lại không đi qua đường này: chúng đứng tại chỗ quét một cái nón, và cho quét
  // lại góc giữa một chuỗi nhịp là cho cái nón đi vòng quanh hero. Danh sách này lấy *mọi* vũ khí
  // không có `reaim` chứ không viết tay mấy cái id, nên vũ khí thứ mười cũng bị kiểm ngay lúc thêm
  // vào bảng -- đúng cái lỗi mà ba vũ khí vừa thêm đã lọt qua.
  for (const wp of LAB.WEAPONS) {
    if (wp.reaim) continue;
    const id = wp.id, w = bench(id);
    LAB.swing(w, w.hero.x + 40, w.hero.y);
    LAB.step(w, 1 / 60, null);
    const a0 = w.sw ? w.sw.ang : 0;
    eq(id + ': ngắm lại không ăn', LAB.reswing(w, w.hero.x, w.hero.y - 60), false);
    eq(id + ': góc không đổi', w.sw ? w.sw.ang : 0, a0);
  }
  // Và không có nhát nào đang chạy thì cũng không có gì để ngắm lại.
  eq('không đang vung thì không ăn', LAB.reswing(bench('cung'), 0, 0), false);
  // Ai được ngắm lại là một *quyết định thiết kế*, nên nó được ghim ra thành tên: một cái `!!(shot
  // || lunge || thrust || slam)` chép lại ở đây chỉ chứng minh phép gán ở js/weapon.js chạy đúng,
  // còn dòng này đỏ lên khi có ai gắn `thrust` lên cây găng.
  eq('đúng bốn vũ khí ngắm lại được',
     LAB.WEAPONS.filter(x => x.reaim).map(x => x.id).join(','), 'cung,khien,riu,thuong');
  // Và nút ĐÁNH của bản điện thoại phải đọc *đúng cái cờ ấy*. Hai bên đọc hai danh sách khác nhau
  // là kiểu lỗi im lặng nhất ở đây: nút kéo ngắm được mà nhát đánh không đổi hướng (hoặc ngược
  // lại), không có gì hỏng, chỉ có cử chỉ không có tác dụng. js/shell.js không nạp được trong node
  // (nó cần DOM), nên chỗ này kiểm bằng chữ.
  const shellSrc = fs.readFileSync(path.join(root, 'js', 'shell.js'), 'utf8');
  eq('nút ĐÁNH đọc cờ reaim', /wpAim = weapon && !!sk\.reaim;/.test(shellSrc), true);
  eq('nút ĐÁNH không giữ danh sách riêng', /sk\.shot \|\| sk\.lunge/.test(shellSrc), false);
}

// ---- bảng chỉ số hiển thị --------------------------------------------------------
console.log('\n-- chỉ số hiển thị --');
for (const wp of LAB.WEAPONS) {
  const s = LAB.weaponStat(wp);
  eq(wp.id + ': không nói dối về dmg', s.indexOf('undefined') < 0, true);
  console.log('     ' + wp.label + ': ' + s);
}

// ---- vẽ được: 120 khung mỗi vũ khí, có quái, có cảnh báo ----------------------
console.log('\n-- 120 khung mỗi vũ khí --');
const px = new Uint8ClampedArray(LAB.W * LAB.H * 4);
for (const wp of LAB.WEAPONS) {
  const w = LAB.newWorld(555, { map: LAB.MAPS[0].id, wp: wp.id, slots: [0, 1, 2] });
  let ok = 'ok';
  try {
    for (let f = 0; f < 120; f++) {
      // Bấm liên tục để cửa sổ chuỗi, đạn bay, cắt phép và cắm chân đều thật sự chạy qua
      // đường vẽ chứ không chỉ qua đường tính.
      if (w.wcd <= 0) LAB.swing(w, w.hero.x + 40, w.hero.y - 6);
      LAB.step(w, 1 / 60, { dx: 1, dy: f & 1 ? 1 : -1, ax: w.hero.x + 40, ay: w.hero.y });
      LAB.renderWorld(w);
      LAB.resolve(px, true);
    }
  } catch (e) { ok = 'NÉM LỖI ' + (e && e.message || e); }
  eq(wp.id + ': vẽ được', ok, 'ok');
  console.log('     ' + w.dmg + ' dmg · ' + w.kills + ' hạ · ' + w.heals + ' hồi · '
    + w.fxs.length + ' fx');
}

// Ba trạng thái ở trên không chắc chắn xuất hiện trong 120 khung ngẫu nhiên kia -- một cú
// cắt phép cần đúng lúc quái đang niệm, và cửa sổ chuỗi cần nhịp cuối trúng -- nên dựng
// riêng từng cái rồi vẽ, vì một đường vẽ chưa bao giờ chạy là một đường vẽ chưa được kiểm.
console.log('\n-- vẽ riêng ba trạng thái mới --');
function draws(name, setup) {
  const w = bench('gang');
  let ok = 'ok';
  try {
    setup(w);
    for (let f = 0; f < 30; f++) { LAB.step(w, 1 / 60, null); LAB.renderWorld(w); LAB.resolve(px, true); }
  } catch (e) { ok = 'NÉM LỖI ' + (e && e.message || e); }
  eq(name, ok, 'ok');
}
draws('vẽ được vòng cắt phép', w => {
  const f = target(w, 'brute', 20, 0);
  f.frozen = 0;
  LAB.startCast(w, f, 'quake_slam');
  LAB.cutCast(w, f, WP.gang.cut);
  if (!w.fxs.some(e => e.sk.id === 'cut')) throw new Error('không có fx cắt phép');
});
draws('vẽ được cửa sổ chuỗi', w => {
  w.wp = WP.kiem;
  w.momo = WP.kiem.momentum.win;
  LAB.swing(w, w.hero.x + 40, w.hero.y);
});
draws('vẽ được vòng đỡ đòn', w => {
  w.wp = WP.dao;
  LAB.swing(w, w.hero.x + 40, w.hero.y);
});
// Vệt lao chỉ tồn tại khi chỗ đứng lúc bấm khác chỗ đang đứng, nên nó là một nhánh vẽ có điều
// kiện -- và một nhánh chưa bao giờ chạy là một nhánh chưa được kiểm.
draws('vẽ được vệt lao', w => {
  w.wp = WP.khien;
  LAB.swing(w, w.hero.x + 40, w.hero.y);
});

console.log('\n' + (bad ? bad + ' LỖI' : 'tất cả đều đạt'));
process.exit(bad ? 1 : 0);
