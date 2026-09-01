"use strict";
// ===========================================================================
// 11. Chế độ SOLO: một mình đấu một AI mang vũ khí và ba skill ngẫu nhiên.
// ===========================================================================
// Chế độ arena là "sáu loại quái vây lấy bạn". Chế độ này là câu hỏi ngược lại: *một* đối thủ,
// cùng bộ khung xương với người chơi, cùng một vũ khí trong tay và ba chiêu rút thăm -- rồi xem ai
// đọc được ai. Nên nó không phải một con boss thứ tư. Boss là một bảng chiêu cố định để học thuộc;
// đối thủ ở đây rút thăm lại mỗi trận, và cái phải học là *cách đọc một bộ kit lạ*.
//
// Toàn bộ file này chạy trên đường **soi gương**: đối thủ là một phần tử `w.foes` bình thường dưới
// một `KIND.rival` đăng ký bằng cách *đột biến* ba cái bảng có sẵn (`KIND`, `GRIDS`, `ANIM`) chứ
// không sửa file chủ của chúng -- xem js/README.md về việc `const` trên một object không đóng băng
// object. Nhờ vậy nó nhận không mất một dòng nào: `hurt` (kể cả chí mạng, kể cả +ATK của trang bị),
// hất ngược theo `mass`, đóng băng, làm chậm, vết xé của vuốt, thanh máu, `drawFoe`, `foeFrame`,
// rơi trang bị lúc chết, và cả cái minimap.
//
// Ba chỗ *không* đi đường có sẵn, và mỗi chỗ có lý do riêng:
//
//   * **Bộ não.** `tryCast` mở đầu bằng `if (!list || !list.length) return false;`, nên
//     `KIND.rival.abil = []` giao toàn bộ việc chọn chiêu cho `stepRival`. Cách chọn của quái là
//     "chiêu đầu tiên trong danh sách còn với tới" -- đúng cho một con nhớt, vô nghĩa cho một đối
//     thủ phải cân mana, hồi chiêu, khoảng cách và cả việc người chơi đang bất tử.
//   * **Bộ chân.** `stepFoe` chỉ biết đi thẳng tới nhân vật (hoặc giữ một băng `keep` cố định). Một
//     đối thủ biết *bước ra khỏi vùng cảnh báo* thì không thể dùng bộ chân đó, nên `stepRival` thay
//     nó -- và vì thay, nó phải tự làm lại đúng ba việc `stepFoe` đang làm: rã lực hất
//     (`Math.exp(-dt*7)`), kẹp `BOUND`, và đếm `f.mv`/`f.ph` cho vòng chân.
//   * **Đòn đánh.** Đòn của nó là các hàng `FOE_ABIL` (khoá `r_*` cho chiêu, `w_*` cho vũ khí), nên
//     nó đi qua `w.tels` → `stepTel` → `hitHero`. Nghĩa là *mọi đòn đều có vùng cảnh báo vẽ trên
//     sàn*, tắt được bằng đóng băng, có tiếng tick trước 0,2 s, và ăn đúng thứ tự bất tử → né của
//     trang bị → `w.god` → `guard` của vũ khí → +DEF. Một AI thông minh mà đánh không báo trước thì
//     không phải khó, chỉ là không đọc được.

// ---- hình đối thủ ------------------------------------------------------------------------------
// Cùng một bộ khung xương với nhân vật -- đây là một trận đấu tay đôi, không phải một con quái --
// nên chỉ đổi màu. Và đổi bằng cách tráo *ký tự*, không thêm màu mới: `drawFoe` truyền `null` làm
// palette cho mọi lưới vẽ tay, nên một ô mang ký tự lạ sẽ vẽ ra khoảng trống. Sáu ký tự dưới đây
// đều đã có trong `PAL` (js/sprites.js).
//
// Tím trên nền gần đen, viền hoen rỉ: cái phải đọc được trong một phần tư giây giữa lúc đánh nhau
// là "cái đang động đậy kia không phải mình", và khối thân là chỗ mắt nhìn vào -- nên chính nó đổi
// màu hẳn, còn khuôn mặt giữ nguyên nước da: đối thủ là *một người*, không phải một con thú.
const RIVAL_CH = { A: 'V', a: 'v', C: 'R', c: 'r', L: 'v', B: 'E' };
const RIVAL = HERO.map(row => row.replace(/[AaCcLB]/g, ch => RIVAL_CH[ch]));
GRIDS.rival = RIVAL;
{
  // `arm`/`out` là hai ô bàn tay của hai khung đánh, nên chúng lấy màu viền của chính bộ giáp này.
  const A = heroSet(RIVAL, 0, 0, 'R', 'K');
  // `foeFrame` đọc `a.cast` trước cả vòng chân, và đó là toàn bộ lý do bộ ba này có mặt: một đối
  // thủ đang lên đòn phải *nhìn ra* là đang lên đòn, kể cả khi vùng cảnh báo dưới chân nó bị một
  // vũng lửa của người chơi che mất. Nửa đầu đồng hồ nó còn đứng thẳng, nửa sau nó rút tay về, và
  // khung cuối là khung đánh -- `stepTel` giữ khung ấy thêm `REL_HOLD` sau khi đòn đã nổ.
  A.cast = [A.idle[0], A.atk[0], A.atk[1]];
  ANIM.rival = A;
}
// ---- số của đối thủ ----------------------------------------------------------------------------
// `abil: []` là *cái công tắc*: `tryCast` thoát ngay ở dòng đầu, nên không có đường nào ngoài
// `stepRival` bắt được nó đánh. Nó cũng có nghĩa là bảng hướng dẫn (js/shell.js sinh bảng quái từ
// `KIND[].abil`) không liệt kê nó -- đúng ý: kit của nó rút thăm mỗi trận, một bảng cố định in ra
// trước trận sẽ là một lời nói dối.
//
// `spd` 58 chứ không phải 27 như con oan hồn nhanh nhất. Bộ chân dưới nhân `ay` với 0,72 nên nó đi
// được 58/41,8 px/s, so với 56/42 của nhân vật: gần như bằng. Một đối thủ chạy chậm hơn thì không
// cần đọc gì cả, chỉ cần bỏ chạy là thắng -- và lúc ấy cái AI này vô nghĩa. `keep` không có: băng
// khoảng cách của nó lấy từ *vũ khí nó rút được*, không phải một con số của loài.
KIND.rival = { hp: 1200, spd: 58, mass: 1.15, cyc: 5.5, label: 'Kẻ Thách Đấu', abil: [] };

// Sân đấu tay đôi, dựng trên đúng cơ chế phòng boss (`w.room` + `roomApply`, js/gate.js): thu
// `BOUND` và `CAMB` lại chứ không đổi cỡ thế giới, nên vẫn là *miếng map ấy* -- cùng sàn, cùng cột
// đá, cùng thời tiết. Hẹp hơn phòng boss (640x420) vì một trận một-đối-một cần ít đất chạy hơn một
// con boss sáu chiêu, nhưng vẫn phải **rộng hơn khung nhìn**: `W` lên tới 480 trên điện thoại và
// `roomApply` sẽ đảo hai đầu kẹp camera nếu phòng hẹp hơn khung.
const DUEL_W = 520, DUEL_H = 340;
const DUEL_INTRO = 1.30;     // giây trước khi đối thủ bước vào
const DUEL_END = 1.35;       // giây đứng nhìn sau khi một bên gục, trước khi menu tạm dừng mở ra
// Mana của cả hai bên, hạ hẳn xuống so với arena. `DUEL_MPX` nhân vào **cả bình lẫn tốc độ hồi** của
// nhân vật (xem `syncGear` và dòng hồi mana trong js/world.js), nên 0,55 đổi 120 mana / 7,5 mỗi giây
// thành 66 / 4,1: đủ hai chiêu rẻ rồi phải sống bằng cây vũ khí một quãng.
//
// Vì sao hạ, và vì sao hạ cho *cả hai*: trận tay đôi ở mức mana cũ là hai bên thay nhau thả chiêu, và
// cái quyết định thắng thua là ai rút được bộ kit tốt hơn. Ít mana thì phần lớn thời gian cả hai chỉ
// có cây vũ khí trong tay -- khoảng cách, hướng ngắm, cửa sổ sau một nhát vung -- còn ba chiêu thành
// thứ để *dành*. Hạ một bên thôi thì đó không phải một luật của chế độ, đó là một cái điều chỉnh độ
// khó, và nó nói dối về chuyện hai bên đang chơi cùng một trò.
const DUEL_MPX = 0.55;
const DUEL_MP = 72, DUEL_MPR = 4.6;   // của đối thủ, xấp xỉ nhân vật sau khi nhân `DUEL_MPX`

// Một trận, một lần. 1200 máu là khoảng 15-25 giây đánh sạch của một bộ kit khá -- đủ dài để cả hai
// bên dùng hết một lượt hồi chiêu, đủ ngắn để thua không mất nửa phút. Con số nằm ở `KIND.rival.hp`
// chứ không ở một cái thang theo vòng: đánh tới lúc một trong hai gục là hết, nên không có vòng nào
// để leo, và một đối thủ dày máu hơn chỉ làm cùng một trận dài ra.

