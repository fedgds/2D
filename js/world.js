"use strict";
// ===========================================================================
// 4. World: hero, dummy enemies, damage numbers, active effects.
//    (x, y) for every unit is (centre column, floor line) like scene.Actor, so the
//    sprite's feet are the sort key and the shadow anchor.
// ===========================================================================
const BOUND = { x0: 26, x1: WW - 26, y0: 40, y1: WH - 26 };
// Kích thước gốc của sân, giữ riêng ra vì `BOUND` bị **sửa tại chỗ** khi vào phòng boss
// (js/gate.js). Hơn ba mươi chỗ đọc `BOUND` -- bước đi, dash, lao vũ khí, chùm tia, mọi skill, cả
// cú hút của boss -- nên thu cái hình chữ nhật này lại là cách duy nhất làm "map nhỏ hơn" mà không
// phải sờ vào một chỗ nào trong số đó. Đổi lại, nó là trạng thái toàn cục: `roomApply` bên gate.js
// đồng bộ lại nó theo `w.room` ở đầu mỗi tick, nên hai world sống cùng lúc (các harness trong
// tools/ có làm thế) không thể kế thừa cái sân hẹp của nhau.
const BOUND0 = { x0: BOUND.x0, x1: BOUND.x1, y0: BOUND.y0, y1: BOUND.y1 };
// `cyc` is how many world pixels one animation frame lasts, so the cycle is driven by
// distance covered rather than by time: a slime at 17 px/s hopping on the same 4.2 px cadence
// as the wraith took a full second per hop and read as gliding.
// `abil` lists the monster's telegraphed moves (see section 6b) longest reach first, so a
// brute that still has room quakes and only swipes once you are inside its arms. `keep` is
// the distance a ranged monster tries to hold: without it a spitter walks into your sword
// and its warning circle never has time to be read.
const KIND = {
  slime:    { hp: 90,  spd: 17, mass: 1.0, cyc: 2.0, label: 'Nhớt Xanh',
              abil: ['acid_burst'] },
  wraith:   { hp: 130, spd: 27, mass: 0.8, cyc: 4.2, label: 'Oan Hồn',
              abil: ['soul_lash'] },
  brute:    { hp: 320, spd: 11, mass: 2.2, cyc: 2.6, label: 'Đại Lực',
              abil: ['quake_slam', 'cleave'] },
  spitter:  { hp: 150, spd: 21, mass: 0.9, cyc: 2.4, label: 'Nhện Độc',
              keep: 84, abil: ['venom_pool'] },
  bomber:   { hp: 110, spd: 31, mass: 0.7, cyc: 2.2, label: 'Bọ Nổ',
              abil: ['detonate'] },
  sentinel: { hp: 260, spd: 8,  mass: 2.6, cyc: 3.4, label: 'Mắt Canh',
              keep: 108, abil: ['pierce_beam'] },
};
// Spawn weights, not an even roll: the two heavies and the suicide bomber are rare
// enough that meeting one is an event, and the slime is still the crowd.
const SPAWN_W = [['slime', 24], ['wraith', 18], ['spitter', 16],
                 ['bomber', 13], ['brute', 12], ['sentinel', 9]];
const SPAWN_TOT = SPAWN_W.reduce((s, r) => s + r[1], 0);
function pickKind(rng) {
  let r = rng() * SPAWN_TOT;
  for (let i = 0; i < SPAWN_W.length; i++) { r -= SPAWN_W[i][1]; if (r <= 0) return SPAWN_W[i][0]; }
  return 'slime';
}

function unit(kind, x, y) {
  const g = GRIDS[kind], k = KIND[kind];
  // Boss có art thì hộp lấy theo art, không theo lưới vẽ tay: w là bán kính bị đánh trúng và
  // h là chỗ treo thanh máu, nên cả hai phải khớp với cái đang hiện trên màn hình. Chúng là
  // *một cặp số cố định* (bw/bh trong ANIM_IMG) chứ không lấy từng khung một -- hitbox co giãn
  // theo hoạt ảnh nghĩa là cùng một cú vung trúng hay không tuỳ khung boss đang thở.
  const A = typeof ANIM_IMG !== 'undefined' ? ANIM_IMG[kind] : null;
  return { kind, x, y, w: A ? A.bw : g[0].length, h: A ? A.bh : g.length, vx: 0, vy: 0,
           hp: k.hp, maxhp: k.hp, spd: k.spd, mass: k.mass,
           flash: 0, flip: false, dim: 1, slow: 0, frozen: 0, dying: 0,
           // Vết xé của vuốt (`rend` trong js/weapon.js): `rnd` là số vết đang có, `rndT` là
           // thời gian còn lại của cả chồng. Nó ở trên con quái chứ không trên nhát đánh, vì đó
           // đúng là điều nó nói: người chơi đang xây một cái gì đó *lên một mục tiêu cụ thể*.
           rnd: 0, rndT: 0,
           // Casting state. `acd` is staggered from the spawn position instead of from a
           // random draw, so two monsters that walk in together do not wind up in lockstep.
           tel: null, chg: 0, acd: 1.1 + (Math.abs((x * 31 + y * 17) | 0) % 240) / 100,
           // Boss-only: `rel` holds the release pose past the hit, `last` stops the random
           // move pick repeating itself. Set on every unit so no draw path has to ask.
           rel: 0, last: '', boss: !!k.boss,
           ph: (Math.abs(x * 7 + y * 13) % 400) / 100, mv: 0 };
}
const midY = f => f.y - f.h * 0.5;

// The view is centred on the hero and clamped to the world, and it is the *integer*
// camera that everything draws against, so the shell has to ask for it the same way
// renderWorld does -- otherwise the mouse would aim half a pixel off the picture.
function camTarget(w) { return { x: w.hero.x - W * 0.5, y: (w.hero.y - 6) - H * 0.5 }; }
function camInt(w) {
  return { x: camClampX(Math.round(w.cam.x)), y: camClampY(Math.round(w.cam.y)) };
}
function snapCam(w) {
  const t = camTarget(w);
  w.cam.x = camClampX(t.x); w.cam.y = camClampY(t.y);
}

