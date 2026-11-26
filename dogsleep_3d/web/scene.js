// 《为什么狗从来不打扰主人睡觉》 3D 版 — three.js 场景 + 2D 字幕层. window.renderAt(t) 决定性渲染一帧.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, smooth, lerp, back, bounce, rng, canvasTex, std, rbox, mesh, box, heartTex, makeSparkles,
         makeCat, makePerson, makeDog } from './lib.js';

const W = 1080, H = 1920;
const FONT = '"WenQuanYi Zen Hei", sans-serif';
await document.fonts.load(`80px ${FONT}`, '猫');

// ------------------------------------------------------------------ 时间线
// [时长, 名字, 吵醒次数起, 止, 字幕, 英文, 时间, 猫在干嘛, 狗在干嘛]
const SCENES = [
  [3.0, 'title', 0, 0, '', '', '', '', ''],
  [3.4, 's0', 0, 0, '0点：主人睡了\n狗也跟着睡了', 'Midnight: You fall asleep. So does the dog.', '00:00', '瞪着眼发呆', '呼呼大睡'],
  [3.4, 's1', 0, 1, '凌晨1点：猫开始跑酷\n狗：没听见', '1 a.m.: The cat starts its zoomies. Dog: heard nothing.', '01:00', '满屋跑酷', '呼呼大睡'],
  [3.2, 's3', 1, 2, '凌晨3点：杯子被推下桌\n啪！', '3 a.m.: A cup gets pushed off the table. Crash!', '03:00', '推杯子', '翻了个身'],
  [3.2, 's4', 2, 3, '凌晨4点半：猫坐在你胸口\n一直盯着你', '4:30 a.m.: The cat sits on your chest and stares.', '04:30', '盯着你', '打呼噜'],
  [3.6, 's5', 3, 5, '凌晨5点：踩脸 + 喵喵叫\n起床！开饭！', '5 a.m.: Paws on your face, loud meows. Get up! Breakfast!', '05:00', '踩脸', '睡得最香'],
  [3.6, 's6', 5, 5, '6点：你终于醒了\n狗这才睁眼，摇摇尾巴', '6 a.m.: You finally wake up. Only now does the dog open its eyes and wag.', '06:00', '等早饭', '醒了，摇尾巴'],
  [5.0, 'why', 0, 0, '大多数狗会跟着主人的作息睡觉\n猫是晨昏型动物，天快亮最精神', "Most dogs sync to their owner's sleep. Cats are crepuscular: dawn is their prime time.", '', '', ''],
  [4.8, 'back', 0, 0, '狗不吵你，是在陪你睡\n猫叫醒你，是想第一个见到你', 'The dog lets you sleep to keep you company. The cat wakes you to see you first.', '', '', ''],
  [3.6, 'end', 0, 0, '', '', '', '', ''],
];
const STARTS = []; { let a = 0; for (const s of SCENES) { STARTS.push(a); a += s[0]; } }
const IDX = Object.fromEntries(SCENES.map((s, i) => [s[1], i]));
const DANMAKU = ['我家猫5点准时踩脸', '狗：岁月静好', '猫：开饭！', '真实', '哈哈哈哈哈', '我被踩醒过', '狗才是天使',
  '猫：我饿了', '+1', '闹钟都没猫准', 'awsl', '狗：zzz', '杯子：我做错了什么', '太真实了'];
const INK = '#42263f', PINK = '#e8588a', MINT = '#2ea47c', SKY = '#468cd6', LAV = '#8464c4';

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
const camera = new THREE.PerspectiveCamera(32, W / H, 0.05, 900);
const scene = new THREE.Scene();
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.25, 0.5, 0.9));
composer.addPass(new OutputPass());
const out = document.getElementById('out'); const ctx = out.getContext('2d');

