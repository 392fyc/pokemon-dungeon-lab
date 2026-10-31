import {createRequire} from 'node:module';
import {writeFileSync, readdirSync, readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
if(!process.env.TRIAL_URL || !process.env.EA_PERF_OUTPUT)throw Error('Set TRIAL_URL and EA_PERF_OUTPUT.');
const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const samples=[];
try {
 for(let i=0;i<5;i++){
  const context=await browser.newContext();
  try {
   await context.addInitScript(()=>{
    new MutationObserver((_,observer)=>{
     if(document.querySelector('#title-new'))requestAnimationFrame(()=>requestAnimationFrame(()=>{
      window.titleReadyMs ??= performance.now();observer.disconnect();
     }));
    }).observe(document,{childList:true,subtree:true});
   });
   const page=await context.newPage();
   await page.goto(process.env.TRIAL_URL);
   await page.waitForFunction(()=>window.titleReadyMs);
   samples.push(await page.evaluate(()=>({titleReadyMs:window.titleReadyMs,js:performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.js')).map(r=>new URL(r.name).pathname)})));
  } finally {await context.close();}
 }
 const assets='.artifacts/trial/dist/assets/';
 const scripts=readdirSync(assets).filter(n=>n.endsWith('.js')).map(name=>{
  const bytes=readFileSync(assets+name);return {name,bytes:bytes.length,gzipBytes:gzipSync(bytes).length};
 });
 for(const sample of samples){
  sample.titleScriptBytes=[...new Set(sample.js)].reduce((sum,url)=>{
   const script=scripts.find(s=>s.name===url.split('/').at(-1));
   if(!script)throw Error('Requested script is missing from build inventory: '+url);
   return sum+script.bytes;
  },0);
 }
 const result={platform:process.platform,browser:await browser.version(),url:process.env.TRIAL_URL,samples,medianTitleReadyMs:samples.map(s=>s.titleReadyMs).sort((a,b)=>a-b)[2],scripts};
 writeFileSync(process.env.EA_PERF_OUTPUT,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {await browser.close();}
