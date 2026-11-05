import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  applyBase,availableTalentPoints,initialProfile,profileProblem,rankLevel,rankThreshold,
  settleRun,settleSummary,squadOf,
} from '../../src/core/base.ts';
import {BUILD_ID,TrialStore} from '../../src/core/save.ts';
import {
  applyCommand,applyTalentBonus,closeOut,createExpedition,estimateAttackDamage,speciesUnit,recruitUnit,
  CONTENT_VERSION,RULE_VERSION,
} from '../../src/core/engine.ts';
import {enemy,friend,pos,row,world} from '../acceptance/fixtures.mjs';
import {MOVE_DEFS} from '../../src/core/moves.ts';
import {sureHit} from './sure-hit.mjs';   // 8.8 (#165): flamethrower (a line that can also catch a companion) now has a hit chance

function memoryPort(initialRaw=null,failAt=[]) {
  let raw=initialRaw,attempts=0,writes=0;
  const failures=new Set(failAt);
  return {
    getItem:()=>raw,
    setItem:(_key,value)=>{attempts++;if(failures.has(attempts))throw Error(`fixture write ${attempts} failed`);raw=value;writes++;},
    raw:()=>raw,attempts:()=>attempts,writes:()=>writes,
  };
}

function rankEndFixture(profile,{outcome='won',difficulty='normal',depth=3,completedCommissions=7}={}) {
  const s=createExpedition(`rank-${outcome}-${difficulty}`,133,3,squadOf(profile),0,true,3,difficulty);
  s.dungeon.level=depth;
  s.completedCommissions=completedCommissions;
  for(const [index,species] of ['chikorita','torchic','mudkip','charmander'].entries()){
    const id=`N${index+1}`,u=speciesUnit(id,species,5,null);
    u.side='friend';u.entrySpecies=species;delete u.inst;
    s.units[id]=u;s.camp.push(id);
  }
  const boss=speciesUnit('FIXTURE_BOSS','arcanine',22,null);
  boss.side='enemy';boss.boss=true;boss.maxHp=56;boss.hp=outcome==='won'?0:56;boss.pos=null;
  s.units.FIXTURE_BOSS=boss;s.enemies=['FIXTURE_BOSS'];
  s.tms=[1,2,3].map(()=>({move:'protect',source:'target',fate:'held'}));
  s.end=closeOut(s,outcome);s.phase='ended';
  return s;
}

function progressWorld({level=5,exp=0,foeLevel=3,foeSpecies='rattata',rng=1,vitality=3}={}) {
  const species=['charmander','squirtle','bulbasaur'];
  const baseHp={charmander:19,squirtle:20,bulbasaur:21};
  const units={};
  for(const [index,id] of ['A','B','C'].entries()){
    const kind=species[index],u=speciesUnit(id,kind,level,pos(index));
    const maxHp=Math.round((baseHp[kind]+Math.max(0,level-5))*1.15);
    u.maxHp=maxHp;u.hp=maxHp;units[id]=u;
  }
  const foe=enemy('W',3,1,6,'melee',{waitOnly:true});
  foe.level=foeLevel;foe.species=foeSpecies;foe.entrySpecies=foeSpecies;units.W=foe;
  const s=world(units,{floor:row(9),leader:'C',enemies:['W']});
  s.scenario='expedition';s.runId='rank-growth';
  s.dungeon={seed:1,width:12,height:4,floors:3,level:1,stored:{}};
  s.prog={level,exp,rng,made:0,kills:[],items:{berry:0,tonic:0}};
  s.talents={vitality};s.completedCommissions=0;s.tms=[];s.difficulty='normal';
  return s;
}

function command(s,action) {
  const result=applyCommand(s,{type:'round',action});
  assert.equal(result.ok,true,result.error);
  return result.state;
}

