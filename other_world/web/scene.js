// 《假如你的猫去了另一个世界》 — three.js 场景. 每帧由 window.renderAt(t) 决定性地渲染, 返回 JPEG dataURL.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const W = 1080, H = 1920;
const TL = await (await fetch('../timeline.json')).json();
let ENV = null;
try { ENV = await (await fetch('../vo/envelope.json')).json(); } catch (e) { ENV = null; }
await document.fonts.load('80px WenKai', TL.subs.join('') + TL.titles.map(x => x.text).join('') + TL.photos.join(''));

// ------------------------------------------------------------------ helpers
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const smoother = x => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const lerp = (a, b, k) => a + (b - a) * k;
const easeOutBack = (x, s = 1.7) => { x = clamp(x); return 1 + (s + 1) * (x - 1) ** 3 + s * (x - 1) ** 2; };
function kf(t, keys, ease = smoother) {
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
const win = (t, a, b, f = 0.4) => smooth((t - a) / f) * (1 - smooth((t - (b - f)) / f));
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function talk(t) { // 0..1 口型, 来自旁白音量包络
  if (!ENV) return 0;
  const i = Math.floor(t * ENV.fps);
  return i >= 0 && i < ENV.env.length ? ENV.env[i] : 0;
}

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 400);
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
const renderPass = new RenderPass(null, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.3, 0.6, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.35 }, uWarm: { value: 0.0 },
    uFade: { value: 0 }, uFadeColor: { value: new THREE.Color(1, 1, 1) }, uLift: { value: 0.0 }, uSat: { value: 1.0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uVig, uWarm, uFade, uLift, uSat; uniform vec3 uFadeColor;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299,0.587,0.114));
      c = mix(vec3(l), c, uSat);
      c *= mix(vec3(1.0), vec3(1.06, 1.0, 0.92), uWarm);
      c = c + (1.0 - c) * uLift * vec3(0.10, 0.07, 0.12);
      vec2 d = (vUv - 0.5) * vec2(1.0, 1.35);
      float v = smoothstep(0.95, 0.25, length(d));
      c *= mix(1.0, v, uVig);
      c = mix(c, uFadeColor, uFade);
      c += (hash(vUv * vec2(1080.0,1920.0) + fract(uTime*7.13)*91.0) - 0.5) * 0.028;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(grade);

const out = document.getElementById('out');
const ctx = out.getContext('2d');

// ------------------------------------------------------------------ textures & materials
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.userData = { canvas: c, g };
  return t;
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...o });
const rbox = (w, h, d, r = 0.06, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
function mesh(geo, mat, cast = true, recv = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m; }

const glowTex = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const starTex = canvasTex(128, 128, (g) => {
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
function makeSparkles(n, box, color, size, seed) {
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
const CAT = { body: '#f6b8cb', head: '#f9c4d4', ear: '#ee8aab', earIn: '#fbd0dd', paw: '#fbd3df', spot: '#e892b1' };
function drawFace(g, s) {
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
    g.fillStyle = '#b84f72'; g.beginPath(); g.roundRect(236, 266, 28, 6 + m * 26, 10); g.fill();
    g.fillStyle = '#f28aa6'; g.beginPath(); g.roundRect(241, 266 + m * 16, 18, 4 + m * 10, 6); g.fill();
  }
}

function makeCat() {
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

// ------------------------------------------------------------------ the owner (方块人)
function makeOwner() {
  const root = new THREE.Group();
  const skin = std('#f3d2bc'), hair = std('#5c3a2e', { roughness: 0.9 }), sweater = std('#7fb595', { roughness: 0.95 }),
    pants = std('#4f6f86', { roughness: 0.9 }), sock = std('#f1ece6');
  const inner = new THREE.Group(); inner.rotation.y = Math.PI / 2; root.add(inner); // 面向 +x
  // legs (knees up)
  for (const sx of [-1, 1]) {
    const thigh = mesh(rbox(0.3, 0.3, 0.78, 0.1), pants); thigh.position.set(sx * 0.19, 0.42, 0.34); thigh.rotation.x = -0.62; inner.add(thigh);
    const shin = mesh(rbox(0.28, 0.66, 0.3, 0.1), pants); shin.position.set(sx * 0.19, 0.42, 0.74); shin.rotation.x = 0.18; inner.add(shin);
    const foot = mesh(rbox(0.28, 0.16, 0.38, 0.06), sock); foot.position.set(sx * 0.19, 0.08, 0.86); inner.add(foot);
  }
  const hips = mesh(rbox(0.72, 0.3, 0.5, 0.1), pants); hips.position.set(0, 0.17, -0.05); inner.add(hips);
  const torsoP = new THREE.Group(); torsoP.position.set(0, 0.25, -0.08); inner.add(torsoP);
  const torso = mesh(rbox(0.78, 0.86, 0.48, 0.12), sweater); torso.position.y = 0.44; torsoP.add(torso);
  const collar = mesh(rbox(0.42, 0.08, 0.3, 0.03), std('#6aa383')); collar.position.y = 0.88; torsoP.add(collar);
  // arms hugging knees
  for (const sx of [-1, 1]) {
    const up = mesh(rbox(0.22, 0.52, 0.22, 0.08), sweater); up.position.set(sx * 0.48, 0.62, 0.12); up.rotation.x = 0.85; up.rotation.z = sx * 0.12; torsoP.add(up);
    const fore = mesh(rbox(0.2, 0.2, 0.5, 0.08), sweater); fore.position.set(sx * 0.36, 0.48, 0.52); fore.rotation.y = -sx * 0.55; torsoP.add(fore);
    const hand = mesh(rbox(0.16, 0.14, 0.16, 0.05), skin); hand.position.set(sx * 0.15, 0.47, 0.76); torsoP.add(hand);
  }
  const headP = new THREE.Group(); headP.position.set(0, 0.92, 0); torsoP.add(headP);
  const neck = mesh(rbox(0.2, 0.14, 0.2, 0.05), skin); neck.position.y = 0.04; headP.add(neck);
  const head = mesh(rbox(0.56, 0.58, 0.54, 0.12), skin); head.position.y = 0.36; headP.add(head);
  const hairTop = mesh(rbox(0.64, 0.24, 0.62, 0.1), hair); hairTop.position.set(0, 0.62, -0.02); headP.add(hairTop);
  const hairBack = mesh(rbox(0.62, 0.5, 0.2, 0.08), hair); hairBack.position.set(0, 0.42, -0.24); headP.add(hairBack);
  for (const sx of [-1, 1]) { const s = mesh(rbox(0.1, 0.38, 0.5, 0.04), hair); s.position.set(sx * 0.3, 0.44, -0.04); headP.add(s); }
  const fringe = mesh(rbox(0.6, 0.14, 0.12, 0.05), hair); fringe.position.set(0, 0.56, 0.24); headP.add(fringe);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#3a2a28' });
  const eyes = [];
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.01), eyeMat); e.position.set(sx * 0.13, 0.38, 0.275); headP.add(e); eyes.push(e); }
  const blushMat = new THREE.MeshBasicMaterial({ color: '#f0a7a7', transparent: true, opacity: 0.6 });
  for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.045), blushMat); b.position.set(sx * 0.17, 0.3, 0.273); headP.add(b); }
  return {
    root, torsoP, headP, eyes,
    pose(t, droop, lookUp = 0) {
      const br = Math.sin(t * 1.4) * 0.015;
      torsoP.rotation.x = 0.32 * droop - 0.08 * lookUp + br;
      headP.rotation.x = 0.55 * droop - 0.45 * lookUp;
      eyes.forEach(e => { e.scale.y = lookUp > 0.5 ? 2.2 : 1; });
    },
  };
}

