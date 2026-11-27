// 《假如你家金毛把全家的鞋都咬了》 3D 版 — three.js 场景 + 2D 字幕层. window.renderAt(t) 决定性渲染一帧.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, smooth, lerp, back, bounce, rng, canvasTex, std, mesh, box, heartTex, makeSparkles,
         makePerson, makeDog, makeShoe } from './lib.js';

const W = 1080, H = 1920;
const FONT = '"WenQuanYi Zen Hei", "Noto Color Emoji", sans-serif';
await document.fonts.load(`80px ${FONT}`, '狗');

// ------------------------------------------------------------------ 时间线
// [时长, 名字, 罪证起, 罪证止, 顶墙力度, 字幕, 英文, 嘴里]
const SCENES = [
  [3.0, 'title', 0, 0, 0, '', '', ''],
  [3.4, 'flip', 0, 2, 25, '这是我夏天的鞋……', 'These are my summer shoes...', '叼着一只'],
  [3.2, 'croc', 2, 4, 45, '这双，也是我夏天的鞋', 'And these. Also my summer shoes.', '叼着一只'],
  [3.2, 'plaid', 4, 6, 65, '我冬天的鞋……', 'My winter shoes...', '叼着一只'],
  [3.6, 'bunny', 6, 8, 85, '那是你奶奶的。', "Those are your grandma's.", '叼着一只'],
  [3.6, 'black', 8, 9, 100, '左脚那只呢？', "And where's the left one?", '就是左脚那只'],
  [3.4, 'drop', 9, 10, 100, '……啪嗒\n罪证终于松口了', '...Plop. The evidence is finally released.', '已上交'],
  [4.8, 'why', 0, 0, 0, '面壁、躲眼神，是在说“别生气”\n它读懂的是你的语气，不一定是鞋', "Facing the wall and avoiding your eyes mean \"please don't be mad\" — it reads your tone, not the shoes.", ''],
  [4.8, 'warm', 0, 0, 0, '人字拖我能原谅\n过来吧，不罚你了', "The flip-flops, I can forgive. Come here, you're off the hook.", ''],
  [4.0, 'end', 0, 0, 0, '', '', ''],
];
const STARTS = []; { let a = 0; for (const s of SCENES) { STARTS.push(a); a += s[0]; } }
const IDX = Object.fromEntries(SCENES.map((s, i) => [s[1], i]));
const DANMAKU = ['还叼着呢哈哈哈', '左脚那只在嘴里！', '人赃俱获', '狗：我看不见我看不见', '面壁思过中', '墙要被顶穿了',
  '金毛：不是我', '奶奶的兔子……', 'hhhhhh', '这表情太委屈了', '+1', '心疼兔子拖鞋', '罪证确凿', '嘴硬（字面意思）', '松口！松口！'];
const INK = '#42263f', PINK = '#e8588a', MINT = '#2ea47c', SKY = '#468cd6', LAV = '#8464c4', GOLD = '#e3962e';

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
const camera = new THREE.PerspectiveCamera(36, W / H, 0.05, 900);
const scene = new THREE.Scene();
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.18, 0.5, 1.0));
composer.addPass(new OutputPass());
const out = document.getElementById('out'); const ctx = out.getContext('2d');

