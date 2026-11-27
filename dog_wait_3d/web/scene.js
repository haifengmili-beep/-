// 《假如你家的狗每分钟等你一次》 3D 版 — three.js 场景 + 2D 字幕/仪表盘层. window.renderAt(t) 决定性渲染一帧.
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
// [时长, 名字, 分钟起, 分钟止, 字幕, 英文, 狗狗状态, 副作用]
const SCENES = [
  [3.0, 'title', 0, 0, '', '', '', ''],
  [3.2, 'm1', 0, 1, '第1分钟：门一关，它就开始等\n耳朵竖着，盯着门', 'Minute 1: The door shuts and the waiting begins. Ears up, eyes on the door.', '盯着门', '无'],
  [3.2, 'm10', 2, 10, '第10分钟：已经等了10次\n每个脚步声都像是你', 'Minute 10: Ten waits already. Every footstep sounds like you.', '竖耳朵听', '空欢喜10次'],
  [3.0, 'm30', 12, 30, '第30分钟：等了30次\n叼来你的拖鞋，闻闻你的味道', 'Minute 30: Thirty waits. It fetches your slipper just to smell you.', '抱着拖鞋', '拖鞋湿了'],
  [3.2, 'h1', 32, 60, '第1小时：等了60次\n在门口来回踱步', 'Hour 1: Sixty waits. Pacing back and forth by the door.', '来回踱步', '地板磨亮了'],
  [3.2, 'h3', 70, 180, '第3小时：等了180次\n趴在窗边看每一个路人', 'Hour 3: 180 waits. Checking every passer-by from the window.', '盯着窗外', '路人都不是你'],
  [3.4, 'h5', 190, 300, '第5小时：等了300次\n连猫都看不下去了', "Hour 5: 300 waits. Even the cat can't watch anymore.", '小声呜呜', '猫来劝它'],
  [3.6, 'h8', 310, 480, '第8小时：等了480次\n门口的垫子坐出了狗的形状', 'Hour 8: 480 waits. The doormat now has a dog-shaped dent.', '对着门嚎', '邻居都听见了'],
  [3.8, 'open', 480, 540, '第9小时：门开了！\n540次等待，这一秒全值了', 'Hour 9: The door opens! 540 waits, all worth this one second.', '等到了！', '尾巴快摇断了'],
  [4.8, 'why', 0, 0, '其实狗狗看不懂钟表\n但它真的感觉得到你走了多久', "Dogs can't read clocks, but they can sense how long you've been gone.", '', ''],
  [4.8, 'back', 0, 0, '你只是出门了一天\n它却用一整天在等你', 'You were only out for a day. It spent the whole day waiting for you.', '在你身边', '无'],
  [3.6, 'end', 0, 0, '', '', '', ''],
];
const STARTS = []; { let a = 0; for (const s of SCENES) { STARTS.push(a); a += s[0]; } }
const IDX = Object.fromEntries(SCENES.map((s, i) => [s[1], i]));
const DANMAKU = ['破防了', '我现在就回家', '狗狗：你终于回来了！', '心疼', 'awsl', '+1', '前方高能！', '540次！', '尾巴摇成螺旋桨',
  '猫：我早说了', '想我家狗了', '下班马上回！', '每次开门都像过年', '哭了', '耳朵会动！', '好乖', '呜呜呜'];
const INK = '#42263f', PINK = '#e8588a', MINT = '#2ea47c', SKY = '#468cd6', LAV = '#8464c4', ORANGE = '#ee7a3c';

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 900);
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

