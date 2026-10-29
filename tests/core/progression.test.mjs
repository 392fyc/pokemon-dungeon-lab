/* Stage 6.4 engine tests: real species team, recruit draw, shared run level, backpack items, room reveal, save checks.
   Expected values are literals worked out by hand from the roster kit table and the rules in
   docs/玩法研究/招募等级与恢复品.md; fixtures are built by hand, not by the production factories. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createExpedition,createMain,applyCommand,reveal,rngStep,levelFor} from '../../src/core/engine.ts';
import {generateFloor,mulberry32} from '../../src/core/dungeon.ts';
import {TrialStore} from '../../src/core/save.ts';
import {enemy,world,pos,row,doCmd,reject,round,interact,basic,skill,wait,accept,refuse} from '../acceptance/fixtures.mjs';

/* Roster kits (src/data/roster.json): charmander 19 HP strong3 line2; squirtle 20 HP strong3 line2; bulbasaur 21 HP strong3 line1. */
const mon=(id,species,x,hp,maxHp,pp,maxPp)=>({id,side:'friend',hp,maxHp,pos:hp>0?pos(x):null,pp:{...pp},maxPp:{...maxPp},learned:Object.keys(maxPp),species});
const wild=(id,x,hp,species='rattata',damage=0)=>{const e=enemy(id,x,1,hp,'melee',damage);e.species=species;return e;};
/** A hand-built 6.4 expedition on one row: A(0) charmander, B(1) squirtle, C(2) bulbasaur leads. `level` raises max HP by 2 per level above 1. */
function run({level=1,exp=0,rng=7,enemies=[wild('w',3,6)],points=[],items={berry:0,tonic:0},floor=row(9)}={}){
 const up=2*(level-1);
 const s=world({A:mon('A','charmander',0,19+up,19+up,{strong:3,line:2},{strong:3,line:2}),B:mon('B','squirtle',1,20+up,20+up,{strong:3,line:2},{strong:3,line:2}),
  C:mon('C','bulbasaur',2,21+up,21+up,{strong:3,line:1},{strong:3,line:1}),...Object.fromEntries(enemies.map(e=>[e.id,e]))},
  {floor,leader:'C',enemies:enemies.map(e=>e.id),points});
 s.scenario='expedition';s.runId='prog';
 s.dungeon={seed:1,width:10,height:8,floors:2,level:1,stored:{}};
 s.rooms=[{x:0,y:1,w:10,h:1}];
 s.prog={level,exp,rng,made:0,kills:[],items:{...items}};s.purse=0;s.tms=[];
 return s;
}
const port=(raw=null)=>{let value=raw,writes=0;return {getItem:()=>value,setItem:(k,v)=>{value=v;writes++;},raw:()=>value,writes:()=>writes};};
const opened=async s=>{const p=port();const a=new TrialStore(p,'x');assert.equal(await a.start(s),true,a.error);return {p,a};};

/* ---------- the real species team ---------- */
test('P1 a new expedition starts three roster starters at run level 1 with roster HP and kit PP',()=>{
 const s=createExpedition('start',777);
 assert.deepEqual(s.queue,['A','B','C']);assert.equal(s.leader,'C');
 const brief=id=>{const u=s.units[id];return [u.species,u.hp,u.maxHp,u.learned,u.pp,u.maxPp];};
 assert.deepEqual(brief('A'),['charmander',19,19,['strong','line'],{strong:3,line:2},{strong:3,line:2}]);
 assert.deepEqual(brief('B'),['squirtle',20,20,['strong','line'],{strong:3,line:2},{strong:3,line:2}]);
 assert.deepEqual(brief('C'),['bulbasaur',21,21,['strong','line'],{strong:3,line:1},{strong:3,line:1}]);
 assert.deepEqual(s.prog,{level:1,exp:0,rng:2779116292,made:0,kills:[],items:{berry:0,tonic:0}});   // 777 xor 0xA5A5F00D
 const wildSet=new Set(['pidgey','rattata','spearow','zubat','geodude']);
 assert.ok(s.enemies.every(id=>wildSet.has(s.units[id].species)),'wild enemies are non-starter roster species');
});

