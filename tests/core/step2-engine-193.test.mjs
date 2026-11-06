import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createMain,createExpedition,estimateAttackDamage,defaultLearningCommand,sleeping,friend,speciesUnit,recruitUnit,PROG,jumpToFloor,bossUnit,key,traceRound,ITEM_NAMES,ITEM_CURES,RULE_VERSION,CONTENT_VERSION} from '../../src/core/engine.ts';
import {MOVE_DEFS,moveEffects,moveOf} from '../../src/core/moves.ts';
import {SPECIES,movesAtLevel,tmPool,TM_MOVES_V5} from '../../src/core/roster.ts';
import {typeEffectiveness} from '../../src/core/type-chart.ts';
import {FLOOR_ITEM_WEIGHTS,generateChallengeEncounter} from '../../src/core/dungeon.ts';
import {moveEffectLabel,localizeLog} from '../../src/core/describe.ts';
import {rngStep} from '../../src/core/engine.ts';

function isolatedBattle(){
  const s=createMain('step2-engine-193',false);
  s.queue=['A'];s.leader='A';s.enemies=['E'];
  s.units.A.pos={x:3,y:1};s.units.E.pos={x:4,y:1};s.units.E.waitOnly=true;
  for(const id of ['B','C','R']){s.units[id].hp=0;s.units[id].pos=null;}
  s.points=[];s.seen=s.floor.map(key);
  s.units.E.hp=100;s.units.E.maxHp=100;
  return s;
}
function setMoves(unit,moves,pp=2){
  unit.learned=[...moves];
  unit.pp=Object.fromEntries(moves.map(move=>[move,pp]));
  unit.maxPp=Object.fromEntries(moves.map(move=>[move,pp]));
}
function progress(s,level,exp=0){
  s.prog={level,exp,rng:71,made:0,kills:[],items:{berry:0,tonic:0}};
}
function round(s,action={type:'wait'},override){
  const cmd={type:'round',action};
  if(override)cmd.override=override;
  const result=applyCommand(s,cmd);
  assert.equal(result.ok,true,result.error);
  return result.state;
}
function seedWith(predicate,count=6){
  for(let seed=0;seed<100000;seed++){
    let state=seed;const values=[];
    for(let i=0;i<count;i++){const next=rngStep(state);values.push(next.value);state=next.state;}
    if(predicate(values))return seed;
  }
  throw new Error('No matching battle RNG seed found');
}
function member(species='charmander',carry=[{move:'scratch',pp:17}]){
  return {inst:'P1',species,carry,tactic:'together'};
}

test('damage estimates apply type resistance, dual weaknesses, quarter resistance, immunity, and STAB independently',()=>{
  const s=isolatedBattle(),a=s.units.A,e=s.units.E;
  a.species=undefined;e.species='bulbasaur';
  assert.equal(typeEffectiveness('watergun',SPECIES.bulbasaur.types),0.5);
  assert.equal(estimateAttackDamage(s,'A','E','watergun'),5,'an untyped attacker gets 1 × 0.5 against Grass');
  e.species='geodude';
  assert.equal(typeEffectiveness('watergun',SPECIES.geodude.types),4);
  assert.equal(estimateAttackDamage(s,'A','E','watergun'),36,'Water is super-effective against both Rock and Ground');
  e.species='dewgong';
  assert.equal(typeEffectiveness('icebeam',SPECIES.dewgong.types),0.25);
  assert.equal(estimateAttackDamage(s,'A','E','icebeam'),4,'Ice is resisted by both Water and Ice');
  e.species=undefined;a.species='squirtle';
  assert.equal(estimateAttackDamage(s,'A','E','watergun'),14,'same-type bonus is 1.5 and rounds after multiplication');
  e.species='geodude';a.species=undefined;
  assert.equal(estimateAttackDamage(s,'A','E'),6,'basic attacks have no type');
  assert.equal(estimateAttackDamage(s,'A','E','thunderbolt'),0,'Ground immunity stays zero in the shared estimate');
});

