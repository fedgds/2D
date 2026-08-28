# `map/` — sân đấu

Mỗi file trong thư mục này là **một map**. File tự đăng ký, không cần sửa
`index.html` khi thêm map mới:

```js
(globalThis.GAME_MAPS = globalThis.GAME_MAPS || []).push({ id: '…', … });
```

Rồi thêm một dòng `<script src="map/<tên>.js"></script>` cạnh ba dòng đã có.
Kiểm map mới **trước khi** mở game bằng `node tools/check-maps.js` — nó chạy
không cần browser, và bắt đúng ba lỗi hay gặp: tông vượt cửa dither, `floor`/
`props`/`emit`/`amb` ném lỗi lúc chạy, và sân mới làm hỏng chiêu lướt né.
Thứ tự nạp không quan trọng: registry chỉ là một mảng, và engine sắp lại theo
`order` trước khi hiện lên bảng chọn. Ô chọn sân trong bảng `CHUẨN BỊ VÀO TRẬN`
cũng tự sinh: icon được vẽ từ `tone` + `pal` + `amb` của chính map (xem
`drawMapIcon` trong `js/icons.js`), nên map mới có ô chọn ngay, không cần vẽ tay.

## Bọc cả file trong IIFE

```js
(() => { … })();
```

**Bắt buộc.** Các file này là classic script, nên `const`/`let` ở tầng ngoài cùng
đều nằm chung một global lexical scope: hai map khai báo trùng tên helper là
`SyntaxError` ngay lúc nạp. Còn `function` ở tầng ngoài cùng thì tệ hơn — chúng
ghi lên cùng một thuộc tính của global và file nạp sau **âm thầm** thắng. Bọc
IIFE thì dữ liệu art của map là của riêng nó.

## Vì sao tông màu sàn phải tối

Engine không tonemap lại sàn mỗi khung: 320×180 pixel sàn được resolve **một
lần** rồi memcpy vào, và một pixel chỉ được tính lại khi giá trị buffer của nó
khác giá trị sàn (xem `resolve()` trong `js/core.js`). Cách đó chỉ đúng nhờ một
tính chất: biên độ dither là `(lum - 0.26) / 0.22` kẹp ở 0, nên mọi tông tối hơn
`lum 0.26` **không bao giờ bị dither** — byte của nó không phụ thuộc vào vị trí
trên màn hình.

Nếu một tông vượt ngưỡng đó, cùng một tông sẽ resolve ra hai byte khác nhau ở
hai pha Bayer khác nhau, cửa sổ sàn dựng sẵn sẽ lệch với `resolve()`, và đường
nhanh sẽ nói dối. Nên `applyMap` **kiểm tra và ném lỗi** thay vì để nó lặng lẽ
sai: tổng ba kênh của mỗi tông phải `≤ 198`.

Hệ quả thực tế: **không thể** làm sàn phát sáng bằng tông màu. Ánh sáng phải là
prop tự phát (`emit`) hoặc hạt môi trường (`ambDraw`) — chúng cộng vào buffer HDR
và được dither bình thường. Dung nham sáng, tinh thể sáng, tuyết lấp lánh đều đi
đường đó.

Thêm nữa: `asOutput` chỉ trả đúng màu bạn viết nếu màu đó nằm trên lưới 16 mức,
tức mỗi kênh là bội của `0x11`. Viết `#2a2a3d` thì nhận về `#222244`. Cứ dùng bội
số `0x11` để thấy đúng cái mình chọn.

## Hợp đồng

```js
{
  id, name, label, desc,        // nhận dạng + nhãn trên bảng chọn
  order,                        // thứ tự hiện ra (nhỏ trước)
  tone: {
    floor: ['#…', '#…', '#…', '#…'],   // id 0..3, tối → sáng
    seam:  '#…',                       // id 4: mạch vữa / vết nứt
    wall:  '#…', lip: '#…', void: '#…',// id 5,6,7 — viền thế giới
  },
  amb: { dust, glow, lm },      // bụi bước chân, đèn riêng của hero, đốm mốc trên minimap
  pal: { D,d,P,p,Q,q,Z,z },     // 8 ký tự vật liệu dùng trong grid prop của map này
  init(FX) { … },               // gọi một lần, lấy màu qua FX.hexc
  floor(F) { … },               // vẽ id 0..4 cho phần trong
  props: [ … ],                 // bảng prop + trọng số
  seed, fseed,                  // seed rải prop, và seed sàn (mặc định = seed)
  cell, density,                // ô rải prop (px) và xác suất mỗi ô có prop
  ambStep(A) { … },             // hạt môi trường: cập nhật
  ambDraw(A) { … },             // hạt môi trường: vẽ
}
```

### `init(FX)`

Gọi **một lần**, lần đầu map được `applyMap`. Đây là nơi lấy màu cho `emit` và
cho hạt: `FX.hexc('#ff5410')` chính là hàm engine dùng, nên bộ ba float trả về
khớp tuyệt đối với những gì engine cộng vào buffer. Viết tay literal float (kiểu
`[1, 0.33, 0.06]`) thì **không** khớp — sai ở chữ số thứ ba là đủ để một frame
lệch một mức dither.

Giữ chúng trong biến `let` của IIFE, đừng gắn vào object map.

