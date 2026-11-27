// 共享工具 + 3D 粉色方块猫 (参考用户给的 3D 方块猫造型: 大方头、方眼睛白高光、四棱锥耳朵; 身体是小鱼花纹)
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

// ------------------------------------------------------------------ 主人: 方块风女生 (长发 + 发卡 + 连衣裙, 大眼睛)
function drawGirlFace(g, s) {
  const w = 300, h = 280; g.clearRect(0, 0, w, h);
  // 腮红
  g.fillStyle = 'rgba(246,128,150,0.55)';
  for (const x of [52, 248]) { g.beginPath(); g.ellipse(x, 190, 30, 15, 0, 0, 7); g.fill(); }
  for (const [ex, sx] of [[95, -1], [205, 1]]) {
    const ey = 140;
    if (s.blink) {   // 闭眼: 弯弯的线 + 睫毛
      g.strokeStyle = '#3a2230'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.arc(ex, ey - 6, 26, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      continue;
    }
    const k = s.shock ? 1.15 : 1;
    // 眼白 + 棕色瞳孔 + 黑瞳 + 两个高光
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(ex, ey, 30 * k, 38 * k, 0, 0, 7); g.fill();
    g.fillStyle = '#7a4a3a'; g.beginPath(); g.ellipse(ex + s.look * 5, ey + 4, 24 * k, 32 * k, 0, 0, 7); g.fill();
    g.fillStyle = '#2b1820'; g.beginPath(); g.ellipse(ex + s.look * 5, ey + 6, s.shock ? 9 : 14, s.shock ? 12 : 19, 0, 0, 7); g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(ex - 9 + s.look * 5, ey - 10, 9, 11, 0, 0, 7); g.fill();
    g.beginPath(); g.arc(ex + 10 + s.look * 5, ey + 18, 4.5, 0, 7); g.fill();
    // 上眼线 + 睫毛
    g.strokeStyle = '#2b1820'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.ellipse(ex, ey, 31 * k, 39 * k, 0, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke();
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(ex + sx * 26, ey - 28); g.lineTo(ex + sx * 40, ey - 40); g.stroke();
    g.beginPath(); g.moveTo(ex + sx * 30, ey - 18); g.lineTo(ex + sx * 44, ey - 24); g.stroke();
  }
  // 眉毛 + 嘴
  g.strokeStyle = '#6b4134'; g.lineWidth = 6; g.lineCap = 'round';
  for (const ex of [95, 205]) { g.beginPath(); g.moveTo(ex - 22, s.shock ? 70 : 80); g.quadraticCurveTo(ex, s.shock ? 60 : 72, ex + 22, s.shock ? 70 : 80); g.stroke(); }
  if (s.shock) { g.fillStyle = '#c8506a'; g.beginPath(); g.ellipse(150, 226, 13, 17, 0, 0, 7); g.fill(); }
  else { g.strokeStyle = '#d2556f'; g.lineWidth = 7; g.beginPath(); g.arc(150, 206, 20, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke(); }
}

export function makePerson() {
  const root = new THREE.Group();
  const dress = std('#3fb0a0'), dressDk = std('#2f9384'), skin = std('#f7d3bd'), hair = std('#6b4134'), hairHi = std('#85533f');
  const white = std('#ffffff'), shoe = std('#f27aa0'), bow = std('#ff7aa6');
  // 腿 + 鞋
  for (const sx of [-1, 1]) {
    const l = box(0.2, 0.78, 0.22, skin, 0.06); l.position.set(sx * 0.17, 0.46, 0); root.add(l);
    const sh = box(0.26, 0.14, 0.34, shoe, 0.05); sh.position.set(sx * 0.17, 0.07, 0.05); root.add(sh);
  }
  // 连衣裙: 伞形裙摆 + 上身 + 白领子 + 腰带
  const skirt = mesh(new THREE.CylinderGeometry(0.42, 0.72, 0.8, 8, 1), dress); skirt.rotation.y = Math.PI / 8; skirt.position.y = 1.15; root.add(skirt);
  const belt = mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.1, 8, 1), dressDk); belt.rotation.y = Math.PI / 8; belt.position.y = 1.56; root.add(belt);
  const torso = box(0.78, 0.62, 0.46, dress, 0.12); torso.position.y = 1.9; root.add(torso);
  for (const sx of [-1, 1]) { const c = box(0.26, 0.1, 0.06, white, 0.03); c.position.set(sx * 0.13, 2.18, 0.23); c.rotation.z = -sx * 0.35; root.add(c); }
  const neck = box(0.18, 0.14, 0.16, skin, 0.04); neck.position.y = 2.25; root.add(neck);
  // 手臂: 泡泡袖 + 手臂 + 手
  const arms = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.48, 2.12, 0); root.add(piv);
    const sl = box(0.28, 0.28, 0.3, dress, 0.1); sl.position.y = -0.08; piv.add(sl);
    const a = box(0.16, 0.62, 0.18, skin, 0.06); a.position.y = -0.48; piv.add(a);
    const hnd = box(0.18, 0.16, 0.2, skin, 0.06); hnd.position.y = -0.84; piv.add(hnd);
    arms.push(piv);
  }
  // 头 + 脸贴图
  const headG = new THREE.Group(); headG.position.y = 2.3; root.add(headG);
  const h = box(0.84, 0.8, 0.76, skin, 0.1); h.position.y = 0.42; headG.add(h);
  const faceTex = canvasTex(300, 280, () => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.73), new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.6 }));
  face.position.set(0, 0.4, 0.385); headG.add(face);
  // 头发: 头顶 + 刘海 + 两侧 + 背后长发 + 发卡蝴蝶结
  const top = box(0.94, 0.26, 0.86, hair, 0.1); top.position.y = 0.86; headG.add(top);
  for (let i = 0; i < 4; i++) { const bg_ = box(0.24, 0.2 + (i % 2) * 0.06, 0.1, i % 2 ? hairHi : hair, 0.04); bg_.position.set(-0.33 + i * 0.22, 0.72 - (i % 2) * 0.03, 0.4); headG.add(bg_); }
  const side = [];
  for (const sx of [-1, 1]) { const s_ = box(0.14, 0.95, 0.56, hair, 0.06); s_.position.set(sx * 0.48, 0.38, -0.04); headG.add(s_); side.push(s_); }
  const longHair = box(0.94, 1.35, 0.24, hair, 0.08); longHair.position.set(0, 0.22, -0.38); headG.add(longHair);
  const tip = box(0.8, 0.2, 0.22, hairHi, 0.08); tip.position.set(0, -0.48, -0.38); headG.add(tip);
  const bowG = new THREE.Group(); bowG.position.set(0.3, 0.98, 0.18); bowG.rotation.z = -0.3; headG.add(bowG);
  for (const sx of [-1, 1]) { const w_ = mesh(new THREE.ConeGeometry(0.12, 0.22, 4), bow); w_.rotation.z = sx * Math.PI / 2; w_.position.x = sx * 0.1; bowG.add(w_); }
  const knot = box(0.08, 0.08, 0.08, bow, 0.02); bowG.add(knot);
  // 被风吹起的发丝
  const strands = [];
  for (let i = 0; i < 5; i++) { const s_ = box(0.08, 0.45, 0.08, hair, 0.03); s_.position.set(-0.3 + i * 0.15, 0.95, -0.2); headG.add(s_); strands.push(s_); }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const st = { blink: false, shock: false, look: 0 };
  const hands = arms.map(a => a.children[2]);
  return {
    root, hands, arms,
    update(t, o = {}) {
      root.visible = true;
      root.position.y = 0.02 * Math.sin(t * 2.4);
      root.scale.set(1, 1 + 0.008 * Math.sin(t * 2.4), 1);
      st.blink = (t % 2.9) < 0.12 && !o.shock; st.shock = !!o.shock; st.look = 0.6 * Math.sin(t * 0.7);
      drawGirlFace(faceTex.userData.g, st); faceTex.needsUpdate = true;
      arms[0].rotation.z = o.wave ? -2.5 + 0.35 * Math.sin(t * 8) : -0.1 - 0.03 * Math.sin(t * 2.4);
      arms[1].rotation.z = o.reach ? 1.25 + 0.1 * Math.sin(t * 6) : 0.1 + 0.03 * Math.sin(t * 2.4);
      arms[0].rotation.x = 0; arms[1].rotation.x = o.hold ? -0.7 : 0; if (o.hold) arms[1].rotation.z = 0.35;
      headG.rotation.set(0, o.headYaw ?? 0.15 * Math.sin(t * 0.8), 0.06 * Math.sin(t * 1.1));
      bowG.rotation.y = 0.15 * Math.sin(t * 3);
      longHair.rotation.x = 0.04 * Math.sin(t * 1.7) + (o.blow ? 0.35 + 0.1 * Math.sin(t * 12) : 0);
      side.forEach((s_, i) => { s_.rotation.z = (o.blow ? 0.4 : 0.03) * Math.sin(t * (o.blow ? 13 : 1.5) + i); });
      strands.forEach((s_, i) => { s_.visible = !!o.blow; s_.rotation.z = 1.2 + 0.3 * Math.sin(t * 14 + i); });
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

// ------------------------------------------------------------------ 奶油色方块狗 (主角): 大方头 + 方嘴筒 + 垂耳 + 小骨头花纹
export const DOG = { head: '#f8e1bd', body: '#f5d5a6', ear: '#d79a68', earIn: '#f2bfa0', muzzle: '#fff4e4', nose: '#3a2228',
                     paw: '#fff4e4', tail: '#f1c992', collar: '#ff6f9e', tag: '#ffd24a', mud: '#9a6a48' };

function drawDogFace(g, s) {
  const w = 520, h = 400; g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(240,110,140,0.7)';                                    // 腮红
  for (const x of [40, 410]) { g.beginPath(); g.roundRect(x, 300, 70, 30, 8); g.fill(); }
  g.fillStyle = '#e8bf8c';                                                  // 豆豆眉
  for (const x of [150, 370]) { g.beginPath(); g.roundRect(x - 30, s.eyes === 'worry' ? 52 : 40, 60, 26, 12); g.fill(); }
  for (const ex of [150, 370]) {
    const ey = 200, lx = s.look * 14, ly = s.lookY * 10;
    g.fillStyle = '#1b1218'; g.strokeStyle = '#1b1218';
    if (s.eyes === 'happy') {
      g.lineWidth = 22; g.lineCap = 'square'; g.lineJoin = 'miter';
      g.beginPath(); g.moveTo(ex - 50, ey + 30); g.lineTo(ex, ey - 22); g.lineTo(ex + 50, ey + 30); g.stroke(); continue;
    }
    if (s.eyes === 'dizzy') {   // 转晕: 方形螺旋
      g.lineWidth = 12; g.lineCap = 'square'; g.beginPath();
      let x = ex, y = ey, L = 12, dir = s.spin | 0;
      g.moveTo(x, y);
      for (let k = 0; k < 9; k++) { const d = (dir + k) % 4; x += [L, 0, -L, 0][d]; y += [0, L, 0, -L][d]; g.lineTo(x, y); if (k % 2) L += 22; }
      g.stroke(); continue;
    }
    if (s.eyes === 'squint') { g.lineWidth = 20; g.lineCap = 'square'; g.beginPath(); g.moveTo(ex - 50, ey - 20); g.lineTo(ex + 40, ey + 6); g.lineTo(ex - 50, ey + 32); g.stroke(); continue; }
    const big = s.eyes === 'big' ? 1.12 : 1, open = s.open;
    const ew = 112 * big, eh = 136 * big * open;
    if (eh < 12) { g.fillRect(ex - 56, ey - 6, 112, 14); continue; }
    const top = ey - eh / 2;
    g.fillRect(ex - ew / 2, top, ew, eh);
    if (open > 0.6) {
      g.fillStyle = '#ffffff'; g.fillRect(ex - 40 + lx, top + 16 + ly, 38 * big, 38 * big);
      g.fillRect(ex + 14 + lx, top + 78 * big + ly, 22, 22); g.fillRect(ex - 16 + lx, top + 90 * big + ly, 12, 12);
      if (s.eyes === 'big') { g.fillRect(ex + 20 + lx, top + 14, 16, 16); }
    }
  }
}
function drawMouth(g, s) {   // 嘴筒正面: 嘴型
  const w = 256, h = 160; g.clearRect(0, 0, w, h);
  g.strokeStyle = '#7a3a48'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(128, 30); g.lineTo(128, 62); g.stroke();
  if (s.mouth === 'smile') { g.beginPath(); g.moveTo(70, 52); g.quadraticCurveTo(98, 88, 128, 62); g.quadraticCurveTo(158, 88, 186, 52); g.stroke(); }
  else {   // 张嘴 (bark 更大) + 舌头
    const k = s.mouth === 'bark' ? 1.35 : 1;
    g.fillStyle = '#7a3a48'; g.beginPath(); g.roundRect(128 - 52 * k, 62, 104 * k, 58 * k, [6, 6, 30, 30]); g.fill();
    g.fillStyle = '#ff8aa8'; g.beginPath(); g.roundRect(128 - 30 * k, 62 + 26 * k, 60 * k, 34 * k, 14); g.fill();
  }
}
// 身体花纹: 小骨头 + 小爪印 (白/浅蓝/珊瑚/薄荷)
const boneTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = DOG.body; g.fillRect(0, 0, w, h);
  const r = rng(12), cols = ['#ffffff', '#a8d0f5', '#f7a08a', '#9fdcc0'];
  const bone = (x, y, s, a, c) => {
    g.save(); g.translate(x, y); g.rotate(a); g.scale(s, s); g.fillStyle = c;
    g.fillRect(-12, -4, 24, 8);
    for (const [bx, by] of [[-13, -5], [-13, 5], [13, -5], [13, 5]]) { g.beginPath(); g.arc(bx, by, 5.5, 0, 7); g.fill(); }
    g.restore();
  };
  const paw = (x, y, s, c) => {
    g.save(); g.translate(x, y); g.scale(s, s); g.fillStyle = c;
    g.beginPath(); g.ellipse(0, 4, 8, 6.5, 0, 0, 7); g.fill();
    for (const [px, py] of [[-8, -6], [-3, -10], [3, -10], [8, -6]]) { g.beginPath(); g.arc(px, py, 3, 0, 7); g.fill(); }
    g.restore();
  };
  for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 2; gx++) {
    const x = gx * 128 + 40 + (gy % 2) * 46 + r() * 20, y = gy * 128 + 40 + r() * 40, a = (r() - 0.5) * 2;
    const c = cols[(gx + gy * 2) % 4], isPaw = (gx + gy) % 2 === 1;
    for (const [dx, dy] of [[0, 0], [w, 0], [-w, 0], [0, h], [0, -h]]) isPaw ? paw(x + dx, y + dy, 1.4, c) : bone(x + dx, y + dy, 1.5, a, c);
  }
});
boneTex.wrapS = boneTex.wrapT = THREE.RepeatWrapping;

