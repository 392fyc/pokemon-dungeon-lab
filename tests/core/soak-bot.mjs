import assert from 'node:assert/strict';
import {createExpedition,createMain,PROG,bossDefeated,applyCommand,skillTargets} from '../../src/core/engine.ts';
import {initialProfile,newGameProfile,profileProblem,settleRun} from '../../src/core/base.ts';
import {TrialStore} from '../../src/core/save.ts';
import {ECON} from '../../src/core/economy.ts';
import {moveOf} from '../../src/core/moves.ts';
const damageMoves=u=>u.learned.filter(k=>(u.pp[k]??0)>0&&moveOf(k)?.effects.includes('damage'));
const hitMoves=(s,u,e)=>damageMoves(u).filter(k=>skillTargets(s,u.id,k).includes(e.id));
const rangedMoves=u=>damageMoves(u).filter(k=>['front2','line10'].includes(moveOf(k).range));

/*
 * Stage 6.6 (automatic part): full-loop soak.
 * One deterministic bot plays real expeditions through a real TrialStore (in-memory storage port):
 *   base -> depart -> expedition (until ended or the round cap) -> return to base -> learn / carry / team -> depart again.
 * The bot sees only what a player sees: revealed floor cells, units, points and the backpack. It never reads hidden terrain.
 * Every accepted step is read back through a brand-new TrialStore and compared with deepEqual; every rejected command must leave state and bytes unchanged.
 * Statistics are printed, never asserted (this is a soak, not a balance test). Specification: https://github.com/392fyc/pokemon-dungeon-lab/blob/d03ef5144f5671b3b8d5418b94353223742e911a/docs/02-%E8%BF%9B%E5%BA%A6/%E8%87%AA%E6%B5%8B%E8%AE%B0%E5%BD%95/%E9%98%B6%E6%AE%B56%E2%80%94%E5%AE%8C%E6%95%B4%E5%BE%AA%E7%8E%AF%E8%87%AA%E6%B5%8B%E6%8A%A5%E5%91%8A.md.
 */
export const GAMES=5,ROUND_CAP=400,COMMAND_CAP=1500;
const key=p=>`${p.x},${p.y}`;
const DIRS=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
const aliveU=u=>!!u&&u.hp>0&&u.pos!==null;
const memory=()=>{const m=new Map();let writes=0;return {getItem:k=>m.get(k)??null,setItem:(k,v)=>{m.set(k,v);writes++;},map:m,writes:()=>writes};};

/* ---------- invariants ---------- */
function checkWorld(s,where){
 const at=`${where} (${s.runId} round ${s.round} phase ${s.phase})`;
 assert.ok(s.queue.length>=1&&s.queue.length<=3,`${at}: queue size ${s.queue.length}`);
 assert.ok(s.queue.includes(s.leader),`${at}: leader not in queue`);
 assert.ok(s.phase==='ended'||aliveU(s.units[s.leader]),`${at}: leader fallen while the run continues`);
 const cells=new Set(s.floor.map(key)),taken=new Map();
 for(const [id,u] of Object.entries(s.units)){
  assert.ok(u.hp>=0&&u.hp<=u.maxHp,`${at}: ${id} hp ${u.hp}/${u.maxHp}`);
  for(const [k,n] of Object.entries(u.pp))assert.ok(n>=0&&n<=u.maxPp[k],`${at}: ${id} pp ${k} ${n}/${u.maxPp[k]}`);
  if(u.hp===0)assert.equal(u.pos,null,`${at}: fallen ${id} still on the map`);
 }
 for(const id of [...s.queue,...s.enemies]){const u=s.units[id];if(!aliveU(u))continue;
  assert.ok(cells.has(key(u.pos)),`${at}: ${id} stands off the floor`);
  assert.ok(!taken.has(key(u.pos)),`${at}: ${id} overlaps ${taken.get(key(u.pos))} at ${key(u.pos)}`);taken.set(key(u.pos),id);}
 assert.ok(s.bag>=0,`${at}: bag ${s.bag}`);
 assert.ok(s.prog.level>=5&&s.prog.level<=PROG.maxLevel,`${at}: level ${s.prog.level}`);
 assert.ok(s.prog.items.berry>=0&&s.prog.items.tonic>=0,`${at}: negative item count`);
 assert.equal(s.queue.filter(id=>s.camp.includes(id)).length,0,`${at}: member both in queue and camp`);
}
function checkEnvelope(env,where){
 assert.equal(env.format,2,`${where}: expected camp-only format 2`);
 assert.equal(Object.hasOwn(env,'current'),false,`${where}: camp record embeds a World`);
 assert.equal(Object.hasOwn(env,'recent'),false,`${where}: camp record embeds recent history`);
 assert.equal(profileProblem(env.profile),null,`${where}: profile fails validation`);
}
/** A fresh controller reads the same camp record; active Worlds are intentionally memory-only. */
function roundTrip(port,store,where){
 assert.equal(store.status,'ready',`${where}: store not ready (${store.error})`);
 assert.equal(store.state,null,`${where}: a camp round-trip must not persist the active World`);
 const re=new TrialStore(port);
 assert.equal(re.status,'ready',`${where}: reload ${re.status} ${re.error}`);
 assert.equal(re.state,null,`${where}: reloaded controller has a World`);
 assert.deepEqual(re.envelope,store.envelope,`${where}: reloaded record differs`);
 checkEnvelope(re.envelope,where);
}
/** A terminal World remains visible in the result screen, while disk contains only its settled camp profile. */
function terminalRoundTrip(port,store,where){
 assert.equal(store.status,'ready',`${where}: store not ready (${store.error})`);
 assert.equal(store.state?.phase,'ended',`${where}: live result is not terminal`);checkWorld(store.state,where);
 checkEnvelope(store.envelope,where);
 const re=new TrialStore(port);assert.equal(re.status,'ready',`${where}: reload ${re.status} ${re.error}`);
 assert.equal(re.state,null,`${where}: reloaded terminal World instead of camp`);
 assert.deepEqual(re.envelope,store.envelope,`${where}: saved terminal camp differs`);
}
/** Check one active run step without serializing or reloading its World. */
function memoryRun(port,store,where,campRaw=port.getItem(store.key),campWrites=port.writes()){
 assert.equal(store.status,'ready',`${where}: in-memory controller not ready (${store.error})`);
 assert.ok(store.state,`${where}: missing in-memory World`);checkWorld(store.state,where);
 assert.equal(port.getItem(store.key),campRaw,`${where}: an active World changed the camp bytes`);
 assert.equal(port.writes(),campWrites,`${where}: an active World wrote storage`);
 const re=new TrialStore(port);
 assert.equal(re.status,store.envelope?'ready':'empty',`${where}: camp reload ${re.status} ${re.error}`);
 assert.equal(re.state,null,`${where}: opening another controller restored the active World`);
 assert.deepEqual(re.envelope,store.envelope,`${where}: active World changed the stored camp record`);
}
/** Test-only injection for the forced-wipe variant; no storage bytes or production API are involved. */
function injectMemoryWorld(store,world,where){
 assert.ok(Object.hasOwn(store,'world'),`${where}: expected the test controller's in-memory World slot`);
 store.world=structuredClone(world);
 assert.deepEqual(store.state,world,`${where}: injected memory fixture did not take effect`);
}

