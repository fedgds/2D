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
| `gate-frames.js` | **sinh tự động** — lưới ký tự + palette của cánh cổng boss, dựng từ `images/gates/gate-1.png` |
| `scene.js` | sàn dựng sẵn, bóng tiếp đất, đèn riêng của hero, `setCam` |
| `arena.js` | đọc registry `map/`, `applyMap`, rải prop, hạt môi trường |
| `anim.js` | sinh mọi frame animation lúc nạp từ một pose authored; `heroSet` dựng lại được từ một pose *khác* (nhân vật mặc trang bị) |
| `boss-img.js` | `ANIM_IMG`/`foeImgFrame`: bốn bộ ảnh → khung vẽ được, và hộp `bh` |
| `weapon.js` | 9 vũ khí: sheet 16 khung (`ART`), `drawSwing`, `drawHeld`, `swing`, `reswing`, `swingRiders`, `lungeHero` |
| `sfx.js` | `SFX` — mọi tiếng đều tổng hợp bằng WebAudio lúc chạy |
| `gear.js` | 5 ô trang bị × 4 phẩm chất × 12 chỉ số: bảng dữ liệu, `rollGear`, `gearSum` |
| `doll.js` | nhân vật đang mặc trang bị, một lưới ký tự cho cả hai chỗ: `wearBase`/`wearPal`/`wearFrames` (thuần tính) → `wornFrame` cho màn chơi, `drawDoll` cho bảng trạng thái |
| `world.js` | hero, quái, damage, `newWorld`, `step`, các hàm trúng đòn, mana + `syncGear`, món rơi nằm trên sàn (`w.orbs`) |
| `render.js` | thứ tự vẽ một khung, thanh HP quái, thanh HP/mana của hero (`drawHeroBars`), quả sáng của món rơi (`ORB_C`/`orbY`), vòng ngắm cảm ứng (`drawAimCue`), minimap (`setMinimapTop` cho chế độ điện thoại) |
| `skills.js` | 16 skill (`SKILLS`) |
| `dash.js` | chiêu lướt né mặc định — không tính vào 3 slot |
| `foe-abil.js` | chiêu quái + vùng cảnh báo vẽ trên sàn |
| `boss.js` | 3 boss: grid vẽ tay (bản dự phòng, art ảnh thắng), `bossCast`, cửa `bossGate` |
| `boss-abil.js` | 12 chiêu boss + `BOSS_SHAPE` (vùng tô, và chính nó là vùng gây damage) |
| `gate.js` | cánh cổng boss + phòng boss: `roomApply` (thu `BOUND`/`CAMB`), `openBossGate`, `stepGate`, `enterRoom`/`exitRoom`, `drawGate`/`drawRoom` |
| `lab.js` | `globalThis.LAB`: cửa cho harness node, không cần DOM |
| `icons.js` | icon 32×32 vẽ bằng canvas cho hotbar và bảng chọn, cộng `drawBagIcon` cho nút `#btnBag` |
| `gpu.js` | `gpuMake`: tonemap + dither + phóng to bằng một fragment shader WebGL2, thay `resolve()` trên browser (`resolve()` vẫn là bản tham chiếu của harness) |
| `shell.js` | shell browser: layout, menu/hướng dẫn, input, phím cảm ứng, kéo thả trang bị, vòng lặp khung |

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
  (`shot`) bắn ba mũi xuyên 210 px, khiên (`lunge`) lao hero 52 px vào chỗ nó nhắm — với hai cái đó
  "con gần nhất" là câu trả lời *sai*: một hàng quái xếp dọc chỉ ăn đủ ba mũi khi trục bắn nằm trên
  hàng, và một cú lao là *chỗ mình sẽ đứng*, nên lao vào con gần nhất trong lúc nó đứng giữa vùng nổ
  là đúng thứ người chơi đang cố thoát ra. Bảy vũ khí cận chiến kia đứng tại chỗ quét một cái nón
  0,30–2,25 rad, ở đó con gần nhất luôn đúng và một cử chỉ ngắm thêm chỉ là một cử chỉ thừa — kể cả
  cái nón hẹp 0,30 của thương, vì nhắm vào con gần nhất *là* đặt đường thẳng ấy xuyên qua nó. Đọc
  `shot`/`lunge` nên cây cung thứ hai ngắm được ngay, không có bảng id nào để quên cập nhật.
  Hai con số của vòng: `ky = wp.squash = 0,72` — **không** `GSQ` — vì 0,72 là đúng hệ số `swing()`
  chia vào trục y để ra `e.ang`, nên hướng ngón kéo *bằng đúng* hướng đòn sẽ đi và dải sáng nằm đúng
  trên đường bay của mũi tên / đường lao của khiên (vẽ bằng `GSQ` là lệch góc, nặng nhất ở các hướng
  chéo — đúng chỗ phải ngắm); `r = wpAimR(wp)` là chỗ đòn thật tới (`shot.max`, hoặc `lunge.len +
  range` = 92 của khiên) **kẹp ở `AIM_MAX`**, vì một ellipse 210 × 151 không có điểm nào nằm trong
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
  `shot`/`lunge` (bảy vũ khí cận chiến đứng tại chỗ quét một cái nón, cho quét lại góc giữa một chuỗi
  4 nhịp là cho cái nón đi vòng quanh hero); góc đo từ chỗ hero đang đứng **ở khung này** chứ không từ
  `e.ox/e.oy` như `swing()` (lúc bấm hai chỗ đó là một, nhưng khiên vừa lao được nửa quãng 52 px và
  `holdTrack` cũng
  tính điểm ngắm lại từ chỗ mới — đo từ chỗ cũ là lệch đi đúng quãng vừa trượt; `e.ox/e.oy` giữ nguyên
  vì nó là chỗ *xuất phát*, vệt lao vẽ từ đó); và cú lao đã chạy thì bẻ **phần còn lại** với nguyên
  tốc, nên quãng đi vẫn đúng `len = 52` px, chỉ đường đi thành một nét gấp (harness: 27,6 px sang phải
  + 24,4 px lên bắc = 52,0). `h.inv <= 0` là để **không** bẻ một cú lướt né: `dash()` cho 0,30 s bất tử
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
- **Một cái nút cho cả chuột và ngón tay: `#btnBag`.** Đường vào bảng trang bị từng là **hai** nút —
  `#btnStat` chữ "▣ TRANG BỊ (I)" trên thanh tiêu đề cho desktop, `#tstat` chữ "▣ ĐỒ" trong `#touch`
  cho điện thoại — và cả hai đều sai theo cùng một cách: trên điện thoại thanh tiêu đề bị ẩn nên nút
  kia không tồn tại, còn trên desktop thì mắt người chơi đang ở giữa sân, không ở dòng chữ trên cùng.
  Giờ là **một** cái nút nằm *trong* `#stage`, vẽ `drawBagIcon` lên một canvas 32×32 (cùng tấm nền và
  cùng lối dither với icon skill/vũ khí, nhưng là khối da **nâu ấm** — không ô nào khác trong game màu
  nâu, nên mắt tìm thấy nó mà không cần đọc hình). Bốn quyết định trong đó: nó đứng **trước
  `#overlay`** trong DOM nên mọi bảng che nó lại, và `setScene` còn ẩn hẳn (`btnBag.hidden = !playing`)
  vì bảng tạm dừng đã có dòng "TRẠNG THÁI & TRANG BỊ (I)" ngay trong bảng; nó nghe `pointerdown` +
  `preventDefault` (xem gạch đầu dòng trên — và `preventDefault` chặn luôn cú `click` tổng hợp theo
  sau, bằng không là mở-rồi-đóng); nó vẫn có `keydown` cho Enter/Space, vì một `<button>` không mở
  được bằng Enter là một cái nút hỏng với người dùng bàn phím; và badge "MÓN MỚI" (`#btnBag i`, class
  `.has`) vẽ lại **chỉ khi con số đổi**, không phải mỗi khung. Chỗ đặt thì đổi theo chế độ: desktop
  là góc trên phải `#stage`, còn `body.mob` dời nó lên cạnh nút `☰ MENU` ở mép trên
  (`left: 50%; translateX(calc(-50% + 62px))`) — vì trong chế độ ấy góc trên phải là chỗ của minimap,
  và mép trên giữa là chỗ **xa cả hai vị trí đặt ngón cái**, tức là không bấm nhầm giữa lúc đánh.

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

```bash
node tools/check-gear.js
```

Tool đọc chính `index.html`, nối các `<script src>` theo đúng thứ tự trong trang rồi chạy
bằng `node:vm`, nên nó bắt luôn lỗi **thứ tự file** chứ không chỉ lỗi map: một file đặt sai
chỗ là `ReferenceError` ngay lúc nạp. Phần shell browser nằm sau
`if (typeof document !== 'undefined')` trong `shell.js` nên node bỏ qua sạch.

`check-weapons.js` kiểm chín cơ chế làm nên bản sắc của chín vũ khí — chuỗi nhịp của kiếm, đạn
bay xuyên của cung, gom bầy hút máu của lưỡi hái, cắt phép của găng, xử trảm và cắm chân của
đao, cú lao của khiên, một nhát chặt què cả đám của rìu, cái vành mũi giáo của thương, chồng vết
xé của vuốt — cộng `reswing()`, cái ngón tay dùng để sửa nhát đang chạy. Nó so hai
trường hợp với nhau (có chuỗi / không chuỗi, máu đầy / máu
cạn, nhịp cuối / nhịp đầu, có `lunge` / bỏ `lunge`, có `tip` / bỏ `tip`, có `rend` / bỏ `rend`,
ngắm lại trước / sau nhịp bật dây) chứ không
so lại con số trong bảng, nên
tinh chỉnh số liệu thì vẫn xanh, làm hỏng cơ chế thì đỏ.