test('the ally AI skips an immune attack, and enemy disruption uses a legal A3/A1 move on the 30 percent branch',()=>{
  const ai=isolatedBattle();ai.queue=['A','B'];ai.units.A.pos={x:2,y:1};ai.units.B.hp=20;ai.units.B.maxHp=20;ai.units.B.pos={x:3,y:1};ai.units.E.species='geodude';ai.units.E.pos={x:4,y:1};
  setMoves(ai.units.B,['thunderbolt']);
  const trace=traceRound(ai,{type:'round',action:{type:'wait'}}),partner=trace?.find(step=>step.id==='B');
  assert.ok(partner);
  assert.notEqual(partner.action.type==='skill'&&partner.action.skill==='thunderbolt',true,'AI must not choose a move whose type multiplier is zero');
  const branch=seedWith(values=>values[0]<0.3),fallback=seedWith(values=>values[0]>=0.3);
  const enemyTurn=(seed)=>{
    const world=isolatedBattle();world.units.E.waitOnly=false;world.units.E.tactic='gofoes';setMoves(world.units.E,['tackle','growl']);world.battleRng=seed;
    return round(world,{type:'wait'}).units.A.stages.atk;
  };
  assert.equal(enemyTurn(branch),-1,'a valid enemy stage-reduction candidate is used on the seeded 30 percent branch');
  assert.equal(enemyTurn(fallback),0,'the fallback branch keeps the normal G4.6 action');
});
test('immune attacks and pure status moves spend PP but skip hit randomness and every secondary effect',()=>{
  const s=isolatedBattle(),a=s.units.A,e=s.units.E;a.species=undefined;e.species='geodude';
  setMoves(a,['thunderbolt']);e.status={slp:{left:4}};s.battleRng=401;
  const hp=e.hp,random=s.battleRng;
  const after=round(s,{type:'skill',skill:'thunderbolt',target:'E'});
  assert.equal(after.units.E.hp,hp);
  assert.equal(after.units.E.status.slp.left,3,'the still-sleeping target loses only its own action tick');
  assert.equal(after.units.A.pp.thunderbolt,1);
  assert.equal(after.battleRng,random,'type immunity is checked before the move accuracy roll');
  assert.ok(after.log.some(line=>line.includes('没有效果')));

  const original=structuredClone(MOVE_DEFS.thunderwave);
  try{
    for(const [move,species,effect] of [
      ['toxic','bulbasaur','status:tox'],
      ['willowisp','growlithe','status:brn'],
      ['thunderwave','jynx','status:frz'],
      ['thunderwave','pikachu','status:par'],
    ]){
      const q=isolatedBattle();q.units.E.species=species;q.battleRng=9123;
      if(move==='thunderwave')MOVE_DEFS.thunderwave.effects=[effect];
      setMoves(q.units.A,[move]);
      const before=q.battleRng,result=round(q,{type:'skill',skill:move,target:'E'});
      assert.equal(result.units.E.status,undefined,species+' must resist '+effect);
      assert.equal(result.units.A.pp[move],1);
      assert.equal(result.battleRng,before,'status type immunity must not roll accuracy');
      assert.ok(result.log.some(line=>line.includes('没有效果')));
    }
  }finally{MOVE_DEFS.thunderwave=original;}

  const powder=isolatedBattle();powder.units.E.species='bulbasaur';setMoves(powder.units.A,['sleeppowder']);powder.battleRng=88;
  const powderAfter=round(powder,{type:'skill',skill:'sleeppowder',target:'E'});
  assert.equal(powderAfter.units.E.status,undefined,'Grass blocks powder moves');
  assert.equal(powderAfter.battleRng,88);
  const electric=isolatedBattle();electric.units.E.species='geodude';setMoves(electric.units.A,['thunderwave']);electric.battleRng=99;
  const electricAfter=round(electric,{type:'skill',skill:'thunderwave',target:'E'});
  assert.equal(electricAfter.units.E.status,undefined,'Thunder Wave cannot paralyze Ground');
  assert.equal(electricAfter.battleRng,99);
});

