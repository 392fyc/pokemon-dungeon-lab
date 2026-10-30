import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {TrialStore,decode} from '../../src/core/save.ts';
import {RULE_VERSION,CONTENT_VERSION} from '../../src/core/engine.ts';

const fixtureRoot=join(dirname(fileURLToPath(import.meta.url)),'fixtures77');
const load=(name)=>JSON.parse(readFileSync(join(fixtureRoot,name),'utf8'));
const clone=(v)=>structuredClone(v);
const base=()=>load('v1-profile-current.json');
const parts=()=>load('v1-location-parts.json');
function port(raw){let value=raw,writes=0;return {getItem:()=>value,setItem:(_key,next)=>{value=next;writes++;},raw:()=>value,writes:()=>writes};}
function assertBlockedRaw(raw){
  const storage=port(raw),store=new TrialStore(storage);
  assert.equal(store.status,'blocked',store.error);
  assert.match(store.error,/PP键/);
  assert.equal(store.exportRaw(),raw);
  assert.equal(storage.writes(),0);
  assert.equal((store.error.match(/原记录已保留/g)??[]).length,1,store.error);
}
function putPendingInvitation(world,unit){
  world.phase='invitation';
  world.seen=world.floor.map(p=>`${p.x},${p.y}`);
  world.anchor={...world.floor[0]};
  world.invitations=[{id:`${world.runId}:invite:1`,unit,status:'pending'}];
}

test('v1 profile and active base-run sample migrate and can continue, save, and reload',async()=>{
  const old=base(),raw=JSON.stringify(old),storage=port(raw),store=new TrialStore(storage);
  assert.equal(store.status,'ready',store.error);
  assert.equal(store.envelope.rules,RULE_VERSION);
  assert.equal(store.envelope.content,CONTENT_VERSION);
  const p=store.profile.roster[0];
  assert.deepEqual(p.learned,[{move:'scratch',pp:3},{move:'ember',pp:2}]);
  assert.equal(p.learned.some(x=>'behavior' in x),false);
  const a=store.state.units.A;
  assert.deepEqual(a.learned,['scratch','ember']);
  assert.deepEqual(a.pp,{scratch:3,ember:2});
  assert.deepEqual(a.maxPp,{scratch:3,ember:2});
  assert.deepEqual(a.moves,['scratch','ember']);
  assert.deepEqual(a.stages,{atk:0,def:0});
  assert.equal(a.protect,0);assert.equal(a.counter,0);assert.equal(a.lastMove,null);
  assert.deepEqual(decode(JSON.stringify(store.envelope)),store.envelope,'the migrated v2 record round-trips without another transformation');

  const advanced=await store.dispatch({type:'round',action:{type:'wait'}});
  assert.equal(advanced.ok,true,advanced.error);
  assert.equal(JSON.parse(storage.raw()).rules,RULE_VERSION,'the next save writes v2 after play continues');
  const reloaded=new TrialStore(storage);
  assert.equal(reloaded.status,'ready',reloaded.error);
  assert.deepEqual(reloaded.envelope,store.envelope);
});

test('the rescue-pool instance has its own frozen old sample and keeps its learned move identities',()=>{
  const e=base(),fragment=parts().profileRescueEntry;
  e.profile.next=5;e.profile.rescue=[clone(fragment)];
  const migrated=decode(JSON.stringify(e));
  assert.deepEqual(migrated.profile.rescue[0].inst.learned,[{move:'scratch',pp:3},{move:'ember',pp:2}]);
  assert.equal(migrated.profile.rescue[0].inst.protected,false);
  assert.deepEqual(decode(JSON.stringify(migrated)),migrated);
});

test('an old species invitation without moves uses the frozen species kit mapping',()=>{
  const e=base(),w=e.current,unit=clone(parts().speciesInvitationUnit);
  putPendingInvitation(w,unit);
  const migrated=decode(JSON.stringify(e));
  const invite=migrated.current.invitations[0].unit;
  assert.deepEqual(invite.learned,['scratch','ember']);
  assert.deepEqual(invite.pp,{scratch:1,ember:1});
  assert.equal(invite.moves,undefined);
  assert.deepEqual(invite.stages,{atk:0,def:0});
  assert.deepEqual(decode(JSON.stringify(migrated)),migrated);
});

