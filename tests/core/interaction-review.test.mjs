import test from 'node:test';
import assert from 'node:assert/strict';
import {createMain,applyCommand,clone,key} from '../../src/core/engine.ts';
import {createScenario} from '../../src/core/scenarios.ts';
const round=action=>({type:'round',action});
function denied(s,cmd,reason){const before=JSON.stringify(s),r=applyCommand(s,cmd);assert.equal(r.ok,false);assert.strictEqual(r.state,s);assert.match(r.error,reason);assert.match(r.error,/本轮未执行$/);assert.equal(JSON.stringify(s),before);return r.error;}
function valid(s,cmd){const r=applyCommand(s,cmd);assert.equal(r.ok,true,r.error);return r.state;}
const collect=round({type:'interact',exit:false}),leave=round({type:'interact',exit:true});
test('used G rejects collection before any member or enemy acts, exit remains valid',()=>{
 const s=createScenario('V1','used-goal');s.units.C.pos={x:4,y:1};assert.equal(s.points[0].used,true);
 denied(s,collect,/G已记录，仅可请求撤离/);
 denied(s,{...collect,override:{actor:'B',action:{type:'wait'}}},/G已记录/);
 assert.equal(valid(s,leave).phase,'exit');
});
test('used T refuses extra collection without another lethal enemy phase',()=>{
 const s=createScenario('V11','used-item');s.points.find(p=>p.kind==='item').used=true;s.bag=1;
 denied(s,collect,/T已取得，仅可请求撤离/);assert.equal(s.units.B.hp,2);assert.equal(s.bag,1);
});
for(const id of ['V3','V7'])test(id+' pure exit refuses collection even when unused',()=>{
 let s=createScenario(id,'pure-'+id);if(id==='V3')s=valid(s,round({type:'move',to:{x:0,y:1}}));
 assert.equal(s.points[0].used,false);denied(s,collect,/此处是纯出口，仅可请求撤离/);assert.equal(valid(s,leave).phase,'exit');
});
test('unused G still collects exactly once and then refuses another collection',()=>{
 let s=createMain('first-goal',false);for(const a of [{type:'move',to:{x:3,y:1}},...Array(3).fill({type:'basic',target:'E'}),{type:'move',to:{x:4,y:1}}])s=valid(s,round(a));
 s=valid(s,collect);assert.equal(s.round,6);assert.equal(s.goal,true);denied(s,collect,/G已记录/);assert.equal(valid(s,leave).phase,'exit');
});
test('wall, unseen floor and current occupancy give distinct deterministic reasons',()=>{
 const s=createMain('reasons',false);
 denied(s,round({type:'move',to:{x:2,y:0}}),/目标格\(2,0\)是墙，不能进入/);
 const unseen=clone(s);unseen.seen=unseen.seen.filter(k=>k!==key({x:3,y:1}));
 denied(unseen,round({type:'move',to:{x:3,y:1}}),/目标格\(3,1\)尚未揭示，不能进入/);
 denied(s,round({type:'move',to:{x:1,y:1}}),/目标格\(1,1\)被B占据，不能进入/);
});
test('V1 names B as the preceding mover, including in a planned combination',()=>{
 const s=createScenario('V1','preceding');
 denied(s,round({type:'move',to:{x:4,y:1}}),/B会先进入\(4,1\)，挡住C；请选择另一动作或切换主控/);
 const r=valid(s,{type:'round',action:{type:'move',to:{x:4,y:1}},override:{actor:'B',action:{type:'wait'}}});
 assert.deepEqual(r.queue.map(id=>r.units[id].pos.x),[2,3,4]);
});
test('other explicit action rejections also state that the round did not execute',()=>{
 const s=createMain('other-reasons',false);
 denied(s,round({type:'basic',target:'E'}),/普攻需要相邻敌人/);
 denied(s,round({type:'move',to:{x:5,y:1}}),/只能移动到相邻格/);
 denied(s,round({type:'skill',skill:'guard',target:'B'}),/未装备该招式或PP不足/);
 denied(s,round({type:'swap',target:'A'}),/只能与相邻存活伙伴换位/);
 denied(s,{type:'round',action:{type:'wait'},override:{actor:'C',action:{type:'wait'}}},/只能安排另一名存活伙伴/);
});
