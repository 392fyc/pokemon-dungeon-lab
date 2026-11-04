import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCommand, closeOut, createExpedition, createMain, enemy, facingOf,
  friend, key, PROG, recruitUnit, rngStep, speciesUnit,
} from '../../src/core/engine.ts';
import {initialProfile, settleRun, squadOf} from '../../src/core/base.ts';
import {SPECIES} from '../../src/core/roster.ts';
import {TrialStore} from '../../src/core/save.ts';

const floor=Array.from({length:81},(_,i)=>({x:i%9,y:Math.floor(i/9)}));
const posKey=p=>`${p.x},${p.y}`;
function battle({aPos={x:3,y:3},bPos=null,ePos={x:7,y:7},floors=floor,enemyWait=true}={}){
  const s=createMain('playtest-194',false),a=friend('A',aPos.x,aPos.y,80,{tackle:3});
  a.maxHp=80;a.maxPp={tackle:3};
  const units={A:a},queue=['A'];
  if(bPos){const b=friend('B',bPos.x,bPos.y,60,{tackle:3});b.hp=60;b.maxHp=60;b.maxPp={tackle:3};b.tactic='wait';units.B=b;queue.push('B');}
  const e=enemy('E',ePos.x,ePos.y,80,'melee',enemyWait?0:4);e.hp=80;e.maxHp=80;
  if(enemyWait)e.waitOnly=true;else{delete e.waitOnly;e.learned=[];e.pp={};e.maxPp={};}
  units.E=e;
  s.units=units;s.queue=queue;s.enemies=['E'];s.camp=[];s.leader='A';s.floor=floors;s.seen=floors.map(key);s.points=[];s.log=[];
  s.prog={level:5,exp:0,rng:123,made:0,kills:[],items:{berry:0,tonic:0}};
  delete s.dungeon;delete s.rooms;delete s.adventureRooms;
  return s;
}
function round(s,action){const r=applyCommand(s,{type:'round',action});assert.equal(r.ok,true,r.error);return r.state;}
function airEvents(s){return (s.events??[]).filter(e=>e.type==='airAttack');}
function seedForDirection(index){for(let seed=0;seed<100000;seed++)if(Math.floor(rngStep(seed).value*8)===index)return seed;throw new Error(`no seed for direction ${index}`);}
function seedWithoutInvite(){for(let seed=0;seed<100000;seed++)if(rngStep(seed).value>=PROG.recruitChance)return seed;throw new Error('no seed for a failed recruit draw');}

test('facing defaults keep old units fieldless and face changes are free, leader-only, and immutable on error',()=>{
  const s=battle({bPos:{x:2,y:3}});
  assert.equal(Object.hasOwn(s.units.A,'facing'),false);
  assert.equal(Object.hasOwn(s.units.E,'facing'),false);
  assert.deepEqual(facingOf(s.units.A),{x:1,y:0});
  assert.deepEqual(facingOf(s.units.E),{x:-1,y:0});
  s.units.A.status={confusion:{left:4}};s.units.A.pp.tackle=2;s.battleRng=1234;
  const before=structuredClone(s),r=applyCommand(s,{type:'face',direction:{x:-1,y:1}});
  assert.equal(r.ok,true);assert.equal(r.state.round,before.round);assert.equal(r.state.battleRng,before.battleRng);
  assert.deepEqual(r.state.units.A.status,before.units.A.status);assert.deepEqual(r.state.units.A.pp,before.units.A.pp);
  assert.deepEqual(r.state.units.A.facing,{x:-1,y:1});assert.equal(r.state.units.B.facing,undefined);
  const expected=structuredClone(before);expected.units.A.facing={x:-1,y:1};assert.deepEqual(r.state,expected);
  const bad=applyCommand(s,{type:'face',direction:{x:2,y:0}});
  assert.equal(bad.ok,false);assert.strictEqual(bad.state,s);assert.deepEqual(s,before);
  const dead=structuredClone(s);dead.units.A.hp=0;dead.units.A.pos=null;
  const deadResult=applyCommand(dead,{type:'face',direction:{x:0,y:-1}});
  assert.equal(deadResult.ok,false);assert.strictEqual(deadResult.state,dead);
});

