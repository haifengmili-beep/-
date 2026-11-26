// 《假如你家猫每天多一条尾巴》 3D 版 — three.js 场景 + 2D 字幕/仪表盘层. window.renderAt(t) 决定性渲染一帧.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp, smooth, lerp, back, bounce, rng, canvasTex, std, rbox, mesh, box, heartTex, makeSparkles,
         makeCat, makePerson, makePeacock, makeFox } from './lib.js';

const W = 1080, H = 1920;
const FONT = '"WenQuanYi Zen Hei", sans-serif';
await document.fonts.load(`80px ${FONT}`, '猫');

// ------------------------------------------------------------------ 时间线 (与 tail_voxel 相同, 方便共用配乐)
const SCENES = [
  [3.0, 'title', 0, 0, '', '', '', ''],
  [3.2, 't0', 0, 0, '第0天：一条尾巴\n竖起来，是在跟你打招呼', "Day 0: One tail. Held straight up, it's saying hi.", '正常猫咪', '无'],
  [3.2, 't1', 1, 1, '第1天：两条尾巴\n一条说开心，一条说别烦我', 'Day 1: Two tails. One says happy, the other says go away.', '两种心情', '猫自己也懵了'],
  [3.0, 't3', 3, 3, '第3天：四条尾巴一起摇\n家里不用开电扇了', 'Day 3: Four tails wagging at once. Who needs a fan?', '一台电风扇', '作业本被吹跑'],
  [3.0, 't7', 6, 7, '第7天：八条尾巴，开屏了\n孔雀：？', 'Day 7: Eight tails fanned out. Peacock: ?', '一只孔雀', '孔雀不服'],
  [3.2, 't30', 25, 30, '第30天：31条尾巴打结了\n解了一下午', 'Day 30: 31 tails in one big knot. It took all afternoon.', '一团毛线', '铲屎官加班'],
  [3.4, 't100', 90, 100, '第100天：尾巴转起来当螺旋桨\n它飞走了', 'Day 100: The tails spin like a propeller. It takes off.', '一架直升机', '小区禁飞'],
  [3.6, 't365', 300, 365, '第1年：366条尾巴\n九尾狐看了都沉默了', 'Year 1: 366 tails. Even the nine-tailed fox goes quiet.', '40多只九尾狐', '九尾狐失业'],
  [4.8, 'why', 0, 0, '其实，一条尾巴就够忙了\n它是平衡杆，也是心情显示器', 'One tail keeps a cat busy: it helps balance, and it shows how the cat feels.', '', ''],
  [4.8, 'back', 0, 0, '一条就够了\n它竖着尾巴走向你，就是在说：见到你真好', 'One is enough. Walking to you tail up means: glad to see you.', '刚刚好', '无'],
  [3.6, 'end', 0, 0, '', '', '', ''],
];
const STARTS = []; { let a = 0; for (const s of SCENES) { STARTS.push(a); a += s[0]; } }
const IDX = Object.fromEntries(SCENES.map((s, i) => [s[1], i]));
const DANMAKU = ['哈哈哈哈哈', '九尾狐：？', '猫：我自己都数不清', '这还是猫吗', 'awsl', '+1', '前方高能！', '螺旋桨猫',
  '起飞！', '求同款', '孔雀哭了', '毛线团警告', '好想摸', '猫猫：？', '快回来！', '耳朵会动！', '扭头杀'];
const INK = '#42263f', PINK = '#e8588a', MINT = '#2ea47c', SKY = '#468cd6', LAV = '#8464c4';

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

