/* #213: while a round's animation plays, the small map shows the same unit positions as the board (it used to jump to the end-of-round cells at once), and afterwards it shows the end state.
   TRIAL_URL=<server> node tests/browser/playtest1107-minimap-sync.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const ctx=await b.newContext({viewport:{width:1280,height:720}});
await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;});   // animations stay ON
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(base+'/?dev=1&seed=7&anim=on');
await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());
await p.keyboard.press('Escape');
// quiet floor: enemies stand still and asleep, the party follows nobody
await p.evaluate(()=>{const s=window.trial.store.world;for(const id of s.enemies){s.units[id].waitOnly=true;s.units[id].asleep=true;}for(const id of s.queue)if(id!==s.leader)s.units[id].tactic='wait';window.dispatchEvent(new Event('blur'));});
await p.waitForTimeout(500);
/** The leader's cell on the board (from its sprite) and on the small map (its big circle), in cell units. */
const sample=()=>p.evaluate(()=>{
 const v=window.trial.view(),s=window.trial.getState(),g=v.geometry,u=v.units[s.leader];
 const board={x:(u.x-g.ox)/g.cell+g.minX-.5,y:(u.ground.centerY-g.oy)/g.cell+g.minY-.5};   // the cell centre, not the sprite's foot offset
 const c=document.querySelector('#hud-map .hud-map-unit.is-leader');
 const map=c?{x:Number(c.getAttribute('cx'))-.5,y:Number(c.getAttribute('cy'))-.5}:null;
 return {animating:window.trial.animating(),board,map,final:s.units[s.leader].pos};
});
let midWalk=0,total=0;
for(const key of ['d','s','a','w','d','s']){
 const start=await p.evaluate(()=>{const s=window.trial.getState();return {...s.units[s.leader].pos};});
 await p.keyboard.press(key);
 const rows=[];
 for(let i=0;i<60;i++){const r=await sample();if(!r.animating&&rows.length)break;if(r.animating)rows.push(r);await p.waitForTimeout(8);}
 if(!rows.length)continue;
 for(const r of rows){
  total++;assert.ok(r.map,'the leader is on the small map');
  assert.ok(Math.abs(r.map.x-Math.round(r.board.x))<1e-6&&Math.abs(r.map.y-Math.round(r.board.y))<1e-6,`small map ${JSON.stringify(r.map)} follows the board ${JSON.stringify(r.board)}`);
  if(r.map.x===start.x&&r.map.y===start.y&&(r.final.x!==start.x||r.final.y!==start.y))midWalk++;
 }
 await p.waitForFunction(()=>!window.trial.animating(),null,{timeout:8000});await p.waitForTimeout(100);
 const after=await sample();
 assert.deepEqual(after.map,after.final?{x:after.final.x,y:after.final.y}:null,'after the animation the small map shows the end state');
}
assert.ok(total>=10,'enough animation frames were sampled: '+total);
assert.ok(midWalk>=1,'at least one frame had the leader still on its starting cell while the end state was already one cell away: '+midWalk);
assert.deepEqual(errs,[]);await b.close();console.log('minimap sync checks passed ('+total+' frames, '+midWalk+' before the step lands)');
