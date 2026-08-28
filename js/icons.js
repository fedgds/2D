"use strict";
// Small hand-drawn emblems for the hotbar. They live on 32x32 canvases so the
// browser upscales them with the same hard pixel edge as the arena sprites.
const ICON_THEMES = {
  star_rupture:   ['#79dcff', '#effcff', '#102a48'],
  whirl_slash:    ['#bcd8ff', '#ffffff', '#18243a'],
  ember_field:    ['#ff792e', '#ffe0a0', '#3c180d'],
  frost_prison:   ['#59bdff', '#e8fbff', '#0d2b49'],
  chain_bolt:     ['#77aaff', '#f0f6ff', '#14224b'],
  blood_rend:     ['#e94a63', '#ffb0b8', '#3b101d'],
  void_collapse:  ['#9562ff', '#e0cdff', '#241044'],
  judgment_beam:  ['#ffd66f', '#fffbe1', '#3a2a0d'],
  ricochet_shot:  ['#f3c77d', '#fff3cc', '#36230f'],
  shadow_dash:    ['#7770ff', '#d5d2ff', '#17143d'],
  spirit_summon:  ['#62f0c7', '#e3fff7', '#0d382f'],
  toxic_bloom:    ['#7ee85f', '#e2ff9b', '#173713'],
  gale_vortex:    ['#e4c58d', '#fff0cb', '#382d1c'],
  aegis_reflect:  ['#ffd777', '#fff8d7', '#3b2a0d'],
  arcane_rain:    ['#a77aff', '#eee0ff', '#281346'],
  time_halt:      ['#a9d8ff', '#fff2b8', '#172b3d'],
  // The default dash. Cool steel and no hue of its own -- every one of the sixteen owns a
  // colour, and the movement key must not look like it is competing with them.
  dash:           ['#cfe0ff', '#f4faff', '#1a2233'],
};

