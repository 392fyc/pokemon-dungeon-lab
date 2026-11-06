import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCommand, createExpedition, jumpToFloor, createMain, estimateAttackDamage, friend, key, skillTargets, traceRound,
} from '../../src/core/engine.ts';
import {foeOf} from './foe-fixture.mjs';
import {sureHit} from './sure-hit.mjs';   // 8.8 (#165): damage and reach tests take the accuracy roll out of the picture

// 8.8 (4.1, 4.2): eight movement directions, diagonal reach for "front" style attacks, no cutting wall corners, and walking into a companion swaps places.
// A "wall" is any cell outside `floor`; second terrain (water, lava) is such a cell too, so it counts as a wall for the corner rule.

const rect=(x1,x2,y1,y2)=>Array.from({length:(x2-x1+1)*(y2-y1+1)},(_,i)=>({x:x1+i%(x2-x1+1),y:y1+Math.floor(i/(x2-x1+1))}));
const without=(cells,...holes)=>cells.filter(c=>!holes.some(h=>h.x===c.x&&h.y===c.y));
let sequence=0;
function world({floor=rect(0,8,0,8),friends=[friend('A',1,1,20,{tackle:5})],enemies=[],rooms,liquid}={}){
  const s=createMain(`move8-${++sequence}`,false);
  s.floor=floor;s.seen=floor.map(key);s.units=Object.fromEntries([...friends,...enemies].map(u=>[u.id,u]));
  s.queue=friends.map(u=>u.id);s.enemies=enemies.map(u=>u.id);s.leader=s.queue[0];s.camp=[];s.points=[];s.log=[];
  if(rooms)s.rooms=rooms;else delete s.rooms;
  if(liquid)s.liquid=liquid;
  delete s.dungeon;delete s.prog;delete s.tms;delete s.shop;delete s.exchange;s.purse=0;
  return sureHit(s);
}
const wholeRoom=(floor)=>{const xs=floor.map(c=>c.x),ys=floor.map(c=>c.y),x=Math.min(...xs),y=Math.min(...ys);return [{x,y,w:Math.max(...xs)-x+1,h:Math.max(...ys)-y+1}];};
function attempt(s,action,override){return applyCommand(s,{type:'round',action,...(override?{override}:{})});}
function play(s,action,override){const r=attempt(s,action,override);assert.equal(r.ok,true,r.ok?'':r.error);return r.state;}
function refuse(s,action){const r=attempt(s,action);assert.equal(r.ok,false,'the command must be refused');return r.error;}
const still=(id,species,x,y,hp,moves)=>{const e=foeOf(id,species,x,y,hp,moves);e.waitOnly=true;return e;};
function equip(u,id,pp=3){if(!u.learned.includes(id))u.learned.push(id);u.pp[id]=pp;u.maxPp[id]=pp;}

// ---- movement ----------------------------------------------------------------------------------------------------

test('4.1 斜向移动一步：八个方向都能走，占一次行动',()=>{
  for(const [dx,dy] of [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[0,1],[-1,0],[0,-1]]){
    const s=world({friends:[friend('A',4,4,20,{tackle:5})]});
    const t=play(s,{type:'move',to:{x:4+dx,y:4+dy}});
    assert.deepEqual(t.units.A.pos,{x:4+dx,y:4+dy},`方向(${dx},${dy})`);
    assert.equal(t.round,1);
  }
});

test('4.1 斜向移动一次最多一格；相隔两格的斜线目标被拒绝',()=>{
  const s=world({friends:[friend('A',1,1,20,{tackle:5})]});
  assert.match(refuse(s,{type:'move',to:{x:3,y:3}}),/相邻格/);
  assert.match(refuse(s,{type:'move',to:{x:2,y:3}}),/相邻格/);
});

