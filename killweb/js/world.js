// Kill Web: the live 3D battlefield. Terrain, sea, sky, buildings, stylized aircraft and vehicles, effects and the camera.
// Reads the sim each frame; never changes it. World units: metres, x east, z south, y up. Map units: km.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// fog by true distance per fragment, so big sea quads and the far ring fade evenly into the horizon
THREE.ShaderChunk.fog_pars_vertex = '#ifdef USE_FOG\nvarying vec3 vFogPos;\n#endif';
THREE.ShaderChunk.fog_vertex = '#ifdef USE_FOG\nvFogPos = mvPosition.xyz;\n#endif';
THREE.ShaderChunk.fog_pars_fragment = '#ifdef USE_FOG\nuniform vec3 fogColor;\nvarying vec3 vFogPos;\nuniform float fogNear;\nuniform float fogFar;\n#endif';
THREE.ShaderChunk.fog_fragment = '#ifdef USE_FOG\nfloat fogF = smoothstep(fogNear, fogFar, length(vFogPos));\ngl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, pow(fogF, 1.45));\n#endif';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (n) => { n = (n * 2654435761) >>> 0; n ^= n >>> 15; n = Math.imul(n, 2246822519) >>> 0; n ^= n >>> 13; return (n >>> 0) / 4294967296; };

// display altitude above ground (m) by type, then by band
const ALT = { wasp: 160, gnat: 220, kite: 520, lance: 240, spear: 110, shrike: 1350, talon: 300, scythe: 1900, mother: 1150,
  airliner: 2300, medevac: 330, ghost: 300, altius: 720, bolt: 140, omen: 1420, thunder: 480, fury: 2050 };
const BAND_ALT = [0, 300, 1300, 2000];
const SHOT_ALT = { anvil: 0, roadrunner: 0, aam: 0, ci: 0, b100: 60, b500: 60, boltm: 40, a600m: 650, a700m: 650, rkt: 0,
  sam: 0, manpads: 0, eaam: 0, glide: 0, hrkt: 0, trkt: 0 };

// ---------------------------------------------------------------- stylized models (generic shapes, 1 unit = 1 m, nose along +x)
const M = {
  f: new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.55, metalness: 0.15 }),
  fd: new THREE.MeshStandardMaterial({ color: 0x5c656d, roughness: 0.6, metalness: 0.1 }),
  h: new THREE.MeshStandardMaterial({ color: 0x4a4d50, roughness: 0.6, metalness: 0.15 }),
  hd: new THREE.MeshStandardMaterial({ color: 0x2c2e30, roughness: 0.65, metalness: 0.1 }),
  n: new THREE.MeshStandardMaterial({ color: 0xd9dbd6, roughness: 0.55, metalness: 0.1 }),
  nd: new THREE.MeshStandardMaterial({ color: 0x8b9094, roughness: 0.6, metalness: 0.1 }),
  disc: new THREE.MeshBasicMaterial({ color: 0x1a1d20, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  white: new THREE.MeshStandardMaterial({ color: 0xe8e8e2, roughness: 0.6 }),
  wake: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }),
  glass: new THREE.MeshStandardMaterial({ color: 0x1b2a33, roughness: 0.15, metalness: 0.4 }),
  olive: new THREE.MeshStandardMaterial({ color: 0x5d6448, roughness: 0.85 }),
  oliveD: new THREE.MeshStandardMaterial({ color: 0x3f4433, roughness: 0.85 }),
  sand: new THREE.MeshStandardMaterial({ color: 0x8c8466, roughness: 0.9 }),
  tan: new THREE.MeshStandardMaterial({ color: 0xa79c7c, roughness: 0.85 }),
  grey: new THREE.MeshStandardMaterial({ color: 0x7c8287, roughness: 0.7, metalness: 0.1 }),
  greyD: new THREE.MeshStandardMaterial({ color: 0x4b5054, roughness: 0.7, metalness: 0.1 }),
  red: new THREE.MeshStandardMaterial({ color: 0x8f3a32, roughness: 0.7 }),
  blue: new THREE.MeshStandardMaterial({ color: 0x40607a, roughness: 0.7 }),
};
function wing(span, rootChord, tipChord, sweep, thick, mat) {
  const s = new THREE.Shape();
  s.moveTo(rootChord / 2, 0); s.lineTo(rootChord / 2 - sweep, span / 2); s.lineTo(rootChord / 2 - sweep - tipChord, span / 2);
  s.lineTo(-rootChord / 2, 0); s.lineTo(rootChord / 2 - sweep - tipChord, -span / 2); s.lineTo(rootChord / 2 - sweep, -span / 2); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.rotateX(Math.PI / 2); g.translate(0, thick / 2, 0);
  return new THREE.Mesh(g, mat);
}
function body(len, rad, mat, nose = 0.35) {
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const r = t < nose ? rad * Math.sin((t / nose) * Math.PI / 2) : t > 0.85 ? rad * (0.55 + 0.45 * (1 - (t - 0.85) / 0.15)) : rad;
    pts.push(new THREE.Vector2(Math.max(0.01, r), (0.5 - t) * len));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  g.rotateZ(-Math.PI / 2);
  return new THREE.Mesh(g, mat);
}
function disc(r, mat = M.disc) { const g = new THREE.CircleGeometry(r, 24); g.rotateX(-Math.PI / 2); return new THREE.Mesh(g, mat); }
function fin(h, chord, mat, cant = 0) {
  const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(-chord * 0.45, h); s.lineTo(-chord, h); s.lineTo(-chord * 0.9, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: false }); g.translate(chord * 0.5, 0, -0.075);
  const m = new THREE.Mesh(g, mat); m.rotation.x = cant; return m;
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y + h / 2, z); return m; }
function cyl(r, h, mat, x = 0, y = 0, z = 0, seg = 10) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat); m.position.set(x, y + h / 2, z); return m; }
function wheels(g, len, wid, n, r, mat) {
  for (let i = 0; i < n; i++) for (const z of [-wid / 2, wid / 2]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.35, 10), mat); w.rotation.x = Math.PI / 2;
    w.position.set(-len / 2 + len * (i + 0.5) / n, r, z); g.add(w);
  }
}

