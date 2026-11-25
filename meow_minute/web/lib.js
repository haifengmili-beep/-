// 共享: 工具函数 / 贴图 / 粉色方块猫 (取自 other_world/web/scene.js)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
// ------------------------------------------------------------------ helpers
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
export const smoother = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
export const lerp = (a, b, k) => a + (b - a) * k;
export const easeOutBack = (x, s = 1.7) => { x = clamp(x); return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2; };
export function kf(t, keys, ease = smoother) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1] = keys[i + 1];
    if (t <= t1) {
      const k = ease((t - t0) / (t1 - t0));
      if (Array.isArray(v0)) return v0.map((a, j) => lerp(a, v1[j], k));
      return lerp(v0, v1, k);
    }
  }
  return keys[keys.length - 1][1];
}
export const win = (t, a, b, f = 0.4) => smooth((t - a) / f) * (1 - smooth((t - (b - f)) / f));
export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
// ------------------------------------------------------------------ textures & materials
export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData = { canvas: c, g };
  return t;
}
export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...o });
export const rbox = (w, h, d, r = 0.06, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
export function mesh(geo, mat, cast = true, recv = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m; }

export const glowTex = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
export const starTex = canvasTex(128, 128, (g) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 22);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  g.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[128, 6], [6, 128]]) {
    const l = g.createLinearGradient(w > h ? 0 : 64, w > h ? 64 : 0, w > h ? 128 : 64, w > h ? 64 : 128);
    l.addColorStop(0, 'rgba(255,255,255,0)'); l.addColorStop(0.5, 'rgba(255,255,255,0.9)'); l.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = l; g.fillRect(64 - w / 2, 64 - h / 2, w, h);
  }
});

