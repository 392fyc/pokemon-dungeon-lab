import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEM_DESCRIPTIONS,itemDescription} from '../../src/core/item-descriptions.ts';
import {moveEffectLabel} from '../../src/core/describe.ts';
import {MOVE_DEFS} from '../../src/core/moves.ts';
import moveDescZh from '../../src/data/move-desc-zh.json' with {type:'json'};

const items=['berry','tonic','bigBerry','teamTonic','pechaBerry','rawstBerry','cheriBerry','chestoBerry','healSeed','violentSeed','maxElixir','slumberOrb','totterOrb','luminousOrb','rollcallOrb','reviverSeed'];

test('every current item has a visible Chinese effect description',()=>{
 assert.deepEqual(Object.keys(ITEM_DESCRIPTIONS),items);
 for(const item of items){
  assert.ok(itemDescription(item).length>0,item+' has a non-empty effect description');
 }
 assert.match(itemDescription('berry'),/HP/);
 assert.match(itemDescription('tonic'),/PP/);
 assert.match(itemDescription('teamTonic'),/在场存活队员/);
 assert.match(itemDescription('healSeed'),/全部异常状态/);
 assert.match(itemDescription('chestoBerry'),/解除睡眠/);
 assert.match(itemDescription('violentSeed'),/攻击和特攻/);
 assert.match(itemDescription('maxElixir'),/所有已学招式/);
});

test('no move effect line or move description writes a cap or limit sentence (the screen carries no explanations)',()=>{
 for(const id of Object.keys(MOVE_DEFS))assert.ok(!moveEffectLabel(id).includes('上限'),id+' effect label has no 上限');
 assert.match(moveEffectLabel('swordsdance'),/攻击\+2$/);
 assert.ok(!JSON.stringify(moveDescZh).includes('上限'),'no move description mentions a cap');
 assert.match(itemDescription('violentSeed'),/至少升到 \+3 级/);
});