// ------------------------------------------------------------------ ROOM scene
const room = new THREE.Scene();
room.background = new THREE.Color('#2e2236');
const roomG = new THREE.Group(); room.add(roomG);
const floorTex = canvasTex(1024, 1024, (g, w, h) => {
  g.fillStyle = '#d9a477'; g.fillRect(0, 0, w, h);
  const r = rng(7);
  for (let i = 0; i < 16; i++) {
    const y = i * 64;
    g.fillStyle = `hsl(${26 + r() * 6}, ${48 + r() * 10}%, ${62 + r() * 7}%)`; g.fillRect(0, y, w, 64);
    for (let k = 0; k < 40; k++) { g.fillStyle = `rgba(150,90,50,${0.03 + r() * 0.04})`; g.fillRect(r() * w, y + r() * 60, 60 + r() * 200, 1.5); }
    g.fillStyle = 'rgba(120,70,40,0.35)'; g.fillRect(0, y, w, 2.5);
    const off = r() * w; g.fillRect(off, y, 2.5, 64);
  }
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(2, 2);
const floor = mesh(new THREE.PlaneGeometry(12, 12), std('#ffffff', { map: floorTex, roughness: 0.55 }), false, true);
floor.rotation.x = -Math.PI / 2; roomG.add(floor);
const wallMat = std('#ecd3e2', { roughness: 0.95 });
const backWall = mesh(new THREE.PlaneGeometry(12, 7), wallMat, false, true); backWall.position.set(0, 3.5, -3.2); roomG.add(backWall);
const leftWall = mesh(new THREE.PlaneGeometry(12, 7), wallMat, false, true); leftWall.position.set(-4.2, 3.5, 0); leftWall.rotation.y = Math.PI / 2; roomG.add(leftWall);
const skirting = mesh(new THREE.BoxGeometry(12, 0.16, 0.04), std('#f2e6ee'), false, true); skirting.position.set(0, 0.08, -3.18); roomG.add(skirting);
// window
const winG = new THREE.Group(); winG.position.set(1.1, 2.9, -3.17); roomG.add(winG);
const skyTexW = canvasTex(256, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#9c8fd0'); gr.addColorStop(0.5, '#f4b3b8'); gr.addColorStop(1, '#ffd9a8');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.7), new THREE.MeshBasicMaterial({ map: skyTexW, toneMapped: false }));
glass.material.color.setScalar(1.25); winG.add(glass);
const frameMat = std('#fbf3f6');
for (const [x, y, w, h] of [[0, 0.88, 2.2, 0.1], [0, -0.88, 2.3, 0.14], [-1.05, 0, 0.1, 1.86], [1.05, 0, 0.1, 1.86], [0, 0, 0.06, 1.7], [0, 0.05, 2.0, 0.06]]) {
  const f = mesh(rbox(w, h, 0.12, 0.02), frameMat, false, true); f.position.set(x, y, 0.04); winG.add(f);
}
// window light patch on floor
const patchTex = canvasTex(512, 512, (g) => {
  g.filter = 'blur(10px)'; g.fillStyle = 'rgba(255,214,160,1)';
  for (const [x, y] of [[60, 60], [262, 60], [60, 262], [262, 262]]) g.fillRect(x, y, 190, 190);
});
const patch = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: patchTex, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
patch.rotation.x = -Math.PI / 2; patch.rotation.z = 0.35; patch.position.set(0.55, 0.012, 0.2); patch.scale.set(1, 1.5, 1); roomG.add(patch);
// light shaft
const shaftTex = canvasTex(64, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,220,170,0.9)'); gr.addColorStop(1, 'rgba(255,220,170,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h);
});
const shafts = new THREE.Group(); roomG.add(shafts);
for (let i = 0; i < 3; i++) {
  const s = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 4.4), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  s.position.set(0.9 + i * 0.32 - 0.3, 1.6, -1.6); s.rotation.x = 0.62; s.rotation.y = 0.15 * (i - 1);
  shafts.add(s);
}
// bowl, ball, cushion
const bowlPts = [[0, 0], [0.32, 0], [0.4, 0.04], [0.46, 0.18], [0.42, 0.19], [0.36, 0.08], [0, 0.08]].map(([x, y]) => new THREE.Vector2(x, y));
const bowl = mesh(new THREE.LatheGeometry(bowlPts, 48), std('#e57a9c', { roughness: 0.35 })); bowl.position.set(0.95, 0, 0.4); roomG.add(bowl);
const fish = mesh(new THREE.TorusGeometry(0.08, 0.02, 8, 24, Math.PI * 1.5), std('#ffffff')); fish.rotation.x = -Math.PI / 2; fish.position.set(0.75, 0.2, 0.35); fish.visible = false; roomG.add(fish);
const ball = mesh(new THREE.SphereGeometry(0.1, 24, 16), std('#7fb6ea', { roughness: 0.6 })); ball.position.set(1.6, 0.1, 0.9); roomG.add(ball);
const cushion = mesh(rbox(1.2, 0.18, 0.95, 0.09), std('#f2c7d6', { roughness: 1 })); cushion.position.set(2.1, 0.09, -1.6); cushion.rotation.y = -0.3; roomG.add(cushion);
const owner = makeOwner(); owner.root.position.set(-0.55, 0, 0.3); owner.root.rotation.y = -0.1; roomG.add(owner.root);
// paw prints of light
const pawPrintTex = canvasTex(256, 256, (g) => {
  g.filter = 'blur(3px)'; g.fillStyle = '#fff';
  g.beginPath(); g.ellipse(128, 160, 54, 46, 0, 0, 7); g.fill();
  for (const [x, y] of [[62, 92], [104, 60], [152, 60], [194, 92]]) { g.beginPath(); g.ellipse(x, y, 22, 27, 0, 0, 7); g.fill(); }
});
const prints = [];
for (let i = 0; i < 5; i++) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshBasicMaterial({ map: pawPrintTex, color: new THREE.Color(2.2, 1.1, 1.6), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  p.rotation.x = -Math.PI / 2; roomG.add(p); prints.push(p);
}
const PRINT_POS = [[1.55, -1.35, 2.5], [1.25, -0.85, 2.4], [1.05, -0.35, 2.6], [0.7, 0.05, 2.3], [0.42, 0.5, 2.4]];
prints.forEach((p, i) => { p.position.set(PRINT_POS[i][0], 0.015, PRINT_POS[i][1]); p.rotation.z = PRINT_POS[i][2] + (i % 2 ? 0.15 : -0.15); });
// soul orb
const orb = new THREE.Group(); room.add(orb);
const orbCore = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 2.6) }));
const orbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffc6dc', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
orbGlow.scale.setScalar(0.9); orb.add(orbCore, orbGlow);
const roomDust = makeSparkles(140, [3.5, 3.6, 2.5], '#ffe2bf', 0.05, 11); roomDust.position.set(0.9, 0, -1.2); roomDust.material.uniforms.uRise.value = 0.05; roomG.add(roomDust);
// lights
const roomHemi = new THREE.HemisphereLight('#e4d4f4', '#8a6266', 1.7); room.add(roomHemi);
const roomSun = new THREE.DirectionalLight('#ffc48a', 3.0); roomSun.position.set(2.5, 5, -7); roomSun.target.position.set(0, 0, 0.5);
roomSun.castShadow = true; roomSun.shadow.mapSize.set(2048, 2048); roomSun.shadow.camera.left = -4; roomSun.shadow.camera.right = 4;
roomSun.shadow.camera.top = 4; roomSun.shadow.camera.bottom = -4; roomSun.shadow.radius = 5; roomSun.shadow.bias = -0.0005; roomSun.shadow.normalBias = 0.02;
room.add(roomSun, roomSun.target);
const roomFill = new THREE.PointLight('#b9a2ff', 6, 12, 1.5); roomFill.position.set(-1, 3, 4); room.add(roomFill);
const ownerGlow = new THREE.PointLight('#ffb3cf', 0, 4, 2); room.add(ownerGlow);
// cloud ring high above the room (POV "below")
const holeG = new THREE.Group(); holeG.position.y = 26; room.add(holeG);

