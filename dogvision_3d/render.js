#!/usr/bin/env node
// 用无头 Chromium 逐帧渲染 web/scene.js (three.js 3D 场景 + 2D 字幕层).
//   node render.js preview 3.0 10.5 ...   -> output/_preview_<t>.jpg
//   node render.js frames <start> <end>   -> output/frames/f_00000.jpg (帧号区间)
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.woff2': 'font/woff2' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
      r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(r);
    }).listen(0, () => res(srv));
  });
}
(async () => {
  const [mode, ...args] = process.argv.slice(2);
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(`http://localhost:${srv.address().port}/web/index.html${process.env.DBG ? "?dbg" : ""}`);
  await page.waitForFunction('window.READY === true', null, { timeout: 120000 });
  const tl = JSON.parse(fs.readFileSync(path.join(ROOT, 'timeline.json')));
  const save = async (t, file) => {
    const url = await page.evaluate(t => window.renderAt(t), t);
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  };
  if (mode === 'preview') {
    for (const a of args) { const t0 = Date.now(); await save(+a, path.join(ROOT, 'output', `_preview_${a}.jpg`)); console.log(a, Date.now() - t0, 'ms'); }
  } else {
    const dir = path.join(ROOT, 'output', 'frames'); fs.mkdirSync(dir, { recursive: true });
    const N = Math.round(tl.fps * tl.dur);
    const s = +(args[0] || 0), e = Math.min(+(args[1] || N), N);
    const t0 = Date.now();
    for (let i = s; i < e; i++) {
      const f = path.join(dir, `f_${String(i).padStart(5, '0')}.jpg`);
      if (fs.existsSync(f)) continue;
      await save(i / tl.fps, f);
      if (i % 30 === 0) console.log(`frame ${i}/${e}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
  await browser.close(); srv.close();
})();
