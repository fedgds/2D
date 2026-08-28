"use strict";
// ===========================================================================
// 6c. Bosses. Three of them, one per arena, and every part of a boss exists to answer a
//     question the six normal monsters never ask: *this* fight is the fight, so it has to
//     stay readable for a minute instead of for one telegraph.
//
//       * bigger, and bigger in a way that survives 16 colours: 21x24 down to 19x25
//         against a 13x15 brute, with the extra pixels spent on a silhouette you can name
//         at a glance -- horns, crown, hood -- rather than on more of the same body;
//       * real cast frames. A normal monster winds up by glowing from inside, which is
//         plenty for 0.8 s. A boss holds the pose for 1.3 s, so it gets three authored
//         ones -- wind-up, gather, release -- and the release outlives the hit (`rel`, set
//         in 6b) so the recoil is still on screen while the floor is going off;
//       * four moves each, picked at random from the ones that can reach you instead of
//         first-match down a list: a boss that always opens with its longest reach is a
//         boss you solve once.
//
//     Everything else is deliberately *not* special. Bosses walk with stepFoe, take damage
//     through hurt, and open their casts with the same startCast/stepTel a slime uses, so
//     freezing one still cancels its wind-up and shoving one still moves it out of its own
//     blast. A boss is a monster with more pixels and better manners, not a second engine.
// ===========================================================================

// Six new material pairs. Not one of these chars appears in sprites.js's own table, in any
// arena's eight (D d P p Q q Z z), or in the sentinel's grid, so applyMap can never repaint
// a boss when the floor changes underneath it.
{
  const raw = {
    u: '#ffd35c', U: '#e0641c',                 // magma: the hot seam, and the cooling crust
    n: '#5a4a52', N: '#33272e',                 // scorched iron, mid and dark
    y: '#dff2ff', Y: '#8fc4e8',                 // rime highlight, and ice body
    j: '#3a6f9e', J: '#1b2a44',                 // deep ice, and the abyss under a hem
    m: '#d8c4ff', h: '#8f6ad6', H: '#4a2f7a',   // void violet, three steps
    s: '#ff8090',                               // the only pink in the game: a blood sigil
  };
  for (const k in raw) PAL[k] = hexc(raw[k]);
}

