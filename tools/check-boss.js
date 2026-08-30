// Kiểm ba con boss và mười hai chiêu của chúng, không cần browser.
//
// Chạy: node tools/check-boss.js
//
// Nạp y như check-maps.js / check-weapons.js: nối mọi <script src> của index.html theo đúng
// thứ tự trang rồi lấy globalThis.LAB, nên nó bắt luôn lỗi thứ tự file.
//
// Kiểm *lời hứa*, không kiểm lại con số trong bảng. Bốn lời hứa mà một con boss phải giữ:
// vùng đã tô là vùng gây damage (và ngược lại), vùng đó không lớn dần vào người, chiêu đang
// gồng thì đóng băng là hỏng, và khung tung chiêu phải khác khung đi bộ. Sửa số trong bảng
// thì vẫn xanh; làm hỏng cơ chế thì đỏ.
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

// ---- sân sạch --------------------------------------------------------------------
// Không quái tự sinh, không boss tự đến, hero ở giữa map và bất tử tắt khi cần đo damage.
LAB.applyMap(LAB.MAPS[0]);
function bench(seed) {
  const w = LAB.newWorld(seed || 7777, { map: LAB.MAPS[0].id, wp: 'kiem', slots: [0, 1, 2] });
  w.foes.length = 0; w.tels.length = 0;
  w.spawnT = 1e9; w.kills = 0; w.boss = null; w.bossN = 0;
  w.god = false;                        // damage phải thật, vì có mục đo damage
  w.hero.x = Math.round(LAB.WW * 0.5); w.hero.y = Math.round(LAB.WH * 0.5);
  LAB.snapCam(w);
  return w;
}
// Một con boss đứng yên, đủ xa để mọi chiêu đều "với tới" mà không cần nó đi lại.
function caster(w, kind, dx, dy) {
  const f = LAB.unit(kind, w.hero.x + (dx || 40), w.hero.y + (dy || 0));
  f.frozen = 1e9;                       // stepFoe bỏ qua đi lại + niệm chiêu khi frozen
  w.foes.push(f);
  return f;
}
// Đặt hero vào toạ độ *cục bộ chưa dẹt* của một cast rồi hỏi heroIn: đây đúng là phép so
// "chỗ đã tô" với "chỗ ăn đòn", vì cả hai đầu đều đi qua một hàm duy nhất.
function heroAt(w, e, lx, ly) {
  w.hero.x = e.x + lx; w.hero.y = e.y + ly * LAB.GSQ + 1;
  return LAB.heroIn(w, e);
}
// Đo một điểm mà không để cái sổ nợ của shape khoá kết quả: mỗi front/làn/bóng chỉ thu một
// hero đúng một lần, nên không xoá `e.got` thì điểm thứ hai luôn ra "không đau".
function probe(w, e, lx, ly) { e.got = 0; return heroAt(w, e, lx, ly); }
// Bắt đầu một cast và trả về bản ghi telegraph. Phải rã đông trước: stepTel huỷ ngay chiêu của
// một con đang bị chặn, đó là lời hứa thứ ba và có mục riêng để kiểm. Truyền `seed` khi cần hai
// cast *giống hệt nhau*: mấy shape rải đốt, tia hay mắt lưới lấy hình từ `e.seed`, nên hai cast
// khác seed là hai bàn cờ khác nhau và một điểm đo tìm được ở bàn này vô nghĩa ở bàn kia.
function cast(w, f, key, seed) {
  w.tels.length = 0;
  if (seed) w.rng = LAB.mulberry32(seed);
  f.frozen = 0; f.tel = null; f.chg = 0; f.rel = 0; f.dying = 0; f.hp = f.maxhp;
  return LAB.startCast(w, f, key) ? w.tels[w.tels.length - 1] : null;
}
// Mép ngoài mà *hình vẽ* hứa: đúng cái vòng đỏ cứng mỗi shape tô ra, cộng thêm bán kính của
// từng đốt/làn nếu shape rải chúng tới sát mép. Ngoài mép đó thì không được đau -- đây là nửa
// "và ngược lại" của lời hứa thứ nhất.
function bnd(A) {
  if (A.shape === 'rain' || A.shape === 'smite') return A.r + A.nr;
  if (A.shape === 'veins' || A.shape === 'spokes') return A.r + A.thick * 0.9;
  if (A.shape === 'web' || A.shape === 'sigil') return A.r + Math.max(A.nr, A.thick * 0.9);
  if (A.shape === 'blades') return A.r + A.rad;
  return A.r;                           // sweep, waves, spiral, vortex, echo
}
// Mọi trạng thái đáng đo của một cast: giữa lúc gồng, rồi từng mốc sau khi phát. Shape đánh
// theo nhịp thì mỗi nhịp là một trạng thái riêng, vì chỉ nhịp vừa nổ mới gây damage.
function stages(e) {
  const A = e.ab, sp = Math.max(e.dur - A.tell, 1e-3), out = [];
  out.push(() => { e.fired = false; e.ticked = 0; e.t = A.tell * 0.5; });
  const nt = A.sample ? 1 : (e.nd ? e.nd.length : (A.ticks || [0]).length);
  for (const q of [0.02, 0.2, 0.45, 0.7, 0.98])
    for (let tk = 1; tk <= nt; tk++)
      out.push(() => { e.fired = true; e.ticked = tk; e.t = A.tell + q * sp; });
  return out;
}
// Chạy tới hết lúc gồng, mỗi frame đặt hero lại chỗ cần đo rồi hỏi "đang ở trong vùng chưa".
// Đặt lại từng frame là có ý: `gravity_sink` *kéo* hero, và một cái kéo thì không phải là vùng
// tô lớn dần ra -- teleport hero về đúng điểm cần đo tách hai chuyện đó ra.
function windUp(w, e, place, dt) {
  dt = dt || 1 / 60;
  const seen = [];
  let n = 0;
  while (!e.fired && w.tels.indexOf(e) >= 0 && n++ < 700) {
    place(w, e.t);
    seen.push(LAB.heroIn(w, e));
    LAB.stepTel(w, e, dt, w.tels.indexOf(e));
  }
  return seen;
}
// Chạy trọn một cast với hero đứng im ở một điểm, trả về số HP đã mất.
function runCast(w, e, lx, ly) {
  const h = w.hero, hp0 = h.hp;
  let n = 0;
  while (w.tels.indexOf(e) >= 0 && n++ < 900) {
    h.x = e.x + lx; h.y = e.y + ly * LAB.GSQ + 1;
    LAB.stepTel(w, e, 1 / 60, w.tels.indexOf(e));
  }
  return hp0 - h.hp;
}
// `echo` lấy mẫu vị trí hero mỗi 0.085 s, nên phải cho hero *đi* mới có vùng để đo.
function trail(w, e, n, dx, dy) {
  const S = LAB.BOSS_SHAPE.echo;
  for (let i = 0; i < n; i++) {
    w.hero.x += dx === undefined ? 9 : dx; w.hero.y += dy || 0;
    e.st = 0; S.step(w, e, 0.1);
  }
}
const BOSSES = LAB.BOSS_KINDS;
// Mười hai chiêu và chủ của chúng, đọc từ bảng KIND chứ không chép lại: thêm một chiêu cho
// boss là tự động thêm vào mọi mục dưới đây.
const ALL = [], OWNER = {};
for (const k of BOSSES) for (const a of LAB.KIND[k].abil) { ALL.push(a); OWNER[a] = k; }