// ---- bảng hiểm: mười sáu chiêu của người chơi, đọc từ phía bị đánh ------------------------------
// Đây là chỗ chữ "thông minh" thật sự nằm. Bán kính của mười sáu chiêu bị *nướng vào trong thân hàm
// `hit()`* của js/skills.js -- `hitCircle(e.x, e.y - 6, 44, 165, 42)` -- nên không có cách nào đọc
// chúng lúc chạy. Bảng này viết lại đúng những con số ấy thành **dữ liệu**, để bộ não so được "mình
// có đang đứng trong cái sắp nổ không" thay vì đợi ăn đòn rồi mới biết.
//
// Hệ quả trực tiếp: bảng này *phải* đi cùng js/skills.js. Ai đổi một bán kính trong đó mà không đổi
// ở đây thì AI sẽ né một vòng tròn không tồn tại, hoặc đứng yên trong một vòng tròn có thật. Đó là
// một bản sao, và một bản sao là một món nợ -- nhưng món nợ này rẻ hơn hai lựa chọn còn lại: thêm
// một trường `r` vào cả mười sáu chiêu (sửa mười sáu chỗ trong một file không liên quan gì tới chế
// độ này), hay để AI đoán bằng cách thử.
//
//   `an`  neo của vùng: 'e' = điểm đã chấm (`e.x`/`e.y` -- chiêu point đứng yên tại chỗ chấm),
//         'h' = **thân nhân vật lúc này** (hai chiêu `self` đánh theo người chơi chứ không theo
//         chỗ đã bấm, nên né chúng là né *người*, không né một điểm), 'm' = nhiều dấu, đọc thẳng
//         `e.data.ms` (Mưa Ma Thuật rải chín dấu nhỏ, mỗi dấu một chỗ và một nhịp).
//   `t0`/`t1`  giây kể từ lúc chiêu bắt đầu tới nhịp gây sát thương *đầu* và *cuối*, tức là cửa sổ
//         mà đứng trong vùng là ăn đòn. Lấy bằng `at * dur` từ chính các mốc trong `hit()`.
//   `fast` nhịp đầu tới quá nhanh để phản ứng (dưới ~0,15 s). Những chiêu này **không** vào phép né
//         phản ứng -- né một thứ đã nổ là một cái nhảy vô nghĩa nhìn như bị giật. Chúng chỉ vào
//         phép *giữ khoảng cách*: biết người chơi có chúng thì đừng dí sát mà đứng.
const SK_THREAT = {
  star_rupture:  { r: 44, oy: -6,  an: 'e', t0: 0.07, t1: 0.07, fast: 1 },
  // Ba chỗ ghi tới ba chữ số thập phân, và đó không phải sự cầu kỳ: mọi nhịp trong js/skills.js là một
  // `crossed(e, p)` trên `e.dur`, nên nhịp *thật* là một phép nhân -- 0,30 × 0,48 = 0,144 cho Lốc Chém,
  // 0,24 × 0,95 = 0,228 cho Trụ Phán Xét, 0,16 × 0,85 = 0,136 và 0,52 × 0,85 = 0,442 cho Khiên Phản.
  // Làm tròn về 0,14 hay 0,23 là ghi một mốc **sớm hơn** nhịp cuối, tức là cho bộ não quay vào một
  // vùng còn đang đánh -- bốn phần nghìn giây, nhưng ở đúng cái phía sai.
  whirl_slash:   { r: 32, oy: -7,  an: 'h', t0: 0.144, t1: 0.144, fast: 1 },
  ember_field:   { r: 42, oy: 0,   an: 'e', t0: 0.19, t1: 1.11 },
  frost_prison:  { r: 40, oy: -8,  an: 'e', t0: 0.31, t1: 0.31 },
  // Bán kính 53 chứ không phải 27: Xé Máu là chiêu duy nhất trong bảng có vùng sát thương **lệch
  // khỏi tâm neo**. `hitCircle` của nó bán kính 27, nhưng tâm nằm ở `h.x + cos(ang) * 26`, nên tính
  // từ thân nhân vật nó với tới 26 + 27 = 53 về phía đang ngắm. Bảng này không có ô hướng -- và cố ý
  // không có, vì hướng ngắm là thứ người chơi đổi được sau khi đối thủ đã quyết định -- nên con số
  // đúng là *tầm với xa nhất*, y như mọi hàng khác. Ghi 40 là ghi một vòng không chứa nổi cú đánh:
  // đứng cách 45 px trước mặt là đứng trong vùng mà đối thủ tưởng mình đã ra khỏi.
  blood_rend:    { r: 53, oy: -6,  an: 'h', t0: 0.11, t1: 0.11, fast: 1 },
  // Bán kính 72 chứ không phải 48: cú *hút* của Hư Không Sụp với tới 72 và nó chạy suốt từ đầu tới
  // 0,76 -- đứng trong vành hút thì có bước ra cũng bị lôi về, nên vùng phải né là vành hút.
  void_collapse: { r: 72, oy: -10, an: 'e', t0: 0.33, t1: 0.90, pull: 1 },
  judgment_beam: { r: 52, oy: 0,   an: 'e', t0: 0.228, t1: 0.228 },
  spirit_summon: { r: 34, oy: -14, an: 'e', t0: 0.30, t1: 0.80 },
  toxic_bloom:   { r: 40, oy: 0,   an: 'e', t0: 0.33, t1: 1.35 },
  gale_vortex:   { r: 60, oy: 0,   an: 'e', t0: 0.30, t1: 1.14, pull: 1 },
  // `fast` chứ không phải để trống: nhịp đầu của Khiên Phản rơi ở 0,136 giây, dưới ngưỡng 0,15 -- và
  // ngưỡng ấy là lời hứa công bằng của cả chế độ, không phải một con số điều chỉnh được cho từng hàng.
  // Bỏ cờ đi là cho đối thủ né một cú nổ trong 0,136 giây, tức là một phản xạ không người nào có.
  //
  // Mất gì: nó không còn *chạy khỏi* cái khiên nữa. Nhưng cái khiên neo vào **thân người chơi** (`an:
  // 'h'`), nên câu trả lời đúng vốn đã là "đừng đứng cạnh người chơi lúc nó sáng" -- đúng thứ `DTH.near`
  // làm. Với một hàng neo vào người, cờ `fast` không lấy đi cách chơi nào cả; nó đổi cách chơi từ *giật
  // ra* sang *đứng xa từ đầu*, và với một cái khiên phản đòn thì đó mới là cách chơi đúng.
  aegis_reflect: { r: 52, oy: -7,  an: 'h', t0: 0.136, t1: 0.442, fast: 1 },
  // 0,29 chứ không phải 0,32: mỗi ổ mưa xê dịch nhịp rơi của nó đi `rng.range(-0.014, 0.014)` phần
  // chiêu, nên ổ đầu (`RAIN_SEQ[0].at = 0.22`) có thể nổ sớm nhất ở (0,22 − 0,014) × 1,45 = 0,299 s.
  // `t0` là mốc bộ não dùng để tính *còn bao lâu nữa thì đau*; ghi muộn hơn thực tế thì nó rời vùng
  // muộn hơn cần thiết. `t1` thì để 1,45 -- ổ cuối nổ ở 1,325 s, và phủ rộng về phía sau là an toàn.
  arcane_rain:   { r: 19, oy: 0,   an: 'm', t0: 0.29, t1: 1.45 },
  time_halt:     { r: 82, oy: 0,   an: 'e', t0: 0.13, t1: 0.13, fast: 1 },
};
// Ba chiêu **cố ý không có mặt** trong bảng, và đó là một quyết định cân bằng chứ không phải một
// thiếu sót: Sấm Chuỗi và Đạn Nảy *khoá mục tiêu* ngay lúc bấm (`init` gọi `nearest`), nên chúng
// không có vùng để bước ra -- chúng là câu trả lời chắc chắn của người chơi cho một đối thủ đang
// chạy. Bóng Lướt thì nhịp đầu ở 0,077 s và đường đánh là một đoạn thẳng do người chơi vẽ. Ba chiêu
// đó *luôn* trúng nếu ngắm đúng, và một AI biết né mọi thứ là một AI không thể thắng nổi.
// ---- đòn của đối thủ: mười sáu chiêu soi gương --------------------------------------------------
// Mỗi chiêu của người chơi có một hàng đối ứng ở đây, và **không phải một bản chép**. Ba lý do, mỗi
// lý do đổi một con số:
//
//   1. *Sát thương phải đổi hệ quy chiếu.* Chiêu của người chơi ăn 118-430 vào những con quái có
//      90-320 máu. Nhân vật có 400 máu, còn cả bảy hàng `FOE_ABIL` của quái ăn 11-58. Soi gương
//      Trụ Phán Xét thành 430 là một đòn giết thẳng từ đầy máu. Nên các hàng dưới đây nằm trong dải
//      11-62 (một nhịp 21-62, nhiều nhịp 12-18 mỗi nhịp), viết tay từng hàng theo *trọng lượng* của
//      chiêu gốc thay vì chia theo một công thức: một công thức sẽ đúng trung bình và sai ở cả hai
//      đầu bảng.
//   2. *Hai hiệu ứng khống chế không tồn tại được.* `hitHero` chỉ biết trừ máu -- không có
//      `h.frozen` cũng không có `h.slow`, và nhân vật cũng không có ô giao diện nào để nói rằng nó
//      đang bị đóng băng. Nên Ngục Băng và Ngưng Thời đổi phần khống chế thành sát thương và bán
//      kính: cùng câu "đứng đây là mất một khoản lớn", nói bằng thứ tiếng mà cả hai bên đọc được.
//   3. *Thời gian báo trước phải dài hơn.* Chiêu của người chơi nổ sau 0,07-0,33 s vì người chơi tự
//      chấm chỗ. Ở đây chỗ được chấm *lên đầu người chơi*, nên nếu nổ nhanh như vậy thì không có
//      vùng cảnh báo nào kịp đọc. `tell` dưới đây là 0,40-1,15 s: nhanh nhất vẫn đủ để bước một
//      bước, chậm nhất là những đòn đáng dừng tay lại mà tránh.
//
// `range`/`min` là băng khoảng cách bộ não mở đòn từ đó, đo trong khung **không nén** -- cùng khung
// mà `tryCast` so và `heroIn` kiểm, xem GSQ trong js/foe-abil.js. `mp` và `cd` là của riêng file
// này (`stepRival` tự đếm), `rec` là khoảng lặng sau khi bắt đầu một chiêu.
const RIVAL_SK = {
  star_rupture:  { name: 'Sao Vỡ', shape: 'circle', aim: 'hero', r: 40,
                   tell: 0.62, dur: 1.05, dmg: 40, shake: 3.0, range: 150,
                   cd: [3.4, 4.6], mp: 16, rec: 0.50, col: C.cyan, hot: C.pale },
  whirl_slash:   { name: 'Lốc Chém', shape: 'circle', aim: 'self', r: 34,
                   tell: 0.42, dur: 0.80, dmg: 26, shake: 1.6, range: 36,
                   cd: [2.2, 3.0], mp: 9, rec: 0.34, col: C.pale, hot: C.cyan },
  ember_field:   { name: 'Ruộng Than', shape: 'circle', aim: 'hero', r: 42, linger: true,
                   tell: 0.80, dur: 2.25, dmg: 13, ticks: [0, 0.32, 0.64, 0.96, 1.28],
                   shake: 1.4, range: 160, cd: [4.6, 6.0], mp: 24, rec: 0.55,
                   col: C.ember, hot: C.gold },
  frost_prison:  { name: 'Ngục Băng', shape: 'circle', aim: 'hero', r: 40,
                   tell: 0.85, dur: 1.45, dmg: 46, shake: 2.0, range: 155,
                   cd: [5.4, 7.0], mp: 30, rec: 0.60, col: C.ice, hot: C.pale },
  // Chiêu gốc khoá mục tiêu và không thể né. Bản soi gương *không* được phép như vậy -- một đòn
  // chắc chắn trúng trong tay AI là một đòn người chơi không có câu trả lời -- nên nó thành ba nhịp
  // liên tiếp trên một vòng nhỏ: vẫn là "sấm dí theo", nhưng bước ra được.
  chain_bolt:    { name: 'Sấm Chuỗi', shape: 'circle', aim: 'hero', r: 26,
                   tell: 0.55, dur: 1.25, dmg: 16, ticks: [0, 0.26, 0.52],
                   shake: 2.2, range: 170, cd: [3.2, 4.2], mp: 18, rec: 0.45,
                   col: C.volt, hot: C.voltc },
  blood_rend:    { name: 'Xé Máu', shape: 'cone', aim: 'dir', r: 46, arc: 0.62,
                   tell: 0.44, dur: 0.85, dmg: 34, shake: 2.4, range: 42,
                   cd: [2.6, 3.4], mp: 13, rec: 0.36, col: C.blood, hot: C.blush },
  void_collapse: { name: 'Hư Không Sụp', shape: 'circle', aim: 'hero', r: 48,
                   tell: 1.00, dur: 1.70, dmg: 52, shake: 2.6, range: 170,
                   cd: [6.4, 8.0], mp: 34, rec: 0.68, col: C.voidc, hot: C.lilac,
                   boomv: 'big' },
  judgment_beam: { name: 'Trụ Phán Xét', shape: 'circle', aim: 'hero', r: 30,
                   tell: 0.72, dur: 1.20, dmg: 62, shake: 3.6, range: 165,
                   cd: [7.0, 8.6], mp: 40, rec: 0.62, col: C.holy, hot: C.holyp,
                   boomv: 'big' },
  // `range` là 126, không phải 130. Mép ngoài mà `heroIn` thật sự chấp nhận cho một `line` là
  // `len + thick * 0.9 + HERO_R` = 120 + 4,5 + 4 = 128,5, và `range` là khoảng cách xa nhất bộ não
  // *mở* đòn từ đó. Ghi 130 là cho phép nó thả một phát đạn mà người chơi chỉ cần đứng im là trượt
  // -- không phải một cú né, mà là một lỗi tính toán của nó. Mọi hàng khác trong bảng đều có `range`
  // nằm trong mép ấy; hàng này là hàng duy nhất từng nhô ra ngoài.
  ricochet_shot: { name: 'Đạn Nảy', shape: 'line', aim: 'dir', len: 120, thick: 5,
                   tell: 0.52, dur: 1.05, dmg: 30, shake: 1.8, range: 126, min: 24,
                   cd: [2.8, 3.8], mp: 17, rec: 0.42, col: C.steel, hot: C.pale },
  // Chiêu duy nhất *di chuyển* chính nó: `stepRival` dịch đối thủ tới cuối đường lúc đòn nổ, nên
  // đây vừa là cú áp sát vừa là cú thoát -- và cái đường thẳng vẽ trên sàn chính là lời báo trước
  // nó sẽ đi qua đâu. Ngắn (74) vì một cú nhảy dài hơn thế thì mắt không kịp bám theo ai là ai.
  shadow_dash:   { name: 'Bóng Lướt', shape: 'line', aim: 'dir', len: 74, thick: 8,
                   tell: 0.40, dur: 0.80, dmg: 36, shake: 1.2, range: 82,
                   cd: [3.0, 4.2], mp: 19, rec: 0.34, col: C.voidc, hot: C.lilac,
                   blink: true },
  spirit_summon: { name: 'Triệu Linh', shape: 'circle', aim: 'hero', r: 34,
                   tell: 0.70, dur: 1.55, dmg: 18, ticks: [0, 0.30, 0.60],
                   shake: 1.6, range: 150, cd: [4.0, 5.2], mp: 25, rec: 0.50,
                   col: C.spirit, hot: C.spiritp },
  toxic_bloom:   { name: 'Nụ Độc', shape: 'circle', aim: 'hero', r: 40, linger: true,
                   tell: 0.90, dur: 2.20, dmg: 12, ticks: [0, 0.28, 0.56, 0.84, 1.12],
                   shake: 1.0, range: 155, cd: [4.4, 5.8], mp: 25, rec: 0.55,
                   col: C.toxic, hot: C.toxicp },
  // Cú hút của chiêu gốc bỏ đi: `pullToward` chỉ chạy trên `w.foes`, và kéo *nhân vật* là thêm một
  // thứ người chơi không bấm được phím nào để chống. Đổi thành bốn nhịp trên một vòng rộng: cùng
  // câu "đừng đứng trong cái xoáy này", nói bằng thời gian thay vì bằng lực.
  gale_vortex:   { name: 'Xoáy Cuồng Phong', shape: 'circle', aim: 'hero', r: 38,
                   tell: 0.80, dur: 2.00, dmg: 15, ticks: [0, 0.34, 0.68, 1.02],
                   shake: 1.4, range: 160, cd: [5.0, 6.4], mp: 28, rec: 0.52,
                   col: C.cyan, hot: C.pale },
  aegis_reflect: { name: 'Khiên Phản', shape: 'circle', aim: 'self', r: 50,
                   tell: 0.55, dur: 1.15, dmg: 30, ticks: [0, 0.34],
                   shake: 1.8, range: 44, cd: [4.2, 5.4], mp: 26, rec: 0.42,
                   col: C.steel, hot: C.brass },
  arcane_rain:   { name: 'Mưa Ma Thuật', shape: 'circle', aim: 'hero', r: 44, linger: true,
                   tell: 1.00, dur: 2.35, dmg: 14, ticks: [0, 0.24, 0.48, 0.72, 0.96, 1.20],
                   shake: 1.2, range: 170, cd: [6.0, 7.4], mp: 38, rec: 0.60,
                   col: C.vio, hot: C.viop },
  // Đóng băng 2,4 s đổi thành một vòng 78 với 1,15 s báo trước: to nhất bảng, chậm nhất bảng. Đứng
  // trong đó là lỗi của người chơi, không phải của bộ tính giờ -- và đó đúng là điều chiêu gốc nói
  // với những con quái ăn nó.
  time_halt:     { name: 'Ngưng Thời', shape: 'circle', aim: 'self', r: 78,
                   tell: 1.15, dur: 1.85, dmg: 44, shake: 2.4, range: 70,
                   cd: [8.0, 9.6], mp: 45, rec: 0.70, col: C.indigo, hot: C.indigop,
                   boomv: 'big' },
};
// Đăng ký vào `FOE_ABIL` bằng cách đột biến, tiền tố `r_` để không đụng bảy hàng của quái. `src`
// giữ lại id gốc, vì bộ não cần đi ngược từ hàng về chiêu (và bảng chữ trong js/shell.js cần tên).
for (const id in RIVAL_SK) {
  const A = RIVAL_SK[id];
  A.src = id; A.key = 'r_' + id;
  FOE_ABIL[A.key] = A;
}
// ---- đòn của đối thủ: vũ khí ---------------------------------------------------------------------
// Chín vũ khí, chín hàng, **sinh ra từ chính bảng `WEAPONS`** chứ không viết tay. Đó là chỗ khác
// nhau đáng kể so với mười sáu hàng ở trên: hình dáng và tầm với của một vũ khí là những con số đã
// nằm sẵn trong js/weapon.js (`range`, `arc`, `shot`, `slam`, `lunge`), nên chép chúng lần thứ hai
// là tự nhận một món nợ không cần thiết -- ai thêm vũ khí thứ mười thì đối thủ rút được nó ngay.
// Chỉ *sát thương* là viết theo công thức tay: nó không suy ra được, vì một nhát của người chơi là
// bốn nhịp trong 0,55 s còn một nhát ở đây là một vùng cảnh báo trong hơn một giây.
//
// Có một chỗ lệch cố ý và nên nói ra: `wp.range` đo trong khung nén 0,72 (`SWING_SQ`) của nhát vung,
// còn `heroIn` đọc `r` trong khung 0,50 (`GSQ`). Nên cái nón của đối thủ *ngắn hơn theo chiều dọc*
// so với đúng cây vũ khí ấy trong tay người chơi. Sửa cho khớp tuyệt đối thì phải mang cả hệ nén
// của vũ khí vào `heroIn` -- một cái nón hai hệ quy chiếu cho một hàng bảng, và cái giá là mọi vùng
// cảnh báo trong game phải biết mình thuộc hệ nào. Chỗ lệch này người chơi không đọc ra được; cái
// kia thì cả bảy hàng quái phải trả tiền.
const RIVAL_WP = {};
for (const wp of WEAPONS) {
  // Tổng sát thương một chuỗi của người chơi, dùng làm *thứ tự* chứ không làm tỷ lệ: găng 7x5 và
  // rìu 52x1 cách nhau 1,5 lần ở đây nhưng cách nhau 7,4 lần nếu lấy sát thương mỗi nhịp. Cung
  // không có `dmg` (toàn bộ sát thương của nó nằm trong mũi tên) nên nó lấy số cố định.
  const tot = (wp.dmg || 0) * wp.hits.length;
  const dmg = wp.shot ? 26 : clamp(Math.round(14 + tot * 0.34), 18, 34);
  // Báo trước ăn theo hồi chiêu của chính vũ khí: một cây rìu 0,80 s nặng nề phải nhìn ra là nặng nề.
  const tell = Math.round(clamp(0.26 + wp.cd * 0.30, 0.30, 0.52) * 100) / 100;
  let A;
  if (wp.shot) {
    A = { shape: 'line', aim: 'dir', len: 118, thick: wp.shot.thick + 2, range: 126, min: 22 };
  } else if (wp.slam) {
    // Rìu đập xuống *chỗ người chơi đang đứng*, không quét trước mặt: đó là hình của `slam`, và
    // `aim: 'hero'` là hàng duy nhất trong nhóm này chấm lên đầu người chơi.
    A = { shape: 'circle', aim: 'hero', r: wp.slam.r, range: wp.slam.dist + wp.slam.r };
  } else {
    // Khiên xông lên 52 px trước khi đánh (`lunge`), nên tầm với thật của nó dài hơn `range` nhiều.
    const r = Math.round(wp.range + (wp.lunge ? wp.lunge.len * 0.75 : 0));
    A = { shape: 'cone', aim: 'dir', r: r, arc: clamp(wp.arc * 0.72, 0.34, 1.5),
          range: Math.round(r * 0.92) };
  }
  A.name = wp.name; A.tell = tell; A.dur = tell + 0.34; A.dmg = dmg; A.shake = wp.shake;
  // Hồi *nhanh hơn cả tay người chơi cầm cùng cây ấy*, và đó là một quyết định về việc trận này đọc
  // ra như cái gì. Bản đầu để `cd * 1.7 … 2.3`: một đối thủ mang kiếm 0,42 s vung một nhát mỗi 0,85
  // giây, tức là giữa hai nhát nó có gần một giây không làm gì cả -- và một người thật thì không đứng
  // yên gần một giây trong tầm kiếm. Với `0.85 … 1.30` thì cây vũ khí thành *nhịp nền* của cả trận,
  // đúng như phía người chơi: ba chiêu là những dấu nhấn rơi vào giữa dòng đánh thường ấy. Nó ăn nhập
  // với việc hạ mana (`DUEL_MPX`): hai bên đều sống bằng cây vũ khí phần lớn thời gian.
  //
  // Không gian lận: mỗi nhát vẫn vẽ một vệt cảnh báo `tell` 0,30-0,52 s trên sàn, nên đánh dày hơn
  // nghĩa là *nhiều cửa sổ để phạt hơn* -- người chơi đọc được nhát nào cũng có 0,3 giây để bước ra,
  // và mỗi nhát của nó là một quãng nó không đi được đâu.
  A.cd = [wp.cd * 0.85, wp.cd * 1.30]; A.mp = 0; A.rec = 0.22;
  A.col = wp.col; A.hot = wp.lit; A.wpid = wp.id; A.key = 'w_' + wp.id;
  RIVAL_WP[wp.id] = A;
  FOE_ABIL[A.key] = A;
}