Một chỗ trong đó không so hai trường hợp mà **so cả bảng**: mục "áp mặt vẫn kém mọi vũ khí cận
chiến" của cung. Mẫu dps cận chiến ở đó phải cộng cả phần `rend`, vì gần hết sát thương của vuốt
*nằm trong* chồng vết xé — đem riêng `dmg` trơ của nó ra so là nói sai về vuốt chứ không phải nói
đúng về cung. Nó lấy chồng vết của nhát **mở đầu** (chồng còn trống, mỗi nhịp mới cộng được một
vết), tức là chặn dưới thật, không phải con số lúc đã bám đủ năm vết.

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

`check-gear.js` kiểm mana, trang bị và hành trang. Mười hai chỉ số được kiểm **một lần mỗi
cái, ở chỗ nó thật sự ăn vào sim** (không phải ở bảng dữ liệu): `+ATK` chỉ cộng vào đòn vũ khí và
`+Magic ATK` chỉ cộng vào chiêu, và cả hai là **số phẳng** — hai lần gọi `hurt` với cùng một con
số, khác nhau đúng cờ `phys`, cộng một mục nữa chứng minh nó không phụ thuộc thang: cú 40 và cú
400 cùng nhận thêm đúng bấy nhiêu; `+Crit rate 100` làm mọi đòn chí mạng và `+Crit damage` nhân
lên trên đó; `+DEF 100`
cho `defMul` đúng 0,5; `+%Dodge 100` làm `hitHero` trả về 0; hai dòng hồi đo bằng cách chạy
đủ 60 khung rồi so lượng lên; `+Attack Speed 100%` rút `w.wcd` còn nửa; `+Move Speed 50%` đo
bằng khoảng cách đi được trong nửa giây. Nhưng mục quan trọng nhất là mục cuối:

> chạy hai world cùng seed 900 khung, một cái để nguyên, một cái mặc một món bốn dòng rồi
> tháo hết ra, và **hai bên phải cho đúng cùng một chuỗi số**.

Câu đó là điều kiện để ba harness kia còn xanh. `check-weapons.js` và `check-boss.js` chốt
cứng hàng chục con số damage và máu, nên mọi hệ số của trang bị phải là `1 + v/100` hoặc
`100/(100+v)` — đúng bằng 1 ở mức 0 — còn hai dòng cộng phẳng (`+ATK`, `+Magic ATK`) phải cộng
đúng 0 ở mức 0, và mọi phép bốc thăm của trang bị phải bị **chặn bởi
`> 0`** để dòng rng không bị đẩy đi một bước. `+HP Regen/5s` vì thế không có nền: nền khác 0
là mọi con số máu trong hai tool kia lệch đi.

Cùng lý do đó, ba tool đều đặt `w.vary = 0` **và `w.crit = 0`** ngay sau khi dựng world (xem
*Khoảng sát thương* dưới đây): một cú đánh nhân thêm ±15%, rồi lại có 15% cơ hội nhân tiếp 1,5
lần, thì không có con số nào chốt cứng được nữa. Bề rộng của khoảng dao động và bản thân tỷ lệ nền
đều có mục kiểm riêng trong `check-gear.js`, và các mục đó đo *tính chất* — 400 cú không ra cùng
một con số, có cú gần sàn, có cú gần trần, trung bình vẫn là con số trong bảng; 4000 cú của nhân
vật trần cho tỷ lệ chí mạng quanh 15% — chứ không chốt một con số cụ thể nào.

Một mục riêng lo món nằm trên sàn (`w.orbs`), và nó là mục duy nhất trong `check-gear.js` phải
**bước sim** để nói được câu của nó: món bật ra đúng chỗ con quái chứ không chỗ nhân vật, bay lên
rồi đáp về `z = 0` trong vòng hai giây và không bao giờ ra ngoài `BOUND`, vừa đáp thì **chưa** nhặt
được (nếu không thì cả chùm sáng chưa từng lên màn hình), đi tới thì tự vào túi mà không bấm gì
thêm, túi đầy thì món **nằm im nguyên chỗ đó** rồi vào ngay khi dọn được một chỗ, `ORB_MAX` chặn
sàn, hai world cùng seed cho đúng cùng một đường bay, và `stepOrb` không bốc **một con số nào** của
cả ba dòng rng (đo bằng cách bọc `w.rng`/`w.grng`/`w.crng` lại rồi đếm). Bốn màu tia sáng phải đúng
bằng `GEAR_RARITY[].col`, nhịp nhô lên hạ xuống phải đổi khi vẽ mà `o.y` trong sim thì không, và
ánh sáng phải **thật sự sáng**: hai world cùng seed bước cùng số khung, một cái xoá `orbs` đi, rồi
so số điểm sáng của hai khung — cùng seed nên phần trang trí y hệt và chênh lệch còn lại đúng là
sáu quả sáng. Một mục "vẽ được, không ném lỗi" thì bỏ qua đúng cái lỗi mà mắt cũng bỏ qua.

## Khoảng sát thương, và con số chí mạng

`hurt` trong `world.js` là **cửa duy nhất** mọi sát thương đi ra, nên cả ba việc dưới đây nằm
gọn trong nó, theo đúng thứ tự này:

1. cộng phẳng `+ATK` (cờ `phys`) hoặc `+Magic ATK`,
2. nhân khoảng dao động `w.rng.range(1 - w.vary, 1 + w.vary)` với `DMG_VARY = 0.15`,
3. **quay chí mạng đúng một lần** theo `w.crit + gs.crit`, rồi nhân `w.critd + gs.critd` nếu trúng.

Thứ tự ấy có ý: dao động nằm **sau** phần cộng của trang bị nên phần trang bị cũng dao động
cùng nhát đánh nó thuộc về, và nằm **trước** phần chí mạng nên một cú chí mạng đúng bằng một cú
thường được nhân lên — không phải một phép bốc thăm thứ hai. Bốc trên `w.rng` chứ không `w.crng`:
sát thương là sim, và một world gieo cùng seed vẫn phải chạy ra cùng một chuỗi.

### Một tỷ lệ chí mạng, không phải hai

Bước 3 là **lần quay duy nhất trong cả game**. Trước đây không phải thế, và lỗi nó sinh ra là một
lỗi người chơi thấy trước khi đọc code: *bảng trạng thái ghi 0% mà đánh thường vẫn nổ chí mạng*.
Có sáu chỗ tự nhận là chí mạng mà không hỏi tỷ lệ nào:

- `swingHit` trong `weapon.js` có một biến tên `crit` nhưng thật ra là **nhịp kết** của combo, và
  nhịp kết thì *luôn* đúng. Nó đã đổi tên thành `fin`, giữ nguyên
  bốn việc thật của nó (mở cửa sổ chuỗi, `wp.harvest`, `wp.exec`, `wp.cut`) và thôi nói gì về chí
  mạng. Đây là chỗ dễ mất nhất khi sửa: xoá biến đó đi là im lặng gãy bốn cơ chế vũ khí mà
  `check-weapons.js` đang chốt. Điều kiện của nó cũng đã đổi một lần, từ `last > 0 && i === last`
  thành `i === last`: rìu chỉ có **một** nhịp (`hits: [7]`), và với vế `last > 0` thì nhịp duy nhất
  ấy không phải nhịp kết — tức là một vũ khí một nhịp lặng lẽ mất sạch phần thưởng nhịp kết của
  mình. `check-weapons.js` chốt câu đó bằng một cây kiếm giả một nhịp mang `exec`, so với chính nó
  bỏ `exec` ra.
- `arrowHit` tính mũi chính trúng đúng tầm ngọt là chí mạng.
- bốn chiêu (`skills.js`) truyền `crit: true` thẳng vào `hitCircle`/`hurt`.

Cả sáu đã tắt. Tham số `crit` của `hurt` **vẫn còn** nhưng không call site nào trong game dùng:
nó là đường buộc chí mạng để harness đo riêng phần nhân sát thương mà không phải chờ xác suất.

Nhân vật có sẵn `CRIT_BASE = 15` (%) và `CRIT_BASE_D = 50` (%). Phải có cả hai: một tỷ lệ nền mà
không có mức sát thương nền thì cú chí mạng đầu tiên của người chơi chưa có trang bị chỉ đổi màu
con số chứ không đau hơn một điểm nào. Trang bị cộng **lên trên** nền chứ không thay nền, và
`shell.js` in ra đúng tổng đó (`world.crit + g.crit`) — nếu nó in riêng phần trang bị thì bảng lại
nói 0% trong khi cú đánh vẫn nổ, đúng cái chỗ người chơi đọc ra là bảng đang nói dối.

Quay trên `w.grng` (dòng của trang bị + rơi đồ), không `w.rng`: may mắn chí mạng không được xê
dịch một trận dựng lại từ seed của nó.

`w.vary`, `w.crit`, `w.critd` đều là **trường của trận**, không phải hằng số đọc trực tiếp, chỉ để
bốn harness đặt được về 0 — `check-weapons.js` và `check-boss.js` chốt cứng vài chục con số dmg,
nên 15% chí mạng để nguyên sẽ làm chúng đỏ khoảng một lần trong bảy. Trong game chúng không bao
giờ đổi. Bù lại, `check-gear.js` đo chính tỷ lệ nền ấy bằng 4000 cú đánh của một nhân vật trần và
đo riêng hai đường vũ khí / chiêu bằng cùng một seed để chắc chúng không lệch nhau.