export function makeDog() {
  const root = new THREE.Group();
  const bodyMat = std('#ffffff', { map: boneTex });
  const headMat = std(DOG.head, { emissive: new THREE.Color(DOG.head), emissiveIntensity: 0.12 });
  const earMat = std(DOG.ear), muz = std(DOG.muzzle), pawMat = std(DOG.paw), tailMat = std(DOG.tail);
  const bodyPivot = new THREE.Group(); root.add(bodyPivot);
  const body = mesh(rbox(0.98, 0.78, 1.45, 0.1), bodyMat); body.position.set(0, 0.68, -0.5); bodyPivot.add(body);
  const belly = mesh(rbox(0.7, 0.2, 1.1, 0.08), muz); belly.position.set(0, 0.32, -0.5); bodyPivot.add(belly);
  // 四条腿 (髋/肩处可转)
  const legs = [];
  for (const [sx, z] of [[-1, 0.0], [1, 0.0], [-1, -1.0], [1, -1.0]]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.3, 0.5, z); bodyPivot.add(piv);
    const l = mesh(rbox(0.26, 0.42, 0.28, 0.06), bodyMat); l.position.y = -0.2; piv.add(l);
    const p = mesh(rbox(0.3, 0.14, 0.34, 0.05), pawMat); p.position.set(0, -0.43, 0.03); piv.add(p);
    legs.push(piv);
  }
  // 泥点 (跳水坑后出现)
  const mudMat = std(DOG.mud, { roughness: 1 });
  const muds = [];
  { const r = rng(4); for (let i = 0; i < 14; i++) { const m = mesh(rbox(0.1 + r() * 0.1, 0.03, 0.1 + r() * 0.1, 0.015), mudMat, false);
    const side = i % 3; if (side === 0) m.position.set((r() - 0.5) * 0.8, 1.08, -0.5 + (r() - 0.5) * 1.2);
    else { m.rotation.z = Math.PI / 2; m.position.set((side === 1 ? -1 : 1) * 0.5, 0.5 + r() * 0.35, -0.5 + (r() - 0.5) * 1.2); }
    bodyPivot.add(m); muds.push(m); } }
  // 尾巴: 往上翘的方块链, 狗摇尾巴很快
  const tailBase = new THREE.Group(); tailBase.position.set(0, 0.95, -1.2); bodyPivot.add(tailBase);
  const tsegs = []; { let p = tailBase; for (let i = 0; i < 5; i++) { const s = new THREE.Group(); s.position.y = i ? 0.17 : 0;
    const m = mesh(rbox(0.17 - i * 0.015, 0.22, 0.17 - i * 0.015, 0.05), i === 4 ? muz : tailMat); m.position.y = 0.085; s.add(m); p.add(s); p = s; tsegs.push(s); } }
  // 项圈 + 金色铃铛牌
  const collar = mesh(rbox(0.86, 0.14, 0.72, 0.06), std(DOG.collar)); collar.position.set(0, 0.98, 0.08); bodyPivot.add(collar);
  const tag = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 20), std(DOG.tag, { metalness: 0.3, roughness: 0.35 }));
  tag.rotation.x = Math.PI / 2; tag.position.set(0, 0.84, 0.45); bodyPivot.add(tag);
  // 头 (脖子处可转)
  const headPivot = new THREE.Group(); headPivot.position.set(0, 1.0, 0.15); bodyPivot.add(headPivot);
  const head = mesh(rbox(1.22, 1.0, 0.98, 0.1), headMat); head.position.set(0, 0.42, 0.05); headPivot.add(head);
  const faceTex = canvasTex(520, 400, () => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 0.89), new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.6 }));
  face.position.set(0, 0.47, 0.546); headPivot.add(face);
  const snout = mesh(rbox(0.6, 0.38, 0.36, 0.08), muz); snout.position.set(0, 0.17, 0.66); headPivot.add(snout);
  const nose = mesh(rbox(0.24, 0.14, 0.12, 0.05), std(DOG.nose, { roughness: 0.3 })); nose.position.set(0, 0.32, 0.84); headPivot.add(nose);
  const mouthTex = canvasTex(256, 160, () => {});
  const mouthP = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.35), new THREE.MeshStandardMaterial({ map: mouthTex, transparent: true, roughness: 0.6 }));
  mouthP.position.set(0, 0.17, 0.842); headPivot.add(mouthP);
  const tongue = mesh(rbox(0.16, 0.24, 0.06, 0.03), std('#ff8aa8')); tongue.position.set(0.08, 0.0, 0.8); headPivot.add(tongue);
  const mouthSlot = new THREE.Group(); mouthSlot.position.set(0, 0.06, 0.92); headPivot.add(mouthSlot);   // 叼东西
  // 垂耳
  const ears = [];
  for (const sx of [-1, 1]) {
    const ep = new THREE.Group(); ep.position.set(sx * 0.58, 0.86, 0.02); headPivot.add(ep);
    const e = mesh(rbox(0.16, 0.62, 0.42, 0.07), earMat); e.position.set(sx * 0.06, -0.26, 0); ep.add(e);
    ears.push(ep);
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const st = { open: 1, eyes: 'normal', look: 0, lookY: 0, mouth: 'smile', spin: 0 };
  return {
    root, bodyPivot, headPivot, ears, legs, mouthSlot, muds, faceTex,
    // o: yaw/pitch/tilt, ears(-1 垂/0/1 竖), eyes, mouth(smile/open/bark), wag(0..2), walk(步频倍数), hop, dropY, mud(0..1), tongue
    update(t, o = {}) {
      root.visible = true;
      const br = Math.sin(t * 2.6) * 0.015; bodyPivot.scale.set(1 + br, 1 - br, 1 + br);
      headPivot.rotation.set((o.pitch || 0) + 0.04 * Math.sin(t * 1.9), (o.yaw || 0) + 0.1 * Math.sin(t * 1.1), (o.tilt || 0) + 0.07 * Math.sin(t * 1.6));
      const up = o.ears || 0;
      ears.forEach((ep, i) => {   // 耳朵一直轻轻晃, 时不时甩一下
        const sx = i ? 1 : -1, flick = Math.max(0, Math.sin(t * (i ? 2.2 : 1.8) + i * 2)) ** 14;
        ep.rotation.set(0.12 * Math.sin(t * 1.4 + i) - 0.2 * flick, 0, sx * (0.15 + 0.1 * Math.sin(t * 1.1 + i * 1.7) + 0.5 * flick + 1.2 * Math.max(0, up)) - sx * 0.2 * Math.min(0, up));
      });
      const wk = o.walk || 0, ws = o.walkHz || 10;
      legs.forEach((l, i) => { l.rotation.x = wk ? 0.6 * Math.sin(t * ws + (i === 0 || i === 3 ? 0 : Math.PI)) : (o.sit && i >= 2 ? -1.1 : 0); });
      bodyPivot.rotation.x = o.sit ? -0.32 : 0;
      const wag = o.wag ?? 1;
      tailBase.rotation.set(-0.35 + (o.sit ? 0.3 : 0), 0, 0);
      tsegs.forEach((s, j) => { s.rotation.z = (0.18 + 0.12 * wag) * Math.sin(t * (6 + 8 * wag) - j * 0.5); s.rotation.x = j ? -0.18 : 0; });
      const hop = o.hop || 0;
      bodyPivot.position.y = hop * Math.abs(Math.sin(t * Math.PI * 1.8)) * 0.35 + (o.dropY || 0) + (o.sit ? -0.08 : 0);
      muds.forEach((m, i) => { m.visible = (o.mud || 0) > i / muds.length; });
      tongue.visible = o.tongue ?? (o.mouth === 'open');
      tongue.rotation.x = 0.15 * Math.sin(t * 9); tongue.position.y = (o.mouth === 'open' || o.mouth === 'bark') ? -0.02 : 0.0;
      Object.assign(st, { eyes: o.eyes || 'normal', look: o.look || 0, lookY: o.lookY || 0, mouth: o.mouth || 'smile', spin: (t * 8) | 0 });
      st.open = 1;
      if ((st.eyes === 'normal' || st.eyes === 'big') && (t % 2.9) < 0.12) st.open = Math.abs((t % 2.9) - 0.06) / 0.06;
      drawDogFace(faceTex.userData.g, st); faceTex.needsUpdate = true;
      drawMouth(mouthTex.userData.g, st); mouthTex.needsUpdate = true;
    },
  };
}
