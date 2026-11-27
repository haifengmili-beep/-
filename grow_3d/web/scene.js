// 《如果你童年的狗，能看着你长大呢？》 3D 版 — 按 STORYBOARD.md 分镜. window.renderAt(t) 决定性渲染一帧.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, smooth, lerp, back, bounce, rng, canvasTex, std, rbox, mesh, box, heartTex, makeSparkles,
         makePerson, makeDog } from './lib.js';

const W = 1080, H = 1920;
const FONT = '"WenQuanYi Zen Hei", sans-serif';
await document.fonts.load(`80px ${FONT}`, '狗');

// ------------------------------------------------------------------ 时间线
// [时长, 名字, 你的年龄起, 止, 字幕, 英文, 它几岁, 它在干嘛]
const SCENES = [
  [3.2, 'title', 0, 0, '', '', '', ''],
  [4.2, 'age6', 6, 6, '你6岁生日那天，收到一只8周大的小狗\n你给它取名叫“饼干”', 'On your 6th birthday, you got an 8-week-old puppy. You named him Biscuit.', '8周', '第一次见你'],
  [3.8, 'age9', 6, 9, '9岁，你们形影不离\n它是你最好的朋友', 'At 9, you two were inseparable. Best friends.', '3岁', '陪你扔球'],
  [4.2, 'age12', 9, 12, '12岁，初中的日子不太好过\n它看见你在哭，就贴得更紧了', 'At 12, middle school was hard. He saw you crying and snuggled closer.', '6岁', '陪你哭'],
  [4.4, 'age15', 12, 15, '15岁，你忙了起来，不再陪它扔球\n可它还是每晚睡在你房门口', "At 15, you got busy. No more fetch. He still slept outside your door every night.", '9岁', '在门口睡'],
  [4.4, 'age18', 15, 18, '18岁，你去上大学了\n你说：“圣诞节我一定回来”', 'At 18, you left for college. "I\'ll be back for Christmas."', '12岁', '送你出门'],
  [4.0, 'wait', 18, 18, '你不在的每个晚上，它都在等\n还帮你把床捂得暖暖的', "Every night you were gone, he waited, and kept your bed warm.", '12岁', '帮你捂床'],
  [4.8, 'xmas', 18, 18, '圣诞节，你真的回来了\n它一下就听出了你的脚步声', "Christmas. You came home. He knew your footsteps right away.", '12岁', '等到了！'],
  [4.6, 'ball', 18, 18, '饼干心想：\n看着你长大，是世上最好的工作', 'Biscuit thinks: watching you grow up is the best job in the world.', '12岁', '陪你长大'],
  [4.6, 'fact', 0, 0, '狗的平均寿命，大约12年\n刚好陪你从6岁走到18岁', 'Dogs live about 12 years on average: from 6 to 18, your whole childhood.', '', ''],
  [4.4, 'end', 0, 0, '', '', '', ''],
];
const STARTS = []; { let a = 0; for (const s of SCENES) { STARTS.push(a); a += s[0]; } }
const IDX = Object.fromEntries(SCENES.map((s, i) => [s[1], i]));
const DANMAKU = ['破防了', '泪目', '我的狗也是这样', '现在就去抱狗', '饼干好乖', '哭死', '它一直在等你', '圣诞快乐', '最好的工作',
  '想我家狗狗了', '已经在抱了', '它老了…', '呜呜呜', '回家！', '每次回家它都在门口', '+1'];