Hệ quả của "cộng theo số" phải nói rõ, vì nó không tránh được: phần cộng ăn vào **mỗi nhịp
trúng**. Một chiêu ruộng đánh 4 nhịp nhận phần cộng bốn lần, một cú `judgment_beam` một nhịp
nhận đúng một lần. Vì vậy `GEAR_STATS` để `+ATK` ở thang 2–5 còn `+Magic ATK` ở thang 9–24: đòn
vũ khí một nhịp là 5–52 damage, còn một nhịp chiêu là 42–430, nên một thang chung sẽ hoặc không
đáng kể với chiêu hoặc nhân ba lần đòn vũ khí. Rìu là chỗ hệ quả ấy đọc ra rõ nhất: một nhịp mỗi
0,80 s nên nó ăn `+ATK` **một lần** trong lúc găng năm nhịp ăn năm lần.

Con số chí mạng vẽ bằng đường riêng (`drawCritNum` trong `render.js`) chứ không dùng `text3x5`:
`textScaled` trong `sprites.js` in mỗi ô của bộ chữ 3x5 thành một hình chữ nhật `sc × sc`, nên
cỡ chữ là một số thực và cú "nảy" `CRIT_POP` từ 2,84 xuống `CRIT_SC = 2.0` chạy trơn. Ba thứ nữa
làm nó nổi bật: một viền `CRIT_KEY` dày 1 px (lọc trùng bằng `Set`, bằng không mép chữ ghi hai
lần trên buffer cộng sáng và ra một vệt đậm), một vệt sáng `core` mang **màu của chiêu**, và màu
chữ thì cố định `CRIT_C` — nhờ vậy một cú chí mạng đọc ra là chí mạng bất kể chiêu nào gây ra nó.
Nó cũng bay lên nhanh hơn và sống lâu hơn (1,15s so với 0,8s).

Mọi con số trong `w.nums` lưu **tâm** (`cx`), không lưu mép trái: cỡ chữ đổi theo từng khung nên
mép trái phải suy ra lúc vẽ. Năm chỗ đẩy số vào (`hurt`, `healHero`, ba chỗ trong `foe-abil.js`)
đều đã đổi theo, và `check-gear.js` kiểm rằng không còn chỗ nào lưu mép trái.

## Rider của một nhát đánh — `swingRiders`

Chín vũ khí, mà `swingHit` chỉ có **một** đường gây sát thương: `hitCone`. Mọi thứ riêng của từng
vũ khí đi qua `swingRiders(w, wp, fin, o, step)`, hàm trả về `opt` mà `hitCone` nhận — `amp(f)` cộng
thêm vào con số của từng mục tiêu, `onHit(f)` làm phần còn lại. Không vũ khí nào có nhánh `if` riêng
trong vòng lặp nhịp, nên thêm vũ khí thứ mười là thêm một trường dữ liệu, không phải sửa vòng lặp.

| trường | vũ khí | rider |
| --- | --- | --- |
| `momentum` | kiếm | nhịp kết mở cửa sổ chuỗi: nhát sau nhanh hơn, mạnh hơn |
| `exec`, `plant`, `guard` | đao | nhịp kết đọc máu đã mất của mục tiêu |
| `shot` | cung | nhịp duy nhất là *bật dây*: mũi tên tự quyết sau |
| `harvest` | lưỡi hái | nhịp kết hồi máu theo số con trúng quá con thứ nhất |
| `cut` | găng | nhịp kết đóng băng con đang niệm 0,25 s |
| `lunge`, `guard` | khiên | mỗi nhịp lao hero 52 px tới chỗ vừa nhắm |
| `maul` | rìu | mỗi con trúng còn 0,34× tốc trong 1,15 s (`f.slow`) |
| `tip` | thương | phần **mũi** giáo đau hơn: ×1,00 → ×1,40 theo khoảng cách |
| `rend` | vuốt | mỗi nhịp để lại một vết xé trên con đó; nhịp sau cộng theo số vết |

Cú lao của khiên đã được kéo dài: `lunge.len` 36 → **52** px và `cd` 0,72 → **0,58** s, còn `dur`
giữ nguyên 0,22 s. Hai con số ấy đi cùng nhau và chỉ có nghĩa khi đi cùng nhau: 52 px trong 0,22 s
là 236 px/s, hơn bốn lần tốc đi bộ (56) nhưng vẫn non sáu phần mười cú lướt né (400), nên nó còn
đọc ra là một cú trườn tới chứ không phải một cú dịch chuyển; và 52 px mỗi 0,58 s nghĩa là bấm liên
tục thì hero đi được 90 px/s — **nhanh hơn đi bộ**. Đó là chỗ khiên đổi tay, từ vũ khí đứng chờ
thành vũ khí áp sát. `dur` phải giữ nguyên: nhịp đầu ở khung 7 của tấm 28 fps rơi vào giây 0,25,
tức chân vừa đứng lại thì cạnh khiên vừa tới, còn kéo dài quãng trượt là đẩy cú đánh ra sau lúc
chân còn đang đi.

Ba trường mới của ba vũ khí mới đều **không có mã mới**: `maul` ghi vào `f.slow`, cái trường mà
chiêu độc đã dùng từ trước; `tip` là một `amp` đọc `Math.hypot` — cùng phép đo mà `hitCone` vừa
dùng để biết con đó có trúng; `rend` thêm đúng hai trường vào foe, `f.rnd` (số vết, trần `rend.max`)
và `f.rndT` (đồng hồ, đặt lại về `rend.life` mỗi lần trúng lại). Cả chồng vết **hết cùng một lúc**
khi `rndT` cạn, không mờ từng vết một: một chồng năm vết rụng dần thành bốn, ba, hai là một thứ
người chơi không đọc được trên màn hình, còn "bám thì còn, rời thì mất" thì đọc được.

**Hai rider chạy-mọi-nhịp nhân vào bậc của nhịp** (`step`), ba rider của nhịp kết thì không:

```js
if (wp.tip)  r.amp = f => wp.dmg * sp * (wp.tip - 1) * c01(...);
if (wp.rend) r.amp = f => wp.dmg * sp * wp.rend.add * f.rnd;
```

`swingHit` đã nhân sát thương gốc của mỗi nhịp với một bậc chạy từ 1,0 lên 1,5 dọc chuỗi. Bảng chỉ
số hứa với người chơi "mũi ×1.40" và "xé +22% mỗi vết", tức là phần trăm **của cú đánh ấy** — không
nhân `step` vào thì nhịp bậc 1,5 chỉ được thưởng +26% thay vì +40%, và cái nhãn nói sai. `exec`,
`cut`, `maul` thì cố tình để trơ: chúng nổ đúng một lần ở một bậc cố định, nên nhân vào chỉ là
chỉnh lại một hằng số ở một chỗ khó đọc hơn.

Còn `f.rnd` được đọc **trước** khi nhịp đó cộng vết của mình, và đó là thứ tự của `hitCone` chứ
không phải một lựa chọn ở đây: nó gọi `hurt(..., amount + opt.amp(f), ...)` rồi mới gọi `opt.onHit(f)`.
Nhờ vậy nhịp đầu của một lần vung vào một con còn sạch đúng bằng con số trên bảng, và người chơi
thấy chồng vết lớn lên qua từng nhịp thay vì được trả trước.

## Hai nhát không phải nhát quét — rìu nện đất, thương đâm thẳng

Cả chín vũ khí đi qua cùng một đường: `drawSwing` dán tấm sheet với `rot = e.ang - wp.axis`, rồi
`swingHit` gọi `hitCone` với một cái nón mở từ chân hero. Với bảy cây quét thì đúng. Với hai cây
này thì **phép xoay ấy nói sai một câu**, và đó là toàn bộ nội dung của chỗ sửa này — không phải
một hiệu ứng mới.

`thuong-frames` vẽ mũi giáo chỉ sang **đông**. `axis: SPRITE_UP` (−π/2) là "cái *lên trời* của tấm
sheet trùng hướng nhắm", nên nó lệch cây thương đúng 90°: đâm sang phải thì ảnh chỉ lên trời. Sửa
bằng đúng một trường, `axis: 0`. `axis` tồn tại để nói tấm sheet vẽ theo hướng nào; sửa ở đây thì
không có mã nào phải sửa theo.

`riu-frames` thì không xoay được chút nào: nó vẽ một cú chặt **xuống**, bụi nổ ở đáy giữa tấm. Xoay
nó 0 rad ra đúng cú nện; xoay 90° ra một cú đập ngang — đúng cái người chơi thấy. Nên rìu không đi
qua `drawSwing` nữa: `drawSlam` dán sheet **không xoay** (`rot = 0`, `squash = 1`), chỉ **lật ngang**
theo hướng nhắm (`stampFrame` nhận thêm tham số `flip`, lật trong không gian nguồn nên mép điểm ảnh
vẫn cứng), và dán nó ở *điểm lưỡi rơi* chứ không ở chân hero.

Hình học của cú nện nằm gọn trong một trường, `slam: { dist: 26, r: 32 }`, và ba con số quanh nó
đều truy được về tấm ảnh: vệt bụi trong sheet chiếm 0,18–0,87 chiều cao với tâm ellipse ≈ 0,86, nên
`pivot: [0.52, 0.86]`; `size: 94` để nửa bề rộng bụi *vẽ ra* là (0,87 − 0,52) × 94 ≈ 33 px, khớp
`r = 32`. Vòng nổ ăn đúng chỗ nó hiện.

Tầm thì **suy ra**, không viết tay:

```js
if (wp.slam) wp.range = wp.slam.dist + wp.slam.r;      // rìu -> 58
wp.reaim = !!(wp.shot || wp.lunge || wp.thrust || wp.slam);
```

Ba chỗ đọc `range` — bảng chỉ số (`weaponStat`), vòng ngắm của `shell.js` (`wpAimR`), và `hitCone`
của mấy cây không có `slam` — nhờ vậy không thể nói ba con số khác nhau.