// ------------------------------------------------------------------ SKY scene
const sky = new THREE.Scene();
const SKY_FOG = new THREE.Color('#f6e3f1');
sky.fog = new THREE.Fog(SKY_FOG, 14, 60);
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color('#bfc4f3') }, mid: { value: new THREE.Color('#f7dcef') }, bot: { value: new THREE.Color('#fff3ea') }, uSun: { value: 0 } },
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top, mid, bot; uniform float uSun; varying vec3 vP;
    void main(){ float y = vP.y; vec3 c = y > 0.05 ? mix(mid, top, smoothstep(0.05, 0.6, y)) : mix(bot, mid, smoothstep(-0.3, 0.05, y));
      vec3 sd = normalize(vec3(-0.5, 0.55, -0.67)); float s = max(dot(vP, sd), 0.0);
      c += vec3(1.0,0.85,0.6) * (pow(s, 40.0)*0.8 + pow(s, 6.0)*0.25) * uSun;
      gl_FragColor = vec4(c, 1.0); }`,
}));
sky.add(skyDome);
const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: new THREE.Color('#f6dbe8'), emissiveIntensity: 0.28 });
const sphGeo = new THREE.IcosahedronGeometry(1, 4);
function makeCloud(seed, n, sx, sy, sz, base = 0.6) {
  const g = new THREE.Group(), r = rng(seed);
  for (let i = 0; i < n; i++) {
    const s = base * (0.55 + r() * 0.8);
    const m = mesh(sphGeo, cloudMat, true, true);
    const a = r() * Math.PI * 2, rr = Math.sqrt(r());
    m.position.set(Math.cos(a) * rr * sx, (r() * 0.6 + 0.2) * sy * (1 - rr * 0.6), Math.sin(a) * rr * sz);
    m.scale.set(s * 1.15, s * 0.82, s);
    g.add(m);
  }
  return g;
}
const skyG = new THREE.Group(); sky.add(skyG);
const platform = makeCloud(3, 46, 3.2, 0.9, 2.4, 0.75); platform.position.y = -0.62; skyG.add(platform);
const farClouds = [];
const r0 = rng(21);
for (let i = 0; i < 22; i++) {
  const c = makeCloud(100 + i, 18, 2.6, 0.9, 1.6, 0.9);
  const a = -Math.PI * 0.95 + r0() * Math.PI * 0.9, d = 9 + r0() * 26;
  c.position.set(Math.cos(a) * d, -2.5 + r0() * 3.5 - d * 0.04, Math.sin(a) * d);
  c.scale.setScalar(0.8 + r0() * 1.1); skyG.add(c); farClouds.push(c);
}
for (let i = 0; i < 12; i++) { // 前景云 (近处, 柔焦感由雾+大尺寸)
  const c = makeCloud(300 + i, 12, 2, 0.7, 1.2, 0.8);
  const a = r0() * Math.PI * 2, d = 5 + r0() * 3;
  c.position.set(Math.cos(a) * d, -1.6 - r0(), Math.sin(a) * d); skyG.add(c);
}
// rainbow
const rainbow = new THREE.Mesh(new THREE.RingGeometry(15, 19, 160, 1, 0, Math.PI), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, fog: false, uniforms: { uA: { value: 0.55 } },
  vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform float uA; varying vec2 vP;
    vec3 hsv(float h){ vec3 k = clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0); return k; }
    void main(){ float f = (length(vP) - 15.0) / 4.0; vec3 c = mix(vec3(1.0), hsv(0.83 - f*0.83), 0.42);
      float a = smoothstep(0.0, 0.15, f) * smoothstep(1.0, 0.85, f) * uA * smoothstep(-0.5, 4.0, vP.y);
      gl_FragColor = vec4(c, a); }`,
}));
rainbow.position.set(2, -4, -34); skyG.add(rainbow);
// sun + god rays
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#fff0d0', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
sunSprite.scale.setScalar(14); sunSprite.position.set(-9, 11, -16); sky.add(sunSprite);
const rayTex = canvasTex(128, 512, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(1, 'rgba(255,236,200,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, w, h);
});
const rays = new THREE.Group(); rays.position.copy(sunSprite.position); sky.add(rays);
for (let i = 0; i < 7; i++) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6 + i % 3, 30), new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  m.geometry.translate(0, -15, 0); m.userData.base = -0.35 - i * 0.13; m.rotation.z = m.userData.base; rays.add(m);
}
// cat in the sky
const cat = makeCat(); sky.add(cat.root);
const skySpark = makeSparkles(260, [16, 7, 14], '#fff3d6', 0.07, 5); skySpark.position.y = -1; sky.add(skySpark);
// cans
const canLabel = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#f4a640'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff2d6'; g.fillRect(0, 60, w, 136);
  g.fillStyle = '#e0563f'; g.fillRect(0, 0, w, 16); g.fillRect(0, h - 16, w, 16);
  for (const x of [70, 326]) {
    g.fillStyle = '#4a8fd0'; g.beginPath(); g.ellipse(x, 128, 46, 24, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(x + 40, 128); g.lineTo(x + 72, 106); g.lineTo(x + 72, 150); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x - 24, 122, 5, 0, 7); g.fill();
  }
  g.fillStyle = '#e0563f'; g.font = '56px WenKai'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('罐头', 200, 130); g.fillText('小鱼干', 450, 130);
});
const canMats = [std('#ffffff', { map: canLabel, roughness: 0.45, metalness: 0.1 }), std('#dfe3ea', { roughness: 0.3, metalness: 0.6 }), std('#dfe3ea', { roughness: 0.3, metalness: 0.6 })];
const canGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.3, 40);
const cans = new THREE.Group(); sky.add(cans);
const CANPOS = [];
for (const [cx, cz, rows] of [[-1.35, -0.2, [4, 3, 2, 1]], [1.4, -0.3, [3, 2, 1]], [-0.4, -1.4, [3, 2, 1]]]) {
  rows.forEach((n, level) => { for (let i = 0; i < n; i++) CANPOS.push([cx + (i - (n - 1) / 2) * 0.62, 0.15 + level * 0.305, cz]); });
}
CANPOS.forEach(([x, y, z], i) => { const c = mesh(canGeo, canMats); c.position.set(x, y, z); c.rotation.y = i * 1.3; cans.add(c); });
const hugCan = mesh(canGeo, canMats); hugCan.scale.setScalar(0.85); cat.bodyPivot.add(hugCan);
// polaroids
function drawCat2D(g, x, y, s, happy = true) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = '#f6b8cb'; g.fillRect(-36, 0, 72, 60);
  g.fillStyle = '#ee8aab'; g.beginPath(); g.moveTo(-44, -46); g.lineTo(-38, -86); g.lineTo(-16, -50); g.fill();
  g.beginPath(); g.moveTo(44, -46); g.lineTo(38, -86); g.lineTo(16, -50); g.fill();
  g.fillStyle = '#f9c4d4'; g.fillRect(-48, -54, 96, 64);
  g.strokeStyle = '#1a1416'; g.lineWidth = 5; g.lineCap = 'round'; g.fillStyle = '#1a1416';
  if (happy) { for (const ex of [-20, 20]) { g.beginPath(); g.arc(ex, -18, 8, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); } }
  else { g.fillRect(-27, -30, 13, 13); g.fillRect(14, -30, 13, 13); }
  g.fillStyle = 'rgba(240,110,150,0.6)'; g.fillRect(-38, -6, 14, 6); g.fillRect(24, -6, 14, 6);
  g.fillStyle = '#ee6c93'; g.fillRect(-6, -10, 12, 6);
  g.restore();
}
function drawPerson2D(g, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = '#7fb595'; g.beginPath(); g.roundRect(-60, 40, 120, 140, 26); g.fill();
  g.fillStyle = '#f3d2bc'; g.beginPath(); g.roundRect(-44, -50, 88, 92, 20); g.fill();
  g.fillStyle = '#5c3a2e'; g.beginPath(); g.roundRect(-50, -62, 100, 38, 16); g.fill(); g.fillRect(-50, -40, 14, 50); g.fillRect(36, -40, 14, 50);
  g.strokeStyle = '#3a2a28'; g.lineWidth = 5; g.lineCap = 'round';
  for (const ex of [-17, 17]) { g.beginPath(); g.arc(ex, -2, 7, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
  g.beginPath(); g.arc(0, 14, 10, 0.2, Math.PI - 0.2); g.stroke();
  g.restore();
}
const PHOTO_SCENES = [
  (g) => { // 第一次回家: 纸箱里的小猫, 人捧着
    g.fillStyle = '#ffe9d6'; g.fillRect(0, 0, 440, 400);
    drawPerson2D(g, 220, 150, 1.25);
    g.fillStyle = '#c99a66'; g.fillRect(140, 250, 160, 110); g.fillStyle = '#b5844f'; g.fillRect(140, 250, 160, 18);
    drawCat2D(g, 220, 230, 0.7, false);
  },
  (g) => { // 一起晒太阳
    const gr = g.createLinearGradient(0, 0, 0, 400); gr.addColorStop(0, '#ffd59e'); gr.addColorStop(1, '#ffeedd'); g.fillStyle = gr; g.fillRect(0, 0, 440, 400);
    g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(360, 70, 46, 0, 7); g.fill();
    g.fillStyle = '#d9a477'; g.fillRect(0, 300, 440, 100);
    drawPerson2D(g, 150, 170, 1.0); drawCat2D(g, 300, 250, 0.9, true);
  },
  (g) => { // 趴在你肚子上
    g.fillStyle = '#e8ddf5'; g.fillRect(0, 0, 440, 400);
    g.fillStyle = '#f7f1e8'; g.fillRect(0, 230, 440, 170);
    g.save(); g.translate(220, 260); g.rotate(-Math.PI / 2); drawPerson2D(g, 0, -40, 1.0); g.restore();
    drawCat2D(g, 240, 200, 0.85, true);
    g.fillStyle = '#8a7aa8'; g.font = '40px WenKai'; g.fillText('z z', 300, 120);
  },
  (g) => { // 等你下班 (门口)
    g.fillStyle = '#f6d7c7'; g.fillRect(0, 0, 440, 400);
    g.fillStyle = '#b98a6a'; g.fillRect(250, 40, 150, 330); g.fillStyle = '#f3d36b'; g.beginPath(); g.arc(380, 210, 8, 0, 7); g.fill();
    g.fillStyle = '#d9a477'; g.fillRect(0, 340, 440, 60);
    drawCat2D(g, 150, 270, 1.05, false);
  },
  (g) => { // 十岁生日
    g.fillStyle = '#ffe1ea'; g.fillRect(0, 0, 440, 400);
    g.fillStyle = '#fff'; g.fillRect(150, 250, 140, 80); g.fillStyle = '#f39ab6'; g.fillRect(150, 250, 140, 18);
    g.fillStyle = '#f3d36b'; g.fillRect(200, 220, 8, 30); g.fillRect(232, 220, 8, 30);
    g.fillStyle = '#ffb347'; g.beginPath(); g.ellipse(204, 212, 6, 10, 0, 0, 7); g.ellipse(236, 212, 6, 10, 0, 0, 7); g.fill();
    drawCat2D(g, 220, 130, 0.95, true);
    g.fillStyle = '#e85f86'; g.font = 'bold 40px WenKai'; g.textAlign = 'center'; g.fillText('10', 220, 300);
  },
];
const photos = [];
const photoG = new THREE.Group(); sky.add(photoG);
TL.photos.forEach((cap, i) => {
  const tex = canvasTex(512, 600, (g) => {
    g.fillStyle = '#fffdf9'; g.fillRect(0, 0, 512, 600);
    g.save(); g.translate(36, 36); g.beginPath(); g.rect(0, 0, 440, 400); g.clip(); PHOTO_SCENES[i](g);
    const v = g.createRadialGradient(220, 200, 120, 220, 200, 320); v.addColorStop(0, 'rgba(255,240,220,0)'); v.addColorStop(1, 'rgba(160,110,90,0.25)');
    g.fillStyle = v; g.fillRect(0, 0, 440, 400); g.restore();
    g.fillStyle = '#6b4c5c'; g.font = '54px WenKai'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(cap, 256, 515);
  });
  const p = new THREE.Group();
  const card = mesh(new THREE.BoxGeometry(0.64, 0.75, 0.012), [std('#fffdf9'), std('#fffdf9'), std('#fffdf9'), std('#fffdf9'), std('#ffffff', { map: tex, roughness: 0.5, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.25 }), std('#f3ece6')]);
  p.add(card); photoG.add(p); photos.push(p);
});
// hearts
const heartShape = new THREE.Shape();
heartShape.moveTo(0, -0.5); heartShape.bezierCurveTo(-0.15, -0.3, -0.6, -0.1, -0.5, 0.25); heartShape.bezierCurveTo(-0.42, 0.55, -0.08, 0.6, 0, 0.3);
heartShape.bezierCurveTo(0.08, 0.6, 0.42, 0.55, 0.5, 0.25); heartShape.bezierCurveTo(0.6, -0.1, 0.15, -0.3, 0, -0.5);
const heartGeo = new THREE.ExtrudeGeometry(heartShape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 4, curveSegments: 24 });
heartGeo.center();
const heartMat = std('#ff8db1', { roughness: 0.35, emissive: new THREE.Color('#ff6f9f'), emissiveIntensity: 0.5 });
const hearts = []; const heartG = new THREE.Group(); sky.add(heartG);
for (let i = 0; i < 9; i++) { const h = mesh(heartGeo, heartMat, false, false); heartG.add(h); hearts.push(h); }
// lights (sky)
const skyHemi = new THREE.HemisphereLight('#fff6fb', '#d9c6f2', 1.25); sky.add(skyHemi);
const skySun = new THREE.DirectionalLight('#fff0dc', 2.4); skySun.position.set(-5, 8, 6); skySun.castShadow = true;
skySun.shadow.mapSize.set(2048, 2048); Object.assign(skySun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 30 });
skySun.shadow.radius = 6; skySun.shadow.bias = -0.0005; skySun.shadow.normalBias = 0.02; sky.add(skySun);
const skyRim = new THREE.DirectionalLight('#ffc2dc', 1.6); skyRim.position.set(4, 3, -6); sky.add(skyRim);
const catGlow = new THREE.PointLight('#ffd7e6', 0, 6, 2); sky.add(catGlow);
// cloud hole for POV (in room scene, above room)
const holeCloudMat = cloudMat.clone(); holeCloudMat.emissiveIntensity = 0.55;
{
  const r = rng(77);
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + r() * 0.1, d = 4.6 + r() * 4.5;
    const m = new THREE.Mesh(sphGeo, holeCloudMat); const s = 1.2 + r() * 1.6;
    m.position.set(Math.cos(a) * d, r() * 2.5, Math.sin(a) * d); m.scale.set(s * 1.2, s * 0.7, s); holeG.add(m);
  }
}
const holeLight = new THREE.HemisphereLight('#ffffff', '#f2dcef', 0); room.add(holeLight);

