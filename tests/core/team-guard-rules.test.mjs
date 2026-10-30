import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCommand, createExpedition, createMain, friend, jumpToFloor, key,
  skillTargets,
} from '../../src/core/engine.ts';
import {moveOf} from '../../src/core/moves.ts';
import {enemy,foeOf,bossOf} from './foe-fixture.mjs';

function withGuardMoves(run){for(const id of ['quickguard','reflect','lightscreen'])assert.ok(moveOf(id),`正式数据必须包含${id}`);return run();}
// Enemies attack only with roster moves. Literal damage (level 5, no stage) after the enemy difficulty multiplier 0.5 (round, at least 1): geodude tackle 9 -> 5 (6+ceil(6/2)); quickattack 8 -> 4 (6+ceil(4/2), distance 1-2);
// bubblebeam 9 -> 5 (6+ceil(6/2), Special, a ray up to 10 cells); bite 10 -> 5 (6+ceil(7/2), Physical, adjacent).
const shooter=(id,x,y,hp,move)=>foeOf(id,'pidgey',x,y,hp,{[move]:5});

const row=(from,to,y=1)=>Array.from({length:to-from+1},(_,i)=>({x:from+i,y}));
const rect=(x1,x2,y1,y2)=>Array.from({length:(x2-x1+1)*(y2-y1+1)},(_,i)=>({x:x1+i%(x2-x1+1),y:y1+Math.floor(i/(x2-x1+1))}));
let sequence=0;
function world({floor=row(0,12),friends=[friend('A',0,1,20)],enemies=[],rooms,seen}={}){
  const s=createMain(`team-guard-${++sequence}`,false);
  s.floor=floor;s.seen=seen??floor.map(key);s.units=Object.fromEntries([...friends,...enemies].map(u=>[u.id,u]));
  s.queue=friends.map(u=>u.id);s.enemies=enemies.map(u=>u.id);s.leader=s.queue[0];s.camp=[];s.points=[];s.log=[];
  if(rooms)s.rooms=rooms;else delete s.rooms;
  delete s.dungeon;delete s.prog;delete s.tms;delete s.shop;delete s.exchange;s.purse=0;
  return s;
}
function play(s,action,override){const r=applyCommand(s,{type:'round',action,...(override?{override}:{})});assert.equal(r.ok,true,r.ok?'':r.error);return r.state;}
function use(s,skill,target,override){return play(s,{type:'skill',skill,target},override);}
function equip(u,id,pp=3){if(!u.learned.includes(id))u.learned.push(id);u.pp[id]=pp;u.maxPp[id]=pp;}
function reject(s,skill,target){const r=applyCommand(s,{type:'round',action:{type:'skill',skill,target}});assert.equal(r.ok,false);return r.error;}

test('7.7b 三个正式招式取GTI同房间全队数据',()=>{
  for(const [id,pp] of [['quickguard','13'],['reflect','15'],['lightscreen','15']]){
    const spec=moveOf(id);assert.ok(spec,`生成的正式数据必须包含${id}`);
    assert.equal(spec.range,'room');assert.equal(spec.target,'party');assert.equal(spec.power,null);
    assert.deepEqual(spec.effects,[id]);assert.equal(spec.game,'MDGtI');assert.equal(spec.official.basePp,pp);
  }
});

test('快速防守按使用时的房间成员记入临时集合；本回合敌阶段有效，进房的后来者不受保护',()=>withGuardMoves(()=>{
  const a=friend('A',0,1,20),b=friend('B',2,2,20),c=friend('C',4,1,20);
  equip(a,'quickguard');
  const r1=shooter('R1',0,3,20,'quickattack'),r2=shooter('R2',5,1,20,'quickattack') /* adjacent to C: C stays at (4,1) */,r3=shooter('R3',2,5,20,'quickattack');
  let s=world({floor:rect(0,10,0,6),friends:[a,b,c],enemies:[r1,r2,r3],rooms:[{x:0,y:0,w:4,h:3}]});
  assert.deepEqual(skillTargets(s,'A','quickguard'),['A']);
  s=use(s,'quickguard','A',{actor:'B',action:{type:'move',to:{x:2,y:3}}});
  assert.deepEqual(s.units.B.pos,{x:2,y:3});assert.deepEqual(s.units.C.pos,{x:4,y:1}); // C stays beside R2 (it attacks instead of walking into the room)
  assert.equal(s.units.A.hp,20);assert.equal(s.units.B.hp,20);assert.equal(s.units.C.hp,16); // C was outside the room when the move was used: R2's 8 (4 after difficulty) reaches it
  assert.equal(Object.hasOwn(s.units.A,'quickguard'),false);
  s=play(s,{type:'wait'});assert.equal(s.units.A.hp,16); // 快速防守只覆盖施用当回合：R1 的 8 点（难度后 4）伤害到达 A
}));

