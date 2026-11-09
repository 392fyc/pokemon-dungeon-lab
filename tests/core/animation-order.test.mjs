/* Round 14 review: the order of a unit's position-changing events must survive animationBatches. For a large seeded set of real rounds (random worlds, moves,
 * swaps, Roar-type blow-aways, Rollcall Orbs, confusion, overrides), each unit's playback is simulated twice from the state before the round: event by event in
 * the order inferEvents wrote them (= the order the engine ran them), and batch by batch as animationBatches plays them (the events of one batch run together).
 * The two must agree, per unit: every move, swap, recall and blow-away starts from the cell the unit is on at that moment, no unit appears twice in a batch,
 * a hit is drawn on the cell the target stands on, and the unit ends where the engine put it. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createMain,friend as engineFriend,speciesUnit,BLESSINGS,key} from '../../src/core/engine.ts';
import {MOVE_DEFS} from '../../src/core/moves.ts';
import {SPECIES} from '../../src/core/roster.ts';
import {inferEvents,animationBatches} from '../../src/render/animation.ts';
import {world,friend,row,pos} from '../acceptance/fixtures.mjs';
import {foeOf} from './foe-fixture.mjs';
import {sureHit} from './sure-hit.mjs';

/* ---------- seeded random worlds ---------- */
function makeRng(start){let seed=start>>>0;return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const moveIds=Object.keys(MOVE_DEFS),speciesIds=Object.keys(SPECIES),statuses=['slp','nap','par','frz','confusion','flinch','psn','tox','brn'];
const timed=k=>k==='psn'||k==='tox'||k==='brn';
function fuzzWorld(rnd){
  const pick=a=>a[Math.floor(rnd()*a.length)];
  const mk=(id,side,c)=>{
    const u=speciesUnit(id,pick(speciesIds),5,c);u.side=side;
    const learned=[...new Set([pick(moveIds),pick(moveIds),pick(moveIds),pick(moveIds)])];
    if(rnd()<0.12){learned.splice(0,2,'sleeptalk','snore');}
    u.learned=learned;u.pp=Object.fromEntries(learned.map(m=>[m,rnd()<0.1?0:3]));u.maxPp=Object.fromEntries(learned.map(m=>[m,5]));
    u.maxHp=u.hp=Math.floor(8+rnd()*50);if(rnd()<0.4)u.hp=Math.max(1,Math.floor(u.maxHp*rnd()*0.5));
    if(rnd()<0.35){const k=pick(statuses);u.status={[k]:timed(k)?{tick:rnd()<0.5?1:5}:{left:1+Math.floor(rnd()*3)}};}
    if(rnd()<0.15)u.protect=2;if(rnd()<0.15)u.counter=2;if(rnd()<0.1)u.reflect=5;if(rnd()<0.1)u.lightscreen=5;
    if(rnd()<0.3)u.stages={...u.stages,atk:Math.floor(rnd()*7)-3,acc:3*(rnd()<0.6?1:-1)};
    if(side==='enemy'&&rnd()<0.2)u.asleep=true;
    u.tactic=pick(['together','gofoes','wait']);
    return u;
  };
  const floor=[];for(let y=0;y<9;y++)for(let x=0;x<9;x++)if(rnd()>0.04||x<2)floor.push({x,y});
  const taken=new Set(),take=()=>{for(;;){const c=pick(floor);if(!taken.has(key(c))){taken.add(key(c));return {...c};}}};
  const units={},queue=[],enemies=[];
  for(const id of ['A','B','C']){units[id]=mk(id,'friend',take());queue.push(id);}
  const ne=2+Math.floor(rnd()*3);
  for(let i=0;i<ne;i++){const id='E'+i;units[id]=mk(id,'enemy',take());enemies.push(id);}
  const s=world(units,{floor,leader:'A',queue,enemies,points:[]});
  s.dungeon={seed:Math.floor(rnd()*1e6),width:36,height:24,floors:3,level:1,stored:{},boss:true,roguelike:true,tmPool:3};
  s.difficulty='normal';s.rooms=[{x:0,y:0,w:9,h:9}];s.enemyAiRng=Math.floor(rnd()*1000);s.noCrit=rnd()<0.4;
  s.prog={level:5,exp:0,rng:5,made:0,kills:[],items:{berry:2,tonic:2,bigBerry:1,teamTonic:1,pechaBerry:1,healSeed:1,violentSeed:1,maxElixir:1,slumberOrb:1,totterOrb:1,luminousOrb:1,rollcallOrb:1,reviverSeed:rnd()<0.6?2:0}};
  s.purse=50;s.tms=[];
  if(rnd()<0.4)s.blessings=[pick(Object.keys(BLESSINGS))];
  return s;
}
function fuzzCommand(rnd,s){
  const pick=a=>a[Math.floor(rnd()*a.length)];
  const lead=s.units[s.leader],live=[...s.queue,...s.enemies].filter(i=>s.units[i].hp>0&&s.units[i].pos),r=rnd();
  const near=lead.pos?[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},{x:1,y:1},{x:-1,y:-1}].map(d=>({x:lead.pos.x+d.x,y:lead.pos.y+d.y})):[];
  let action;
  if(r<0.45&&lead.learned.length)action={type:'skill',skill:pick(lead.learned),target:pick(rnd()<0.5?s.enemies:live)};
  else if(r<0.55)action={type:'basic',target:pick(s.enemies)};
  else if(r<0.62)action={type:'basicForward'};
  else if(r<0.72&&near.length)action={type:'move',to:pick(near)};
  else if(r<0.78)action={type:'swap',target:pick(s.queue.filter(i=>i!==s.leader))};
  else if(r<0.9)action={type:'use',item:pick(['berry','tonic','bigBerry','teamTonic','pechaBerry','healSeed','violentSeed','maxElixir','slumberOrb','totterOrb','luminousOrb','rollcallOrb']),target:pick(s.queue)};
  else action={type:'wait'};
  const cmd={type:'round',action};
  if(rnd()<0.3){const o=pick(s.queue.filter(i=>i!==s.leader));if(o)cmd.override={actor:o,action:{type:'skill',skill:pick(s.units[o].learned),target:pick(live)}};}
  return cmd;
}
/** Every accepted round of the seeded worlds: {before,cmd,after}. */
function fuzzRounds(worlds,seed){
  const rnd=makeRng(seed),out=[];
  for(let w=0;w<worlds;w++){
    let s=fuzzWorld(rnd);
    for(let n=0;n<8;n++){
      let done=false;
      for(let tries=0;tries<12&&!done;tries++){
        const cmd=fuzzCommand(rnd,s),res=applyCommand(s,cmd);
        if(res.ok){out.push({before:s,cmd,after:res.state});s=res.state;done=true;}
      }
      if(!done||s.phase!=='playing')break;
      if(s.units[s.leader].hp<=0){const nl=s.queue.find(i=>s.units[i].hp>0&&s.units[i].pos);if(!nl)break;s.leader=nl;}
    }
  }
  return out;
}