test('4.1 墙角：左侧是墙时不能斜向穿过，理由写明墙格',()=>{
  // From (2,2) to (1,1) the side cells are (1,2) and (2,1). (1,2) is the wall on the left (the cell the step passes beside).
  const s=world({floor:without(rect(0,4,0,4),{x:1,y:2}),friends:[friend('A',2,2,20,{tackle:5})]});
  const error=refuse(s,{type:'move',to:{x:1,y:1}});
  assert.match(error,/墙角/);assert.match(error,/\(1,2\)/);assert.doesNotMatch(error,/\(2,1\)/);
});

test('4.1 墙角：上侧是墙时不能斜向穿过',()=>{
  const s=world({floor:without(rect(0,4,0,4),{x:2,y:1}),friends:[friend('A',2,2,20,{tackle:5})]});
  const error=refuse(s,{type:'move',to:{x:1,y:1}});
  assert.match(error,/墙角/);assert.match(error,/\(2,1\)/);assert.doesNotMatch(error,/\(1,2\)/);
});

test('4.1 墙角：两侧都是墙时同样拒绝，理由列出两格',()=>{
  const s=world({floor:without(rect(0,4,0,4),{x:1,y:2},{x:2,y:1}),friends:[friend('A',2,2,20,{tackle:5})]});
  const error=refuse(s,{type:'move',to:{x:1,y:1}});
  assert.match(error,/墙角/);assert.match(error,/\(1,2\)/);assert.match(error,/\(2,1\)/);
});

