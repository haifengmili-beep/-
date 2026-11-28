// 《假如你用狗的眼睛看自己的家》 3D 版 — three.js 场景 + 狗眼滤镜 + 2D 字幕层. window.renderAt(t) 决定性渲染一帧.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { clamp, smooth, lerp, back, bounce, rng, canvasTex, std, rbox, mesh, box, heartTex, makeSparkles,
         makeCat, makePerson, makeDog } from './lib.js';

const W = 1080, H = 1920;
const FONT = '"WenQuanYi Zen Hei", sans-serif';
await document.fonts.load(`80px ${FONT}`, '猫');

// ------------------------------------------------------------------ 时间线
// [时长, 名字, 同步率起, 同步率止, 字幕, 英文, 新技能, 副作用]
const SCENES = [
  [3.2, 'title', 0, 0, '', '', '', ''],
  [3.4, 'height', 0, 14, '第1招：眼睛降到约50厘米\n沙发和人都变成大高个', 'Skill 1: Eyes about 50 cm off the floor. The sofa and you tower overhead.', '低视角', '人像巨人'],
  [3.8, 'color', 14, 28, '第2招：世界只剩蓝和黄\n红色、绿色都变成土黄', 'Skill 2: Mostly blues and yellows. Reds and greens turn a muddy yellow.', '蓝黄视觉', '红球找不到'],
  [3.6, 'fov', 28, 42, '第3招：视野更宽\n狗约240度，人约180度', 'Skill 3: A wider view. About 240° for dogs, 180° for people.', '超广角', '斜眼也看得见你'],
  [3.8, 'blur', 42, 56, '第4招：看什么都糊糊的\n清晰度大约只有人的1/4', 'Skill 4: Everything is fuzzy. Roughly a quarter of human sharpness.', '看个大概', '看不清字'],
  [3.8, 'night', 56, 72, '第5招：关灯后比人看得清\n眼底有一层“反光镜”', 'Skill 5: Better than you in the dark, thanks to a mirror layer behind the eye.', '夜视', '半夜巡逻'],
  [3.8, 'flicker', 72, 86, '第6招：眼睛反应更快\n老式电视在它眼里一闪一闪', 'Skill 6: Faster eyes. Old TVs look like they are flickering.', '快速捕捉', '老电视会闪'],
  [5.0, 'motion', 86, 100, '第7招：会动的东西特别显眼\n红球找不到，蓝球一飞就锁定', 'Skill 7: Motion pops out. The red ball vanishes; the flying blue one gets locked on.', '动态锁定', '球一飞就冲'],
  [4.6, 'why', 0, 0, '狗的祖先在黄昏和清晨打猎\n看得暗、看得动，比看得清更重要', "Dogs' ancestors hunted at dawn and dusk: dim light and motion matter more than detail.", '', ''],
  [5.0, 'back', 100, 100, '在它眼里，你糊糊的、只有蓝和黄\n但它鼻子一闻，就知道是你', 'To your dog you look fuzzy and blue-yellow, but its nose knows you instantly.', '认得你', '无'],
  [3.6, 'end', 0, 0, '', '', '', ''],
];
const STARTS = []; { let a = 0; for (const s of SCENES) { STARTS.push(a); a += s[0]; } }
const IDX = Object.fromEntries(SCENES.map((s, i) => [s[1], i]));
const POV = new Set(['height', 'color', 'fov', 'blur', 'night', 'flicker', 'motion']);
const DANMAKU = ['原来狗看我是糊的', '难怪红球总找不到', '以后买蓝色玩具', '黄色飞盘yyds', '锁定！', '冲冲冲', '+1',
  '涨知识了', '我家狗也这样', '球呢球呢', '哈哈哈哈哈', 'awsl', '狗鼻子才是本体', '老电视会闪？？'];
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
// 狗眼滤镜: 蓝黄二色 / 模糊 / 夜视增亮 / 广角畸变 / 去饱和; uSplit 左边保持人眼, 右边是狗眼
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uCat: { value: 0 }, uBlur: { value: 0 }, uSplit: { value: 1 }, uNight: { value: 0 },
              uBarrel: { value: 0 }, uDesat: { value: 0 }, uVig: { value: 0.25 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uBlur, uCat, uSplit, uNight, uBarrel, uDesat, uVig; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    vec3 catColor(vec3 c){   // 狗: 二色视觉 (Machado 绿色盲近似), 只分得清蓝和黄
      vec3 d = clamp(vec3(dot(c, vec3(0.367,0.861,-0.228)), dot(c, vec3(0.280,0.673,0.047)), dot(c, vec3(-0.012,0.043,0.969))), 0.0, 1.0);
      float l = dot(d, vec3(0.299,0.587,0.114)); return mix(d, vec3(l), 0.12); }
    void main(){
      vec2 d = vUv - 0.5; float r2 = dot(d*vec2(1.0,1.78), d*vec2(1.0,1.78));
      vec2 uv = 0.5 + d*(1.0 - uBarrel*0.16*r2);
      vec3 c = texture2D(tDiffuse, uv).rgb;
      if (vUv.x > uSplit) {
        if (uBlur > 0.0) {   // 视力模糊: 黄金角螺旋 24 点采样
          vec3 acc = c; float wsum = 1.0;
          for (int i = 1; i < 24; i++) { float fi = float(i); float rr = sqrt(fi/24.0)*uBlur; float a = fi*2.39996;
            float w = 1.0 - 0.5*fi/24.0; acc += texture2D(tDiffuse, uv + vec2(cos(a)/1080.0, sin(a)/1920.0)*rr).rgb*w; wsum += w; }
          c = acc / wsum; }
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
  // 珊瑚红沙发 (红色在狗眼里会变成土黄)
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
function drawTV(t, flick = 0) {
  const g = tvScreen.userData.g; g.fillStyle = '#8fd0f7'; g.fillRect(0, 0, 320, 200);
  g.fillStyle = '#7cc47e'; g.fillRect(0, 140, 320, 60);
  const x = 60 + ((t * 80) % 220);                                   // 电视里一只小鸟飞过
  g.fillStyle = '#f2c94c'; g.beginPath(); g.ellipse(x, 70 + 10 * Math.sin(t * 6), 22, 14, 0, 0, 7); g.fill();
  g.fillStyle = '#e8676f'; g.beginPath(); g.moveTo(x + 20, 66); g.lineTo(x + 34, 72); g.lineTo(x + 20, 78); g.fill();
  g.fillStyle = '#ffffff'; g.font = `bold 40px ${FONT}`; g.fillText('狗狗频道', 12, 44);
  if (flick > 0) {   // 老电视的扫描闪烁: 滚动暗条 + 轻微明暗起伏
    for (let k = 0; k < 3; k++) { const y = ((t * 260 + k * 70) % 260) - 40; g.fillStyle = `rgba(20,10,30,${0.55 * flick})`; g.fillRect(0, y, 320, 26); }
    g.fillStyle = `rgba(0,0,0,${0.22 * flick * (0.5 + 0.5 * Math.sin(t * 38))})`; g.fillRect(0, 0, 320, 200);
  }
  tvScreen.needsUpdate = true;
}
// 地毯上的三颗球 + 食盆 + 小鱼干
const BALL0 = [[0.75, 0, 0.9], [-0.35, 0, 1.15], [0.2, 0, 0.25]];
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
const dog = makeDog(); scene.add(dog.root);
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

function viewfinder(gt) {  // 狗眼视角取景框
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 8;
  for (const [x, y, sx, sy] of [[40, 220, 1, 1], [W - 40, 220, -1, 1], [40, 1440, 1, -1], [W - 40, 1440, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + sy * 70); ctx.lineTo(x, y); ctx.lineTo(x + sx * 70, y); ctx.stroke();
  }
  if ((gt % 1) < 0.6) { ctx.fillStyle = '#ff4d6d'; ctx.beginPath(); ctx.arc(W - 300, 280, 12, 0, 7); ctx.fill(); }
  txt('狗眼视角', W - 200, 280, 40, '#fff', INK, 8);
}
function drawHUD(sc, lt, dur) {
  const [, name, s0, s1, , , skill, side] = sc;
  if (!skill) return;
  const v = Math.round(lerp(s0, s1, smooth(clamp(lt / (dur * 0.85)))));
  const x = 34, y = 560;
  txt('狗眼同步率', x, y, 46, '#fff', INK, 8, 'left');
  txt('D O G   V I S I O N', x, y + 36, 20, '#fff', INK, 4, 'left');
  const ns = 96 * (0.7 + 0.3 * back(lt / 0.4));
  txt(String(v), x, y + 110, ns, '#fff', INK, 10, 'left');
  ctx.font = `${ns}px ${FONT}`; const w = ctx.measureText(String(v)).width;
  txt('%', x + w + 10, y + 128, 44, '#fff', INK, 8, 'left');
  [`新技能: ${skill}`, `副作用: ${side}`].forEach((l, i) => txt(l, x, y + 186 + i * 42, 32, '#fff', INK, 7, 'left'));
  const isBack = name === 'back';
  ctx.fillStyle = isBack ? MINT : '#e8587e'; ctx.beginPath(); ctx.roundRect(x, y + 276, 240, 48, 24); ctx.fill();
  txt(isBack ? '认得你' : '+1 狗眼技能', x + 120, y + 301, 30, '#fff');
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
function splitLabels(split, age) {   // 分屏: 左人眼 / 右狗眼
  if (split > 0.08) pill('人眼', split * W / 2, 1360, 40, 'rgba(66,38,63,0.75)', '#fff', age);
  if (split < 0.92) pill('狗眼', (1 + split) * W / 2, 1360, 40, PINK, '#fff', age);
}

// ------------------------------------------------------------------ 每段场景
let labels = [];
const L = fn => labels.push(fn);
const drop = lt => (1 - bounce(lt / 0.7)) * 5;

// ------------------------------------------------------------------ 分镜 (每段 = 1~3 个镜头; 返回 pov/镜头起点/是否锁机位)
// 构图: 竖屏主体放在中带 (y≈600~1300), 左侧 HUD 区和底部字幕区留空; 人眼=标准镜头, 狗眼=低机位广角 + 呼吸晃动
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const arc = (p0, p1, u, h) => { const q = p0.clone().lerp(p1, u); q.y += h * 4 * u * (1 - u); return q; };
function dogEye() {   // 狗左眼的世界坐标 + 视线前方一点
  dog.root.updateMatrixWorld(true);
  return [dog.headPivot.localToWorld(V(0.24, 0.53, 0.62)), dog.headPivot.localToWorld(V(0.24, 0.53, 2.5))];
}
function faceCam(obj, dist, h, side = 0) {   // 正面机位: 物体朝向 +z 方向前方 dist 处
  const ry = obj.rotation.y, p = obj.position;
  return [p.x + Math.sin(ry) * dist + Math.cos(ry) * side, h, p.z + Math.cos(ry) * dist - Math.sin(ry) * side];
}
function setup(name, lt, dur, gt) {
  room.visible = true; stage.visible = false; cat.root.visible = false; person.root.visible = false; dog.root.visible = false;
  wand.visible = feather.visible = string.visible = false; hearts.forEach(h => h.visible = false);
  cat.root.position.set(0, 0, 0); cat.root.rotation.set(0, 0, 0); cat.root.scale.setScalar(1);
  dog.root.position.set(0, 0, 0); dog.root.rotation.set(0, 0, 0); dog.root.scale.setScalar(1);
  G.uCat.value = 0; G.uSplit.value = 1; G.uNight.value = 0; G.uBarrel.value = 0; G.uDesat.value = 0; G.uVig.value = 0.25; G.uBlur.value = 0;
  bokeh.enabled = false; camera.fov = 30;
  hemi.intensity = 1.5; hemi.color.set('#fff2f6'); sun.intensity = 2.3; moon.intensity = 0; glassMat.color.set('#ffffff');
  setSky('#79b6f0', '#cfe6fb');
  balls.forEach((b, i) => { const r = b.geometry.parameters.radius; b.position.set(...BALL0[i]); b.position.y = r + 0.04 * Math.abs(Math.sin(gt * 3 + i)); });
  drawTV(gt, name === 'flicker' && lt > 1.3 ? smooth((lt - 1.3) / 0.3) : 0);
  const sitCat = (x, z, ry, s = 0.55) => { cat.root.position.set(x, 0, z); cat.root.rotation.y = ry; cat.root.scale.setScalar(s); cat.update(gt, { yaw: 0.3 * Math.sin(lt * 1.7), tilt: 0.1 * Math.sin(lt * 2.2) }); };
  const DOGY = 0.8;   // 狗眼高度 (≈50cm)
  const S = { camPos: [0, 2.4, 11.5], camTgt: [0, 1.3, 0], pov: POV.has(name), s0: 0, still: false };
  switch (name) {
    case 'title': {   // 定场双人镜头 → 结尾推进狗的眼睛 (动机转场, 白闪后接狗眼 POV)
      const k = smooth((lt - 2.35) / 0.85);
      dog.root.position.set(0.95, 0, 0.9); dog.root.rotation.y = -0.4 * (1 - k); dog.root.scale.setScalar(0.9);
      dog.update(gt, { hop: 1 - k, wag: 2.2, yaw: 0.35 * Math.sin(lt * 2) * (1 - k), tilt: 0.18 * Math.sin(lt * 2.6) * (1 - k), look: -0.6 * k });
      sitCat(-0.15, 2.0, 0.15, 0.5);
      person.root.position.set(-0.95, 0, 0); person.root.rotation.y = 0.35; person.update(lt, { wave: true });
      const [eye, ahead] = dogEye(), base = V(0, 2.2, 12.5), tgt0 = V(0, 1.7, 0);
      const pos = base.clone().lerp(eye.clone().lerp(ahead, 0.12), k * k);
      S.camPos = pos.toArray(); S.camTgt = tgt0.clone().lerp(eye, smooth(k * 1.6)).toArray(); S.still = k > 0;
      camera.fov = lerp(30, 24, k);
      break;
    }
    case 'height': {   // 摇臂下降: 160cm → 50cm, 主人从平视变成仰视的巨人
      const k = smooth((lt - 0.5) / 1.2);
      person.root.position.set(0.35, 0, -0.9); person.root.rotation.y = -0.15; person.update(lt, { headYaw: 0.15 - 0.3 * k, wave: lt > 2.3 });
      S.camPos = [0.15, lerp(2.55, DOGY, k), lerp(4.8, 4.0, k)]; S.camTgt = [0.25, lerp(1.6, 2.05, k), -0.9];
      camera.fov = lerp(40, 58, k);
      L(() => pill('人眼高度 160cm', 540, 1240, 44, 'rgba(66,38,63,0.8)', '#fff', lt < 1.2 ? lt : -1));
      L(() => pill('狗眼高度 约50cm', 540, 1240, 48, PINK, '#fff', lt - 1.4));
      L(() => pop('好高！', 800, 470, 80, LAV, lt - 1.9));
      break;
    }
    case 'color': {    // 低机位看地毯上的玩具, 竖向分屏擦除: 左人眼 / 右狗眼
      S.camPos = [0.2, DOGY, 6.0]; S.camTgt = [0.0, 0.55, 0.2]; camera.fov = 42;
      sitCat(-1.25, 0.2, 0.5);
      const split = 1 - smooth((lt - 0.5) / 1.3) * 0.62;
      G.uSplit.value = split; G.uCat.value = 1;
      L(() => splitLabels(split, lt - 0.5));
      L(() => { const [x, y] = proj(balls[0], [0, 0.5, 0]); pill('红球 → 土黄色', clamp(x, 380, 860), y - 20, 38, PINK, '#fff', lt - 1.9); });
      L(() => { const [x, y] = proj(balls[1], [0, -0.55, 0]); pill('蓝球最显眼 ✓', clamp(x, 400, 860), y + 30, 38, SKY, '#fff', lt - 2.5); });
      break;
    }
    case 'fov': {      // 推拉变焦 (dolly zoom): 中间的球大小不变, 两边的世界被“拉”进画面
      person.root.position.set(-1.3, 0, -0.6); person.root.rotation.y = 0.5; person.update(lt, { wave: true });
      sitCat(1.3, -0.2, -0.5);
      const k = smooth((lt - 0.5) / 1.5), fov = lerp(40, 100, k);
      const d = 1.6 / Math.tan(THREE.MathUtils.degToRad(fov / 2)), tg = V(0.2, 0.45, 0.7);
      S.camPos = [tg.x, DOGY, tg.z + d]; S.camTgt = tg.toArray(); camera.fov = fov; S.still = true;
      G.uBarrel.value = 1.2 * k; G.uCat.value = 1; G.uSplit.value = 0;
      L(() => pill('人 ≈ 180°', 290, 1250, 42, 'rgba(66,38,63,0.8)', '#fff', lt - 0.2));
      L(() => pill('狗 ≈ 240°', 790, 1250, 46, PINK, '#fff', lt - 1.6));
      L(() => pill('（因品种而异）', 790, 1330, 30, 'rgba(255,255,255,0.85)', INK, lt - 1.8));
      L(() => { if (k > 0.85) { const [x, y] = proj(person.root, [0, 3.6, 0]); pop('看见你了', clamp(x, 200, 880), clamp(y, 420, 1100), 52, PINK, lt - 2.1); } });
      break;
    }
    case 'blur': {     // 正对电视的 POV (左清楚/右糊), 然后反打: 狗的近景歪头
      if (lt < 2.8) {
        S.camPos = [0.3, DOGY, -0.5]; S.camTgt = [-3.1, 1.3, -0.6]; camera.fov = 58;
        G.uCat.value = 1;
        const split = 1 - smooth((lt - 0.4) / 1.0) * 0.5;
        G.uSplit.value = split; G.uBlur.value = 14 * smooth((lt - 0.4) / 1.0);
        L(() => splitLabels(split, lt - 0.4));
        L(() => pop('写的啥？？', 760, 520, 64, LAV, lt - 1.5));
        L(() => pill('人 20/20  vs  狗 约20/75', 540, 1250, 40, PINK, '#fff', lt - 1.9));
      } else {           // 反打: 从电视方向看狗, 近景
        const u = lt - 2.8; S.pov = false; S.s0 = 2.8;
        dog.root.position.set(0.3, 0, -0.5); dog.root.rotation.y = -0.6;   // 反打时“偷”一下朝向, 让机位避开电视
        dog.update(gt, { tilt: 0.45 * smooth(u / 0.3), yaw: 0.1, look: 0.3, wag: 0.4, tongue: 0 });
        S.camPos = faceCam(dog.root, 4.4, 1.8, 0.2); S.camTgt = [0.3, 1.25, -0.5]; camera.fov = 46;
        L(() => pop('？', 700, 620, 150, LAV, u - 0.15));
      }
      break;
    }
    case 'night': {    // 关灯: 先全黑, 再擦出狗眼的夜视
      const off = smooth((lt - 0.3) / 0.6);
      hemi.intensity = lerp(1.5, 0.05, off); sun.intensity = lerp(2.3, 0.0, off); moon.intensity = 3 * off;
      glassMat.color.set(new THREE.Color('#ffffff').lerp(new THREE.Color('#203060'), off));
      person.root.position.set(-0.4, 0, -1.3); person.root.rotation.y = 0.15; person.update(lt, { headYaw: 0.1 });
      sitCat(1.25, -0.7, -0.5);
      S.camPos = [0.4, DOGY, 3.6]; S.camTgt = [0.0, 1.15, -1.1]; camera.fov = 52;
      const split = 1 - smooth((lt - 1.0) / 0.9) * 0.5;
      G.uSplit.value = split; G.uCat.value = 1; G.uNight.value = off; G.uBlur.value = 3;
      L(() => splitLabels(split, lt - 1.0));
      L(() => pill('视网膜后的“反光层”把光再用一次', 540, 1250, 38, SKY, '#fff', lt - 2.0));
      L(() => pop('啪', 880, 470, 80, '#ffe14a', lt - 0.3));
      break;
    }
    case 'flicker': {  // 过肩镜头 (人看: 稳) → 切狗眼 POV (一闪一闪) 慢推
      if (lt < 1.3) {
        S.pov = false;
        dog.root.position.set(0.9, 0, 1.6); dog.root.rotation.y = -2.07; dog.root.scale.setScalar(0.9);
        dog.update(gt, { wag: 0.8, tongue: 0, yaw: 0.05, perk: 0.3 });
        S.camPos = faceCam(dog.root, -2.0, 2.05, -0.75); S.camTgt = [-3.1, 1.25, -0.6]; camera.fov = 36;
        L(() => pill('你看：画面很稳', 540, 1250, 42, 'rgba(66,38,63,0.8)', '#fff', lt));
      } else {
        S.s0 = 1.3; const u = (lt - 1.3) / (dur - 1.3);
        S.camPos = [lerp(0.6, -0.4, u), DOGY, lerp(1.3, 0.6, u)]; S.camTgt = [-3.1, 1.3, -0.6]; camera.fov = 44;
        G.uCat.value = 1; G.uSplit.value = 0; G.uBlur.value = 3;
        L(() => pill('狗看：一闪一闪', 540, 1250, 46, PINK, '#fff', lt - 1.3));
        L(() => pill('人约60次/秒 · 狗约75次/秒', 540, 1340, 34, SKY, '#fff', lt - 1.8));
        L(() => pop('闪？！', 820, 480, 84, LAV, lt - 1.5));
        L(() => pill('新电视刷新快，狗也能看', 540, 400, 36, MINT, '#fff', lt - 2.6));
      }
      break;
    }
    case 'motion': {   // 高潮: 扔红球 → 找不到 (摇镜头搜索) → 扔蓝球 → 锁定 → 冲
      const girl = V(-0.6, 1.7, -1.4), hand = V(-0.1, 1.9, -1.0);
      person.root.position.set(-0.6, 0, -1.4);
      const hold = lt < 0.7 || (lt > 1.9 && lt < 2.5);
      person.update(lt, { reach: hold, wave: !hold && lt < 3.2, headYaw: lt < 2 ? 0.4 : -0.3 });
      const red = balls[0], blue = balls[1], rr = 0.26;
      const redEnd = V(-2.0, rr, 1.7), blueEnd = V(1.8, rr, 1.1);
      if (lt < 0.7) red.position.copy(hand).y += 0.06 * Math.sin(lt * 9);
      else { const u = clamp((lt - 0.7) / 0.7); red.position.copy(arc(hand, redEnd, u, 0.9)); if (u >= 1) red.position.y = rr + 0.12 * Math.abs(Math.sin((lt - 1.4) * 9)) * Math.max(0, 1 - (lt - 1.4) * 2); }
      red.rotation.z = lt * 5;
      const ub = clamp((lt - 2.5) / 1.1);
      if (lt < 1.9) blue.position.set(-0.35, rr, 1.15);
      else if (lt < 2.5) blue.position.copy(hand).y += 0.06 * Math.sin(lt * 9);
      else { blue.position.copy(arc(hand, blueEnd, Math.min(ub / 0.7, 1), 1.3)); if (ub > 0.7) blue.position.y = rr + 0.45 * Math.abs(Math.sin(Math.PI * (ub - 0.7) / 0.3)) * (1 - (ub - 0.7) / 0.3); }
      blue.rotation.z = -lt * 6;
      // 视线: 主人 → 跟红球 → 左右找 → 回到主人 → 跟蓝球
      const w1 = smooth((lt - 0.7) / 0.35) * (1 - smooth((lt - 2.0) / 0.4)), w2 = smooth((lt - 2.5) / 0.3);
      const search = smooth((lt - 1.5) / 0.2) * (1 - smooth((lt - 1.95) / 0.2));
      const look = girl.clone().lerp(red.position.clone().add(V(0.9 * search * Math.sin((lt - 1.5) * 9), 0.3, 0)), w1).lerp(blue.position, w2);
      const rush = smooth((lt - 3.8) / 0.8);
      const base = V(0.3, DOGY, 3.8), goal = blueEnd.clone().add(V(-0.2, DOGY - rr, 1.0));
      const cp = base.lerp(goal, rush); cp.y += 0.12 * Math.abs(Math.sin(lt * 14)) * rush;
      S.camPos = cp.toArray(); S.camTgt = look.toArray(); camera.fov = 55;
      G.uCat.value = 1; G.uSplit.value = 0; G.uDesat.value = 0.15; G.uBlur.value = 4;
      L(() => { if (lt > 1.55 && lt < 2.4) { const [x, y] = proj(red); pop('红球…在哪？', 540, 560, 64, LAV, lt - 1.55); pill('红球 ≈ 地板色', clamp(x, 300, 800), clamp(y + 120, 700, 1200), 34, PINK, '#fff', lt - 1.7); } });
      L(() => {   // 锁定框
        if (lt < 2.7) return;
        const [x, y] = proj(blue); const s = 80 + 12 * Math.sin(gt * 10);
        ctx.strokeStyle = '#ff3d6e'; ctx.lineWidth = 9;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.beginPath(); ctx.moveTo(x + sx * s, y + sy * s * 0.5); ctx.lineTo(x + sx * s, y + sy * s); ctx.lineTo(x + sx * s * 0.5, y + sy * s); ctx.stroke();
        }
        pop('锁定!', x, y - s - 40, 56, '#ff3d6e', lt - 2.75);
      });
      L(() => pop('冲！', 540, 640, 150, '#ff3d6e', lt - 3.8));
      break;
    }
    case 'why': {      // 主角亮相: 紫色台子 + 缓慢环绕
      room.visible = false; stage.visible = true; stage.material.color.set('#c7b2f0'); setSky('#a98ae0', '#d8c6f6');
      dog.root.position.set(0, 0, 0.4); dog.root.rotation.y = 0.25 * Math.sin(lt * 0.7);
      dog.update(gt, { dropY: drop(lt), wag: 1.6, yaw: -0.4 * Math.sin(lt * 1.3), tilt: 0.2 * Math.sin(lt * 1.9), look: Math.sin(lt * 1.3), perk: 0.3 + 0.3 * Math.sin(lt * 2) });
      ['暗处：看得见', '会动的：一眼锁定', '颜色：只分蓝和黄', '细节：交给鼻子']
        .forEach((s, i) => L(() => pill(s, 540, 290 + i * 116, 40, '#ffffff', INK, lt - 0.3 - i * 0.7)));
      const a = lerp(-0.4, 0.4, lt / dur);
      S.camPos = [9.2 * Math.sin(a), 2.1, 9.2 * Math.cos(a)]; S.camTgt = [0, 1.3, 0];
      break;
    }
    case 'back': {     // 反转: 狗眼里糊糊的你 + 气味线 → 切回彩色, 低机位跟拍狗冲过来 → 双人近景, 狗看镜头
      if (lt < 1.4) {
        S.pov = true;
        person.root.position.set(0, 0, -0.8); person.update(lt, { wave: true });
        S.camPos = [0.2, DOGY, 3.2]; S.camTgt = [0, 1.7, -0.8]; camera.fov = 55;
        G.uCat.value = 1; G.uSplit.value = 0; G.uBlur.value = 12;
        L(() => pill('鼻子 ✓  声音 ✓  是你！', 540, 1250, 42, MINT, '#fff', lt - 0.5));
        L(() => {   // 气味线飘过来
          ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 8; ctx.lineCap = 'round';
          for (let k = 0; k < 3; k++) { ctx.beginPath(); for (let y = 0; y < 26; y++) { const yy = 700 + y * 18, xx = 440 + k * 100 + 30 * Math.sin(y * 0.4 - lt * 6 + k); y ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke(); }
        });
        break;
      }
      // 重新调度: 主人在画左, 狗从右后方朝镜头 3/4 侧脸跑向她 (观众看得见它的脸)
      person.root.position.set(-0.75, 0, 0.0); person.root.rotation.y = 0.55;
      balls.forEach((b, i) => b.position.set(-2.6 + i * 0.5, b.geometry.parameters.radius, -2.0 + (i % 2) * 0.4));   // 收到角落, 不挡跟拍
      sitCat(2.0, -1.3, -0.5);
      const w = clamp((lt - 1.4) / 1.5), arrived = lt > 2.9;
      const p0 = V(2.6, 0, -1.8), p1 = V(0.35, 0, 0.7);
      dog.root.position.copy(p0.lerp(p1, smooth(w))); dog.root.scale.setScalar(0.85);
      const turn = smooth((lt - 3.3) / 0.5);
      dog.root.rotation.y = lerp(-0.82, -0.25, turn);
      dog.update(gt, { eyes: arrived ? 'happy' : 'normal', run: arrived ? 0 : 1, hop: arrived ? 0.5 : 0, wag: 3, yaw: -0.5 * (1 - turn), pitch: -0.15 });
      person.update(lt, { headYaw: -0.2, reach: arrived, wave: !arrived });
      if (lt < 3.4) {    // 低机位, 摇镜头跟着狗
        S.pov = false; S.s0 = 1.4;
        const d = dog.root.position;
        S.camPos = [0.1, 0.7, 6.4]; S.camTgt = [lerp(0.2, d.x, 0.7), 1.2, lerp(0, d.z, 0.5)]; camera.fov = 38;
      } else {           // 双人近景, 狗转头看镜头
        S.pov = false; S.s0 = 3.4;
        S.camPos = [-0.1, 1.9, 6.6]; S.camTgt = [-0.15, 1.65, 0]; camera.fov = 36;
        hearts.forEach((h, i) => { h.visible = true; const u = ((lt - 3.4) * 0.5 + i / 14) % 1; h.position.set(-0.2 + Math.sin(i * 2.1) * 1.4 + 0.2 * Math.sin(lt * 2 + i), 0.9 + u * 2.8, 0.4 + Math.cos(i) * 0.5); h.scale.setScalar(0.3 * Math.sin(Math.PI * u) + 0.01); });
      }
      hemi.color.set('#ffe6d6');
      break;
    }
    case 'end': {
      room.visible = false; stage.visible = true; stage.material.color.set('#f9b6cd'); setSky('#f597bc', '#ffd0e0');
      dog.root.position.set(0.55, 0, 0); dog.root.scale.setScalar(0.7); dog.root.rotation.y = -0.3 + 0.2 * Math.sin(lt * 1.2);
      dog.update(gt, { hop: 0.6, eyes: 'happy', wag: 2.5, yaw: 0.4 * Math.sin(lt * 2), tilt: 0.15 * Math.sin(lt * 2.5) });
      cat.root.position.set(-0.75, 0, 0.3); cat.root.scale.setScalar(0.55); cat.root.rotation.y = 0.4;
      cat.update(gt, { eyes: 'happy', yaw: -0.3 + 0.3 * Math.sin(lt * 1.6), tilt: 0.15 * Math.sin(lt * 2.1) });
      S.camPos = [0, 1.8, 10]; S.camTgt = [0, 2.4, 0];
      break;
    }
  }
  camera.updateProjectionMatrix();
  return S;
}

const SHAKE = { motion: 0.02 };
window.renderAt = (gt) => {
  let i = SCENES.length - 1; while (i > 0 && gt < STARTS[i]) i--;
  const sc = SCENES[i], name = sc[1], dur = sc[0], lt = gt - STARTS[i];
  labels = [];
  const { camPos, camTgt, pov, s0, still } = setup(name, lt, dur, gt);
  const st = lt - s0, sd = dur - s0;   // 镜头内时间: 每个镜头都有自己的 punch-in
  // 镜头: 冲进去回弹 + 慢推 + 手持晃动 (第一人称时晃得轻一点, 像狗在喘气)
  const push = still ? 1 : 1 - (pov ? 0.03 : 0.05) * (st / sd) - (pov ? 0.06 : 0.14) * (1 - back(st / 0.45));
  const sh = (SHAKE[name] || 0) + (name === 'motion' && lt > 3.8 ? 0.05 : 0);
  const dir = new THREE.Vector3(...camPos).sub(new THREE.Vector3(...camTgt));
  const pos = new THREE.Vector3(...camTgt).add(dir.multiplyScalar(push));
  const amp = still ? 0.01 : pov ? 0.04 : 0.18;
  pos.x += amp * Math.sin(lt * 0.9 + i) + sh * Math.sin(gt * 53); pos.y += amp * 0.5 * Math.sin(lt * 1.3 + i * 2) + sh * Math.cos(gt * 47);
  camera.position.copy(pos); camera.lookAt(...camTgt); if (window.DBG) console.warn(name, pos.toArray().map(v => v.toFixed(2)), camTgt, camera.fov, dog.root.position.toArray(), dog.root.rotation.y);
  camera.updateMatrixWorld();
  sparkRoom.material.uniforms.uTime.value = gt; petals.material.uniforms.uTime.value = gt;
  G.uTime.value = gt;
  composer.render();
  ctx.drawImage(renderer.domElement, 0, 0);
  if (pov) viewfinder(gt);
  labels.forEach(f => f());
  if (name === 'title') {
    const a = back(lt / 0.5);
    ctx.save(); ctx.translate(540, 330); ctx.scale(a, a);
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.roundRect(-410, -145, 820, 290, 36); ctx.fill();
    txt('假如你用狗的眼睛', 0, -55, 72, INK); txt('看自己的家', 0, 50, 84, '#ee7a3c'); ctx.restore();
    txt('会看到什么？', 540, 545, 76, '#fff', INK, 12);
  }
  if (name === 'end') {
    const a = smooth(lt / 0.8);
    ctx.globalAlpha = a;
    txt('狗眼里的家，就是这样', 540, 560, 66, '#ffffff', '#c23f74', 12);
    txt('你家狗最爱什么颜色的玩具？', 540, 690, 58, INK, '#ffffff', 10);
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
window.READY = true; window.DBG = location.search.includes('dbg');