Vùng ăn cũng **không cần máy móc mới**: `hitCone` với tâm dịch `dist` px về phía nhắm và
`arc_ = Math.PI` là một hình tròn, vì nửa-góc được gập vào [0, π] nên phép thử góc luôn đúng. Diện
tích π·32² ≈ 3217 px² so với cái nón cũ (tầm 50, nửa góc 1,35) ≈ 3400 px², với xa 58 thay vì 50:
đổi **hình**, không đổi sức. Một hệ quả đi kèm và nó là chủ ý: `hitCone` lấy góc hẩy từ *tâm vùng*,
nên con đứng lọt giữa hero và điểm nện bị đẩy **về phía hero** — muốn dọn chỗ thì nện ra xa, chứ
không nện vào chân mình. `check-weapons.js` ghim điều khoản đó lại để khỏi ai "sửa" nó.

### Ai được kéo ngắm trên điện thoại — `wp.reaim`

Bản điện thoại nổ đòn ngay ở cú chạm, nên cử chỉ kéo ngắm chỉ có nghĩa với vũ khí **chưa chốt kết
quả ở khung bấm**. Bây giờ là bốn: cung bật dây ở 0,29 s, khiên còn đang lao 0,25 s, thương đâm ở
0,17 s, rìu nện ở 0,32 s — muộn nhất bảng. Năm cây còn lại đứng tại chỗ quét một cái nón 1,05–2,25
rad trong 3–5 nhịp, mà với một cái nón rộng thế thì "con gần nhất" của `touchAim()` luôn là câu trả
lời đúng, và một cử chỉ thêm vào chỉ là một cử chỉ thừa.

Cờ ấy chốt ở **một chỗ** (`wp.reaim`, vòng hậu kỳ dưới bảng vũ khí) và hai bên đọc đúng nó:
`reswing` để nhận nhát đang chạy, `shell.js` để quyết định nút ĐÁNH có kéo ngắm được không. Hai bên
giữ hai danh sách riêng là kiểu lỗi im lặng nhất có thể có ở đây — nút vẫn kéo được mà đòn không
đổi hướng, không có gì hỏng, chỉ có một cử chỉ không tác dụng — nên `check-weapons.js` kiểm cả cái
danh sách bốn tên ấy **và** kiểm bằng chữ rằng `js/shell.js` đọc `sk.reaim` chứ không tự dựng lại
điều kiện.

## Mana, trang bị, hành trang

Ba hệ thống, một quy tắc: **không mặc gì thì mọi con số y như trước khi có trang bị.**

`gear.js` chỉ có bảng và hàm thuần — nó không biết `world` là gì. Một món là object phẳng
`{ slot, rar, stats: [{ id, v }], seed }`, ảnh là `images/gear/<slot>/<rar>.png` (20 file, ô
chọn hình còn phẩm chất chọn màu), và `rollGear` *rút* chỉ số khỏi một pool nên một món không
bao giờ có hai dòng trùng nhau. Phẩm chất quyết định số dòng đúng như bảng: 1 / 2 / 3 / 4.

`world.js` là chỗ duy nhất biến một bộ trang bị thành con số của hero:

| chỗ | ăn vào |
| --- | --- |
| `syncGear` | `+HP`, `+Mana` → `maxhp`/`maxmp`, và **cộng luôn máu hiện tại** |
| `hurt` | `+ATK` (cờ `phys`), `+Magic ATK`, `+Crit rate`, `+Crit damage` |
| `defMul` → `hitHero` + vệt đứng trong vùng | `+DEF` |
| `hitHero` | `+%Dodge` |
| `step` | `+Move Speed`, `+HP Regen/5s`, `+Mana Regen/5s` |
| `weapon.js` (`w.wcd`) | `+Attack Speed` |

Ba dòng rng, không phải hai: `w.rng` (sim, gieo theo seed), `w.crng` (trang trí) và **`w.grng`
(rơi đồ + bốc chí mạng)**. Dòng thứ ba tồn tại vì một món rơi ra không được phép đẩy lệch một kết
quả đã gieo, mà số hạt bụi một khung sinh ra thì cũng không được phép quyết định một cú chí mạng.
Chí mạng nằm ở đây kể cả phần nền 15% của nhân vật trần, không riêng phần trang bị cộng thêm — một
lần quay thì một dòng.

Mana là cổng thật, nhưng chỉ ở `cast`: hết mana thì trả `false`, **không trừ gì và không đặt
hồi chiêu** — một chiêu bị từ chối rồi vẫn phải chờ hồi là mất lượt hai lần cho một lỗi. Đánh
thường và lướt né không tốn mana, vì cả hai là thứ bấm liên tục và một cú né bị từ chối là
chết vì một con số không hiện ở đâu cả.

Hai cái thanh vẽ **trong buffer điểm ảnh**, không phải DOM (`drawHeroBars`, hộp `HUD_BOX` xuất
ra cạnh `MM` để harness loại được khỏi phép kiểm mép màn hình; nó là *cả* hình chữ nhật được
tô, kể cả viền). Góc trên trái, vì minimap giữ góc dưới phải và giữ góc trên phải ở chế độ
điện thoại.

Mỗi thanh là **một hộp có khung riêng**: một đường viền đen bên ngoài, một vành vát (`hudFrame`)
sáng ở mép trên/trái và tối ở mép dưới/phải nên khung kim loại nổi lên, rồi cái máng lõm bên
trong. Bốn góc và cái dòng giữa hai hộp *không* được ghi, nên nền game lọt qua đó và góc hộp
trông tròn. Nhưng lòng hộp vẫn vẽ **đục**, cùng lý do minimap vẽ đục: buffer bên dưới là HDR
cộng sáng, nên một cái đuốc đứng sau một cái máng trong suốt sẽ xoá trắng đúng lúc đang đánh
nhau.

Phần đầy là một dải màu nướng sẵn lúc nạp (`bakeFill`): máu đỏ → cam, mana xanh dương → cyan,
mỗi dòng một sắc độ khác nhau nên dòng trên cùng là vệt bóng và dòng dưới cùng là bóng đổ của
vành vát. Dải màu thuộc về *cái máng*, không thuộc về phần đang đầy — nên một thanh máu gần cạn
tự nó đã đỏ sậm, không cần đổi màu để nói câu đó; chỗ máu thấp chỉ thêm một nhịp sáng nhẹ.

**Cả hai thanh đều mang con số của nó**, căn giữa cái máng. Trước đây mana không có số, lý do là
một cái thanh thấy được đầu mút đã đủ cảnh báo cho một cái giá — nhưng người chơi đang chọn giữa
hai chiêu là đang so con số mana với giá của chúng, và đọc cái đó ra từ độ dài một cái thanh là
làm toán trên một bức tranh. Hai con số dùng bộ chữ số **3x4 riêng của HUD** (`HUD_DIG`) chứ
không dùng font sát thương 3x5: năm dòng cộng viền quanh nó lấp kín một cái thanh bảy dòng, con
số thôi làm cái nhãn trên thanh mà thành ra chính cái thanh. Căn giữa nên hai con số nằm trên
cùng một trục và không xê dịch khi số chữ số đổi. `hudNum` viền đen đủ tám phía (nét trắng nằm
trên nền cam sáng thì một cái bóng đổ một phía không đủ) và vẽ theo toạ độ màn hình, nên không
cần `CAMX/CAMY`.

Mọi màu ở đây đi qua `asOutput` chứ không qua `hexc`: đây là giao diện, không phải ánh sáng, nên
màu viết ra là màu phải hiện lên. Chúng còn viết theo dạng hex lặp nibble (`#667788`) vì
`resolve` lượng tử hoá mỗi kênh về 16 mức (bước 17) — viết vậy thì màu đi qua vòng đó *đúng*
bằng chính nó, khung không bị dither thành một sắc khác. Riêng `HUD_WASH` (vệt sáng ở đầu mút và
nhịp máu thấp) là `[1,1,1]` chứ không phải `asOutput('#ffffff')`: cái sau là buffer 4.08, đúng
cho một nét chữ phải ra trắng tinh và gấp ba mươi lần cái cần cho một lớp phủ 13%.

Bảng trạng thái (`I`, hoặc nút ▣ ở thanh trên / ở mép trên khi chơi điện thoại) là DOM, bốn cột
đọc thẳng `world.equip` / `world.gs` / `world.bag`, cột đầu là hình nhân vật. Nó chỉ vẽ lại lúc
mở và lúc vừa mặc/tháo/bỏ,
nên không phải thứ chạy mỗi khung; chỉ cái chấm đếm món mới là cập nhật trong vòng lặp, và
cũng chỉ khi con số đổi.

### Kéo thả — và vì sao cú bấm vẫn còn nguyên

Kéo một món từ hành trang sang cột **TRANG BỊ** (hay sang thẳng hình nhân vật) là mặc, kéo món
đang mặc về lưới túi là tháo. Cả hai đầu vẫn là hai cái `<button>` với `onclick` của chúng: kéo thả
là *lối tắt*, không phải cái cửa duy nhất — bàn phím vẫn đi hết được bảng, và đường cũ (chọn ô →
đọc chỉ số → bấm **MẶC**) không mất một bước nào.

Bốn quyết định, mỗi cái sửa một chỗ dễ hỏng:

* **Pointer Events, không phải HTML5 drag-and-drop.** Cái sau không tồn tại trên màn cảm ứng, mà
  bảng này chính là chỗ người chơi điện thoại đổi đồ giữa hai đợt quái. `touch-action: none` chỉ đặt
  lên đúng những ô kéo được, vì `body.mob .panel` cuộn dọc và lấy cả cái bảng ra khỏi tay người chơi
  để đổi lấy một cú kéo là đổi hỏng.
