// Kill Web: between missions. Campaign map and commander, briefing and loadout, hangar and upgrades, debrief.
import { esc, fmtN, icon, Rules } from './app.js';

const KW = window.KW;
const $ = (id) => document.getElementById(id);
// mission pins on the theater map, as fractions of the map image
const PIN = { m1: [0.1276, 0.7739], m2: [0.2918, 0.7244], m3: [0.6827, 0.7597], m4: [0.3408, 0.5348], m5: [0.8776, 0.8163], m6: [0.5847, 0.3086], m7: [0.8408, 0.5489], m8: [0.3898, 0.1684], m9: [0.4918, 0.7962] };
const FRONT = [[0, 0.3941], [0.2439, 0.3378], [0.439, 0.4364], [0.6097, 0.4645], [0.7804, 0.3801], [1, 0.3097]];
const CHECK = '<svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="#8edb8e" stroke-width="1.8"><path d="M2 6.5 L5 9 L10 3"/></svg>';
const RING = (c) => `<svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.6" fill="none" stroke="${c}" stroke-width="1.6"/></svg>`;
const CROSS = '<svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="#ff6b5e" stroke-width="1.8"><path d="M2.5 2.5 L9.5 9.5 M9.5 2.5 L2.5 9.5"/></svg>';
const fmtT = (t) => { t = Math.max(0, Math.floor(t)); const p = (n) => String(n).padStart(2, '0'); return `${p(Math.floor(t / 3600))}:${p(Math.floor(t / 60) % 60)}:${p(t % 60)}`; };

const MKWORD = { hp: (v) => `+${v} hull`, mesh: (v) => `+${v} km mesh`, stock: (v) => `+${v} round${v > 1 ? 's' : ''}`, regen: (v) => `${Math.round(v * 100)}% faster reload`, pk: (v) => `+${Math.round(v * 100)}% hit`,
  air: (v) => `+${v} km air radar`, gnd: (v) => `+${v} km ground sensing`, id: (v) => `+${v} km ID reach`, idRate: (v) => `+${Math.round(v * 100)}% ID speed`, speed: (v) => `+${Math.round(v * 100)}% speed`,
  dmg: (v) => `+${Math.round(v * 100)}% damage`, jam: (v) => `+${v} km jam bubble`, energy: (v) => `+${v} jammer energy`, esm: (v) => `+${v} km listening`, station: (v) => `+${v} s on station`,
  aam: (v) => `+${v} AAM`, rkt: (v) => `+${v} rocket salvos`, b100: (v) => `+${v} Moray-1`, ci: (v) => `+${v} interceptors`, range: (v) => v < 1 ? `+${Math.round(v * 100)}% range` : `+${v} km range`,
  supplyRate: (v) => `+${Math.round(v * 100)}% supply`, cost: (v) => `${Math.round(v * 100)}% cheaper` };
const mkText = (o) => Object.entries(o || {}).map(([k, v]) => (MKWORD[k] ? MKWORD[k](v) : k)).join(' · ');

function castLine(who, text) {
  const c = KW.CAST[who] || { name: who, role: '', color: '#9aa6b1' };
  return `<div class="line"><div class="av" style="background:${c.color}">${esc(who.slice(0, 2))}</div><div><span class="who" style="color:${c.color}">${esc(who)}</span><span class="role">${esc(c.name)}, ${esc(c.role)}</span><p>${esc(text)}</p></div></div>`;
}

function prodStats(P) {
  const out = [];
  const T = P.unit ? KW.UT[P.unit] : null;
  if (P.id === 'wisp') return [['TYPE', 'Passive IR'], ['FITS', 'AST, Shade-X'], ['ID SPEED', '+15 to 30%'], ['EMITS', 'Nothing'], ['NIGHT', 'Full sight']];
  if (P.id === 'srm') return [['FITS', 'Rocket shots'], ['SPEED', 'Faster'], ['MK II', '+20% range'], ['MK III', '+6% hit'], ['COST', `${P.buy} cr`]];
  if (P.id === 'bolt') { const W = KW.WT.boltm; return [['RECON', 'Jolt quad'], ['STRIKE', 'OPF-L'], ['RANGE', `${W.range} km`], ['ROUNDS', `${KW.UT.team.stock}`], ['BATTERY', '10 min']]; }
  if (!T) return out;
  out.push(['HULL', String(T.hp)]);
  if (T.speed) out.push(['SPEED', `${fmtN(T.speed)} km/h`]);
  if (T.sens && T.sens.air) out.push(['RADAR', `${Math.max(...T.sens.air)} km`]);
  if (T.sens && T.sens.id) out.push(['ID RANGE', `${T.sens.id} km`]);
  const wk = T.weapon || (P.id === 'fury' ? 'aam' : P.id === 'altius' ? 'a600m' : P.id === 'thunder' ? 'rkt' : null);
  if (wk) { const W = KW.WT[wk]; out.push(['WEAPON', W.name]); if (W.range < 200) out.push(['REACH', `${W.range} km`]); }
  if (T.stock != null) out.push(['ROUNDS', String(T.stock)]);
  if (T.mesh) out.push(['MESH', `${T.mesh} km`]);
  if (T.jam) out.push(['JAM', `${T.jam} km`]);
  if (T.station) out.push(['ON STATION', `${T.station} s`]);
  if (T.band != null) out.push(['ALTITUDE', ['Ground', 'Low', 'Medium', 'High'][T.band]]);
  return out.slice(0, 5);
}

export class Menus {
  constructor(app) { this.app = app; this.selSkill = null; this.selMission = null; this.hgSel = 'menace'; }
  get p() { return this.app.profile; }

