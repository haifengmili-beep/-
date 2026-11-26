// 《假如你用猫的眼睛看自己的家》 3D 版 — three.js 场景 + 猫眼滤镜 + 2D 字幕层. window.renderAt(t) 决定性渲染一帧.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { clamp, smooth, lerp, back, bounce, rng, canvasTex, std, rbox, mesh, box, heartTex, makeSparkles,
         makeCat, makePerson } from './lib.js';

const W = 1080, H = 1920;
const FONT = '"WenQuanYi Zen Hei", sans-serif';
await document.fonts.load(`80px ${FONT}`, '猫');

// ------------------------------------------------------------------ 时间线
// [时长, 名字, 同步率起, 同步率止, 字幕, 英文, 新技能, 副作用]
const SCENES = [
  [3.0, 'title', 0, 0, '', '', '', ''],
  [3.6, 'height', 0, 15, '第1招：眼睛降到25厘米\n沙发变成了大楼', 'Skill 1: Eyes 25 cm off the floor. The sofa becomes a building.', '低视角', '沙发像大楼'],
  [3.6, 'color', 15, 30, '第2招：红色变得暗淡\n蓝色和黄绿色更清楚', 'Skill 2: Red turns dull. Blues and yellow-greens stand out.', '看不清红色', '红球像灰球'],
  [3.4, 'fov', 30, 45, '第3招：视野更宽\n猫约200度，人约180度', 'Skill 3: A wider view. About 200° for cats, 180° for people.', '超广角', '斜眼也能看见你'],
  [3.4, 'far', 45, 60, '第4招：远处变模糊\n电视上演的啥？看不清', "Skill 4: Far away gets blurry. What's on TV? No idea.", '远处模糊', '看不清电视'],
  [3.2, 'near', 60, 72, '第5招：鼻子底下也看不清\n只能靠胡子摸', 'Skill 5: Right under the nose is blurry too. Whiskers do the work.', '近处模糊', '找不到嘴边的零食'],
  [3.8, 'night', 72, 88, '第6招：关灯也能看见\n只需要人大约1/6的光', 'Skill 6: Lights off, still visible. Cats need about 1/6 of the light we do.', '夜视', '半夜开始跑酷'],
  [3.8, 'motion', 88, 100, '第7招：会动的东西特别显眼\n逗猫棒一动，立刻锁定', 'Skill 7: Moving things pop out. The wand twitches — locked on.', '动态锁定', '逗猫棒一动就扑'],
  [4.6, 'why', 0, 0, '猫的眼睛是为黄昏打猎设计的\n看得暗、看得动，不求看得清', 'Cat eyes are built for hunting at dusk: dim light and motion first, sharp detail second.', '', ''],
  [4.8, 'back', 100, 100, '在它眼里，你可能有点糊、有点褪色\n但它靠声音和味道，一下就认出你', 'To your cat you may look blurry and faded, but it knows your voice and scent.', '认得你', '无'],
  [3.6, 'end', 0, 0, '', '', '', ''],
];
const STARTS = []; { let a = 0; for (const s of SCENES) { STARTS.push(a); a += s[0]; } }
const IDX = Object.fromEntries(SCENES.map((s, i) => [s[1], i]));
const POV = new Set(['height', 'color', 'fov', 'far', 'near', 'night', 'motion']);
const DANMAKU = ['原来猫看我是糊的', '难怪猫老盯着空气', '红色玩具白买了', '半夜跑酷实锤', '逗猫棒yyds', '锁定！', '+1',
  '涨知识了', '我家猫也这样', '猫：你动一下试试', '哈哈哈哈哈', 'awsl', '猫眼好神奇', '扑上去了！'];
const INK = '#42263f', PINK = '#e8588a', MINT = '#2ea47c', SKY = '#468cd6', LAV = '#8464c4';