### `floor(F)`

Chỉ vẽ **id 0..4** cho phần trong. Viền thế giới (id 5/6/7) do engine vẽ **sau**,
nên một map không thể làm lệch `BOUND` — vùng đi lại được luôn khớp với tường.

`F` có: `WW`, `WH`, `tid` (Uint8Array `WW*WH`), `rng` (mulberry32 đã seed bằng
`fseed || seed`), `vnoise(a,b)`, `clamp`, `c01`, và ba helper:

* `walk(x,y,len,id,wob)` — rải một đường nứt đi lang thang (`wob` nhỏ thì nứt
  chạy dài một hướng, lớn thì vụn ra);
* `blob(cx,cy,rw,rh,id,soft)` — tô một vệt loang, `soft` là độ tan của rìa;
* `border()` — đóng viền thế giới **ngay lúc này**, cho map nào cần các pass sau
  của chính nó thấy tường (ví dụ pass rắc hạt bỏ qua mọi id > 3). Engine vẫn đóng
  viền lần nữa lúc thoát, nên gọi hay không cũng không đổi kết quả cuối — nó chỉ
  đổi những gì các pass *bên trong* `floor` nhìn thấy. Đây là chi tiết ảnh hưởng
  tới dòng rng: hang động phải gọi nó để chuỗi speck trùng bản gốc.

Sàn được bake **một lần** mỗi lần đổi map, không phải mỗi khung, nên cứ thoải mái
tính — nhưng 2560×1440 là 3.7 triệu pixel, đừng để thứ gì đắt hơn O(1)/pixel nằm
trong vòng lặp chính.

Chỉ có 4 tông sàn, nên chuyển tông đột ngột theo ô sẽ ra hình *khối vuông*. Muốn
sàn mượt (đồng tuyết, cát) thì nội suy giá trị liên tục rồi **dither sang id**:
`tid = floor(v) + (v - floor(v) > vnoise(x, y) ? 1 : 0)`. Dither ở *id tông*, chứ
không phải ở byte đầu ra, nên cửa sổ sàn dựng sẵn vẫn đúng. `map/ice.js` làm vậy.

### `props: [...]`

```js
{ kind: 'rock', w: 20, grid: [...], tall: false, mark: false, off: [dx, dy],
  px(q) { return [[dx, dy, char, alpha], …]; },   // decal rời, thay cho grid
  emit(p, t, FX) { … } }                          // ánh sáng tự phát, mỗi khung
```

`w` là trọng số (không cần cộng thành 100). `tall` thì prop sắp lớp cùng quái
theo `y` và `grid` được neo ở **đáy** (`p.y - số dòng`); phẳng thì vẽ trước bóng
đổ, dưới mọi thứ, và `grid` được neo ở **giữa** — `off: [dx, dy]` ghi đè điểm neo
đó khi cần (dùng cho vệt cỏ, vũng dung nham...). `mark: true` cho đốm mốc trên
minimap, tức là "cái để định hướng": nên để dành cho prop phát sáng.

`px(q)` được gọi **một lần** lúc build với rng riêng của prop, nên bụi
xương/vết nứt không cấp phát gì lúc chạy.

`emit(p, t, FX)` chạy **trong cùng lớp vẽ với art của prop đó** — prop phẳng thì
ở pass phẳng, prop `tall` thì ở pass sắp theo `y` — chứ không phải một pass ánh
sáng riêng ở cuối. Nhờ vậy ánh sáng của vũng dung nham không phủ lên sprite vẽ
sau nó, và thứ tự lớp của đuốc/tinh thể giữ nguyên như bản gốc.

### `ambStep(A)` / `ambDraw(A)`

`A` là `{ w, dt, list, rng, cam, FX, clamp, c01, TAU }` — `list` là `w.amb`, mảng
hạt do map tự quản, `rng` là `w.crng` (dòng rng "trang trí"). Sinh quanh camera và
thu hồi khi ra khỏi khung: hạt là thứ duy nhất trong game không seed theo sim, nên
đừng để nó ảnh hưởng gameplay.

`ambDraw` được gọi với `dt = 0` — nó chỉ vẽ, không được đẩy thời gian. Nó vẽ
**sau** hero và mọi skill (nhưng dưới HUD), nên tuyết và tro bay *trước mặt* nhân
vật. `A` là object dùng lại, không phải object mới mỗi khung: đừng giữ tham chiếu
tới nó.

`FX` gói sẵn primitive: `core ring line beam sparks cloud puddle cracks glare
veil setPix setPixS blit text3x5 hexc clamp c01 TAU`.

## Đổi map lúc đang chạy

`applyMap(m)` (trong `js/arena.js`) làm tất cả: kiểm tra tông, gọi `init`, dựng
bảng tông, trộn `pal` của map vào `PAL`, đổi màu bụi/đèn hero/đốm minimap, bake
lại sàn, rải lại prop, rồi `syncFloor(true)`. `PROPS` được **sửa tại chỗ** và
`w.props` giữ đúng mảng đó, nên đổi map giữa trận cập nhật luôn world đang chạy.

Bảng chọn gọi `applyMap` ngay lúc bấm — sân sau lưng bảng chính là bản xem trước,
và `Tab` lật qua từng sân. ESC hoàn tác về sân cũ.