// ------------------------------------------------------------------ scene setters
function setCam(pos, look, fov = 32) { camera.position.set(...pos); camera.lookAt(...look); camera.fov = fov; camera.updateProjectionMatrix(); }

function baseRoom(t) {
  room.fog = null; holeG.visible = false; holeLight.intensity = 0;
  orb.visible = false; prints.forEach(p => p.material.opacity = 0); ownerGlow.intensity = 0;
  shafts.children.forEach((s, i) => s.material.opacity = 0.13 + 0.04 * Math.sin(t * 0.7 + i * 2));
  roomDust.material.uniforms.uTime.value = t;
  roomSun.intensity = 3.0; roomSun.color.set('#ffc48a'); patch.material.opacity = 0.4;
  ball.position.set(1.6, 0.1, 0.9);
  owner.pose(t, 1, 0);
  grade.uniforms.uWarm.value = 0.5; grade.uniforms.uVig.value = 0.55; grade.uniforms.uLift.value = 0.15; grade.uniforms.uSat.value = 0.92;
  bloom.strength = 0.3; bloom.threshold = 0.95; bloom.radius = 0.6;
  renderer.toneMappingExposure = 0.95;
  return room;
}
function baseSky(t) {
  skyDome.material.uniforms.uSun.value = 0.3;
  sunSprite.material.opacity = 0.5; rays.children.forEach(r => r.material.opacity = 0);
  skySpark.material.uniforms.uTime.value = t; skySpark.material.uniforms.uAlpha.value = 1;
  cans.visible = false; hugCan.visible = false; photoG.visible = false; heartG.visible = false;
  catGlow.intensity = 0; rainbow.material.uniforms.uA.value = 0.6;
  skySun.intensity = 2.2; skyHemi.intensity = 1.25;
  farClouds.forEach((c, i) => { c.position.x += 0; c.rotation.y = Math.sin(t * 0.05 + i) * 0.1; });
  cat.reset(); cat.idle(t);
  grade.uniforms.uWarm.value = 0.15; grade.uniforms.uVig.value = 0.32; grade.uniforms.uLift.value = 0.06; grade.uniforms.uSat.value = 1.08;
  bloom.strength = 0.22; bloom.threshold = 1.15; bloom.radius = 0.7;
  renderer.toneMappingExposure = 0.86;
  return sky;
}
function catTalk(t) { cat.state.mouth = Math.max(cat.state.mouth, clamp(talk(t) * 1.3)); }