// ---- hiệu ứng soi gương -------------------------------------------------------------------------
// Bản đầu của chế độ này chỉ có *vệt cảnh báo*: một vòng tròn sáng lên dưới sàn rồi tắt. Đặt cạnh
// chiêu của người chơi -- lốc chém hai lưỡi, trụ phán xét, mưa ma thuật chín ổ -- nó đọc ra như hai
// game khác nhau đang đánh nhau. Nhát đánh thường còn tệ hơn: cây vũ khí nằm im trong tay đối thủ
// trong khi một cái nón sáng lên dưới sàn, tức là cả cú vung **không có hình**.
//
// Nên mỗi đòn của đối thủ đẩy thêm một hàng nữa vào `w.fxs`: **chính hiệu ứng của người chơi**, cùng
// art, cùng đường vẽ, chỉ khác hai cờ:
//
//   `e.by`    người thả. `fxWho` (js/world.js) đọc nó, nên mọi chỗ trong js/skills.js neo hình vào
//             thân người thả sẽ neo vào thân đối thủ thay vì thân nhân vật.
//   `e.mute`  chỉ để nhìn. Sát thương vẫn đi nguyên đường cũ (`w.tels` → `stepTel` → `hitHero`), nên
//             vùng ăn đòn **vẫn là** cái vệt vẽ trên sàn: hiệu ứng thêm vào không đổi một điểm sát
//             thương nào, không đánh hai lần, và không kéo/dịch được ai.
//
// Vì sao không làm ngược lại -- cho đối thủ gọi thẳng `cast()` rồi bỏ `w.tels` đi? Vì sát thương của
// mười sáu chiêu đi qua `hitCircle`/`foesIn`, hai hàm chỉ quét `w.foes`: đối thủ sẽ tự đánh chính nó
// và không đụng được nhân vật một chấm. Sửa được, nhưng cái giá là cả mười sáu hàm `hit()` phải biết
// chúng thuộc về ai, và lúc ấy chế độ này viết lại js/skills.js. Đường soi gương giữ nợ ở một chỗ.
const SK_BY_ID = {};
for (const s of SKILLS) SK_BY_ID[s.id] = s;
// Mỗi chiêu có một *nhịp đầu*: giây kể từ lúc hiệu ứng bắt đầu tới lúc nó gây sát thương. Muốn hình
// và vệt trùng nhau thì phải thả hiệu ứng **trước** lúc vệt nổ đúng bằng khoảng ấy. `SK_THREAT.t0`
// vốn đã là đúng con số đó cho mười ba hàng (đọc từ các `crossed()` trong js/skills.js), nên chỉ ba
// hàng vắng mặt trong bảng ấy phải ghi tay ở đây.
const MIR_LEAD = {
  chain_bolt:    0.144,   // crossed(e, 0.24) trên dur 0,60
  shadow_dash:   0.077,   // crossed(e, 0.14) trên dur 0,55
  ricochet_shot: 0.42,    // chặng đầu của đường nảy, khoảng 0,67 của dur 0,62
};
function mirLead(id) {
  const T = SK_THREAT[id];
  return T ? T.t0 : (MIR_LEAD[id] || 0);
}
// Nhát vung thì nhịp đầu đọc thẳng từ tấm sheet: `hits[0]` là khung gây sát thương đầu tiên trong
// `frames` khung của `dur` giây. Nên cú vung *kết* đúng khung vệt nổ, y như tay người chơi.
function mirLeadWp(wp) { return wp.hits[0] / wp.frames * wp.dur; }