// A run is defined by its loadout: one weapon and three of the sixteen skills. `slots`
// holds *global* skill indices, so `w.cds` stays the full 16-entry table (a skill you
// left at home still has a cooldown slot -- simpler than remapping indices everywhere)
// and the hotbar just reads the three it was told to show.
//
// Mana is the second resource: every skill carries an `mp` cost (js/skills.js) and `cast`
// refuses when the bar is short, the same way it refuses on cooldown. The weapon and the
// dash stay free -- the dash *is* the dodge, and a dodge you cannot afford is a death
// sentence the player cannot read off the HUD. Base regen is deliberately generous: the
// cost is there to price a rotation, not to end a run when the bar empties.
const HERO_HP = 400, HERO_MP = 120, MP_REGEN = 7.5;

// Equipped gear folded into hero numbers. Called on every equip/unequip and nowhere else:
// `w.gs` is a plain snapshot, so the hot paths read fields instead of walking five slots.
//
// Extra max HP arrives as extra *current* HP and leaves the same way, so swapping a piece
// in and straight back out is a no-op rather than a slow bleed or a free heal. The floor of
// 1 is what stops a big +HP piece being a suicide button when it comes off at low health.
function syncGear(w) {
  const h = w.hero, was = h.maxhp;
  w.gs = gearSum(w.equip);
  h.maxhp = HERO_HP + w.gs.hp;
  h.maxmp = HERO_MP + w.gs.mp;
  h.hp = clamp(h.hp + (h.maxhp - was), 1, h.maxhp);
  h.mp = clamp(h.mp, 0, h.maxmp);
}
// Bag index -> worn. Whatever was in that slot goes back to the bag, which is why this
// cannot overflow: one out for one in.
function equipGear(w, i) {
  const it = w.bag[i];
  if (!it) return false;
  w.bag.splice(i, 1);
  const off = w.equip[it.slot];
  w.equip[it.slot] = it;
  if (off) w.bag.push(off);
  syncGear(w);
  return true;
}
function unequipGear(w, slot) {
  const it = w.equip[slot];
  if (!it || w.bag.length >= BAG_MAX) return false;
  w.equip[slot] = null;
  w.bag.push(it);
  syncGear(w);
  return true;
}
function trashGear(w, i) {
  if (!w.bag[i]) return false;
  w.bag.splice(i, 1);
  return true;
}
// What a kill hands out. Rolled on `w.grng`, so this is invisible to every seeded outcome
// in the sim. Món không vào thẳng túi nữa: nó bật ra khỏi xác con quái và nằm trên sàn cho tới
// khi người chơi đi ngang qua (xem `spawnOrb`). `x`/`y` là chỗ nó bật ra, mặc định là chỗ nhân
// vật đứng -- đó là đường của phím gỡ lỗi 'L' trong shell.js, và một món debug thì nên rơi ngay
// dưới chân chứ không ở giữa bản đồ.
//
// Túi đầy **không** còn chặn ở đây. Trước kia nó chặn, vì một món không vào được túi thì không
// còn chỗ nào để đi; giờ nó có sàn để nằm, nên nó cứ rơi ra và chờ -- người chơi thấy nó sáng ở
// đó, biết mình đang bỏ lỡ cái gì, và đi dọn túi. Cái chặn thật nằm ở `ORB_MAX`.
function dropLoot(w, boss, x, y) {
  if (w.orbs.length >= ORB_MAX) return null;
  const it = rollDrop(w.grng, boss ? 1 : GEAR_DROP, boss ? GEAR_BOSS_BOOST : 0);
  if (!it) return null;
  w.loot++;
  spawnOrb(w, it, x == null ? w.hero.x : x, y == null ? w.hero.y : y);
  return it;
}

// ---- Món rơi ra, nằm trên sàn, tự nhặt ------------------------------------------------------
// Ba lý do để nó là một vật trên sàn chứ không phải một dòng cộng vào túi, và không lý do nào
// trong ba cái là "cho đẹp":
//
//   * một món vào túi trong im lặng là một món người chơi không biết mình vừa được. Cái badge
//     "MÓN MỚI" nói *có*, nhưng không nói *lúc nào* và *từ con nào*;
//   * màu phẩm chất là thứ đọc được từ xa nhất trong cả hệ trang bị (xanh lá / xanh dương / tím /
//     cam), mà từ trước tới giờ nó chỉ sống trong bảng trang bị -- tức là ở chỗ trận đấu đã dừng.
//     Cho nó bật ra khỏi xác là chỗ duy nhất màu ấy xuất hiện *trong lúc đánh*, và một vệt cam
//     bay ra khỏi con quái vừa chết là thứ người chơi nhìn thấy trước khi kịp đọc chữ nào;
//   * một món nằm trên sàn là một lý do để bước tới chỗ đó, tức là một quyết định nhỏ giữa hai
//     đợt quái -- ở một game mà từ trước tới giờ việc duy nhất là đứng đúng chỗ.
//
// Nó không nằm trong `w.fxs`: `fxs` là hiệu ứng của chiêu, chết theo `dur` của chính nó và không
// mang gì cả. Món rơi thì *mang một món*, sống tới khi có người nhặt, và là thứ sim đọc -- nên
// nó là danh sách riêng, `w.orbs`, bước trong `step` như quái và số bay.
const ORB_MAX = 32;      // trần số món nằm trên sàn cùng lúc, đúng lối của BAG_MAX
const ORB_MAG = 34;      // trong bán kính này thì món tự bay về phía nhân vật
const ORB_TAKE = 9;      // và trong bán kính này thì vào túi
const ORB_WAIT = 0.22;   // đã nằm xuống bấy nhiêu giây mới cho hút: món phải *hiện ra* trước
const ORB_GRAV = 260;    // trọng lực của đường bay, px/s^2

