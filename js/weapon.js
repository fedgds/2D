"use strict";
// ===========================================================================
// 3d. Weapons: the basic attack. Unlike the 16 skills -- which are drawn entirely
//     from the additive primitives above -- a swing plays a 16-frame painted sheet
//     from disk (the sets in kiem-frames/ ... gang-frames/, same art and the same
//     hitFrames/arc/travel tuning as test.html). The frames cannot be blitted with
//     drawImage because this renderer never touches a 2D context until the frame is
//     resolved, so each PNG is baked *once* into a small premultiplied float bitmap
//     and stamped into `buf` with an inverse-rotation sampler. That keeps the swing
//     inside the same HDR -> tonemap -> dither path as everything else, and it keeps
//     the sim headless: without a DOM nothing is baked and `drawSwing` falls back to
//     a procedural crescent, so the node harness still runs.
// ===========================================================================
const SPRITE_UP = -Math.PI / 2;                 // the painted sets all point up
// Vertical squash for anything drawn standing in the world: the camera is a 3/4 view,
// so a swing that is round on screen reads as lying flat on the floor. 0.72 is between
// the ground rings (0.34) and the mid-height crescents (0.62) the skills already use.
const SWING_SQ = 0.72;
// The held weapon is *matter*, so it is pixel art like the hero and not additive light.
// Each grid points up in its own frame (`SPRITE_UP`) and is rotated to wherever the hero
// aims; `hold.pv` is the cell the hand grips, which is the cell the rotation turns about.
// They are deliberately as long as the hero is tall -- test.html's held art is 55px against
// a 57px hero, and anything shorter reads as a knife at this scale.
const HELD = {
  kiem: [
    "...#...", "..+#+..", "..+#+..", "..+#+..", "..+#+..", "..+#+..",
    "..+#+..", "..+#+..", "..+#+..", "..+#+..", "..+#+..", "-#####-",
    "...=...", "...=...", "...=...", "...-...",
  ],
  // Single edge and a belly: the blade thickens on the left and the spine stays straight,
  // which is the whole reason a saber reads differently from a sword at 7px wide.
  dao: [
    "....#..", "...+#..", "...+#..", "..+#+..", "..+#+..", ".++#+..",
    ".++#+..", ".++#+..", ".++#...", "..+#...", "..+#...", "..-=-..",
    "...=...", "...=...", "...-...",
  ],
  // Limbs curve in toward the hero so the tips point at the target, the string closes them
  // across the grip, and the arrow runs up the middle -- a bow seen from above.
  cung: [
    "....#....", "...+#+...", "....#....", "....#....", "+.......+",
    ".+..#..+.", "..+.#.+..", "..+===+..", "....=....", "....-....",
  ],
  luoi_hai: [
    ".######..", "#+....=..", "#-....=..", "......=..", "......=..",
    "......=..", "......=..", "......=..", "......=..", "......=..",
    "......=..", "......=..", "......=..", "......-..",
  ],
  gang: [
    ".###.", "#+++#", "#+++#", "#+++#", ".#-#.", "..=..", "..-..",
  ],
  // Khiên là tấm chắn, không phải lưỡi: bốn vũ khí trên đọc ra được vì phần sáng của chúng
  // rộng 1–3 ô, còn cái này là một mảng kín 5 ô có viền sáng và một gân giữa. Nó ngắn hơn hẳn
  // (11 dòng so với 14–16) mà vẫn không đọc ra thành con dao, vì bề rộng thay cho bề dài.
  khien: [
    "..-#-..", ".-###-.", "-#+#+#-", "-#+#+#-", "-#+#+#-", "-#+#+#-",
    ".-+#+-.", ".-+#+-.", "..-#-..", "...=...", "...-...",
  ],
  // Rìu: một cái đầu bè, thấp, đặt trên một cán dài. Nó gần cỡ tấm khiên ở phần khối, nhưng
  // đọc ra khác vì tỷ lệ ngược -- khiên là chín dòng khối trên hai dòng cán, rìu là năm dòng
  // khối trên tám dòng cán. Cái nói ra "đây là một cái đầu nặng ở xa tay" chính là cán dài.
  riu: [
    ".-#####-.", "-#+++++#-", "-#+++++#-", ".-#+++#-.", "..-###-..",
    "....=....", "....=....", "....=....", "....=....", "....=....",
    "....=....", "....=....", "....=....", "....-....",
  ],
  // Thương: dài nhất và mỏng nhất trong bảng này -- 16 dòng, 5 ô ngang, mũi là một cột `#`
  // rộng đúng một ô. Không có lưỡi để quét, nên hình phải kể chuyện bằng chiều dài: cái duy
  // nhất một cây thương làm được mà năm vũ khí kia không làm được là *với tới trước khi bị với*.
  thuong: [
    "..#..", "..#..", ".+#+.", ".+#+.", ".+#+.", ".-#-.",
    "..=..", "..=..", "..=..", "..=..", "..=..", "..=..",
    "..=..", "..=..", "..=..", "..-..",
  ],
  // Vuốt: ba lưỡi rời chụm vào một mảng đeo tay. Găng là một khối kín 5 ô -- một cú đấm; cái
  // này để hở hai rãnh giữa ba lưỡi, và chính hai khe trống đó là thứ đọc ra thành "móng" chứ
  // không thành "nắm tay". Ngắn thứ hai sau găng: vuốt là vũ khí phải áp vào mới dùng được.
  vuot: [
    "#..#..#", "#..#..#", "#+.#.+#", "-#+#+#-", ".-###-.",
    "..+++..", "..-=-..", "...=...", "...-...",
  ],
};
const HELD_HAFT = hexc('#3a3244'), HELD_DARK = hexc('#141a28');
// Mild squash only: the hero sprite is unsquashed pixel art, so flattening the weapon to
// the 0.72 the swing arc uses would make it look like it belongs to a different character.
const HELD_SQ = 0.9;
const WEAPONS = [
  {
    id: 'kiem', name: 'Kiếm', label: 'KIẾM', skill: 'SEPHIRIA SLASH', art: 'images/skills/kiem-frames',
    desc: 'chuỗi nhịp · 4 nhịp', col: hexc('#bcd8ff'), gain: 2.1,
    fps: 30, hits: [3, 6, 10, 13], dmg: 9, range: 44, arc: 1.50,
    size: 90, axis: SPRITE_UP, reach: 12, travel: 0, push: 0, pushStep: 0, cd: 0.55, shake: 1.1,
    // Momentum. Land the fourth beat and a window opens: the next swing comes out faster and
    // hits harder, and landing *its* fourth beat opens it again. Knockback is zero on purpose
    // -- shoving the target out of reach would close the chain the weapon is built around, so
    // the sword gives up the one thing the other four melee weapons all have.
    momentum: { cd: 0.34, dmg: 1.30, win: 1.20 },
    hold: { art: 'kiem', pv: [3, 13], sweep: 1.45, ext: 4.5, rest: -0.80 },
  },
  {
    id: 'dao', name: 'Đao', label: 'ĐAO', skill: 'MOON TIDE', art: 'images/skills/dao-frames',
    desc: 'xử trảm · cắm chân', col: hexc('#baf7ff'), gain: 2.0,
    fps: 32, hits: [4, 8, 12], dmg: 14, range: 43, arc: 1.55,
    size: 94, axis: -0.072, reach: 11, travel: 6, push: 16, cd: 0.60, shake: 1.3,
    // The saber commits. While the swing runs the legs are down to a shuffle -- you cannot
    // reposition out of a telegraph you mis-read -- and in exchange the hero takes 40% less.
    // The finisher then reads the target's own wounds: `exec` is a multiple of `dmg` scaled
    // by the fraction of HP already gone, so it is worth nothing against a fresh brute and
    // a great deal against the one you have been working on. Pick a target, then commit.
    exec: 1.20, plant: 0.30, guard: 0.60,
    hold: { art: 'dao', pv: [3, 12], sweep: 1.65, ext: 4.0, rest: -0.95 },
    // These sheets are trimmed to their painted bounds, so the frames differ in size.
    // frameBox scales them all against one shared box and the pivots keep the swing
    // centre still instead of sliding sideways as the crescent grows.
    frameBox: 303,
    pivots: [
      [.5126, .4259], [.5052, .4521], [.5370, .5147], [.4851, .5067],
      [.4700, .5075], [.5361, .4894], [.4758, .4756], [.5438, .4894],
      [.4757, .4944], [.4779, .4912], [.4753, .5278], [.5022, .5112],
      [.5440, .5181], [.4687, .5001], [.4294, .5098], [.5709, .4981],
    ],
  },
  {
    id: 'cung', name: 'Cung', label: 'CUNG', skill: 'CELESTIAL ARROW', art: 'images/skills/cung-frames',
    desc: 'ba mũi · xuyên · càng xa càng mạnh', col: hexc('#d9fdff'), gain: 2.0,
    fps: 28, hits: [8], range: 42, arc: 0.34,
    size: 78, axis: 0.515, reach: 13, travel: 10, push: 0, pushStep: 0, cd: 0.70, shake: 1.0,
    // The only weapon here that does not resolve where it is aimed on the frame it is aimed.
    // `hits: [8]` is now the *release*: it puts an arrow in the air and the arrow decides,
    // later, who it caught and for how much. Hence no `dmg`, no cone and no knockback of its
    // own -- `range` is left only because `drawSwing` measures the release flourish against
    // it, and the shove belongs to the arrow. `near`/`far` are the ends of the damage ramp
    // and `ramp` is the distance the top is reached at, deliberately well short of `max` so
    // the strong band is something you can hold rather than a pixel you have to find. Up
    // close the bow is worth less than a punch; that is the trade.
    shot: {
      spd: 300, max: 210, ramp: 140, near: 14, far: 46, thick: 5, push: 26,
      // Một lần bật dây là ba mũi xoè hình nan quạt. Bản một mũi mạnh đúng ở chỗ khó
      // giữ nhất -- xa -- còn lúc quái đã áp mặt thì 14 sát thương cho một nhịp 0.7 s
      // không ra hình một đòn, và đó là toàn bộ cảm giác "phế": người chơi dùng cung
      // nhiều nhất ở đúng cái tầm nó vô dụng nhất.
      //
      // `spread` và `side` được chọn cùng nhau để hai bất biến của cung không đổi:
      //   · Trần một mục tiêu vẫn là `far`. Ở tầm ôm sát, ba mũi còn chồng lên cùng
      //     một thân địch, nhưng chồng nhau chỉ tới `r / sin(spread)` ≈ 32 px (bia rộng
      //     nhất trong game), và ở đó dải mới có `near + (far-near)·32/ramp` ≈ 21 -- nhân
      //     `1 + 2·side` = 2.1 vẫn ra 45, tức là không hơn một mũi bắn tới độ. Xa hơn
      //     32 px là hai mũi biên đã ra ngoài thân nó và mọi thứ về đúng như cũ.
      //   · Áp mặt vẫn là tay yếu nhất: 37 sát thương cho 0.7 s hồi là ~53 dps, thấp
      //     hơn cả bốn vũ khí kia, chỉ là nó không còn bằng không.
      // Còn tiền của nan quạt trả ở tầm xa là bề rộng chứ không phải sát thương: ở cuối
      // tầm hai mũi biên cách trục hơn 60 px, nên một đám đứng tụm là ba làn xuyên.
      fan: 3, spread: 0.30, side: 0.55
    },
    // A bow does not slash: it draws back and springs forward, so the sweep is tiny and
    // almost all of the motion is the grip pushing out on release. The sheet stays with the
    // hero (no `anchor`) because it is the *draw*, and walking while you draw should carry
    // the bow with you -- what leaves and keeps going is the arrow, not the art.
    hold: { art: 'cung', pv: [4, 8], sweep: 0.30, ext: 3.2, rest: -0.10 },
    frameBox: 338,
    pivots: [
      [.5646, .5886], [.4256, .4809], [.4004, .5667], [.3104, .5920],
      [.5477, .5349], [.5277, .5470], [.3802, .5261], [.3527, .5277],
      [.5930, .4610], [.4992, .4915], [.4562, .5054], [.4144, .5171],
      [.5464, .3693], [.4505, .3790], [.4142, .4012], [.3634, .4033],
    ],
  },
  {
    id: 'luoi-hai', name: 'Lưỡi Hái', label: 'LƯỠI HÁI', skill: 'REAPER SURGE', art: 'images/skills/luoi-hai-frames',
    desc: 'gom bầy · kéo vào · hút máu', col: hexc('#bdf9ff'), gain: 1.95,
    fps: 26, hits: [4, 9, 13], dmg: 13, range: 54, arc: 2.25,
    size: 100, axis: SPRITE_UP, reach: 12, travel: 10, push: -34, pushStep: -6, cd: 0.72, shake: 1.4,
    // A negative `push` is a pull: `hitCone` sends the impulse along the angle from the hero to
    // the foe, so flipping the sign drags the target in instead of shoving it out, and each
    // later beat pulls harder. That turns the widest cone in the game from "I can reach more
    // of them" into "I can gather them", and `harvest` is what gathering is worth -- HP per
    // foe past the first, so one target is a hit and a crowd is a meal.
    harvest: 7,
    hold: { art: 'luoi_hai', pv: [6, 10], sweep: 1.85, ext: 5.0, rest: -1.10 },
  },
  {
    id: 'gang', name: 'Găng', label: 'GĂNG', skill: 'ABYSSAL FIST', art: 'images/skills/gang-frames',
    desc: 'cắt phép · 5 nhịp', col: hexc('#65dcec'), gain: 2.15,
    fps: 34, hits: [2, 5, 8, 11, 14], dmg: 7, range: 33, arc: 1.15,
    size: 72, axis: SPRITE_UP, reach: 10, travel: 16, push: 12, cd: 0.46, shake: 0.9,
    // The fifth punch snuffs a cast. Monsters telegraph a shape on the floor and then hit it,
    // and until now nothing in a loadout could switch one off -- you could only leave. `cut`
    // is how long the caster is held: `stepTel` already drops a telegraph whose owner is
    // frozen (js/foe-abil.js), so a quarter second is all it takes and the interrupt costs no
    // new machinery. The shortest reach in the game buys the only answer to a wind-up.
    cut: 0.25,
    // Fists barely rotate -- a punch is reach, so `ext` carries the pose instead.
    hold: { art: 'gang', pv: [2, 5], sweep: 0.50, ext: 6.5, rest: -0.30 },
  },
  {
    id: 'khien', name: 'Khiên', label: 'KHIÊN', skill: 'AEGIS CHARGE', art: 'images/skills/khien-frames',
    desc: 'lao lên · hẩy bật · giương khiên', col: hexc('#ffe3a8'), gain: 2.0,
    fps: 28, hits: [7, 11], dmg: 20, range: 40, arc: 1.05,
    size: 88, axis: SPRITE_UP, reach: 13, travel: 4, push: 30, pushStep: 12, cd: 0.58, shake: 1.5,
    // Bốn vũ khí cận chiến kia đứng tại chỗ mà vung; cái này *đi tới*. Mỗi đòn đẩy hero lướt
    // lên `len` px trong `dur` giây, và vì `swingOrigin` đọc chỗ hero đang đứng ở từng khung
    // nên cả tấm hiệu ứng lẫn cái nón sát thương tự đi theo -- tầm hiệu dụng là `len + range`
    // mà không cần một trường tầm thứ hai. Cú lướt dùng đúng `h.dsh` của `dash.js`: trong lúc
    // trượt thì WASD bị bỏ qua và điểm đến bị kẹp vào BOUND, nên lao vào tường là dừng ở
    // tường. Cái nó *không* lấy là bất tử -- `dash()` mới cho `h.inv`. Bằng không thì đòn
    // đánh thường của khiên đã gồm luôn cú né, và ba slot skill hết phải chọn gì.
    //
    // 52 px trong 0.22 s là 236 px/s, hơn bốn lần tốc đi bộ (56) nhưng vẫn chỉ non sáu phần mười
    // cú lướt né (400 px/s): nó phải đọc ra là một cú trườn tới, không phải một cú dịch chuyển.
    // Nhịp đầu ở khung 7 rơi vào giây 0.25 -- tức là chân vừa đứng lại thì cạnh khiên vừa tới, và
    // đó là lý do `dur` giữ nguyên 0.22 khi quãng lao dài ra: kéo dài thời gian trượt là đẩy cú
    // đánh ra sau lúc chân còn đang đi.
    //
    // Quãng 52 với hồi 0.58 s nghĩa là bấm liên tục thì hero đi được 90 px/s, *nhanh hơn đi bộ*.
    // Đó là chỗ khiên đổi tay: nó thành vũ khí áp sát, không còn là vũ khí đứng chờ. Giá phải trả
    // vẫn nguyên -- mỗi cú lao chốt cứng một hướng trong 0.22 s, không có bất tử, và đích đến là
    // giữa thứ vừa nhắm.
    lunge: { len: 52, dur: 0.22 },
    // Giương khiên. Cùng một trường `guard` mà đao dùng, nên không có mã mới: `hitHero` và cả
    // đường máu chạm người đều đọc nó trên nhát đang chạy. Khiên đỡ tốt hơn đao (0.40 so với
    // 0.60) vì đao còn có xử trảm để bán, còn ở đây chắn đòn *là* mặt hàng -- và vì cú lao ném
    // hero vào giữa thứ vừa nhắm, nên phần thưởng phải trả đúng ở chỗ nó bắt hero đứng.
    guard: 0.40,
    // `push` lớn nhất trong game và nhịp sau hẩy mạnh hơn nhịp trước: đây là chỗ khiên trả giá
    // cho việc rút ngắn khoảng cách hộ người chơi. Lao vào một đám rồi hẩy bật cả đám ra là
    // một vòng chơi đầy đủ, và nó cũng có nghĩa là không nối chuỗi được -- thứ vừa đánh không
    // còn đứng đó nữa.
    hold: { art: 'khien', pv: [3, 8], sweep: 0.28, ext: 7.0, rest: -0.25 },
  },
  {
    id: 'riu', name: 'Rìu', label: 'RÌU', skill: 'GRAVEBREAK', art: 'images/skills/riu-frames',
    desc: 'một nhát · nện xuống đất · chặt què cả đám', col: hexc('#9fe8b4'), gain: 2.0,
    fps: 22, hits: [7], dmg: 52,
    size: 94, axis: SPRITE_UP, push: 24, pushStep: 0, cd: 0.80, shake: 2.2,
    // Rìu **nện xuống đất**, và đó không phải một ghi chú về hình ảnh: `slam` thay hẳn cặp
    // `range`/`arc` mà tám vũ khí kia dùng, nên rìu không có `arc` (cũng không có `reach`/`travel`:
    // hai trường ấy là của một nhát quét đi ra từ tay). Đòn không còn là một cái nón mở ra từ hero
    // mà là một **điểm** cách chân `dist` px theo hướng nhắm, nổ thành một vòng bán kính `r` --
    // `swingHit` dời gốc nón tới đó rồi bỏ luôn phép thử góc, và `range` (58) được suy ra từ hai số
    // này ở vòng hậu kỳ dưới bảng chứ không viết tay, bằng không tầm hiển thị và tầm thật lệch nhau.
    //
    // Vùng ăn gần như không đổi so với cái nón cũ (π·32² ≈ 3217 px² so với 3400 px² của nón tầm 50
    // nửa-góc 1,35) nhưng *hình* thì khác hẳn, và cả hai mặt của chỗ khác ấy đều là mặt hàng: nện
    // được ra xa hơn (mép ngoài 58 so với 50) và ăn cả thứ đứng **ngang hông điểm nện** -- kể cả
    // thứ ở phía sau nó, chuyện không cái nón nào làm được. Cái giá đi kèm nằm ở hẩy: `hitCone` đẩy
    // theo trục từ *gốc nón* ra, mà gốc giờ là điểm nện, nên con đứng lọt giữa hero và điểm nện thì
    // bị hẩy **về phía hero**. Đó là điều khoản của việc nện sát chân mình, không phải một lỗi:
    // muốn dọn chỗ thì nện ra xa.
    slam: { dist: 26, r: 32 },
    // Ô mà mảng bụi trong bộ khung ngồi lên (đo trực tiếp trên frame_08..frame_14: mảng bụi trải
    // ngang 0,18–0,87 và tâm ellipse bụi ở khoảng 0,86 chiều cao tấm). `drawSlam` đặt đúng ô này
    // xuống điểm nện, nên `size` 94 không còn là "tấm to bằng nào" mà là một phép đo: nửa bề rộng
    // mảng bụi vẽ ra thành (0,87 − 0,52) × 94 ≈ 33 px, tức người chơi thấy đúng bán kính 32 mình ăn.
    pivot: [0.52, 0.86],
    // Vũ khí cận chiến duy nhất chỉ có **một** nhịp, và đó là cả câu chuyện của nó. Năm cái kia
    // chia sát thương ra 2–5 nhịp, nên mỗi nhịp là một lần thử: đánh trượt nhịp đầu thì còn nhịp
    // sau. Ở đây trượt là trượt cả đòn, và đòn đó tới chậm nhất trong game -- nhịp duy nhất rơi ở
    // khung 7 của một tấm 22 fps, tức 0,32 s sau cú bấm, gần gấp đôi cú đấm đầu của găng (0,06 s).
    //
    // Bù lại là con số lớn nhất một cú đánh thường từng có (52 so với 20 của khiên) trong vùng nện
    // rộng nhất. Nhưng 52 cho một nhịp mỗi 0,80 s chỉ là 65 dps, thấp nhất bảng: rìu *không*
    // bán sát thương mỗi giây. Một nhịp cũng là chỗ nó ăn trang bị kém nhất -- "+ATK" cộng phẳng
    // vào từng cú, nên găng năm nhịp ăn năm lần còn rìu ăn một lần (xem `hurt` trong js/world.js).
    maul: 1.15,
    // Cái nó bán là `maul`: mọi thứ trúng nhát chặt đi còn một phần ba tốc (`f.slow`, 0.34x trong
    // js/world.js) suốt 1,15 giây. Không có mã mới -- trường `slow` đã có sẵn từ chiêu độc -- mà
    // nó đổi hẳn vòng chơi: một nhát vào giữa đám là cả đám bị chặt què, và 0,80 s hồi chiêu trở
    // thành thứ đi được chứ không phải thứ phải chịu. Rìu là vũ khí duy nhất *tự tạo ra* khoảng
    // trống để chờ đòn sau của chính nó.
    //
    // `pushStep` là 0 vì chỉ có một nhịp, và `push` 24 nằm dưới 30 của khiên: hẩy bật một con vừa
    // bị làm chậm là trả lại nó đúng cái nó vừa mất, nên rìu đẩy vừa đủ để tạo hình cú nện -- một
    // vòng xung bung ra từ chỗ lưỡi cắm xuống, chứ không phải một cái gạt tay.
    hold: { art: 'riu', pv: [4, 12], sweep: 1.70, ext: 4.0, rest: -1.05 },
  },
  {
    id: 'thuong', name: 'Thương', label: 'THƯƠNG', skill: 'LANCE VIGIL', art: 'images/skills/thuong-frames',
    desc: 'tầm xa nhất · xuyên hàng · giữ mũi thì đau hơn', col: hexc('#cbb9ff'), gain: 2.05,
    fps: 30, hits: [5, 9], dmg: 15, range: 76, arc: 0.30,
    size: 96, axis: 0, reach: 14, travel: 14, push: 8, cd: 0.56, shake: 1.2,
    // `axis` là 0 chứ không phải `SPRITE_UP`, và đây là một phép đo trên tấm art chứ không phải một
    // lựa chọn: bảy bộ khung kia vẽ nhát quét *hướng lên*, còn bộ này vẽ mũi giáo với mấy vệt gió
    // nằm ngang chỉ sang **phải** (xem frame_05/frame_11). `stampFrame` quay `e.ang - axis`, nên để
    // `SPRITE_UP` là quay cả cây giáo lệch 90° -- đâm sang đông thì thấy nó chúc xuống nam, đúng thứ
    // đọc ra là "không đâm thẳng". Trường này vốn đã sinh ra cho việc đó: đao là -0,072 và cung là
    // 0,515 vì hai bộ ấy cũng không vẽ đúng trục dọc.
    thrust: true,
    // Và `thrust` là *cách vẽ* của một cú đâm, chỗ duy nhất trong tám vũ khí kia không dùng được:
    // `drawSwing` bỏ vòng cung quầng sáng (một cái cung 0,30 rad thì cong không ra hình gì) và thay
    // bằng một nét thẳng chạy theo trục nhắm, rồi dời cái loé ở mũi ra 86% tầm thay vì 50% -- điểm
    // sáng phải nằm đúng chỗ `tip` trả tiền, bằng không hình vẽ dạy người chơi đứng sai chỗ.
    //
    // Nó cũng là một trong bốn điều khoản cho phép ngón tay bẻ hướng nhát đang chạy (xem `reaim` ở
    // vòng hậu kỳ dưới bảng và `reswing` ở cuối file).
    // Tầm 76 -- xa nhất trong năm vũ khí đánh gần (lưỡi hái 54) -- với cái nón hẹp nhất trong cả
    // bảng (0,30, hẹp hơn cả lúc cung bật dây). Hai con số ấy đi cùng nhau và cùng nói một câu:
    // đây không phải một nhát quét, đây là một **đường thẳng**. `hitCone` vốn đã trúng *mọi* thứ
    // trong nón, nên một cái nón dài mà hẹp tự là một cú xuyên qua cả hàng, không cần thêm gì.
    //
    // Giá của cái nón hẹp là một đám đứng tản ra thì gần như không đánh được. Thương không có câu
    // trả lời cho số đông; nó có câu trả lời cho *khoảng cách*.
    tip: 1.40,
    // Và đây là chỗ nó bắt người chơi trả tiền cho tầm xa của mình. Chỉ phần **mũi** giáo đau:
    // trong khoảng 40% tầm đầu tiên thì đúng bằng con số trên bảng, rồi tăng dần tới ×1,40 ở cuối
    // tầm. Đứng ôm mặt con quái với cây thương là đánh yếu nhất bảng; đứng đúng cái vành 45–76 px
    // -- xa hơn mọi thứ chạm được vào hero -- là đánh mạnh nhất bảng. Đó là một kỹ năng đứng chân,
    // không phải một con số, và nó là cái duy nhất một cây thương nên bán.
    //
    // Khác cú dốc tầm của cung ở chỗ căn bản: bên đó là *mũi tên đã bay được bao xa* (một chuyện
    // xảy ra sau khi bấm, và bấm rồi thì hết quyền), còn đây là *hero đang đứng cách bao xa* --
    // một chuyện đôi chân quyết định trước mỗi cú bấm.
    hold: { art: 'thuong', pv: [2, 13], sweep: 0.18, ext: 8.0, rest: -0.06 },
  },
  {
    id: 'vuot', name: 'Vuốt', label: 'VUỐT', skill: 'RIPTOOTH', art: 'images/skills/vuot-frames',
    desc: 'bốn nhát · vết xé cộng dồn · bám một con', col: hexc('#ff9fa8'), gain: 2.1,
    fps: 32, hits: [3, 6, 11, 14], dmg: 5, range: 36, arc: 1.25,
    size: 74, axis: SPRITE_UP, reach: 10, travel: 12, push: 5, pushStep: 0, cd: 0.52, shake: 1.0,
    // Bốn nhịp, lấy đúng từ tấm art: độ phủ của bộ khung này lên đỉnh **hai** lần (khung 6 và
    // khung 14) chứ không một lần như bốn bộ kia -- nó là hai lượt cào, mỗi lượt hai móng.
    //
    // 5 sát thương một nhịp là thấp nhất trong game, và nó phải thấp: `rend` là thứ nhân nó lên.
    rend: { add: 0.22, max: 5, life: 2.2 },
    // Vết xé cộng dồn. Mỗi nhịp trúng để lại một vết trên **con đó** (`f.rnd`, tối đa `max`), và
    // mọi nhịp sau cộng thêm `dmg * add` cho mỗi vết đang có. Vết tự mờ sau `life` giây kể từ nhịp
    // cuối, nên nó không tích luỹ qua cả trận.
    //
    // Đây là vũ khí duy nhất **mạnh dần trong một trận đấu** thay vì mạnh sẵn: cào một con từ đầu
    // thì bốn nhịp đầu chỉ ra 32 sát thương, nhưng đòn thứ hai trở đi mỗi đòn ra 46 -- 88 dps, sát
    // trần của găng. Rải đều lên một đám thì vết chia ra và không con nào lên tới đó, nên nó là
    // mặt ngược của lưỡi hái: lưỡi hái ăn theo số đông, vuốt ăn theo *sự kiên nhẫn với một con*.
    //
    // `pushStep` 0 và `push` 5 -- thấp nhất trong các vũ khí có hẩy -- vì đúng cái lý do kiếm để
    // `push` bằng 0: hẩy con mồi ra khỏi tầm 36 px là tự xoá mấy vết vừa cào được.
    hold: { art: 'vuot', pv: [3, 7], sweep: 0.62, ext: 6.0, rest: -0.35 },
  },
];
const WEAPON_BY_ID = {};
for (const wp of WEAPONS) {
  WEAPON_BY_ID[wp.id] = wp;
  wp.frames = 16;
  wp.dur = wp.frames / wp.fps;
  wp.squash = SWING_SQ;
  // How much each later beat of a combo adds to the knockback. It is a field and not a
  // constant because the sign and the size of it are weapon identity now: the sword needs
  // zero so its chain cannot shove the target out of reach, and the scythe needs it negative
  // so every beat pulls harder than the last.
  if (wp.pushStep === undefined) wp.pushStep = 4;
  // Một cú nện không có `range` của riêng nó: tầm với của nó *là* khoảng cách tới điểm nện cộng bán
  // kính vụ nổ. Suy ra ở đây, một chỗ, nên bảng chỉ số (`weaponStat`), vòng ngắm trên điện thoại
  // (`wpAimR` trong js/shell.js) và phép thử khoảng cách trong `hitCone` không thể nói ba con số
  // khác nhau -- đó là cái giá của việc viết tay `range: 58` cạnh `slam`.
  if (wp.slam) wp.range = wp.slam.dist + wp.slam.r;
  // Ngón tay có được bẻ hướng nhát *đang chạy* hay không (xem `reswing` ở cuối file). Đây là một
  // tính chất của **hình cái đòn**, không phải của loại vũ khí: bẻ lại một cú bắn, một cú lao, một
  // đường đâm hay một điểm nện là chuyện có nghĩa, còn bẻ một cái nón rộng đang quét dở 3–5 nhịp là
  // cho cái nón đi vòng quanh hero. Năm vũ khí quét nón đều nằm ngoài đây, và không có bảng id nào
  // phải cập nhật khi thêm vũ khí mới.
  wp.reaim = !!(wp.shot || wp.lunge || wp.thrust || wp.slam);
  // `col` stays the weapon's identity colour (icon, damage flash, sparks). The sheets are
  // already near-white line art, and tinting them at full strength is most of why a slash
  // looked washed out next to test.html, which draws them untinted: the white-hot centre
  // is what the eye reads as brightness. `lit` mixes the hue only part of the way in, so
  // the core stays white and the falloff still carries the weapon's colour.
  wp.lit = wp.col.map(c => c + (1 - c) * 0.5);
  // The held sprite shares the weapon's hue but reads as metal, not light: one bright edge,
  // one body tone, a dark outline and a neutral haft. Four tones is all an 7px blade can
  // carry, and keeping the outline dark is what stops it dissolving into the floor.
  wp.held = HELD[wp.hold.art];
  wp.hpal = {
    '#': wp.col.map(c => c + (1 - c) * 0.75),
    '+': wp.col.map(c => c * 0.78),
    '-': HELD_DARK,
    '=': HELD_HAFT,
  };
  // A swing is one fx entry like a cast, so it gets the same shape a skill has. The
  // hotbar, the cooldown sweep and `step` then treat the basic attack as slot zero
  // without a single special case.
  wp.sk = {
    id: wp.id, name: wp.name, mode: 'dir', dur: wp.dur, cd: wp.cd, shake: wp.shake,
    over(w, e, p) { drawSwing(w, e, p); }, hit(w, e) { swingHit(w, e); }
  };
}

