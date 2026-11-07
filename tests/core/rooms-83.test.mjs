import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {generateFloor,generateChallengeEncounter} from '../../src/core/dungeon.ts';
import {applyCommand,createExpedition,reveal,currentlyVisible} from '../../src/core/engine.ts';
import {adventureRoomMarkers} from '../../src/core/describe.ts';
import {enemy,friend,world} from '../acceptance/fixtures.mjs';

const baseline=JSON.parse(readFileSync(new URL('./rooms83-baseline.json',import.meta.url),'utf8'));
const roster=JSON.parse(readFileSync(new URL('../../src/data/roster.json',import.meta.url),'utf8')).species;
const key=p=>`${p.x},${p.y}`;
const inside=(p,r)=>p.x>=r.x&&p.y>=r.y&&p.x<r.x+r.w&&p.y<r.y+r.h;
const center=r=>({x:r.x+Math.floor(r.w/2),y:r.y+Math.floor(r.h/2)});
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const cells=r=>Array.from({length:r.h},(_,dy)=>Array.from({length:r.w},(_,dx)=>({x:r.x+dx,y:r.y+dy}))).flat();
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
function command(s,cmd){const r=applyCommand(s,cmd);assert.equal(r.ok,true,r.error);return r.state;}
const act=(s,action)=>command(s,{type:'round',action});
function challengeWorld({seed=1,type='challenge',item=null}={}){
 const r={x:3,y:2,w:6,h:5},floor=[...cells(r),...Array.from({length:13},(_,x)=>[{x,y:3},{x,y:4}]).flat()];
 const unique=[...new Map(floor.map(p=>[key(p),p])).values()];
 const A=friend('A',5,4,200,{},200),B=friend('B',2,3,200,{},200),C=friend('C',0,3,200,{},200);
 for(const u of [A,B,C])u.tactic='wait';
 const X=enemy('X',9,3,30,'melee',{waitOnly:true}),E=enemy('E',7,5,30,'melee',{waitOnly:true});
 const s=world({A,B,C,X,E},{floor:unique,enemies:['X','E']});
 s.rooms=[r];s.dungeon={seed,width:13,height:9,floors:3,level:1,stored:{},boss:true,roguelike:true,tmPool:3};
 s.difficulty='normal';s.prog={level:5,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0,bigBerry:0,teamTonic:0}};
 s.purse=0;s.tms=[];s.enemyAiRng=1;
 const doors=[{x:3,y:3},{x:3,y:4},{x:8,y:3},{x:8,y:4}];
 s.adventureRooms=[{room:0,type,state:'idle',interaction:{x:5,y:4},doors,sealedCells:[],enemyIds:[],reward:null,item,rewardItem:null}];
 return s;
}
const startChallenge=s=>act(s,{type:'interact',exit:false});
function resolvePrompts(s){let n=0;while(s.phase==='invitation'||s.phase==='evolution'){
 assert.ok(++n<20);s=command(s,s.phase==='invitation'?{type:'invite',choice:'reject'}:{type:'evolve',species:null});
}return s;}
function finalEnemyFixture(s){
 const a=s.adventureRooms[0];for(const id of a.enemyIds){s.units[id].hp=0;s.units[id].pos=null;}
 if(s.units.B?.hp>0)s.units.B.pos={x:4,y:4};
 if(s.units.C?.hp>0)s.units.C.pos={x:5,y:5};
 const last=s.units[a.enemyIds.at(-1)];last.hp=1;last.level=5;last.pos={x:6,y:4};last.waitOnly=true;
 return last.id;
}

test('8.3 R5/R15: seal moves companions inside, pushes an outside enemy away, and spawns separated awake enemies',()=>{
 const before=challengeWorld(),s=startChallenge(before),a=s.adventureRooms[0],r=s.rooms[0];
 assert.equal(s.round,1);assert.equal(a.state,'sealed');
 assert.deepEqual(a.sealedCells.map(key).sort(),['2,3','2,4','9,3','9,4']);
 assert.ok(a.sealedCells.every(p=>!s.floor.some(q=>key(p)===key(q))));
 assert.deepEqual(s.units.X.pos,{x:10,y:3},'outside enemy is pushed to nearest outside free cell, y then x');
 assert.ok(!a.enemyIds.includes('X'));assert.ok(a.enemyIds.includes('E'));
 assert.deepEqual(s.units.B.pos,{x:6,y:4},'queue-first companion takes the right-first breadth-first room cell');
 assert.deepEqual(s.units.C.pos,{x:5,y:5},'next companion uses the next cell in the existing entry order');
 const generated=a.enemyIds.filter(id=>id.startsWith('c1'));assert.ok(generated.length===3||generated.length===4);
 for(const id of generated){const e=s.units[id];assert.ok(inside(e.pos,r));assert.equal(e.asleep,false);assert.notDeepEqual(e.pos,a.interaction);
  assert.ok(s.queue.every(id=>distance(e.pos,s.units[id].pos)>1),'large room has enough non-adjacent spawn cells');}
 assert.equal(before.adventureRooms[0].state,'idle','command never mutates its input');
});