test('K1 victory and wipe score each item with its cap; difficulty is not part of the score',()=>{
  const profile=initialProfile();profile.rankExp=59;
  const expected={
    won:{depth:3,boss:6,commissions:3,recruits:2,tms:4,total:18,before:59,after:77,levelBefore:4,levelAfter:5},
    wipe:{depth:3,boss:0,commissions:3,recruits:2,tms:0,total:8,before:59,after:67,levelBefore:4,levelAfter:5},
  };
  for(const outcome of ['won','wipe']){
    const scores=[];
    for(const difficulty of ['easy','normal','hard']){
      const s=rankEndFixture(profile,{outcome,difficulty});
      const summary=settleSummary(profile,s);
      assert.deepEqual(summary.rank,expected[outcome],`${outcome}/${difficulty} score parts`);
      assert.deepEqual(summary.shards,[{species:'charmander',count:1}],`duplicate recruit becomes a shard in ${outcome}/${difficulty}`);
      const settled=settleRun(profile,s);
      assert.equal(settled.rankExp,expected[outcome].after);
      scores.push(summary.rank.total);
    }
    assert.deepEqual(scores,[expected[outcome].total,expected[outcome].total,expected[outcome].total]);
  }

  const old=rankEndFixture(profile,{outcome:'won'});
  delete old.talents;delete old.completedCommissions;
  assert.equal(settleSummary(profile,old).rank,undefined,'an ended World without the 8.5 new-run marker has no rank award');
  assert.equal(settleRun(profile,old).rankExp,profile.rankExp,'legacy ended runs do not gain backdated experience');
});

test('K1 a real collector commission increments the new-run counter and keeps it after descending',()=>{
  // Reuses the 8.4 commission fixture's fixed seed 211, room layout, and item-pick action.
  const s=createExpedition('rank-commission',211,3,squadOf(initialProfile()),0,true,3,'normal');
  assert.equal(s.completedCommissions,0,'the real camp expedition starts with the counter');
  s.floor=row(12);s.seen=s.floor.map(p=>`${p.x},${p.y}`);
  for(const id of s.enemies)delete s.units[id];s.enemies=[];
  s.queue=['A'];s.leader='A';s.units.A.pos=pos(1);s.units.B.pos=null;s.units.C.pos=null;
  s.rooms=[{x:0,y:0,w:3,h:3}];
  s.adventureRooms=[{room:0,type:'commission',state:'idle',interaction:pos(1),doors:[],sealedCells:[],enemyIds:[],reward:null,rewardCurrency:null,item:null,rewardItem:null,rewardMove:null}];
  s.points=[{pos:pos(3),kind:'berry',used:false},{pos:pos(12),kind:'down',used:false}];
  const act=(state,action)=>{
    const result=applyCommand(state,{type:'round',action});
    assert.equal(result.ok,true,result.error);return result.state;
  };

  let offered=act(s,{type:'interact',exit:false});
  assert.equal(offered.phase,'commission');
  assert.equal(offered.pendingChoices.find(choice=>choice.type==='commission').commission,'collector');
  let accepted=applyCommand(offered,{type:'commissionChoice',choice:'accept'});
  assert.equal(accepted.ok,true,accepted.error);assert.equal(accepted.state.completedCommissions,0);
  let picked=accepted.state;picked.units.A.pos=pos(3);
  picked=act(picked,{type:'interact',exit:false});
  assert.equal(picked.completedCommissions,1,'picking the requested item completes the commission through normal engine actions');
  assert.equal(picked.commissions.length,0);

  picked.units.A.pos=pos(12);
  const request=act(picked,{type:'interact',exit:true});
  assert.equal(request.phase,'transit');
  const descended=applyCommand(request,{type:'finishTransit'});
  assert.equal(descended.ok,true,descended.error);
  assert.equal(descended.state.dungeon.level,2);
  assert.equal(descended.state.completedCommissions,1,'the completed count survives the actual floor transition');
});

test('K2 rank boundaries use 3L(L-1), including the Lv16 boundary at 720 experience',()=>{
  const cases=[[5,1],[6,2],[17,2],[18,3],[59,4],[60,5],[719,15],[720,16]];
  for(const [exp,level] of cases){
    assert.equal(rankLevel(exp),level,`rankLevel(${exp})`);
    assert.equal(availableTalentPoints({...initialProfile(),rankExp:exp}),level-1);
  }
  assert.deepEqual([rankThreshold(2),rankThreshold(3),rankThreshold(4),rankThreshold(10),rankThreshold(16)],[6,18,36,270,720]);
});