// 21x24. A titan: the horns read before the body does, which is the whole job of a
// silhouette at this size. Magma is confined to the chest, belt and hooves -- spread over
// the whole body it stops being cracks and becomes a colour.
const FORGELORD = [
  "...KK...........KK...", "..KOOK.........KOOK..", "..KOoK.........KOoK..",
  "...KOoK.......KOoK...", ".....KKKKKKKKKKK.....", "....KNNNNNNNNNNNK....",
  "....KNuuNNNNNuuNK....", "....KNNNNNNNNNNNK....", ".....KNOOOOOOONK.....",
  "...KKKNNNNNNNNNKKK...", ".KKnnnNNNNNNNNNnnnKK.", "KnnnKNuUUUUUUUuNKnnnK",
  "KnnnKNUuuuuuuuUNKnnnK", "KnnnKNNuUUUUUuNNKnnnK", ".KnnKNNNuUUUuNNNKnnK.",
  ".KnnKNNNNuuuNNNNKnnK.", "KnnnK.KNNNNNNNK.KnnnK", "KnnnK.KUUUUUUUK.KnnnK",
  ".KKK..KNNNNNNNK..KKK.", "......KNNNKNNNK......", ".....KNNNNKNNNNK.....",
  ".....KNnnNKNnnNK.....", "....KNNNNK.KNNNNK....", "....KKKKK...KKKKK....",
];
// 19x26, and the only thing in the game with no legs at all: a crown over a robe that
// never touches the floor. It is the tallest sprite here on purpose -- the frostking
// fights at range, so it has to be findable across a screen it is not walking towards.
const FROSTKING = [
  ".........y.........", "......y..y..y......", ".....KyKKyKKyK.....",
  "...KyyyyyyyyyyyK...", "...KYYYYYYYYYYYK...", "....KKKKKKKKKKK....",
  "....KjjjjjjjjjK....", "....KjyyjjjyyjK....", "....KjjjjjjjjjK....",
  ".....KjjjjjjjK.....", "..KKKYYYYYYYYYKKK..", ".KYYYYYYYYYYYYYYYK.",
  "KYYyYjjjjyjjjjYyYYK", "KYyYjjjjjyyyjjjjjYK", "KYYjjjjjyyyyyjjjjYK",
  ".KYjjjjjjyyyjjjjjK.", ".KYjjjjjjjyjjjjjjK.", ".KjjjjjjjjjjjjjjjK.",
  "..KjjjjjjjjjjjjjK..", "..KjJJJJJJJJJJJjK..", "..KjJJJJJJJJJJJjK..",
  ".KjJJJJJJJJJJJJJjK.", ".KjJJJJJJJJJJJJJjK.", "KjJJJJJJJJJJJJJJJjK",
  "KjJJJKJJJJJKJJJJJjK", ".KKK.KKKKKKKKK.KKK.",
];
// 19x25. A hood with nothing inside it but a bone mask, and the one pink pixel cluster in
// the game sitting on its chest: the sigil is where three of its four moves come from, so
// it is drawn as a part of the body rather than as an effect stuck on top of one.
const VOIDHERALD = [
  "........KKK........", ".......KHHHK.......", "......KHHHHHK......",
  ".....KHHHHHHHK.....", "....KHHhhhhhHHK....", "...KHHhOOOOOhHHK...",
  "...KHhOOEOEOOhHK...", "...KHhOoOOOoOhHK...", "...KHhhOoOoOhhHK...",
  "....KHHhOOOhHHK....", "..KKHHHhhhhhHHHKK..", ".KHHhhhhhhhhhhhHHK.",
  "KHHhhhhhmsmhhhhhHHK", "KHhhhhhmsssmhhhhhHK", "KHhhhhhhmsmhhhhhhHK",
  ".KHhhhhhhmhhhhhhHK.", ".KHHhhhhhhhhhhhHHK.", "..KHHhhhhhhhhhHHK..",
  "..KHHHhhhhhhhHHHK..", "...KHHHhhhhhHHHK...", "...KHHHHhhhHHHHK...",
  "....KHHHHhHHHHK....", "....KHHHHHHHHHK....", ".....KHHHKHHHK.....",
  "......KKK.KKK......",
];
GRIDS.forgelord = FORGELORD; GRIDS.frostking = FROSTKING; GRIDS.voidherald = VOIDHERALD;

