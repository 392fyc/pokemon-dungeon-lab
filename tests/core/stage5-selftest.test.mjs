import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand} from '../../src/core/engine.ts';
import {createScenario} from '../../src/core/scenarios.ts';
// Stage 5 maker self-test (2026-10-30): a rejected line skill names its one real reason.
const line=target=>({type:'round',action:{type:'skill',skill:'quickattack',target}});
function denied(s,cmd,reason){const before=JSON.stringify(s),r=applyCommand(s,cmd);assert.equal(r.ok,false);assert.match(r.error,reason);assert.match(r.error,/本轮未执行$/);assert.equal(JSON.stringify(s),before);return r.error;}
test('line out of range states the distance and range',()=>{
 const s=createScenario('V1','line-range');
 const e=denied(s,line('R'),/目标相距4格，超出招式射程2格/);assert.doesNotMatch(e,/挡/);
});
test('line blocked by a living unit names that unit',()=>{
 const s=createScenario('K4','line-unit');s.units.R.pos={x:4,y:1};
 denied(s,line('R'),/射线被B挡住/);
});
test('line blocked by a wall names the wall cell',()=>{
 const s=createScenario('K4','line-wall');s.units.B.pos={x:1,y:1};s.units.R.pos={x:4,y:1};s.floor=s.floor.filter(p=>p.x!==3);
 denied(s,line('R'),/射线在\(3,1\)被墙挡住/);
});
test('line off the row and column says so',()=>{
 const s=createScenario('K1','line-diagonal');s.units.H.pos={x:4,y:2};
 const r=applyCommand(s,{type:'round',action:{type:'wait'},override:{actor:'C',action:{type:'skill',skill:'quickattack',target:'H'}}});
 assert.equal(r.ok,false);assert.match(r.error,/招式只能指定同排或同列的目标/);
});
test('quickattack hits a clear target exactly two cells away',()=>{
 const s=createScenario('K4','line-ok');s.units.B.pos={x:1,y:1};s.units.R.pos={x:4,y:1};
 const r=applyCommand(s,line('R'));assert.equal(r.ok,true,r.error);assert.equal(r.state.units.R.hp,0);assert.equal(r.state.units.A.pp.quickattack,0);
});
