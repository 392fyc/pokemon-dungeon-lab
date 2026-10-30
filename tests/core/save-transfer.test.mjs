import test from 'node:test';
import assert from 'node:assert/strict';
import {TrialStore,decode,BUILD_ID} from '../../src/core/save.ts';
import {RULE_VERSION,CONTENT_VERSION} from '../../src/core/engine.ts';
import {createScenario} from '../../src/core/scenarios.ts';
import {newGameProfile} from '../../src/core/base.ts';

function port(initial=null){
 let value=initial,writes=0;
 return {getItem:()=>value,setItem:(key,next)=>{value=next;writes++;},raw:()=>value,writes:()=>writes};
}
async function makeRecord(runId){
 const storage=port(),store=new TrialStore(storage,'transfer');
 assert.equal(await store.start(createScenario('V1',runId)),true,store.error);
 return {storage,store,raw:store.exportRecord()};
}
function legacyProfileRecord(){
 const profile=newGameProfile('treecko','torchic').profile;
 for(const instance of profile.roster)delete instance.protected;
 delete profile.account;delete profile.rescue;delete profile.lost;delete profile.origin;
 return {format:1,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:2,current:null,recent:null,profile};
}

test('exportRecord emits the full versioned record and import round-trips the validated rule state',async()=>{
 const source=await makeRecord('transfer-source');
 const exported=JSON.parse(source.raw);
 assert.equal(exported.format,1);
 assert.equal(exported.rules,RULE_VERSION);
 assert.equal(exported.content,CONTENT_VERSION);
 assert.equal(exported.build,BUILD_ID);
 assert.equal(exported.sequence,1);
 assert.ok(Object.hasOwn(exported,'current'));
 assert.ok(Object.hasOwn(exported,'recent'));

 const targetStorage=port(),target=new TrialStore(targetStorage,'transfer');
 assert.equal(target.exportRecord(),null);
 assert.equal(await target.importRecord(source.raw,false),true,'an empty store has no record to overwrite');
 assert.deepEqual(target.envelope,source.store.envelope);
 assert.deepEqual(new TrialStore(targetStorage,'transfer').state,source.store.state);
 assert.equal(target.status,'ready');
});

test('a tampered record is rejected without replacing either the current memory or disk record',async()=>{
 const current=await makeRecord('keep-current');
 const incoming=await makeRecord('tampered-source');
 const bad=JSON.parse(incoming.raw);bad.current.round=-1;
 const before=current.store.envelope,bytes=current.storage.raw(),writes=current.storage.writes();
 assert.equal(await current.store.importRecord(JSON.stringify(bad),true),false);
 assert.deepEqual(current.store.envelope,before);
 assert.equal(current.storage.raw(),bytes);
 assert.equal(current.storage.writes(),writes);
 assert.match(current.store.importError,/损坏|不兼容|有效/);
});

test('an older supported profile schema migrates on import and an unsupported rules version is refused',async()=>{
 const old=legacyProfileRecord();
 const storage=port(),store=new TrialStore(storage,'transfer');
 assert.equal(await store.importRecord(JSON.stringify(old),false),true);
 assert.equal(store.profile.roster.every(instance=>typeof instance.protected==='boolean'),true);
 assert.equal(store.profile.account,0);
 assert.equal(store.profile.origin,'P1');
 assert.equal(JSON.parse(storage.raw()).rules,RULE_VERSION);

 const current=await makeRecord('version-guard');
 const incompatible={...old,rules:'trial-rules-previous'};
 const before=current.store.envelope,bytes=current.storage.raw(),writes=current.storage.writes();
 assert.equal(await current.store.importRecord(JSON.stringify(incompatible),true),false);
 assert.deepEqual(current.store.envelope,before);
 assert.equal(current.storage.raw(),bytes);
 assert.equal(current.storage.writes(),writes);
 assert.match(current.store.importError,/版本不兼容/);
});

test('overwriting a readable record requires explicit confirmation',async()=>{
 const current=await makeRecord('confirmed-current');
 const incoming=await makeRecord('confirmed-incoming');
 const before=current.store.envelope,bytes=current.storage.raw(),writes=current.storage.writes();
 assert.equal(await current.store.importRecord(incoming.raw,false),false);
 assert.deepEqual(current.store.envelope,before);
 assert.equal(current.storage.raw(),bytes);
 assert.equal(current.storage.writes(),writes);
 assert.match(current.store.importError,/确认/);
 assert.equal(await current.store.importRecord(incoming.raw,true),true);
 assert.equal(current.store.importError,'');
 assert.deepEqual(current.store.envelope,incoming.store.envelope);
});

