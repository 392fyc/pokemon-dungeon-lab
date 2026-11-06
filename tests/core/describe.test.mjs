import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenario} from '../../src/core/scenarios.ts';
import {actionText,enemyInfo,localizeLog,orderLine,unitLabel,unitName,playerText} from '../../src/core/describe.ts';
import {speciesZh} from '../../src/core/names.ts';

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
