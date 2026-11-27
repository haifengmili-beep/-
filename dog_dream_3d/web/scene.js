// 《假如你家狗每分钟做一个梦》 3D 版 — three.js 场景 + 梦境滤镜 + 2D 字幕层. window.renderAt(t) 决定性渲染一帧.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { clamp, smooth, lerp, back, bounce, rng, canvasTex, std, rbox, mesh, box, heartTex, makeSparkles,
         makeCat, makePerson, makeDog, makeBone, makeBubble } from './lib.js';

const W = 1080, H = 1920;
const FONT = '"WenQuanYi Zen Hei", sans-serif';
await document.fonts.load(`80px ${FONT}`, '狗');

// ------------------------------------------------------------------ 时间线
// [时长, 名字, 梦境数起, 梦境数止, 字幕, 英文, 第几分钟, 梦到, 现实中, 标签]
const SCENES = [
  [3.0, 'title', 0, 0, '', '', '', '', '', ''],
  [3.4, 'bone', 0, 1, '第1分钟：梦见啃大骨头\n现实里：嘴巴在空嚼', 'Minute 1: Dreaming of a giant bone. In real life: chewing on nothing.', '第1分钟', '大骨头', '空嚼 + 流口水', '+1 个梦'],
  [3.4, 'ball', 1, 2, '第2分钟：梦见追球\n睡着了，四条腿却在“跑步”', 'Minute 2: Chasing a ball. Fast asleep, but all four legs are running.', '第2分钟', '小球', '睡着蹬腿', '+1 个梦'],
  [3.6, 'field', 2, 3, '第3分钟：直接冲进梦里\n草地、彩虹、飞盘！', 'Minute 3: Straight into the dream. Grass, rainbows, frisbees!', '第3分钟', '飞盘', '尾巴拍床', '+1 个梦'],
  [3.4, 'cat', 3, 5, '第5分钟：梦见追猫\n现实里：小声“呜呜”叫', 'Minute 5: Chasing the cat. In real life: soft little whimpers.', '第5分钟', '邻居家的猫', '呜呜哼唧', '+2 个梦'],
  [3.4, 'rain', 5, 10, '第10分钟：天上下骨头雨\n这就是狗狗的天堂', "Minute 10: It's raining bones. Doggy heaven.", '第10分钟', '骨头雨', '口水流成河', '+5 个梦'],
  [3.8, 'stack', 10, 60, '第60分钟：60个梦连轴转\n睡一觉比醒着还累', 'Minute 60: Sixty dreams back to back. Sleeping is harder work than being awake.', '第60分钟', '全都要', '小床被蹬跑了', '+50 个梦'],
  [4.8, 'why', 0, 0, '狗真的会做梦：它们也有快速眼动睡眠\n睡着时蹬腿、哼唧，很可能就在做梦', 'Dogs really do dream: they have REM sleep too. Twitching paws and whimpers often mean a dream.', '', '', '', ''],
  [4.8, 'back', 60, 60, '它梦得最多的，可能就是白天和你玩的事\n醒来第一件事：来找你', 'What it dreams about most may be its day with you. First thing after waking: find you.', '醒了', '你', '摇着尾巴找你', '梦见你'],
  [3.6, 'end', 0, 0, '', '', '', '', '', ''],
];
const STARTS = []; { let a = 0; for (const s of SCENES) { STARTS.push(a); a += s[0]; } }
const IDX = Object.fromEntries(SCENES.map((s, i) => [s[1], i]));
const DREAM = new Set(['field', 'cat', 'rain']);
const DANMAKU = ['我家狗睡觉也蹬腿', '原来是在做梦！', '梦里追猫哈哈哈', '骨头雨我也想要', '睡得比我还累', '呜呜叫好可爱',
  'awsl', '狗：别吵，在追球', '+1', '哈哈哈哈哈', '太真实了', '床都蹬跑了', '做梦也在摇尾巴', '梦里有我吗'];
const INK = '#42263f', PINK = '#e8588a', MINT = '#2ea47c', SKY = '#468cd6', LAV = '#8464c4';

// ------------------------------------------------------------------ renderer + 梦境滤镜
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 900);
const scene = new THREE.Scene();
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.18, 0.5, 1.0); composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDream: { value: 0 }, uWob: { value: 0 }, uVig: { value: 0.25 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uDream, uWob, uVig; varying vec2 vUv;
    void main(){
      vec2 uv = vUv + vec2(sin(vUv.y*16.0 + uTime*3.0), cos(vUv.x*12.0 + uTime*2.4))*0.006*uWob;
      vec3 c = texture2D(tDiffuse, uv).rgb;
      float l = dot(c, vec3(0.299,0.587,0.114)); c = mix(vec3(l), c, 1.0 + 0.18*uDream);
      float e = smoothstep(0.36, 0.78, length((vUv-0.5)*vec2(1.0,1.15)));
      vec3 haze = mix(vec3(1.0,0.86,0.95), vec3(0.85,0.8,1.0), 0.5+0.5*sin(uTime*1.3 + vUv.y*6.0));
      c = mix(c, haze, e*0.6*uDream);
      c *= mix(1.0, smoothstep(0.95,0.3,length((vUv-0.5)*vec2(1.0,1.3))), uVig*(1.0-uDream));
      gl_FragColor = vec4(c,1.0); }`,
});
composer.addPass(grade);
const G = grade.uniforms;
const out = document.getElementById('out'); const ctx = out.getContext('2d');

const hemi = new THREE.HemisphereLight('#fff2f6', '#c99bb8', 1.5); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0e0', 2.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 5; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
{ const c = sun.shadow.camera; c.left = -7; c.right = 7; c.top = 7; c.bottom = -7; c.near = 0.5; c.far = 40; }
const setSun = (x, z) => { sun.target.position.set(x, 0, z); sun.position.set(x + 4, 9, z + 6); };
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { top: { value: new THREE.Color('#79b6f0') }, bot: { value: new THREE.Color('#cfe6fb') } },
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top, bot; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.1, 0.45, vP.y)), 1.0); }`,
}));
scene.add(skyDome);
const setSky = (a, b) => { skyDome.material.uniforms.top.value.set(a); skyDome.material.uniforms.bot.value.set(b); };