const INK = '#42263f', PINK = '#e8588a', MINT = '#2ea47c', SKY = '#468cd6', LAV = '#8464c4', ORANGE = '#ee7a3c';
const AGE_SCALE = { 6: 0.66, 9: 0.78, 12: 0.88, 15: 0.97, 18: 1.0 };

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
{ const c = sun.shadow.camera; c.left = -9; c.right = 9; c.top = 9; c.bottom = -9; c.near = 0.5; c.far = 40; }
const lampLight = new THREE.PointLight('#ffc98a', 0, 0, 2); lampLight.position.set(1.0, 1.9, -2.6); scene.add(lampLight);
const doorLight = new THREE.PointLight('#ffd9a0', 0, 0, 2); doorLight.position.set(-1.2, 1.7, -2.7); scene.add(doorLight);
const treeLight = new THREE.PointLight('#ff9fb8', 0, 0, 2); treeLight.position.set(3.0, 1.6, -1.2); scene.add(treeLight);
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { top: { value: new THREE.Color('#79b6f0') }, bot: { value: new THREE.Color('#cfe6fb') } },
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top, bot; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.1, 0.45, vP.y)), 1.0); }`,
}));
scene.add(skyDome);
const setSky = (a, b) => { skyDome.material.uniforms.top.value.set(a); skyDome.material.uniforms.bot.value.set(b); };

// ------------------------------------------------------------------ 窗外 (天色 / 雨 / 雪 / 星星)
const SKYS = {
  day:    { top: '#8fc6f5', bot: '#d9ecfb', win: 'rgba(255,255,255,0.85)' },
  golden: { top: '#f6a66e', bot: '#ffe0a0', win: 'rgba(255,240,200,0.9)', sun: ['#fff0b0', 400, 210] },
  rainy:  { top: '#6f78b8', bot: '#a8a6d8', win: 'rgba(255,230,170,0.9)', dark: 1 },
  dawn:   { top: '#9fc2ee', bot: '#f3d9e6', win: 'rgba(255,255,255,0.8)' },
  night:  { top: '#3a3a90', bot: '#8a6cc4', win: 'rgba(255,214,120,1)', stars: 1, moon: 1, dark: 1 },
};
const skyline = canvasTex(512, 384, () => {});
function drawSkyline(tt, mode = 'day', fx = {}) {
  const S = SKYS[mode], g = skyline.userData.g, w = 512, h = 384;
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, S.top); gr.addColorStop(1, S.bot); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  if (S.sun) { const [c, x, y] = S.sun; const sg = g.createRadialGradient(x, y, 0, x, y, 90); sg.addColorStop(0, c); sg.addColorStop(0.35, c); sg.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = sg; g.fillRect(0, 0, w, h); }
  if (S.stars) { const r = rng(4); g.fillStyle = '#ffffff'; for (let i = 0; i < 40; i++) { g.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(tt * 3 + i)); g.fillRect(r() * w, r() * 160, 3, 3); } g.globalAlpha = 1; }
  if (S.moon) { g.fillStyle = '#fff6d0'; g.beginPath(); g.arc(400, 70, 30, 0, 7); g.fill(); g.fillStyle = S.top; g.beginPath(); g.arc(388, 60, 26, 0, 7); g.fill(); }
  const r = rng(9), cols = ['#f39cb4', '#9cbcf0', '#f6cf78', '#89cfa6', '#bba3ea'];
  for (let x = 0; x < w; x += 46) { const bh = 90 + r() * 170; g.fillStyle = cols[(x / 46) % 5 | 0]; g.fillRect(x, h - 60 - bh, 42, bh);
    if (S.dark) { g.fillStyle = 'rgba(40,30,90,0.4)'; g.fillRect(x, h - 60 - bh, 42, bh); }
    for (let wy = h - 60 - bh + 14; wy < h - 70; wy += 26) for (let wx = x + 6; wx < x + 36; wx += 14) { g.fillStyle = S.dark && r() < 0.35 ? 'rgba(80,70,140,0.8)' : S.win; g.fillRect(wx, wy, 7, 12); } }
  g.fillStyle = fx.snow > 0.5 ? '#f4f4ff' : S.dark ? '#5f8a7a' : '#8ccb80'; g.fillRect(0, h - 60, w, 60);
  if (fx.rain) { g.strokeStyle = 'rgba(220,230,255,0.6)'; g.lineWidth = 2; const rr = rng(7); for (let i = 0; i < 70; i++) { const x = rr() * w, y = ((rr() * h + tt * 600) % (h + 40)) - 20; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 6, y + 22); g.stroke(); } }
  if (fx.snow) { const rr = rng(11); g.fillStyle = '#ffffff'; for (let i = 0; i < 60 * fx.snow; i++) { const x = (rr() * w + Math.sin(tt * 1.3 + i) * 10), y = (rr() * h + tt * 40) % h; g.fillRect(x, y, 5, 5); } }
  skyline.needsUpdate = true;
}
drawSkyline(0);

// ------------------------------------------------------------------ 你的房间
const room = new THREE.Group(); scene.add(room);
let doorHinge, doorGlow, doorStrip, clockH, clockM, lampShade, calPage, calTex, calFlip, marksTex, wreath, tree, treeBulbs = [];
const BED = { x: -2.55, top: 0.62, z0: -0.7, z1: 1.9 };
{
  const plank = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d49a70'; g.fillRect(0, 0, w, h); const r = rng(3);
    for (let y = 0; y < h; y += 64) { g.fillStyle = `rgba(150,90,60,${0.15 + r() * 0.15})`; g.fillRect(0, y, w, 4); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(255,230,200,0.12)'; g.fillRect(r() * w, y + 10 + r() * 40, 80 + r() * 120, 3); } }
  });
  plank.wrapS = plank.wrapT = THREE.RepeatWrapping; plank.repeat.set(3, 3);
  const floor = mesh(new THREE.PlaneGeometry(16, 16), std('#ffffff', { map: plank }), false, true); floor.rotation.x = -Math.PI / 2; room.add(floor);
  const wall = (w, h, col, x, y, z, ry) => { const m = mesh(new THREE.PlaneGeometry(w, h), std(col), false, true); m.position.set(x, y, z); m.rotation.y = ry; room.add(m); return m; };
  wall(16, 9, '#f2a7c3', 0, 4.5, -3.4, 0); wall(12, 9, '#b99ae6', -3.6, 4.5, 1.6, Math.PI / 2);
  wall(12, 9, '#b99ae6', 3.8, 4.5, 1.6, -Math.PI / 2); wall(16, 9, '#f2a7c3', 0, 4.5, 5.5, Math.PI);
  // 窗 + 窗台
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), new THREE.MeshBasicMaterial({ map: skyline })); glass.position.set(1.6, 3.2, -3.38); room.add(glass);
  for (const [w, h, x, y] of [[2.9, 0.16, 1.6, 4.2], [2.9, 0.16, 1.6, 2.2], [0.16, 2.1, 0.2, 3.2], [0.16, 2.1, 3.0, 3.2], [0.1, 1.9, 1.6, 3.2]]) { const f = box(w, h, 0.14, '#ffffff', 0.02); f.position.set(x, y, -3.33); room.add(f); }
  // 门 + 门后的光 + 门缝的光
  doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.6), new THREE.MeshBasicMaterial({ color: '#fff4c8' })); doorGlow.position.set(-1.2, 1.3, -3.39); room.add(doorGlow);
  for (const [w, h, x, y] of [[0.14, 2.75, -1.92, 1.375], [0.14, 2.75, -0.48, 1.375], [1.58, 0.16, -1.2, 2.72]]) { const f = box(w, h, 0.18, '#ffffff', 0.02); f.position.set(x, y, -3.32); room.add(f); }
  doorHinge = new THREE.Group(); doorHinge.position.set(-1.85, 0, -3.33); room.add(doorHinge);
  const door = box(1.3, 2.56, 0.1, '#e9b98c', 0.02); door.position.set(0.65, 1.32, 0); doorHinge.add(door);
  for (const y of [0.75, 1.9]) { const pnl = box(0.9, 0.8, 0.04, '#f3cba4', 0.02); pnl.position.set(0.65, y, 0.06); doorHinge.add(pnl); }
  const knob = mesh(new THREE.SphereGeometry(0.07, 12, 8), std('#f2c14e', { metalness: 0.4, roughness: 0.4 })); knob.position.set(1.12, 1.25, 0.1); doorHinge.add(knob);
  wreath = new THREE.Group(); wreath.position.set(0.65, 1.95, 0.12); doorHinge.add(wreath);
  { const ring = mesh(new THREE.TorusGeometry(0.28, 0.08, 6, 16), std('#3a9a5a')); wreath.add(ring);
    for (let i = 0; i < 6; i++) { const b = mesh(new THREE.SphereGeometry(0.045, 8, 6), std('#e8394f')); b.position.set(Math.cos(i) * 0.28, Math.sin(i) * 0.28, 0.06); wreath.add(b); }
    const bw = box(0.22, 0.12, 0.05, '#e8394f', 0.01); bw.position.set(0, -0.3, 0.06); wreath.add(bw); }
  doorStrip = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.05), new THREE.MeshBasicMaterial({ color: '#ffd080' })); doorStrip.position.set(-1.2, 0.025, -3.27); room.add(doorStrip);
  // 门框上的身高刻度 (门母题)
  marksTex = canvasTex(96, 512, () => {});
  const marks = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 2.24), new THREE.MeshBasicMaterial({ map: marksTex, transparent: true })); marks.position.set(-2.24, 1.12 + 0.6, -3.385); room.add(marks);
  // 挂钟
  const clock = new THREE.Group(); clock.position.set(-1.2, 3.55, -3.33); room.add(clock);
  const rim = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 32), std('#8464c4')); rim.rotation.x = Math.PI / 2; clock.add(rim);
  const faceC = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.11, 32), std('#ffffff')); faceC.rotation.x = Math.PI / 2; clock.add(faceC);
  for (let i = 0; i < 12; i++) { const tk = box(0.04, 0.08, 0.02, '#42263f', 0.01); const a = i / 12 * Math.PI * 2; tk.position.set(Math.sin(a) * 0.29, Math.cos(a) * 0.29, 0.06); tk.rotation.z = -a; clock.add(tk); }
  clockH = new THREE.Group(); clockH.position.z = 0.07; clock.add(clockH); { const hh = box(0.05, 0.2, 0.02, '#42263f', 0.01); hh.position.y = 0.09; clockH.add(hh); }
  clockM = new THREE.Group(); clockM.position.z = 0.08; clock.add(clockM); { const mm = box(0.035, 0.29, 0.02, '#e8588a', 0.01); mm.position.y = 0.13; clockM.add(mm); }
  // 日历 (门左边, 会翻页)
  calTex = canvasTex(256, 300, () => {});
  const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.72), new THREE.MeshBasicMaterial({ map: calTex })); cal.position.set(-2.95, 2.55, -3.38); room.add(cal);
  calFlip = new THREE.Group(); calFlip.position.set(-2.95, 2.91, -3.37); room.add(calFlip);
  calPage = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.72), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide })); calPage.position.y = -0.36; calFlip.add(calPage);
  // 床 (靠左墙)
  const bx = BED.x, bz = (BED.z0 + BED.z1) / 2, bl = BED.z1 - BED.z0;
  const frame = box(1.8, 0.4, bl, '#c98a5a', 0.02); frame.position.set(bx, 0.2, bz); room.add(frame);
  const matt = box(1.7, 0.2, bl - 0.1, '#ffffff', 0.03); matt.position.set(bx, 0.52, bz); room.add(matt);
  const head = box(1.9, 1.3, 0.16, '#b07a4c', 0.02); head.position.set(bx, 0.65, BED.z0 - 0.05); room.add(head);
  const pillow = box(1.1, 0.18, 0.5, '#fff6fa', 0.05); pillow.position.set(bx, 0.7, BED.z0 + 0.35); room.add(pillow);
  const blanket = box(1.78, 0.08, 1.5, '#ff9ec0', 0.02); blanket.position.set(bx, 0.64, BED.z1 - 0.8); room.add(blanket);
  for (let i = 0; i < 4; i++) { const st_ = box(1.79, 0.085, 0.08, '#ffffff', 0.01); st_.position.set(bx, 0.64, BED.z1 - 0.2 - i * 0.38); room.add(st_); }
  // 书桌 (窗下) + 台灯 + 电脑 + 书
  const desk = box(2.0, 0.1, 0.8, '#f3cba4', 0.02); desk.position.set(1.6, 1.0, -2.9); room.add(desk);
  for (const x of [0.7, 2.5]) { const lg = box(0.1, 1.0, 0.7, '#e2b48a', 0.02); lg.position.set(x, 0.5, -2.9); room.add(lg); }
  const lapB = box(0.6, 0.04, 0.42, '#c9c4d8', 0.01); lapB.position.set(1.6, 1.07, -2.8); room.add(lapB);
  const lapS = mesh(rbox(0.6, 0.4, 0.03, 0.01), std('#9fd4ff', { emissive: new THREE.Color('#9fd4ff'), emissiveIntensity: 0.6 })); lapS.position.set(1.6, 1.28, -3.02); lapS.rotation.x = -0.15; room.add(lapS);
  for (let i = 0; i < 3; i++) { const b = box(0.4, 0.08, 0.3, ['#8464c4', '#2ea47c', '#ee7a3c'][i], 0.01); b.position.set(2.25, 1.09 + i * 0.08, -2.85); b.rotation.y = i * 0.2; room.add(b); }
  const lp = box(0.06, 0.5, 0.06, '#ffffff', 0.01); lp.position.set(1.0, 1.3, -3.05); room.add(lp);
  lampShade = mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.2, 8, 1, true), std('#ffe3b0', { side: THREE.DoubleSide, emissive: new THREE.Color('#ffc37a'), emissiveIntensity: 0 })); lampShade.position.set(1.0, 1.6, -3.0); room.add(lampShade);
  const chair = box(0.6, 0.08, 0.6, '#a98ad8', 0.02); chair.position.set(1.6, 0.58, -2.05); room.add(chair);
  const chairB = box(0.6, 0.7, 0.08, '#a98ad8', 0.02); chairB.position.set(1.6, 0.95, -1.75); room.add(chairB);
  for (const [x, z] of [[1.35, -2.3], [1.85, -2.3], [1.35, -1.8], [1.85, -1.8]]) { const l = box(0.06, 0.56, 0.06, '#8f74c4', 0.01); l.position.set(x, 0.28, z); room.add(l); }
  // 地毯 + 门口地垫
  const rug = mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.03, 48), std('#f7c1d3'), false, true); rug.position.set(0.5, 0.015, 0.9); room.add(rug);
  const mat = box(1.4, 0.04, 0.8, '#f48fb1', 0.01); mat.position.set(-1.2, 0.02, -2.6); mat.receiveShadow = true; room.add(mat);
  // 圣诞树 (右后角)
  tree = new THREE.Group(); tree.position.set(3.0, 0, -1.4); room.add(tree);
  { const trunk = box(0.25, 0.4, 0.25, '#8a5a3a', 0.01); trunk.position.y = 0.2; tree.add(trunk);
    [[0.9, 0.9, 0.85], [0.7, 0.8, 1.45], [0.5, 0.7, 1.95]].forEach(([r, h, y]) => { const c = mesh(new THREE.ConeGeometry(r, h, 8), std('#3fae6a')); c.position.y = y; tree.add(c); });
    const star = mesh(new THREE.OctahedronGeometry(0.16), std('#ffd84a', { emissive: new THREE.Color('#ffd84a'), emissiveIntensity: 1.2 })); star.position.y = 2.42; tree.add(star);
    const r = rng(31), bc = ['#ff6f9e', '#ffd84a', '#7fd0ff', '#ffffff', '#ff9a4a'];
    for (let i = 0; i < 22; i++) { const y = 0.6 + r() * 1.5, rad = (2.3 - y) * 0.42 + 0.05, a = r() * 6.28;
      const b = mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: bc[i % 5], emissive: new THREE.Color(bc[i % 5]), emissiveIntensity: 1 }));
      b.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad); tree.add(b); treeBulbs.push(b); }
    for (const [x, z, c] of [[-0.5, 0.5, '#e8394f'], [0.4, 0.6, '#468cd6'], [0, 0.75, '#ffd84a']]) { const g = box(0.36, 0.3, 0.36, c, 0.01); g.position.set(x, 0.15, z); tree.add(g); const rb = box(0.38, 0.06, 0.08, '#ffffff', 0.005); rb.position.set(x, 0.3, z); tree.add(rb); } }
}
function drawMarks(maxAge) {   // 门框上的铅笔身高线
  const g = marksTex.userData.g, w = 96, h = 512; g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.0)'; g.fillRect(0, 0, w, h);
  for (const a of [6, 9, 12, 15, 18]) {
    if (a > maxAge) continue;
    const ht = 3.2 * AGE_SCALE[a] * 0.92;  // 头顶高度 (世界坐标)
    const y = h - (ht - 0.6) / 2.24 * h;
    g.fillStyle = '#6b4134'; g.fillRect(4, y - 2, 46, 5);
    g.font = `bold 26px ${FONT}`; g.textBaseline = 'middle'; g.fillText(`${a}岁`, 50, y);
  }
  marksTex.needsUpdate = true;
}
const MONTHS = ['9月', '10月', '11月', '12月'];
function drawCal(mi, day) {
  const g = calTex.userData.g, w = 256, h = 300;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8394f'; g.fillRect(0, 0, w, 70);
  g.fillStyle = '#ffffff'; g.font = `bold 44px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(MONTHS[mi], w / 2, 36);
  g.fillStyle = '#42263f'; g.font = `bold 130px ${FONT}`; g.fillText(String(day), w / 2, 180);
  if (mi === 3 && day >= 24) { g.strokeStyle = '#e8394f'; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, 182, 92, 0, 7); g.stroke(); }
  calTex.needsUpdate = true;
}
drawCal(0, 1);

