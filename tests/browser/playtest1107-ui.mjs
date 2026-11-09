/* Playtest 1107 browser check (stand-alone: TRIAL_URL=<dev server> node tests/browser/playtest1107-ui.mjs). Dev scenario state is edited through window.trial.store.world. */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
async function open(w,h,anim){
 const ctx=await b.newContext({viewport:{width:w,height:h}});
 await ctx.addInitScript(a=>{window.__trialNoAutoSleep=true;if(!a)window.__trialNoAnim=true;},anim);
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7');
 await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());
 await p.evaluate(()=>{const s=window.trial.store.world;const e=s.units.w1a;const k=(x,y)=>x+','+y;
  const cells=[];for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if(s.floor.some(f=>f.x===x&&f.y===y)){cells.push({x,y});if(!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}}
  const free=cells.filter(c=>!Object.values(s.units).some(u=>u.pos&&u.pos.x===c.x&&u.pos.y===c.y)&&Math.max(Math.abs(c.x-e.pos.x),Math.abs(c.y-e.pos.y))===2);
  s.units[s.leader].pos=free[0];
  for(let i=0;i<s.log.length;i++);window.dispatchEvent(new Event('blur'));window.trial.repaint(s);});
 await p.waitForTimeout(600);return {ctx,p};
}
const rect=(p,sel)=>p.locator(sel).first().evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom,r:r.right};});
const sleepInfo=p=>p.evaluate(()=>{const v=window.trial.view();return {w1a:{m:v.units.w1a?.sleepMarks,paused:v.units.w1a?.spritePaused},w1b:v.units.w1b&&{m:v.units.w1b.sleepMarks,paused:v.units.w1b.spritePaused}};});
const hoverEnemy=async(p,id)=>{const pt=await p.evaluate(id=>{const v=window.trial.view().units[id],c=window.trial.camera();const r=document.querySelector('#board canvas').getBoundingClientRect();return {x:r.x+v.x-c.x,y:r.y+v.y-c.y-20};},id);await p.mouse.move(pt.x,pt.y);await p.waitForTimeout(200);await p.mouse.move(pt.x+1,pt.y);await p.waitForTimeout(200);return pt;};

for(const [w,h] of [[1280,720],[900,520]]){
 const {ctx,p}=await open(w,h,false);
 console.log(w,h,'sleep (no anim)',JSON.stringify(await sleepInfo(p)));
 const pt=await hoverEnemy(p,'w1a');
 await p.waitForSelector('#enemy-info');
 console.log('status line:',await p.locator('#enemy-status').innerText());
 const card=await rect(p,'#inspect .inspect-card'),ev=await rect(p,'#recent-events'),party=await rect(p,'#party');
 console.log(w,h,'card',JSON.stringify(card),'events',JSON.stringify(ev),'party.bottom',party.b,'card.bottom<events.y',card.b<=ev.y);
 assert.ok(card.b<=ev.y+0.5,'card covers log');
 const rows=await p.locator('.enemy-move-list li').evaluateAll(l=>l.map(e=>e.getBoundingClientRect().height));console.log('move row heights',rows);
 await p.screenshot({path:out+`inspect-sleep-${w}x${h}.png`});
 await p.locator('#inspect-close').click();assert.equal(await p.locator('#enemy-info').count(),0);
 await hoverEnemy(p,'w1a');assert.equal(await p.locator('#enemy-info').count(),1);await p.keyboard.press('Escape');assert.equal(await p.locator('#enemy-info').count(),0);
 // log
 await p.locator('#log-open').click();assert.ok(await p.locator('#log-dialog[open]').count());
 const sc=await p.locator('#log-list').evaluate(e=>({top:e.scrollTop,h:e.scrollHeight,c:e.clientHeight,n:e.children.length}));console.log('log',sc);
 await p.screenshot({path:out+`log-window-${w}x${h}.png`});
 const pos0=await p.evaluate(()=>JSON.stringify(window.trial.getState().units[window.trial.getState().leader].pos));
 await p.keyboard.press('d');await p.waitForTimeout(300);assert.equal(await p.evaluate(()=>JSON.stringify(window.trial.getState().units[window.trial.getState().leader].pos)),pos0,'no movement while log open');
 await p.keyboard.press('Escape');assert.equal(await p.locator('#log-dialog[open]').count(),0);
 await p.keyboard.press('l');assert.equal(await p.locator('#log-dialog[open]').count(),1);{await p.evaluate(()=>{const s=window.trial.store.world;for(let i=0;i<70;i++)(s.log.push('测试记录第'+i+'行'),(s.entries??=[]).push({n:(s.logSeq=(s.logSeq??0)+1),parts:['测试记录第'+i+'行']}));window.dispatchEvent(new Event('blur'));});await p.keyboard.press('Escape');await p.keyboard.press('l');await p.waitForSelector('#log-dialog[open]');const m=await p.evaluate(()=>{const d=document.getElementById('log-dialog').getBoundingClientRect(),c=document.getElementById('log-close').getBoundingClientRect(),h=document.querySelector('#log-dialog h2').getBoundingClientRect();return {top:c.top-d.top,right:d.right-c.right,dy:Math.abs((c.top+c.height/2)-(h.top+h.height/2))};});assert.ok(m.top>=8&&m.right>=8,'the close box keeps 8px from the window border: '+JSON.stringify(m));assert.ok(m.dy<=1,'and stays level with the title: '+JSON.stringify(m));}await p.locator('#log-close').click();assert.equal(await p.locator('#log-dialog[open]').count(),0);
 // PR 214: an open log window must not let the sleep auto-advance take a round
 await p.evaluate(()=>{window.trial.autoSleep(true);});
 await p.evaluate(()=>{const s=window.trial.store.world;s.units[s.leader].status={slp:{left:9}};window.dispatchEvent(new Event('blur'));});
 await p.locator('#log-open').click();const sleepRound=await p.evaluate(()=>window.trial.getState().round);await p.waitForTimeout(1500);
 assert.equal(await p.evaluate(()=>window.trial.getState().round),sleepRound,'no automatic wait while the log window is open');
 await p.keyboard.press('Escape');await p.waitForTimeout(1500);
 assert.ok(await p.evaluate(()=>window.trial.getState().round)>sleepRound,'after closing it, the sleeper advances again');
 await p.evaluate(()=>{window.trial.autoSleep(false);const s=window.trial.store.world;delete s.units[s.leader].status;window.dispatchEvent(new Event('blur'));});
 // blessing
 await p.evaluate(()=>{const s=window.trial.store.world;s.phase='blessing';s.pendingChoices=[{type:'blessing',source:'room',room:null,options:['berryBoost','floorHeal','battleSpirit']}];window.dispatchEvent(new Event('blur'));});
 await p.waitForTimeout(300);
 const cards=await p.locator('#blessing-choice .choice-card').evaluateAll(l=>l.map(e=>{const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];}));
 console.log(w,h,'blessing cards',JSON.stringify(cards),'skip',JSON.stringify(await rect(p,'#blessing-skip')));
 await p.screenshot({path:out+`blessing-${w}x${h}.png`});
 console.log('errs',p.errs);await ctx.close();
}
await b.close();