test('type immunity prevents recoil, self-cost, and blow-away; basic attacks remain untyped',()=>{
  for(const [move,species] of [['wildcharge','geodude'],['closecombat','gastly'],['dragontail','clefable']]){
    const s=isolatedBattle(),a=s.units.A,e=s.units.E;e.species=species;setMoves(a,[move]);s.battleRng=55;
    const aHp=a.hp,eHp=e.hp,ePos={...e.pos},before=s.battleRng;
    const result=round(s,{type:'skill',skill:move,target:'E'});
    assert.equal(result.units.E.hp,eHp,move+' must cause no damage through immunity');
    assert.deepEqual(result.units.E.pos,ePos,move+' must not move an immune target');
    assert.equal(result.units.A.hp,aHp,move+' must not apply recoil');
    assert.deepEqual(result.units.A.stages,{atk:0,def:0},move+' must not apply a self-cost');
    assert.equal(result.battleRng,before,move+' must not roll a hit');
  }
});

test('damage, effectiveness, and fainting are logged in resolution order',()=>{
  const s=isolatedBattle();s.units.A.species='squirtle';s.units.E.species='geodude';setMoves(s.units.A,['watergun']);s.units.E.hp=1;s.battleRng=seedWith(v=>v[0]<0.95);
  const after=round(s,{type:'skill',skill:'watergun',target:'E'});
  assert.equal(after.units.E.hp,0,'the super-effective Water Gun should defeat the one-HP target');
  const damage=after.log.findIndex(line=>/^E受到\d+伤害，HP 0$/.test(line));
  const effectiveness=after.log.indexOf('效果绝佳'),faint=after.log.indexOf('E倒下退图');
  assert.ok(damage>=0,'the damage log should be present');
  assert.equal(effectiveness,damage+1,'effectiveness follows the damage row immediately');
  assert.ok(faint>effectiveness,'the target leaves the map after the effectiveness message');
});

test('Grass powder immunity and repeated sleep are resolved before hit rolls; born-asleep enemies convert to slp',()=>{
  const s=isolatedBattle(),a=s.units.A,e=s.units.E;e.asleep=true;e.wakeSkip=true;setMoves(a,['sleeppowder']);
  s.battleRng=seedWith(v=>v[0]<0.8);
  const first=round(s,{type:'skill',skill:'sleeppowder',target:'E'});
  assert.equal(first.units.E.asleep,false);
  assert.equal(first.units.E.wakeSkip,false);
  assert.equal(sleeping(first.units.E),true);
  assert.ok(first.units.E.status.slp.left>=2&&first.units.E.status.slp.left<=5,'sleep counts the enemy opportunity in the application round');
  const hold=first.battleRng,pp=first.units.A.pp.sleeppowder;
  const second=round(first,{type:'skill',skill:'sleeppowder',target:'E'});
  assert.equal(second.units.A.pp.sleeppowder,pp-1,'an ineffective repeat still spends PP');
  assert.equal(second.battleRng,hold,'a sleeping target does not roll another hit or duration');
  assert.ok(sleeping(second.units.E));
  assert.equal(sleeping({...second.units.E,asleep:true,status:undefined}),false,'the exported helper excludes enemies born asleep');
});

test('partner and enemy status AI can affect born-asleep targets without choosing sleep again',()=>{
  const partner=isolatedBattle();partner.queue=['A','B'];partner.units.A.pos={x:2,y:1};partner.units.B.hp=20;partner.units.B.pos={x:3,y:1};partner.units.E.pos={x:4,y:1};delete partner.units.E.species;partner.units.E.asleep=true;
  setMoves(partner.units.B,['sleeppowder','thunderwave']);partner.battleRng=seedWith(v=>v[0]<0.95);
  const partnerResult=round(partner,{type:'wait'});
  assert.ok(partnerResult.units.E.status?.par,'a non-sleep status move can target an enemy born asleep');
  assert.ok(partnerResult.log.some(line=>line==='B使用电磁波'));
  assert.ok(!partnerResult.log.some(line=>line==='B使用催眠粉'),'a sleep move remains excluded for a born-asleep target');

  const foe=isolatedBattle();delete foe.units.A.species;delete foe.units.E.species;foe.units.A.asleep=true;foe.units.E.waitOnly=false;foe.units.E.tactic='gofoes';
  setMoves(foe.units.E,['tackle','thunderwave']);foe.battleRng=seedWith(v=>v[0]<0.3&&v[1]<0.95);
  const hp=foe.units.A.hp,foeResult=round(foe,{type:'wait'});
  assert.ok(foeResult.units.A.status?.par,'the enemy disruption branch can target a partner born asleep');
  assert.equal(foeResult.units.A.hp,hp,'the seeded disruption branch chose paralysis instead of its damage move');
  assert.ok(foeResult.log.some(line=>line==='E使用电磁波'));
});

