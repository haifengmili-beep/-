// 《假如你家的猫每分钟叫一声喵》 — three.js 场景. window.renderAt(t) 决定性渲染一帧.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, smooth, smoother, lerp, easeOutBack, kf, win, rng, canvasTex, std, rbox, mesh, glowTex, makeSparkles, makeCat } from './lib.js';

const W = 1080, H = 1920;
const TL = await (await fetch('../timeline.json')).json();
const FONT = '"WenQuanYi Zen Hei", sans-serif';
await document.fonts.load(`80px ${FONT}`, '喵');

// ------------------------------------------------------------------ renderer + post
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 900);
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
const scene = new THREE.Scene();
const renderPass = new RenderPass(scene, camera); composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.3, 0.6, 1.0); composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.3 }, uSat: { value: 1 }, uFlash: { value: 0 }, uFade: { value: 0 }, uWarm: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uVig, uSat, uFlash, uFade, uWarm; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299,0.587,0.114)); c = mix(vec3(l), c, uSat);
      c *= mix(vec3(1.0), vec3(1.05,1.0,0.93), uWarm);
      vec2 d = (vUv-0.5)*vec2(1.0,1.35); c *= mix(1.0, smoothstep(0.95,0.25,length(d)), uVig);
      c = mix(c, vec3(1.0,0.97,0.98), uFlash); c = mix(c, vec3(0.0), uFade);
      c += (hash(vUv*vec2(1080.0,1920.0)+fract(uTime*7.13)*91.0)-0.5)*0.02;
      gl_FragColor = vec4(c,1.0); }`,
});
composer.addPass(grade);
const out = document.getElementById('out'); const ctx = out.getContext('2d');

// ------------------------------------------------------------------ global lights / sky
const hemi = new THREE.HemisphereLight('#fff4f8', '#c9b3d6', 1.3); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0dc', 2.4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 5; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; scene.add(sun, sun.target);
function setSun(target, off, ext, color = '#fff0dc', inten = 2.4) {
  sun.target.position.set(...target); sun.position.set(target[0] + off[0], target[1] + off[1], target[2] + off[2]);
  const c = sun.shadow.camera; c.left = -ext; c.right = ext; c.top = ext; c.bottom = -ext; c.near = 0.5; c.far = 300; c.updateProjectionMatrix();
  sun.color.set(color); sun.intensity = inten;
}
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color('#9fc2ff') }, bot: { value: new THREE.Color('#ffe0ec') } },
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top, bot; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.05, 0.5, vP.y)), 1.0); }`,
}));
scene.add(skyDome);
function setSky(top, bot) { skyDome.material.uniforms.top.value.set(top); skyDome.material.uniforms.bot.value.set(bot); }

// ------------------------------------------------------------------ shared props
const cat = makeCat(); scene.add(cat.root);
cat.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
function bubbleTex(text, color = '#ff5d8f') {
  return canvasTex(512, 400, (g) => {
    g.fillStyle = '#fff'; g.strokeStyle = '#2a1a22'; g.lineWidth = 14; g.lineJoin = 'round';
    g.beginPath(); g.roundRect(30, 30, 452, 270, 120); g.moveTo(170, 290); g.lineTo(140, 380); g.lineTo(250, 296);
    g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.fillRect(160, 270, 100, 34);
    g.font = `bold 170px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#2a1a22'; g.strokeText(text, 256, 172); g.fillStyle = color; g.fillText(text, 256, 172);
  });
}
const BTEX = { '喵！': bubbleTex('喵！'), '喵①': bubbleTex('喵①', '#ff8a3d'), '喵②': bubbleTex('喵②', '#ff8a3d'), '喵③': bubbleTex('喵③', '#ff3d6e'), '喵～': bubbleTex('喵～', '#b36bff'), '喵': bubbleTex('喵', '#ff5d8f') };
function makeBubble() {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: BTEX['喵！'], transparent: true, depthWrite: false, depthTest: false }));
  s.renderOrder = 10; scene.add(s); return s;
}
const bubbles = Array.from({ length: 24 }, makeBubble);
let bubbleIdx = 0;
function resetBubbles() { bubbles.forEach(b => b.visible = false); bubbleIdx = 0; }
function showBubble(pos, dt, size, text = '喵！', life = 1.1) { // dt: 距离喵的时间
  if (dt < 0 || dt > life) return;
  const b = bubbles[bubbleIdx++ % bubbles.length]; b.visible = true;
  b.material.map = BTEX[text]; b.position.set(...pos);
  const k = easeOutBack(dt / 0.25, 2.6) * (1 - smooth((dt - life + 0.25) / 0.25));
  b.scale.set(size * k, size * 0.78 * k, 1);
  b.position.y += dt * 0.15 * size;
  b.material.rotation = 0.08 * Math.sin(dt * 18) * (1 - clamp(dt / 0.6));
}
// 冲击波环 (喵声)
const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.3, 1.6), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
const rings = Array.from({ length: 8 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), ringMat.clone()); m.visible = false; scene.add(m); return m; });
let ringIdx = 0;
function resetRings() { rings.forEach(r => r.visible = false); ringIdx = 0; }
function showRing(pos, dt, maxR, faceCam = true, life = 1.2) {
  if (dt < 0 || dt > life) return;
  const r = rings[ringIdx++ % rings.length]; r.visible = true; r.position.set(...pos);
  const k = dt / life; r.scale.setScalar(0.1 + maxR * (1 - (1 - k) ** 2.5));
  r.material.opacity = 0.75 * (1 - k);
  if (faceCam) r.quaternion.copy(camera.quaternion); else r.rotation.set(-Math.PI / 2, 0, 0);
}
const lastMeow = (t) => { let m = -99; for (const x of TL.meows) if (x <= t) m = x; return m; };
const meowIndex = (t) => TL.meows.filter(x => x <= t).length;
function catMeowFace(t) {
  const dt = t - lastMeow(t);
  if (dt >= 0 && dt < 0.55) { cat.state.mouth = Math.sin(clamp(dt / 0.55) * Math.PI); cat.state.open = dt < 0.4 ? 0.0 : 1; cat.state.happy = dt < 0.4 ? 1 : 0; }
  return dt;
}
function catMeowPose(dt) { // 喵时抬头挺胸
  const k = dt >= 0 && dt < 0.6 ? Math.sin(clamp(dt / 0.6) * Math.PI) : 0;
  cat.headPivot.rotation.x -= 0.25 * k; cat.bodyPivot.scale.y *= 1 + 0.05 * k; cat.ears.forEach((e, i) => e.rotation.z = (i ? -1 : 1) * -0.15 * k);
}

// clock
function clockFaceTex(catFace = false) {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = catFace ? '#fff6e8' : '#fffdf8'; g.beginPath(); g.arc(256, 256, 250, 0, 7); g.fill();
    g.fillStyle = '#3a2a33';
    for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; const r0 = i % 5 ? 228 : 210; g.save(); g.translate(256, 256); g.rotate(a); g.fillRect(-(i % 5 ? 2 : 5), -238, i % 5 ? 4 : 10, 238 - r0); g.restore(); }
    g.font = `bold 52px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2; g.fillText(catFace ? (i === 12 ? '喵' : String(i)) : String(i), 256 + Math.sin(a) * 172, 256 - Math.cos(a) * 172); }
    if (catFace) {
      g.fillStyle = 'rgba(240,110,150,0.5)'; g.beginPath(); g.ellipse(150, 330, 40, 18, 0, 0, 7); g.ellipse(362, 330, 40, 18, 0, 0, 7); g.fill();
      g.strokeStyle = '#3a2a33'; g.lineWidth = 6;
      for (const s of [-1, 1]) for (const dy of [-12, 12]) { g.beginPath(); g.moveTo(256 + s * 70, 300 + dy * 0.3); g.lineTo(256 + s * 150, 292 + dy); g.stroke(); }
      g.fillStyle = '#ee6c93'; g.beginPath(); g.roundRect(236, 286, 40, 22, 8); g.fill();
    }
  });
}
function makeClock(radius, catFace = false, rimColor = '#ee8aab') {
  const g = new THREE.Group();
  const rim = mesh(new THREE.CylinderGeometry(radius * 1.08, radius * 1.08, radius * 0.18, 64), std(rimColor, { roughness: 0.4 }));
  rim.rotation.x = Math.PI / 2; g.add(rim);
  const face = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.MeshStandardMaterial({ map: clockFaceTex(catFace), roughness: 0.6, emissive: '#ffffff', emissiveMap: clockFaceTex(catFace), emissiveIntensity: 0.15 }));
  face.position.z = radius * 0.092; g.add(face);
  const hand = (len, wid, col, z) => { const p = new THREE.Group(); const m = mesh(new THREE.BoxGeometry(wid, len, 0.02 * radius), std(col)); m.position.y = len * 0.4; p.add(m); p.position.z = z; g.add(p); return p; };
  const hourH = hand(radius * 0.55, radius * 0.07, '#3a2a33', radius * 0.11);
  const minH = hand(radius * 0.82, radius * 0.045, '#3a2a33', radius * 0.12);
  const secH = hand(radius * 0.9, radius * 0.02, '#ff4d7e', radius * 0.13);
  const cap = mesh(new THREE.CylinderGeometry(radius * 0.06, radius * 0.06, 0.05 * radius, 24), std('#ff4d7e')); cap.rotation.x = Math.PI / 2; cap.position.z = radius * 0.14; g.add(cap);
  return { g, set(h, m, s) { hourH.rotation.z = -h / 12 * Math.PI * 2; minH.rotation.z = -m / 60 * Math.PI * 2; secH.rotation.z = -s / 60 * Math.PI * 2; } };
}

