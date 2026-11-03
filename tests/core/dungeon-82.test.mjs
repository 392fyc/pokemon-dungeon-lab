import test from 'node:test';
import assert from 'node:assert/strict';
import {generateFloor} from '../../src/core/dungeon.ts';
import {applyCommand,createExpedition,createMain,reveal,currentlyVisible} from '../../src/core/engine.ts';
import {enemy,friend,world} from '../acceptance/fixtures.mjs';

const DIRS=[[1,0],[0,1],[-1,0],[0,-1]];
const key=p=>`${p.x},${p.y}`;
const manhattan=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const center=r=>({x:r.x+Math.floor(r.w/2),y:r.y+Math.floor(r.h/2)});
const contains=(r,p)=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h;
const insideBoss=(r,p)=>contains(r,p);

function flood(cells,start){
 const set=new Set(cells.map(key)),visited=new Set([key(start)]),queue=[start];
 for(let i=0;i<queue.length;i++)for(const [dx,dy] of DIRS){
  const p={x:queue[i].x+dx,y:queue[i].y+dy},k=key(p);
  if(set.has(k)&&!visited.has(k)){visited.add(k);queue.push(p);}
 }
 return visited;
}
function roomIndexAt(rooms,p){return rooms.findIndex(r=>contains(r,p));}
function distances(cells,start,blocked=new Set()){
 const set=new Set(cells.map(key)),dist=new Map([[key(start),0]]),queue=[start];
 for(let i=0;i<queue.length;i++)for(const [dx,dy] of DIRS){
  const p={x:queue[i].x+dx,y:queue[i].y+dy},k=key(p);
  if(set.has(k)&&!blocked.has(k)&&!dist.has(k)){dist.set(k,dist.get(key(queue[i]))+1);queue.push(p);}
 }
 return dist;
}
function separatedByThreeWalls(a,b){
 return a.x+a.w+3<=b.x||b.x+b.w+3<=a.x||a.y+a.h+3<=b.y||b.y+b.h+3<=a.y;
}
function hasFloor2x2(cell,floor){
 for(const x of [cell.x-1,cell.x])for(const y of [cell.y-1,cell.y]){
  if([[x,y],[x+1,y],[x,y+1],[x+1,y+1]].every(([cx,cy])=>floor.has(`${cx},${cy}`)))return true;
 }
 return false;
}
function fixedBossSpot(g){
 const r=g.rooms[g.bossRoom],c=center(r);
 const spots=new Map([
  ['17,11','center'],['31,11','east'],['17,19','south'],['4,11','west'],['17,4','north']
 ]);
 return spots.get(key(c))??null;
}
function assertTwoWideAndConnected(g,seed,level){
 const floor=new Set(g.floor.map(key));
 assert.equal(floor.size,g.floor.length,`seed ${seed} floor ${level}: no duplicate ground cells`);
 assert.ok(g.floor.every(p=>p.x>=1&&p.x<=34&&p.y>=1&&p.y<=22),`seed ${seed} floor ${level}: outer ring stays wall`);
 assert.equal(flood(g.floor,g.floor[0]).size,floor.size,`seed ${seed} floor ${level}: every ground cell connects`);
 for(const cell of g.floor){
  if(g.rooms.some(r=>contains(r,cell)))continue;
  assert.ok(hasFloor2x2(cell,floor),`seed ${seed} floor ${level}: corridor cell ${key(cell)} belongs to a 2x2 ground block`);
 }
}
function assertRoomLayout(g,seed,level){
 assert.ok(g.rooms.length>=9&&g.rooms.length<=12,`seed ${seed} floor ${level}: ${g.rooms.length} rooms`);
 for(const [i,r] of g.rooms.entries()){
  const boss=i===g.bossRoom;
  if(boss)assert.deepEqual([r.w,r.h],[7,7],`seed ${seed} floor ${level}: boss room is 7x7`);
  else assert.ok(r.w>=4&&r.w<=8&&r.h>=3&&r.h<=6,`seed ${seed} floor ${level}: ordinary room ${i} has planned dimensions`);
  assert.ok(r.x>=1&&r.y>=1&&r.x+r.w<=35&&r.y+r.h<=23,`seed ${seed} floor ${level}: room ${i} stays inside the outer wall`);
  for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)assert.ok(g.floor.some(p=>p.x===x&&p.y===y),`seed ${seed} floor ${level}: room ${i} is fully ground`);
  for(const other of g.rooms.slice(i+1))assert.ok(separatedByThreeWalls(r,other),`seed ${seed} floor ${level}: rooms keep three wall cells between them (8.5b)`);
 }
}
function assertArrivalAndStairs(g,seed,level){
 const floor=new Set(g.floor.map(key));
 const arrivalRoom=roomIndexAt(g.rooms,g.arrival);
 assert.notEqual(arrivalRoom,-1,`seed ${seed} floor ${level}: arrival is inside a room`);
 assert.deepEqual(center(g.rooms[arrivalRoom]),g.arrival,`seed ${seed} floor ${level}: arrival is at the room centre`);
 assert.ok(floor.has(key(g.arrival)),`seed ${seed} floor ${level}: arrival is walkable`);
 assert.equal(g.points.some(p=>p.kind==='exit'||p.kind==='up'),false,`seed ${seed} floor ${level}: no exit or upward stairs`);
 assert.equal(g.up,null,`seed ${seed} floor ${level}: up is absent`);
 const downs=g.points.filter(p=>p.kind==='down');
 if(level<3){
  assert.equal(downs.length,1,`seed ${seed} floor ${level}: exactly one down stair`);
  assert.deepEqual(g.down,downs[0].pos,`seed ${seed} floor ${level}: point and down property agree`);
  const route=distances(g.floor,g.arrival);
  assert.ok(route.has(key(g.down)),`seed ${seed} floor ${level}: down stair is reachable`);
  const farthest=g.rooms.map((r,i)=>({i,d:route.get(key(center(r)))})).sort((a,b)=>b.d-a.d||a.i-b.i)[0];
  assert.deepEqual(g.down,center(g.rooms[farthest.i]),`seed ${seed} floor ${level}: down stair is at the farthest room centre`);
 }else{
  assert.equal(downs.length,0,`seed ${seed} floor ${level}: no stairs on the boss floor`);
  assert.equal(g.down,null,`seed ${seed} floor ${level}: down property is absent`);
 }
 return arrivalRoom;
}
function assertBossRoom(g,seed){
 const r=g.rooms[g.bossRoom];
 assert.ok(Number.isInteger(g.bossRoom)&&g.bossRoom>=0&&g.bossRoom<g.rooms.length,`seed ${seed} floor 3: boss room index is valid`);
 assert.deepEqual([r.w,r.h],[7,7],`seed ${seed} floor 3: boss room is 7x7`);
 assert.ok(fixedBossSpot(g),`seed ${seed} floor 3: boss room is at a specified map position`);
 const boss=g.enemies.filter(e=>e.boss);
 assert.equal(boss.length,1,`seed ${seed} floor 3: exactly one boss`);
 assert.deepEqual(boss[0].pos,center(r),`seed ${seed} floor 3: boss stands in the room centre`);
 const floor=new Set(g.floor.map(key)),remaining=g.floor.filter(p=>!insideBoss(r,p));
 assert.equal(remaining.length,floor.size-49,`seed ${seed} floor 3: the 7x7 boss room is carved out`);
 assert.equal(flood(remaining,remaining[0]).size,remaining.length,`seed ${seed} floor 3: removing the boss room leaves one connected map`);
 const doors=[];
 for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)for(const [dx,dy] of DIRS){
  const inside={x,y},outside={x:x+dx,y:y+dy};
  if(!contains(r,outside)&&floor.has(key(outside)))doors.push({inside,outside,side:dx===1?'east':dx===-1?'west':dy===1?'south':'north'});
 }
 const doorCells=new Set(doors.map(d=>key(d.inside))),doorSeen=new Set();let segments=0;
 for(const start of doorCells){
  if(doorSeen.has(start))continue;segments++;doorSeen.add(start);
  const queue=[start];for(let i=0;i<queue.length;i++){
   const [x,y]=queue[i].split(',').map(Number);
   for(const [dx,dy] of DIRS){const next=`${x+dx},${y+dy}`;if(doorCells.has(next)&&!doorSeen.has(next)){doorSeen.add(next);queue.push(next);}}
  }
 }
 assert.equal(segments,1,`seed ${seed} floor 3: door cells form one 4-connected entrance segment`);
 assert.ok(doorCells.size>=2,`seed ${seed} floor 3: the entrance is at least two cells wide`);
 assert.ok(g.enemies.filter(e=>!e.boss).every(e=>!contains(r,e.pos)),`seed ${seed} floor 3: ordinary enemies stay out of the boss room`);
 assert.equal(g.points.filter(p=>p.kind==='item').length,1,`seed ${seed} floor 3: the target item remains present`);
 for(const p of [...g.points,...g.pickups,...g.services,...(g.rest?[g.rest]:[])])assert.ok(!contains(r,p.pos),`seed ${seed} floor 3: no point is in the boss room`);
 const route=distances(g.floor,boss[0].pos);
 const farthest=g.rooms.map((room,i)=>({i,d:route.get(key(center(room)))})).filter(x=>x.i!==g.bossRoom).sort((a,b)=>b.d-a.d||a.i-b.i)[0];
 assert.equal(roomIndexAt(g.rooms,g.arrival),farthest.i,`seed ${seed} floor 3: arrival room is farthest from the boss room`);
}
function assertEnemyPlacement(g,seed,level,arrivalRoom,relaxations){
 const normal=g.enemies.filter(e=>!e.boss),expectedIds='abcdef'.split('').map(c=>`w${level}${c}`);
 assert.equal(normal.length,6,`seed ${seed} floor ${level}: six ordinary enemies`);
 assert.deepEqual(normal.map(e=>e.id),expectedIds,`seed ${seed} floor ${level}: ordinary enemy IDs are stable`);
 assert.equal(g.enemies.length,level===3?7:6,`seed ${seed} floor ${level}: boss is additional on floor 3`);
 assert.equal(new Set(g.enemies.map(e=>key(e.pos))).size,g.enemies.length,`seed ${seed} floor ${level}: no enemy overlap`);
 const fixed=normal.filter(e=>e.post),wanderers=normal.filter(e=>!e.post);
 assert.equal(fixed.length,2,`seed ${seed} floor ${level}: two enemies have a fixed post`);
 assert.equal(wanderers.length,4,`seed ${seed} floor ${level}: four enemies roam`);
 const postRooms=new Set();
 for(const e of fixed){
  assert.deepEqual(e.pos,e.post,`seed ${seed} floor ${level}: fixed enemy starts at its post`);
  const room=roomIndexAt(g.rooms,e.post);
  assert.notEqual(room,-1,`seed ${seed} floor ${level}: fixed post is inside a room`);
  assert.notEqual(room,arrivalRoom,`seed ${seed} floor ${level}: fixed enemy is outside the arrival room`);
  assert.notEqual(room,level===3?g.bossRoom:-1,`seed ${seed} floor ${level}: fixed enemy is outside the boss room`);
  postRooms.add(room);
 }
 assert.equal(postRooms.size,2,`seed ${seed} floor ${level}: fixed enemies use different rooms`);
 const stairRoom=level<3?roomIndexAt(g.rooms,g.down):-1;
 assert.ok(!postRooms.has(stairRoom),`seed ${seed} floor ${level}: fixed enemies avoid the stair room`);
 for(const e of g.enemies)assert.notEqual(roomIndexAt(g.rooms,e.pos),arrivalRoom,`seed ${seed} floor ${level}: no enemy is in the arrival room`);

 // G3.1 measures the arrival distance along walkable cells, so compute it here
 // with an independent breadth-first search and compare the fallback against
 // still-free ordinary-room cells before each wanderer is placed.
 const route=distances(g.floor,g.arrival);
 // 8.3 hides G but retains its original placement exclusion anchor.
 const anchors=[...g.points.map(p=>p.pos),...(g.goalAnchor?[g.goalAnchor]:[])];
 const wanderingRooms=g.rooms.flatMap((room,i)=>i===arrivalRoom||i===g.bossRoom?[]:
  Array.from({length:room.h},(_,dy)=>Array.from({length:room.w},(_,dx)=>({x:room.x+dx,y:room.y+dy}))).flat());
 const occupied=new Set([...anchors.map(key),...fixed.map(e=>key(e.pos))]);
 for(const e of wanderers){
  const candidates=wanderingRooms.filter(p=>!occupied.has(key(p))&&anchors.every(a=>manhattan(a,p)>=2));
  const availableDistances=candidates.map(p=>route.get(key(p))).filter(Number.isInteger);
  const required=[6,4,2].find(min=>availableDistances.some(d=>d>=min));
  assert.ok(required!==undefined,`seed ${seed} floor ${level}: ${e.id} has at least one legal room cell at distance two or more`);
  const actual=route.get(key(e.pos));
  assert.ok(Number.isInteger(actual),`seed ${seed} floor ${level}: ${e.id} is reachable from arrival`);
  assert.ok(actual>=required,
   `seed ${seed} floor ${level}: ${e.id} is ${actual} steps from arrival; require ${required} because no remaining legal room cell supports the next higher distance tier`);
  relaxations.checked++;
  if(required<6){
   assert.ok(actual<6,`seed ${seed} floor ${level}: ${e.id} may relax below six only after every six-step cell is unavailable`);
   if(required===2)assert.ok(actual<4,`seed ${seed} floor ${level}: ${e.id} may relax below four only after every four-step cell is unavailable`);
   relaxations[`to${required}`]++;
  }
  occupied.add(key(e.pos));
 }
 return arrivalRoom;
}