sec('ngoại hình: boss phải to hơn mọi quái thường');
{
  const normal = Object.keys(LAB.KIND).filter(k => !LAB.KIND[k].boss);
  let maxW = 0, maxH = 0, maxPx = 0;
  for (const k of normal) {
    const g = LAB.GRIDS[k];
    maxW = Math.max(maxW, g[0].length); maxH = Math.max(maxH, g.length);
    maxPx = Math.max(maxPx, g.join('').replace(/\./g, '').length);
  }
  eq('số quái thường', normal.length, 6);
  for (const k of BOSSES) {
    const g = LAB.GRIDS[k];
    const px = g.join('').replace(/\./g, '').length;
    ge(k + ': cao hơn quái cao nhất (' + maxH + ')', g.length, maxH + 6);
    ge(k + ': rộng hơn quái rộng nhất (' + maxW + ')', g[0].length, maxW + 4);
    // "Nhiều chi tiết hơn" đo được: số điểm thật trên người, và số vật liệu dùng để vẽ nó.
    ge(k + ': nhiều điểm hơn quái đặc nhất (' + maxPx + ')', px, maxPx * 2);
    ge(k + ': nhiều loại vật liệu', new Set(g.join('').replace(/\./g, '')).size, 5);
    // Mọi ký tự trên người phải có trong PAL, không thì cả khối đó vẽ ra khoảng trắng.
    const miss = [...new Set(g.join(''))].filter(c => c !== '.' && !LAB.PAL[c]);
    eq(k + ': ký tự lạ ngoài palette', miss.join('') || 'không', 'không');
    // Lưới phải chữ nhật, blit đọc theo hàng đầu.
    eq(k + ': lưới chữ nhật', g.every(r => r.length === g[0].length), true);
  }
}

