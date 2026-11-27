// 共享工具 + 3D 橘色方块狗 + 方块女生 (参考 ref/) + 粉色方块猫 (参考用户给的 3D 方块猫造型: 大方头、方眼睛白高光、四棱锥耳朵; 身体是小鱼花纹)
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

// ------------------------------------------------------------------ 粉色方块猫
export const CAT = { head: '#fde0e9', body: '#fbd3e0', ear: '#f294b5', earIn: '#ffe1ea', paw: '#fde0e9', tail: '#f9c3d5', tip: '#f094b4' };

export function drawFace(g, s) {
  const w = 520, h = 440; g.clearRect(0, 0, w, h);
  // 腮红
  g.fillStyle = 'rgba(238,92,138,0.75)';
  for (const x of [52, 398]) { g.beginPath(); g.roundRect(x, 292, 72, 32, 8); g.fill(); }
  // 眼睛: 大黑方块 + 两块白色方形高光
  for (const ex of [150, 370]) {
    const ey = 190, lx = s.look * 14, ly = s.lookY * 10;
    if (s.eyes === 'happy') {
      g.strokeStyle = '#1b1218'; g.lineWidth = 22; g.lineCap = 'square'; g.lineJoin = 'miter';
      g.beginPath(); g.moveTo(ex - 52, ey + 30); g.lineTo(ex, ey - 22); g.lineTo(ex + 52, ey + 30); g.stroke();
      continue;
    }
    if (s.eyes === 'dot') { g.fillStyle = '#1b1218'; g.fillRect(ex - 22 + lx, ey - 22 + ly, 44, 44); continue; }
    const open = s.open;
    const eh = 150 * open, top = ey - 75 + (s.eyes === 'half' ? 50 : 0) + (1 - open) * 70;
    const hh = s.eyes === 'half' ? Math.max(4, eh - 50) : eh;
    if (hh < 12) { g.fillStyle = '#1b1218'; g.fillRect(ex - 62, ey - 6, 124, 14); continue; }
    g.fillStyle = '#1b1218'; g.fillRect(ex - 62, top, 124, hh);
    if (s.eyes !== 'half' && open > 0.6) {
      g.fillStyle = '#d9d9de'; g.fillRect(ex - 44 + lx, top + 18 + ly, 46, 46);
      g.fillStyle = '#ffffff'; g.fillRect(ex - 44 + lx, top + 18 + ly, 40, 40);
      g.fillRect(ex + 14 + lx, top + 86 + ly, 24, 24);
      g.fillRect(ex - 18 + lx, top + 96 + ly, 14, 14);
      if (s.shine > 0) { g.globalAlpha = s.shine; g.fillRect(ex + 30 + lx, top + 14, 10, 10); g.globalAlpha = 1; }
    }
  }
  // 鼻子 + 嘴套 + 嘴
  g.fillStyle = '#f5b39c'; g.beginPath(); g.roundRect(198, 300, 124, 74, 10); g.fill();
  g.fillStyle = '#ea6e93'; g.beginPath(); g.roundRect(226, 290, 68, 34, 8); g.fill();
  g.strokeStyle = '#a3466c'; g.lineWidth = 7; g.lineCap = 'round';
  if (s.mouth === 'w') { g.beginPath(); g.moveTo(228, 344); g.lineTo(244, 356); g.lineTo(260, 344); g.lineTo(276, 356); g.lineTo(292, 344); g.stroke(); }
  else if (s.mouth === 'o') { g.fillStyle = '#a3466c'; g.beginPath(); g.roundRect(240, 336, 40, 34, 10); g.fill(); }
  else if (s.mouth === 'flat') { g.beginPath(); g.moveTo(236, 350); g.lineTo(284, 350); g.stroke(); }
}

// 身体花纹: 小鱼 (深粉/白/浅蓝, 方向各不相同)
const speckTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = CAT.body; g.fillRect(0, 0, w, h);
  const r = rng(5), cols = ['#e0709a', '#ffffff', '#9fc8f2', '#f59a7a'];
  const fish = (x, y, s, a, c) => {
    g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s);
    g.fillStyle = c;
    g.beginPath(); g.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2); g.fill();          // 身体
    g.beginPath(); g.moveTo(11, 0); g.lineTo(24, -9); g.lineTo(24, 9); g.closePath(); g.fill();  // 尾巴
    g.fillStyle = 'rgba(70,30,60,0.8)'; g.beginPath(); g.arc(-7, -2, 2.2, 0, 7); g.fill();     // 眼睛
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(-1, 0, 6, -1.2, 1.2); g.stroke(); // 鱼鳃
    g.restore();
  };
  // 网格散点, 跨边缘再画一次以保证无缝平铺
  for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 2; gx++) {   // 4 条鱼一格, 鱼少一点
    const x = gx * 128 + 40 + (gy % 2) * 50 + r() * 20, y = gy * 128 + 40 + r() * 40, s = 1.6 + r() * 0.3, a = (r() - 0.5) * 1.6 + (r() < 0.5 ? Math.PI : 0);
    const c = cols[(gx + gy * 2) % cols.length];
    for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) fish(x + dx, y + dy, s, a, c);
  }
  // 小气泡
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(r() * w, r() * h, 3 + r() * 4, 0, 7); g.stroke(); }
});
speckTex.wrapS = speckTex.wrapT = THREE.RepeatWrapping;

