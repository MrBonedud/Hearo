// Reference footage capture for the Hearo product film (see docs/hearo-product-film/README.md, "Re-capturing footage").
// Drives the running app at http://127.0.0.1:80/ with headless Chromium; makes REAL billed AI checks; writes to /tmp/hv/out.
// Pass 1: stills, clip1 (prepare), clip2 (correct explanation), clip5 (Arabic).
import { chromium } from '/home/runner/workspace/artifacts/listen-first/node_modules/@playwright/test/index.mjs';
import fs from 'node:fs';
const PDF='/home/runner/workspace/.local/backups/hearo-sync-20261010T134553Z-857c9bc/approved-stanford-source.pdf';
const OUT='/tmp/hv/out'; const note=(m)=>{console.log(m);fs.appendFileSync(OUT+'/capture-log.txt',m+'\n')};
const b=await chromium.launch({executablePath:'/repl/tools/bin/chromium'});
let evalFail=false;
async function ctx(locale){const c=await b.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1.5,locale});
  await c.addInitScript(()=>{const z=()=>{document.documentElement.style.zoom='1.2'};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',z):z();});
  const p=await c.newPage(); const cdp=await c.newCDPSession(p);
  p.on('response',async r=>{if(r.url().endsWith('/api/study/evaluate')){const h=r.headers();let j=null;try{j=await r.json()}catch{}
    if(r.status()!==200)evalFail=true;
    note(`EVALUATE ${r.status()} checker=${h['x-hearo-checker']} model=${h['x-hearo-model']} fallback=${h['x-hearo-fallback']} verdicts=${j?.assessments?JSON.stringify(j.assessments.map(a=>[a.conceptId,a.verdict,a.sourceLineIds])):'n/a'}`);
    fs.appendFileSync(OUT+'/evaluations.jsonl',JSON.stringify({status:r.status(),checker:h['x-hearo-checker'],model:h['x-hearo-model'],fallback:h['x-hearo-fallback'],body:j})+'\n');}});
  return {c,p,cdp};}
async function rec(env,name,fn,record){const {cdp,p}=env;const frames=[];
  const h=async({data,metadata,sessionId})=>{frames.push({data,t:metadata.timestamp});try{await cdp.send('Page.screencastFrameAck',{sessionId})}catch{}};
  const t0=Date.now();const marks=[];const mark=(m)=>marks.push([((Date.now()-t0)/1000).toFixed(1),m]);
  if(record){cdp.on('Page.screencastFrame',h);await cdp.send('Page.startScreencast',{format:'jpeg',quality:95,maxWidth:1920,maxHeight:1080});}
  evalFail=false; let ok=true;
  try{ await fn(p,mark); } catch(e){ ok=false; note(`STEP ${name} error: ${e.message.split('\n')[0]}`); }
  if(evalFail) ok=false;
  if(record){await p.waitForTimeout(300);await cdp.send('Page.stopScreencast');cdp.off('Page.screencastFrame',h);}
  if(!ok) return false;
  if(record){const dir=`${OUT}/${name}`;fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});let list='';
    frames.forEach((f,i)=>{const fn=`${dir}/f${String(i).padStart(5,'0')}.jpg`;fs.writeFileSync(fn,Buffer.from(f.data,'base64'));
      const d=i<frames.length-1?Math.max(0.001,frames[i+1].t-f.t):0.5;list+=`file '${fn}'\nduration ${d.toFixed(4)}\n`;});
    list+=`file '${dir}/f${String(frames.length-1).padStart(5,'0')}.jpg'\n`;fs.writeFileSync(`${dir}/list.txt`,list);
    note(`CLIP ${name}: ${frames.length} frames, ${(frames.at(-1).t-frames[0].t).toFixed(1)}s; marks ${JSON.stringify(marks)}`);}
  return true;}
const still=async(p,name)=>{await p.screenshot({path:`${OUT}/${name}.png`});note(`STILL ${name}.png`)};
const CHECKED=/Current explanation checked|تحققنا من شرحك الحالي/; const PAUSED=/paused after an error|وقّفنا التحقق بعد خطأ/;
async function waitChecked(p){await p.waitForFunction(([a,b])=>{const t=document.querySelector('[data-testid=status-live-check]')?.textContent||'';return new RegExp(a).test(t)||new RegExp(b).test(t)},[CHECKED.source,PAUSED.source],{timeout:60000});
  const t=await p.getByTestId('status-live-check').innerText(); if(PAUSED.test(t)) throw new Error('live check paused after error');}
const smooth=(p,sel,block='center')=>p.evaluate(([s,b])=>document.querySelector(s)?.scrollIntoView({behavior:'smooth',block:b}),[sel,block]);
const openDetails=(p,sel)=>p.evaluate(s=>{const d=document.querySelector(s+' details');if(d)d.open=true},sel);

const CORRECT='Scale out means adding more server instances, while scale up means moving to a bigger instance. When we have several instances, we need to distribute the work between them.';
const WRONG=' Caching also speeds up writes automatically, so writes never need to be sent to the DBMS.';
const AR='موزّع الحمل يوزّع طلبات HTTP على خوادم أمامية متعددة، ويبقي حزم اتصال TCP الواحد على الخادم نفسه. ويمكن التوقف عن استخدام خادم يتعطل.';