// Frame sets live on disk as PNGs, and this renderer never blits: it accumulates light.
// So each sheet is decoded once, scaled to its world size, and kept as a premultiplied
// float bitmap that `stampFrame` can add straight into `buf`. Bake cost is paid on the
// menu (5 weapons x 16 frames, a few ms each); after that a swing is pure arithmetic.
const ART = (() => {
  const sets = {};                     // id -> array of 16 baked frames (or null)
  let started = false, done = 0, total = WEAPONS.length * 16, failed = 0;
  const bake = (img, wp, i) => {
    const nw = img.naturalWidth, nh = img.naturalHeight;
    if (!nw || !nh) return null;
    const fit = wp.size * RENDER_SCALE / (wp.frameBox || Math.max(nw, nh));
    const dw = Math.max(1, Math.round(nw * fit)), dh = Math.max(1, Math.round(nh * fit));
    const cv = document.createElement('canvas');
    cv.width = dw; cv.height = dh;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    // Match test.html: the frame art is pixel-authored, so interpolation here only invents
    // semi-transparent edge colours that later read as haze.  The 2x render target has enough
    // samples to keep rotated strokes continuous without pre-blurring the source.
    cx.imageSmoothingEnabled = false;
    cx.drawImage(img, 0, 0, dw, dh);
    const src = cx.getImageData(0, 0, dw, dh).data;
    const px = new Float32Array(dw * dh * 3);
    // Premultiplied on purpose: additive light has no notion of "behind", so a pixel's
    // contribution is just colour * coverage and the alpha channel can be thrown away.
    //
    // Coverage is lifted by a gamma rather than used raw. Fitting 320px art into ~90px
    // averages every hairline stroke with transparent black, so a stroke thinner than the
    // destination pixel arrives at a fraction of its painted alpha; because the tonemap is
    // concave, the same light spread thin resolves much darker than it did at full size.
    // The gamma pays that back and is the difference between a blade and a grey smear.
    for (let k = 0, n = dw * dh; k < n; k++) {
      const a = src[k * 4 + 3] / 255;
      if (a <= 0) continue;
      const cov = Math.pow(a, 0.7);
      px[k * 3] = src[k * 4] / 255 * cov;
      px[k * 3 + 1] = src[k * 4 + 1] / 255 * cov;
      px[k * 3 + 2] = src[k * 4 + 2] / 255 * cov;
    }
    // Ba mức, từ riêng tới chung: bảng `pivots` 16 ô cho bộ nào bị cắt sát nét (mỗi khung một tâm
    // khác), một `pivot` duy nhất cho bộ nào cả 16 khung dùng chung một mốc -- rìu chỉ cần đúng một
    // con số vì mốc của nó là *chỗ mảng bụi ngồi xuống đất*, không đổi theo khung -- rồi tâm tấm.
    const pv = (wp.pivots && wp.pivots[i]) || wp.pivot || [0.5, 0.5];
    return { w: dw, h: dh, px, cx: pv[0] * dw, cy: pv[1] * dh };
  };
  return {
    // Missing art is not an error: `drawSwing` falls back to a procedural crescent, so a
    // 404 (or a headless run) costs the painted look and nothing else.
    frames(id) { return sets[id] || null; },
    progress() { return total ? done / total : 1; },
    failed() { return failed; },
    preload(onStep) {
      if (started || typeof document === 'undefined') return;
      started = true;
      for (const wp of WEAPONS) {
        const out = new Array(16).fill(null);
        sets[wp.id] = out;
        for (let i = 0; i < 16; i++) {
          const img = new Image();
          const fin = ok => { done++; if (!ok) failed++; if (onStep) onStep(done, total); };
          img.onload = () => { try { out[i] = bake(img, wp, i); fin(!!out[i]); } catch (err) { fin(false); } };
          img.onerror = () => fin(false);
          img.src = wp.art + '/frame_' + String(i + 1).padStart(2, '0') + '.png';
        }
      }
    },
  };
})();

