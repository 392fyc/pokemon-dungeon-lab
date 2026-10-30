import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {closeOut} from '../../src/core/engine.ts';
import {SPECIES} from '../../src/core/roster.ts';
import {decodeLegacy,TrialStore,BUILD_ID} from '../../src/core/save.ts';
import {legacySpeciesMove} from '../../src/core/legacy-moves.ts';

const history={hp:80,damage:6,range:3};
const released={hp:60,damage:4,range:3};
// Synthetic unshipped tuning. Historical migration must not read today's boss config.
const future={hp:60,damage:4,range:2};
const frozen=JSON.parse(readFileSync(new URL('./fixtures78/legacy-worlds.json',import.meta.url),'utf8'));
const copy=value=>structuredClone(value);
function withStoredBoss(){
  const world=copy(frozen.floor2),last=copy(frozen.floor3),units=Object.fromEntries(last.enemies.map(id=>[id,copy(last.units[id])]));
  world.dungeon.stored['3']={floor:last.floor,seen:last.seen,enemies:last.enemies,units,points:last.points,rooms:last.rooms};
  return world;
}
function record(stats=history,stored=false){
  const profile=copy(frozen.profile),world=stored?withStoredBoss():copy(frozen.floor3);
  const boss=stored?world.dungeon.stored['3'].units.boss:world.units.boss;
  Object.assign(boss,{maxHp:stats.hp,hp:stats.hp-7,damage:stats.damage,range:stats.range});
  world.phase='ended';world.request=null;world.anchor=null;world.end=closeOut(world,'normal');
  return {format:1,rules:'trial-rules-2',content:'trial-content-2',build:BUILD_ID,sequence:2,current:world,recent:null,profile};
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
    delete u.stages;delete u.protect;delete u.counter;delete u.lastMove;delete u.reflect;delete u.lightscreen;
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
test('decodeLegacy accepts only the two frozen boss tuples on the active or a stored floor',()=>{
  for(const stats of [history,released])for(const stored of [false,true]){
    const expected=record(stats,stored),migrated=decodeLegacy(JSON.stringify(expected));
    const boss=stored?migrated.current.dungeon.stored['3'].units.boss:migrated.current.units.boss;
    assert.deepEqual([boss.maxHp,boss.damage,boss.range],[stats.hp,stats.damage,stats.range]);
  }
});

test('importing a valid old ended boss run settles camp data and drops the World',async()=>{
  const expected=record(),raw=JSON.stringify(expected),storage=port();
  const loaded=new TrialStore(storage);
  assert.equal(await loaded.importRecord(raw,true),true,loaded.importError);
  assert.equal(loaded.state,null);
  assert.equal(loaded.envelope.format,2);assert.equal(Object.hasOwn(loaded.envelope,'current'),false);
  const again=new TrialStore(storage);
  assert.equal(again.status,'ready',again.error);
  assert.deepEqual(again.envelope,loaded.envelope);
  assert.equal(again.state,null);
  const old=decodeLegacy(raw),boss=old.current.units.boss;
  assert.deepEqual([boss.maxHp,boss.damage,boss.range],[history.hp,history.damage,history.range]);
});

test('mixed generations and unknown boss numbers are refused without changing the original bytes',async()=>{
  const invalid=[];
  for(let mask=1;mask<7;mask++){
    const stats={hp:mask&1?future.hp:history.hp,damage:mask&2?future.damage:history.damage,range:mask&4?future.range:history.range};
    if(JSON.stringify(stats)!==JSON.stringify(released)&&JSON.stringify(stats)!==JSON.stringify(history))invalid.push(stats);
  }
  invalid.push({...history,hp:81},{...history,damage:5},{...history,range:4},future);
  for(const stats of invalid)for(const stored of [false,true]){
    const raw=JSON.stringify(record(stats,stored)),storage=port(raw);
    assert.throws(()=>decodeLegacy(raw),/存档结构损坏/);
    const loaded=new TrialStore(storage);
    await loaded.whenReady;
    assert.equal(loaded.status,'blocked');
    assert.equal(loaded.exportRaw(),raw);
    assert.equal(storage.writes(),0);
  }
});

test('historical tuple does not waive boss identity, health or recruitment constraints',async()=>{
  for(const mutate of [b=>{b.species='geodude';},b=>{b.side='friend';},b=>{b.ai='ranged';},b=>{b.hp=81;},b=>{b.recruit={};},b=>{b.inst='fake';}]){
    const candidate=record();mutate(candidate.current.units.boss);
    assert.throws(()=>decodeLegacy(JSON.stringify(candidate)),/存档结构损坏/);
  }
});

test('Arcanine without the boss mark is not accepted as an ordinary enemy',()=>{
  for(const stored of [false,true]){
    const candidate=record(history,stored),world=candidate.current;
    const boss=stored?world.dungeon.stored['3'].units.boss:world.units.boss;
    delete boss.boss;
    assert.throws(()=>decodeLegacy(JSON.stringify(candidate)),/存档结构损坏/);
  }
});

test('legacy nested recruit/invitation cannot carry a boss mark; Arcanine stays boss-only in historical Worlds',()=>{
  const accepted=legacyRecord(),carrier=accepted.current.enemies[0];
  accepted.current.units[carrier].recruit={id:'N1',side:'friend',hp:10,maxHp:10,pos:null,pp:{},maxPp:{},learned:[],species:'pidgey'};
  const inviteKit=SPECIES.pidgey.kit;
  accepted.current.invitations=[{id:'invite-pidgey',status:'rejected',unit:{id:'invite-pidgey',side:'friend',hp:Math.max(1,Math.floor(SPECIES.pidgey.maxHp/2)),maxHp:SPECIES.pidgey.maxHp,pos:null,
    pp:{strong:inviteKit[0].pp,line:inviteKit[1].pp},maxPp:{strong:inviteKit[0].pp,line:inviteKit[1].pp},learned:['strong','line'],species:'pidgey'}}];
  assert.doesNotThrow(()=>decodeLegacy(JSON.stringify(accepted)));
  const markedRecruit=copy(accepted);markedRecruit.current.units[carrier].recruit.boss=true;
  assert.throws(()=>decodeLegacy(JSON.stringify(markedRecruit)),/存档结构损坏/);
  const markedInvitation=copy(accepted);markedInvitation.current.invitations[0].unit.boss=true;
  assert.throws(()=>decodeLegacy(JSON.stringify(markedInvitation)),/存档结构损坏/);
  const ordinaryArcanine=copy(accepted);ordinaryArcanine.current.units[carrier].recruit.species='arcanine';
  assert.throws(()=>decodeLegacy(JSON.stringify(ordinaryArcanine)),/存档结构损坏/,'only the new camp profile accepts ordinary Arcanine');
});

test('decodeLegacy migrates a valid v1 boss on the active floor and in a stored floor',()=>{
  for(const stored of [false,true]){
    const old=legacyRecord(history,stored),migrated=decodeLegacy(JSON.stringify(old));
    const boss=stored?migrated.current.dungeon.stored['3'].units.boss:migrated.current.units.boss;
    assert.equal(boss.species,'arcanine');
    assert.equal(boss.boss,true);
    assert.deepEqual(boss.learned,[]);
    assert.deepEqual(boss.stages,{atk:0,def:0});
    assert.equal(boss.protect,0);assert.equal(boss.counter,0);assert.equal(boss.lastMove,null);
    assert.deepEqual(decodeLegacy(JSON.stringify(migrated)),migrated);
  }
});

test('unknown boss numbers and a nonboolean mark stay invalid in old ended records',()=>{
  const invalid=[];
  const oldNumber=legacyRecord();oldNumber.current.units.boss.maxHp=81;invalid.push(oldNumber);
  const oldStringMark=legacyRecord();oldStringMark.current.units.boss.boss='yes';invalid.push(oldStringMark);
  const currentStringMark=record();currentStringMark.current.units.boss.boss='yes';invalid.push(currentStringMark);
  for(const candidate of invalid)assert.throws(()=>decodeLegacy(JSON.stringify(candidate)),/无法迁移|存档结构损坏/);
});
