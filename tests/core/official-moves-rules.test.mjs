import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCommand, createExpedition, createMain, friend, speciesUnit, jumpToFloor, key, newcomer,
  skillTargets,
} from '../../src/core/engine.ts';
import {enemy,foeOf,bossOf} from './foe-fixture.mjs';
import {MOVE_DEFS,moveOf} from '../../src/core/moves.ts';

const row=(from,to,y=1)=>Array.from({length:to-from+1},(_,i)=>({x:from+i,y}));
const rect=(x1,x2,y1,y2)=>Array.from({length:(x2-x1+1)*(y2-y1+1)},(_,i)=>({x:x1+i%(x2-x1+1),y:y1+Math.floor(i/(x2-x1+1))}));
let sequence=0;
function world({floor=row(0,12),friends=[friend('A',0,1,20)],enemies=[],rooms,level=1,seen}={}){
  const s=createMain(`move-rules-${++sequence}`,false);
  s.floor=floor;s.seen=seen??floor.map(key);s.units=Object.fromEntries([...friends,...enemies].map(u=>[u.id,u]));
  s.queue=friends.map(u=>u.id);s.enemies=enemies.map(u=>u.id);s.leader=s.queue[0];s.camp=[];s.points=[];s.log=[];
  if(rooms)s.rooms=rooms;else delete s.rooms;
  if(level>1)s.prog={level,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0}};
  else delete s.prog;
  return s;
}
function equip(u,id,pp=3){if(!u.learned.includes(id))u.learned.push(id);u.pp[id]=pp;u.maxPp[id]=pp;}
function play(s,action){const r=applyCommand(s,{type:'round',action});assert.equal(r.ok,true,r.ok?'':r.error);return r.state;}
function use(s,skill,target){return play(s,{type:'skill',skill,target});}
function reject(s,skill,target){const r=applyCommand(s,{type:'round',action:{type:'skill',skill,target}});assert.equal(r.ok,false);return r.error;}
function withMove(id,spec,run){
  const existed=Object.prototype.hasOwnProperty.call(MOVE_DEFS,id),before=MOVE_DEFS[id];
  MOVE_DEFS[id]=spec;
  try{return run();}
  finally{if(existed)MOVE_DEFS[id]=before;else delete MOVE_DEFS[id];}
}

test('首批 25 个官方招式都有可用的射程、目标、威力和效果字段',()=>{
  const ids=['absorb','bite','defensecurl','dragontail','ember','gust','harden','helpinghand','leafage','magicalleaf','mudslap','poisonfang','pound','protect','pursuit','quickattack','roar','scratch','seedbomb','slam','tackle','terablast','thundershock','watergun','whirlwind'];
  for(const id of ids)assert.ok(Object.hasOwn(MOVE_DEFS,id),`首批招式必须保留：${id}`);
  for(const id of ids){const m=moveOf(id);assert.ok(m,id);assert.ok(m.range);assert.ok(m.target);assert.ok(Array.isArray(m.effects));}
  assert.equal(moveOf('protect').effects[0],'protect');
  assert.equal(moveOf('absorb').effects.includes('drain'),true);
  assert.equal(moveOf('helpinghand').effects[0],'stage:atk:+1');
});

test('front 只命中上下左右相邻；front2 到两格且要求直线无遮挡',()=>{
  const a=friend('A',0,1,20,{tackle:2,quickattack:2}),e=enemy('E',1,1,30,'melee',0);
  const s=world({floor:row(0,4),friends:[a],enemies:[e]});
  assert.deepEqual(skillTargets(s,'A','tackle'),['E']);
  const hit=use(s,'tackle','E');assert.equal(hit.units.E.hp,21); // 6 + ceil(6 / 2)

  const q=world({floor:row(0,4),friends:[friend('A',0,1,20,{quickattack:2})],enemies:[enemy('E',2,1,30,'melee',0)]});
  assert.deepEqual(skillTargets(q,'A','quickattack'),['E']);
  assert.equal(use(q,'quickattack','E').units.E.hp,22); // 6 + ceil(4 / 2)

  const tooFar=world({floor:row(0,4),friends:[friend('A',0,1,20,{tackle:2})],enemies:[enemy('E',2,1,30,'melee',0)]});
  assert.match(reject(tooFar,'tackle','E'),/相邻格/);assert.equal(tooFar.units.A.pp.tackle,2);
  const diagonal=world({floor:rect(0,2,0,2),friends:[friend('A',0,0,20,{quickattack:2})],enemies:[enemy('E',1,1,30,'melee',0)]});
  assert.deepEqual(skillTargets(diagonal,'A','quickattack'),[]);assert.match(reject(diagonal,'quickattack','E'),/同排或同列/);
  const blocked=world({floor:[...row(0,0),...row(2,2)],friends:[friend('A',0,1,20,{quickattack:2})],enemies:[enemy('E',2,1,30,'melee',0)]});
  assert.deepEqual(skillTargets(blocked,'A','quickattack'),[]);assert.match(reject(blocked,'quickattack','E'),/被墙挡住/);
  const unitBlocked=world({floor:row(0,3),friends:[friend('A',0,1,20,{quickattack:2}),friend('B',1,1)],enemies:[enemy('E',2,1,30,'melee',0)]});
  assert.deepEqual(skillTargets(unitBlocked,'A','quickattack'),[]);assert.match(reject(unitBlocked,'quickattack','E'),/被B挡住/);
});