sec('khung tung chiêu: gồng → dồn → phát, và khác khung đi bộ');
for (const k of BOSSES) {
  const a = LAB.ANIM[k];
  eq(k + ': có bộ cast', !!a.cast, true);
  eq(k + ': đúng 3 khung cast', a.cast.length, 3);
  const key = f => f.g.join('|') + '#' + f.dy;
  const walk = new Set(a.walk.map(key)), idle = new Set(a.idle.map(key));
  a.cast.forEach((f, i) => {
    eq(k + ': khung cast ' + i + ' không trùng đi bộ/đứng', walk.has(key(f)) || idle.has(key(f)), false);
  });
  eq(k + ': ba khung cast khác nhau', new Set(a.cast.map(key)).size, 3);
  // Và khác *bằng mắt*, không chỉ khác theo `!==`. Một khung dồn hơn khung gồng đúng hai điểm
  // là một khung mới với Set và là cùng một khung với người chơi: ở 1x, 24 dòng cao, hai điểm
  // trong một phần tư giây không tồn tại. Nên đếm số ô đổi giữa hai khung liền nhau -- và đếm
  // *trong lưới*, bỏ `dy` ra ngoài: `dy` chỉ nhấc cả người lên xuống một hai pixel, nên nếu
  // tính nó vào thì một khung y hệt khung trước mà lệch dy sẽ "đổi" gần như mọi ô và ngưỡng
  // dưới đây đạt mà chẳng chứng minh được gì. Cái nhấp nhô đó đã có mục riêng ở trên.
  const cells = f => {
    const m = new Map();
    f.g.forEach((line, y) => {
      for (let x = 0; x < line.length; x++) if (line[x] !== '.') m.set(y + ',' + x, line[x]);
    });
    return m;
  };
  const solid = Math.min(...a.cast.map(f => cells(f).size));
  for (let i = 1; i < a.cast.length; i++) {
    const p = cells(a.cast[i - 1]), q = cells(a.cast[i]);
    let n = 0;
    for (const [at, c] of p) if (q.get(at) !== c) n++;
    for (const at of q.keys()) if (!p.has(at)) n++;
    // Một phần mười thân người. Đủ để một cái tay dịch hai pixel hoặc một mảng giáp đổi màu
    // vượt qua, và đủ để "sáng thêm một chút" thì không.
    ge(k + ': khung cast ' + (i - 1) + '→' + i + ' đổi đủ nhiều', n, Math.round(solid * 0.10));
  }
  // foeFrame phải *chọn* chúng, không chỉ để đó: gồng nửa đầu, gồng nửa sau, rồi giữ phát.
  // So bằng boolean chứ không in cả lưới ra -- một khung 26 dòng làm log không đọc được.
  const f = { kind: k, chg: 0.2, rel: 0, mv: 0, ph: 0 };
  eq(k + ': chg thấp → khung gồng', key(LAB.foeFrame(f)) === key(a.cast[0]), true);
  f.chg = 0.9;
  eq(k + ': chg cao → khung dồn', key(LAB.foeFrame(f)) === key(a.cast[1]), true);
  f.chg = 0; f.rel = 0.3;
  eq(k + ': rel > 0 → khung phát', key(LAB.foeFrame(f)) === key(a.cast[2]), true);
  f.rel = 0; f.mv = 9;
  eq(k + ': hết cast → về đi bộ', walk.has(key(LAB.foeFrame(f))), true);
}