// ------------------------------------------------------------------ sparkles (points)
export function makeSparkles(n, box, color, size, seed) {
  const r = rng(seed), pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (r() - 0.5) * box[0]; pos[i * 3 + 1] = r() * box[1]; pos[i * 3 + 2] = (r() - 0.5) * box[2];
    ph[i] = r() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uTex: { value: starTex }, uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uAlpha: { value: 1 }, uRise: { value: 0.12 }, uH: { value: box[1] } },
    vertexShader: `attribute float phase; uniform float uTime, uSize, uRise, uH; varying float vTw;
      void main(){ vec3 p = position; p.y = mod(p.y + uTime*uRise + phase*0.01, uH);
        p.x += sin(uTime*0.6 + phase)*0.08; p.z += cos(uTime*0.5 + phase)*0.08;
        vTw = 0.35 + 0.65*pow(0.5+0.5*sin(uTime*2.2 + phase*3.0), 2.0);
        vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
        gl_PointSize = uSize * (0.6+0.4*vTw) * (300.0 / -mv.z); }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec3 uColor; uniform float uAlpha; varying float vTw;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(uColor*1.6, t.a*vTw*uAlpha); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(geo, mat); p.frustumCulled = false;
  return p;
}

// ------------------------------------------------------------------ the cat
export const CAT = { body: '#f6b8cb', head: '#f9c4d4', ear: '#ee8aab', earIn: '#fbd0dd', paw: '#fbd3df', spot: '#e892b1' };
export function drawFace(g, s) {
  const w = 500, h = 400;
  g.clearRect(0, 0, w, h);
  // blush
  g.fillStyle = 'rgba(240,110,150,0.55)';
  for (const x of [88, 352]) { g.beginPath(); g.roundRect(x, 232, 62, 26, 13); g.fill(); }
  // eyes
  for (const [i, ex] of [[0, 150], [1, 350]]) {
    const ey = 165;
    const open = s.open, happy = s.happy;
    if (open > 0.05 && happy < 0.5) {
      const eh = 76 * open;
      g.fillStyle = '#1a1416';
      g.beginPath(); g.roundRect(ex - 38, ey - eh / 2 + (1 - open) * 18 + s.lookY * 10, 76, eh, 10); g.fill();
      if (open > 0.45) {
        g.fillStyle = '#ffffff';
        const sh = s.shine;
        g.beginPath(); g.roundRect(ex - 28 + s.look * 8, ey - 30 + s.lookY * 22, 24 + sh * 4, 24 + sh * 4, 5); g.fill();
        g.beginPath(); g.roundRect(ex + 10 + s.look * 8, ey + 10 + s.lookY * 14, 12, 12, 3); g.fill();
        if (sh > 0.1) { g.globalAlpha = sh; g.beginPath(); g.arc(ex + 20 + s.look * 8, ey - 18, 6, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      }
    } else if (happy >= 0.5) {
      g.strokeStyle = '#1a1416'; g.lineWidth = 15; g.lineCap = 'round';
      g.beginPath(); g.arc(ex, ey + 22, 32, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    } else {
      g.strokeStyle = '#1a1416'; g.lineWidth = 13; g.lineCap = 'round';
      g.beginPath(); g.arc(ex, ey - 4, 30, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    }
  }
  // tear
  if (s.tear > 0.01) {
    g.save(); g.globalAlpha = clamp(s.tear * 1.5);
    const tx = 388, ty = 205 + s.tear * 46;
    const gr = g.createLinearGradient(tx, ty - 20, tx, ty + 20);
    gr.addColorStop(0, '#d9f1ff'); gr.addColorStop(1, '#8fd0ff');
    g.fillStyle = gr; g.beginPath(); g.moveTo(tx, ty - 22);
    g.quadraticCurveTo(tx + 16, ty + 2, tx, ty + 14); g.quadraticCurveTo(tx - 16, ty + 2, tx, ty - 22); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(tx - 4, ty + 2, 4, 0, 7); g.fill(); g.restore();
  }
  // nose + muzzle + mouth
  g.fillStyle = '#f4b8a6'; g.beginPath(); g.roundRect(212, 236, 76, 42, 12); g.fill();
  g.fillStyle = '#ee6c93'; g.beginPath(); g.roundRect(228, 226, 44, 20, 8); g.fill();
  const m = s.mouth;
  if (m > 0.04) {
    g.fillStyle = '#b84f72'; g.beginPath(); g.roundRect(250 - 14 - m * 10, 266, 28 + m * 20, 6 + m * 44, 12 + m * 8); g.fill();
    g.fillStyle = '#f28aa6'; g.beginPath(); g.roundRect(250 - 9 - m * 6, 266 + m * 28, 18 + m * 12, 4 + m * 14, 6); g.fill();
  }
}

export function makeCat() {
  const root = new THREE.Group();
  const bodyMat = std(CAT.body, { emissive: new THREE.Color('#f6b8cb'), emissiveIntensity: 0.12 });
  const headMat = std(CAT.head, { emissive: new THREE.Color('#f9c4d4'), emissiveIntensity: 0.12 });
  const earMat = std(CAT.ear, { emissive: new THREE.Color(CAT.ear), emissiveIntensity: 0.1 });
  const pawMat = std(CAT.paw, { emissive: new THREE.Color(CAT.paw), emissiveIntensity: 0.12 });

  const bodyPivot = new THREE.Group(); root.add(bodyPivot);
  const body = mesh(rbox(0.92, 0.88, 0.78, 0.1), bodyMat); body.position.y = 0.5; bodyPivot.add(body);
  // body spots (ring decals)
  const spotTex = canvasTex(256, 256, (g) => {
    g.strokeStyle = CAT.spot; g.lineWidth = 9;
    for (const [x, y, r] of [[95, 120, 34], [168, 96, 26], [150, 178, 40], [70, 196, 20]]) { g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); }
  });
  const spots = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.74), new THREE.MeshStandardMaterial({ map: spotTex, transparent: true, roughness: 0.8 }));
  spots.position.set(0, 0.47, 0.392); bodyPivot.add(spots);
  // haunches & front legs
  for (const sx of [-1, 1]) {
    const h = mesh(rbox(0.3, 0.36, 0.56, 0.1), bodyMat); h.position.set(sx * 0.4, 0.18, -0.02); bodyPivot.add(h);
    const l = mesh(rbox(0.22, 0.22, 0.3, 0.07), pawMat); l.position.set(sx * 0.2, 0.11, 0.36); bodyPivot.add(l);
  }
  // tail
  const tail = new THREE.Group(); tail.position.set(0.18, 0.18, -0.38); bodyPivot.add(tail);
  let seg = tail; const tailSegs = [];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Group(); s.position.set(0, i === 0 ? 0 : 0.2, 0);
    const m = mesh(rbox(0.16, 0.24, 0.16, 0.06), i === 4 ? earMat : bodyMat); m.position.y = 0.1; s.add(m);
    seg.add(s); seg = s; tailSegs.push(s);
  }
  // arms (pivot at shoulder) — 只在需要时抬起
  const arms = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.3, 0.72, 0.3); bodyPivot.add(piv);
    const a = mesh(rbox(0.2, 0.46, 0.2, 0.08), pawMat); a.position.y = -0.2; piv.add(a);
    arms.push(piv);
  }
  // head
  const headPivot = new THREE.Group(); headPivot.position.set(0, 0.9, 0.02); bodyPivot.add(headPivot);
  const head = mesh(rbox(1.18, 0.96, 0.9, 0.12), headMat); head.position.y = 0.5; headPivot.add(head);
  const faceTex = canvasTex(500, 400, () => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.816), new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.6 }));
  face.position.set(0, 0.47, 0.452); headPivot.add(face);
  const ears = [];
  for (const sx of [-1, 1]) {
    const ep = new THREE.Group(); ep.position.set(sx * 0.36, 0.96, -0.02); headPivot.add(ep);
    const e = mesh(new THREE.ConeGeometry(0.24, 0.46, 4, 1), earMat); e.rotation.y = Math.PI / 4; e.position.y = 0.2; ep.add(e);
    const ei = mesh(new THREE.ConeGeometry(0.13, 0.3, 4, 1), std(CAT.earIn)); ei.rotation.y = Math.PI / 4; ei.position.set(0, 0.15, 0.09); ep.add(ei);
    ears.push(ep);
  }
  // halo
  const halo = new THREE.Group();
  const haloRing = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.035, 16, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.0, 1.0) }));
  haloRing.rotation.x = Math.PI / 2 - 0.25; halo.add(haloRing);
  const haloGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffe6a8', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  haloGlow.scale.set(1.5, 0.8, 1); halo.add(haloGlow);
  halo.position.set(0, 1.42, 0); headPivot.add(halo);

  const state = { open: 1, happy: 0, look: 0, lookY: 0, shine: 0, tear: 0, mouth: 0 };
  return {
    root, bodyPivot, headPivot, tailSegs, arms, ears, halo, faceTex,
    reset() {
      root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.setScalar(1); root.visible = true;
      bodyPivot.rotation.set(0, 0, 0); bodyPivot.position.set(0, 0, 0); bodyPivot.scale.set(1, 1, 1);
      headPivot.rotation.set(0, 0, 0);
      arms.forEach(a => a.rotation.set(0, 0, 0)); ears.forEach(e => e.rotation.set(0, 0, 0));
      halo.visible = true;
      Object.assign(state, { open: 1, happy: 0, look: 0, lookY: 0, shine: 0, tear: 0, mouth: 0 });
    },
    idle(t, amt = 1) { // 呼吸 + 尾巴 + 耳朵
      const br = Math.sin(t * 2.1) * 0.012 * amt;
      bodyPivot.scale.set(1 + br, 1 - br * 0.6, 1 + br);
      tailSegs.forEach((s, i) => { s.rotation.x = -0.32 + Math.sin(t * 1.6 - i * 0.6) * 0.05; s.rotation.z = Math.sin(t * 1.3 - i * 0.7) * 0.16 * amt; });
      ears[0].rotation.z = 0.05 * Math.max(0, Math.sin(t * 0.7) ** 30);
      ears[1].rotation.z = -0.06 * Math.max(0, Math.sin(t * 0.53 + 1) ** 30);
      halo.position.y = 1.42 + Math.sin(t * 1.8) * 0.035;
      halo.rotation.y = t * 0.6;
    },
    blink(t, times) { for (const b of times) { const d = Math.abs(t - b); if (d < 0.09) state.open = Math.min(state.open, d / 0.09); } },
    face() { drawFace(faceTex.userData.g, state); faceTex.needsUpdate = true; },
    state,
  };
}

