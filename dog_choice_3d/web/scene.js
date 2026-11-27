// 《假如你家狗每分钟做一次选择》 3D 版 — three.js 场景 + 2D 字幕/选择卡片层. window.renderAt(t) 决定性渲染一帧.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, smooth, lerp, back, bounce, rng, canvasTex, std, rbox, mesh, box, heartTex, makeSparkles,
         makeDog, makePerson, DOG } from './lib.js';

const W = 1080, H = 1920;
const FONT = '"WenQuanYi Zen Hei", sans-serif';
await document.fonts.load(`80px ${FONT}`, '狗');

// ------------------------------------------------------------------ 时间线
// m: HUD 分钟数 [起, 止]; A/B: 两个选项; pick: 0=A 1=B 2=都要; res: 结果
const SCENES = [
  { d: 3.0, n: 'title' },
  { d: 3.2, n: 'eat', m: [1, 1], A: '吃饭', B: '睡觉', pick: 0, res: '饭盆秒空',
    cap: '第1分钟：吃饭还是睡觉？\n当然是吃饭！', en: 'Minute 1: Eat or nap? Eat, obviously.' },
  { d: 3.2, n: 'ball', m: [2, 2], A: '追球', B: '啃骨头', pick: 0, res: '满屋追球',
    cap: '第2分钟：球还是骨头？\n球！冲！', en: 'Minute 2: Ball or bone? Ball! Go go go!' },
  { d: 3.2, n: 'slipper', m: [3, 3], A: '拖鞋', B: '袜子', pick: 2, res: '主人没鞋穿',
    cap: '第3分钟：拖鞋还是袜子？\n小孩子才做选择', en: 'Minute 3: Slipper or sock? Why not both.' },
  { d: 3.2, n: 'bark', m: [4, 4], A: '叫', B: '不叫', pick: 0, res: '全楼都听见',
    cap: '第4分钟：门外有动静\n叫还是不叫？汪汪汪！', en: 'Minute 4: A noise at the door. Bark or not? WOOF WOOF!' },
  { d: 3.2, n: 'leash', m: [5, 5], A: '出门', B: '在家', pick: 0, res: '主人被迫出门',
    cap: '第5分钟：出门还是在家？\n牵引绳已经叼来了', en: 'Minute 5: Go out or stay in? The leash is already here.' },
  { d: 3.2, n: 'sniff', m: [6, 6], A: '追鸽子', B: '闻一闻', pick: 1, res: '闻到隔壁狗',
    cap: '第6分钟：追鸽子还是闻草？\n先闻一闻再说', en: 'Minute 6: Chase pigeons or sniff the grass? Sniff first.' },
  { d: 3.2, n: 'puddle', m: [7, 7], A: '绕过去', B: '跳进去', pick: 1, res: '变成泥狗',
    cap: '第7分钟：水坑绕过去还是跳进去？\n啪叽！', en: 'Minute 7: Go around the puddle or jump in? SPLASH!' },
  { d: 4.0, n: 'rush', m: [8, 60], res: '转晕了',
    cap: '选择越来越快……\n选不过来，原地转圈！', en: 'Choices come faster and faster... too many! Spinning in circles!' },
  { d: 4.6, n: 'why',
    cap: '狗拿不定主意时，常会回头看你\n你的眼神和手势，就是它的提示', en: "When a dog can't decide, it often looks back at you. Your gaze and gestures are its hints." },
  { d: 4.8, n: 'back', m: [1440, 1440], A: '玩具', B: '你', pick: 1, res: '扑进你怀里',
    cap: '一天1440分钟，1440个选择\n它最常选的，还是你', en: '1,440 minutes a day, 1,440 choices — and it keeps choosing you.' },
  { d: 3.6, n: 'end' },
];
const STARTS = []; { let a = 0; for (const s of SCENES) { STARTS.push(a); a += s.d; } }
const IDX = Object.fromEntries(SCENES.map((s, i) => [s.n, i]));
const TP = 1.0;   // 每段第几秒做出选择
const RUSH = [['往左', '往右'], ['坐下', '趴下'], ['舔手', '舔脸'], ['叼树枝', '叼树叶'], ['摇尾巴', '摇更快'],
  ['闻这里', '闻那里'], ['汪', '汪汪'], ['追尾巴', '咬尾巴'], ['吃', '还是吃'], ['跑', '飞奔']];
