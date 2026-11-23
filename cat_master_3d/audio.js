const fs=require('fs');const SR=44100,DUR=30,N=SR*DUR;const out=new Float32Array(N);
const f=m=>440*Math.pow(2,(m-69)/12);
let seed=1;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647*2-1;};
function pluck(t0,midi,dur,vol){const fr=f(midi),p=Math.round(SR/fr);const buf=new Float32Array(p).map(()=>rnd());let i0=Math.floor(t0*SR),n=Math.floor(dur*SR),idx=0;
  for(let i=0;i<n&&i0+i<N;i++){const a=buf[idx],b=buf[(idx+1)%p];const v=(a+b)*0.5*0.996;buf[idx]=v;idx=(idx+1)%p;out[i0+i]+=a*vol*(i<60?i/60:1);}}
function tone(t0,midi,dur,vol,harm=[1,0.5,0.25],dec=3){const fr=f(midi);let i0=Math.floor(t0*SR),n=Math.floor(dur*SR);
  for(let i=0;i<n&&i0+i<N;i++){const t=i/SR;let v=0;harm.forEach((h,k)=>v+=h*Math.sin(2*Math.PI*fr*(k+1)*t));const env=Math.min(1,t/0.01)*Math.exp(-t*dec)*(i>n-800?(n-i)/800:1);out[i0+i]+=v*env*vol;}}
function noise(t0,dur,vol,dec=40){let i0=Math.floor(t0*SR),n=Math.floor(dur*SR),lp=0;for(let i=0;i<n&&i0+i<N;i++){lp=lp*0.3+rnd()*0.7;out[i0+i]+=(rnd()-lp)*vol*Math.exp(-i/SR*dec);}}
// chords C G Am F (2s each) for 0..25s
const prog=[[48,52,55],[43,47,50],[45,48,52],[41,45,48]];
const melody=[72,74,76,79, 79,77,76,74, 76,72,69,72, 74,72,69,67, 72,74,76,79, 81,79,76,74, 72,76,74,69, 72,72,0,0];
for(let b=0;b<50;b++){const t=b*0.5,ch=prog[Math.floor(t/2)%4];
  tone(t,ch[0]-12+(b%2?7:0),0.45,0.16,[1,0.3],5);
  pluck(t,ch[0]+12,0.25,0.18);pluck(t+0.25,ch[1]+12,0.25,0.14);
  const m=melody[b%32];if(m&&t<24.5)pluck(t,m,0.5,0.26);
  if(t<24.8){noise(t+0.25,0.05,0.05,80);if(b%2==0)tone(t,36,0.15,0.35,[1],25);}
}
// piano ending 25..30
const end=[[25,[53,57,60,65]],[26.5,[55,59,62,67]],[28,[48,52,55,60,64,72]]];
for(const [t,ns] of end)ns.forEach((m,i)=>tone(t+i*0.06,m,t>27?2.0:1.6,0.11,[1,0.45,0.2,0.1],t>27?1.4:1.8));
[[25.4,76],[25.9,77],[26.9,79],[27.4,77],[28.4,76]].forEach(([t,m])=>tone(t,m,1.2,0.12,[1,0.4,0.15],2.2));
// sfx
for(let k=0;k<6;k++)tone(3.0+k*0.07,96+(k%2)*3,0.25,0.07,[1,0.6],14);           // bell jingle (wake up)
for(let k=0;k<3;k++)tone(1.2+k*0.14,84-k*2,0.12,0.05,[1],20);                     // pat pat
{let i0=Math.floor(11.6*SR);for(let i=0;i<SR*0.6;i++){const t=i/SR;out[i0+i]+=rnd()*0.10*Math.sin(Math.PI*t/0.6)*(0.5+0.5*Math.sin(2*Math.PI*(6+t*20)*t));}} // frisbee whoosh
noise(13.75,0.08,0.25,50);noise(14.3,0.08,0.25,50);                                // camera shutter
for(let i=0;i<4;i++)tone(22.0+i*0.12,70-i*3,0.25,0.12,[1,0.8,0.6,0.4],6);          // shock sting
tone(22.25,45,0.6,0.2,[1,0.5],4);
// normalize + write wav
let pk=0;for(const v of out)pk=Math.max(pk,Math.abs(v));const g=0.85/pk;
for(let i=0;i<N;i++){const fadeOut=i>N-SR*1.2?(N-i)/(SR*1.2):1;out[i]*=g*fadeOut;}
const b=Buffer.alloc(44+N*2);b.write('RIFF',0);b.writeUInt32LE(36+N*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(SR,24);b.writeUInt32LE(SR*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(N*2,40);
for(let i=0;i<N;i++)b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,out[i]))*32767),44+i*2);
fs.writeFileSync('../bgm.wav',b);console.log('ok');
