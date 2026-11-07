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
