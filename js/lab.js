"use strict";
// ===========================================================================
// 7. Headless hook. Everything above is pure computation, so a node harness can
//    build a world, cast, step and resolve frames with no DOM at all -- which is
//    how this file gets verified (no browser is available here).
// ===========================================================================
const LAB = { W, H, SCALE, SKILLS, buf, newWorld, spawnFoe, unit, cast, step,
              renderWorld, resolve, mulberry32, BOUND, foesIn, nearest, SFX,
              WW, WH, camInt, snapCam, camTarget, setCam, syncFloor, FLOOR,
              TID, TONESET, TONE_U32, PROPS, LANDMARKS, ANIM, heroFrame, foeFrame,
              propLo, GRIDS, PAL, MM,
              // Arenas. `MAPDEF`, `DUST` and `HERO_GLOW` are reassigned by applyMap, so
              // they go through getters -- copying them into this literal would freeze the
              // harness's view at whatever the first map happened to set.
              MAPS, MAP_BY_ID, applyMap, checkTone, bakeToneTables, bakeWorldFloor,
              buildProps, paintBorder, drawPropFlat, drawPropTall, ambArg, FX,
              get MAPDEF() { return MAPDEF; },
              get DUST() { return DUST; },
              get HERO_GLOW() { return HERO_GLOW; },
              dash, DASH_SK, DASH_DUR, DASH_LEN, DASH_CD, DASH_IV,
              WEAPONS, WEAPON_BY_ID, swing, reswing, hitCone, ART, stampFrame,
              HELD, blitRot, heldPose, drawHeld, lungeHero,
              // The six weapon mechanics. Each one is either a hit path or a state the hit
              // path reads, so the harness needs both halves to prove any of them.
              swingHit, swingRiders, weaponStat, fireArrow, ARROW_SK, CUT_SK, cutCast,
              hurt, healHero, pullToward,
              KIND, FOE_ABIL, GSQ, HERO_R, pickKind, tryCast, startCast, stepTel,
              heroIn, hitHero, SPAWN_W, REL_HOLD,
              // Bosses. `BOSS_SHAPE` is exported because the two things worth asserting about
              // a boss move -- that the marked ground is the damaging ground, and that its
              // hitbox travels -- both live in that table rather than in the ability entry.
              BOSS_SHAPE, BOSS_KINDS, BOSS_OF, BOSS_AT, spawnBoss, bossGate, bossCast,
              // Art boss dựng từ ảnh. `ANIM_IMG` là bộ khung thật sự được vẽ; `BOSS_ART` là
              // dữ liệu thô sinh ra nó, cần cho harness để đối chiếu cw/bw/bh và palette.
              BOSS_ART, BOSS_ART_CH, ANIM_IMG, foeImgFrame,
              // Mana, trang bị, hành trang. Cả bảng dữ liệu và cả bốn hàm đổi trạng thái đều ra
              // đây: harness phải chứng minh được "không mặc gì thì mọi con số y như trước", và
              // câu đó chỉ kiểm được khi nó tự dựng được một bộ trang bị rồi tháo hết ra.
              GEAR_SLOTS, GEAR_RARITY, GEAR_STATS, SLOT_BY_ID, RARITY_BY_ID, STAT_BY_ID,
              BAG_MAX, GEAR_DROP, GEAR_BOSS_BOOST,
              gearIcon, gearName, statText, gearScore, rollGear, rollRarity, rollDrop, gearSum,
              syncGear, equipGear, unequipGear, trashGear, dropLoot, defMul,
              HERO_HP, HERO_MP, MP_REGEN, HUD_BOX, drawHeroBars,
              cam: () => ({ x: CAMX, y: CAMY }) };
if (typeof globalThis !== 'undefined') globalThis.LAB = LAB;

