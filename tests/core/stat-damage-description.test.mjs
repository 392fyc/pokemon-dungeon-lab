import test from 'node:test';
import assert from 'node:assert/strict';
import {speciesUnit} from '../../src/core/engine.ts';
import {createScenario} from '../../src/core/scenarios.ts';
import {damageEstimateText,enemyInfo,moveSummary,teammateInfo} from '../../src/core/describe.ts';

test('action damage descriptions use the engine estimate for a visible target and ordinary-target fallback',()=>{
 const s=createScenario('K1','ui-stat-damage');
 const original=moveSummary('tackle');
 const enemyMoveText=enemyInfo(s,'H').moves[0];
 assert.match(original,/造成9点基础伤害/,'context-free descriptions retain a sensible fallback');
 assert.equal(damageEstimateText(s,'A'), '约6点（对普通目标）','a basic attack uses the shared estimate');
 assert.equal(damageEstimateText(s,'A',undefined,'tackle'),'约9点（对普通目标）','a move preview uses its move id with the same estimate');

 s.units.H.hp=3;
 assert.equal(damageEstimateText(s,'A','H','tackle'),'约3点','the preview reports actual HP loss when the target has less HP remaining');
 assert.match(moveSummary('tackle',{s,sourceId:'A',targetId:'H'}),/造成约3点/);
 assert.doesNotMatch(moveSummary('tackle',{s,sourceId:'A',targetId:'H'}),/对普通目标/);
 s.units.A.pos={x:1,y:2};s.units.H.pos={x:3,y:2};s.quickguard={owner:'enemy',units:['H']};
 assert.equal(damageEstimateText(s,'A','H','tackle'),'约0点','the preview observes an active enemy quickguard outside adjacent range');
 assert.equal(enemyInfo(s,'H').moves[0],enemyMoveText,'contextual player previews do not change enemy hover text');
});

test('player teammate details use species-based move estimates while enemy details retain the old wording',()=>{
 const mudkip=createScenario('K1','ui-detail-mudkip');mudkip.units.A=speciesUnit('A','mudkip',5,{x:2,y:2});
 const treecko=createScenario('K1','ui-detail-treecko');treecko.units.A=speciesUnit('A','treecko',5,{x:2,y:2});
 const mudkipPreview=moveSummary('tackle',{s:mudkip,sourceId:'A',targetId:'H'});
 const treeckoPreview=moveSummary('tackle',{s:treecko,sourceId:'A',targetId:'H'});
 assert.notEqual(mudkipPreview,treeckoPreview,'different attacking species produce different damage estimates');

 const teammateMove=teammateInfo(mudkip,'A').moves.find(row=>row.startsWith('撞击'));
 assert.match(teammateMove,/造成约\d+点（对普通目标）/);
 assert.doesNotMatch(teammateMove,/基础伤害/);
 assert.match(enemyInfo(mudkip,'H').moves[0],/造成10点基础伤害/);
});