// ------------------------------------------------------------------ 客厅 (粉紫墙, 焦糖木地板, 大门, 挂钟, 窗外小城)
const room = new THREE.Group(); scene.add(room);
let doorHinge, clockH, clockM, matDent, shinyPath;
// 窗外: 马卡龙小城 + 走过的路人 (每帧重画)
const skyline = canvasTex(512, 384, () => {});
function drawSkyline(tt, walkers, evening = 0) {
  const g = skyline.userData.g, w = 512, h = 384;
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, evening ? '#f59a8a' : '#8fc6f5'); gr.addColorStop(1, evening ? '#ffd9a8' : '#d9ecfb'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const r = rng(9), cols = ['#f39cb4', '#9cbcf0', '#f6cf78', '#89cfa6', '#bba3ea'];
  for (let x = 0; x < w; x += 46) { const bh = 90 + r() * 170; g.fillStyle = cols[(x / 46) % 5 | 0]; g.fillRect(x, h - 60 - bh, 42, bh);
    g.fillStyle = evening ? 'rgba(255,236,160,0.95)' : 'rgba(255,255,255,0.85)'; for (let wy = h - 60 - bh + 14; wy < h - 70; wy += 26) for (let wx = x + 6; wx < x + 36; wx += 14) g.fillRect(wx, wy, 7, 12); }
  g.fillStyle = '#8ccb80'; g.fillRect(0, h - 60, w, 60); g.fillStyle = '#c9c4d8'; g.fillRect(0, h - 40, w, 22);
  if (walkers) {
    const cc = ['#e8588a', '#468cd6', '#f2b13a', '#2ea47c', '#8464c4', '#ee7a3c'];
    for (let i = 0; i < 6; i++) {
      const x = ((tt * (60 + i * 14) + i * 97) % 620) - 60, y = h - 44, bob = Math.abs(Math.sin(tt * 8 + i)) * 4;
      g.fillStyle = cc[i]; g.fillRect(x - 9, y - 40 - bob, 18, 28);
      g.fillStyle = '#f7d3bd'; g.fillRect(x - 8, y - 58 - bob, 16, 16);
      g.fillStyle = '#4a3040'; g.fillRect(x - 7, y - 12 - bob, 5, 12 + bob); g.fillRect(x + 2, y - 12, 5, 12);
    }
  }
  skyline.needsUpdate = true;
}
drawSkyline(0, false);
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
  // 窗户
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), new THREE.MeshBasicMaterial({ map: skyline })); glass.position.set(1.6, 3.2, -3.38); room.add(glass);
  for (const [w, h, x, y] of [[2.9, 0.16, 1.6, 4.2], [2.9, 0.16, 1.6, 2.2], [0.16, 2.1, 0.2, 3.2], [0.16, 2.1, 3.0, 3.2], [0.1, 1.9, 1.6, 3.2]]) {
    const f = box(w, h, 0.14, '#ffffff', 0.03); f.position.set(x, y, -3.33); room.add(f);
  }
  // 大门 (铰链在左边, 向屋里打开) + 门后暖光
  const light = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.6), new THREE.MeshBasicMaterial({ color: '#fff4c8' })); light.position.set(-1.2, 1.3, -3.39); room.add(light);
  for (const [w, h, x, y] of [[0.14, 2.75, -1.92, 1.375], [0.14, 2.75, -0.48, 1.375], [1.58, 0.16, -1.2, 2.72]]) {
    const f = box(w, h, 0.18, '#ffffff', 0.03); f.position.set(x, y, -3.32); room.add(f);
  }
  doorHinge = new THREE.Group(); doorHinge.position.set(-1.85, 0, -3.33); room.add(doorHinge);
  const door = box(1.3, 2.6, 0.1, '#e9b98c', 0.03); door.position.set(0.65, 1.3, 0); doorHinge.add(door);
  for (const y of [0.75, 1.9]) { const pnl = box(0.9, 0.8, 0.04, '#f3cba4', 0.03); pnl.position.set(0.65, y, 0.06); doorHinge.add(pnl); }
  const knob = mesh(new THREE.SphereGeometry(0.07, 12, 8), std('#f2c14e', { metalness: 0.4, roughness: 0.4 })); knob.position.set(1.12, 1.25, 0.1); doorHinge.add(knob);
  const heartSign = box(0.32, 0.28, 0.04, '#ff7aa6', 0.08); heartSign.position.set(0.65, 2.35, 0.08); doorHinge.add(heartSign);
  // 门口地垫 + 坐出来的狗形印子 + 磨亮的路
  const matTex = canvasTex(256, 160, (g, w, h) => {
    g.fillStyle = '#f48fb1'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
    g.fillStyle = '#ffffff'; g.font = `bold 54px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HOME', w / 2, h / 2 + 2);
  });
  const mat = mesh(rbox(1.5, 0.04, 0.9, 0.015), std('#ffffff', { map: matTex }), false, true); mat.position.set(-1.2, 0.02, -2.5); room.add(mat);
  const dentTex = canvasTex(256, 256, (g) => {
    g.fillStyle = 'rgba(150,40,90,0.75)';
    g.beginPath(); g.ellipse(128, 150, 70, 80, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(128, 70, 50, 44, 0, 0, 7); g.fill();
    for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(128 + sx * 52, 70, 16, 34, sx * 0.3, 0, 7); g.fill(); }
    g.beginPath(); g.ellipse(208, 210, 34, 12, -0.5, 0, 7); g.fill();
  });
  matDent = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshBasicMaterial({ map: dentTex, transparent: true, depthWrite: false }));
  matDent.rotation.x = -Math.PI / 2; matDent.position.set(-1.2, 0.045, -2.5); room.add(matDent);
  shinyPath = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.7), new THREE.MeshBasicMaterial({ color: '#fff3dd', transparent: true, opacity: 0.4, depthWrite: false }));
  shinyPath.rotation.x = -Math.PI / 2; shinyPath.position.set(-0.3, 0.012, -1.4); room.add(shinyPath);
  // 挂钟 (在门上方)
  const clock = new THREE.Group(); clock.position.set(-1.2, 3.55, -3.33); room.add(clock);
  const rim = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 32), std('#8464c4')); rim.rotation.x = Math.PI / 2; clock.add(rim);
  const faceC = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.11, 32), std('#ffffff')); faceC.rotation.x = Math.PI / 2; clock.add(faceC);
  for (let i = 0; i < 12; i++) { const tk = box(0.04, 0.08, 0.02, '#42263f', 0.01); const a = i / 12 * Math.PI * 2; tk.position.set(Math.sin(a) * 0.29, Math.cos(a) * 0.29, 0.06); tk.rotation.z = -a; clock.add(tk); }
  clockH = new THREE.Group(); clockH.position.z = 0.07; clock.add(clockH); { const hh = box(0.05, 0.2, 0.02, '#42263f', 0.01); hh.position.y = 0.09; clockH.add(hh); }
  clockM = new THREE.Group(); clockM.position.z = 0.08; clock.add(clockM); { const mm = box(0.035, 0.29, 0.02, '#e8588a', 0.01); mm.position.y = 0.13; clockM.add(mm); }
  // 猫爬架 (窗边)
  for (const x of [2.3, 3.1]) { const pp = mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.0, 16), std('#b98252')); pp.position.set(x, 1.0, -2.6); room.add(pp); }
  const plat = box(1.6, 0.18, 1.1, '#c9b3f0', 0.05); plat.position.set(2.7, 2.05, -2.6); room.add(plat);
  const base = box(1.6, 0.18, 1.1, '#c9b3f0', 0.05); base.position.set(2.7, 0.09, -2.6); room.add(base);
  // 柜子 + 绿植 + 地毯 + 狗窝
  const cab = box(1.0, 1.1, 0.8, '#a98ad8', 0.06); cab.position.set(-3.0, 0.55, -2.8); room.add(cab);
  const pot = box(0.45, 0.45, 0.45, '#ec8a74', 0.06); pot.position.set(-3.0, 1.33, -2.8); room.add(pot);
  for (let i = 0; i < 5; i++) { const l = box(0.12, 0.6, 0.12, '#5aae73', 0.04); l.position.set(-3.12 + i * 0.06, 1.85, -2.8); l.rotation.z = -0.5 + i * 0.25; room.add(l); }
  const rug = mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.03, 48), std('#f7c1d3'), false, true); rug.position.set(0.5, 0.015, 0.4); room.add(rug);
}
const clockAt = (minutes) => { const h = 9 + minutes / 60; clockH.rotation.z = -(h % 12) / 12 * Math.PI * 2; clockM.rotation.z = -(minutes % 60) / 60 * Math.PI * 2; };
const curtain = mesh(new THREE.PlaneGeometry(0.8, 2.2, 8, 8), std('#ec86ad', { side: THREE.DoubleSide }), false, false);
curtain.position.set(3.35, 3.2, -3.25); room.add(curtain);
const curtainBase = curtain.geometry.attributes.position.array.slice();
// 地上的另一只拖鞋
const slipper2 = new THREE.Group(); scene.add(slipper2);
{ const a = mesh(rbox(0.32, 0.1, 0.62, 0.05), std('#ff9ec0')); slipper2.add(a); const b = mesh(rbox(0.34, 0.16, 0.26, 0.06), std('#ffffff')); b.position.set(0, 0.1, 0.12); slipper2.add(b); }
// 纯色台子 (科普/结尾)
const stage = mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.4, 48), std('#ffffff'), false, true); stage.position.y = -0.2; scene.add(stage);
// 科普段: 漂浮的钟 + 鼻子气味波纹
const floatClock = new THREE.Group(); scene.add(floatClock);
{ const r_ = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 32), std('#ffffff')); r_.rotation.x = Math.PI / 2; floatClock.add(r_);
  const q = mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 32), std('#f2c14e')); floatClock.add(q);
  const hh = box(0.06, 0.3, 0.03, '#42263f', 0.01); hh.position.set(0, 0.13, 0.08); floatClock.add(hh);
  const mm = box(0.06, 0.24, 0.03, '#e8588a', 0.01); mm.position.set(0.1, -0.02, 0.08); mm.rotation.z = -1.2; floatClock.add(mm);
  const qm = box(0.04, 0.04, 0.03, '#42263f', 0.01); qm.position.z = 0.1; floatClock.add(qm); }
const smellRings = []; for (let i = 0; i < 4; i++) { const r_ = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 32), new THREE.MeshBasicMaterial({ color: '#ffd6e6', transparent: true })); scene.add(r_); smellRings.push(r_); }

// ------------------------------------------------------------------ 角色/道具
const dog = makeDog(); scene.add(dog.root);
const cat = makeCat(); scene.add(cat.root);
const person = makePerson(); scene.add(person.root);
const hearts = []; for (let i = 0; i < 18; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false })); scene.add(s); hearts.push(s); }
const streaks = []; for (let i = 0; i < 10; i++) { const s = mesh(rbox(1.0, 0.04, 0.04, 0.015), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }), false, false); scene.add(s); streaks.push(s); }
const sparkRoom = makeSparkles(90, [14, 8, 10], '#fff4fa', 0.9, 7, 0.12); scene.add(sparkRoom);
const petals = makeSparkles(60, [14, 9, 10], '#ff9fc2', 1.1, 11, -0.35); scene.add(petals);

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
  x = clamp(x, w / 2 + 16, W - w / 2 - 16);
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x - w / 2, y - size * 0.78, w, size * 1.56, size * 0.78); ctx.fill();
  txt(s, x, y + 2, size, fg);
}
function bubble(s, x, y, size, age, bg = '#ffffff', fg = INK) {   // 对话气泡 (带小尾巴)
  if (age < 0) return;
  const k = back(age / 0.35); size = Math.max(4, size * k); y += 5 * Math.sin(age * 3);
  ctx.font = `${size}px ${FONT}`; const w = ctx.measureText(s).width + size * 1.2, h = size * 1.7;
  x = clamp(x, w / 2 + 16, W - w / 2 - 16);
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, size * 0.6); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - 18 * k, y + h / 2 - 2); ctx.lineTo(x + 6 * k, y + h / 2 + 28 * k); ctx.lineTo(x + 18 * k, y + h / 2 - 2); ctx.fill();
  txt(s, x, y + 2, size, fg);
}
function pop(s, x, y, size, col, age) { if (age < 0) return; txt(s, x, y, Math.max(4, size * back(age / 0.3)), col, '#ffffff', 10); }
const v3 = new THREE.Vector3();
function proj(obj, off = [0, 0, 0]) { v3.set(...off); obj.localToWorld(v3); v3.project(camera); return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H]; }

const fmtTime = m => m < 60 ? `出门第${m}分钟` : `出门${Math.floor(m / 60)}小时${m % 60 ? (m % 60) + '分' : ''}`;
function drawHUD(sc, lt, dur) {
  const [, name, d0, d1, , , desc, side] = sc;
  if (!desc) return;
  const m = Math.round(lerp(d0, d1, smooth(clamp(lt / (dur * 0.85)))));
  const home = name === 'back', open = name === 'open';
  const val = home ? 0 : Math.max(1, m);
  const x = 34, y = 560;
  txt('等你次数', x, y, 46, '#fff', INK, 8, 'left');
  txt('W A I T S', x, y + 36, 20, INK, null, 0, 'left');
  const ns = 96 * (0.7 + 0.3 * back(lt / 0.4));
  txt(String(val), x, y + 110, ns, '#fff', INK, 10, 'left');
  ctx.font = `${ns}px ${FONT}`; const w = ctx.measureText(String(val)).width;
  txt('次', x + w + 12, y + 128, 40, '#fff', INK, 8, 'left');
  const lines = [`时间: ${home ? '你回来了' : fmtTime(Math.max(1, m))}`, `狗狗: ${desc}`, `副作用: ${side}`];
  lines.forEach((l, i) => txt(l, x, y + 186 + i * 42, 32, '#fff', INK, 7, 'left'));
  ctx.fillStyle = home || open ? MINT : '#e8587e'; ctx.beginPath(); ctx.roundRect(x, y + 318, 230, 48, 24); ctx.fill();
  txt(home ? '不用等了' : open ? '等到了！' : '+1次 / 分钟', x + 115, y + 343, 30, '#fff');
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
  const start = STARTS[IDX.h8] + 1.0, end = STARTS[IDX.why] + 0.8;
  if (gt < start || gt > end) return;
  const dens = clamp((gt - start) / 2.5), r = rng(2026);
  const cols = ['#ffffff', '#ffe98f', '#a9e4ff', '#ffb3cf', '#bdf7c6'];
  for (let i = 0; i < 64; i++) {
    const t0 = start + (r() * (end - start + 2) - 2), sp = 300 + r() * 160, y = 130 + Math.floor(r() * 8) * 50;
    const col = cols[Math.floor(r() * 5)], s = DANMAKU[Math.floor(r() * DANMAKU.length)], keep = r() <= dens;
    const x = W - (gt - t0) * sp;
    if (x < -500 || x > W || !keep) continue;
    txt(s, x, y, 38, col, INK, 6, 'left');
  }
}

// ------------------------------------------------------------------ 每段场景
function env(kind) { room.visible = kind === 'room'; stage.visible = kind === 'void'; }
const drop = lt => -(1 - bounce(lt / 0.7)) * 5;   // 从天而降
let labels = [];
const L = (fn) => labels.push(fn);
const minutesAt = (sc, lt) => lerp(sc[2], sc[3], smooth(clamp(lt / (sc[0] * 0.85))));

function setup(name, lt, dur, gt, sc) {
  const p = lt / dur;
  [cat, person].forEach(o => o.root.visible = false);
  hearts.forEach(o => o.visible = false); streaks.forEach(o => o.visible = false); smellRings.forEach(o => o.visible = false);
  slipper2.visible = false; floatClock.visible = false; matDent.visible = false; shinyPath.visible = false;
  dog.root.position.set(0, 0, 0); dog.root.rotation.set(0, 0, 0); dog.root.scale.setScalar(1);
  hemi.color.set('#fff2f6'); hemi.intensity = 1.5; sun.color.set('#fff0e0');
  doorHinge.rotation.y = 0; clockAt(minutesAt(sc, lt)); drawSkyline(gt, false);
  let camPos = [0.4, 2.8, 12.8], camTgt = [-0.3, 1.4, -1];
  const dropY = -drop(lt);
  const curtainWave = (amp) => {
    const pa = curtain.geometry.attributes.position;
    for (let i = 0; i < pa.count; i++) { const y = curtainBase[i * 3 + 1], x = curtainBase[i * 3]; pa.array[i * 3 + 2] = curtainBase[i * 3 + 2] + amp * (1.1 - y) * (0.5 + 0.5 * Math.sin(gt * 2.2 + y * 2 + x * 3)); }
    pa.needsUpdate = true;
  };
  curtainWave(0.08);
  switch (name) {
    case 'title': {
      env('room'); setSky('#79b6f0', '#cfe6fb');
      doorHinge.rotation.y = -1.0;
      person.root.position.set(-1.15, 0, -2.75); person.update(lt, { wave: true, headYaw: 0.1 });
      dog.root.position.set(0.55, 0, -0.2); dog.root.rotation.y = -0.4;
      dog.update(gt, { hop: 1, wag: 0.8, perk: 0.6, tongue: true, mouth: 'open', yaw: -0.3 + 0.3 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.6) });
      camPos = [0.3, 2.8, 13.5]; camTgt = [-0.4, 1.7, -1];
      break;
    }
    case 'm1': {
      env('room');
      doorHinge.rotation.y = -1.0 * (1 - smooth(lt / 0.35));
      dog.root.position.set(0.35, 0, -0.5); dog.root.rotation.y = -0.45;
      dog.update(gt, { dropY, sit: 1, perk: 0.9, wag: 0.25, mouth: 'flat', yaw: -0.45 + 0.06 * Math.sin(lt * 3), look: -1, lookY: -0.3, tilt: 0.12 * Math.sin(lt * 1.3) });
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.5, 0]); pop('盯——', x + 60, y, 70, LAV, lt - 0.7); });
      L(() => { const [x, y] = proj(doorHinge, [0.65, 2.9, 0]); pill('门关上了', x, y - 230, 40, PINK, '#fff', lt - 0.35); });
      break;
    }
    case 'm10': {
      env('room');
      dog.root.position.set(0.35, 0, -0.5); dog.root.rotation.y = -0.45;
      const hope = lt > 0.5 && lt < 2.1, sad = lt >= 2.1;
      const k = hope ? smooth((lt - 0.5) / 0.25) : sad ? 1 - smooth((lt - 2.1) / 0.4) : 0;
      dog.update(gt, { dropY, sit: 1, perk: 0.2 + 0.8 * k, wag: sad ? 0.05 : 0.2 + 0.8 * k, tailDown: sad, eyes: sad ? 'sad' : 'normal', mouth: sad ? 'sad' : hope ? 'open' : 'flat',
        tongue: hope, yaw: -0.5 + (hope ? 0.1 * Math.sin(lt * 9) : 0), tilt: hope ? 0.3 : 0.1, look: -1, pitch: sad ? 0.2 : 0 });
      ['哒', '哒', '哒…'].forEach((s, j) => L(() => { const [x, y] = proj(doorHinge, [0.65, 1.8, 0]); pop(s, x - 160 + j * 130, y - 330 - j * 40, 64, '#8a5a44', lt - 0.4 - j * 0.3); }));
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.5, 0]); if (lt < 2.1) bubble('是你吗？！', x + 80, y - 30, 48, lt - 0.8); else bubble('……不是你', x + 80, y - 30, 48, lt - 2.2, '#dfe9ff'); });
      break;
    }
    case 'm30': {
      env('room');
      slipper2.visible = true; slipper2.position.set(1.2, 0.05, 0.4); slipper2.rotation.y = 0.6;
      dog.root.position.set(-0.1, 0, -0.1); dog.root.rotation.y = 0.35;
      dog.update(gt, { dropY, lie: 1, carry: true, perk: 0.1, wag: 0.25, eyes: lt > 1.4 ? 'half' : 'normal', mouth: 'flat', yaw: 0.2 + 0.15 * Math.sin(lt * 1.5), tilt: 0.25 });
      L(() => { const [x, y] = proj(dog.slipper, [0, 0.3, 0]); pill('你的拖鞋', x + 150, y - 60, 40, PINK, '#fff', lt - 0.6); });
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.3, 0]); pop('闻闻…是你的味道', x, y - 20, 50, LAV, lt - 1.3); });
      camPos = [0.2, 2.6, 11.5]; camTgt = [-0.1, 1.1, -0.4];
      break;
    }
    case 'h1': {
      env('room');
      shinyPath.visible = true; shinyPath.material.opacity = 0.25 + 0.25 * smooth(p);
      const P = 1.5, ph = (lt % (2 * P)) / P, dir = ph < 1 ? 1 : -1, u = ph < 1 ? ph : 2 - ph;
      const turn = Math.min(u, 1 - u) < 0.08;
      dog.root.position.set(lerp(-1.6, 1.0, smooth(u)), 0, -1.4 + 0.1 * Math.sin(lt * 3)); dog.root.rotation.y = dir * Math.PI / 2 * (turn ? 0.4 : 1);
      dog.update(gt, { dropY, walk: turn ? 0.3 : 1, wag: 0.15, perk: 0.4, eyes: 'normal', mouth: 'flat', yaw: -dir * 0.85, look: dir * 0.6, tilt: 0.1 * Math.sin(lt * 2) });
      L(() => pill(`踱步 ×${Math.round(lerp(1, 60, smooth(p)))}`, 820, 860, 44, ORANGE, '#fff', lt - 0.5));
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.5, 0]); pop('怎么还不回来', x, y, 46, SKY, lt - 1.1); });
      camPos = [0.4, 3.0, 12.5]; camTgt = [-0.3, 1.4, -1.4];
      break;
    }
    case 'h3': {
      env('room'); drawSkyline(gt, true);
      dog.root.position.set(2.5, 2.14, -2.3); dog.root.rotation.y = -0.35;
      dog.update(gt, { dropY, sit: 1, perk: 0.7, wag: 0.3 + 0.3 * Math.max(0, Math.sin(lt * 3)), yaw: -0.75 + 0.35 * Math.sin(lt * 1.6), look: -1 + 0.6 * Math.sin(lt * 1.6), lookY: -0.2, tilt: 0.15 * Math.sin(lt * 2), mouth: 'flat' });
      L(() => { const n = 200 + Math.floor(lt * 12); pill(`第${n}个路人：不是你`, 560, 760, 42, SKY, '#fff', lt - 0.5); });
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.4, 0]); pop('?', x + 40, y, 100, LAV, lt - 1.4); });
      camPos = [0.4, 3.4, 10.5]; camTgt = [1.7, 2.9, -2.4];
      break;
    }
    case 'h5': {
      env('room');
      dog.root.position.set(-0.7, 0, -2.0); dog.root.rotation.y = 0.35;
      dog.update(gt, { dropY, lie: 1, perk: 0, wag: 0.02, tailDown: true, eyes: 'sad', mouth: 'sad', yaw: 0.25 + 0.15 * Math.sin(lt * 1.2), pitch: 0.12, tilt: 0.2, look: 0.6 });
      cat.root.position.set(0.85, 0, -1.6); cat.root.rotation.y = -0.9; cat.root.scale.setScalar(0.8);
      cat.update(gt, { dropY: Math.max(0, -drop(lt - 0.4)), yaw: -0.3 + 0.1 * Math.sin(lt * 2), tilt: 0.25, look: -0.8, eyes: 'normal', mouth: 'w' });
      L(() => { const [x, y] = proj(cat.headPivot, [0, 1.4, 0]); bubble('她会回来的啦', x + 40, y - 20, 44, lt - 0.9, '#fff3c4'); });
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.3, 0]); bubble('万一呢……', x - 20, y - 20, 44, lt - 1.9, '#dfe9ff'); });
      L(() => { const [x, y] = proj(dog.headPivot, [0.5, 0.9, 0.6]); pop('呜…', x + 30, y, 44, SKY, lt - 0.5); });
      camPos = [0.4, 2.8, 11.5]; camTgt = [0, 1.2, -1.7];
      break;
    }
    case 'h8': {
      env('room');
      matDent.visible = true; matDent.material.opacity = smooth(lt / 1.2);
      clockAt(lerp(310, 480, smooth(clamp(lt / 3))) + 0 * lt);
      const howl = (lt % 1.6) < 1.1 && lt > 0.6;
      dog.root.position.set(-0.1, 0, -1.2); dog.root.rotation.y = -0.25;
      dog.update(gt, { dropY, sit: 1, perk: howl ? 0.5 : 0.2, wag: 0.1, tailDown: !howl, eyes: howl ? 'half' : 'sad', mouth: howl ? 'o' : 'sad', pitch: howl ? -0.6 : 0.1, yaw: -0.2, tilt: howl ? 0.08 * Math.sin(lt * 14) : 0.15 });
      L(() => { if (!howl) return; const [x, y] = proj(dog.headPivot, [0, 1.6, 0.4]); const a = (lt % 1.6); txt('嗷呜——', x + 30 + 8 * Math.sin(lt * 20), y - 40 - a * 30, Math.max(4, 84 * back(a / 0.3)), '#ffffff', PINK, 12); });
      L(() => { const [x, y] = proj(matDent, [0.5, 0.4, 0]); pill('狗形印子', x - 40, y + 70, 40, LAV, '#fff', lt - 1.2); });
      L(() => { const [x, y] = proj(clockH.parent, [0.6, 0, 0]); pop('5点了…', x + 70, y, 46, INK, lt - 0.4); });
      camPos = [0.4, 2.8, 11.5]; camTgt = [-0.5, 1.6, -1.8];
      break;
    }
    case 'open': {
      env('room');
      const o = smooth(lt / 0.5); doorHinge.rotation.y = -1.45 * o;
      hemi.intensity = 1.5 + 0.4 * o;
      const pIn = smooth((lt - 0.2) / 0.6);
      person.root.position.set(-1.25, 0, lerp(-3.5, -2.7, pIn)); person.update(lt, { hug: lt > 0.8, shock: lt < 0.8, headYaw: 0.1 * Math.sin(lt * 2) });
      // 狗: 先愣一下 -> 冲过去 -> 绕着她转圈蹦
      if (lt < 0.5) {
        dog.root.position.set(-0.35, 0, -1.0); dog.root.rotation.y = -0.25;
        dog.update(gt, { sit: 1, perk: smooth(lt / 0.3), wag: 0.3, eyes: 'normal', mouth: 'o', yaw: -0.4, look: -1 });
      } else {
        const ph = ((lt - 0.5) % 1.1) / 1.1, spin = ph < 0.4 ? smooth(ph / 0.4) * Math.PI * 2 : 0;
        const k = smooth((lt - 0.5) / 0.3);
        dog.root.position.set(lerp(-0.1, -0.15, k), 0, lerp(-1.2, -1.4, k)); dog.root.rotation.y = -0.45 + spin;
        dog.update(gt, { hop: 1, hopHz: 3.2, wag: 1, perk: 0.3, flap: true, eyes: 'happy', mouth: 'open', tongue: true, yaw: -0.2, tilt: 0.2 * Math.sin(lt * 7) });
      }
      hearts.forEach((h, i) => {
        h.visible = lt > 0.7; const u = ((lt - 0.7) * 0.6 + i / 18) % 1;
        h.position.set(-1.2 + Math.sin(i * 2.3) * 2.0 + 0.2 * Math.sin(lt * 2 + i), 0.6 + u * 3.6, -1.6 + Math.cos(i * 1.7) * 0.8); h.scale.setScalar(0.4 * Math.sin(Math.PI * u) + 0.01);
      });
      L(() => { const [x, y] = proj(person.root, [0, 3.4, 0]); bubble('我回来啦！', x, y - 20, 50, lt - 0.7, '#fff3c4'); });
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.5, 0]); pop('！！！', x, y, 80, PINK, lt - 0.15); });
      L(() => pill('尾巴转速：∞', 820, 820, 42, ORANGE, '#fff', lt - 1.4));
      camPos = [0.4, 3.0, 11.5]; camTgt = [-0.5, 1.6, -1.8];
      break;
    }
    case 'why': {
      env('void'); setSky('#a98ae0', '#d8c6f6'); stage.material.color.set('#c7b2f0');
      dog.root.rotation.y = 0.4 * Math.sin(lt * 0.7);
      dog.update(gt, { dropY, sit: 1, perk: 0.5 + 0.4 * Math.sin(lt * 2), wag: 0.4, yaw: -0.35 * Math.sin(lt * 1.3), tilt: 0.2 * Math.sin(lt * 1.9), look: Math.sin(lt * 1.3) });
      floatClock.visible = true; floatClock.position.set(-1.05, 2.75 + 0.12 * Math.sin(lt * 2), 0.3); floatClock.rotation.set(0.1, 0.4 * Math.sin(lt), 0.15 * Math.sin(lt * 1.7));
      smellRings.forEach((r_, i) => { const u = (lt * 0.5 + i / 4) % 1; r_.visible = true; r_.position.set(0.35 + u * 1.4, 1.6 + u * 1.2, 0.9); r_.scale.setScalar(0.5 + u * 1.6); r_.material.opacity = 0.8 * (1 - u); r_.rotation.y = 0.7; });
      L(() => { const [x, y] = proj(floatClock, [0, -0.75, 0]); pop('看不懂…', x, y, 46, INK, lt - 0.3); });
      ['生物钟：记得你平时几点回家', '你留下的气味慢慢变淡（科学家的猜想）', '实验：分开2小时比30分钟，迎接更热情']
        .forEach((s, i) => L(() => pill(s, 540, 210 + i * 100, 38, '#ffffff', INK, lt - 0.6 - i * 0.8)));
      camPos = [0, 2.5, 12.5]; camTgt = [0, 1.7, 0];
      break;
    }
    case 'back': {
      env('room'); drawSkyline(gt, false, 1);
      hemi.color.set('#ffe2cc'); sun.color.set('#ffd2a8');
      const w = clamp(lt / 2.8);
      dog.root.position.set(lerp(-1.6, 0.1, smooth(w)), 0, lerp(-1.4, 0.2, smooth(w))); dog.root.rotation.y = 1.0 - 0.3 * w;
      dog.update(gt, { walk: w < 1 ? 1 : 0, sit: w >= 1 ? 1 : 0, carry: w < 1, wag: 0.85, perk: 0.4, eyes: 'happy', mouth: w < 1 ? 'smile' : 'open', tongue: w >= 1, yaw: -0.2 - 0.2 * w, pitch: -0.15 * w });
      if (w >= 1) { slipper2.visible = true; slipper2.position.set(0.85, 0.05, 0.75); slipper2.rotation.y = 1.2; }
      person.root.position.set(1.35, 0, -0.1); person.root.rotation.y = -0.75; person.update(lt, { headYaw: 0.3, reach: w > 0.6 });
      hearts.forEach((h, i) => { h.visible = lt > 1.0; const u = (lt * 0.4 + i / 18) % 1; h.position.set(0.6 + Math.sin(i * 2.1) * 1.6 + 0.2 * Math.sin(lt * 2 + i), 1 + u * 3.5, 0.3 + Math.cos(i) * 0.5); h.scale.setScalar(0.33 * Math.sin(Math.PI * u) + 0.01); });
      L(() => { if (w < 1) { const [x, y] = proj(dog.headPivot, [0, 1.4, 0]); bubble('拖鞋给你～', x, y, 44, lt - 0.5, '#fff3c4'); } });
      camPos = [0.4, 2.6, 12]; camTgt = [0.1, 1.4, -0.4];
      break;
    }
    case 'end': {
      env('void'); setSky('#f597bc', '#ffd0e0'); stage.material.color.set('#f9b6cd');
      dog.root.scale.setScalar(0.8); dog.root.rotation.y = 0.3 * Math.sin(lt * 1.2);
      dog.update(gt, { hop: 0.6, wag: 0.9, eyes: 'happy', mouth: 'open', tongue: true, perk: 0.4, yaw: 0.4 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.5) });
      hearts.forEach((h, i) => { h.visible = i < 8; const u = (lt * 0.35 + i / 8) % 1; h.position.set(Math.sin(i * 2.4) * 1.8, 0.5 + u * 3, 0.5); h.scale.setScalar(0.3 * Math.sin(Math.PI * u) + 0.01); });
      camPos = [0, 1.8, 10]; camTgt = [0, 2.4, 0];
      break;
    }
  }
  return { camPos, camTgt };
}

const SHAKE = { h8: 0.03, open: 0.05 };
window.renderAt = (gt) => {
  let i = SCENES.length - 1; while (i > 0 && gt < STARTS[i]) i--;
  const sc = SCENES[i], name = sc[1], dur = sc[0], lt = gt - STARTS[i];
  labels = [];
  const { camPos, camTgt } = setup(name, lt, dur, gt, sc);
  const push = 1 - 0.06 * (lt / dur) - 0.14 * (1 - back(lt / 0.45));
  const sh = (SHAKE[name] || 0) * (name === 'open' ? clamp((lt - 0.4) * 2) : 1);
  const dir = new THREE.Vector3(...camPos).sub(new THREE.Vector3(...camTgt));
  const pos = new THREE.Vector3(...camTgt).add(dir.multiplyScalar(push));
  pos.x += 0.18 * Math.sin(lt * 0.9 + i) + sh * Math.sin(gt * 53); pos.y += 0.08 * Math.sin(lt * 1.3 + i * 2) + sh * Math.cos(gt * 47);
  camera.position.copy(pos); camera.lookAt(...camTgt);
  sparkRoom.material.uniforms.uTime.value = gt; petals.material.uniforms.uTime.value = gt;
  composer.render();
  ctx.drawImage(renderer.domElement, 0, 0);
  labels.forEach(f => f());
  if (name === 'title') {
    const a = back(lt / 0.5);
    ctx.save(); ctx.translate(540, 560); ctx.scale(a, a);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-410, -145, 820, 290, 36); ctx.fill();
    txt('假如你家的狗', 0, -55, 74, INK); txt('每分钟等你一次', 0, 50, 82, ORANGE); ctx.restore();
    txt('会发生什么？', 540, 775, 76, '#fff', INK, 12);
    bubble('拜拜～', 300, 1060, 44, lt - 0.8, '#fff3c4');
  }
  if (name === 'end') {
    const a = smooth(lt / 0.8);
    ctx.globalAlpha = a;
    txt('早点回家吧', 540, 560, 78, '#ffffff', '#c23f74', 12);
    txt('你家狗狗会在门口等你吗？', 540, 690, 56, INK, '#ffffff', 10);
    ctx.globalAlpha = clamp((lt - 1) / 0.4);
    txt('评论区告诉我 ↓', 540, 800, 58, '#a2285e', '#ffffff', 10);
    ctx.globalAlpha = 1;
  }
  drawHUD(sc, lt, dur);
  drawCaption(sc, lt);
  drawDanmaku(gt);
  if (lt < 0.15 && i > 0) { ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - lt / 0.15)})`; ctx.fillRect(0, 0, W, H); }
  if (name === 'open' && lt > 0.3 && lt < 0.6) { ctx.fillStyle = `rgba(255,248,220,${0.6 * (1 - (lt - 0.3) / 0.3)})`; ctx.fillRect(0, 0, W, H); }
  if (i === SCENES.length - 1 && lt > dur - 0.8) { ctx.fillStyle = `rgba(255,255,255,${clamp((lt - dur + 0.8) / 0.8)})`; ctx.fillRect(0, 0, W, H); }
  return out.toDataURL('image/jpeg', 0.9);
};
window.DUR = STARTS[STARTS.length - 1] + SCENES[SCENES.length - 1][0];
window.READY = true;