// Add one baked frame into the buffer, rotated by `rot` and flattened by `squash`.
// Forward transform is  d = R(rot) * (s - pivot)  then  dy *= squash;  the loop walks
// destination pixels and inverts it, which is the only way to avoid holes when a sprite
// is rotated and scaled at the same time.
//
// `flip` lật tấm theo trục ngang *của chính nó*, quanh đúng cái pivot. Nó không thay được bằng một
// phép quay: quay một tấm nện 180° là cái lưỡi rơi từ dưới đất lên. Cái duy nhất cần cẩn thận là
// hộp bao -- pivot lệch tâm thì bên rộng đổi phía, nên `l`/`r` phải lật theo, bằng không nửa tấm
// bị cắt mất đúng cái nửa vừa lật sang.
function stampFrame(fr, x, y, rot, squash, a, col, gain, flip) {
  if (!fr || a <= 0) return;
  x = (x - CAMX) * RENDER_SCALE; y = (y - CAMY) * RENDER_SCALE;
  const ca = Math.cos(rot), sa = Math.sin(rot), sq = Math.max(squash, 1e-3);
  const mx = flip ? -1 : 1;
  let l = -fr.cx, r = fr.w - fr.cx;
  if (flip) { const sw = l; l = -r; r = -sw; }
  const t = -fr.cy, b = fr.h - fr.cy;
  let ax = 1e9, bx = -1e9, ay = 1e9, by = -1e9;
  for (const u of [l, r]) for (const v of [t, b]) {
    const dx = u * ca - v * sa, dy = (u * sa + v * ca) * sq;
    if (x + dx < ax) ax = x + dx; if (x + dx > bx) bx = x + dx;
    if (y + dy < ay) ay = y + dy; if (y + dy > by) by = y + dy;
  }
  const x0 = Math.max(0, Math.floor(ax)), x1 = Math.min(RW - 1, Math.ceil(bx));
  const y0 = Math.max(0, Math.floor(ay)), y1 = Math.min(RH - 1, Math.ceil(by));
  if (x1 < x0 || y1 < y0) return;
  // The sheets are near-white line art, so the weapon's own colour is a tint applied on
  // the way in; gain compensates for the tonemap, which pulls a 1.0 sample down to 0.64.
  const g = a * (gain === undefined ? 1 : gain);
  const g0 = (col ? col[0] : 1) * g, g1 = (col ? col[1] : 1) * g, g2 = (col ? col[2] : 1) * g;
  const px = fr.px, fw = fr.w, fh = fr.h;
  for (let py = y0; py <= y1; py++) {
    const dyq = (py - y) / sq;
    for (let pxi = x0; pxi <= x1; pxi++) {
      const dx = pxi - x;
      const su = mx * (dx * ca + dyq * sa) + fr.cx - 0.5, sv = -dx * sa + dyq * ca + fr.cy - 0.5;
      const sx = Math.round(su), sy = Math.round(sv);
      if (sx < 0 || sy < 0 || sx >= fw || sy >= fh) continue;
      const si = (sy * fw + sx) * 3;
      const r0 = px[si], r1 = px[si + 1], r2 = px[si + 2];
      if (r0 <= 0 && r1 <= 0 && r2 <= 0) continue;
      const i3 = (py * RW + pxi) * 3;
      buf[i3] += r0 * g0; buf[i3 + 1] += r1 * g1; buf[i3 + 2] += r2 * g2;
    }
  }
}

