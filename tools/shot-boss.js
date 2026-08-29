// Chụp boss thành contact sheet PNG, không cần browser.
//
// Chạy: node tools/shot-boss.js meteor_rain frost_web
//       node tools/shot-boss.js pose:forgelord
//       node tools/shot-boss.js --all
//
// check-boss.js chứng minh được mọi lời hứa đo được của một con boss, và không nói được câu
// duy nhất còn lại: nhìn có ra một trận đánh không. Một telegraph "đúng hình học" vẫn có thể
// là một vũng màu không đọc ra hướng, và ba khung tung chiêu "khác khung đi bộ" vẫn có thể là
// ba khung giống nhau tới mức mắt không thấy. Hai thứ đó chỉ hiện ra khi xem sáu khung cạnh
// nhau, nên tool này có hai chế độ: chụp một chiêu chạy qua trọn một cast, và xếp thẳng bộ
// khung đi bộ với bộ khung tung chiêu để so.
//
// Nạp engine y như check-boss.js / shot-skills.js: nối mọi <script src> của index.html theo
// đúng thứ tự trang rồi chạy bằng node:vm.
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

const COLS = 3;
// Hai mốc trước khi nổ và bốn mốc sau: chỗ đáng xem của một chiêu boss nằm sau lúc phát, vì
// đó là lúc vùng tô biến thành thứ đang chạy.
const MARKS = [0.14, 0.36, 0.54, 0.68, 0.82, 0.95];

// Khung nhìn tính từ chính tầm của chiêu chứ không chép tay từng cái: một mắt lưới 78 px và
// một cơn mưa 92 px cần hai cỡ crop khác nhau, và nếu sửa `r` trong bảng thì ảnh phải rộng
// theo. Chừa 34 px quanh mép để thấy được cả cái vòng đỏ ngoài cùng.
function viewFor(A) {
  const R = (A.shape === 'echo' ? 70 : A.r + (A.nr || A.rad || A.thick || 0)) + 34;
  const w = Math.min(320, Math.max(150, Math.round(R * 2)));
  return { w, h: Math.min(LAB.H, Math.round(w * 0.60)), dy: -8, scale: w > 230 ? 2 : 3 };
}
function newSheet(view, n) {
  const tw = view.w * view.scale, th = view.h * view.scale, rows = Math.ceil(n / COLS);
  return { w: tw * COLS, h: th * rows, tw, th, px: Buffer.alloc(tw * COLS * th * rows * 4, 0) };
}
// Cắt khung nhìn quanh (cx,cy) khỏi khung vừa render rồi nhân điểm lên `scale` vào ô `slot`.
// Gốc cắt bị kẹp vào trong buffer 320x180: một chiêu tầm 128 px cần gần trọn chiều rộng màn
// hình, và một ô ảnh viền đen một nửa vì crop trôi ra ngoài là một ô không so được với ô nào.
function tile(sheet, px, view, cx, cy, slot) {
  const cam = LAB.cam();
  const ox = Math.max(0, Math.min(LAB.W - view.w, Math.round(cx - cam.x - view.w / 2)));
  const oy = Math.max(0, Math.min(LAB.H - view.h, Math.round(cy - cam.y - view.h / 2 + view.dy)));
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
function save(name, sheet, note) {
  const dir = path.join(__dirname, 'out');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir,
    (process.env.SHOT_TAG ? process.env.SHOT_TAG + '-' : '') + name + '.png');
  writePNG(out, sheet);
  console.log(name + ' -> ' + path.relative(root, out)
    + '  (' + sheet.w + 'x' + sheet.h + ', ' + note + ')');
}