// ---- animation --------------------------------------------------------------
// Two more rig verbs, because a cast pose is not a walk pose. `liftPart` moves a box by
// exactly one pixel and only upward, which is a foot leaving the floor; an arm travelling
// from over the head to the ground covers three or four, and it has to clear the rows it
// came from -- duplicating an edge row the way liftRows does would smear the limb into a
// column. `recol` repaints inside a box without touching the silhouette, which is how heat
// builds in a chest and how a sigil lights up: the shape is the character, the colour is
// the charge.
function shiftBox(rs, r0, r1, c0, c1, dy) {
  const src = rs.map(r => r.slice());
  for (let y = r0; y <= r1; y++)
    for (let c = c0; c <= c1; c++) {
      const sy = y - dy;
      rs[y][c] = (sy >= r0 && sy <= r1) ? src[sy][c] : '.';
    }
}
function recol(rs, r0, r1, c0, c1, from, to) {
  for (let y = r0; y <= r1; y++)
    for (let c = c0; c <= c1; c++) if (rs[y][c] === from) rs[y][c] = to;
}
{
  // Forgelord. Legs are cols 4-9 and 11-16 of rows 19-23 (col 10 is the shared outline),
  // arms are cols 0-4 and 16-20 of rows 11-18, and the chest magma is rows 11-15.
  const fstep = right => {
    const rs = rows(FORGELORD);
    liftPart(rs, 19, 23, right ? 11 : 4, right ? 16 : 9);
    return grid(rs);
  };
  const fhunch = () => { const rs = rows(FORGELORD); liftRows(rs, 4, 9, 1); return grid(rs); };
  const fbreathe = () => { const rs = rows(FORGELORD); liftRows(rs, 10, 18, -1); return grid(rs); };
  // The three cast poses. Arms up two, arms up four with the chest at full heat, then both
  // arms three pixels *below* where they started and the belt blown open: read as a strip,
  // that is a lift, a hold and a slam, and it is the slam frame that has to still be there
  // when the floor cracks -- hence `rel`.
  //
  // Both heat steps push the chest *up its own two-tone pattern* rather than filling it with
  // one colour, and the order of the two recols is the whole reason it works: brighten the
  // seams first, then warm the iron into the colour the seams just left. Doing it the other
  // way round -- iron to crust, then all crust to seam -- ends with every cell equal to 'u',
  // and a boss whose chest is a flat yellow rectangle at full charge does not read as charging.
  // It reads as a missing sprite.
  const farms = (dy, hot) => {
    const rs = rows(FORGELORD);
    shiftBox(rs, 11, 18, 0, 4, dy); shiftBox(rs, 11, 18, 16, 20, dy);
    if (hot > 1) {
      recol(rs, 11, 15, 5, 15, 'U', 'u');        // seams: crust → white-hot
      recol(rs, 11, 15, 5, 15, 'N', 'U');        // iron: cold → crust
      recol(rs, 5, 7, 5, 15, 'N', 'n');          // and the heat reaches the collar
    } else if (hot > 0) recol(rs, 11, 15, 5, 15, 'N', 'U');
    if (hot < 0) recol(rs, 16, 21, 4, 16, 'N', 'U');
    return grid(rs);
  };
  ANIM.forgelord = {
    walk: [fr(fstep(false), 0), fr(FORGELORD, -1), fr(fstep(true), 0), fr(fhunch(), -1)],
    idle: [fr(FORGELORD, 0), fr(fbreathe(), 0)],
    cast: [fr(farms(-2, 1), 0), fr(farms(-4, 2), -1), fr(farms(3, -1), 1)],
  };
  // Frostking. Nothing to step with, so the cycle is the hem swaying under a body that
  // rides up and down two pixels, and the cast is the robe turning from deep ice to rime
  // from the chest outward -- the charge travels *down* the robe and out of the hem.
  //
  // The second step grows the rime diamond by a ring instead of flooding the robe: the robe
  // reaching one row further down is the charge travelling, and the diamond swelling is the
  // charge arriving, and both stay readable because the body underneath is still one step
  // darker than they are. A robe repainted entirely in rime has nothing left to travel across.
  //
  // It also lifts the top two rows of the hem out of the abyss colour by exactly one step, and
  // stops there: rows 21-25 stay dark so the release has somewhere left to go. Without that band
  // the wind-up and the gather differ by a diamond one ring wider and a notch in the crown --
  // about a tenth of the sprite, which survives a diff and does not survive a quarter of a
  // second at 1x. A charge that only the code can tell apart from the pose before it is a
  // three-frame cast that plays as a one-frame cast.
  const fkhem = dx => { const rs = rows(FROSTKING); slideBox(rs, 23, 25, 1, 17, dx); return grid(rs); };
  const fkrobe = st => {
    const rs = rows(FROSTKING);
    recol(rs, 12, 17, 1, 17, 'j', 'Y');
    if (st > 1) {
      recol(rs, 18, 18, 1, 17, 'j', 'Y');        // one row further down the robe
      recol(rs, 19, 20, 1, 17, 'J', 'j');        // and the charge reaches the top of the hem
      for (const [y, cs] of [[11, [9]], [13, [8, 12]], [14, [7, 13]], [15, [8, 12]], [17, [9]]])
        for (const c of cs) rs[y][c] = 'y';      // the diamond swells by one ring
      recol(rs, 3, 4, 3, 15, 'Y', 'y');
      rs[1][5] = 'y'; rs[1][13] = 'y';           // the crown opens out a notch
    }
    if (st < 0) recol(rs, 19, 25, 1, 17, 'J', 'y');
    return grid(rs);
  };
  ANIM.frostking = {
    walk: [fr(FROSTKING, 0), fr(fkhem(1), -1), fr(FROSTKING, -2), fr(fkhem(-1), -1)],
    idle: [fr(FROSTKING, -1), fr(fkhem(1), 0), fr(FROSTKING, -2), fr(fkhem(-1), -1)],
    cast: [fr(fkrobe(1), -2), fr(fkrobe(2), -3), fr(fkrobe(-1), 1)],
  };
  // Voidherald. Its cast is the only one that happens inside the body: the chest sigil goes
  // from one pixel to a diamond and the cloak lightens around it, and on the release the
  // hood snaps up a pixel with the mask -- a flinch, not a swing, because three of its four
  // moves are things it *marks* rather than things it throws.
  //
  // The gather lights a halo around the sigil and the two rim columns, and deliberately leaves
  // the cloak between them alone: a glow needs something unlit next to it. Lightening the whole
  // torso box, which is what the obvious `recol` over cols 3-15 does, produces a pale slab with
  // the sigil lost inside it -- brighter than the wind-up frame and less readable than it. The
  // halo is written out row by row rather than as a box for the same reason: a rectangle of
  // light on a robe reads as a rectangle, and the shape of the glow has to be the shape of the
  // thing glowing.
  const VH_HALO = [[11, 8, 10], [12, 7, 11], [13, 6, 12], [14, 7, 11], [15, 8, 10], [16, 9, 9]];
  const vhcloak = dx => { const rs = rows(VOIDHERALD); slideBox(rs, 21, 24, 4, 14, dx); return grid(rs); };
  const vhsig = st => {
    const rs = rows(VOIDHERALD);
    recol(rs, 12, 14, 7, 11, 'm', 's');
    if (st > 1) {
      for (const [y, c0, c1] of VH_HALO) recol(rs, y, y, c0, c1, 'h', 'm');
      recol(rs, 12, 17, 1, 2, 'H', 'h'); recol(rs, 12, 17, 16, 17, 'H', 'h');
      // The hood lights from the inside too, one step only: the sigil is on the chest, so a
      // gather that stops at the shoulders is a glow with a lid on it. This is the second half
      // of what makes the gather a different *pose* and not a slightly brighter copy of the
      // wind-up -- the halo alone moves about eight percent of the sprite, which reads as
      // nothing. Following the hood's own outline rather than a box keeps it a hood that is
      // lit instead of a rectangle drawn over one.
      recol(rs, 4, 9, 4, 14, 'H', 'h');
      recol(rs, 10, 11, 4, 14, 'H', 'h');
      rs[11][9] = 's'; rs[15][9] = 's';
      rs[13][6] = 's'; rs[13][12] = 's';         // the sigil reaches out sideways
    }
    if (st < 0) { liftRows(rs, 4, 9, -1); recol(rs, 17, 22, 3, 15, 'H', 'h'); }
    return grid(rs);
  };
  ANIM.voidherald = {
    walk: [fr(VOIDHERALD, 0), fr(vhcloak(1), -1), fr(VOIDHERALD, -2), fr(vhcloak(-1), -1)],
    idle: [fr(VOIDHERALD, -1), fr(vhcloak(1), 0), fr(VOIDHERALD, -2), fr(vhcloak(-1), -1)],
    cast: [fr(vhsig(1), -1), fr(vhsig(2), -2), fr(vhsig(-1), 0)],
  };
}