test('an actual opposing hit wakes slp 25 percent of the time, while nap and status damage do not wake',()=>{
  const asleep=seedWith(v=>v[0]<0.25),stays=seedWith(v=>v[0]>=0.25);
  const wake=isolatedBattle();wake.units.E.status={slp:{left:4}};wake.battleRng=asleep;
  const woke=round(wake,{type:'basic',target:'E'});
  assert.equal(woke.units.E.status?.slp,undefined,'the direct basic attack may wake a sleeper');
  assert.ok(woke.log.some(line=>line.includes('醒来')));

  const remain=isolatedBattle();remain.units.E.status={slp:{left:4}};remain.battleRng=stays;
  const notWoke=round(remain,{type:'basic',target:'E'});
  assert.equal(notWoke.units.E.status.slp.left,3,'a failed wake check consumes one own action opportunity');

  const nap=isolatedBattle();nap.units.E.status={nap:{left:2}};nap.battleRng=stays;
  const hitNap=round(nap,{type:'basic',target:'E'});
  assert.equal(hitNap.units.E.status.nap.left,1,'a hit does not wake nap and nap does not draw a wake roll');

  const poison=isolatedBattle();poison.units.E.status={slp:{left:4},psn:{tick:1}};poison.battleRng=711;
  const afterPoison=round(poison);
  assert.equal(afterPoison.units.E.status.slp.left,3,'poison HP loss is not an opposing direct attack');
});

test('Snore has priority, Sleep Talk selects a move without spending its PP, both ignore range, and neither recurses',()=>{
  const snore=isolatedBattle();snore.units.A.pos={x:0,y:1};snore.units.E.pos={x:4,y:1};
  snore.units.E.status={slp:{left:4}};setMoves(snore.units.E,['snore','sleeptalk']);snore.units.E.pp.snore=2;snore.units.E.pp.sleeptalk=2;
  setMoves(snore.units.A,['icebeam']);snore.battleRng=seedWith(v=>v[0]<0.836&&v[1]>=0.25&&v[2]<0.95);
  const beforeA=snore.units.A.hp,afterSnore=round(snore,{type:'skill',skill:'icebeam',target:'E'});
  assert.equal(afterSnore.units.E.pp.snore,1);
  assert.equal(afterSnore.units.E.pp.sleeptalk,2,'Snore takes priority over Sleep Talk');
  assert.ok(afterSnore.units.A.hp<beforeA,'Snore reaches an attacker outside its listed front range');
  assert.ok(sleeping(afterSnore.units.E),'a triggered move does not recursively wake the user');

  const talk=isolatedBattle();talk.units.A.pos={x:0,y:1};talk.units.E.pos={x:4,y:1};
  talk.units.E.status={slp:{left:4}};setMoves(talk.units.E,['sleeptalk','tackle','rest']);talk.units.E.pp.sleeptalk=2;talk.units.E.pp.tackle=1;talk.units.E.pp.rest=1;
  setMoves(talk.units.A,['icebeam']);talk.battleRng=seedWith(v=>v[0]<0.836&&v[1]>=0.25&&v[3]<0.95);
  const before= talk.units.A.hp,afterTalk=round(talk,{type:'skill',skill:'icebeam',target:'E'});
  assert.equal(afterTalk.units.E.pp.sleeptalk,1);
  assert.equal(afterTalk.units.E.pp.tackle,1,'Sleep Talk does not spend the selected move PP');
  assert.equal(afterTalk.units.E.pp.rest,1,'Sleep Talk excludes Rest');
  assert.ok(afterTalk.units.A.hp<before,'the selected front-range move reaches the distant attacker');
  assert.ok(sleeping(afterTalk.units.E));

  const zero=isolatedBattle();zero.units.E.status={slp:{left:4}};setMoves(zero.units.E,['snore','sleeptalk','tackle']);zero.units.E.pp.snore=0;zero.units.E.pp.sleeptalk=2;
  zero.battleRng=staysSeed();
  const noFallback=round(zero,{type:'basic',target:'E'});
  assert.equal(noFallback.units.E.pp.sleeptalk,2,'a known but empty Snore slot blocks Sleep Talk fallback');
});

