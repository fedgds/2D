"use strict";
// ===========================================================================
// 8. Browser shell: fixed frame layout, menu/guide, input, nearest upscale,
//    hotbar, slow-mo / freeze-frame.
// ===========================================================================
if (typeof document !== 'undefined') {
  const screen = document.getElementById('screen');
  const ctx = screen.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const off = document.createElement('canvas');
  off.width = RW; off.height = RH;
  const octx = off.getContext('2d');
  const img = octx.createImageData(RW, RH);
  // Bậc nhảy nhỏ nhất của bộ đệm canvas mà vẫn giữ **đúng** tỉ lệ W/H, nên điểm ảnh game luôn
  // vuông: (W/g, H/g) với g = gcd(W, H). Tính một lần ở đây vì W chốt lúc nạp trang (xem FRAME_W
  // trong index.html) và layout() chạy lại mỗi lần đổi cỡ cửa sổ.
  const FGCD = (function (a, b) { while (b) { const t = a % b; a = b; b = t; } return a; })(W, H);
  const FQW = W / FGCD, FQH = H / FGCD;

  let world = newWorld(20260827);
  let paused = false, stepOnce = false, slow = false;
  let last = performance.now(), fps = 60, ms = 0;
  const keys = new Set();
  const bar = document.getElementById('bar');
  const hud = document.getElementById('hud');
  const titleEl = document.getElementById('title');
  let titleT = 0;

  // ---- Fixed frame ---------------------------------------------------------
  // Header, arena và hotbar được tính lại mỗi lần cửa sổ đổi, nên trang không bao giờ phải
  // cuộn. --sw/--sh điều khiển #stage (và qua CSS là cả HUD với cỡ chữ tiêu đề), --rowh/--ico
  // điều khiển hotbar.
  //
  // Bộ đệm canvas bằng đúng cỡ hộp tính theo điểm ảnh **vật lý**, không phải theo px CSS. Đây
  // là chỗ duy nhất quyết định game trông sắc hay mờ, nên nói rõ: trên Windows ở mức phóng
  // 125% thì devicePixelRatio là 1.25, một hộp 1221 px CSS là 1526,25 điểm ảnh thật. Bản cũ
  // chốt bộ đệm ở 320*round(w/W) = 1280 rồi để CSS kéo nó vào cái hộp đó -- tức là một lần
  // lấy mẫu lại ở tỉ lệ 1,1924 do *màn hình* làm, và `image-rendering: pixelated` không cứu
  // được: thuộc tính đó chỉ giữ mép cứng khi phóng lên số nguyên lần, còn ở tỉ lệ lẻ (và tệ
  // hơn nữa là khi hộp nhỏ hơn bộ đệm, điều mà round() ở đây gây ra thường xuyên) trình duyệt
  // nội suy trơn -- đúng cái làm *mọi thứ* trong game mờ đi, không riêng gì boss.
  //
  // Sửa: bộ đệm = số điểm ảnh vật lý của hộp, nên bước cuối là copy 1:1. Cả việc phóng to
  // 320x180 lên do chính `drawImage` với imageSmoothingEnabled = false làm, tức nearest thật:
  // một điểm ảnh game ra 4 hoặc 5 điểm ảnh vật lý, mép nào cũng cứng, không có ô nào bị trộn.
  const rootStyle = document.documentElement.style;
  const topbar = document.getElementById('topbar');
  const stage = document.getElementById('stage');
  // ---- Chế độ điện thoại ---------------------------------------------------
  // Đọc *trước* lượt layout() đầu tiên: CSS của `body.mob` quyết định luôn cỡ của #stage (cả
  // viewport thay vì phần còn lại sau header và hotbar), nên bật sau là bật muộn một khung.
  // Fullscreen với khoá hướng màn hình thì không làm ở đây được -- cả hai đòi một cử chỉ của
  // người dùng, nên chúng nằm trong setMob() phía dưới.
  const touchLayer = document.getElementById('touch');
  // Bốn phần tử của lớp cảm ứng lấy ngay ở đây, không phải ở dưới cạnh chỗ dùng: `layout()` chạy
  // lượt đầu *trên* cả phần cảm ứng trong file này, và nó gọi tới `actsPlace()` -- một `const` khai
  // ở dưới thì lúc đó còn trong vùng chưa khởi tạo, tức một ReferenceError chỉ nổ trên máy nào vào
  // trận đủ nhanh. Cùng lý do với `tbtn`: mảng năm cái nút, do `buildTouch()` lấp.
  const tacts = document.getElementById('tacts');
  const tstick = document.getElementById('tstick');
  const tbase = document.getElementById('tbase');
  const tknob = document.getElementById('tknob');
  const tbtn = [];
  let mobOn = false;
  try {
    const saved = localStorage.getItem('sl.mob');
    // Lần đầu mở thì chỉ máy *chỉ có* cảm ứng mới tự bật: laptop màn cảm ứng vẫn có chuột và
    // bàn phím, và ở đó bàn phím là thứ chơi tốt hơn.
    mobOn = saved !== null ? saved === '1'
      : matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  } catch (e) { /* file:// có thể chặn localStorage -- rơi về desktop */ }
  document.body.classList.toggle('mob', mobOn);
  // ---- Chỗ đặt và cỡ phím cảm ứng ------------------------------------------
  // Ngón tay mỗi người ở một chỗ, và không có con số mặc định nào đúng cho cả máy 5 inch cầm một
  // tay lẫn tablet 11 inch kẹp hai bên. Nên *chỗ đặt* và *cỡ* là của người chơi, còn hình dạng
  // (cung, thứ tự nút, tỉ lệ giữa nút đánh thường và ba skill) vẫn của CSS: cái sau là thiết kế,
  // cái trước là bàn tay.
  //
  // Vị trí lưu theo **tỉ lệ viewport**, không phải px: quay máy, thanh địa chỉ trượt đi, hay mở
  // trên máy khác đều là đổi cỡ viewport, và một toạ độ px lưu từ máy cũ sẽ đặt joystick ra ngoài
  // màn hình. `null` là "chưa đặt, lấy chỗ mặc định" -- khác hẳn một toạ độ 0.
  //
  // `b` là chỗ đặt của **từng nút một** (đánh thường, ba skill, lướt né), không phải của cả cụm:
  // nan quạt trong CSS là một phỏng đoán tốt về chỗ ngón cái với tới, nhưng nó vẫn chỉ là phỏng
  // đoán -- người cầm máy hai tay muốn lướt né sang tận mép trái, người ngón ngắn muốn ba skill
  // sát nhau hơn, và dời cả cụm thì không nói được câu nào trong hai câu đó. Ô nào còn `null` thì
  // vẫn nằm nguyên trên cung: mặc định là *một* nguồn sự thật ở CSS, không phải năm toạ độ chép ra.
  const tcfgDef = () => ({ jx: null, jy: null, js: 1, as: 1, b: [null, null, null, null, null] });
  const TSCALE_LO = 0.7, TSCALE_HI = 1.6;
  const tcfg = tcfgDef();
  try {
    const raw = JSON.parse(localStorage.getItem('sl.touch') || 'null');
    const num = v => typeof v === 'number' && isFinite(v);
    if (raw && typeof raw === 'object') {
      // Đọc từng khoá rồi kẹp, chứ không nhận cả object: localStorage là thứ sửa được từ ngoài
      // (và bản trước của chính game này ghi vào), và một `js: 40` ở đó là cái bệ to bằng màn hình.
      // Toạ độ đi theo *cặp*: một nửa hợp lệ thì cũng không thành chỗ đứng nào.
      if (num(raw.jx) && num(raw.jy)) { tcfg.jx = c01(raw.jx); tcfg.jy = c01(raw.jy); }
      if (num(raw.js)) tcfg.js = clamp(raw.js, TSCALE_LO, TSCALE_HI);
      if (num(raw.as)) tcfg.as = clamp(raw.as, TSCALE_LO, TSCALE_HI);
      if (Array.isArray(raw.b))
        for (let n = 0; n < 5; n++) {
          const p = raw.b[n];
          if (p && num(p.x) && num(p.y)) tcfg.b[n] = { x: c01(p.x), y: c01(p.y) };
        }
    }
  } catch (e) { /* không đọc được thì dùng mặc định */ }
  function saveTcfg() {
    try { localStorage.setItem('sl.touch', JSON.stringify(tcfg)); } catch (e) { /* đành chịu */ }
  }
  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const rowh = Math.round(clamp((vh - 90) * 0.085, 36, 60));
    let w, h;
    if (mobOn) {
      // Khung to nhất còn đúng 16:9 trong *cả* viewport: không header, không hotbar, không
      // padding. Màn 20:9 để lại hai dải đen hai bên và đó là chỗ đặt nút cảm ứng.
      h = vh; w = h * (W / H);
      if (w > vw) { w = vw; h = w * (H / W); }
    } else {
      const chrome = 6 + 8 + 12 + (topbar.offsetHeight || 24) + 2;   // padding, gaps, header, border
      h = vh - chrome - (rowh * 2 + 4);
      w = h * (W / H);
      const maxW = vw - 16;
      if (w > maxW) { w = maxW; h = w * (H / W); }
    }
    w = Math.max(W, w); h = Math.max(H, h);
    // Cỡ tính theo điểm ảnh vật lý, và là số nguyên lần tỉ lệ khung để điểm ảnh game *vuông*: lấy
    // round() riêng cho bề rộng và chiều cao thì hai tỉ lệ lệch nhau chút một, và cả khung bị
    // kéo dẹt đi một phần nghìn -- không thấy ngay, nhưng vòng tròn nào cũng thành hơi méo.
    // Bậc nhảy nhỏ nhất giữ đúng W/H là (W/g, H/g) với g = gcd(W, H): với 320x180 ra đúng (16, 9)
    // như bản trước, và vì W luôn là bội của 20 thì g >= 20, nên bậc theo chiều cao vẫn là 9 điểm
    // ảnh vật lý dù khung có rộng ra -- mất nhiều nhất ~1% bề rộng so với việc lấp kín.
    const u = Math.max(FGCD, Math.floor(Math.min(w * dpr / FQW, h * dpr / FQH)));
    const bw = u * FQW, bh = u * FQH;
    if (screen.width !== bw) screen.width = bw;
    if (screen.height !== bh) screen.height = bh;
    // Cỡ CSS suy ra *từ* cỡ vật lý, không phải ngược lại. Số có thể lẻ (1520/1.25 = 1216, còn
    // ở dpr 1.5 thì ra 1013,33) -- không sao: nhân lại với dpr là đúng số nguyên bw, nên hộp
    // border-box của #stage rơi chính xác lên lưới điểm ảnh của màn hình.
    w = bw / dpr; h = bh / dpr;
    // Năm ô cách nhau 6px và CSS chặn mỗi ô ở 172px, nên cửa sổ rộng thì căn giữa chúng thay
    // vì kéo năm cái nhãn ra suốt 1280px.
    const cellW = Math.min(172, (w - 24) / 5);
    const tiny = cellW < 96;
    bar.classList.toggle('tiny', tiny);
    rootStyle.setProperty('--sw', w + 'px');
    rootStyle.setProperty('--sh', h + 'px');
    rootStyle.setProperty('--rowh', rowh + 'px');
    rootStyle.setProperty('--ico', Math.round(tiny ? clamp(Math.min(rowh - 6, cellW - 6), 16, 54)
                                                   : clamp(rowh - 13, 22, 47)) + 'px');
    // Panels are laid out in fixed px, so a short frame scales them down instead of
    // growing a scrollbar inside the menu.
    rootStyle.setProperty('--pk', clamp(h / 470, 0.6, 1).toFixed(3));
    // Nút cảm ứng lấy theo chiều *ngắn* của máy: ngón tay không to ra khi màn hình dài ra, nên
    // đo theo bề rộng là cho ra một nút 90 px trên máy chỉ cao 360 px.
    const tmin = Math.min(vw, vh);
    // Kẹp cỡ gốc *trước*, rồi mới nhân hệ số của người chơi: cái kẹp là để một máy màn dài không
    // tự sinh ra nút 90 px, còn hệ số là người chơi chủ động xin to hơn -- kẹp lần nữa sau khi
    // nhân là phủ quyết đúng cái họ vừa chọn.
    rootStyle.setProperty('--tu', Math.round(clamp(tmin * 0.145, 44, 96) * tcfg.as) + 'px');
    rootStyle.setProperty('--js', Math.round(clamp(tmin * 0.34, 96, 210) * tcfg.js) + 'px');
    actsPlace();
    snapStage();
    // Chiều cao của #app còn đổi *sau* lượt này: lúc nạp trang thì hotbar chưa có ô nào (cao
    // 0), và chiều cao topbar còn phụ thuộc font đã tải xong hay chưa. Cả hai đều đẩy #stage
    // lên xuống nửa điểm ảnh, nên đo lại một lần nữa khi khung đã dựng xong.
    requestAnimationFrame(() => { snapStage(); stickHome(); actsPlace(); });
  }
  // Cỡ đúng rồi vẫn chưa đủ: #stage do flexbox căn giữa, và nếu chỗ trống hai bên (hay trên
  // dưới) chia ra số lẻ thì mép của nó rơi vào *giữa* một điểm ảnh vật lý -- cả canvas bị dịch
  // nửa điểm ảnh và trình duyệt trộn lại lần nữa, tức là mờ đúng như cũ dù bộ đệm đã khớp từng
  // điểm ảnh. Đo rồi đẩy về lưới bằng một translate nhỏ hơn 1 px CSS: bản thân nó là số nguyên
  // điểm ảnh vật lý nên không sinh thêm lần lấy mẫu nào.
  function snapStage() {
    const dpr = window.devicePixelRatio || 1;
    stage.style.transform = 'none';
    // Lúc sắp xếp phím thì *không* đẩy. Một `transform` bất kỳ trên #stage biến nó thành stacking
    // context, và z-index của #overlay bị nhốt lại bên trong: bảng SẮP XẾP PHÍM không cách nào lên
    // trên lớp #touch (z 30), nên một nút kéo trùm lên "XONG" là ăn hết cú chạm của nó và người chơi
    // trên điện thoại không còn phím ESC nào để ra. Bỏ cú đẩy đi thì #stage trở lại z-index: auto và
    // bảng thắng. Giá phải trả là khung có thể lệch dưới 1 px CSS suốt lúc đang kéo -- một nét mờ
    // đúng bằng nét mờ của cả bản trước khi có hàm này, và thoát ra là snapStage() chạy lại ngay.
    // Đọc cái *class* chứ không phải biến `tedit`: layout() gọi hàm này ngay từ lượt dựng khung, mà
    // `let tedit` còn nằm hơn 800 dòng dưới đây, tức là còn trong TDZ.
    if (document.body.classList.contains('tedit')) return;
    const r = stage.getBoundingClientRect();
    const dx = (Math.round(r.left * dpr) - r.left * dpr) / dpr;
    const dy = (Math.round(r.top * dpr) - r.top * dpr) / dpr;
    if (dx || dy) stage.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  }
  layout();
  window.addEventListener('resize', layout);
  // Trên điện thoại một mình `resize` là chưa đủ: thanh địa chỉ trượt đi làm đổi chiều cao khả
  // dụng mà không phải lúc nào cũng có `resize`, quay máy thì kích thước mới chỉ có sau một
  // nhịp, và vào/ra fullscreen là một lần đổi cỡ nữa. Layout() rẻ và không cấp phát gì, nên gọi
  // thừa vài lần thì không sao -- còn thiếu một lần là cả khung lệch khỏi lưới điểm ảnh.
  window.addEventListener('orientationchange', () => setTimeout(layout, 120));
  document.addEventListener('fullscreenchange', layout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);

  const modeLabel = sk => sk.mode === 'self' ? 'BẢN THÂN' : sk.mode === 'dir' ? 'ĐỊNH HƯỚNG' : 'CHỈ ĐIỂM';

  // ---- Loadout -------------------------------------------------------------
  // What the player took into the run: one weapon and three of the sixteen skills.
  // This object is the picker's model *and* what `newWorld` is handed, so the hotbar,
  // the sim and the panel can never disagree about what you are carrying.
  const loadout = { map: MAPS[0].id, wp: WEAPONS[0], slots: [0, 1, 2] };

  // The hotbar is rebuilt whenever the loadout changes: five cells -- slot 0 is the
  // weapon's basic attack on the mouse, 1-3 are the chosen skills, and slot 4 is the dash
  // every run carries. Rebuilding beats keeping 16 cells around and hiding thirteen: the
  // cooldown sweep then only ever walks the things that are actually on screen.
  //
  // Một ô có thể có *nhiều mặt*: ô hotbar dưới màn hình và nút cảm ứng bên phải là hai mặt của
  // đúng một slot. `slotFaces[n]` là danh sách mặt đó, nên hồi chiêu với viền chọn chỉ tính một
  // lần rồi ghi ra tất cả -- hai vòng lặp riêng là hai chỗ để chúng nói khác nhau.
  const slotFaces = [], slotKind = [];
  const BAR_N = 5, DASH_SLOT = 4;
  let sel = 0;
  // Thứ một ô đang mang, suy ra từ `loadout` chứ không lưu lại: hotbar, nút cảm ứng và bảng
  // chọn cùng đọc một hàm nên không ai trong ba chỗ đó tự nhớ sai vũ khí.
  function slotInfo(n) {
    const weapon = n === 0, isDash = n === DASH_SLOT;
    // slotKind is what paintCds reads: -1 the weapon, -2 the dash, 0..15 a real skill.
    const gi = weapon ? -1 : isDash ? -2 : loadout.slots[n - 1];
    const sk = weapon ? loadout.wp : isDash ? DASH_SK : SKILLS[gi];
    const theme = weapon ? (WEAPON_THEMES[sk.id] || WEAPON_THEMES.kiem) : ICON_THEMES[sk.id];
    return { weapon, isDash, gi, sk, theme, cd: isDash ? DASH_CD : sk.cd };
  }
  function buildBar() {
    bar.textContent = '';
    slotKind.length = 0; slotFaces.length = 0;
    for (let n = 0; n < BAR_N; n++) {
      const { weapon, isDash, gi, sk, theme, cd } = slotInfo(n);
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'cell';
      d.style.setProperty('--accent', theme[0]);
      d.style.setProperty('--deep', theme[2]);
      d.setAttribute('aria-label', (weapon ? 'Đánh thường: ' : isDash ? 'Lướt né: ' : `Skill ${n}: `) + sk.name);
      d.title = weapon
        ? `${sk.name} · đánh thường (chuột)\nHồi ${cd.toFixed(2)} giây · ${sk.hits.length} nhịp`
        : isDash
        ? `${sk.name} · lướt né (Shift hoặc chuột phải)\nHồi ${cd.toFixed(2)} giây`
          + `\nBất tử ${DASH_IV.toFixed(2)} giây · đi ${DASH_LEN} px theo hướng đang đi`
        : `${sk.name} · ${sk.id}\nHồi chiêu ${cd.toFixed(2)} giây`;

      const hotkey = document.createElement('u');
      hotkey.textContent = weapon ? 'CHUỘT' : isDash ? 'SHIFT' : String(n);
      if (weapon || isDash) hotkey.className = 'mouse';
      const iconWrap = document.createElement('span');
      iconWrap.className = 'skill-icon-wrap';
      const icon = document.createElement('canvas');
      icon.className = 'skill-icon'; icon.width = 32; icon.height = 32;
      icon.setAttribute('role', 'img'); icon.setAttribute('aria-label', `Biểu tượng ${sk.name}`);
      if (weapon) drawWeaponIcon(icon, sk); else drawSkillIcon(icon, sk);
      const mask = document.createElement('span'); mask.className = 'cooldown-mask';
      const cdValue = document.createElement('span'); cdValue.className = 'cooldown-value';
      iconWrap.append(icon, mask, cdValue);
      const name = document.createElement('b'); name.textContent = sk.name;
      const meta = document.createElement('i');
      meta.textContent = (weapon ? 'ĐÁNH THƯỜNG' : isDash ? 'NÉ · BẤT TỬ' : modeLabel(sk))
                       + ' · ' + cd.toFixed(2) + 's';
      d.append(hotkey, iconWrap, name, meta);
      d.onclick = () => fire(n);
      d.addEventListener('mousedown', ev => ev.preventDefault());   // keep Space/Enter for the game
      bar.appendChild(d);
      slotKind.push(gi);
      slotFaces.push([{ cell: d, mask, value: cdValue }]);
    }
    buildTouch();
    paint();
  }
  function paint() {
    slotFaces.forEach((faces, i) => {
      const selected = i === sel;
      for (const f of faces) {
        f.cell.classList.toggle('on', selected);
        f.cell.setAttribute('aria-pressed', selected ? 'true' : 'false');
      }
    });
  }
  // The dark sweep and number make a blocked cast readable without dimming its name.
  // Only icons that are actively cooling down receive per-frame style writes.
  const ready = [true, true, true, true, true];
  function paintCds() {
    for (let n = 0; n < BAR_N; n++) {
      const gi = slotKind[n];
      const left = Math.max(0, gi === -1 ? world.wcd : gi === -2 ? world.dcd : world.cds[gi]);
      const full = gi === -1 ? world.wp.cd : gi === -2 ? DASH_CD : SKILLS[gi].cd;
      const ok = left <= 0;
      const faces = slotFaces[n];
      if (!ok) {
        const sweep = `scaleY(${c01(left / full).toFixed(3)})`;
        const txt = Math.max(0.1, left).toFixed(1);
        for (const f of faces) { f.mask.style.transform = sweep; f.value.textContent = txt; }
      }
      if (ok !== ready[n]) {
        ready[n] = ok;
        for (const f of faces) {
          f.cell.classList.toggle('cooling', !ok);
          if (ok) { f.mask.style.transform = 'scaleY(0)'; f.value.textContent = ''; }
        }
      }
    }
  }

  // ---- Menu / select / guide / pause ---------------------------------------
  // One overlay pinned over the arena with four panels; `scene` is the single
  // source of truth, and everything else (sim, HUD, input, music) reads it.
  const overlay = document.getElementById('overlay');
  const panels = {
    menu: document.getElementById('pnMenu'),
    select: document.getElementById('pnSelect'),
    pause: document.getElementById('pnPause'),
    guide: document.getElementById('pnGuide'),
    touch: document.getElementById('pnTouch'),
  };
  let scene = 'menu', backTo = 'menu';
  function setScene(s) {
    // Hướng dẫn và bảng sắp xếp phím đều là chỗ *ghé qua*: mở từ đâu thì ESC trả về đúng đó, và
    // mở giữa trận thì trả về bảng tạm dừng chứ không quẳng luôn vào trận đang có ba con vây.
    if ((s === 'guide' || s === 'touch') && scene !== s) backTo = scene === 'play' ? 'pause' : scene;
    if (s === 'select') {
      selectFrom = scene === 'pause' ? 'pause' : 'menu';
      // The picker edits `loadout` in place, so backing out has to be able to undo it:
      // otherwise cancelling would leave the panel's choice attached to a run that is
      // still swinging the old weapon.
      selectSnap = { map: loadout.map, wp: loadout.wp, slots: loadout.slots.slice() };
      paintPick();
    }
    scene = s;
    const playing = s === 'play';
    // Vào trận thì luôn tắt đứng hình. Space là công tắc đứng hình lúc chơi, nhưng khi bảng
    // menu đang che thì không có gì nói cho người chơi biết nó đang bật -- ESC vào tạm dừng,
    // đổi skill, rồi tiếp tục là trả về một màn hình đóng băng không khác gì treo máy.
    if (playing) { paused = false; stepOnce = false; }
    overlay.hidden = playing;
    for (const k in panels) panels[k].hidden = k !== s;
    hud.style.opacity = playing || s === 'pause' ? '1' : '0';
    // Lớp cảm ứng sống trong lúc chơi -- và trong bảng sắp xếp phím, vì ở đó nó *chính là* thứ
    // đang được sửa: người chơi kéo đúng cái nút sẽ bấm lúc đánh nhau, không kéo một hình xem
    // trước. Ngoài hai chỗ đó thì ẩn: bảng menu nằm trong #stage còn nó nằm trên cả viewport, nên
    // để nó lại là để một nút "đánh thường" phủ lên nút "TIẾP TỤC". Và phải nhả joystick ở đây --
    // ẩn phần tử đang giữ pointer thì không bao giờ có pointerup nữa, tức là nhân vật chạy mãi một
    // hướng sau khi mở menu.
    tedit = s === 'touch';
    document.body.classList.toggle('tedit', tedit);
    // Đẩy lưới điểm ảnh bật/tắt theo đúng cái class vừa đổi: xem snapStage() -- lúc sắp xếp phím
    // #stage không được là stacking context, bằng không cái bảng không lên nổi trên lớp #touch.
    snapStage();
    touchLayer.hidden = !((mobOn && playing) || tedit);
    stickEnd();
    holdEnd(false);
    editUp();
    atkHeld = false;
    if ((mobOn && playing) || tedit) { stickHome(); actsPlace(); }
    if (!playing) keys.clear();
    SFX.music(playing ? 'play' : 'menu');
    const first = panels[s] && panels[s].querySelector('.mbtn:not([disabled])');
    if (first) first.focus({ preventScroll: true });
  }
  // Where ESC out of the picker should land: opening it from the pause menu means you
  // are mid-run and cancelling should drop you back into it, not throw the run away.
  let selectFrom = 'menu', selectSnap = null;
  function cancelSelect() {
    if (selectSnap) {
      loadout.wp = selectSnap.wp; loadout.slots = selectSnap.slots.slice();
      // The arena was applied the moment it was clicked -- it is the preview behind the
      // panel -- so backing out has to put the old one back, not just the old label.
      if (loadout.map !== selectSnap.map) setMap(selectSnap.map);
      paintPick();
    }
    SFX.ui('back'); setScene(selectFrom);
  }
  function startRun() {
    world = newWorld((Math.random() * 1e9) | 0, loadout);
    sel = 0; buildBar(); paused = false; slow = false;
    setScene('play');
    SFX.fanfare();
  }

  // ---- The picker ----------------------------------------------------------
  // Arenas are a radio group, weapons are a radio group, skills are a queue of three.
  // Choosing a fourth skill replaces the oldest pick rather than refusing the click --
  // refusing is the version where you have to work out which of your own three to drop
  // before the UI will talk to you.
  const mpGrid = document.getElementById('mpGrid');
  const mpHead = document.getElementById('mpHead');
  const wpGrid = document.getElementById('wpGrid');
  const skGrid = document.getElementById('skGrid');
  const wpNote = document.getElementById('wpNote');
  const skHead = document.getElementById('skHead');
  const btnEnter = document.getElementById('btnEnter');
  function pickTile(theme, key, name, meta, aria) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pick';
    b.style.setProperty('--accent', theme[0]);
    b.setAttribute('aria-label', aria);
    const icon = document.createElement('canvas');
    icon.width = 32; icon.height = 32; icon.setAttribute('aria-hidden', 'true');
    const nm = document.createElement('s'); nm.textContent = name;
    const md = document.createElement('em'); md.textContent = meta;
    const kb = document.createElement('u'); kb.textContent = key;
    b.append(icon, nm, md, kb);
    b.addEventListener('mousedown', ev => ev.preventDefault());
    return { b, icon, kb };
  }
  // Applying an arena re-bakes 3.7M floor pixels plus the whole prop field, so it happens
  // on the click rather than on ENTER: the arena behind the panel *is* the preview. The
  // particle list is dropped because it belongs to the map that spawned it -- ice's flakes
  // would otherwise be recycled by lava's ember pass and drift upward as snow.
  function setMap(id) {
    loadout.map = id;
    applyMap(id);
    if (world && world.amb) world.amb.length = 0;
  }
  const mpTiles = MAPS.map(m => {
    const t = pickTile([m.amb.lm, m.amb.glow, m.tone.floor[3]], '', m.label, m.desc,
                       `Sân đấu: ${m.name}`);
    drawMapIcon(t.icon, m);
    t.b.title = `${m.name}\n${m.desc}\nTab để lật sân`;
    t.b.onclick = () => { setMap(m.id); SFX.ui('click'); paintPick(); };
    mpGrid.appendChild(t.b);
    return t;
  });
  // Tab cycles arenas, and the digits stay with the weapons: there are five weapons and a
  // growing number of maps, so the key that has to scale is the one the maps get.
  function cycleMap(step) {
    const at = MAPS.findIndex(m => m.id === loadout.map);
    setMap(MAPS[(at + step + MAPS.length) % MAPS.length].id);
    SFX.ui('click'); paintPick();
  }
  const wpTiles = WEAPONS.map((wp, i) => {
    const t = pickTile(WEAPON_THEMES[wp.id] || WEAPON_THEMES.kiem, String(i + 1),
                       wp.label, wp.desc, `Vũ khí ${i + 1}: ${wp.name}`);
    drawWeaponIcon(t.icon, wp);
    t.b.title = `${wp.name}\n${weaponStat(wp)}\nHồi ${wp.cd.toFixed(2)}s`;
    t.b.onclick = () => { loadout.wp = wp; SFX.ui('click'); SFX.cast(wp.id, 0); paintPick(); };
    wpGrid.appendChild(t.b);
    return t;
  });
  const skTiles = SKILLS.map((sk, i) => {
    const t = pickTile(ICON_THEMES[sk.id], '', sk.name, modeLabel(sk) + ' · ' + sk.cd.toFixed(2) + 's',
                       `Skill: ${sk.name}`);
    drawSkillIcon(t.icon, sk);
    t.b.title = `${sk.name} · ${sk.id}\nHồi chiêu ${sk.cd.toFixed(2)} giây`;
    t.b.onclick = () => { toggleSkill(i); };
    skGrid.appendChild(t.b);
    return t;
  });
  function toggleSkill(i) {
    const at = loadout.slots.indexOf(i);
    if (at >= 0) { loadout.slots.splice(at, 1); SFX.ui('back'); }
    else {
      loadout.slots.push(i);
      if (loadout.slots.length > 3) loadout.slots.shift();
      SFX.ui('click');
    }
    paintPick();
  }
  function paintPick() {
    mpTiles.forEach((t, i) => {
      const on = MAPS[i].id === loadout.map;
      t.b.classList.toggle('on', on);
      t.b.setAttribute('aria-pressed', on ? 'true' : 'false');
      t.kb.textContent = on ? 'XEM' : '';
    });
    wpTiles.forEach((t, i) => {
      const on = WEAPONS[i] === loadout.wp;
      t.b.classList.toggle('on', on);
      t.b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    skTiles.forEach((t, i) => {
      const at = loadout.slots.indexOf(i);
      t.b.classList.toggle('on', at >= 0);
      t.b.setAttribute('aria-pressed', at >= 0 ? 'true' : 'false');
      t.kb.textContent = at >= 0 ? String(at + 1) : '';
    });
    const n = loadout.slots.length;
    mpHead.textContent = '1 · CHỌN SÂN ĐẤU  (' + MAPDEF.label + ')';
    skHead.textContent = `3 · CHỌN 3 SKILL  (${n}/3)`;
    btnEnter.disabled = n !== 3;
    // From the pause menu this button starts a *new* run, so it says so rather than
    // letting you believe the change is being dropped into the fight you were in.
    btnEnter.textContent = n !== 3 ? `CHỌN THÊM ${3 - n} SKILL`
      : (selectFrom === 'pause' ? 'VÀO TRẬN MỚI (ENTER)' : 'VÀO TRẬN (ENTER)');
  }
  paintPick();

  // Art loads while the picker is open, and the note says so: a swing before the sheets
  // arrive still lands, it just draws the procedural crescent instead of the painted one.
  function artNote() {
    const p = ART.progress();
    if (p >= 1) {
      wpNote.textContent = ART.failed()
        ? `Thiếu ${ART.failed()} khung hiệu ứng — dùng hiệu ứng dự phòng.`
        : 'Hiệu ứng đánh thường đã tải xong.';
    } else wpNote.textContent = `Đang tải khung hiệu ứng… ${Math.round(p * 100)}%`;
  }
  artNote();
  ART.preload(() => artNote());

  // The guide lists the live tables, so a new weapon or skill shows up in it for free.
  const guideWeapons = document.getElementById('guideWeapons');
  WEAPONS.forEach((wp, i) => {
    const row = document.createElement('div');
    row.className = 'gsk';
    const key = document.createElement('kbd'); key.textContent = String(i + 1);
    const nm = document.createElement('s'); nm.textContent = wp.name;
    const md = document.createElement('em');
    md.textContent = `${weaponStat(wp)} · ${wp.cd.toFixed(2)}s`;
    row.append(key, nm, md);
    guideWeapons.appendChild(row);
  });
  const guideSkills = document.getElementById('guideSkills');
  SKILLS.forEach((sk, i) => {
    const row = document.createElement('div');
    row.className = 'gsk';
    const key = document.createElement('kbd');
    key.textContent = String(i + 1).padStart(2, '0');
    const nm = document.createElement('s'); nm.textContent = sk.name;
    const md = document.createElement('em');
    md.textContent = modeLabel(sk) + ' · ' + sk.cd.toFixed(2) + 's';
    row.append(key, nm, md);
    guideSkills.appendChild(row);
  });
  // Bestiary, built from the live KIND/FOE_ABIL tables: one row per monster naming its
  // move, the shape of the mark it paints and how long you get to leave it.
  const SHAPE_VI = { circle: 'vòng tròn', cone: 'hình quạt', line: 'đường thẳng',
                     sweep: 'quét cung', rain: 'mưa rơi', veins: 'rễ nứt',
                     smite: 'giáng liên hồi', web: 'mạng lưới', sigil: 'ấn phù',
                     waves: 'sóng dồn', blades: 'làn cong', spiral: 'xoáy ốc',
                     vortex: 'lốc xoáy', echo: 'theo vết đi', spokes: 'nan hoa' };
  const guideFoes = document.getElementById('guideFoes');
  Object.keys(KIND).forEach(k => {
    const K = KIND[k];
    (K.abil || []).forEach((ak, j) => {
      const A = FOE_ABIL[ak];
      if (!A) return;
      const row = document.createElement('div');
      row.className = 'gsk';
      const key = document.createElement('kbd');
      key.textContent = j === 0 ? String(K.hp) : '↳';
      const nm = document.createElement('s');
      nm.textContent = (j === 0 ? K.label : '') + ' · ' + A.name;
      const md = document.createElement('em');
      const size = A.shape === 'line' ? `dài ${A.len}` : `bán kính ${A.r}`;
      md.textContent = `${SHAPE_VI[A.shape]} ${size} · báo ${A.tell.toFixed(2)}s · `
        + `${A.dmg}${A.ticks ? '×' + A.ticks.length : ''} dmg`
        + (A.suicide ? ' · tự sát' : '') + (A.linger ? ' · để lại vũng' : '');
      row.append(key, nm, md);
      guideFoes.appendChild(row);
    });
  });

  overlay.addEventListener('click', ev => {
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled) return;
    switch (b.dataset.act) {
      case 'start': SFX.ui('click'); setScene('select'); break;
      case 'loadout': SFX.ui('click'); setScene('select'); break;
      case 'enter': case 'restart': startRun(); break;
      case 'resume': SFX.ui('click'); setScene('play'); break;
      case 'guide': SFX.ui('click'); setScene('guide'); break;
      case 'mobile': SFX.ui('click'); setMob(!mobOn); break;
      case 'touch': SFX.ui('click'); setScene('touch'); break;
      case 'treset': SFX.ui('back'); resetTcfg(); break;
      case 'back': SFX.ui('back'); setScene(backTo); break;
      case 'home': if (scene === 'select') cancelSelect();
                   else { SFX.ui('back'); setScene('menu'); }
                   break;
    }
  });
  overlay.addEventListener('pointerover', ev => {
    if (ev.target.closest('.mbtn')) SFX.ui('hover');
  });
  function toggleMenu() {
    if (scene === 'play') { SFX.ui('back'); setScene('pause'); }
    else if (scene === 'guide' || scene === 'touch') { SFX.ui('back'); setScene(backTo); }
    else if (scene === 'pause') { SFX.ui('click'); setScene('play'); }
    else SFX.ui('hover');
  }
  function toggleGuide() {
    if (scene === 'guide') { SFX.ui('back'); setScene(backTo); }
    else { SFX.ui('click'); setScene('guide'); }
  }
  const btnMenu = document.getElementById('btnMenu');
  const btnGuide = document.getElementById('btnGuide');
  btnMenu.onclick = ev => { ev.currentTarget.blur(); toggleMenu(); };
  btnGuide.onclick = ev => { ev.currentTarget.blur(); toggleGuide(); };

  // ---- Mixer ---------------------------------------------------------------
  const soundBox = document.getElementById('soundBox');
  const btnSound = document.getElementById('btnSound');
  const muteBtn = document.createElement('button');
  muteBtn.type = 'button'; muteBtn.className = 'mbtn';
  soundBox.appendChild(muteBtn);
  function sliderRow(label, get, set) {
    const row = document.createElement('div'); row.className = 'srow';
    const name = document.createElement('b'); name.textContent = label;
    const rng = document.createElement('input');
    rng.type = 'range'; rng.min = '0'; rng.max = '100'; rng.step = '1';
    rng.value = String(Math.round(get() * 100));
    rng.setAttribute('aria-label', label);
    const val = document.createElement('u'); val.textContent = rng.value + '%';
    rng.oninput = () => { set(+rng.value / 100); val.textContent = rng.value + '%'; };
    rng.onchange = () => SFX.ui('hover');
    row.append(name, rng, val);
    soundBox.appendChild(row);
  }
  sliderRow('NHẠC', () => SFX.state.mus, v => SFX.setMus(v));
  sliderRow('HIỆU ỨNG', () => SFX.state.sfx, v => SFX.setSfx(v));
  function paintSound() {
    const on = SFX.state.on;
    muteBtn.textContent = 'ÂM THANH: ' + (on ? 'BẬT' : 'TẮT');
    btnSound.textContent = (on ? '♪' : '✕') + ' ÂM THANH: ' + (on ? 'BẬT' : 'TẮT');
  }
  function toggleSound() {
    SFX.setOn(!SFX.state.on);
    paintSound();
    if (SFX.state.on) { SFX.music(scene === 'play' ? 'play' : 'menu'); SFX.ui('click'); }
  }
  muteBtn.onclick = toggleSound;
  btnSound.onclick = ev => { ev.currentTarget.blur(); toggleSound(); };
  paintSound();
  // Audio may only start from a gesture, so the first one anywhere wakes the mixer.
  const wake = () => { SFX.unlock(); SFX.music(scene === 'play' ? 'play' : 'menu'); };
  window.addEventListener('pointerdown', wake, { once: true });
  window.addEventListener('keydown', wake, { once: true });

  // The mouse is a *screen* position, and the world scrolls under it, so it is stored in
  // screen space and converted through the integer camera at the moment it is used. Doing
  // it the other way round (storing a world point) would leave the cursor aiming at
  // wherever the ground used to be as soon as the camera moved.
  function aimPoint(ev) {
    const r = screen.getBoundingClientRect();
    return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H };
  }
  const aim = { sx: W * 0.66, sy: H * 0.5 };
  function aimWorld() {
    // Chế độ điện thoại không có con trỏ nào để đọc, nên điểm ngắm do `touchAim()` suy ra. Đổi ở
    // *đây*, một chỗ, vì mọi thứ cần điểm ngắm -- fire(), hướng lướt, tiếng pan trái phải -- đều
    // đi qua hàm này.
    //
    // Đang giữ để ngắm thì tính lại từ chính chỗ ngón đang đặt, mỗi khung: người chơi vẫn đẩy
    // joystick trong lúc ngắm, nên một điểm chốt cứng lúc pointermove sẽ trôi lại phía sau người
    // -- vòng ngắm phải bám theo nhân vật đúng như một vòng cảnh báo bám theo con quái vẽ ra nó.
    if (mobOn) return hold.on ? holdTrack(hold.cx, hold.cy) : touchAim();
    const c = camInt(world);
    return { x: aim.sx + c.x, y: aim.sy + c.y };
  }
  screen.addEventListener('mousemove', ev => {
    if (mobOn) return;
    const a = aimPoint(ev); aim.sx = a.x; aim.sy = a.y;
  });
  // Left button attacks, right button dashes. Right-click is the second-most reachable
  // input there is and it was doing nothing; a dodge you have to take your hand off the
  // movement keys for is a dodge you will not use.
  //
  // Ở chế độ điện thoại thì bỏ qua: trình duyệt cảm ứng còn phát một cặp mousedown/mouseup giả
  // sau mỗi lần chạm, nên một cú chạm vào joystick sẽ vung kiếm thêm một nhát không ai gọi.
  screen.addEventListener('mousedown', ev => {
    if (mobOn) return;
    ev.preventDefault();
    fire(ev.button === 2 ? DASH_SLOT : 0);
  });
  screen.addEventListener('contextmenu', ev => ev.preventDefault());
  // One entry point for every way of attacking: slot 0 is the weapon, 1-3 are the skills
  // this run was built with, 4 is the dash. `swing` plays its own voice (it is fired from
  // the sim side too), so only the cast path announces itself here.
  //
  // `at` là điểm ngắm đã chốt sẵn -- chỉ chế độ ngắm bằng ngón tay truyền vào. Mọi đường còn lại
  // để trống và lấy `aimWorld()`, nên vẫn chỉ có một chỗ suy ra điểm ngắm.
  function fire(n, at) {
    if (scene !== 'play') return;
    sel = n; paint();
    const a = at || aimWorld();
    const c = camInt(world);
    const pan = clamp((a.x - c.x - W * 0.5) / (W * 0.5), -1, 1);
    if (n === 0) {
      if (swing(world, a.x, a.y)) {
        titleEl.textContent = world.wp.name;
        titleEl.style.opacity = 1;
        titleT = 0.6;
      } else SFX.blocked();
      return;
    }
    if (n === DASH_SLOT) {
      // Direction is the movement keys if any are held, and the aim if none are: a player
      // running left and hitting dash means "further left", and a player standing still
      // means "get me over there".
      //
      // Joystick cộng vào cùng chỗ với WASD -- đang đẩy cần thì lướt đi theo cần, và câu trên
      // vẫn đúng nguyên văn cho ngón tay.
      //
      // Nhưng một điểm ngắm truyền thẳng vào (`at`) thì *thắng* cả cần lẫn phím: nó chỉ tới từ chế
      // độ giữ-rồi-kéo, tức là người chơi vừa kéo một vòng ngắm ra đúng chỗ muốn hạ chân. Để cần
      // điều khiển -- thứ mà ngón trái vẫn đang tì lên vì còn phải chạy -- phủ quyết cái đó là xoá
      // luôn thao tác vừa làm. Chia lại cho 0,75 để đảo đúng phép nén mà `dash()` sẽ áp vào.
      let dx = 0, dy = 0;
      if (!at) {
        dx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0) + stick.dx;
        dy = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0) + stick.dy;
      }
      if (!dx && !dy) { dx = a.x - world.hero.x; dy = (a.y - world.hero.y) / 0.75; }
      if (dash(world, dx, dy)) {
        SFX.dash(pan);
        titleEl.textContent = DASH_SK.name;
        titleEl.style.opacity = 1;
        titleT = 0.5;
      } else SFX.blocked();
      return;
    }
    const i = loadout.slots[n - 1];
    if (cast(world, i, a.x, a.y)) {
      titleEl.textContent = SKILLS[i].name;
      titleEl.style.opacity = 1;
      titleT = 0.9;
      SFX.cast(SKILLS[i].id, SKILLS[i].mode === 'self' ? 0 : pan);
    } else SFX.blocked();
  }

  // ---- Phím cảm ứng --------------------------------------------------------
  // Không có đường đi riêng nào vào sim: joystick chỉ ghi vào `stick` mà frame() cộng thẳng vào
  // `inp.dx/dy` như WASD, và năm cái nút gọi đúng `fire()` mà chuột với bàn phím gọi. Nhờ vậy
  // một chiêu bấm bằng ngón tay và cùng chiêu đó bấm bằng số 1 là *đúng* một thứ -- không có
  // nhánh "bản mobile" nào để hai bên trôi ra khỏi nhau. Bốn phần tử của lớp này lấy ở đầu file,
  // cạnh `touchLayer` -- xem lý do TDZ ở đó.
  // dx/dy đã chuẩn hoá về vector đơn vị. `step()` tự chuẩn hoá lần nữa nên nghiêng ít hay nhiều
  // không đổi tốc độ chạy, và đó là cố ý: nửa tốc độ trên màn cảm ứng chỉ là nửa tốc độ *sai*
  // với mọi con số né đòn mà cả game được cân theo.
  const stick = { on: false, id: -1, hx: 0, hy: 0, dx: 0, dy: 0 };
  const STICK_DEAD = 0.16;
  let atkHeld = false;
  function placeKnob(kx, ky) { tknob.style.left = kx + 'px'; tknob.style.top = ky + 'px'; }
  // Bệ đứng **một chỗ**, đúng như joystick của mọi game MOBA. Mặc định cách hai mép 0,28 lần đường
  // kính: sát mép thì bờ máy chặn mất một phần cung ngón cái quét được, và trên máy màn cong thì
  // mất cả cảm giác chạm. Đo bằng chính phần tử chứ không tính lại từ --js: cỡ đó do CSS chốt.
  //
  // Người chơi tự đặt thì đổi tỉ lệ viewport về px của #tstick rồi **kẹp lại trong vùng nhận**:
  // vùng nhận là nửa dưới bên trái, và một cái bệ vẽ ra ngoài nó là một cần điều khiển bấm không
  // ăn -- tệ hơn cả chỗ mặc định, vì nó *trông* như bấm được.
  function stickHome() {
    const r = tstick.getBoundingClientRect(), D = tbase.offsetWidth;
    if (!r.width || !D) return;                 // lớp đang ẩn -- đo lại lúc vào trận
    const pad = D * 0.28, m = D * 0.5;
    let hx = m + pad, hy = r.height - m - pad;
    if (tcfg.jx !== null) {
      const doc = document.documentElement;
      hx = tcfg.jx * doc.clientWidth - r.left;
      hy = tcfg.jy * doc.clientHeight - r.top;
    }
    // clamp() trả về `a` khi a > b, nên hai cái max() ở đây không phải cho đẹp: trên một vùng nhận
    // hẹp hơn cả cái bệ thì lo > hi, và không có max() thì bệ nhảy về đúng mép trái.
    stick.hx = clamp(hx, m, Math.max(m, r.width - m));
    stick.hy = clamp(hy, m, Math.max(m, r.height - m));
    tbase.style.left = stick.hx + 'px'; tbase.style.top = stick.hy + 'px';
    if (!stick.on) placeKnob(stick.hx, stick.hy);
  }
  // Cụm nút phải: ô nào người chơi *chưa* dời thì xoá sạch style inline và để CSS đặt nó trên cung
  // -- "chưa đặt" là xoá đi, không phải ghi lại đúng con số mặc định vào đó, vì hai chỗ cùng giữ một
  // con số là hai chỗ để chúng lệch nhau (bản trước của minimap đã trả giá đúng chuyện này).
  //
  // Ô đã dời thì đổi từ tỉ lệ viewport về px của #tacts. Neo đó là một hộp 0x0 bám góc dưới phải,
  // nên left/top của nó *là* tâm cung, và một phép trừ ở đây là đủ -- không phải bốc nút ra khỏi
  // cụm để đặt theo viewport. Kẹp theo *nửa nút của chính nó*: một nút nằm nửa ngoài màn hình vẫn
  // trông như bấm được, và đó là kiểu hỏng tệ nhất -- nó chỉ lộ ra lúc cần bấm thật.
  function actsPlace() {
    if (touchLayer.hidden) return;              // lớp đang ẩn: cỡ đo ra 0, đặt lại lúc hiện
    const doc = document.documentElement, vw = doc.clientWidth, vh = doc.clientHeight;
    const r = tacts.getBoundingClientRect();
    for (let n = 0; n < tbtn.length; n++) {
      const el = tbtn[n], p = tcfg.b[n], st = el.style;
      if (!p) {
        st.removeProperty('left'); st.removeProperty('top');
        st.removeProperty('right'); st.removeProperty('bottom'); st.removeProperty('translate');
        continue;
      }
      const m = el.offsetWidth * 0.5;
      const cx = clamp(p.x * vw, m, Math.max(m, vw - m));
      const cy = clamp(p.y * vh, m, Math.max(m, vh - m));
      st.right = 'auto'; st.bottom = 'auto';
      st.left = Math.round(cx - r.left) + 'px';
      st.top = Math.round(cy - r.top) + 'px';
      // Ghi đè `translate` của cung: nút này không còn ở trên cung nữa, và -50% là để left/top vừa
      // ghi ở trên là *tâm* nút -- cùng một quy ước với cái bệ, nên một chỗ đặt đọc được ở cả hai.
      st.translate = '-50% -50%';
    }
  }
  // Hướng đi là vector từ *tâm bệ* tới ngón, núm kẹp ở vành. Bản trước cho bệ chạy theo ngón khi
  // trượt quá vành, và hậu quả đúng như một cần điều khiển không có chỗ cố định: kéo được đi khắp
  // màn hình, và vì "giữa" luôn nằm ở chỗ ngón vừa rời khỏi nên không bao giờ cảm được mình đang
  // đẩy hướng nào mà không nhìn xuống tay.
  function stickTo(cx, cy) {
    const R = tbase.offsetWidth * 0.5;
    let dx = cx - stick.hx, dy = cy - stick.hy;
    const l = Math.hypot(dx, dy);
    if (l > R && l > 0) { dx *= R / l; dy *= R / l; }
    placeKnob(stick.hx + dx, stick.hy + dy);
    // Vùng chết: đặt ngón xuống rồi lệch vài điểm ảnh là tay không vững, không phải ý muốn đi.
    if (R <= 0 || l / R < STICK_DEAD) { stick.dx = 0; stick.dy = 0; }
    else { stick.dx = dx / l; stick.dy = dy / l; }
  }
  tstick.addEventListener('pointerdown', ev => {
    // Đang sắp xếp thì cả vùng nhận là một chỗ để *kéo* cái bệ, không phải để lái: một cần điều
    // khiển vừa lái vừa dời chỗ thì mỗi lần dời là một lần nhân vật chạy sang bên kia màn hình.
    if (tedit) { editDown('stick', ev); return; }
    if (stick.on) return;
    ev.preventDefault();
    stick.on = true; stick.id = ev.pointerId;
    // Bắt pointer để ngón có thể trượt ra khỏi vùng nhận mà vẫn còn là *ngón này*: không bắt thì
    // trượt qua nửa phải màn hình là mất luôn `pointerup`, và nhân vật chạy mãi một hướng.
    try { tstick.setPointerCapture(ev.pointerId); } catch (e) { /* không bắt được thì thôi */ }
    tstick.classList.add('on');
    const r = tstick.getBoundingClientRect();
    stickTo(ev.clientX - r.left, ev.clientY - r.top);
  });
  tstick.addEventListener('pointermove', ev => {
    if (!stick.on || ev.pointerId !== stick.id) return;
    ev.preventDefault();
    const r = tstick.getBoundingClientRect();
    stickTo(ev.clientX - r.left, ev.clientY - r.top);
  });
  function stickEnd(ev) {
    if (!stick.on || (ev && ev.pointerId !== stick.id)) return;
    stick.on = false; stick.id = -1; stick.dx = 0; stick.dy = 0;
    tstick.classList.remove('on');
    placeKnob(stick.hx, stick.hy);
  }
  tstick.addEventListener('pointerup', stickEnd);
  tstick.addEventListener('pointercancel', stickEnd);

  // Nhãn trong nút: ba skill giữ đúng con số của hotkey trên desktop, nên đọc hướng dẫn viết cho
  // bàn phím vẫn khớp với thứ đang thấy dưới ngón tay.
  const T_LABEL = ['ĐÁNH', '1', '2', '3', 'NÉ'];
  function buildTouch() {
    tacts.textContent = '';
    tbtn.length = 0;
    // Chỗ đứng của từng nút do CSS quyết -- `.tb[data-slot=N]` khai một vector đơn vị và một bán
    // kính cung. Nên ở đây không còn hàng nào để dựng, và thứ tự trong DOM chỉ còn là thứ tự đọc
    // của trình đọc màn hình. Hai hàng ngang của bản trước buộc ngón cái đi thẳng, còn khớp ở gốc
    // bàn tay thì chỉ quay được thành *cung*: đó là toàn bộ lý do mọi game MOBA xếp kiểu này.
    for (let n = 0; n < BAR_N; n++) {
      const { weapon, isDash, sk, theme } = slotInfo(n);
      // Ngắm được: mọi thứ có *hướng* để chọn. Lướt né có -- và tầm của nó ngắn hơn hẳn ba skill,
      // đúng 62 px mà `dash()` thật sự đi. Chỉ đánh thường thì không: nó tự chọn con quái gần nhất
      // và bấm liên tục, thêm một nhịp chờ nhả tay vào đó là làm chậm đúng nhịp nền của cả trận.
      //
      // Chạm-rồi-nhả *không kéo* vẫn ra đòn ngay như cũ (xem `hold.drag` trong holdEnd), nên cú né
      // gấp không mất gì: chỉ khi ngón đi quá AIM_DEAD thì đây mới thành một cú ngắm.
      const aimable = !weapon && (isDash || sk.mode !== 'self');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tb';
      b.dataset.slot = String(n);
      b.style.setProperty('--accent', theme[0]);
      b.style.setProperty('--deep', theme[2]);
      b.setAttribute('aria-label',
        (weapon ? 'Đánh thường: ' : isDash ? 'Lướt né: ' : `Skill ${n}: `) + sk.name
        + (aimable ? ' (giữ để ngắm)' : ''));
      const icon = document.createElement('canvas');
      icon.width = 32; icon.height = 32; icon.setAttribute('aria-hidden', 'true');
      if (weapon) drawWeaponIcon(icon, sk); else drawSkillIcon(icon, sk);
      const mask = document.createElement('span'); mask.className = 'cooldown-mask';
      const val = document.createElement('span'); val.className = 'cooldown-value';
      const lab = document.createElement('u'); lab.textContent = T_LABEL[n];
      b.append(icon, mask, val, lab);
      // pointerdown, không phải click: trên cảm ứng click chỉ đến *sau khi nhả tay*, và một
      // chiêu ra sau khi ngón đã rời màn hình là một chiêu ra sai nhịp -- đúng thứ mà cả hệ
      // thống cảnh báo trên sàn đang dạy người chơi đọc.
      b.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        // Đang sắp xếp thì chạm vào nút nào là kéo *đúng nút đó*: cung trong CSS chỉ là chỗ đứng
        // mặc định, còn chỗ ngón cái với tới thật thì mỗi bàn tay một khác -- và dời cả cụm không
        // nói được "lướt né sang hẳn mép trái, ba skill sát nhau lại".
        if (tedit) { editDown(n, ev); return; }
        if (aimable) { holdStart(n, b, ev); return; }
        if (n === 0) atkHeld = true;
        fire(n);
      });
      if (aimable) {
        b.addEventListener('pointermove', holdMove);
        b.addEventListener('pointerup', holdUp);
        // pointercancel là hệ điều hành lấy lại ngón (cuộc gọi tới, cử chỉ hệ thống). Đó *không*
        // phải lệnh tung chiêu, nên nó huỷ chứ không nhả -- mất chiêu vì có người gọi điện là
        // mất một lần hồi chiêu mà người chơi không hề bấm.
        b.addEventListener('pointercancel', () => holdEnd(false));
      } else if (n === 0) {
        // Giữ nút đánh thường thì frame() tự đánh tiếp mỗi lần hết hồi (xem `atkHeld` dưới):
        // bấm nhả cho đúng nhịp 0.3 giây là việc của máy, không phải của ngón tay.
        const up = () => { atkHeld = false; };
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
        b.addEventListener('pointerleave', up);
      }
      tacts.appendChild(b);
      tbtn.push(b);
      slotFaces[n].push({ cell: b, mask, value: val });
    }
    // Nút vừa dựng lại thì chỗ đặt riêng của từng ô cũng phải đặt lại: buildTouch() chạy mỗi lần
    // đổi vũ khí / skill, và không gọi ở đây thì cụm nhảy về cung mặc định sau mỗi lần đổi loadout.
    actsPlace();
  }
  document.getElementById('tpause').addEventListener('pointerdown', ev => {
    ev.preventDefault(); toggleMenu();
  });

  // Không có con trỏ thì ngắm phải *tự động*, và nó lấy theo ba nguồn vì chiêu 'dir'/'point'
  // cần một điểm có nghĩa: con còn sống gần nhất trong tầm nhìn, rồi hướng joystick, rồi hướng
  // đang nhìn. Bán kính chặn ở AIM_R vì `cast()` không kẹp tầm -- ngắm con quái ở cuối map là
  // cho nổ một chiêu ngoài màn hình. Khoảng cách đo trên trục y đã nén 0.75 đúng như mọi phép
  // đo tầm khác của game, nên "gần nhất" ở đây và "trúng" ở hitCone là cùng một hình học.
  const AIM_R = 170, mobAim = { x: 0, y: 0 };
  function touchAim() {
    const h = world.hero;
    let best = null, bd = AIM_R * AIM_R;
    for (const f of world.foes) {
      if (f.dying) continue;
      const dx = f.x - h.x, dy = (f.y - h.y) / 0.75, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = f; }
    }
    if (best) { mobAim.x = best.x; mobAim.y = midY(best); }
    else if (stick.dx || stick.dy) {
      mobAim.x = h.x + stick.dx * 70; mobAim.y = h.y + stick.dy * 70 * 0.75;
    } else { mobAim.x = h.x + (h.flip ? -70 : 70); mobAim.y = h.y; }
    return mobAim;
  }

  // ---- Giữ để ngắm ---------------------------------------------------------
  // Chạm rồi nhả ngay = tung nhanh vào chỗ `touchAim()` chọn. Giữ rồi kéo = tự ngắm, và vòng
  // ngắm trên sàn *là* câu trả lời cho "chiêu này sẽ nổ ở đâu": nó vẽ bằng đúng những nét mà
  // cảnh báo của quái đang dùng, nên người chơi không phải học một ngôn ngữ hình thứ hai.
  //
  // Ngưỡng AIM_DEAD tính bằng px CSS: dưới ngưỡng thì đây vẫn là một cú *chạm*, không phải một
  // lần ngắm -- tay không có ai giữ yên tuyệt đối được, và một cú chạm hoá thành "ngắm 3 px chệch
  // sang phải" là mất một chiêu. Kéo hết AIM_DRAG lần bề rộng nút thì tới tầm xa nhất; lấy theo
  // cỡ nút nên máy màn to hay nhỏ đều cùng một cử chỉ.
  const AIM_DEAD = 12, AIM_DRAG = 2.0, AIM_MAX = 150;
  const hold = { on: false, n: -1, id: -1, el: null, ox: 0, oy: 0, cx: 0, cy: 0, drag: false };
  // Thứ render.js đọc để vẽ. `world.aimUI` không tồn tại lúc chạy trong node vm, nên ở đó
  // `drawAimCue` là một lệnh không làm gì -- không có nhánh nào phải thêm cho harness.
  //
  // `r` là tầm, `ky` là hệ số nén trục y của *chính thứ đang ngắm*, `fix` là "luôn hết tầm".
  // Ba con số thay cho ba nhánh `if (đang ngắm lướt né)` rải trong hàm vẽ: nơi duy nhất biết lướt
  // né khác skill ở đâu là holdStart, và render.js chỉ vẽ theo con số nó nhận được.
  const aimUI = { on: false, mode: 'point', fix: false, x: 0, y: 0, hx: 0, hy: 0, k: 0,
                  r: AIM_MAX, ky: GSQ, col: 0 };
  function holdStart(n, el, ev) {
    if (scene !== 'play' || paused) return;
    const { isDash, gi, sk, theme } = slotInfo(n);
    // Chiêu đang hồi thì không vào chế độ ngắm: ngắm xong mới biết mình bấm không được là mất
    // đúng cái nhịp vừa dùng để ngắm. Lướt né đếm hồi ở `world.dcd` chứ không trong `world.cds`.
    if ((isDash ? world.dcd : world.cds[gi]) > 0) { SFX.blocked(); return; }
    if (hold.on) holdEnd(false);
    hold.on = true; hold.n = n; hold.id = ev.pointerId; hold.el = el; hold.drag = false;
    hold.ox = ev.clientX; hold.oy = ev.clientY;
    hold.cx = ev.clientX; hold.cy = ev.clientY;
    try { el.setPointerCapture(ev.pointerId); } catch (e) { /* không bắt được thì thôi */ }
    el.classList.add('aiming');
    sel = n; paint();
    aimUI.on = true;
    // Lướt né vẽ như chiêu 'point' -- có một tâm ngắm, vì thứ người chơi muốn thấy là *chỗ chân sẽ
    // hạ* -- nhưng `fix` như chiêu 'dir', vì cú lướt luôn đi hết 62 px chứ không đi ngắn lại theo
    // ngón. Nên cái chọn được chỉ là hướng, còn tâm ngắm nằm đúng chỗ sẽ tới.
    //
    // Tầm là DASH_LEN thật, và trục y nén 0,75 -- tỉ lệ của phép đi lại, không phải GSQ của hình vẽ
    // trên sàn. Hai con số này là lý do vòng của lướt né nhỏ hơn hẳn vòng của ba skill: nó không
    // phải một lựa chọn thẩm mỹ mà là đúng tập những chỗ chân hạ xuống được. Một vòng ngắm hứa xa
    // hơn chỗ thật, trên một chiêu mà cả công dụng là ra khỏi vùng nổ, là một cái bẫy.
    aimUI.mode = isDash ? 'point' : sk.mode;
    aimUI.fix = isDash || sk.mode === 'dir';
    aimUI.r = isDash ? DASH_LEN : AIM_MAX;
    aimUI.ky = isDash ? 0.75 : GSQ;
    aimUI.col = hexc(theme[0]);
    world.aimUI = aimUI;
    holdTrack(ev.clientX, ev.clientY);
  }
  // Điểm ngắm nằm trên *ellipse* bán trục (r, r * ky), không phải trên vòng tròn: sàn nhìn nghiêng
  // nên mọi hình vẽ trên sàn của cả game đều nén trục y. Vẽ vòng tròn thật ở đây là hứa một vùng mà
  // chiêu không nổ tới.
  function holdTrack(cx, cy) {
    const h = world.hero, u = (hold.el && hold.el.offsetWidth) || 56;
    let dx = cx - hold.ox, dy = cy - hold.oy;
    const l = Math.hypot(dx, dy), span = Math.max(1, u * AIM_DRAG - AIM_DEAD);
    aimUI.hx = h.x; aimUI.hy = h.y;
    if (l < AIM_DEAD) {
      // Chưa kéo: vòng tầm hiện ra, còn mục tiêu thì vẫn là mục tiêu tự động -- nhả tay ngay lúc
      // này phải ra đúng chiêu mà một cú chạm ra, không phải một chiêu bay vào chân mình. Kéo ra
      // rồi kéo về lại đây cũng là quay về đúng cú chạm đó: đổi ý vẫn còn kịp.
      const a = touchAim();
      aimUI.k = 0; aimUI.x = a.x; aimUI.y = a.y;
      hold.drag = false;
      return aimUI;
    }
    // Chiêu 'dir' (và lướt né) chỉ cần *hướng*: kéo dài thêm không có nghĩa gì, nên nó luôn chỉ hết
    // tầm và cái người chơi điều khiển là góc. Chiêu 'point' thì kéo bao xa là nổ bấy xa.
    hold.drag = true;
    const k = aimUI.fix ? 1 : c01((l - AIM_DEAD) / span);
    aimUI.k = k;
    aimUI.x = h.x + dx / l * aimUI.r * k;
    aimUI.y = h.y + dy / l * aimUI.r * aimUI.ky * k;
    return aimUI;
  }
  function holdMove(ev) {
    if (!hold.on || ev.pointerId !== hold.id) return;
    ev.preventDefault();
    hold.cx = ev.clientX; hold.cy = ev.clientY;
    holdTrack(ev.clientX, ev.clientY);
  }
  function holdUp(ev) {
    if (!hold.on || ev.pointerId !== hold.id) return;
    ev.preventDefault();
    holdEnd(true);
  }
  // `cast` chỉ khi nhả tay có nghĩa là nhả tay. Điểm ngắm truyền thẳng vào `fire(n, at)` chứ
  // không đi qua `aimWorld()`: hai đường tính lại cùng một điểm là hai chỗ để chúng lệch nhau.
  function holdEnd(go) {
    if (!hold.on) return;
    const n = hold.n, el = hold.el, drag = hold.drag, at = { x: aimUI.x, y: aimUI.y };
    hold.on = false; hold.n = -1; hold.id = -1; hold.el = null; hold.drag = false;
    aimUI.on = false;
    if (el) el.classList.remove('aiming');
    // Chạm rồi nhả mà *không kéo* thì không truyền điểm nào: để `fire()` tự lấy như một cú chạm
    // thường. Với lướt né đây là cả sự khác biệt -- ngắm tự động của nó là hướng joystick đang đẩy,
    // còn `aimUI` lúc chưa kéo đang trỏ vào con quái gần nhất, tức là né *vào* mặt nó.
    if (go && scene === 'play') fire(n, drag ? at : null);
  }

  // ---- Sắp xếp phím --------------------------------------------------------
  // Thứ người chơi kéo là *chính* cái nút sẽ bấm lúc đánh nhau: lớp #touch nằm nguyên tại chỗ, chỉ
  // khác là mọi cú chạm vào nó thành một cú kéo (xem `tedit` ở pointerdown của #tstick và của .tb).
  // Một bản mô phỏng thu nhỏ trong bảng menu là chỗ để "chỗ thấy được" và "chỗ bấm thật" trôi ra
  // khỏi nhau -- mà sai lệch đó chỉ lộ ra lúc đang bị ba con vây, đúng lúc không sửa được.
  let tedit = false;
  // `what` là 'stick' hoặc **số ô** (0..4): mỗi nút là một chỗ đặt riêng, nên thứ đang kéo phải nói
  // được nó là nút nào. Một cờ boolean "đang kéo cụm" của bản trước không tả được chuyện đó.
  const tdrag = { on: false, id: -1, what: '', ox: 0, oy: 0 };
  function editDown(what, ev) {
    ev.preventDefault();
    if (tdrag.on) return;
    // Ghi lại khoảng lệch giữa ngón và tâm hiện tại, chứ không bắt tâm nhảy vào dưới ngón: nhảy là
    // nút giật một đoạn ngay khi mới chạm, và người chơi mất luôn chỗ tham chiếu để biết mình đang
    // dịch bao nhiêu. Tâm đo từ *phần tử thật* (kể cả nút còn đang nằm trên cung do CSS đặt), nên
    // không có phép tính hình học nào ở đây phải khớp lại với cung trong CSS.
    let cx, cy;
    if (what === 'stick') {
      const r = tstick.getBoundingClientRect();
      cx = r.left + stick.hx; cy = r.top + stick.hy;
    } else {
      const r = tbtn[what].getBoundingClientRect();
      cx = r.left + r.width * 0.5; cy = r.top + r.height * 0.5;
    }
    tdrag.on = true; tdrag.id = ev.pointerId; tdrag.what = what;
    tdrag.ox = ev.clientX - cx; tdrag.oy = ev.clientY - cy;
    editMove(ev);
  }
  function editMove(ev) {
    const doc = document.documentElement;
    // Lưu theo tỉ lệ viewport ngay tại đây, không lưu px rồi đổi lúc ghi: `stickHome`/`actsPlace` đọc
    // đúng cái tỉ lệ này, nên vừa kéo đã thấy đúng thứ mà lần vào trận sau sẽ dựng lại.
    const fx = c01((ev.clientX - tdrag.ox) / doc.clientWidth);
    const fy = c01((ev.clientY - tdrag.oy) / doc.clientHeight);
    if (tdrag.what === 'stick') { tcfg.jx = fx; tcfg.jy = fy; stickHome(); }
    else { tcfg.b[tdrag.what] = { x: fx, y: fy }; actsPlace(); }
  }
  // Nghe ở window, không bắt pointer: ngón kéo cái bệ ra khỏi vùng nhận của nó là chuyện *bình
  // thường* ở đây (đích đến có thể nằm ngoài), và một cú kéo mất dấu giữa đường là một nút rơi lại
  // ở chỗ không ai chọn.
  window.addEventListener('pointermove', ev => {
    if (!tdrag.on || ev.pointerId !== tdrag.id) return;
    ev.preventDefault(); editMove(ev);
  });
  function editUp(ev) {
    if (!tdrag.on || (ev && ev.pointerId !== tdrag.id)) return;
    tdrag.on = false; tdrag.id = -1;
    saveTcfg();
  }
  window.addEventListener('pointerup', editUp);
  window.addEventListener('pointercancel', editUp);
  // Hai thanh trượt cỡ. Đọc ra bằng **phần trăm cỡ gốc**, không bằng px: con số px chỉ có nghĩa với
  // đúng một máy, còn "120%" thì đúng cả trên máy 5 inch lẫn tablet -- và cỡ gốc vẫn đo theo chiều
  // ngắn của màn hình như cũ, nên hệ số này là thứ *thêm vào* phán đoán của máy, không thay nó.
  const touchBox = document.getElementById('touchBox');
  const tRows = [];
  function scaleRow(label, get, set) {
    const row = document.createElement('div'); row.className = 'srow';
    const name = document.createElement('b'); name.textContent = label;
    const rng = document.createElement('input');
    rng.type = 'range';
    rng.min = String(Math.round(TSCALE_LO * 100));
    rng.max = String(Math.round(TSCALE_HI * 100));
    rng.step = '2';
    rng.setAttribute('aria-label', label);
    const val = document.createElement('u');
    const show = () => { rng.value = String(Math.round(get() * 100)); val.textContent = rng.value + '%'; };
    // layout() ngay trong oninput: cỡ đổi *dưới ngón tay đang trượt* mới trả lời được câu hỏi duy
    // nhất của thanh này -- "to thế này có vừa tay không". Ghi xuống localStorage thì đợi nhả tay,
    // vì một lần trượt phát ra vài chục lần input.
    rng.oninput = () => { set(+rng.value / 100); val.textContent = rng.value + '%'; layout(); };
    rng.onchange = () => { SFX.ui('hover'); saveTcfg(); };
    row.append(name, rng, val);
    touchBox.appendChild(row);
    show();
    tRows.push(show);
  }
  scaleRow('JOYSTICK', () => tcfg.js, v => { tcfg.js = v; });
  scaleRow('NÚT CHIÊU', () => tcfg.as, v => { tcfg.as = v; });
  function resetTcfg() {
    // Gán lại từ *một object mới*: `TCFG_DEF` cũ là một hằng số dùng chung, và `b` trong đó là một
    // mảng -- Object.assign chỉ chép tham chiếu, nên lần kéo nút đầu tiên sau khi đặt lại sẽ ghi
    // thẳng vào chính cái "mặc định" và từ đó không còn mặc định nào để về.
    Object.assign(tcfg, tcfgDef());
    for (const show of tRows) show();
    layout(); saveTcfg();
  }

  // Công tắc ở menu chính. Fullscreen và khoá hướng màn hình *phải* xin trong một cử chỉ của
  // người dùng, nên chúng ở đây chứ không ở chỗ đọc localStorage lúc nạp trang. Cả hai đều có
  // thể bị từ chối (iOS không có Fullscreen API trên iPhone, khoá hướng chỉ chạy khi đã
  // fullscreen), và đó không phải lỗi: chế độ này vẫn dùng được, chỉ là còn thanh địa chỉ.
  const btnMob = document.getElementById('btnMob');
  function paintMob() {
    btnMob.textContent = 'CHẾ ĐỘ ĐIỆN THOẠI: ' + (mobOn ? 'BẬT' : 'TẮT');
    btnMob.setAttribute('aria-pressed', mobOn ? 'true' : 'false');
  }
  function setMob(on) {
    mobOn = on;
    document.body.classList.toggle('mob', on);
    try { localStorage.setItem('sl.mob', on ? '1' : '0'); } catch (e) { /* đành chịu */ }
    setMinimapTop(on);
    // Bảng sắp xếp phím giữ lớp cảm ứng hiện dù chế độ điện thoại đang tắt: ở đó nó là *thứ đang
    // được sửa*, và tắt chế độ giữa lúc đang kéo là xoá luôn cái vừa kéo khỏi màn hình.
    touchLayer.hidden = !((on && scene === 'play') || tedit);
    if (!on) { stickEnd(); holdEnd(false); atkHeld = false; }
    // `window.screen`, không phải `screen`: tên đó ở đầu file đã là canvas của game.
    const so = window.screen && window.screen.orientation;
    if (on) {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen)
        Promise.resolve(el.requestFullscreen({ navigationUI: 'hide' }))
          .then(() => so && so.lock && so.lock('landscape'))
          .catch(() => {});
    } else {
      try { if (so && so.unlock) so.unlock(); } catch (e) {}
      if (document.fullscreenElement && document.exitFullscreen)
        Promise.resolve(document.exitFullscreen()).catch(() => {});
    }
    layout();
    if ((on && scene === 'play') || tedit) { stickHome(); actsPlace(); }
    paintMob();
  }

  // ev.key is not reliable for digits (an AZERTY layout reports '&' unshifted, and a
  // shifted US layout reports '!'), so the physical key is read first.
  function digitOf(ev, max) {
    const m = new RegExp('^(?:Digit|Numpad)([1-' + max + '])$').exec(ev.code || '');
    if (m) return +m[1];
    const k = ev.key;
    if (k >= '1' && k <= String(max)) return +k;
    const s = ')!@#$%^&*('.indexOf(k);
    return s >= 1 && s <= max ? s : -1;
  }
  // Keys are routed by scene: a menu must never leak a cast or a step of movement
  // into the frozen arena behind it.
  function menuKey(ev, k, low) {
    if (scene === 'select') {
      const d = digitOf(ev, 5);
      if (d > 0) { loadout.wp = WEAPONS[d - 1]; SFX.ui('click'); SFX.cast(WEAPONS[d - 1].id, 0); paintPick(); ev.preventDefault(); return; }
      // Tab is taken off the browser here: focus-cycling a grid of 24 buttons is not how
      // anyone reads this panel, and flipping the arena behind it is.
      if (k === 'Tab') { cycleMap(ev.shiftKey ? -1 : 1); ev.preventDefault(); return; }
      if (k === 'Escape') { cancelSelect(); ev.preventDefault(); return; }
      if (k === 'Enter' || k === ' ') {
        if (loadout.slots.length === 3) startRun(); else SFX.blocked();
        ev.preventDefault(); return;
      }
      if (low === 'h') { toggleGuide(); ev.preventDefault(); }
      return;
    }
    if (k === 'Escape') {
      if (scene === 'guide' || scene === 'touch') { SFX.ui('back'); setScene(backTo); }
      else if (scene === 'pause') { SFX.ui('click'); setScene('play'); }
      ev.preventDefault(); return;
    }
    if (k === 'Enter' || k === ' ') {
      if (scene === 'menu') { SFX.ui('click'); setScene('select'); }
      else if (scene === 'pause') { SFX.ui('click'); setScene('play'); }
      else { SFX.ui('back'); setScene(backTo); }
      ev.preventDefault(); return;
    }
    if (low === 'h') { toggleGuide(); ev.preventDefault(); }
  }
  // Phím vừa đổi scene. Mọi keydown tiếp theo của *chính phím đó* bị nuốt cho tới khi nhả
  // tay, vì auto-repeat không biết là scene đã đổi: giữ Space thêm một nhịp ở bảng tạm dừng
  // thì nhịp đầu "tiếp tục" còn nhịp lặp thứ hai đã rơi vào scene 'play' -- nơi Space là
  // công tắc đứng hình. Người chơi được trả về trận rồi bị đóng băng ngay tại đó. Cùng lỗi
  // đó: giữ ESC làm màn hình nhảy qua lại giữa tạm dừng và trận, giữ số ở bảng chọn thì vừa
  // vào trận đã phóng luôn một chiêu.
  let eatKey = '';
  window.addEventListener('keydown', ev => {
    const k = ev.key, low = (k || '').toLowerCase();
    if (eatKey && low === eatKey) { ev.preventDefault(); return; }
    if (low === 'm') { toggleSound(); return; }
    const was = scene;
    if (scene !== 'play') {
      menuKey(ev, k, low);
      if (scene !== was) eatKey = low;
      return;
    }
    if (k === 'Escape') {
      SFX.ui('back'); setScene('pause'); eatKey = low; ev.preventDefault(); return;
    }
    const d = digitOf(ev, 3);
    if (d > 0) { fire(d); ev.preventDefault(); return; }
    // Shift is the dash. `repeat` is filtered because a held key fires forever, and the
    // only thing that would achieve is a stream of "blocked" clicks off the cooldown.
    if (k === 'Shift') { if (!ev.repeat) fire(DASH_SLOT); ev.preventDefault(); return; }
    // Công tắc bật/tắt thì bỏ auto-repeat: giữ phím một nhịp lẻ là để lại đúng trạng thái
    // ngược với thứ vừa thấy, và với đứng hình thì trạng thái đó nhìn y như treo máy.
    if (low === ' ' || k === ' ') { if (!ev.repeat) paused = !paused; ev.preventDefault(); return; }
    if (low === 'f') { stepOnce = true; return; }
    if (low === 't') { if (!ev.repeat) slow = !slow; return; }
    if (low === 'r') { for (let i = 0; i < 4; i++) spawnFoe(world, true); return; }
    // Telegraphs go with their casters: a pending mark whose owner has been deleted
    // outright (rather than killed) would otherwise still fire at nobody's order.
    if (low === 'c') { world.foes.length = 0; world.tels.length = 0; world.danger = 0;
                       world.boss = null; return; }
    // The boss gate needs 40 kills; the lab needs one keypress. Cycles through the three so
    // any of them can be looked at without playing to it, and the gate's own counter moves
    // with it so a debug boss does not desync the rotation.
    if (low === 'b') { if (!ev.repeat) spawnBoss(world); return; }
    if (low === 'x') { world.cds.fill(0); world.wcd = 0; world.dcd = 0; paint(); SFX.ui('click'); return; }
    if (low === 'g') { if (!ev.repeat) world.god = !world.god; return; }
    if (low === 'h') { toggleGuide(); eatKey = low; return; }
    keys.add(low);
  });
  window.addEventListener('keyup', ev => {
    const low = ev.key.toLowerCase();
    if (low === eatKey) eatKey = '';
    keys.delete(low);
  });
  // Mất focus thì không bao giờ thấy keyup nữa, nên phải xoá `eatKey` ở đây: bằng không
  // phím đó bị nuốt vĩnh viễn -- alt-tab đúng lúc đổi scene là mất luôn một phím.
  window.addEventListener('blur', () => { keys.clear(); eatKey = ''; });

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    dt = Math.min(dt, 0.05);
    fps = fps * 0.9 + (1 / Math.max(dt, 1e-4)) * 0.1;
    // The arena keeps running slowly behind the main menu so the title screen is a
    // live shot of the game; a pause or the guide freezes it dead.
    let sim = 0;
    if (scene === 'play') sim = paused ? (stepOnce ? 1 / 60 : 0) : dt * (slow ? 0.22 : 1);
    else if (scene === 'menu') sim = dt * 0.25;
    stepOnce = false;
    const aw = aimWorld();
    const inp = {
      dx: (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0) + stick.dx,
      dy: (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0) + stick.dy,
      ax: aw.x, ay: aw.y,
    };
    // Giữ nút đánh thường thì đánh tiếp ngay khi hết hồi. `swing` tự chối lúc còn hồi, nhưng
    // gọi nó mỗi khung vẫn sai: mỗi lần chối là một tiếng "blocked" -- nên chỉ gọi khi `wcd`
    // đã cạn. Đúng thứ mà trên desktop người chơi làm bằng cách bấm chuột liên tục.
    if (atkHeld && scene === 'play' && !paused && world.wcd <= 0) fire(0);
    if (sim > 0) {
      step(world, sim, inp);
      titleT = Math.max(0, titleT - sim);
      if (titleT <= 0) titleEl.style.opacity = 0;
    } else {
      world.aim.x = aw.x; world.aim.y = aw.y;
    }
    const t0 = performance.now();
    renderWorld(world, img.data);
    ms = ms * 0.9 + (performance.now() - t0) * 0.1;
    octx.putImageData(img, 0, 0);
    const sh = world.shake;
    const ox = sh > 0 ? (Math.random() * 2 - 1) * sh : 0;
    const oy = sh > 0 ? (Math.random() * 2 - 1) * sh * 0.6 : 0;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, screen.width, screen.height);
    ctx.imageSmoothingEnabled = false;
    // Bộ đệm đã bằng số điểm ảnh vật lý của hộp, nên đây là *lần phóng to duy nhất* trong cả
    // đường đi -- và nó là nearest thật vì smoothing đã tắt. Tỉ lệ giờ là số lẻ (4,75 chẳng
    // hạn), nên độ rung phải quy về số nguyên điểm ảnh vật lý: để lẻ thì `drawImage` phải đặt
    // ảnh vào toạ độ giữa hai điểm ảnh và canvas tự nội suy lại đúng một lần nữa.
    const px = screen.width / W;
    ctx.drawImage(off, Math.round(Math.round(ox) * px), Math.round(Math.round(oy) * px),
                  screen.width, screen.height);
    const slotName = sel === 0 ? world.wp.name + ' (đánh thường)'
                   : sel === DASH_SLOT ? DASH_SK.name + ' (lướt né)'
                   : SKILLS[loadout.slots[sel - 1]].name;
    paintCds();
    hud.textContent =
      'FPS ' + fps.toFixed(0) + '   vẽ ' + ms.toFixed(1) + 'ms   fx ' + world.fxs.length +
      '\nquái ' + world.foes.length + '   hạ ' + world.kills + '   dmg ' + world.dmg +
      '\ncảnh báo ' + world.tels.length +
      (world.danger > 0 ? '   << ĐANG ĐỨNG TRONG VÙNG (' + world.danger + ') >>' : '') +
      '\nvũ khí ' + world.wp.label + ' · hồi ' + world.wcd.toFixed(2) + 's' +
      (world.momo > 0 ? '   << CHUỖI ' + world.momo.toFixed(2) + 's >>' : '') +
      (world.heals > 0 ? '   hồi ' + world.heals : '') +
      '\nlướt · hồi ' + world.dcd.toFixed(2) + 's' +
      (world.hero.inv > 0 ? '   << BẤT TỬ ' + world.hero.inv.toFixed(2) + 's >>' : '') +
      '   né ' + world.dodges +
      '\nô ' + (sel === 0 ? 'chuột' : sel === DASH_SLOT ? 'shift' : sel) + ' · ' + slotName +
      '\nHP ' + Math.round(world.hero.hp) + '/' + world.hero.maxhp +
      (world.god ? ' (bất tử)' : '') +
      '\nsân ' + MAPDEF.label +
      '\nvị trí ' + Math.round(world.hero.x) + ',' + Math.round(world.hero.y) +
      ' / map ' + WW + 'x' + WH +
      (paused ? '\n== ĐỨNG HÌNH (F: 1 khung) ==' : (slow ? '\n== SLOW-MO 0.22x ==' : ''));
    requestAnimationFrame(frame);
  }
  buildBar();
  paintMob();
  setMinimapTop(mobOn);
  setScene('menu');
  requestAnimationFrame(frame);
}