// Sân chụp: cùng seed, cùng chỗ đứng, không quái phụ, hero bất tử. Hai lần chụp cách nhau vài
// lần sửa code thì phải so được với nhau, nên không có gì trong đây được phép ngẫu nhiên.
const OWNER = {};
for (const k of LAB.BOSS_KINDS) for (const a of LAB.KIND[k].abil) OWNER[a] = k;
function bench() {
  const w = LAB.newWorld(4242, { map: LAB.MAPS[0].id, wp: 'kiem', slots: [0, 1, 2] });
  const h = w.hero;
  h.x = Math.round(LAB.WW * 0.5); h.y = Math.round(LAB.WH * 0.5);
  w.foes.length = 0; w.tels.length = 0;
  w.spawnT = 1e9; w.kills = 0; w.boss = null; w.bossN = 0;
  w.god = true;
  return w;
}

// ---- một chiêu, trọn một cast ------------------------------------------------------------
function shoot(key) {
  const A = LAB.FOE_ABIL[key];
  if (!A || !OWNER[key]) { console.log('không có chiêu boss ' + key); return; }
  const view = viewFor(A), w = bench(), h = w.hero;
  // Khoảng cách chụp là khoảng cách con boss *thật sự* sẽ đứng khi tung chiêu này: trong tầm,
  // ngoài `min`, và không xa hơn cái crop chứa nổi. Chụp một chiêu từ chỗ nó không bao giờ
  // được tung là chụp một trận đánh không tồn tại.
  const d = Math.max((A.min || 0) + 16, Math.min(A.range - 8, 74));
  const f = LAB.unit(OWNER[key], h.x - Math.round(d), h.y + 4);
  w.foes.push(f); w.boss = f;
  LAB.snapCam(w);
  if (!LAB.startCast(w, f, key)) { console.log('không cast được ' + key); return; }
  const e = w.tels[w.tels.length - 1];
  // `echo` là chiêu duy nhất mà vùng của nó do hero vẽ ra, nên đứng im là chụp một chiêu
  // không có hình. Cho hero đi chéo *về phía* con boss suốt cast, và khung nhìn bám theo hero
  // chứ không đứng một chỗ: cái vết nằm lại phía sau, mà camera thì đi theo người, nên một
  // khung nhìn cố định sẽ trôi ra ngoài buffer 320x180 và ô cuối cùng đen một nửa.
  const walk = A.shape === 'echo';
  const inp = walk ? { dx: -1, dy: 0.5, ax: h.x - 40, ay: h.y } : null;
  const at = walk ? () => [w.hero.x + 34, w.hero.y + 10]
                  : () => [Math.round((f.x + e.x) / 2), Math.round((f.y + e.y) / 2)];

  const px = new Uint8ClampedArray(LAB.W * LAB.H * 4);
  const sheet = newSheet(view, MARKS.length);
  const dt = 1 / 60;
  let shot = 0;
  for (let n = 0; n < Math.ceil(e.dur / dt) + 6 && shot < MARKS.length; n++) {
    LAB.step(w, dt, inp);
    LAB.renderWorld(w, px);
    const p = w.tels.indexOf(e) >= 0 ? e.p : 1;
    const c = at();
    while (shot < MARKS.length && p >= MARKS[shot]) tile(sheet, px, view, c[0], c[1], shot++);
  }
  save('ab-' + key, sheet, A.name + ', p = ' + MARKS.join(' '));
}