* **Ngưỡng 6 px (`GDRAG_SLOP`).** Một cú nhấn chỉ *thành* cú kéo sau khi ngón đã đi đủ xa, nên
  không có cú bấm nào bị hiểu thành cú kéo — và `preventDefault()` cũng chỉ gọi *sau* ngưỡng, để một
  cú vuốt chưa quyết định vẫn cuộn được cái bảng.
* **Chỗ nhận là một *vùng*, không phải một hình chữ nhật.** Một món chỉ vào được một ô, nên bắt
  người chơi nhắm trúng một ô cao 30 px là bắt họ trả tiền cho một thông tin mà máy đã biết chắc từ
  đầu. Ô sẽ nhận sáng lên ngay lúc món được nhấc lên (nét đứt), và đặc lại khi ngón thật sự ở trên
  (`.drop.over`); đỏ (`.nodrop`) là túi đầy — tháo ra không có chỗ về, và điều đó phải thấy được
  *trước* khi thả chứ không phải nghe một tiếng "không được" sau khi thả.
* **Ăn đúng một cú `click`.** Nhả ngón ngay trên cái ô vừa nhấc lên thì trình duyệt còn bắn một cú
  `click` nữa, và với ô trang bị cú click đó *chính là* "tháo ra" — tức là huỷ một cú kéo lại thành
  tháo mất món. `eatClick()` chặn đúng một cú, chỉ đặt bẫy khi cú đó thật sự sắp tới, và tự tháo bẫy
  sau 300 ms để không ăn oan cú bấm hợp lệ tiếp theo.

Cái bóng bay theo ngón treo ở `<body>`, không ở trong panel: `.panel` đang bị
`transform: scale(--pk)`, mà `position: fixed` bên trong một transform tính theo *cái transform đó*
chứ không theo viewport — toạ độ con trỏ sẽ lệch đúng bằng hệ số phóng. Nó tự nhân `--pk` vào mình
để vẫn bằng cỡ cái ô nó vừa rời khỏi. Và vì nó có `pointer-events: none`, `elementFromPoint` trả về
thứ nằm *dưới* nó — đó là cả lý do phép thử chỗ thả đọc được bằng một dòng thay vì tự so từng hình
chữ nhật.

Lúc nhấc món lên, chỉ `#stDet` dựng lại (để cột chỉ số nói về đúng món đang bay): gọi `paintBag()`
ở đó là xoá mất chính cái nút đang giữ cú kéo, nên trạng thái "đang chọn" đổi bằng class. Và
`setScene` gọi `gdragOff()` cùng chỗ với `editUp()` — thoát bảng bằng ESC giữa lúc đang kéo thì cái
bóng phải đi theo cái bảng.

Trong trận có phím `L` để rơi ngay một món theo bảng phẩm chất của boss — cùng lý do như `B`
gọi boss: tỉ lệ rơi là 15% mỗi mạng, nên nhìn bốn màu khung và bốn số dòng bằng cách đi hạ quái
là hàng chục mạng cho một món, mà thứ cần nhìn ở đó là cái bảng chứ không phải cái tỉ lệ. Nó rơi
cách nhân vật 30 px về phía đang nhìn, không rơi ngay dưới chân: rơi dưới chân thì món vào túi
trước khi chùm sáng vẽ xong, tức là cái phím đó kiểm được mọi thứ *trừ* thứ nó cần kiểm.

### Ảnh trang bị là 128 px, và cỡ đó suy ra từ CSS

Hai mươi tấm trong `images/gear/` được xuất ở 1254×1254 (17 MB cả bộ). Chỗ to nhất chúng lên
màn hình là **37 px CSS** (`.gbag .gc img`, ở bề ngang panel lớn nhất 880 px) và **30 px**
(`.gitem img`, đóng đinh trong `index.html`) — và không bao giờ hơn, vì `.panel` bị
`transform: scale(var(--pk))` với `pk = clamp(h / 470, 0.6, 1) ≤ 1`: cửa sổ rộng hơn chỉ làm
panel *thôi co lại*. Nhân cho màn dày nhất còn gặp (DPR 3) là 111 điểm ảnh vật lý, nên **128**
là cỡ vừa đủ dư mà không bao giờ phải phóng to.

Chênh lệch đó không phải chuyện tiết kiệm băng thông, mà là **lý do duy nhất khiến ô trang bị
thi thoảng hiện ra rỗng** trong khi khung skill thì không bao giờ: khung skill (320×320, ~28 KB)
được `ART.preload()` nạp sẵn ở màn chọn vũ khí rồi nướng vào RAM, còn ảnh trang bị chỉ được gán
`src` đúng lúc `paintStat()` chạy — và một tấm 1254×1254 phải tải 1,5 MB rồi giải nén ~6 MB
trước khi có một điểm ảnh nào để vẽ. `itemImg` không có bản dự phòng nào để vẽ trong lúc chờ,
khác `drawSwing`/`drawSlam` (thiếu art thì vẫn còn vệt sáng thủ tục).

`node tools/shrink-gear.js` hạ cả hai mươi tấm xuống 128 px, ghi thẳng lên chỗ cũ: 17 MB → 345 KB
(2%), tên file không đổi nên `gearIcon()` và `itemImg()` không phải sửa một dòng nào. `SIZE=256`
nếu sau này có chỗ hiện to hơn; chạy lại lần nữa thì nó bỏ qua những tấm đã đủ nhỏ. Phép thu là
lọc hộp theo diện tích trên alpha đã nhân trước — 1254/128 không phải số nguyên, và trộn RGB thô
thì màu nằm dưới vùng trong suốt loang ra thành một vành bẩn chỉ thấy được trên nền tối. Bản gốc
vẫn nằm trong git.

## Món rơi ra nằm trên sàn — `w.orbs`

Món không vào thẳng túi. Nó **bật ra khỏi xác con quái**, bay một đường vòng, nảy một lần, nằm
sáng trên sàn, và tự bay vào túi khi nhân vật đi tới gần. Ba lý do, không lý do nào là "cho đẹp":

* một món vào túi trong im lặng là một món người chơi không biết mình vừa được. Badge "MÓN MỚI"
  nói *có*, nhưng không nói *lúc nào* và *từ con nào*;
* màu phẩm chất (xanh lá / xanh dương / tím / cam) là thứ đọc được từ xa nhất trong cả hệ trang
  bị, mà từ trước tới giờ nó chỉ sống trong bảng trang bị — tức là ở chỗ trận đấu đã dừng. Cho nó
  bật ra khỏi xác là chỗ **duy nhất** màu ấy xuất hiện trong lúc đang đánh;
* một món nằm trên sàn là một lý do để bước tới chỗ đó, tức là một quyết định nhỏ giữa hai đợt
  quái — ở một game mà từ trước tới giờ việc duy nhất là đứng đúng chỗ.

Nó **không** nằm trong `w.fxs`. `fxs` là hiệu ứng của chiêu: chết theo `dur` của chính nó và không
mang gì cả. Món rơi thì *mang một món thật*, sống tới khi có người nhặt, và là thứ `step` đọc —
nên nó là một danh sách riêng, `w.orbs`, bước trong `step` như quái và như số bay.

| hằng số | trị | vì sao |
| --- | --- | --- |
| `ORB_MAX` | 32 | trần số món nằm trên sàn cùng lúc, đúng lối của `BAG_MAX`. Đây là cái chặn thật của `dropLoot` |
| `ORB_MAG` | 34 | trong bán kính này thì món tự bay về phía nhân vật |
| `ORB_TAKE` | 9 | và trong bán kính này thì vào túi |
| `ORB_WAIT` | 0,22 s | đã nằm xuống bấy nhiêu lâu mới cho hút |
| `ORB_GRAV` | 260 px/s² | trọng lực của đường bay |

Ba hàm: `spawnOrb` (bật ra), `stepOrb` (bay, đáp, bị hút, vào túi), `takeOrb` (vào túi + nháy sáng).

**`z` tách khỏi `y`.** `y` là *chỗ đứng* — cái mà bóng và thứ tự vẽ đọc — còn `z` là độ cao trên
sàn. Nếu độ cao cộng thẳng vào `y` thì một món bay lên sẽ trôi ra *sau* con quái nó vừa rời khỏi
rồi lại trôi ra trước lúc rơi xuống, và mỗi món rơi là một lần thứ tự vẽ nhảy.

**Nhịp nhô lên hạ xuống của món đã nằm im sống chỉ trong render** (`orbY`), không trong sim. Cùng
một lý do như trên, và một lý do nữa: một nhịp trang trí nằm trong sim là một nhịp harness phải
pin số.

**Bán kính hút rộng gấp gần bốn bán kính nhặt**, và `pull` lên dần trong khoảng một phần ba giây
chứ không bật 0→1. Người chơi đang nhìn con quái tiếp theo, không nhìn xuống chân, nên "đi *gần*"
phải là đủ; còn cái ramp là để món không giật một cái vào người ở đúng khung vừa vào tầm.

**Túi đầy không còn chặn `dropLoot`.** Trước kia nó chặn — một món không vào được túi thì không
còn chỗ nào để đi. Giờ nó có sàn để nằm, nên nó cứ rơi ra và **chờ**: người chơi thấy nó sáng ở
đó, thấy dòng `<< TÚI ĐẦY, KHÔNG NHẶT ĐƯỢC >>` trên HUD gỡ lỗi, và đi dọn túi. Dọn xong thì đúng
món đang chờ ấy vào ngay. Đường còn lại là lặng lẽ xoá một món Huyền Thoại của người chơi.

`newGear` (badge "MÓN MỚI") vì thế **nhảy lúc nhặt, không lúc rơi**, còn `w.loot` vẫn đếm số lần
rơi — từ khi món nằm ngoài túi thì hai con số ấy là hai con số khác nhau.