function staysSeed(){return seedWith(v=>v[0]>=0.25);}
test('Snore ignores confusion on the sleeper and still hits the actual attacker',()=>{
  const s=isolatedBattle(),a=s.units.A,e=s.units.E;s.difficulty='normal';delete a.species;delete e.species;
  e.status={slp:{left:4},confusion:{left:5}};setMoves(e,['snore']);
  s.battleRng=seedWith(v=>v[0]>=0.25&&v[1]<0.95&&Math.floor(v[1]*8)!==2);
  const before=a.hp,after=round(s,{type:'basic',target:'E'});
  assert.equal(after.units.A.hp,before-3,'without species modifiers, Snore base 8 scaled by 0.4 rounds to 3 damage');
  assert.equal(after.units.E.pp.snore,1);
  assert.ok(after.log.includes('E使用打鼾'));
  assert.ok(after.log.includes('A受到3伤害，HP '+(before-3)),'Snore damages the attacker rather than the confused random direction');
});

test('Sleep Talk ignores confusion on the sleeper and still hits the actual attacker',()=>{
  const s=isolatedBattle(),a=s.units.A,e=s.units.E;s.difficulty='normal';delete a.species;delete e.species;
  e.status={slp:{left:4},confusion:{left:5}};setMoves(e,['sleeptalk','tackle']);
  s.battleRng=seedWith(v=>v[0]>=0.25&&v[1]<0.95&&Math.floor(v[1]*8)!==2);
  const before=a.hp,after=round(s,{type:'basic',target:'E'});
  assert.ok(after.units.A.hp<before,'the called move damages the attacker rather than the confused random direction');
  assert.equal(after.units.E.pp.sleeptalk,1);
});

test('manual Snore and Sleep Talk are rejected without PP loss',()=>{
  for(const move of ['snore','sleeptalk']){
    const s=isolatedBattle();setMoves(s.units.A,[move]);const result=applyCommand(s,{type:'round',action:{type:'skill',skill:move,target:'E'}});
    assert.equal(result.ok,false);
    assert.equal(s.units.A.pp[move],2);
    assert.match(result.error,/只能在睡眠中/);
  }
});

test('the sleeping leader is forced to wait and cannot grant the companion override',()=>{
  const s=isolatedBattle();s.units.A.status={slp:{left:2}};setMoves(s.units.A,['tackle']);
  const pp=s.units.A.pp.tackle;
  const waited=round(s,{type:'skill',skill:'tackle',target:'E'});
  assert.equal(waited.units.A.pp.tackle,pp);
  assert.equal(waited.units.A.status.slp.left,1);
  const rejected=applyCommand(waited,{type:'round',action:{type:'wait'},override:{actor:'B',action:{type:'basic',target:'E'}}});
  assert.equal(rejected.ok,false);
  assert.match(rejected.error,/主控睡眠时不能安排伙伴干预/);
});