const hemi = new THREE.HemisphereLight('#fff2f6', '#c99bb8', 1.5); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0e0', 2.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 5; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
sun.position.set(4, 9, 6); sun.target.position.set(-0.5, 0, -1); scene.add(sun, sun.target);
{ const c = sun.shadow.camera; c.left = -7; c.right = 7; c.top = 7; c.bottom = -7; c.near = 0.5; c.far = 40; }
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { top: { value: new THREE.Color('#79b6f0') }, bot: { value: new THREE.Color('#cfe6fb') } },
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top, bot; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.1, 0.45, vP.y)), 1.0); }`,
}));
scene.add(skyDome);
const setSky = (a, b) => { skyDome.material.uniforms.top.value.set(a); skyDome.material.uniforms.bot.value.set(b); };

// ------------------------------------------------------------------ 卧室 (金毛在左后角面壁)
const WALL_Z = -3.4;
const room = new THREE.Group(); scene.add(room);
const curtains = [];
{
  const plank = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d49a70'; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let y = 0; y < h; y += 64) { g.fillStyle = `rgba(150,90,60,${0.15 + r() * 0.15})`; g.fillRect(0, y, w, 4); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(255,230,200,0.12)'; g.fillRect(r() * w, y + 10 + r() * 40, 80 + r() * 120, 3); } }
  });
  plank.wrapS = plank.wrapT = THREE.RepeatWrapping; plank.repeat.set(3, 3);
  const floor = mesh(new THREE.PlaneGeometry(16, 16), std('#ffffff', { map: plank }), false, true); floor.rotation.x = -Math.PI / 2; room.add(floor);
  const wallTex = canvasTex(256, 256, (g, w, h) => {   // 墙纸: 小圆点
    g.fillStyle = '#f2a7c3'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let y = 16; y < h; y += 64) for (let x = 16 + (y / 64 % 2) * 32; x < w; x += 64) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  });
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(6, 3.4);
  const backW = mesh(new THREE.PlaneGeometry(16, 9), std('#ffffff', { map: wallTex }), false, true); backW.position.set(0, 4.5, WALL_Z); room.add(backW);
  const leftW = mesh(new THREE.PlaneGeometry(10, 9), std('#b99ae6'), false, true); leftW.rotation.y = Math.PI / 2; leftW.position.set(-3.6, 4.5, 1.6); room.add(leftW);
  const rightW = mesh(new THREE.PlaneGeometry(10, 9), std('#b99ae6'), false, true); rightW.rotation.y = -Math.PI / 2; rightW.position.set(3.8, 4.5, 1.6); room.add(rightW);
  for (const [z, x, ry] of [[WALL_Z + 0.01, 0, 0], [1.6, -3.59, Math.PI / 2]]) {   // 踢脚线
    const b = box(ry ? 10 : 16, 0.16, 0.04, '#ffffff', 0.01); b.position.set(x, 0.08, z); b.rotation.y = ry; room.add(b);
  }
  const skyline = canvasTex(512, 384, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8fc6f5'); gr.addColorStop(1, '#d9ecfb'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = rng(9), cols = ['#f39cb4', '#9cbcf0', '#f6cf78', '#89cfa6', '#bba3ea'];
    for (let x = 0; x < w; x += 46) { const bh = 90 + r() * 200; g.fillStyle = cols[(x / 46) % 5 | 0]; g.fillRect(x, h - bh, 42, bh);
      g.fillStyle = 'rgba(255,255,255,0.85)'; for (let wy = h - bh + 14; wy < h - 10; wy += 26) for (let wx = x + 6; wx < x + 36; wx += 14) g.fillRect(wx, wy, 7, 12); }
  });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9), new THREE.MeshBasicMaterial({ map: skyline })); glass.position.set(1.4, 3.2, WALL_Z + 0.02); room.add(glass);
  for (const [w, h, x, y] of [[2.9, 0.16, 1.4, 4.2], [2.9, 0.16, 1.4, 2.2], [0.16, 2.1, 0.0, 3.2], [0.16, 2.1, 2.8, 3.2], [0.1, 1.9, 1.4, 3.2]]) {
    const f = box(w, h, 0.14, '#ffffff', 0.03); f.position.set(x, y, WALL_Z + 0.07); room.add(f);
  }
  for (const x of [-0.25, 3.05]) {   // 窗帘 (会飘)
    const c = new THREE.Group(); c.position.set(x, 4.45, WALL_Z + 0.2); room.add(c);
    const m = box(0.5, 2.5, 0.08, '#f8d36b', 0.04); m.position.y = -1.25; c.add(m); curtains.push(c);
  }
  // 空空的鞋柜 (右边)
  const cab = new THREE.Group(); cab.position.set(2.75, 0, WALL_Z + 0.4); room.add(cab);
  for (const y of [0.04, 0.55, 1.06, 1.57]) { const s = box(1.3, 0.08, 0.6, '#f6f0ff', 0.02); s.position.y = y; cab.add(s); }
  for (const x of [-0.65, 0.65]) { const s = box(0.08, 1.6, 0.6, '#c9b3f0', 0.02); s.position.set(x, 0.8, 0); cab.add(s); }
  const pot = box(0.4, 0.4, 0.4, '#ec8a74', 0.06); pot.position.set(0.3, 1.81, 0); cab.add(pot);
  for (let i = 0; i < 5; i++) { const l = box(0.11, 0.6, 0.11, '#5aae73', 0.04); l.position.set(0.2 + i * 0.05, 2.2, 0); l.rotation.z = -0.5 + i * 0.25; cab.add(l); }
  // 狗窝 + 骨头玩具 + 地毯
  const bed = mesh(new THREE.CylinderGeometry(0.9, 0.95, 0.3, 32), std('#8fc3f0')); bed.position.set(-2.4, 0.15, 1.2); room.add(bed);
  const bedIn = mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.32, 32), std('#d9ecfb')); bedIn.position.set(-2.4, 0.17, 1.2); room.add(bedIn);
  const bone = new THREE.Group(); bone.position.set(0.9, 0.08, 1.0); bone.rotation.y = 0.6; room.add(bone);
  { const b = box(0.5, 0.1, 0.1, '#ffffff', 0.04); bone.add(b); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const k = box(0.12, 0.12, 0.12, '#ffffff', 0.05); k.position.set(sx * 0.27, 0, sz * 0.06); bone.add(k); } }
  const rug = mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.03, 48), std('#f7c1d3'), false, true); rug.position.set(0.2, 0.015, 0.4); room.add(rug);
}
const stage = mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.4, 48), std('#ffffff'), false, true); stage.position.y = -0.2; scene.add(stage);

// ------------------------------------------------------------------ 鞋 (一对一对飞过去)
// [段名, 种类, x, z, 朝向, 选项(左/右)]
const PILE = [
  ['flip', 'flip', -1.75, -2.2, 0.35, [{ broken: true }, {}]],
  ['croc', 'croc', -1.05, -2.85, -0.25, [{}, {}]],
  ['plaid', 'plaid', -1.0, -1.95, 0.55, [{}, {}]],
  ['bunny', 'bunny', -0.35, -2.45, -0.45, [{ ears: 1 }, { ears: 0 }]],
  ['black', 'black', -1.7, -1.45, 0.85, [{}]],
];
const shoes = [];
for (const [seg, kind, x, z, ry, opts] of PILE) {
  opts.forEach((op, j) => {
    const g = makeShoe(kind, op); scene.add(g);
    const side = opts.length > 1 ? (j ? 0.21 : -0.21) : 0;
    const to = new THREE.Vector3(x + Math.cos(ry) * side, 0, z - Math.sin(ry) * side);
    shoes.push({ g, seg, j, to, ry: ry + (j ? 0.12 : -0.1) });
  });
}
const mouthShoe = makeShoe('black'); scene.add(mouthShoe);   // 狗嘴里那只 (左脚)
const DROP_AT = 1.05, DROP_TO = new THREE.Vector3(-2.05, 0, -2.0);

const dog = makeDog(); scene.add(dog.root);
const person = makePerson(); scene.add(person.root);
const hearts = []; for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false })); scene.add(s); hearts.push(s); }
const sparkRoom = makeSparkles(90, [14, 8, 10], '#fff4fa', 0.9, 7, 0.12); scene.add(sparkRoom);
const petals = makeSparkles(50, [14, 9, 10], '#ff9fc2', 1.1, 11, -0.35); scene.add(petals);
const dust = makeSparkles(24, [0.9, 1.6, 0.4], '#ffffff', 0.5, 5, 0.5); scene.add(dust);   // 顶墙时掉下来的墙灰

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
function pop(s, x, y, size, col, age) { if (age < 0) return; txt(s, x, y, Math.max(4, size * back(age / 0.3)), col, '#ffffff', 10); }
function bubble(s, x, y, size, age) {   // 说话气泡 (带小尾巴)
  if (age < 0) return;
  const k = back(age / 0.35); size *= k; y += 5 * Math.sin(age * 3);
  ctx.font = `${size}px ${FONT}`; const w = ctx.measureText(s).width + size * 1.2, h = size * 1.7;
  x = clamp(x, w / 2 + 16, W - w / 2 - 16);
  ctx.fillStyle = '#ffffff'; ctx.strokeStyle = INK; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); ctx.moveTo(x - 20 * k, y + h / 2 - 2); ctx.lineTo(x, y + h / 2 + 30 * k); ctx.lineTo(x + 20 * k, y + h / 2 - 2);
  ctx.stroke(); ctx.fill(); txt(s, x, y + 2, size, INK);
}
const v3 = new THREE.Vector3();
function proj(obj, off = [0, 0, 0]) { v3.set(...off); obj.localToWorld(v3); v3.project(camera); return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H]; }
function projP(p) { v3.copy(p).project(camera); return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H]; }

function drawHUD(sc, lt, dur) {
  const [, name, c0, c1, pressV, , , mouth] = sc;
  if (!mouth) return;
  const v = lt < 0.9 ? c0 : c1;
  const x = 34, y = 520;
  txt('罪证数量', x, y, 50, '#fff', INK, 8, 'left');
  txt('E V I D E N C E', x, y + 38, 20, '#fff', INK, 4, 'left');
  const ns = 104 * (0.7 + 0.3 * back((lt < 0.9 ? lt : lt - 0.9) / 0.4));
  txt(String(v), x, y + 116, ns, '#fff', INK, 10, 'left');
  ctx.font = `${ns}px ${FONT}`; const w = ctx.measureText(String(v)).width;
  txt('只', x + w + 10, y + 134, 44, '#fff', INK, 8, 'left');
  const pv = Math.round(lerp(Math.max(0, pressV - 20), pressV, smooth(lt / 1.2)));
  [`顶墙力度: ${pv}%`, `嘴里: ${mouth}`].forEach((l, i) => txt(l, x, y + 196 + i * 42, 32, '#fff', INK, 7, 'left'));
  const done = name === 'drop';
  ctx.fillStyle = done ? '#e8473f' : '#e8587e'; ctx.beginPath(); ctx.roundRect(x, y + 284, 250, 48, 24); ctx.fill();
  txt(done ? '人赃俱获' : (c1 - c0 > 1 ? '+1 双罪证' : '+1 只罪证'), x + 125, y + 309, 30, '#fff');
}
function drawCaption(sc, lt) {
  const [, , , , , cap, en] = sc; if (!cap) return;
  const lines = cap.split('\n');
  const y0 = 1560 - (lines.length - 1) * 40;
  let fs = 68; ctx.font = `${fs}px ${FONT}`;
  while (fs > 40 && Math.max(...lines.map(l => ctx.measureText(l).width)) > 1000) { fs -= 2; ctx.font = `${fs}px ${FONT}`; }
  lines.forEach((l, i) => { const u = lt - 0.1 - i * 0.14; if (u > 0) txt(l, 540, y0 + i * 86, Math.max(8, fs * back(u / 0.35)), '#ffe14a', '#6e3a3c', 14); });
  let ew = 28; ctx.font = `${ew}px ${FONT}`; while (ew > 18 && ctx.measureText(en).width > 1020) { ew--; ctx.font = `${ew}px ${FONT}`; }
  if (lt > 0.3) txt(en, 540, y0 + lines.length * 86 - 22, ew, '#fff', INK, 6);
}
function drawDanmaku(gt) {
  const start = STARTS[IDX.black] + 0.6, end = STARTS[IDX.why] + 0.6;
  if (gt < start || gt > end) return;
  const dens = clamp((gt - start) / 1.8), r = rng(2026);
  const cols = ['#ffffff', '#ffe98f', '#a9e4ff', '#ffb3cf', '#bdf7c6'];
  for (let i = 0; i < 44; i++) {
    const t0 = start + (r() * (end - start + 2) - 2), sp = 300 + r() * 160, y = 140 + (i % 8) * 50;
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
const PLACE_AT = 0.3, FLY = 0.55;
const OWNER = [0.45, -1.7, -1.0];        // 主人站的位置 (x, z, 朝向)
const handPos = new THREE.Vector3();

function placeShoes(gt) {   // 每段开头, 主人手里的鞋飞到鞋堆上 (之前的鞋一直留着)
  for (const s of shoes) {
    const t0 = STARTS[IDX[s.seg]] + PLACE_AT + s.j * 0.14, u = (gt - t0) / FLY;
    s.g.visible = u >= 0;
    if (u < 0) continue;
    const k = smooth(u);
    const from = new THREE.Vector3(OWNER[0] - 0.6, 1.2, OWNER[1] + 0.25);
    s.g.position.lerpVectors(from, s.to, k);
    s.g.position.y = u < 1 ? lerp(from.y, 0, k) + 0.9 * Math.sin(Math.PI * k) : 0;
    s.g.rotation.set(u < 1 ? (1 - k) * 2.2 : 0, s.ry + (u < 1 ? (1 - k) * 3 : 0), 0);
    const sq = u > 1 ? 1 - 0.25 * Math.exp(-(u - 1) * 6) * Math.cos((u - 1) * 14) : 1;   // 落地压扁回弹
    s.g.scale.set(2 - sq, sq, 2 - sq);
  }
}
// 狗面壁的位置: press 越大越贴墙
function dogAtWall(press) { dog.root.position.set(-2.65, 0, lerp(-2.25, -2.45, press)); dog.root.rotation.y = Math.PI + 0.12; }

const WIDE = { pos: [-0.4, 3.0, 7.6], tgt: [-1.15, 2.0, -2.2] };
const CLOSE = { pos: [1.0, 2.0, -2.95], tgt: [-2.35, 1.75, -3.0] };

function setup(name, lt, dur, gt) {
  room.visible = true; stage.visible = false; dog.root.visible = false; person.root.visible = false;
  hearts.forEach(h => h.visible = false); dust.visible = false;
  dog.root.position.set(0, 0, 0); dog.root.rotation.set(0, 0, 0); dog.root.scale.setScalar(1);
  person.root.rotation.set(0, 0, 0);
  hemi.intensity = 1.5; hemi.color.set('#fff2f6'); sun.intensity = 2.3; camera.fov = 36;
  setSky('#79b6f0', '#cfe6fb');
  curtains.forEach((c, i) => { c.rotation.x = 0.06 + 0.05 * Math.sin(gt * 1.7 + i); c.rotation.z = 0.04 * Math.sin(gt * 1.3 + i * 2); });
  placeShoes(gt);
  mouthShoe.visible = false;
  // 鞋堆只在屋里出现
  let camPos = WIDE.pos, camTgt = WIDE.tgt;
  const held = () => {   // 狗嘴里叼着的那只
    mouthShoe.visible = true; dog.root.updateMatrixWorld(true);
    dog.held.getWorldPosition(mouthShoe.position);
    const q = new THREE.Quaternion(); dog.held.getWorldQuaternion(q);
    mouthShoe.quaternion.copy(q).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, Math.PI / 2, 0)));
    mouthShoe.position.add(new THREE.Vector3(0, -0.08, 0).applyQuaternion(q));
    mouthShoe.scale.setScalar(1);
  };
  const owner = (o = {}) => {
    person.root.position.set(OWNER[0], 0, OWNER[1]); person.root.rotation.y = OWNER[2];
    const pl = lt > PLACE_AT - 0.25 && lt < PLACE_AT + 0.8 ? Math.sin(Math.PI * clamp((lt - PLACE_AT + 0.25) / 1.05)) : null;
    person.update(gt, { stern: true, headYaw: -0.25, place: o.noPlace ? null : pl, hips: (pl == null && o.hips), ...o });
  };
  // 一段面壁戏: 偷看鞋堆 → 鞋落地就转回去更用力顶墙
  const wallScene = (pressV, extra = {}) => {
    const p0 = Math.max(0, pressV - 0.2), land = PLACE_AT + FLY;
    const press = lerp(p0, pressV, smooth((lt - land) / 0.5));
    dogAtWall(press);
    const peek = lt < land ? smooth(lt / 0.3) : 1 - smooth((lt - land) / 0.25);   // 偷看
    const side = lt > land + 0.9 ? smooth((lt - land - 0.9) / 0.3) : 0;            // 斜眼偷瞄
    const squeeze = lt > land && lt < land + 0.9;
    dog.update(gt, { press, sad: 0.4 + 0.6 * pressV, yaw: (squeeze ? -0.55 : -0.85 + (extra.yawOff || 0)) - 0.45 * peek, pitch: -0.15 * peek,
      eyes: squeeze ? 'squeeze' : 'normal', look: -1 * Math.max(peek, side), wag: 0.12, wagHz: 0.8, tear: pressV > 0.8 ? 1 : 0, ...extra });
    if (!extra.noHeld) held();
    dust.visible = press > 0.3; dust.position.set(-2.3, 0.3, WALL_Z + 0.25);
    // 镜头: 先全景看鞋飞过去, 再切到狗脸特写
    const c = smooth((lt - 1.25) / 0.35);
    camPos = WIDE.pos.map((v, i) => lerp(v, CLOSE.pos[i], c)); camTgt = WIDE.tgt.map((v, i) => lerp(v, CLOSE.tgt[i], c));
    camera.fov = lerp(42, 40, c);
    L(() => {   // 顶墙的压力线
      if (press < 0.3 || c < 0.5) return;
      const [x, y] = proj(dog.headPivot, [0, 0.5, 0.55]);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) { const a = -2.4 + i * 0.35 + 0.05 * Math.sin(gt * 20 + i), r0 = 150 + 10 * Math.sin(gt * 30 + i);
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(x + Math.cos(a) * (r0 + 60 * press), y + Math.sin(a) * (r0 + 60 * press)); ctx.stroke(); }
    });
    return { press, land, c };
  };
  const shoeLabel = (seg, s1, col, off = [0, 0.55, 0], at = PLACE_AT + FLY) =>
    L(() => { const sh = shoes.find(s => s.seg === seg); const [x, y] = projP(sh.g.position.clone().add(new THREE.Vector3(...off))); pill(s1, x, y, 38, col, '#fff', lt - at); });

  switch (name) {
    case 'title': {
      dog.root.position.set(0.5, 0, 0.3); dog.root.rotation.y = -0.4;
      dog.update(gt, { hop: 1, wag: 0.6, wagHz: 3, yaw: 0.3 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.6), eyes: 'happy', perk: 0.3 });
      held();
      camPos = [0.4, 3.0, 8.6]; camTgt = [0.2, 2.4, 0];
      L(() => { const [x, y] = proj(dog.headPivot, [0, 1.3, 0]); bubble('今天也很乖', x, y - 40, 40, lt - 1.0); });
      break;
    }
    case 'flip': {
      owner();
      wallScene(0.25);
      shoeLabel('flip', '夏天 · 人字拖', SKY);
      L(() => pill('带子断了', 260, 1220, 38, '#e8473f', '#fff', lt - 1.0));
      L(() => { if (lt > 1.35) { const [x, y] = proj(dog.headPivot, [0, 1.2, 0.3]); bubble('我看不见…', x - 80, y - 30, 40, lt - 1.6); } });
      break;
    }
    case 'croc': {
      owner();
      wallScene(0.45);
      shoeLabel('croc', '夏天 · 洞洞鞋', MINT);
      L(() => pop('又一双', 760, 520, 76, MINT, lt - 0.9));
      L(() => { if (lt > 1.35) pill('斜眼偷瞄中', 540, 1250, 42, LAV, '#fff', lt - 2.2); });
      break;
    }
    case 'plaid': {
      owner({ hips: true });
      wallScene(0.65);
      shoeLabel('plaid', '冬天 · 格子拖', '#e8473f');
      L(() => pop('冬天的也没放过', 600, 520, 64, '#e8473f', lt - 0.9));
      L(() => { if (lt > 1.35) { const [x, y] = proj(dog.headPivot, [0, 1.2, 0.3]); bubble('墙…好…硬…', x - 80, y - 30, 40, lt - 1.8); } });
      break;
    }
    case 'bunny': {
      owner({ hips: true });
      const { c } = wallScene(0.85, { ears: 1 });
      shoeLabel('bunny', '奶奶的！！', PINK, [0, 0.9, 0]);
      L(() => pill('耳朵：只剩一只', 540, 1250, 44, PINK, '#fff', lt - 1.1));
      L(() => pop('🐰？', 820, 560, 90, PINK, lt - 1.9));
      L(() => { if (c > 0.8) { const [x, y] = proj(dog.headPivot, [0, 1.2, 0.3]); bubble('完了完了', x - 80, y - 30, 42, lt - 2.2); } });
      break;
    }
    case 'black': {   // 只放下右脚那只 → 左脚那只呢？→ 镜头推到狗嘴
      owner({ hips: true });
      const { c } = wallScene(1.0, { yawOff: -0.4 });
      L(() => { const sh = shoes.find(s => s.seg === 'black'); const [x, y] = projP(sh.g.position.clone().add(new THREE.Vector3(0, 0.5, 0))); pill('右脚 ✓', x, y, 40, '#4a4452', '#fff', lt - PLACE_AT - FLY); });
      L(() => { if (c > 0.6) {
        const [x, y] = projP(mouthShoe.position);
        const s = 120 + 12 * Math.sin(gt * 10); ctx.strokeStyle = '#ff3d6e'; ctx.lineWidth = 9;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.moveTo(x + sx * s, y + sy * s * 0.5); ctx.lineTo(x + sx * s, y + sy * s); ctx.lineTo(x + sx * s * 0.5, y + sy * s); ctx.stroke(); }
        pop('左脚在这儿！', x, y - s - 50, 60, '#ff3d6e', lt - 1.9);
      } });
      break;
    }
    case 'drop': {    // 终于松口: 鞋掉在鞋堆旁边
      owner({ noPlace: true, shock: lt > DROP_AT + 0.4 && lt < DROP_AT + 1.6, hips: lt < DROP_AT });
      const rel = lt > DROP_AT;
      dogAtWall(1 - 0.6 * smooth((lt - DROP_AT - 0.3) / 0.6));
      dog.update(gt, { press: 1 - 0.6 * smooth((lt - DROP_AT - 0.3) / 0.6), sad: 1, yaw: -0.6, look: -1,
        jaw: smooth((lt - DROP_AT + 0.25) / 0.25), eyes: lt > DROP_AT + 0.3 ? 'wide' : 'squeeze', tear: 1, wag: 0.1 });
      if (!rel) held();
      else {
        mouthShoe.visible = true;
        const u = clamp((lt - DROP_AT) / 0.45);
        // 松口瞬间嘴的位置: 先摆回那一刻的姿势量一下, 再摆回当前姿势
        dog.update(gt, { press: 1, sad: 1, yaw: -0.6, jaw: 0.5 }); dog.root.updateMatrixWorld(true);
        const from = new THREE.Vector3(); dog.held.getWorldPosition(from);
        dog.update(gt, { press: 1 - 0.6 * smooth((lt - DROP_AT - 0.3) / 0.6), sad: 1, yaw: -0.6, look: -1, jaw: 1, eyes: 'wide', tear: 1, wag: 0.1 });
        mouthShoe.position.lerpVectors(from, DROP_TO, smooth(u));
        mouthShoe.position.y = u < 1 ? from.y * (1 - u * u) : 0.0 + 0.12 * Math.abs(Math.sin((lt - DROP_AT - 0.45) * 9)) * Math.exp(-(lt - DROP_AT - 0.45) * 5);
        mouthShoe.rotation.set((1 - u) * 1.4, 0.4 + u * 2.2, 0);
      }
      const c = smooth((lt - DROP_AT - 0.3) / 0.5);
      camPos = CLOSE.pos.map((v, i) => lerp(v, [-0.5, 2.7, 5.2][i], c)); camTgt = CLOSE.tgt.map((v, i) => lerp(v, [-1.5, 1.5, -2.3][i], c));
      camera.fov = 40;
      L(() => pop('松……口……', 540, 600, 80, LAV, lt - 0.3));
      L(() => pop('啪嗒！', 540, 560, 150, '#ff3d6e', lt - DROP_AT - 0.42));
      L(() => { const [x, y] = projP(DROP_TO.clone().add(new THREE.Vector3(0, 0.5, 0))); pill('左脚：已上交', x, y, 42, '#4a4452', '#fff', lt - DROP_AT - 0.9); });
      break;
    }
    case 'why': {
      room.visible = false; stage.visible = true; stage.material.color.set('#c7b2f0'); setSky('#a98ae0', '#d8c6f6');
      shoes.forEach(s => s.g.visible = false);
      dog.root.rotation.y = 0.5 * Math.sin(lt * 0.7);
      dog.update(gt, { dropY: drop(lt), yaw: -0.4 * Math.sin(lt * 1.3), tilt: 0.15 * Math.sin(lt * 1.9), look: Math.sin(lt * 1.3), sad: 0.5, wag: 0.3 });
      ['鞋上全是你的味道', '啃咬能解压、磨牙', '无聊或想你时更爱咬', '“愧疚脸”多半是看你脸色']
        .forEach((s, i) => L(() => pill(s, 540, 290 + i * 116, 40, '#ffffff', INK, lt - 0.3 - i * 0.7)));
      camPos = [0, 2.3, 8.4]; camTgt = [0, 1.4, 0];
      break;
    }
    case 'warm': {    // 主人蹲下张开手, 金毛转身跑过去
      shoes.forEach(s => s.g.visible = true); mouthShoe.visible = true; mouthShoe.position.copy(DROP_TO); mouthShoe.rotation.set(0, 2.6, 0);
      const w = smooth((lt - 0.8) / 1.8);
      dog.root.position.set(lerp(-2.65, -0.6, w), 0, lerp(-2.45, -0.6, w));
      dog.root.rotation.y = lerp(Math.PI + 0.12, 0.9, smooth((lt - 0.2) / 0.7));
      dog.update(gt, { eyes: lt > 0.6 ? 'happy' : 'normal', walk: w > 0 && w < 1 ? 1 : 0, wag: lt > 0.5 ? 0.7 : 0.1, wagHz: 3.2, perk: 0.4, yaw: 0.3 * Math.sin(lt * 2), hop: w >= 1 ? 0.4 : 0 });
      person.root.position.set(0.55, 0, -0.1); person.root.rotation.y = -1.0;
      person.update(gt, { reach: lt > 0.6, headYaw: 0.2 });
      hearts.forEach((h, i) => { if (lt < 2.2) return; h.visible = true; const u = ((lt - 2.2) * 0.45 + i / 14) % 1; h.position.set(-0.1 + Math.sin(i * 2.1) * 1.4 + 0.2 * Math.sin(lt * 2 + i), 1 + u * 3.2, -0.4 + Math.cos(i) * 0.5); h.scale.setScalar(0.35 * Math.sin(Math.PI * u) + 0.01); });
      hemi.color.set('#ffe6d6');
      camPos = [0.8, 3.0, 7.6]; camTgt = [-0.5, 1.8, -0.9];
      L(() => pill('原谅 ✓', 540, 1250, 46, MINT, '#fff', lt - 2.4));
      break;
    }
    case 'end': {
      room.visible = false; stage.visible = true; stage.material.color.set('#f9b6cd'); setSky('#f597bc', '#ffd0e0');
      shoes.forEach(s => s.g.visible = false);
      const bun = shoes.find(s => s.seg === 'bunny' && s.j === 0);
      bun.g.visible = true; bun.g.position.set(1.15, 0, 0.9); bun.g.rotation.set(0, -0.5 + 0.2 * Math.sin(lt * 2), 0); bun.g.scale.setScalar(1.6);
      dog.root.scale.setScalar(0.85); dog.root.position.set(-0.2, 0, 0.3); dog.root.rotation.y = 0.25 * Math.sin(lt * 1.2);
      dog.update(gt, { hop: 0.6, eyes: 'happy', wag: 0.7, wagHz: 3, yaw: 0.4 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.5), perk: 0.4 });
      person.root.position.set(1.15, 0, -0.9); person.root.rotation.y = -0.4; person.root.scale.setScalar(0.95);
      person.update(gt, { phone: true, headYaw: -0.2 });
      hearts.forEach((h, i) => { h.visible = true; const u = (lt * 0.4 + i / 14) % 1; h.position.set(Math.sin(i * 2.1) * 2.2, 0.6 + u * 4, -0.8 + Math.cos(i) * 0.6); h.scale.setScalar(0.4 * Math.sin(Math.PI * u) + 0.01); });
      camPos = [0, 1.9, 9.6]; camTgt = [0, 2.5, 0];
      break;
    }
  }
  if (name !== 'end') person.root.scale.setScalar(1);
  camera.updateProjectionMatrix();
  return { camPos, camTgt };
}

window.renderAt = (gt) => {
  let i = SCENES.length - 1; while (i > 0 && gt < STARTS[i]) i--;
  const sc = SCENES[i], name = sc[1], dur = sc[0], lt = gt - STARTS[i];
  labels = [];
  let { camPos, camTgt } = setup(name, lt, dur, gt);
  if (window.CAM) { camPos = window.CAM[0]; camTgt = window.CAM[1]; if (window.CAM[2]) { camera.fov = window.CAM[2]; camera.updateProjectionMatrix(); } }
  // 镜头: 冲进去回弹 + 慢推 + 手持晃动; 松口落地时震屏
  const push = 1 - 0.05 * (lt / dur) - 0.14 * (1 - back(lt / 0.45));
  let sh = name === 'black' ? 0.006 : 0;
  if (name === 'drop') sh = 0.05 * Math.exp(-Math.max(0, lt - DROP_AT - 0.42) * 4) * (lt > DROP_AT + 0.42 ? 1 : 0.15);
  const dir = new THREE.Vector3(...camPos).sub(new THREE.Vector3(...camTgt));
  const pos = new THREE.Vector3(...camTgt).add(dir.multiplyScalar(push));
  const amp = dir.length() < 2.5 ? 0.04 : 0.14;
  pos.x += amp * Math.sin(lt * 0.9 + i) + sh * Math.sin(gt * 53); pos.y += amp * 0.5 * Math.sin(lt * 1.3 + i * 2) + sh * Math.cos(gt * 47);
  camera.position.copy(pos); camera.lookAt(...camTgt);
  camera.updateMatrixWorld();
  sparkRoom.material.uniforms.uTime.value = gt; petals.material.uniforms.uTime.value = gt; dust.material.uniforms.uTime.value = gt;
  composer.render();
  ctx.drawImage(renderer.domElement, 0, 0);
  labels.forEach(f => f());
  if (name === 'title') {
    const a = back(lt / 0.5);
    ctx.save(); ctx.translate(540, 560); ctx.scale(a, a);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-420, -150, 840, 300, 36); ctx.fill();
    txt('假如你家金毛', 0, -58, 74, INK); txt('把全家的鞋都咬了', 0, 50, 78, GOLD); ctx.restore();
    txt('会发生什么？', 540, 790, 76, '#fff', INK, 12);
  }
  if (name === 'end') {
    const a = smooth(lt / 0.6);
    ctx.globalAlpha = a;
    txt('但是谁去告诉奶奶', 540, 470, 64, '#ffffff', '#c23f74', 12);
    txt('她的兔子拖鞋只剩一只耳朵了？🐰', 540, 580, 52, INK, '#ffffff', 10);
    ctx.globalAlpha = clamp((lt - 1.0) / 0.4);
    txt('看来这通电话，得我来打了 📞', 540, 700, 54, '#a2285e', '#ffffff', 10);
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