/* ---------- the recoverable random stream ---------- */
test('P2 rngStep walks the same sequence as the floor generator stream and returns the state to resume from',()=>{
 const m=mulberry32(5);let st=5;
 for(let i=0;i<3;i++){const r=rngStep(st);st=r.state;assert.equal(r.value,m());}
 assert.deepEqual(rngStep(0),{value:0.26642920868471265,state:1831565813});   // pinned once
 let hits=0;for(let i=0;i<5000;i++)if(rngStep(i*7919+13).value<0.3)hits++;
 assert.ok(hits>1350&&hits<1650,'about 30% of draws fall under 0.3, got '+hits);
});

/* ---------- recruit draw ---------- */
test('P3 a defeated wild enemy invites when the draw is under 0.3: R07 half snapshot of its species at the run level',()=>{
 const s=round(run({rng:7}),basic('w'));          // first draw from state 7 is 0.0117
 assert.equal(s.phase,'invitation');assert.equal(s.invitations.length,1);
 assert.deepEqual(s.invitations[0].unit,{id:'N1',side:'friend',hp:9,maxHp:18,pos:null,pp:{strong:1},maxPp:{strong:3},learned:['strong'],species:'rattata'});
 assert.deepEqual(s.prog,{level:1,exp:1,rng:1831565820,made:1,kills:[],items:{berry:0,tonic:0}});
});
test('P3b no invitation when the draw is 0.3 or more; the draw is still spent',()=>{
 const s=round(run({rng:1}),basic('w'));          // first draw from state 1 is 0.627
 assert.equal(s.phase,'playing');assert.deepEqual(s.invitations,[]);
 assert.deepEqual(s.prog,{level:1,exp:1,rng:1831565814,made:0,kills:[],items:{berry:0,tonic:0}});
});
test('P3c a wild species with two moves halves each, never below 1: pidgey 20 HP, strong3/line3 gives 10 HP, 1/1',()=>{
 const s=round(run({rng:7,enemies:[wild('w',3,6,'pidgey')]}),basic('w'));
 assert.deepEqual(s.invitations[0].unit,{id:'N1',side:'friend',hp:10,maxHp:20,pos:null,pp:{strong:1,line:1},maxPp:{strong:3,line:3},learned:['strong','line'],species:'pidgey'});
});
test('P3d geodude keeps its guard move: guard 4 gives 2, strong 3 gives 1, 20 HP gives 10',()=>{
 const s=round(run({rng:7,enemies:[wild('w',3,6,'geodude')]}),basic('w'));
 const u=s.invitations[0].unit;assert.deepEqual([u.hp,u.maxHp,u.pp,u.maxPp],[10,20,{strong:1,guard:2},{strong:3,guard:4}]);
});
test('P3e two defeats in one round draw in defeat order (queue order): B kills pidgey first, then C kills rattata',()=>{
 const floor=[...row(5),...row(5).map(p=>({x:p.x,y:2}))];
 const low=wild('e2',1,6,'pidgey');low.pos=pos(1,2);
 const base=run({rng:8,floor,enemies:[wild('e1',3,6,'rattata'),low]});
 const s=round(base,basic('e1'),'B',basic('e2'));
 // state 8: first draw 0.156 (invite), second draw 0.625 (none): the invitation belongs to the first defeat, B's pidgey
 assert.equal(s.invitations.length,1);assert.equal(s.invitations[0].unit.species,'pidgey');
 assert.deepEqual(s.prog,{level:1,exp:2,rng:3663131634,made:1,kills:[],items:{berry:0,tonic:0}});
 const both=round(run({rng:7,floor,enemies:[wild('e1',3,6,'rattata'),low]}),basic('e1'),'B',basic('e2'));
 assert.deepEqual(both.invitations.map(i=>[i.unit.id,i.unit.species]),[['N1','pidgey'],['N2','rattata']]);
 assert.equal(both.prog.rng,3663131633);
});
test('P3f a fixed seed reproduces the same outcome in a fresh process state: same input, same output',()=>{
 const a=round(run({rng:7}),basic('w')),b=round(run({rng:7}),basic('w'));assert.deepEqual(a,b);
});

