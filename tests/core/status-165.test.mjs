import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  applyCommand, createExpedition, createMain, jumpToFloor, friend, key, rngStep, hitChance, accuracyMultiplier, stageOf, bagFull, PROG, ITEM_CURES, recruitUnit, RULE_VERSION, CONTENT_VERSION,
} from '../../src/core/engine.ts';
import {moveEffects,moveOf} from '../../src/core/moves.ts';
import {ALL_TM_MOVES,SPECIES,TM_MOVES,TM_MOVES_V3,learnableMove} from '../../src/core/roster.ts';
import {initialProfile,migrateProfilePp,profileProblem,squadOf} from '../../src/core/base.ts';
import {TrialStore,decode,BUILD_ID} from '../../src/core/save.ts';
import {foeOf} from './foe-fixture.mjs';
import {sureHit} from './sure-hit.mjs';

/*
 * 8.8 (#165) rules: hit chance, status conditions, stages, PP, floor items and the save migration. The spec is docs/02-进度/计划/8.8命中状态与PP规格.md.
 * Random outcomes are made exact by choosing the state of the battle random stream (`battleRng`): `rngStep(state).value` is the next draw.
 */
const rect=(x1,x2,y1,y2)=>Array.from({length:(x2-x1+1)*(y2-y1+1)},(_,i)=>({x:x1+i%(x2-x1+1),y:y1+Math.floor(i/(x2-x1+1))}));
let sequence=0;
function world({floor=rect(0,8,0,8),friends=[friend('A',1,1,60,{tackle:5})],enemies=[],hit=true}={}){
  const s=createMain(`status165-${++sequence}`,false);
  s.floor=floor;s.seen=floor.map(key);s.units=Object.fromEntries([...friends,...enemies].map(u=>[u.id,u]));
  s.queue=friends.map(u=>u.id);s.enemies=enemies.map(u=>u.id);s.leader=s.queue[0];s.camp=[];s.points=[];s.log=[];
  delete s.rooms;delete s.dungeon;delete s.prog;delete s.tms;delete s.shop;delete s.exchange;s.purse=0;
  return hit?sureHit(s):s;
}
const still=(id,species,x,y,hp,moves)=>{const e=foeOf(id,species,x,y,hp,moves);e.waitOnly=true;return e;};
function equip(u,id,pp=5){if(!u.learned.includes(id))u.learned.push(id);u.pp[id]=pp;u.maxPp[id]=pp;}
const cmd=(s,action,override)=>applyCommand(s,{type:'round',action,...(override?{override}:{})});
function play(s,action,override){const r=cmd(s,action,override);assert.equal(r.ok,true,r.ok?'':r.error);return r.state;}
const skill=(s,id,move,target)=>play(s,{type:'skill',skill:move,target});
/** The first battle-stream state whose next draw satisfies `pred`. */
const stateWhere=pred=>{for(let st=1;;st++)if(pred(rngStep(st).value))return st;};
const LOW=stateWhere(v=>v<0.005),HIGH=stateWhere(v=>v>0.995);
const rollsFrom=(state,n)=>{const out=[];for(let i=0;i<n;i++){const r=rngStep(state);out.push(r.value);state=r.state;}return out;};
const wait={type:'wait'};

