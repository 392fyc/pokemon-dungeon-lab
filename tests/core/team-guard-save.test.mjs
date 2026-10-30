import test from 'node:test';
import assert from 'node:assert/strict';
import {createExpedition,jumpToFloor,applyCommand,RULE_VERSION,CONTENT_VERSION} from '../../src/core/engine.ts';
import {createScenario} from '../../src/core/scenarios.ts';
import {initialProfile,squadOf} from '../../src/core/base.ts';
import {decode,TrialStore,BUILD_ID} from '../../src/core/save.ts';
import {ALL_TM_MOVES,LEGACY_TM_MOVES,TM_MOVES,TM_MOVES_V3,SPECIES,tmPool} from '../../src/core/roster.ts';

const envelope=(current,profile=initialProfile())=>({format:1,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:3,current,recent:null,profile});
const rawOf=(current,profile)=>JSON.stringify(envelope(current,profile));
function memory(raw=null){let value=raw,writes=0;return {getItem:()=>value,setItem:(_key,next)=>{value=next;writes++;},raw:()=>value,writes:()=>writes};}
function targetRun(seed,tmPoolVersion){
  const runId=`team-guard-target-${seed}`,squad=squadOf(initialProfile());
  let world=tmPoolVersion===3?createExpedition(runId,seed,3,squad,0,undefined,3):createExpedition(runId,seed,3,squad,0);
  world=jumpToFloor(world,3);
  const item=world.points.find(p=>p.kind==='item');assert.ok(item,`seed ${seed} has a target point`);
  world.units[world.leader].pos={...item.pos};
  const result=applyCommand(world,{type:'round',action:{type:'interact',exit:false}});
  assert.equal(result.ok,true,result.error);
  return result.state;
}
function blocked(raw){
  const storage=memory(raw),store=new TrialStore(storage);
  assert.equal(store.status,'blocked',store.error);
  assert.equal(store.exportRaw(),raw);
  assert.equal(storage.writes(),0);
}

test('7.7b keeps both historical draw lists and enables the ten-move list only with a boss tmPool:3 mark',()=>{
  assert.equal(RULE_VERSION,'trial-rules-2');assert.equal(CONTENT_VERSION,'trial-content-2');
  assert.deepEqual([...LEGACY_TM_MOVES],['protect','whirlwind','roar']);
  assert.deepEqual([...TM_MOVES],['protect','whirlwind','roar','dragontail','helpinghand','mudslap','terablast']);
  assert.deepEqual([...TM_MOVES_V3],[...TM_MOVES,'quickguard','reflect','lightscreen']);
  assert.deepEqual([...ALL_TM_MOVES],[...TM_MOVES_V3]);
  assert.deepEqual([...tmPool(undefined)],[...LEGACY_TM_MOVES]);
  assert.deepEqual([...tmPool({})],[...LEGACY_TM_MOVES]);
  assert.deepEqual([...tmPool({boss:true})],[...TM_MOVES]);
  assert.deepEqual([...tmPool({boss:true,tmPool:3})],[...TM_MOVES_V3]);
});

test('fixed old no-tmPool draws keep their pre-7.7b literal results at the target, shop and boss',()=>{
  const target=targetRun(1,undefined);
  assert.equal(target.dungeon.tmPool,undefined);
  assert.deepEqual(target.tms,[{move:'terablast',source:'target',fate:'held'}]);

  const shop=createExpedition('team-guard-old-shop-38',38,3,squadOf(initialProfile()),0);
  assert.equal(shop.dungeon.tmPool,undefined);
  assert.deepEqual(shop.shop.stock,{berry:2,tonic:1,tm:'terablast'});

  const boss=createScenario('BOSS','team-guard-old-boss');
  assert.equal(boss.dungeon.tmPool,undefined);
  boss.units.boss.hp=1;boss.prog.rng=4;
  const drop=applyCommand(boss,{type:'round',action:{type:'basic',target:'boss'}});
  assert.equal(drop.ok,true,drop.error);
  assert.deepEqual(drop.state.tms,[{move:'terablast',source:'boss',fate:'held'}]);
});

test('a new base departure writes tmPool:3 and its fixed shop seed can draw a move from the new three',async()=>{
  const storage=memory(),store=new TrialStore(storage);
  assert.equal(await store.beginNewGame(initialProfile(),false),true);
  assert.equal(await store.depart('team-guard-new-departure',38),true,store.error);
  assert.equal(store.state.dungeon.boss,true);
  assert.equal(store.state.dungeon.tmPool,3);
  assert.deepEqual([...tmPool(store.state.dungeon)],[...TM_MOVES_V3]);
  assert.equal(store.state.shop.stock.tm,'lightscreen');
  const reloaded=new TrialStore(storage);
  assert.equal(reloaded.status,'ready',reloaded.error);
  assert.equal(reloaded.state.dungeon.tmPool,3);
  assert.equal(reloaded.state.shop.stock.tm,'lightscreen');
});

