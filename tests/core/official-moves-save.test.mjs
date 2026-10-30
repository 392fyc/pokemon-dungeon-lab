import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {TrialStore,decode,decodeLegacy} from '../../src/core/save.ts';
import {RULE_VERSION,CONTENT_VERSION} from '../../src/core/engine.ts';

const fixtureRoot=join(dirname(fileURLToPath(import.meta.url)),'fixtures77');
const load=(name)=>JSON.parse(readFileSync(join(fixtureRoot,name),'utf8'));
const clone=(v)=>structuredClone(v);
const base=()=>load('v1-profile-current.json');
const parts=()=>load('v1-location-parts.json');
function port(raw){let value=raw,writes=0;return {getItem:()=>value,setItem:(_key,next)=>{value=next;writes++;},raw:()=>value,writes:()=>writes};}
function assertLegacyRejected(raw){
  assert.throws(()=>decodeLegacy(raw),/PP键|结构损坏/);
}
function putPendingInvitation(world,unit){
  world.phase='invitation';
  world.seen=world.floor.map(p=>`${p.x},${p.y}`);
  world.anchor={...world.floor[0]};
  world.invitations=[{id:`${world.runId}:invite:1`,unit,status:'pending'}];
}

test('decodeLegacy migrates v1 profile and active World for old-record validation tests; TrialStore drops that World',async()=>{
  const old=base(),raw=JSON.stringify(old),storage=port(raw),store=new TrialStore(storage);
  const migrated=decodeLegacy(raw);
  assert.equal(migrated.rules,'trial-rules-2');
  assert.equal(migrated.content,'trial-content-2');
  const p=migrated.profile.roster[0];
  assert.deepEqual(p.learned,[{move:'scratch',pp:3},{move:'ember',pp:2}]);
  assert.equal(p.learned.some(x=>'behavior' in x),false);
  const a=migrated.current.units.A;
  assert.deepEqual(a.learned,['scratch','ember']);
  assert.deepEqual(a.pp,{scratch:3,ember:2});
  assert.deepEqual(a.maxPp,{scratch:3,ember:2});
  assert.deepEqual(a.moves,['scratch','ember']);
  assert.deepEqual(a.stages,{atk:0,def:0});
  assert.equal(a.protect,0);assert.equal(a.counter,0);assert.equal(a.lastMove,null);
  assert.deepEqual(decodeLegacy(JSON.stringify(migrated)),migrated,'the old-record helper validates its migrated format-1 input');
  assert.equal(await store.whenReady,true,store.error);
  assert.equal(store.status,'ready',store.error);assert.equal(store.state,null);
  assert.equal(store.envelope.format,2);assert.equal(store.envelope.rules,RULE_VERSION);assert.equal(store.envelope.content,CONTENT_VERSION);
  assert.equal(Object.hasOwn(store.envelope,'current'),false);assert.equal(storage.writes(),1);
});

test('the legacy validation helper preserves rescued-instance move identities during migration',()=>{
  const e=base(),fragment=parts().profileRescueEntry;
  e.profile.next=5;e.profile.rescue=[clone(fragment)];
  const migrated=decodeLegacy(JSON.stringify(e));
  assert.deepEqual(migrated.profile.rescue[0].inst.learned,[{move:'scratch',pp:3},{move:'ember',pp:2}]);
  assert.equal(migrated.profile.rescue[0].inst.protected,false);
  assert.deepEqual(decodeLegacy(JSON.stringify(migrated)),migrated);
});

test('the legacy validation helper maps a species-only invitation from the frozen kit',()=>{
  const e=base(),w=e.current,unit=clone(parts().speciesInvitationUnit);
  putPendingInvitation(w,unit);
  const migrated=decodeLegacy(JSON.stringify(e));
  const invite=migrated.current.invitations[0].unit;
  assert.deepEqual(invite.learned,['scratch','ember']);
  assert.deepEqual(invite.pp,{scratch:1,ember:1});
  assert.equal(invite.moves,undefined);
  assert.deepEqual(invite.stages,{atk:0,def:0});
  assert.deepEqual(decodeLegacy(JSON.stringify(migrated)),migrated);
});

test('the legacy validation helper migrates stored-floor units and nested recruits',()=>{
  const e=base(),w=e.current;
  const floor=clone(parts().storedFloor);
  floor.units.storedE.recruit=clone(parts().noSpeciesRecruitUnit);
  w.dungeon.stored={'2':floor};
  const migrated=decodeLegacy(JSON.stringify(e));
  const stored=migrated.current.dungeon.stored['2'].units.storedE;
  assert.equal(stored.learned.length,0);
  assert.deepEqual(stored.pp,{});assert.deepEqual(stored.maxPp,{});
  assert.deepEqual(stored.stages,{atk:0,def:0});
  assert.equal(stored.protect,0);assert.equal(stored.counter,0);assert.equal(stored.lastMove,null);
  assert.deepEqual(stored.recruit.learned,['tackle','roar']);
  assert.deepEqual(stored.recruit.pp,{tackle:1,roar:1});
  assert.deepEqual(stored.recruit.stages,{atk:0,def:0});
  assert.deepEqual(decodeLegacy(JSON.stringify(migrated)),migrated);
});