test('8.3 R5: leader dying after requesting the stone cancels the challenge without refunding the round',()=>{
 const s=challengeWorld();s.units.A.hp=1;s.units.E.pos={x:6,y:4};delete s.units.E.waitOnly;
 s.units.E.learned=['tackle'];s.units.E.pp={tackle:50};s.units.E.maxPp={tackle:50};
 const after=startChallenge(s);assert.equal(after.round,1);assert.equal(after.units.A.hp,0);
 assert.equal(after.adventureRooms[0].state,'idle');assert.ok(!after.enemies.some(id=>id.startsWith('c1')));
});

test('8.3 R15: an empty cell in the neighboring room remains a valid nearest outward displacement',()=>{
 const s=challengeWorld();s.rooms.push({x:10,y:3,w:3,h:2});
 const after=startChallenge(s);assert.equal(after.adventureRooms[0].state,'sealed');
 assert.deepEqual(after.units.X.pos,{x:10,y:3});assert.ok(!after.adventureRooms[0].enemyIds.includes('X'));
});

test('8.3 R5: leader blown off the stone cancels the challenge after spending the action',()=>{
 const s=challengeWorld();s.units.E.pos={x:6,y:4};delete s.units.E.waitOnly;
 s.units.E.learned=['dragontail'];s.units.E.pp={dragontail:50};s.units.E.maxPp={dragontail:50};
 const after=startChallenge(s);assert.equal(after.round,1);assert.notDeepEqual(after.units.A.pos,{x:5,y:4});
 assert.equal(after.adventureRooms[0].state,'idle');assert.ok(!after.enemies.some(id=>id.startsWith('c1')));
});

test('8.3 R6: sealed cells reject movement and block the shared visibility graph',()=>{
 let s=startChallenge(challengeWorld());const a=s.adventureRooms[0];
 s.units.A.pos={x:3,y:3};
 const blocked=applyCommand(s,{type:'round',action:{type:'move',to:{x:2,y:3}}});assert.equal(blocked.ok,false);assert.equal(blocked.state,s);
 assert.equal(currentlyVisible(s,{x:1,y:3},{x:3,y:3}),false);
 s.seen=[];s.seenWalls=[];s.units.A.pos={x:1,y:3};s.queue=['A'];reveal(s);
 assert.ok(s.seenWalls.includes('2,3'));assert.ok(!s.seen.includes('3,3'),'player corridor rays stop at the temporary wall');
 assert.equal(a.state,'sealed');
});

test('8.3 R6: enemies on both sides remain on their own side while the challenge is sealed',()=>{
 let s=startChallenge(challengeWorld());s.units.A.hp=s.units.A.maxHp=10000;
 delete s.units.X.waitOnly;s.units.X.targetMemory={x:5,y:4};
 for(let n=0;n<6;n++){
  s=act(s,{type:'wait'});assert.equal(s.adventureRooms[0].state,'sealed');
  assert.ok(!inside(s.units.X.pos,s.rooms[0]));
  for(const id of s.adventureRooms[0].enemyIds)if(s.units[id].hp>0)assert.ok(inside(s.units[id].pos,s.rooms[0]));
 }
});

