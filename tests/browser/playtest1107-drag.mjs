/* Playtest round 2 #1: drag and drop with Pointer Events (mouse and touch): bag item -> quick slot, camp roster -> team, camp moves -> carried list. Clicking keeps working.
   TRIAL_URL=<server> node tests/browser/playtest1107-drag.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {initialProfile} from '../../src/core/base.ts';
import {SPECIES,learnableMove} from '../../src/core/roster.ts';
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
/** A finger drag starts after a ~250 ms press (a vertical swipe scrolls instead), so the helper holds first. */
async function touchDrag(p,cdp,from,to,hold=380){
 const a=await centre(from),c=await centre(to),send=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,id:1}]});
 await send('touchStart',a.x,a.y);await p.waitForTimeout(hold);for(let i=1;i<=10;i++){await send('touchMove',a.x+(c.x-a.x)*i/10,a.y+(c.y-a.y)*i/10);await p.waitForTimeout(16);}
 await send('touchEnd',c.x,c.y);await p.waitForTimeout(300);
}
async function openRun(touch,size={width:1280,height:720}){
 const ctx=await b.newContext({viewport:size,hasTouch:!!touch,isMobile:false});
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
 assert.match((await slotItems(p))[4],/橙橙果/,'a long press and drag with a finger pins the item');
 // a quick sideways-free vertical swipe must scroll the list, not start a drag
 await p.evaluate(()=>{const s=window.trial.store.world;Object.assign(s.prog.items,{pechaBerry:1,rawstBerry:1,cheriBerry:1,chestoBerry:1,healSeed:1,violentSeed:1,maxElixir:1,slumberOrb:1,totterOrb:1,luminousOrb:1,rollcallOrb:1,teamTonic:1});window.dispatchEvent(new Event('blur'));});
 await p.waitForTimeout(300);
 assert.deepEqual(p.errs,[]);await ctx.close();
}
{
 // a long press that is released in place is a plain click (selects the item); no context menu opens; a cancelled touch leaves nothing behind
 const {ctx,p}=await openRun(true);const cdp=await ctx.newCDPSession(p);
 const send=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});
 await p.evaluate(()=>{window.__menus=[];document.addEventListener('contextmenu',e=>window.__menus.push(e.defaultPrevented),true);});
 await p.waitForSelector('.c195-bag');   // openRun leaves the bag open
 const at=await centre(p.locator('#bag-item-tonic'));
 await send('touchStart',at.x,at.y);await p.waitForTimeout(450);await send('touchEnd',at.x,at.y);await p.waitForTimeout(250);
 assert.equal(await p.locator('#bag-item-tonic.is-selected').count(),1,'a long press released in place selects the item like a click');
 assert.equal(await p.locator('.drag-ghost').count(),0);assert.ok((await p.evaluate(()=>window.__menus)).every(Boolean),'a long press never opens the browser context menu');
 const slot=await centre(p.locator('#bag-slot-3'));
 await send('touchStart',at.x,at.y);await p.waitForTimeout(380);for(let i=1;i<=5;i++){await send('touchMove',at.x+(slot.x-at.x)*i/10,at.y+(slot.y-at.y)*i/10);await p.waitForTimeout(16);}
 assert.equal(await p.locator('.drag-ghost').count(),1,'the drag is under way');
 await send('touchCancel',0,0);await p.waitForTimeout(250);
 assert.equal(await p.locator('.drag-ghost').count(),0,'a cancelled touch removes the ghost');assert.ok((await slotItems(p)).every(l=>/空/.test(l)),'and pins nothing');
 await p.locator('#bag-slot-3').click();await p.locator('#bag-pin').click();assert.match((await slotItems(p))[3],/PP/,'the bag still works after a cancelled drag');
 assert.deepEqual(p.errs,[]);await ctx.close();
}
{
 const {ctx,p}=await openRun(true,{width:900,height:520});const cdp=await ctx.newCDPSession(p);
 await p.evaluate(()=>{const s=window.trial.store.world;Object.assign(s.prog.items,{pechaBerry:1,rawstBerry:1,cheriBerry:1,chestoBerry:1,healSeed:1,violentSeed:1,maxElixir:1,slumberOrb:1,totterOrb:1,luminousOrb:1,rollcallOrb:1,teamTonic:1});window.dispatchEvent(new Event('blur'));});
 await p.waitForTimeout(300);
 const grid=await p.evaluate(()=>{const g=document.querySelector('.c195-bag-grid');return {sh:g.scrollHeight,ch:g.clientHeight};});assert.ok(grid.sh>grid.ch+10,'the item grid scrolls at 900x520: '+JSON.stringify(grid));
 const box=await p.locator('.c195-bag-grid').boundingBox(),x=box.x+box.width/2,y0=box.y+box.height-20,send=(type,xx,yy)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:xx,y:yy,id:1}]});
 await send('touchStart',x,y0);for(let i=1;i<=10;i++){await send('touchMove',x,y0-i*12);await p.waitForTimeout(16);}await send('touchEnd',x,y0-120);await p.waitForTimeout(400);
 assert.ok(await p.locator('.c195-bag-grid').evaluate(g=>g.scrollTop)>0,'a vertical swipe scrolled the item grid');
 assert.equal(await p.locator('.drag-ghost').count(),0,'and did not start a drag');assert.ok((await slotItems(p)).every(l=>/空/.test(l)),'nothing was pinned');
 assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- camp
{
 const ctx=await b.newContext({viewport:{width:1280,height:900},hasTouch:true});
 await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=4243');await p.locator('#start').waitFor();
 const profile=initialProfile();const fill=['quickattack','tackle','mudslap','watergun','bubble','bite','rocksmash','growl','protect','reflect'].filter(m=>learnableMove('mudkip',m)&&!SPECIES.mudkip.kit.some(k=>k.move===m)).slice(0,3);
 assert.equal(fill.length,3,'mudkip has three more learnable moves for the fixture');
 const mudLearned=[...SPECIES.mudkip.kit.map(k=>({...k})),...fill.map(m=>({...learnableMove('mudkip',m)}))];
 profile.roster.push({id:'P4',species:'mudkip',learned:mudLearned,carry:mudLearned.slice(0,4).map(k=>k.move),protected:false,tactic:'together'});profile.next=5;
 const ok=await p.evaluate(pr=>window.trial.store.beginNewGame(pr,true),profile);assert.equal(ok,true);await p.reload();await p.waitForFunction(()=>window.trial?.store.status==='ready');
 await openCampRoster(p,'P3');
 const team=()=>p.evaluate(()=>window.trial.store.profile.team);
 assert.deepEqual(await team(),['P1','P2','P3']);
 // B3/B4: Esc during a drag cancels only the drag (the camp window stays open); the ghost is inside the dialog and under the pointer; the release after Esc is not a click
 {const card=p.locator('.camp194-roster-select[data-camp-member="P4"]'),a=await centre(card),slot=await centre(p.locator('#camp-party-slot-P2'));
  await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(a.x+14,a.y+10,{steps:3});await p.mouse.move(slot.x,slot.y,{steps:6});
  const ghost=await p.evaluate(()=>{const g=document.querySelector('.drag-ghost');if(!g)return null;const r=g.getBoundingClientRect();return {inDialog:!!g.closest('dialog#camp-dialog'),cx:r.x+r.width/2,cy:r.y+r.height/2};});
  assert.ok(ghost&&ghost.inDialog,'the ghost lives inside the camp dialog, above the modal content');assert.ok(Math.abs(ghost.cx-slot.x)<=4&&Math.abs(ghost.cy-slot.y)<=4,'and sits under the pointer: '+JSON.stringify([ghost,slot]));
  await p.keyboard.press('Escape');assert.equal(await p.locator('#camp-dialog[open]').count(),1,'Esc during a drag does not close the camp window');assert.equal(await p.locator('.drag-ghost').count(),0,'Esc removes the ghost');
  await p.mouse.up();await p.waitForTimeout(200);assert.deepEqual(await team(),['P1','P2','P3'],'releasing after Esc drops nothing');
  assert.equal(await p.locator('#camp-dialog[open]').count(),1);assert.equal(await p.locator('.camp194-roster-select[data-camp-member="P3"][aria-pressed="true"]').count(),1,'and does not click the card either');}
 // item 4: a redraw under the pointer ends the drag and leaves no ghost
 {const a=await centre(p.locator('.camp194-roster-select[data-camp-member="P4"]'));await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(a.x+20,a.y+14,{steps:4});
  assert.equal(await p.locator('.drag-ghost').count(),1);await p.evaluate(()=>window.trial.autoSleep(true));await p.waitForTimeout(200);
  assert.equal(await p.locator('.drag-ghost').count(),0,'no ghost is left after the list is redrawn mid-drag');await p.mouse.up();await p.waitForTimeout(150);assert.deepEqual(await team(),['P1','P2','P3']);}
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
 // item 5: highlights match what a drop does. P4 carries four of five learned moves: the carried list is not a target for the learned one, but the carried tiles (replace) are
 await p.locator('[data-camp-member="P4"]').first().click();
 {const a0=await centre(p.locator('#camp-party-learned .camp194-move-tile'));await p.mouse.move(a0.x,a0.y);await p.mouse.down();await p.mouse.move(a0.x+14,a0.y+12,{steps:3});
  const r=await p.evaluate(()=>({carry:document.querySelector('#camp-party-carry').classList.contains('drop-ok'),tiles:document.querySelectorAll('#camp-party-carry .camp194-move-tile.drop-ok').length}));
  assert.equal(r.carry,false,'a full carried list does not highlight as a place to put a fifth move');assert.equal(r.tiles,4,'but each carried move highlights as a replacement target');
  await p.keyboard.press('Escape');await p.mouse.up();await p.waitForTimeout(150);}
 // ...and with one team member left, the roster is not a target for that member
 assert.equal((await p.evaluate(()=>window.trial.store.baseAction({type:'team',team:['P3'],leader:'P3'}))).ok,true);await p.evaluate(()=>window.trial.autoSleep(true));await p.waitForTimeout(250);
 {const a1=await centre(p.locator('#camp-party-slot-P3'));await p.mouse.move(a1.x,a1.y);await p.mouse.down();await p.mouse.move(a1.x+14,a1.y+12,{steps:3});
  assert.equal(await p.evaluate(()=>document.querySelector('#camp-party-roster').classList.contains('drop-ok')),false,'the roster does not highlight for the last team member');
  await p.keyboard.press('Escape');await p.mouse.up();await p.waitForTimeout(150);}
 // click still toggles
 await p.locator('[data-camp-member="P3"]').first().click();
 await p.locator('#camp-party-carry .camp194-move-tile').first().click();await p.waitForTimeout(250);assert.equal((await carry()).length,1,'click still removes a carried move');
 assert.deepEqual(errs,[]);await ctx.close();
}
await b.close();console.log('drag checks passed');
