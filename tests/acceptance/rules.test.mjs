import test from 'node:test';
import assert from 'node:assert/strict';
import {createMain} from '../../src/core/engine.ts';
import {pos,row,friend,enemy,world,doCmd,reject as rejectRaw,move,wait,basic,skill,interact,round,switchTo,refuse,accept,finish,coords,hp,pp,preview,V,K,K5} from './fixtures.mjs';
// 拒绝必须明确说明没有执行整轮；底层helper已比较完整世界不变。
function reject(s,command){const r=rejectRaw(s,command);assert.match(r.error,/本轮未执行/);return r;}
const U=[{tackle:2},{protect:2},{tackle:2,quickattack:2}];
function prefix(inv=true,choice='reject'){
 let s=createMain('acceptance',inv);
 assert.deepEqual(coords(s),[pos(0),pos(1),pos(2)]);assert.deepEqual(hp(s),[20,20,20]);
 assert.deepEqual(s.seen,['0,1','1,1','2,1','3,1','4,1','5,1','6,1']);assert.deepEqual(pp(s),U);
 const snapshots=[
  [[0,1,3],[20,20,16],16],
  [[0,2,3],[20,20,12],10],
  [[1,2,3],[20,20,8],4],
  [[1,2,3],[20,20,8],0]
 ];
 for(let i=0;i<4;i++){
  s=round(s,i===0?move(3):basic('E'));
  assert.deepEqual(coords(s),snapshots[i][0].map(x=>pos(x)));
  assert.deepEqual(hp(s),snapshots[i][1]);assert.equal(s.units.E.hp,snapshots[i][2]);assert.deepEqual(pp(s),U);
  assert.equal(s.seen.includes('7,1'),true);assert.equal(s.seen.includes('9,1'),false);assert.equal(s.round,i+1);
 }
 if(inv){assert.equal(s.phase,'invitation');assert.deepEqual(s.anchor,pos(3));s=choice==='accept'?accept(s,'C'):refuse(s);}
 else assert.equal(s.invitations.length,0);
 return s;
}
function scout(inv=true){
 let s=prefix(inv);s=round(s,move(4));assert.equal(s.seen.includes('8,1'),true);assert.equal(s.seen.includes('9,1'),false);
 s=round(s,interact(false));s=round(s,move(5));
 assert.deepEqual(coords(s),[pos(2),pos(3),pos(5)]);assert.equal(s.seen.includes('9,1'),true);return s;
}
function normal(s){assert.equal(s.phase,'exit');const n=finish(s);assert.equal(n.phase,'ended');assert.equal(n.end.outcome,'normal');return n;}
for(const inv of [true,false]){
 test('M1 short '+inv,()=>{let s=prefix(inv);s=round(s,move(4));s=normal(round(s,interact(true)));assert.equal(s.round,6);assert.deepEqual(coords(s),[pos(1),pos(3),pos(4)]);assert.deepEqual(hp(s),[20,20,8]);assert.deepEqual(pp(s),U);assert.equal(s.end.goal,true);assert.equal(s.end.brought,0);});
 test('M2 scout return '+inv,()=>{let s=scout(inv);s=switchTo(s,'B');s=round(s,move(4));s=normal(round(s,interact(true)));assert.equal(s.round,9);assert.deepEqual(coords(s),[pos(3),pos(4),pos(5)]);assert.deepEqual(hp(s),[20,20,8]);assert.deepEqual(pp(s),U);assert.equal(s.units.R.hp,6);});
 test('M3 quickattack cannot reach the old three-cell target '+inv,()=>{const s=round(scout(inv),move(6));assert.deepEqual(hp(s),[20,20,2]);reject(s,{type:'round',action:skill('quickattack','R')});assert.equal(s.units.C.pp.quickattack,2);assert.equal(s.units.R.hp,6);});
}
test('M4 hurt then return',()=>{let s=round(scout(),move(6));s=switchTo(s,'B');s=normal(round(s,interact(true)));assert.equal(s.round,9);assert.deepEqual(coords(s),[pos(3),pos(4),pos(5)]);assert.deepEqual(hp(s),[20,20,2]);assert.deepEqual(pp(s),U);});
for(const recruit of [false,true])test(recruit?'M6 same B plan replace C':'M5 same B plan keep C',()=>{
 let s=prefix(true,recruit?'accept':'reject'),p=recruit?'N':'C';s=switchTo(s,'B');s=round(s,{type:'swap',target:p});
 assert.deepEqual(coords(s),[pos(1),pos(3),pos(2)]);
 const actions=[move(4),interact(false),move(5),move(6),move(7),interact(true)];
 const ps=[[1,4,3],[2,4,3],[2,5,4],[3,6,5],[4,7,6],[5,7,6]],bhp=[20,20,20,14,8,2];
 for(let i=0;i<actions.length;i++){s=round(s,actions[i]);assert.deepEqual(coords(s),ps[i].map(x=>pos(x)));assert.equal(s.units.B.hp,bhp[i]);}
 s=normal(s);assert.equal(s.round,11);assert.deepEqual(hp(s),[20,2,recruit?10:8]);assert.equal(s.units.R.hp,6);assert.equal(s.end.brought,1);
 if(recruit){assert.deepEqual(s.camp,['C']);assert.equal(s.units.C.hp,8);assert.deepEqual(s.units.C.pp,{tackle:2,quickattack:2});assert.deepEqual(pp(s),[{tackle:2},{protect:2},{tackle:1,roar:1}]);}
 else assert.deepEqual(pp(s),U);
});
test('V1 preflight no partial member execution',()=>{const s=scout();const r=reject(s,{type:'round',action:move(4)});assert.match(r.error,/B/);assert.match(r.error,/4/);assert.match(r.error,/先|前序/);assert.doesNotMatch(r.error,/可能/);});
test('V2 core combo and free switch (UI draft checks separately)',()=>{let s=scout();s=switchTo(s,'B');assert.equal(s.round,7);s=switchTo(s,'C');s=round(s,move(4),'B',wait);assert.equal(s.round,8);assert.deepEqual(coords(s),[pos(2),pos(3),pos(4)]);});
test('V3 reverse without swap',()=>{let s=round(V(3),move(0));assert.deepEqual(coords(s),[pos(3),pos(2),pos(0)]);s=normal(round(s,interact(true)));assert.equal(s.round,2);});
test('V4 side path',()=>{let s=round(V(4),wait,'C',{type:'move',to:pos(2,2)});assert.deepEqual(coords(s),[pos(3),pos(1),pos(2,2)]);s=round(s,wait);assert.deepEqual(coords(s),[pos(3),pos(2),pos(3,2)]);});
test('V5 down body does not block; finish whole round after kill',()=>{let s=round(V(5),move(2));assert.deepEqual(coords(s),[null,pos(2),pos(1)]);assert.deepEqual(hp(s),[0,5,8]);s=round(s,basic('E'));assert.equal(s.units.E.hp,0);assert.deepEqual(coords(s),[null,pos(2),pos(1)]);assert.equal(s.queue.length,3);});
test('V6 leader succeeds without added action',()=>{const s=round(V(6),move(2));assert.deepEqual(coords(s),[null,null,pos(1)]);assert.equal(s.leader,'C');assert.equal(s.round,1);assert.deepEqual(s.queue,['A','B','C']);});
test('V7 normal exit includes down member no healing',()=>{const s=normal(round(V(7),interact(true)));assert.deepEqual(hp(s),[0,8,8]);assert.deepEqual(s.end.team,['A','B','C']);});
test('V8 no slot; actual outgoing removal preview',()=>{const s=V(8);assert.equal(preview(s,'C').ok,false);reject(s,{type:'invite',choice:'accept',outgoing:'C'});assert.deepEqual(preview(s,'B').pos,pos(1,2));assert.deepEqual(preview(s,'A').pos,pos(2,2));assert.equal(refuse(s).invitations[0].status,'rejected');});
test('V9 replace down member',()=>{const s=accept(V(9),'C');assert.deepEqual(s.units.N.pos,pos(3,2));assert.deepEqual(s.queue,['A','B','N']);assert.deepEqual(s.camp,['C']);assert.equal(s.units.C.hp,0);assert.deepEqual(hp(s),[20,20,10]);assert.equal(s.round,0);});
test('V10 fixed rally across two invitations',()=>{let s=accept(V(10),'A');assert.deepEqual(s.units.N1.pos,pos(2,2));assert.equal(s.leader,'B');assert.deepEqual(s.anchor,pos(2,2));reject(s,{type:'switch',actor:'N1'});s=accept(s,'C');assert.deepEqual(s.units.N2.pos,pos(3,2));assert.deepEqual(s.queue,['B','N1','N2']);assert.deepEqual(s.camp,['A','C']);assert.deepEqual(hp(s),[10,10,10]);assert.equal(s.round,0);});
test('V11 interaction actor down cancels exit, not acquisition',()=>{const s=round(V(11),interact(true));assert.equal(s.bag,1);assert.equal(s.phase,'playing');assert.equal(s.request,null);assert.equal(s.end,null);assert.equal(s.leader,'A');assert.deepEqual(coords(s),[pos(5),null,pos(6)]);});
test('V12 wipe priority retains returned C',()=>{const s=round(V(12),interact(true));assert.equal(s.phase,'ended');assert.equal(s.end.outcome,'wipe');assert.deepEqual(s.end.team,['A','B','N']);assert.deepEqual(s.end.camp,['C']);assert.equal(s.units.C.hp,8);assert.deepEqual(s.units.C.pp,{tackle:2,quickattack:2});assert.equal(s.end.acquired,1);assert.equal(s.end.brought,0);assert.equal(s.end.goal,true);assert.equal(s.request,null);});
test('V13 recruit after valid exit may replace actor',()=>{let s=round(V(13),interact(true));assert.equal(s.phase,'invitation');assert.equal(s.request.locked,true);s=accept(s,'B');assert.equal(s.phase,'exit');assert.deepEqual(s.units.N.pos,pos(4));assert.equal(s.leader,'A');s=normal(s);assert.equal(s.round,1);assert.deepEqual(s.end.team,['A','C','N']);assert.deepEqual(s.end.camp,['B']);assert.equal(s.units.B.hp,20);});
// PR5: fixed literal used points and pure exit fixtures, no expected-value calculator.
for(const kind of ['goal','item'])test('PR5 used '+kind+' rejects collect without an empty round',()=>{
 let s=world({A:friend('A',0),B:friend('B',1),C:friend('C',2)},{leader:'C',points:[{pos:pos(2),kind,used:false}]});
 s=round(s,interact(false));assert.equal(s.round,1);
 const r=reject(s,{type:'round',action:interact(false)});
 assert.match(r.error,kind==='goal'?/记录|目标|取得|使用/:/取得|物品|使用/);
 assert.equal(s.goal,kind==='goal');assert.equal(s.bag,kind==='item'?1:0);
 s=normal(round(s,interact(true)));
 assert.equal(s.round,2);assert.equal(s.end.brought,kind==='item'?1:0);
});
for(const fixture of [3,7])test('PR5 V'+fixture+' pure exit rejects collect without state change',()=>{
 let s=V(fixture);if(fixture===3)s=round(s,move(0));const beforeRound=s.round;
 const r=reject(s,{type:'round',action:interact(false)});assert.match(r.error,/出口|撤离/);
 s=normal(round(s,interact(true)));assert.equal(s.round,beforeRound+1);assert.equal(s.goal,false);assert.equal(s.bag,0);
});
test('PR5 wall refusal names terrain rather than hypothetical earlier member',()=>{
 const s=createMain('wall',false),r=reject(s,{type:'round',action:{type:'move',to:pos(2,0)}});
 assert.match(r.error,/墙|不可行走|非地面|不是可行走/);assert.doesNotMatch(r.error,/前序成员可能/);
});
test('PR5 unrevealed refusal names missing knowledge',()=>{
 const s=createMain('unrevealed',false);s.seen=s.seen.filter(k=>k!=='3,1');
 const r=reject(s,{type:'round',action:move(3)});assert.match(r.error,/未揭示|尚未发现|未发现/);assert.doesNotMatch(r.error,/前序成员可能/);
});
test('K1 protect shields its user, not the adjacent attacker',()=>{let s=round(K(),skill('tackle','H'),'B',skill('protect','B'));assert.deepEqual(hp(s),[4,12,10]);assert.equal(s.units.H.hp,9);assert.deepEqual(pp(s),[{tackle:1},{protect:0},{tackle:2,quickattack:1}]);s=round(s,skill('tackle','H'));assert.equal(s.units.H.hp,0);assert.equal(s.units.A.hp,4);assert.equal(s.units.A.pp.tackle,0);});
test('K2 roar collision deals five damage and preserves the support move',()=>{let s=round(K(true),skill('tackle','H'),'D',skill('roar','H'));assert.deepEqual(s.units.H.pos,pos(3,2));assert.equal(s.units.H.hp,10);assert.deepEqual(hp(s),[12,12,4]);assert.deepEqual(pp(s),[{tackle:1},{protect:1},{tackle:1,roar:0}]);s=round(s,skill('tackle','H'));assert.equal(s.units.H.hp,0);assert.deepEqual(hp(s),[12,12,4]);assert.equal(s.units.B.pp.protect,1);assert.equal(s.units.D.pp.tackle,1);});
for(const blocker of ['wall','unit'])test('K3 blowaway collision '+blocker,()=>{const s=K(true);if(blocker==='wall')s.floor=s.floor.filter(p=>p.x!==3||p.y!==1);else{s.units.X=enemy('X',3,1,20,'melee',0);s.enemies.push('X');}const after=round(s,skill('tackle','H'),'D',skill('roar','H'));assert.equal(after.units.H.hp,10);assert.deepEqual(after.units.H.pos,pos(3,2));assert.equal(after.units.D.pp.roar,0);assert.equal(after.units.A.hp,4);if(blocker==='unit')assert.equal(after.units.X.hp,15);});