const SCENES = {
  room(t, lt) { // 黄昏的房间, 主人抱膝坐在空碗旁
    const s = baseRoom(t);
    owner.pose(t, 1, 0);
    setCam(kf(lt, [[0, [2.6, 2.3, 10.5]], [6.6, [1.9, 1.6, 8.0]]]), kf(lt, [[0, [0.25, 0.9, -0.2]], [6.6, [0.3, 0.75, 0.1]]]), 32);
    return s;
  },
  rise(t, lt) { // 空碗里升起一团微光, 飘向窗外
    const s = baseRoom(t);
    orb.visible = true;
    const k = clamp(lt / 2.2);
    const p = kf(lt, [[0, [0.95, 0.15, 0.4]], [0.6, [0.98, 0.55, 0.35]], [2.2, [1.15, 2.9, -2.9]]]);
    orb.position.set(p[0] + Math.sin(lt * 4) * 0.05, p[1], p[2]);
    const pulse = 0.85 + 0.15 * Math.sin(lt * 9);
    orbGlow.scale.setScalar((0.5 + smooth(lt / 0.5) * 0.7) * pulse); orbGlow.material.opacity = smooth(lt / 0.4);
    orbCore.scale.setScalar(smooth(lt / 0.4));
    ownerGlow.intensity = 3 * smooth(lt / 0.5); ownerGlow.position.copy(orb.position);
    owner.pose(t, 1 - 0.6 * smooth((lt - 0.6) / 1.0), 0.6 * smooth((lt - 0.6) / 1.0));
    setCam(kf(lt, [[0, [1.9, 1.6, 8.0]], [2.2, [1.6, 1.9, 6.6]]]), kf(lt, [[0, [0.3, 0.75, 0.1]], [2.2, [1.0, 2.5, -2.4]]]), 32);
    bloom.strength = 0.35 + 0.6 * k;
    return s;
  },
  hello(t, lt) { // 云端, 猫咪出现并挥手
    const s = baseSky(t);
    const app = smooth(lt / 0.9);
    cat.root.position.y = -0.2 + 0.2 * easeOutBack(lt / 1.0);
    cat.root.scale.setScalar(0.85 + 0.15 * easeOutBack(lt / 1.1));
    // wave
    const wv = win(lt, 0.9, 3.9, 0.5);
    cat.arms[1].rotation.x = -2.5 * wv; cat.arms[1].rotation.z = wv * (0.35 + 0.35 * Math.sin(lt * 9));
    cat.headPivot.rotation.z = 0.12 * Math.sin(lt * 1.3) * app + 0.1 * wv;
    cat.state.look = 0;
    cat.blink(lt, [0.5, 2.8, 4.9]);
    cat.state.happy = smooth((lt - 3.6) / 0.15) > 0.5 && lt < 5.4 ? 1 : 0;
    catTalk(t);
    cat.state.shine = 0.4;
    catGlow.intensity = 4 * (1 - app); catGlow.position.set(0, 1.4, 1.5);
    skySpark.material.uniforms.uAlpha.value = 1 + 1.5 * (1 - app);
    setCam(kf(lt, [[0, [0, 1.5, 9.5]], [5.8, [0.3, 1.45, 7.6]]]), [0, 1.0, 0], 32);
    return s;
  },
  sun(t, lt) { // 阳光里打盹
    const s = baseSky(t);
    skyDome.material.uniforms.uSun.value = 1.0; sunSprite.material.opacity = 0.9;
    rays.children.forEach((r, i) => { r.material.opacity = 0.1 + 0.06 * Math.sin(t * 0.8 + i * 1.7); r.rotation.z = r.userData.base + Math.sin(t * 0.3 + i) * 0.04; });
    skySun.intensity = 3.2;
    cat.root.rotation.y = 0.45;
    cat.bodyPivot.rotation.z = 0.04 * Math.sin(lt * 1.2);
    cat.headPivot.rotation.x = -0.18 + 0.05 * Math.sin(lt * 1.1); // 抬头迎着阳光
    cat.headPivot.rotation.z = 0.18;
    cat.state.happy = 0; cat.state.open = 0; // 闭眼享受
    if (lt > 3.3 && lt < 5.2) cat.state.happy = 1;
    catTalk(t);
    grade.uniforms.uWarm.value = 0.45; bloom.strength = 0.32;
    const a = 0.35 + lt * 0.045;
    setCam([Math.sin(a) * 6.6, 1.25 + lt * 0.05, Math.cos(a) * 6.6], [0.1, 1.0, 0], 30);
    return s;
  },
  cans(t, lt) { // 罐头山, 抱着罐头开心蹦跶
    const s = baseSky(t);
    cans.visible = true; hugCan.visible = true;
    cans.position.set(0, -0.05, -0.6);
    hugCan.position.set(0, 0.6, 0.55); hugCan.rotation.set(0.12, -0.5, 0.18);
    cat.arms.forEach((a, i) => { a.rotation.x = -1.25; a.rotation.z = (i ? -1 : 1) * 0.35; });
    const jump = Math.max(0, Math.sin(clamp((lt - 2.35) / 0.55) * Math.PI));
    const jump2 = Math.max(0, Math.sin(clamp((lt - 3.0) / 0.45) * Math.PI)) * 0.6;
    cat.root.position.y = (jump + jump2) * 0.45;
    cat.bodyPivot.scale.y *= 1 - 0.06 * Math.max(0, Math.sin(clamp((lt - 2.2) / 0.15) * Math.PI));
    cat.root.rotation.y = 0.12 * Math.sin(lt * 2.2);
    cat.state.happy = lt > 0.7 ? 1 : 0;
    cat.blink(lt, [0.3]);
    catTalk(t);
    grade.uniforms.uWarm.value = 0.25;
    setCam(kf(lt, [[0, [-0.5, 1.6, 9.6]], [4.6, [0.4, 1.45, 8.4]]]), [0, 0.95, -0.3], 32);
    return s;
  },
  edge(t, lt) { // 云朵边缘, 往下望
    const s = baseSky(t);
    cat.root.position.set(0, -0.05, 1.9);
    cat.root.rotation.y = -0.25;
    cat.headPivot.rotation.x = 0.42 + 0.04 * Math.sin(lt * 1.2); cat.bodyPivot.rotation.x = 0.14;
    cat.headPivot.rotation.z = -0.08;
    cat.state.open = 0.82; cat.state.lookY = 1; cat.state.shine = 0.6; catTalk(t);
    cat.blink(lt, [1.4]);
    rainbow.material.uniforms.uA.value = 0.45;
    setCam(kf(lt, [[0, [-1.4, 0.55, 7.8]], [2.2, [-1.0, 0.65, 6.6]]]), kf(lt, [[0, [0, 1.0, 1.9]], [2.2, [0, 1.0, 1.9]]]), 32);
    grade.uniforms.uVig.value = 0.45;
    return s;
  },
  below(t, lt) { // 从云洞往下看: 小小的你, 还守着空碗
    const s = baseRoom(t);
    holeG.visible = true; holeLight.intensity = 0.8;
    room.fog = new THREE.Fog('#e7d6ee', 30, 52);
    owner.pose(t, 1, 0);
    const h = kf(lt, [[0, 38], [2.6, 33]]);
    setCam([0.4, h, 2.0], [0.3, 0, 0.3], 22);
    camera.up.set(0, 1, 0);
    grade.uniforms.uSat.value = 0.9; grade.uniforms.uVig.value = 0.6; bloom.strength = 0.3;
    return s;
  },
  memory(t, lt) { // 回忆相片环绕
    const s = baseSky(t);
    setCam(kf(lt, [[0, [0, 1.7, 8.6]], [5.8, [0, 1.35, 6.4]]]), [0, 1.05, 0], 32);
    photoG.visible = true;
    const pick = 1; // 被抱住的那张: 一起晒太阳
    photos.forEach((p, i) => {
      const a = (i / photos.length) * Math.PI * 2 + lt * 0.35 + 0.6;
      const rr = 1.75;
      let pos = new THREE.Vector3(Math.cos(a) * rr, 1.2 + Math.sin(lt * 1.2 + i * 1.3) * 0.12 + (i % 2) * 0.35, Math.sin(a) * rr * 0.8 - 0.1);
      p.rotation.set(0.05 * Math.sin(lt + i), -a + Math.PI / 2 + Math.PI, 0.08 * Math.sin(lt * 0.9 + i));
      p.lookAt(camera.position); p.rotateZ(0.1 * Math.sin(lt * 0.8 + i * 2));
      const sc = 0.95 * smooth((lt - i * 0.15) / 0.6);
      if (i === pick) {
        const k = smoother((lt - 2.6) / 1.1);
        pos = pos.lerp(new THREE.Vector3(0, 0.78, 0.62), k);
        if (k > 0) { p.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, 0, 0)), k); }
        p.scale.setScalar(sc * lerp(1, 0.78, k));
      } else p.scale.setScalar(sc);
      p.position.copy(pos);
    });
    const hug = smoother((lt - 3.1) / 0.8);
    cat.arms.forEach((a, i) => { a.rotation.x = -1.45 * hug; a.rotation.z = (i ? -1 : 1) * 0.55 * hug; });
    cat.headPivot.rotation.x = 0.12 * hug; cat.headPivot.rotation.z = -0.1 * hug;
    cat.state.look = lt < 2.4 ? Math.sin(lt * 1.3) : 0;
    cat.state.happy = lt > 3.4 ? 1 : 0;
    cat.blink(lt, [1.2]);
    catTalk(t);
    grade.uniforms.uWarm.value = 0.3; bloom.strength = 0.28;
    return s;
  },
  promise(t, lt) { // 特写: 下辈子我还要找到你
    const s = baseSky(t);
    heartG.visible = true;
    const raise = win(lt, 0.4, 3.0, 0.5);
    cat.arms[1].rotation.x = -1.9 * raise; cat.arms[1].rotation.z = -0.15 * raise;
    cat.headPivot.rotation.z = 0.08 * Math.sin(lt * 0.9);
    cat.state.shine = smooth((lt - 0.2) / 1.0);
    cat.blink(lt, [2.6]);
    cat.state.happy = lt > 3.3 ? 1 : 0;
    cat.state.tear = lt > 3.5 ? smooth((lt - 3.5) / 1.6) : 0;
    catTalk(t);
    hearts.forEach((h, i) => {
      const r = rng(900 + i); const st = 2.9 + r() * 2.2;
      const k = clamp((lt - st) / 2.4);
      h.visible = k > 0 && k < 1;
      const sx = (r() - 0.5) * 3.2;
      h.position.set(sx + Math.sin(k * 6 + i) * 0.15, 0.6 + k * 2.6, 0.6 + r() * 0.8);
      h.scale.setScalar(0.18 * (0.6 + r() * 0.6) * Math.sin(k * Math.PI) ** 0.4);
      h.rotation.set(0, Math.sin(k * 5 + i) * 0.6, Math.sin(k * 3 + i) * 0.2);
    });
    catGlow.intensity = 1.2; catGlow.position.set(0, 1.5, 2);
    grade.uniforms.uWarm.value = 0.3; bloom.strength = 0.28;
    setCam(kf(lt, [[0, [0, 1.6, 7.6]], [5.6, [0, 1.55, 6.0]]]), kf(lt, [[0, [0, 1.15, 0]], [5.6, [0, 1.3, 0]]]), 32);
    return s;
  },
  ending(t, lt) { // 回到房间: 光的脚印, 主人抬起头
    const s = baseRoom(t);
    roomSun.intensity = 3.0 + 1.6 * smooth(lt / 2.0); roomSun.color.set('#ffcf98');
    patch.material.opacity = 0.4 + 0.35 * smooth(lt / 2.0);
    prints.forEach((p, i) => { const st = 0.3 + i * 0.42; p.material.opacity = 0.85 * smooth((lt - st) / 0.35) * (0.85 + 0.15 * Math.sin(t * 3 + i)); });
    orb.visible = true;
    const op = kf(lt, [[0, [1.6, 3.0, -2.9]], [1.4, [1.3, 1.7, -0.6]], [2.4, [0.45, 1.1, 0.25]], [3.2, [0.1, 0.92, 0.4]]]);
    orb.position.set(op[0], op[1] + Math.sin(t * 3) * 0.03, op[2]);
    const settle = smooth((lt - 3.0) / 0.8);
    orbGlow.scale.setScalar((0.8 - 0.35 * settle) * (1 + 0.1 * Math.sin(t * 6))); orbGlow.material.opacity = 0.9; orbCore.scale.setScalar(1 - 0.4 * settle);
    ownerGlow.position.copy(orb.position); ownerGlow.intensity = 2.5;
    const up = smooth((lt - 2.6) / 1.4);
    owner.pose(t, 1 - 0.55 * up, 0.35 * up);
    setCam(kf(lt, [[0, [2.8, 2.0, 9.0]], [5.6, [1.8, 1.5, 7.2]]]), kf(lt, [[0, [0.5, 0.8, -0.3]], [5.6, [0.2, 0.9, 0.1]]]), 32);
    grade.uniforms.uWarm.value = 0.6; bloom.strength = 0.5 + 0.2 * up; grade.uniforms.uSat.value = 0.96;
    return s;
  },
};

