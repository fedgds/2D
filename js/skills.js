"use strict";
// ===========================================================================
// 6. The 16 skills, re-authored as time-parameterised versions of the sketches.
//    Each is { under, mid, over } drawing at progress p in [0,1] plus `hit`, which
//    applies damage on the frame p crosses a threshold.
// ===========================================================================
const C = {
  cyan: hexc('#8fd6ff'), pale: hexc('#eaf9ff'), ice: hexc('#2f8fdc'), deep: hexc('#0e2f5c'),
  ember: hexc('#ff7a2a'), gold: hexc('#ffd98a'), ash: hexc('#6a4a30'),
  volt: hexc('#b9d6ff'), voltc: hexc('#5a9cff'),
  blood: hexc('#c0374a'), blush: hexc('#ff8090'),
  voidc: hexc('#7a3cff'), lilac: hexc('#c8a8ff'),
  holy: hexc('#ffe9a8'), holyp: hexc('#fff6d8'),
  lime: hexc('#c8ff3a'), limeh: hexc('#f0ffc0'), smoke: hexc('#4a5a2a'),
  indigo: hexc('#5a4cff'), indigop: hexc('#b9b0ff'),
  spirit: hexc('#6affd0'), spiritp: hexc('#d8fff2'),
  toxic: hexc('#57d94a'), toxicp: hexc('#c2f57a'),
  sand: hexc('#e8c98a'), sandp: hexc('#fff0cc'),
  steel: hexc('#cfe0ff'), brass: hexc('#ffd98a'),
  vio: hexc('#9a5cff'), viop: hexc('#d8c4ff'),
};

const eo = p => 1 - (1 - p) * (1 - p);          // ease-out
const pop = (p, s) => c01(p / s);               // rise over the first s of the cast
// Fades are squared, never linear: a linearly fading translucent shape parks a ~25%
// ghost on the floor that reads as a rock instead of as energy.
function fade(p, s) { const f = 1 - c01((p - s) / (1 - s)); return f * f; }

const SKILLS = [];

// Cooldowns are the only balance knob in here, so all 16 are distinct and ordered by
// what a cast is actually worth: burst damage, area, and how much control it buys.
// Roughly 0.9 s for the basic melee sweep up to 9.5 s for a mass freeze. `cd` is always
// >= `dur`, so an effect can never overlap a second copy of itself, and X clears every
// cooldown when you just want to look at the effects back to back.

SKILLS.push({
  id: 'star_rupture', name: 'Sao Vỡ', mode: 'point', dur: 0.70, cd: 1.70, shake: 3.2,
  under(w, e, p) {
    const g = pop(p, 0.10), fd = fade(p, 0.22);
    puddle(e.x, e.y, 34 * g, 15 * g, C.cyan, 0.16 * fd, e.seed, 7);
    cracks(e.x, e.y, 8, 27 * g, C.cyan, 0.32 * fd, e.seed + 1, 0.45, 1.0);
    ring(e.x, e.y, 20 + 70 * eo(p), 2.4, C.cyan, 0.26 * fd, 0.34);
  },
  mid(w, e, p) {
    const g = pop(p, 0.08), fd = fade(p, 0.20), cy = e.y - 6;
    star(e.x, cy, C.cyan, 14, 6, (30 + 86 * eo(p)) * g, 3.0, 1.0 * fd, e.seed);
    ring(e.x, cy, 12 + 108 * eo(p), 3.4 * (1 - p * 0.7) + 0.6, C.pale, 0.65 * fd, 1, 1.4);
    core(e.x, cy, 24 * g * (1 - p * 0.45), C.cyan, 0.85 * fd, 1.6);
    core(e.x, cy, 9 * g, WHITE, 1.25 * fd);
    glare(e.x, cy, 72, 40, C.pale, 0.55 * fd);
  },
  over(w, e, p) {
    const fd = fade(p, 0.18);
    sparks(e.x, e.y - 6, 26, 16, 34 + 76 * eo(p), C.pale, 0.9 * fd, e.seed + 3, 1.1,
           1, 0, TAU, 7 * (1 - p));
  },
  hit(w, e) { if (crossed(e, 0.10)) hitCircle(w, e.x, e.y - 6, 44, 165, C.pale, false, 42); },
});
// Lốc Chém là *hai* nhát, nhát sau muộn hơn -- tiếng của nó đã nói vậy từ đầu
// (`whirl_slash` trong sfx.js: "two blades, second one late") nhưng hình thì chỉ có một
// vòng quay đều, nên nghe ra hai mà nhìn ra một. Hai vòng ở đây khác bán kính, khác độ
// dẹt, khác mặt phẳng và lệch pha nửa vòng, nên chúng không chồng lại thành một dải duy
// nhất. Bảng để ngoài hàm vì `under` và `mid` phải đọc *cùng* một quỹ đạo.
const WHIRL = [
  { t0: 0.00, t1: 0.62, turns: 1.10, base: 0,       r0: 15, r1: 30, sq: 0.66, dy: -6,
    w: 2.6, tail: 2, hot: 'W' },
  { t0: 0.30, t1: 1.00, turns: 1.34, base: Math.PI, r0: 20, r1: 39, sq: 0.46, dy: -10,
    w: 3.8, tail: 5, hot: 'P' },
];
// eo() ở đây là cả nội dung của nhát chém: nhanh lúc mở, chậm dần lúc thu -- quay đều
// thì thành cái vòng cổ xoay quanh người, đúng cái làm nó đơn điệu.
function whirlAt(e, s, p) {
  const q = c01((p - s.t0) / (s.t1 - s.t0)), k = eo(q);
  return { q, on: p > s.t0, lead: e.ang + s.base + k * s.turns * TAU,
           r: s.r0 + (s.r1 - s.r0) * k, liv: 1 - fpow(q, 3) * 0.96 };
}
// Một lưỡi sống cộng `tail` lưỡi đang nguội. Cái đuôi mới là thứ biến crescent đang xoay
// thành lưỡi dao *đang đi tới đâu*.
function bladeSweep(cx, cy, lead, r, sq, a, hot, tail, thick, seed) {
  for (let k = tail; k >= 0; k--) {
    const f = 1 - k / (tail + 1.15);
    arc(cx, cy, r - k * 1.7, lead - k * 0.50, 1.55 - k * 0.10, thick - k * 0.34,
        k === 0 ? hot : C.steel, a * f * f, sq, 1.5, 2.4);
  }
  arc(cx, cy, r - 1.5, lead + Math.PI - 0.25, 1.15, thick * 0.6, C.steel, a * 0.32,
      sq, 1.5, 2.4);
  const tx = cx + Math.cos(lead) * r, ty = cy + Math.sin(lead) * r * sq;
  core(tx, ty, 4.4, WHITE, a);
  line(tx, ty, cx + Math.cos(lead + 0.46) * (r + 12),
       cy + Math.sin(lead + 0.46) * (r + 12) * sq, 1.3, WHITE, 0.80 * a, 1.5, 0.7);
  sparks(tx, ty, 8, 0, 9, C.pale, 0.85 * a, seed, 1.0, 1, lead - 1.1, lead + 1.1, 7);
}
SKILLS.push({
  id: 'whirl_slash', name: 'Lốc Chém', mode: 'self', dur: 0.48, cd: 0.90, shake: 1.6,
  under(w, e, p) {
    const h = w.hero, fy = h.y - 1;
    // Lấy đà: bụi bị *kéo vào* trước khi lưỡi thứ nhất tới. Không có nhịp này thì chiêu
    // bắt đầu ở giữa chính nó.
    const wind = 1 - c01(p / 0.24);
    if (wind > 0) for (let k = 0; k < 5; k++) {
      const a = e.ang + k / 5 * TAU + 0.4, r1 = 21 + 15 * wind;
      const ix = h.x + Math.cos(a) * r1, iy = fy + Math.sin(a) * r1 * 0.42;
      dashline(h.x + Math.cos(a) * 48, fy + Math.sin(a) * 48 * 0.42, ix, iy,
               3, 1.2, C.steel, 0.30 * wind, 0.9);
      chevron(ix, iy, a + Math.PI, 3.4, C.steel, 0.42 * wind, 1.0, 0.8);
    }
    puddle(h.x, fy, 24, 9, C.steel, 0.09 * fade(p, 0.30), e.seed, 6);
    for (const s of WHIRL) {                        // vệt chân của từng vòng, đứt đoạn
      const a = whirlAt(e, s, p);
      if (!a.on) continue;
      for (let k = 0; k < 2; k++)
        arc(h.x, fy, a.r + 4 + k * 5, a.lead - 0.7 - k * 1.5, 1.5, 2.3, C.steel,
            0.24 * a.liv, 0.40);
      dashline(h.x + Math.cos(a.lead) * (a.r + 3), fy + Math.sin(a.lead) * (a.r + 3) * 0.42,
               h.x + Math.cos(a.lead) * (a.r + 26), fy + Math.sin(a.lead) * (a.r + 26) * 0.42,
               4, 1.4, C.steel, 0.30 * a.liv, 0.85);
    }
    // Sóng xung sau nhát thứ hai: vòng bụi *rời khỏi* người, để chiêu có chỗ kết.
    const bl = c01((p - 0.56) / 0.44);
    if (bl > 0) for (let k = 0; k < 3; k++)
      arc(h.x, fy, 26 + 36 * eo(bl), k / 3 * TAU + e.ang, 1.7, 2.6 * (1 - bl) + 0.7,
          C.pale, 0.44 * (1 - bl) * (1 - bl), 0.40);
  },
  mid(w, e, p) {
    const h = w.hero;
    for (const s of WHIRL) {
      const a = whirlAt(e, s, p);
      if (!a.on || a.liv <= 0.02) continue;
      bladeSweep(h.x, h.y + s.dy, a.lead, a.r, s.sq, a.liv,
                 s.hot === 'W' ? WHITE : C.pale, s.tail, s.w, e.seed + s.tail * 5);
    }
    // Chỗ hai lưỡi giao nhau: một loé trắng ngắn, để nhịp thứ hai có điểm bắt đầu nhìn
    // thấy được chứ không chỉ là thêm một vòng nữa.
    const cl = 1 - c01(Math.abs(p - 0.30) / 0.10);
    if (cl > 0) {
      const cy = h.y - 8;
      core(h.x, cy, 7 + 5 * (1 - cl), WHITE, 0.85 * cl * cl, 2.0);
      glare(h.x, cy, 40, 20, C.pale, 0.45 * cl * cl);
      star(h.x, cy, C.pale, 6, 6, 24, 1.8, 0.70 * cl, e.seed + 11);
    }
    // Điểm dừng: lưỡi thứ hai *đứng lại*, chứ không mờ dần thành hết. Bốn mũi bụi bay
    // tiếp theo hướng cuối cùng là chỗ duy nhất nói được điều đó.
    const st = 1 - c01(Math.abs(p - 0.90) / 0.12);
    if (st > 0) {
      const s = WHIRL[1], a = whirlAt(e, s, p), cy = h.y + s.dy;
      arc(h.x, cy, a.r, a.lead, 0.9, 4.2, WHITE, 0.75 * st * st, s.sq, 1.4, 3.0);
      for (let k = 0; k < 4; k++) {
        const b = a.lead + (k - 1.5) * 0.30, rr = a.r + 8 + k * 3;
        chevron(h.x + Math.cos(b) * rr, cy + Math.sin(b) * rr * s.sq, b, 4.2,
                C.pale, 0.60 * st, 1.0, 0.6);
      }
    }
  },
  over(w, e, p) {
    // Bụi bay trước mặt hero: hero được vẽ sau `mid`, nên đây là lớp duy nhất bán được
    // cảm giác vòng xoáy đi *quanh* người chứ chỉ ở sau lưng.
    const h = w.hero, fd = fade(p, 0.34);
    sparks(h.x, h.y - 8, 12, 14, 34, C.pale, 0.55 * fd, e.seed + 3, 0.9, 0.5,
           0, TAU, 6 * (1 - p));
  },
  hit(w, e) {
    const h = w.hero;
    if (crossed(e, 0.30)) hitCircle(w, h.x, h.y - 7, 32, 118, WHITE, false, 34);
  },
});

