/* Round 14 review fixes: the replay of a Reviver Seed answering poison, and of a Rollcall Orb that moves companions. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createMain,friend as engineFriend,key} from '../../src/core/engine.ts';
import {inferEvents} from '../../src/render/animation.ts';
import {pos} from '../acceptance/fixtures.mjs';
import {foeOf} from './foe-fixture.mjs';
import {sureHit} from './sure-hit.mjs';

const row=Array.from({length:10},(_,x)=>pos(x,1));
function scene(extra){
  const s=createMain('round14-review',false);
  const a=engineFriend('A',2,1,30,{tackle:5}),b=engineFriend('B',6,1,30,{tackle:5});a.species='treecko';b.species='treecko';a.maxHp=b.maxHp=30;
  const e=foeOf('E','rattata',9,1,40,{tackle:5});e.waitOnly=true;e.asleep=true;
  s.floor=row;s.seen=row.map(key);s.queue=['A','B'];s.enemies=['E'];s.leader='A';s.points=[];s.log=[];s.rooms=[{x:0,y:0,w:10,h:3}];
  s.units={A:a,B:b,E:e};a.tactic=b.tactic='wait';
  s.prog={level:5,exp:0,rng:5,made:0,kills:[],items:{berry:0,tonic:0,reviverSeed:0,rollcallOrb:0}};
  extra(s);return sureHit(s);
}
const run=(s,action)=>{const cmd={type:'round',action},r=applyCommand(s,cmd);assert.equal(r.ok,true,r.error);return {cmd,after:r.state,events:inferEvents(s,r.state,cmd)};};

test('B: poison that kills a member holding a Reviver Seed shows the restored HP on the bar, not 0, in the replay',()=>{
  const s=scene(w=>{w.units.A.hp=1;w.units.A.status={psn:{tick:1}};w.prog.items.reviverSeed=1;});
  const {after,events}=run(s,{type:'wait'});
  const loss=after.events.find(e=>e.type==='hpLoss'&&e.unit==='A'&&e.cause);
  assert.ok(loss&&loss.hp===0&&loss.revive>0,'the engine records the poison death and the seed: '+JSON.stringify(after.events));
  const change=events.find(e=>e.k==='hpchange'&&e.target==='A');
  assert.ok(change,'the replay shows the poison damage: '+JSON.stringify(events));
  assert.equal(change.hpAfter,loss.revive,'and the bar goes to the restored HP');assert.equal(after.units.A.hp,loss.revive);
});
test('C: a Rollcall Orb carries the new cells of the called companions, and the replay draws their later floaters there',()=>{
  const s=scene(w=>{w.prog.items.rollcallOrb=1;w.units.B.hp=20;w.units.B.status={psn:{tick:1}};});
  const {after,events}=run(s,{type:'use',item:'rollcallOrb',target:'A'});
  const use=after.events.find(e=>e.type==='itemUse'&&e.item==='rollcallOrb');
  assert.ok(use?.moved?.length===1&&use.moved[0].unit==='B','the event names the moved companion');
  assert.deepEqual(use.moved[0].to,after.units.B.pos);assert.notDeepEqual(after.units.B.pos,{x:6,y:1},'B really moved');
  const change=events.find(e=>e.k==='hpchange'&&e.target==='B');
  assert.ok(change,'poison floater for B: '+JSON.stringify(events));
  assert.deepEqual(change.at,after.units.B.pos,'drawn at the cell B was called to, not the old one');
});