test('partners prioritize Chesto Berry over Heal Seed for a sleeping leader and approach from farther away',()=>{
  const s=isolatedBattle();s.queue=['A','B'];s.units.A.status={slp:{left:3}};s.units.B.hp=20;s.units.B.maxHp=20;s.units.B.pos={x:2,y:1};
  s.prog={level:5,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0,chestoBerry:1,healSeed:1}};
  const cured=round(s);
  assert.equal(cured.units.A.status?.slp,undefined);
  assert.equal(cured.prog.items.chestoBerry,0);
  assert.equal(cured.prog.items.healSeed,1);

  const far=isolatedBattle();far.queue=['A','B'];far.units.A.status={slp:{left:3}};far.units.B.pos={x:1,y:1};far.units.B.hp=20;far.units.B.maxHp=20;
  far.prog={level:5,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0,chestoBerry:1,healSeed:0}};
  const approached=round(far);
  assert.deepEqual(approached.units.B.pos,{x:2,y:1});
  assert.equal(approached.prog.items.chestoBerry,1);

  const nap=isolatedBattle();nap.queue=['A','B'];nap.units.A.status={nap:{left:2}};nap.units.B.pos={x:1,y:1};nap.units.B.hp=20;nap.units.B.maxHp=20;
  nap.prog={level:5,exp:0,rng:1,made:0,kills:[],items:{berry:0,tonic:0,chestoBerry:1,healSeed:1}};
  const unchanged=round(nap);
  assert.equal(unchanged.prog.items.chestoBerry,1,'sleep cures do not remove nap');
  assert.equal(unchanged.prog.items.healSeed,1);
});

test('Rest creates a 2–3 opportunity nap and heals fully while clearing ailments only when it ends',()=>{
  const s=isolatedBattle(),a=s.units.A;s.enemies=[];s.units.E.hp=0;s.units.E.pos=null;
  setMoves(a,['rest']);a.hp=8;a.maxHp=20;a.status={brn:{tick:1}};
  const rested=round(s,{type:'skill',skill:'rest',target:'A'});
  assert.ok(rested.units.A.status.nap.left===2||rested.units.A.status.nap.left===3);
  assert.equal(rested.units.A.hp,7,'Rest does not heal immediately');
  assert.ok(rested.units.A.status.brn,'other conditions remain during nap');
  let current=rested;
  while(sleeping(current.units.A))current=round(current);
  assert.equal(current.units.A.hp,current.units.A.maxHp);
  assert.equal(current.units.A.status,undefined,'nap expiry clears every condition');

  const squad={members:[member()],leader:0};
  const crossing=createExpedition('step2-engine-193-crossing',13,2,squad,0,false);
  const unit=crossing.units.A;unit.hp=5;unit.status={nap:{left:1}};
  const crossed=jumpToFloor(crossing,2);
  assert.equal(crossed.units.A.hp,5,'floor transit ends nap without applying its healing');
  assert.equal(crossed.units.A.status,undefined);
});

test('Rest healing priority precedes a partner self-boost when HP is low',()=>{
  const s=isolatedBattle();s.queue=['A','B'];s.units.A.pos={x:2,y:1};s.units.B.pos={x:3,y:1};s.units.B.hp=8;s.units.B.maxHp=20;
  setMoves(s.units.B,['rest','swordsdance']);
  const after=round(s,{type:'wait'});
  assert.ok(after.units.B.status?.nap,'the low-HP partner selects Rest as its A7 healing action');
  assert.equal(after.units.B.stages.atk,0,'Rest wins before Swords Dance in the support priorities');
  assert.equal(after.units.B.pp.rest,1);
  assert.equal(after.units.B.pp.swordsdance,2);
});