SKILLS.push({
  id: 'ember_field', name: 'Ruộng Than', mode: 'point', dur: 1.20, cd: 3.40, shake: 1.4,
  under(w, e, p) {
    const g = pop(p, 0.18), fd = fade(p, 0.55);
    puddle(e.x, e.y, 44 * g, 19 * g, C.ash, 0.30, e.seed, 8);
    puddle(e.x, e.y, 30 * g, 13 * g, C.ember, 0.20 * (0.4 + 0.6 * fd), e.seed + 1, 6);
    cracks(e.x, e.y, 9, 30 * g, C.ember, 0.34 * fd, e.seed + 2, 0.45, 1.1);
    ring(e.x, e.y, 44 * g, 2.0, C.ember, 0.30 * fd, 0.42);
  },
  mid(w, e, p) {
    const rng = mulberry32(e.seed), g = pop(p, 0.16), fd = fade(p, 0.5);
    for (let i = 0; i < 7; i++) {                 // pillars at different ages
      const a = i / 7 * TAU + 0.3, rr = 38 * g;
      const px = e.x + Math.cos(a) * rr, py = e.y + Math.sin(a) * rr * 0.42;
      const ph = ((p * 2.6 + i * 0.37) % 1);
      const hh = (10 + 16 * Math.sin(Math.PI * ph)) * g;
      beam(px, py, -Math.PI / 2, 0, hh, 3.4, 0.6, C.ember, 0.95 * fd, 1.3, 1.1);
      beam(px, py, -Math.PI / 2, 0, hh * 0.62, 1.2, 0.4, C.gold, 0.9 * fd, 1.2, 1.2);
      core(px, py - 1, 4.0, C.ember, 0.7 * fd, 1.6);
      if (rng() > 0.4) sparks(px, py - hh * 0.7, 3, 0, 5, C.gold, 0.7 * fd,
                              e.seed + i, 0.9, 1, -Math.PI, 0, 4);
    }
    cloud(e.x, e.y - 12, 26, C.ash, 0.10 * fd, e.seed + 5, 7, 0.5);
    core(e.x, e.y - 3, 13 * g, C.ember, 0.55 * fd, 1.8);
  },
  hit(w, e) {
    for (const at of [0.16, 0.42, 0.68, 0.92])
      if (crossed(e, at)) hitCircle(w, e.x, e.y, 42, 46, C.gold, false, 6);
  },
});
SKILLS.push({
  id: 'frost_prison', name: 'Ngục Băng', mode: 'point', dur: 1.30, cd: 5.80, shake: 2.0,
  under(w, e, p) {
    const g = pop(p, 0.20), fd = fade(p, 0.60);
    puddle(e.x, e.y - 2, 46 * g, 19 * g, C.cyan, 0.22 * (0.5 + 0.5 * fd), e.seed, 7);
    for (const s of [[-48, 8, 15], [46, -8, 13], [14, 18, 12], [-26, -22, 10]])
      puddle(e.x + s[0], e.y + s[1], s[2] * g, s[2] * 0.42 * g, C.cyan, 0.13 * fd,
             e.seed + s[2], 6);
    cracks(e.x, e.y - 1, 9, 30 * g, C.cyan, 0.34 * fd, e.seed + 1, 0.45, 1.0);
    ring(e.x, e.y - 2, 64 * g, 2.4, C.cyan, 0.15 * fd, 0.34);
  },
  mid(w, e, p) {
    const rng = mulberry32(e.seed), g = pop(p, 0.22), fd = fade(p, 0.62);
    cloud(e.x, e.y - 4, 34, C.cyan, 0.10 * fd, e.seed + 13, 9, 0.34);
    for (const off of [-34, -18, 0, 18, 34])                 // inner cold half
      shard(e.x + off, e.y - 16, (14 + 7 * rng()) * g, 2.6 + rng(), C.deep, C.pale,
            0.70 * fd, off * 0.010);
    core(e.x, e.y - 20, 25 * g, C.deep, 0.60 * fd, 1.5);
    core(e.x, e.y - 22, 15 * g, C.ice, 0.55 * fd, 1.8);
    const s = g, dia = [[e.x, e.y - 48 * s], [e.x + 20 * s, e.y - 21 * s], [e.x, e.y + 3],
                        [e.x - 20 * s, e.y - 21 * s], [e.x, e.y - 48 * s]];
    polyline(dia, 1.6, C.pale, 0.90 * fd);
    for (const l of [[-9, -41, -3, -7], [10, -37, 4, -9], [-14, -26, 13, -24], [0, -46, 0, 0]])
      line(e.x + l[0] * s, e.y + l[1] * s, e.x + l[2] * s, e.y + l[3] * s, 1.0, C.pale, 0.42 * fd);
    for (const off of [-40, -26, -11, 11, 26, 40])           // outer bright cage
      shard(e.x + off, e.y + 5, (19 + 15 * rng()) * g, 3.4 + rng() * 1.2, C.ice, C.pale,
            1.0 * fd, off * 0.007);
    sparks(e.x, e.y - 26, 22, 12, 52 * g, C.pale, 0.80 * fd, e.seed + 21, 1.1);
  },
  over(w, e, p) {
    const snow = mulberry32(e.seed + 88), fd = fade(p, 0.35);
    for (let i = 0; i < 26; i++)
      core(snow.range(e.x - 90, e.x + 90), snow.range(e.y - 84, e.y + 60) + p * 14,
           snow.range(0.8, 1.5), C.pale, snow.range(0.3, 0.8) * fd, 1.3);
  },
  hit(w, e) {
    if (!crossed(e, 0.24)) return;
    for (const f of foesIn(w, e.x, e.y - 8, 40)) { hurt(w, f, 150, C.pale); f.frozen = 1.9; }
  },
});
SKILLS.push({
  id: 'chain_bolt', name: 'Sấm Chuỗi', mode: 'point', dur: 0.60, cd: 2.50, shake: 2.2,
  init(w, e) {
    const h = w.hero, picked = [];
    e.data.nodes = [[h.x + (h.flip ? -9 : 9), h.y - 15]];
    let cx = e.x, cy = e.y - 8;
    for (let i = 0; i < 3; i++) {
      const c = nearest(w, cx, cy, 5, 120).find(f => picked.indexOf(f) < 0);
      if (!c) break;
      picked.push(c); cx = c.x; cy = midY(c);
      e.data.nodes.push([cx, cy]);
    }
    if (!picked.length) e.data.nodes.push([e.x, e.y - 8]);
    e.data.foes = picked;
  },
  mid(w, e, p) {
    const n = e.data.nodes, fd = fade(p, 0.30);
    const flick = 0.58 + 0.42 * Math.sin(p * 47);      // arc flicker, not a steady tube
    for (let i = 0; i < n.length - 1; i++) {
      const on = c01((p - i * 0.13) / 0.10);
      if (on <= 0) continue;
      const a = on * fd * flick;
      bolt(n[i][0], n[i][1], n[i + 1][0], n[i + 1][1], C.voltc, C.pale, a,
           7, 6.5, e.seed + i * 7, 2.4, 2);
      core(n[i + 1][0], n[i + 1][1], 7, C.volt, 0.85 * on * fd, 1.8);
      core(n[i + 1][0], n[i + 1][1], 3, WHITE, 1.15 * on * fd);
      ring(n[i + 1][0], n[i + 1][1] + 5, 8 + 12 * eo(on), 1.6, C.volt, 0.40 * fd * on, 0.40);
      sparks(n[i + 1][0], n[i + 1][1], 6, 2, 12, C.pale, 0.7 * on * fd, e.seed + i, 1.0);
    }
    core(n[0][0], n[0][1], 6, C.volt, 0.9 * fd);
    core(n[0][0], n[0][1], 2.4, WHITE, 1.1 * fd);
  },
  hit(w, e) {
    e.data.foes.forEach((f, i) => {
      if (crossed(e, 0.04 + i * 0.13)) hurt(w, f, 132 - i * 26, C.pale, false, 0, 0);
    });
  },
});