const EN=[
 ['home',async(p)=>{await p.goto('http://127.0.0.1:80/');await p.getByTestId('screen-landing').waitFor();await p.waitForTimeout(1500);await still(p,'01-home');},false],
 ['clip1-prepare',async(p,mark)=>{await p.waitForTimeout(1500);mark('home hero');
   await p.getByTestId('button-start-live').first().click();mark('clicked Start a live study');await p.waitForTimeout(2000);
   await p.getByTestId('input-file').setInputFiles(PDF);mark('approved PDF selected');await p.getByTestId('status-source-verified').waitFor();mark('source verified (SHA-256 match)');
   await smooth(p,'[data-testid=status-source-verified]');await p.waitForTimeout(2200);
   await p.getByTestId('button-prepare').click();mark('clicked Prepare');await p.getByTestId('input-transcript').waitFor();await p.waitForTimeout(2500);mark('session: concept map, nothing assessed');
   await still(p,'02-session-empty');},true],
 ['clip2-live-check-correct',async(p,mark)=>{await smooth(p,'[data-testid=input-transcript]');await p.waitForTimeout(1000);
   await p.getByTestId('input-transcript').click();mark('typing starts');await p.getByTestId('input-transcript').pressSequentially(CORRECT,{delay:38});mark('typing ends; pause triggers live check');
   await waitChecked(p);mark('live check returned');await p.waitForTimeout(1000);
   await smooth(p,'[data-testid=panel-study-map]','start');await p.waitForTimeout(2500);mark('map: Scale out vs scale up = Supported');await still(p,'03a-map-supported');
   await smooth(p,'[data-testid=assessment-scaling]');await p.waitForTimeout(1800);mark('feedback card');await openDetails(p,'[data-testid=assessment-scaling]');await p.waitForTimeout(600);
   await smooth(p,'[data-testid=assessment-scaling] details');await p.waitForTimeout(2500);mark('citations S04 shown');await still(p,'03b-supported-citations');},true],
 ['clip3-catch-wrong-claim',async(p,mark)=>{await smooth(p,'[data-testid=input-transcript]');await p.waitForTimeout(1000);
   await p.getByTestId('input-transcript').click();await p.keyboard.press('Control+End');mark('typing wrong claim starts');await p.getByTestId('input-transcript').pressSequentially(WRONG,{delay:38});mark('typing ends');
   await waitChecked(p);mark('live check returned');await p.waitForTimeout(1000);
   await smooth(p,'[data-testid=panel-study-map]','start');await p.waitForTimeout(2500);mark('map after wrong claim');await still(p,'04a-map-after-wrong');
   await smooth(p,'[data-testid=assessment-caching]');await p.waitForTimeout(3500);mark('caching card: source vs you');await still(p,'04b-contradiction-card');},true],
 ['clip4-report',async(p,mark)=>{await smooth(p,'[data-testid=button-finish]');await p.waitForTimeout(1200);
   await p.getByTestId('button-finish').click();mark('Finish & see report');await p.getByTestId('card-report-score').waitFor({timeout:60000});mark('report shown');await p.waitForTimeout(2500);
   await still(p,'05a-report-top');await p.evaluate(()=>window.scrollBy({top:650,behavior:'smooth'}));await p.waitForTimeout(2500);mark('report scrolled');await still(p,'05b-report-mid');
   await smooth(p,'[data-testid=button-download-report]');await p.waitForTimeout(2500);mark('download report button');await still(p,'05c-report-download');},true],
];
const AR_STEPS=[
 ['home-ar',async(q)=>{await q.goto('http://127.0.0.1:80/');await q.getByTestId('screen-landing').waitFor();await q.waitForTimeout(1500);await still(q,'06-home-ar');
   await q.getByTestId('button-start-live').first().click();await q.waitForTimeout(800);await q.getByTestId('input-file').setInputFiles(PDF);await q.getByTestId('status-source-verified').waitFor();
   await q.getByTestId('button-prepare').click();await q.getByTestId('input-transcript').waitFor();await q.waitForTimeout(1500);},false],
 ['clip5-arabic-check',async(q,mark)=>{await smooth(q,'[data-testid=input-transcript]');await q.waitForTimeout(1000);
   await q.getByTestId('input-transcript').click();mark('arabic typing starts');await q.getByTestId('input-transcript').pressSequentially(AR,{delay:38});mark('typing ends');
   await waitChecked(q);mark('live check returned');await q.waitForTimeout(1000);
   await smooth(q,'[data-testid=panel-study-map]','start');await q.waitForTimeout(2500);mark('map');await still(q,'07a-arabic-map');
   await smooth(q,'[data-testid=assessment-load-balancing]');await q.waitForTimeout(3000);mark('feedback card');await still(q,'07b-arabic-feedback');},true],
];
async function runFlow(locale,steps,label){
  for(let attempt=1;attempt<=4;attempt++){
    const env=await ctx(locale); let ok=true;
    for(const [name,fn,record] of steps){
      const done=fs.existsSync(`${OUT}/${name}/list.txt`);
      if(!await rec(env,name,fn,record&&!done)){ok=false;break;}
      if(name.startsWith('clip'))await env.p.waitForTimeout(3000); // server throttle gap
    }
    await env.c.close();
    if(ok){note(`${label} flow complete (attempt ${attempt})`);return;}
    note(`${label} flow attempt ${attempt} failed; retrying in 15s`);await new Promise(r=>setTimeout(r,15000));
  }
  note(`${label} flow FAILED after retries`);
}
await runFlow('en-US',EN,'EN'); await runFlow('ar-JO',AR_STEPS,'AR');
await b.close();
