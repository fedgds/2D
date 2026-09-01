// Kiểm chế độ solo 1v1: đối thủ soi gương, hai mươi lăm hàng đòn của nó, và bộ não, không cần
// browser.
//
// Chạy: node tools/check-duel.js
//
// Nạp y như check-boss.js: nối mọi <script src> của index.html theo đúng thứ tự trang rồi lấy
// globalThis.LAB, nên nó bắt luôn lỗi thứ tự file -- và với file này thì đó không phải chuyện nhỏ,
// vì js/duel.js *mở rộng* KIND, GRIDS, ANIM và FOE_ABIL bằng cách gán vào chúng: nạp nó trước
// js/foe-abil.js là ném ReferenceError ngay dòng đầu.
//
// Kiểm **lời hứa**, không kiểm lại con số trong bảng. Năm lời hứa mà chế độ này phải giữ:
//
//   1. Thêm một đối thủ soi gương **không được đụng vào đàn quái**: nó không tự sinh ra trong sân
//      thường, và nó không đếm vào bất kỳ phép đo nào về quái.
//   2. Vùng đã tô là vùng ăn đòn, y như bảy chiêu quái và mười hai chiêu boss -- và thêm một nửa
//      mà quái không cần: **mở đòn từ mép tầm thì đòn phải với tới**. Một AI mở một đòn mà người
//      chơi chỉ cần đứng im là trượt thì không phải một AI khó, mà là một AI tính sai.
//   3. `SK_THREAT` -- bảng duy nhất cho nó biết mười sáu chiêu người chơi ăn tới đâu -- phải khớp
//      với đúng cái `hitCircle` mà từng chiêu ấy gọi. Bán kính bị nướng trong thân hàm `hit()` của
//      js/skills.js nên không đọc ra được lúc chạy: bảng là một bản chép tay, và một bản chép tay
//      thì phải có người soát. Sai một hàng là một AI đứng trong lửa mà tưởng mình đứng ngoài.
//   4. Sân đấu là `w.room`, và `BOUND`/`CAMB` là **toàn cục**: rò một lần là mọi trận sau đó chơi
//      trong một cái sân hẹp.
//   5. Bộ não phải làm đúng ba việc theo đúng thứ tự -- ra khỏi vùng sắp nổ, thả đòn dùng được, giữ
//      băng khoảng cách của cây vũ khí nó rút được -- và **không** làm bốn việc: né thứ không kịp né,
//      né vệt của chính nó, chọn một đòn thiếu mana, rút máu người chơi bằng cách chạm vào.
//
// Sửa số trong bảng thì vẫn xanh; làm hỏng cơ chế thì đỏ.
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
function ge(name, got, want) {
  const ok = got >= want;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + '  = ' + got + (ok ? '' : '  (cần ≥ ' + want + ')'));
}
function le(name, got, want) {
  const ok = got <= want;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name + '  = ' + got + (ok ? '' : '  (cần ≤ ' + want + ')'));
}
function sec(s) { console.log('\n-- ' + s + ' --'); }
const r1 = v => Math.round(v * 10) / 10;

// ---- sân sạch ------------------------------------------------------------------------------------
// Không quái tự sinh, không boss tự đến, hero ở giữa map, và `god` tắt vì gần hết file này đo damage
// vào *nhân vật*. `vary`/`crit` về 0 y như bench() của check-weapons: 15% chí mạng nền cũng đủ làm
// một phép so "mất máu hay không" thành một phép tung xúc xắc.
LAB.applyMap(LAB.MAPS[0]);
function bench(seed) {
  const w = LAB.newWorld(seed || 7777, { map: LAB.MAPS[0].id, wp: 'kiem', slots: [0, 1, 2] });
  w.foes.length = 0; w.tels.length = 0; w.fxs.length = 0;
  w.spawnT = 1e9; w.kills = 0; w.boss = null; w.bossN = 0;
  w.god = false; w.vary = 0; w.crit = 0;
  w.hero.x = Math.round(LAB.WW * 0.5); w.hero.y = Math.round(LAB.WH * 0.5);
  LAB.snapCam(w);
  return w;
}
// Một đối thủ đứng yên, đủ xa để mọi hàng đều "với tới" mà không cần nó đi lại.
function caster(w, dx, dy) {
  const f = LAB.unit('rival', w.hero.x + (dx === undefined ? 40 : dx), w.hero.y + (dy || 0));
  f.frozen = 1e9;                       // stepTel bỏ qua đi lại + niệm chiêu khi frozen
  w.foes.push(f);
  return f;
}
// Bắt đầu một cast và trả về bản ghi telegraph. Phải rã đông trước: `stepTel` huỷ ngay chiêu của
// một con đang bị chặn. Truyền `seed` khi cần hai cast *giống hệt nhau*.
function cast(w, f, key, seed) {
  w.tels.length = 0;
  if (seed) w.rng = LAB.mulberry32(seed);
  f.frozen = 0; f.tel = null; f.chg = 0; f.rel = 0; f.dying = 0; f.hp = f.maxhp;
  return LAB.startCast(w, f, key) ? w.tels[w.tels.length - 1] : null;
}
// Chạy trọn một cast với hero đứng im ở một điểm *cục bộ chưa dẹt*, trả về số HP đã mất. Toạ độ
// truyền vào là toạ độ của `heroLocal` (js/foe-abil.js) chứ không phải toạ độ màn hình: cả hình vẽ
// lẫn phép kiểm trúng của ba shape gốc đều sống trong khung ấy, nên đo bằng khung ấy là đo đúng một
// thước với cái vòng đỏ mà người chơi nhìn thấy.
function runCast(w, e, lx, ly) {
  const h = w.hero, hp0 = h.hp;
  let n = 0;
  while (w.tels.indexOf(e) >= 0 && n++ < 900) {
    h.x = e.x + lx; h.y = e.y + ly * LAB.GSQ + 1;
    LAB.stepTel(w, e, 1 / 60, w.tels.indexOf(e));
  }
  return hp0 - h.hp;
}
// Nửa còn lại của lời hứa thứ hai, và nó cần một trật tự khác: đặt hero ở đúng khoảng cách `dq`
// **trước** khi `startCast` chạy, rồi *không* dời hero nữa. Vì `aim: 'hero'` chấm vùng lên chỗ nhân
// vật đang đứng và `aim: 'dir'` lấy hướng từ chỗ ấy, nên "mở đòn từ xa bao nhiêu" chỉ có nghĩa nếu
// khoảng cách đã đúng lúc đòn được mở. Đặt thuần ngang để `dq` không nén bằng đúng khoảng cách ấy.
function runFrom(w, f, key, dq, seed) {
  const h = w.hero;
  h.x = f.x - dq; h.y = f.y + 1;
  const e = cast(w, f, key, seed);
  if (!e) return -1;
  const hp0 = h.hp;
  let n = 0;
  while (w.tels.indexOf(e) >= 0 && n++ < 900) LAB.stepTel(w, e, 1 / 60, w.tels.indexOf(e));
  return hp0 - h.hp;
}
// Một trận solo thật: phòng đấu, đối thủ đã vào sân, bộ đồ đã rút. `d.wait` về 0 để không phải bước
// qua `DUEL_INTRO` giây mở màn trong mọi mục.
function arena(seed) {
  const w = bench(seed);
  LAB.startDuel(w);
  w.duel.wait = 0;
  const f = LAB.spawnRival(w);
  return { w: w, f: f };
}
// Khoảng cách hai bên trong khung không nén -- đúng thước `stepRival` lái chân bằng.
function dqOf(w, f) {
  const dx = w.hero.x - f.x, dy = (w.hero.y - 1) - f.y;
  return Math.hypot(dx, dy / LAB.GSQ);
}
// Khoảng cách trên màn hình từ tâm một vùng nguy hiểm tới thân đối thủ -- thước của `duelThreat`,
// và cũng là thước của `foesIn`, tức là thước mà sát thương thật dùng.
function scrOf(f, cx, cy) { return Math.hypot(f.x - cx, (f.y - f.h * 0.5) - cy); }