test('K3 only 0..5 branch ranks totaling at most Lv-1 validate; failed camp edits preserve the profile',async()=>{
  for(let level=1;level<=16;level++){
    for(let vitality=0;vitality<=5;vitality++)for(let offense=0;offense<=5;offense++)for(let supplies=0;supplies<=5;supplies++){
      const spent=vitality+offense+supplies;
      if(spent>level-1)continue;
      const profile=initialProfile();profile.rankExp=rankThreshold(level);profile.talents={vitality,offense,supplies};
      assert.equal(profileProblem(profile),null,`Lv${level} accepts ${vitality}/${offense}/${supplies}`);
      assert.equal(availableTalentPoints(profile),level-1-spent);
    }
  }
  const capped=initialProfile();capped.rankExp=rankThreshold(6);
  let distributed=capped;
  for(let n=0;n<5;n++){
    const next=applyBase(distributed,{type:'talent',talent:'vitality'});
    assert.equal(next.ok,true);distributed=next.profile;
  }
  const before=structuredClone(distributed),sixth=applyBase(distributed,{type:'talent',talent:'vitality'});
  assert.equal(sixth.ok,false);assert.deepEqual(distributed,before,'the rejected sixth level does not mutate its input');

  const empty=initialProfile(),unchanged=structuredClone(empty);
  const noPoints=applyBase(empty,{type:'talent',talent:'vitality'});
  assert.equal(noPoints.ok,false);assert.equal(noPoints.error,'没有可分配的天赋点');
  assert.deepEqual(empty,unchanged,'rank 0 branch is rejected solely because no points remain');
  const badId=applyBase(capped,{type:'talent',talent:'unknown'});
  assert.equal(badId.ok,false);assert.equal(badId.error,'天赋分支不合法');
  assert.deepEqual(capped,{...initialProfile(),rankExp:rankThreshold(6)},'invalid branch does not mutate input');

  const saved=initialProfile();saved.rankExp=rankThreshold(4);
  const port=memoryPort(),store=new TrialStore(port,'rank-k3');
  assert.equal(await store.beginNewGame(saved,false),true,store.error);
  assert.equal(port.writes(),1,'new camp profile is written once');
  for(const talent of ['vitality','offense','supplies']){
    const writes=port.writes();
    const result=await store.baseAction({type:'talent',talent});
    assert.equal(result.ok,true,result.error);assert.equal(result.saved,true);
    assert.equal(port.writes(),writes+1,`${talent} assignment is one save`);
  }
  assert.equal(availableTalentPoints(store.profile),0);
  let writes=port.writes();
  const reset=await store.baseAction({type:'resetTalents'});
  assert.equal(reset.ok,true,reset.error);assert.equal(reset.saved,true);assert.equal(port.writes(),writes+1,'reset is one save');
  assert.deepEqual(['vitality','offense','supplies'].map(id=>store.profile.talents[id]),[0,0,0]);
  assert.equal(availableTalentPoints(store.profile),3,'reset returns every point');
  writes=port.writes();
  const redistribute=await store.baseAction({type:'talent',talent:'supplies'});
  assert.equal(redistribute.ok,true,redistribute.error);assert.equal(port.writes(),writes+1,'points can be reassigned after reset');
  assert.equal(store.profile.talents.supplies,1);
});