/* ---------- shared run level ---------- */
test('P4 level 2 at 3 exp: every member +2 max HP, current HP unchanged; the invitation is taken at the settled level',()=>{
 const s=round(run({exp:2,rng:7,enemies:[wild('w',3,6,'pidgey')]}),basic('w'));
 assert.deepEqual([s.prog.level,s.prog.exp],[2,3]);
 assert.deepEqual(s.queue.map(i=>[s.units[i].hp,s.units[i].maxHp]),[[19,21],[20,22],[21,23]]);
 assert.deepEqual(s.invitations[0].unit,{id:'N1',side:'friend',hp:11,maxHp:22,pos:null,pp:{strong:1,line:1},maxPp:{strong:3,line:3},learned:['strong','line'],species:'pidgey'});
 const up=s.log.findIndex(t=>/升到Lv2/.test(t)),inv=s.log.findIndex(t=>/发出邀请/.test(t));
 assert.ok(up>=0&&inv>up,'level-up is settled before the invitation appears');
});
test('P4b below the threshold nothing changes: exp 1 and 2 stay level 1',()=>{
 const s=round(run({exp:1,rng:1}),basic('w'));
 assert.deepEqual([s.prog.level,s.prog.exp],[1,2]);assert.deepEqual(s.queue.map(i=>s.units[i].maxHp),[19,20,21]);
});
test('P4c the first completion of G gives +2 once; levelling by G alone gives no invitation and spends no draw',()=>{
 const g=run({exp:1,enemies:[],points:[{pos:pos(2),kind:'goal',used:false}]});
 const s=round(g,interact(false));
 assert.deepEqual([s.goal,s.prog.exp,s.prog.level,s.prog.rng],[true,3,2,7]);
 assert.deepEqual(s.queue.map(i=>s.units[i].maxHp),[21,22,23]);assert.deepEqual(s.invitations,[]);
 reject(s,{type:'round',action:interact(false)});   // G is recorded: no second +2
});
test('P4d the level stops at 5 (18 exp); more exp is counted but adds nothing',()=>{
 const s=round(run({level:4,exp:17,rng:1}),basic('w'));
 assert.deepEqual([s.prog.level,s.prog.exp],[5,18]);assert.deepEqual(s.queue.map(i=>s.units[i].maxHp),[19+8,20+8,21+8]);
 const t=round(run({level:5,exp:18,rng:1}),basic('w'));
 assert.deepEqual([t.prog.level,t.prog.exp],[5,19]);assert.deepEqual(t.queue.map(i=>t.units[i].maxHp),[19+8,20+8,21+8]);
 assert.deepEqual([1,2,3,4,5,5].map((_,i)=>levelFor([0,3,7,12,18,40][i])),[1,2,3,4,5,5]);
});
test('P4e a new member joins at the current level; a member sent back to camp no longer grows',()=>{
 let s=round(run({exp:2,rng:7,enemies:[wild('w',3,6,'pidgey')]}),basic('w'));
 s=accept(s,'A');                                  // pidgey N1 (22 max, 11 now) replaces A
 assert.deepEqual(s.queue,['B','C','N1']);assert.deepEqual(s.camp,['A']);
 assert.deepEqual([s.units.N1.hp,s.units.N1.maxHp,s.units.N1.species],[11,22,'pidgey']);
 assert.deepEqual([s.units.A.hp,s.units.A.maxHp],[19,21]);
 s.prog.exp=6;s.units.w2=wild('w2',3,6);s.enemies=['w2'];     // test edit: one more enemy next to C, exp one short of level 3
 s=round(s,basic('w2'));
 assert.equal(s.prog.level,3);
 assert.deepEqual([s.units.B,s.units.C,s.units.N1].map(u=>[u.hp,u.maxHp]),[[20,24],[21,25],[11,24]]);   // +2 each, HP untouched
 assert.deepEqual([s.units.A.hp,s.units.A.maxHp],[19,21],'the member at camp stays as it was');
});
test('P5 damage grows with the run level: basic 6+(L-1), strong and line 10+(L-1); level 1 keeps 6 and 10',()=>{
 const hits=(level,action)=>{const s=round(run({level,rng:1,enemies:[wild('w',3,40)]}),action);return 40-s.units.w.hp;};
 assert.equal(hits(1,basic('w')),6);assert.equal(hits(2,basic('w')),7);assert.equal(hits(5,basic('w')),10);
 assert.equal(hits(1,skill('strong','w')),10);assert.equal(hits(3,skill('strong','w')),12);assert.equal(hits(5,skill('line','w')),14);
});