const IDX = {};
LAB.SKILLS.forEach((s, i) => { IDX[s.id] = i; });
// Hai mươi lăm hàng đòn của đối thủ, đọc từ hai bảng chứ không chép lại: thêm một chiêu hay một cây
// vũ khí là tự động thêm vào mọi mục dưới đây.
const ROWS = [];
for (const id of Object.keys(LAB.RIVAL_SK)) ROWS.push(['r_' + id, LAB.RIVAL_SK[id]]);
for (const wp of LAB.WEAPONS) ROWS.push(['w_' + wp.id, LAB.RIVAL_WP[wp.id]]);
// Mép ngoài mà *hình vẽ* hứa, đọc đúng như `heroIn`: vòng cộng bán kính thân nhân vật cho đĩa và
// hình quạt, nửa bề dày cộng bán kính thân cho làn.
function reachOf(A) { return A.shape === 'line' ? A.len : A.r; }
function tolOf(A) { return A.shape === 'line' ? A.thick * 0.9 + LAB.HERO_R : LAB.HERO_R; }
sec('đăng ký: một đối thủ soi gương, và đàn quái không hay biết');
{
  const K = LAB.KIND.rival;
  eq('KIND.rival có mặt', !!K, true);
  eq('rival: không phải boss', !K.boss, true);
  // `abil` rỗng là thứ *tắt* `tryCast`: nó thoát ngay ở `if (!list || !list.length) return false`,
  // nên toàn bộ việc chọn đòn thuộc về `stepRival` chứ không chia đôi với js/world.js. Một hàng
  // chiêu lọt vào đây là hai bộ não cùng bấm nút trên một cái tay.
  eq('rival: abil rỗng (tryCast phải im)', K.abil.length, 0);
  ge('rival: máu mở màn', K.hp, 1000);
  eq('rival: có tên tiếng Việt để HUD in ra', typeof K.label === 'string' && K.label.length > 0, true);

  // Không tự sinh. Hai phép kiểm chứ không một: vắng mặt trong `SPAWN_W` là điều kiện, còn
  // `pickKind` không bao giờ rút được nó là *hệ quả* -- và hệ quả là thứ đáng kiểm, vì `pickKind`
  // có thể được viết lại để rút từ `KIND` thay vì từ `SPAWN_W`.
  eq('rival: không có trong SPAWN_W', LAB.SPAWN_W.map(r => r[0]).indexOf('rival'), -1);
  {
    const w = bench(1234);
    let seen = 0;
    for (let i = 0; i < 30000; i++) if (LAB.pickKind(w.rng) === 'rival') seen++;
    eq('pickKind không bao giờ rút rival (30000 lần)', seen, 0);
  }

  // Hình. Nó là nhân vật đổi màu, nên phép kiểm không phải "trông thế nào" mà là "vẽ ra được":
  // lưới chữ nhật, mọi ký tự có trong palette, và **ít nhất một ký tự khác** lưới gốc -- một đối thủ
  // trùng màu với nhân vật là một trận đấu mà người chơi không biết mình là ai.
  const g = LAB.GRIDS.rival;
  eq('GRIDS.rival có mặt', !!g, true);
  eq('GRIDS.rival: mọi dòng cùng độ rộng', new Set(g.map(r => r.length)).size, 1);
  const miss = [...new Set(g.join(''))].filter(c => c !== '.' && !LAB.PAL[c]);
  eq('GRIDS.rival: ký tự lạ ngoài palette', miss.join('') || 'không', 'không');
  ge('GRIDS.rival: đủ vật liệu để nhìn ra một người', new Set(g.join('').replace(/\./g, '')).size, 3);

  const A = LAB.ANIM.rival;
  eq('ANIM.rival có mặt', !!A, true);
  for (const pose of ['idle', 'walk', 'atk', 'cast']) {
    eq('ANIM.rival.' + pose + ': có khung', !!(A[pose] && A[pose].length), true);
  }
  eq('ANIM.rival.cast: đúng 3 khung', A.cast.length, 3);
  for (let i = 0; i < A.cast.length; i++) {
    const fr = A.cast[i];
    eq('ANIM.rival.cast[' + i + ']: có lưới + dy', !!(fr && fr.g) && typeof fr.dy === 'number', true);
  }
  // Lời hứa thứ tư của check-boss.js, giữ nguyên ở đây: khung tung chiêu phải khác khung đứng, không
  // thì một đòn đang lên nhìn y như một con đang nghỉ.
  eq('ANIM.rival: khung tung khác khung đứng', A.cast[1].g !== A.idle[0].g, true);
  eq('drawFoeHeld: có hàm vẽ vũ khí trên tay', typeof LAB.drawFoeHeld, 'function');
}
sec('bảng đòn: mười sáu chiêu soi gương và chín cây vũ khí, hàng nào cũng phải hợp lệ');
{
  const ids = Object.keys(LAB.RIVAL_SK), sids = LAB.SKILLS.map(s => s.id);
  eq('RIVAL_SK: đủ số chiêu của người chơi', ids.length, sids.length);
  eq('RIVAL_SK: chiêu người chơi bị bỏ sót',
     sids.filter(id => !LAB.RIVAL_SK[id]).join(',') || 'không', 'không');
  eq('RIVAL_SK: id lạ không có trong SKILLS',
     ids.filter(id => sids.indexOf(id) < 0).join(',') || 'không', 'không');
  let nreg = 0, nsrc = 0;
  for (const id of ids) {
    const A = LAB.RIVAL_SK[id];
    if (LAB.FOE_ABIL['r_' + id] === A) nreg++;
    if (A.src === id && A.key === 'r_' + id) nsrc++;
  }
  eq('RIVAL_SK: hàng nào cũng nằm trong FOE_ABIL', nreg, ids.length);
  eq('RIVAL_SK: hàng nào cũng nhớ chiêu gốc và khoá của mình', nsrc, ids.length);
  let wreg = 0;
  for (const wp of LAB.WEAPONS) {
    const A = LAB.RIVAL_WP[wp.id];
    if (A && LAB.FOE_ABIL['w_' + wp.id] === A && A.wpid === wp.id && A.key === 'w_' + wp.id) wreg++;
  }
  eq('RIVAL_WP: chín cây vũ khí đều có hàng đăng ký', wreg, LAB.WEAPONS.length);
  eq('hai bộ khoá không đè lên bảy chiêu quái gốc',
     Object.keys(LAB.FOE_ABIL).filter(k => /^[rw]_/.test(k)).length, ids.length + LAB.WEAPONS.length);

  const hpMax = LAB.HERO_HP;
  for (const [k, A] of ROWS) {
    const parts = [];
    if (['circle', 'cone', 'line'].indexOf(A.shape) < 0) parts.push('shape lạ');
    if (['hero', 'self', 'dir'].indexOf(A.aim) < 0) parts.push('aim lạ');
    if (A.shape === 'line') { if (!(A.len > 0) || !(A.thick > 0)) parts.push('làn thiếu số'); }
    else if (!(A.r > 0)) parts.push('thiếu r');
    if (A.shape === 'cone' && !(A.arc > 0.1)) parts.push('quạt quá hẹp');
    if (!(A.tell < A.dur)) parts.push('báo trước dài hơn cả đòn');
    if (!(A.tell >= 0.40 && A.tell <= 1.15)) parts.push('báo trước ngoài dải 0,40-1,15');
    if (!(A.cd[0] <= A.cd[1])) parts.push('hồi chiêu đảo ngược');
    if (!(A.rec > 0)) parts.push('không có nhịp lặng');
    if (!(A.dmg > 0)) parts.push('không sát thương');
    if ((A.min || 0) >= A.range) parts.push('băng tầm đảo ngược');
    // Tổng sát thương một đòn (mọi nhịp cộng lại) không được lấy quá một phần tư máu nhân vật: bốn
    // đòn ăn trọn là chết, và bốn là con số nhỏ nhất còn cho người chơi cơ hội đọc ra mình sai ở đâu.
    const tot = A.dmg * (A.ticks ? A.ticks.length : 1);
    if (tot > hpMax * 0.25) parts.push('một đòn ăn ' + tot + ' máu');
    eq(k + ': hàng hợp lệ', parts.join(', ') || 'ok', 'ok');
  }
}
sec('vùng đã tô là vùng ăn đòn -- và mở đòn từ mép tầm thì phải với tới');
{
  // Bốn phép đo cho mỗi hàng, in gọn thành một dòng vì hai mươi lăm hàng nhân bốn dòng thì không ai
  // đọc hết:
  //
  //   tâm   -- hero đứng đúng tâm vùng: phải đau. Nửa "tô đâu đau đó".
  //   ngoài -- hero đứng ngay ngoài mép mà `heroIn` hứa: phải không đau. Nửa "và ngược lại", và là
  //            nửa dễ hỏng hơn, vì một shape rải đốt tới sát mép sẽ lặng lẽ ăn ra ngoài vòng đỏ.
  //   xa    -- mở đòn từ đúng `range`: phải đau. Đây là phép kiểm mà bảy chiêu quái không cần, vì
  //            quái mở đòn theo `tryCast` với `range` do người viết chọn *cho quái*; ở đây `range`
  //            là con số bộ não dùng để quyết định, nên `range` nằm ngoài tầm hình là AI tự trượt.
  //   gần   -- mở đòn từ đúng `min`: phải đau. Cùng lý do, đầu còn lại của băng.
  const SEED = 4242;
  for (const [k, A] of ROWS) {
    const reach = reachOf(A), tol = tolOf(A);
    const inD = A.shape === 'line' ? reach * 0.5 : 0;
    const outD = reach + tol + 4;
    let dIn = 0, dOut = 0, dFar = 0, dNear = 0;
    {
      const w = bench(), f = caster(w), e = cast(w, f, k, SEED);
      if (e) dIn = runCast(w, e, Math.cos(e.ang) * inD, Math.sin(e.ang) * inD);
    }
    {
      const w = bench(), f = caster(w), e = cast(w, f, k, SEED);
      if (e) dOut = runCast(w, e, Math.cos(e.ang) * outD, Math.sin(e.ang) * outD);
    }
    {
      const w = bench(), f = caster(w, 300, 0);
      dFar = runFrom(w, f, k, A.range, SEED);
    }
    {
      const w = bench(), f = caster(w, 300, 0);
      dNear = runFrom(w, f, k, (A.min || 0) + 0.01, SEED);
    }
    eq(k + ': tâm/ngoài/xa/gần',
       [dIn > 0 ? 'đau' : 'KHÔNG', dOut === 0 ? 'im' : 'ĐAU(' + dOut + ')',
        dFar > 0 ? 'tới' : 'TRƯỢT', dNear > 0 ? 'tới' : 'TRƯỢT'].join('/'),
       'đau/im/tới/tới');
  }
  // Hình quạt phải *là* một hình quạt: ngoài góc mở thì không đau dù vẫn trong bán kính. Cộng thêm
  // 0,45 rad vào `arc` vì `heroIn` tự nới góc theo bề rộng thân nhân vật (`atan2(HERO_R, d)`) đúng
  // như `hitCone` làm, nên né sát mép góc không phải một cú tung xúc xắc.
  let cones = 0, coneOk = 0;
  for (const [k, A] of ROWS) {
    if (A.shape !== 'cone') continue;
    cones++;
    const w = bench(), f = caster(w), e = cast(w, f, k, SEED);
    if (!e) continue;
    const d = A.r * 0.7, ang = e.ang + A.arc + 0.45;
    if (runCast(w, e, Math.cos(ang) * d, Math.sin(ang) * d) === 0) coneOk++;
  }
  eq('hình quạt: ngoài góc mở thì không đau (' + cones + ' hàng)', coneOk, cones);
}
// ---- đo vùng sát thương thật của một chiêu người chơi ---------------------------------------------
// Không đi qua `step`: bước một hiệu ứng bằng tay, đúng bốn dòng mà `step` bước nó, nên đo được từng
// nhịp một mà không có quái, số bay, camera hay đồng hồ vòng chen vào.
function playCast(w, id, cx, cy, dt, tick) {
  const i = IDX[id];
  w.cds[i] = 0; w.hero.mp = 1e9;
  if (!LAB.cast(w, i, cx, cy)) return null;
  const e = w.fxs[w.fxs.length - 1];
  let n = 0;
  while (e.t < e.dur && n++ < 8000) {
    e.pt = e.p; e.t += dt; e.p = Math.min(1, Math.max(0, e.t / e.dur));
    if (e.sk.hit) e.sk.hit(w, e);
    if (tick) tick(e);
    w.nums.length = 0;
  }
  return e;
}
// Một mảng điểm đo. Thân 0×0 làm số hạng dung sai `f.w * 0.35` của `foesIn` co về đúng 0 và `midY(f)`
// về đúng `f.y`: điểm đo là một *điểm*, không phải một con quái có bề ngang, nên hình đo được là đúng
// hình mà `hitCircle` vẽ ra. Máu 1e9 để không con nào chết giữa phép đo; khối lượng 1e12 để đẩy lùi
// và `pullToward` không dịch nó đi đâu -- một điểm đo trôi là một hình đo nhoè.
function grid(w, cx, cy, rad, st) {
  const ps = [];
  for (let dy = -rad; dy <= rad; dy += st) for (let dx = -rad; dx <= rad; dx += st) {
    const f = LAB.unit('slime', cx + dx, cy + dy);
    f.w = 0; f.h = 0; f.hp = f.maxhp = 1e9; f.mass = 1e12; f.dying = 0;
    ps.push(f); w.foes.push(f);
  }
  return ps;
}
// Khoảng cách từ một điểm đo tới tâm mà `duelThreat` sẽ neo vào, tính bằng đúng công thức của nó.
function threatDist(T, w, e, f) {
  if (T.an === 'm') {
    let d = 1e9;
    for (const m of e.data.ms) d = Math.min(d, Math.hypot(f.x - m.x, f.y - m.y));
    return d;
  }
  const cx = T.an === 'h' ? w.hero.x : e.x, cy = (T.an === 'h' ? w.hero.y : e.y) + T.oy;
  return Math.hypot(f.x - cx, f.y - cy);
}
sec('SK_THREAT: bảng chép tay phải khớp với đúng cái hitCircle mà chiêu ấy gọi');
{
  // Chiêu được thả **lên đúng chỗ nhân vật đang đứng**, có chủ ý: ba chiêu trong bảng là `mode:
  // 'self'` (hiệu ứng mọc ở thân nhân vật) và mười chiêu là `mode: 'point'`/`'dir'` (hiệu ứng mọc ở
  // điểm được chấm), nên thả lên chính chỗ ấy là chỗ duy nhất hai loại trùng tâm -- và mảng điểm đo
  // vì thế chắc chắn phủ trọn vùng, không phụ thuộc vào việc `e.x` là tâm nào.
  const DT = 1 / 240, PULL = { void_collapse: 1, gale_vortex: 1 };
  for (const id of Object.keys(LAB.SK_THREAT)) {
    const T = LAB.SK_THREAT[id];
    const rad = T.an === 'm' ? 80 : T.r + 14;

    // -- hình: một mảng điểm dày 1 px, đo tầm với xa nhất thật sự gây sát thương
    const w = bench(9001), h = w.hero;
    const ps = grid(w, h.x, h.y, rad, 1);
    const e = playCast(w, id, h.x, h.y, DT);
    let maxd = -1, nhit = 0;
    if (e) for (const f of ps) {
      if (f.hp >= 1e9) continue;
      nhit++;
      const d = threatDist(T, w, e, f);
      if (d > maxd) maxd = d;
    }
    ge(id + ': chiêu có gây sát thương để mà đo', nhit, 1);
    // Nửa quan trọng: **mọi điểm đau đều nằm trong vòng của bảng**. Hỏng nửa này là AI đứng ở một
    // chỗ nó tin là ngoài vùng và ăn trọn đòn -- lỗi tệ nhất mà bảng này gây được.
    le(id + ': vòng của bảng chứa hết vùng đau (r=' + T.r + ')', r1(maxd), T.r);
    // Và vòng không được *phóng đại* -- trừ hai chiêu có hút, xem ngay dưới. Một vòng to hơn thực tế
    // làm đối thủ bỏ chạy khỏi chỗ nó đang an toàn, tức là mất lượt vô cớ.
    if (!PULL[id]) ge(id + ': và không phóng đại', r1(maxd), T.r - 0.5);

    // -- hút: với hai chiêu `pull`, `r` cố ý là tầm *hút* chứ không phải tầm đau, vì bước ra khỏi
    //    vùng đau mà còn trong vành hút thì bị lôi về. Đo tầm hút bằng một hàng điểm có khối lượng
    //    thật: điểm xa nhất bị dịch, cộng một, phải bằng đúng `r` (lực hút là `1 - d/r`, nên nó về 0
    //    ở đúng d = r).
    if (PULL[id]) {
      const w2 = bench(9002), h2 = w2.hero, line = [];
      for (let d = 1; d <= T.r + 20; d++) {
        const f = LAB.unit('slime', h2.x + d, h2.y);
        f.w = 0; f.h = 0; f.hp = f.maxhp = 1e9; f.mass = 1; f.dying = 0;
        line.push(f); w2.foes.push(f);
      }
      playCast(w2, id, h2.x, h2.y, DT);
      let far = 0;
      line.forEach((f, k) => { if (Math.abs(f.x - (h2.x + k + 1)) > 0.05) far = k + 1; });
      eq(id + ': r là tầm hút thật', far + 1, T.r);
      le(id + ': và vùng đau nằm gọn trong tầm hút', r1(maxd), T.r);
    }
  }
}
sec('SK_THREAT: cửa sổ thời gian phải phủ trọn mọi nhịp gây sát thương');
{
  // `t0`/`t1` là thứ bộ não trừ ra để biết "còn bao lâu nữa thì đau", và cả hai đầu sai theo hai
  // kiểu khác nhau: `t0` muộn hơn thực tế thì nó rời vùng muộn hơn cần thiết, `t1` sớm hơn thực tế
  // thì nó **quay vào** một vùng còn đang đánh. Nên `t0` phải ≤ nhịp đầu và `t1` phải ≥ nhịp cuối.
  //
  // Mưa Ma Thuật là chiêu duy nhất có nhịp *ngẫu nhiên* (`at + rng.range(-0.014, 0.014)` cho từng ổ
  // một), nên riêng nó phải quét nhiều hạt mới thấy được mép của cả dải; mười hai chiêu còn lại có
  // nhịp cố định trong `hit()` nên hai hạt là đủ để chứng minh điều đó.
  const DT = 1 / 240, MS = v => Math.round(v * 1000);
  for (const id of Object.keys(LAB.SK_THREAT)) {
    const T = LAB.SK_THREAT[id];
    const nseed = id === 'arcane_rain' ? 16 : 2;
    const rad = T.an === 'm' ? 80 : T.r;
    let t0 = 1e9, t1 = -1, hits = 0;
    for (let s = 0; s < nseed; s++) {
      const w = bench(5100 + s * 37), h = w.hero;
      grid(w, h.x, h.y, rad, 5);
      let dmg = w.dmg;
      const e = playCast(w, id, h.x, h.y, DT, ev => {
        if (w.dmg === dmg) return;
        dmg = w.dmg; hits++;
        if (ev.t < t0) t0 = ev.t;
        if (ev.t > t1) t1 = ev.t;
      });
      if (!e) break;
    }
    ge(id + ': có nhịp nào để đo', hits, 1);
    // Chấp nhận lệch đúng một mẫu (1/240 s): đồng hồ đo là rời rạc, nên nhịp đầu *thật* nằm đâu đó
    // trong khoảng một mẫu trước lần đầu thấy máu tụt.
    le(id + ': t0 không muộn hơn nhịp đau đầu tiên (ms)', MS(T.t0), MS(t0));
    ge(id + ': t1 phủ tới nhịp đau cuối (ms)', MS(T.t1), MS(t1) - MS(DT));
    // Cờ `fast` **là** lời hứa công bằng của cả chế độ: dưới 0,15 giây thì đối thủ không được né phản
    // xạ, vì thời gian phản ứng của người thật là 0,2-0,25 giây. Cờ ấy phải suy ra được từ số đo, chứ
    // không phải một ô ai đó quên bật.
    eq(id + ': cờ fast khớp với nhịp đầu (' + r1(t0) + 's)', !!T.fast, t0 < 0.15);
  }
}
sec('ba chiêu cố ý không có trong bảng: câu trả lời chắc chắn của người chơi');
{
  // Đây là một *quyết định cân bằng* nên nó phải được ghi lại bằng một phép kiểm, không thì lần sau
  // ai đó thấy bảng thiếu ba hàng sẽ "sửa" nó. Sấm Chuỗi và Đạn Nảy khoá mục tiêu ngay lúc bấm
  // (`init` gọi `nearest`), nên chúng không có vùng để bước ra; Bóng Lướt thì nhịp đầu ở 0,077 giây và
  // đường đánh do người chơi vẽ. Một AI né được cả ba là một AI không thể thắng nổi.
  const gone = ['chain_bolt', 'ricochet_shot', 'shadow_dash'];
  for (const id of gone) {
    eq(id + ': vắng mặt trong SK_THREAT (có chủ ý)', !!LAB.SK_THREAT[id], false);
    eq(id + ': nhưng vẫn là một chiêu thật', !!LAB.SKILLS[IDX[id]], true);
  }
  eq('bảng đúng bằng số chiêu trừ ba hàng ấy',
     Object.keys(LAB.SK_THREAT).length, LAB.SKILLS.length - gone.length);
  // Và một chiêu vắng mặt phải *thật sự* không làm đối thủ bỏ chạy: không có hàng thì `duelThreat`
  // bỏ qua hẳn hiệu ứng ấy.
  const a = arena(3300), w = a.w, f = a.f;
  w.hero.x = f.x; w.hero.y = f.y + 1;
  playCast(w, 'chain_bolt', f.x, f.y, 1 / 240);
  eq('Sấm Chuỗi không làm đối thủ bỏ chạy', LAB.duelThreat(w, f), false);
}

