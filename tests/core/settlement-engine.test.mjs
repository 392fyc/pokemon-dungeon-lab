import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCommand, closeOut, createExpedition, estimateAttackDamage, jumpToFloor,
  PROG, rngStep,
} from '../../src/core/engine.ts';
import {DIFFICULTY, ENEMY_DIFFICULTY, generateFloor, isDifficulty} from '../../src/core/dungeon.ts';
import {ECON} from '../../src/core/economy.ts';

const key=p=>`${p.x},${p.y}`;
const adjacent=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)===1;
const squad={members:[
  {inst:'A0',species:'charmander',carry:[{move:'scratch',pp:3},{move:'ember',pp:2}]},
  {inst:'B0',species:'squirtle',carry:[{move:'tackle',pp:3},{move:'watergun',pp:2}]},
  {inst:'C0',species:'bulbasaur',carry:[{move:'tackle',pp:3},{move:'seedbomb',pp:1}]},
],leader:2};
const makeRun=(id='settlement',seed=17,difficulty='normal',purse=99)=>
  createExpedition(id,seed,3,squad,purse,true,undefined,difficulty);

function placeAdjacent(world,actorId,targetId) {
  const actor=world.units[actorId],target=world.units[targetId],floor=new Set(world.floor.map(key));
  let pair;
  for(const a of world.floor){
    const b=world.floor.find(p=>adjacent(a,p)&&floor.has(key(p)));
    if(b){pair=[a,b];break;}
  }
  assert.ok(pair,'generated floor has adjacent walkable cells');
  actor.pos={...pair[0]};target.pos={...pair[1]};
  world.seen=[...new Set([...world.seen,key(actor.pos),key(target.pos)])];
}

function bossFight({id='boss-settlement',seed=4,actorId='A',allDown=false,difficulty='normal'}={}) {
  const world=jumpToFloor(makeRun(id,seed,difficulty),3);
  const boss=world.units.boss;
  assert.ok(boss?.boss,'the generated third floor has its regional boss');
  world.enemies=['boss'];
  for(const unit of Object.values(world.units)){
    if(unit.side==='enemy'&&unit.id!=='boss'){unit.hp=0;unit.pos=null;}
  }
  world.queue=[actorId];world.leader=actorId;
  for(const id of ['A','B','C'])if(id!==actorId){world.units[id].hp=0;world.units[id].pos=null;}
  const actor=world.units[actorId];actor.hp=allDown?1:Math.max(actor.hp,1);actor.maxHp=Math.max(actor.maxHp,actor.hp);
  boss.hp=1;
  placeAdjacent(world,actorId,'boss');
  world.prog.level=15;world.prog.exp=PROG.thresholds[15];
  world.tms=[
    {move:'protect',source:'target',fate:'sent'},
    {move:'roar',source:'shop',fate:'held'},
  ];
  return world;
}

function rngThatInvitesAfterBossDrop(){
  for(let state=1;state<10000;state++){
    const tm=rngStep(state),invite=rngStep(tm.state);
    if(invite.value<PROG.recruitChance)return state;
  }
  throw new Error('could not find a deterministic invitation draw');
}

test('three difficulty multipliers scale the generated boss HP to 39, 56 and 79',()=>{
  assert.deepEqual(DIFFICULTY,{easy:0.28,normal:0.4,hard:0.56});
  assert.ok(isDifficulty('easy')&&isDifficulty('normal')&&isDifficulty('hard'));
  assert.equal(isDifficulty('extreme'),false);
  const actual=['easy','normal','hard'].map(difficulty=>{
    const floor=generateFloor(39,3,{width:20,height:14,floors:3,boss:true,roguelike:true,difficulty});
    return floor.enemies.find(enemy=>enemy.boss).hp;
  });
  assert.deepEqual(actual,[39,56,79]);
});

test('legacy floor generation without the roguelike marker still places exits and uses normal HP',()=>{
  const first=generateFloor(39,1,{width:20,height:14,floors:3,boss:true});
  const last=generateFloor(39,3,{width:20,height:14,floors:3,boss:true});
  assert.ok(first.points.some(point=>point.kind==='exit'));
  assert.ok(last.points.some(point=>point.kind==='exit'));
  assert.equal(last.enemies.find(enemy=>enemy.boss).hp,56);
  assert.equal(ENEMY_DIFFICULTY,0.4);
});

