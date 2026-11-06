import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createMain,enemy,friend,key} from '../../src/core/engine.ts';
import {effectForMove} from '../../src/render/effect-spec.ts';
import {animationBatches,animationDuration,inferEvents,plan} from '../../src/render/animation.ts';
import {sureHit} from './sure-hit.mjs';

const templates=[
  ['pound','melee','Normal'],['ember','special','Fire'],['gunkshot','shot','Poison'],['aurorabeam','beam','Ice'],
  ['thunderbolt','around','Electric'],['blizzard','room','Ice'],['swordsdance','up','Normal'],['growl','down','Normal'],
  ['toxic','status','Poison'],['synthesis','heal','Grass'],['protect','guard','Normal'],['whirlwind','blow','Normal'],
];
const rect=(x1,x2,y1,y2)=>Array.from({length:(x2-x1+1)*(y2-y1+1)},(_,i)=>({x:x1+i%(x2-x1+1),y:y1+Math.floor(i/(x2-x1+1))}));
function world({moves,targets=[],hp=20,rooms=[{x:0,y:0,w:6,h:6}]}={}){
  const s=createMain('fx-events-194',false),floor=rect(0,5,0,5);
  s.floor=floor;s.seen=floor.map(key);s.queue=['A'];s.enemies=targets.map(target=>target.id);s.leader='A';s.points=[];s.log=[];s.rooms=rooms;
  const actor=friend('A',1,1,hp,Object.fromEntries(moves.map(move=>[move,2])));actor.species='treecko';actor.stages.acc=3;
  for(const target of targets)target.waitOnly=true;
  s.units=Object.fromEntries([actor,...targets].map(unit=>[unit.id,unit]));
  return sureHit(s);
}
function play(before,skill,target){
  const command={type:'round',action:{type:'skill',skill,target}},result=applyCommand(before,command);
  assert.equal(result.ok,true,result.ok?'':result.error);
  return {after:result.state,command};
}

test('十二种界面示例从现有招式数据映射出模板与真实属性',()=>{
  for(const [move,template,type] of templates)assert.deepEqual(effectForMove(move),{move,template,type});
  assert.deepEqual(effectForMove(null),{move:null,template:'melee',type:'Normal'});
});

test('真实引擎命中使用实际伤害数值、招式ID、属性与已有相性结果',()=>{
  const before=world({moves:['watergun'],targets:[enemy('H',2,1,40,'melee',0)]}),{after,command}=play(before,'watergun','H');
  const hit=inferEvents(before,after,command).find(event=>event.k==='hit'&&event.target==='H');
  assert.ok(hit);assert.equal(hit.amount,before.units.H.hp-after.units.H.hp);
  assert.deepEqual(hit.effect,{move:'watergun',template:'special',type:'Water',superEffective:true});
});

test('实际状态变化发出状态和升阶特效，守住或畏缩未施放时不造事件',()=>{
  const self=world({moves:['swordsdance']});
  let result=play(self,'swordsdance','A');
  const up=inferEvents(self,result.after,result.command).find(event=>event.k==='effect');
  assert.equal(up?.effect.template,'up');assert.equal(up?.target,'A');

  const blocked=world({moves:['toxic'],targets:[enemy('H',2,1,40,'ranged',0)]});blocked.units.H.protect=2;
  result=play(blocked,'toxic','H');
  assert.equal(blocked.units.A.pp.toxic-result.after.units.A.pp.toxic,1,'the engine spent PP on the attempted cast');
  assert.equal(inferEvents(blocked,result.after,result.command).some(event=>event.k==='effect'),false,'protection prevented a status change');

  const stopped=world({moves:['toxic'],targets:[enemy('H',2,1,40,'ranged',0)]});stopped.units.A.status={flinch:{left:1}};
  result=play(stopped,'toxic','H');
  assert.equal(stopped.units.A.pp.toxic,result.after.units.A.pp.toxic,'flinch prevented the move from running');
  assert.equal(inferEvents(stopped,result.after,result.command).some(event=>event.k==='effect'),false);
});

