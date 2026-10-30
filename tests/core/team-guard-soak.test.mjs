import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createMain,enemy,friend} from '../../src/core/engine.ts';
import {TrialStore} from '../../src/core/save.ts';
import {moveOf} from '../../src/core/moves.ts';

const MOVES=['reflect','lightscreen','quickguard'];
const PAIRS_PER_MOVE=20,MAX_ROUNDS=20;
const distance=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const floor=Array.from({length:6*6},(_,i)=>({x:i%6,y:Math.floor(i/6)}));

function battle(seed,move){
  const moveIndex=MOVES.indexOf(move);
  const maxHp=20+((seed*9+moveIndex*11)%40);
  const physicalDamage=1+((seed*3+moveIndex*2)%5);
  const specialDamage=1+((seed*2+moveIndex*3)%5);
  const enemyHp=240+((seed*17+moveIndex*23)%80);
  assert.ok(maxHp>=20&&maxHp<=59);
  assert.ok(physicalDamage>0&&specialDamage>0);
  assert.ok(enemyHp>0);

  const s=createMain(`team-guard-soak-${move}-${seed}`,false);
  const actor=friend('A',1,2,maxHp,{[move]:1});actor.maxHp=maxHp;
  const allyB=friend('B',1,1,maxHp+11);allyB.maxHp=maxHp+11;
  const allyC=friend('C',0,2,maxHp+23);allyC.maxHp=maxHp+23;
  const foe=enemy('E',2,2,enemyHp,'melee',physicalDamage,1);
  const rangedHp=enemyHp+13;
  const ranged=enemy('R',1,4,rangedHp,'ranged',specialDamage,3);
  Object.assign(s,{floor,seen:floor.map(p=>`${p.x},${p.y}`),units:{A:actor,B:allyB,C:allyC,E:foe,R:ranged},queue:['A','B','C'],enemies:['E','R'],camp:[],leader:'A',points:[],goal:false,bag:0,phase:'playing',invitations:[],anchor:null,request:null,end:null,log:[]});
  delete s.rooms;delete s.dungeon;delete s.prog;delete s.tms;delete s.purse;delete s.shop;delete s.exchange;
  return s;
}
function actionAfterOpening(s){
  const actor=s.units[s.leader],foe=s.units.E;
  return actor?.hp>0&&foe?.hp>0&&distance(actor.pos,foe.pos)===1?{type:'basic',target:'E'}:{type:'wait'};
}
function assertHealthyProgress(previous,next){
  for(const unit of Object.values(next.units))assert.ok(unit.hp>=0,`${unit.id} has nonnegative HP`);
  assert.equal(next.round,previous.round+1,'every accepted command advances exactly one round');
  assert.ok(next.phase==='playing'||next.phase==='ended','each result reaches a complete turn boundary');
}
async function saveReadBack(world){
  const values=new Map(),port={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const store=new TrialStore(port);assert.equal(await store.start(world),true);
  const restored=new TrialStore(port);assert.equal(restored.status,'ready',restored.error);
  assert.deepEqual(restored.state,world,'the saved rule state is unchanged after readback');
  return restored.state;
}
async function simulate(initial,move,useGuard){
  let state=structuredClone(initial),casts=0;
  for(let turn=0;turn<MAX_ROUNDS&&state.phase==='playing';turn++){
    const before=state;
    const action=turn===0
      ?(useGuard?{type:'skill',skill:move,target:'A'}:{type:'wait'})
      :actionAfterOpening(state);
    const result=applyCommand(state,{type:'round',action});
    assert.equal(result.ok,true,result.error);
    state=result.state;assertHealthyProgress(before,state);
    if(turn===0){
      const spent=initial.units.A.pp[move]-state.units.A.pp[move];
      if(useGuard){assert.equal(spent,1,`${move} was cast through applyCommand`);casts+=spent;}
      else assert.equal(spent,0,'the paired opening slot waits and does not spend move PP');
    }
  }
  assert.ok(state.round<=MAX_ROUNDS);
  const restored=await saveReadBack(state);
  return {state:restored,casts};
}
function summary(runs){
  const hp=runs.map(r=>r.state.queue.reduce((sum,id)=>sum+r.state.units[id].hp,0));
  const rounds=runs.map(r=>r.state.round);
  return {
    runs:runs.length,
    casts:runs.reduce((sum,r)=>sum+r.casts,0),
    fullTeamWipes:runs.filter(r=>r.state.queue.every(id=>r.state.units[id].hp===0)).length,
    reachedRoundCap:runs.filter(r=>r.state.phase==='playing'&&r.state.round===MAX_ROUNDS).length,
    remainingHp:{total:hp.reduce((sum,n)=>sum+n,0),mean:Number((hp.reduce((sum,n)=>sum+n,0)/hp.length).toFixed(2)),min:Math.min(...hp),max:Math.max(...hp)},
    rounds:{min:Math.min(...rounds),max:Math.max(...rounds)},
  };
}

test('bounded paired battles use each team guard move through applyCommand and report observed HP outcomes',async()=>{
  const results=[];
  for(const move of MOVES){
    assert.ok(moveOf(move),`${move} exists in the formal move data`);
    const guarded=[],waited=[],conditions=[];
    for(let seed=1;seed<=PAIRS_PER_MOVE;seed++){
      const initial=battle(seed,move),sameInitial=structuredClone(initial);
      assert.deepEqual(initial,sameInitial,'each pair starts from the same world bytes');
      const memberHp=initial.queue.map(id=>initial.units[id].hp);
      conditions.push({partyHpTotal:memberHp.reduce((sum,n)=>sum+n,0),memberHpMin:Math.min(...memberHp),memberHpMax:Math.max(...memberHp),physicalDamage:initial.units.E.damage,specialDamage:initial.units.R.damage,meleeHp:initial.units.E.hp,rangedHp:initial.units.R.hp});
      const withGuard=await simulate(initial,move,true);
      const withoutGuard=await simulate(sameInitial,move,false);
      guarded.push(withGuard);waited.push(withoutGuard);
    }
    const range=key=>[Math.min(...conditions.map(c=>c[key])),Math.max(...conditions.map(c=>c[key]))];
    const withProtection=summary(guarded),openingWait=summary(waited);
    results.push({
      move,pairs:PAIRS_PER_MOVE,
      conditions:{partyHpTotal:range('partyHpTotal'),individualHp:[Math.min(...conditions.map(c=>c.memberHpMin)),Math.max(...conditions.map(c=>c.memberHpMax))],meleeHp:range('meleeHp'),rangedHp:range('rangedHp'),physicalDamage:range('physicalDamage'),specialDamage:range('specialDamage')},
      withProtection,openingWait,
      observedDifference:{fewerFullTeamWipes:openingWait.fullTeamWipes-withProtection.fullTeamWipes,meanRemainingHp:Number((withProtection.remainingHp.mean-openingWait.remainingHp.mean).toFixed(2))},
    });
  }
  const report={kind:'team-guard-bounded-paired-battles',pairs:MOVES.length*PAIRS_PER_MOVE,runs:MOVES.length*PAIRS_PER_MOVE*2,maxRoundsPerRun:MAX_ROUNDS,scenario:{fixedMap:'6x6 open floor',partySize:3,enemyTypes:['melee physical','ranged special'],sameOpeningSlot:'protection move vs wait',laterPolicy:'basic attack when the leader is adjacent to melee foe; otherwise wait'},results};
  console.log(JSON.stringify(report,null,2));
});
