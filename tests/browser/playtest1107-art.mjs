/* Playtest 1107 browser check: item icons (bag, quick slots, map drops, shop), room props on the map, bag detail with orbs, tm names in Chinese.
   TRIAL_URL=<dev server> SHOT_DIR=<dir> node tests/browser/playtest1107-art.mjs */
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
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('response',r=>{if(r.status()>=400&&/assets/.test(r.url()))errs.push('HTTP '+r.status()+' '+r.url());});
 await p.goto(base+'/?dev=1&seed=7');
 await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
 await p.evaluate(()=>{
  const s=window.trial.store.world,L=s.units[s.leader],k=(x,y)=>x+','+y;
  Object.assign(s.prog.items,{berry:3,bigBerry:1,tonic:2,teamTonic:1,pechaBerry:1,healSeed:1,violentSeed:1,maxElixir:1,slumberOrb:2,totterOrb:1,luminousOrb:1,rollcallOrb:1,reviverSeed:1});
  s.tms=[{move:'tackle',fate:'held',source:'target'}];
  const free=[];for(let dx=-3;dx<=3;dx++)for(let dy=-3;dy<=3;dy++){const x=L.pos.x+dx,y=L.pos.y+dy;if((dx||dy)&&s.floor.some(f=>f.x===x&&f.y===y)&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===x&&u.pos.y===y)){free.push({x,y});if(!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}}
  free.sort((a,b)=>Math.abs(a.x-L.pos.x)+Math.abs(a.y-L.pos.y)-Math.abs(b.x-L.pos.x)-Math.abs(b.y-L.pos.y));
  const kinds=['slumberOrb','totterOrb','luminousOrb','rollcallOrb','berry','healSeed'];
  s.points=s.points.filter(p=>!free.some(f=>f.x===p.pos.x&&f.y===p.pos.y));
  kinds.forEach((kind,i)=>s.points.push({pos:free[i],kind,used:false}));
  const props=[['challenge','idle'],['commission','idle'],['blessing','done'],['item','idle']];
  s.adventureRooms=(s.adventureRooms??[]).filter(r=>false);
  props.forEach(([type,state],i)=>s.adventureRooms.push({room:50+i,type,state,interaction:free[6+i],doors:[],sealedCells:[],enemyIds:[],reward:null,rewardCurrency:null,item:type==='item'?'reviverSeed':null,rewardItem:null,rewardMove:null}));
  s.points.push({pos:free[10],kind:'shop',used:false},{pos:free[11],kind:'rest',used:true});
  window.dispatchEvent(new Event('blur'));window.trial.repaint(s);
 });
 await p.waitForTimeout(700);
 await p.screenshot({path:out+`map-props-drops-${w}x${h}.png`});
 // quick slots in the bottom bar use icons
 await p.locator('#bag-open').click();await p.waitForSelector('.c195-bag');
 assert.equal(await p.locator('.c195-bag-item .c195-icon-img').count(),13,'every consumable cell shows an icon, never a letter circle');
 assert.equal(await p.locator('.c195-bag-item[data-bag-tm]').count(),1);
 const tmName=await p.locator('.c195-bag-item[data-bag-tm] .c195-name').innerText();assert.ok(/撞击/.test(tmName)&&!/tackle/.test(tmName),'technique machine named in Chinese: '+tmName);
 await p.locator('[data-bag-item="slumberOrb"]').click();
 assert.match(await p.locator('.c195-bag-detail').innerText(),/睡眠宝珠[\s\S]*房间里/);
 await p.locator('[data-bag-slot="0"]').click();await p.locator('#bag-pin').click();
 await p.locator('[data-bag-item="reviverSeed"]').click();assert.equal(await p.locator('#bag-use').count(),0,'the Reviver Seed has no manual use');
 await p.screenshot({path:out+`bag-icons-${w}x${h}.png`});
 await p.waitForFunction(()=>[...document.images].every(i=>i.complete),null,{timeout:5000});
 {const imgs=await p.evaluate(()=>({bag:[...document.querySelectorAll('.c195-bag img')].map(i=>i.naturalWidth),quick:[...document.querySelectorAll('.hud-quick-slot img')].map(i=>i.naturalWidth),all:[...document.images].map(i=>[i.src,i.naturalWidth])}));
  assert.ok(imgs.bag.length>=1&&imgs.bag.every(w=>w>0),'every backpack icon loaded: '+JSON.stringify(imgs.bag));assert.ok(imgs.quick.length>=1&&imgs.quick.every(w=>w>0),'every quick-slot icon loaded');
  assert.deepEqual(imgs.all.filter(([,w])=>w===0),[],'no broken image anywhere on the page');}
 await p.locator('#bag-close').click();
 assert.ok(await p.locator('.hud-quick-slot .hud-quick-icon').count()>=1,'the bottom quick bar shows the icon');
 const view=await p.evaluate(()=>window.trial.view());assert.ok(view.tiles.includes('room-challenge')&&view.tiles.includes('room-treasure')&&view.tiles.includes('room-commission')&&view.tiles.includes('room-blessing')&&view.tiles.includes('room-shop')&&view.tiles.includes('item2-orb-slumber'),'room props and drop icons are drawn: '+view.tiles.join());
 // Playtest round 2 #10: a picked-up drop leaves no ghost; a seen drop that is out of sight right now is dimmer
 await p.evaluate(()=>{
  const s=window.trial.store.world,L=s.units[s.leader],k=(x,y)=>x+','+y,taken=new Set(s.points.map(q=>k(q.pos.x,q.pos.y)));
  const free=s.floor.filter(f=>!taken.has(k(f.x,f.y))&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===f.x&&u.pos.y===f.y));
  const dist=f=>Math.abs(f.x-L.pos.x)+Math.abs(f.y-L.pos.y);
  const nearCells=free.filter(f=>dist(f)>=1&&dist(f)<=3),far=free.filter(f=>dist(f)>=14).sort((a,b)=>dist(b)-dist(a))[0];
  s.points=s.points.filter(q=>!['rawstBerry','pechaBerry','chestoBerry'].includes(q.kind));
  s.points.push({pos:nearCells[0],kind:'rawstBerry',used:true},{pos:nearCells[1],kind:'pechaBerry',used:false},{pos:far,kind:'chestoBerry',used:false});
  for(const c of [nearCells[0],nearCells[1],far])if(!s.seen.includes(k(c.x,c.y)))s.seen.push(k(c.x,c.y));
  window.dispatchEvent(new Event('blur'));window.trial.repaint(s);
 });
 await p.waitForTimeout(400);
 {const drops=await p.evaluate(()=>window.trial.view().drops),by=Object.fromEntries(drops.map(d=>[d.texture,d.alpha]));
  assert.ok(!('item2-rawst' in by),'a picked-up item is not drawn at all (no ghost)');
  assert.equal(by['item2-pecha'],1,'an unpicked item in sight is drawn at full strength');
  assert.equal(by['item2-chesto'],.55,'a seen but currently invisible item is dimmer: '+JSON.stringify(drops));}
 // PR 214 B3: an orb has one use button and targets its user; a refused orb is not spent; the Reviver Seed cannot be pinned or used
 await p.locator('#bag-open').click();await p.waitForSelector('.c195-bag');
 await p.locator('[data-bag-item="reviverSeed"]').click();assert.equal(await p.locator('#bag-pin').count(),0,'no pin button for the Reviver Seed');assert.equal(await p.locator('#bag-use').count(),0);
 const roundBefore=await p.evaluate(()=>window.trial.getState().round);
 await p.locator('[data-bag-item="slumberOrb"]').click();await p.locator('#bag-use').click();await p.waitForTimeout(300);   // an orb acts at once: no confirm button, no list of party members
 assert.equal(await p.locator('#item-use-slumberOrb').count(),0,'no second confirmation button');assert.equal(await p.locator('#hud-item-targets [data-hud-item-target]').count(),0);
 const after=await p.evaluate(()=>({round:window.trial.getState().round,orbs:window.trial.getState().prog.items.slumberOrb,msg:document.getElementById('message').textContent}));
 assert.equal(after.round,roundBefore,'a refused orb does not take the round');assert.equal(after.orbs,2,'and is not spent');assert.match(after.msg,/没有.*敌人|不会有效果/);
 // PR 214 B1: after a Luminous Orb the small map and the canvas still hide unexplored enemies and points
 const probe=await p.evaluate(()=>{
  const s=window.trial.store.world,k=(x,y)=>x+','+y,far=s.floor.filter(f=>!s.seen.includes(k(f.x,f.y))&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===f.x&&u.pos.y===f.y))[0];
  s.points.push({pos:far,kind:'cheriBerry',used:false});s.mapRevealed=true;window.dispatchEvent(new Event('blur'));window.trial.repaint(s);
  const hidden=s.enemies.filter(id=>s.units[id].pos&&!s.seen.includes(k(s.units[id].pos.x,s.units[id].pos.y))).length;
  return {hidden,seenEnemies:s.enemies.filter(id=>s.units[id].hp>0&&s.units[id].pos&&s.seen.includes(k(s.units[id].pos.x,s.units[id].pos.y))).length,far};
 });
 await p.waitForTimeout(400);
 assert.ok(probe.hidden>0,'the scenario has an unexplored enemy');
 assert.equal(await p.locator('#hud-map .hud-map-unit.is-enemy').count(),probe.seenEnemies,'the small map shows only enemies that were actually seen');
 assert.equal(await p.locator('#hud-map .hud-map-point.is-cheriBerry').count(),0,'the small map hides an unexplored point');
 assert.ok(!(await p.evaluate(()=>window.trial.view().tiles)).includes('item2-cheri'),'the canvas does not draw an unexplored drop');
 assert.deepEqual(errs,[]);await ctx.close();
}
await b.close();console.log('art checks passed');