// Where the swing is anchored this frame. Melee follows the hero (walk while swinging and
// the arc walks with you, as in test.html); a shot stays at the origin it was fired from.
//
// `e.by` là nhát của người khác -- bản sao vũ khí của đối thủ solo (js/duel.js). Nó *không* đi theo
// người thả: vệt cảnh báo `w.tels` sinh ra nó đã đóng đinh vùng sát thương xuống sàn từ lúc ra đòn,
// mà đối thủ thì được đi lại trong lúc thu đòn, nên nếu hình vẽ đi theo chân nó thì hình và vùng
// trúng sẽ rời nhau. Neo vào `e.ox/e.oy` là chỗ duy nhất giữ hai cái ấy trùng nhau.
function swingOrigin(w, e) {
  const wp = e.wp;
  if (e.by || wp.anchor === 'cast') return { x: e.ox, y: e.oy };
  const h = w.hero;
  return { x: h.x, y: h.y - h.h * 0.5 };
}

// Draw the swing. `p` is 0..1 over the sheet's own duration, so the frame index is
// exact at any refresh rate; the two trailing frames are the same 3-frame additive smear
// test.html uses, which is what makes a 16-frame sheet read as one continuous arc.
function drawSwing(w, e, p) {
  const wp = e.wp, o = swingOrigin(w, e);
  // Cú nện không đi qua đường này chút nào: nó không có tấm nghiêng theo hướng nhắm, không có quầng
  // cung và không có cái loé ở mũi, vì nó không có mũi. Xem `drawSlam`.
  if (wp.slam) { drawSlam(w, e, p, o); return; }
  const last = wp.frames - 1;
  const fi = Math.min(last, Math.floor(p * wp.frames));
  const prog = Math.min(1, p * wp.frames / last);   // travel stays smooth between frames
  const off = wp.reach + wp.travel * prog;
  const x = o.x + Math.cos(e.ang) * off, y = o.y + Math.sin(e.ang) * off * wp.squash;
  const set = ART.frames(wp.id);
  const rot = e.ang - wp.axis;
  if (set && set[fi]) {
    // A soft halo under the sheet. The buffer resolves to 16 levels, which is enough for a
    // blade but throws away the gradient a real glow lives in -- everything below one step
    // simply vanishes. Laying an analytic arc underneath gives the quantiser something to
    // ramp through, and that ramp is what makes the swing look lit rather than pasted on.
    const k = Math.sin(Math.PI * Math.min(1, p * 1.15));
    // Một cú đâm thì cái quầng ấy phải là một *nét thẳng dọc trục nhắm*, không phải một cung: cung
    // 0,30 rad vẽ ra là một vệt cong không nói được gì, mà thứ cây thương làm là đi thẳng. Vẽ từ
    // mũi về gốc để `fadeEnd` mờ dần về phía tay -- sáng nhất ở đầu mũi, đúng chỗ `tip` trả tiền.
    if (wp.thrust) {
      const fd = off + wp.size * 0.40;                // mũi giáo vẽ trên tấm, không phải hết tầm ăn
      const px2 = o.x + Math.cos(e.ang) * fd, py2 = o.y + Math.sin(e.ang) * fd * wp.squash;
      line(px2, py2, x, y, wp.size * 0.075, wp.lit, 0.26 * k, 1.4, 0.85);
      line(px2, py2, x, y, 1.3, wp.lit, 0.34 * k, 1.7, 0.80);
    } else arc(x, y, wp.size * 0.30, e.ang, wp.arc * 1.7, wp.size * 0.13, wp.lit,
      0.30 * k, wp.squash, 1.4, 1.5);
    for (let tr = 2; tr >= 0; tr--) {
      const fr = set[Math.max(0, fi - tr)];
      if (!fr) continue;
      stampFrame(fr, x, y, rot, wp.squash, tr === 0 ? 1 : 0.26 / tr, wp.lit, wp.gain);
    }
  } else if (wp.thrust) {
    // Bản không có art: một đường thẳng chạy hết tầm, vì đó *là* cái đòn. Nhánh cũ vẽ một cung
    // 0,60 rad ở nửa tầm, tức là một cái gạch cong ngắn hơn cây giáo -- sai cả hình lẫn tầm.
    const k = Math.sin(Math.PI * p);
    const fd = off + wp.range * 0.9;
    const px2 = o.x + Math.cos(e.ang) * fd, py2 = o.y + Math.sin(e.ang) * fd * wp.squash;
    line(px2, py2, x, y, 2.6, wp.lit, 0.80 * k, 1.5, 0.7);
    core(px2, py2, 3.0, wp.lit, 0.7 * k, 2);
  } else {
    // Procedural stand-in: same reach, same arc, same colour, so a missing sheet is a
    // downgrade in looks and never a change in what the attack *is*. `arc` takes a full
    // sweep while `wp.arc` is the half-angle the hitbox uses, hence the doubling.
    const k = Math.sin(Math.PI * p);
    arc(x, y, wp.range * 0.5, e.ang, wp.arc * 2, 3.2, wp.lit, 0.85 * k, wp.squash, 1.5, 1.6);
    core(x, y, 3.4, wp.lit, 0.5 * k, 2);
  }
  // Vệt lao, cho vũ khí nào tự mang hero đi. `e.ox/e.oy` là chỗ đứng lúc bấm nên chỉ cần nối
  // nó với chỗ đang đứng là ra đúng khoảng vừa trượt qua -- không phải nhớ thêm gì. Vẽ bằng
  // màu của chính vũ khí chứ không phải màu thép của `dash.js`: hai thứ này xảy ra cùng lúc
  // được, và cái người chơi phải đọc ra là cái nào đang gây sát thương.
  if (wp.lunge) {
    const lk = 1 - c01((p * wp.dur - wp.lunge.dur) / 0.18);
    if (lk > 0 && (o.x !== e.ox || o.y !== e.oy)) {
      dashline(e.ox, e.oy + 3, o.x, o.y + 3, 5, 1.6, wp.col, 0.20 * lk, 0.6);
      line(e.ox, e.oy, o.x, o.y, 2.8, wp.lit, 0.26 * lk);
      line(e.ox, e.oy, o.x, o.y, 1.0, wp.col, 0.52 * lk);
    }
  }
  // Every hit frame gets a one-frame flourish at the tip: the sheets are the same art for
  // all five weapons, and this is what tells you *this* is the beat that lands.
  for (const hf of wp.hits) {
    const d = fi - hf;
    if (d < 0 || d > 1) continue;
    const a = d === 0 ? 1 : 0.4;
    const tx = o.x + Math.cos(e.ang) * (off + wp.range * 0.5);
    const ty = o.y + Math.sin(e.ang) * (off + wp.range * 0.5) * wp.squash;
    core(tx, ty, 3.6, wp.col, 0.6 * a, 2);
    // Vệt loé bung ra theo *hình cái đòn*: một nhát quét thì tán đúng trong cái nón nó quét, còn một
    // cú đâm thì nở tròn quanh chỗ mũi cắm vào -- tán theo nón 0,30 rad là bảy tia gần như trùng
    // nhau thành một gạch, tức là không có cái loé nào cả. Bán kính cũng phải nhỏ lại: 42% của tầm
    // 76 là một mảng 32 px, to hơn cả con quái vừa bị chọc.
    const sp = wp.thrust ? 1.0 : wp.arc * 0.5;
    sparks(tx, ty, 7, 1, wp.range * (wp.thrust ? 0.20 : 0.42), wp.col, 0.5 * a,
      (e.seed + hf * 31) | 0, 0.8, wp.squash, e.ang - sp, e.ang + sp, 3);
  }
}