/* ---------- hit ---------- */
test('H1 stage multiplier: n>=0 gives (3+n)/3, n<0 gives 3/(3-n), clamped to -3...+3',()=>{
  assert.deepEqual([-5,-3,-2,-1,0,1,2,3,5].map(accuracyMultiplier),[0.5,0.5,0.6,0.75,1,4/3,5/3,2,2]);
});
test('H2 hit chance: always-hit moves stay at 100, a percentage scales with stages and caps at 100, a basic attack is 100 unless its user\'s accuracy is lowered',()=>{
  const a=friend('A',1,1,60,{roar:5,tackle:5,swordsdance:5}),e=still('E','geodude',2,1,60);
  const s=world({friends:[a],enemies:[e],hit:false});
  assert.equal(moveEffects('roar').acc,null);assert.equal(hitChance(s,'A','E','roar'),100);
  assert.equal(hitChance(s,'A','E','swordsdance'),100);                                  // self buffs never roll
  assert.equal(moveEffects('tackle').acc,95);assert.equal(hitChance(s,'A','E','tackle'),95);
  assert.equal(hitChance(s,'A','E'),100);                                                // basic attack
  s.units.A.stages.acc=-1;assert.equal(hitChance(s,'A','E','tackle'),95*0.75);assert.equal(hitChance(s,'A','E'),75);
  s.units.A.stages.acc=-3;s.units.E.stages={...s.units.E.stages,eva:3};assert.equal(hitChance(s,'A','E','tackle'),95*0.5);   // -3 - 3 clamps to -3
  s.units.A.stages.acc=2;s.units.E.stages.eva=0;assert.equal(hitChance(s,'A','E','tackle'),100);assert.equal(hitChance(s,'A','E'),100);   // plus stages never raise a basic attack
  s.units.A.stages.acc=-2;assert.equal(hitChance(s,'A','E','roar'),100);
});
test('H3 a miss takes no damage and no side effect, still spends PP and is reported; a hit with the same stream state lands',()=>{
  const mk=()=>{const a=friend('A',1,1,60);equip(a,'nuzzle',3);const e=still('E','geodude',2,1,60);return world({friends:[a],enemies:[e],hit:false});};
  const missed=mk();missed.battleRng=HIGH;   // next draw ~1.0 >= 50%
  const m=skill(missed,'A','nuzzle','E');
  assert.equal(m.units.E.hp,60);assert.equal(m.units.E.status,undefined);assert.equal(m.units.A.pp.nuzzle,2);
  assert.deepEqual(m.events,[{type:'miss',actor:'A',target:'E',skill:'nuzzle'}]);assert.ok(m.log.some(l=>l.includes('没打中E')));
  assert.equal(m.battleRng,rngStep(HIGH).state,'only the hit roll was drawn; no side-effect roll after a miss');
  const landed=mk();landed.battleRng=LOW;
  const h=skill(landed,'A','nuzzle','E');
  assert.ok(h.units.E.hp<60);assert.ok(h.units.E.status.par);assert.equal(h.events?.some(e=>e.type==='miss')??false,false);
});
test('H4 the same seed and the same commands give the same outcome; battle draws leave the recruit and enemy-AI streams alone',()=>{
  const run=()=>{const a=friend('A',1,1,60);equip(a,'bite',9);const e=foeOf('E','geodude',2,1,60);const s=world({friends:[a],enemies:[e],hit:false});s.runId='h4';s.prog={level:5,exp:0,rng:12345,made:0,kills:[],items:{berry:0,tonic:0}};s.enemyAiRng=777;
    let t=s;for(let i=0;i<6;i++)t=play(t,{type:'skill',skill:'bite',target:'E'});return t;};
  const x=run(),y=run();
  assert.deepEqual(x,y);assert.notEqual(x.battleRng,undefined);
  assert.equal(x.prog.rng,12345,'recruit stream untouched');assert.equal(x.enemyAiRng,777,'enemy AI stream untouched');
});
test('H5 the enemy rolls and misses the same way, and an accuracy-lowered basic attack can miss',()=>{
  const a=friend('A',1,1,60,{tackle:5});const e=foeOf('E','geodude',2,1,60,{tackle:5});
  const s=world({friends:[a],enemies:[e],hit:false});s.battleRng=HIGH;
  const r=play(s,wait);assert.equal(r.units.A.hp,60);assert.ok(r.events.some(v=>v.type==='miss'&&v.actor==='E'&&v.target==='A'));
  const b=world({friends:[friend('A',1,1,60)],enemies:[still('E','geodude',2,1,60)],hit:false});b.units.A.stages.acc=-1;b.battleRng=HIGH;   // 75%
  const m=play(b,{type:'basic',target:'E'});assert.equal(m.units.E.hp,60);assert.deepEqual(m.events,[{type:'miss',actor:'A',target:'E',skill:null}]);
  const full=world({friends:[friend('A',1,1,60)],enemies:[still('E','geodude',2,1,60)],hit:false});full.battleRng=HIGH;
  assert.ok(play(full,{type:'basic',target:'E'}).units.E.hp<60,'a plain basic attack never misses and draws nothing');assert.equal(play(full,{type:'basic',target:'E'}).battleRng,HIGH);
});
test('H6 an attack with target "all" (a line that can catch a companion) is judged against each unit it hits',()=>{
  assert.equal(moveOf('icebeam').target,'all');
  const a=friend('A',1,1,60);equip(a,'icebeam',3);const s=world({friends:[a],enemies:[still('E','geodude',2,1,60)],hit:false});s.battleRng=HIGH;
  const r=skill(s,'A','icebeam','E');assert.equal(r.units.E.hp,60);assert.ok(r.events.some(v=>v.type==='miss'));
});

