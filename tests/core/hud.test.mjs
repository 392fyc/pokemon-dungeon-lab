import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEM_DESCRIPTIONS,itemDescription} from '../../src/core/item-descriptions.ts';

const items=['berry','tonic','bigBerry','teamTonic','pechaBerry','rawstBerry','cheriBerry','chestoBerry','healSeed','violentSeed','maxElixir','slumberOrb','totterOrb','luminousOrb','rollcallOrb','reviverSeed'];

test('every current item has a visible Chinese effect description',()=>{
 assert.deepEqual(Object.keys(ITEM_DESCRIPTIONS),items);
 for(const item of items){
  assert.ok(itemDescription(item).length>0,item+' has a non-empty effect description');
 }
 assert.match(itemDescription('berry'),/HP/);
 assert.match(itemDescription('tonic'),/PP/);
 assert.match(itemDescription('teamTonic'),/在场存活队员/);
 assert.match(itemDescription('healSeed'),/全部异常状态.*睡眠/);
 assert.match(itemDescription('chestoBerry'),/解除睡眠.*不解除打盹/);
 assert.match(itemDescription('violentSeed'),/攻击和特攻/);
 assert.match(itemDescription('maxElixir'),/所有已学招式/);
});