test('房间招式对多个实际变化目标生成一次施放批次',()=>{
  const before=world({moves:['growl'],targets:[enemy('H1',2,1,40,'melee',0),enemy('H2',3,1,40,'ranged',0)]});
  const {after,command}=play(before,'growl','A'),events=inferEvents(before,after,command).filter(event=>event.k==='effect');
  assert.deepEqual(events.map(event=>event.target),['H1','H2']);
  assert.ok(events.every(event=>event.effect.move==='growl'&&event.effect.template==='down'));
  assert.equal(animationBatches(events).length,1);
});


test('回复量取实际回复记录，随后受击仍保留回复量与行动顺序',()=>{
 const before=world({moves:['synthesis'],hp:5,targets:[enemy('H',2,1,40,'ranged',0)]});
 before.units.H.waitOnly=false;before.units.H.learned=[];before.units.H.pp={};before.units.H.maxPp={};
 const {after,command}=play(before,'synthesis','A'),events=inferEvents(before,after,command);
 const heal=events.find(event=>event.k==='effect'&&event.effect.template==='heal');
 assert.equal(heal?.amount,10);
 assert.ok(after.units.A.hp-before.units.A.hp<heal.amount,'the later enemy strike really changes net HP');
 assert.ok(events.indexOf(heal)<events.findIndex(event=>event.k==='hit'&&event.target==='A'));
});

test('同轮两名成员强化或回复时，各自的目标与数字只属于实际施放者',()=>{
 for(const move of ['swordsdance','synthesis']){
  const before=world({moves:[move],hp:5});
  before.units.B=friend('B',2,1,5,{[move]:2});before.queue.push('B');
  const command={type:'round',action:{type:'skill',skill:move,target:'A'},override:{actor:'B',action:{type:'skill',skill:move,target:'B'}}};
  const result=applyCommand(before,command);assert.equal(result.ok,true,result.error);
  const effects=inferEvents(before,result.state,command).filter(event=>event.k==='effect');
  assert.deepEqual(effects.map(event=>[event.by,event.target]),[['A','A'],['B','B']]);
  if(move==='synthesis')assert.deepEqual(effects.map(event=>event.amount),[10,10]);
 }
});

test('未命中的异常招式不借用随后另一名成员施加的同种异常',()=>{
 let sample;
 for(let seed=1;seed<=128&&!sample;seed++){
  const before=world({moves:['toxic'],targets:[enemy('H',2,1,40,'ranged',0)]});
  before.units.A.stages.acc=-3;before.battleRng=seed;
  before.units.B=friend('B',2,2,20,{toxic:2});before.units.B.stages.acc=3;before.queue.push('B');
  const command={type:'round',action:{type:'skill',skill:'toxic',target:'H'},override:{actor:'B',action:{type:'skill',skill:'toxic',target:'H'}}};
  const result=applyCommand(before,command);assert.equal(result.ok,true,result.error);
  if(result.state.events.some(event=>event.type==='miss'&&event.actor==='A')&&result.state.units.H.status?.tox)sample={before,after:result.state,command};
 }
 assert.ok(sample,'the deterministic seed search finds a real miss followed by a real status application');
 const effects=inferEvents(sample.before,sample.after,sample.command).filter(event=>event.k==='effect');
 assert.deepEqual(effects.map(event=>[event.by,event.target]),[['B','H']]);
});

test('吹飞碰撞保留实际扣血，同行正常移动不会变成吹飞',()=>{
 const before=world({moves:['whirlwind'],targets:[enemy('H',2,1,40,'ranged',0)]});
 before.units.B=friend('B',1,3,20,{});before.queue.push('B');
 const command={type:'round',action:{type:'skill',skill:'whirlwind',target:'H'},override:{actor:'B',action:{type:'move',to:{x:2,y:3}}}};
 const result=applyCommand(before,command);assert.equal(result.ok,true,result.error);
 const events=inferEvents(before,result.state,command);
 assert.deepEqual(events.filter(event=>event.k==='blowaway').map(event=>event.target),['H']);
 const collision=events.find(event=>event.k==='hit'&&event.target==='H');
 assert.equal(collision?.amount,5);assert.equal(collision?.attacker,null);assert.equal(collision?.fx,null);
 assert.ok(events.some(event=>event.k==='move'&&event.id==='B'));
});