function drawSkillIcon(canvas, skill) {
  const g = canvas.getContext('2d'), t = ICON_THEMES[skill.id];
  const accent = t[0], light = t[1], deep = t[2];
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, 32, 32);
  const bg = g.createLinearGradient(0, 0, 32, 32);
  bg.addColorStop(0, deep); bg.addColorStop(1, '#05060b');
  g.fillStyle = bg; g.fillRect(0, 0, 32, 32);
  g.globalAlpha = 0.13; g.fillStyle = accent;
  for (let y = 3; y < 32; y += 7) for (let x = (y % 3) + 1; x < 32; x += 8) g.fillRect(x, y, 1, 1);
  g.globalAlpha = 1;

  const lineIcon = (pts, width, col, close) => {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    if (close) g.closePath();
    if (col) { g.strokeStyle = col; g.lineWidth = width; g.stroke(); }
  };
  const fillIcon = (pts, col) => {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath(); g.fillStyle = col; g.fill();
  };
  const orb = (x, y, r, col, stroke) => {
    g.beginPath(); g.arc(x, y, r, 0, TAU);
    if (col) { g.fillStyle = col; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.stroke(); }
  };
  const arcIcon = (x, y, r, a0, a1, width, col) => {
    g.beginPath(); g.arc(x, y, r, a0, a1); g.strokeStyle = col; g.lineWidth = width; g.stroke();
  };
  const starIcon = (x, y, outer, inner, points, col) => {
    const ps = [];
    for (let i = 0; i < points * 2; i++) {
      const a = -Math.PI / 2 + i * Math.PI / points, r = i % 2 ? inner : outer;
      ps.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    fillIcon(ps, col);
  };

  g.save();
  g.lineCap = 'square'; g.lineJoin = 'miter';
  g.shadowColor = accent; g.shadowBlur = 3;
  switch (skill.id) {
    case 'star_rupture':
      starIcon(16, 16, 12, 4, 8, accent); starIcon(16, 16, 6, 2, 8, light);
      orb(16, 16, 2, '#fff');
      break;
    case 'whirl_slash':
      arcIcon(15, 16, 11, -2.55, 0.8, 3, accent);
      arcIcon(17, 16, 7, 0.45, 3.5, 2, light);
      fillIcon([[25, 8], [28, 13], [22, 12]], light);
      break;
    case 'ember_field':
      fillIcon([[16, 28], [8, 24], [11, 16], [15, 20], [14, 7], [21, 14], [23, 9], [26, 20], [23, 27]], accent);
      fillIcon([[16, 26], [13, 21], [17, 16], [18, 11], [22, 20], [20, 26]], light);
      break;
    case 'frost_prison':
      fillIcon([[16, 3], [20, 13], [18, 28], [14, 28], [12, 13]], light);
      fillIcon([[5, 11], [13, 15], [11, 28], [7, 24]], accent);
      fillIcon([[27, 10], [21, 16], [23, 27], [27, 22]], accent);
      lineIcon([[16, 5], [16, 26]], 1, '#fff');
      break;
    case 'chain_bolt':
      lineIcon([[5, 8], [13, 11], [10, 18], [20, 16], [17, 25], [27, 22]], 3, accent);
      lineIcon([[5, 8], [13, 11], [10, 18], [20, 16], [17, 25], [27, 22]], 1, light);
      for (const p of [[5, 8], [20, 16], [27, 22]]) orb(p[0], p[1], 2, light, accent);
      break;
    case 'blood_rend':
      for (let k = 0; k < 3; k++) {
        const x = 7 + k * 6;
        lineIcon([[x + 6, 5], [x + 3, 12], [x + 1, 20], [x - 3, 27]], 3, accent);
        lineIcon([[x + 5, 6], [x + 2, 13], [x, 20]], 1, light);
      }
      break;
    case 'void_collapse':
      orb(16, 16, 10, '#030207', accent); arcIcon(16, 16, 13, -2.7, 1.0, 2, accent);
      arcIcon(16, 16, 13, 0.45, 3.0, 1, light); orb(16, 16, 3, '#000', light);
      break;
    case 'judgment_beam':
      g.globalAlpha = .42; g.fillStyle = accent; g.fillRect(11, 3, 10, 25); g.globalAlpha = 1;
      g.fillStyle = light; g.fillRect(14, 2, 4, 26); g.fillStyle = '#fff'; g.fillRect(15, 4, 2, 23);
      orb(16, 24, 9, null, accent); orb(16, 24, 5, null, light);
      lineIcon([[6, 24], [26, 24]], 1, light);
      break;
    case 'ricochet_shot':
      lineIcon([[5, 24], [12, 9], [21, 17], [28, 6]], 2, accent);
      for (const p of [[5, 24], [12, 9], [21, 17]]) orb(p[0], p[1], 2, light, accent);
      fillIcon([[28, 6], [23, 7], [27, 11]], light);
      break;
    case 'shadow_dash':
      g.globalAlpha = .38; lineIcon([[4, 22], [16, 16], [27, 10]], 6, accent); g.globalAlpha = 1;
      fillIcon([[8, 22], [19, 12], [17, 18], [27, 16], [15, 25]], light);
      lineIcon([[3, 26], [13, 22]], 2, accent); lineIcon([[4, 17], [12, 15]], 1, accent);
      break;
    case 'spirit_summon':
      orb(16, 12, 7, accent); orb(13, 11, 1.5, light); orb(19, 11, 1.5, light);
      fillIcon([[10, 15], [7, 27], [13, 23], [16, 28], [19, 23], [25, 27], [22, 15]], accent);
      arcIcon(16, 13, 4, .25, Math.PI - .25, 1, light);
      break;
    case 'toxic_bloom':
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU, x = 16 + Math.cos(a) * 7, y = 16 + Math.sin(a) * 7;
        orb(x, y, 5, accent, deep);
      }
      orb(16, 16, 5, light, accent); orb(14.5, 15, 1, deep); orb(17.5, 15, 1, deep);
      g.fillStyle = deep; g.fillRect(14, 18, 4, 1);
      break;
    case 'gale_vortex':
      arcIcon(15, 9, 9, -2.8, .65, 2, light); arcIcon(16, 15, 12, -2.7, .45, 3, accent);
      arcIcon(17, 21, 9, -2.65, .5, 2, light); lineIcon([[10, 26], [21, 26]], 2, accent);
      break;
    case 'aegis_reflect':
      fillIcon([[16, 3], [27, 8], [25, 21], [16, 29], [7, 21], [5, 8]], accent);
      fillIcon([[16, 6], [23, 10], [21, 20], [16, 25], [11, 20], [9, 10]], deep);
      lineIcon([[16, 8], [16, 23], [11, 15], [21, 15]], 2, light);
      break;
    case 'arcane_rain':
      orb(16, 24, 10, null, accent); orb(16, 24, 6, null, light);
      for (const x of [8, 16, 24]) {
        lineIcon([[x + 3, 3], [x, 10], [x + 2, 16]], 2, x === 16 ? light : accent);
        fillIcon([[x + 2, 16], [x - 1, 12], [x + 5, 12]], x === 16 ? light : accent);
      }
      break;
    case 'time_halt':
      orb(16, 16, 12, deep, accent); orb(16, 16, 9, null, light);
      lineIcon([[16, 7], [16, 17], [23, 20]], 2, light); orb(16, 16, 2, accent);
      for (const p of [[16, 5], [27, 16], [16, 27], [5, 16]]) orb(p[0], p[1], 1, light);
      break;
    case 'dash':
      // A boot print sliding left to right, with the speed lines it left behind.
      g.globalAlpha = .30;
      lineIcon([[3, 12], [14, 12]], 2, accent);
      lineIcon([[2, 17], [11, 17]], 2, accent);
      lineIcon([[4, 22], [13, 22]], 2, accent);
      g.globalAlpha = 1;
      fillIcon([[16, 6], [26, 10], [24, 17], [17, 15], [18, 22], [13, 26], [15, 17], [13, 11]], accent);
      fillIcon([[18, 9], [23, 11], [22, 15], [17, 13]], light);
      lineIcon([[27, 4], [29, 9], [24, 8]], 1, light);
      break;
  }
  g.restore();
  g.strokeStyle = '#ffffff22'; g.lineWidth = 1; g.strokeRect(.5, .5, 31, 31);
}

