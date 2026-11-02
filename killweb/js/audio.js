// Kill Web: synthesized sound. Nothing is downloaded: every cue is built from oscillators and filtered noise.
export class Audio {
  constructor() { this.ctx = null; this.vol = { master: 0.8, sfx: 0.9, amb: 0.5, music: 0.35 }; this.last = {}; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { return; }
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -16; this.comp.ratio.value = 4;
    this.master = c.createGain(); this.master.connect(this.comp); this.comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.amb = c.createGain(); this.amb.connect(this.master);
    this.mus = c.createGain(); this.mus.connect(this.master);
    // shared noise buffer
    const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
    // a short echo for radio cues
    this.echo = c.createDelay(1); this.echo.delayTime.value = 0.13;
    const fb = c.createGain(); fb.gain.value = 0.28; this.echo.connect(fb); fb.connect(this.echo);
    const eo = c.createGain(); eo.gain.value = 0.35; this.echo.connect(eo); eo.connect(this.sfx);
    this.apply();
  }
  apply() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(this.vol.amb * 0.5, t, 0.3);
    this.mus.gain.setTargetAtTime(this.vol.music * 0.45, t, 0.3);
  }
  set(v) { Object.assign(this.vol, v); this.apply(); }
  ok(key, gap) { const now = performance.now(); if (this.last[key] && now - this.last[key] < gap) return false; this.last[key] = now; return !!this.ctx; }
  tone(f, dur, { type = 'sine', gain = 0.2, f2 = null, delay = 0, out = null, attack = 0.005 } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || this.sfx); o.start(t); o.stop(t + dur + 0.05);
    return g;
  }
  noise(dur, { gain = 0.3, type = 'lowpass', f = 800, f2 = null, q = 0.7, delay = 0, attack = 0.005, out = null } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(out || this.sfx);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  ui() { if (!this.ok('ui', 40)) return; this.tone(1350, 0.05, { gain: 0.06, f2: 900 }); }
  confirm() { if (!this.ok('cf', 80)) return; this.tone(660, 0.07, { gain: 0.09 }); this.tone(990, 0.1, { gain: 0.09, delay: 0.07 }); }
  error() { if (!this.ok('er', 200)) return; this.tone(180, 0.18, { type: 'square', gain: 0.05 }); this.tone(150, 0.2, { type: 'square', gain: 0.05, delay: 0.1 }); }
  ping() { if (!this.ok('ping', 350)) return; const g = this.tone(1560, 0.5, { gain: 0.07 }); g.connect(this.echo); }
  alert() { if (!this.ok('al', 900)) return; for (let i = 0; i < 2; i++) { this.tone(880, 0.11, { type: 'triangle', gain: 0.08, delay: i * 0.24 }); this.tone(660, 0.11, { type: 'triangle', gain: 0.08, delay: i * 0.24 + 0.12 }); } }
  warn() { if (!this.ok('wn', 600)) return; this.tone(520, 0.16, { type: 'triangle', gain: 0.07 }); this.tone(390, 0.22, { type: 'triangle', gain: 0.07, delay: 0.16 }); }
  good() { if (!this.ok('gd', 400)) return; this.tone(740, 0.09, { gain: 0.06 }); this.tone(1110, 0.14, { gain: 0.06, delay: 0.08 }); }
  radio() { if (!this.ok('rd', 250)) return; this.noise(0.07, { gain: 0.05, type: 'bandpass', f: 2400, q: 2 }); this.tone(1900, 0.04, { gain: 0.03, delay: 0.05 }); }
  launch(k = 1) { if (!this.ok('ln', 90)) return; this.noise(0.9 * k, { gain: 0.16 * k, type: 'bandpass', f: 400, f2: 2600, q: 1.2, attack: 0.03 }); this.noise(0.35, { gain: 0.08 * k, type: 'lowpass', f: 300 }); }
  boom(k = 1) { if (!this.ok('bm', 70)) return; k = Math.max(0.15, Math.min(1, k)); this.noise(1.6 * (0.6 + 0.4 * k), { gain: 0.42 * k, type: 'lowpass', f: 900, f2: 60, q: 0.9, attack: 0.004 }); this.tone(70, 0.6, { gain: 0.25 * k, f2: 32 }); }
  pop(k = 1) { if (!this.ok('pp', 60)) return; k = Math.max(0.15, Math.min(1, k)); this.noise(0.25, { gain: 0.2 * k, type: 'highpass', f: 900, q: 0.6, attack: 0.002 }); this.noise(0.5, { gain: 0.12 * k, type: 'lowpass', f: 500, f2: 120 }); }
  win() { if (!this.ctx) return; [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 1.6, { type: 'triangle', gain: 0.07, delay: i * 0.12, attack: 0.04 })); }
  lose() { if (!this.ctx) return; [392, 330, 262].forEach((f, i) => this.tone(f, 1.4, { type: 'triangle', gain: 0.07, delay: i * 0.22, attack: 0.04 })); }
  // ambient bed: wind and a low equipment hum
  ambient(on, night) {
    if (!this.ctx) return;
    if (this.ambNodes) { for (const n of this.ambNodes) { try { n.stop(); } catch (e) { /* stopped */ } } this.ambNodes = null; }
    if (!on) return;
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = night ? 260 : 420;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(f.frequency);
    const g = c.createGain(); g.gain.value = 0.22; s.connect(f); f.connect(g); g.connect(this.amb);
    const h = c.createOscillator(); h.type = 'sine'; h.frequency.value = 58; const hg = c.createGain(); hg.gain.value = 0.025; h.connect(hg); hg.connect(this.amb);
    s.start(); lfo.start(); h.start();
    this.ambNodes = [s, lfo, h];
  }
  // a slow generative pad for menus and missions
  music(on, mood = 'menu') {
    if (!this.ctx) return;
    if (this.musNodes) { const t = this.ctx.currentTime; for (const n of this.musNodes) { try { n.stop(t + 1.5); } catch (e) { /* ignore */ } } this.musNodes = null; clearInterval(this.musTimer); }
    if (!on) return;
    const c = this.ctx;
    const out = c.createGain(); out.gain.value = 0.0001; out.gain.setTargetAtTime(1, c.currentTime, 2);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = mood === 'menu' ? 900 : 700; lp.Q.value = 0.5;
    lp.connect(out); out.connect(this.mus);
    const chords = mood === 'menu' ? [[110, 164.8, 220, 261.6], [98, 146.8, 196, 233.1], [87.3, 130.8, 174.6, 220], [98, 146.8, 196, 246.9]]
      : [[73.4, 110, 146.8, 174.6], [65.4, 98, 130.8, 155.6], [73.4, 110, 146.8, 185], [61.7, 92.5, 123.5, 146.8]];
    const oscs = [];
    for (let v = 0; v < 4; v++) for (const det of [-6, 6]) {
      const o = c.createOscillator(); o.type = v === 0 ? 'triangle' : 'sawtooth'; o.detune.value = det;
      const g = c.createGain(); g.gain.value = v === 0 ? 0.05 : 0.018; o.connect(g); g.connect(lp); o.start(); oscs.push(o);
    }
    let i = 0;
    const step = () => {
      const ch = chords[i++ % chords.length], t = c.currentTime;
      oscs.forEach((o, k) => o.frequency.setTargetAtTime(ch[k >> 1] * (k >> 1 === 0 ? 1 : 1), t, 1.2));
    };
    step();
    this.musTimer = setInterval(step, mood === 'menu' ? 7000 : 9000);
    this.musNodes = oscs;
  }
}
