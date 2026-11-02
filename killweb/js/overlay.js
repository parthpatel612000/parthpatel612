// Kill Web: the command picture drawn over the 3D view. Track symbols, stalks, labels, rings, mesh links, shot trails.
// Pure Canvas 2D; positions come from the World's projection so the same code serves the 3D view and the map.
export const COL = { f: '#6cc6ff', h: '#ff6b5e', u: '#ffd866', n: '#8edb8e', amber: '#ffb547', teal: '#5fd3c5', text: '#e8edf1', dim: '#a7b1ba' };
export const FILL = { f: 'rgba(108,198,255,0.25)', h: 'rgba(255,107,94,0.25)', u: 'rgba(255,216,102,0.25)', n: 'rgba(142,219,142,0.25)' };
const SOFT = { f: 'rgba(108,198,255,0.55)', h: 'rgba(255,107,94,0.55)', u: 'rgba(255,216,102,0.6)', n: 'rgba(142,219,142,0.55)' };
const LBL = { f: '#d7efff', h: '#ffd6d1', u: '#fff0c2', n: '#d9f2d9' };
const SUB = { f: '#b5c6d2', h: '#cdb8b5', u: '#d6caa5', n: '#b9cdb9' };
// MIL-STD-2525 style frames on a 16 x 13 box
export const SYM = {
  'f-air': 'M2 12 A6 6 0 0 1 14 12', 'h-air': 'M2 12 L8 2 L14 12', 'u-air': 'M2 12 C1 8 3 6 5 6.5 C5 3.5 11 3.5 11 6.5 C13 6 15 8 14 12', 'n-air': 'M3 12 V3 H13 V12',
  'f-gnd': 'M2 2.5 H14 V11.5 H2 Z', 'h-gnd': 'M8 1 L15 6.5 L8 12 L1 6.5 Z', 'u-gnd': 'M8 1.2 C10.5 1.2 11 3.5 11 3.5 C13.5 3.5 15 5 15 6.5 C15 8 13.5 9.5 11 9.5 C11 9.5 10.5 11.8 8 11.8 C5.5 11.8 5 9.5 5 9.5 C2.5 9.5 1 8 1 6.5 C1 5 2.5 3.5 5 3.5 C5 3.5 5.5 1.2 8 1.2 Z', 'n-gnd': 'M2.5 1.5 H13.5 V12 H2.5 Z',
};
const PATHS = Object.fromEntries(Object.entries(SYM).map(([k, d]) => [k, new Path2D(d)]));
const AIRKIND = new Set(['air']);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const pad2 = (n) => String(n).padStart(2, '0');
export const fmtT = (t) => { t = Math.max(0, Math.floor(t)); return `${pad2(Math.floor(t / 3600))}:${pad2(Math.floor(t / 60) % 60)}:${pad2(t % 60)}`; };
export const fmtMS = (t) => { t = Math.max(0, Math.floor(t)); return `${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`; };

export function affOf(e) {
  if (e.side === 'f') return 'f';
  const k = e.trk;
  if (!k || !k.known) return 'u';
  return k.aff === 'n' ? 'n' : 'h';
}
export function isAir(e) { return e.band > 0; }
export function symKey(e) { return affOf(e) + '-' + (isAir(e) ? 'air' : 'gnd'); }
export function trackName(e) {
  const a = affOf(e);
  if (a === 'f') return e.name;
  const no = e.trk && e.trk.no ? String(e.trk.no).padStart(4, '0') : '----';
  if (a === 'u') return `TRK ${no} UNKNOWN`;
  return `TRK ${no} ${e.T.name}`;
}