// Bật ra khỏi xác: một góc bất kỳ trên mặt phẳng sàn, cộng một cú đẩy lên. Bốc trên `w.grng`
// -- cùng dòng đã bốc ra chính món này -- nên hai trận cùng seed rơi ra cùng những món ở cùng
// những chỗ, mà số hạt bụi một khung sinh ra vẫn không đổi được đường bay nào.
//
// `z` là độ cao trên sàn, tách khỏi `y`: `y` là *chỗ đứng* (cái mà bóng và thứ tự vẽ đọc), nên
// một món bay lên không được phép trôi ra trước hay ra sau con quái nó vừa rời khỏi.
function spawnOrb(w, it, x, y) {
  const ang = w.grng.range(0, TAU), sp = w.grng.range(15, 34);
  w.orbs.push({
    it: it, rar: it.rar,
    x: x, y: clamp(y, BOUND.y0, BOUND.y1), z: 7,
    vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.55, vz: w.grng.range(52, 78),
    t: 0, land: 0, bounce: 0, pull: 0,
    sx: x, sy: y,                                   // chỗ bật ra: chùm tia đầu tiên vẽ từ đây
    seed: w.grng.int(0, 0x7fffffff) >>> 0,          // hạt của mọi tia lấp lánh của riêng món này
  });
  SFX.loot(RAR_IX[it.rar] || 0, clamp((x - w.cam.x - W * 0.5) / (W * 0.5), -1, 1));
}
const RAR_IX = {};
for (let i = 0; i < GEAR_RARITY.length; i++) RAR_IX[GEAR_RARITY[i].id] = i;

// Vào túi. Túi đầy thì **không** nhặt và món ở lại nguyên chỗ đó -- không phải để phạt, mà vì
// đường còn lại là lặng lẽ xoá một món Huyền Thoại của người chơi. `w.got` là cú nháy sáng ở
// người nhân vật, đọc bởi render: một trường chứ không phải một danh sách, vì nhặt hai món trong
// một phần tư giây thì cú nháy thứ hai chỉ nên bắt đầu lại, không xếp hàng.
function takeOrb(w, o, i) {
  w.bag.push(o.it); w.newGear++;
  w.got = 0.34; w.gotR = o.rar;
  w.orbs.splice(i, 1);
  SFX.pick(RAR_IX[o.rar] || 0);
}

function stepOrb(w, o, dt, i) {
  o.t += dt;
  if (o.land <= 0) {
    o.x = clamp(o.x + o.vx * dt, BOUND.x0, BOUND.x1);
    o.y = clamp(o.y + o.vy * dt, BOUND.y0, BOUND.y1);
    o.z += o.vz * dt; o.vz -= ORB_GRAV * dt;
    // Cản không khí, để cú đẩy quyết định *hướng* mà không quyết định món bay bao xa: không có
    // nó thì một góc thuận sẽ ném món ra ngoài màn hình và người chơi mất luôn cái vừa rơi.
    const k = 1 - dt * 2.4;
    o.vx *= k; o.vy *= k;
    if (o.z <= 0) {
      o.z = 0;
      // Một cú nảy, không hai: nảy một lần là một vật có trọng lượng, nảy nhiều lần là một quả
      // bóng cao su -- và cái thứ hai kéo dài đúng cái khoảng người chơi đang chờ để nhặt.
      if (o.vz < -46 && o.bounce < 1) { o.bounce++; o.vz = -o.vz * 0.44; o.vx *= 0.5; o.vy *= 0.5; }
      else { o.vz = 0; o.vx = 0; o.vy = 0; o.land = 1e-4; }
    }
    return;
  }
  o.land += dt;
  if (o.land < ORB_WAIT) return;
  // Túi đầy: không hút, không nhặt. Món cứ nằm đó sáng, và cái sàn đầy đồ *là* lời nhắc dọn túi.
  if (w.bag.length >= BAG_MAX) { o.pull = 0; return; }
  const h = w.hero, dx = h.x - o.x, dy = (h.y - 5) - o.y;
  const d = Math.hypot(dx, dy) || 1e-4;
  if (d < ORB_TAKE) { takeOrb(w, o, i); return; }
  if (d > ORB_MAG) { o.pull = Math.max(0, o.pull - dt * 4); return; }
  // Hút, chứ không phải chạm là được. Bán kính hút rộng gấp bốn bán kính nhặt vì người chơi đang
  // nhìn con quái tiếp theo, không nhìn xuống chân: đi *gần* món là đủ. `pull` lên dần trong một
  // phần ba giây nên món không giật một cái vào người ngay khoảnh khắc vào tầm.
  o.pull = Math.min(1, o.pull + dt * 3.4);
  const sp = (58 - 22 * (d / ORB_MAG)) * o.pull;
  o.x += dx / d * sp * dt; o.y += dy / d * sp * dt;
  o.z += (6 - o.z) * Math.min(1, dt * 7);          // dâng lên tầm ngực trên đường bay tới
}