// ---- bộ khung: mỗi hàng một bộ, xếp thẳng để so ------------------------------------------
// Vẽ thẳng từ lưới ký tự và palette, không qua engine: ở đây câu hỏi là "các khung có khác
// nhau bằng mắt không", và ánh sáng của sân chỉ làm khó việc so hai khung cạnh nhau.
//
// Boss nào có art trong ANIM_IMG thì chụp art (năm hàng: thêm trúng đòn và chết, hai bộ chỉ
// có trong ảnh nguồn), còn lại chụp lưới vẽ tay như trước. Khung art *không cùng cỡ nhau* --
// tay giơ lên là khung cao thêm -- nên ô được neo ở đáy đúng như lúc render, và chính cái
// chênh lệch chiều cao giữa các ô là thứ cần xem: nó phải là tư thế đổi, không phải sprite
// nhảy chỗ.
const S = 5, GAP = 4;
function poseSheet(k) {
  const im = LAB.ANIM_IMG[k], a = im || LAB.ANIM[k];
  if (!a) { console.log('không có boss ' + k); return; }
  const sets = [['đứng', a.idle], ['đi', a.walk], ['tung chiêu', a.cast]];
  if (im) { sets.push(['trúng đòn', a.hit], ['chết', a.death]); }
  const pal = im ? im.pal : LAB.PAL;
  // Cỡ ô lấy từ khung lớn nhất trong cả bảng, tính cả `dy`: một ô nào cũng chứa được thì mọi
  // ô cùng một khổ, và cùng khổ mới so được.
  let gw = 0, gh = 0;
  for (const [, fs] of sets)
    for (const f of fs) { gw = Math.max(gw, f.g[0].length); gh = Math.max(gh, f.g.length - f.dy); }
  const cw = (gw + 2) * S, ch = (gh + 3) * S;
  const cols = Math.max(...sets.map(s => s[1].length));
  const sheet = { w: cols * cw + GAP * (cols + 1), h: sets.length * ch + GAP * (sets.length + 1) };
  sheet.px = Buffer.alloc(sheet.w * sheet.h * 4, 0);
  for (let i = 0; i < sheet.w * sheet.h; i++) {
    sheet.px[i * 4] = 18; sheet.px[i * 4 + 1] = 20; sheet.px[i * 4 + 2] = 26;
    sheet.px[i * 4 + 3] = 255;
  }
  sets.forEach(([, frames], row) => {
    frames.forEach((fr, col) => {
      // Ô của mỗi khung sáng hơn nền một chút: không có viền ô thì bốn khung đi bộ nhoè vào
      // nhau thành một dải và đúng thứ cần xem -- chân nào đang rời đất -- biến mất.
      const x0 = GAP + col * (cw + GAP), y0 = GAP + row * (ch + GAP);
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        const o = ((y0 + y) * sheet.w + x0 + x) * 4;
        const edge = x < 1 || y < 1 || x >= cw - 1 || y >= ch - 1;
        const v = edge ? 58 : 30;
        sheet.px[o] = v; sheet.px[o + 1] = v + 2; sheet.px[o + 2] = v + 8;
      }
      // Neo y hệt lúc render: giữa ô theo chiều ngang, đáy khung nằm trên một hàng chân đế.
      const bx = x0 + S + (((gw - fr.g[0].length) >> 1) * S);
      const by = y0 + ch - S + (fr.dy - fr.g.length) * S;
      fr.g.forEach((line, y) => {
        for (let x = 0; x < line.length; x++) {
          const c = pal[line[x]];
          if (!c) continue;
          for (let ky = 0; ky < S; ky++) for (let kx = 0; kx < S; kx++) {
            const o = ((by + y * S + ky) * sheet.w + bx + x * S + kx) * 4;
            if (o < 0 || o + 3 >= sheet.px.length) continue;
            sheet.px[o] = Math.round(c[0] * 255);
            sheet.px[o + 1] = Math.round(c[1] * 255);
            sheet.px[o + 2] = Math.round(c[2] * 255);
          }
        }
      });
    });
  });
  save('pose-' + k, sheet, (im ? 'art ảnh, ' : 'lưới vẽ tay, ')
    + sets.map(s => s[0] + ' ' + s[1].length).join(', ')
    + '  (hàng: ' + sets.map(s => s[0]).join(' / ') + ')');
}

const args = process.argv.slice(2);
const ids = args.includes('--all')
  ? LAB.BOSS_KINDS.map(k => 'pose:' + k).concat(Object.keys(OWNER))
  : args;
if (!ids.length) {
  console.log('dùng: node tools/shot-boss.js <ability>... | pose:<boss>... | --all');
  process.exit(1);
}
for (const id of ids) id.startsWith('pose:') ? poseSheet(id.slice(5)) : shoot(id);
