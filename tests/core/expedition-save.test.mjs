import test from 'node:test';
import assert from 'node:assert/strict';
import {TrialStore} from '../../src/core/save.ts';
import {createExpedition,createMain} from '../../src/core/engine.ts';
import {round,interact,pos} from '../acceptance/fixtures.mjs';
import {expedition} from './expedition-fixtures.mjs';
function port(raw=null){let value=raw,writes=0;return {getItem:()=>value,setItem:(k,v)=>{value=v;writes++;},raw:()=>value,writes:()=>writes};}
const pending=()=>round(expedition(),interact(true));
const opened=async s=>{const p=port();const a=new TrialStore(p,'x');assert.equal(await a.start(s),true);return {p,a};};

test('E1 a pending transit restores as a pending transit, and one finishTransit crosses exactly once',async()=>{
 const {p}=await opened(pending());
 const b=new TrialStore(p,'x');assert.equal(b.status,'ready');assert.equal(b.state.phase,'transit');assert.equal(b.state.dungeon.level,1);
 const written=p.writes();
 assert.equal((await b.dispatch({type:'finishTransit'})).ok,true);
 assert.equal(b.state.dungeon.level,2);assert.equal(b.state.phase,'playing');assert.equal(b.state.round,1);assert.equal(p.writes(),written+1);
 assert.equal((await b.dispatch({type:'finishTransit'})).ok,false);assert.equal(p.writes(),written+1);
});
test('E2 after a crossing, closing and reopening gives the identical state, and reading never writes',async()=>{
 const {p,a}=await opened(pending());
 await a.dispatch({type:'finishTransit'});
 const writes=p.writes(),c=new TrialStore(p,'x');
 assert.equal(c.status,'ready');assert.deepEqual(c.state,a.state);assert.equal(p.writes(),writes);
 assert.deepEqual(c.state.units.C.pos,pos(3));assert.deepEqual(Object.keys(c.state.dungeon.stored),['1']);
 assert.equal(c.state.dungeon.stored['1'].units.E.hp,5);
});
test('E3 a failed write of the pending state is retried without crossing or spending another round',async()=>{
 const p=port();const a=new TrialStore({getItem:p.getItem,setItem:()=>{throw Error('disk');}},'x');
 const s=pending();await a.start(s);assert.equal(a.status,'failed');
 assert.equal((await a.dispatch({type:'finishTransit'})).ok,false);assert.equal(a.state.dungeon.level,1);assert.equal(a.state.round,1);
});
test('E4 a generated expedition round-trips through the save format',async()=>{
 const s=createExpedition('save-gen',2024);const {p}=await opened(s);
 const b=new TrialStore(p,'x');assert.equal(b.status,'ready');assert.deepEqual(b.state,s);
});
const mutations=[
 ['transit without stairs target',s=>{delete s.request.to;}],
 ['transit relabelled exit',s=>{s.phase='exit';}],
 ['transit with wrong target floor',s=>{s.request.to=3;}],
 ['transit with target equal to current floor',s=>{s.request.to=1;}],
 ['transit request not locked',s=>{s.request.locked=false;}],
 ['transit without dungeon',s=>{delete s.dungeon;}],
 ['current level outside range',s=>{s.dungeon.level=3;}],
 ['current level also stored',s=>{s.dungeon.stored['1']=structuredClone(s.dungeon.stored['2']);}],
 ['stored unit id repeats a live id',s=>{const f=s.dungeon.stored['2'];f.units.E=f.units.w2a;f.units.E.id='E';f.enemies=['E'];delete f.units.w2a;}],
 ['stored enemy outside its floor',s=>{s.dungeon.stored['2'].units.w2a.pos=pos(40);}],
 ['stored enemy list and units disagree',s=>{s.dungeon.stored['2'].enemies=[];}],
 ['stored point outside its floor',s=>{s.dungeon.stored['2'].points[0].pos=pos(40);}],
 ['stored floor outside map bounds',s=>{s.dungeon.stored['2'].floor.push(pos(30));}],
 ['expedition scenario without dungeon is rejected even when playing',s=>{s.phase='playing';s.request=null;delete s.dungeon;}],
 ['dungeon on a non-expedition scenario',s=>{s.scenario='main-invite';}],
 ['stairs request marked as plain exit (no target)',s=>{delete s.request.to;s.phase='exit';}],
 ['up stairs on the first floor',s=>{s.points.push({pos:structuredClone(s.floor[0]),kind:'up',used:false});}],
 ['exit on a floor below the first',s=>{const f=s.dungeon.stored['2'];f.points.push({pos:structuredClone(f.floor[0]),kind:'exit',used:false});}],
 ['down stairs on the last floor',s=>{const f=s.dungeon.stored['2'];f.points.push({pos:structuredClone(f.floor[0]),kind:'down',used:false});}],
];
for(const [name,mutate] of mutations)test('E5 rejects '+name+' and preserves bytes',async()=>{
 const {p}=await opened(pending());const e=JSON.parse(p.raw());mutate(e.current);const raw=JSON.stringify(e);
 const q=port(raw);const st=new TrialStore(q,'x');
 assert.equal(st.status,'blocked');assert.equal(st.state,null);assert.equal(st.exportRaw(),raw);assert.equal(q.writes(),0);
});
test('E6 an exit-phase request carrying a stairs target is rejected',async()=>{
 const base=round(expedition({c:pos(8)}),interact(true));   // C on the already-taken goal: a plain exit request
 assert.equal(base.phase,'exit');
 const {p}=await opened(base);const e=JSON.parse(p.raw());e.current.request.to=2;
 const st=new TrialStore(port(JSON.stringify(e)),'x');assert.equal(st.status,'blocked');
});
test('E7 a fixed-map save carrying a stairs point is rejected (it would crash on interaction)',async()=>{
 const m=createMain('stairs-main',false);m.points.push({pos:structuredClone(m.units.C.pos),kind:'down',used:false});
 const {p}=await opened(m);const raw=p.raw();const st=new TrialStore(port(raw),'x');
 assert.equal(st.status,'blocked');assert.equal(st.exportRaw(),raw);
});