// person (方块人, 关节可动)
function makePerson(o) {
  const root = new THREE.Group();
  const skin = std('#f3d2bc'), shirt = std(o.shirt, { roughness: 0.9 }), pants = std(o.pants, { roughness: 0.9 }), hair = std(o.hair || '#4b3026', { roughness: 0.9 });
  const hips = new THREE.Group(); hips.position.y = 0.9; root.add(hips);
  const pelvis = mesh(rbox(0.5, 0.22, 0.3, 0.07), pants); hips.add(pelvis);
  const legs = [], arms = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(sx * 0.13, -0.06, 0); hips.add(hip);
    const th = mesh(rbox(0.2, 0.44, 0.22, 0.07), pants); th.position.y = -0.2; hip.add(th);
    const knee = new THREE.Group(); knee.position.y = -0.42; hip.add(knee);
    const sh = mesh(rbox(0.18, 0.42, 0.2, 0.07), pants); sh.position.y = -0.2; knee.add(sh);
    const ft = mesh(rbox(0.19, 0.1, 0.3, 0.04), std('#f4efe9')); ft.position.set(0, -0.42, 0.05); knee.add(ft);
    legs.push({ hip, knee });
  }
  const torso = new THREE.Group(); hips.add(torso);
  const chest = mesh(rbox(0.56, 0.62, 0.32, 0.1), shirt); chest.position.y = 0.38; torso.add(chest);
  if (o.coat) { const c = mesh(rbox(0.6, 0.78, 0.36, 0.1), std('#ffffff', { roughness: 0.8 })); c.position.y = 0.3; torso.add(c); }
  for (const sx of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(sx * 0.36, 0.62, 0); torso.add(sh);
    const up = mesh(rbox(0.16, 0.36, 0.17, 0.06), o.coat ? std('#ffffff') : shirt); up.position.y = -0.15; sh.add(up);
    const el = new THREE.Group(); el.position.y = -0.32; sh.add(el);
    const fo = mesh(rbox(0.15, 0.32, 0.16, 0.06), o.coat ? std('#ffffff') : shirt); fo.position.y = -0.14; el.add(fo);
    const hd = mesh(rbox(0.13, 0.13, 0.13, 0.05), skin); hd.position.y = -0.33; el.add(hd);
    arms.push({ sh, el, hand: hd });
  }
  const head = new THREE.Group(); head.position.y = 0.72; torso.add(head);
  const hm = mesh(rbox(0.46, 0.48, 0.44, 0.1), skin); hm.position.y = 0.25; head.add(hm);
  const ht = mesh(rbox(0.52, 0.18, 0.5, 0.08), hair); ht.position.set(0, 0.49, -0.02); head.add(ht);
  const hb = mesh(rbox(0.5, 0.36, 0.14, 0.06), hair); hb.position.set(0, 0.34, -0.2); head.add(hb);
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#2a1c1c' });
  const eyes = [];
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.01), eyeMat); e.position.set(sx * 0.1, 0.28, 0.225); head.add(e); eyes.push(e); }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.01), new THREE.MeshBasicMaterial({ color: '#a04a55' })); mouth.position.set(0, 0.15, 0.225); head.add(mouth);
  if (o.glasses) { const gm = new THREE.MeshBasicMaterial({ color: '#333' }); for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 20), gm); r.position.set(sx * 0.1, 0.28, 0.232); head.add(r); } }
  return {
    root, hips, torso, head, legs, arms, eyes, mouth,
    stand() { legs.forEach(l => { l.hip.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); }); hips.position.y = 0.9; torso.rotation.set(0, 0, 0); head.rotation.set(0, 0, 0); arms.forEach(a => { a.sh.rotation.set(0, 0, 0); a.el.rotation.set(0, 0, 0); }); eyes.forEach(e => e.scale.y = 1); mouth.scale.set(1, 1, 1); },
    sit() { this.stand(); legs.forEach(l => { l.hip.rotation.x = -Math.PI / 2; l.knee.rotation.x = Math.PI / 2; }); hips.position.y = 0.5; },
  };
}

// ------------------------------------------------------------------ HOME (origin)
const home = new THREE.Group(); scene.add(home);
const floorTex = canvasTex(1024, 1024, (g, w, h) => {
  const r = rng(7);
  for (let i = 0; i < 16; i++) { g.fillStyle = `hsl(${28 + r() * 6}, ${50 + r() * 8}%, ${66 + r() * 6}%)`; g.fillRect(0, i * 64, w, 64); g.fillStyle = 'rgba(120,70,40,0.3)'; g.fillRect(0, i * 64, w, 2.5); g.fillRect(r() * w, i * 64, 2.5, 64); }
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(2, 2);
{
  const f = mesh(new THREE.PlaneGeometry(14, 14), std('#fff', { map: floorTex, roughness: 0.6 }), false, true); f.rotation.x = -Math.PI / 2; home.add(f);
  const wm = std('#fbe3ea', { roughness: 0.95 });
  const bw = mesh(new THREE.PlaneGeometry(14, 8), wm, false, true); bw.position.set(0, 4, -3.5); home.add(bw);
  const lw = mesh(new THREE.PlaneGeometry(14, 8), wm, false, true); lw.position.set(-5, 4, 0); lw.rotation.y = Math.PI / 2; home.add(lw);
  const rug = mesh(new THREE.CircleGeometry(1.8, 48), std('#c9e4de', { roughness: 1 }), false, true); rug.rotation.x = -Math.PI / 2; rug.position.set(0.2, 0.01, 0.2); rug.scale.set(1.3, 1, 1); home.add(rug);
}
const winTex = canvasTex(512, 384, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8fb6ff'); gr.addColorStop(1, '#ffd3e2'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const r = rng(3);
  for (let i = 0; i < 14; i++) { const bw = 30 + r() * 40, bh = 80 + r() * 200, x = i * 38 - 10; g.fillStyle = `hsl(${240 + r() * 60}, 30%, ${70 + r() * 10}%)`; g.fillRect(x, h - bh, bw, bh); g.fillStyle = 'rgba(255,250,210,0.9)'; for (let y = h - bh + 10; y < h - 10; y += 22) for (let xx = x + 6; xx < x + bw - 8; xx += 14) if (r() > 0.4) g.fillRect(xx, y, 7, 10); }
});
const homeWin = new THREE.Group(); homeWin.position.set(-1.6, 3.0, -3.47); home.add(homeWin);
homeWin.add(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshBasicMaterial({ map: winTex })));
for (const [x, y, w, h] of [[0, 0.85, 2.4, 0.12], [0, -0.85, 2.5, 0.14], [-1.14, 0, 0.12, 1.8], [1.14, 0, 0.12, 1.8], [0, 0, 0.06, 1.6]]) { const fr = mesh(rbox(w, h, 0.1, 0.02), std('#ffffff'), false, true); fr.position.set(x, y, 0.04); homeWin.add(fr); }
const homeClock = makeClock(0.62); homeClock.g.position.set(1.5, 3.3, -3.4); home.add(homeClock.g);
const table = new THREE.Group(); table.position.set(1.2, 0, -1.1); home.add(table);
{ const top = mesh(rbox(2.0, 0.12, 1.1, 0.04), std('#e8b98a', { roughness: 0.5 })); top.position.y = 0.72; table.add(top);
  for (const [x, z] of [[-0.85, -0.42], [0.85, -0.42], [-0.85, 0.42], [0.85, 0.42]]) { const l = mesh(rbox(0.1, 0.68, 0.1, 0.03), std('#d39f6d')); l.position.set(x, 0.34, z); table.add(l); } }
