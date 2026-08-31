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
  let revIn = null, dlyIn = null, dlyNode = null;
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
    // Two send effects, used by the score only: gameplay sounds stay bone dry so a
    // warning never arrives smeared. A room and a rhythmic delay are the whole
    // difference between "some oscillators" and something that sounds produced.
    revIn = ac.createGain();
    const rLp = ac.createBiquadFilter(), rHp = ac.createBiquadFilter();
    rLp.type = 'lowpass'; rLp.frequency.value = 3600;
    rHp.type = 'highpass'; rHp.frequency.value = 300;   // keep the bass out of the tail
    const rev = ac.createConvolver(); rev.buffer = ir(1.9, 2.6);
    const rG = ac.createGain(); rG.gain.value = 0.55;
    revIn.connect(rLp); rLp.connect(rev); rev.connect(rHp); rHp.connect(rG); rG.connect(comp);
    dlyIn = ac.createGain();
    const dly = ac.createDelay(1), fb = ac.createGain();
    const dLp = ac.createBiquadFilter(), dG = ac.createGain();
    dly.delayTime.value = 0.3;                          // retuned to three 16ths per mode
    fb.gain.value = 0.33; dLp.type = 'lowpass'; dLp.frequency.value = 2600;
    dG.gain.value = 0.5;
    dlyIn.connect(dly); dly.connect(dLp); dLp.connect(fb); fb.connect(dly);
    dLp.connect(dG); dG.connect(comp);
    dlyNode = dly;
    return ac;
  }
  // Noise with an exponential tail is a convincing enough room for a game this size,
  // and it costs one buffer instead of an impulse file.
  function ir(sec, decay) {
    const n = (ac.sampleRate * sec) | 0, b = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * (i < 240 ? i / 240 : 1);
    }
    return b;
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
    let node = bus;
    if (o.pan != null && ac.createStereoPanner) {
      const p = ac.createStereoPanner();
      p.pan.value = clamp(o.pan, -1, 1); p.connect(bus);
      node = p;
    }
    if (!o.rev && !o.dly) return node;
    const tap = ac.createGain(); tap.connect(node);
    if (o.rev && revIn) { const g = ac.createGain(); g.gain.value = o.rev; tap.connect(g); g.connect(revIn); }
    if (o.dly && dlyIn) { const g = ac.createGain(); g.gain.value = o.dly; tap.connect(g); g.connect(dlyIn); }
    return tap;
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
    // ---- the six basic attacks. Keyed by weapon id, so SFX.cast(wp.id) works for a
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
    // Khiên: tiếng trượt chân trước rồi mới tới tiếng va. Năm cái trên đều bắt đầu bằng cú va,
    // còn ở đây cú va là *hệ quả* của việc lao tới, nên trật tự phải nghe ra đúng thứ tự đó --
    // và cú va là thứ nặng nhất trong nhóm này vì nó phải nghe như tấm kim loại chứ không như
    // cái lưỡi. Cái đuôi ngân 0.34 s là ngoại lệ duy nhất của "đừng để có đuôi": mỗi 0.72 s
    // mới nghe một lần, nên nó có chỗ để ngân mà không thành bùn.
    khien(p) {
      noise({ type: 'bandpass', q: 0.9, f0: 300, f1: 900, dur: 0.2, gain: 0.15, atk: 0.12, pan: p });
      noise({ type: 'lowpass', f0: 2600, f1: 240, dur: 0.14, gain: 0.3, at: 0.2, pan: p });
      tone({ f0: 132, f1: 46, dur: 0.34, type: 'triangle', gain: 0.24, at: 0.2, pan: p });
      tone({ f0: 690, f1: 400, dur: 0.09, type: 'square', gain: 0.08, at: 0.21, pan: p });
    },
  };
  // ---- procedural score --------------------------------------------------
  // A written eight-bar loop in A minor, four layers deep: plucked synth bass, a
  // chord pad, a fixed lead melody and a drum kit. Notes are scheduled ahead of the
  // clock (a setInterval that only ever looks 0.35 s into the future), which is the
  // only way to get steady timing out of a timer the game loop can starve.
  //
  // Two rules earn their keep here. Nothing sustained sits below 82 Hz -- the older
  // version droned on a 27.5 Hz sawtooth, and a laptop speaker cannot render that
  // fundamental at all, so all you ever heard was its harmonics buzzing. And every
  // pitched voice has a real note attack, so the music reads as music instead of as
  // a hum you notice but cannot name.
  const hz = s => 55 * Math.pow(2, s / 12);          // hz(0) = A1, hz(36) = A4
  // [root, third] per bar; the triad is root + [0, third, 7].
  const CHORD = [[0, 3], [-4, 4], [3, 4], [-2, 4], [0, 3], [-4, 4], [-2, 4], [-5, 4]];
  //             Am      F        C       G        Am      F        G       E7 -> back to Am
  const BASS = [0, 0, 0, 12, 0, 0, 7, 12];           // one per 8th, semitones over the root
  const KICK = [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0];
  const SNAR = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
  // The melody, bar by bar, as flat [step, semitone over A4, length in 16ths] triples.
  // Written out rather than generated: a random walk through a pentatonic scale is why
  // the last one had no tune to remember.
  const MEL = [
    [0, 0, 2, 2, 0, 1, 3, 3, 1, 4, 7, 4, 8, 7, 2, 10, 8, 2, 12, 7, 4],
    [0, 5, 2, 2, 3, 2, 4, 5, 4, 8, 3, 2, 10, 0, 2, 12, 3, 4],
    [0, 3, 2, 2, 7, 2, 4, 10, 4, 8, 7, 2, 10, 3, 2, 12, 5, 4],
    [0, 2, 2, 2, 5, 2, 4, 2, 4, 8, -2, 2, 10, 2, 2, 12, 0, 4],
    [0, 12, 3, 3, 10, 1, 4, 7, 2, 6, 8, 2, 8, 7, 4, 12, 3, 2, 14, 5, 2],
    [0, 8, 4, 4, 7, 2, 6, 5, 2, 8, 3, 4, 12, 5, 4],
    [0, 7, 2, 2, 10, 2, 4, 12, 4, 8, 10, 2, 10, 7, 2, 12, 5, 4],
    [0, 2, 4, 4, 5, 4, 8, 2, 8],
  ];
  const STEP = { play: 0.1014, menu: 0.1563 };       // a 16th at 148 / 96 BPM
  let musMode = 'off', musTimer = null, musStep = 0, musT = 0, arpN = 0;
  // Two saws a hair apart under a filter that closes as the note decays. The sweep is
  // the whole trick: it turns a low sawtooth from a buzz into a plucked bass.
  // Every voice below sums its oscillators to unity before the envelope, so the gain
  // argument really is the peak -- otherwise a three-oscillator pad is three times
  // louder than it reads and the bus compressor ducks the gameplay on every downbeat.
  function mBass(t, f, dur, g) {
    const a = ac.createOscillator(), b = ac.createOscillator();
    const mix = ac.createGain(), lp = ac.createBiquadFilter(), gg = ac.createGain();
    a.type = b.type = 'sawtooth';
    a.frequency.value = f; b.frequency.value = f; b.detune.value = -9;
    mix.gain.value = 0.5;
    lp.type = 'lowpass'; lp.Q.value = 5;
    lp.frequency.setValueAtTime(Math.min(f * 11, 5000), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(f * 2.2, 130), t + dur * 0.9);
    gg.gain.setValueAtTime(0.0001, t);
    gg.gain.exponentialRampToValueAtTime(g, t + 0.008);
    gg.gain.exponentialRampToValueAtTime(g * 0.5, t + dur * 0.6);
    gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    a.connect(mix); b.connect(mix); mix.connect(lp); lp.connect(gg); gg.connect(busM);
    a.start(t); b.start(t); a.stop(t + dur + 0.02); b.stop(t + dur + 0.02);
  }
  // One chord tone: two detuned saws plus a quiet octave, opening and closing across
  // the bar. Mostly pushed into the room -- the pad is the layer that makes the other
  // three sound like they are standing in the same place.
  function mPad(t, f, dur, g, pan) {
    const lp = ac.createBiquadFilter(), gg = ac.createGain();
    lp.type = 'lowpass'; lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.linearRampToValueAtTime(1600, t + dur * 0.45);
    lp.frequency.linearRampToValueAtTime(1000, t + dur);
    // [detune in cents, frequency multiple, waveform, level]
    for (const v of [[-7, 1, 'sawtooth', 0.43], [7, 1, 'sawtooth', 0.43], [0, 2, 'triangle', 0.14]]) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.type = v[2]; o.frequency.value = f * v[1]; o.detune.value = v[0];
      og.gain.value = v[3];
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.05);
    }
    gg.gain.setValueAtTime(0.0001, t);
    gg.gain.exponentialRampToValueAtTime(g, t + dur * 0.3);
    gg.gain.exponentialRampToValueAtTime(g * 0.55, t + dur * 0.8);
    gg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(gg); gg.connect(dest({ bus: busM, rev: 0.55, pan }));
  }
  // Lead: triangle for the body, a little square for the edge, and a vibrato that only
  // opens after the attack, so held notes sing while the short ones stay clean.
  function mLead(t, f, dur, g) {
    const lp = ac.createBiquadFilter(), gg = ac.createGain();
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.8;
    lfo.frequency.value = 5.4;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(7, t + Math.min(0.26, dur * 0.7));
    lfo.connect(lg);
    // [waveform, level, detune in cents]
    for (const v of [['triangle', 0.78, 0], ['square', 0.22, 6]]) {
      const o = ac.createOscillator(), og = ac.createGain();
      o.type = v[0]; o.frequency.value = f; o.detune.value = v[2];
      og.gain.value = v[1]; lg.connect(o.detune);
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.07);
    }
    gg.gain.setValueAtTime(0.0001, t);
    gg.gain.exponentialRampToValueAtTime(g, t + 0.014);
    gg.gain.exponentialRampToValueAtTime(g * 0.7, t + dur * 0.7);
    gg.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    lp.connect(gg); gg.connect(dest({ bus: busM, rev: 0.3, dly: 0.22, pan: 0.06 }));
    lfo.start(t); lfo.stop(t + dur + 0.07);
  }
  // Kit. The kick is pitched down an octave in 75 ms, which is the only reason a sine
  // reads as a drum, and it comes with a noise click so it survives a small speaker.
  function mKick(t, g) {
    const o = ac.createOscillator(), gg = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.075);
    gg.gain.setValueAtTime(0.0001, t);
    gg.gain.exponentialRampToValueAtTime(g, t + 0.005);
    gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
    o.connect(gg); gg.connect(busM);
    o.start(t); o.stop(t + 0.21);
    noise({ t, type: 'highpass', f0: 2400, dur: 0.02, gain: g * 0.16, bus: busM });
  }
  function mSnare(t, g) {
    noise({ t, type: 'bandpass', q: 0.9, f0: 2100, f1: 1100, dur: 0.13, gain: g, bus: busM, rev: 0.3 });
    tone({ t, f0: 215, f1: 160, dur: 0.07, type: 'triangle', gain: g * 0.5, bus: busM });
  }
  function mHat(t, g, open) {
    noise({ t, type: 'highpass', f0: open ? 6200 : 7600, dur: open ? 0.12 : 0.028,
            gain: g, bus: busM, pan: 0.18, rev: open ? 0.25 : 0 });
  }
  // The arrangement. Sixteen bars long, not eight: the second pass through the chords
  // adds the layers the first one held back, so a long fight does not loop audibly
  // every thirteen seconds. `menu` is the same music with the kit and the bass line
  // taken out -- the same key, so entering a fight is a lift and not a cut.
  function musicTick() {
    if (!ac || musMode === 'off') return;
    if (ac.state !== 'running') { musT = 0; return; }        // suspended: do not pile notes up
    const stp = STEP[musMode] || 0.12, play = musMode === 'play', bar = stp * 16;
    if (musT < now()) musT = now() + 0.06;
    while (musT < now() + 0.35) {
      const s = musStep & 15, bi = (musStep >> 4) & 7, cyc = (musStep >> 7) & 1;
      const root = CHORD[bi][0], third = CHORD[bi][1];
      const t = musT + ((s & 1) ? stp * 0.07 : 0);          // a hair of swing off the beat
      if (s === 0) {                                        // one chord per bar, voiced wide
        const v = play ? 0.05 : 0.085;
        mPad(t, hz(root + 24), bar * 1.06, v, 0);
        mPad(t, hz(root + third + 24), bar * 1.06, v * 0.8, -0.35);
        mPad(t, hz(root + 31), bar * 1.06, v * 0.8, 0.35);
      }
      if (play) {
        if (!(s & 1)) mBass(t, hz(root + 12 + BASS[s >> 1]), stp * 1.7, 0.14);
        if (KICK[s]) mKick(t, 0.22);
        if (SNAR[s]) mSnare(t, 0.08);
        if ((bi === 3 || bi === 7) && (s === 10 || s === 14)) mSnare(t, 0.065);  // fill into the turn
        if (!(s & 1)) mHat(t, s % 4 === 0 ? 0.026 : 0.018, cyc === 1 && s === 14);
        else if (cyc) mHat(t, 0.011);
      } else if (s === 0 || s === 8) {
        mBass(t, hz(root + 12), stp * 6, 0.115);
      }
      if (play || cyc) {                                    // the tune
        const mel = MEL[bi];
        for (let i = 0; i < mel.length; i += 3)
          if (mel[i] === s) mLead(t, hz(mel[i + 1] + 36), stp * mel[i + 2] * 0.95, play ? 0.085 : 0.075);
      }
      // Broken chord: the menu's main voice, and the battle loop's second-pass counter-line.
      if (play ? (cyc === 1 && (s & 1)) : (s === 0 || s === 3 || s === 6 || s === 8 || s === 11 || s === 14)) {
        const deg = [0, third, 7, 12, 7, third][arpN++ % 6];
        tone({ t, f0: hz(root + 24 + deg), dur: stp * 2.4, type: 'triangle', atk: 0.005,
               gain: play ? 0.022 : 0.055, bus: busM, dly: 0.3, rev: 0.3, pan: -0.22 });
      }
      musStep++; musT += stp;
    }
  }
  function music(mode) {
    if (mode !== 'off' && !unlock()) return;
    if (mode === musMode) return;
    musMode = mode;
    if (mode === 'off') {
      if (musTimer) { clearInterval(musTimer); musTimer = null; }
      return;                                               // nothing is held: the tail rings out
    }
    musStep = 0; arpN = 0; musT = now() + 0.12;             // every entrance starts on bar one
    if (dlyNode) dlyNode.delayTime.setTargetAtTime((STEP[mode] || 0.12) * 3, now(), 0.05);
    if (!musTimer) musTimer = setInterval(musicTick, 60);
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
    // ---- trang bị rơi ra, và trang bị được nhặt ---------------------------
    // Hai việc khác nhau nên hai tiếng khác nhau, và cái phân biệt chúng không phải cao độ mà là
    // *hướng*: món bật ra là một tiếng tinh rơi xuống (cao xuống thấp, có tiếng xì của không khí),
    // món vào túi là một chuỗi đi lên và đóng lại. Người chơi biết mình vừa được thêm một món mà
    // không cần rời mắt khỏi con quái tiếp theo.
    //
    // `tier` là 0..3 theo bảng phẩm chất. Nó không đổi cao độ gốc -- một cái mũ Thường và một cái
    // mũ Huyền Thoại vẫn là cùng một tiếng, nên tai học được "đây là tiếng trang bị" ngay lần
    // đầu -- nó chỉ *thêm nốt*: Thường một nốt, Huyền Thoại bốn. Đó là lối rẻ nhất để "món xịn"
    // nghe ra là món xịn mà không cần một tiếng thứ ba.
    loot(tier, pan) {
      if (!unlock() || !gate('loot', 40)) return;
      const n = clamp((tier | 0) + 1, 1, 4);
      noise({ type: 'highpass', f0: 4200, f1: 1800, dur: 0.09, gain: 0.07, pan: pan });
      for (let i = 0; i < n; i++)
        tone({ f0: hz(48 + i * 5), f1: hz(41 + i * 5), dur: 0.16, type: 'triangle',
               gain: 0.10 - i * 0.012, at: i * 0.045, pan: pan });
    },
    pick(tier) {
      if (!unlock() || !gate('pick', 55)) return;
      const n = clamp((tier | 0) + 2, 2, 5);
      for (let i = 0; i < n; i++)
        tone({ f0: hz(36 + i * 7), dur: 0.13 + i * 0.02, type: 'triangle',
               gain: 0.11, at: i * 0.035, atk: 0.004 });
      // Nốt đóng, một quãng tám trên nốt cuối và mảnh hơn: không có nó thì chuỗi đi lên rồi cụt,
      // và một món Huyền Thoại nghe ra như một món Thường bị kéo dài.
      tone({ f0: hz(36 + n * 7), dur: 0.24, type: 'sine', gain: 0.07, at: n * 0.035 });
      noise({ type: 'highpass', f0: 3000, f1: 6000, dur: 0.08, gain: 0.05 });
    },
    // ---- cánh cổng boss --------------------------------------------------
    // Ba khoảnh khắc, một họ âm: cổng mở ra, bước vào, bước ra. Cái nối chúng lại là quãng năm
    // rỗng (0 và 7) giữ nguyên ở cả ba tiếng -- tai nhận ra "cái cổng" trước khi kịp phân biệt là
    // vào hay ra. Cái tách chúng ra là *hướng của cú quét*: mở là một tiếng dâng lên và ở lại,
    // vào là một cú hút xuống rồi bùng, ra là một tiếng thở phào đi xuống rồi mở sáng.
    //
    // Tiếng mở cố tình dài (1,2 giây) và không có gate: nó là cái thông báo duy nhất rằng có một
    // cánh cổng vừa xuất hiện ở đâu đó sau lưng, nên nó phải chen được qua giữa một trận đánh.
    portal(kind, pan) {
      if (!unlock()) return;
      if (kind === 'open') {
        noise({ type: 'bandpass', f0: 320, f1: 1500, dur: 1.2, gain: 0.14, pan: pan });
        [0, 7, 12].forEach((s, i) => tone({
          f0: hz(s + 24), f1: hz(s + 31), dur: 0.9, type: 'sine',
          gain: 0.11 - i * 0.02, at: i * 0.11, atk: 0.12, pan: pan }));
        tone({ f0: 55, f1: 82, dur: 1.0, gain: 0.22, atk: 0.2 });
        return;
      }
      if (kind === 'in') {
        // Hút: quét xuống, rồi một cú bùng trắng. Đây là tiếng của "sàn vừa đổi".
        noise({ type: 'bandpass', f0: 2400, f1: 220, dur: 0.34, gain: 0.2 });
        [19, 12, 7, 0].forEach((s, i) => tone({
          f0: hz(s + 24), dur: 0.2, type: 'triangle', gain: 0.12, at: i * 0.035 }));
        tone({ f0: 140, f1: 42, dur: 0.5, gain: 0.34, at: 0.14 });
        noise({ type: 'highpass', f0: 900, f1: 4000, dur: 0.22, gain: 0.16, at: 0.16 });
        return;
      }
      [0, 7, 12, 24].forEach((s, i) => tone({
        f0: hz(s + 24), dur: 0.45, type: 'sine', gain: 0.12 - i * 0.015, at: i * 0.06, atk: 0.02 }));
      noise({ type: 'highpass', f0: 1200, f1: 5200, dur: 0.3, gain: 0.12 });
      tone({ f0: 82, f1: 110, dur: 0.5, gain: 0.2 });
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
