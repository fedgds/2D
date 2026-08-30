# `js/` — engine

Trước đây toàn bộ engine là **một** `<script>` viết thẳng trong `index.html` (~4.5k dòng).
Giờ mỗi mục của file đó là một file ở đây. Thứ tự nạp trong `index.html` đúng bằng thứ tự
cũ, và nội dung từng mục **không đổi một byte** — chỉ thêm `"use strict";` ở dòng đầu.
Banner trong mỗi file vẫn giữ số mục cũ, nên có hai mục cùng đánh số `3b` (`arena.js` và
`sfx.js`); file thêm sau đó mang số kèm hậu tố (`dash.js` là `6a-bis`, `boss-img.js` là
`3c-bis`). Thứ tự thật là bảng dưới đây.

## Thứ tự nạp

| file | nội dung |
| --- | --- |
| `core.js` | buffer HDR, tonemap, Bayer dither, `hexc`/`asOutput`, rng, `fpow` |
| `fx.js` | primitive cộng sáng: `core`, `beam`, `ring`, `arc`, `bolt`, `veil`… |
| `sprites.js` | palette + grid nhân vật, `blit`, `blitRot`, `text3x5` |
| `boss-frames.js` | **sinh tự động** — lưới ký tự + palette riêng của 3 boss, dựng từ ảnh |
| `scene.js` | sàn dựng sẵn, bóng tiếp đất, đèn riêng của hero, `setCam` |
| `arena.js` | đọc registry `map/`, `applyMap`, rải prop, hạt môi trường |
| `anim.js` | sinh mọi frame animation lúc nạp từ một pose authored |
| `boss-img.js` | `ANIM_IMG`/`foeImgFrame`: bốn bộ ảnh → khung vẽ được, và hộp `bh` |
| `weapon.js` | 6 vũ khí: sheet 16 khung (`ART`), `drawSwing`, `drawHeld`, `swing`, `reswing`, `lungeHero` |
| `sfx.js` | `SFX` — mọi tiếng đều tổng hợp bằng WebAudio lúc chạy |
| `world.js` | hero, quái, damage, `newWorld`, `step`, các hàm trúng đòn |
| `render.js` | thứ tự vẽ một khung, thanh HP quái, vòng ngắm cảm ứng (`drawAimCue`), minimap (`setMinimapTop` cho chế độ điện thoại) |
| `skills.js` | 16 skill (`SKILLS`) |
| `dash.js` | chiêu lướt né mặc định — không tính vào 3 slot |
| `foe-abil.js` | chiêu quái + vùng cảnh báo vẽ trên sàn |
| `boss.js` | 3 boss: grid vẽ tay (bản dự phòng, art ảnh thắng), `bossCast`, cửa `bossGate` |
| `boss-abil.js` | 12 chiêu boss + `BOSS_SHAPE` (vùng tô, và chính nó là vùng gây damage) |
| `lab.js` | `globalThis.LAB`: cửa cho harness node, không cần DOM |
| `icons.js` | icon 32×32 vẽ bằng canvas cho hotbar và bảng chọn |
| `shell.js` | shell browser: layout, menu/hướng dẫn, input, phím cảm ứng, vòng lặp khung |

## Lưới điểm ảnh — vì sao game từng trông mờ

`layout()` trong `shell.js` giữ **một** bất biến, và nó là thứ duy nhất quyết định game trông
sắc hay mờ:

> Bộ đệm canvas (`screen.width/height`) phải bằng đúng cỡ của hộp `#stage` tính theo điểm ảnh
> **vật lý** — tức là `px CSS × devicePixelRatio` — và gốc của hộp cũng phải nằm tròn trên lưới
> điểm ảnh đó.

Khớp được thì bước cuối (canvas → màn hình) là copy 1:1, và lần phóng cuối trong cả đường đi là
`ctx.drawImage` với `imageSmoothingEnabled = false`. Gameplay vẫn dùng lưới logic `W×H`, nhưng
browser vẽ VFX và art nhập ở `RW×RH = 2W×2H`: một điểm gameplay có bốn subpixel render. Nhờ vậy
frame vũ khí không còn bị thu 300 px xuống 72–100 px trước khi phóng lên, còn sàn/sprite vẽ tay
vẫn giữ đúng cỡ pixel authored. Harness node không có `document` nên `RENDER_SCALE = 1` và ảnh
kiểm 320×180 cũ không đổi.

Bốn subpixel ấy là bốn lần số điểm ảnh cho cả tầng vẽ và tầng tonemap, nên máy yếu có công tắc
riêng: nút **ĐỘ NÉT** ở menu chính ghi `localStorage['sl.sharp']`, script inline trong
`index.html` đọc ra `window.FRAME_SHARP` **trước** `js/core.js`, và `RENDER_SCALE` lấy theo đó —
`0` là quay về đúng 320×180 một mẫu mỗi điểm ảnh, tức giao diện mềm như bản cũ. Nó không đổi được
giữa phiên (`buf` ở `core.js` và `FLOOR` ở `scene.js` cấp theo con số này ngay lúc nạp), nên
`setSharp` ghi xong là `location.reload()`, và nút chỉ có ở menu chính — chỗ chưa có ván nào để
mất.

Bản trước chốt bộ đệm ở `320 * round(w / 320)` rồi để CSS kéo nó vào cái hộp đang có. Trên
Windows ở mức phóng 125% (`devicePixelRatio = 1.25`) hộp 1221 px CSS là 1526,25 điểm ảnh thật
cho một bộ đệm 1280 — **màn hình** lấy mẫu lại ở tỉ lệ 1,1924, và `image-rendering: pixelated`
không cứu được: thuộc tính đó chỉ giữ mép cứng khi phóng lên số nguyên lần, còn `round()` thì
thường xuyên cho ra bộ đệm *lớn hơn* hộp, và thu nhỏ thì trình duyệt nội suy trơn. Kết quả là
mọi thứ mờ đi — sprite vẽ tay, art boss, sàn, hiệu ứng, chữ HUD.

Ba chỗ dễ làm hỏng lại bất biến đó:

1. **`border` trên `#screen`.** Với `* { box-sizing: border-box }` một viền 1 px ăn 2 px ra khỏi
   đúng cái hộp vừa tính. Đường viền khung giờ là `outline` trên `#stage` — vẽ ngoài hộp, không
   tính vào layout.