const ART = {
  // air
  jet(m, d) { const g = new THREE.Group();
    g.add(body(15, 0.9, m, 0.3)); g.add(wing(10.5, 7.5, 1.6, 4.6, 0.25, m).translateX(-1.2)); g.add(wing(5.2, 2.6, 1.0, 1.5, 0.15, d).translateX(-6.4));
    const f1 = fin(1.7, 2.2, d, 0.45); f1.position.set(-5.4, 0.4, 0.9); g.add(f1);
    const f2 = fin(1.7, 2.2, d, -0.45); f2.position.set(-5.4, 0.4, -0.9); g.add(f2);
    const c = body(3.2, 0.55, M.glass, 0.5); c.position.set(3.4, 0.7, 0); g.add(c);
    return { g, span: 10.5, px: 46 }; },
  fixedwing(m, d) { const g = new THREE.Group();
    g.add(body(10, 0.62, m, 0.4)); g.add(wing(17, 1.25, 0.65, 0.35, 0.18, m).translateX(0.4));
    const f1 = fin(1.7, 1.3, d, 0.7); f1.position.set(-4.1, 0.2, 0.25); g.add(f1);
    const f2 = fin(1.7, 1.3, d, -0.7); f2.position.set(-4.1, 0.2, -0.25); g.add(f2);
    const p = disc(1.1); p.rotation.z = Math.PI / 2; p.position.set(-5.1, 0, 0); g.add(p);
    return { g, span: 17, px: 42 }; },
  smallwing(m, d) { const g = new THREE.Group();
    g.add(body(2.6, 0.17, m, 0.4)); g.add(wing(2.5, 0.32, 0.22, 0.08, 0.05, m).translateX(0.2));
    const f1 = fin(0.4, 0.35, d, 0.7); f1.position.set(-1.1, 0.05, 0.08); g.add(f1);
    const f2 = fin(0.4, 0.35, d, -0.7); f2.position.set(-1.1, 0.05, -0.08); g.add(f2);
    return { g, span: 2.6, px: 26 }; },
  male(m, d) { const g = new THREE.Group();
    g.add(body(11, 0.75, m, 0.42)); g.add(wing(20, 1.4, 0.7, 0.3, 0.2, m).translateX(0.6));
    const f1 = fin(1.9, 1.4, d, 0.75); f1.position.set(-4.5, 0.2, 0.3); g.add(f1);
    const f2 = fin(1.9, 1.4, d, -0.75); f2.position.set(-4.5, 0.2, -0.3); g.add(f2);
    const p = disc(1.2); p.rotation.z = Math.PI / 2; p.position.set(-5.6, 0, 0); g.add(p);
    return { g, span: 20, px: 46 }; },
  tiltrotor(m, d) { const g = new THREE.Group();
    g.add(body(12, 1.0, m, 0.3)); g.add(wing(11.5, 1.9, 1.6, 0.2, 0.3, m).translateX(0.6).translateY(0.9));
    for (const z of [-5.9, 5.9]) {
      const n = body(3.4, 0.45, d, 0.4); n.position.set(1.0, 1.2, z); g.add(n);
      const r = disc(3.6); r.rotation.z = Math.PI / 2 * 0.72; r.position.set(2.4, 1.6, z); g.add(r);
    }
    const t = wing(4.5, 1.2, 0.8, 0.5, 0.15, d); t.position.set(-5.4, 0.8, 0); g.add(t);
    const f = fin(2.0, 1.6, d); f.position.set(-5.3, 0.6, 0); g.add(f);
    return { g, span: 15, px: 48 }; },
  heli(m, d) { const g = new THREE.Group();
    g.add(body(4.2, 0.65, m, 0.45));
    const tb = body(4.6, 0.16, d, 0.1); tb.position.set(-3.6, 0.15, 0); g.add(tb);
    const r = disc(4.2); r.position.set(0.1, 0.95, 0); g.add(r);
    const tr = disc(0.6); tr.rotation.x = Math.PI / 2; tr.position.set(-5.8, 0.3, 0.25); g.add(tr);
    const f = fin(0.9, 0.7, d); f.position.set(-5.7, 0.2, 0); g.add(f);
    return { g, span: 8.4, px: 36 }; },
  tailsitter(m, d) { const g = new THREE.Group();
    g.add(body(3.6, 0.42, m, 0.45)); g.add(wing(8.4, 1.2, 0.8, 0.3, 0.2, m));
    for (const z of [-2.2, 2.2]) {
      const n = body(1.5, 0.3, d, 0.4); n.position.set(0.7, 0, z); g.add(n);
      const r = disc(1.1); r.rotation.z = Math.PI / 2; r.position.set(1.5, 0, z); g.add(r);
    }
    for (const z of [-4.1, 4.1]) { const f = fin(0.9, 0.9, d); f.position.set(-0.2, 0, z); g.add(f); }
    return { g, span: 8.4, px: 42 }; },
  delta(m, d) { const g = new THREE.Group();
    g.add(body(3.4, 0.22, m, 0.3)); g.add(wing(2.6, 2.6, 0.3, 2.2, 0.08, m).translateX(-0.3));
    for (const z of [-1.3, 1.3]) { const f = fin(0.5, 0.5, d); f.position.set(-1.45, 0, z); g.add(f); }
    const p = disc(0.4); p.rotation.z = Math.PI / 2; p.position.set(-1.75, 0, 0); g.add(p);
    return { g, span: 2.6, px: 24 }; },
  missile(m, d) { const g = new THREE.Group();
    g.add(body(6, 0.3, m, 0.25)); g.add(wing(2.6, 0.6, 0.3, 0.3, 0.06, d).translateX(-0.4));
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { const f = fin(0.45, 0.5, d); f.position.set(-2.6, 0, 0); f.rotation.x = a; g.add(f); }
    return { g, span: 6, px: 22 }; },
  quad(m, d) { const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.04, 0.05), d); a.rotation.y = Math.PI / 4; g.add(a);
    const b = a.clone(); b.rotation.y = -Math.PI / 4; g.add(b);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.1), m));
    for (const [x, z] of [[0.22, 0.22], [-0.22, 0.22], [0.22, -0.22], [-0.22, -0.22]]) { const r = disc(0.12); r.position.set(x, 0.04, z); g.add(r); }
    return { g, span: 0.7, px: 13 }; },
  carrier(m, d) { const g = new THREE.Group();
    g.add(wing(64, 26, 5, 20, 2.2, m).translateX(6)); g.add(body(30, 3.2, m, 0.35).translateX(2));
    for (const z of [-9, -3.5, 3.5, 9]) { const n = body(6, 1.1, d, 0.3); n.position.set(-4 - Math.abs(z) * 0.5, 1.8, z); g.add(n); }
    for (const z of [-26, 26]) { const f = fin(3.2, 4, d); f.position.set(-12, 1, z); g.add(f); }
    return { g, span: 64, px: 128 }; },
  airliner(m, d) { const g = new THREE.Group();
    g.add(body(38, 2.0, m, 0.18)); g.add(wing(36, 7, 2, 6, 0.4, m).translateX(1));
    for (const z of [-6.5, 6.5]) { const n = body(4, 0.9, d, 0.3); n.position.set(2.5, -1.2, z); g.add(n); }
    g.add(wing(12, 4, 1.5, 3, 0.25, m).translateX(-16));
    const f = fin(6, 5, m); f.position.set(-15.5, 1.2, 0); g.add(f);
    return { g, span: 36, px: 58 }; },
  // ground and sea
  boat(m, d) { const g = new THREE.Group();
    const hull = body(13, 1.6, M.white, 0.45); hull.scale.set(1, 0.45, 1); hull.position.y = 0.3; g.add(hull);
    g.add(box(3.4, 2.0, 2.4, M.white, 1.2, 0.6, 0));
    const wk = new THREE.Shape(); wk.moveTo(-6, 0); wk.lineTo(-30, 6); wk.lineTo(-31, 4.6); wk.lineTo(-8, 0); wk.lineTo(-31, -4.6); wk.lineTo(-30, -6); wk.closePath();
    const wg = new THREE.ShapeGeometry(wk); wg.rotateX(-Math.PI / 2); const w = new THREE.Mesh(wg, M.wake); w.position.y = 0.2; g.add(w);
    return { g, span: 13, px: 22 }; },
  tank(m, d) { const g = new THREE.Group();
    g.add(box(7.4, 1.5, 3.6, m, 0, 0.5, 0)); g.add(box(7.6, 0.9, 0.7, d, 0, 0.1, 1.55)); g.add(box(7.6, 0.9, 0.7, d, 0, 0.1, -1.55));
    g.add(box(3.4, 0.9, 2.6, d, -0.4, 2.0, 0));
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 5.2, 8), d); gun.rotation.z = Math.PI / 2; gun.position.set(3.5, 2.45, 0); g.add(gun);
    return { g, span: 9, px: 17, ground: true }; },
  apc(m, d) { const g = new THREE.Group();
    g.add(box(6.6, 2.0, 3.0, m, 0, 0.6, 0)); wheels(g, 5.4, 3.0, 4, 0.55, M.hd);
    g.add(box(1.4, 0.6, 1.2, d, 0.4, 2.6, 0));
    return { g, span: 7, px: 15, ground: true }; },
  pickup(m, d) { const g = new THREE.Group();
    g.add(box(5.2, 0.8, 2.0, m, 0, 0.6, 0)); g.add(box(1.8, 0.9, 1.9, m, 0.9, 1.4, 0)); wheels(g, 3.8, 2.0, 2, 0.42, M.hd);
    const t = cyl(0.12, 1.6, d, -1.4, 1.4, 0); t.rotation.z = -0.9; g.add(t);
    return { g, span: 5.2, px: 13, ground: true }; },
  truck(m, d) { const g = new THREE.Group();
    g.add(box(2.2, 2.2, 2.4, d, 3.0, 0.7, 0)); g.add(box(5.6, 2.6, 2.5, m, -0.9, 0.9, 0)); wheels(g, 7, 2.4, 3, 0.55, M.hd);
    return { g, span: 8, px: 15, ground: true }; },
  mlrs(m, d) { const g = new THREE.Group();
    g.add(box(2.2, 2.0, 2.5, d, 3.2, 0.7, 0)); g.add(box(6.2, 0.6, 2.5, m, -0.6, 0.8, 0)); wheels(g, 7.2, 2.5, 3, 0.55, M.hd);
    const pod = box(4.2, 1.2, 2.2, d, 0, 0, 0); pod.position.set(-1.0, 1.9, 0); pod.rotation.z = 0.35; g.add(pod);
    return { g, span: 8.5, px: 16, ground: true }; },
  sam(m, d) { const g = new THREE.Group();
    g.add(box(2.2, 2.0, 2.5, d, 3.2, 0.7, 0)); g.add(box(6.2, 0.6, 2.5, m, -0.6, 0.8, 0)); wheels(g, 7.2, 2.5, 3, 0.55, M.hd);
    for (const z of [-0.6, 0.6]) { const t = cyl(0.32, 5.2, d, 0, 0, 0); t.rotation.z = -1.0; t.position.set(-1.4, 3.2, z); g.add(t); }
    const r = box(0.3, 1.8, 2.6, d, -4.4, 1.4, 0); g.add(r);
    return { g, span: 8.5, px: 17, ground: true }; },
  ewtruck(m, d) { const g = new THREE.Group();
    g.add(box(2.2, 2.2, 2.4, d, 3.0, 0.7, 0)); g.add(box(5.4, 2.6, 2.5, m, -0.9, 0.9, 0)); wheels(g, 7, 2.4, 3, 0.55, M.hd);
    g.add(cyl(0.12, 6, d, -2.6, 3.5, 0)); g.add(box(1.6, 0.2, 1.6, d, -2.6, 9.4, 0));
    return { g, span: 8, px: 16, ground: true }; },
  post(m, d) { const g = new THREE.Group();
    g.add(box(6, 2.6, 2.5, m, 0, 0, 0)); g.add(box(6, 2.6, 2.5, d, 0, 0, 3.2));
    g.add(cyl(0.12, 9, d, -3.4, 0, 1.5)); g.add(cyl(0.1, 7, d, 3.4, 0, 1.5));
    return { g, span: 8, px: 17, ground: true }; },
  ramp(m, d) { const g = new THREE.Group();
    const r = box(9, 0.4, 1.0, d, 0, 0, 0); r.rotation.z = 0.28; r.position.set(0, 2.0, 0); g.add(r);
    g.add(box(1, 2.2, 1, m, -2.6, 0, 0)); g.add(box(4, 1.2, 3, m, -6, 0, 2.5));
    return { g, span: 9, px: 16, ground: true }; },
  car(m, d) { const g = new THREE.Group();
    g.add(box(4.2, 0.8, 1.8, m, 0, 0.4, 0)); g.add(box(2.2, 0.6, 1.6, M.glass, -0.2, 1.2, 0)); wheels(g, 2.8, 1.8, 2, 0.35, M.hd);
    return { g, span: 4.2, px: 11, ground: true }; },
  // friendly installations
  menace(m, d) { const g = new THREE.Group();
    g.add(box(5.2, 2.2, 2.3, m, 0, 0.6, 0)); wheels(g, 4.2, 2.3, 2, 0.5, M.hd);
    g.add(cyl(0.1, 7, d, -1.6, 2.8, 0)); g.add(box(1.4, 1.0, 1.4, d, 1.8, 2.8, 0));
    g.add(box(1.2, 0.8, 0.9, d, 3.8, 0, 2.2)); g.add(box(1.2, 0.8, 0.9, d, 3.8, 0, -2.2));
    return { g, span: 6, px: 18, ground: true }; },
  sentry(m, d) { const g = new THREE.Group();
    g.add(cyl(0.35, 14, d, 0, 0, 0, 8)); g.add(box(2.2, 0.5, 2.2, m, 0, 0, 0));
    g.add(box(1.4, 0.9, 1.4, m, 0, 14, 0)); g.add(box(0.5, 1.4, 1.2, d, 0.3, 15, 0));
    return { g, span: 4, px: 16, ground: true, tall: 16 }; },
  nest(m, d) { const g = new THREE.Group();
    g.add(box(4.4, 1.8, 2.4, m, 0, 0, 0));
    for (let i = 0; i < 3; i++) g.add(box(1.0, 0.3, 0.8, d, -1.3 + i * 1.3, 1.8, 0));
    return { g, span: 4.4, px: 14, ground: true }; },
  rrpad(m, d) { const g = new THREE.Group();
    g.add(box(7, 0.4, 7, d, 0, 0, 0));
    const v = body(4, 0.5, m, 0.3); v.rotation.z = Math.PI / 2; v.position.set(0, 2.6, 0); g.add(v);
    g.add(box(4.2, 2.2, 2.4, m, -5.5, 0, 0));
    return { g, span: 8, px: 15, ground: true }; },
  tubes(m, d) { const g = new THREE.Group();
    g.add(box(5, 0.6, 2.2, m, 0, 0.5, 0)); wheels(g, 3.6, 2.2, 2, 0.45, M.hd);
    for (let i = 0; i < 4; i++) { const t = cyl(0.22, 3.4, d, 0, 0, 0, 8); t.rotation.z = -1.15; t.position.set(0, 2.3, -0.75 + i * 0.5); g.add(t); }
    return { g, span: 5, px: 14, ground: true }; },
  bcl(m, d) { const g = new THREE.Group();
    g.add(box(2.2, 2.0, 2.5, d, 3.2, 0.7, 0)); g.add(box(6.2, 0.6, 2.5, m, -0.6, 0.8, 0)); wheels(g, 7.2, 2.5, 3, 0.55, M.hd);
    const pod = box(5, 1.4, 2.0, m, 0, 0, 0); pod.position.set(-1.0, 1.9, 0); pod.rotation.z = 0.25; g.add(pod);
    return { g, span: 8.5, px: 16, ground: true }; },
  pulsar(m, d) { const g = new THREE.Group();
    g.add(box(5.6, 2.0, 2.4, m, 0, 0.6, 0)); wheels(g, 4.4, 2.4, 2, 0.5, M.hd);
    g.add(box(2.4, 1.4, 1.6, d, -0.8, 2.6, 0)); g.add(cyl(0.08, 3, d, 1.6, 2.6, 0.7)); g.add(cyl(0.08, 3, d, 1.6, 2.6, -0.7));
    return { g, span: 6, px: 15, ground: true }; },
  team(m, d) { const g = new THREE.Group();
    for (const [x, z] of [[0, 0], [1.6, 1.2], [-1.5, 1.0], [0.4, -1.6]]) { g.add(cyl(0.3, 1.5, m, x, 0, z, 6)); g.add(box(0.4, 0.4, 0.4, d, x, 1.5, z)); }
    g.add(box(4.6, 1.8, 2.2, m, -4.2, 0.4, 0)); wheels(g, 3.4, 2.2, 2, 0.45, M.hd);
    return { g, span: 6, px: 13, ground: true }; },
};
const ART_FOR = {
  // friendly unit types
  menace: 'menace', sentry: 'sentry', nest: 'nest', rrpad: 'rrpad', tubes: 'tubes', bcl: 'bcl', pulsar: 'pulsar', team: 'team', truck: 'truck',
  ghost: 'heli', altius: 'fixedwing', bolt: 'quad', omen: 'tailsitter', thunder: 'tiltrotor', fury: 'jet',
};
const SHOT_ART = { anvil: 'quad', a600m: 'smallwing', a700m: 'smallwing', boltm: 'quad', b100: 'missile', b500: 'missile', roadrunner: 'delta', spear: 'missile' };