// ------------------------------------------------------------------ renderer + 滤镜
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 900);
const scene = new THREE.Scene();
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bokeh = new BokehPass(scene, camera, { focus: 3, aperture: 0.006, maxblur: 0.02 }); composer.addPass(bokeh);
composer.addPass(new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.18, 0.5, 1.0));
composer.addPass(new OutputPass());
// 猫眼滤镜: 二色视觉 / 夜视增亮 / 广角畸变 / 去饱和; uSplit 左边保持人眼, 右边是猫眼
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uCat: { value: 0 }, uSplit: { value: 1 }, uNight: { value: 0 },
              uBarrel: { value: 0 }, uDesat: { value: 0 }, uVig: { value: 0.25 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uCat, uSplit, uNight, uBarrel, uDesat, uVig; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    vec3 catColor(vec3 c){
      vec3 d = vec3(dot(c, vec3(0.625,0.375,0.0)), dot(c, vec3(0.70,0.30,0.0)), dot(c, vec3(0.0,0.30,0.70)));
      float l = dot(d, vec3(0.299,0.587,0.114)); return mix(d, vec3(l), 0.25); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d*vec2(1.0,1.78), d*vec2(1.0,1.78));
      vec2 uv = 0.5 + d*(1.0 - uBarrel*0.16*r2);
      vec3 c = texture2D(tDiffuse, uv).rgb;
      if (vUv.x > uSplit) {
        c = mix(c, catColor(c), uCat);
        vec3 nb = pow(c*5.0, vec3(0.8)); float l = dot(nb, vec3(0.299,0.587,0.114));
        nb = mix(vec3(l), nb, 0.35)*vec3(0.9,1.05,0.98) + (hash(vUv*vec2(1080.,1920.)+fract(uTime*7.)*91.)-0.5)*0.08;
        c = mix(c, nb, uNight);
        float l2 = dot(c, vec3(0.299,0.587,0.114)); c = mix(c, vec3(l2), uDesat);
      }
      if (uSplit > 0.002 && uSplit < 0.998 && abs(vUv.x - uSplit) < 0.0025) c = vec3(1.0);
      c *= mix(1.0, smoothstep(0.95,0.3,length((vUv-0.5)*vec2(1.0,1.3))), uVig);
      gl_FragColor = vec4(c,1.0); }`,
});
composer.addPass(grade);
const G = grade.uniforms;
const out = document.getElementById('out'); const ctx = out.getContext('2d');

const hemi = new THREE.HemisphereLight('#fff2f6', '#c99bb8', 1.5); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0e0', 2.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 5; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
sun.position.set(4, 9, 6); sun.target.position.set(0, 0, 0); scene.add(sun, sun.target);
{ const c = sun.shadow.camera; c.left = -7; c.right = 7; c.top = 7; c.bottom = -7; c.near = 0.5; c.far = 40; }
const moon = new THREE.PointLight('#9fb4ff', 0, 12); moon.position.set(1.4, 3.2, -2.6); scene.add(moon);
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { top: { value: new THREE.Color('#79b6f0') }, bot: { value: new THREE.Color('#cfe6fb') } },
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top, bot; varying vec3 vP; void main(){ gl_FragColor = vec4(mix(bot, top, smoothstep(-0.1, 0.45, vP.y)), 1.0); }`,
}));
scene.add(skyDome);
const setSky = (a, b) => { skyDome.material.uniforms.top.value.set(a); skyDome.material.uniforms.bot.value.set(b); };