// Thả bản soi gương của một đòn đang diễn. `T` là vệt cảnh báo đã sinh ra nó, và mọi thứ hình học đều
// suy từ chính nó -- không đọc lại chỗ nhân vật đang đứng -- nên hình và vùng ăn đòn không thể lệch
// nhau dù nhân vật đã chạy đi đâu trong quãng báo trước.
function rivalMirror(w, f, T) {
  const A = T.ab;
  // Điểm ngắm, quy về **toạ độ sàn** đúng như thứ `cast`/`swing` nhận từ con trỏ: hàng `hero` đã chấm
  // sẵn một điểm, hàng `dir` lấy cuối vệt, hàng `self` là chính chỗ đứng.
  let tx, ty;
  if (A.aim === 'self') { tx = f.x; ty = f.y; }
  else if (A.aim === 'hero') { tx = T.x; ty = T.y + 1; }
  else {
    // Hàng `dir` ngắm vào *cuối tầm với theo hướng đã chốt*. Không gọi `telEnd` được: nó đọc `A.len`,
    // thứ chỉ riêng hàng `line` (cung, và đường lướt của Bóng Lướt) có -- bảy hàng nón không có `len`
    // và sẽ ra NaN, tức là một nhát vung không vẽ ra một điểm nào. `r` là bán kính nón, đúng cái quãng
    // ấy theo trục ngắm.
    const L = A.len !== undefined ? A.len : A.r;
    tx = T.x + Math.cos(T.ang) * L;
    ty = T.y + Math.sin(T.ang) * L * GSQ + 1;
  }
  if (A.wpid) return mirrorSwing(w, f, tx, ty, A);
  const sk = SK_BY_ID[A.src];
  if (!sk) return null;
  // Cùng hình dạng entry với `cast` (js/world.js), từng trường một -- kể cả `i: -1`, thứ nói với mọi
  // đường vẽ rằng hàng này không thuộc ô chiêu nào của thanh phím.
  const e = { sk: sk, i: -1, t: 0, dur: sk.dur, p: 0, pt: 0,
              seed: w.rng.int(1, 1e9) | 0, ox: f.x, oy: f.y - f.h * 0.5, data: {},
              by: f, mute: 1 };
  if (sk.mode === 'self') { e.x = f.x; e.y = f.y; }
  else { e.x = clamp(tx, BOUND.x0 - 18, BOUND.x1 + 18);
         e.y = clamp(ty, BOUND.y0 - 16, BOUND.y1 + 10); }
  e.ang = Math.atan2(e.y - f.h * 0.5 - e.oy, e.x - e.ox);
  if (sk.init) sk.init(w, e);
  w.fxs.push(e);
  return e;
}
// Nhát vung soi gương. Khác bản chiêu ở hai chỗ, và cả hai đều là chuyện của *chỗ neo*: nhát vung có
// hệ nén riêng của vũ khí (`wp.squash`, không phải `GSQ` của vệt), và cú nện của rìu vẽ hố lệch khỏi
// gốc một quãng `slam.dist`.
function mirrorSwing(w, f, tx, ty, A) {
  const wp = f.wp;
  if (!wp || !wp.sk) return null;
  const ang = Math.atan2((ty - (f.y - 1)) / wp.squash, tx - f.x);
  let ox = f.x, oy = f.y - f.h * 0.5;
  // `drawSlam` vẽ hố cách gốc `slam.dist` theo hướng ngắm, còn vệt cảnh báo của hàng rìu là một vòng
  // *tại điểm đã chấm*. Nên gốc phải lùi lại đúng quãng ấy: bằng không cái lưỡi rơi cách chỗ được
  // đánh dấu đúng 26 px, và người chơi học sai chỗ phải bước ra.
  if (wp.slam) {
    ox = tx - Math.cos(ang) * wp.slam.dist;
    oy = ty - Math.sin(ang) * wp.slam.dist * wp.squash;
  }
  const e = { sk: wp.sk, wp: wp, i: -1, t: 0, dur: wp.dur, p: 0, pt: 0,
              seed: w.rng.int(1, 1e9) | 0, ox: ox, oy: oy, data: {},
              by: f, mute: 1, momo: false,
              // Mũi tên chỉ được bay đúng bằng đoạn đã vạch trên sàn (`looseArrow` đọc `cap`): đoạn
              // ấy là chỗ thật sự có sát thương, và một mũi tên bay quá nó là một lời nói dối.
              cap: A.shape === 'line' ? A.len : 0 };
  e.x = tx; e.y = ty; e.ang = ang;
  w.fxs.push(e);
  return e;
}

// ---- rút thăm -----------------------------------------------------------------------------------
// Trên `w.rng` (dòng của sim), nên hai trận cùng seed gặp đúng cùng một đối thủ với đúng cùng bộ
// kit -- cùng bất biến mà cả game đang giữ, và là cách duy nhất một harness kiểm được chế độ này.
//
// **Đều tay: ba chiêu bất kỳ trong mười sáu, không một luật ép nào.** Bản đầu có một luật -- phải có
// ít nhất một chiêu với tới từ 120 px -- và nó sai ở hai mức. Mức thấy được ngay: `kit[2]` bị ghi đè,
// nên ô thứ ba *không* rút đều, và những hàng tầm gần xuất hiện ở đó ít hơn hẳn hai ô kia. Mức sâu
// hơn: cái luật ấy giải một bài không tồn tại. Nó sợ một bộ ba tầm gần trên tay một tay cung sẽ đứng
// nhìn người chơi kite -- nhưng người chơi ở đây *không kite được*: sân chỉ 520x340, và một đối thủ
// hết chiêu vẫn còn cây vũ khí hồi trong khoảng một giây (xem `RIVAL_WP`) nên nó vẫn đang tiến vào và
// vẫn đang đánh. Cái thật sự xảy ra nếu ép: người chơi học được rằng đối thủ *luôn* có một đòn tầm xa,
// tức là mất đi đúng cái phải đọc mỗi trận -- rằng bộ kit này có gì và thiếu gì.
function rollRival(rng) {
  const pool = Object.keys(RIVAL_SK), kit = [];
  for (let i = 0; i < 3; i++) kit.push(pool.splice(rng.int(0, pool.length), 1)[0]);
  return { wp: rng.pick(WEAPONS), kit: kit };
}
// Băng khoảng cách đối thủ muốn giữ, suy ra từ cây vũ khí nó rút được -- không phải một con số của
// loài. Đây là thứ làm hai đối thủ khác vũ khí *chơi khác nhau* dù dùng chung một bộ não: một tay
// cung đứng ở 96 và lùi khi bị áp sát, một tay găng đứng ở 26 và phải dán vào người mới đánh được.
function duelBand(wp) {
  const A = RIVAL_WP[wp.id];
  if (wp.shot) return 96;
  if (wp.slam) return A.range * 0.74;
  return A.r * (wp.thrust ? 0.86 : 0.80);
}

// ---- mở trận, ra vòng ---------------------------------------------------------------------------
// Sân đấu là `w.room`, tức là đúng cơ chế phòng boss. Đặt nó xong thì ba thứ tự đến, không phải viết
// thêm dòng nào: `roomApply` (gọi mỗi tick từ `stepGate`) thu `BOUND` và `CAMB` lại, `drawRoom` vẽ
// bốn dải tường mờ dần cùng đường rào sáng, và `step` **thôi sinh quái** -- nhánh sinh quái của nó
// là `if (w.spawnT <= 0) { if (!w.room) spawnFoe(w); ... }`. `bossGate` cũng thoát ngay ở dòng
// `if (w.room || w.gate || w.boss) return;`, nên không có cánh cổng nào mở ra giữa trận.
//
// Và đối thủ **không** được gán vào `w.boss`. Nếu gán thì `bossGate` sẽ mở một cánh cổng 'out' đúng
// lúc nó chết, tức là điều kiện kết vòng bị một file khác quyết định thay.
function startDuel(w) {
  const h = w.hero;
  const cx = Math.round(clamp(h.x, BOUND0.x0 + DUEL_W * 0.5, BOUND0.x1 - DUEL_W * 0.5));
  const cy = Math.round(clamp(h.y, BOUND0.y0 + DUEL_H * 0.5, BOUND0.y1 - DUEL_H * 0.5));
  w.room = { cx: cx, cy: cy, x0: cx - DUEL_W * 0.5, x1: cx + DUEL_W * 0.5,
             y0: cy - DUEL_H * 0.5, y1: cy + DUEL_H * 0.5 };
  roomApply(w);
  w.foes.length = 0; w.tels.length = 0; w.fxs.length = 0; w.boss = null;
  // Một trận solo không thể thua thì không phải một trận solo. `newWorld` bật `god` vì cả game gốc
  // là một phòng thí nghiệm; ở đây nó phải tắt. Phím `g` vẫn bật lại được -- công cụ vẫn là công cụ.
  w.god = false;
  w.spawnT = 1e9;
  // Bình mana và tốc độ hồi của nhân vật, hạ theo `DUEL_MPX`. Đặt qua `w.mpx` + `syncGear` chứ không
  // trừ thẳng vào `h.maxmp` ở đây, vì `syncGear` được gọi lại mỗi lần đổi trang bị: một phép trừ một
  // lần sẽ bị lần gọi sau xoá sạch, và người chơi tháo một cái nhẫn giữa trận là mana đầy trở lại.
  w.mpx = DUEL_MPX;
  syncGear(w);
  h.x = cx; h.y = cy + DUEL_H * 0.30;
  h.vx = 0; h.vy = 0; h.dsh = 0; h.dvx = 0; h.dvy = 0;
  h.hp = h.maxhp; h.mp = h.maxmp;
  // `done` là kết quả của trận: '' đang đánh, 'win' hoặc 'lose'. `hold` là quãng đứng nhìn sau khi một
  // bên gục, `shown` là cờ "menu đã mở rồi" -- js/shell.js đọc nó để chỉ mở đúng một lần.
  w.duel = { done: '', hold: 0, shown: 0, wait: DUEL_INTRO, rival: null, kit: null };
  snapCam(w); setCam(w.cam.x, w.cam.y);
  w.flash = 1; w.shake = Math.max(w.shake, 5.2);
  return w.duel;
}