// ---- the three fights -------------------------------------------------------
// HP is set so a fight lasts about a minute with a mid-range weapon and no skills, and the
// `boss` flag is what earns the wide HP bar, the cast frames and the random move pick. None
// of these kinds is in SPAWN_W, so pickKind can never roll one: a boss arrives because the
// gate below decided it was time, never because the spawn timer got lucky.
//
// `abil` is still written longest reach first even though a boss ignores the order -- it is
// how the list reads as a fight plan: open at range, close, and have something for contact.
//
// `keep` is the band a boss holds, and it is not a taste setting: two of the herald's four moves
// are marks centred on itself, 84 and 90 px across, so a band that parks it further out than
// that would have it casting them where they cannot reach. A ranged kind's stand-off distance
// belongs to its shortest self-centred mark, not to how timid it looks.
KIND.forgelord = { hp: 1500, spd: 10, mass: 4.0, cyc: 3.2, label: 'Chúa Lò', boss: true,
                   abil: ['meteor_rain', 'judgment', 'earthquake', 'flame_sweep'] };
KIND.frostking = { hp: 1250, spd: 14, mass: 3.0, cyc: 3.8, label: 'Vua Băng', boss: true,
                   keep: 74, abil: ['sonic_tide', 'wind_blades', 'gravity_sink', 'frost_web'] };
KIND.voidherald = { hp: 1150, spd: 16, mass: 2.4, cyc: 4.2, label: 'Sứ Giả Hư Không',
                    boss: true, keep: 78,
                    abil: ['delayed_echo', 'chain_stomp', 'blood_sigil', 'death_spiral'] };