const tailMat = std(CAT.tail), tipMat = std(CAT.tip);
function makeChain(n = 7, segLen = 0.2, w = 0.16) {
  const root = new THREE.Group(); let p = root; const segs = [];
  for (let i = 0; i < n; i++) {
    const s = new THREE.Group(); s.position.y = i === 0 ? 0 : segLen;
    const ww = w * (1 - i * 0.05);
    const m = mesh(rbox(ww, segLen + 0.05, ww, 0.05), i >= n - 2 ? tipMat : tailMat); m.position.y = segLen / 2;
    s.add(m); p.add(s); p = s; segs.push(s);
  }
  return { root, segs };
}

export function makeCat() {
  const root = new THREE.Group();
  const bodyMat = std('#ffffff', { map: speckTex });
  const headMat = std(CAT.head, { emissive: new THREE.Color(CAT.head), emissiveIntensity: 0.14 });
  const earMat = std(CAT.ear), earInMat = std(CAT.earIn), pawMat = std(CAT.paw, { map: speckTex });
  const bodyPivot = new THREE.Group(); root.add(bodyPivot);
  const body = mesh(rbox(1.0, 0.82, 1.45, 0.08), bodyMat); body.position.set(0, 0.47, -0.5); bodyPivot.add(body);
  const legs = [];
  for (const sx of [-1, 1]) {   // 前腿 (肩膀处可转)
    const piv = new THREE.Group(); piv.position.set(sx * 0.25, 0.42, 0.12); bodyPivot.add(piv);
    const l = mesh(rbox(0.28, 0.44, 0.32, 0.05), pawMat); l.position.set(0, -0.2, 0.02); piv.add(l);
    legs.push(piv);
    const hch = mesh(rbox(0.3, 0.42, 0.62, 0.08), bodyMat); hch.position.set(sx * 0.42, 0.22, -0.92); bodyPivot.add(hch);
  }
  // 尾巴池: 最多 120 条
  const tailBase = new THREE.Group(); tailBase.position.set(0, 0.72, -1.18); bodyPivot.add(tailBase);
  const chains = []; for (let i = 0; i < 120; i++) { const c = makeChain(); tailBase.add(c.root); chains.push(c); }
  const knot = mesh(new THREE.TorusKnotGeometry(0.42, 0.14, 160, 20, 2, 5), std(CAT.tail));
  knot.position.set(0.55, 0.05, -0.75); tailBase.add(knot);
  // 头 (脖子处可扭头/歪头)
  const headPivot = new THREE.Group(); headPivot.position.set(0, 0.78, 0.12); bodyPivot.add(headPivot);
  const head = mesh(rbox(1.28, 1.06, 1.0, 0.07), headMat); head.position.set(0, 0.46, 0.08); headPivot.add(head);
  const faceTex = canvasTex(520, 440, () => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0), new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.6 }));
  face.position.set(0, 0.45, 0.585); headPivot.add(face);
  const ears = [];
  for (const sx of [-1, 1]) {
    const ep = new THREE.Group(); ep.position.set(sx * 0.38, 0.98, 0.1); headPivot.add(ep);
    const e = mesh(new THREE.ConeGeometry(0.3, 0.62, 4, 1), earMat); e.rotation.y = Math.PI / 4; e.position.y = 0.29; ep.add(e);
    const ei = mesh(new THREE.ConeGeometry(0.17, 0.42, 4, 1), earInMat); ei.rotation.y = Math.PI / 4; ei.position.set(0, 0.22, 0.12); ep.add(ei);
    ears.push(ep);
  }
  // 头顶螺旋桨 (第100天)
  const prop = new THREE.Group(); prop.position.set(0, 1.15, 0.08); headPivot.add(prop);
  const stem = mesh(rbox(0.14, 0.36, 0.14, 0.05), tailMat); stem.position.y = 0.18; prop.add(stem);
  const rotor = new THREE.Group(); rotor.position.y = 0.38; prop.add(rotor);
  for (let i = 0; i < 6; i++) { const b = mesh(rbox(0.16, 0.08, 1.2, 0.04), i % 2 ? tailMat : tipMat); b.position.z = 0.6; const g = new THREE.Group(); g.rotation.y = i * Math.PI / 3; g.add(b); rotor.add(g); }
  const blur = new THREE.Mesh(new THREE.CircleGeometry(1.25, 48), new THREE.MeshBasicMaterial({ color: '#ffd1e0', transparent: true, opacity: 0.35, depthWrite: false }));
  blur.rotation.x = -Math.PI / 2; rotor.add(blur);

  const st = { open: 1, eyes: 'normal', look: 0, lookY: 0, shine: 0, mouth: 'w' };
  const api = {
    root, bodyPivot, headPivot, ears, legs, chains, knot, prop, rotor, faceTex, st, tailBase,
    // o: yaw/pitch/tilt (头), ears (0..1 飞机耳), eyes, look, mouth, tails:{mode,...}, walk, hop
    update(t, o = {}) {
      root.visible = true;
      const br = Math.sin(t * 2.3) * 0.015;
      bodyPivot.scale.set(1 + br, 1 - br, 1 + br);
      // 扭头: 自然摆动 + 指定角度
      headPivot.rotation.set((o.pitch || 0) + 0.04 * Math.sin(t * 1.9), (o.yaw || 0) + 0.12 * Math.sin(t * 1.1), (o.tilt || 0) + 0.08 * Math.sin(t * 1.6));
      // 耳朵: 一直轻轻转动 + 时不时抖一下
      ears.forEach((ep, i) => {
        const sx = i ? 1 : -1;
        const flick = Math.max(0, Math.sin(t * (i ? 2.1 : 1.7) + i * 2.0)) ** 16;
        const flat = o.ears || 0;
        ep.rotation.set(-0.15 * Math.sin(t * 1.3 + i) - 0.5 * flat - 0.35 * flick,
                        sx * (0.18 * Math.sin(t * 0.9 + i * 1.7) + 0.5 * flick),
                        -sx * (0.12 + 0.9 * flat + 0.25 * flick));
      });
      // 走路
      legs.forEach((l, i) => { l.rotation.x = (o.walk || 0) * 0.5 * Math.sin(t * 9 + i * Math.PI); });
      // 尾巴
      const tm = (o.tails && o.tails.mode) || 'single';
      const n = tm === 'single' ? 1 : tm === 'two' ? 2 : tm === 'knot' ? 8 : tm === 'prop' ? 0 : Math.min((o.tails.n) || 1, 120);
      knot.visible = tm === 'knot'; prop.visible = tm === 'prop'; if (tm !== 'knot') knot.scale.setScalar(1);
      if (tm === 'knot') knot.rotation.set(t * 0.8, t * 1.1, 0);
      if (tm === 'prop') rotor.rotation.y = t * 18;
      chains.forEach((c, i) => {
        c.root.visible = i < n;
        if (i >= n) return;
        let lean = -0.3, side = 0, amp = 0.14, hz = 1.2, curl = 0.1, ph = i * 0.7;
        if (tm === 'single') { lean = -0.25; amp = 0.12; }
        else if (tm === 'two') { if (i === 0) { lean = -0.2; amp = 0.1; } else { lean = -1.0; side = -1.0; amp = 0.55; hz = 3.2; curl = 0.02; } }
        else if (tm === 'knot') { lean = -1.2; side = 0.5 + i * 0.12; amp = 0.05; curl = 0.25; }
        else if (tm === 'fan') {
          const T = o.tails, u = n > 1 ? i / (n - 1) : 0.5;
          side = lerp(T.a0, T.a1, u); lean = T.lean ?? -0.35; amp = T.amp ?? 0.15; hz = T.hz ?? 1.2; curl = T.curl ?? 0.06;
        }
        c.root.rotation.set(lean, 0, side);
        c.segs.forEach((s, j) => {
          s.rotation.z = amp * Math.sin(2 * Math.PI * hz * t - j * 0.6 + ph);
          s.rotation.x = j > 3 ? curl * (j - 3) : 0;
        });
      });
      // 蹦跳
      const hop = o.hop || 0;
      const jy = hop * Math.abs(Math.sin(t * Math.PI * 1.6)) * 0.35;
      bodyPivot.position.y = jy + (o.dropY || 0);
      Object.assign(st, { eyes: o.eyes || 'normal', look: o.look || 0, lookY: o.lookY || 0, mouth: o.mouth ?? 'w', shine: (t % 1.8) < 0.9 ? 1 : 0 });
      st.open = 1;
      if (st.eyes === 'normal' && (t % 2.7) < 0.12) st.open = Math.abs((t % 2.7) - 0.06) / 0.06;
      drawFace(faceTex.userData.g, st); faceTex.needsUpdate = true;
    },
  };
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return api;
}