sec('rút bộ đồ: cùng hạt ra cùng bộ, và mười sáu chiêu đều tay');
{
  let same = 0;
  for (let s = 1; s <= 200; s++) {
    const a = LAB.rollRival(LAB.mulberry32(s)), b = LAB.rollRival(LAB.mulberry32(s));
    if (a.wp.id === b.wp.id && a.kit.join() === b.kit.join()) same++;
  }
  eq('cùng hạt cho cùng bộ (200 hạt)', same, 200);

  const wps = new Set(), sks = new Set();
  const IDS = Object.keys(LAB.RIVAL_SK);
  // Đếm theo **từng ô**, không chỉ đếm tổng. Bản đầu có một luật ép -- nếu bộ ba không có chiêu nào với
  // tới 120 px thì ghi đè `kit[2]` -- và cái luật ấy *không* làm lệch tổng ba ô lại (một hàng tầm xa
  // được thêm vào ô 2 thì cũng bị lấy ra khỏi ô 0/1 ở những lần khác), nên một phép đếm tổng sẽ xanh
  // trong khi ô thứ ba vẫn thiên hẳn về tám hàng tầm xa. Ba bảng riêng là cách duy nhất nhìn ra nó.
  const per = [{}, {}, {}];
  for (const id of IDS) for (let k = 0; k < 3; k++) per[k][id] = 0;
  let badId = 0, dup = 0, badN = 0;
  const N = 24000;
  const rng = LAB.mulberry32(31337);
  for (let i = 0; i < N; i++) {
    const r = LAB.rollRival(rng);
    wps.add(r.wp.id); r.kit.forEach(id => sks.add(id));
    if (r.kit.length !== 3) badN++;
    if (new Set(r.kit).size !== 3) dup++;
    if (r.kit.some(id => !LAB.RIVAL_SK[id])) badId++;
    for (let k = 0; k < 3; k++) if (per[k][r.kit[k]] !== undefined) per[k][r.kit[k]]++;
  }
  eq('bộ nào cũng đúng 3 chiêu', badN, 0);
  eq('không bộ nào trùng chiêu', dup, 0);
  eq('không bộ nào có id lạ', badId, 0);
  eq(N + ' lần rút đủ chín cây vũ khí', wps.size, LAB.WEAPONS.length);
  eq(N + ' lần rút đủ mười sáu chiêu', sks.size, IDS.length);
  // Rút không hoàn lại từ mười sáu hàng: mọi ô đều đều tay, nên mỗi hàng phải ra đúng `N/16` lần ở mỗi
  // ô. Biên ±22% là chỗ nhiễu của 1500 mẫu mỗi ô nằm gọn bên trong, còn cái lệch mà luật ép cũ tạo ra
  // ở ô thứ ba thì gấp nhiều lần thế (tám hàng tầm gần tụt xuống dưới một nửa phần của chúng).
  const wantK = N / IDS.length;
  for (let k = 0; k < 3; k++) {
    let worst = 0, who = '';
    for (const id of IDS) {
      const off = Math.abs(per[k][id] - wantK) / wantK;
      if (off > worst) { worst = off; who = id; }
    }
    le('ô ' + (k + 1) + ' rút đều (lệch nhất: ' + who + ' ' + Math.round(worst * 100) + '%)',
       worst, 0.22);
  }
  // Và câu nói thẳng ra điều mà luật ép cũ cấm: một bộ ba *toàn* đòn tầm gần phải xảy ra được. Sân chỉ
  // 520x340 và cây vũ khí của nó hồi trong khoảng một giây, nên bộ kit ấy vẫn đánh được -- còn cái
  // người chơi được là mỗi trận một bộ kit thật sự khác, kể cả bộ kit không với tới.
  let allNear = 0;
  const rng2 = LAB.mulberry32(999);
  for (let i = 0; i < 4000; i++) {
    const r = LAB.rollRival(rng2);
    if (!r.kit.some(id => LAB.RIVAL_SK[id].range >= 120)) allNear++;
  }
  ge('có bộ toàn đòn tầm gần (không luật ép nào)', allNear, 1);
}
sec('băng khoảng cách: chín cây vũ khí phải cho chín cách chơi');
{
  // `duelBand` là thứ duy nhất làm hai đối thủ dùng chung một bộ não *chơi khác nhau*. Hai lời hứa:
  // băng phải nằm trong băng tầm mà chính cây ấy mở đòn được (đứng ngoài tầm của mình là đứng đó chờ
  // hết trận), và chín cây không được cho ra cùng một con số.
  const bands = new Set();
  for (const wp of LAB.WEAPONS) {
    const b = LAB.duelBand(wp), A = LAB.RIVAL_WP[wp.id];
    bands.add(Math.round(b));
    const parts = [];
    if (b > A.range) parts.push('băng ' + r1(b) + ' ngoài tầm mở đòn ' + A.range);
    if (b <= (A.min || 0)) parts.push('băng ' + r1(b) + ' trong mép chết ' + A.min);
    if (b < 12) parts.push('băng dán vào người');
    eq(wp.id + ': băng ' + r1(b) + ' dùng được', parts.join(', ') || 'ok', 'ok');
  }
  ge('chín cây cho ít nhất 6 băng khác nhau', bands.size, 6);
  // Cung đứng xa nhất, găng đứng gần nhất: nếu một ngày hai con số này đảo nhau thì bộ não vẫn chạy,
  // vẫn không lỗi, và trận đấu vẫn *sai* -- một tay cung dán vào mặt là một tay cung không bắn được.
  ge('cung đứng xa hơn găng', LAB.duelBand(LAB.WEAPON_BY_ID['cung'])
                            - LAB.duelBand(LAB.WEAPON_BY_ID['gang']), 40);
  ge('thương đứng xa hơn găng', LAB.duelBand(LAB.WEAPON_BY_ID['thuong'])
                              - LAB.duelBand(LAB.WEAPON_BY_ID['gang']), 20);
}