/* ---------- the bot ---------- */
export const stats=()=>({reachedBoss:0,bossDefeated:0,bossWipes:0,lobbyExits:0,wipes:0,lostPartners:0,paid:0,returned:0,goneForGood:0,bought:0,exchanged:0,doomedWipes:0,invites:0,accepted:0,rejected:0,swapped:0,levelUps:0,evolutions:0,tmGot:0,tmBrought:0,spent:0,income:0,refund:0,waitSum:0,waitN:0,purseZeroByRescue:0,transits:0,cancelledTransits:0,berries:0,tonics:0,rests:0,guards:0,lines:0,switches:0,declined:0,rejections:0,probes:0,learned:0});
const adjacentEnemies=s=>s.enemies.map(i=>s.units[i]).filter(u=>aliveU(u)&&dist(u.pos,s.units[s.leader].pos)===1);
/** The 'cautious' policy (a careful, low-kill player) is off on the forced-wipe seeds, like the tactical one. */
const cautiousOn=memo=>memo.policy==='cautious'&&!memo.doomed;
/** Enemies knocked out in this run: dead enemies stay in `units` (hp 0, off the map) on the current floor and in `dungeon.stored[floor].units` on the others. */
const killsOf=s=>[...Object.values(s.units),...Object.values(s.dungeon?.stored??{}).flatMap(f=>Object.values(f.units))].filter(u=>u.side==='enemy'&&u.hp===0).length;
function ppDeficit(u){return u.learned.some(k=>(u.pp[k]??0)<(u.maxPp[k]??0));}
/** BFS over revealed floor cells only. Allies and enemies do not block the search (the bot swaps with allies and attacks enemies in the way). */
function route(s,from,wanted){
 const seen=new Set(s.seen),first=new Map([[key(from),null]]),len=new Map([[key(from),0]]),q=[from];
 for(let i=0;i<q.length;i++){const cur=q[i];
  if(len.get(key(cur))>0&&wanted(cur))return {to:cur,step:first.get(key(cur)),len:len.get(key(cur))};
  for(const d of DIRS){const p={x:cur.x+d.x,y:cur.y+d.y};if(!seen.has(key(p))||first.has(key(p)))continue;
   first.set(key(p),first.get(key(cur))??p);len.set(key(p),len.get(key(cur))+1);q.push(p);}}
 return null;
}
const affordable=s=>s.shop&&s.dungeon.level===s.shop.level?['berry','tonic','tm'].filter(i=>(i==='tm'?s.shop.stock.tm!==null:s.shop.stock[i]>0)&&s.purse>=ECON.price[i]):[];
/** Where the bot wants to go: the plan is goal G on floor 1, then T on floor 2, then back up and out; cheap pickups on the way. */
function objective(s,memo){
 const L=s.units[s.leader],level=s.dungeon.level,seen=new Set(s.seen),cau=cautiousOn(memo);
 // 'cautious' policy: decide an early exit once and keep it (sticky, otherwise a berry would flip the plan back and forth).
 // Floor 1 after G: team HP < 50% or any member down -> leave by this floor's exit instead of going down. Floors 2-3: team HP < 40% -> climb back up to floor 1's exit.
 if(cau&&!memo.earlyOut){const ratio=hpSum(s)/maxSum(s);
  if(level===1?s.goal&&(ratio<0.5||s.queue.some(i=>s.units[i].hp<=0)):ratio<0.4)memo.earlyOut=true;}
 const pts=s.points.filter(p=>seen.has(key(p.pos)));
 const near=(kinds,max)=>{let best=null;for(const p of pts){if(!kinds.includes(p.kind)||p.used||memo.declined.has(`${level}:${key(p.pos)}`))continue;
   const r=route(s,L.pos,c=>same(c,p.pos));const d=same(L.pos,p.pos)?0:r?.len;if(d===undefined||d>max)continue;if(!best||d<best.d)best={p,d};}return best?.p;};
 const members=s.queue.map(i=>s.units[i]).filter(aliveU);
 const pickups=()=>near(["berry","tonic",...(affordable(s).length?['shop']:[]),...(s.exchange&&!s.exchange.used&&memo.useExchange?['exchange']:[])],8);
 const resting=()=>members.some(m=>ppDeficit(m))||members.some(m=>m.hp<m.maxHp)?near(["rest"],cau?40:6):undefined;
 const pick=cau?resting()??pickups():pickups()??resting(); // cautious: any revealed rest point first, then pickups
 if(pick)return pick;
 let want;
 const floors=s.dungeon.floors;
 if(cau&&memo.earlyOut&&level===1)want='exit';
 else if(cau&&memo.earlyOut&&level>1&&!(floors>2&&level===floors&&s.bag>0))want='up'; // the last floor of a boss run with T in the bag keeps its lobby exit
 else if(floors===2){if(level===1)want=!s.goal?'goal':s.bag>0?'exit':'down';else want=s.bag===0?'item':'up';}
 else if(level===1)want=!s.goal?'goal':'down';
 else if(level<floors)want='down';
 else{ // last floor of a boss run: T first; then either the lobby exit or (by the run's seed) the boss, then the lobby exit
  if(s.bag>0&&memo.fightBoss){
   const boss=s.enemies.map(i=>s.units[i]).find(u=>u.boss&&aliveU(u));
   if(boss)return seen.has(key(boss.pos))?{kind:'boss',pos:boss.pos,used:false}:null; // not seen yet: keep exploring
  }
  want=s.bag===0?'item':'exit';
 }
 return pts.find(p=>p.kind===want&&(want!=='goal'&&want!=='item'||!p.used))||null;
}
function stepToward(s,memo,target){
 const L=s.units[s.leader];
 const r=target?route(s,L.pos,c=>same(c,target.pos)):null;
 const visited=memo.visited[s.dungeon.level]??=new Set();
 const go=r??route(s,L.pos,c=>!visited.has(key(c)));
 if(!go)return null;
 const occ=[...s.queue,...s.enemies].map(i=>s.units[i]).find(u=>aliveU(u)&&same(u.pos,go.step));
 if(!occ)return {type:'move',to:go.step};
 if(occ.side==='enemy')return {type:'basic',target:occ.id};
 return {type:'swap',target:occ.id};
}

/* ---------- tactical policy (options.policy === 'tactical') ----------
 * Same information as the naive bot (revealed cells, units, points, backpack) and the same driver; only the command lists differ.
 * Intent of the whole policy: the naive bot charges everything and arrives at the boss with no PP, no berries and hurt members.
 * The tactical bot (1) keeps strong/line moves for the boss on every floor, (2) tops itself up on the boss floor after taking T,
 * (3) fights the boss from range with the straight line first and in melee second, (4) gives up and walks out of the lobby exit when the fight is lost.
 * It is a test bot: the numbers are plausible, not optimal. It never changes any rule.
 */
const dmgBonus=s=>s.prog?Math.floor(Math.max(0,s.prog.level-5)/4):0;
const ratioOf=u=>u.hp/u.maxHp;
/** Intent: the boss is a threat worth saving PP for only while it still stands somewhere in this run (floors 1-2: not generated yet; floor 3: alive). */
const bossLive=s=>!!s.dungeon?.boss&&!bossDefeated(s);
/** Intent (rule "floors 1-2 use strong/line only when the lead is at <=50% HP or the move kills this round"): would a skill finish enemy `e` this round
 *  while a basic attack plus the neighbours' basic attacks would not? Neighbours that stand next to `e` also strike in the same round. */
function skillKills(s,L,e){
 const b=dmgBonus(s),helpers=s.queue.map(i=>s.units[i]).filter(m=>aliveU(m)&&m.id!==L.id&&dist(m.pos,e.pos)===1).length*(6+b);
 const best=Math.max(0,...hitMoves(s,L,e).map(k=>estDamage(s,L,e,k)));
 return e.hp<=best+helpers&&e.hp>basicDamage(s,L,e)+helpers;
}
/* 7.7 official-move helpers (tactical policies only). Damage rule read from engine.ts resolveDamage/executeSkill: base = 6+ceil(power/2)+level bonus,
 * plus the attacker's attack stage, minus the target's defence stage, at least 1. A basic attack is the same with power 0. */