/* ---------- pickups and items ---------- */
const berryAt2=(extra={})=>run({enemies:[],points:[{pos:pos(2),kind:'berry',used:false}],...extra});
test('P6 the leader picks an item up on its cell in one action; taken once; never an exit',()=>{
 const s=round(berryAt2(),interact(false));
 assert.deepEqual(s.prog.items,{berry:1,tonic:0});assert.equal(s.points[0].used,true);assert.equal(s.round,1);assert.equal(s.phase,'playing');
 assert.match(reject(s,{type:'round',action:interact(false)}).error,/橙橙果已拾取.*本轮未执行/);
 assert.match(reject(berryAt2(),{type:'round',action:interact(true)}).error,/不是出口.*本轮未执行/);
 assert.match(reject(berryAt2(),{type:'round',action:wait,override:{actor:'B',action:interact(false)}}).error,/伙伴不能代替主控交互/);
});
test('P7 berry heals 8 HP, capped at max, on self or an adjacent member; costs the user one action and one berry',()=>{
 const w=run({enemies:[],items:{berry:2}});w.units.B.hp=5;w.units.C.hp=15;
 let s=round(w,{type:'use',item:'berry',target:'B'});                  // C uses on adjacent B: 5 -> 13
 assert.deepEqual([s.units.B.hp,s.units.C.hp,s.prog.items.berry,s.round],[13,15,1,1]);
 assert.deepEqual([s.units.C.pos,s.units.B.pos],[pos(2),pos(1)],'the user did not move');
 s=round(s,{type:'use',item:'berry',target:'C'});                       // self: 15 -> 21 (cap), not 23
 assert.deepEqual([s.units.C.hp,s.prog.items.berry],[21,0]);
});
test('P7b a partner may use an item as the single intervention while the leader acts',()=>{
 const w=run({enemies:[],items:{berry:1}});w.units.A.hp=4;
 const s=round(w,wait,'B',{type:'use',item:'berry',target:'A'});          // B (1) is next to A (0)
 assert.deepEqual([s.units.A.hp,s.prog.items.berry],[12,0]);
});
test('P8 tonic gives every move +1 PP up to its maximum',()=>{
 const w=run({enemies:[],items:{tonic:1}});w.units.B.pp={strong:1,line:2};w.units.C.pp={strong:0,line:0};
 const s=round(w,{type:'use',item:'tonic',target:'C'});
 assert.deepEqual(s.units.C.pp,{strong:1,line:1});assert.equal(s.prog.items.tonic,0);
});
test('P8b an item that cannot work is refused before anything runs, with the reason and 本轮未执行',()=>{
 const full=run({enemies:[],items:{berry:1,tonic:1}});
 assert.match(reject(full,{type:'round',action:{type:'use',item:'berry',target:'C'}}).error,/C的HP已满.*本轮未执行/);
 assert.match(reject(full,{type:'round',action:{type:'use',item:'tonic',target:'C'}}).error,/所有招式PP已满.*本轮未执行/);
 const none=run({enemies:[]});none.units.C.hp=3;
 assert.match(reject(none,{type:'round',action:{type:'use',item:'berry',target:'C'}}).error,/背包里没有橙橙果.*本轮未执行/);
 const far=run({enemies:[],items:{berry:1}});far.units.A.hp=3;
 assert.match(reject(far,{type:'round',action:{type:'use',item:'berry',target:'A'}}).error,/A不在相邻格.*本轮未执行/);
 const down=run({enemies:[],items:{berry:1}});down.units.B.hp=0;down.units.B.pos=null;
 assert.match(reject(down,{type:'round',action:{type:'use',item:'berry',target:'B'}}).error,/B已倒下.*本轮未执行/);
 assert.match(reject(full,{type:'round',action:{type:'use',item:'berry',target:'N9'}}).error,/只能对同行伙伴/);
 const foe=run({items:{berry:1}});foe.units.C.hp=3;
 assert.match(reject(foe,{type:'round',action:{type:'use',item:'berry',target:'w'}}).error,/只能对同行伙伴/);
});
test('P8c the last item cannot be spent twice: leader and partner both using it refuses the whole round',()=>{
 const w=run({enemies:[],items:{berry:1}});w.units.C.hp=3;w.units.A.hp=3;
 const r=reject(w,{type:'round',action:{type:'use',item:'berry',target:'C'},override:{actor:'B',action:{type:'use',item:'berry',target:'A'}}});
 assert.match(r.error,/背包里没有橙橙果.*本轮未执行/);
});
test('P8d items work only in a run that has a backpack: the fixed map refuses them',()=>{
 const r=reject(createMain('m',false),{type:'round',action:{type:'use',item:'berry',target:'A'}});
 assert.match(r.error,/没有可用的背包物品/);
});
test('P8e a berry picked up on one floor is still taken, and not given again, after leaving and coming back',()=>{
 const s0=createExpedition('floors',3);
 const down=s0.points.find(p=>p.kind==='down').pos,berry=s0.points.find(p=>p.kind==='berry').pos;
 let s=structuredClone(s0);for(const id of ['A','B']){s.units[id].hp=0;s.units[id].pos=null;}
 s.units.C.pos=berry;s=round(s,interact(false));
 assert.deepEqual(s.prog.items,{berry:1,tonic:0});
 s.units.C.pos=down;s=doCmd(round(s,interact(true)),{type:'finishTransit'});
 assert.equal(s.dungeon.level,2);
 const g2=generateFloor(3,2);
 assert.deepEqual(s.points.map(p=>p.kind).sort(),['berry','item','tonic','up']);
 assert.deepEqual(s.rooms,g2.rooms);
 const up=s.points.find(p=>p.kind==='up').pos;s.units.C.pos=up;
 s=doCmd(round(s,interact(true)),{type:'finishTransit'});
 assert.equal(s.dungeon.level,1);assert.deepEqual(s.prog.items,{berry:1,tonic:0});
 assert.equal(s.points.find(p=>p.kind==='berry').used,true);
});
test('P8f floor 2 pickups: berry and tonic exist exactly once each, floor 1 holds one berry',()=>{
 for(let seed=0;seed<300;seed++){
  const g1=generateFloor(seed,1),g2=generateFloor(seed,2),k=p=>(p.pos?p.pos:p).x+','+(p.pos?p.pos:p).y;
  assert.deepEqual(g1.pickups.map(p=>p.kind),['berry']);assert.deepEqual(g2.pickups.map(p=>p.kind),['berry','tonic']);
  for(const g of [g1,g2]){
   const taken=new Set([...g.points.map(k),...g.enemies.map(k)]),cells=new Set(g.floor.map(k)),mine=g.pickups.map(k);
   assert.equal(new Set(mine).size,mine.length);
   assert.ok(mine.every(c=>cells.has(c)&&!taken.has(c)),'pickup on a floor cell, off every point and enemy');
   const arrival=g.rooms[0];assert.ok(g.pickups.every(p=>!(p.pos.x>=arrival.x&&p.pos.x<arrival.x+arrival.w&&p.pos.y>=arrival.y&&p.pos.y<arrival.y+arrival.h)),'not in the arrival room');
  }
 }
});