/* ---------- status conditions ---------- */
test('S1 paralysis: applied by a 100% side effect, lasts 2-3 of the victim\'s own action opportunities, blocks moves and basic attacks but not walking',()=>{
  const a=friend('A',1,1,60);equip(a,'nuzzle',3);
  const e=foeOf('E','geodude',2,1,60,{tackle:5});const s=world({friends:[a],enemies:[e]});s.battleRng=LOW;
  const expected=2+Math.floor(rngStep(LOW).value*2);   // the world is sure-hit (no hit roll) and a 100% side effect draws nothing, so the first draw is the duration
  const r=skill(s,'A','nuzzle','E');
  // E acts in the same round's enemy phase: it is paralysed, so its tackle is lost and the PP is kept; the opportunity counts down.
  assert.equal(r.units.A.hp,60);assert.equal(r.units.E.pp.tackle,5);assert.equal(r.units.E.status.par.left,expected-1);
  assert.ok(r.log.some(l=>l.includes('E麻痹中，无法使用招式和普攻')));
  assert.ok(r.events.some(v=>v.type==='status'&&v.target==='E'&&v.status==='par'&&v.change==='apply'));
  let t=r;for(let i=1;i<expected;i++)t=play(t,wait);
  assert.equal(t.units.E.status,undefined,'gone after its own opportunities ran out');
  assert.ok(t.events.some(v=>v.type==='status'&&v.change==='expire'));
});
test('S2 a paralysed friend\'s command is accepted and the action is lost without spending PP; moving still works',()=>{
  const a=friend('A',1,1,60,{tackle:5});a.status={par:{left:2}};const e=still('E','geodude',2,1,60);const s=world({friends:[a],enemies:[e]});
  const lost=play(s,{type:'skill',skill:'tackle',target:'E'});assert.equal(lost.units.E.hp,60);assert.equal(lost.units.A.pp.tackle,5);assert.equal(lost.units.A.status.par.left,1);
  const basic=play(s,{type:'basic',target:'E'});assert.equal(basic.units.E.hp,60);
  const walk=play(s,{type:'move',to:{x:1,y:2}});assert.deepEqual(walk.units.A.pos,{x:1,y:2});
});
test('S3 flinch lasts one own action opportunity; a unit hit before it acts loses that action',()=>{
  const a=friend('A',1,1,60);equip(a,'fakeout',3);const e=foeOf('E','geodude',3,1,60,{tackle:5});e.pos={x:2,y:1};const s=world({friends:[a],enemies:[e]});s.battleRng=LOW;
  const r=skill(s,'A','fakeout','E');
  assert.equal(r.units.A.hp,60,'E flinched in its own phase');assert.equal(r.units.E.status,undefined,'and the flinch is gone afterwards');
  assert.ok(r.events.some(v=>v.status==='flinch'&&v.change==='apply'));assert.ok(r.events.some(v=>v.status==='flinch'&&v.change==='expire'));
});
test('S4 poison, bad poison and burn: first damage at the first round end, then every 20 / 2 / 20 rounds; amounts are max(1, floor(maxHp / 12 or 8))',()=>{
  const a=friend('A',1,1,60);a.maxHp=60;a.status={psn:{tick:1}};const t=friend('T',2,1,50);t.maxHp=50;t.status={tox:{tick:1}};const u=friend('U',3,1,11);u.maxHp=11;u.status={brn:{tick:1}};
  let s=world({friends:[a,t,u],enemies:[still('E','geodude',8,8,60)]});
  const hp=()=>[s.units.A.hp,s.units.T.hp,s.units.U.hp];
  s=play(s,wait);assert.deepEqual(hp(),[60-5,50-6,11-1]);   // floor(60/12)=5, floor(50/8)=6, max(1,floor(11/12))=1
  s=play(s,wait);assert.deepEqual(hp(),[55,44,10]);          // round 2: nobody ticks
  s=play(s,wait);assert.deepEqual(hp(),[55,38,10]);          // round 3: the bad poison ticks again (every 2 rounds)
  s=play(s,wait);s=play(s,wait);assert.equal(s.units.T.hp,32);   // round 5
  for(let i=0;i<15;i++)s=play(s,wait);   // rounds 6-20
  assert.deepEqual([s.units.A.hp,s.units.U.hp],[55,10],'not yet at round 20');
  s=play(s,wait);assert.deepEqual([s.units.A.hp,s.units.U.hp],[50,9],'round 21 is the second tick of poison and burn');
  assert.ok(s.events.some(v=>v.type==='statusDamage'&&v.target==='A'&&v.status==='psn'&&v.amount===5));
});
test('S5 status damage can defeat a unit (an enemy dying to poison counts as a defeat) and a frozen unit takes none',()=>{
  const a=friend('A',1,1,60);const e=still('E','geodude',5,5,2);e.maxHp=24;e.status={psn:{tick:1}};
  const s=play(world({friends:[a],enemies:[e]}),wait);assert.equal(s.units.E.hp,0);assert.equal(s.units.E.pos,null);
  const f=still('F','geodude',5,5,24);f.status={psn:{tick:1},frz:{left:3}};
  const r=play(world({friends:[friend('A',1,1,60)],enemies:[f]}),wait);assert.equal(r.units.F.hp,24);assert.ok(r.log.some(l=>l.includes('F冰冻中，不受伤害')));
});
test('S6 frozen: no action, no damage from attacks except a thawing hit (fire move or Scald), whose damage still counts',()=>{
  const mk=(move)=>{const a=friend('A',1,1,60);equip(a,move,3);const e=still('E','geodude',2,1,60);e.status={frz:{left:3}};return world({friends:[a],enemies:[e]});};
  const tackle=skill(mk('tackle'),'A','tackle','E');assert.equal(tackle.units.E.hp,60);assert.equal(tackle.units.E.status.frz.left,2);
  assert.equal(play(mk('tackle'),{type:'basic',target:'E'}).units.E.hp,60);
  for(const move of ['ember','scald']){const r=skill(mk(move),'A',move,'E');assert.ok(r.units.E.hp<60,move);assert.equal(r.units.E.status?.frz,undefined,`${move} thawed it`);}
  const walk=play(world({friends:[Object.assign(friend('A',1,1,60),{status:{frz:{left:2}}})],enemies:[still('E','geodude',5,5,30)]}),{type:'move',to:{x:1,y:2}});
  assert.deepEqual(walk.units.A.pos,{x:1,y:1},'a frozen friend cannot move; the command is accepted and the turn is used');assert.equal(walk.units.A.status.frz.left,1);
  const counter=friend('C',1,1,60);counter.counter=3;const hitter=foeOf('H','geodude',2,1,60,{tackle:5});hitter.status={frz:{left:3}};
  const c=play(world({friends:[counter],enemies:[hitter]}),wait);assert.equal(c.units.H.hp,60,'a frozen enemy neither acts nor is hurt by a counter');
});
test('S7 stacking: freeze and burn replace each other; bad poison replaces poison and poison never replaces bad poison; others coexist',()=>{
  const mk=(move,status)=>{const a=friend('A',1,1,60);equip(a,move,3);const e=still('E','geodude',2,1,200);e.status=status;const s=world({friends:[a],enemies:[e]});s.battleRng=LOW;return s;};
  const frozen=skill(mk('icebeam',{brn:{tick:1},par:{left:2}}),'A','icebeam','E');   // draws: hit (83.6%), chance (10%), duration
  assert.ok(frozen.units.E.status.frz);assert.equal(frozen.units.E.status.brn,undefined);assert.ok(frozen.units.E.status.par,'paralysis stays');
  const burnt=skill(mk('inferno',{frz:{left:3}}),'A','inferno','E');
  assert.ok(burnt.units.E.status.brn);assert.equal(burnt.units.E.status.frz,undefined);assert.ok(burnt.units.E.hp<200,'the thawing hit still did damage');
  const tox=skill(mk('poisonfang',{psn:{tick:5}}),'A','poisonfang','E');assert.ok(tox.units.E.status.tox);assert.equal(tox.units.E.status.psn,undefined);
  const stays=skill(mk('poisonsting',{tox:{tick:1}}),'A','poisonsting','E');assert.ok(stays.units.E.status.tox);assert.equal(stays.units.E.status.psn,undefined);
  assert.ok(stays.events.some(v=>v.status==='tox'&&v.change==='unchanged'));
  const both=skill(mk('dynamicpunch',{brn:{tick:1},psn:{tick:1}}),'A','dynamicpunch','E');
  assert.ok(both.units.E.status.confusion&&both.units.E.status.brn&&both.units.E.status.psn);
  const again=skill(mk('nuzzle',{par:{left:1}}),'A','nuzzle','E');assert.ok(again.units.E.status.par.left>=2-1,'the duration is drawn again');
});
test('S8 a guarded target (Protect) gets neither damage nor side effects; a burned attacker deals 80% (floor, at least 1)',()=>{
  const a=friend('A',1,1,60);equip(a,'nuzzle',3);const e=still('E','geodude',2,1,60);e.protect=2;const s=world({friends:[a],enemies:[e]});s.battleRng=LOW;
  const r=skill(s,'A','nuzzle','E');assert.equal(r.units.E.hp,60);assert.equal(r.units.E.status,undefined);
  const mk=(brn)=>{const x=friend('A',1,1,60);x.pp.tackle=5;x.maxPp.tackle=5;x.learned=['tackle'];if(brn)x.status={brn:{tick:20}};return world({friends:[x],enemies:[still('E','geodude',2,1,100)]});};
  const plain=100-play(mk(false),{type:'skill',skill:'tackle',target:'E'}).units.E.hp,burned=100-play(mk(true),{type:'skill',skill:'tackle',target:'E'}).units.E.hp;
  assert.ok(plain>=2);assert.equal(burned,Math.max(1,Math.floor(plain*4/5)));
});
test('S9 enemies are subject to the same rules: an enemy move can paralyse a friend, and a friend\'s turn is lost',()=>{
  const a=friend('A',1,1,60,{tackle:5});const e=foeOf('E','geodude',2,1,60,{nuzzle:3});const s=world({friends:[a],enemies:[e]});s.battleRng=LOW;
  const r=play(s,wait);assert.ok(r.units.A.status?.par,'the friend is paralysed by the enemy move');
  const t=play(r,{type:'skill',skill:'tackle',target:'E'});assert.equal(t.units.A.pp.tackle,5);
});
test('S10 confusion: a move command is replaced by a random one of eight directions (blocked means standing still); strikes go to whatever is in the random direction, including a companion',()=>{
  const dirs=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1},{x:1,y:1},{x:-1,y:1},{x:-1,y:-1},{x:1,y:-1}];
  const build=(state)=>{const a=friend('A',3,3,60,{tackle:5});a.status={confusion:{left:7}};const s=world({friends:[a],enemies:[still('E','geodude',8,8,60)]});s.battleRng=state;return s;};
  for(const st of [1,2,3,4,5,6,7,8,9,10]){
    const d=dirs[Math.floor(rngStep(st).value*8)],r=play(build(st),{type:'move',to:{x:4,y:3}});
    assert.deepEqual(r.units.A.pos,{x:3+d.x,y:3+d.y},`state ${st}`);assert.equal(r.units.A.status.confusion.left,6);
  }
  // a wall in the drawn direction: no movement, the action is still used
  const st=stateWhere(v=>Math.floor(v*8)===2);const wall=build(st);wall.floor=wall.floor.filter(c=>!(c.x===2&&c.y===3));wall.seen=wall.floor.map(key);
  const stuck=play(wall,{type:'move',to:{x:4,y:3}});assert.deepEqual(stuck.units.A.pos,{x:3,y:3});assert.ok(stuck.log.some(l=>l.includes('原地不动')));
  // a strike: companion B stands to the left (direction index 2), the enemy to the right
  const sr=stateWhere(v=>Math.floor(v*8)===2);
  const a=friend('A',3,3,60);equip(a,'tackle',5);a.status={confusion:{left:7}};const b=friend('B',2,3,60);const e=still('E','geodude',4,3,60);
  const s=world({friends:[a,b],enemies:[e]});s.battleRng=sr;
  const hit=play(s,{type:'skill',skill:'tackle',target:'E'});assert.ok(hit.units.B.hp<60,'the companion took the hit');assert.equal(hit.units.E.hp,60);
  const sr2=stateWhere(v=>Math.floor(v*8)===0);const s2=world({friends:[a,b],enemies:[e]});s2.battleRng=sr2;
  assert.ok(play(s2,{type:'basic',target:'E'}).units.E.hp<60,'direction 0 (right) reaches the enemy even for a basic attack');
  const sr3=stateWhere(v=>Math.floor(v*8)===3);const s3=world({friends:[a,b],enemies:[e]});s3.battleRng=sr3;
  const empty=play(s3,{type:'skill',skill:'tackle',target:'E'});assert.equal(empty.units.E.hp,60);assert.equal(empty.units.B.hp,60);assert.equal(empty.units.A.pp.tackle,4,'a whiffed strike still costs PP');
});
test('S11 statuses and stages are cleared when the team changes floor', ()=>{
  const s=createExpedition('s11',3);s.units.A.status={psn:{tick:3},par:{left:2}};s.units.A.stages={atk:1,def:0,spa:2,acc:-1};
  const next=jumpToFloor(s,2);assert.equal(next.units.A.status,undefined);assert.deepEqual(next.units.A.stages,{atk:0,def:0});
});