test('伤害按威力、攻击阶段、本局等级和防御阶段结算；普攻也吃两项阶段加成',()=>{
  const a=friend('A',0,1,20,{tackle:2});a.stages.atk=2;
  const e=enemy('E',1,1,50,'melee',0);e.stages.def=1;
  const s=world({floor:row(0,3),friends:[a],enemies:[e],level:13});
  const moveHit=use(s,'tackle','E');assert.equal(moveHit.units.E.hp,38); // 9 + 2 攻击 + 2 等级(floor((13-5)/4)) - 1 防御
  const basicHit=play(moveHit,{type:'basic',target:'E'});assert.equal(basicHit.units.E.hp,29); // 6 + 2 + 2 - 1
});

test('吸取按实际伤害恢复一半并受最大 HP 限制',()=>{
  const a=friend('A',0,1,5,{absorb:2}),e=enemy('E',1,1,30,'melee',0);e.stages.def=3;
  let s=world({floor:row(0,3),friends:[a],enemies:[e]});
  s=use(s,'absorb','E');assert.equal(s.units.E.hp,26);assert.equal(s.units.A.hp,7); // 实际伤害 4，回复 floor(4/2)
  s.units.A.hp=19;s=use(s,'absorb','E');assert.equal(s.units.A.hp,20);

  const low=world({floor:row(0,3),friends:[friend('A',0,1,5,{absorb:1})],enemies:[enemy('E',1,1,2,'melee',0)]});
  s=use(low,'absorb','E');assert.equal(s.units.E.hp,0);assert.equal(s.units.A.hp,6); // 公式伤害 7，但只扣掉目标剩余的 2 HP，恢复 1
});

test('能力阶段有 ±3 上下限；帮助只提升房间内队友，走廊退化为切比雪夫距离 2',()=>withMove('testRaise',{range:'user',target:'user',power:null,effects:['stage:atk:+1']},()=>
  withMove('testLower',{range:'user',target:'user',power:null,effects:['stage:def:-1']},()=>{
    const a=friend('A',1,1,20),b=friend('B',2,2),c=friend('C',5,1);equip(a,'testRaise',5);equip(a,'testLower',5);
    let s=world({floor:rect(0,6,0,4),friends:[a,b,c],rooms:[{x:0,y:0,w:4,h:4}]});
    for(let i=0;i<5;i++)s=use(s,'testRaise','A');assert.equal(s.units.A.stages.atk,3);
    s.units.A.stages.def=-3;for(let i=0;i<4;i++)s=use(s,'testLower','A');assert.equal(s.units.A.stages.def,-3);

    const h=friend('H',0,1,20,{helpinghand:2}),inside=friend('I',2,2),outside=friend('O',4,2);
    s=world({floor:rect(0,5,0,4),friends:[h,inside,outside],rooms:[{x:0,y:0,w:3,h:4}]});
    assert.deepEqual(skillTargets(s,'H','helpinghand'),['H']);
    s=use(s,'helpinghand','H');assert.equal(s.units.I.stages.atk,1);assert.equal(s.units.O.stages.atk,0);

    const hall=world({floor:rect(0,5,0,4),friends:[friend('H',0,1,20,{helpinghand:2}),friend('Near',2,2),friend('Far',3,2)]});
    assert.deepEqual(skillTargets(hall,'H','helpinghand'),['H']);
    const h2=use(hall,'helpinghand','H');assert.equal(h2.units.Near.stages.atk,1);assert.equal(h2.units.Far.stages.atk,0);
  })
));

