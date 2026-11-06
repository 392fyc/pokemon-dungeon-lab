import assert from 'node:assert/strict';
import fs from 'node:fs';
import {moveOf} from '../../src/core/moves.ts';
import {createScenario} from '../../src/core/scenarios.ts';
import {applyCommand,friend,enemy,key} from '../../src/core/engine.ts';

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
   await p.locator('[data-hud-skill="'+move+'"]').click();
   await cell(p,w.units[target].pos.x,w.units[target].pos.y);
   assert.equal(await p.evaluate(()=>window.trial.animating()),true,move+' begins an actual animation');
   await p.clock.runFor(80);
   const started=await p.evaluate(()=>window.trial.view());
   assert.ok(started.combatEffects.some(effect=>effect.template===template&&effect.move===move),move+' starts the chosen template within 100ms: '+JSON.stringify(started.combatEffects));
   await p.clock.runFor(80);
   const middle=await p.evaluate(()=>window.trial.view());
   await p.screenshot({path:artifact+'fx194-'+template+'-'+move+'.png'});
   const round=(await state(p)).round;await p.keyboard.press('.');
   assert.equal((await state(p)).round,round,'input during '+move+' does not advance a second round');
   await p.clock.runFor(160);
   await p.screenshot({path:artifact+'fx194-'+template+'-'+move+'-impact.png'});
   await p.clock.runFor(230);
   assert.equal(await p.evaluate(()=>window.trial.animating()),false,move+' completes within the 500ms budget plus one render frame');
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
  const cancelWorld=effectFixture('aurorabeam','beam');
  await p.reload();await p.locator('#start').waitFor();
  await startMemory(p,cancelWorld);assert.equal((await state(p)).runId,cancelWorld.runId);await p.clock.pauseAt(await p.evaluate(()=>Date.now()+100));
  await p.locator('[data-hud-skill="aurorabeam"]').click();await cell(p,7,4);await p.clock.runFor(80);
  assert.equal(await p.evaluate(()=>window.trial.animating()),true,'the cancellation starts during a real beam');
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