test('4.1 墙角：四个斜向都按各自的两个侧格判断',()=>{
  for(const [dx,dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
    for(const side of [{x:4+dx,y:4},{x:4,y:4+dy}]){
      const s=world({floor:without(rect(0,8,0,8),side),friends:[friend('A',4,4,20,{tackle:5})]});
      assert.match(refuse(s,{type:'move',to:{x:4+dx,y:4+dy}}),/墙角/,`方向(${dx},${dy}) 侧格(${side.x},${side.y})`);
      // The other straight neighbour (not the wall) is unaffected.
      play(s,{type:'move',to:side.x===4+dx?{x:4,y:4+dy}:{x:4+dx,y:4}});
    }
  }
});

test('4.1 第二地形（水面、岩浆）和墙一样挡住墙角，但目标格本身是第二地形仍是墙',()=>{
  // The engine marks second terrain as cells outside `floor` and lists them in `liquid`.
  const floor=without(rect(0,4,0,4),{x:2,y:1});
  const s=world({floor,liquid:['2,1'],friends:[friend('A',2,2,20,{tackle:5})]});
  assert.match(refuse(s,{type:'move',to:{x:1,y:1}}),/墙角/);
  assert.match(refuse(s,{type:'move',to:{x:2,y:1}}),/是墙/);
  play(s,{type:'move',to:{x:3,y:3}});
});

test('4.1 真实生成的楼层：第二地形格不在地面里，紧贴它的斜向步被拒绝',()=>{
  // 8.8（#178）起地形整形后，种子 85 的第 2、3 层没有这样的格对；从 85 起逐个种子、逐层找，直到某层有第二地形且存在这样的格对。
  let run=null,found=null,floor=null;
  for(let seed=85;seed<125&&!found;seed++)for(const level of [2,3]){
    const r=jumpToFloor(createExpedition('move8-liquid',seed,3),level);
    if(!(r.liquid?.length>0))continue;
    const ground=new Set(r.floor.map(key)),liquid=new Set(r.liquid);
    assert.ok([...liquid].every(k=>!ground.has(k)),'第二地形格不是地面');
    for(const k of liquid){
      const [lx,ly]=k.split(',').map(Number);
      for(const [dx,dy] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
        // The liquid cell is a side cell of the step a -> b when a=(lx-dx.., ...): choose a beside it and b diagonal to a with the liquid between.
        const a={x:lx-dx,y:ly},b={x:lx,y:ly+dy};
        if(ground.has(key(a))&&ground.has(key(b)))found??={a,b};
      }
    }
    if(found){run=r;floor=ground;break;}
  }
  assert.ok(run,'这个种子的第2或第3层有第二地形');
  assert.ok(found,'存在一对斜向相邻地面格，侧格是第二地形');
  const s=structuredClone(run);
  s.units[s.leader].pos={x:found.a.x,y:found.a.y};
  for(const id of s.enemies)s.units[id].pos=null;
  s.seen=[...new Set([...s.seen,key(found.a),key(found.b)])];
  assert.match(refuse(s,{type:'move',to:found.b}),/墙角/);
});

// ---- attacks -----------------------------------------------------------------------------------------------------

test('4.1 斜向普攻：斜向相邻的对方可以普攻，伤害与正向一致',()=>{
  const e=still('E','geodude',2,2,40);
  const s=world({enemies:[e]});
  const expected=estimateAttackDamage(s,'A','E');
  assert.ok(expected>0);
  const t=play(s,{type:'basic',target:'E'});
  assert.equal(40-t.units.E.hp,expected);
  const straight=world({enemies:[still('E','geodude',2,1,40)]});
  assert.equal(40-play(straight,{type:'basic',target:'E'}).units.E.hp,expected);
});

test('4.1 斜向普攻：穿过墙角时被拒绝，理由说明',()=>{
  const s=world({floor:without(rect(0,8,0,8),{x:2,y:1}),enemies:[still('E','geodude',2,2,40)]});
  assert.match(refuse(s,{type:'basic',target:'E'}),/普通攻击只能指定相邻敌人/);
});

test('4.1 斜向 front 招式：能指定斜向相邻目标；墙角挡住时不在合法目标里',()=>{
  const open=world({enemies:[still('E','geodude',2,2,40)]});
  assert.deepEqual(skillTargets(open,'A','tackle'),['E']);
  const expected=estimateAttackDamage(open,'A','E','tackle');
  const t=play(open,{type:'skill',skill:'tackle',target:'E'});
  assert.equal(40-t.units.E.hp,expected);
  const blocked=world({floor:without(rect(0,8,0,8),{x:1,y:2}),enemies:[still('E','geodude',2,2,40)]});
  assert.deepEqual(skillTargets(blocked,'A','tackle'),[]);
  assert.match(refuse(blocked,{type:'skill',skill:'tackle',target:'E'}),/墙角/);
});

test('4.1 front2：斜向两格内可打，中间有单位或穿墙角则不行',()=>{
  const a=friend('A',1,1,20,{quickattack:5});
  const open=world({friends:[a],enemies:[still('E','geodude',3,3,40)]});
  assert.deepEqual(skillTargets(open,'A','quickattack'),['E']);
  const t=play(open,{type:'skill',skill:'quickattack',target:'E'});
  assert.equal(40-t.units.E.hp,estimateAttackDamage(open,'A','E','quickattack'));
  const far=world({friends:[friend('A',1,1,20,{quickattack:5})],enemies:[still('E','geodude',4,4,40)]});
  assert.match(refuse(far,{type:'skill',skill:'quickattack',target:'E'}),/超出招式射程2格/);
  const middle=world({friends:[friend('A',1,1,20,{quickattack:5}),friend('B',2,2,20)],enemies:[still('E','geodude',3,3,40)]});
  assert.match(refuse(middle,{type:'skill',skill:'quickattack',target:'E'}),/被B挡住/);
  const corner=world({floor:without(rect(0,8,0,8),{x:3,y:2}),friends:[friend('A',1,1,20,{quickattack:5})],enemies:[still('E','geodude',3,3,40)]});
  assert.match(refuse(corner,{type:'skill',skill:'quickattack',target:'E'}),/墙角/);
  assert.deepEqual(skillTargets(corner,'A','quickattack'),[]);
});

test('4.1 line10：沿斜线打到第一个单位，遇墙或墙角停下',()=>{
  const mk=(floor,enemies)=>world({floor,friends:[friend('A',1,1,20,{shockwave:5})],enemies});
  const first=still('E1','geodude',5,5,60),behind=still('E2','geodude',7,7,60);
  const open=mk(rect(0,8,0,8),[first,behind]);
  assert.deepEqual(skillTargets(open,'A','shockwave'),['E1'],'只有射线上的第一个单位可以指定');
  assert.match(refuse(open,{type:'skill',skill:'shockwave',target:'E2'}),/被E1挡住/);
  const t=play(open,{type:'skill',skill:'shockwave',target:'E1'});
  assert.equal(60-t.units.E1.hp,estimateAttackDamage(open,'A','E1','shockwave'));
  assert.equal(t.units.E2.hp,60);
  // A wall on the ray itself stops it.
  const wall=mk(without(rect(0,8,0,8),{x:3,y:3}),[still('E','geodude',5,5,60)]);
  assert.match(refuse(wall,{type:'skill',skill:'shockwave',target:'E'}),/\(3,3\)被墙挡住/);
  assert.deepEqual(skillTargets(wall,'A','shockwave'),[]);
  // A wall beside the ray cuts the corner of the step (2,2)->(3,3).
  const corner=mk(without(rect(0,8,0,8),{x:3,y:2}),[still('E','geodude',5,5,60)]);
  assert.match(refuse(corner,{type:'skill',skill:'shockwave',target:'E'}),/墙角/);
  assert.deepEqual(skillTargets(corner,'A','shockwave'),[]);
  // A target before the corner is still reachable.
  const before=mk(without(rect(0,8,0,8),{x:3,y:2}),[still('E','geodude',2,2,60)]);
  assert.deepEqual(skillTargets(before,'A','shockwave'),['E']);
});

test('4.1 line10：不在同排、同列、正斜线上的目标说明原因',()=>{
  const s=world({friends:[friend('A',1,1,20,{shockwave:5})],enemies:[still('E','geodude',4,3,60)]});
  assert.match(refuse(s,{type:'skill',skill:'shockwave',target:'E'}),/同排、同列或正斜线/);
});

test('4.1 front：两侧都是墙角的斜向相邻目标不在合法目标里',()=>{
  const a=friend('A',2,2,20,{});
  equip(a,'swift');
  const s=world({floor:without(rect(0,8,0,8),{x:2,y:1},{x:1,y:2}),friends:[a],enemies:[still('E','geodude',1,1,60)]});
  // (1,1) is diagonal to (2,2) with both sides walls: not attackable by a front move, but an 'around' move still reaches it.
  const spec=skillTargets(s,'A','tackle');
  assert.deepEqual(spec,[]);
});

test('4.1 around 同样不能隔着墙角打斜向相邻的目标',()=>{
  const mk=(floor)=>world({floor,friends:[friend('A',2,2,20,{bulldoze:5})],enemies:[still('E','geodude',1,1,60)]});
  const open=mk(rect(0,4,0,4));
  assert.deepEqual(skillTargets(open,'A','bulldoze'),['E']);
  assert.equal(60-play(open,{type:'skill',skill:'bulldoze',target:'E'}).units.E.hp>0,true);
  for(const hole of [[{x:1,y:2}],[{x:2,y:1}],[{x:1,y:2},{x:2,y:1}]]){
    const blocked=mk(without(rect(0,4,0,4),...hole));
    assert.deepEqual(skillTargets(blocked,'A','bulldoze'),[]);
    assert.ok(refuse(blocked,{type:'skill',skill:'bulldoze',target:'E'}).length>0);
  }
});

test('4.1 反击只反弹相邻的对方：隔着墙角的 room 招式不会被反弹',()=>{
  const run=(floor)=>{
    const a=friend('A',2,2,60,{pursuit:3});
    const s=world({floor,rooms:wholeRoom(floor),friends:[a],enemies:[foeOf('E','geodude',1,1,60,{discharge:5})]});
    return play(s,{type:'skill',skill:'pursuit',target:'A'});
  };
  const open=run(rect(0,4,0,4));
  assert.ok(open.units.A.hp<60,'敌人用 room 招式打中了 A');
  assert.ok(open.units.E.hp<60,'斜向相邻且无墙角：伤害被反弹');
  const blocked=run(without(rect(0,4,0,4),{x:1,y:2},{x:2,y:1}));
  assert.ok(blocked.units.A.hp<60,'room 招式仍然打中 A');
  assert.equal(blocked.units.E.hp,60,'隔着墙角不算相邻，不反弹');
});

test('4.1 相邻惊醒：隔着墙角的斜向相邻不会惊醒睡着的敌人',()=>{
  const run=(floor)=>{
    const e=foeOf('E','geodude',1,1,60,{tackle:5});e.asleep=true;
    return play(world({floor,friends:[friend('A',2,2,20,{tackle:5})],enemies:[e]}),{type:'wait'});
  };
  assert.equal(run(rect(0,4,0,4)).units.E.asleep,false);
  assert.equal(run(without(rect(0,4,0,4),{x:1,y:2},{x:2,y:1})).units.E.asleep,true);
});

// ---- blow away ---------------------------------------------------------------------------------------------------

test('4.4 斜向吹飞：沿使用者→目标的斜线飞，撞墙受 5 点',()=>{
  const a=friend('A',1,1,20,{roar:5});
  const s=world({floor:rect(0,3,0,3),friends:[a],enemies:[still('E','geodude',2,2,40)]});
  const t=play(s,{type:'skill',skill:'roar',target:'E'});
  assert.deepEqual(t.units.E.pos,{x:3,y:3});
  assert.equal(t.units.E.hp,35);
});

test('4.4 斜向吹飞：墙角挡住时按撞墙处理，停在墙角之前',()=>{
  // Flight (2,2)->(3,3)->(4,4): the step (3,3)->(4,4) passes beside (4,3), which is a wall.
  const s=world({floor:without(rect(0,5,0,5),{x:4,y:3}),friends:[friend('A',1,1,20,{roar:5})],enemies:[still('E','geodude',2,2,40)]});
  const t=play(s,{type:'skill',skill:'roar',target:'E'});
  assert.deepEqual(t.units.E.pos,{x:3,y:3});
  assert.equal(t.units.E.hp,35);
});

test('4.4 斜向吹飞：路上有单位时两者各受 5 点',()=>{
  const s=world({floor:rect(0,8,0,8),friends:[friend('A',1,1,20,{roar:5})],enemies:[still('E','geodude',2,2,40),still('F','geodude',4,4,40)]});
  const t=play(s,{type:'skill',skill:'roar',target:'E'});
  assert.deepEqual(t.units.E.pos,{x:3,y:3});
  assert.equal(t.units.E.hp,35);assert.equal(t.units.F.hp,35);
});

// ---- swapping ----------------------------------------------------------------------------------------------------

test('4.2 走向同行队友的格子：双方交换位置，占一次行动',()=>{
  const s=world({friends:[friend('A',1,1,20,{tackle:5}),friend('B',2,1,20,{tackle:5})]});
  const t=play(s,{type:'move',to:{x:2,y:1}});
  assert.deepEqual(t.units.A.pos,{x:2,y:1});assert.deepEqual(t.units.B.pos,{x:1,y:1});
  assert.equal(t.round,1);
  assert.ok(t.log.includes('A与B换位'),t.log.join('|'));
  assert.equal(t.units.A.pp.tackle,5,'换位不消耗 PP');
  const trace=traceRound(s,{type:'round',action:{type:'move',to:{x:2,y:1}}});
  assert.equal(trace[0].id,'A');assert.equal(trace[0].swapWith,'B');
});

test('4.2 斜向换位同样遵守墙角规则',()=>{
  const open=world({friends:[friend('A',1,1,20,{tackle:5}),friend('B',2,2,20,{tackle:5})]});
  const t=play(open,{type:'move',to:{x:2,y:2}});
  assert.deepEqual(t.units.A.pos,{x:2,y:2});assert.deepEqual(t.units.B.pos,{x:1,y:1});
  const blocked=world({floor:without(rect(0,8,0,8),{x:2,y:1}),friends:[friend('A',1,1,20,{tackle:5}),friend('B',2,2,20,{tackle:5})]});
  assert.match(refuse(blocked,{type:'move',to:{x:2,y:2}}),/墙角/);
});

test('4.2 被换位的一方本轮如果还没行动，照常行动',()=>{
  // B stands on (2,1); after the swap B is on (1,1), next to the enemy at (0,2), and attacks it in the same round.
  const b=friend('B',2,1,20,{tackle:5});
  const s=world({friends:[friend('A',1,1,20,{tackle:5}),b],enemies:[still('E','geodude',0,2,60)]});   // (0,2) touches B's new cell (1,1) diagonally but not B's old cell (2,1), A's new cell (2,1) or A's old cell (1,1) is irrelevant: A used its action to move
  const t=play(s,{type:'move',to:{x:2,y:1}});
  assert.deepEqual(t.units.B.pos,{x:1,y:1});
  const dealt=60-t.units.E.hp;
  assert.ok(dealt>0,'B 换位后仍然出手');
  assert.equal(t.units.B.pp.tackle,4);
  assert.equal(t.units.A.pp.tackle,5,'主控只用这一次行动来换位');
});

test('4.2 被换位的一方本轮已经行动过则不再行动',()=>{
  // Queue order B, A with A leading: B acts first (attacks the enemy from (2,1)), then A swaps with B.
  const e=still('E','geodude',2,2,80);
  const s=world({friends:[friend('B',2,1,20,{tackle:5}),friend('A',1,1,20,{tackle:5})],enemies:[e]});
  s.leader='A';
  const t=play(s,{type:'move',to:{x:2,y:1}});
  assert.deepEqual(t.units.A.pos,{x:2,y:1});assert.deepEqual(t.units.B.pos,{x:1,y:1});
  assert.equal(t.units.B.pp.tackle,4,'B 只出手一次');
  assert.equal(t.log.filter(l=>/^B使用/.test(l)||/^B普攻/.test(l)).length,1);
});

test('4.2 倒下的队友不挡路：按普通移动处理；敌人格仍然不能走',()=>{
  const fallen=friend('B',0,0,0,{tackle:5});
  const s=world({friends:[friend('A',1,1,20,{tackle:5}),fallen],enemies:[still('E','geodude',3,1,40)]});
  const t=play(s,{type:'move',to:{x:2,y:1}});
  assert.deepEqual(t.units.A.pos,{x:2,y:1});assert.equal(t.units.B.pos,null);
  assert.match(refuse(t,{type:'move',to:{x:3,y:1}}),/被E占据/);
});

test('4.2 显式换位动作也接受斜向相邻，墙角同样挡住',()=>{
  const open=world({friends:[friend('A',1,1,20,{tackle:5}),friend('B',2,2,20,{tackle:5})]});
  const t=play(open,{type:'swap',target:'B'});
  assert.deepEqual(t.units.A.pos,{x:2,y:2});
  const blocked=world({floor:without(rect(0,8,0,8),{x:1,y:2}),friends:[friend('A',1,1,20,{tackle:5}),friend('B',2,2,20,{tackle:5})]});
  assert.match(refuse(blocked,{type:'swap',target:'B'}),/换位/);
});

// ---- allies and enemies move on eight directions --------------------------------------------------------------------

/** Independent reference: shortest eight-direction distances on `floor`, never cutting a corner. */
function referenceDistances(floor,from){
  const set=new Set(floor.map(key)),dist=new Map([[key(from),0]]),q=[from];
  for(let i=0;i<q.length;i++){
    const c=q[i];
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      if(!dx&&!dy)continue;const n={x:c.x+dx,y:c.y+dy},k=key(n);
      if(!set.has(k)||dist.has(k))continue;
      if(dx&&dy&&!(set.has(key({x:n.x,y:c.y}))&&set.has(key({x:c.x,y:n.y}))))continue;
      dist.set(k,dist.get(key(c))+1);q.push(n);
    }
  }
  return dist;
}
const legalStep=(floor,a,b)=>{
  const set=new Set(floor.map(key));
  if(Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))!==1||!set.has(key(b)))return false;
  return a.x===b.x||a.y===b.y||(set.has(key({x:b.x,y:a.y}))&&set.has(key({x:a.x,y:b.y})));
};