// ------------------------------------------------------------------ 卧室 + 道具
const room = new THREE.Group(); scene.add(room);
let glassMat;
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
  // 珊瑚红沙发 (红色在猫眼里会变暗)
  const sofaM = std('#e8676f');
  const sb = box(3.0, 0.7, 1.2, sofaM, 0.12); sb.position.set(-1.2, 0.45, -2.5); room.add(sb);
  const sr = box(3.0, 1.0, 0.4, sofaM, 0.12); sr.position.set(-1.2, 1.2, -3.0); room.add(sr);
  for (const x of [-2.75, 0.35]) { const a = box(0.4, 1.1, 1.2, sofaM, 0.12); a.position.set(x, 0.55, -2.5); room.add(a); }
  for (const x of [-1.9, -0.5]) { const c = box(1.2, 0.25, 1.0, '#f39aa0', 0.1); c.position.set(x, 0.92, -2.4); room.add(c); }
  // 猫爬架 + 绿植
  for (const x of [2.2, 3.1]) { const p = mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.0, 16), std('#b98252')); p.position.set(x, 1.0, -2.6); room.add(p); }
  for (const y of [0.09, 2.05]) { const pl = box(1.6, 0.18, 1.0, '#c9b3f0', 0.05); pl.position.set(2.65, y, -2.6); room.add(pl); }
  const pot = box(0.5, 0.5, 0.5, '#ec8a74', 0.06); pot.position.set(1.3, 0.25, -2.6); room.add(pot);
  for (let i = 0; i < 6; i++) { const l = box(0.13, 0.8, 0.13, '#5aae73', 0.04); l.position.set(1.18 + i * 0.05, 0.85, -2.6); l.rotation.z = -0.6 + i * 0.24; room.add(l); }
  const rug = mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.03, 48), std('#f7c1d3'), false, true); rug.position.set(0.2, 0.015, 0.6); room.add(rug);
}
// 电视 (左墙)
const tvScreen = canvasTex(320, 200, () => {});
{
  const stand = box(0.8, 0.7, 2.0, '#a98ad8', 0.06); stand.position.set(-3.15, 0.35, -0.6); room.add(stand);
  const tv = box(0.12, 1.1, 1.8, '#2a2232', 0.04); tv.position.set(-3.2, 1.35, -0.6); room.add(tv);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.95), new THREE.MeshBasicMaterial({ map: tvScreen }));
  scr.rotation.y = Math.PI / 2; scr.position.set(-3.13, 1.35, -0.6); room.add(scr);
}
function drawTV(t) {
  const g = tvScreen.userData.g; g.fillStyle = '#8fd0f7'; g.fillRect(0, 0, 320, 200);
  g.fillStyle = '#7cc47e'; g.fillRect(0, 140, 320, 60);
  const x = 60 + ((t * 80) % 220);                                   // 电视里一只小鸟飞过
  g.fillStyle = '#f2c94c'; g.beginPath(); g.ellipse(x, 70 + 10 * Math.sin(t * 6), 22, 14, 0, 0, 7); g.fill();
  g.fillStyle = '#e8676f'; g.beginPath(); g.moveTo(x + 20, 66); g.lineTo(x + 34, 72); g.lineTo(x + 20, 78); g.fill();
  g.fillStyle = '#ffffff'; g.font = `28px ${FONT}`; g.fillText('小鸟频道', 12, 34);
  tvScreen.needsUpdate = true;
}
// 地毯上的三颗球 + 食盆 + 小鱼干
const balls = [['#e8333f', 0.75, 0.26, 0.9], ['#3d7fe0', -0.35, 0.26, 1.15], ['#f2c93a', 0.2, 0.2, 0.25]].map(([c, x, r, z]) => {
  const b = mesh(new THREE.SphereGeometry(r, 32, 20), std(c, { roughness: 0.5 })); b.position.set(x, r, z); room.add(b); return b;
});
const bowl = mesh(new THREE.CylinderGeometry(0.34, 0.26, 0.2, 32), std('#7fb6ec')); bowl.position.set(1.2, 0.1, 2.3); room.add(bowl);
const treat = new THREE.Group(); treat.position.set(1.2, 0.24, 2.3); room.add(treat);
{ const b = box(0.26, 0.1, 0.12, '#f39a5d', 0.04); treat.add(b); const t = mesh(new THREE.ConeGeometry(0.08, 0.12, 4), std('#f39a5d')); t.rotation.z = Math.PI / 2; t.position.x = -0.17; treat.add(t); }
// 逗猫棒
const wand = new THREE.Group(); scene.add(wand);
const stick = box(0.05, 0.05, 1.3, '#c58a5a', 0.02); wand.add(stick);
const feather = new THREE.Group(); scene.add(feather);
for (let i = 0; i < 5; i++) { const f = mesh(new THREE.ConeGeometry(0.06, 0.38, 6), std(['#ff7aa8', '#ffd34d', '#7fd0ff', '#ff7aa8', '#b28cff'][i])); f.rotation.z = (i - 2) * 0.35; f.position.y = 0.16; feather.add(f); }
const stringGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const string = new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: '#ffffff' })); scene.add(string);
const stage = mesh(new THREE.CylinderGeometry(2.2, 2.4, 0.4, 48), std('#ffffff'), false, true); stage.position.y = -0.2; scene.add(stage);

