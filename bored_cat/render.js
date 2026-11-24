// 逐帧渲染 scene.html -> frames/%05d.jpg
// 用法: node render.js            全部帧
//       node render.js preview 3.5 9 20   只渲染指定秒数到 output/preview_*.png
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
const HERE = __dirname, FPS = 30, DUR = 38.0, N = Math.round(FPS * DUR);
const WORKERS = Number(process.env.WORKERS || 3);
const vo = JSON.parse(fs.readFileSync(path.join(HERE, "vo/lines.json"), "utf8"));
const threeJs = fs.readFileSync(path.join(HERE, "node_modules/three/build/three.min.js"));

async function openPage(browser) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.route("**/three.min.js", r => r.fulfill({ body: threeJs, contentType: "application/javascript" }));
  await page.addInitScript(v => { window.VO = v; }, vo);
  page.on("pageerror", e => console.error("PAGE ERROR", e.message));
  await page.goto("file://" + path.join(HERE, "scene.html"));
  await page.waitForFunction(() => window.READY === true);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
(async () => {
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  if (process.argv[2] === "preview") {
    const page = await openPage(browser);
    fs.mkdirSync(path.join(HERE, "output"), { recursive: true });
    for (const s of process.argv.slice(3)) {
      await page.evaluate(t => window.renderAt(t), Number(s));
      await page.screenshot({ path: path.join(HERE, "output", `preview_${Number(s).toFixed(1).padStart(4, "0")}.png`) });
    }
    await browser.close(); return;
  }
  const out = path.join(HERE, "frames"); fs.mkdirSync(out, { recursive: true });
  const t0 = Date.now();
  let done = 0;
  await Promise.all([...Array(WORKERS).keys()].map(async w => {
    const page = await openPage(browser);
    for (let i = w; i < N; i += WORKERS) {
      const f = path.join(out, String(i).padStart(5, "0") + ".jpg");
      if (fs.existsSync(f)) { done++; continue; }
      await page.evaluate(t => window.renderAt(t), i / FPS);
      await page.screenshot({ path: f, type: "jpeg", quality: 93 });
      if (++done % 60 === 0) console.log(`${done}/${N}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }));
  await browser.close();
  console.log("frames done", N);
})();