test('伤害并吹飞与墙碰撞属于同一次施放，整次演出预算不超过500ms',()=>{
 for(const move of ['whirlwind','circlethrow','dragontail']){
  const before=world({moves:[move],targets:[enemy('H',2,1,40,'ranged',0)]});
  before.units.H.hp=before.units.H.maxHp=200;
  const {after,command}=play(before,move,'H'),events=inferEvents(before,after,command);
  assert.ok(events.some(event=>event.k==='blowaway'));
  assert.ok(events.some(event=>event.k==='hit'&&event.collision));
  assert.equal(animationBatches(events).length,1,move+' keeps every effect and collision in one cast');
  assert.ok(plan(events).total<=500,move+' stays in the single-cast budget');
 }
});


test('单体招式后的另一名同行普通攻击不借用上一招式或属性',()=>{
 const before=world({moves:['ember'],targets:[enemy('H1',2,1,40,'ranged',0),enemy('H2',1,2,40,'ranged',0)]});
 before.units.B=friend('B',2,2,20,{});before.queue.push('B');
 const command={type:'round',action:{type:'skill',skill:'ember',target:'H1'},override:{actor:'B',action:{type:'basic',target:'H2'}}};
 const result=applyCommand(before,command);assert.equal(result.ok,true,result.error);
 const events=inferEvents(before,result.state,command),first=events.find(event=>event.k==='hit'&&event.target==='H1'),second=events.find(event=>event.k==='hit'&&event.target==='H2');
 assert.equal(first?.attacker,'A');assert.equal(first?.effect.move,'ember');
 assert.equal(second?.attacker,'B');assert.deepEqual(second?.effect,{move:null,template:'melee',type:'Normal'});
});

test('状态招式及零伤害保护命中不显示伤害属性克制',()=>{
 const status=world({moves:['toxic'],targets:[enemy('H',2,1,40,'ranged',0)]});status.units.H.species='chikorita';
 let result=play(status,'toxic','H'),event=inferEvents(status,result.after,result.command).find(event=>event.k==='effect');
 assert.equal(event?.effect.type,'Poison');assert.equal(event?.effect.superEffective,undefined);
 const blocked=world({moves:['watergun'],targets:[enemy('H',2,1,40,'melee',0)]});blocked.units.H.protect=2;
 result=play(blocked,'watergun','H');event=inferEvents(blocked,result.after,result.command).find(event=>event.k==='hit');
 assert.equal(event?.amount,0);assert.equal(event?.effect.superEffective,undefined);
});

test('房间状态效果使用施放时目标位置，并排在其随后移动之前',()=>{
 const before=world({moves:['growl'],targets:[enemy('H',4,4,40,'ranged',0)]});
 before.units.H.waitOnly=false;before.units.H.learned=[];before.units.H.pp={};before.units.H.maxPp={};
 const {after,command}=play(before,'growl','A');assert.notDeepEqual(after.units.H.pos,before.units.H.pos,'the real target actually moved afterward');
 const events=inferEvents(before,after,command),effect=events.find(event=>event.k==='effect'&&event.target==='H'),movement=events.find(event=>event.k==='move'&&event.id==='H');
 assert.ok(effect&&movement);assert.deepEqual(effect.at,before.units.H.pos);
 assert.ok(events.indexOf(effect)<events.indexOf(movement));
});


test('吸取或反作用后受到致命攻击时，伤害数字使用该时刻实际剩余HP',()=>{
 for(const move of ['absorb','doubleedge']){
  const before=world({moves:[move],hp:move==='absorb'?5:20,targets:[enemy('H',2,1,40,'ranged',0)]});
  const foe=before.units.H;foe.species='machamp';foe.hp=foe.maxHp=200;foe.waitOnly=false;foe.learned=['gunkshot'];foe.pp={gunkshot:2};foe.maxPp={gunkshot:2};
  const {after,command}=play(before,move,'H');assert.equal(after.units.A.hp,0,'the real later enemy move is lethal');
  const line=after.log.find(line=>move==='absorb'?line.startsWith('A吸取生命，HP '):line.startsWith('A因反作用损失'));
  assert.ok(line,move+' actually changes actor HP before the enemy strike');
  const expected=Number(line.match(move==='absorb'?/→(\d+)$/:/，HP (\d+)$/)[1]);
  assert.notEqual(expected,before.units.A.hp,'the pre-strike HP differs from round-start HP');
  const hit=inferEvents(before,after,command).find(event=>event.k==='hit'&&event.target==='A');
  assert.equal(hit?.amount,expected,move+' keeps the actual remaining HP at the time of the lethal strike');
 }
});