SKILLS.push({
  id: 'blood_rend', name: 'Xé Máu', mode: 'dir', dur: 0.50, cd: 1.30, shake: 2.4,
  init(w, e) {
    const h = w.hero;
    e.data.cx = h.x + Math.cos(e.ang) * 26;
    e.data.cy = h.y - 7 + Math.sin(e.ang) * 26 * 0.6;
    // Ba vệt cào lần lượt hiện ra rồi một nhát ngược cắt qua cả ba. Trước đây đây là
    // *một* crescent đứng yên rồi mờ đi -- không có gì xảy ra trong nửa giây đó, và đó
    // đúng là chỗ chiêu này chán. Mỗi vệt có tuổi riêng, nên cái tên "xé" mới có nghĩa.
    e.data.claw = [
      { at: 0.00, r: 18, off: -0.32, sw: 1.55, w: 2.5 },
      { at: 0.10, r: 24, off: 0.03, sw: 1.80, w: 3.2 },
      { at: 0.19, r: 29, off: 0.38, sw: 1.50, w: 2.4 },
      { at: 0.38, r: 31, off: 0.02, sw: 2.15, w: 4.0, cross: true },
    ];
    // Máu bắn: hướng và tốc độ riêng từng giọt, và có `g` nên nó *rơi* chứ không trôi
    // đều ra ngoài như sparks().
    const rng = mulberry32(e.seed + 5), dr = [];
    for (let i = 0; i < 15; i++)
      dr.push({ a: e.ang + rng.range(-0.95, 0.95), v: rng.range(34, 92),
                at: rng.range(0.06, 0.44), g: rng.range(38, 96),
                s: rng.range(0.9, 1.9), hot: rng() < 0.6 });
    e.data.drops = dr;
  },
  under(w, e, p) {
    const d = e.data, g = pop(p, 0.2);
    // Vũng máu đọng lâu hơn phần còn lại: nó là dấu vết, không phải tia sáng. Alpha phải
    // thấp -- #c0374a cộng sáng ở 0.3 đọng lại thành một hòn đá đỏ trên sàn.
    puddle(d.cx, d.cy + 7, 29 * g, 11 * g, C.blood, 0.17 * (0.45 + 0.55 * fade(p, 0.62)),
           e.seed, 8);
    for (let i = 0; i < 3; i++) {                    // ba đường xé còn lại trên sàn
      const cl = d.claw[i], age = c01((p - cl.at) / 0.62);
      if (p <= cl.at) continue;
      const a = e.ang + cl.off * 0.7, liv = 1 - age * 0.72;
      dashline(d.cx - Math.cos(a) * cl.r * 0.9, d.cy + 8 - Math.sin(a) * cl.r * 0.55,
               d.cx + Math.cos(a) * cl.r * 1.5, d.cy + 8 + Math.sin(a) * cl.r * 0.9,
               5, 1.6, C.blood, 0.34 * liv, 0.55);
    }
    const cr = c01((p - 0.38) / 0.30);               // nhát ngược cào cả sàn
    if (cr > 0)
      cracks(d.cx, d.cy + 7, 6, 22 * eo(cr), C.blood, 0.30 * (1 - cr), e.seed + 3, 0.5, 1.1);
  },
  mid(w, e, p) {
    const d = e.data, fd = fade(p, 0.30);
    // Sương máu chỉ dâng lên *sau khi* vết xé mở ra. Vẽ nó từ khung đầu thì chiêu bắt đầu
    // bằng một đám sẫm tròn ngay chỗ sắp chém, và đám đó đọc ra là hòn đá.
    const mist = c01((p - 0.14) / 0.46);
    if (mist > 0)
      cloud(d.cx, d.cy + 1, 8 + 8 * mist, C.blood, 0.12 * mist * fade(p, 0.44),
            e.seed + 7, 6, 0.7);
    for (let i = 0; i < d.claw.length; i++) {
      const cl = d.claw[i];
      if (p < cl.at) continue;
      const age = c01((p - cl.at) / (cl.cross ? 0.44 : 0.38));
      const liv = (1 - age * age) * fd, ang = e.ang + cl.off;
      if (liv <= 0.01) continue;
      // Bề rộng mở ra theo tuổi: vết xé *rộng thêm* sau khi móng đã đi qua. Màu sáng
      // (C.blush) mang hình, C.blood chỉ làm quầng: ngược lại thì cả nhát chém là một
      // vệt nâu sẫm trên sàn xanh sẫm và không đọc ra năng lượng.
      const sw = cl.sw * (0.72 + 0.42 * eo(age)), rr = cl.r + 3.4 * eo(age);
      arc(d.cx, d.cy, rr, ang, sw, cl.w, C.blood, liv * 0.80, 0.72, 1.4, 2.6);
      arc(d.cx, d.cy, rr, ang, sw * 0.92, cl.w * 0.52, C.blush, liv, 0.72, 1.4, 2.6);
      if (age < 0.62) {                              // lưỡi còn sống: một sợi trắng gắt
        const hot = (1 - age / 0.62) * fd;
        arc(d.cx, d.cy, rr, ang, sw * 0.5, 1.0, WHITE, 0.95 * hot, 0.72, 1.4, 3.0);
        for (const s of [1, -1]) {
          const b = ang + s * sw * 0.5;
          sparks(d.cx + Math.cos(b) * rr, d.cy + Math.sin(b) * rr * 0.72, 7, 0, 9,
                 C.blush, 0.85 * hot, e.seed + i * 3 + s + 2, 1.1, 1, b - 0.7, b + 0.7, 9);
        }
      }
      if (cl.cross) {                                // nhát chốt: hai đường xé thẳng
        // `arc` bị dẹt 0.72 nên một crescent quay ngang không đọc ra "vết cắt chéo" --
        // hai đường thẳng qua tâm thì đọc ra ngay, và nó là chữ X mà cái tên hứa.
        const k = 1 - c01(age / 0.40);
        for (const s of [1, -1]) {
          const b = e.ang + s * 0.92, L = (12 + 26 * eo(age)) * 1.0;
          line(d.cx - Math.cos(b) * L, d.cy - Math.sin(b) * L * 0.72,
               d.cx + Math.cos(b) * L, d.cy + Math.sin(b) * L * 0.72,
               2.6 - 1.4 * age, C.blood, 0.85 * (1 - age), 1.4);
          line(d.cx - Math.cos(b) * L * 0.9, d.cy - Math.sin(b) * L * 0.65,
               d.cx + Math.cos(b) * L * 0.9, d.cy + Math.sin(b) * L * 0.65,
               0.9, s > 0 ? WHITE : C.blush, 0.90 * k, 1.6);
        }
        core(d.cx, d.cy, 5 + 6 * (1 - k), WHITE, 0.95 * k * k, 2.0);
        star(d.cx, d.cy, C.blush, 7, 3, 26 * (0.4 + 0.6 * eo(age)), 2.0, 0.75 * (1 - age),
             e.seed + 9);
      }
    }
    // Tâm vết xé: sáng dần theo số nhát đã đi qua chứ không sáng sẵn từ khung đầu.
    const hrt = c01(p / 0.30);
    core(d.cx, d.cy, 4 + 5 * hrt, C.blush, 0.34 * hrt * fd, 1.8);
  },
  over(w, e, p) {
    // Giọt máu vẽ sau hero nên nó bay qua *trước mặt* người -- cùng lý do như bụi của
    // Lốc Chém: ở lớp `mid` thì nó luôn bị chính hero che.
    const d = e.data;
    for (const q of d.drops) {
      const t = p - q.at;
      if (t <= 0) continue;
      const liv = 1 - c01(t / (1.02 - q.at));
      const x = d.cx + Math.cos(q.a) * q.v * t, y = d.cy + Math.sin(q.a) * q.v * t * 0.55
                                                     + q.g * t * t;
      const s = q.s * (0.55 + 0.45 * liv);
      line(x, y, x - Math.cos(q.a) * q.v * 0.035, y - Math.sin(q.a) * q.v * 0.035 * 0.55,
           s * 0.8, q.hot ? C.blush : C.blood, 0.55 * liv);
      core(x, y, s, q.hot ? C.blush : C.blood, 0.95 * liv * liv, 1.5);
    }
  },
  hit(w, e) {
    const d = e.data;
    if (crossed(e, 0.22))
      hitCircle(w, d.cx, d.cy, 27, 210, C.blush, true, 46);
  },
});
SKILLS.push({
  id: 'void_collapse', name: 'Hư Không Sụp', mode: 'point', dur: 1.10, cd: 6.50, shake: 2.6,
  under(w, e, p) {
    const g = pop(p, 0.25), fd = fade(p, 0.70);
    ring(e.x, e.y, 52 * g, 2.2, C.voidc, 0.38 * fd, 0.40);
    dial(e.x, e.y, 49 * g, 18, C.lilac, 0.35 * fd, 0.40, 3, 1.0);
    cracks(e.x, e.y, 7, 26 * g, C.voidc, 0.25 * fd, e.seed, 0.45, 1.0);
  },
  mid(w, e, p) {
    const g = pop(p, 0.18), fd = fade(p, 0.72), cy = e.y - 10;
    const shut = c01((p - 0.66) / 0.34);
    const r = 22 * g * (1 - 0.62 * shut);
    unlight(e.x, cy, r * 1.18, 1.6 * g);              // a real void, not a grey disc
    ring(e.x, cy, r * 1.02, 1.1, C.lilac, 1.0 * fd, 1, 1.6);
    ring(e.x, cy, r, 2.0, C.voidc, 0.85 * fd, 1, 1.3);
    spiral(e.x, cy, 3, 54 * (1 - 0.45 * p), r * 0.95, 0.9, C.lilac, 0.75 * fd,
           1.8, 0.58, p * 3.4, 20);
    sparks(e.x, cy, 20, r + 6, 56, C.viop, 0.75 * fd, e.seed + 4, 1.0, 0.6, 0, TAU,
           -6 * (1 - p));
    if (shut > 0) {                                    // the collapse pop
      const b = shut * fade(p, 0.80);
      star(e.x, cy, C.viop, 11, 4, 16 + 62 * eo(shut), 2.4, 1.0 * b, e.seed + 9);
      core(e.x, cy, 10 + 8 * shut, WHITE, 1.1 * b);
      ring(e.x, cy, 14 + 64 * eo(shut), 2.4, C.viop, 0.7 * b, 1, 1.4);
    }
  },
  hit(w, e) {
    const dt = (e.p - e.pt) * e.dur;
    if (e.p < 0.66) pullToward(w, e.x, e.y - 10, 72, 46, dt);
    for (const at of [0.30, 0.52]) if (crossed(e, at)) hitCircle(w, e.x, e.y - 10, 30, 72, C.lilac);
    if (crossed(e, 0.72)) hitCircle(w, e.x, e.y - 10, 48, 255, C.viop, true, 58);
  },
});
SKILLS.push({
  id: 'judgment_beam', name: 'Trụ Phán Xét', mode: 'point', dur: 0.95, cd: 8.00, shake: 3.6,
  under(w, e, p) {
    const g = pop(p, 0.14), fd = fade(p, 0.50);
    puddle(e.x, e.y, 52 * g, 22 * g, C.holy, 0.35 * fd, e.seed, 8);
    ring(e.x, e.y, 50 * g, 2.0, C.holy, 0.55 * fd, 0.42);
    dial(e.x, e.y, 47 * g, 24, C.holyp, 0.60 * fd, 0.42, 3, 1.1);
    ring(e.x, e.y, 40 * g, 3.4, C.holyp, 0.75 * fd, 0.42);
    ring(e.x, e.y, 30 * g, 2.5, C.holy, 0.90 * fd, 0.42);
    for (let i = 0; i < 8; i++) {                       // rune ticks on the seal
      const a = i / 8 * TAU + 0.2;
      const gx = e.x + Math.cos(a) * 35 * g, gy = e.y + Math.sin(a) * 35 * 0.42 * g;
      line(gx - 2.0, gy, gx + 2.0, gy, 1.0, C.holyp, 0.70 * fd);
      line(gx, gy - 1.6, gx, gy + 1.6, 1.0, C.holyp, 0.55 * fd);
    }
  },
  mid(w, e, p) {
    const drop = c01(p / 0.20), land = c01((p - 0.20) / 0.10), fd = fade(p, 0.42);
    // "The sky" is the top edge of the view, so the shaft has to be anchored to the
    // camera: with a fixed world y it would be off screen the moment you walk down.
    const sky = CAMY, yb = sky + (e.y - sky) * drop;
    column(e.x, sky, yb, 34, 13, C.holy, C.holy, 0.26 * fd);  // flared toward the sky
    core(e.x, sky + 2, 17, C.holyp, 0.70 * fd, 2.0);          // aperture
    column(e.x, sky, yb, 12, 21, C.holy, C.holyp, 1.10 * fd);
    column(e.x, sky, yb, 5, 8, C.holyp, WHITE, 0.95 * fd);
    if (land > 0) {
      for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
        const ax = e.x + s * (30 + k * 16);
        beam(ax, e.y + 2, -Math.PI / 2, 0, (54 - k * 12) * land, 4.0, 0.6,
             C.holy, (1.15 - k * 0.35) * fd, 1.2, 1.15);
        beam(ax, e.y + 2, -Math.PI / 2, 0, (42 - k * 10) * land, 1.2, 0.4,
             C.holyp, (1.10 - k * 0.30) * fd, 1.2, 1.30);
      }
      core(e.x, e.y, 19, C.holyp, 0.75 * land * fd, 2.4);
      core(e.x, e.y, 8, WHITE, 1.2 * land * fd);
      glare(e.x, e.y - 6, 62, 38, C.holyp, 0.50 * land * fd);
    }
    const rng = mulberry32(e.seed + 3);
    for (let i = 0; i < 14; i++) {                     // motes rising outside the shaft
      const s = rng() < 0.5 ? -1 : 1;
      const mx = e.x + s * rng.range(16, 48), my = e.y - rng.range(2, 60) - p * 12;
      core(mx, my, rng.range(0.8, 1.4), C.holyp, rng.range(0.3, 0.8) * fd, 1.3);
    }
  },
  hit(w, e) {
    if (!crossed(e, 0.24)) return;
    const inner = foesIn(w, e.x, e.y, 30);
    for (const f of inner) hurt(w, f, 430, C.holyp, true);
    for (const f of foesIn(w, e.x, e.y, 52))
      if (inner.indexOf(f) < 0) hurt(w, f, 90, C.holy, false, 0, 0);
  },
});
function alongPath(pts, seg, tot, p) {
  let d = p * tot;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const t = clamp(d / Math.max(seg[i], 1e-3), 0, 1);
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
              pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t, i, t];
    }
    d -= seg[i];
  }
  return [pts[0][0], pts[0][1], 0, 0];
}

