// Kill Web: the app shell. Profile and campaign rules, screen routing, title, settings and dialogs.
import { Store } from './store.js';
import { Audio } from './audio.js';
import { Menus } from './menus.js';

const KW = window.KW;
const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtN = (n) => Math.round(n).toLocaleString('en-US');

export const ICONS = {
  c2: 'M6 20 H34 V10 H6 Z M12 10 V5 M28 10 V3 M10 15 H18',
  tower: 'M20 24 V8 M14 24 L20 8 L26 24 M14 6 H26 V2 H14 Z',
  ir: 'M20 13 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 M20 13 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0',
  heli: 'M20 13 m-11 0 a11 11 0 1 0 22 0 a11 11 0 1 0 -22 0 M20 13 V25 M17 25 H23',
  team: 'M14 10 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M26 10 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M7 24 C8 17 20 17 20 24 M20 24 C20 17 32 17 33 24',
  tail: 'M4 13 H36 M20 9 V17 M10 13 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M30 13 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0',
  quad: 'M12 7 L28 19 M28 7 L12 19 M12 7 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M28 7 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M12 19 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M28 19 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0',
  rr: 'M8 6 H32 V20 H8 Z M13 20 V6 M20 20 V6 M27 20 V6',
  ew: 'M6 22 H34 M12 22 L16 12 H24 L28 22 M20 12 V6 M14 4 Q20 0 26 4 M11 8 Q20 1 29 8',
  tube: 'M8 13 H32 M20 3 V23 M10 9 V17 M33 13 L30 11 V15 Z',
  cm: 'M4 13 H32 L37 13 M32 10 L37 13 L32 16 M10 13 L7 7 M10 13 L7 19 M22 13 L25 8 M22 13 L25 18',
  jet: 'M20 2 L22 9 L35 17 L35 19 L22 16 L21.5 21 L25 23.5 L25 24.5 L20 23.5 L15 24.5 L15 23.5 L18.5 21 L18 16 L5 19 L5 17 L18 9 Z',
  tilt: 'M20 4 V22 M7 11 H33 M7 11 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M33 11 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M15 21 H25',
  srm: 'M6 9 H30 L34 13 L30 17 H6 Z M6 9 L3 7 V19 L6 17 M14 9 V17',
  bolt: 'M14 9 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M26 9 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M17 12 L20 18 L23 12 M20 18 V23',
};
export const PICON = { menace: 'c2', sentry: 'tower', wisp: 'ir', ghost: 'heli', eagleeye: 'team', omen: 'tail', anvil: 'quad', roadrunner: 'rr', pulsar: 'ew', bolt: 'bolt', altius: 'tube', barracuda: 'cm', fury: 'jet', thunder: 'tilt', srm: 'srm' };
export const icon = (pid, w = 40, h = 26, col = '#c9d3db') => `<svg width="${w}" height="${h}" viewBox="0 0 40 26" aria-hidden="true" fill="none" stroke="${col}" stroke-width="1.5" stroke-linejoin="round"><path d="${ICONS[PICON[pid]] || ICONS.c2}"/></svg>`;
export const LOGO = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#e8edf1" stroke-width="1.6"><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="M6.6 6.6 L10.4 10.4 M17.4 6.6 L13.6 10.4 M6.6 17.4 L10.4 13.6 M17.4 17.4 L13.6 13.6 M7 5 H17"/></svg>';

