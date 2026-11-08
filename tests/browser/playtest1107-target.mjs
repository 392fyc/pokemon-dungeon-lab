/* Playtest round 3 #5: using an item on a partner. After choosing the item the party list is the target picker: usable cards are lit with an arrow, the others dimmed,
   a hint line says "选择使用目标"; a card (or the partner on the map, or keys 1-3) uses it; Esc, right click and 取消 leave without spending anything.
   TRIAL_URL=<server> node tests/browser/playtest1107-target.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
for(const [w,h] of [[1280,720],[900,520]]){
 const ctx=await b.newContext({viewport:{width:w,height:h}});
 await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
 const setup=()=>p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader],k=(x,y)=>x+','+y;s.enemies.forEach(id=>{s.units[id].waitOnly=true;});
  const free=s.floor.filter(f=>!Object.values(s.units).some(u=>u.pos&&u.pos.x===f.x&&u.pos.y===f.y));
  const dist=f=>Math.max(Math.abs(f.x-L.pos.x),Math.abs(f.y-L.pos.y));
  const near=free.find(f=>dist(f)===1&&s.floor.some(q=>q.x===f.x&&q.y===f.y)),far=free.find(f=>dist(f)>=4&&dist(f)<=6);
  const [a,bm]=s.queue.filter(id=>id!==s.leader);s.units[a].pos=near;s.units[bm].pos=far;
  for(const c of [near,far])if(!s.seen.includes(k(c.x,c.y)))s.seen.push(k(c.x,c.y));
  s.units[s.leader].hp=5;s.units[a].hp=5;s.units[bm].hp=5;s.units[s.leader].tactic=s.units[a].tactic=s.units[bm].tactic='wait';
  s.prog.items.berry=5;window.dispatchEvent(new Event('blur'));return {leader:s.leader,near:a,far:bm,nearPos:near};});
 const ids=await setup();
 const choose=async()=>{await p.locator('#bag-open').click();await p.locator('[data-bag-item="berry"]').click();await p.locator('#bag-use').click();await p.waitForSelector('#target-hint');};
 const snap=()=>p.evaluate(()=>{const s=window.trial.getState();return {round:s.round,berries:s.prog.items.berry,hp:Object.fromEntries(s.queue.map(id=>[id,s.units[id].hp]))};});
 const before=await snap();
 await choose();
 assert.match(await p.locator('#target-hint').innerText(),/选择使用目标/);
 assert.equal(await p.locator(`#unit-card-${ids.leader}.is-target`).count(),1,'the leader is a usable target');assert.equal(await p.locator(`#unit-card-${ids.near}.is-target`).count(),1,'the adjacent partner is usable');
 assert.equal(await p.locator(`#unit-card-${ids.far}.is-dim`).count(),1,'a partner out of reach is dimmed');assert.equal(await p.locator(`#unit-card-${ids.far} button`).first().isDisabled(),true,'and cannot be clicked');
 assert.equal(await p.locator('.hud-target-arrow').count(),2,'every lit card has a pointing arrow');
 assert.equal(await p.locator('#hud-item-targets').isHidden(),true,'the old target bar is not used for a partner item');
 await p.screenshot({path:out+`target-mode-${w}x${h}.png`});
 // a dimmed card does nothing
 await p.locator(`#unit-card-${ids.far} button`).first().click({force:true}).catch(()=>{});assert.deepEqual(await snap(),before);assert.equal(await p.locator('#target-hint').count(),1);
 // Esc, right click and the cancel button leave without spending anything
 await p.keyboard.press('Escape');assert.equal(await p.locator('#target-hint').count(),0,'Esc leaves the target state');assert.deepEqual(await snap(),before);
 await choose();const box=await p.locator('canvas').boundingBox();await p.mouse.click(box.x+box.width/2,box.y+40,{button:'right'});await p.waitForTimeout(150);
 assert.equal(await p.locator('#target-hint').count(),0,'a right click leaves it');assert.deepEqual(await snap(),before);
 await choose();await p.locator('#target-cancel').click();assert.equal(await p.locator('#target-hint').count(),0,'the cancel button leaves it');assert.deepEqual(await snap(),before);
 // a card uses the item on that member: one round, one berry
 await choose();await p.locator(`#unit-card-${ids.near} .hud-party-main`).click();await p.waitForTimeout(300);
 let after=await snap();assert.equal(after.round,before.round+1);assert.equal(after.berries,before.berries-1);assert.ok(after.hp[ids.near]>before.hp[ids.near],'the partner was healed');
 assert.equal(await p.locator('#target-hint').count(),0);
 // keys 1-3 pick the card in that position
 await p.evaluate(()=>{const s=window.trial.store.world;for(const id of s.queue)s.units[id].hp=5;window.dispatchEvent(new Event('blur'));});
 const mid=await snap();await choose();const slot=(await p.evaluate(()=>window.trial.getState().queue)).indexOf(ids.leader)+1;await p.keyboard.press(String(slot));await p.waitForTimeout(300);
 after=await snap();assert.equal(after.round,mid.round+1,'key '+slot+' used the item on the leader');assert.ok(after.hp[ids.leader]>mid.hp[ids.leader]);
 // the partner on the map can be clicked
 await p.evaluate(()=>{const s=window.trial.store.world;for(const id of s.queue)s.units[id].hp=5;window.dispatchEvent(new Event('blur'));});
 const mid2=await snap();await choose();
 const at=await p.evaluate(id=>{const v=window.trial.view().units[id],c=window.trial.camera();return {x:v.x-c.x,y:v.y-c.y-20};},ids.near);
 await p.mouse.move(at.x,at.y);await p.waitForTimeout(150);await p.mouse.click(at.x,at.y);await p.waitForTimeout(300);
 after=await snap();assert.equal(after.round,mid2.round+1,'clicking the partner on the map used it');assert.ok(after.hp[ids.near]>mid2.hp[ids.near]);
 // exactly one usable target: no second confirmation, the item is used at once
 await p.evaluate(({near})=>{const s=window.trial.store.world;s.units[near].hp=s.units[near].maxHp;window.dispatchEvent(new Event('blur'));},ids);
 const solo=await snap();await p.locator('#bag-open').click();await p.locator('[data-bag-item="berry"]').click();await p.locator('#bag-use').click();await p.waitForTimeout(400);
 {const after1=await snap();assert.equal(after1.round,solo.round+1,'the only usable target is used on at once');assert.equal(after1.berries,solo.berries-1);assert.equal(await p.locator('#target-hint').count(),0);}
 // key 4 has no card: it neither uses an item nor switches to a move; a direction key leaves the target state
 await p.evaluate(()=>{const s=window.trial.store.world;for(const id of s.queue)s.units[id].hp=5;window.dispatchEvent(new Event('blur'));});
 const before4=await snap();await choose();await p.keyboard.press('4');await p.waitForTimeout(150);
 assert.equal(await p.locator('#target-hint').count(),1,'key 4 leaves the target state alone');assert.deepEqual(await snap(),before4);assert.equal(await p.locator('#selected-move-preview').count(),0,'and does not select a move');
 await p.keyboard.press('d');await p.waitForTimeout(400);assert.equal(await p.locator('#target-hint').count(),0,'a direction key leaves the target state');
 // Esc in the target state closes only that state: the combination draft behind it stays
 await p.evaluate(({near,leader})=>{const s=window.trial.store.world,L=s.units[leader];for(const id of s.queue)s.units[id].hp=5;   // the direction key moved the leader: put the partner next to it again so two members can use the item
  const free=s.floor.find(f=>Math.max(Math.abs(f.x-L.pos.x),Math.abs(f.y-L.pos.y))===1&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===f.x&&u.pos.y===f.y));s.units[near].pos=free;window.dispatchEvent(new Event('blur'));},ids);
 await p.locator('#actions-open').click();await p.locator('#arrange').click();await p.locator('#partner-'+ids.near).click();
 assert.equal(await p.locator('#controls .draft').count(),1,'a combination draft is open');
 await p.locator('#bag-open').click();await p.locator('[data-bag-item="berry"]').click();await p.locator('#bag-use').click();await p.waitForSelector('#target-hint');
 await p.keyboard.press('Escape');assert.equal(await p.locator('#target-hint').count(),0);assert.equal(await p.locator('#controls .draft').count(),1,'Esc closed the target state only; the draft is still there');
 assert.deepEqual(errs,[]);await ctx.close();
}
await b.close();console.log('target checks passed');