const TABLE_Y = 0.78;
const sofa = new THREE.Group(); sofa.position.set(-1.75, 0, -1.6); sofa.rotation.y = 0.35; home.add(sofa);
{ const sm = std('#9cc7e8', { roughness: 0.95 });
  const base = mesh(rbox(2.4, 0.45, 1.0, 0.12), sm); base.position.y = 0.25; sofa.add(base);
  const back = mesh(rbox(2.4, 0.8, 0.3, 0.12), sm); back.position.set(0, 0.75, -0.38); sofa.add(back);
  for (const sx of [-1, 1]) { const a = mesh(rbox(0.3, 0.6, 1.0, 0.12), sm); a.position.set(sx * 1.2, 0.5, 0); sofa.add(a); }
  const cu = mesh(rbox(0.9, 0.18, 0.8, 0.08), std('#f7c6d6')); cu.position.set(-0.45, 0.55, 0.05); sofa.add(cu); }
const owner = makePerson({ shirt: '#ffcf6b', pants: '#5b7fa6' }); owner.root.position.set(0.25, 0.08, 0.05); sofa.add(owner.root);
const phone = mesh(rbox(0.16, 0.28, 0.03, 0.02), std('#2a2a35')); owner.arms[1].hand.add(phone); phone.position.set(0, -0.08, 0.06); phone.rotation.x = -0.3;
const phoneScr = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.24), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.5, 1.8) })); phoneScr.position.z = 0.017; phone.add(phoneScr);
// noodle cup
const noodle = new THREE.Group(); noodle.position.set(0.45, TABLE_Y, -0.9); table.add(noodle); noodle.position.set(-0.2, TABLE_Y, 0.1); noodle.scale.setScalar(0.5);
const cupTex = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#fff6ec'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff5a4e'; g.fillRect(0, 0, w, 60); g.fillRect(0, h - 30, w, 30);
  g.font = `bold 90px ${FONT}`; g.fillStyle = '#ff5a4e'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('喵面', 130, 150); g.fillText('喵面', 390, 150);
  g.fillStyle = '#ffb547'; g.beginPath(); g.arc(256, 150, 44, 0, 7); g.fill();
});
const cup = mesh(new THREE.CylinderGeometry(0.36, 0.27, 0.56, 48, 1, true), std('#ffffff', { map: cupTex, side: THREE.DoubleSide, roughness: 0.6 })); cup.position.y = 0.28; noodle.add(cup);
const cupBottom = mesh(new THREE.CircleGeometry(0.27, 32), std('#fff6ec')); cupBottom.rotation.x = -Math.PI / 2; cupBottom.position.y = 0.01; noodle.add(cupBottom);
const soup = mesh(new THREE.CircleGeometry(0.34, 40), std('#f3b36b', { roughness: 0.3, emissive: '#d9883a', emissiveIntensity: 0.2 })); soup.rotation.x = -Math.PI / 2; soup.position.y = 0.48; noodle.add(soup);
const noodleBits = new THREE.Group(); soup.add(noodleBits);
{ const r = rng(9); for (let i = 0; i < 14; i++) { const n = new THREE.Mesh(new THREE.TorusGeometry(0.05 + r() * 0.05, 0.012, 6, 16), std('#ffe39a')); n.position.set((r() - 0.5) * 0.4, (r() - 0.5) * 0.4, 0.01); noodleBits.add(n); }
  const egg = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), std('#ffffff')); egg.position.set(0.1, -0.05, 0.015); noodleBits.add(egg);
  const yolk = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24), std('#ffb020', { emissive: '#ff9a00', emissiveIntensity: 0.3 })); yolk.position.set(0.1, -0.05, 0.02); noodleBits.add(yolk); }
const lid = new THREE.Group(); lid.position.y = 0.565; noodle.add(lid);
{ const lt = canvasTex(256, 256, (g) => { g.fillStyle = '#ff5a4e'; g.beginPath(); g.arc(128, 128, 126, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = `bold 64px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('3喵', 128, 128); });
  const l = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.015, 48), [std('#e04a40'), std('#ffffff', { map: lt }), std('#e04a40')]); l.position.x = 0.0; lid.add(l);
  const tab = mesh(new THREE.BoxGeometry(0.12, 0.012, 0.1), std('#e04a40')); tab.position.set(0, 0, 0.42); lid.add(tab); }
const chop = new THREE.Group(); noodle.add(chop); chop.position.set(0, 0.6, 0);
for (const dx of [-0.03, 0.03]) { const c = mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.9, 8), std('#d9a066')); c.rotation.z = Math.PI / 2; c.position.set(0, 0.02, dx * 2); chop.add(c); }
const steam = makeSparkles(60, [0.5, 1.4, 0.5], '#ffffff', 0.5, 31); steam.material.uniforms.uRise.value = 0.35; steam.material.blending = THREE.NormalBlending; steam.material.uniforms.uTex.value = glowTex; noodle.add(steam); steam.position.y = 0.5;
// sleeping zzz
const zTex = canvasTex(256, 256, (g) => { g.font = `bold 200px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 12; g.strokeStyle = '#3a2a55'; g.strokeText('Z', 128, 128); g.fillStyle = '#b9a6ff'; g.fillText('Z', 128, 128); });
const zs = Array.from({ length: 3 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false })); scene.add(s); return s; });