test('8.2 T1-T5, T7 and T10: 200 fixed seeds cover all three independently checked floors',(t)=>{
 const relaxations={checked:0,to4:0,to2:0};
 for(let seed=1;seed<=200;seed++)for(let level=1;level<=3;level++){
  const g=generateFloor(seed,level);
  assert.equal(g.width,36,`seed ${seed} floor ${level}: width`);
  assert.equal(g.height,24,`seed ${seed} floor ${level}: height`);
  assertRoomLayout(g,seed,level);
  assertTwoWideAndConnected(g,seed,level);
  const arrivalRoom=assertArrivalAndStairs(g,seed,level);
  assertEnemyPlacement(g,seed,level,arrivalRoom,relaxations);
  if(level===3)assertBossRoom(g,seed);
  const downRoom=level<3?roomIndexAt(g.rooms,g.down):-1;
  assert.ok(g.rooms.some((r,i)=>i!==arrivalRoom&&i!==downRoom&&i!==g.bossRoom&&r.w>=6&&r.h>=5),`seed ${seed} floor ${level}: a large room remains for 8.3`);
 }
 t.diagnostic(`独立核验 ${relaxations.checked} 只游荡敌人；出生距离放宽 ${relaxations.to4} 次降至 4 格、${relaxations.to2} 次降至 2 格，均按剩余合法房间格重新计算可用距离。`);
});