test('blocked raw bytes must be exported before import can replace them',async()=>{
 const damaged='{"format":999, "original":"keep exactly"}';
 const storage=port(damaged),blocked=new TrialStore(storage,'transfer');
 const incoming=await makeRecord('blocked-import');
 assert.equal(blocked.status,'blocked');
 assert.equal(blocked.exportRecord(),null);
 assert.equal(await blocked.importRecord(incoming.raw,true),false);
 assert.equal(storage.raw(),damaged);
 assert.equal(blocked.exportRaw(),damaged);
 assert.equal(await blocked.importRecord(incoming.raw,true),true);
 assert.deepEqual(blocked.envelope,incoming.store.envelope);
});

test('a failed storage write restores the old in-memory and disk records',async()=>{
 const storage=port(),current=new TrialStore(storage,'transfer');
 assert.equal(await current.start(createScenario('V1','write-failure-current')),true);
 const source=await makeRecord('write-failure-source');
 storage.setItem=()=>{throw Error('disk quota');};
 const before=current.envelope,bytes=storage.raw(),lastSaved=current.lastSaved;
 assert.equal(await current.importRecord(source.raw,true),false);
 assert.deepEqual(current.envelope,before);
 assert.equal(storage.raw(),bytes);
 assert.equal(current.lastSaved,lastSaved);
 assert.equal(current.status,'ready');
 assert.match(current.importError,/导入保存失败/);
 assert.notDeepEqual(source.store.envelope,current.envelope);
});

test('saving and failed stores reject imports until the existing save is resolved',async()=>{
 let stored=null,finishWrite;
 const delayed={getItem:()=>stored,setItem:(key,value)=>new Promise(resolve=>{finishWrite=()=>{stored=value;resolve();};})};
 const saving=new TrialStore(delayed,'transfer');
 const candidate=JSON.stringify(legacyProfileRecord());
 const first=saving.importRecord(candidate,false);
 assert.equal(saving.status,'saving');
 assert.equal(await saving.importRecord(candidate,true),false);
 assert.equal(stored,null);
 finishWrite();
 assert.equal(await first,true);
 assert.equal(saving.status,'ready');

 const failed=new TrialStore({getItem:()=>null,setItem:()=>{throw Error('disk');}},'transfer');
 assert.equal(await failed.start(createScenario('V1','failed-save')),false);
 assert.equal(failed.status,'failed');
 const state=failed.envelope;
 assert.equal(await failed.importRecord(candidate,true),false);
 assert.deepEqual(failed.envelope,state);
 assert.equal(failed.status,'failed');
 assert.match(failed.importError,/保存尚未完成/);
});

test('decode reports malformed JSON and JSON null in Chinese',()=>{
 for(const raw of ['{','null','"not a record"'])assert.throws(()=>decode(raw),/存档/);
});

test('failed imports preserve the blocked save diagnosis',async()=>{
 const damaged='{"format":999}',storage=port(damaged),store=new TrialStore(storage,'transfer');
 const incoming=await makeRecord('blocked-diagnosis');
 const diagnosis=store.error;
 assert.match(diagnosis,/版本不兼容/);
 assert.equal(await store.importRecord(incoming.raw,true),false);
 assert.equal(store.error,diagnosis);
 store.exportRaw();
 assert.equal(await store.importRecord('{',true),false);
 assert.equal(store.error,diagnosis);
 storage.setItem=()=>{throw Error('disk quota');};
 assert.equal(await store.importRecord(incoming.raw,true),false);
 assert.equal(store.error,diagnosis);
 assert.equal(store.status,'blocked');assert.equal(storage.raw(),damaged);
});

test('failed imports preserve a ready save error state',async()=>{
 const {store,storage,raw}=await makeRecord('ready-diagnosis');
 const diagnosis=store.error;assert.equal(diagnosis,'');
 assert.equal(await store.importRecord('{',true),false);
 assert.equal(store.error,diagnosis);
 assert.equal(await store.importRecord(raw,false),false);
 assert.equal(store.error,diagnosis);
 storage.setItem=()=>{throw Error('disk quota');};
 assert.equal(await store.importRecord(raw,true),false);
 assert.equal(store.error,diagnosis);
 assert.equal(store.status,'ready');assert.equal(storage.raw(),raw);
});