// Cú nện. Bốn thứ nó *không* làm là gần hết định nghĩa của nó, và cả bốn đều là chỗ bản đầu sai:
// không quay tấm art theo hướng nhắm (bộ khung này vẽ một lưỡi rơi thẳng xuống rồi nổ thành mảng
// bụi ở đáy tấm -- quay nó 90° là biến một cú nện thành một cú vả ngang), không nén tấm theo
// `squash` (nó đã tự vẽ phối cảnh 3/4 rồi: mảng bụi dưới đáy vốn là một ellipse dẹt, nén thêm 0,72
// nữa là dí cả cột bụi xuống thành một vệt), không đi ra theo `reach`/`travel` (đích là một *điểm*
// cố định, không phải một cái nón mở dần) và không có loé ở mũi, vì nó không có mũi.
//
// Bù lại nó có hai thứ không vũ khí nào khác cần. Một vòng **báo trước** trên sàn trong 0,32 s
// trước khi lưỡi tới đất: rìu vừa là đòn chậm nhất game vừa là đòn duy nhất mà trượt là mất cả
// đòn, nên nó là chỗ duy nhất một lời báo trước đáng giá -- và nó báo cho *cả hai bên*, vì cái vòng
// ấy cũng là thứ dạy người chơi rằng đòn này nổ ở một điểm chứ không quét từ tay ra. Rồi một vòng
// sóng nở đúng tới `slam.r`: bán kính ăn là thứ đọc được bằng mắt, không phải bằng bảng chỉ số.
function drawSlam(w, e, p, o) {
  const wp = e.wp, S = wp.slam, sq = wp.squash;
  const ix = o.x + Math.cos(e.ang) * S.dist, iy = o.y + Math.sin(e.ang) * S.dist * sq;
  const fi = Math.min(wp.frames - 1, Math.floor(p * wp.frames));
  const at = wp.hits[0] / wp.frames;                // khung 7/16: lưỡi cắm xuống đất
  if (p < at) {
    const k = c01(p / at);
    ring(ix, iy, S.r * (1.55 - 0.55 * k), 1.0, wp.col, 0.14 + 0.26 * k, sq, 1.7);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + Math.PI * 0.25, rr = S.r * (1.15 - 0.35 * k);
      chevron(ix + Math.cos(a) * rr, iy + Math.sin(a) * rr * sq, a + Math.PI, 3.6, wp.lit, 0.30 * k);
    }
  }
  const set = ART.frames(wp.id);
  // Lật khi nhắm sang trái, và đây là *toàn bộ* phần "hướng" mà một cú nện có: cái lưỡi phải rơi từ
  // phía hero xuống điểm nện, nên nhắm sang tây thì tấm lật ngang chứ không quay.
  const flip = Math.cos(e.ang) < 0;
  if (set && set[fi]) {
    for (let tr = 2; tr >= 0; tr--) {
      const fr = set[Math.max(0, fi - tr)];
      if (!fr) continue;
      stampFrame(fr, ix, iy, 0, 1, tr === 0 ? 1 : 0.26 / tr, wp.lit, wp.gain, flip);
    }
  } else if (p < at) {
    // Bản không có art: một nét dựng đứng ngắn dần, tức là cái lưỡi *đang rơi* xuống đúng điểm nện.
    // Cùng câu chuyện, ít điểm ảnh hơn -- một nhát quét ngang ở đây sẽ là bản không-art kể một cơ
    // chế khác hẳn bản có art.
    const k = c01(p / at), h = 46 * (1 - k), bx = ix + (flip ? 13 : -13) * (1 - k);
    line(bx, iy - h - 8, ix, iy - 2, 3.0, wp.lit, 0.75, 1.5, 0.45);
    core(bx, iy - h - 8, 3.0, wp.lit, 0.7, 2);
  }
  if (p >= at) {
    const q = c01((p - at) / Math.max(1e-3, 1 - at)), fd = 1 - q * q;
    shockwave(ix, iy, S.r * (0.30 + 0.80 * q), 3.2, wp.col, wp.lit, 0.80 * fd, sq);
    cracks(ix, iy, 7, S.r * (0.75 + 0.45 * q), wp.col, 0.55 * fd, e.seed, sq, 1.2);
    cloud(ix, iy - 3, S.r * (0.45 + 0.40 * q), wp.col, 0.13 * fd, (e.seed ^ 0x51) | 0, 7, sq);
    core(ix, iy, 5.5 * fd, wp.lit, 0.90 * fd, 2);
    sparks(ix, iy, 11, 2, S.r * (0.55 + 0.65 * q), wp.col, 0.50 * fd, (e.seed + 7) | 0,
      0.9, sq, 0, TAU, 3);
  }
}

// Pose of the held weapon, in the hero's own terms: `rot` is an offset from the aim angle
// and `ext` is how far the grip is pushed out from the body. `p` is the live swing's 0..1,
// or -1 when the hero is just standing there holding the thing.
function heldPose(wp, p) {
  const hd = wp.hold;
  if (p < 0) return { rot: hd.rest, ext: 0, t: -1 };
  // Which beat of the combo this is, and how far through it. A beat runs from a little
  // before its hit frame to a little after, so the arm peaks on the frame `swingHit` fires
  // -- that is what makes a four-beat sword look like four strikes instead of one long one.
  const hits = wp.hits, n = hits.length, f = p * wp.frames;
  let bi = 0;
  for (let i = 0; i < n; i++) if (f >= hits[i] - 2.6) bi = i;
  const s0 = Math.max(0, (hits[bi] - 2.6) / wp.frames);
  const s1 = Math.min(1, (hits[bi] + 2.2) / wp.frames);
  const t = c01((p - s0) / Math.max(1e-3, s1 - s0));
  // Wind up over the first third, then snap through. The 0.5 exponent front-loads the
  // rotation, which is the difference between a slash and a windscreen wiper.
  const k = t < 0.34 ? -(t / 0.34) : -1 + 2 * fpow((t - 0.34) / 0.66, 0.5);
  const dir = (bi & 1) ? -1 : 1;                  // consecutive beats cut the other way
  // Recovery. Without it the weapon is still mid-follow-through on the sheet's last frame
  // and snaps to the resting cant the instant the fx is dropped, which reads as a glitch
  // rather than a swing; easing back over the tail costs nothing and removes the pop.
  const end = Math.min(0.86, (hits[n - 1] + 2.2) / wp.frames);
  const rc = p > end ? c01((p - end) / Math.max(1e-3, 1 - end)) : 0;
  const raw = hd.rest + hd.sweep * k * dir;
  return { rot: raw + (hd.rest - raw) * rc, ext: hd.ext * c01(k + 0.35) * (1 - rc), t: t };
}