test('8.2 T6: five pinned seeds each produce one specified boss-room position',()=>{
 const cases=[
  {seed:1,spot:'center'},
  {seed:4,spot:'east'},
  {seed:6,spot:'south'},
  {seed:16,spot:'west'},
  {seed:7,spot:'north'},
 ];
 assert.equal(cases.length,5,'five fixed seeds cover the centre and four map edges');
 for(const {seed,spot} of cases){
  const g=generateFloor(seed,3);
  assert.equal(fixedBossSpot(g),spot,`seed ${seed} produces the ${spot} boss room`);
  assertRoomLayout(g,seed,3);assertTwoWideAndConnected(g,seed,3);assertArrivalAndStairs(g,seed,3);assertBossRoom(g,seed);
 }
});

test('8.2 T9: the same seed and floor stay byte-for-byte stable and independent of access order',()=>{
 for(let seed=1;seed<=200;seed++){
  const expected=new Map([1,2,3].map(level=>[level,JSON.stringify(generateFloor(seed,level))]));
  for(const level of [3,2,1])assert.equal(JSON.stringify(generateFloor(seed,level)),expected.get(level),`seed ${seed} floor ${level}`);
 }
});

test('8.2 engine entry defaults to the 36x24 map and six ordinary enemies',()=>{
 const s=createExpedition('map-82-default',101);
 assert.deepEqual([s.dungeon.width,s.dungeon.height],[36,24]);
 assert.deepEqual(s.enemies,['w1a','w1b','w1c','w1d','w1e','w1f']);
 assert.equal(s.points.some(p=>p.kind==='exit'||p.kind==='up'),false);
});

