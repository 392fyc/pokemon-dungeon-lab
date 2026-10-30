import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSS} from '../../src/core/dungeon.ts';
import {createExpedition,jumpToFloor,RULE_VERSION,CONTENT_VERSION} from '../../src/core/engine.ts';
import {initialProfile,squadOf} from '../../src/core/base.ts';
import {decode,TrialStore,BUILD_ID} from '../../src/core/save.ts';

const history={hp:80,damage:6,range:3};
// Synthetic future tuning, not a balance decision. Changing all three fields
// catches validators that accept a mixture of different generations.
const future={hp:60,damage:4,range:2};
function record(stats=history,stored=false){
  const profile=initialProfile();
  let world=jumpToFloor(createExpedition('boss-save-compat',4,3,squadOf(profile),0),3);
  Object.assign(world.units.boss,{maxHp:stats.hp,hp:stats.hp-7,damage:stats.damage,range:stats.range});
  if(stored)world=jumpToFloor(world,2);
  return {format:1,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:2,current:world,recent:null,profile};
}
function port(raw=null){
  let value=raw,writes=0;
  return {getItem:()=>value,setItem:(_key,next)=>{value=next;writes++;},raw:()=>value,writes:()=>writes};
}
async function tuned(fn){
  const original={...BOSS};
  try{Object.assign(BOSS,future);await fn();}finally{Object.assign(BOSS,original);}
}

test('historical and current boss tuples load unchanged, on the active or a stored floor',async()=>{
  await tuned(async()=>{
    for(const stats of [history,future])for(const stored of [false,true]){
      const expected=record(stats,stored),raw=JSON.stringify(expected),storage=port(raw);
      assert.deepEqual(decode(raw),expected);
      const loaded=new TrialStore(storage);
      assert.equal(loaded.status,'ready',loaded.error);
      assert.deepEqual(loaded.envelope,expected);
      assert.equal(storage.raw(),raw);
      assert.equal(storage.writes(),0,'loading does not rewrite old boss numbers');
    }
  });
});

test('historical boss survives import, a normal save and reload after tuning',async()=>{
  await tuned(async()=>{
    const expected=record(),raw=JSON.stringify(expected),storage=port();
    const loaded=new TrialStore(storage);
    assert.equal(await loaded.importRecord(raw,true),true,loaded.importError);
    assert.deepEqual(loaded.state,expected.current);
    assert.equal((await loaded.dispatch({type:'round',action:{type:'wait'}})).ok,true);
    const again=new TrialStore(storage);
    assert.equal(again.status,'ready',again.error);
    assert.deepEqual(again.envelope,loaded.envelope);
    assert.deepEqual(again.state.units.boss,expected.current.units.boss);
  });
});

test('mixed generations and unknown boss numbers are refused without changing the original bytes',async()=>{
  await tuned(async()=>{
    const invalid=[];
    for(let mask=1;mask<7;mask++)invalid.push({hp:mask&1?future.hp:history.hp,damage:mask&2?future.damage:history.damage,range:mask&4?future.range:history.range});
    invalid.push({...history,hp:81},{...history,damage:5},{...history,range:4});
    for(const stats of invalid)for(const stored of [false,true]){
      const raw=JSON.stringify(record(stats,stored)),storage=port(raw);
      assert.throws(()=>decode(raw),/存档结构损坏/);
      const loaded=new TrialStore(storage);
      assert.equal(loaded.status,'blocked');
      assert.equal(loaded.exportRaw(),raw);
      assert.equal(storage.writes(),0);
    }
  });
});

test('historical tuple does not waive boss identity, health or recruitment constraints',async()=>{
  await tuned(async()=>{
    for(const mutate of [b=>{b.species='geodude';},b=>{b.side='friend';},b=>{b.ai='ranged';},b=>{b.hp=81;},b=>{b.recruit={};},b=>{b.inst='fake';}]){
      const candidate=record();mutate(candidate.current.units.boss);
      assert.throws(()=>decode(JSON.stringify(candidate)),/存档结构损坏/);
    }
  });
});