sec('phòng đấu: một sân riêng, và không để lại dấu nào');
{
  // `W` lên tới 480 trên điện thoại (xem `FRAME_W` ở js/core.js) trong khi harness luôn thấy 320, nên
  // con số phải so là 480 chứ không phải `LAB.W`: phòng hẹp hơn khung nhìn thì hai đầu kẹp camera đảo
  // nhau. js/README.md nói đúng điều này cho `ROOM_W`, và `DUEL_W` chịu cùng ràng buộc.
  ge('DUEL_W rộng hơn khung rộng nhất (480)', LAB.DUEL_W, 481);
  ge('DUEL_H cao hơn khung nhìn', LAB.DUEL_H, LAB.H + 1);
  le('DUEL_W vẫn nhỏ hơn cả sân', LAB.DUEL_W, LAB.BOUND0.x1 - LAB.BOUND0.x0);
  le('DUEL_H vẫn nhỏ hơn cả sân', LAB.DUEL_H, LAB.BOUND0.y1 - LAB.BOUND0.y0);

  const w = bench(4321), h = w.hero;
  // Đồ đang nằm trên sàn phải sống sót qua cú đổi sân: nó là thứ người chơi đã kiếm được.
  LAB.spawnOrb(w, LAB.rollGear(w.grng, LAB.GEAR_SLOTS[0].id), h.x + 30, h.y);
  const orbs0 = w.orbs.length;
  ge('có món trên sàn để mà kiểm', orbs0, 1);
  const d = LAB.startDuel(w);
  eq('startDuel đặt w.room', !!w.room, true);
  eq('startDuel dựng sổ trận', !!(d && d.done === '' && d.hold === 0 && d.shown === 0), true);
  eq('BOUND rộng đúng DUEL_W', Math.round(LAB.BOUND.x1 - LAB.BOUND.x0), LAB.DUEL_W);
  eq('BOUND cao đúng DUEL_H', Math.round(LAB.BOUND.y1 - LAB.BOUND.y0), LAB.DUEL_H);
  le('kẹp camera không đảo (ngang)', LAB.CAMB.x0, LAB.CAMB.x1);
  le('kẹp camera không đảo (dọc)', LAB.CAMB.y0, LAB.CAMB.y1);
  eq('đồ trên sàn còn nguyên', w.orbs.length, orbs0);
  // `newWorld` bật `god` vì cả game gốc là một phòng thí nghiệm skill. Một trận solo không thể thua
  // thì không phải một trận solo.
  eq('tắt bất tử khi vào trận', w.god, false);
  eq('máu và mana đầy khi vào trận', h.hp === h.maxhp && h.mp === h.maxmp, true);
  eq('nhân vật đứng trong phòng',
     h.x >= LAB.BOUND.x0 && h.x <= LAB.BOUND.x1 && h.y >= LAB.BOUND.y0 && h.y <= LAB.BOUND.y1, true);
  eq('không quái nào còn trong sân', w.foes.length, 0);
}
sec('phòng đấu không rò: BOUND và CAMB là toàn cục');
{
  // Đây là bất biến duy nhất trong cả file mà một lỗi *không thấy được trong trận solo*: rò ra thì
  // trận thường sau đó chơi trong một cái sân 520×340 và camera dán cứng, mà không có gì báo.
  const w = bench(4322);                          // newWorld gọi roomApply(w) với w.room === null
  const now = [LAB.BOUND.x0, LAB.BOUND.x1, LAB.BOUND.y0, LAB.BOUND.y1].join();
  const want = [LAB.BOUND0.x0, LAB.BOUND0.x1, LAB.BOUND0.y0, LAB.BOUND0.y1].join();
  eq('sân mới: BOUND về đúng cỡ gốc', now, want);
  eq('sân mới: CAMB.x1 về WW - W', LAB.CAMB.x1, LAB.WW - LAB.W);
  eq('sân mới: CAMB.y1 về WH - H', LAB.CAMB.y1, LAB.WH - LAB.H);
  eq('sân mới: không còn phòng', !!w.room, false);
  // `bench()` tự tắt `god` để đo sát thương vào nhân vật, nên câu này phải hỏi một sân *nguyên bản*:
  // thứ cần chứng minh là `startDuel` không để lại dấu trong `newWorld`, chứ không phải trong bench.
  const raw = LAB.newWorld(4323, { map: LAB.MAPS[0].id, wp: 'kiem', slots: [0, 1, 2] });
  eq('sân mới: bật lại bất tử của phòng thí nghiệm', raw.god, true);
  eq('sân mới: không còn sổ trận solo', !!w.duel, false);
}

