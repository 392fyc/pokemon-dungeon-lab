import test from 'node:test';
import assert from 'node:assert/strict';
import {TrialStore} from '../../src/core/save.ts';
import {createScenario} from '../../src/core/scenarios.ts';
import {applyCommand} from '../../src/core/engine.ts';
const act=(s,c)=>{const r=applyCommand(s,c);assert.equal(r.ok,true);return r.state;};
const exit={type:'round',action:{type:'interact',exit:true}};
async function saved(s){let raw=null;const port={getItem:()=>raw,setItem:(k,v)=>{raw=v;}};await new TrialStore(port,'isolation').start(s);return raw;}
const pending=act(createScenario('V13','pending'),exit);
const exiting=act(pending,{type:'invite',choice:'accept',outgoing:'B'});
const normal=act(exiting,{type:'finishExit'});
const wipe=act(createScenario('V12','wipe'),exit);
const playing=createScenario('V1','playing');
test('S9 four valid checkpoint phases restore unchanged',async()=>{
 for(const s of [playing,pending,exiting,normal,wipe]){const raw=await saved(s);const st=new TrialStore({getItem:()=>raw,setItem:()=>assert.fail('load must not write')},'isolation');assert.equal(st.status,'ready');assert.deepEqual(st.state,s);}
});
const mutations=[
 ['pending marked exit',pending,s=>s.phase='exit'],
 ['pending marked playing',pending,s=>{s.phase='playing';s.request=null;s.anchor=null;}],
 ['invitation without pending',pending,s=>s.invitations.forEach(i=>i.status='rejected')],
 ['unlocked request checkpoint',pending,s=>s.request.locked=false],
 ['playing with locked request',exiting,s=>s.phase='playing'],
 ['exit without request',exiting,s=>s.request=null],
 ['exit with leftover anchor',exiting,s=>s.anchor={x:4,y:1}],
 ['ended with unfinished invitation',normal,s=>s.invitations[0].status='pending'],
 ['ended with request',normal,s=>s.request=structuredClone(exiting.request)],
 ['wipe with survivor',wipe,s=>{s.units.A.hp=1;s.units.A.pos={x:4,y:1};}],
 ['normal without survivor',normal,s=>s.queue.forEach(id=>{s.units[id].hp=0;s.units[id].pos=null;})],
 ['processed item after pending',createScenario('V10','order'),s=>s.invitations[1].status='rejected'],
];
for(const [name,initial,mutate] of mutations)test('S9 rejects '+name+' and preserves bytes',async()=>{
 const e=JSON.parse(await saved(initial));mutate(e.current);const raw=JSON.stringify(e);let writes=0;
 const st=new TrialStore({getItem:()=>raw,setItem:()=>writes++},'isolation');assert.equal(st.status,'blocked');assert.equal(st.state,null);assert.equal(st.exportRaw(),raw);assert.equal(writes,0);
});
