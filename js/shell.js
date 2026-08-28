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
  off.width = W; off.height = H;
  const octx = off.getContext('2d');
  const img = octx.createImageData(W, H);

  let world = newWorld(20260827);
  let paused = false, stepOnce = false, slow = false;
  let last = performance.now(), fps = 60, ms = 0;
  const keys = new Set();
  const bar = document.getElementById('bar');
  const hud = document.getElementById('hud');
  const titleEl = document.getElementById('title');
  let titleT = 0;

  // ---- Fixed frame ---------------------------------------------------------
  // Header, arena and hotbar are sized to the window every time it changes, so the
  // document never scrolls. --sw/--sh drive the stage (and, through CSS, the HUD and
  // title type), --rowh/--ico drive the hotbar. The canvas backing store is kept at
  // the nearest integer multiple of 320x180 to the displayed size, so upscaled art
  // pixels stay as close to square as the window allows.
  const rootStyle = document.documentElement.style;
  const topbar = document.getElementById('topbar');
  let vs = SCALE;
  function layout() {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const rowh = Math.round(clamp((vh - 90) * 0.085, 36, 60));
    const chrome = 6 + 8 + 12 + (topbar.offsetHeight || 24) + 2;   // padding, gaps, header, border
    let h = vh - chrome - (rowh * 2 + 4);
    let w = h * (W / H);
    const maxW = vw - 16;
    if (w > maxW) { w = maxW; h = w * (H / W); }
    w = Math.max(320, Math.round(w)); h = Math.max(180, Math.round(h));
    // Five slots with 6px gaps, and the cell is capped at 172px by CSS, so a wide
    // window centres them instead of stretching five labels across 1280px.
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
    const s = clamp(Math.round(w / W), 1, 8);
    if (s !== vs) { vs = s; screen.width = W * vs; screen.height = H * vs; }
  }
  layout();
  window.addEventListener('resize', layout);

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
  const cdMasks = [], cdValues = [], slotKind = [];
  const BAR_N = 5, DASH_SLOT = 4;
  let cells = [], sel = 0;
  function buildBar() {
    bar.textContent = '';
    cdMasks.length = 0; cdValues.length = 0; slotKind.length = 0;
    cells = [];
    for (let n = 0; n < BAR_N; n++) {
      const weapon = n === 0, isDash = n === DASH_SLOT;
      // slotKind is what paintCds reads: -1 the weapon, -2 the dash, 0..15 a real skill.
      const gi = weapon ? -1 : isDash ? -2 : loadout.slots[n - 1];
      const sk = weapon ? loadout.wp : isDash ? DASH_SK : SKILLS[gi];
      const theme = weapon ? (WEAPON_THEMES[sk.id] || WEAPON_THEMES.kiem) : ICON_THEMES[sk.id];
      const cd = isDash ? DASH_CD : sk.cd;
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
      cdMasks.push(mask); cdValues.push(cdValue); slotKind.push(gi);
      cells.push(d);
    }
    paint();
  }
  function paint() {
    cells.forEach((c, i) => {
      const selected = i === sel;
      c.classList.toggle('on', selected);
      c.setAttribute('aria-pressed', selected ? 'true' : 'false');
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
      if (!ok) {
        cdMasks[n].style.transform = `scaleY(${c01(left / full).toFixed(3)})`;
        cdValues[n].textContent = Math.max(0.1, left).toFixed(1);
      }
      if (ok !== ready[n]) {
        ready[n] = ok; cells[n].classList.toggle('cooling', !ok);
        if (ok) { cdMasks[n].style.transform = 'scaleY(0)'; cdValues[n].textContent = ''; }
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
  };
  let scene = 'menu', backTo = 'menu';
  function setScene(s) {
    if (s === 'guide' && scene !== 'guide') backTo = scene === 'play' ? 'pause' : scene;
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
  const SHAPE_VI = { circle: 'vòng tròn', cone: 'hình quạt', line: 'đường thẳng' };
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
    else if (scene === 'guide') { SFX.ui('back'); setScene(backTo); }
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
    const c = camInt(world);
    return { x: aim.sx + c.x, y: aim.sy + c.y };
  }
  screen.addEventListener('mousemove', ev => { const a = aimPoint(ev); aim.sx = a.x; aim.sy = a.y; });
  // Left button attacks, right button dashes. Right-click is the second-most reachable
  // input there is and it was doing nothing; a dodge you have to take your hand off the
  // movement keys for is a dodge you will not use.
  screen.addEventListener('mousedown', ev => {
    ev.preventDefault();
    fire(ev.button === 2 ? DASH_SLOT : 0);
  });
  screen.addEventListener('contextmenu', ev => ev.preventDefault());
  // One entry point for every way of attacking: slot 0 is the weapon, 1-3 are the skills
  // this run was built with, 4 is the dash. `swing` plays its own voice (it is fired from
  // the sim side too), so only the cast path announces itself here.
  function fire(n) {
    if (scene !== 'play') return;
    sel = n; paint();
    const a = aimWorld();
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
      let dx = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
      let dy = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0);
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
      if (scene === 'guide') { SFX.ui('back'); setScene(backTo); }
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
    if (low === 'c') { world.foes.length = 0; world.tels.length = 0; world.danger = 0; return; }
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
      dx: (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0),
      dy: (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0),
      ax: aw.x, ay: aw.y,
    };
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
    ctx.drawImage(off, Math.round(ox) * vs, Math.round(oy) * vs,
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
  setScene('menu');
  requestAnimationFrame(frame);
}
