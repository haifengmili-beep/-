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

// ------------------------------------------------------------------ 主人: 方块女孩 (按用户参考图: 大方头、方眼睛、两侧粉色发饰、粉色上衣 + 两层粉裙)
function drawGirlFace(g, s) {
  const w = 300, h = 280; g.clearRect(0, 0, w, h);
  g.fillStyle = '#f7869f';   // 方形腮红
  for (const x of [26, 222]) g.fillRect(x, 168, 52, 24);
  for (const [ex, sx] of [[92, -1], [208, 1]]) {
    const ey = 120;
    if (s.blink) { g.fillStyle = '#2b1a14'; g.fillRect(ex - 34, ey + 10, 68, 10); continue; }
    const k = s.shock ? 1.12 : 1, ew = 64 * k, eh = 84 * k, x0 = ex - ew / 2, y0 = ey - eh / 2;
    g.fillStyle = '#2b1a14'; g.fillRect(x0, y0, ew, eh);                          // 深棕上半
    g.fillStyle = '#8a4e2e'; g.fillRect(x0 + 6, y0 + eh * 0.55, ew - 12, eh * 0.38); // 浅棕下半
    const lx = s.look * 6;
    g.fillStyle = '#ffffff'; g.fillRect(x0 + ew * 0.5 + lx, y0 + 8, 22, 22); g.fillRect(x0 + 8 + lx, y0 + eh - 26, 12, 12);
    // 上眼线 + 外眼角睫毛
    g.fillStyle = '#2b1a14';
    if (s.stern) { g.save(); g.translate(ex, y0 - 8); g.rotate(-sx * 0.18); g.fillRect(-ew / 2 - 8, -6, ew + 16, 12); g.restore(); }
    else { g.fillRect(x0 - 8, y0 - 10, ew + 16, 12); g.fillRect(sx < 0 ? x0 - 14 : x0 + ew + 2, y0 - 18, 12, 14); }
  }
  // 小方嘴
  if (s.shock) { g.fillStyle = '#b8405a'; g.fillRect(132, 196, 36, 34); }
  else if (s.stern) { g.fillStyle = '#b8405a'; g.fillRect(132, 206, 36, 9); }
  else { g.fillStyle = '#c44a64'; g.fillRect(132, 198, 36, 20); g.fillStyle = '#f38aa0'; g.fillRect(140, 208, 20, 10); }
}