// ------------------------------------------------------------------ 卧室 (粉紫墙, 焦糖木地板, 猫爬架, 窗外小城)
const room = new THREE.Group(); scene.add(room);
{
  const plank = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d49a70'; g.fillRect(0, 0, w, h);
    const r = rng(3);
    for (let y = 0; y < h; y += 64) { g.fillStyle = `rgba(150,90,60,${0.15 + r() * 0.15})`; g.fillRect(0, y, w, 4); for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(255,230,200,0.12)'; g.fillRect(r() * w, y + 10 + r() * 40, 80 + r() * 120, 3); } }
  });
  plank.wrapS = plank.wrapT = THREE.RepeatWrapping; plank.repeat.set(3, 3);
  const floor = mesh(new THREE.PlaneGeometry(16, 16), std('#ffffff', { map: plank }), false, true); floor.rotation.x = -Math.PI / 2; room.add(floor);
  const wallMat = std('#f2a7c3'), sideMat = std('#b99ae6');
  const backW = mesh(new THREE.PlaneGeometry(16, 9), wallMat, false, true); backW.position.set(0, 4.5, -3.4); room.add(backW);
  const leftW = mesh(new THREE.PlaneGeometry(10, 9), sideMat, false, true); leftW.rotation.y = Math.PI / 2; leftW.position.set(-3.6, 4.5, 1.6); room.add(leftW);
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
  // 猫爬架
  for (const x of [2.2, 3.1]) { const p = mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.0, 16), std('#b98252')); p.position.set(x, 1.0, -2.6); room.add(p); }
  const plat = box(1.6, 0.18, 1.0, '#c9b3f0', 0.05); plat.position.set(2.65, 2.05, -2.6); room.add(plat);
  const base = box(1.6, 0.18, 1.0, '#c9b3f0', 0.05); base.position.set(2.65, 0.09, -2.6); room.add(base);
  // 柜子 + 绿植 + 地毯
  const cab = box(1.4, 1.1, 0.8, '#a98ad8', 0.06); cab.position.set(-2.5, 0.55, -2.8); room.add(cab);
  const pot = box(0.45, 0.45, 0.45, '#ec8a74', 0.06); pot.position.set(-2.5, 1.33, -2.8); room.add(pot);
  for (let i = 0; i < 5; i++) { const l = box(0.12, 0.6, 0.12, '#5aae73', 0.04); l.position.set(-2.62 + i * 0.06, 1.85, -2.8); l.rotation.z = -0.5 + i * 0.25; room.add(l); }
  const rug = mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.03, 48), std('#f7c1d3'), false, true); rug.position.set(0.3, 0.015, 0.2); room.add(rug);
}
const curtain = mesh(new THREE.PlaneGeometry(0.9, 2.2, 8, 8), std('#ec86ad', { side: THREE.DoubleSide }), false, false);
curtain.position.set(-0.1, 3.2, -3.25); room.add(curtain);
const curtainBase = curtain.geometry.attributes.position.array.slice();