2. **Làm tròn bề rộng và chiều cao riêng nhau.** Cỡ vật lý là `u * FQW × u * FQH` với
   `FQW/FQH = (W, H) / gcd(W, H)` — bậc nhảy nhỏ nhất còn giữ đúng tỉ lệ khung (với 320×180 ra
   đúng `u*16 × u*9` như bản trước) — nên `bw/W` và `bh/H` bằng nhau *đúng bằng nhau* và điểm ảnh
   game vuông. Lấy `round()` cho từng chiều thì hai tỉ lệ lệch nhau chút một và mọi vòng tròn hơi
   méo.
3. **Vị trí, không chỉ kích cỡ.** `#stage` do flexbox căn giữa; chỗ trống chia ra số lẻ là mép
   rơi vào *giữa* một điểm ảnh vật lý và cả canvas bị trộn lại lần nữa. `snapStage()` đo rồi đẩy
   về lưới bằng một `translate` nhỏ hơn 1 px CSS. Nó chạy hai lần mỗi lượt layout: lúc nạp trang
   hotbar còn chưa có ô nào nên `#app` còn cao lên nữa sau đó. Ngoại lệ duy nhất là `body.tedit`
   (bảng sắp xếp phím): ở đó cú đẩy bị bỏ hẳn, vì một `transform` bất kỳ biến `#stage` thành
   stacking context và nhốt `z-index` của `#overlay` lại bên trong — xem bullet về bảng đó ở dưới.

Kiểm nhanh trong console — cả bốn dòng phải đúng:

```js
(() => { const c = screen, r = c.getBoundingClientRect(), d = devicePixelRatio; return {
  'bộ đệm == hộp': r.width * d === c.width && r.height * d === c.height,
  'ô vuông': c.width / W === c.height / H,
  'gốc trên lưới': Number.isInteger(Math.round(r.left * d * 64) / 64),
  'nearest': c.getContext('2d').getImageData(0, 0, c.width, 8).data.every(v => v % 17 === 0) }; })()
```

Dòng cuối là phép đo trực tiếp: engine lượng hoá về 16 mức mỗi kênh nên mọi giá trị nguồn là
bội của 17, và một điểm nào **không** phải bội của 17 là bằng chứng có nội suy.

Art boss gốc cao ~1536 px không còn bị hạ thẳng xuống 40 mẫu ảnh. Generator dùng
`BOSS_ART_SCALE = 2`, sinh thân cao 80 mẫu rồi `blitFine` đưa chúng thẳng vào lưới render 2×;
`boss-img.js` chia kích cỡ về 40 đơn vị gameplay khi dựng `bw/bh`. Vì vậy ngoại hình có gấp đôi
chi tiết nhưng hitbox, thanh máu và kích cỡ con boss trong thế giới không đổi.

## Bề rộng khung chạy theo máy — `H = 180` là bất biến, `W` thì không

`H = 180` là con số mà **mọi** tầm chiêu, cỡ sprite và bố cục HUD đo theo; nó không đổi. `W` thì
chỉ là *mặc định* 320. Một máy màn 20:9 quay ngang mà vẽ khung 16:9 thì mất hai dải đen chiếm
~18% bề rộng, và chỉ có ba cách lấp: cắt bớt khung (mất minimap góc trên phải với HUD trên đầu),
kéo dẹt (giết đúng cái bất biến điểm ảnh vuông ở trên), hoặc **vẽ rộng ra**. Cách thứ ba là cách
duy nhất không phải bỏ một thứ gì.

| ai làm gì | ở đâu |
| --- | --- |
| đo máy, đặt `window.FRAME_W` | script inline trong `index.html`, **trước** `js/core.js` |
| đọc `sl.sharp`, đặt `window.FRAME_SHARP` | cùng script inline đó |
| kiểm lại rồi chốt `W` | `core.js` dòng đầu |
| lượng hoá bộ đệm theo `gcd(W, H)` | `FGCD/FQW/FQH` trong `shell.js` |

Bốn chuyện ở đây không đổi được:

- **Phải chốt trước `core.js`.** File đó cấp `buf`, `FLOOR`, `FLOOR_RGBA` ngay lúc chạy theo
  `NP = RW * RH`, mà `RW/RH` lại suy từ `W/H`. Một con số quyết định muộn hơn một dòng là một
  bộ đệm sai cỡ vĩnh viễn.
- **Đo `window.screen`, không đo viewport.** Viewport co lại theo thanh địa chỉ rồi giãn ra khi
  vào fullscreen, mà bộ đệm chỉ cấp được một lần; `screen` thì đứng yên cả phiên. Hệ quả phải
  biết: máy càng dài thì thấy *nhiều sân hơn* một chút so với bản chơi bằng chuột.
- **Bội của 20, kẹp trong [320, 480].** Bội của 20 giữ `gcd(W, 180) >= 20`, tức bậc nhảy của bộ
  đệm vẫn là 9 điểm ảnh vật lý theo chiều cao như thời 16:9 chẵn (mất nhiều nhất ~1% bề rộng so
  với lấp kín tuyệt đối). Máy 2000×920 của người báo lỗi ra `W = 380`: hai dải đen từ ~9% mỗi bên
  còn ~1,4% — đo trong browser ở viewport 760×350 thì đúng 1,87% mỗi bên, so với 9,47% nếu giữ
  320. `core.js` **không tin** con số truyền vào, nó kiểm lại cả ba điều kiện.
- **Chỉ máy *chỉ có* cảm ứng mới tính.** Desktop giữ đúng 320×180 nên mọi ảnh chụp ở `tools/` và
  mọi phép cân bằng của bản chuột không đổi một byte. Harness node cũng vậy: nó nối đúng những thẻ
  `<script>` này rồi chạy trong `node:vm` **không có `window`**, nên câu đầu của script inline là
  một cửa `typeof window === 'undefined'` → thoát, và `typeof FRAME_W` ở `core.js` ra `undefined`
  → 320.


MENU → **CHẾ ĐỘ ĐIỆN THOẠI** bật `body.mob`, và đó là *toàn bộ* công tắc: không có trang riêng,
không có đường vào sim riêng. Lựa chọn nhớ ở `localStorage['sl.mob']`; lần đầu mở mà máy chỉ có
con trỏ thô (`(pointer: coarse)` và không có `(pointer: fine)`) thì tự bật.

Ba lời hứa của phần này, và mỗi cái là một lý do để *không* viết nhánh riêng:

1. **Một chiêu bấm bằng ngón tay và cùng chiêu đó bấm bằng phím `1` là đúng một thứ.** Năm nút
   bên phải cuối cùng đều gọi `fire(n, at)` — cùng hàm mà chuột và bàn phím gọi, chỉ khác là chỗ
   ngắm được truyền thẳng vào thay vì để `aimWorld()` tự đoán. Joystick chỉ ghi vào
   `stick.dx/dy` rồi `frame()` **cộng** vào `inp.dx/dy` cạnh WASD. `step()` tự chuẩn hoá vector
   đó, nên nghiêng cần ít hay nhiều không đổi tốc độ chạy: nửa tốc độ chỉ là nửa tốc độ *sai* với
   mọi con số né đòn mà cả game được cân theo.
2. **Ô hotbar và nút cảm ứng không thể nói khác nhau.** Một slot có nhiều *mặt*: `slotFaces[n]`
   là danh sách mặt, `paint()` và `paintCds()` tính một lần rồi ghi ra tất cả. Thứ mỗi ô đang
   mang thì suy ra từ `loadout` qua `slotInfo(n)`, không ai tự nhớ.
3. **Lưới điểm ảnh vẫn nguyên bất biến ở trên.** `layout()` chỉ đổi *hộp nào* được lấp: mobile
   là khung lớn nhất đúng tỉ lệ `W:H` nằm trong cả viewport (bỏ topbar với hotbar), rồi vẫn đúng
   phép tính `u*FQW × u*FQH` theo điểm ảnh vật lý và vẫn `snapStage()`.

Những chỗ đã phải sửa vì *không có chuột*, và tại sao không có cách nào rẻ hơn:

- **Joystick có bệ cố định.** `stickHome()` đặt bệ cách hai mép vùng nhận `0,28` lần đường kính
  và **không ai dời nó nữa**: hướng đi là vector từ tâm bệ tới ngón, núm kẹp ở vành
  (`stickTo`), vùng chết `0,16` để tay không vững không thành ý muốn đi. Bản trước cho bệ nhảy
  tới chỗ ngón vừa đặt rồi *kéo cả bệ theo* khi trượt quá vành. Nghe hợp lý cho tới lúc chơi
  thật: bệ đi lang thang khắp màn hình, và vì "giữa" luôn nằm ở chỗ ngón vừa rời khỏi nên không
  bao giờ cảm được mình đang đẩy hướng nào mà không nhìn xuống tay — đúng thứ mà một cần điều
  khiển tồn tại để khỏi phải làm. Con số `0,28 × đường kính` thay cho `12 px`: sát mép là bờ máy
  chặn mất một phần cung ngón cái quét được, và trên máy màn cong thì mất cả cảm giác chạm. Người
  chơi *đặt* được bệ ở đâu (dưới) thì `stickHome()` lấy chỗ đó thay cho mặc định, nhưng vẫn kẹp
  trong vùng nhận `#tstick` một khoảng bằng bán kính bệ — bệ nằm nửa ngoài vùng nhận là một cần
  điều khiển đẩy sang phải được mà sang trái thì không.
- **Cụm nút bên phải là một nan quạt, và hình dạng đó nằm trong CSS.** `.tb[data-slot="N"]` khai
  một vector đơn vị (`--dx/--dy`) với một bán kính cung (`--arc`), neo là *tâm* nút đánh thường
  cách hai mép `1,05 --tu`. `buildTouch()` chỉ đẻ ra năm cái nút rồi gắn `data-slot`, không dựng
  hàng nào — nên đổi bố cục là đổi bốn dòng CSS, và đổi cỡ cả cụm là đổi `--tu`. Ngón cái quay
  quanh một khớp ở gốc bàn tay: chỗ nó với tới thoải mái là một vòng cung, không phải một bảng
  hai hàng. Ba skill sát nhau trên cung trong là *cố ý* (ngón đảo giữa ba nút kề nhanh hơn nhiều
  so với ba nút rời rạc); lướt né tách lên cung ngoài để không bấm lẫn lúc đang cuống. Cung này là
  chỗ đứng của những nút **chưa ai chạm vào**: kéo một nút đi là nó rời cung (xem `tcfg.b[n]` dưới
  đây), bốn nút còn lại không nhích một px.
- **Ngắm.** `aimWorld()` rẽ sang `touchAim()`: con còn sống gần nhất trong `AIM_R = 170`, rồi
  hướng joystick, rồi hướng đang nhìn. Chặn bán kính là bắt buộc — `cast()` chỉ kẹp theo mép sân
  chứ không kẹp tầm, nên ngắm con quái ở cuối map là cho nổ một chiêu ngoài màn hình. Khoảng cách
  đo với `dy / 0.75` đúng như mọi phép đo tầm khác, nên "gần nhất" ở đây và "trúng" ở `hitCone` là
  cùng một hình học.
- **Giữ để ngắm** (`holdStart`/`holdTrack`/`holdEnd`) cho ba skill có mục tiêu, **cho lướt né**, và
  cho **đánh thường của cung với khiên**. Chạm rồi nhả ngay là tung nhanh vào chỗ `touchAim()` chọn;
  giữ rồi kéo quá `AIM_DEAD = 12` px thì
  tự ngắm, kéo hết `AIM_DRAG` lần bề rộng nút là tới hết tầm. Ba con số tả *thứ đang ngắm* thay cho
  ba nhánh `if` rải trong hàm vẽ: `aimUI.r` (tầm), `aimUI.ky` (hệ số nén trục y), `aimUI.fix`
  ("luôn hết tầm", cho chiêu `dir` và cho lướt né — kéo dài thêm không có nghĩa gì khi cái chọn được
  chỉ là góc). Bốn chuyện ở đây không đổi được: `pointercancel` **huỷ** chứ không tung (mất chiêu vì
  có người gọi điện là mất một lần hồi chiêu mà người chơi không hề bấm); chiêu đang hồi thì không
  vào chế độ ngắm (ngắm xong mới biết bấm không được là mất đúng cái nhịp vừa dùng để ngắm — lướt né
  đếm hồi ở `world.dcd`, không trong `world.cds`); đánh thường là ngoại lệ của đúng hai điều đó, vì
  nó ngắm *trong lúc đang đánh* (gạch đầu dòng ngay dưới); và điểm
  ngắm tính lại **mỗi khung** từ chỗ ngón đang đặt (`aimWorld()` gọi `holdTrack`), vì người chơi vẫn
  đẩy joystick trong lúc ngắm nên một điểm chốt cứng lúc `pointermove` sẽ trôi lại phía sau người.
