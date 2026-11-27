// 共享工具 + 参考图角色: 主人(refs/owner_girl.png 方块女孩) + 主角小狗(refs/dog.png 橙色方块狗)
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ------------------------------------------------------------------ helpers
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
export const lerp = (a, b, k) => a + (b - a) * k;
export const back = (x, c = 1.9) => { x = clamp(x); return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2; };
export function bounce(x) {
  x = clamp(x);
  if (x < 1 / 2.75) return 7.5625 * x * x;
  if (x < 2 / 2.75) { x -= 1.5 / 2.75; return 7.5625 * x * x + 0.75; }
  if (x < 2.5 / 2.75) { x -= 2.25 / 2.75; return 7.5625 * x * x + 0.9375; }
  x -= 2.625 / 2.75; return 7.5625 * x * x + 0.984375;
}
export function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; t.userData = { canvas: c, g };
  return t;
}
export const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...o });
const _rb = new Map();
export const rbox = (w, h, d, r = 0.06, seg = 3) => {
  const k = [w, h, d, r].map(v => v.toFixed(3)).join();
  if (!_rb.has(k)) _rb.set(k, new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3)));
  return _rb.get(k);
};
export function mesh(geo, mat, cast = true, recv = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m; }
export function box(w, h, d, color, r = 0.04) { return mesh(rbox(w, h, d, r), typeof color === 'string' ? std(color) : color); }

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
export const heartTex = canvasTex(128, 128, (g) => {
  g.fillStyle = '#ff6f9e'; g.beginPath(); g.moveTo(64, 112);
  g.bezierCurveTo(-10, 60, 20, 6, 64, 38); g.bezierCurveTo(108, 6, 138, 60, 64, 112); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.ellipse(42, 46, 10, 7, -0.6, 0, 7); g.fill();
});
// 闪光星星 / 花瓣 (点精灵): rise>0 上飘, rise<0 下落
export function makeSparkles(n, boxSize, color, size, seed, rise = 0.12) {
  const r = rng(seed), pos = new Float32Array(n * 3), ph = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (r() - 0.5) * boxSize[0]; pos[i * 3 + 1] = r() * boxSize[1]; pos[i * 3 + 2] = (r() - 0.5) * boxSize[2];
    ph[i] = r() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uTex: { value: starTex }, uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uRise: { value: rise }, uH: { value: boxSize[1] } },
    vertexShader: `attribute float phase; uniform float uTime, uSize, uRise, uH; varying float vTw;
      void main(){ vec3 p = position; p.y = mod(p.y + uTime*uRise + phase*0.01, uH);
        p.x += sin(uTime*0.8 + phase)*0.15; p.z += cos(uTime*0.6 + phase)*0.1;
        vTw = 0.3 + 0.7*pow(0.5+0.5*sin(uTime*2.6 + phase*3.0), 2.0);
        vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
        gl_PointSize = uSize * (0.6+0.4*vTw) * (300.0 / -mv.z); }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec3 uColor; varying float vTw;
      void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(uColor*1.4, t.a*vTw); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(geo, mat); p.frustumCulled = false;
  return p;
}

// 方块风 (voxel) 用小圆角, 边角利落一些
const vb = (w, h, d, color, r = 0.02) => box(w, h, d, color, r);

// ------------------------------------------------------------------ 主人: 方块女孩 (参考 refs/owner_girl.png)
// 棕色大方头发 + 锯齿刘海 + 两侧垂发和粉色发圈; 大眼睛(深棕上半/浅棕下半 + 白方高光 + 粗上眼线); 粉腮红; 小嘴
// 豆沙粉上衣 + 浅灰领子 + 酒红蝴蝶结; 两层粉色蛋糕裙 + 奶白裙边; 灰袜 + 粉鞋
export const GIRL = { skin: '#f9dbc4', hair: '#7a4830', hairDk: '#4a2a1c', top: '#c77d8f', collar: '#e6dedb', bow: '#9a3350',
                      skirt1: '#ffb3c8', skirt2: '#ff8fb0', hem: '#fff6ea', sock: '#cfc6c4', shoe: '#ff7fa3', tie: '#f0628e' };
function drawGirlFace(g, s) {
  const w = 320, h = 280; g.clearRect(0, 0, w, h);
  g.fillStyle = '#ff8fab';                                                        // 腮红
  for (const x of [22, 238]) g.fillRect(x, 168, 62, 26);
  for (const [ex, sx] of [[98, -1], [222, 1]]) {
    const ey = 64;
    if (s.blink) {
      g.fillStyle = '#2c1a14'; g.fillRect(ex - 44, ey + 70, 88, 12); g.fillRect(ex + sx * 44 - (sx > 0 ? 0 : 12), ey + 62, 12, 12); continue;
    }
    const k = s.shock ? 1.12 : 1, ew = 88 * k, eh = 120 * k, x0 = ex - ew / 2, y0 = ey + (s.shock ? -6 : 0);
    g.fillStyle = '#2c1a14'; g.fillRect(x0, y0 + 10, ew, eh);                    // 深棕眼
    g.fillStyle = '#8a4e2e'; g.fillRect(x0 + 10, y0 + 10 + eh * 0.58, ew - 20, eh * 0.32);   // 下半浅棕
    g.fillStyle = '#ffffff';
    g.fillRect(ex - 4 + s.look * 4, y0 + 30, 26, 26);                             // 大高光
    g.fillRect(x0 + 16 + s.look * 4, y0 + 10 + eh * 0.66, 14, 14);                // 小高光
    g.fillStyle = '#2c1a14';                                                      // 粗上眼线 + 外侧翘
    g.fillRect(x0 - 14, y0, ew + 28, 16);
    g.fillRect(sx > 0 ? x0 + ew + 8 : x0 - 26, y0 - 12, 18, 16);
  }
  if (s.shock) { g.fillStyle = '#b8405c'; g.fillRect(140, 196, 40, 40); g.fillStyle = '#ff8fab'; g.fillRect(148, 220, 24, 12); }
  else { g.fillStyle = '#b8405c'; g.fillRect(140, 190, 40, 22); g.fillStyle = '#ff9fb5'; g.fillRect(148, 202, 24, 10); }
}

export function makePerson() {
  const root = new THREE.Group(), G = GIRL;
  for (const sx of [-1, 1]) {                                                     // 腿 + 灰袜 + 粉鞋
    const l = vb(0.2, 0.45, 0.2, G.skin); l.position.set(sx * 0.17, 0.5, 0); root.add(l);
    const so = vb(0.24, 0.16, 0.24, G.sock); so.position.set(sx * 0.17, 0.26, 0); root.add(so);
    const sh = vb(0.26, 0.18, 0.32, G.shoe); sh.position.set(sx * 0.17, 0.09, 0.04); root.add(sh);
  }
  const skirtG = new THREE.Group(); root.add(skirtG);                             // 两层蛋糕裙
  const hem = vb(0.92, 0.06, 0.66, G.hem); hem.position.y = 0.72; skirtG.add(hem);
  const s2 = vb(0.9, 0.3, 0.64, G.skirt2); s2.position.y = 0.9; skirtG.add(s2);
  const s1 = vb(0.78, 0.26, 0.56, G.skirt1); s1.position.y = 1.18; skirtG.add(s1);
  const torso = vb(0.66, 0.5, 0.42, G.top); torso.position.y = 1.55; root.add(torso);
  const col = vb(0.4, 0.08, 0.06, G.collar); col.position.set(0, 1.75, 0.22); root.add(col);
  const bowG = new THREE.Group(); bowG.position.set(0, 1.63, 0.23); root.add(bowG);
  for (const sx of [-1, 1]) { const b = vb(0.12, 0.12, 0.05, G.bow); b.position.x = sx * 0.08; bowG.add(b); }
  const kn = vb(0.06, 0.08, 0.06, '#c25070'); bowG.add(kn);
  const neck = vb(0.16, 0.1, 0.14, G.skin); neck.position.y = 1.83; root.add(neck);
  const arms = [];
  for (const sx of [-1, 1]) {                                                     // 短袖 + 手臂 + 手
    const piv = new THREE.Group(); piv.position.set(sx * 0.4, 1.74, 0); root.add(piv);
    const sl = vb(0.24, 0.24, 0.3, G.top); sl.position.y = -0.08; piv.add(sl);
    const a = vb(0.15, 0.36, 0.17, G.skin); a.position.y = -0.36; piv.add(a);
    const hnd = vb(0.17, 0.14, 0.19, G.skin); hnd.position.y = -0.6; piv.add(hnd);
    arms.push(piv);
  }
  const headG = new THREE.Group(); headG.position.y = 1.86; root.add(headG);    // 大方头
  const h = vb(1.08, 1.0, 0.92, G.skin); h.position.y = 0.55; headG.add(h);
  const faceTex = canvasTex(320, 280, () => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 0.89), new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.6 }));
  face.position.set(0, 0.47, 0.465); headG.add(face);
  const top = vb(1.2, 0.36, 1.04, G.hair); top.position.set(0, 1.12, -0.02); headG.add(top);
  const backH = vb(1.2, 1.1, 0.24, G.hair); backH.position.set(0, 0.55, -0.48); headG.add(backH);
  [[0.24, 0.16], [0.2, 0.08], [0.2, 0.14], [0.24, 0.1], [0.2, 0.16]].forEach(([bw, bh], i) => {   // 锯齿刘海
    const b = vb(bw, bh, 0.08, G.hair); b.position.set(-0.46 + i * 0.23, 0.95 - bh / 2 + 0.02, 0.47); headG.add(b);
  });
  const side = [];
  for (const sx of [-1, 1]) {                                                     // 两侧垂发 + 发尾深色 + 粉发圈
    const sg = new THREE.Group(); sg.position.set(sx * 0.62, 0.95, 0.0); headG.add(sg);
    const a = vb(0.2, 0.9, 0.5, G.hair); a.position.y = -0.45; sg.add(a);
    const b = vb(0.22, 0.22, 0.46, G.hairDk); b.position.y = -1.0; sg.add(b);
    const tie = vb(0.16, 0.22, 0.3, G.tie); tie.position.set(sx * 0.06, 0.12, 0.0); sg.add(tie);
    side.push(sg);
  }
  const poms = [];                                                                // 两边飘着的粉色小发饰
  for (const sx of [-1, 1]) {
    const pg = new THREE.Group(); pg.position.set(sx * 0.95, 0.85, 0.05); headG.add(pg);
    for (const [x, y, w_] of [[0, 0.12, 0.2], [0, 0.0, 0.26], [0, -0.12, 0.2], [0, -0.22, 0.1]]) { const c = vb(w_, 0.11, 0.12, x === 0 && y === 0 ? '#ff7fa3' : '#d24a74', 0.01); c.position.set(x, y, 0); pg.add(c); }
    poms.push(pg);
  }
  const strands = [];
  for (let i = 0; i < 5; i++) { const s_ = vb(0.08, 0.45, 0.08, G.hair); s_.position.set(-0.36 + i * 0.18, 1.2, -0.3); headG.add(s_); strands.push(s_); }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const st = { blink: false, shock: false, look: 0 };
  const hands = arms.map(a => a.children[2]);
  return {
    root, hands, arms,
    update(t, o = {}) {
      root.visible = true;
      root.position.y = 0.02 * Math.sin(t * 2.4);
      root.scale.set(1.15, 1.15 * (1 + 0.008 * Math.sin(t * 2.4)), 1.15);
      st.blink = (t % 2.9) < 0.12 && !o.shock; st.shock = !!o.shock; st.look = 0.6 * Math.sin(t * 0.7);
      drawGirlFace(faceTex.userData.g, st); faceTex.needsUpdate = true;
      arms[0].rotation.set(0, 0, o.wave ? -2.5 + 0.35 * Math.sin(t * 8) : -0.1 - 0.03 * Math.sin(t * 2.4));
      arms[1].rotation.set(o.hold ? -0.7 : 0, 0, o.reach ? 1.25 + 0.1 * Math.sin(t * 6) : o.hold ? 0.35 : 0.1 + 0.03 * Math.sin(t * 2.4));
      if (o.shock) { arms[0].rotation.z = -0.5 - 0.1 * Math.sin(t * 9); }
      headG.rotation.set(0, o.headYaw ?? 0.15 * Math.sin(t * 0.8), 0.06 * Math.sin(t * 1.1));
      skirtG.rotation.y = 0.05 * Math.sin(t * 2.2);
      side.forEach((s_, i) => { s_.rotation.z = (i ? 1 : -1) * ((o.blow ? 0.4 : 0.04) * (0.5 + 0.5 * Math.sin(t * (o.blow ? 13 : 1.6) + i))); });
      poms.forEach((p, i) => { p.position.y = 0.85 + 0.05 * Math.sin(t * 2.6 + i * 1.5); p.rotation.z = 0.12 * Math.sin(t * 2 + i); });
      strands.forEach((s_, i) => { s_.visible = !!o.blow; s_.rotation.z = 1.2 + 0.3 * Math.sin(t * 14 + i); });
    },
  };
}

// ------------------------------------------------------------------ 主角小狗 (参考 refs/dog.png)
// 橙色大方头 + 额头到鼻梁的奶白条纹 + 奶白方嘴筒 + 深棕方鼻 + 粉舌头; 黑方眼(左上大白高光 + 右下小白高光); 粉腮红
// 竖起的方耳朵(粉色内耳) + 头顶粉色蝴蝶结; 橙色身体 + 金色小牌子; 奶白爪子; 小短尾巴
export const DOG = { fur: '#f7983e', furDk: '#d97a2c', cream: '#fffbea', nose: '#2e201a', earIn: '#ff8f9c', blush: '#ffa3b8',
                     bow: '#ffa3bd', bowKnot: '#f2708e', tag: '#c9a23a', mud: '#8a5a38' };
function drawDogFace(g, s) {
  const w = 520, h = 440; g.clearRect(0, 0, w, h);
  g.fillStyle = DOG.cream; g.fillRect(200, 110, 120, 330);                         // 奶白条纹 (额头 → 嘴筒)
  g.fillStyle = DOG.blush; for (const x of [14, 412]) g.fillRect(x, 278, 94, 72);  // 粉腮红
  for (const [ex, side] of [[105, -1], [415, 1]]) {
    const ey = 200, lx = s.look * 12, ly = s.lookY * 8;
    g.fillStyle = '#2d1f1a'; g.strokeStyle = '#2d1f1a';
    if (s.eyes === 'happy') {
      g.lineWidth = 24; g.lineCap = 'square'; g.lineJoin = 'miter';
      g.beginPath(); g.moveTo(ex - 60, ey + 30); g.lineTo(ex, ey - 26); g.lineTo(ex + 60, ey + 30); g.stroke(); continue;
    }
    if (s.eyes === 'dizzy') {
      g.lineWidth = 13; g.lineCap = 'square'; g.beginPath();
      let x = ex, y = ey, L = 12; const dir = s.spin | 0; g.moveTo(x, y);
      for (let k = 0; k < 9; k++) { const d = (dir + k) % 4; x += [L, 0, -L, 0][d]; y += [0, L, 0, -L][d]; g.lineTo(x, y); if (k % 2) L += 24; }
      g.stroke(); continue;
    }
    if (s.eyes === 'squint') { g.lineWidth = 22; g.lineCap = 'square'; g.beginPath(); g.moveTo(ex - side * 56, ey - 24); g.lineTo(ex + side * 44, ey + 6); g.lineTo(ex - side * 56, ey + 36); g.stroke(); continue; }
    const big = s.eyes === 'big' ? 1.1 : 1, ew = 140 * big, eh = 180 * big * s.open;
    if (eh < 14) { g.fillRect(ex - 70, ey - 7, 140, 16); continue; }
    const top = ey - eh / 2; g.fillRect(ex - ew / 2, top, ew, eh);
    if (s.open > 0.6) {
      g.fillStyle = '#ffffff';
      g.fillRect(ex - ew / 2 + 14 + lx, top + 14 + ly, 44 * big, 44 * big);          // 大高光 (左上)
      g.fillRect(ex + ew / 2 - 44 + lx, top + eh - 52 + ly, 24, 24);                  // 小高光 (右下)
      if (s.eyes === 'big') g.fillRect(ex + 20 + lx, top + 20, 16, 16);
    }
  }
}
function drawMouth(g, s) {   // 嘴筒正面 (鼻子是 3D 方块, 这里只画嘴)
  const w = 256, h = 160; g.clearRect(0, 0, w, h);
  g.fillStyle = '#6b3a2e';
  if (s.mouth === 'smile') { g.fillRect(122, 70, 12, 26); g.fillRect(84, 92, 44, 10); g.fillRect(128, 92, 44, 10); g.fillRect(76, 82, 10, 14); g.fillRect(170, 82, 10, 14); }
  else { const k = s.mouth === 'bark' ? 1.4 : 1; g.fillRect(128 - 50 * k, 74, 100 * k, 56 * k);
    g.fillStyle = '#ff8fa8'; g.fillRect(128 - 32 * k, 74 + 28 * k, 64 * k, 28 * k); }
}

export function makeDog() {
  const root = new THREE.Group(), D = DOG;
  const fur = std(D.fur), furDk = std(D.furDk), cream = std(D.cream);
  const headMat = std(D.fur, { emissive: new THREE.Color(D.fur), emissiveIntensity: 0.08 });
  const bodyPivot = new THREE.Group(); root.add(bodyPivot);
  const body = mesh(rbox(0.96, 0.8, 1.4, 0.03), fur); body.position.set(0, 0.72, -0.5); bodyPivot.add(body);
  const chest = mesh(rbox(0.6, 0.5, 0.06, 0.02), cream); chest.position.set(0, 0.62, 0.21); bodyPivot.add(chest);
  const legs = [];
  for (const [sx, z] of [[-1, 0.0], [1, 0.0], [-1, -1.0], [1, -1.0]]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.28, 0.5, z); bodyPivot.add(piv);
    const l = mesh(rbox(0.3, 0.4, 0.3, 0.02), fur); l.position.y = -0.2; piv.add(l);
    const p = mesh(rbox(0.32, 0.14, 0.34, 0.02), cream); p.position.set(0, -0.43, 0.02); piv.add(p);
    legs.push(piv);
  }
  const mudMat = std(D.mud, { roughness: 1 }), muds = [];
  { const r = rng(4); for (let i = 0; i < 14; i++) { const m = mesh(rbox(0.1 + r() * 0.1, 0.03, 0.1 + r() * 0.1, 0.015), mudMat, false);
    const side = i % 3; if (side === 0) m.position.set((r() - 0.5) * 0.8, 1.13, -0.5 + (r() - 0.5) * 1.2);
    else { m.rotation.z = Math.PI / 2; m.position.set((side === 1 ? -1 : 1) * 0.49, 0.5 + r() * 0.4, -0.5 + (r() - 0.5) * 1.2); }
    bodyPivot.add(m); muds.push(m); } }
  const tailBase = new THREE.Group(); tailBase.position.set(0, 0.98, -1.18); bodyPivot.add(tailBase);   // 小短尾巴
  const tsegs = []; { let p = tailBase; for (let i = 0; i < 3; i++) { const s = new THREE.Group(); s.position.y = i ? 0.15 : 0;
    const m = mesh(rbox(0.2, 0.2, 0.2, 0.02), i === 2 ? cream : fur); m.position.y = 0.08; s.add(m); p.add(s); p = s; tsegs.push(s); } }
  const tag = mesh(rbox(0.16, 0.14, 0.04, 0.01), std(D.tag, { metalness: 0.35, roughness: 0.4 })); tag.position.set(0, 0.88, 0.26); bodyPivot.add(tag);
  const headPivot = new THREE.Group(); headPivot.position.set(0, 1.0, 0.12); bodyPivot.add(headPivot);
  const head = mesh(rbox(1.3, 1.16, 0.96, 0.03), headMat); head.position.set(0, 0.5, 0.05); headPivot.add(head);
  const faceTex = canvasTex(520, 440, () => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.1), new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.6 }));
  face.position.set(0, 0.5, 0.535); headPivot.add(face);
  const snout = mesh(rbox(0.66, 0.38, 0.3, 0.02), cream); snout.position.set(0, 0.14, 0.66); headPivot.add(snout);
  const nose = mesh(rbox(0.24, 0.14, 0.1, 0.02), std(D.nose, { roughness: 0.3 })); nose.position.set(0, 0.26, 0.83); headPivot.add(nose);
  const mouthTex = canvasTex(256, 160, () => {});
  const mouthP = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.36), new THREE.MeshStandardMaterial({ map: mouthTex, transparent: true, roughness: 0.6 }));
  mouthP.position.set(0, 0.13, 0.812); headPivot.add(mouthP);
  const tongue = mesh(rbox(0.18, 0.16, 0.06, 0.02), std('#ff8fa8')); tongue.position.set(0, -0.08, 0.72); headPivot.add(tongue);
  const mouthSlot = new THREE.Group(); mouthSlot.position.set(0, 0.02, 0.9); headPivot.add(mouthSlot);
  const ears = [];
  for (const sx of [-1, 1]) {                                                     // 竖方耳 + 粉内耳
    const ep = new THREE.Group(); ep.position.set(sx * 0.42, 1.06, 0.05); headPivot.add(ep);
    const e = mesh(rbox(0.3, 0.42, 0.14, 0.02), fur); e.position.y = 0.2; ep.add(e);
    const ei = mesh(rbox(0.16, 0.3, 0.04, 0.01), std(D.earIn)); ei.position.set(sx * 0.03, 0.17, 0.08); ep.add(ei);
    ears.push(ep);
  }
  const bow = new THREE.Group(); bow.position.set(0, 1.12, 0.12); headPivot.add(bow);   // 头顶粉色蝴蝶结
  for (const sx of [-1, 1]) { const b = mesh(rbox(0.2, 0.13, 0.1, 0.02), std(D.bow)); b.position.x = sx * 0.13; bow.add(b); }
  const bk = mesh(rbox(0.09, 0.15, 0.11, 0.02), std(D.bowKnot)); bow.add(bk);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const st = { open: 1, eyes: 'normal', look: 0, lookY: 0, mouth: 'smile', spin: 0 };
  return {
    root, bodyPivot, headPivot, ears, legs, mouthSlot, muds, faceTex,
    // o: yaw/pitch/tilt, ears(-1 飞机耳 / 0 / 1 竖得更直), eyes, mouth(smile/open/bark), wag, walk, walkHz, hop, dropY, mud, tongue, sit
    update(t, o = {}) {
      root.visible = true;
      const br = Math.sin(t * 2.6) * 0.015; bodyPivot.scale.set(1 + br, 1 - br, 1 + br);
      headPivot.rotation.set((o.pitch || 0) + 0.04 * Math.sin(t * 1.9), (o.yaw || 0) + 0.1 * Math.sin(t * 1.1), (o.tilt || 0) + 0.07 * Math.sin(t * 1.6));
      const up = o.ears || 0;
      ears.forEach((ep, i) => {   // 耳朵一直轻轻转, 时不时抖一下; 紧张时往后压
        const sx = i ? 1 : -1, flick = Math.max(0, Math.sin(t * (i ? 2.2 : 1.8) + i * 2)) ** 14;
        ep.rotation.set(-0.08 * Math.sin(t * 1.4 + i) - 0.35 * flick - 0.9 * Math.max(0, -up),
                        sx * (0.15 * Math.sin(t * 1.0 + i * 1.7) + 0.3 * flick),
                        -sx * (0.1 + 0.06 * Math.sin(t * 1.3 + i)) * (1 - 0.8 * Math.max(0, up)) - sx * 0.7 * Math.max(0, -up));
      });
      bow.rotation.z = 0.08 * Math.sin(t * 3);
      const wk = o.walk || 0, ws = o.walkHz || 10;
      legs.forEach((l, i) => { l.rotation.x = wk ? 0.6 * Math.sin(t * ws + (i === 0 || i === 3 ? 0 : Math.PI)) : (o.sit && i >= 2 ? -1.1 : 0); });
      bodyPivot.rotation.x = o.sit ? -0.32 : 0;
      const wag = o.wag ?? 1;
      tailBase.rotation.set(-0.5 + (o.sit ? 0.3 : 0), 0, 0);
      tsegs.forEach((s, j) => { s.rotation.z = (0.25 + 0.15 * wag) * Math.sin(t * (6 + 9 * wag) - j * 0.5); });
      const hop = o.hop || 0;
      bodyPivot.position.y = hop * Math.abs(Math.sin(t * Math.PI * 1.8)) * 0.35 + (o.dropY || 0) + (o.sit ? -0.08 : 0);
      muds.forEach((m, i) => { m.visible = (o.mud || 0) > i / muds.length; });
      tongue.visible = o.tongue ?? true;
      tongue.scale.y = (o.mouth === 'open' || o.mouth === 'bark') ? 1.5 : 1; tongue.rotation.x = 0.15 * Math.sin(t * 9);
      Object.assign(st, { eyes: o.eyes || 'normal', look: o.look || 0, lookY: o.lookY || 0, mouth: o.mouth || 'smile', spin: (t * 8) | 0 });
      st.open = 1;
      if ((st.eyes === 'normal' || st.eyes === 'big') && (t % 2.9) < 0.12) st.open = Math.abs((t % 2.9) - 0.06) / 0.06;
      drawDogFace(faceTex.userData.g, st); faceTex.needsUpdate = true;
      drawMouth(mouthTex.userData.g, st); mouthTex.needsUpdate = true;
    },
  };
}