// ---------------------------------------------------------------- campaign rules
export const Rules = {
  idx(mid) { return KW.MISSIONS.findIndex((m) => m.id === mid); },
  newProfile(difficulty) {
    return { v: 1, created: Date.now(), savedAt: 0, difficulty: difficulty || 'standard', level: 1, xp: 0, credits: 400, sp: 2,
      skills: {}, mk: {}, owned: {}, unlocked: {}, model: {}, flags: {}, trust: 50, done: {}, loadouts: {}, choices: {},
      stats: { kills: 0, missions: 0, harm: 0, lost: 0, launches: 0, time: 0 }, service: {}, next: 'm1', ended: null, pendingChoice: null, pace: 1 };
  },
  // every mission is open; p.next is only the recommended one
  frontier() { return KW.MISSIONS.length - 1; },
  available(p, pid) { return !!KW.PRODUCT[pid]; },
  capacity() { return 99; },
  nextUp(p) { const m = KW.MISSIONS.find((q) => !(p.done[q.id] && p.done[q.id].best === 'win')); return m ? m.id : null; },
  mkCost(P, tier) { return Math.round((P.cost[tier - 2] || 0) * 0.5 / 10) * 10; },
  loadoutProducts() { return KW.PRODUCTS.filter((P) => P.unit && P.slot > 0); },
  slotsOf(list) { return list.reduce((a, pid) => a + ((KW.PRODUCT[pid] && KW.PRODUCT[pid].slot) || 0), 0); },
  // the whole arsenal deploys on every mission
  defaultLoadout(p, def) { return [...new Set([...(def.forced || []), ...KW.ARSENAL])]; },
  simProfile(p) {
    const un = Object.assign({}, p.unlocked, { a700m: true });
    const skills = Object.assign({}, p.skills, { autonomy: 1 });
    const owned = Object.assign({}, p.owned, { wisp: true, srm: true });
    return { skills, mk: p.mk, owned, unlocked: un, model: p.model, flags: p.flags };
  },
  xpToNext: (lvl) => KW.xpToNext(lvl),
  skillCost() { return 1; },
  canTakeSkill(p, s) {
    const have = (p.skills[s.id] || 0);
    if (have >= s.max || p.sp < 1) return false;
    if (s.tier === 1) return true;
    // tier gates: points spent in the branch
    const spent = KW.SKILLS.filter((k) => k.br === s.br).reduce((a, k) => a + (p.skills[k.id] || 0), 0);
    return spent >= (s.tier === 2 ? 2 : 4);
  },
  tierNeed(s) { return s.tier === 1 ? 0 : s.tier === 2 ? 2 : 4; },
  version(xp) { return 'v1.' + KW.modelLevel(xp || 0); },
  // apply a finished mission to the profile; returns a report for the debrief
  finish(p, def, sim, extra) {
    const out = sim.outcome || { win: false, reason: 'abandoned', t: sim.t };
    const win = !!out.win;
    const replay = !!(p.done[def.id] && p.done[def.id].best === 'win');
    const bonus = sim.objectives.filter((o) => o.bonus);
    const bonusMet = win ? bonus.filter((o) => o.state === 'done').length : 0;
    const primary = sim.objectives.filter((o) => !o.bonus);
    const r = def.reward || { xp: 300, credits: 200 };
    // pace level: higher levels pay more; clearing a new level on a mission pays in full plus a skill point per level
    const pace = sim.paceLv || 1, PQ = (KW.PACE || [])[pace - 1] || { reward: 1, name: 'Patrol' };
    const best0 = (p.done[def.id] && p.done[def.id].pace) || (replay ? 1 : 0);
    const newLevel = win && pace > best0;
    let xp = 0, credits = 0, sp = 0;
    if (win) { xp = r.xp + 60 * bonusMet; credits = Math.round(r.credits * 1.5) + 60 * bonusMet; sp = (replay ? 0 : (r.sp || 0) + 1) + Math.max(0, pace - Math.max(1, best0)); }
    else xp = Math.round(r.xp * 0.25);
    if (replay && win && !newLevel) { xp = Math.round(xp * 0.5); credits = Math.round(credits * 0.5); }
    xp = Math.round(xp * PQ.reward); credits = Math.round(credits * PQ.reward);
    // trust: civilians first
    const harm = sim.stats.harm || 0;
    let dTrust = 0;
    if (win) dTrust += bonus.some((o) => o.kind === 'noHarm' && o.state === 'done') ? 4 : 0;
    dTrust -= 6 * harm;
    if (win && bonus.some((o) => o.kind === 'siteHp' && o.state === 'done')) dTrust += 2;
    if (!win) dTrust -= 3;
    if (replay) dTrust = Math.min(0, dTrust);
    const trust0 = p.trust;
    p.trust = Math.max(0, Math.min(100, p.trust + dTrust));
    // level ups
    const lvl0 = p.level, xp0 = p.xp;
    p.xp += xp; p.credits += credits; p.sp += sp;
    let ups = 0;
    while (p.level < KW.MAX_LEVEL && p.xp >= this.xpToNext(p.level)) { p.xp -= this.xpToNext(p.level); p.level++; p.sp++; ups++; }
    // software builds from use
    const builds = [];
    for (const [pid, n] of Object.entries(sim.stats.prodXP || {})) {
      const before = KW.modelLevel(p.model[pid] || 0);
      p.model[pid] = (p.model[pid] || 0) + n;
      const after = KW.modelLevel(p.model[pid]);
      if (after > before) builds.push({ pid, v: 'v1.' + after });
    }
    // service record
    for (const pid of extra.loadout || []) { const s = p.service[pid] || (p.service[pid] = { sorties: 0, defeated: 0, lost: 0 }); s.sorties++; }
    for (const [pid, n] of Object.entries(sim.stats.prodXP || {})) { const s = p.service[pid] || (p.service[pid] = { sorties: 0, defeated: 0, lost: 0 }); s.defeated += n; }
    for (const ty of sim.stats.lostTypes || []) { const pid = (KW.UT[ty] || {}).product; if (pid) { const s = p.service[pid] || (p.service[pid] = { sorties: 0, defeated: 0, lost: 0 }); s.lost++; } }
    p.stats.kills += sim.stats.kills; p.stats.missions++; p.stats.harm += harm; p.stats.lost += (sim.stats.lost || []).length; p.stats.launches += sim.stats.launches || 0; p.stats.time += sim.t;
    const rec = p.done[def.id] || { best: null, bonus: 0, bonusMax: bonus.length, plays: 0, time: null };
    rec.plays++; rec.bonusMax = bonus.length;
    if (win) { rec.best = 'win'; rec.bonus = Math.max(rec.bonus, bonusMet); rec.time = rec.time ? Math.min(rec.time, sim.t) : sim.t; rec.pace = Math.max(rec.pace || 1, pace); }
    else if (!rec.best) rec.best = 'lose';
    p.done[def.id] = rec;
    let advanced = false;
    if (win && !replay) {
      const i = this.idx(def.id);
      const nxt = KW.MISSIONS[i + 1];
      if (nxt && this.idx(p.next) <= i) { p.next = nxt.id; advanced = true; }
      if (p.flags.airstrip) { p.flags.airstrip--; if (p.flags.airstrip <= 0) delete p.flags.airstrip; }
      if (def.choice && p.choices[def.id] == null) p.pendingChoice = def.id;
    }
    p.ended = KW.MISSIONS.every((m) => p.done[m.id] && p.done[m.id].best === 'win');
    p.loadouts[def.id] = extra.loadout || [];
    p.lastLoadout = extra.loadout || [];
    return { win, reason: out.reason, t: out.t, replay, xp, credits, sp, ups, lvl0, xp0, trust0, trust: p.trust, dTrust, bonusMet, bonusMax: bonus.length, primary, bonus, builds, advanced, harm, pace, paceName: PQ.name, paceReward: PQ.reward, newLevel, best0 };
  },
  applyChoice(p, mid, i) {
    const def = KW.MISSION[mid];
    const o = def && def.choice && def.choice.options[i];
    if (!o) return;
    const fx = o.fx || {};
    if (fx.model) for (const [pid, n] of Object.entries(fx.model)) { const cur = KW.modelLevel(p.model[pid] || 0); const tgt = Math.min(5, cur + n); p.model[pid] = Math.max(p.model[pid] || 0, KW.MODEL_XP[tgt]); }
    if (fx.mk) for (const [pid, t] of Object.entries(fx.mk)) p.mk[pid] = Math.max(p.mk[pid] || 1, t);
    if (fx.flag === 'airstrip') p.flags.airstrip = 3;
    if (fx.trust) p.trust = Math.min(100, p.trust + fx.trust);
    if (fx.credits) p.credits += fx.credits;
    if (fx.buy) p.owned[fx.buy] = true;
    p.choices[mid] = i;
    if (p.pendingChoice === mid) p.pendingChoice = null;
  },
  ending(p) { return KW.ENDINGS.find((e) => p.trust >= e.min) || KW.ENDINGS[KW.ENDINGS.length - 1]; },
};