test('enemy damage estimation and the enemy action use the selected difficulty',()=>{
  const results=[];
  for(const difficulty of ['easy','normal','hard']){
    const world=makeRun(`damage-${difficulty}`,83,difficulty);
    world.queue=['C'];world.leader='C';world.units.A.pos=null;world.units.B.pos=null;
    const actor=world.units.C;actor.hp=100;actor.maxHp=100;
    const foe={id:'foe',side:'enemy',hp:100,maxHp:100,pos:null,pp:{},maxPp:{},learned:[],stages:{atk:0,def:0},protect:0,counter:0,lastMove:null,level:5,species:'rattata',tactic:'gofoes'};
    world.units.foe=foe;world.enemies=['foe'];placeAdjacent(world,'foe','C');
    const estimated=estimateAttackDamage(world,'foe','C');
    const result=applyCommand(world,{type:'round',action:{type:'wait'}});
    assert.equal(result.ok,true);
    const actual=100-result.state.units.C.hp;
    assert.equal(actual,estimated,`${difficulty}: estimate equals the resolved basic attack`);
    results.push(actual);
  }
  assert.deepEqual(results,[2,3,4]);
});

test('a new run starts with zero money, generates only downward stairs, and cannot use G, T or an up stair as an exit',()=>{
  const world=makeRun('one-way',21,'normal',200);
  assert.equal(world.dungeon.roguelike,true);
  assert.equal(world.difficulty,'normal');
  assert.equal(world.purse,0);
  for(let level=1;level<=3;level++){
    const floor=generateFloor(21,level,{width:20,height:14,floors:3,boss:true,roguelike:true});
    assert.equal(floor.points.some(point=>point.kind==='exit'||point.kind==='up'),false,`floor ${level} has no exit or upward stair`);
  }
  assert.equal(world.points.some(point=>point.kind==='exit'||point.kind==='up'),false);
  const goal=world.points.find(point=>point.kind==='goal');
  assert.ok(goal);
  world.units[world.leader].pos={...goal.pos};world.seen.push(key(goal.pos));
  let result=applyCommand(world,{type:'round',action:{type:'interact',exit:true}});
  assert.equal(result.ok,false);assert.match(result.error,/目标G不是撤离点/);
  assert.equal(result.state.goal,false);

  let floor3=jumpToFloor(world,3);
  assert.equal(floor3.points.some(point=>point.kind==='exit'||point.kind==='up'),false);
  const target=floor3.points.find(point=>point.kind==='item');
  assert.ok(target,'the item target remains an item');
  floor3.units[floor3.leader].pos={...target.pos};floor3.seen.push(key(target.pos));
  result=applyCommand(floor3,{type:'round',action:{type:'interact',exit:true}});
  assert.equal(result.ok,false);assert.match(result.error,/目标T不是撤离点/);
  assert.equal(result.state.bag,0);

  const upPos=floor3.floor.find(pos=>!floor3.points.some(point=>key(point.pos)===key(pos)));
  assert.ok(upPos,'a free floor cell can represent a malformed legacy up-stair input');
  floor3.points.push({pos:upPos,kind:'up',used:false});
  const up=floor3.points.at(-1);
  floor3.units[floor3.leader].pos={...up.pos};floor3.seen.push(key(up.pos));
  result=applyCommand(floor3,{type:'round',action:{type:'interact',exit:true}});
  assert.equal(result.ok,false);assert.match(result.error,/只能向下/);

  const first=makeRun('down',22);const down=first.points.find(point=>point.kind==='down');
  first.units[first.leader].pos={...down.pos};first.seen.push(key(down.pos));
  result=applyCommand(first,{type:'round',action:{type:'interact',exit:true}});
  assert.equal(result.ok,true);assert.equal(result.state.phase,'transit');assert.equal(result.state.request.to,2);
  const crossed=applyCommand(result.state,{type:'finishTransit'});
  assert.equal(crossed.ok,true);assert.equal(crossed.state.dungeon.level,2);
});

test('boss victory waits for experience, evolution, boss TM and recruitment settlement',()=>{
  const world=bossFight({seed:13});world.prog.rng=rngThatInvitesAfterBossDrop();
  const result=applyCommand(world,{type:'round',action:{type:'basic',target:'boss'}});
  assert.equal(result.ok,true);
  const pending=result.state;
  assert.equal(pending.phase,'invitation','victory waits until the generated invitation is accepted or rejected');
  assert.equal(pending.end,null);
  assert.equal(pending.prog.exp,PROG.thresholds[15]+44,'the boss XP is included first');
  assert.equal(pending.prog.level,17);
  assert.equal(pending.units.A.species,'charmeleon','the level-up evolution is processed before victory');
  assert.equal(pending.tms.filter(tm=>tm.source==='boss').length,1,'the boss drop is settled before the invite');
  assert.ok(pending.invitations.some(invite=>invite.status==='pending'));
  const settled=applyCommand(pending,{type:'invite',choice:'reject'});
  assert.equal(settled.ok,true);assert.equal(settled.state.phase,'ended');
  assert.equal(settled.state.end.outcome,'won');
  assert.equal(settled.state.end.boss,true);
  assert.deepEqual(settled.state.end.tms.map(tm=>tm.fate),['brought','brought','brought'],'even exchanged TMs are carried on a win');
  assert.deepEqual(settled.state.end.lost,[]);
  assert.deepEqual([settled.state.end.reward,settled.state.end.purse,settled.state.end.refund],[0,0,0]);
  assert.equal(settled.state.purse,0);
});