SKILLS.push({
  id: 'ricochet_shot', name: 'Đạn Nảy', mode: 'point', dur: 0.62, cd: 2.10, shake: 1.8,
  init(w, e) {
    const h = w.hero, picked = [];
    let cx = e.x, cy = e.y - 8;
    for (let i = 0; i < 3; i++) {
      const c = nearest(w, cx, cy, 5, 150).find(f => picked.indexOf(f) < 0);
      if (!c) break;
      picked.push(c); cx = c.x; cy = midY(c);
    }
    const pts = [[h.x + (h.flip ? -9 : 9), h.y - 15]];
    for (const f of picked) pts.push([f.x, midY(f)]);
    if (!picked.length) pts.push([e.x, e.y - 8]);
    const a = pts[pts.length - 1], b = pts[Math.max(0, pts.length - 2)];
    const dx = a[0] - b[0], dy = a[1] - b[1], dd = Math.max(Math.hypot(dx, dy), 1e-3);
    pts.push([a[0] + dx / dd * 58, a[1] + dy / dd * 58]);   // exit leg
    const seg = []; let tot = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      seg.push(L); tot += L;
    }
    tot = Math.max(tot, 1e-3);
    const arr = []; let acc = 0;
    for (const L of seg) { acc += L; arr.push(acc / tot); }
    e.data = { pts, seg, tot, arr, foes: picked };
  },
  under(w, e, p) {
    const d = e.data, fd = fade(p, 0.4);
    for (let k = 0; k < d.arr.length - 1; k++) {
      if (p <= d.arr[k]) continue;
      const P = d.pts[k + 1];
      puddle(P[0], P[1] + 6, 11 + k * 3, (11 + k * 3) * 0.45, C.smoke, 0.26 * fd,
             e.seed + k, 6);
    }
  },
  mid(w, e, p) {
    const d = e.data, fd = fade(p, 0.50);
    const at = alongPath(d.pts, d.seg, d.tot, p);
    const bx = at[0], by = at[1], li = at[2];
    for (let i = 0; i < d.pts.length - 1; i++) {
      const A = d.pts[i], B = d.pts[i + 1];
      const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
      if (i < li) {                                   // legs already flown: broken trail
        const age = 1 - (i + 1) / (li + 1);
        dashline(A[0], A[1], B[0], B[1], 7, 3.2, C.lime, 0.50 * fd * (0.35 + 0.65 * age), 0.55);
        for (const t of [0.42, 0.74])
          chevron(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, ang, 4.0,
                  C.limeh, 0.55 * fd);
      } else if (i === li) {                           // the live leg
        const trav = Math.hypot(bx - A[0], by - A[1]), tl = Math.min(trav, 26);
        const hx = bx - Math.cos(ang) * tl, hy = by - Math.sin(ang) * tl;
        if (trav > tl + 4)                             // older part of this leg: broken up
          dashline(hx, hy, A[0], A[1], Math.max(2, Math.round((trav - tl) / 9)), 2.4,
                   C.lime, 0.34 * fd, 0.9);
        line(bx, by, hx, hy, 3.6, C.lime, 0.26 * fd, 1.5, 0.85);
        line(bx, by, hx, hy, 1.7, C.lime, 0.80 * fd, 1.5, 0.8);
        line(bx, by, hx, hy, 0.8, C.limeh, 1.0 * fd, 1.5, 0.75);
      }
    }
    for (let k = 0; k < d.arr.length - 1; k++) {       // bounce impacts, each older
      if (p <= d.arr[k]) continue;
      const age = c01((p - d.arr[k]) / 0.24), s = 1 + k * 0.32, P = d.pts[k + 1];
      const liv = (1 - age) * fd;
      for (let q = 0; q < 3; q++)
        arc(P[0], P[1], 14 * s * (0.5 + 0.5 * eo(age)), q / 3 * TAU + 0.6, 1.5, 1.3,
            C.lime, 0.42 * liv);
      star(P[0], P[1], C.lime, 7, 2, 15 * s * (0.4 + 0.6 * eo(age)), 2.2,
           (1 - age * 0.75) * fd, e.seed + k);
      for (let q = 0; q < 4; q++)
        beam(P[0], P[1], q / 4 * TAU + 0.4, 1, 10 * s, 2.6, 0.6, C.lime, 0.80 * liv, 1.3);
      core(P[0], P[1], 4.2 * s * (1 - age * 0.5), C.lime, 0.80 * liv, 2.6);
      core(P[0], P[1], 1.8 * s, C.limeh, 1.30 * liv);
    }
    const m = d.pts[0], mf = fade(p, 0.10);
    star(m[0], m[1], C.lime, 5, 1, 13, 2.0, 0.9 * mf, e.seed + 1);
    core(m[0], m[1], 5, C.limeh, 1.0 * mf);
    cloud(m[0], m[1], 8, C.smoke, 0.22 * fade(p, 0.30), e.seed + 2, 5, 1);
    if (p < 1) {
      const A = d.pts[li], B = d.pts[li + 1];
      const ang = Math.atan2(B[1] - A[1], B[0] - A[0]);
      dashline(bx, by, bx - Math.cos(ang) * 18, by - Math.sin(ang) * 18, 5, 1.6,
               C.lime, 0.60 * fd, 0.85);
      beam(bx, by, ang, 0, 9, 1.6, 0.4, C.limeh, 0.90 * fd, 1.3, 1.4);
      core(bx, by, 4.4, C.lime, 1.0 * fd, 2.0);
      core(bx, by, 1.8, WHITE, 1.2 * fd);
    }
  },
  hit(w, e) {
    const d = e.data;
    d.foes.forEach((f, k) => {
      if (crossed(e, d.arr[k])) hurt(w, f, k === 2 ? 132 : 92, C.limeh, k === 2, 0, 0);
    });
  },
});
SKILLS.push({
  id: 'shadow_dash', name: 'Bóng Lướt', mode: 'point', dur: 0.55, cd: 3.00, shake: 1.2,
  init(w, e) {
    const h = w.hero;
    e.data.from = [h.x, h.y];
    e.data.to = [clamp(e.x, BOUND.x0, BOUND.x1), clamp(e.y, BOUND.y0, BOUND.y1)];
  },
  under(w, e, p) {
    const d = e.data, fd = fade(p, 0.35);
    ring(d.from[0], d.from[1] - 1, 12 + 16 * eo(p), 1.8, C.indigo, 0.40 * fd, 0.40);
    ring(d.to[0], d.to[1] - 1, 10 + 14 * eo(p), 2.0, C.indigop, 0.45 * fd, 0.40);
    dashline(d.from[0], d.from[1] - 1, d.to[0], d.to[1] - 1, 6, 2.2, C.indigo, 0.30 * fd, 0.6);
  },
  mid(w, e, p) {
    const d = e.data, fd = fade(p, 0.28);
    const ang = Math.atan2(d.to[1] - d.from[1], d.to[0] - d.from[0]);
    line(d.from[0], d.from[1] - 7, d.to[0], d.to[1] - 7, 5.0, C.indigo, 0.35 * fd);
    line(d.from[0], d.from[1] - 7, d.to[0], d.to[1] - 7, 1.6, C.indigop, 0.85 * fd);
    // A stopped ghost must be flash-white at low alpha: a dim sprite over a dark
    // floor is a smudge nobody can name.
    for (const t of [0.25, 0.5, 0.78]) {
      const gx = d.from[0] + (d.to[0] - d.from[0]) * t;
      const gy = d.from[1] + (d.to[1] - d.from[1]) * t;
      blit(HERO, Math.round(gx - 5), Math.round(gy - 14), 0.85, w.hero.flip,
           0.30 * fd * (0.5 + 0.5 * t), 1);
    }
    for (const t of [0.35, 0.68])
      chevron(d.from[0] + (d.to[0] - d.from[0]) * t, d.from[1] - 7 + (d.to[1] - d.from[1]) * t,
              ang, 5.0, C.indigop, 0.7 * fd);
    core(d.to[0], d.to[1] - 7, 9, C.indigo, 0.60 * fd, 1.8);
    sparks(d.to[0], d.to[1] - 7, 16, 3, 22, C.indigop, 0.85 * fd, e.seed, 1.1, 1,
           0, TAU, 6 * (1 - p));
  },
  hit(w, e) {
    if (!crossed(e, 0.14)) return;
    const h = w.hero, d = e.data;
    h.x = d.to[0]; h.y = d.to[1];
    hitLine(w, d.from[0], d.from[1] - 7, d.to[0], d.to[1] - 7, 9, 155, C.indigop, false, 32);
  },
});

