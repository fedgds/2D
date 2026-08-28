# `js/` — engine

Trước đây toàn bộ engine là **một** `<script>` viết thẳng trong `index.html` (~4.5k dòng).
Giờ mỗi mục của file đó là một file ở đây. Thứ tự nạp trong `index.html` đúng bằng thứ tự
cũ, và nội dung từng mục **không đổi một byte** — chỉ thêm `"use strict";` ở dòng đầu.
Banner trong mỗi file vẫn giữ số mục cũ, nên có hai mục cùng đánh số `3b` (`arena.js` và
`sfx.js`); thứ tự thật là bảng dưới đây.

## Thứ tự nạp

| file | nội dung |
| --- | --- |
| `core.js` | buffer HDR, tonemap, Bayer dither, `hexc`/`asOutput`, rng, `fpow` |
| `fx.js` | primitive cộng sáng: `core`, `beam`, `ring`, `arc`, `bolt`, `veil`… |
| `sprites.js` | palette + grid nhân vật, `blit`, `blitRot`, `text3x5` |
| `scene.js` | sàn dựng sẵn, bóng tiếp đất, đèn riêng của hero, `setCam` |
| `arena.js` | đọc registry `map/`, `applyMap`, rải prop, hạt môi trường |
| `anim.js` | sinh mọi frame animation lúc nạp từ một pose authored |
| `weapon.js` | 5 vũ khí: sheet 16 khung (`ART`), `drawSwing`, `drawHeld`, `swing` |
| `sfx.js` | `SFX` — mọi tiếng đều tổng hợp bằng WebAudio lúc chạy |
| `world.js` | hero, quái, damage, `newWorld`, `step`, các hàm trúng đòn |
| `render.js` | thứ tự vẽ một khung, thanh HP quái, minimap |
| `skills.js` | 16 skill (`SKILLS`) |
| `dash.js` | chiêu lướt né mặc định — không tính vào 3 slot |
| `foe-abil.js` | chiêu quái + vùng cảnh báo vẽ trên sàn |
| `lab.js` | `globalThis.LAB`: cửa cho harness node, không cần DOM |
| `icons.js` | icon 32×32 vẽ bằng canvas cho hotbar và bảng chọn |
| `shell.js` | shell browser: layout, menu/hướng dẫn, input, vòng lặp khung |

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

Tool đọc chính `index.html`, nối các `<script src>` theo đúng thứ tự trong trang rồi chạy
bằng `node:vm`, nên nó bắt luôn lỗi **thứ tự file** chứ không chỉ lỗi map: một file đặt sai
chỗ là `ReferenceError` ngay lúc nạp. Phần shell browser nằm sau
`if (typeof document !== 'undefined')` trong `shell.js` nên node bỏ qua sạch.

`check-weapons.js` kiểm năm cơ chế làm nên bản sắc của năm vũ khí — chuỗi nhịp của kiếm, đạn
bay xuyên của cung, gom bầy hút máu của lưỡi hái, cắt phép của găng, xử trảm và cắm chân của
đao. Nó so hai trường hợp với nhau (có chuỗi / không chuỗi, máu đầy / máu cạn, nhịp cuối /
nhịp đầu) chứ không so lại con số trong bảng, nên tinh chỉnh số liệu thì vẫn xanh, làm hỏng
cơ chế thì đỏ.

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