function newWorld(seed, loadout) {
  const s = seed || 20260827;
  const lo = loadout || {};
  // The picker applies the arena the moment it is clicked, so this is normally a no-op.
  // It is here for the callers that are not the picker -- LAB, and anything that hands a
  // loadout straight to newWorld -- so a run can never open on the wrong floor.
  if (lo.map && MAP_BY_ID[lo.map] && MAPDEF !== MAP_BY_ID[lo.map]) applyMap(lo.map);
  const w = {
    t: 0, frame: 0, rng: mulberry32(s), crng: mulberry32((s ^ 0x5bf03) >>> 0),
    // A third stream, for loot and for the gear crit roll. It is not the sim stream, so a
    // dropped item can never shift a seeded outcome, and it is not the cosmetic stream
    // either -- the number of dust motes a frame happened to spawn must not decide what a
    // kill hands out. It is still seeded from the run seed, so a run's drops are its own.
    grng: mulberry32((s ^ 0x1f83d9) >>> 0),
    // Bề rộng khoảng ngẫu nhiên của sát thương, xem `hurt`. Là một trường của trận chứ không
    // phải một hằng đọc trực tiếp, để hai harness pin số cứng đặt được về 0.
    vary: DMG_VARY,
    // Chí mạng của nhân vật, trước trang bị: một tỷ lệ duy nhất dùng cho cả vũ khí và chiêu.
    // Cũng là trường của trận, cùng lý do -- xem `hurt`.
    crit: CRIT_BASE, critd: CRIT_BASE_D,
    shake: 0, spawnT: 0,
    hero: { x: WW * 0.5, y: WH * 0.5, w: 11, h: 14, vx: 0, vy: 0, flash: 0, flip: false,
            hp: HERO_HP, maxhp: HERO_HP, mp: HERO_MP, maxmp: HERO_MP,
            glow: 0.5, ph: 0, it: 0, mv: 0, fi: 0, atk: -1,
            dsh: 0, dvx: 0, dvy: 0, inv: 0 },
    cam: { x: 0, y: 0 }, props: PROPS, puffs: [], amb: [],
    foes: [], fxs: [], tels: [], nums: [], aim: { x: 0, y: 0 },
    kills: 0, dmg: 0, taken: 0, dodges: 0, danger: 0, god: true, cds: new Float32Array(16),
    // The live boss, and how many have already come. `bossN` only ever counts up, so a boss
    // you killed cannot walk back in on the next kill.
    boss: null, bossN: 0,
    wp: (typeof lo.wp === 'string' ? WEAPON_BY_ID[lo.wp] : lo.wp) || WEAPONS[0],
    slots: (lo.slots && lo.slots.length === 3 ? lo.slots.slice() : [0, 1, 2]),
    wcd: 0, dcd: 0, sw: null,
    // Weapon state that outlives one swing. `momo` is the sword's open window: it is opened
    // by landing a finisher and spent by the *next* click, so it cannot live on the fx entry
    // -- that entry is gone before the swing it pays for is even asked for. `heals` is a run
    // total like `dmg`, and it is the only place the scythe's harvest shows up as a number.
    momo: 0, heals: 0,
    // Gear. `equip` is one slot per entry in GEAR_SLOTS, `bag` is the hành trang, and `gs`
    // is the aggregate every gear-aware line reads -- all zeroes here, so a fresh run is
    // numerically identical to a run from before gear existed. `newGear` is a badge count
    // for the shell, not state the sim reads.
    equip: { helmet: null, armor: null, gloves: null, pants: null, boots: null },
    bag: [], newGear: 0, loot: 0, gs: gearSum(null),
    // Món đang nằm trên sàn, và cú nháy sáng của lần nhặt gần nhất (xem `spawnOrb`). `orbs` là
    // danh sách của sim -- nó mang món thật, không phải hiệu ứng -- nên nó ở đây chứ không trong
    // `fxs`; `got`/`gotR` chỉ là một cái đồng hồ đếm ngược cho render.
    orbs: [], got: 0, gotR: null,
    // Cánh cổng boss và phòng boss (xem js/gate.js). `gate` là cánh cổng đang mở -- có đúng một
    // cái hoặc không có cái nào; `room` là hình chữ nhật của phòng đấu khi đang ở trong, và
    // `null` khi đang ở ngoài map lớn; `ret` giữ chỗ đứng cũ để lúc ra còn biết trả về đâu.
    gate: null, room: null, ret: null, flash: 0,
  };
  roomApply(w);
  snapCam(w);
  w.aim.x = w.hero.x + 60; w.aim.y = w.hero.y - 20;
  for (let i = 0; i < 7; i++) spawnFoe(w, true);
  return w;
}

// The world is 8x8 screens, so spawning on a world edge would mean nothing ever arrives.
// Fresh targets appear on an ellipse just outside the viewport instead: they walk in
// from off screen, which is also the only spawn that cannot pop into view.
function spawnFoe(w, near) {
  if (w.foes.length >= 14) return;
  const kind = pickKind(w.rng);
  const h = w.hero, ang = w.rng.range(0, TAU);
  const rad = near ? w.rng.range(0.22, 0.42) : w.rng.range(0.62, 0.95);
  const x = clamp(h.x + Math.cos(ang) * W * rad, BOUND.x0, BOUND.x1);
  const y = clamp(h.y + Math.sin(ang) * H * rad, BOUND.y0, BOUND.y1);
  // never drop a fresh target on top of the player
  if (Math.hypot(x - h.x, y - h.y) < 46) return;
  w.foes.push(unit(kind, x, y));
}