/* ---------- items ---------- */
function bagWorld(items,statusOn='A'){
  const a=friend('A',1,1,30,{tackle:5}),b=friend('B',2,1,30,{tackle:5});const s=world({friends:[a,b],enemies:[still('E','geodude',8,8,30)]});
  s.prog={level:5,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0,...items}};return s;
}
test('I1 cure items: each cures its own conditions, is refused (and kept) when none apply, and works on a companion next to the user',()=>{
  const cases=[['pechaBerry','psn'],['pechaBerry','tox'],['rawstBerry','brn'],['cheriBerry','par'],['healSeed','frz'],['healSeed','confusion'],['healSeed','flinch'],['healSeed','tox']];
  for(const [item,st] of cases){
    const s=bagWorld({[item]:1});s.units.B.status={[st]:{left:2,tick:2}};   // on the companion: a frozen user could not act
    const r=play(s,{type:'use',item,target:'B'});assert.equal(r.units.B.status,undefined,`${item} cures ${st}`);assert.equal(r.prog.items[item],0);
    assert.ok(r.events.some(v=>v.type==='status'&&v.status===st&&v.change==='cure'));
  }
  const wrong=bagWorld({rawstBerry:1});wrong.units.A.status={par:{left:2}};
  const bad=cmd(wrong,{type:'use',item:'rawstBerry',target:'A'});assert.equal(bad.ok,false);assert.match(bad.error,/没有木子果能治好的状态/);assert.deepEqual(bad.state,wrong);
  const none=bagWorld({healSeed:1});assert.equal(cmd(none,{type:'use',item:'healSeed',target:'A'}).ok,false);
  const mate=bagWorld({cheriBerry:1});mate.units.B.status={par:{left:3}};
  const m=play(mate,{type:'use',item:'cheriBerry',target:'B'});assert.equal(m.units.B.status,undefined);
  const far=bagWorld({cheriBerry:1});far.units.B.pos={x:5,y:5};far.units.B.status={par:{left:3}};assert.equal(cmd(far,{type:'use',item:'cheriBerry',target:'B'}).ok,false);
  const mixed=bagWorld({pechaBerry:1});mixed.units.A.status={psn:{tick:2},par:{left:3}};
  assert.deepEqual(Object.keys(play(mixed,{type:'use',item:'pechaBerry',target:'A'}).units.A.status),['par'],'only its own conditions are cured');
  for(const [item,list] of Object.entries(ITEM_CURES))assert.ok(list.length>=1,item);
});
test('I2 a PP tonic restores 10 per move, a team tonic 5, both capped at the maximum; the rest point refills every move by 5',()=>{
  assert.deepEqual([PROG.tonicPp,PROG.teamTonicPp,PROG.restPp],[10,5,5]);
  const s=bagWorld({tonic:1,teamTonic:1});s.units.A.learned=['tackle','scratch'];s.units.A.maxPp={tackle:30,scratch:28};s.units.A.pp={tackle:0,scratch:25};
  const t=play(s,{type:'use',item:'tonic',target:'A'});assert.deepEqual(t.units.A.pp,{tackle:10,scratch:28});
  const team=play(s,{type:'use',item:'teamTonic',target:'A'});assert.deepEqual(team.units.A.pp,{tackle:5,scratch:28});
});
test('I3 walking onto a floor item picks it up at once (no extra action); interacting is only a retry; a full bag leaves it on the floor',()=>{
  const s=bagWorld({});s.points=[{pos:{x:1,y:2},kind:'pechaBerry',used:false},{pos:{x:2,y:2},kind:'berry',used:false}];
  const r=play(s,{type:'move',to:{x:1,y:2}});
  assert.equal(r.prog.items.pechaBerry,1);assert.equal(r.points[0].used,true);assert.equal(r.round,1);
  assert.deepEqual(r.events.filter(e=>e.type==='pickup'),[{type:'pickup',actor:'A',item:'pechaBerry',ok:true}]);
  const again=cmd(r,{type:'interact',exit:false});assert.equal(again.ok,false);assert.match(again.error,/已拾取|必须站在/);
  // a companion who is swapped onto the item also takes it; the item cell is a normal swap target
  const sw=bagWorld({});sw.points=[{pos:{x:2,y:1},kind:'healSeed',used:false}];
  const swapped=play(sw,{type:'move',to:{x:2,y:1}});assert.equal(swapped.prog.items.healSeed,1,'A swapping with B lands on the seed cell');
  // bag full: nothing is taken; the point stays; the same cell can be retried once there is room
  PROG.bagLimit=0;
  try{
    assert.equal(bagFull(s),true);
    const full=play(s,{type:'move',to:{x:1,y:2}});assert.equal(full.prog.items.pechaBerry??0,0);assert.equal(full.points[0].used,false);
    assert.deepEqual(full.events.filter(e=>e.type==='pickup'),[{type:'pickup',actor:'A',item:'pechaBerry',ok:false}]);
    PROG.bagLimit=null;
    const retry=play(full,{type:'interact',exit:false});assert.equal(retry.prog.items.pechaBerry,1);assert.equal(retry.points[0].used,true);
  }finally{PROG.bagLimit=null;}
});
test('I4 floor items come from the five-item table; the shop sells a Pecha Berry (20) and a Heal Seed (40) once each',()=>{
  const s=createExpedition('i4',2,3,squadOf(initialProfile()),0);
  for(const seed of [2,3,6,10,11]){const w=createExpedition('i4',seed,3,squadOf(initialProfile()),0);if(w.shop){assert.equal(w.shop.stock.pechaBerry,1);assert.equal(w.shop.stock.healSeed,1);}}
  const w=createExpedition('i4s',2,3,squadOf(initialProfile()),0);w.purse=100;w.units[w.leader].pos={...w.points.find(p=>p.kind==='shop').pos};
  let r=applyCommand(w,{type:'buy',item:'pechaBerry'});assert.equal(r.ok,true,r.error);assert.equal(r.state.purse,80);assert.equal(r.state.prog.items.pechaBerry,1);
  r=applyCommand(r.state,{type:'buy',item:'pechaBerry'});assert.equal(r.ok,false);assert.match(r.error,/售罄/);
  r=applyCommand(w,{type:'buy',item:'healSeed'});assert.equal(r.ok,true,r.error);assert.equal(r.state.purse,60);assert.equal(r.state.prog.items.healSeed,1);
  void s;
});