function estDamage(s,L,e,k){return Math.max(1,6+Math.ceil(moveOf(k).power/2)+dmgBonus(s)+(L.stages?.atk??0)-(e.stages?.def??0));}
function basicDamage(s,L,e){return Math.max(1,6+dmgBonus(s)+(L.stages?.atk??0)-(e.stages?.def??0));}
/** Usable damage moves that can hit `e` now, strongest first (estimated damage this round), ties: more PP left first. */
function bestMoves(s,L,e){return hitMoves(s,L,e).sort((a,c)=>estDamage(s,L,e,c)-estDamage(s,L,e,a)||(L.pp[c]??0)-(L.pp[a]??0));}
/** Learned moves with PP left whose effect list satisfies `test` (e.g. protect, counter, a defence-stage raise). */
const movesWith=(u,test)=>u.learned.filter(k=>(u.pp[k]??0)>0&&moveOf(k)&&moveOf(k).effects.some(test));
const isProtect=e=>e==='protect',isCounter=e=>e==='counter',isDefUp=e=>/^stage:def:\+/.test(e),isAtkUp=e=>/^stage:atk:\+/.test(e);
const pureBlow=u=>u.learned.filter(k=>(u.pp[k]??0)>0&&moveOf(k)?.effects.includes('blowaway')&&!moveOf(k).effects.includes('damage'));
/** Mirrors the engine's room reach (its `inRoomReach`): inside the actor's room, or within 2 cells (Chebyshev) when the actor is not in a known room. */
function roomMates(s,L){
 const inR=(p,r)=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h,room=(s.rooms??[]).find(r=>inR(L.pos,r));
 return s.queue.map(i=>s.units[i]).filter(m=>aliveU(m)&&m.id!==L.id&&(room?inR(m.pos,room):Math.max(Math.abs(m.pos.x-L.pos.x),Math.abs(m.pos.y-L.pos.y))<=2));
}
/** Can the enemy `e` hit member `L` this round: adjacent, or a ranged enemy with a clear straight line within its range (what the player sees on the board). */
function foeReaches(s,e,L){
 if(dist(e.pos,L.pos)===1)return true;
 return !e.asleep&&!e.waitOnly&&hitMoves(s,e,L).length>0;
}
/** A blow from L pushes `e` straight away from L: safe when the path ends at a wall or an enemy (they take collision damage) and not at one of our own. */
function blowSafe(s,L,e){
 const dx=Math.sign(e.pos.x-L.pos.x),dy=Math.sign(e.pos.y-L.pos.y),floor=new Set(s.floor.map(key));
 const occ=new Map([...s.queue,...s.enemies].map(i=>s.units[i]).filter(aliveU).map(u=>[key(u.pos),u]));
 let at=e.pos;
 for(let i=0;i<10;i++){const n={x:at.x+dx,y:at.y+dy};if(!floor.has(key(n)))return true;const b=occ.get(key(n));if(b)return b.side==='enemy';at=n;}
 return true;
}
/** True when a ray of length 1..3 from `from` to `to` crosses only floor cells nobody stands on (the leader itself is ignored: it is the one moving). */
function rayClear(s,from,to,leaderId){
 if(from.x!==to.x&&from.y!==to.y)return false;const d=dist(from,to);if(d<1||d>3)return false;
 const floor=new Set(s.floor.map(key)),occ=new Set([...s.queue,...s.enemies].filter(i=>i!==leaderId).map(i=>s.units[i]).filter(aliveU).map(u=>key(u.pos)));
 const dx=Math.sign(to.x-from.x),dy=Math.sign(to.y-from.y);let p={x:from.x+dx,y:from.y+dy};
 while(!same(p,to)){if(!floor.has(key(p))||occ.has(key(p)))return false;p={x:p.x+dx,y:p.y+dy};}
 return true;
}
/** Revealed floor cells in the boss's row or column at distance `d` with a clear ray to it and no enemy on them (an ally on the cell is fine: the bot swaps). */
function lineSpots(s,B,d,leaderId){
 const seen=new Set(s.seen),foes=new Set(s.enemies.map(i=>s.units[i]).filter(aliveU).map(u=>key(u.pos)));
 return new Set(s.floor.filter(c=>seen.has(key(c))&&(c.x===B.pos.x||c.y===B.pos.y)&&dist(c,B.pos)===d&&!foes.has(key(c))&&rayClear(s,c,B.pos,leaderId)).map(key));
}
/** The command that takes one step along a route result: move, swap with an ally in the way, or hit an enemy in the way. */
function stepCommand(s,r){
 const occ=[...s.queue,...s.enemies].map(i=>s.units[i]).find(u=>aliveU(u)&&same(u.pos,r.step));
 if(!occ)return {type:'move',to:r.step};
 return occ.side==='friend'?{type:'swap',target:occ.id}:{type:'basic',target:occ.id};
}
/**
 * Boss floor, T taken, boss still alive, fight not yet started: top up before walking in.
 * Intent: arrive with every member above 70% HP and PP restored where the pack allows, and with all members close enough to be reached by one berry.
 * Returns commands to try before the naive ones (the driver keeps the first the rules accept).
 */
function bossPrep(s,memo,B){
 const L=s.units[s.leader],members=s.queue.map(i=>s.units[i]).filter(aliveU),out=[];
 if(adjacentEnemies(s).length)return out; // fight first
 const reach=members.filter(m=>m.id===L.id||dist(m.pos,L.pos)===1),act=a=>out.push({type:'round',action:a});
 const hurtAny=members.some(m=>ratioOf(m)<0.7);
 if(hurtAny&&s.prog.items.berry>0){
  const t=reach.filter(m=>ratioOf(m)<0.7).sort((a,b)=>ratioOf(a)-ratioOf(b))[0];
  if(t)act({type:'use',item:'berry',target:t.id});
  else if(memo.prepWait<4){memo.prepWait++;act({type:'wait'});} // followers are not adjacent yet: give them a few rounds
 }
 if(s.prog.items.tonic>0){const t=reach.filter(m=>ppDeficit(m)).sort((a,b)=>(a.id===L.id?0:1)-(b.id===L.id?0:1))[0];if(t)act({type:'use',item:'tonic',target:t.id});}
 // 7.7: raise the lead's defence to stage 2 (harden / defensecurl) and, with >=2 mates in the room, their attack to +2 (helpinghand) before walking in.
 // The boss has not engaged yet, so these rounds cost nothing but the move's PP. Both are bounded by stage clamps and PP.
 const defUp=movesWith(L,isDefUp)[0];
 if(defUp&&(L.stages?.def??0)<2)act({type:'skill',skill:defUp,target:L.id});
 const mates=roomMates(s,L),helper=movesWith(L,isAtkUp)[0];
 if(helper&&mates.length>=2&&mates.some(m=>(m.stages?.atk??0)<2))act({type:'skill',skill:helper,target:L.id});
 // all members present: when the boss is in sight but still far, wait for stragglers (at most 6 rounds in total)
 if(s.seen.includes(key(B.pos))&&dist(B.pos,L.pos)>5&&members.some(m=>dist(m.pos,L.pos)>2)&&memo.gatherWait<6){memo.gatherWait++;act({type:'wait'});}
 return out;
}
/**
 * The boss fight proper (fight started or retreat decided). Returns the full ordered command list.
 * Boss facts used (read from engine.ts): it never moves; each enemy phase it attacks BOSS.attacks times, each time at the first living member
 * ADJACENT to it in queue order, otherwise at the nearest member on a clear straight line within range 3. It cannot be pushed.
 * Companions act by default behaviour only (attack an adjacent enemy, else follow the leader), so the leader's choices are the plan.
 */
