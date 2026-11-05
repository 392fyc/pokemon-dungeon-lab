import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEM_NAMES,PICKUP_KINDS,createMain,applyCommand} from '../../src/core/engine.ts';
import {POINT_VISUALS,dungeonCellSize} from '../../src/render/point-visuals.ts';
import {inferEvents,newLines} from '../../src/render/animation.ts';

test('P194 pickup points retain their item names and never use the exit icon',()=>{
 for(const kind of PICKUP_KINDS){assert.equal(POINT_VISUALS[kind].name,ITEM_NAMES[kind]);assert.ok(['berry','tonic','seed'].includes(POINT_VISUALS[kind].icon),kind);}
 assert.equal(new Set(['berry','pechaBerry','rawstBerry','cheriBerry'].map(k=>POINT_VISUALS[k].color)).size,4);
 assert.equal(POINT_VISUALS.healSeed.icon,'seed');assert.equal(POINT_VISUALS.exit.icon,'exit');
});
test('P194 viewport scale uses source-pixel multiples and about nine vertical cells at delivery sizes',()=>{
 for(const height of [410,720,844,1080]){const cell=dungeonCellSize(height);assert.ok(cell>=48);assert.equal(cell%24,0);assert.ok(height/cell>=8&&height/cell<=10);}
});
test('P194 every air swing animates after the bounded log becomes identical',()=>{
 let world=createMain('repeat-air-194',false);world.enemies=[];world.invitations=[];
 for(const id of world.queue)world.units[id].tactic='wait';
 const command={type:'round',action:{type:'basicForward'}};let repeated;
 for(let round=0;round<100;round++){
  const before=world,result=applyCommand(before,command);assert.ok(result.ok);world=result.state;
  if(JSON.stringify(before.log)===JSON.stringify(world.log)){repeated={before,after:world};break;}
 }
 assert.ok(repeated,'real repeated air commands eventually fill the capped log with the same lines');
 assert.deepEqual(newLines(repeated.before.log,repeated.after.log),[]);
 const swings=inferEvents(repeated.before,repeated.after,command).filter(event=>event.k==='airAttack');
 assert.equal(swings.length,1,'the fresh round event still drives its swing even when textual logs match');
 assert.equal(swings[0].actor,world.leader);
});
