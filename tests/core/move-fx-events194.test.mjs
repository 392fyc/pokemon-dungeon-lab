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
 const hit=inferEvents(before,result.state,command).find(event=>event.k==='hit'&&!event.immune);   // the immune target has its own do-nothing hit; the claim test is about the next real hit
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

/** Searches seeds of the real engine until `pick` accepts the round; the log text is the ground truth the tests read. */
function findRound(build,pick,limit=600){
 for(let seed=1;seed<=limit;seed++){
  const before=build(seed),command=before.__command;delete before.__command;before.battleRng=seed;
  const result=applyCommand(before,command);if(!result.ok)continue;
  if(pick(result.state.log,result.state))return {before,after:result.state,command,log:result.state.log};
 }
 return null;
}
const basicRound=(extra={})=>({type:'round',action:{type:'basic',target:'H'},...extra});

test('友方：混乱或畏缩、麻痹的 A 用掉行动后，B 对 H 的命中不算在 A 头上',()=>{
 for(const [status,expectLine] of [['confusion',/^A因混乱朝.+出手$/],['flinch',/^A畏缩中，无法使用招式和普攻/],['par',/^A麻痹中，无法使用招式和普攻/]]){
  const sample=findRound(()=>{
   const before=world({moves:[],targets:[enemy('H',2,1,40,'ranged',0)]});before.units.H.hp=before.units.H.maxHp=300;
   before.units.A.status={[status]:{left:3}};before.units.A.stages.acc=3;
   before.units.B=friend('B',1,2,20,{});before.units.B.stages.acc=3;before.queue.push('B');
   before.__command={type:'round',action:{type:'basic',target:'H'},override:{actor:'B',action:{type:'basic',target:'H'}}};
   return before;
  },log=>{
   const i=log.findIndex(line=>expectLine.test(line));
   // Nothing is damaged by A's own action: the line after it is not damage, and B's later hit on H exists.
   return i>=0&&(status!=='confusion'||!/受到\d+伤害/.test(log[i+1]??''))&&log.slice(i).some(line=>/^H受到\d+伤害/.test(line));
  });
  assert.ok(sample,status+': a real round is found');
  const hits=inferEvents(sample.before,sample.after,sample.command).filter(event=>event.k==='hit'&&event.target==='H');
  assert.equal(hits.length,1,status);assert.equal(hits[0].attacker,'B',status+' is not credited to the spent unit');
 }
});

test('友方混乱普攻真的打中 H 时算 A，随后 B 的普攻算 B',()=>{
 const sample=findRound(()=>{
  const before=world({moves:[],targets:[enemy('H',2,1,40,'ranged',0)]});before.units.H.hp=before.units.H.maxHp=300;
  before.units.A.status={confusion:{left:3}};before.units.A.stages.acc=3;
  before.units.B=friend('B',1,2,20,{});before.units.B.stages.acc=3;before.queue.push('B');
  before.__command={type:'round',action:{type:'basic',target:'H'},override:{actor:'B',action:{type:'basic',target:'H'}}};
  return before;
 },log=>{const i=log.findIndex(line=>/^A因混乱朝.+出手$/.test(line));return i>=0&&/^H受到\d+伤害/.test(log[i+1]??'')&&log.slice(i+2).some(line=>/^H受到\d+伤害/.test(line));});
 assert.ok(sample);
 const hits=inferEvents(sample.before,sample.after,sample.command).filter(event=>event.k==='hit'&&event.target==='H');
 assert.deepEqual(hits.map(event=>event.attacker),['A','B']);
});

test('敌方：混乱或畏缩、麻痹的 E1 用掉行动后，E2 对 A 的命中不算在 E1 头上',()=>{
 for(const [status,expectLine] of [['confusion',/^E1因混乱朝.+出手$/],['flinch',/^E1畏缩中，无法使用招式和普攻/],['par',/^E1麻痹中，无法使用招式和普攻/]]){
  const sample=findRound(()=>{
   const before=world({moves:[],targets:[enemy('E1',2,1,40,'melee',0),enemy('E2',1,2,40,'melee',0)]});
   for(const id of ['E1','E2']){const e=before.units[id];e.waitOnly=false;e.learned=[];e.pp={};e.maxPp={};e.stages.acc=3;}
   before.units.E1.status={[status]:{left:3}};before.units.A.hp=before.units.A.maxHp=300;
   before.__command={type:'round',action:{type:'wait'}};
   return before;
  },log=>{
   const i=log.findIndex(line=>expectLine.test(line));
   return i>=0&&(status!=='confusion'||!/受到\d+伤害/.test(log[i+1]??''))&&log.slice(i).some(line=>/^A受到\d+伤害/.test(line));
  });
  assert.ok(sample,status+': a real round is found');
  const hits=inferEvents(sample.before,sample.after,sample.command).filter(event=>event.k==='hit'&&event.target==='A');
  assert.equal(hits.length,1,status);assert.equal(hits[0].attacker,'E2',status+' is not credited to the spent enemy');
 }
});

