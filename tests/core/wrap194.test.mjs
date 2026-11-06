import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createMain,enemy,friend,key} from '../../src/core/engine.ts';
import {enemyInfo,moveEffectLabel,moveSummary,teammateInfo} from '../../src/core/describe.ts';
import {inferEvents} from '../../src/render/animation.ts';
import {sureHit} from './sure-hit.mjs';

const rect=(x1,x2,y1,y2)=>Array.from({length:(x2-x1+1)*(y2-y1+1)},(_,i)=>({x:x1+i%(x2-x1+1),y:y1+Math.floor(i/(x2-x1+1))}));
function base(){
  const s=createMain('wrap-194',false),floor=rect(0,6,0,6);
  s.floor=floor;s.seen=floor.map(key);s.points=[];s.log=[];s.rooms=[{x:0,y:0,w:7,h:7}];s.leader='A';
  return s;
}
const withMoves=(unit,moves,pp=5)=>{unit.learned=[...moves];unit.pp=Object.fromEntries(moves.map(m=>[m,pp]));unit.maxPp=Object.fromEntries(moves.map(m=>[m,pp]));return unit;};
function findRound(build,pick,limit=800){
  for(let seed=1;seed<=limit;seed++){
    const before=build(seed),command=before.__command;delete before.__command;before.battleRng=seed;
    const result=applyCommand(before,command);if(!result.ok)continue;
    if(pick(result.state.log,result.state))return {before,after:result.state,command,log:result.state.log};
  }
  return null;
}

// ---- #204: fixed move texts follow the user's side ----
const SIDE_MOVES=['protect','pursuit','quickguard','reflect','lightscreen','snore','sleeptalk'];

test('#204 招式说明按使用者阵营：敌人的守住、反击、快速防守、屏障、打鼾、梦话写“我方”',()=>{
  const forbidden=/敌方|敌人/;
  for(const id of SIDE_MOVES){
    const mine=moveEffectLabel(id),theirs=moveEffectLabel(id,undefined,'enemy');
    assert.ok(!/我方/.test(mine),`${id} friend text keeps the player's view: ${mine}`);
    assert.ok(/我方/.test(theirs),`${id} enemy text names the player side: ${theirs}`);
    assert.ok(!forbidden.test(theirs),`${id} enemy text no longer says enemy: ${theirs}`);
  }
  assert.match(moveEffectLabel('reflect',undefined,'enemy'),/10个我方阶段/);
  assert.match(moveEffectLabel('protect',undefined,'enemy'),/受到我方攻击伤害为0（3个我方阶段）/);
  assert.match(moveEffectLabel('snore',undefined,'enemy'),/受到我方单位直接攻击/);
  assert.equal(moveSummary('protect'),moveSummary('protect',undefined,'friend'));
});

test('#204 敌人情报卡和队友卡的招式文字按各自阵营生成',()=>{
  const s=base();
  const e=withMoves(enemy('E',3,3,20,'melee',0),['reflect','protect','snore']);
  const a=withMoves(friend('A',1,1,20,{}),['reflect','protect','snore']);
  e.species='geodude';
  s.units={A:a,E:e};s.queue=['A'];s.enemies=['E'];
  const info=enemyInfo(s,'E');assert.ok(info);
  const reflect=info.moveRows.find(row=>row.id==='reflect').detail;
  assert.match(reflect,/10个我方阶段/);assert.doesNotMatch(reflect,/敌方/);
  assert.match(info.moveRows.find(row=>row.id==='protect').detail,/3个我方阶段/);
  assert.match(info.moveRows.find(row=>row.id==='snore').detail,/我方单位/);
  const mate=teammateInfo(s,'A');assert.ok(mate);
  assert.ok(mate.moves.some(t=>t.includes('10个敌方阶段')),'teammate keeps the player view: '+mate.moves.join(' | '));
});

test('#204 文字与引擎一致：敌人的守住和反射壁在我方行动阶段倒数',()=>{
  const s=base();
  const e=withMoves(enemy('E',5,5,20,'melee',0),['protect']);e.protect=3;e.reflect=10;e.waitOnly=true;
  s.units={A:withMoves(friend('A',1,1,20,{}),['tackle']),E:e};s.queue=['A'];s.enemies=['E'];
  const r=applyCommand(sureHit(s),{type:'round',action:{type:'wait'}});assert.equal(r.ok,true,r.ok?'':r.error);
  assert.equal(r.state.units.E.protect,2,'one friend phase passed');
  assert.equal(r.state.units.E.reflect,9);
});