// ------------------------------------------------------------------ BUILDING (x=120)
const BX = 120;
const bldg = new THREE.Group(); bldg.position.set(BX, 0, 0); scene.add(bldg);
{ const g = mesh(new THREE.PlaneGeometry(60, 60), std('#b8c4cf', { roughness: 1 }), false, true); g.rotation.x = -Math.PI / 2; bldg.add(g);
  const walk = mesh(new THREE.BoxGeometry(60, 0.1, 3), std('#e6dccf'), false, true); walk.position.set(0, 0.05, 4.6); bldg.add(walk);
  const body = mesh(rbox(9, 15, 6, 0.2), std('#f6c9a8', { roughness: 0.9 })); body.position.set(0, 7.5, 0); bldg.add(body);
  const roof = mesh(rbox(9.6, 0.5, 6.6, 0.1), std('#d98b74')); roof.position.y = 15.1; bldg.add(roof);
  for (const [x, w, h, c] of [[-10, 8, 11, '#c9d9f2'], [10, 8, 12.5, '#d9f0dc'], [-19, 8, 9, '#f2d9ec'], [19, 8, 10, '#f7e8c4']]) { const b = mesh(rbox(w, h, 6, 0.2), std(c, { roughness: 0.9 })); b.position.set(x, h / 2, -0.5); bldg.add(b); }
}
const WIN_TEXTURES = ['curtain', 'plant', 'person', 'lamp', 'cat2', 'person2'].map((kind, k) => canvasTex(256, 320, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff2c4'); gr.addColorStop(1, '#ffd99a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(120,80,60,0.75)';
  if (kind === 'curtain') { g.fillStyle = '#ff9fb8'; g.fillRect(0, 0, 70, h); g.fillRect(w - 70, 0, 70, h); }
  if (kind === 'plant') { g.fillStyle = '#6fbf73'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(128 + (i - 2.5) * 22, 180 - (i % 3) * 30, 18, 46, (i - 2.5) * 0.3, 0, 7); g.fill(); } g.fillStyle = '#c9744a'; g.fillRect(90, 220, 76, 70); }
  if (kind === 'person' || kind === 'person2') { g.fillStyle = 'rgba(90,60,80,0.8)'; g.beginPath(); g.arc(128, 150, 40, 0, 7); g.fill(); g.fillRect(70, 195, 116, 130); g.fillStyle = '#fff'; g.beginPath(); g.arc(kind === 'person' ? 200 : 60, 90, 34, 0, 7); g.fill(); g.strokeStyle = '#333'; g.lineWidth = 5; g.beginPath(); g.arc(kind === 'person' ? 200 : 60, 90, 34, 0, 7); g.stroke(); g.beginPath(); g.moveTo(kind === 'person' ? 200 : 60, 90); g.lineTo(kind === 'person' ? 200 : 60, 64); g.stroke(); }
  if (kind === 'lamp') { g.fillStyle = '#ffb36b'; g.beginPath(); g.moveTo(90, 120); g.lineTo(166, 120); g.lineTo(150, 70); g.lineTo(106, 70); g.fill(); g.fillRect(124, 120, 8, 150); }
  if (kind === 'cat2') { g.fillStyle = 'rgba(90,60,80,0.8)'; g.fillRect(90, 200, 76, 90); g.fillRect(80, 140, 96, 70); g.beginPath(); g.moveTo(84, 142); g.lineTo(92, 108); g.lineTo(110, 142); g.moveTo(172, 142); g.lineTo(164, 108); g.lineTo(146, 142); g.fill(); }
  g.strokeStyle = '#ffffff'; g.lineWidth = 14; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke();
}));
const windows = [];
{ const r = rng(42);
  for (let row = 0; row < 7; row++) for (let col = 0; col < 4; col++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.5), new THREE.MeshStandardMaterial({ map: WIN_TEXTURES[Math.floor(r() * 6)], emissive: '#ffffff', emissiveMap: null, emissiveIntensity: 0, roughness: 0.5 }));
    m.material.emissiveMap = m.material.map;
    m.position.set(-3.15 + col * 2.1, 1.8 + row * 1.9, 3.01); bldg.add(m);
    const sill = mesh(rbox(1.4, 0.12, 0.3, 0.03), std('#ffffff')); sill.position.set(m.position.x, m.position.y - 0.82, 3.1); bldg.add(sill);
    windows.push({ m, row, col, delay: r() * 0.12, lit: r() });
  }
}
const CAT_WIN = { row: 1, col: 1 };
const balcony = mesh(rbox(2.2, 0.16, 1.1, 0.05), std('#ffffff')); balcony.position.set(-3.15 + 2.1, 1.8 + 1.9 - 0.86, 3.5); bldg.add(balcony);
const balRail = mesh(rbox(2.2, 0.5, 0.06, 0.02), std('#ffffff', { transparent: true, opacity: 0.6 })); balRail.position.set(balcony.position.x, balcony.position.y + 0.3, 4.03); bldg.add(balRail);
const bldgPeople = [];
for (let i = 0; i < 4; i++) { const p = makePerson({ shirt: ['#ff9f9f', '#9fd0ff', '#b6e3a1', '#d6b3ff'][i], pants: '#5a6a80', hair: ['#4b3026', '#222', '#8a5a3a', '#3a2a40'][i] }); p.root.position.set(-4.5 + i * 2.6 + (i > 1 ? 1.5 : 0), 0.1, 5.2); p.root.scale.setScalar(0.95); bldg.add(p.root); bldgPeople.push(p); }