test('basicForward empty swings advance one round and report the actual origin and attempted tile',()=>{
  const s=battle();s.units.A.facing={x:1,y:0};
  const r=round(s,{type:'basicForward'});
  assert.equal(r.round,s.round+1);
  assert.deepEqual(airEvents(r),[{type:'airAttack',actor:'A',from:{x:3,y:3},to:{x:4,y:3}}]);
  assert.equal(r.events?.some(e=>e.type==='miss'),false);
});

test('basicForward uses the G5 basic hit path and turns both units toward an actual attack',()=>{
  const s=battle({ePos:{x:4,y:3}});s.units.A.facing={x:1,y:0};
  const r=round(s,{type:'basicForward'});
  assert.ok(r.units.E.hp<s.units.E.hp);assert.equal(airEvents(r).length,0);
  assert.deepEqual(r.units.A.facing,{x:1,y:0});assert.deepEqual(r.units.E.facing,{x:-1,y:0});
  const direct=battle({ePos:{x:4,y:3}}),hit=round(direct,{type:'basic',target:'E'});
  assert.deepEqual(hit.units.A.facing,{x:1,y:0});assert.deepEqual(hit.units.E.facing,{x:-1,y:0});
});

test('Kadabra initial Psybeam can hit in both horizontal directions and turns attacker and target toward one another',()=>{
  for(const {target,attack,opposite} of [
    {target:{x:5,y:4},attack:{x:1,y:0},opposite:{x:-1,y:0}},
    {target:{x:3,y:4},attack:{x:-1,y:0},opposite:{x:1,y:0}},
  ]){
    const s=battle({aPos:{x:4,y:4},ePos:target}),kadabra=speciesUnit('A','kadabra',5,{x:4,y:4});
    kadabra.hp=80;kadabra.maxHp=80;kadabra.facing={x:-attack.x,y:-attack.y};kadabra.stages.acc=3;
    s.units.A=kadabra;
    assert.ok(kadabra.learned.includes('psybeam'),'Psybeam is in Kadabra\'s initial kit');
    const hp=s.units.E.hp,r=round(s,{type:'skill',skill:'psybeam',target:'E'});
    assert.ok(r.units.E.hp<hp,'the reachable Psybeam target is hit');
    assert.equal(r.events?.some(e=>e.type==='miss')??false,false);
    assert.deepEqual(r.units.A.facing,attack);assert.deepEqual(r.units.E.facing,opposite);
  }
  const confused=battle({aPos:{x:4,y:4},ePos:{x:5,y:4}}),kadabra=speciesUnit('A','kadabra',5,{x:4,y:4});
  kadabra.hp=80;kadabra.maxHp=80;kadabra.facing={x:-1,y:0};kadabra.stages.acc=3;kadabra.status={confusion:{left:8}};
  confused.units.A=kadabra;confused.battleRng=seedForDirection(0);
  const redirected=round(confused,{type:'skill',skill:'psybeam',target:'E'});
  assert.ok(redirected.units.E.hp<confused.units.E.hp);
  assert.deepEqual(redirected.units.A.facing,{x:1,y:0},'confusion keeps its actual random strike direction');
  assert.deepEqual(redirected.units.E.facing,{x:-1,y:0});
});

test('self buffs and party healing do not turn units as if they were attacking',()=>{
  const self=battle();self.units.A.learned=['quiverdance'];self.units.A.pp={quiverdance:2};self.units.A.maxPp={quiverdance:2};self.units.A.facing={x:0,y:-1};
  const buffed=round(self,{type:'skill',skill:'quiverdance',target:'A'});
  assert.deepEqual(buffed.units.A.facing,{x:0,y:-1});
  const party=battle({bPos:{x:3,y:4}});party.rooms=[{x:2,y:2,w:5,h:5}];
  party.units.A.learned=['softboiled'];party.units.A.pp={softboiled:2};party.units.A.maxPp={softboiled:2};party.units.A.hp=1;party.units.A.facing={x:-1,y:0};party.units.B.hp=1;
  const healed=round(party,{type:'skill',skill:'softboiled',target:'A'});
  assert.deepEqual(healed.units.A.facing,{x:-1,y:0});assert.equal(healed.units.B.facing,undefined);
});