test('守住覆盖施用当回合的敌方阶段并持续三次；连续使用拒绝且不扣 PP',()=>{
  // Enemies attack only with roster moves: geodude tackle (front, 6+ceil(6/2)=9) and a quickattack user two cells away (front2, 6+ceil(4/2)=8).
  const a=friend('A',2,1,20,{protect:5}),e=enemy('E',3,1,30,'melee',4);
  const shooter=foeOf('R','pidgey',2,3,30,{quickattack:3});
  let s=world({floor:rect(0,5,0,5),friends:[a],enemies:[e,shooter]});
  s=use(s,'protect','A');assert.equal(s.units.A.hp,20);assert.equal(s.units.A.protect,2);assert.equal(s.units.A.pp.protect,4);
  assert.deepEqual(skillTargets(s,'A','protect'),[]);assert.match(reject(s,'protect','A'),/不能连续使用/);assert.equal(s.units.A.pp.protect,4);
  s=play(s,{type:'wait'});assert.equal(s.units.A.hp,20);assert.equal(s.units.A.protect,1);
  s=play(s,{type:'wait'});assert.equal(s.units.A.hp,20);assert.equal(s.units.A.protect,0);
  s=play(s,{type:'wait'});assert.equal(s.units.A.hp,3); // 20 - 9 (E tackle) - 8 (R quickattack)
});

test('守住后等待一回合即可再次使用',()=>{
  const a=friend('A',1,1,20,{protect:2}),e=enemy('E',2,1,20,'melee',4);
  let s=world({floor:row(0,3),friends:[a],enemies:[e]});
  s=use(s,'protect','A');assert.equal(s.units.A.protect,2);assert.equal(s.units.A.pp.protect,1);assert.equal(s.units.A.hp,20);
  s=play(s,{type:'wait'});assert.equal(s.units.A.lastMove,null);assert.equal(s.units.A.protect,1);assert.equal(s.units.A.hp,20);
  s=use(s,'protect','A');assert.equal(s.units.A.protect,2);assert.equal(s.units.A.pp.protect,0);assert.equal(s.units.A.hp,20);
});

test('反击对每次相邻敌方命中各反射同额伤害；被守住挡掉或来自远处时不触发',()=>{
  // Every enemy hit is a geodude tackle for 9 (6+ceil(6/2)); the reflected amount equals the HP actually lost.
  let a=friend('A',1,1,20,{pursuit:2}),e1=enemy('E1',2,1,1,'melee',2),e2=enemy('E2',1,2,20,'melee',3);
  let s=world({floor:rect(0,4,0,4),friends:[a],enemies:[e1,e2]});
  s=use(s,'pursuit','A');assert.equal(s.units.E1.hp,0);assert.equal(s.units.E2.hp,11);assert.equal(s.units.A.hp,2);assert.equal(s.units.A.counter,2);

  a=friend('A',1,1,20);a.counter=1;a.protect=1;e1=enemy('E',2,1,10,'melee',5);
  s=world({floor:rect(0,3,0,3),friends:[a],enemies:[e1]});s=play(s,{type:'wait'});
  assert.equal(s.units.A.hp,20);assert.equal(s.units.E.hp,10);

  a=friend('A',1,1,20);a.counter=1;const r=foeOf('R','pidgey',1,3,10,{quickattack:2});
  s=world({floor:rect(0,4,0,4),friends:[a],enemies:[r]});s=play(s,{type:'wait'});
  assert.equal(s.units.A.hp,12);assert.equal(s.units.R.hp,10); // 两格外的 quickattack 伤 8，不触发反击

  a=friend('A',1,1,20);a.counter=1;e1=enemy('E',2,1,10,'melee',0);
  s=world({floor:rect(0,3,0,3),friends:[a],enemies:[e1]});s=play(s,{type:'wait'});
  assert.equal(s.units.A.hp,20);assert.equal(s.units.E.hp,10); // 零伤害不触发反击

  a=friend('A',2,1,20);a.counter=3;const boss=bossOf('Boss',1,1,20,{bite:2});
  s=world({floor:rect(0,4,0,4),friends:[a],enemies:[boss]});s=play(s,{type:'wait'});
  assert.equal(s.units.A.hp,10);assert.equal(s.units.Boss.hp,10);assert.equal(s.units.A.counter,2); // 咬 6+ceil(7/2)=10，反射 10
});