sec('art ảnh: bốn bộ khung dựng từ images/animations/boss/**');
// Bộ lưới vẽ tay ở trên vẫn còn và vẫn được kiểm, nhưng thứ *thật sự hiện trên màn hình* là
// art này (render.js chọn nó khi ANIM_IMG có con đó). Nên bốn lời hứa ở đây là bốn lời hứa về
// cái người chơi nhìn thấy: mọi ký tự vẽ ra được, mọi khung lật được đúng trục, thanh máu
// không đè lên người, và khung sáng nhất của bộ cast không bao giờ hiện trước lúc chiêu phát.
const IMG = LAB.ANIM_IMG || {};
{
  const SETS = ['idle', 'walk', 'cast', 'hit', 'death'];
  const key = f => f.g.join('|') + '#' + f.dy;
  // Độ sáng *trung bình trên mỗi điểm thân*, không phải tổng: khung bùng vừa to hơn vừa sáng
  // hơn, và tổng thì không tách được hai thứ đó ra.
  const meanLum = (f, pal) => {
    let s = 0, n = 0;
    for (const line of f.g) for (const ch of line) {
      const c = pal[ch];
      if (c) { s += c[0] * 0.30 + c[1] * 0.59 + c[2] * 0.11; n++; }
    }
    return n ? s / n : 0;
  };
  const normal = Object.keys(LAB.KIND).filter(k => !LAB.KIND[k].boss);
  let maxW = 0, maxH = 0;
  for (const k of normal) {
    maxW = Math.max(maxW, LAB.GRIDS[k][0].length);
    maxH = Math.max(maxH, LAB.GRIDS[k].length);
  }
  eq('cả ba con đều có art', LAB.BOSS_KINDS.filter(k => IMG[k]).length, LAB.BOSS_KINDS.length);
  for (const k of LAB.BOSS_KINDS) {
    const a = IMG[k];
    if (!a) continue;
    const A = LAB.BOSS_ART[k];
    const all = [];
    for (const s of SETS) { ge(k + ': có bộ ' + s, (a[s] || []).length, 1); all.push(...(a[s] || [])); }

    // Ký tự lạ = một khối người vẽ ra khoảng trắng, và nó không ném lỗi ở đâu cả.
    const chars = new Set();
    for (const f of all) for (const line of f.g) for (const ch of line) if (ch !== '.') chars.add(ch);
    eq(k + ': ký tự lạ ngoài palette riêng',
       [...chars].filter(c => !a.pal[c]).join('') || 'không', 'không');
    // Và ngược lại: palette phải nằm trong dải ký tự mà bộ sinh biết đánh số. Màu thứ 63 trở
    // đi sẽ được gán một ký tự không có trong BOSS_ART_CH, tức là một màu vẽ mãi không ra.
    le(k + ': số màu vừa dải ký tự', A.pal.length, LAB.BOSS_ART_CH.length);

    // Lật đúng trục. `blit` lật *trong lòng lưới* (cột c đổi cho cột w-1-c), nên hai điều kiện:
    // mọi khung cùng một bề rộng, và bề rộng đó lẻ để cột neo tự đổi cho chính nó. Rộng chẵn
    // thì cả con boss trượt một pixel mỗi lần nó đổi hướng, và cái trượt đó nhìn ra thành sprite
    // bị lỗi chứ không ra thành nhân vật quay người.
    eq(k + ': mọi khung cùng bề rộng', new Set(all.map(f => f.g[0].length)).size, 1);
    eq(k + ': bề rộng lẻ (lật quanh cột neo)', A.cw % 2, 1);
    eq(k + ': lưới chữ nhật', all.every(f => f.g.every(r => r.length === f.g[0].length)), true);
    // Không hàng rỗng ở đáy: khung neo ở đáy, nên một hàng rỗng dưới cùng là cả con boss lơ
    // lửng đúng ở khung đó -- và lơ lửng ở vài khung thì thành giật.
    eq(k + ': không hàng rỗng ở đáy', all.every(f => !/^\.*$/.test(f.g[f.g.length - 1])), true);

    // To hơn mọi quái thường, đúng lời hứa mà bộ lưới vẽ tay đang giữ ở mục trên.
    const idle0 = a.idle[0];
    ge(k + ': cao hơn quái cao nhất (' + maxH + ')', idle0.g.length, maxH + 6);
    ge(k + ': rộng hơn quái rộng nhất (' + maxW + ')', A.bw, maxW + 4);

    // Hộp gameplay. bh là chỗ treo thanh máu và nó phải cao hơn *mọi* tư thế còn sống, không
    // chỉ tư thế đứng: một thanh máu nằm giữa hai cái sừng là thanh máu không đọc được đúng
    // lúc cần đọc nó nhất. bw thì phải nằm trong lưới, vì hitbox rộng hơn lưới là trúng đòn ở
    // chỗ không có gì cả.
    const alive = [...a.idle, ...a.walk, ...a.cast, ...a.hit];
    ge(k + ': bh cao hơn mọi tư thế còn sống', a.bh, Math.max(...alive.map(f => f.g.length - f.dy)));
    le(k + ': bw nằm trong lưới', a.bw, a.cw);
    const u = LAB.unit(k, 100, 100);
    eq(k + ': unit() lấy hộp theo art', u.w + 'x' + u.h, a.bw + 'x' + a.bh);

    // Khung chết phải *đổ xuống*: khung cuối thấp hơn tư thế đứng, không thì "chết" chỉ là
    // đứng im rồi tan biến.
    le(k + ': khung chết cuối thấp hơn khung đứng',
       a.death[a.death.length - 1].g.length, idle0.g.length - 4);

    // Bốn khung cast phải khác nhau *bằng mắt*, đo như mục lưới vẽ tay: đếm ô đổi giữa hai
    // khung liền nhau, ngưỡng một phần mười thân người.
    const cells = f => {
      const m = new Map();
      f.g.forEach((line, y) => {
        for (let x = 0; x < line.length; x++) if (line[x] !== '.') m.set(y + ',' + x, line[x]);
      });
      return m;
    };
    const solid = Math.min(...a.cast.map(f => cells(f).size));
    for (let i = 1; i < a.cast.length; i++) {
      const p = cells(a.cast[i - 1]), q = cells(a.cast[i]);
      let n = 0;
      for (const [at, c] of p) if (q.get(at) !== c) n++;
      for (const at of q.keys()) if (!p.has(at)) n++;
      ge(k + ': khung cast ' + (i - 1) + '→' + i + ' đổi đủ nhiều', n, Math.round(solid * 0.10));
    }

    // foeImgFrame phải *chọn* đúng bộ theo trạng thái, và trạng thái là những trường world.js
    // vốn đã có -- không con boss nào mang thêm một đồng hồ riêng cho hoạt ảnh.
    const st = o => Object.assign({ kind: k, dying: 0, chg: 0, rel: 0, flash: 0, mv: 0, ph: 0 }, o);
    const inSet = (f, s) => new Set(a[s].map(key)).has(key(f));
    eq(k + ': đứng im → bộ đứng', inSet(LAB.foeImgFrame(st({})), 'idle'), true);
    eq(k + ': đang đi → bộ đi', inSet(LAB.foeImgFrame(st({ mv: 9, ph: 1 })), 'walk'), true);
    eq(k + ': vừa ăn đòn → bộ trúng đòn', inSet(LAB.foeImgFrame(st({ flash: 0.45 })), 'hit'), true);
    eq(k + ': đang chết → bộ chết', inSet(LAB.foeImgFrame(st({ dying: 0.15 })), 'death'), true);
    // Bốn khung chết trải hết 0,30 s: khung đầu và khung cuối phải là hai khung khác nhau, không
    // thì hai phần ba bộ chết chưa bao giờ lên màn hình.
    eq(k + ': bộ chết chạy hết vòng',
       key(LAB.foeImgFrame(st({ dying: 0.01 }))) !== key(LAB.foeImgFrame(st({ dying: 0.29 }))), true);
    // Chết thắng mọi thứ khác: một con boss vừa đổ xuống mà vẫn giơ tay tung chiêu là hỏng.
    eq(k + ': chết thắng cast', inSet(LAB.foeImgFrame(st({ dying: 0.1, chg: 0.9 })), 'death'), true);
    // Cast thắng trúng đòn: cái người chơi cần đọc lúc đó vẫn là chiêu, không phải cú giật lùi.
    eq(k + ': cast thắng trúng đòn',
       inSet(LAB.foeImgFrame(st({ chg: 0.5, flash: 0.55 })), 'cast'), true);

    // Lời hứa đáng nhất của bộ cast: khung sáng nhất là khung *phát*, nên nó không được hiện
    // ra lúc còn đang gồng. Người chơi né bằng cách đọc telegraph; một con boss loé sáng trước
    // khi có gì xảy ra là dạy người chơi né vào đúng lúc chưa cần né.
    const lum = a.cast.map(f => meanLum(f, a.pal));
    const peak = Math.max(...lum);
    let hi = 0;
    for (let c = 1; c <= 100; c++) hi = Math.max(hi, meanLum(LAB.foeImgFrame(st({ chg: c / 100 })), a.pal));
    le(k + ': đang gồng chưa bao giờ sáng bằng khung phát', +(hi / peak).toFixed(3), 0.95);
    // Và khung sáng nhất đó *có* lên màn hình, đúng trong 0,42 s của f.rel.
    let seen = 0;
    for (let c = 1; c <= 42; c++)
      seen = Math.max(seen, meanLum(LAB.foeImgFrame(st({ rel: LAB.REL_HOLD * c / 42 })), a.pal));
    eq(k + ': khung phát có lên màn hình', +(seen / peak).toFixed(3), 1);
  }
  // Ba con ba palette: một bảng dùng chung nghĩa là ba con art khác hẳn nhau bị nhồi vào 62 màu.
  eq('ba palette khác nhau',
     new Set(LAB.BOSS_KINDS.map(k => (LAB.BOSS_ART[k] || { pal: [] }).pal.join())).size,
     LAB.BOSS_KINDS.length);
}