SKILLS.push({
  id: 'spirit_summon', name: 'Triệu Linh', mode: 'point', dur: 1.00, cd: 3.80, shake: 1.6,
  under(w, e, p) {
    const g = pop(p, 0.20), fd = fade(p, 0.55);
    ring(e.x, e.y, 34 * g, 2.2, C.spirit, 0.50 * fd, 0.40);
    dial(e.x, e.y, 31 * g, 12, C.spiritp, 0.45 * fd, 0.40, 2, 1.0);
    puddle(e.x, e.y, 28 * g, 12 * g, C.spirit, 0.16 * fd, e.seed, 7);
  },
  mid(w, e, p) {
    const rise = eo(c01(p / 0.45)), fd = fade(p, 0.50);
    const cy = e.y - 6 - 26 * rise;
    beam(e.x, e.y + 1, -Math.PI / 2, 0, 30 + 26 * rise, 6.0, 1.0, C.spirit, 0.70 * fd, 1.3, 1.4);
    for (let k = 0; k < 2; k++)                       // twin wisps winding up the shaft
      spiral(e.x, cy + 14, 1, 16, 2, 0.75, C.spiritp, 0.65 * fd, 1.4, 0.55,
             p * 5.0 + k * Math.PI, 16);
    core(e.x, cy, 11 * (0.5 + 0.5 * rise), C.spirit, 0.85 * fd, 1.7);
    core(e.x, cy, 4.5, C.spiritp, 1.15 * fd);
    arc(e.x, cy + 3, 9, -Math.PI / 2, Math.PI * 1.1, 1.4, C.spiritp, 0.75 * fd, 1.2, 1.4, 2.4);
    for (const s of [-1, 1])                          // two trailing veils
      arc(e.x, cy + 8, 13, Math.PI / 2 + s * 0.55, 0.9, 2.0, C.spirit, 0.55 * fd, 1.4);
    sparks(e.x, cy + 6, 18, 4, 24, C.spiritp, 0.80 * fd, e.seed + 2, 1.0, 1.2,
           Math.PI, TAU, 0);
    glare(e.x, cy, 26, 20, C.spiritp, 0.35 * fd);
  },
  hit(w, e) {
    for (const at of [0.30, 0.55, 0.80])
      if (crossed(e, at)) hitCircle(w, e.x, e.y - 14, 34, 78, C.spiritp, false, 12);
  },
});
SKILLS.push({
  id: 'toxic_bloom', name: 'Nụ Độc', mode: 'point', dur: 1.50, cd: 4.20, shake: 1.0,
  under(w, e, p) {
    const g = pop(p, 0.22), fd = fade(p, 0.62);
    puddle(e.x, e.y, 40 * g, 17 * g, C.toxic, 0.24 * (0.45 + 0.55 * fd), e.seed, 7);
    for (const s of [[-30, 10, 11], [28, -6, 9], [6, 16, 8]])
      puddle(e.x + s[0], e.y + s[1], s[2] * g, s[2] * 0.45 * g, C.toxicp, 0.15 * fd,
             e.seed + s[2], 5);
    ring(e.x, e.y, 42 * g, 1.8, C.toxicp, 0.26 * fd, 0.44);
  },
  mid(w, e, p) {
    const rng = mulberry32(e.seed + 4), g = pop(p, 0.25), fd = fade(p, 0.55);
    cloud(e.x, e.y - 12, 34 * g, C.toxic, 0.20 * fd, e.seed + 1, 9, 0.62);
    cloud(e.x, e.y - 18, 22 * g, C.toxicp, 0.16 * fd, e.seed + 2, 7, 0.70);
    for (let i = 0; i < 9; i++) {                    // bubbles at staggered ages
      const ph = (p * 1.7 + i * 0.31) % 1;
      const a = rng.range(0, TAU), rr = rng.range(4, 34) * g;
      const bx = e.x + Math.cos(a) * rr, by = e.y + Math.sin(a) * rr * 0.5 - ph * 24;
      const br = 2.0 + 2.6 * (1 - ph);
      if (ph < 0.78) core(bx, by, br, C.toxicp, 0.75 * fd * (1 - ph), 1.6);
      else ring(bx, by, br * 2.2, 1.0, C.toxicp, 0.7 * fd * (1 - ph) * 4, 1, 1.4);
    }
    core(e.x, e.y - 8, 12 * g, C.toxic, 0.45 * fd, 1.8);
    sparks(e.x, e.y - 10, 12, 6, 34 * g, C.toxicp, 0.55 * fd, e.seed + 5, 0.9, 0.7);
  },
  hit(w, e) {
    for (const at of [0.22, 0.45, 0.68, 0.90]) {
      if (!crossed(e, at)) continue;
      for (const f of foesIn(w, e.x, e.y, 40)) { hurt(w, f, 44, C.toxicp); f.slow = 1.0; }
    }
  },
});

