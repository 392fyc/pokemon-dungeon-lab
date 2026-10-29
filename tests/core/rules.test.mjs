import test from 'node:test';
import assert from 'node:assert/strict';
import {createMain,applyCommand,previewInvitation,clone} from '../../src/core/engine.ts';
import {createScenario} from '../../src/core/scenarios.ts';
import {TrialStore,decode} from '../../src/core/save.ts';
const move=x=>({type:'move',to:{x,y:1}}), basic=target=>({type:'basic',target}), skill=(skill,target)=>({type:'skill',skill,target}), wait={type:'wait'}, interact=exit=>({type:'interact',exit});
function command(s,c){const r=applyCommand(s,c);assert.equal(r.ok,true,r.error);return r.state;}
const round=(s,action,override)=>command(s,{type:'round',action,override});
const reject=s=>s.phase==='invitation'?command(s,{type:'invite',choice:'reject'}):s;
const finish=s=>s.phase==='exit'?command(s,{type:'finishExit'}):s;
const positions=s=>s.queue.map(id=>s.units[id].pos?.x??null);
function prefix(invite=true){let s=createMain('main',invite);s=round(s,move(3));for(let i=0;i<3;i++)s=round(s,basic('E'));return s;}
test('M1/M2/M3 and no-invitation routes: published terminal resources',()=>{
 for(const invited of [true,false])for(const route of [1,2,3]){
 let s=reject(prefix(invited));s=round(s,move(4));s=round(s,interact(route===1));
 if(route!==1){s=round(s,move(5));assert.equal(s.seen.includes('9,1'),true);
 if(route===2){s=command(s,{type:'switch',actor:'B'});s=round(s,move(4));s=round(s,interact(true));}
 else{s=round(s,move(6));s=round(s,skill('line','R'));s=round(s,move(7));s=round(s,interact(true));}}
 s=finish(s);assert.equal(s.round,[0,6,9,11][route]);assert.equal(s.end.outcome,'normal');assert.deepEqual(positions(s),route===1?[1,3,4]:route===2?[3,4,5]:[4,6,7]);assert.equal(s.units.C.hp,route===3?2:8);assert.equal(s.units.C.pp.line,route===3?1:2);assert.equal(s.bag,route===3?1:0);
 }});