// Đối thủ bước vào *chéo trên* so với nhân vật, không vào giữa phòng: khung nhìn cao 180 px và bám
// theo nhân vật, nên một chỗ đặt tính theo tâm phòng sẽ nằm ngoài màn hình đúng những lần nhân vật
// đang đứng ở mép. 118 ngang / 62 dọc là trong khung ở cả hai cỡ khung (320 và 480).
function spawnRival(w) {
  const d = w.duel, h = w.hero, R = w.room;
  const x = clamp(h.x + (h.x < R.cx ? 118 : -118), R.x0 + 22, R.x1 - 22);
  const y = clamp(h.y - 62, R.y0 + 20, R.y1 - 20);
  const f = unit('rival', x, y);
  // Thanh máu lớn viền vàng: `drawFoe` bật nó theo `f.boss`, và đó là *chỗ duy nhất* trong game đọc
  // trường ấy trên một đơn vị (js/foe-abil.js đọc `KIND[f.kind].boss`, một trường khác). Nên đặt nó
  // ở đây không kéo theo bất kỳ hành vi boss nào -- chỉ kéo theo cái thanh máu, đúng thứ cần: một
  // thanh rộng 11 px trên đối thủ duy nhất của cả trận là không đọc được.
  f.boss = true;
  const roll = rollRival(w.rng);
  f.wp = roll.wp; f.kit = roll.kit;
  f.mp = DUEL_MP; f.maxmp = DUEL_MP;
  f.acd = 0.55;                      // một khoảng lặng đầu vòng: không mở màn bằng một cú vào mặt
  f.aimAng = Math.atan2(((h.y - 1) - (f.y - 1)) / GSQ, h.x - f.x);
  f.pose = -1;                       // 0..1 của nhát vung đang diễn; -1 = đang cầm yên
  f.ai = { band: duelBand(roll.wp), kcd: [0, 0, 0], wcd: 0.7, dcd: 0.5,
           dsh: 0, dvx: 0, dvy: 0, hx: h.x, hy: h.y, hvx: 0, hvy: 0,
           think: 0, sx: 0, sy: 0, sT: 0, side: w.rng() < 0.5 ? -1 : 1, voiced: 0,
           blink: null, sw: null, mir: null };
  w.foes.push(f);
  d.rival = f; d.kit = roll;
  w.shake = Math.max(w.shake, 3.4);
  SFX.portal('in', clamp((f.x - w.cam.x - W * 0.5) / (W * 0.5), -1, 1));
  return f;
}
// ---- kết trận -----------------------------------------------------------------------------------
// Một trận, một lần: đánh tới lúc một trong hai gục thì thôi. Bản đầu là một cái thang vòng -- thắng
// thì vòng sau đối thủ dày máu hơn, thua thì tụt về vòng 1 -- và cái thang ấy đổi câu hỏi của chế độ.
// Với một cái thang thì trận nào cũng là một bậc, nên thắng hay thua đều chỉ là "lát nữa đánh tiếp";
// với một trận duy nhất thì mỗi lần vung tay đều tính, và đó mới là thứ một trận tay đôi bán.
//
// Kết thúc thì mở **menu tạm dừng**, không phải một scene mới. `pause` đã có sẵn mọi thứ cần: một
// panel, một nhánh trong `setScene`, phím ESC/Enter, và một nút "TIẾP TỤC" mà js/shell.js đổi thành
// "ĐÁNH LẠI" khi `d.done`. Thêm một scene 'dead' là thêm bốn chỗ vào js/shell.js để nói đúng cái câu
// mà `pause` đã nói được.
//
// `hold` là quãng giữa lúc gục và lúc menu mở ra. Không có nó thì cái panel nhảy ra đúng khung máu về
// 0, che mất chính cú đánh kết liễu -- và người chơi không thấy mình chết bằng cái gì.
function duelEnd(w, how) {
  const d = w.duel, h = w.hero;
  if (!d || d.done) return;
  d.done = how; d.hold = DUEL_END;
  // Dọn mọi vệt đang lên: một vòng cảnh báo nổ *sau* khi trận đã xong là một đòn không còn nghĩa gì,
  // và nếu người thua là nhân vật thì nó còn rút máu một cái xác. `f.tel` phải nulls theo, bằng không
  // `stepRival`/`foeFrame` giữ nguyên khung lên đòn trên một đối thủ đứng im.
  w.tels.length = 0;
  const f = d.rival;
  if (f) { f.tel = null; f.chg = 0; f.rel = 0; f.acd = 99; if (f.ai) f.ai.mir = null; }
  h.vx = 0; h.vy = 0; h.dsh = 0;
  w.flash = Math.max(w.flash, how === 'win' ? 0.75 : 1);
  w.shake = Math.max(w.shake, how === 'win' ? 4.2 : 7.5);
  if (how === 'win') SFX.fanfare();
  else { h.hp = 0; SFX.portal('out', 0); }
}

function stepDuel(w, dt) {
  const d = w.duel;
  if (!d) return;
  const h = w.hero;
  if (d.done) { if (d.hold > 0) d.hold = Math.max(0, d.hold - dt); return; }
  if (d.wait > 0) {
    d.wait -= dt;
    if (d.wait <= 0) spawnRival(w);
    return;
  }
  // Máu nhân vật về 0 mà `god` đang bật thì không tính là thua -- `god` là công cụ, và người bật nó
  // đang xem chứ đang không đấu.
  if (h.hp <= 0 && !w.god) { duelEnd(w, 'lose'); return; }
  const f = d.rival;
  // `dying > 0` chứ không chỉ `hp <= 0`: `hurt` đặt `dying` rồi để `stepFoes` chạy hết hoạt cảnh gục,
  // nên đọc nó là bắt được đúng khung đòn kết liễu ăn vào.
  if (f && (f.dying > 0 || f.hp <= 0)) duelEnd(w, 'win');
}

// ---- đọc nguy hiểm ------------------------------------------------------------------------------
// Đây là chỗ "cực thông minh" thật sự nằm: không phải ở chỗ chọn chiêu, mà ở chỗ **biết mình đang
// đứng trong cái gì**. Quét `w.fxs` -- hiệu ứng của chiêu người chơi vừa thả -- đối chiếu `SK_THREAT`,
// rồi trả về một vector đẩy ra cùng khoảng cách còn phải đi để thoát.
//
// Ba điều khiến hàm này khả thi chút nào: hiệu ứng chiêu **đã nằm sẵn ở toạ độ thế giới** trong
// `w.fxs` (`e.x`/`e.y` là điểm người chơi đánh dấu), đồng hồ của nó là `e.t` chạy từ 0 tới `e.dur`,
// nên "còn bao lâu tới nhịp gây sát thương" là một phép trừ; và bán kính thì `SK_THREAT` đã ghi tay
// vì trong js/skills.js chúng bị nướng vào thân từng hàm `hit()`, không đọc ra được lúc chạy.
//
// `w.tels` bị bỏ hẳn: đó là vệt báo đòn của *chính nó*, và một AI né đòn của mình thì không bao giờ
// đánh trúng ai. Hàng `fast` (nhịp đầu dưới 0,15 giây) cũng bỏ khỏi phần né -- thời gian phản ứng
// người thật là 0,2-0,25 giây, nên một AI né được thứ nổ trong 0,07 giây là một AI gian lận. Chúng
// vẫn đọc được, nhưng chỉ ở chỗ khác: `duelThreat` trả thêm `near`, dùng để *đừng đứng sát* người
// chơi -- tức là AI đề phòng bằng khoảng cách, đúng cách người giỏi đề phòng.
const DTH = { x: 0, y: 0, need: 0, hot: 0, near: 0, pull: 0 };
function duelThreat(w, f) {
  DTH.x = 0; DTH.y = 0; DTH.need = 0; DTH.hot = 0; DTH.near = 0; DTH.pull = 0;
  const h = w.hero;
  for (let i = 0; i < w.fxs.length; i++) {
    // `w.fxs` chứa cả nhát vung vũ khí (`e.wp`), và những hàng đó không có `e.sk` -- nên phải đọc
    // `e.sk && e.sk.id` chứ không đọc thẳng. `e.sk` là *đối tượng* chiêu, không phải chuỗi id.
    const e = w.fxs[i], T = e.sk && SK_THREAT[e.sk.id];
    if (!T) continue;
    // Và bỏ hẳn hiệu ứng của *chính nó*. Từ khi đối thủ soi gương art của người chơi (`rivalMirror`),
    // `w.fxs` có cả những hàng nó tự thả -- cùng `e.sk`, nên cùng khớp `SK_THREAT`. Không bỏ thì nó
    // đọc cú Ngưng Thời của mình thành một vòng 82 px đang nổ dưới chân và bỏ chạy khỏi đòn của chính
    // mình: đúng cái lỗi mà đoạn chú thích trên đã bỏ `w.tels` đi để tránh, quay lại bằng cửa khác.
    if (e.by) continue;
    // Tâm vùng: điểm đã đánh dấu, thân nhân vật lúc này, hay ổ mưa trong `e.data.ms` -- ba cách
    // neo khác nhau vì ba loại chiêu neo khác nhau, và neo sai thì né sai hướng.
    let cx, cy, r = T.r;
    if (T.an === 'h') { cx = h.x; cy = h.y + T.oy; }
    else { cx = e.x; cy = e.y + T.oy; }
    if (T.an === 'm') {
      const ms = e.data && e.data.ms;
      if (!ms || !ms.length) continue;
      // Mưa: mỗi ổ là một vòng nhỏ. Lấy ổ gần nhất -- đứng giữa hai ổ vẫn là đứng ngoài cả hai.
      let bd = 1e9;
      for (let k = 0; k < ms.length; k++) {
        const m = ms[k], dd = Math.hypot(m.x - f.x, midY(f) - m.y);
        if (dd < bd) { bd = dd; cx = m.x; cy = m.y; }
      }
    }
    // **Khoảng cách trên màn hình, không nén theo `GSQ`.** Đây là chỗ dễ sai nhất cả file, và sai
    // theo hướng tệ: `GSQ` là hệ của `heroIn`, tức là hệ của những vùng cảnh báo do *quái* vẽ. Vùng
    // sát thương của mười sáu chiêu người chơi thì đi qua `hitCircle` → `foesIn`, và hai hàm ấy so
    // `Math.hypot(f.x - x, midY(f) - y) <= r + f.w * 0.35` -- một vòng tròn thật trong toạ độ màn
    // hình, không nén. Chia dọc cho 0,5 ở đây là nhân đôi khoảng cách dọc, tức là đối thủ tưởng
    // mình cách xa gấp đôi thực tế mỗi khi nó đứng trên hay dưới tâm vùng: nó sẽ đứng yên trong
    // đúng những cú nổ mà nó *có* dữ liệu để đọc. `pad` cũng chép đúng số hạng `f.w * 0.35` của
    // `foesIn`, vì nửa lời hứa "ngoài vùng thì không phải né" đo bằng đúng con số đó.
    const dx = f.x - cx, dy = midY(f) - cy;
    const dist = Math.hypot(dx, dy) || 0.001;
    const pad = r + f.w * 0.35 + 5;
    if (dist > pad + 26) continue;                  // xa hẳn thì không phải chuyện của tick này
    // 0,34 là một **sàn**, không phải một trần, và `Math.max` là chỗ nói điều đó. Với hai chiêu neo
    // vào thân người chơi thì nguy hiểm không tắt lúc nhịp cuối nổ -- nó tắt lúc người chơi đi khỏi,
    // mà người chơi thì đi tới chứ không đi khỏi, nên cửa sổ phải rộng hơn `t1` của chúng. Nhưng
    // Khiên Phản đánh nhịp cuối ở 0,442 giây, muộn hơn cái sàn ấy: viết 0,34 trần trụi là đóng cửa sổ
    // 0,05 giây trước cú nổ cuối, tức là để đối thủ lững thững quay vào đúng khung nó nổ.
    const late = T.an === 'h' ? Math.max(0.34, T.t1) : T.t1;
    if (e.t > late + 0.05) continue;
    if (dist <= pad) {
      if (T.fast) { DTH.near = Math.max(DTH.near, pad); continue; }
      // Trọng số theo mức gấp: còn 0,1 giây thì đẩy mạnh, còn 0,8 giây thì đẩy nhẹ để còn kịp làm
      // việc khác. `pull` thì luôn gấp, vì đứng trong một cú hút mà chờ là bị kéo vào tâm.
      const late0 = Math.max(0, T.t0 - e.t);
      const wgt = (T.pull ? 1.4 : 1) / (0.28 + late0);
      DTH.x += dx / dist * wgt; DTH.y += dy / dist * wgt;
      DTH.need = Math.max(DTH.need, pad - dist + 3);
      DTH.hot = Math.max(DTH.hot, 1 / (0.14 + late0));
      if (T.pull) DTH.pull = 1;
    } else DTH.near = Math.max(DTH.near, T.fast ? pad : 0);
  }
  const m = Math.hypot(DTH.x, DTH.y);
  if (m > 1e-4) { DTH.x /= m; DTH.y /= m; }
  return DTH.need > 0;
}
// ---- bộ não: những mảnh nhỏ ---------------------------------------------------------------------
const RIV_DASH = 292;        // px/s của cú lao. Nhanh hơn nhân vật đi bộ (56) nhưng chậm hơn cú
                             // dash của nhân vật, vì cú lao này **không có i-frame**: nó phải rời
                             // khỏi vùng nguy hiểm bằng chân, để chiêu người chơi không bao giờ
                             // "trượt" một cách vô hình.
