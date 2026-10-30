import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createMain,RULE_VERSION,CONTENT_VERSION} from '../../src/core/engine.ts';
import {newGameProfile,settleRun,squadOf} from '../../src/core/base.ts';
import {TrialStore,decode,decodeLegacy,BUILD_ID} from '../../src/core/save.ts';
import {round,wait,interact} from './fixtures.mjs';

function port(raw=null){
 let value=raw,failNext=false,writes=0;
 return {getItem:()=>value,setItem:(_key,next)=>{if(failNext){failNext=false;throw Error('ACCEPTANCE_WRITE_FAILURE');}value=next;writes++;},raw:()=>value,writes:()=>writes,failNext(){failNext=true;}};
}
const legacy=name=>JSON.parse(readFileSync(new URL(`../core/fixtures77-regression/${name}`,import.meta.url),'utf8'));
const gameProfile=()=>{const made=newGameProfile('charmander','squirtle');assert.equal(made.ok,true);return made.profile;};

async function finishExpedition(store){
 for(let n=0;n<20;n++){
  const s=store.state;assert.ok(s,`World disappeared before terminal at step ${n}`);
  if(s.phase==='ended')return s;
  if(s.phase==='invitation'){assert.equal((await store.dispatch({type:'invite',choice:'reject'})).ok,true);continue;}
  if(s.phase==='exit'){assert.equal((await store.dispatch({type:'finishExit'})).ok,true);continue;}
  if(s.phase==='transit'){assert.equal((await store.dispatch({type:'finishTransit'})).ok,true);continue;}
  assert.equal(s.phase,'playing');
  const leader=s.units[s.leader],exit=s.points.find(p=>p.kind==='exit'&&leader.pos&&p.pos.x===leader.pos.x&&p.pos.y===leader.pos.y);
  if(exit)assert.equal((await store.dispatch({type:'round',action:{type:'interact',exit:true}})).ok,true);
  else assert.equal((await store.dispatch({type:'round',action:{type:'wait'}})).ok,true);
 }
 assert.fail('deterministic expedition did not reach its exit');
}

test('A1 new records contain only the camp profile; in-run Worlds stay in memory',async()=>{
 const storage=port(),store=new TrialStore(storage,'acceptance'),profile=gameProfile();
 assert.equal(await store.beginNewGame(profile,false),true,store.error);
 const campRaw=storage.raw(),camp=decode(campRaw),writes=storage.writes();
 assert.equal(camp.format,2);assert.equal(camp.rules,store.envelope.rules);assert.equal(camp.content,store.envelope.content);
 assert.deepEqual(Object.keys(camp).sort(),['build','format','profile','rules','sequence','content'].sort());
 assert.equal(Object.hasOwn(camp,'current'),false);assert.equal(Object.hasOwn(camp,'recent'),false);

 assert.equal(await store.depart('acceptance-midrun',103,0),true,store.error);
 assert.equal(storage.writes(),writes);assert.equal(storage.raw(),campRaw);
 assert.equal((await store.dispatch({type:'round',action:wait})).ok,true);
 assert.equal(storage.writes(),writes);assert.notDeepEqual(store.state,createMain('acceptance-midrun',true));
 const reopened=new TrialStore(storage,'acceptance');await reopened.whenReady;
 assert.equal(reopened.status,'ready');assert.equal(reopened.state,null);assert.deepEqual(reopened.profile,profile);
 assert.equal(storage.raw(),campRaw);
});

test('A2 expedition settlement writes once at the terminal; returning to camp is only a view change',async()=>{
 const storage=port(),store=new TrialStore(storage,'acceptance');
 assert.equal(await store.beginNewGame(gameProfile(),false),true);
 const startWrites=storage.writes(),before=store.envelope.profile.expeditions;
 assert.equal(await store.depart('acceptance-terminal',103,0),true);
 assert.equal(storage.writes(),startWrites);
 const ended=await finishExpedition(store);
 assert.equal(ended.phase,'ended');assert.equal(store.status,'ready');assert.equal(storage.writes(),startWrites+1);
 assert.equal(store.envelope.profile.expeditions,before+1);
 assert.equal(Object.hasOwn(store.envelope,'current'),false);assert.equal(Object.hasOwn(store.envelope,'recent'),false);
 assert.deepEqual(decode(storage.raw()),store.envelope);
 const saved=storage.raw(),writes=storage.writes(),summary=store.settlementSummary,profile=store.envelope.profile;
 assert.equal(await store.returnToBase(),true);assert.equal(store.state,null);assert.equal(store.atBase,true);
 assert.equal(storage.raw(),saved);assert.equal(storage.writes(),writes);assert.equal(store.settlementSummary,null);
 assert.ok(summary);const reopened=new TrialStore(storage,'acceptance');assert.deepEqual(reopened.profile,profile);
});

