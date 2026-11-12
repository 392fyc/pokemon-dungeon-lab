import assert from 'node:assert/strict';
import fs from 'node:fs';
import {moveOf} from '../../src/core/moves.ts';
import {createScenario} from '../../src/core/scenarios.ts';
import {applyCommand,friend,enemy,key} from '../../src/core/engine.ts';
import {newLines} from '../../src/render/animation.ts';

const CASES=[
 ['pound','melee'],['ember','special'],['gunkshot','shot'],['aurorabeam','beam'],
 ['thunderbolt','around'],['blizzard','room'],['swordsdance','up'],['growl','down'],
 ['toxic','status'],['synthesis','heal'],['softboiled','heal'],['protect','guard'],['whirlwind','blow'],
];
/** Display fixtures change placement, HP and loadouts only; each action is executed by the shipped engine and real UI. */
export function effectFixture(move,template){
 const w=createScenario('K1','fx194-'+move);
 w.floor=Array.from({length:12*7},(_,i)=>({x:i%12+1,y:Math.floor(i/12)+1}));
 w.rooms=[{x:1,y:1,w:12,h:7}];w.seen=w.floor.filter(p=>template!=='room'||p.x<12).map(key);
 w.units={A:friend('A',4,4,40,{[move]:5}),H:enemy('H',5,4,80,'ranged',0)};
 w.units.A.maxHp=80;w.units.A.maxPp[move]=5;w.units.A.stages.acc=3;w.units.A.tactic='wait';
 w.units.H.maxHp=w.units.H.hp=80;w.units.H.waitOnly=true;
 w.queue=['A'];w.enemies=['H'];w.camp=[];w.leader='A';w.phase='playing';w.log=[];
 if(template==='shot'||template==='beam')w.units.H.pos={x:7,y:4};
 if(template==='around'||template==='room'||template==='down')for(const [id,y] of [['J',3],['K',5]]){
  w.units[id]=enemy(id,5,y,80,'ranged',0);w.units[id].maxHp=w.units[id].hp=80;w.units[id].waitOnly=true;w.enemies.push(id);
 }
 if(move==='softboiled')for(const [id,y] of [['B',3],['C',5]]){
  w.units[id]=friend(id,2,y,20,{tackle:2});w.units[id].maxHp=60;w.units[id].tactic='wait';w.queue.push(id);
 }
 return w;
}
const HIT_SHOT={melee:160,special:280,shot:260,beam:260,around:260,room:160,blow:190};
export async function fx194Checks({setup,startMemory,ready,state,cell,artifact}){
 const {context,page:p,errors}=await setup(undefined,'pass',true,'dtef');
 const report={fixtureBoundary:'Fixed developer display fixtures with real move definitions, controlled loadouts/HP/placement and waiting enemies; real HUD selection and canvas command; no natural-route or balance claim.',cases:[]};
 try{
  await p.setViewportSize({width:1280,height:720});
  for(const [move,template] of CASES){
   const w=effectFixture(move,template);
   await p.reload();await p.locator('#start').waitFor();
   await startMemory(p,w);assert.equal((await state(p)).runId,w.runId);await p.clock.pauseAt(await p.evaluate(()=>Date.now()+100));
   const self=['room','user'].includes(moveOf(move).range),target=self?'A':'H';
   const command={type:'round',action:{type:'skill',skill:move,target}};
   const expected=applyCommand(w,command);assert.equal(expected.ok,true,expected.error);
   const logBefore=(await state(p)).log;
   await p.locator('[data-hud-skill="'+move+'"]').click();
   await cell(p,w.units[target].pos.x,w.units[target].pos.y);
   assert.equal(await p.evaluate(()=>window.trial.animating()),true,move+' begins an actual animation');
   await p.clock.runFor(80);
   const started=await p.evaluate(()=>window.trial.view());
   assert.ok(started.combatEffects.some(effect=>effect.template===template&&effect.move===move),move+' starts the chosen template within 100ms: '+JSON.stringify(started.combatEffects));
   if(template==='room'){
    const cells=started.combatEffects.find(effect=>effect.template==='room').cells;
    assert.equal(cells.length,77,'the blizzard covers the caster room 1..11 x 1..7 and nothing else: '+cells.length);
    assert.ok(cells.every(keyText=>Number(keyText.split(',')[0])<12),'the unrevealed column x=12 is outside the effect whitelist');
    assert.ok(cells.every(keyText=>w.seen.includes(keyText)),'every whitelist cell is revealed');
   }
   await p.clock.runFor(40);
   const middle=await p.evaluate(()=>window.trial.view());
   await p.screenshot({path:artifact+'fx194-'+template+'-'+move+'.png'});
   const round=(await state(p)).round;await p.keyboard.press('.');
   assert.equal((await state(p)).round,round,'input during '+move+' does not advance a second round');
   const heavy=started.combatEffects.some(effect=>effect.superEffective);let shifted=false,elapsed=120;
   const hitAt=HIT_SHOT[template]??240;
   while(elapsed<hitAt){await p.clock.runFor(10);elapsed+=10;if(heavy&&await p.evaluate(()=>{const c=window.trial.view().cameraPosition;return c.x!==0||c.y!==0;}))shifted=true;}
   await p.screenshot({path:artifact+'fx194-'+template+'-'+move+'-impact.png'});
   // A poison or burn tick at the end of the round is its own short step now (the HP moves when it happens), so the round may last one such step longer.
   const fresh=newLines(logBefore,(await state(p)).log);   // only the lines this round wrote
   const tick=fresh.some(line=>/因.+损失\d+HP/.test(line)),words=fresh.some(line=>/阶段变为|陷入.+状态/.test(line)),limit=(tick?830:560)+(words?700:0);   // a stage or status change adds the short word step (round 10) at the end
   while(elapsed<limit){await p.clock.runFor(10);elapsed+=10;if(heavy&&await p.evaluate(()=>{const c=window.trial.view().cameraPosition;return c.x!==0||c.y!==0;}))shifted=true;}
   if(heavy)assert.equal(shifted,true,move+' is super effective, so the main camera shakes');
   assert.deepEqual(await p.evaluate(()=>window.trial.view().cameraPosition),{x:0,y:0},'the camera is back in place after '+move);
   assert.equal(await p.evaluate(()=>window.trial.animating()),false,move+' completes within the 500ms budget plus one render frame'+(tick?' and the 240ms status-damage step':'')+(words?' and the 560ms stage/status word step':''));
   await p.clock.resume();
   await p.waitForFunction(()=>!window.trial.animating(),null,{timeout:5000});await ready(p);
   const after=await state(p),finished=await p.evaluate(()=>window.trial.view());
   assert.deepEqual(after,expected.state,'presentation preserves the exact engine result for '+move);
   assert.equal(finished.temporaryObjects,0,'all temporary effects are destroyed after '+move);
   assert.deepEqual(finished.combatEffects,[],'no particle metadata survives '+move);
   assert.ok(Object.values(finished.units).every(unit=>!unit.whiteFlash),'all white tints clear after '+move);
   const hpDeltas=Object.fromEntries(Object.keys(w.units).map(id=>[id,after.units[id].hp-w.units[id].hp]));
   report.cases.push({move,template,effects:started.combatEffects,middle:middle.combatEffects,hpDeltas,ppBefore:5,ppAfter:after.units.A.pp[move],round:after.round,temporaryObjects:finished.temporaryObjects});
   assert.equal(after.units.A.pp[move],4,'the real move spends exactly one PP');
  }
  {
   const corridor=effectFixture('blizzard','room');corridor.rooms=[];corridor.seen=corridor.floor.map(key);
   await p.reload();await p.locator('#start').waitFor();
   await startMemory(p,corridor);await p.clock.pauseAt(await p.evaluate(()=>Date.now()+100));
   await p.locator('[data-hud-skill="blizzard"]').click();await cell(p,4,4);await p.clock.runFor(80);
   const cells=(await p.evaluate(()=>window.trial.view())).combatEffects.find(effect=>effect.template==='room').cells;
   assert.equal(cells.length,25,'outside any room the blizzard reaches only the 2-cell neighbourhood: '+cells.length);
   assert.ok(cells.every(keyText=>{const [x,y]=keyText.split(',').map(Number);return Math.abs(x-4)<=2&&Math.abs(y-4)<=2;}));
   await p.clock.resume();await p.waitForFunction(()=>!window.trial.animating(),null,{timeout:5000});await ready(p);
   report.corridorRoomCells=cells.length;
  }
  const cancelWorld=effectFixture('aurorabeam','beam');
  await p.reload();await p.locator('#start').waitFor();
  await startMemory(p,cancelWorld);assert.equal((await state(p)).runId,cancelWorld.runId);await p.clock.pauseAt(await p.evaluate(()=>Date.now()+100));
  await p.locator('[data-hud-skill="aurorabeam"]').click();await cell(p,7,4);await p.clock.runFor(80);
  assert.equal(await p.evaluate(()=>window.trial.animating()),true,'the cancellation starts during a real beam');
  // Press Shift only after the white hit flash is on, so the skip has something to clear.
  let flashed=false;
  for(let waited=0;waited<400&&!flashed;waited+=10){await p.clock.runFor(10);flashed=await p.evaluate(()=>Object.values(window.trial.view().units).some(unit=>unit&&unit.whiteFlash));}
  assert.equal(flashed,true,'the beam has hit and the target is flashing white');
  const committed=await state(p);await p.keyboard.press('Shift');
  await p.evaluate(()=>Promise.resolve());
  assert.equal(await p.evaluate(()=>window.trial.animating()),false,'Shift releases the presentation input lock');
  assert.equal(await p.evaluate(()=>window.trial.view().temporaryObjects),0,'Shift destroys every temporary effect');
  assert.ok(await p.evaluate(()=>Object.values(window.trial.view().units).every(unit=>!unit.whiteFlash)),'Shift clears any unit flash tint');
  await p.clock.runFor(1000);await p.clock.resume();
  assert.deepEqual(await state(p),committed,'skipping presentation does not execute or revert any rule action');
  assert.deepEqual(await p.evaluate(()=>window.trial.view().combatEffects),[],'cancelled particles cannot reappear on a later frame');
  report.skip={inputLockReleased:true,temporaryObjects:0,worldPreserved:true};
  assert.deepEqual(errors,[]);report.pageErrors=errors;
  fs.writeFileSync(artifact+'fx194-results.json',JSON.stringify(report,null,2));return report;
 }finally{await context.close();}
}