test('K4 friendly unit blocks ray',()=>{const s=world({A:friend('A',2,1,20,{quickattack:1}),B:friend('B',3,1),C:friend('C',0,1,0),R:enemy('R',5,1,6,'ranged',6,3)},{floor:row(5),enemies:['R']});reject(s,{type:'round',action:skill('quickattack','R')});});
test('K5 refusing keeps quickattack PP but cannot reach a target three cells away',()=>{const s=refuse(K5());reject(s,{type:'round',action:skill('quickattack','R')});assert.equal(s.round,0);assert.equal(s.units.C.pp.quickattack,1);assert.equal(s.units.R.hp,6);});

test('K5 replacing C cannot protect the newcomer with another member',()=>{let s=switchTo(accept(K5(),'C'),'Q');reject(s,{type:'round',action:move(3),override:{actor:'B',action:skill('protect','Q')}});s=round(s,move(3));assert.equal(s.units.Q.hp,4);s=round(s,move(4));assert.equal(s.units.Q.hp,0);assert.equal(s.round,2);assert.equal(s.units.B.pp.protect,1);assert.equal(s.units.C.hp,2);assert.equal(s.units.C.pp.quickattack,1);});
for(const outgoing of ['A','B'])test('K5 keep C and replace '+outgoing,()=>{let s=accept(K5(),outgoing);assert.deepEqual(s.units.Q.pos,pos(3));assert.equal(s.units[outgoing].hp,12);assert.equal(s.units[outgoing].maxHp,20);s=switchTo(s,'Q');s=round(s,move(4));assert.equal(s.units.Q.hp,4);assert.deepEqual(s.units.C.pos,pos(2));s=round(s,basic('R'));assert.equal(s.round,2);assert.equal(s.units.R.hp,0);assert.deepEqual(s.units.C.pos,pos(3));assert.equal(s.units.C.hp,2);assert.equal(s.units.C.pp.quickattack,1);assert.equal(s.units.B.pp.protect,1);assert.equal(s.units.A.hp,12);assert.equal(s.units.B.hp,12);assert.equal(s.units.Q.hp,4);});
