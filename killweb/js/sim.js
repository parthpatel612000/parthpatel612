/* Kill Web: simulation. DOM-free so it runs headless in Node for balance tests.
   World units: km and game seconds. The renderer and UI only read this state and call the cmd* methods. */
(function (KW) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hyp = Math.hypot;
  const lerp = (a, b, t) => a + (b - a) * t;
  const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const dist = (a, b) => hyp(a.x - b.x, a.y - b.y);

  function mulberry(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function Noise(seed) {
    const r = mulberry(seed * 2654435761);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    const perm = new Uint16Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const val = new Float32Array(256);
    for (let i = 0; i < 256; i++) val[i] = r();
    const fade = (t) => t * t * (3 - 2 * t);
    const v = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const X = xi & 255, Y = yi & 255;
      const a = val[perm[X + perm[Y]]], b = val[perm[X + 1 + perm[Y]]];
      const c = val[perm[X + perm[Y + 1]]], d = val[perm[X + 1 + perm[Y + 1]]];
      const u = fade(xf), w = fade(yf);
      return lerp(lerp(a, b, u), lerp(c, d, u), w);
    };
    this.v = v;
    this.fbm = (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { s += a * v(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; };
  }

  // ---------------------------------------------------------------- terrain
  class Terrain {
    constructor(map, W, H) {
      this.W = W; this.H = H;
      this.n = new Noise(map.seed || 1);
      const c = map.coast || { side: 'none' };
      this.side = c.side; this.d = c.d || 3;
      const hi = map.high || { side: 'none', k: 0.5 };
      this.hs = hi.side; this.hk = hi.k == null ? 0.6 : hi.k;
    }
    wob(t, o) { return (this.n.fbm(t * 0.11 + o, o * 0.37 + 2.2, 3) - 0.5) * 3.4; }
    // > 0 at sea (roughly km past the shoreline), < 0 on land
    shore(x, y) {
      const s = this.side, d = this.d, W = this.W, H = this.H;
      let v = -99;
      if (s === 'south' || s === 'southwest' || s === 'southeast') v = Math.max(v, y - (H - d + this.wob(x, 1.7)));
      if (s === 'east' || s === 'southeast') v = Math.max(v, x - (W - d + this.wob(y, 4.1)));
      if (s === 'west' || s === 'southwest') v = Math.max(v, (s === 'southwest' ? d * 0.8 : d) + this.wob(y, 6.3) - x);
      if (s === 'north') v = Math.max(v, d + this.wob(x, 8.8) - y);
      return v;
    }
    sea(x, y) { return this.shore(x, y) > 0; }
    hiFactor(x, y) {
      const u = x / this.W, v = y / this.H;
      switch (this.hs) {
        case 'north': return clamp(1.15 - v * 1.7, 0, 1);
        case 'northeast': return clamp((u + (1 - v)) * 0.95 - 0.6, 0, 1);
        case 'northwest': return clamp(((1 - u) + (1 - v)) * 0.95 - 0.6, 0, 1);
        case 'east': return clamp(u * 1.7 - 0.5, 0, 1);
        case 'center': return clamp(1 - hyp(u - 0.55, (v - 0.36) * 1.5) * 2.1, 0, 1);
        default: return 0.25;
      }
    }
    height(x, y) {
      const n = this.n;
      const base = n.fbm(x * 0.085 + 3.1, y * 0.085 + 1.7, 4);
      const r = 1 - Math.abs(2 * n.fbm(x * 0.055 + 11.3, y * 0.055 + 5.9, 4) - 1);
      const ridge = r * r * r;
      const hf = this.hiFactor(x, y);
      let h = 0.08 + 0.3 * base + 0.9 * ridge * hf * this.hk + 0.06 * ridge;
      const sh = this.shore(x, y);
      if (sh > -3) h *= 0.25 + 0.75 * clamp(-sh / 3, 0, 1);
      return clamp(h, 0, 1);
    }
  }

  // ---------------------------------------------------------------- paths (roads)
  function buildPath(ctrl, step = 0.2) {
    const P = ctrl, pts = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      const n = Math.max(2, Math.ceil(hyp(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        pts.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    pts.push(P[P.length - 1].slice());
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hyp(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, len: cum[cum.length - 1] };
  }
  function pathAt(path, s) {
    s = clamp(s, 0, path.len);
    let lo = 0, hi = path.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path.cum[m] < s) lo = m; else hi = m; }
    const seg = path.cum[hi] - path.cum[lo] || 1e-6, t = (s - path.cum[lo]) / seg;
    const a = path.pts[lo], b = path.pts[hi];
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), Math.atan2(b[1] - a[1], b[0] - a[0])];
  }
  function nearestS(path, x, y) {
    let best = 1e9, bs = 0;
    for (let i = 0; i < path.pts.length; i++) { const d = hyp(path.pts[i][0] - x, path.pts[i][1] - y); if (d < best) { best = d; bs = path.cum[i]; } }
    return bs;
  }

  // ---------------------------------------------------------------- profile modifiers
  const MODEL_XP = [0, 10, 30, 60, 100, 150];
  const modelLevel = (xp) => { let l = 0; for (let i = 0; i < MODEL_XP.length; i++) if (xp >= MODEL_XP[i]) l = i; return l; };

  function computeMods(prof) {
    const base = KW.BASE_SKILLS || {};
    const maxOf = (id) => { const q = (KW.SKILLS || []).find((k) => k.id === id); return q ? q.max : 3; };
    const sk = (id) => Math.min(maxOf(id), ((prof && prof.skills && prof.skills[id]) || 0) + (base[id] || 0));
    const flags = (prof && prof.flags) || {};
    return {
      sensRange: 1 + 0.1 * sk('wide'),
      idRate: 1 + 0.2 * sk('fusion'),
      qGain: 1 + 0.15 * sk('fusion'),
      coast: 45 + 30 * sk('stare'),
      esmRange: 1 + 0.5 * sk('sweep'), esmTight: sk('sweep') ? 0.5 : 1,
      predict: !!sk('predict'), skyeye: !!sk('skyeye'),
      supplyRate: (1 + 0.15 * sk('logistics')) * (flags.airstrip ? 1.15 : 1),
      supplyStart: 40 * sk('reserve'),
      meshR: 1 + 0.15 * sk('hardened'), ewResist: clamp(1 - 0.35 * sk('hardened'), 0.3, 1),
      fullAuto: !!sk('autonomy'),
      reload: 1 / (1 + 0.2 * sk('rapid')),
      dmg: 1 + 0.1 * sk('hardkill'),
      pk: 0.06 * sk('precision') + (sk('predict') ? 0.05 : 0),
      swarm: !!sk('swarm'),
      rearm: 1 / (1 + 0.3 * sk('reusable')), rrBonus: sk('reusable') >= 2 ? 1 : 0,
      overmatch: !!sk('overmatch'), arsenal: !!sk('arsenal'),
    };
  }

  const DEFENSIVE = new Set(['anvil', 'roadrunner', 'aam', 'ci']);
  const WVAL = { anvil: 1, ci: 1, rkt: 1, boltm: 1, roadrunner: 2.5, a600m: 3, b100: 4, a700m: 5, aam: 6, b500: 8 };
  const LAUNCHERS = new Set(['nest', 'rrpad', 'tubes', 'bcl']);
  const AIRKIND = new Set(['air']);
  const SCOUTS = new Set(['altius', 'ghost', 'omen', 'bolt', 'thunder']);
  const SEEKER = new Set(['b100', 'b500', 'a600m', 'a700m', 'boltm']);
  const ORBIT_R = { ghost: 0.7, altius: 2, omen: 3, thunder: 1.2, bolt: 0.5, fury: 3.5 };
  const SHORT = { menace: 'MENACE', sentry: 'SENTRY', nest: 'NEST', rrpad: 'RR PAD', tubes: 'ALTIUS-L', bcl: 'BCL', pulsar: 'PULSAR', ghost: 'GHOST', team: 'PATCH', altius: 'ALTIUS', bolt: 'BOLT', omen: 'OMEN', thunder: 'THUNDER', fury: 'FURY', truck: 'RELIEF' };

  // ---------------------------------------------------------------- the simulation
  class Sim {
    constructor(def, prof, opt = {}) {
      this.def = def; this.prof = prof || {}; this.opt = opt;
      this.W = 40; this.H = 26;
      this.seed = (opt.seed != null ? opt.seed : def.map.seed * 7919 + 13) >>> 0;
      this.rand = mulberry(this.seed);
      this.terrain = new Terrain(def.map, this.W, this.H);
      this.roads = (def.map.roads || []).map((r) => buildPath(r));
      this.t = 0; this.ents = []; this.shots = []; this.fx = []; this.events = []; this.nid = 1;
      this.trkSeq = 2000 + Math.floor(this.rand() * 5000);
      this.mods = computeMods(this.prof);
      // pace level: es hostile speed, er hostile deployment, fd our deployment, ms our munition speed
      const PL = KW.PACE || [];
      this.pace = PL[Math.max(0, Math.min(PL.length - 1, (opt.pace || 1) - 1))] || { lv: 1, es: 1, er: 1, fd: 1, ms: 1 };
      this.paceLv = this.pace.lv || 1;
      const d = opt.difficulty || 'standard';
      this.diffHp = d === 'recruit' ? 0.8 : d === 'veteran' ? 1.2 : 1;
      this.diffN = d === 'recruit' ? 0.8 : d === 'veteran' ? 1.25 : 1;
      const sup = def.supply || { start: 60, rate: 0.1 };
      const smul = KW.SUPPLY_MUL || 1;
      this.supply = Math.round(sup.start * smul) + this.mods.supplyStart;
      this.supplyRate = sup.rate * smul * this.mods.supplyRate * (1 + (this.mkBonus('menace').supplyRate || 0)) * this.pace.fd;
      this.autonomy = opt.autonomy || 'manual';
      this.roe = 'tight';
      this.stats = { kills: 0, killValue: 0, killsType: {}, ids: 0, harm: 0, lost: [], launches: 0, prodXP: {}, intercepts: 0, built: 0, damageTaken: 0 };
      this.objectives = def.objectives.map((o) => ({ ...o, state: 'active', prog: '' }));
      this.queue = []; this.wi = 0;
      this.waves = (def.waves || []).map((w) => ({ ...w, t: Math.max(10, Math.round(w.t / this.pace.er)) })).sort((a, b) => a.t - b.t);
      this.hiddenT = def.hidden ? def.hidden.t / this.pace.er : 0;
      this.pads = (def.pads || []).map((p, i) => ({ id: 'pad' + (i + 1), x: p[0], y: p[1], unit: null }));
      this.counters = {};
      this.furyLeft = 0; this.furyCd = 0; this.furyCost = Math.round(60 * (this.mods.overmatch ? 0.75 : 1));
      this.rocketCd = 0;
      this.trucksArrived = 0; this.trucksTotal = 0;
      this.outcome = null; this.timers = { sense: 0, auto: 0.5, obj: 1, mesh: 0 };
      this.nsched = [];
      this.tagSpawn = {}; this.tagDead = {}; this.tagGone = {};
      this.hiddenDone = !def.hidden;
      this.setup(opt.loadout || []);
      this.meshStep();
    }

    // ---------------- profile lookups
    mkTier(pid) { return (this.prof.mk && this.prof.mk[pid]) || 1; }
    mkBonus(pid) { const p = KW.PRODUCT[pid]; const t = this.mkTier(pid); if (!p || t <= 1 || !p.mk) return {}; return p.mk[t - 2] || {}; }
    owned(pid) { return !!(this.prof.owned && this.prof.owned[pid]); }
    modelLv(pid) { return modelLevel((this.prof.model && this.prof.model[pid]) || 0); }
    unlocked(pid) { return !!(this.prof.unlocked && this.prof.unlocked[pid]); }

    ev(cat, who, text, extra) {
      const e = { t: this.t, cat, who, text, ...(extra || {}) };
      this.events.push(e);
      if (this.events.length > 400) this.events.splice(0, 100);
      return e;
    }

    // ---------------- templates with upgrades applied
    unitTemplate(type) {
      const base = KW.UT[type];
      const T = JSON.parse(JSON.stringify(base));
      const pid = base.product;
      const mk = pid ? this.mkBonus(pid) : {};
      if (mk.hp) T.hp += mk.hp;
      if (mk.mesh && T.mesh) T.mesh += mk.mesh;
      if (mk.stock != null && T.stock != null) T.stock += mk.stock;
      if (mk.regen && T.regen) T.regen *= 1 - mk.regen;
      if (mk.speed && T.speed) T.speed *= 1 + mk.speed;
      if (mk.station && T.station) T.station += mk.station;
      if (mk.jam && T.jam) T.jam += mk.jam;
      if (mk.energy && T.energy) T.energy += mk.energy;
      if (mk.esm && T.esm) T.esm += mk.esm;
      if (T.sens) {
        if (mk.air) T.sens.air = T.sens.air.map((r) => (r ? r + mk.air : r));
        if (mk.gnd) T.sens.gnd += mk.gnd;
        if (mk.id && T.sens.id) T.sens.id += mk.id;
        const lv = pid ? this.modelLv(pid) : 0;
        if (T.sens.idRate) T.sens.idRate *= 1 + 0.025 * lv;
        if ((type === 'sentry' || type === 'ghost') && this.owned('wisp')) {
          const wb = this.mkBonus('wisp');
          T.sens.ir = true;
          T.sens.idRate *= 1.2 + (wb.idRate || 0);
          T.sens.air[0] += 1.5 + (wb.air || 0);
          T.sens.id += 0.5;
        }
      }
      if (T.ammo) {
        for (const k of ['aam', 'rkt', 'b100', 'ci']) if (mk[k] && T.ammo[k] != null) T.ammo[k] += mk[k];
      }
      if (type === 'team') { const bb = this.mkBonus('bolt'); if (bb.stock) T.stock += bb.stock; }
      if (type === 'nest' && this.mods.swarm) T.stock += 2;
      if (type === 'rrpad') T.stock += this.mods.rrBonus;
      if (this.mods.arsenal && (LAUNCHERS.has(type) || type === 'team')) T.stock += 1;
      if (T.regen) T.regen *= this.mods.reload;
      return T;
    }

    wstat(key, u) {
      const W = KW.WT[key];
      const pid = u ? u.prod : null;
      let speed = W.speed, range = W.range, dmg = W.dmg * this.mods.dmg;
      let pk = this.mods.pk;
      if (W.srm && this.owned('srm')) {
        speed *= 1.12;
        const sb = this.mkBonus('srm');
        if (sb.range) range *= 1 + sb.range;
        if (sb.pk) pk += sb.pk;
      }
      const prodOf = { boltm: 'bolt', a600m: 'altius', a700m: 'altius', b100: 'barracuda', b500: 'fury', anvil: 'anvil', roadrunner: 'roadrunner', aam: 'fury', rkt: 'thunder', ci: 'thunder' }[key] || pid;
      const mk = prodOf ? this.mkBonus(prodOf) : {};
      if (mk.pk) pk += mk.pk;
      if (mk.dmg) dmg *= 1 + mk.dmg;
      if (key === 'boltm' && mk.range) range += mk.range;
      if (key === 'roadrunner' && mk.speed) speed *= 1 + mk.speed;
      if (prodOf) pk += 0.025 * this.modelLv(prodOf);
      speed *= this.pace.ms;
      return { speed, range, dmg, pk, W };
    }

    costOf(key) {
      if (key === 'sentry') return 25;
      if (key === 'altius') return 25;
      if (key === 'thunder') return 40;
      if (key === 'rockets') return 30;
      if (key === 'a600m') return 25;
      if (key === 'a700m') return 40;
      if (key === 'b100') { let c = 40; if (this.mods.arsenal) c *= 0.7; const mk = this.mkBonus('barracuda'); if (mk.cost) c *= 1 - mk.cost; return Math.round(c); }
      if (key === 'fury') return this.furyCost;
      return 0;
    }

    nameFor(type) {
      const n = (this.counters[type] = (this.counters[type] || 0) + 1);
      if (type === 'team') return n === 1 ? 'PATCH' : 'PATCH-' + n;
      if (type === 'fury') return 'FURY ' + (10 + n);
      if (type === 'menace') return 'MENACE';
      return (SHORT[type] || type.toUpperCase()) + '-' + n;
    }

    // ---------------- entities
    mkEnt(side, type, T) {
      const e = { id: this.nid++, side, type, T, x: 0, y: 0, vx: 0, vy: 0, hdg: -Math.PI / 2, band: T.band || 0, hp: T.hp, maxHp: T.hp, cls: T.cls,
        alive: true, born: this.t, mv: { mode: 'idle' }, hist: [], histT: 0, trk: null };
      this.ents.push(e);
      return e;
    }
    byId(id) { if (id == null) return null; for (const e of this.ents) if (e.id === id) return e; return null; }
    shotById(id) { for (const s of this.shots) if (s.id === id) return s; return null; }

    addUnit(type, x, y, o = {}) {
      const T = this.unitTemplate(type);
      if (o.hp) T.hp = o.hp;
      const e = this.mkEnt('f', type, T);
      e.x = x; e.y = y;
      e.name = o.name || this.nameFor(type);
      e.prod = KW.UT[type].product || null;
      if (T.stock != null) { e.stock = T.stock; e.maxStock = T.stock; e.regenT = 0; }
      if (T.ammo) { e.ammo = { ...T.ammo }; e.maxAmmo = { ...T.ammo }; }
      if (T.energy) { e.energy = T.energy; e.maxEnergy = T.energy; e.jamOn = false; e.cool = 0; }
      e.vmax = (T.speed || 0) / 3600 * this.pace.fd;
      e.home = [x, y]; e.spotT = 0; e.inMesh = true; e.building = o.building || 0;
      if (type === 'team') e.boltCd = 0;
      if (type === 'omen') e.resupCd = 0;
      if (type === 'altius') e.ewOn = false;
      if (type === 'bolt') e.life = T.life;
      if (o.site) { e.siteId = o.site; e.name = o.name; }
      return e;
    }

    setup(loadout) {
      const def = this.def;
      this.menace = this.addUnit('menace', def.menace[0], def.menace[1]);
      this.sites = [];
      for (const s of def.sites || []) {
        const e = this.addUnit('site', s.x, s.y, { site: s.id, name: s.name, hp: s.hp });
        e.hp = e.maxHp = s.hp;
        this.sites.push(e);
      }
      for (const p of def.pre || []) {
        const u = this.addUnit(p.type, p.at[0], p.at[1]);
        u.pre = true;
      }
      const spots = KW.SPOTS(def.menace[0], def.menace[1]);
      for (const pid of loadout) {
        const P = KW.PRODUCT[pid];
        if (!P || !P.unit) continue;
        if (P.unit === 'fury') { this.furyLeft = 99; continue; }
        const at = spots[P.unit] || [def.menace[0] + 1, def.menace[1]];
        let [x, y] = at;
        if (this.terrain.sea(x, y)) { x = def.menace[0] + (this.rand() - 0.5) * 2; y = def.menace[1] - 1; }
        this.addUnit(P.unit, x, y);
      }
      // expected counts for destroy objectives
      for (const o of this.objectives) {
        if (o.kind !== 'destroy') continue;
        let n = 0;
        for (const f of def.fixed || []) if (o.tags.includes(f.tag)) n++;
        if (def.hidden && o.tags.includes(def.hidden.tag)) n += def.hidden.n;
        for (const w of def.waves || []) for (const u of w.units) if (o.tags.includes(u.tag)) n += u.n;
        o.expect = n;
      }
      for (const f of def.fixed || []) {
        const e = this.spawnHostile(f.type, f.at[0], f.at[1], { tag: f.tag, fixed: true, fireAt: f.fireAt });
        if (f.trigger) { e.dormant = true; e.trigger = f.trigger; }
        if (f.spawn) { e.spawn = f.spawn; e.spawnT = f.spawn.delay || f.spawn.every; }
      }
      if (def.convoy) this.trucksTotal = def.convoy.n;
      for (const n of def.neutrals || []) {
        if (n.type === 'airliner' || n.type === 'civcar') this.nsched.push({ ...n, next: n.every * 0.25, flip: false });
        else if (n.type === 'medevac') this.spawnNeutral({ ...n });
        else if (n.type === 'boat') for (let i = 0; i < (n.n || 2); i++) this.spawnNeutral({ ...n });
      }
    }

    // ---------------- spawning
    edgePoint(from) {
      const r = this.rand, W = this.W, H = this.H;
      if (Array.isArray(from)) return [from[0] + (r() - 0.5) * 1.2, from[1] + (r() - 0.5) * 1.2];
      if (typeof from === 'string' && from.startsWith('road:')) {
        const [, i, which] = from.split(':');
        const p = this.roads[+i];
        const [x, y] = pathAt(p, which === 'end' ? p.len : 0);
        return [x, y];
      }
      const I = KW.SPAWN_INSET || 0;
      switch (from) {
        case 'N': return [8 + r() * 24, -0.5 + I];
        case 'NE': return r() < 0.5 ? [28 + r() * 12 - I * 0.5, -0.5 + I] : [W + 0.5 - I, I + r() * 8];
        case 'NW': return r() < 0.5 ? [r() * 12 + I * 0.5, -0.5 + I] : [-0.5 + I, I + r() * 8];
        case 'E': return [W + 0.5 - I, 5 + r() * 14];
        case 'W': return [-0.5 + I, 5 + r() * 14];
        case 'S': return [8 + r() * 24, H + 0.5 - I];
        default: return [W * r(), -0.5 + I];
      }
    }

    spawnHostile(type, x, y, spec = {}) {
      const T = KW.ET[type];
      const e = this.mkEnt('h', type, T);
      e.x = x; e.y = y;
      e.hp = e.maxHp = Math.round(T.hp * this.diffHp);
      e.vmax = T.speed / 3600 * this.pace.es;
      e.goal = spec.to || null; e.tag = spec.tag || null; e.fromWave = !!spec.wave; e.fixed = !!spec.fixed;
      if (e.tag) this.tagSpawn[e.tag] = (this.tagSpawn[e.tag] || 0) + 1;
      e.fireAt = spec.fireAt || null;
      e.cd = (T.cd || 10) * (0.4 + this.rand() * 0.6);
      if (type === 'scythe') e.load = { spears: 2, eaam: 2 };
      if (type === 'spire') e.mag = T.mag;
      if (type === 'mother') { e.swarmT = 40; e.lanceT = 120; e.escorted = false; }
      if (T.gnss) { const a = this.rand() * TAU; e.errX = Math.cos(a); e.errY = Math.sin(a); e.navErr = 0; }
      const g = e.goal;
      if (g && typeof g === 'object' && g.road != null) {
        e.path = this.roads[g.road];
        const sNow = nearestS(e.path, x, y);
        e.s = sNow; const sStop = g.stopAt ? nearestS(e.path, g.stopAt[0], g.stopAt[1]) : (sNow > e.path.len / 2 ? 0 : e.path.len);
        e.dir = sStop >= sNow ? 1 : -1; e.sStop = sStop;
        const [px, py] = pathAt(e.path, e.s); e.x = px; e.y = py;
      }
      if (type === 'lance') {
        const tg = this.goalPoint(e);
        if (tg) {
          const mx = (x + tg[0]) / 2, my = (y + tg[1]) / 2, off = (this.rand() - 0.5) * 9;
          const a = Math.atan2(tg[1] - y, tg[0] - x) + Math.PI / 2;
          e.wp = [clamp(mx + Math.cos(a) * off, 1, this.W - 1), clamp(my + Math.sin(a) * off, 1, this.H - 1)];
        }
      }
      const tg = this.goalPoint(e);
      if (tg) e.hdg = Math.atan2(tg[1] - y, tg[0] - x);
      if (T.emitter) e.emitting = type !== 'static';
      return e;
    }

    spawnNeutral(spec) {
      const T = KW.NT[spec.type];
      const e = this.mkEnt('n', spec.type, T);
      e.vmax = T.speed / 3600;
      if (spec.type === 'airliner') {
        const c = this.def.map.corridor || [[-1, 6], [41, 7]];
        spec.flip = !spec.flip;
        const a = spec.flip ? c[0] : c[1], b = spec.flip ? c[1] : c[0];
        const off = spec.flip ? 0 : 1.6;
        e.x = a[0]; e.y = a[1] + off; e.dest = [b[0], b[1] + off];
      } else if (spec.type === 'civcar') {
        const p = this.roads[spec.road || 0];
        spec.flip = !spec.flip;
        e.path = p; e.dir = spec.flip ? 1 : -1; e.s = spec.flip ? 0 : p.len;
        const [x, y] = pathAt(p, e.s); e.x = x; e.y = y;
      } else if (spec.type === 'medevac') {
        e.loop = spec.loop; e.li = 1; e.x = spec.loop[0][0]; e.y = spec.loop[0][1];
      } else if (spec.type === 'boat') {
        const pt = this.randomSea(); e.x = pt[0]; e.y = pt[1]; e.dest = this.randomSea();
      }
      return e;
    }

    randomSea() {
      for (let i = 0; i < 200; i++) {
        const x = 1 + this.rand() * (this.W - 2), y = 1 + this.rand() * (this.H - 2);
        if (this.terrain.shore(x, y) > 1) return [x, y];
      }
      return [this.W - 1, this.H - 1];
    }

    processQueue() {
      while (this.wi < this.waves.length && this.waves[this.wi].t <= this.t) {
        const w = this.waves[this.wi++];
        for (const u of w.units) {
          const n = Math.max(1, Math.round(u.n * (u.n >= 3 ? this.diffN : 1)));
          for (let i = 0; i < n; i++) this.queue.push({ t: this.t + i * (u.stagger || 0) / this.pace.er, spec: { ...u, wave: true } });
        }
      }
      for (let i = this.queue.length - 1; i >= 0; i--) {
        const q = this.queue[i];
        if (q.t > this.t) continue;
        this.queue.splice(i, 1);
        const sp = q.spec;
        const from = q.at || this.edgePoint(sp.from);
        this.spawnHostile(sp.type, from[0], from[1], sp);
      }
      for (const n of this.nsched) {
        if (this.t >= n.next) { this.spawnNeutral(n); n.next += n.every * (0.8 + this.rand() * 0.4); }
      }
      if (!this.hiddenDone && this.t >= this.hiddenT) {
        this.hiddenDone = true;
        const h = this.def.hidden;
        const spots = h.spots.slice();
        for (let i = 0; i < h.n && spots.length; i++) {
          const k = Math.floor(this.rand() * spots.length);
          const [x, y] = spots.splice(k, 1)[0];
          this.spawnHostile(h.type, x, y, { tag: h.tag, fixed: true });
          if (h.escort) this.spawnHostile(h.escort, x + (this.rand() - 0.5) * 1.2, y + (this.rand() - 0.5) * 1.2, { fixed: true });
        }
      }
      const c = this.def.convoy;
      // the convoy keeps its place in the raid schedule: it leaves and drives on the same compressed clock as the raids
      if (c && !this.convoyOut && this.t >= c.t / this.pace.er) {
        this.convoyOut = true;
        const p = this.roads[c.road];
        for (let i = 0; i < c.n; i++) {
          const s = c.start - i * c.gap;
          const [x, y] = pathAt(p, s);
          const tr = this.addUnit('truck', x, y, { name: 'RELIEF-' + (i + 1) });
          tr.path = p; tr.s = s; tr.vmax = c.speed / 3600 * this.pace.er; tr.isTruck = true;
        }
      }
    }

    // ---------------- main step
    step(dt) {
      if (this.outcome) return;
      this.t += dt;
      this.supply = Math.min(999, this.supply + this.supplyRate * dt);
      if (this.furyCd > 0) this.furyCd -= dt * this.pace.fd;
      if (this.rocketCd > 0) this.rocketCd -= dt * this.pace.fd;
      this.processQueue();
      if ((this.timers.mesh -= dt) <= 0) { this.timers.mesh = 1; this.meshStep(); }
      if ((this.timers.sense -= dt) <= 0) { this.timers.sense = 0.5; this.senseStep(0.5); }
      for (let i = 0; i < this.ents.length; i++) {
        const e = this.ents[i];
        if (!e.alive) continue;
        if (e.side === 'f') this.unitStep(e, dt);
        else if (e.side === 'h') this.aiStep(e, dt);
        else this.neutralStep(e, dt);
        if (e.side !== 'f' && (e.histT -= dt) <= 0) { e.histT = 4; e.hist.push([e.x, e.y]); if (e.hist.length > 7) e.hist.shift(); }
      }
      for (let i = 0; i < this.shots.length; i++) { const s = this.shots[i]; if (!s.dead) this.shotStep(s, dt); }
      if ((this.timers.auto -= dt) <= 0) { this.timers.auto = 1; this.autoStep(); }
      if ((this.timers.obj -= dt) <= 0) { this.timers.obj = 1; this.objStep(); }
      if (this.shots.length > 60 || ((this.t * 4) | 0) % 20 === 0) this.shots = this.shots.filter((s) => !s.dead);
      if (((this.t * 4) | 0) % 40 === 0) this.ents = this.ents.filter((e) => e.alive || this.t - (e.diedAt || 0) < 12 || (e.side === 'f' && e.T.kind === 'site'));
      if (this.fx.length) this.fx = this.fx.filter((f) => this.t - f.t0 < f.dur);
    }

    fxAdd(kind, x, y, o = {}) { const f = { kind, x, y, t0: this.t, dur: o.dur || 8, r: o.r || 0.3, side: o.side || 'f', text: o.text || '', band: o.band || 0 }; this.fx.push(f); return f; }

    // ---------------- movement helpers
    moveToward(e, tx, ty, spd, dt) {
      const dx = tx - e.x, dy = ty - e.y, d = hyp(dx, dy);
      if (d < 1e-6) { e.vx = 0; e.vy = 0; return true; }
      const stp = spd * dt;
      e.hdg += clamp(angDiff(e.hdg, Math.atan2(dy, dx)), -4 * dt, 4 * dt);
      if (stp >= d) { e.vx = dx / dt; e.vy = dy / dt; e.x = tx; e.y = ty; return true; }
      e.vx = (dx / d) * spd; e.vy = (dy / d) * spd; e.x += e.vx * dt; e.y += e.vy * dt;
      return false;
    }
    orbit(e, cx, cy, r, spd, dt) {
      const dx = e.x - cx, dy = e.y - cy, d = hyp(dx, dy) || 1e-6;
      if (d > r * 1.35) return this.moveToward(e, cx + (dx / d) * r, cy + (dy / d) * r, spd, dt);
      const dir = e.cw ? -1 : 1;
      const a = Math.atan2(dy, dx) + dir * Math.min(1.2, (spd * dt) / r) ;
      const rr = lerp(d, r, 0.2);
      this.moveToward(e, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, spd, dt);
      return false;
    }
    roadStep(e, spd, dt) {
      const dirToStop = Math.sign(e.sStop - e.s);
      if (dirToStop === 0 || Math.abs(e.sStop - e.s) < 0.05) { e.vx = 0; e.vy = 0; return true; }
      e.s += dirToStop * spd * dt;
      if ((dirToStop > 0 && e.s > e.sStop) || (dirToStop < 0 && e.s < e.sStop)) e.s = e.sStop;
      const [x, y, h] = pathAt(e.path, e.s);
      e.vx = (x - e.x) / dt; e.vy = (y - e.y) / dt; e.x = x; e.y = y; e.hdg = dirToStop > 0 ? h : h + Math.PI;
      return false;
    }

    // ---------------- mesh and sensors
    jamAt(x, y) {
      for (const u of this.ents) {
        if (!u.alive || u.side !== 'f') continue;
        if (u.type === 'pulsar' && u.jamOn && hyp(u.x - x, u.y - y) <= u.T.jam) return 1;
        if (u.type === 'altius' && u.ewOn && hyp(u.x - x, u.y - y) <= u.T.ew) return 1;
      }
      return 0;
    }
    ewAt(x, y) {
      for (const h of this.ents) {
        if (!h.alive || h.side !== 'h' || !h.T.jamMesh || !h.jamming) continue;
        if (hyp(h.x - x, h.y - y) <= h.T.jamMesh) {
          let k = this.mods.ewResist;
          for (const p of this.ents) if (p.alive && p.type === 'pulsar' && p.jamOn && hyp(p.x - x, p.y - y) <= 5) { k *= 0.5; break; }
          return k;
        }
      }
      return 0;
    }

    meshStep() {
      const nodes = [];
      for (const u of this.ents) {
        if (!u.alive || u.side !== 'f') continue;
        u.connected = false;
        if (u.T.mesh && !u.building) {
          const ew = this.ewAt(u.x, u.y);
          u.meshR = u.T.mesh * this.mods.meshR * (1 - 0.5 * ew);
          nodes.push(u);
        }
      }
      const m = this.menace;
      if (m && m.alive) {
        m.connected = true;
        const q = [m];
        while (q.length) {
          const a = q.pop();
          for (const b of nodes) if (!b.connected && dist(a, b) <= Math.max(a.meshR, b.meshR)) { b.connected = true; q.push(b); }
        }
      }
      for (const u of this.ents) {
        if (!u.alive || u.side !== 'f') continue;
        const was = u.inMesh;
        if (u.T.kind === 'site' || u.isTruck || u.type === 'fury') { u.inMesh = true; continue; }
        let ok = u.connected;
        if (!ok) for (const n of nodes) if (n.connected && dist(n, u) <= n.meshR) { ok = true; break; }
        u.inMesh = ok;
        if (was && !ok && this.t > 2) this.ev('warn', u.name, 'Link lost. Holding last task.');
        else if (!was && ok && this.t > 2) this.ev('info', u.name, 'Back on the mesh.');
      }
    }

    senseStep(dt) {
      const sensors = [], pulsars = [];
      const night = !!this.def.night;
      for (const u of this.ents) {
        if (!u.alive || u.side !== 'f') continue;
        if (u.type === 'pulsar') pulsars.push(u);
        if (!u.T.sens || u.building || u.rearm) continue;
        u.ewMul = 1 - 0.3 * this.ewAt(u.x, u.y);
        if (u.type === 'altius' && u.ewOn) u.ewMul *= 0.7;
        const sp = hyp(u.vx, u.vy);
        u.moving = u.vmax > 0 && sp > u.vmax * 0.4;
        if (!u.local) u.local = new Set(); else u.local.clear();
        sensors.push(u);
      }
      for (const e of this.ents) {
        if (!e.alive || e.side === 'f') continue;
        let det = 0, idg = 0, esm = false;
        for (const s of sensors) {
          const S = s.T.sens;
          const r0 = e.band === 0 ? S.gnd : S.air[e.band - 1];
          if (!r0) continue;
          let r = r0 * this.mods.sensRange * s.ewMul;
          if (night && !S.ir) r *= 0.75;
          const dx = e.x - s.x, dy = e.y - s.y, d2 = dx * dx + dy * dy;
          if (d2 > r * r) continue;
          s.local.add(e.id);
          if (!s.inMesh) continue;
          det++;
          if (S.id) {
            let ir = S.id * (this.mods.skyeye && s.T.kind === 'air' ? 1.25 : 1);
            if (night && !S.ir) ir *= 0.6;
            const d = Math.sqrt(d2);
            if (d <= ir) {
              let rate = S.idRate * (1 - 0.5 * d / ir);
              if (s.moving && !this.mods.skyeye) rate *= 0.6;
              idg += rate;
            }
          }
        }
        if (e.T.emitter && e.emitting) {
          for (const p of pulsars) if (dist(p, e) <= p.T.esm * this.mods.esmRange) { esm = true; break; }
        }
        this.trackUpdate(e, det, idg, esm, dt);
      }
    }

    trackUpdate(e, det, idg, esm, dt) {
      let k = e.trk;
      if (k && k.pooUntil > this.t && !det) esm = true;
      if (!k) {
        if (!det && !esm) return;
        k = e.trk = { det: false, q: 0, id: 0, known: false, aff: 'u', ls: -1, ex: e.x, ey: e.y, evx: 0, evy: 0, unc: 0, no: 0, esm: false, ox: 0, oy: 0, n: 0 };
      }
      k.n = det;
      if (det > 0) {
        if (!k.det) {
          if (!k.no) k.no = this.trkSeq++;
          this.ev(k.known ? (k.aff === 'h' ? 'warn' : 'info') : 'info', 'LATTICE', k.known ? `Track ${k.no} reacquired: ${e.T.name}.` : `New track ${k.no}: ${e.band === 0 ? 'ground' : 'air'}, ${this.bandWord(e.band)}, ${Math.round(e.vmax * 3600)} km/h.`, { kind: 'track', id: e.id });
        }
        k.det = true; k.esm = false; k.ls = this.t;
        k.ex = e.x; k.ey = e.y; k.evx = e.vx; k.evy = e.vy; k.unc = 0;
        k.q = Math.min(1, k.q + (0.32 + 0.12 * (det - 1)) * this.mods.qGain * dt);
        k.dwell = (k.dwell || 0) + dt;
        if (!k.known && e.T.coop) {
          k.known = true; k.aff = 'n'; k.id = 1; this.stats.ids++;
          this.ev('good', 'LATTICE', `Track ${k.no} broadcasting ADS-B: ${e.T.label.toLowerCase()}. Identified NEUTRAL.`, { kind: 'id', id: e.id });
        } else if (!k.known && e.band >= 2 && e.T.speed >= 600 && k.dwell >= 6) {
          k.known = true; k.aff = e.side; k.id = 1; this.stats.ids++;
          this.ev('bad', 'LATTICE', `Track ${k.no}: no IFF reply, ${Math.round(e.vmax * 3600)} km/h at ${this.bandWord(e.band)} altitude, no flight plan. Classified HOSTILE.`, { kind: 'id', id: e.id });
        } else if (!k.known && e.band === 1 && e.T.speed >= 500 && k.dwell >= 1) {
          k.known = true; k.aff = e.side; k.id = 1; this.stats.ids++;
          this.ev('bad', 'LATTICE', `Track ${k.no} classified HOSTILE by flight profile: ${Math.round(e.vmax * 3600)} km/h at low altitude. Cruise missile.`, { kind: 'id', id: e.id });
        }
      } else if (esm) {
        if (!k.det) {
          if (!k.no) k.no = this.trkSeq++;
          this.ev('warn', 'PULSAR', `Emitter heard: ${e.T.name}, fix within ${(1.4 * this.mods.esmTight).toFixed(1)} km. Track ${k.no}.`, { kind: 'track', id: e.id });
        }
        if (!k.ox && !k.oy) {
          const a = this.rand() * TAU, m = (0.5 + this.rand() * 0.9) * this.mods.esmTight;
          k.ox = Math.cos(a) * m; k.oy = Math.sin(a) * m;
        }
        k.det = true; k.esm = true; k.ls = this.t;
        k.ex = e.x + k.ox; k.ey = e.y + k.oy; k.evx = 0; k.evy = 0; k.unc = hyp(k.ox, k.oy) + 0.25;
        k.q = Math.min(0.35, Math.max(k.q, 0.2));
        if (!k.known) { k.known = true; k.aff = 'h'; this.stats.ids++; this.ev('warn', 'LATTICE', e.T.emitter ? `Track ${k.no} classified hostile by its emissions: ${e.T.name}.` : `Track ${k.no} classified hostile: launches traced to it.`, { kind: 'id', id: e.id }); }
      } else if (k.det) {
        const age = this.t - k.ls;
        // fixed sites don't move: once located, Lattice keeps the last fix
        if (!e.vmax && k.known && k.aff === 'h') { k.q = Math.max(0.2, k.q - 0.01 * dt); }
        else if (age > this.mods.coast) {
          k.det = false; k.q = 0;
          if (k.known && k.aff === 'h') this.ev('info', 'LATTICE', `Track ${k.no} dropped.`);
        } else {
          k.ex += k.evx * dt; k.ey += k.evy * dt;
          k.unc += hyp(k.evx, k.evy) * dt * 0.35 + 0.01 * dt;
          k.q = Math.max(0, k.q - 0.03 * dt);
        }
      }
      if (idg > 0 && !k.known) {
        k.id = Math.min(1, k.id + idg * this.mods.idRate * dt * 0.22);
        if (k.id >= 1) {
          k.known = true; k.aff = e.side;
          this.stats.ids++;
          this.ev(e.side === 'h' ? 'warn' : 'good', 'LATTICE', e.side === 'h' ? `Track ${k.no} identified HOSTILE: ${e.T.name}, ${e.T.label.toLowerCase()}.` : `Track ${k.no} identified NEUTRAL: ${e.T.label.toLowerCase()}. Hold fire.`, { kind: 'id', id: e.id });
        }
      }
    }
    bandWord(b) { return ['surface', 'low', 'medium', 'high'][b] || 'low'; }

    // ---------------- friendly units
    unitStep(e, dt) {
      const T = e.T, df = dt * this.pace.fd;
      if (e.building) {
        e.building -= df;
        if (e.building <= 0) { e.building = 0; this.ev('good', e.name, 'Tower raised. Radar and camera online.'); }
        return;
      }
      if (e.spotT > 0) e.spotT -= dt;
      if (e.stock != null && T.regen && e.stock < e.maxStock) {
        e.regenT += df;
        if (e.regenT >= T.regen) { e.regenT = 0; e.stock++; }
      }
      if (e.maxEnergy) {
        if (e.jamOn) {
          e.energy -= dt;
          if (e.energy <= 0) { e.energy = 0; e.jamOn = false; e.cool = 30; this.ev('warn', e.name, 'Jammer overheated. Cooling down.'); }
        } else if (e.cool > 0) e.cool -= df;
        else e.energy = Math.min(e.maxEnergy, e.energy + df * 0.5);
      }
      if (e.type === 'team' && e.boltCd > 0) e.boltCd -= df;
      if (e.type === 'omen' && e.resupCd > 0) e.resupCd -= df;
      if (e.rearm) {
        e.rearm -= df;
        if (e.rearm <= 0) {
          e.rearm = 0;
          if (e.maxAmmo) e.ammo = { ...e.maxAmmo };
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.6);
          this.ev('good', e.name, 'Rearmed and repaired.');
          e.mv = { mode: 'orbit', cx: e.home[0], cy: e.home[1], r: ORBIT_R[e.type] || 1 };
        }
        return;
      }
      if (e.isTruck) return this.truckStep(e, dt);
      if (this.autonomy !== 'manual' && SCOUTS.has(e.type)) this.standoff(e);
      const spd = e.vmax;
      const m = e.mv;
      switch (m.mode) {
        case 'goto': {
          const air = T.kind === 'air';
          if (this.moveToward(e, m.tx, m.ty, spd, dt)) {
            if (air) e.mv = { mode: 'orbit', cx: m.tx, cy: m.ty, r: m.r || ORBIT_R[e.type] || 1 };
            else { e.mv = { mode: 'idle' }; e.vx = 0; e.vy = 0; }
          }
          break;
        }
        case 'orbit': this.orbit(e, m.cx, m.cy, m.r, spd * 0.7, dt); break;
        case 'intercept': {
          const t = this.byId(m.target);
          if (!t || !t.alive) { e.mv = e.cap ? { mode: 'orbit', cx: e.cap[0], cy: e.cap[1], r: e.capR } : { mode: 'orbit', cx: e.x, cy: e.y, r: 3 }; break; }
          const d = dist(e, t);
          if (d > 2) this.moveToward(e, t.x, t.y, spd, dt); else this.orbit(e, t.x, t.y, 2, spd * 0.7, dt);
          break;
        }
        case 'follow': {
          const t = this.byId(m.target);
          if (!t || !t.alive) { e.mv = { mode: 'orbit', cx: e.x, cy: e.y, r: ORBIT_R[e.type] || 1 }; break; }
          this.orbit(e, t.x, t.y, m.r || 1.2, spd * 0.8, dt);
          break;
        }
        case 'rtb': {
          const h = this.menace && this.menace.alive ? [this.menace.x + 0.4, this.menace.y + 0.4] : e.home;
          if (this.moveToward(e, h[0], h[1], spd, dt)) {
            e.vx = 0; e.vy = 0;
            if (e.type === 'fury') { e.alive = false; e.gone = true; break; }
            e.rearm = 60 * this.mods.rearm;
            e.home = [h[0], h[1]];
            this.ev('info', e.name, 'On the pad. Rearming.');
          }
          break;
        }
        case 'exit': {
          if (this.moveToward(e, m.tx, m.ty, spd, dt)) {
            e.alive = false; e.gone = true;
            if (e.type === 'fury') this.ev('info', e.name, 'Off station, returning to base.');
          }
          break;
        }
        case 'resupply': {
          const t = this.byId(m.target);
          if (!t || !t.alive) { e.mv = { mode: 'orbit', cx: e.x, cy: e.y, r: 2 }; break; }
          if (dist(e, t) > 0.8) this.moveToward(e, t.x, t.y, spd, dt);
          else {
            m.hold = (m.hold || 0) + dt;
            this.orbit(e, t.x, t.y, 0.5, spd * 0.4, dt);
            if (m.hold >= 15) {
              if (t.stock != null) t.stock = Math.min(t.maxStock, t.stock + 2);
              if (t.maxAmmo) for (const k in t.maxAmmo) t.ammo[k] = Math.min(t.maxAmmo[k], t.ammo[k] + Math.ceil(t.maxAmmo[k] / 2));
              if (t.maxEnergy) t.energy = t.maxEnergy;
              e.resupCd = 240;
              this.ev('good', e.name, `Resupplied ${t.name}.`);
              e.mv = { mode: 'orbit', cx: e.x, cy: e.y, r: 3 };
            }
          }
          break;
        }
        default:
          if (T.kind === 'air') e.mv = { mode: 'orbit', cx: e.x, cy: e.y, r: ORBIT_R[e.type] || 0.6 };
          else { e.vx = 0; e.vy = 0; }
      }
      if (e.type === 'fury') this.furyStep(e, dt);
      if (e.type === 'bolt') {
        e.life -= dt;
        if (e.life <= 0) { e.alive = false; e.gone = true; this.ev('info', e.name, 'Battery spent. Bolt down.'); }
      }
      if (e.x < -3 || e.x > this.W + 3 || e.y < -3 || e.y > this.H + 3) {
        if (e.mv.mode !== 'exit' && e.mv.mode !== 'rtb') e.mv = { mode: 'goto', tx: clamp(e.x, 1, this.W - 1), ty: clamp(e.y, 1, this.H - 1) };
      }
    }

    // keep a scout's task point outside the reach of identified MANPADS and SAMs
    standoff(e) {
      const m = e.mv;
      let px, py;
      if (m.mode === 'goto') { px = m.tx; py = m.ty; } else if (m.mode === 'orbit') { px = m.cx; py = m.cy; } else return;
      const pad = (m.r || ORBIT_R[e.type] || 1) + 0.3;
      let moved = false;
      for (const h of this.ents) {
        if (!h.alive || h.side !== 'h' || !h.trk || !h.trk.det || !h.trk.known || h.trk.aff !== 'h') continue;
        const wk = h.T.weapon;
        if (wk !== 'sam' && wk !== 'manpads') continue;
        const R = KW.WT[wk].range + pad;
        const dx = px - h.trk.ex, dy = py - h.trk.ey, d = hyp(dx, dy);
        if (d >= R) continue;
        const ux = d > 1e-3 ? dx / d : (e.x - h.trk.ex) / (dist(e, h) || 1), uy = d > 1e-3 ? dy / d : (e.y - h.trk.ey) / (dist(e, h) || 1);
        px = h.trk.ex + ux * R; py = h.trk.ey + uy * R; moved = true;
      }
      if (!moved) return;
      px = clamp(px, 0.5, this.W - 0.5); py = clamp(py, 0.5, this.H - 0.5);
      if (m.mode === 'goto') { m.tx = px; m.ty = py; } else { m.cx = px; m.cy = py; }
      if (!e.standMsg || this.t - e.standMsg > 60) { e.standMsg = this.t; this.ev('info', e.name, 'Holding outside a known air-defense ring.'); }
    }

    truckStep(e, dt) {
      // drivers stop short of direct-fire range and wait for the road to be cleared
      const blocked = this.ents.some((h) => h.alive && h.side === 'h' && h.band === 0 && !h.dormant && h.T.ai !== 'artillery' && h.T.ai !== 'sam' && dist(h, e) < 4);
      e.halted = blocked;
      if (blocked) { e.vx = 0; e.vy = 0; return; }
      const lead = this.ents.find((t) => t.alive && t.isTruck && t.s > e.s && t.s - e.s < 0.4);
      if (lead && lead.halted) { e.vx = 0; e.vy = 0; return; }
      e.s += e.vmax * dt;
      if (e.s >= e.path.len - 0.4) {
        e.alive = false; e.arrived = true; this.trucksArrived++;
        this.ev('good', e.name, 'Arrived in Haven.');
        return;
      }
      const [x, y, h] = pathAt(e.path, e.s);
      e.vx = (x - e.x) / dt; e.vy = (y - e.y) / dt; e.x = x; e.y = y; e.hdg = h;
    }

    furyStep(e, dt) {
      if (e.mv.mode === 'orbit' || e.mv.mode === 'intercept') {
        e.station -= dt;
        const out = (e.ammo.aam || 0) + (e.ammo.b500 || 0) <= 0;
        if (e.station <= 0 || out) {
          e.mv = { mode: 'exit', tx: -1.5, ty: this.H * 0.85 };
          this.ev('info', e.name, out ? 'Winchester. Heading home.' : 'Bingo fuel. Heading home.');
          if (!this.ents.some((f) => f.alive && f.type === 'fury' && f !== e && f.mv.mode === 'orbit')) this.furyCd = 120;
        }
      }
    }

    // ---------------- Vanta AI
    goalPoint(e) {
      const g = e.goal;
      if (!g) return null;
      if (typeof g === 'string') {
        if (g.startsWith('site:')) { const s = this.siteById(g.slice(5)); return s ? [s.x, s.y] : (this.menace ? [this.menace.x, this.menace.y] : null); }
        if (g === 'truck') { const t = this.nearestTruck(e); return t ? [t.x, t.y] : null; }
        const t = this.pickTarget(e);
        return t ? [t.x, t.y] : null;
      }
      if (g.loiter) return g.loiter;
      if (g.orbit) { const s = this.siteById(g.orbit.slice(5)); return s ? [s.x, s.y] : null; }
      if (g.road != null && e.path) return pathAt(e.path, e.sStop);
      return null;
    }
    siteById(id) { return this.sites.find((s) => s.siteId === id && s.alive) || null; }
    nearestTruck(e) { let b = null, bd = 1e9; for (const t of this.ents) if (t.alive && t.isTruck) { const d = dist(t, e); if (d < bd) { bd = d; b = t; } } return b; }
    pickTarget(e) {
      const g = e.goal;
      if (typeof g === 'string' && g.startsWith('site:')) { const s = this.siteById(g.slice(5)); if (s) return s; }
      if (g === 'truck') { const t = this.nearestTruck(e); if (t) return t; }
      let best = null, bd = 1e9;
      for (const u of this.ents) {
        if (!u.alive || u.side !== 'f' || u.band !== 0) continue;
        const d = dist(u, e) * (u.building ? 1.5 : 1);
        if (d < bd && d < 14) { bd = d; best = u; }
      }
      if (best) return best;
      for (const s of this.sites) if (s.alive) { const d = dist(s, e); if (d < bd) { bd = d; best = s; } }
      return best || (this.menace && this.menace.alive ? this.menace : null);
    }

    spot(e, r) {
      for (const u of this.ents) {
        if (!u.alive || u.side !== 'f' || u.band !== 0) continue;
        const rr = u.T.lowSig ? Math.min(r, 1.2) : r;
        if (dist(u, e) <= rr) u.spotT = 90;
      }
    }

    aiStep(e, dt) {
      const T = e.T;
      if (e.cd > 0) e.cd -= dt;
      switch (T.ai) {
        case 'kamikaze': return this.aiKamikaze(e, dt);
        case 'recon': return this.aiRecon(e, dt);
        case 'shrike': return this.aiShrike(e, dt);
        case 'heli': return this.aiHeli(e, dt);
        case 'jet': return this.aiJet(e, dt);
        case 'mother': return this.aiMother(e, dt);
        case 'ground': return this.aiGround(e, dt);
        case 'artillery': return this.aiArtillery(e, dt);
        case 'sam': return this.aiSam(e, dt);
        case 'ew': return this.aiEw(e, dt);
        case 'spawner': return this.aiSpawner(e, dt);
        default: break;
      }
    }

    jamEffect(e, dt) {
      if (!T_RF(e)) return false;
      const j = this.jamAt(e.x, e.y);
      e.jammedNow = !!j;
      if (!j) return false;
      e.wander = (e.wander || 0) + (this.rand() - 0.5) * 3 * dt;
      if (this.rand() < 0.012 * dt) { this.crash(e); return 'dead'; }
      return true;
    }
    crash(e) {
      e.alive = false; e.diedAt = this.t;
      if (e.tag) this.tagDead[e.tag] = (this.tagDead[e.tag] || 0) + 1;
      this.fxAdd('pop', e.x, e.y, { side: 'h', r: 0.15, band: e.band });
      this.stats.kills++; this.stats.killValue += Math.round((e.T.value || 0) * 0.7);
      this.stats.killsType[e.type] = (this.stats.killsType[e.type] || 0) + 1;
      this.stats.prodXP.pulsar = (this.stats.prodXP.pulsar || 0) + 1;
      if (e.trk && e.trk.det) this.ev('good', 'PULSAR', `Track ${e.trk.no} lost its link and went down.`);
    }

    aiKamikaze(e, dt) {
      const j = this.jamEffect(e, dt);
      if (j === 'dead') return;
      let tgt = this.byId(e.tgtId);
      if (!tgt || !tgt.alive) { tgt = this.pickTarget(e); e.tgtId = tgt ? tgt.id : null; }
      if (!tgt) { this.moveToward(e, this.W / 2, this.H + 5, e.vmax, dt); return; }
      let spd = e.vmax;
      let tx = tgt.x, ty = tgt.y;
      if (e.T.gnss && this.jamAt(e.x, e.y)) e.navErr = Math.min(1.3, e.navErr + 0.05 * dt);
      if (e.navErr) { tx += e.errX * e.navErr; ty += e.errY * e.navErr; }
      if (j) {
        spd *= 0.45;
        const a = e.hdg + e.wander * 0.2;
        tx = e.x + Math.cos(a) * 2; ty = e.y + Math.sin(a) * 2;
      } else if (e.wp) {
        if (hyp(e.wp[0] - e.x, e.wp[1] - e.y) < 0.6) e.wp = null; else { tx = e.wp[0]; ty = e.wp[1]; }
      }
      this.moveToward(e, tx, ty, spd, dt);
      if (j) return;
      const hitR = Math.max(0.12, spd * dt * 1.2);
      if (!e.navErr && hyp(tgt.x - e.x, tgt.y - e.y) <= hitR) this.impact(e, tgt.x, tgt.y);
      else if (e.navErr && hyp(tx - e.x, ty - e.y) <= hitR) this.impact(e, tx, ty);
    }

    impact(e, x, y) {
      e.alive = false; e.diedAt = this.t; e.exploded = true;
      if (e.tag) this.tagGone[e.tag] = (this.tagGone[e.tag] || 0) + 1;
      const T = e.T;
      this.fxAdd('boom', x, y, { side: 'h', r: T.ir * 2.2 + 0.1, dur: 10 });
      for (const u of this.ents) {
        if (!u.alive || u.band !== 0 || u.side === 'h') continue;
        const d = hyp(u.x - x, u.y - y);
        if (d <= T.ir) this.damage(u, T.impact * (1 - 0.5 * d / T.ir), e);
      }
    }

    aiRecon(e, dt) {
      const j = this.jamEffect(e, dt);
      if (j === 'dead') return;
      const g = e.goal || {};
      if (j) { const a = e.hdg + e.wander; this.moveToward(e, e.x + Math.cos(a), e.y + Math.sin(a), e.vmax * 0.45, dt); return; }
      if (g.follow) {
        const t = g.follow === 'truck' ? this.nearestTruck(e) : null;
        if (t) this.orbit(e, t.x, t.y, g.r || 3, e.vmax, dt);
        else if (g.loiter) this.orbit(e, g.loiter[0], g.loiter[1], g.r || 2, e.vmax, dt);
        else this.orbit(e, this.W * 0.6, this.H * 0.35, 3, e.vmax, dt);
      } else if (g.loiter) this.orbit(e, g.loiter[0], g.loiter[1], g.r || 2, e.vmax, dt);
      else this.moveToward(e, this.menace.x, this.menace.y, e.vmax, dt);
      if ((e.spotT2 = (e.spotT2 || 0) - dt) <= 0) { e.spotT2 = 2; this.spot(e, e.T.spot); }
    }

    aiShrike(e, dt) {
      const g = e.goal || {};
      let cx, cy;
      if (g.orbit) { const s = this.siteById(g.orbit.slice(5)) || this.menace; cx = s.x; cy = s.y; }
      else if (g.escort) {
        const m = this.ents.find((x) => x.alive && x.tag === g.escort);
        if (m) { cx = m.x; cy = m.y; } else { const s = this.sites[0] || this.menace; cx = s.x; cy = s.y; }
      } else { const s = this.sites[0] || this.menace; cx = s.x; cy = s.y; }
      this.orbit(e, cx, cy, (g.r || 9), e.vmax, dt);
      if ((e.spotT2 = (e.spotT2 || 0) - dt) <= 0) { e.spotT2 = 2; this.spot(e, e.T.spot); }
      if (e.cd <= 0) {
        let tgt = null, best = -1;
        for (const u of this.ents) {
          if (!u.alive || u.side !== 'f' || u.band !== 0) continue;
          const d = dist(u, e);
          if (d > 9) continue;
          const val = (u.spotT > 0 ? 2 : 0) + (u.T.kind === 'site' ? 1 : 0) + (LAUNCHERS.has(u.type) ? 1.5 : 0) - d * 0.05;
          if (val > best) { best = val; tgt = u; }
        }
        if (tgt && (tgt.spotT > 0 || tgt.T.kind === 'site')) { this.enemyFire(e, 'glide', tgt); e.cd = e.T.cd; }
        else e.cd = 5;
      }
    }

    aiHeli(e, dt) {
      if (e.hp < e.maxHp * 0.4 && !e.fleeing) { e.fleeing = true; if (e.trk && e.trk.det) this.ev('info', 'LATTICE', `Track ${e.trk.no} is breaking off.`); }
      if (e.fleeing) {
        if (this.moveToward(e, e.x < this.W / 2 ? -2 : this.W + 2, -2, e.vmax, dt) || e.y < -1.5) { e.alive = false; e.gone = true; }
        return;
      }
      let near = null, nd = 1e9;
      for (const u of this.ents) {
        if (!u.alive || u.side !== 'f' || u.band !== 0) continue;
        const d = dist(u, e);
        if (d < nd) { nd = d; near = u; }
      }
      if (near && nd < 4.5) {
        this.orbit(e, near.x, near.y, 3.6, e.vmax * 0.35, dt);
        if (e.cd <= 0) { this.enemyFire(e, 'trkt', near); e.cd = e.T.cd; }
      } else {
        const g = this.goalPoint(e) || [this.menace.x, this.menace.y];
        this.moveToward(e, g[0], g[1], e.vmax, dt);
      }
    }

    aiJet(e, dt) {
      if (e.leaving) {
        if (this.moveToward(e, e.exit[0], e.exit[1], e.vmax, dt)) { e.alive = false; e.gone = true; }
      } else {
        const g = this.goalPoint(e) || [this.menace.x, this.menace.y];
        const d = hyp(g[0] - e.x, g[1] - e.y);
        if (d <= 12 && e.load.spears > 0) {
          const tgt = (typeof e.goal === 'string' && e.goal.startsWith('site:')) ? (this.siteById(e.goal.slice(5)) || this.menace) : this.menace;
          for (let i = 0; i < e.load.spears; i++) {
            const s = this.spawnHostile('spear', e.x + (this.rand() - 0.5) * 0.4, e.y + (this.rand() - 0.5) * 0.4, { to: tgt && tgt.siteId ? 'site:' + tgt.siteId : 'nearest', wave: true });
            s.tgtId = tgt ? tgt.id : null;
          }
          e.load.spears = 0;
          e.leaving = true;
          e.exit = [e.x < this.W / 2 ? -2 : this.W + 2, e.y < this.H / 2 ? -2 : e.y];
          if (e.trk && e.trk.det) this.ev('bad', 'LATTICE', `Track ${e.trk.no} released cruise missiles.`);
        } else this.moveToward(e, g[0], g[1], e.vmax, dt);
      }
      if (e.cd <= 0 && e.load.eaam > 0) {
        let tgt = null, bd = 15;
        for (const u of this.ents) {
          if (!u.alive || u.side !== 'f' || u.band < 1) continue;
          const d = dist(u, e);
          if (d < bd) { bd = d; tgt = u; }
        }
        if (tgt) { this.enemyFire(e, 'eaam', tgt); e.load.eaam--; e.cd = e.T.cd; }
      }
    }

    aiMother(e, dt) {
      if ((e.pdCd = (e.pdCd || 0) - dt) <= 0) {
        for (const s of this.shots) {
          if (s.dead || s.side !== 'f' || s.tgt !== e.id || s.W.kind !== 'guided' || hyp(s.x - e.x, s.y - e.y) > 1.2) continue;
          e.pdCd = 2.5;
          if (this.rand() < e.T.pd) {
            s.dead = true; this.fxAdd('pop', s.x, s.y, { side: 'h', r: 0.12, band: 2 });
            if (!e.pdMsg || this.t - e.pdMsg > 30) { e.pdMsg = this.t; this.ev('warn', 'LATTICE', `Mothership point defense knocked down a ${s.W.name}. Salvo it.`); }
          }
          break;
        }
      }
      const g = this.goalPoint(e) || [this.menace.x, this.menace.y];
      if (hyp(g[0] - e.x, g[1] - e.y) > 6) this.moveToward(e, g[0], g[1], e.vmax, dt);
      else this.orbit(e, g[0], g[1], 6, e.vmax, dt);
      e.swarmT -= dt * this.pace.er; e.lanceT -= dt * this.pace.er;
      if (e.swarmT <= 0) {
        e.swarmT = 90;
        for (let i = 0; i < 6; i++) this.queue.push({ t: this.t + i * 3 / this.pace.er, at: [e.x, e.y], spec: { type: 'wasp', to: 'nearest', wave: true } });
        if (e.trk && e.trk.det) this.ev('bad', 'LATTICE', `Mothership launching a swarm. Six tracks.`);
      }
      if (e.lanceT <= 0) {
        e.lanceT = 180;
        for (let i = 0; i < 2; i++) this.queue.push({ t: this.t + i * 6 / this.pace.er, at: [e.x, e.y], spec: { type: 'lance', to: (this.sites[0] ? 'site:' + this.sites[0].siteId : 'nearest'), wave: true } });
      }
      if (!e.escorted && e.hp < e.maxHp * 0.5) {
        e.escorted = true;
        for (let i = 0; i < 2; i++) this.spawnHostile('shrike', e.x, e.y, { to: { escort: e.tag || 'mother', r: 2.5 }, wave: true });
        if (e.trk && e.trk.det) this.ev('bad', 'LATTICE', 'Mothership launching escorts.');
      }
    }

    aiGround(e, dt) {
      if (e.dormant) {
        for (const u of this.ents) if (u.alive && u.side === 'f' && u.band === 0 && dist(u, e) <= e.trigger) { e.dormant = false; break; }
        if (e.dormant) return;
        if (this.roads.length && !e.path) {
          e.path = this.roads[0]; e.s = nearestS(e.path, e.x, e.y); e.sStop = e.s; e.offroad = pathAt(e.path, e.s);
        }
      }
      if (e.offroad) {
        if (this.moveToward(e, e.offroad[0], e.offroad[1], e.vmax * 0.6, dt)) e.offroad = null;
      } else if (e.path) this.roadStep(e, e.vmax, dt);
      if ((e.spotT2 = (e.spotT2 || 0) - dt) <= 0) { e.spotT2 = 3; this.spot(e, e.T.spot || 2.5); }
      if (e.cd > 0) return;
      const W = KW.WT[e.T.weapon];
      if (!W) return;
      let tgt = null, bd = W.range;
      for (const u of this.ents) {
        if (!u.alive || u.side !== 'f') continue;
        if (!W.bands.includes(u.band)) continue;
        if (u.band === 1 && e.type === 'ram' && (u.cls !== 'heli' && u.cls !== 'uas')) continue;
        const d = dist(u, e);
        if (d <= bd) { bd = d; tgt = u; }
      }
      if (!tgt && e.type === 'jackal') {
        for (const s of this.shots) {
          if (s.dead || s.side !== 'f' || !(s.W.kind === 'loiter')) continue;
          if (hyp(s.x - e.x, s.y - e.y) <= W.range) { this.enemyFireAtShot(e, 'manpads', s); e.cd = e.T.cd; return; }
        }
      }
      if (!tgt) return;
      if (W.kind === 'hitscan') {
        const pk = W.pk[tgt.cls] || 0.3;
        const f = this.fxAdd('tracer', e.x, e.y, { side: 'h', dur: 2, r: 0, band: e.band }); f.x2 = tgt.x; f.y2 = tgt.y; f.band2 = tgt.band || 0;
        if (this.rand() < pk) this.damage(tgt, W.dmg, e);
        e.cd = e.T.cd;
      } else { this.enemyFire(e, e.T.weapon, tgt); e.cd = e.T.cd; }
    }

    aiArtillery(e, dt) {
      if (e.path && !e.dormant) { if (!this.roadStep(e, e.vmax, dt)) return; }
      if (e.cd > 0) return;
      let tgt = null, best = -1, blind = false;
      for (const u of this.ents) {
        if (!u.alive || u.side !== 'f' || u.band !== 0) continue;
        const d = dist(u, e);
        if (d > 32) continue;
        if (e.fireAt === 'truck' && !u.isTruck) continue;
        if (u.spotT <= 0) continue;
        const val = (u.type === 'menace' ? 4 : 0) + (LAUNCHERS.has(u.type) ? 3 : 0) + (u.type === 'pulsar' || u.type === 'team' ? 2.5 : 0) + (u.isTruck ? 3 : 0) + (u.T.kind === 'site' ? 1 : 0) + (u.T.kind === 'tower' ? 2 : 0);
        if (val > best) { best = val; tgt = u; }
      }
      if (!tgt && e.fireAt !== 'truck') { tgt = this.sites.find((s) => s.alive) || this.menace; blind = true; }
      if (!tgt) { e.cd = 20; return; }
      const sc = blind ? 1.5 : 0.45;
      const a = this.rand() * TAU, r = Math.sqrt(this.rand()) * sc;
      this.enemyFire(e, 'hrkt', tgt, { tx: tgt.x + Math.cos(a) * r, ty: tgt.y + Math.sin(a) * r });
      this.counterBattery(e, tgt);
      e.cd = e.T.cd * (0.85 + this.rand() * 0.3);
      if (e.trk && e.trk.det) this.ev('bad', 'LATTICE', `Track ${e.trk.no} fired a rocket salvo. Impact in ${KW.WT.hrkt.flight} s.`);
      else this.ev('bad', 'LATTICE', `Rocket salvo inbound from the ${this.compass(e.x - tgt.x, e.y - tgt.y)}. Impact in ${KW.WT.hrkt.flight} s.`);
    }
    // a launch seen by friendly air-search radar gives away a point of origin: a fix, not an identification by camera
    backtrack(e, what) {
      const radar = this.ents.some((u) => u.alive && u.side === 'f' && u.inMesh && u.T.sens && u.T.sens.air && u.T.sens.air[0] >= 5 && !u.building && dist(u, e) <= u.T.sens.air[1] * this.mods.sensRange);
      if (!radar) return;
      let k = e.trk;
      if (!k) k = e.trk = { det: false, q: 0, id: 0, known: false, aff: 'u', ls: -1, ex: e.x, ey: e.y, evx: 0, evy: 0, unc: 0, no: 0, esm: false, ox: 0, oy: 0, n: 0 };
      if (!k.no) k.no = this.trkSeq++;
      const a = this.rand() * TAU, m = 0.5 + this.rand() * 0.7;
      k.ox = Math.cos(a) * m; k.oy = Math.sin(a) * m;
      k.pooUntil = this.t + 240;
      if (!k.det || k.esm) {
        k.det = true; k.esm = true; k.ls = this.t; k.ex = e.x + k.ox; k.ey = e.y + k.oy; k.unc = m + 0.25; k.q = 0.25;
        if (!k.known) { k.known = true; k.aff = 'h'; }
        this.ev('warn', 'LATTICE', `${what}: track ${k.no}, fix within ${(m + 0.25).toFixed(1)} km.`, { kind: 'track', id: e.id });
      }
    }
    // counter-battery: friendly radar near the impact area tracks the salvo back to an estimated launch point
    counterBattery(e, tgt) {
      const radar = this.ents.some((u) => u.alive && u.side === 'f' && u.inMesh && u.T.sens && u.T.sens.air && u.T.sens.air[0] >= 5 && !u.building && dist(u, tgt) <= u.T.sens.air[1] * this.mods.sensRange);
      if (!radar) return;
      let k = e.trk;
      if (!k) k = e.trk = { det: false, q: 0, id: 0, known: false, aff: 'u', ls: -1, ex: e.x, ey: e.y, evx: 0, evy: 0, unc: 0, no: 0, esm: false, ox: 0, oy: 0, n: 0 };
      if (!k.no) k.no = this.trkSeq++;
      const a = this.rand() * TAU, m = 0.6 + this.rand() * 0.8;
      k.ox = Math.cos(a) * m; k.oy = Math.sin(a) * m;
      k.pooUntil = this.t + 150;
      if (!k.det || k.esm) {
        k.det = true; k.esm = true; k.ls = this.t; k.ex = e.x + k.ox; k.ey = e.y + k.oy; k.unc = m + 0.25; k.q = 0.25;
        if (!k.known) { k.known = true; k.aff = 'h'; }
        this.ev('warn', 'LATTICE', `Counter-battery: salvo tracked back to a launch point, track ${k.no}, fix within ${(m + 0.25).toFixed(1)} km.`, { kind: 'track', id: e.id });
      }
    }
    compass(dx, dy) { const a = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; return ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'][Math.round(a / 45) % 8]; }

    aiSam(e, dt) {
      if ((e.reload = (e.reload || 0) - dt) <= 0 && e.mag < e.T.mag) { e.reload = 25; e.mag++; }
      if (e.cd > 0 || e.mag <= 0) return;
      const W = KW.WT.sam;
      let tgt = null, best = -1, shot = null;
      for (const u of this.ents) {
        if (!u.alive || u.side !== 'f' || u.band < 1) continue;
        const d = dist(u, e);
        if (d > W.range) continue;
        if (this.shots.some((s) => !s.dead && s.side === 'h' && s.tgt === u.id)) continue;
        const val = ({ fury: 5, thunder: 4, omen: 3, altius: 2, ghost: 2, bolt: 1 }[u.type] || 1) - d * 0.05;
        if (val > best) { best = val; tgt = u; }
      }
      if (!tgt) {
        for (const s of this.shots) {
          if (s.dead || s.side !== 'f' || !(s.W.low || s.W.kind === 'loiter')) continue;
          // terrain masking: sea-skimming and terrain-hugging missiles are only seen late
          if (hyp(s.x - e.x, s.y - e.y) > (s.W.low ? 4.5 : 8)) continue;
          if (this.shots.some((q) => !q.dead && q.side === 'h' && q.tgtShot === s.id)) continue;
          shot = s; break;
        }
      }
      if (tgt) { this.enemyFire(e, 'sam', tgt); e.mag--; e.cd = e.T.cd; }
      else if (shot) { this.enemyFireAtShot(e, 'sam', shot); e.mag--; e.cd = e.T.cd; }
    }

    aiEw(e, dt) {
      if (e.path) {
        const arrived = this.roadStep(e, e.vmax, dt);
        if (arrived && !e.jamming) { e.jamming = true; e.emitting = true; this.ev('bad', 'JUNO', 'Jamming on the mesh band. Something just lit up out there.'); }
      } else if (!e.jamming) { e.jamming = true; e.emitting = true; }
    }

    aiSpawner(e, dt) {
      if (!e.spawn) return;
      e.spawnT -= dt * this.pace.er;
      if (e.spawnT <= 0) {
        e.spawnT = e.spawn.every;
        this.backtrack(e, 'Launch tracked back to its origin');
        for (const u of e.spawn.units) {
          const n = Math.max(1, Math.round(u.n * (u.n >= 3 ? this.diffN : 1)));
          for (let i = 0; i < n; i++) this.queue.push({ t: this.t + i * (u.stagger || 0) / this.pace.er, at: [e.x, e.y], spec: { ...u, wave: false } });
        }
      }
    }

    // ---------------- neutrals
    neutralStep(e, dt) {
      const T = e.T;
      if (T.ai === 'liner' || T.ai === 'boat') {
        if (this.moveToward(e, e.dest[0], e.dest[1], e.vmax, dt)) {
          if (T.ai === 'liner') { e.alive = false; e.gone = true; } else e.dest = this.randomSea();
        }
      } else if (T.ai === 'car') {
        e.s += e.dir * e.vmax * dt;
        if (e.s < 0 || e.s > e.path.len) { e.alive = false; e.gone = true; return; }
        const [x, y, h] = pathAt(e.path, e.s);
        e.vx = (x - e.x) / dt; e.vy = (y - e.y) / dt; e.x = x; e.y = y; e.hdg = e.dir > 0 ? h : h + Math.PI;
      } else if (T.ai === 'medevac') {
        const p = e.loop[e.li];
        if (this.moveToward(e, p[0], p[1], e.vmax, dt)) e.li = (e.li + 1) % e.loop.length;
      }
    }

    // ---------------- weapons
    enemyFire(e, wkey, tgt, o = {}) {
      const W = KW.WT[wkey];
      const s = { id: this.nid++, side: 'h', w: wkey, W, x: e.x, y: e.y, x0: e.x, y0: e.y, hdg: Math.atan2(tgt.y - e.y, tgt.x - e.x), spd: (W.speed || 1) / 3600,
        tgt: tgt.id, tx: o.tx != null ? o.tx : tgt.x, ty: o.ty != null ? o.ty : tgt.y, pk: W.pk ? (W.pk[tgt.cls] || 0.3) : 1, dmg: W.dmg, from: e.id, born: this.t, life: (W.range || 30) * 1.6, traveled: 0, trail: [] };
      this.shots.push(s);
      if (W.kind === 'guided' && tgt.side === 'f' && tgt.band >= 1 && (wkey === 'sam' || wkey === 'eaam' || wkey === 'manpads')) this.ev('bad', tgt.name, `Missile launch on ${tgt.name}.`);
      return s;
    }
    enemyFireAtShot(e, wkey, shot) {
      const W = KW.WT[wkey];
      const cls = shot.W.kind === 'loiter' ? 'uas' : 'cm';
      const s = { id: this.nid++, side: 'h', w: wkey, W, x: e.x, y: e.y, hdg: 0, spd: W.speed / 3600, tgtShot: shot.id, tx: shot.x, ty: shot.y, pk: W.pkShot != null ? W.pkShot : (W.pk[cls] || 0.2), dmg: W.dmg, from: e.id, born: this.t, life: W.range * 1.6, traveled: 0, trail: [] };
      this.shots.push(s);
      return s;
    }

    weaponsOf(u) {
      const out = [];
      if (!u.alive || u.building) return out;
      switch (u.type) {
        case 'nest': out.push({ key: 'anvil', n: u.stock }); break;
        case 'rrpad': out.push({ key: 'roadrunner', n: u.stock }); break;
        case 'bcl': out.push({ key: 'b100', n: u.stock, cost: this.costOf('b100') }); break;
        case 'team': out.push({ key: 'boltm', n: u.stock }); break;
        case 'tubes':
          out.push({ key: 'a600m', n: u.stock, cost: this.costOf('a600m') });
          break;
        case 'thunder': out.push({ key: 'rkt', n: u.ammo.rkt }, { key: 'b100', n: u.ammo.b100 }, { key: 'ci', n: u.ammo.ci }); break;
        case 'fury': out.push({ key: 'aam', n: u.ammo.aam || 0 }); if (u.ammo.b500) out.push({ key: 'b500', n: u.ammo.b500 }); break;
        default: break;
      }
      return out;
    }

    canEngage(e) {
      const k = e.trk;
      if (!k || !k.det) return false;
      if (k.known) return k.aff === 'h';
      return this.roe === 'free';
    }

    pkEst(u, wkey, e) {
      const ws = this.wstat(wkey, u);
      const W = ws.W;
      let p = W.pk[e.cls] || 0;
      if (!p) return 0;
      p += ws.pk;
      const k = e.trk;
      p *= 0.65 + 0.35 * (k ? k.q : 0);
      if (k && k.esm) p *= SEEKER.has(wkey) ? clamp(1 - Math.max(0, k.unc - 1.2) / 2.5, 0.5, 1) : clamp(1 - k.unc / 2.5, 0.35, 1);
      if (e.marked && this.t < e.marked) p += 0.12;
      return clamp(p, 0.02, 0.97);
    }

    neutralsNear(x, y, r) { return this.ents.some((n) => n.alive && n.side === 'n' && hyp(n.x - x, n.y - y) <= r); }

    options(e, o = {}) {
      const res = [];
      const k = e.trk;
      if (!e.alive || !k || !k.det) return res;
      const legal = this.canEngage(e);
      for (const u of this.ents) {
        if (!u.alive || u.side !== 'f') continue;
        for (const w of this.weaponsOf(u)) {
          const W = KW.WT[w.key];
          if (!W.bands.includes(e.band)) continue;
          if (!(W.pk[e.cls] > 0)) continue;
          if (o.defensive && !DEFENSIVE.has(w.key)) continue;
          const ws = this.wstat(w.key, u);
          const d = hyp(k.ex - u.x, k.ey - u.y);
          let ok = true, why = '';
          if (!legal) { ok = false; why = k.known ? 'Neutral: hold fire' : 'Identify first'; }
          else if (w.n <= 0) { ok = false; why = 'No rounds'; }
          else if (d > ws.range) { ok = false; why = 'Out of range'; }
          else if (!u.inMesh) { ok = false; why = 'Link lost'; }
          else if (w.cost && this.supply < w.cost) { ok = false; why = `Needs ${w.cost} supply`; }
          else if (u.mv.mode === 'exit' || u.rearm) { ok = false; why = 'Unavailable'; }
          const pk = this.pkEst(u, w.key, e);
          const tti = d / (ws.speed / 3600) + 2;
          const warn = W.kind === 'area' && this.neutralsNear(k.ex, k.ey, (W.area || 0.5) + 0.4) ? 'Civilian track inside the burst' : '';
          res.push({ u, w: w.key, name: W.name, pk, tti, d, ok, why, cost: w.cost || 0, warn });
        }
      }
      const score = (r) => r.pk / (1 + r.tti / 60) - r.cost / 400 - (WVAL[r.w] || 1) * 0.03;
      res.sort((a, b) => (b.ok - a.ok) || score(b) - score(a));
      return res;
    }

    committed(e) {
      let miss = 1;
      for (const s of this.shots) if (!s.dead && s.side === 'f' && s.tgt === e.id && s.mode !== 'rtb') miss *= 1 - (s.pk || 0);
      return 1 - miss;
    }

    fire(u, wkey, e) {
      const W = KW.WT[wkey];
      const ws = this.wstat(wkey, u);
      const k = e.trk;
      if (u.type === 'thunder' || u.type === 'fury') u.ammo[wkey]--;
      else if (u.stock != null) u.stock--;
      const cost = (this.weaponsOf(u).find((w) => w.key === wkey) || {}).cost || 0;
      if (cost) this.supply -= cost;
      const s = { id: this.nid++, side: 'f', w: wkey, W, x: u.x, y: u.y, hdg: Math.atan2(k.ey - u.y, k.ex - u.x), spd: ws.speed / 3600, dmg: ws.dmg,
        tgt: e.id, tx: k.ex, ty: k.ey, pk: this.pkEst(u, wkey, e), from: u.id, prod: this.prodOfWeapon(wkey, u), home: [u.x, u.y], mode: 'out', born: this.t,
        life: ws.range * 1.5 + 2, traveled: 0, trail: [] };
      if (W.kind === 'loiter') { s.loiterC = [k.ex, k.ey]; s.endT = this.t + W.life; s.mode = 'transit'; }
      if (W.kind === 'area') { const tti = hyp(k.ex - u.x, k.ey - u.y) / s.spd; s.tx = k.ex + k.evx * tti; s.ty = k.ey + k.evy * tti; }
      this.shots.push(s);
      this.stats.launches++;
      this.ev('info', u.name, `${W.name} away on track ${k.no}. Pk ${Math.round(s.pk * 100)}%.`, { kind: 'launch' });
      if (u.type === 'nest' && this.mods.swarm && u.stock > 0) {
        const swarm = this.ents.filter((h) => h.alive && h.side === 'h' && h.cls === 'fpv' && dist(h, e) < 1).length;
        if (swarm >= 3 && this.committed(e) < 0.9) { u.stock--; const s2 = { ...s, id: this.nid++, trail: [] }; this.shots.push(s2); }
      }
      return s;
    }
    prodOfWeapon(wkey, u) { return { anvil: 'anvil', roadrunner: 'roadrunner', aam: 'fury', b500: 'fury', b100: u.type === 'thunder' ? 'thunder' : 'barracuda', boltm: 'bolt', a600m: 'altius', a700m: 'altius', rkt: 'thunder', ci: 'thunder' }[wkey] || u.prod; }

    shotStep(s, dt) {
      const W = s.W;
      if (W.kind === 'area') {
        if (W.flight) {
          const u = (this.t - s.born) / W.flight;
          s.x = lerp(s.x0, s.tx, Math.min(1, u)); s.y = lerp(s.y0, s.ty, Math.min(1, u));
          if (u >= 1) { this.areaBurst(s); s.dead = true; }
          return;
        }
        if (this.moveShot(s, s.tx, s.ty, dt)) { this.areaBurst(s); s.dead = true; }
        return;
      }
      if (W.kind === 'loiter') return this.loiterStep(s, dt);
      let tgt = s.tgtShot ? this.shotById(s.tgtShot) : this.byId(s.tgt);
      if (tgt && (tgt.alive === false || tgt.dead)) tgt = null;
      if (s.mode === 'rtb') {
        if (this.moveShot(s, s.home[0], s.home[1], dt)) this.recover(s);
        return;
      }
      if (tgt) {
        let px = tgt.x, py = tgt.y;
        if (s.side === 'f' && tgt.trk) {
          const k = tgt.trk, seen = k.det && !k.esm, near = hyp(tgt.x - s.x, tgt.y - s.y) < 2;
          if (!seen && !near) { px = k.ex; py = k.ey; }
        }
        const d = hyp(px - s.x, py - s.y), tti = d / s.spd;
        px += (tgt.vx || 0) * tti * 0.8; py += (tgt.vy || 0) * tti * 0.8;
        s.tx = px; s.ty = py;
        const hitR = Math.max(0.08, s.spd * dt * 1.15);
        if (hyp(tgt.x - s.x, tgt.y - s.y) <= hitR) { this.resolveHit(s, tgt); return; }
      } else if (!s.lost) {
        s.lost = true;
        if (s.side === 'f' && W.reusable) { s.mode = 'rtb'; return; }
        if (s.side === 'f' && this.autonomy !== 'manual' && DEFENSIVE.has(s.w)) {
          const nt = this.retarget(s);
          if (nt) { s.tgt = nt.id; s.lost = false; s.pk = this.pkEstShot(s, nt); }
        }
      }
      const arrived = this.moveShot(s, s.tx, s.ty, dt);
      if ((arrived && !tgt) || s.traveled > s.life) {
        if (s.side === 'f' && W.reusable) { s.mode = 'rtb'; return; }
        s.dead = true;
        if (s.side === 'f') this.fxAdd('fizzle', s.x, s.y, { r: 0.1, dur: 4, band: 1 });
      }
    }

    pkEstShot(s, e) { const u = this.byId(s.from) || { prod: s.prod, type: '' }; return this.pkEst(u, s.w, e); }

    retarget(s) {
      const W = s.W;
      let best = null, bd = 3;
      for (const e of this.ents) {
        if (!e.alive || e.side !== 'h' || !W.bands.includes(e.band) || !(W.pk[e.cls] > 0)) continue;
        if (!this.canEngage(e)) continue;
        const d = hyp(e.x - s.x, e.y - s.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }

    moveShot(s, tx, ty, dt) {
      const dx = tx - s.x, dy = ty - s.y, d = hyp(dx, dy), stp = s.spd * dt;
      s.hdg = Math.atan2(dy, dx);
      if ((s.trailT = (s.trailT || 0) - dt) <= 0) { s.trailT = 1; s.trail.push([s.x, s.y]); if (s.trail.length > 6) s.trail.shift(); }
      if (d <= stp) { s.x = tx; s.y = ty; s.traveled += d; return true; }
      s.x += (dx / d) * stp; s.y += (dy / d) * stp; s.traveled += stp;
      return false;
    }

    resolveHit(s, tgt) {
      const hit = this.rand() < s.pk;
      if (s.tgtShot) {
        if (hit) { tgt.dead = true; this.fxAdd('pop', tgt.x, tgt.y, { side: 'f', r: 0.2, band: 1 }); this.ev('bad', 'LATTICE', `${tgt.W.name} shot down by enemy air defense.`); }
        s.dead = true;
        return;
      }
      if (hit) {
        let dmg = s.dmg;
        if (tgt.cls === 'heavy' && s.W.heavyMul) dmg *= s.W.heavyMul;
        this.fxAdd('boom', tgt.x, tgt.y, { side: s.side, r: s.side === 'f' ? 0.25 : 0.2, dur: 8, band: tgt.band || 0 });
        this.damage(tgt, dmg, s);
        s.dead = true;
        if (s.side === 'f') this.stats.intercepts++;
      } else {
        this.fxAdd('miss', tgt.x, tgt.y, { side: s.side, r: 0.2, dur: 6, band: tgt.band || 0 });
        if (s.side === 'f') {
          const k = tgt.trk;
          this.ev('warn', s.W.name.toUpperCase(), `Miss on track ${k ? k.no : '?'}.`);
          if (s.W.reusable) { s.mode = 'rtb'; s.tgt = null; return; }
        }
        s.dead = true;
      }
    }

    recover(s) {
      s.dead = true;
      const u = this.byId(s.from);
      if (u && u.alive && u.stock != null) {
        u.stock = Math.min(u.maxStock, u.stock + 1);
        this.ev('good', u.name, `${s.W.name} recovered. Ready again.`);
      }
    }

    loiterStep(s, dt) {
      if (this.t > s.endT) { s.dead = true; this.fxAdd('fizzle', s.x, s.y, { r: 0.1, band: 1 }); this.ev('info', 'ALTIUS', `${s.W.name} endurance spent with no target.`); return; }
      let tgt = this.byId(s.tgt);
      if (tgt && !tgt.alive) tgt = null;
      if (tgt && !this.canEngage(tgt)) tgt = null;
      if (!tgt) {
        let best = null, bs = -1;
        for (const e of this.ents) {
          if (!e.alive || e.side !== 'h' || e.band !== 0 || !(s.W.pk[e.cls] > 0) || !this.canEngage(e)) continue;
          const d = hyp(e.trk.ex - s.loiterC[0], e.trk.ey - s.loiterC[1]);
          if (d > 3.2) continue;
          const sc = (e.T.value || 10) / (1 + d);
          if (sc > bs) { bs = sc; best = e; }
        }
        if (best) { tgt = best; s.tgt = best.id; s.pk = this.pkEstShot(s, best); this.ev('info', s.W.name.toUpperCase(), `Diving on track ${best.trk.no}.`); }
      }
      if (tgt) {
        const tx = tgt.trk && tgt.trk.det && !tgt.trk.esm ? tgt.x : (hyp(tgt.x - s.x, tgt.y - s.y) < 2 ? tgt.x : tgt.trk.ex);
        const ty = tgt.trk && tgt.trk.det && !tgt.trk.esm ? tgt.y : (hyp(tgt.x - s.x, tgt.y - s.y) < 2 ? tgt.y : tgt.trk.ey);
        this.moveShot(s, tx, ty, dt * 1.4);
        if (hyp(tgt.x - s.x, tgt.y - s.y) <= Math.max(0.1, s.spd * dt * 1.6)) this.resolveHit(s, tgt);
      } else {
        const [cx, cy] = s.loiterC;
        const d = hyp(s.x - cx, s.y - cy);
        if (d > 1.4) this.moveShot(s, cx, cy, dt);
        else { const a = Math.atan2(s.y - cy, s.x - cx) + (s.spd * dt) / 1.2; this.moveShot(s, cx + Math.cos(a) * 1.2, cy + Math.sin(a) * 1.2, dt); }
      }
    }

    areaBurst(s) {
      const W = s.W;
      const x = s.tx, y = s.ty;
      const tgB = this.byId(s.tgt); this.fxAdd('burst', x, y, { side: s.side, r: W.area, dur: 9, band: tgB && tgB.band === 1 && W.bands.includes(1) ? 1 : 0 });
      for (const e of this.ents) {
        if (!e.alive) continue;
        if (s.side === 'f' && e.side === 'f') continue;
        if (s.side === 'h' && e.side === 'h') continue;
        if (!W.bands.includes(e.band)) continue;
        const d = hyp(e.x - x, e.y - y);
        if (d > W.area) continue;
        const pk = W.pk ? (W.pk[e.cls] != null ? W.pk[e.cls] : 0.5) : 0.85;
        if (this.rand() < pk) this.damage(e, s.dmg * (1 - 0.45 * d / W.area), s);
      }
    }

    damage(e, amt, src) {
      if (!e.alive) return;
      e.hp -= amt; e.hitT = this.t;
      if (e.side === 'f') {
        this.stats.damageTaken += amt;
        const st = src ? (src.type || src.w || '?') : '?';
        const key = (e.T.kind === 'site' || e.type === 'menace' || e.isTruck ? 'site:' : 'unit:') + st;
        this.stats.dmgBy = this.stats.dmgBy || {};
        this.stats.dmgBy[key] = Math.round((this.stats.dmgBy[key] || 0) + amt);
        if (e.hp > 0 && (!e.lastHitEv || this.t - e.lastHitEv > 20)) {
          e.lastHitEv = this.t;
          this.ev('bad', e.name, `${e.name} hit. ${Math.max(0, Math.round(100 * e.hp / e.maxHp))}% remaining.`, { kind: 'hit', id: e.id });
        }
      }
      if (e.hp <= 0) this.kill(e, src);
    }

    kill(e, src) {
      e.alive = false; e.diedAt = this.t; e.hp = 0;
      if (e.tag) this.tagDead[e.tag] = (this.tagDead[e.tag] || 0) + 1;
      this.fxAdd('boom', e.x, e.y, { side: e.side === 'f' ? 'h' : 'f', r: e.T.kind === 'site' || e.cls === 'boss' ? 0.9 : 0.4, dur: 12, band: e.band || 0 });
      const by = src ? src.side : null;
      if (e.side === 'h') {
        if (by === 'f') {
          this.stats.kills++; this.stats.killValue += e.T.value || 0;
          this.stats.killsType[e.type] = (this.stats.killsType[e.type] || 0) + 1;
          if (src.prod) this.stats.prodXP[src.prod] = (this.stats.prodXP[src.prod] || 0) + 1;
          this.ev('good', src.W ? src.W.name.toUpperCase() : 'LATTICE', `Splash. ${e.T.name}${e.trk && e.trk.no ? `, track ${e.trk.no}` : ''}, destroyed.`, { kind: 'kill', id: e.id });
        }
      } else if (e.side === 'n') {
        if (by === 'f') { this.stats.harm++; this.ev('bad', 'LATTICE', `Civilian ${e.T.label.toLowerCase()} destroyed by friendly fire.`, { kind: 'harm' }); }
      } else {
        if (e.type === 'fury') this.furyCd = 120;
        this.stats.lost.push(e.name);
        (this.stats.lostTypes = this.stats.lostTypes || []).push(e.type);
        this.ev('bad', e.name, e.T.kind === 'site' ? `${e.name} destroyed.` : `${e.name} lost.`, { kind: 'lost', id: e.id });
      }
    }

    // ---------------- autonomy
    autoStep() {
      this.taskedEngage();
      this.altiusStrike();
      this.furyIntercept();
      if (this.autonomy === 'manual') return;
      const full = this.autonomy === 'auto';
      for (const p of this.ents) {
        if (!p.alive || p.type !== 'pulsar' || !p.inMesh) continue;
        const near = this.ents.some((h) => h.alive && h.side === 'h' && h.T.rf && h.trk && h.trk.det && dist(h, p) <= p.T.jam + 0.5);
        if (near && !p.jamOn && p.energy > 15 && p.cool <= 0) { p.jamOn = true; this.ev('info', p.name, 'Drone links inside the bubble. Jamming.'); }
        else if (!near && p.jamOn) { p.idleJam = (p.idleJam || 0) + 1; if (p.idleJam > 8) { p.jamOn = false; p.idleJam = 0; } }
        else if (near) p.idleJam = 0;
      }
      const threats = [];
      for (const e of this.ents) {
        if (!e.alive || e.side !== 'h' || !e.trk || !e.trk.det || !e.trk.known || e.trk.aff !== 'h' || e.hold) continue;
        threats.push(e);
      }
      threats.sort((a, b) => this.threatScore(b) - this.threatScore(a));
      let shotsThisTick = 0;
      for (const e of threats) {
        if (shotsThisTick > 8) break;
        const big = e.hp > 120;
        const need = big ? 0.97 : 0.86;
        const air = e.band >= 1;
        if (air) {
          if (this.committed(e) >= need) continue;
          const opts = this.options(e, { defensive: true }).filter((o) => o.ok && o.w !== 'aam');
          if (!opts.length) continue;
          const o = opts[0];
          if (o.w === 'roadrunner' && (e.cls === 'fpv' || e.cls === 'jet')) continue;
          this.fire(o.u, o.w, e); shotsThisTick++;
          if (big && this.committed(e) < need && opts[1]) { this.fire(opts[1].u, opts[1].w, e); shotsThisTick++; }
        } else if (full) {
          if (this.committed(e) >= 0.8) continue;
          // slow loitering munitions stay out of known SAM cover; SAMs themselves go to Barracuda first
          const covered = this.samCover(e.trk.ex, e.trk.ey, 8, e);
          const opts = this.options(e).filter((o) => o.ok && !o.warn && !DEFENSIVE.has(o.w) && !(covered && KW.WT[o.w].kind === 'loiter'));
          if (e.T.ai === 'sam') opts.sort((a, b) => (b.w === 'b100' || b.w === 'b500') - (a.w === 'b100' || a.w === 'b500'));
          // light and medium vehicles get the cheap rounds when any are in reach; heavy munitions wait for armor and sites
          if ((e.cls === 'light' || e.cls === 'medium') && opts.some((o) => (WVAL[o.w] || 1) < 4)) for (let i = opts.length - 1; i >= 0; i--) if ((WVAL[opts[i].w] || 1) >= 4) opts.splice(i, 1);
          const cheap = opts.filter((o) => !o.cost || this.supply - o.cost > 50);
          if (!cheap.length) continue;
          const o = cheap[0];
          if (o.cost && e.T.value < 30 && e.T.weapon !== 'manpads') continue;
          this.fire(o.u, o.w, e); shotsThisTick++;
        }
      }
      // supervised: rockets and close-in fire against ground hostiles that are hitting protected things
      if (!full) {
        for (const u of this.ents) {
          if (!u.alive || u.type !== 'thunder' || !u.inMesh || u.rearm || u.ammo.rkt <= 0) continue;
          for (const e of threats) {
            if (e.band !== 0 || this.committed(e) > 0.5) continue;
            const threatening = this.ents.some((f) => f.alive && f.side === 'f' && (f.isTruck || f.T.kind === 'site') && dist(f, e) < 3.5);
            if (!threatening) continue;
            const o = this.options(e).find((q) => q.u === u && q.w === 'rkt' && q.ok && !q.warn);
            if (o) { this.fire(u, 'rkt', e); break; }
          }
        }
      }
      if (full) this.autoScout();
    }

    // Fury on patrol and Thunder on a strike task engage identified hostiles inside their area on their own
    taskedEngage() {
      for (const u of this.ents) {
        if (!u.alive || u.side !== 'f' || u.rearm) continue;
        let c = null, R = 0;
        if (u.type === 'fury' && u.mv.mode !== 'exit') { c = u.cap || (u.mv.mode === 'goto' ? [u.mv.tx, u.mv.ty] : [u.x, u.y]); R = 11; }
        else if (u.type === 'thunder' && u.strike) {
          const out = (u.ammo.rkt || 0) + (u.ammo.b100 || 0) + (u.ammo.ci || 0) <= 0;
          if (out || this.t > u.strike.until) { u.strike = null; u.mv = { mode: 'rtb' }; this.ev('info', u.name, out ? 'Out of rounds. Rearming.' : 'Strike done. Rearming.'); continue; }
          c = [u.strike.x, u.strike.y]; R = 6;
        } else continue;
        if ((u.engT = (u.engT || 0) - 1) > 0) continue;
        const fury = u.type === 'fury';
        let best = null, bo = null, bs = -1;
        for (const e of this.ents) {
          if (!e.alive || e.side !== 'h' || e.hold || !e.trk || !e.trk.det || !e.trk.known || e.trk.aff !== 'h') continue;
          // Fury: missiles for anything worth one within reach, Barracuda-500M for ground targets in its patrol area
          if (fury && e.band >= 1) { if ((e.T.value || 0) < 15) continue; }
          else if (hyp(e.trk.ex - c[0], e.trk.ey - c[1]) > R) continue;
          if (this.committed(e) >= (e.hp > 120 ? 0.95 : 0.85)) continue;
          const o = this.options(e).find((q) => q.u === u && q.ok && !q.warn);
          if (!o) continue;
          const sc = fury ? (e.T.value || 10) * o.pk / (1 + this.etaNear(e) / 90) : this.threatScore(e) * o.pk;
          if (sc > bs) { bs = sc; best = e; bo = o; }
        }
        if (best) { this.fire(u, bo.w, best); u.engT = u.type === 'fury' ? 2 : 1; }
      }
    }

    // a launched Altius scouts its area, then dives on the first identified ground hostile it finds
    altiusStrike() {
      const W = KW.WT.a600m;
      for (const a of this.ents) {
        if (!a.alive || a.type !== 'altius' || !a.strike || !a.inMesh) continue;
        let best = null, bs = -1;
        for (const e of this.ents) {
          if (!e.alive || e.side !== 'h' || e.band !== 0 || !(W.pk[e.cls] > 0) || !this.canEngage(e) || !e.trk.known) continue;
          const d = hyp(e.trk.ex - a.x, e.trk.ey - a.y);
          if (d > 3.2) continue;
          const sc = (e.T.value || 10) / (1 + d);
          if (sc > bs) { bs = sc; best = e; }
        }
        if (!best) continue;
        a.alive = false; a.gone = true; a.diedAt = this.t;
        const ws = this.wstat('a600m', a);
        this.shots.push({ id: this.nid++, side: 'f', w: 'a600m', W, x: a.x, y: a.y, hdg: a.hdg, spd: ws.speed / 3600, dmg: ws.dmg, tgt: best.id, tx: best.trk.ex, ty: best.trk.ey,
          pk: this.pkEst(a, 'a600m', best), from: a.id, prod: 'altius', home: [a.x, a.y], mode: 'transit', born: this.t, life: 9999, traveled: 0, trail: [], loiterC: [a.x, a.y], endT: this.t + 300 });
        this.ev('info', a.name, `Diving on track ${best.trk.no}.`, { kind: 'launch' });
      }
    }

    furyIntercept() {
      for (const f of this.ents) {
        if (!f.alive || f.type !== 'fury' || f.mv.mode === 'exit' || f.mv.mode === 'goto') continue;
        if (f.mv.mode === 'intercept') {
          const t = this.byId(f.mv.target);
          if (!t || !t.alive || !t.trk || !t.trk.det || t.trk.known) f.mv = { mode: 'orbit', cx: f.cap[0], cy: f.cap[1], r: f.capR };
          continue;
        }
        if (!f.cap) { f.cap = [f.mv.cx, f.mv.cy]; f.capR = f.mv.r; }
        let best = null, bd = 11;
        for (const e of this.ents) {
          if (!e.alive || e.side === 'f' || e.band < 1 || !e.trk || !e.trk.det || e.trk.known) continue;
          const d = hyp(e.trk.ex - f.cap[0], e.trk.ey - f.cap[1]);
          if (d < bd) { bd = d; best = e; }
        }
        if (best) f.mv = { mode: 'intercept', target: best.id };
      }
    }

    samCover(x, y, r, except) {
      for (const h of this.ents) {
        if (!h.alive || h === except || h.T.ai !== 'sam' || !h.trk || !h.trk.det || !h.trk.known) continue;
        if (hyp(h.trk.ex - x, h.trk.ey - y) <= r) return true;
      }
      return false;
    }

    etaNear(e) {
      let near = 1e9;
      for (const f of this.ents) if (f.alive && f.side === 'f' && f.band === 0) near = Math.min(near, dist(f, e));
      return near / Math.max(0.005, e.vmax || 0.005);
    }
    threatScore(e) {
      let near = 1e9;
      for (const f of this.ents) if (f.alive && f.side === 'f' && f.band === 0) near = Math.min(near, dist(f, e));
      const eta = near / Math.max(0.005, e.vmax || 0.005);
      return (e.T.impact || e.T.value || 10) / (20 + eta);
    }

    autoScout() {
      const scouts = this.ents.filter((u) => u.alive && u.inMesh && (u.type === 'ghost' || u.type === 'altius') && (u.mv.mode === 'orbit' || u.mv.mode === 'idle') && !u.manual && u.hp > u.maxHp * 0.4);
      if (!scouts.length) return;
      for (const e of this.ents) {
        if (!e.alive || e.side === 'f' || !e.trk || !e.trk.det || e.trk.known) continue;
        if (scouts.some((s) => s.scoutFor === e.id)) continue;
        const free = scouts.filter((s) => !s.scoutFor || !this.byId(s.scoutFor) || this.byId(s.scoutFor).trk.known);
        if (!free.length) return;
        free.sort((a, b) => dist(a, e) - dist(b, e));
        const s = free[0];
        if (dist(s, e) > 18) continue;
        s.scoutFor = e.id;
        s.mv = { mode: 'goto', tx: e.trk.ex, ty: e.trk.ey, r: ORBIT_R[s.type] };
      }
    }

    // ---------------- objectives
    objStep() {
      let fail = null;
      let primaryOpen = false, hasPrimary = false;
      for (const o of this.objectives) {
        switch (o.kind) {
          case 'protect': {
            const s = this.siteById(o.site);
            const any = this.sites.find((x) => x.siteId === o.site);
            if (!s) { o.state = 'failed'; fail = fail || `${any ? any.name : 'Site'} destroyed`; }
            else { o.state = 'holding'; o.prog = `${Math.round(100 * s.hp / s.maxHp)}%`; }
            break;
          }
          case 'clearWaves': {
            const spawned = this.wi >= this.waves.length && this.queue.filter((q) => q.spec.wave).length === 0;
            const alive = this.ents.some((e) => e.alive && e.side === 'h' && e.fromWave);
            o.prog = `${Math.min(this.wi, this.waves.length)}/${this.waves.length}`;
            o.state = spawned && !alive ? 'done' : 'active';
            break;
          }
          case 'destroy': {
            let dead = 0, spawned = 0, gone = 0;
            for (const tg of o.tags) { dead += this.tagDead[tg] || 0; spawned += this.tagSpawn[tg] || 0; gone += this.tagGone[tg] || 0; }
            const total = Math.max(spawned, o.expect || 0);
            o.prog = `${dead}/${total}`;
            o.state = total > 0 && dead >= total ? 'done' : 'active';
            if (this.def.deadline && this.t > this.def.deadline && o.state !== 'done') { o.state = 'failed'; fail = fail || 'Deadline passed'; }
            if (o.state !== 'done' && gone > 0) { o.state = 'failed'; fail = fail || 'A priority target got away'; }
            break;
          }
          case 'escort': {
            const alive = this.ents.filter((e) => e.alive && e.isTruck).length;
            o.prog = `${this.trucksArrived}/${o.n}`;
            if (this.trucksArrived >= o.n) o.state = 'done';
            else if (this.convoyOut && this.trucksArrived + alive < o.n) { o.state = 'failed'; fail = fail || 'Too many relief trucks lost'; }
            else o.state = 'active';
            break;
          }
          case 'escortAll': o.state = this.trucksArrived >= this.trucksTotal && this.trucksTotal ? 'done' : (this.convoyOut && this.ents.filter((e) => e.alive && e.isTruck).length + this.trucksArrived < this.trucksTotal ? 'failed' : 'active'); o.prog = `${this.trucksArrived}/${this.trucksTotal}`; break;
          case 'build': { const n = this.ents.filter((e) => e.type === 'sentry' && !e.pre && !e.building).length; o.prog = `${Math.min(n, o.n)}/${o.n}`; o.state = n >= o.n ? 'done' : 'active'; break; }
          case 'siteHp': { const s = this.sites.find((x) => x.siteId === o.site); const f = s && s.alive ? s.hp / s.maxHp : 0; o.prog = `${Math.round(f * 100)}%`; o.state = f >= o.frac ? 'holding' : 'failed'; break; }
          case 'noHarm': o.state = this.stats.harm ? 'failed' : 'holding'; o.prog = this.stats.harm ? `${this.stats.harm} harmed` : ''; break;
          default: break;
        }
        if (!o.bonus && o.kind !== 'protect') { hasPrimary = true; if (o.state !== 'done') primaryOpen = true; }
      }
      if (!this.menace || !this.menace.alive) fail = 'Command node lost';
      if (fail) return this.finish(false, fail);
      if (hasPrimary && !primaryOpen) this.finish(true, 'Objectives complete');
    }

    finish(win, reason) {
      if (this.outcome) return;
      for (const o of this.objectives) {
        if (o.kind === 'protect') o.state = win && this.siteById(o.site) ? 'done' : 'failed';
        if (o.state === 'holding') o.state = win ? 'done' : 'failed';
      }
      this.outcome = { win, reason, t: this.t };
      this.ev(win ? 'good' : 'bad', 'LATTICE', win ? 'All primary objectives complete.' : `Mission failed: ${reason}.`, { kind: 'end' });
    }

    // ---------------- commands
    cmdMove(u, x, y) {
      if (!u || !u.alive || !u.vmax) return 'This asset can\'t move.';
      if (!u.inMesh) return `${u.name} is off the mesh.`;
      if (u.rearm) return `${u.name} is rearming.`;
      x = clamp(x, 0.3, this.W - 0.3); y = clamp(y, 0.3, this.H - 0.3);
      if (u.T.kind !== 'air' && this.terrain.sea(x, y)) return 'Ground units can\'t drive into the sea.';
      u.manual = true; u.scoutFor = null;
      u.mv = { mode: 'goto', tx: x, ty: y, r: ORBIT_R[u.type] };
      if (u.type === 'fury') u.cap = [x, y];
      if (u.strike && u.strike.x != null) { u.strike.x = x; u.strike.y = y; }
      return null;
    }
    cmdRTB(u) {
      if (!u || !u.alive || u.T.kind !== 'air') return 'Only aircraft return to base.';
      if (u.type === 'fury') { u.mv = { mode: 'exit', tx: -1.5, ty: this.H * 0.85 }; return null; }
      if (u.type === 'altius' || u.type === 'bolt') return 'Launched effects don\'t land at the pad.';
      u.mv = { mode: 'rtb' }; u.manual = true;
      return null;
    }
    cmdPair(u, wkey, e) {
      const o = this.options(e).find((q) => q.u === u && q.w === wkey);
      if (!o) return 'That pairing isn\'t available.';
      if (!o.ok) return o.why;
      this.fire(u, wkey, e);
      return null;
    }
    cmdJam(u, on) {
      if (!u || u.type !== 'pulsar') return 'Not a jammer.';
      if (on && (u.cool > 0 || u.energy < 5)) return 'Jammer is cooling down.';
      u.jamOn = on; u.idleJam = 0;
      this.ev('info', u.name, on ? 'Jamming.' : 'Jammer off.');
      return null;
    }
    cmdEW(u, on) { if (!u || u.type !== 'altius') return 'Not an Altius-600.'; u.ewOn = on; this.ev('info', u.name, on ? 'EW payload on. Sensors degraded while jamming.' : 'EW payload off.'); return null; }
    padFree(pad) { const u = pad && pad.unit ? this.byId(pad.unit) : null; return !!pad && !(u && u.alive); }
    cmdBuild(pad) {
      if (!this.padFree(pad)) return 'Pad occupied.';
      const c = this.costOf('sentry');
      if (this.supply < c) return `Needs ${c} supply.`;
      const covered = this.ents.some((n) => n.alive && n.side === 'f' && n.connected && n.meshR && hyp(n.x - pad.x, n.y - pad.y) <= n.meshR);
      if (!covered) return 'Pad is outside the mesh.';
      this.supply -= c;
      const u = this.addUnit('sentry', pad.x, pad.y, { building: KW.UT.sentry.build });
      pad.unit = u.id;
      this.stats.built++;
      this.ev('info', u.name, 'Raising tower.');
      return null;
    }
    cmdLaunchISR(u, x, y) {
      if (!u || u.type !== 'tubes') return 'Not an Altius launcher.';
      if (!u.inMesh) return 'Launcher is off the mesh.';
      if (u.stock <= 0) return 'No tubes loaded.';
      const c = this.costOf('altius');
      if (this.supply < c) return `Needs ${c} supply.`;
      this.supply -= c; u.stock--;
      const a = this.addUnit('altius', u.x, u.y);
      a.mv = { mode: 'goto', tx: clamp(x, 0.5, this.W - 0.5), ty: clamp(y, 0.5, this.H - 0.5), r: ORBIT_R.altius }; a.manual = true;
      this.ev('info', u.name, `${a.name} launched.`);
      return null;
    }
    cmdLaunchLoiter(u, wkey, x, y) {
      if (!u || u.type !== 'tubes') return 'Not an Altius launcher.';
      if (wkey === 'a700m' && !this.unlocked('a700m')) return 'Altius-700M is not cleared yet.';
      if (!u.inMesh) return 'Launcher is off the mesh.';
      if (u.stock <= 0) return 'No tubes loaded.';
      const c = this.costOf(wkey);
      if (this.supply < c) return `Needs ${c} supply.`;
      this.supply -= c; u.stock--;
      const W = KW.WT[wkey], ws = this.wstat(wkey, u);
      const s = { id: this.nid++, side: 'f', w: wkey, W, x: u.x, y: u.y, hdg: Math.atan2(y - u.y, x - u.x), spd: ws.speed / 3600, dmg: ws.dmg, tgt: null, tx: x, ty: y, pk: 0.5,
        from: u.id, prod: 'altius', home: [u.x, u.y], mode: 'transit', born: this.t, life: 9999, traveled: 0, trail: [], loiterC: [x, y], endT: this.t + W.life };
      this.shots.push(s);
      this.ev('info', u.name, `${W.name} launched to loiter. Endurance ${Math.round(W.life / 60)} min.`);
      return null;
    }
    cmdBolt(u, x, y) {
      if (!u || u.type !== 'team') return 'Not a fireteam.';
      if (u.boltCd > 0) return `Next Bolt ready in ${Math.ceil(u.boltCd)} s.`;
      if (!u.inMesh) return 'Team is off the mesh.';
      u.boltCd = 300;
      const b = this.addUnit('bolt', u.x, u.y);
      b.mv = { mode: 'goto', tx: x, ty: y, r: ORBIT_R.bolt }; b.manual = true;
      this.ev('info', u.name, `${b.name} thrown. Ten minutes of battery.`);
      return null;
    }
    cmdThunderAltius(u, x, y) {
      if (!u || u.type !== 'thunder') return 'Not Thunder.';
      if (u.ammo.a6 <= 0) return 'Bay is empty.';
      u.ammo.a6--;
      const a = this.addUnit('altius', u.x, u.y);
      a.mv = { mode: 'goto', tx: x, ty: y, r: ORBIT_R.altius }; a.manual = true;
      this.ev('info', u.name, `${a.name} released from the bay.`);
      return null;
    }
    // one Fury: air-to-air missiles and two Barracuda-500M, fights anything identified inside its patrol area
    cmdFury(x, y) {
      if (this.ents.some((f) => f.alive && f.type === 'fury')) return 'Fury is already up.';
      if (this.furyCd > 0) return `Fury ready in ${Math.ceil(this.furyCd)} s.`;
      const c = this.costOf('fury');
      if (this.supply < c) return `Needs ${c} supply.`;
      this.supply -= c;
      const f = this.addUnit('fury', -0.8, this.H * 0.85, { name: 'FURY' });
      f.station = f.T.station;
      f.mv = { mode: 'goto', tx: clamp(x, 1, this.W - 1), ty: clamp(y, 1, this.H - 1), r: ORBIT_R.fury };
      f.cap = [f.mv.tx, f.mv.ty]; f.capR = ORBIT_R.fury;
      this.ev('info', 'FURY', 'Airborne.', { kind: 'launch' });
      return null;
    }
    // Thunder flies to the point and works over everything identified within 6 km, then rearms
    cmdThunder(x, y) {
      const u = this.ents.find((q) => q.alive && q.type === 'thunder');
      if (!u) return 'No Thunder.';
      if (u.rearm) return `Thunder rearming: ${Math.ceil(u.rearm)} s.`;
      if (u.strike) { u.strike.x = clamp(x, 0.5, this.W - 0.5); u.strike.y = clamp(y, 0.5, this.H - 0.5); u.mv = { mode: 'goto', tx: u.strike.x, ty: u.strike.y, r: ORBIT_R.thunder }; return null; }
      const c = this.costOf('thunder');
      if (this.supply < c) return `Needs ${c} supply.`;
      if (!u.inMesh) return 'Thunder is off the mesh.';
      this.supply -= c;
      x = clamp(x, 0.5, this.W - 0.5); y = clamp(y, 0.5, this.H - 0.5);
      u.strike = { x, y, until: this.t + 300 };
      u.manual = true; u.mv = { mode: 'goto', tx: x, ty: y, r: ORBIT_R.thunder };
      this.ev('info', u.name, 'Strike run.', { kind: 'launch' });
      return null;
    }
    // six rockets from the base onto a point; light vehicles and drone groups inside 0.6 km
    cmdRockets(x, y) {
      if (this.rocketCd > 0) return `Rockets reloading: ${Math.ceil(this.rocketCd)} s.`;
      const c = this.costOf('rockets');
      if (this.supply < c) return `Needs ${c} supply.`;
      const from = this.menace && this.menace.alive ? this.menace : null;
      if (!from) return 'Launcher lost.';
      x = clamp(x, 0.3, this.W - 0.3); y = clamp(y, 0.3, this.H - 0.3);
      if (this.neutralsNear(x, y, 1.1)) return 'Civilians too close.';
      this.supply -= c; this.rocketCd = 75;
      const W = KW.WT.rkt, ws = this.wstat('rkt', null);
      for (let i = 0; i < 6; i++) {
        const a = this.rand() * TAU, r = Math.sqrt(this.rand()) * 0.5;
        const tx = x + Math.cos(a) * r, ty = y + Math.sin(a) * r;
        const ox = from.x + (this.rand() - 0.5) * 0.3, oy = from.y + (this.rand() - 0.5) * 0.3;
        this.shots.push({ id: this.nid++, side: 'f', w: 'rkt', W, x: ox, y: oy, hdg: Math.atan2(ty - oy, tx - ox), spd: ws.speed / 3600 * (0.94 + i * 0.012), dmg: ws.dmg * 1.25,
          tgt: null, tx, ty, pk: 0.8, from: from.id, prod: 'srm', home: [ox, oy], mode: 'out', born: this.t, life: 999, traveled: 0, trail: [] });
      }
      this.stats.launches += 6;
      this.ev('info', 'ROCKETS', 'Salvo away.', { kind: 'launch' });
      return null;
    }
    // one Altius from the nearest loaded launcher: scouts the point, then dives on a ground hostile it identifies
    cmdAltius(x, y) {
      const T = this.ents.filter((u) => u.alive && u.type === 'tubes');
      if (!T.length) return 'No Altius launcher.';
      const ready = T.filter((u) => u.stock > 0 && u.inMesh).sort((a, b) => hyp(a.x - x, a.y - y) - hyp(b.x - x, b.y - y));
      if (!ready.length) return T.some((u) => u.stock > 0) ? 'Launcher is off the mesh.' : 'Tubes reloading.';
      const c = this.costOf('altius');
      if (this.supply < c) return `Needs ${c} supply.`;
      const u = ready[0];
      this.supply -= c; u.stock--;
      const a = this.addUnit('altius', u.x, u.y);
      a.strike = true; a.manual = true;
      a.mv = { mode: 'goto', tx: clamp(x, 0.5, this.W - 0.5), ty: clamp(y, 0.5, this.H - 0.5), r: ORBIT_R.altius };
      this.stats.launches++;
      this.ev('info', u.name, `${a.name} launched.`, { kind: 'launch' });
      return null;
    }
    cmdMark(u, e) {
      if (!u || u.type !== 'ghost') return 'Only Ghost-X can mark.';
      if (!e || !e.trk || !e.trk.det) return 'No track.';
      const r = u.T.sens.id * (this.def.night && !u.T.sens.ir ? 0.6 : 1);
      if (dist(u, e) > r) return `Get within ${r.toFixed(1)} km to mark.`;
      e.marked = this.t + 120;
      this.ev('info', u.name, `Track ${e.trk.no} marked. Strikes on it get a boost for two minutes.`);
      return null;
    }
    cmdResupply(u, t) {
      if (!u || u.type !== 'omen') return 'Only Omen resupplies.';
      if (u.resupCd > 0) return `Resupply ready in ${Math.ceil(u.resupCd)} s.`;
      if (!t || t.side !== 'f' || (t.stock == null && !t.maxAmmo && !t.maxEnergy)) return 'Pick a launcher, team, Pulsar or Thunder.';
      if (u.mv.mode === 'resupply' && u.mv.target === t.id) return null;
      u.mv = { mode: 'resupply', target: t.id, hold: 0 };
      this.ev('info', u.name, `Heading to ${t.name} with resupply.`);
      return null;
    }
    setAutonomy(m) {
      if (m === 'auto' && !this.mods.fullAuto) return 'AUTONOMOUS needs the Full Autonomy skill.';
      this.autonomy = m;
      this.ev('info', 'LATTICE', m === 'manual' ? 'Autonomy MANUAL: nothing fires until you pair it.' : m === 'supervised' ? 'Autonomy SUPERVISED: defenses engage identified hostiles on their own.' : 'Autonomy AUTONOMOUS: defenses, strikes and scouting run on their own.');
      return null;
    }
    cmdHold(e, on) {
      if (!e || e.side === 'f') return 'Pick a track.';
      e.hold = !!on;
      this.ev('info', 'LATTICE', on ? `Holding fire on track ${e.trk ? e.trk.no : '?'}. Autonomy will leave it alone.` : `Track ${e.trk ? e.trk.no : '?'} released to autonomy.`);
      return null;
    }
    setROE(r) { this.roe = r; this.ev(r === 'free' ? 'warn' : 'info', 'REYES', r === 'free' ? 'Weapons free noted. You can pair on unknown tracks. You own every result.' : 'Weapons tight. Identified hostiles only.'); return null; }

    // ---------------- read helpers for the UI
    tracks() { return this.ents.filter((e) => e.alive && e.side !== 'f' && e.trk && e.trk.det); }
    friendlies() { return this.ents.filter((e) => e.alive && e.side === 'f'); }
    eta(e) {
      if (!e.trk || !e.alive) return null;
      const k = e.trk, v = hyp(k.evx, k.evy);
      if (v < 1e-4) return null;
      let best = null;
      for (const s of this.ents) {
        if (!s.alive || s.side !== 'f' || (s.T.kind !== 'site' && s.type !== 'menace' && !s.isTruck)) continue;
        const dx = s.x - k.ex, dy = s.y - k.ey, d = hyp(dx, dy);
        const cos = (dx * k.evx + dy * k.evy) / (d * v || 1);
        if (cos < 0.8) continue;
        const t = d / v;
        if (!best || t < best.t) best = { t, site: s };
      }
      return best;
    }
  }

  function T_RF(e) { return !!e.T.rf; }

  Object.assign(KW, { Sim, Terrain, Noise, buildPath, pathAt, computeMods, mulberry, modelLevel, MODEL_XP });
})(typeof window !== 'undefined' ? window.KW : globalThis.KW);
