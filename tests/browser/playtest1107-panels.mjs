/* Playtest 1107 browser check (stand-alone: TRIAL_URL=<dev server> node tests/browser/playtest1107-panels.mjs). Dev scenario state is edited through window.trial.store.world. */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
async function open(w,h,anim=false){
 const ctx=await b.newContext({viewport:{width:w,height:h}});
 await ctx.addInitScript(a=>{window.__trialNoAutoSleep=true;if(!a)window.__trialNoAnim=true;},anim);
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7'+(anim?'&anim=on':''));
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
 assert.ok(await p.locator('#learning-choice .c195-learner-types .paper-type').count()>=1,'the learner types are shown beside the portrait');
 assert.equal(await p.locator('#learning-choice .c195-same').count(),0,'the own-type mark is gone: the learner types and each move type are shown, nothing more');
 assert.doesNotMatch(await p.locator('#learning-choice').innerText(),/本系/);
 assert.equal(await p.evaluate(()=>document.activeElement?.className.includes('c195-move')),true,'the window opens with the focus on its first card (the main button is still disabled)');
 {const boxes=await p.locator('.c195-old .c195-move').evaluateAll(n=>n.map(el=>{const r=el.getBoundingClientRect();return {y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),r:r.right,b:r.bottom};}));
  assert.equal(boxes.length,4);assert.ok(boxes.every(r=>Math.abs(r.w-boxes[0].w)<=1&&r.r<=w+1&&r.b<=h+1),'the four replacement cards share one width and stay on screen');
  for(const y of new Set(boxes.map(r=>r.y)))assert.equal(new Set(boxes.filter(r=>r.y===y).map(r=>r.h)).size,1,'cards in one row have equal height');}
 await p.keyboard.press('2');assert.equal(await p.locator('#learn-replace-quickattack[aria-pressed=true]').count(),1);assert.equal(await p.locator('#learn-confirm').isDisabled(),false);
 assert.match(await p.locator('#learn-confirm').innerText(),/忘掉.*学会/);
 await p.locator('#learn-confirm').focus();
 await p.screenshot({path:out+`learning-${w}x${h}.png`});
 await p.keyboard.press('Enter');await p.waitForTimeout(400);
 {const r=await p.evaluate(()=>{const s=window.trial.getState();return {phase:s.phase,learned:s.units[s.leader].learned};});
  assert.equal(r.phase,'playing');assert.deepEqual(r.learned,['tackle','flamethrower','ember','absorb'],'Enter on the confirm button forgot Quick Attack and learned Flamethrower');}
 await ctx.close();
 // bag
 ({ctx,p}=await open(w,h));
 await p.evaluate(()=>{const s=window.trial.store.world;Object.assign(s.prog.items,{berry:3,tonic:2,chestoBerry:1,healSeed:1,bigBerry:1});s.tms=[{move:'tackle',fate:'held'}];window.dispatchEvent(new Event('blur'));});
 await p.locator('#bag-open').click();await p.waitForSelector('.c195-bag');
 assert.equal(await p.evaluate(()=>document.activeElement?.className.includes('c195-bag-item')),true,'the bag opens with the focus on the first item');
 await fit(p,'.c195-bag','bag');
 // Enter on a bag item keeps the focus on that same item after the window redraws (stable ids); tabs and slots have ids too
 await p.locator('#bag-item-tonic').focus();await p.keyboard.press('Enter');
 assert.equal(await p.evaluate(()=>document.activeElement?.id),'bag-item-tonic','focus stays on the item after Enter');assert.equal(await p.locator('#bag-item-tonic.is-selected').count(),1);
 await p.locator('#bag-item-berry').focus();await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>document.activeElement?.id),'bag-item-berry');
 assert.ok(await p.locator('#bag-category-all').count()===1&&await p.locator('#bag-slot-0').count()===1);
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
  if(full){assert.equal(await p.locator('#accept').isDisabled(),true);assert.equal(await p.evaluate(()=>document.activeElement?.id),'out-0','full team: focus starts on the first member card');
   await p.keyboard.press('2');assert.equal(await p.locator('#out-1[aria-pressed=true]').count(),1,'the number key picks the member');assert.equal(await p.evaluate(()=>document.activeElement?.id),'accept','after the number key the focus moves to the accept button, so Enter confirms');
   assert.match(await p.locator('#accept').innerText(),/回营.*上场/);await fit(p,'#invitation-choice','invite-full-selected');}
  else assert.equal(await p.evaluate(()=>document.activeElement?.id),'accept','team not full: focus starts on the accept button');
  await p.screenshot({path:out+`invite-${full?'full':'notfull'}-${w}x${h}.png`});
  if(full){const out1=await p.evaluate(()=>window.trial.getState().queue[1]);await p.keyboard.press('Enter');await p.waitForTimeout(400);
   const r=await p.evaluate(()=>{const s=window.trial.getState();return {phase:s.phase,queue:s.queue};});
   assert.equal(r.phase,'playing');assert.ok(!r.queue.includes(out1),'the chosen member went back to camp');assert.equal(r.queue.length,3);assert.ok(r.queue.some(id=>id.startsWith('N')),'the newcomer joined');}
  else{await p.locator('#accept').click();await p.waitForTimeout(400);const r=await p.evaluate(()=>window.trial.getState());assert.equal(r.phase,'playing');assert.equal(r.queue.length,3);}
  await ctx.close();
 }
}
// the default (animation on) path: the learning window gets the same focus once it shows
{
 const {ctx,p}=await open(1280,720,true);
 await p.evaluate(()=>{const s=window.trial.store.world;const u=s.units[s.leader];u.learned=['tackle','quickattack','ember','absorb'];u.pp={tackle:20,quickattack:15,ember:10,absorb:12};u.maxPp={...u.pp};s.phase='learning';s.pendingLearnMoves=[{actor:s.leader,move:'flamethrower',pp:8}];window.dispatchEvent(new Event('blur'));});
 await p.waitForSelector('#learning-choice',{state:'visible'});await p.waitForTimeout(300);
 assert.equal(await p.evaluate(()=>document.activeElement?.className.includes('c195-move')),true,'with animation on, the learning window also opens with the focus on its first card');
 assert.deepEqual(p.errs,[]);await ctx.close();
}
await b.close();console.log('done');