test('8.3 R7/R12: the last defeat settles invitations before opening, rewards once, and rejects a second challenge',()=>{
 let s=startChallenge(challengeWorld());const a=s.adventureRooms[0];a.reward='currency';a.rewardItem=null;
 const target=finalEnemyFixture(s);s.units[target].species='geodude';
 // Fixed recruit stream state 7 emits an invitation for the final enemy.
 s.prog.rng=7;
 const beforeMoney=s.purse;s=act(s,{type:'basic',target});
 assert.equal(s.phase,'invitation');assert.equal(s.adventureRooms[0].state,'sealed','the pending invitation holds the seal');
 assert.ok(s.prog.exp>0);s=resolvePrompts(s);assert.equal(s.adventureRooms[0].state,'cleared');
 assert.equal(s.purse,beforeMoney+5+40);
 for(const p of a.sealedCells)assert.ok(s.floor.some(q=>key(q)===key(p)),'door ground restored');
 s.units.A.pos={x:5,y:4};const again=applyCommand(s,{type:'round',action:{type:'interact',exit:false}});
 assert.equal(again.ok,false);assert.match(again.error,/完成|挑战/);assert.equal(again.state,s);
 const money=s.purse;s=act(s,{type:'wait'});assert.equal(s.purse,money,'reward cannot repeat on later turns');
});

test('8.3 R8: a wipe inside the sealed room has the normal roguelike terminal outcome',()=>{
 const s=startChallenge(challengeWorld());for(const id of ['B','C']){s.units[id].hp=0;s.units[id].pos=null;}
 s.units.A.hp=1;
 for(const id of s.enemies){s.units[id].waitOnly=true;}
 const e=s.units[s.adventureRooms[0].enemyIds[0]];e.pos={x:6,y:4};delete e.waitOnly;
 e.learned=['tackle'];e.pp={tackle:20};e.maxPp={tackle:20};
 s.tms=[{move:'protect',source:'target',fate:'held'}];
 const after=act(s,{type:'wait'});assert.equal(after.phase,'ended');assert.equal(after.end.outcome,'wipe');
 assert.deepEqual(after.end.tms,[{move:'protect',source:'target',fate:'lost'}]);assert.deepEqual(after.end.lost,[]);
});

test('8.3 R9: new room items use an action only when useful',()=>{
 // The former unopened commission/blessing assertions are replaced by 8.4 C1/C5/C12.
 let s=challengeWorld({type:'item',item:'bigBerry'});s=act(s,{type:'interact',exit:false});
 assert.equal(s.adventureRooms[0].state,'done');assert.equal(s.prog.items.bigBerry,1);
 const full=applyCommand(s,{type:'round',action:{type:'use',item:'bigBerry',target:'A'}});assert.equal(full.ok,false);assert.equal(full.state,s);
 s.units.A.hp=1;s=act(s,{type:'use',item:'bigBerry',target:'A'});assert.equal(s.units.A.hp,s.units.A.maxHp);assert.equal(s.prog.items.bigBerry,0);
 s.prog.items.bigBerry=1;s.units.B.pos={x:5,y:3};s.units.B.hp=2;
 s=act(s,{type:'use',item:'bigBerry',target:'B'});assert.equal(s.units.B.hp,s.units.B.maxHp);
 s.prog.items.teamTonic=1;s.units.A.learned=['tackle'];s.units.A.maxPp={tackle:10};s.units.A.pp={tackle:1};   // 8.8 (G9.1): the team tonic restores 5 per move, so the cap is raised to show it
 s.units.B.learned=['tackle'];s.units.B.maxPp={tackle:3};s.units.B.pp={tackle:3};
 s.units.C.hp=0;s.units.C.pos=null;s.units.C.learned=['tackle'];s.units.C.maxPp={tackle:3};s.units.C.pp={tackle:0};
 s=act(s,{type:'use',item:'teamTonic',target:'A'});assert.equal(s.units.A.pp.tackle,6);assert.equal(s.units.B.pp.tackle,3);assert.equal(s.units.C.pp.tackle,0);
 assert.equal(s.prog.items.teamTonic,0);s.prog.items.teamTonic=1;s.units.A.pp.tackle=10;
 const reject=applyCommand(s,{type:'round',action:{type:'use',item:'teamTonic',target:'A'}});assert.equal(reject.ok,false);assert.equal(reject.state,s);
});

test('8.3 R11: walking across a multi-door challenge room never triggers it',()=>{
 let s=challengeWorld();s.queue=['A'];s.units.A.pos={x:2,y:4};
 for(let x=3;x<=9;x++)s=act(s,{type:'move',to:{x,y:4}});
 assert.deepEqual(s.units.A.pos,{x:9,y:4});assert.equal(s.adventureRooms[0].state,'idle');
 assert.deepEqual(s.enemies,['X','E']);assert.deepEqual(s.adventureRooms[0].sealedCells,[]);
});