// Xoáy Cuồng Phong dựng bằng sáu tầng vòng dẹt xếp lên nhau: bán kính *nở theo độ cao* nên
// thấy ra hình phễu, tốc độ quay *giảm* theo độ cao nên các tầng trượt lên nhau. Cột quay
// đều như một khối gỗ thì đứng yên trong mắt người xem dù nó có quay nhanh cỡ nào.
const GALE_LV = 6;
const GALE_TOP = 46;                                 // chiều cao phễu khi đã dựng xong
// Bán kính theo độ cao. Tuyến tính thì hai biên là hai đường thẳng và cái phễu đọc ra là
// một cái ly; luỹ 1.5 giữ thân dưới gần như thẳng đứng rồi mới loe ở gần đỉnh, đúng dáng
// một cột xoáy. Cả vòng, biên và mảnh vỡ đều đo bằng hàm này nên chúng không rời nhau.
function galeR(t) { return 6 + 31 * fpow(t, 1.5); }
function galeAxis(e, p, t) {                          // trục: một con sóng chạy dọc lên đỉnh
  // Không phải lắc cả cột như cái chuông: pha đổi theo `t` nên thân cột uốn hình chữ S và
  // sóng đó *chạy* lên. Hai đường biên nhờ vậy không còn là hai que thẳng.
  return e.x + Math.sin(p * 7.4 + t * 3.0) * 5.2 * t;
}
SKILLS.push({
  id: 'gale_vortex', name: 'Xoáy Cuồng Phong', mode: 'point', dur: 1.20, cd: 5.20, shake: 1.4,
  init(w, e) {
    // Mỗi mảnh vỡ có pha, bán kính và tốc độ leo riêng, và nó *vòng lại* khi lên tới đỉnh
    // (`% 1`), nên suốt đoạn giữa luôn có mảnh mới trồi lên: đó là thứ giữ cho một giây
    // đứng tại chỗ không thành một giây nhìn cùng một khung.
    const rng = mulberry32(e.seed + 11), db = [];
    for (let i = 0; i < 15; i++)
      db.push({ ph: rng.range(0, TAU), sp: rng.range(5.2, 9.4), rf: rng.range(0.34, 1.06),
                y0: rng(), vy: rng.range(0.55, 1.40), s: rng.range(2.2, 4.6),
                hot: rng() < 0.45 });
    e.data.deb = db;
  },
  under(w, e, p) {
    const g = pop(p, 0.18), bu = c01((p - 0.78) / 0.22);
    const fd = fade(p, 0.62) * (1 - bu * 0.5);
    // Vết mài trên sàn là xoắn ốc, không phải vòng tròn: gió xoáy thì bụi đi theo đường
    // xoắn, còn một vòng kín đọc ra là cái bia ngắm.
    spiral(e.x, e.y, 3, 44 * g, 12 * g, 0.68, C.sand, 0.26 * fd, 1.8, 0.40, -p * 3.1, 20);
    for (let k = 0; k < 3; k++)                      // broken, so it is a gust not a target
      arc(e.x, e.y, 47 * g, k / 3 * TAU - p * 3.4, 1.30, 2.2, C.sand, 0.34 * fd, 0.40);
    for (let k = 0; k < 2; k++)                      // spent dust: cooler, lagging behind
      arc(e.x, e.y, 33 * g, k * Math.PI - p * 2.2 + 0.9, 1.1, 1.8, C.smoke, 0.30 * fd, 0.40);
    puddle(e.x, e.y, 30 * g, 13 * g, C.sand, 0.12 * fd, e.seed, 8);
    // Mở đòn: bụi bị *hút vào*. Cuối đòn đúng những nét đó bay ra, nên đầu và cuối chiêu
    // không lẫn vào nhau -- bản cũ thổi ra từ khung đầu tới khung cuối.
    const su = 1 - c01(p / 0.30);
    if (su > 0)
      for (let k = 0; k < 7; k++) {
        const a = k / 7 * TAU + 0.4, r0 = 66 - 24 * (1 - su);
        dashline(e.x + Math.cos(a) * r0, e.y + Math.sin(a) * r0 * 0.42,
                 e.x + Math.cos(a) * 22, e.y + Math.sin(a) * 22 * 0.42,
                 4, 1.5, C.sandp, 0.32 * su, 1.2, 0.5);
        chevron(e.x + Math.cos(a) * 27, e.y + Math.sin(a) * 27 * 0.42, a + Math.PI,
                3.4, C.sandp, 0.40 * su);
      }
    if (bu > 0) {                                    // chốt đòn: cả cột bung ra mặt sàn
      const br = 28 + 54 * eo(bu), ba = (1 - bu) * (1 - bu);
      for (let k = 0; k < 4; k++)
        arc(e.x, e.y, br, k / 4 * TAU + 0.3, 1.22, 2.8 - 1.5 * bu, C.sandp, 0.60 * ba, 0.42);
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU + 0.2;
        dashline(e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18 * 0.42,
                 e.x + Math.cos(a) * (br + 18), e.y + Math.sin(a) * (br + 18) * 0.42,
                 5, 1.5, C.sand, 0.34 * ba, 0.9, 0.5);
      }
    }
  },
  mid(w, e, p) {
    const ri = pop(p, 0.26), bu = c01((p - 0.78) / 0.22);
    const fd = (1 - bu * bu) * fade(p, 0.92), grow = 1 + 1.05 * eo(bu);
    const top = GALE_TOP * ri;
    for (let k = 0; k <= GALE_LV; k++) {
      const t = k / GALE_LV, ax = galeAxis(e, p, t), yy = e.y + 1 - top * t;
      const rr = galeR(t) * ri * grow;
      const spin = p * (11.5 - 5.6 * t) + t * 1.5;
      const col = t > 0.72 ? C.smoke : (t < 0.28 ? C.sandp : C.sand);
      const a = (0.76 - t * 0.15) * fd;
      arc(ax, yy, rr, spin, 1.45, 2.3 - t * 0.7, col, a, 0.40, 1.4, 2.2);
      arc(ax, yy, rr, spin + Math.PI + 0.35, 1.10, 2.0 - t * 0.6, col, a * 0.60,
          0.40, 1.4, 2.2);
    }
    // Hai đường biên. Chỉ có vòng thì mắt đọc ra "mấy cái vòng xếp lên nhau"; có biên nối
    // các vòng lại thì nó thành một cái phễu -- đó là cả bản sắc của chiêu này. Lấy 10 mẫu
    // chứ không phải 6 như tầng vòng: 6 mẫu trên một đường cong luỹ 1.5 là thấy được chỗ
    // gấp khúc, và biên nhạt dần lên đỉnh nên nó loe ra rồi tan chứ không kết thúc đột ngột.
    for (const s of [1, -1]) {
      let ox = 0, oy = 0;
      for (let k = 0; k <= 10; k++) {
        const t = k / 10, rr = galeR(t) * ri * grow;
        const x = galeAxis(e, p, t) + s * rr, y = e.y + 1 - top * t;
        if (k) line(ox, oy, x, y, 1.7 - t, C.sandp, (0.44 - t * 0.30) * fd, 1.4);
        ox = x; oy = y;
      }
    }
    beam(galeAxis(e, p, 0.5), e.y + 1, -Math.PI / 2, 0, top * 0.95, 5.4 * grow, 1.4,
         C.sandp, 0.32 * fd, 1.3, 1.5);
    core(galeAxis(e, p, 0.08), e.y - 4, 8.5 * ri * grow, C.sandp, 0.50 * fd, 1.8);
    for (const q of e.data.deb) {                    // mảnh vỡ leo theo phễu rồi vòng lại
      const t = (q.y0 + p * q.vy) % 1;
      const rr = galeR(t) * q.rf * ri * grow, aa = q.ph + p * q.sp;
      const ax = galeAxis(e, p, t);
      const dx = ax + Math.cos(aa) * rr, dy = e.y + 1 - top * t + Math.sin(aa) * rr * 0.40;
      const liv = (1 - fpow(Math.abs(t * 2 - 1), 3)) * fd;   // mờ ở chân và ở đỉnh
      const col = q.hot ? C.sandp : C.sand;
      const tg = aa + Math.PI / 2;
      line(dx, dy, dx - Math.cos(tg) * q.s * 2.4, dy - Math.sin(tg) * q.s * 2.4 * 0.40,
           1.2, col, 0.40 * liv);
      chevron(dx, dy, tg, q.s, col, 0.70 * liv, 1.0);
    }
    if (bu > 0)                                      // và mọi thứ bị ném ngang ra
      sparks(e.x, e.y - 16, 16, 14, 62, C.sandp, 0.70 * (1 - bu), e.seed + 4, 1.2, 0.5,
             0, TAU, 9);
  },
  hit(w, e) {
    const dt = (e.p - e.pt) * e.dur;
    pullToward(w, e.x, e.y, 60, 34, dt);
    for (const at of [0.25, 0.50, 0.75, 0.95])
      if (crossed(e, at)) hitCircle(w, e.x, e.y, 38, 52, C.sandp, false, 4);
  },
});
SKILLS.push({
  id: 'aegis_reflect', name: 'Khiên Phản', mode: 'self', dur: 0.85, cd: 4.60, shake: 1.8,
  under(w, e, p) {
    const h = w.hero, g = pop(p, 0.15), fd = fade(p, 0.45);
    ring(h.x, h.y - 1, 30 * g, 2.2, C.gold, 0.40 * fd, 0.38);
    dial(h.x, h.y - 1, 27 * g, 12, C.holyp, 0.35 * fd, 0.38, 2, 1.0);
  },
  mid(w, e, p) {
    const h = w.hero, g = pop(p, 0.12), fd = fade(p, 0.40);
    const cx = h.x, cy = h.y - 7;
    hexshield(cx, cy, 24 * g, C.gold, C.holyp, 0.95 * fd, e.seed, 7);
    hexshield(cx, cy, 24 * g + 5 + 22 * eo(c01((p - 0.30) / 0.70)), C.gold, C.holyp,
              0.45 * fade(p, 0.30), e.seed + 1, 3);          // the pulse going out
    for (let i = 0; i < 6; i++) {                            // reflected bolts
      const a = i / 6 * TAU + 0.3 + p * 0.6;
      const r0 = 24 * g, r1 = r0 + 16 + 30 * eo(c01((p - 0.22) / 0.6));
      beam(cx, cy, a, r0, r1, 2.2, 0.5, C.gold, 0.85 * fd, 1.3, 1.3);
      beam(cx, cy, a, r0, r1 * 0.8, 0.9, 0.35, C.holyp, 0.85 * fd, 1.2, 1.4);
    }
    core(cx, cy, 12 * g, C.gold, 0.40 * fd, 2.0);
    glare(cx, cy, 34, 24, C.holyp, 0.35 * fd);
    sparks(cx, cy, 14, 22 * g, 30 * g + 10, C.holyp, 0.7 * fd, e.seed + 3, 1.0, 0.9);
  },
  hit(w, e) {
    const h = w.hero;
    if (crossed(e, 0.16)) hitCircle(w, h.x, h.y - 7, 34, 96, C.holyp, false, 62);
    if (crossed(e, 0.52)) hitCircle(w, h.x, h.y - 7, 52, 64, C.gold, false, 34);
  },
});

