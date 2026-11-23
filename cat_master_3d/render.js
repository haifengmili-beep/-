const {chromium}=require('playwright');const {spawn}=require('child_process');const path=require('path');
(async()=>{
 const mode=process.argv[2]||'stills';
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const p=await b.newPage({viewport:{width:540,height:960},deviceScaleFactor:mode==='video'?2:1});
 p.on('console',m=>console.log('PAGE',m.text()));p.on('pageerror',e=>console.log('ERR',e.message));
 await p.goto('file://'+path.resolve('index.html'));await p.waitForFunction('window.ready');
 if(mode==='stills'){const ts=(process.argv[3]||'1,3.5,6,8,12,14,17,19,21.5,22.6,24.5,26,29').split(',').map(Number);
   for(const t of ts){await p.evaluate(t=>renderAt(t),t);await p.screenshot({path:`../stills/s_${t}.png`});}
 } else {
   const ff=spawn('ffmpeg',['-y','-loglevel','error','-f','image2pipe','-framerate','30','-i','-','-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-preset','medium','../video_noaudio.mp4'],{stdio:['pipe','inherit','inherit']});
   const N=900;const t0=Date.now();
   for(let i=0;i<N;i++){await p.evaluate(t=>renderAt(t),i/30);const buf=await p.screenshot({type:'jpeg',quality:93});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));if(i%60==0)console.log('frame',i,((Date.now()-t0)/1000).toFixed(0)+'s');}
   ff.stdin.end();await new Promise(r=>ff.on('close',r));
 }
 await b.close();
})();