function bossTurn(s,memo,B){
 const L=s.units[s.leader],out=[],act=a=>out.push({type:'round',action:a});
 const members=s.queue.map(i=>s.units[i]).filter(aliveU),b=dmgBonus(s);
 const pts=s.points.filter(p=>s.seen.includes(key(p.pos)));
 // Retreat rule: lost fight = boss HP above what we can deal in the next 3 rounds AND someone has already fallen. Sticky once decided.
 const attacks=damageMoves(L),sk=Math.min(3,attacks.reduce((n,k)=>n+L.pp[k],0)),power=Math.max(0,...attacks.map(k=>Math.ceil(moveOf(k).power/2))),leader3=sk*(6+power+b)+(3-sk)*(6+b),team3=leader3+(members.length-1)*3*(6+b);
 const fallen=s.queue.some(i=>s.units[i].hp<=0);
 if(!memo.retreat&&!memo.noRetreat&&fallen&&B.hp>team3){memo.retreat=true;memo.retreatRound=s.round;} // policy 'tactical-stand' never retreats (measures the fight itself); the round is kept so the statistics can tell whether the boss had been contacted by then
 if(memo.retreat){
  const exit=pts.find(p=>p.kind==='exit');
  if(exit){
   if(same(exit.pos,L.pos))act({type:'interact',exit:true});
   else{const r=route(s,L.pos,c=>same(c,exit.pos));if(r)act(stepCommand(s,r));}
   if(out.length){act({type:'wait'});return out;}
  }
 }
 const d=dist(L.pos,B.pos),canHitNow=d===1||hitMoves(s,L,B).length>0;
 // Lead switch: the lead is at <=40% HP and a clearly healthier member exists (cooldown 2 rounds).
 // The boss picks its victim by queue order and position, not by who leads, so a switch does not save the old lead; it only costs the lead's own attack.
 // So it is skipped while the lead can hit the boss this round, and used when the lead cannot (the healthier member then does the walking and shooting).
 const healthiest=members.filter(m=>m.id!==L.id).sort((a,c)=>ratioOf(c)-ratioOf(a))[0];
 if(!canHitNow&&healthiest&&ratioOf(L)<=0.4&&ratioOf(healthiest)-ratioOf(L)>=0.2&&s.round-memo.lastSwitch>=2)out.push({type:'switch',actor:healthiest.id});
 const reach=members.filter(m=>m.id===L.id||dist(m.pos,L.pos)===1);
 // Berry: to the lowest-HP member the lead can reach, when that member is at <=40%.
 const weak=[...reach].sort((a,c)=>ratioOf(a)-ratioOf(c))[0];
 if(weak&&ratioOf(weak)<=0.4&&s.prog.items.berry>0)act({type:'use',item:'berry',target:weak.id});
 // 7.7 protect shields only the acting member for 3 enemy phases: use it when the boss will pick the lead (first adjacent member in queue order, else nearest on a line) and the lead is at <=40% HP.
 const adjB=members.filter(m=>dist(m.pos,B.pos)===1);
 const victim=adjB[0]??members.filter(m=>(m.pos.x===B.pos.x||m.pos.y===B.pos.y)&&dist(m.pos,B.pos)<=3).sort((a,c)=>dist(a.pos,B.pos)-dist(c.pos,B.pos))[0];
 const guard=movesWith(L,isProtect)[0];
 if(victim?.id===L.id&&ratioOf(L)<=0.4&&guard&&!(L.protect>0)&&L.lastMove!==guard)act({type:'skill',skill:guard,target:L.id});
 const hits=bestMoves(s,L,B);
 // drain first while hurt (<70% HP)
 const drain=hits.find(k=>moveOf(k).effects.includes('drain'));
 if(drain&&ratioOf(L)<0.7)act({type:'skill',skill:drain,target:B.id});
 if(d===1){
  // counter ("pursuit"): only when the boss will pick the lead, the lead is at >=50% HP and the move is not already running; skipped when a move would finish the boss
  const counter=movesWith(L,isCounter)[0];
  if(counter&&victim?.id===L.id&&ratioOf(L)>=0.5&&!(L.counter>0)&&!(hits.length&&B.hp<=estDamage(s,L,B,hits[0])))act({type:'skill',skill:counter,target:L.id});
  for(const skill of hits)act({type:'skill',skill,target:B.id});act({type:'basic',target:B.id});
 }
 else{
  if(rangedMoves(L).length){
   if(hits.length)for(const skill of hits)act({type:'skill',skill,target:B.id});
   else for(const want of [2]){const spots=lineSpots(s,B,want,L.id);if(!spots.size)continue;
    const r=route(s,L.pos,c=>spots.has(key(c)));
    if(r){const c=stepCommand(s,r);if(c.type!=='basic')act(c);break;}}
  }
  const step=stepToward(s,memo,{pos:B.pos});if(step)act(step); // no line left (or no spot): walk up and hit it
 }
 act({type:'wait'});
 return out;
}
/**
 * 7.7 ordinary fight of the tactical policies (floors 1-3, enemies other than the boss-floor boss plan). Returns the command list for the leader's action.
 * Order: protect (a ranged enemy or the boss can hit the lead, lead <=40% HP) > blow a plain enemy off a hurt mate > drain while hurt (<70%)
 * > counter (not on floors 1-2 while the boss is still to come: its PP is kept for the boss) > the strongest usable damage move > the basic attack.
 */