export class Overlay {
  constructor(canvas, world) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.world = world;
    this.dpr = 1; this.w = 1; this.h = 1;
    this.hits = [];
    this.t = 0;
  }
  // rising combat text: SPLASH, MISS, HOSTILE, HIT
  float(x, y, alt, text, color, size = 12) {
    const f = this.floats || (this.floats = []);
    f.push({ x, y, alt: alt || 0, text, color, size, t0: performance.now() });
    if (f.length > 40) f.shift();
  }
  drawFloats() {
    const g = this.g, W = this.world, now = performance.now();
    this.floats = (this.floats || []).filter((f) => now - f.t0 < 1900);
    g.textAlign = 'center';
    for (const f of this.floats) {
      const p = W.projectKm(f.x, f.y, f.alt);
      if (!p.on) continue;
      const u = (now - f.t0) / 1900;
      g.globalAlpha = u < 0.12 ? u / 0.12 : 1 - Math.pow((u - 0.12) / 0.88, 2);
      g.font = `700 ${f.size}px "Barlow Semi Condensed", sans-serif`;
      const y = p.y - 18 - u * 30;
      g.lineWidth = 3.5; g.strokeStyle = 'rgba(6,8,10,0.85)'; g.strokeText(f.text, p.x, y);
      g.fillStyle = f.color; g.fillText(f.text, p.x, y);
    }
    g.globalAlpha = 1; g.textAlign = 'left';
  }
  clear() { if (this._clear) return; this.g.setTransform(1, 0, 0, 1, 0, 0); this.g.clearRect(0, 0, this.c.width, this.c.height); this._clear = true; }
  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.c.width = Math.round(w * dpr); this.c.height = Math.round(h * dpr);
    this.c.style.width = w + 'px'; this.c.style.height = h + 'px';
  }
  // ---------------- ground drawing helpers
  groundPath(pts) {
    const W = this.world, g = this.g;
    g.beginPath();
    let pen = false;
    for (const [x, y] of pts) {
      const p = W.projectKm(x, y, 4);
      if (!p.on || p.x < -4000 || p.x > this.w + 4000 || p.y < -4000 || p.y > this.h + 4000) { pen = false; continue; }
      if (!pen) { g.moveTo(p.x, p.y); pen = true; } else g.lineTo(p.x, p.y);
    }
  }
  ring(x, y, r, n = 56) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
    this.groundPath(pts);
  }
  // ---------------- main draw
  draw(sim, ui, dt) {
    const g = this.g, W = this.world;
    this.t += dt;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h); this._clear = false;
    if (!W.ready || !sim) return;
    this.hits = [];
    const mapK = W.view.mapK;
    const recs = W.recs;
    const byId = new Map(recs.map((r) => [r.e.id, r]));
    this.byId = byId;
    const sel = ui.sel != null ? sim.byId(ui.sel) : null;
    const zoomNear = W.view.dist < 16000;

    // grid and the mission boundary
    g.lineWidth = 1;
    g.strokeStyle = mapK > 0.5 ? 'rgba(200,215,225,0.17)' : 'rgba(235,240,245,0.13)';
    for (let x = 0; x <= 40; x += 5) { const pts = []; for (let y = 0; y <= 26; y += 0.5) pts.push([x, y]); this.groundPath(pts); g.stroke(); }
    for (let y = 0; y <= 26; y += 5) { const pts = []; for (let x = 0; x <= 40; x += 0.5) pts.push([x, y]); this.groundPath(pts); g.stroke(); }
    g.strokeStyle = 'rgba(240,244,248,0.5)'; g.lineWidth = 1.6; g.setLineDash([10, 7]);
    { const pts = []; for (let x = 0; x <= 40; x += 0.5) pts.push([x, 0]); for (let y = 0; y <= 26; y += 0.5) pts.push([40, y]); for (let x = 40; x >= 0; x -= 0.5) pts.push([x, 26]); for (let y = 26; y >= 0; y -= 0.5) pts.push([0, y]); this.groundPath(pts); g.stroke(); }
    g.setLineDash([]);
    if (mapK > 0.3) this.drawPlaceNames(sim, mapK);

    // threat rings for known air defense
    for (const r of recs) {
      const e = r.e;
      if (e.side !== 'h' || affOf(e) !== 'h' || !e.T.weapon) continue;
      const wk = e.T.weapon;
      if (wk !== 'sam' && wk !== 'manpads') continue;
      const R = KW.WT[wk].range;
      this.ring(r.x, r.y, R);
      g.fillStyle = 'rgba(255,107,94,0.06)'; g.fill();
      g.strokeStyle = 'rgba(255,107,94,0.55)'; g.lineWidth = 1.2; g.setLineDash([7, 5]); g.stroke(); g.setLineDash([]);
    }
    // jammer bubbles, Fury patrol, loiter areas
    for (const r of recs) {
      const e = r.e;
      if (e.side === 'f' && e.type === 'pulsar' && e.jamOn) {
        this.ring(r.x, r.y, e.T.jam * (sim.mkBonus('pulsar').jam ? 1 + sim.mkBonus('pulsar').jam / e.T.jam : 1));
        g.fillStyle = 'rgba(95,211,197,0.08)'; g.fill(); g.strokeStyle = 'rgba(95,211,197,0.7)'; g.lineWidth = 1.3; g.setLineDash([3, 4]); g.stroke(); g.setLineDash([]);
      }
      if (e.side === 'h' && e.T.jamMesh && affOf(e) === 'h') {
        this.ring(r.x, r.y, e.T.jamMesh);
        g.strokeStyle = 'rgba(255,107,94,0.4)'; g.lineWidth = 1; g.setLineDash([2, 5]); g.stroke(); g.setLineDash([]);
      }
    }
    for (const sr of W.shotRecs || []) {
      const s = sr.s;
      if (s.side === 'f' && s.W.kind === 'loiter' && s.loiterC && !s.tgt) {
        this.ring(s.loiterC[0], s.loiterC[1], 1.4, 40);
        g.strokeStyle = 'rgba(255,181,71,0.5)'; g.lineWidth = 1; g.setLineDash([4, 4]); g.stroke(); g.setLineDash([]);
      }
    }
    // selected friendly: weapon reach, sensor reach, mesh reach
    if (sel && sel.side === 'f' && byId.get(sel.id)) {
      const r = byId.get(sel.id);
      const ws = sim.weaponsOf(sel);
      let maxR = 0;
      for (const w of ws) { const st = sim.wstat(w.key, sel); if (st.range < 200) maxR = Math.max(maxR, st.range); }
      if (maxR) { this.ring(r.x, r.y, maxR); g.strokeStyle = 'rgba(255,181,71,0.75)'; g.lineWidth = 1.4; g.stroke(); }
      const sens = sel.T.sens;
      if (sens) {
        const sr = Math.max(sens.gnd || 0, ...(sens.air || [0])) * sim.mods.sensRange;
        if (sr) { this.ring(r.x, r.y, sr); g.strokeStyle = 'rgba(108,198,255,0.45)'; g.lineWidth = 1; g.setLineDash([2, 4]); g.stroke(); g.setLineDash([]); }
      }
      if (sel.meshR) { this.ring(r.x, r.y, sel.meshR); g.strokeStyle = 'rgba(108,198,255,0.25)'; g.lineWidth = 1; g.setLineDash([8, 6]); g.stroke(); g.setLineDash([]); }
    }

    // mesh links
    g.lineWidth = 1; g.strokeStyle = 'rgba(158,220,255,0.38)'; g.setLineDash([4, 5]);
    const nodes = recs.filter((r) => r.e.side === 'f' && r.e.connected && r.e.meshR);
    g.beginPath();
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > Math.max(a.e.meshR, b.e.meshR)) continue;
      if (!a.on || !b.on) continue;
      g.moveTo(a.sx, a.sy); g.lineTo(b.sx, b.sy);
    }
    g.stroke(); g.setLineDash([]);

    // build pads
    for (const p of sim.pads) {
      const pr = W.projectKm(p.x, p.y, 6);
      if (!pr.on) continue;
      const free = sim.padFree(p);
      const R = 7;
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; const x = pr.x + Math.cos(a) * R, y = pr.y + Math.sin(a) * R * 0.75; k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.closePath();
      if (free) {
        g.fillStyle = ui.hoverPad === p.id || ui.mode === 'build' ? 'rgba(255,181,71,0.25)' : 'rgba(255,255,255,0.08)'; g.fill();
        g.strokeStyle = ui.mode === 'build' ? COL.amber : 'rgba(255,255,255,0.65)'; g.lineWidth = 1.3; g.setLineDash([3, 2]); g.stroke(); g.setLineDash([]);
        this.hits.push({ kind: 'pad', id: p.id, x: pr.x, y: pr.y, r: 12, pri: 1 });
      }
    }

    // sites
    for (const s of sim.sites) {
      const r = byId.get(s.id);
      const pr = r ? { x: r.sx, y: r.sy, on: r.on } : W.projectKm(s.x, s.y, 10);
      if (!pr.on) continue;
      this.shield(pr.x, pr.y, s.alive ? COL.f : '#8692a0');
      this.hits.push({ kind: 'ent', id: s.id, x: pr.x, y: pr.y, r: 14, pri: 2 });
    }

    // uncertainty for coasting tracks and passive fixes
    for (const r of recs) {
      const e = r.e, k = e.trk;
      if (e.side === 'f' || !k || !k.det || !(k.unc > 0.12)) continue;
      this.ring(r.x, r.y, k.unc, 36);
      const a = affOf(e);
      g.strokeStyle = SOFT[a]; g.lineWidth = 1; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
    }

    // shot trails and heads
    for (const sr of W.shotRecs || []) {
      const s = sr.s;
      if (!sr.on) continue;
      const col = s.side === 'f' ? '255,226,170' : '255,140,120';
      const tr = s.trail || [];
      if (tr.length) {
        const pts = tr.map(([x, y]) => W.projectKm(x, y, sr.alt * 0.85)).concat([{ x: sr.sx, y: sr.sy, on: true }]);
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          if (!a.on || !b.on) continue;
          g.strokeStyle = `rgba(${col},${(0.12 + 0.6 * i / pts.length).toFixed(2)})`; g.lineWidth = 1.4;
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        }
      }
      g.fillStyle = `rgb(${col})`; g.beginPath(); g.arc(sr.sx, sr.sy, 2.2, 0, Math.PI * 2); g.fill();
      if (s.side === 'f' && sel && s.tgt === sel.id) {
        const tr2 = byId.get(sel.id);
        if (tr2) { g.strokeStyle = 'rgba(255,181,71,0.5)'; g.lineWidth = 1; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(sr.sx, sr.sy); g.lineTo(tr2.sx, tr2.sy); g.stroke(); g.setLineDash([]); }
      }
    }
    // enemy fire tracers (cannon, tank gun)
    for (const f of sim.fx) {
      if (f.kind !== 'tracer' || sim.t - f.t0 > 1.2) continue;
      const a = W.projectKm(f.x, f.y, f.band ? W.altOf({ band: f.band, type: '', id: 0 }) : 3), b = W.projectKm(f.x2, f.y2, f.band2 ? 300 : 3);
      if (!a.on || !b.on) continue;
      g.strokeStyle = 'rgba(255,200,120,0.8)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }

    // stalks, symbols, leaders
    const labelReq = [];
    const leaders = [];
    for (const r of recs) {
      const e = r.e;
      if (e.side === 'f' && e.T.kind === 'site') continue;
      if (!r.on || r.sx < -60 || r.sx > this.w + 60 || r.sy < -60 || r.sy > this.h + 60) continue;
      const a = affOf(e);
      const air = isAir(e);
      if (air) {
        g.strokeStyle = SOFT[a]; g.lineWidth = 1; g.globalAlpha = 0.8;
        g.beginPath(); g.moveTo(r.gx, r.gyS); g.lineTo(r.sx, r.sy); g.stroke(); g.globalAlpha = 1;
        g.fillStyle = SOFT[a]; g.beginPath(); g.ellipse(r.gx, r.gyS, 3.2, 1.6, 0, 0, Math.PI * 2); g.fill();
      }
      // velocity leader for hostile and unknown movers
      const crowd = leaders.some((q) => q.type === e.type && Math.abs(q.x - r.sx) < 26 && Math.abs(q.y - r.sy) < 26);
      if (e.side !== 'f' && e.trk && (e.trk.evx || e.trk.evy) && !crowd) {
        leaders.push({ type: e.type, x: r.sx, y: r.sy });
        const k = e.trk, sp = Math.hypot(k.evx, k.evy);
        const q0 = W.projectKm(r.x + k.evx / sp * 0.3, r.y + k.evy / sp * 0.3, r.alt);
        if (q0.on) {
          const dx = q0.x - r.sx, dy = q0.y - r.sy, dl = Math.hypot(dx, dy) || 1;
          const L = clamp(14 + sp * 3600 / 40, 16, 34);
          const q = { x: r.sx + dx / dl * L, y: r.sy + dy / dl * L };
          g.strokeStyle = COL[a]; g.lineWidth = 1.4; g.beginPath(); g.moveTo(r.sx + dx / dl * 7, r.sy + dy / dl * 7); g.lineTo(q.x, q.y); g.stroke();
          const ang = Math.atan2(dy, dx);
          g.fillStyle = COL[a]; g.beginPath(); g.moveTo(q.x + Math.cos(ang) * 2, q.y + Math.sin(ang) * 2); g.lineTo(q.x - Math.cos(ang - 0.45) * 7, q.y - Math.sin(ang - 0.45) * 7); g.lineTo(q.x - Math.cos(ang + 0.45) * 7, q.y - Math.sin(ang + 0.45) * 7); g.closePath(); g.fill();
        }
      }
      // the symbol: always for ground units and unknowns, for aircraft when the model is small or in map view
      const needSym = !r.model || !air || r.rpx < 18 || mapK > 0.5;
      if (needSym) this.symbol(r.sx, r.sy - (air ? 0 : 6), symKey(e), e.building ? 0.5 : 1, e.side === 'f' && !e.inMesh);
      // unknown tracks pulse while they are being identified
      if (a === 'u' && e.trk && e.trk.id > 0) {
        const ph = (this.t * 1.6) % 1;
        g.strokeStyle = `rgba(255,216,102,${(0.6 * (1 - ph)).toFixed(2)})`; g.lineWidth = 1.2;
        g.beginPath(); g.arc(r.sx, r.sy - (air ? 0 : 6), 9 + ph * 10, 0, Math.PI * 2); g.stroke();
      }
      const hr = Math.max(12, Math.min(40, r.rpx * 0.6));
      this.hits.push({ kind: 'ent', id: e.id, x: r.sx, y: r.sy - (air ? 0 : 6), r: hr, pri: e.side === 'f' ? 3 : 4 });
      labelReq.push(r);
    }

    // pairing preview, move orders, selection
    if (ui.preview && ui.preview.u && ui.preview.t) {
      const a = byId.get(ui.preview.u.id), b = byId.get(ui.preview.t.id);
      if (a && b && a.on && b.on) { g.strokeStyle = COL.amber; g.lineWidth = 1.5; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(b.sx, b.sy); g.stroke(); g.setLineDash([]); }
    }
    for (const r of recs) {
      const e = r.e;
      if (e.side !== 'f' || !e.mv || !(e.mv.mode === 'goto' || e.mv.mode === 'orbit') || !(e === sel || e.manual)) continue;
      const tx = e.mv.mode === 'goto' ? e.mv.tx : e.mv.cx, ty = e.mv.mode === 'goto' ? e.mv.ty : e.mv.cy;
      if (tx == null || (e !== sel && e.mv.mode === 'orbit')) continue;
      const q = W.projectKm(tx, ty, 4);
      if (!q.on) continue;
      g.strokeStyle = e === sel ? 'rgba(108,198,255,0.85)' : 'rgba(108,198,255,0.35)'; g.lineWidth = 1.2; g.setLineDash([2, 4]);
      g.beginPath(); g.moveTo(r.gx, r.gyS); g.lineTo(q.x, q.y); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(q.x, q.y, 3, 0, Math.PI * 2); g.stroke();
    }
    if (sel) {
      const r = byId.get(sel.id);
      if (r && r.on) {
        const air = isAir(sel);
        const y0 = r.sy - (air ? 0 : 6);
        const R = clamp(r.model && air ? r.rpx * 0.55 : 12, 12, 46);
        this.brackets(r.sx, y0, R, COL.amber);
        if (sel.side !== 'f' && sim.mods.predict && sel.trk) this.predict(sim, sel, r);
      }
    }
    if (ui.hover != null && ui.hover !== ui.sel) {
      const r = byId.get(ui.hover);
      if (r && r.on) this.brackets(r.sx, r.sy - (isAir(r.e) ? 0 : 6), 11, 'rgba(255,255,255,0.7)');
    }
    // command cursor preview
    if (ui.cursorKm && ui.mode) {
      const [x, y] = ui.cursorKm;
      const radius = { altius: 3.2, fury: 11, thunder: 6, rockets: 0.6, bolt: 0.5, thunderAltius: 2 }[ui.mode] || 0.4;
      this.ring(x, y, radius, 40);
      g.strokeStyle = COL.amber; g.lineWidth = 1.4; g.setLineDash([5, 4]); g.stroke(); g.setLineDash([]);
      const q = W.projectKm(x, y, 4);
      if (q.on) { g.strokeStyle = COL.amber; g.beginPath(); g.moveTo(q.x - 6, q.y); g.lineTo(q.x + 6, q.y); g.moveTo(q.x, q.y - 6); g.lineTo(q.x, q.y + 6); g.stroke(); }
    }

    // site labels are always shown, so they claim their space before the track labels
    const sr = this.safe || { x0: 0, y0: 0, x1: this.w, y1: this.h };
    const siteBoxes = [];
    for (const s of sim.sites) {
      const r = byId.get(s.id);
      const pr = r ? { x: r.sx, y: r.sy, on: r.on } : W.projectKm(s.x, s.y, 10);
      if (!pr.on) continue;
      const pct = Math.round(100 * Math.max(0, s.hp) / s.maxHp);
      const t = `${s.name.toUpperCase()} ${s.alive ? pct + '%' : 'LOST'}`, sub = '';
      const m = this.labelBox(0, 0, t, sub, 'f', true, true);
      if (pr.x + 14 < sr.x0 || pr.x + 14 + m.w > sr.x1 || pr.y - 10 < sr.y0 || pr.y + 22 > sr.y1) continue;
      siteBoxes.push({ x: pr.x + 14, y: pr.y - 9, w: m.w, h: m.h, t, sub });
    }
    // labels last, highest priority first, no overlaps
    if (ui.labels !== false) this.labels(sim, labelReq, sel, ui, zoomNear, siteBoxes);
    for (const b of siteBoxes) this.labelBox(b.x, b.y, b.t, b.sub, 'f', true);
    this.drawFloats();
  }

  drawPlaceNames(sim, mapK) {
    const g = this.g, W = this.world;
    g.globalAlpha = clamp((mapK - 0.3) / 0.5, 0, 1);
    g.font = '600 11px "Barlow Semi Condensed", sans-serif'; g.textAlign = 'center';
    for (const t of (W.T && W.T.towns) || []) {
      const p = W.projectKm(t.x, t.y, 0);
      if (!p.on) continue;
      g.fillStyle = 'rgba(210,220,228,0.55)'; g.fillText(t.name.toUpperCase(), p.x, p.y + 22);
    }
    g.textAlign = 'left'; g.globalAlpha = 1;
  }
  symbol(x, y, key, alpha = 1, dashed = false) {
    const g = this.g;
    g.save(); g.translate(x - 8, y - 6.5); g.globalAlpha = alpha;
    const aff = key[0];
    g.fillStyle = FILL[aff]; g.strokeStyle = COL[aff]; g.lineWidth = 1.6;
    if (dashed) g.setLineDash([2, 2]);
    const p = PATHS[key];
    if (key.endsWith('gnd') || key === 'u-air') g.fill(p);
    else { g.save(); g.fill(new Path2D(SYM[key] + ' Z')); g.restore(); }
    g.stroke(p);
    g.restore();
  }
  shield(x, y, col) {
    const g = this.g;
    g.save(); g.translate(x - 8, y - 9); g.scale(0.68, 0.68);
    g.fillStyle = 'rgba(10,22,32,0.7)'; g.strokeStyle = col; g.lineWidth = 2.6;
    const p = new Path2D('M12 2 L21 6 V13 C21 18.5 17 22.5 12 24 C7 22.5 3 18.5 3 13 V6 Z'); g.fill(p); g.stroke(p);
    g.restore();
  }
  brackets(x, y, R, col) {
    const g = this.g, L = Math.max(4, R * 0.45);
    g.strokeStyle = col; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - R, y - R + L); g.lineTo(x - R, y - R); g.lineTo(x - R + L, y - R);
    g.moveTo(x + R - L, y - R); g.lineTo(x + R, y - R); g.lineTo(x + R, y - R + L);
    g.moveTo(x + R, y + R - L); g.lineTo(x + R, y + R); g.lineTo(x + R - L, y + R);
    g.moveTo(x - R + L, y + R); g.lineTo(x - R, y + R); g.lineTo(x - R, y + R - L);
    g.stroke();
  }
  predict(sim, e, r) {
    const eta = sim.eta(e);
    if (!eta) return;
    const W = this.world, g = this.g;
    const q = W.projectKm(eta.site.x, eta.site.y, 4);
    if (!q.on) return;
    g.strokeStyle = 'rgba(255,107,94,0.85)'; g.lineWidth = 1.4; g.setLineDash([6, 4]);
    g.beginPath(); g.moveTo(r.sx, r.sy); g.lineTo(q.x, q.y); g.stroke(); g.setLineDash([]);
    this.tag((r.sx + q.x) / 2 + 8, (r.sy + q.y) / 2, `ETA ${eta.site.name.split(' ')[0].toUpperCase()} ${fmtMS(eta.t)}`, 'h');
  }
  tag(x, y, text, a) {
    const g = this.g;
    g.font = '500 10px "IBM Plex Mono", monospace';
    const w = g.measureText(text).width + 12;
    g.fillStyle = 'rgba(12,14,17,0.82)'; g.fillRect(x, y - 9, w, 18);
    g.strokeStyle = a === 'h' ? 'rgba(255,107,94,0.55)' : 'rgba(108,198,255,0.5)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y - 8.5, w - 1, 17);
    g.fillStyle = a === 'h' ? '#ffb3ab' : '#d7efff'; g.fillText(text, x + 6, y + 3.5);
  }
  // place: true for site labels (no symbol); measure: return the size only
  labelBox(x, y, title, sub, a, place, measure) {
    const g = this.g;
    g.font = '600 11.5px "Barlow Semi Condensed", sans-serif';
    const tw = g.measureText(title).width;
    g.font = '500 9.5px "IBM Plex Mono", monospace';
    const sw = sub ? g.measureText(sub).width : 0;
    const w = Math.max(tw, sw) + 14 + (place ? 0 : 16), h = sub ? 32 : 19;
    if (measure) return { w, h };
    g.fillStyle = 'rgba(12,14,17,0.8)'; g.fillRect(x, y, w, h);
    g.strokeStyle = SOFT[a]; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    let tx = x + 7;
    if (!place) {
      g.save(); g.translate(x + 6, y + 4); g.scale(0.78, 0.78);
      g.fillStyle = FILL[a]; g.strokeStyle = COL[a]; g.lineWidth = 1.8;
      g.fill(PATHS[a + '-air']); g.stroke(PATHS[a + '-air']); g.restore();
      tx += 15;
    }
    g.font = '600 11.5px "Barlow Semi Condensed", sans-serif'; g.fillStyle = LBL[a]; g.fillText(title, tx, y + 13);
    if (sub) { g.font = '500 9.5px "IBM Plex Mono", monospace'; g.fillStyle = SUB[a]; g.fillText(sub, tx, y + 26); }
    return { w, h };
  }
  labels(sim, list, sel, ui, near, pre) {
    const g = this.g, W = this.world;
    // cluster same-type tracks that sit close on screen into one label
    const groups = [];
    const used = new Set();
    const sorted = list.slice().sort((a, b) => this.pri(b.e, sel, ui) - this.pri(a.e, sel, ui));
    for (const r of sorted) {
      if (used.has(r)) continue;
      const e = r.e, a = affOf(e);
      const grp = [r]; used.add(r);
      if (e.side !== 'f' && e !== sel) {
        for (const q of sorted) {
          if (used.has(q) || q.e === sel) continue;
          if (affOf(q.e) !== a || q.e.type !== e.type || (a === 'u' && isAir(q.e) !== isAir(e))) continue;
          if (Math.hypot(q.sx - r.sx, q.sy - r.sy) < 46) { grp.push(q); used.add(q); }
        }
      }
      groups.push(grp);
    }
    const placed = (pre || []).map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }));
    const blocks = this.blocks || [];
    const hit = (b, p, m) => b.x < p.x + p.w + m && b.x + b.w + m > p.x && b.y < p.y + p.h + m && b.y + b.h + m > p.y;
    const overlaps = (b) => placed.some((p) => hit(b, p, 3)) || blocks.some((p) => hit(b, p, 2));
    let budget = near ? 60 : 26;
    for (const grp of groups) {
      const r = grp[0], e = r.e, a = affOf(e);
      const pri = this.pri(e, sel, ui);
      if (pri < 1 && !near) continue;
      if (a === 'f' && pri < 9 && !near) continue;
      if (budget-- <= 0 && pri < 5) break;
      const { title, sub } = this.labelText(sim, grp, e === sel || ui.hover === e.id);
      const m = this.labelBox(0, 0, title, sub, a, false, true);
      const y0 = r.sy - (isAir(e) ? 0 : 6);
      const off = Math.max(12, Math.min(34, r.rpx * 0.45));
      const cands = [[off + 8, -m.h / 2], [-off - 8 - m.w, -m.h / 2], [off, -m.h - off * 0.4], [off, off * 0.4], [-m.w / 2, -m.h - off - 4], [-m.w / 2, off + 4]];
      for (const [dx, dy] of cands) {
        const b = { x: r.sx + dx, y: y0 + dy, w: m.w, h: m.h };
        const sr = this.safe || { x0: 4, y0: 52, x1: this.w - 4, y1: this.h - 4 };
        if (b.x < sr.x0 || b.y < sr.y0 || b.x + b.w > sr.x1 || b.y + b.h > sr.y1) continue;
        if (overlaps(b) && (pri < 9 || blocks.some((p) => hit(b, p, 2)))) continue;
        placed.push(b);
        // leader line
        g.strokeStyle = SOFT[a]; g.lineWidth = 1; g.globalAlpha = 0.75;
        const lx = dx > 0 ? b.x : dx + m.w < 0 ? b.x + b.w : b.x + b.w / 2, ly = dy + m.h / 2 < 0 ? b.y + b.h : dy > 0 ? b.y : b.y + b.h / 2;
        g.beginPath(); g.moveTo(r.sx + Math.sign(lx - r.sx) * Math.min(Math.abs(lx - r.sx), 6), y0); g.lineTo(lx, ly); g.stroke(); g.globalAlpha = 1;
        const isSel = grp.some((q) => q.e === sel);
        this.labelBox(b.x, b.y, title, sub, a, false);
        if (isSel) { g.strokeStyle = COL.amber; g.lineWidth = 1.2; g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1); }
        this.hits.push({ kind: 'ent', id: e.id, x: b.x + b.w / 2, y: b.y + b.h / 2, r: Math.max(b.w, b.h) / 2, rect: b, pri: 2 });
        break;
      }
    }
  }
  pri(e, sel, ui) {
    if (e === sel) return 10;
    if (ui.hover === e.id) return 9;
    const a = affOf(e);
    if (a === 'h') return e.cls === 'boss' ? 8 : e.band > 0 ? 6 : 5;
    if (a === 'u') return 5;
    if (a === 'n') return e.band > 0 ? 3 : 0.5;
    if (e.type === 'menace') return 4;
    return e.band > 0 ? 3 : 2;
  }
  labelText(sim, grp, full) {
    const e = grp[0].e, a = affOf(e), n = grp.length;
    const x = n > 1 ? ' ×' + n : '';
    if (a === 'f') return { title: e.name, sub: full ? unitStatus(sim, e) : '' };
    const k = e.trk;
    if (a === 'u') return { title: 'UNKNOWN' + x, sub: full && n === 1 ? `ID ${Math.round((k.id || 0) * 100)}%` : '' };
    const spd = Math.round(Math.hypot(k.evx, k.evy) * 3600);
    return { title: e.T.name + x, sub: full && n === 1 ? (isAir(e) ? `${Math.round(this.world.altOf(e) / 10) * 10} m · ` : '') + `${spd} km/h` : '' };
  }
  pick(x, y, touch) {
    let best = null, bd = 1e9;
    for (const h of this.hits) {
      let d;
      if (h.rect) { const b = h.rect; d = x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h ? 0 : 1e9; }
      else d = Math.hypot(h.x - x, h.y - y) - h.r * (touch ? 1.5 : 1);
      if (d <= 0 && (d < bd - 0.01 || (Math.abs(d - bd) < 0.01 && best && h.pri > best.pri))) { bd = d; best = h; }
    }
    if (!best) {
      // nearest within a small radius
      for (const h of this.hits) { if (h.rect) continue; const d = Math.hypot(h.x - x, h.y - y); if (d < (touch ? 28 : 16) && d < bd) { bd = d; best = h; } }
    }
    return best;
  }
}