// Draw the weapon in the hero's hand. Called twice per frame: once before the hero blit for
// the half of the aim circle that points away from the camera, once after for the half that
// points toward it, so a sword raised northward passes behind the shoulder and one thrust
// south covers the hip. `back` says which pass this is.
function drawHeld(w, back) {
  const h = w.hero, wp = w.wp;
  if (!wp || !wp.held) return;
  const e = w.sw;
  const ang = e ? e.ang
    : Math.atan2((w.aim.y - (h.y - h.h * 0.5)) / HELD_SQ, w.aim.x - h.x);
  if ((Math.sin(ang) < -0.12) !== !!back) return;
  const ps = heldPose(wp, e ? e.p : -1);
  const sgn = h.flip ? -1 : 1;                    // the pose mirrors with the sprite
  const hf = heroFrame(h);
  const hx = h.x + 4 * sgn, hy = h.y - h.h + 7 + hf.dy;
  blitRot(wp.held, wp.hpal,
    hx + Math.cos(ang) * ps.ext, hy + Math.sin(ang) * ps.ext * HELD_SQ,
    wp.hold.pv[0], wp.hold.pv[1], ang + ps.rot * sgn - SPRITE_UP,
    1, h.flash, HELD_SQ);
}

// One hit per entry in `hits`, fired the frame that entry becomes current. `crossed` makes
// that exact regardless of dt, the way the skills already do it. The cone is measured from
// the hero (or, for a shot, from where it was fired) and not from the sprite's advancing
// centre: a swing that travels outward would otherwise leave a foe *behind* its own cone
// on the later beats of a combo, and the last two hits of a scythe would silently whiff.
function swingHit(w, e) {
  const wp = e.wp, hits = wp.hits, last = hits.length - 1;
  // Cú lao đưa hero *xuyên qua* con quái, nhưng cái nón chỉ được đo đúng hai lần và cả hai đều sau
  // khi chân đã dừng: con vừa bị lướt qua lúc ấy nằm sau lưng, lệch gần π so với hướng nhắm, nên
  // phép thử góc chối đúng cái mà người chơi vừa thấy cạnh khiên đi qua. Nên suốt quãng lao, mỗi
  // khung lấy một mẫu cái nón và ghi lại những con đang ở trong đó; `also` mang cả tập ấy vào hai
  // nhịp cũ. Nón trượt dọc 52 px **là** vùng quét thật của cú xông -- một vòng tròn quanh chân thì
  // dễ viết hơn, nhưng nó sẽ đánh cả con đứng sau lưng lúc bấm, thứ chưa bao giờ nằm trong hình vẽ.
  //
  // Sát thương vẫn ở đúng hai nhịp cũ, không trả ngay lúc chạm: mỗi con vẫn ăn đúng hai lần với
  // đúng hai bậc như một nhát đứng tại chỗ, nên không có con số nào của khiên xê dịch -- chỗ duy
  // nhất đổi là *tập* những con được tính vào nón. Trả ngay lúc chạm còn phá đúng cái nhịp mà cả
  // con khiên dựng lên: `lunge.dur` ngắn hơn `hits[0]` để chân dừng lại *rồi* cạnh khiên mới tới.
  //
  // Cửa sổ đo bằng `e.t` chứ không bằng `h.dsh`: hero còn bất tử dở của một cú lướt né thì
  // `reswing` không bẻ hướng nữa, mà quãng lao vẫn chạy -- đọc chân là im lặng tắt mất cả cơ chế
  // này ở đúng lúc đó. Cùng lý do với `!e.mute`: bản sao vũ khí của đối thủ solo không gây sát
  // thương, nên nó cũng không cần gom ai.
  if (wp.lunge && !e.mute && e.t <= wp.lunge.dur) {
    const o = swingOrigin(w, e);
    if (!e.ram) e.ram = new Set();
    for (const f of w.foes)
      if (!f.dying && inCone(f, o.x, o.y, e.ang, wp.range, wp.arc)) e.ram.add(f);
  }
  for (let i = 0; i < hits.length; i++) {
    if (!crossed(e, hits[i] / wp.frames)) continue;
    const o = swingOrigin(w, e);
    // A bow has no cone at all: its one beat is the release, and everything after that
    // belongs to the arrow.
    if (wp.shot) { fireArrow(w, e, o); continue; }
    // Bản sao vũ khí của đối thủ solo (js/duel.js) chỉ để *nhìn*: sát thương của nó là việc của vệt
    // cảnh báo đã sinh ra nó. Chốt này đứng **sau** nhánh cung vì mũi tên do chính hàm này thả ra --
    // chặn sớm hơn một dòng là cú bắn của đối thủ không còn gì để thấy.
    if (e.mute) continue;
    // Later beats of a combo hit harder: the fifth punch of a gauntlet flurry is the one
    // that should feel like it finished the job.
    const step = last > 0 ? 1 + 0.5 * (i / last) : 1;
    // `fin` là *nhịp kết*, không phải chí mạng. Hai thứ này từng là một biến, và đó chính là
    // chỗ sinh ra "tỷ lệ chí mạng 0% mà đánh thường vẫn nổ chí mạng": nhịp cuối của mọi combo
    // luôn true. Nhịp kết vẫn còn nguyên việc của nó -- mở cửa sổ chuỗi, hút máu, xử trảm, cắt
    // -- còn chí mạng thì `hurt` quay một lần duy nhất theo tỷ lệ thật của nhân vật.
    //
    // Một vũ khí *một nhịp* thì nhịp duy nhất ấy **là** nhịp kết, nên không có `last > 0` ở đây.
    // Trước có, và nó vô hại đúng đến lúc rìu ra đời: `maul` treo trên nhịp kết mà rìu chỉ có một
    // nhịp, nên cả cơ chế của nó sẽ im lặng không chạy. Năm vũ khí kia đều từ hai nhịp trở lên
    // (cung một nhịp nhưng đã `continue` ở trên), nên đổi chỗ này không xê dịch con số nào.
    const fin = i === last;
    // `e.momo` was decided once, by `swing`, so the bonus covers the whole chain rather than
    // flickering on and off between beats as the window ticks down underneath it.
    const amount = wp.dmg * step * (e.momo ? wp.momentum.dmg : 1);
    // Hình cái đòn. Tám vũ khí là một cái nón mở ra từ hero; một cú nện là một *điểm* cách chân
    // `slam.dist` px theo hướng nhắm, nổ thành một vòng bán kính `slam.r`. Không cần hàm mới: dời
    // gốc nón tới điểm ấy rồi mở góc ra π là `hitCone` thành một cái vòng tròn (nó gấp `da` về
    // [0, π] nên π không loại con nào), và cú hẩy tự bung ra theo bán kính vì `hitCone` vốn đẩy
    // theo trục *từ gốc nón* tới địch. Cả cơ chế của rìu là ba dòng dưới đây.
    //
    // Riders vẫn đo từ `o`, không từ điểm nện: `tip` là "hero đứng cách bao xa" -- một chuyện của
    // đôi chân -- nên nếu có ngày một vũ khí mang cả `slam` lẫn `tip` thì nó vẫn phải trả tiền cho
    // chỗ đứng, chứ không phải cho chỗ lưỡi rơi.
    let cx = o.x, cy = o.y, cr = wp.range, cw = wp.arc;
    if (wp.slam) {
      cx += Math.cos(e.ang) * wp.slam.dist;
      cy += Math.sin(e.ang) * wp.slam.dist * wp.squash;
      cr = wp.slam.r; cw = Math.PI;
    }
    const rid = swingRiders(w, wp, fin, o, step);
    // Những con đã chạm phải trong lúc lao: tính là trong nón dù giờ đã ở sau lưng.
    if (e.ram) rid.also = e.ram;
    const n = hitCone(w, cx, cy, e.ang, cr, cw, amount,
      wp.col, false, wp.push + i * wp.pushStep, rid);
    if (!n) continue;
    w.shake = Math.max(w.shake, wp.shake * 0.8);
    // Paid in blood rather than in damage, and only on the finisher: the earlier beats are
    // the gathering (each one pulls harder than the last), the last one is the reaping, and
    // it counts whoever the pull actually managed to drag into the cone. Per-beat healing
    // would turn a crowd into a fountain -- three foes would out-heal the contact drain by
    // a factor of two -- and would pay the scythe for swinging rather than for gathering.
    // The second foe onward, so one target is a hit and only a crowd is a meal.
    if (fin && wp.harvest && n > 1) healHero(w, wp.harvest * (n - 1));
    // Landing the finisher is what opens the sword's window. Whiffing it leaves the window
    // shut -- `swing` already spent whatever was there -- which is the whole bargain.
    if (fin && wp.momentum) w.momo = wp.momentum.win;
  }
}