const cat = makeCat(); scene.add(cat.root);
const person = makePerson(); scene.add(person.root);
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
const v3 = new THREE.Vector3();
function proj(obj, off = [0, 0, 0]) { v3.set(...off); obj.localToWorld(v3); v3.project(camera); return [(v3.x + 1) / 2 * W, (1 - v3.y) / 2 * H]; }

function viewfinder(gt) {  // 猫眼视角取景框
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 8;
  for (const [x, y, sx, sy] of [[40, 220, 1, 1], [W - 40, 220, -1, 1], [40, 1440, 1, -1], [W - 40, 1440, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + sy * 70); ctx.lineTo(x, y); ctx.lineTo(x + sx * 70, y); ctx.stroke();
  }
  if ((gt % 1) < 0.6) { ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(W - 300, 280, 12, 0, 7); ctx.fill(); }
  txt('猫眼视角', W - 200, 280, 40, '#fff', INK, 8);
}
function drawHUD(sc, lt, dur) {
  const [, name, s0, s1, , , skill, side] = sc;
  if (!skill) return;
  const v = Math.round(lerp(s0, s1, smooth(clamp(lt / (dur * 0.85)))));
  const x = 34, y = 560;
  txt('猫眼同步率', x, y, 46, '#fff', INK, 8, 'left');
  txt('C A T   V I S I O N', x, y + 36, 20, '#fff', INK, 4, 'left');
  const ns = 96 * (0.7 + 0.3 * back(lt / 0.4));
  txt(String(v), x, y + 110, ns, '#fff', INK, 10, 'left');
  ctx.font = `${ns}px ${FONT}`; const w = ctx.measureText(String(v)).width;
  txt('%', x + w + 10, y + 128, 44, '#fff', INK, 8, 'left');
  [`新技能: ${skill}`, `副作用: ${side}`].forEach((l, i) => txt(l, x, y + 186 + i * 42, 32, '#fff', INK, 7, 'left'));
  const isBack = name === 'back';
  ctx.fillStyle = isBack ? MINT : '#e8587e'; ctx.beginPath(); ctx.roundRect(x, y + 276, 240, 48, 24); ctx.fill();
  txt(isBack ? '认得你' : '+1 猫眼技能', x + 120, y + 301, 30, '#fff');
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
  const start = STARTS[IDX.motion], end = STARTS[IDX.why] + 0.8;
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
function splitLabels(split, age) {   // 分屏: 左人眼 / 右猫眼
  if (split > 0.08) pill('人眼', split * W / 2, 1360, 40, 'rgba(66,38,63,0.75)', '#fff', age);
  if (split < 0.92) pill('猫眼', (1 + split) * W / 2, 1360, 40, PINK, '#fff', age);
}

// ------------------------------------------------------------------ 每段场景
let labels = [];
const L = fn => labels.push(fn);
const drop = lt => (1 - bounce(lt / 0.7)) * 5;

function setup(name, lt, dur, gt) {
  const p = lt / dur;
  room.visible = true; stage.visible = false; cat.root.visible = false; person.root.visible = false;
  wand.visible = feather.visible = string.visible = false; hearts.forEach(h => h.visible = false);
  cat.root.position.set(0, 0, 0); cat.root.rotation.set(0, 0, 0); cat.root.scale.setScalar(1);
  Object.assign(G.uCat, { value: 0 }); G.uSplit.value = 1; G.uNight.value = 0; G.uBarrel.value = 0; G.uDesat.value = 0; G.uVig.value = 0.25;
  bokeh.enabled = false; camera.fov = 30;
  hemi.intensity = 1.5; hemi.color.set('#fff2f6'); sun.intensity = 2.3; moon.intensity = 0; glassMat.color.set('#ffffff');
  setSky('#79b6f0', '#cfe6fb');
  balls.forEach((b, i) => { b.position.y = b.geometry.parameters.radius + 0.04 * Math.abs(Math.sin(gt * 3 + i)); });
  drawTV(gt);
  let camPos = [0, 2.4, 11.5], camTgt = [0, 1.3, 0];
  switch (name) {
    case 'title': {
      cat.root.position.set(0.75, 0, 0.6); cat.root.rotation.y = -0.35;
      cat.update(gt, { hop: 1, yaw: 0.35 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.6) });
      person.root.position.set(-0.95, 0, 0.2); person.root.rotation.y = 0.35; person.update(lt, { wave: true });
      camPos = [0, 2.6, 13]; camTgt = [0, 1.6, 0];
      break;
    }
    case 'height': {   // 眼睛从 160cm 降到 25cm
      const k = smooth((lt - 0.5) / 1.1);
      person.root.position.set(1.0, 0, -0.6); person.root.rotation.y = -0.3; person.update(lt, { headYaw: 0.2 });
      const ey = lerp(2.55, 0.45, k);
      camPos = [0.1, ey, 4.6]; camTgt = [-0.3, lerp(1.4, 1.25, k), -1.5];
      camera.fov = lerp(42, 55, k);
      L(() => pill('人眼高度 160cm', 540, 1240, 44, 'rgba(66,38,63,0.8)', '#fff', lt < 1.2 ? lt : -1));
      L(() => pill('猫眼高度 25cm', 540, 1240, 48, PINK, '#fff', lt - 1.4));
      L(() => pop('好高！', 760, 520, 80, LAV, lt - 1.9));
      break;
    }
    case 'color': {    // 擦除: 人眼 → 猫眼
      camPos = [0.4, 0.55, 3.6]; camTgt = [0, 0.55, -0.5]; camera.fov = 55;
      const split = 1 - smooth((lt - 0.5) / 1.2) * 0.5;
      G.uSplit.value = split; G.uCat.value = 1;
      L(() => splitLabels(split, lt - 0.5));
      L(() => { const [x, y] = proj(balls[0], [0, 0.45, 0]); pill('红色 → 暗暗的', x, y, 40, PINK, '#fff', lt - 1.9); });
      break;
    }
    case 'fov': {      // 视野变宽: 左边的人、右边的球被“看见”
      person.root.position.set(-2.4, 0, 1.3); person.root.rotation.y = 0.6; person.update(lt, { wave: true });
      const k = smooth((lt - 0.6) / 1.2);
      camPos = [0, 0.6, 4.4]; camTgt = [0, 0.75, 0]; camera.fov = lerp(48, 96, k); G.uBarrel.value = k; G.uCat.value = 1; G.uSplit.value = 0;
      balls[2].position.set(2.3, 0.2, 1.3);
      L(() => pill('人 ≈ 180°', 300, 1250, 42, 'rgba(66,38,63,0.8)', '#fff', lt - 0.2));
      L(() => pill('猫 ≈ 200°', 780, 1250, 46, PINK, '#fff', lt - 1.5));
      L(() => { if (k > 0.8) { const [x, y] = proj(person.root, [0, 3.5, 0]); pop('看见你了', clamp(x, 170, 900), y, 52, PINK, lt - 1.9); } });
      break;
    }
    case 'far': {      // 远处的电视越来越糊
      camPos = [1.6, 0.5, 2.6]; camTgt = [-3.1, 1.2, -0.6]; camera.fov = 50;
      G.uCat.value = 1; G.uSplit.value = 0;
      bokeh.enabled = true; bokeh.uniforms.focus.value = 1.2; bokeh.uniforms.aperture.value = 0.0065 * smooth((lt - 0.4) / 1.0); bokeh.uniforms.maxblur.value = 0.022;
      L(() => { const v = new THREE.Vector3(-3.1, 2.15, -0.6).project(camera); pop('？？？', (v.x + 1) / 2 * W, (1 - v.y) / 2 * H, 80, LAV, lt - 1.4); });
      L(() => pill('看远处比人模糊不少', 540, 1250, 42, PINK, '#fff', lt - 1.7));
      break;
    }
    case 'near': {     // 鼻子底下的小鱼干看不清
      camPos = [1.2, 0.5, 2.85]; camTgt = [1.2, 0.2, 2.25]; camera.fov = 55;
      treat.rotation.y = 0.3 * Math.sin(gt);
      G.uCat.value = 1; G.uSplit.value = 0;
      bokeh.enabled = true; bokeh.uniforms.focus.value = 3.0; bokeh.uniforms.aperture.value = 0.007 * smooth((lt - 0.3) / 0.8); bokeh.uniforms.maxblur.value = 0.018;
      L(() => {   // 胡子从两边伸过来
        const a = smooth((lt - 1.0) / 0.6);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
        for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) {
          const x0 = sx < 0 ? -20 : W + 20, y0 = 1180 + i * 60;
          const x1 = lerp(x0, 540 + sx * (90 + i * 30), a), y1 = lerp(y0, 1000 + i * 40, a);
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, y0 - 60, x1, y1); ctx.stroke();
        }
      });
      L(() => pop('看不清！', 540, 760, 76, LAV, lt - 0.7));
      L(() => pill('胡子来帮忙', 540, 1300, 44, MINT, '#fff', lt - 1.6));
      break;
    }
    case 'night': {    // 关灯, 左人眼一片黑, 右猫眼还能看见
      const off = smooth((lt - 0.3) / 0.6);
      hemi.intensity = lerp(1.5, 0.05, off); sun.intensity = lerp(2.3, 0.0, off); moon.intensity = 3 * off;
      glassMat.color.set(new THREE.Color('#ffffff').lerp(new THREE.Color('#203060'), off));
      person.root.position.set(-0.6, 0, -1.2); person.root.rotation.y = 0.2; person.update(lt, { headYaw: 0.1 });
      camPos = [0.6, 0.55, 3.8]; camTgt = [-0.2, 0.9, -1.2]; camera.fov = 55;
      const split = 1 - smooth((lt - 1.0) / 0.9) * 0.5;
      G.uSplit.value = split; G.uCat.value = 1; G.uNight.value = off;
      L(() => splitLabels(split, lt - 1.0));
      L(() => pill('只要人约 1/6 的光', 540, 1250, 42, SKY, '#fff', lt - 2.1));
      L(() => pop('啪', 900, 560, 80, '#ffe14a', lt - 0.3));
      break;
    }
    case 'motion': {   // 逗猫棒一动就锁定, 最后扑上去
      person.root.position.set(-0.4, 0, -1.0); person.update(lt, { reach: true, headYaw: -0.1 });
      const fx = 0.2 + 0.8 * Math.sin(lt * 3.1), fy = 0.7 + 0.45 * Math.abs(Math.sin(lt * 5.3)), fz = 0.4 + 0.3 * Math.cos(lt * 2.4);
      feather.position.set(fx, fy, fz); feather.rotation.z = 0.6 * Math.sin(lt * 7);
      wand.visible = feather.visible = string.visible = true;
      wand.position.set(0.55, 1.85, -0.35); wand.lookAt(fx, fy + 0.8, fz);
      const tip = new THREE.Vector3(0, 0, 0.65).applyMatrix4(wand.matrixWorld);
      stringGeo.setFromPoints([tip, feather.position.clone().add(new THREE.Vector3(0, 0.3, 0))]);
      const pounce = smooth((lt - 2.9) / 0.4);
      camPos = [lerp(0.2, fx, pounce * 0.6), lerp(0.55, fy, pounce * 0.5), lerp(3.6, fz + 1.2, pounce)]; camTgt = [fx * 0.5, 0.9, -0.5];
      camera.fov = 55;
      G.uCat.value = 1; G.uSplit.value = 0; G.uDesat.value = 0.35;
      bokeh.enabled = true; bokeh.uniforms.focus.value = 3.0; bokeh.uniforms.aperture.value = 0.004; bokeh.uniforms.maxblur.value = 0.012;
      L(() => {   // 锁定框
        if (lt < 0.5) return;
        const [x, y] = proj(feather, [0, 0.15, 0]); const s = 90 + 12 * Math.sin(gt * 10);
        ctx.strokeStyle = '#ff3d6e'; ctx.lineWidth = 9;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.beginPath(); ctx.moveTo(x + sx * s, y + sy * s * 0.5); ctx.lineTo(x + sx * s, y + sy * s); ctx.lineTo(x + sx * s * 0.5, y + sy * s); ctx.stroke();
        }
        pop('锁定!', x, y - s - 40, 56, '#ff3d6e', lt - 0.6);
      });
      L(() => pop('扑！', 540, 700, 140, '#ff3d6e', lt - 2.95));
      break;
    }
    case 'why': {
      room.visible = false; stage.visible = true; stage.material.color.set('#c7b2f0'); setSky('#a98ae0', '#d8c6f6');
      cat.root.rotation.y = 0.5 * Math.sin(lt * 0.7);
      cat.update(gt, { dropY: drop(lt), yaw: -0.4 * Math.sin(lt * 1.3), tilt: 0.15 * Math.sin(lt * 1.9), look: Math.sin(lt * 1.3) });
      ['暗处：看得见', '会动的：一眼锁定', '颜色、远处：没那么重要', '最强时段：黄昏和清晨']
        .forEach((s, i) => L(() => pill(s, 540, 290 + i * 116, 40, '#ffffff', INK, lt - 0.3 - i * 0.7)));
      camPos = [0, 2.1, 9.2]; camTgt = [0, 1.3, 0];
      break;
    }
    case 'back': {     // 先是猫眼里糊糊的你, 然后切回来: 猫走向你
      const w = clamp((lt - 1.4) / 2.4);
      if (lt < 1.4) {
        person.root.position.set(0, 0, -0.8); person.update(lt, { wave: true });
        camPos = [0.2, 0.55, 3.2]; camTgt = [0, 1.6, -0.8]; camera.fov = 55;
        G.uCat.value = 1; G.uSplit.value = 0; G.uDesat.value = 0.2;
        bokeh.enabled = true; bokeh.uniforms.focus.value = 1.0; bokeh.uniforms.aperture.value = 0.006; bokeh.uniforms.maxblur.value = 0.02;
        L(() => pill('声音 ✓  味道 ✓  是你！', 540, 1250, 42, MINT, '#fff', lt - 0.5));
      } else {
        cat.root.position.set(lerp(-1.1, 0.25, smooth(w)), 0, lerp(0.8, 0.4, w)); cat.root.rotation.y = 0.9 - 0.4 * w;
        cat.update(gt, { eyes: 'happy', walk: w < 1 ? 1 : 0, yaw: -0.3 - 0.2 * w, pitch: -0.25 * w });
        person.root.position.set(1.3, 0, -0.2); person.root.rotation.y = -0.7; person.update(lt, { headYaw: 0.3, reach: w >= 1 });
        hearts.forEach((h, i) => { h.visible = true; const u = (lt * 0.4 + i / 14) % 1; h.position.set(0.4 + Math.sin(i * 2.1) * 1.6 + 0.2 * Math.sin(lt * 2 + i), 1 + u * 3.5, 0.5 + Math.cos(i) * 0.5); h.scale.setScalar(0.35 * Math.sin(Math.PI * u) + 0.01); });
        hemi.color.set('#ffe6d6');
      }
      break;
    }
    case 'end': {
      room.visible = false; stage.visible = true; stage.material.color.set('#f9b6cd'); setSky('#f597bc', '#ffd0e0');
      cat.root.scale.setScalar(0.75); cat.root.rotation.y = 0.3 * Math.sin(lt * 1.2);
      cat.update(gt, { hop: 0.6, eyes: 'happy', yaw: 0.4 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.5) });
      camPos = [0, 1.8, 10]; camTgt = [0, 2.4, 0];
      break;
    }
  }
  camera.updateProjectionMatrix();
  return { camPos, camTgt };
}

