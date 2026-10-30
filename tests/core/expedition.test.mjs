import test from 'node:test';
import assert from 'node:assert/strict';
import {createExpedition,applyCommand} from '../../src/core/engine.ts';
import {generateFloor} from '../../src/core/dungeon.ts';
import {friend,enemy,pos,row,doCmd,reject,interact,round,coords,hp,pp,wait,basic,accept} from '../acceptance/fixtures.mjs';
import {expedition} from './expedition-fixtures.mjs';
const stairs=interact(true);
const requested=s=>round(s,stairs);
const cross=s=>doCmd(s,{type:'finishTransit'});
const all10=['0,1','1,1','2,1','3,1','4,1','5,1','6,1','7,1','8,1','9,1'];

test('X1 R09 step 3: a stairs request kept to round end becomes a locked pending transit, one round spent',()=>{
 const s=requested(expedition());
 assert.equal(s.phase,'transit');assert.equal(s.round,1);
 assert.deepEqual(s.request,{actor:'C',pos:pos(5),locked:true,to:2});
 assert.equal(s.dungeon.level,1);assert.deepEqual(s.units.C.pos,pos(5));
});
test('X2 crossing: leader on the entry, followers on the first revealed free cells (right, then left); nothing recovered, no round added',()=>{
 const s=cross(requested(expedition()));
 assert.equal(s.phase,'playing');assert.equal(s.request,null);assert.equal(s.round,1);assert.equal(s.dungeon.level,2);
 assert.deepEqual(coords(s),[pos(4),pos(2),pos(3)]);   // A right of the entry, B left of it, C on the up stairs
 assert.deepEqual(hp(s),[20,20,20]);assert.deepEqual(pp(s),[{tackle:2},{protect:2},{tackle:2,quickattack:2}]);
 assert.deepEqual(s.enemies,['w2a']);assert.deepEqual(s.units.w2a.pos,pos(7));assert.equal(s.units.w2a.hp,9);
 assert.equal(s.units.E,undefined,'floor 1 enemy must not follow');
 assert.deepEqual(s.points.map(p=>p.kind),['up','item']);
 assert.deepEqual(s.seen,['0,1','1,1','2,1','3,1','4,1','5,1','6,1','7,1','8,1']);   // A on (4,1) also sees 5..8
 assert.deepEqual(Object.keys(s.dungeon.stored),['1']);
});
test('X3 no enemy phase on arrival: an enemy beside the entry does not strike, and its cell is skipped for followers',()=>{
 const base=expedition();
 base.dungeon.stored['2'].units.w2a.pos=pos(4);       // right next to the entry (3,1)
 const s=cross(requested(base));
 assert.equal(s.units.C.hp,20);assert.equal(s.units.w2a.hp,9);
 assert.deepEqual(coords(s),[pos(2),pos(5),pos(3)]);  // right (4,1) is held by the enemy: A takes left; B takes the next cell out in walk order, (5,1) behind the enemy (sight passes living units)
});
test('X4 return keeps the old floor exactly: enemy HP, taken marks, revealed cells',()=>{
 const away=cross(requested(expedition()));
 const back=cross(round(away,stairs));
 assert.equal(back.dungeon.level,1);assert.equal(back.round,2);
 assert.deepEqual(coords(back),[pos(6),pos(4),pos(5)]);
 assert.deepEqual([back.units.E.hp,back.units.E.pos],[5,pos(9)]);
 assert.deepEqual(back.points,[{pos:pos(8),kind:'goal',used:true},{pos:pos(5),kind:'down',used:false}]);
 assert.equal(back.goal,true);assert.equal(back.bag,0);
 assert.deepEqual(back.seen,all10);
 const kept=back.dungeon.stored['2'];
 assert.deepEqual([kept.units.w2a.hp,kept.units.w2a.pos],[9,pos(7)]);
 assert.deepEqual(kept.points,[{pos:pos(3),kind:'up',used:false},{pos:pos(8),kind:'item',used:false}]);
 assert.equal(back.units.w2a,undefined);
});
test('X5 an item taken on floor 2 stays taken, and is not given twice, after leaving and coming back',()=>{
 let s=cross(requested(expedition()));
 Object.assign(s.units.C,{pos:pos(8)});s.units.A.pos=pos(7);s.units.B.pos=pos(6);s.units.w2a.pos=pos(0);
 s=round(s,interact(false));
 assert.equal(s.bag,1);assert.equal(s.points[1].used,true);
 s.units.C.pos=pos(3);s.units.A.pos=pos(4);s.units.B.pos=pos(2);       // walk back to the up stairs (position edit only)
 s=cross(requested(s));assert.equal(s.dungeon.level,1);
 s=cross(requested(s));assert.equal(s.dungeon.level,2);
 assert.equal(s.bag,1);assert.deepEqual(s.points,[{pos:pos(3),kind:'up',used:false},{pos:pos(8),kind:'item',used:true}]);
});
test('X6 R09 step 3: the requester falls before round end, so the request is cancelled and the action stays spent',()=>{
 const e=enemy('E',6,1,16,'melee',4);
 const w=expedition({a:pos(2),b:pos(3),c:pos(5),enemies:[e]});w.units.C.hp=4;
 const s=requested(w);
 assert.equal(s.units.C.hp,0);assert.equal(s.phase,'playing');assert.equal(s.request,null);
 assert.equal(s.dungeon.level,1);assert.equal(s.round,1);assert.equal(s.leader,'A');
 assert.deepEqual(Object.keys(s.dungeon.stored),['2']);
});
test('X7 wipe beats a stairs request: failure end, no transit',()=>{
 const es=[enemy('E1',2,1,16,'melee',4),enemy('E2',4,1,16,'melee',4),enemy('E3',6,1,16,'melee',4)];
 const w=expedition({a:pos(1),b:pos(3),c:pos(5),enemies:es});for(const id of 'ABC')w.units[id].hp=1;
 const s=requested(w);
 assert.equal(s.phase,'ended');assert.equal(s.end.outcome,'wipe');assert.equal(s.request,null);assert.equal(s.dungeon.level,1);
});
test('X8 entry held by an enemy: crossing is cancelled, source floor and positions kept, action spent',()=>{
 const w=expedition();w.dungeon.stored['2'].units.w2a.pos=pos(3);
 const pending=requested(w),s=cross(pending);
 assert.equal(s.phase,'playing');assert.equal(s.request,null);assert.equal(s.round,1);assert.equal(s.dungeon.level,1);
 assert.deepEqual(coords(s),coords(pending));assert.deepEqual(s.units.E,pending.units.E);
 assert.deepEqual(s.dungeon.stored['2'],pending.dungeon.stored['2']);
 assert.match(s.log.at(-1),/跨层取消/);
});
test('X9 not enough revealed free cells for every living member: the whole crossing is cancelled',()=>{
 const w=expedition({stored2:{floor:[pos(3),pos(4)],seen:[],points:[{pos:pos(3),kind:'up',used:false}],enemies:[],units:{}}});
 const pending=requested(w),s=cross(pending);
 assert.equal(s.dungeon.level,1);assert.equal(s.phase,'playing');assert.deepEqual(coords(s),coords(pending));
});
test('X10 a fallen member keeps a roster slot but gets no cell, so a two-cell entry area is enough',()=>{
 const w=expedition({stored2:{floor:[pos(3),pos(4)],seen:[],points:[{pos:pos(3),kind:'up',used:false}],enemies:[],units:{}}});
 w.units.A.hp=0;w.units.A.pos=null;
 const s=cross(requested(w));
 assert.equal(s.dungeon.level,2);assert.deepEqual(s.queue,['A','B','C']);
 assert.equal(s.units.A.pos,null);assert.equal(s.units.A.hp,0);assert.deepEqual([s.units.B.pos,s.units.C.pos],[pos(4),pos(3)]);
});
test('X11 R09 step 4 then 5: an invitation raised in the same round is handled first, then one crossing on the final roster',()=>{
 const e=enemy('E',6,1,6,'melee',4);e.recruit=friend('N',0,1,10,{tackle:1,roar:1});
 const w=expedition({a:pos(7),b:pos(4),c:pos(5),enemies:[e]});
 let s=round(w,stairs,'A',basic('E'));
 assert.equal(s.phase,'invitation');assert.equal(s.request.locked,true);assert.equal(s.request.to,2);
 s=accept(s,'B');
 assert.equal(s.phase,'transit');assert.equal(s.round,1);assert.deepEqual(s.camp,['B']);
 s=cross(s);
 assert.equal(s.dungeon.level,2);assert.deepEqual(s.queue,['A','C','N']);assert.equal(s.round,1);
 assert.deepEqual(coords(s),[pos(4),pos(3),pos(2)]);assert.equal(s.units.B.pos,null);
});
test('X12 illegal or misplaced stairs input is refused before any action',()=>{
 const r=reject(expedition(),{type:'round',action:interact(false)});assert.match(r.error,/楼梯只能请求跨层/);
 reject(expedition({c:pos(4)}),{type:'round',action:interact(true)});
});
test('X13 finishTransit works once and only from the pending phase',()=>{
 const w=expedition();
 assert.equal(applyCommand(w,{type:'finishTransit'}).ok,false);
 const s=cross(requested(w));assert.equal(applyCommand(s,{type:'finishTransit'}).ok,false);
 assert.equal(applyCommand(requested(w),{type:'finishExit'}).ok,false);
});
test('X14 while a transit is pending no ordinary round or switch is accepted',()=>{
 const p=requested(expedition());
 reject(p,{type:'round',action:wait});reject(p,{type:'switch',actor:'A'});
});
test('X15 generated expedition: start on the exit, floors created lazily from the seed, both directions work',()=>{
 const s0=createExpedition('gen',777);
 assert.equal(s0.scenario,'expedition');assert.equal(s0.dungeon.level,1);assert.equal(s0.phase,'playing');
 const g1=generateFloor(777,1),g2=generateFloor(777,2);
 const exit=g1.points.find(p=>p.kind==='exit').pos,down=g1.points.find(p=>p.kind==='down').pos;
 assert.deepEqual(s0.units.C.pos,exit);
 assert.equal(new Set(coords(s0).map(p=>p.x+','+p.y)).size,3);
 assert.ok(s0.enemies.every(id=>!(s0.units[id].pos.x===exit.x&&s0.units[id].pos.y===exit.y)));
 assert.deepEqual(s0.enemies,['w1a','w1b']);
 const s=structuredClone(s0);s.units.A.hp=0;s.units.A.pos=null;s.units.B.hp=0;s.units.B.pos=null;s.units.C.pos=down;
 const leaving=requested(s),down2=cross(leaving);
 assert.equal(down2.dungeon.level,2);assert.deepEqual(down2.units.C.pos,g2.points.find(p=>p.kind==='up').pos);
 assert.deepEqual(down2.enemies,['w2a','w2b','w2c']);assert.deepEqual(down2.floor,g2.floor);
 const up=cross(round(down2,stairs));
 assert.equal(up.dungeon.level,1);assert.deepEqual(up.units.C.pos,down);assert.deepEqual(up.floor,g1.floor);
 assert.deepEqual(up.enemies.map(id=>[up.units[id].hp,up.units[id].pos]),leaving.enemies.map(id=>[leaving.units[id].hp,leaving.units[id].pos]));
});
