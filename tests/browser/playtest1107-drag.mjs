/* Playtest round 2 #1: drag and drop with Pointer Events (mouse and touch): bag item -> quick slot, camp roster -> team, camp moves -> carried list. Clicking keeps working.
   TRIAL_URL=<server> node tests/browser/playtest1107-drag.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {initialProfile} from '../../src/core/base.ts';
import {SPECIES} from '../../src/core/roster.ts';
import {openCampRoster} from './camp-ui.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const centre=async loc=>{const r=await loc.first().boundingBox();assert.ok(r,'element is visible');return {x:r.x+r.width/2,y:r.y+r.height/2};};
async function mouseDrag(p,from,to,whileDragging){
 const a=await centre(from);await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(a.x+14,a.y+10,{steps:3});
 const c=await centre(to);await p.mouse.move(c.x,c.y,{steps:8});
 if(whileDragging)await whileDragging();
 await p.mouse.up();await p.waitForTimeout(250);
}
async function touchDrag(p,cdp,from,to){
 const a=await centre(from),c=await centre(to),send=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
 await send('touchStart',a.x,a.y);for(let i=1;i<=10;i++){await send('touchMove',a.x+(c.x-a.x)*i/10,a.y+(c.y-a.y)*i/10);await p.waitForTimeout(16);}
 await send('touchEnd',c.x,c.y);await p.waitForTimeout(300);
}
async function openRun(touch){
 const ctx=await b.newContext({viewport:{width:1280,height:720},hasTouch:!!touch,isMobile:false});
 await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
 await p.evaluate(()=>{const s=window.trial.store.world;Object.assign(s.prog.items,{berry:3,tonic:2,bigBerry:1,pechaBerry:1,reviverSeed:1});window.dispatchEvent(new Event('blur'));});
 await p.locator('#bag-open').click();await p.waitForSelector('.c195-bag');
 return {ctx,p};
}
const slotItems=p=>p.evaluate(()=>[...document.querySelectorAll('.c195-slot')].map(el=>el.getAttribute('aria-label')));
// ---- bag, mouse
{
 const {ctx,p}=await openRun(false);
 await mouseDrag(p,p.locator('[data-bag-item="berry"]'),p.locator('[data-bag-slot="3"]'),async()=>{
  assert.ok(await p.locator('.drag-ghost').count()===1,'a ghost image follows the pointer');assert.ok(await p.locator('.c195-slot.drop-ok').count()===6,'every quick slot is highlighted as a drop target');
  assert.equal(await p.locator('.c195-slot[data-bag-slot="3"].drop-hover').count(),1,'the slot under the pointer is highlighted differently');
  assert.equal(await p.locator('[data-bag-item="berry"].is-dragging').count(),1);await p.screenshot({path:out+'drag-bag.png'});});
 assert.equal(await p.locator('.drag-ghost').count(),0,'the ghost is gone after the drop');assert.match((await slotItems(p))[3],/橙橙果/,'dropped on slot 4 pins the item');
 assert.equal(await p.locator('.c195-slot.drop-ok').count(),0);
 // a drag to the bottom bar slot (under the dimmed scrim) also pins; and the reviver seed cannot be picked up
 await mouseDrag(p,p.locator('[data-bag-item="tonic"]'),p.locator('[data-hud-quick="5"]'));
 assert.match((await slotItems(p))[5],/PP多项小补剂/,'dropping on the bottom quick bar pins too');
 await mouseDrag(p,p.locator('[data-bag-item="reviverSeed"]'),p.locator('[data-bag-slot="0"]'));assert.match((await slotItems(p))[0],/空/,'the Reviver Seed cannot be dragged to a quick slot');
 // move between slots (swap), then drag off onto the grid to unpin
 await mouseDrag(p,p.locator('.c195-slot[data-bag-slot="3"]'),p.locator('.c195-slot[data-bag-slot="1"]'));
 const moved=await slotItems(p);assert.match(moved[1],/橙橙果/);assert.match(moved[3],/空/);
 await mouseDrag(p,p.locator('.c195-slot[data-bag-slot="1"]'),p.locator('.c195-bag-grid'));assert.match((await slotItems(p))[1],/空/,'dragging a pinned item onto the grid unpins it');
 // click still works
 await p.locator('[data-bag-slot="2"]').click();await p.locator('[data-bag-item="bigBerry"]').click();await p.locator('#bag-pin').click();assert.match((await slotItems(p))[2],/大树果/,'the click path still pins');
 assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- bag, touch
{
 const {ctx,p}=await openRun(true);const cdp=await ctx.newCDPSession(p);
 await touchDrag(p,cdp,p.locator('[data-bag-item="berry"]'),p.locator('[data-bag-slot="4"]'));
 assert.match((await slotItems(p))[4],/橙橙果/,'a finger drag pins the item');
 assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- camp
{
 const ctx=await b.newContext({viewport:{width:1280,height:900},hasTouch:true});
 await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=4243');await p.locator('#start').waitFor();
 const profile=initialProfile();profile.roster.push({id:'P4',species:'mudkip',learned:SPECIES.mudkip.kit.map(k=>({...k})),carry:SPECIES.mudkip.kit.map(k=>k.move),protected:false,tactic:'together'});profile.next=5;
 const ok=await p.evaluate(pr=>window.trial.store.beginNewGame(pr,true),profile);assert.equal(ok,true);await p.reload();await p.waitForFunction(()=>window.trial?.store.status==='ready');
 await openCampRoster(p,'P3');
 const team=()=>p.evaluate(()=>window.trial.store.profile.team);
 assert.deepEqual(await team(),['P1','P2','P3']);
 // roster card onto an occupied team slot replaces that member; the displaced one returns to camp
 await mouseDrag(p,p.locator('.camp194-roster-select[data-camp-member="P4"]'),p.locator('#camp-party-slot-P2'));
 assert.deepEqual(await team(),['P1','P4','P3'],'dragging a roster card onto a team slot replaces that member');
 // a team slot onto another: reorder
 await mouseDrag(p,p.locator('#camp-party-slot-P1'),p.locator('#camp-party-slot-P3'));
 assert.deepEqual(await team(),['P3','P4','P1'],'dragging between team slots swaps them');
 // a team slot onto the roster: back to camp
 await mouseDrag(p,p.locator('#camp-party-slot-P4'),p.locator('#camp-party-roster'));
 assert.deepEqual(await team(),['P3','P1'],'dragging a team slot onto the roster sends it to camp');
 // touch: roster card back into the (now empty) third slot
 const cdp=await ctx.newCDPSession(p);
 await touchDrag(p,cdp,p.locator('.camp194-roster-select[data-camp-member="P4"]'),p.locator('.camp194-team-slot.is-empty'));
 assert.deepEqual(await team(),['P3','P1','P4'],'a finger drag fills an empty team slot');
 await p.screenshot({path:out+'drag-camp-team.png'});
 // moves: carried -> learned list removes; learned -> carried adds; carried -> carried reorders
 await p.locator('[data-camp-member="P3"]').first().click();
 const carry=()=>p.evaluate(()=>window.trial.store.profile.roster.find(i=>i.id==='P3').carry);
 const start=await carry();assert.equal(start.length,2);
 await mouseDrag(p,p.locator('#camp-party-carry .camp194-move-tile').first(),p.locator('#camp-party-learned'));
 assert.deepEqual(await carry(),[start[1]],'dragging a carried move onto the learned list takes it off');
 await mouseDrag(p,p.locator('#camp-party-learned .camp194-move-tile').first(),p.locator('#camp-party-carry'));
 assert.deepEqual((await carry()).sort(),[...start].sort(),'dragging a learned move onto the carried list adds it');
 const before=await carry();await mouseDrag(p,p.locator('#camp-party-carry .camp194-move-tile').nth(1),p.locator('#camp-party-carry .camp194-move-tile').first());
 assert.deepEqual(await carry(),[before[1],before[0]],'dragging between carried moves reorders them');
 await p.screenshot({path:out+'drag-camp-moves.png'});
 // click still toggles
 await p.locator('#camp-party-carry .camp194-move-tile').first().click();await p.waitForTimeout(250);assert.equal((await carry()).length,1,'click still removes a carried move');
 assert.deepEqual(errs,[]);await ctx.close();
}
await b.close();console.log('drag checks passed');