// ------------------------------------------------------------------ text overlay
function drawText(text, cx, y, size, alpha, t, t0, opts = {}) {
  if (alpha <= 0) return;
  const lines = text.split('\n');
  ctx.save();
  ctx.font = `${size}px WenKai`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const lh = size * 1.45;
  let ci = 0;
  lines.forEach((ln, li) => {
    const chars = [...ln];
    const wTot = ctx.measureText(ln).width + (chars.length - 1) * size * 0.04;
    let x = cx - wTot / 2;
    chars.forEach((ch) => {
      const k = smooth((t - t0 - ci * 0.045) / 0.35);
      const a = alpha * k;
      if (a > 0.003) {
        ctx.globalAlpha = a;
        const yy = y + li * lh + (1 - k) * 10;
        ctx.shadowColor = opts.shadow || 'rgba(96,40,70,0.55)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 2;
        ctx.fillStyle = opts.color || '#fffaf6';
        ctx.fillText(ch, x, yy);
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        ctx.fillText(ch, x, yy);
      }
      x += ctx.measureText(ch).width + size * 0.04;
      ci++;
    });
  });
  ctx.restore();
}
function drawOverlay(t) {
  let band = 0;
  TL.subs.forEach((s, i) => { const t0 = TL.vo[i] - 0.3, t1 = TL.vo[i] + (ENV ? ENV.durs[i] : 4) + 0.5; band = Math.max(band, smooth((t - t0) / 0.4) * (1 - smooth((t - t1) / 0.5))); });
  if (band > 0) {
    ctx.save(); ctx.globalAlpha = band;
    const gr = ctx.createLinearGradient(0, 1330, 0, 1720);
    gr.addColorStop(0, 'rgba(70,32,64,0)'); gr.addColorStop(0.45, 'rgba(70,32,64,0.30)'); gr.addColorStop(1, 'rgba(70,32,64,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 1330, W, 390); ctx.restore();
  }
  TL.titles.forEach(ti => {
    const a = smooth((t - ti.t0) / 0.6) * (1 - smooth((t - ti.t1 + 0.6) / 0.6));
    drawText(ti.text, W / 2, ti.y, ti.size, a, t, ti.t0);
  });
  TL.subs.forEach((s, i) => {
    const t0 = TL.vo[i] - 0.15, t1 = TL.vo[i] + (ENV ? ENV.durs[i] : 4) + 0.5;
    const a = smooth((t - t0) / 0.3) * (1 - smooth((t - t1 + 0.4) / 0.4));
    drawText(s, W / 2, 1488, 56, a, t, t0, { shadow: 'rgba(70,24,58,0.85)' });
  });
}

// ------------------------------------------------------------------ main render
function sceneAt(t) {
  const out = [];
  for (const [name, a, b] of TL.scenes) if (t >= a - 1e-6 && t < b + TL.xfade) out.push([name, a, b]);
  return out;
}
function renderScene(name, t, lt) {
  camera.up.set(0, 1, 0);
  const sc = SCENES[name](t, lt);
  cat.face();
  grade.uniforms.uTime.value = t;
  // fades
  let fade = 0, fc = [1, 1, 1];
  if (name === 'rise') fade = smooth((lt - 1.3) / 0.9);
  if (name === 'hello') fade = 1 - smooth(lt / 1.1);
  if (name === 'room') { fade = 1 - smooth(lt / 1.2); fc = [0.12, 0.08, 0.14]; }
  if (name === 'ending') { fade = smooth((lt - 4.7) / 0.9) * 0.92; fc = [1, 0.97, 0.95]; }
  grade.uniforms.uFade.value = fade; grade.uniforms.uFadeColor.value.setRGB(...fc);
  renderPass.scene = sc;
  composer.render();
}
window.renderAt = function (t, quality = 0.93) {
  const list = sceneAt(t);
  // 当前场景 = 最后一个已开始的; 若前一个仍在 xfade 内则交叉溶解
  const cur = list[list.length - 1];
  const prev = list.length > 1 ? list[list.length - 2] : null;
  ctx.globalAlpha = 1;
  const noXfade = cur && (cur[0] === 'hello'); // rise->hello 用白场过渡
  if (prev && !noXfade && t < cur[1] + TL.xfade) {
    renderScene(prev[0], t, t - prev[1]);
    ctx.drawImage(renderer.domElement, 0, 0);
    renderScene(cur[0], t, t - cur[1]);
    ctx.globalAlpha = smooth((t - cur[1]) / TL.xfade);
    ctx.drawImage(renderer.domElement, 0, 0);
    ctx.globalAlpha = 1;
  } else {
    renderScene(cur[0], t, t - cur[1]);
    ctx.drawImage(renderer.domElement, 0, 0);
  }
  drawOverlay(t);
  return quality ? out.toDataURL('image/jpeg', quality) : null;
};
window.READY = true;