test('level-up moves prompt sequentially, permit replacement or decline, and keep direct learns full-PP',()=>{
  const s=isolatedBattle();s.enemies=[];s.units.E.hp=0;s.units.E.pos=null;
  const a=s.units.A;a.species='bulbasaur';a.level=5;setMoves(a,['seedbomb','energyball','sludgebomb','growl']);
  progress(s,5,PROG.thresholds[15]);
  let current=round(s);
  assert.equal(current.prog.level,15);
  assert.equal(current.phase,'learning');
  assert.deepEqual(current.pendingLearnMoves.map(item=>item.move),['razorleaf','poisonpowder','sleeppowder']);
  const replacement=defaultLearningCommand(current);
  assert.deepEqual(replacement,{type:'learnMove',replace:'growl'});
  current=applyCommand(current,replacement).state;
  const replacementLog=current.log.at(-1);
  assert.ok(replacementLog.startsWith('A用'),'replacement log carries the learner id');
  assert.ok(localizeLog(current,replacementLog).startsWith('妙蛙种子'),'replacement log localizes to the learner name');
  assert.ok(current.units.A.learned.includes('razorleaf'));
  assert.equal(current.units.A.pp.razorleaf,12);
  assert.equal(current.phase,'learning','additional prompts do not consume a turn or skip');
  assert.deepEqual(defaultLearningCommand(current),{type:'learnMove',replace:null});
  current=applyCommand(current,defaultLearningCommand(current)).state;
  const firstDecline=current.log.filter(line=>line.includes('放弃学习')).at(-1);
  assert.ok(firstDecline.startsWith('A'),'decline log carries the learner id');
  assert.ok(localizeLog(current,firstDecline).startsWith('妙蛙种子'),'decline log localizes to the learner name');
  assert.equal(current.phase,'learning');
  assert.deepEqual(defaultLearningCommand(current),{type:'learnMove',replace:null});
  current=applyCommand(current,defaultLearningCommand(current)).state;
  assert.equal(current.phase,'playing');
  assert.equal(current.pendingLearnMoves,undefined);
  assert.equal(current.units.A.learned.includes('poisonpowder'),false);
  assert.equal(current.units.A.learned.includes('sleeppowder'),false);

  const direct=isolatedBattle();direct.enemies=[];direct.units.E.hp=0;direct.units.E.pos=null;
  direct.units.A.species='bulbasaur';direct.units.A.level=5;setMoves(direct.units.A,['tackle']);progress(direct,5,PROG.thresholds[12]);
  const learned=round(direct);
  assert.equal(learned.phase,'playing','an open slot learns automatically');
  assert.ok(learned.units.A.learned.includes('razorleaf'));
  assert.equal(learned.units.A.pp.razorleaf,12);
  const directLog=learned.log.find(line=>line.includes('学会了招式：飞叶快刀'));
  assert.ok(directLog?.startsWith('A'),'direct learn log carries the learner id');
  assert.ok(localizeLog(learned,directLog).startsWith('妙蛙种子'),'direct learn log localizes to the learner name');
});

test('commission experience follows the same level-up learning path',()=>{
  const s=isolatedBattle();s.enemies=[];s.units.E.hp=0;s.units.E.pos=null;
  s.queue=['A'];s.units.A.pos={x:0,y:1};s.points=[{pos:{x:1,y:1},kind:'berry',used:false}];
  s.units.A.species='bulbasaur';s.units.A.level=11;setMoves(s.units.A,['seedbomb','energyball','sludgebomb','growl']);
  const reward=Math.round(1*PROG.expMultiplier*5.5);
  progress(s,11,PROG.thresholds[12]-reward);
  s.commissions=[{id:'collector',floor:1,acceptedRound:0,progress:0,progressTarget:1,speedLimit:null}];
  const result=round(s,{type:'move',to:{x:1,y:1}});
  assert.ok(result.prog.level>=12);
  assert.equal(result.phase,'learning');
  assert.ok(result.pendingLearnMoves.some(item=>item.move==='razorleaf'));
  assert.ok(result.log.some(line=>line.includes('委托完成')));
});

test('single-branch and chosen Eevee evolutions learn level-zero/current-level moves before settlement resumes',()=>{
  const single=isolatedBattle();single.enemies=[];single.units.E.hp=0;single.units.E.pos=null;
  single.units.A.species='metapod';single.units.A.level=9;setMoves(single.units.A,['tackle','scratch','growl','quickattack']);
  progress(single,9,PROG.thresholds[10]);
  let current=round(single);
  assert.equal(current.units.A.species,'butterfree');
  assert.equal(current.phase,'learning');
  assert.equal(current.pendingLearnMoves[0].move,'gust','the single-branch evolution learns its level-zero move');

  const branch=isolatedBattle();branch.enemies=[];branch.units.E.hp=0;branch.units.E.pos=null;
  branch.units.A.species='eevee';branch.units.A.level=20;setMoves(branch.units.A,['tackle','scratch','growl','quickattack']);progress(branch,20);
  current=round(branch);
  assert.equal(current.phase,'evolution');
  current=applyCommand(current,{type:'evolve',species:'jolteon'}).state;
  assert.equal(current.units.A.species,'jolteon');
  assert.equal(current.phase,'learning');
  assert.deepEqual(current.pendingLearnMoves.map(item=>item.move),['thundershock','thunderwave']);
  current=applyCommand(current,defaultLearningCommand(current)).state;
  assert.ok(current.units.A.learned.includes('thundershock'));
  assert.equal(current.phase,'learning');
  current=applyCommand(current,defaultLearningCommand(current)).state;
  assert.equal(current.phase,'playing');
  assert.equal(current.pendingEvolutions,undefined);
});

