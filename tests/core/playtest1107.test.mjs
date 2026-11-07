/* Playtest 1107: player-facing text for sleep status and the defeat log line. The engine log itself is unchanged. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {speciesUnit} from '../../src/core/engine.ts';
import {statusLabels,playerText,localizeLog,enemyInfo} from '../../src/core/describe.ts';
import {world} from '../acceptance/fixtures.mjs';
import {foeOf} from './foe-fixture.mjs';

test('statusLabels names every active condition, and a unit born asleep shows as sleeping',()=>{
 const u=speciesUnit('X','geodude',5,{x:1,y:1});
 assert.deepEqual(statusLabels(u),[]);
 u.asleep=true;assert.deepEqual(statusLabels(u),['睡眠']);
 u.asleep=false;u.status={par:{left:3},slp:{left:2}};
 assert.deepEqual(statusLabels(u),['麻痹（剩余3）','睡眠（剩余2）']);
 u.status={nap:{left:1}};u.asleep=true;assert.deepEqual(statusLabels(u),['打盹（剩余1）','睡眠']);
});

test('the enemy information card carries the current statuses',()=>{
 const e=foeOf('E','geodude',2,1,30);e.asleep=true;
 const s=world({E:e},{floor:[{x:1,y:1},{x:2,y:1}],queue:[],enemies:['E'],leader:'E'});s.seen=['1,1','2,1'];
 assert.deepEqual(enemyInfo(s,'E')?.statuses,['睡眠']);
 e.asleep=false;assert.deepEqual(enemyInfo(s,'E')?.statuses,[]);
});

test('the internal defeat wording is replaced in what the player reads, not in the engine log',()=>{
 assert.equal(playerText('w1a倒下退图'),'w1a倒下了');
 const s=world({},{floor:[{x:1,y:1}],queue:[],enemies:[]});
 assert.equal(localizeLog(s,'走路草倒下退图'),'走路草倒下了');
});

test('item names in player text come from ITEM_NAMES, never an English id (PR 214 review)',async()=>{
 const {actionText,adventureRoomMarkers}=await import('../../src/core/describe.ts');
 const {ITEM_NAMES}=await import('../../src/core/engine.ts');
 const s=world({A:speciesUnit('A','mudkip',5,{x:1,y:1})},{floor:[{x:1,y:1},{x:2,y:1}],queue:['A'],enemies:[],leader:'A'});
 for(const item of Object.keys(ITEM_NAMES)){
  const text=actionText(s,'A',{type:'use',item,target:'A'});
  assert.ok(text.includes(ITEM_NAMES[item]),item+': '+text);assert.ok(!text.includes(item)||item===ITEM_NAMES[item],item+' leaks its id: '+text);
 }
 s.adventureRooms=[{room:0,type:'item',state:'idle',interaction:{x:2,y:1},doors:[],sealedCells:[],enemyIds:[],reward:null,rewardCurrency:null,item:'rollcallOrb',rewardItem:null,rewardMove:null}];
 const marker=adventureRoomMarkers(s).find(m=>m.kind==='interaction');assert.equal(marker?.itemLabel,'邀回宝珠');
});

test('round 3: the type note is merged into its damage line for display, the engine log is untouched',async()=>{
 const {mergeLogLines}=await import('../../src/core/describe.ts');
 const lines=['A使用撞击','T受到36伤害，HP 4','效果绝佳','B使用火花','U受到9伤害，HP 20','效果不好','C使用撞击','V受到5伤害，HP 7','W受到0伤害，HP 9','没有效果','X受到0伤害，HP 9'];
 const {merged,skipped}=mergeLogLines(lines);
 assert.equal(merged.get(1),'T受到36伤害，效果绝佳');assert.equal(merged.get(4),'U受到9伤害，效果不好');
 assert.equal(merged.get(8),'W受到0伤害，没有效果','a type immunity says so');assert.equal(merged.has(10),false,'0 damage from a guard has no reason text');assert.ok(skipped.has(9)&&!skipped.has(10));
 assert.ok(skipped.has(2)&&skipped.has(5)&&!skipped.has(7),'only the note lines are folded in');assert.equal(merged.has(7),false,'an ordinary hit keeps its line');
 assert.deepEqual(lines.slice(1,3),['T受到36伤害，HP 4','效果绝佳'],'the input (the engine log) is not modified');
});
