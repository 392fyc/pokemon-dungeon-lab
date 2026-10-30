import test from 'node:test';
import assert from 'node:assert/strict';
import {TrialStore,BUILD_ID} from '../../src/core/save.ts';
import {createExpedition,createMain} from '../../src/core/engine.ts';
import {initialProfile,squadOf} from '../../src/core/base.ts';
import {round,interact,pos} from '../acceptance/fixtures.mjs';
import {expedition} from './expedition-fixtures.mjs';

function port(raw=null){let value=raw,writes=0;return {getItem:()=>value,setItem:(_key,v)=>{value=v;writes++;},raw:()=>value,writes:()=>writes};}
const pending=()=>round(expedition(),interact(true));
const oldRecord=(current,profile=initialProfile())=>({format:1,rules:'trial-rules-2',content:'trial-content-2',build:BUILD_ID,sequence:4,current,recent:null,profile});

test('E1 the in-memory controller can finish a pending transit without writing a World',async()=>{
 const storage=port(),store=new TrialStore(storage,'x'),world=pending();
 assert.equal(await store.start(world),true);
 assert.deepEqual(store.state,world);
 const writes=storage.writes();
 assert.equal((await store.dispatch({type:'finishTransit'})).ok,true);
 assert.equal(store.state.dungeon.level,2);assert.equal(store.state.phase,'playing');assert.equal(store.state.round,1);
 assert.equal(storage.writes(),writes,'finishing the transit is an in-memory operation');
 const reopened=new TrialStore(storage,'x');assert.equal(reopened.status,'empty');assert.equal(reopened.state,null);
});

test('E2 a base departure and accepted round stay in memory; reopening returns to the original camp',async()=>{
 const storage=port(),store=new TrialStore(storage,'x'),profile=initialProfile();
 assert.equal(await store.beginNewGame(profile,false),true);
 const campRaw=storage.raw(),campWrites=storage.writes();
 assert.equal(await store.depart('ephemeral-run',2024,0),true);
 assert.equal(storage.raw(),campRaw);assert.equal(storage.writes(),campWrites);
 assert.equal(store.state.runId,'ephemeral-run');
 const result=await store.dispatch({type:'round',action:{type:'wait'}});
 assert.equal(result.ok,true,result.error);assert.equal(store.state.round,1);
 assert.equal(storage.raw(),campRaw);assert.equal(storage.writes(),campWrites);
 const reopened=new TrialStore(storage,'x');await reopened.whenReady;
 assert.equal(reopened.status,'ready',reopened.error);assert.equal(reopened.atBase,true);assert.equal(reopened.state,null);
 assert.deepEqual(reopened.profile,profile);
});

test('E3 a storage failure does not block a developer World that is deliberately memory-only',async()=>{
 const storage={getItem:()=>null,setItem:()=>{throw Error('disk');}},store=new TrialStore(storage,'x');
 const world=createExpedition('memory-only',24);
 assert.equal(await store.start(world),true);
 assert.deepEqual(store.state,world);
 assert.equal((await store.dispatch({type:'round',action:{type:'wait'}})).ok,true);
 assert.equal(store.state.round,1);
 assert.equal(store.status,'ready');
});

const activeWorldMutations=[
 ['invalid position',s=>{s.units[s.leader].pos=pos(40);}],
 ['missing transit target',s=>{delete s.request.to;}],
 ['transit relabelled exit',s=>{s.phase='exit';}],
 ['wrong target floor',s=>{s.request.to=3;}],
 ['same target floor',s=>{s.request.to=1;}],
 ['unlocked request',s=>{s.request.locked=false;}],
 ['missing dungeon',s=>{delete s.dungeon;}],
 ['current level outside range',s=>{s.dungeon.level=3;}],
 ['duplicate stored level',s=>{s.dungeon.stored['1']=structuredClone(s.dungeon.stored['2']);}],
 ['stored unit id repeats live id',s=>{const f=s.dungeon.stored['2'];f.units.E=f.units.w2a;f.units.E.id='E';f.enemies=['E'];delete f.units.w2a;}],
 ['stored enemy outside floor',s=>{s.dungeon.stored['2'].units.w2a.pos=pos(40);}],
 ['stored enemy list mismatch',s=>{s.dungeon.stored['2'].enemies=[];}],
 ['stored point outside floor',s=>{s.dungeon.stored['2'].points[0].pos=pos(40);}],
 ['stored floor outside map',s=>{s.dungeon.stored['2'].floor.push(pos(30));}],
 ['wrong scenario',s=>{s.scenario='main-invite';}],
 ['up stairs on first floor',s=>{s.points.push({pos:structuredClone(s.floor[0]),kind:'up',used:false});}],
 ['exit on a lower floor',s=>{const f=s.dungeon.stored['2'];f.points.push({pos:structuredClone(f.floor[0]),kind:'exit',used:false});}],
 ['down stairs on last floor',s=>{const f=s.dungeon.stored['2'];f.points.push({pos:structuredClone(f.floor[0]),kind:'down',used:false});}],
];
for(const [name,mutate] of activeWorldMutations)test(`E4 old active World is discarded without validation: ${name}`,async()=>{
 const world=structuredClone(pending());mutate(world);
 const raw=JSON.stringify(oldRecord(world)),storage=port(raw),store=new TrialStore(storage,'x');
 assert.equal(await store.whenReady,true,store.error);
 assert.equal(store.status,'ready',store.error);assert.equal(store.state,null);assert.equal(store.atBase,true);
 assert.deepEqual(store.profile,initialProfile());
 assert.deepEqual(Object.keys(store.envelope).sort(),['format','rules','content','build','sequence','profile'].sort());
 assert.equal(store.envelope.format,2);assert.equal(store.envelope.rules,'trial-rules-3');
 assert.equal(store.envelope.content,'trial-content-3');assert.equal(storage.writes(),1);
 assert.deepEqual(JSON.parse(storage.raw()),store.envelope);
});

test('E5 an old World with no camp profile stays blocked and its original bytes remain exportable',async()=>{
 const e=oldRecord(pending());delete e.profile;
 const raw=JSON.stringify(e),storage=port(raw),store=new TrialStore(storage,'x');
 await store.whenReady;
 assert.equal(store.status,'blocked');assert.equal(store.state,null);
 assert.equal(store.exportRaw(),raw);assert.equal(storage.raw(),raw);assert.equal(storage.writes(),0);
});

test('E6 fixed-map worlds remain available to developer tests only in the same memory controller',async()=>{
 const storage=port(),store=new TrialStore(storage,'x'),world=createMain('fixed-map-memory',false);
 assert.equal(await store.start(world),true);assert.deepEqual(store.state,world);
 assert.equal(store.exportRecord(),null);assert.equal(storage.raw(),null);assert.equal(storage.writes(),0);
 const reopened=new TrialStore(storage,'x');assert.equal(reopened.status,'empty');assert.equal(reopened.state,null);
});