// ------------------------------------------------------------------ 卧室 + 狗窝
const room = new THREE.Group(); scene.add(room);
const curtains = [];
const bed = new THREE.Group(); room.add(bed);
{
  const plank = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#c47a45'; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let y = 0; y < h; y += 64) { g.fillStyle = `rgba(150,90,60,${0.15 + r() * 0.15})`; g.fillRect(0, y, w, 4); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(255,230,200,0.12)'; g.fillRect(r() * w, y + 10 + r() * 40, 80 + r() * 120, 3); } }
  });
  plank.wrapS = plank.wrapT = THREE.RepeatWrapping; plank.repeat.set(3, 3);
  const floor = mesh(new THREE.PlaneGeometry(16, 16), std('#ffffff', { map: plank }), false, true); floor.rotation.x = -Math.PI / 2; room.add(floor);
  const backW = mesh(new THREE.PlaneGeometry(16, 9), std('#e2648f'), false, true); backW.position.set(0, 4.5, -3.4); room.add(backW);
  const leftW = mesh(new THREE.PlaneGeometry(10, 9), std('#8a62d6'), false, true); leftW.rotation.y = Math.PI / 2; leftW.position.set(-3.6, 4.5, 1.6); room.add(leftW);
  const rightW = mesh(new THREE.PlaneGeometry(10, 9), std('#8a62d6'), false, true); rightW.rotation.y = -Math.PI / 2; rightW.position.set(3.8, 4.5, 1.6); room.add(rightW);
  // 窗外: 黄昏的马卡龙小城 + 月亮
  const skyline = canvasTex(512, 384, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9b8cf0'); gr.addColorStop(0.6, '#f5a8c8'); gr.addColorStop(1, '#ffd9b0'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6d8'; g.beginPath(); g.arc(400, 80, 38, 0, 7); g.fill();
    g.fillStyle = '#b9a5f2'; g.beginPath(); g.arc(386, 70, 32, 0, 7); g.fill();
    const r = rng(9), cols = ['#f39cb4', '#9cbcf0', '#f6cf78', '#89cfa6', '#bba3ea'];
    for (let i = 0; i < 18; i++) { g.fillStyle = '#fffbe8'; g.fillRect(r() * w, r() * 150, 4, 4); }
    for (let x = 0; x < w; x += 46) { const bh = 90 + r() * 170; g.fillStyle = cols[(x / 46) % 5 | 0]; g.fillRect(x, h - bh, 42, bh);
      g.fillStyle = 'rgba(255,240,170,0.95)'; for (let wy = h - bh + 14; wy < h - 10; wy += 26) for (let wx = x + 6; wx < x + 36; wx += 14) if (r() < 0.7) g.fillRect(wx, wy, 7, 12); }
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), new THREE.MeshBasicMaterial({ map: skyline })); glass.position.set(1.4, 3.2, -3.38); room.add(glass);
  for (const [w, h, x, y] of [[2.9, 0.16, 1.4, 4.2], [2.9, 0.16, 1.4, 2.2], [0.16, 2.1, 0.0, 3.2], [0.16, 2.1, 2.8, 3.2], [0.1, 1.9, 1.4, 3.2]]) {
    const f = box(w, h, 0.14, '#ffffff', 0.03); f.position.set(x, y, -3.33); room.add(f);
  }
  for (const x of [-0.25, 3.05]) {   // 窗帘 (会飘)
    const piv = new THREE.Group(); piv.position.set(x, 4.35, -3.2); room.add(piv);
    const c = box(0.55, 2.5, 0.08, '#ffb21f', 0.04); c.position.y = -1.25; piv.add(c);
    curtains.push(piv);
  }
  const sofaM = std('#2fa8a0');
  const sb = box(3.0, 0.7, 1.2, sofaM, 0.12); sb.position.set(-1.7, 0.45, -2.6); room.add(sb);
  const sr = box(3.0, 1.0, 0.4, sofaM, 0.12); sr.position.set(-1.7, 1.2, -3.1); room.add(sr);
  for (const x of [-3.25, -0.15]) { const a = box(0.4, 1.1, 1.2, sofaM, 0.12); a.position.set(x, 0.55, -2.6); room.add(a); }
  for (const x of [-2.4, -1.0]) { const c = box(1.2, 0.25, 1.0, '#ffd23f', 0.1); c.position.set(x, 0.92, -2.5); room.add(c); }
  const pot = box(0.5, 0.5, 0.5, '#ec8a74', 0.06); pot.position.set(3.1, 0.25, -2.5); room.add(pot);
  for (let i = 0; i < 6; i++) { const l = box(0.13, 0.8, 0.13, '#5aae73', 0.04); l.position.set(2.98 + i * 0.05, 0.85, -2.5); l.rotation.z = -0.6 + i * 0.24; room.add(l); }
  const rug = mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.03, 48), std('#ff6f9e'), false, true); rug.position.set(0.1, 0.015, 0.4); room.add(rug);
  // 狗窝: 紫色底座 + 奶白坐垫 + 圆环边
  const base = mesh(new THREE.CylinderGeometry(1.55, 1.6, 0.22, 40), std('#6a48d0')); base.position.y = 0.11; bed.add(base);
  const cush = mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.1, 40), std('#ffd84a')); cush.position.y = 0.25; bed.add(cush);
  const rim = mesh(new THREE.TorusGeometry(1.4, 0.24, 16, 48), std('#8a66f0')); rim.rotation.x = Math.PI / 2; rim.position.y = 0.32; bed.add(rim);
  // 食盆 + 玩具球
  const bowl = mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.2, 32), std('#7fb6ec')); bowl.position.set(2.3, 0.1, 1.6); room.add(bowl);
  const toy = mesh(new THREE.SphereGeometry(0.22, 24, 16), std('#ffd34d', { roughness: 0.5 })); toy.position.set(-1.9, 0.22, 1.5); room.add(toy);
}