test('落空的单体或群体招式不会认领后续同行的普通攻击',()=>{
 for(const move of ['ember','thunderbolt']){
  let sample;
  for(let seed=1;seed<=128&&!sample;seed++){
   const before=world({moves:[move],targets:[enemy('H',2,1,40,'ranged',0)]});before.units.H.hp=before.units.H.maxHp=100;
   before.battleRng=seed;before.units.A.stages.acc=-3;
   before.units.B=friend('B',2,2,20,{});before.units.B.stages.acc=3;before.queue.push('B');
   const command={type:'round',action:{type:'skill',skill:move,target:'H'},override:{actor:'B',action:{type:'basic',target:'H'}}};
   const result=applyCommand(before,command);assert.equal(result.ok,true,result.error);
   if(result.state.events.some(event=>event.type==='miss'&&event.actor==='A'))sample={before,after:result.state,command};
  }
  assert.ok(sample,'a real deterministic miss is found for '+move);
  const hits=inferEvents(sample.before,sample.after,sample.command).filter(event=>event.k==='hit');
  assert.equal(hits.length,1);assert.equal(hits[0].attacker,'B');assert.deepEqual(hits[0].effect,{move:null,template:'melee',type:'Normal'});
 }
});

test('属性免疫的群体施放不会认领后续普通攻击',()=>{
 const before=world({moves:['thunderbolt'],targets:[enemy('H',2,1,40,'melee',0)]});before.units.H.hp=before.units.H.maxHp=100;
 before.units.B=friend('B',2,2,20,{});before.units.B.stages.acc=3;before.queue.push('B');
 const command={type:'round',action:{type:'skill',skill:'thunderbolt',target:'H'},override:{actor:'B',action:{type:'basic',target:'H'}}};
 const result=applyCommand(before,command);assert.equal(result.ok,true,result.error);
 assert.ok(result.state.log.some(line=>line.includes('没有效果')),'the real Electric move is immune on the Ground target');
 const hit=inferEvents(before,result.state,command).find(event=>event.k==='hit');
 assert.equal(hit?.attacker,'B');assert.deepEqual(hit?.effect,{move:null,template:'melee',type:'Normal'});
});

test('友方普攻未命中后，下一名友方的普攻命中算在命中者头上',()=>{
 let sample;
 for(let seed=1;seed<=128&&!sample;seed++){
  const before=world({moves:[],targets:[enemy('H',2,1,40,'ranged',0)]});before.units.H.hp=before.units.H.maxHp=100;
  before.battleRng=seed;before.units.A.stages.acc=-3;
  before.units.B=friend('B',1,2,20,{});before.units.B.stages.acc=3;before.queue.push('B');
  const command={type:'round',action:{type:'basic',target:'H'},override:{actor:'B',action:{type:'basic',target:'H'}}};
  const result=applyCommand(before,command);assert.equal(result.ok,true,result.error);
  if(result.state.events.some(event=>event.type==='miss'&&event.actor==='A')&&result.state.log.some(line=>line.startsWith('H受到')))sample={before,after:result.state,command};
 }
 assert.ok(sample,'a real deterministic basic-attack miss followed by a real hit is found');
 const hits=inferEvents(sample.before,sample.after,sample.command).filter(event=>event.k==='hit'&&event.target==='H');
 assert.equal(hits.length,1);assert.equal(hits[0].attacker,'B');
});