const TAU = Math.PI * 2;

sec('vùng đã tô là vùng gây damage, và ngược lại');
// Đo bằng cách hỏi `heroIn` -- cùng một hàm mà stepTel dùng để trừ máu -- ở toạ độ cục bộ chưa
// dẹt của từng cast. Nên đây không phải kiểm lại con số trong bảng: sửa `r` thì cả hình vẽ lẫn
// phép đo đổi theo, còn tách rời hai bên ra thì mục này đỏ.
for (const key of ALL) {
  const A = LAB.FOE_ABIL[key];
  if (A.shape === 'echo') continue;      // vùng của nó không quanh caster; đo riêng ở dưới
  const R = bnd(A) + LAB.HERO_R;
  const w = bench(), f = caster(w, OWNER[key], 40, 0), e = cast(w, f, key);
  let out = 0, empty = 0, full = 0;
  const st = stages(e);
  for (let s = 0; s < st.length; s++) {
    st[s]();
    for (let i = 0; i < 32; i++) {       // ngoài mép: ba vành, đủ dày để không lọt khe nào
      const a = i / 32 * TAU;
      for (const pad of [2, 9, 24])
        if (probe(w, e, Math.cos(a) * (R + pad), Math.sin(a) * (R + pad))) out++;
    }
    let hit = 0, safe = 0;               // trong mép: phải có chỗ đau *và* có chỗ đứng được
    for (let i = 0; i < 32; i++) {
      const a = i / 32 * TAU;
      for (let r = 1; r <= R; r += 4)
        if (probe(w, e, Math.cos(a) * r, Math.sin(a) * r)) hit++; else safe++;
    }
    if (!hit) empty++;
    if (!safe && s > 0) full++;
  }
  eq(key + ': chỗ đau nằm ngoài mép đã tô', out, 0);
  eq(key + ': lúc nào cũng có chỗ đau', empty, 0);
  eq(key + ': lúc nổ vẫn còn chỗ đứng', full, 0);
}
// `delayed_echo` không lấy tâm caster làm mép: vùng của nó là cái vết hero vừa đi, nên mép của
// nó là mép quanh từng dấu chân. Đo đúng cái đó.
{
  const A = LAB.FOE_ABIL.delayed_echo, R = A.r + LAB.HERO_R;
  const w = bench(), f = caster(w, 'voidherald', 40, 0), e = cast(w, f, 'delayed_echo');
  trail(w, e, 15);
  const p = e.pts[0];
  const at = (dx, dy) => {
    e.got = 0; w.hero.x = p[0] + dx; w.hero.y = p[1] + dy * LAB.GSQ + 1;
    return LAB.heroIn(w, e);
  };
  ge('delayed_echo: có vết để đo', e.pts.length, 7);
  eq('delayed_echo: đứng trên dấu chân cũ nhất → đau', at(0, 0), true);
  eq('delayed_echo: lệch khỏi vết quá mép → không đau', at(0, R + 3), false);
  eq('delayed_echo: lệch phía kia → không đau', at(0, -(R + 3)), false);
}