export function unitStatus(sim, e) {
  if (e.building) return `Raising tower · ${Math.ceil(e.building)} s`;
  if (!e.inMesh && e.T.kind !== 'site') return 'Off the mesh';
  if (e.rearm) return `Rearming · ${Math.ceil(e.rearm)} s`;
  const mv = e.mv || {};
  const parts = [];
  switch (e.type) {
    case 'menace': parts.push('Command node'); break;
    case 'sentry': parts.push('Radar and camera'); break;
    case 'nest': parts.push(`Anvil ${e.stock}/${e.maxStock}`); break;
    case 'rrpad': parts.push(`Roadrunner ${e.stock}/${e.maxStock}`); break;
    case 'tubes': parts.push(`Tubes ${e.stock}/${e.maxStock}`); break;
    case 'bcl': parts.push(`Barracuda ${e.stock}/${e.maxStock}`); break;
    case 'pulsar': parts.push(e.jamOn ? `Jamming · ${Math.round(100 * e.energy / e.maxEnergy)}%` : e.cool > 0 ? 'Cooling' : `Listening · ${Math.round(100 * e.energy / e.maxEnergy)}%`); break;
    case 'team': parts.push(`Bolt-M ${e.stock}/${e.maxStock}`); break;
    case 'thunder': parts.push(`RKT ${e.ammo.rkt} · BCL ${e.ammo.b100} · CI ${e.ammo.ci}`); break;
    case 'fury': parts.push(`AAM ${e.ammo.aam}${e.ammo.b500 != null ? ' · 500M ' + e.ammo.b500 : ''}`); break;
    case 'altius': parts.push(e.ewOn ? 'EW on' : 'ISR · relay'); break;
    case 'omen': parts.push('Radar · relay'); break;
    case 'bolt': parts.push(`Battery ${Math.max(0, Math.ceil((e.life || 0) / 60))} min`); break;
    default: break;
  }
  if (mv.mode === 'goto') parts.push('En route');
  else if (mv.mode === 'rtb') parts.push('Returning');
  else if (mv.mode === 'exit') parts.push('Leaving');
  else if (mv.mode === 'resupply') parts.push('Resupply run');
  else if (e.scoutFor) parts.push('Scouting');
  else if (mv.mode === 'orbit' && e.band) parts.push('Orbit');
  return parts.join(' · ');
}
