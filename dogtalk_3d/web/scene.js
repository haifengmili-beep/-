// 《假如你家狗每分钟学一句人话》 3D 版 — three.js 场景 + 2D 字幕/气泡层. window.renderAt(t) 决定性渲染一帧.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, smooth, lerp, back, bounce, rng, canvasTex, std, rbox, mesh, box, heartTex, makeSparkles,
         makeCat, makePerson, makeDog } from './lib.js';

const W = 1080, H = 1920;
const FONT = '"WenQuanYi Zen Hei", sans-serif';
await document.fonts.load(`80px ${FONT}`, '狗');

// ------------------------------------------------------------------ 时间线
// [时长, 名字, 句数起, 句数止, 字幕, 英文, 新技能, 副作用, 分钟]
const SCENES = [
  [3.0, 'title', 0, 0, '', '', '', '', 0],
  [3.2, 'm1', 0, 1, '第1分钟：学会第一句人话\n“饿。”', 'Minute 1: Its very first sentence. "Hungry."', '说“饿”', '饭盆被叼过来了', 1],
  [3.2, 'm2', 1, 2, '第2分钟：“出去玩！现在！”\n牵引绳已经叼在嘴里了', 'Minute 2: "Walk! Now!" The leash is already in its mouth.', '约你出门', '尾巴停不下来', 2],
  [3.2, 'm5', 2, 5, '第5分钟：终于能解释为什么叫了\n“门外有人！是快递！”', 'Minute 5: Finally it can explain the barking. "Someone\'s at the door!"', '报告门外', '每个快递都要播报', 5],
  [3.4, 'm10', 5, 10, '第10分钟：学会了第一句谎话\n“沙发不是我咬的”', 'Minute 10: Its first lie. "I did NOT chew the sofa."', '狡辩', '嘴边还挂着棉花', 10],
  [3.4, 'm20', 10, 20, '第20分钟：开始讨价还价\n“两块零食，我就坐下”', 'Minute 20: Negotiations begin. "Two treats and I\'ll sit."', '谈条件', '口令不好使了', 20],
  [3.4, 'm30', 20, 30, '第30分钟：开始告猫的状\n“花瓶是猫推倒的！”', 'Minute 30: Snitching on the cat. "The cat knocked over the vase!"', '告状', '和猫关系紧张', 30],
  [3.8, 'm45', 30, 45, '第45分钟：话太多了\n每一句都在问你去哪了', 'Minute 45: Way too chatty. Every sentence is "Where were you?"', '查岗', '你一句也插不上', 45],
  [4.6, 'why', 0, 0, '狗真的能听懂一些人话\n只是嘴巴说不出来', 'Dogs really do understand some words — they just can\'t say them.', '', '', 0],
  [4.8, 'back', 45, 45, '学会了45句人话\n它最想说的还是“你回来啦！”', 'It learned 45 sentences. The one it wants to say most: "You\'re home!"', '最想说的一句', '无', 45],
  [3.6, 'end', 0, 0, '', '', '', '', 0],
];
const STARTS = []; { let a = 0; for (const s of SCENES) { STARTS.push(a); a += s[0]; } }
const IDX = Object.fromEntries(SCENES.map((s, i) => [s[1], i]));
const DANMAKU = ['狗：我还没说完', '哈哈哈哈哈', '查岗来了', '沙发真不是它咬的吗', '我家狗就是这个眼神', '求同款狗狗',
  'awsl', '+1', '太真实了', '狗：你身上有别的狗味', '猫：别告状', '话痨狗', '插不上嘴了', '主人：我错了'];
const INK = '#42263f', PINK = '#e8588a', MINT = '#2ea47c', SKY = '#468cd6', LAV = '#8464c4', ORANGE = '#ee7a3c';

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 900);
const scene = new THREE.Scene();
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.18, 0.5, 1.0));
composer.addPass(new OutputPass());
const out = document.getElementById('out'); const ctx = out.getContext('2d');

