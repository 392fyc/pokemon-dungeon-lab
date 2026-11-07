/* Playtest 1107 browser check (stand-alone: TRIAL_URL=<dev server> node tests/browser/playtest1107-hold.mjs). Dev scenario state is edited through window.trial.store.world. */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
async function open(anim,skipKey){
 const ctx=await b.newContext({viewport:{width:1280,height:720}});
 await ctx.addInitScript(a=>{window.__trialNoAutoSleep=true;if(!a)window.__trialNoAnim=true;},anim);
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7'+(anim?'&anim=on':''));
 await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
 const info=await p.evaluate(()=>{const s=window.trial.store.world;const e=s.units.w1a;const k=(x,y)=>x+','+y;
  const adj=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if((dx||dy)&&s.floor.some(f=>f.x===x&&f.y===y)&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===x&&u.pos.y===y))adj.push({x,y});}
  for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if(s.floor.some(f=>f.x===x&&f.y===y)&&!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}
  s.units[s.leader].pos=adj[0];e.hp=1;e.asleep=false;
  let found=null;for(let r=1;r<400&&found===null;r++){const t=structuredClone(s);t.prog.rng=r;const res=window.trial.applyCommand(t,{type:'round',action:{type:'basic',target:'w1a'}});if(res.ok&&res.state.phase==='invitation')found=r;}
  if(found!==null)s.prog.rng=found;window.dispatchEvent(new Event('blur'));window.trial.repaint(s);return {found};});
 await p.waitForTimeout(500);return {ctx,p,info};
}
const clickEnemy=async p=>{const pt=await p.evaluate(()=>{const v=window.trial.view().units.w1a,c=window.trial.camera();return {x:v.x-c.x,y:v.y-c.y-20};});await p.mouse.move(pt.x,pt.y);await p.waitForTimeout(150);await p.mouse.move(pt.x+1,pt.y);await p.waitForTimeout(150);await p.mouse.click(pt.x+1,pt.y);};
const results={};
for(const mode of ['wait','held-key','skip-key','skip-click','noanim']){
 const {ctx,p,info}=await open(mode!=='noanim');console.log(mode,'invite rng',info);
 if(mode==='held-key')await p.keyboard.down('x');   // a key already held when the enemy falls keeps auto-repeating
 const t0=Date.now();await clickEnemy(p);
 let seenBanner=false,flowAt=null,bannerGoneAt=null,shot=false;
 for(let i=0;i<60;i++){
  const st=await p.evaluate(()=>({b:!document.getElementById('result-banner').hidden,t:document.getElementById('result-banner').textContent,f:!document.getElementById('flow').hidden&&/想加入/.test(document.getElementById('flow').innerText),ph:window.trial.getState().phase,an:window.trial.animating()}));
  if(st.b){seenBanner=st.t;if(!shot){shot=true;await p.screenshot({path:out+'banner.png'});if(mode==='held-key'){for(let r=0;r<4;r++){await p.keyboard.down('x');await p.waitForTimeout(120);}assert.equal(await p.evaluate(()=>!document.getElementById('result-banner').hidden),true,'key auto-repeat must not skip the pause');await p.keyboard.up('x');}
   if(mode==='skip-key')await p.keyboard.press('x');if(mode==='skip-click')await p.mouse.click(300,300);}}
  if(st.b&&st.f)throw Error('panel visible together with banner');
  if(!st.b&&seenBanner&&bannerGoneAt===null)bannerGoneAt=Date.now()-t0;
  if(st.f&&flowAt===null){flowAt=Date.now()-t0;break;}
  await p.waitForTimeout(100);
 }
 if(mode==='wait')assert.match(await p.evaluate(()=>document.activeElement?.id??''),/^(accept|out-0)$/,'the invitation window takes the focus once the pause ends');
 console.log(mode,{seenBanner,bannerGoneAt,flowAt,errs:p.errs});assert.deepEqual(p.errs,[]);results[mode]={seenBanner,flowAt};await ctx.close();
}
assert.ok(results.wait.seenBanner&&results.wait.flowAt>=1200,'the banner holds the panel back for the full pause');
assert.ok(results['skip-key'].flowAt<results.wait.flowAt-500&&results['skip-click'].flowAt<results.wait.flowAt-500,'any key or click skips the pause');
assert.ok(results['held-key'].flowAt>=1200,'a held key does not cut the pause short: '+results['held-key'].flowAt);
assert.equal(results.noanim.seenBanner,false,'with animation off there is no pause and no banner');
await b.close();console.log('hold checks passed');
