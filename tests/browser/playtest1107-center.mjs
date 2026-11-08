/* Round 6: every pop-up is centred on the screen. Each one is opened in turn and its box is measured (centre within 4px of the screen centre) at 1280x720 and 900x520.
   TRIAL_URL=<server> node tests/browser/playtest1107-center.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
async function open(w,h,config='expedition'){
 const ctx=await b.newContext({viewport:{width:w,height:h}});
 await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7');await p.locator('#config').selectOption(config);await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
 return {ctx,p};
}
const room=(type,extra={})=>({room:60,type,state:'idle',doors:[],sealedCells:[],enemyIds:[],reward:null,rewardCurrency:null,item:null,rewardItem:null,rewardMove:null,...extra});
const onCell=(p,edit)=>p.evaluate(src=>{const s=window.trial.store.world,L=s.units[s.leader];s.points=s.points.filter(q=>!(q.pos.x===L.pos.x&&q.pos.y===L.pos.y));for(const id of s.enemies)s.units[id].waitOnly=true;
 new Function('s','L',src)(s,L);window.dispatchEvent(new Event('blur'));window.trial.repaint(s);},edit);
const cases=[
 ['stairs','#stairs-prompt',async p=>{await p.evaluate(()=>{const s=window.trial.store.world,st=s.points.find(q=>q.kind==='down');for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){const k=(st.pos.x+dx)+','+(st.pos.y+dy);if(!s.seen.includes(k))s.seen.push(k);}s.units[s.leader].pos={...st.pos};for(const id of s.enemies)s.units[id].waitOnly=true;window.dispatchEvent(new Event('blur'));});}],
 ['commission','#commission-choice',p=>onCell(p,`s.adventureRooms=[${JSON.stringify(room('commission'))}];s.adventureRooms[0].interaction={...L.pos};`)],
 ['blessing','#blessing-choice',p=>onCell(p,`s.adventureRooms=[${JSON.stringify(room('blessing'))}];s.adventureRooms[0].interaction={...L.pos};`)],
 ['challenge','#adventure-room-panel',p=>onCell(p,`s.adventureRooms=[${JSON.stringify(room('challenge'))}];s.adventureRooms[0].interaction={...L.pos};`),'#context-actions'],
 ['item room','#adventure-room-panel',p=>onCell(p,`s.adventureRooms=[${JSON.stringify(room('item',{item:'berry'}))}];s.adventureRooms[0].interaction={...L.pos};`),'#context-actions'],
 ['rest','#rest-panel',p=>onCell(p,`s.points.push({pos:{...L.pos},kind:'rest',used:false});`),'#context-actions'],
 ['shop','#shop-panel',p=>onCell(p,`s.points.push({pos:{...L.pos},kind:'shop',used:false});s.shop={level:s.dungeon.level,stock:{berry:2,tonic:1,tm:'protect'},trades:[]};s.purse=50;`),'#context-actions'],
 ['exchange','#exchange-panel',p=>onCell(p,`s.points.push({pos:{...L.pos},kind:'exchange',used:false});s.exchange={level:s.dungeon.level,used:false,sent:null};`),'#context-actions'],
 ['learn','#learning-choice',p=>onCell(p,`const u=s.units[s.leader];u.learned=['tackle','swordsdance','growl','thunderbolt'];u.pp={tackle:20,swordsdance:5,growl:20,thunderbolt:15};u.maxPp={...u.pp};s.phase='learning';s.pendingLearnMoves=[{actor:s.leader,move:'sleeppowder',pp:15}];`)],
 ['invitation','#invitation-choice',async p=>{await p.evaluate(()=>{const s=window.trial.store.world;const e=s.units.w1a;const k=(x,y)=>x+','+y;
   const adj=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if((dx||dy)&&s.floor.some(f=>f.x===x&&f.y===y)&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===x&&u.pos.y===y))adj.push({x,y});}
   for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if(s.floor.some(f=>f.x===x&&f.y===y)&&!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}
   s.units[s.leader].pos=adj[0];e.hp=1;e.asleep=false;let found=null;for(let r=1;r<400&&found===null;r++){const t=structuredClone(s);t.prog.rng=r;const res=window.trial.applyCommand(t,{type:'round',action:{type:'basic',target:'w1a'}});if(res.ok&&res.state.phase==='invitation')found=r;}
   s.prog.rng=found;window.dispatchEvent(new Event('blur'));window.trial.repaint(s);});
  const pt=await p.evaluate(()=>{const v=window.trial.view().units.w1a,c=window.trial.camera();return {x:v.x-c.x,y:v.y-c.y-20};});await p.mouse.move(pt.x,pt.y);await p.waitForTimeout(150);await p.mouse.click(pt.x,pt.y);}],
 ['abandon','#abandon-dialog',async p=>{await p.locator('#actions-open').click();await p.locator('#abandon-open').click();}],
];
for(const [w,h] of [[1280,720],[900,520]]){
 for(const [name,selector,setup,box] of cases){
  const {ctx,p}=await open(w,h);
  await setup(p);await p.waitForSelector(selector,{state:'visible',timeout:6000});await p.waitForTimeout(350);
  const r=await p.locator(box??selector).first().boundingBox();
  const dx=Math.abs(r.x+r.width/2-w/2);
  assert.ok(dx<=4,`${name} at ${w}x${h}: horizontal centre ${(r.x+r.width/2).toFixed(1)} against ${w/2} (off by ${dx.toFixed(1)})`);
  assert.deepEqual(p.errs,[],name);
  await ctx.close();
 }
}
// the exit prompt belongs to the single-floor scenario (an exit point instead of stairs)
for(const [w,h] of [[1280,720],[900,520]]){
 const {ctx,p}=await open(w,h,'main-none');
 await p.evaluate(()=>{const s=window.trial.store.world,ex=s.points.find(q=>q.kind==='goal');ex.used=true;s.goal=true;s.units[s.leader].pos={...ex.pos};for(const id of s.enemies)s.units[id].waitOnly=true;window.dispatchEvent(new Event('blur'));window.trial.repaint(s);});
 await p.waitForTimeout(300);await p.locator('#take-exit').click();await p.waitForSelector('#exit-prompt',{state:'visible'});await p.waitForTimeout(300);
 const r=await p.locator('#exit-prompt').boundingBox(),dx=Math.abs(r.x+r.width/2-w/2);
 assert.ok(dx<=4,`exit prompt at ${w}x${h}: off by ${dx.toFixed(1)}`);await ctx.close();
}
await b.close();console.log('centre checks passed');