- **Đánh thường của cung và khiên ngắm được, và nó ngắm *trong lúc đang đánh* chứ không ngắm rồi mới
  đánh.** Cú chạm ra nhát đầu **ngay** (`atkHeld = true; holdStart(); fire(0)`), rồi ngón kéo đi vừa
  sửa **chính nhát đang chạy** (`reswing()`, gạch đầu dòng dưới) vừa lái *những nhát sau*, và nhả tay
  chỉ để **dừng** — `pointerup` gọi `holdEnd(false)`,
  ngược hẳn với ba skill nơi nhả tay *là* lệnh tung chiêu. Không có nhánh nào phải thêm cho phần lặp:
  `fire(0)` của `frame()` đi qua `aimWorld()` → `holdTrack`, mà `holdTrack` dưới ngưỡng `AIM_DEAD`
  trả về đúng `touchAim()` — nên một cú chạm không kéo giống nguyên văn bản trước.
  Đổi lại thành "nhả tay mới ra đòn" là cắm một nhịp chờ vào **nhịp nền** của cả trận: đánh thường
  bấm liên tục suốt cả phút, 0,1 giây chờ nhả nhân với mấy trăm nhát là một game khác. Bốn hệ quả:
  `holdStart` **không** xét `world.wcd` (giữ nút xuyên qua khoảng hồi 0,3 giây chính là cách nó chạy,
  chối ở đây là một tiếng "bấm không được" cho một cú bấm hợp lệ); viền `.aiming` bật ở `holdDrag()`
  lúc ngón đã kéo, không bật lúc chạm (cú chạm là một nhát đánh, và thứ phải thấy ở đó là nút lún
  xuống — `.tb:active`, mà `.aiming` đứng sau trong CSS nên sẽ đè mất); nút này **không** gắn
  `pointerleave` (con trỏ đã bị `setPointerCapture` bắt về nút, mà kéo ngón ra khỏi nút *là* thao tác
  ngắm — huỷ đòn ở đó là huỷ đúng lúc vừa ngắm xong); và `pointerup` chỉ tắt vòng ngắm khi lần giữ
  đang chạy đúng là của ngón đó (`hold` chỉ có một chỗ, nên chạm vào một skill giữa lúc còn giữ đánh
  thường là nhường lần giữ lại cho skill — đánh thường rơi về ngắm tự động và vẫn đánh tiếp).
  Chọn vũ khí theo **cơ chế**, không theo tên: `wpAim = weapon && !!(sk.shot || sk.lunge)`. Cung
  (`shot`) bắn ba mũi xuyên 210 px, khiên (`lunge`) lao hero 36 px vào chỗ nó nhắm — với hai cái đó
  "con gần nhất" là câu trả lời *sai*: một hàng quái xếp dọc chỉ ăn đủ ba mũi khi trục bắn nằm trên
  hàng, và một cú lao là *chỗ mình sẽ đứng*, nên lao vào con gần nhất trong lúc nó đứng giữa vùng nổ
  là đúng thứ người chơi đang cố thoát ra. Bốn vũ khí cận chiến kia đứng tại chỗ quét một cái nón
  1,05–2,25 rad, ở đó con gần nhất luôn đúng và một cử chỉ ngắm thêm chỉ là một cử chỉ thừa. Đọc
  `shot`/`lunge` nên cây cung thứ hai ngắm được ngay, không có bảng id nào để quên cập nhật.
  Hai con số của vòng: `ky = wp.squash = 0,72` — **không** `GSQ` — vì 0,72 là đúng hệ số `swing()`
  chia vào trục y để ra `e.ang`, nên hướng ngón kéo *bằng đúng* hướng đòn sẽ đi và dải sáng nằm đúng
  trên đường bay của mũi tên / đường lao của khiên (vẽ bằng `GSQ` là lệch góc, nặng nhất ở các hướng
  chéo — đúng chỗ phải ngắm); `r = wpAimR(wp)` là chỗ đòn thật tới (`shot.max`, hoặc `lunge.len +
  range` = 76 của khiên) **kẹp ở `AIM_MAX`**, vì một ellipse 210 × 151 không có điểm nào nằm trong
  khung 320×180 (phải `cos < 0,76` và `sin < 0,6` cùng lúc), tức là vẽ 210 thật là vẽ một vòng không
  bao giờ thấy được và đẩy cả ba mũi chỉ hướng ra ngoài màn. Kẹp không hứa sai gì: chế độ `dir` chỉ
  đọc *góc*, đúng lý do ba skill `dir` cũng dùng chung một `AIM_MAX`.
- **`reswing(w, tx, ty)`: ngón kéo sửa được *nhát đang chạy*, không chỉ nhát sau.** Đây là nửa còn
  lại của "ngắm trong lúc đang đánh", và không có nó thì cả cử chỉ ngắm gần như không ăn: nhát đầu
  của mỗi lần bấm luôn bay vào con quái gần nhất của `touchAim()`, mà một cú bấm–kéo–nhả ngắn hơn một
  nhịp hồi (cung 0,70 s) *chỉ có đúng nhát đó*. Người chơi đọc ra là "kéo ngắm không bằng con quái ở
  gần", và họ đọc đúng. Sửa được là vì hai vũ khí này **không giải xong ở khung bấm**: cung bật dây ở
  nhịp 8 tức 0,29 s sau cú bấm (`hits: [8]`, `fps: 28`) nên mũi tên còn chưa rời dây, và khiên còn
  đang lao (0,22 s) trước nhịp hẩy ở 0,25 s. `frame()` gọi nó mỗi khung khi
  `hold.on && hold.wp && hold.drag`, ngay trước dòng `fire(0)` của phần lặp. Bốn quyết định trong đó:
  chỉ khi ngón **đã kéo thật** (chưa kéo thì `aw` chính là ngắm tự động, ngắm lại mỗi khung theo nó là
  cho mũi tên bám theo con quái đang chạy — một cây cung tự dò, không ai bấm ra thứ đó); chỉ vũ khí có
  `shot`/`lunge` (bốn vũ khí cận chiến đứng tại chỗ quét một cái nón, cho quét lại góc giữa một chuỗi
  4 nhịp là cho cái nón đi vòng quanh hero); góc đo từ chỗ hero đang đứng **ở khung này** chứ không từ
  `e.ox/e.oy` như `swing()` (lúc bấm hai chỗ đó là một, nhưng khiên vừa lao 30 px và `holdTrack` cũng
  tính điểm ngắm lại từ chỗ mới — đo từ chỗ cũ là lệch đi đúng quãng vừa trượt; `e.ox/e.oy` giữ nguyên
  vì nó là chỗ *xuất phát*, vệt lao vẽ từ đó); và cú lao đã chạy thì bẻ **phần còn lại** với nguyên
  tốc, nên quãng đi vẫn đúng `len = 36` px, chỉ đường đi thành một nét gấp (harness: 19,1 px sang phải
  + 16,9 px lên bắc = 36,0). `h.inv <= 0` là để **không** bẻ một cú lướt né: `dash()` cho 0,30 s bất tử
  cho một cú trượt 0,155 s, nên `inv > 0` giữa lúc đang trượt nghĩa là cú trượt đó là của lướt né —
  và "không lái được" là cả điều khoản của lướt né.