test('敌方普攻未命中后，下一名敌方的普攻命中算在命中者头上',()=>{
 let sample;
 for(let seed=1;seed<=256&&!sample;seed++){
  const before=world({moves:[],targets:[enemy('E1',2,1,40,'melee',0),enemy('E2',1,2,40,'melee',0)]});
  for(const id of ['E1','E2']){const e=before.units[id];e.waitOnly=false;e.learned=[];e.pp={};e.maxPp={};}
  before.units.E1.stages.acc=-3;before.units.E2.stages.acc=3;before.battleRng=seed;
  before.units.A.hp=before.units.A.maxHp=200;
  const command={type:'round',action:{type:'wait'}};
  const result=applyCommand(before,command);if(!result.ok)continue;
  const missed=(result.state.events??[]).some(event=>event.type==='miss'&&event.actor==='E1'&&event.skill===null);
  if(missed&&result.state.log.some(line=>line.startsWith('A受到')))sample={before,after:result.state,command};
 }
 assert.ok(sample,'a real deterministic enemy basic-attack miss followed by a real hit is found');
 const hits=inferEvents(sample.before,sample.after,sample.command).filter(event=>event.k==='hit'&&event.target==='A');
 assert.equal(hits.length,1);assert.equal(hits[0].attacker,'E2');
});

test('混乱使招式未命中任何目标后，别人对邻近敌人的普攻不会被认成这次招式',()=>{
 let sample;
 for(let seed=1;seed<=512&&!sample;seed++){
  const before=world({moves:['pound'],targets:[enemy('H2',2,1,40,'ranged',0)]});before.units.H2.hp=before.units.H2.maxHp=200;
  before.units.A.status={confusion:{left:3}};before.battleRng=seed;
  before.units.B=friend('B',2,2,20,{});before.units.B.stages.acc=3;before.queue.push('B');
  const command={type:'round',action:{type:'skill',skill:'pound',target:'H2'},override:{actor:'B',action:{type:'basic',target:'H2'}}};
  const result=applyCommand(before,command);if(!result.ok)continue;
  const log=result.state.log;
  if(log.includes('A的招式未命中任何目标')&&log.some(line=>line.startsWith('H2受到')))sample={before,after:result.state,command};
 }
 assert.ok(sample,'a real confused miss followed by another member hitting the neighbouring enemy is found');
 const hit=inferEvents(sample.before,sample.after,sample.command).find(event=>event.k==='hit'&&event.target==='H2');
 assert.ok(hit);assert.equal(hit.attacker,'B');assert.notEqual(hit.effect?.move,'pound','the hit is not attributed to the finished pound cast');
});

test('声明时长与实际一致，多事件回合总长不超过1500ms，过长回合不播放',()=>{
 const hit=(by,extra={})=>({k:'hit',by,attacker:by,target:'H',from:{x:0,y:0},at:{x:1,y:0},fx:'strong',amount:3,dead:false,...extra});
 assert.equal(animationDuration(hit('A')),320,'a plain hit keeps its legacy 320ms');
 assert.equal(animationDuration(hit('A',{dead:true})),360,'a plain fatal hit: fade ends at 220+140ms');
 assert.equal(animationDuration(hit('A',{effect:{move:'pound',template:'melee',type:'Normal'}})),500);
 assert.equal(animationDuration(hit('A',{effect:{move:'pound',template:'melee',type:'Normal'},dead:true})),500);
 const effectHit=index=>hit('U'+index,{effect:{move:'pound',template:'melee',type:'Normal'}});
 const eight=Array.from({length:8},(_,i)=>effectHit(i)),p=plan(eight);
 assert.equal(animationBatches(eight).length,8);
 assert.ok(p&&p.scale<1&&p.total<=1500+1e-6,'eight 500ms effects are squeezed into the 1500ms round cap: '+JSON.stringify(p));
 assert.ok(Math.abs(p.total-1500)<1e-6);
 const mixed=[...Array.from({length:5},(_,i)=>effectHit(i)),...Array.from({length:3},(_,i)=>hit('P'+i,{dead:true}))],q=plan(mixed);
 assert.ok(q&&q.total<=1500+1e-6&&Math.abs(q.total-1500)<1e-6);
 assert.equal(plan(Array.from({length:11},(_,i)=>effectHit(i))),null,'a round that would play below 30% speed is not animated');
});
