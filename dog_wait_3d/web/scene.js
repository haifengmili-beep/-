// 《假如你家的狗每分钟等你一次》 3D 版 — 按 STORYBOARD.md 分镜: 镜头语言 + 时间靠光讲. window.renderAt(t) 决定性渲染一帧.
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
  [4.4, 'open', 480, 540, '第9小时：门开了！\n540次等待，这一秒全值了', 'Hour 9: The door opens! 540 waits, all worth this one second.', '等到了！', '尾巴快摇断了'],
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
const bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.18, 0.5, 1.0); composer.addPass(bloom);
composer.addPass(new OutputPass());
const out = document.getElementById('out'); const ctx = out.getContext('2d');

const hemi = new THREE.HemisphereLight('#fff2f6', '#c99bb8', 1.5); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0e0', 2.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 5; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
sun.position.set(4, 9, 6); sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
{ const c = sun.shadow.camera; c.left = -8; c.right = 8; c.top = 8; c.bottom = -8; c.near = 0.5; c.far = 40; }
const lampLight = new THREE.PointLight('#ffc98a', 0, 0, 2); lampLight.position.set(-2.85, 2.1, 1.3); scene.add(lampLight);
const doorLight = new THREE.PointLight('#ffd9a0', 0, 0, 2); doorLight.position.set(-1.2, 1.7, -2.7); scene.add(doorLight);
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { top: { value: new THREE.Color('#79b6f0') }, bot: { value: new THREE.Color('#cfe6fb') } },
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top, bot; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.1, 0.45, vP.y)), 1.0); }`,
}));
scene.add(skyDome);
const setSky = (a, b) => { skyDome.material.uniforms.top.value.set(a); skyDome.material.uniforms.bot.value.set(b); };

// ------------------------------------------------------------------ 窗外 (按时间段重画: 天色 / 太阳 / 星星 / 亮灯的窗 / 路人)
const SKYS = {
  day:       { top: '#8fc6f5', bot: '#d9ecfb', win: 'rgba(255,255,255,0.85)', sun: null },
  afternoon: { top: '#7fb8f0', bot: '#f6e6c8', win: 'rgba(255,255,255,0.85)', sun: ['#fff3c0', 430, 90] },
  golden:    { top: '#f6a66e', bot: '#ffe0a0', win: 'rgba(255,240,200,0.9)', sun: ['#fff0b0', 400, 210] },
  sunset:    { top: '#e86f8e', bot: '#ffb070', win: 'rgba(255,230,170,0.95)', sun: ['#ffe08a', 380, 290] },
  dusk:      { top: '#4f4aa8', bot: '#c58ad0', win: 'rgba(255,214,120,1)', sun: null, stars: 1 },
  night:     { top: '#3a3a90', bot: '#8a6cc4', win: 'rgba(255,214,120,1)', sun: null, stars: 1, moon: 1 },
};
const skyline = canvasTex(512, 384, () => {});
function drawSkyline(tt, walkers, mode = 'day') {
  const S = SKYS[mode], g = skyline.userData.g, w = 512, h = 384;
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, S.top); gr.addColorStop(1, S.bot); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  if (S.sun) { const [c, x, y] = S.sun; const sg = g.createRadialGradient(x, y, 0, x, y, 90); sg.addColorStop(0, c); sg.addColorStop(0.35, c); sg.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = sg; g.fillRect(0, 0, w, h); }
  if (S.stars) { const r = rng(4); g.fillStyle = '#ffffff'; for (let i = 0; i < 40; i++) { const tw = 0.4 + 0.6 * Math.abs(Math.sin(tt * 3 + i)); g.globalAlpha = tw; g.fillRect(r() * w, r() * 160, 3, 3); } g.globalAlpha = 1; }
  if (S.moon) { g.fillStyle = '#fff6d0'; g.beginPath(); g.arc(400, 70, 30, 0, 7); g.fill(); g.fillStyle = S.top; g.beginPath(); g.arc(388, 60, 26, 0, 7); g.fill(); }
  const r = rng(9), cols = ['#f39cb4', '#9cbcf0', '#f6cf78', '#89cfa6', '#bba3ea'];
  const dark = mode === 'dusk' || mode === 'night';
  for (let x = 0; x < w; x += 46) { const bh = 90 + r() * 170; g.fillStyle = cols[(x / 46) % 5 | 0]; g.fillRect(x, h - 60 - bh, 42, bh);
    if (dark) { g.fillStyle = 'rgba(40,30,90,0.45)'; g.fillRect(x, h - 60 - bh, 42, bh); }
    for (let wy = h - 60 - bh + 14; wy < h - 70; wy += 26) for (let wx = x + 6; wx < x + 36; wx += 14) { g.fillStyle = dark && r() < 0.35 ? 'rgba(80,70,140,0.8)' : S.win; g.fillRect(wx, wy, 7, 12); } }
  g.fillStyle = dark ? '#5f8a7a' : '#8ccb80'; g.fillRect(0, h - 60, w, 60); g.fillStyle = dark ? '#7a7498' : '#c9c4d8'; g.fillRect(0, h - 40, w, 22);
  if (walkers) {
    const cc = ['#e8588a', '#468cd6', '#f2b13a', '#2ea47c', '#8464c4', '#ee7a3c'];
    for (let i = 0; i < 5; i++) {
      const x = ((tt * (70 + i * 16) + i * 131) % 640) - 70, y = h - 40, bob = Math.abs(Math.sin(tt * 8 + i)) * 5, s = 1.5;
      g.fillStyle = cc[i]; g.fillRect(x - 13 * s / 1.5, y - 60 - bob, 26, 40);
      g.fillStyle = '#f7d3bd'; g.fillRect(x - 11, y - 84 - bob, 22, 22);
      g.fillStyle = '#5a3a30'; g.fillRect(x - 12, y - 88 - bob, 24, 8);
      g.fillStyle = '#4a3040'; g.fillRect(x - 10, y - 20 - bob, 7, 20 + bob); g.fillRect(x + 3, y - 20, 7, 20);
    }
  }
  skyline.needsUpdate = true;
}
drawSkyline(0, false);

// ------------------------------------------------------------------ 客厅 (四面墙: 镜头可以反打)
const room = new THREE.Group(); scene.add(room);
let doorHinge, doorGlow, clockG, clockH, clockM, matDent, shinyPath, shaft, sunPatch, lampShade, platY = 2.14;
{
  const plank = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d49a70'; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let y = 0; y < h; y += 64) { g.fillStyle = `rgba(150,90,60,${0.15 + r() * 0.15})`; g.fillRect(0, y, w, 4); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(255,230,200,0.12)'; g.fillRect(r() * w, y + 10 + r() * 40, 80 + r() * 120, 3); } }
  });
  plank.wrapS = plank.wrapT = THREE.RepeatWrapping; plank.repeat.set(3, 3);
  const floor = mesh(new THREE.PlaneGeometry(16, 16), std('#ffffff', { map: plank }), false, true); floor.rotation.x = -Math.PI / 2; room.add(floor);
  const wall = (w, h, col, x, y, z, ry) => { const m = mesh(new THREE.PlaneGeometry(w, h), std(col), false, true); m.position.set(x, y, z); m.rotation.y = ry; room.add(m); return m; };
  wall(16, 9, '#f2a7c3', 0, 4.5, -3.4, 0);                 // 后墙 (门 + 窗 + 钟)
  wall(12, 9, '#b99ae6', -3.6, 4.5, 1.6, Math.PI / 2);     // 左墙
  wall(12, 9, '#b99ae6', 3.8, 4.5, 1.6, -Math.PI / 2);     // 右墙 (只在反打里看得到)
  wall(16, 9, '#f2a7c3', 0, 4.5, 5.5, Math.PI);            // 前墙 (单面: 正面机位从外面穿过去看不到)
  // 踢脚线
  for (const [w, x, z, ry] of [[16, 0, -3.39, 0], [12, -3.59, 1.6, Math.PI / 2], [12, 3.79, 1.6, -Math.PI / 2], [16, 0, 5.49, Math.PI]]) {
    const b = mesh(new THREE.PlaneGeometry(w, 0.16), std('#ffffff'), false, false); b.position.set(x, 0.08, z); b.rotation.y = ry; room.add(b);
  }
  // 窗户
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), new THREE.MeshBasicMaterial({ map: skyline })); glass.position.set(1.6, 3.2, -3.38); room.add(glass);
  for (const [w, h, x, y] of [[2.9, 0.16, 1.6, 4.2], [2.9, 0.16, 1.6, 2.2], [0.16, 2.1, 0.2, 3.2], [0.16, 2.1, 3.0, 3.2], [0.1, 1.9, 1.6, 3.2]]) {
    const f = box(w, h, 0.14, '#ffffff', 0.03); f.position.set(x, y, -3.33); room.add(f);
  }
  const sill = box(3.0, 0.08, 0.3, '#ffffff', 0.02); sill.position.set(1.6, 2.12, -3.25); room.add(sill);
  // 窗光柱 + 地上的光斑 (加法混合)
  const shaftTex = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  shaft = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.3), new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  shaft.position.set(1.6, 1.6, -1.93); shaft.rotation.x = -0.727; room.add(shaft);
  const patchTex = canvasTex(256, 192, (g, w, h) => { g.fillStyle = 'rgba(255,255,255,0.8)'; for (const [x, y] of [[8, 8], [132, 8], [8, 100], [132, 100]]) g.fillRect(x, y, 116, 84); });
  sunPatch = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), new THREE.MeshBasicMaterial({ map: patchTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sunPatch.rotation.x = -Math.PI / 2; sunPatch.position.set(1.6, 0.014, -0.6); room.add(sunPatch);
  // 大门 (铰链在左边, 向屋里打开) + 门后的光
  doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.6), new THREE.MeshBasicMaterial({ color: '#fff4c8' })); doorGlow.position.set(-1.2, 1.3, -3.39); room.add(doorGlow);
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
  const mat = mesh(rbox(1.5, 0.04, 0.9, 0.015), std('#ffffff', { map: matTex }), false, true); mat.position.set(-0.8, 0.02, -1.55); room.add(mat);
  const dentTex = canvasTex(256, 256, (g) => {
    g.fillStyle = 'rgba(150,40,90,0.75)';
    g.beginPath(); g.ellipse(128, 150, 70, 80, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(128, 70, 50, 44, 0, 0, 7); g.fill();
    for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(128 + sx * 52, 70, 16, 34, sx * 0.3, 0, 7); g.fill(); }
    g.beginPath(); g.ellipse(208, 210, 34, 12, -0.5, 0, 7); g.fill();
  });
  matDent = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), new THREE.MeshBasicMaterial({ map: dentTex, transparent: true, depthWrite: false }));
  matDent.rotation.x = -Math.PI / 2; matDent.position.set(-1.1, 0.045, -1.6); room.add(matDent);
  shinyPath = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.7), new THREE.MeshBasicMaterial({ color: '#fff3dd', transparent: true, opacity: 0.4, depthWrite: false }));
  shinyPath.rotation.x = -Math.PI / 2; shinyPath.position.set(-0.3, 0.012, -0.9); room.add(shinyPath);
  // 挂钟 (门上方)
  clockG = new THREE.Group(); clockG.position.set(-1.2, 3.55, -3.33); room.add(clockG);
  const rim = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 32), std('#8464c4')); rim.rotation.x = Math.PI / 2; clockG.add(rim);
  const faceC = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.11, 32), std('#ffffff')); faceC.rotation.x = Math.PI / 2; clockG.add(faceC);
  for (let i = 0; i < 12; i++) { const tk = box(i % 3 ? 0.03 : 0.05, i % 3 ? 0.06 : 0.1, 0.02, '#42263f', 0.01); const a = i / 12 * Math.PI * 2; tk.position.set(Math.sin(a) * 0.29, Math.cos(a) * 0.29, 0.06); tk.rotation.z = -a; clockG.add(tk); }
  clockH = new THREE.Group(); clockH.position.z = 0.07; clockG.add(clockH); { const hh = box(0.05, 0.2, 0.02, '#42263f', 0.01); hh.position.y = 0.09; clockH.add(hh); }
  clockM = new THREE.Group(); clockM.position.z = 0.08; clockG.add(clockM); { const mm = box(0.035, 0.29, 0.02, '#e8588a', 0.01); mm.position.y = 0.13; clockM.add(mm); }
  const pin = mesh(new THREE.SphereGeometry(0.035, 8, 6), std('#f2c14e')); pin.position.z = 0.1; clockG.add(pin);
  // 猫爬架 (窗边, 平台够狗坐)
  for (const x of [2.2, 3.2]) { const pp = mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.0, 16), std('#b98252')); pp.position.set(x, 1.0, -2.4); room.add(pp); }
  const plat = box(1.7, 0.18, 2.0, '#c9b3f0', 0.05); plat.position.set(2.7, platY - 0.09, -2.3); room.add(plat);
  const base = box(1.7, 0.18, 2.0, '#c9b3f0', 0.05); base.position.set(2.7, 0.09, -2.3); room.add(base);
  // 柜子 + 绿植 + 地毯
  const cab = box(1.0, 1.1, 0.8, '#a98ad8', 0.06); cab.position.set(-3.0, 0.55, -2.8); room.add(cab);
  const pot = box(0.45, 0.45, 0.45, '#ec8a74', 0.06); pot.position.set(-3.0, 1.33, -2.8); room.add(pot);
  for (let i = 0; i < 5; i++) { const l = box(0.12, 0.6, 0.12, '#5aae73', 0.04); l.position.set(-3.12 + i * 0.06, 1.85, -2.8); l.rotation.z = -0.5 + i * 0.25; room.add(l); }
  const rug = mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.03, 48), std('#f7c1d3'), false, true); rug.position.set(0.5, 0.015, 1.0); room.add(rug);
  const rugIn = mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.035, 48), std('#fbd5e2'), false, true); rugIn.position.set(0.5, 0.016, 1.0); room.add(rugIn);
  // 落地灯 (晚上亮)
  const pole = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 12), std('#ffffff')); pole.position.set(-2.85, 1.0, 1.3); room.add(pole);
  const lb = box(0.5, 0.08, 0.5, '#ffffff', 0.03); lb.position.set(-2.85, 0.04, 1.3); room.add(lb);
  lampShade = mesh(new THREE.CylinderGeometry(0.28, 0.42, 0.5, 16, 1, true), std('#ffe3b0', { side: THREE.DoubleSide, emissive: new THREE.Color('#ffc37a'), emissiveIntensity: 0 }));
  lampShade.position.set(-2.85, 2.15, 1.3); room.add(lampShade);
  // 右墙沙发 + 前墙合照 (反打镜头的背景)
  const sofaC = '#7fc6c0';
  const s1 = box(1.0, 0.5, 2.2, sofaC, 0.1); s1.position.set(3.25, 0.45, 3.4); room.add(s1);
  const s2 = box(0.3, 0.9, 2.2, sofaC, 0.1); s2.position.set(3.65, 0.9, 3.4); room.add(s2);
  for (const z of [2.25, 4.55]) { const a = box(1.0, 0.7, 0.24, '#6ab5ae', 0.1); a.position.set(3.25, 0.55, z); room.add(a); }
  const pillow = box(0.18, 0.4, 0.45, '#ffb3cf', 0.08); pillow.position.set(3.45, 0.9, 3.0); pillow.rotation.x = 0.2; room.add(pillow);
  const photoTex = canvasTex(256, 200, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#bfe3f7'; g.fillRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#8ccb80'; g.fillRect(14, 140, w - 28, 46);
    g.fillStyle = '#3fb0a0'; g.fillRect(60, 80, 44, 70); g.fillStyle = '#f7d3bd'; g.fillRect(62, 44, 40, 38); g.fillStyle = '#6b4134'; g.fillRect(58, 38, 48, 14); g.fillRect(56, 44, 8, 50); g.fillRect(100, 44, 8, 50);
    g.fillStyle = '#fbe2c4'; g.fillRect(128, 110, 70, 40); g.fillStyle = '#fdebd3'; g.fillRect(150, 76, 48, 42); g.fillStyle = '#dc9e70'; g.fillRect(144, 80, 10, 26); g.fillRect(194, 80, 10, 26);
    g.fillStyle = '#1b1218'; g.fillRect(160, 88, 7, 8); g.fillRect(180, 88, 7, 8);
    g.fillStyle = '#ff6f9e'; g.font = '34px sans-serif'; g.fillText('♥', 112, 60);
  });
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.86), new THREE.MeshStandardMaterial({ map: photoTex, roughness: 0.5 }));
  photo.position.set(1.9, 2.0, 5.47); photo.rotation.y = Math.PI; room.add(photo);
  const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.26, 1.02), std('#c98a5a')); frame.position.set(1.9, 2.0, 5.48); frame.rotation.y = Math.PI; room.add(frame);
  for (const [x, y, c] of [[0.4, 2.6, '#f6cf78'], [-0.3, 1.9, '#9cbcf0']]) {
    const f2 = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), std(c)); f2.position.set(x, y, 5.47); f2.rotation.y = Math.PI; room.add(f2);
  }
}
const clockAt = (minutes) => { const h = 9 + minutes / 60; clockH.rotation.z = -(h % 12) / 12 * Math.PI * 2; clockM.rotation.z = -(minutes % 60) / 60 * Math.PI * 2; };
const curtain = mesh(new THREE.PlaneGeometry(0.8, 2.2, 8, 8), std('#ec86ad', { side: THREE.DoubleSide }), false, false);
curtain.position.set(3.4, 3.2, -3.25); room.add(curtain);
const curtainBase = curtain.geometry.attributes.position.array.slice();
const slipper2 = new THREE.Group(); scene.add(slipper2);
{ const a = mesh(rbox(0.32, 0.1, 0.62, 0.05), std('#ff9ec0')); slipper2.add(a); const b = mesh(rbox(0.34, 0.16, 0.26, 0.06), std('#ffffff')); b.position.set(0, 0.1, 0.12); slipper2.add(b); }
// 主人的手 (主人视角镜头里摸头)
const hand = new THREE.Group(); scene.add(hand);
{ const sl = box(0.3, 0.3, 0.6, '#e08aa0', 0.02); sl.position.z = 0.55; hand.add(sl); const fa = box(0.18, 0.18, 0.6, '#f7d3bd', 0.06); fa.position.z = 0.1; hand.add(fa); const pm = box(0.3, 0.12, 0.3, '#f7d3bd', 0.06); pm.position.z = -0.25; hand.add(pm); }
// 纯色台子 (科普/结尾) + 漂浮的钟 + 气味波纹
const stage = mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.4, 48), std('#ffffff'), false, true); stage.position.y = -0.2; scene.add(stage);
const floatClock = new THREE.Group(); scene.add(floatClock);
{ const r_ = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 32), std('#ffffff')); r_.rotation.x = Math.PI / 2; floatClock.add(r_);
  const q = mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 32), std('#f2c14e')); floatClock.add(q);
  const hh = box(0.06, 0.3, 0.03, '#42263f', 0.01); hh.position.set(0, 0.13, 0.08); floatClock.add(hh);
  const mm = box(0.06, 0.24, 0.03, '#e8588a', 0.01); mm.position.set(0.1, -0.02, 0.08); mm.rotation.z = -1.2; floatClock.add(mm); }
const smellRings = []; for (let i = 0; i < 4; i++) { const r_ = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 8, 32), new THREE.MeshBasicMaterial({ color: '#ffd6e6', transparent: true })); scene.add(r_); smellRings.push(r_); }

// ------------------------------------------------------------------ 时间段的光 (上午 → 中午 → 下午 → 金色 → 夕阳 → 黄昏 → 夜晚)
const TOD = {
  morning:   { sky: '#fff2f6', gnd: '#c99bb8', hi: 1.5,  sun: '#fff0e0', si: 2.3, sp: [4, 9, 6],   sh: 0.12, shc: '#ffffff', lamp: 0, win: 'day' },
  noon:      { sky: '#fff6f6', gnd: '#d0a6be', hi: 1.55, sun: '#ffffff', si: 2.5, sp: [2, 12, 4],  sh: 0.32, shc: '#fff6d8', lamp: 0, win: 'day' },
  afternoon: { sky: '#fff0e6', gnd: '#cc9cb4', hi: 1.45, sun: '#ffe0b0', si: 2.4, sp: [6, 7, 4],   sh: 0.32, shc: '#ffe2a8', lamp: 0, win: 'afternoon' },
  golden:    { sky: '#ffd9c2', gnd: '#c58fa8', hi: 1.3,  sun: '#ffb36b', si: 2.7, sp: [7, 3.5, -4], sh: 0.5, shc: '#ffb870', lamp: 0, win: 'golden' },
  sunset:    { sky: '#ffc0b0', gnd: '#b07ca0', hi: 1.2,  sun: '#ff8a5c', si: 2.2, sp: [8, 2.5, -3], sh: 0.45, shc: '#ff9a6a', lamp: 0.3, win: 'sunset' },
  dusk:      { sky: '#b9a2f0', gnd: '#6a58a6', hi: 1.3,  sun: '#ffb08a', si: 0.8, sp: [5, 6, 6],   sh: 0.0, shc: '#9a8aff', lamp: 1, win: 'dusk' },
  night:     { sky: '#c9b2f2', gnd: '#7a64aa', hi: 1.25, sun: '#ffd2a8', si: 1.0, sp: [4, 8, 6],   sh: 0.0, shc: '#9a8aff', lamp: 1, win: 'night' },
};
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
const mixC = (a, b, k) => _c1.set(a).lerp(_c2.set(b), k).getHexString();
function setTOD(a, b = a, k = 0, tt = 0, walkers = false) {
  const A = TOD[a], B = TOD[b];
  hemi.color.set('#' + mixC(A.sky, B.sky, k)); hemi.groundColor.set('#' + mixC(A.gnd, B.gnd, k)); hemi.intensity = lerp(A.hi, B.hi, k);
  sun.color.set('#' + mixC(A.sun, B.sun, k)); sun.intensity = lerp(A.si, B.si, k);
  sun.position.set(lerp(A.sp[0], B.sp[0], k), lerp(A.sp[1], B.sp[1], k), lerp(A.sp[2], B.sp[2], k));
  const sh = lerp(A.sh, B.sh, k); shaft.visible = sunPatch.visible = sh > 0.01;
  shaft.material.color.set('#' + mixC(A.shc, B.shc, k)).multiplyScalar(sh); sunPatch.material.color.copy(shaft.material.color).multiplyScalar(1.4);
  const lamp = lerp(A.lamp, B.lamp, k); lampLight.intensity = 9 * lamp; lampShade.material.emissiveIntensity = 1.6 * lamp;
  drawSkyline(tt, walkers, k < 0.5 ? A.win : B.win);
}

// ------------------------------------------------------------------ 角色/道具
const dog = makeDog(); scene.add(dog.root);
const cat = makeCat(); scene.add(cat.root);
const person = makePerson(); scene.add(person.root);
const hearts = []; for (let i = 0; i < 18; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false })); scene.add(s); hearts.push(s); }
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
  const start = STARTS[IDX.h8] + 1.6, end = STARTS[IDX.why] + 0.8;
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


// ------------------------------------------------------------------ 分镜 (见 STORYBOARD.md)
function env(kind) { room.visible = kind === 'room'; stage.visible = kind === 'void'; }
const drop = lt => -(1 - bounce(lt / 0.7)) * 5;   // 从天而降
let labels = [];
const L = (fn) => labels.push(fn);
const minutesAt = (sc, lt) => lerp(sc[2], sc[3], smooth(clamp(lt / (sc[0] * 0.85))));
const V = (a) => new THREE.Vector3(...a);
function worldOf(obj, off = [0, 0, 0]) { obj.updateWorldMatrix(true, false); return obj.localToWorld(V(off)); }
const lerpV = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
// 镜头: pos/tgt/fov, cut = 这个镜头开始后的时间 (镜头内切), push = 冲进去回弹+慢推, hand = 手持晃动, shake = 震屏
const shot = (pos, tgt, fov = 30, o = {}) => ({ pos, tgt, fov, push: true, hand: 1, shake: 0, ...o });
const DOG_SPOT = [0.7, 0, 2.5], DOG_FACE_DOOR = Math.atan2(-1.2 - 0.7, -3.3 - 2.5);   // 前三段: 狗坐在地毯上望着门

function setup(name, lt, dur, gt, sc) {
  const p = lt / dur;
  [cat, person].forEach(o => o.root.visible = false);
  dog.root.visible = true;
  hearts.forEach(o => o.visible = false); smellRings.forEach(o => o.visible = false);
  slipper2.visible = false; floatClock.visible = false; matDent.visible = false; shinyPath.visible = false; hand.visible = false;
  dog.root.position.set(0, 0, 0); dog.root.rotation.set(0, 0, 0); dog.root.scale.setScalar(1);
  doorHinge.rotation.y = 0; doorLight.intensity = 0; doorGlow.material.color.set('#fff4c8'); bloom.strength = 0.18;
  clockAt(minutesAt(sc, lt));
  setSky('#79b6f0', '#cfe6fb');
  const dropY = -drop(lt);
  const pa = curtain.geometry.attributes.position;
  for (let i = 0; i < pa.count; i++) { const y = curtainBase[i * 3 + 1], x = curtainBase[i * 3]; pa.array[i * 3 + 2] = curtainBase[i * 3 + 2] + 0.08 * (1.1 - y) * (0.5 + 0.5 * Math.sin(gt * 2.2 + y * 2 + x * 3)); }
  pa.needsUpdate = true;
  switch (name) {
    // 0 标题: 大全景微俯, 她在门口挥手告别
    case 'title': {
      env('room'); setTOD('morning', 'morning', 0, gt);
      doorHinge.rotation.y = -1.1; doorLight.intensity = 2;
      person.root.position.set(-1.15, 0, -2.85); person.update(lt, { wave: true, headYaw: 0.25 });
      dog.root.position.set(0.45, 0, -0.3); dog.root.rotation.y = -0.55;
      dog.update(gt, { hop: 1, wag: 0.85, perk: 0.6, tongue: true, mouth: 'open', yaw: -0.25 + 0.3 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.6) });
      return shot([1.3, 3.6, 13.5], [-0.35, 2.3, -1.4]);
    }
    // 1 过肩: 狗后脑勺在前景右边, 门在左; 门砰地关上
    case 'm1': {
      env('room'); setTOD('morning', 'morning', 0, gt);
      doorHinge.rotation.y = -1.1 * (1 - smooth(lt / 0.32));
      dog.root.position.set(...DOG_SPOT); dog.root.rotation.y = DOG_FACE_DOOR;
      dog.update(gt, { dropY: lt < 0.1 ? 0 : 0, sit: 1, perk: lt > 0.35 ? 0.95 : 0.3, flap: lt > 0.3 && lt < 0.55, wag: 0.25, mouth: 'flat', yaw: 0.05 * Math.sin(lt * 3), tilt: 0.1 * Math.sin(lt * 1.3) });
      L(() => { const [x, y] = proj(doorHinge, [0.65, 1.9, 0.1]); pop('砰！', x, y, 96, '#ffffff', lt - 0.3); });
      L(() => { const [x, y] = proj(dog.headPivot, [0.2, 1.3, 0]); pop('盯——', x + 40, y - 40, 66, LAV, lt - 1.0); });
      const hd = worldOf(dog.headPivot, [0, 0.45, 0]), fw = [Math.sin(DOG_FACE_DOOR), Math.cos(DOG_FACE_DOOR)];
      return shot([hd.x - fw[0] * 7.0 - fw[1] * 1.8, hd.y + 1.5, hd.z - fw[1] * 7.0 + fw[0] * 1.8], [-1.05, 1.45, -3.3], 32, { shake: lt > 0.3 && lt < 0.65 ? 0.05 : 0 });
    }
    // 2 反打近景: 从门这边看狗脸 (长焦), 背景是沙发和墙上合照
    case 'm10': {
      env('room'); setTOD('morning', 'morning', 0, gt);
      dog.root.position.set(...DOG_SPOT); dog.root.rotation.y = DOG_FACE_DOOR;
      const hope = lt > 0.5 && lt < 2.0, sad = lt >= 2.0;
      const k = hope ? smooth((lt - 0.5) / 0.25) : sad ? 1 - smooth((lt - 2.0) / 0.4) : 0;
      dog.update(gt, { sit: 1, perk: 0.15 + 0.85 * k, wag: sad ? 0.03 : 0.2 + 0.8 * k, tailDown: sad, eyes: sad ? 'sad' : 'normal', mouth: sad ? 'sad' : hope ? 'open' : 'flat',
        tongue: hope, yaw: hope ? 0.06 * Math.sin(lt * 9) : 0, tilt: hope ? 0.32 : sad ? -0.1 : 0.05, pitch: sad ? 0.22 * smooth((lt - 2) / 0.4) : 0, look: hope ? 0.4 : 0, lookY: sad ? 0.6 : 0 });
      ['哒', '哒', '哒…'].forEach((s, j) => L(() => pop(s, 520 + j * 140, 300 + j * 50, 70, '#8a5a44', lt - 0.35 - j * 0.28)));
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.25, 0]); if (lt < 2.0) bubble('是你吗？！', x + 40, y - 30, 50, lt - 0.85); else bubble('……不是你', x + 40, y - 30, 50, lt - 2.1, '#dfe9ff'); });
      const head = worldOf(dog.headPivot, [0, 0.45, 0.3]);
      const f = [Math.sin(DOG_FACE_DOOR), Math.cos(DOG_FACE_DOOR)];
      const pos = [head.x + f[0] * 5.4 - f[1] * 0.6, head.y + 0.1, head.z + f[1] * 5.4 + f[0] * 0.6];
      return shot(pos, [head.x - f[1] * 0.3, head.y - 0.75, head.z + f[0] * 0.3], 44, { hand: 0.6 });
    }
    // 3 顶拍: 圆地毯当画框, 狗蜷在中间压着拖鞋; 中午窗光
    case 'm30': {
      env('room'); setTOD('noon', 'noon', 0, gt);
      slipper2.visible = true; slipper2.position.set(1.35, 0.05, 1.35); slipper2.rotation.y = 0.9;
      dog.root.position.set(0.45, 0, 0.35); dog.root.rotation.y = 0.5;
      dog.update(gt, { dropY, lie: 1, carry: true, perk: 0.05, wag: 0.15, eyes: lt > 1.3 ? 'half' : 'normal', mouth: 'flat', yaw: 0.15 * Math.sin(lt * 1.2), tilt: 0.3, look: 0.5, lookY: -0.6 });
      L(() => { const [x, y] = proj(dog.slipper, [0, 0.2, 0]); pill('你的拖鞋', x + 170, y + 40, 40, PINK, '#fff', lt - 0.6); });
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.2, 0]); pop('闻闻…是你的味道', x + 60, y - 60, 50, LAV, lt - 1.3); });
      return shot([1.0, 10.5, 4.0], [0.5, 0.3, 0.75], 30);
    }
    // 4 横移跟拍 (贴地): 来回踱步, 地板磨出亮光带
    case 'h1': {
      env('room'); setTOD('noon', 'afternoon', smooth(p) * 0.4, gt);
      shinyPath.visible = true; shinyPath.material.opacity = 0.2 + 0.3 * smooth(p);
      const P = 1.5, ph = (lt % (2 * P)) / P, dir = ph < 1 ? 1 : -1, u = ph < 1 ? ph : 2 - ph;
      const turn = Math.min(u, 1 - u) < 0.08;
      const x = lerp(-1.9, 1.3, smooth(u));
      dog.root.position.set(x, 0, -0.9 + 0.08 * Math.sin(lt * 3)); dog.root.rotation.y = dir * Math.PI / 2 * (turn ? 0.4 : 1);
      dog.update(gt, { walk: turn ? 0.3 : 1, wag: 0.15, perk: 0.4, mouth: 'flat', yaw: -dir * 0.75, look: dir * 0.5, tilt: 0.1 * Math.sin(lt * 2) });
      L(() => pill(`踱步 ×${Math.round(lerp(1, 60, smooth(p)))}`, 830, 820, 44, ORANGE, '#fff', lt - 0.4));
      L(() => { const [x_, y] = proj(dog.headPivot, [0, 1.4, 0]); pop('怎么还不回来', x_, y, 46, SKY, lt - 1.1); });
      const cx = lerp(-0.6, 0.6, smooth(clamp(x / 3 + 0.6)));
      return shot([cx + 0.6, 1.3, 8.0], [cx * 0.9, 1.45, -1.0], 30, { push: lt < 0.5 });
    }
    // 5 过肩 + 窗框画中框: 从狗背后看窗外的路人, 狗回头
    case 'h3': {
      env('room'); setTOD('afternoon', 'afternoon', 0, gt, true);
      dog.root.position.set(2.6, platY, -2.0); dog.root.rotation.y = -0.75;
      const turnK = smooth((lt - 1.7) / 0.35);
      dog.update(gt, { sit: 1, perk: 0.75, wag: 0.25 + 0.35 * Math.max(0, Math.sin(lt * 3)), yaw: (-0.95 + 0.25 * Math.sin(lt * 1.4)) * (1 - turnK) + 0.55 * turnK, look: -1 + 1.6 * turnK, tilt: 0.25 * turnK, mouth: 'flat' });
      L(() => { const n = 200 + Math.floor(lt * 12); pill(`第${n}个路人：不是你`, 640, 1330, 42, SKY, '#fff', lt - 0.5); });
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.3, 0]); pop('?', x + 30, y, 110, LAV, lt - 2.0); });
      return shot([0.4, 4.2, 8.2], [2.1, 3.0, -2.2], 32, { hand: 0.7 });
    }
    // 6 低机位双人镜头: 门在两者中间, 逆光的下午金光
    case 'h5': {
      env('room'); setTOD('golden', 'golden', 0, gt);
      dog.root.position.set(-2.05, 0, -1.35); dog.root.rotation.y = Math.PI / 2;
      dog.update(gt, { dropY, lie: 1, perk: 0, wag: 0.02, tailDown: true, eyes: 'sad', mouth: 'sad', yaw: -0.55 + 0.1 * Math.sin(lt * 1.2), pitch: 0.1, tilt: 0.15, look: 0.3 });
      cat.root.position.set(0.15, 0, -1.35); cat.root.rotation.y = -Math.PI / 2; cat.root.scale.setScalar(0.85);
      cat.update(gt, { dropY: Math.max(0, -drop(lt - 0.3)), yaw: 0.45 + 0.1 * Math.sin(lt * 2), tilt: 0.2, look: -0.6, mouth: 'w', tails: { mode: 'single' } });
      L(() => { const [x, y] = proj(cat.headPivot, [0, 1.35, 0]); bubble('她会回来的啦', x + 40, y - 20, 44, lt - 0.9, '#fff3c4'); });
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.2, 0]); bubble('万一呢……', x + 30, y - 20, 44, lt - 2.0, '#dfe9ff'); });
      return shot([-0.95, 1.6, 9.8], [-0.95, 1.6, -1.35], 30, { hand: 0.7 });
    }
    // 7 挂钟特写 (指针飞转) → 摇臂下摇成高位俯拍: 狗变小, 对门嚎
    case 'h8': {
      env('room');
      const k = smooth(clamp(lt / 3.0)); setTOD('sunset', 'dusk', k, gt);
      clockAt(lerp(310, 480, k));
      matDent.visible = true; matDent.material.opacity = smooth((lt - 1.2) / 1.0);
      const howl = lt > 1.7 && ((lt - 1.7) % 1.6) < 1.15;
      dog.root.position.set(-0.75, 0, -1.45); dog.root.rotation.y = 0.2;
      dog.update(gt, { sit: 1, perk: howl ? 0.5 : 0.15, wag: 0.08, tailDown: !howl, eyes: howl ? 'half' : 'sad', mouth: howl ? 'o' : 'sad', pitch: howl ? -0.65 : 0.12, yaw: 0, tilt: howl ? 0.08 * Math.sin(lt * 14) : 0.15 });
      L(() => { if (lt > 1.0) return; pop('嘀嗒嘀嗒…', 760, 1260, 60, INK, lt - 0.15); });
      L(() => { if (!howl) return; const [x, y] = proj(dog.headPivot, [0, 1.5, 0.4]); const a = (lt - 1.7) % 1.6; txt('嗷呜——', x + 60 + 8 * Math.sin(lt * 20), y - 50 - a * 30, Math.max(4, 84 * back(a / 0.3)), '#ffffff', PINK, 12); });
      L(() => { if (lt < 2.0) return; const [x, y] = proj(matDent, [-0.5, 0, 0]); pill('狗形印子', x - 90, y + 30, 40, LAV, '#fff', lt - 2.3); });
      const c = smooth((lt - 0.85) / 1.4);
      return shot(lerpV([-1.05, 3.5, -1.25], [0.9, 3.9, 7.2], c), lerpV([-1.45, 3.5, -3.33], [-0.6, 1.15, -1.8], c), lerp(30, 30, c), { push: lt < 0.6 });
    }
    // 8 门开了: A 大特写(耳朵一竖) → B 狗视角仰拍(逆光的她) → C 全景重逢
    case 'open': {
      env('room'); setTOD('dusk', 'dusk', 0, gt);
      const o = smooth((lt - 1.0) / 0.55); doorHinge.rotation.y = -1.5 * o;
      doorLight.intensity = 6 * o; doorGlow.material.color.setRGB(1 + 0.7 * o, 0.95 + 0.5 * o, 0.75 + 0.2 * o); bloom.strength = 0.18 + 0.22 * o;
      const dogX = -0.75, dogZ = -1.45;
      if (lt < 1.0) {                                  // A
        dog.root.position.set(dogX, 0, dogZ); dog.root.rotation.y = 0.2;
        const pk = smooth((lt - 0.35) / 0.15);
        dog.update(gt, { sit: 1, perk: pk, flap: lt > 0.35 && lt < 0.6, wag: 0.1 + 0.6 * pk, eyes: 'normal', mouth: pk > 0.5 ? 'o' : 'sad', yaw: -0.25 * pk, look: -1 * pk, lookY: -0.5 * pk, pitch: -0.1 * pk });
        L(() => pop('咔哒', 800, 560, 84, '#f2b13a', lt - 0.3));
        const head = worldOf(dog.headPivot, [0, 0.45, 0.3]);
        return shot([head.x + 1.3, head.y + 0.3, head.z + 5.0], [head.x + 0.3, head.y - 0.1, head.z], 34, { hand: 0.5 });
      }
      person.root.position.set(-1.2, 0, lerp(-3.05, -2.55, smooth((lt - 2.1) / 0.6)));
      person.update(lt, { hug: lt > 2.1, wave: lt <= 2.1, headYaw: 0.05 * Math.sin(lt * 2) });
      if (lt < 2.1) {                                  // B: 狗视角 (狗自己不入画)
        dog.root.visible = false;
        L(() => { const [x, y] = proj(person.root, [0, 3.3, 0]); bubble('我回来啦！', x + 60, y - 30, 54, lt - 1.4, '#fff3c4'); });
        return shot([-0.35, 0.9, 3.8], [-1.2, 2.2, -3.3], 34, { hand: 0.8, push: false });
      }
      const u = lt - 2.1;                              // C
      const ph = (u % 1.1) / 1.1, spin = ph < 0.4 ? smooth(ph / 0.4) * Math.PI * 2 : 0;
      dog.root.position.set(0.15, 0, -0.85); dog.root.rotation.y = -0.55 + spin;
      dog.update(gt, { hop: 1, hopHz: 3.2, wag: 1, perk: 0.3, flap: true, eyes: 'happy', mouth: 'open', tongue: true, yaw: -0.15, tilt: 0.2 * Math.sin(lt * 7) });
      hearts.forEach((h, i) => {
        h.visible = true; const uu = (u * 0.6 + i / 18) % 1;
        h.position.set(-0.9 + Math.sin(i * 2.3) * 2.0 + 0.2 * Math.sin(lt * 2 + i), 0.6 + uu * 3.6, -1.6 + Math.cos(i * 1.7) * 0.8); h.scale.setScalar(0.42 * Math.sin(Math.PI * uu) + 0.01);
      });
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.5, 0]); pop('！！！', x + 40, y, 80, PINK, u - 0.05); });
      L(() => pill('尾巴转速：∞', 830, 830, 42, ORANGE, '#fff', u - 0.6));
      return shot([1.2, 2.6, 9.0], [-0.55, 1.75, -1.8], 30, { cut: u, shake: 0.045 });
    }
    // 9 科普: 中景慢慢环绕
    case 'why': {
      env('void'); setSky('#a98ae0', '#d8c6f6'); stage.material.color.set('#c7b2f0'); setTOD('morning', 'morning', 0, gt);
      dog.root.rotation.y = 0.35 * Math.sin(lt * 0.7);
      dog.update(gt, { dropY, sit: 1, perk: 0.5 + 0.4 * Math.sin(lt * 2), wag: 0.4, yaw: -0.35 * Math.sin(lt * 1.3), tilt: 0.2 * Math.sin(lt * 1.9), look: Math.sin(lt * 1.3) });
      floatClock.visible = true; floatClock.position.set(-1.05, 2.75 + 0.12 * Math.sin(lt * 2), 0.3); floatClock.rotation.set(0.1, 0.4 * Math.sin(lt), 0.15 * Math.sin(lt * 1.7));
      smellRings.forEach((r_, i) => { const uu = (lt * 0.5 + i / 4) % 1; r_.visible = true; r_.position.set(0.35 + uu * 1.4, 1.6 + uu * 1.2, 0.9); r_.scale.setScalar(0.5 + uu * 1.6); r_.material.opacity = 0.8 * (1 - uu); r_.rotation.y = 0.7; });
      L(() => { const [x, y] = proj(floatClock, [0, -0.75, 0]); pop('看不懂…', x, y, 46, INK, lt - 0.3); });
      ['生物钟：记得你平时几点回家', '你留下的气味慢慢变淡（科学家的猜想）', '实验：分开2小时比30分钟，迎接更热情']
        .forEach((s, i) => L(() => pill(s, 540, 210 + i * 100, 38, '#ffffff', INK, lt - 0.6 - i * 0.8)));
      const a = 0.3 * Math.sin(lt * 0.45);
      return shot([12.5 * Math.sin(a), 2.5, 12.5 * Math.cos(a)], [0, 1.7, 0], 30);
    }
    // 10 反转: A 过她的肩, 狗叼着拖鞋朝镜头走来 → B 主人视角俯拍, 摸摸头
    case 'back': {
      env('room'); setTOD('night', 'night', 0, gt);
      const gx = 1.35, gz = 0.6;
      const w = clamp(lt / 2.6), dx = lerp(-2.2, -0.35, smooth(w)), dz = gz;
      dog.root.position.set(dx, 0, dz); dog.root.rotation.y = Math.PI / 2;
      if (lt < 3.0) {   // A 侧面双人镜头: 她在右, 狗叼着拖鞋从左边走进来
        person.root.position.set(gx, 0, gz); person.root.rotation.y = -Math.PI / 2; person.update(lt, { headYaw: 0.45, reach: w > 0.7 });
        dog.update(gt, { walk: w < 1 ? 1 : 0, sit: w >= 1 ? 1 : 0, carry: true, wag: 0.85, perk: 0.6, eyes: 'happy', mouth: 'smile', yaw: -0.45 + 0.1 * Math.sin(lt * 2) });
        L(() => { const [x, y] = proj(dog.headPivot, [0, 1.35, 0]); bubble('拖鞋给你～', x, y, 44, lt - 0.5, '#fff3c4'); });
        return shot([-0.05, 1.9, 10.6], [-0.05, 1.55, gz], 40, { hand: 0.7 });
      }
      const u = lt - 3.0;
      slipper2.visible = true; slipper2.position.set(dx + 0.55, 0.05, dz + 0.45); slipper2.rotation.y = 1.0;
      dog.update(gt, { sit: 1, wag: 0.9, perk: 0.2, eyes: 'happy', mouth: 'open', tongue: true, pitch: -0.45, yaw: 0, tilt: 0.12 * Math.sin(lt * 2) });
      const head = worldOf(dog.headPivot, [0, 0.95, 0.1]);
      hand.visible = u > 0.35; const hk = smooth((u - 0.35) / 0.4);
      hand.position.set(head.x + 0.05, head.y + 0.08 + 0.7 * (1 - hk) + 0.05 * Math.sin(lt * 7), head.z + 0.55 * (1 - hk) + 0.1); hand.rotation.set(-0.4, dog.root.rotation.y, 0);
      hearts.forEach((h, i) => { h.visible = i < 12; const uu = (u * 0.45 + i / 12) % 1; h.position.set(head.x + Math.sin(i * 2.1) * 1.2, head.y - 0.8 + uu * 2.2, head.z + Math.cos(i * 1.3) * 0.6); h.scale.setScalar(0.25 * Math.sin(Math.PI * uu) + 0.01); });
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.6, 0]); pop('摸摸～', x + 120, y - 40, 56, PINK, u - 0.7); });
      const f = [Math.sin(dog.root.rotation.y), Math.cos(dog.root.rotation.y)];
      return shot([head.x + f[0] * 4.8, head.y + 3.3, head.z + f[1] * 4.8], [head.x, head.y - 1.0, head.z], 32, { cut: u, hand: 0.6 });
    }
    // 11 结尾: 居中对称
    case 'end': {
      env('void'); setSky('#f597bc', '#ffd0e0'); stage.material.color.set('#f9b6cd'); setTOD('morning', 'morning', 0, gt);
      dog.root.scale.setScalar(0.8); dog.root.rotation.y = 0.3 * Math.sin(lt * 1.2);
      dog.update(gt, { hop: 0.6, wag: 0.9, eyes: 'happy', mouth: 'open', tongue: true, perk: 0.4, yaw: 0.4 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.5) });
      hearts.forEach((h, i) => { h.visible = i < 8; const uu = (lt * 0.35 + i / 8) % 1; h.position.set(Math.sin(i * 2.4) * 1.8, 0.5 + uu * 3, 0.5); h.scale.setScalar(0.3 * Math.sin(Math.PI * uu) + 0.01); });
      return shot([0, 1.8, 10], [0, 2.4, 0]);
    }
  }
}

window.renderAt = (gt) => {
  let i = SCENES.length - 1; while (i > 0 && gt < STARTS[i]) i--;
  const sc = SCENES[i], name = sc[1], dur = sc[0], lt = gt - STARTS[i];
  labels = [];
  const cam = setup(name, lt, dur, gt, sc);
  const cut = cam.cut ?? lt;
  const tgt = V(cam.tgt), pos = V(cam.pos);
  if (cam.push) {   // 每个镜头先冲进去再回弹, 之后慢慢推近
    const k = 1 - 0.05 * clamp(cut / dur) - 0.12 * (1 - back(cut / 0.45));
    pos.sub(tgt).multiplyScalar(k).add(tgt);
  }
  const d = pos.distanceTo(tgt), hh = 0.016 * d * cam.hand, sh = cam.shake;
  pos.x += hh * Math.sin(lt * 0.9 + i) + sh * Math.sin(gt * 53); pos.y += 0.5 * hh * Math.sin(lt * 1.3 + i * 2) + sh * Math.cos(gt * 47);
  camera.fov = cam.fov; camera.updateProjectionMatrix();
  camera.position.copy(pos); camera.lookAt(tgt);
  sparkRoom.material.uniforms.uTime.value = gt; petals.material.uniforms.uTime.value = gt;
  composer.render();
  ctx.drawImage(renderer.domElement, 0, 0);
  labels.forEach(f => f());
  if (name === 'title') {
    const a = back(lt / 0.5);
    ctx.save(); ctx.translate(540, 470); ctx.scale(a, a);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-410, -145, 820, 290, 36); ctx.fill();
    txt('假如你家的狗', 0, -55, 74, INK); txt('每分钟等你一次', 0, 50, 82, ORANGE); ctx.restore();
    txt('会发生什么？', 540, 685, 76, '#fff', INK, 12);
    const [x, y] = proj(person.root, [0, 3.3, 0]); bubble('拜拜～乖乖等我', x + 200, y + 40, 42, lt - 0.8, '#fff3c4');
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
  if (i === SCENES.length - 1 && lt > dur - 0.8) { ctx.fillStyle = `rgba(255,255,255,${clamp((lt - dur + 0.8) / 0.8)})`; ctx.fillRect(0, 0, W, H); }
  return out.toDataURL('image/jpeg', 0.9);
};
window.READY = true;