const SHAKE = { motion: 0.02 };
window.renderAt = (gt) => {
  let i = SCENES.length - 1; while (i > 0 && gt < STARTS[i]) i--;
  const sc = SCENES[i], name = sc[1], dur = sc[0], lt = gt - STARTS[i];
  labels = [];
  const { camPos, camTgt } = setup(name, lt, dur, gt);
  const pov = POV.has(name) || (name === 'back' && lt < 1.4);
  // 镜头: 冲进去回弹 + 慢推 + 手持晃动 (第一人称时晃得轻一点, 像猫在呼吸)
  const push = 1 - (pov ? 0.03 : 0.05) * (lt / dur) - (pov ? 0.06 : 0.14) * (1 - back(lt / 0.45));
  const sh = (SHAKE[name] || 0) + (name === 'motion' && lt > 2.9 ? 0.05 : 0);
  const dir = new THREE.Vector3(...camPos).sub(new THREE.Vector3(...camTgt));
  const pos = new THREE.Vector3(...camTgt).add(dir.multiplyScalar(push));
  const amp = pov ? 0.04 : 0.18;
  pos.x += amp * Math.sin(lt * 0.9 + i) + sh * Math.sin(gt * 53); pos.y += amp * 0.5 * Math.sin(lt * 1.3 + i * 2) + sh * Math.cos(gt * 47);
  camera.position.copy(pos); camera.lookAt(...camTgt);
  camera.updateMatrixWorld();
  sparkRoom.material.uniforms.uTime.value = gt; petals.material.uniforms.uTime.value = gt;
  G.uTime.value = gt;
  composer.render();
  ctx.drawImage(renderer.domElement, 0, 0);
  if (pov) viewfinder(gt);
  labels.forEach(f => f());
  if (name === 'title') {
    const a = back(lt / 0.5);
    ctx.save(); ctx.translate(540, 575); ctx.scale(a, a);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-410, -145, 820, 290, 36); ctx.fill();
    txt('假如你用猫的眼睛', 0, -55, 72, INK); txt('看自己的家', 0, 50, 84, '#ee7a3c'); ctx.restore();
    txt('会看到什么？', 540, 790, 76, '#fff', INK, 12);
  }
  if (name === 'end') {
    const a = smooth(lt / 0.8);
    ctx.globalAlpha = a;
    txt('猫眼里的家，就是这样', 540, 560, 66, '#ffffff', '#c23f74', 12);
    txt('你家猫最爱盯着什么看？', 540, 690, 58, INK, '#ffffff', 10);
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