// Per-target riders, built from whatever identity the weapon carries: the cone knows distance
// and angle, and none of these can be expressed in those terms. The saber's bonus reads how
// wounded the target already is; the gauntlet's reads whether it is casting.
//
// Hai loại rider, và ranh giới giữa chúng là một quyết định thiết kế chứ không phải một chi tiết
// cài đặt. `tip` với `rend` chạy ở **mọi nhịp**: cả mặt hàng của thương là giữ mũi ở đúng khoảng
// và của vuốt là cào đủ nhịp lên cùng một con, nên một phần thưởng chỉ trả ở nhịp cuối sẽ dạy
// người chơi đứng sai ở tất cả những nhịp trước nó. Còn `exec`/`cut`/`maul` chỉ ở nhịp kết, vì
// chúng là *kết quả* của việc đánh trọn một combo, không phải là cách đánh nó.
//
// `step` là bậc của nhịp đang đánh, và hai rider chạy-mọi-nhịp nhân vào nó: bảng chỉ số hứa
// "mũi ×1.40" với "xé +22% mỗi vết", tức là phần trăm của *cú đánh ấy*. Không nhân thì nhịp
// bậc 1.5 chỉ được thưởng 26% thay vì 40% và cái nhãn nói sai. `exec`/`cut`/`maul` không cần
// nhân: chúng nổ đúng một lần ở một bậc cố định, nên nhân vào chỉ là chỉnh lại một hằng số.
function swingRiders(w, wp, fin, o, step) {
  // `phys` is unconditional: a swing is the physical path, so gear scales it by +ATK rather
  // than +Magic ATK.
  const r = { phys: true };
  const sp = step === undefined ? 1 : step;
  // Mũi giáo. Đo lại đúng cái khoảng cách `hitCone` đo -- dy chia SWING_SQ, nên đánh sang bên và
  // đánh xuống dưới cùng một thước -- rồi chỉ trả thưởng trên 60% ngoài của tầm. Trong 40% trong
  // thì bằng đúng con số trên bảng: cây thương không có phần thưởng nào cho việc đứng gần.
  if (wp.tip) r.amp = f => wp.dmg * sp * (wp.tip - 1) *
    c01((Math.hypot(f.x - o.x, (midY(f) - o.y) / SWING_SQ) - wp.range * 0.40) / (wp.range * 0.45));
  // Vết xé. `amp` đọc số vết *đang* có rồi `onHit` mới thêm vết, và thứ tự đó là cả cơ chế: nhịp
  // đầu tiên lên một con chưa có vết nào ra đúng `dmg`, còn nhịp thứ tư ăn ba vết của ba nhịp
  // trước. Chồng vết nằm trên **con quái**, không trên nhát đánh, nên bỏ nó ra là mất.
  if (wp.rend) {
    r.amp = f => wp.dmg * sp * wp.rend.add * f.rnd;
    r.onHit = f => { f.rnd = Math.min(wp.rend.max, f.rnd + 1); f.rndT = wp.rend.life; };
  }
  if (!fin) return r;
  // Ở nhịp kết. Không vũ khí nào mang hai trong ba cái dưới đây, và cũng không cái nào mang
  // `tip`/`rend` cùng lúc với chúng, nên gán thẳng chứ không phải cộng dồn hai hàm.
  if (wp.exec) r.amp = f => wp.dmg * wp.exec * c01(1 - f.hp / f.maxhp);
  if (wp.cut) r.onHit = f => cutCast(w, f, wp.cut);
  // Chặt què. `f.slow` đã có sẵn và `stepFoe` đã đọc nó (còn 0,34 tốc), nên cả cơ chế của rìu là
  // một phép gán -- đúng cùng lối mà `cut` mượn `f.frozen` của js/foe-abil.js.
  if (wp.maul) r.onHit = f => { f.slow = Math.max(f.slow, wp.maul); };
  return r;
}

// Snuff a wind-up. This deliberately does not stun and does not damage: `stepTel` drops any
// telegraph whose owner is frozen and pushes the owner's next attempt out by 1.1 s, so the
// whole interrupt is one field plus something to look at. The burst is its own fx entry
// because `swingHit` runs in the sim and has no draw phase of its own.
const CUT_C = hexc('#ffd24a'), CUT_H = hexc('#fff4c8');
const CUT_SK = {
  id: 'cut', name: 'Cắt Phép', mode: 'dir', dur: 0.34, cd: 0, shake: 0,
  mid(w, e, p) {
    const d = e.data, fd = fade(p, 0.18), g = eo(p);
    // Collapsing inward, the opposite of every cast in the game: the shape a telegraph makes
    // as it fills is a ring growing, so a ring closing reads as one being taken away.
    ring(d.x, d.y, 15 * (1 - g) + 3, 1.6, CUT_C, 0.85 * fd, 0.55);
    ring(d.x, d.y, 22 * (1 - g) + 4, 1.0, CUT_H, 0.45 * fd, 0.55);
    for (let i = 0; i < 4; i++)
      chevron(d.x, d.y, i / 4 * TAU + Math.PI * 0.25, 4.0 + 3 * (1 - g), CUT_C, 0.70 * fd);
    core(d.x, d.y, 4.5 * fd, CUT_H, 0.95 * fd, 2.2);
    sparks(d.x, d.y, 9, 2, 17, CUT_C, 0.60 * fd, e.seed, 0.9, 0.7, 0, TAU, 3);
  },
};
function cutCast(w, f, hold) {
  if (!f.tel || f.tel.fired) return;
  f.frozen = Math.max(f.frozen, hold);
  w.fxs.push({
    sk: CUT_SK, i: -1, t: 0, dur: CUT_SK.dur, p: 0, pt: 0,
    seed: w.rng.int(1, 1e9) | 0, ox: f.x, oy: f.y, x: f.x, y: f.y, ang: 0,
    data: { x: f.x, y: f.y - f.h * 0.5 }
  });
  w.shake = Math.max(w.shake, 1.6);
  SFX.blocked();
}

// ---- the bow's arrow ------------------------------------------------------------------
// The other four weapons ask "is it in front of me right now". This one asks "will it still
// be there when the arrow gets there", and answers with how far the arrow had flown when it
// arrived. Distance stops being a number on the sheet and becomes something the player has
// to keep hold of, which is the only reason the weapon plays differently at all.
const ARR_C = hexc('#d9fdff'), ARR_H = hexc('#ffffff'), ARR_T = hexc('#6fb4d6');
const ARROW_SK = {
  id: 'arrow', name: 'Mũi Tên', mode: 'dir', dur: 1, cd: 0, shake: 0,
  // Mũi tên chỉ để nhìn (bản sao của đối thủ solo) không được gọi `hit`, mà chính `arrowHit` là chỗ
  // dồn `trav` lên mỗi khung. Nên khi bị chặn thì phải tự tính ở đây, bằng không mũi tên của đối thủ
  // đứng nguyên tại cây cung suốt cả đường bay.
  mid(w, e, p) { if (e.mute) e.data.trav = p * e.data.max; drawArrow(w, e); },
  hit(w, e) { arrowHit(w, e); },
};
// One release, `fan` arrows. The offsets are symmetric about the aim, so the middle arrow of
// an odd fan is the aimed one and carries full power; everything off the centre line is a
// flanker at `side`. Each arrow is clipped against the arena on *its own* angle -- a fan
// loosed along a wall would otherwise keep its outer legs flying through the void.
function fireArrow(w, e, o) {
  const s = e.wp.shot, n = s.fan || 1, sp = s.spread || 0;
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * sp;
    looseArrow(w, e, o, i, e.ang + off, off === 0 ? 1 : (s.side == null ? 1 : s.side));
  }
}
function looseArrow(w, e, o, i, ang, mul) {
  const wp = e.wp, s = wp.shot;
  // Clip the flight to the arena, or an arrow loosed at a wall keeps going through the void
  // with its trail still lit. Coarse steps: 8 px of overshoot on a 210 px flight is not a
  // thing anyone can see, and a slab test here would be exact about nothing that matters.
  const ca = Math.cos(ang), cy = Math.sin(ang) * wp.squash;
  let max = s.max;
  // `e.cap` là hạn bay do người gọi đặt: bản sao vũ khí của đối thủ solo chỉ được bay đúng bằng vệt
  // cảnh báo `line` đã vạch ra, vì đó mới là đoạn thật sự có sát thương. Không chặn thì mũi tên nhìn
  // thấy bay quá chỗ ăn đòn và người chơi học sai khoảng an toàn.
  if (e.cap > 0) max = Math.min(max, e.cap);
  const lim = max;
  for (let d = 8; d <= lim; d += 8) {
    const px = o.x + ca * d, py = o.y + cy * d;
    if (px < BOUND.x0 || px > BOUND.x1 || py < BOUND.y0 - 20 || py > BOUND.y1) { max = d; break; }
  }
  // `wp` stays out of the entry and inside `data`: `step` picks the live swing by looking for
  // `.wp`, and an arrow in flight is not a swing -- it must never drive the pose of the bow
  // in the hero's hands. `dur` is the real flight time, so `e.p` *is* the fraction flown.
  // The seeds are spread apart per arrow, or the three sets of ripening sparks would twinkle
  // in lockstep and the fan would read as one wide arrow instead of three.
  w.fxs.push({
    sk: ARROW_SK, i: -1, t: 0, dur: max / s.spd, p: 0, pt: 0,
    seed: (e.seed * 7 + 13 + i * 1013) | 0, ox: o.x, oy: o.y, x: e.x, y: e.y,
    // Mũi tên thừa hưởng cả người thả lẫn chốt "chỉ để nhìn" của nhát bắn sinh ra nó.
    by: e.by || null, mute: e.mute || 0,
    ang, data: { wp, s, max, mul, trav: 0, was: 0, hit: [] }
  });
}

// One pass per frame over the segment the arrow covered since the last one, so a 300 px/s
// arrow cannot tunnel past a foe between frames. Everything is measured in the squashed
// frame `hitCone` uses, so a shot to the north and a shot to the east need the same aim.
function arrowHit(w, e) {
  const d = e.data, s = d.s, wp = d.wp;
  d.was = d.trav; d.trav = e.p * d.max;
  if (d.trav <= d.was) return;
  const ca = Math.cos(e.ang), sa = Math.sin(e.ang);
  for (const f of w.foes) {
    if (f.dying || d.hit.indexOf(f) >= 0) continue;
    const dx = f.x - e.ox, dy = (midY(f) - e.oy) / wp.squash;
    const t = dx * ca + dy * sa;                       // how far along the shaft it stands
    const r = s.thick + f.w * 0.35;
    if (t < d.was - r || t > d.trav + r) continue;      // not in the slice flown this frame
    if (Math.abs(dy * ca - dx * sa) > r) continue;      // beside the shaft, not on it
    // Pierce: the arrow keeps its speed and its ramp, and only the memory of who it already
    // hit stops it scoring the same foe twice. A line of monsters is the payoff for kiting.
    d.hit.push(f);
    const k = c01(Math.max(t, 0) / s.ramp);
    // `mul` là của riêng mũi này, nên hai mũi biên vừa đau ít hơn vừa đẩy nhẹ hơn. Mũi chính
    // trúng đúng tầm ngọt *không* còn tự tính là chí mạng: một tỷ lệ duy nhất trong `hurt`
    // quyết định điều đó, cho cả cung, cả kiếm, cả mười sáu chiêu.
    const amt = (s.near + (s.far - s.near) * k) * d.mul;
    hurt(w, f, amt, wp.col, false,
      ca * s.push * k * d.mul, sa * s.push * k * 0.5 * d.mul, true);
  }
}

function drawArrow(w, e) {
  const d = e.data, s = d.s, sq = d.wp.squash;
  const ca = Math.cos(e.ang), sa = Math.sin(e.ang) * sq;
  const x = e.ox + ca * d.trav, y = e.oy + sa * d.trav;
  // Hai mũi biên vẽ nhạt hơn. Ba mũi cùng độ sáng thì cái nan quạt đọc ra là một vệt rộng và
  // người chơi mất luôn thứ duy nhất cần ngắm: mũi giữa là mũi mang đủ sát thương.
  const g = d.mul >= 1 ? 1 : 0.62;
  // A short streak behind the head, not a line back to the bow: an arrow is a thing in
  // flight, and a tracer all the way home is a thing that has already arrived.
  const tl = Math.min(d.trav, 22), bx = x - ca * tl, by = y - sa * tl;
  line(bx, by, x, y, 2.6, ARR_T, 0.22 * g, 1.5, 0.9);
  line(bx, by, x, y, 1.2, ARR_C, 0.70 * g, 1.5, 0.8);
  line(x - ca * 6, y - sa * 6, x, y, 0.8, ARR_H, 1.0 * g, 1.5, 0.7);
  chevron(x, y, e.ang, 3.4 * (d.mul >= 1 ? 1 : 0.82), ARR_C, 0.75 * g);
  core(x, y, 2.6, ARR_C, 0.80 * g, 2);
  core(x, y, 1.1, ARR_H, 1.10 * g);
  // The head brightens as the shot ripens, so the damage ramp is legible in the air instead
  // of being something the player infers from the numbers afterwards.
  const k = c01(d.trav / s.ramp);
  if (k > 0.5) {
    const gg = (k - 0.5) / 0.5;
    ring(x, y, 3 + 3 * gg, 1.1, ARR_H, 0.30 * gg * g, 0.7);
    sparks(x, y, 5, 1, 9, ARR_C, 0.35 * gg * g, e.seed, 0.7, sq,
      e.ang + Math.PI - 0.5, e.ang + Math.PI + 0.5, 3);
  }
}

