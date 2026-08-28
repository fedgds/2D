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
              propLo, GRIDS, MM,
              // Arenas. `MAPDEF`, `DUST` and `HERO_GLOW` are reassigned by applyMap, so
              // they go through getters -- copying them into this literal would freeze the
              // harness's view at whatever the first map happened to set.
              MAPS, MAP_BY_ID, applyMap, checkTone, bakeToneTables, bakeWorldFloor,
              buildProps, paintBorder, drawPropFlat, drawPropTall, ambArg, FX,
              get MAPDEF() { return MAPDEF; },
              get DUST() { return DUST; },
              get HERO_GLOW() { return HERO_GLOW; },
              dash, DASH_SK, DASH_DUR, DASH_LEN, DASH_CD, DASH_IV,
              WEAPONS, WEAPON_BY_ID, swing, hitCone, ART, stampFrame,
              HELD, blitRot, heldPose, drawHeld,
              KIND, FOE_ABIL, GSQ, HERO_R, pickKind, tryCast, startCast, stepTel,
              heroIn, hitHero,
              cam: () => ({ x: CAMX, y: CAMY }) };
if (typeof globalThis !== 'undefined') globalThis.LAB = LAB;