// ---------------------------------------------------------------- the app
export const App = {
  KW, Rules, $, esc,
  store: new Store(), audio: new Audio(),
  profile: null, settings: null, screen: null,
  async boot() {
    this.settings = Object.assign({ quality: 'auto', labels: true, autoSlow: true, speed: 4, music: true, fullscreen: true, vol: { master: 0.8, sfx: 0.9, amb: 0.5, music: 0.35 } }, this.store.loadSettings());
    this.audio.set(this.settings.vol);
    this.fsInit();
    this.profile = await this.store.init((remote) => {
      // a newer cloud save arrived; take it unless a mission is running
      this.profile = remote;
      if (this.screen === 'title') this.title();
      else if (this.screen === 'campaign') this.menus.campaign();
    });
    this.menus = new Menus(this);
    $('titleArt').style.backgroundImage = 'url(assets/keyart.jpg)';
    for (const id of ['brfBack', 'hgBack', 'dbBack']) $(id).style.backgroundImage = 'url(assets/keyart.jpg)';
    document.addEventListener('click', (e) => {
      const go = e.target.closest('[data-go]');
      if (go) { this.audio.ui(); this.go(go.dataset.go); }
      const act = e.target.closest('[data-act="settings"]');
      if (act) { this.audio.ui(); this.settingsDlg(); }
    });
    const img = new Image(); img.src = 'assets/keyart.jpg';
    await new Promise((r) => { img.onload = r; img.onerror = r; setTimeout(r, 4000); });
    $('boot').hidden = true;
    this.title();
  },
  save() { if (this.profile) this.store.save(this.profile); },
  saveSettings() { this.store.saveSettings(this.settings); this.audio.set(this.settings.vol); },
  show(name) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== name;
    this.screen = name;
  },
  go(name, arg) {
    if (name === 'campaign') this.menus.campaign();
    else if (name === 'hangar') this.menus.hangar(arg);
    else if (name === 'briefing') this.menus.briefing(arg);
    else if (name === 'title') this.title();
  },
  startAudio() {
    this.audio.start();
    if (this.settings.music && !this.musicOn) { this.audio.music(true, 'menu'); this.musicOn = 'menu'; }
  },
  // ---------------- full screen and install
  // Phones and tablets go full screen (landscape where the browser allows it) on the first tap, and again on the
  // next tap after leaving it, until the player switches it off. iPhone Safari has no full screen for pages, so
  // there the option is adding the game to the home screen. Nothing installs or prompts on its own.
  fsInit() {
    const d = document, mm = (q) => !!(window.matchMedia && matchMedia(q).matches);
    this.touch = mm('(pointer: coarse)');
    this.standalone = mm('(display-mode: fullscreen)') || mm('(display-mode: standalone)') || navigator.standalone === true;
    this.fsOK = !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
    this.ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.fsAuto = this.touch && this.fsOK && !this.standalone && window.top === window;
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.bip = e; this.fsSync(); });
    window.addEventListener('appinstalled', () => { this.bip = null; this.installed = true; this.fsSync(); });
    d.addEventListener('fullscreenchange', () => this.fsSync());
    d.addEventListener('webkitfullscreenchange', () => this.fsSync());
    $('rotFull').onclick = () => this.fsSet(true);
    if (this.fsAuto) window.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse' && this.settings.fullscreen !== false) this.fsEnter(); }, true);
    this.fsSync();
  },
  fsActive() { const d = document; return !!(d.fullscreenElement || d.webkitFullscreenElement); },
  fsEnter() {
    if (this.fsActive() || Date.now() - (this.fsAt || 0) < 700) return;
    this.fsAt = Date.now();
    const el = document.documentElement;
    const lock = () => { try { const p = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not offered */ } };
    try {
      const r = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen && el.webkitRequestFullscreen();
      if (r && r.then) r.then(lock, () => {}); else setTimeout(lock, 250);
    } catch (e) { /* refused */ }
  },
  // the switch behind the title button, the settings row, the HUD button and the rotate screen
  fsSet(on) {
    if (this.touch) { this.settings.fullscreen = on; this.saveSettings(); }
    if (on) { this.fsEnter(); return; }
    const d = document;
    if (this.fsActive()) try { const r = (d.exitFullscreen || d.webkitExitFullscreen).call(d); if (r && r.catch) r.catch(() => {}); } catch (e) { /* already out */ }
  },
  canInstall() { return this.touch && !this.standalone && !this.installed && window.top === window; },
  fsSync() {
    $('rotFull').hidden = !this.fsAuto || this.fsActive();
    const c = $('titleCorner');
    if (!c || this.screen !== 'title') return;
    const full = this.fsActive();
    const icoFull = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="' + (full ? 'M5 1 V5 H1 M13 5 H9 V1 M9 13 V9 H13 M1 9 H5 V13' : 'M1 5 V1 H5 M9 1 H13 V5 M13 9 V13 H9 M5 13 H1 V9') + '"/></svg>';
    const icoGet = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M7 1 V9 M3.5 5.5 L7 9 L10.5 5.5 M1 10 V13 H13 V10"/></svg>';
    c.innerHTML = (this.fsOK && !this.standalone ? `<button class="btn" type="button" id="tFull">${icoFull}${full ? 'Exit full screen' : 'Full screen'}</button>` : '')
      + (this.canInstall() ? `<button class="btn" type="button" id="tInstall">${icoGet}Install app</button>` : '');
    if ($('tFull')) $('tFull').onclick = () => { this.startAudio(); this.audio.ui(); this.fsSet(!full); };
    if ($('tInstall')) $('tInstall').onclick = () => { this.startAudio(); this.audio.ui(); this.installDlg(); };
  },
  async installDlg() {
    if (this.bip) {
      // the browser's own install dialog, shown only because the player asked for it
      const e = this.bip; this.bip = null;
      try { await e.prompt(); const c = await e.userChoice; if (c && c.outcome === 'accepted') this.installed = true; } catch (er) { /* dismissed */ }
      this.fsSync();
      return;
    }
    const phoneSafari = this.ios && !this.fsOK;
    const steps = this.ios
      ? ['Tap <b>Share</b> (on iOS 26, look under the <b>⋯</b> button).', 'Scroll down and tap <b>Add to Home Screen</b>.', 'Leave <b>Open as Web App</b> on, then tap <b>Add</b>.']
      : ['Open the browser menu (<b>⋮</b> in Chrome).', 'Tap <b>Add to Home screen</b> or <b>Install app</b>, then <b>Install</b>.'];
    this.modal(`<h3>Install Kill Web</h3>
      <p>${phoneSafari ? 'Safari on iPhone keeps its bars on web pages. Opened from the home screen, Kill Web runs full screen instead.' : 'Opened from the home screen, Kill Web runs full screen in landscape, with no browser bars.'} Optional: the game plays the same in the browser.</p>
      <ol class="steps">${steps.map((t) => `<li>${t}</li>`).join('')}</ol>
      ${this.ios ? '<p class="dim" style="font-size:13px">The home screen app keeps its own save, separate from Safari.</p>' : ''}
      <div class="row end"><button class="btn primary" type="button" data-close>Got it</button></div>`);
  },
  title() {
    this.show('title');
    const p = this.profile;
    const m = $('titleMenu');
    const nextDef = p && KW.MISSION[p.next];
    const done = p ? Object.values(p.done).filter((d) => d.best === 'win').length : 0;
    const up = p ? Rules.nextUp(p) : null, upDef = up && KW.MISSION[up];
    m.innerHTML = (p && upDef ? `<button class="btn primary" type="button" id="tDeploy">Deploy <small>M${Rules.idx(up) + 1} ${esc(upDef.name.toUpperCase())} · PACE ${p.pace || 1}</small></button>` : '')
      + (p ? `<button class="btn ${upDef ? '' : 'primary'}" type="button" id="tContinue">Campaign map <small>${done} of 9 won</small></button>` : '')
      + `<button class="btn ${p ? '' : 'primary'}" type="button" id="tNew">New campaign <small>9 missions</small></button>`
      + `<button class="btn" type="button" id="tSettings">Settings</button>`
      + `<button class="btn" type="button" id="tAbout">How to play</button>`;
    $('titleLive').innerHTML = p ? `<span>WARDEN-6 · LEVEL ${p.level}</span><span>·</span><span>${done} OF 9 MISSIONS</span><span>·</span><span>${this.store.status === 'cloud' ? 'SAVED TO YOUR ACCOUNT' : 'SAVED IN THIS BROWSER'}</span>` : '';
    if ($('tContinue')) $('tContinue').onclick = () => { this.startAudio(); this.audio.confirm(); this.menus.campaign(); };
    if ($('tDeploy')) $('tDeploy').onclick = () => { this.startAudio(); this.audio.confirm(); this.menus.deploy(up); };
    $('tNew').onclick = () => { this.startAudio(); this.audio.ui(); this.newCampaignDlg(); };
    $('tSettings').onclick = () => { this.startAudio(); this.audio.ui(); this.settingsDlg(); };
    $('tAbout').onclick = () => { this.startAudio(); this.audio.ui(); this.howToDlg(); };
    this.fsSync();
  },
  // ---------------- dialogs
  modal(html, onOpen) {
    const md = $('modal'), dl = $('dlg');
    dl.innerHTML = html; md.hidden = false;
    const close = () => { md.hidden = true; dl.innerHTML = ''; if (this.onModalClose) { const f = this.onModalClose; this.onModalClose = null; f(); } };
    md.onclick = (e) => { if (e.target === md && !md.dataset.lock) close(); };
    dl.querySelectorAll('[data-close]').forEach((b) => b.onclick = () => { this.audio.ui(); close(); });
    if (onOpen) onOpen(dl, close);
    const f = dl.querySelector('button.primary') || dl.querySelector('button');
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
    return close;
  },
  confirm(title, text, yes, onYes, danger) {
    this.modal(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="row end"><button class="btn" type="button" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" type="button" id="cfYes">${esc(yes)}</button></div>`, (dl, close) => {
      dl.querySelector('#cfYes').onclick = () => { close(); onYes(); };
    });
  },
  newCampaignDlg() {
    let diff = 'standard';
    const D = [['recruit', 'Recruit', 'Fewer, weaker raids. For learning the kill chain.'], ['standard', 'Standard', 'The campaign as designed.'], ['veteran', 'Veteran', 'Larger raids and tougher targets.']];
    this.modal(`<h3>New campaign</h3><p>Nine missions on the Kestrel Coast, all open from the start, with the full arsenal on every one. Your choices and every civilian track you protect decide how it ends.</p>
      <div class="lbl">Difficulty</div><div class="diff" id="ncDiff">${D.map(([k, n, d]) => `<button class="btn ${k === diff ? 'on' : ''}" type="button" data-d="${k}">${n}<span>${d}</span></button>`).join('')}</div>
      ${this.profile ? '<p class="dim" style="font-size:13px">Starting over replaces your current campaign.</p>' : ''}
      <div class="row end"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" id="ncGo">Start campaign</button></div>`, (dl, close) => {
      dl.querySelectorAll('[data-d]').forEach((b) => b.onclick = () => { diff = b.dataset.d; this.audio.ui(); dl.querySelectorAll('[data-d]').forEach((x) => x.classList.toggle('on', x.dataset.d === diff)); });
      dl.querySelector('#ncGo').onclick = () => {
        close();
        this.profile = Rules.newProfile(diff);
        this.save();
        this.audio.confirm();
        this.menus.deploy('m1');
      };
    });
  },
  settingsDlg(inMission) {
    const s = this.settings;
    const pct = (v) => Math.round(v * 100);
    this.modal(`<h3>Settings</h3>
      <div class="set"><div><div>Graphics</div><div class="d">Low halves the terrain mesh and drops antialiasing. Auto picks low on phones.</div></div><div class="seg" id="sQ">${['auto', 'high', 'low'].map((q) => `<button class="btn sm ${s.quality === q ? 'on' : ''}" type="button" data-q="${q}">${q.toUpperCase()}</button>`).join('')}</div></div>
      <div class="set"><div><div>Track labels</div><div class="d">Name boxes beside tracks and assets.</div></div><button class="btn sm ${s.labels ? 'on' : ''}" type="button" id="sLab">${s.labels ? 'ON' : 'OFF'}</button></div>
      <div class="set"><div><div>Slow down on contact</div><div class="d">Drops the game to 1x when a hostile is identified or a site takes fire.</div></div><button class="btn sm ${s.autoSlow ? 'on' : ''}" type="button" id="sSlow">${s.autoSlow ? 'ON' : 'OFF'}</button></div>
      <div class="set"><div><div>Music</div></div><button class="btn sm ${s.music ? 'on' : ''}" type="button" id="sMus">${s.music ? 'ON' : 'OFF'}</button></div>
      ${this.fsAuto ? `<div class="set"><div><div>Full screen</div><div class="d">Goes full screen and landscape on your first tap, and again after you leave it.</div></div><button class="btn sm ${s.fullscreen !== false ? 'on' : ''}" type="button" id="sFull">${s.fullscreen !== false ? 'ON' : 'OFF'}</button></div>` : ''}
      ${this.canInstall() ? '<div class="set"><div><div>Install app</div><div class="d">Optional. Adds Kill Web to your home screen, where it opens full screen with no browser bars.</div></div><button class="btn sm" type="button" id="sInst">HOW</button></div>' : ''}
      ${[['master', 'Volume'], ['sfx', 'Effects'], ['amb', 'Ambience'], ['music', 'Music level']].map(([k, n]) => `<div class="set"><label for="v_${k}">${n}</label><input type="range" id="v_${k}" min="0" max="100" value="${pct(s.vol[k])}"></div>`).join('')}
      ${inMission ? '' : `<div class="set"><div><div>Campaign</div><div class="d">Erase the saved campaign and start from the title screen.</div></div><button class="btn sm danger" type="button" id="sWipe" ${this.profile ? '' : 'disabled'}>RESET</button></div>`}
      <div class="row end"><button class="btn primary" type="button" data-close>Done</button></div>`, (dl, close) => {
      dl.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => { s.quality = b.dataset.q; dl.querySelectorAll('[data-q]').forEach((x) => x.classList.toggle('on', x.dataset.q === s.quality)); this.saveSettings(); this.audio.ui(); });
      const tog = (id, key, after) => { const b = dl.querySelector(id); b.onclick = () => { s[key] = !s[key]; b.classList.toggle('on', s[key]); b.textContent = s[key] ? 'ON' : 'OFF'; this.saveSettings(); this.audio.ui(); if (after) after(); }; };
      tog('#sLab', 'labels'); tog('#sSlow', 'autoSlow');
      tog('#sMus', 'music', () => { if (s.music) { this.audio.music(true, this.screen === 'mission' ? 'mission' : 'menu'); this.musicOn = 'on'; } else { this.audio.music(false); this.musicOn = null; } });
      for (const k of ['master', 'sfx', 'amb', 'music']) dl.querySelector('#v_' + k).oninput = (e) => { s.vol[k] = e.target.value / 100; this.saveSettings(); };
      const fb = dl.querySelector('#sFull');
      if (fb) fb.onclick = () => { const on = s.fullscreen === false; this.fsSet(on); fb.classList.toggle('on', on); fb.textContent = on ? 'ON' : 'OFF'; this.audio.ui(); };
      const ib = dl.querySelector('#sInst');
      if (ib) ib.onclick = () => { this.audio.ui(); close(); this.installDlg(); };
      const w = dl.querySelector('#sWipe');
      if (w) w.onclick = () => { close(); this.confirm('Reset the campaign?', 'Your commander, credits, upgrades and mission record will be erased. This cannot be undone.', 'Erase campaign', async () => { await this.store.wipe(); this.profile = null; this.title(); }, true); };
    });
  },
  howToDlg() {
    this.modal(`<h3>How to play</h3>
      <div class="howto">
        <span><b>Red</b> is hostile, <b>yellow</b> unknown, <b>green</b> civilian. Only identified hostiles can be engaged.</span>
        <span><b>Right-click</b> a hostile (long-press on touch): the best shooter engages.</span>
        <span><b>Bottom bar</b>: each deployment shows its supply cost. AST, Zenith, FQ-44A, Tremor, Rockets, Jolt, Jam.</span>
        <span><b>AUTO</b> speed runs fast when quiet. <b>NEXT RAID</b> (N) skips ahead.</span>
        <span><b>Pace 1 to 5</b> on the briefing: faster enemies and faster deployment, more rewards.</span>
        <span><b>Keys</b>: Space pause · M map · Tab next hostile · F follow · R engage selected.</span>
      </div>
      <div class="row end"><button class="btn primary" type="button" data-close>Got it</button></div>`);
  },
  choiceDlg(mid, then) {
    const def = KW.MISSION[mid];
    const c = def.choice, who = KW.CAST[c.who] || { name: c.who, color: '#ccc' };
    const md = $('modal'); md.dataset.lock = '1';
    this.modal(`<div class="lbl">A DECISION · ${esc(def.name.toUpperCase())}</div>
      <div class="line"><div class="av" style="background:${who.color}">${esc(c.who.slice(0, 2))}</div><div><span class="who" style="color:${who.color}">${esc(c.who)}</span><span class="role">${esc(who.role || '')}</span><p>${esc(c.text)}</p></div></div>
      <div style="display:flex;flex-direction:column;gap:8px">${c.options.map((o, i) => `<button class="choice" type="button" data-i="${i}"><b>${esc(o.label)}</b><span>${esc(o.detail)}</span></button>`).join('')}</div>`, (dl, close) => {
      dl.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => {
        Rules.applyChoice(this.profile, mid, +b.dataset.i); this.save(); this.audio.confirm();
        delete md.dataset.lock; close(); if (then) then();
      });
    });
  },
  endingDlg(then) {
    const p = this.profile, e = Rules.ending(p);
    const md = $('modal'); md.dataset.lock = '1';
    this.modal(`<div class="lbl">CAMPAIGN COMPLETE · CIVIC TRUST ${p.trust}</div><h3 style="font-size:28px">${esc(e.title)}</h3><p>${esc(e.text)}</p>
      <div class="statgrid"><div class="stat"><span class="v">${fmtN(p.stats.kills)}</span><span class="k">TRACKS DEFEATED</span></div><div class="stat"><span class="v">${p.stats.harm}</span><span class="k">CIVIL HARMED</span></div><div class="stat"><span class="v">${p.stats.lost}</span><span class="k">ASSETS LOST</span></div><div class="stat"><span class="v">${p.level}</span><span class="k">LEVEL</span></div></div>
      <p class="dim" style="font-size:13px">You can replay any mission from the campaign map to raise your bonus count, or start a new campaign from the title screen.</p>
      <div class="row end"><button class="btn primary" type="button" id="enOk">Back to the campaign</button></div>`, (dl, close) => {
      dl.querySelector('#enOk').onclick = () => { delete md.dataset.lock; close(); if (then) then(); };
    });
  },
};

window.addEventListener('error', (e) => { console.error('[killweb]', e.message); });
App.boot().catch((e) => { console.error(e); const m = $('bootMsg'); if (m) m.textContent = 'Could not start: ' + (e && e.message ? e.message : e); });
window.__app = App;