test('basicForward never damages a companion and reports an ally-blocked swing as empty',()=>{
  const s=battle({bPos:{x:4,y:3}}),hp=s.units.B.hp;
  const r=round(s,{type:'basicForward'});
  assert.equal(r.units.B.hp,hp);assert.deepEqual(airEvents(r),[{type:'airAttack',actor:'A',from:{x:3,y:3},to:{x:4,y:3}}]);
  const hidden=battle({ePos:{x:4,y:3}});hidden.seen=hidden.seen.filter(p=>p!=='4,3');
  const undiscovered=round(hidden,{type:'basicForward'});
  assert.equal(undiscovered.units.E.hp,hidden.units.E.hp,'an undiscovered target is not a legal G5 basic target');
  assert.equal(airEvents(undiscovered).length,1);
});

test('basicForward treats a wall and a blocked diagonal corner as empty swings',()=>{
  const wall=battle({floors:floor.filter(p=>posKey(p)!=='4,3')}),wallResult=round(wall,{type:'basicForward'});
  assert.deepEqual(airEvents(wallResult),[{type:'airAttack',actor:'A',from:{x:3,y:3},to:{x:4,y:3}}]);
  const corner=battle({floors:floor.filter(p=>posKey(p)!=='4,3')});corner.units.A.facing={x:1,y:1};
  const cornerResult=round(corner,{type:'basicForward'});
  assert.deepEqual(airEvents(cornerResult),[{type:'airAttack',actor:'A',from:{x:3,y:3},to:{x:4,y:4}}]);
});

test('facing follows successful movement and enemy attacks, without tracking nearby enemies automatically',()=>{
  const moved=round(battle(),{type:'move',to:{x:4,y:3}});
  assert.deepEqual(moved.units.A.facing,{x:1,y:0});
  const attacked=round(battle({ePos:{x:4,y:3},enemyWait:false}),{type:'wait'});
  assert.deepEqual(attacked.units.E.facing,{x:-1,y:0});assert.deepEqual(attacked.units.A.facing,{x:1,y:0});
  const oriented=battle({ePos:{x:5,y:3}}),turned=applyCommand(oriented,{type:'face',direction:{x:0,y:-1}});
  assert.equal(turned.ok,true);
  const after=round(turned.state,{type:'wait'});
  assert.deepEqual(after.units.A.facing,{x:0,y:-1});
});

test('confused basicForward uses a random direction, saves that direction, and leaves a companion unharmed',()=>{
  const ally=battle({bPos:{x:4,y:3}});ally.units.A.facing={x:0,y:-1};ally.units.A.status={confusion:{left:8}};ally.battleRng=seedForDirection(0);
  const empty=round(ally,{type:'basicForward'});
  assert.deepEqual(empty.units.A.facing,{x:1,y:0});assert.equal(empty.units.B.hp,ally.units.B.hp);
  assert.deepEqual(airEvents(empty),[{type:'airAttack',actor:'A',from:{x:3,y:3},to:{x:4,y:3}}]);
  const foe=battle({ePos:{x:4,y:3}});foe.units.A.facing={x:0,y:-1};foe.units.A.status={confusion:{left:8}};foe.battleRng=seedForDirection(0);
  const hit=round(foe,{type:'basicForward'});
  assert.ok(hit.units.E.hp<foe.units.E.hp);assert.deepEqual(hit.units.A.facing,{x:1,y:0});assert.deepEqual(hit.units.E.facing,{x:-1,y:0});
});

test('paralysis, flinch, and freeze block basicForward before it can hit or air-swing',()=>{
  for(const status of ['par','flinch','frz']){
    const s=battle({ePos:{x:4,y:3}});s.units.A.status={[status]:{left:5}};
    const r=round(s,{type:'basicForward'});
    assert.equal(r.units.E.hp,s.units.E.hp,`${status} cannot attack`);assert.equal(airEvents(r).length,0,`${status} emits no swing event`);
  }
});

