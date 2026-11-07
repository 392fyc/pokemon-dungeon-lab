/* Playtest 1107 #6: "together" and "nomoves" partners walk toward a visible opponent within 3 of the leader instead of idling beside the leader. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {speciesUnit,applyCommand} from '../../src/core/engine.ts';
import {world,open} from '../acceptance/fixtures.mjs';
import {foeOf} from './foe-fixture.mjs';
import {sureHit} from './sure-hit.mjs';

const chebyshev=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
const mate=(id,x,y,tactic,moves={tackle:5})=>{const u=speciesUnit(id,'bulbasaur',5,{x,y});u.hp=40;u.maxHp=40;u.learned=Object.keys(moves);u.pp={...moves};u.maxPp={...moves};u.tactic=tactic;return u;};
const dummy=(id,x,y)=>{const e=foeOf(id,'geodude',x,y,200);e.waitOnly=true;return e;};
/** Leader A touches F on the east; X and Y start on the far (west) side of the leader, two cells from F. */
function scene(tactic){
 const units={A:mate('A',5,3,'wait'),X:mate('X',4,4,tactic),Y:mate('Y',4,2,tactic),F:dummy('F',6,3)};
 const s=world(units,{floor:open(9),leader:'A',queue:['A','X','Y'],enemies:['F']});
 s.rooms=[{x:1,y:1,w:9,h:9}];s.enemyAiRng=1;return sureHit(s);
}
const round=s=>{const r=applyCommand(s,{type:'round',action:{type:'wait'}});assert.equal(r.ok,true,r.error);return r.state;};
for(const tactic of ['together','nomoves']){
 test(`${tactic}: partners two cells from an opponent beside the leader close in, then attack`,()=>{
  let s=scene(tactic);
  const dist=(st,id)=>chebyshev(st.units[id].pos,st.units.F.pos);
  assert.equal(dist(s,'X'),2);
  s=round(s);
  assert.equal(dist(s,'X'),1,'X steps next to F in round 1');
  assert.equal(dist(s,'Y'),1,'Y steps next to F in round 1');
  const hp=s.units.F.hp;s=round(s);
  assert.ok(s.units.F.hp<hp,'F takes damage in round 2 from the partners');
 });
}
test('together: an opponent more than 3 from the leader is still not chased',()=>{
 const units={A:mate('A',2,3,'wait'),X:mate('X',3,4,'together'),F:dummy('F',7,3)};
 let s=world(units,{floor:open(9),leader:'A',queue:['A','X'],enemies:['F']});s.rooms=[{x:1,y:1,w:9,h:9}];s.enemyAiRng=1;sureHit(s);
 s=round(s);assert.ok(chebyshev(s.units.X.pos,s.units.A.pos)<=1,'X stays with the leader');
});

/* PR 214 review: corridors (2-step sight) and enemies the partner cannot see. */
function corridor(partnerX,foeX){
 const units={A:mate('A',5,1,'wait'),X:mate('X',partnerX,1,'together'),F:dummy('F',foeX,1)};
 const s=world(units,{floor:Array.from({length:14},(_,x)=>({x,y:1})),leader:'A',queue:['A','X'],enemies:['F']});
 s.enemyAiRng=1;return sureHit(s);   // no rooms: corridor sight, 2 steps
}
test('together in a corridor: a visible opponent inside the leader zone is approached',()=>{
 let s=corridor(6,8);   // F is 3 from the leader and 2 from X
 s=round(s);assert.equal(s.units.X.pos.x,7,'X steps toward F instead of waiting beside the leader');
});
test('together in a corridor: an opponent X cannot see is not chased, even inside the leader zone',()=>{
 let s=corridor(4,8);   // F is 3 from the leader but 4 from X, beyond the 2-step sight
 s=round(s);assert.equal(s.units.X.pos.x,4,'X keeps its place beside the leader');
});
