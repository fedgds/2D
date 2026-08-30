"use strict";
// ===========================================================================
// 3c-bis. Boss art -> khung vẽ được. Nối dữ liệu sinh tự động trong boss-frames.js với
//     đúng cùng một đường vẽ mà mọi sprite khác đi qua: `blit` một lưới ký tự.
//
//     Bốn bộ trong art (idle/cast/hit/death) không khớp một-một với những gì world.js
//     đã theo dõi, nên chỗ nối là ở đây chứ không phải trong logic game -- không thêm
//     một trường trạng thái nào vào foe:
//
//       death <- f.dying (0 -> 0.30 rồi bị xoá khỏi w.foes)
//       cast  <- f.chg (đếm lên 0->1 suốt thời gian tell) rồi f.rel (giữ qua lúc trúng)
//       hit   <- f.flash, chính cái mà hurt() đã đặt lên 0.55 và step() trừ 2.6/s
//       walk  <- không có trong art: là bộ đứng cộng một nhịp nhấp 1 px
//
//     Thứ tự ưu tiên là death > cast > hit > walk/idle. Cast trên hit là có chủ ý:
//     boss đang tung chiêu mà bị đánh thì cái người chơi cần đọc vẫn là chiêu đó, và
//     một khung giật lùi 0,17 s cắt ngang telegraph là cách nhanh nhất để chết oan.
// ===========================================================================

// Nhân vào toàn bộ palette *một lần lúc nạp*, không phải mỗi pixel. Tonemap ở core.js
// hạ những màu sáng nhất xuống (lum 0.9 ra ~0.69), nên đây là chỗ bù lại nếu art trông
// đục hơn bản gốc. Để 1 thì boss nhạt đúng bằng mọi sprite vẽ tay, và tầng VFX vẫn là
// thứ sáng nhất trên màn hình -- đó là mặc định muốn giữ.
const BOSS_ART_GAIN = 1;

// Ngưỡng f.flash còn được coi là "vừa ăn đòn". hurt() đặt 0.45 cho cú đầu (0.55 nếu
// dồn), step() trừ 2.6/s, nên 0.16 cho ra ~0.11 s giật lùi: đủ thấy ở 60 fps, ngắn hơn
// một nhịp gõ, và tự động dài ra khi bị đánh liên tiếp.
const BOSS_HIT_CUT = 0.16;
const BOSS_HIT_MAX = 0.55;

const ANIM_IMG = {};
{
  for (const k in BOSS_ART) {
    const A = BOSS_ART[k];
    // Bảng tra ký tự -> RGB, cùng dạng PAL để `blit` không cần biết mình đang vẽ con gì.
    const pal = {};
    for (let i = 0; i < A.pal.length; i++) {
      const c = hexc(A.pal[i]);
      pal[BOSS_ART_CH[i]] = [c[0] * BOSS_ART_GAIN, c[1] * BOSS_ART_GAIN, c[2] * BOSS_ART_GAIN];
    }
    const set = an => A.anim[an].map(g => fr(g, 0));
    const idle = set('idle');
    // Bộ đi bộ: art không có, nên lấy bộ đứng và nhấc cả người 1 px ở khung lẻ. Bốn khung
    // để khớp với f.ph vốn chạy vòng 0..3. Không dùng nhịp 0/-1/-2/-1 như bộ vẽ tay: các
    // khung đứng ở đây *đã* khác chiều cao nhau (art thở), nên cộng thêm một nhịp lớn nữa
    // là chân rời đất hẳn -- đúng cho con bay, sai cho khối sắt nặng hai tấn.
    const walk = [];
    for (let i = 0; i < 4; i++) walk.push(fr(idle[i % idle.length].g, i & 1 ? -1 : 0));
    const cast = set('cast'), hit = set('hit'), death = set('death');
    // Chiều cao hộp tính ở đây, không bake sẵn trong boss-frames.js: nhịp nhấp ở trên là một
    // `dy` cộng thêm *sau* khi sinh dữ liệu, nên chỉ chỗ này biết đỉnh đầu thật sự tới đâu.
    // bh là chỗ treo thanh máu (render.js: y - f.h - 5), và nó phải cao hơn mọi tư thế còn
    // sống -- kể cả khung giơ tay và kể cả lúc đang nhấp lên -- vì một thanh máu nằm giữa hai
    // cái sừng là thanh máu không đọc được đúng lúc cần đọc nó nhất.
    const scale = typeof BOSS_ART_SCALE === 'number' ? BOSS_ART_SCALE : 1;
    const bh = Math.max(...[].concat(idle, walk, cast, hit).map(f => f.g.length / scale - f.dy));
    ANIM_IMG[k] = { idle, walk, cast, hit, death, pal, scale,
                    cw: A.cw / scale, bw: Math.floor(A.bw / scale), bh };
  }
}

// Song song với foeFrame() ở anim.js, và có cùng một hợp đồng: nhận foe, trả { g, dy }.
// Tách ra chứ không nhồi vào foeFrame vì foeFrame là thứ tools/check-boss.js đo trên bộ
// lưới vẽ tay, và nó phải tiếp tục trả về đúng bộ đó.
function foeImgFrame(f) {
  const a = ANIM_IMG[f.kind];
  if (f.dying) {
    const n = a.death.length;
    return a.death[clamp(Math.floor(f.dying / 0.30 * n), 0, n - 1)];
  }
  // Bộ cast trong art là (lên gồng..., BÙNG, thu về): xem tools/out/pose-*.png thì khung áp
  // cuối là khung sáng nhất và khung cuối đã về gần tư thế đứng. Nên nó chia làm hai đoạn với
  // hai đồng hồ khác nhau, chứ không phải một dãy trải đều: f.chg (cả thời gian tell) lo đoạn
  // lên gồng, còn f.rel -- 0,42 s bắt đầu đúng lúc chiêu phát -- lo hai khung cuối. Trải đều
  // theo chg sẽ đặt khung bùng vào lúc telegraph *chưa* nổ, tức là con boss loé sáng trước khi
  // có gì xảy ra, và đó chính là tín hiệu người chơi dùng để né.
  const nc = a.cast.length, nt = nc >= 4 ? 2 : 1, nw = nc - nt;
  if (f.chg > 0) return a.cast[clamp(Math.floor(f.chg * nw), 0, nw - 1)];
  if (f.rel > 0) {
    // REL_HOLD khai báo ở foe-abil.js, nạp sau file này -- đọc lúc chạy thì đã có. Dùng thẳng
    // chứ không chép lại thành hằng riêng: hai con số này *phải* là một, vì nó là cùng cái
    // đồng hồ, và một bản chép sẽ lệch đúng vào lần ai đó chỉnh REL_HOLD.
    const p = (REL_HOLD - f.rel) / REL_HOLD;
    return a.cast[nw + clamp(Math.floor(p * nt), 0, nt - 1)];
  }
  if (f.flash > BOSS_HIT_CUT) {
    const n = a.hit.length;
    const p = (BOSS_HIT_MAX - f.flash) / (BOSS_HIT_MAX - BOSS_HIT_CUT);
    return a.hit[clamp(Math.floor(p * n), 0, n - 1)];
  }
  const n = f.mv > 0.4 ? a.walk : a.idle;
  return n[Math.floor(f.ph) % n.length];
}
