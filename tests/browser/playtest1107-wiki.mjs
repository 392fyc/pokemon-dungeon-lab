/* Playtest round 11 (D-20261109-03): the in-game wiki. Opens from the settings window and from H, in the camp and in the dungeon; the round does not advance
   while it is open, input is locked and comes back after it closes; every category has content and its own search; links jump between entries and Back returns;
   Esc closes; it fits at 1280x720 and at 800 wide.
   TRIAL_URL=<server> node tests/browser/playtest1107-wiki.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {initialProfile} from '../../src/core/base.ts';
import {wikiCategories} from '../../src/core/wiki.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const ready=p=>p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());
async function dungeon(size={width:1280,height:720}){
 const ctx=await b.newContext({viewport:size});await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();await ready(p);await p.waitForTimeout(500);
 return {ctx,p};
}
async function camp(size={width:1280,height:720}){
 const ctx=await b.newContext({viewport:size});await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=4243');await p.locator('#start').waitFor();
 assert.equal(await p.evaluate(pr=>window.trial.store.beginNewGame(pr,true),initialProfile()),true);await p.reload();
 await p.waitForFunction(()=>window.trial?.store.status==='ready');await p.locator('#camp-menu').waitFor();
 return {ctx,p};
}
const isOpen=p=>p.locator('#wiki-dialog[open]').count().then(n=>n===1);
const names=wikiCategories().map(c=>c.name);
const fits=async(p,size)=>{const box=await p.locator('#wiki-dialog').boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=size.width+1&&box.y+box.height<=size.height+1,'the wiki window fits the '+size.width+' px screen: '+JSON.stringify(box));
 assert.ok(await p.evaluate(()=>{const d=document.getElementById('wiki-dialog');return d.scrollWidth<=d.clientWidth+1;}),'no sideways overflow in the wiki window');};

// ---- camp: opens from the camp menu (settings) and from H, closes with Esc
{
 const {ctx,p}=await camp();
 await p.locator('#camp-menu').click();await p.locator('#settings[open]').waitFor();
 assert.equal(await p.locator('#settings-wiki').isVisible(),true,'the settings window has a wiki entry');
 await p.keyboard.press('h');assert.equal(await isOpen(p),false,'H does nothing while the settings window is open (G13.6: no other window open)');
 await p.locator('#settings-wiki').click();await p.locator('#wiki-dialog[open]').waitFor();
 assert.equal(await p.locator('#settings[open]').count(),0,'settings makes way for the wiki');
 assert.equal(await p.locator('.wiki-rule').count(),1,'with ?dev=1 the category home shows its rule number');
 await p.locator('#wiki-list .wiki-row').first().click();assert.ok(await p.locator('.wiki-rule').count()>=1,'?dev=1 shows the rule number tag');
 assert.deepEqual(await p.locator('.wiki-tabs [data-wiki-cat]').allInnerTexts(),names,'the tabs are the data-defined categories');
 await p.keyboard.press('Escape');assert.equal(await isOpen(p),false,'Esc closes the wiki');
 await p.keyboard.press('h');await p.locator('#wiki-dialog[open]').waitFor();
 await p.screenshot({path:out+'r11-camp-open.png'});
 await p.keyboard.press('Escape');assert.equal(await isOpen(p),false);
 assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- dungeon: the round does not advance, input is locked, then it comes back
{
 const {ctx,p}=await dungeon();
 const before=await p.evaluate(()=>({round:window.trial.store.world.round,pos:{...window.trial.store.world.units[window.trial.store.world.leader].pos}}));
 await p.locator('#hud-settings').click();await p.locator('#settings[open]').waitFor();
 await p.locator('#settings-wiki').click();await p.locator('#wiki-dialog[open]').waitFor();
 for(const key of ['d','a','w','s','1','.','f','Tab','b'])await p.keyboard.press(key);
 let now=await p.evaluate(()=>({round:window.trial.store.world.round,pos:{...window.trial.store.world.units[window.trial.store.world.leader].pos}}));
 assert.deepEqual(now,before,'no round passes and nobody moves while the wiki is open');
 assert.equal(await p.locator('#hud-bag:not([hidden])').count(),0,'B does not open the bag behind the wiki');
 await p.keyboard.press('Escape');assert.equal(await isOpen(p),false);
 await p.keyboard.press('h');await p.locator('#wiki-dialog[open]').waitFor();
 await p.keyboard.press('Escape');assert.equal(await isOpen(p),false,'H opens it and Esc closes it in the dungeon');
 // input is back after closing: a step changes position or the round
 let moved=false;
 for(const key of ['d','a','s','w']){await p.keyboard.press(key);await p.waitForTimeout(250);
  now=await p.evaluate(()=>({round:window.trial.store.world.round,pos:{...window.trial.store.world.units[window.trial.store.world.leader].pos}}));
  if(now.round!==before.round||JSON.stringify(now.pos)!==JSON.stringify(before.pos)){moved=true;break;}}
 assert.ok(moved,'movement works again after the wiki closes');
 // H while typing in the search box must not toggle anything
 await p.keyboard.press('h');await p.locator('#wiki-dialog[open]').waitFor();
 const snap=()=>p.evaluate(()=>JSON.stringify({round:window.trial.store.world.round,pos:window.trial.store.world.units[window.trial.store.world.leader].pos}));
 const snapshot=await snap();
 await p.locator('#wiki-search').press('h');await p.locator('#wiki-search').press('w');await p.locator('#wiki-search').press('1');
 assert.equal(await p.locator('#wiki-search').inputValue(),'hw1','typing h, w and 1 in the search box reaches the box');assert.equal(await isOpen(p),true);
 assert.equal(await snap(),snapshot,'the game keys did not reach the game');
 await p.keyboard.press('Escape');
 // H is ignored while another window is open: the record window
 await p.keyboard.press('l');await p.locator('#log-dialog[open]').waitFor();await p.keyboard.press('h');assert.equal(await isOpen(p),false,'H does nothing while the record is open');await p.keyboard.press('Escape');
 assert.equal(await snap(),snapshot,'the game state did not change');
 assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- categories, search, links, back (1280x720) with screenshots
{
 const size={width:1280,height:720};
 const {ctx,p}=await dungeon(size);
 await p.keyboard.press('h');await p.locator('#wiki-dialog[open]').waitFor();await fits(p,size);
 const cats=await p.locator('.wiki-tabs [data-wiki-cat]').evaluateAll(els=>els.map(e=>e.dataset.wikiCat));
 for(const cat of cats){
  await p.locator('[data-wiki-cat="'+cat+'"]').click();
  const rows=await p.locator('#wiki-list .wiki-row').count();assert.ok(rows>=1,cat+' lists entries');
  await p.locator('#wiki-list .wiki-row').first().click();
  const text=(await p.locator('#wiki-detail').innerText()).trim();assert.ok(text.length>20,cat+' shows detail text');
  assert.ok(await p.locator('#wiki-search').isVisible(),cat+' has a search box');
  await p.screenshot({path:out+'r11-'+cat+'.png'});
 }
 // search in every category: a word from the first entry's title narrows the list to a matching entry; nonsense finds nothing
 for(const cat of cats){
  await p.locator('[data-wiki-cat="'+cat+'"]').click();
  const total=await p.locator('#wiki-list .wiki-row').count();
  const title=await p.locator('#wiki-list .wiki-row strong').first().innerText();
  await p.locator('#wiki-search').fill(title);
  const found=await p.locator('#wiki-list .wiki-row strong').allInnerTexts();
  assert.ok(found.length>=1&&found.every(t=>t.length>0)&&found.includes(title),cat+' search finds "'+title+'"');
  await p.locator('#wiki-search').fill('zzzzzz不存在');assert.equal(await p.locator('#wiki-list .wiki-row').count(),0,cat+' search with no match is empty');
  await p.locator('#wiki-search').fill('');assert.equal(await p.locator('#wiki-list .wiki-row').count(),total,cat+' clearing the search restores the list');
 }
 await p.locator('[data-wiki-cat="moves"]').click();await p.locator('#wiki-search').fill('喷射火焰');await p.waitForTimeout(100);
 await p.screenshot({path:out+'r11-search.png'});
 await p.locator('#wiki-list .wiki-row',{hasText:'喷射火焰'}).first().click();
 const head=await p.locator('#wiki-detail .wiki-entry-head').getAttribute('data-wiki-entry');assert.equal(head,'moves:flamethrower');
 assert.ok(await p.locator('#wiki-detail .hud-range-grid').count()>=1,'a move shows its reach icon');
 // link to a status, then back to the move
 await p.locator('#wiki-detail .wiki-link[data-wiki-link="status:brn"]').first().click();
 assert.equal(await p.locator('#wiki-detail .wiki-entry-head').getAttribute('data-wiki-entry'),'status:brn','the status link opens the status entry');
 assert.equal(await p.locator('[data-wiki-cat="status"]').getAttribute('aria-pressed'),'true','the tab follows the link');
 assert.ok((await p.locator('#wiki-detail').innerText()).includes('灼伤'));
 await p.screenshot({path:out+'r11-link.png'});
 await p.locator('#wiki-back').click();
 assert.equal(await p.locator('#wiki-detail .wiki-entry-head').getAttribute('data-wiki-entry'),'moves:flamethrower','Back returns to the move');
 assert.equal(await p.locator('#wiki-back').isDisabled(),true,'Back is disabled with nothing to return to');
 // a species links to its moves, and a move to the species that learn it
 await p.locator('[data-wiki-cat="species"]').click();await p.locator('#wiki-search').fill('喷火龙');
 await p.locator('#wiki-list .wiki-row',{hasText:'喷火龙'}).first().click();
 assert.ok(await p.locator('#wiki-detail .sprite-portrait').count()>=1,'a species shows its portrait');
 assert.ok(await p.locator('#wiki-detail .wiki-stats li').count()===6,'six base stats');
 await p.locator('#wiki-detail .wiki-chip[data-wiki-link^="moves:"]').first().click();
 assert.ok((await p.locator('#wiki-detail .wiki-entry-head').getAttribute('data-wiki-entry')).startsWith('moves:'),'a species move chip opens the move');
 await p.locator('#wiki-back').click();
 assert.equal(await p.locator('#wiki-detail .wiki-entry-head').getAttribute('data-wiki-entry').then(v=>v.startsWith('species:')),true);
 // the stage table carries engine numbers
 await p.locator('[data-wiki-cat="stages"]').click();await p.locator('#wiki-list .wiki-row',{hasText:'攻击'}).first().click();
 const stageCells=await p.locator('#wiki-detail .wiki-table tbody tr').count();assert.equal(stageCells,21,'21 attack stages');
 assert.ok((await p.locator('#wiki-detail .wiki-table').innerText()).includes('473'),'the +10 multiplier comes from the engine table');
 assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- the sleep auto-advance pauses while the wiki is open and resumes after (no __trialNoAutoSleep here)
{
 const ctx=await b.newContext({viewport:{width:1280,height:720}});await ctx.addInitScript(()=>{window.__trialNoAnim=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();await ready(p);await p.waitForTimeout(500);
 const round=()=>p.evaluate(()=>window.trial.store.world.round);
 await p.evaluate(()=>{const s=window.trial.store.world;for(const id of s.enemies){s.units[id].waitOnly=true;s.units[id].asleep=true;}for(const id of s.queue)if(id!==s.leader)s.units[id].tactic='wait';
  s.units[s.leader].status={slp:{left:6}};window.dispatchEvent(new Event('blur'));});
 await p.keyboard.press('h');await p.locator('#wiki-dialog[open]').waitFor();
 const r0=await round();await p.waitForTimeout(2000);assert.equal(await round(),r0,'a sleeping leader does not auto-wait while the wiki is open');
 await p.keyboard.press('Escape');
 await p.waitForFunction(r=>window.trial.store.world.round>r,r0,{timeout:6000});
 assert.ok(await round()>r0,'the automatic wait resumes after the wiki closes');
 assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- opening the wiki stops a click-to-walk and it does not resume after closing
{
 const ctx=await b.newContext({viewport:{width:1280,height:720}});await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7&anim=on');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();await ready(p);await p.waitForTimeout(600);
 const t=await p.evaluate(len=>{
  const s=window.trial.store.world,L=s.units[s.leader],k=(x,y)=>x+','+y,floor=new Set(s.floor.map(f=>k(f.x,f.y)));
  for(const id of s.enemies){s.units[id].waitOnly=true;s.units[id].asleep=true;}for(const id of s.queue)if(id!==s.leader)s.units[id].tactic='wait';
  for(let dx=-12;dx<=12;dx++)for(let dy=-12;dy<=12;dy++){const x=L.pos.x+dx,y=L.pos.y+dy;if(floor.has(k(x,y))&&!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}
  const taken=new Set(Object.values(s.units).filter(u=>u.pos&&u.hp>0).map(u=>k(u.pos.x,u.pos.y)));let best=null;
  for(const f of s.floor){let ok=true;for(let i=0;i<=len&&ok;i++)ok=floor.has(k(f.x+i,f.y))&&!taken.has(k(f.x+i,f.y))&&s.seen.includes(k(f.x+i,f.y));if(ok){best=f;break;}}
  if(!best)return null;L.pos={x:best.x,y:best.y};window.dispatchEvent(new Event('blur'));window.trial.repaint(s);return {from:{x:best.x,y:best.y},to:{x:best.x+len,y:best.y}};
 },8);
 assert.ok(t,'a free row of cells');await p.waitForTimeout(400);
 const view=await p.evaluate(()=>window.trial.view()),g=view.geometry,v=view.cameraView,camera=await p.evaluate(()=>window.trial.camera()),box=await p.locator('canvas').boundingBox();
 const x=(g.ox+(t.to.x-g.minX+.5)*g.cell-camera.x)*box.width/v.width,y=(g.oy+(t.to.y-g.minY+.5)*g.cell-camera.y)*box.height/v.height;
 await p.mouse.move(box.x+x,box.y+y);await p.waitForTimeout(150);await p.mouse.click(box.x+x,box.y+y);
 await p.waitForFunction(()=>window.trial.walking(),null,{timeout:3000});
 await p.keyboard.press('h');await p.locator('#wiki-dialog[open]').waitFor();
 await p.waitForFunction(()=>!window.trial.walking()&&!window.trial.animating(),null,{timeout:5000});
 const stop=await p.evaluate(()=>{const s=window.trial.getState(),L=s.units[s.leader];return {round:s.round,pos:{...L.pos}};});
 assert.ok(stop.pos.x<t.to.x,'the walk was cut short: '+JSON.stringify(stop));
 await p.waitForTimeout(800);await p.keyboard.press('Escape');await p.waitForTimeout(1200);
 const end=await p.evaluate(()=>{const s=window.trial.getState(),L=s.units[s.leader];return {round:s.round,pos:{...L.pos},walking:window.trial.walking()};});
 assert.deepEqual(end.pos,stop.pos,'the walk does not resume after the wiki closes');assert.equal(end.round,stop.round);assert.equal(end.walking,false);
 assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- without ?dev=1 (reached from the title settings) the rule tags stay hidden; the evasion page lists the defender's evasion stage
{
 const ctx=await b.newContext({viewport:{width:1280,height:720}});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/');await p.locator('#title-settings').click();await p.locator('#settings[open]').waitFor();
 await p.locator('#settings-wiki').click();await p.locator('#wiki-dialog[open]').waitFor();
 assert.equal(await p.locator('.wiki-rule').count(),0,'no rule tag on the category home outside developer mode');
 await p.locator('#wiki-list .wiki-row').first().click();
 assert.equal(await p.locator('.wiki-rule').count(),0,'no rule tag on an entry outside developer mode');
 assert.ok((await p.locator('#wiki-detail').innerText()).length>20);
 await p.locator('[data-wiki-cat="stages"]').click();await p.locator('#wiki-list .wiki-row',{hasText:'闪避'}).first().click();
 const row=await p.locator('#wiki-detail .wiki-table tbody tr',{hasText:'+1'}).first().innerText();assert.ok(/0\.75/.test(row),'evasion +1 gives x0.75: '+row);
 await p.screenshot({path:out+'r11-stages-eva.png'});
 assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- 800 wide
{
 const size={width:800,height:600};
 const {ctx,p}=await dungeon(size);
 await p.keyboard.press('h');await p.locator('#wiki-dialog[open]').waitFor();await fits(p,size);
 for(const cat of ['moves','species','status']){
  await p.locator('[data-wiki-cat="'+cat+'"]').click();await p.locator('#wiki-list .wiki-row').first().click();await fits(p,size);
  const tab=await p.locator('[data-wiki-cat="'+cat+'"]').boundingBox();assert.ok(tab.x>=0&&tab.y>=0&&tab.y+tab.height<=size.height,'the tab is on screen: '+JSON.stringify(tab));
 }
 await p.locator('[data-wiki-cat="moves"]').click();await p.locator('#wiki-list .wiki-row').first().click();
 const list=await p.locator('#wiki-list').boundingBox(),detail=await p.locator('#wiki-detail').boundingBox();
 assert.ok(list.width>=140&&detail.width>=300,'list and detail are both usable at 800 wide: '+list.width+' / '+detail.width);
 await p.screenshot({path:out+'r11-800.png'});
 await p.locator('#wiki-close').click();assert.equal(await isOpen(p),false);
 assert.deepEqual(p.errs,[]);await ctx.close();
}
await b.close();console.log('wiki checks passed');
