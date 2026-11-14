import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createMain,friend,key,PROG} from '../../src/core/engine.ts';
import {foeOf} from './foe-fixture.mjs';
import {sureHit} from './sure-hit.mjs';
import {initialProfile} from '../../src/core/base.ts';
import {TrialStore} from '../../src/core/save.ts';

const floor=Array.from({length:49},(_,i)=>({x:i%7,y:Math.floor(i/7)}));
const useSeed=(id='A')=>({type:'use',item:'joySeed',target:id});
const wait={type:'wait'};
function world({exp=0,level=5,joySeeds=1,queue=['A'],leader='A',enemyHp=100,firstHp=20,blessings=[]}={}){
  const s=createMain('joy-seed-b9',false);
  const units={A:friend('A',2,2,firstHp,{tackle:9})};
  if(queue.includes('B'))units.B=friend('B',2,3,20,{tackle:9});
  const e=foeOf('E','geodude',3,3,enemyHp,{tackle:9});e.waitOnly=true;units.E=e;
  s.floor=floor;s.seen=floor.map(key);s.units=units;s.queue=[...queue];s.enemies=['E'];s.leader=leader;
  s.camp=[];s.points=[];s.log=[];s.round=0;s.phase='playing';
  delete s.dungeon;delete s.rooms;delete s.adventureRooms;delete s.commissions;delete s.pendingSettlement;
  s.prog={level,exp,rng:123,made:0,kills:[],items:{berry:0,tonic:0,joySeed:joySeeds}};
  s.blessings=blessings;
  s.tms=[];
  return sureHit(s);
}
function round(action,override){
  return {type:'round',action,...(override?{override}:{})};
}
function play(s,action,override){
  const r=applyCommand(s,round(action,override));
  assert.equal(r.ok,true,r.error);
  return r.state;
}
function memoryPort(){
  return {value:null,getItem(){return this.value;},setItem(_key,value){this.value=value;},removeItem(){this.value=null;}};
}

test('B9 joy seed fills only the current level gap, leaves HP alone, and does not change permanent camp growth',async()=>{
  const s=world({exp:3,firstHp:7});
  const store=new TrialStore(memoryPort());await store.whenReady;
  assert.equal(await store.start(s,initialProfile()),true);
  const campBefore=store.profile;
  const result=await store.dispatch(round(useSeed()));
  assert.equal(result.ok,true,result.error);
  assert.equal(PROG.thresholds[6],5);
  assert.equal(result.state.prog.exp,5,'3 experience is raised to the level 6 threshold');
  assert.equal(result.state.prog.level,6);
  assert.equal(result.state.prog.items.joySeed,0);
  assert.equal(result.state.units.A.hp,7,'level growth does not restore current HP');
  assert.equal(result.state.units.A.maxHp,21);
  assert.deepEqual(store.profile,campBefore,'the expedition item does not edit the separate camp profile');
});

test('B9 two seeds used by different teammates in one round advance from 0 to 5 to 11',()=>{
  const s=world({queue:['A','B'],joySeeds:2});
  const r=play(s,useSeed('A'),{actor:'B',action:useSeed('B')});
  assert.equal(r.prog.exp,11);
  assert.equal(r.prog.level,7);
  assert.equal(r.prog.items.joySeed,0);
  assert.equal(r.events.filter(e=>e.type==='itemUse'&&e.item==='joySeed').length,2);
});

test('B9 reads experience credited earlier in the same round; Scholar multiplies defeats, not the seed gap',()=>{
  const currentExp=world({exp:0,includeB:true,queue:['B','A'],enemyHp:1});
  delete currentExp.units.E.species;
  const afterDefeat=play(currentExp,useSeed('A'),{actor:'B',action:{type:'skill',skill:'tackle',target:'E'}});
  assert.equal(currentExp.prog.level,5,'the starting level has not yet been settled');
  assert.equal(afterDefeat.prog.exp,11,'B defeats a level 5 enemy for 10 first; the seed fills the remaining point to level 7');
  assert.equal(afterDefeat.prog.level,7);

  const scholar=world({exp:0,includeB:true,queue:['A','B'],enemyHp:1,blessings:['scholar']});
  delete scholar.units.E.species;
  const scholarResult=play(scholar,useSeed('A'),{actor:'B',action:{type:'skill',skill:'tackle',target:'E'}});
  assert.equal(scholarResult.prog.exp,17,'the seed contributes exactly 5, then the ordinary 10-point defeat award becomes 12');
  assert.equal(scholarResult.prog.level,7);
});