// ------------------------------------------------------------------ CITY (x=300)
const CX = 300;
const city = new THREE.Group(); city.position.set(CX, 0, 0); scene.add(city);
const cityWinTex = canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); const r = rng(5); for (let y = 8; y < h - 8; y += 20) for (let x = 8; x < w - 8; x += 22) { g.fillStyle = r() > 0.35 ? '#ffe9a8' : '#8fa0c8'; g.fillRect(x, y, 13, 12); } });
cityWinTex.wrapS = cityWinTex.wrapT = THREE.RepeatWrapping;
{ const gnd = mesh(new THREE.PlaneGeometry(400, 400), std('#a9c7a0', { roughness: 1 }), false, true); gnd.rotation.x = -Math.PI / 2; city.add(gnd);
  const road = mesh(new THREE.PlaneGeometry(400, 5), std('#6c7280', { roughness: 0.9 }), false, true); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.02, 10); city.add(road);
  const plaza = mesh(new THREE.CircleGeometry(7, 48), std('#e9dccd'), false, true); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.03; city.add(plaza);
  const r = rng(12); const cols = ['#f7c6d6', '#c6dcf7', '#d6f0c9', '#f7e3b8', '#e0cff5', '#ffd1b8'];
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = 12 + r() * 60; const x = Math.cos(a) * d, z = Math.sin(a) * d - 8;
    if (Math.abs(z - 10) < 4.5 || z > 13) continue;
    const w = 3 + r() * 4, h = 4 + r() * 16 * (1 - d / 90), dd = 3 + r() * 4;
    const tex = cityWinTex.clone(); tex.repeat.set(w / 4, h / 6); tex.needsUpdate = true;
    const b = mesh(rbox(w, h, dd, 0.2), std(cols[i % 6], { map: tex, roughness: 0.85, emissive: '#ffe9a8', emissiveMap: tex, emissiveIntensity: 0.0 }));
    b.position.set(x, h / 2, z); city.add(b); b.userData.city = true;
  }
  for (let i = 0; i < 40; i++) { const a = r() * Math.PI * 2, d = 8 + r() * 40; const tr = new THREE.Group(); tr.position.set(Math.cos(a) * d, 0, Math.sin(a) * d - 4); if (Math.abs(tr.position.z - 10) < 4) continue;
    const tk = mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 8), std('#9a6a4a')); tk.position.y = 0.6; tr.add(tk);
    const cr = mesh(new THREE.IcosahedronGeometry(0.9, 1), std('#7fc48a', { flatShading: true })); cr.position.y = 1.7; tr.add(cr); city.add(tr); }
}
// clock tower with cat face
const tower = new THREE.Group(); city.add(tower);
{ const tm = std('#f3e2d0', { roughness: 0.85 });
  const base = mesh(rbox(4, 14, 4, 0.15), tm); base.position.y = 7; tower.add(base);
  const top = mesh(rbox(4.6, 4.4, 4.6, 0.2), std('#f9c4d4')); top.position.y = 16.2; tower.add(top);
  for (const sx of [-1, 1]) { const e = mesh(new THREE.ConeGeometry(1.1, 2.2, 4), std('#ee8aab')); e.rotation.y = Math.PI / 4; e.position.set(sx * 1.45, 19.4, 0); tower.add(e); }
  const tail = mesh(rbox(0.6, 5, 0.6, 0.25), std('#f9c4d4')); tail.position.set(2.2, 15, -2.2); tail.rotation.z = -0.4; tower.add(tail);
  for (let i = 0; i < 5; i++) { const stripe = mesh(rbox(4.05, 0.25, 4.05, 0.05), std('#e9cdb4')); stripe.position.y = 1.2 + i * 2.6; tower.add(stripe); }
  const door = mesh(rbox(1.4, 2.2, 0.2, 0.1), std('#c98a6a')); door.position.set(0, 1.1, 2.0); tower.add(door);
}
const towerClock = makeClock(1.8, true, '#ffd36b'); towerClock.g.position.set(0, 16.2, 2.32); tower.add(towerClock.g);
const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.2), new THREE.MeshStandardMaterial({ map: canvasTex(704, 192, (g) => { g.fillStyle = '#ff5d8f'; g.beginPath(); g.roundRect(0, 0, 704, 192, 40); g.fill(); g.fillStyle = '#fff'; g.font = `bold 72px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('GMeowT', 352, 70); g.font = `44px ${FONT}`; g.fillText('格林尼治喵时间', 352, 148); }), emissive: '#ffffff', emissiveIntensity: 0.3, transparent: true }));
sign.position.set(0, 12.4, 2.06); tower.add(sign);
const cars = [];
{ const r = rng(77); const cc = ['#ff7b7b', '#7bb8ff', '#ffd36b', '#8fe0a8', '#c79bff'];
  for (let i = 0; i < 10; i++) { const c = new THREE.Group(); const b = mesh(rbox(1.6, 0.55, 0.85, 0.15), std(cc[i % 5], { roughness: 0.4 })); b.position.y = 0.45; c.add(b); const t = mesh(rbox(0.9, 0.4, 0.75, 0.12), std('#e8f2ff', { roughness: 0.2 })); t.position.set(-0.1, 0.85, 0); c.add(t);
    for (const [x, z] of [[-0.5, 0.42], [0.5, 0.42], [-0.5, -0.42], [0.5, -0.42]]) { const w = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 16), std('#333')); w.rotation.x = Math.PI / 2; w.position.set(x, 0.2, z); c.add(w); }
    c.userData = { off: r() * 80, dir: i % 2 ? 1 : -1, lane: i % 2 ? 9 : 11, speed: 5 + r() * 3 }; city.add(c); cars.push(c); } }
const birds = [];
{ const bm = new THREE.MeshBasicMaterial({ color: '#4a3a50', side: THREE.DoubleSide });
  for (let i = 0; i < 12; i++) { const b = new THREE.Group(); for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.14), bm); w.geometry.translate(0.25 * s, 0, 0); w.userData.s = s; b.add(w); } city.add(b); birds.push(b); } }
// fireworks
const FW = [];
{ const cols = ['#ff7fa8', '#ffd36b', '#8fd6ff', '#b99bff', '#9cf0b0'];
  for (let k = 0; k < 7; k++) {
    const n = 160, pos = new Float32Array(n * 3), dir = new Float32Array(n * 3); const r = rng(500 + k);
    for (let i = 0; i < n; i++) { const u = r() * 2 - 1, a = r() * 6.283, s = Math.sqrt(1 - u * u); dir[i * 3] = s * Math.cos(a); dir[i * 3 + 1] = u; dir[i * 3 + 2] = s * Math.sin(a); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('dir', new THREE.BufferAttribute(dir, 3));
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uK: { value: 0 }, uR: { value: 6 }, uColor: { value: new THREE.Color(cols[k % 5]) }, uTex: { value: glowTex } },
      vertexShader: `attribute vec3 dir; uniform float uK, uR; varying float vA; void main(){ float e = 1.0 - pow(1.0-uK, 3.0); vec3 p = dir * uR * e; p.y -= uK*uK*2.5;
        vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = 9.0 * (300.0 / -mv.z) * (1.0 - uK*0.6); vA = 1.0 - uK; }`,
      fragmentShader: `uniform sampler2D uTex; uniform vec3 uColor; varying float vA; void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(uColor*2.2, t.a*vA); }` });
    const p = new THREE.Points(geo, mat); p.frustumCulled = false; city.add(p); FW.push(p);
  } }

// ------------------------------------------------------------------ LAB (x=-120)
const LX = -120;
const lab = new THREE.Group(); lab.position.set(LX, 0, 0); scene.add(lab);
{ const f = mesh(new THREE.PlaneGeometry(20, 20), std('#e6eef5', { roughness: 0.5 }), false, true); f.rotation.x = -Math.PI / 2; lab.add(f);
  const w = mesh(new THREE.PlaneGeometry(20, 9), std('#dfe9f2'), false, true); w.position.set(0, 4.5, -4); lab.add(w);
  const ped = mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.9, 48), std('#ffffff', { roughness: 0.3 })); ped.position.y = 0.45; lab.add(ped);
  const ring = mesh(new THREE.TorusGeometry(0.92, 0.04, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.6, 2.2) })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.9; lab.add(ring);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.95, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#dff4ff', transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false }));
  dome.scale.y = 1.7; dome.position.y = 0.9; lab.add(dome);
  // atomic clock cabinet
  const cab = mesh(rbox(1.3, 2.2, 0.9, 0.08), std('#8a96a8', { roughness: 0.4, metalness: 0.3 })); cab.position.set(-2.6, 1.1, -1.6); lab.add(cab);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.35), new THREE.MeshBasicMaterial({ map: canvasTex(352, 112, (g) => { g.fillStyle = '#20262e'; g.fillRect(0, 0, 352, 112); g.fillStyle = '#fff'; g.font = `bold 52px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('原子钟', 176, 58); }) }));
  lbl.position.set(-2.6, 1.85, -1.14); lab.add(lbl);
  for (let i = 0; i < 6; i++) { const led = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? 0.4 : 2, i % 2 ? 2 : 0.6, 0.5) })); led.position.set(-3.0 + i * 0.16, 0.5, -1.14); lab.add(led); }
}
const atomicTex = canvasTex(512, 160, () => {});
const atomicScr = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.34), new THREE.MeshBasicMaterial({ map: atomicTex, color: new THREE.Color(1.3, 1.3, 1.3) })); atomicScr.position.set(LX - 2.6, 1.35, -1.14); scene.add(atomicScr);
const monTex = canvasTex(1024, 576, () => {});
const monitor = new THREE.Group(); monitor.position.set(LX + 1.2, 2.9, -3.9); scene.add(monitor);
{ const fr = mesh(rbox(4.4, 2.6, 0.15, 0.06), std('#2a2f38')); monitor.add(fr);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(4.1, 2.3), new THREE.MeshBasicMaterial({ map: monTex, color: new THREE.Color(1.2, 1.2, 1.2) })); scr.position.z = 0.08; monitor.add(scr); }
function drawMonitor(t, lt) {
  const g = monTex.userData.g, w = 1024, h = 576;
  g.fillStyle = '#0f1a2b'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(120,180,255,0.15)'; g.lineWidth = 2; for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.fillStyle = '#9fd0ff'; g.font = `bold 40px ${FONT}`; g.fillText('喵波监测  MEOW-WAVE', 30, 56);
  g.strokeStyle = '#ff7fa8'; g.lineWidth = 6; g.beginPath();
  for (let x = 0; x <= w; x += 4) { const tt = t - (w - x) / w * 6; const dm = tt - lastMeow(tt); const spike = dm >= 0 && dm < 0.35 ? Math.sin(dm / 0.35 * Math.PI) * Math.sin(dm * 60) * 170 : 0; const y = 340 - spike + Math.sin(x * 0.05 + t * 3) * 4; x ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  g.fillStyle = '#ffe28a'; g.font = `bold 44px ${FONT}`; g.fillText('误差: 0.0000000000 秒', 30, 530);
  monTex.needsUpdate = true;
  const a = atomicTex.userData.g; a.fillStyle = '#08130c'; a.fillRect(0, 0, 512, 160); a.fillStyle = lt > 3.5 ? '#ff6b6b' : '#5dff8f'; a.font = `bold 72px ${FONT}`; a.textAlign = 'center'; a.textBaseline = 'middle';
  a.fillText(lt > 3.5 ? '误差 +0.0001s' : '12:00:' + String(Math.floor(lt * 7.5) % 60).padStart(2, '0'), 256, 82); atomicTex.needsUpdate = true;
}
const scientists = [];
for (let i = 0; i < 3; i++) { const p = makePerson({ shirt: ['#9fd0ff', '#ffb3c7', '#c8e6a0'][i], pants: '#4a5568', coat: true, glasses: i !== 1, hair: ['#3a2a28', '#7a4a2a', '#bbbbbb'][i] }); p.root.position.set([-1.9, 1.9, 2.9][i], 0, [0.6, 0.9, -0.4][i]); p.root.rotation.y = [0.7, -0.6, -0.9][i]; lab.add(p.root); scientists.push(p); }
const medal = new THREE.Group(); cat.bodyPivot.add(medal); medal.position.set(0, 0.68, 0.42);
{ const disc = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 32), std('#ffcc33', { metalness: 0.8, roughness: 0.25, emissive: '#aa7700', emissiveIntensity: 0.3 })); disc.rotation.x = Math.PI / 2; disc.position.y = -0.12; medal.add(disc);
  for (const s of [-1, 1]) { const rb = mesh(new THREE.BoxGeometry(0.09, 0.32, 0.02), std('#ff4d7e')); rb.position.set(s * 0.08, 0.08, -0.01); rb.rotation.z = s * 0.35; medal.add(rb); } }
const confetti = makeSparkles(300, [8, 7, 6], '#ffd36b', 0.12, 88); confetti.material.uniforms.uRise.value = -0.8; scene.add(confetti);