function tacticalFight(s,L,members,adj,visible,saveSkills,mayUse){
 const out=[],act=a=>out.push({type:'round',action:a}),b=dmgBonus(s);
 const guard=movesWith(L,isProtect)[0];
 if(guard&&ratioOf(L)<=0.4&&!(L.protect>0)&&L.lastMove!==guard&&visible.some(e=>foeReaches(s,e,L)&&rangedMoves(e).length>0))act({type:'skill',skill:guard,target:L.id});
 const hurtMates=members.filter(m=>m.id!==L.id&&ratioOf(m)<0.6);
 for(const k of pureBlow(L))for(const e of adj)
  if(!e.boss&&e.hp>6+b&&hurtMates.some(m=>dist(m.pos,e.pos)===1)&&blowSafe(s,L,e))act({type:'skill',skill:k,target:e.id});
 for(const e of adj){
  const hits=bestMoves(s,L,e),drain=hits.find(k=>moveOf(k).effects.includes('drain'));
  if(drain&&ratioOf(L)<0.7)act({type:'skill',skill:drain,target:e.id});
  const counter=movesWith(L,isCounter)[0];
  if(counter&&!saveSkills&&ratioOf(L)>=0.5&&!(L.counter>0)&&e.hp>basicDamage(s,L,e))act({type:'skill',skill:counter,target:L.id});
  if(mayUse(e))for(const skill of hits)act({type:'skill',skill,target:e.id});
  act({type:'basic',target:e.id});
 }
 if(!adj.length)for(const e of visible){const drain=bestMoves(s,L,e).find(k=>moveOf(k).effects.includes('drain'));
  if(drain&&ratioOf(L)<0.7)act({type:'skill',skill:drain,target:e.id});
  if(mayUse(e))for(const skill of bestMoves(s,L,e))act({type:'skill',skill,target:e.id});}
 return out;
}
/** Ordered list of commands; the driver sends them in order and keeps the first one the rules accept. */
function candidates(s,memo){
 const L=s.units[s.leader],out=[];(memo.visited[s.dungeon.level]??=new Set()).add(key(L.pos));
 const members=s.queue.map(i=>s.units[i]).filter(aliveU);
 const low=u=>u.hp/u.maxHp;
 const tac=memo.policy==='tactical'&&!memo.doomed,cau=cautiousOn(memo);
 if(tac&&s.dungeon.boss&&s.dungeon.level===s.dungeon.floors&&s.bag>0){ // boss floor, T taken
  const B=s.enemies.map(i=>s.units[i]).find(u=>u.boss&&aliveU(u));
  if(B){
   const near=s.seen.includes(key(B.pos))&&dist(B.pos,L.pos)<=5;
   if(near)memo.engaged=true;
   if(memo.engaged)return bossTurn(s,memo,B);
   out.push(...bossPrep(s,memo,B));
  }
 }
 // tactical: keep strong/line for the boss; use them on floors before it only when the lead is at <=50% HP or the move kills this round
 const saveSkills=tac&&bossLive(s);
 const mayUse=e=>!saveSkills||low(L)<=0.5||skillKills(s,L,e);
 // switch the lead to a much healthier member (cooldown 6 rounds)
 const healthiest=members.filter(m=>m.id!==L.id).sort((a,b)=>low(b)-low(a))[0];
 if(!memo.reckless&&healthiest&&low(L)<=0.34&&low(healthiest)-low(L)>=0.3&&s.round-memo.lastSwitch>=6)out.push({type:'switch',actor:healthiest.id});
 const act=a=>out.push({type:'round',action:a});
 const here=s.points.find(p=>same(p.pos,L.pos));
 if(!memo.doomed&&here?.kind==='shop')for(const item of affordable(s))out.push({type:'buy',item});
 if(!memo.doomed&&here?.kind==='exchange'&&s.exchange&&!s.exchange.used&&memo.useExchange){
  const mates=members.filter(m=>m.id!==L.id).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp);
  if(mates.length)act({type:'exchange',target:mates[0].id,cargo:s.tms.map((t,i)=>[t,i]).filter(([t])=>t.fate==='held').slice(0,2).map(([,i])=>i)});
 }
 if(memo.doomed&&memo.suicidal){ // after the tide has turned: walk to the nearest enemy and stand still next to it
  const adj0=adjacentEnemies(s);
  if(adj0.length){act({type:'wait'});}
  else{const foes=s.enemies.map(i=>s.units[i]).filter(u=>aliveU(u)&&s.seen.includes(key(u.pos)));
   // Enemies sight only 2 corridor steps, so a patrolling foe drops out of view as it walks away; without a memory the bot turned back to its
   // objective, saw the foe again two cells later and swung between the two forever (S66 seed 88109 game 0). Remember where the nearest foe was last seen and keep walking there.
   if(foes.length)memo.lastFoe=foes.map(e=>({pos:{...e.pos},d:dist(e.pos,L.pos)})).sort((a,b)=>a.d-b.d)[0].pos;
   else if(memo.lastFoe&&same(memo.lastFoe,L.pos))memo.lastFoe=null;
   const r=foes.length?route(s,L.pos,c=>foes.some(e=>same(e.pos,c))):memo.lastFoe?route(s,L.pos,c=>same(c,memo.lastFoe)):null;
   if(r){const occ=[...s.queue,...s.enemies].map(i=>s.units[i]).find(u=>aliveU(u)&&same(u.pos,r.step));
    if(!occ)act({type:'move',to:r.step});else if(occ.side==='friend')act({type:'swap',target:occ.id});else act({type:'wait'});}}
 }
 // backpack: berry on the weakest of self/adjacent, tonic on whoever lost most PP
 const reachable=members.filter(m=>m.id===L.id||dist(m.pos,L.pos)===1);
 const hurt=reachable.filter(m=>low(m)<=(cau?0.6:0.5)).sort((a,b)=>low(a)-low(b))[0]; // cautious: berry from 60% HP
 if(!memo.reckless&&hurt&&s.prog.items.berry>0)act({type:'use',item:'berry',target:hurt.id});
 const dry=cau?reachable.find(ppDeficit):reachable.find(m=>m.learned.some(k=>(m.pp[k]??0)===0)); // cautious: tonic on any PP gap
 if(!memo.reckless&&dry&&s.prog.items.tonic>0)act({type:'use',item:'tonic',target:dry.id});
 // fight: protect the hurt acting member when an enemy is near, then strike
 const adj=adjacentEnemies(s).sort((a,b)=>a.hp-b.hp);
 const visible=s.enemies.map(i=>s.units[i]).filter(u=>aliveU(u)&&s.seen.includes(key(u.pos)));
 if(tac)out.push(...tacticalFight(s,L,members,adj,visible,saveSkills,mayUse));
 else{
 if(low(L)<=0.5&&(L.pp.protect??0)>0&&visible.some(e=>dist(e.pos,L.pos)<=4))act({type:'skill',skill:'protect',target:L.id});
 for(const e of adj){if(mayUse(e))for(const skill of hitMoves(s,L,e))act({type:'skill',skill,target:e.id});act({type:'basic',target:e.id});}
 if(!adj.length&&!cau)for(const e of visible)if(mayUse(e))for(const skill of hitMoves(s,L,e))act({type:'skill',skill,target:e.id}); // cautious never shoots at a distant enemy
 }
 const target=objective(s,memo);
 if(target&&same(target.pos,L.pos)){
  const k=target.kind;act({type:'interact',exit:k==='exit'||k==='down'||k==='up'});
 }
 const step=stepToward(s,memo,target);if(step)act(step);
 act({type:'wait'});
 return out;
}
function chooseInvite(s,memo){
 const inv=s.invitations.find(i=>i.status==='pending'),out=[];
 if(s.queue.length<3)out.push({type:'invite',choice:'accept'});
 else{memo.fullInvites++;
  if(memo.fullInvites%2===0){const members=s.queue.filter(i=>i!==s.leader&&aliveU(s.units[i])||(i!==s.leader));
   const weakest=[...members].sort((a,b)=>s.units[a].hp/s.units[a].maxHp-s.units[b].hp/s.units[b].maxHp)[0];
   if(weakest)out.push({type:'invite',choice:'accept',outgoing:weakest});}}
 out.push({type:'invite',choice:'reject'});
 return {out,inv};
}


/* ---------- observation only (7.4 statistics): none of this changes a command, a state or the order of anything ---------- */
const hpSum=s=>s.queue.reduce((a,i)=>a+s.units[i].hp,0),maxSum=s=>s.queue.reduce((a,i)=>a+s.units[i].maxHp,0);
/** Damage that ordinary enemies would deal in this round: the same round is replayed on a copy whose boss is set to wait only (berry healing is added back). Null when not measurable. */
function otherDamage(s,cmd){
 if(cmd.action.type==='exchange')return null; // the companion leaves the queue; its HP is not damage
 const c=structuredClone(s);for(const u of Object.values(c.units))if(u.boss)u.waitOnly=true;
 const before=hpSum(c),r=applyCommand(c,cmd);if(!r.ok)return null;
 let heal=0;if(cmd.action.type==='use'&&cmd.action.item==='berry'){const t=s.units[cmd.action.target];heal=Math.min(PROG.berryHeal,t.maxHp-t.hp);}
 return before-hpSum(r.state)+heal;
}
/** Records, once per game on the boss floor: the team when the floor is entered, and when the first member touches the boss (adjacent, or on a clear line within 3). */
function observeBossFloor(s,x){
 if(!x.entry)x.entry={ratios:s.queue.map(i=>+(s.units[i].hp/s.units[i].maxHp).toFixed(3)),alive:s.queue.filter(i=>aliveU(s.units[i])).length,hp:hpSum(s),max:maxSum(s)};
 const B=s.enemies.map(i=>s.units[i]).find(u=>u.boss&&aliveU(u));
 if(B&&!x.contact&&s.queue.some(i=>{const m=s.units[i];return aliveU(m)&&(dist(m.pos,B.pos)===1||rayClear(s,m.pos,B.pos,null));}))
  x.contact={alive:s.queue.filter(i=>aliveU(s.units[i])).length,hp:hpSum(s),max:maxSum(s),round:s.round};
}

