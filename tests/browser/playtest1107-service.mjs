/* Playtest round 2 #3: shop and other service panels are centred paper panels (list, detail, purse, buy), with a close button, Esc and a reopen button.
   TRIAL_URL=<server> node tests/browser/playtest1107-service.mjs */
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
 await p.goto(base+'/?dev=1&seed=7');
 await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
 await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader];s.enemies.forEach(id=>{s.units[id].waitOnly=true;});
  s.points=s.points.filter(q=>!(q.pos.x===L.pos.x&&q.pos.y===L.pos.y));s.points.push({pos:{...L.pos},kind:'shop',used:false});
  s.shop={level:s.dungeon.level,stock:{berry:2,tonic:1,tm:'protect',pechaBerry:1,healSeed:1,slumberOrb:1,totterOrb:1,luminousOrb:1,rollcallOrb:1,reviverSeed:1},trades:[]};s.purse=50;
  window.dispatchEvent(new Event('blur'));});
 await p.waitForSelector('#shop-panel');
 const box=await p.locator('#context-actions').boundingBox();
 assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=w+1&&box.y+box.height<=h+1,`the shop panel fits the viewport at ${w}x${h}: ${JSON.stringify(box)}`);
 assert.ok(Math.abs(box.x+box.width/2-w/2)<=2&&Math.abs(box.y+box.height/2-h/2)<=2,'it is centred');
 assert.match(await p.locator('#purse-line').innerText(),/钱袋余额：\s*50/);
 assert.equal(await p.locator('.shop-list li').count(),10);assert.ok(await p.locator('.shop-detail').isVisible());
 assert.ok(await p.locator('.shop-row .shop-icon').count()>=9,'items show their icons');
 // unaffordable goods are greyed and say how much is missing
 await p.locator('#shop-pick-reviverSeed').click();
 assert.equal(await p.locator('#buy-reviverSeed').isDisabled(),true);assert.doesNotMatch(await p.locator('#shop-panel').innerText(),/钱袋不足|还差/,'no wording about the shortfall');
 assert.equal(await p.locator('#shop-pick-reviverSeed.is-short').count(),1);
 assert.equal(await p.locator('#shop-pick-reviverSeed .shop-price').evaluate(el=>getComputedStyle(el).color),'rgb(192, 48, 30)','an unaffordable price is red');
 assert.notEqual(await p.locator('#shop-pick-berry .shop-price').evaluate(el=>getComputedStyle(el).color),'rgb(192, 48, 30)','an affordable price is not'); 
 // buying: select, then buy
 await p.locator('#shop-pick-berry').click();await p.locator('#buy-berry').click();await p.waitForTimeout(300);
 assert.deepEqual(await p.evaluate(()=>[window.trial.getState().purse,window.trial.getState().prog.items.berry]),[30,1]);
 await p.screenshot({path:out+`shop-panel-${w}x${h}.png`});
 // close, reopen, Esc
 await p.locator('#shop-panel .service-close').click();assert.equal(await p.locator('#shop-panel').count(),0);assert.equal(await p.locator('#service-reopen').count(),1);
 await p.locator('#service-reopen').click();assert.equal(await p.locator('#shop-panel').count(),1);
 await p.keyboard.press('Escape');assert.equal(await p.locator('#shop-panel').count(),0,'Esc closes the panel');
 // a room panel (blessing room) gets the same treatment
 await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader];s.points=s.points.filter(q=>!(q.pos.x===L.pos.x&&q.pos.y===L.pos.y));s.shop=undefined;
  s.adventureRooms=[{room:60,type:'blessing',state:'idle',interaction:{...L.pos},doors:[],sealedCells:[],enemyIds:[],reward:null,rewardCurrency:null,item:null,rewardItem:null,rewardMove:null}];s.rooms=[...(s.rooms??[])];window.dispatchEvent(new Event('blur'));});
 await p.locator('#service-reopen').click();   // the shop was closed with Esc on this very cell
 await p.waitForSelector('#adventure-room-panel');
 const room=await p.locator('#context-actions').boundingBox();
 assert.ok(room.x>=0&&room.y>=0&&room.x+room.width<=w+1&&room.y+room.height<=h+1&&Math.abs(room.x+room.width/2-w/2)<=2,'the room panel is centred and fits: '+JSON.stringify(room));
 assert.ok(await p.locator('#context-actions .service-close').count()===1,'and has a close button');
 await p.screenshot({path:out+`room-panel-${w}x${h}.png`});
 assert.deepEqual(errs,[]);await ctx.close();
}
await b.close();console.log('service panel checks passed');