export function makePerson() {
  const root = new THREE.Group();
  const B = (w, h, d, c) => box(w, h, d, c, 0.015);
  const skin = std('#f9dcc6'), hair = '#7a4a30', hairDk = '#4e2c1c', top = '#e98fab', bowC = '#ff7fa2', bowDk = '#c2405f';
  for (const sx of [-1, 1]) {   // 腿 + 白袜 + 粉鞋
    const l = B(0.18, 0.5, 0.2, '#f9dcc6'); l.position.set(sx * 0.15, 0.5, 0); root.add(l);
    const so = B(0.21, 0.14, 0.22, '#ffffff'); so.position.set(sx * 0.15, 0.24, 0); root.add(so);
    const sh = B(0.24, 0.16, 0.3, '#ff7ea0'); sh.position.set(sx * 0.15, 0.08, 0.03); root.add(sh);
  }
  // 两层裙子 + 白边
  const hem = B(0.82, 0.08, 0.6, '#fff6ec'); hem.position.y = 0.78; root.add(hem);
  const sk2 = B(0.8, 0.3, 0.58, '#ff8fb0'); sk2.position.y = 0.96; root.add(sk2);
  const sk1 = B(0.7, 0.24, 0.5, '#ffb0c8'); sk1.position.y = 1.23; root.add(sk1);
  const torso = B(0.62, 0.5, 0.4, top); torso.position.y = 1.58; root.add(torso);
  const collar = B(0.36, 0.08, 0.06, '#ffffff'); collar.position.set(0, 1.79, 0.2); root.add(collar);
  for (const sx of [-1, 1]) { const b = B(0.12, 0.1, 0.05, bowDk); b.position.set(sx * 0.07, 1.68, 0.22); root.add(b); }
  const neck = B(0.16, 0.1, 0.14, '#f9dcc6'); neck.position.y = 1.86; root.add(neck);
  const arms = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.4, 1.76, 0); root.add(piv);
    const sl = B(0.22, 0.22, 0.24, top); sl.position.y = -0.08; piv.add(sl);
    const a = B(0.14, 0.42, 0.16, '#f9dcc6'); a.position.y = -0.38; piv.add(a);
    const hnd = B(0.16, 0.14, 0.18, '#f9dcc6'); hnd.position.y = -0.64; piv.add(hnd);
    arms.push(piv);
  }
  const phone = B(0.1, 0.3, 0.18, '#5a4a7a'); phone.position.set(0.02, -0.66, 0.1); arms[1].add(phone);
  // 大方头 + 脸贴图
  const headG = new THREE.Group(); headG.position.y = 1.9; root.add(headG);
  const hd = mesh(rbox(1.0, 0.92, 0.84, 0.015), skin); hd.position.y = 0.48; headG.add(hd);
  const faceTex = canvasTex(300, 280, () => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.9), new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.7 }));
  face.position.set(0, 0.42, 0.425); headG.add(face);
  // 头发: 头顶 + 参差刘海 + 两侧到肩膀 + 后面
  const crown = B(1.06, 0.3, 0.92, hair); crown.position.y = 1.02; headG.add(crown);
  [[-0.36, 0.16, 0.18], [-0.12, 0.24, 0.12], [0.1, 0.16, 0.16], [0.33, 0.22, 0.14]].forEach(([x, w_, h_]) => {
    const b = B(w_ + 0.06, h_, 0.08, hair); b.position.set(x, 0.88 - h_ / 2 + 0.05, 0.43); headG.add(b); });
  const side = [];
  for (const sx of [-1, 1]) {
    const s1 = B(0.16, 0.8, 0.5, hair); s1.position.set(sx * 0.56, 0.62, 0.0); headG.add(s1);
    const s2 = B(0.2, 0.42, 0.4, hairDk); s2.position.set(sx * 0.6, 0.06, 0.04); headG.add(s2); side.push(s2);
  }
  const backH = B(1.04, 1.0, 0.16, hairDk); backH.position.set(0, 0.5, -0.46); headG.add(backH);
  // 两侧粉色发饰 (方块花球)
  const bows = [];
  for (const sx of [-1, 1]) {
    const g_ = new THREE.Group(); g_.position.set(sx * 0.74, 0.72, 0.0); headG.add(g_);
    [[0, 0.1, 0.2, 0.14], [0, -0.04, 0.24, 0.14], [0, -0.16, 0.16, 0.1], [0, -0.26, 0.1, 0.08]].forEach(([x, y, w_, h_], i) => {
      const b = B(w_, h_, 0.16, i % 2 ? bowC : '#ff9db8'); b.position.set(x, y, 0); g_.add(b); });
    const tie = B(0.08, 0.12, 0.1, bowDk); tie.position.set(-sx * 0.12, 0.2, 0); g_.add(tie);
    bows.push(g_);
  }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const st = { blink: false, shock: false, stern: false, look: 0 };
  return {
    root, arms, headG,
    update(t, o = {}) {
      root.visible = true;
      root.position.y = 0.02 * Math.sin(t * 2.4);
      root.scale.set(1, 1 + 0.008 * Math.sin(t * 2.4), 1);
      st.blink = (t % 2.9) < 0.12 && !o.shock; st.shock = !!o.shock; st.stern = !!o.stern && !o.shock; st.look = 0.6 * Math.sin(t * 0.7);
      drawGirlFace(faceTex.userData.g, st); faceTex.needsUpdate = true;
      arms[0].rotation.set(0, 0, o.wave ? -2.5 + 0.35 * Math.sin(t * 8) : -0.1 - 0.03 * Math.sin(t * 2.4));
      arms[1].rotation.set(0, 0, o.reach ? 1.25 + 0.1 * Math.sin(t * 6) : 0.1 + 0.03 * Math.sin(t * 2.4));
      if (o.place != null) { arms[1].rotation.z = 0.25; arms[1].rotation.x = -0.4 - 0.9 * o.place; }
      if (o.hips) { arms[0].rotation.z = -0.55; arms[1].rotation.z = 0.55; arms[0].rotation.x = arms[1].rotation.x = 0.25; }
      phone.visible = !!o.phone;
      if (o.phone) { arms[1].rotation.z = 2.75; arms[1].rotation.x = -0.35; }
      headG.rotation.set(0, o.headYaw ?? 0.15 * Math.sin(t * 0.8), 0.06 * Math.sin(t * 1.1));
      bows.forEach((b, i) => { b.rotation.z = 0.12 * Math.sin(t * 3 + i * 1.5); });
      side.forEach((s_, i) => { s_.rotation.z = (o.blow ? 0.4 : 0.04) * Math.sin(t * (o.blow ? 13 : 1.5) + i); });
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

// ------------------------------------------------------------------ 小狗 (按用户参考图: 橙色方头、白鼻梁白嘴套、竖耳粉内耳、头顶粉蝴蝶结、棕色身体、白脚)
export const DOG = { fur: '#f59a3e', furDk: '#d97a2a', brown: '#8a5020', cream: '#fffbe8', nose: '#2b1f1a' };
function drawDogFace(g, s) {
  const w = 520, h = 300; g.clearRect(0, 0, w, h);
  g.fillStyle = DOG.cream; g.fillRect(205, 0, 110, h);                        // 白色鼻梁
  g.fillStyle = '#ffa3b6';                                                     // 方形腮红
  for (const x of [20, 430]) g.fillRect(x, 222, 70, 52);
  for (const [ex, sx] of [[118, -1], [402, 1]]) {
    const ey = 150;
    // 委屈眉毛 (深橙小方条): 里面高外面低
    g.fillStyle = '#b8601c';
    g.save(); g.translate(ex, ey - 98 - 8 * s.sad); g.rotate(sx * (0.2 + 0.3 * s.sad)); g.fillRect(-46, -10, 92, 20); g.restore();
    if (s.eyes === 'happy') {
      g.strokeStyle = '#2b1f1a'; g.lineWidth = 22; g.lineJoin = 'miter';
      g.beginPath(); g.moveTo(ex - 48, ey + 26); g.lineTo(ex, ey - 20); g.lineTo(ex + 48, ey + 26); g.stroke(); continue;
    }
    if (s.eyes === 'squeeze' || s.open < 0.15) {
      g.strokeStyle = '#2b1f1a'; g.lineWidth = 20; g.lineJoin = 'miter';
      g.beginPath(); g.moveTo(ex - sx * 44, ey - 34); g.lineTo(ex + sx * 30, ey); g.lineTo(ex - sx * 44, ey + 34); g.stroke(); continue;
    }
    // 方形深色大眼 + 白色方形高光; 斜眼时另一侧露出一条眼白
    const k = s.eyes === 'wide' ? 1.12 : 1, ew = 112 * k, eh = 128 * s.open * k, x0 = ex - ew / 2, y0 = ey - eh / 2;
    g.fillStyle = '#ffffff'; if (Math.abs(s.look) > 0.2) g.fillRect(x0, y0, ew, eh);
    const shift = s.look * 26, pw = ew - Math.abs(s.look) * 30;
    g.fillStyle = '#2b1f1a'; g.fillRect(ex - pw / 2 + shift, y0, pw, eh);
    if (s.open > 0.6) {
      g.fillStyle = '#ffffff'; g.fillRect(ex + pw / 2 - 40 + shift, y0 + 12, 28, 30); g.fillRect(ex - pw / 2 + 14 + shift, y0 + eh - 34, 16, 16);
      if (s.tear > 0) { g.fillStyle = `rgba(150,210,255,${0.85 * s.tear})`; g.fillRect(x0 + 4, y0 + eh - 16, ew - 8, 16); }
    }
    g.fillStyle = DOG.fur; g.fillRect(x0 - 4, y0 - 4, ew + 8, 4 + 30 * s.sad);   // 垂下的上眼皮
  }
}

export function makeDog() {
  const root = new THREE.Group();
  const B = (w, h, d, c) => mesh(rbox(w, h, d, 0.015), typeof c === 'string' ? std(c) : c);
  const fur = std(DOG.fur), brown = std(DOG.brown), cream = std(DOG.cream), ink = std(DOG.nose, { roughness: 0.4 });
  const bodyPivot = new THREE.Group(); root.add(bodyPivot);
  // 坐姿: 棕色身体, 一侧橙色
  const body = B(1.0, 1.0, 1.2, brown); body.position.set(0, 0.78, -0.42); body.rotation.x = -0.5; bodyPivot.add(body);
  const flank = B(1.02, 0.6, 0.7, fur); flank.position.set(0, 0.9, -0.2); flank.rotation.x = -0.5; flank.scale.set(1, 1, 1); bodyPivot.add(flank);
  const chest = B(0.72, 0.66, 0.16, brown); chest.position.set(0, 1.0, 0.12); chest.rotation.x = -0.35; bodyPivot.add(chest);
  const tag = B(0.14, 0.14, 0.04, '#8a6a2a'); tag.position.set(0, 1.18, 0.22); tag.rotation.x = -0.35; bodyPivot.add(tag);
  const legs = [];
  [[-1, brown], [1, fur]].forEach(([sx, mat]) => {
    const piv = new THREE.Group(); piv.position.set(sx * 0.27, 0.78, 0.12); bodyPivot.add(piv);
    const l = B(0.26, 0.66, 0.28, mat); l.position.set(0, -0.36, 0); piv.add(l);
    const paw = B(0.3, 0.16, 0.34, cream); paw.position.set(0, -0.7, 0.04); piv.add(paw);
    legs.push(piv);
    const thigh = B(0.32, 0.5, 0.8, sx < 0 ? brown : fur); thigh.position.set(sx * 0.48, 0.27, -0.5); bodyPivot.add(thigh);
    const hp = B(0.3, 0.14, 0.4, cream); hp.position.set(sx * 0.48, 0.07, -0.02); bodyPivot.add(hp);
  });
  // 尾巴: 方块链
  const tailBase = new THREE.Group(); tailBase.position.set(0, 0.2, -1.0); bodyPivot.add(tailBase);
  const tail = []; { let p = tailBase;
    for (let i = 0; i < 5; i++) { const s = new THREE.Group(); s.position.y = i ? 0.2 : 0;
      const m = B(0.2, 0.24, 0.2, i >= 4 ? DOG.cream : DOG.fur); m.position.y = 0.1; s.add(m); p.add(s); p = s; tail.push(s); } }
  // 大方头
  const headPivot = new THREE.Group(); headPivot.position.set(0, 1.42, 0.12); bodyPivot.add(headPivot);
  const head = B(1.2, 1.08, 0.94, fur); head.position.set(0, 0.42, 0.06); headPivot.add(head);
  const faceTex = canvasTex(520, 300, () => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 0.66), new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.7 }));
  face.position.set(0, 0.6, 0.535); headPivot.add(face);
  const muzzle = B(0.6, 0.4, 0.3, cream); muzzle.position.set(0, 0.1, 0.62); headPivot.add(muzzle);
  const nose = B(0.24, 0.14, 0.1, ink); nose.position.set(0, 0.24, 0.8); headPivot.add(nose);
  const jawPiv = new THREE.Group(); jawPiv.position.set(0, -0.1, 0.48); headPivot.add(jawPiv);
  const jaw = B(0.46, 0.1, 0.3, cream); jaw.position.set(0, -0.02, 0.12); jawPiv.add(jaw);
  const tongue = B(0.2, 0.06, 0.2, '#f08aa0'); tongue.position.set(0, -0.06, 0.24); jawPiv.add(tongue);
  const ears = [];
  for (const sx of [-1, 1]) {   // 竖起来的方耳朵 + 粉色内耳
    const ep = new THREE.Group(); ep.position.set(sx * 0.44, 0.96, 0.1); headPivot.add(ep);
    const e = B(0.3, 0.42, 0.14, DOG.furDk); e.position.set(0, 0.2, 0); ep.add(e);
    const ei = B(0.16, 0.3, 0.04, '#ff8fa0'); ei.position.set(sx * 0.02, 0.17, 0.08); ep.add(ei);
    ears.push(ep);
  }
  // 头顶粉色蝴蝶结
  const bow = new THREE.Group(); bow.position.set(0, 0.99, 0.2); headPivot.add(bow);
  for (const sx of [-1, 1]) { const b = B(0.2, 0.14, 0.12, '#ffa3bd'); b.position.x = sx * 0.13; bow.add(b); }
  const knot = B(0.08, 0.16, 0.13, '#f2738f'); bow.add(knot);
  // 嘴里叼着的鞋
  const held = new THREE.Group(); held.position.set(0, -0.08, 0.7); headPivot.add(held);
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const st = { open: 1, eyes: 'normal', look: 0, sad: 0, tear: 0 };
  return {
    root, bodyPivot, headPivot, held, jawPiv, faceTex, st, ears, legs,
    update(t, o = {}) {
      root.visible = true;
      const press = o.press || 0, sad = o.sad || 0;
      const br = Math.sin(t * 2.1) * 0.018;
      bodyPivot.scale.set(1 + br, 1 - br, 1 + br);
      bodyPivot.rotation.x = 0.12 * press;
      headPivot.rotation.set((o.pitch || 0) + 0.22 * press + 0.03 * Math.sin(t * 1.7), (o.yaw || 0) + 0.06 * Math.sin(t * 1.1), (o.tilt || 0) + 0.05 * Math.sin(t * 1.5));
      head.scale.set(1 + 0.05 * press, 1, 1 - 0.08 * press);
      headPivot.position.x = 0.012 * press * Math.sin(t * 41);
      // 耳朵: 一直轻轻转, 时不时抖一下; 委屈时压成飞机耳
      ears.forEach((ep, i) => {
        const sx = i ? 1 : -1, flick = Math.max(0, Math.sin(t * (i ? 1.9 : 1.6) + i * 2)) ** 16;
        const flat = clamp(sad - (o.perk || 0));
        ep.rotation.set(-0.12 * Math.sin(t * 1.3 + i) - 1.1 * flat - 0.3 * flick, 0.15 * Math.sin(t * 0.9 + i), -sx * (0.05 + 0.9 * flat + 0.25 * flick));
      });
      bow.rotation.z = 0.1 * Math.sin(t * 3);
      legs.forEach((l, i) => { l.rotation.x = (o.walk || 0) * 0.5 * Math.sin(t * 9 + i * Math.PI); });
      const wag = o.wag ?? 0.15, hz = o.wagHz ?? 1.2;
      tail.forEach((s, j) => { s.rotation.z = (j === 0 ? 0 : wag) * Math.sin(2 * Math.PI * hz * t - j * 0.6); s.rotation.x = j ? 0.06 : 0; });
      tail[0].rotation.x = -1.75 + (o.tailUp || 0);
      jawPiv.rotation.x = 0.5 * (o.jaw || 0);
      const hop = o.hop || 0;
      bodyPivot.position.y = hop * Math.abs(Math.sin(t * Math.PI * 1.6)) * 0.35 + (o.dropY || 0);
      Object.assign(st, { eyes: o.eyes || 'normal', look: o.look || 0, sad, tear: o.tear || 0 });
      st.open = 1;
      if (st.eyes !== 'squeeze' && (t % 3.1) < 0.12) st.open = Math.abs((t % 3.1) - 0.06) / 0.06;
      drawDogFace(faceTex.userData.g, st); faceTex.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ 被咬坏的鞋 (单只, 鞋头朝 +z)
function plaidTex() { return canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#d93a3f'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(120,20,30,0.45)'; for (let i = 0; i < w; i += 32) { g.fillRect(i, 0, 12, h); g.fillRect(0, i, w, 12); }
  g.fillStyle = 'rgba(255,230,200,0.55)'; for (let i = 18; i < w; i += 32) { g.fillRect(i, 0, 3, h); g.fillRect(0, i, w, 3); }
}); }
const _plaid = plaidTex(); _plaid.wrapS = _plaid.wrapT = THREE.RepeatWrapping;
export function makeShoe(kind, opt = {}) {
  const g = new THREE.Group();
  const bite = (x, y, z, col) => { const b = box(0.1, 0.08, 0.1, col, 0.02); b.position.set(x, y, z); g.add(b); };
  if (kind === 'flip') {        // 蓝色人字拖
    const sole = box(0.34, 0.07, 0.78, '#3d8ee8', 0.03); sole.position.y = 0.035; g.add(sole);
    const top = box(0.3, 0.02, 0.72, '#8fc4ff', 0.01); top.position.y = 0.075; g.add(top);
    for (const sx of [-1, 1]) { const s = box(0.04, 0.05, 0.36, '#ffffff', 0.015); s.position.set(sx * 0.09, 0.12, 0.08); s.rotation.y = sx * 0.45; g.add(s); }
    const post = box(0.05, 0.08, 0.05, '#ffffff', 0.015); post.position.set(0, 0.11, 0.24); g.add(post);
    if (opt.broken) { const s = box(0.04, 0.05, 0.22, '#ffffff', 0.015); s.position.set(0.17, 0.09, -0.05); s.rotation.y = 0.9; g.add(s); }
  } else if (kind === 'croc') { // 绿色洞洞鞋
    const b = box(0.4, 0.26, 0.8, '#5cc46a', 0.12); b.position.y = 0.13; g.add(b);
    const open = box(0.3, 0.1, 0.36, '#3a8f48', 0.05); open.position.set(0, 0.23, -0.12); g.add(open);
    for (let i = 0; i < 6; i++) { const hl = box(0.06, 0.03, 0.06, '#2f7a3c', 0.015); hl.position.set(-0.1 + (i % 3) * 0.1, 0.26, 0.14 + (i / 3 | 0) * 0.12); g.add(hl); }
    const strap = box(0.44, 0.06, 0.06, '#4aa957', 0.02); strap.position.set(0, 0.2, -0.3); g.add(strap);
  } else if (kind === 'plaid') { // 红色格子拖鞋
    const sole = box(0.38, 0.08, 0.8, '#7a3b2e', 0.03); sole.position.y = 0.04; g.add(sole);
    const up = mesh(rbox(0.38, 0.2, 0.44, 0.08), std('#ffffff', { map: _plaid })); up.position.set(0, 0.16, 0.16); g.add(up);
    const fl = box(0.36, 0.04, 0.38, '#f3e2c8', 0.02); fl.position.set(0, 0.09, -0.2); g.add(fl);
  } else if (kind === 'bunny') { // 粉色毛绒兔子拖鞋
    const b = box(0.44, 0.26, 0.84, '#ffb3cc', 0.13); b.position.y = 0.13; g.add(b);
    const hd = box(0.36, 0.26, 0.26, '#ffc6d8', 0.1); hd.position.set(0, 0.3, 0.24); g.add(hd);
    for (const sx of [-1, 1]) { const e = box(0.05, 0.05, 0.02, '#2a1a1e', 0.01); e.position.set(sx * 0.08, 0.34, 0.375); g.add(e); }
    const n = box(0.06, 0.04, 0.02, '#f0608a', 0.01); n.position.set(0, 0.29, 0.375); g.add(n);
    const ears = opt.ears ?? 2;
    for (let i = 0; i < ears; i++) { const sx = i ? 1 : -1;
      const e = box(0.1, 0.38, 0.06, '#ffc6d8', 0.04); e.position.set(sx * 0.09, 0.58, 0.2); e.rotation.z = -sx * 0.15; g.add(e);
      const ei = box(0.05, 0.26, 0.02, '#ff8fb2', 0.015); ei.position.set(sx * 0.09, 0.58, 0.235); ei.rotation.z = -sx * 0.15; g.add(ei); }
    if (ears < 2) { const stub = box(0.1, 0.08, 0.06, '#ffc6d8', 0.03); stub.position.set(-0.09, 0.44, 0.2); g.add(stub); }
  } else if (kind === 'black') { // 旧黑色拖鞋
    const sole = box(0.36, 0.07, 0.78, '#2b2730', 0.03); sole.position.y = 0.035; g.add(sole);
    const band = box(0.38, 0.14, 0.26, '#3b3640', 0.06); band.position.set(0, 0.12, 0.14); g.add(band);
    const logo = box(0.12, 0.02, 0.12, '#6a6470', 0.01); logo.position.set(0, 0.195, 0.14); g.add(logo);
  }
  if (opt.bitten) { bite(0.14, 0.06, 0.36, '#e9d8c0'); bite(-0.12, 0.06, -0.33, '#e9d8c0'); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
