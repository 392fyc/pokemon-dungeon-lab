import test from 'node:test';
import assert from 'node:assert/strict';
import {createMain} from '../../src/core/engine.ts';
import {TrialStore} from '../../src/core/save.ts';
import {V,round,move,basic,interact,doCmd,accept,refuse,finish,pos,coords,hp,pp} from './fixtures.mjs';

function port(raw=null){
 let value=raw,fail=false,hold=false,pending=null;
 const attempts=[];
 return {attempts,getItem(){return value;},async setItem(k,v){
  attempts.push(v);
  if(fail)throw Error('INDEPENDENT_WRITE_FAILURE');
  if(hold)await new Promise((resolve,reject)=>{assert.equal(pending,null);pending={resolve,reject};});
  value=v;
 },raw(){return value;},fail(v=true){fail=v;},hold(){hold=true;},
 release(){hold=false;const p=pending;pending=null;p.resolve();},
 reject(){hold=false;const p=pending;pending=null;p.reject(Error('INDEPENDENT_HELD_FAILURE'));}
 };
}
function prefix4(){
 let s=createMain('save-run',true);
 for(const a of [move(3),basic('E'),basic('E'),basic('E')])s=round(s,a);
 return s;
}
function scout(){
 let s=refuse(prefix4());
 for(const a of [move(4),interact(false),move(5)])s=round(s,a);
 return s;
}
async function reopen(s){
 const p=port();const a=new TrialStore(p,'acceptance');assert.equal(await a.start(s),true);
 const raw=p.raw(),b=new TrialStore(p,'acceptance');
 assert.equal(b.status,'ready');assert.deepEqual(b.state,s);assert.equal(p.raw(),raw);
 return {p,a,b};
}
test('S1 ordinary saved state is exact, not replayed',async()=>{
 const {b}=await reopen(scout());
 assert.equal(b.state.round,7);assert.deepEqual(coords(b.state),[pos(2),pos(3),pos(5)]);
 assert.deepEqual(hp(b.state),[20,20,8]);assert.deepEqual(pp(b.state),[{strong:2},{guard:2},{strong:2,line:2}]);
 assert.equal(b.state.seen.includes('9,1'),true);assert.equal(b.state.units.R.hp,6);
});
test('S2 pending invitation survives repeated reads/reopen',async()=>{
 const s=prefix4(),{b,p}=await reopen(s);const before=p.raw();
 for(let i=0;i<3;i++){assert.equal(b.state.phase,'invitation');assert.deepEqual(b.state.anchor,pos(3));assert.equal(b.state.invitations[0].unit.hp,10);assert.deepEqual(b.state.invitations[0].unit.pp,{strong:1,push:1});}
 assert.deepEqual(b.state.invitations,s.invitations);assert.equal(p.raw(),before);
});
test('S3 one processed invitation resumes second once',async()=>{
 const s=accept(V(10),'A'),{b,p}=await reopen(s);
 assert.deepEqual(b.state.camp,['A']);assert.deepEqual(b.state.units.N1.pos,pos(2,2));assert.equal(b.state.leader,'B');
 const r=await b.dispatch({type:'invite',choice:'accept',outgoing:'C'});assert.equal(r.ok,true);
 assert.deepEqual(b.state.camp,['A','C']);assert.deepEqual(b.state.queue,['B','N1','N2']);assert.deepEqual(b.state.units.N2.pos,pos(3,2));
 const c=new TrialStore(p,'acceptance');assert.deepEqual(c.state,b.state);
});
for(const stage of ['invite','exit'])test('S4 restore valid request '+stage,async()=>{
 let s=round(V(13),interact(true));if(stage==='exit')s=accept(s,'B');
 const {b,p}=await reopen(s);assert.equal(b.state.request.locked,true);
 if(stage==='invite'){assert.equal(b.state.phase,'invitation');await b.dispatch({type:'invite',choice:'accept',outgoing:'B'});}
 assert.equal(b.state.phase,'exit');assert.equal(b.state.round,1);
 await b.dispatch({type:'finishExit'});assert.equal(b.state.end.outcome,'normal');assert.equal(b.state.round,1);
 const raw=p.raw();assert.equal((await b.dispatch({type:'finishExit'})).ok,false);assert.equal(p.raw(),raw);
});
for(const mode of ['normal','wipe'])test('S5 terminal reload '+mode,async()=>{
 const s=mode==='normal'?finish(round(V(7),interact(true))):round(V(12),interact(true));
 const {b,p}=await reopen(s);const before=p.raw();
 for(let i=0;i<2;i++){assert.equal((await b.dispatch({type:'finishExit'})).ok,false);assert.equal((await b.dispatch({type:'round',action:move(1)})).ok,false);}
 assert.deepEqual(b.state.end,s.end);assert.equal(p.raw(),before);assert.equal(b.state.end.brought,0);
});
const boundaries=[
 ['ordinary',()=>createMain('ordinary',false),{type:'round',action:move(3)}],
 ['invite-created',()=>{let s=createMain('invite',true);for(const a of [move(3),basic('E'),basic('E')])s=round(s,a);return s;},{type:'round',action:basic('E')}],
 ['item-processed',()=>V(10),{type:'invite',choice:'accept',outgoing:'A'}],
 ['exit-pending',()=>V(7),{type:'round',action:interact(true)}],
 ['normal-terminal',()=>round(V(7),interact(true)),{type:'finishExit'}],
 ['failure-terminal',()=>V(12),{type:'round',action:interact(true)}]
];
for(const [id,initial,cmd] of boundaries)test('S6 failed write '+id,async()=>{
 const {a,p}=await reopen(initial());const old=p.raw(),oldLabel=a.lastSaved;p.fail();
 await a.dispatch(cmd);assert.equal(a.status,'failed');assert.equal(p.raw(),old);assert.equal(a.lastSaved,oldLabel);
 const candidate=a.envelope,failedPayload=p.attempts.at(-1);
 for(const command of [{type:'switch',actor:'A'},{type:'round',action:move(1)},{type:'invite',choice:'reject'},{type:'finishExit'}])assert.equal((await a.dispatch(command)).ok,false);
 assert.equal(await a.newTrial(createMain('blocked-new',false)),false);assert.deepEqual(a.envelope,candidate);
 assert.equal(await a.retry(),false);assert.equal(p.attempts.at(-1),failedPayload);
 p.fail(false);assert.equal(await a.retry(),true);assert.equal(p.attempts.at(-1),failedPayload);
 assert.deepEqual(new TrialStore(p,'acceptance').envelope,candidate);
});
test('S6 asynchronous saving gate rejects mutation then releases same result',async()=>{
 const {a,p}=await reopen(createMain('async',false)),old=p.raw(),oldLabel=a.lastSaved;
 p.hold();const running=a.dispatch({type:'round',action:move(3)});
 assert.equal(a.status,'saving');assert.equal(p.raw(),old);assert.equal(a.lastSaved,oldLabel);
 const candidate=a.envelope;
 assert.equal((await a.dispatch({type:'round',action:move(4)})).ok,false);
 assert.equal((await a.dispatch({type:'switch',actor:'A'})).ok,false);
 assert.equal(await a.newTrial(createMain('blocked',false)),false);
 assert.deepEqual(a.envelope,candidate);p.release();await running;
 assert.equal(a.status,'ready');assert.equal(a.state.round,1);assert.equal(a.state.units.C.hp,16);assert.equal(a.lastSaved!==oldLabel,true);
});
test('S6 asynchronous rejected write preserves last successful raw',async()=>{
 const {a,p}=await reopen(createMain('async-fail',false)),old=p.raw();p.hold();
 const running=a.dispatch({type:'round',action:move(3)});assert.equal(a.status,'saving');p.reject();await running;
 assert.equal(a.status,'failed');assert.equal(p.raw(),old);const bytes=p.attempts.at(-1);
 await a.retry();assert.equal(p.attempts.at(-1),bytes);assert.equal(a.state.round,1);
});
test('S7 initial failure is not a recoverable save',async()=>{
 const p=port();p.fail();const a=new TrialStore(p,'acceptance');
 assert.equal(await a.start(createMain('first',false)),false);assert.equal(a.status,'failed');assert.equal(a.lastSaved,null);
 assert.equal(p.raw(),null);assert.equal((await a.dispatch({type:'round',action:move(3)})).ok,false);
 assert.equal(new TrialStore(p,'acceptance').status,'empty');
 const first=p.attempts[0];p.fail(false);await a.retry();assert.equal(p.attempts.at(-1),first);
});
test('S8 restart preserves terminal and retries identical new run identity',async()=>{
 const terminal=round(V(12),interact(true)),{a,p}=await reopen(terminal),old=p.raw();
 p.fail();assert.equal(await a.newTrial(createMain('new-independent',false)),false);
 const candidate=a.envelope,payload=p.attempts.at(-1);
 assert.equal(p.raw(),old);assert.deepEqual(candidate.recent,terminal);
 assert.equal(candidate.current.runId,'new-independent');assert.deepEqual(hp(candidate.current),[20,20,20]);assert.equal(candidate.current.bag,0);assert.deepEqual(candidate.current.camp,[]);
 assert.equal(await a.newTrial(createMain('must-not-regenerate',false)),false);assert.deepEqual(a.envelope,candidate);
 p.fail(false);assert.equal(await a.retry(),true);assert.equal(p.attempts.at(-1),payload);
 const b=new TrialStore(p,'acceptance');assert.deepEqual(b.envelope,candidate);assert.equal(b.state.round,0);
});
for(const alteration of ['json','format','rules','content','negativePP','missingInviteUnit','pendingInviteMarkedExit'])test('S9 invalid save '+alteration,async()=>{
 const s=alteration==='pendingInviteMarkedExit'?round(V(13),interact(true)):alteration==='missingInviteUnit'?prefix4():createMain('corrupt',false),{p}=await reopen(s);
 let e=JSON.parse(p.raw());
 if(alteration==='format')e.format=999;
 if(alteration==='rules')e.rules='future-rules';
 if(alteration==='content')e.content='future-content';
 if(alteration==='negativePP')e.current.units.A.pp.strong=-1;
 if(alteration==='missingInviteUnit')delete e.current.invitations[0].unit;
 if(alteration==='pendingInviteMarkedExit')e.current.phase='exit';
 const raw=alteration==='json'?'{broken':JSON.stringify(e),bad=port(raw),a=new TrialStore(bad,'acceptance');
 assert.equal(a.status,'blocked');assert.equal(bad.raw(),raw);
 assert.equal(await a.resetAfterExport(createMain('reset',false),true),false);
 assert.equal(a.exportRaw(),raw);assert.equal(await a.resetAfterExport(createMain('reset',false),false),false);
 assert.equal(await a.resetAfterExport(createMain('reset',false),true),true);
 assert.equal(a.status,'ready');assert.equal(a.state.runId,'reset');
});