const RIV_DASH_T = 0.19, RIV_DASH_CD = 1.05;
const RIV_MEM = 0.16;        // hằng thời gian của bộ lọc vận tốc người chơi
const RIV_LEAD = 112;        // trần độ lớn vận tốc dùng để bắn đón: cú dash của nhân vật chạy hơn
                             // 400 px/s trong 0,18 giây, và đón theo con số đó là đón ra ngoài
                             // tường -- một AI đọc *đà chạy*, không đọc một cú giật.
// Nhân vào điểm của cây vũ khí trong `rivalPick`. Công thức `rivalScore` cân theo *sát thương trên
// thời gian*, và ở thước đó một nhát vung 26 luôn thua một chiêu 40-62 mỗi khi chiêu ấy còn hồi -- nên
// nếu để nguyên thì đối thủ dùng hết ba chiêu rồi mới đánh thường, tức là cây vũ khí thành thứ để lấp
// chỗ trống. Nhưng một đòn đánh thường **đáng hơn** phần sát thương của nó: nó không tốn mana, hồi
// trong khoảng một giây, và nó giữ được áp lực ở tầm gần. 1,45 là chỗ cây vũ khí thắng các chiêu tầm
// trung ở khoảng cách sát người mà vẫn thua một chiêu đúng lúc (người chơi vừa bị khoá chân, hay một
// đòn 62 đang đúng tầm).
const RIV_WP_BIAS = 1.45;
// Trần cho `f.rel` của đối thủ. `stepTel` đặt `REL_HOLD` (0,42 s) sau mỗi đòn để giữ khung đánh trên
// người quái -- đúng cho một con quái đứng tại chỗ vung, nhưng ở đây `held` trong `stepRival` khoá cả
// chân theo `f.rel`, nên mỗi đòn là gần nửa giây đối thủ đứng như tượng. Kẹp xuống 0,22 s: vẫn đủ để
// mắt đọc ra khung đánh, không còn là một quãng đứng im.
const RIV_REL = 0.22;

// Người chơi đang bị khoá trong bao lâu nữa. Đây là **cửa sổ phạt**, và biết đọc nó là khác biệt lớn
// nhất giữa một con quái và một đối thủ: quái đánh khi tầm cho phép, người đánh khi đối phương vừa
// vung xong. Chỉ nhát vũ khí khoá chân nhân vật (`wp.plant`), nên chỉ nó được tính; `w.sw` là nhát
// đang diễn, `step` cập nhật mỗi tick nên không phải quét `w.fxs`.
function rivalHeroBusy(w) {
  const e = w.sw;
  if (!e || !e.wp) return 0;
  const pl = e.wp.plant !== undefined ? e.wp.plant : 1;
  return pl > 0.5 ? Math.max(0, e.dur - e.t) : 0;
}

// Điểm đón: chỗ nhân vật *sẽ* ở lúc đòn nổ, không phải chỗ đang đứng. Nhân với 0,55 chứ không phải
// 1: đón đủ là đoán rằng người chơi sẽ đi thẳng suốt cả giây báo đòn, mà người chơi thì đang *nhìn*
// cái vệt ấy nên gần như luôn đổi hướng. 0,55 là chỗ dừng của một người đọc được đà chạy mà không
// ảo tưởng đọc được ý định -- đón non thì đòn rơi giữa chỗ cũ và chỗ mới, tức là vẫn chặn đường.
function rivalLead(w, f, tell) {
  const h = w.hero, a = f.ai;
  let vx = a.hvx, vy = a.hvy;
  const m = Math.hypot(vx, vy);
  if (m > RIV_LEAD) { vx = vx / m * RIV_LEAD; vy = vy / m * RIV_LEAD; }
  const k = Math.min(tell, 0.85) * 0.55;
  return { x: h.x + vx * k, y: h.y + vy * k };
}

// Thả một đòn. `startCast` lo hết phần sổ sách (dựng `w.tels`, `aim`, `f.tel`, `f.chg`, `SFX.warn`),
// nên ở đây chỉ còn ba việc nó không làm được:
//
//   * **sửa điểm ngắm thành điểm đón.** Sửa được vì không hàng `r_*`/`w_*` nào dùng `BOSS_SHAPE`,
//     nên không có `S.init` nào đã đọc `e.x`/`e.ang` trước khi ta ghi lại.
//   * **thay `f.acd`.** `startCast` đặt nó bằng `cd` của *chính đòn vừa thả*, tức là thả Ngưng Thời
//     một lần là im tám giây. Nhịp giữa hai đòn bất kỳ (`rec`) và thời gian hồi của từng đòn
//     (`a.kcd[i]`) là hai chuyện khác nhau, và trộn chúng lại là một đối thủ đứng không.
//   * **trả mana**, thứ `FOE_ABIL` không có khái niệm.
function rivalCast(w, f, key, i) {
  const A = FOE_ABIL[key], a = f.ai;
  if (!startCast(w, f, key)) return false;
  const e = f.tel;
  if (A.aim !== 'self') {
    const p = rivalLead(w, f, A.tell);
    if (A.aim === 'hero') {
      e.x = clamp(p.x, BOUND.x0 - 10, BOUND.x1 + 10);
      e.y = clamp(p.y - 1, BOUND.y0 - 10, BOUND.y1 + 10);
    } else e.ang = Math.atan2(((p.y - 1) - e.y) / GSQ, p.x - e.x);
  }
  // Nhịp giữa hai đòn, đếm từ **lúc vệt nổ** chứ không từ lúc thả: `A.tell` cộng vào đây vì `A.rec`
  // (0,22 s) ngắn hơn mọi quãng báo đòn, nên nếu chỉ đặt `A.rec` thì nó đã về 0 từ giữa quãng ấy và đòn
  // sau nổ ra ngay khung đòn trước ăn -- không có một khung nào ở giữa. Đó là cách `rec` chết lặng lẽ:
  // trước đây `held` che nó lại nên không thấy, giờ chân đã tự do thì thấy ngay.
  f.acd = A.tell + A.rec + w.rng() * 0.16;
  const cd = A.cd[0] + w.rng() * (A.cd[1] - A.cd[0]);
  if (i >= 0) a.kcd[i] = cd; else a.wcd = cd;
  f.mp = Math.max(0, f.mp - (A.mp || 0));
  // Cú dịch chuyển của Bóng Lướt: `stepTel` xoá `f.tel` ngay ở khung nó nổ, nên không thể chờ rồi
  // đọc `f.tel.fired`. Giữ lấy chính cái tel ở đây; nó còn sống trong `w.tels` tới hết `dur`.
  a.blink = A.blink ? e : null;
  // Hẹn giờ cho bản soi gương. `at` là một mốc trên đồng hồ *của cái vệt*: lùi khỏi khung vệt nổ
  // (`A.tell`) đúng bằng nhịp đầu của hiệu ứng, nên hình và sát thương rơi vào cùng một khung. Thả
  // ngay bây giờ thì hiệu ứng chạy xong từ lâu trước lúc vệt nổ -- một cú nổ không có hình -- còn thả
  // đúng khung nổ thì hình bắt đầu sau khi đòn đã ăn.
  //
  // `Math.max(0, …)` cho những cây vũ khí có nhát vung dài hơn cả quãng báo trước của nó: hình bắt đầu
  // ngay và kết muộn hơn cú nổ một chút, thà vậy hơn là một mốc âm không bao giờ tới.
  const lead = A.wpid ? mirLeadWp(f.wp) : mirLead(A.src);
  a.mir = { at: Math.max(0, A.tell - lead), tel: e };
  a.sw = null;
  SFX.cast(A.src || A.wpid || 'whirl_slash',
           clamp((f.x - w.cam.x - W * 0.5) / (W * 0.5), -1, 1));
  return true;
}
// Cho điểm một đòn ở khoảng cách hiện tại. Đây là chỗ chứa gần hết cái "thông minh" của việc *chọn*
// đòn, và nguyên tắc của nó là: một đòn tốt không phải đòn to nhất, mà là đòn **đối phương không kịp
// trả lời**. Nên bốn thứ sau nặng hơn con số sát thương -- đúng tầm, đúng lúc, còn mana để đánh tiếp,
// và không đổ vào một khung người chơi đang bất tử.
//
// Trả 0 nghĩa là không dùng được lúc này, và 0 khác "điểm thấp": ngoài tầm thì thả cũng chỉ là vẽ một
// vệt xuống sàn cho người chơi xem.
function rivalScore(w, f, A, dq, safe, busy) {
  const min = A.min || 0;
  if (dq > A.range || dq < min) return 0;
  // Sát thương trên *thời gian đòn chiếm chỗ*, không phải sát thương trần: một đòn 62 mà báo 0,72
  // giây rồi hồi 8 giây thì không hơn ba đòn 26 trong cùng khoảng ấy.
  const beats = A.ticks ? A.ticks.length : 1;
  let s = A.dmg * beats / (A.dur + 0.30);
  // Sát mép tầm là gần như cho không: người chơi bước một bước là ra khỏi vệt.
  if (dq > A.range * 0.88) s *= 0.55;
  // Người chơi đang có i-frame (dash, hoặc 0,3 giây sau khi trúng đòn) thì đòn nào cũng bay qua
  // người. Đòn rẻ vẫn đáng thả để giữ áp lực; đòn 26+ mana thì gần như luôn nên chờ.
  if (!safe) s *= A.mp >= 26 ? 0.14 : 0.55;
  // Vừa vung vũ khí là bị khoá chân. Đây là cửa sổ mà một đòn báo trước cả giây vẫn trúng.
  if (busy > 0) s *= 1 + Math.min(0.95, busy * 1.7);
  // Vùng nằm lại: giá trị thật của nó là *chặn đường*, không phải con số mỗi nhịp, nên nó không
  // được thắng một đòn dứt điểm chỉ vì cộng năm nhịp lại thì nhiều hơn.
  if (A.linger) s *= 0.82;
  // Còn ít mana thì giữ lại đòn đắt. Tiêu 45 mana vào một cú dễ né là hai mươi giây sau mới có lại,
  // và trong hai mươi giây đó nó chỉ còn cây vũ khí.
  if (A.mp > 0 && f.mp < A.mp + 16) s *= 0.68;
  return s;
}