test('the legacy validation helper migrates camped and exchanged-away units outside the active queue',()=>{
  const camp=decodeLegacy(JSON.stringify(load('v1-camp-unit.json')));
  const c=camp.current.units.P4;
  assert.deepEqual(c.learned,['scratch','ember']);
  assert.deepEqual(c.pp,{scratch:3,ember:2});
  assert.deepEqual(c.stages,{atk:0,def:0});
  assert.deepEqual(decodeLegacy(JSON.stringify(camp)),camp);

  const exchanged=decodeLegacy(JSON.stringify(load('v1-exchange-unit.json')));
  const x=exchanged.current.units.P4;
  assert.equal(exchanged.current.exchange.sent,'P4');
  assert.deepEqual(x.learned,['scratch','ember']);
  assert.deepEqual(x.pp,{scratch:3,ember:2});
  assert.deepEqual(x.stages,{atk:0,def:0});
  assert.deepEqual(decodeLegacy(JSON.stringify(exchanged)),exchanged);
});

test('the legacy validation helper migrates an old recent result without repeating its loss draw',()=>{
  const e=base(),recent=load('v1-recent-world.json'),rng=recent.prog.rng;
  e.recent=recent;
  const migrated=decodeLegacy(JSON.stringify(e));
  assert.equal(migrated.recent.phase,'ended');
  assert.equal(migrated.recent.prog.rng,rng);
  assert.deepEqual(migrated.recent.units.A.learned,['scratch','ember']);
  assert.deepEqual(migrated.recent.units.A.stages,{atk:0,def:0});
  assert.deepEqual(decodeLegacy(JSON.stringify(migrated)),migrated);
});

test('a saved developer scenario without a camp profile is blocked and preserved for export',async()=>{
  const raw=JSON.stringify(load('v1-scenario-recruit.json')),storage=port(raw),store=new TrialStore(storage);
  assert.equal(await store.whenReady,false);
  assert.equal(store.status,'blocked');assert.equal(store.state,null);
  assert.equal(store.exportRaw(),raw);assert.equal(storage.raw(),raw);assert.equal(storage.writes(),0);
});

test('a malformed old profile behavior cannot be discarded during migration and blocked bytes stay exportable',async()=>{
  const e=base();e.profile.roster[0].learned[0].behavior='push';
  const raw=JSON.stringify(e),storage=port(raw),store=new TrialStore(storage);
  await store.whenReady;
  assert.equal(store.status,'blocked');
  assert.match(store.error,/冻结的旧名单不符/);
  assert.equal(store.exportRaw(),raw);
  assert.equal(storage.writes(),0);
  assert.equal((store.error.match(/原记录已保留/g)??[]).length,1,store.error);
});

test('the explicit legacy helper rejects bad PP keys inside stored recruits and invitations',()=>{
  const crossFloor=base(),floor=clone(parts().storedFloor);
  floor.units.storedE.recruit=clone(parts().noSpeciesRecruitUnit);
  floor.units.storedE.recruit.pp.unknown=1;
  crossFloor.current.dungeon.stored={'2':floor};
  assertLegacyRejected(JSON.stringify(crossFloor));

  const invitation=base();
  const unit=clone(parts().speciesInvitationUnit);putPendingInvitation(invitation.current,unit);
  invitation.current.invitations[0].unit.pp.unknown=1;
  assertLegacyRejected(JSON.stringify(invitation));
});

test('current decode accepts only camp data and rejects embedded legacy World records',()=>{
  const current={format:2,rules:RULE_VERSION,content:CONTENT_VERSION,build:'test',sequence:1,profile:decodeLegacy(JSON.stringify(base())).profile};
  assert.deepEqual(decode(JSON.stringify(current)),current);
  for(const field of ['current','recent'])assert.throws(()=>decode(JSON.stringify({...current,[field]:null})),/存档结构损坏/);
});

test('actual loading drops a malformed old in-progress World while retaining its valid camp',async()=>{
  const old=base();old.current.units.A.pp.unknown=1;
  const raw=JSON.stringify(old),storage=port(raw),store=new TrialStore(storage);
  assert.equal(await store.whenReady,true,store.error);
  assert.equal(store.status,'ready');assert.equal(store.state,null);
  assert.equal(store.envelope.format,2);assert.equal(Object.hasOwn(store.envelope,'current'),false);
  assert.deepEqual(store.profile.roster[0].learned,[{move:'scratch',pp:3},{move:'ember',pp:2}]);
});