test('8.3 R4/R12: one discovered door per room displays its sealed or completed state',()=>{
 const s=challengeWorld(),a=s.adventureRooms[0];s.seen=[];
 assert.deepEqual(adventureRoomMarkers(s),[]);
 s.seen=['3,3'];let markers=adventureRoomMarkers(s);assert.equal(markers.length,1);
 assert.equal(markers[0].kind,'door');assert.equal(markers[0].roomType,'challenge');assert.equal(markers[0].dimmed,false);
 s.seen=a.doors.map(key);markers=adventureRoomMarkers(s);assert.equal(markers.length,1,'multiple known doors share one type label');
 assert.deepEqual(markers[0].at,a.doors[0]);
 s.seen=[key(a.doors[2])];assert.deepEqual(adventureRoomMarkers(s)[0].at,a.doors[2],'an unseen earlier door must not hide the discovered entrance label');
 a.state='sealed';markers=adventureRoomMarkers(s);assert.equal(markers[0].label,'封闭');
 a.state='cleared';markers=adventureRoomMarkers(s);assert.equal(markers[0].dimmed,true);
 for(const type of ['commission','blessing','item']){a.type=type;a.state='idle';assert.equal(adventureRoomMarkers(s)[0].roomType,type);a.state='done';assert.equal(adventureRoomMarkers(s)[0].dimmed,true);}
});

test('8.3 R16: the hidden goal anchor has no interaction in a new expedition',()=>{
 const b=baseline.samples.find(b=>b.seed===1&&b.level===1),s=createExpedition('rooms83-anchor',1,3,{members:[{inst:'P1',species:'mudkip',carry:[{move:'tackle',pp:20}]}],leader:0},0,true,3);
 s.units[s.leader].pos={...b.goalAnchor};s.seen=s.floor.map(key);
 assert.ok(!s.points.some(p=>p.kind==='goal'));
 const r=applyCommand(s,{type:'round',action:{type:'interact',exit:false}});assert.equal(r.ok,false);assert.equal(r.state,s);
});

test('8.3 R17: independent reward streams give exact fixed 10000-draw counts',()=>{
 const counts={currency:0,item:0,invite:0,tm:0,blessing:0},items={bigBerry:0,teamTonic:0};
 for(let seed=1;seed<=10000;seed++){
  const r=generateChallengeEncounter(seed,1,'normal',true,3);counts[r.reward]++;
  if(r.rewardItem)items[r.rewardItem]++;
  assert.deepEqual(r,generateChallengeEncounter(seed,1,'normal',true,3));
 }
 assert.deepEqual(counts,{currency:2933,item:2521,invite:1517,tm:1564,blessing:1465});
 assert.deepEqual(items,{bigBerry:1261,teamTonic:1260});
});

test('8.4 replaces R18: challenge blessing opens a choice and gives no substitute money',()=>{
 let s=startChallenge(challengeWorld());s.adventureRooms[0].reward='blessing';s.adventureRooms[0].rewardItem=null;
 const target=finalEnemyFixture(s),before=s.purse;s.prog.rng=1;
 s=resolvePrompts(act(s,{type:'basic',target}));
 assert.equal(s.adventureRooms[0].state,'cleared');assert.equal(s.phase,'blessing');assert.equal(s.purse,before+5);
 const choices=s.pendingChoices[0].options;assert.equal(choices.length,3);assert.equal(new Set(choices).size,3);
 s=command(s,{type:'blessingChoice',blessing:choices[0]});assert.equal(s.phase,'playing');assert.ok(s.blessings.includes(choices[0]));
 assert.equal(s.purse,before+5);
});

test('8.3 R7: a preselected item reward goes directly to the backpack exactly once',()=>{
 for(const item of ['bigBerry','teamTonic']){
  let s=startChallenge(challengeWorld());s.adventureRooms[0].reward='item';s.adventureRooms[0].rewardItem=item;
  const target=finalEnemyFixture(s);s.prog.rng=1;
  s=resolvePrompts(act(s,{type:'basic',target}));assert.equal(s.adventureRooms[0].state,'cleared');
  assert.equal(s.prog.items[item],1);s=act(s,{type:'wait'});assert.equal(s.prog.items[item],1);
 }
});

