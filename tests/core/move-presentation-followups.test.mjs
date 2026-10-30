import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createMain,friend,enemy,key} from '../../src/core/engine.ts';
import {inferEvents} from '../../src/render/animation.ts';

function collisionRound(guardFirst=false){
  const before=createMain('protect-collision',false);
  before.units={A:friend('A',0,1,20,{roar:1}),B:friend('B',3,1,4,{protect:1}),E:enemy('E',1,1,20,'melee',0)};
  before.queue=guardFirst?['B','A']:['A','B'];before.leader='A';before.enemies=['E'];
  before.seen=before.floor.map(key);before.points=[];
  const command={type:'round',action:{type:'skill',skill:'roar',target:'E'},override:{actor:'B',action:{type:'skill',skill:'protect',target:'B'}}};
  const result=applyCommand(before,command);
  assert.equal(result.ok,true,result.error);
  assert.equal(result.state.units.B.hp,0,'吹飞碰撞在本轮击倒B');
  return {before,after:result.state,command};
}

test('倒下后未能执行守住的伙伴不会播放守住动画',()=>{
  const {before,after,command}=collisionRound();
  assert.equal(after.log.includes('B进入守住状态'),false);
  assert.equal(after.units.B.pp.protect,1);
  assert.equal(inferEvents(before,after,command).some(e=>e.k==='protect'),false);
});

test('先成功守住后被碰撞击倒仍保留已经发生的守住动画',()=>{
  const {before,after,command}=collisionRound(true);
  assert.equal(after.log.includes('B进入守住状态'),true);
  assert.equal(after.units.B.pp.protect,0);
  assert.equal(inferEvents(before,after,command).filter(e=>e.k==='protect').length,1);
});