// Weapon emblems for the picker and slot 0. Same 32x32 tile and same plate/dither as the
// skill icons, but the art is test.html's held-weapon vector drawing scaled down: the
// silhouette you see in the picker is literally the thing the hero is holding.
const WEAPON_THEMES = {
  kiem:      ['#84eafa', '#d8fbff', '#12283a'],
  dao:       ['#baf7ff', '#ffffff', '#123039'],
  cung:      ['#79e8f4', '#ecfdff', '#0e2f36'],
  'luoi-hai':['#bdf9ff', '#eaffff', '#123039'],
  gang:      ['#65dcec', '#d9fbff', '#0f2c33'],
};
function drawWeaponIcon(canvas, wp) {
  const g = canvas.getContext('2d');
  const t = WEAPON_THEMES[wp.id] || WEAPON_THEMES.kiem;
  const accent = t[0], light = t[1], deep = t[2];
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, 32, 32);
  const bg = g.createLinearGradient(0, 0, 32, 32);
  bg.addColorStop(0, deep); bg.addColorStop(1, '#05060b');
  g.fillStyle = bg; g.fillRect(0, 0, 32, 32);
  g.globalAlpha = 0.13; g.fillStyle = accent;
  for (let y = 3; y < 32; y += 7) for (let x = (y % 3) + 1; x < 32; x += 8) g.fillRect(x, y, 1, 1);
  g.globalAlpha = 1;
  g.save();
  g.lineCap = 'square'; g.lineJoin = 'miter';
  g.shadowColor = accent; g.shadowBlur = 3;
  switch (wp.id) {
    case 'cung':
      g.strokeStyle = accent; g.lineWidth = 3;
      g.beginPath(); g.moveTo(9, 4); g.quadraticCurveTo(22, 16, 9, 28); g.stroke();
      g.strokeStyle = light; g.lineWidth = 1;
      g.beginPath(); g.moveTo(9, 4); g.lineTo(13, 16); g.lineTo(9, 28); g.stroke();
      g.fillStyle = light; g.fillRect(11, 15, 15, 2);
      g.beginPath(); g.moveTo(29, 16); g.lineTo(23, 12); g.lineTo(23, 20); g.closePath(); g.fill();
      break;
    case 'dao':
      g.fillStyle = '#294b57'; g.fillRect(6, 22, 5, 7);
      g.fillStyle = accent;
      g.beginPath(); g.moveTo(9, 25); g.lineTo(28, 4); g.quadraticCurveTo(26, 17, 13, 28); g.closePath(); g.fill();
      g.strokeStyle = light; g.lineWidth = 1;
      g.beginPath(); g.moveTo(10, 24); g.lineTo(26, 7); g.stroke();
      break;
    case 'gang':
      g.fillStyle = accent; g.fillRect(4, 12, 10, 14); g.fillRect(18, 12, 10, 14);
      g.fillStyle = light; g.fillRect(5, 7, 8, 6); g.fillRect(19, 7, 8, 6);
      g.fillStyle = '#2d7080'; g.fillRect(4, 24, 10, 4); g.fillRect(18, 24, 10, 4);
      g.fillStyle = light; g.fillRect(6, 16, 6, 1); g.fillRect(20, 16, 6, 1);
      break;
    case 'luoi-hai':
      g.strokeStyle = '#28525e'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(22, 29); g.lineTo(20, 5); g.stroke();
      g.strokeStyle = accent; g.lineWidth = 3;
      g.beginPath(); g.moveTo(20, 5); g.quadraticCurveTo(8, 2, 3, 13);
      g.quadraticCurveTo(11, 8, 21, 11); g.stroke();
      g.fillStyle = light; g.fillRect(19, 3, 3, 4);
      break;
    default:                                       // kiem
      g.fillStyle = '#f4f7ff'; g.fillRect(13, 24, 6, 5);
      g.fillStyle = '#f4f7ff'; g.fillRect(9, 21, 14, 3);
      g.fillStyle = accent; g.fillRect(14, 8, 4, 14);
      g.fillStyle = light; g.fillRect(15, 3, 2, 8);
  }
  g.restore();
  g.strokeStyle = '#ffffff22'; g.lineWidth = 1; g.strokeRect(.5, .5, 31, 31);
}