test('level-up text is short and a failed recruit draw advances RNG without a no-invite message',()=>{
  const s=battle({ePos:{x:4,y:3}});s.units.E.hp=1;s.prog.exp=PROG.thresholds[6];
  const recruitSeed=seedWithoutInvite();s.prog.rng=recruitSeed;
  const r=round(s,{type:'basic',target:'E'});
  assert.ok(r.log.includes('升到 Lv6'));assert.equal(r.log.some(line=>line.includes('没有发出邀请')),false);
  assert.equal(r.invitations.length,0);assert.equal(r.prog.made,0);assert.equal(r.prog.rng,rngStep(recruitSeed).state);
});

function invitedWorld(id='camp-invite',pendingEnd){
  const profile=initialProfile(),s=createExpedition(id,44,3,squadOf(profile),0,true);
  const newcomer=recruitUnit('N1','pidgey',s.prog.level);
  s.invitations=[{id:`${id}:invite:1`,unit:newcomer,status:'pending'}];s.phase='invitation';s.anchor=structuredClone(s.units[s.leader].pos);
  if(pendingEnd)s.pendingEnd=pendingEnd;
  return {profile,s,newcomer};
}

test('full-party camp invite keeps the half-HP snapshot out of this run and returns a new kit instance on win or wipe',()=>{
  for(const outcome of ['won','wipe']){
    const {profile,s,newcomer}=invitedWorld(`camp-${outcome}`);
    const result=applyCommand(s,{type:'invite',choice:'camp'});
    assert.equal(result.ok,true,result.error);const accepted=result.state;
    assert.equal(accepted.invitations[0].status,'accepted');assert.deepEqual(accepted.camp,['N1']);
    assert.equal(accepted.queue.includes('N1'),false);assert.equal(accepted.units.N1.pos,null);
    assert.equal(accepted.units.N1.hp,newcomer.hp);assert.equal(newcomer.hp,Math.floor(newcomer.maxHp/2));
    assert.deepEqual(accepted.units.N1.pp,accepted.units.N1.maxPp);
    if(outcome==='wipe')for(const id of accepted.queue){accepted.units[id].hp=0;accepted.units[id].pos=null;}
    accepted.end=closeOut(accepted,outcome);accepted.phase='ended';
    const settled=settleRun(profile,accepted),newInstance=settled?.roster.find(i=>i.species==='pidgey');
    assert.ok(newInstance,`${outcome} returns the recruit to the roster`);
    assert.deepEqual(newInstance.learned.map(({move,pp})=>({move,pp})),SPECIES.pidgey.kit);
    assert.equal(Object.hasOwn(newInstance,'hp'),false,'in-run HP is not stored on the roster instance');
    assert.equal(settled.roster.length,4);assert.deepEqual(profile.roster.map(i=>i.species),['charmander','squirtle','bulbasaur']);
  }
});

test('camp invite is refused below capacity and terminal settlement runs once for both outcomes',async()=>{
  const underfilled=invitedWorld('camp-underfilled');underfilled.s.queue=['A','B'];
  const before=structuredClone(underfilled.s),refused=applyCommand(underfilled.s,{type:'invite',choice:'camp'});
  assert.equal(refused.ok,false);assert.strictEqual(refused.state,underfilled.s);assert.deepEqual(underfilled.s,before);
  for(const outcome of ['won','wipe']){
    const {profile,s}=invitedWorld(`store-${outcome}`,outcome),store=new TrialStore({getItem:()=>null,setItem:()=>{}},`store-${outcome}`);
    assert.equal(await store.start(s,profile),true);
    const result=await store.dispatch({type:'invite',choice:'camp'});
    assert.equal(result.ok,true,result.error);assert.equal(result.state.phase,'ended');assert.equal(result.state.end.outcome,outcome);
    const settled=store.profile,summary=store.settlementSummary;
    assert.equal(settled.expeditions,profile.expeditions+1);assert.ok(settled.roster.some(i=>i.species==='pidgey'));
    assert.ok(summary.brought.some(i=>i.species==='pidgey'));
    const repeated=await store.dispatch({type:'invite',choice:'camp'});
    assert.equal(repeated.ok,false);assert.deepEqual(store.profile,settled);assert.deepEqual(store.settlementSummary,summary);
  }
});