// Chọn giữa ba chiêu và cây vũ khí. Cây vũ khí là ứng viên thứ tư đi qua *đúng cùng một công thức*,
// không phải một nhánh riêng: nó không tốn mana và hồi nhanh, nên chính `rivalScore` sẽ tự cho nó
// thắng ở tầm gần và tự cho nó thua khi có một chiêu đúng tầm hơn. Một đối thủ chỉ đánh thường khi hết
// chiêu thì đọc ra là một đối thủ đang chờ hồi chiêu, chứ không phải một đối thủ đang chọn.
//
// Điểm của nó nhân thêm `RIV_WP_BIAS`, vì cái công thức kia đo bằng sát thương-trên-thời-gian và ở
// thước đó một nhát vung không bao giờ thắng nổi một chiêu -- xem chú thích của hằng số ấy.
function rivalPick(w, f, dq) {
  const h = w.hero, a = f.ai;
  const safe = h.inv <= 0 && h.dsh <= 0;
  const busy = rivalHeroBusy(w);
  let key = null, idx = -2, best = 0;
  for (let i = 0; i < 3; i++) {
    const A = FOE_ABIL['r_' + f.kit[i]];
    if (!A || a.kcd[i] > 0 || f.mp < (A.mp || 0)) continue;
    const s = rivalScore(w, f, A, dq, safe, busy);
    if (s > best) { best = s; key = A.key; idx = i; }
  }
  const WA = RIVAL_WP[f.wp.id];
  if (WA && a.wcd <= 0) {
    const s = rivalScore(w, f, WA, dq, safe, busy) * RIV_WP_BIAS;
    if (s > best) { best = s; key = WA.key; idx = -1; }
  }
  return key ? { key: key, i: idx } : null;
}
// ---- bộ não ------------------------------------------------------------------------------------
// Thay hẳn `stepFoe` cho đối thủ (js/world.js gọi vào đây ở dòng đầu của nó), và đó là lý do hàm này
// dài: cái nó thay không chỉ là phần chọn đòn mà cả phần chân -- giảm đẩy lùi `Math.exp(-dt*7)`, kẹp
// `BOUND`, `f.mv`/`f.ph` cho vòng bước chân. Bốn dòng cuối hàm là bốn dòng ấy, chép nguyên.
//
// Thứ tự ưu tiên, và thứ tự này *là* cái AI:
//
//   1. **Ra khỏi vùng sắp nổ.** Tuyệt đối, trên mọi thứ khác. Lao nếu đi bộ không kịp.
//   2. **Thả đòn** -- và chỉ khi đang đứng ở chỗ an toàn. Một đối thủ thả đòn từ trong một vũng độc
//      là một đối thủ đổi máu lấy sát thương, tức là người chơi không cần đọc gì cả.
//   3. **Giữ băng khoảng cách của cây vũ khí, và đi ngang.**
//
// Một thứ nó **không** làm: huỷ đòn đang lên khi thấy nguy hiểm tới. Nó không thể -- `stepTel` chỉ
// huỷ khi bị đông cứng hoặc chết. Và cũng không nên: "dụ nó lên đòn rồi phạt" là câu trả lời chính
// của người chơi cho một đối thủ né giỏi. Bỏ cửa đó đi thì trận đấu không còn cửa nào.
function stepRival(w, f, dt) {
  const h = w.hero, a = f.ai, K = KIND.rival;
  if (f.dying) { f.mv = 0; return; }
  if (f.acd > 0) f.acd = Math.max(0, f.acd - dt);
  // Kẹp trước khi trừ: `stepTel` vừa ghi `REL_HOLD` vào đây ở khung đòn nổ, và cái trần này là của
  // riêng đối thủ solo -- xem `RIV_REL`.
  if (f.rel > RIV_REL) f.rel = RIV_REL;
  if (f.rel > 0) f.rel = Math.max(0, f.rel - dt);
  for (let i = 0; i < 3; i++) if (a.kcd[i] > 0) a.kcd[i] = Math.max(0, a.kcd[i] - dt);
  if (a.wcd > 0) a.wcd = Math.max(0, a.wcd - dt);
  if (a.dcd > 0) a.dcd = Math.max(0, a.dcd - dt);
  if (a.sT > 0) a.sT -= dt;
  if (f.mp < f.maxmp) f.mp = Math.min(f.maxmp, f.mp + DUEL_MPR * dt);

  // Vận tốc người chơi, lọc mũ với hằng thời gian RIV_MEM. Lấy từ **hiệu vị trí** chứ không từ
  // `h.vx`: `h.vx` là đẩy lùi và hồi lực, còn thứ cần đón là chỗ đôi chân đang đi tới. Lọc chứ
  // không lấy trần một khung, vì một khung 16 ms có thể rơi đúng lúc người chơi vừa đổi hướng.
  const idt = Math.max(dt, 1e-4);
  const kf = 1 - Math.exp(-dt / RIV_MEM);
  a.hvx += ((h.x - a.hx) / idt - a.hvx) * kf;
  a.hvy += ((h.y - a.hy) / idt - a.hvy) * kf;
  a.hx = h.x; a.hy = h.y;

  // Cú dịch chuyển của Bóng Lướt: dời tới cuối cái vệt đã vẽ, đúng lúc vệt ấy nổ. Nên nó vừa là cú
  // rút ngắn khoảng cách vừa là cú thoát, mà vẫn công bằng -- đường đi đã nằm trên sàn cả 0,4 giây
  // trước đó, và người chơi đọc được nó sẽ ở đâu.
  if (a.blink && a.blink.fired) {
    const p = telEnd(a.blink);
    f.x = clamp(p.x, BOUND.x0, BOUND.x1);
    f.y = clamp(p.y + 1, BOUND.y0, BOUND.y1);
    a.blink = null;
    w.shake = Math.max(w.shake, 1.5);
  } else if (a.blink && a.blink.t >= a.blink.dur) a.blink = null;

  // Thả bản soi gương khi đồng hồ của vệt tới mốc đã hẹn. Đặt ở đây, *sau* `stepTel` của khung này
  // (js/world.js bước `w.tels` trước vòng quái), nên `T.fired` đọc được ngay khung đòn nổ thay vì
  // khung sau -- với những chiêu có nhịp đầu bằng 0 thì một khung chậm là hình đi sau sát thương.
  if (a.mir) {
    const m = a.mir, T = m.tel;
    // Vệt bị huỷ giữa đường: `stepTel` splice nó khỏi `w.tels` và null `f.tel` khi chủ nó bị đông
    // cứng hay đã gục. Không có đòn nào nổ, nên cũng không có hình nào để vẽ.
    if (!T.fired && !f.tel) a.mir = null;
    else if (T.fired || T.t >= m.at) {
      const fx = rivalMirror(w, f, T);
      if (fx && fx.wp) a.sw = fx;
      a.mir = null;
    }
  }

  const casting = !!f.tel;
  // Nhát vung **không khoá chân**; chiêu thì khoá. Đây là chỗ chế độ này rời khỏi luật của quái, và lý
  // do nằm ở phía bên kia sân: trong chín cây vũ khí chỉ `dao` đặt `plant`, tám cây còn lại cho nhân vật
  // đi hết tốc độ suốt nhát vung. Mà nhát vung là *nhịp nền* của trận này (xem `RIV_WP_BIAS` và
  // `DUEL_MPX`), nên khoá chân theo nó là khoá chân gần hết trận: đo được 30% thời gian còn đi lại, tức
  // là một cái bia biết chọn đòn.
  //
  // Lời hứa "chỗ được đánh dấu là chỗ ăn đòn" không mất, vì cái vệt **đi theo chân**: `heroIn` và
  // `drawTellUnder` đọc cùng một `e.x`/`e.y` (js/foe-abil.js), nên dời gốc là dời cả hình lẫn vùng sát
  // thương, trong cùng một khung. `e.ang` thì **không** dời: hướng chốt lúc thả, bằng không đây là một
  // cú vừa đi vừa ngắm lại -- thứ không đọc được, và cũng không phải thứ tay người chơi làm được.
  //
  // Trừ hàng rìu (`aim: 'hero'`): vệt của nó là một vòng chấm *xuống chỗ nhân vật*, không phải cái nón
  // trước mặt, nên dời theo chân là dời cái hố đi khỏi chỗ đã đánh dấu. Cây rìu vẫn khoá chân, và nó
  // *nên* nặng nề như vậy.
  const wpTell = casting && !!f.tel.ab.wpid && f.tel.ab.aim !== 'hero';
  f.chg = casting ? c01(f.tel.t / f.tel.ab.tell) : Math.max(0, f.chg - dt * 5);
  // `f.rel` **không** vào đây nữa. Nó từng vào, và cái giá là mỗi đòn nổ xong đối thủ đứng im thêm
  // `REL_HOLD` -- cộng với hồi vũ khí cũ thì phần lớn trận nó là một cái bia đứng. Giờ chỉ quãng *lên
  // đòn* của chiêu khoá chân, đúng như phía người chơi: nhân vật cũng đi lại được ngay sau khi nhát
  // vung ăn. Khung đánh vẫn đọc ra được vì `RIV_REL` giữ `f.rel` một quãng ngắn cho `foeFrame`.
  const held = casting && !wpTell;
  // Dáng cây vũ khí trên tay, lấy thẳng từ *chính nhát vung soi gương* (`a.sw` giờ là hàng `w.fxs` ấy,
  // không còn là cái vệt). Trước đây nó là một công thức nội suy trên đồng hồ của vệt, và một công
  // thức thì luôn lệch: `heldPose` đọc `wp.hits`/`wp.frames`, nên chỉ đúng khi tiến độ truyền vào là
  // tiến độ thật của tấm sheet. Giờ tay và hình vung là cùng một đồng hồ, y như tay người chơi.
  if (a.sw) {
    f.pose = a.sw.p;
    if (a.sw.t >= a.sw.dur) { a.sw = null; f.pose = -1; }
  } else f.pose = -1;

  const dx = h.x - f.x, dy = (h.y - 1) - f.y;
  const dscr = Math.max(Math.hypot(dx, dy), 1e-3);
  // Hai thước, và lẫn chúng là cả một lớp lỗi: `dscr` là khoảng cách *trên màn hình*, dùng để lái
  // chân; `dq` là khoảng cách trong khung không nén, thước duy nhất mà mọi `range`/`min`/`r` của
  // `FOE_ABIL` được đo bằng. Chúng lệch nhau hai lần theo chiều dọc.
  const dq = Math.hypot(dx, dy / GSQ);
  // Hướng cây vũ khí trên tay: lúc đang lên đòn thì nhìn theo *cái vệt*, không theo nhân vật -- tay phải
  // chỉ đúng chỗ đòn sắp rơi. Với hàng `dir` thì phải suy từ `e.ang` chứ không lấy `e.x`/`e.y`, vì gốc
  // của vệt ấy **chính là chỗ nó đứng**: `tx - f.x` bằng 0 và `atan2` trả về đúng 90 độ, tức là cây vũ
  // khí chúc thẳng xuống đất suốt quãng báo đòn. Từ lúc vệt đi theo chân (`wpTell`) thì hiệu đó bằng 0
  // *tuyệt đối*, nên đây không còn là chuyện lệch vài độ.
  let tx = h.x, ty = h.y - 1;
  if (casting) {
    const A = f.tel.ab;
    if (A.aim === 'dir') {
      const L = A.len !== undefined ? A.len : A.r;
      tx = f.tel.x + Math.cos(f.tel.ang) * L;
      ty = f.tel.y + Math.sin(f.tel.ang) * L * GSQ;
    } else { tx = f.tel.x; ty = f.tel.y; }
  }
  f.aimAng = Math.atan2((ty - (f.y - f.h * 0.5)) / HELD_SQ, tx - f.x);
  const danger = duelThreat(w, f);

  let ax = 0, ay = 0;
  if (a.dsh > 0) {
    a.dsh -= dt;
    ax = a.dvx; ay = a.dvy;
  } else if (f.frozen <= 0 && !held) {
    if (danger) {
      // Lao khi **đi bộ không kịp**, không phải khi có nút lao. Quãng còn phải đi chia tốc độ đi bộ
      // ra thời gian cần; `DTH.hot` là nghịch đảo thời gian còn lại. Một cú hút thì luôn lao, vì
      // đứng trong một cú hút mà đi bộ ra là đi bộ ngược chiều một lực.
      const walkT = DTH.need / Math.max(1, K.spd * 0.86);
      if (a.dcd <= 0 && (walkT * DTH.hot > 0.9 || DTH.pull)) {
        a.dsh = RIV_DASH_T; a.dcd = RIV_DASH_CD;
        a.dvx = DTH.x * RIV_DASH; a.dvy = DTH.y * RIV_DASH * 0.72;
        ax = a.dvx; ay = a.dvy;
        SFX.dash(clamp((f.x - w.cam.x - W * 0.5) / (W * 0.5), -1, 1));
      } else { ax = DTH.x * K.spd; ay = DTH.y * K.spd * 0.72; }
      f.flip = dx < 0;
    } else {
      // `!f.tel` phải viết ra. Trước đây `held` bao luôn nó: đang lên đòn thì cả nhánh này không chạy.
      // Từ lúc nhát vung không khoá chân nữa thì dòng này chạy được *trong* lúc một vệt đang lên, và
      // `startCast` không tự chối -- thiếu chốt này là đối thủ đè một đòn lên đòn của chính nó, cái vệt
      // cũ mất chủ và `a.mir` bị ghi lại giữa đường.
      if (f.acd <= 0 && !f.tel) {
        const p = rivalPick(w, f, dq);
        if (p) rivalCast(w, f, p.key, p.i);
      }
      // `!f.tel` là chốt "không đi ngay trong khung vừa thả đòn" -- và với nhát vung thì `wpTell` mở lại
      // cửa ấy cho những khung *sau* đó. Khung thả thì `wpTell` còn false (nó đọc `f.tel` từ đầu hàm, lúc
      // chưa có vệt nào), nên chốt cũ vẫn nguyên ý nghĩa cũ.
      if (!f.tel || wpTell) {
        let band = a.band;
        // Đề phòng bằng khoảng cách. Ba chiêu nổ dưới 0,15 giây (Sao Vỡ, Lốc Chém, Xé Máu, Ngưng
        // Thời) không né kịp được -- thời gian phản ứng của người thật là 0,2 giây, nên một AI né
        // được chúng là một AI gian lận. Nó trả bằng cách **không đứng trong bán kính của chúng**,
        // đúng cách người giỏi phòng những đòn không né được.
        if (DTH.near > band) band = DTH.near;
        // Người chơi vừa vung xong, hoặc còn đang chờ hồi vũ khí: cửa sổ để tiến vào. Kể cả một tay
        // cung cũng tiến -- áp sát một người không đánh trả được là cách một người thật chơi.
        if (rivalHeroBusy(w) > 0.05 || w.wcd > 0.18) band *= 0.74;
        const want = dq > band * 1.12 ? 1 : (dq < band * 0.80 ? -1 : 0);
        ax = dx / dscr * K.spd * want; ay = dy / dscr * K.spd * 0.72 * want;
        // Đi ngang, và giữ một chiều đủ lâu (`a.sT`) mới đảo. Một đối thủ đứng yên trong băng là một
        // cái bia cho mọi chiêu nhắm điểm; đảo chiều mỗi khung thì rung tại chỗ, cũng là một cái bia.
        //
        // 0,34-0,86 giây một chiều, ngắn hơn hẳn 0,55-1,25 của bản đầu, và mạnh hơn: đó là chỗ "giống
        // người" nằm. Một người thật không đi một đường vòng dài rồi đảo -- họ nhích, đổi ý, nhích lại,
        // và cái nhịp không đều ấy chính là thứ khiến ngắm vào họ khó. Đường vòng dài thì người chơi
        // đọc được cung của nó sau nửa giây và chỉ cần dẫn tay theo.
        if (a.sT <= 0) { a.side = -a.side; a.sT = 0.34 + w.rng() * 0.52; }
        // Trong băng thì đi ngang hết sức (không có thành phần tiến/lùi nào để cộng vào, nên đây là
        // toàn bộ tốc độ của nó). Lúc đang tiến hay lùi thì 0,52 -- cao hơn 0,40 của bản đầu, nên
        // đường vào không còn là một đường thẳng đâm tới mà là một đường chéo.
        const sm = (want === 0 ? 1.0 : 0.52);
        ax += -dy / dscr * K.spd * sm * a.side;
        ay += dx / dscr * K.spd * 0.72 * sm * a.side;
        f.flip = dx < 0;
      }
    }
  }

  // Bốn dòng chép nguyên từ `stepFoe`, và phải chép: kẹp `BOUND` là thứ giữ nó trong sân đấu, còn
  // `Math.exp(-dt*7)` là đường giảm của đẩy lùi -- viết lại bằng số khác thì cùng một cú vung sẽ đẩy
  // đối thủ đi một quãng khác với quãng nó đẩy một con quái, và cảm giác của cây vũ khí đổi theo.
  const px = f.x, py = f.y;
  f.x = clamp(f.x + (ax + f.vx) * dt, BOUND.x0, BOUND.x1);
  f.y = clamp(f.y + (ay + f.vy) * dt, BOUND.y0, BOUND.y1);
  // Vệt của nhát vung đi theo chân (xem `wpTell`). Đặt **sau** cú kẹp `BOUND`, nên gốc vệt dời đúng
  // bằng quãng đôi chân thật sự đi được -- ép vào tường thì vệt cũng đứng lại theo. Cộng dồn hiệu vị
  // trí chứ không gán `f.x`: gốc của một vệt `dir` bằng `f.y - 1` chứ không bằng `f.y`, và hàng cung
  // còn `min: 22` đo từ gốc ấy.
  if (wpTell) { f.tel.x += f.x - px; f.tel.y += f.y - py; }
  const kk = Math.exp(-dt * 7);
  f.vx *= kk; f.vy *= kk;
  const dd = Math.hypot(f.x - px, f.y - py);
  f.mv = (f.frozen > 0 || held) ? 0 : dd / Math.max(dt, 1e-4);
  f.ph = (f.ph + (f.mv > 0.4 ? dd / K.cyc : dt * 1.6)) % 4;
  // Và **không có sát thương chạm**. `stepFoe` rút 22 máu/giây cho mọi thứ dán vào nhân vật, còn ở
  // đây thì không, có chủ ý: một dòng máu chảy không báo trước là thứ duy nhất trong trận này người
  // chơi không có câu trả lời, và nó phạt đúng cái việc *áp sát* -- tức là phạt đúng câu trả lời cho
  // một đối thủ tầm xa. Mọi sát thương của đối thủ này đi qua một vệt trên sàn, không có ngoại lệ.
}