test('吹飞遇墙或单位各造成 5 点撞击伤害；撞击不受守住影响也不触发反击',()=>withMove('testBlow',{range:'front',target:'teammates',power:null,effects:['blowaway']},()=>{
  const a=friend('A',0,1,20),b=friend('B',1,1,20);b.protect=3;b.counter=3;b.stages.def=3;
  equip(a,'testBlow');let s=world({floor:row(0,3),friends:[a,b]});
  s=use(s,'testBlow','B');assert.equal(s.units.B.hp,15);assert.equal(s.units.A.hp,20);assert.equal(s.units.B.protect,2);assert.equal(s.units.B.counter,2);
  assert.ok(s.log.some(line=>line==='A吹飞B到3,1'));

  const p=friend('A',0,1,20,{roar:1}),e=enemy('E',1,1,20,'melee',0);e.stages.def=3;
  s=world({floor:row(0,4),friends:[p],enemies:[e]});s=use(s,'roar','E');
  assert.deepEqual(s.units.E.pos,{x:4,y:1});assert.equal(s.units.E.hp,15); // 第五格是墙，撞墙

  const c=friend('A',0,1,20,{roar:1}),hit=enemy('E',1,1,20,'melee',0),block=enemy('Block',3,1,20,'melee',0);hit.stages.def=3;block.stages.def=3;
  s=world({floor:row(0,5),friends:[c],enemies:[hit,block]});s=use(s,'roar','E');
  assert.deepEqual(s.units.E.pos,{x:2,y:1});assert.equal(s.units.E.hp,15);assert.equal(s.units.Block.hp,15);

  const long=friend('A',0,1,20,{roar:1}),far=enemy('E',1,1,20,'melee',0);
  s=world({floor:row(0,11),friends:[long],enemies:[far],seen:['0,1','1,1']});s.points=[{pos:{x:11,y:1},kind:'item',used:false}];
  s=use(s,'roar','E');assert.deepEqual(s.units.E.pos,{x:11,y:1});assert.equal(s.units.E.hp,20);assert.equal(s.points[0].used,false);
}));

test('吼叫不能吹飞首领且不扣 PP；龙尾可伤害首领但不移动首领',()=>{
  const a=friend('A',1,1,20,{roar:2,dragontail:2}),boss=bossOf('Boss',2,1,40,{bite:2});
  const s=world({floor:rect(0,4,0,4),friends:[a],enemies:[boss]});
  assert.deepEqual(skillTargets(s,'A','roar'),[]);assert.match(reject(s,'roar','Boss'),/首领不能被吹飞/);assert.equal(s.units.A.pp.roar,2);
  assert.deepEqual(skillTargets(s,'A','dragontail'),['Boss']);
  const hit=use(s,'dragontail','Boss');assert.equal(hit.units.Boss.hp,32);assert.deepEqual(hit.units.Boss.pos,{x:2,y:1});assert.equal(hit.units.A.pp.dragontail,1);
});

test('合成 line10 招式射程上限为十格并命中射线上第一个单位，队友也会受伤',()=>withMove('testLine10',{range:'line10',target:'all',power:2,effects:['damage']},()=>{
  const a=friend('A',0,1,20),ally=friend('B',4,1,20),e=enemy('E',7,1,30,'melee',0);equip(a,'testLine10');
  const s=world({floor:row(0,10),friends:[a,ally],enemies:[e]});
  assert.deepEqual(skillTargets(s,'A','testLine10'),['B']);
  const hit=use(s,'testLine10','B');assert.equal(hit.units.B.hp,13);assert.equal(hit.units.E.hp,30);
  const max=world({floor:row(0,10),friends:[friend('A',0,1,20)],enemies:[enemy('E',10,1,30,'melee',0)]});equip(max.units.A,'testLine10');
  assert.deepEqual(skillTargets(max,'A','testLine10'),['E']);
  const over=world({floor:row(0,11),friends:[friend('A',0,1,20)],enemies:[enemy('E',11,1,30,'melee',0)]});equip(over.units.A,'testLine10');
  assert.deepEqual(skillTargets(over,'A','testLine10'),[]);assert.match(reject(over,'testLine10','E'),/超出招式射程10格/);
  const wall=world({floor:[...row(0,2),...row(4,8)],friends:[friend('A',0,1,20)],enemies:[enemy('E',6,1,30,'melee',0)]});equip(wall.units.A,'testLine10');
  assert.deepEqual(skillTargets(wall,'A','testLine10'),[]);assert.match(reject(wall,'testLine10','E'),/被墙挡住/);
}));