test('4.1 敌人斜向追击：一步沿斜线靠近',()=>{
  const floor=rect(0,8,0,8);
  const s=world({floor,rooms:wholeRoom(floor),friends:[friend('A',1,1,20,{})],enemies:[foeOf('E','geodude',6,6,40,{tackle:5})]});
  const t=play(s,{type:'wait'});
  assert.deepEqual(t.units.E.pos,{x:5,y:5});
});

test('4.1 敌人斜向攻击：斜向相邻就出手',()=>{
  const floor=rect(0,8,0,8);
  const s=world({floor,rooms:wholeRoom(floor),friends:[friend('A',1,1,20,{})],enemies:[foeOf('E','geodude',2,2,40,{tackle:5})]});
  const t=play(s,{type:'wait'});
  assert.deepEqual(t.units.E.pos,{x:2,y:2},'已经相邻，不再移动');
  assert.ok(t.units.A.hp<20,'敌人从斜向打到了 A');
});

test('4.1 敌人不会隔着墙角攻击，也不会斜穿墙角追击',()=>{
  const floor=without(rect(0,4,0,4),{x:2,y:1},{x:1,y:2});
  const s=world({floor,rooms:wholeRoom(floor),friends:[friend('A',1,1,20,{})],enemies:[foeOf('E','geodude',2,2,40,{tackle:5})]});
  const t=play(s,{type:'wait'});
  assert.equal(t.units.A.hp,20,'斜向被两侧墙角挡住，敌人打不到');
  const from={x:2,y:2},to=t.units.E.pos,reference=referenceDistances(floor,{x:1,y:1});
  assert.ok(legalStep(floor,from,to),`敌人走的是合法的一步：${key(to)}`);
  assert.equal(reference.get(key(to)),reference.get(key(from))-1,'这一步沿最短路靠近');
  assert.ok(!(to.x===1&&to.y===1));
});