test('B9 refuses a seed at level 100 without changing the item, round, or input world',()=>{
  const s=world({level:100,exp:PROG.thresholds[100]});
  const before=structuredClone(s);
  const r=applyCommand(s,round(useSeed()));
  assert.equal(r.ok,false);
  assert.match(r.error,/100级/);
  assert.deepEqual(r.state,before);
  assert.deepEqual(s,before);
});

test('B9 uses commission experience already credited before the seed; later commission rewards still accumulate normally',()=>{
  for(const scholar of [false,true])for(const collectorFirst of [false,true]){
    const s=world({queue:collectorFirst?['B','A']:['A','B'],blessings:scholar?['scholar']:[]});
    s.points=[{pos:{x:1,y:3},kind:'berry',used:false}];
    s.commissions=[{id:'collector',floor:1,acceptedRound:0,progress:0,progressTarget:1,speedLimit:null}];
    const r=play(s,useSeed('A'),{actor:'B',action:{type:'move',to:{x:1,y:3}}});
    assert.equal(r.commissions.length,0);assert.equal(r.prog.items.berry,1);assert.equal(r.prog.items.joySeed,0);
    assert.equal(r.prog.exp,collectorFirst?18:scholar?18:16);
    assert.ok(r.log.some(line=>line.includes('委托完成')));
  }
});

test('B9 rest, sleep, and drowsing block the action without consuming the seed',()=>{
  for(const [status,detail,reason] of [
    ['recharge',{left:1,fresh:true},'recharge'],
    ['slp',{left:2},'sleep'],
    ['nap',{left:2},'nap'],
  ]){
    const s=world({queue:['A','B']});
    s.units.B.status={[status]:{...detail}};
    const r=play(s,wait,{actor:'B',action:useSeed('B')});
    assert.equal(r.round,1,status+' consumes the blocked action opportunity');
    assert.equal(r.prog.exp,0,status+' does not grant experience');
    assert.equal(r.prog.items.joySeed,1,status+' keeps the item');
    assert.ok(r.events.some(e=>e.type==='fail'&&e.unit==='B'&&e.reason===reason),status+' is the reason the action is lost');
    assert.equal(r.events.some(e=>e.type==='itemUse'&&e.item==='joySeed'),false);
  }
});

function leaderFallsBeforeSeed(){
  const s=world({exp:3});
  const n1=friend('N1',2,2,50,{tackle:9});n1.status={confusion:{left:7}};
  const a=friend('A',3,2,1,{tackle:9});
  const e=foeOf('E','geodude',2,3,1,{tackle:9});e.waitOnly=true;
  s.units={N1:n1,A:a,E:e};s.queue=['N1','A'];s.enemies=['E'];s.leader='A';s.battleRng=7;
  return sureHit(s);
}

test('B9 follows #211: a legal seed action is lost if its user falls before acting; an illegal one is still rejected',()=>{
  const s=leaderFallsBeforeSeed();
  const cmd=round(useSeed('A'));
  const r=applyCommand(s,cmd);
  assert.equal(r.ok,true,r.error);
  assert.equal(r.state.units.A.hp,0);
  assert.equal(r.state.prog.exp,3);
  assert.equal(r.state.prog.items.joySeed,1);
  assert.equal(r.state.events.some(e=>e.type==='itemUse'&&e.item==='joySeed'),false);

  const invalid=leaderFallsBeforeSeed(),before=structuredClone(invalid);
  const rejected=applyCommand(invalid,round(useSeed('N1')));
  assert.equal(rejected.ok,false);
  assert.match(rejected.error,/目标必须是使用者自己/);
  assert.deepEqual(rejected.state,before);
  assert.deepEqual(invalid,before);
});