  // ---------------------------------------------------------------- campaign
  campaign() {
    const app = this.app, p = this.p;
    if (!p) return app.title();
    if (p.pendingChoice) { app.show('campaign'); this.renderCampaign(); return app.choiceDlg(p.pendingChoice, () => this.campaign()); }
    app.show('campaign');
    if (app.settings.music && app.musicOn !== 'menu') { app.audio.music(true, 'menu'); app.musicOn = 'menu'; }
    app.audio.ambient(false);
    this.renderCampaign();
  }
  renderCampaign() {
    const p = this.p;
    const wins = KW.MISSIONS.filter((m) => p.done[m.id] && p.done[m.id].best === 'win').length;
    $('cmpProg').textContent = `${wins} of 9 missions · ${p.difficulty[0].toUpperCase() + p.difficulty.slice(1)}`;
    this.renderTheater();
    this.renderSide();
  }
  renderTheater() {
    const p = this.p, th = $('theater');
    const fi = Rules.frontier(p);
    const act = KW.MISSIONS[Math.min(fi, 8)].act;
    const shift = p.ended ? -0.02 : act === 1 ? 0.12 : act === 2 ? 0.06 : 0;
    th.innerHTML = `<div class="map" id="thMap"><img src="assets/theater.jpg" alt="Relief map of the Kestrel Coast: farmland and towns along the southern shore, Vanta-held highlands to the north"><svg id="thSvg"></svg></div>
      <div class="legend panel"><span class="lbl">THEATER · KESTREL COAST</span>
      <span><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="rgba(13,30,44,0.9)" stroke="#6cc6ff" stroke-width="2"/></svg>Mission complete</span>
      <span><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="rgba(255,181,71,0.25)" stroke="#ffb547" stroke-width="2"/></svg>Next mission</span>
      <span><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 12 L6 6 L10 9 L15 3" fill="none" stroke="#ff6b5e" stroke-width="2" stroke-dasharray="4 2"/></svg>Line of contact</span></div>`;
    const map = $('thMap');
    const fit = () => {
      const W = th.clientWidth, H = th.clientHeight, iw = 1960, ih = 1697;
      const s = Math.max(W / iw, H / ih) * 1.0;
      const s2 = Math.min(Math.max(s, Math.min(W / iw, H / ih) * 1.12), 3);
      const w = iw * s2, h = ih * s2;
      map.style.width = w + 'px'; map.style.height = h + 'px';
      // keep the active part of the coast in view
      const [fx, fy] = PIN[Rules.nextUp(p) || 'm9'] || [0.5, 0.6];
      const left = Math.min(0, Math.max(W - w, W / 2 - fx * w)), top = Math.min(0, Math.max(H - h, H * 0.55 - fy * h));
      map.style.left = left + 'px'; map.style.top = top + 'px';
      draw(w, h);
    };
    const draw = (w, h) => {
      const svg = $('thSvg');
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const fr = FRONT.map(([x, y]) => [x * w, (y + shift) * h]);
      const fpath = fr.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      let s = `<defs><pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0 V10" stroke="#ff6b5e" stroke-opacity="0.32" stroke-width="2"/></pattern></defs>`;
      s += `<path d="M0 0 L${w} 0 ${fr.slice().reverse().map(([x, y]) => `L${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} Z" fill="url(#hatch)"/>`;
      s += `<path d="${fpath}" fill="none" stroke="#ff6b5e" stroke-width="2.2" stroke-dasharray="12 5"/>`;
      s += `<text x="${w * 0.66}" y="${h * (0.2 + shift * 0.5)}" font-family="Barlow Semi Condensed, sans-serif" font-weight="700" font-size="13" letter-spacing="3" fill="#ffb3ab" stroke="#0b0f12" stroke-width="3" paint-order="stroke">VANTA-HELD HIGHLANDS</text>`;
      s += `<text x="${w * 0.57}" y="${h * 0.965}" font-family="Barlow Semi Condensed, sans-serif" font-style="italic" font-size="13" letter-spacing="2" fill="#cfe4f2" fill-opacity="0.75" stroke="#0b0f12" stroke-width="3" paint-order="stroke">KESTREL SOUND</text>`;
      KW.MISSIONS.forEach((m, i) => {
        const [fx, fy] = PIN[m.id], x = fx * w, y = fy * h;
        const d = p.done[m.id], isNext = m.id === Rules.nextUp(p), locked = false;
        if (isNext) s += `<circle cx="${x}" cy="${y}" r="20" fill="none" stroke="#ffb547" stroke-opacity="0.35" stroke-width="6"><animate attributeName="r" values="16;22;16" dur="2.4s" repeatCount="indefinite"/></circle>`;
        const st = isNext ? 'stroke="#ffb547" fill="rgba(255,181,71,0.25)"' : d && d.best === 'win' ? 'stroke="#6cc6ff" fill="rgba(13,30,44,0.9)"' : locked ? 'stroke="#55606a" fill="rgba(13,18,22,0.85)"' : 'stroke="#ffb547" fill="rgba(13,18,22,0.85)"';
        s += `<circle cx="${x}" cy="${y}" r="${isNext ? 12 : 10}" stroke-width="2.2" ${st}/>`;
        s += `<text x="${x}" y="${y + 3.5}" font-family="IBM Plex Mono, monospace" font-size="10" font-weight="700" fill="${locked ? '#7c8791' : isNext ? '#ffe2b5' : '#d7efff'}" text-anchor="middle">${i + 1}</text>`;
      });
      svg.innerHTML = s;
      map.querySelectorAll('.mlabel, .mpin').forEach((n) => n.remove());
      KW.MISSIONS.forEach((m, i) => {
        const [fx, fy] = PIN[m.id], x = fx * w, y = fy * h;
        const d = p.done[m.id], locked = false;
        const lab = document.createElement('div'); lab.className = 'mlabel';
        lab.style.left = (x + 16) + 'px'; lab.style.top = (y - 14) + 'px';
        lab.innerHTML = `<b style="color:${locked ? '#8692a0' : '#e8edf1'}">${esc(m.name.toUpperCase())}</b><span>${esc(m.place)}${d && d.best === 'win' ? ` · bonus ${d.bonus}/${d.bonusMax} · pace ${d.pace || 1}/5` : locked ? ' · locked' : ''}</span>`;
        map.appendChild(lab);
        const pin = document.createElement('button'); pin.className = 'mpin'; pin.type = 'button';
        pin.style.left = x + 'px'; pin.style.top = y + 'px'; pin.disabled = locked;
        pin.setAttribute('aria-label', `Mission ${i + 1}, ${m.name}`);
        pin.onclick = () => { this.app.audio.ui(); this.selMission = m.id; this.renderSide(); };
        map.appendChild(pin);
      });
    };
    requestAnimationFrame(fit);
    if (this.thRO) this.thRO.disconnect();
    this.thRO = new ResizeObserver(() => fit()); this.thRO.observe(th);
  }
  renderSide() {
    const p = this.p, app = this.app;
    const need = Rules.xpToNext(p.level);
    const bonus = Object.values(p.done).reduce((a, d) => a + (d.bonus || 0), 0), bonusMax = KW.MISSIONS.reduce((a, m) => a + m.objectives.filter((o) => o.bonus).length, 0);
    const upId = Rules.nextUp(p);
    const sel = this.selMission && this.selMission !== upId ? KW.MISSION[this.selMission] : null;
    const md = sel || (upId ? KW.MISSION[upId] : null);
    let h = `<section class="panel card" aria-label="Commander">
      <div class="cmdr"><div class="badge-w6">W6</div><div style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:0"><span style="font-weight:700;font-size:16px;letter-spacing:0.1em">WARDEN-6</span><span class="dim" style="font-size:12px">Commander, Task Force Warden</span></div>
      <div style="text-align:right"><div class="lbl">LEVEL</div><div class="mono" style="font-size:22px;font-weight:600">${p.level}</div></div></div>
      <div style="display:flex;flex-direction:column;gap:5px"><div class="bar"><i style="width:${Math.min(100, 100 * p.xp / need)}%;background:var(--amber)"></i></div>
      <div style="display:flex;justify-content:space-between;font-size:11.5px" class="dim"><span class="mono">${fmtN(p.xp)} / ${fmtN(need)} XP</span><span>${p.level >= KW.MAX_LEVEL ? 'Max level' : 'Level ' + (p.level + 1) + ' at +' + fmtN(need - p.xp)}</span></div></div>
      <div class="statgrid"><div class="stat"><span class="v">${fmtN(p.credits)}</span><span class="k">CREDITS</span></div><div class="stat"><span class="v" style="color:${p.sp ? 'var(--amber)' : 'inherit'}">${p.sp}</span><span class="k">SKILL PTS</span></div>
      <div class="stat"><span class="v">${p.trust}</span><span class="k">CIVIC TRUST</span></div><div class="stat"><span class="v">${bonus}/${bonusMax}</span><span class="k">BONUS</span></div></div></section>`;
    if (md) {
      const i = Rules.idx(md.id), d = p.done[md.id];
      const replay = d && d.best === 'win';
      h += `<section class="panel card next" aria-label="Mission">
        <div style="display:flex;justify-content:space-between;align-items:baseline"><span class="lbl" style="color:${replay ? 'var(--f)' : 'var(--amber)'}">${replay ? 'REPLAY' : 'NEXT'} · ACT ${md.act}${i === 8 ? ' · FINALE' : ''}</span><span class="mono dim" style="font-size:11px">full arsenal</span></div>
        <h2>M${i + 1} · ${esc(md.name.toUpperCase())}</h2><span class="dim" style="font-size:12.5px;margin-top:-6px">${esc(md.place)}${md.night ? ' · night' : ''}${d && d.time ? ' · best ' + fmtT(d.time) : ''}</span>
        <span class="dim" style="font-size:13.5px">${esc(md.sum || '')}</span>
        ${this.paceLadder(d)}
        <div class="row"><button class="btn primary big" type="button" id="cDeploy" style="flex:1">${replay ? 'REPLAY' : 'DEPLOY'} · PACE ${p.pace || 1}</button>${sel ? '<button class="btn big" type="button" id="cBack">Recommended</button>' : ''}</div></section>`;
    } else {
      const e = Rules.ending(p);
      h += `<section class="panel card next"><span class="lbl" style="color:var(--n)">CAMPAIGN COMPLETE</span><h2>${esc(e.title.toUpperCase())}</h2><span class="quote">${esc(e.text)}</span><span class="dim" style="font-size:12.5px">Pick any mission on the map to replay it.</span></section>`;
    }
    // skills
    h += `<section class="panel card" aria-label="Mesh skills"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="lbl">MESH SKILLS</span><span class="mono" style="font-size:11px;color:${p.sp ? 'var(--amber)' : 'var(--fg3)'}">${p.sp} point${p.sp === 1 ? '' : 's'} to spend</span></div><div class="skills">`;
    for (const b of KW.BRANCHES) {
      h += `<div class="col"><span class="lbl" style="font-size:10px">${esc(b.name)}</span>`;
      for (const s of KW.SKILLS.filter((k) => k.br === b.id)) {
        const have = p.skills[s.id] || 0;
        h += `<button class="skill ${this.selSkill === s.id ? 'sel' : ''}" type="button" data-sk="${s.id}"><span class="nm">${esc(s.name)}</span><span class="pips">${Array.from({ length: s.max }, (_, k) => `<i class="${k < have ? 'on' : ''}"></i>`).join('')}<em>T${s.tier}</em></span></button>`;
      }
      h += '</div>';
    }
    h += '</div>';
    const ss = this.selSkill && KW.SKILLS.find((k) => k.id === this.selSkill);
    if (ss) {
      const have = p.skills[ss.id] || 0, can = Rules.canTakeSkill(p, ss);
      h += `<div style="display:flex;flex-direction:column;gap:6px;padding-top:4px;border-top:1px solid var(--line)"><div style="display:flex;justify-content:space-between"><b style="font-size:14px">${esc(ss.name)}</b><span class="mono dim" style="font-size:11px">${have}/${ss.max}</span></div><span style="font-size:13px;line-height:1.4;color:#d6dde2">${esc(ss.desc)}</span>
        <div class="row"><button class="btn primary sm" type="button" id="skTake" ${can ? '' : 'disabled'}>TRAIN · 1 POINT</button></div></div>`;
    }
    h += '</section>';
    h += `<div class="row"><button class="btn" type="button" data-go="hangar" style="flex:1">Hangar and upgrades</button><button class="btn" type="button" data-go="title">Title</button></div>`;
    $('cmpSide').innerHTML = h;
    const dep = $('cDeploy'); if (dep) dep.onclick = () => { app.audio.confirm(); this.deploy(md.id); };
    $('cmpSide').querySelectorAll('[data-cpace]').forEach((b) => b.onclick = () => { app.audio.ui(); p.pace = +b.dataset.cpace; app.save(); this.renderSide(); });
    const bk = $('cBack'); if (bk) bk.onclick = () => { app.audio.ui(); this.selMission = null; this.renderSide(); };
    $('cmpSide').querySelectorAll('[data-sk]').forEach((b) => b.onclick = () => { app.audio.ui(); this.selSkill = b.dataset.sk; this.renderSide(); });
    const tk = $('skTake'); if (tk) tk.onclick = () => { if (!Rules.canTakeSkill(p, ss)) return; p.skills[ss.id] = (p.skills[ss.id] || 0) + 1; p.sp--; app.save(); app.audio.confirm(); this.renderSide(); };
  }

  paceLadder(d) {
    const p = this.p, PL = KW.PACE || [], cur = PL[(p.pace || 1) - 1] || PL[0], best = (d && d.best === 'win' && (d.pace || 1)) || 0;
    if (!cur) return '';
    return `<div class="pace-side"><div style="display:flex;justify-content:space-between;align-items:baseline"><span class="lbl">PACE LEVEL</span><span class="mono dim" style="font-size:11px">${best ? 'best cleared ' + best + '/5' : 'not cleared yet'}</span></div>
      <div class="pace"><div class="seg" role="radiogroup" aria-label="Pace level">${PL.map((q) => `<button type="button" class="pl l${q.lv}${q.lv <= best ? ' won' : ''}" data-cpace="${q.lv}" role="radio" aria-checked="${q.lv === cur.lv}" title="${esc(q.name)}">${q.lv}</button>`).join('')}</div>
      <span class="pn"><b>${esc(cur.name.toUpperCase())}</b>${cur.reward > 1 ? ` <span>+${Math.round((cur.reward - 1) * 100)}%</span>` : ''}</span></div></div>`;
  }

  // ---------------------------------------------------------------- deploy: the full arsenal, briefing shown while the map loads
  async deploy(mid) {
    const app = this.app, p = this.p, def = KW.MISSION[mid];
    if (!def || !p) return this.campaign();
    const lo = Rules.defaultLoadout(p, def);
    p.loadouts[def.id] = lo; app.save();
    const { Mission } = await import('./mission.js');
    if (!this.mission) this.mission = new Mission(app);
    this.mission.start(def, lo, 'supervised');
  }
  briefing(mid) { return this.deploy(mid); }
  briefingScreen(mid) {
    const app = this.app, p = this.p, def = KW.MISSION[mid];
    if (!def) return this.campaign();
    app.show('briefing');
    this.brfMid = mid;
    this.loadout = Rules.defaultLoadout(p, def);
    this.startAuto = def.tutorial ? 'manual' : 'supervised';
    const i = Rules.idx(mid);
    $('brfT1').textContent = `BRIEFING · M${i + 1} ${def.name.toUpperCase()}`;
    $('brfT2').textContent = `${def.place} · Act ${def.act}${def.night ? ' · night' : ''}`;
    const objs = def.objectives.map((o) => `<div class="obj">${RING(o.bonus ? '#8692a0' : '#6cc6ff')}<span style="flex:1">${esc(o.label)}</span>${o.bonus ? '<span class="tagb">BONUS</span>' : ''}</div>`).join('');
    $('brfMain').innerHTML = `<div style="display:flex;flex-direction:column;gap:6px"><span class="lbl" style="color:var(--amber)">ACT ${def.act} · MISSION ${i + 1} OF 9${def.tutorial ? ' · TRAINING' : ''}</span><h2>${esc(def.name.toUpperCase())}</h2><span class="dim" style="font-size:14px">${esc(def.place)}, Kestrel Coast${def.night ? '. Night operation: cameras without infrared see less.' : ''}</span></div>
      <div class="lines">${def.brief.map(([w, t]) => castLine(w, t)).join('')}</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;align-items:start">
        <div style="display:flex;flex-direction:column;gap:8px"><span class="lbl">OBJECTIVES</span><div class="objs">${objs}</div>
          <span class="lbl" style="margin-top:8px">REWARD</span><span class="mono" style="font-size:13px">${fmtN(def.reward.xp)} XP · ${fmtN(def.reward.credits)} credits${def.reward.sp ? ' · 1 skill point' : ''}</span>
          <span class="dim" style="font-size:12px">Each bonus objective adds 60 XP and 40 credits.</span></div>
        <div style="display:flex;flex-direction:column;gap:8px"><span class="lbl">AREA OF OPERATIONS · 40 × 26 KM</span><div class="mini-wrap"><canvas id="brfMap"></canvas></div></div>
      </div>`;
    this.drawBriefMap(def);
    this.renderLoadout();
  }
  drawBriefMap(def) {
    const c = $('brfMap'); if (!c) return;
    const img = new Image();
    img.onload = () => {
      const W = c.clientWidth || 520, H = c.clientHeight || 338, dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = W * dpr; c.height = H * dpr;
      const g = c.getContext('2d'); g.scale(dpr, dpr);
      // the image covers -4..44 x -6..32 km; crop the 40 x 26 km area
      const sx = img.width / 48, sy = img.height / 38;
      g.filter = 'saturate(0.55) brightness(0.62)';
      g.drawImage(img, 4 * sx, 6 * sy, 40 * sx, 26 * sy, 0, 0, W, H);
      g.filter = 'none';
      const X = (x) => x / 40 * W, Y = (y) => y / 26 * H;
      g.strokeStyle = 'rgba(235,240,245,0.14)'; g.lineWidth = 1;
      for (let x = 5; x < 40; x += 5) { g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); }
      for (let y = 5; y < 26; y += 5) { g.beginPath(); g.moveTo(0, Y(y)); g.lineTo(W, Y(y)); g.stroke(); }
      g.font = '600 10px "Barlow Semi Condensed", sans-serif';
      for (const t of def.map.towns || []) { g.fillStyle = 'rgba(220,228,234,0.6)'; g.fillText(t.name.toUpperCase(), X(t.x) - 10, Y(t.y) - 12); }
      for (const pd of def.pads || []) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.setLineDash([2, 2]); g.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; const x = X(pd[0]) + Math.cos(a) * 5, y = Y(pd[1]) + Math.sin(a) * 5; k ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.stroke(); g.setLineDash([]); }
      for (const s of def.sites || []) { g.fillStyle = 'rgba(108,198,255,0.25)'; g.strokeStyle = '#6cc6ff'; g.lineWidth = 1.6; g.beginPath(); g.arc(X(s.x), Y(s.y), 6, 0, Math.PI * 2); g.fill(); g.stroke(); g.fillStyle = '#d7efff'; g.fillText(s.name.toUpperCase(), X(s.x) + 9, Y(s.y) - 6); }
      const [mx, my] = def.menace; g.fillStyle = 'rgba(108,198,255,0.3)'; g.strokeStyle = '#6cc6ff'; g.fillRect(X(mx) - 6, Y(my) - 4.5, 12, 9); g.strokeRect(X(mx) - 6, Y(my) - 4.5, 12, 9);
      g.fillStyle = '#d7efff'; g.fillText('MERIDIAN', X(mx) - 14, Y(my) + 17);
      if (def.convoy) { g.strokeStyle = 'rgba(108,198,255,0.6)'; g.setLineDash([4, 4]); const r = def.map.roads[def.convoy.road]; g.beginPath(); r.forEach(([x, y], k) => k ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); g.stroke(); g.setLineDash([]); }
      g.strokeStyle = 'rgba(255,107,94,0.75)'; g.fillStyle = '#ffb3ab'; g.font = '600 10px "Barlow Semi Condensed", sans-serif';
      const hdir = (def.map.high && def.map.high.side) || 'north';
      const lab = { north: [W * 0.5, 16], northeast: [W * 0.74, 16], northwest: [W * 0.16, 16], east: [W - 96, H * 0.4], center: [W * 0.46, H * 0.3] }[hdir] || [W * 0.5, 16];
      g.fillText('VANTA APPROACH', lab[0], lab[1]);
    };
    img.src = `assets/${def.id}/albedo.jpg`;
  }
  renderLoadout() {
    const app = this.app, p = this.p, def = KW.MISSION[this.brfMid];
    const cap = Rules.capacity(p, def), used = Rules.slotsOf(this.loadout);
    const forced = new Set(def.forced || []);
    let h = `<div style="display:flex;justify-content:space-between;align-items:baseline"><span class="lbl">LOADOUT</span><span class="mono" style="font-size:11.5px;color:${used > cap ? 'var(--h)' : 'var(--fg2)'}">mesh capacity ${used} / ${cap}</span></div>
      <div class="cap">${Array.from({ length: cap }, (_, k) => `<i class="${k < used ? 'on' : ''}"></i>`).join('')}</div>
      <div class="plist"><div class="prod in" style="cursor:default">${icon('menace')}<div><div class="nm">Meridian</div><div class="sb">Command node, always deployed</div></div><span class="cost">FREE</span></div>
      <div class="prod in" style="cursor:default">${icon('sentry')}<div><div class="nm">AST towers</div><div class="sb">${(def.pre || []).length} up · build more on ${def.pads.length} pads for 25 supply</div></div><span class="cost">FREE</span></div>`;
    for (const P of Rules.loadoutProducts()) {
      const av = Rules.available(p, P.id), on = this.loadout.includes(P.id), fz = forced.has(P.id);
      const fits = on || used + P.slot <= cap;
      const mk = p.mk[P.id] || 1;
      const sub = !av ? `Unlocks at M${Rules.idx(P.unlock) + 1}` : fz ? 'Required for this mission' : P.desc.split('. ')[0] + '.';
      h += `<button class="prod ${on ? 'in' : ''}" type="button" data-pid="${P.id}" ${!av || fz || (!on && !fits) ? 'disabled' : ''} aria-pressed="${on}">${icon(P.id)}<div style="min-width:0"><div class="nm">${esc(P.name)} <span class="mono dim" style="font-size:10px;font-weight:500">MK ${['I', 'II', 'III'][mk - 1]}</span></div><div class="sb">${esc(sub)}</div></div><span class="cost">${P.slot} SLOT${P.slot > 1 ? 'S' : ''}</span></button>`;
    }
    const owned = ['wisp', 'srm', 'bolt'].filter((id) => id === 'bolt' ? this.loadout.includes('eagleeye') : p.owned[id]).map((id) => KW.PRODUCT[id].name);
    if (owned.length) h += `<span class="dim" style="font-size:12px">Fitted modules: ${esc(owned.join(', '))}.</span>`;
    h += '</div>';
    const autoOK = !!(p.skills && p.skills.autonomy);
    h += `<div class="foot"><span class="lbl">START IN AUTONOMY</span><div class="seg">${[['manual', 'MANUAL'], ['supervised', 'SUPERVISED'], ['auto', 'AUTONOMOUS']].map(([k, n]) => `<button class="btn sm ${this.startAuto === k ? 'on' : ''}" type="button" data-auto="${k}" ${k === 'auto' && !autoOK ? 'disabled title="Needs the Full Autonomy skill"' : ''}>${n}</button>`).join('')}</div>
      <span class="dim" style="font-size:12px;line-height:1.4">${this.startAuto === 'manual' ? 'You approve every engagement yourself.' : this.startAuto === 'supervised' ? 'Defenses engage identified hostiles on their own. You run strikes and scouts.' : 'Defenses, strikes and scouting run on their own. Unknown tracks are never engaged.'}</span>
      <div class="row"><button class="btn primary big" type="button" id="bDeploy" style="flex:1" ${used > cap ? 'disabled' : ''}>DEPLOY</button><button class="btn big" type="button" data-go="hangar">Hangar</button></div></div>`;
    $('brfSide').innerHTML = h;
    $('brfSide').querySelectorAll('[data-pid]').forEach((b) => b.onclick = () => {
      const pid = b.dataset.pid;
      if (this.loadout.includes(pid)) this.loadout = this.loadout.filter((x) => x !== pid); else this.loadout.push(pid);
      app.audio.ui(); this.renderLoadout();
    });
    $('brfSide').querySelectorAll('[data-auto]').forEach((b) => b.onclick = () => { this.startAuto = b.dataset.auto; app.audio.ui(); this.renderLoadout(); });
    $('bDeploy').onclick = async () => {
      app.audio.confirm();
      p.loadouts[def.id] = this.loadout.slice(); app.save();
      const { Mission } = await import('./mission.js');
      if (!this.mission) this.mission = new Mission(app);
      this.mission.start(def, this.loadout.slice(), this.startAuto);
    };
  }

  // ---------------------------------------------------------------- hangar
  async hangar(pid) {
    const app = this.app, p = this.p;
    if (!p) return app.title();
    app.show('hangar');
    if (pid) this.hgSel = pid;
    $('hgCredits').textContent = fmtN(p.credits);
    $('hgProg').textContent = `${KW.PRODUCTS.length} products · full arsenal on every mission`;
    const groups = [['Command', 'COMMAND'], ['Sense', 'SENSE'], ['Act', 'ACT'], ['Arsenal', 'ARSENAL']];
    let h = '';
    for (const [cat, name] of groups) {
      h += `<span class="grp">${name}</span>`;
      for (const P of KW.PRODUCTS.filter((q) => q.cat === cat)) {
        const av = Rules.available(p, P.id);
        const mk = P.buy ? 'MK ' + ['I', 'II', 'III'][(p.mk[P.id] || 1) - 1] : 'MK ' + ['I', 'II', 'III'][(p.mk[P.id] || 1) - 1];
        h += `<button class="hg-item ${av ? '' : 'locked'}" type="button" data-hp="${P.id}" aria-pressed="${this.hgSel === P.id}">${icon(P.id, 30, 20, '#b8c3cc')}<span style="min-width:0;display:flex;flex-direction:column"><span class="nm">${esc(P.name)}</span><span class="sb">${av ? esc(P.model) : 'Clears at M' + (Rules.idx(P.unlock) + 1)}</span></span><span class="mk" style="color:${mk === 'OWNED' ? '#c6efc6' : '#c3ccd3'}">${mk}</span></button>`;
      }
    }
    $('hgList').innerHTML = h;
    $('hgList').querySelectorAll('[data-hp]').forEach((b) => b.onclick = () => { app.audio.ui(); this.hgSel = b.dataset.hp; this.hangar(); });
    if (!this.bp) {
      try { const { Blueprint } = await import('./blueprint.js'); this.bp = new Blueprint($('bp')); } catch (e) { console.warn(e); }
    }
    if (this.bp) this.bp.show(this.hgSel);
    this.renderProduct();
  }
  renderProduct() {
    const app = this.app, p = this.p, P = KW.PRODUCT[this.hgSel];
    const av = Rules.available(p, P.id);
    const mk = p.mk[P.id] || 1;
    $('hgHead').innerHTML = `<span class="lbl">${esc(P.cat.toUpperCase())}${P.slot ? ` · ${P.slot} SLOT${P.slot > 1 ? 'S' : ''}` : ''}${P.buy ? '' : ` · MK ${['I', 'II', 'III'][mk - 1]}`}</span><h2>${esc(P.name.toUpperCase())}</h2><span class="dim" style="font-size:14px">${esc(P.model)}</span>`;
    const st = prodStats(P);
    $('hgInfo').innerHTML = `${st.length ? `<div class="hg-stats" style="grid-template-columns:repeat(${st.length},minmax(0,1fr))">${st.map(([k, v]) => `<div class="stat"><span class="k">${k}</span><span class="v" style="font-size:13px">${esc(v)}</span></div>`).join('')}</div>` : ''}
      <p>${esc(P.desc)}</p>
      <div class="real"><span class="lbl" style="font-size:10px">REAL-WORLD CLASS</span><p style="margin:0">${esc(P.real)} Game values are fictional.</p><div class="row" style="gap:12px">${(P.src || []).map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener" style="font-size:12px">Source: ${esc(t.split(', ').slice(-1)[0])}</a>`).join('')}</div></div>`;
    let h = '';
    if (!av) {
      h = `<span class="lbl">LOCKED</span><p style="margin:0;font-size:13.5px;color:#d6dde2;line-height:1.45">Task Force Warden receives ${esc(P.name)} at mission ${Rules.idx(P.unlock) + 1}, ${esc(KW.MISSION[P.unlock].name)}.</p>`;
    } else if (P.buy && !P.mk) {
      h = `<span class="lbl">MODULE</span>`;
    }
    if (av) {
      if (P.buy) {
        const has = true;
        h += `<div class="tier ${has ? 'own' : ''}"><span class="t">${has ? 'OWNED' : 'BUY'}</span><div><div class="d1">${esc(P.name)}</div><div class="d2">${esc(P.desc.split('. ')[0])}.</div></div><span class="c">${has ? '' : P.buy}</span></div>`;
        if (!has) h += `<button class="btn primary big" type="button" id="hgBuy" ${p.credits >= P.buy ? '' : 'disabled'}>BUY · ${P.buy} CREDITS</button>`;
      }
      if (P.mk) {
        h += `<span class="lbl" style="margin-top:4px">UPGRADES</span>`;
        const tiers = [['MK I', 'Base fit', 'Standard issue', 0], ['MK II', 'Field upgrade', mkText(P.mk[0]), Rules.mkCost(P, 2)], ['MK III', 'Full fit', mkText(P.mk[1]), Rules.mkCost(P, 3)]];
        tiers.forEach(([t, d1, d2, c], k) => {
          const own = mk >= k + 1;
          h += `<div class="tier ${own ? 'own' : ''}"><span class="t">${t}</span><div><div class="d1">${d1}</div><div class="d2">${esc(d2)}</div></div><span class="c" style="color:${own ? '#c6efc6' : 'inherit'}">${own ? 'OWNED' : fmtN(c)}</span></div>`;
        });
        if (mk < 3) { const c = Rules.mkCost(P, mk + 1); h += `<button class="btn primary big" type="button" id="hgUp" ${p.credits >= c ? '' : 'disabled'}>UPGRADE TO MK ${['II', 'III'][mk - 1]} · ${fmtN(c)} CREDITS</button>`; if (p.credits < c) h += `<span class="dim" style="font-size:12px">You need ${fmtN(c - p.credits)} more credits. Missions and bonus objectives pay credits.</span>`; }
      }
      const xp = p.model[P.id] || 0, lv = KW.modelLevel(xp), nxt = KW.MODEL_XP[lv + 1];
      h += `<div style="display:flex;flex-direction:column;gap:6px;padding-top:10px;border-top:1px solid var(--line)"><div style="display:flex;justify-content:space-between"><span class="lbl">SOFTWARE BUILD</span><span class="mono" style="font-size:13px;color:var(--teal)">v1.${lv}</span></div>
        <div class="builds">${Array.from({ length: 5 }, (_, k) => `<i class="${k < lv ? 'on' : ''}"></i>`).join('')}</div>
        <div style="display:flex;justify-content:space-between;font-size:11.5px" class="dim"><span class="mono">${xp}${nxt ? ' / ' + nxt : ''} model XP</span><span>${nxt ? 'v1.' + (lv + 1) + ' at ' + nxt : 'Latest build'}</span></div>
        <span class="dim" style="font-size:12px;line-height:1.4">Every engagement trains the autonomy model. Each build adds 2.5% to its hit chance.</span></div>`;
      const sv = p.service[P.id] || { sorties: 0, defeated: 0, lost: 0 };
      h += `<div style="display:flex;flex-direction:column;gap:8px;padding-top:10px;border-top:1px solid var(--line)"><span class="lbl">SERVICE RECORD</span><div class="statgrid" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="stat"><span class="v">${sv.sorties}</span><span class="k">MISSIONS</span></div><div class="stat"><span class="v">${sv.defeated}</span><span class="k">DEFEATED</span></div><div class="stat"><span class="v">${sv.lost}</span><span class="k">LOST</span></div></div></div>`;
    }
    $('hgSide').innerHTML = h;
    const up = $('hgUp'); if (up) up.onclick = () => { const c = Rules.mkCost(P, mk + 1); if (p.credits < c) return; p.credits -= c; p.mk[P.id] = mk + 1; app.save(); app.audio.confirm(); this.hangar(); };
    const buy = $('hgBuy'); if (buy) buy.onclick = () => { if (p.credits < P.buy) return; p.credits -= P.buy; p.owned[P.id] = true; app.save(); app.audio.confirm(); this.hangar(); };
  }

  // ---------------------------------------------------------------- debrief
  debrief(def, sim, rep, extra) {
    const app = this.app, p = this.p;
    app.show('debrief');
    if (this.bp) { /* keep the hangar viewer for later */ }
    const i = Rules.idx(def.id);
    $('dbT1').textContent = `DEBRIEF · M${i + 1} ${def.name.toUpperCase()}`;
    $('dbT2').textContent = `${def.place} · mission time H+${fmtT(sim.t)}`;
    $('dbNav').innerHTML = rep.win ? '' : `<button class="btn sm" type="button" id="dbRetry">RETRY</button>`;
    const objRows = sim.objectives.map((o) => {
      const ok = o.state === 'done', bad = o.state === 'failed';
      const right = o.bonus ? '<span class="tagb">BONUS</span>' : `<span class="mono dim" style="font-size:11px">${esc(o.prog || '')}</span>`;
      return `<div class="obj">${ok ? CHECK : bad ? CROSS : RING('#8692a0')}<span style="flex:1;${ok ? '' : 'color:#c3ccd3'}">${esc(o.label)}</span>${right}</div>`;
    }).join('');
    const lost = (sim.stats.lost || []).length;
    const winLine = rep.win ? def.win : null;
    const reason = rep.reason ? rep.reason[0].toUpperCase() + rep.reason.slice(1) + '.' : 'The mission was abandoned.';
    const need = Rules.xpToNext(p.level);
    let h = `<div class="db-hero"><span class="res" style="color:${rep.win ? 'var(--n)' : 'var(--h)'}">${rep.win ? 'MISSION COMPLETE' : 'MISSION FAILED'}${rep.win && p.ended && !p.endSeen ? ' · CAMPAIGN COMPLETE' : ''}${rep.replay && !rep.newLevel ? ' · REPLAY' : ''} · PACE ${rep.pace || 1} ${esc((rep.paceName || '').toUpperCase())}${rep.newLevel && rep.best0 ? ' · NEW LEVEL' : ''}</span>
      <h2>${rep.win ? esc(def.name.toUpperCase()) : esc(reason)}</h2></div>`;
    h += `<section class="panel card" style="grid-column:span 4" aria-label="Objectives"><span class="lbl">OBJECTIVES · ${sim.objectives.filter((o) => o.state === 'done').length} OF ${sim.objectives.length}</span><div class="objs">${objRows}</div>
      <div class="statgrid" style="grid-template-columns:repeat(3,minmax(0,1fr));padding-top:10px;border-top:1px solid var(--line)"><div class="stat"><span class="v">${sim.stats.kills}</span><span class="k">TRACKS DEFEATED</span></div><div class="stat"><span class="v" style="color:${rep.harm ? 'var(--h)' : 'inherit'}">${rep.harm}</span><span class="k">CIVIL HARMED</span></div><div class="stat"><span class="v">${lost}</span><span class="k">ASSETS LOST</span></div></div></section>`;
    h += `<section class="panel card" style="grid-column:span 4" aria-label="Rewards"><span class="lbl">REWARDS</span>
      <div class="statgrid" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="reward"><span class="v">+${fmtN(rep.xp)}</span><span class="k lbl" style="font-size:9.5px">XP</span></div><div class="reward"><span class="v">+${fmtN(rep.credits)}</span><span class="lbl" style="font-size:9.5px">CREDITS</span></div><div class="reward"><span class="v">+${rep.sp + rep.ups}</span><span class="lbl" style="font-size:9.5px">SKILL POINTS</span></div></div>
      <div style="display:flex;flex-direction:column;gap:5px"><div style="display:flex;justify-content:space-between"><span class="lbl" style="color:${rep.ups ? 'var(--amber)' : 'var(--label)'}">${rep.ups ? `LEVEL UP · ${rep.lvl0} TO ${p.level}` : 'LEVEL ' + p.level}</span><span class="mono dim" style="font-size:11px">${fmtN(p.xp)} / ${fmtN(need)} XP</span></div><div class="bar"><i style="width:${Math.min(100, 100 * p.xp / need)}%;background:var(--amber)"></i></div></div>
      ${rep.builds.length ? `<span class="lbl">NEW SOFTWARE BUILDS</span><div class="row">${rep.builds.map((b) => `<span class="chip" style="color:var(--teal);border-color:rgba(95,211,197,0.45)">${esc(KW.PRODUCT[b.pid] ? KW.PRODUCT[b.pid].name : b.pid)} ${b.v}</span>`).join('')}</div>` : ''}
      ${rep.win && (rep.paceReward || 1) > 1 ? `<span class="dim mono" style="font-size:11.5px">PACE ${rep.pace} ×${(rep.paceReward || 1).toFixed(1)}</span>` : ''}</section>`;
    h += `<section class="panel card" style="grid-column:span 4" aria-label="Civic trust"><div style="display:flex;justify-content:space-between"><span class="lbl">CIVIC TRUST</span><span class="mono" style="font-size:13px">${rep.trust0} → ${rep.trust}</span></div>
      <div class="trust"><i style="width:${rep.trust}%"></i><b style="left:40%"></b><b style="left:70%"></b></div>
      <div style="display:flex;justify-content:space-between;font-size:11px" class="dim mono"><span>0</span><span>40 wary peace</span><span>70 best ending</span><span>100</span></div>
      </section>`;
    h += `<section class="panel card" style="grid-column:span 6" aria-label="After-action map"><span class="lbl">AFTER-ACTION MAP</span><div class="mini-wrap" style="max-width:none"><canvas id="dbMap"></canvas></div></section>`;
    const tl = this.timeline(sim, extra);
    h += `<section class="panel card" style="grid-column:span 6" aria-label="Timeline"><span class="lbl">TIMELINE</span><div class="tl">${tl.map(([t, x, c]) => `<div><span class="mono dim" style="font-size:11px;padding-top:1px">${fmtT(t).slice(3)}</span><span style="color:${c || '#dfe5ea'}">${esc(x)}</span></div>`).join('') || '<span class="dim">Quiet mission.</span>'}</div></section>`;
    const rows = this.perf(sim, extra);
    h += `<section class="panel card" style="grid-column:span 12" aria-label="Asset performance"><span class="lbl">ASSETS</span><div style="overflow-x:auto"><div class="tbl perf"><span class="h">ASSET</span><span class="h">SHOTS</span><span class="h">KILLS</span>
      ${rows.filter((r) => r.used || r.def).map((r) => `<span style="font-weight:600">${esc(r.name)}</span><span class="mono">${r.used}</span><span class="mono">${r.def}</span>`).join('')}</div></div></section>`;
    const nxt = rep.win ? (Rules.nextUp(p) || null) : null;
    h += `<div class="db-actions"><button class="btn big" type="button" data-go="hangar">Hangar</button><button class="btn big" type="button" id="dbGo">Campaign map</button>${rep.win ? '' : '<button class="btn primary big" type="button" id="dbRetry2">Retry mission</button>'}${rep.win && (rep.pace || 1) < (KW.PACE || []).length ? `<button class="btn big" type="button" id="dbUp">Replay at pace ${(rep.pace || 1) + 1}</button>` : ''}${nxt ? `<button class="btn primary big" type="button" id="dbNext">Next: M${Rules.idx(nxt) + 1} ${esc(KW.MISSION[nxt].name)}</button>` : ''}</div>`;
    $('dbGrid').innerHTML = h;
    this.drawAfterMap(def, sim, extra);
    const retry = () => { app.audio.confirm(); this.deploy(def.id); };
    if ($('dbRetry')) $('dbRetry').onclick = retry;
    if ($('dbRetry2')) $('dbRetry2').onclick = retry;
    const go = (then) => {
      app.audio.confirm();
      const after = () => { if (p.ended && rep.win && !p.endSeen) { p.endSeen = true; app.save(); app.endingDlg(then); } else then(); };
      if (p.pendingChoice) app.choiceDlg(p.pendingChoice, after); else after();
    };
    $('dbGo').onclick = () => go(() => this.campaign());
    if ($('dbNext')) $('dbNext').onclick = () => go(() => this.deploy(nxt));
    if ($('dbUp')) $('dbUp').onclick = () => go(() => { p.pace = Math.min((KW.PACE || []).length, (rep.pace || 1) + 1); app.save(); this.deploy(def.id); });
    if (rep.win) app.audio.win(); else app.audio.lose();
  }
  timeline(sim, extra) {
    const out = ((extra && extra.raids) || []).map(([t, x]) => [t, x, '#ffcf85']);
    const seen = new Set();
    for (const e of sim.events) {
      const t = e.text || '';
      let take = null;
      if (e.kind === 'end') take = [e.t, t, e.cat === 'good' ? '#c6efc6' : '#ffb3ab'];
      else if (/destroyed/.test(t) && /(MOTHERSHIP|HYDRA|SPIRE|LAUNCH SITE|C2 POST|STATIC|SCYTHE|SHRIKE|TALON|BASTION)/.test(t)) take = [e.t, t.replace(/^Splash\. /, ''), '#ffcf85'];
      else if (e.cat === 'bad' && /(lost|destroyed|down|failed|damaged)/i.test(t) && e.who !== 'MESH') take = [e.t, `${e.who}: ${t}`, '#ffb3ab'];
      else if (/identified HOSTILE: (MOTHERSHIP|SCYTHE|SHRIKE|TALON|HYDRA|SPIRE|BASTION|STATIC|C2 POST|LAUNCH SITE)/.test(t)) take = [e.t, t, null];
      else if (/arrived|arrives/i.test(t) && /truck|Haven/i.test(t)) take = [e.t, t, '#c6efc6'];
      if (!take) continue;
      const key = take[1].slice(0, 40);
      if (seen.has(key)) continue;
      seen.add(key); out.push(take);
    }
    out.sort((a, b) => a[0] - b[0]);
    if (out.length > 12) { const last = out[out.length - 1]; return out.slice(0, 11).concat([last]); }
    return out;
  }
  perf(sim, extra) {
    const p = this.p, rows = [];
    for (const pid of extra.loadout || []) {
      const P = KW.PRODUCT[pid]; if (!P) continue;
      const used = (extra.shots && extra.shots[pid]) || 0, def = (sim.stats.prodXP && sim.stats.prodXP[pid]) || 0;
      const lost = (sim.stats.lostTypes || []).filter((ty) => (KW.UT[ty] || {}).product === pid).length;
      let note = '';
      if (lost) note = `${lost} lost`;
      else if (used && def / used > 0.7) note = 'Efficient';
      else if (used && def / used < 0.35) note = 'Many misses: identify and mark first';
      else if (!used && pid === 'pulsar' && def) note = 'Jammed drones went down';
      else if (!used && ['ghost', 'omen', 'eagleeye'].includes(pid)) note = 'Sensing and relay';
      else if (!used) note = 'Unused';
      rows.push({ name: P.name, used, def, ver: Rules.version(p.model[pid]), note });
    }
    const rk = (extra.shots && extra.shots.srm) || 0;
    if (rk) rows.push({ name: 'Rockets', used: rk, def: (sim.stats.prodXP && sim.stats.prodXP.srm) || 0, ver: '', note: '' });
    const sentries = sim.ents.filter((e) => e.side === 'f' && e.type === 'sentry');
    rows.push({ name: 'AST towers', used: sentries.length, def: 0, ver: Rules.version(p.model.sentry), note: `${sim.stats.built || 0} built this mission` });
    return rows;
  }
  drawAfterMap(def, sim, extra) {
    const c = $('dbMap'); if (!c) return;
    const img = new Image();
    img.onload = () => {
      const W = c.clientWidth || 600, H = c.clientHeight || 390, dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = W * dpr; c.height = H * dpr;
      const g = c.getContext('2d'); g.scale(dpr, dpr);
      const sx = img.width / 48, sy = img.height / 38;
      g.filter = 'saturate(0.45) brightness(0.55)';
      g.drawImage(img, 4 * sx, 6 * sy, 40 * sx, 26 * sy, 0, 0, W, H);
      g.filter = 'none';
      const X = (x) => x / 40 * W, Y = (y) => y / 26 * H;
      for (const k of extra.kills || []) {
        g.fillStyle = k.side === 'h' ? 'rgba(255,107,94,0.85)' : 'rgba(108,198,255,0.85)';
        g.beginPath(); g.arc(X(k.x), Y(k.y), k.big ? 4 : 2, 0, Math.PI * 2); g.fill();
      }
      for (const tr of extra.tracks || []) {
        if (tr.pts.length < 2) continue;
        g.strokeStyle = 'rgba(255,107,94,0.75)'; g.lineWidth = 1.6; g.setLineDash([6, 4]);
        g.beginPath(); tr.pts.forEach(([x, y], k) => k ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); g.stroke(); g.setLineDash([]);
        g.font = '600 10px "IBM Plex Mono", monospace'; g.fillStyle = '#ffb3ab';
        const [lx, ly] = tr.pts[tr.pts.length - 1]; g.fillText(tr.name, X(lx) + 6, Y(ly) - 6);
      }
      for (const e of sim.ents) {
        if (e.side !== 'f' || e.band) continue;
        if (e.T.kind === 'site') {
          g.strokeStyle = e.alive ? '#6cc6ff' : '#8692a0'; g.lineWidth = 1.6; g.beginPath(); g.arc(X(e.x), Y(e.y), 6, 0, Math.PI * 2); g.stroke();
          g.font = '600 10px "IBM Plex Mono", monospace'; g.fillStyle = '#d7efff'; g.fillText(`${e.name.toUpperCase()} ${Math.round(100 * Math.max(0, e.hp) / e.maxHp)}%`, X(e.x) + 9, Y(e.y) + 14);
        } else {
          g.fillStyle = e.alive ? 'rgba(108,198,255,0.35)' : 'rgba(134,146,160,0.3)'; g.strokeStyle = e.alive ? '#6cc6ff' : '#8692a0'; g.lineWidth = 1.2;
          g.fillRect(X(e.x) - 4, Y(e.y) - 3, 8, 6); g.strokeRect(X(e.x) - 4, Y(e.y) - 3, 8, 6);
        }
      }
    };
    img.src = `assets/${def.id}/albedo.jpg`;
  }
}
