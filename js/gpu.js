"use strict";
// ===========================================================================
// 5c. Đường hiện khung bằng GPU. Một fragment shader làm đúng ba việc mà `resolve()` trong
//     core.js làm -- tonemap, Bayer dither, lượng hoá 16 mức -- rồi ghi thẳng ra canvas ở
//     độ phân giải cuối, nên nó thay luôn cả `putImageData` và cú `drawImage` phóng to.
//
//     Nó **không** thay `resolve()`. Hàm đó vẫn là định nghĩa của một khung: mọi harness ở
//     tools/ chạy trong node, không có GPU, và so ảnh vàng bằng chính nó. File này là bản dịch
//     của cùng phép tính sang GLSL, và `readExact()` ở cuối tồn tại để chứng minh câu đó bằng
//     số chứ không bằng lời -- nó chạy đúng shader ấy vào một FBO cỡ lưới render rồi đọc ngược
//     ra, để so từng byte với `resolve(out, true)`.
//
//     Vì sao đáng đổi: `resolve()` bỏ qua được điểm ảnh nào còn bằng sàn, nên nó rẻ ở khung yên
//     (2,2 ms đo trên 640x360) và đắt nhất ở khung phủ kín hiệu ứng (11,8 ms) -- tức đòi nhiều
//     đúng lúc đang đánh boss. Shader tính mọi điểm ảnh, luôn, và chi phí cố định là cú upload
//     2,76 MB. Đổi một con số dao động lấy một con số phẳng.
//
//     Cái giá của việc đổi là một chế độ hỏng mà đường CPU không có: ngữ cảnh WebGL bị driver thu
//     hồi giữa phiên. Xem `webglcontextlost` ở dưới -- đó là chỗ duy nhất trong cả đường vẽ có
//     thể cho ra một khung đen trong khi `buf` vẫn đầy đủ, nên nó phải tự báo và tự dựng lại.
// ===========================================================================
var gpuMake = null;                  // shell.js gọi; ngoài browser thì không có gì để dựng
if (typeof document !== 'undefined') {

// Bốn đỉnh của hình chữ nhật phủ toàn khung nhìn sinh từ `gl_VertexID`, nên không có buffer đỉnh
// nào phải cấp và không có attribute nào phải nối: chúng là hằng số của cả chương trình.
const GPU_VS = `#version 300 es
uniform vec2 uShift;                 // độ rung màn, đã quy về clip space
out vec2 vUV;
void main() {
  float x = float((gl_VertexID & 1) << 1) - 1.0;
  float y = float(gl_VertexID & 2) - 1.0;
  // v đảo chiều: hàng 0 của \`buf\` là hàng *trên* của khung, còn clip space thì y lên là dương.
  vUV = vec2((x + 1.0) * 0.5, (1.0 - y) * 0.5);
  gl_Position = vec4(x + uShift.x, y + uShift.y, 0.0, 1.0);
}`;

const GPU_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uBuf;
uniform vec2 uGrid;                  // (RW, RH) -- cỡ lưới render, không phải cỡ canvas
uniform float uExpo;                 // EXPO của core.js
uniform float uN;                    // LEVELS - 1
in vec2 vUV;
out vec4 oCol;
// Đúng ma trận Bayer của core.js; phép (b + 0.5)/16 - 0.5 làm ở dưới cho khỏi hai bản hằng số.
const float B16[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0,
                                3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
void main() {
  // texelFetch chứ không phải texture(): phép phóng to duy nhất của cả đường đi là nearest, và
  // texelFetch *là* nearest theo định nghĩa -- không phụ thuộc vào sampler state nào có thể bị
  // đặt sai ở chỗ khác. Kẹp xuống uGrid - 0.5 để phép cắt về int không bao giờ chạm mép ngoài.
  ivec2 t = ivec2(min(vUV * uGrid, uGrid - 0.5));
  vec3 v = max(texelFetch(uBuf, t, 0).rgb, vec3(0.0));
  // Tonemap kênh sáng nhất rồi để hai kênh kia giữ tỉ lệ với nó -- xem lý do ở tonemap() trong
  // core.js. Ngưỡng 1e-6 giữ nguyên: dưới nó cả ba kênh làm tròn về 0.
  float l = max(v.r, max(v.g, v.b));
  vec3 c = l > 1e-6 ? v * ((1.0 - exp(-l * uExpo)) / l) : vec3(0.0);
  float lum = (c.r + c.g + c.b) / 3.0;
  float amp = clamp((lum - 0.26) / 0.22, 0.0, 1.0);
  // Dither đọc theo *lưới render*, không theo điểm ảnh màn hình: đọc theo màn hình thì hoa văn
  // 4x4 bị phóng lên theo tỉ lệ upscale và biến thành ô vuông thấy được bằng mắt.
  float d = ((B16[(t.y & 3) * 4 + (t.x & 3)] + 0.5) / 16.0 - 0.5) * 0.5 * amp / uN;
  // floor(x + 0.5) là Math.round của JS trên miền này, và phép kẹp đi *sau* khi làm tròn -- đúng
  // thứ tự của resolve(). Ra k/uN, tức byte k*17: cùng con số mà đường CPU ghi.
  oCol = vec4(floor(clamp((c + d) * uN + 0.5, 0.0, uN)) / uN, 1.0);
}`;

// `canvas` phải là canvas *chưa* xin context nào: một canvas chỉ cấp được một loại, nên quyết
// định GPU-hay-CPU bắt buộc phải xảy ra trước lời gọi getContext đầu tiên (shell.js làm đúng
// thế). Trả về null nếu thiếu bất cứ thứ gì -- người gọi rơi về đường 2D cũ, không phải sập.
gpuMake = function (canvas, rw, rh, expo, n) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl2',
      { alpha: false, antialias: false, depth: false, stencil: false });
  } catch (e) { return null; }
  if (!gl) return null;

  function sh(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s;
    console.warn('gpu: dịch shader thất bại\n' + gl.getShaderInfoLog(s));
    return null;
  }

  let tex = null, uShift = null;
  let vw = 0, vh = 0, fb = null, fbTex = null, flip = null;

  // Mọi đối tượng dưới đây thuộc về **một** ngữ cảnh, và một ngữ cảnh WebGL có thể bị driver thu
  // hồi giữa phiên (xem hai listener ở dưới). Lúc ấy program, texture, VAO, FBO chết sạch cùng
  // lúc -- nên chúng nằm trong một hàm dựng được gọi lại, chứ không rải ra thân `gpuMake` như
  // trước: dựng lại một nửa là một ngữ cảnh còn sống mà vẽ ra màn hình đen.
  function build() {
    tex = null; uShift = null;
    vw = 0; vh = 0; fb = null; fbTex = null;    // `flip` là mảng CPU, sống qua mọi ngữ cảnh
    const vs = sh(gl.VERTEX_SHADER, GPU_VS), fs = sh(gl.FRAGMENT_SHADER, GPU_FS);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('gpu: link thất bại\n' + gl.getProgramInfoLog(prog));
      return false;
    }

    // RGB32F nhận đúng cách `buf` đang nằm trong bộ nhớ -- ba float liền nhau mỗi điểm ảnh, không
    // phải đệm thêm kênh alpha nào. Nó chỉ cần *lấy mẫu được*, không cần vẽ vào, nên không đòi
    // extension nào của WebGL2; và NEAREST là để texture đủ điều kiện dùng khi chỉ có một mức.
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, rw, rh, 0, gl.RGB, gl.FLOAT, null);
    if (gl.getError() !== 0) return false;            // driver không chịu float texture

    // Không có gì khác dùng context này, nên toàn bộ state cắm một lần ở đây: mỗi khung chỉ còn
    // một uniform (độ rung), một upload và một draw call.
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, 'uBuf'), 0);
    gl.uniform2f(gl.getUniformLocation(prog, 'uGrid'), rw, rh);
    gl.uniform1f(gl.getUniformLocation(prog, 'uExpo'), expo);
    gl.uniform1f(gl.getUniformLocation(prog, 'uN'), n);
    uShift = gl.getUniformLocation(prog, 'uShift');
    gl.activeTexture(gl.TEXTURE0);
    gl.clearColor(0, 0, 0, 1);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    return true;
  }
  if (!build()) return null;

  // ---- mất ngữ cảnh ------------------------------------------------------------------------
  // Driver thu hồi ngữ cảnh WebGL bất cứ lúc nào nó muốn: GPU process sập, driver reset sau một
  // cú treo, máy hết bộ nhớ hình, tab bị đẩy ra nền quá lâu. Chuyện này *không* hiếm trên điện
  // thoại sau vài phút chơi liên tục, và mặc định thì không có gì báo -- mọi lời gọi gl thành
  // lệnh rỗng, kể cả `clear`, nên canvas đứng lại ở màu đen trong khi vòng khung vẫn 60 FPS, HUD
  // (DOM) vẫn cập nhật và `hiện` vẫn ra một con số nhỏ đẹp đẽ vì đo được đúng mấy lệnh rỗng ấy.
  // Đó là màn hình đen duy nhất mà cả `renderWorld` lẫn `resolve` không thể gây ra: hai lớp cuối
  // của mỗi khung (`drawHeroBars`, `drawMinimap`) ghi đục vào `buf`, nên `buf` đen là bất khả.
  //
  // `preventDefault()` là điều kiện **bắt buộc** để trình duyệt gửi tiếp `webglcontextrestored`;
  // không gọi thì ngữ cảnh chết vĩnh viễn và chỉ nạp lại trang mới chơi tiếp được.
  let lost = false, dead = false, losses = 0;
  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    lost = true; losses++;
    // Mất đi mất lại là driver đang từ chối chứ không phải một cú vấp: dựng lại lần thứ tư chỉ
    // để đen tiếp là một vòng lặp người chơi không thoát ra được. Chốt chết, để shell đổi đường.
    if (losses > 3) dead = true;
    console.warn('gpu: mất ngữ cảnh WebGL (lần ' + losses + ')' + (dead ? ' -- bỏ đường GPU' : ''));
  }, false);
  canvas.addEventListener('webglcontextrestored', function () {
    if (dead) return;
    if (build()) { lost = false; console.warn('gpu: đã dựng lại ngữ cảnh WebGL'); }
    else { dead = true; console.warn('gpu: dựng lại ngữ cảnh thất bại -- bỏ đường GPU'); }
  }, false);

  // Người gọi hỏi một lần mỗi khung, *trước* khi quyết định vẽ vào đâu. Hỏi cả `isContextLost()`
  // chứ không chỉ tin cái cờ: sự kiện ở trên tới sau một nhịp, nên chỉ trông vào nó là còn ít
  // nhất một khung ném vào chỗ không có gì -- và nếu trình duyệt vì lý do nào đó không gửi sự
  // kiện thì cái cờ không bao giờ bật. Một lời gọi mỗi khung, không phải mỗi lệnh gl.
  function live() {
    if (dead) return false;
    if (gl.isContextLost()) { lost = true; return false; }
    return !lost;
  }

  return {
    live: live,
    // 'ok' | 'lost' (đang chờ dựng lại) | 'dead' (thôi hẳn). Cho HUD, để một khung đen không bao
    // giờ còn im lặng: người chơi đọc được ngay vì sao, và ảnh chụp nói đủ để lần ra.
    state() { return dead ? 'dead' : (live() ? 'ok' : 'lost'); },
    // `src` là chính `buf` -- Float32Array dài NP*3, không phải bản sao nào.
    upload(src) {
      if (!live()) return;
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, rw, rh, gl.RGB, gl.FLOAT, src);
    },
    // dx/dy là độ rung tính bằng *điểm ảnh vật lý*, y như đối số của drawImage trước đây. Phần
    // canvas bị dịch ra khỏi khung để lộ nền, và nền là màu clear -- đen, đúng như fillRect cũ.
    present(dx, dy) {
      if (!live()) return;
      const cw = canvas.width, ch = canvas.height;
      if (cw !== vw || ch !== vh) { vw = cw; vh = ch; gl.viewport(0, 0, cw, ch); }
      gl.uniform2f(uShift, 2 * dx / cw, -2 * dy / ch);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    // Chỉ để kiểm, không nằm trên đường vẽ mỗi khung: chạy đúng shader trên vào một FBO cỡ
    // rw x rh rồi đọc ngược ra `out` (RGBA8, thứ tự hàng của resolve()). readPixels trả hàng
    // từ *dưới* lên, còn shader đặt hàng 0 của buf ở trên, nên đảo hàng lại ở đây.
    readExact(out) {
      if (!live()) return out;
      if (!flip) flip = new Uint8Array(rw * rh * 4);
      if (!fb) {
        fbTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, fbTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, rw, rh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fbTex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, tex);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.viewport(0, 0, rw, rh);
      gl.uniform2f(uShift, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.readPixels(0, 0, rw, rh, gl.RGBA, gl.UNSIGNED_BYTE, flip);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      vw = 0;                                        // viewport vừa bị đổi, buộc present đặt lại
      for (let y = 0; y < rh; y++)
        out.set(flip.subarray((rh - 1 - y) * rw * 4, (rh - y) * rw * 4), y * rw * 4);
      return out;
    },
    gl,
  };
};

}