// ------------------------------------------------------------------ 梦境: 草地 + 小路 + 棒棒糖树 + 云 + 彩虹
const dream = new THREE.Group(); scene.add(dream);
const clouds = [], farGroup = new THREE.Group(); dream.add(farGroup);
{
  const grass = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5cc24e'; g.fillRect(0, 0, w, h); const r = rng(21);
    for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? 'rgba(60,160,60,0.6)' : 'rgba(160,230,120,0.6)'; g.fillRect(r() * w, r() * h, 3, 9); }
  });
  grass.wrapS = grass.wrapT = THREE.RepeatWrapping; grass.repeat.set(60, 60);
  const ground = mesh(new THREE.PlaneGeometry(300, 300), std('#ffffff', { map: grass }), false, true); ground.rotation.x = -Math.PI / 2; ground.position.x = 50; dream.add(ground);
  const path = mesh(new THREE.PlaneGeometry(300, 2.4), std('#f5b95a'), false, true); path.rotation.x = -Math.PI / 2; path.position.set(50, 0.01, 0); dream.add(path);
  const r = rng(33), cc = ['#ff4f8f', '#2fa8f0', '#ffcc1f', '#8f5cf0', '#ff7a3d', '#22c49a'];
  for (let x = -20; x < 120; x += 2.6 + r() * 2) {      // 棒棒糖树
    const z = -4.5 - r() * 9, hgt = 1.4 + r() * 1.4;
    const tr = box(0.22, hgt, 0.22, '#c48a5c', 0.05); tr.position.set(x, hgt / 2, z); dream.add(tr);
    const cp = mesh(new THREE.SphereGeometry(0.8 + r() * 0.5, 20, 14), std(cc[Math.floor(r() * cc.length)])); cp.position.set(x, hgt + 0.6, z); dream.add(cp);
  }
  const fl = new THREE.InstancedMesh(rbox(0.2, 0.08, 0.2, 0.03), std('#ffffff'), 500), m4 = new THREE.Matrix4(), col = new THREE.Color();
  for (let i = 0; i < 500; i++) {
    let z = -13 + r() * 19; if (Math.abs(z) < 1.4) z += 2.8;
    m4.makeRotationY(r() * 3); m4.setPosition(-20 + r() * 140, 0.04, z); fl.setMatrixAt(i, m4); fl.setColorAt(i, col.set(cc[i % cc.length]));
  }
  fl.receiveShadow = true; dream.add(fl);
  for (let i = 0; i < 12; i++) {                         // 云
    const c = new THREE.Group(); c.position.set(-20 + i * 12 + r() * 4, 7 + r() * 4, -22 - r() * 10); dream.add(c);
    for (let k = 0; k < 4; k++) { const b = box(1.6 + r() * 1.4, 0.9 + r() * 0.5, 1.2, '#ffffff', 0.4); b.position.set(k * 1.1 - 1.6, r() * 0.5, r() * 0.4); c.add(b); }
    clouds.push(c);
  }
  // 远景: 小山 + 彩虹 (跟着镜头, 形成视差)
  for (const [x, s, c] of [[-30, 18, '#3fae5a'], [0, 24, '#6cc95a'], [32, 20, '#4fbb63'], [60, 22, '#7fd36a']]) {
    const h = mesh(new THREE.SphereGeometry(1, 32, 16), std(c), false, true); h.scale.set(s, s * 0.32, s * 0.6); h.position.set(x, -1, -60); farGroup.add(h);
  }
  ['#ff4f6f', '#ff9a2e', '#ffd92e', '#4fd06a', '#3a9cf0', '#8a5cf0'].forEach((c, i) => {
    const t = new THREE.Mesh(new THREE.TorusGeometry(26 - i * 1.1, 0.55, 8, 64, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 }));
    t.position.set(6, -2, -80); farGroup.add(t);
  });
}

// ------------------------------------------------------------------ 角色 + 道具
const dog = makeDog(); scene.add(dog.root);
const cat = makeCat(); scene.add(cat.root);
const person = makePerson(); scene.add(person.root);
const personMini = makePerson();
const bubbles = [makeBubble(0.85), ...Array.from({ length: 5 }, () => makeBubble(0.62))];
bubbles.forEach(b => scene.add(b.root));
const trail = [0.07, 0.11, 0.16].map(r => { const b = makeBubble(r); scene.add(b.root); return b; });
const mk = (fn) => { const g = new THREE.Group(); fn(g); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); return g; };
const makeFrisbee = () => mk(g => {
  const d = mesh(new THREE.CylinderGeometry(0.36, 0.33, 0.06, 32), std('#ff3d7f')); g.add(d);
  const r = mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 32), std('#ffd34d')); r.rotation.x = Math.PI / 2; g.add(r);
});
const makeBall = () => mk(g => { g.add(mesh(new THREE.SphereGeometry(0.3, 28, 18), std('#ffd34d', { roughness: 0.45 })));
  const s = mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 32), std('#ffffff')); s.rotation.y = Math.PI / 2; g.add(s); });