sec('kết trận: một trận một lần, gục là xong');
{
  {
    const a = arena(7001), w = a.w, f = a.f, d = w.duel, h = w.hero;
    eq('mở màn: chưa có kết quả', d.done, '');
    eq('đối thủ dày máu đúng bằng máu nền của loài', f.maxhp, LAB.KIND.rival.hp);
    eq('đối thủ mang một cây vũ khí thật', !!(f.wp && LAB.WEAPON_BY_ID[f.wp.id]), true);
    eq('đối thủ mang đúng ba chiêu', f.kit.length, 3);
    eq('đối thủ có mana riêng', f.maxmp, LAB.DUEL_MP);
    eq('thanh máu lớn được bật', f.boss, true);
    // Và **không** gán vào `w.boss`: gán thì `bossGate` mở một cánh cổng 'out' đúng lúc nó chết, tức
    // là điều kiện kết trận bị một file khác quyết định thay.
    eq('nhưng không phải w.boss', w.boss, null);
    eq('đang đánh thì chưa có bảng kết quả', LAB.duelResult(w), null);

    // Một vệt đang lên đúng lúc trận xong. Nó phải tắt theo: một cú nổ *sau* khi menu đã mở là một
    // đòn không còn nghĩa gì, và nếu người gục là nhân vật thì nó còn rút máu một cái xác.
    cast(w, f, 'w_' + f.wp.id);
    ge('có một vệt đang lên để mà kiểm', w.tels.length, 1);
    h.hp = 120;
    f.hp = 0; f.dying = 0.001;
    LAB.stepDuel(w, 1 / 60);
    eq('hạ đối thủ: kết quả là thắng', d.done, 'win');
    ge('có quãng đứng nhìn trước khi menu mở', d.hold, LAB.DUEL_END - 0.001);
    eq('mọi vệt tắt theo', w.tels.length, 0);
    eq('đối thủ thôi lên đòn', f.tel, null);
    ge('đối thủ thôi chọn đòn', f.acd, 90);
    eq('thắng thì không bị trừ máu', h.hp, 120);
    eq('menu chưa mở -- shell.js chờ hold về 0', d.shown, 0);
    // Và **không có đối thủ thứ hai**. Bản đầu là một cái thang vòng, nên chỗ này từng sinh một con
    // mới sau một nhịp nghỉ; giờ hết trận là hết.
    let n = 0;
    while (d.hold > 0 && n++ < 600) LAB.stepDuel(w, 1 / 60);
    eq('hold chạy hết', d.hold, 0);
    eq('kết quả không đổi', d.done, 'win');
    eq('không có đối thủ mới nào vào sân', w.foes.length, 1);
    eq('d.rival vẫn là con vừa gục', d.rival, f);
    // Gọi lại `duelEnd` không được ghi đè kết quả: `stepDuel` gọi nó mỗi khung sau khi trận xong.
    LAB.duelEnd(w, 'lose');
    eq('duelEnd không ghi đè kết quả cũ', d.done, 'win');
    const r = LAB.duelResult(w);
    eq('bảng kết quả: thắng', !!(r && r.win === true && r.head === 'THẮNG'), true);
    ge('bảng kết quả có dòng bộ kit', (r.kit || '').length, 3);
    ge('bảng kết quả có nhãn nút', (r.again || '').length, 3);
    ge('dòng HUD nói kết quả', LAB.duelLine(w).indexOf('THẮNG'), 0);
  }
  {
    const a = arena(7002), w = a.w, d = w.duel, h = w.hero, f = a.f;
    h.hp = 0;
    LAB.stepDuel(w, 1 / 60);
    eq('hết máu: kết quả là thua', d.done, 'lose');
    eq('hết máu: máu về 0 chẵn', h.hp, 0);
    eq('hết máu: đối thủ vẫn đứng đó', w.foes.indexOf(f) >= 0, true);
    const r = LAB.duelResult(w);
    eq('bảng kết quả: thua', !!(r && r.win === false && r.head === 'THUA'), true);
    ge('dòng HUD nói kết quả', LAB.duelLine(w).indexOf('THUA'), 0);
  }
  {
    // `god` là công cụ, và người bật nó đang *xem* chứ đang không đấu.
    const a = arena(7003), w = a.w, d = w.duel, h = w.hero;
    w.god = true; h.hp = 0;
    LAB.stepDuel(w, 1 / 60);
    eq('bật bất tử thì máu 0 không tính là thua', d.done, '');
  }
}
sec('mana ít cho cả hai bên: bình nhỏ thì đánh thường mới là đòn chính');
{
  le('DUEL_MPX thật sự hạ mana', LAB.DUEL_MPX, 0.85);
  ge('nhưng không hạ tới mức bỏ hẳn chiêu', LAB.DUEL_MPX, 0.30);
  const want = Math.round(LAB.HERO_MP * LAB.DUEL_MPX);

  const w = bench(7101), h = w.hero;
  eq('sân thường: không hệ số mana', w.mpx, 1);
  eq('sân thường: bình mana nền', h.maxmp, LAB.HERO_MP);
  LAB.startDuel(w);
  eq('vào trận: w.mpx là DUEL_MPX', w.mpx, LAB.DUEL_MPX);
  eq('vào trận: bình mana co lại', h.maxmp, want);
  eq('vào trận: bình đầy', h.mp, h.maxmp);
  // Đây là cả lý do phải đi qua `w.mpx` + `syncGear` thay vì trừ thẳng vào `h.maxmp` một lần: `syncGear`
  // chạy lại mỗi lần người chơi đổi trang bị, và một phép trừ một lần sẽ bị lần gọi ấy xoá sạch -- tháo
  // một cái nhẫn giữa trận là mana đầy trở lại.
  LAB.syncGear(w);
  eq('gọi lại syncGear: bình vẫn co', h.maxmp, want);
  const g = LAB.rollGear(w.grng, LAB.GEAR_SLOTS[0].id);
  w.bag.push(g);
  LAB.equipGear(w, w.bag.length - 1);
  ge('mặc một món vào: bình không nhỏ hơn', h.maxmp, want);
  eq('và vẫn bằng đúng (nền + trang bị) × DUEL_MPX',
     h.maxmp, Math.round((LAB.HERO_MP + w.gs.mp) * LAB.DUEL_MPX));
  LAB.unequipGear(w, LAB.GEAR_SLOTS[0].id);
  eq('tháo ra: bình trở về đúng cỡ trong trận', h.maxmp, want);

  // Tốc độ hồi nhân theo cùng một hệ số, không riêng dung lượng: một cái bình nhỏ mà hồi như cũ thì
  // chỉ nhỏ về danh nghĩa, còn số chiêu thả được trong một trận thì y như trước.
  const INP = { dx: 0, dy: 0, ax: 0, ay: 0 };
  const regen = (w2) => {
    const hh = w2.hero;
    hh.mp = 0;
    INP.ax = hh.x; INP.ay = hh.y;
    for (let i = 0; i < 60; i++) LAB.step(w2, 1 / 60, INP);
    return hh.mp;
  };
  const g1 = regen(bench(7102));
  const w3 = bench(7103);
  LAB.startDuel(w3);
  w3.duel.wait = 1e9;                             // đừng cho đối thủ vào sân giữa phép đo
  const g2 = regen(w3);
  ge('hồi mana một giây ở sân thường đo được', r1(g1), 1);
  le('hồi mana trong trận chậm đúng theo DUEL_MPX (' + r1(g2) + '/' + r1(g1) + ')',
     Math.abs(g2 / g1 - LAB.DUEL_MPX), 0.04);

  // Đối thủ cũng phải bị hạ cùng nhịp, bằng không nó thả chiêu gấp đôi người chơi và cả lời hứa "trận
  // này về phía đánh thường" chỉ đúng với một bên.
  le('bình mana đối thủ nhỏ hơn bình nền của nhân vật', LAB.DUEL_MP, LAB.HERO_MP - 1);
  le('và xấp xỉ bình của nhân vật trong trận', Math.abs(LAB.DUEL_MP - want), 12);
  le('tốc độ hồi của đối thủ xấp xỉ nhân vật trong trận',
     Math.abs(LAB.DUEL_MPR - LAB.MP_REGEN * LAB.DUEL_MPX), 1.2);
}
sec('soi gương: bảng chiêu và nhịp đầu');
{
  // `SK_BY_ID` là cầu duy nhất từ một hàng `r_*` (chỉ có `A.src`, một chuỗi) sang đúng đối tượng chiêu
  // của người chơi. Thiếu một hàng là một chiêu mà đối thủ thả ra *không có hình nào cả*.
  eq('SK_BY_ID đủ mười sáu chiêu', Object.keys(LAB.SK_BY_ID).length, LAB.SKILLS.length);
  let wrong = 0, miss = 0;
  for (const s of LAB.SKILLS) if (LAB.SK_BY_ID[s.id] !== s) wrong++;
  eq('và trỏ vào đúng đối tượng chiêu, không phải một bản chép', wrong, 0);
  for (const id of Object.keys(LAB.RIVAL_SK)) if (!LAB.SK_BY_ID[id]) miss++;
  eq('mọi hàng r_* đều tra ra được art', miss, 0);

  // Nhịp đầu phải nằm trong đời của hiệu ứng. Một mốc âm là một cái hẹn không bao giờ tới (tức là hình
  // chỉ hiện lúc vệt nổ, muộn hơn đúng bằng nhịp ấy); một mốc quá `dur` thì hình chạy xong từ lâu
  // trước lúc đòn ăn -- một cú nổ không có hình.
  for (const id of Object.keys(LAB.RIVAL_SK)) {
    const sk = LAB.SK_BY_ID[id], lead = LAB.mirLead(id);
    ge(id + ': nhịp đầu không âm', lead, 0);
    le(id + ': nhịp đầu nằm trong dur ' + r1(sk.dur), lead, sk.dur);
  }
  for (const wp of LAB.WEAPONS) {
    const lead = LAB.mirLeadWp(wp);
    ge(wp.id + ': nhịp vung không âm', lead, 0);
    le(wp.id + ': nhịp vung nằm trong dur ' + r1(wp.dur), lead, wp.dur);
  }
}
sec('soi gương: đúng art của người chơi, và không thêm một chấm sát thương');
{
  // Đây là nửa quan trọng nhất của cả cơ chế. Hiệu ứng thêm vào chỉ để *nhìn*: vùng ăn đòn vẫn là cái
  // vệt trên sàn, nên hai mươi lăm hàng này phải chạy trọn đời hiệu ứng với nhân vật đứng đúng tâm mà
  // không mất một điểm máu -- và đối thủ cũng không được tự đánh mình bằng chính art của nó.
  const INP = { dx: 0, dy: 0, ax: 0, ay: 0 };
  for (const [key, A] of ROWS) {
    const a = arena(7200), w = a.w, f = a.f, h = w.hero;
    if (A.wpid) f.wp = LAB.WEAPON_BY_ID[A.wpid];
    h.x = f.x + 30; h.y = f.y + 1;
    const T = cast(w, f, key);
    if (!T) { eq(key + ': mở được đòn để soi gương', false, true); continue; }
    w.fxs.length = 0;
    const e = LAB.rivalMirror(w, f, T);
    eq(key + ': thả được bản soi gương', !!e, true);
    if (!e) continue;
    eq(key + ': hiệu ứng vào w.fxs', w.fxs.length, 1);
    eq(key + ': mang dấu người thả (e.by)', e.by, f);
    eq(key + ': là bản câm (e.mute)', !!e.mute, true);
    eq(key + ': đúng art của ' + (A.wpid || A.src),
       A.wpid ? e.sk === f.wp.sk : e.sk === LAB.SK_BY_ID[A.src], true);
    // Mọi con số hình học phải là số. Mục này bắt một lớp lỗi mà mắt không thấy và những mục khác cũng
    // không thấy: một hàng `w.fxs` mang `x: NaN` vẫn "có hiệu ứng", vẫn `by`/`mute` đúng, vẫn không rút
    // một chấm máu nào -- nó chỉ *không vẽ ra gì cả*. Đúng cái đã xảy ra khi `rivalMirror` gọi `telEnd`
    // cho bảy hàng nón: `telEnd` đọc `A.len`, thứ chỉ hàng `line` có.
    eq(key + ': hình học ra số thật, không NaN',
       [e.x, e.y, e.ang, e.ox, e.oy].every(v => Number.isFinite(v)), true);
    // Dọn vệt đi rồi mới bước: thứ đang đo là *hiệu ứng*, và để vệt lại thì sát thương thật của nó sẽ
    // trả lời thay. `f.acd` khoá phần chọn đòn để không có đòn thứ hai nào chen vào.
    w.tels.length = 0; f.tel = null; f.acd = 1e9;
    h.hp = h.maxhp; h.inv = 0; h.dsh = 0;
    f.hp = f.maxhp;
    const hp0 = h.hp, fhp0 = f.hp;
    let n = 0;
    while (w.fxs.indexOf(e) >= 0 && n++ < 900) {
      h.x = e.x; h.y = e.y + 1;
      INP.ax = h.x; INP.ay = h.y;
      LAB.step(w, 1 / 60, INP);
    }
    le(key + ': hiệu ứng chạy hết trong ' + r1(e.dur) + 's', n, 900);
    eq(key + ': không rút một chấm máu nào của nhân vật', r1(hp0 - h.hp), 0);
    eq(key + ': cũng không tự đánh mình', r1(fhp0 - f.hp), 0);
  }
}
sec('soi gương đúng khung: hình nổ cùng lúc vệt nổ');
{
  // Thứ được đo ở đây là *cái hẹn* trong `rivalCast` (`a.mir.at = A.tell - lead`). Thả ngay lúc mở đòn
  // thì hiệu ứng chạy xong từ lâu trước lúc vệt nổ; thả đúng khung vệt nổ thì hình bắt đầu sau khi đòn
  // đã ăn. Cả hai đều là "có hiệu ứng" nếu chỉ đếm `w.fxs`, nên phải đo bằng đồng hồ.
  const dt = 1 / 60;
  for (const [key, A] of ROWS) {
    const a = arena(7300), w = a.w, f = a.f, h = w.hero;
    if (A.wpid) f.wp = LAB.WEAPON_BY_ID[A.wpid];
    h.x = f.x + Math.min(34, A.range * 0.5); h.y = f.y + 1;
    w.fxs.length = 0; w.tels.length = 0;
    f.frozen = 0; f.tel = null; f.acd = 0; f.ai.mir = null;
    if (!LAB.rivalCast(w, f, key, -2)) { eq(key + ': mở được đòn', false, true); continue; }
    const T = f.tel;
    const lead = A.wpid ? LAB.mirLeadWp(f.wp) : LAB.mirLead(A.src);
    ge(key + ': hẹn giờ được dựng', f.ai.mir ? 1 : 0, 1);
    let fireT = -1, mirT = -1, t = 0;
    // Chụp lại `a.sw`/`f.pose`/`a.mir` **ở đúng khung hình sinh ra**, không đọc sau vòng lặp. Vòng này
    // chỉ dừng khi có *cả* hai mốc, và khung vệt nổ là khung `stepTel` xoá `f.tel`: đọc sau vòng lặp là
    // đọc trạng thái sau khi phần chọn đòn đã có cơ hội chen một đòn mới vào (`f.acd` nay giữ nó lại
    // đúng `A.rec` nữa, nhưng một mục kiểm không nên dựa vào con số ấy để đo một chuyện khác).
    let swAt = null, poseAt = -9, mirAt = 1;
    for (let n = 0; n < 400 && (fireT < 0 || mirT < 0); n++) {
      const i = w.tels.indexOf(T);
      if (i >= 0) LAB.stepTel(w, T, dt, i);
      if (fireT < 0 && T.fired) fireT = t;
      LAB.stepRival(w, f, dt);
      if (mirT < 0 && w.fxs.length) {
        mirT = t; swAt = f.ai.sw; poseAt = f.pose; mirAt = f.ai.mir === null ? 0 : 1;
      }
      t += dt;
    }
    ge(key + ': vệt có nổ', fireT, 0);
    ge(key + ': có hình soi gương', mirT, 0);
    if (fireT < 0 || mirT < 0) continue;
    if (lead > A.tell + 1e-6) {
      // Nhát vung dài hơn cả quãng báo trước của nó: mốc bị kẹp về 0, hình bắt đầu ngay và kết muộn
      // hơn cú nổ một chút. Thà vậy hơn là một mốc âm không bao giờ tới.
      le(key + ': vung dài hơn quãng báo -- thả ngay', mirT, dt * 1.5);
    } else {
      le(key + ': nhịp gây sát thương của hình trùng khung vệt nổ (lệch '
         + r1((mirT + lead - fireT) * 1000) / 1000 + 's)', Math.abs(mirT + lead - fireT), 0.05);
    }
    if (A.wpid) {
      // Dáng tay lấy thẳng từ chính nhát vung ấy, nên tay và hình là cùng một đồng hồ.
      eq(key + ': dáng tay đọc từ nhát vung', !!(swAt && swAt.wp), true);
      ge(key + ': f.pose đã vào khoảng vung', poseAt, 0);
      le(key + ': f.pose không quá 1', poseAt, 1);
    }
    eq(key + ': hẹn giờ dùng một lần rồi thôi', mirAt, 0);
  }
}
sec('không né đòn của chính mình');
{
  // Từ khi đối thủ soi gương art của người chơi, `w.fxs` có cả những hàng *nó* thả -- cùng `e.sk`, nên
  // cùng khớp `SK_THREAT`. Không bỏ chúng ra thì nó đọc cú Ngưng Thời của mình thành một vòng đang nổ
  // dưới chân và bỏ chạy khỏi đòn của chính mình: đúng cái lỗi mà `duelThreat` đã bỏ `w.tels` đi để
  // tránh, quay lại bằng một cửa khác.
  const a = arena(7600), w = a.w, f = a.f, h = w.hero;
  const ids = Object.keys(LAB.SK_THREAT);
  let n0 = 0, n1 = 0;
  for (const id of ids) {
    const T = LAB.SK_THREAT[id];
    const cy = f.y - f.h * 0.5;
    // Hàng neo vào thân nhân vật (`an: 'h'`) đọc chỗ *nhân vật* đứng, nên phải kê nhân vật sao cho tâm
    // vùng rơi đúng lên người đối thủ: bằng không mục này chỉ chứng minh được rằng một vùng ở xa thì
    // không phải né, điều đúng nhưng không phải điều cần chứng minh.
    h.x = f.x; h.y = cy - T.oy;
    const mk = by => ({ sk: LAB.SK_BY_ID[id], i: -1, t: T.t0, dur: 9, p: 0, pt: 0, seed: 1,
                        ox: f.x, oy: cy, x: f.x, y: cy - T.oy, ang: 0,
                        data: { ms: [{ x: f.x, y: cy }] }, by: by, mute: by ? 1 : 0 });
    w.fxs.length = 0; w.fxs.push(mk(null));
    if (LAB.duelThreat(w, f) || LAB.DTH.near > 0) n0++;
    w.fxs.length = 0; w.fxs.push(mk(f));
    if (LAB.duelThreat(w, f) || LAB.DTH.near > 0) n1++;
  }
  eq('hiệu ứng của người chơi thì đọc thành nguy hiểm', n0, ids.length);
  eq('hiệu ứng của chính nó thì bỏ qua hết', n1, 0);
}
sec('khung đánh không khoá chân nữa: RIV_REL');
{
  // `stepTel` ghi `REL_HOLD` (0,42 s) vào `f.rel` sau mỗi đòn để giữ khung đánh trên người quái. Đúng
  // cho một con quái đứng tại chỗ vung; ở đây `f.rel` từng khoá cả chân, nên mỗi đòn là gần nửa giây
  // đối thủ đứng như tượng -- và phần lớn trận nó là một cái bia.
  le('trần rel ngắn hơn hẳn REL_HOLD của quái', LAB.RIV_REL, LAB.REL_HOLD - 0.1);
  ge('nhưng đủ dài để mắt đọc ra khung đánh', LAB.RIV_REL, 0.12);
  const a = arena(7400), w = a.w, f = a.f;
  f.acd = 1e9; f.tel = null; f.rel = LAB.REL_HOLD;
  const x0 = f.x, y0 = f.y;
  LAB.stepRival(w, f, 1 / 60);
  le('rel bị kẹp xuống trần ngay khung sau', f.rel, LAB.RIV_REL);
  ge('nhưng vẫn còn để foeFrame đọc ra khung đánh', f.rel, 0.001);
  for (let n = 0; n < 12; n++) LAB.stepRival(w, f, 1 / 60);
  ge('vừa đánh xong là đi lại được ngay', Math.hypot(f.x - x0, f.y - y0), 2);
}
sec('vừa đi vừa vung: vệt đi theo chân, và chỉ cái nón mới đi theo');
{
  // Đây là mục của `wpTell`. Phía người chơi, tám trong chín cây vũ khí không đặt `plant`: nhân vật đi
  // hết tốc độ suốt nhát vung. Đối thủ giờ cũng vậy -- nhưng nó thì có một vùng cảnh báo trên sàn, nên
  // cái phải chứng minh là *vùng ấy đi theo nó*, từng khung, không lệch một px. `heroIn` và
  // `drawTellUnder` cùng đọc `e.x`/`e.y` (js/foe-abil.js), nên gốc đúng là hình đúng và sát thương đúng.
  //
  // Và `e.ang` **không** được đổi: hướng chốt lúc thả. Một cú vừa đi vừa ngắm lại là một cú không đọc
  // được, tức là đúng cái mà mọi vùng cảnh báo trong game này tồn tại để chống.
  const dt = 1 / 60;
  const walk = (key, drag) => {
    const a = arena(7450), w = a.w, f = a.f, h = w.hero;
    const A = LAB.FOE_ABIL[key];
    if (A.wpid) f.wp = LAB.WEAPON_BY_ID[A.wpid];
    // Kê nhân vật ra ngoài băng một chút để đối thủ vừa tiến vừa đi ngang, và trong tầm để đòn mở được.
    h.x = f.x + Math.min(A.range * 0.8, 40); h.y = f.y + 1;
    w.fxs.length = 0; w.tels.length = 0;
    f.frozen = 0; f.tel = null; f.acd = 0; f.ai.mir = null;
    if (!LAB.rivalCast(w, f, key, -2)) return null;
    const T = f.tel, ang0 = T.ang, x0 = f.x, y0 = f.y;
    let glued = 1, mvF = 0, allF = 0, angMax = 0, tx0 = T.x, ty0 = T.y, telD = 0;
    for (let n = 0; n < 400 && !T.fired; n++) {
      const i = w.tels.indexOf(T);
      if (i >= 0) LAB.stepTel(w, T, dt, i);
      if (T.fired) break;
      LAB.stepRival(w, f, dt);
      if (Math.abs(T.x - f.x) > 0.01 || Math.abs(T.y - (f.y - 1)) > 0.01) glued = 0;
      angMax = Math.max(angMax, Math.abs(T.ang - ang0));
      telD = Math.hypot(T.x - tx0, T.y - ty0);
      if (f.mv > 0.4) mvF++;
      allF++;
    }
    return { key: key, w: w, f: f, T: T, glued: glued, angMax: angMax, telD: telD,
             feet: Math.hypot(f.x - x0, f.y - y0), mvPct: allF ? mvF / allF : 0 };
  };
  // Bảy hàng nón + một hàng đường (cung): tất cả `aim: 'dir'`, gốc vệt là chỗ nó đứng.
  for (const wp of LAB.WEAPONS) {
    const A = LAB.RIVAL_WP[wp.id];
    if (!A || A.aim !== 'dir') continue;
    const r = walk(A.key, true);
    if (!r) { eq('w_' + wp.id + ': mở được đòn', false, true); continue; }
    ge('w_' + wp.id + ': đôi chân đi được trong lúc lên đòn (' + r1(r.feet) + 'px)', r.feet, 3);
    ge('w_' + wp.id + ': vòng chân có chạy (' + Math.round(r.mvPct * 100) + '% khung)', r.mvPct, 0.8);
    eq('w_' + wp.id + ': gốc vệt dán vào chân từng khung', r.glued, 1);
    ge('w_' + wp.id + ': vệt dời theo đúng quãng chân đi (' + r1(r.telD) + 'px)', r.telD, 3);
    le('w_' + wp.id + ': nhưng hướng thì chốt lúc thả', r.angMax, 1e-9);
    // Tay chỉ đúng hướng vệt, không chúc xuống đất: gốc vệt *bằng* chỗ nó đứng, nên công thức cũ
    // (`atan2(dy, tel.x - f.x)`) chia cho đúng số 0 và trả về 90 độ suốt quãng báo đòn.
    le('w_' + wp.id + ': tay chỉ theo hướng vệt, không chúc xuống đất',
       Math.abs(r.f.aimAng - r.T.ang), 0.5);
  }
  // Cây rìu: `aim: 'hero'` chấm một cái hố xuống chỗ nhân vật, nên nó **phải** khoá chân -- dời theo chân
  // là dời cái hố đi khỏi chỗ đã đánh dấu.
  {
    const r = walk('w_riu', false);
    if (r) {
      le('w_riu: cây rìu vẫn khoá chân (' + r1(r.feet) + 'px)', r.feet, 0.01);
      le('w_riu: và cái hố nằm đúng chỗ đã chấm', r.telD, 0.01);
    } else eq('w_riu: mở được đòn', false, true);
  }
  // Chiêu thì khoá chân, cả mười sáu hàng: vệt của chúng không đi theo ai.
  {
    const ids = Object.keys(LAB.RIVAL_SK);
    let moved = 0;
    for (const id of ids) {
      const r = walk('r_' + id, false);
      if (r && (r.feet > 0.01 || r.telD > 0.01)) moved++;
    }
    eq('mười sáu chiêu vẫn khoá chân như cũ (' + ids.length + ' hàng)', moved, 0);
  }
}
sec('nhịp trận: đi thường xuyên, và đánh thường là đòn chính');
{
  // Đo trên một trận thật, không đo bảng: sáu bộ kit khác nhau, mỗi bộ hai mươi giây, nhân vật đứng im
  // (không né, không đánh trả) để cái được đếm là *lựa chọn của đối thủ* chứ không phải phản ứng.
  // Nhân vật bất tử bằng máu chứ không bằng `w.god`: `god` đổi luôn cả nhánh kết trận.
  const INP = { dx: 0, dy: 0, ax: 0, ay: 0 };
  let wpN = 0, skN = 0, mvF = 0, allF = 0, flips = 0, casts = 0;
  for (let s = 0; s < 6; s++) {
    const a = arena(7500 + s), w = a.w, f = a.f, h = w.hero;
    h.maxhp = 1e9; h.hp = 1e9;
    INP.ax = h.x; INP.ay = h.y;
    let prev = null, side = f.ai.side;
    for (let n = 0; n < 20 * 60; n++) {
      LAB.step(w, 1 / 60, INP);
      if (f.dying || w.duel.done) break;
      const t = f.tel;
      if (t && t !== prev) { casts++; if (t.ab.wpid) wpN++; else skN++; }
      prev = t;
      if (f.ai.side !== side) { flips++; side = f.ai.side; }
      if (f.mv > 0.4) mvF++;
      allF++;
    }
  }
  ge('trận nào cũng có đòn được thả', casts, 30);
  // Yêu cầu là "đánh thường nhiều hơn", và đây là con số nói ra điều đó: cây vũ khí (`RIV_WP_BIAS` +
  // `A.cd = cd × [0,85 … 1,30]`) phải áp đảo ba chiêu, không phải lấp chỗ giữa hai lần hồi chiêu. Bình
  // mana `DUEL_MP` cộng `DUEL_MPR` chỉ trả nổi vài chiêu trong hai mươi giây, nên phần còn lại của cả
  // trận là tay không -- đúng ý của cả hai yêu cầu cùng lúc.
  ge('đánh thường nhiều hơn hẳn tổng ba chiêu (' + wpN + ' vs ' + skN + ')', wpN, skN * 2);
  ge('mỗi trận trung bình trên 6 nhát vung', wpN, 36);
  // Và chân: một đối thủ đứng im trong băng khoảng cách là một cái bia cho mọi chiêu nhắm điểm. Sàn 65%
  // chứ không phải một nửa, và con số ấy đo được là nhờ `wpTell`: khi nhát vung còn khoá chân thì hai
  // yêu cầu "đánh thường nhiều hơn" và "di chuyển thường xuyên" chống nhau -- đánh dày hơn *là* đứng im
  // nhiều hơn, và đo ra đúng 30%. Giờ chỉ quãng lên đòn của chiêu mới khoá chân, nên hai yêu cầu cùng
  // hướng: nhát vung dày lên mà chân vẫn chạy.
  ge('phần lớn thời gian đối thủ đang di chuyển (' + Math.round(mvF / allF * 100) + '%)',
     Math.round(mvF / allF * 100), 65);
  // Đảo chiều đi ngang 0,34-0,86 giây một lần: trong 120 giây phải là hàng trăm lần, không phải vài
  // lần. Một đường vòng dài thì người chơi đọc được cung của nó sau nửa giây và chỉ cần dẫn tay theo.
  ge('đổi chiều đi ngang liên tục (' + flips + ' lần / ' + r1(allF / 60) + 's)', flips, 100);
}