function sightWorld({floor,at,rooms=[],width,height}){
 const units={A:friend('A',at.x,at.y)};
 const s=world(units,{floor,leader:'A',queue:['A'],enemies:[]});
 s.rooms=rooms;s.seen=[];s.dungeon={seed:1,width,height,floors:3,level:1,stored:{}};
 return s;
}
test('8.8 #166: corridor sight shows exactly nine cells, including diagonals through closed corners',()=>{
 const s=sightWorld({
  floor:[{x:5,y:5},{x:6,y:4},{x:4,y:6},{x:7,y:5},{x:5,y:7}],
  at:{x:5,y:5},width:14,height:11,
 });
 s.liquid=['6,5','7,4'];
 reveal(s);
 assert.deepEqual(s.seen,['4,6','5,5','6,4'],'diagonal ground is revealed despite blocked orthogonal steps');
 assert.deepEqual(s.seenWalls,['4,4','4,5','5,4','5,6','6,5','6,6'],'all adjacent walls and liquid are revealed; nothing two cells away is shown');
 s.units.A.pos={x:6,y:4};reveal(s);
 assert.deepEqual(s.seen,['4,6','5,5','6,4','7,5'],'exploring another patch preserves earlier ground memory');
 assert.deepEqual(s.seenWalls,['4,4','4,5','5,3','5,4','5,6','6,3','6,5','6,6','7,3','7,4'],'wall and liquid memory accumulate independently');
});