test('A3 terminal write failure retries the already settled result exactly once',async()=>{
 const storage=port(),store=new TrialStore(storage,'acceptance');
 assert.equal(await store.beginNewGame(gameProfile(),false),true);
 const startWrites=storage.writes(),before=store.profile.expeditions;
 assert.equal(await store.depart('acceptance-retry',103,0),true);
 storage.failNext();const ended=await finishExpedition(store);
 assert.equal(ended.phase,'ended');assert.equal(store.status,'failed');assert.equal(store.envelope.profile.expeditions,before+1);
 assert.equal(storage.writes(),startWrites);assert.equal(JSON.parse(storage.raw()).profile.expeditions,before);
 const candidate=store.envelope,summary=store.settlementSummary;
 assert.equal(await store.retry(),true,store.error);assert.equal(store.status,'ready');assert.equal(storage.writes(),startWrites+1);
 assert.deepEqual(store.envelope,candidate);assert.deepEqual(store.settlementSummary,summary);
 assert.equal(new TrialStore(storage,'acceptance').profile.expeditions,before+1);
});

test('A4 legacy in-progress saves drop the World while valid legacy ended saves settle once',async()=>{
 const running=legacy('run-before72.json'),runningPort=port(JSON.stringify(running)),runningStore=new TrialStore(runningPort,'acceptance');
 assert.equal(await runningStore.whenReady,true,runningStore.error);assert.equal(runningStore.status,'ready');
 assert.equal(runningStore.state,null);assert.equal(runningPort.writes(),1);assert.equal(JSON.parse(runningPort.raw()).format,2);

 const ended=legacy('ended-before72.json'),raw=JSON.stringify(ended),old=decodeLegacy(raw);
 const expected=settleRun(old.profile,old.current),endedPort=port(raw),endedStore=new TrialStore(endedPort,'acceptance');
 assert.equal(await endedStore.whenReady,true,endedStore.error);assert.equal(endedStore.state,null);
 assert.deepEqual(endedStore.profile,expected);assert.equal(endedStore.profile.expeditions,old.profile.expeditions+1);
 assert.equal(endedPort.writes(),1);assert.equal(Object.hasOwn(JSON.parse(endedPort.raw()),'current'),false);
 assert.equal(new TrialStore(endedPort,'acceptance').profile.expeditions,expected.expeditions);
});

test('A5 an old save without a valid camp profile stays blocked and keeps its bytes until explicit reset',async()=>{
 const old=legacy('run-before72.json');delete old.profile;const raw=JSON.stringify(old),storage=port(raw),store=new TrialStore(storage,'acceptance');
 assert.equal(await store.whenReady,false);assert.equal(store.status,'blocked');assert.equal(store.exportRaw(),raw);
 assert.equal(await store.resetAfterExport(createMain('reset-after-export',false),false),false);assert.equal(storage.raw(),raw);
 assert.equal(await store.resetAfterExport(createMain('reset-after-export',false),true),true);
 assert.equal(store.status,'ready');assert.equal(store.state.runId,'reset-after-export');
 assert.equal(storage.writes(),0);assert.equal(storage.raw(),raw,'developer reset changes memory only');
});

test('A6 a developer start is not persisted, and strict format 2 rejects embedded Worlds',async()=>{
 const storage=port(),store=new TrialStore(storage,'acceptance');
 const world=round(createMain('developer-only',true),wait);
 assert.equal(await store.start(world),true);assert.deepEqual(store.state,world);assert.equal(storage.writes(),0);
 assert.equal(new TrialStore(storage,'acceptance').status,'empty');
 const record={format:2,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:1,profile:gameProfile(),current:world};
 assert.throws(()=>decode(JSON.stringify(record)),/存档结构损坏|存档版本不兼容/);
});