// ------------------------------------------------------------------ 公园
const park = new THREE.Group(); scene.add(park);
const clouds = [];
{
  const grass = mesh(new THREE.PlaneGeometry(200, 200), std('#8ccb80'), false, true); grass.rotation.x = -Math.PI / 2; park.add(grass);
  const path = mesh(new THREE.PlaneGeometry(200, 1.6), std('#f3d9b0'), false, true); path.rotation.x = -Math.PI / 2; path.position.set(0, 0.01, 1.6); park.add(path);
  const r = rng(21), cols = ['#f39cb4', '#8fb6ee', '#f6cf78', '#b79ce8', '#f7a882'];
  for (let i = 0; i < 14; i++) {   // 远处的小房子
    const w = 2 + r() * 1.5, h = 2 + r() * 3, x = -22 + i * 3.4 + r(), z = -14 - r() * 4;
    const b = box(w, h, 2, cols[i % 5], 0.02); b.position.set(x, h / 2, z); park.add(b);
    const roof = mesh(new THREE.ConeGeometry(w * 0.75, 1.2, 4), std(['#e8588a', '#8464c4', '#ee7a3c'][i % 3])); roof.rotation.y = Math.PI / 4; roof.position.set(x, h + 0.6, z); park.add(roof);
  }
  for (let i = 0; i < 9; i++) {    // 树
    const x = -9 + i * 2.3 + r() * 0.8, z = -4 - r() * 4;
    const t = box(0.3, 1.2, 0.3, '#9a6a44', 0.01); t.position.set(x, 0.6, z); park.add(t);
    const c1 = box(1.4, 1.1, 1.4, i % 2 ? '#5aae73' : '#6cc08a', 0.02); c1.position.set(x, 1.65, z); park.add(c1);
    const c2 = box(0.9, 0.7, 0.9, '#7fd09a', 0.02); c2.position.set(x, 2.45, z); park.add(c2);
  }
  for (let i = 0; i < 16; i++) { const f = box(0.08, 0.6, 0.08, '#ffffff', 0.01); f.position.set(-10 + i * 1.3, 0.3, -2.6); park.add(f); }
  const rail = box(21, 0.08, 0.06, '#ffffff', 0.01); rail.position.set(0, 0.5, -2.6); park.add(rail);
  const pc = ['#f58fb0', '#f7d264', '#b597ec', '#ffffff'];
  for (let i = 0; i < 80; i++) { const f = box(0.1, 0.1, 0.1, pc[i % 4], 0.01); f.castShadow = false; f.position.set((r() - 0.5) * 16, 0.05, (r() - 0.5) * 6 - 0.5); park.add(f); }
  for (let i = 0; i < 7; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) { const pp = box(1.4 + r(), 0.7 + r() * 0.4, 1.0, '#ffffff', 0.05); pp.position.set(k * 0.9, (k % 2) * 0.3, 0); pp.castShadow = false; c.add(pp); }
    c.position.set(-16 + i * 5, 7 + r() * 4, -16); c.userData.sp = 0.3 + r() * 0.4; park.add(c); clouds.push(c);
  }
}