test('快速防守挡两格外攻击，不挡相邻远程攻击',()=>withGuardMoves(()=>{
  const a=friend('A',1,1,20);equip(a,'quickguard');
  const adjacent=shooter('Adjacent',2,1,20,'quickattack'),far=shooter('Far',1,3,20,'quickattack');
  let s=world({floor:rect(0,4,0,4),friends:[a],enemies:[adjacent,far]});
  s=use(s,'quickguard','A');assert.equal(s.units.A.hp,16); // Adjacent 的 8 点（难度后 4）不被挡，Far（两格外）被挡
  s.enemies=['Far']; // Adjacent 离开，只看快速防守过期后 Far 的 8 点（难度后 4）
  s=play(s,{type:'wait'});assert.equal(s.units.A.hp,12);
}));

test('守住与快速防守互相视为连续使用；被拒绝不扣PP，等待后可用',()=>withGuardMoves(()=>{
  const a=friend('A',0,1,20,{protect:2});equip(a,'quickguard',2);
  let s=world({floor:row(0,4),friends:[a]});
  s=use(s,'protect','A');assert.equal(s.units.A.pp.protect,1);
  assert.deepEqual(skillTargets(s,'A','quickguard'),[]);
  assert.match(reject(s,'quickguard','A'),/守住与快速防守不能连续使用/);assert.equal(s.units.A.pp.quickguard,2);
  s=play(s,{type:'wait'});s=use(s,'quickguard','A');assert.equal(s.units.A.pp.quickguard,1);
  assert.deepEqual(skillTargets(s,'A','protect'),[]);
  assert.match(reject(s,'protect','A'),/守住与快速防守不能连续使用/);assert.equal(s.units.A.pp.protect,1);
}));

test('反射壁护住同房间伙伴；物理伤害先减防御再向下减半，持续十个敌方阶段',()=>withGuardMoves(()=>{
  const a=friend('A',0,1,20),b=friend('B',2,1,20),c=friend('C',4,1,20);a.stages.def=1;equip(a,'reflect',2);
  const e=enemy('E',1,1,100,'melee',7);
  let s=world({floor:rect(0,5,0,3),friends:[a,b,c],enemies:[e],rooms:[{x:0,y:0,w:4,h:3}]});
  s=use(s,'reflect','A');assert.equal(s.units.A.hp,18);assert.equal(s.units.A.reflect,9); // 难度后 5，(5-1)=4，向下减半 2
  assert.equal(s.units.B.reflect,9);assert.equal(s.units.C.reflect,0);
  s.enemies=[];
  for(let i=0;i<3;i++)s=play(s,{type:'wait'});
  assert.equal(s.units.A.reflect,6);assert.equal(s.units.B.reflect,6);
  s=use(s,'reflect','A');assert.equal(s.units.A.reflect,9); // 效果尚在时重用也从10重新计时
  for(let i=0;i<9;i++)s=play(s,{type:'wait'});
  assert.equal(s.units.A.reflect,0);assert.equal(s.units.B.reflect,0);
}));

test('光墙只减特殊攻击；首领的物理与特殊招式分别按招式类别结算',()=>withGuardMoves(()=>{
  const a=friend('A',0,1,20),b=friend('B',2,1,20);a.stages.def=1;equip(a,'lightscreen',2);
  const r=shooter('R',0,3,100,'bubblebeam');
  let s=world({floor:rect(0,5,0,5),friends:[a,b],enemies:[r],rooms:[{x:0,y:0,w:4,h:3}]});
  s=use(s,'lightscreen','A');assert.equal(s.units.A.hp,18);assert.equal(s.units.A.lightscreen,9);assert.equal(s.units.B.lightscreen,9); // bubblebeam 难度后 5-1=4，光墙减半 2

  const target=friend('T',3,1,20);target.stages.def=1;target.lightscreen=10;target.counter=3;
  const boss=bossOf('Boss',1,1,100,{bubblebeam:3}); // 两格远：不在房间里的敌人只看得到路径距离 2 以内
  s=world({floor:rect(0,5,0,3),friends:[target],enemies:[boss]});s=play(s,{type:'wait'});
  assert.equal(s.units.T.hp,18);assert.equal(s.units.Boss.hp,100); // 特殊招式 难度后 5-1=4，光墙减半 2；两格外不触发反击
  assert.equal(s.units.T.lightscreen,9);

  const adjacent=friend('Adj',1,1,20);adjacent.stages.def=1;adjacent.reflect=10;adjacent.counter=3;
  const closeBoss=bossOf('CloseBoss',0,1,100,{bite:3});
  s=world({floor:rect(0,3,0,3),friends:[adjacent],enemies:[closeBoss]});s=play(s,{type:'wait'});
  assert.equal(s.units.Adj.hp,18);assert.equal(s.units.CloseBoss.hp,98); // 咬（物理）难度后 5-1=4，反射壁减半 2；相邻反击反射实际 2
  assert.equal(s.units.Adj.counter,2);assert.equal(s.units.Adj.reflect,9);
}));

