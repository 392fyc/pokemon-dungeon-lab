/* Playtest round 2 #5: the record window opens during animations, and the lower-left log box scrolls back, opens the record on click, and keeps the whole run (up to 2000 lines).
   TRIAL_URL=<server> node tests/browser/playtest1107-log.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const ctx=await b.newContext({viewport:{width:1280,height:720}});
await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;});   // animations stay ON
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(base+'/?dev=1&seed=7&anim=on');
await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());
const animating=()=>p.evaluate(()=>window.trial.animating());
// 1. during a round's animation both the button and the L key open the record
await p.keyboard.press('Escape');
for(const how of ['button','key']){
 let opened=false;
 for(let attempt=0;attempt<6&&!opened;attempt++){
  await p.keyboard.press(attempt%2?'a':'d');   // a step plays a walking animation
  for(let i=0;i<10&&!(await animating());i++)await p.waitForTimeout(10);
  if(!(await animating()))continue;
  if(how==='button')await p.locator('#log-open').click();else await p.keyboard.press('l');
  opened=await p.locator('#log-dialog[open]').count()===1;
  await p.keyboard.press('Escape');await p.waitForTimeout(1500);
 }
 assert.ok(opened,'the record opens by '+how+' while an animation is playing');
}
// 2. the log box: wheel scrolls it, a click opens the record, a hint sits in its corner
await p.evaluate(()=>{const s=window.trial.store.world;for(let i=0;i<30;i++)(s.log.push('测试记录第'+i+'行'),(s.entries??=[]).push({n:(s.logSeq=(s.logSeq??0)+1),parts:['测试记录第'+i+'行']}));window.dispatchEvent(new Event('blur'));});
await p.waitForTimeout(400);
const box=p.locator('#recent-events');
assert.equal(await box.locator('.log-hint').count(),0,'no instruction sentence sits in the log box');
const before=await box.evaluate(el=>({top:el.scrollTop,max:el.scrollHeight-el.clientHeight}));assert.ok(before.max>0&&before.top>=before.max-2,'the box starts at the newest line');
const rect=await box.boundingBox();await p.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await p.mouse.wheel(0,-200);await p.waitForTimeout(200);
const after=await box.evaluate(el=>el.scrollTop);assert.ok(after<before.top,'the mouse wheel scrolls back through older lines');
await p.screenshot({path:out+'log-box.png'});
await box.click();assert.equal(await p.locator('#log-dialog[open]').count(),1,'a click on the box opens the full record');
const rows=await p.locator('#log-list li').count();assert.ok(rows>=30,'the record lists the lines: '+rows);
await p.keyboard.press('Escape');
// 3. the record keeps the whole run: more than the engine's 80 lines survive, and a floor change does not clear it
await p.evaluate(()=>{const s=window.trial.store.world;for(let i=0;i<150;i++){(s.log.push('长记录第'+i+'行'),(s.entries??=[]).push({n:(s.logSeq=(s.logSeq??0)+1),parts:['长记录第'+i+'行']}));}window.dispatchEvent(new Event('blur'));});
await p.waitForTimeout(300);
await p.evaluate(()=>{const s=window.trial.store.world;s.log=s.log.slice(-80);s.entries=s.entries.slice(-80);window.dispatchEvent(new Event('blur'));});   // the engine itself only keeps 80
await p.locator('#log-open').click();const total=await p.locator('#log-list li').count();
assert.ok(total>=180,'the interface keeps more than the engine\'s 80 lines: '+total);
assert.ok((await p.locator('#log-list').innerText()).includes('测试记录第0行'),'the oldest line is still there');
assert.deepEqual(errs,[]);await b.close();console.log('log checks passed');