// ------------------------------------------------------------------ 主人: 方块风女生 (参考 ref/girl_ref.png: 大方头、齐刘海、低双马尾+粉发圈、粉色蛋糕裙)
function drawGirlFace(g, s) {
  const w = 400, h = 360; g.clearRect(0, 0, w, h);
  g.fillStyle = '#ff8fab';                                             // 方形腮红
  g.fillRect(38, 236, 84, 34); g.fillRect(278, 236, 84, 34);
  for (const [ex, sx] of [[128, -1], [272, 1]]) {
    const ey = 175, k = s.shock ? 1.12 : 1, lx = s.look * 8;
    if (s.blink) {
      g.fillStyle = '#2a1a14'; g.fillRect(ex - 50, ey + 10, 100, 14); g.fillRect(ex + sx * 44, ey + 2, 14, 12); continue;
    }
    const ew = 84 * k, eh = 112 * k, top = ey - eh / 2;
    g.fillStyle = '#2e1c16'; g.fillRect(ex - ew / 2, top, ew, eh * 0.58);          // 上半: 深棕
    g.fillStyle = '#8a4f2e'; g.fillRect(ex - ew / 2, top + eh * 0.58, ew, eh * 0.42); // 下半: 棕色虹膜
    g.fillStyle = '#2e1c16'; g.fillRect(ex - ew / 2, top + eh - 8, ew, 8);
    g.fillStyle = '#ffffff'; g.fillRect(ex + 2 + lx, top + 16, 32, 32);             // 大高光
    g.fillRect(ex - ew / 2 + 10 + lx, top + eh - 34, 16, 16);                        // 小高光
    // 粗上睫毛 + 眼尾翘起
    g.fillStyle = '#2a1a14'; g.fillRect(ex - ew / 2 - 14, top - 16, ew + 28, 16);
    g.fillRect(ex + sx * (ew / 2 + 6) - 8, top - 30, 18, 18);
  }
  // 嘴: 小方嘴, 吃惊时张大
  if (s.shock) { g.fillStyle = '#b8405e'; g.fillRect(180, 258, 40, 40); g.fillStyle = '#ff8fab'; g.fillRect(188, 282, 24, 12); }
  else if (s.smile) { g.fillStyle = '#b8405e'; g.fillRect(176, 262, 48, 14); g.fillRect(172, 254, 10, 10); g.fillRect(218, 254, 10, 10); }
  else { g.fillStyle = '#b8405e'; g.fillRect(182, 262, 36, 22); g.fillStyle = '#ff8fab'; g.fillRect(190, 274, 20, 10); }
}