test('反击读取屏障处理后的实际伤害；被保护或快速防守归零时不触发',()=>withGuardMoves(()=>{
  const a=friend('A',1,1,20);a.stages.def=1;a.reflect=10;a.counter=2;
  const e=enemy('E',2,1,20,'melee',7);
  let s=world({floor:rect(0,4,0,4),friends:[a],enemies:[e]});s=play(s,{type:'wait'});
  assert.equal(s.units.A.hp,18);assert.equal(s.units.E.hp,18); // 难度后 5-1=4，反射壁减半 2；反击反射实际 2

  const guarded=friend('G',1,1,20);guarded.protect=1;guarded.counter=2;
  const attacker=enemy('Attacker',2,1,20,'melee',7);
  s=world({floor:rect(0,4,0,4),friends:[guarded],enemies:[attacker]});s=play(s,{type:'wait'});
  assert.equal(s.units.G.hp,20);assert.equal(s.units.Attacker.hp,20);
}));

test('首领远距离攻击会被快速防守挡住；快速防守过期后命中',()=>withGuardMoves(()=>{
  const a=friend('A',3,1,20);equip(a,'quickguard');
  const boss=bossOf('Boss',1,1,100,{bubblebeam:3});
  let s=world({floor:row(0,5),friends:[a],enemies:[boss]});s=use(s,'quickguard','A');assert.equal(s.units.A.hp,20);
  s=play(s,{type:'wait'});assert.equal(s.units.A.hp,15); // 一次 9 点，难度后 5
}));

test('7.7b状态初始为零，并在跨层与远征结束时清除',()=>{
  const a=friend('A',0,1);const e=enemy('E',2,1,10,'melee',1);
  assert.equal(a.reflect,0);assert.equal(a.lightscreen,0);
  assert.equal(e.reflect,0);assert.equal(e.lightscreen,0); // 7.8: enemies carry the same screens as friends

  let expedition=createExpedition('guard-reset',42,2);
  for(const id of expedition.queue){const u=expedition.units[id];u.reflect=4;u.lightscreen=7;}
  expedition=jumpToFloor(expedition,2);
  for(const id of expedition.queue){const u=expedition.units[id];assert.equal(u.reflect,0);assert.equal(u.lightscreen,0);}

  let s=world({floor:row(0,3),friends:[friend('X',1,1),friend('Y',2,1)]});
  for(const id of s.queue){s.units[id].reflect=2;s.units[id].lightscreen=3;}
  s.points=[{pos:{x:1,y:1},kind:'exit',used:false}];
  s=play(s,{type:'interact',exit:true});
  const ended=applyCommand(s,{type:'finishExit'});assert.equal(ended.ok,true);
  for(const id of ended.state.queue){const u=ended.state.units[id];assert.equal(u.reflect,0);assert.equal(u.lightscreen,0);}
});

test('7.7b TM pool 只由显式版本3的首领队伍远征启用',()=>{
  const squad={leader:0,members:[0,1,2].map(i=>({inst:`I${i}`,species:'charmander',carry:[{move:'tackle',pp:3}]}))};
  const legacy=createExpedition('pool-old',42,3,squad,0);
  const v3=createExpedition('pool-v3',42,3,squad,0,undefined,3);
  const noBoss=createExpedition('pool-not-boss',42,2,squad,0,undefined,3);
  const noSquad=createExpedition('pool-no-squad',42,3,undefined,0,true,3);
  assert.equal(legacy.dungeon.tmPool,undefined);assert.equal(v3.dungeon.tmPool,3);
  assert.equal(noBoss.dungeon.tmPool,undefined);assert.equal(noSquad.dungeon.tmPool,undefined);
});