// The arena tiles draw themselves out of the map's own tone list, so a new file in `map/`
// gets a picker icon for free instead of waiting on someone to hand-draw one: a mosaic of
// its four floor tones, a few seam-coloured cracks, two props in its stone, and one dot of
// its landmark light -- which is the part that actually tells the three apart at a glance.
function drawMapIcon(canvas, m) {
  const g = canvas.getContext('2d'), t = m.tone, P = m.pal;
  const q = mulberry32(((m.seed || 4242) ^ 0x5a17) >>> 0);
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, 32, 32);
  g.fillStyle = t.floor[0]; g.fillRect(0, 0, 32, 32);
  // Weighted toward the brighter tones at the top: the same squashed perspective the arena
  // uses, where far ground catches more light than the strip you are standing on.
  for (let y = 0; y < 32; y += 2) for (let x = 0; x < 32; x += 2) {
    g.fillStyle = t.floor[clamp(Math.round(q.range(-0.5, 1.3) + 2.1 * (1 - y / 32)), 0, 3)];
    g.fillRect(x, y, 2, 2);
  }
  // Cracks: the floor generators' wandering walk, at icon scale.
  g.fillStyle = t.seam;
  for (let i = 0; i < 3; i++) {
    let x = q.range(0, 32), y = q.range(3, 30), a = q.range(-0.7, 0.7);
    for (let s = 0; s < 24; s++) {
      if (x < 0 || x > 31 || y < 0 || y > 31) break;
      g.fillRect(x | 0, y | 0, 1, 1);
      a += q.range(-0.5, 0.5); x += Math.cos(a) * 1.4; y += Math.sin(a) * 0.7;
    }
  }
  g.fillStyle = P.d; g.fillRect(5, 13, 6, 16);        // a pillar
  g.fillStyle = P.D; g.fillRect(6, 14, 4, 15);
  g.fillStyle = P.P; g.fillRect(7, 15, 1, 13);
  g.fillStyle = P.d; g.fillRect(19, 24, 10, 5);       // and a boulder
  g.fillStyle = P.D; g.fillRect(20, 25, 8, 4);
  g.fillStyle = P.P; g.fillRect(22, 26, 3, 1);
  // The landmark, lit the way the arena lights it: a wide soft spill plus a hot core.
  const cx = 23, cy = 12;
  const gl = g.createRadialGradient(cx, cy, 0, cx, cy, 12);
  gl.addColorStop(0, m.amb.glow); gl.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 0.8; g.fillStyle = gl; g.fillRect(cx - 12, cy - 12, 24, 24);
  g.globalAlpha = 1;
  g.fillStyle = m.amb.lm; g.fillRect(cx - 2, cy - 5, 4, 9); g.fillRect(cx - 3, cy, 6, 3);
  g.fillStyle = P.Z; g.fillRect(cx - 1, cy - 4, 2, 5);
  g.strokeStyle = '#ffffff22'; g.lineWidth = 1; g.strokeRect(.5, .5, 31, 31);
}

