import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createExpedition,applyCommand,reveal,key} from '../../src/core/engine.ts';
import {initialProfile,squadOf} from '../../src/core/base.ts';

export async function review360FloorChecks({setup,startMemory,state,ready,viaStairs,artifact}){
 const {context,page:p,errors}=await setup(undefined,'pass',false,'dtef');
 const report={seed:357,fixtureBoundary:'Real generated enemies and real engine wait/reveal/transit; party placed at stairs for the focused crossing; real browser stair buttons, not a full natural route.',phase:process.env.REVIEW360_PHASE??'candidate'};
 try{
  await p.setViewportSize({width:1280,height:720});
  let w=createExpedition('review360-floor',357,3,squadOf(initialProfile()),0,true,3);
  const waited=applyCommand(w,{type:'round',action:{type:'wait'}});assert.equal(waited.ok,true);w=waited.state;
  const down=w.points.find(point=>point.kind==='down'),blocked=new Set(w.enemies.map(id=>w.units[id]).filter(u=>u.hp>0&&u.pos).map(u=>key(u.pos)));
  assert.ok(down);assert.ok(!blocked.has(key(down.pos)));
  const occupied=new Set([key(down.pos)]);w.units[w.leader].pos={...down.pos};
  for(const id of w.queue){w.units[id].tactic='wait';if(id===w.leader)continue;const at=w.floor.find(q=>Math.max(Math.abs(q.x-down.pos.x),Math.abs(q.y-down.pos.y))<=1&&!blocked.has(key(q))&&!occupied.has(key(q)));assert.ok(at);w.units[id].pos={...at};occupied.add(key(at));}
  reveal(w);const oldIds=[...w.enemies],unseen=oldIds.filter(id=>!w.seen.includes(key(w.units[id].pos)));
  assert.ok(oldIds.length>0&&unseen.length>0,'real enemies include unseen actors before crossing');
  await startMemory(p,w);await p.screenshot({path:artifact+'review360-floor-before.png'});
  await viaStairs(p);await p.waitForFunction(()=>window.trial.getState()?.dungeon?.level===2);await ready(p);
  const after=await state(p),retired=oldIds.filter(id=>!after.units[id]);assert.equal(retired.length,oldIds.length);assert.ok(after.enemies.length>0);
  const retained=after.log.filter(t=>retired.some(id=>t.startsWith(id)));assert.ok(retained.length>0,'the original log really retains removed enemy rows');
  assert.ok(retained.some(t=>unseen.some(id=>t.startsWith(id))&&/移动到/.test(t)),'retained raw rows include unseen enemy coordinates');
  const shown=await p.locator('#recent-events,#history,#message').allTextContents();
  Object.assign(report,{oldEnemyIds:oldIds,unseenEnemyIds:unseen,newEnemyIds:after.enemies,retiredEnemyRows:retained,shownAfterCrossing:shown,rawLogAfterCrossing:after.log});
  await p.screenshot({path:artifact+'review360-floor-after.png'});fs.writeFileSync(artifact+'review360-floor-results.json',JSON.stringify(report,null,2));
  for(const id of retired)assert.ok(shown.every(text=>!text.includes(id)),'removed enemy ID stays out of browser messages: '+id+' '+JSON.stringify(shown));
  assert.ok(shown.every(text=>!/移动到-?\d+,-?\d+/.test(text)),'ordinary movement coordinates stay hidden after crossing');
  assert.ok(shown.some(text=>text.includes('同行抵达第2层')));
  const format=structuredClone(w),actor=format.leader;format.runId='review360-formats';format.log=[actor+'无路可走，等待',actor+'动作失效，等待，未扣PP',actor+'向13,8挥空'];
  await p.reload();await p.locator('#start').waitFor();await startMemory(p,format);
  const formatted=await p.locator('#recent-events,#history,#message').allTextContents();assert.ok(formatted.every(text=>!text.includes('无路可走，等待')));assert.ok(formatted.some(text=>text.includes('动作失效，等待，未扣PP')));assert.ok(formatted.some(text=>text.includes('向13,8挥空')),'air-swing coordinates remain outside this change');assert.deepEqual((await state(p)).log,format.log);
  await p.screenshot({path:artifact+'review360-wait-filter.png'});report.formatFixture={raw:format.log,shown:formatted};report.pageErrors=errors;assert.deepEqual(errors,[]);fs.writeFileSync(artifact+'review360-floor-results.json',JSON.stringify(report,null,2));return report;
 }finally{await context.close();}
}
