import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenario} from '../../src/core/scenarios.ts';
import {actionText,enemyInfo,localizeLog,orderLine,unitLabel,unitName,playerText} from '../../src/core/describe.ts';
import {speciesZh} from '../../src/core/names.ts';
import {applyCommand,createMain,friend,key} from '../../src/core/engine.ts';
import {foeOf} from './foe-fixture.mjs';
import {sureHit} from './sure-hit.mjs';


test('visible unit labels and logs use species names or readable fallbacks without world ids',()=>{
 const s=createScenario('K1','describe-no-visible-ids'),friendId=s.queue[0],enemyId=s.enemies[0];
 const friend=s.units[friendId],enemy=s.units[enemyId];
 assert.equal(unitLabel(friend,friendId),friend.species?speciesZh(friend.species):'队员');
 assert.equal(unitLabel(enemy,enemyId),enemy.species?speciesZh(enemy.species):'敌人');
 const order=orderLine(s,[{id:friendId},{id:enemyId}]);
 assert.equal(order,unitName(friend)+' → '+unitName(enemy)+' → 敌方');
 assert.ok(!order.includes(friendId));
 assert.ok(!order.includes(enemyId));
 assert.equal(actionText(s,friendId,{type:'basicForward'}),'向前普通攻击','the new F action is described as an attack in combination drafts');
 assert.equal(actionText(s,friendId,{type:'basic',target:enemyId}),'普通攻击 '+unitName(enemy));

 const friendWithoutSpecies={...friend,species:undefined};
 const enemyWithoutSpecies={...enemy,species:undefined};
 assert.equal(unitLabel(friendWithoutSpecies,friendId),'队员');
 assert.equal(unitLabel(enemyWithoutSpecies,enemyId),'敌人');

 const invitation={...enemy,id:'N4'};
 s.invitations=[{id:'pending-test',unit:invitation,status:'pending'}];
 const invitationLog=localizeLog(s,'N4发出邀请');
 assert.equal(invitationLog,unitName(invitation)+'发出邀请');
 assert.ok(!invitationLog.includes('N4'));

 s.units[friendId]=friendWithoutSpecies;
 const fallbackLog=localizeLog(s,friendId+'受伤');
 assert.equal(fallbackLog,'队员受伤');
 assert.ok(!fallbackLog.includes(friendId));
});

test('enemy card exposes short move rows and keeps full descriptions separate',()=>{
 const s=createScenario('K1','describe-enemy-move-rows');
 const info=enemyInfo(s,'H');
 assert.ok(info);
 assert.equal(info.name,s.units.H.species?speciesZh(s.units.H.species):'敌人');
 assert.equal(info.moveRows.length,info.moves.length);
 const first=info.moveRows[0];
 assert.deepEqual(
  {id:first.id,name:first.name,type:first.type,pp:first.pp,maxPp:first.maxPp},
  {id:'ember',name:'火花',type:'火',pp:15,maxPp:15},
 );
 assert.equal(info.moves[0],first.detail);
 assert.match(first.detail,/造成/);
 assert.match(first.detail,/PP 15\/15$/);
 assert.doesNotMatch(first.name,/射程|造成|PP/);
});

test('player prose uses readable attack terms without exposing empty-attack coordinates',()=>{
 assert.equal(playerText('朝前普攻，向12,-3挥空'),'向前普通攻击，普通攻击挥空');
 const s=createScenario('K1','describe-protected-move');
 assert.match(localizeLog(s,'A使用ember'),/火花/);
});

const textBattle=(id)=>{
 const s=createMain(id,false),floor=Array.from({length:81},(_,i)=>({x:i%9,y:Math.floor(i/9)}));
 const a=friend('A',1,1,20,{tackle:5}),e=foeOf('E','geodude',2,1,60,{});e.waitOnly=true;
 s.floor=floor;s.seen=floor.map(key);s.units={A:a,E:e};s.queue=['A'];s.enemies=['E'];s.leader='A';s.camp=[];s.points=[];s.rooms=[{x:0,y:0,w:9,h:9}];
 delete s.dungeon;delete s.prog;delete s.tms;delete s.shop;delete s.exchange;s.purse=0;
 return sureHit(s);
};