// Enemy flash is capped at 0.55: above that a hit enemy is just a white blob and you
// cannot tell what you hit. Poison/freeze use `dim` instead of flash for the same reason.
//
// Gear scales the hero's output *here* rather than at the twenty-odd call sites: `phys`
// marks the two weapon paths, which take +ATK, and everything else -- all sixteen skills
// and every tick of every field -- takes +Magic ATK. Cả hai là số phẳng cộng thẳng vào cú
// đánh, nên "+18 ATK" nghĩa đúng là cú đó đau thêm 18. Ở mức 0 thì cộng 0, nên những con số
// tools/check-weapons.js chốt cứng không xê dịch.
//
// Hệ quả phải biết: cộng phẳng *mỗi cú* nên một chiêu đánh bốn nhịp ăn bốn lần. `ember_field`
// (4 nhịp) và `gang` (5 hit một chiêu) hưởng lợi gấp mấy lần `judgment_beam` (một cú 430) hay
// `khien` (2 hit). Đó là cách đọc thẳng của "cộng theo số"; lo/hi trong js/gear.js được hạ
// xuống cho vừa cỡ đòn thật vì thế.
//
// Sát thương không phải một con số cố định: mỗi cú quay trong khoảng ±`w.vary` quanh giá trị
// trong bảng, nên một chiêu thả vào một đám cho ra bốn con số khác nhau chứ không phải một
// con số nhân bốn. Quay trên `w.rng` -- dòng của sim, không phải dòng trang trí -- vì sát
// thương quyết định ai chết, và một trận phải dựng lại được từ seed của nó.
const DMG_VARY = 0.15;
// Chí mạng: *một* tỷ lệ, cho tất cả. Vũ khí, mười sáu chiêu, mỗi nhịp của mỗi vùng -- tất cả
// đi qua đúng một lần quay ở đây, nên con số trong bảng trạng thái là con số thật của mọi cú
// đánh. Trước đây không phải thế: nhịp kết của một combo *luôn* được tính là chí mạng, nên tỷ
// lệ ghi 0% mà đánh thường vẫn nổ chí mạng. Nhịp kết giờ chỉ còn là nhịp kết (`fin` trong
// js/weapon.js: nó mở cửa sổ chuỗi, nó hút máu, nó xử trảm) và chí mạng là chuyện của con số.
//
// Nhân vật có sẵn 15% chí mạng và +50% sát thương chí mạng. Phải có cả hai: một tỷ lệ nền mà
// không có mức sát thương nền thì cú chí mạng đầu tiên của một người chơi chưa có trang bị chỉ
// đổi màu con số chứ không đau hơn một điểm nào, và đó là một lời hứa suông.
const CRIT_BASE = 15, CRIT_BASE_D = 50;
// Màu của con số chí mạng. Cố định, không theo màu chiêu: "đây là chí mạng" phải đọc được mà
// không cần biết chiêu nào vừa đánh, nên lõi luôn là trắng-vàng nóng và viền luôn là đỏ sẫm.
// Màu của chiêu vẫn còn, ở quầng sáng phía sau (xem drawCritNum trong js/render.js).
const CRIT_C = hexc('#fff3bd');
const CRIT_KEY = hexc('#8e1f05');
function hurt(w, f, amount, col, crit, kx, ky, phys) {
  if (f.dying) return;
  const gs = w.gs;
  if (gs) amount += phys ? gs.atk : gs.mag;
  // Khoảng ngẫu nhiên áp lên tổng, *sau* khi cộng trang bị: +30 ATK phẳng dao động cùng cú
  // đánh nó thuộc về, chứ không thành một cục cứng gắn thêm ở cuối. Trước hệ số chí mạng, để
  // một cú chí mạng vẫn đúng là cú thường nhân lên.
  if (w.vary > 0) amount *= w.rng.range(1 - w.vary, 1 + w.vary);
  // Đúng một lần quay chí mạng, cho mọi đường sát thương. `crit` truyền vào là đường *buộc*
  // chí mạng: không call site nào trong game dùng nó nữa, nó còn lại để harness đo được riêng
  // phần nhân sát thương mà không phải chờ xác suất. Quay trên `grng` -- dòng của trang bị và
  // rơi đồ -- nên may mắn chí mạng không xê dịch một trận dựng lại từ seed của nó.
  //
  // `w.crit`/`w.critd` là hai trường của trận chứ không phải hai hằng đọc trực tiếp, đúng theo
  // lối của `w.vary`: ba harness pin số cứng đặt chúng về 0 rồi đo lại phần của trang bị.
  const rate = w.crit + (gs ? gs.crit : 0);
  if (!crit && rate > 0 && w.grng() * 100 < rate) crit = true;
  const cdm = w.critd + (gs ? gs.critd : 0);
  if (crit && cdm > 0) amount *= 1 + cdm / 100;
  amount = Math.round(amount);
  f.hp -= amount;
  f.flash = Math.min(0.55, f.flash + (crit ? 0.55 : 0.45));
  if (kx || ky) { f.vx += (kx || 0) / f.mass; f.vy += (ky || 0) / f.mass; }
  // Một cú chí mạng còn giật màn hình một nhịp ngắn. Đủ để tay cảm thấy, không đủ để một chuỗi
  // đánh thường thành rung liên tục -- `Math.max` nên nó không cộng dồn với cái đang có.
  if (crit) w.shake = Math.max(w.shake, 2.4);
  // `cx` là *tâm* con số, không phải biên trái: con số chí mạng đổi cỡ theo từng khung (nó nảy
  // vào), nên biên trái chỉ tính được lúc vẽ. Cả năm chỗ đẩy vào `w.nums` đều dùng tâm.
  const s = String(amount) + (crit ? '!' : '');
  w.nums.push({ s, cx: f.x, y: Math.round(f.y - f.h - 5), crit: crit || false,
                col: crit ? CRIT_C : (col || hexc('#ffd98a')), glow: col || CRIT_C,
                t: 0, life: crit ? 1.15 : 0.8 });
  w.dmg += amount;
  // Sound is placed here rather than at the call sites so every one of the 16 skills,
  // and every tick of a damage-over-time field, is heard the same way.
  const pan = clamp((f.x - w.cam.x - W * 0.5) / (W * 0.5), -1, 1);
  if (f.hp <= 0) { f.hp = 0; f.dying = 0.001; SFX.die(pan); }
  else SFX.hit(amount, crit, pan);
}

// The one place HP goes back up. It uses the same floating number as damage does, in green
// and over the hero, because a heal you cannot see is a heal the player will not build
// around -- and the 3x5 font has digits but no letters, so the colour has to carry the
// meaning on its own. Returns what was actually restored, which is 0 at full HP: a caller
// that wants to gate on "did this do anything" should read the return, not the argument.
const HEAL_C = hexc('#7ef2a0');
function healHero(w, amount) {
  const h = w.hero;
  amount = Math.min(Math.round(amount), Math.round(h.maxhp - h.hp));
  if (amount <= 0) return 0;
  h.hp += amount; w.heals += amount;
  const s = String(amount);
  w.nums.push({ s, cx: h.x, y: Math.round(h.y - h.h - 6),
                col: HEAL_C, t: 0, life: 0.8 });
  return amount;
}

// Incoming damage multiplier from +DEF. The usual `100 / (100 + def)` curve: it never
// reaches zero however much armour is stacked, and at DEF 0 it is exactly 1, so a bare run
// takes exactly the damage tools/check-boss.js measures.
function defMul(w) { return 100 / (100 + w.gs.def); }

function foesIn(w, x, y, r) {
  const out = [];
  for (const f of w.foes) {
    if (f.dying) continue;
    const dx = f.x - x, dy = midY(f) - y;
    if (Math.hypot(dx, dy) <= r + f.w * 0.35) out.push(f);
  }
  return out;
}

function hitCircle(w, x, y, r, amount, col, crit, kb) {
  const list = foesIn(w, x, y, r);
  for (const f of list) {
    const a = Math.atan2(midY(f) - y, f.x - x);
    hurt(w, f, amount, col, crit, Math.cos(a) * (kb || 0), Math.sin(a) * (kb || 0) * 0.5);
  }
  return list.length;
}

function hitLine(w, x0, y0, x1, y1, thick, amount, col, crit, kb) {
  const px = x1 - x0, py = y1 - y0, ln2 = Math.max(px * px + py * py, 1e-6);
  const ang = Math.atan2(py, px);
  for (const f of w.foes) {
    if (f.dying) continue;
    const t = clamp(((f.x - x0) * px + (midY(f) - y0) * py) / ln2, 0, 1);
    const dx = f.x - x0 - t * px, dy = midY(f) - y0 - t * py;
    if (Math.hypot(dx, dy) <= thick + f.w * 0.35)
      hurt(w, f, amount, col, crit, Math.cos(ang) * (kb || 0), Math.sin(ang) * (kb || 0) * 0.5);
  }
}