sec('vùng không lớn dần vào người: an toàn ở frame đầu thì an toàn tới lúc phát');
// Chạy đúng `stepTel` thật, không phải nhảy `e.t`, để nếu có ai làm vùng phình theo thời gian
// thì mục này bắt được. Hero bị đặt lại đúng chỗ mỗi frame, nên cái *kéo* của `gravity_sink`
// không bị tính là vùng bò tới: nó dịch người, không dịch mép.
for (const key of ALL) {
  const A = LAB.FOE_ABIL[key];
  if (A.shape === 'echo') continue;
  const R = bnd(A) + LAB.HERO_R;
  const w = bench(), f = caster(w, OWNER[key], 40, 0);
  let grew = 0, pts = 0;
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU + 0.13;
    for (let r = 2; r <= R + 8; r += 8) {
      const e = cast(w, f, key);
      const lx = Math.cos(a) * r, ly = Math.sin(a) * r;
      const seen = windUp(w, e, () => {
        w.hero.x = e.x + lx; w.hero.y = e.y + ly * LAB.GSQ + 1;
      });
      pts++;
      if (!seen[0] && seen.indexOf(true) >= 0) grew++;
    }
  }
  eq(key + ': điểm bị vùng bò tới (' + pts + ' điểm đo)', grew, 0);
}
// Lại là ngoại lệ có chủ ý, và đây là cái luật thay cho nó: vết do hero vẽ nên đứng im là cách
// duy nhất để nằm trong toàn bộ nó, còn đi thẳng một hướng thì vết nằm lại phía sau. Không phải
// "đừng đứng trong vùng" mà là "đừng lặp lại đường mình vừa đi".
{
  const w = bench(), f = caster(w, 'voidherald', 40, 0);
  const x0 = w.hero.x, y0 = w.hero.y;
  let e = cast(w, f, 'delayed_echo');
  let seen = windUp(w, e, () => { w.hero.x = x0; w.hero.y = y0; });
  eq('delayed_echo: đứng im → cuối cùng đứng trên vết của mình', seen[seen.length - 1], true);
  w.hero.x = x0; w.hero.y = y0;
  e = cast(w, f, 'delayed_echo');
  seen = windUp(w, e, (ww, t) => { ww.hero.x = x0 + t * 120; ww.hero.y = y0; });
  eq('delayed_echo: đi thẳng → vết nằm lại phía sau', seen[seen.length - 1], false);
}

sec('đang gồng mà bị chặn thì chiêu không bao giờ tới');
// Mỗi chiêu kiểm ba lần: một lần không ai chặn (phải mất máu -- không có đối chứng này thì mục
// dưới chỉ đang chứng minh "chiêu không nổ" bằng một chiêu vốn chẳng nổ bao giờ), rồi đóng băng,
// rồi giết. Hero đứng im ở một chỗ chắc chắn nằm trong vùng đã tô cho cả ba lần.
//
// Cả bốn cast của một chiêu đều gieo cùng một seed, và đây là điều kiện để mục này có nghĩa chứ
// không phải cho gọn: mắt lưới, tia và đốt lấy hình từ `e.seed`, nên đổi seed là đổi cả bàn cờ.
// Điểm tìm được trên bàn này rơi vào khe trống của bàn kia, và khi đó "đóng băng → không mất máu"
// đạt vì lý do sai. `frost_web` là chiêu duy nhất thưa đủ để lộ chuyện đó ra.
const SEED5 = 246813;
for (const key of ALL) {
  const A = LAB.FOE_ABIL[key];
  const w = bench(), f = caster(w, OWNER[key], 40, 0);
  let e = cast(w, f, key, SEED5), p = null;
  if (A.shape === 'echo') p = [0, 0];    // đứng im tại chỗ là nằm trong vết của chính mình
  else {
    const R = bnd(A) + LAB.HERO_R;
    for (let i = 0; i < 24 && !p; i++) {
      const a = i / 24 * TAU;
      for (let r = 1; r <= R && !p; r += 2) {
        const lx = Math.cos(a) * r, ly = Math.sin(a) * r;
        if (probe(w, e, lx, ly)) p = [lx, ly];
      }
    }
  }
  eq(key + ': tìm được chỗ nằm trong vùng', !!p, true);
  if (!p) continue;
  e = cast(w, f, key, SEED5);
  ge(key + ': không ai chặn thì mất máu', runCast(w, e, p[0], p[1]), 1);
  for (const how of ['đóng băng', 'giết']) {
    const w2 = bench(), f2 = caster(w2, OWNER[key], 40, 0), e2 = cast(w2, f2, key, SEED5);
    w2.hero.x = e2.x + p[0]; w2.hero.y = e2.y + p[1] * LAB.GSQ + 1;
    for (let n = 0; n < 20 && w2.tels.length; n++)
      LAB.stepTel(w2, e2, 1 / 60, w2.tels.indexOf(e2));
    if (how === 'đóng băng') f2.frozen = 4; else { f2.hp = 0; f2.dying = 0.001; }
    const hp0 = w2.hero.hp;
    for (let n = 0; n < 400 && w2.tels.length; n++) {
      w2.hero.x = e2.x + p[0]; w2.hero.y = e2.y + p[1] * LAB.GSQ + 1;
      LAB.stepTel(w2, e2, 1 / 60, w2.tels.indexOf(e2));
    }
    eq(key + ': ' + how + ' → telegraph biến mất', w2.tels.length, 0);
    eq(key + ': ' + how + ' → không mất máu', hp0 - w2.hero.hp, 0);
    eq(key + ': ' + how + ' → boss thôi gồng', f2.tel === null && f2.chg === 0, true);
  }
}