const hemi = new THREE.HemisphereLight('#fff2f6', '#c99bb8', 1.5); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0e0', 2.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 5; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
sun.position.set(4, 9, 6); sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
{ const c = sun.shadow.camera; c.left = -7; c.right = 7; c.top = 7; c.bottom = -7; c.near = 0.5; c.far = 40; }
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { top: { value: new THREE.Color('#79b6f0') }, bot: { value: new THREE.Color('#cfe6fb') } },
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top, bot; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.1, 0.45, vP.y)), 1.0); }`,
}));
scene.add(skyDome);
const setSky = (a, b) => { skyDome.material.uniforms.top.value.set(a); skyDome.material.uniforms.bot.value.set(b); };

// ------------------------------------------------------------------ 客厅 + 道具
const room = new THREE.Group(); scene.add(room);
{
  const plank = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d49a70'; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let y = 0; y < h; y += 64) { g.fillStyle = `rgba(150,90,60,${0.15 + r() * 0.15})`; g.fillRect(0, y, w, 4); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(255,230,200,0.12)'; g.fillRect(r() * w, y + 10 + r() * 40, 80 + r() * 120, 3); } }
  });
  plank.wrapS = plank.wrapT = THREE.RepeatWrapping; plank.repeat.set(3, 3);
  const floor = mesh(new THREE.PlaneGeometry(16, 16), std('#ffffff', { map: plank }), false, true); floor.rotation.x = -Math.PI / 2; room.add(floor);
  const backW = mesh(new THREE.PlaneGeometry(16, 9), std('#f2a7c3'), false, true); backW.position.set(0, 4.5, -3.4); room.add(backW);
  const leftW = mesh(new THREE.PlaneGeometry(10, 9), std('#b99ae6'), false, true); leftW.rotation.y = Math.PI / 2; leftW.position.set(-3.6, 4.5, 1.6); room.add(leftW);
  const rightW = mesh(new THREE.PlaneGeometry(10, 9), std('#b99ae6'), false, true); rightW.rotation.y = -Math.PI / 2; rightW.position.set(3.8, 4.5, 1.6); room.add(rightW);
  const skyline = canvasTex(512, 384, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8fc6f5'); gr.addColorStop(1, '#d9ecfb'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = rng(9), cols = ['#f39cb4', '#9cbcf0', '#f6cf78', '#89cfa6', '#bba3ea'];
    for (let x = 0; x < w; x += 46) { const bh = 90 + r() * 200; g.fillStyle = cols[(x / 46) % 5 | 0]; g.fillRect(x, h - bh, 42, bh);
      g.fillStyle = 'rgba(255,255,255,0.85)'; for (let wy = h - bh + 14; wy < h - 10; wy += 26) for (let wx = x + 6; wx < x + 36; wx += 14) g.fillRect(wx, wy, 7, 12); }
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), new THREE.MeshBasicMaterial({ map: skyline })); glass.position.set(1.4, 3.2, -3.38); room.add(glass);
  for (const [w, h, x, y] of [[2.9, 0.16, 1.4, 4.2], [2.9, 0.16, 1.4, 2.2], [0.16, 2.1, 0.0, 3.2], [0.16, 2.1, 2.8, 3.2], [0.1, 1.9, 1.4, 3.2]]) {
    const f = box(w, h, 0.14, '#ffffff', 0.03); f.position.set(x, y, -3.33); room.add(f);
  }
  const sofaM = std('#e8676f');
  const sb = box(3.0, 0.7, 1.2, sofaM, 0.12); sb.position.set(-1.2, 0.45, -2.5); room.add(sb);
  const sr = box(3.0, 1.0, 0.4, sofaM, 0.12); sr.position.set(-1.2, 1.2, -3.0); room.add(sr);
  for (const x of [-2.75, 0.35]) { const a = box(0.4, 1.1, 1.2, sofaM, 0.12); a.position.set(x, 0.55, -2.5); room.add(a); }
  for (const x of [-1.9, -0.5]) { const c = box(1.2, 0.25, 1.0, '#f39aa0', 0.1); c.position.set(x, 0.92, -2.4); room.add(c); }
  const pot = box(0.5, 0.5, 0.5, '#ec8a74', 0.06); pot.position.set(2.9, 0.25, -2.6); room.add(pot);
  for (let i = 0; i < 6; i++) { const l = box(0.13, 0.8, 0.13, '#5aae73', 0.04); l.position.set(2.78 + i * 0.05, 0.85, -2.6); l.rotation.z = -0.6 + i * 0.24; room.add(l); }
  const rug = mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.03, 48), std('#f7c1d3'), false, true); rug.position.set(0.2, 0.015, 0.4); room.add(rug);
  // 狗窝
  const bed = mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.3, 32), std('#9fc8f2'), true, true); bed.position.set(-2.6, 0.15, 0.6); room.add(bed);
  const bedIn = mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.08, 32), std('#fff4e4')); bedIn.position.set(-2.6, 0.28, 0.6); room.add(bedIn);
  // 门 (右墙)
}
// 门 (右墙, 可以打开; 门后是暖光)
const doorPivot = new THREE.Group(); doorPivot.position.set(3.7, 0, -0.45); room.add(doorPivot);
{ const door = box(0.1, 2.6, 1.3, '#f6e3c8', 0.04); door.position.set(0, 1.3, 0.65); doorPivot.add(door);
  const knob = mesh(new THREE.SphereGeometry(0.07, 12, 8), std('#ffd34d', { metalness: 0.4, roughness: 0.4 })); knob.position.set(-0.08, 1.25, 1.15); doorPivot.add(knob);
  for (const [w, h, z, y] of [[0.14, 2.75, -0.5, 1.37], [0.14, 2.75, 0.9, 1.37], [0.14, 0.14, 0.2, 2.68]]) { const f = box(0.12, h, w, '#ffffff', 0.02); f.position.set(3.7, y, z); room.add(f); } }
const doorLight = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.6), new THREE.MeshBasicMaterial({ color: '#fff3d6' }));
doorLight.rotation.y = -Math.PI / 2; doorLight.position.set(3.79, 1.3, 0.2); room.add(doorLight);
// 饭盆 + 狗粮
const bowl = new THREE.Group(); room.add(bowl);
{ const b = mesh(new THREE.CylinderGeometry(0.36, 0.28, 0.2, 32), std('#7fb6ec')); b.position.y = 0.1; bowl.add(b);
  const inn = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 32), std('#5c8fc4')); inn.position.y = 0.2; bowl.add(inn); }
// 牵引绳 (叼在嘴里, 拖到地上)
const leash = new THREE.Group();
{ const pts = [[0.3, -0.05, 0.22], [0.5, -0.4, 0.35], [0.55, -0.9, 0.5], [0.4, -1.3, 0.7], [0.1, -1.38, 0.9]].map(p => new THREE.Vector3(...p));
  const tube = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.3, -0.05, 0.22), ...pts]), 40, 0.035, 8), std('#ff4d6d'));
  leash.add(tube);
  const loop = mesh(new THREE.TorusGeometry(0.18, 0.035, 8, 24), std('#ff4d6d')); loop.position.set(-0.1, -1.4, 1.0); loop.rotation.x = Math.PI / 2; leash.add(loop); }
// 快递箱
const parcel = new THREE.Group(); room.add(parcel);
{ const b = box(0.7, 0.5, 0.55, '#d8a46a', 0.04); b.position.y = 0.25; parcel.add(b);
  const tp = box(0.72, 0.06, 0.12, '#f6e3c8', 0.01); tp.position.y = 0.5; parcel.add(tp); }
// 咬坏的坐垫 + 棉花
const mess = new THREE.Group(); room.add(mess);
const fluffs = [];
{ const hole = box(0.5, 0.06, 0.4, '#b5434d', 0.03); hole.position.set(-0.5, 1.05, -2.3); mess.add(hole);
  const pile = box(0.4, 0.18, 0.3, '#ffffff', 0.08); pile.position.set(-0.45, 1.12, -2.25); mess.add(pile);
  const r = rng(41);
  for (let i = 0; i < 26; i++) { const s = 0.07 + r() * 0.09; const f = mesh(rbox(s, s, s, s * 0.45), std('#ffffff')); f.userData = { x: -1.6 + r() * 3.2, z: -2.0 + r() * 2.6, ph: r() * 10, sp: 0.2 + r() * 0.3 }; mess.add(f); fluffs.push(f); } }
// 零食
const treat = new THREE.Group();
{ const b = box(0.24, 0.1, 0.12, '#c9824e', 0.04); treat.add(b); for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const k = mesh(new THREE.SphereGeometry(0.055, 10, 8), std('#c9824e')); k.position.set(sx * 0.13, sy * 0.04, 0); treat.add(k); } }
// 摔碎的花瓶 + 花
const vase = new THREE.Group(); room.add(vase);
{ const r = rng(77), cols = ['#7fb6ec', '#9fc8f2', '#ffffff'];
  for (let i = 0; i < 7; i++) { const s = box(0.14 + r() * 0.14, 0.05, 0.1 + r() * 0.12, cols[i % 3], 0.02); s.position.set((r() - 0.5) * 0.9, 0.03, (r() - 0.5) * 0.6); s.rotation.y = r() * 3; vase.add(s); }
  const bot = mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.2, 16, 1, true), std('#7fb6ec', { side: THREE.DoubleSide })); bot.rotation.z = Math.PI / 2; bot.position.set(0.1, 0.17, 0.05); vase.add(bot);
  for (let i = 0; i < 3; i++) { const st = box(0.04, 0.5, 0.04, '#5aae73', 0.01); st.position.set(-0.2 + i * 0.2, 0.04, 0.2); st.rotation.set(Math.PI / 2, 0, i - 1); vase.add(st);
    const fl = box(0.16, 0.16, 0.16, ['#ff7aa8', '#ffd34d', '#b28cff'][i], 0.06); fl.position.set(-0.2 + i * 0.2 + (i - 1) * 0.25, 0.09, 0.45); vase.add(fl); } }
const stage = mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.4, 48), std('#ffffff'), false, true); stage.position.y = -0.2; scene.add(stage);

const dog = makeDog(); scene.add(dog.root);
dog.jaw.add(leash);
const cat = makeCat(); scene.add(cat.root);
const person = makePerson(); scene.add(person.root);
{ const hand = new THREE.Group(); hand.position.set(0, person.handY - 0.06, 0.08); person.arms[1].add(hand); hand.add(treat); }
const hearts = []; for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false })); scene.add(s); hearts.push(s); }
const sparkRoom = makeSparkles(90, [14, 8, 10], '#fff4fa', 0.9, 7, 0.12); scene.add(sparkRoom);
const petals = makeSparkles(50, [14, 9, 10], '#ff9fc2', 1.1, 11, -0.35); scene.add(petals);

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
// 说话气泡: (tx,ty) 是尾巴尖指向的点; 气泡在它上方
function bubble(s, tx, ty, age, size = 54, o = {}) {
  if (age < 0 || (o.until !== undefined && age > o.until + 0.25)) return;
  let k = back(age / 0.3);
  if (o.until !== undefined && age > o.until) k *= 1 - (age - o.until) / 0.25;
  const lines = s.split('\n');
  ctx.font = `${size}px ${FONT}`;
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + size * 1.1, h = lines.length * size * 1.22 + size * 0.7;
  const by = ty - (o.gap ?? 40) + 7 * Math.sin(age * 3.2);
  const hud = by > 470 && by - h < 940;   // 避开左边 HUD
  const bx = clamp(tx + (o.dx || 0), (hud ? 330 : 24) + w / 2, W - w / 2 - 24);
  ctx.save(); ctx.translate(tx, by + 0); ctx.scale(k, k); ctx.translate(-tx, -by);
  ctx.fillStyle = o.bg || '#ffffff'; ctx.strokeStyle = o.line || INK; ctx.lineWidth = 7; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.roundRect(bx - w / 2, by - h, w, h, size * 0.5);
  ctx.moveTo(clamp(tx, bx - w / 2 + 40, bx + w / 2 - 80) + 14, by); ctx.lineTo(tx, by + (o.gap ?? 40) - 4); ctx.lineTo(clamp(tx, bx - w / 2 + 40, bx + w / 2 - 80) + 54, by);
  ctx.stroke(); ctx.fill();
  lines.forEach((l, i) => txt(l, bx, by - h + size * 0.35 + size * 0.61 + i * size * 1.22, size, o.fg || INK));
  ctx.restore();
}
const v3 = new THREE.Vector3();
function proj(obj, off = [0, 0, 0]) { v3.set(...off); obj.localToWorld(v3); v3.project(camera); return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H]; }
const dogMouth = () => proj(dog.snout, [0.1, 0.35, 0.3]);
const dogTop = () => { const [x, y] = proj(dog.headPivot, [0.1, 1.4, 0.3]); return [clamp(x, 120, 960), clamp(y, 420, 1000)]; };

function drawHUD(sc, lt, dur) {
  const [, name, s0, s1, , , skill, side, minute] = sc;
  if (!skill) return;
  const v = Math.round(lerp(s0, s1, smooth(clamp(lt / (dur * 0.6)))));
  const x = 34, y = 560;
  txt('已学会人话', x, y, 46, '#fff', INK, 8, 'left');
  txt(name === 'back' ? 'H O M E' : `第 ${minute} 分钟`, x, y + 40, 26, '#fff', INK, 5, 'left');
  const ns = 104 * (0.7 + 0.3 * back(lt / 0.4));
  txt(String(v), x, y + 120, ns, '#fff', INK, 10, 'left');
  ctx.font = `${ns}px ${FONT}`; const w = ctx.measureText(String(v)).width;
  txt('句', x + w + 10, y + 140, 46, '#fff', INK, 8, 'left');
  [`新技能: ${skill}`, `副作用: ${side}`].forEach((l, i) => txt(l, x, y + 200 + i * 42, 32, '#fff', INK, 7, 'left'));
  const isBack = name === 'back';
  ctx.fillStyle = isBack ? MINT : '#e8587e'; ctx.beginPath(); ctx.roundRect(x, y + 290, 240, 48, 24); ctx.fill();
  txt(isBack ? '只说这一句' : `+${s1 - s0} 句人话`, x + 120, y + 315, 30, '#fff');
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
  const start = STARTS[IDX.m45], end = STARTS[IDX.why] + 0.8;
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

// ------------------------------------------------------------------ 分镜
// 每段拆成 2~3 个镜头: 台词镜头 → 反应镜头 → 包袱特写. 镜头始终在狗与主人连线的同一侧 (180° 规则),
// 主体放在画面中右 (左边留给 HUD, 下面留给字幕). shot = { t: 开始, p: [起点, 终点], g: [看向起点, 终点], fov }
let labels = [];
const L = fn => labels.push(fn);
const drop = lt => (1 - bounce(lt / 0.7)) * 5;
const talkIn = (lt, a, b) => (lt > a && lt < b ? 1 : 0);
const W3 = (obj, off) => { obj.updateMatrixWorld(true); return obj.localToWorld(new THREE.Vector3(...off)).toArray(); };
const S = (t, p0, p1, g0, g1, fov = 30) => ({ t, p: [p0, p1 || p0], g: [g0, g1 || g0], fov });
// C: 以焦点为中心, yaw 水平角 (0 = 从 +z 看), pitch 俯仰, 距离 d0→d1; off>0 把主体推到画面右边, lift>0 让主体往下 (头顶留给气泡)
function C(t, f, yaw, pitch, d0, d1, o = {}) {
  const [y0, y1] = Array.isArray(yaw) ? yaw : [yaw, yaw], [q0, q1] = Array.isArray(pitch) ? pitch : [pitch, pitch];
  const off = o.off || 0, lift = o.lift || 0;
  const mk = (yw, pt, d) => {
    const g = [f[0] - Math.cos(yw) * off, f[1] + lift, f[2] + Math.sin(yw) * off];
    return [[g[0] + d * Math.sin(yw) * Math.cos(pt), g[1] + d * Math.sin(pt), g[2] + d * Math.cos(yw) * Math.cos(pt)], g];
  };
  const [p0, g0] = mk(y0, q0, d0), [p1, g1] = mk(y1, q1, d1);
  return { t, p: [p0, p1], g: [g0, g1], fov: o.fov || 30 };
}

function setup(name, lt, dur, gt) {
  room.visible = true; stage.visible = false; dog.root.visible = false; cat.root.visible = false; person.root.visible = false;
  bowl.visible = leash.visible = parcel.visible = mess.visible = treat.visible = vase.visible = false;
  hearts.forEach(h => h.visible = false);
  dog.root.position.set(0, 0, 0); dog.root.rotation.set(0, 0, 0); dog.root.scale.setScalar(0.85);
  cat.root.position.set(0, 0, 0); cat.root.rotation.set(0, 0, 0); cat.root.scale.setScalar(1);
  person.root.position.set(0, 0, 0); person.root.rotation.set(0, 0, 0); person.root.scale.setScalar(1);
  doorPivot.rotation.y = 0; doorLight.visible = false;
  hemi.color.set('#fff2f6'); hemi.intensity = 1.5; sun.intensity = 2.3;
  setSky('#79b6f0', '#cfe6fb');
  let shots = [S(0, [0, 2.4, 11.2], null, [0, 1.35, 0])];
  switch (name) {
    case 'title': {   // 建立镜头: 摇臂从高处落下, 一人一狗的客厅
      dog.root.position.set(0.75, 0, 0.6); dog.root.rotation.y = -0.4;
      dog.update(gt, { hop: 1, wag: 1, perk: 0.5, yaw: 0.35 * Math.sin(lt * 2), tilt: 0.18 * Math.sin(lt * 2.6) });
      person.root.position.set(-0.75, 0, 0.3); person.root.rotation.y = 0.4; person.update(lt, { wave: true, smile: true });
      shots = [C(0, [0, 1.3, 0.4], 0, [0.32, 0.1], 14.5, 11.5)];
      break;
    }
    case 'm1': {   // A 仰拍狗中近景说“饿。” → B 过狗肩看主人吃惊
      dog.root.position.set(-0.6, 0, 0.7); dog.root.rotation.y = 0.75;
      person.root.position.set(1.3, 0, 0.3); person.root.rotation.y = -1.25;
      bowl.visible = true; bowl.position.set(0.15, 0, 1.6); bowl.rotation.z = lt > 1.2 && lt < 1.7 ? 0.08 * Math.sin(lt * 30) : 0;
      const B2 = lt >= 1.7;
      dog.update(gt, { dropY: drop(lt), talk: talkIn(lt, 0.8, 1.3), yaw: B2 ? 0 : -0.5, pitch: -0.08, wag: 0.5, look: B2 ? 0.5 : -0.8 });
      person.update(lt, { shock: lt > 1.75, headYaw: 0.1, look: -0.5 });
      const dh = W3(dog.root, [0, 1.75, 0.45]);
      const gh = W3(person.root, [0, 1.85, 0.3]);
      shots = [C(0, dh, 0.45, -0.04, 6.0, 5.4, { lift: 0.3 }), C(1.7, gh, -0.45, 0.06, 6.2, 5.7, { lift: 0.1, off: 0.15 })];
      if (!B2) {
        L(() => { const [x, y] = dogTop(); bubble('饿。', x, y, lt - 0.8, 88); });
        L(() => { const [x, y] = proj(bowl, [0, 0.3, 0]); pill('饭盆：空的', clamp(x, 420, 900), y + 30, 40, ORANGE, '#fff', lt - 1.15); });
      } else L(() => { const [x, y] = proj(person.head, [0, 1.3, 0]); pop('它…说话了？！', clamp(x, 360, 800), Math.max(y, 400), 66, PINK, lt - 1.85); });
      break;
    }
    case 'm2': {   // A 横移跟拍: 狗叼着牵引绳蹦过来 → B 尾巴特写
      const k = smooth(clamp(lt / 1.6));
      dog.root.position.set(lerp(-1.9, -0.4, k), 0, 0.8); dog.root.rotation.y = 1.15;
      leash.visible = true;
      dog.update(gt, { dropY: drop(lt), hop: 1, wag: 1, perk: 0.6, talk: talkIn(lt, 0.7, 1.6), yaw: -0.55, look: -0.6 });
      person.root.position.set(1.4, 0, 0.3); person.root.rotation.y = -1.3; person.update(lt, { headYaw: 0.2, smile: lt > 2.4 });
      const dx = dog.root.position.x;
      const tail = W3(dog.bodyPivot, [0, 1.5, -1.25]);
      const dh = W3(dog.root, [0, 1.75, 0.45]);
      shots = [C(0, dh, 0.3, 0.06, 7.6, 7.2, { lift: 0.25 }), C(2.0, W3(dog.root, [0, 1.1, -0.5]), 0.3, 0.12, 8.6, 8.0, { lift: 0.1 })];
      if (lt < 2.0) L(() => { const [x, y] = dogTop(); bubble('出去玩！\n现在！', x, y, lt - 0.7, 66); });
      else L(() => pop('摇摇摇摇摇', 640, 640 + 12 * Math.sin(gt * 20), 72, ORANGE, lt - 2.1));
      break;
    }
    case 'm5': {   // A 门的特写: 咚咚咚 → B 狗猛回头报告
      doorPivot.rotation.y = lt < 1.0 ? 0.015 * Math.sin(lt * 60) * (lt % 0.33 < 0.12 ? 1 : 0) : 0;
      dog.root.position.set(1.1, 0, 1.4); dog.root.rotation.y = 0.9;
      const turned = lt > 1.15;
      dog.update(gt, { dropY: lt < 1 ? 0 : 0, perk: 1, talk: talkIn(lt, 1.25, 2.6), yaw: turned ? -1.1 : 0.5, pitch: -0.1, look: turned ? -1 : 1, wag: 0.8, eyes: 'big' });
      person.root.position.set(-0.6, 0, -1.3); person.root.rotation.y = 0.55; person.update(lt, { headYaw: 0.3, shock: lt > 2.6 });
      parcel.visible = true; parcel.position.set(2.7, (1 - bounce(clamp((lt - 2.0) / 0.7))) * 4, 1.4); parcel.rotation.y = -0.4;
      shots = [C(0, [3.7, 1.35, 0.2], -0.75, 0.05, 5.4, 4.9), C(1.0, [0.6, 1.3, -0.1], 0.12, 0.1, 9.0, 8.4, { lift: 0.1 })];
      if (lt < 1.0) L(() => pop('咚 咚 咚', 600, 700 + 10 * Math.sin(gt * 30), 84, ORANGE, lt - 0.15));
      else {
        L(() => { const [x, y] = dogTop(); bubble('门外有人！\n是快递！快开门！', x - 120, y, lt - 1.25, 52); });
        L(() => { const [x, y] = proj(parcel, [0, 0.8, 0]); pill('真的是快递', clamp(x, 420, 900), y, 38, SKY, '#fff', lt - 2.5); });
      }
      break;
    }
    case 'm10': {  // A 案发现场全景 → B 狗心虚否认 → C 推到嘴边: 全是棉花
      mess.visible = true;
      fluffs.forEach(f => { const u = f.userData; f.position.set(u.x + 0.2 * Math.sin(gt * u.sp * 3 + u.ph), 0.4 + ((gt * u.sp + u.ph) % 2.2), u.z); f.rotation.set(gt * u.sp * 2, u.ph, gt * u.sp); });
      dog.root.position.set(0.1, 0, 0.7); dog.root.rotation.y = 0.05;
      dog.update(gt, { dropY: lt < 1.0 ? 0 : 0, fluff: true, droop: lt > 1.0 ? 1 : 0, eyes: lt > 1.0 ? 'half' : 'normal', side: Math.sin(lt * 3) > 0 ? 1 : -1,
                       talk: talkIn(lt, 1.15, 2.1), yaw: -0.3 + 0.15 * Math.sin(lt * 4), tilt: -0.1, wag: 0.15 });
      person.root.position.set(1.6, 0, -0.6); person.root.rotation.y = -0.7; person.update(lt, { headYaw: -0.2 });
      const mz = W3(dog.snout, [0, 0.1, 0.3]);
      const dh = W3(dog.root, [0, 1.75, 0.45]);
      shots = [C(0, [-0.6, 1.0, -2.3], 0.3, 0.45, 4.6, 4.1), C(1.0, dh, 0.12, 0.05, 6.4, 5.9, { lift: 0.3 }), C(2.3, mz, 0.1, 0.05, 3.3, 2.9)];
      if (lt < 1.0) L(() => pill('沙发：卒', 640, 620, 52, 'rgba(66,38,63,0.85)', '#fff', lt - 0.3));
      else if (lt < 2.3) L(() => { const [x, y] = dogTop(); bubble('沙发不是我咬的', x, y, lt - 1.15, 58); });
      else { L(() => pill('嘴边：棉花', 640, 1250, 50, PINK, '#fff', lt - 2.4)); L(() => pop('证据确凿', 660, 560, 76, LAV, lt - 2.7)); }
      break;
    }
    case 'm20': {  // A 过主人肩拍狗开条件 → B 反打主人 “一块！” → 狗坐下 “成交”
      dog.root.position.set(-0.6, 0, 0.9); dog.root.rotation.y = 1.0;
      person.root.position.set(1.2, 0, 0.3); person.root.rotation.y = -1.35;
      const sit = smooth((lt - 2.6) / 0.35);
      dog.update(gt, { dropY: drop(lt), talk: talkIn(lt, 0.7, 1.8), yaw: lt < 2.0 ? -0.15 : 0, pitch: -0.15, tilt: 0.2 * Math.sin(lt * 2), look: 0.2, lookY: -0.5, wag: 0.6, sit });
      person.update(lt, { reach: true, headYaw: 0, shock: lt > 1.2 && lt < 2.0, smile: lt > 2.8, look: -0.6 });
      treat.visible = true; treat.rotation.set(0, gt * 1.5, 0);
      const dh = W3(dog.root, [0, 1.75, 0.45]);
      const gh = W3(person.root, [0, 1.85, 0.3]);
      shots = [C(0, dh, 1.25, 0.15, 6.4, 6.0, { lift: 0.3, off: -0.2 }), C(2.0, gh, -0.45, 0.06, 6.2, 5.7, { lift: 0.1, off: 0.15 })];
      if (lt < 2.0) L(() => { const [x, y] = dogTop(); bubble('两块零食\n我就坐下', x, y, lt - 0.7, 62); });
      else {
        L(() => { const [x, y] = proj(person.head, [0, 1.3, 0]); pop('一块！', clamp(x, 400, 860), Math.max(y, 420), 76, ORANGE, lt - 2.1); });
        L(() => pill('狗：成交', 700, 1330, 56, MINT, '#fff', lt - 2.85));
      }
      break;
    }
    case 'm30': {  // A 二人镜头: 狗对着镜头(主人)告状 → B 猫的反应特写 → C 证据插入
      vase.visible = true; vase.position.set(0.25, 0, 1.6);
      dog.root.position.set(-0.4, 0, 0.6); dog.root.rotation.y = 0.35;
      dog.update(gt, { dropY: drop(lt), talk: talkIn(lt, 0.6, 1.6), yaw: lt < 1.6 ? -0.25 : 0.5, perk: 0.5, wag: 0.5, look: lt < 1.6 ? 0 : 1 });
      cat.root.position.set(0.85, 0, 0.45); cat.root.rotation.y = -0.55; cat.root.scale.setScalar(0.85);
      const accused = lt > 1.6;
      cat.update(gt, { ears: accused ? 1 : 0, mouth: accused ? 'o' : 'w', yaw: accused ? 0.35 : -0.2, eyes: lt > 2.6 ? 'half' : 'normal', look: accused ? 0 : -1, tails: { mode: 'single' } });
      const ch = W3(cat.headPivot, [0, 0.45, 0.4]);
      shots = [C(0, [0.25, 1.05, 0.6], 0.05, 0.12, 9.6, 9.0, { lift: 0.15, off: 0.15 }), C(1.6, ch, -0.3, 0.05, 4.4, 4.0, { lift: 0.25 }), C(2.6, [0.25, 0.25, 1.6], 0.2, 0.42, 3.4, 3.0)];
      if (lt < 1.6) L(() => { const [x, y] = dogTop(); bubble('花瓶是猫推倒的！', x + 80, y, lt - 0.6, 54); });
      else if (lt < 2.6) L(() => pop('喵？！', 660, 560, 110, PINK, lt - 1.7));
      else L(() => pill('案发现场', 640, 1240, 48, 'rgba(66,38,63,0.85)', '#fff', lt - 2.65));
      break;
    }
    case 'm45': {  // 高潮: 狗 / 主人 近景快切, 最后拉成二人全景, 主人捂耳朵
      dog.root.position.set(-0.35, 0, 0.7); dog.root.rotation.y = 0.8;
      person.root.position.set(1.15, 0, 0.3); person.root.rotation.y = -1.3;
      dog.update(gt, { talk: 1, hop: 0.5, wag: 1, perk: 0.8, yaw: -0.2 + 0.2 * Math.sin(lt * 5), tilt: 0.15 * Math.sin(lt * 4), eyes: 'big', look: 0.6 });
      person.update(lt, { shock: true, blow: true, headYaw: 0.05, cover: lt > 2.5 });
      const dh = W3(dog.root, [0, 1.75, 0.45]);
      const gh = W3(person.root, [0, 1.85, 0.3]);
      const A = C(0, dh, 0.5, 0.0, 5.2, 4.8, { lift: 0.2 }), B = C(0, gh, -0.45, 0.03, 5.4, 5.0, { lift: 0.2, off: 0.15 });
      shots = [0, 0.6, 1.1, 1.55, 1.95].map((t, i) => ({ ...(i % 2 ? B : A), t }));
      shots.push(C(2.35, [0.35, 1.3, 0.5], -0.2, 0.12, 9.0, 10.5, { lift: 0.1, off: 0.2 }));
      const lines = [['你去哪了？', 640, 640], ['跟谁玩了？', 880, 820], ['身上怎么有\n别的狗的味道？', 620, 1060], ['明天还出门吗？', 660, 1230],
                     ['带我去！', 330, 1330], ['我数了，你出门\n整整八个小时！', 780, 1420]];
      lines.forEach(([s, x, y], i) => L(() => bubble(s, x, y, lt - 0.2 - i * 0.45, 46, { gap: 30 })));
      break;
    }
    case 'why': {  // 科普: 紫色舞台, 镜头慢慢环绕
      room.visible = false; stage.visible = true; stage.material.color.set('#c7b2f0'); setSky('#a98ae0', '#d8c6f6');
      dog.root.scale.setScalar(1); dog.root.rotation.y = 0.3 * Math.sin(lt * 0.7);
      dog.update(gt, { dropY: drop(lt), yaw: -0.4 * Math.sin(lt * 1.3), tilt: 0.25 * Math.sin(lt * 1.9), look: Math.sin(lt * 1.3), perk: 0.3, wag: 0.5 });
      ['边牧Chaser记住了1000多个玩具名', '狗脑会同时听“词义”和“语气”', '但它的喉咙和舌头说不出人话', '所以它用尾巴、耳朵和叫声说话']
        .forEach((s, i) => L(() => pill(s, 540, 290 + i * 116, 38, '#ffffff', INK, lt - 0.3 - i * 0.7)));
      const a0 = -0.35, a1 = 0.3;
      shots = [S(0, [9.2 * Math.sin(a0), 2.1, 9.2 * Math.cos(a0)], [9.2 * Math.sin(a1), 2.1, 9.2 * Math.cos(a1)], [0, 1.3, 0])];
      break;
    }
    case 'back': {  // A 狗守在门口的背影, 门开了透出暖光 → B 主人视角: 狗的脸亮起来 → C 暖色二人全景
      hemi.color.set('#ffe6d6');
      const open = smooth((lt - 0.35) / 0.6);
      doorPivot.rotation.y = -1.25 * open; doorLight.visible = open > 0.01;
      const walkIn = smooth(clamp((lt - 0.6) / 1.6));
      person.root.position.set(lerp(4.3, 2.7, walkIn), 0, lerp(0.25, 0.7, walkIn)); person.root.rotation.y = -Math.PI / 2;
      person.update(lt, { walk: walkIn > 0 && walkIn < 1, smile: true, reach: lt > 3.0, headYaw: 0, look: 0 });
      const run = smooth(clamp((lt - 2.6) / 0.6));
      dog.root.position.set(lerp(0.2, 1.0, run), 0, 1.0); dog.root.rotation.y = Math.PI / 2 - 0.15;
      dog.update(gt, { eyes: lt > 2.0 ? 'happy' : 'big', sit: 1 - smooth((lt - 0.5) / 0.4), walk: run > 0 && run < 1 ? 1 : 0, hop: lt > 3.2 ? 0.6 : 0,
                       wag: lt > 0.6 ? 1 : 0.1, perk: lt > 0.6 ? 0.9 : 0, droop: lt < 0.5 ? 0.5 : 0, yaw: 0, pitch: -0.15, talk: talkIn(lt, 1.9, 2.6) });
      const dh = W3(dog.root, [0, 1.75, 0.45]);
      shots = [C(0, [3.6, 1.3, 0.3], -1.2, 0.12, 7.2, 6.7), C(1.3, dh, 0.75, 0.08, 5.0, 4.6, { lift: 0.3 }), C(2.6, [1.55, 1.3, 0.95], 0.9, 0.12, 7.0, 6.2, { lift: 0.15, off: 0.45 })];
      if (lt < 1.3) L(() => pill('它在门口等了一整天', 640, 520, 46, 'rgba(66,38,63,0.85)', '#fff', lt - 0.1));
      if (lt >= 1.3) {
        [['你去哪了？', 300], ['两块零食', 520], ['沙发不是我咬的', 760], ['门外有人！', 420], ['花瓶是猫推的', 680]].forEach(([s, x], i) => L(() => {
          const u = lt - 1.3 - i * 0.1, a = clamp(1 - u / 1.1); if (a <= 0 || u < 0) return;
          ctx.globalAlpha = a; pill(s, x, 1250 - u * 520 - i * 60, 36, 'rgba(255,255,255,0.9)', INK, u + 0.3); ctx.globalAlpha = 1;
        }));
        L(() => { const [x, y] = dogTop(); bubble('你回来啦！', x, y, lt - 1.95, 80, { bg: '#fff3f7', line: PINK, fg: PINK }); });
      }
      if (lt > 2.6) hearts.forEach((h, i) => { h.visible = true; const u = ((lt - 2.6) * 0.45 + i / 14) % 1; h.position.set(1.8 + Math.sin(i * 2.1) * 1.3 + 0.2 * Math.sin(lt * 2 + i), 1 + u * 3.2, 0.6 + Math.cos(i) * 0.6); h.scale.setScalar(0.32 * Math.sin(Math.PI * u) + 0.01); });
      break;
    }
    case 'end': {  // 粉色舞台: 一人一狗贴在一起
      room.visible = false; stage.visible = true; stage.material.color.set('#f9b6cd'); setSky('#f597bc', '#ffd0e0');
      dog.root.scale.setScalar(0.72); dog.root.position.set(0.55, 0, 0.3); dog.root.rotation.y = -0.35 + 0.15 * Math.sin(lt * 1.2);
      dog.update(gt, { hop: 0.5, eyes: 'happy', wag: 1, perk: 0.5, yaw: -0.3 + 0.2 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.5) });
      person.root.scale.setScalar(0.8); person.root.position.set(-0.6, 0, 0.1); person.root.rotation.y = 0.35;
      person.update(lt, { smile: true, wave: true, headTilt: 0.12 });
      hearts.forEach((h, i) => { h.visible = true; const u = (lt * 0.4 + i / 14) % 1; h.position.set(Math.sin(i * 2.1) * 1.8, 0.6 + u * 3.0, 0.3 + Math.cos(i) * 0.4); h.scale.setScalar(0.25 * Math.sin(Math.PI * u) + 0.01); });
      shots = [S(0, [0, 1.5, 8.8], [0, 1.5, 8.0], [0, 2.15, 0])];
      break;
    }
  }
  let k = 0; while (k < shots.length - 1 && lt >= shots[k + 1].t) k++;
  const s = shots[k], end = k < shots.length - 1 ? shots[k + 1].t : dur, st = lt - s.t, u = clamp(st / (end - s.t));
  camera.fov = s.fov; camera.updateProjectionMatrix();
  return { camPos: s.p[0].map((v, j) => lerp(v, s.p[1][j], u)), camTgt: s.g[0].map((v, j) => lerp(v, s.g[1][j], u)), shot: k, st, sd: end - s.t };
}

const SHAKE = { m45: 0.025 };
window.renderAt = (gt) => {
  let i = SCENES.length - 1; while (i > 0 && gt < STARTS[i]) i--;
  const sc = SCENES[i], name = sc[1], dur = sc[0], lt = gt - STARTS[i];
  labels = [];
  const { camPos, camTgt, shot, st, sd } = setup(name, lt, dur, gt);
  // 镜头: 每段第一镜冲进去回弹, 段内切镜轻一点的推进; 之后缓慢推 + 手持晃动
  const push = 1 - 0.04 * (st / sd) - (shot === 0 ? 0.14 : 0.06) * (1 - back(st / 0.4));
  const sh = SHAKE[name] || 0;
  const dir = new THREE.Vector3(...camPos).sub(new THREE.Vector3(...camTgt));
  const dist = dir.length();
  const pos = new THREE.Vector3(...camTgt).add(dir.multiplyScalar(push));
  const amp = 0.014 * dist;
  pos.x += amp * Math.sin(lt * 0.9 + i) + sh * Math.sin(gt * 53); pos.y += amp * 0.5 * Math.sin(lt * 1.3 + i * 2) + sh * Math.cos(gt * 47);
  camera.position.copy(pos); camera.lookAt(...camTgt);
  camera.updateMatrixWorld();
  sparkRoom.material.uniforms.uTime.value = gt; petals.material.uniforms.uTime.value = gt;
  composer.render();
  ctx.drawImage(renderer.domElement, 0, 0);
  labels.forEach(f => f());
  if (name === 'title') {
    const a = back(lt / 0.5);
    ctx.save(); ctx.translate(540, 560); ctx.scale(a, a);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-410, -145, 820, 290, 36); ctx.fill();
    txt('假如你家狗', 0, -55, 72, INK); txt('每分钟学一句人话', 0, 50, 82, ORANGE); ctx.restore();
    txt('会发生什么？', 540, 780, 76, '#fff', INK, 12);
  }
  if (name === 'end') {
    const a = smooth(lt / 0.8);
    ctx.globalAlpha = a;
    txt('它每天都在跟你说话', 540, 470, 66, '#ffffff', '#c23f74', 12);
    txt('只是用尾巴说', 540, 565, 66, '#ffffff', '#c23f74', 12);
    txt('你家狗最想对你说什么？', 540, 685, 56, INK, '#ffffff', 10);
    ctx.globalAlpha = clamp((lt - 1) / 0.4);
    txt('评论区告诉我 ↓', 540, 790, 58, '#a2285e', '#ffffff', 10);
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