test('K3 a failed terminal write can be retried without scoring the same run twice',async()=>{
  const profile=initialProfile();profile.rankExp=59;
  const port=memoryPort(null,[2]),store=new TrialStore(port,'rank-retry');
  assert.equal(await store.beginNewGame(profile,false),true,store.error);
  assert.equal(await store.depart('rank-retry-run',133,0),true);
  const s=store.state,pair=s.floor.flatMap(from=>s.floor.filter(to=>Math.abs(from.x-to.x)+Math.abs(from.y-to.y)===1).map(to=>[from,to]))[0];
  assert.ok(pair,'fixed generated floor contains an adjacent tile pair');
  const fixture=structuredClone(s),leader=fixture.units[fixture.leader];
  for(const id of fixture.queue)if(id!==fixture.leader)fixture.units[id].pos=null;
  leader.pos=pair[0];
  fixture.seen=fixture.floor.map(p=>`${p.x},${p.y}`);
  for(const id of fixture.enemies)delete fixture.units[id];
  fixture.enemies=[];fixture.dungeon.level=3;fixture.completedCommissions=7;
  const boss=speciesUnit('RANK_BOSS','arcanine',22,pair[1]);
  boss.side='enemy';boss.species=undefined;boss.entrySpecies=undefined;boss.boss=true;boss.hp=1;boss.maxHp=1;boss.waitOnly=true;
  fixture.units.RANK_BOSS=boss;fixture.enemies=['RANK_BOSS'];fixture.tms=[];
  store.world=fixture; // Test seam: a controlled final-room setup; dispatch still performs the production terminal action and settlement.
  let result=await store.dispatch({type:'round',action:{type:'basic',target:'RANK_BOSS'}});
  assert.equal(result.ok,true,result.error);
  for(let turns=0;store.state.phase!=='ended'&&turns<10;turns++){
    const current=store.state;
    const next=current.phase==='invitation'?{type:'invite',choice:'reject'}
      :current.phase==='evolution'?{type:'evolve',species:null}
      :current.phase==='commission'?{type:'commissionChoice',choice:'reject'}
      :current.phase==='blessing'?{type:'blessingChoice',blessing:null}
      :current.phase==='tmChoice'?{type:'tmChoice',move:current.pendingChoices.find(c=>c.type==='tmChoice').options[0]}
      :null;
    assert.ok(next,`unexpected terminal phase ${current.phase}`);
    result=await store.dispatch(next);assert.equal(result.ok,true,result.error);
  }
  assert.equal(store.state.phase,'ended');assert.equal(store.state.end.outcome,'won');
  assert.equal(store.status,'failed','the configured second storage attempt failed');
  const rank=store.settlementSummary.rank;
  assert.ok(rank);assert.equal(rank.before,59);
  const scored=rank.after;
  assert.equal(store.envelope.profile.rankExp,scored,'the unsaved candidate already contains one award');
  assert.equal(port.writes(),1);
  assert.equal(await store.retry(),true,store.error);
  assert.equal(port.attempts(),3);assert.equal(port.writes(),2);
  assert.equal(store.envelope.profile.rankExp,scored,'retry persists the same candidate instead of settling again');
  assert.equal(JSON.parse(port.raw()).profile.rankExp,scored);
});

test('K4 vitality applies at departure, level-up, evolution, and the half-HP recruit snapshot, but not to enemies',()=>{
  const profile=initialProfile();profile.rankExp=rankThreshold(4);profile.talents={vitality:3};
  const squad=squadOf(profile),boosted=createExpedition('rank-vitality',77,3,squad,0,true,3,'normal');
  const plain=createExpedition('rank-vitality-plain',77,3,squadOf(initialProfile()),0,true,3,'normal');
  assert.deepEqual(['A','B','C'].map(id=>boosted.units[id].maxHp),[22,23,24]);
  assert.deepEqual(['A','B','C'].map(id=>boosted.units[id].hp),[22,23,24]);
  const enemyState=s=>s.enemies.map(id=>[s.units[id].species,s.units[id].hp,s.units[id].maxHp]);
  assert.deepEqual(enemyState(boosted),enemyState(plain),'the same seed and difficulty leave enemy HP unchanged');

  const leveled=command(progressWorld({level:5,exp:0,foeLevel:3}),{type:'basic',target:'W'});
  assert.equal(leveled.prog.level,6);
  assert.deepEqual(['A','B','C'].map(id=>leveled.units[id].maxHp),[23,24,25]);

  const evolved=command(progressWorld({level:15,exp:95,foeLevel:8}),{type:'basic',target:'W'});
  assert.equal(evolved.prog.level,16);
  assert.deepEqual(['A','B','C'].map(id=>evolved.units[id].species),['charmeleon','wartortle','ivysaur']);
  assert.deepEqual(['A','B','C'].map(id=>evolved.units[id].maxHp),[39,39,40]);
  assert.deepEqual(['A','B','C'].map(id=>evolved.units[id].hp),[33,35,36],'recomputing max HP does not heal current HP');

  const invited=command(progressWorld({level:5,exp:0,foeLevel:3,foeSpecies:'pidgey',rng:7}),{type:'basic',target:'W'});
  assert.equal(invited.phase,'invitation');
  assert.deepEqual([invited.invitations[0].unit.hp,invited.invitations[0].unit.maxHp],[12,24],'Lv6 Pidgey uses the same enhanced max HP before halving');
});