test('4.1 敌人寻路：连走几轮都只走合法步，并且终于绕到队员身边',()=>{
  const floor=without(rect(0,6,0,6),{x:3,y:1},{x:3,y:2},{x:3,y:3},{x:3,y:4},{x:4,y:3});
  let s=world({floor,rooms:wholeRoom(floor),friends:[friend('A',1,2,500,{})],enemies:[foeOf('E','geodude',5,2,40,{tackle:5})]});
  const reference=referenceDistances(floor,{x:1,y:2});
  let position=s.units.E.pos,previous=reference.get(key(position));
  for(let n=0;n<12&&previous>1;n++){
    s=play(s,{type:'wait'});
    const next=s.units.E.pos;
    assert.ok(legalStep(floor,position,next),`第${n+1}轮的一步合法：${key(position)}→${key(next)}`);
    assert.equal(reference.get(key(next)),previous-1);
    position=next;previous=reference.get(key(next));
  }
  assert.ok(previous<=1,'敌人走到了 A 的近旁');
});

test('4.1 伙伴默认跟随主控也会斜向走',()=>{
  const floor=rect(0,8,0,8);
  const s=world({floor,rooms:wholeRoom(floor),friends:[friend('A',4,4,20,{}),friend('B',1,1,20,{})]});
  const t=play(s,{type:'wait'});
  assert.deepEqual(t.units.B.pos,{x:2,y:2});
});
