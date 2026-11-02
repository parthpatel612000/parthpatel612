// Kill Web: a mission in progress. Game loop with automatic tempo, camera input, HUD, cards, commands, coach, ending.
import { World } from './world.js';
import { Overlay, affOf, isAir, trackName, unitStatus, fmtT, fmtMS, SYM, COL } from './overlay.js';
import { esc, Rules, LOGO } from './app.js';

const KW = window.KW;
const $ = (id) => document.getElementById(id);
const STEP = 0.25;
const SPEEDS = ['auto', 1, 2, 4, 8];
const SKIP = 24;
const PACE_DEF = { lv: 1, name: 'Patrol', es: 1, er: 1, fd: 1, quiet: 10, hot: 3, reward: 1, blurb: '' };
const xs = (v) => `${+v.toFixed(2)}x`;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = Math.hypot;
const symSvg = (key, w = 14, h = 12) => {
  const a = key[0], c = COL[a], f = { f: 'rgba(108,198,255,0.22)', h: 'rgba(255,107,94,0.25)', u: 'rgba(255,216,102,0.25)', n: 'rgba(142,219,142,0.25)' }[a];
  return `<svg width="${w}" height="${h}" viewBox="0 0 16 13" aria-hidden="true"><path d="${SYM[key]}${key.endsWith('gnd') || key === 'u-air' ? '' : ' Z'}" fill="${f}" stroke="none"/><path d="${SYM[key]}" fill="none" stroke="${c}" stroke-width="1.6"/></svg>`;
};
const symKeyOf = (e) => affOf(e) + '-' + (isAir(e) ? 'air' : 'gnd');
const BEHAVIOR = {
  wasp: 'Attack quadcopter. Flies at the nearest asset and detonates.', gnat: 'Spotter. Finds targets for Vanta artillery and swarms.',
  kite: 'Recon drone. Circles and reports what it sees.', lance: 'One-way attack drone. Fast and low, aimed at a site.',
  spear: 'Cruise missile. Skims the ground; radar sees it late.', shrike: 'Armed MALE drone. Guides glide bombs onto sites.',
  talon: 'Attack helicopter. Rockets against ground assets.', scythe: 'Fighter-bomber. Air-to-air missiles; hunts your aircraft and carries cruise missiles.',
  mother: 'Drone carrier. Launches swarms in flight. Point defense knocks down single shots: salvo it.',
  jackal: 'Pickup with MANPADS. Shoots at low aircraft within 3.5 km.', ram: 'Armored carrier with a cannon.', bastion: 'Main battle tank. Light weapons barely scratch it.',
  hydra: 'Rocket artillery. Fires long salvos at sites from a hide.', spire: 'SAM site. Its radar transmits, so Pulsar can hear it. Cruise missiles fly under it.',
  static: 'EW jammer. Shrinks your mesh inside its bubble.', c2post: 'Vanta command post.', lsite: 'Drone launch site. Feeds raids until destroyed.',
  airliner: 'Civil airliner on the corridor. Broadcasting ADS-B.', civcar: 'Civilian vehicle on the road.', medevac: 'Air ambulance. Never engage.', boat: 'Fishing boat.',
};
const SCOUT_TYPES = ['ghost', 'altius', 'bolt', 'thunder', 'omen'];
const DIRWORD = { N: 'the north', NE: 'the northeast', NW: 'the northwest', E: 'the east', W: 'the west', S: 'the south' };
const DIRPT = { N: [20, 5], NE: [32, 5], NW: [8, 5], E: [35, 12], W: [5, 12], S: [20, 22] };

function patch(el, sig, html, fields) {
  if (!el) return;
  if (el._sig !== sig) { el.innerHTML = html; el._sig = sig; el._els = null; }
  if (!el._els) { el._els = {}; el.querySelectorAll('[data-f]').forEach((n) => { el._els[n.dataset.f] = n; }); }
  if (!fields) return;
  for (const k in fields) {
    const n = el._els[k]; if (!n) continue;
    const v = fields[k];
    if (v && typeof v === 'object') {
      if (v.w != null && n.style.width !== v.w) n.style.width = v.w;
      if (v.t != null && n.textContent !== String(v.t)) n.textContent = v.t;
      if (v.c != null && n.style.color !== v.c) n.style.color = v.c;
      if (v.bg != null && n.style.background !== v.bg) n.style.background = v.bg;
      if (v.dis != null) n.disabled = v.dis;
      if (v.cls != null && n.className !== v.cls) n.className = v.cls;
      if (v.p != null) n.setAttribute('aria-pressed', v.p);
    } else if (n.textContent !== String(v)) n.textContent = v;
  }
}

export class Mission {
  constructor(app) { this.app = app; this.built = false; this.running = false; this.keys = {}; }

