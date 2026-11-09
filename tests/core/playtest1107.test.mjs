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

test('round 3: the type note is joined into its damage entry for display, the engine log is untouched',async()=>{
 const {logEntryText}=await import('../../src/core/describe.ts');
 const u=(id,species)=>({unit:id,species,side:'enemy'});
 const hit=(id,species,amount,hp,notes)=>({n:1,parts:[u(id,species),`受到${amount}伤害，HP ${hp}`],damage:{target:id,amount,notes}});
 assert.equal(logEntryText(hit('T','rattata',36,4,['效果绝佳'])),'小拉达受到36伤害，效果绝佳');
 assert.equal(logEntryText(hit('U','rattata',9,20,['效果不好'])),'小拉达受到9伤害，效果不好');
 assert.equal(logEntryText(hit('X','rattata',0,9,[])),'小拉达受到0伤害，HP 9','0 damage from a guard has no reason text');
 assert.equal(logEntryText(hit('V','rattata',5,7,[])),'小拉达受到5伤害，HP 7','an ordinary hit keeps its line');
});