export function makePerson() {
  const root = new THREE.Group();
  const B = (w, h, d, c) => box(w, h, d, c, 0.015);
  const skin = std('#f8dcc6'), hair = std('#7a4a30'), hairDk = std('#5a3220'), top = std('#d98ca0'), white = std('#ffffff');
  const tie = std('#ff6f97');
  const legs = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.13, 0.5, 0); root.add(piv);
    const l = B(0.16, 0.3, 0.16, skin); l.position.y = -0.15; piv.add(l);
    const so = B(0.19, 0.12, 0.19, white); so.position.y = -0.3; piv.add(so);
    const sh = B(0.22, 0.14, 0.3, '#ff7fa0'); sh.position.set(0, -0.43, 0.04); piv.add(sh);
    legs.push(piv);
  }
  // 蛋糕裙: 两层粉 + 白色裙边
  const hem = B(0.78, 0.06, 0.56, '#fff6ea'); hem.position.y = 0.5; root.add(hem);
  const sk2 = B(0.74, 0.26, 0.52, '#ff8fae'); sk2.position.y = 0.66; root.add(sk2);
  const sk1 = B(0.62, 0.2, 0.44, '#ffb3c6'); sk1.position.y = 0.88; root.add(sk1);
  const torso = mesh(rbox(0.52, 0.4, 0.34, 0.015), top); torso.position.y = 1.16; root.add(torso);
  const col = B(0.28, 0.06, 0.04, '#ffffff'); col.position.set(0, 1.33, 0.17); root.add(col);
  for (const sx of [-1, 1]) { const b = B(0.11, 0.09, 0.04, '#b8405e'); b.position.set(sx * 0.065, 1.25, 0.18); root.add(b); }
  const arms = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.32, 1.32, 0); root.add(piv);
    const sl = mesh(rbox(0.18, 0.18, 0.22, 0.015), top); sl.position.y = -0.07; piv.add(sl);
    const a = B(0.12, 0.3, 0.13, skin); a.position.y = -0.3; piv.add(a);
    const hd = B(0.14, 0.1, 0.15, skin); hd.position.y = -0.48; piv.add(hd);
    arms.push(piv);
  }
  // 大方头
  const headG = new THREE.Group(); headG.position.y = 1.36; root.add(headG);
  const hb = B(1.06, 0.96, 0.86, skin); hb.position.y = 0.5; headG.add(hb);
  const faceTex = canvasTex(400, 360, () => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.9), new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.7 }));
  face.position.set(0, 0.46, 0.432); headG.add(face);
  const hairTop = B(1.14, 0.36, 0.96, hair); hairTop.position.y = 1.0; headG.add(hairTop);
  const hairBack = B(1.14, 0.95, 0.2, hair); hairBack.position.set(0, 0.55, -0.4); headG.add(hairBack);
  for (const sx of [-1, 1]) { const sd = B(0.12, 0.55, 0.9, hair); sd.position.set(sx * 0.57, 0.72, -0.02); headG.add(sd); }
  // 参差的齐刘海
  [[-0.4, 0.16], [-0.2, 0.1], [0.0, 0.17], [0.2, 0.1], [0.4, 0.15]].forEach(([x, hh]) => {
    const b = B(0.22, hh, 0.08, hair); b.position.set(x, 0.82 + (0.17 - hh) / 2, 0.45); headG.add(b);
  });
  const bangTop = B(1.1, 0.06, 0.08, hair); bangTop.position.set(0, 0.92, 0.45); headG.add(bangTop);
  // 低双马尾 + 粉发圈
  const tails = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.76, 0.62, -0.02); headG.add(piv);
    const t1 = B(0.3, 0.5, 0.34, hair); t1.position.y = -0.27; piv.add(t1);
    const t2 = B(0.26, 0.24, 0.3, hairDk); t2.position.y = -0.62; piv.add(t2);
    const rg = B(0.34, 0.12, 0.38, tie); rg.position.y = 0.0; piv.add(rg);
    tails.push(piv);
    const bw = B(0.12, 0.22, 0.16, tie); bw.position.set(sx * 0.6, 1.02, 0.12); headG.add(bw);
  }
  const strands = [];
  for (let i = 0; i < 5; i++) { const s_ = B(0.08, 0.4, 0.08, hair); s_.position.set(-0.3 + i * 0.15, 1.15, -0.2); headG.add(s_); strands.push(s_); }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const st = { blink: false, shock: false, smile: false, look: 0 };
  return {
    root, arms, head: headG, handY: -0.52,
    update(t, o = {}) {
      root.visible = true;
      root.position.y = 0.015 * Math.sin(t * 2.4) + (o.walk ? 0.04 * Math.abs(Math.sin(t * 9)) : 0);
      st.blink = (t % 2.9) < 0.12 && !o.shock; st.shock = !!o.shock; st.smile = !!o.smile; st.look = o.look ?? 0.6 * Math.sin(t * 0.7);
      drawGirlFace(faceTex.userData.g, st); faceTex.needsUpdate = true;
      arms[0].rotation.set(0, 0, o.wave ? -2.5 + 0.35 * Math.sin(t * 8) : (o.walk ? 0 : -0.1 - 0.03 * Math.sin(t * 2.4)));
      arms[1].rotation.set(o.reach ? -1.2 + 0.08 * Math.sin(t * 5) : 0, 0, o.reach ? 0.15 : 0.1 + 0.03 * Math.sin(t * 2.4));
      if (o.cover) { arms[0].rotation.set(-2.2, 0, -0.35); arms[1].rotation.set(-2.2, 0, 0.35); }
      if (o.walk) { arms[0].rotation.x = 0.5 * Math.sin(t * 9); if (!o.reach) arms[1].rotation.x = -0.5 * Math.sin(t * 9); }
      legs.forEach((l, i) => { l.rotation.x = o.walk ? 0.6 * Math.sin(t * 9 + i * Math.PI) : 0; });
      headG.rotation.set(o.headPitch || 0, o.headYaw ?? 0.15 * Math.sin(t * 0.8), (o.headTilt || 0) + 0.06 * Math.sin(t * 1.1));
      tails.forEach((p, i) => { const sx = i ? 1 : -1; p.rotation.z = sx * (o.blow ? 0.9 + 0.2 * Math.sin(t * 13 + i) : 0.06 * Math.sin(t * 1.7 + i) + (o.walk ? 0.12 * Math.sin(t * 9) : 0)); p.rotation.x = o.blow ? 0.6 : 0; });
      hairBack.rotation.x = o.blow ? 0.3 + 0.08 * Math.sin(t * 12) : 0.02 * Math.sin(t * 1.7);
      strands.forEach((s_, i) => { s_.visible = !!o.blow; s_.rotation.z = 1.2 + 0.3 * Math.sin(t * 14 + i); });
    },
  };
}

