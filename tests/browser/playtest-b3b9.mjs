/* #235: test-only inventory injection verifies item behavior, not an acquisition route. */
import {createRequire} from 'node:module';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial';
const base=process.env.TRIAL_URL?.replace(/\/$/,'');
if(!base)throw Error('Set TRIAL_URL to the local running trial.');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const context=await browser.newContext({viewport:{width:1280,height:720}});
await context.addInitScript(()=>{window.__trialNoAnim=true;});
const page=await context.newPage();
const pageErrors=[],consoleErrors=[],failedRequests=[],badResponses=[];
page.on('pageerror',e=>pageErrors.push(e.message));
page.on('console',m=>{
 if(m.type()!=='error')return;
 // The app has no favicon; Edge requests it automatically outside page resource events.
 if(m.location().url===base+'/favicon.ico'&&m.text()==='Failed to load resource: the server responded with a status of 404 (Not Found)')return;
 consoleErrors.push({text:m.text(),location:m.location()});
});
page.on('requestfailed',r=>failedRequests.push(r.method()+' '+r.url()+': '+(r.failure()?.errorText??'failed')));
page.on('response',r=>{if(r.status()>=400)badResponses.push(r.status()+' '+r.url());});
const ready=()=>page.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady(),null,{timeout:15000});
const snapshot=()=>page.evaluate(()=>{const w=window.trial.store.world;return {round:w.round,level:w.prog.level,exp:w.prog.exp,joySeed:w.prog.items.joySeed??0,leader:w.leader};});
async function waitNextRound(round){await page.waitForFunction(r=>window.trial.store.world.round>r,round,{timeout:8000});await page.waitForFunction(()=>window.trial.store.status==='ready'&&!window.trial.animating(),null,{timeout:8000});}
const threshold=level=>level*(level-1)/2-10;
try{
 await page.goto(base+'/?dev=1&seed=7&anim=off');await page.locator('#config').selectOption('expedition');await page.locator('#start').click();await ready();
 // Leave automatic sleep enabled, to check that recharge does not trigger it.
 await page.evaluate(()=>{const w=window.trial.store.world;for(const id of w.enemies)w.units[id].waitOnly=true;for(const id of w.queue)if(id!==w.leader)w.units[id].tactic='wait';const u=w.units[w.leader];u.asleep=false;u.status={...(u.status??{})};delete u.status.slp;delete u.status.nap;u.status.recharge={left:1};window.dispatchEvent(new Event('blur'));window.trial.render();});
 const beforeRest=await snapshot();const restBadge=page.locator('#party [data-unit-status] .hud-status-badge').filter({hasText:'休息'}).first();await restBadge.waitFor({state:'visible',timeout:5000});
 assert.equal(await restBadge.innerText(),'休息');assert.equal(await page.locator('#hud-sleep-status').count(),0);await page.screenshot({path:join(out,'b3b9-rest-status.png')});
 await page.waitForTimeout(1400);assert.equal((await snapshot()).round,beforeRest.round,'recharge alone does not auto-advance a sleeping turn');
 // Counts are injected into the developer world solely for this behavior test.
 await page.evaluate(()=>{const w=window.trial.store.world;const u=w.units[w.leader];u.status={};u.asleep=false;w.prog.level=5;w.prog.exp=0;w.prog.items={...(w.prog.items??{}),joySeed:2};window.dispatchEvent(new Event('blur'));window.trial.render();});
 await page.locator('#bag-open').click();await page.locator('[data-bag-category="other"]').click();const joyItem=page.locator('[data-bag-item="joySeed"]');await joyItem.waitFor({state:'visible',timeout:5000});
 assert.match(await joyItem.getAttribute('aria-label'),/喜悦种子 ×2/);const bagIcon=joyItem.locator('img');assert.match(await bagIcon.getAttribute('src'),/item-joy-seed\.png$/);assert.equal(await bagIcon.evaluate(img=>img.complete&&img.naturalWidth>0),true);await page.screenshot({path:join(out,'b3b9-joy-seed-bag.png')});
 await joyItem.click();const beforeBagUse=await snapshot();await page.locator('#bag-use').click();await waitNextRound(beforeBagUse.round);const afterBagUse=await snapshot();
 assert.equal(afterBagUse.joySeed,1);assert.equal(afterBagUse.exp,threshold(6));assert.equal(afterBagUse.level,6);assert.equal(await page.locator('#hud-item-targets').isHidden(),true,'self-use has no teammate target picker');
 await page.locator('#bag-open').click();await page.locator('[data-bag-slot="0"]').click();await page.locator('[data-bag-category="other"]').click();await page.locator('[data-bag-item="joySeed"]').click();await page.locator('#bag-pin').click();
 assert.match(await page.locator('[data-hud-quick="0"]').innerText(),/喜悦种/);const quickIcon=page.locator('[data-hud-quick="0"] img');assert.match(await quickIcon.getAttribute('src'),/item-joy-seed\.png$/);assert.equal(await quickIcon.evaluate(img=>img.complete&&img.naturalWidth>0),true);
 assert.equal((await snapshot()).joySeed,1,'assignment does not consume');await page.screenshot({path:join(out,'b3b9-joy-seed-quick-slot.png')});await page.locator('#bag-close').click();const beforeQuickUse=await snapshot();await page.locator('[data-hud-quick="0"]').click();await waitNextRound(beforeQuickUse.round);
 const afterQuickUse=await snapshot();assert.equal(afterQuickUse.joySeed,0);assert.equal(afterQuickUse.exp,threshold(7));assert.equal(afterQuickUse.level,7);assert.equal(await page.locator('#hud-item-targets').isHidden(),true);
 await page.evaluate(()=>{const w=window.trial.store.world;w.prog.level=100;w.prog.exp=4940;w.prog.items.joySeed=1;window.dispatchEvent(new Event('blur'));window.trial.render();});
 await page.locator('#bag-open').click();await page.locator('[data-bag-category="other"]').click();await page.locator('[data-bag-item="joySeed"]').click();const atMaximum=await snapshot();await page.locator('#bag-use').click();
 await page.waitForFunction(()=>document.querySelector('#message')?.innerText.includes('队伍已达100级'),null,{timeout:5000});assert.deepEqual(await snapshot(),atMaximum,'max-level refusal leaves state and item count unchanged');assert.match(await page.locator('#message').innerText(),/喜悦种子不会有效果/);await page.screenshot({path:join(out,'b3b9-joy-seed-max-level.png')});
 await page.keyboard.press('h');await page.locator('#wiki-dialog[open]').waitFor({timeout:5000});await page.locator('[data-wiki-cat="items"]').click();await page.locator('#wiki-list .wiki-row').filter({hasText:'喜悦种子'}).first().click();
 assert.equal(await page.locator('#wiki-detail .wiki-entry-head').getAttribute('data-wiki-entry'),'items:joySeed');assert.match(await page.locator('#wiki-detail').innerText(),/当前局内经验补足到下一级/);assert.match(await page.locator('#wiki-detail').innerText(),/满\s*100\s*级时不能使用/);
 const wikiIcon=page.locator('#wiki-detail .wiki-item-icon');assert.match(await wikiIcon.getAttribute('src'),/item-joy-seed\.png$/);assert.equal(await wikiIcon.evaluate(img=>img.complete&&img.naturalWidth>0),true);await page.screenshot({path:join(out,'b3b9-joy-seed-wiki.png')});
 await page.locator('[data-wiki-cat="status"]').click();await page.locator('#wiki-list .wiki-row').filter({hasText:'休息'}).first().click();assert.equal(await page.locator('#wiki-detail .wiki-entry-head').getAttribute('data-wiki-entry'),'status:recharge');const restText=await page.locator('#wiki-detail').innerText();
 assert.match(restText,/下一次自身行动机会落空且不额外消耗\s*PP/);assert.match(restText,/休息与打盹不同/);await page.screenshot({path:join(out,'b3b9-recharge-wiki.png')});
 assert.deepEqual(pageErrors,[]);assert.deepEqual(badResponses,[],JSON.stringify({consoleErrors,failedRequests,badResponses}));assert.deepEqual(consoleErrors,[]);assert.deepEqual(failedRequests,[]);
 console.log(JSON.stringify({b3Status:true,noSleepAutoAdvance:true,backpackSelfUse:true,quickSlotAssignAndUse:true,fullLevelRefusalNoConsume:true,wikiJoySeedAndRecharge:true,resourceErrors:0,screenshots:out}));
}finally{await context.close();await browser.close();}