  // ---------------------------------------------------------------- lifecycle
  async start(def, loadout, autonomy) {
    const app = this.app, p = app.profile;
    this.stop();
    this.def = def; this.loadout = loadout;
    app.show('mission');
    if (app.settings.music) { app.audio.music(true, 'mission'); app.musicOn = 'mission'; }
    this.compact = window.innerWidth < 1180 || window.innerHeight < 620;
    this.paceLv = clamp(Math.round(p.pace || 1), 1, (KW.PACE || [PACE_DEF]).length);
    this.coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
    this.buildHud();
    this.showBriefing();
    // fresh canvas per mission so the GPU context starts clean
    const old = $('gl'); const cv = document.createElement('canvas'); cv.className = 'gl'; cv.id = 'gl'; old.replaceWith(cv);
    const low = app.settings.quality === 'low' || (app.settings.quality === 'auto' && (Math.min(window.innerWidth, window.innerHeight) < 500 || (navigator.hardwareConcurrency || 8) <= 4));
    this.world = new World(cv, { low, maxDpr: low ? 1 : 1.5 });
    this.overlay = new Overlay($('ov'), this.world);
    this.resize();
    this.seed = (Math.random() * 1e9) >>> 0; this.autonomy0 = autonomy || 'supervised';
    this.sim = this.makeSim();
    this.ui = { sel: null, hover: null, hoverPad: null, mode: null, cursorKm: null, preview: null, labels: app.settings.labels, opt: null, ltab: 'tracks', follow: null };
    this.speedMode = app.settings.speedMode || 'auto'; this.speed = 2; this.autoSpeed = this.tempo().quiet; this.skip = false; this.hot = false; this.hotT = 0;
    this.paused = true; this.started = false; this.acc = 0; this.evI = 0; this.shotSeen = new Set(); this.fxSeen = new WeakSet();
    this.extra = { loadout, shots: {}, kills: [], tracks: [], raids: [] }; this.renderPace(); this.trackLog = {}; this.endT = null; this.slowT = 0; this.lastWi = 0; this.ticker = []; this.bannerT = 0;
    this.coach = def.tutorial && !(p.done[def.id] && p.done[def.id].best === 'win') ? { step: 0, t: 0 } : null;
    $('hud').classList.toggle('l-open', !this.compact);
    try {
      await this.world.load(def, `assets/${def.id}/`, (f) => { const b = $('mLoadBar'); if (b) b.style.width = Math.round(5 + f * 95) + '%'; });
    } catch (e) {
      console.error(e);
      const l = $('mBriefGo'); if (l) { l.textContent = 'Could not load. Back'; l.disabled = false; l.onclick = () => app.menus.campaign(); }
      return;
    }
    this.buildMinimap();
    this.running = true; this.last = performance.now();
    this.hudT = 0; this.mmT = 0;
    this.renderHud(true);
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const go = $('mBriefGo');
    if (go) { go.disabled = false; go.textContent = 'BEGIN'; go.focus(); }
    const bar = $('mLoadWrap'); if (bar) bar.hidden = true;
  }
  showBriefing() {
    const def = this.def, i = Rules.idx(def.id);
    const objs = def.objectives.filter((o) => !o.bonus).map((o) => `<div class="obj"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="#6cc6ff" stroke-width="1.6"/></svg><span>${esc(o.label)}</span></div>`).join('');
    const keys = this.coarse ? 'Long-press a hostile to engage' : 'Right-click a hostile to engage · N next raid · Space pause';
    $('hud').insertAdjacentHTML('beforeend', `<div class="brief" id="mBrief"><div class="brief-in">
      <div class="bhead"><span class="lbl" style="color:var(--amber)">MISSION ${i + 1} OF 9${def.night ? ' · NIGHT' : ''}</span><h2>${esc(def.name.toUpperCase())}</h2><span class="bsum">${esc(def.sum || def.place)}</span></div>
      <div class="objs">${objs}</div>
      <div class="bfoot">${this.paceHtml()}<div class="go"><div class="bar" id="mLoadWrap"><i id="mLoadBar" style="width:5%;background:var(--amber)"></i></div><button class="btn primary big" type="button" id="mBriefGo" disabled>LOADING</button></div></div>
      <span class="bkeys">${esc(keys)}</span>
    </div></div>`);
    $('mBriefGo').onclick = () => this.begin();
  }
  // ---------------------------------------------------------------- pace levels
  tempo() { return (KW.PACE && KW.PACE[this.paceLv - 1]) || PACE_DEF; }
  makeSim() {
    const p = this.app.profile;
    return new KW.Sim(this.def, Rules.simProfile(p), { loadout: this.loadout, autonomy: this.autonomy0, difficulty: p.difficulty, seed: this.seed, pace: this.paceLv });
  }
  paceHtml() {
    const d = this.app.profile.done[this.def.id], best = (d && d.pace) || 0;
    return `<div class="pace" id="mPace"><span class="lbl">PACE</span><div class="seg" role="radiogroup" aria-label="Pace level">${(KW.PACE || [PACE_DEF]).map((q) => `<button type="button" class="pl l${q.lv}${q.lv <= best ? ' won' : ''}" data-cmd="pace" data-v="${q.lv}" role="radio" aria-checked="false" title="${esc(q.name)}">${q.lv}</button>`).join('')}</div><span class="pn" id="mPaceName"></span></div>`;
  }
  renderPace() {
    const q = this.tempo();
    document.querySelectorAll('#mPace [data-v]').forEach((b) => b.setAttribute('aria-checked', String(+b.dataset.v === q.lv)));
    const el = $('mPaceName'); if (el) el.innerHTML = `<b>${esc(q.name.toUpperCase())}</b>${q.reward > 1 ? ` <span>+${Math.round((q.reward - 1) * 100)}%</span>` : ''}`;
  }
  setPace(L) {
    const n = (KW.PACE || [PACE_DEF]).length;
    L = clamp(Math.round(L), 1, n);
    if (L === this.paceLv) return;
    this.paceLv = L;
    const p = this.app.profile; p.pace = L; this.app.save();
    // the battlefield waits at H+0 behind the briefing, so the sim is simply rebuilt at the new pace
    if (!this.started && this.sim && this.sim.t === 0) { this.sim = this.makeSim(); this.lastWi = 0; this.autoSpeed = this.tempo().quiet; this.renderHud(true); }
    this.renderPace();
  }
  begin() {
    if (!this.running || this.started) return;
    const b = $('mBrief'); if (b) b.remove();
    this.started = true; this.paused = false;
    this.app.audio.confirm();
    this.app.audio.ambient(true, this.def.night);
    this.renderHud(true);
  }
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.world) { try { this.world.dispose(); } catch (e) { /* ignore */ } this.world = null; }
    this.app.audio.ambient(false);
  }
  resize() {
    if (!this.world) return;
    const r = $('mission').getBoundingClientRect();
    const W = r.width || window.innerWidth, H = r.height || window.innerHeight;
    this.world.resize(W, H);
    this.overlay.resize(W, H, Math.min(2, window.devicePixelRatio || 1));
    this.world.uiScale = H < 520 ? 0.8 : 1;
    this.updateSafe();
  }
  updateSafe() {
    if (!this.overlay) return;
    const w = this.overlay.w, h = this.overlay.h;
    const mr = $('mission').getBoundingClientRect();
    const rect = (q) => { const n = typeof q === 'string' ? document.querySelector(q) : q; if (!n || n.hidden || n.offsetParent === null) return null; const b = n.getBoundingClientRect(); return b.width && b.height ? { x: b.left - mr.left, y: b.top - mr.top, w: b.width, h: b.height } : null; };
    // panels slide with transforms; layout boxes give where they come to rest
    const lay = (q) => { const n = document.querySelector(q); return n && n.offsetWidth ? { x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight } : null; };
    const L = $('hud').classList.contains('l-open') ? lay('.lcol') : rect('#mRail');
    const R = $('hud').classList.contains('r-open') ? lay('.rcol') : null;
    const D = rect('#mDock .in');
    this.overlay.safe = { x0: L ? L.x + L.w + 6 : 4, y0: 52, x1: R ? R.x - 6 : w - 4, y1: D ? D.y - 6 : h - 4 };
    this.overlay.blocks = ['.viewtog', '#mCompass', '#mCoach', '#mHint', '#mBanner', '#mTicker'].map(rect).filter(Boolean);
  }

  // ---------------------------------------------------------------- loop
  effSpeed() { return this.paused ? 0 : this.speedMode === 'auto' ? this.autoSpeed : this.speed; }
  frame(now) {
    if (!this.running) return;
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dtR = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const sim = this.sim, W = this.world;
    // automatic tempo: fast through quiet stretches, slower while anything is in contact
    this.hotT -= dtR;
    if (this.hotT <= 0) {
      this.hotT = 0.4; this.hot = this.isHot();
      if (this.skip) {
        if (sim.wi > this.skipWi) { this.skip = false; this.renderTop(); }
        else if (!this.hot) { if (!this.skipQuiet) { this.skipQuiet = true; this.renderTop(); } }
        else if (this.skipQuiet) { this.skip = false; this.renderTop(); }
      }
    }
    const tp = this.tempo();
    const target = this.skip && !this.hot ? SKIP : this.hot ? tp.hot : tp.quiet;
    this.autoSpeed += (target - this.autoSpeed) * (1 - Math.exp(-dtR * (target < this.autoSpeed ? 6 : 1.5)));
    const sp = this.effSpeed();
    if (sp > 0 && !sim.outcome) {
      this.acc += dtR * sp;
      let n = 0;
      while (this.acc >= STEP && n < 24) {
        for (const e of sim.ents) { e._px = e.x; e._py = e.y; e._ph = e.hdg; }
        for (const s of sim.shots) { s._px = s.x; s._py = s.y; }
        sim.step(STEP); this.acc -= STEP; n++;
        this.afterStep();
      }
      if (n >= 24) this.acc = 0;
    }
    if (sim.outcome && this.endT == null) { this.endT = now; this.banner(sim.outcome.win ? 'MISSION COMPLETE' : 'MISSION FAILED', sim.outcome.win ? '' : sim.outcome.reason, sim.outcome.win ? 'good' : 'bad', 4); }
    const alpha = clamp(this.acc / STEP, 0, 1);
    this.keysPan(dtR);
    if (this.ui.follow != null) {
      const e = sim.byId(this.ui.follow);
      if (!e || !e.alive) this.ui.follow = null;
      else { const x = e.side !== 'f' && e.trk ? e.trk.ex : e.x, y = e.side !== 'f' && e.trk ? e.trk.ey : e.y; W.goal = Object.assign(W.goal || {}, { tx: W.wx(x), tz: W.wz(y) }); }
    }
    W.fxSpeed = sp;
    W.updateCamera(dtR);
    W.sync(sim, sp > 0 ? alpha : 1, dtR, this.ui);
    W.render();
    if (this.started) this.overlay.draw(sim, this.ui, dtR); else this.overlay.clear();
    this.hudT -= dtR; this.mmT -= dtR;
    if (this.hudT <= 0) { this.hudT = 0.2; this.renderHud(); this.safeT = (this.safeT || 0) + 1; if (this.safeT % 5 === 0) this.updateSafe(); }
    if (this.mmT <= 0) { this.mmT = 0.25; this.drawMinimap(); }
    if (this.coach && this.started) this.coachStep(dtR);
    if (this.bannerT > 0) { this.bannerT -= dtR; if (this.bannerT <= 0) { const b = $('mBanner'); if (b) b.hidden = true; } }
    if (this.endT != null && now - this.endT > 3800) this.finish();
  }
  isHot() {
    const sim = this.sim;
    if (sim.shots.some((s) => !s.dead && (s.side === 'h' || s.W.kind !== 'loiter'))) return true;
    const gnd = sim.ents.filter((f) => f.alive && f.side === 'f' && !f.band);
    for (const e of sim.ents) {
      if (!e.alive || e.side !== 'h' || e.dormant) continue;
      const k = e.trk; if (!k || !k.det) continue;
      if (!e.vmax && k.known) continue;
      for (const f of gnd) if (hyp(f.x - k.ex, f.y - k.ey) < (e.band ? 9 : 6)) return true;
    }
    return false;
  }
  afterStep() {
    const sim = this.sim, app = this.app, W = this.world, ov = this.overlay;
    while (this.evI < sim.events.length) {
      const e = sim.events[this.evI++];
      const t = e.text || '';
      if (e.kind === 'track' && /^New track/.test(t)) app.audio.ping();
      else if (e.kind === 'id') {
        if (e.cat !== 'good') { app.audio.alert(); this.autoSlow('Hostile identified'); }
      } else if (e.kind === 'kill') {
        app.audio.good();
        const en = sim.byId(e.id);
        if (en) { const big = (en.T.value || 0) >= 40; ov.float(en.x, en.y, W.altOf(en), big ? `${en.T.name} DOWN` : 'SPLASH', big ? '#ffcf85' : '#d6f5d6', big ? 15 : 12); }
      } else if (e.cat === 'bad') {
        app.audio.warn();
        if (/hit\./.test(t)) { const s = sim.sites.find((q) => q.name === e.who) || (e.id && sim.byId(e.id)); if (s) ov.float(s.x, s.y, 0, 'HIT', '#ff8a7e'); }
        if (/Missile launch|destroyed|lost|hit/i.test(t)) this.autoSlow(t.length < 60 ? t : 'Under attack');
      }
      const prot = e.kind === 'hit' && (() => { const q = sim.byId(e.id); return q && (q.T.kind === 'site' || q.type === 'menace' || q.isTruck); })();
      if (e.kind === 'lost' || e.kind === 'harm' || prot) this.pushTicker(e);
    }
    // raids
    if (sim.wi > this.lastWi) {
      for (let i = this.lastWi; i < sim.wi; i++) { const txt = this.raidBanner(sim.waves[i]); if (txt) this.extra.raids.push([sim.t, `Raid ${i + 1}: ${txt}`]); }
      this.lastWi = sim.wi;
    }
    for (const s of sim.shots) {
      if (this.shotSeen.has(s.id)) continue;
      this.shotSeen.add(s.id);
      if (s.side === 'f') {
        const u = sim.byId(s.from); const pid = s.prod || (u && u.prod);
        if (pid) this.extra.shots[pid] = (this.extra.shots[pid] || 0) + 1;
        app.audio.launch(s.W.kind === 'area' ? 0.8 : 0.6);
      }
    }
    for (const f of sim.fx) {
      if (this.fxSeen.has(f)) continue;
      this.fxSeen.add(f);
      if (f.kind === 'tracer') continue;
      const cp = W.camera.position;
      const d = Math.hypot(cp.x - W.wx(f.x), cp.y - W.surfaceAt(f.x, f.y), cp.z - W.wz(f.y));
      const k = clamp(1.4 - d / 45000, 0.12, 1);
      if (f.kind === 'boom') { app.audio.boom(k * (f.r > 0.5 ? 1 : 0.7)); this.extra.kills.push({ x: f.x, y: f.y, side: f.side === 'f' ? 'h' : 'f', big: f.r > 0.5 }); }
      else if (f.kind === 'pop' || f.kind === 'burst') app.audio.pop(k);
      
    }
    if (((sim.t / STEP) | 0) % 40 === 0) {
      for (const e of sim.ents) {
        if (!e.alive || e.side !== 'h' || !(e.cls === 'boss' || (e.T.value >= 60 && e.band > 0)) || !e.trk || !e.trk.known) continue;
        const tl = this.trackLog[e.id] || (this.trackLog[e.id] = { name: e.T.name, pts: [] });
        tl.pts.push([e.x, e.y]);
      }
      this.extra.tracks = Object.values(this.trackLog);
    }
  }
  raidBanner(w) {
    if (!w) return null;
    const counts = {}; let from = null;
    for (const u of w.units) { const T = KW.ET[u.type]; if (!T) continue; counts[T.name] = (counts[T.name] || 0) + Math.max(1, Math.round(u.n * (u.n >= 3 ? this.sim.diffN : 1))); if (!from && typeof u.from === 'string') from = u.from.split(':')[0]; }
    const parts = Object.entries(counts).map(([n, c]) => `${c} ${n}`);
    if (!parts.length) return null;
    const txt = `${parts.join(', ')}${DIRWORD[from] ? ' · ' + DIRWORD[from].replace('the ', '').toUpperCase() : ''}`;
    if (!this.started) return txt;
    this.raidPt = DIRPT[from] || null;
    this.banner('RAID', txt, 'warn', 5, !!this.raidPt);
    this.app.audio.warn();
    return txt;
  }
  banner(title, sub, kind, secs, show) {
    const b = $('mBanner'); if (!b) return;
    b.className = 'banner ' + (kind || '');
    b.innerHTML = `<span class="bt">${esc(title)}</span>${sub ? `<span class="bs">${esc(sub)}</span>` : ''}${show ? '<button class="btn xs" type="button" data-cmd="raidshow">Show</button>' : ''}`;
    b.hidden = false; this.bannerT = secs || 5;
  }
  pushTicker(e) {
    this.ticker.push({ e, t: performance.now() });
    if (this.ticker.length > 4) this.ticker.shift();
    this.tickDirty = true;
  }
  autoSlow(why) {
    if (this.speedMode === 'auto') return;
    if (!this.app.settings.autoSlow || this.speed <= 2 || this.paused) return;
    const now = performance.now();
    if (now - this.slowT < 15000) return;
    this.slowT = now; this.speed = 1; this.renderTop();
    this.toast('Slowed to 1x');
  }
  setSpeed(s) { if (s === 'auto') this.speedMode = 'auto'; else { this.speedMode = 'fixed'; this.speed = +s; } this.skip = false; this.paused = false; this.app.settings.speedMode = this.speedMode; this.renderTop(); }
  togglePause() { if (!this.started) return this.begin(); this.paused = !this.paused; this.app.audio.ui(); this.renderTop(); }
  skipToRaid() {
    const sim = this.sim;
    if (sim.wi >= sim.waves.length) { this.toast('No more raids'); return; }
    this.speedMode = 'auto'; this.paused = false; this.skip = true; this.skipWi = sim.wi; this.hot = this.isHot(); this.skipQuiet = !this.hot;
    if (this.hot) this.toast('Skip queued');
    this.renderTop();
  }
  toast(msg) {
    const t = $('mToast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(this.toastT); this.toastT = setTimeout(() => { t.hidden = true; }, 3200);
  }
  finish() {
    if (!this.running) return;
    const app = this.app, sim = this.sim, def = this.def;
    this.running = false;
    cancelAnimationFrame(this.raf);
    const rep = Rules.finish(app.profile, def, sim, this.extra);
    app.save();
    this.stop();
    app.menus.debrief(def, sim, rep, this.extra);
  }
  abandon() {
    if (!this.sim.outcome) this.sim.outcome = { win: false, reason: 'mission abandoned', t: this.sim.t };
    this.finish();
  }

  // ---------------------------------------------------------------- HUD skeleton
  buildHud() {
    const hud = $('hud');
    const def = this.def, i = Rules.idx(def.id);
    const fsOK = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    hud.className = 'hud';
    hud.innerHTML = `
      <div class="topbar"><div class="brand">${LOGO}<div class="bt"><span class="t1">M${i + 1} · ${esc(def.name.toUpperCase())}</span><span class="t2">${esc(def.place)}</span></div><span class="bm" title="${esc(def.name)}">M${i + 1}</span></div>
        <div class="clock"><span class="t" id="mClock">H+00:00:00</span>
          <button class="icon-btn" type="button" data-cmd="pause" id="mPause" aria-label="Pause"></button>
          <div class="speeds" id="mSpeeds">${SPEEDS.map((s) => `<button class="btn" type="button" data-cmd="speed" data-v="${s}" ${s === 'auto' ? 'title="Fast when quiet, slower in contact"' : ''}>${s === 'auto' ? 'AUTO' : s + 'x'}</button>`).join('')}</div>
          <button class="btn skip" type="button" data-cmd="skip" id="mSkip" title="Run ahead to the next raid"><span id="mNext">NEXT RAID</span><svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" fill="currentColor"><path d="M0 0 L6 5 L0 10 Z M7 0 L13 5 L7 10 Z"/></svg></button></div>
        <div class="topstats">
          <div class="ts"><span class="k">SUPPLY</span><span class="v"><span class="sup" id="mSup">0</span><small id="mRate"></small></span></div>
          <div class="ts"><span class="k">KILLS</span><span class="v" id="mKills">0</span></div>
          <div class="tog"><span class="lbl lblx">ROE</span><button class="btn" type="button" data-cmd="roe" data-v="tight" id="roeT">TIGHT</button><button class="btn" type="button" data-cmd="roe" data-v="free" id="roeF">FREE</button></div>
          <div class="tog"><span class="lbl lblx">AUTONOMY</span><button class="btn" type="button" data-cmd="auto" data-v="manual" id="auM" title="Manual: you approve every shot"><span class="lng">MANUAL</span><span class="sht">MAN</span></button><button class="btn" type="button" data-cmd="auto" data-v="supervised" id="auS" title="Supervised: defenses engage identified hostiles"><span class="lng">SUPERVISED</span><span class="sht">SUP</span></button><button class="btn" type="button" data-cmd="auto" data-v="auto" id="auA" title="Autonomous: defenses, strikes and scouts run themselves"><span class="lng">AUTONOMOUS</span><span class="sht">AUTO</span></button></div>
        </div>
        <div class="tright">${fsOK ? '<button class="icon-btn" type="button" data-cmd="fullscreen" aria-label="Full screen" title="Full screen"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 5 V1 H5 M9 1 H13 V5 M13 9 V13 H9 M5 13 H1 V9"/></svg></button>' : ''}<button class="icon-btn" type="button" data-cmd="menu" aria-label="Menu"><svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M1 2 H13 M1 6 H13 M1 10 H13"/></svg></button></div>
      </div>
      <aside class="lcol" aria-label="Mission panel">
        <section class="panel objp" aria-label="Objectives" id="mObj"></section>
        <section class="panel lists"><div class="tabs" id="mTabs"><button type="button" data-cmd="ltab" data-v="tracks" id="tabT">TRACKS</button><button type="button" data-cmd="ltab" data-v="assets" id="tabA">ASSETS</button><button type="button" class="col-x" data-cmd="lcol" aria-label="Hide panel" title="Hide panel"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 2 L4 6 L8 10"/></svg></button></div><div class="list scroll" id="mList"></div></section>
        <section class="panel ovw" aria-label="Overview map"><div class="mm" id="mMM"><canvas id="mmc"></canvas></div></section>
      </aside>
      <button class="rail panel" type="button" id="mRail" data-cmd="lcol" aria-label="Show mission panel"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 2 L8 6 L4 10"/></svg><span class="rb h" id="railH">0</span><span class="rb">OBJ</span></button>
      <aside class="rcol"><section class="panel card-r" aria-label="Selection" id="mCard"></section></aside>
      <div class="viewtog"><button type="button" data-cmd="view" data-v="3d" id="v3d" aria-pressed="true">3D</button><button type="button" data-cmd="view" data-v="map" id="vmap" aria-pressed="false">MAP</button></div>
      <button class="compass" type="button" data-cmd="north" aria-label="Face north" id="mCompass"><svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true" id="mCompassSvg"><path d="M15 3 L19 15 L15 13 L11 15 Z" fill="#ff6b5e"/><path d="M15 27 L19 15 L15 17 L11 15 Z" fill="#8a96a1"/><circle cx="15" cy="15" r="1.6" fill="#e8edf1"/></svg></button>
      <div class="dock" id="mDock"></div>
      <div class="ticker" id="mTicker"></div>
      <div class="cstack"><div class="banner" id="mBanner" hidden></div><div class="hint" id="mHint" hidden></div><div class="toast" id="mToast" hidden></div></div>
      <section class="panel coach" id="mCoach" hidden></section>`;
    for (const k of ['mCard', 'mList', 'mObj', 'mDock', 'mTicker']) { const el = $(k); if (el) el._sig = null; }
    if (!this.built) {
      this.built = true;
      hud.addEventListener('click', (e) => {
        const b = e.target.closest('[data-cmd]');
        if (!b || b.disabled) return;
        this.cmd(b.dataset.cmd, b.dataset, b);
      });
      window.addEventListener('resize', () => { if (this.world) { this.resize(); } });
      hud.addEventListener('transitionend', (e) => { if (e.target.matches && e.target.matches('.lcol, .rcol, .dock')) { this.updateSafe(); this.dockFade(); } });
      hud.addEventListener('scroll', (e) => { if (e.target.id === 'mDock') this.dockFade(); }, true);
      window.addEventListener('keydown', (e) => this.onKey(e, true));
      window.addEventListener('keyup', (e) => this.onKey(e, false));
      this.bindPointer();
    }
  }

  // ---------------------------------------------------------------- commands from the HUD
  cmd(c, d) {
    const app = this.app, sim = this.sim, ui = this.ui;
    if (!sim) return;
    const sel = ui.sel != null ? sim.byId(ui.sel) : null;
    const say = (err) => { if (err) { app.audio.error(); this.toast(err); } else app.audio.confirm(); };
    switch (c) {
      case 'pause': this.togglePause(); break;
      case 'speed': this.setSpeed(d.v); app.audio.ui(); break;
      case 'skip': this.skipToRaid(); app.audio.ui(); break;
      case 'roe': if (d.v === 'free' && sim.roe !== 'free') { const was = this.paused; this.paused = true; app.onModalClose = () => { this.paused = was; this.renderTop(); }; app.confirm('Weapons free?', 'You will be able to pair shooters on tracks nobody has identified yet. Autonomy still never engages an unknown track, but you own every result, including civilians.', 'Weapons free', () => { say(sim.setROE('free')); this.renderTop(); }, true); } else { say(sim.setROE(d.v)); } this.renderTop(); break;
      case 'auto': say(sim.setAutonomy(d.v)); this.renderTop(); break;
      case 'menu': this.pauseMenu(); break;
      case 'fullscreen': this.toggleFullscreen(); break;
      case 'view': this.setView(d.v === 'toggle' ? (this.world.view.mode === 'map' ? '3d' : 'map') : d.v); app.audio.ui(); break;
      case 'north': this.world.goal = Object.assign(this.world.goal || {}, { yaw: 0 }); app.audio.ui(); break;
      case 'log': this.logDlg(); break;
      case 'ltab': ui.ltab = d.v; app.audio.ui(); break;
      case 'pace': this.setPace(+d.v); app.audio.ui(); break;
      case 'lcol': { const h = $('hud'); h.classList.toggle('l-open'); app.audio.ui(); setTimeout(() => this.updateSafe(), 260); } break;
      case 'raidshow': if (this.raidPt) { this.world.focus(this.raidPt[0], this.raidPt[1], 26000); app.audio.ui(); } break;
      case 'close': this.select(null); break;
      case 'sel': this.select(+d.id, true); break;
      case 'center': if (sel) this.centerOn(sel); break;
      case 'follow': if (sel) { ui.follow = ui.follow === sel.id ? null : sel.id; if (ui.follow != null) this.world.focus(sel.x, sel.y, Math.min(this.world.view.dist, 14000)); app.audio.ui(); } break;
      case 'opt': ui.opt = d.k; app.audio.ui(); this.renderCard(true); break;
      case 'approve': {
        const e = sel; if (!e) break;
        const opts = sim.options(e); const o = opts.find((q) => this.optKey(q) === ui.opt && q.ok) || opts.find((q) => q.ok);
        if (!o) { say('No shooter can take this track.'); break; }
        say(sim.cmdPair(o.u, o.w, e)); ui.opt = null; this.renderCard(true); break;
      }
      case 'salvo': if (sel) this.quickEngage(sel, 2); break;
      case 'hold': if (sel) { say(sim.cmdHold(sel, !sel.hold)); this.renderCard(true); } break;
      case 'mark': {
        if (!sel) break;
        const gs = sim.friendlies().filter((u) => u.type === 'ghost');
        if (!gs.length) { say('Mark needs a Ghost-X.'); break; }
        gs.sort((a, b) => hyp(a.x - sel.x, a.y - sel.y) - hyp(b.x - sel.x, b.y - sel.y));
        const err = sim.cmdMark(gs[0], sel);
        if (err && /Get within/.test(err)) { sim.cmdMove(gs[0], sel.trk ? sel.trk.ex : sel.x, sel.trk ? sel.trk.ey : sel.y); say(null); this.toast(`${gs[0].name} moving to mark`); }
        else say(err);
        break;
      }
      case 'scout': this.sendScout(sel); break;
      case 'mode': {
        const need = ui.mode === d.v ? 0 : this.modeCost(d.v);
        if (need > sim.supply) { app.audio.error(); this.toast(`Need ${Math.ceil(need - sim.supply)} more supply`); break; }
        this.setMode(ui.mode === d.v ? null : d.v, d); app.audio.ui(); break;
      }
      case 'jam': { const ps = sim.friendlies().filter((u) => u.type === 'pulsar'); const on = !(ps.some((u) => u.jamOn)); let err = null; for (const u of ps) err = sim.cmdJam(u, on) || err; say(err); break; }
      case 'jamone': if (sel) say(sim.cmdJam(sel, !sel.jamOn)); break;
      case 'ew': if (sel) say(sim.cmdEW(sel, !sel.ewOn)); break;
      case 'rtb': if (sel) say(sim.cmdRTB(sel)); break;
      case 'home': this.world.home(); app.audio.ui(); break;
      case 'coachskip': this.coach = null; $('mCoach').hidden = true; app.audio.ui(); this.updateSafe(); break;
      case 'coachnext': if (this.coach) { this.coach.step++; this.coach.t = 0; } app.audio.ui(); break;
      default: break;
    }
    this.renderHud(true);
  }
  sendScout(sel) {
    const sim = this.sim, app = this.app;
    if (!sel || !sel.trk) return;
    const k = sel.trk;
    const cands = sim.friendlies().filter((u) => SCOUT_TYPES.includes(u.type) && u.vmax && u.inMesh && !u.rearm && (!u.mv || u.mv.mode !== 'exit'));
    if (!cands.length) { app.audio.error(); this.toast('No scout free'); return; }
    const pref = (u) => (u.type === 'ghost' ? 0 : u.type === 'altius' ? 1 : u.type === 'bolt' ? 2 : 3);
    cands.sort((a, b) => pref(a) - pref(b) || hyp(a.x - k.ex, a.y - k.ey) - hyp(b.x - k.ex, b.y - k.ey));
    const u = cands[0];
    const err = sim.cmdMove(u, k.ex, k.ey);
    if (err) { app.audio.error(); this.toast(err); } else { app.audio.confirm(); this.toast(`${u.name} scouting`); }
  }
  // right-click on a track: the best shooter takes it (two shooters for big targets)
  quickEngage(e, n) {
    const sim = this.sim, app = this.app;
    const a = affOf(e);
    if (a === 'n') { app.audio.error(); this.toast('Civilian. Hold fire.'); return; }
    const opts = sim.options(e).filter((o) => o.ok);
    if (!opts.length) {
      if (a === 'u' && sim.roe === 'tight') { this.sendScout(e); return; }
      const why = sim.options(e)[0];
      app.audio.error(); this.toast(why ? why.why : 'Nothing can reach it'); return;
    }
    const count = n || ((e.hp > 150 || e.cls === 'boss') ? 2 : 1);
    let fired = 0;
    for (const o of opts) { if (fired >= count) break; if (sim.cmdPair(o.u, o.w, e) === null) fired++; if (o.w === 'b100' || o.w === 'a700m') break; }
    if (fired) { app.audio.confirm(); this.toast(`${fired > 1 ? fired + ' shooters' : opts[0].u.name} engaging`); } else { app.audio.error(); }
  }
  toggleFullscreen() {
    const d = document, el = d.documentElement;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else { const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el); if (r && r.catch) r.catch(() => this.toast('Full screen unavailable')); }
    } catch (e) { this.toast('Full screen unavailable'); }
  }
  setView(v) {
    this.world.setMode(v);
    const a = $('v3d'), b = $('vmap');
    if (a) a.setAttribute('aria-pressed', String(v !== 'map'));
    if (b) b.setAttribute('aria-pressed', String(v === 'map'));
  }
  modeCost(v) {
    const sim = this.sim, th = sim.friendlies().find((u) => u.type === 'thunder');
    return { build: sim.costOf('sentry'), altius: sim.costOf('altius'), fury: sim.costOf('fury'), thunder: th && th.strike ? 0 : sim.costOf('thunder'), rockets: sim.costOf('rockets') }[v] || 0;
  }
  setMode(m, d) {
    const ui = this.ui;
    ui.mode = m; ui.modeArg = d ? { ...d } : null;
    const h = $('mHint');
    const T = { move: 'Pick a point', build: 'Pick a free pad', altius: 'Pick an area', bolt: 'Pick a point', fury: 'Pick a patrol point', thunder: 'Pick a strike point', rockets: 'Pick a target point', thunderAltius: 'Pick an area', resupply: 'Pick an asset', marktrk: 'Pick a track' };
    if (m && h) { h.innerHTML = `<span>${esc(T[m] || 'Pick a point')}</span><button class="btn xs" type="button" data-cmd="mode" data-v="${m}">Cancel</button>`; h.hidden = false; }
    else if (h) h.hidden = true;
    if (!m) ui.cursorKm = null;
  }
  doMode(sx, sy) {
    const sim = this.sim, ui = this.ui, app = this.app, W = this.world;
    const m = ui.mode; if (!m) return false;
    const sel = ui.sel != null ? sim.byId(ui.sel) : null;
    const g = W.pickGround(sx, sy);
    const say = (err) => { if (err) { app.audio.error(); this.toast(err); return false; } app.audio.confirm(); return true; };
    const nearestWith = (type, ok) => { const c = sim.friendlies().filter((u) => u.type === type && (!ok || ok(u))); if (!g) return c[0]; c.sort((a, b) => hyp(a.x - g[0], a.y - g[1]) - hyp(b.x - g[0], b.y - g[1])); return c[0]; };
    let done = false;
    if (m === 'build') {
      const hit = this.overlay.pick(sx, sy, this.touchUsed);
      let pad = hit && hit.kind === 'pad' ? sim.pads.find((p) => p.id === hit.id) : null;
      if (!pad && g) { const fr = sim.pads.filter((p) => sim.padFree(p)).sort((a, b) => hyp(a.x - g[0], a.y - g[1]) - hyp(b.x - g[0], b.y - g[1])); if (fr[0] && hyp(fr[0].x - g[0], fr[0].y - g[1]) < 1.2) pad = fr[0]; }
      if (!pad) { say('Pick a free hex pad.'); return true; }
      done = say(sim.cmdBuild(pad));
    } else if (m === 'resupply' || m === 'marktrk') {
      const hit = this.overlay.pick(sx, sy, this.touchUsed);
      const t = hit && hit.kind === 'ent' ? sim.byId(hit.id) : null;
      if (m === 'resupply') done = say(sim.cmdResupply(sel, t));
      else done = say(sim.cmdMark(sel, t));
    } else {
      if (!g) { say('Pick a point on the ground.'); return true; }
      const [x, y] = g;
      if (m === 'move') done = say(sim.cmdMove(sel, x, y));
      else if (m === 'altius') done = say(sim.cmdAltius(x, y));
      else if (m === 'bolt') { const u = nearestWith('team', (q) => q.boltCd <= 0) || nearestWith('team'); done = say(sim.cmdBolt(u, x, y)); }
      else if (m === 'fury') done = say(sim.cmdFury(x, y));
      else if (m === 'thunder') done = say(sim.cmdThunder(x, y));
      else if (m === 'rockets') done = say(sim.cmdRockets(x, y));
      else if (m === 'thunderAltius') done = say(sim.cmdThunderAltius(sel, x, y));
    }
    if (done || m !== 'build') this.setMode(null);
    this.renderHud(true);
    return true;
  }
  select(id, center) {
    const ui = this.ui;
    if (ui.sel !== id) { ui.opt = null; if (ui.follow != null && ui.follow !== id) ui.follow = null; }
    ui.sel = id;
    if (id != null) this.app.audio.ui();
    if (center && id != null) { const e = this.sim.byId(id); if (e) this.centerOn(e); }
    if (ui.mode && ['move', 'resupply', 'thunderAltius', 'marktrk'].includes(ui.mode)) this.setMode(null);
    this.renderHud(true);
    setTimeout(() => this.updateSafe(), 240);
  }
  centerOn(e) {
    const x = e.side !== 'f' && e.trk ? e.trk.ex : e.x, y = e.side !== 'f' && e.trk ? e.trk.ey : e.y;
    this.world.focus(x, y, Math.min(this.world.view.dist, 22000));
  }

  // ---------------------------------------------------------------- pointer, wheel, touch, keys
  bindPointer() {
    const mission = $('mission');
    const ptrs = new Map();
    let drag = null, pinch = null, lp = null, lastTap = { t: 0, x: 0, y: 0 };
    const gl = () => $('gl');
    const pos = (e) => { const r = mission.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    mission.addEventListener('contextmenu', (e) => { if (e.target.closest('canvas')) e.preventDefault(); });
    mission.addEventListener('pointerdown', (e) => {
      if (!this.running || e.target !== gl()) return;
      const [x, y] = pos(e);
      ptrs.set(e.pointerId, { x, y });
      try { e.target.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      this.touchUsed = e.pointerType === 'touch';
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch = { d: hyp(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), my: (a.y + b.y) / 2 };
        drag = null; clearTimeout(lp);
        return;
      }
      drag = { x, y, x0: x, y0: y, btn: e.button, moved: false, g0: this.world.pickGround(x, y), t: performance.now(), touch: e.pointerType === 'touch' };
      if (drag.touch) lp = setTimeout(() => { if (drag && !drag.moved) { drag.long = true; this.rightClick(drag.x0, drag.y0); } }, 520);
    });
    mission.addEventListener('pointermove', (e) => {
      if (!this.running) return;
      const [x, y] = pos(e);
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x, y });
      if (pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()];
        const d = hyp(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), my = (a.y + b.y) / 2;
        if (pinch.d > 0) this.world.zoom(pinch.d / Math.max(10, d), (a.x + b.x) / 2, my);
        let da = ang - pinch.ang; da = Math.atan2(Math.sin(da), Math.cos(da));
        this.world.orbit(-da, (my - pinch.my) * 0.004);
        pinch = { d, ang, my };
        return;
      }
      if (drag && ptrs.has(e.pointerId)) {
        const dx = x - drag.x, dy = y - drag.y;
        if (!drag.moved && hyp(x - drag.x0, y - drag.y0) > (drag.touch ? 9 : 5)) { drag.moved = true; clearTimeout(lp); if (drag.btn === 0) this.ui.follow = null; }
        if (drag.moved) {
          if (drag.btn === 2 || drag.btn === 1 || e.shiftKey) this.world.orbit(-dx * 0.005, dy * 0.004);
          else if (drag.g0) { const g1 = this.world.pickGround(x, y); if (g1) this.world.panGround(drag.g0, g1); else this.world.panPixels(dx, dy); }
          else this.world.panPixels(dx, dy);
        }
        drag.x = x; drag.y = y;
        return;
      }
      if (e.pointerType === 'mouse' && e.target === gl()) {
        const h = this.overlay.pick(x, y, false);
        this.ui.hover = h && h.kind === 'ent' ? h.id : null;
        this.ui.hoverPad = h && h.kind === 'pad' ? h.id : null;
        gl().style.cursor = this.ui.mode ? 'crosshair' : h ? 'pointer' : 'grab';
        if (this.ui.mode) this.ui.cursorKm = this.world.pickGround(x, y);
      }
    });
    const up = (e) => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      clearTimeout(lp);
      if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
      if (!drag) return;
      const d = drag; drag = null;
      if (d.moved || d.long) return;
      const [x, y] = pos(e);
      if (d.btn === 2) { this.rightClick(x, y); return; }
      if (d.btn !== 0) return;
      const now = performance.now();
      if (now - lastTap.t < 340 && hyp(x - lastTap.x, y - lastTap.y) < 14) { lastTap.t = 0; this.doubleClick(x, y); return; }
      lastTap = { t: now, x, y };
      this.leftClick(x, y);
    };
    mission.addEventListener('pointerup', up);
    mission.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); drag = null; pinch = null; clearTimeout(lp); });
    mission.addEventListener('wheel', (e) => {
      if (!this.running || e.target !== gl()) return;
      e.preventDefault();
      const [x, y] = pos(e);
      const dy = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
      this.world.zoom(Math.exp(clamp(dy, -200, 200) * 0.0014), x, y);
    }, { passive: false });
    document.addEventListener('fullscreenchange', () => setTimeout(() => { if (this.world) this.resize(); }, 120));
  }
  leftClick(x, y) {
    if (!this.started) return;
    if (this.ui.mode && this.doMode(x, y)) return;
    const h = this.overlay.pick(x, y, this.touchUsed);
    if (h && h.kind === 'ent') { this.select(h.id); return; }
    if (h && h.kind === 'pad') {
      const pad = this.sim.pads.find((p) => p.id === h.id);
      const err = this.sim.cmdBuild(pad);
      if (err) { this.app.audio.error(); this.toast(err); } else this.app.audio.confirm();
      this.renderHud(true);
      return;
    }
    if (this.ui.sel != null) this.select(null);
  }
  doubleClick(x, y) {
    const h = this.overlay.pick(x, y, this.touchUsed);
    if (h && h.kind === 'ent') { this.select(h.id); this.ui.follow = h.id; const e = this.sim.byId(h.id); if (e) this.world.focus(e.x, e.y, Math.min(this.world.view.dist, 14000)); this.toast('Following'); }
    else { const g = this.world.pickGround(x, y); if (g) this.world.focus(g[0], g[1], this.world.view.dist * 0.6); }
  }
  rightClick(x, y) {
    if (!this.started) return;
    const sim = this.sim, ui = this.ui;
    if (ui.mode) { this.setMode(null); return; }
    const h = this.overlay.pick(x, y, this.touchUsed);
    const tgt = h && h.kind === 'ent' ? sim.byId(h.id) : null;
    if (tgt && tgt.side !== 'f') { this.select(tgt.id); this.quickEngage(tgt); this.renderHud(true); return; }
    const sel = ui.sel != null ? sim.byId(ui.sel) : null;
    if (sel && sel.side === 'f' && sel.vmax) {
      const g = this.world.pickGround(x, y);
      if (!g) return;
      const err = sim.cmdMove(sel, g[0], g[1]);
      if (err) { this.app.audio.error(); this.toast(err); } else this.app.audio.confirm();
      this.renderHud(true);
    }
  }
  onKey(e, down) {
    if (!this.running || this.app.screen !== 'mission') return;
    if (!$('modal').hidden) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const k = e.key;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'q', 'e', 'Q', 'E', 'z', 'x', 'Z', 'X'].includes(k)) { this.keys[k.toLowerCase()] = down; if (down) this.ui.follow = null; e.preventDefault(); return; }
    if (!down) return;
    const sim = this.sim;
    if (!this.started) { if (k === 'Enter' || k === ' ') { e.preventDefault(); this.begin(); } else if (k >= '1' && k <= '5') this.setPace(+k); return; }
    if (k === ' ') { e.preventDefault(); this.togglePause(); }
    else if (k === '0' || k === '`') this.setSpeed('auto');
    else if (k >= '1' && k <= '4') this.setSpeed([1, 2, 4, 8][+k - 1]);
    else if (k === 'n' || k === 'N') this.skipToRaid();
    else if (k === 'm' || k === 'M') this.setView(this.world.view.mode === 'map' ? '3d' : 'map');
    else if (k === 'Escape') { if (this.ui.mode) this.setMode(null); else if (this.ui.sel != null) this.select(null); else this.pauseMenu(); }
    else if (k === 'Tab') {
      e.preventDefault();
      const ts = this.trackList().filter((t) => affOf(t) !== 'n');
      if (!ts.length) return;
      const i = ts.findIndex((t) => t.id === this.ui.sel);
      const n = ts[(i + (e.shiftKey ? -1 : 1) + ts.length) % ts.length];
      this.select(n.id, true);
    }
    else if (k === 'f' || k === 'F') this.cmd('follow', {});
    else if (k === 'c' || k === 'C') { const s = this.ui.sel != null ? sim.byId(this.ui.sel) : null; if (s) this.centerOn(s); }
    else if (k === 'h' || k === 'H') this.world.home();
    else if (k === 'Enter') { if (this.ui.sel != null) this.cmd('approve', {}); }
    else if (k === 'r' || k === 'R') { const s = this.ui.sel != null ? sim.byId(this.ui.sel) : null; if (s && s.side !== 'f') this.quickEngage(s); }
    else if (k === 'b' || k === 'B') this.setMode(this.ui.mode === 'build' ? null : 'build');
    else if (k === '+' || k === '=') this.world.zoom(0.8);
    else if (k === '-' || k === '_') this.world.zoom(1.25);
  }
  keysPan(dt) {
    const K = this.keys || {};
    const fx = (K.d || K.arrowright ? 1 : 0) - (K.a || K.arrowleft ? 1 : 0);
    const fy = (K.s || K.arrowdown ? 1 : 0) - (K.w || K.arrowup ? 1 : 0);
    if (fx || fy) this.world.panKeys(fx, fy, dt);
    if (K.q) this.world.orbit(dt * 1.2, 0);
    if (K.e) this.world.orbit(-dt * 1.2, 0);
    if (K.z) this.world.orbit(0, dt * 0.8);
    if (K.x) this.world.orbit(0, -dt * 0.8);
  }

  // ---------------------------------------------------------------- HUD rendering
  trackList() {
    const sim = this.sim;
    const rank = (e) => { const a = affOf(e); return a === 'h' ? 0 : a === 'u' ? 1 : 2; };
    return sim.tracks().sort((a, b) => rank(a) - rank(b) || sim.threatScore(b) - sim.threatScore(a));
  }
  renderHud() {
    if (!this.sim) return;
    this.renderTop();
    this.renderObj();
    this.renderList();
    this.renderCard();
    this.renderDock();
    this.renderTicker();
  }
  renderTop() {
    const sim = this.sim; if (!sim) return;
    const set = (id, v) => { const el = $(id); if (el && el.textContent !== v) el.textContent = v; };
    set('mClock', 'H+' + fmtT(sim.t));
    set('mSup', String(Math.floor(sim.supply)));
    set('mRate', '+' + Math.round(sim.supplyRate * 60) + '/min');
    set('mKills', String(sim.stats.kills));
    const pb = $('mPause');
    if (pb) { const ic = this.paused ? '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="currentColor"><path d="M3 1.5 L10.5 6 L3 10.5 Z"/></svg>' : '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="currentColor"><rect x="2" y="1.5" width="3" height="9"/><rect x="7" y="1.5" width="3" height="9"/></svg>'; if (pb._p !== this.paused) { pb.innerHTML = ic; pb._p = this.paused; pb.setAttribute('aria-label', this.paused ? 'Resume' : 'Pause'); pb.classList.toggle('on', this.paused); } }
    document.querySelectorAll('#mSpeeds [data-v]').forEach((b) => {
      const v = b.dataset.v, chosen = v === 'auto' ? this.speedMode === 'auto' : this.speedMode === 'fixed' && +v === this.speed, on = chosen && !this.paused;
      b.classList.toggle('on', on); b.classList.toggle('sel', chosen && this.paused); b.setAttribute('aria-pressed', String(chosen));
      if (v === 'auto') b.textContent = this.speedMode === 'auto' && !this.paused ? `AUTO ${Math.round(this.effSpeed())}x` : 'AUTO';
    });
    const nx = $('mNext'), sk = $('mSkip');
    if (nx && sk) {
      const left = sim.wi < sim.waves.length ? sim.waves[sim.wi].t - sim.t : null;
      const txt = this.skip ? (this.skipQuiet ? 'RUNNING AHEAD' : 'SKIP QUEUED') : left != null ? `NEXT RAID ${fmtMS(Math.max(0, left))}` : 'LAST RAID IN';
      if (nx.textContent !== txt) nx.textContent = txt;
      sk.disabled = left == null; sk.classList.toggle('on', !!this.skip);
    }
    const tg = (id, on) => { const b = $(id); if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); } };
    tg('roeT', sim.roe === 'tight'); tg('roeF', sim.roe === 'free');
    tg('auM', sim.autonomy === 'manual'); tg('auS', sim.autonomy === 'supervised'); tg('auA', sim.autonomy === 'auto');
    const cs = $('mCompassSvg'); if (cs && this.world) cs.style.transform = `rotate(${(-this.world.view.yaw * 180 / Math.PI).toFixed(1)}deg)`;
    const rf = $('roeF'); if (rf) rf.style.borderColor = sim.roe === 'free' ? '#ff6b5e' : '';
    const rh = $('railH'); if (rh) { const n = sim.tracks().filter((e) => affOf(e) === 'h').length; if (rh.textContent !== String(n)) rh.textContent = String(n); }
  }
  renderObj() {
    const sim = this.sim, el = $('mObj'); if (!el) return;
    const icon = (o) => o.state === 'done' ? '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="#8edb8e" stroke-width="1.8"><path d="M2 6.5 L5 9 L10 3"/></svg>'
      : o.state === 'failed' ? '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="#ff6b5e" stroke-width="1.8"><path d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5"/></svg>'
      : `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="${o.bonus ? '#8692a0' : o.kind === 'protect' ? '#6cc6ff' : '#ffb547'}" stroke-width="1.6"/></svg>`;
    const sig = sim.objectives.map((o) => o.id + o.state).join('|') + '|p' + this.paceLv;
    const tp = this.tempo();
    let html = `<div class="oh"><span class="lbl">OBJECTIVES</span><span class="pchip l${tp.lv}" title="Pace ${tp.lv}: ${esc(tp.name)}">PACE ${tp.lv}</span></div>`;
    const fields = {};
    for (const o of sim.objectives) {
      html += `<div class="o">${icon(o)}<span class="t" style="${o.state === 'done' ? 'color:#d6dde2' : ''}">${esc(o.label)}</span>${o.bonus ? '<span class="tagb">BONUS</span>' : `<span class="v" data-f="o_${o.id}"></span>`}</div>`;
      if (o.kind === 'protect') {
        const s = sim.sites.find((q) => q.siteId === o.site);
        if (s) { html += `<div style="margin-left:20px" class="bar"><i data-f="ob_${o.id}"></i></div>`; fields['ob_' + o.id] = { w: Math.round(100 * Math.max(0, s.hp) / s.maxHp) + '%', bg: s.hp / s.maxHp < 0.35 ? '#ff6b5e' : '#6cc6ff' }; fields['o_' + o.id] = Math.round(100 * Math.max(0, s.hp) / s.maxHp) + '%'; }
      } else if (!o.bonus) fields['o_' + o.id] = o.prog || '';
    }
    if (this.def.deadline) { const left = this.def.deadline - sim.t; html += `<div class="o"><span class="t dim">Time left</span><span class="v" data-f="dl"></span></div>`; fields.dl = { t: left > 0 ? fmtT(left) : 'expired', c: left < 600 ? '#ffb3ab' : '#d7efff' }; }
    patch(el, sig + (this.def.deadline ? 'dl' : ''), html, fields);
  }
  assetVal(e) {
    if (e.stock != null && e.maxStock) return { t: `${e.stock}/${e.maxStock}`, w: e.stock / e.maxStock };
    if (e.maxEnergy) return { t: Math.round(100 * e.energy / e.maxEnergy) + '%', w: e.energy / e.maxEnergy };
    return { t: Math.round(100 * e.hp / e.maxHp) + '%', w: e.hp / e.maxHp };
  }
  renderList() {
    const sim = this.sim, el = $('mList'); if (!el) return;
    const ui = this.ui;
    const ts = this.trackList();
    const us = sim.ents.filter((e) => e.alive && e.side === 'f' && e.T.kind !== 'site').sort((a, b) => (b.band > 0) - (a.band > 0));
    const tT = $('tabT'), tA = $('tabA');
    if (tT) { const hs = ts.filter((e) => affOf(e) === 'h').length; tT.innerHTML = `TRACKS <b class="${hs ? 'hot' : ''}">${ts.length}</b>`; tT.setAttribute('aria-pressed', String(ui.ltab === 'tracks')); }
    if (tA) { tA.innerHTML = `ASSETS <b>${us.length}</b>`; tA.setAttribute('aria-pressed', String(ui.ltab === 'assets')); }
    let sig, html, f = {};
    if (ui.ltab === 'assets') {
      sig = 'A' + us.map((e) => e.id).join(',') + '|' + ui.sel;
      html = us.map((e) => `<button class="arow ${ui.sel === e.id ? 'sel' : ''}" type="button" data-cmd="sel" data-id="${e.id}">${symSvg(e.band ? 'f-air' : 'f-gnd')}<span style="display:flex;flex-direction:column;min-width:0"><span class="nm">${esc(e.name)}</span><span class="st" data-f="s${e.id}"></span></span><span class="val"><span data-f="v${e.id}"></span><span class="bar"><i data-f="b${e.id}"></i></span></span></button>`).join('');
      for (const e of us) {
        const v = this.assetVal(e);
        f['s' + e.id] = { t: unitStatus(sim, e), c: !e.inMesh ? '#ffcf85' : '' };
        f['v' + e.id] = v.t;
        f['b' + e.id] = { w: Math.round(clamp(v.w, 0, 1) * 100) + '%', bg: e.hp / e.maxHp < 0.4 ? '#ff6b5e' : '#6cc6ff' };
      }
    } else {
      sig = 'T' + ts.map((e) => e.id + affOf(e)).join(',') + '|' + ui.sel;
      html = ts.length ? '' : '<p class="empty">No tracks</p>';
      for (const e of ts.slice(0, 50)) {
        const a = affOf(e);
        html += `<button class="trk ${ui.sel === e.id ? 'sel' : ''}" type="button" data-cmd="sel" data-id="${e.id}">${symSvg(e.band ? a + '-air' : a + '-gnd', 16, 13)}<span class="nm" style="color:${a === 'h' ? '#ffd6d1' : a === 'u' ? '#fff0c2' : '#d9f2d9'}">${esc(a === 'u' ? 'UNKNOWN' : e.T.name)}</span><i class="eng" data-f="g${e.id}"></i><span class="eta" data-f="e${e.id}"></span></button>`;
        const k = e.trk, eta = a === 'h' ? sim.eta(e) : null;
        f['g' + e.id] = { cls: 'eng' + (sim.committed(e) > 0.05 ? ' on' : '') };
        f['e' + e.id] = a === 'u' ? `${Math.round(k.id * 100)}%` : eta ? fmtMS(eta.t) : '';
      }
    }
    patch(el, sig, html, f);
  }
  optKey(o) { return o.u.id + ':' + o.w; }
  renderCard() {
    const el = $('mCard'); if (!el) return;
    const r = this.cardModel();
    const hud = $('hud');
    const open = !!r;
    if (hud.classList.contains('r-open') !== open) { hud.classList.toggle('r-open', open); setTimeout(() => this.updateSafe(), 240); }
    if (r) patch(el, r.sig, r.html, r.fields);
  }
  cardModel() {
    const sim = this.sim, ui = this.ui;
    const e = ui.sel != null ? sim.byId(ui.sel) : null;
    if (!e) { ui.preview = null; return null; }
    if (!e.alive && e.side !== 'f') { ui.sel = null; ui.preview = null; return null; }
    if (e.side === 'f' && e.T.kind === 'site') return this.siteModel(e);
    if (e.side === 'f') { ui.preview = null; return e.alive ? this.unitModel(e) : (ui.sel = null, null); }
    if (!e.trk || !e.trk.det) { ui.sel = null; return null; }
    return this.trackModel(e);
  }
  closeBtn() { return `<button class="icon-btn" type="button" data-cmd="close" aria-label="Close"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" stroke="currentColor" stroke-width="1.6"><path d="M1 1 L9 9 M9 1 L1 9"/></svg></button>`; }
  siteModel(e) {
    const sim = this.sim;
    const pct = Math.round(100 * Math.max(0, e.hp) / e.maxHp);
    const inbound = sim.tracks().filter((t) => affOf(t) === 'h').map((t) => ({ t, eta: sim.eta(t) })).filter((x) => x.eta && x.eta.site === e).sort((a, b) => a.eta.t - b.eta.t);
    const sig = 'site:' + e.id + ':' + inbound.map((x) => x.t.id).join(',');
    let html = `<div class="hd"><svg width="16" height="18" viewBox="0 0 24 26" aria-hidden="true" fill="none" stroke="#6cc6ff" stroke-width="2"><path d="M12 2 L21 6 V13 C21 18.5 17 22.5 12 24 C7 22.5 3 18.5 3 13 V6 Z"/></svg><span class="aff f">PROTECTED SITE</span><span style="flex:1"></span>${this.closeBtn()}</div>
      <h3>${esc(e.name.toUpperCase())}</h3>
      <div style="display:flex;flex-direction:column;gap:5px"><div style="display:flex;justify-content:space-between"><span class="lbl">STANDING</span><span class="mono" data-f="pct"></span></div><div class="bar" style="height:4px"><i data-f="bar"></i></div></div>
      <span class="lbl">INBOUND · ${inbound.length}</span>`;
    const f = { pct: pct + '%', bar: { w: pct + '%', bg: pct < 35 ? '#ff6b5e' : '#6cc6ff' } };
    for (const x of inbound.slice(0, 12)) { html += `<button class="trk" type="button" data-cmd="sel" data-id="${x.t.id}">${symSvg(x.t.band ? 'h-air' : 'h-gnd', 16, 13)}<span class="nm">${esc(trackName(x.t))}</span><span class="eta" data-f="i${x.t.id}"></span></button>`; f['i' + x.t.id] = fmtMS(x.eta.t); }
    if (!inbound.length) html += '<span class="dim" style="font-size:13px">Nothing inbound</span>';
    html += `<div class="acts" style="margin-top:auto"><button class="btn" type="button" data-cmd="center">Center</button></div>`;
    return { sig, html, fields: f };
  }
  unitModel(e) {
    const sim = this.sim, p = this.app.profile;
    const P = KW.PRODUCT[e.prod] || null;
    const mk = P ? (p.mk[P.id] || 1) : 1;
    const air = e.band > 0;
    const acts = [];
    if (e.vmax && e.type !== 'fury') acts.push(['mode', 'move', 'Move']);
    if (e.type === 'fury') acts.push(['mode', 'move', 'Patrol']);
    if (air && !['altius', 'bolt'].includes(e.type)) acts.push(['rtb', '', e.type === 'fury' ? 'Leave' : 'Return']);
    if (e.type === 'pulsar') acts.push(['jamone', '', e.jamOn ? 'Jam off' : 'Jam']);
    if (e.type === 'altius') acts.push(['ew', '', e.ewOn ? 'EW off' : 'EW on']);
    if (e.type === 'tubes') acts.push(['mode', 'altius', 'Launch Altius']);
    if (e.type === 'thunder') acts.push(['mode', 'thunder', e.strike ? 'Move strike' : 'Strike']);
    if (e.type === 'team') acts.push(['mode', 'bolt', 'Throw Bolt']);
    if (e.type === 'thunder' && e.ammo && e.ammo.a6 > 0) acts.push(['mode', 'thunderAltius', 'Release Altius']);
    if (e.type === 'omen') acts.push(['mode', 'resupply', 'Resupply']);
    if (e.type === 'ghost') acts.push(['mode', 'marktrk', 'Mark']);
    if (e.vmax) acts.push(['follow', '', this.ui.follow === e.id ? 'Unfollow' : 'Follow']);
    acts.push(['center', '', 'Center']);
    const sig = 'unit:' + e.id + ':' + acts.map((a) => a.join('/')).join(',') + ':' + this.ui.mode;
    const ws = sim.weaponsOf(e);
    const sens = e.T.sens;
    let html = `<div class="hd">${symSvg(air ? 'f-air' : 'f-gnd', 16, 13)}<span class="mono" style="font-size:12px;color:#c8d0d6">${esc(e.T.code)}</span><span class="aff f">FRIENDLY</span><span style="flex:1"></span>${this.closeBtn()}</div>
      <h3>${esc(e.name)}</h3>
      <div style="display:flex;flex-direction:column;gap:5px"><div style="display:flex;justify-content:space-between"><span class="lbl">HULL</span><span class="mono" style="font-size:12px" data-f="hp"></span></div><div class="bar" style="height:4px"><i data-f="hpb"></i></div><span class="dim" style="font-size:12px" data-f="st"></span></div>
      <div class="grid3">`;
    const cells = [];
    for (const w of ws) { const st = sim.wstat(w.key, e); cells.push([KW.WT[w.key].name.toUpperCase().slice(0, 14), 'w_' + w.key, `${w.n}${st.range < 200 ? ' · ' + st.range + ' km' : ''}`]); }
    if (sens && sens.air) cells.push(['RADAR', 'rad', `${Math.round(Math.max(...sens.air) * sim.mods.sensRange)} km`]);
    if (sens && sens.id) cells.push(['ID RANGE', 'idr', `${sens.id} km`]);
    if (e.meshR) cells.push(['MESH', 'msh', `${e.meshR.toFixed(1)} km`]);
    if (e.vmax) cells.push(['SPEED', 'spd', `${Math.round(e.vmax * 3600)} km/h`]);
    if (e.maxEnergy) cells.push(['ENERGY', 'en', '']);
    for (const [k, id] of cells.slice(0, 3)) html += `<div class="stat"><span class="k">${esc(k)}</span><span class="v" style="font-size:13px" data-f="${id}"></span></div>`;
    html += `</div>`;
    html += `<div class="acts" style="margin-top:auto">${acts.map(([c, v, n]) => `<button class="btn ${c === 'mode' && this.ui.mode === v ? 'on' : ''}" type="button" data-cmd="${c}" ${v ? `data-v="${v}"` : ''}>${esc(n)}</button>`).join('')}</div>`;
    const f = { hp: Math.round(100 * e.hp / e.maxHp) + '%', hpb: { w: Math.round(100 * e.hp / e.maxHp) + '%', bg: e.hp / e.maxHp < 0.4 ? '#ff6b5e' : '#6cc6ff' }, st: unitStatus(sim, e) };
    for (const [, id, v] of cells) f[id] = v;
    if (e.maxEnergy) f.en = Math.round(100 * e.energy / e.maxEnergy) + '%';
    return { sig, html, fields: f };
  }
  chainState(e) {
    const sim = this.sim, k = e.trk;
    const shots = sim.shots.filter((s) => !s.dead && s.side === 'f' && s.tgt === e.id);
    const st = [true, k.q > 0.35 || k.esm, !!k.known && k.aff === 'h', !!this.ui.opt || shots.length > 0, shots.length > 0, !e.alive];
    let now = st.findIndex((x) => !x);
    if (now < 0) now = 6;
    return st.map((x, i) => (i < now ? 'done' : i === now ? 'now' : ''));
  }
  trackModel(e) {
    const sim = this.sim, ui = this.ui, k = e.trk, a = affOf(e);
    const opts = a === 'n' ? [] : sim.options(e).slice(0, 4);
    if (ui.opt && !opts.some((o) => this.optKey(o) === ui.opt && o.ok)) ui.opt = null;
    const best = opts.find((o) => o.ok);
    const chosen = ui.opt ? opts.find((o) => this.optKey(o) === ui.opt) : best;
    ui.preview = chosen && chosen.ok ? { u: chosen.u, t: e } : null;
    const affName = { h: 'HOSTILE', u: 'UNKNOWN', n: 'NEUTRAL' }[a];
    const nOk = opts.filter((o) => o.ok).length;
    const sig = `trk:${e.id}:${a}:${k.esm ? 1 : 0}:${e.hold ? 1 : 0}:${opts.map((o) => this.optKey(o) + (o.ok ? 1 : 0) + (o.warn ? 'w' : '') + (chosen === o ? '*' : '') + (o.cost && sim.supply >= o.cost ? '$' : '')).join(',')}:${sim.roe}:${ui.follow === e.id}`;
    const name = a === 'u' ? 'UNKNOWN' : e.T.name;
    const site = sim.eta(e);
    let html = `<div class="hd">${symSvg(symKeyOf(e), 16, 13)}<span class="aff ${a}">${affName}</span>${e.hold ? '<span class="chip" style="height:18px">HOLD</span>' : ''}<span style="flex:1"></span>${this.closeBtn()}</div>
      <h3>${esc(name)}</h3>
      <div style="display:flex;flex-direction:column;gap:5px"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="lbl">${a === 'u' ? 'IDENTIFYING' : 'HULL'}</span><span class="mono" style="font-size:12px" data-f="idv"></span></div><div class="bar" style="height:4px"><i data-f="idb"></i></div></div>
      <div class="grid3">
        <div class="stat"><span class="k">ALT</span><span class="v" style="font-size:13px" data-f="alt"></span></div>
        <div class="stat"><span class="k">SPEED</span><span class="v" style="font-size:13px" data-f="spd"></span></div>
        <div class="stat"><span class="k">ETA</span><span class="v" style="font-size:13px;color:#ffb3ab" data-f="eta"></span></div>
      </div>`;
    if (a !== 'n') {
      html += `<div style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="lbl">SHOOTERS</span><span class="mono dim" style="font-size:10px">HIT · COST</span></div>`;
      if (!opts.length) html += `<span class="dim" style="font-size:12.5px">Out of reach</span>`;
      for (const o of opts) {
        const key = this.optKey(o), on = chosen === o && o.ok;
        const note = !o.ok ? o.why : o.warn ? o.warn : '';
        html += `<button class="opt" type="button" data-cmd="opt" data-k="${key}" ${o.ok ? '' : 'disabled'} aria-pressed="${on}"><span class="r1"><span class="dot"></span><span class="nm">${esc(o.u.name)}</span><span class="w">${esc(o.name)}</span><span class="pk" data-f="pk_${key}"></span><span class="oc ${o.cost ? (sim.supply >= o.cost ? 'cost' : 'cost short') : 'free'}">${o.cost ? o.cost : 'FREE'}</span></span>${note ? `<span class="note ${!o.ok ? 'no' : 'warn'}">${esc(note)}</span>` : ''}</button>`;
      }
      html += '</div>';
      html += `<div class="cardfoot">`;
      if (a === 'u') html += `<button class="btn primary big" type="button" data-cmd="scout">SCOUT</button>`;
      html += `<div class="row2"><button class="btn ${a === 'u' ? '' : 'primary'} big" type="button" data-cmd="approve" ${chosen && chosen.ok ? '' : 'disabled'}>${chosen && chosen.ok ? 'ENGAGE' + (chosen.cost ? ' · ' + chosen.cost : '') : a === 'u' && sim.roe === 'tight' ? 'IDENTIFY FIRST' : 'NO SHOOTER'}</button>${a === 'h' && nOk >= 2 ? '<button class="btn big" type="button" data-cmd="salvo" title="Two shooters at once">SALVO</button>' : ''}</div>
        <div class="acts"><button class="btn" type="button" data-cmd="hold" aria-pressed="${!!e.hold}">${e.hold ? 'Release' : 'Hold'}</button><button class="btn" type="button" data-cmd="follow">${ui.follow === e.id ? 'Unfollow' : 'Follow'}</button></div></div>`;
    } else {
      html += `<div class="acts" style="margin-top:auto"><button class="btn" type="button" data-cmd="follow">${ui.follow === e.id ? 'Unfollow' : 'Follow'}</button></div>`;
    }
    const spd = Math.round(hyp(k.evx, k.evy) * 3600);
    const hp = Math.round(100 * Math.max(0, e.hp) / e.maxHp);
    const f = {
      idv: a === 'u' ? Math.round((k.id || 0) * 100) + '%' : hp + '%',
      idb: { w: (a === 'u' ? Math.round((k.id || 0) * 100) : hp) + '%', bg: a === 'h' ? '#ff6b5e' : a === 'u' ? '#ffd866' : '#8edb8e' },
      alt: e.band ? Math.round(this.world.altOf(e) / 10) * 10 + ' m' : 'ground',
      spd: spd ? spd + ' km/h' : 'still',
      eta: site ? fmtMS(site.t) : '-',
    };
    for (const o of opts) { const key = this.optKey(o); f['pk_' + key] = o.ok || o.why === 'Out of range' || o.why.startsWith('Needs') ? Math.round(o.pk * 100) + '%' : ''; }
    return { sig, html, fields: f };
  }
  renderDock() {
    const el = $('mDock'); if (!el) return;
    const sim = this.sim, ui = this.ui, F = sim.friendlies(), fd = sim.pace.fd || 1;
    const items = [];
    const free = sim.pads.filter((p) => sim.padFree(p)).length;
    items.push({ c: 'mode', v: 'build', n: 'Sentry', cost: sim.costOf('sentry'), off: free ? '' : 'NO PAD' });
    const tubes = F.filter((u) => u.type === 'tubes');
    if (tubes.length) {
      const st = tubes.reduce((a, u) => a + u.stock, 0);
      const cd = st ? 0 : Math.min(...tubes.map((u) => Math.max(0, (u.T.regen || 0) - (u.regenT || 0)) / fd));
      items.push({ c: 'mode', v: 'altius', n: 'Altius', cost: sim.costOf('altius'), cd });
    }
    if (this.loadout.includes('fury')) { const up = F.some((u) => u.type === 'fury'); items.push({ c: 'mode', v: 'fury', n: 'Fury', cost: sim.costOf('fury'), cd: up ? 0 : sim.furyCd / fd, busy: up ? 'IN AIR' : '' }); }
    const th = F.find((u) => u.type === 'thunder');
    if (this.loadout.includes('thunder')) items.push({ c: 'mode', v: 'thunder', n: 'Thunder', cost: th && th.strike ? 0 : sim.costOf('thunder'), cd: th && th.rearm ? th.rearm / fd : 0, off: th ? '' : 'LOST', retask: !!(th && th.strike) });
    items.push({ c: 'mode', v: 'rockets', n: 'Rockets', cost: sim.costOf('rockets'), cd: sim.rocketCd / fd });
    const team = F.find((u) => u.type === 'team');
    if (team) items.push({ c: 'mode', v: 'bolt', n: 'Bolt', cost: 0, cd: team.boltCd / fd });
    const ps = F.filter((u) => u.type === 'pulsar');
    if (ps.length) items.push({ c: 'jam', v: 'jam', n: ps.some((u) => u.jamOn) ? 'Jam off' : 'Jam', cost: 0, en: Math.round(100 * ps[0].energy / ps[0].maxEnergy) });
    const sig = items.map((i) => i.c + i.v + i.n).join('|');
    const html = '<div class="in">' + items.map((i) => `<button class="dk" type="button" data-cmd="${i.c}" data-v="${i.v}" data-f="b_${i.v}"><span class="dn">${esc(i.n)}</span><span class="dc" data-f="c_${i.v}"></span></button>`).join('') + '</div>';
    const f = {};
    for (const i of items) {
      let t, cc, dis = false;
      if (i.off) { t = i.off; cc = 'off'; dis = true; }
      else if (i.cd > 0.5) { t = fmtMS(i.cd); cc = 'cd'; dis = true; }
      else if (i.busy) { t = i.busy; cc = 'off'; dis = true; }
      else if (i.retask) { t = 'MOVE'; cc = 'free'; }
      else if (i.en != null) { t = i.en + '%'; cc = 'en'; }
      else if (i.cost) { t = String(i.cost); cc = sim.supply >= i.cost ? 'cost' : 'cost short'; }
      else { t = 'FREE'; cc = 'free'; }
      f['c_' + i.v] = { t, cls: 'dc ' + cc };
      f['b_' + i.v] = { cls: 'dk' + (ui.mode === i.v && i.c === 'mode' ? ' arm' : '') + (cc === 'cost short' ? ' short' : ''), dis };
    }
    patch(el, sig, html, f);
    this.dockFade();
  }
  dockFade() {
    const d = $('mDock'); if (!d) return;
    const max = d.scrollWidth - d.clientWidth;
    d.classList.toggle('fl', max > 2 && d.scrollLeft > 2);
    d.classList.toggle('fr', max > 2 && d.scrollLeft < max - 2);
  }
  renderTicker() {
    const el = $('mTicker'); if (!el) return;
    const now = performance.now();
    const live = this.ticker.filter((x) => now - x.t < 14000);
    const sig = live.map((x) => x.t).join(',');
    if (el._sig === sig && !this.tickDirty) {
      for (const n of el.querySelectorAll('.msg')) { const age = now - +n.dataset.t; n.style.opacity = String(clamp(1.6 - age / 9000, 0, 1)); }
      return;
    }
    this.tickDirty = false; el._sig = sig;
    const color = (w) => (KW.CAST[w] ? KW.CAST[w].color : w === 'LATTICE' ? '#7fd8cd' : '#a9c9e0');
    const txc = (c) => (c === 'bad' ? '#ffc7c1' : c === 'warn' ? '#ffe2b5' : c === 'good' ? '#d6f0d6' : '#dfe5ea');
    const short = (e) => { const q = e.kind === 'hit' ? this.sim.byId(e.id) : null; return e.kind === 'lost' ? 'lost' : e.kind === 'harm' ? 'Civilian hit' : q ? Math.max(0, Math.round(100 * q.hp / q.maxHp)) + '%' : ''; };
    el.innerHTML = live.map(({ e, t }) => `<div class="msg" data-t="${t}"><span class="tx"><b style="color:${e.kind === 'harm' ? '#ffb3ab' : color(e.who)}">${esc(e.kind === 'harm' ? '' : e.who)}</b><span style="color:${txc(e.cat)}">${esc(short(e))}</span></span></div>`).join('') + `<button class="btn xs logbtn" type="button" data-cmd="log">Log</button>`;
  }
  logDlg() {
    const ev = this.sim.events.slice(-150).reverse();
    const color = (w) => (KW.CAST[w] ? KW.CAST[w].color : w === 'LATTICE' ? '#7fd8cd' : '#a9c9e0');
    const was = this.paused; this.paused = true; this.app.onModalClose = () => { this.paused = was; this.renderTop(); };
    this.app.modal(`<h3>Warden net</h3><div class="scroll" style="max-height:60vh;display:flex;flex-direction:column;gap:6px">${ev.map((e) => `<div class="msg" style="font-size:13px"><span class="tm">${fmtMS(e.t)}</span><span><b style="color:${color(e.who)}">${esc(e.who)}</b> ${esc(e.text)}</span></div>`).join('')}</div><div class="row end"><button class="btn primary" type="button" data-close>Close</button></div>`);
  }
  // ---------------- overview map
  buildMinimap() {
    const c = document.createElement('canvas');
    const img = this.world.tmat && this.world.tmat.map && this.world.tmat.map.image;
    c.width = 400; c.height = 260;
    const g = c.getContext('2d');
    if (img) {
      const sx = img.width / 48, sy = img.height / 38;
      g.filter = 'saturate(0.5) brightness(0.55)';
      try { g.drawImage(img, 4 * sx, 6 * sy, 40 * sx, 26 * sy, 0, 0, 400, 260); } catch (e) { /* ignore */ }
      g.filter = 'none';
    } else { g.fillStyle = '#121a20'; g.fillRect(0, 0, 400, 260); }
    this.mmBase = c;
    const mm = $('mMM');
    if (mm && !mm._bound) {
      mm._bound = true;
      mm.addEventListener('pointerdown', (e) => {
        const r = mm.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * 40, y = (e.clientY - r.top) / r.height * 26;
        this.ui.follow = null; this.world.focus(x, y); this.app.audio.ui();
      });
    }
  }
  drawMinimap() {
    const cv = $('mmc'); if (!cv || !this.mmBase) return;
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.drawImage(this.mmBase, 0, 0, w, h);
    const X = (x) => x / 40 * w, Y = (y) => y / 26 * h;
    const sim = this.sim;
    const fp = this.world.footprint();
    if (fp.length >= 3) { g.beginPath(); fp.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.closePath(); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1; g.stroke(); }
    for (const s of sim.sites) { g.strokeStyle = s.alive ? '#6cc6ff' : '#8692a0'; g.setLineDash([3, 2]); g.beginPath(); g.arc(X(s.x), Y(s.y), 7, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    for (const e of sim.ents) {
      if (!e.alive) continue;
      let a, x = e.x, y = e.y;
      if (e.side === 'f') { if (e.T.kind === 'site') continue; a = 'f'; }
      else { if (!e.trk || !e.trk.det) continue; a = affOf(e); x = e.trk.ex; y = e.trk.ey; }
      g.fillStyle = COL[a];
      const r = e.cls === 'boss' ? 3.2 : 2;
      if (e.band) { g.beginPath(); g.arc(X(x), Y(y), r, 0, Math.PI * 2); g.fill(); } else g.fillRect(X(x) - r, Y(y) - r, r * 2, r * 2);
      if (e.id === this.ui.sel) { g.strokeStyle = '#ffb547'; g.lineWidth = 1.4; g.beginPath(); g.arc(X(x), Y(y), 6, 0, Math.PI * 2); g.stroke(); }
    }
  }
  // ---------------- training coach (mission 1)
  coachStep(dt) {
    const c = this.coach, sim = this.sim, el = $('mCoach'); if (!el) return;
    c.t += dt;
    const S = [
      { txt: `Red is hostile. ${this.coarse ? 'Long-press' : 'Right-click'} one to engage.`, done: () => sim.stats.kills > 0 || c.t > 60 },
      { txt: 'Spend supply on the bar below.', done: () => sim.stats.launches > 3 || sim.stats.built > 0 || c.t > 30 },
      { txt: 'NEXT RAID skips the quiet time.', done: () => c.t > 14 },
    ];
    if (c.step >= S.length) { this.coach = null; el.hidden = true; this.updateSafe(); return; }
    const s = S[c.step];
    if (s.done()) { c.step++; c.t = 0; return; }
    const sig = 'c' + c.step;
    if (el._sig !== sig) {
      el._sig = sig; el.hidden = false;
      el.innerHTML = `<p>${esc(s.txt)}</p><button class="btn xs" type="button" data-cmd="coachnext">OK</button>`;
      setTimeout(() => this.updateSafe(), 50);
    }
  }
  // ---------------- pause menu
  pauseMenu() {
    const app = this.app;
    const was = this.paused; this.paused = true; this.renderTop();
    app.onModalClose = () => { this.paused = was; this.renderTop(); };
    app.modal(`<h3>Paused</h3><p class="dim">M${Rules.idx(this.def.id) + 1} · ${esc(this.def.name)} · H+${fmtT(this.sim.t)}</p>
      <div style="display:flex;flex-direction:column;gap:8px"><button class="btn primary big" type="button" data-close>Resume</button><button class="btn big" type="button" id="pmHow">How to play</button><button class="btn big" type="button" id="pmSet">Settings</button><button class="btn big" type="button" id="pmRestart">Restart mission</button><button class="btn big danger" type="button" id="pmQuit">Abandon mission</button></div>`, (dl, close) => {
      dl.querySelector('#pmHow').onclick = () => { app.onModalClose = null; close(); app.howToDlg(); app.onModalClose = () => { this.paused = was; this.renderTop(); }; };
      dl.querySelector('#pmSet').onclick = () => { app.onModalClose = null; close(); app.settingsDlg(true); app.onModalClose = () => { this.paused = was; this.ui.labels = app.settings.labels; this.renderTop(); }; };
      dl.querySelector('#pmRestart').onclick = () => { app.onModalClose = null; close(); app.confirm('Restart the mission?', 'Progress in this attempt is lost.', 'Restart', () => this.start(this.def, this.loadout, 'supervised')); app.onModalClose = () => { this.paused = was; }; };
      dl.querySelector('#pmQuit').onclick = () => { app.onModalClose = null; close(); app.confirm('Abandon the mission?', 'It counts as a failed attempt. You keep a quarter of the experience and can retry from the debrief.', 'Abandon', () => this.abandon(), true); app.onModalClose = () => { this.paused = was; }; };
    });
  }
}
