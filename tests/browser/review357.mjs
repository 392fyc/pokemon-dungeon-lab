import assert from 'node:assert/strict';
import {createExpedition} from '../../src/core/engine.ts';
import {initialProfile,squadOf} from '../../src/core/base.ts';

export async function review357Checks({setup,startMemory,state,ready,artifact}){
 const {context,page:p,errors}=await setup(undefined,'pass',true,'dtef');
 try{
  await p.setViewportSize({width:1280,height:720});
  const w=createExpedition('hud357',357,3,squadOf(initialProfile()),0,true,3);
  const room=w.rooms.find(r=>{const at=w.units[w.leader].pos;return at.x>=r.x&&at.x<r.x+r.w&&at.y>=r.y&&at.y<r.y+r.h;});
  assert.ok(room&&room.w>=3&&room.h>=3);
  w.enemies=[];w.points=[];w.adventureRooms=[];w.log=[];
  const origin={x:room.x+1,y:room.y+1},places=[origin,{x:origin.x+1,y:origin.y},{x:origin.x,y:origin.y+1}];
  for(const [i,id] of w.queue.entries()){w.units[id].pos=places[i];w.units[id].tactic='wait';}
  const lead=w.units[w.leader],emptyMove=lead.learned[0],readyMove=lead.learned.find(k=>k!==emptyMove&&(lead.pp[k]??0)>0);
  assert.ok(emptyMove&&readyMove,'the fixture has a zero-PP and a usable move');lead.pp[emptyMove]=0;
  await startMemory(p,w);
  const events=async()=>({latest:(await p.locator('#recent-events li').allTextContents()).at(-1)?.trim(),history:await p.locator('#history').textContent(),notice:await p.locator('#message').textContent()});
  assert.equal((await events()).latest,'还没有事件。');
  await p.keyboard.press('f');await p.waitForFunction(()=>!window.trial.animating());await ready(p);
  const meaningful=(await events()).latest;assert.ok(meaningful&&meaningful!=='还没有事件。');
  const assertMeaningful=async()=>{const shown=await events();assert.equal(shown.latest,meaningful,'routine actions keep the previous meaningful event');for(const text of Object.values(shown))assert.doesNotMatch(text??'',/移动到-?\d+,-?\d+|与.+换位|等待/,'routine rows stay out of both message displays');return shown;};
  const styles=()=>p.evaluate(()=>{
   const style=el=>{const s=getComputedStyle(el);return {opacity:s.opacity,filter:s.filter,background:s.backgroundColor,color:s.color};};
   return {party:Array.from(document.querySelectorAll('[data-hud-leader]')).map(el=>({id:el.dataset.hudLeader,disabled:el.disabled,locked:el.hasAttribute('data-animation-locked'),style:style(el),card:style(el.closest('.hud-party-card'))})),skills:Array.from(document.querySelectorAll('[data-hud-skill]')).map(el=>({id:el.dataset.hudSkill,disabled:el.disabled,locked:el.hasAttribute('data-animation-locked'),style:style(el)}))};
  });
  await p.mouse.move(800,220);const before=await styles(),beforeWorld=await state(p);
  assert.equal(before.skills.find(r=>r.id===emptyMove).disabled,true);assert.ok(Number(before.skills.find(r=>r.id===emptyMove).style.opacity)<1);
  assert.equal(before.skills.find(r=>r.id===readyMove).disabled,false);
  await p.screenshot({path:artifact+'review357-hud-ready.png'});
  await p.clock.pauseAt(await p.evaluate(()=>Date.now()+1000));await p.keyboard.press('w');await p.clock.runFor(70);
  assert.equal(await p.evaluate(()=>window.trial.animating()),true);assert.match(await p.evaluate(()=>window.trial.view().leader.animation),/-Walk-/);
  const moving=await styles(),movingWorld=await state(p);assert.equal(movingWorld.round,beforeWorld.round+1);assert.equal(movingWorld.leader,beforeWorld.leader);
  for(const row of moving.party){const old=before.party.find(v=>v.id===row.id);assert.equal(row.disabled,true);assert.equal(row.locked,true);assert.deepEqual(row.style,old.style,'moving party brightness is unchanged');assert.deepEqual(row.card,old.card);}
  for(const row of moving.skills){const old=before.skills.find(v=>v.id===row.id);assert.equal(row.disabled,true);assert.equal(row.locked,!old.disabled);assert.deepEqual(row.style,old.style,'moving skill brightness preserves real availability');}
  await assertMeaningful();
  await p.screenshot({path:artifact+'review357-hud-moving.png'});await p.locator('#party').screenshot({path:artifact+'review357-party-moving.png'});await p.locator('#hud-bottom').screenshot({path:artifact+'review357-skills-moving.png'});
  await p.locator('[data-hud-leader="'+w.queue[1]+'"]').click({force:true});await p.keyboard.press('2');
  assert.equal((await state(p)).round,movingWorld.round,'real input during playback adds no action');assert.equal((await state(p)).leader,movingWorld.leader,'disabled party input cannot switch the leader');assert.deepEqual((await state(p)).units[movingWorld.leader].pp,movingWorld.units[movingWorld.leader].pp);assert.equal(await p.locator('[data-hud-skill="'+readyMove+'"]').getAttribute('aria-pressed'),'false','skill selection is also locked during playback');
  await p.clock.resume();await p.waitForFunction(()=>!window.trial.animating());await ready(p);
  assert.equal((await styles()).skills.find(r=>r.id===readyMove).disabled,false);assert.equal((await styles()).skills.find(r=>r.id===emptyMove).disabled,true);
  for(const key of ['s','d','.']){const old=await state(p);await p.keyboard.press(key);await p.waitForFunction(()=>!window.trial.animating());await ready(p);assert.equal((await state(p)).round,old.round+1);await assertMeaningful();}
  const afterActions=await state(p);assert.ok(afterActions.log.some(t=>/移动到-?\d+,-?\d+/.test(t)));assert.ok(afterActions.log.some(t=>/与.+换位$/.test(t)));assert.ok(afterActions.log.some(t=>/等待$/.test(t)),'the engine still retains routine rows');
  const rawAtRollover=await p.evaluate(async()=>{for(let i=0;i<40;i++){const result=await window.trial.store.dispatch({type:'round',action:{type:'wait'}});if(!result.ok)throw Error(result.error);}return [...window.trial.getState().log];});
  assert.ok(rawAtRollover.length<=80);assert.ok(rawAtRollover.every(t=>/等待$/.test(t)),'the meaningful event has left the capped engine log');
  await p.evaluate(()=>window.dispatchEvent(new Event('blur')));await ready(p);assert.deepEqual((await state(p)).log,rawAtRollover,'display filtering never mutates the world log');const afterRollover=await assertMeaningful();
  await p.screenshot({path:artifact+'review357-message-rollover.png'});
  await p.evaluate(async profile=>{if(!await window.trial.store.beginNewGame(profile,true))throw Error('new game was rejected');if(!await window.trial.store.depart('hud357-new',357,0))throw Error('new departure was rejected');window.dispatchEvent(new Event('blur'));},initialProfile());await ready(p);assert.equal((await state(p)).runId,'hud357-new');assert.equal((await events()).latest,'还没有事件。','a new run does not inherit the previous message');assert.equal((await events()).history,'');
  assert.deepEqual(errors,[]);return {before,moving,meaningful,afterRollover,engineRoutineRowsRetained:true,rolloverRows:rawAtRollover.length,inputLocked:true,ppUnavailableStaysDim:true,newRunReset:true};
 }finally{await context.close();}
}