// ------------------------------------------------------------------ 生日道具 / 球 / 行李箱 / 拍立得 / 彩纸 / 雪
const party = new THREE.Group(); scene.add(party);
let lid, flames = [], balloons = [];
{
  const table = box(1.6, 0.08, 1.0, '#ffffff', 0.02); table.position.set(-0.3, 0.9, -1.2); party.add(table);
  const cloth = box(1.64, 0.4, 1.04, '#ffb3c8', 0.01); cloth.position.set(-0.3, 0.72, -1.2); party.add(cloth);
  for (const x of [-0.95, 0.35]) { const l = box(0.08, 0.86, 0.08, '#e2b48a', 0.01); l.position.set(x, 0.43, -1.2); party.add(l); }
  const c1 = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.3, 24), std('#ffd6e4')); c1.position.set(-0.3, 1.09, -1.2); party.add(c1);
  const c2 = mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.06, 24), std('#ffffff')); c2.position.set(-0.3, 1.25, -1.2); party.add(c2);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * 6.28; const cd = box(0.04, 0.18, 0.04, ['#7fd0ff', '#ffd84a', '#ff6f9e'][i % 3], 0.005); cd.position.set(-0.3 + Math.cos(a) * 0.24, 1.37, -1.2 + Math.sin(a) * 0.24); party.add(cd);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 0.8) })); fl.position.set(cd.position.x, 1.5, cd.position.z); party.add(fl); flames.push(fl);
  }
  const gift = box(0.8, 0.6, 0.8, '#7fb8f0', 0.01); gift.position.set(0.95, 0.3, 0.3); party.add(gift);
  for (const [w, d] of [[0.82, 0.14], [0.14, 0.82]]) { const rb = box(w, 0.61, d, '#ffd84a', 0.005); rb.position.set(0.95, 0.3, 0.3); party.add(rb); }
  lid = new THREE.Group(); lid.position.set(0.95, 0.6, 0.3); party.add(lid);
  { const l = box(0.88, 0.14, 0.88, '#5f9fe0', 0.01); l.position.y = 0.07; lid.add(l); const bw = box(0.3, 0.16, 0.12, '#ffd84a', 0.01); bw.position.y = 0.2; lid.add(bw); }
  const bc = ['#ff6f9e', '#ffd84a', '#7fd0ff', '#b597ec', '#7fd09a'];
  for (let i = 0; i < 5; i++) { const g = new THREE.Group(); const b = mesh(new THREE.SphereGeometry(0.26, 16, 12), std(bc[i], { roughness: 0.35 })); b.scale.y = 1.15; g.add(b);
    const s = box(0.015, 1.2, 0.015, '#ffffff', 0.004); s.position.y = -0.85; g.add(s); g.position.set(-2.6 + i * 0.35, 2.6 + (i % 2) * 0.35, -2.9 + (i % 3) * 0.12); party.add(g); balloons.push(g); }
}
const ballTex = canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#ff6a4a'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd84a'; g.fillRect(0, h * 0.38, w, h * 0.24); });
const ball = mesh(new THREE.SphereGeometry(0.13, 16, 12), std('#ffffff', { map: ballTex })); scene.add(ball);
const suitcase = new THREE.Group(); scene.add(suitcase);
{ const b = box(0.55, 0.75, 0.3, '#ff9ec0', 0.02); b.position.y = 0.45; suitcase.add(b); const hd = box(0.25, 0.08, 0.05, '#c94a74', 0.01); hd.position.y = 0.86; suitcase.add(hd);
  for (const x of [-0.18, 0.18]) { const wh = box(0.08, 0.08, 0.08, '#42263f', 0.01); wh.position.set(x, 0.04, 0); suitcase.add(wh); } }
// 拍立得 (回忆)
const POLA = [['6岁', '#ffe0ea', 'cake'], ['9岁', '#d8f0ff', 'ball'], ['12岁', '#e6e0ff', 'heart'], ['15岁', '#2f3570', 'moon'], ['18岁', '#fff1d8', 'case']];
const polas = POLA.map(([label, bg, icon]) => {
  const t = canvasTex(200, 236, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 200, 236); g.fillStyle = bg; g.fillRect(12, 12, 176, 160);
    g.fillStyle = '#f7993c'; g.fillRect(110, 110, 50, 40); g.fillRect(118, 86, 38, 30); g.fillStyle = '#d9782a'; g.fillRect(118, 78, 10, 10); g.fillRect(146, 78, 10, 10);
    g.fillStyle = '#7a4730'; g.fillRect(46, 70, 40, 36); g.fillStyle = '#f9dbc6'; g.fillRect(52, 80, 28, 26); g.fillStyle = '#e08aa0'; g.fillRect(50, 106, 32, 40);
    g.fillStyle = icon === 'moon' ? '#fff6d0' : '#ff6f9e';
    if (icon === 'cake') { g.fillStyle = '#ffb3c8'; g.fillRect(30, 140, 40, 22); g.fillStyle = '#ffd84a'; for (let i = 0; i < 3; i++) g.fillRect(36 + i * 12, 130, 4, 10); }
    if (icon === 'ball') { g.fillStyle = '#ff6a4a'; g.beginPath(); g.arc(150, 50, 16, 0, 7); g.fill(); }
    if (icon === 'heart') { g.font = '40px sans-serif'; g.fillText('♥', 92, 64); }
    if (icon === 'moon') { g.beginPath(); g.arc(150, 44, 16, 0, 7); g.fill(); }
    if (icon === 'case') { g.fillStyle = '#ff9ec0'; g.fillRect(20, 118, 26, 36); }
    g.fillStyle = '#42263f'; g.font = `bold 34px ${FONT}`; g.textAlign = 'center'; g.fillText(label, 100, 210);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.73), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); scene.add(m); return m;
});
const confetti = []; { const cc = ['#ff6f9e', '#ffd84a', '#7fd0ff', '#b597ec', '#7fd09a', '#ffffff']; for (let i = 0; i < 46; i++) { const c = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.05), new THREE.MeshBasicMaterial({ color: cc[i % 6], side: THREE.DoubleSide })); scene.add(c); confetti.push(c); } }
const doorSnow = makeSparkles(70, [1.3, 2.6, 0.15], '#ffffff', 0.9, 5, -0.6); doorSnow.position.set(-1.2, 0, -3.31); scene.add(doorSnow);
const stage = mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.4, 48), std('#ffffff'), false, true); stage.position.y = -0.2; scene.add(stage);

// ------------------------------------------------------------------ 角色
const dog = makeDog(); scene.add(dog.root);
const girl = makePerson(); scene.add(girl.root);
const hearts = []; for (let i = 0; i < 18; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false })); scene.add(s); hearts.push(s); }
const sparkRoom = makeSparkles(90, [14, 8, 10], '#fff4fa', 0.9, 7, 0.12); scene.add(sparkRoom);
const petals = makeSparkles(60, [14, 9, 10], '#ff9fc2', 1.1, 11, -0.35); scene.add(petals);

// ------------------------------------------------------------------ 光 (每段的时间/心情)
const TOD = {
  warm:   { sky: '#fff0e6', gnd: '#cc9cb4', hi: 1.5,  sun: '#ffe2bc', si: 2.4, sp: [5, 8, 5],  lamp: 0, win: 'day' },
  park:   { sky: '#fff6f6', gnd: '#a8c890', hi: 1.55, sun: '#fffaf0', si: 2.6, sp: [4, 10, 6], lamp: 0, win: 'day' },
  rainy:  { sky: '#b4b2f0', gnd: '#6a5aa0', hi: 1.3,  sun: '#c8d0ff', si: 1.1, sp: [3, 8, 6],  lamp: 0.6, win: 'rainy' },
  desk:   { sky: '#c0aef0', gnd: '#7a64aa', hi: 1.25, sun: '#ffd2a8', si: 0.9, sp: [4, 8, 6],  lamp: 1, win: 'night' },
  late:   { sky: '#8f86d8', gnd: '#4c3f86', hi: 1.15, sun: '#9fa8ff', si: 0.7, sp: [4, 8, 6],  lamp: 0, win: 'night' },
  dawn:   { sky: '#eef0ff', gnd: '#b3a4c8', hi: 1.45, sun: '#e8f0ff', si: 2.0, sp: [3, 7, 7],  lamp: 0, win: 'dawn' },
  moon:   { sky: '#a59ae6', gnd: '#56489a', hi: 1.25, sun: '#c8d4ff', si: 1.0, sp: [-3, 8, 5], lamp: 0, win: 'night' },
  xmas:   { sky: '#d0b8f2', gnd: '#7a64aa', hi: 1.3,  sun: '#ffd2a8', si: 1.0, sp: [4, 8, 6],  lamp: 0.6, win: 'night' },
  golden: { sky: '#ffd9c2', gnd: '#c58fa8', hi: 1.35, sun: '#ffb36b', si: 2.6, sp: [7, 3.5, -4], lamp: 0, win: 'golden' },
};
function setTOD(k, tt = 0, fx = {}) {
  const A = TOD[k];
  hemi.color.set(A.sky); hemi.groundColor.set(A.gnd); hemi.intensity = A.hi;
  sun.color.set(A.sun); sun.intensity = A.si; sun.position.set(...A.sp);
  lampLight.intensity = 5 * A.lamp; lampShade.material.emissiveIntensity = 1.6 * A.lamp;
  drawSkyline(tt, A.win, fx);
}

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
function bubble(s, x, y, size, age, bg = '#ffffff', fg = INK, think = false) {
  if (age < 0) return;
  const k = back(age / 0.35); size = Math.max(4, size * k); y += 5 * Math.sin(age * 3);
  ctx.font = `${size}px ${FONT}`; const w = ctx.measureText(s).width + size * 1.2, h = size * 1.7;
  x = clamp(x, w / 2 + 16, W - w / 2 - 16);
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, size * 0.8); ctx.fill();
  if (think) { for (const [dx, dy, r] of [[-10, h / 2 + 14, 10], [-24, h / 2 + 36, 6]]) { ctx.beginPath(); ctx.arc(x + dx * k, y + dy * k, r * k, 0, 7); ctx.fill(); } }
  else { ctx.beginPath(); ctx.moveTo(x - 18 * k, y + h / 2 - 2); ctx.lineTo(x + 6 * k, y + h / 2 + 28 * k); ctx.lineTo(x + 18 * k, y + h / 2 - 2); ctx.fill(); }
  txt(s, x, y + 2, size, fg);
}
function pop(s, x, y, size, col, age) { if (age < 0) return; txt(s, x, y, Math.max(4, size * back(age / 0.3)), col, '#ffffff', 10); }
const v3 = new THREE.Vector3();
function proj(obj, off = [0, 0, 0]) { v3.set(...off); obj.localToWorld(v3); v3.project(camera); return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H]; }