// Fires once when progress crosses `at`, so a hit lands on the frame the VFX peaks
// even if the frame rate changes underneath it.
// Cone in front of `ang`, measured from the hero. `arc_` is the half-width tolerance, the
// same convention test.html uses (`|diff| > arc` rejects), which is deliberately more
// forgiving than the crescent looks -- a swing that visibly passes through something has
// to hurt it. Angles use the unsquashed frame (dy / SWING_SQ) so a hit sideways and a hit
// downwards need the same aim, matching how `arc()` decides which pixels it lights.
//
// `opt` carries the riders a weapon's identity needs and a skill never does: `amp(f)` adds
// per-target damage the cone itself cannot know (the saber reads how wounded the target
// already is), `onHit(f)` runs a side effect that is not damage at all (the gauntlet snuffs
// a telegraph), and `phys` marks the cone as a weapon swing so gear scales it by +ATK
// instead of +Magic ATK. All three are optional.
function hitCone(w, x, y, ang, range, arc_, amount, col, crit, kb, opt) {
  const amp = opt && opt.amp, onHit = opt && opt.onHit, phys = opt && opt.phys;
  let n = 0;
  for (const f of w.foes) {
    if (f.dying) continue;
    const dx = f.x - x, dy = (midY(f) - y) / SWING_SQ;
    const d = Math.hypot(dx, dy);
    if (d > range + f.w * 0.35) continue;
    if (d > 1e-3) {
      let da = Math.atan2(dy, dx) - ang;
      da = Math.abs(((da + Math.PI) % TAU + TAU) % TAU - Math.PI);
      // Close in, a fixed cone would miss a foe standing on top of you; widen it by the
      // angle its own body subtends so contact range never feels like a whiff.
      if (da > arc_ + Math.atan2(f.w * 0.5, Math.max(d, 1))) continue;
    }
    const a = Math.atan2(midY(f) - y, f.x - x);
    hurt(w, f, amount + (amp ? amp(f) : 0), col, crit,
         Math.cos(a) * (kb || 0), Math.sin(a) * (kb || 0) * 0.5, phys);
    if (onHit) onHit(f);
    n++;
  }
  return n;
}

function crossed(e, at) { return e.pt < at && e.p >= at; }
function cast(w, i, tx, ty) {
  const sk = SKILLS[i];
  if (!sk || w.cds[i] > 0) return false;
  const h = w.hero;
  // Mana is checked with the cooldown and paid at the end, so a refused cast costs nothing
  // and the shell's one `else SFX.blocked()` branch covers both reasons without asking why.
  const cost = sk.mp || 0;
  if (h.mp < cost) return false;
  const e = { sk: sk, i: i, t: 0, dur: sk.dur, p: 0, pt: 0,
              seed: w.rng.int(1, 1e9) | 0, ox: h.x, oy: h.y - h.h * 0.5, data: {} };
  if (sk.mode === 'self') { e.x = h.x; e.y = h.y; }
  else { e.x = clamp(tx, BOUND.x0 - 18, BOUND.x1 + 18);
         e.y = clamp(ty, BOUND.y0 - 16, BOUND.y1 + 10); }
  e.ang = Math.atan2(e.y - h.h * 0.5 - e.oy, e.x - e.ox);
  if (sk.init) sk.init(w, e);
  w.fxs.push(e);
  w.cds[i] = sk.cd;
  h.mp = Math.max(0, h.mp - cost);
  w.shake = Math.max(w.shake, sk.shake || 0);
  h.flip = e.x < h.x;
  return true;
}