test('if the boss and last living partner fall in one round, the settled result is still a win',()=>{
  const world=bossFight({id:'boss-wipe',seed:34,actorId:'C',allDown:true});world.prog.rng=rngThatInvitesAfterBossDrop();
  const boss=world.units.boss,actor=world.units.C;
  const foe={id:'last-foe',side:'enemy',hp:100,maxHp:100,pos:null,pp:{},maxPp:{},learned:[],stages:{atk:0,def:0},protect:0,counter:0,lastMove:null,level:5,species:'rattata',tactic:'gofoes'};
  world.units[foe.id]=foe;world.enemies.push(foe.id);placeAdjacent(world,'last-foe','C');
  // Put the boss beside C too; the foe uses a third adjacent floor cell, or waits if no such cell exists.
  const bossSpot=world.floor.find(point=>adjacent(point,actor.pos)&&key(point)!==key(foe.pos));
  assert.ok(bossSpot);boss.pos={...bossSpot};world.seen.push(key(bossSpot));
  const result=applyCommand(world,{type:'round',action:{type:'basic',target:'boss'}});
  assert.equal(result.ok,true);assert.equal(result.state.phase,'ended');
  assert.equal(result.state.end.outcome,'won');
  assert.equal(result.state.end.boss,true);
  assert.ok(result.state.invitations.every(invite=>invite.status!=='pending'),'any invite drawn for a defeated party is cancelled because nobody can decide');
  assert.deepEqual(result.state.end.lost,[]);
  assert.deepEqual(result.state.end.tms.map(tm=>tm.fate),['brought','brought','brought']);
  assert.deepEqual([result.state.end.reward,result.state.end.purse,result.state.end.refund],[0,0,0]);
});

test('each enemy pays one level-clamped purse drop; a rejected second hit pays nothing',()=>{
  const world=makeRun('coins',27);
  world.queue=['C'];world.leader='C';world.units.A.pos=null;world.units.B.pos=null;
  const actor=world.units.C,foe={id:'coin-foe',side:'enemy',hp:1,maxHp:1,pos:null,pp:{},maxPp:{},learned:[],stages:{atk:0,def:0},protect:0,counter:0,lastMove:null,level:28,species:'rattata',tactic:'gofoes'};
  world.units[foe.id]=foe;world.enemies=[foe.id];placeAdjacent(world,'C',foe.id);
  const killed=applyCommand(world,{type:'round',action:{type:'basic',target:foe.id}});
  assert.equal(killed.ok,true);assert.equal(killed.state.purse,15);
  const duplicate=applyCommand(killed.state,{type:'round',action:{type:'basic',target:foe.id}});
  assert.equal(duplicate.ok,false);assert.equal(duplicate.state.purse,15);
});

test('roguelike closeout overrides sent TMs, keeps every companion and zeroes wallet/reward; markerless history keeps old results',()=>{
  const current=makeRun('closeout',99);
  current.camp=['A'];current.queue=['B','C'];
  current.tms=[{move:'protect',source:'target',fate:'sent'},{move:'roar',source:'shop',fate:'held'}];
  current.goal=true;current.purse=73;
  const win=closeOut(current,'won');
  assert.deepEqual(win.team,['B','C']);assert.deepEqual(win.camp,['A']);
  assert.deepEqual(win.tms.map(tm=>tm.fate),['brought','brought']);
  assert.deepEqual([win.reward,win.purse,win.refund],[0,0,0]);
  assert.deepEqual(win.lost,[]);assert.equal(current.purse,0);

  const legacy=makeRun('legacy',100);
  delete legacy.dungeon.roguelike;legacy.goal=true;legacy.purse=73;
  legacy.tms=[{move:'protect',source:'target',fate:'sent'},{move:'roar',source:'shop',fate:'held'}];
  const old=closeOut(legacy,'normal');
  assert.deepEqual(old.tms.map(tm=>tm.fate),['sent','brought']);
  assert.deepEqual([old.reward,old.purse,old.refund],[ECON.reward,73,73]);
});