const DANMAKU = ['哈哈哈我家狗就这样', '选择困难狗', '跳水坑太真实了', '拖鞋：我做错了什么', '汪汪汪', '转晕了哈哈哈',
  '狗：我全都要', '+1', '我的袜子！', '笑死', 'awsl', '每天出门都这样', '泥狗实锤', '狗生太难了'];
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
{ const c = sun.shadow.camera; c.left = -8; c.right = 8; c.top = 8; c.bottom = -8; c.near = 0.5; c.far = 40; }
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { top: { value: new THREE.Color('#79b6f0') }, bot: { value: new THREE.Color('#cfe6fb') } },
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top, bot; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.1, 0.45, vP.y)), 1.0); }`,
}));
scene.add(skyDome);
const setSky = (a, b) => { skyDome.material.uniforms.top.value.set(a); skyDome.material.uniforms.bot.value.set(b); };

// ------------------------------------------------------------------ 卧室
const room = new THREE.Group(); scene.add(room);
let glassMat, door, curtains = [];
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
  glassMat = new THREE.MeshBasicMaterial({ map: skyline });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), glassMat); glass.position.set(1.4, 3.2, -3.38); room.add(glass);
  for (const [w, h, x, y] of [[2.9, 0.16, 1.4, 4.2], [2.9, 0.16, 1.4, 2.2], [0.16, 2.1, 0.0, 3.2], [0.16, 2.1, 2.8, 3.2], [0.1, 1.9, 1.4, 3.2]]) {
    const f = box(w, h, 0.14, '#ffffff', 0.03); f.position.set(x, y, -3.33); room.add(f);
  }
  for (const x of [-0.2, 3.0]) {   // 窗帘 (会飘)
    const c = new THREE.Group(); c.position.set(x, 4.35, -3.2); room.add(c);
    const m = box(0.5, 2.4, 0.08, '#fff3b0', 0.04); m.position.y = -1.2; c.add(m); curtains.push(c);
  }
  // 珊瑚沙发
  const sofaM = std('#e8676f');
  const sb = box(3.0, 0.7, 1.2, sofaM, 0.12); sb.position.set(-1.6, 0.45, -2.5); room.add(sb);
  const sr = box(3.0, 1.0, 0.4, sofaM, 0.12); sr.position.set(-1.6, 1.2, -3.0); room.add(sr);
  for (const x of [-3.15, -0.05]) { const a = box(0.4, 1.1, 1.2, sofaM, 0.12); a.position.set(x, 0.55, -2.5); room.add(a); }
  for (const x of [-2.3, -0.9]) { const c = box(1.2, 0.25, 1.0, '#f39aa0', 0.1); c.position.set(x, 0.92, -2.4); room.add(c); }
  // 狗窝 (圆垫) + 绿植
  const bed = mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.32, 32), std('#9fc8f2')); bed.position.set(2.5, 0.16, -2.2); room.add(bed);
  const pad = mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.1, 32), std('#fff3e0')); pad.position.set(2.5, 0.33, -2.2); room.add(pad);
  const pot = box(0.5, 0.5, 0.5, '#ec8a74', 0.06); pot.position.set(0.7, 0.25, -2.9); room.add(pot);
  for (let i = 0; i < 6; i++) { const l = box(0.13, 0.8, 0.13, '#5aae73', 0.04); l.position.set(0.58 + i * 0.05, 0.85, -2.9); l.rotation.z = -0.6 + i * 0.24; room.add(l); }
  const rug = mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.03, 48), std('#f7c1d3'), false, true); rug.position.set(0.2, 0.015, 0.6); room.add(rug);
  // 门 (左墙)
  door = new THREE.Group(); door.position.set(-3.55, 0, 0.2); room.add(door);
  const frame = box(0.12, 2.9, 1.6, '#ffffff', 0.03); frame.position.y = 1.45; door.add(frame);
  const panel = box(0.12, 2.7, 1.35, '#f6cf78', 0.04); panel.position.set(0.04, 1.35, 0); door.add(panel);
  for (const y of [0.75, 1.95]) { const p = box(0.06, 0.8, 1.0, '#f0b95a', 0.03); p.position.set(0.11, y, 0); door.add(p); }
  const knob = mesh(new THREE.SphereGeometry(0.08, 16, 10), std('#ffd24a', { metalness: 0.4, roughness: 0.3 })); knob.position.set(0.16, 1.3, 0.48); door.add(knob);
}
// 地上的道具
const bowl = new THREE.Group(); room.add(bowl);
{ const b = mesh(new THREE.CylinderGeometry(0.38, 0.3, 0.22, 32), std('#7fb6ec')); b.position.y = 0.11; bowl.add(b);
  const rim = mesh(new THREE.TorusGeometry(0.37, 0.04, 8, 32), std('#ffffff')); rim.rotation.x = Math.PI / 2; rim.position.y = 0.22; bowl.add(rim); }
const kibble = new THREE.Group(); kibble.position.y = 0.2; bowl.add(kibble);
{ const r = rng(8); for (let i = 0; i < 16; i++) { const k = box(0.09, 0.07, 0.09, ['#c98a4a', '#e0a35c', '#b5743a'][i % 3], 0.025); k.position.set((r() - 0.5) * 0.45, r() * 0.06, (r() - 0.5) * 0.45); k.rotation.y = r() * 3; kibble.add(k); } }
const ball = mesh(new THREE.SphereGeometry(0.24, 32, 20), std('#e8333f', { roughness: 0.45 })); room.add(ball);
const ballStripe = mesh(new THREE.TorusGeometry(0.24, 0.035, 8, 32), std('#ffffff')); ball.add(ballStripe);
function makeBone(c = '#fffaf0') {
  const g = new THREE.Group(); const m = std(c);
  const s = mesh(rbox(0.5, 0.12, 0.12, 0.05), m); g.add(s);
  for (const [x, z] of [[-0.27, -0.07], [-0.27, 0.07], [0.27, -0.07], [0.27, 0.07]]) { const k = mesh(new THREE.SphereGeometry(0.085, 12, 8), m); k.position.set(x, 0, z); g.add(k); }
  return g;
}
const bone = makeBone(); room.add(bone);
function makeSlipper() {
  const g = new THREE.Group();
  const sole = box(0.26, 0.08, 0.5, '#ff9fc0', 0.04); g.add(sole);
  const strap = box(0.28, 0.12, 0.2, '#ffffff', 0.05); strap.position.set(0, 0.08, 0.1); g.add(strap);
  const pom = mesh(new THREE.SphereGeometry(0.07, 12, 8), std('#ff6f9e')); pom.position.set(0, 0.16, 0.12); g.add(pom);
  return g;
}
function makeSock() {
  const g = new THREE.Group();
  const leg = box(0.16, 0.42, 0.16, '#9fd0f5', 0.05); leg.position.y = -0.21; g.add(leg);
  for (const y of [-0.08, -0.2]) { const s = box(0.17, 0.05, 0.17, '#ffffff', 0.02); s.position.y = y; g.add(s); }
  const foot = box(0.16, 0.14, 0.3, '#9fd0f5', 0.05); foot.position.set(0, -0.42, 0.09); g.add(foot);
  return g;
}
const slipperFloor = makeSlipper(); slipperFloor.position.set(-1.0, 0.04, -1.4); slipperFloor.rotation.y = 0.5; room.add(slipperFloor);
const slipperMouth = makeSlipper(); slipperMouth.rotation.set(0, Math.PI / 2, 0.2);
const sockMouth = makeSock(); sockMouth.position.set(0.22, -0.02, 0.05); sockMouth.rotation.z = 0.3;
const leashMouth = new THREE.Group();
{ const h = mesh(new THREE.TorusGeometry(0.17, 0.045, 8, 20), std('#ff6f9e')); h.position.set(0, -0.2, 0.0); leashMouth.add(h);
  for (let i = 0; i < 4; i++) { const s = box(0.06, 0.22, 0.06, '#ff6f9e', 0.02); s.position.set(-0.15 - i * 0.04, -0.2 - i * 0.16, -0.06 * i); s.rotation.z = 0.3; leashMouth.add(s); } }

// ------------------------------------------------------------------ 公园
const park = new THREE.Group(); scene.add(park);
const clouds = [], pigeons = [], ripples = [];
let puddle;
{
  const grassT = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#86d56e'; g.fillRect(0, 0, w, h);
    const r = rng(21);
    for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? '#76c862' : '#9ae07e'; g.fillRect(r() * w, r() * h, 3, 9); }
  });
  grassT.wrapS = grassT.wrapT = THREE.RepeatWrapping; grassT.repeat.set(10, 10);
  const grass = mesh(new THREE.PlaneGeometry(60, 60), std('#ffffff', { map: grassT }), false, true); grass.rotation.x = -Math.PI / 2; park.add(grass);
  const path = mesh(new THREE.PlaneGeometry(60, 1.8), std('#f3d9a8'), false, true); path.rotation.x = -Math.PI / 2; path.position.set(0, 0.01, -1.6); park.add(path);
  // 背后的马卡龙楼房
  const cols = ['#f48fb1', '#7fb8f5', '#ffd166', '#b49cf0', '#ff9f80', '#8fd9b6'];
  const winT = canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0)';
    g.clearRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.9)'; for (let y = 16; y < h - 10; y += 40) for (let x = 14; x < w - 20; x += 38) g.fillRect(x, y, 22, 26); });
  for (let i = 0; i < 12; i++) {
    const bh = 4 + ((i * 7) % 5) * 1.3, x = -15 + i * 2.7;
    const b = box(2.4, bh, 2.0, cols[i % 6], 0.12); b.position.set(x, bh / 2, -13 - (i % 2) * 1.5); park.add(b);
    const wv = new THREE.Mesh(new THREE.PlaneGeometry(2.0, bh - 0.6), new THREE.MeshBasicMaterial({ map: winT, transparent: true }));
    wv.position.set(x, bh / 2, -12 + -(i % 2) * 1.5 + 0.01); park.add(wv);
    const roof = mesh(new THREE.ConeGeometry(1.6, 1.0, 4), std(['#ffffff', '#ff7aa6', '#ffd24a'][i % 3])); roof.rotation.y = Math.PI / 4; roof.position.set(x, bh + 0.5, -13 - (i % 2) * 1.5); park.add(roof);
  }
  // 树
  for (const [x, z, s] of [[-4.2, -3.5, 1.1], [4.6, -4.0, 1.2], [-6.5, -6, 1.4], [7, -7, 1.3], [2.6, -6.5, 0.9]]) {
    const t = box(0.35 * s, 1.6 * s, 0.35 * s, '#b07a4f', 0.06); t.position.set(x, 0.8 * s, z); park.add(t);
    const c = box(1.8 * s, 1.5 * s, 1.8 * s, '#5fbf6f', 0.4); c.position.set(x, 2.1 * s, z); park.add(c);
    const c2 = box(1.2 * s, 1.0 * s, 1.2 * s, '#7fd47f', 0.3); c2.position.set(x + 0.3, 2.9 * s, z + 0.2); park.add(c2);
  }
  // 小花
  { const r = rng(31); for (let i = 0; i < 40; i++) { const f = box(0.12, 0.12, 0.12, ['#ff7aa6', '#ffd24a', '#ffffff', '#b49cf0'][i % 4], 0.04);
    f.position.set((r() - 0.5) * 14, 0.08, -0.5 + (r() - 0.5) * 6); if (Math.abs(f.position.z + 1.6) < 1) f.position.z += 2; park.add(f); } }
  // 长椅
  { const s = box(2.2, 0.14, 0.6, '#f39a5d', 0.04); s.position.set(-3.2, 0.6, -2.9); park.add(s);
    const b = box(2.2, 0.5, 0.12, '#f39a5d', 0.04); b.position.set(-3.2, 1.0, -3.15); park.add(b);
    for (const x of [-4.1, -2.3]) { const l = box(0.12, 0.6, 0.5, '#8a6a9a', 0.03); l.position.set(x, 0.3, -2.9); park.add(l); } }
  // 云
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Group(); c.position.set(-12 + i * 6, 7 + (i % 3) * 1.4, -10 - (i % 2) * 3); park.add(c);
    for (const [x, y, s] of [[0, 0, 1.4], [1.1, -0.2, 1.0], [-1.1, -0.2, 1.0], [0.5, 0.5, 0.9]]) { const m = mesh(rbox(1.6 * s, 1.0 * s, 1.0 * s, 0.4), std('#ffffff', { emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.3 }), false, false); m.position.set(x, y, 0); c.add(m); }
    clouds.push(c);
  }
  // 鸽子
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Group(); park.add(p);
    const b = box(0.32, 0.26, 0.44, '#b9b3d9', 0.08); b.position.y = 0.2; p.add(b);
    const h = box(0.2, 0.2, 0.2, '#9a94c6', 0.06); h.position.set(0, 0.42, 0.2); p.add(h);
    const nk = box(0.21, 0.08, 0.16, '#7fd0b5', 0.03); nk.position.set(0, 0.3, 0.18); p.add(nk);
    const bk = box(0.06, 0.05, 0.1, '#f2a65a', 0.02); bk.position.set(0, 0.4, 0.33); p.add(bk);
    for (const sx of [-1, 1]) { const e = box(0.03, 0.04, 0.02, '#1b1218', 0.01); e.position.set(sx * 0.1, 0.46, 0.27); p.add(e); }
    const wings = [];
    for (const sx of [-1, 1]) { const wg = new THREE.Group(); wg.position.set(sx * 0.16, 0.26, 0); p.add(wg); const w = box(0.04, 0.2, 0.36, '#a7a0d0', 0.02); w.position.y = -0.04; wg.add(w); wings.push(wg); }
    p.userData.wings = wings; pigeons.push(p);
  }
  puddle = mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.02, 40), std('#6fb7f2', { roughness: 0.1, metalness: 0.1 }), false, true);
  puddle.scale.set(1.3, 1, 0.8); puddle.position.set(0.7, 0.02, 0.6); park.add(puddle);
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.96, 40), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; r.position.set(0.7, 0.035, 0.6); r.userData.sx = 1.3; park.add(r); ripples.push(r); }
}
// 水花 / 泥点
const drops = [];
{ const r = rng(77); for (let i = 0; i < 30; i++) { const d = mesh(rbox(0.1, 0.1, 0.1, 0.04), std(i % 3 ? '#8fcbf7' : '#a8784f'), false, false);
  d.userData = { vx: (r() - 0.5) * 4, vy: 3 + r() * 3, vz: (r() - 0.5) * 3 }; park.add(d); drops.push(d); } }
const stage = mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.4, 48), std('#ffffff'), false, true); stage.position.y = -0.2; scene.add(stage);

const dog = makeDog(); scene.add(dog.root);
const person = makePerson(); scene.add(person.root);
const leashGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 12 }, () => new THREE.Vector3()));
const leashLine = new THREE.Line(leashGeo, new THREE.LineBasicMaterial({ color: '#ff4f8b' })); leashLine.frustumCulled = false; scene.add(leashLine);
const hearts = []; for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false })); scene.add(s); hearts.push(s); }
const sparkRoom = makeSparkles(90, [16, 8, 12], '#fff4fa', 0.9, 7, 0.12); scene.add(sparkRoom);
const petals = makeSparkles(55, [16, 9, 12], '#ff9fc2', 1.1, 11, -0.35); scene.add(petals);

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
function pop(s, x, y, size, col, age, life = 99) { if (age < 0 || age > life) return; txt(s, x, y + 5 * Math.sin(age * 4), Math.max(4, size * back(age / 0.3)), col, '#ffffff', 10); }
const v3 = new THREE.Vector3();
function proj(obj, off = [0, 0, 0]) { v3.set(...off); obj.localToWorld(v3); v3.project(camera); return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H]; }
function projW(x, y, z) { v3.set(x, y, z).project(camera); return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H]; }

// 两张选择卡片 A / B, tp 秒时选定 (pick: 0/1/2=都要)
function cards(A, B, pick, lt, tp = TP, k = 1, cy = 330) {
  for (const j of [0, 1]) {
    const age = lt - (0.06 + j * 0.1) * k; if (age < 0) continue;
    const cx = 540 + (j ? 1 : -1) * 205, y = cy + 6 * Math.sin(lt * 3 + j * 2);
    const chosen = pick === 2 || pick === j, after = lt >= tp;
    let s = back(age / (0.35 * k));
    if (after) s *= chosen ? 1 + 0.15 * back((lt - tp) / (0.3 * k)) : 0.85;
    ctx.save(); ctx.translate(cx, y); ctx.scale(s, s); ctx.rotate((after && chosen ? 0.04 : 0) * Math.sin(lt * 6));
    ctx.globalAlpha = after && !chosen ? 0.5 : 1;
    ctx.fillStyle = 'rgba(66,38,63,0.25)'; ctx.beginPath(); ctx.roundRect(-158, -66, 324, 150, 30); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-165, -75, 330, 150, 30); ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = after && chosen ? MINT : '#f7c3d6'; ctx.stroke();
    ctx.fillStyle = j ? SKY : PINK; ctx.beginPath(); ctx.arc(-165 + 8, -75 + 8, 34, 0, 7); ctx.fill();
    txt(j ? 'B' : 'A', -157, -66, 40, '#fff');
    const label = j ? B : A; let fs = 64; ctx.font = `${fs}px ${FONT}`; while (ctx.measureText(label).width > 270) { fs -= 2; ctx.font = `${fs}px ${FONT}`; }
    txt(label, 0, 4, fs, INK);
    if (after && chosen) { const a = back((lt - tp) / (0.25 * k)); ctx.fillStyle = MINT; ctx.beginPath(); ctx.arc(140, -62, 38 * a, 0, 7); ctx.fill(); txt('✓', 140, -60, 48 * a, '#fff'); }
    if (after && !chosen) { ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-110, -45); ctx.lineTo(110, 45); ctx.moveTo(110, -45); ctx.lineTo(-110, 45); ctx.stroke(); }
    ctx.restore();
  }
  if (lt < tp) {   // VS + 倒计时圈
    const u = clamp(lt / tp), a = back(lt / (0.3 * k));
    ctx.fillStyle = '#ffe14a'; ctx.beginPath(); ctx.arc(540, cy, 50 * a, 0, 7); ctx.fill();
    ctx.strokeStyle = '#ff4d6d'; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(540, cy, 50 * a, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * (1 - u)); ctx.stroke();
    txt('VS', 540, cy + 2, 40 * a, INK);
  } else if (pick === 2) pop('都要！', 540, cy + 150, 76, '#ff4d6d', lt - tp);
}
function drawHUD(sc, lt) {
  if (!sc.m) return;
  const [m0, m1] = sc.m, u = sc.n === 'rush' ? clamp(lt / (sc.d * 0.9)) ** 1.6 : 1;
  const v = Math.round(lerp(m0, m1, u));
  const x = 34, y = 560;
  txt('狗狗选择日志', x, y, 46, '#fff', INK, 8, 'left');
  txt('D O G   C H O I C E S', x, y + 36, 20, '#fff', INK, 4, 'left');
  const ns = 96 * (0.7 + 0.3 * back(lt / 0.4)) * (sc.n === 'rush' ? 1 + 0.08 * Math.sin(lt * 30) : 1);
  txt('第', x, y + 128, 44, '#fff', INK, 8, 'left');
  txt(String(v), x + 54, y + 110, ns, '#fff', INK, 10, 'left');
  ctx.font = `${ns}px ${FONT}`; const w = ctx.measureText(String(v)).width;
  txt('分钟', x + 64 + w, y + 128, 44, '#fff', INK, 8, 'left');
  const choice = sc.n === 'rush' ? '闪电连选' : lt < TP ? '思考中' + '…'.repeat(1 + ((lt * 4) | 0) % 3) : sc.pick === 2 ? '全都要' : sc.pick ? sc.B : sc.A;
  [`选择: ${choice}`, `结果: ${lt < TP + 0.3 && sc.n !== 'rush' ? '?' : sc.res}`].forEach((l, i) => txt(l, x, y + 186 + i * 42, 32, '#fff', INK, 7, 'left'));
  const isBack = sc.n === 'back';
  ctx.fillStyle = isBack ? MINT : '#e8587e'; ctx.beginPath(); ctx.roundRect(x, y + 276, 220, 48, 24); ctx.fill();
  txt(isBack ? '还是选你' : sc.n === 'rush' ? '+52 选择' : '+1 选择', x + 110, y + 301, 30, '#fff');
}
function drawCaption(sc, lt) {
  if (!sc.cap) return;
  const lines = sc.cap.split('\n'), en = sc.en;
  const y0 = 1560 - (lines.length - 1) * 40;
  let fs = 66; ctx.font = `${fs}px ${FONT}`;
  while (fs > 40 && Math.max(...lines.map(l => ctx.measureText(l).width)) > 1000) { fs -= 2; ctx.font = `${fs}px ${FONT}`; }
  lines.forEach((l, i) => { const u = lt - i * 0.12; if (u > 0) txt(l, 540, y0 + i * 84, Math.max(8, fs * back(u / 0.35)), '#ffe14a', '#6e3a3c', 14); });
  let ew = 28; ctx.font = `${ew}px ${FONT}`; while (ew > 20 && ctx.measureText(en).width > 1020) { ew--; ctx.font = `${ew}px ${FONT}`; }
  if (lt > 0.2) txt(en, 540, y0 + lines.length * 84 - 22, ew, '#fff', INK, 6);
}
function drawDanmaku(gt) {
  const start = STARTS[IDX.rush] - 0.4, end = STARTS[IDX.why] + 0.8;
  if (gt < start || gt > end) return;
  const dens = clamp((gt - start) / 1.6), r = rng(2026);
  const cols = ['#ffffff', '#ffe98f', '#a9e4ff', '#ffb3cf', '#bdf7c6'];
  for (let i = 0; i < 64; i++) {
    const t0 = start + (r() * (end - start + 2) - 2), sp = 300 + r() * 160, y = [470, 980, 1035, 1090, 1145, 1200, 1255, 1310, 1365][Math.floor(r() * 9)];
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
const leashPts = Array.from({ length: 12 }, () => new THREE.Vector3());
function drawLeash() {   // 主人的手 → 狗项圈, 中间下垂
  person.root.updateMatrixWorld(true); dog.root.updateMatrixWorld(true);
  const a = new THREE.Vector3(0, -0.1, 0); person.hands[1].localToWorld(a);
  const b = new THREE.Vector3(0, 0.98, 0.15); dog.bodyPivot.localToWorld(b);
  const sag = 0.35 * (1 - clamp(a.distanceTo(b) / 4.5));
  leashPts.forEach((p, i) => { const u = i / 11; p.lerpVectors(a, b, u); p.y -= sag * 4 * u * (1 - u); });
  leashGeo.setFromPoints(leashPts); leashLine.visible = true;
}

function setup(sc, lt, gt) {
  const name = sc.n, dur = sc.d;
  room.visible = true; park.visible = false; stage.visible = false; dog.root.visible = false; person.root.visible = false;
  leashLine.visible = false; hearts.forEach(h => h.visible = false); drops.forEach(d => d.visible = false);
  dog.mouthSlot.clear();
  dog.root.position.set(0, 0, 0); dog.root.rotation.set(0, 0, 0); dog.root.scale.setScalar(1);
  person.root.rotation.set(0, 0, 0);
  camera.fov = 30;
  hemi.intensity = 1.5; hemi.color.set('#fff2f6'); sun.intensity = 2.3; sun.color.set('#fff0e0'); glassMat.color.set('#ffffff');
  setSky('#79b6f0', '#cfe6fb');
  curtains.forEach((c, i) => { c.rotation.x = 0.06 + 0.05 * Math.sin(gt * 1.7 + i); c.rotation.z = 0.03 * Math.sin(gt * 1.3 + i * 2); });
  door.rotation.set(0, 0, 0); door.position.x = -3.55;
  // 道具默认位置
  bowl.position.set(1.6, 0, 1.8); kibble.scale.setScalar(1); kibble.visible = true;
  ball.position.set(-2.3, 0.24, -1.3); ball.rotation.set(0, 0, 0);
  bone.position.set(1.8, 0.09, 0.4); bone.rotation.set(0, 0.6, 0); slipperFloor.visible = true;
  // 公园: 云在飘, 鸽子在啄
  clouds.forEach((c, i) => { c.position.x = -14 + ((i * 6 + gt * 0.5) % 30); });
  pigeons.forEach((p, i) => {
    p.position.set(1.3 + (i % 2) * 0.7 + 0.15 * Math.sin(gt * 0.7 + i), 0, -1.2 + (i >> 1) * 0.7); p.rotation.set(0, -0.8 + i * 0.5 + 0.3 * Math.sin(gt + i), 0);
    p.children[1].rotation.x = 0; p.userData.wings.forEach(w => w.rotation.z = 0);
    const peck = Math.max(0, Math.sin(gt * 5 + i * 1.7)) ** 4; p.children[1].position.y = 0.42 - 0.12 * peck; p.children[1].position.z = 0.2 + 0.08 * peck;
  });
  ripples.forEach((r, i) => { const u = (gt * 0.5 + i / 3) % 1; r.scale.set((0.3 + 0.7 * u) * 1.3, (0.3 + 0.7 * u) * 0.8, 1); r.material.opacity = 0.6 * (1 - u); });
  let camPos = [0, 2.4, 11.5], camTgt = [0, 1.3, 0];
  const p = lt / dur;
  switch (name) {
    case 'title': {
      dog.root.position.set(0.8, 0, 0.6); dog.root.rotation.y = -0.35;
      dog.update(gt, { hop: 1, wag: 2, yaw: 0.35 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.6), mouth: 'open' });
      person.root.position.set(-1.0, 0, 0.2); person.root.rotation.y = 0.35; person.update(lt, { wave: true });
      camPos = [0, 2.6, 13]; camTgt = [0, 1.6, 0];
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.4, 0]); pop('？', x, y, 110, ORANGE, lt - 1.0); });
      break;
    }
    case 'eat': {    // 吃饭 vs 睡觉 → 吃饭, 饭盆秒空
      bowl.position.set(0.35, 0, 1.05);
      const eat = lt > TP + 0.2;
      dog.root.position.set(0.1, 0, -0.05); dog.root.rotation.y = 0.25;
      const chomp = eat ? 0.12 * Math.abs(Math.sin(lt * 14)) : 0;
      dog.update(gt, { pitch: eat ? 0.55 + chomp : 0, yaw: eat ? 0.05 : 0.5 * Math.sin(lt * 3), look: eat ? 0 : Math.sin(lt * 3), wag: eat ? 2 : 0.6,
                       mouth: eat ? 'open' : 'smile', tongue: false, eyes: eat ? 'happy' : 'normal', dropY: drop(lt) });
      kibble.scale.setScalar(eat ? Math.max(0.01, 1 - (lt - TP - 0.2) / 1.3) : 1);
      camPos = [2.2, 3.2, 11.0]; camTgt = [0.1, 1.1, 0.3];
      L(() => { const [x, y] = proj(bowl, [0, 0.4, 0]); pop('咔嚓咔嚓', x + 120, y - 40, 54, ORANGE, lt - TP - 0.3, 1.0); });
      L(() => { const [x, y] = proj(bowl, [0, 0.4, 0]); pop('秒光！', x + 60, y - 120, 80, '#ff4d6d', lt - 2.4); });
      L(() => { const [x, y] = projW(2.5, 0.8, -2.2); if (lt < TP) pop('z z z', x, y, 44, LAV, lt - 0.3); });
      break;
    }
    case 'ball': {   // 球 vs 骨头 → 追球
      const run = clamp((lt - TP) / (dur - TP));
      const bx = lerp(-0.9, 2.0, smooth(run * 1.1)), dx = lerp(-1.7, 1.1, smooth(run));
      ball.position.set(bx, 0.24 + 0.25 * Math.abs(Math.sin(lt * 7)) * (run > 0 ? 1 : 0), 0.9); ball.rotation.z = -bx / 0.24;
      bone.position.set(-0.6, 0.09, 1.9);
      dog.root.position.set(lt < TP ? -1.7 : dx, 0, 0.6); dog.root.rotation.y = lt < TP ? 0.5 : Math.PI / 2 - 0.25;
      dog.update(gt, lt < TP ? { yaw: 0.6 * Math.sin(lt * 4), look: Math.sin(lt * 4), wag: 1, dropY: drop(lt) }
                              : { walk: 1, walkHz: 18, wag: 2, mouth: 'open', ears: 0.6, eyes: 'big' });
      bodyBob(run > 0 ? 0.08 : 0, lt);
      camPos = [lerp(-0.6, 0.6, run), 2.6, 12.0]; camTgt = [lerp(-0.7, 0.7, run), 1.1, 0.5];
      L(() => pop('冲！', 300, 1250, 100, '#ff4d6d', lt - TP - 0.2));
      L(() => { const [x, y] = proj(bone, [0, 0.4, 0]); pop('骨头：？', x, y, 44, LAV, lt - 1.8); });
      break;
    }
    case 'slipper': {   // 拖鞋 vs 袜子 → 都要
      const got = lt > TP;
      slipperFloor.visible = !got;
      if (got) { dog.mouthSlot.add(slipperMouth); dog.mouthSlot.add(sockMouth); }
      dog.root.position.set(0.6, 0, 0.7); dog.root.rotation.y = -0.35;
      dog.update(gt, got ? { hop: 1, wag: 2.2, eyes: 'happy', mouth: 'smile', tongue: false, yaw: 0.25 * Math.sin(lt * 5), tilt: 0.2 }
                         : { yaw: 0.5 * Math.sin(lt * 4), look: Math.sin(lt * 4), dropY: drop(lt) });
      person.root.position.set(-1.3, 0, -0.6); person.root.rotation.y = 0.45; person.update(lt, { shock: got, reach: got });
      camPos = [0, 2.8, 12.0]; camTgt = [-0.3, 1.4, 0];
      L(() => pill('主人：我的拖鞋！', 540, 1250, 44, PINK, '#fff', lt - TP - 0.6));
      break;
    }
    case 'bark': {    // 门外有动静 → 汪汪汪
      const knock = lt < 0.9 ? Math.max(0, Math.sin(lt * 26)) * 0.04 : 0;
      door.position.x = -3.55 + knock;
      const barks = [1.1, 1.5, 1.9, 2.3, 2.7], cur = barks.findLast(b => lt >= b);
      const ba = cur !== undefined ? lt - cur : 9, barking = ba < 0.25;
      dog.root.position.set(-1.4, 0, 0.9); dog.root.rotation.y = -1.0;
      dog.update(gt, { mouth: barking ? 'bark' : 'smile', tongue: barking, ears: lt > 0.4 ? 1 : 0, pitch: barking ? -0.25 : -0.05,
                       dropY: drop(lt) + (barking ? 0.18 * Math.sin(ba / 0.25 * Math.PI) : 0), wag: 0.4, eyes: lt > 0.4 ? 'big' : 'normal' });
      camPos = [2.6, 2.4, 9.8]; camTgt = [-1.6, 1.3, 0.4];
      L(() => { const [x, y] = projW(-3.4, 2.2, 0.2); pop('咚咚！', clamp(x, 160, 900), y, 64, LAV, lt - 0.1, 1.0); });
      barks.forEach((b, k) => L(() => { const [x, y] = proj(dog.headPivot, [0, 1.2, 0.6]); pop('汪！', x - 60 + (k % 2) * 160, y - k * 70, 80 + k * 10, '#ff4d6d', lt - b, 1.2); }));
      break;
    }
    case 'leash': {   // 出门 vs 在家 → 叼来牵引绳
      const w = clamp((lt - TP) / 1.3);
      dog.mouthSlot.add(leashMouth); leashMouth.visible = lt > TP;
      dog.root.position.set(lerp(-1.8, 0.0, smooth(w)), 0, 0.7); dog.root.rotation.y = lerp(0.3, 1.1, w);
      dog.update(gt, w < 1 && lt > TP ? { walk: 1, walkHz: 12, wag: 2, eyes: 'big', yaw: -0.2 }
                                       : lt > TP ? { hop: 1, wag: 2.4, eyes: 'happy', yaw: -0.5, tilt: 0.2 } : { yaw: 0.5 * Math.sin(lt * 4), look: Math.sin(lt * 4), dropY: drop(lt) });
      person.root.position.set(1.4, 0, 0.0); person.root.rotation.y = -0.6; person.update(lt, { reach: w >= 1, headYaw: -0.3 });
      camPos = [0, 2.7, 12.0]; camTgt = [0, 1.3, 0];
      L(() => pill('主人：好好好，走！', 540, 1250, 44, MINT, '#fff', lt - 2.4));
      break;
    }
    case 'sniff': {   // 公园: 追鸽子 vs 闻一闻 → 闻
      room.visible = false; park.visible = true; setSky('#4fa3ef', '#c9e7ff');
      const sn = lt > TP;
      dog.root.position.set(0.3, 0, 0.6); dog.root.rotation.y = 0.55;
      dog.update(gt, sn ? { pitch: 0.65 + 0.06 * Math.sin(lt * 18), yaw: 0.3 * Math.sin(lt * 1.5), wag: 1.4, eyes: 'squint', ears: -0.5 }
                        : { yaw: 0.6 * Math.sin(lt * 3), look: Math.sin(lt * 3), wag: 1, dropY: drop(lt) });
      person.root.position.set(-1.7, 0, -0.4); person.root.rotation.y = 0.5; person.update(lt, { hold: true, headYaw: 0.2 });
      drawLeash();
      camPos = [1.2, 2.5, 11.0]; camTgt = [0.1, 1.1, 0];
      L(() => {   // 气味线: 从草地飘进鼻子
        if (!sn) return;
        const [nx, ny] = proj(dog.headPivot, [0, 0.3, 0.9]);
        ctx.lineWidth = 7; ctx.lineCap = 'round';
        for (let k = 0; k < 4; k++) {
          const u = (lt * 0.9 + k / 4) % 1, [gx, gy] = projW(0.9 + k * 0.35, 0.02, 1.6 - k * 0.3);
          ctx.strokeStyle = ['#ff9fc2', '#b49cf0', '#ffd24a', '#7fd0ff'][k]; ctx.globalAlpha = Math.sin(Math.PI * u);
          ctx.beginPath();
          for (let s = 0; s <= 20; s++) { const v = s / 20 * u; const x = lerp(gx, nx, v) + 26 * Math.sin(v * 14 + lt * 6 + k), y = lerp(gy, ny, v); s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
      L(() => pill('嗅嗅：隔壁小白来过', 540, 1250, 44, LAV, '#fff', lt - 2.0));
      L(() => { const [x, y] = proj(pigeons[1], [0, 0.9, 0]); pop('咕？', x, y, 48, SKY, lt - 1.5); });
      break;
    }
    case 'puddle': {  // 绕过去 vs 跳进去 → 啪叽
      room.visible = false; park.visible = true; setSky('#4fa3ef', '#c9e7ff');
      pigeons.forEach(pg => { pg.position.z -= 3; pg.position.x += 1.5; });
      const run = clamp((lt - TP) / 0.45), jump = clamp((lt - TP - 0.45) / 0.45), landed = lt > TP + 0.9;
      const x = lt < TP ? -1.1 : jump > 0 ? lerp(-0.6, 0.7, jump) : lerp(-1.1, -0.6, run);
      dog.root.position.set(x, jump > 0 && jump < 1 ? 1.6 * Math.sin(Math.PI * jump) : 0, 0.6); dog.root.rotation.y = lt < TP ? 0.6 : Math.PI / 2 - 0.3;
      dog.root.rotation.x = jump > 0 && jump < 1 ? -0.4 + 0.8 * jump : 0;
      const sl = lt - TP - 0.9;
      dog.update(gt, landed ? { hop: sl > 0.6 ? 0.8 : 0, wag: 2.4, eyes: 'happy', mouth: 'open', mud: clamp(sl / 0.3), dropY: sl < 0.2 ? -0.15 * Math.sin(sl / 0.2 * Math.PI) : 0 }
                            : lt > TP ? { walk: 1, walkHz: 18, wag: 2, eyes: 'big', ears: 0.8, mouth: 'open' }
                                      : { yaw: 0.5 * Math.sin(lt * 4), look: Math.sin(lt * 4), wag: 1, dropY: drop(lt) });
      if (landed) drops.forEach(d => { const u = sl; const { vx, vy, vz } = d.userData; const y = 0.1 + vy * u - 4.9 * u * u;
        d.visible = y > 0; d.position.set(0.7 + vx * u, Math.max(0, y), 0.6 + vz * u); d.rotation.set(u * 9, u * 7, 0); });
      person.root.position.set(-2.2, 0, -0.6); person.root.rotation.y = 0.5; person.update(lt, { hold: !landed, shock: landed, reach: landed });
      drawLeash();
      camPos = [0.3, 2.6, 12.0]; camTgt = [0.0, 1.1, 0.3];
      L(() => pop('啪叽！', 640, 760, 130, SKY, sl));
      L(() => { const [x, y] = proj(person.root, [0, 3.4, 0]); pop('刚洗的澡！', clamp(x, 220, 860), y, 52, PINK, sl - 0.5); });
      break;
    }
    case 'rush': {   // 选择越来越快, 原地追尾巴转圈
      room.visible = false; park.visible = true; setSky('#4fa3ef', '#c9e7ff');
      const spin = 2 + 10 * p;
      dog.root.position.set(0, 0, 0.4); dog.root.rotation.y = lt * spin * 0.6 + lt * lt * 2.2;
      dog.update(gt, { eyes: lt > 1.6 ? 'dizzy' : 'big', mouth: 'open', wag: 2.6, walk: 1, walkHz: 20, tilt: 0.3 * Math.sin(lt * 9), dropY: drop(lt) });
      person.root.position.set(-2.1, 0, -1.0); person.root.rotation.y = 0.45; person.update(lt, { shock: true });
      camPos = [0, 2.6, 11.5]; camTgt = [0, 1.1, 0];
      const per = lerp(0.5, 0.28, p), idx = Math.floor(lt / per), l = lt - idx * per, [a, b] = RUSH[idx % RUSH.length];
      L(() => cards(a, b, (idx * 7) % 3 === 0 ? 2 : idx % 2, l, per * 0.55, per / 1.2));
      L(() => {   // 环绕的小选项
        const [cx, cy] = proj(dog.root, [0, 1.1, 0]); const r = rng(5);
        for (let k = 0; k < 10; k++) {
          const ang = lt * (1.5 + p * 3) + k * 0.63, rad = 330 + 40 * Math.sin(lt * 2 + k);
          const s = RUSH[k % RUSH.length][(k >> 1) % 2];
          pill(s, cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.55, 34, ['#ff7aa6', '#7fb8f5', '#ffb347', '#9b7ee0', '#3dbb8a'][k % 5], '#fff', lt - 0.2 - k * 0.12 + r() * 0.01);
        }
      });
      L(() => pop('转晕了～', 540, 1290, 76, LAV, lt - 2.3));
      break;
    }
    case 'why': {    // 科普
      room.visible = false; stage.visible = true; stage.material.color.set('#c7b2f0'); setSky('#a98ae0', '#d8c6f6');
      dog.root.rotation.y = 0.25 * Math.sin(lt * 0.7);
      const lookBack = lt > 2.6 && lt < 3.8;
      dog.update(gt, { sit: true, dropY: drop(lt), yaw: lookBack ? -1.0 : -0.3 * Math.sin(lt * 1.3), tilt: lookBack ? 0 : 0.3 * Math.sin(lt * 1.2), look: lookBack ? -1 : Math.sin(lt * 1.3), wag: 1 });
      ['拿不准时：常会回头看主人', '你用手一指：它多半看得懂', '先闻一闻：嗅觉受体约3亿个', '（人大约只有600万个）']
        .forEach((s, i) => L(() => pill(s, 540, 270 + i * 112, i === 3 ? 34 : 40, i === 3 ? 'rgba(255,255,255,0.75)' : '#ffffff', INK, lt - 0.3 - i * 0.6)));
      camPos = [0, 2.1, 9.6]; camTgt = [0, 1.25, 0];
      L(() => { if (lookBack) { const [x, y] = proj(dog.headPivot, [-0.9, 1.0, 0]); pop('主人？', x, y, 56, PINK, lt - 2.6); } });
      break;
    }
    case 'back': {   // 玩具 vs 你 → 你
      hemi.color.set('#ffe6d6'); sun.color.set('#ffd9b0'); glassMat.color.set('#ffd9c4'); setSky('#f7a37f', '#ffe0c2');
      ball.position.set(-1.9, 0.24, 1.0); bone.position.set(-1.4, 0.09, 1.6);
      const w = clamp((lt - TP - 0.3) / 1.4);
      dog.root.position.set(lerp(-0.9, 0.6, smooth(w)), 0, lerp(0.9, 0.6, w)); dog.root.rotation.y = lt < TP ? 0 : lerp(1.0, 0.7, w);
      dog.update(gt, lt < TP ? { yaw: 0.7 * Math.sin(lt * 3), look: Math.sin(lt * 3), wag: 1, dropY: drop(lt) }
                             : w < 1 ? { walk: 1, walkHz: 14, wag: 2.4, eyes: 'big', mouth: 'open', yaw: 0.2 }
                                     : { hop: 0.8, wag: 2.6, eyes: 'happy', mouth: 'open', yaw: 0.1, pitch: -0.3 });
      person.root.position.set(1.6, 0, 0.0); person.root.rotation.y = -0.7; person.update(lt, { headYaw: 0.25, reach: w > 0.6 });
      if (w >= 1) hearts.forEach((h, i) => { h.visible = true; const u = ((lt - TP - 1.7) * 0.45 + i / 14) % 1; h.position.set(1.0 + Math.sin(i * 2.1) * 1.6 + 0.2 * Math.sin(lt * 2 + i), 0.8 + u * 3.5, 0.6 + Math.cos(i) * 0.5); h.scale.setScalar(0.35 * Math.sin(Math.PI * u) + 0.01); });
      camPos = [0, 2.7, 12.5]; camTgt = [0.2, 1.3, 0];
      L(() => { const [x, y] = proj(ball, [0, 0.5, 0]); pop('玩具：？？', clamp(x, 160, 900), y, 44, LAV, lt - 2.0); });
      break;
    }
    case 'end': {
      room.visible = false; stage.visible = true; stage.material.color.set('#f9b6cd'); setSky('#f597bc', '#ffd0e0');
      dog.root.scale.setScalar(0.75); dog.root.rotation.y = 0.3 * Math.sin(lt * 1.2);
      dog.update(gt, { hop: 0.6, eyes: 'happy', mouth: 'open', wag: 2.4, yaw: 0.4 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.5) });
      camPos = [0, 1.8, 10]; camTgt = [0, 2.4, 0];
      break;
    }
  }
  camera.updateProjectionMatrix();
  return { camPos, camTgt };
}
function bodyBob(a, lt) { dog.bodyPivot.position.y += a * Math.abs(Math.sin(lt * 9)); }

const SHAKE = { rush: 0.035 };
window.renderAt = (gt) => {
  let i = SCENES.length - 1; while (i > 0 && gt < STARTS[i]) i--;
  const sc = SCENES[i], name = sc.n, dur = sc.d, lt = gt - STARTS[i];
  labels = [];
  const { camPos, camTgt } = setup(sc, lt, gt);
  // 镜头: 冲进去回弹 + 慢推 + 手持晃动; 叫/跳水坑时震屏
  const push = 1 - 0.06 * (lt / dur) - 0.14 * (1 - back(lt / 0.45));
  let sh = SHAKE[name] || 0;
  if (name === 'bark' && lt > 1.1) sh = 0.03;
  if (name === 'puddle') sh = Math.max(0, 0.08 * (1 - (lt - TP - 0.9) / 0.6)) * (lt > TP + 0.9 ? 1 : 0);
  const dir = new THREE.Vector3(...camPos).sub(new THREE.Vector3(...camTgt));
  const pos = new THREE.Vector3(...camTgt).add(dir.multiplyScalar(push));
  pos.x += 0.18 * Math.sin(lt * 0.9 + i) + sh * Math.sin(gt * 53); pos.y += 0.09 * Math.sin(lt * 1.3 + i * 2) + sh * Math.cos(gt * 47);
  camera.position.copy(pos); camera.lookAt(...camTgt);
  camera.updateMatrixWorld();
  sparkRoom.material.uniforms.uTime.value = gt; petals.material.uniforms.uTime.value = gt;
  composer.render();
  ctx.drawImage(renderer.domElement, 0, 0);
  if (sc.A && name !== 'rush') cards(sc.A, sc.B, sc.pick, lt);
  labels.forEach(f => f());
  if (name === 'title') {
    const a = back(lt / 0.5);
    ctx.save(); ctx.translate(540, 575); ctx.scale(a, a);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-430, -145, 860, 290, 36); ctx.fill();
    txt('假如你家狗', 0, -55, 72, INK); txt('每分钟做一次选择', 0, 50, 80, ORANGE); ctx.restore();
    txt('会发生什么？', 540, 790, 76, '#fff', INK, 12);
  }
  if (name === 'end') {
    const a = smooth(lt / 0.8);
    ctx.globalAlpha = a;
    txt('每一分钟，它都在选你', 540, 560, 66, '#ffffff', '#c23f74', 12);
    txt('你家狗最常选什么？', 540, 690, 58, INK, '#ffffff', 10);
    ctx.globalAlpha = clamp((lt - 1) / 0.4);
    txt('评论区告诉我 ↓', 540, 800, 58, '#a2285e', '#ffffff', 10);
    ctx.globalAlpha = 1;
  }
  drawHUD(sc, lt);
  drawCaption(sc, lt);
  drawDanmaku(gt);
  if (lt < 0.15 && i > 0) { ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - lt / 0.15)})`; ctx.fillRect(0, 0, W, H); }
  if (i === SCENES.length - 1 && lt > dur - 0.8) { ctx.fillStyle = `rgba(255,255,255,${clamp((lt - dur + 0.8) / 0.8)})`; ctx.fillRect(0, 0, W, H); }
  return out.toDataURL('image/jpeg', 0.9);
};
window.READY = true;