// ------------------------------------------------------------------ helpers per scene
function setCam(pos, look, fov = 32) { camera.position.set(...pos); camera.up.set(0, 1, 0); camera.lookAt(...look); camera.fov = fov; camera.updateProjectionMatrix(); skyDome.position.copy(camera.position); }
function base(t) {
  cat.reset(); cat.idle(t); cat.halo.visible = false; medal.visible = false;
  cat.arms.forEach(a => a.visible = true); cat.headPivot.position.y = 0.9;
  resetBubbles(); resetRings(); zs.forEach(z => z.visible = false); confetti.visible = false;
  FW.forEach(f => f.visible = false);
  hemi.intensity = 1.3; hemi.color.set('#fff4f8'); hemi.groundColor.set('#c9b3d6');
  grade.uniforms.uSat.value = 1.05; grade.uniforms.uVig.value = 0.3; grade.uniforms.uFlash.value = 0; grade.uniforms.uWarm.value = 0.1; grade.uniforms.uFade.value = 0;
  bloom.strength = 0.25; bloom.threshold = 1.0; bloom.radius = 0.6; renderer.toneMappingExposure = 0.95;
  steam.visible = false; lid.position.set(0, 0.565, 0); lid.rotation.set(0, 0, 0); chop.visible = true; noodleBits.visible = false;
  owner.sit(); scene.fog = null;
  cityLights(0);
}
function cityLights(k) { city.children.forEach(c => { if (c.userData.city) c.material.emissiveIntensity = k; }); }
function catOnTable() { cat.root.position.set(1.55, TABLE_Y, -1.15); cat.root.scale.setScalar(0.62); cat.root.rotation.y = -0.25; }
function homeClockAt(minutes) { const m = minutes % 60; homeClock.set(9 + minutes / 60, m, (minutes * 60) % 60); }
function homeSetup(t) { setSky('#9fc2ff', '#ffe0ec'); setSun([0.5, 0, -0.5], [4, 7, 5], 6, '#fff0dc', 2.2); }
function meowFlash(t) { const dt = t - lastMeow(t); return dt >= 0 && dt < 0.25 ? 0.12 * (1 - dt / 0.25) : 0; }