test('K4/K5 integer talent percentages round exact halves up for all base values 1..300 and ranks 0..5',()=>{
  for(let value=1;value<=300;value++)for(let rank=0;rank<=5;rank++)for(const step of [3,5]){
    const numerator=BigInt(value)*BigInt(100+step*rank);
    const expected=Number(numerator/100n+(numerator%100n>=50n?1n:0n));
    assert.equal(applyTalentBonus(value,step*rank),expected,`${value}, rank ${rank}, step ${step}`);
  }
  assert.equal(speciesUnit('A','charmander',36).maxHp,50);
  const recruited=recruitUnit('N','charmander',36,3);
  assert.deepEqual([recruited.maxHp,recruited.hp],[58,29],'50 HP with vitality 3 rounds 57.5 to 58 before halving');

  const original=MOVE_DEFS.scratch;
  try{
    MOVE_DEFS.scratch={...original,power:88}; // Controlled 50-damage half-point fixture through real resolution.
    const actor=friend('A',1,1,100,{scratch:2},100),foe=enemy('E',2,1,200,'melee',{waitOnly:true});
    delete foe.species;delete foe.entrySpecies;
    const s=world({A:actor,E:foe},{floor:row(4),leader:'A',queue:['A'],enemies:['E']});s.talents={offense:5};
    assert.equal(estimateAttackDamage(s,'A','E','scratch'),58);
    assert.equal(200-command(s,{type:'skill',skill:'scratch',target:'E'}).units.E.hp,58);
  }finally{MOVE_DEFS.scratch=original;}
});