const BOSS_KINDS = ['forgelord', 'frostking', 'voidherald'];
// Each boss belongs to the floor its moves are made of: meteors and fissures on basalt,
// frost lattices on ice, a blood sigil in the dark. An arena that is not in this table still
// gets one -- the rotation below starts wherever `indexOf` lands, which for -1 is the start.
const BOSS_OF = { lava: 'forgelord', ice: 'frostking', cave: 'voidherald' };
const BOSS_AT = 40;                  // kills before the first one; then every 40 again

// A boss picks at random among the moves that can reach, and never the one it just used.
// tryCast's first-match walk is exactly right for a brute with two abilities -- quake if
// there is room, swipe if there is not -- but on four moves it collapses to one: the boss
// would open with its longest reach every single time, and the other three would only ever
// appear as the answer to standing too close.
function bossCast(w, f, d) {
  const list = KIND[f.kind].abil;
  const ok = [], any = [];
  for (const key of list) {
    const A = FOE_ABIL[key];
    if (!A || d > A.range || d < (A.min || 0)) continue;
    any.push(key);
    if (key !== f.last) ok.push(key);
  }
  // Everything in range is the move it just used: use it again rather than stand there. A
  // boss repeating itself is still a fight; a boss that declines to act is a bug the player
  // reads as the fight being over.
  const pick = (ok.length ? ok : any);
  if (!pick.length) return false;
  const key = pick[Math.min(pick.length - 1, (w.rng() * pick.length) | 0)];
  if (!startCast(w, f, key)) return false;
  f.last = key;
  // Enrage: below 45% the pauses shorten, the numbers do not grow. A second phase that hits
  // harder is one you cannot learn; a second phase that hits *sooner* is one you answer by
  // playing better, and it never turns a survivable mistake into a lethal one retroactively.
  if (f.hp < f.maxhp * 0.45) f.acd *= 0.62;
  return true;
}

// The arrival. Off screen like every other spawn -- a 24 px sprite popping into view at the
// edge of the camera is the one entrance that would look like a glitch -- with a long first
// `acd` so the boss is something you *see* walking in before it is something you dodge.
//
// spawnFoe's circle of radius `W * 0.62` is not good enough here, and the difference matters
// only for something this size: on a diagonal that circle lands 0.44 of a screen away on both
// axes, which is *inside* the 320x180 view. So the direction is projected onto the rectangle
// instead -- one axis always ends up at 0.62 of a full screen, comfortably past the edge. Near
// a world corner the clamp can still drag the point back into view, so the eight eighths of
// the circle are tried in turn and the first one that really is off camera wins; with a world
// eight screens wide, the opposite side is always free.
function bossOff(h, ang) {
  let px = h.x, py = h.y;
  for (let i = 0; i < 8; i++) {
    const a = ang + i * TAU / 8;
    const c = Math.cos(a), s = Math.sin(a), t = 1 / Math.max(Math.abs(c), Math.abs(s), 1e-6);
    px = clamp(h.x + c * t * W * 0.62, BOUND.x0, BOUND.x1);
    py = clamp(h.y + s * t * H * 0.62, BOUND.y0, BOUND.y1);
    if (Math.abs(px - h.x) > W * 0.5 || Math.abs(py - h.y) > H * 0.5) break;
  }
  return [px, py];
}
function spawnBoss(w, kind) {
  if (w.boss) return null;
  const i0 = Math.max(0, BOSS_KINDS.indexOf(BOSS_OF[MAPDEF.id] || ''));
  const k = kind || BOSS_KINDS[(i0 + (w.bossN || 0)) % BOSS_KINDS.length];
  const h = w.hero, p = bossOff(h, w.rng.range(0, TAU));
  const f = unit(k, p[0], p[1]);
  f.acd = 2.2;
  w.foes.push(f);
  w.boss = f; w.bossN = (w.bossN || 0) + 1;
  w.shake = Math.max(w.shake, 5.5);
  SFX.boom('big', clamp((f.x - w.cam.x - W * 0.5) / (W * 0.5), -1, 1));
  return f;
}
// Called once a frame from step(). Two rules: never two bosses at once -- four telegraphs
// from one caster is already as much as the floor can say -- and the counter only moves
// forward, so a boss you killed does not walk back in on the next kill.
function bossGate(w) {
  if (w.boss && (w.boss.dying || w.boss.hp <= 0 || w.foes.indexOf(w.boss) < 0)) w.boss = null;
  if (!w.boss && w.kills >= BOSS_AT * ((w.bossN || 0) + 1)) spawnBoss(w);
}