// ---- vẽ vũ khí trên tay đối thủ ------------------------------------------------------------------
// Bản sao của `drawHeld` (js/weapon.js) đọc từ `f` thay vì từ `w.hero`, và nó là một bản sao chứ
// không phải một hàm dùng chung vì `drawFoe` **không nhận `w`**: đổi chữ ký của nó là sửa mọi chỗ gọi
// trong js/render.js, còn nhét `w` vào một biến toàn cục để đọc lại ở đây thì tệ hơn hẳn một bản sao
// mười dòng. Không cần art mới: mọi vũ khí đã có `wp.held` và `wp.hpal` sẵn để nằm trong tay.
//
// Gọi hai lần một khung, như bản gốc: nửa vòng ngắm chỉ ra xa camera vẽ *trước* thân, nửa còn lại vẽ
// sau, nên một cây kiếm giương lên hướng bắc đi sau vai và một cú đâm xuống nam che qua hông.
function drawFoeHeld(f, back) {
  if (f.kind !== 'rival' || f.dying || !f.wp || !f.wp.held) return;
  const wp = f.wp, ang = f.aimAng || 0;
  if ((Math.sin(ang) < -0.12) !== !!back) return;
  const ps = heldPose(wp, f.pose === undefined ? -1 : f.pose);
  const sgn = f.flip ? -1 : 1;
  const hf = foeFrame(f);
  const hx = f.x + 4 * sgn, hy = f.y - f.h + 7 + hf.dy;
  blitRot(wp.held, wp.hpal,
    hx + Math.cos(ang) * ps.ext, hy + Math.sin(ang) * ps.ext * HELD_SQ,
    wp.hold.pv[0], wp.hold.pv[1], ang + ps.rot * sgn - SPRITE_UP,
    1, f.flash, HELD_SQ);
}

// ---- chữ ----------------------------------------------------------------------------------------
// Bộ kit của đối thủ **phải** in ra bằng DOM, không có đường nào khác: bảng ký tự trong js/sprites.js
// chỉ có chữ số cùng `N` và `É`, nên một cái nhãn trong canvas là bất khả. Và nó phải in ra ở đâu đó,
// vì "ba chiêu ngẫu nhiên" mà người chơi không biết là ba chiêu nào thì mỗi vòng là một lần thử-sai
// chứ không phải một lần đọc. Bảng quái trong phần hướng dẫn cũng không giúp: nó tự sinh từ
// `KIND[].abil`, mà `KIND.rival.abil` rỗng.
function duelKitText(w) {
  const d = w && w.duel, k = d && d.kit;
  if (!k) return '';
  const sk = k.kit.map(id => (RIVAL_SK[id] ? RIVAL_SK[id].name : id)).join(' · ');
  return k.wp.name + ' · ' + sk;
}
// Một dòng ngắn cho HUD: đối thủ đang cầm gì, còn bao nhiêu máu và mana.
function duelLine(w) {
  const d = w && w.duel;
  if (!d) return '';
  if (d.done) return d.done === 'win' ? 'THẮNG · ' + duelKitText(w) : 'THUA · ' + duelKitText(w);
  if (!d.rival) return 'SOLO · đối thủ đang tới...';
  const f = d.rival;
  return 'SOLO · ' + duelKitText(w)
       + ' · ' + Math.ceil(f.hp) + '/' + f.maxhp + ' · mana ' + Math.round(f.mp);
}
// Hai dòng cho menu tạm dừng lúc trận đã xong. Trả `null` khi còn đang đánh, để js/shell.js phân biệt
// được "tạm dừng giữa trận" (menu giữ nguyên chữ cũ) với "trận đã kết" mà không phải tự đọc `d.done`.
function duelResult(w) {
  const d = w && w.duel;
  if (!d || !d.done) return null;
  const win = d.done === 'win';
  const h = w.hero;
  return {
    win: win,
    head: win ? 'THẮNG' : 'THUA',
    // Cái đáng nói ra sau một trận tay đôi là *trận vừa rồi sát tới đâu*, nên dòng dưới đọc máu còn
    // lại của bên thắng: thắng với 12 máu và thắng với 300 máu là hai trận khác nhau hẳn.
    sub: win ? 'CÒN ' + Math.max(1, Math.ceil(h.hp)) + '/' + h.maxhp + ' MÁU'
             : 'ĐỐI THỦ CÒN ' + Math.max(1, Math.ceil(d.rival ? d.rival.hp : 0)) + ' MÁU',
    kit: duelKitText(w),
    again: win ? 'ĐẤU TRẬN NỮA' : 'ĐÁNH LẠI',
  };
}
// Tên hai màn hình chọn dùng lại, để js/shell.js không phải viết chuỗi tiếng Việt lẫn vào mã.
const DUEL_TXT = {
  menu: 'SOLO 1 ĐẤU 1',
  enter: 'VÀO TRẬN SOLO',
  head: 'CHỌN CHIÊU RỒI SOLO VỚI MỘT ĐỐI THỦ MANG VŨ KHÍ VÀ BA CHIÊU NGẪU NHIÊN',
};
