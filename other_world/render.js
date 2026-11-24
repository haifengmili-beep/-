// 逐帧渲染 scene.html -> frames/*.jpg
// 用法: node render.js preview 2 6 11 ...   |  node render.js frames <start> <end> [scale]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const HERE = __dirname;
const WEB = process.env.WEB || '/tmp/claude-0/-home-user--/5a698c84-6fe1-5be7-aabc-f77eef6f83b6/scratchpad/web';
const FRAMES = process.env.FRAMES || path.join(WEB, 'frames');
const FPS = 30;
const VO_START = [5.2, 9.9, 14.5, 18.5, 21.2, 24.6];
const info = JSON.parse(fs.readFileSync(path.join(HERE, 'vo/lines.json')));
const SUB = { 2: '罐头吃不完，身上也再也不疼了。' };
const LINES = info.map((x, i) => ({ text: x.text, sub: SUB[i], start: VO_START[i], end: VO_START[i] + x.dur }));

function serve() {
  return new Promise(res => {
    const srv = http.createServer((q, r) => {
      let p = decodeURIComponent(q.url.split('?')[0]);
      const f = p === '/scene.html' ? path.join(HERE, 'scene.html') : path.join(WEB, p);
      fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; }
        r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(d); });
    }).listen(0, () => res(srv));
  });
}
(async () => {
  const [mode, ...args] = process.argv.slice(2);
  const srv = await serve();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const scale = mode === 'preview' ? 0.5 : parseFloat(args[2] || '1');
  const page = await browser.newPage({ viewport: { width: Math.round(1080 * scale), height: Math.round(1920 * scale) } });
  page.on('console', m => console.log('[page]', m.text())); page.on('pageerror', e => console.log('[err]', e.message));
  await page.goto(`http://localhost:${srv.address().port}/scene.html?scale=${scale}&lines=${encodeURIComponent(JSON.stringify(LINES))}`);
  await page.waitForFunction('window.ready === true', null, { timeout: 60000 });
  const write = (file, url) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  if (mode === 'preview') {
    const dir = path.join(WEB, process.env.PREVIEW || 'preview'); fs.mkdirSync(dir, { recursive: true });
    for (const t of args.map(Number)) { const t0 = Date.now(); write(path.join(dir, `t${t.toFixed(2)}.jpg`), await page.evaluate(t => window.renderFrame(t), t)); console.log('t', t, Date.now() - t0, 'ms'); }
  } else {
    fs.mkdirSync(FRAMES, { recursive: true });
    const a = parseInt(args[0]), b = parseInt(args[1]); const t0 = Date.now();
    for (let i = a; i < b; i++) {
      write(path.join(FRAMES, `f${String(i).padStart(4, '0')}.jpg`), await page.evaluate(t => window.renderFrame(t), i / FPS));
      if ((i - a) % 50 === 0) console.log(`frame ${i} (${((Date.now() - t0) / (i - a + 1)).toFixed(0)} ms/f)`);
    }
  }
  await browser.close(); srv.close();
})();