function step(w, dt, inp) {
  w.t += dt; w.frame++;
  const h = w.hero;
  let moved = 0;
  if (inp) { w.aim.x = inp.ax; w.aim.y = inp.ay; }
  // Which weapon owns the hero this frame, resolved *before* he moves. A weapon that plants
  // him has to plant him on the very frame the swing starts, and `swing()` pushed that entry
  // before this step ran -- `w.sw` further down is only refreshed after the fx are advanced,
  // which is one frame too late to hold the legs still.
  let live = null;
  for (const e of w.fxs) if (e.wp) live = e;
  const plant = live && live.wp.plant !== undefined ? live.wp.plant : 1;
  if (h.dsh > 0) {
    // A dash owns the hero while it runs: WASD is read but not obeyed, and the clamp is
    // the same one walking uses, so a dash into the wall stops at the wall instead of
    // teleporting through it. `moved` stays 0 -- the legs hold the launch pose rather
    // than sprinting through four frames of walk cycle in a sixth of a second.
    const s = Math.min(dt, h.dsh);
    h.x = clamp(h.x + h.dvx * s, BOUND.x0, BOUND.x1);
    h.y = clamp(h.y + h.dvy * s, BOUND.y0, BOUND.y1);
    h.dsh -= dt;
    if (w.crng() < 22 * dt) footPuff(w, h, true);
  } else if (inp) {
    let dx = inp.dx, dy = inp.dy;
    const l = Math.hypot(dx, dy);
    if (l > 0) {
      dx /= l; dy /= l;
      // 56 across and 42 down: the same squashed ratio the art is drawn in, so a diagonal
      // reads as a diagonal. +Move Speed is a factor on both, and it is exactly 1 bare.
      const ms = 1 + w.gs.mspd / 100;
      const px = h.x, py = h.y;
      h.x = clamp(h.x + dx * 56 * plant * ms * dt, BOUND.x0, BOUND.x1);
      h.y = clamp(h.y + dy * 42 * plant * ms * dt, BOUND.y0, BOUND.y1);
      moved = Math.hypot(h.x - px, h.y - py);
    }
  }
  if (inp) h.flip = w.aim.x < h.x;
  // The walk cycle is driven by distance covered, not by time: at a wall the hero
  // stops moving and the legs stop with him instead of running on the spot.
  h.mv = moved > 1e-6 ? 1 : 0;
  if (h.mv) {
    h.it = 0;
    const was = Math.floor(h.ph);
    h.ph = (h.ph + moved / 5.5) % 4;
    if (Math.floor(h.ph) !== was) footPuff(w, h);
  } else { h.it += dt; }
  h.fi = h.mv ? Math.floor(h.ph) & 3 : Math.floor(h.it * 1.7) & 1;
  h.flash = Math.max(0, h.flash - dt * 3);
  if (h.inv > 0) h.inv = Math.max(0, h.inv - dt);
  for (let i = 0; i < 16; i++) if (w.cds[i] > 0) w.cds[i] = Math.max(0, w.cds[i] - dt);
  if (w.wcd > 0) w.wcd = Math.max(0, w.wcd - dt);
  if (w.dcd > 0) w.dcd = Math.max(0, w.dcd - dt);
  // The sword's window runs on wall time and not on swings, so hesitating is what closes
  // it -- which is the entire question the weapon asks.
  if (w.momo > 0) w.momo = Math.max(0, w.momo - dt);
  // Mana refills on its own: the cost is meant to price a rotation, not to strand a run.
  // HP regen is gear-only and starts at zero, so a bare run heals exactly as much as it
  // always did -- nothing, unless the scythe harvests it. The `/5` is the spec's unit:
  // the stat lines read "per 5s" but the bars have to move every frame.
  if (h.mp < h.maxmp) h.mp = Math.min(h.maxmp, h.mp + (MP_REGEN + w.gs.mpr / 5) * dt);
  if (w.gs.hpr > 0 && h.hp > 0) h.hp = Math.min(h.maxhp, h.hp + w.gs.hpr / 5 * dt);

  for (const e of w.fxs) {
    e.pt = e.p; e.t += dt; e.p = c01(e.t / e.dur);
    if (e.sk.hit) e.sk.hit(w, e);
  }
  for (let i = w.fxs.length - 1; i >= 0; i--) if (w.fxs[i].t >= w.fxs[i].dur) w.fxs.splice(i, 1);
  // Monster casts advance before the monsters do, so a telegraph that has just fired
  // hits the hero where he was standing this frame and not one frame of movement later.
  // `danger` is recounted from scratch every frame -- it is what the hero's own warning
  // ring and the HUD read, and a stale count would leave a ring on screen forever.
  w.danger = 0;
  for (let i = w.tels.length - 1; i >= 0; i--) stepTel(w, w.tels[i], dt, i);
  // The live swing, cached for the frame: the held weapon and the hero's attack pose both
  // need it, and neither wants to walk `fxs` looking for the one entry that has a weapon.
  // Gauntlets recover (0.46s) just before their sheet ends (0.47s), so two can briefly
  // overlap -- the newest wins, which is the one the player just asked for.
  w.sw = null;
  for (const e of w.fxs) if (e.wp) w.sw = e;
  h.atk = w.sw ? heldPose(w.sw.wp, w.sw.p).t : -1;

  for (let i = w.foes.length - 1; i >= 0; i--) {
    const f = w.foes[i];
    f.flash = Math.max(0, f.flash - dt * 2.6);
    if (f.slow > 0) f.slow -= dt;
    if (f.frozen > 0) f.frozen -= dt;
    // Chồng vết xé hết hạn thì mất **cả chồng**, không rụng từng cái. Rụng dần nghĩa là con số
    // sát thương tụt xuống ngay trong lúc người chơi vẫn đang cào đúng con đó, còn câu phải đọc
    // ra là "bỏ nó ra là mất hết" -- một cái hạn chót, không phải một cái đồng hồ chạy nền.
    if (f.rndT > 0 && (f.rndT -= dt) <= 0) { f.rndT = 0; f.rnd = 0; }
    if (f.dying) {
      f.dying += dt;
      if (f.dying > 0.30) {
        w.foes.splice(i, 1); w.kills++;
        // Loot lands on the frame the body is cleared, so a foe cannot pay out twice. A boss
        // always drops and bends the rarity weights up: `bossGate` has usually already let
        // go of `w.boss` by now, so the kind list is what identifies one. Chỗ rơi là *giữa
        // người* con quái, không phải chân nó: món bật ra từ trong xác, nên nó phải bắt đầu ở
        // chỗ cái xác vừa đứng.
        dropLoot(w, BOSS_KINDS.indexOf(f.kind) >= 0, f.x, f.y - f.h * 0.34);
      }
      continue;
    }
    stepFoe(w, f, dt);
  }
  for (let i = w.nums.length - 1; i >= 0; i--) {
    const n = w.nums[i];
    // Chí mạng bay lên nhanh hơn: nó to gấp đôi, nên nếu trôi cùng tốc độ thì nó nằm đè lên
    // những con số thường bật ra sau nó.
    n.t += dt; n.y -= dt * (n.crit ? 18 : 13);
    if (n.t >= n.life) w.nums.splice(i, 1);
  }
  for (let i = w.puffs.length - 1; i >= 0; i--) {
    const p = w.puffs[i];
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += dt * 6;
    if (p.t >= p.life) w.puffs.splice(i, 1);
  }
  // Món trên sàn. Sau `nums` và `puffs` vì nó cùng loại việc (một danh sách tự bước rồi tự dọn),
  // nhưng *sau* khối quái ở trên: một con vừa chết ở khung này thì món của nó bay ngay khung này,
  // không phải khung sau.
  for (let i = w.orbs.length - 1; i >= 0; i--) stepOrb(w, w.orbs[i], dt, i);
  if (w.got > 0) w.got = Math.max(0, w.got - dt);
  w.spawnT -= dt;
  // The crowd thins out while a boss is up. Four overlapping telegraphs plus a full spawn rate
  // is not a harder fight, it is an unreadable one -- and the boss is the thing worth reading.
  //
  // Inside the boss room nothing spawns at all: the room is a duel, and a trickle of trash
  // walking in through a wall the hero cannot walk through would read as a bug.
  if (w.spawnT <= 0) { if (!w.room) spawnFoe(w); w.spawnT = w.boss ? 3.6 : 1.05; }
  bossGate(w);
  stepGate(w, dt);
  w.shake = Math.max(0, w.shake - dt * 22);
  // Weather. Stepped on the cosmetic stream and around the *current* camera, before the
  // camera moves below -- one frame of lag on a snowflake is not a thing anyone can see,
  // and doing it here keeps the particle list out of the seeded sim entirely.
  if (MAPDEF.ambStep) MAPDEF.ambStep(ambArg(w, dt));

  // Camera last, so it follows where the hero actually ended up. Exponential lerp
  // (frame-rate independent) with a clamp, so the view never leaves the world.
  const ct = camTarget(w), k = 1 - Math.exp(-dt * 11);
  w.cam.x = camClampX(w.cam.x + (ct.x - w.cam.x) * k);
  w.cam.y = camClampY(w.cam.y + (ct.y - w.cam.y) * k);
}
// Footfall dust: 20 particles maximum, on the cosmetic RNG stream so it can never
// shift a seeded outcome. `quiet` is the dash trail -- same dust, no footstep voice,
// because a slide is one sound and not three steps.
function footPuff(w, h, quiet) {
  if (!quiet) SFX.step();
  if (w.puffs.length >= 20) return;
  w.puffs.push({ x: h.x + w.crng.range(-3, 3), y: h.y - w.crng.range(0, 1.4),
                 vx: w.crng.range(-7, 7), vy: w.crng.range(-9, -3),
                 t: 0, life: w.crng.range(0.20, 0.34), r: w.crng.range(0.7, 1.5) });
}
function stepFoe(w, f, dt) {
  const h = w.hero;
  const K = KIND[f.kind];
  if (f.acd > 0) f.acd = Math.max(0, f.acd - dt);
  if (f.rel > 0) f.rel = Math.max(0, f.rel - dt);
  if (!f.tel && f.acd <= 0 && f.frozen <= 0) tryCast(w, f);
  // A monster winding up is planted: the mark on the floor is a promise about where the
  // hit lands, and a caster that kept walking would break it. Knockback still moves it,
  // which is why hitting a caster is worth doing -- it can be shoved out of its own blast.
  const casting = !!f.tel;
  f.chg = casting ? c01(f.tel.t / f.tel.ab.tell) : Math.max(0, f.chg - dt * 5);
  // A boss stays planted through its release pose too. The recoil is authored as a held frame,
  // so letting it walk out of the slam would animate a slide instead of a follow-through.
  const held = casting || f.rel > 0;
  let ax = 0, ay = 0;
  if (f.frozen <= 0 && !held) {
    const dx = h.x - f.x, dy = (h.y - 1) - f.y, d = Math.max(Math.hypot(dx, dy), 1e-3);
    const spd = f.spd * (f.slow > 0 ? 0.34 : 1);
    // Ranged kinds hold a band instead of closing: outside it they advance, inside it
    // they back off, and in the band they stand and shoot.
    let want = 1;
    // The band is measured in the *unsquashed* distance, the same one tryCast compares against
    // `range`, and not in the screen distance the steering above uses. They differ by 2x
    // vertically (GSQ), so a caster that held a screen-space band of 108 while standing above
    // the hero would be 216 away as far as its own beam is concerned -- parked exactly where
    // nothing it owns can reach. A stand-off distance only means anything in the space the
    // attacks it is standing off for are measured in.
    if (K.keep) {
      const dq = Math.hypot(dx, dy / GSQ);
      want = dq > K.keep * 1.15 ? 1 : (dq < K.keep * 0.78 ? -1 : 0);
    }
    ax = dx / d * spd * want; ay = dy / d * spd * 0.72 * want;
    f.flip = dx < 0;
    for (const o of w.foes) {              // light separation so they do not stack
      if (o === f || o.dying) continue;
      const ox = f.x - o.x, oy = (f.y - o.y) * 1.6, od = Math.hypot(ox, oy);
      if (od < 9 && od > 1e-3) { ax += ox / od * 14; ay += oy / od * 9; }
    }
  }
  const px = f.x, py = f.y;
  f.x = clamp(f.x + (ax + f.vx) * dt, BOUND.x0, BOUND.x1);
  f.y = clamp(f.y + (ay + f.vy) * dt, BOUND.y0, BOUND.y1);
  const k = Math.exp(-dt * 7);
  f.vx *= k; f.vy *= k;
  // Same rule as the hero: cycle speed comes from ground covered. A frozen or
  // separated-but-stuck foe idles instead of pedalling, and so does one mid-cast --
  // knockback drift must not make a planted monster look like it is walking.
  const d = Math.hypot(f.x - px, f.y - py);
  f.mv = (f.frozen > 0 || held) ? 0 : d / Math.max(dt, 1e-4);
  f.ph = (f.ph + (f.mv > 0.4 ? d / K.cyc : dt * 1.6)) % 4;
  // Contact damage is a drain, not a hit, so it does not go through hitHero -- but the
  // dash's i-frames still have to cover it, or dashing *through* a pack would cost more
  // than walking around it and the dodge would be a trap.
  if (!w.god && f.frozen <= 0 && h.inv <= 0) {
    if (Math.hypot(f.x - h.x, (f.y - h.y) * 1.5) < 9) {
      // The saber's guard covers the drain too. It plants the hero in the middle of whatever
      // he swung at, so mitigating only the telegraphed hits would make the trade a lie.
      const g = w.sw && w.sw.wp.guard ? w.sw.wp.guard : 1;
      // +DEF softens the drain by the same curve it softens a telegraphed hit by (see
      // `hitHero`), so armour is not quietly worthless against the thing that touches you
      // most often. `defMul` is exactly 1 at DEF 0.
      h.hp = Math.max(0, h.hp - 22 * g * defMul(w) * dt);
      h.flash = Math.min(0.6, h.flash + dt * 3);
      SFX.hurt();
    }
  }
}

function pullToward(w, x, y, r, force, dt) {
  for (const f of w.foes) {
    if (f.dying || f.frozen > 0) continue;
    const dx = x - f.x, dy = y - midY(f), d = Math.hypot(dx, dy);
    if (d > r || d < 1e-3) continue;
    const g = force * (1 - d / r) * dt;
    f.x += dx / d * g / f.mass;
    f.y += dy / d * g * 0.6 / f.mass;
  }
}

// Nearest n living foes to a point -- chain/ricochet targeting.
function nearest(w, x, y, n, maxr) {
  const list = w.foes.filter(f => !f.dying &&
      Math.hypot(f.x - x, midY(f) - y) <= (maxr || 1e9));
  list.sort((a, b) => Math.hypot(a.x - x, midY(a) - y) - Math.hypot(b.x - x, midY(b) - y));
  return list.slice(0, n);
}