test('K5 offense matches the shared estimate for basic and skill attacks; wall impact and enemy counter-reflection stay unchanged',()=>{
  const attack=(offense,skill)=>{
    const actor=friend('A',1,1,40,skill?{scratch:5}:{},40);actor.species='charmander';
    if(skill){actor.learned=['scratch'];actor.maxPp.scratch=5;}
    const target=enemy('E',2,1,100,'melee',{waitOnly:true});delete target.species;delete target.entrySpecies;
    const s=world({A:actor,E:target},{floor:row(4),leader:'A',queue:['A'],enemies:['E']});
    s.talents={offense};
    const estimate=estimateAttackDamage(s,'A','E',skill??undefined);
    const after=command(s,skill?{type:'skill',skill,target:'E'}:{type:'basic',target:'E'});
    return [estimate,100-after.units.E.hp];
  };
  assert.deepEqual([attack(0,null),attack(5,null)],[[6,6],[7,7]],'basic attack estimate equals executed damage at ranks 0 and 5');
  assert.deepEqual([attack(0,'scratch'),attack(5,'scratch')],[[9,9],[10,10]],'scratch has 9 base damage and rank 5 rounds 9×1.15 to 10; estimate equals execution');

  const collision=offense=>{
    const actor=friend('A',0,1,20,{roar:2});actor.learned=['roar'];actor.maxPp.roar=2;
    const target=enemy('E',1,1,20,'melee',{waitOnly:true});
    const s=world({A:actor,E:target},{floor:row(1),leader:'A',queue:['A'],enemies:['E']});s.talents={offense};
    return command(s,{type:'skill',skill:'roar',target:'E'}).units.E.hp;
  };
  assert.deepEqual([collision(0),collision(5)],[15,15],'blowing a target into a wall always deals the fixed 5 damage');

  const counterResult=offense=>{
    const actor=friend('A',1,1,30,{},30);actor.counter=3;
    const foe=enemy('E',2,1,100,'melee');delete foe.species;delete foe.entrySpecies;foe.learned=[];foe.pp={};foe.maxPp={};
    const s=world({A:actor,E:foe},{floor:row(4),leader:'A',queue:['A'],enemies:['E']});
    s.talents={offense};s.difficulty='normal';
    const enemyEstimate=estimateAttackDamage(s,'E','A');
    const after=command(s,{type:'wait'});
    return [30-after.units.A.hp,100-after.units.E.hp,enemyEstimate];
  };
  const noBonus=counterResult(0),fullBonus=counterResult(5);
  assert.deepEqual(fullBonus,noBonus,'partner offense does not amplify enemy damage or its reflected counter damage');
  assert.equal(noBonus[1],noBonus[2],'counter reflects exactly the enemy damage estimate');

  const enemyCounter=offense=>{
    const actor=friend('A',1,1,100,{},100),foe=enemy('E',2,1,100,'melee',{waitOnly:true});
    delete foe.species;delete foe.entrySpecies;foe.counter=3;
    const s=world({A:actor,E:foe},{floor:row(4),leader:'A',queue:['A'],enemies:['E']});s.talents={offense};
    const after=command(s,{type:'basic',target:'E'});
    return [100-after.units.E.hp,100-after.units.A.hp];
  };
  assert.deepEqual([enemyCounter(0),enemyCounter(5)],[[6,6],[7,7]],'enemy counter returns actual damage without a second offense multiplier');
});

test('K5 offense boosts an enemy hit but not friendly fire; previews match the actual beam damage',()=>{
  const beam=(offense,friendly)=>{
    const actor=friend('A',1,1,100,{flamethrower:2},100);
    const foe=enemy('E',friendly?8:3,1,100,'melee',{waitOnly:true});delete foe.species;delete foe.entrySpecies;
    const ally=friend('B',3,1,100,{},100);ally.tactic='wait';
    const s=sureHit(world({A:actor,E:foe,...(friendly?{B:ally}:{})},{floor:row(10),leader:'A',queue:friendly?['A','B']:['A'],enemies:['E']}));
    s.talents={offense};const target=friendly?'B':'E';
    const estimate=estimateAttackDamage(s,'A',target,'flamethrower');
    const ordinary=estimateAttackDamage(s,'A',undefined,'flamethrower');
    const after=command(s,{type:'skill',skill:'flamethrower',target});
    if(friendly)assert.equal(after.units.E.hp,100,'the ally intercepts the beam before it reaches the enemy');
    return [estimate,100-after.units[target].hp,ordinary];
  };
  assert.deepEqual([beam(0,true),beam(5,true)],[[15,15,15],[15,15,17]],'friendly fire stays at 15; ordinary opposing-target preview still includes offense');
  assert.deepEqual([beam(0,false),beam(5,false)],[[15,15,15],[17,17,17]],'enemy damage and its preview both gain offense');
});

test('K6 supplies start with no berry at rank 2 and one at rank 3; blessing is added before guardian halves healing',()=>{
  const suppliesRun=level=>{
    const profile=initialProfile();profile.rankExp=rankThreshold(level+1);profile.talents={supplies:level};
    return createExpedition(`rank-supplies-${level}`,133,3,squadOf(profile),0,true,3,'normal');
  };
  assert.equal(suppliesRun(2).prog.items.berry,0);
  assert.equal(suppliesRun(3).prog.items.berry,1);

  const actor=friend('A',1,1,5,{},40);
  const s=world({A:actor},{floor:row(3),leader:'A',queue:['A']});
  s.scenario='expedition';s.dungeon={seed:1,width:4,height:3,floors:3,level:1,stored:{}};
  s.prog={level:5,exp:0,rng:1,made:0,kills:[],items:{berry:1,tonic:0}};
  s.talents={supplies:5};s.blessings=['berryBoost'];
  s.commissions=[{id:'guardian',floor:1,acceptedRound:0,progress:0,progressTarget:3,speedLimit:null}];
  const healed=command(s,{type:'use',item:'berry',target:'A'});
  assert.equal(healed.units.A.hp,13,'floor((8 base + 4 blessing + 5 supplies) / 2 guardian penalty) heals 8 HP');
});

