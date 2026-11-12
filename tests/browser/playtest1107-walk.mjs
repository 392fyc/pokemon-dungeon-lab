/* Playtest round 10 #1: left-click a far, revealed floor cell and the leader walks there, one ordinary round per step. The walk stops on a new enemy in view,
   damage to the party, an item/stairs cell, a blocked route, a key press or another click; an unreachable or unrevealed cell does nothing.
   TRIAL_URL=<server> node tests/browser/playtest1107-walk.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
async function open(query='&anim=on'){
 const ctx=await b.newContext({viewport:{width:1280,height:720}});await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7'+query);await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());await p.waitForTimeout(600);
 return {ctx,p};
}
/** Lays the floor out for a predictable walk: enemies stand still and asleep, the room around the leader is revealed, and a free horizontal row of cells is the route. */
async function layout(p,length){
 return p.evaluate(len=>{
  const s=window.trial.store.world,L=s.units[s.leader],k=(x,y)=>x+','+y,floor=new Set(s.floor.map(f=>k(f.x,f.y)));
  for(const id of s.enemies){s.units[id].waitOnly=true;s.units[id].asleep=true;}
  for(const id of s.queue)if(id!==s.leader)s.units[id].tactic='wait';
  for(let dx=-12;dx<=12;dx++)for(let dy=-12;dy<=12;dy++){const x=L.pos.x+dx,y=L.pos.y+dy;if(floor.has(k(x,y))&&!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}
  const taken=new Set(Object.values(s.units).filter(u=>u.pos&&u.hp>0).map(u=>k(u.pos.x,u.pos.y)));
  let best=null;for(const f of s.floor){let ok=true;for(let i=0;i<=len&&ok;i++)ok=floor.has(k(f.x+i,f.y))&&!taken.has(k(f.x+i,f.y))&&s.seen.includes(k(f.x+i,f.y));if(ok){best=f;break;}}
  if(!best)return null;
  L.pos={x:best.x,y:best.y};window.dispatchEvent(new Event('blur'));window.trial.repaint(s);
  return {from:{x:best.x,y:best.y},to:{x:best.x+len,y:best.y},round:s.round};
 },length);
}
/** `moving`: click straight away, while the camera follows the walking leader (the point of the stop-by-click check). */
async function clickCell(p,pos,moving=false){
 for(let attempt=0;attempt<4;attempt++){
  const view=await p.evaluate(()=>window.trial.view()),g=view.geometry,v=view.cameraView,camera=await p.evaluate(()=>window.trial.camera()),box=await p.locator('canvas').boundingBox();
  const x=(g.ox+(pos.x-g.minX+.5)*g.cell-camera.x)*box.width/v.width,y=(g.oy+(pos.y-g.minY+.5)*g.cell-camera.y)*box.height/v.height;
  assert.ok(x>=0&&x<box.width&&y>=0&&y<box.height,'the cell is inside the viewport');
  if(moving){await p.mouse.click(box.x+x,box.y+y);return;}
  await p.mouse.move(box.x+x,box.y+y);await p.waitForTimeout(120);
  const camera2=await p.evaluate(()=>window.trial.camera());
  if(camera2.x===camera.x&&camera2.y===camera.y){await p.mouse.click(box.x+x,box.y+y);return;}
 }
 assert.fail('camera did not settle');
}
/** Animations off make a step instant, so every round command is followed by a 150 ms pause to leave a real gap between two steps (where a click can land), and `after` runs right after a step's command finished. */
const slowSteps=p=>p.evaluate(()=>{const st=window.trial.store,d=st.dispatch.bind(st);window.__after=null;st.dispatch=async c=>{const r=await d(c);if(c.type==='round'&&window.__after){const f=window.__after;window.__after=null;f();}if(c.type==='round')await new Promise(x=>setTimeout(x,150));return r;};/* the pause comes after the step: the store is ready and idle then, exactly where a click can act */});
const state=p=>p.evaluate(()=>{const s=window.trial.getState(),L=s.units[s.leader];return {round:s.round,pos:{...L.pos},walking:window.trial.walking()};});
const idle=p=>p.waitForFunction(()=>!window.trial.animating()&&!window.trial.walking(),null,{timeout:15000});
// ---- 1. a walk: arrives, one round per step
{
 const {ctx,p}=await open();const t=await layout(p,5);assert.ok(t,'a free row of 6 cells');
 await p.waitForTimeout(300);
 await clickCell(p,t.to);
 await p.waitForFunction(()=>window.trial.walking(),null,{timeout:3000});
 await p.waitForTimeout(450);await p.screenshot({path:out+'r10-walk-mid.png'});
 const mid=await state(p);assert.ok(mid.pos.x>t.from.x&&mid.pos.x<t.to.x,'the leader is on its way: '+JSON.stringify(mid));
 await idle(p);const end=await state(p);
 assert.deepEqual(end.pos,t.to,'arrived at the clicked cell');
 assert.equal(end.round-t.round,5,'one ordinary round per step (enemies act each round)');
 assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- 2. a key press and a second click stop the walk
for(const how of ['key','click']){
 const {ctx,p}=await open();const t=await layout(p,6);await p.waitForTimeout(300);
 await clickCell(p,t.to);await p.waitForFunction(()=>window.trial.walking(),null,{timeout:3000});await p.waitForTimeout(300);
 if(how==='key')await p.keyboard.press('x');else await clickCell(p,{x:t.from.x,y:t.from.y},true);
 await idle(p);await p.waitForTimeout(500);const end=await state(p);
 assert.ok(end.pos.x<t.to.x,how+' stops the walk before the target: '+JSON.stringify(end));assert.ok(end.pos.x>t.from.x,'but it had started');
 assert.equal(end.walking,false);assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- 3. damage to the party stops it
{
 const {ctx,p}=await open();const t=await layout(p,6);
 await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader];L.hp=L.maxHp=60;L.status={psn:{tick:1,left:9}};window.trial.repaint(s);});
 await p.waitForTimeout(300);await clickCell(p,t.to);await idle(p);const end=await state(p);
 assert.equal(end.pos.x,t.from.x+1,'poison hurt the leader after the first step: the walk stopped there: '+JSON.stringify(end));assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- 4. an item cell on the only route: the walk stops on it
{
 const {ctx,p}=await open();const t=await layout(p,6);
 await p.evaluate(({from})=>{const s=window.trial.store.world;
  s.floor=s.floor.filter(f=>f.y===from.y||Math.abs(f.y-from.y)>6||Math.abs(f.x-from.x)>12);   // a one-cell-wide corridor: no way around
  s.points.push({pos:{x:from.x+3,y:from.y},kind:'berry',used:false});window.trial.repaint(s);},t);
 await p.waitForTimeout(300);await clickCell(p,t.to);await idle(p);const end=await state(p);
 assert.deepEqual(end.pos,{x:t.from.x+3,y:t.from.y},'stopped on the item cell: '+JSON.stringify(end));assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- 5. unreachable and unrevealed cells do nothing
{
 const {ctx,p}=await open();await layout(p,3);await p.waitForTimeout(300);
 const wall=await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader],floor=new Set(s.floor.map(f=>f.x+','+f.y));for(let d=2;d<5;d++)for(const [dx,dy] of [[0,-d],[0,d],[-d,0],[d,0]]){const x=L.pos.x+dx,y=L.pos.y+dy;if(!floor.has(x+','+y)&&x>=0&&y>=0&&x<s.dungeon.width&&y<s.dungeon.height)return {x,y};}return null;});
 assert.ok(wall,'a wall cell some cells away');
 const before=await state(p);await clickCell(p,wall);await p.waitForTimeout(500);
 const after=await state(p);assert.equal(after.round,before.round,'a wall cell: nothing happens');assert.equal(after.walking,false);
 assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- 6. a new enemy coming into view stops the walk
{
 const {ctx,p}=await open();const t=await layout(p,7);
 // every enemy far from the leader (out of sight), then one steps into view while the leader is on its way
 await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader],k=(x,y)=>x+','+y,taken=new Set(Object.values(s.units).filter(u=>u.pos).map(u=>k(u.pos.x,u.pos.y)));
  const far=s.floor.filter(f=>!taken.has(k(f.x,f.y))).sort((a,b)=>Math.max(Math.abs(b.x-L.pos.x),Math.abs(b.y-L.pos.y))-Math.max(Math.abs(a.x-L.pos.x),Math.abs(a.y-L.pos.y)));
  s.enemies.forEach((id,i)=>{s.units[id].pos={x:far[i].x,y:far[i].y};});window.trial.repaint(s);});
 await p.waitForTimeout(300);await clickCell(p,t.to);await p.waitForFunction(()=>window.trial.walking(),null,{timeout:3000});
 await p.waitForFunction(({x})=>window.trial.getState().units[window.trial.getState().leader].pos.x>x,t.from,{timeout:4000});
 const placed=await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader],k=(x,y)=>x+','+y,floor=new Set(s.floor.map(f=>k(f.x,f.y))),taken=new Set(Object.values(s.units).filter(u=>u.pos).map(u=>k(u.pos.x,u.pos.y)));
  const spot=[[1,1],[1,-1],[0,1],[0,-1]].map(([dx,dy])=>({x:L.pos.x+dx,y:L.pos.y+dy})).find(c=>floor.has(k(c.x,c.y))&&!taken.has(k(c.x,c.y)));if(!spot)return null;
  s.units[s.enemies[0]].pos=spot;return spot;});
 assert.ok(placed,'a free cell beside the leader for the newcomer');
 await idle(p);const end=await state(p);assert.ok(end.pos.x<t.to.x,'the walk stopped when the enemy came into view: '+JSON.stringify(end));assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- 7. a blocked route stops the walk (an enemy takes a corridor cell ahead)
{
 const {ctx,p}=await open();const t=await layout(p,7);
 await p.evaluate(({from})=>{const s=window.trial.store.world;s.floor=s.floor.filter(f=>f.y===from.y||Math.abs(f.y-from.y)>6||Math.abs(f.x-from.x)>12);window.trial.repaint(s);},t);
 await p.waitForTimeout(300);await clickCell(p,t.to);await p.waitForFunction(()=>window.trial.walking(),null,{timeout:3000});
 await p.evaluate(({from})=>{const s=window.trial.store.world;const e=s.units[s.enemies[0]];e.pos={x:from.x+5,y:from.y};e.waitOnly=true;e.asleep=true;},t);
 await idle(p);const end=await state(p);assert.ok(end.pos.x<t.from.x+5,'stopped before the enemy on the route: '+JSON.stringify(end));assert.ok(end.pos.x>t.from.x);assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- 8. onto the stairs: the walk stops there and the question appears
{
 const {ctx,p}=await open();const t=await layout(p,6);
 await p.evaluate(({from})=>{const s=window.trial.store.world;s.floor=s.floor.filter(f=>f.y===from.y||Math.abs(f.y-from.y)>6||Math.abs(f.x-from.x)>12);
  s.points.push({pos:{x:from.x+3,y:from.y},kind:'down',used:false});window.trial.repaint(s);},t);
 await p.waitForTimeout(300);await clickCell(p,t.to);await idle(p);const end=await state(p);
 assert.deepEqual(end.pos,{x:t.from.x+3,y:t.from.y},'stopped on the stairs: '+JSON.stringify(end));
 await p.waitForSelector('#stairs-prompt',{timeout:4000});assert.equal(await p.locator('#stairs-prompt').count(),1,'the descend question is shown');
 assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- 9. a confused leader does not start a walk, and one who becomes confused on the way stops
{
 const {ctx,p}=await open();const t=await layout(p,6);
 await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader];L.status={confusion:{left:9}};window.trial.repaint(s);window.trial.render();});
 await p.waitForTimeout(300);await clickCell(p,t.to);await p.waitForTimeout(600);
 const none=await state(p);assert.equal(none.round,t.round,'confused: no step is taken');assert.equal(none.walking,false);
 await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader];L.status={};window.trial.render();});
 await clickCell(p,t.to);await p.waitForFunction(()=>window.trial.walking(),null,{timeout:3000});
 await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader];L.status={confusion:{left:9}};});
 await idle(p);const end=await state(p);assert.ok(end.pos.x<t.to.x,'confusion mid-walk stops it: '+JSON.stringify(end));assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- 9b. confusion that appears between two steps stops the walk before the next one (only the pre-step check can do that: the step before it landed where planned)
{
 const {ctx,p}=await open('&anim=off');const t=await layout(p,7);await slowSteps(p);await p.waitForTimeout(300);
 await p.evaluate(()=>{window.__after=()=>{const s=window.trial.store.world,L=s.units[s.leader];L.status={confusion:{left:9}};};});   // armed: fires after the first step
 await clickCell(p,t.to);await p.waitForFunction(()=>!window.trial.walking(),null,{timeout:6000});await p.waitForTimeout(500);
 const end=await state(p);assert.equal(end.pos.x,t.from.x+1,'one step, then confusion: no second step is taken: '+JSON.stringify(end));assert.equal(end.round-t.round,1);assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- 10. the click that stops a walk does nothing else (no step back into the cell it hit). Animations are off and each step takes 150 ms, so the click lands between two steps, where a plain click would act.
{
 const {ctx,p}=await open('&anim=off');const t=await layout(p,7);await slowSteps(p);await p.waitForTimeout(300);
 await clickCell(p,t.to);await p.waitForFunction(()=>window.trial.walking(),null,{timeout:3000});
 await p.waitForFunction(({x})=>window.trial.getState().units[window.trial.getState().leader].pos.x>=x+2,t.from,{timeout:4000});
 const at=await state(p);await clickCell(p,{x:at.pos.x-1,y:at.pos.y},true);   // the cell right behind the leader: a plain click would step back
 await p.waitForTimeout(900);const end=await state(p);
 assert.equal(end.walking,false);assert.ok(end.pos.x>=at.pos.x&&end.pos.x<=at.pos.x+1,'no step back, and the walk is over: '+JSON.stringify({at,end}));
 assert.equal(end.round-t.round,end.pos.x-t.from.x,'every round taken was a step forward of the walk (the click acted on nothing)');
 assert.deepEqual(p.errs,[]);await ctx.close();
}
await b.close();console.log('playtest1107-walk ok');