Mọi phép bốc của một món — góc bật, lực đẩy, hạt lấp lánh riêng của nó — đều trên **`w.grng`**,
cùng dòng đã bốc ra chính món ấy. Nên hai trận cùng seed rơi cùng những món ở cùng những chỗ, mà
số hạt bụi một khung sinh ra vẫn không đổi được đường bay nào. `stepOrb` thì **không bốc gì cả**:
đó là câu duy nhất khiến "có rơi đồ" không đổi được một con số sát thương nào.

Render có bốn lớp, `ORB_C[rar]` cho màu (`c` = màu phẩm chất, `h` = bậc sáng nhất của cùng ramp
giáp — nên vệt sáng bay ra là *đúng* cái màu của miếng giáp sắp mặc vào): chùm tia + ngôi sao ở
chỗ bật ra trong 0,42 s đầu, vệt đuôi lúc còn bay, vũng sáng + vòng dưới sàn lúc đã nằm, rồi quả
sáng với ba hạt trôi lên. Cú nháy lúc nhặt là `w.got`/`w.gotR` — **một trường, không phải một danh
sách**: nhặt hai món trong một phần tư giây thì cú nháy thứ hai chỉ nên bắt đầu lại, không xếp hàng.

### Bốn phẩm chất không sáng bằng nhau

Bốn màu nói *món này thuộc bậc nào*, nhưng chỉ khi người chơi đã dừng lại nhìn. Thứ phải làm cho
người chơi dừng lại là **lượng ánh sáng**, không phải sắc màu — thị giác ngoại vi đọc được độ sáng
và chuyển động, chứ không đọc được "tím khác xanh". Nên hai bậc trên không chỉ khác màu; chúng
được nhiều hơn ở bốn chỗ cùng lúc:

| | Thường | Hiếm | Sử Thi | Huyền Thoại |
| --- | --- | --- | --- | --- |
| `ORB_P` (nhân cỡ cho mọi lớp) | 0,94 | 1,10 | 1,42 | 1,72 |
| vòng ngoài dưới sàn | — | — | có | có, rộng hơn |
| cột sáng dựng lên | — | — | có | có, sáng gấp 1,35 |
| số cánh tia loé / số hạt trôi lên | 4 / 3 | 4 / 4 | 6 / 5 | 6 / 6 |
| nhịp loé (`2,3 + k·0,26`) | 2,30 | 2,56 | 2,82 | 3,08 |

`ORB_P` là **một bảng, không phải bốn nhánh `if`**: mọi lớp trong `drawOrbFloor`/`drawOrb` nhân cỡ
với nó, nên đổi một con số ở đó là đổi cả quả sáng, và không có lớp nào bị bỏ sót lại ở cỡ cũ.

**Cột sáng** (`C.k >= 2`) là cái duy nhất vươn ra khỏi tầm mắt hướng xuống sàn: nó cao hơn thân
quái, nên một món cam nằm sau đàn quái vẫn tự chỉ chỗ nó. Mờ dần ở đầu trên để nó là một vệt, không
phải một cây cột.

Chênh lệch này **đo được**, và `tools/check-gear.js` chốt nó bằng cách dựng hai thế giới cùng seed
— một có món, một không — rồi trừ hai khung cho nhau qua 24 pha thời gian (một khung đơn lẻ có thể
bắt đúng lúc một bậc đang ở đáy nhịp loé của nó):

| | điểm sáng | tổng năng lượng | vươn cao hơn Thường |
| --- | --- | --- | --- |
| Thường | 36 | 3 875 | 0 px |
| Hiếm | 64 | 6 478 | 1 px |
| Sử Thi | 156 | 15 158 | 9 px |
| Huyền Thoại | 205 | 18 709 | 15 px |

Mốc trong harness là **tỷ lệ**, không phải dấu lớn hơn: Sử Thi rộng hơn Hiếm ít nhất 1,25 lần và
sáng hơn Thường ít nhất 1,6 lần; Huyền Thoại rộng hơn Sử Thi 1,1 lần và sáng hơn Thường 2,2 lần.
"Rõ hơn" mà chỉ hơn một điểm sáng thì trên màn hình là không hơn gì.

Xem bằng mắt: `node tools/shot-gate.js orbs` → `tools/out/orbs.png`, bốn phẩm chất cạnh nhau, cùng
seed, cùng chỗ, cùng một pha loé chốt cứng — nên mọi chênh lệch nhìn thấy được trong tấm đó là
chênh lệch cố ý.

Món trên sàn cũng có một điểm màu phẩm chất **nhấp nháy trên minimap**, vì một món rơi lúc đang
chạy — hoặc rơi lúc túi đầy — là một món bị bỏ lại, và không có cái điểm đó thì cách duy nhất tìm
lại nó là đi rà cả sân. Nhấp nháy chứ không sáng đều: nó là thứ tạm, không phải một cái mốc như
`LANDMARKS`.

Hai giọng SFX mới, khác nhau ở **chiều**: `SFX.loot` là một chuỗi nốt đi *xuống* (món rời khỏi con
quái và rơi), `SFX.pick` là một chuỗi đi *lên* rồi đọng lại một nốt (món vào túi). Phẩm chất chỉ
thêm nốt, không đổi cao độ gốc — nên "món tốt" nghe ra là *dài hơn*, và bốn phẩm chất không thành
bốn âm thanh khác nhau phải học.

## Hình nhân vật — `doll.js`

Một bộ hình, hai chỗ dùng. Cột NGOẠI HÌNH của bảng trạng thái là **cùng một sprite `HERO`** mà
trận đấu đang vẽ, cộng một lớp phủ cho mỗi ô đang mặc; bảng in nó ra một `<canvas>` phóng to bằng
`fillRect` từng ô (không `drawImage`, nên không có phép nội suy nào chen vào giữa), còn **màn chơi
lấy đúng cái lưới ký tự ấy**, cho `anim.js` bóp thành cả bộ khung đi/đứng/đánh rồi vẽ ra buffer.
Nhờ vậy "mặc vào rồi ra màn chơi vẫn thấy đang mặc" không phải một bản vẽ thứ hai đi lệch dần khỏi
cái trong bảng: nó *là* cái trong bảng. `check-gear.js` chốt câu đó bằng một mục đo
`wearFrames(equip).idle[0].g === wearBase(equip)` — hai bên không thể trôi khỏi nhau.

Không có art mới cho việc này. Mỗi ô góp một *hình dạng* viết bằng lưới ký tự trong `DOLL_ART`,
đúng như `sprites.js` viết `HERO`, và phẩm chất chỉ đổi *màu* — cùng cái luật mà `gear.js` đã
dùng cho hai mươi file PNG: **ô chọn hình, phẩm chất chọn màu**. Năm màu của một món suy ra từ
đúng hai màu mà `GEAR_RARITY` đã có (`dollRamp`), nên miếng giáp trên hình và cái khung quanh ảnh
món đó là *cùng một màu*, và thêm một phẩm chất thứ năm không cần vẽ thêm gì.

Đường đi của dữ liệu, năm hàm, mỗi hàm một việc:

| | |
|---|---|
| `wearBase(equip)` | lưới **13×16 ký tự**: `HERO` dán vào `(+1, +2)`, rồi từng ô dán lên theo `DOLL_ORDER`, mỗi ô đổi `'0'..'4'` sang năm ký tự riêng của nó |
| `wearPal(equip)` | bảng màu cho lưới trên — `Object.create(PAL)` rồi thêm hai lăm ký tự trang bị lên **trên** |
| `wearSig(equip)` | chữ ký "ô nào, phẩm chất nào"; rỗng nghĩa là không mặc gì |
| `wearFrames(equip)` | cả bộ khung, dựng bằng `heroSet` một lần cho mỗi chữ ký |
| `wornFrame(w, h)` | khung mà `render.js` vẽ, kèm `dx`/`dy`/`pal` |

Những lựa chọn đáng ghi lại:

- **Lưới ký tự, không phải lưới màu.** Bản trước trả về một mảng màu và in ra được, nhưng không
  *bóp* được: `anim.js` làm việc trên ký tự. Cái giá của lưới ký tự là năm ô mang năm phẩm chất
  khác nhau cùng lúc thì `'1'` của mũ và `'1'` của giày phải là hai ký tự khác nhau — nên
  `WEAR_CH` là **hai lăm ký tự số và dấu riêng của từng ô**, chọn số/dấu vì cả 26 chữ in hoa đã
  có chủ trong `PAL` (xem *Bảng màu*). Chúng không bao giờ vào `PAL` toàn cục; `wearPal` *kế thừa*
  `PAL` bằng prototype chứ không sao chép, nên một arena đổi tám ký tự vật liệu của nó lúc chạy
  thì thân người vẫn đổi màu theo, còn `blit` chỉ đọc `P[ch]` nên chuỗi prototype là đủ.
- **Năm bậc, không phải bốn**: `'0'` viền, `'1'` tối nhất, `'2'` thân, `'3'` sáng, `'4'` điểm nhấn.
  Bốn bậc chỉ đủ một cái viền và một mảng đặc, nên mọi miếng giáp đọc ra là một phiến; bậc thứ năm
  là chỗ để miếng vai có mép hắt sáng và mũi giày có chóp bóng — cùng lý do `boss.js` dùng ba bậc
  cho mỗi vật liệu.
