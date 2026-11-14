import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createExpedition,createMain,friend,jumpToFloor,key,STATUS_NAMES,ITEM_CURES} from '../../src/core/engine.ts';
import {SPECIES} from '../../src/core/roster.ts';
import {MOVE_DEFS,moveEffects} from '../../src/core/moves.ts';
import {enemy as baseEnemy,foeOf as baseFoeOf} from './foe-fixture.mjs';
import {sureHit} from './sure-hit.mjs';

const row=(from,to,y=1)=>Array.from({length:to-from+1},(_,i)=>({x:from+i,y}));
let n=0;
function world({friends=[friend('A',0,1,40,{hyperbeam:2,tackle:2})],enemies=[baseEnemy('E',1,1,100,'melee',0)],floor=row(0,8)}={}){
  const s=createMain('recharge-b3-'+(++n),false);s.floor=floor;s.seen=s.floor.map(key);
  s.units=Object.fromEntries([...friends,...enemies].map(u=>[u.id,u]));s.queue=friends.map(u=>u.id);s.enemies=enemies.map(u=>u.id);s.leader=s.queue[0];s.camp=[];s.points=[];s.log=[];return sureHit(s);
}
function play(s,action,override){const r=applyCommand(s,{type:'round',action,...(override?{override}:{})});assert.equal(r.ok,true,r.ok?'':r.error);return r.state;}

test('B3 五招在固定图鉴学习表中可学，且共用伤害加休息效果',()=>{
  for(const id of ['hyperbeam','gigaimpact','frenzyplant','hydrocannon','blastburn']){
    assert.deepEqual(MOVE_DEFS[id].effects,['damage','recharge']);
    assert.ok(Object.values(SPECIES).some(sp=>sp.learnable.some(m=>m.move===id)||sp.levelUp.some(m=>m.move===id)),id+' must have an eligible learner');
  }
  assert.equal(STATUS_NAMES.recharge,'休息');assert.ok(!ITEM_CURES.healSeed.includes('recharge'));
});

test('实际扣血才休息；下一次合法行动落空且不额外扣PP，#211预检仍拒绝非法命令',()=>{
  let s=world();s=play(s,{type:'skill',skill:'hyperbeam',target:'E'});
  assert.ok(s.units.E.hp<100);assert.equal(s.units.A.pp.hyperbeam,1);assert.equal(s.units.A.status.recharge.left,1);
  const bad=applyCommand(s,{type:'round',action:{type:'skill',skill:'tackle',target:'missing'}});assert.equal(bad.ok,false);assert.equal(bad.state.units.A.status.recharge.left,1);
  s=play(s,{type:'skill',skill:'tackle',target:'E'});assert.equal(s.units.A.pp.tackle,2);assert.equal(s.units.A.status?.recharge,undefined);
  s=play(s,{type:'skill',skill:'tackle',target:'E'});assert.equal(s.units.A.pp.tackle,1);
});

test('全未命中与零实际伤害都不触发休息',()=>{
  const fx=moveEffects('hyperbeam'),old=fx.acc;
  try{fx.acc=0;let s=world();s=play(s,{type:'skill',skill:'hyperbeam',target:'E'});assert.equal(s.units.E.hp,100);assert.equal(s.units.A.status?.recharge,undefined);
  }finally{fx.acc=old;}
  let s=world();s.units.E.status={frz:{left:1}};s=play(s,{type:'skill',skill:'hyperbeam',target:'E'});assert.equal(s.units.E.hp,100);assert.equal(s.units.A.status?.recharge,undefined);
});

test('换位的延迟结算不会让主控先行动时绕过休息，主控先后两种队列顺序都落空',()=>{
  let s=world({friends:[friend('A',0,1,30),friend('B',1,1,30)],enemies:[]});s.units.A.status={recharge:{left:1}};
  s=play(s,{type:'swap',target:'B'});assert.equal(s.units.A.status?.recharge,undefined);assert.deepEqual(s.units.A.pos,{x:0,y:1});assert.deepEqual(s.units.B.pos,{x:1,y:1});
  s=world({friends:[friend('A',0,1,30),friend('B',1,1,30)],enemies:[]});s.leader='B';s.units.B.status={recharge:{left:1}};
  s=play(s,{type:'swap',target:'A'});assert.equal(s.units.B.status?.recharge,undefined);assert.deepEqual(s.units.A.pos,{x:0,y:1});assert.deepEqual(s.units.B.pos,{x:1,y:1});
});

test('切换主控保留单位自己的休息；伙伴干预与敌方 AI 的自身机会也会被休息阻止',()=>{
  let s=world({friends:[friend('A',0,1,30),friend('B',1,1,30,{tackle:2})],enemies:[baseEnemy('E',2,1,100,'melee',0)]});
  s.units.B.status={recharge:{left:1}};s=applyCommand(s,{type:'switch',actor:'B'}).state;assert.equal(s.leader,'B');assert.equal(s.units.B.status.recharge.left,1);
  s=world({friends:[friend('A',0,1,30),friend('B',1,1,30,{tackle:2})],enemies:[baseEnemy('E',2,1,100,'melee',0)]});s.units.B.status={recharge:{left:1}};
  s=play(s,{type:'wait'}, {actor:'B',action:{type:'skill',skill:'tackle',target:'E'}});assert.equal(s.units.B.pp.tackle,2);assert.equal(s.units.B.status?.recharge,undefined);
  const e=baseFoeOf('R','pikachu',2,1,100,{hyperbeam:2});e.status={recharge:{left:1}};s=world({enemies:[e]});s=play(s,{type:'wait'});assert.equal(s.units.R.pp.hyperbeam,2);assert.equal(s.units.R.status?.recharge,undefined);
});