- **Lướt né ngắm được, và tầm của nó là `DASH_LEN = 62` px *thật*.** Đây là chỗ duy nhất trong cả
  phần ngắm có một con số không phải phát minh của shell: `AIM_MAX = 150` là hạn do shell tự đặt vì
  `cast()` không kẹp tầm, còn 62 px thì `dash()` đi đúng bấy nhiêu, không hơn. Nên vòng của nó nhỏ
  hơn hẳn vòng của ba skill, và trục y nén **0,75** — tỉ lệ của phép đi lại — chứ không `GSQ = 0,5`
  của hình vẽ trên sàn: với ba skill vòng ngắm là "chỗ sẽ nổ", với lướt né nó là *đúng tập những chỗ
  chân hạ xuống được*. Một vòng hứa xa hơn chỗ thật, trên một chiêu mà cả công dụng là ra khỏi vùng
  nổ, là một cái bẫy. Điểm ngắm dựng ra là `(hx + ux·62, hy + uy·62·0,75)`, và `fire(DASH_SLOT, at)`
  chia lại cho `0,75` để đảo đúng phép nén đó, nên chân hạ xuống **đúng** tâm vòng vừa vẽ (harness
  trong browser: sai số 0,0000 px ở năm góc khác nhau).
- **Chạm mà không kéo thì không truyền điểm ngắm nào.** `hold.drag` bật khi ngón đi quá `AIM_DEAD`,
  và `holdEnd` gọi `fire(n, drag ? at : null)`. Với ba skill hai đường cho ra cùng một điểm nên
  không thấy gì; với lướt né đó là cả sự khác biệt: ngắm tự động của nó là **hướng joystick đang
  đẩy**, còn `aimUI` lúc chưa kéo đang trỏ vào con quái gần nhất — tức là né *vào* mặt nó. Kéo ra
  rồi kéo về trong ngưỡng cũng quay lại đúng cú chạm đó: đổi ý vẫn còn kịp. Đánh thường không đi
  qua đường này chút nào: nó đã đánh từ lúc chạm, nên nhả tay của nó là `holdEnd(false)`.
- **Vòng ngắm nằm ở `render.js`, không ở DOM.** `world.aimUI` là thứ shell ghi và `drawAimCue(w)`
  đọc; node vm không có nó nên hàm đó là lệnh không làm gì, không phải thêm nhánh nào cho harness.
  Nó vẽ bằng đúng những nét mà cảnh báo của quái đang dùng (ellipse nén `GSQ` trên sàn, mũi nhọn
  chỉ hướng, tâm sáng ở chỗ sẽ nổ) — người chơi đã học đọc thứ ngôn ngữ đó suốt cả trận, một bộ
  hình thứ hai cho riêng phần ngắm là bắt học lại từ đầu đúng lúc đang bị ba con vây. Điểm ngắm
  nằm trên *ellipse* bán trục `(a.r, a.r * a.ky)` chứ không trên vòng tròn: vẽ vòng tròn thật là
  hứa một vùng mà chiêu không nổ tới. Hai bán trục đó đọc từ `aimUI` chứ không viết cứng `AIM_MAX`
  với `GSQ`, vì đúng cùng hàm này vẽ cả vòng của skill (150 × 75) và vòng của lướt né (62 × 46,5 —
  đo bằng cách diff điểm ảnh hai khung đóng băng, ra 301,8 × 150,5 với 125,8 × 93,8 px cả vòng).
  Nó nằm trên hiệu ứng của chính người chơi nhưng **dưới** `w.tels`: thứ mình đang chủ động điều
  khiển không được che thứ đang sắp đánh mình.
- **Bảng xếp lại phím (`scene === 'touch'`, `body.tedit`) kéo *chính những cái nút thật*.** Không
  có bản thu nhỏ để xem trước, vì một khung xem trước là cơ hội để "chỗ mình thấy" và "chỗ mình
  bấm" lệch nhau, và cái lệch đó chỉ lộ ra khi đang đánh boss. `touchLayer` vẫn hiện trong scene
  này dù không chơi, các nút đổi sang viền nét đứt để nói "đang xếp chứ không đang bấm", và
  `editDown` ghi lại *độ lệch* giữa ngón với tâm nút nên không cái gì nhảy một đoạn lúc mới chạm.
- **Kéo được *từng nút một*, không phải cả cụm.** `tdrag.what` là `'stick'` hoặc **số ô** `0..4`,
  và `tcfg.b[n]` là chỗ đặt riêng của ô đó. Một cờ "đang kéo cụm" không tả nổi câu mà người chơi
  muốn nói: tay trái thì nút lướt né phải sang bên trái, ngón cái ngắn thì ba skill phải sát nhau
  hơn — dời cả cụm không nói được câu nào trong hai câu đó. `tbtn[]` do `buildTouch()` nạp cùng lúc
  với `slotFaces`, nên đổi vũ khí / skill giữa trận không xoá chỗ đặt: dựng lại nút xong là gọi
  luôn `actsPlace()`.