const rounds=fuzzRounds(1500,14).concat(fuzzRounds(1500,4500));
/** What an event does to unit positions: [unit, from, to] for every unit it puts on another cell. */
const moves=ev=>ev.k==='move'?[[ev.id,ev.from,ev.to]]:ev.k==='swap'?[[ev.a,ev.pa,ev.pb],[ev.b,ev.pb,ev.pa]]:ev.k==='recall'?[[ev.id,ev.from,ev.to]]:ev.k==='blowaway'?[[ev.target,ev.from,ev.to]]:[];
const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
/** Plays `groups` (each group = events that run together) over the starting positions; returns what each unit did and whether every start cell matched. */
function simulate(before,groups){
  const at={};for(const [id,u] of Object.entries(before.units))at[id]=u.pos?{...u.pos}:null;
  const log={},problems=[];
  for(const group of groups){
    const touched=new Set();
    for(const ev of group)for(const [id,from] of moves(ev)){
      if(touched.has(id))problems.push(id+' appears twice in one batch ('+ev.k+')');touched.add(id);
      if(!same(at[id],from))problems.push(id+' '+ev.k+' starts from '+JSON.stringify(from)+' but stands on '+JSON.stringify(at[id]));
    }
    for(const ev of group){
      for(const [id,from,to] of moves(ev)){(log[id]??=[]).push([ev.k,from,to]);}
      if(ev.k==='hit'&&!ev.collision&&at[ev.target]&&!same(at[ev.target],ev.at)&&before.units[ev.target].side==='friend')problems.push(ev.target+' hit drawn on '+JSON.stringify(ev.at)+' but stands on '+JSON.stringify(at[ev.target]));
    }
    for(const ev of group)for(const [id,,to] of moves(ev))at[id]={...to};
  }
  return {at,log,problems};
}
const stats={rounds:0,recall:0,blowaway:0,swap:0,move:0,consistent:0};
test('animationBatches keeps the position events of every unit in engine order over thousands of seeded rounds, and units end where the engine put them',()=>{
  for(const {before,cmd,after} of rounds){
    const events=inferEvents(before,after,cmd);if(!events.length)continue;
    stats.rounds++;for(const e of events)if(stats[e.k]!==undefined)stats[e.k]++;
    const seq=simulate(before,events.map(e=>[e])),bat=simulate(before,animationBatches(events));
    assert.deepEqual(bat.log,seq.log,'the events of each unit run in the same order and with the same cells once batched: '+JSON.stringify(events.filter(e=>moves(e).length).map(e=>e.k+':'+(e.id??e.target??e.a))));
    // when the event-by-event run is consistent, the batched one must be too
    if(seq.problems.length===0){assert.deepEqual(bat.problems,[],'batching broke a consistent round: '+JSON.stringify(events.map(e=>e.k+':'+(e.id??e.target??e.a??''))));stats.consistent++;}
    assert.deepEqual(bat.at,seq.at,'both runs end on the same cells');
    // friends always have their events written, so they end exactly where the engine left them
    for(const id of after.queue){const u=after.units[id];if(u.hp>0&&u.pos&&seq.problems.length===0)assert.deepEqual(bat.at[id],u.pos,id+' ends on the engine cell');}
  }
  console.log('animation-order coverage',JSON.stringify(stats));
  assert.ok(stats.rounds>2500,'rounds checked: '+JSON.stringify(stats));
  assert.ok(stats.blowaway>30&&stats.swap>10&&stats.move>500,'the set contains blow-aways, swaps and moves: '+JSON.stringify(stats));
  assert.ok(stats.consistent>stats.rounds*.9,'most rounds are consistent event by event: '+JSON.stringify(stats));
});

/* ---------- Codex scenario: two blow-aways in one round, each followed by a move of the blown unit ---------- */
test('P2 (Codex): two blow-aways in one round each keep the following move of their own target after them',()=>{
  const P=(x,y)=>({x,y});
  const events=[{k:'blowaway',by:'A',target:'B',actorAt:P(2,2),from:P(3,2),to:P(7,2)},{k:'hit',by:'A',attacker:'A',target:'B',from:P(2,2),at:P(7,2),fx:null,amount:1,dead:false},
    {k:'move',by:'B',id:'B',from:P(7,2),to:P(6,2)},
    {k:'blowaway',by:'C',target:'Y',actorAt:P(3,8),from:P(4,8),to:P(7,8)},{k:'hit',by:'C',attacker:'C',target:'Y',from:P(3,8),at:P(7,8),fx:null,amount:1,dead:false},
    {k:'move',by:'Y',id:'Y',from:P(7,8),to:P(6,8)}];
  const names=animationBatches(events).map(b=>b.map(e=>e.k+':'+(e.id??e.target)));
  assert.deepEqual(names,[['blowaway:B'],['hit:B'],['move:B'],['blowaway:Y'],['hit:Y'],['move:Y']],JSON.stringify(names));
});
