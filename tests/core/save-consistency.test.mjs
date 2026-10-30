import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TrialStore,decode,BUILD_ID} from '../../src/core/save.ts';
import {RULE_VERSION,CONTENT_VERSION} from '../../src/core/engine.ts';
import {initialProfile} from '../../src/core/base.ts';

const fixture=name=>JSON.parse(readFileSync(new URL(`./fixtures77-regression/${name}`,import.meta.url),'utf8'));
function port(raw){let value=raw,writes=0;return {getItem:()=>value,setItem:(_key,next)=>{value=next;writes++;},raw:()=>value,writes:()=>writes};}
const campRecord=(profile=initialProfile())=>({format:2,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:1,profile});

test('S1 the current decoder accepts a camp-only record and rejects embedded World fields',()=>{
 const record=campRecord();
 assert.deepEqual(decode(JSON.stringify(record)),record);
 for(const field of ['current','recent']){
  const bad={...record,[field]:null};
  assert.throws(()=>decode(JSON.stringify(bad)),/存档结构损坏/);
 }
});

test('S2 an old in-progress World is discarded without validation; a valid camp is saved in format 2',async()=>{
 const old=fixture('run-before72.json');
 old.current.units.A.pp.unknown=4;
 const raw=JSON.stringify(old),storage=port(raw),store=new TrialStore(storage,'migration');
 assert.equal(await store.whenReady,true,store.error);
 assert.equal(store.status,'ready');assert.equal(store.state,null);assert.equal(store.atBase,true);
 assert.equal(store.envelope.format,2);assert.equal(store.envelope.rules,RULE_VERSION);assert.equal(store.envelope.content,CONTENT_VERSION);
 assert.equal(Object.hasOwn(store.envelope,'current'),false);assert.equal(Object.hasOwn(store.envelope,'recent'),false);
 assert.deepEqual(store.profile.roster.map(i=>i.species),['charmander','squirtle','bulbasaur']);
 assert.deepEqual(store.profile.roster[0].learned,[{move:'scratch',pp:3},{move:'ember',pp:2}]);
 assert.equal(storage.writes(),1);assert.deepEqual(JSON.parse(storage.raw()),store.envelope);
});

test('S3 an old ended World is fully validated, settled once, then stored as camp only',async()=>{
 const raw=JSON.stringify(fixture('ended-before72.json')),storage=port(raw),store=new TrialStore(storage,'ended-migration');
 assert.equal(await store.whenReady,true,store.error);
 assert.equal(store.status,'ready');assert.equal(store.state,null);assert.equal(store.envelope.format,2);
 assert.equal(store.profile.expeditions,1);assert.equal(store.profile.account,100);
 assert.deepEqual(store.profile.vault,{});
 assert.equal(Object.hasOwn(store.envelope,'current'),false);assert.equal(Object.hasOwn(store.envelope,'recent'),false);
 assert.equal(storage.writes(),1);
 const saved=storage.raw(),again=new TrialStore(storage,'ended-migration');
 assert.equal(await again.whenReady,true);assert.equal(again.status,'ready');
 assert.equal(again.profile.expeditions,1,'reopening the new camp record must not settle the old run again');
 assert.equal(storage.raw(),saved);assert.equal(storage.writes(),1);
});

test('S4 an old recent history is discarded without settling it a second time',async()=>{
 const old=fixture('recent-before72.json'),originalExpeditions=old.profile.expeditions;
 const raw=JSON.stringify(old),storage=port(raw),store=new TrialStore(storage,'recent-migration');
 assert.equal(await store.whenReady,true,store.error);
 assert.equal(store.status,'ready');assert.equal(store.state,null);
 assert.equal(store.profile.expeditions,originalExpeditions);
 assert.equal(Object.hasOwn(store.envelope,'recent'),false);assert.equal(storage.writes(),1);
});

test('S5 an ended old World that fails full validation blocks without rewriting its bytes',async()=>{
 const old=fixture('ended-before72.json');old.current.units.A.pp.unknown=4;
 const raw=JSON.stringify(old),storage=port(raw),store=new TrialStore(storage,'bad-ended');
 assert.equal(await store.whenReady,false);
 assert.equal(store.status,'blocked');assert.equal(store.state,null);
 assert.equal(store.exportRaw(),raw);assert.equal(storage.raw(),raw);assert.equal(storage.writes(),0);
});

test('S6 an old in-progress record without a camp profile is preserved for export and blocks loading',async()=>{
 const old=fixture('run-before72.json');delete old.profile;
 const raw=JSON.stringify(old),storage=port(raw),store=new TrialStore(storage,'no-camp');
 assert.equal(await store.whenReady,false);
 assert.equal(store.status,'blocked');assert.equal(store.exportRaw(),raw);
 assert.equal(storage.raw(),raw);assert.equal(storage.writes(),0);
});