function proto(art, side) {
  const mats = side === 'f' ? [M.f, M.fd] : side === 'n' ? [M.n, M.nd] : [M.h, M.hd];
  const gmat = side === 'f' ? [M.olive, M.oliveD] : side === 'n' ? [M.blue, M.greyD] : [M.sand, M.greyD];
  const fn = ART[art] || ART.fixedwing;
  const probe = fn(...mats);
  if (probe.ground) { const r = fn(...gmat); return r; }
  return probe;
}

// a fresh model for other views (the hangar blueprint)
export function buildModel(art, side = 'f') { return proto(art, side); }
export { ART_FOR, THREE };

// ---------------------------------------------------------------- procedural sprites
function radialTex(stops, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function smokeTex(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2, r = size * (0.12 + 0.14 * ((i * 7919) % 13) / 13);
    const x = size / 2 + Math.cos(a) * r * 0.9, y = size / 2 + Math.sin(a) * r * 0.9;
    const gr = g.createRadialGradient(x, y, 0, x, y, size * 0.26);
    gr.addColorStop(0, 'rgba(255,255,255,0.32)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  }
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------------------------------------------------------- heights
async function loadImageData(url) {
  const blob = await (await fetch(url)).blob();
  let bmp;
  try { bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }); }
  catch (e) { bmp = await createImageBitmap(blob); }
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
  return g.getImageData(0, 0, c.width, c.height);
}
async function loadHeights(url, hoff, hq) {
  const im = await loadImageData(url);
  const d = im.data, out = new Float32Array(im.width * im.height);
  for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] * 256 + d[i * 4 + 1]) / hq - hoff;
  return { w: im.width, h: im.height, a: out };
}
function loadTexture(url, aniso) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, (t) => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; res(t);
  }, undefined, rej));
}