/* ---------- driver ---------- */
async function send(port,store,cmd,st,where){
 const before=store.state,envelopeBefore=store.envelope,rawBefore=port.getItem(store.key),writesBefore=port.writes();
 const r=await store.dispatch(cmd);
 if(r.ok){
  assert.deepEqual(store.state,r.state,`${where}: dispatch result differs from live World`);
  if(before.phase!=='ended'&&r.state.phase==='ended'&&store.envelope){
   assert.equal(port.writes(),writesBefore+1,`${where}: terminal result must save exactly once`);
   assert.notEqual(port.getItem(store.key),rawBefore,`${where}: terminal camp record was not written`);
   assert.equal(Object.hasOwn(store.envelope,'current'),false,`${where}: terminal camp embeds World`);
   assert.equal(Object.hasOwn(store.envelope,'recent'),false,`${where}: terminal camp stores recent World`);
   terminalRoundTrip(port,store,where+' terminal camp');
  }else{
   assert.equal(port.getItem(store.key),rawBefore,`${where}: an active World wrote storage`);
   assert.equal(port.writes(),writesBefore,`${where}: an active World wrote storage`);
   memoryRun(port,store,where,rawBefore,writesBefore);
  }
  return r;
 }
 st.rejections++;
 assert.deepEqual(store.state,before,`${where}: rejected ${JSON.stringify(cmd)} changed the live World`);
 assert.deepEqual(store.envelope,envelopeBefore,`${where}: rejected ${JSON.stringify(cmd)} changed the camp`);
 assert.deepEqual(r.state,before,`${where}: rejected result state differs`);
 assert.equal(port.getItem(store.key),rawBefore,`${where}: rejected command wrote storage`);
 assert.equal(port.writes(),writesBefore,`${where}: rejected command wrote storage`);
 return r;
}
/** Commands that must be refused in the current phase. Each one is checked to change nothing. */
async function probe(port,store,st,where){
 const s=store.state;st.probes++;
 const bad=s.phase==='playing'?[{type:'finishExit'},{type:'finishTransit'},{type:'invite',choice:'reject'},{type:'round',action:{type:'move',to:{x:-5,y:-5}}},{type:'round',action:{type:'interact',exit:true},override:{actor:s.leader,action:{type:'wait'}}}]
  :s.phase==='invitation'?[{type:'round',action:{type:'wait'}},{type:'finishExit'},{type:'switch',actor:s.leader}]
  :s.phase==='ended'?[{type:'round',action:{type:'wait'}},{type:'invite',choice:'reject'},{type:'finishExit'},{type:'finishTransit'}]
  :[{type:'round',action:{type:'wait'}}];
 for(const cmd of bad){const r=await send(port,store,cmd,st,where+' probe');assert.equal(r.ok,false,`${where}: ${JSON.stringify(cmd)} was accepted in phase ${s.phase}`);}
}

async function playRun(port,ref,gameId,st,reckless=false,doomed=false,useExchange=false,fightBoss=false,policy='naive',x={},noRetreat=false,use={}){
 let store=ref.store;
 const memo={visited:{},declined:new Set(),lastSwitch:-99,fullInvites:0,reckless,doomed,useExchange,suicidal:false,fightBoss,policy,noRetreat,engaged:false,retreat:false,prepWait:0,gatherWait:0,earlyOut:false};
 let rounds=0,commands=0,evolutions=0;const forms=new Map();const where=`${gameId}`;
 for(;;){
  const s=store.state;
  for(const [id,u] of Object.entries(s.units))if(u.side==='friend'&&u.species){if(forms.has(id)&&forms.get(id)!==u.species){evolutions++;st.evolutions++;}forms.set(id,u.species);}
  if(s.phase==='ended'){
   st.levelUps+=s.prog.level-5;
   for(const t of s.end.tms){st.tmGot++;if(t.fate==='brought'||t.fate==='sent')st.tmBrought++;}
   if(s.end.outcome==='wipe')st.wipes++;
   if(s.end.outcome==='wipe'&&doomed)st.doomedWipes++;
   if(s.dungeon.boss){ // 7.3 statistics for 7.4: reached the boss floor, defeated the boss, wiped on the boss floor, left by the lobby exit
    if(s.dungeon.level===3||'3' in s.dungeon.stored)st.reachedBoss++;
    if(s.end.boss)st.bossDefeated++;
    if(s.end.outcome==='wipe'&&s.dungeon.level===3)st.bossWipes++;
    if(s.end.outcome==='normal'&&s.dungeon.level===3)st.lobbyExits++;
    // retreatBeforeContact: a contact observed only after the retreat decision does not count ('decided before any contact').
    Object.assign(x,{bossRun:true,reached:s.dungeon.level===3||'3' in s.dungeon.stored,defeated:!!s.end.boss,bossWipe:s.end.outcome==='wipe'&&s.dungeon.level===3,
     lobbyExit:s.end.outcome==='normal'&&s.dungeon.level===3,retreat:memo.retreat,retreatBeforeContact:!!memo.retreat&&(!x.contact||x.contact.round>memo.retreatRound),survivors:s.end.boss?s.queue.filter(id=>aliveU(s.units[id])).length:null,
     bossHpLeft:(Object.values(s.units).find(u=>u.boss)??Object.values(s.dungeon.stored).flatMap(f=>Object.values(f.units)).find(u=>u.boss))?.hp??null});
    assert.equal(s.end.boss,s.units.boss?.hp===0||Object.values(s.dungeon.stored).some(f=>f.units.boss?.hp===0),`${where}: end.boss disagrees with the boss unit`);
   }
   await probe(port,store,st,where+' ended');
   if(store.envelope?.profile){const before=store.envelope; // with a saved camp, a finished expedition must return there before another trial
    assert.equal(await store.newTrial(createMain('soak-direct')),false,where+': newTrial accepted over a based expedition');assert.deepEqual(store.envelope,before);}
   x.wipeFloor=s.end.outcome==='wipe'?s.dungeon.level:null;x.kills=killsOf(s);
   return {outcome:s.end.outcome,rounds,commands,goal:s.goal,level:s.prog.level,evolutions,floor:s.dungeon.level,kills:x.kills};
  }
  if(rounds>=ROUND_CAP||commands>=COMMAND_CAP){
   const L=s.units[s.leader],seen=new Set(s.seen),visited=memo.visited[s.dungeon.level]??new Set();
   const unseenFloor=s.floor.filter(c=>!seen.has(key(c))).length;
   const obj=objective(s,memo);
   if(process.env.SOAK_DEBUG)console.log(where,memo.trail.slice(-30).join(' '),s.log.slice(-6));
   x.kills=killsOf(s);
   return {outcome:'timeout',rounds,commands,goal:s.goal,level:s.prog.level,evolutions,floor:s.dungeon.level,kills:x.kills,
    reason:`phase=${s.phase} floor=${s.dungeon.level} goal=${s.goal} bag=${s.bag} leader@${key(L.pos)} objective=${obj?obj.kind+'@'+key(obj.pos):'none'} visited=${visited.size}/${s.seen.length} seenCells unseenFloor=${unseenFloor} enemiesAlive=${s.enemies.filter(i=>aliveU(s.units[i])).length} cancelledTransits=${st.cancelledTransits}`};
  }
  // Forced-wipe variant: once G is done (or after round 60) every living member is brought to 1 HP in memory, and the bot stops defending.
  if(doomed&&!memo.suicidal&&s.phase==='playing'&&(s.goal||s.round>=60)){
   const low=structuredClone(s);for(const id of low.queue){const u=low.units[id];if(u.hp>0)u.hp=1;}
   injectMemoryWorld(store,low,where+' forced-wipe input');
   for(const id of low.queue)if(low.units[id].hp>0)assert.equal(store.state.units[id].hp,1,`${where}: forced-wipe timing for ${id}`);
   memoryRun(port,store,where+' forced-wipe input');memo.suicidal=true;continue;
  }
  commands++;(memo.trail??=[]).push(`${s.round}:${key(s.units[s.leader].pos)}:${s.phase}`);
  if(s.phase==='playing'&&s.dungeon.boss&&s.dungeon.level===3)observeBossFloor(s,x);
  if(commands%9===0)await probe(port,store,st,where);
  if(s.phase==='evolution'){const r=await send(port,store,{type:'evolve',species:s.pendingEvolutions[0].choices[0]},st,where+' evolution');assert.ok(r.ok,r.error);continue;}
  if(s.phase==='invitation'){
   const {out}=chooseInvite(s,memo);st.invites++;let done=false;
   for(const cmd of out){const r=await send(port,store,cmd,st,where+' invite');if(r.ok){done=true;cmd.choice==='accept'?st.accepted++:st.rejected++;if(cmd.outgoing)st.swapped++;break;}}
   assert.ok(done,`${where}: no invitation answer accepted`);continue;
  }
  if(s.phase==='exit'){const r=await send(port,store,{type:'finishExit'},st,where);assert.ok(r.ok,`${where}: finishExit refused: ${r.error}`);continue;}
  if(s.phase==='transit'){
   const r=await send(port,store,{type:'finishTransit'},st,where);assert.ok(r.ok,`${where}: finishTransit refused: ${r.error}`);
   store.state.dungeon.level!==s.dungeon.level?st.transits++:st.cancelledTransits++;continue;
  }
  let moved=false;
  for(const cmd of candidates(s,memo)){
   const od=cmd.type==='round'&&s.phase==='playing'&&s.dungeon.boss&&s.dungeon.level===3?otherDamage(s,cmd):null;
   const r=await send(port,store,cmd,st,where+' '+cmd.type);
   if(r.ok&&od!==null){x.f3dmg=(x.f3dmg??0)+od;x.f3rounds=(x.f3rounds??0)+1;}
   if(!r.ok){if(cmd.type==='round'&&cmd.action.type==='interact'){const p=s.points.find(p=>same(p.pos,s.units[s.leader].pos));if(p)memo.declined.add(`${s.dungeon.level}:${key(p.pos)}`);st.declined++;}continue;}
   if(cmd.type==='switch'){memo.lastSwitch=s.round;st.switches++;moved=true;break;}
   if(cmd.type==='buy'){st.bought++;moved=true;break;}
   rounds++;moved=true;
   const a=cmd.action;
   if(process.env.SOAK_TRACE&&s.dungeon.boss&&s.dungeon.level===3){const bb=s.enemies.map(i=>s.units[i]).find(u=>u.boss);console.error(`${gameId} r${s.round} ${s.queue.map(i=>`${i}:${s.units[i].hp}@${s.units[i].pos?key(s.units[i].pos):'x'}`).join(' ')} boss:${bb?.hp}@${bb?key(bb.pos):''} ${JSON.stringify(a)}`);} // debug only (env SOAK_TRACE)
   if(a.type==='exchange')st.exchanged++;
   if(a.type==='use')a.item==='berry'?st.berries++:st.tonics++;
   if(a.type==='skill')use[a.skill]=(use[a.skill]??0)+1;else if(a.type==='basic')use.basic=(use.basic??0)+1; // observation only: the leader's explicit attacks (mates act by default and are not counted)
   if(a.type==='skill'&&a.skill==='protect')st.guards++;
   if(a.type==='skill'&&['front2','line10'].includes(moveOf(a.skill)?.range))st.lines++;
   if(a.type==='interact'){const p=s.points.find(p=>same(p.pos,s.units[s.leader].pos));if(p?.kind==='rest')st.rests++;}
   break;
  }
  assert.ok(moved,`${where}: no command was accepted, not even wait`);
 }
}