function growthBeforeTerminal(){
  const s=world({level:19,exp:PROG.thresholds[19]});
  const a=s.units.A;a.species='pikachu';a.level=19;a.hp=5;
  const known={quickattack:13,thundershock:17,thunderwave:16,helpinghand:16};
  a.learned=Object.keys(known);a.pp={...known};a.maxPp={...known};

  const b=friend('B',2,3,20,{hyperbeam:2});
  const down=friend('D',4,2,0,{quickattack:13});down.species='pikachu';down.level=19;
  const downMoves=[...down.learned];
  const boss=foeOf('Boss','arcanine',3,3,1,{tackle:1});boss.boss=true;boss.level=22;
  s.units={A:a,B:b,D:down,Boss:boss};s.queue=['B','A','D'];s.enemies=['Boss'];s.leader='A';
  s.scenario='expedition';s.dungeon={seed:123,width:7,height:7,floors:1,level:1,stored:{},boss:true,roguelike:true,tmPool:5};
  s.tms=[];s.pendingSettlement=undefined;
  return {state:sureHit(s),downMoves};
}

test('B9 reuses G6.4: learn first, evolve next, settle the boss terminal last; downed partners stay down and terminal clears recharge',()=>{
  const {state,downMoves}=growthBeforeTerminal();
  const first=play(state,useSeed('A'),{actor:'B',action:{type:'skill',skill:'hyperbeam',target:'Boss'}});
  assert.equal(first.units.Boss.hp,0,JSON.stringify(first.events));assert.equal(first.units.B.pp.hyperbeam,1);
  assert.equal(first.phase,'learning');
  assert.deepEqual(first.pendingLearnMoves?.map(p=>[p.actor,p.move]),[['A','spark']]);
  assert.equal(first.units.A.species,'pikachu','the level 20 move is resolved before evolution');
  assert.equal(first.units.A.hp,5,'leveling and evolution keep the current HP');
  assert.equal(first.units.D.hp,0);
  assert.equal(first.units.D.pos,null);
  assert.equal(first.units.D.species,'pikachu');
  assert.deepEqual(first.units.D.learned,downMoves);
  assert.equal(first.units.D.learned.includes('spark'),false);
  assert.ok(first.units.B.status?.recharge,'B acquired recharge by actually defeating the boss before the seed was used');

  let current=first,choices=0;
  while(current.phase==='learning'&&choices<8){
    const result=applyCommand(current,{type:'learnMove',replace:null});
    assert.equal(result.ok,true,result.error);
    current=result.state;choices++;
  }
  assert.ok(choices>0&&choices<8,'every learn choice completes through the existing choice command');
  assert.equal(current.phase,'invitation');assert.equal(current.units.A.species,'raichu');
  const rejected=applyCommand(current,{type:'invite',choice:'reject'});assert.equal(rejected.ok,true,rejected.error);current=rejected.state;
  assert.equal(current.phase,'ended');
  assert.equal(current.end?.outcome,'won');
  assert.equal(current.units.A.species,'raichu');
  assert.equal(current.units.A.hp,5);
  assert.equal(current.units.D.hp,0);
  assert.equal(current.units.D.pos,null);
  assert.equal(current.units.D.species,'pikachu');
  assert.deepEqual(current.units.D.learned,downMoves);
  assert.equal(current.units.D.learned.includes('spark'),false);
  assert.equal(current.units.B.status,undefined,'end-of-run cleanup clears the companion recharge');

  const learned=current.log.findIndex(line=>line.includes('放弃学习')&&line.includes('电光'));
  const evolved=current.log.findIndex(line=>line.includes('A进化为raichu'));
  const dropped=current.log.findIndex(line=>line.includes('掉落招式机'));
  const ended=current.log.findIndex(line=>line.includes('本局胜利'));
  assert.ok(learned>=0&&learned<evolved,'the level-up learn choice happens before the evolution');
  assert.ok(evolved<dropped,'the evolution completes before the boss item drop');
  assert.ok(dropped<ended,'the G6.4 terminal settlement finishes after growth choices and boss drop');
});