const makeSlipper = () => mk(g => { const s = box(0.3, 0.08, 0.72, '#2f8ff0', 0.04); g.add(s); const st = box(0.34, 0.16, 0.22, '#ffffff', 0.06); st.position.set(0, 0.08, 0.15); g.add(st); });
const makeSausage = () => mk(g => { const s = mesh(new THREE.CapsuleGeometry(0.13, 0.5, 6, 16), std('#e5735f', { roughness: 0.5 })); s.rotation.z = Math.PI / 2; g.add(s);
  for (const sx of [-1, 1]) { const k = box(0.05, 0.05, 0.05, '#fff1d6', 0.01); k.position.x = sx * 0.4; g.add(k); } });
// 主泡泡里的东西
const bigBone = makeBone(0.9); bubbles[0].inner.add(bigBone);
const dreamBall = makeBall(); bubbles[0].inner.add(dreamBall);
personMini.root.scale.setScalar(0.3); bubbles[0].inner.add(personMini.root);
// 60 个梦: 其他泡泡
[makeBall(), makeFrisbee(), makeSlipper(), makeSausage()].forEach((p, i) => bubbles[i + 1].inner.add(p));
const frisbee = makeFrisbee(); scene.add(frisbee);
const rainBones = Array.from({ length: 44 }, () => { const b = makeBone(0.7); scene.add(b); return b; });
const drool = mesh(new THREE.SphereGeometry(0.06, 12, 8), std('#bfe6ff', { roughness: 0.1, transparent: true, opacity: 0.85 }), false, false); scene.add(drool);
const stage = mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.4, 48), std('#ffffff'), false, true); stage.position.y = -0.2; scene.add(stage);
const hearts = []; for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false })); scene.add(s); hearts.push(s); }
const sparkle = makeSparkles(110, [16, 9, 12], '#fff4fa', 0.9, 7, 0.12); scene.add(sparkle);
const petals = makeSparkles(55, [16, 10, 12], '#ff9fc2', 1.1, 11, -0.35); scene.add(petals);