// What the picker and the tooltip say a weapon does. Melee is `dmg` per beat times beats; a
// bow has neither, because its damage is a curve over distance and its reach is the flight --
// so it gets its own sentence rather than a `dmg` field that would have to lie.
function weaponStat(wp) {
  if (wp.shot) {
    const n = wp.shot.fan || 1;
    // `near`–`far` là dải của mũi giữa, nên khi có nan quạt thì phải nói ra số mũi: bằng
    // không dòng này đọc ra là cả đòn chỉ đáng bằng một mũi.
    return (n > 1 ? n + ' mũi · ' : '') +
      `${wp.shot.near}–${wp.shot.far} theo tầm · xuyên · bay ${wp.shot.max}`;
  }
  // Một vũ khí tự mang hero đi thì tầm ghi trên bảng nói thiếu: tầm với được là `range` cộng
  // cả khoảng vừa lướt qua. Ghi rời hai số chứ không cộng sẵn, vì cú lao là thứ xảy ra dù có
  // trúng ai hay không -- người chơi cần biết nó *đi* bao xa, không chỉ với tới đâu.
  return `${wp.dmg}×${wp.hits.length} nhịp · tầm ${Math.round(wp.range)}`
    + (wp.lunge ? ` · lao ${Math.round(wp.lunge.len)}` : '')
    // Cú nện phải nói ra bán kính, vì `tầm 58` một mình đọc ra là một cái nón 58 px như tám cái kia,
    // còn thứ nó thật sự làm là nổ một vòng 32 px ở cách chân 26 px -- kể cả sau lưng cái vòng ấy.
    + (wp.slam ? ` · nện vùng ${Math.round(wp.slam.r)}` : '')
    // Hai cái này phải nói ra bằng số, vì cả hai đổi hẳn con số bên trái: `dmg×nhịp` của thương
    // là con số lúc đứng gần (thấp nhất của nó), còn của vuốt là con số lúc chưa có vết nào.
    + (wp.tip ? ` · mũi ×${wp.tip.toFixed(2)}` : '')
    + (wp.rend ? ` · xé +${Math.round(wp.rend.add * 100)}% mỗi vết` : '');
}

// Push the hero along the swing's own angle. This reuses the dash's three fields rather than
// adding a second kind of scripted movement: `step` already owns `h.dsh` -- it clamps to
// BOUND, it ignores WASD while it runs and it holds the walk pose instead of sprinting on the
// spot -- so a lunge is a dash the weapon asked for. What it deliberately does *not* touch is
// `h.inv`: the i-frames are what make the dodge a dodge, and a basic attack must not sell them.
//
// The y term carries `wp.squash` for the same reason `drawSwing` does: the world is a 3/4 view,
// so a lunge north has to cover less ground than a lunge east or the hero slides out from under
// his own arc. Overwriting a live dash is intentional -- the player just asked for this instead.
function lungeHero(w, ang, wp) {
  const L = wp.lunge, h = w.hero;
  const tx = clamp(h.x + Math.cos(ang) * L.len, BOUND.x0, BOUND.x1);
  const ty = clamp(h.y + Math.sin(ang) * L.len * wp.squash, BOUND.y0, BOUND.y1);
  h.dsh = L.dur;
  h.dvx = (tx - h.x) / L.dur;
  h.dvy = (ty - h.y) / L.dur;
}

// Fire the basic attack. Same contract as `cast`: returns false when it is on cooldown,
// so the hotbar and the keyboard path can share one call.
function swing(w, tx, ty) {
  const wp = w.wp;
  if (!wp || w.wcd > 0) return false;
  const h = w.hero;
  const e = {
    sk: wp.sk, wp: wp, i: -1, t: 0, dur: wp.dur, p: 0, pt: 0,
    seed: w.rng.int(1, 1e9) | 0, ox: h.x, oy: h.y - h.h * 0.5, data: {}
  };
  e.x = clamp(tx, BOUND.x0 - 18, BOUND.x1 + 18);
  e.y = clamp(ty, BOUND.y0 - 16, BOUND.y1 + 10);
  e.ang = Math.atan2((e.y - h.h * 0.5 - e.oy) / wp.squash, e.x - e.ox);
  // Spend the window here and not per beat, so the whole chain is either fast or it is not.
  // Clearing it on use is what makes momentum a thing you keep re-earning: the finisher of
  // *this* swing has to land again to open the next one.
  e.momo = !!(wp.momentum && w.momo > 0);
  if (e.momo) w.momo = 0;
  // Đẩy chân ngay ở đây, không đợi `drawSwing`: `step` giải chuyện hero đi đâu *trước* khi
  // chạy các fx, nên đặt cú lướt ở đường vẽ là trễ đúng một khung và nhát đánh sẽ xuất phát
  // từ chỗ cũ.
  if (wp.lunge) lungeHero(w, e.ang, wp);
  w.fxs.push(e);
  // +Attack Speed shortens the wait rather than speeding up the animation: the swing art is
  // authored at one tempo, and the thing the player feels is how soon the next one is legal.
  w.wcd = (e.momo ? wp.momentum.cd : wp.cd) / (1 + w.gs.aspd / 100);
  w.shake = Math.max(w.shake, wp.shake * 0.5);
  h.flip = e.x < h.x;
  SFX.cast(wp.id, clamp((h.x - w.cam.x - W * 0.5) / (W * 0.5), -1, 1));
  return true;
}

// Ngắm lại nhát *đang chạy*. Chỉ ngón tay gọi tới đây (xem `hold.drag` trong shell.js): đánh
// thường trên điện thoại nổ ngay ở cú chạm chứ không chờ nhả, nên không có hàm này thì cử chỉ
// kéo ngắm chỉ ăn từ nhát *sau*, còn nhát vừa bấm vẫn bay vào con quái mà `touchAim()` chọn --
// đúng thứ người chơi đọc ra là "kéo ngắm không bằng con quái ở gần".
//
// Sửa được là vì bốn vũ khí này không giải xong ở khung bấm: cung bật dây ở nhịp 8, tức 0,29 s
// sau cú bấm; khiên lao 0,22 s rồi mới hẩy ở nhịp 7 (0,25 s); thương đâm ở nhịp 5 của một tấm
// 30 fps (0,17 s); rìu nện ở nhịp 7 của một tấm 22 fps (0,32 s, chậm nhất game). Trong quãng đó
// mũi tên còn chưa rời dây và cái lưỡi còn chưa tới đất, nên đây không phải sửa lại quá khứ.
//
// Điều kiện thứ hai, và nó mới là điều kiện thật: bẻ được hay không phụ thuộc **hình cái đòn**.
// Một cú bắn, một cú lao, một đường đâm và một điểm nện đều bẻ có nghĩa -- đổi hướng bay, đổi chỗ
// mình sẽ đứng, đổi cái hàng mình xuyên, đổi chỗ lưỡi rơi. Còn năm vũ khí kia quét một cái nón
// rộng 1,05–2,25 rad trong 3–5 nhịp: cho ngắm lại giữa chuỗi là cho cái nón đi vòng quanh hero,
// tức là một nhát vung trúng cả bốn phía. Cờ này chốt ở `wp.reaim` (xem vòng hậu kỳ dưới bảng vũ
// khí), một chỗ, và js/shell.js đọc đúng nó để quyết định nút ĐÁNH có kéo ngắm được không.
function reswing(w, tx, ty) {
  // Nhát đang chạy chọn *giống* `step`: entry cuối có `.wp`. Hồi của các vũ khí này vẫn dài hơn
  // tấm hiệu ứng của nó (0,70 > 0,57 với cung; 0,58 > 0,571 với khiên) nên bình thường chỉ có một
  // -- mà kể cả khi +Tốc Đánh ép hai nhát chồng nhau thì `for` này vẫn trả về nhát *mới nhất*, đúng
  // cái mà ngón tay đang ngắm. Mũi tên đang bay không có `.wp` (nó ở trong `data`).
  let e = null;
  for (const x of w.fxs) if (x.wp) e = x;
  if (!e || !e.wp.reaim) return false;
  const wp = e.wp, h = w.hero;
  e.x = clamp(tx, BOUND.x0 - 18, BOUND.x1 + 18);
  e.y = clamp(ty, BOUND.y0 - 16, BOUND.y1 + 10);
  // Góc đo từ chỗ hero đang đứng *ở khung này*, không từ `e.ox/e.oy` như `swing()`: lúc bấm hai
  // chỗ đó là một, nhưng sau đó hero đã đi (khiên vừa lao 52 px), và điểm ngắm thì `holdTrack`
  // cũng tính lại từ chỗ mới -- đo từ chỗ cũ là góc lệch đi đúng quãng vừa trượt. `e.ox/e.oy` giữ
  // nguyên vì nó là *chỗ xuất phát*: vệt lao vẽ từ đó.
  e.ang = Math.atan2((e.y - h.y) / wp.squash, e.x - h.x);
  h.flip = e.x < h.x;
  // Cú lao đã xuất phát thì bẻ *phần còn lại*, giữ nguyên tốc: quãng vẫn đúng `len`, chỉ đường đi
  // thành một nét gấp. Không cần kẹp BOUND ở đây vì `step` kẹp lại từng khung.
  //
  // `h.inv` là để không bẻ một cú lướt né: `dash()` cho 0,30 s bất tử cho một cú trượt 0,155 s,
  // nên inv > 0 giữa lúc đang trượt nghĩa là cú trượt này là của lướt né chứ không phải của khiên
  // -- và "không lái được" là cả điều khoản của lướt né.
  if (wp.lunge && h.dsh > 0 && h.inv <= 0) {
    const sp = wp.lunge.len / wp.lunge.dur;
    h.dvx = Math.cos(e.ang) * sp;
    h.dvy = Math.sin(e.ang) * sp * wp.squash;
  }
  return true;
}