// ---- N1: a born-asleep enemy put to sleep by a move and then woken by a hit still acts ----
test('N1 出生睡着的敌人被催眠再被打醒，本回合的行动仍算它自己',()=>{
  const sample=findRound(()=>{
    const s=base();
    const a=withMoves(friend('A',1,1,200,{}),['spore']);a.stages.acc=3;
    const b=friend('B',2,2,200,{tackle:5});b.stages.acc=3;
    const e=enemy('E',2,1,300,'melee',3);e.asleep=true;e.species='geodude';e.learned=[];e.pp={};e.maxPp={};
    s.units={A:a,B:b,E:e};s.queue=['A','B'];s.enemies=['E'];
    s.__command={type:'round',action:{type:'skill',skill:'spore',target:'A'},override:{actor:'B',action:{type:'basic',target:'E'}}};
    return sureHit(s);
  },(log)=>{const w=log.indexOf('E被攻击后醒来');return log.includes('E出生时的睡眠转为招式造成的睡眠状态')&&w>=0&&log.slice(w).some(l=>/^[AB]受到\d+伤害/.test(l));});
  assert.ok(sample,'a real round with birth sleep, spore, a waking hit and a later enemy strike was found');
  const hits=inferEvents(sample.before,sample.after,sample.command).filter(event=>event.k==='hit'&&['A','B'].includes(event.target));
  assert.ok(hits.length>=1);
  assert.equal(hits.at(-1).attacker,'E','the woken enemy is the one who struck');
});

// ---- N-b: snore ignores range, so its hit must be credited to the sleeper ----
test('N-b 打鼾打到射程外时伤害仍归睡眠者，不算给无关敌人',()=>{
  const sample=findRound(()=>{
    const s=base();
    const a=withMoves(friend('A',1,1,300,{}),['gunkshot']);a.stages.acc=3;
    const t=withMoves(enemy('T',5,1,500,'ranged',0),['snore']);delete t.waitOnly;t.status={slp:{left:6}};t.stages.acc=3;t.species='geodude';
    const u=enemy('U',1,2,500,'melee',0);u.waitOnly=true;u.species='geodude';
    s.units={A:a,T:t,U:u};s.queue=['A'];s.enemies=['T','U'];
    s.__command={type:'round',action:{type:'skill',skill:'gunkshot',target:'T'}};
    return sureHit(s);
  },(log)=>{const i=log.indexOf('T使用打鼾');return i>=0&&log.slice(i).some(l=>/^A受到\d+伤害/.test(l));});
  assert.ok(sample,'a real gunkshot answered by a snore from outside snore range was found');
  const back=inferEvents(sample.before,sample.after,sample.command).find(event=>event.k==='hit'&&event.target==='A');
  assert.ok(back);assert.equal(back.attacker,'T');assert.equal(back.effect?.move,'snore');
});

test('N-b 梦话发动的招式打到射程外也归睡眠者',()=>{
  const sample=findRound(()=>{
    const s=base();
    const a=withMoves(friend('A',1,1,300,{}),['gunkshot']);a.stages.acc=3;
    const t=withMoves(enemy('T',5,1,500,'ranged',0),['sleeptalk','tackle']);delete t.waitOnly;t.status={slp:{left:6}};t.stages.acc=3;t.species='geodude';
    const u=enemy('U',1,2,500,'melee',0);u.waitOnly=true;u.species='geodude';
    s.units={A:a,T:t,U:u};s.queue=['A'];s.enemies=['T','U'];
    s.__command={type:'round',action:{type:'skill',skill:'gunkshot',target:'T'}};
    return sureHit(s);
  },(log)=>{const i=log.findIndex(l=>l.startsWith('T在睡眠中使用梦话'));return i>=0&&log.slice(i).some(l=>/^A受到\d+伤害/.test(l));});
  assert.ok(sample,'a real gunkshot answered by a sleep-talk move from outside its reach was found');
  const back=inferEvents(sample.before,sample.after,sample.command).find(event=>event.k==='hit'&&event.target==='A');
  assert.ok(back);assert.equal(back.attacker,'T');
});