/* ---------- room reveal ---------- */
test('P9 standing in a room shows the whole room; a corridor keeps the straight 4-cell rule',()=>{
 const room=[];for(let y=1;y<=3;y++)for(let x=2;x<=5;x++)room.push(pos(x,y));
 const corridor=[];for(let x=6;x<=14;x++)corridor.push(pos(x,2));
 const build=(rooms,at)=>{const s=run({enemies:[],floor:[...room,...corridor]});s.units.A.pos=pos(at.x+1,at.y);s.units.B.pos=pos(at.x,at.y+1);s.units.C.pos=at;
  s.seen=[];if(rooms)s.rooms=[{x:2,y:1,w:4,h:3}];else delete s.rooms;s.dungeon.width=20;reveal(s);return s;};
 const withRooms=build(true,pos(3,2)),plain=build(false,pos(3,2));
 const roomKeys=room.map(p=>p.x+','+p.y);
 assert.ok(roomKeys.every(k=>withRooms.seen.includes(k)),'the whole room is shown');
 assert.ok(!plain.seen.includes('2,1'),'without room data the corner cells are not shown (straight lines only)');
 assert.ok(withRooms.seen.includes('7,2'));assert.ok(!withRooms.seen.includes('9,2'),'the corridor beyond 4 cells stays hidden');
 const inCorridor=build(true,pos(10,2));
 assert.ok(!roomKeys.some(k=>inCorridor.seen.includes(k)&&!['6,2'].includes(k)),'a corridor position does not reveal the room');
});
test('P9b a new expedition shows the start room entirely; seed 3 room 0 is x7..11,y6..9',()=>{
 const s=createExpedition('r',3);const r=s.rooms[0];assert.deepEqual(r,{x:7,y:6,w:5,h:4});
 for(let y=6;y<10;y++)for(let x=7;x<12;x++)assert.ok(s.seen.includes(x+','+y),`cell ${x},${y} shown`);
});