- **Vị trí lưu thành phân số viewport, không phải pixel**, ở `localStorage['sl.touch']` (`tcfg`):
  máy quay ngang, mở bàn phím, hay đổi hẳn máy thì `0,82 × chiều rộng` vẫn là chỗ cũ còn `640px`
  thì ra ngoài màn hình. `null` nghĩa là "chưa đặt": lúc đó `actsPlace()` gọi `removeProperty` trên
  `left/top/right/bottom/translate` của đúng nút đó và **CSS** đưa nó về nan quạt, chứ không có ai
  đi tính lại mặc định bằng JS — hai chỗ tính cùng một vị trí là hai chỗ để lệch nhau. Nút đã kéo
  thì nhận `left/top` px đo *từ chính cái neo 0×0 `#tacts`* cộng `translate: -50% -50%`, cùng quy
  ước "toạ độ là tâm" với `#tbase`. `resetTcfg()` gán lại từ `tcfgDef()` — một **factory**, không
  phải một hằng số dùng chung: `Object.assign` chỉ chép tham chiếu của mảng `b`, nên một hằng số
  sẽ bị lần kéo đầu tiên sau khi đặt lại ghi thẳng vào, và từ đó không còn mặc định nào để về.
- **Mỗi nút tự kẹp lấy mình, bằng nửa bề rộng của chính nó.** `actsPlace()` kẹp tâm trong
  `[m, vw - m]` với `m = offsetWidth / 2`, nên nút to (đánh thường, `1,32 --tu`) được chừa nhiều
  hơn nút nhỏ. Đây là chỗ `clamp(v, a, b)` của repo cắn: nó **trả về `a` khi `a > b`**, nên mỗi
  cận phải bọc thêm `Math.min`/`Math.max`, bằng không trên màn hẹp hơn một nút thì nút bị đẩy
  thẳng ra giữa sân.
- **Hai thanh cỡ là *hệ số nhân*, đặt sau phép kẹp của `layout()`.** `--tu` và `--js` vẫn kẹp theo
  cạnh ngắn của viewport trước (44–96 px và 96–210 px), rồi mới nhân `tcfg.as`/`tcfg.js` trong
  khoảng 0,7–1,6. Kẹp lần thứ hai *sau* khi nhân nghe an toàn hơn nhưng là phủ quyết lựa chọn của
  người chơi: ai chọn 160% trên máy lớn thì đúng là muốn nút lớn hơn cái mà công thức cho là vừa.
- **`body.tedit #tstick { pointer-events: none }` với `#tbase { pointer-events: auto }`.** Vùng
  nhận của joystick rộng gần nửa màn hình và trùm lên đúng chỗ hai nút "ĐẶT LẠI MẶC ĐỊNH" với
  "XONG" của bảng; để nguyên thì cú bấm ra khỏi bảng lại thành một cú kéo bệ, và không còn đường
  nào ra. Sự kiện của bệ vẫn **nổi lên** `#tstick` dù cha đang `pointer-events: none`, nên chỗ xử
  lý kéo không phải nhân thêm một bản.
- **Lúc sắp xếp, bảng phải thắng mọi cú chạm — và cái giá là `snapStage()`.** `#touch` ở `z 30` vẽ
  trên `#overlay` ở `z 10`, nên một nút kéo tới trùm lên "XONG" sẽ ăn hết cú chạm của nó, mà trên
  điện thoại không có phím ESC nào để ra. `body.tedit #overlay` vì thế lên `z 60` (và bỏ nền, bỏ
  `backdrop-filter`, `pointer-events: none` — chỉ `#pnTouch` nhận chạm, để cả năm nút vẫn kéo được
  và người chơi thấy đúng cái sàn thật ở dưới nút). Nhưng `z-index` đó *chỉ có tác dụng* khi
  `#stage` không phải stacking context, mà `snapStage()` đặt `transform` lên chính `#stage` — nên
  trong `body.tedit` nó bỏ cú đẩy, và `setScene()` gọi lại `snapStage()` ngay sau khi đổi class để
  cú đẩy quay về lúc thoát. Khung có thể lệch dưới 1 px CSS trong lúc đang kéo nút: đúng bằng nét
  mờ của cả bản trước khi có `snapStage()`, và đổi lấy việc không bao giờ tự khoá mình trong bảng.
  Kiểm bằng `document.elementFromPoint` ở tâm "XONG" sau khi kéo một nút phủ lên nó — phải ra
  `.mbtn`, không ra `.tb`.
- **Minimap.** Góc dưới phải là chỗ đặt ngón cái, nên `setMinimapTop(true)` dời nó lên góc trên
  phải. `MM` (hộp mà harness loại khỏi phép kiểm "mép màn hình phải là sàn") đi theo cùng hàm đó:
  một hằng số ở đây và một chỗ khác vẽ là hai nguồn sự thật cho một con số.
- **`pointerdown`, không phải `click`.** Trên cảm ứng `click` chỉ đến sau khi nhả tay, và một
  chiêu ra sau khi ngón đã rời màn hình là một chiêu ra sai nhịp — đúng thứ mà cả hệ thống cảnh
  báo trên sàn đang dạy người chơi đọc. Giữ nút đánh thường thì `atkHeld` cho `frame()` đánh tiếp
  mỗi lần `world.wcd` cạn (chỉ khi đã cạn: gọi `swing` lúc còn hồi là một tiếng "blocked" mỗi
  khung). Cặp `mousedown/mouseup` giả mà trình duyệt cảm ứng phát thêm bị chặn ở đầu handler,
  bằng không một cú chạm joystick sẽ vung kiếm thêm một nhát không ai gọi.
- **`setScene()` phải nhả joystick và huỷ lần ngắm đang treo.** Ẩn phần tử đang giữ pointer thì
  không bao giờ có `pointerup` nữa, tức là nhân vật chạy mãi một hướng sau khi mở menu — và một
  chiêu đang chờ nhả sẽ nổ vào lúc quay lại trận.
- **`window.screen`, không phải `screen`.** Trong `shell.js` tên `screen` đã là canvas của game,
  nên khoá hướng màn hình phải viết đủ `window.screen.orientation`.
- **Fullscreen và khoá hướng xin trong `setMob()`**, không phải lúc nạp trang: cả hai đòi một cử
  chỉ của người dùng. Cả hai đều có thể bị từ chối (iPhone không có Fullscreen API), và đó không
  phải lỗi — chế độ này vẫn chơi được, chỉ là còn thanh địa chỉ. Cầm dọc thì `#rotate` (một
  `@media (orientation: portrait)`) nói một câu thay vì vẽ một khung ngang cao bằng đốt ngón tay.