function drawHUD(sc, lt, dur) {
  const [, name, a0, a1, , , dogAge, doing] = sc;
  if (!dogAge) return;
  const age = Math.round(lerp(a0, a1, smooth(clamp(lt / (dur * 0.6)))));
  const x = 34, y = 560;
  txt('你的年龄', x, y, 46, '#fff', INK, 8, 'left');
  txt('Y O U R   A G E', x, y + 36, 20, INK, null, 0, 'left');
  const ns = 96 * (0.7 + 0.3 * back(lt / 0.4));
  txt(String(age), x, y + 110, ns, '#fff', INK, 10, 'left');
  ctx.font = `${ns}px ${FONT}`; const w = ctx.measureText(String(age)).width;
  txt('岁', x + w + 12, y + 128, 40, '#fff', INK, 8, 'left');
  const lines = [`饼干: ${dogAge}`, `它在: ${doing}`, `一起: ${name === 'age6' ? '第1天' : `第${age - 5}年`}`];
  lines.forEach((l, i) => txt(l, x, y + 186 + i * 42, 32, '#fff', INK, 7, 'left'));
  const home = name === 'xmas' || name === 'ball';
  ctx.fillStyle = home ? MINT : '#e8587e'; ctx.beginPath(); ctx.roundRect(x, y + 318, 230, 48, 24); ctx.fill();
  txt(home ? '你回家了' : name === 'age6' ? '初次见面' : '它在变老', x + 115, y + 343, 30, '#fff');
}
function drawCaption(sc, lt) {
  const [, , , , cap, en] = sc; if (!cap) return;
  const lines = cap.split('\n');
  const y0 = 1560 - (lines.length - 1) * 40;
  let fs = 64; ctx.font = `${fs}px ${FONT}`;
  while (fs > 40 && Math.max(...lines.map(l => ctx.measureText(l).width)) > 1000) { fs -= 2; ctx.font = `${fs}px ${FONT}`; }
  lines.forEach((l, i) => { const u = lt - i * 0.15; if (u > 0) txt(l, 540, y0 + i * 84, Math.max(8, fs * back(u / 0.35)), '#ffe14a', '#6e3a3c', 14); });
  let ew = 28; ctx.font = `${ew}px ${FONT}`; while (ew > 18 && ctx.measureText(en).width > 1020) { ew--; ctx.font = `${ew}px ${FONT}`; }
  if (lt > 0.2) txt(en, 540, y0 + lines.length * 84 - 22, ew, '#fff', INK, 6);
}
function drawDanmaku(gt) {
  const start = STARTS[IDX.xmas] + 2.4, end = STARTS[IDX.ball] - 0.05;
  if (gt < start || gt > end) return;
  const dens = clamp((gt - start) / 1.5) * clamp((end - gt) / 0.8), r = rng(2026);
  const cols = ['#ffffff', '#ffe98f', '#a9e4ff', '#ffb3cf', '#bdf7c6'];
  for (let i = 0; i < 64; i++) {
    const t0 = start + (r() * (end - start + 2) - 2), sp = 300 + r() * 160, y = 130 + Math.floor(r() * 8) * 50;
    const col = cols[Math.floor(r() * 5)], s = DANMAKU[Math.floor(r() * DANMAKU.length)], keep = r() <= dens;
    const x = W - (gt - t0) * sp;
    if (x < -500 || x > W || !keep) continue;
    txt(s, x, y, 38, col, INK, 6, 'left');
  }
}

// ------------------------------------------------------------------ 分镜
function env(kind) { room.visible = kind === 'room'; park.visible = kind === 'park'; stage.visible = kind === 'void'; }
const drop = lt => -(1 - bounce(lt / 0.7)) * 5;
let labels = [];
const L = (fn) => labels.push(fn);
const V = (a) => new THREE.Vector3(...a);
function worldOf(obj, off = [0, 0, 0]) { obj.updateWorldMatrix(true, false); return obj.localToWorld(V(off)); }
const lerpV = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
const shot = (pos, tgt, fov = 30, o = {}) => ({ pos, tgt, fov, push: true, hand: 1, shake: 0, ...o });
const DOG_DOOR = [0.4, 0, 0.9], FACE_DOOR = Math.atan2(-1.2 - 0.4, -3.3 - 0.9);
function placeGirl(age, x, z, ry = 0, y = 0) { girl.root.visible = true; girl.root.position.set(x, y, z); girl.root.rotation.set(0, ry, 0); girl.root.scale.setScalar(AGE_SCALE[age]); }
function placeDog(kind, x, z, ry = 0, y = 0) { dog.root.visible = true; dog.root.position.set(x, y, z); dog.root.rotation.set(0, ry, 0); dog.root.scale.setScalar(kind === 'puppy' ? 0.42 : kind === 'young' ? 0.7 : 0.8); }
function ballAtMouth() { const p = worldOf(dog.headPivot, [0, 0.05, 0.95]); ball.position.copy(p); ball.visible = true; }

