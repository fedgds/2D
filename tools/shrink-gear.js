// Hạ ảnh trang bị xuống đúng cỡ nó thật sự được hiện.
//
// images/gear/<ô>/<phẩm chất>.png được xuất ở 1254x1254 (367..1621 KB, 17 MB cả hai mươi
// tấm), nhưng chỗ to nhất chúng xuất hiện trong game là:
//
//   * ô hành trang  .gbag .gc img  -- 37 px CSS ở bề ngang panel lớn nhất (880 px);
//   * ô đang mặc    .gitem img     -- 30 px CSS, đóng đinh trong index.html.
//
// Và chúng không bao giờ to hơn thế: .panel bị `transform: scale(var(--pk))` với
// pk = clamp(h / 470, 0.6, 1) <= 1, nên một cửa sổ rộng hơn chỉ làm panel *thôi co lại*.
// 37 px nhân cho màn hình dày nhất còn gặp (DPR 3) là 111 điểm ảnh vật lý, nên 128 là cỡ
// vừa đủ dư mà không bao giờ phải phóng to -- và trình duyệt hết phải giải nén 1254x1254
// (~6 MB RAM một tấm) để lấp một ô bằng đầu ngón tay.
//
// Phép thu là lọc hộp *theo diện tích*: 1254 / 128 = 9,797 không phải số nguyên, nên mỗi ô
// đích trung bình một vùng nguồn có hai mép lẻ, và mép lẻ được cân theo đúng phần diện tích
// nó phủ. Lấy trung bình trên alpha đã nhân trước rồi chia lại ở cuối: trộn RGB thô thì màu
// nằm *dưới* những điểm ảnh trong suốt (trong bộ này là màu gì cũng có) loang ra thành một
// vành bẩn quanh hình -- đúng cái lỗi mà không ai thấy cho tới khi ảnh nằm trên nền tối.
//
// Trộn ngay trên trị sRGB, không đổi về ánh sáng tuyến tính trước: đây đúng là phép mà
// canvas và trình duyệt đang làm khi thu nhỏ, nên ảnh mới trông y như ảnh cũ chứ không sáng
// lên một chút ở mọi mép tương phản. "Đúng hơn về vật lý" ở đây là "khác với bản gốc".
//
//   node tools/shrink-gear.js                 # 128 px, ghi thẳng lên chỗ cũ
//   SIZE=256 node tools/shrink-gear.js        # đổi cỡ đích
//   node tools/shrink-gear.js images/gear/helmet   # chỉ một thư mục
//
// Bản gốc 1254 px vẫn còn trong git (`git checkout -- images/gear` là lấy lại được), và
// nặng bao nhiêu trong lịch sử cũng không ảnh hưởng tới thứ người chơi phải tải.
const fs = require('fs');
const path = require('path');
const { readPNG, writePNG } = require('./png.js');

const SIZE = +(process.env.SIZE || 128);

// Mỗi ô đích ứng với những ô nguồn nào, và mỗi ô nguồn góp bao nhiêu. Ô đầu và ô cuối của
// mỗi khoảng gần như luôn bị cắt dở, nên trọng số của chúng là bề rộng phần giao.
function spans(src, dst) {
  const sc = src / dst, out = [];
  for (let d = 0; d < dst; d++) {
    const a = d * sc, b = a + sc, list = [];
    for (let s = Math.floor(a); s < Math.min(src, Math.ceil(b)); s++)
      list.push([s, Math.min(b, s + 1) - Math.max(a, s)]);
    out.push(list);
  }
  return out;
}

function shrink(im, size) {
  const { w, h, px } = im;
  const cx = spans(w, size), cy = spans(h, size);
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, al = 0, wt = 0;
      for (const [sy, wy] of cy[y]) for (const [sx, wx] of cx[x]) {
        const i = (sy * w + sx) * 4, k = wy * wx, a = px[i + 3] / 255;
        r += px[i] * a * k; g += px[i + 1] * a * k; b += px[i + 2] * a * k;
        al += px[i + 3] * k; wt += k;
      }
      const o = (y * size + x) * 4, aa = al / wt;
      if (aa < 0.5) continue;                    // trong suốt hẳn: để nguyên bốn số 0
      const inv = 255 / aa;                      // hoàn tác phép nhân trước
      out[o] = Math.min(255, Math.round(r / wt * inv));
      out[o + 1] = Math.min(255, Math.round(g / wt * inv));
      out[o + 2] = Math.min(255, Math.round(b / wt * inv));
      out[o + 3] = Math.round(aa);
    }
  }
  return { w: size, h: size, px: out };
}

function walk(p, out) {
  for (const f of fs.readdirSync(p)) {
    const q = path.join(p, f);
    if (fs.statSync(q).isDirectory()) walk(q, out);
    else if (f.toLowerCase().endsWith('.png')) out.push(q);
  }
  return out;
}

const roots = process.argv.slice(2);
const files = [];
for (const r of roots.length ? roots : [path.join('images', 'gear')]) {
  if (fs.statSync(r).isDirectory()) walk(r, files); else files.push(r);
}
files.sort();

let was = 0, now = 0, done = 0, skip = 0;
for (const f of files) {
  const b0 = fs.statSync(f).size;
  const im = readPNG(f);
  if (im.w <= SIZE && im.h <= SIZE) {            // chạy lại lần nữa không làm hỏng gì
    was += b0; now += b0; skip++;
    console.log(`  ${f.padEnd(34)} ${im.w}x${im.h} đã đủ nhỏ, bỏ qua`);
    continue;
  }
  writePNG(f, shrink(im, SIZE));
  const b1 = fs.statSync(f).size;
  was += b0; now += b1; done++;
  console.log(`  ${f.padEnd(34)} ${im.w}x${im.h} -> ${SIZE}x${SIZE}`
    + `   ${(b0 / 1024).toFixed(0).padStart(5)} KB -> ${(b1 / 1024).toFixed(1).padStart(6)} KB`);
}
console.log(`\n${done} tấm hạ xuống ${SIZE}px, ${skip} bỏ qua: `
  + `${(was / 1048576).toFixed(2)} MB -> ${(now / 1024).toFixed(0)} KB `
  + `(còn ${(now / was * 100).toFixed(1)}%)`);
