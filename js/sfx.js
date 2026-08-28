"use strict";
// ===========================================================================
// 3b. Sound: every voice is synthesised in WebAudio at runtime, so a skill's sound
//     is authored next to its pixels and the page still ships as a single file.
//     Nothing here throws without an AudioContext -- the sim can run headless.
// ===========================================================================
const SFX = (() => {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  const store = (() => { try { return window.localStorage } catch (e) { return null } })();
  const st = { on: true, sfx: 0.8, mus: 0.45 };
  const rd = k => { try { return store && store.getItem(k) } catch (e) { return null } };
  const wr = (k, v) => { try { store && store.setItem(k, v) } catch (e) {} };
  if (rd('lab.snd.on') === '0') st.on = false;
  for (const k of ['sfx', 'mus']) {
    const v = rd('lab.snd.' + k);
    if (v !== null && v !== '' && isFinite(+v)) st[k] = clamp(+v, 0, 1);
  }

  let ac = null, master = null, busS = null, busM = null, noiseBuf = null;
  function boot() {
    if (ac || !AC) return ac;
    try { ac = new AC(); } catch (e) { return null; }
    master = ac.createGain(); master.gain.value = st.on ? 1 : 0;
    // 16 skills plus a swarm of hits can stack a dozen voices in one frame; the
    // compressor is what keeps that from clipping into a buzz.
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -13; comp.knee.value = 14; comp.ratio.value = 5;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    busS = ac.createGain(); busS.gain.value = st.sfx;
    busM = ac.createGain(); busM.gain.value = st.mus;
    busS.connect(comp); busM.connect(comp); comp.connect(master); master.connect(ac.destination);
    const n = (ac.sampleRate * 1.2) | 0;
    noiseBuf = ac.createBuffer(1, n, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ac;
  }
  // Browsers only allow audio after a gesture, so every entry point unlocks first.
  function unlock() {
    if (!boot()) return null;
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  const now = () => ac.currentTime;
  const at = o => o.t != null ? o.t : now() + (o.at || 0);
  function dest(o) {
    const bus = o.bus || busS;
    if (o.pan == null || !ac.createStereoPanner) return bus;
    const p = ac.createStereoPanner();
    p.pan.value = clamp(o.pan, -1, 1); p.connect(bus);
    return p;
  }
  // One swept oscillator with a percussive envelope -- the pitched half of everything.
  function tone(o) {
    if (!ac) return;
    const t0 = at(o), dur = o.dur || 0.2;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'sine';
    const f0 = Math.max(20, o.f0), f1 = Math.max(20, o.f1 || o.f0);
    osc.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    if (o.detune) osc.detune.value = o.detune;
    const peak = Math.max(0.0002, o.gain == null ? 0.3 : o.gain);
    const atk = o.atk == null ? 0.005 : o.atk;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(dest(o));
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  // Filtered noise burst -- the body of every impact, slash, whoosh and crackle.
  function noise(o) {
    if (!ac) return;
    const t0 = at(o), dur = o.dur || 0.2;
    const src = ac.createBufferSource(), bq = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf; src.loop = true; src.playbackRate.value = o.rate || 1;
    bq.type = o.type || 'lowpass'; bq.Q.value = o.q == null ? 1 : o.q;
    const f0 = Math.max(30, o.f0 || 1200), f1 = Math.max(30, o.f1 || o.f0 || 1200);
    bq.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) bq.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const peak = Math.max(0.0002, o.gain == null ? 0.3 : o.gain);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.atk == null ? 0.004 : o.atk));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bq); bq.connect(g); g.connect(dest(o));
    src.start(t0, Math.random() * 0.4); src.stop(t0 + dur + 0.03);
  }
  const gates = {};
  const clk = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function gate(k, ms) {
    const t = clk();
    if (gates[k] && t - gates[k] < ms) return false;
    gates[k] = t; return true;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  // One voice per skill, keyed by the same id the icons use: a cast should be
  // recognisable with the screen off.
  const VOICE = {
    star_rupture(p) {                                  // implosion then a shockwave
      tone({ f0: 170, f1: 40, dur: 0.55, gain: 0.5, pan: p });
      noise({ f0: 4600, f1: 260, dur: 0.42, gain: 0.34, pan: p });
      tone({ f0: 960, f1: 210, dur: 0.16, type: 'triangle', gain: 0.16, at: 0.02, pan: p });
    },
    whirl_slash(p) {                                   // two blades, second one late
      noise({ type: 'bandpass', q: 1.7, f0: 620, f1: 3600, dur: 0.15, gain: 0.32, pan: p });
      noise({ type: 'bandpass', q: 1.7, f0: 900, f1: 2600, dur: 0.13, gain: 0.26, at: 0.11, pan: p });
      tone({ f0: 130, f1: 62, dur: 0.2, gain: 0.2, pan: p });
    },
    ember_field(p) {                                   // gas ignition + long crackle
      noise({ f0: 300, f1: 1900, dur: 0.3, gain: 0.3, q: 0.7, pan: p });
      tone({ f0: 84, f1: 48, dur: 0.7, gain: 0.34, pan: p });
      for (let i = 0; i < 7; i++)
        noise({ type: 'bandpass', q: 3, f0: rnd(1400, 4200), dur: 0.05, gain: 0.1, at: 0.1 + i * 0.11, pan: p });
    },
    frost_prison(p) {                                  // freeze hiss into glass chimes
      noise({ type: 'highpass', f0: 900, f1: 5200, dur: 0.35, gain: 0.22, pan: p });
      for (let i = 0; i < 5; i++)
        tone({ f0: rnd(1500, 2900), f1: rnd(2600, 4200), dur: 0.2, type: 'triangle', gain: 0.12, at: i * 0.07, pan: p });
      tone({ f0: 220, f1: 120, dur: 0.5, gain: 0.2, pan: p });
    },
    chain_bolt(p) {                                    // three staccato zaps
      for (let i = 0; i < 3; i++) {
        tone({ f0: 2400 - i * 300, f1: 300, dur: 0.09, type: 'square', gain: 0.14, at: i * 0.075, pan: p });
        noise({ type: 'highpass', f0: 3200, dur: 0.06, gain: 0.16, at: i * 0.075, pan: p });
      }
      tone({ f0: 130, f1: 56, dur: 0.24, gain: 0.24, pan: p });
    },
    blood_rend(p) {                                    // wet tear, low body
      noise({ type: 'bandpass', q: 1.2, f0: 1800, f1: 380, dur: 0.26, gain: 0.34, pan: p });
      tone({ f0: 190, f1: 46, dur: 0.34, type: 'sawtooth', gain: 0.22, pan: p });
    },
    void_collapse(p) {                                 // everything falls into the hole
      tone({ f0: 300, f1: 34, dur: 0.9, type: 'sawtooth', gain: 0.3, atk: 0.08, pan: p });
      noise({ f0: 200, f1: 3200, dur: 0.5, gain: 0.2, q: 0.8, pan: p });
      noise({ f0: 3000, f1: 90, dur: 0.5, gain: 0.24, at: 0.45, pan: p });
    },
    judgment_beam(p) {                                 // charge, then the pillar lands
      tone({ f0: 300, f1: 1500, dur: 0.34, type: 'sawtooth', gain: 0.16, atk: 0.12, pan: p });
      tone({ f0: 120, f1: 40, dur: 0.7, gain: 0.5, at: 0.32, pan: p });
      noise({ f0: 5200, f1: 400, dur: 0.55, gain: 0.3, at: 0.32, pan: p });
      tone({ f0: 660, f1: 660, dur: 0.5, type: 'triangle', gain: 0.1, at: 0.34, pan: p });
    },
    ricochet_shot(p) {                                 // pew plus two ricochets
      tone({ f0: 1800, f1: 420, dur: 0.1, type: 'square', gain: 0.16, pan: p });
      noise({ type: 'highpass', f0: 2600, dur: 0.07, gain: 0.14, pan: p });
      for (let i = 1; i <= 2; i++)
        tone({ f0: 1500 - i * 200, f1: 380, dur: 0.08, type: 'square', gain: 0.1 / i, at: 0.16 * i, pan: p });
    },
    shadow_dash(p) {                                   // air collapsing behind the hero
      noise({ type: 'bandpass', q: 0.9, f0: 3400, f1: 260, dur: 0.28, gain: 0.3, pan: p });
      tone({ f0: 420, f1: 90, dur: 0.22, type: 'triangle', gain: 0.16, pan: p });
      tone({ f0: 90, f1: 150, dur: 0.18, gain: 0.18, at: 0.2, pan: p });
    },
    spirit_summon(p) {                                 // rising minor arpeggio, breathy
      const base = 330;
      [0, 3, 7, 12].forEach((s, i) => tone({
        f0: base * Math.pow(2, s / 12), dur: 0.5 - i * 0.05, type: 'triangle',
        gain: 0.13, at: i * 0.075, atk: 0.03, pan: p }));
      noise({ type: 'bandpass', q: 2, f0: 700, f1: 2200, dur: 0.5, gain: 0.1, atk: 0.2, pan: p });
    },
    toxic_bloom(p) {                                   // bubbles under a wet lid
      for (let i = 0; i < 8; i++)
        tone({ f0: rnd(150, 420), f1: rnd(500, 1100), dur: 0.1, type: 'sine', gain: 0.13, at: i * 0.1, pan: p });
      noise({ f0: 700, f1: 240, dur: 0.8, gain: 0.14, q: 2, pan: p });
    },
    gale_vortex(p) {                                   // wide airy sweep, slow open
      noise({ type: 'bandpass', q: 0.6, f0: 500, f1: 2600, dur: 0.6, gain: 0.3, atk: 0.2, pan: p });
      noise({ type: 'bandpass', q: 0.6, f0: 2200, f1: 700, dur: 0.5, gain: 0.22, at: 0.5, pan: p });
      tone({ f0: 150, f1: 96, dur: 0.9, gain: 0.16, atk: 0.15, pan: p });
    },
    aegis_reflect(p) {                                 // struck metal, two detuned bells
      tone({ f0: 880, f1: 830, dur: 0.7, type: 'triangle', gain: 0.2, atk: 0.002, pan: p });
      tone({ f0: 1320, f1: 1290, dur: 0.5, type: 'triangle', gain: 0.12, detune: 12, pan: p });
      noise({ type: 'highpass', f0: 4200, dur: 0.1, gain: 0.16, pan: p });
      tone({ f0: 160, f1: 110, dur: 0.3, gain: 0.2, pan: p });
    },
    arcane_rain(p) {                                   // scattered high impacts
      for (let i = 0; i < 10; i++) {
        const t = i * 0.11 + rnd(0, 0.04);
        tone({ f0: rnd(900, 2400), f1: rnd(260, 600), dur: 0.13, type: 'triangle', gain: 0.11, at: t, pan: clamp((p || 0) + rnd(-0.3, 0.3), -1, 1) });
        noise({ type: 'highpass', f0: 2800, dur: 0.07, gain: 0.08, at: t });
      }
      tone({ f0: 110, f1: 70, dur: 0.5, gain: 0.16, pan: p });
    },
    time_halt(p) {                                     // the world bends down a tone
      tone({ f0: 620, f1: 150, dur: 0.9, type: 'sawtooth', gain: 0.2, atk: 0.04, pan: p });
      tone({ f0: 310, f1: 74, dur: 1.0, type: 'sine', gain: 0.22, atk: 0.04, pan: p });
      noise({ f0: 2600, f1: 200, dur: 0.9, gain: 0.14, q: 1.4, pan: p });
      tone({ f0: 74, f1: 74, dur: 1.2, type: 'sine', gain: 0.16, atk: 0.3, at: 0.5, pan: p });
    },
    // ---- the five basic attacks. Keyed by weapon id, so SFX.cast(wp.id) works for a
    // swing exactly as it does for a cast. These are deliberately drier and shorter than
    // the skills: you hear one every half second, and anything with a tail turns into mud.
    kiem(p) {                                          // four light steel strokes
      for (let i = 0; i < 4; i++)
        noise({ type: 'bandpass', q: 2.2, f0: 900 + i * 260, f1: 3000 + i * 300,
                dur: 0.07, gain: 0.2 - i * 0.02, at: i * 0.055, pan: p });
      tone({ f0: 150, f1: 74, dur: 0.14, gain: 0.14, pan: p });
    },
    dao(p) {                                           // heavier, three deep sweeps
      for (let i = 0; i < 3; i++)
        noise({ type: 'bandpass', q: 1.3, f0: 520 + i * 160, f1: 1900, dur: 0.11,
                gain: 0.26 - i * 0.03, at: i * 0.085, pan: p });
      tone({ f0: 118, f1: 52, dur: 0.24, type: 'triangle', gain: 0.2, pan: p });
    },
    cung(p) {                                          // string release then the flight
      noise({ type: 'bandpass', q: 4, f0: 1700, f1: 700, dur: 0.05, gain: 0.2, pan: p });
      tone({ f0: 320, f1: 150, dur: 0.08, type: 'triangle', gain: 0.14, pan: p });
      noise({ type: 'bandpass', q: 1.1, f0: 2400, f1: 5200, dur: 0.22, gain: 0.12, at: 0.05, pan: p });
    },
    'luoi-hai'(p) {                                    // wide low scythe arc
      noise({ type: 'bandpass', q: 0.8, f0: 380, f1: 1500, dur: 0.2, gain: 0.26, atk: 0.05, pan: p });
      noise({ type: 'bandpass', q: 1.6, f0: 1600, f1: 500, dur: 0.13, gain: 0.18, at: 0.16, pan: p });
      tone({ f0: 96, f1: 44, dur: 0.3, gain: 0.2, pan: p });
    },
    gang(p) {                                          // five dry knuckle taps
      for (let i = 0; i < 5; i++) {
        noise({ type: 'bandpass', q: 3.2, f0: 1100 + i * 180, dur: 0.045,
                gain: 0.17, at: i * 0.042, pan: p });
        tone({ f0: 220 - i * 14, f1: 90, dur: 0.05, type: 'square', gain: 0.07, at: i * 0.042, pan: p });
      }
    },
  };
  // ---- procedural score: a drone plus an eight-step minor pentatonic sequence.
  // Notes are scheduled ahead of the clock (a setInterval that only ever looks
  // 0.3 s into the future), which is the only way to get steady timing out of a
  // timer that the game loop can starve.
  const SEQ = [0, 7, 3, 10, 12, 7, 15, 10];
  const ROOT = [0, 0, -5, -5, 3, 3, -2, -2];
  const hz = s => 55 * Math.pow(2, s / 12);
  let musMode = 'off', musTimer = null, musStep = 0, musT = 0, drone = null;
  function startDrone() {
    if (drone || !ac) return;
    const g = ac.createGain(), lp = ac.createBiquadFilter();
    const lfo = ac.createOscillator(), lg = ac.createGain();
    const a = ac.createOscillator(), b = ac.createOscillator();
    g.gain.value = 0.0001; g.gain.setTargetAtTime(0.13, now(), 1.4);
    lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 3;
    lfo.frequency.value = 0.055; lg.gain.value = 190;
    lfo.connect(lg); lg.connect(lp.frequency);
    a.type = b.type = 'sawtooth';
    a.frequency.value = hz(-12); b.frequency.value = hz(-12) * 1.004;
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(busM);
    a.start(); b.start(); lfo.start();
    drone = { a, b, lfo, g };
  }
  function stopDrone() {
    if (!drone) return;
    const d = drone; drone = null;
    d.g.gain.setTargetAtTime(0.0001, now(), 0.35);
    setTimeout(() => { try { d.a.stop(); d.b.stop(); d.lfo.stop(); } catch (e) {} }, 1400);
  }
  function musicTick() {
    if (!ac || musMode === 'off') return;
    if (ac.state !== 'running') { musT = 0; return; }        // suspended: do not pile notes up
    const dur = musMode === 'play' ? 0.27 : 0.44;
    if (musT < now()) musT = now() + 0.06;
    while (musT < now() + 0.3) {
      const s = musStep & 7, bar = (musStep >> 3) & 7, r = ROOT[bar], t = musT;
      if (s === 0) tone({ t, f0: hz(r - 12), dur: dur * 6, gain: 0.2, atk: 0.06, bus: busM });
      if (s === 0 || s === 3 || s === 5 || (musMode === 'play' && s === 6))
        tone({ t, f0: hz(SEQ[s] + r + 12), dur: dur * 2.2, type: 'triangle', gain: 0.07, atk: 0.02, bus: busM });
      if (musMode === 'play') {
        if (s === 0 || s === 4) tone({ t, f0: 115, f1: 45, dur: 0.15, gain: 0.26, bus: busM });
        if (s & 1) noise({ t, type: 'highpass', f0: 5400, dur: 0.045, gain: 0.03, bus: busM });
      }
      musStep++; musT += dur;
    }
  }
  function music(mode) {
    if (mode !== 'off' && !unlock()) return;
    if (mode === musMode) return;
    musMode = mode;
    if (mode === 'off') {
      stopDrone();
      if (musTimer) { clearInterval(musTimer); musTimer = null; }
      return;
    }
    musT = now() + 0.1;
    startDrone();
    if (!musTimer) musTimer = setInterval(musicTick, 80);
  }

  return {
    unlock,
    state: st,
    // ---- gameplay events -------------------------------------------------
    cast(id, pan) { if (!unlock()) return; (VOICE[id] || VOICE.whirl_slash)(pan || 0); },
    blocked() {                                        // cast refused: dull, short, no pitch
      if (!unlock() || !gate('blocked', 90)) return;
      noise({ type: 'lowpass', f0: 700, f1: 260, dur: 0.07, gain: 0.16 });
      tone({ f0: 150, f1: 110, dur: 0.06, type: 'square', gain: 0.06 });
    },
    hit(amount, crit, pan) {                           // one thud per 28 ms, whatever lands
      if (!ac || !gate('hit', 28)) return;
      const big = clamp((amount || 10) / 90, 0.15, 1);
      noise({ type: 'lowpass', f0: 900 + 1600 * big, f1: 200, dur: 0.07 + 0.05 * big, gain: 0.16 + 0.1 * big, pan });
      tone({ f0: 260 - 90 * big, f1: 70, dur: 0.09, gain: 0.14 + 0.08 * big, pan });
      if (crit) tone({ f0: 1900, f1: 700, dur: 0.09, type: 'square', gain: 0.1, pan });
    },
    die(pan) {
      if (!ac || !gate('die', 55)) return;
      noise({ type: 'bandpass', q: 1.1, f0: 1500, f1: 170, dur: 0.28, gain: 0.24, pan });
      tone({ f0: 190, f1: 44, dur: 0.3, type: 'sawtooth', gain: 0.18, pan });
    },
    hurt() {                                           // hero chip damage is continuous
      if (!ac || !gate('hurt', 340)) return;
      tone({ f0: 260, f1: 62, dur: 0.24, type: 'sawtooth', gain: 0.26 });
      noise({ type: 'lowpass', f0: 1100, f1: 200, dur: 0.18, gain: 0.2 });
    },
    // ---- monster casts: a telegraph you can hear ---------------------------
    // Three parts, same as the picture: a swell that opens for as long as the mark is on
    // the floor, one dry tick on the last beat (the cue you actually dodge on), then the
    // hit. Deliberately pitched *below* the player's own skills so a warning never gets
    // lost inside the sound of your own cast.
    warn(shape, pan) {
      if (!unlock() || !gate('warn', 70)) return;
      const far = shape === 'line';
      tone({ f0: 68, f1: far ? 250 : 172, dur: 0.62, type: 'sawtooth',
             gain: 0.13, atk: 0.34, pan });
      noise({ type: 'bandpass', q: 1.4, f0: 240, f1: far ? 1900 : 1200, dur: 0.55,
              gain: 0.1, atk: 0.32, pan });
    },
    tick(pan) {
      if (!ac || !gate('tick', 55)) return;
      tone({ f0: 1750, f1: 1250, dur: 0.05, type: 'square', gain: 0.1, pan });
    },
    boom(kind, pan) {
      if (!ac || !gate('boom', 40)) return;
      if (kind === 'line') {
        tone({ f0: 940, f1: 170, dur: 0.3, type: 'sawtooth', gain: 0.24, pan });
        noise({ type: 'bandpass', q: 1.1, f0: 3400, f1: 640, dur: 0.26, gain: 0.2, pan });
        return;
      }
      if (kind === 'big') {                            // quake and self-detonation
        tone({ f0: 124, f1: 30, dur: 0.72, gain: 0.44, pan });
        noise({ f0: 2400, f1: 150, dur: 0.6, gain: 0.3, q: 0.8, pan });
        tone({ f0: 420, f1: 90, dur: 0.2, type: 'triangle', gain: 0.14, pan });
        return;
      }
      tone({ f0: 210, f1: 50, dur: 0.34, type: 'triangle', gain: 0.3, pan });
      noise({ f0: 1600, f1: 230, dur: 0.3, gain: 0.22, pan });
    },
    step() {                                           // footfall, deliberately near-silent
      if (!ac || !gate('step', 95)) return;
      noise({ type: 'bandpass', q: 1.4, f0: rnd(320, 520), dur: 0.05, gain: 0.05 });
    },
    // ---- dash ------------------------------------------------------------
    // A scrape that rises: cloth and grit, no pitch of its own, so it never competes with
    // a weapon or a cast for attention. It only has to say "you moved".
    dash(pan) {
      if (!unlock() || !gate('dash', 90)) return;
      noise({ type: 'bandpass', q: 0.9, f0: 380, f1: 2100, dur: 0.16, gain: 0.15, pan });
      tone({ f0: 300, f1: 620, dur: 0.12, type: 'triangle', gain: 0.09, pan });
    },
    // The reward for a dash spent well. Bright, clean and *above* every warning, because
    // it is the one sound in the game that means nothing bad happened.
    dodge() {
      if (!ac || !gate('dodge', 70)) return;
      tone({ f0: 1180, f1: 1880, dur: 0.09, type: 'triangle', gain: 0.13 });
      noise({ type: 'highpass', f0: 2600, dur: 0.07, gain: 0.07 });
    },
    // ---- interface -------------------------------------------------------
    ui(kind) {
      if (!unlock()) return;
      if (kind === 'hover') { if (!gate('hover', 40)) return; tone({ f0: 1500, dur: 0.03, type: 'triangle', gain: 0.05 }); return; }
      if (kind === 'back') { tone({ f0: 700, f1: 420, dur: 0.1, type: 'triangle', gain: 0.12 }); return; }
      tone({ f0: 900, f1: 1400, dur: 0.07, type: 'triangle', gain: 0.13 });
    },
    fanfare() {                                        // pressing "start" should feel like a door opening
      if (!unlock()) return;
      [0, 7, 12, 19].forEach((s, i) => tone({
        f0: hz(s + 24), dur: 0.4, type: 'triangle', gain: 0.14, at: i * 0.08, atk: 0.01 }));
      tone({ f0: 110, f1: 55, dur: 0.6, gain: 0.3 });
      noise({ type: 'highpass', f0: 3000, f1: 900, dur: 0.5, gain: 0.1 });
    },
    music,
    // ---- mixer -----------------------------------------------------------
    setOn(v) {
      st.on = !!v; wr('lab.snd.on', st.on ? '1' : '0');
      if (st.on) unlock();
      if (master) master.gain.setTargetAtTime(st.on ? 1 : 0, now(), 0.05);
    },
    setSfx(v) { st.sfx = clamp(v, 0, 1); wr('lab.snd.sfx', st.sfx); if (busS) busS.gain.value = st.sfx; },
    setMus(v) { st.mus = clamp(v, 0, 1); wr('lab.snd.mus', st.mus); if (busM) busM.gain.value = st.mus; },
  };
})();