// Nhịp của Mưa Ma Thuật là thứ được soạn, không phải `0.14 + i * 0.082`: chín mũi cách đều
// tuyệt đối là một cái đồng hồ tích tắc, và đó là lý do bản cũ nhìn đơn điệu dù mỗi mũi đều
// có nổ riêng. Ba chùm ngắn, mỗi chùm chốt bằng một mũi nặng, rồi một khoảng lặng và mũi
// nặng cuối rơi trễ hẳn -- người xem nghe ra được câu nhịp chứ không chỉ đếm.
const RAIN_SEQ = [
  { at: 0.22, cls: 2 }, { at: 0.28, cls: 2 }, { at: 0.36, cls: 1 },
  { at: 0.46, cls: 0 },
  { at: 0.56, cls: 2 }, { at: 0.61, cls: 1 }, { at: 0.68, cls: 2 },
  { at: 0.76, cls: 1 },
  { at: 0.90, cls: 0 },
];
const RAIN_FLY = 0.22;                               // mũi bay trong bao nhiêu phần chiêu
// Ba hạng mũi. Bản cũ có `cls` nhưng nó chỉ đổi bề rộng đường bay, còn cú nổ thì giống hệt
// nhau; ở đây hạng quyết định cả tầm ngắm, cỡ nổ, số tia, màu và thời gian tàn.
const RAIN_CLS = [
  { w: 3.2, len: 152, ret: 30, imp: 20, rays: 10, cd: 0.46, col: C.voidc, ring: 24 },
  { w: 2.0, len: 134, ret: 21, imp: 13, rays: 8,  cd: 0.38, col: C.vio,   ring: 16 },
  { w: 1.2, len: 118, ret: 15, imp: 8,  rays: 6,  cd: 0.28, col: C.lilac, ring: 11 },
];
SKILLS.push({
  id: 'arcane_rain', name: 'Mưa Ma Thuật', mode: 'point', dur: 1.45, cd: 7.20, shake: 1.2,
  init(w, e) {
    const rng = mulberry32(e.seed), ms = [];
    for (const q of RAIN_SEQ) {
      const a = rng.range(0, TAU);
      // Mũi nặng rơi gần tâm, mũi nhẹ tản ra ngoài: rìa lấm tấm, tâm thì nổ lớn.
      const r = (q.cls === 0 ? 22 : 46) * Math.sqrt(rng());
      const at = q.at + rng.range(-0.014, 0.014);
      // Mũi rơi sát cuối chiêu phải nổ *gọn hơn*: fx bị xoá ở p = 1, nên cú nổ dài bằng
      // cú nổ giữa đòn sẽ bị cắt ngang giữa lúc đang sáng nhất. Đây là lý do không dùng
      // một fade chung cuối chiêu -- fade chung dìm luôn cả mũi chốt.
      ms.push({ x: e.x + Math.cos(a) * r, y: e.y + Math.sin(a) * r * 0.55, cls: q.cls, at,
                cd: Math.min(RAIN_CLS[q.cls].cd, 1.04 - at),
                sx: rng.range(-34, 34) * (q.cls === 0 ? 0.35 : 1) });
    }
    e.data.ms = ms;
  },
  under(w, e, p) {
    // Dấu vùng: bãi rơi hiện ra *trước* mũi đầu tiên rồi tắt khi mưa đã bắt đầu.
    const op = pop(p, 0.10) * (1 - c01((p - 0.22) / 0.22));
    if (op > 0) {
      ring(e.x, e.y, 46, 1.6, C.vio, 0.32 * op, 0.55);
      dial(e.x, e.y, 42, 12, C.viop, 0.26 * op, 0.55, 3, 1.0);
    }
    for (const m of e.data.ms) {
      if (p <= m.at) continue;
      const cs = RAIN_CLS[m.cls], age = c01((p - m.at) / (m.cd + 0.06)), liv = 1 - age;
      ring(m.x, m.y, cs.ring * (1.0 + 0.35 * age), 3.0 * liv + 0.8, C.vio,
           (0.26 + 0.52 * liv) * fade(p, 0.94), 0.44);
      if (age < 0.5)
        puddle(m.x, m.y, cs.ring * 0.85, cs.ring * 0.40, C.vio, 0.15 * (1 - age * 2),
               e.seed + m.cls, 5);
      if (m.cls === 0) {                               // mũi nặng cào cả sàn
        const sh = eo(age);
        for (let k = 0; k < 3; k++)
          arc(m.x, m.y, 16 + 42 * sh, k / 3 * TAU + 0.4, 1.35, 2.4 - 1.4 * age, C.viop,
              0.55 * liv * liv, 0.44);
        cracks(m.x, m.y, 7, 24 * sh, C.vio, 0.32 * liv, e.seed + 11, 0.5, 1.1);
      }
    }
  },
  mid(w, e, p) {
    const fd = fade(p, 0.94);
    // Nhịp một: một dấu phép mở ra trên không. Bản cũ vào đề bằng chính mũi thứ nhất nên
    // chiêu không có mở đầu -- nó chỉ có chín lần giống nhau rồi hết.
    const sg = pop(p, 0.14) * (1 - c01((p - 0.26) / 0.20));
    if (sg > 0) {
      const sy = e.y - 62, sr = 26 * (0.55 + 0.45 * sg);
      ring(e.x, sy, sr, 1.8, C.vio, 0.60 * sg, 0.86);
      dial(e.x, sy, sr - 4, 10, C.viop, 0.45 * sg, 0.86, 2, 1.0, 2, 4);
      spiral(e.x, sy, 2, sr - 6, 4, 0.75, C.lilac, 0.45 * sg, 1.6, 0.86, p * 5.2, 18);
      for (let k = 0; k < 3; k++)
        arc(e.x, sy, sr + 5, k / 3 * TAU - p * 4.2, 1.1, 1.6, C.viop, 0.40 * sg, 0.86);
      core(e.x, sy, 7, C.viop, 0.70 * sg, 1.8);
      star(e.x, sy, C.lilac, 6, 4, 22, 1.6, 0.40 * sg, e.seed + 2);
    }
    for (const m of e.data.ms) {
      const cs = RAIN_CLS[m.cls];
      if (p < m.at) {                                  // telegraph + mũi đang bay
        const fall = c01((p - (m.at - RAIN_FLY)) / RAIN_FLY);
        if (fall <= 0) continue;
        // Vòng ngắm *thu lại* khi mũi tới gần: bán kính chính là cái đồng hồ đếm ngược.
        reticle(m.x, m.y, cs.ret * (1.7 - 0.7 * fall), C.vio, 0.28 + 0.50 * fall,
                0.42, 8, 1.0);
        const br = 0.55 + 0.45 * fall;
        const sx = m.x + m.sx * (1 - fall), sy = m.y - cs.len * (1 - fall);
        const hx = m.x + m.sx * (1 - fall) * 0.34, hy = m.y - cs.len * 0.26 * (1 - fall);
        line(sx, sy, hx, hy, cs.w * 2.0, cs.col, 0.24 * br);
        line(sx, sy, hx, hy, cs.w * 0.9, C.viop, 0.55 * br);
        // Mũi giáo: đoạn cuối trắng gắt, ngắn, cộng hai cạnh sáng tách ra hai bên. Một
        // đường thẳng đều màu thì mũi nặng và mũi nhẹ trông y như nhau khi đang bay.
        const ex = hx - (hx - sx) * 0.22, ey = hy - (hy - sy) * 0.22;
        line(ex, ey, hx, hy, cs.w * 0.45, WHITE, 0.90 * br, 1.8);
        const nx = hy - sy, ny = sx - hx, nl = Math.hypot(nx, ny) || 1;
        for (const s of [1, -1])
          line(ex + nx / nl * cs.w * s, ey + ny / nl * cs.w * s, hx, hy, 0.9, cs.col,
               0.60 * br, 1.6);
        dashline(sx, sy, sx - m.sx * 0.18, sy - 30, 4, cs.w * 0.6, cs.col, 0.30 * br, 0.9);
        core(hx, hy, cs.w * 1.7, C.viop, br, 1.8);
        core(hx, hy, cs.w * 0.7, WHITE, br);
      } else {                                         // nổ, rồi tàn
        const age = c01((p - m.at) / m.cd), liv = (1 - age) * fd;
        if (age > 0.55) {
          cloud(m.x, m.y - 4, cs.imp * 0.7, C.vio, 0.15 * liv, e.seed + m.cls, 5, 0.7);
          core(m.x, m.y - 2, 5, C.vio, 0.32 * liv, 1.8);
        } else {
          const k = eo(c01(age / 0.55));
          for (let q = 0; q < cs.rays; q++)
            beam(m.x, m.y, q / cs.rays * TAU + 0.5 + m.cls, 1, cs.imp * (0.5 + k), 2.4, 0.5,
                 C.viop, 0.85 * liv, 1.3, 1.2);
          star(m.x, m.y, cs.col, cs.rays, 2, cs.imp * 1.4 * (0.4 + 0.6 * k), 2.0, liv,
               e.seed + m.cls);
          core(m.x, m.y, cs.w * 2.2 * (1 - age * 0.4), C.viop, liv, 2.2);
          core(m.x, m.y, cs.w * 0.9, WHITE, 1.2 * liv);
          if (m.cls === 0) {                           // mũi nặng bật lên một cột sáng
            beam(m.x, m.y + 1, -Math.PI / 2, 0, 30 * k, 5.0 * (1 - age), 1.0, C.viop,
                 0.60 * liv, 1.3, 1.6);
            glare(m.x, m.y - 6, 34, 12, C.lilac, 0.30 * liv * (1 - age));
          }
        }
        // Tàn dư *dâng lên*: sau cú nổ thì bụi phép bay ngược lên trời, không rơi xuống.
        sparks(m.x, m.y - 3, m.cls === 0 ? 10 : 5, 3, cs.imp + 12, C.lilac, 0.55 * liv,
               e.seed + m.cls * 5 + 3, 1.0, 0.65, Math.PI * 1.15, Math.PI * 1.85, 5);
      }
    }
  },
  hit(w, e) {
    for (const m of e.data.ms)
      if (crossed(e, m.at)) hitCircle(w, m.x, m.y, 19, 62, C.viop, false, 14);
  },
});
SKILLS.push({
  id: 'time_halt', name: 'Ngưng Thời', mode: 'point', dur: 1.30, cd: 9.50, shake: 0.8,
  under(w, e, p) {
    const g = pop(p, 0.18), fd = fade(p, 0.65), SQ = 0.38;
    ring(e.x, e.y, 74 * g, 3.0, C.steel, 0.55 * fd, SQ);
    dial(e.x, e.y, 71 * g, 60, C.steel, 0.42 * fd, SQ, 5, 1.0, 0.030, 0.075);
    ring(e.x, e.y, 52 * g, 2.0, C.steel, 0.35 * fd, SQ);
    ring(e.x, e.y, 26 * g, 1.6, C.steel, 0.28 * fd, SQ);
    // real numerals: bar groups read as tally marks, and IIII at 9 o'clock reads as 4
    const marks = [['12', -Math.PI / 2], ['3', 0], ['6', Math.PI / 2], ['9', Math.PI]];
    for (const m of marks) {
      const nx = e.x + Math.cos(m[1]) * 62 * g, ny = e.y + Math.sin(m[1]) * 62 * SQ * g;
      text3x5(m[0], Math.round(nx - textW(m[0]) * 0.5), Math.round(ny - 2), C.steel, 0.85 * fd);
    }
    line(e.x, e.y, e.x + 46 * g, e.y - 10 * g, 2.0, C.brass, 0.95 * fd);
    line(e.x, e.y, e.x + 13 * g, e.y - 20 * g, 2.0, C.brass, 0.70 * fd);
    line(e.x, e.y, e.x - 30 * g, e.y + 15 * g, 1.1, C.steel, 0.55 * fd);
    dashline(e.x - 26 * g, e.y + 13 * g, e.x - 14 * g, e.y + 22 * g, 3, 1.0, C.steel, 0.35 * fd);
    core(e.x, e.y, 4.0, C.brass, 1.0 * fd);
  },
  mid(w, e, p) {
    const g = pop(p, 0.20), fd = fade(p, 0.60);
    arc(e.x, e.y - 20, 46 * g, -Math.PI / 2, Math.PI * 0.95, 1.6, C.steel, 0.30 * fd, 1.25);
    arc(e.x, e.y - 20, 46 * g, Math.PI / 2, Math.PI * 0.95, 1.6, C.steel, 0.14 * fd, 1.25);
    for (const f of w.foes) {                        // where each one *would* have been
      if (f.frozen <= 0 || f.dying) continue;
      if (Math.hypot(f.x - e.x, f.y - e.y) > 95) continue;
      const dx = w.hero.x - f.x, dy = (w.hero.y - 1) - f.y;
      const d = Math.max(Math.hypot(dx, dy), 1e-3);
      const gx = f.x + dx / d * 16, gy = f.y + dy / d * 10;
      blit(GRIDS[f.kind], Math.round(gx - (f.w >> 1)), Math.round(gy - f.h),
           0.90, f.flip, 0.22 * fd, 1);
      for (let k = 0; k < 3; k++)
        core(f.x + dx / d * (5 + k * 4), midY(f) + dy / d * (3 + k * 2.5), 1.0,
             C.steel, 0.34 * fd, 1.2);
    }
    for (let i = 0; i < 6; i++) {                    // rim chevrons pointing inward
      const a = i / 6 * TAU + 0.25;
      chevron(e.x + Math.cos(a) * 84 * g, e.y + Math.sin(a) * 84 * 0.38 * g,
              a + Math.PI, 4.5, C.steel, 0.50 * fd, 1.0);
    }
    const rng = mulberry32(e.seed + 5);
    for (let i = 0; i < 34; i++) {                   // suspended dust, a quarter with tails
      const mx = rng.range(e.x - 95, e.x + 95), my = rng.range(e.y - 60, e.y + 40);
      core(mx, my, rng.range(0.7, 1.3), C.steel, rng.range(0.25, 0.7) * fd, 1.3);
      if (rng() < 0.25)
        line(mx, my, mx + rng.range(-4, 4), my + rng.range(-3, 3), 0.7, C.steel, 0.28 * fd);
    }
  },
  over(w, e, p) { veil(C.steel, 0.014 * fade(p, 0.5)); },
  hit(w, e) {
    if (!crossed(e, 0.10)) return;
    for (const f of foesIn(w, e.x, e.y, 82)) { hurt(w, f, 42, C.steel); f.frozen = 2.4; }
  },
});