// ------------------------------------------------------------------ 橘色方块狗 (参考 ref/dog_ref.png: 竖耳粉内耳、白色鼻梁+白嘴套、头顶粉蝴蝶结、方眼白高光)
export const DOG = { fur: '#f7983c', furDk: '#e07d28', white: '#fffcef', nose: '#2e2018', earIn: '#ff8f9e', bow: '#ffa0b8', bowDk: '#f2708f',
                     tongue: '#f27a96', mouth: '#7a2c46', collar: '#ff6f9e', tag: '#ffd34d' };

function drawDogFace(g, s) {
  const w = 500, h = 460; g.clearRect(0, 0, w, h);
  g.fillStyle = DOG.white; g.fillRect(204, 96, 92, 280);                 // 白色鼻梁
  g.fillStyle = '#ffa3b6'; g.fillRect(30, 286, 70, 50); g.fillRect(400, 286, 70, 50);  // 方腮红
  for (const [ex, sx] of [[128, -1], [372, 1]]) {
    const ey = 180, lx = s.look * 10, ly = s.lookY * 8;
    if (s.eyes === 'happy') {
      g.fillStyle = '#2e2018';
      for (let k = -2; k <= 2; k++) g.fillRect(ex + k * 18 - 9, ey - 4 + Math.abs(k) * 16, 18, 18);
      continue;
    }
    const big = s.eyes === 'big' ? 1.14 : 1;
    const ew = 96 * big, eh = 124 * big * s.open;
    if (eh < 14) { g.fillStyle = '#2e2018'; g.fillRect(ex - ew / 2, ey - 6, ew, 14); continue; }
    let top = ey - eh / 2, hh = eh;
    if (s.eyes === 'half') { top = ey; hh = eh / 2; }
    g.fillStyle = '#2e2018'; g.fillRect(ex - ew / 2, top, ew, hh);
    if (s.eyes === 'half') { g.fillStyle = '#fff'; g.fillRect(ex + 16 * (s.side || 0) - 10, top + 10, 20, 20); continue; }
    g.fillStyle = '#ffffff';
    // 左眼: 大高光在左上; 右眼: 大高光在右上 (参考图)
    const bx = sx < 0 ? ex - ew / 2 + 12 : ex + ew / 2 - 46;
    g.fillRect(bx + lx, top + 12 + ly, 34, 34);
    g.fillRect((sx < 0 ? ex + ew / 2 - 30 : ex - ew / 2 + 14) + lx, top + eh - 34 + ly, 16, 16);
    if (s.shine > 0) { g.globalAlpha = 0.8 * s.shine; g.fillRect(bx + 40 + lx, top + 10, 8, 8); g.globalAlpha = 1; }
  }
}

