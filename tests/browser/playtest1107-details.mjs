/* Playtest round 2 #7, #9, #11 and round 3: the details window keeps its close button off the move list, hides an enemy's stats, shows an ally's real current ability values (the numbers the damage rule uses) with the damage explanation, move rows with base damage and hit chance, and a blessings tab.
   TRIAL_URL=<server> node tests/browser/playtest1107-details.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {currentStats} from '../../src/core/stats.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const overlaps=(a,c)=>a.x<c.x+c.width&&a.x+a.width>c.x&&a.y<c.y+c.height&&a.y+a.height>c.y;
for(const [w,h] of [[1280,720],[900,520]]){
 const ctx=await b.newContext({viewport:{width:w,height:h}});
 await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7');
 await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
 await p.evaluate(()=>{const s=window.trial.store.world,e=s.units.w1a,k=(x,y)=>x+','+y;
  for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if(s.floor.some(f=>f.x===x&&f.y===y)&&!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}
  window.dispatchEvent(new Event('blur'));});
 // ally details
 await p.locator('[data-hud-details]').first().click();await p.waitForSelector('#unit-details-dialog[open]');
 const rect=async sel=>p.locator(sel).first().boundingBox();
 const close=await rect('#unit-detail-close'),skills=await p.locator('[data-detail-skill]').evaluateAll(n=>n.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
 assert.ok(skills.length>=2,'the ally has move rows');for(const r of skills)assert.ok(!overlaps(close,r),`close button must not cover a move row at ${w}x${h}: ${JSON.stringify({close,r})}`);
 const dlg=await rect('#unit-details-dialog');assert.ok(dlg.x>=0&&dlg.y>=0&&dlg.x+dlg.width<=w+1&&dlg.y+dlg.height<=h+1,'the window fits the viewport');
 assert.equal(await p.locator('.detail-chart-title').innerText(),'能力值');
 {const st=await p.evaluate(()=>window.trial.getState()),idOf=await p.locator('[data-hud-details]').first().getAttribute('data-hud-details'),u=st.units[idOf]??st.units[st.leader],c=currentStats(u);
  const KEYS=['hp','atk','def','spa','spd','spe'],shown=async()=>Object.fromEntries(await Promise.all(KEYS.map(async k=>[k,Number((await p.locator(`.detail-stat-chart [data-stat=${k}] .axis-value`).textContent()).trim().split(/\s/)[0])])));
  const expected=u=>{const cc=currentStats(u);return {hp:u.maxHp,atk:cc.atk,def:cc.def,spa:cc.spa,spd:cc.spd,spe:cc.spe};};
  assert.deepEqual(await shown(),expected(u),'each radar label carries the actual value the damage rule reads (HP is the maximum)');
  assert.equal(await p.locator('.detail-stat-table, .detail-stat-chart .axis-base, .detail-howto, .detail-chart-note').count(),0,'the table, the base-value labels and notes are gone');
  {const bad=await p.evaluate(()=>{const d=document.getElementById('unit-details-dialog');return {text:/种族/.test(d.innerHTML),titles:[...d.querySelectorAll('.detail-chart [title]')].length};});assert.equal(bad.text,false,'no species value wording anywhere in the details window (text, aria, hidden)');assert.equal(bad.titles,0);}
  {const mate=st.queue.find(id=>id!==idOf&&st.units[id]);if(mate){await p.locator(`[data-detail-unit="${mate}"]`).click();await p.waitForTimeout(200);assert.deepEqual(await shown(),expected(st.units[mate]),'switching member updates every number');assert.notDeepEqual(expected(st.units[mate]),expected(u),'the two members differ');await p.locator(`[data-detail-unit="${idOf}"]`).click();await p.waitForTimeout(200);}}
  {const HINTS={hp:/降到 0 就倒下/,atk:/物理招式和普通攻击/,def:/减少受到的物理伤害/,spa:/特殊招式造成/,spd:/减少受到的特殊伤害/,spe:/不影响行动/};
   assert.equal(await p.locator('#unit-details-dialog [data-stat][title]').count(),0,'no native title is left on the labels');
   const tip=p.locator('#stat-tip');assert.equal(await tip.isVisible(),false,'the hint is hidden until asked for');
   for(const [k,re] of Object.entries(HINTS)){const row=p.locator(`.detail-stat-chart [data-stat=${k}]`);await row.hover();await tip.waitFor({state:'visible'});
    assert.match(await tip.innerText(),re,'hover text for '+k);const tb=await tip.boundingBox(),d=await rect('#unit-details-dialog'),rb=await row.boundingBox();
    assert.ok(tb.x>=d.x&&tb.y>=d.y&&tb.x+tb.width<=d.x+d.width&&tb.y+tb.height<=d.y+d.height,`the hint stays inside the details window (${k}) at ${w}x${h}`);
    assert.ok(tb.x>=0&&tb.y>=0&&tb.x+tb.width<=w&&tb.y+tb.height<=h,'and inside the screen');
    assert.ok(!(tb.x<rb.x+rb.width&&tb.x+tb.width>rb.x&&tb.y<rb.y+rb.height&&tb.y+tb.height>rb.y),`the hint does not cover its own label (${k})`);
    if(k==='atk')await p.screenshot({path:out+`r8-details-hover-${w}x${h}.png`});
    await p.mouse.move(5,5);await tip.waitFor({state:'hidden'});}
   await p.locator('.detail-stat-chart [data-stat=def]').focus();await tip.waitFor({state:'visible'});assert.match(await tip.innerText(),HINTS.def,'keyboard focus shows it');
   await p.locator('.detail-stat-chart [data-stat=def]').blur();await tip.waitFor({state:'hidden'});}
  {const box=await p.locator('.detail-stat-chart').boundingBox();assert.ok(box.width>=190&&box.height>=210,'the radar is shown at a readable size at '+w+'x'+h);}
  assert.match(await p.locator('.paper-move-numbers').first().innerText(),/基础伤害|命中|攻击|防御/,'move rows show base damage and hit chance, or the effect');}
 const chart=await rect('.detail-chart'),dialogBox=dlg;assert.ok(chart.y+chart.height<=dialogBox.y+dialogBox.height+1,'the chart and its note stay inside the window');
 {const tac=await rect('.detail-tactics');assert.ok(chart.y+chart.height<=tac.y,`the ability block ends above the tactics row at ${w}x${h}: ${chart.y+chart.height} vs ${tac.y}`);const mv=await rect('.detail-moves');assert.ok(mv.y+mv.height<=tac.y,'the move list ends above the tactics row');}
 assert.equal(await p.locator('.detail-stat-chart').isVisible(),true,'the radar is the only stat display and always shows');
 await p.screenshot({path:out+`details-ally-${w}x${h}.png`});
 // the window shows the party only: no tab for an enemy in view, and no way into an enemy's details (the enemy info card stays)
 assert.equal(await p.locator('#detail-unit-w1a').count(),0,'no enemy tab');assert.equal(await p.locator('[data-detail-unit]').count(),3,'one tab per party member');
 assert.equal(await p.locator('.detail194.is-enemy').count(),0);
 // the blessing column is always there: empty state first, window and column centred together, the same size for every member
 assert.equal(await p.locator('#detail-blessing-empty').innerText(),'无');assert.equal(await p.locator('.detail-blessings').isVisible(),true);
 const boxOf=async()=>{const d=await rect('#unit-details-dialog'),c=await rect('.detail-blessings');return {d,c,left:Math.min(d.x,c.x),right:Math.max(d.x+d.width,c.x+c.width)};};
 const empty=await boxOf();assert.ok(Math.abs((empty.left+empty.right)/2-w/2)<=2,`window and blessing column are centred together at ${w}x${h}: ${JSON.stringify({l:empty.left,r:empty.right})}`);
 assert.ok(empty.left>=0&&empty.right<=w+1&&empty.d.y>=0&&empty.d.y+empty.d.height<=h+1,'everything fits the viewport');
 assert.ok(Math.abs(empty.c.height-empty.d.height)<=1&&empty.c.x>=empty.d.x+empty.d.width,'the column is as tall as the window and sits to its right');
 await p.screenshot({path:out+`r5-details-blessings-0-${w}x${h}.png`});
 await p.locator('#detail-unit-'+(await p.locator('[data-detail-unit]').nth(1).getAttribute('data-detail-unit'))).click();await p.waitForTimeout(150);
 const other=await boxOf();assert.deepEqual([Math.round(other.d.x),Math.round(other.d.y),Math.round(other.d.width),Math.round(other.d.height)],[Math.round(empty.d.x),Math.round(empty.d.y),Math.round(empty.d.width),Math.round(empty.d.height)],'switching member does not move or resize the window');
 await p.keyboard.press('Escape');
 for(const count of [1,7,14]){
  await p.evaluate(n=>{const s=window.trial.store.world;s.blessings=['berryBoost','floorHeal','battleSpirit','lullaby','rally','tmChoice','nemesis','headhunter','fullpower','scholar','killheal','regen','thickskin','laststand'].slice(0,n);window.dispatchEvent(new Event('blur'));},count);
  await p.locator('[data-hud-details]').first().click();await p.waitForSelector('#unit-details-dialog[open]');
  assert.equal(await p.locator('#detail-blessing-list li').count(),count);
  const now=await boxOf();assert.deepEqual([Math.round(now.d.x),Math.round(now.d.y),Math.round(now.d.width),Math.round(now.d.height),Math.round(now.c.x),Math.round(now.c.height)],[Math.round(empty.d.x),Math.round(empty.d.y),Math.round(empty.d.width),Math.round(empty.d.height),Math.round(empty.c.x),Math.round(empty.c.height)],count+' blessings do not change the size or the place of the window');
  assert.match(await p.locator('#detail-blessing-list li').first().innerText(),/树果加量[\s\S]*橙橙果回复 \+\d+%/,'name and a one-line effect');
  if(count===7)await p.screenshot({path:out+`r5-details-blessings-many-${w}x${h}.png`});
  if(count===14)assert.ok(await p.locator('#detail-blessing-list').evaluate(el=>el.scrollHeight>el.clientHeight),'a long list scrolls inside the column');
  await p.keyboard.press('Escape');
 }
 assert.deepEqual(errs,[]);await ctx.close();
}
await b.close();console.log('details checks passed');
