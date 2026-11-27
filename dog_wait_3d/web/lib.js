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


// 体素风 (按用户给的两张图): 棱角分明的方块, 只留一点点圆角
const vox = (w, h, d, color) => box(w, h, d, color, 0.012);

// ------------------------------------------------------------------ 主人: 体素风女生 (按用户图: 棕色齐刘海 + 两侧长发 + 粉色发圈, 大眼睛, 粉色上衣 + 红领结, 两层粉裙, 粉鞋)
export const GIRL = { skin: '#f9dbc6', hair: '#7a4730', hairDk: '#4a2618', top: '#e08aa0', collar: '#ece6e8', tie: '#a8304f',
  skirtHi: '#ffb3c8', skirt: '#ff8fae', hem: '#fff6ec', sock: '#e9e4e6', shoe: '#ff86a6', tieHair: '#f06a92' };
function drawGirlFace(g, s) {
  const w = 300, h = 260; g.clearRect(0, 0, w, h);
  // 腮红
  g.fillStyle = '#ff8fab';
  g.fillRect(26, 178, 62, 22); g.fillRect(212, 178, 62, 22);
  for (const [ex, sx] of [[96, -1], [204, 1]]) {
    const top = 104;
    if (s.blink) { g.fillStyle = '#2b1810'; g.fillRect(ex - 34, top + 34, 68, 10); g.fillRect(ex + sx * 30, top + 26, 12, 10); continue; }
    const k = s.shock ? 1.12 : 1, ew = 58 * k, eh = 74 * k, x0 = ex - ew / 2, lx = s.look * 4;
    g.fillStyle = '#2e1a12'; g.fillRect(x0, top, ew, eh * 0.6);                    // 上半深色
    g.fillStyle = '#8a4e2c'; g.fillRect(x0, top + eh * 0.6, ew, eh * 0.4);        // 下半棕色虹膜
    g.fillStyle = '#2e1a12'; g.fillRect(x0 - 4, top + eh - 4, ew + 8, 4);
    g.fillStyle = '#ffffff'; g.fillRect(ex + 2 + lx, top + 10, 20, 20);             // 大高光
    g.fillRect(x0 + 6 + lx, top + eh * 0.66, 10, 10);                               // 小高光
    // 上眼线 + 外侧翘起的睫毛
    g.fillStyle = '#1f120c'; g.fillRect(x0 - 8, top - 10, ew + 16, 12);
    g.fillRect(sx < 0 ? x0 - 18 : x0 + ew + 4, top - 18, 14, 12);
    // 眉毛
    g.fillStyle = '#5a3020'; g.fillRect(ex - 22, s.shock ? 64 : 72, 44, 8);
  }
  // 嘴: 小小的张嘴 (深红 + 粉色舌头)
  if (s.shock) { g.fillStyle = '#a83c52'; g.fillRect(132, 200, 36, 30); g.fillStyle = '#ff9fb2'; g.fillRect(140, 218, 20, 10); }
  else if (s.smile) { g.fillStyle = '#a83c52'; g.fillRect(132, 202, 36, 14); g.fillStyle = '#ff9fb2'; g.fillRect(140, 210, 20, 6); }
  else { g.fillStyle = '#a83c52'; g.fillRect(138, 204, 24, 14); g.fillStyle = '#ff9fb2'; g.fillRect(143, 211, 14, 7); }
}
export function makePerson() {
  const root = new THREE.Group(), C = GIRL;
  const body = new THREE.Group(); root.add(body); body.scale.setScalar(1.12);
  for (const sx of [-1, 1]) {
    const sh = vox(0.26, 0.18, 0.32, C.shoe); sh.position.set(sx * 0.15, 0.09, 0.02); body.add(sh);
    const so = vox(0.22, 0.16, 0.24, C.sock); so.position.set(sx * 0.15, 0.26, 0); body.add(so);
    const lg = vox(0.18, 0.34, 0.2, C.skin); lg.position.set(sx * 0.15, 0.5, 0); body.add(lg);
  }
  const hem = vox(0.9, 0.06, 0.64, C.hem); hem.position.y = 0.65; body.add(hem);
  const sk1 = vox(0.86, 0.3, 0.62, C.skirt); sk1.position.y = 0.83; body.add(sk1);
  const sk2 = vox(0.74, 0.24, 0.54, C.skirtHi); sk2.position.y = 1.1; body.add(sk2);
  const torso = vox(0.62, 0.48, 0.42, C.top); torso.position.y = 1.44; body.add(torso);
  const col = vox(0.34, 0.07, 0.06, C.collar); col.position.set(0, 1.63, 0.2); body.add(col);
  for (const sx of [-1, 1]) { const b = vox(0.12, 0.1, 0.05, C.tie); b.position.set(sx * 0.08, 1.54, 0.23); body.add(b); }
  const knot = vox(0.05, 0.07, 0.06, '#7e1f3a'); knot.position.set(0, 1.54, 0.24); body.add(knot);
  const neck = vox(0.16, 0.1, 0.16, C.skin); neck.position.y = 1.72; body.add(neck);
  const arms = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.4, 1.6, 0); body.add(piv);
    const sl = vox(0.2, 0.2, 0.24, C.top); sl.position.y = -0.06; piv.add(sl);
    const a = vox(0.13, 0.4, 0.15, C.skin); a.position.y = -0.34; piv.add(a);
    const hnd = vox(0.15, 0.13, 0.17, C.skin); hnd.position.y = -0.58; piv.add(hnd);
    arms.push(piv);
  }
  // 大方头
  const headG = new THREE.Group(); headG.position.y = 1.75; body.add(headG);
  const hd = vox(1.12, 0.98, 0.92, C.skin); hd.position.y = 0.5; headG.add(hd);
  const faceTex = canvasTex(300, 260, () => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.953), new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.7 }));
  face.position.set(0, 0.48, 0.462); headG.add(face);
  // 头发: 头顶 + 锯齿齐刘海 + 两侧长发(发尾更深) + 后面 + 粉色发圈
  const top = vox(1.2, 0.3, 1.0, C.hair); top.position.set(0, 1.0, -0.02); headG.add(top);
  const bangs = [[-0.42, 0.2], [-0.18, 0.14], [0.02, 0.2], [0.22, 0.12], [0.43, 0.18]];
  bangs.forEach(([x, hh], i) => { const b = vox(i === 2 ? 0.2 : 0.24, hh, 0.08, i % 2 ? '#6e3e28' : C.hair); b.position.set(x, 0.86 - hh / 2 + 0.02, 0.47); headG.add(b); });
  const side = [];
  for (const sx of [-1, 1]) {
    const sp = new THREE.Group(); sp.position.set(sx * 0.66, 0.86, 0.05); headG.add(sp);
    const s1 = vox(0.22, 0.72, 0.6, C.hair); s1.position.y = -0.36; sp.add(s1);
    const s2 = vox(0.22, 0.24, 0.5, C.hairDk); s2.position.y = -0.84; sp.add(s2);
    const t1 = vox(0.14, 0.14, 0.2, C.tieHair); t1.position.set(sx * 0.14, -0.1, 0.18); sp.add(t1);
    const t2 = vox(0.12, 0.12, 0.16, '#c94a74'); t2.position.set(sx * 0.14, -0.22, 0.18); sp.add(t2);
    side.push(sp);
  }
  const backHair = vox(1.18, 1.0, 0.18, C.hair); backHair.position.set(0, 0.45, -0.52); headG.add(backHair);
  const clip = vox(0.12, 0.16, 0.1, C.tieHair); clip.position.set(0.5, 0.92, 0.38); headG.add(clip);
  const strands = [];
  for (let i = 0; i < 4; i++) { const s_ = vox(0.08, 0.4, 0.08, C.hair); s_.position.set(-0.3 + i * 0.2, 1.1, -0.25); headG.add(s_); strands.push(s_); }
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  const st = { blink: false, shock: false, smile: false, look: 0 };
  return {
    root, headG,
    update(t, o = {}) {
      root.visible = true;
      body.position.y = 0.02 * Math.sin(t * 2.4);
      body.scale.set(1.12, 1.12 * (1 + 0.008 * Math.sin(t * 2.4)), 1.12);
      st.blink = (t % 2.9) < 0.12 && !o.shock; st.shock = !!o.shock; st.smile = !!(o.hug || o.wave); st.look = 0.6 * Math.sin(t * 0.7);
      drawGirlFace(faceTex.userData.g, st); faceTex.needsUpdate = true;
      arms[0].rotation.z = o.hug ? -1.3 - 0.15 * Math.sin(t * 5) : o.wave ? -2.6 + 0.35 * Math.sin(t * 8) : -0.08 - 0.03 * Math.sin(t * 2.4);
      arms[1].rotation.z = o.hug ? 1.3 + 0.15 * Math.sin(t * 5) : o.reach ? 1.2 + 0.1 * Math.sin(t * 6) : 0.08 + 0.03 * Math.sin(t * 2.4);
      headG.rotation.set(0, o.headYaw ?? 0.15 * Math.sin(t * 0.8), 0.06 * Math.sin(t * 1.1));
      side.forEach((s_, i) => { s_.rotation.z = (i ? -1 : 1) * (o.blow ? 0.4 : 0.04) * Math.sin(t * (o.blow ? 13 : 1.5) + i); s_.rotation.x = 0.04 * Math.sin(t * 1.7 + i); });
      strands.forEach((s_, i) => { s_.visible = !!o.blow; s_.rotation.z = 1.2 + 0.3 * Math.sin(t * 14 + i); });
    },
  };
}

