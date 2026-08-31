"use strict";
// Trang bị -- five slots, four rarities, twelve stat lines.
//
// An item is a plain object: `{ slot, rar, stats: [{ id, v }], seed }`. Nothing in this file
// touches the world: `syncGear` in js/world.js is what turns an equipped set into hero
// numbers, and it is the only place that knows the base 400 HP / 120 mana. The tables live
// in their own file, loaded *before* js/world.js, so they are already in scope when the
// first run is built (classic scripts share one lexical scope -- a `const` read by an
// earlier file than the one that declares it is a TDZ error, not a hoist).
//
// The art is images/gear/<slot>/<rarity>.png: twenty files, one per combination. An item
// never carries its own image -- the slot picks the shape, the rarity picks the tint -- so
// the drop table can hand out as many items as it likes without new art.

const GEAR_SLOTS = [
  { id: 'helmet', name: 'Mũ' },
  { id: 'armor', name: 'Giáp' },
  { id: 'gloves', name: 'Găng' },
  { id: 'pants', name: 'Giáp Chân' },
  { id: 'boots', name: 'Giày' },
];
const SLOT_BY_ID = {};
for (const s of GEAR_SLOTS) SLOT_BY_ID[s.id] = s;

// `lines` is how many stats the item rolls, straight from the spec: 1/2/3/4. `mul` scales
// each of those rolls on top of that, so a legendary is not merely four small lines. `w` is
// the drop weight, `col` the frame/background colour behind the icon (green, blue, purple,
// orange) and `dim` the darker fill that colour sits on so a white icon stays readable.
const GEAR_RARITY = [
  { id: 'common', name: 'Thường', lines: 1, mul: 1.00, w: 58, col: '#3faa55', dim: '#16301d' },
  { id: 'rare', name: 'Hiếm', lines: 2, mul: 1.20, w: 27, col: '#3b7ddd', dim: '#131f3a' },
  { id: 'epic', name: 'Sử Thi', lines: 3, mul: 1.45, w: 12, col: '#9a5cd0', dim: '#221436' },
  { id: 'legendary', name: 'Huyền Thoại', lines: 4, mul: 1.75, w: 3, col: '#e8871e', dim: '#361c06' },
];
const RARITY_BY_ID = {};
for (const r of GEAR_RARITY) RARITY_BY_ID[r.id] = r;

// The twelve stats, in the order the status panel lists them. `lo`/`hi` is the roll range
// before the rarity multiplier. `pct` marks the five that the engine reads as percentages --
// every one of those turns into a `1 + v / 100` factor somewhere, which is exactly 1 when
// nothing is equipped; the flat ones are plain adds. That "0 means today's numbers" property
// is what keeps tools/check-weapons.js green, so no stat may have a nonzero base.
//
// `atk` và `mag` là số phẳng: chúng cộng thẳng vào từng cú đánh (xem `hurt` trong js/world.js),
// không nhân phần trăm. Vì thế hai khoảng này nhỏ hơn hẳn những khoảng khác *và khác nhau*: một
// hit vũ khí chỉ 7-20 sát thương (WEAPONS[].dmg), còn một chiêu là 42-430, nên cùng một con số
// phẳng thì với vũ khí là gấp đôi mà với chiêu là làm tròn số. Hai thang, hai khoảng.
const GEAR_STATS = [
  { id: 'atk', name: '+ATK', lo: 2, hi: 5 },
  { id: 'mag', name: '+Magic ATK', lo: 9, hi: 24 },
  { id: 'hp', name: '+HP', lo: 14, hi: 48 },
  { id: 'mp', name: '+Mana', lo: 6, hi: 22 },
  { id: 'def', name: '+DEF', lo: 3, hi: 11 },
  { id: 'crit', name: '+Crit rate', lo: 2, hi: 7, pct: true },
  { id: 'critd', name: '+Crit damage', lo: 8, hi: 24, pct: true },
  { id: 'aspd', name: '+Attack Speed', lo: 2, hi: 8, pct: true },
  { id: 'mspd', name: '+Move Speed', lo: 2, hi: 7, pct: true },
  { id: 'hpr', name: '+HP Regen/5s', lo: 2, hi: 8 },
  { id: 'mpr', name: '+Mana Regen/5s', lo: 2, hi: 7 },
  { id: 'dodge', name: '+%Dodge', lo: 1, hi: 5, pct: true },
];
const STAT_BY_ID = {};
for (const s of GEAR_STATS) STAT_BY_ID[s.id] = s;