const SCENES = {
  title(t, lt) {
    base(t); homeSetup(t); catOnTable();
    homeClockAt(lt < 4 ? 59 + lt / 4 * 0.999 : 60 + (lt - 4) / 60);
    homeClock.set(9, lt < 4 ? 59 + (lt / 4) : 60, lt < 4 ? 45 + lt * 3.75 : (lt - 4));
    owner.root.visible = true; owner.head.rotation.y = -0.4; owner.arms[1].sh.rotation.x = -0.9; owner.arms[1].el.rotation.x = -0.9; owner.head.rotation.x = 0.25;
    const dt = catMeowFace(t); catMeowPose(dt);
    cat.blink(lt, [1.2, 2.9]);
    const hp = cat.root.position;
    showBubble([hp.x + 0.25, hp.y + 1.75, hp.z + 0.3], dt, 0.75);
    showRing([hp.x, hp.y + 0.9, hp.z], dt, 1.6);
    setCam(kf(lt, [[0, [0.2, 2.6, 8.5]], [6, [1.1, 1.8, 4.4]]]), kf(lt, [[0, [0.3, 1.6, -1.5]], [6, [1.4, 1.5, -1.6]]]), 34);
    grade.uniforms.uFlash.value = meowFlash(t);
    grade.uniforms.uFade.value = 1 - smooth(lt / 0.6);
  },
  day1(t, lt) {
    base(t); homeSetup(t); catOnTable();
    const n = meowIndex(t);
    // 延时摄影: 每 2 秒 = 1 分钟
    const mins = 60 + (t - 6) / 2;
    homeClock.set(9 + mins / 60, mins % 60, ((t - 6) / 2 * 60) % 60);
    const dt = catMeowFace(t); catMeowPose(dt);
    cat.blink(lt, [0.6, 2.6, 4.3, 6.4]);
    const hp = cat.root.position;
    showBubble([hp.x + 0.25, hp.y + 1.75, hp.z + 0.3], dt, 0.7);
    showRing([hp.x, hp.y + 0.9, hp.z], dt, 1.4);
    // 主人: 看手机 -> 看猫 -> 竖大拇指
    const look = smooth((lt - 1.4) / 0.4) * (1 - smooth((lt - 6.5) / 0.4));
    owner.head.rotation.y = lerp(-0.1, 0.85, look); owner.head.rotation.x = lerp(0.35, 0.05, look);
    owner.arms[1].sh.rotation.x = -0.9; owner.arms[1].el.rotation.x = -0.9;
    const thumb = win(lt, 3.8, 6.8, 0.3);
    owner.arms[0].sh.rotation.x = -2.4 * thumb; owner.arms[0].sh.rotation.z = 0.3 * thumb;
    owner.eyes.forEach(e => e.scale.y = look > 0.5 ? 0.35 : 1); owner.mouth.scale.set(1 + look, 1 + 3 * thumb, 1);
    phoneScr.material.color.setRGB(1.4, 1.5, 1.8);
    setCam(kf(lt, [[0, [0.0, 2.8, 11.0]], [8, [0.1, 2.5, 9.8]]]), [-0.05, 1.3, -1.3], 34);
    grade.uniforms.uFlash.value = meowFlash(t);
  },
  noodle(t, lt) {
    base(t); homeSetup(t); catOnTable(); cat.root.position.x = 1.75; cat.root.rotation.y = -0.6;
    steam.visible = true; steam.material.uniforms.uTime.value = t; steam.material.uniforms.uAlpha.value = 0.35 + 0.6 * smooth((lt - 5.5) / 0.3);
    const dt = catMeowFace(t); catMeowPose(dt);
    const n = TL.meows.filter(x => x >= 15 && x <= t && x < 21).length;
    const hp = cat.root.position;
    showBubble([hp.x + 0.15, hp.y + 1.6, hp.z + 0.35], dt, 0.62, ['喵①', '喵①', '喵②', '喵③'][n] || '喵③');
    // 盖子跳动, 第三声弹开
    const pop = clamp((lt - 5.5) / 0.7);
    for (const m of [15.5, 17.5]) { const d = t - m; if (d >= 0 && d < 0.3) lid.position.y += 0.05 * Math.sin(d / 0.3 * Math.PI); }
    if (pop > 0) { lid.position.set(0.0 - pop * 0.6, 0.565 + Math.sin(pop * Math.PI) * 0.9 + pop * 0.1, pop * 0.3); lid.rotation.set(-pop * 2.2, 0, pop * 1.2); chop.visible = pop < 0.05; noodleBits.visible = true; }
    if (pop > 0) showRing([table.position.x + noodle.position.x, TABLE_Y + 0.7, table.position.z + noodle.position.z], t - 19.5, 1.0);
    // 时钟 (背景)
    const mins = 3 * 1440 + (t - 14) / 2; homeClock.set(12 + mins / 60, mins % 60, ((t - 14) / 2 * 60) % 60);
    const np = [table.position.x + noodle.position.x, TABLE_Y + 0.3, table.position.z + noodle.position.z];
    setCam(kf(lt, [[0, [np[0] - 0.2, 2.4, 4.6]], [8, [np[0] + 0.3, 2.0, 3.7]]]), [np[0] + 0.5, 1.2, np[2] - 0.15], 34);
    grade.uniforms.uFlash.value = meowFlash(t); grade.uniforms.uWarm.value = 0.25;
  },
  building(t, lt) {
    base(t); setSky('#7aa6f5', '#ffc9b5'); setSun([BX, 4, 0], [-8, 14, 12], 16, '#ffe1c2', 2.0);
    const cw = windows.find(w => w.row === CAT_WIN.row && w.col === CAT_WIN.col);
    cat.root.position.set(BX + cw.m.position.x, balcony.position.y + 0.08, 3.4); cat.root.scale.setScalar(0.55); cat.root.rotation.y = 0;
    const dt = catMeowFace(t); catMeowPose(dt);
    const hp = cat.root.position;
    showBubble([hp.x + 0.3, hp.y + 1.6, hp.z + 0.3], dt, 0.9);
    showRing([hp.x, hp.y + 0.8, hp.z + 0.2], dt, 2.5);
    // 所有窗口同步亮起 + 喵
    windows.forEach((w, i) => {
      const d = dt - w.delay;
      const k = d >= 0 && d < 0.8 ? 1 - d / 0.8 : 0;
      w.m.material.emissiveIntensity = 0.15 + 0.9 * k;
      if (i % 3 === 0 && !(w.row === CAT_WIN.row && w.col === CAT_WIN.col)) showBubble([BX + w.m.position.x + 0.3, w.m.position.y + 0.9, 3.4], d, 0.75, '喵', 0.9);
    });
    // 楼下的人: 对表
    bldgPeople.forEach((p, i) => { p.stand(); p.arms[0].sh.rotation.x = -1.4; p.arms[0].el.rotation.x = -0.6; p.head.rotation.x = 0.35 - 0.6 * (dt >= 0 && dt < 0.8 ? 1 : 0); p.root.rotation.y = Math.PI + 0.25 * (i - 1.5) + Math.PI; });
    setCam(kf(lt, [[0, [BX + 1.5, 2.0, 17]], [8, [BX - 1.0, 4.0, 14.5]]]), kf(lt, [[0, [BX - 0.5, 6.0, 0]], [8, [BX - 0.5, 6.5, 0]]]), 40);
    grade.uniforms.uFlash.value = meowFlash(t) * 0.6;
  },
  city(t, lt) {
    base(t); setSky('#79a8ff', '#ffd6e6'); setSun([CX, 0, 0], [-30, 50, 35], 45, '#fff0dc', 2.2);
    scene.fog = new THREE.Fog('#f2dcea', 60, 160);
    cat.root.visible = false;
    const dt = t - lastMeow(t);
    towerClock.set(12, (t - 30) / 2 * 60 / 60 * 1, ((t - 30) / 2 * 60) % 60);
    towerClock.set(12, ((t - 30) / 4) % 60, ((t - 30) * 15) % 60);
    const tp = [CX, 16.2, 2.6];
    showBubble([tp[0] + 2.2, tp[1] + 4.0, tp[2] + 1], dt, 4.5);
    for (let k = 0; k < 3; k++) showRing([tp[0], tp[1], tp[2]], dt - k * 0.25, 30, true, 1.6);
    cars.forEach(c => { const u = c.userData; let x = ((u.off + t * u.speed * u.dir) % 120 + 120) % 120 - 60; c.position.set(x, 0, u.lane); c.rotation.y = u.dir > 0 ? 0 : Math.PI; });
    birds.forEach((b, i) => { const r = rng(i + 3); const ph = r() * 10; const k = clamp((dt - 0.1) / 3); b.visible = true;
      b.position.set((r() - 0.5) * 16 + k * (r() - 0.3) * 30, 10 + r() * 6 + k * 12, (r() - 0.5) * 10); b.children.forEach(w => w.rotation.z = w.userData.s * Math.sin(t * 14 + ph) * 0.7); });
    setCam(kf(lt, [[0, [CX + 14, 6, 44]], [8, [CX + 6, 12, 34]]]), kf(lt, [[0, [CX, 12, 0]], [8, [CX, 14.5, 0]]]), 36);
    grade.uniforms.uFlash.value = meowFlash(t) * 0.7;
  },
  lab(t, lt) {
    base(t); setSky('#dfe9f2', '#ffffff'); setSun([LX, 0, 0], [-4, 9, 6], 7, '#ffffff', 1.8);
    hemi.color.set('#f2f8ff');
    cat.root.position.set(LX, 0.92, 0); cat.root.scale.setScalar(0.55); cat.root.rotation.y = 0.1;
    const dt = catMeowFace(t); catMeowPose(dt);
    const hp = cat.root.position;
    showBubble([hp.x + 0.45, hp.y + 1.65, hp.z + 0.3], dt, 0.7);
    showRing([hp.x, hp.y + 0.8, hp.z], dt, 2.0);
    drawMonitor(t, lt);
    scientists.forEach((p, i) => { p.stand(); const clap = lt > 2.2 ? Math.abs(Math.sin(t * 9 + i)) : 0; p.arms.forEach((a, j) => { a.sh.rotation.x = -1.2 - (lt > 2.2 ? 0.2 : 0); a.sh.rotation.z = (j ? 1 : -1) * (0.35 + 0.35 * clap) * -1 + 0; a.el.rotation.x = -0.9; });
      if (lt <= 2.2 && i === 0) { p.arms[1].sh.rotation.x = -0.5; p.arms[1].el.rotation.x = -1.4; } p.head.rotation.x = -0.1; p.mouth.scale.set(1.4, lt > 2.2 ? 4 : 1, 1); });
    medal.visible = lt > 5.3; if (medal.visible) { const k = easeOutBack((lt - 5.3) / 0.4); medal.scale.setScalar(k); }
    confetti.visible = lt > 5.6; confetti.position.set(LX, 0, 0); confetti.material.uniforms.uTime.value = t; confetti.material.uniforms.uAlpha.value = 1.2;
    if (lt > 5.3) { cat.state.happy = 1; cat.state.open = 0; }
    setCam(kf(lt, [[0, [LX + 2.5, 2.8, 8.4]], [4.8, [LX + 0.6, 2.2, 6.6]], [8, [LX + 0.2, 1.7, 4.4]]]), kf(lt, [[0, [LX + 0.2, 1.9, -1]], [8, [LX, 1.5, 0]]]), 36);
    grade.uniforms.uFlash.value = meowFlash(t) * 0.8;
  },
  silence(t, lt) {
    base(t); setSky('#79a8ff', '#ffd6e6'); setSun([CX, 0, 0], [-30, 50, 35], 45, '#fff0dc', 2.2);
    scene.fog = new THREE.Fog('#f2dcea', 60, 160);
    cat.root.visible = false;
    // 秒针走向 12, 然后一切静止
    const sec = Math.min(60, 56 + lt * 2);
    towerClock.set(12, 59 + sec / 60, sec);
    const freeze = smooth((lt - 2.0) / 0.4);
    const tf = Math.min(t, 46 + 2.0);
    cars.forEach(c => { const u = c.userData; let x = ((u.off + tf * u.speed * u.dir) % 120 + 120) % 120 - 60; c.position.set(x, 0, u.lane); c.rotation.y = u.dir > 0 ? 0 : Math.PI; });
    birds.forEach((b, i) => { const r = rng(i + 3); const ph = r() * 10; b.visible = true; b.position.set((r() - 0.5) * 16, 11 + r() * 6, (r() - 0.5) * 10); b.children.forEach(w => w.rotation.z = w.userData.s * Math.sin(tf * 14 + ph) * 0.7); });
    // 镜头: 慢慢推向钟面, 静止后极慢
    setCam(kf(lt, [[0, [CX + 4, 13, 30]], [2.0, [CX + 1.5, 15, 16]], [5.5, [CX + 0.6, 16, 11]]]), [CX, 16.2, 0], 32);
    grade.uniforms.uSat.value = lerp(1.05, 0.15, freeze); grade.uniforms.uVig.value = lerp(0.3, 0.75, freeze);
  },
  sleep(t, lt) {
    base(t); homeSetup(t);
    cat.root.position.set(1.55, TABLE_Y, -1.15); cat.root.scale.setScalar(0.62); cat.root.rotation.y = -0.4;
    const wake = smooth((lt - 2.6) / 0.5);
    // 睡姿: 趴下
    cat.bodyPivot.scale.set(1.05, lerp(0.62, 1, wake), 1.05);
    cat.headPivot.position.y = lerp(0.62, 0.9, wake); cat.headPivot.rotation.x = lerp(0.18, 0, wake); cat.headPivot.rotation.z = lerp(-0.25, 0, wake);
    cat.arms.forEach(a => a.visible = false);
    cat.state.open = 0; cat.state.happy = 0;
    // 打哈欠
    const yawn = win(lt, 2.7, 3.4, 0.2);
    cat.state.mouth = Math.max(cat.state.mouth, yawn * 1.2);
    if (lt > 2.7 && lt < 3.5) { cat.headPivot.rotation.x -= 0.3 * yawn; }
    const dt = t - 55.0;
    if (dt >= 0) { cat.state.mouth = Math.max(cat.state.mouth, dt < 0.6 ? Math.sin(clamp(dt / 0.6) * Math.PI) : 0); cat.state.happy = 1; catMeowPose(dt); }
    const hp = cat.root.position;
    showBubble([hp.x + 0.2, hp.y + 1.5, hp.z + 0.3], dt, 0.7, '喵～', 1.0);
    // zzz
    zs.forEach((z, i) => { const k = ((lt * 0.6 + i / 3) % 1); z.visible = lt < 2.7; z.position.set(hp.x + 0.25 + k * 0.4, hp.y + 0.9 + k * 0.9, hp.z + 0.2); z.scale.setScalar(0.15 + k * 0.25); z.material.opacity = Math.sin(k * Math.PI); });
    const mins = 100 * 1440 + 59; homeClock.set(12, 0, Math.min(59.9, 0 + lt * 0)); homeClock.set(12, 0.0, 0.5);
    setCam(kf(lt, [[0, [3.4, 2.3, 3.8]], [4.5, [3.0, 2.1, 3.0]]]), [1.45, 1.2, -1.2], 34);
    grade.uniforms.uWarm.value = 0.3;
    cat.arms.forEach(a => a.visible = true);
    cat.arms.forEach(a => a.visible = lt > 3.4);
  },
  finale(t, lt) {
    base(t); setSky('#2b2f6e', '#ff9ec2'); setSun([CX, 0, 0], [-30, 50, 35], 45, '#ffd2b0', 1.2);
    hemi.intensity = 0.9; hemi.color.set('#c7c2ff');
    scene.fog = new THREE.Fog('#7d6aa8', 70, 170);
    cat.root.visible = false;
    cityLights(1.3);
    towerClock.set(12, 1 + lt / 60, 1 + lt * 2);
    cars.forEach(c => { const u = c.userData; let x = ((u.off + (48 + lt) * u.speed * u.dir) % 120 + 120) % 120 - 60; c.position.set(x, 0, u.lane); c.rotation.y = u.dir > 0 ? 0 : Math.PI; });
    birds.forEach(b => b.visible = false);
    FW.forEach((f, k) => { const st = 0.1 + k * 0.5; const kk = (lt - st) / 1.8; f.visible = kk > 0 && kk < 1; f.material.uniforms.uK.value = clamp(kk); const r = rng(600 + k); f.position.set((r() - 0.5) * 34, 22 + r() * 10, -6 - r() * 10); f.material.uniforms.uR.value = 5 + r() * 3; });
    const tp = [CX, 16.2, 2.6];
    showRing(tp, lt, 30, true, 1.6);
    setCam(kf(lt, [[0, [CX + 8, 10, 40]], [4, [CX + 2, 13, 48]]]), kf(lt, [[0, [CX, 16, 0]], [4, [CX, 19, 0]]]), 40);
    bloom.strength = 0.6; bloom.threshold = 0.8; grade.uniforms.uVig.value = 0.45;
    grade.uniforms.uFade.value = smooth((lt - 3.5) / 0.5) * 0.0;
  },
};