test('多目标招式只需一个目标实际扣血；混乱方向无目标时不休息',()=>{
  let s=world({friends:[friend('A',1,1,40,{blastburn:2})],enemies:[baseEnemy('E1',0,1,100,'melee',0),baseEnemy('E2',2,1,100,'melee',0)]});
  s.units.E1.protect=1;s=play(s,{type:'skill',skill:'blastburn',target:'E1'});
  assert.equal(s.units.E1.hp,100);assert.ok(s.units.E2.hp<100);assert.ok(s.units.A.status?.recharge);
  let missedTarget=false;
  for(let seed=1;seed<=100&&!missedTarget;seed++){
    let q=world();q.battleRng=seed;q.units.A.status={confusion:{left:3}};q=play(q,{type:'skill',skill:'hyperbeam',target:'E'});
    if(q.events.some(e=>e.type==='castNoTarget')){missedTarget=true;assert.equal(q.units.E.hp,100);assert.equal(q.units.A.status?.recharge,undefined);assert.ok(q.units.A.pp.hyperbeam<2);}
  }
  assert.equal(missedTarget,true,'a fixed battle stream sends the confused attack into an empty direction');
});

test('Reviver Seed on a target still counts real HP loss; attacker counter KO clears recharge, while its seed rescue retains it',()=>{
  let rival=baseFoeOf('R','pikachu',2,1,100,{hyperbeam:2});
  let s=world({friends:[friend('A',0,1,1)],enemies:[rival]});s.prog={level:2,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0,reviverSeed:1}};
  s=play(s,{type:'wait'});assert.equal(s.prog.items.reviverSeed,0);assert.ok(s.units.A.hp>0);assert.ok(s.units.R.pp.hyperbeam===1);assert.ok(s.units.R.status?.recharge);

  const counterTarget=()=>{const e=baseEnemy('E',1,1,100,'melee',0);e.counter=1;return e;};
  s=world({friends:[friend('A',0,1,1,{hyperbeam:2})],enemies:[counterTarget()]});s=play(s,{type:'skill',skill:'hyperbeam',target:'E'});
  assert.equal(s.units.A.hp,0);assert.equal(s.units.A.status?.recharge,undefined);
  s=world({friends:[friend('A',0,1,1,{hyperbeam:2})],enemies:[counterTarget()]});s.prog={level:2,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0,reviverSeed:1}};
  s=play(s,{type:'skill',skill:'hyperbeam',target:'E'});assert.ok(s.units.A.hp>0);assert.equal(s.prog.items.reviverSeed,0);assert.ok(s.units.A.status?.recharge);
});

test('睡眠或打盹会消耗并列的休息；梦话反应只休息到下一次自身机会，后续受击不再重复反应',()=>{
  for(const sleep of ['slp','nap','frz']){
    let s=world({enemies:[]});s.units.A.status={[sleep]:{left:1},recharge:{left:1}};s=play(s,{type:'wait'});
    assert.equal(s.units.A.status?.[sleep],undefined);assert.equal(s.units.A.status?.recharge,undefined);
    assert.ok(s.events.some(e=>e.type==='status'&&e.status==='recharge'&&e.change==='expire'));
    assert.equal(s.units.A.pp.tackle,2);
  }
  const sleeper=friend('A',0,1,40,{sleeptalk:3,hyperbeam:2});sleeper.status={nap:{left:3}};
  const first=baseFoeOf('R1','pikachu',1,1,100,{tackle:2});
  const second=baseFoeOf('R2','pikachu',2,1,100,{quickattack:2});
  let s=world({friends:[sleeper],enemies:[first,second]});s=play(s,{type:'wait'});
  assert.equal(s.units.A.pp.sleeptalk,2);assert.equal(s.units.A.pp.hyperbeam,2);
  assert.equal(s.events.filter(e=>e.type==='sleeptalk'&&e.unit==='A').length,1);
  assert.ok(s.units.A.status?.recharge);assert.equal(s.units.A.status.recharge.fresh,undefined);
  s.enemies=[];s=play(s,{type:'wait'});assert.equal(s.units.A.status?.recharge,undefined);
});

test('换层与结束远征都会清除休息',()=>{
  const run=createExpedition('recharge-floor-'+(++n),777);run.units[run.leader].status={recharge:{left:1}};
  const next=jumpToFloor(run,2);assert.equal(next.dungeon.level,2);assert.equal(next.units[next.leader].status?.recharge,undefined);
  let s=world({enemies:[]});s.phase='exit';s.request={actor:'A',pos:{x:0,y:1},locked:true};s.units.A.status={recharge:{left:1}};
  const ended=applyCommand(s,{type:'finishExit'});assert.equal(ended.ok,true);assert.equal(ended.state.phase,'ended');assert.equal(ended.state.units.A.status?.recharge,undefined);
});