- **`DOLL_TONE` lệch sáng theo chiều dọc** (mũ +0,12 … giày −0,24, chỉ ăn vào bậc 1..4, không
  chạm bậc viền). Mặc cả bộ cùng một phẩm chất thì năm món ra năm cái ramp giống hệt nhau và cả
  hình đọc thành **một khối một màu** — đúng cái "nhìn xấu quá". Một chút lệch sáng là cách rẻ nhất
  để mắt tách được đâu là mũ, đâu là thân, đâu là chân: nó chính là ánh sáng từ trên xuống.
  `dollRamp(rar)` không truyền ô vẫn cho ramp gốc của phẩm chất, nên câu "phẩm chất nào ra màu
  nào" kiểm được một mình, không lẫn với chuyện ô nào sáng hơn ô nào.
- **Bảng vẽ 13×16, `HERO` đặt lệch vào `(+1, +2)`.** Chừa chỗ cho chóp mũ ở trên và cho hai miếng
  vai / hai cái găng / hai chiếc giày thò ra ngoài thân — một bộ giáp không làm nhân vật to ra thì
  không đọc ra là giáp. 16 chứ không 17 để hai hàng giày rơi **đúng trong** khối chân của rig.
- **`DOLL_ORDER` không phải thứ tự của `GEAR_SLOTS`**: `pants → armor → gloves → boots → helmet`,
  vì giáp phủ lên quần ở hông còn găng phủ lên tay áo của giáp. Vẽ ngược lại thì cái găng biến
  mất dưới ống tay.

Hai lằn ranh trong `DOLL_ART` không được bước qua, cả hai đến từ rig trong `anim.js`: **cột 6** là
viền chung giữa hai chân và không bao giờ bị bóp sang bên, nên hàng nào của quần và giày cũng phải
để `'0'` ở đó (không thì hai chân dính thành một khối khi bước); và **hàng 12-15 là khối chân,
hàng 7-11 là khối thân** — một món vắt qua hai khối sẽ bị xé làm hai vào đúng khung có bóp.

Không mặc gì là một trường hợp riêng thật sự: `wornFrame` trả về thẳng khung của `ANIM.hero` với
`dx = 0` và `pal = null`, tức là nhân vật trần vẽ ra đúng từng điểm ảnh như trước khi có hệ trang
bị — không phải để nhanh hơn, mà là bản art của câu "không mặc gì thì mọi con số y như cũ". Có mặc
thì lưới rộng ra hai cột và cao thêm hai hàng ở trên, nên `wornFrame` kéo lại `(-1, -2)`: hitbox
không đổi khi mặc giáp, chỉ có hình là to ra.

Phần `anim.js` phải mở ra ba chỗ cho việc này (xem `heroSet(base, dx, dy, arm, out, reach)`):

- `base` + `dx`/`dy`: bộ khung dựng lại được từ **một dáng đứng khác**, không chỉ từ `HERO`.
- `arm`/`out`: hai ký tự vẽ bàn tay đang vung. Mặc găng thì bàn tay phải là màu găng, không phải
  màu áo — `wearFrames` truyền ký tự của găng, hoặc của giáp khi chỉ có giáp.
- `reach`: hai khung đánh đẩy cánh tay ra thêm một cột khi có trang bị. Với nhân vật trần cánh tay
  vươn tới cột 9-10, và cái cột ngoài silhouette ấy *là* cú đánh — nhưng hai miếng vai của giáp đã
  chiếm đúng chỗ đó, nên không đẩy ra thì cú vung chỉ tô lại miếng vai bằng màu khác và người chơi
  mặc giáp vào là mất luôn dấu hiệu duy nhất cho biết mình đang đánh. Hộp chân cũng nới rộng một
  cột mỗi bên: với `HERO` đó là phép không đổi gì (hai cột thêm vào toàn `'.'`, mà `slideBox` và
  `liftPart` bỏ qua ô trống), nhưng một chiếc giày nặng rộng hơn bàn chân, và cột ngoài cùng nằm
  ngoài hộp thì bàn chân bước đi mà miếng giày đứng lại.

Cả `wearBase`, `wearPal`, `dollRamp`, `wearFrames`, `wornFrame` đều là phần tính toán thuần và
không chạm canvas nào, nên `check-gear.js` kiểm được không cần DOM: không mặc gì thì ra đúng `HERO`
(và `wornFrame` khớp `heroFrame` từng ký tự), mặc từng ô thì đổi ≥ 5 ô và **không** đổi ô nào
ngoài dải hàng của ô đó, bốn phẩm chất ra bốn hình khác màu, mọi hàng của `DOLL_ART` đúng 13 ký tự
(thiếu một ký tự thì lệch cả nửa bộ giáp sang trái mà vẫn trông "gần đúng"), món nào có hàng ở
khối chân thì còn giữ viền cột 6, một cái găng thường vẫn thấy được dưới một bộ giáp Huyền Thoại,
hai lăm ký tự riêng không trùng gì trong `PAL` và mọi ký tự trong mọi khung đều tra ra màu, bốn
khung đi là bốn khối chân khác nhau, khung đánh **rộng hơn** dáng đứng ở cả bộ trần và bộ có giáp,
và đổi phẩm chất thì cache vỡ còn tháo hết ra thì về đúng lưới trần.

## Cánh cổng boss và phòng boss — `gate.js`

Đủ mốc kill thì **không** có boss nào hiện ra giữa sân nữa. Mở ra một **cánh cổng** cạnh người chơi;
đứng vào miệng cổng nửa giây thì vào **phòng boss**; đánh xong boss thì một cánh cổng thứ hai mở ra
ở chỗ nó nằm xuống, đưa về đúng chỗ đã bước vào.

Cái cũ — mốc kill gọi thẳng boss ra — sai ở một chỗ không sửa được bằng cách chỉnh số: nó xảy ra
*trong lúc* người chơi đang xử một đợt quái, nên trận boss bắt đầu ở một tình huống ngẫu nhiên,
và cái duy nhất người chơi làm được là chịu. Cổng thì để trận đấu bắt đầu **khi người chơi quyết
định**: dọn nốt đợt quái, nhặt đồ, rồi mới bước vào.

### "Vẫn là map này nhưng thu nhỏ lại" = thu hai cái hình chữ nhật

`WW`/`WH` là `const`, và cái sàn đã bake sẵn `WW*WH` ô tone trong `TID`. Đổi cỡ thế giới nghĩa là
bake lại 3,6 triệu ô mỗi lần ra vào cổng. Thay vào đó thu hai hình chữ nhật:

* **`BOUND`** (`world.js`) — hơn ba mươi chỗ kẹp vị trí đọc nó: bước đi, dash, cú lao của vũ khí,
  chùm tia, mọi skill, cú hút của boss, cả chỗ món rơi xuống. Thu nó lại là *một* phép gán, và tất
  cả những chỗ đó thu theo, không phải sửa chỗ nào;
* **`CAMB`** (`core.js`) — mọi phép kẹp camera đi qua `camClampX`/`camClampY`, nên thu nó lại là đủ
  để khung nhìn không bao giờ trôi ra ngoài phòng.

Thu khung đúng nghĩa hơn *và* rẻ hơn: sàn trong phòng là đúng miếng sàn người chơi vừa đứng, cùng
props, cùng thời tiết, cùng ánh sáng. Đúng cái map ấy, nhỏ lại.

`roomApply(w)` đồng bộ hai bảng ấy ở **đầu mỗi tick** (`stepGate`), không phải chỉ lúc ra vào cổng:
hai bảng là toàn cục, còn `w.room` là của từng trận, nên hai world sống cùng lúc — các harness trong
`tools/` tạo cả chục — sẽ kế thừa cái sân hẹp của nhau nếu chỉ gán một lần.

| hằng số | trị | vì sao |
| --- | --- | --- |
| `GATE_OPEN` | 0,72 s | cổng nở ra hết; trong lúc đó **chưa** cho vào |
| `GATE_HOLD` | 0,5 s | phải đứng trong miệng bấy nhiêu lâu |
| `GATE_RX`/`GATE_RY` | 15 / 8 | bàn chân phải nằm trong hình ê-líp này |
| `GATE_DIST` | 104 px | cổng mở cách người chơi bấy nhiêu: thấy được mà không đè lên |
| `ROOM_W`/`ROOM_H` | 640 / 420 | **rộng hơn khung nhìn** ở cả hai chiều |
| `ROOM_PAD` | 24 px | camera được nhìn quá tường bấy nhiêu |
| `ROOM_FADE` | 7 px game | bề dày dải chuyển tiếp ngoài tường |

`GATE_RX`/`GATE_RY` **đi theo cỡ art**, không phải hai con số tự do: bề rộng thật của cổng là
`BODY_W` trong `tools/gen-gate-frames.js` (62 px thế giới, cao 51 — xem *Sinh lại khung cổng từ
ảnh*), miệng cổng trong lưới rộng khoảng 11,6 px, và ê-líp đứng phải rộng hơn cái lỗ một chút vì
nó là **sai số cho đôi chân**, không phải một phép thử hình học. Phóng art to ra mà để nguyên hai
bán kính này là người chơi đứng đúng vào giữa cái lỗ mà không được tính vào.

`ROOM_W` phải lớn hơn `W`, và `W` lên tới 480 trên điện thoại (xem `FRAME_W`) — 640 là mức thấp
nhất còn dư. Phòng hẹp hơn khung nhìn thì hai đầu kẹp camera **đảo nhau** và camera nhảy loạn;
`roomApply` vẫn bắt trường hợp đó và cho camera đứng giữa, vì ai đó sẽ sửa hai hằng ấy.

`ROOM_PAD` là lý do phòng *có tường để nhìn*: kẹp camera đúng vào mép phòng thì mép phòng luôn nằm
ngoài khung, người chơi chỉ thấy mình dừng lại mà không thấy vì sao.

### Đứng vào rồi đứng yên, không phải một nút

Vào cổng bằng cách đứng vào miệng rồi đứng yên nửa giây. Hai lý do, và cả hai đều nặng hơn cái
tiện của một phím:

* bàn phím đã hết phím rảnh — `h i m space f t r c b x l g` đều có chủ (xem `shell.js`);
* bản cảm ứng **không có nút tương tác nào cả**.

Đứng-để-vào thì cùng một cử chỉ chạy được trên cả hai, và nó còn tự chống cái tình huống tệ nhất
của cơ chế này: lỡ chạy qua miệng cổng lúc đang tránh đòn mà bị hút vào phòng boss. Đồng hồ chạy
ngược **nhanh gấp 2,2 lần** lúc bước ra, nên nhấp nhô một bước không mất hết tiến độ nhưng bỏ đi
hẳn thì mất — và cái vành tiến độ vẽ ở *chân người chơi*, không ở giữa cổng: nó trả lời câu "tôi
đã đứng đủ chưa", và câu ấy nói về chỗ đôi chân đang ở.

### Ra vào phòng

`enterRoom` / `exitRoom` làm sáu việc, và năm trong số đó là dọn dẹp:

* **`sweepOrbs`** — đồ còn nằm trên sàn thì quét hết vào túi trước khi đổi sàn, vì phòng boss là
  một khoanh khác của map và món sẽ nằm ngoài tường. Túi đầy thì dừng và để lại, y hệt `stepOrb`:
  đường còn lại là lặng lẽ xoá một món Huyền Thoại của người chơi;
* **`w.ret`** giữ đúng chỗ đã đứng lúc bước vào. Trả về chỗ khác thì người chơi mất phương hướng
  trên một cái map rộng 8×8 khung — và cái minimap vừa đổi tỷ lệ hai lần trong ba giây;
* **`w.foes`/`w.tels` xoá sạch** cả hai chiều: quái đang đuổi theo ở ngoài sẽ nằm ngoài tường, và
  một vòng cảnh báo còn sót của một con quái không còn tồn tại là một cái bẫy không ai đặt;
* **`snapCam` + `setCam`** ngay trong cùng khung, không để camera trôi tới: một cú pan 900 px qua
  vùng hư không đọc ra là lỗi;
* **`w.spawnT`** — trong phòng thì `1e9` (không quái phụ nào chen vào trận boss), lúc ra thì **1,5
  giây** và năm con quái sinh ngay. Về một cái map trống rỗng thì cảm giác là trận đấu đã xoá mất
  sân chơi.

Nhân vật rơi xuống **nửa dưới** phòng, không rơi vào giữa: `spawnBoss` đặt boss cách nhân vật
khoảng một phần ba khung, và nếu nhân vật đứng giữa thì một nửa số lần boss xuất hiện ngay sau
lưng. Đứng dưới thì boss gần như luôn ở phía trên, tức là trong tầm mắt lúc trận bắt đầu.

### Vẽ: cộng sáng, và một mặt nạ

Art cổng đi qua **`blitLight`** — cộng vào buffer HDR chứ không vẽ chồng lên. Đó là quyết định gốc
của cả file: cái ảnh này là một vòng lửa lạnh, không phải một tấm bìa. Nhờ vậy viền mờ của art tự
thành quầng sáng, và cái lỗ giữa vòng cộng 0 — tức là **sàn hiện qua miệng cổng**, đúng như một cái
miệng phải hiện. Không có tầng glow nào vẽ tay, không có ngưỡng alpha nào để lại răng cưa. Cổng nở
ra bằng cách sáng dần cộng một vành sáng bung ra, vì art là một lưới cố định không co giãn được.

`tintPal` đổi màu bảng màu đã premultiply mà **không** làm mất lõi trắng. Nhân thẳng cả bảng với
một màu thì hỏng: art gần như không có kênh đỏ, nên nhân kiểu gì cũng không ra hổ phách. Cách ở
đây tách mỗi màu thành "sáng bao nhiêu" (kênh lớn nhất) và "nhạt bao nhiêu" (`min/max`), rồi chỉ
nhuộm phần *đậm màu* — sợi lửa trắng nóng có `min ≈ max` nên nó ở lại trắng, còn cả vòng lam đổi
hẳn sang màu mới. Độ sáng giữ nguyên, nên cổng ra không tự dưng chói hơn cổng vào.

**Hai màu là toàn bộ phần giao diện của cơ chế này**: lam lạnh là "đi vào chỗ nguy hiểm", hổ phách
ấm là "về nhà". Không có chữ nào — bảng `GLYPHS` trong `sprites.js` chỉ có chữ số với `N` và `É`,
nên một cái nhãn là bất khả — và cũng không cần: hai màu ngược nhau ở cùng một hình dáng nói đủ.

`drawRoom` che chỗ ngoài phòng bằng **một mặt nạ vẽ sau cùng**, không phải một phép ghi vào `TID`.
Không phải để tiết kiệm: ghi tone tường vào `TID` nghĩa là phải nhớ rồi hoàn nguyên hơn hai chục
nghìn ô mỗi lần ra vào, và mọi lỗi trong đoạn hoàn nguyên đó là một vết tường **vĩnh viễn** nằm
giữa map. Mặt nạ thì hết khung là hết. Chỉ quét bốn dải thật sự nằm ngoài phòng, không quét cả
khung rồi `continue`. Khoảng cách dùng **Chebyshev**, nên dải chuyển tiếp là một hình chữ nhật đồng
đều — kể cả ở bốn góc. `ROOM_FADE` tính bằng điểm ảnh *game* rồi nhân `RENDER_SCALE`: ghi thẳng
bằng điểm ảnh render thì bề dày cái tường đổi theo độ phân giải, và hai bản dựng cùng một cảnh sẽ
trông khác nhau.

### Kiểm

`node tools/check-boss.js` chốt cả đường đi, và cố tình đi qua `bossGate`/`stepGate` + input thật
chứ không gọi `enterRoom`/`exitRoom` trực tiếp — một cánh cổng mở ở chỗ không đứng vào được vẫn là
một cánh cổng hỏng:

* đủ mốc thì mở cổng và **`w.foes.length` vẫn là 0**, `w.bossN` vẫn là 0 — mốc kill không còn thả
  boss xuống đầu người chơi nữa;
* cổng nằm trong `BOUND` và trong nửa khung hình ở cả hai trục; 120 lần gọi `bossGate` nữa không
  mở cổng thứ hai;
* đứng vào trước lúc cổng nở hết thì không được tính; 8 lần vào-ra mỗi lần `HOLD*0,3` thì không
  bao giờ vào được;
* phòng hẹp hơn `BOUND0` mà rộng hơn `W`/`H`; `BOUND` **bằng đúng** phòng; `CAMB` không đảo hai
  đầu; 1800 khung đi vòng trong phòng không ai ra ngoài tường;
* boss chết thì cổng `'out'` mở đúng ở chỗ cái xác; ra khỏi phòng thì `BOUND` về `BOUND0` và `CAMB`
  về `{0, 0, WW-W, WH-H}` — hai bảng ấy là toàn cục, nên một chỗ rò là mọi trận sau đều chơi trong
  một cái sân hẹp mà không có gì trên màn hình giải thích tại sao;
* nhân vật về trong 1 px so với `w.ret`, quái sinh lại, `w.boss` là null, và mốc sau mở cổng `'in'`.

Xem bằng mắt: `node tools/shot-gate.js gate` → `tools/out/gate.png`, sáu ô, và sáu ô ấy là sáu câu
người chơi phải đọc được mà không cần một chữ nào: cổng đang mở / cổng đứng chờ / mình đang bước
vào / trận đấu bắt đầu / đây là tường phòng / đây là đường về.

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

## Sinh lại khung cổng từ ảnh

```bash
node tools/gen-gate-frames.js
```

`images/gates/gate-1.png` → `js/gate-frames.js`. Cùng đường đi với `gen-boss-frames.js` — cắt bbox
alpha, box filter xuống cỡ thật, lượng hoá màu bằng median cut, ghi ra lưới ký tự mà `blit` đã biết
đọc — nhưng khác đúng một quyết định, và đó là quyết định quan trọng nhất:

**ảnh này là ánh sáng, không phải vật chất.** Con boss là một khối thịt: nó che sàn, nên vẽ
alpha-over và alpha bị cắt thành nhị phân. Cánh cổng thì *cộng* vào buffer HDR, nên ở đây alpha
được **nhân thẳng vào màu** (premultiply) rồi bỏ đi, và cái grid mang ra là cường độ sáng sẵn sàng
để cộng. Ba thứ có được miễn phí từ đó:

* viền mờ dần của art tự thành quầng sáng yếu — không cần một tầng glow vẽ tay nào;
* cái lỗ đen giữa vòng premultiply ra 0, tức là *không cộng gì*, nên sàn hiện qua miệng cổng đúng
  như nó phải hiện: một cái miệng, không phải một miếng sơn đen;
* không có ngưỡng alpha nhị phân, nên vòng sáng không bị răng cưa cứng như sprite.

Neo là (giữa lưới theo chiều ngang, đáy lưới), y như bộ khung boss: cổng *đứng trên sàn*. Nhưng
file sinh ra còn mang thêm **`mx`/`my`** — tâm khối sáng, tính bằng pixel thế giới từ góc trên-trái
của lưới. Vòng sáng này **không đối xứng** (lệch phải một pixel, thấp hơn giữa hình), nên `gate.js`
lấy `mx`/`my` làm miệng cổng thật thay vì lấy tâm khung: chỗ người chơi phải đứng vào, chỗ vẽ xoáy,
chỗ bắn hạt. Lấy giữa hình thì cái vành tiến độ nằm lệch khỏi cái lỗ, và người chơi đứng đúng vào
lỗ lại không được tính.

Và như bộ khung boss: **đừng sửa tay `js/gate-frames.js`** — lần sinh sau ghi đè sạch.
