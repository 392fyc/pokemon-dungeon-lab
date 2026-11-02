import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,traceRound} from '../../src/core/engine.ts';
import {world,friend,open,row,pos} from '../acceptance/fixtures.mjs';

const command={type:'round',action:{type:'wait'}};
const actionOf=(s,id)=>traceRound(s,command).find(step=>step.id===id).action;

test('path indexes observe changed terrain and remembered cells on the next search',()=>{
  const floor=[...row(4),...row(4).map(p=>({...p,y:2}))];
  const s=world({A:friend('A',4),B:friend('B',1)},{floor,queue:['A','B']});
  assert.deepEqual(actionOf(s,'B'),{type:'move',to:pos(2)});
  // Same array and length, but the direct route becomes a wall.
  floor.find(p=>p.x===2&&p.y===1).y=3;
  assert.deepEqual(actionOf(s,'B'),{type:'move',to:pos(1,2)});
  s.seen.splice(0,s.seen.length,...row(4).map(p=>`${p.x},${p.y}`));
  assert.deepEqual(actionOf(s,'B'),{type:'wait'},'unrevealed detour is not usable');
  s.seen.push(...row(4).map(p=>`${p.x},2`));
  assert.deepEqual(actionOf(s,'B'),{type:'move',to:pos(1,2)});
});

test('chasing preserves right-before-down ties, occupied detours, and seen-only routes',()=>{
  const a=friend('A',4,4),b=friend('B',1,1),c=friend('C',4,3),e=friend('E',3,3);
  b.tactic='gofoes';c.tactic='wait';e.side='enemy';e.waitOnly=true;
  const s=world({A:a,B:b,C:c,E:e},{floor:open(4),enemies:['E']});
  s.rooms=[{x:1,y:1,w:4,h:4}];
  // 8.8: the shortest route from (1,1) to E at (3,3) is the diagonal through (2,2).
  assert.deepEqual(actionOf(s,'B'),{type:'move',to:pos(2,2)});
  c.pos=pos(2,2);
  assert.deepEqual(actionOf(s,'B'),{type:'move',to:pos(2,1)},'occupied diagonal: the detour keeps right before down');
  c.hp=0;c.pos=null;
  assert.deepEqual(actionOf(s,'B'),{type:'move',to:pos(2,2)},'fallen units do not block');
  s.seen.splice(0,s.seen.length,'1,1','3,3','4,4');
  assert.deepEqual(actionOf(s,'B'),{type:'wait'});
});

test('a later ally search observes the earlier ally move in the same round',()=>{
  const s=world({A:friend('A',4),B:friend('B',2),C:friend('C',1)},{floor:row(4)});
  const before=structuredClone(s),r=applyCommand(s,command);
  assert.equal(r.ok,true,r.error);
  assert.deepEqual([r.state.units.B.pos,r.state.units.C.pos],[pos(3),pos(2)]);
  assert.deepEqual(s,before);
  const rejected=applyCommand(s,{type:'round',action:{type:'move',to:pos(4,2)}});
  assert.equal(rejected.ok,false);
  assert.deepEqual(rejected.state,before);
  assert.deepEqual(s,before,'rejection preserves the complete input state');
});