/* ---------- stages ---------- */
test('G1 special moves use the special attack and defence stages; physical ones use attack and defence',()=>{
  const mk=(move,edit)=>{const a=friend('A',1,1,60);equip(a,move,3);const e=still('E','geodude',2,1,200);edit(a,e);return skill(world({friends:[a],enemies:[e]}),'A',move,'E');};
  const none=200-mk('ember',()=>{}).units.E.hp;
  assert.equal(200-mk('ember',(a,e)=>{e.stages.def=3;}).units.E.hp,none,'defence stage does not touch a special move');
  assert.equal(200-mk('ember',(a,e)=>{e.stages.spd=3;}).units.E.hp,none-3);
  assert.equal(200-mk('ember',(a,e)=>{a.stages.spa=2;}).units.E.hp,none+2);
  const phys=200-mk('tackle',()=>{}).units.E.hp;
  assert.equal(200-mk('tackle',(a,e)=>{e.stages.def=2;}).units.E.hp,phys-2);assert.equal(200-mk('tackle',(a,e)=>{e.stages.spd=3;}).units.E.hp,phys);
  assert.equal(stageOf({stages:{atk:0,def:0}},'spa'),0);assert.equal(stageOf({stages:{atk:0,def:0}},'spe'),0);
});
test('G2 the 29 stat-lowering side effects map to the stages; speed changes do not take effect; the 7 self-raising ones raise the user',()=>{
  const effects=JSON.parse(readFileSync(new URL('../../src/data/move-effects.json',import.meta.url),'utf8')).moves;
  const foe=Object.entries(effects).filter(([,m])=>(m.fx??[]).some(f=>f.foe)),self=Object.entries(effects).filter(([,m])=>(m.fx??[]).some(f=>f.self));
  assert.equal(foe.length,29);assert.equal(self.length,7);
  const lowest=(m,move)=>{const a=friend('A',1,1,60);equip(a,move,3);const e=still('E','geodude',2,1,300);return {a,e};};
  for(const [move,spec] of [...foe,...self]){
    const entry=spec.fx.find(f=>f.foe||f.self),{a,e}=lowest(spec,move);
    const s=world({friends:[a],enemies:[e]});
    // the first fx entry of the move is the one we look at; make sure its chance roll passes and that earlier entries (if any) cannot interfere
    s.battleRng=stateWhere(v=>v<0.005);
    const r=skill(s,'A',move,['room','user'].includes(moveOf(move).range)?'A':'E');
    // sure-hit gives everyone accuracy +3, so an accuracy drop is counted from there
    if(entry.foe)for(const [stat,change] of Object.entries(entry.foe))assert.equal(stageOf(r.units.E,stat)-(stat==='acc'?3:0),stat==='spe'?0:Math.max(-3,change),`${move} lowers ${stat}`);
    if(entry.self)for(const [stat,change] of Object.entries(entry.self)){
      // a self boost rolls once per side effect with the draw below its chance; with the draw at 0.005 every chance passes
      assert.equal(stageOf(r.units.A,stat),stat==='spe'?0:change,`${move} raises ${stat} of the user`);
    }
  }
});
test('G3 the six self-cost moves lower the user\'s stats after use when they connect with a target (speed has no effect); a move that misses everything costs nothing',()=>{
  const cost={closecombat:{def:-1,spd:-1},dracometeor:{spa:-2},hammerarm:{},leafstorm:{spa:-2},overheat:{spa:-2},superpower:{atk:-1,def:-1}};
  for(const [move,expected] of Object.entries(cost)){
    assert.ok(moveEffects(move).cost,move);
    for(const miss of [false,true]){
      const a=friend('A',1,1,60);equip(a,move,3);const e=still('E','geodude',2,1,300);const s=world({friends:[a],enemies:[e],hit:!miss});s.battleRng=miss?HIGH:LOW;
      const r=skill(s,'A',move,['room','user'].includes(moveOf(move).range)?'A':'E');
      for(const stat of ['atk','def','spa','spd','eva'])assert.equal(stageOf(r.units.A,stat),miss?0:(expected[stat]??0),`${move} ${stat} ${miss?'(missed: no price)':''}`);
      if(miss)assert.equal(r.units.E.hp,300);
    }
  }
});
test('G4 the battle only reads accuracy and stage keys it knows; statuses survive a structured clone', ()=>{
  const a=friend('A',1,1,60);a.status={psn:{tick:3},confusion:{left:9}};const s=world({friends:[a],enemies:[still('E','geodude',5,5,30)]});
  assert.deepEqual(structuredClone(play(s,wait).units.A.status),play(s,wait).units.A.status);
});