const BAG_MAX = 24;

function gearIcon(it) { return 'images/gear/' + it.slot + '/' + it.rar + '.png'; }
function gearName(it) {
  return SLOT_BY_ID[it.slot].name + ' ' + RARITY_BY_ID[it.rar].name;
}
function statText(s) {
  const d = STAT_BY_ID[s.id];
  return d.name + ' ' + s.v + (d.pct ? '%' : '');
}
// Crude but honest: the sum of the rolled numbers, scaled by rarity. Only the status panel
// reads it, and only to say "this is better than what you are wearing" -- never the sim. A
// real weighting (is +7% crit worth more than +40 HP?) depends on the fight, so a number that
// pretends to know would be worse than an obvious one.
function gearScore(it) {
  if (!it) return 0;
  let n = 0;
  for (const s of it.stats) n += s.v;
  return n * RARITY_BY_ID[it.rar].mul;
}

// One item. `rng` must be a stream that is not the sim's -- see `w.grng` in js/world.js.
// A stat is drawn out of the pool rather than sampled, so one item never rolls the same
// line twice: four copies of +ATK would read as a bug even when the maths works.
function rollGear(rng, slotId, rarId) {
  const rar = RARITY_BY_ID[rarId] || GEAR_RARITY[0];
  const pool = GEAR_STATS.slice(), stats = [];
  for (let k = 0; k < rar.lines && pool.length; k++) {
    const d = pool.splice(rng.int(0, pool.length), 1)[0];
    stats.push({ id: d.id, v: Math.max(1, Math.round(rng.int(d.lo, d.hi + 1) * rar.mul)) });
  }
  return { slot: SLOT_BY_ID[slotId] ? slotId : GEAR_SLOTS[0].id, rar: rar.id,
           stats: stats, seed: rng.int(1, 1e9) | 0 };
}

// Rarity roll. `boost` bends the weights upward by a factor per tier, so a boss can hand out
// better things than a swarm foe without a second table: at boost 0 these are the plain
// weights, at boost 1 a legendary is eight times as likely as it was.
function rollRarity(rng, boost) {
  const b = boost || 0;
  let tot = 0;
  const wt = GEAR_RARITY.map((r, i) => { const v = r.w * Math.pow(1 + b, i); tot += v; return v; });
  let r = rng() * tot;
  for (let i = 0; i < wt.length; i++) { r -= wt[i]; if (r < 0) return GEAR_RARITY[i].id; }
  return GEAR_RARITY[GEAR_RARITY.length - 1].id;
}

const GEAR_DROP = 0.15;        // chance per ordinary kill
const GEAR_BOSS_BOOST = 1.1;   // how far a boss bends the rarity weights

// Returns an item or null. The chance is rolled first and on the same stream, so a run's
// drops are reproducible from its seed alone.
function rollDrop(rng, chance, boost) {
  if (rng() >= chance) return null;
  return rollGear(rng, GEAR_SLOTS[rng.int(0, GEAR_SLOTS.length)].id, rollRarity(rng, boost));
}

// The aggregate every gear-aware line in the engine reads. Every key is present and zero
// with nothing equipped, which is the whole contract: no branch anywhere has to ask whether
// the player has gear, and a bare run computes exactly the numbers it did before gear
// existed.
function gearSum(equip) {
  const g = {};
  for (const s of GEAR_STATS) g[s.id] = 0;
  if (equip) for (const sl of GEAR_SLOTS) {
    const it = equip[sl.id];
    if (it) for (const s of it.stats) g[s.id] += s.v;
  }
  return g;
}