test('合成 around 招式命中切比雪夫距离一格内全部目标，不命中第二圈',()=>withMove('testAround',{range:'around',target:'enemy',power:2,effects:['damage']},()=>{
  const a=friend('A',2,2,20);equip(a,'testAround');
  const e1=enemy('E1',3,3,20,'melee',0),e2=enemy('E2',1,2,20,'melee',0),e3=enemy('E3',4,2,20,'melee',0);
  const s=world({floor:rect(0,5,0,5),friends:[a],enemies:[e1,e2,e3]});
  assert.deepEqual(skillTargets(s,'A','testAround'),['E1','E2']);
  const hit=use(s,'testAround','E1');assert.equal(hit.units.E1.hp,13);assert.equal(hit.units.E2.hp,13);assert.equal(hit.units.E3.hp,20);
}));

test('跨层、新伙伴加入和远征结束会清零战斗状态',()=>{
  const newUnit=newcomer();assert.deepEqual(newUnit.stages,{atk:0,def:0});assert.equal(newUnit.protect,0);assert.equal(newUnit.counter,0);assert.equal(newUnit.lastMove,null);
  assert.equal(newUnit.reflect,0);assert.equal(newUnit.lightscreen,0);
  let expedition=createExpedition('state-reset',42,2);
  for(const id of expedition.queue){const u=expedition.units[id];u.stages={atk:2,def:-1};u.protect=2;u.counter=1;u.lastMove='protect';u.reflect=4;u.lightscreen=7;}
  expedition=jumpToFloor(expedition,2);
  for(const id of expedition.queue){const u=expedition.units[id];assert.deepEqual(u.stages,{atk:0,def:0});assert.equal(u.protect,0);assert.equal(u.counter,0);assert.equal(u.lastMove,null);assert.equal(u.reflect,0);assert.equal(u.lightscreen,0);}

  const s=world({floor:row(0,3),friends:[friend('A',1,1),friend('B',2,1)]});
  for(const id of s.queue){s.units[id].stages={atk:1,def:2};s.units[id].protect=2;s.units[id].counter=3;s.units[id].lastMove='protect';s.units[id].reflect=2;s.units[id].lightscreen=3;}
  s.leader='A';s.points=[{pos:{x:1,y:1},kind:'exit',used:false}];
  const request=play(s,{type:'interact',exit:true});assert.equal(request.phase,'exit');
  const ended=applyCommand(request,{type:'finishExit'});assert.equal(ended.ok,true);
  for(const id of ended.state.queue){const u=ended.state.units[id];assert.deepEqual(u.stages,{atk:0,def:0});assert.equal(u.protect,0);assert.equal(u.counter,0);assert.equal(u.lastMove,null);assert.equal(u.reflect,0);assert.equal(u.lightscreen,0);}
});

test('普攻类别（规格3.1）：物攻高算物理，特攻高算特殊，相等算物理；反射壁与光墙各减半对应类别',()=>{
  // Literal base stats from the roster: geodude atk 80 > spa 30; charmander atk 52 < spa 60; growlithe atk 70 = spa 70. Basic power at level 5 is 6.
  const cases=[['geodude','reflect',3],['geodude','lightscreen',6],['charmander','reflect',6],['charmander','lightscreen',3],['growlithe','reflect',3],['growlithe','lightscreen',6]];
  for(const [species,screen,expected] of cases){
    const a=speciesUnit('A',species,5,{x:0,y:1}),e=enemy('E',1,1,30,'melee',0);e[screen]=5;
    const s=play(world({floor:row(0,3),friends:[a],enemies:[e]}),{type:'basic',target:'E'});
    assert.equal(30-s.units.E.hp,expected,`${species} basic against ${screen}`);
  }
});

test('领队在本方阶段被反击打倒后，后面的“一起行动”队友仍能正常行动，不崩溃',()=>{
  const a=friend('A',1,1,1,{tackle:2}),b=friend('B',2,3,20,{quickattack:2}),c=friend('C',0,1,20,{tackle:2}); // B reaches E only at distance 2, so its policy must read the leader's position
  const e=enemy('E',2,1,30,'melee',0);e.counter=3;
  const s=world({floor:rect(0,3,0,3),friends:[a,b,c],enemies:[e]});
  const r=applyCommand(s,{type:'round',action:{type:'basic',target:'E'}});
  assert.equal(r.ok,true,r.ok?'':r.error);
  assert.equal(r.state.units.A.hp,0); // the basic attack (6) was reflected onto the 1 HP leader
  assert.notEqual(r.state.leader,'A');
});