test('8.8 #166: the same corridor keeps four-cell rays only in fixed trial scenarios',()=>{
 const fixed=createMain('fixed-sight'),dungeon=structuredClone(fixed);
 dungeon.dungeon={seed:1,width:10,height:8,floors:3,level:1,stored:{}};
 dungeon.seen=[];dungeon.seenWalls=[];reveal(dungeon);
 assert.deepEqual(fixed.seen,['0,1','1,1','2,1','3,1','4,1','5,1','6,1']);
 assert.deepEqual(dungeon.seen,['0,1','1,1','2,1','3,1']);
});

test('8.8 #166: a corridor on the map edge does not reveal out-of-bounds cells',()=>{
 const s=sightWorld({floor:[{x:0,y:0},{x:1,y:1},{x:2,y:0}],at:{x:0,y:0},width:12,height:8});
 reveal(s);
 assert.deepEqual(s.seen,['0,0','1,1']);
 assert.deepEqual(s.seenWalls,['0,1','1,0']);
});

test('8.8 #166: player room sight covers the whole room plus its one-tile ring; AI sight stays unchanged',()=>{
 const floor=[];
 for(let y=2;y<=4;y++)for(let x=2;x<=5;x++)floor.push({x,y});
 for(let x=6;x<=10;x++)floor.push({x,y:3});
 const s=sightWorld({floor,at:{x:3,y:3},rooms:[{x:2,y:2,w:4,h:3}],width:14,height:11});
 s.liquid=['6,2','7,2'];reveal(s);
 const all=[],ground=new Set(floor.map(p=>p.x+','+p.y));
 for(let x=1;x<=6;x++)for(let y=1;y<=5;y++)all.push(x+','+y);
 assert.deepEqual(s.seen,all.filter(k=>ground.has(k)),'room ground and door-mouth ground are shown; no rays extend beyond the ring');
 assert.deepEqual(s.seenWalls,all.filter(k=>!ground.has(k)),'the entire ring of walls and liquid is shown, including its corners');
 assert.equal(currentlyVisible(s,{x:3,y:3},{x:5,y:4}),true,'all cells in the same room are currently visible');
 assert.equal(currentlyVisible(s,{x:3,y:3},{x:6,y:3}),true,'the room mouth is currently visible');
 assert.equal(currentlyVisible(s,{x:3,y:3},{x:7,y:3}),false,'current sight does not extend past the mouth');
 assert.equal(currentlyVisible(s,{x:8,y:3},{x:10,y:3}),true,'a corridor still shows two walkable steps');
 assert.equal(currentlyVisible(s,{x:8,y:3},{x:11,y:3}),false,'a corridor still hides cells beyond two steps');
});

function postWorld({friendAt,enemyAt,post,rooms=[],floor=Array.from({length:13},(_,x)=>({x,y:1}))}){
 const a=friend('A',friendAt.x,friendAt.y);a.tactic='wait';
 const e=enemy('E',enemyAt.x,enemyAt.y,40,'melee',4);e.learned=[];e.pp={};e.maxPp={};e.post={...post};e.targetMemory=null;e.lostSightTurns=0;
 const s=world({A:a,E:e},{floor,leader:'A',queue:['A'],enemies:['E']});s.rooms=rooms;s.enemyAiRng=0x12345678;
 return s;
}
function nextRound(s){
 const result=applyCommand(s,{type:'round',action:{type:'wait'}});
 assert.equal(result.ok,true,result.error);return result.state;
}

test('8.2 T8: a posted enemy without a target or memory waits at its post',()=>{
 const s=postWorld({friendAt:{x:11,y:1},enemyAt:{x:4,y:1},post:{x:4,y:1}});
 s.units.E.direction={x:1,y:0};
 const after=nextRound(s);
 assert.deepEqual(after.units.E.pos,{x:4,y:1});
 assert.deepEqual(after.units.E.post,{x:4,y:1});
 assert.equal(after.units.E.targetMemory,null);
});