// ------------------------------------------------------------------ 2D 叠加层
function txt(s, x, y, size, fill, stroke = null, sw = 0, align = 'center') {
  ctx.font = `${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.strokeText(s, x, y); }
  ctx.fillStyle = fill; ctx.fillText(s, x, y);
}
function pill(s, x, y, size, bg, fg = '#fff', age = 1) {
  if (age < 0) return;
  size = Math.max(4, size * back(age / 0.35)); y += 6 * Math.sin(age * 3);
  ctx.font = `${size}px ${FONT}`; const w = ctx.measureText(s).width + size * 1.1;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x - w / 2, y - size * 0.78, w, size * 1.56, size * 0.78); ctx.fill();
  txt(s, x, y + 2, size, fg);
}
function pop(s, x, y, size, col, age) { if (age < 0) return; txt(s, x, y + 6 * Math.sin(age * 3), Math.max(4, size * back(age / 0.3)), col, '#ffffff', 10); }
const v3 = new THREE.Vector3();
function proj(obj, off = [0, 0, 0]) { v3.set(...off); obj.localToWorld(v3); v3.project(camera); return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H]; }
function zzz(gt, x, y) {   // 从头顶飘起的 Z
  for (let k = 0; k < 3; k++) {
    const u = (gt * 0.55 + k / 3) % 1;
    ctx.globalAlpha = Math.sin(Math.PI * u);
    txt('Z', x + 40 * u + 18 * Math.sin(u * 7 + k), y - 150 * u, 40 + 34 * u, '#ffffff', LAV, 8);
  }
  ctx.globalAlpha = 1;
}
function drawHUD(sc, lt, dur) {
  const [, name, s0, s1, , , minute, what, real, tag] = sc;
  if (!minute) return;
  const v = Math.round(lerp(s0, s1, smooth(clamp(lt / (dur * 0.7)))));
  const x = 34, y = 520;
  txt('梦境计数', x, y, 46, '#fff', INK, 8, 'left');
  txt('D R E A M S', x, y + 36, 20, '#fff', INK, 4, 'left');
  const ns = 110 * (0.7 + 0.3 * back(lt / 0.4));
  txt(String(v), x, y + 112, ns, '#fff', INK, 10, 'left');
  ctx.font = `${ns}px ${FONT}`; const w = ctx.measureText(String(v)).width;
  txt('个', x + w + 10, y + 132, 44, '#fff', INK, 8, 'left');
  [`时间: ${minute}`, `梦到: ${what}`, `现实中: ${real}`].forEach((l, i) => txt(l, x, y + 196 + i * 42, 32, '#fff', INK, 7, 'left'));
  const isBack = name === 'back';
  ctx.font = `30px ${FONT}`; const tw = Math.max(200, ctx.measureText(tag).width + 50);
  ctx.fillStyle = isBack ? MINT : '#e8587e'; ctx.beginPath(); ctx.roundRect(x, y + 320, tw, 48, 24); ctx.fill();
  txt(tag, x + tw / 2, y + 345, 30, '#fff');
}
function drawCaption(sc, lt) {
  const [, , , , cap, en] = sc; if (!cap) return;
  const lines = cap.split('\n');
  const y0 = 1560 - (lines.length - 1) * 40;
  let fs = 66; ctx.font = `${fs}px ${FONT}`;
  while (fs > 40 && Math.max(...lines.map(l => ctx.measureText(l).width)) > 1000) { fs -= 2; ctx.font = `${fs}px ${FONT}`; }
  lines.forEach((l, i) => { const u = lt - i * 0.12; if (u > 0) txt(l, 540, y0 + i * 84, Math.max(8, fs * back(u / 0.35)), '#ffe14a', '#6e3a3c', 14); });
  let ew = 28; ctx.font = `${ew}px ${FONT}`; while (ew > 18 && ctx.measureText(en).width > 1020) { ew--; ctx.font = `${ew}px ${FONT}`; }
  if (lt > 0.2) txt(en, 540, y0 + lines.length * 84 - 22, ew, '#fff', INK, 6);
}
function drawDanmaku(gt) {
  const start = STARTS[IDX.stack], end = STARTS[IDX.why] + 0.8;
  if (gt < start || gt > end) return;
  const dens = clamp((gt - start) / 1.6), r = rng(2027);
  const cols = ['#ffffff', '#ffe98f', '#a9e4ff', '#ffb3cf', '#bdf7c6'];
  for (let i = 0; i < 70; i++) {
    const t0 = start + (r() * (end - start + 2) - 2), sp = 300 + r() * 160, y = 130 + Math.floor(r() * 8) * 50;
    const col = cols[Math.floor(r() * 5)], s = DANMAKU[Math.floor(r() * DANMAKU.length)], keep = r() <= dens;
    const x = W - (gt - t0) * sp;
    if (x < -500 || x > W || !keep) continue;
    txt(s, x, y, 38, col, INK, 6, 'left');
  }
}

// ------------------------------------------------------------------ 每段场景
let labels = [];
const L = fn => labels.push(fn);
const drop = lt => (1 - bounce(lt / 0.7)) * 5;
const DOG_BED = { x: -0.2, z: 0.3, ry: 0.55 };
const headTop = new THREE.Vector3(), tmp = new THREE.Vector3();

function sleepDog(gt, o = {}) {   // 狗趴在窝里睡觉
  dog.root.position.set(DOG_BED.x + (o.dx || 0), 0.22, DOG_BED.z); dog.root.rotation.y = DOG_BED.ry + (o.dr || 0);
  dog.update(gt, { lie: 1, eyes: 'sleep', rem: true, wag: 0.15, ...o });
}
function showBubble(b, x, y, z, age, gt, withTrail = false) {
  if (age < 0) return;
  b.root.visible = true;
  const s = back(age / 0.45) * (1 + 0.03 * Math.sin(gt * 3.1));
  b.root.position.set(x, y + 0.08 * Math.sin(gt * 1.7), z); b.root.scale.setScalar(Math.max(0.001, s));
  b.mat.uniforms.uTime.value = gt;
  b.inner.rotation.y = 0.35 * Math.sin(gt * 1.2);
  if (withTrail) {
    dog.root.updateMatrixWorld(true);
    dog.headPivot.localToWorld(headTop.set(0, 1.0, 0.1));
    trail.forEach((tb, k) => {
      const u = (k + 1) / 4, a = age - k * 0.08; if (a < 0) return;
      tb.root.visible = true; tmp.copy(headTop).lerp(b.root.position, u); tmp.y -= 0.25 * Math.sin(Math.PI * u) - 0.05 * Math.sin(gt * 2 + k);
      tb.root.position.copy(tmp); tb.root.scale.setScalar(back(a / 0.3)); tb.mat.uniforms.uTime.value = gt;
    });
  }
}
function snoutPos(target) { dog.root.updateMatrixWorld(true); return dog.headPivot.localToWorld(target.set(0, 0.0, 0.88)); }

function setup(name, lt, dur, gt) {
  room.visible = true; dream.visible = false; stage.visible = false;
  for (const o of [dog.root, cat.root, person.root, frisbee, drool]) o.visible = false;
  [...bubbles, ...trail].forEach(b => { b.root.visible = false; b.inner.children.forEach(c => c.visible = false); });
  personMini.root.visible = false; bigBone.visible = dreamBall.visible = false;
  rainBones.forEach(b => b.visible = false); hearts.forEach(h => h.visible = false);
  cat.root.position.set(0, 0, 0); cat.root.rotation.set(0, 0, 0); cat.root.scale.setScalar(1);
  dog.root.position.set(0, 0, 0); dog.root.rotation.set(0, 0, 0); dog.root.scale.setScalar(1);
  bed.position.set(DOG_BED.x, 0, DOG_BED.z); bed.rotation.set(0, 0, 0);
  G.uDream.value = 0; G.uWob.value = 0; G.uVig.value = 0.25; bloom.strength = 0.18;
  hemi.intensity = 1.5; hemi.color.set('#fff2f6'); sun.intensity = 2.3; setSun(0, 0);
  setSky('#79b6f0', '#cfe6fb');
  sparkle.position.set(0, 0, 0); petals.position.set(0, 0, 0);
  curtains.forEach((c, i) => { c.rotation.x = 0.08 + 0.06 * Math.sin(gt * 1.4 + i * 1.3); c.rotation.z = 0.04 * Math.sin(gt * 1.1 + i); });
  let camPos = [0, 2.4, 11.5], camTgt = [0, 1.3, 0];
  const BUB = [0.75, 3.0, 0.35];
  switch (name) {
    case 'title': {
      sleepDog(gt, { paddle: 0.15 });
      person.root.position.set(1.35, 0, -1.7); person.root.rotation.y = -0.35; person.update(lt, { wave: true });
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.0, 0]); zzz(gt, x + 30, y); });
      camPos = [0.0, 3.2, 17]; camTgt = [-0.1, 1.6, 0];
      break;
    }
    case 'bone': {     // 梦见啃大骨头 -> 现实里嘴巴空嚼, 流口水
      const ch = Math.abs(Math.sin(lt * 7));
      sleepDog(gt, { chomp: lt > 0.8 ? ch : 0, wag: 0.3 });
      showBubble(bubbles[0], ...BUB, lt - 0.35, gt, true);
      bigBone.visible = true; bigBone.rotation.set(0.3, 0, 0.4 * Math.sin(gt * 2)); bigBone.scale.setScalar(0.9 + 0.08 * ch);
      if (lt > 1.2) { drool.visible = true; snoutPos(tmp); const u = ((lt - 1.2) * 0.8) % 1;
        drool.position.set(tmp.x, tmp.y - 0.12 - 0.15 * u * u, tmp.z); drool.scale.set(1, 1 + 2.2 * u, 1); }
      L(() => { const [x, y] = proj(dog.headPivot, [0, 0.1, 1.0]); pop('吧唧吧唧', clamp(x - 40, 200, 880), y + 120, 58, '#ee7a3c', lt - 0.9); });
      L(() => { const [x, y] = proj(bubbles[0].root, [0, 1.0, 0]); pill('梦里', x, y - 10, 40, LAV, '#fff', lt - 0.6); });
      camPos = [0.3, 3.3, 14.5]; camTgt = [0.2, 1.75, 0];
      break;
    }
    case 'ball': {     // 梦见追球 -> 四条腿在空中蹬
      sleepDog(gt, { paddle: lt > 0.5 ? 1 : 0.2, wag: 0.5 });
      showBubble(bubbles[0], ...BUB, lt - 0.25, gt, true);
      dreamBall.visible = true; dreamBall.position.set(0.35 * Math.sin(lt * 2.6), -0.35 + 0.65 * Math.abs(Math.sin(lt * 5)), 0); dreamBall.rotation.z = -lt * 6;
      bed.position.x = DOG_BED.x + 0.015 * Math.sin(gt * 40);
      L(() => { const [x, y] = proj(dog.root, [0, 0.4, 1.2]); pop('蹬蹬蹬！', clamp(x, 220, 860), y + 90, 64, PINK, lt - 0.8); });
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.0, 0]); zzz(gt, x - 140, y + 20); });
      camPos = [2.2, 2.6, 13.5]; camTgt = [0.2, 1.6, 0];
      break;
    }
    case 'field': case 'cat': case 'rain': {
      room.visible = false; dream.visible = true;
      G.uDream.value = 1; G.uWob.value = 0.25 + 1.6 * (1 - smooth(lt / 0.9)); bloom.strength = 0.28;
      setSky('#6f52e0', '#ff8cc0'); hemi.color.set('#fff0fa'); hemi.intensity = 1.5;
      clouds.forEach((c, i) => { c.position.x = -20 + i * 12 + ((gt * 0.6) % 12); });
      let dx = 0, camX = 0;
      if (name === 'field') {
        dx = lt * 5; const jump = clamp((lt - 2.2) / 0.75);
        const jy = 1.3 * Math.sin(Math.PI * jump);
        dog.root.position.set(dx, 0, 0); dog.root.rotation.y = Math.PI / 2 - 0.25;
        dog.update(gt, { run: jump > 0 && jump < 1 ? 0.3 : 1, dropY: jy + drop(lt) * 0.5, eyes: 'normal', perk: 0.3, wag: 1,
          tongue: lt < 2.2, mouth: lt > 2.95 ? 'w' : (lt > 2.0 ? 'open' : undefined), pitch: jump > 0 && jump < 1 ? -0.4 : 0, look: 0.6 });
        frisbee.visible = true;
        if (lt < 2.85) { const fx = dx + 3.6 - 0.5 * lt, fy = 1.2 + 1.2 * Math.sin(lt * 1.3) + 0.15 * Math.sin(lt * 9); frisbee.position.set(fx, fy, 0.3); frisbee.rotation.set(0.25, gt * 14, 0.15); }
        else { snoutPos(tmp); frisbee.position.copy(tmp); frisbee.rotation.set(Math.PI / 2, 0, 0.3); }
        L(() => pop('飞盘！', 700, 560, 82, PINK, lt - 0.5));
        L(() => { if (lt > 2.9) { const [x, y] = proj(dog.headPivot, [0, 1.3, 0]); pop('接住了！', clamp(x, 220, 860), y - 30, 70, '#ee7a3c', lt - 2.9); } });
        camX = dx; camPos = [dx + 3.5, 2.3, 13.5]; camTgt = [dx + 1.3, 1.5, 0];
      } else if (name === 'cat') {
        dx = 40 + lt * 5.5;
        dog.root.position.set(dx, 0, 0); dog.root.rotation.y = Math.PI / 2 - 0.3;
        dog.update(gt, { run: 1, dropY: drop(lt) * 0.5, eyes: 'normal', perk: 0.4, wag: 1, mouth: 'open', brow: 1, look: 0.8 });
        const cx = dx + 2.7 + 0.25 * Math.sin(lt * 2);
        cat.root.position.set(cx, 0, 0.15); cat.root.rotation.y = Math.PI / 2 - 0.35; cat.root.scale.setScalar(0.85);
        cat.update(gt * 1.6, { walk: 1, hop: 1, ears: 1, yaw: -1.1, eyes: 'normal', look: -1, mouth: 'o', tails: { mode: 'single' } });
        L(() => { const [x, y] = proj(cat.headPivot, [0, 1.3, 0]); pop('喵？！', clamp(x, 200, 880), y - 20, 62, LAV, lt - 0.5); });
        L(() => { const [x, y] = proj(dog.headPivot, [0, 1.3, 0]); pop('汪汪！', clamp(x, 470, 880), y - 20, 66, '#ee7a3c', lt - 0.9); });
        L(() => pill('现实中：呜呜~ 呜呜~', 540, 1290, 40, 'rgba(66,38,63,0.8)', '#fff', lt - 1.6));
        camX = dx + 1.3; camPos = [dx + 4.0, 2.2, 14]; camTgt = [dx + 1.4, 1.4, 0];
      } else {
        dx = 80;
        dog.root.position.set(dx, 0, 0.3); dog.root.rotation.y = 0.35 * Math.sin(lt * 2.2);
        dog.update(gt, { hop: 1, dropY: drop(lt), eyes: lt > 1.6 ? 'happy' : 'wide', mouth: 'open', tongue: lt > 1.6, wag: 1, pitch: -0.35, perk: 0.5, look: 0, lookY: -1 });
        rainBones.forEach((b, i) => {
          const r = rng(7919 * (i + 3)); r(); r(); const bx = dx + (r() - 0.5) * 7, bz = -2 + r() * 4, t0 = r() * 2.6, sp = 1 + r();
          const u = lt - t0; if (u < -1.2) return;
          b.visible = true;
          const y = Math.max(0.12, 7.5 - 0.5 * 9.8 * Math.max(0, u + 1.2) ** 2 * 0.25);
          b.position.set(bx, y, bz);
          if (y > 0.12) b.rotation.set(gt * 3 * sp + i, gt * 2 + i, gt * 4 * sp); else b.rotation.set(Math.PI / 2, i, 0);
        });
        L(() => pop('骨头雨！', 540, 470, 100, '#ee7a3c', lt - 0.4));
        L(() => pill('全都是我的！', 760, 1290, 44, PINK, '#fff', lt - 1.8));
        camX = dx; camPos = [dx, 2.8, 14]; camTgt = [dx, 2.0, 0];
      }
      setSun(camX, 0);
      farGroup.position.x = camX * 0.85;
      sparkle.position.set(camX, 0, 0); petals.position.set(camX, 0, 0);
      break;
    }
    case 'stack': {    // 60 个梦一起来
      const k = smooth(lt / 1.0);
      sleepDog(gt, { paddle: 1.4, wag: 0.9, chomp: Math.abs(Math.sin(lt * 9)) * 0.8, dx: 0.04 * Math.sin(gt * 45) });
      bed.position.x = DOG_BED.x + 0.04 * Math.sin(gt * 45) + 0.25 * k; bed.rotation.y = 0.15 * k;
      const spots = [[0.8, 3.3, 0.3], [-1.6, 3.6, -0.6], [2.0, 2.0, 0.6], [-2.1, 2.1, 0.6], [2.0, 4.6, -0.8], [-0.4, 5.0, -1.2]];
      spots.forEach((p, i) => showBubble(bubbles[i], p[0], p[1], p[2], lt - 0.15 - i * 0.22, gt, i === 0));
      bigBone.visible = true; bigBone.rotation.z = 0.4 * Math.sin(gt * 2);
      bubbles.slice(1, 5).forEach(b => b.inner.children.forEach(c => { c.visible = true; c.rotation.set(0.4, gt * 1.5, 0.3); }));
      if (lt - 0.15 - 5 * 0.22 > 0) {   // 最后一个泡泡里是那只猫
        cat.root.visible = true; cat.root.scale.setScalar(0.3 * back((lt - 1.25) / 0.45)); cat.root.position.set(-0.4, 4.7, -1.2);
        cat.root.rotation.y = 0.4 * Math.sin(gt);
        cat.update(gt, { tails: { mode: 'single' }, yaw: 0.3, look: 1 });
      }
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.0, 0]); zzz(gt * 1.8, x - 120, y + 30); });
      L(() => pop('停不下来！', 720, 1290, 66, PINK, lt - 1.6));
      camPos = [0.2, 3.6, 19]; camTgt = [0.1, 2.5, 0];
      break;
    }
    case 'why': {
      room.visible = false; stage.visible = true; stage.material.color.set('#9a74f0'); setSky('#5a3cc8', '#b28cf0');
      dog.root.position.set(0, 0, 0.3); dog.root.rotation.y = 0.6 + 0.15 * Math.sin(lt * 0.7);
      dog.update(gt, { lie: 1, eyes: 'sleep', rem: true, paddle: 0.35, wag: 0.25, dropY: drop(lt) });
      ['快速眼动期：眼皮抖、爪子抽', '科学家推测：梦的多半是白天的事', '小型犬做梦更勤，每次更短', '“每分钟一个梦”是夸张效果']
        .forEach((s, i) => L(() => pill(s, 540, 270 + i * 112, 40, i === 3 ? 'rgba(66,38,63,0.8)' : '#ffffff', i === 3 ? '#fff' : INK, lt - 0.3 - i * 0.7)));
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.0, 0]); zzz(gt, x + 20, y + 20); });
      camPos = [0, 2.6, 12.5]; camTgt = [0, 1.1, 0];
      break;
    }
    case 'back': {     // 梦里是你 -> 醒来跑去找你
      person.root.position.set(2.1, 0, 0.9); person.root.rotation.y = -0.9;
      if (lt < 2.2) {
        sleepDog(gt, { wag: 0.9, paddle: 0.2 });
        showBubble(bubbles[0], ...BUB, lt - 0.2, gt, true);
        personMini.root.visible = true; personMini.root.position.set(0, -0.5, 0); personMini.update(gt, { wave: true });
        person.update(lt, { headYaw: -0.2 });
        L(() => { const [x, y] = proj(bubbles[0].root, [0, 1.0, 0]); pill('梦里都是你', x, y - 10, 44, PINK, '#fff', lt - 0.6); });
        camPos = [0.6, 3.3, 15]; camTgt = [0.5, 1.75, 0];
      } else {
        const u = lt - 2.2, wake = smooth(u / 0.4), w = smooth((u - 0.5) / 1.2);
        dog.root.position.set(lerp(DOG_BED.x, 1.05, w), lerp(0.22, 0, w), lerp(DOG_BED.z, 1.1, w)); dog.root.rotation.y = lerp(DOG_BED.ry, 1.2, smooth((u - 0.3) / 0.6));
        dog.update(gt, { lie: 1 - wake, eyes: u < 0.35 ? 'sleep' : 'happy', walk: u > 0.5 && w < 1 ? 1 : 0, hop: w >= 1 ? 0.5 : 0,
          wag: 1, tongue: u > 0.6, perk: 0.4, pitch: -0.2 * w, yaw: 0.2 * w });
        person.update(lt, { reach: w > 0.6, headYaw: -0.1 });
        hemi.color.set('#ffe6d6');
        hearts.forEach((h, i) => { if (u < 0.8) return; h.visible = true; const q = ((u - 0.8) * 0.45 + i / 14) % 1;
          h.position.set(1.4 + Math.sin(i * 2.1) * 1.6 + 0.2 * Math.sin(lt * 2 + i), 1 + q * 3.5, 0.8 + Math.cos(i) * 0.5); h.scale.setScalar(0.35 * Math.sin(Math.PI * q) + 0.01); });
        L(() => { if (u > 0.2) { const [x, y] = proj(dog.headPivot, [0, 1.3, 0]); pop('醒啦！', clamp(x, 470, 880), y - 20, 66, '#ee7a3c', u - 0.2); } });
        camPos = [0.9, 2.8, 14.5]; camTgt = [0.9, 1.6, 0];
      }
      break;
    }
    case 'end': {
      room.visible = false; stage.visible = true; stage.material.color.set('#ff6f9e'); setSky('#e83f7f', '#ff9cc4');
      dog.root.scale.setScalar(0.8); dog.root.rotation.y = 0.3 * Math.sin(lt * 1.2);
      dog.update(gt, { hop: 0.6, eyes: 'happy', tongue: true, wag: 1, yaw: 0.35 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.5), perk: 0.3 });
      hearts.forEach((h, i) => { h.visible = true; const q = (lt * 0.35 + i / 14) % 1;
        h.position.set(Math.sin(i * 2.1) * 2.2, 0.5 + q * 4.5, -0.5 + Math.cos(i) * 0.6); h.scale.setScalar(0.4 * Math.sin(Math.PI * q) + 0.01); });
      camPos = [0, 1.8, 12]; camTgt = [0, 2.3, 0];
      break;
    }
  }
  camera.updateProjectionMatrix();
  return { camPos, camTgt };
}

const SHAKE = { stack: 0.035, rain: 0.025 };
window.renderAt = (gt) => {
  let i = SCENES.length - 1; while (i > 0 && gt < STARTS[i]) i--;
  const sc = SCENES[i], name = sc[1], dur = sc[0], lt = gt - STARTS[i];
  labels = [];
  // 先放好镜头(用于投影), 再摆场景
  const { camPos, camTgt } = setup(name, lt, dur, gt);
  const push = 1 - 0.06 * (lt / dur) - 0.14 * (1 - back(lt / 0.45));
  const sh = (SHAKE[name] || 0) * (name === 'stack' ? 0.4 + lt / dur : 1);
  const dir = new THREE.Vector3(...camPos).sub(new THREE.Vector3(...camTgt));
  const pos = new THREE.Vector3(...camTgt).add(dir.multiplyScalar(push));
  pos.x += 0.18 * Math.sin(lt * 0.9 + i) + sh * Math.sin(gt * 53); pos.y += 0.09 * Math.sin(lt * 1.3 + i * 2) + sh * Math.cos(gt * 47);
  camera.position.copy(pos); camera.lookAt(...camTgt);
  camera.updateMatrixWorld();
  sparkle.material.uniforms.uTime.value = gt; petals.material.uniforms.uTime.value = gt;
  G.uTime.value = gt;
  composer.render();
  ctx.drawImage(renderer.domElement, 0, 0);
  if (DREAM.has(name)) { pill('梦境中…', W - 190, 270, 38, 'rgba(132,100,196,0.85)', '#fff', lt); }
  labels.forEach(f => f());
  if (name === 'title') {
    const a = back(lt / 0.5);
    ctx.save(); ctx.translate(540, 560); ctx.scale(a, a);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-420, -145, 840, 290, 36); ctx.fill();
    txt('假如你家狗', 0, -55, 76, INK); txt('每分钟做一个梦', 0, 50, 84, '#8464c4'); ctx.restore();
    txt('会发生什么？', 540, 780, 76, '#fff', INK, 12);
  }
  if (name === 'end') {
    const a = smooth(lt / 0.8);
    ctx.globalAlpha = a;
    txt('今晚，它大概又会梦见你', 540, 560, 66, '#ffffff', '#c23f74', 12);
    txt('你家狗睡觉会蹬腿吗？', 540, 690, 58, INK, '#ffffff', 10);
    ctx.globalAlpha = clamp((lt - 1) / 0.4);
    txt('评论区告诉我 ↓', 540, 800, 58, '#a2285e', '#ffffff', 10);
    ctx.globalAlpha = 1;
  }
  drawHUD(sc, lt, dur);
  drawCaption(sc, lt);
  drawDanmaku(gt);
  if (lt < 0.15 && i > 0) { ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - lt / 0.15)})`; ctx.fillRect(0, 0, W, H); }
  if (i === SCENES.length - 1 && lt > dur - 0.8) { ctx.fillStyle = `rgba(255,255,255,${clamp((lt - dur + 0.8) / 0.8)})`; ctx.fillRect(0, 0, W, H); }
  return out.toDataURL('image/jpeg', 0.9);
};
window.READY = true;