// ------------------------------------------------------------------ 小狗: 体素风柴犬 (按用户图: 橙色大方头 + 竖耳(内粉) + 头顶粉蝴蝶结 + 白色鼻梁/嘴套 + 黑鼻子 + 吐舌头 + 粉腮红 + 金色铃牌 + 白爪)
export const DOG = { fur: '#f7993c', furDk: '#d9782a', earIn: '#ff8fa0', white: '#fffdf0', ink: '#2e1f1a', blush: '#ffa6bb',
  bow: '#ffa0b8', bowDk: '#f27a96', tongue: '#f59ab0', tag: '#c9a03a', tip: '#fff3d6' };
export function drawDogFace(g, s) {
  const w = 520, h = 440; g.clearRect(0, 0, w, h);
  // 白色鼻梁 (从额头一直到嘴套)
  g.fillStyle = DOG.white; g.fillRect(200, 118, 120, h - 118);
  // 腮红
  g.fillStyle = DOG.blush; g.fillRect(14, 282, 62, 46); g.fillRect(444, 282, 62, 46);
  for (const [ex, sx] of [[130, -1], [390, 1]]) {
    const ey = 200, lx = s.look * 10, ly = s.lookY * 8;
    if (s.eyes === 'sad') { g.fillStyle = DOG.furDk; g.save(); g.translate(ex, ey - 82); g.rotate(sx * -0.35); g.fillRect(-36, -9, 72, 18); g.restore(); }
    if (s.eyes === 'happy') {
      g.strokeStyle = DOG.ink; g.lineWidth = 24; g.lineCap = 'square'; g.lineJoin = 'miter';
      g.beginPath(); g.moveTo(ex - 46, ey + 26); g.lineTo(ex, ey - 22); g.lineTo(ex + 46, ey + 26); g.stroke();
      continue;
    }
    const open = s.open, half = s.eyes === 'half';
    const eh = 120 * open, top = ey - 60 + (half ? 44 : 0) + (1 - open) * 56;
    const hh = half ? Math.max(4, eh - 44) : eh;
    if (hh < 12) { g.fillStyle = DOG.ink; g.fillRect(ex - 46, ey - 6, 92, 14); continue; }
    g.fillStyle = DOG.ink; g.fillRect(ex - 46, top, 92, hh);
    if (!half && open > 0.6) {
      const big = s.eyes === 'sad' ? 1.25 : 1;
      g.fillStyle = '#ffffff'; g.fillRect(ex + (sx < 0 ? -36 : 6) + lx, top + 12 + ly, 30 * big, 30 * big);
      g.fillRect(ex + (sx < 0 ? 12 : -30) + lx, top + 80 + ly, 18, 18);
      if (s.shine > 0) { g.globalAlpha = s.shine; g.fillRect(ex + 30 + lx, top + 8, 8, 8); g.globalAlpha = 1; }
      if (s.eyes === 'sad') { g.fillStyle = 'rgba(140,200,255,0.95)'; g.fillRect(ex - 40, top + hh - 12, 80, 10); }
    }
  }
}
function drawDogMouth(g, s) {
  const w = 256, h = 110; g.clearRect(0, 0, w, h);
  g.strokeStyle = '#8a4a3c'; g.lineWidth = 9; g.lineCap = 'square';
  if (s.mouth === 'open') { g.fillStyle = '#7a3040'; g.fillRect(84, 40, 88, 60); }
  else if (s.mouth === 'o') { g.fillStyle = '#7a3040'; g.fillRect(104, 36, 48, 58); }
  else if (s.mouth === 'flat') { g.beginPath(); g.moveTo(96, 60); g.lineTo(160, 60); g.stroke(); }
  else if (s.mouth === 'sad') { g.beginPath(); g.moveTo(88, 76); g.lineTo(108, 56); g.lineTo(148, 56); g.lineTo(168, 76); g.stroke(); }
}
export function makeDog() {
  const root = new THREE.Group(), C = DOG;
  const furMat = std(C.fur), dkMat = std(C.furDk), whiteMat = std(C.white);
  const bodyPivot = new THREE.Group(); root.add(bodyPivot);
  const body = mesh(rbox(0.95, 0.74, 1.45, 0.015), furMat); body.position.set(0, 0.62, -0.55); bodyPivot.add(body);
  const belly = vox(0.8, 0.08, 1.2, C.white); belly.position.set(0, 0.24, -0.55); bodyPivot.add(belly);
  const tag = vox(0.14, 0.12, 0.05, C.tag); tag.position.set(0, 0.86, 0.23); bodyPivot.add(tag);
  const legs = [];
  for (const [sx, z] of [[-1, 0.08], [1, 0.08], [-1, -1.08], [1, -1.08]]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.27, 0.42, z); bodyPivot.add(piv);
    const l = vox(0.27, 0.36, 0.28, z > 0 ? C.fur : C.furDk); l.position.y = -0.16; piv.add(l);
    const pw = vox(0.29, 0.12, 0.32, C.white); pw.position.set(0, -0.38, 0.02); piv.add(pw);
    legs.push(piv);
  }
  // 柴犬卷尾巴
  const tailBase = new THREE.Group(); tailBase.position.set(0, 0.92, -1.22); bodyPivot.add(tailBase);
  const tail = []; let p = tailBase;
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Group(); s.position.y = i === 0 ? 0 : 0.15;
    const ww = 0.17 * (1 - i * 0.06);
    const m = vox(ww, 0.19, ww, i >= 3 ? C.tip : C.fur); m.position.y = 0.075; s.add(m); p.add(s); p = s; tail.push(s);
  }
  // 头
  const headPivot = new THREE.Group(); headPivot.position.set(0, 0.95, 0.15); bodyPivot.add(headPivot);
  const head = mesh(rbox(1.2, 1.02, 0.95, 0.015), std(C.fur, { emissive: new THREE.Color(C.fur), emissiveIntensity: 0.1 })); head.position.set(0, 0.43, 0.1); headPivot.add(head);
  const faceTex = canvasTex(520, 440, () => {});
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.015), new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.7 }));
  face.position.set(0, 0.43, 0.579); headPivot.add(face);
  const snout = mesh(rbox(0.6, 0.36, 0.22, 0.012), whiteMat); snout.position.set(0, 0.1, 0.68); headPivot.add(snout);
  const nose = vox(0.22, 0.13, 0.1, C.ink); nose.position.set(0, 0.22, 0.8); headPivot.add(nose);
  const mouthTex = canvasTex(256, 110, () => {});
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.215), new THREE.MeshStandardMaterial({ map: mouthTex, transparent: true, roughness: 0.7 }));
  mouth.position.set(0, 0.03, 0.792); headPivot.add(mouth);
  const tongue = vox(0.16, 0.16, 0.06, C.tongue); tongue.position.set(0, -0.12, 0.72); headPivot.add(tongue);
  // 竖耳朵 (外橙内粉)
  const ears = [];
  for (const sx of [-1, 1]) {
    const ep = new THREE.Group(); ep.position.set(sx * 0.4, 0.92, 0.2); headPivot.add(ep);
    const e = vox(0.3, 0.36, 0.14, C.furDk); e.position.y = 0.18; ep.add(e);
    const ei = vox(0.15, 0.25, 0.03, C.earIn); ei.position.set(sx * 0.02, 0.15, 0.075); ep.add(ei);
    ears.push(ep);
  }
  // 头顶粉蝴蝶结
  const bow = new THREE.Group(); bow.position.set(0, 0.97, 0.38); headPivot.add(bow);
  for (const sx of [-1, 1]) { const b = vox(0.2, 0.12, 0.1, C.bow); b.position.x = sx * 0.13; bow.add(b); }
  const bk = vox(0.08, 0.14, 0.11, C.bowDk); bow.add(bk);
  // 嘴里叼的拖鞋
  const slipper = new THREE.Group(); slipper.position.set(0, -0.02, 0.9); headPivot.add(slipper);
  { const a = mesh(rbox(0.32, 0.1, 0.62, 0.02), std('#ff9ec0')); slipper.add(a); const b = mesh(rbox(0.34, 0.16, 0.26, 0.02), std('#ffffff')); b.position.set(0, 0.1, -0.12); slipper.add(b); slipper.rotation.y = Math.PI / 2; }

  const st = { open: 1, eyes: 'normal', look: 0, lookY: 0, shine: 0, mouth: 'smile' };
  const api = {
    root, bodyPivot, headPivot, ears, legs, tail, faceTex, st, slipper,
    // o: yaw/pitch/tilt, perk (0..1 竖耳), wag (0..1), tailDown, eyes, look, mouth, tongue, sit, lie, walk, hop, dropY, carry, flap
    update(t, o = {}) {
      root.visible = true;
      const sit = o.sit || 0, lie = o.lie || 0;
      const br = Math.sin(t * 2.3) * 0.015;
      bodyPivot.scale.set(1 + br, 1 - br, 1 + br);
      bodyPivot.rotation.set(-0.35 * sit, 0, 0);
      legs.forEach((l, i) => {
        const front = i < 2;
        let rx = (o.walk || 0) * 0.55 * Math.sin(t * 10 + (i === 0 || i === 3 ? 0 : Math.PI));
        if (front) rx += 0.35 * sit - 1.45 * lie; else rx += -1.2 * sit + 1.45 * lie;
        l.rotation.x = rx;
      });
      headPivot.rotation.set((o.pitch || 0) + 0.35 * sit + 0.04 * Math.sin(t * 1.9) + 0.25 * lie,
        (o.yaw || 0) + 0.1 * Math.sin(t * 1.1), (o.tilt || 0) + 0.07 * Math.sin(t * 1.6));
      headPivot.position.y = 0.95 - 0.12 * lie;
      // 竖耳: perk 时竖直朝前, 不开心时往后压成飞机耳; 一直轻轻转, 时不时抖一下
      const down = o.tailDown || o.eyes === 'sad';
      ears.forEach((ep, i) => {
        const sx = i ? 1 : -1;
        const flick = Math.max(0, Math.sin(t * (i ? 2.1 : 1.7) + i * 2.0)) ** 16;
        const back_ = (1 - (o.perk ?? 0.5)) * 0.45 + (down ? 0.9 : 0) + (o.flap ? 0.4 * Math.abs(Math.sin(t * 12 + i)) : 0);
        ep.rotation.set(-back_ - 0.3 * flick + 0.06 * Math.sin(t * 1.3 + i), sx * (0.12 * Math.sin(t * 0.9 + i * 1.7) + 0.3 * flick), -sx * (0.08 + (down ? 0.5 : 0)));
      });
      // 尾巴 (卷在背上, 开心时摇得飞快; 难过时垂下)
      const wag = o.wag ?? 0.3, hz = 1.2 + 9 * wag, amp = 0.12 + 0.5 * wag;
      const lean = o.tailDown ? -2.3 : -0.25;
      tailBase.rotation.set(lean, 0, amp * 0.8 * Math.sin(2 * Math.PI * hz * t));
      tail.forEach((s, j) => { s.rotation.z = (o.tailDown ? 0.05 : amp * 0.4) * Math.sin(2 * Math.PI * hz * t - j * 0.7); s.rotation.x = o.tailDown ? 0 : (j > 0 ? 0.5 : 0); });
      const hop = o.hop || 0;
      bodyPivot.position.y = hop * Math.abs(Math.sin(t * Math.PI * (o.hopHz || 1.6))) * 0.4 + (o.dropY || 0) + 0.05 * sit - 0.36 * lie;
      tongue.visible = o.tongue ?? (o.mouth === 'open' || o.mouth === undefined); tongue.rotation.x = 0.12 * Math.sin(t * 9);
      slipper.visible = !!o.carry; if (o.carry) tongue.visible = false;
      Object.assign(st, { eyes: o.eyes || 'normal', look: o.look || 0, lookY: o.lookY || 0, mouth: o.mouth ?? 'smile', shine: (t % 1.8) < 0.9 ? 1 : 0 });
      st.open = 1;
      if ((st.eyes === 'normal' || st.eyes === 'sad') && (t % 2.9) < 0.12) st.open = Math.abs((t % 2.9) - 0.06) / 0.06;
      drawDogFace(faceTex.userData.g, st); faceTex.needsUpdate = true;
      drawDogMouth(mouthTex.userData.g, st); mouthTex.needsUpdate = true;
    },
  };
  root.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return api;
}