// ------------------------------------------------------------------ 户外 (草地 + 马卡龙小区 + 云)
const outside = new THREE.Group(); scene.add(outside);
{
  const grass = mesh(new THREE.PlaneGeometry(200, 200), std('#8ccb80'), false, true); grass.rotation.x = -Math.PI / 2; outside.add(grass);
  const road = mesh(new THREE.PlaneGeometry(200, 2.4), std('#b9b6cc'), false, true); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, 3.2); outside.add(road);
  const winTex = canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(120,150,200,0.35)'; for (let y = 16; y < h; y += 40) for (let x = 14; x < w; x += 38) g.fillRect(x, y, 22, 26); });
  const cols = ['#f39cb4', '#8fb6ee', '#f6cf78', '#84cda2', '#b79ce8', '#f7a882'];
  const r = rng(21);
  for (let i = 0; i < 26; i++) {
    const h = 3 + r() * 9, w = 1.8 + r() * 1.4;
    const b = mesh(rbox(w, h, 2, 0.08), new THREE.MeshStandardMaterial({ color: cols[i % 6], roughness: 0.8 }));
    const ang = (i / 26) * Math.PI * 2, rad = 16 + r() * 10;
    b.position.set(Math.cos(ang) * rad, h / 2, Math.sin(ang) * rad - 4); b.lookAt(0, h / 2, 0); outside.add(b);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.85), new THREE.MeshBasicMaterial({ map: winTex, transparent: true, opacity: 0.9, color: '#fff7f2' }));
    win.position.set(0, 0, 1.01); b.add(win);
  }
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) { const p = box(1.4 + r(), 0.7 + r() * 0.4, 1.0, '#ffffff', 0.25); p.position.set(k * 0.9, (k % 2) * 0.3, 0); p.castShadow = false; c.add(p); }
    c.position.set(-20 + i * 5 + r() * 2, 8 + r() * 6, -14 - r() * 8); c.userData.sp = 0.3 + r() * 0.5; outside.add(c);
  }
  // 花
  const petal = ['#f58fb0', '#f7d264', '#b597ec', '#ffffff'];
  for (let i = 0; i < 70; i++) {
    const f = mesh(new THREE.SphereGeometry(0.08, 8, 6), std(petal[i % 4]), false, false);
    f.position.set((r() - 0.5) * 14, 0.06, (r() - 0.5) * 8 - 1); outside.add(f);
  }
}
const clouds = outside.children.filter(c => c.userData.sp);
// 光芒背景 (第1年)
const raysTex = canvasTex(1024, 1024, (g, w, h) => {
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; g.fillStyle = i % 2 ? 'rgba(255,224,190,0.85)' : 'rgba(255,190,200,0.55)';
    g.beginPath(); g.moveTo(512, 512); g.lineTo(512 + 900 * Math.cos(a), 512 + 900 * Math.sin(a)); g.lineTo(512 + 900 * Math.cos(a + 0.14), 512 + 900 * Math.sin(a + 0.14)); g.fill(); }
});
const rays = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ map: raysTex, transparent: true, depthWrite: false }));
rays.position.set(0, 2, -8); scene.add(rays);
// 纯色台子 (科普/结尾)
const stage = mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.4, 48), std('#ffffff'), false, true); stage.position.y = -0.2; scene.add(stage);

// ------------------------------------------------------------------ 角色/道具
const cat = makeCat(); scene.add(cat.root);
const person = makePerson(); scene.add(person.root);
const person2 = makePerson(); scene.add(person2.root);
const peacock = makePeacock(); scene.add(peacock.root);
const fox = makeFox(); scene.add(fox.root);
const papers = []; for (let i = 0; i < 8; i++) { const p = mesh(new THREE.PlaneGeometry(0.4, 0.3), std('#ffffff', { side: THREE.DoubleSide }), true, false); scene.add(p); papers.push(p); }
const hearts = []; for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false })); scene.add(s); hearts.push(s); }
const streaks = []; for (let i = 0; i < 10; i++) { const s = mesh(rbox(1.2, 0.04, 0.04, 0.015), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8 }), false, false); scene.add(s); streaks.push(s); }
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
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x - w / 2, y - size * 0.78, w, size * 1.56, size * 0.78); ctx.fill();
  txt(s, x, y + 2, size, fg);
}
function pop(s, x, y, size, col, age) { if (age < 0) return; txt(s, x, y, Math.max(4, size * back(age / 0.3)), col, '#ffffff', 10); }
const v3 = new THREE.Vector3();
function proj(obj, off = [0, 0, 0]) { v3.set(...off); obj.localToWorld(v3); v3.project(camera); return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H]; }