test('recruits and ordinary enemies use level-based loadouts, bosses keep their fixed kit, and new boss runs use TM pool 5',()=>{
  const newRecruit=recruitUnit('N-test','bulbasaur',24);
  assert.deepEqual(newRecruit.learned,movesAtLevel('bulbasaur',24).map(move=>move.move));
  for(const move of movesAtLevel('bulbasaur',24))assert.equal(newRecruit.pp[move.move],move.pp);

  const squad={members:[member()],leader:0};
  const world=createExpedition('step2-engine-193-roster',29,3,squad,0,true);
  assert.equal(world.dungeon.tmPool,5);
  assert.equal(tmPool(world.dungeon).length,17);
  const ordinary=world.units[world.enemies.find(id=>!world.units[id].boss)];
  assert.ok(ordinary);
  assert.deepEqual(ordinary.learned,movesAtLevel(ordinary.species,ordinary.level).map(move=>move.move));
  const last=jumpToFloor(world,3),boss=bossUnit(last);
  assert.ok(boss);
  assert.deepEqual(boss.learned,speciesUnit('fixed-kit',boss.species,boss.level).learned,'a generated boss retains speciesUnit kit moves');

  const challenge=(()=>{for(let seed=0;seed<200;seed++){const encounter=generateChallengeEncounter(seed,1,'normal',true,5);if(encounter.reward==='tm')return encounter;}return null;})();
  assert.ok(challenge,'seeded challenge draws a TM reward in the searched seeds');
  assert.ok(tmPool({boss:true,tmPool:5}).includes(challenge.rewardMove));
  assert.deepEqual(FLOOR_ITEM_WEIGHTS,[['berry',35],['pechaBerry',13],['rawstBerry',13],['cheriBerry',13],['chestoBerry',13],['healSeed',13]]);
  assert.equal(ITEM_NAMES.chestoBerry,'零余果');
  assert.deepEqual(ITEM_CURES.chestoBerry,['slp']);
  assert.deepEqual(tmPool({boss:true,tmPool:5}),TM_MOVES_V5);
  assert.equal(RULE_VERSION,'trial-rules-6');
  assert.equal(CONTENT_VERSION,'trial-content-7');
  assert.ok(moveEffectLabel('rest').includes('打盹'));
  assert.ok(moveEffectLabel('snore').includes('睡眠'));
});

test('a fallen leader is replaced before a surviving partner enters the learning phase',()=>{
  const s=isolatedBattle();s.queue=['A','B'];s.leader='A';
  s.units.A.hp=1;s.units.A.status={brn:{tick:1}};
  s.units.B.hp=s.units.B.maxHp=20;s.units.B.pos={x:2,y:1};s.units.B.species='bulbasaur';s.units.B.level=5;s.units.B.tactic='wait';
  setMoves(s.units.B,['seedbomb','energyball','sludgebomb','growl']);progress(s,5,PROG.thresholds[15]);
  let result=round(s);assert.equal(result.units.A.hp,0);assert.equal(result.units.A.pos,null);
  assert.equal(result.phase,'learning');assert.equal(result.leader,'B');assert.ok(result.pendingLearnMoves.every(p=>p.actor==='B'));
  const settledRound=result.round;let choices=0;
  while(result.phase==='learning'){assert.ok(++choices<=20);const next=applyCommand(result,{type:'learnMove',replace:null});assert.equal(next.ok,true,next.error);result=next.state;}
  assert.equal(result.phase,'playing');assert.equal(result.leader,'B');assert.equal(result.round,settledRound);
});