sec('bộ não, việc thứ nhất: ra khỏi vùng sắp nổ');
{
  // Ruộng Than nổ nhịp đầu ở 0,19 giây, và vùng rộng 42 px trong khi đi bộ 0,19 giây được 9 px: nên
  // đây là một tình huống **chỉ thoát được bằng cú lao**, tức là nó kiểm cả nhánh "lao khi đi bộ không
  // kịp" chứ không chỉ kiểm hướng chạy. `dcd` về 0 vì `spawnRival` cho cú lao nửa giây hồi mở màn --
  // giữ nguyên nó thì mục này chỉ chứng minh được rằng nửa giây đầu vòng nó không lao, đúng nhưng
  // không phải điều cần chứng minh ở đây.
  //
  // Vùng được thả **lệch 14 px về phía nhân vật**, và chỗ đặt ấy là cả phép thử: né đúng là chạy ra xa
  // nhân vật, còn không đọc được bảng thì việc mặc định của nó là *tiến vào* băng khoảng cách, tức là
  // đi thẳng vào giữa vùng. Thả đúng lên chân nó thì `DTH` không có hướng nào để trả (khoảng cách 0,
  // vector chia cho 0,001) và cả mục thành một phép đo tiếng ồn.
  const run = seed => {
    const a = arena(seed), w = a.w, f = a.f, h = w.hero;
    f.acd = 1e9;                                  // khoá phần chọn đòn: mục này đo *chân*, không đo tay
    f.ai.dcd = 0;
    const dscr = Math.max(Math.hypot(h.x - f.x, (h.y - 1) - f.y), 1e-3);
    const ux = (h.x - f.x) / dscr, uy = ((h.y - 1) - f.y) / dscr;
    const i = IDX.ember_field;
    w.cds[i] = 0; h.mp = 1e9;
    LAB.cast(w, i, f.x + ux * 14, f.y - 1 + uy * 14);
    const e = w.fxs[w.fxs.length - 1];
    const hp0 = f.hp;
    for (let n = 0; n < 18; n++) LAB.step(w, 1 / 60);   // 0,30 giây: quá nhịp đầu một quãng
    return { d: scrOf(f, e.x, e.y), lost: hp0 - f.hp };
  };
  const got = run(8001);
  ge('bước ra khỏi Ruộng Than trước nhịp đầu', Math.round(got.d), LAB.SK_THREAT.ember_field.r);
  eq('và không mất máu vì nó', got.lost, 0);

  // Phép đối chứng, và nó là phần đáng giá nhất của mục này: xoá hàng khỏi bảng thì nó **phải** ăn
  // đòn. Không có phép này thì cả mục trên vẫn xanh với một đối thủ ngẫu nhiên đi chệch ra ngoài.
  const save = LAB.SK_THREAT.ember_field;
  delete LAB.SK_THREAT.ember_field;
  const blind = run(8001);
  LAB.SK_THREAT.ember_field = save;
  ge('đối chứng: xoá hàng khỏi bảng thì nó đứng đó mà ăn đòn', blind.lost, 1);
  eq('bảng đã được trả lại nguyên vẹn', LAB.SK_THREAT.ember_field, save);
}
sec('bộ não, bốn việc nó cố ý KHÔNG làm');
{
  // 1. Không né thứ không kịp né. Sao Vỡ nổ ở 0,071 giây; một AI né được nó là một AI gian lận. Nhưng
  //    nó cũng không được *không biết gì*: nó trả bằng khoảng cách, tức là `DTH.near`.
  {
    const a = arena(8101), w = a.w, f = a.f, T = LAB.SK_THREAT.star_rupture;
    w.cds[IDX.star_rupture] = 0; w.hero.mp = 1e9;
    // Thả đúng lên chân nó, rồi hỏi *ngay khung ấy* -- không bước, vì `duelThreat` bỏ qua hiệu ứng đã
    // quá `t1 + 0,05`, và cả đời Sao Vỡ chỉ dài 0,07 giây.
    eq('thả được Sao Vỡ lên chân nó', !!LAB.cast(w, IDX.star_rupture, f.x, f.y - T.oy), true);
    eq('Sao Vỡ (fast): không né phản xạ', LAB.duelThreat(w, f), false);
    eq('và vì thế không có gì phải thoát', LAB.DTH.need, 0);
    ge('nhưng vẫn đặt khoảng cách đề phòng', LAB.DTH.near, T.r);
    // Đối chứng cho chính lời trên: bỏ cờ `fast` đi thì đúng cái vòng ấy *phải* thành một cú né. Không
    // có dòng này thì "không né" cũng xanh khi hàng nằm ngoài tầm quét, tức là xanh vì lý do khác.
    delete T.fast;
    eq('đối chứng: bỏ cờ fast thì đúng vòng ấy thành một cú né', LAB.duelThreat(w, f), true);
    T.fast = 1;
    eq('cờ fast đã được trả lại', LAB.SK_THREAT.star_rupture.fast, 1);
  }
  // 2. Không né vệt của **chính nó**. Một AI né đòn của mình thì không bao giờ đánh trúng ai, và
  //    Ngưng Thời (r 78 quanh chính nó) là hàng dễ gây ra chuyện đó nhất.
  {
    const a = arena(8102), w = a.w, f = a.f;
    f.ai.kcd = [0, 0, 0]; f.mp = LAB.DUEL_MP;
    eq('thả được Ngưng Thời', LAB.rivalCast(w, f, 'r_time_halt', 0), true);
    eq('vệt của nó có trong w.tels', w.tels.length, 1);
    eq('không né vệt của chính mình', LAB.duelThreat(w, f), false);
    eq('và không có gì phải thoát', LAB.DTH.need, 0);
  }
  // 3. Không chọn một đòn không dùng được. Ba cửa: ngoài băng tầm, đang hồi, thiếu mana -- và cả ba
  //    phải đóng *cùng lúc*, nên quét ngẫu nhiên thay vì kiểm từng cửa một.
  {
    const a = arena(8103), w = a.w, f = a.f;
    const rng = LAB.mulberry32(606), ids = Object.keys(LAB.RIVAL_SK);
    let viol = 0, nnull = 0, nsome = 0;
    for (let n = 0; n < 4000; n++) {
      f.kit = [ids[rng.int(0, 16)], ids[rng.int(0, 16)], ids[rng.int(0, 16)]];
      f.wp = LAB.WEAPONS[rng.int(0, LAB.WEAPONS.length)];
      f.mp = rng.range(0, LAB.DUEL_MP);
      for (let i = 0; i < 3; i++) f.ai.kcd[i] = rng() < 0.4 ? rng.range(0.1, 3) : 0;
      f.ai.wcd = rng() < 0.4 ? rng.range(0.1, 2) : 0;
      const dq = rng.range(4, 240);
      const p = LAB.rivalPick(w, f, dq);
      if (!p) { nnull++; continue; }
      nsome++;
      const A = LAB.FOE_ABIL[p.key];
      if (!A) { viol++; continue; }
      if (A.mp > f.mp + 1e-9) viol++;
      else if (dq > A.range || dq < (A.min || 0)) viol++;
      else if (p.i >= 0 && (f.ai.kcd[p.i] > 0 || A.key !== 'r_' + f.kit[p.i])) viol++;
      else if (p.i === -1 && (f.ai.wcd > 0 || A.wpid !== f.wp.id)) viol++;
    }
    eq('không bao giờ chọn một đòn không dùng được (4000 mẫu)', viol, 0);
    ge('và vẫn chọn được đòn ở phần lớn tình huống', nsome, 1500);
    ge('vẫn biết im khi không có gì dùng được', nnull, 1);
  }
  // 4. Không rút máu bằng cách chạm vào. `stepFoe` rút 22 máu/giây cho mọi thứ dán vào nhân vật;
  //    `stepRival` cố ý không có dòng ấy, vì một dòng máu chảy không báo trước là thứ duy nhất trong
  //    trận này người chơi không có câu trả lời -- và nó phạt đúng cái việc áp sát, tức là phạt đúng
  //    câu trả lời cho một đối thủ tầm xa.
  {
    const a = arena(8104), w = a.w, f = a.f, h = w.hero;
    f.acd = 1e9;                                  // không đánh: chỉ dán vào người
    const hp0 = h.hp;
    for (let n = 0; n < 240; n++) { f.x = h.x; f.y = h.y; LAB.step(w, 1 / 60); }
    eq('dán vào người 4 giây: nhân vật không mất máu', hp0 - h.hp, 0);
  }
}
sec('bộ não, việc thứ ba: giữ băng khoảng cách của cây vũ khí');
{
  // Đây là mục chứng minh rằng chín cây vũ khí cho chín *cách chơi*, chứ không chỉ chín con số trong
  // bảng: cùng một bộ não, đổi cây vũ khí, thì chỗ nó đứng phải đổi theo. Cả mục khoá tay (`f.acd`)
  // để chỉ còn chân, và giữ nhân vật đứng im -- băng khoảng cách là *khoảng cách hai bên*, nên chỉ
  // đọc được khi một bên không đi đâu.
  const hold = (id, seed) => {
    const a = arena(seed), w = a.w, f = a.f, h = w.hero;
    f.acd = 1e9;
    f.wp = LAB.WEAPON_BY_ID[id];
    f.ai.band = LAB.duelBand(f.wp);
    // Đặt nó ở đúng băng thì mục này không kiểm gì cả -- nó phải *đi tới* băng, nên bắt đầu từ xa.
    f.x = h.x + 210; f.y = h.y - 1;
    let path = 0, sum = 0, n = 0;
    for (let k = 0; k < 480; k++) {                    // 8 giây
      const px = f.x, py = f.y;
      LAB.step(w, 1 / 60);
      path += Math.hypot(f.x - px, f.y - py);
      if (k >= 300) { sum += dqOf(w, f); n++; }         // chỉ đo 3 giây cuối
    }
    return { band: f.ai.band, avg: sum / n, path: path, dq: dqOf(w, f) };
  };
  for (const id of ['cung', 'gang', 'thuong', 'kiem', 'khien']) {
    const g = hold(id, 8200 + id.length);
    const lo = g.band * 0.62, hi = g.band * 1.42;
    ge(id + ': từ 210 px đi vào băng ' + r1(g.band) + ' (đo được ' + r1(g.avg) + ')', r1(g.avg), r1(lo));
    le(id + ': và không dán vào người', r1(g.avg), r1(hi));
    // Đứng yên trong băng là một cái bia cho mọi chiêu nhắm điểm, nên nó phải *đi ngang*: 8 giây mà
    // quãng đường đi được ít hơn 200 px thì nó đã đứng lại ở đâu đó.
    ge(id + ': và vẫn đi ngang trong băng', Math.round(g.path), 200);
  }
  // Và ba cây phải cho ba chỗ đứng *khác nhau*, không phải ba con số gần nhau: một tay cung đứng xa
  // hơn một tay găng ít nhất 40 px, nếu không thì "chín cách chơi" chỉ là chín cái tên.
  const cu = hold('cung', 8301), ga = hold('gang', 8302);
  ge('tay cung đứng xa hơn tay găng hẳn một quãng', Math.round(cu.avg - ga.avg), 40);
}

