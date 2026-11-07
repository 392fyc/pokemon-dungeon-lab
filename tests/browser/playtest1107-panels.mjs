/* Playtest 1107 browser check (stand-alone: TRIAL_URL=<dev server> node tests/browser/playtest1107-panels.mjs). Dev scenario state is edited through window.trial.store.world. */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
async function open(w,h,notFull){
 const ctx=await b.newContext({viewport:{width:w,height:h}});
 await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7');
 await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
 return {ctx,p};
}
const fit=async(p,sel,name)=>{const r=await p.locator(sel).first().evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,r:r.right,b:r.bottom,sh:el.scrollHeight,ch:el.clientHeight,sw:el.scrollWidth,cw:el.clientWidth,vw:innerWidth,vh:innerHeight};});console.log(name,JSON.stringify(r));
 assert.ok(r.x>=0&&r.y>=0&&r.r<=r.vw+0.5&&r.b<=r.vh+0.5,name+' inside viewport');assert.ok(r.sh<=r.ch+1&&r.sw<=r.cw+1,name+' no inner overflow');};
for(const [w,h] of [[1280,720],[900,520]]){
 // learning
 let {ctx,p}=await open(w,h);
 await p.evaluate(()=>{const s=window.trial.store.world;const u=s.units[s.leader];u.learned=['tackle','quickattack','ember','absorb'];u.pp={tackle:20,quickattack:15,ember:10,absorb:12};u.maxPp={...u.pp};s.phase='learning';s.pendingLearnMoves=[{actor:s.leader,move:'flamethrower',pp:8}];window.dispatchEvent(new Event('blur'));});
 await p.waitForSelector('#learning-choice');await p.waitForTimeout(200);
 await fit(p,'#learning-choice','learning');
 assert.equal(await p.locator('#learn-confirm').isDisabled(),true);
 await p.keyboard.press('2');assert.equal(await p.locator('#learn-replace-quickattack[aria-pressed=true]').count(),1);assert.equal(await p.locator('#learn-confirm').isDisabled(),false);
 console.log('confirm text:',await p.locator('#learn-confirm').innerText());
 await p.screenshot({path:out+`learning-${w}x${h}.png`});
 await p.keyboard.press('Enter');await p.waitForTimeout(400);
 console.log('after enter learned',await p.evaluate(()=>{const s=window.trial.getState();return JSON.stringify([s.phase,s.units[s.leader].learned])}));
 await ctx.close();
 // bag
 ({ctx,p}=await open(w,h));
 await p.evaluate(()=>{const s=window.trial.store.world;Object.assign(s.prog.items,{berry:3,tonic:2,chestoBerry:1,healSeed:1,bigBerry:1});s.tms=[{move:'tackle',fate:'held'}];window.dispatchEvent(new Event('blur'));});
 await p.locator('#bag-open').click();await p.waitForSelector('.c195-bag');
 await fit(p,'.c195-bag','bag');
 console.log('detail:',(await p.locator('.c195-bag-detail').innerText()).replace(/\n/g,' | '));
 await p.locator('[data-bag-item="tonic"]').click();assert.equal(await p.evaluate(()=>window.trial.getState().prog.items.tonic),2);
 assert.deepEqual(await p.evaluate(()=>[...document.querySelectorAll('.c195-bag-quick-grid button.is-empty')].length),[6].length&&6,'click does not pin');
 await p.locator('[data-bag-slot="2"]').click();await p.locator('#bag-pin').click();
 console.log('slot2 label:',await p.locator('[data-bag-slot="2"]').getAttribute('aria-label'));
 await p.screenshot({path:out+`bag-${w}x${h}.png`});
 await p.locator('#bag-unpin').click();console.log('empty slots after unpin',await p.locator('.c195-bag-quick-grid button.is-empty').count());
 await ctx.close();
 // invitation full and not full
 for(const full of [true,false]){
  ({ctx,p}=await open(w,h));
  await p.evaluate(full=>{const s=window.trial.store.world;const e=s.units.w1a;const k=(x,y)=>x+','+y;
   const adj=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if((dx||dy)&&s.floor.some(f=>f.x===x&&f.y===y)&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===x&&u.pos.y===y))adj.push({x,y});}
   for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if(s.floor.some(f=>f.x===x&&f.y===y)&&!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}
   s.units[s.leader].pos=adj[0];e.hp=1;e.asleep=false;
   if(!full){const drop=s.queue.find(id=>id!==s.leader);s.queue=s.queue.filter(id=>id!==drop);s.camp.push(drop);s.units[drop].pos=null;}
   let found=null;for(let r=1;r<400&&found===null;r++){const t=structuredClone(s);t.prog.rng=r;const res=window.trial.applyCommand(t,{type:'round',action:{type:'basic',target:'w1a'}});if(res.ok&&res.state.phase==='invitation')found=r;}
   s.prog.rng=found;window.dispatchEvent(new Event('blur'));window.trial.repaint(s);},full);
  await p.waitForTimeout(400);
  const pt=await p.evaluate(()=>{const v=window.trial.view().units.w1a,c=window.trial.camera();return {x:v.x-c.x,y:v.y-c.y-20};});
  await p.mouse.move(pt.x,pt.y);await p.waitForTimeout(150);await p.mouse.move(pt.x+1,pt.y);await p.waitForTimeout(150);await p.mouse.click(pt.x+1,pt.y);
  await p.waitForSelector('#invitation-choice');await p.waitForTimeout(300);
  await fit(p,'#invitation-choice','invite-'+(full?'full':'notfull'));
  console.log('buttons:',await p.locator('.c195-foot button').allInnerTexts());
  if(full){assert.equal(await p.locator('#accept').isDisabled(),true);await p.locator('#out-1').click();console.log('accept text:',await p.locator('#accept').innerText());await fit(p,'#invitation-choice','invite-full-selected');}
  await p.screenshot({path:out+`invite-${full?'full':'notfull'}-${w}x${h}.png`});
  if(full){await p.locator('#accept').click();await p.waitForTimeout(400);console.log('after accept',await p.evaluate(()=>{const s=window.trial.getState();return JSON.stringify([s.phase,s.queue])}));}
  await ctx.close();
 }
}
await b.close();console.log('done');