test('player logs preserve the acting side and sleep transition meanings',()=>{
 const wakeWorld=textBattle('describe-wake-counterexample');wakeWorld.units.E.asleep=true;
 const wakeResult=applyCommand(wakeWorld,{type:'round',action:{type:'wait'}});assert.equal(wakeResult.ok,true,wakeResult.ok?'':wakeResult.error);
 const wake=wakeResult.state.log.map(line=>localizeLog(wakeResult.state,line)).find(line=>line.includes('被相邻的队员惊醒'));
 assert.ok(wake,wakeResult.state.log.map(line=>localizeLog(wakeResult.state,line)).join('\n'));
 assert.doesNotMatch(wake,/被相邻的敌人惊醒/);

 const sleepWorld=textBattle('describe-birth-sleep-counterexample');sleepWorld.units.E.asleep=true;
 sleepWorld.units.A.learned=['spore'];sleepWorld.units.A.pp={spore:12};sleepWorld.units.A.maxPp={spore:12};
 const sleepResult=applyCommand(sleepWorld,{type:'round',action:{type:'skill',skill:'spore',target:'A'}});assert.equal(sleepResult.ok,true,sleepResult.ok?'':sleepResult.error);
 assert.ok(sleepResult.state.units.E.status?.slp,'the move converts the birth-sleep flag into a sleep status');
 const birthSleep=sleepResult.state.log.map(line=>localizeLog(sleepResult.state,line)).find(line=>line.includes('出生时的睡眠转为招式造成的睡眠状态'));
 assert.ok(birthSleep,sleepResult.state.log.map(line=>localizeLog(sleepResult.state,line)).join('\n'));

 const screenWorld=textBattle('describe-enemy-screen-counterexample');screenWorld.units.E.waitOnly=false;
 screenWorld.units.E.learned=['reflect'];screenWorld.units.E.pp={reflect:15};screenWorld.units.E.maxPp={reflect:15};
 const screenResult=applyCommand(screenWorld,{type:'round',action:{type:'wait'}});assert.equal(screenResult.ok,true,screenResult.ok?'':screenResult.error);assert.equal(screenResult.state.units.E.reflect,10);
 const enemyScreen=screenResult.state.log.map(line=>localizeLog(screenResult.state,line)).find(line=>line.includes('受到反射壁保护'));
 assert.ok(enemyScreen,screenResult.state.log.map(line=>localizeLog(screenResult.state,line)).join('\n'));
 assert.match(enemyScreen,/持续10个我方行动阶段/);

 const missWorld=textBattle('describe-basic-miss-counterexample');missWorld.units.E.pos={x:2,y:1};missWorld.units.A.status={confusion:{tick:1}};
 const missResult=applyCommand(missWorld,{type:'round',action:{type:'basic',target:'E'}});assert.equal(missResult.ok,true,missResult.ok?'':missResult.error);
 const miss=missResult.state.log.map(line=>localizeLog(missResult.state,line)).find(line=>line.includes('的普通攻击未命中任何目标'));
 assert.ok(miss,missResult.state.log.map(line=>localizeLog(missResult.state,line)).join('\n'));
 assert.equal(playerText('普攻需要相邻敌人'),'普通攻击需要相邻敌人');
 assert.equal(playerText('该招式只能指定对方阵营'),'该招式只能指定对方阵营');
 const invalidWorld=textBattle('describe-relative-target-error');invalidWorld.units.B=friend('B',1,2,20,{});invalidWorld.queue.push('B');invalidWorld.units.A.learned=['ember'];invalidWorld.units.A.pp={ember:15};invalidWorld.units.A.maxPp={ember:15};
 const invalidTarget=applyCommand(invalidWorld,{type:'round',action:{type:'skill',skill:'ember',target:'B'}});assert.equal(invalidTarget.ok,false);assert.equal(invalidTarget.error,'该招式只能指定与使用者不同阵营的目标；本轮未执行');assert.deepEqual(invalidTarget.state,invalidWorld);
});


test('friendly reflect log counts enemy action phases',()=>{
 const s=textBattle('describe-friendly-screen-counterexample');
 s.units.A.learned=['reflect'];s.units.A.pp={reflect:15};s.units.A.maxPp={reflect:15};
 const result=applyCommand(s,{type:'round',action:{type:'skill',skill:'reflect',target:'A'}});
 assert.equal(result.ok,true,result.ok?'':result.error);
 const line=result.state.log.map(t=>localizeLog(result.state,t)).find(t=>t.includes('受到反射壁保护'));
 assert.ok(line,result.state.log.join('\n'));
 assert.match(line,/持续10个敌方行动阶段/);
 assert.equal(result.state.units.A.reflect,9,'the enemy action phase immediately after casting consumes the first phase');
});