function drawHUD(sc, lt, dur) {
  const [, name, d0, d1, , , desc, side] = sc;
  if (!desc) return;
  const days = lerp(d0, d1, smooth(clamp(lt / (dur * 0.85))));
  const val = name === 'back' ? 1 : 1 + Math.round(days);
  const x = 34, y = 560;
  txt('尾巴数量', x, y, 46, '#fff', INK, 8, 'left');
  txt('T A I L S', x, y + 36, 20, INK, null, 0, 'left');
  const ns = 96 * (0.7 + 0.3 * back(lt / 0.4));
  txt(val.toLocaleString('en-US'), x, y + 110, ns, '#fff', INK, 10, 'left');
  ctx.font = `${ns}px ${FONT}`; const w = ctx.measureText(val.toLocaleString('en-US')).width;
  txt('条', x + w + 12, y + 128, 40, '#fff', INK, 8, 'left');
  const lines = [`时间: ${name === 'back' ? '现在' : '第' + Math.round(days) + '天'}`, `相当于: ${desc}`, `副作用: ${side}`];
  lines.forEach((l, i) => txt(l, x, y + 186 + i * 42, 32, '#fff', INK, 7, 'left'));
  const back_ = name === 'back';
  ctx.fillStyle = back_ ? MINT : '#e8587e'; ctx.beginPath(); ctx.roundRect(x, y + 318, 220, 48, 24); ctx.fill();
  txt(back_ ? '刚刚好' : '+1条 / 天', x + 110, y + 343, 30, '#fff');
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
  const start = STARTS[IDX.t100], end = STARTS[IDX.why] + 0.8;
  if (gt < start || gt > end) return;
  const dens = clamp((gt - start) / 2.5), r = rng(2026);
  const cols = ['#ffffff', '#ffe98f', '#a9e4ff', '#ffb3cf', '#bdf7c6'];
  for (let i = 0; i < 60; i++) {
    const t0 = start + (r() * (end - start + 2) - 2), sp = 300 + r() * 160, y = 130 + Math.floor(r() * 8) * 50;
    const col = cols[Math.floor(r() * 5)], s = DANMAKU[Math.floor(r() * DANMAKU.length)], keep = r() <= dens;
    const x = W - (gt - t0) * sp;
    if (x < -500 || x > W || !keep) continue;
    txt(s, x, y, 38, col, INK, 6, 'left');
  }
}

// ------------------------------------------------------------------ 每段场景
function env(kind) {
  room.visible = kind === 'room'; outside.visible = kind === 'out' || kind === 'glow';
  rays.visible = kind === 'glow'; stage.visible = kind === 'void';
  sparkRoom.visible = true; petals.visible = true;
}
const drop = lt => -(1 - bounce(lt / 0.7)) * 5;   // 从天而降
let labels = [];
const L = (fn) => labels.push(fn);