// ---- N-c: a confused fire move that thaws a frozen teammate keeps its source ----
test('N-c 混乱的 A 用火花打中冰冻队友 B：解冻行不丢来源',()=>{
  const sample=findRound(()=>{
    const s=base();
    const a=withMoves(friend('A',3,3,300,{}),['ember']);a.status={confusion:{left:3}};a.stages.acc=3;
    const b=friend('B',4,3,300,{});b.status={frz:{left:5}};
    const e=enemy('E',3,2,300,'melee',0);e.waitOnly=true;e.species='geodude';
    s.units={A:a,B:b,E:e};s.queue=['A','B'];s.enemies=['E'];
    s.__command={type:'round',action:{type:'skill',skill:'ember',target:'E'}};
    return sureHit(s);
  },(log)=>{const i=log.findIndex(l=>l==='B受到火系招式或热水攻击后解冻');return i>=0&&/^B受到\d+伤害/.test(log[i+1]??'');});
  assert.ok(sample,'a real confused ember that thaws B was found');
  const hit=inferEvents(sample.before,sample.after,sample.command).find(event=>event.k==='hit'&&event.target==='B');
  assert.ok(hit);assert.equal(hit.attacker,'A');assert.ok(hit.effect,'the effect survives');assert.equal(hit.effect.move,'ember');
});

// ---- reaction casts skip the range check only: the target must still be on the other side ----
test('N-b 梦话发动的范围招式不会把原施放的下一个目标算成打队友',()=>{
  const sample=findRound(()=>{
    const s=base();
    const a=withMoves(friend('A',1,1,300,{}),['blizzard']);a.stages.acc=3;
    const t=withMoves(enemy('T',2,1,500,'ranged',0),['sleeptalk','thunderbolt']);delete t.waitOnly;t.status={slp:{left:6}};t.stages.acc=3;t.species='geodude';
    const u=enemy('U',4,4,500,'melee',0);u.waitOnly=true;u.species='geodude';
    t.hp=t.maxHp=u.hp=u.maxHp=500;
    s.units={A:a,T:t,U:u};s.queue=['A'];s.enemies=['T','U'];
    s.__command={type:'round',action:{type:'skill',skill:'blizzard',target:'A'}};
    return sureHit(s);
  },log=>{const i=log.findIndex(l=>l.startsWith('T在睡眠中使用梦话'));return i>=0&&log.slice(i).some(l=>/^A受到\d+伤害/.test(l))&&log.slice(i).some(l=>/^U受到\d+伤害/.test(l));});
  assert.ok(sample,'a blizzard interrupted by a sleep-talked area move was found');
  const onU=inferEvents(sample.before,sample.after,sample.command).find(event=>event.k==='hit'&&event.target==='U');
  assert.ok(onU);assert.equal(onU.attacker,'A');assert.equal(onU.effect?.move,'blizzard');
});

test('N-b 打鼾目标看不见时，后面敌人打队友的普攻不算成打鼾',()=>{
  const s=base();
  const a=withMoves(friend('A',1,1,300,{}),['snore']);
  const b=friend('B',3,3,300,{});
  const e=enemy('E',0,1,500,'melee',0);e.species='geodude';
  const f=enemy('F',4,3,500,'melee',0);f.species='geodude';
  for(const u of [e,f]){delete u.waitOnly;u.learned=[];u.pp={};u.maxPp={};}
  s.units={A:a,B:b,E:e,F:f};s.queue=['A','B'];s.enemies=['E','F'];
  s.seen=s.seen.filter(cell=>cell!==key({x:0,y:1}));
  const after=structuredClone(s);after.round=s.round+1;
  after.log=[...s.log,'A受到3伤害，HP 297','A使用打鼾','E受到4伤害，HP 496','B受到3伤害，HP 297'];
  const onB=inferEvents(s,after,{type:'round',action:{type:'wait'}}).find(event=>event.k==='hit'&&event.target==='B');
  assert.ok(onB);assert.equal(onB.attacker,'F');assert.notEqual(onB.effect?.move,'snore');
});