test('8.2 T8: a posted enemy chases a visible opponent and remembers its cell',()=>{
 const s=postWorld({friendAt:{x:9,y:1},enemyAt:{x:4,y:1},post:{x:4,y:1},rooms:[{x:1,y:1,w:10,h:1}]});
 const after=nextRound(s);
 assert.deepEqual(after.units.E.pos,{x:5,y:1});
 assert.deepEqual(after.units.E.targetMemory,{x:9,y:1});
 assert.deepEqual(after.units.E.post,{x:4,y:1});
});

test('8.2 T8: after four unseen turns the enemy forgets the target and returns along the shortest path',()=>{
 let s=postWorld({friendAt:{x:9,y:1},enemyAt:{x:4,y:1},post:{x:4,y:1},rooms:[{x:1,y:1,w:10,h:1}]});
 s=nextRound(s);assert.deepEqual(s.units.E.pos,{x:5,y:1});assert.deepEqual(s.units.E.targetMemory,{x:9,y:1});
 s.units.A.pos={x:12,y:1};
 for(let i=0;i<4;i++)s=nextRound(s);
 assert.equal(s.units.E.targetMemory,null);assert.equal(s.units.E.lostSightTurns,0);
 assert.deepEqual(s.units.E.pos,{x:7,y:1},'on the forgetting turn it steps one cell toward post 4,1');
 for(const x of [6,5,4]){
  const before=Math.abs(s.units.E.pos.x-s.units.E.post.x);s=nextRound(s);
  assert.deepEqual(s.units.E.pos,{x,y:1});
  assert.ok(Math.abs(s.units.E.pos.x-s.units.E.post.x)<before,'each return step shortens the path');
 }
});

test('8.2 T8: after forgetting, a posted enemy walks the full shortest route through a fork and detour',()=>{
 const floor=[
  {x:3,y:3},{x:3,y:4},{x:2,y:4},{x:2,y:5},{x:3,y:5},{x:4,y:5},{x:5,y:5},{x:6,y:5},{x:7,y:5},{x:8,y:5},{x:8,y:4},{x:8,y:3},
  {x:4,y:3},{x:4,y:2},{x:3,y:2},{x:2,y:2},{x:2,y:1},{x:2,y:0},{x:3,y:0},{x:4,y:0},{x:5,y:0},{x:5,y:1},{x:6,y:1},{x:7,y:1},{x:8,y:1},{x:8,y:2},
  {x:9,y:3},{x:10,y:3},{x:11,y:3},{x:12,y:3},{x:12,y:4},
 ];
 const start={x:3,y:3},post={x:8,y:3},shortStep={x:3,y:4},temptingStep={x:4,y:3};
 const fromStart=distances(floor,start),toPost=distances(floor,post);
 const afterFirstStep=distances(floor,post,new Set([key(start)]));
 assert.equal(fromStart.get(key(post)),9,'the route around the lower branch is nine steps');
 assert.equal(toPost.get(key(shortStep)),8,'the downward first step is on the shortest route');
 assert.equal(afterFirstStep.get(key(temptingStep)),14,'with the occupied starting cell blocked, the open right turn leads through a longer detour');
 assert.ok(manhattan(temptingStep,post)<manhattan(shortStep,post),'a greedy Manhattan step would choose the longer right turn');

 let s=postWorld({friendAt:{x:12,y:4},enemyAt:start,post,floor});
 s.units.E.targetMemory={x:12,y:4};s.units.E.lostSightTurns=3;
 for(let turn=0;turn<fromStart.get(key(post));turn++){
  const before=toPost.get(key(s.units.E.pos));
  assert.equal(currentlyVisible(s,s.units.E.pos,s.units.A.pos),false,`turn ${turn+1}: the player at 12,4 stays unseen`);
  const after=nextRound(s),afterDistance=toPost.get(key(after.units.E.pos));
  assert.equal(afterDistance,before-1,`turn ${turn+1}: the enemy reduces its independently measured distance to post by one`);
  if(turn===0){
   assert.equal(after.units.E.targetMemory,null,'the fourth unseen turn clears the remembered target');
   assert.equal(after.units.E.lostSightTurns,0);
   assert.deepEqual(after.units.E.pos,shortStep,'the enemy takes the downward first step, not the tempting right turn');
  }
  assert.equal(currentlyVisible(after,after.units.E.pos,after.units.A.pos),false,`turn ${turn+1}: returning does not reveal the player`);
  s=after;
 }
 assert.deepEqual(s.units.E.pos,post,'after nine shortest-path steps, the enemy reaches its post');
 assert.deepEqual(s.units.E.post,post);
});