test('其余“行动已结束”的日志（动作失效、无路可走、普通攻击未命中任何目标）都标记该单位已行动',()=>{
 // The three lines come from engine.ts; each must be recognised as the speaker's spent action.
 const before=world({moves:[],targets:[enemy('H',2,1,40,'ranged',0)]});before.units.H.hp=before.units.H.maxHp=300;
 before.units.B=friend('B',1,2,20,{});before.units.B.stages.acc=3;before.queue.push('B');
 const after=structuredClone(before);after.round=before.round+1;after.units.H.hp-=5;
 // The animation reads the round's structured events, not the log text: each of the five endings is the event the engine writes for that line.
 for(const [line,reason] of [['A动作失效，等待，未扣PP','invalid'],['A的普通攻击未命中任何目标','basicNoTarget'],['A无路可走，等待','noPath'],['A等待','wait'],['A因混乱朝右乱走，被挡住，原地不动','confusedWander']]){
  after.log=[...before.log,line,'H受到5伤害，HP '+after.units.H.hp];
  after.events=[{type:'fail',unit:'A',reason},{type:'hpLoss',unit:'H',amount:5,hp:after.units.H.hp}];
  const hit=inferEvents(before,after,{type:'round',action:{type:'basic',target:'H'},override:{actor:'B',action:{type:'basic',target:'H'}}}).find(event=>event.k==='hit'&&event.target==='H');
  assert.equal(hit?.attacker,'B',line);
 }
});

test('混乱的非伤害招式撞上守住目标时不写日志，下一行别人的伤害仍归别人',()=>{
 const sample=findRound(()=>{
  const before=world({moves:['tailwhip'],targets:[enemy('H',2,1,40,'ranged',0),enemy('H2',5,5,40,'ranged',0)]});
  before.units.H.protect=5;before.units.H2.hp=before.units.H2.maxHp=300;before.units.A.status={confusion:{left:3}};
  before.units.B=friend('B',4,4,20,{});before.units.B.stages.acc=3;before.queue.push('B');
  before.__command={type:'round',action:{type:'skill',skill:'tailwhip',target:'H'},override:{actor:'B',action:{type:'basic',target:'H2'}}};
  return before;
 },log=>{const i=log.findIndex(line=>/^A因混乱朝.+出手$/.test(line));return i>=0&&/^H2受到\d+伤害/.test(log[i+1]??'');});
 assert.ok(sample,'a confused tail whip that lands on a protected target, followed by B hitting H2, is found');
 const hit=inferEvents(sample.before,sample.after,sample.command).find(event=>event.k==='hit'&&event.target==='H2');
 assert.ok(hit);assert.equal(hit.attacker,'B');assert.equal(hit.by,'B');
});

for(const flag of ['asleep','wakeSkip'])test(`本回合不行动的敌人（${flag}）不会被当成普攻的攻击者`,()=>{
 const sample=findRound(()=>{
  const before=world({moves:[],targets:[enemy('E1',2,1,40,'melee',0),enemy('E2',1,2,40,'melee',0)]});
  for(const id of ['E1','E2']){const e=before.units[id];e.waitOnly=false;e.learned=[];e.pp={};e.maxPp={};}
  before.units.E1[flag]=true;before.units.E2.stages.acc=3;before.units.A.hp=before.units.A.maxHp=200;
  before.__command={type:'round',action:{type:'wait'}};
  return before;
 },log=>log.some(line=>line.startsWith('A受到')));
 assert.ok(sample,'E2 hits A while E1 stays idle');
 const hit=inferEvents(sample.before,sample.after,sample.command).find(event=>event.k==='hit'&&event.target==='A');
 assert.ok(hit);assert.equal(hit.attacker,'E2');
});

test('混乱招式打中队友后施放即结束，下一行的别人普攻不算这次招式',()=>{
 const sample=findRound(()=>{
  const before=world({moves:['pound'],targets:[enemy('H',2,1,40,'ranged',0)]});before.units.H.hp=before.units.H.maxHp=300;
  before.units.A.status={confusion:{left:3}};
  before.units.B=friend('B',1,2,200,{});before.units.B.maxHp=200;before.units.C=friend('C',2,2,20,{});before.units.C.stages.acc=3;before.queue.push('B','C');
  before.units.B.tactic='wait';
  before.__command={type:'round',action:{type:'skill',skill:'pound',target:'H'},override:{actor:'C',action:{type:'basic',target:'H'}}};
  return before;
 },log=>{const i=log.findIndex(line=>/^A因混乱朝.+出手$/.test(line));return i>=0&&/^B受到\d+伤害/.test(log[i+1]??'')&&log.slice(i+2).some(line=>/^H受到\d+伤害/.test(line));});
 assert.ok(sample,'a confused pound that hits B and then C hits H is found');
 const events=inferEvents(sample.before,sample.after,sample.command).filter(event=>event.k==='hit');
 const onB=events.find(event=>event.target==='B'),onH=events.filter(event=>event.target==='H');
 assert.equal(onB?.attacker,'A');assert.equal(onB?.effect?.move,'pound');
 assert.ok(onH.length>=1&&onH.every(event=>event.attacker!=='A'&&event.effect?.move!=='pound'),'no later hit on H is credited to the finished pound: '+JSON.stringify(onH.map(event=>[event.attacker,event.effect?.move])));
 assert.equal(onH.at(-1).attacker,'C');
});