sec('bộ chiêu: 3-4 chiêu một con, và mỗi chiêu tự nhất quán');
{
  eq('số boss', BOSSES.length, 3);
  eq('tổng số chiêu, không con nào dùng chung', new Set(ALL).size, ALL.length);
  for (const k of BOSSES) {
    const K = LAB.KIND[k];
    const n = K.abil.length;
    eq(k + ': 3-4 chiêu', n >= 3 && n <= 4, true);
    eq(k + ': có cờ boss', K.boss === true, true);
    // Máu là thứ quyết định trận đánh dài một phút chứ không phải ba telegraph, và không con
    // quái thường nào chạm tới ngưỡng này.
    ge(k + ': máu đủ cho một trận', K.hp, 1000);
    eq(k + ': không nằm trong bảng tự sinh', LAB.SPAWN_W.some(r => r[0] === k), false);
  }
  for (const key of ALL) {
    const A = LAB.FOE_ABIL[key];
    eq(key + ': shape có thật', !!LAB.BOSS_SHAPE[A.shape], true);
    // Gồng phải xong trước khi hết chiêu, không thì vùng tô ra rồi tan mà chẳng nổ.
    eq(key + ': tell < dur', A.tell < A.dur, true);
    // Hồi chiêu ngắn hơn thời gian chiêu là hai telegraph của cùng một con chồng lên nhau.
    ge(key + ': cd tối thiểu ≥ dur', A.cd[0], A.dur);
    eq(key + ': cd là một khoảng', A.cd[0] <= A.cd[1], true);
    eq(key + ': có khoảng cách tung được', (A.min || 0) < A.range, true);
    // Trần damage: một chiêu boss vẫn phải là thứ ăn được vài nhịp mới chết, và mọi nhịp của
    // một chiêu nhiều đợt đều rút từ con số này.
    le(key + ': damage một nhịp', A.dmg, 58);
    eq(key + ': có tiếng gõ trước lúc nổ', A.tell > 0.20, true);
  }
  // Luật mới, và là luật mà bốn chiêu một con làm dễ vỡ nhất: chiêu tô quanh chính mình thì
  // tầm tung không được xa hơn tầm với của nó. Vẽ một mắt lưới 78 px từ 150 px là một con boss
  // đứng gồng xong một chiêu chưa bao giờ định chạm vào người chơi.
  for (const key of ALL) {
    const A = LAB.FOE_ABIL[key];
    if (A.aim === 'hero' || A.shape === 'echo') continue;   // cái nó ném thì rơi vào người
    ge(key + ': tầm với ≥ tầm tung (' + A.aim + ')', Math.round(bnd(A) + LAB.HERO_R), A.range);
  }
  // Và cái band boss giữ phải nằm trong tầm với của chiêu tự tâm ngắn nhất nó có, không thì
  // nó đứng đúng chỗ nó chọn mà vẫn không với tới.
  for (const k of BOSSES) {
    const K = LAB.KIND[k];
    if (!K.keep) continue;
    let reach = Infinity;
    for (const key of K.abil) {
      const A = LAB.FOE_ABIL[key];
      if (A.aim === 'self' && A.shape !== 'echo') reach = Math.min(reach, bnd(A) + LAB.HERO_R);
    }
    if (reach === Infinity) continue;
    le(k + ': keep nằm trong tầm chiêu tự tâm ngắn nhất (' + Math.round(reach) + ')', K.keep, reach);
  }
}

sec('cửa boss: đúng mốc, một con một lúc, và không bao giờ do bốc thăm');
{
  const AT = LAB.BOSS_AT;
  const w = bench();
  w.kills = AT - 1; LAB.bossGate(w);
  eq('còn thiếu 1 kill → chưa có boss', w.foes.length, 0);
  w.kills = AT; LAB.bossGate(w);
  eq('đủ ' + AT + ' kill → có boss', w.foes.length, 1);
  eq('boss là một trong ba kind', BOSSES.indexOf(w.foes[0].kind) >= 0, true);
  eq('bossN đếm lên', w.bossN, 1);
  const first = w.boss;
  // Gọi thêm cả trăm frame nữa, kill tăng vượt mốc sau: vẫn chỉ một con. Bốn telegraph từ một
  // caster đã là hết những gì sàn nói được.
  w.kills = AT * 3;
  for (let i = 0; i < 120; i++) LAB.bossGate(w);
  eq('vượt mốc mà con cũ còn sống → không con thứ hai', w.foes.length, 1);
  eq('vẫn là con cũ', w.boss === first, true);
  // Giết nó rồi mới tới lượt con sau, và mốc là 2*AT chứ không phải "kill tiếp theo": một con
  // vừa chết không được kéo con kế vào ngay frame sau.
  first.hp = 0; first.dying = 0.1;
  w.kills = AT * 2 - 1; LAB.bossGate(w);
  eq('boss chết → w.boss nhả ra', w.boss, null);
  eq('chưa tới mốc sau → chưa có con mới', w.foes.length, 1);
  w.foes.length = 0;
  w.kills = AT * 2; LAB.bossGate(w);
  eq('tới mốc ' + AT * 2 + ' → con thứ hai', w.foes.length, 1);
  eq('bossN đếm tiếp', w.bossN, 2);
  eq('con thứ hai khác kind con thứ nhất', w.foes[0].kind !== first.kind, true);
  // Xuất hiện ngoài khung hình, kể cả khi hero đứng sát góc map -- chỗ mà cái clamp có thể kéo
  // điểm sinh về gần người.
  let onScreen = 0, tries = 0;
  for (const [hx, hy] of [[0.5, 0.5], [0.02, 0.02], [0.98, 0.5], [0.5, 0.98], [0.98, 0.98]]) {
    for (let s = 1; s <= 40; s++) {
      const w2 = bench();
      w2.rng = LAB.mulberry32(s * 7919);
      w2.hero.x = LAB.BOUND.x0 + (LAB.BOUND.x1 - LAB.BOUND.x0) * hx;
      w2.hero.y = LAB.BOUND.y0 + (LAB.BOUND.y1 - LAB.BOUND.y0) * hy;
      const f = LAB.spawnBoss(w2);
      tries++;
      if (Math.abs(f.x - w2.hero.x) <= LAB.W * 0.5 && Math.abs(f.y - w2.hero.y) <= LAB.H * 0.5) onScreen++;
    }
  }
  eq('sinh ra trong khung hình (' + tries + ' lần thử)', onScreen, 0);
  // Và một lời hứa của bảng tự sinh, kiểm bằng cách bốc thăm chứ không đọc bảng: boss tới vì
  // cửa mở, không bao giờ vì hẹn giờ sinh quái bốc trúng.
  const rng = LAB.mulberry32(13579);
  let rolled = 0;
  for (let i = 0; i < 40000; i++) if (LAB.KIND[LAB.pickKind(rng)].boss) rolled++;
  eq('pickKind bốc trúng boss (40000 lần)', rolled, 0);
}