/** Base routine: every refusal is checked to change nothing; then learn the first compatible machine, set carry and team, depart. */
async function baseTurn(port,store,seed,game,st,where,pay=false){
 const check=async(a,expectOk)=>{
  const before=store.envelope,raw=port.getItem(store.key);
  const r=await store.baseAction(a);
  if(r.ok){assert.equal(r.saved,true,`${where}: base write not saved`);roundTrip(port,store,where+' '+a.type);}
  else{st.rejections++;assert.deepEqual(store.envelope,before,`${where}: refused ${a.type} changed the record`);assert.equal(port.getItem(store.key),raw,`${where}: refused ${a.type} wrote storage`);}
  if(expectOk!==undefined)assert.equal(r.ok,expectOk,`${where}: ${JSON.stringify(a)} -> ${r.ok?'ok':r.error}`);
  return r;
 };
 st.probes+=4;
 // 7.4 part 2 (tactical policies only, switchable): pay every unpaid rescue the account allows, in the order the partners went missing.
 let paidNow=0;const account0=store.profile.account;
 if(pay)for(const r of [...store.profile.rescue])if(!r.paid&&store.profile.account>=ECON.rescueCost){
  const before=store.profile.account;await check({type:'rescue',inst:r.inst.id},true);
  assert.equal(store.profile.account,before-ECON.rescueCost,`${where}: rescue price`);st.paid++;st.spent+=ECON.rescueCost;paidNow++;
 }
 await check({type:'carry',inst:'P1',moves:['scratch','ember','scratch']},false);
 await check({type:'team',team:[],leader:'P1'},false);
 await check({type:'team',team:['P1','P2','P3','P1'],leader:'P1'},false);
 await check({type:'learn',inst:'P1',move:'notamove'},false);
 for(const move of Object.keys(store.profile.vault)){
  let learnedOne=true;
  while(learnedOne&&(store.profile.vault[move]??0)>0){
   learnedOne=false;
   for(const inst of store.profile.roster.map(i=>i.id)){
    const r=await check({type:'learn',inst,move});
    if(!r.ok)continue;
    const learned=store.profile.roster.find(i=>i.id===inst).learned,m=learned.find(l=>l.move===move);
    const keep=store.profile.roster.find(i=>i.id===inst).carry.map(n=>learned.find(l=>l.move===n)).find(l=>l&&l.move!==m.move);
    const r2=await check({type:'carry',inst,moves:keep?[move,keep.move]:[move]});assert.ok(r2.ok,`${where}: carry after learn refused: ${r2.error}`);
    st.learned++;learnedOne=true;break;
   }
  }
 }
 const roster=store.profile.roster;
 if(game%2===1&&roster.length>3){const newest=roster.at(-1).id;await check({type:'team',team:[newest,'P2','P3'],leader:'P3'},true);}
 else if(game>0)await check({type:'team',team:['P1','P2','P3'],leader:'P3'},true);
 const gseed=(seed*2654435761+game*40503)>>>0;
 const purse=game%2===0?Math.min(40,Math.floor(store.profile.account/ECON.purseStep)*ECON.purseStep):0;
 const campRaw=port.getItem(store.key),campWrites=port.writes();
 assert.equal(await store.depart(`soak-${seed}-${game}`,gseed,purse),true,`${where}: depart refused`);
 if(purse)assert.equal(store.state.purse,purse);
 if(paidNow>0&&purse===0&&(game%2===0?Math.min(40,Math.floor(account0/ECON.purseStep)*ECON.purseStep):0)>0)st.purseZeroByRescue++; // observation: paying emptied this run's purse
 memoryRun(port,store,where+' depart',campRaw,campWrites);
}