test('房间招式中受击者的打鼾反应结束后，后面的目标仍属于原施放',()=>{
 const sample=findRound(()=>{
  const before=world({moves:['blizzard'],targets:[enemy('T1',2,1,40,'ranged',0),enemy('T2',3,1,40,'ranged',0)]});
  for(const id of ['T1','T2']){const t=before.units[id];t.hp=t.maxHp=400;}
  const t1=before.units.T1;t1.waitOnly=undefined;delete t1.waitOnly;t1.learned=['snore'];t1.pp={snore:5};t1.maxPp={snore:5};t1.status={slp:{left:6}};t1.stages.acc=3;
  before.units.A.hp=before.units.A.maxHp=200;
  before.__command={type:'round',action:{type:'skill',skill:'blizzard',target:'A'}};
  return before;
 },log=>{const i=log.findIndex(line=>line==='T1使用打鼾');return i>=0&&log.slice(i).some(line=>/^T2受到\d+伤害/.test(line))&&log.slice(0,i).some(line=>/^T1受到\d+伤害/.test(line));});
 assert.ok(sample,'a real blizzard answered by a snore is found');
 const events=inferEvents(sample.before,sample.after,sample.command).filter(event=>event.k==='hit');
 const t2=events.find(event=>event.target==='T2'),back=events.find(event=>event.target==='A');
 assert.equal(t2?.attacker,'A');assert.equal(t2?.effect?.move,'blizzard');
 assert.equal(back?.attacker,'T1');assert.equal(back?.effect?.move,'snore');
});

/* Immunity and a miss are different things: an immune target is hit by the move and takes nothing (a round event and a do-nothing hit on the board); a miss has neither. */
const withSpecies=(unit,species)=>{unit.species=species;unit.entrySpecies=species;unit.hp=unit.maxHp=100;return unit;};
test('an Electric move on a Ground target: an immune event and a do-nothing hit, no damage, no miss, PP spent',()=>{
 const before=world({moves:['thunderbolt'],targets:[withSpecies(enemy('H',2,1,100,'melee',0),'geodude')]});
 const {after,command}=play(before,'thunderbolt','H');
 assert.deepEqual(after.events.filter(e=>e.type==='immune'),[{type:'immune',actor:'A',target:'H',skill:'thunderbolt'}]);
 assert.equal(after.events.filter(e=>e.type==='miss').length,0,'immune is not a miss');
 assert.equal(after.units.H.hp,100);assert.equal(after.units.A.pp.thunderbolt,1,'the PP is spent');
 const hits=inferEvents(before,after,command).filter(e=>e.k==='hit');
 assert.equal(hits.length,1);assert.equal(hits[0].target,'H');assert.equal(hits[0].attacker,'A');
 assert.equal(hits[0].immune,true);assert.equal(hits[0].amount,0);assert.equal(hits[0].dead,false);assert.ok(hits[0].effect,'the move effect still travels to the target');
});
test('an around move with one immune and one ordinary target: both are shown, only the ordinary one takes damage',()=>{
 const before=world({moves:['thunderbolt'],targets:[withSpecies(enemy('H',2,1,100,'melee',0),'geodude'),withSpecies(enemy('P',1,2,100,'melee',0),'pidgey')]});
 const {after,command}=play(before,'thunderbolt','H');
 assert.equal(after.units.H.hp,100);assert.ok(after.units.P.hp<100,'the ordinary target is hurt');
 const hits=inferEvents(before,after,command).filter(e=>e.k==='hit');
 assert.deepEqual(hits.map(h=>[h.target,!!h.immune,h.amount>0]).sort(),[['H',true,false],['P',false,true]]);
});
test('a missed move is not shown as immune; a plain attack is never immune', ()=>{
 let sample;
 for(let seed=1;seed<=200&&!sample;seed++){
  const before=world({moves:['thunderbolt'],targets:[withSpecies(enemy('P',2,1,100,'melee',0),'pidgey')]});before.battleRng=seed;before.units.A.stages.acc=-3;
  const {after,command}=play(before,'thunderbolt','P');if(after.events.some(e=>e.type==='miss'))sample={before,after,command};
 }
 assert.ok(sample,'a real deterministic miss is found');
 assert.equal(sample.after.events.filter(e=>e.type==='immune').length,0);
 assert.equal(inferEvents(sample.before,sample.after,sample.command).filter(e=>e.k==='hit'&&e.immune).length,0);
 // a plain attack has no type, so even a Ghost takes it
 const ghost=world({moves:[],targets:[withSpecies(enemy('G',2,1,100,'melee',0),'gastly')]});
 const basic=applyCommand(ghost,{type:'round',action:{type:'basic',target:'G'}});assert.equal(basic.ok,true,basic.error);const after=basic.state;
 assert.equal((after.events??[]).filter(e=>e.type==='immune').length,0);
});
