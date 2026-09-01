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
              hurt, healHero, pullToward, hitCircle, hitLine,
              KIND, FOE_ABIL, GSQ, HERO_R, pickKind, tryCast, startCast, stepTel,
              heroIn, hitHero, SPAWN_W, REL_HOLD, telEnd,
              // `fxWho` là bản lề của hiệu ứng soi gương ở chế độ solo: một hàng `w.fxs` mang `e.by`
              // thì mọi đường vẽ neo vào *người thả* thay vì vào nhân vật. Harness phải kiểm được
              // đúng câu đó, vì nó là thứ duy nhất giữ cho art của đối thủ không dán lên người chơi.
              fxWho,
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
              // Món rơi ra nằm trên sàn. Cả bốn hằng số và cả ba hàm ra đây, vì đây là chỗ đầu
              // tiên trong hệ trang bị mà một món *tồn tại ngoài túi*: "rơi ra rồi đi tới thì
              // nhặt được" và "túi đầy thì món ở lại chứ không bốc hơi" là hai bất biến kiểm được
              // bằng cách bước sim, không phải hai câu hứa. `ORB_C` để kiểm màu bốn phẩm chất
              // đúng là màu của bảng trang bị.
              ORB_MAX, ORB_MAG, ORB_TAKE, ORB_WAIT, spawnOrb, stepOrb, takeOrb, ORB_C, ORB_P, orbY,
              // Cánh cổng boss và phòng boss. Cả bảng hằng ra đây vì harness phải chứng minh được
              // ba bất biến mà mắt không thấy: phòng **hẹp hơn sân nhưng rộng hơn khung nhìn** (hẹp
              // hơn thì kẹp camera đảo), `BOUND` và `CAMB` trở về đúng cỡ gốc sau khi ra khỏi phòng
              // (chúng là toàn cục -- rò một lần là mọi trận sau đó chơi trong một cái sân hẹp), và
              // đồ trên sàn không bốc hơi lúc đổi sàn.
              GATE_W, GATE_H, GATE_OPEN, GATE_HOLD, GATE_RX, GATE_RY, GATE_DIST,
              ROOM_W, ROOM_H, ROOM_PAD, GATE_ART, GATE_PAL, BOUND0, CAMB,
              openGate, openBossGate, stepGate, enterRoom, exitRoom, sweepOrbs, roomApply,
              // Chế độ solo. Bốn bảng dữ liệu ra đây vì cả "AI thông minh" quy về chúng: `SK_THREAT`
              // là thứ duy nhất cho nó biết chiêu người chơi ăn tới đâu (bán kính bị nướng trong thân
              // hàm `hit()` của js/skills.js, không đọc ra được lúc chạy), nên một hàng lệch bán kính
              // là một AI đứng trong lửa mà tưởng mình đứng ngoài -- kiểm được bằng cách so với đúng
              // cái `hitCircle` mà chiêu ấy gọi. `RIVAL_SK`/`RIVAL_WP` phải chứng minh được là mọi
              // hàng đều hợp lệ với `startCast` và `range` nằm trong tầm hình của chính nó, và
              // `rollRival` phải chứng minh được cùng seed ra cùng bộ kit.
              SK_THREAT, RIVAL_SK, RIVAL_WP, rollRival, duelBand,
              DUEL_W, DUEL_H, DUEL_MP, DUEL_MPR, DUEL_MPX, DUEL_END, RIV_REL, RIV_WP_BIAS,
              DUEL_INTRO, DUEL_TXT, drawFoeHeld, SK_BY_ID, mirLead, mirLeadWp, rivalMirror,
              startDuel, spawnRival, stepDuel, duelEnd, duelThreat, stepRival, rivalPick, rivalScore,
              rivalLead, rivalHeroBusy, rivalCast, duelKitText, duelLine, duelResult, DTH,
              // Khoảng ngẫu nhiên của sát thương, và con số chí mạng. `DMG_VARY` ra đây vì hai
              // harness pin số cứng phải *tắt* được nó (`w.vary = 0`) mới đo được cái chúng đo,
              // nên "mức mặc định là bao nhiêu" là một câu cần kiểm chứ không phải một con số ẩn.
              // `CRIT_BASE`/`CRIT_BASE_D` cũng vậy, và vì thêm một lý do: chúng là *một* tỷ lệ
              // dùng cho cả vũ khí lẫn mười sáu chiêu, nên "bảng trạng thái ghi đúng con số đang
              // quay" là một bất biến kiểm được thay vì một lời hứa.
              DMG_VARY, CRIT_BASE, CRIT_BASE_D, CRIT_C, CRIT_KEY,
              textScaled, textWScaled, text3x5, textW, GLYPHS,
              // Hình nhân vật. `dollPixels` là toàn bộ phần tính toán -- `drawDoll` chỉ đổ nó lên
              // canvas -- nên harness kiểm được "mặc vào thì ngoại hình đổi" mà không cần DOM.
              // `wearBase`/`wearPal`/`wornFrame` là cùng cái hình ấy đi ra màn chơi: một lưới ký
              // tự, hai chỗ dùng, nên harness kiểm được *đúng cái* mà bảng trạng thái in ra cũng
              // là cái mà trận đấu vẽ, chứ không phải hai bản vẽ giống nhau.
              DOLL_W, DOLL_H, DOLL_DX, DOLL_DY, DOLL_ORDER, DOLL_ART, dollRamp, dollPixels,
              WEAR_CH, wearBase, wearPal, wearSig, wearFrames, wornFrame, heroSet, heroPick,
              HERO_HP, HERO_MP, MP_REGEN, HUD_BOX, drawHeroBars,
              cam: () => ({ x: CAMX, y: CAMY }) };
if (typeof globalThis !== 'undefined') globalThis.LAB = LAB;