sec('điểm đón: đón đà chạy, không đón một cú giật');
{
  const a = arena(8400), w = a.w, f = a.f, h = w.hero;
  // Đứng im thì điểm đón *là* chỗ đang đứng. Nghe hiển nhiên, nhưng nó là nửa lời hứa: một công thức
  // đón sai dấu vẫn đón đúng khi có đà, và chỉ lộ ra ở đây.
  f.ai.hvx = 0; f.ai.hvy = 0;
  const p0 = LAB.rivalLead(w, f, 0.70);
  eq('đứng im: điểm đón là chỗ đang đứng (x)', r1(p0.x), r1(h.x));
  eq('đứng im: điểm đón là chỗ đang đứng (y)', r1(p0.y), r1(h.y));
  // Có đà thì đón *về phía trước*, và trần là `RIV_LEAD × 0,85 × 0,55` = 52,4 px: một cú dash chạy
  // hơn 400 px/s trong 0,18 giây, và đón theo con số đó là đón ra ngoài tường.
  f.ai.hvx = 900; f.ai.hvy = 0;
  const p1 = LAB.rivalLead(w, f, 3.0);
  ge('có đà: đón về phía trước', Math.round(p1.x - h.x), 1);
  le('nhưng không quá trần 112 × 0,85 × 0,55', r1(p1.x - h.x), 52.4);
  // Và trần ấy phải là *trần của độ lớn*, không phải trần của từng trục: đón chéo không được vượt xa
  // hơn đón ngang chỉ vì hai trục cộng lại.
  f.ai.hvx = 900; f.ai.hvy = 900;
  const p2 = LAB.rivalLead(w, f, 3.0);
  le('đón chéo cũng nằm trong đúng cái trần ấy', r1(Math.hypot(p2.x - h.x, p2.y - h.y)), 52.4);
  // Đòn báo nhanh thì đón ít: `k = min(tell, 0.85) × 0.55`, nên một vệt 0,2 giây đón bằng non một
  // phần tư một vệt 0,85 giây. Đón đủ cho một vệt ngắn là đón ra sau lưng người chơi.
  f.ai.hvx = 100; f.ai.hvy = 0;
  const s = LAB.rivalLead(w, f, 0.20), l = LAB.rivalLead(w, f, 0.85);
  eq('vệt ngắn thì đón non hơn vệt dài, đúng tỷ lệ tell', r1((s.x - h.x) / (l.x - h.x)), r1(0.2 / 0.85));
}