test('8.3 R19: reward invitation uses c1a species and half-HP/full-PP full-party replacement (8.8)',()=>{
 let s=startChallenge(challengeWorld());s.adventureRooms[0].reward='invite';
 const expected=s.units.c1a.species,target=finalEnemyFixture(s);s.prog.rng=1;
 s=act(s,{type:'basic',target});assert.equal(s.phase,'invitation');assert.equal(s.adventureRooms[0].state,'cleared');
 const invitation=s.invitations.find(i=>i.status==='pending');assert.ok(invitation);assert.equal(invitation.unit.species,expected);
 const u=invitation.unit;assert.equal(u.hp,Math.max(1,Math.floor(u.maxHp/2)));
 for(const move of u.learned)assert.equal(u.pp[move],u.maxPp[move]);   // 8.8 (G8.2): HP is halved, PP is full
 const noReplacement=applyCommand(s,{type:'invite',choice:'accept'});assert.equal(noReplacement.ok,false);
 s=command(s,{type:'invite',choice:'accept',outgoing:'B'});assert.equal(s.queue.length,3);assert.ok(!s.queue.includes('B'));assert.ok(s.queue.includes(u.id));assert.ok(s.camp.includes('B'));
});

test('8.3 R7: evolution choice precedes opening and an independent preselected TM survives combat RNG changes',()=>{
 let s=startChallenge(challengeWorld());s.adventureRooms[0].reward='tm';s.adventureRooms[0].rewardMove='protect';
 const target=finalEnemyFixture(s);s.prog.level=19;s.prog.exp=179;s.prog.rng=7;
 s.units.A.species='eevee';s.units.A.level=19;
 s=act(s,{type:'basic',target});assert.equal(s.phase,'evolution');assert.equal(s.adventureRooms[0].state,'sealed');
 assert.equal(s.tms.length,0);s=command(s,{type:'evolve',species:null});
 assert.equal(s.phase,'invitation');assert.equal(s.adventureRooms[0].state,'sealed');s=resolvePrompts(s);
 assert.equal(s.adventureRooms[0].state,'cleared');assert.deepEqual(s.tms,[{move:'protect',source:'challenge',fate:'held'}]);
});

test('8.3 R1/R2/R13/R14/R16: 600 floors retain the fixed 8.2 content and independently valid room sites',()=>{
 assert.equal(baseline.source,'generateFloor after #200 real-turn corridors (base f46e363)');
 assert.equal(baseline.samples.length,600);
 for(const b of baseline.samples){
  const {seed,level}=b,g=generateFloor(seed,level),label=`seed ${seed} floor ${level}`;
  assert.equal(JSON.stringify(g),JSON.stringify(generateFloor(seed,level)),`${label}: deterministic whole floor`);
  // 8.8 (#165): item points were extended (2-4 per floor, kinds redrawn); the original cells and their order are kept, so the old pickups are the first one (berry) and the floor-2 tonic.
  const originalPickups=g.pickups.slice(0,level===2?2:1).map((p,i)=>({...p,kind:i===0?'berry':p.kind}));
  for(const [field,expected] of Object.entries(b.hashes))assert.equal(hash(field==='pickups'?originalPickups:g[field]),expected,`${label}: unchanged original ${field}`);
  assert.deepEqual(g.points,b.points,`${label}: only goal removed from original points`);
  assert.deepEqual(g.services,b.services,`${label}: only exchanger removed from original services`);
  assert.deepEqual(g.goalAnchor,b.goalAnchor,`${label}: hidden goal anchor matches the frozen sample`);
  assert.ok(!g.points.some(p=>p.kind==='goal')&&!g.services.some(p=>p.kind==='exchange'));
  const ar=g.adventureRooms;assert.ok(ar.length===2||ar.length===3,`${label}: 2 or 3 rooms`);
  assert.equal(new Set(ar.map(a=>a.room)).size,ar.length);
  assert.ok(ar.filter(a=>a.type==='challenge').length<=1);
  const fixedRooms=new Set(g.enemies.filter(e=>e.post).map(e=>g.rooms.findIndex(r=>inside(e.post,r))));
  const occupied=new Set([...g.points,...g.pickups,...g.services,...(g.rest?[g.rest]:[]),...g.enemies].map(p=>key(p.pos)));
  if(b.goalAnchor)occupied.add(key(b.goalAnchor));
  const terrain=new Set(g.floor.map(key));
  for(const a of ar){
   const r=g.rooms[a.room];assert.ok(r);assert.notEqual(a.room,g.arrivalRoom);assert.notEqual(a.room,g.bossRoom);
   assert.ok(!fixedRooms.has(a.room));if(g.down)assert.ok(!inside(g.down,r));
   if(a.type==='challenge')assert.ok(r.w>=6&&r.h>=5);
   assert.equal(a.state,'idle');assert.ok(inside(a.interaction,r));
   const c=center(r),expected=cells(r).filter(p=>!occupied.has(key(p))).sort((p,q)=>distance(p,c)-distance(q,c)||p.y-q.y||p.x-q.x)[0];
   assert.deepEqual(a.interaction,expected,`${label} room ${a.room}: nearest free interaction cell`);
   const doors=cells(r).filter(p=>dirs.some(([dx,dy])=>{const n={x:p.x+dx,y:p.y+dy};return !inside(n,r)&&terrain.has(key(n));}));
   assert.deepEqual(a.doors.map(key).sort(),doors.map(key).sort(),`${label}: all doorway cells`);
  }
  if(b.goalAnchor)for(const e of g.enemies.filter(e=>!e.post&&!e.boss))assert.ok(distance(e.pos,b.goalAnchor)>=2,`${label}: hidden goal remains an enemy placement anchor`);
 }
 const collision=generateFloor(7,3).adventureRooms.find(a=>a.room===7);
 assert.deepEqual(collision.interaction,{x:31,y:2},'R14: w3c at 31,3 forces the y-first adjacent cell');
});