/** Forced-wipe variant: a profile with two ordinary partners (P3 pidgey, P4 zubat) next to the protected founder P1, and some money for rescues. */
const kit=(id,species,learned)=>({id,species,learned,carry:learned.map(l=>l.move),protected:false,tactic:'together'});
function doomedProfile(){
 const p=newGameProfile('chikorita','cyndaquil').profile;
 p.roster.push(kit('P3','pidgey',[{move:'tackle',pp:3},{move:'gust',pp:3}]),kit('P4','zubat',[{move:'absorb',pp:2},{move:'poisonfang',pp:1}]));
 p.next=5;p.team=['P1','P3','P4'];p.leader='P1';p.account=100;return p;
}
/** Base routine of the forced-wipe seeds: pay every rescue the account allows, put the first three roster members on the squad, set a purse, depart. */
async function doomedBase(port,store,seed,game,st,where){
 for(const r of [...store.profile.rescue])if(!r.paid&&store.profile.account>=ECON.rescueCost){
  const before=store.profile.account,res=await store.baseAction({type:'rescue',inst:r.inst.id});
  assert.ok(res.ok&&res.saved,`${where}: paying ${r.inst.id}: ${res.error}`);assert.equal(store.profile.account,before-ECON.rescueCost);st.paid++;st.spent+=ECON.rescueCost;roundTrip(port,store,where+' pay');
 }
 const poor=store.profile.rescue.find(r=>!r.paid);
 if(poor&&store.profile.account<ECON.rescueCost){ // refused with the missing amount, nothing written
  const raw=port.getItem(store.key),res=await store.baseAction({type:'rescue',inst:poor.inst.id});
  assert.equal(res.ok,false);assert.match(res.error,/还差\d+/);assert.equal(port.getItem(store.key),raw);st.rejections++;st.probes++;
 }
 const ids=store.profile.roster.map(i=>i.id).slice(0,3),origin=store.profile.origin;
 const res=await store.baseAction({type:'team',team:ids,leader:ids.includes(origin)?origin:ids[0]});assert.ok(res.ok&&res.saved,`${where}: team: ${res.error}`);roundTrip(port,store,where+' team');
 const purse=Math.min(40,Math.floor(store.profile.account/ECON.purseStep)*ECON.purseStep);
 const campRaw=port.getItem(store.key),campWrites=port.writes();
 assert.equal(await store.depart(`soak-${seed}-${game}`,(seed*2654435761+game*40503)>>>0,purse),true,`${where}: depart refused`);memoryRun(port,store,where+' depart',campRaw,campWrites);
}
/** The settlement rules written again independently of settleRun: what must hold between the profile before a run and the one after it. */
function checkSettlement(before,after,end,st,where,trk){
 if(end.effective)trk.eff++;
 st.income+=end.reward;st.refund+=end.refund;
 assert.equal(after.account,before.account+end.reward+end.refund,`${where}: account`);assert.ok(after.account>=0,`${where}: negative account`);
 const pool=new Map(before.rescue.map(r=>[r.inst.id,r]));
 for(const [id,r] of pool){
  const now=after.rescue.find(x=>x.inst.id===id),back=after.roster.some(i=>i.id===id),gone=after.lost.some(l=>l.id===id);
  if(!end.effective||r.left>1){
   const want=end.effective?r.left-1:r.left;
   assert.ok(now&&now.left===want&&now.paid===r.paid&&!back&&!gone,`${where}: ${id} should wait with ${want}`);
  }else if(r.paid){assert.ok(back&&!now&&!gone,`${where}: paid ${id} should return`);st.returned++;st.waitSum+=trk.eff-(trk.lostAt.get(id)??trk.eff);st.waitN++;}
  else{assert.ok(gone&&!now&&!back,`${where}: unpaid ${id} should be lost for good`);st.goneForGood++;}
 }
 const fresh=after.rescue.filter(x=>!pool.has(x.inst.id));
 assert.equal(fresh.length,end.lost.length,`${where}: pool newcomers vs the draw`);
 for(const x of fresh){assert.equal(x.left,ECON.window);assert.equal(x.paid,false);}
 st.lostPartners+=fresh.length;for(const x of fresh)trk.lostAt.set(x.inst.id,trk.eff);
 assert.ok(after.rescue.every(x=>!x.inst.protected)&&after.lost.length>=before.lost.length,`${where}: protected member in the pool or lost record shrank`);
 for(const i of before.roster.filter(i=>i.protected))assert.ok(after.roster.some(j=>j.id===i.id),`${where}: protected ${i.id} left the roster`);
 assert.ok(after.team.length>=1&&after.team.every(id=>after.roster.some(i=>i.id===id)),`${where}: squad not departable`);
}
export const seedOf=i=>1000+i*7919;
export async function playSeed(i,options={}){
 const policy=options.policy??'naive',tactical=policy==='tactical'||policy==='tactical-stand',cautious=policy==='cautious';
 assert.ok(['naive','tactical','tactical-stand','cautious'].includes(policy),`unknown policy ${policy}`);
 const payRescue=(tactical||cautious)&&options.payRescue!==false; // cautious pays rescues like tactical
 const seed=seedOf(i),port=memory(),st=stats(),games=[],doomed=i%4===3,extra=[],trk={eff:0,lostAt:new Map()},accTrail=[],rosterTrail=[];
 let store;const ref={};const moveUse={};
 if(i%2===0){ // Keep the legacy two-floor, no-profile fixture; it runs in memory, then seeds a camp at its ending.
  store=new TrialStore(port);const gseed=(seed*2654435761)>>>0;
  assert.equal(await store.start(createExpedition(`soak-${seed}-0`,gseed)),true);memoryRun(port,store,`seed ${seed} first legacy expedition`);
 }else{ // a player at the base with the initial profile
  store=new TrialStore(port);assert.equal(await store.beginNewGame(doomed?doomedProfile():initialProfile(),false),true,`seed ${seed}: initial camp save`);
  roundTrip(port,store,`seed ${seed} initial camp`);
  await (doomed?doomedBase:baseTurn)(port,store,seed,0,st,`seed ${seed} g0 base`,payRescue);
 }
 for(let g=0;g<GAMES;g++){
  const id=`seed ${seed} game ${g}`;
  const before=store.profile;
  ref.store=store;const x={};const r=await playRun(port,ref,id,st,!tactical&&!cautious&&i%3===2&&!doomed,doomed,g%2===0,!cautious&&(tactical||(i*5+g*3)%4<2),tactical?'tactical':cautious?'cautious':'naive',x,policy==='tactical-stand',moveUse);store=ref.store;extra.push({outcome:r.outcome,doomed,...x});games.push({seed,game:g,reckless:i%3===2,legacy:i%2===0&&g===0,doomed,...r});
  if(r.outcome==='timeout')break;
  const ended=structuredClone(store.state),endRecord=structuredClone(ended.end),terminalRaw=port.getItem(store.key),terminalWrites=port.writes();
  if(before){
   assert.equal(store.envelope.profile.expeditions,before.expeditions+1,`${id}: terminal camp was not settled`);
   assert.equal(Object.hasOwn(store.envelope,'current'),false,`${id}: terminal camp embeds World`);
   assert.equal(Object.hasOwn(store.envelope,'recent'),false,`${id}: terminal camp keeps recent World`);
   assert.equal(await store.returnToBase(),true,`${id}: returnToBase refused`);
   assert.equal(port.getItem(store.key),terminalRaw,`${id}: returning to camp changed saved bytes`);
   assert.equal(port.writes(),terminalWrites,`${id}: returning to camp wrote storage`);
   roundTrip(port,store,`${id} return`);
  }else{
   // The original first expedition has no camp profile; settlement creates its first camp after the result.
   const settled=settleRun(null,ended);assert.ok(settled,`${id}: legacy first run could not seed the camp`);
   assert.equal(await store.beginNewGame(settled,false),true,`${id}: legacy first-run camp save failed`);
   assert.equal(port.writes(),terminalWrites+1,`${id}: first camp should be written once after the run`);
   roundTrip(port,store,`${id} first camp`);
  }
  assert.equal(store.atBase,true);assert.ok(store.profile.expeditions>=1);
  if(before)assert.equal(store.profile.expeditions,before.expeditions+1);
  assert.equal(Object.hasOwn(store.envelope,'recent'),false,`${id}: camp envelope contains recent`);
  checkSettlement(before??initialProfile(),store.profile,endRecord,st,id,trk);accTrail.push(store.profile.account);rosterTrail.push(store.profile.roster.length);
  if(g===GAMES-1)break;
  await (doomed?doomedBase:baseTurn)(port,store,seed,g+1,st,`${id} base`,payRescue);
 }
 return {seed,games,st,moveUse,roster:store.profile?.roster.length??0,vault:store.profile?.vault??{},extra,account:store.profile?.account??null,doomed,policy,payRescue,accTrail,rosterTrail};
}