test('stored-floor units receive the move-key migration and required combat defaults',()=>{
  const e=base(),w=e.current;
  const floor=clone(parts().storedFloor);
  floor.units.storedE.recruit=clone(parts().noSpeciesRecruitUnit);
  w.dungeon.stored={'2':floor};
  const migrated=decode(JSON.stringify(e));
  const stored=migrated.current.dungeon.stored['2'].units.storedE;
  assert.equal(stored.learned.length,0);
  assert.deepEqual(stored.pp,{});assert.deepEqual(stored.maxPp,{});
  assert.deepEqual(stored.stages,{atk:0,def:0});
  assert.equal(stored.protect,0);assert.equal(stored.counter,0);assert.equal(stored.lastMove,null);
  assert.deepEqual(stored.recruit.learned,['tackle','roar']);
  assert.deepEqual(stored.recruit.pp,{tackle:1,roar:1});
  assert.deepEqual(stored.recruit.stages,{atk:0,def:0});
  assert.deepEqual(decode(JSON.stringify(migrated)),migrated);
});

test('camp and exchanged-away roster units are migrated even though they are outside the active queue',()=>{
  const camp=decode(JSON.stringify(load('v1-camp-unit.json')));
  const c=camp.current.units.P4;
  assert.deepEqual(c.learned,['scratch','ember']);
  assert.deepEqual(c.pp,{scratch:3,ember:2});
  assert.deepEqual(c.stages,{atk:0,def:0});
  assert.deepEqual(decode(JSON.stringify(camp)),camp);

  const exchanged=decode(JSON.stringify(load('v1-exchange-unit.json')));
  const x=exchanged.current.units.P4;
  assert.equal(exchanged.current.exchange.sent,'P4');
  assert.deepEqual(x.learned,['scratch','ember']);
  assert.deepEqual(x.pp,{scratch:3,ember:2});
  assert.deepEqual(x.stages,{atk:0,def:0});
  assert.deepEqual(decode(JSON.stringify(exchanged)),exchanged);
});

test('an old recent run migrates for display without repeating the loss draw',()=>{
  const e=base(),recent=load('v1-recent-world.json'),rng=recent.prog.rng;
  e.recent=recent;
  const migrated=decode(JSON.stringify(e));
  assert.equal(migrated.recent.phase,'ended');
  assert.equal(migrated.recent.prog.rng,rng);
  assert.deepEqual(migrated.recent.units.A.learned,['scratch','ember']);
  assert.deepEqual(migrated.recent.units.A.stages,{atk:0,def:0});
  assert.deepEqual(decode(JSON.stringify(migrated)),migrated);
});

test('the old fixed V13 scenario converts species-less units and its nested recruit with the fallback table',()=>{
  const e=load('v1-scenario-recruit.json'),migrated=decode(JSON.stringify(e));
  assert.deepEqual(migrated.current.units.A.learned,['tackle']);
  assert.deepEqual(migrated.current.units.B.learned,['protect']);
  assert.deepEqual(migrated.current.units.C.learned,['tackle','quickattack']);
  assert.deepEqual(migrated.current.units.E.recruit.learned,['tackle','roar']);
  assert.deepEqual(migrated.current.units.E.recruit.pp,{tackle:1,roar:1});
  assert.deepEqual(decode(JSON.stringify(migrated)),migrated);
});

test('a malformed old behavior cannot be discarded during migration and blocked bytes stay exportable',()=>{
  const e=base();e.profile.roster[0].learned[0].behavior='push';
  const raw=JSON.stringify(e),storage=port(raw),store=new TrialStore(storage);
  assert.equal(store.status,'blocked');
  assert.match(store.error,/冻结的旧名单不符/);
  assert.equal(store.exportRaw(),raw);
  assert.equal(storage.writes(),0);
  assert.equal((store.error.match(/原记录已保留/g)??[]).length,1,store.error);
});

test('bad PP keys in a stored-floor recruit or invitation block loading without rewriting bytes',()=>{
  const crossFloor=base(),floor=clone(parts().storedFloor);
  floor.units.storedE.recruit=clone(parts().noSpeciesRecruitUnit);
  floor.units.storedE.recruit.pp.unknown=1;
  crossFloor.current.dungeon.stored={'2':floor};
  assertBlockedRaw(JSON.stringify(crossFloor));

  const invitation=base();
  const unit=clone(parts().speciesInvitationUnit);putPendingInvitation(invitation.current,unit);
  invitation.current.invitations[0].unit.pp.unknown=1;
  assertBlockedRaw(JSON.stringify(invitation));
});

test('new saves reject missing combat fields and unknown current-unit groups',()=>{
  const current=decode(JSON.stringify(base()));
  const missing=clone(current);delete missing.current.units.A.counter;
  assert.throws(()=>decode(JSON.stringify(missing)),/存档结构损坏/);
  const unknown=clone(current);unknown.current.units.A.group='unrecognized';
  assert.throws(()=>decode(JSON.stringify(unknown)),/存档结构损坏/);
});
