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
  // the sprite, its shadow and its HP label are moved by a playable event that comes before the later events of the round
  const recall=events.findIndex(e=>e.k==='recall'&&e.id==='B'),later=events.findIndex(e=>e.k==='hpchange'&&e.target==='B');
  assert.ok(recall>=0,'the replay has a recall (slide) event for B: '+JSON.stringify(events));
  assert.deepEqual(events[recall].from,{x:6,y:1});assert.deepEqual(events[recall].to,after.units.B.pos);
  assert.ok(recall<later,'and it is ordered before the poison floater (recall '+recall+', floater '+later+')');
});

test('P3: team-wide moves reach two cells in a corridor, so their text says "范围内", not "同房间"',async()=>{
  const {moveEffectText}=await import('../../src/core/move-text.ts');
  for(const id of ['softboiled','helpinghand','reflect','lightscreen'])assert.doesNotMatch(moveEffectText(id),/同房间/,id);
  assert.match(moveEffectText('softboiled'),/范围内全队各自回复最大HP的一半/);
  const corridor=(bx)=>scene(w=>{w.rooms=[];const a=w.units.A;a.learned=['softboiled'];a.pp={softboiled:5};a.maxPp={softboiled:5};w.units.B.pos={x:bx,y:1};w.units.B.hp=10;});
  const near=run(corridor(4),{type:'skill',skill:'softboiled',target:'A'}).after,far=run(corridor(6),{type:'skill',skill:'softboiled',target:'A'}).after;
  assert.equal(near.units.B.hp,25,'B two cells away in a corridor is healed (10 + half of 30)');
  assert.equal(far.units.B.hp,10,'B four cells away is not');
});

test('P2: a recall closes the batch of earlier moves; a later move of the called unit plays after it, and C ends on (4,3)',async()=>{
  const {animationBatches}=await import('../../src/render/animation.ts');
  const area=Array.from({length:55},(_,i)=>pos(i%11,Math.floor(i/11)));
  const s=scene(w=>{
    w.floor=area;w.seen=area.map(key);w.rooms=[{x:0,y:0,w:11,h:5}];
    const c=engineFriend('C',9,2,30,{tackle:5});c.species='treecko';c.maxHp=30;c.tactic='gofoes';w.units.C=c;w.queue=['A','B','C'];
    w.units.A.pos={x:1,y:2};w.units.B.pos={x:5,y:2};w.units.B.tactic='wait';
    const e=foeOf('E','rattata',0,3,40,{tackle:5});e.waitOnly=true;e.asleep=false;w.units.E=e;w.enemies=['E'];
    w.prog.items.rollcallOrb=1;
  });
  const cmd={type:'round',action:{type:'move',to:{x:2,y:2}},override:{actor:'B',action:{type:'use',item:'rollcallOrb',target:'B'}}};
  const r=applyCommand(s,cmd);assert.equal(r.ok,true,r.error);
  const events=inferEvents(s,r.state,cmd);
  const order=events.filter(e=>['move','recall'].includes(e.k)).map(e=>e.k+':'+e.id);
  assert.ok(order.includes('move:A')&&order.includes('recall:C')&&order.includes('move:C'),'the three events exist: '+order.join(' '));
  assert.ok(order.indexOf('move:A')<order.indexOf('recall:C')&&order.indexOf('recall:C')<order.indexOf('move:C'),'event order is A move, recall C, C move: '+order.join(' '));
  const batches=animationBatches(events),at=(pred)=>batches.findIndex(b=>b.some(pred));
  const a=at(e=>e.k==='move'&&e.id==='A'),rec=at(e=>e.k==='recall'&&e.id==='C'),c=at(e=>e.k==='move'&&e.id==='C');
  assert.ok(a<rec&&rec<c,'batch order A move, recall, C move: '+JSON.stringify(batches.map(b=>b.map(e=>e.k+':'+(e.id??e.target??'')))));
  assert.deepEqual(r.state.units.C.pos,{x:4,y:3},'C ends on (4,3)');
});
test('P2: a unit blown away and moving later does not have its move pulled before the blow',async()=>{
  const {animationBatches}=await import('../../src/render/animation.ts');
  const P=(x,y)=>({x,y});
  const events=[{k:'move',by:'A',id:'A',from:P(0,0),to:P(1,0)},{k:'blowaway',by:'F',target:'G',actorAt:P(0,0),from:P(4,0),to:P(6,0)},{k:'move',by:'G',id:'G',from:P(6,0),to:P(5,0)},{k:'move',by:'H',id:'H',from:P(0,2),to:P(1,2)}];
  const b=animationBatches(events).map(x=>x.map(e=>e.k+':'+(e.id??e.target)));
  assert.deepEqual(b,[['move:A','move:H'],['blowaway:G'],['move:G']],'H (unaffected) still joins the first group, G moves after its own blow: '+JSON.stringify(b));
});
