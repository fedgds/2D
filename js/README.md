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

Tool đọc chính `index.html`, nối các `<script src>` theo đúng thứ tự trong trang rồi chạy
bằng `node:vm`, nên nó bắt luôn lỗi **thứ tự file** chứ không chỉ lỗi map: một file đặt sai
chỗ là `ReferenceError` ngay lúc nạp. Phần shell browser nằm sau
`if (typeof document !== 'undefined')` trong `shell.js` nên node bỏ qua sạch.