`touch-action` là thứ dễ làm hỏng nhất: `none` trên `body` sẽ giết luôn việc cuộn bảng hướng dẫn.
Nó nằm ở `#touch` với `body.mob #screen`, còn `body.mob .panel` được `pan-y` — bảng hướng dẫn là
chỗ **duy nhất** còn cuộn được trong chế độ này.

## Không bọc IIFE — ngược với `map/`

`map/README.md` bắt buộc bọc IIFE; các file ở đây **không được** bọc. Chúng là classic
script, nên `const`/`let`/`class` ở tầng ngoài cùng vào chung một global lexical scope và
`function` thành thuộc tính của global: chúng thấy nhau y như hồi còn nằm trong một
`<script>`. Bọc IIFE là cắt đứt đúng cái đó.

Ba hệ quả cần nhớ khi sửa hoặc tách thêm:

1. **Trùng tên ở tầng ngoài cùng giữa hai file là `SyntaxError` ngay lúc nạp.** Đó là tính
   năng: nó không thể trôi thành hai binding âm thầm ghi lên nhau.
2. **Tham chiếu tên của file sau thì được, chạy thì không.** `swing()` trong `weapon.js`
   gọi `SFX` khai báo ở `sfx.js` — không sao, vì lúc *gọi* thì đã nạp xong. Nhưng
   `arena.js` chạy `applyMap(MAPS[0])` ngay ở tầng ngoài cùng, nên mọi thứ lời gọi đó cần
   phải nằm ở file trước nó hoặc trong chính nó. Cùng lý do đó, `js/` phải nạp **sau**
   `map/`: `applyMap` cần registry đã có.
3. **`"use strict";` phải có ở mỗi file.** Directive chỉ có tác dụng trong file chứa nó, và
   cả engine được viết dưới strict mode.

## Vì sao không phải ES module

`type="module"` sẽ đổi scope (module scope thay vì global) nên phải viết export/import cho
hàng trăm ký hiệu; module lại đi qua CORS nên mở bằng `file://` là hỏng; và `map/*.js` cũng
đang là classic script tự đăng ký qua `globalThis.GAME_MAPS`. Đổi sang module là một lần
viết lại cả hai thư mục để được đúng thứ nó đang có: không build, không bundler, mở file là
chạy. Muốn tách nhỏ thêm thì thêm file rồi thêm một dòng `<script src>` vào đúng chỗ.

## Kiểm sau khi sửa

```bash
node tools/check-maps.js
```

```bash
node tools/check-weapons.js
```

```bash
node tools/check-boss.js
```

Tool đọc chính `index.html`, nối các `<script src>` theo đúng thứ tự trong trang rồi chạy
bằng `node:vm`, nên nó bắt luôn lỗi **thứ tự file** chứ không chỉ lỗi map: một file đặt sai
chỗ là `ReferenceError` ngay lúc nạp. Phần shell browser nằm sau
`if (typeof document !== 'undefined')` trong `shell.js` nên node bỏ qua sạch.

`check-weapons.js` kiểm sáu cơ chế làm nên bản sắc của sáu vũ khí — chuỗi nhịp của kiếm, đạn
bay xuyên của cung, gom bầy hút máu của lưỡi hái, cắt phép của găng, xử trảm và cắm chân của
đao, cú lao của khiên — cộng `reswing()`, cái ngón tay dùng để sửa nhát đang chạy. Nó so hai
trường hợp với nhau (có chuỗi / không chuỗi, máu đầy / máu
cạn, nhịp cuối / nhịp đầu, có `lunge` / bỏ `lunge`, ngắm lại trước / sau nhịp bật dây) chứ không
so lại con số trong bảng, nên
tinh chỉnh số liệu thì vẫn xanh, làm hỏng cơ chế thì đỏ.

`check-boss.js` cũng vậy, nhưng cho boss, và nó kiểm *lời hứa* chứ không kiểm bảng: vùng đã tô
là vùng gây damage và ngược lại (hỏi chính `heroIn`, hàm mà `stepTel` dùng để trừ máu), vùng đó
không lớn dần vào người, chiêu đang gồng mà bị đóng băng hay bị giết thì không bao giờ tới —
mỗi mục đó đi kèm một lần chạy đối chứng *phải* mất máu, vì "đóng băng nên không mất máu" đạt
quá dễ khi phép đo bị hỏng. Rồi: ba khung tung chiêu phải khác khung đi bộ **và khác nhau đủ
nhiều để mắt thấy** (đếm số ô đổi, ngưỡng một phần mười thân người — `!==` là chưa đủ), chiêu
tô quanh chính mình thì tầm với không được ngắn hơn tầm tung, cửa boss mở đúng mốc 40 mạng và
không bao giờ do bốc thăm, và cuối cùng ba mươi giây thật với một con boss trên sân: đủ 1800
khung không ném lỗi, dùng ≥ 3 chiêu khác nhau, không chiêu nào chiếm quá nửa số lần niệm.
Chạy hết khoảng 15 giây.

Một mục riêng lo art ảnh (`ANIM_IMG`), và cũng kiểm lời hứa: lưới rộng số **lẻ** để `flip` lật
quanh đúng cột neo, không hàng rỗng ở đáy (lơ lửng *chỉ ở vài khung* thì thành giật), `bh` cao
hơn mọi tư thế còn sống kể cả lúc nhấp lên, `bw` là bán kính bị đánh trúng lấy theo bộ đứng nên
không có ai trúng đòn ở chỗ không có gì, và hai câu về nhịp đọc telegraph: khung đang gồng **chưa
bao giờ** sáng bằng khung phát (đo độ sáng trung bình trên ô đặc, không đo số ô — khung to hơn
không được tính là sáng hơn), và khung phát thật sự có lên màn hình. Cả hai đo qua chính
`foeImgFrame` với foe giả quét hết `f.chg` rồi hết `f.rel`, vì lỗi đầu tiên ở chỗ này là con boss
loé sáng *trước* khi có gì xảy ra — tức là dạy người chơi né sai nhịp.

Một chỗ dễ vướng nếu sửa thêm mục vào tool: shape rải đốt, tia hay mắt lưới lấy hình từ
`e.seed`, nên **hai cast khác seed là hai bàn cờ khác nhau**. Mục nào tìm một điểm đo trên
cast này rồi đo trên cast khác thì phải gieo cùng một seed cho cả hai, không thì `frost_web`
sẽ "đạt" vì điểm đo rơi vào khe trống của mắt lưới.