export function makeDog() {
  const root = new THREE.Group();
  const B = (w, h, d, m) => mesh(rbox(w, h, d, 0.015), m);
  const fur = std(DOG.fur), furDk = std(DOG.furDk), wh = std(DOG.white), noseM = std(DOG.nose, { roughness: 0.4 });
  const head = std(DOG.fur, { emissive: new THREE.Color(DOG.fur), emissiveIntensity: 0.08 });
  const bodyPivot = new THREE.Group(); root.add(bodyPivot);
  const body = B(0.96, 0.76, 1.46, fur); body.position.set(0, 0.9, -0.5); bodyPivot.add(body);
  const chest = B(0.56, 0.42, 0.06, wh); chest.position.set(0, 0.86, 0.24); bodyPivot.add(chest);
  const legs = [];
  for (const z of [0.08, -1.08]) for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.3, 0.62, z); bodyPivot.add(piv);
    const l = B(0.28, 0.5, 0.3, fur); l.position.y = -0.24; piv.add(l);
    const p = B(0.3, 0.14, 0.33, wh); p.position.set(0, -0.55, 0.01); piv.add(p);
    legs.push(piv);
  }
  const collar = B(0.9, 0.14, 0.76, std(DOG.collar)); collar.position.set(0, 1.22, 0.12); bodyPivot.add(collar);
  const tag = B(0.16, 0.16, 0.05, std(DOG.tag, { metalness: 0.3, roughness: 0.4 })); tag.position.set(0, 1.07, 0.52); bodyPivot.add(tag);
  // 尾巴: 往上卷, 白尖
  const tailBase = new THREE.Group(); tailBase.position.set(0, 1.16, -1.22); bodyPivot.add(tailBase);
  const tailSegs = []; { let p = tailBase;
    for (let i = 0; i < 4; i++) { const s = new THREE.Group(); s.position.y = i ? 0.18 : 0;
      const m = B(0.2, 0.22, 0.2, i === 3 ? wh : fur); m.position.y = 0.09; s.add(m); p.add(s); p = s; tailSegs.push(s); } }
  // 头
  const headPivot = new THREE.Group(); headPivot.position.set(0, 1.22, 0.16); bodyPivot.add(headPivot);
  const hb = B(1.26, 1.16, 1.0, head); hb.position.set(0, 0.5, 0.06); headPivot.add(hb);
  const faceTex = canvasTex(500, 460, () => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 1.16), new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.7 }));
  face.position.set(0, 0.5, 0.562); headPivot.add(face);
  // 白嘴套 + 黑鼻子 + 会张合的下巴 + 舌头
  const snout = new THREE.Group(); snout.position.set(0, 0.06, 0.56); headPivot.add(snout);
  const up = B(0.66, 0.3, 0.3, wh); up.position.set(0, 0.1, 0.14); snout.add(up);
  const nose = B(0.24, 0.14, 0.08, noseM); nose.position.set(0, 0.19, 0.3); snout.add(nose);
  const inner = B(0.56, 0.12, 0.26, std(DOG.mouth)); inner.position.set(0, -0.06, 0.13); snout.add(inner);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.04, 0.0); snout.add(jaw);
  const low = B(0.58, 0.1, 0.28, wh); low.position.set(0, -0.06, 0.14); jaw.add(low);
  const tongue = B(0.2, 0.14, 0.05, std(DOG.tongue, { roughness: 0.5 })); tongue.position.set(0, -0.12, 0.26); jaw.add(tongue);
  const fluff = new THREE.Group(); snout.add(fluff);
  for (const [x, y, z, s] of [[0.28, 0.16, 0.3, 0.14], [-0.24, -0.08, 0.3, 0.12], [0.34, -0.04, 0.2, 0.1], [0.06, 0.32, 0.24, 0.1]]) {
    const f = mesh(rbox(s, s, s, s * 0.45), std('#ffffff')); f.position.set(x, y, z); f.rotation.set(x * 3, y * 4, 0.4); fluff.add(f);
  }
  // 竖耳 (外橘内粉)
  const ears = [];
  for (const sx of [-1, 1]) {
    const ep = new THREE.Group(); ep.position.set(sx * 0.42, 1.06, 0.12); headPivot.add(ep);
    const e = B(0.32, 0.46, 0.16, fur); e.position.y = 0.21; ep.add(e);
    const ei = B(0.17, 0.34, 0.04, std(DOG.earIn)); ei.position.set(sx * 0.02, 0.19, 0.08); ep.add(ei);
    ears.push(ep);
  }
  // 头顶粉色蝴蝶结
  const bowG = new THREE.Group(); bowG.position.set(0, 1.12, 0.3); headPivot.add(bowG);
  for (const sx of [-1, 1]) { const w = B(0.24, 0.14, 0.12, std(DOG.bow)); w.position.x = sx * 0.15; bowG.add(w); }
  const knot = B(0.08, 0.15, 0.13, std(DOG.bowDk)); bowG.add(knot);
  const st = { open: 1, eyes: 'normal', look: 0, lookY: 0, shine: 0, side: 0 };
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return {
    root, bodyPivot, headPivot, snout, jaw, faceTex, st,
    // o: yaw/pitch/tilt, perk(0..1), droop(0..1 飞机耳), eyes, look, talk(0..1), wag(0..1), walk, hop, sit, dropY, fluff
    update(t, o = {}) {
      root.visible = true;
      const br = Math.sin(t * 2.6) * 0.015;
      bodyPivot.scale.set(1 + br, 1 - br, 1 + br);
      headPivot.rotation.set((o.pitch || 0) + 0.04 * Math.sin(t * 1.9), (o.yaw || 0) + 0.1 * Math.sin(t * 1.1), (o.tilt || 0) + 0.07 * Math.sin(t * 1.6));
      // 耳朵: 一直轻轻转 + 时不时抖一下; 心虚时往后压成飞机耳
      ears.forEach((ep, i) => {
        const sx = i ? 1 : -1;
        const flick = Math.max(0, Math.sin(t * (i ? 2.1 : 1.7) + i * 2.0)) ** 16;
        const perk = o.perk || 0, droop = o.droop || 0;
        ep.rotation.set(-1.0 * droop + 0.12 * perk + 0.08 * Math.sin(t * 1.4 + i) - 0.3 * flick,
                        sx * (0.15 * Math.sin(t * 1.0 + i * 1.7) + 0.35 * flick),
                        -sx * (0.08 + 0.55 * droop - 0.06 * perk + 0.05 * Math.sin(t * 2.2 + i) + (o.talk ? 0.08 * Math.sin(t * 13 + i) : 0)));
      });
      bowG.rotation.z = 0.08 * Math.sin(t * 3);
      const walk = o.walk || 0;
      legs.forEach((l, i) => { l.rotation.x = walk * 0.6 * Math.sin(t * 12 + (i === 0 || i === 3 ? 0 : Math.PI)); });
      const wag = o.wag ?? 0.4;
      tailBase.rotation.set(-0.35, 0, (0.25 + 0.6 * wag) * Math.sin(t * (5 + 12 * wag)));
      tailSegs.forEach((s, j) => { s.rotation.x = j ? 0.45 : 0; s.rotation.z = 0.15 * wag * Math.sin(t * (5 + 12 * wag) - j * 0.6); });
      const talk = o.talk || 0;
      const talkOpen = Math.abs(Math.sin(t * 11)) * (0.6 + 0.4 * Math.sin(t * 3.7));
      jaw.rotation.x = lerp(0.08 + 0.05 * Math.sin(t * 8), 0.1 + 0.45 * talkOpen, talk);
      fluff.visible = !!o.fluff;
      const hop = o.hop || 0, sit = o.sit || 0;
      bodyPivot.position.y = hop * Math.abs(Math.sin(t * Math.PI * 1.8)) * 0.35 + (o.dropY || 0) - 0.12 * sit;
      bodyPivot.rotation.x = -0.32 * sit;
      headPivot.rotation.x += 0.3 * sit;
      Object.assign(st, { eyes: o.eyes || 'normal', look: o.look || 0, lookY: o.lookY || 0, side: o.side || 0, shine: (t % 1.8) < 0.9 ? 1 : 0 });
      st.open = 1;
      if ((st.eyes === 'normal' || st.eyes === 'big') && (t % 2.9) < 0.12) st.open = Math.abs((t % 2.9) - 0.06) / 0.06;
      drawDogFace(faceTex.userData.g, st); faceTex.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ 孔雀 / 九尾狐
export function makePeacock() {
  const root = new THREE.Group(), fan = new THREE.Group(); fan.position.set(0, 0.9, -0.2); root.add(fan);
  const feather = std('#4fb8a6'), eye = std('#3c6fd0'), blue = std('#5b8fe0'), gold = std('#f2c14e');
  const feathers = [];
  for (let i = 0; i < 11; i++) {
    const g = new THREE.Group(); g.rotation.z = -1.4 + 2.8 * i / 10; fan.add(g);
    const f = mesh(new THREE.SphereGeometry(0.26, 16, 12), feather); f.scale.set(1, 1.6, 0.25); f.position.y = 1.0; g.add(f);
    const e = mesh(new THREE.SphereGeometry(0.11, 12, 8), eye); e.scale.set(1, 1.3, 0.3); e.position.set(0, 1.08, 0.06); g.add(e);
    const q = box(0.05, 0.8, 0.05, '#8fd3c3', 0.02); q.position.y = 0.45; g.add(q);
    feathers.push(g);
  }
  const b = box(0.6, 0.6, 0.7, blue, 0.12); b.position.y = 0.75; root.add(b);
  const n = box(0.2, 0.75, 0.22, blue, 0.06); n.position.set(0, 1.35, 0.22); root.add(n);
  const hd = box(0.32, 0.3, 0.36, blue, 0.08); hd.position.set(0, 1.8, 0.3); root.add(hd);
  const bk = mesh(new THREE.ConeGeometry(0.07, 0.22, 4), gold); bk.rotation.x = Math.PI / 2; bk.position.set(0, 1.78, 0.56); root.add(bk);
  for (let i = -1; i <= 1; i++) { const c = mesh(new THREE.SphereGeometry(0.05, 8, 6), blue); c.position.set(i * 0.08, 2.1, 0.3); root.add(c); }
  for (const sx of [-1, 1]) { const l = box(0.06, 0.5, 0.06, gold, 0.02); l.position.set(sx * 0.14, 0.25, 0); root.add(l); }
  for (const sx of [-1, 1]) { const e = box(0.05, 0.06, 0.02, '#1b1218', 0.01); e.position.set(sx * 0.1, 1.84, 0.49); root.add(e); }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, update(t) { root.visible = true; feathers.forEach((g, i) => { g.rotation.x = 0.05 * Math.sin(t * 3 + i); }); fan.scale.setScalar(1 + 0.03 * Math.sin(t * 4)); } };
}
export function makeFox() {
  const root = new THREE.Group(); const fur = std('#f39a5d'), white = std('#fff6ee'), ink = std('#2a1a22');
  const tails = [];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group(); g.position.set(0, 0.5, -0.4); g.rotation.set(-0.5, 0, -1.3 + 2.6 * i / 8); root.add(g);
    const t1 = box(0.22, 0.9, 0.22, fur, 0.08); t1.position.y = 0.45; g.add(t1);
    const t2 = box(0.22, 0.25, 0.22, white, 0.08); t2.position.y = 0.98; g.add(t2);
    tails.push(g);
  }
  const b = box(0.7, 0.6, 0.9, fur, 0.1); b.position.y = 0.4; root.add(b);
  const h = box(0.7, 0.6, 0.6, fur, 0.1); h.position.set(0, 1.0, 0.25); root.add(h);
  const m = box(0.36, 0.2, 0.2, white, 0.05); m.position.set(0, 0.88, 0.6); root.add(m);
  for (const sx of [-1, 1]) {
    const e = mesh(new THREE.ConeGeometry(0.16, 0.36, 4), fur); e.rotation.y = Math.PI / 4; e.position.set(sx * 0.22, 1.46, 0.25); root.add(e);
    const ey = box(0.14, 0.035, 0.02, ink, 0.01); ey.position.set(sx * 0.16, 1.06, 0.56); ey.rotation.z = sx * 0.15; root.add(ey);
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { root, update(t) { root.visible = true; tails.forEach((g, i) => { g.rotation.x = -0.5 + 0.08 * Math.sin(t * 2 + i); }); } };
}