const hemi = new THREE.HemisphereLight('#fff2f6', '#c99bb8', 1.5); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0e0', 2.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 5; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
sun.position.set(3, 9, 6); sun.target.position.set(0, 0, -1); scene.add(sun, sun.target);
{ const c = sun.shadow.camera; c.left = -7; c.right = 7; c.top = 7; c.bottom = -7; c.near = 0.5; c.far = 40; }
const lamp = new THREE.PointLight('#ffc98a', 0, 6, 1.5); lamp.position.set(-1.45, 1.7, -2.5); scene.add(lamp);
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { top: { value: new THREE.Color('#79b6f0') }, bot: { value: new THREE.Color('#cfe6fb') } },
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top, bot; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.1, 0.45, vP.y)), 1.0); }`,
}));
scene.add(skyDome);
const setSky = (a, b) => { skyDome.material.uniforms.top.value.set(a); skyDome.material.uniforms.bot.value.set(b); };

// ------------------------------------------------------------------ 卧室: 床 / 床头柜 / 台灯 / 杯子 / 窗外夜景
const room = new THREE.Group(); scene.add(room);
let glassTex;
{
  const plank = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d49a70'; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let y = 0; y < h; y += 64) { g.fillStyle = `rgba(150,90,60,${0.15 + r() * 0.15})`; g.fillRect(0, y, w, 4); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(255,230,200,0.12)'; g.fillRect(r() * w, y + 10 + r() * 40, 80 + r() * 120, 3); } }
  });
  plank.wrapS = plank.wrapT = THREE.RepeatWrapping; plank.repeat.set(3, 3);
  const floor = mesh(new THREE.PlaneGeometry(16, 16), std('#ffffff', { map: plank }), false, true); floor.rotation.x = -Math.PI / 2; room.add(floor);
  const backW = mesh(new THREE.PlaneGeometry(16, 9), std('#f2a7c3'), false, true); backW.position.set(0, 4.5, -3.6); room.add(backW);
  const leftW = mesh(new THREE.PlaneGeometry(10, 9), std('#b99ae6'), false, true); leftW.rotation.y = Math.PI / 2; leftW.position.set(-3.0, 4.5, 1.4); room.add(leftW);
  glassTex = canvasTex(512, 384, () => {});
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshBasicMaterial({ map: glassTex })); glass.position.set(-2.98, 3.0, -1.2); glass.rotation.y = Math.PI / 2; room.add(glass);
  for (const [d, h, z, y] of [[2.5, 0.14, -1.2, 3.85], [2.5, 0.14, -1.2, 2.15], [0.14, 1.8, -2.4, 3.0], [0.14, 1.8, 0.0, 3.0], [0.1, 1.6, -1.2, 3.0]]) {
    const f = box(0.12, h, d, '#ffffff', 0.03); f.position.set(-2.95, y, z); room.add(f);
  }
  // 床
  const frame = box(2.3, 0.45, 3.6, '#c08a5e', 0.08); frame.position.set(0.5, 0.25, -1.65); room.add(frame);
  const matt = box(2.2, 0.3, 3.5, '#ffffff', 0.1); matt.position.set(0.5, 0.6, -1.65); room.add(matt);
  const head = box(2.4, 1.6, 0.2, '#c9b3f0', 0.1); head.position.set(0.5, 0.8, -3.45); room.add(head);
  const pillow = box(1.2, 0.25, 0.6, '#ffe6ef', 0.12); pillow.position.set(0.5, 0.86, -3.0); room.add(pillow);
  // 床头柜 + 台灯
  const ns = box(0.8, 0.9, 0.8, '#a98ad8', 0.06); ns.position.set(-1.45, 0.45, -2.6); room.add(ns);
  const lb = box(0.18, 0.4, 0.18, '#ffffff', 0.05); lb.position.set(-1.7, 1.1, -2.75); room.add(lb);
  const shade = mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.36, 16), std('#ffe0a8', { emissive: new THREE.Color('#ffcf8a'), emissiveIntensity: 0.0 })); shade.position.set(-1.7, 1.45, -2.75); room.add(shade);
  room.userData.shade = shade;
  // 地毯 + 狗窝
  const rug = mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.03, 48), std('#f7c1d3'), false, true); rug.position.set(0.9, 0.015, 1.1); room.add(rug);
  const bed2 = mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.18, 32), std('#9fc6f2'), true, true); bed2.position.set(0.9, 0.09, 1.0); room.add(bed2);
}
function drawWindow(night) {   // 夜晚: 月亮 + 星星 + 亮灯的楼; 早上: 日出
  const g = glassTex.userData.g, w = 512, h = 384;
  const gr = g.createLinearGradient(0, 0, 0, h);
  if (night > 0.5) { gr.addColorStop(0, '#2a2f6e'); gr.addColorStop(1, '#6c5aa8'); } else { gr.addColorStop(0, '#ffb38a'); gr.addColorStop(1, '#ffe2a8'); }
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const r = rng(9);
  if (night > 0.5) { g.fillStyle = '#fff6c8'; g.beginPath(); g.arc(380, 90, 46, 0, 7); g.fill(); g.fillStyle = '#2f3575'; g.beginPath(); g.arc(400, 78, 40, 0, 7); g.fill();
    g.fillStyle = '#ffffff'; for (let i = 0; i < 30; i++) g.fillRect(r() * w, r() * 200, 3, 3); }
  else { g.fillStyle = '#fff1b8'; g.beginPath(); g.arc(256, 300, 70, 0, 7); g.fill(); }
  const cols = night > 0.5 ? ['#5a4c8f', '#6a5aa0', '#4d4683'] : ['#f39cb4', '#9cbcf0', '#f6cf78'];
  for (let x = 0; x < w; x += 46) { const bh = 70 + r() * 150; g.fillStyle = cols[(x / 46) % 3 | 0]; g.fillRect(x, h - bh, 42, bh);
    g.fillStyle = night > 0.5 ? '#ffe08a' : 'rgba(255,255,255,0.85)'; for (let wy = h - bh + 14; wy < h - 10; wy += 26) for (let wx = x + 6; wx < x + 36; wx += 14) if (r() < 0.5) g.fillRect(wx, wy, 7, 12); }
  glassTex.needsUpdate = true;
}
// 被子 (盖在主人身上)
const blanket = box(2.25, 0.6, 2.35, '#f6a8c4', 0.22); blanket.position.set(0.5, 0.95, -1.05); room.add(blanket);
const cup = new THREE.Group(); room.add(cup);
{ const c = mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.26, 20), std('#ffffff')); cup.add(c); const st = mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.06, 20), std('#ff8fb0')); st.position.y = 0.04; cup.add(st); }
const shards = []; for (let i = 0; i < 7; i++) { const s = box(0.08, 0.03, 0.06, i % 2 ? '#ffffff' : '#ff8fb0', 0.01); room.add(s); shards.push(s); }
const stage = mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.4, 48), std('#ffffff'), false, true); stage.position.y = -0.2; scene.add(stage);

const cat = makeCat(); scene.add(cat.root);
const dog = makeDog(); scene.add(dog.root);
const girl = makePerson(); scene.add(girl.root);
const hearts = []; for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false })); scene.add(s); hearts.push(s); }
const sparkRoom = makeSparkles(110, [14, 8, 10], '#fff4fa', 0.9, 7, 0.08); scene.add(sparkRoom);
const petals = makeSparkles(40, [14, 9, 10], '#ff9fc2', 1.1, 11, -0.35); scene.add(petals);

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
function pop(s, x, y, size, col, age) { if (age < 0) return; txt(s, x, y, Math.max(4, size * back(age / 0.3)), col, '#ffffff', 10); }
const v3 = new THREE.Vector3();
function proj(obj, off = [0, 0, 0]) { v3.set(...off); obj.localToWorld(v3); v3.project(camera); return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H]; }
function zzz(obj, off, lt, col = '#bfe0ff') {   // 往上飘的 Zzz
  const [x, y] = proj(obj, off);
  for (let k = 0; k < 3; k++) { const u = (lt * 0.5 + k / 3) % 1; ctx.globalAlpha = Math.sin(Math.PI * u); txt('Z', x + 40 * u + k * 10, y - 160 * u, 40 + 26 * u, col, INK, 6); }
  ctx.globalAlpha = 1;
}
function bubble(s, x, y, size, age, col = PINK) {
  if (age < 0) return; const k = back(age / 0.3); size *= k;
  ctx.font = `${size}px ${FONT}`; const w = ctx.measureText(s).width + size;
  ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - size * 0.85, w, size * 1.7, size * 0.6); ctx.moveTo(x - 20, y + size * 0.8); ctx.lineTo(x - 40, y + size * 1.4); ctx.lineTo(x + 10, y + size * 0.8); ctx.fill(); ctx.stroke();
  txt(s, x, y + 2, size, col, INK, 6);
}
function drawHUD(sc, lt, dur) {
  const [, name, a0, a1, , , time, catDo, dogDo] = sc;
  if (!time) return;
  const v = Math.round(lerp(a0, a1, smooth(clamp((lt - 0.5) / (dur * 0.6)))));
  const x = 34, y = 560;
  txt('被吵醒次数', x, y, 46, '#fff', INK, 8, 'left');
  txt('W A K E - U P S', x, y + 36, 20, '#fff', INK, 4, 'left');
  const ns = 96 * (0.7 + 0.3 * back(lt / 0.4));
  txt(String(v), x, y + 110, ns, '#fff', INK, 10, 'left');
  ctx.font = `${ns}px ${FONT}`; const w = ctx.measureText(String(v)).width;
  txt('次', x + w + 10, y + 128, 40, '#fff', INK, 8, 'left');
  [`时间: ${time}`, `猫: ${catDo}`, `狗: ${dogDo}`].forEach((l, i) => txt(l, x, y + 186 + i * 42, 32, '#fff', INK, 7, 'left'));
  ctx.fillStyle = '#e8587e'; ctx.beginPath(); ctx.roundRect(x, y + 318, 116, 48, 24); ctx.fill(); txt('猫 +1', x + 58, y + 343, 30, '#fff');
  ctx.fillStyle = MINT; ctx.beginPath(); ctx.roundRect(x + 128, y + 318, 116, 48, 24); ctx.fill(); txt('狗 0', x + 186, y + 343, 30, '#fff');
}
function drawCaption(sc, lt) {
  const [, , , , cap, en] = sc; if (!cap) return;
  const lines = cap.split('\n');
  const y0 = 1560 - (lines.length - 1) * 40;
  let fs = 66; ctx.font = `${fs}px ${FONT}`;
  while (fs > 40 && Math.max(...lines.map(l => ctx.measureText(l).width)) > 1000) { fs -= 2; ctx.font = `${fs}px ${FONT}`; }
  lines.forEach((l, i) => { const u = lt - i * 0.12; if (u > 0) txt(l, 540, y0 + i * 84, Math.max(8, fs * back(u / 0.35)), '#ffe14a', '#6e3a3c', 14); });
  let ew = 28; ctx.font = `${ew}px ${FONT}`; while (ew > 20 && ctx.measureText(en).width > 1020) { ew--; ctx.font = `${ew}px ${FONT}`; }
  if (lt > 0.2) txt(en, 540, y0 + lines.length * 84 - 22, ew, '#fff', INK, 6);
}
function drawDanmaku(gt) {
  const start = STARTS[IDX.s5], end = STARTS[IDX.why] + 0.8;
  if (gt < start || gt > end) return;
  const dens = clamp((gt - start) / 2.0), r = rng(2026);
  const cols = ['#ffffff', '#ffe98f', '#a9e4ff', '#ffb3cf', '#bdf7c6'];
  for (let i = 0; i < 60; i++) {
    const t0 = start + (r() * (end - start + 2) - 2), sp = 300 + r() * 160, y = 130 + Math.floor(r() * 8) * 50;
    const col = cols[Math.floor(r() * 5)], s = DANMAKU[Math.floor(r() * DANMAKU.length)], keep = r() <= dens;
    const x = W - (gt - t0) * sp;
    if (x < -500 || x > W || !keep) continue;
    txt(s, x, y, 38, col, INK, 6, 'left');
  }
}

// ------------------------------------------------------------------ 场景
let labels = [];
const L = fn => labels.push(fn);
const drop = lt => (1 - bounce(lt / 0.7)) * 5;
const BED = [1.2, 6.6, 7.4], BEDT = [0.6, 0.6, -0.9];
function night(k) {   // k: 0 白天 → 1 深夜 (梦幻蓝紫, 不会太黑)
  hemi.color.set(new THREE.Color('#fff2f6').lerp(new THREE.Color('#9aa6f0'), k)); hemi.groundColor.set(new THREE.Color('#c99bb8').lerp(new THREE.Color('#5a4c8f'), k));
  hemi.intensity = lerp(1.5, 1.05, k);
  sun.color.set(new THREE.Color('#fff0e0').lerp(new THREE.Color('#a9b8ff'), k)); sun.intensity = lerp(2.3, 1.1, k);
  lamp.intensity = 2.5 * k; room.userData.shade.material.emissiveIntensity = 0.8 * k;
  drawWindow(k);
}
function sleepers(gt, dogOpts = {}) {
  girl.root.position.set(0.5, 0, 0.0); girl.root.rotation.set(-Math.PI / 2, 0, 0);
  girl.update(gt, { sleep: true, y: 0.8, headYaw: 0 }); girl.root.scale.set(1, 1, 0.5);
  dog.root.position.set(0.9, 0.18, 1.15); dog.root.rotation.set(0, -0.5, 0);
  dog.update(gt, { sleep: true, ...dogOpts });
}

function setup(name, lt, dur, gt) {
  const p = lt / dur;
  room.visible = true; stage.visible = false; blanket.visible = true;
  [cat.root, dog.root, girl.root].forEach(o => o.visible = false); hearts.forEach(h => h.visible = false); shards.forEach(s => s.visible = false);
  cat.root.position.set(0, 0, 0); cat.root.rotation.set(0, 0, 0); cat.root.scale.setScalar(1);
  dog.root.scale.setScalar(1); girl.root.scale.setScalar(1);
  cup.position.set(-1.2, 1.03, -2.45); cup.rotation.set(0, 0, 0);
  setSky('#79b6f0', '#cfe6fb'); night(1);
  let camPos = BED, camTgt = BEDT;
  switch (name) {
    case 'title': {
      night(0); blanket.visible = false;
      girl.root.position.set(-0.9, 0, 0.9); girl.root.rotation.set(0, 0.4, 0); girl.update(gt, { wave: true });
      cat.root.position.set(0.9, 0, 1.0); cat.root.rotation.y = -0.4; cat.root.scale.setScalar(0.8);
      cat.update(gt, { hop: 1, yaw: 0.3 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.6) });
      dog.root.position.set(0.15, 0, 2.0); dog.root.rotation.set(0, 0.1, 0); dog.update(gt, { happy: true, wag: true });
      camPos = [0, 2.6, 11.5]; camTgt = [0, 1.5, 0.5];
      break;
    }
    case 's0': {
      sleepers(gt);
      cat.root.position.set(1.85, 0, 0.3); cat.root.rotation.y = -0.8; cat.root.scale.setScalar(0.62);
      cat.update(gt, { dropY: drop(lt), yaw: 0.5 * Math.sin(lt * 1.2), look: Math.sin(lt * 1.2) });
      L(() => zzz(girl.root, [0, 3.0, 0.4], lt));
      L(() => zzz(dog.headP, [0, 0.9, 0.3], lt + 0.5));
      L(() => { const [x, y] = proj(cat.headPivot, [0, 1.6, 0]); pill('精神百倍', x, y, 40, LAV, '#fff', lt - 1.0); });
      break;
    }
    case 's1': {
      sleepers(gt);
      const u = (lt * 0.55) % 1, dirR = Math.floor(lt * 0.55) % 2 === 0;
      const x = dirR ? lerp(-2.2, 3.0, u) : lerp(3.0, -2.2, u);
      cat.root.position.set(x, 1.25 * smooth((1.45 - Math.abs(x - 0.5)) / 0.45), -0.7); cat.root.rotation.y = dirR ? Math.PI / 2 : -Math.PI / 2; cat.root.scale.setScalar(0.6);
      cat.update(gt * 1.6, { walk: 2, hop: 0.7, eyes: 'normal', yaw: dirR ? -0.6 : 0.6 });
      L(() => { const [cx, cy] = proj(cat.root, [0, 1.2, 0]); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 7;
        for (let k = 0; k < 4; k++) { const sx = dirR ? -1 : 1; ctx.beginPath(); ctx.moveTo(cx + sx * (80 + k * 10), cy - 40 + k * 30); ctx.lineTo(cx + sx * (190 + k * 20), cy - 40 + k * 30); ctx.stroke(); } });
      L(() => pop('哒哒哒', 540, 1240, 60, LAV, lt - 0.3));
      L(() => zzz(dog.headP, [0, 0.9, 0.3], lt));
      camPos = [1.2, 6.2, 8.4]; camTgt = [0.5, 0.7, -0.4];
      break;
    }
    case 's3': {
      sleepers(gt, { yaw: 0.6 });
      cat.root.position.set(-1.6, 0.9, -2.55); cat.root.rotation.y = Math.PI / 2 - 0.2; cat.root.scale.setScalar(0.42);
      cat.update(gt, { dropY: drop(lt) * 0.4, yaw: -0.7 + 0.2 * Math.sin(lt * 2), look: 1 });
      const push = smooth((lt - 0.8) / 0.25), fall = clamp((lt - 1.05) / 0.45);
      cat.legs[1].rotation.x = -1.2 * Math.sin(Math.PI * clamp((lt - 0.6) / 0.6));
      if (lt > 1.05) { cup.position.set(-0.95 + 0.25 * fall, lerp(1.03, 0.14, fall * fall), -2.45); cup.rotation.set(0, 0, -2.5 * fall); }
      else cup.position.x = -1.2 + 0.25 * push;
      if (fall >= 1) shards.forEach((s, i) => { s.visible = true; const a = i / 7 * Math.PI * 2, rr = 0.15 + 0.35 * smooth((lt - 1.5) / 0.3); s.position.set(-0.7 + rr * Math.cos(a), 0.03, -2.45 + rr * Math.sin(a)); s.rotation.y = a; });
      L(() => pop('啪！', 700, 900, 130, PINK, lt - 1.5));
      L(() => zzz(dog.headP, [0, 0.9, 0.3], lt));
      camPos = [1.3, 2.9, 3.6]; camTgt = [-1.0, 0.9, -2.3];
      break;
    }
    case 's4': {
      sleepers(gt);
      cat.root.position.set(0.5, 1.25, -1.85); cat.root.rotation.y = Math.PI; cat.root.scale.setScalar(0.32);
      cat.update(gt, { dropY: drop(lt) * 0.5, yaw: 0.1 * Math.sin(lt), pitch: 0.25, look: 0 });
      L(() => { const [x, y] = proj(cat.headPivot, [0, 1.4, 0]); pop('……', x, y, 70, INK, lt - 0.9); });
      L(() => zzz(girl.root, [0, 3.0, 0.4], lt));
      camPos = [5.2, 2.8, -1.4]; camTgt = [0.5, 1.2, -2.3];
      break;
    }
    case 's5': {
      sleepers(gt);
      const st = Math.floor(lt * 4) % 2;
      cat.root.position.set(0.5, 1.25 + 0.05 * st, -2.15); cat.root.rotation.y = Math.PI; cat.root.scale.setScalar(0.32);
      cat.update(gt, { yaw: 0.2 * Math.sin(lt * 6), mouth: 'o', eyes: 'normal' });
      cat.legs[0].rotation.x = -1.3 * st; cat.legs[1].rotation.x = -1.3 * (1 - st);
      L(() => { const [x, y] = proj(cat.headPivot, [0, 1.3, 0]); bubble('喵！！', x - 60, y - 40, 60, lt - 0.4); });
      L(() => { const [x, y] = proj(girl.root, [0, 3.05, 0.3]); pop('踩', x - 120 + 240 * st, y + 40, 60, PINK, (lt * 4) % 1); });
      L(() => zzz(dog.headP, [0, 0.9, 0.3], lt));
      camPos = [4.9, 2.9, -1.3]; camTgt = [0.5, 1.2, -2.4];
      break;
    }
    case 's6': {
      const wake = smooth((lt - 0.3) / 0.6);
      night(1 - wake);
      girl.root.position.set(0.5, -0.25, -2.3); girl.root.rotation.set(0, 0, 0);
      girl.update(gt, { y: -0.25, shock: lt < 1.4, headYaw: lt < 1.4 ? 0 : -0.4, reach: lt > 1.8 });
      cat.root.position.set(1.15, 1.25, -1.0); cat.root.rotation.y = -0.6; cat.root.scale.setScalar(0.45);
      cat.update(gt, { hop: 0.5, eyes: 'happy', yaw: 0.3 * Math.sin(lt * 3) });
      dog.root.position.set(0.9, 0.18, 1.15); dog.root.rotation.set(0, -0.5 + 0.3 * smooth((lt - 1.6) / 0.6), 0);
      const dogAwake = lt > 1.5;
      dog.update(gt, { sleep: lt < 1.2, oneEye: lt >= 1.2 && lt < 1.6, happy: dogAwake, wag: dogAwake });
      L(() => { if (lt < 1.2) zzz(dog.headP, [0, 0.9, 0.3], lt); });
      L(() => { const [x, y] = proj(dog.headP, [0, 1.3, 0.2]); pill('早呀～', x, y, 44, MINT, '#fff', lt - 1.7); });
      L(() => pop('！', 520, 520, 120, PINK, lt - 0.4));
      camPos = [1.2, 6.0, 7.6]; camTgt = [0.6, 1.0, -0.8];
      break;
    }
    case 'why': {
      room.visible = false; stage.visible = true; stage.material.color.set('#c7b2f0'); setSky('#a98ae0', '#d8c6f6'); night(0);
      dog.root.position.set(-1.0, 0, 0.3); dog.root.rotation.set(0, 0.35, 0); dog.root.position.y = -drop(lt) * -1;
      dog.update(gt, { sleep: lt > 2.5, happy: lt <= 2.5 });
      cat.root.position.set(1.0, 0, 0.3); cat.root.rotation.y = -0.4;
      cat.update(gt, { dropY: drop(lt), hop: lt > 1 ? 0.7 : 0, yaw: -0.4 * Math.sin(lt * 1.3), look: Math.sin(lt * 1.3) });
      ['狗：跟着你的作息走', '狗：一天能睡 12~14 小时', '猫：黎明和黄昏最活跃', '猫叫你：多半是饿了或想玩']
        .forEach((s, i) => L(() => pill(s, 540, 290 + i * 116, 40, i < 2 ? '#ffffff' : '#ffe2ee', INK, lt - 0.3 - i * 0.8)));
      camPos = [0, 2.3, 10.2]; camTgt = [0, 1.3, 0];
      break;
    }
    case 'back': {
      night(0);
      girl.root.position.set(0.5, -0.25, -2.3); girl.root.rotation.set(0, 0, 0); girl.update(gt, { y: -0.25, reach: true, headYaw: 0.2 * Math.sin(lt) });
      cat.root.position.set(1.05, 1.25, -1.4); cat.root.rotation.y = -2.4; cat.root.scale.setScalar(0.45);
      cat.update(gt, { eyes: 'happy', yaw: 0.25 * Math.sin(lt * 2), tilt: 0.2 });
      dog.root.position.set(1.0, 0, 1.0); dog.root.rotation.set(0, -0.3, 0); dog.update(gt, { happy: true, wag: true });
      hearts.forEach((h, i) => { h.visible = true; const u = (lt * 0.4 + i / 14) % 1; h.position.set(0.8 + Math.sin(i * 2.1) * 1.6 + 0.2 * Math.sin(lt * 2 + i), 1.2 + u * 3.2, -1.0 + Math.cos(i) * 0.6); h.scale.setScalar(0.32 * Math.sin(Math.PI * u) + 0.01); });
      hemi.color.set('#ffe6d6');
      camPos = [1.2, 5.6, 7.8]; camTgt = [0.6, 1.1, -0.8];
      break;
    }
    case 'end': {
      room.visible = false; stage.visible = true; stage.material.color.set('#f9b6cd'); setSky('#f597bc', '#ffd0e0'); night(0);
      cat.root.position.set(0.8, 0, 0); cat.root.scale.setScalar(0.7); cat.root.rotation.y = -0.3;
      cat.update(gt, { hop: 0.6, eyes: 'happy', yaw: 0.4 * Math.sin(lt * 2) });
      dog.root.position.set(-0.8, 0, 0); dog.root.scale.setScalar(0.85); dog.root.rotation.set(0, 0.3, 0); dog.update(gt, { happy: true, wag: true });
      camPos = [0, 1.8, 10]; camTgt = [0, 2.4, 0];
      break;
    }
  }
  return { camPos, camTgt };
}

const SHAKE = { s5: 0.03 };
window.renderAt = (gt) => {
  let i = SCENES.length - 1; while (i > 0 && gt < STARTS[i]) i--;
  const sc = SCENES[i], name = sc[1], dur = sc[0], lt = gt - STARTS[i];
  labels = [];
  const { camPos, camTgt } = setup(name, lt, dur, gt);
  const push = 1 - 0.05 * (lt / dur) - 0.12 * (1 - back(lt / 0.45));
  const sh = (SHAKE[name] || 0) + (name === 's3' && lt > 1.5 && lt < 1.8 ? 0.06 : 0);
  const dir = new THREE.Vector3(...camPos).sub(new THREE.Vector3(...camTgt));
  const pos = new THREE.Vector3(...camTgt).add(dir.multiplyScalar(push));
  pos.x += 0.12 * Math.sin(lt * 0.9 + i) + sh * Math.sin(gt * 53); pos.y += 0.06 * Math.sin(lt * 1.3 + i * 2) + sh * Math.cos(gt * 47);
  camera.position.copy(pos); camera.lookAt(...camTgt); camera.updateMatrixWorld();
  sparkRoom.material.uniforms.uTime.value = gt; petals.material.uniforms.uTime.value = gt;
  composer.render();
  ctx.drawImage(renderer.domElement, 0, 0);
  labels.forEach(f => f());
  if (name === 'title') {
    const a = back(lt / 0.5);
    ctx.save(); ctx.translate(540, 575); ctx.scale(a, a);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-420, -145, 840, 290, 36); ctx.fill();
    txt('为什么狗从来', 0, -55, 76, INK); txt('不打扰主人睡觉？', 0, 50, 80, '#ee7a3c'); ctx.restore();
    txt('而猫……', 540, 790, 76, '#fff', INK, 12);
  }
  if (name === 'end') {
    const a = smooth(lt / 0.8);
    ctx.globalAlpha = a;
    txt('一个陪你睡，一个叫你起', 540, 560, 64, '#ffffff', '#c23f74', 12);
    txt('你家毛孩子几点叫你起床？', 540, 690, 56, INK, '#ffffff', 10);
    ctx.globalAlpha = clamp((lt - 1) / 0.4);
    txt('评论区报个时间 ↓', 540, 800, 58, '#a2285e', '#ffffff', 10);
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
