// Kill Web: the hangar's line drawing. The same stylized models the battlefield uses, drawn as edges on a drafting grid.
import { buildModel, THREE } from './world.js';

const PROD_ART = { menace: 'menace', sentry: 'sentry', wisp: 'sentry', ghost: 'heli', eagleeye: 'team', omen: 'tailsitter', anvil: 'quad', roadrunner: 'delta',
  pulsar: 'pulsar', bolt: 'quad', altius: 'smallwing', barracuda: 'missile', fury: 'jet', thunder: 'tiltrotor', srm: 'missile' };

export class Blueprint {
  constructor(canvas) {
    this.c = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.yaw = -0.7; this.pitch = 0.42; this.spin = true; this.drag = null;
    const grid = new THREE.GridHelper(400, 100, 0x2a3a46, 0x1a252d); grid.material.transparent = true; grid.material.opacity = 0.55; this.scene.add(grid); this.grid = grid;
    canvas.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch }; this.spin = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', (e) => { if (!this.drag) return; this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.008; this.pitch = Math.max(-0.2, Math.min(1.3, this.drag.pitch + (e.clientY - this.drag.y) * 0.006)); });
    canvas.addEventListener('pointerup', () => { this.drag = null; });
    this.alive = true;
    const loop = () => { if (!this.alive) return; this.frame(); this.raf = requestAnimationFrame(loop); };
    loop();
  }
  show(pid) {
    while (this.group.children.length) { const o = this.group.children.pop(); o.traverse((m) => { if (m.geometry) m.geometry.dispose(); }); }
    const art = PROD_ART[pid] || 'fixedwing';
    const { g, span } = buildModel(art, 'f');
    g.updateMatrixWorld(true);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xd3dce3, transparent: true, opacity: 0.85 });
    const faceMat = new THREE.MeshBasicMaterial({ color: 0x0b1116, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const root = new THREE.Group();
    g.traverse((m) => {
      if (!m.isMesh) return;
      const geo = m.geometry.clone(); geo.applyMatrix4(m.matrixWorld);
      const isDisc = m.material && m.material.transparent;
      if (!isDisc) root.add(new THREE.Mesh(geo, faceMat));
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 24), isDisc ? new THREE.LineBasicMaterial({ color: 0x6cc6ff, transparent: true, opacity: 0.45 }) : lineMat);
      root.add(e);
    });
    const box = new THREE.Box3().setFromObject(root), size = new THREE.Vector3(), ctr = new THREE.Vector3();
    box.getSize(size); box.getCenter(ctr);
    root.position.sub(ctr);
    root.position.y += size.y / 2;
    this.group.add(root);
    this.size = Math.max(size.x, size.z, size.y * 1.4, span * 0.8);
    this.grid.scale.setScalar(this.size / 40);
    this.grid.position.y = 0;
    this.lift = size.y / 2;
  }
  frame() {
    const w = this.c.clientWidth, h = this.c.clientHeight;
    if (!w || !h) return;
    if (this.w !== w || this.h !== h) { this.w = w; this.h = h; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
    if (this.spin) this.yaw += 0.0035;
    const d = (this.size || 10) * 2.3 / Math.min(1, this.cam.aspect * 0.9);
    this.cam.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * d, Math.sin(this.pitch) * d + (this.lift || 0), Math.cos(this.yaw) * Math.cos(this.pitch) * d);
    this.cam.lookAt(0, (this.lift || 0) * 0.9 - (this.size || 10) * 0.12, 0);
    this.r.render(this.scene, this.cam);
  }
  dispose() { this.alive = false; cancelAnimationFrame(this.raf); this.r.dispose(); }
}
