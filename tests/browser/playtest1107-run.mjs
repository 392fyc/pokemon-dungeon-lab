/* Playtest round 2 #2 and #4: giving up an expedition (two entry points, a confirmation naming the loss, wipe-style settlement and a saved camp), and a camp machine
   that needs the player to choose when four moves are already carried (replace one, or learn without carrying).
   TRIAL_URL=<server> node tests/browser/playtest1107-run.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {initialProfile} from '../../src/core/base.ts';
import {learnableMove} from '../../src/core/roster.ts';
import {openCampPanel} from './camp-ui.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const fresh=async(w=1280,h=720)=>{const ctx=await b.newContext({viewport:{width:w,height:h}});await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));return {ctx,p};};
// ---- camp: learn with room to spare (carried at once) and with a full list (choice window)
{
 const probe=initialProfile(),inst=probe.roster[0];
 const fresh1=m=>learnableMove(inst.species,m)&&!inst.learned.some(l=>l.move===m);
 const machines=['protect','reflect','lightscreen','quickguard','helpinghand','facade','swift','headbutt','snore','sleeptalk','rest'].filter(fresh1);
 assert.ok(machines.length>=2,'two machines this species can learn');
 const [tm,other]=machines;
 const load=async(profile)=>{const {ctx,p}=await fresh(1280,900);await p.goto(base+'/?dev=1&seed=4243');await p.locator('#start').waitFor();
  assert.equal(await p.evaluate(pr=>window.trial.store.beginNewGame(pr,true),profile),true);await p.reload();await p.waitForFunction(()=>window.trial?.store.status==='ready');return {ctx,p};};
 {const profile=initialProfile();profile.vault={[tm]:1};const {ctx,p}=await load(profile);
  await openCampPanel(p,'vault');await p.locator('#tm-'+tm).click();await p.locator('[data-vault-learner="P1"]').click();await p.locator('#learn-P1').click();await p.waitForTimeout(400);
  const mine=await p.evaluate(()=>window.trial.store.profile.roster.find(i=>i.id==='P1'));
  assert.ok(mine.learned.some(l=>l.move===tm));assert.ok(mine.carry.includes(tm),'room to spare: the learned move is carried at once');
  assert.equal(await p.locator('#learn-carry-dialog').count(),0,'no window when there is room');assert.deepEqual(p.errs,[]);await ctx.close();}
 {const profile=initialProfile(),p1=profile.roster[0];
  const fillers=['quickattack','tackle','ember','absorb','scratch','smokescreen','metalclaw','slash','firefang','swift','headbutt','dragonrage'].filter(m=>m!==tm&&m!==other&&learnableMove(p1.species,m)&&!p1.learned.some(l=>l.move===m)).slice(0,2);
  assert.equal(fillers.length,2,'two filler moves');
  for(const m of fillers)p1.learned.push(learnableMove(p1.species,m));p1.carry=[...p1.carry,...fillers];assert.equal(p1.carry.length,4);
  profile.vault={[tm]:1};
  const {ctx,p}=await load(profile);
  await openCampPanel(p,'vault');await p.locator('#tm-'+tm).click();await p.locator('[data-vault-learner="P1"]').click();await p.locator('#learn-P1').click();
  await p.waitForSelector('#learn-carry-dialog[open]');
  const dlg=await p.locator('#learn-carry-dialog').boundingBox();assert.ok(dlg.x>=0&&dlg.y>=0&&dlg.x+dlg.width<=1281&&dlg.y+dlg.height<=901,'the window fits');
  assert.ok(await p.locator('#learn-carry-dialog .c195-learner-types .paper-type').count()>=1,'the learner types are shown');
  assert.equal(await p.locator('#carry-confirm').isDisabled(),true);
  await p.screenshot({path:out+'camp-learn-carry.png'});
  await p.locator('#carry-replace-'+p1.carry[1]).click();assert.equal(await p.locator('#carry-confirm').isDisabled(),false);
  await p.locator('#carry-confirm').click();await p.waitForTimeout(400);
  const after=await p.evaluate(()=>window.trial.store.profile.roster.find(i=>i.id==='P1'));
  assert.equal(after.carry[1],tm,'the chosen move gave way');assert.equal(after.carry.length,4);assert.ok(after.learned.some(l=>l.move===p1.carry[1]),'the replaced move is still learned');
  assert.deepEqual(p.errs,[]);await ctx.close();}
}
// ---- give up an expedition: from the settings and from the "..." menu
for(const via of ['settings','menu']){
 const {ctx,p}=await fresh();
 await p.goto(base+'/?dev=1&seed=7');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
 await p.evaluate(()=>{const s=window.trial.store.world;s.tms=[{move:'protect',fate:'held',source:'target'}];window.dispatchEvent(new Event('blur'));});
 if(via==='settings'){await p.locator('#hud-settings').click();await p.waitForSelector('#settings[open]');await p.locator('#abandon-run').click();}
 else{await p.locator('#actions-open').click();await p.locator('#abandon-open').click();}
 await p.waitForSelector('#abandon-dialog[open]');
 const text=await p.locator('#abandon-dialog').innerText();
 for(const word of ['招式机全部丢失','全队倒下','回到营地','第 1 层'])assert.ok(text.includes(word),'the confirmation names the consequence: '+word);
 assert.equal(await p.evaluate(()=>document.activeElement?.id),'abandon-cancel','focus starts on the safe choice');
 await p.locator('#abandon-cancel').click();assert.equal(await p.evaluate(()=>window.trial.getState().phase),'playing','cancel keeps the run');
 await p.screenshot({path:out+'abandon-confirm.png'});
 if(via==='settings'){await p.locator('#hud-settings').click();await p.waitForSelector('#settings[open]');await p.locator('#abandon-run').click();}
 else{if(!(await p.locator('#abandon-open').isVisible()))await p.locator('#actions-open').click();await p.locator('#abandon-open').click();}
 await p.locator('#abandon-confirm').click();await p.waitForFunction(()=>window.trial.getState().phase==='ended');
 const end=await p.evaluate(()=>{const s=window.trial.getState();return {outcome:s.end.outcome,tms:s.end.tms.map(t=>t.fate)};});
 assert.equal(end.outcome,'wipe');assert.ok(end.tms.every(f=>f==='lost'));
 assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- B2: with the leader asleep and the sleep auto-advance ON, an open confirmation window does not let rounds run by themselves
{
 const ctx=await b.newContext({viewport:{width:1280,height:720}});const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));   // note: no __trialNoAutoSleep
 await ctx.addInitScript(()=>{window.__trialNoAnim=true;});
 await p.goto(base+'/?dev=1&seed=7');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
 await p.evaluate(()=>{const s=window.trial.store.world;s.enemies.forEach(id=>{s.units[id].waitOnly=true;});window.trial.autoSleep(true);});
 await p.locator('#hud-settings').click();await p.waitForSelector('#settings[open]');await p.locator('#abandon-run').click();await p.waitForSelector('#abandon-dialog[open]');
 await p.evaluate(()=>{const s=window.trial.store.world;s.units[s.leader].status={slp:{left:9}};window.dispatchEvent(new Event('blur'));});
 const r0=await p.evaluate(()=>window.trial.getState().round);await p.waitForTimeout(1800);
 assert.equal(await p.evaluate(()=>window.trial.getState().round),r0,'no round runs while the abandon window is open');
 await p.locator('#abandon-cancel').click();await p.waitForTimeout(1800);
 assert.ok(await p.evaluate(()=>window.trial.getState().round)>r0,'after cancelling, the sleeper advances again');
 // B1: a run that is already won cannot be abandoned from the settings or the menu
 await p.evaluate(()=>{const s=window.trial.store.world;s.units[s.leader].status=undefined;s.pendingEnd='won';window.trial.autoSleep(false);});
 await p.locator('#hud-settings').click();await p.waitForSelector('#settings[open]');
 assert.equal(await p.locator('#settings-run').isHidden(),true,'no abandon button once the run is won');
 await p.keyboard.press('Escape');
 assert.equal(await p.locator('#abandon-open').count(),0,'and none in the menu');
 assert.deepEqual(errs,[]);await ctx.close();
}
await b.close();console.log('run checks passed');