/* ---------- PP and save migration ---------- */
test('P1 maximum PP is the official basePp for every move of every species; Tera Blast is gone from machines and learnable lists; partners arrive with full PP',()=>{
  const defs=JSON.parse(readFileSync(new URL('../../src/data/pmd-moves.json',import.meta.url),'utf8')).moves;
  for(const sp of Object.values(SPECIES))for(const m of [...sp.kit,...sp.learnable]){
    const official=defs[m.move].official?.basePp;assert.equal(m.pp,official?Number(official):40,`${sp.id}/${m.move}`);assert.notEqual(m.move,'terablast');
  }
  assert.equal(SPECIES.treecko.kit.find(k=>k.move==='leafage').pp,40);
  assert.equal(TM_MOVES.length,6);assert.equal(TM_MOVES_V3.length,9);assert.equal(ALL_TM_MOVES.length,9);assert.ok(!ALL_TM_MOVES.includes('terablast'));
  assert.equal(learnableMove('geodude','terablast'),undefined);
  const u=recruitUnit('N1','pidgey',6);assert.deepEqual(u.pp,u.maxPp);assert.equal(u.hp,Math.max(1,Math.floor(u.maxHp/2)));
});
function oldCamp(){
  // a trial-rules-5 record written before 8.8: old frozen PP values, a Tera Blast on a learned list, in the carry list and in the vault
  const p=initialProfile();
  p.roster[0].learned=[{move:'scratch',pp:3},{move:'ember',pp:2},{move:'terablast',pp:1},{move:'protect',pp:1}];p.roster[0].carry=['ember','terablast'];
  p.roster[1].learned=[{move:'tackle',pp:3},{move:'watergun',pp:2}];
  p.vault={terablast:2,protect:1};
  p.rescue=[{inst:{id:'P9',species:'pidgey',learned:[{move:'tackle',pp:3},{move:'gust',pp:3},{move:'terablast',pp:1}],carry:['gust','terablast'],protected:false,tactic:'together'},paid:false,left:2}];p.next=10;
  return {format:2,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:4,profile:p};
}
test('P2 an old rules-5 camp record is migrated on load: official PP, no Tera Blast anywhere, everything else kept',()=>{
  const env=decode(JSON.stringify(oldCamp()));
  const [a,b]=env.profile.roster;
  assert.deepEqual(a.learned,[{move:'scratch',pp:28},{move:'ember',pp:15},{move:'protect',pp:10}]);assert.deepEqual(a.carry,['ember']);
  assert.deepEqual(b.learned,[{move:'tackle',pp:30},{move:'watergun',pp:17}]);
  assert.deepEqual(env.profile.vault,{protect:1});
  assert.deepEqual(env.profile.rescue[0].inst.learned,[{move:'tackle',pp:30},{move:'gust',pp:19}]);assert.deepEqual(env.profile.rescue[0].inst.carry,['gust']);
  assert.equal(profileProblem(env.profile),null);
  assert.deepEqual(decode(JSON.stringify(env)),env,'idempotent: a migrated record decodes to itself');
  assert.equal(env.sequence,4);assert.equal(env.rules,RULE_VERSION);
});
test('P3 loading an old record through the store migrates it and the next camp write saves the new values; a bad record is still refused', async()=>{
  const m=new Map([['dungeon-trial.player.v1',JSON.stringify(oldCamp())]]);const port={getItem:k=>m.get(k)??null,setItem:(k,v)=>{m.set(k,v);}};
  const store=new TrialStore(port);assert.equal(await store.whenReady,true,store.error);assert.equal(store.status,'ready');
  assert.deepEqual(store.profile.roster[0].learned.map(l=>l.pp),[28,15,10]);
  const saved=await store.baseAction({type:'tactic',inst:'P1',tactic:'wait'});assert.equal(saved.ok,true);
  const reread=decode(m.get('dungeon-trial.player.v1'));assert.deepEqual(reread.profile.roster[0].learned.map(l=>l.pp),[28,15,10]);assert.ok(!JSON.stringify(reread).includes('terablast'));
  const bad=oldCamp();bad.profile.roster[0].learned.push({move:'hyperbeam',pp:5});assert.throws(()=>decode(JSON.stringify(bad)),/存档结构损坏/);
  const wrongMove=oldCamp();wrongMove.profile.roster[0].carry=['scratch','ember','protect'];assert.throws(()=>decode(JSON.stringify(wrongMove)),/存档结构损坏/);
  const prof=oldCamp().profile;migrateProfilePp(prof);migrateProfilePp(prof);assert.equal(profileProblem(prof),null);
});
test('P4 an old format-1 ended run that holds a Tera Blast machine is migrated: the machine is dropped from the run and its end record, PP maxima follow the new data, and the record still validates', async()=>{
  const {decodeLegacy}=await import('../../src/core/save.ts');
  const {closeOut}=await import('../../src/core/engine.ts');
  const frozen=JSON.parse(readFileSync(new URL('./fixtures78/legacy-worlds.json',import.meta.url),'utf8'));
  const p=structuredClone(frozen.profile),s=structuredClone(frozen.floor3);
  s.prog.exp=2;s.prog.rng=7;s.goal=true;s.purse=40;s.tms=[{move:'terablast',source:'target',fate:'held'},{move:'roar',source:'shop',fate:'held'}];s.bag=1;
  for(const id of s.queue){s.units[id].hp=0;s.units[id].pos=null;}
  s.phase='ended';s.request=null;s.anchor=null;s.end=closeOut(s,'wipe');
  const raw=JSON.stringify({format:1,rules:'trial-rules-2',content:'trial-content-2',build:BUILD_ID,sequence:9,current:s,recent:null,profile:p});
  const old=decodeLegacy(raw);
  assert.deepEqual(old.current.tms.map(t=>t.move),['roar']);assert.deepEqual(old.current.end.tms.map(t=>t.move),['roar']);
  assert.ok(!JSON.stringify(old).includes('terablast'));
  for(const u of Object.values(old.current.units)){if(!u.species||!u.learned.length)continue;for(const k of u.learned){assert.equal(u.maxPp[k],learnableMove(u.species,k).pp,`${u.id}/${k}`);assert.ok(u.pp[k]<=u.maxPp[k]);}}
  assert.deepEqual(decodeLegacy(JSON.stringify(old)),old,'the migrated record validates again');
});
/* ---------- review fixes ---------- */
test('F1 a frozen leader\'s swap is lost (nobody moves, no PP); a frozen partner makes the swap lost; both still count their own turns',()=>{
  const mk=(leaderFrz,mateFrz)=>{const a=friend('A',1,1,60,{tackle:5}),b=friend('B',2,1,60,{tackle:5});if(leaderFrz)a.status={frz:{left:2}};if(mateFrz)b.status={frz:{left:2}};return world({friends:[a,b],enemies:[still('E','geodude',8,8,30)]});};
  for(const [l,m] of [[true,false],[false,true]]){
    const r=play(mk(l,m),{type:'swap',target:'B'});
    assert.deepEqual([r.units.A.pos,r.units.B.pos],[{x:1,y:1},{x:2,y:1}],`leaderFrozen=${l} mateFrozen=${m}`);
    assert.ok(r.log.some(x=>x.includes('换位落空')));
    assert.equal((l?r.units.A:r.units.B).status.frz.left,1);
  }
  const ok=play(mk(false,false),{type:'swap',target:'B'});assert.deepEqual([ok.units.A.pos,ok.units.B.pos],[{x:2,y:1},{x:1,y:1}]);
});
test('F1b exchange: a frozen leader cannot operate it; a working one still counts down its own statuses',()=>{
  const mk=(frz)=>{const a=friend('A',1,1,60,{tackle:5}),b=friend('B',2,1,60,{tackle:5});a.status=frz?{frz:{left:2}}:{par:{left:3}};
    const s=world({friends:[a,b],enemies:[still('E','geodude',8,8,30)]});s.exchange={level:1,used:false,sent:null};s.tms=[];s.points=[{pos:{x:1,y:1},kind:'exchange',used:false}];return s;};
  const blocked=play(mk(true),{type:'exchange',target:'B',cargo:[]});
  assert.equal(blocked.exchange.used,false);assert.ok(blocked.queue.includes('B'));assert.equal(blocked.units.A.status.frz.left,1);
  const done=play(mk(false),{type:'exchange',target:'B',cargo:[]});
  assert.equal(done.exchange.used,true);assert.equal(done.units.A.status.par.left,2,'the leader\'s turn was counted');
});
test('F2 confusion turns an explicit swap into a random step (a companion on the drawn cell is still swapped with)',()=>{
  const st=stateWhere(v=>Math.floor(v*8)===0);   // direction (1,0): B stands there
  const a=friend('A',1,1,60);a.status={confusion:{left:5}};const b=friend('B',2,1,60),c=friend('C',1,2,60);
  const s=world({friends:[a,b,c],enemies:[still('E','geodude',8,8,30)]});s.battleRng=st;
  const r=play(s,{type:'swap',target:'C'});
  assert.deepEqual(r.units.A.pos,{x:2,y:1});assert.deepEqual(r.units.B.pos,{x:1,y:1});assert.equal(r.units.C.pos.y,2);
});
test('F3 raising the user\'s own stats is rolled once per use and only when the move connected',()=>{
  const mk=(hit)=>{const a=friend('A',1,1,60);equip(a,'chargebeam',3);const s=world({friends:[a],enemies:[still('E','geodude',2,1,200)],hit});s.battleRng=hit?LOW:HIGH;return s;};
  const r=skill(mk(true),'A','chargebeam','E');assert.equal(stageOf(r.units.A,'spa'),1);assert.equal(r.battleRng,rngStep(LOW).state,'exactly one draw: the 70% roll');
  const m=skill(mk(false),'A','chargebeam','E');assert.equal(stageOf(m.units.A,'spa'),0);assert.equal(m.battleRng,rngStep(HIGH).state,'only the hit roll');
});
