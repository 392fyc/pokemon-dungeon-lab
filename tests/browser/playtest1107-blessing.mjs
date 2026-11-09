/* Round 9: blessing rarity on the choice cards and the details column, and the refresh button, through the real page. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const ctx=await b.newContext({viewport:{width:1280,height:720}});
await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(base+'/?dev=1&seed=7');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());
// a choice offering one blessing of each tier (standing in for a blessing room or a challenge reward)
await p.evaluate(()=>{const s=window.trial.store.world;for(const id of s.enemies)s.units[id].waitOnly=true;s.phase='blessing';s.pendingChoices=[{type:'blessing',source:'challenge',room:null,options:['berryBoost','nemesis','laststand']}];window.dispatchEvent(new Event('blur'));});
await p.waitForSelector('#blessing-choice');await p.waitForTimeout(250);
const cards=await p.locator('#blessing-choice .notice-card').evaluateAll(n=>n.map(el=>({id:el.id,rarity:el.dataset.rarity,tag:el.querySelector('.rarity-tag')?.textContent,shadow:getComputedStyle(el).boxShadow,tagBg:getComputedStyle(el.querySelector('.rarity-tag')).backgroundColor})));
assert.deepEqual(cards.map(c=>[c.rarity,c.tag]),[['common','普通'],['rare','稀有'],['epic','史诗']],'tags name the tier');
assert.equal(new Set(cards.map(c=>c.shadow)).size,3,'three different border colours');assert.equal(new Set(cards.map(c=>c.tagBg)).size,3,'three different tag colours');
await p.screenshot({path:out+'r9-blessing-rarity.png'});
// the refresh button shows the remaining count and works once
const refresh=p.locator('#blessing-refresh');assert.equal((await refresh.innerText()).replace(/\s+/g,''),'刷新（1）');assert.equal(await refresh.isEnabled(),true);
const before=await p.evaluate(()=>({round:window.trial.getState().round,options:window.trial.getState().pendingChoices[0].options,uses:window.trial.getState().blessingRefreshes}));
assert.equal(before.uses,1,'a run starts with one refresh');
await refresh.click();await p.waitForFunction(()=>window.trial.getState().blessingRefreshes===0,null,{timeout:4000});await p.waitForTimeout(250);
const after=await p.evaluate(()=>({round:window.trial.getState().round,phase:window.trial.getState().phase,options:window.trial.getState().pendingChoices[0].options}));
assert.equal(after.round,before.round,'no round passes');assert.equal(after.phase,'blessing');assert.equal(after.options.length,3);assert.notDeepEqual(after.options,before.options,'the three cards changed');
const ids=await p.locator('#blessing-choice .notice-card').evaluateAll(n=>n.map(el=>el.id.replace('blessing-','')));assert.deepEqual(ids,after.options,'the cards on screen are the new draw');
assert.equal((await refresh.innerText()).replace(/\s+/g,''),'刷新（0）');assert.equal(await refresh.isDisabled(),true,'at zero the button is greyed out');
assert.ok(Number(await refresh.evaluate(el=>getComputedStyle(el).opacity))<1,'and looks greyed');
await p.screenshot({path:out+'r9-blessing-refreshed.png'});
assert.deepEqual(after.options.filter(id=>before.options.includes(id)),[],'the refresh leaves out the three options shown before (D-20261109-08)');
await p.screenshot({path:out+'r11-blessing-refresh-excl.png'});
// picking one puts it in the details column with its tier mark
await p.locator('#blessing-choice .notice-card').first().click();await p.waitForFunction(()=>window.trial.getState().phase==='playing',null,{timeout:4000});
const got=await p.evaluate(()=>window.trial.getState().blessings[0]);
await p.locator('[data-hud-details]').first().click();await p.waitForSelector('#unit-details-dialog[open]');
const row=await p.locator(`.detail-blessings li[data-blessing="${got}"]`).evaluate(el=>({rarity:el.dataset.rarity,tag:el.querySelector('.rarity-tag')?.textContent,sigil:getComputedStyle(el.querySelector('.bless-sigil')).backgroundColor}));
const names={common:'普通',rare:'稀有',epic:'史诗'};assert.equal(row.tag,names[row.rarity],'the details column carries the same tier tag');
assert.ok(row.sigil!=='rgb(217, 166, 58)','the sigil takes the tier colour');
await p.screenshot({path:out+'r9-blessing-details.png'});
assert.deepEqual(errs,[]);await b.close();console.log('blessing checks passed');