sec('Bóng Lướt: cú dịch chuyển đi đúng cái vệt đã vẽ ra sàn');
{
  // Đòn duy nhất trong bảng *dời chỗ* đối thủ, nên nó là đòn duy nhất có thể phá lời hứa lớn nhất của
  // chế độ này: mọi chuyển động của đối thủ đều đọc được trước. Nó dời tới đúng cuối cái vệt đã nằm
  // trên sàn 0,4 giây -- không phải tới chỗ nhân vật, không phải một quãng ngẫu nhiên.
  const a = arena(8500), w = a.w, f = a.f, h = w.hero;
  f.x = h.x - 90; f.y = h.y - 1;                 // trong tầm 82 của Bóng Lướt (đo bằng dq)
  f.kit = ['shadow_dash', 'shadow_dash', 'shadow_dash'];
  f.ai.kcd = [0, 0, 0]; f.mp = LAB.DUEL_MP; f.acd = 0;
  eq('thả được Bóng Lướt', LAB.rivalCast(w, f, 'r_shadow_dash', 0), true);
  const e = f.tel, A = LAB.FOE_ABIL.r_shadow_dash;
  // Cuối vệt, tính bằng đúng công thức `telEnd` -- không xuất ra LAB nên tính lại tại đây, và tính
  // lại được vì nó chỉ là một phép cộng lượng giác trên khung nén `GSQ`.
  const ex = e.x + Math.cos(e.ang) * A.len;
  const ey = e.y + Math.sin(e.ang) * A.len * LAB.GSQ + 1;
  const x0 = f.x, y0 = f.y;
  f.acd = 1e9;                                   // không thả thêm đòn nào sau cú này
  let n = 0;
  while (f.ai.blink && n++ < 300) LAB.step(w, 1 / 60);
  le('tới đúng cuối vệt (lệch ≤ 2 px)', r1(Math.hypot(f.x - ex, f.y - ey)), 2);
  ge('và đó là một cú dời chỗ thật, không phải một bước chân', Math.round(Math.hypot(f.x - x0, f.y - y0)), 40);
  eq('cờ blink đã được dọn', f.ai.blink, null);
  le('và nó nổ trong đúng thời gian của vệt', r1(n / 60), r1(A.dur + 0.05));
}

sec('trong phòng đấu không có quái mọc lên, cũng không có cổng boss');
{
  // Ba đồng hồ của chế độ gốc vẫn chạy trong `step`, và cả ba đều có thể phá trận solo: `spawnT` đổ
  // quái vào phòng, `w.kills` mở cổng boss, `bossGate` dựng một cái cổng trong một cái phòng đã là
  // phòng. Nên mục này bật cả ba lên hết mức rồi bước 5 giây.
  const a = arena(8600), w = a.w, f = a.f;
  f.acd = 1e9;
  w.spawnT = 0; w.kills = 9999; w.hero.hp = w.hero.maxhp;
  for (let k = 0; k < 300; k++) LAB.step(w, 1 / 60);
  const others = w.foes.filter(x => x.kind !== 'rival');
  eq('không con quái nào mọc lên (đã đặt spawnT = 0)', others.length, 0);
  eq('đối thủ thì vẫn còn đó', w.foes.length, 1);
  eq('không có cổng boss nào dựng lên (đã đặt kills = 9999)', !!w.gate, false);
  eq('và không có boss nào', w.boss, null);
  eq('vẫn đang trong phòng đấu', !!w.room, true);
  eq('và vẫn đang trong một trận solo', !!w.duel, true);
}

console.log('');
console.log(bad ? bad + ' chỗ chưa đạt' : 'tất cả đều đạt');
process.exit(bad ? 1 : 0);
