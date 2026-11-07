/* Playtest round 2 #7, #9, #11: the details window keeps its close button off the move list, hides an enemy's stat chart, and labels an ally's chart as base stats.
   TRIAL_URL=<server> node tests/browser/playtest1107-details.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
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
 assert.equal(await p.locator('.detail-chart-title').innerText(),'种族值');assert.match(await p.locator('.detail-chart-note').innerText(),/种族值不随等级变化.*最大 HP.*箭头/);
 const chart=await rect('.detail-chart'),dialogBox=dlg;assert.ok(chart.y+chart.height<=dialogBox.y+dialogBox.height+1,'the chart and its note stay inside the window');
 assert.ok(await p.locator('.detail-stat-chart').isVisible());
 await p.screenshot({path:out+`details-ally-${w}x${h}.png`});
 // enemy details
 await p.locator('#detail-unit-w1a').click();await p.waitForTimeout(200);
 assert.equal(await p.locator('.detail-stat-chart').count(),0,'no stat chart for an enemy');assert.equal(await p.locator('.detail-chart').count(),0);
 const text=await p.locator('#unit-details-dialog').innerText();assert.ok(/Lv\d+/.test(text)&&/\d+\/\d+/.test(text),'name level and HP remain');
 assert.ok(!/攻击\s*\d+|防御\s*\d+|速度\s*\d+|种族值/.test(text),'no stat numbers for an enemy');
 const close2=await rect('#unit-detail-close'),skills2=await p.locator('[data-detail-skill]').evaluateAll(n=>n.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
 for(const r of skills2)assert.ok(!overlaps(close2,r),'enemy window: the close button stays off the moves');
 await p.screenshot({path:out+`details-enemy-${w}x${h}.png`});
 assert.deepEqual(errs,[]);await ctx.close();
}
await b.close();console.log('details checks passed');
