import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSS} from '../../src/core/dungeon.ts';
import {createExpedition,jumpToFloor,RULE_VERSION,CONTENT_VERSION} from '../../src/core/engine.ts';
import {initialProfile,squadOf} from '../../src/core/base.ts';
import {decode,TrialStore,BUILD_ID} from '../../src/core/save.ts';
import {legacySpeciesMove} from '../../src/core/legacy-moves.ts';

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
function legacyRecord(stats=history,stored=false){
  const e=record(stats,stored);
  const oldUnit=(u)=>{
    if(u.species&&u.learned.length){
      const rows=u.learned.map(move=>({move,old:legacySpeciesMove(u.species,move)}));
      if(rows.some(x=>!x.old))throw Error(`test sample has no frozen mapping for ${u.species}`);
      u.learned=rows.map(x=>x.old.behavior);
      u.pp=Object.fromEntries(rows.map(x=>[x.old.behavior,u.pp[x.move]]));
      u.maxPp=Object.fromEntries(rows.map(x=>[x.old.behavior,u.maxPp[x.move]]));
    }
    delete u.stages;delete u.protect;delete u.counter;delete u.lastMove;
    if(u.recruit)oldUnit(u.recruit);
  };
  for(const i of e.profile.roster)for(const l of i.learned){const old=legacySpeciesMove(i.species,l.move);if(!old)throw Error(`test sample has no frozen mapping for ${i.species}/${l.move}`);l.behavior=old.behavior;}
  for(const w of [e.current,e.recent])if(w){
    for(const u of Object.values(w.units))oldUnit(u);
    for(const f of Object.values(w.dungeon?.stored??{}))for(const u of Object.values(f.units))oldUnit(u);
    for(const i of w.invitations)oldUnit(i.unit);
  }
  e.rules='trial-rules-1';e.content='trial-content-1';
  return e;
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

test('Arcanine without the boss mark is not accepted as an ordinary enemy',()=>{
  for(const stored of [false,true]){
    const candidate=record(history,stored),world=candidate.current;
    const boss=stored?world.dungeon.stored['3'].units.boss:world.units.boss;
    delete boss.boss;
    assert.throws(()=>decode(JSON.stringify(candidate)),/存档结构损坏/);
  }
});

test('a valid v1 boss migrates on the active floor and in a stored floor',()=>{
  for(const stored of [false,true]){
    const old=legacyRecord(history,stored),migrated=decode(JSON.stringify(old));
    const boss=stored?migrated.current.dungeon.stored['3'].units.boss:migrated.current.units.boss;
    assert.equal(boss.species,'arcanine');
    assert.equal(boss.boss,true);
    assert.deepEqual(boss.learned,[]);
    assert.deepEqual(boss.stages,{atk:0,def:0});
    assert.equal(boss.protect,0);assert.equal(boss.counter,0);assert.equal(boss.lastMove,null);
    assert.deepEqual(decode(JSON.stringify(migrated)),migrated);
  }
});

test('unknown current boss numbers and a nonboolean boss mark stay invalid in v1 and v2 saves',()=>{
  const invalid=[];
  const oldNumber=legacyRecord();oldNumber.current.units.boss.maxHp=81;invalid.push(oldNumber);
  const oldStringMark=legacyRecord();oldStringMark.current.units.boss.boss='yes';invalid.push(oldStringMark);
  const currentStringMark=record();currentStringMark.current.units.boss.boss='yes';invalid.push(currentStringMark);
  for(const candidate of invalid)assert.throws(()=>decode(JSON.stringify(candidate)),/无法迁移|存档结构损坏/);
});