function setup(name, lt, dur, gt, sc) {
  dog.root.visible = false; girl.root.visible = false; ball.visible = false; suitcase.visible = false; party.visible = false;
  tree.visible = false; wreath.visible = false; doorSnow.visible = false; doorStrip.visible = false;
  hearts.forEach(o => o.visible = false); polas.forEach(o => o.visible = false); confetti.forEach(o => o.visible = false);
  doorHinge.rotation.y = 0; doorLight.intensity = 0; treeLight.intensity = 0; doorGlow.material.color.set('#fff4c8'); bloom.strength = 0.18;
  calFlip.visible = false; drawCal(0, 1);
  setSky('#79b6f0', '#cfe6fb');
  const dropY = -drop(lt);
  const ageNow = sc[3] || 18; drawMarks(name === 'title' || name === 'fact' || name === 'end' ? 18 : ageNow);
  const H_ = (lt0, n = 12, cx = 0, cy = 1, cz = 0, spread = 1.6, sc_ = 0.35) => hearts.forEach((h, i) => { if (i >= n) return; h.visible = lt0 > 0; const u = (lt0 * 0.45 + i / n) % 1; h.position.set(cx + Math.sin(i * 2.3) * spread + 0.15 * Math.sin(gt * 2 + i), cy + u * 2.6, cz + Math.cos(i * 1.7) * 0.5); h.scale.setScalar(sc_ * Math.sin(Math.PI * u) + 0.01); });
  switch (name) {
    // 0 标题: 门框刻度特写 → 下摇到地上的旧球和老饼干
    case 'title': {
      env('room'); setTOD('golden', gt);
      placeDog('adult', -2.0, -2.35, 0.5); dog.update(gt, { lie: 1, old: true, eyes: 'closed', wag: 0.1, perk: 0.1 });
      ball.visible = true; ball.position.set(lerp(-0.4, -1.25, smooth(lt / 1.6)), 0.13, -2.05); ball.rotation.z = lt * 4;
      const c = smooth((lt - 0.2) / 2.2);
      return shot(lerpV([-1.4, 2.3, 1.6], [-0.6, 2.4, 6.0], c), lerpV([-2.15, 2.55, -3.38], [-1.6, 2.0, -2.4], c), 36, { push: false });
    }
    // 1 6岁: A 全景(礼物盒弹开, 小狗蹦出来) → B 中景(你抱着它)
    case 'age6': {
      env('room'); setTOD('warm', gt); party.visible = true;
      flames.forEach((f, i) => f.scale.setScalar(0.8 + 0.3 * Math.sin(gt * 20 + i * 2)));
      balloons.forEach((b, i) => { b.position.y = 2.6 + (i % 2) * 0.35 + 0.08 * Math.sin(gt * 1.5 + i); b.rotation.z = 0.08 * Math.sin(gt + i); });
      const pop_ = lt - 0.7;
      lid.position.y = 0.6 + (pop_ > 0 ? Math.min(1.2, pop_ * 5) - Math.max(0, pop_ - 0.25) * 2.5 * (pop_ > 0.25 ? 1 : 0) : 0);
      lid.position.y = pop_ > 0 ? Math.max(0.07, 0.6 + 4 * pop_ - 7 * pop_ * pop_) : 0.6; lid.position.x = 0.95 + (pop_ > 0 ? Math.min(0.9, pop_ * 1.2) : 0); lid.rotation.z = pop_ > 0 ? -Math.min(1.4, pop_ * 3) : 0;
      if (pop_ > 0) confetti.forEach((c, i) => { const r = rng(i + 5); const vx = (r() - 0.5) * 3, vy = 2 + r() * 2.5, vz = (r() - 0.5) * 2, u = Math.min(pop_, 2.2);
        c.visible = true; c.position.set(0.95 + vx * u * 0.6, Math.max(0.03, 0.8 + vy * u - 2.2 * u * u), 0.3 + vz * u * 0.6); c.rotation.set(u * 8 + i, u * 6, i); });
      if (lt < 2.2) {
        placeGirl(6, -1.0, 0.5, 0.75); girl.update(lt, { kid: true, acc: ['hat'], shock: pop_ > 0 && pop_ < 0.6, smile: pop_ >= 0.6, wave: pop_ >= 0.6, headYaw: 0.1 });
        if (pop_ > 0.15) {
          const u = clamp((pop_ - 0.15) / 0.5);
          placeDog('puppy', lerp(0.95, 0.4, u), lerp(0.3, 0.9, u), -0.9, Math.max(0, 0.5 + 1.6 * u - 2.1 * u * u) * 1.2);
          dog.update(gt, { puppy: true, hop: u >= 1 ? 1 : 0, hopHz: 2.4, wag: 1, perk: 0.8, eyes: 'normal', mouth: 'open', tongue: true, yaw: 0.3, look: -0.6 });
          L(() => { const [x, y] = proj(dog.headPivot, [0, 1.3, 0]); pill('8周大！', x + 120, y - 30, 42, PINK, '#fff', pop_ - 0.6); });
        }
        L(() => pop('啪！', 760, 820, 90, ORANGE, pop_));
        return shot([0.4, 2.5, 9.0], [-0.05, 1.25, -0.2], 32);
      }
      const u = lt - 2.2;
      placeGirl(6, -0.2, 0.6, 0.2); girl.update(lt, { kid: true, acc: ['hat'], hold: true, happy: true, headYaw: 0.05, tilt: 0.12 });
      const gs = AGE_SCALE[6] * 1.12;
      placeDog('puppy', -0.2 + 0.08, 0.6 + 0.5 * gs, 0.2, 0.42 * gs);
      dog.update(gt, { puppy: true, wag: 0.9, perk: 0.7, eyes: 'happy', mouth: 'open', tongue: true, pitch: -0.2, yaw: -0.15, tilt: 0.15 * Math.sin(lt * 2) });
      H_(u, 10, -0.2, 1.0, 0.9, 1.0, 0.25);
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.45, 0]); pill('它叫“饼干”', x + 170, y - 20, 44, ORANGE, '#fff', u - 0.3); });
      return shot([0.6, 2.0, 6.6], [-0.2, 1.2, 0.6], 34, { cut: u });
    }
    // 2 9岁: 公园横移跟拍, 扔球
    case 'age9': {
      env('park'); setTOD('park', gt); setSky('#6fb0ee', '#d4e9fb');
      clouds.forEach((c, k) => { c.position.x = -16 + k * 5 + ((gt * c.userData.sp) % 10); });
      const gx = -1.5;
      const th = clamp((lt - 0.3) / 0.3);
      placeGirl(9, gx, 0.6, 1.2); girl.update(lt, { kid: true, throw: lt < 0.75 ? th : 0, smile: true, happy: lt > 2.9, wave: lt > 2.9, headYaw: lerp(0, 0.4, smooth((lt - 0.6) / 0.6)) });
      let dx, dRot = Math.PI / 2, run = 1, mouthBall = false;
      if (lt < 0.55) { dx = -0.8; run = 0; }
      else if (lt < 1.75) { dx = lerp(-0.8, 2.1, smooth((lt - 0.55) / 1.2)); }
      else if (lt < 1.95) { dx = 2.1; run = 0.3; mouthBall = true; }
      else if (lt < 3.0) { dx = lerp(2.1, -0.6, smooth((lt - 1.95) / 1.05)); dRot = -Math.PI / 2; mouthBall = true; }
      else { dx = -0.6; dRot = -Math.PI / 2; run = 0; mouthBall = true; }
      placeDog('young', dx, 0.7, dRot);
      dog.update(gt * (run ? 1.4 : 1), { walk: run, hop: lt > 3.0 ? 1 : 0, wag: 1, perk: 0.7, flap: run > 0.5, eyes: lt > 3.0 ? 'happy' : 'normal', mouth: mouthBall ? 'smile' : 'open', tongue: !mouthBall, yaw: dRot > 0 ? -0.45 : 0.45, tilt: 0.1 * Math.sin(lt * 3) });
      if (mouthBall) ballAtMouth();
      else if (lt > 0.5) { const u = clamp((lt - 0.5) / 1.0); ball.visible = true; ball.position.set(lerp(gx + 0.2, 2.3, u), lt < 1.5 ? 1.4 + 2.2 * u - 3.3 * u * u + 0.13 : 0.13 + 0.25 * Math.abs(Math.sin((lt - 1.5) * 9)) * Math.max(0, 1 - (lt - 1.5) * 3), 0.75); ball.rotation.z = -lt * 8; }
      else { ball.visible = true; ball.position.set(gx + 0.3, 1.1, 0.75); }
      if (lt > 3.0) H_(lt - 3.0, 8, -1.0, 1.2, 0.8, 0.9, 0.25);
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.4, 0]); pop('汪！', x, y, 60, ORANGE, lt - 1.9); });
      const cx = lerp(-0.7, 0.6, smooth(clamp((dx + 0.8) / 2.9)));
      return shot([cx + 0.3, 1.9, 10.2], [cx, 1.45, 0.4], 34, { push: lt < 0.5 });
    }
    // 3 12岁: 雨夜, 床上哭, 它贴过来
    case 'age12': {
      env('room'); setTOD('rainy', gt, { rain: 1 });
      placeGirl(12, BED.x - 0.35, 0.05, 0, BED.top);
      const hugK = smooth((lt - 2.3) / 0.5);
      girl.update(lt, { sit: 1, acc: ['bag'], sad: hugK < 0.5, tears: 1 - 0.6 * hugK, sob: hugK < 0.5, pitch: lerp(0.35, 0.05, hugK), headYaw: lerp(0, 0.45, hugK), hold: hugK > 0.5, closed: hugK > 0.5 });
      const j = clamp((lt - 0.7) / 0.6);
      const dx = lerp(-0.6, BED.x + 0.55, smooth(j)), dz = lerp(1.6, 0.15, smooth(j)), dy = j < 1 ? Math.max(0, BED.top * j + 1.4 * j * (1 - j)) : BED.top;
      placeDog('adult', dx, dz, j < 1 ? -0.6 : -0.2, dy);
      dog.update(gt, { sit: j >= 1 ? 1 : 0, lean: j >= 1 ? 0.22 : 0, wag: 0.35, perk: 0.4, eyes: hugK > 0.5 ? 'closed' : 'sad', mouth: 'flat', tongue: false, yaw: j >= 1 ? -0.45 : 0, tilt: j >= 1 ? 0.35 : 0, look: -0.8 });
      if (hugK > 0.5) H_(lt - 2.6, 6, BED.x, 1.4, 0.6, 0.7, 0.22);
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.3, 0]); bubble('我在呢', x + 80, y - 20, 44, lt - 1.6, '#fff3c4'); });
      return shot([-1.7, 2.4, 7.8], [-2.45, 1.6, 0.2], 30);
    }
    // 4 15岁: A 你背对着写作业, 它叼球等, 球滚走 → B 深夜它睡在你房门口
    case 'age15': {
      env('room');
      if (lt < 2.4) {
        setTOD('desk', gt);
        placeGirl(15, 1.6, -2.15, Math.PI, 0.62); girl.update(lt, { sit: 1, type: true, acc: ['phones'], headYaw: 0.05 * Math.sin(lt * 3), pitch: 0.12 });
        placeDog('adult', 0.15, -1.3, Math.PI / 2 + 0.3);
        const drop_ = lt > 1.3, sad = lt > 1.7;
        dog.update(gt, { sit: 1, wag: sad ? 0.03 : 0.6, tailDown: sad, perk: sad ? 0.1 : 0.8, eyes: sad ? 'sad' : 'normal', mouth: drop_ ? 'flat' : 'smile', tongue: false, yaw: -0.55, look: 0.6 });
        if (!drop_) ballAtMouth();
        else { const u = lt - 1.3; ball.visible = true; ball.position.set(0.9 + u * 0.7, 0.13 + Math.max(0, 0.45 - u * 3) * Math.abs(Math.cos(u * 10)), -0.95 + u * 1.6); ball.rotation.x = u * 9; }
        L(() => { const [x, y] = proj(girl.headG, [0, 1.4, 0]); bubble('等会儿……', x - 40, y - 40, 44, lt - 0.9); });
        L(() => { const [x, y] = proj(dog.headPivot, [0, 1.3, 0]); pop('…', x, y, 70, SKY, lt - 1.8); });
        return shot([-2.0, 2.9, 5.6], [0.75, 1.3, -1.9], 34);
      }
      const u = lt - 2.4;
      setTOD('late', gt); doorStrip.visible = true; doorLight.intensity = 0.6;
      placeDog('adult', -1.0, -2.3, 0.45); dog.update(gt, { lie: 1, eyes: 'closed', wag: 0.05, perk: 0.1, mouth: 'flat', tongue: false, tilt: 0.25, pitch: 0.1 });
      ['Z', 'z', 'z'].forEach((s, k) => L(() => { const [x, y] = proj(dog.headPivot, [0, 1.2, 0]); const a = (u * 0.8 + k / 3) % 1; ctx.globalAlpha = Math.sin(Math.PI * a); txt(s, x + 40 + a * 60, y - a * 120, 50 - k * 8, '#ffffff', LAV, 8); ctx.globalAlpha = 1; }));
      return shot([0.5, 0.8, 1.9], [-1.05, 0.75, -2.7], 36, { cut: u });
    }
    // 5 18岁: A 狗的过肩, 门口你挥手 → B 门关上, 反打它的脸
    case 'age18': {
      env('room'); setTOD('dawn', gt);
      placeDog('adult', ...[DOG_DOOR[0], DOG_DOOR[2]], FACE_DOOR);
      if (lt < 2.5) {
        doorHinge.rotation.y = -1.3; doorGlow.material.color.set('#f4f6ff'); doorLight.intensity = 2;
        placeGirl(18, -1.15, -2.85, 0.1); girl.update(lt, { acc: ['bag'], wave: true, smile: true, headYaw: 0.1 });
        suitcase.visible = true; suitcase.position.set(-0.6, 0, -2.8);
        dog.update(gt, { sit: 1, old: true, wag: 0.4, perk: 0.6, mouth: 'flat', tongue: false });
        L(() => { const [x, y] = proj(girl.headG, [0, 1.3, 0]); bubble('圣诞节我一定回来！', x + 60, y - 40, 44, lt - 0.5, '#fff3c4'); });
        const hd = worldOf(dog.headPivot, [0, 0.45, 0]), f = [Math.sin(FACE_DOOR), Math.cos(FACE_DOOR)];
        return shot([hd.x - f[0] * 6.4 - f[1] * 1.6, hd.y + 1.2, hd.z - f[1] * 6.4 + f[0] * 1.6], [-1.1, 1.75, -3.2], 32);
      }
      const u = lt - 2.5;
      doorHinge.rotation.y = -1.3 * (1 - smooth(u / 0.35));
      dog.update(gt, { sit: 1, old: true, wag: 0.02, tailDown: true, perk: 0, eyes: 'sad', mouth: 'sad', tongue: false, pitch: 0.1 * smooth(u), lookY: 0.4 });
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.3, 0]); bubble('她还会回来吗？', x + 30, y - 40, 46, u - 0.6, '#dfe9ff', INK, true); });
      const head = worldOf(dog.headPivot, [0, 0.45, 0.3]), f = [Math.sin(FACE_DOOR), Math.cos(FACE_DOOR)];
      return shot([head.x + f[0] * 4.6 - f[1] * 0.6, head.y + 0.1, head.z + f[1] * 4.6 + f[0] * 0.6], [head.x - f[1] * 0.3, head.y - 0.7, head.z + f[0] * 0.3], 44, { cut: u, hand: 0.5 });
    }
    // 6 等待: 月光, 它趴在你空着的床上, 日历翻到 12/24, 窗外下雪
    case 'wait': {
      env('room');
      const pg = Math.min(3, Math.floor(lt / 0.75)), ph = (lt % 0.75) / 0.75;
      const snow = smooth((lt - 2.2) / 1.0);
      setTOD('moon', gt, { snow });
      drawCal(pg, pg < 3 ? 1 : Math.min(24, 1 + Math.floor((lt - 2.25) * 30)));
      calFlip.visible = pg < 3 && ph < 0.5; calFlip.rotation.x = -ph * 2 * Math.PI * 0.5 * 2;
      placeDog('adult', BED.x + 0.05, 0.75, 0.25, BED.top);
      dog.update(gt * 0.8, { lie: 1, old: true, eyes: 'closed', wag: 0.05, perk: 0.05, mouth: 'flat', tongue: false, tilt: 0.3 });
      L(() => { const [x, y] = proj(dog.root, [0, 0.6, 0.4]); pill('暖暖的～', x + 170, y + 20, 40, ORANGE, '#fff', lt - 1.0); });
      L(() => { const [x, y] = proj(calPage.parent, [0, -0.4, 0]); pill('还有几天？', x + 200, y - 10, 38, SKY, '#fff', lt - 0.4); });
      return shot([-1.9, 3.1, 8.4], [-2.75, 1.5, -0.9], 34);
    }
    // 7 圣诞: A 耳朵一竖 → B 狗视角, 门开了 → C 重逢
    case 'xmas': {
      env('room'); setTOD('xmas', gt); tree.visible = true; wreath.visible = true; treeLight.intensity = 3;
      treeBulbs.forEach((b, i) => { b.material.emissiveIntensity = 0.5 + 1.5 * (0.5 + 0.5 * Math.sin(gt * 4 + i * 1.7)); });
      const o = smooth((lt - 1.2) / 0.55); doorHinge.rotation.y = -1.45 * o;
      doorGlow.material.color.setRGB(0.85 + 0.6 * o, 0.9 + 0.6 * o, 1.0 + 0.7 * o); doorLight.intensity = 4 * o; bloom.strength = 0.18 + 0.2 * o;
      doorSnow.visible = o > 0.05;
      if (lt < 1.2) {
        placeDog('adult', DOG_DOOR[0], DOG_DOOR[2], FACE_DOOR);
        const pk = smooth((lt - 0.35) / 0.15);
        dog.update(gt, { sit: 1, old: true, perk: pk, flap: lt > 0.35 && lt < 0.6, wag: 0.05 + 0.6 * pk, eyes: 'normal', mouth: pk > 0.5 ? 'o' : 'flat', tongue: false, lookY: -0.3 * pk });
        L(() => pop('叮铃铃～', 760, 520, 70, '#f2b13a', lt - 0.25));
        const head = worldOf(dog.headPivot, [0, 0.45, 0.3]), f = [Math.sin(FACE_DOOR), Math.cos(FACE_DOOR)];
        return shot([head.x + f[0] * 4.2 - f[1] * 0.6, head.y + 0.1, head.z + f[1] * 4.2 + f[0] * 0.6], [head.x - f[1] * 0.3, head.y - 0.5, head.z + f[0] * 0.3], 40, { hand: 0.5 });
      }
      placeGirl(18, -1.2, lerp(-3.0, -2.55, smooth((lt - 2.4) / 0.6)), 0); girl.update(lt, { acc: ['scarf', 'bag'], wave: lt < 2.4, hug: lt >= 2.4, smile: true, happy: lt > 2.8 });
      if (lt < 2.4) {
        L(() => { const [x, y] = proj(girl.headG, [0, 1.3, 0]); bubble('饼干！我回来啦！', x + 60, y - 30, 48, lt - 1.6, '#fff3c4'); });
        return shot([-0.3, 0.95, 5.4], [-1.2, 2.0, -3.3], 44, { hand: 0.8, push: false });
      }
      const u = lt - 2.4, ph = (u % 1.3) / 1.3, spin = ph < 0.4 ? smooth(ph / 0.4) * Math.PI * 2 : 0;
      placeDog('adult', -0.4, -1.4, -0.5 + spin);
      dog.update(gt, { old: true, hop: 0.8, hopHz: 2.4, wag: 1, perk: 0.4, flap: true, eyes: 'happy', mouth: 'open', tongue: true, yaw: -0.1, tilt: 0.2 * Math.sin(lt * 6) });
      H_(u, 16, -0.9, 0.6, -1.6, 2.0, 0.42);
      L(() => pill('它记得你的脚步声', 760, 830, 40, PINK, '#fff', u - 0.5));
      return shot([1.1, 2.6, 9.4], [-0.45, 1.75, -1.7], 30, { cut: u, shake: 0.03 });
    }
    // 8 回收: 你捡起旧球, 轻轻扔出去; 老饼干慢慢叼回来
    case 'ball': {
      env('room'); setTOD('golden', gt);
      const gx = 0.3, gz = 0.6, gRot = -Math.PI / 2 + 0.6;
      if (lt < 2.0) {   // A: 你在右, 它在左, 你把旧球轻轻扔出去
        placeGirl(18, gx, gz, gRot);
        const th = clamp((lt - 0.9) / 0.35);
        girl.update(lt, { throw: lt < 1.4 ? th : 0, smile: true, headYaw: 0.3, acc: [] });
        placeDog('adult', -1.25, 0.9, Math.PI / 2 - 0.35); dog.update(gt, { sit: 1, old: true, perk: 0.8, wag: 0.5, eyes: 'normal', mouth: 'o', tongue: false, yaw: -0.3, lookY: -0.4, look: 0.5 });
        if (lt < 1.0) { const h = worldOf(girl.arms[1], [0, -0.6, 0]); ball.visible = true; ball.position.copy(h); }
        else { const u = clamp((lt - 1.0) / 0.9); ball.visible = true; ball.position.set(lerp(gx - 0.3, -3.0, u), 0.13 + Math.max(0, 3.2 * u * (1 - u) + (1 - u) * 1.1), lerp(gz + 0.3, 1.6, u)); ball.rotation.z = lt * 6; }
        L(() => { const [x, y] = proj(girl.headG, [0, 1.3, 0]); bubble('这次，换我陪你玩', x - 60, y - 30, 46, lt - 0.3, '#fff3c4'); });
        return shot([-0.3, 2.6, 10.4], [-0.45, 1.9, 0.6], 34);
      }
      const u = lt - 2.0;   // B 低机位跟拍: 它慢慢叼回来
      placeGirl(18, gx, gz, gRot); girl.update(lt, { smile: true, happy: u > 1.6, reach: u > 1.6, headYaw: 0.25 });
      const w = clamp(u / 2.2), dx = lerp(-3.0, -0.75, smooth(w));
      placeDog('adult', dx, 1.15, Math.PI / 2 - 0.15);
      dog.update(gt * 0.75, { walk: w < 1 ? 0.6 : 0, sit: w >= 1 ? 1 : 0, old: true, wag: 0.7, perk: 0.5, eyes: 'happy', mouth: 'smile', tongue: false, yaw: -0.5 });
      ballAtMouth();
      if (u > 1.6) H_(u - 1.6, 8, -0.3, 1.0, 1.0, 1.0, 0.25);
      return shot([lerp(-1.7, -0.4, smooth(w)), 1.7, 9.8], [lerp(-1.8, -0.35, smooth(w)), 1.6, 1.0], 36, { cut: u });
    }
    // 9 事实: 紫色台子 + 时间轴
    case 'fact': {
      env('void'); setSky('#a98ae0', '#d8c6f6'); stage.material.color.set('#c7b2f0'); setTOD('warm', gt);
      placeDog('adult', 0, 0, 0.35 * Math.sin(lt * 0.7)); dog.root.scale.setScalar(0.9);
      dog.update(gt, { dropY, sit: 1, old: true, perk: 0.5, wag: 0.4, eyes: 'normal', mouth: 'smile', tongue: true, yaw: -0.3 * Math.sin(lt * 1.3), tilt: 0.15 * Math.sin(lt * 1.9) });
      L(() => {   // 时间轴: 6岁 → 18岁
        const k = smooth(clamp((lt - 0.4) / 2.2)), x0 = 150, x1 = 930, y = 280;
        ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.roundRect(x0, y - 10, x1 - x0, 20, 10); ctx.fill();
        ctx.fillStyle = '#ff7aa6'; ctx.beginPath(); ctx.roundRect(x0, y - 10, (x1 - x0) * k, 20, 10); ctx.fill();
        [6, 9, 12, 15, 18].forEach((a, i) => { const x = lerp(x0, x1, i / 4); ctx.fillStyle = (i / 4) <= k + 1e-3 ? '#ff7aa6' : '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 18, 0, 7); ctx.fill(); txt(`${a}岁`, x, y + 52, 34, '#fff', INK, 6); });
        txt('它的12年', lerp(x0, x1, k), y - 50, 40, '#fff', PINK, 8);
      });
      ['常见说法：平均寿命约10～13年', '品种、体型不同差别很大，小型犬通常更长寿']
        .forEach((s, i) => L(() => pill(s, 540, 460 + i * 96, 36, '#ffffff', INK, lt - 1.2 - i * 0.7)));
      const a = 0.3 * Math.sin(lt * 0.45);
      return shot([12.5 * Math.sin(a), 2.4, 12.5 * Math.cos(a)], [0, 1.6, 0], 30);
    }
    // 10 结尾: 粉色台子, 你抱着它
    case 'end': {
      env('void'); setSky('#f597bc', '#ffd0e0'); stage.material.color.set('#f9b6cd'); setTOD('warm', gt);
      placeGirl(18, -0.55, -0.2, 0.25); girl.update(lt, { hug: true, happy: true, acc: ['scarf'], tilt: 0.12 });
      placeDog('adult', 0.45, 0.15, -0.25); dog.update(gt, { sit: 1, old: true, wag: 0.8, eyes: 'happy', mouth: 'open', tongue: true, perk: 0.4, yaw: -0.25, tilt: 0.15 });
      H_(lt, 10, 0, 0.6, 0.4, 1.8, 0.32);
      return shot([0, 2.0, 11.5], [0, 2.9, 0]);
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
  if (cam.push) { const k = 1 - 0.05 * clamp(cut / dur) - 0.12 * (1 - back(cut / 0.45)); pos.sub(tgt).multiplyScalar(k).add(tgt); }
  const d = pos.distanceTo(tgt), hh = 0.016 * d * cam.hand, sh = cam.shake;
  pos.x += hh * Math.sin(lt * 0.9 + i) + sh * Math.sin(gt * 53); pos.y += 0.5 * hh * Math.sin(lt * 1.3 + i * 2) + sh * Math.cos(gt * 47);
  camera.fov = cam.fov; camera.updateProjectionMatrix();
  camera.position.copy(pos); camera.lookAt(tgt);
  sparkRoom.material.uniforms.uTime.value = gt; petals.material.uniforms.uTime.value = gt; doorSnow.material.uniforms.uTime.value = gt;
  composer.render();
  ctx.drawImage(renderer.domElement, 0, 0);
  labels.forEach(f => f());
  if (name === 'title') {
    const a = back((lt - 0.3) / 0.5);
    if (lt > 0.3) {
      ctx.save(); ctx.translate(540, 470); ctx.scale(a, a);
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-420, -145, 840, 290, 36); ctx.fill();
      txt('如果你童年的狗', 0, -55, 74, INK); txt('能看着你长大呢？', 0, 50, 80, ORANGE); ctx.restore();
    }
    if (lt > 1.2) txt('一只狗的12年', 540, 690, 60, '#fff', INK, 12);
  }
  if (name === 'end') {
    const a = smooth(lt / 0.8);
    ctx.globalAlpha = a;
    txt('它的一生，', 540, 470, 80, '#ffffff', '#c23f74', 12);
    txt('就是你的整个童年', 540, 580, 80, '#ffffff', '#c23f74', 12);
    ctx.globalAlpha = clamp((lt - 1.2) / 0.5);
    txt('今天就抱抱你的宠物吧 ♥', 540, 720, 54, INK, '#ffffff', 10);
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