## Xem hiệu ứng mà không cần browser

```bash
node tools/shot-skills.js whirl_slash blood_rend
```

```bash
node tools/shot-skills.js --all
```

Hiệu ứng là thứ duy nhất trong engine **không** kiểm được bằng con số: "trông đơn điệu" chỉ
đọc ra được khi xem sáu khung cạnh nhau. Tool nạp engine đúng như `check-maps.js`, dựng một
sân cố định (bầy quái đặt tay, `w.tels` xoá sạch — loé trắng ngẫu nhiên thì hai lần chụp
không so được với nhau), cast, rồi ghép các khung tại `p = 0.06 0.20 0.36 0.55 0.74 0.93`
thành một PNG trong `tools/out/`. Đặt `SHOT_TAG=before` / `SHOT_TAG=after` để hai ảnh không
ghi lên nhau khi so trước–sau. Khung nhìn từng chiêu khai ở bảng `VIEW` trong tool: chiêu
đánh quanh người thì crop chặt, chiêu rơi từ trời thì phải chừa phần trên màn hình.

```bash
node tools/shot-skills.js wp:cung
```

Tiền tố `wp:` chụp một nhát vũ khí thay vì một chiêu. Khác hai chỗ, vì vũ khí không có `p`
của riêng nó để bám vào: mốc chụp là *giây* trong cửa sổ đáng xem — cận chiến là đúng một
nhát vung, vũ khí bắn thì từ lúc bật dây tới lúc mũi tên hết tầm — và bia được đặt đúng trên
các làn của chính vũ khí đó (`shot.spread`), hai lớp sâu, HP bơm lên `1e6`. Bằng không thì
một nan quạt đọc ra là một vệt trắng: phải có gì cho từng làn trúng mới thấy được mũi giữa
mang đủ lực còn hai mũi biên thì nhạt hơn và đau ít hơn.

```bash
node tools/shot-boss.js meteor_rain frost_web
```

```bash
node tools/shot-boss.js pose:forgelord
```

```bash
node tools/shot-boss.js --all
```

Cùng ý đó cho boss, và nó trả lời đúng một câu mà `check-boss.js` không nói được: *nhìn có ra
một trận đánh không*. Một telegraph "đúng hình học" vẫn có thể là một vũng màu không đọc ra
hướng. Nên có hai chế độ. Tên một chiêu thì chụp trọn một cast tại `p = 0.14 0.36 0.54 0.68
0.82 0.95` — bốn mốc *sau* lúc phát, vì chỗ đáng xem của chiêu boss là lúc vùng tô biến thành
thứ đang chạy. Con boss được đặt đúng khoảng cách nó thật sự sẽ đứng khi tung chiêu đó (trong
`range`, ngoài `min`): chụp một chiêu từ chỗ nó không bao giờ được tung là chụp một trận đánh
không tồn tại. Khung nhìn tính từ chính tầm của chiêu chứ không chép tay, nên sửa `r` trong
bảng thì ảnh tự rộng theo.

`pose:<boss>` xếp năm hàng — đứng / đi / tung chiêu / trúng đòn / chết — vẽ thẳng từ lưới ký
tự và palette của chính con đó, không qua engine: ở đây câu hỏi là "các khung có khác nhau
bằng mắt không", và ánh sáng của sân chỉ làm khó việc so hai khung cạnh nhau. Chính hàng tung
chiêu đó đã bắt được ba lỗi vẽ mà không con số nào bắt được: cả ba con boss từng có khung "dồn"
bị hai lệnh `recol` liên tiếp làm phẳng thành một khối một màu. Con nào chưa có art ảnh thì rơi
về ba hàng đầu với `PAL` dùng chung.

## Sinh lại khung boss từ ảnh

```bash
node tools/gen-boss-frames.js
```

Ba con boss lấy ngoại hình từ `images/animations/boss/<1|2|3>/<idle|cast|hit|death>/*.png` — art
~1024×1536, 12 khung mỗi con, gần 50 MB. Không thể để trang nạp trực tiếp, và cũng không nên:
cả engine vẽ vào buffer 320×180 rồi hạ xuống 16 mức mỗi kênh, nên mọi thứ vượt quá cỡ đó đều bị
vứt ở bước cuối. Tool làm sẵn phần bị vứt — cắt theo bbox alpha từng khung, thu nhỏ bằng box
filter trên alpha đã premultiply, cắt alpha thành nhị phân, lượng hoá màu bằng median cut về một
palette riêng cho từng con — rồi ghi ra `js/boss-frames.js` (78 KB) đúng dạng lưới ký tự mà
`sprites.js` đã dùng. Nhờ vậy khung ảnh và khung vẽ tay đi qua **cùng** một `blit`, chỉ khác
bảng màu truyền vào (tham số thứ 8, thêm cho việc này; `blitRot` vốn đã nhận palette như thế).

Hai điều dễ làm sai:

- **Đừng sửa tay `js/boss-frames.js`** — lần sinh sau ghi đè sạch. Muốn đổi cỡ, số màu hay
  ngưỡng alpha thì đổi `BODY_H` / `PAL_N` / `A_CUT` trong tool.
- **`bh` không nằm trong file sinh ra.** `boss-img.js` còn cộng một nhịp nhấp 1 px cho bộ đi
  *sau* khi dữ liệu đã sinh, nên chỉ nó biết đỉnh đầu thật sự tới đâu. Bake sẵn ở tool từng cho
  ra một thanh máu cắt qua mũ trùm của con 1 đúng lúc nó đang đi — `check-boss.js` bắt được, và
  nguyên nhân là hai nguồn sự thật cho một con số.

Bốn bộ trong art không khớp một-một với trạng thái `world.js` đang theo dõi, nên chỗ nối là
`boss-img.js` chứ không phải logic game: `death ← f.dying`, `cast ← f.chg` rồi `f.rel`,
`hit ← f.flash`, `walk` thì art không có nên là bộ đứng cộng nhịp nhấp. Không thêm trường trạng
thái nào vào foe. Thứ tự ưu tiên death > cast > hit > walk/idle, và cast **trên** hit là có chủ
ý: boss đang tung chiêu mà bị đánh thì thứ người chơi cần đọc vẫn là chiêu đó.