sec('vẽ được: mỗi chiêu chạy qua trọn một cast mà không ném lỗi');
// Ba mục trên chỉ hỏi hình học. Mục này hỏi cái mà hình học không thấy: bốn hàm vẽ của mỗi
// shape (`under`, `mid`, `boomUnder`, `boomMid`) có thật là chạy được không. Một `e.nd` chưa
// khởi tạo hay một ký tự ngoài palette nằm im trong nhánh `fired` cho tới đúng frame nó nổ.
{
  const px = new Uint8ClampedArray(LAB.W * LAB.H * 4);
  for (const key of ALL) {
    const w = bench(), f = caster(w, OWNER[key], 40, 0), e = cast(w, f, key, 4242);
    if (LAB.FOE_ABIL[key].shape === 'echo') trail(w, e, 12);
    let n = 0, drew = 0, err = '';
    try {
      while (w.tels.indexOf(e) >= 0 && n++ < 400) {
        LAB.stepTel(w, e, 1 / 60, w.tels.indexOf(e));
        if (n % 6 === 0) { LAB.renderWorld(w, px); drew++; }
      }
    } catch (ex) { err = ex.message; }
    eq(key + ': vẽ không ném lỗi', err || 'không', 'không');
    ge(key + ': số frame đã vẽ', drew, 8);
  }
}

sec('chạy thật: ba mươi giây với một con boss trên sân');
// Cuối cùng là cái mà không mục nào ở trên chạm tới: `step` thật, boss tự đi, tự chọn chiêu,
// tự hồi, và trong ba mươi giây đó nó phải *dùng* bộ chiêu của nó chứ không phải mở đầu bằng
// chiêu tầm xa nhất rồi lặp lại mãi -- đúng lý do `bossCast` tồn tại thay cho tryCast.
for (const k of BOSSES) {
  const w = bench();
  w.god = true;                          // hero phải sống hết ba mươi giây để boss còn niệm
  const f = LAB.spawnBoss(w, k);
  f.acd = 0.4;                           // bỏ 2.2 s đi bộ vào sân: ở đây đo bộ chiêu, không đo lối vào
  const seen = {};
  let err = '', frames = 0;
  try {
    for (let i = 0; i < 1800; i++) {
      const before = w.tels.length;
      LAB.step(w, 1 / 60, null);
      frames++;
      for (let j = before; j < w.tels.length; j++) seen[w.tels[j].key] = (seen[w.tels[j].key] || 0) + 1;
    }
  } catch (ex) { err = ex.message + '\n' + ex.stack.split('\n')[1]; }
  eq(k + ': ba mươi giây không ném lỗi', err || 'không', 'không');
  eq(k + ': đủ 1800 frame', frames, 1800);
  eq(k + ': vẫn đúng một con boss', w.foes.filter(x => LAB.KIND[x.kind].boss).length, 1);
  const used = Object.keys(seen);
  ge(k + ': số chiêu khác nhau đã dùng', used.length, 3);
  ge(k + ': tổng số lần niệm', used.reduce((s, x) => s + seen[x], 0), 5);
  // Không chiêu nào được chiếm quá nửa: `bossCast` loại chiêu vừa dùng, nên một con boss lặp
  // lại một chiêu quá nửa số lần là dấu hiệu ba chiêu kia không bao giờ với tới từ band nó giữ.
  le(k + ': lần niệm của chiêu dùng nhiều nhất', Math.max(...used.map(x => seen[x])),
     Math.ceil(used.reduce((s, x) => s + seen[x], 0) * 0.5));
}

console.log('\n' + (bad ? bad + ' chỗ chưa đạt' : 'tất cả đều đạt'));
process.exit(bad ? 1 : 0);