// ---------------------------------------------------------------- the world
export class World {
  constructor(canvas, opt = {}) {
    this.canvas = canvas;
    this.low = !!opt.low;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.low, powerPreference: 'high-performance', alpha: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, opt.maxDpr || 1.5));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05; r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 40, 320000);
    this.view = { tx: 0, tz: 0, ty: 0, yaw: 0, pitch: 0.62, dist: 34000, mapK: 0, mode: '3d' };
    this.goal = null;               // eased camera target {tx, tz, dist, yaw, pitch}
    this.objs = new Map();          // entity id -> {g, art, span, px, side}
    this.shotObjs = new Map();
    this.protos = new Map();
    this.fxSeen = new WeakSet();
    this.fxLive = [];
    this.recs = [];                 // per-frame screen records for the overlay and picking
    this.sizeW = 1; this.sizeH = 1;
    this.uiScale = 1;
    this.tmp = new THREE.Vector3();
    this.texGlow = radialTex([[0, 'rgba(255,250,235,1)'], [0.18, 'rgba(255,214,140,0.95)'], [0.45, 'rgba(255,140,50,0.45)'], [1, 'rgba(255,90,20,0)']]);
    this.texSoft = radialTex([[0, 'rgba(255,255,255,0.9)'], [0.4, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    this.texSmoke = smokeTex();
    this.texLight = radialTex([[0, 'rgba(255,236,190,1)'], [0.25, 'rgba(255,196,120,0.6)'], [1, 'rgba(255,170,90,0)']], 64);
    this.sky = null; this.ready = false;
  }

  // ---------------- loading
  async load(def, base, progress = () => {}) {
    const S = this.scene;
    this.def = def;
    const night = !!def.night;
    this.night = night;
    const T = this.T = await (await fetch(base + 'terrain.json')).json();
    progress(0.1);
    const [H, albedo] = await Promise.all([loadHeights(base + 'height.png', T.hoff, T.hq), loadTexture(base + 'albedo.jpg', this.renderer.capabilities.getMaxAnisotropy())]);
    progress(0.55);
    this.H = H; this.CX = (T.X0 + T.X1) / 2; this.CY = (T.Y0 + T.Y1) / 2;
    const SPANX = (T.X1 - T.X0) * 1000, SPANZ = (T.Y1 - T.Y0) * 1000;

    // light and atmosphere
    const az = THREE.MathUtils.degToRad(T.sun_az), el = THREE.MathUtils.degToRad(night ? 48 : T.sun_el);
    const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.sun = new THREE.DirectionalLight(night ? 0x9db4dc : 0xfff1dc, night ? 0.55 : 2.5);
    this.sun.position.copy(sunDir).multiplyScalar(10000); S.add(this.sun);
    this.hemi = new THREE.HemisphereLight(night ? 0x34465e : 0xbfd3e6, night ? 0x10141a : 0x4c4a3c, night ? 0.32 : 0.85); S.add(this.hemi);
    this.fogCol = new THREE.Color(night ? '#121c28' : '#c6d2db');
    S.fog = new THREE.Fog(this.fogCol, 9000, 70000);
    this.skyHorizon = night ? [0.071, 0.11, 0.157] : [0.776, 0.824, 0.859];
    this.skyZenith = night ? [0.016, 0.027, 0.055] : [0.40, 0.55, 0.70];
    this.buildSky();
    {
      const pm = new THREE.PMREMGenerator(this.renderer);
      const env = new THREE.Scene();
      const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: night ? 'varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(vec3(0.06,0.08,0.11), vec3(0.02,0.03,0.05), clamp(h,0.0,1.0)), 1.0); }'
          : 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 sky = mix(vec3(0.78,0.83,0.86), vec3(0.36,0.52,0.70), clamp(h,0.0,1.0)); vec3 gnd = vec3(0.22,0.24,0.22); gl_FragColor = vec4(h > 0.0 ? sky : mix(vec3(0.6,0.65,0.68), gnd, clamp(-h*4.0,0.0,1.0)), 1.0); }' });
      env.add(new THREE.Mesh(new THREE.SphereGeometry(100, 24, 12), mat));
      S.environment = pm.fromScene(env, 0.02).texture;
      pm.dispose();
    }

    // terrain
    const step = this.low ? 2 : 1;
    const MW = Math.floor((H.w - 1) / step) + 1, MH = Math.floor((H.h - 1) / step) + 1;
    const tgeo = new THREE.PlaneGeometry(SPANX * ((MW - 1) * step) / (H.w - 1), SPANZ * ((MH - 1) * step) / (H.h - 1), MW - 1, MH - 1);
    tgeo.rotateX(-Math.PI / 2);
    tgeo.translate(-(SPANX - SPANX * ((MW - 1) * step) / (H.w - 1)) / 2, 0, -(SPANZ - SPANZ * ((MH - 1) * step) / (H.h - 1)) / 2);
    {
      const p = tgeo.attributes.position, uv = tgeo.attributes.uv;
      for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
        const k = j * MW + i;
        p.setY(k, H.a[(j * step) * H.w + i * step]);
        uv.setXY(k, (i * step) / (H.w - 1), 1 - (j * step) / (H.h - 1));
      }
      tgeo.computeVertexNormals();
    }
    this.tmat = new THREE.MeshStandardMaterial({ map: albedo, roughness: 1, metalness: 0, envMapIntensity: night ? 0.15 : 0.35 });
    this.mapU = { value: 0 }; this.nightU = { value: night ? 1 : 0 };
    const mapU = this.mapU, nightU = this.nightU;
    this.tmat.onBeforeCompile = (sh) => {
      sh.uniforms.uMap = mapU; sh.uniforms.uNight = nightU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vNW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvNW = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uMap;\nuniform float uNight;\nvarying vec3 vWPos;\nvarying vec3 vNW;')
        .replace('#include <opaque_fragment>', `#include <opaque_fragment>
        if (uMap > 0.002) {
          vec3 nW = normalize(vNW);
          float hs = clamp(dot(nW, normalize(vec3(-0.55, 0.62, -0.56))), 0.0, 1.0);
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          float hgt = vWPos.y;
          vec3 land = mix(vec3(0.028, 0.036, 0.040), vec3(0.070, 0.084, 0.088), smoothstep(0.015, 0.16, lum));
          land *= 0.45 + 1.3 * hs;
          float cl = hgt / 160.0;
          float fw = max(fwidth(cl), 1e-4);
          float line = 1.0 - smoothstep(0.0, fw * 1.3, abs(fract(cl - 0.5) - 0.5));
          float major = 1.0 - smoothstep(0.0, fw * 1.6, abs(fract(cl / 5.0 - 0.5) - 0.5) * 5.0);
          land += vec3(0.016, 0.020, 0.022) * line * smoothstep(1.5, 8.0, hgt) + vec3(0.02, 0.025, 0.027) * major * smoothstep(1.5, 8.0, hgt);
          vec3 sea = vec3(0.012, 0.034, 0.060);
          vec3 mc = mix(sea, land, smoothstep(-2.5, 0.5, hgt));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, mc, uMap);
        }`);
    };
    this.terrain = new THREE.Mesh(tgeo, this.tmat);
    S.add(this.terrain);
    progress(0.65);

    // far ring, sunk under the detailed terrain
    try {
      const fm = await (await fetch(base + 'far.json')).json();
      const [FH, ftex] = await Promise.all([loadHeights(base + 'farheight.png', fm.hoff, fm.hq), loadTexture(base + 'far.jpg', 4)]);
      const g = new THREE.PlaneGeometry((fm.X1 - fm.X0) * 1000, (fm.Y1 - fm.Y0) * 1000, FH.w - 1, FH.h - 1);
      g.rotateX(-Math.PI / 2);
      g.translate(((fm.X0 + fm.X1) / 2 - this.CX) * 1000, 0, ((fm.Y0 + fm.Y1) / 2 - this.CY) * 1000);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const xkm = p.getX(k) / 1000 + this.CX, ykm = p.getZ(k) / 1000 + this.CY;
        const inside = Math.min(xkm - T.X0, T.X1 - xkm, ykm - T.Y0, T.Y1 - ykm);
        const sink = inside > 0 ? 20 + Math.min(1, inside / 1.0) * 400 : 0;
        p.setY(k, FH.a[k] - sink);
      }
      g.computeVertexNormals();
      this.farMat = new THREE.MeshStandardMaterial({ map: ftex, roughness: 1, metalness: 0, envMapIntensity: 0.3 });
      this.farMat.onBeforeCompile = (sh) => {
        sh.uniforms.uMap = mapU;
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uMap;')
          .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.012, 0.016, 0.02), uMap);');
      };
      this.far = new THREE.Mesh(g, this.farMat);
      S.add(this.far);
    } catch (e) { console.warn('far ring', e); }
    progress(0.8);

    // sea and deep floor
    const seaN = (() => {
      const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
      const g = c.getContext('2d'); const img = g.createImageData(s, s);
      const W_ = [[3, 1, 0.9], [5, -2, 0.6], [-4, 7, 0.4], [11, 3, 0.25], [-9, -13, 0.18], [17, -5, 0.12]];
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        let dx = 0, dy = 0;
        for (const [a, b, amp] of W_) { const ph = 2 * Math.PI * (a * x + b * y) / s; dx += amp * a * Math.cos(ph); dy += amp * b * Math.cos(ph); }
        const n = new THREE.Vector3(-dx * 0.04, -dy * 0.04, 1).normalize();
        const o = (y * s + x) * 4;
        img.data[o] = (n.x * 0.5 + 0.5) * 255; img.data[o + 1] = (n.y * 0.5 + 0.5) * 255; img.data[o + 2] = (n.z * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1800, 1800);
      return t;
    })();
    this.seaMat = new THREE.MeshStandardMaterial({ color: night ? 0x060f18 : 0x0c2638, roughness: 0.22, metalness: 0, transparent: true, opacity: 0.62,
      normalMap: seaN, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: night ? 0.4 : 1.0 });
    this.seaN = seaN;
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(600000, 600000, 8, 8).rotateX(-Math.PI / 2), this.seaMat);
    this.sea.position.y = -1.5; S.add(this.sea);
    this.floorMat = new THREE.MeshBasicMaterial({ color: night ? 0x050b12 : 0x0f2c42 });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(600000, 600000, 4, 4).rotateX(-Math.PI / 2), this.floorMat);
    this.floor.position.y = -170; S.add(this.floor);

    // buildings and, at night, town lights
    try {
      const B = await (await fetch(base + 'buildings.json')).json();
      const bgeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      const bmat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, envMapIntensity: 0.4 });
      const im = new THREE.InstancedMesh(bgeo, bmat, B.length);
      const m = new THREE.Matrix4(), col = new THREE.Color();
      const lights = [];
      B.forEach((b, k) => {
        const [x, y, w, d, h, rot, cr, cg, cb] = b;
        const c = Math.cos(rot), s = Math.sin(rot);
        const gy = this.groundAt(x, y);
        const hh = h * (T.bvex || 1.25);
        m.set(c * w, 0, -s * d, this.wx(x), 0, hh, 0, gy - 1, s * w, 0, c * d, this.wz(y), 0, 0, 0, 1);
        im.setMatrixAt(k, m);
        col.setRGB(cr / 255, cg / 255, cb / 255, THREE.SRGBColorSpace);
        im.setColorAt(k, col);
        if (night && hash(k + 17) < 0.35) lights.push(this.wx(x), gy + hh + 2, this.wz(y));
      });
      im.instanceMatrix.needsUpdate = true;
      this.buildings = im; S.add(im);
      if (lights.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(lights, 3));
        this.lights = new THREE.Points(g, new THREE.PointsMaterial({ map: this.texLight, size: 34, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd9a0 }));
        S.add(this.lights);
      }
    } catch (e) { console.warn('buildings', e); }

    // effects layer
    this.fxGroup = new THREE.Group(); S.add(this.fxGroup);
    this.unitGroup = new THREE.Group(); S.add(this.unitGroup);
    progress(1);
    this.home();
    this.ready = true;
  }

  buildSky() {
    const hz = this.skyHorizon, zn = this.skyZenith;
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
      uniforms: { uH: { value: new THREE.Vector3(...hz) }, uZ: { value: new THREE.Vector3(...zn) }, uMap: { value: 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: `uniform vec3 uH; uniform vec3 uZ; uniform float uMap; varying vec3 vD;
        void main(){ float h = normalize(vD).y; vec3 c = mix(uH, uZ, pow(clamp(h, 0.0, 1.0), 0.55));
          c = mix(c, uH, smoothstep(0.03, -0.01, h)); c = mix(c, vec3(0.03, 0.04, 0.05), uMap); gl_FragColor = vec4(c, 1.0); }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    this.scene.add(this.sky);
  }

  // ---------------- coordinates
  wx(xkm) { return (xkm - this.CX) * 1000; }
  wz(ykm) { return (ykm - this.CY) * 1000; }
  kmx(wx) { return wx / 1000 + this.CX; }
  kmy(wz) { return wz / 1000 + this.CY; }
  groundAt(xkm, ykm) {
    const T = this.T, H = this.H;
    if (!H) return 0;
    const fx = (xkm - T.X0) / (T.X1 - T.X0) * (H.w - 1), fy = (ykm - T.Y0) / (T.Y1 - T.Y0) * (H.h - 1);
    const i = clamp(Math.floor(fx), 0, H.w - 2), j = clamp(Math.floor(fy), 0, H.h - 2);
    const tx = clamp(fx - i, 0, 1), ty = clamp(fy - j, 0, 1), a = H.a;
    const v = (a[j * H.w + i] * (1 - tx) + a[j * H.w + i + 1] * tx) * (1 - ty) + (a[(j + 1) * H.w + i] * (1 - tx) + a[(j + 1) * H.w + i + 1] * tx) * ty;
    return v;
  }
  surfaceAt(xkm, ykm) { return Math.max(0, this.groundAt(xkm, ykm)); }
  altOf(e) {
    if (!e.band) return 0;
    const a = ALT[e.type] != null ? ALT[e.type] : BAND_ALT[e.band] || 300;
    return a + (hash(e.id) - 0.5) * a * 0.12;
  }

  // ---------------- camera
  resize(w, h) {
    this.sizeW = w; this.sizeH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }
  home() {
    const d = this.def;
    const m = d.menace, s = (d.sites && d.sites[0]) || { x: m[0], y: m[1] };
    const cx = (m[0] + s.x) / 2 + 2, cy = (m[1] + s.y) / 2 - 4.5;
    this.view.tx = this.wx(cx); this.view.tz = this.wz(cy);
    this.view.yaw = 0; this.view.pitch = 0.44; this.view.dist = 26000;
    this.view.ty = this.surfaceAt(cx, cy);
    this.goal = null;
  }
  setMode(mode) {
    this.view.mode = mode;
    if (mode === 'map') this.goal = { pitch: Math.PI / 2 - 0.001, yaw: 0, dist: Math.max(this.view.dist, 36000) };
    else this.goal = { pitch: 0.44, dist: Math.min(this.view.dist, 30000) };
  }
  focus(xkm, ykm, dist) {
    this.goal = Object.assign(this.goal || {}, { tx: this.wx(xkm), tz: this.wz(ykm) });
    if (dist) this.goal.dist = dist;
  }
  orbit(dyaw, dpitch) {
    if (this.view.mode === 'map') return;
    this.view.yaw += dyaw;
    this.view.pitch = clamp(this.view.pitch + dpitch, 0.2, 1.52);
    if (this.goal) { delete this.goal.yaw; delete this.goal.pitch; }
  }
  zoom(f, sx, sy) {
    const v = this.view;
    const nd = clamp(v.dist * f, 1800, 95000);
    // keep the ground point under the cursor fixed
    if (sx != null) {
      const g = this.pickGround(sx, sy);
      if (g) {
        const k = 1 - nd / v.dist;
        v.tx += (this.wx(g[0]) - v.tx) * k; v.tz += (this.wz(g[1]) - v.tz) * k;
      }
    }
    v.dist = nd;
    if (this.goal) { delete this.goal.dist; delete this.goal.tx; delete this.goal.tz; }
    this.clampTarget();
  }
  panPixels(dx, dy) {
    const v = this.view;
    const s = (v.dist * 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.sizeH;
    const c = Math.cos(v.yaw), sn = Math.sin(v.yaw);
    const fwd = 1 / Math.max(0.35, Math.sin(v.pitch));
    // screen right = (cos yaw, sin yaw) in x/z, screen up = forward (sin yaw, -cos yaw)
    v.tx += (-dx * c + dy * sn * fwd) * s;
    v.tz += (-dx * sn - dy * c * fwd) * s;
    if (this.goal) { delete this.goal.tx; delete this.goal.tz; }
    this.clampTarget();
  }
  panGround(a, b) {
    // drag: the ground point a (km) should end up under the cursor that now shows b
    const v = this.view;
    v.tx += this.wx(a[0]) - this.wx(b[0]); v.tz += this.wz(a[1]) - this.wz(b[1]);
    if (this.goal) { delete this.goal.tx; delete this.goal.tz; }
    this.clampTarget();
  }
  panKeys(fx, fy, dt) {
    const v = this.view, sp = v.dist * 0.9 * dt;
    const c = Math.cos(v.yaw), s = Math.sin(v.yaw);
    v.tx += (fx * c - fy * s) * sp; v.tz += (fx * s + fy * c) * sp;
    if (this.goal) { delete this.goal.tx; delete this.goal.tz; }
    this.clampTarget();
  }
  clampTarget() {
    const v = this.view;
    v.tx = clamp(v.tx, this.wx(-6), this.wx(46)); v.tz = clamp(v.tz, this.wz(-8), this.wz(34));
  }
  updateCamera(dt) {
    const v = this.view, g = this.goal;
    const k = 1 - Math.exp(-dt * 5);
    if (g) {
      for (const key of ['tx', 'tz', 'dist', 'pitch']) if (g[key] != null) { v[key] = lerp(v[key], g[key], k); if (Math.abs(v[key] - g[key]) < (key === 'pitch' ? 0.001 : 2)) { v[key] = g[key]; delete g[key]; } }
      if (g.yaw != null) {
        let d = g.yaw - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        v.yaw += d * k; if (Math.abs(d) < 0.001) { v.yaw = g.yaw; delete g.yaw; }
      }
      if (!Object.keys(g).length) this.goal = null;
    }
    v.mapK = lerp(v.mapK, v.mode === 'map' ? 1 : 0, 1 - Math.exp(-dt * 6));
    const gy = this.surfaceAt(this.kmx(v.tx), this.kmy(v.tz));
    v.ty = lerp(v.ty, gy, 1 - Math.exp(-dt * 3));
    const cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
    const cam = this.camera;
    cam.position.set(v.tx - Math.sin(v.yaw) * cp * v.dist, v.ty + sp * v.dist, v.tz + Math.cos(v.yaw) * cp * v.dist);
    // never under the ground
    const under = this.surfaceAt(this.kmx(cam.position.x), this.kmy(cam.position.z)) + 150;
    if (cam.position.y < under) cam.position.y = under;
    if (v.pitch < 1.5) cam.up.set(0, 1, 0);
    else cam.up.set(Math.sin(v.yaw), 0, -Math.cos(v.yaw));
    cam.lookAt(v.tx, v.ty, v.tz);
    cam.near = clamp(v.dist * 0.01, 20, 400); cam.far = 320000;
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    this.focal = (this.sizeH / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    // haze scales with height so a high view still shows the whole area
    const alt = cam.position.y;
    this.scene.fog.near = 9000 + alt * 0.4; this.scene.fog.far = 70000 + alt * 2.2;
    if (v.mapK > 0.01) { this.scene.fog.near = lerp(this.scene.fog.near, 200000, v.mapK); this.scene.fog.far = lerp(this.scene.fog.far, 300000, v.mapK); }
    this.sky.position.copy(cam.position);
    this.mapU.value = v.mapK; this.sky.material.uniforms.uMap.value = v.mapK;
    this.seaMat.opacity = lerp(0.62, 0.97, v.mapK);
    this.seaMat.envMapIntensity = lerp(this.night ? 0.4 : 1.0, 0.05, v.mapK);
    this.seaMat.color.setHex(v.mapK > 0.5 ? 0x04101a : (this.night ? 0x060f18 : 0x0c2638));
    if (this.buildings) this.buildings.visible = v.mapK < 0.6;
    if (this.lights) this.lights.visible = v.mapK < 0.6;
  }

  // ---------------- projection and picking
  project(x, y, z) {
    const t = this.tmp.set(x, y, z).project(this.camera);
    return { x: (t.x * 0.5 + 0.5) * this.sizeW, y: (-t.y * 0.5 + 0.5) * this.sizeH, z: t.z, on: t.z < 1 && t.z > -1 };
  }
  projectKm(xkm, ykm, alt = 0) { return this.project(this.wx(xkm), this.surfaceAt(xkm, ykm) + alt, this.wz(ykm)); }
  ray(sx, sy) {
    const ndc = new THREE.Vector3((sx / this.sizeW) * 2 - 1, -(sy / this.sizeH) * 2 + 1, 0.5);
    ndc.unproject(this.camera);
    const o = this.camera.position.clone(), d = ndc.sub(o).normalize();
    return { o, d };
  }
  pickGround(sx, sy) {
    const { o, d } = this.ray(sx, sy);
    if (d.y > -0.01 && o.y < 3000) return null;
    let t = 0, prev = 0, maxT = 400000;
    let above = o.y - this.surfaceAt(this.kmx(o.x), this.kmy(o.z));
    while (t < maxT) {
      const stepT = Math.max(25, above * 0.5);
      prev = t; t += stepT;
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      above = y - this.surfaceAt(this.kmx(x), this.kmy(z));
      if (above <= 0) {
        let lo = prev, hi = t;
        for (let i = 0; i < 18; i++) {
          const m = (lo + hi) / 2, X = o.x + d.x * m, Y = o.y + d.y * m, Z = o.z + d.z * m;
          if (Y - this.surfaceAt(this.kmx(X), this.kmy(Z)) > 0) lo = m; else hi = m;
        }
        const X = o.x + d.x * hi, Z = o.z + d.z * hi;
        return [this.kmx(X), this.kmy(Z)];
      }
      if (y < -200) break;
    }
    return null;
  }
  // ground footprint of the screen (for the overview map)
  footprint() {
    const pts = [];
    const W = this.sizeW, H = this.sizeH;
    // trace the left edge down, the bottom edge across, the right edge up, the top edge back; skip sky
    const edge = [];
    for (let i = 0; i <= 6; i++) edge.push([0, H * i / 6]);
    for (let i = 1; i <= 6; i++) edge.push([W * i / 6, H]);
    for (let i = 5; i >= 0; i--) edge.push([W, H * i / 6]);
    for (let i = 5; i >= 1; i--) edge.push([W * i / 6, 0]);
    for (const [sx, sy] of edge) {
      const g = this.pickGround(sx, sy);
      if (g) pts.push([clamp(g[0], -8, 48), clamp(g[1], -8, 34)]);
    }
    return pts;
  }

  // ---------------- units
  protoFor(art, side) {
    const key = art + ':' + side;
    let p = this.protos.get(key);
    if (!p) { p = proto(art, side); this.protos.set(key, p); }
    return p;
  }
  makeObj(art, side) {
    const p = this.protoFor(art, side);
    const g = p.g.clone(true);
    const wrap = new THREE.Group(); wrap.add(g);
    wrap.rotation.order = 'YXZ';
    this.unitGroup.add(wrap);
    return { g: wrap, inner: g, art, span: p.span, px: p.px, ground: !!p.ground, tall: p.tall || 0, side, seen: 0, bank: 0, lastHdg: null };
  }
  scaleFor(o, pos) {
    const dist = this.camera.position.distanceTo(pos);
    const want = o.px * this.uiScale * dist / this.focal / o.span;
    const maxK = o.ground ? 60 : 140;
    return clamp(want, 1, maxK);
  }
  // visible in the 3D view: friendlies, and hostiles or neutrals that are identified and currently held
  shown(e) {
    if (e.side === 'f') return e.T.kind !== 'site';
    const k = e.trk;
    return !!(k && k.det && k.known && !k.esm && k.unc < 0.25);
  }
  sync(sim, alpha, dtReal, ui) {
    if (!this.ready) return;
    const frame = (this.frameNo = (this.frameNo || 0) + 1);
    const recs = this.recs = [];
    const camPos = this.camera.position;
    for (const e of sim.ents) {
      if (!e.alive) continue;
      const vis = e.side === 'f' || (e.trk && e.trk.det);
      if (!vis) continue;
      // interpolated position between the last two sim steps
      const fx = e._px != null ? lerp(e._px, e.x, alpha) : e.x, fy = e._py != null ? lerp(e._py, e.y, alpha) : e.y;
      let px = fx, py = fy;
      if (e.side !== 'f' && e.trk) {
        const k = e.trk;
        if (!(k.n > 0)) { px = k.ex; py = k.ey; }
      }
      const alt = this.altOf(e);
      const gy = this.surfaceAt(px, py);
      const wpos = new THREE.Vector3(this.wx(px), gy + alt, this.wz(py));
      let o = this.objs.get(e.id);
      const show3d = this.shown(e) && this.view.mapK < 0.85;
      if (show3d) {
        const art = e.side === 'f' ? ART_FOR[e.type] : e.T.art === 'quad' && e.type === 'gnat' ? 'quad' : e.T.art;
        if (!o || o.art !== art) { if (o) this.unitGroup.remove(o.g); o = this.makeObj(art || 'fixedwing', e.side); this.objs.set(e.id, o); }
        o.seen = frame;
        const s = this.scaleFor(o, wpos);
        o.g.scale.setScalar(s);
        o.g.position.copy(wpos);
        if (o.ground) o.g.position.y = gy + (e.isTruck || e.type === 'team' ? 0 : 0);
        // heading: nose along the velocity (sim heading is atan2(dy, dx) with y south)
        let hdg = e.hdg != null ? e.hdg : 0;
        if (e._ph != null) { let d = hdg - e._ph; d = Math.atan2(Math.sin(d), Math.cos(d)); hdg = e._ph + d * alpha; }
        if (o.ground && !e.vmax) hdg = (hash(e.id + 3) - 0.5) * 3;
        if (o.lastHdg != null && !o.ground) {
          let d = hdg - o.lastHdg; d = Math.atan2(Math.sin(d), Math.cos(d));
          const rate = d / Math.max(1e-3, dtReal);
          o.bank = lerp(o.bank, clamp(-rate * 0.9, -0.7, 0.7), 1 - Math.exp(-dtReal * 4));
        }
        o.lastHdg = hdg;
        o.g.rotation.y = -hdg;
        o.g.rotation.x = o.ground ? 0 : o.bank;
        o.g.visible = true;
      } else if (o) { o.g.visible = false; }
      const sp = this.project(wpos.x, wpos.y, wpos.z);
      const sg = alt > 0 ? this.project(wpos.x, gy, wpos.z) : sp;
      let rpx = 0;
      if (show3d && o) rpx = (o.span * o.g.scale.x) * this.focal / Math.max(1, camPos.distanceTo(wpos));
      recs.push({ e, x: px, y: py, alt, gy, sx: sp.x, sy: sp.y, sz: sp.z, on: sp.on, gx: sg.x, gyS: sg.y, model: show3d, rpx });
    }
    for (const [id, o] of this.objs) if (o.seen !== frame) { this.unitGroup.remove(o.g); this.objs.delete(id); }
    this.syncShots(sim, alpha, frame);
    this.syncFx(sim, dtReal);
  }

  shotAlt(s, sim) {
    if (s._a0 == null) {
      const from = sim.byId(s.from);
      s._a0 = from ? this.altOf(from) + (from.band ? 0 : 6) : 6;
      s._cruise = SHOT_ALT[s.w] || 0;
    }
    const tgt = s.tgtShot ? sim.shotById(s.tgtShot) : sim.byId(s.tgt);
    let a1 = s._cruise || 0;
    if (tgt) a1 = tgt.W ? (tgt._alt || 150) : this.altOf(tgt);
    const remain = tgt ? Math.hypot(tgt.x - s.x, tgt.y - s.y) : (s.tx != null ? Math.hypot(s.tx - s.x, s.ty - s.y) : 1);
    const f = clamp(s.traveled / Math.max(1e-3, s.traveled + remain), 0, 1);
    let a;
    if (s.W.kind === 'area') a = lerp(s._a0, a1, f) + Math.sin(f * Math.PI) * Math.min(1800, (s.traveled + remain) * 160);
    else if (s.W.kind === 'loiter') a = tgt ? lerp(s._cruise, a1, clamp((f - 0.6) / 0.4, 0, 1)) : s._cruise;
    else if (s._cruise) a = f < 0.15 ? lerp(s._a0, s._cruise, f / 0.15) : f > 0.85 ? lerp(s._cruise, a1, (f - 0.85) / 0.15) : s._cruise;
    else a = lerp(s._a0, a1, 1 - Math.pow(1 - f, 1.6));
    s._alt = a;
    return a;
  }
  syncShots(sim, alpha, frame) {
    this.shotRecs = [];
    for (const s of sim.shots) {
      if (s.dead) continue;
      const x = s._px != null ? lerp(s._px, s.x, alpha) : s.x, y = s._py != null ? lerp(s._py, s.y, alpha) : s.y;
      const alt = this.shotAlt(s, sim);
      const gy = this.surfaceAt(x, y);
      const wpos = new THREE.Vector3(this.wx(x), gy + alt, this.wz(y));
      const art = SHOT_ART[s.w];
      let o = this.shotObjs.get(s.id);
      if (art && this.view.mapK < 0.85) {
        if (!o) { o = this.makeObj(art, s.side === 'f' ? 'f' : 'h'); o.px = Math.round(o.px * 0.75); this.shotObjs.set(s.id, o); }
        o.seen = frame;
        o.g.scale.setScalar(this.scaleFor(o, wpos));
        o.g.position.copy(wpos);
        o.g.rotation.y = -(s.hdg || 0);
        o.g.visible = true;
      } else if (o) o.g.visible = false;
      const sp = this.project(wpos.x, wpos.y, wpos.z);
      this.shotRecs.push({ s, x, y, alt, sx: sp.x, sy: sp.y, on: sp.on });
    }
    for (const [id, o] of this.shotObjs) if (o.seen !== frame) { this.unitGroup.remove(o.g); this.shotObjs.delete(id); }
  }

  // ---------------- effects
  sprite(tex, blend, color, opacity) {
    const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: blend, fog: true });
    const s = new THREE.Sprite(m); this.fxGroup.add(s); return s;
  }
  syncFx(sim, dt) {
    const now = performance.now() / 1000;
    for (const f of sim.fx) {
      if (this.fxSeen.has(f)) continue;
      this.fxSeen.add(f);
      if (sim.t - f.t0 > 3) continue;
      const alt = f.band ? (BAND_ALT[f.band] || 300) : 0;
      const gy = this.surfaceAt(f.x, f.y);
      const p = new THREE.Vector3(this.wx(f.x), gy + alt + (f.band ? 0 : 8), this.wz(f.y));
      const big = f.kind === 'boom' ? 1 : f.kind === 'burst' ? 0.8 : f.kind === 'pop' ? 0.55 : 0.35;
      const R = Math.max(60, (f.r || 0.2) * 1000) * big;
      const parts = [];
      if (f.kind !== 'tracer') {
        parts.push({ s: this.sprite(this.texGlow, THREE.AdditiveBlending, 0xffffff, 1), kind: 'flash', p: p.clone(), r0: R * 0.2, r1: R * 1.6, life: f.kind === 'boom' ? 0.9 : 0.6 });
        const nSmoke = f.kind === 'boom' ? 5 : f.kind === 'burst' ? 6 : f.kind === 'pop' ? 2 : 1;
        for (let i = 0; i < nSmoke; i++) {
          const a = hash(i * 31 + Math.floor(f.x * 1000)) * Math.PI * 2, d = (f.kind === 'burst' ? f.r * 1000 * 0.7 : R * 0.25) * hash(i * 17 + 5);
          const q = p.clone().add(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d));
          const dark = f.band ? 0x8a8e90 : f.kind === 'boom' ? 0x3b3a38 : 0x6f6c66;
          parts.push({ s: this.sprite(this.texSmoke, THREE.NormalBlending, dark, 0), kind: 'smoke', p: q, r0: R * 0.3, r1: R * (1.2 + hash(i) * 0.8), life: (f.dur || 8) * 0.9 + i * 0.4, delay: 0.08 * i, rise: f.band ? 15 : 70 });
          if (f.kind === 'burst') parts.push({ s: this.sprite(this.texGlow, THREE.AdditiveBlending, 0xffffff, 1), kind: 'flash', p: q.clone(), r0: R * 0.1, r1: R * 0.7, life: 0.5, delay: 0.12 * i });
        }
      }
      this.fxLive.push({ t0: now, parts });
    }
    // advance live effects in real time, scaled by the game speed so a paused game holds its smoke
    const k = this.fxSpeed != null ? this.fxSpeed : 1;
    for (const fx of this.fxLive) {
      fx.age = (fx.age || 0) + dt * (k > 0 ? Math.min(4, k) : (fx.age || 0) < 0.3 ? 1 : 0.04);
      for (const pt of fx.parts) {
        const a = fx.age - (pt.delay || 0);
        const u = clamp(a / pt.life, 0, 1);
        const s = pt.s;
        if (a < 0) { s.visible = false; continue; }
        s.visible = u < 1;
        const camD = this.camera.position.distanceTo(pt.p);
        const minR = 7 * camD / this.focal * this.uiScale;
        if (pt.kind === 'flash') {
          const r = Math.max(minR, lerp(pt.r0, pt.r1, Math.sqrt(u)));
          s.scale.set(r, r, 1); s.position.copy(pt.p);
          s.material.opacity = (1 - u) * (1 - u);
        } else {
          const r = Math.max(minR * 1.4, lerp(pt.r0, pt.r1, 1 - Math.pow(1 - u, 2)));
          s.scale.set(r, r, 1);
          s.position.set(pt.p.x, pt.p.y + (pt.rise || 0) * a, pt.p.z);
          s.material.opacity = 0.75 * Math.min(1, u * 8) * (1 - u);
        }
      }
      fx.done = fx.parts.every((pt) => fx.age - (pt.delay || 0) > pt.life);
    }
    for (const fx of this.fxLive) if (fx.done) for (const pt of fx.parts) { this.fxGroup.remove(pt.s); pt.s.material.dispose(); }
    this.fxLive = this.fxLive.filter((f) => !f.done);
  }

  render() {
    if (!this.ready) return;
    if (this.seaN) this.seaN.offset.x = (performance.now() / 1000 * 0.004) % 1;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.ready = false;
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); } }
    });
    if (this.scene.environment) this.scene.environment.dispose();
    this.renderer.dispose();
  }
}