function setup(name, lt, dur, gt) {
  const p = lt / dur;
  [person, person2, peacock, fox].forEach(o => o.root.visible = false);
  papers.forEach(o => o.visible = false); hearts.forEach(o => o.visible = false); streaks.forEach(o => o.visible = false);
  cat.root.position.set(0, 0, 0); cat.root.rotation.set(0, 0, 0); cat.root.scale.setScalar(1);
  hemi.color.set('#fff2f6'); hemi.intensity = 1.5;
  let camPos = [0, 2.4, 11.5], camTgt = [0, 1.3, 0];
  const dropY = -drop(lt);  // 正数 = 还在空中
  switch (name) {
    case 'title': {
      env('room'); setSky('#79b6f0', '#cfe6fb');
      cat.root.position.set(0.75, 0, 0.3); cat.root.rotation.y = -0.35;
      cat.update(gt, { hop: 1, yaw: 0.35 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.6) });
      person.root.position.set(-0.95, 0, 0); person.root.rotation.y = 0.35; person.update(lt, { wave: true });
      camPos = [0, 2.6, 13]; camTgt = [0, 1.6, 0];
      break;
    }
    case 't0': {
      env('room');
      cat.root.position.set(0.6, 0, 0); cat.root.rotation.y = 0.55;
      cat.update(gt, { dropY, yaw: -0.55 + 0.5 * Math.sin(lt * 1.6), tilt: 0.18 * Math.sin(lt * 2.2), look: Math.sin(lt * 1.6) });
      L(() => { const [x, y] = proj(cat.chains[0].segs[6], [0, 0.4, 0]); pill('竖尾巴 = 见到你开心', Math.min(x, 820), y - 40, 40, MINT, '#fff', lt - 0.6); });
      break;
    }
    case 't1': {
      env('room');
      cat.root.position.set(0.55, 0, 0); cat.root.rotation.y = 0.75;
      const look = Math.sin(lt * 3.2);      // 来回扭头看两条尾巴
      cat.update(gt, { dropY, eyes: 'dot', yaw: -0.2 + 0.75 * look, tilt: -0.2 * look, look, tails: { mode: 'two' } });
      L(() => { const [x, y] = proj(cat.chains[0].segs[6], [0, 0.3, 0]); pop('开心♪', x, y - 30, 56, MINT, lt - 0.4); });
      L(() => { const [x, y] = proj(cat.chains[1].segs[6], [0, 0.3, 0]); pop('别烦我', clamp(x, 160, 900), y, 56, PINK, lt - 0.9); });
      L(() => { const [x, y] = proj(cat.headPivot, [0, 1.6, 0]); pop('?', x, y, 110, LAV, lt - 1.6); });
      break;
    }
    case 't3': {
      env('room');
      cat.root.position.set(0.7, 0, 0); cat.root.rotation.y = -0.25;
      cat.update(gt, { dropY, eyes: 'happy', yaw: 0.3 + 0.15 * Math.sin(lt * 5), tails: { mode: 'fan', n: 4, a0: -1.2, a1: 1.2, lean: -0.6, amp: 0.45, hz: 4.2 } });
      person.root.position.set(-1.25, 0, 0.6); person.root.rotation.y = 0.5; person.update(lt, { shock: true, blow: true });
      papers.forEach((pp, i) => { pp.visible = true; const u = (lt * 0.5 + i / 8) % 1; pp.position.set(lerp(1.5, -4, u), 1 + i * 0.35 + 0.3 * Math.sin(lt * 4 + i), 0.5 + (i % 3) * 0.4); pp.rotation.set(lt * 5 + i, lt * 3 + i, lt * 4); });
      streaks.forEach((s, i) => { s.visible = true; const u = (lt * 1.3 + i / 10) % 1; s.position.set(lerp(1.2, -3.5, u), 0.8 + i * 0.25, 0.4 + (i % 2) * 0.5); });
      const pa = curtain.geometry.attributes.position;
      for (let i = 0; i < pa.count; i++) { const y = curtainBase[i * 3 + 1]; pa.array[i * 3 + 2] = curtainBase[i * 3 + 2] + (1.1 - y) * 0.25 * (1 + Math.sin(lt * 9 + y * 3)); }
      pa.needsUpdate = true;
      L(() => pill('风力 3 级', 860, 840, 42, SKY, '#fff', lt - 0.8));
      break;
    }
    case 't7': {
      env('out'); setSky('#6fb0ee', '#d4e9fb');
      cat.root.position.set(0.55, 0, 0); cat.root.rotation.y = -0.15;
      cat.update(gt, { dropY, yaw: 0.25 + 0.3 * Math.sin(lt * 1.5), tilt: 0.12, look: -0.6, tails: { mode: 'fan', n: 8, a0: -1.5, a1: 1.5, lean: -0.15, amp: 0.1, hz: 1.0, curl: 0.03 } });
      peacock.root.position.set(-1.5, 0, -0.3); peacock.root.rotation.y = 0.5; peacock.update(lt);
      L(() => { const [x, y] = proj(peacock.root, [0, 2.6, 0]); pop('?', x, y, 110, LAV, lt - 1.0); });
      L(() => pill('开屏！', 840, 780, 46, PINK, '#fff', lt - 0.5));
      camPos = [0, 2.6, 12]; camTgt = [0, 1.5, 0];
      break;
    }
    case 't30': {
      env('room');
      cat.root.position.set(-0.1, 0, 0.3); cat.root.rotation.y = -1.15; cat.knot.scale.setScalar(1.5);
      cat.update(gt, { dropY, eyes: 'half', mouth: 'flat', yaw: 0.95 + 0.25 * Math.sin(lt * 2), tilt: 0.1, tails: { mode: 'knot' } });
      person.root.position.set(1.3, 0, -0.9); person.root.rotation.y = -0.6; person.update(lt, { shock: true, reach: true });
      L(() => pill('解了一下午', 820, 880, 44, LAV, '#fff', lt - 0.6));
      break;
    }
    case 't100': {
      env('out'); setSky('#6fb0ee', '#d4e9fb');
      const e = smooth(p);
      cat.root.position.set(lerp(-1.2, 1.6, e), 0.6 + 4.2 * e + 0.15 * Math.sin(lt * 5), lerp(0, -1, e)); cat.root.rotation.set(0.1 * Math.sin(lt * 3), 0.3, -0.12);
      cat.update(gt, { eyes: 'happy', yaw: -0.3 + 0.3 * Math.sin(lt * 2), tails: { mode: 'prop' } });
      person.root.position.set(-1.45, 0, 1.6); person.root.rotation.y = 0.3; person.update(lt, { shock: true, wave: true, headYaw: 0.2 });
      person2.root.position.set(1.6, 0, 1.2); person2.root.rotation.y = -0.4; person2.update(lt + 0.7, { shock: true, headYaw: -0.2 });
      streaks.forEach((s, i) => { s.visible = true; const u = (lt * 1.6 + i / 10) % 1; s.position.set(cat.root.position.x - 1 - u * 2.5, cat.root.position.y + 0.3 + (i - 5) * 0.18, cat.root.position.z); });
      L(() => { const [x, y] = proj(person.root, [0, 3.4, 0]); pop('!', x, y, 90, PINK, lt - 0.3); });
      L(() => { const [x, y] = proj(person2.root, [0, 3.4, 0]); pop('!', x, y, 90, PINK, lt - 0.5); });
      L(() => pill('猫：起飞～', 540, 470, 44, SKY, '#fff', lt - 0.9));
      camPos = [0, 2.2 + 2.6 * e, 13]; camTgt = [0.2, 1.7 + 2.8 * e, 0];
      break;
    }
    case 't365': {
      env('glow'); setSky('#f6a0b8', '#ffd2a8');
      rays.rotation.z = lt * 0.15;
      cat.root.position.set(0.4, 0, 0);
      cat.update(gt, { dropY, eyes: 'happy', yaw: 0.35 * Math.sin(lt * 1.8), tilt: 0.1 * Math.sin(lt * 2.3), tails: { mode: 'fan', n: 120, a0: -Math.PI * 0.62, a1: Math.PI * 0.62, lean: 0.05, amp: 0.12, hz: 1.4, curl: 0.0 } });
      fox.root.position.set(-1.3, 0, 1.0); fox.root.rotation.y = 0.45; fox.update(lt);
      L(() => { if (lt > 0.8) { const [x, y] = proj(fox.root, [0, 2.1, 0]); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(x - 95, y - 42, 190, 84, 34); ctx.fill(); txt('……', x, y - 6, 50, INK); } });
      camPos = [0, 2.6, 13.5]; camTgt = [0, 1.8, 0];
      break;
    }
    case 'why': {
      env('void'); setSky('#a98ae0', '#d8c6f6'); stage.material.color.set('#c7b2f0');
      cat.root.rotation.y = 0.5 * Math.sin(lt * 0.7);
      cat.update(gt, { dropY, yaw: -0.4 * Math.sin(lt * 1.3), tilt: 0.15 * Math.sin(lt * 1.9), look: Math.sin(lt * 1.3) });
      ['竖起来 → 开心、打招呼', '快速甩 → 不耐烦', '炸毛变粗 → 害怕', '走高处 → 帮忙保持平衡']
        .forEach((s, i) => L(() => pill(s, 540, 290 + i * 116, 40, '#ffffff', INK, lt - 0.3 - i * 0.7)));
      camPos = [0, 2.1, 9.2]; camTgt = [0, 1.3, 0];
      break;
    }
    case 'back': {
      env('room');
      const w = clamp(lt / 3.0);
      cat.root.position.set(lerp(-1.1, 0.25, smooth(w)), 0, lerp(0.8, 0.4, w)); cat.root.rotation.y = 0.9 - 0.4 * w;
      cat.update(gt, { eyes: 'happy', walk: w < 1 ? 1 : 0, yaw: -0.3 - 0.2 * w, pitch: -0.25 * w, tails: { mode: 'single' } });
      person.root.position.set(1.3, 0, -0.2); person.root.rotation.y = -0.7; person.update(lt, { headYaw: 0.3, reach: w >= 1 });
      hearts.forEach((h, i) => { h.visible = lt > 1.0; const u = (lt * 0.4 + i / 14) % 1; h.position.set(0.4 + Math.sin(i * 2.1) * 1.6 + 0.2 * Math.sin(lt * 2 + i), 1 + u * 3.5, 0.5 + Math.cos(i) * 0.5); h.scale.setScalar(0.35 * Math.sin(Math.PI * u) + 0.01); });
      hemi.color.set('#ffe6d6');
      break;
    }
    case 'end': {
      env('void'); setSky('#f597bc', '#ffd0e0'); stage.material.color.set('#f9b6cd');
      cat.root.scale.setScalar(0.75); cat.root.position.set(0, 0, 0); cat.root.rotation.y = 0.3 * Math.sin(lt * 1.2);
      cat.update(gt, { hop: 0.6, eyes: 'happy', yaw: 0.4 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.5) });
      camPos = [0, 1.8, 10]; camTgt = [0, 2.4, 0];
      break;
    }
  }
  return { camPos, camTgt };
}