// ------------------------------------------------------------------ overlay: captions + danmaku
function strokeText(text, x, y, size, fill, stroke = '#2a1a22', lw = 10, align = 'center') {
  ctx.font = `bold ${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function drawCaptions(t) {
  for (const c of TL.captions) {
    if (t < c.t0 || t > c.t1) continue;
    const a = smooth((t - c.t0) / 0.25) * (1 - smooth((t - c.t1 + 0.25) / 0.25));
    const pop = easeOutBack((t - c.t0) / 0.35, 2.2);
    ctx.save(); ctx.globalAlpha = a;
    let y = c.y || (c.big ? 1380 : 1500);
    if (c.tag) {
      ctx.font = `bold 46px ${FONT}`; const tw = ctx.measureText(c.tag).width + 60;
      ctx.save(); ctx.translate(W / 2, y - 92); ctx.scale(pop, pop);
      ctx.fillStyle = '#ff5d8f'; ctx.strokeStyle = '#2a1a22'; ctx.lineWidth = 6; ctx.beginPath(); ctx.roundRect(-tw / 2, -36, tw, 72, 36); ctx.fill(); ctx.stroke();
      strokeText(c.tag, 0, 2, 46, '#ffffff', '#2a1a22', 0.01); ctx.restore();
    }
    const lines = c.text.split('\n'); const size = c.big ? 76 : 60;
    lines.forEach((ln, i) => {
      ctx.save(); ctx.translate(W / 2, y + i * size * 1.3); ctx.scale(pop, pop);
      if (ln.includes('「喵」')) {
        const [pre] = ln.split('「喵」'); ctx.font = `bold ${size}px ${FONT}`;
        const wPre = ctx.measureText(pre).width, wM = ctx.measureText('「喵」').width, x0 = -(wPre + wM) / 2;
        strokeText(pre, x0, 0, size, '#ffffff', '#2a1a22', 12, 'left'); strokeText('「喵」', x0 + wPre, 0, size, '#ffd23f', '#2a1a22', 12, 'left');
      } else strokeText(ln, 0, 0, size, c.red ? '#ff6b8a' : '#ffffff', '#2a1a22', 12);
      ctx.restore();
    });
    ctx.restore();
  }
}
// 弹幕: 预先分配轨道
const DM_COL = { pink: '#ff9cc2', yellow: '#ffe066', cyan: '#8ff0ff', red: '#ff5f6d' };
const DM_SIZE = 44, DM_SPEED = 260, LANES = 9, LANE_Y0 = 150, LANE_H = 66;
ctx.font = `bold ${DM_SIZE}px ${FONT}`;
const DM = [];
{ const laneFree = new Array(LANES).fill(-99); let rot = 0;
  for (const [t0, text, col] of TL.danmaku) {
    const w = ctx.measureText(text).width;
    // 车道空出: 前一条尾部离开右边界 + 间距
    let lane = -1;
    for (let k = 0; k < LANES; k++) { const l = (rot + k) % LANES; if (laneFree[l] <= t0) { lane = l; break; } }
    if (lane < 0) lane = laneFree.indexOf(Math.min(...laneFree));
    rot = (lane + 3) % LANES;
    const speed = DM_SPEED * (1 + (w / 900));
    laneFree[lane] = Math.max(t0, laneFree[lane]) + (w + 60) / speed;
    DM.push({ t0: Math.max(t0, 0), text, col: DM_COL[col] || '#ffffff', w, lane, speed });
  }
  // 结尾: 哈哈哈 刷屏
  const r = rng(99);
  for (let i = 0; i < 26; i++) { const t0 = 55.4 + r() * 4.2; const text = '哈'.repeat(3 + Math.floor(r() * 8)); const w = ctx.measureText(text).width; DM.push({ t0, text, col: r() > 0.7 ? '#ffe066' : '#ffffff', w, lane: Math.floor(r() * (LANES + 6)), speed: DM_SPEED * (1.1 + r() * 0.5) }); }
  for (let i = 0; i < 12; i++) { const t0 = 48.0 + r() * 3.2; const text = '？'.repeat(1 + Math.floor(r() * 6)); const w = ctx.measureText(text).width; DM.push({ t0, text, col: '#ffffff', w, lane: Math.floor(r() * (LANES + 4)), speed: DM_SPEED * (0.9 + r() * 0.4) }); }
}
function drawDanmaku(t) {
  ctx.save(); ctx.font = `bold ${DM_SIZE}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  // 静止的一刻: 弹幕也慢下来
  for (const d of DM) {
    const x = W - (t - d.t0) * d.speed;
    if (t < d.t0 || x < -d.w - 20) continue;
    const y = LANE_Y0 + d.lane * LANE_H;
    ctx.globalAlpha = 0.93;
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.strokeText(d.text, x, y);
    ctx.fillStyle = d.col; ctx.fillText(d.text, x, y);
  }
  ctx.restore();
}
function drawHUD(t) { // 左上角: 弹幕开关 + 时钟 "第 N 喵"
  ctx.save(); ctx.globalAlpha = 0.9;
  ctx.fillStyle = 'rgba(20,16,30,0.45)'; ctx.beginPath(); ctx.roundRect(28, 56, 230, 62, 31); ctx.fill();
  const n = meowIndex(t);
  strokeText(`喵 × ${n}`, 143, 88, 38, '#ffffff', 'rgba(0,0,0,0)', 0.01);
  ctx.restore();
}

// ------------------------------------------------------------------ main
function sceneAt(t) { const out = []; for (const [n, a, b] of TL.scenes) if (t >= a - 1e-6 && t < b + TL.xfade) out.push([n, a, b]); return out; }
function renderScene(name, t, lt) { SCENES[name](t, lt); cat.face(); grade.uniforms.uTime.value = t; composer.render(); }
window.renderAt = function (t, q = 0.93) {
  const list = sceneAt(t); const cur = list[list.length - 1]; const prev = list.length > 1 ? list[list.length - 2] : null;
  const hardCut = cur && ['sleep', 'finale', 'silence'].includes(cur[0]);
  if (prev && !hardCut && t < cur[1] + TL.xfade) {
    renderScene(prev[0], t, t - prev[1]); ctx.globalAlpha = 1; ctx.drawImage(renderer.domElement, 0, 0);
    renderScene(cur[0], t, t - cur[1]); ctx.globalAlpha = smooth((t - cur[1]) / TL.xfade); ctx.drawImage(renderer.domElement, 0, 0); ctx.globalAlpha = 1;
  } else { renderScene(cur[0], t, t - cur[1]); ctx.globalAlpha = 1; ctx.drawImage(renderer.domElement, 0, 0); }
  drawDanmaku(t); drawCaptions(t); drawHUD(t);
  return q ? out.toDataURL('image/jpeg', q) : null;
};
window.READY = true;