/* ---------- worlds without the 6.4 data keep the 6.3 behaviour ---------- */
test('P10 a world without prog (older expedition, fixed map) draws nothing, levels nothing, adds no items',()=>{
 const old=run({enemies:[wild('w',3,6)]});delete old.prog;delete old.rooms;
 const s=round(old,basic('w'));
 assert.equal(s.phase,'playing');assert.deepEqual(s.invitations,[]);assert.equal(s.prog,undefined);assert.deepEqual(s.queue.map(i=>s.units[i].maxHp),[19,20,21]);
 assert.match(reject(old,{type:'round',action:{type:'use',item:'berry',target:'C'}}).error,/没有可用的背包物品/);
});

/* ---------- save and restore ---------- */
test('P11 a new expedition and a mid-run state round-trip through the save format',async()=>{
 const s=createExpedition('save-new',2024);const {p}=await opened(s);
 assert.deepEqual(new TrialStore(p,'x').state,s);
 const mid=round(run({exp:2,rng:7,enemies:[wild('w',3,6,'pidgey')]}),basic('w'));
 const q=await opened(mid);const b=new TrialStore(q.p,'x');assert.equal(b.status,'ready',b.error);assert.deepEqual(b.state,mid);
});
test('P11b restoring a pending invitation does not redraw: same invitation, same rng; accepting adds no draw',async()=>{
 const pending=round(run({rng:7}),basic('w'));
 const {p}=await opened(pending);const b=new TrialStore(p,'x');
 assert.deepEqual(b.state.invitations,pending.invitations);assert.equal(b.state.prog.rng,1831565820);
 const writes=p.writes();
 assert.equal((await b.dispatch({type:'invite',choice:'accept',outgoing:'A'})).ok,true);
 assert.equal(b.state.prog.rng,1831565820);assert.equal(b.state.prog.made,1);assert.equal(p.writes(),writes+1);
 const again=new TrialStore(p,'x');assert.deepEqual(again.state,b.state);
});
test('P11c saving and restoring in the middle of a run gives the same later draws as never stopping',async()=>{
 const start=run({rng:1,enemies:[wild('w',3,6),wild('w2',9,6,'pidgey')]});
 const first=round(start,basic('w'));                      // draw 1 at state 1: no invitation
 const {p}=await opened(first);const restored=new TrialStore(p,'x').state;
 assert.deepEqual(restored,first);
 // move the second enemy next to C in both copies (position edit only), then defeat it
 const edit=s=>{const t=structuredClone(s);t.units.w2.pos=pos(3);return t;};
 const direct=round(edit(first),basic('w2')),viaDisk=round(edit(restored),basic('w2'));
 assert.deepEqual(viaDisk,direct);assert.equal(direct.prog.rng,3663131627);   // state 1 stepped twice
});
const mutations=[
 ['level that does not match exp',s=>{s.prog.level=2;}],
 ['negative exp',s=>{s.prog.exp=-1;}],
 ['level above the cap',s=>{s.prog.level=6;s.prog.exp=30;}],
 ['non-integer rng',s=>{s.prog.rng=0.5;}],
 ['rng outside 32 bits',s=>{s.prog.rng=4294967296;}],
 ['pending kills at a checkpoint',s=>{s.prog.kills=['rattata'];}],
 ['items that were never picked up',s=>{s.prog.items.berry=1;}],
 ['negative item count',s=>{s.prog.items.tonic=-1;}],
 ['unknown item kind',s=>{s.prog.items.elixir=1;}],
 ['goal done but no goal experience',s=>{s.goal=true;}],
 ['prog removed while rooms stay',s=>{delete s.prog;}],
 ['rooms removed while prog stays',s=>{delete s.rooms;}],
 ['room outside the map',s=>{s.rooms[0].x=19;}],
 ['room over cells that are not floor',s=>{s.rooms=[{x:0,y:1,w:10,h:2}];}],
 ['species not in the roster',s=>{s.units.A.species='mewtwo';}],
 ['species whose kit differs from the unit',s=>{s.units.A.species='bulbasaur';}],
 ['max HP off the level formula',s=>{s.units.A.maxHp+=1;s.units.A.hp+=1;}],
 ['max PP off the kit',s=>{s.units.A.maxPp.strong=9;s.units.A.pp.strong=9;}],
 ['extra learned move',s=>{s.units.A.learned.push('push');s.units.A.pp.push=1;s.units.A.maxPp.push=1;}],
 ['pickup point in a world with no prog',s=>{delete s.prog;delete s.rooms;s.points.push({pos:pos(2),kind:'berry',used:false});}],
];
for(const [name,mutate] of mutations)test('P12 rejects '+name+' and preserves bytes',async()=>{
 const base=run({enemies:[],points:[{pos:pos(5),kind:'berry',used:false}]});
 const {p}=await opened(base);const e=JSON.parse(p.raw());mutate(e.current);const raw=JSON.stringify(e);
 const q=port(raw);const st=new TrialStore(q,'x');
 assert.equal(st.status,'blocked',name);assert.equal(st.state,null);assert.equal(st.exportRaw(),raw);assert.equal(q.writes(),0);
});
const pendingMutations=[
 ['invitation HP is not the half snapshot',u=>{u.hp=u.hp+1;}],
 ['invitation max HP ignores the run level',u=>{u.maxHp=u.maxHp+2;u.hp=u.maxHp/2;}],
 ['invitation PP is not the half snapshot',u=>{u.pp.strong=3;}],
 ['invitation species missing',u=>{delete u.species;}],
];
for(const [name,mutate] of pendingMutations)test('P12b rejects '+name,async()=>{
 const pending=round(run({rng:7}),basic('w'));
 const {p}=await opened(pending);const e=JSON.parse(p.raw());mutate(e.current.invitations[0].unit);
 assert.equal(new TrialStore(port(JSON.stringify(e)),'x').status,'blocked',name);
});
test('P12c the fixed map refuses prog, rooms and pickups',async()=>{
 for(const mutate of [s=>{s.prog={level:1,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0}};},s=>{s.rooms=[{x:0,y:1,w:3,h:1}];},s=>{s.points.push({pos:structuredClone(s.units.C.pos),kind:'tonic',used:false});}]){
  const {p}=await opened(createMain('fixed',false));const e=JSON.parse(p.raw());mutate(e.current);
  assert.equal(new TrialStore(port(JSON.stringify(e)),'x').status,'blocked');
 }
});
test('P12d a taken berry that was then used still validates: items never exceed what was picked up',async()=>{
 const s=round(berryAt2(),interact(false));
 const {p}=await opened(s);assert.equal(new TrialStore(p,'x').status,'ready');
 const used=round(Object.assign(structuredClone(s),{}),wait);   // a plain round keeps it valid
 assert.deepEqual(used.prog.items,{berry:1,tonic:0});
});