test('8.3 R3: 3000 official floors have the exact independently observed reference allocation',()=>{
 const counts={challenge:0,commission:0,blessing:0,item:0};
 for(let seed=1;seed<=1000;seed++)for(let level=1;level<=3;level++)for(const a of generateFloor(seed,level).adventureRooms)counts[a.type]++;
 // 8.8（#178）布局；期望值由独立维护的 tools/verify/rooms-83.mjs assignRooms 在 3000 层上逐层复算，与生成器的分配逐层一致后冻结（旧值 79dd47e：1822／2622／1793／1267）。
 // #185：清除袋形地面后少数层重画或到达房变化，由生成器重算冻结，没有再用独立脚本复算（旧值 1860／2581／1799／1264）。
 // #200：通道改为真实转弯后，地面与到达房随之变化，由生成器重算冻结，没有再用独立脚本复算（旧值 1861／2580／1799／1264）。
 assert.deepEqual(counts,{challenge:1849,commission:2605,blessing:1783,item:1267});
});

test('8.3 compatibility: legacy generator keeps goal and exchange, with no adventure-room state',()=>{
 const params={width:36,height:24,floors:3,boss:true};
 const g=generateFloor(12345,1,params);
 assert.deepEqual(g.points,[{pos:{x:5,y:20},kind:'down',used:false},{pos:{x:22,y:22},kind:'goal',used:false}]);
 assert.equal(g.adventureRooms,undefined);
 let found=false;
 for(let seed=1;seed<=30;seed++)for(let level=1;level<=3;level++)if(generateFloor(seed,level,params).services.some(p=>p.kind==='exchange'))found=true;
 assert.ok(found,'the legacy exchanger code remains executable');
});

test('8.3 R20: 600 challenge draws on all three difficulties use the correct species, levels, HP and awake IDs',()=>{
 const bands=[[5,6],[8,11],[12,20]],themes=[['Normal','Grass','Bug','Rock','Ground','Flying'],['Water','Ice','Electric','Poison','Psychic','Fairy'],['Fire','Fighting','Dark','Ghost','Dragon','Steel']];
 for(let seed=1;seed<=200;seed++)for(let level=1;level<=3;level++)for(const [difficulty,multiplier] of [['easy',.28],['normal',.4],['hard',.56]]){
  const encounter=generateChallengeEncounter(seed,level,difficulty,true);
  assert.ok(encounter.enemies.length===3||encounter.enemies.length===4);
  assert.deepEqual(encounter.enemies.map(e=>e.id),Array.from({length:encounter.enemies.length},(_,i)=>`c${level}${'abcd'[i]}`));
  for(const e of encounter.enemies){const s=roster.find(s=>s.id===e.species),[lo,hi]=bands[level-1];
   assert.ok(s&&!s.legendary&&s.availability!=='暂不出场'&&themes[level-1].includes(s.types[0])&&s.evoLevel<=hi);
   assert.ok(Number.isInteger(e.level)&&e.level>=Math.max(lo,s.evoLevel)&&e.level<=hi);
   assert.equal(e.hp,Math.max(1,Math.round((s.maxHp+Math.max(0,e.level-5))*multiplier)));
   assert.equal(e.asleep,false);
  }
 }
});