test('K7 an existing current-version record stays byte-for-byte unchanged; invalid talent imports preserve the current record',async()=>{
  assert.equal(RULE_VERSION,'trial-rules-6');assert.equal(CONTENT_VERSION,'trial-content-7');
  const profile=initialProfile(),old={format:2,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:7,profile};
  const raw=JSON.stringify(old),port=memoryPort(raw),store=new TrialStore(port,'rank-v5');
  assert.equal(await store.whenReady,true,store.error);
  assert.deepEqual(store.profile,profile);assert.equal(port.raw(),raw);assert.equal(port.writes(),0,'reading the -5 sample does not migrate or rewrite it');

  for(const talents of [{vitality:1,unknownBranch:1},{vitality:1}]){
    const invalid=structuredClone(old);invalid.profile.talents=talents;
    const imported=await store.importRecord(JSON.stringify(invalid),true);
    assert.equal(imported,false);
    assert.equal(port.raw(),raw,'rejected import leaves the original bytes in storage');
    assert.deepEqual(store.profile,profile,'rejected import leaves the in-memory profile unchanged');
    assert.equal(port.writes(),0);
  }

  const fixtures=JSON.parse(readFileSync(new URL('./fixtures78/legacy-worlds.json',import.meta.url),'utf8'));
  const ended=structuredClone(fixtures.floor3);ended.units.boss.hp=0;ended.units.boss.pos=null;
  ended.phase='ended';ended.request=null;ended.anchor=null;ended.end=closeOut(ended,'normal');
  delete ended.talents;delete ended.completedCommissions;
  const legacyRaw=JSON.stringify({format:1,rules:'trial-rules-2',content:'trial-content-2',build:BUILD_ID,sequence:5,current:ended,recent:null,profile:fixtures.profile});
  const legacy=JSON.parse(legacyRaw),legacyPort=memoryPort(legacyRaw),migrating=new TrialStore(legacyPort,'rank-old-ended');
  assert.equal(await migrating.whenReady,true,migrating.error);
  assert.equal(migrating.profile.rankExp,0,'migrating an old ended World does not backfill expedition experience');
  assert.equal(legacyPort.writes(),1,'the ordinary legacy migration still writes one current envelope');
  assert.equal(JSON.parse(legacyPort.raw()).profile.rankExp,0);
  assert.equal(legacy.current.phase,'ended');
});

test('K8 the developer expedition uses its fixed profile even when TrialStore has a talented camp profile',async()=>{
  const camp=initialProfile();camp.rankExp=720;camp.talents={vitality:5,offense:5,supplies:5};
  assert.equal(profileProblem(camp),null);
  // Mirrors the developer entry in game.ts: it builds this isolated expedition from initialProfile(), then passes a separate profile to TrialStore.start.
  const fixedWorld=createExpedition('developer-fixed',77,3,squadOf(initialProfile()),0,true,3,'normal');
  const port=memoryPort(),store=new TrialStore(port,'rank-developer');
  assert.equal(await store.start(fixedWorld,camp),true,store.error);
  const s=store.state;
  assert.deepEqual(['A','B','C'].map(id=>s.units[id].maxHp),[19,20,21]);
  assert.equal(s.prog.items.berry,0);
  assert.equal(s.talents.vitality??0,0);assert.equal(s.talents.offense??0,0);assert.equal(s.talents.supplies??0,0);
  assert.equal(port.writes(),0,'the developer scene does not read or write the camp save');
});