const SHAKE = { t3: 0.05, t100: 0.04, t365: 0.035 };
window.renderAt = (gt) => {
  let i = SCENES.length - 1; while (i > 0 && gt < STARTS[i]) i--;
  const sc = SCENES[i], name = sc[1], dur = sc[0], lt = gt - STARTS[i];
  labels = [];
  const { camPos, camTgt } = setup(name, lt, dur, gt);
  // 镜头: 切场景冲进去再回弹 + 慢推 + 手持晃动 + 震屏
  const push = 1 - 0.05 * (lt / dur) - 0.14 * (1 - back(lt / 0.45));
  const sh = SHAKE[name] || 0;
  const dir = new THREE.Vector3(...camPos).sub(new THREE.Vector3(...camTgt));
  const pos = new THREE.Vector3(...camTgt).add(dir.multiplyScalar(push));
  pos.x += 0.18 * Math.sin(lt * 0.9 + i) + sh * Math.sin(gt * 53); pos.y += 0.08 * Math.sin(lt * 1.3 + i * 2) + sh * Math.cos(gt * 47);
  camera.position.copy(pos); camera.lookAt(...camTgt);
  clouds.forEach((c, k) => { c.position.x = -20 + k * 5 + ((gt * c.userData.sp) % 10); });
  sparkRoom.material.uniforms.uTime.value = gt; petals.material.uniforms.uTime.value = gt;
  composer.render();
  ctx.drawImage(renderer.domElement, 0, 0);
  labels.forEach(f => f());
  // 开场标题卡 / 结尾文字
  if (name === 'title') {
    const a = back(lt / 0.5);
    ctx.save(); ctx.translate(540, 575); ctx.scale(a, a);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-400, -145, 800, 290, 36); ctx.fill();
    txt('假如你家猫', 0, -55, 74, INK); txt('每天多一条尾巴', 0, 50, 82, '#ee7a3c'); ctx.restore();
    txt('会发生什么？', 540, 790, 76, '#fff', INK, 12);
  }
  if (name === 'end') {
    const a = smooth(lt / 0.8);
    ctx.globalAlpha = a;
    txt('一条尾巴就够了', 540, 560, 70, '#ffffff', '#c23f74', 12);
    txt('你家猫见到你，尾巴是竖着的吗？', 540, 690, 54, INK, '#ffffff', 10);
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