test('M5/M6 B damage belongs to B, both plans 11 rounds',()=>{
 for(const accept of [false,true]){let s=prefix();s=command(s,{type:'invite',choice:accept?'accept':'reject',...(accept?{outgoing:'C'}:{})});s=command(s,{type:'switch',actor:'B'});const p=accept?'N':'C';s=round(s,{type:'swap',target:p});assert.deepEqual(positions(s),[1,3,2]);for(const a of [move(4),interact(false),move(5),move(6),move(7),interact(true)])s=round(s,a);s=finish(s);assert.equal(s.round,11);assert.deepEqual(positions(s),[5,7,6]);assert.equal(s.units.B.hp,2);assert.equal(s.units[p].hp,accept?10:8);assert.equal(s.units.B.pp.guard,2);assert.deepEqual(s.camp,accept?['C']:[]);}
});
test('V1/V2 refusal is immutable and explicit waiting fixes known conflict',()=>{
 const s=createScenario('V1','v1'),before=JSON.stringify(s);const r=applyCommand(s,{type:'round',action:move(4)});assert.equal(r.ok,false);assert.strictEqual(r.state,s);assert.equal(JSON.stringify(s),before);
 const fixed=round(s,move(4),{actor:'B',action:wait});assert.deepEqual(positions(fixed),[2,3,4]);
});
test('M4 B already on exit; no extra return damage',()=>{
 let s=createScenario('V1','m4');s=round(s,move(6));s=command(s,{type:'switch',actor:'B'});s=finish(round(s,interact(true)));assert.deepEqual(positions(s),[3,4,5]);assert.equal(s.units.C.hp,2);assert.equal(s.round,9);
});
test('V3/V4 follow and V5/V6/V7 down membership',()=>{
 let s=createScenario('V3','v3');s=round(s,move(0));assert.deepEqual(positions(s),[3,2,0]);assert.equal(finish(round(s,interact(true))).phase,'ended');
 s=createScenario('V4','v4');s=round(s,wait,{actor:'C',action:{type:'move',to:{x:2,y:2}}});s=round(s,wait);assert.deepEqual(s.units.B.pos,{x:2,y:1});assert.deepEqual(s.units.C.pos,{x:3,y:2});
 s=createScenario('V5','v5');s=round(s,move(2));assert.equal(s.units.B.hp,5);assert.equal(s.units.C.pos.x,1);s=round(s,basic('E'));assert.equal(s.units.C.pos.x,1);assert.equal(s.queue.length,3);
 s=round(createScenario('V6','v6'),move(2));assert.equal(s.leader,'C');assert.equal(s.units.B.pos,null);
 s=finish(round(createScenario('V7','v7'),interact(true)));assert.equal(s.units.A.hp,0);assert.equal(s.end.outcome,'normal');
});
test('V8/V9/V10 admission preview and batch anchor',()=>{
 let s=createScenario('V8','v8');assert.equal(previewInvitation(s,'C').ok,false);assert.deepEqual(previewInvitation(s,'B').pos,{x:1,y:2});assert.equal(applyCommand(s,{type:'invite',choice:'accept',outgoing:'C'}).ok,false);
 s=command(createScenario('V9','v9'),{type:'invite',choice:'accept',outgoing:'C'});assert.deepEqual(s.units.N.pos,{x:3,y:2});assert.equal(s.units.C.hp,0);
 s=command(createScenario('V10','v10'),{type:'invite',choice:'accept',outgoing:'A'});assert.equal(s.leader,'B');assert.deepEqual(s.anchor,{x:2,y:2});s=command(s,{type:'invite',choice:'accept',outgoing:'C'});assert.deepEqual(s.queue,['B','N1','N2']);assert.deepEqual(s.units.N2.pos,{x:3,y:2});
});
test('V11/V12/V13 full-round transition and wipe priority',()=>{
 let s=round(createScenario('V11','v11'),interact(true));assert.equal(s.units.B.hp,0);assert.equal(s.bag,1);assert.equal(s.request,null);assert.equal(s.phase,'playing');
 s=round(createScenario('V12','v12'),interact(true));assert.equal(s.end.outcome,'wipe');assert.equal(s.end.acquired,1);assert.equal(s.end.brought,0);assert.deepEqual(s.end.camp,['C']);
 s=round(createScenario('V13','v13'),interact(true));assert.equal(s.phase,'invitation');assert.equal(s.request.locked,true);s=command(s,{type:'invite',choice:'accept',outgoing:'B'});assert.deepEqual(s.queue,['A','C','N']);s=finish(s);assert.equal(s.end.outcome,'normal');assert.equal(s.round,1);
});
test('K1/K2/K3/K4 exact resources and whole-round rejection',()=>{
 let s=createScenario('K1','k1');s=round(s,skill('strong','H'),{actor:'B',action:skill('guard','A')});assert.equal(s.units.H.hp,8);assert.equal(s.units.A.hp,8);assert.equal(s.units.B.pp.guard,0);s=round(s,skill('strong','H'));assert.equal(s.units.H.hp,0);
 s=createScenario('K2','k2');s=round(s,skill('strong','H'),{actor:'D',action:skill('push','H')});assert.deepEqual(s.units.H.pos,{x:3,y:2});assert.equal(s.units.A.hp,12);s=round(s,skill('strong','H'));assert.equal(s.units.H.hp,0);assert.equal(s.units.D.hp,4);assert.equal(s.units.B.pp.guard,1);
 s=createScenario('K3','k3');assert.equal(applyCommand(s,{type:'round',action:skill('strong','H'),override:{actor:'D',action:skill('push','H')}}).ok,false);assert.equal(s.units.H.hp,24);
 s=createScenario('K4','k4');assert.equal(applyCommand(s,{type:'round',action:skill('line','R')}).ok,false);
});
test('K5 alternative recipients preserve A/B12 of20 and C learned line',()=>{
 for(const outgoing of [null,'C','A','B']){let s=createScenario('K5','k5'+outgoing);s=command(s,{type:'invite',choice:outgoing?'accept':'reject',...(outgoing?{outgoing}:{})});if(!outgoing){s=round(s,skill('line','R'));assert.equal(s.round,1);}else{s=command(s,{type:'switch',actor:'Q'});if(outgoing==='C'){s=round(s,move(3),{actor:'B',action:skill('guard','Q')});s=round(s,move(4));s=round(s,basic('R'));assert.equal(s.units.Q.hp,2);}else{s=round(s,move(4));s=round(s,basic('R'));assert.equal(s.units.Q.hp,4);assert.equal(s.units.C.pp.line,1);}}
 assert.equal(s.units.A.hp,12);assert.equal(s.units.B.hp,12);assert.equal(s.units.A.maxHp,20);assert.equal(s.units.R.hp,0);}
});
class Memory {raw=null;fail=false;getItem(){return this.raw;}setItem(k,v){if(this.fail)throw Error('quota');this.raw=v;}}
test('S2/S3/S4/S5 restore invitations and locked request exactly once',async()=>{
 const port=new Memory();let store=new TrialStore(port,'test');await store.start(createScenario('V13','save'));await store.dispatch({type:'round',action:interact(true)});store=new TrialStore(port,'test');assert.equal(store.state.phase,'invitation');await store.dispatch({type:'invite',choice:'accept',outgoing:'B'});store=new TrialStore(port,'test');assert.equal(store.state.phase,'exit');await store.dispatch({type:'finishExit'});const ended=store.state;assert.equal((await store.dispatch({type:'finishExit'})).ok,false);assert.deepEqual(store.state,ended);
 await store.newTrial(createMain('next'));assert.equal(store.envelope.recent.end.id,'save:end');assert.equal(store.state.round,0);assert.equal(new TrialStore(port,'test').envelope.recent.runId,'save');
});
test('S6/S7/S8 asynchronous pending write freezes all subsequent changes',async()=>{
 let release;const port={getItem:()=>null,setItem:()=>new Promise(r=>release=r)};const store=new TrialStore(port,'isolated');const first=store.start(createMain('async'));assert.equal(store.status,'saving');assert.equal((await store.dispatch({type:'round',action:move(3)})).ok,false);assert.equal(await store.newTrial(createMain('other')),false);release();assert.equal(await first,true);assert.equal(store.status,'ready');
 const mem=new Memory();const failed=new TrialStore(mem,'other');mem.fail=true;await failed.start(createMain('fail'));assert.equal(failed.status,'failed');assert.equal(failed.lastSaved,null);assert.equal(mem.raw,null);mem.fail=false;await failed.retry();await failed.dispatch({type:'round',action:move(3)});const raw=mem.raw;mem.fail=true;await failed.dispatch({type:'round',action:basic('E')});assert.equal(failed.state.round,2);assert.equal(mem.raw,raw);mem.fail=false;await failed.retry();assert.equal(decode(mem.raw).current.round,2);
});
test('S9 incompatible raw is preserved until export and explicit reset',async()=>{
 const mem=new Memory();mem.raw='{"format":999}';const store=new TrialStore(mem,'broken');assert.equal(store.status,'blocked');assert.equal(await store.resetAfterExport(createMain('reset'),true),false);assert.equal(store.exportRaw(),'{"format":999}');assert.equal(mem.raw,'{"format":999}');assert.equal(await store.resetAfterExport(createMain('reset'),false),false);assert.equal(await store.resetAfterExport(createMain('reset'),true),true);
});
test('S1/S3/S6 failure at each real processing boundary retries identical state',async()=>{
 const cases=[
  ['V13',[],{type:'round',action:interact(true)},'invitation'],
  ['V10',[],{type:'invite',choice:'accept',outgoing:'A'},'invitation'],
  ['V13',[{type:'round',action:interact(true)}],{type:'invite',choice:'accept',outgoing:'B'},'exit'],
  ['V12',[],{type:'round',action:interact(true)},'ended'],
 ];
 for(const [id,prep,last,phase] of cases){const mem=new Memory(),st=new TrialStore(mem,'boundary');await st.start(createScenario(id,'bound'+id));for(const c of prep)await st.dispatch(c);const prior=mem.raw;mem.fail=true;await st.dispatch(last);const inMemory=st.envelope;assert.equal(st.status,'failed');assert.equal(st.state.phase,phase);assert.equal(mem.raw,prior);assert.equal((await st.dispatch({type:'finishExit'})).ok,false);mem.fail=false;await st.retry();assert.deepEqual(st.envelope,inMemory);assert.deepEqual(new TrialStore(mem,'boundary').state,st.state);}
 const mem=new Memory(),st=new TrialStore(mem,'ordinary');await st.start(createScenario('V1','ordinary'));assert.deepEqual(new TrialStore(mem,'ordinary').state,st.state);
 const before=JSON.parse(mem.raw);delete before.current.points;mem.raw=JSON.stringify(before);const malformed=new TrialStore(mem,'ordinary');assert.equal(malformed.status,'blocked');assert.equal(malformed.exportRaw(),mem.raw);
 const restartMem=new Memory(),rs=new TrialStore(restartMem,'restart');await rs.start(createScenario('V7','ended'));await rs.dispatch({type:'round',action:interact(true)});await rs.dispatch({type:'finishExit'});const old=restartMem.raw;restartMem.fail=true;await rs.newTrial(createMain('brand-new'));assert.equal(rs.status,'failed');assert.equal(restartMem.raw,old);assert.equal(rs.state.runId,'brand-new');assert.equal(await rs.newTrial(createMain('must-not-replace')),false);restartMem.fail=false;await rs.retry();assert.equal(rs.state.runId,'brand-new');assert.equal(rs.envelope.recent.runId,'ended');
});