test('friend guard durations load at zero when absent and preserve valid stored values through decode and reload',async()=>{
  const old=targetRun(1,undefined);
  for(const unit of Object.values(old.units))if(unit.side==='friend'){delete unit.reflect;delete unit.lightscreen;}
  const oldRaw=rawOf(old);
  const loadedOld=decode(oldRaw);
  for(const unit of Object.values(loadedOld.current.units))if(unit.side==='friend'){
    assert.equal(unit.reflect,0);assert.equal(unit.lightscreen,0);
  }
  assert.equal(oldRaw.includes('"reflect"'),false,'the original bytes remain an old-shaped sample');

  const current=targetRun(1,3),friend=Object.values(current.units).find(u=>u.side==='friend');
  friend.reflect=7;friend.lightscreen=2;
  const storage=memory(),store=new TrialStore(storage);
  assert.equal(await store.importRecord(rawOf(current),true),true,store.importError);
  assert.equal(store.state.units[friend.id].reflect,7);assert.equal(store.state.units[friend.id].lightscreen,2);
  const again=new TrialStore(storage);
  assert.equal(again.status,'ready',again.error);
  assert.equal(again.state.units[friend.id].reflect,7);assert.equal(again.state.units[friend.id].lightscreen,2);
});

test('guard durations reject invalid values and any enemy carrying either friend-only field',()=>{
  const invalid=[];
  for(const [field,value] of [['reflect',-1],['reflect',11],['reflect',1.5],['lightscreen',-1],['lightscreen',11],['lightscreen','1']]){
    const world=targetRun(1,3);const friend=Object.values(world.units).find(u=>u.side==='friend');friend[field]=value;invalid.push(world);
  }
  for(const field of ['reflect','lightscreen']){const world=targetRun(1,3);const enemy=Object.values(world.units).find(u=>u.side==='enemy');enemy[field]=0;invalid.push(world);}
  for(const world of invalid)blocked(rawOf(world));
});

test('tmPool only accepts version 3 on a boss run; old missing fields keep their current content and draw checks',()=>{
  const old=targetRun(1,undefined);
  assert.doesNotThrow(()=>decode(rawOf(old)));
  old.tms[0].move='terablast';assert.doesNotThrow(()=>decode(rawOf(old)));

  const unknown=targetRun(1,undefined);unknown.dungeon.tmPool=2;blocked(rawOf(unknown));
  const ordinary=createExpedition('team-guard-no-boss-pool',12,2,squadOf(initialProfile()),0);
  ordinary.dungeon.tmPool=3;blocked(rawOf(ordinary));
  const wrongMove=targetRun(1,undefined);wrongMove.tms=[{move:'reflect',source:'target',fate:'held'}];wrongMove.bag=1;blocked(rawOf(wrongMove));

  const current=targetRun(1,3);assert.equal(current.tms[0].move,'lightscreen');
  assert.doesNotThrow(()=>decode(rawOf(current)));
});

test('the warehouse accepts and learns each new machine through a persisted base action',async()=>{
  let profile=initialProfile();
  const picks=['quickguard','reflect','lightscreen'].map(move=>{
    const species=Object.values(SPECIES).find(s=>s.availability!=='暂不出场'&&s.kit.length>0&&s.learnable.some(m=>m.move===move));
    assert.ok(species,`${move} has an imported learner`);
    return {move,species};
  });
  for(let i=0;i<picks.length;i++){
    const {move,species}=picks[i],id=`P${4+i}`;
    profile.roster.push({id,species:species.id,learned:species.kit.map(k=>({...k})),carry:species.kit.map(k=>k.move),protected:false});
    profile.vault[move]=1;
  }
  profile.next=7;
  const storage=memory(),store=new TrialStore(storage);
  assert.equal(await store.beginNewGame(profile,false),true,store.error);
  for(let i=0;i<picks.length;i++){
    const {move}=picks[i],id=`P${4+i}`;
    const result=await store.baseAction({type:'learn',inst:id,move});
    assert.deepEqual(result,{ok:true,saved:true},move);
  }
  const again=new TrialStore(storage);
  assert.equal(again.status,'ready',again.error);
  for(let i=0;i<picks.length;i++){
    const {move}=picks[i],id=`P${4+i}`;
    assert.ok(again.profile.roster.find(inst=>inst.id===id).learned.some(m=>m.move===move));
    assert.equal(again.profile.vault[move],undefined);
  }
});
