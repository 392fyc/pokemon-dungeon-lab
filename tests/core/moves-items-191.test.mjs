import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyCommand,createMain,createExpedition,jumpToFloor,friend,key,rngStep,stageOf,CONTENT_VERSION,PROG} from '../../src/core/engine.ts';
import {moveOf} from '../../src/core/moves.ts';
import {moveEffectText} from '../../src/core/move-text.ts';
import {SPECIES,TM_MOVES_V3,TM_MOVES_V4,tmPool} from '../../src/core/roster.ts';
import {initialProfile,squadOf,newGameProfile} from '../../src/core/base.ts';
import {generateChallengeEncounter} from '../../src/core/dungeon.ts';
import {TrialStore,BUILD_ID} from '../../src/core/save.ts';
import {foeOf} from './foe-fixture.mjs';
import {sureHit} from './sure-hit.mjs';

const floor=Array.from({length:81},(_,i)=>({x:i%9,y:Math.floor(i/9)}));
function world(moves={tackle:5},enemyMoves={}){
  const s=createMain('moves191',false),a=friend('A',2,2,80,moves),e=foeOf('E','geodude',3,2,80,enemyMoves);
  a.maxHp=80;a.maxPp={...moves};
  e.waitOnly=true;s.floor=floor;s.seen=floor.map(key);s.units={A:a,E:e};s.queue=['A'];s.enemies=['E'];s.leader='A';s.camp=[];s.points=[];s.log=[];
  delete s.dungeon;delete s.rooms;s.prog={level:5,exp:PROG.thresholds[5],rng:123,made:0,kills:[],items:{berry:0,tonic:0}};
  return sureHit(s);
}
function play(s,action){const r=applyCommand(s,{type:'round',action});assert.equal(r.ok,true,r.error);return r.state;}
const cast=(s,skill,target='E')=>play(s,{type:'skill',skill,target});
const wait={type:'wait'};

test('M191 frozen kits: all 175 species retain the exact pre-expansion move ids and PP',()=>{
  const baseline=JSON.parse(readFileSync(new URL('../../tools/data/starting-kits-191.json',import.meta.url),'utf8'));
  assert.equal(Object.keys(baseline.kits).length,175);
  assert.deepEqual(Object.fromEntries(Object.entries(SPECIES).map(([id,s])=>[id,s.kit])),baseline.kits);
  assert.ok(SPECIES.bulbasaur.learnable.some(m=>m.move==='toxic'));
});
test('M191 primary debuff hits, misses, clamps, affects a boss, and respects Protect',()=>{
  const s=world({faketears:5});s.units.E.boss=true;s.units.E.stages.spd=-2;
  assert.equal(stageOf(cast(s,'faketears').units.E,'spd'),-4,'special defence runs to -10 now (-2 then -2 more)');
  {const deep=world({faketears:5});deep.units.E.stages.spd=-9;assert.equal(stageOf(cast(deep,'faketears').units.E,'spd'),-10,'and is held at -10');}
  const guarded=world({faketears:5});guarded.units.E.protect=2;
  assert.equal(stageOf(cast(guarded,'faketears').units.E,'spd'),0);
  const missed=world({sandattack:5});missed.units.A.stages.acc=-3;missed.units.E.stages.acc=0;
  for(let seed=1;seed<10000;seed++)if(rngStep(seed).value>.99){missed.battleRng=seed;break;}
  const r=cast(missed,'sandattack');assert.equal(stageOf(r.units.E,'acc'),0);assert.equal(r.units.A.pp.sandattack,4);assert.ok(r.events.some(e=>e.type==='miss'));
});
test('M191 multi-stat self buffs use special/accuracy/evasion stages; accuracy and evasion stop at +6, the others at +10',()=>{
  const s=world({coil:4});s.units.A.stages={atk:3,def:2,acc:2};
  const r=cast(s,'coil','A');assert.deepEqual(r.units.A.stages,{atk:4,def:3,acc:3});   // attack and defence go on past 3; accuracy rises by one like the others (its own limit is +6)
  const d=cast(world({dragondance:2}),'dragondance','A');assert.equal(d.units.A.stages.atk,1);assert.equal(d.units.A.stages.spe,undefined);
  assert.equal(stageOf(cast(world({nastyplot:2}),'nastyplot','A').units.A,'spa'),2);
});
test('M191 accuracy and evasion stages are held at -6 and +6 (D-20261110-08)',()=>{
  const lowered=world({sandattack:5});lowered.units.E.stages.acc=-5;
  const once=cast(lowered,'sandattack');assert.equal(stageOf(once.units.E,'acc'),-6,'-5 then -1 reaches -6');
  assert.equal(stageOf(cast(once,'sandattack').units.E,'acc'),-6,'a further drop is held at -6');
  const raised=world({minimize:5});raised.units.A.stages.eva=5;
  const up=cast(raised,'minimize','A');assert.equal(stageOf(up.units.A,'eva'),6,'+5 then +1 reaches +6');
  assert.equal(stageOf(cast(up,'minimize','A').units.A,'eva'),6,'a further rise is held at +6');
  const coil=world({coil:4});coil.units.A.stages.acc=6;assert.equal(stageOf(cast(coil,'coil','A').units.A,'acc'),6,'accuracy +6 stays +6');
});
test('M191 primary status applies to any type, keeps tox over psn, and respects Protect',()=>{
  const s=world({toxic:4,poisonpowder:4});
  let r=cast(s,'toxic');assert.ok(r.units.E.status.tox);const hp=r.units.E.hp;
  r=cast(r,'poisonpowder');assert.ok(r.units.E.status.tox);assert.equal(r.units.E.status.psn,undefined);assert.ok(r.units.E.hp<=hp);
  const p=world({willowisp:4});p.units.E.protect=2;assert.equal(cast(p,'willowisp').units.E.status,undefined);
});
test('M191 primary status misses spend PP without applying status, and can affect a boss',()=>{
  const missed=world({toxic:4});missed.units.A.stages.acc=-3;
  for(let seed=1;seed<10000;seed++)if(rngStep(seed).value>.99){missed.battleRng=seed;break;}
  const r=cast(missed,'toxic');assert.equal(r.units.A.pp.toxic,3);assert.equal(r.units.E.status,undefined);assert.ok(r.events.some(e=>e.type==='miss'));
  const boss=world({toxic:4});boss.units.E.boss=true;
  const hit=cast(boss,'toxic');assert.ok(hit.units.E.status.tox);assert.equal(hit.units.A.pp.toxic,3);
});
test('M191 a partner automatically casts an around status move at its enemy and spends PP',()=>{
  const s=world();const b=friend('B',2,3,80,{stunspore:4});b.tactic='together';s.units.B=b;s.queue.push('B');
  const r=play(s,wait);assert.equal(r.units.B.lastMove,'stunspore');assert.equal(r.units.B.pp.stunspore,3);assert.ok(r.units.E.status.par);
  assert.deepEqual(r.units.B.pos,b.pos);assert.equal(r.units.E.hp,80);assert.ok(!r.log.some(line=>line.includes('动作失效')));
});
test('M191 recoil is based on actual HP lost, does not happen after zero damage, and can knock out its user',()=>{
  const s=world({takedown:3});s.units.E.hp=3;
  const r=cast(s,'takedown');assert.equal(r.units.E.hp,0);assert.equal(r.units.A.hp,79,'quarter of actual 3 damage is at least one');
  const p=world({takedown:3});p.units.E.protect=2;assert.equal(cast(p,'takedown').units.A.hp,80);
  const k=world({doubleedge:3});k.units.A.hp=1;
  const out=cast(k,'doubleedge');assert.equal(out.units.A.hp,0);assert.equal(out.units.A.pos,null);
});
test('M191 recovery rounds half max HP, affects only its user, and caps at max HP',()=>{
  const s=world({recover:3});s.units.A.maxHp=21;s.units.A.hp=1;
  let r=cast(s,'recover','A');assert.equal(r.units.A.hp,12);r=cast(r,'recover','A');assert.equal(r.units.A.hp,21);assert.equal(r.units.E.hp,80);
});
test('M191 Soft-Boiled heals the living party in reach, rounds each max HP separately, and leaves enemies and distant allies alone',()=>{
  const s=world({softboiled:3});s.rooms=[{x:1,y:1,w:4,h:4}];s.units.A.hp=1;s.units.A.maxHp=21;
  s.units.E.pos={x:4,y:4};
  for(const [id,x,y,max] of [['B',2,3,31],['C',7,7,41]]){const u=friend(id,x,y,1,{});u.maxHp=max;u.tactic='wait';s.units[id]=u;s.queue.push(id);}
  const r=cast(s,'softboiled','A');assert.equal(r.units.A.hp,12);assert.equal(r.units.B.hp,17);assert.equal(r.units.C.hp,1);assert.equal(r.units.E.hp,80);
});
test('M191 primary room debuffs respect the shared Quick Guard distance rule per target',()=>{
  const s=world({growl:4});s.rooms=[{x:1,y:1,w:6,h:6}];s.units.E.pos={x:5,y:2};s.quickguard={owner:'enemy',units:['E']};
  const blocked=cast(s,'growl','A');assert.equal(blocked.units.E.stages.atk,0);
  s.units.E.pos={x:3,y:2};assert.equal(cast(s,'growl','A').units.E.stages.atk,-1);
});
test('M191 enemy uses status before debuff, then heal, self buff, and always prefers damage',()=>{
  const s=world({}, {calmmind:5,recover:5,leer:5,toxic:5});delete s.units.E.waitOnly;s.units.E.hp=20;
  let r=play(s,wait);assert.equal(r.units.E.lastMove,'toxic');
  r=play(r,wait);assert.equal(r.units.E.lastMove,'leer');assert.equal(r.units.A.stages.def,-1,'A1 is selected before recovery while its target is not capped');assert.equal(r.units.E.hp,20);
  r.units.A.stages.def=-3;r=play(r,wait);assert.equal(r.units.E.lastMove,'recover');
  r.units.E.hp=r.units.E.maxHp;r=play(r,wait);assert.equal(r.units.E.lastMove,'calmmind');
  const d=world({}, {toxic:5,tackle:5,recover:5});delete d.units.E.waitOnly;d.units.E.hp=20;
  assert.equal(play(d,wait).units.E.lastMove,'tackle');
});
test('M191 no useful support: existing status, capped stages and half-or-higher HP are skipped',()=>{
  const s=world({}, {toxic:5,leer:5,recover:5,calmmind:5});delete s.units.E.waitOnly;
  s.units.A.status={tox:{tick:2}};s.units.A.stages.def=-3;s.units.E.stages={atk:0,def:0,spa:3,spd:3};s.units.E.hp=40;
  assert.equal(play(s,wait).units.E.lastMove,null,'falls back to basic attack rather than spending support PP');
});
test('Violent seed raises each of attack and special attack to at least +3 and never lowers one; with both at +3 or more it is refused and kept',()=>{
  const mk=(atk,spa)=>{const s=world({tackle:5});s.units.A.stages={atk,def:0,spa};s.prog.items.violentSeed=1;return s;};
  const r=play(mk(6,0),{type:'use',item:'violentSeed',target:'A'});
  assert.equal(stageOf(r.units.A,'atk'),6,'the +6 attack stays');assert.equal(stageOf(r.units.A,'spa'),3,'special attack rises to +3');assert.equal(r.prog.items.violentSeed,0);
  const line=r.log.find(l=>l.includes('暴力种子'));assert.ok(line.includes('特攻升到+3级')&&!line.includes('攻击和'),'the log names only the stage that rose: '+line);
  for(const [atk,spa] of [[3,3],[6,5],[10,3]]){const s=mk(atk,spa),refused=applyCommand(s,{type:'round',action:{type:'use',item:'violentSeed',target:'A'}});
    assert.equal(refused.ok,false,`${atk}/${spa} is refused`);assert.equal(s.prog.items.violentSeed,1,'nothing is consumed');}
});
test('M191 violent seed maximizes both attack stages; full elixir fills every move of one adjacent ally',()=>{
  const s=world({tackle:5,protect:9});const b=friend('B',2,3,80,{tackle:5,protect:9});s.units.B=b;s.queue.push('B');
  b.maxHp=80;b.maxPp={tackle:5,protect:9};b.tactic='nomoves';
  s.prog.items.violentSeed=1;s.prog.items.maxElixir=1;b.stages={atk:-3,def:0,spa:-2};b.pp={tackle:0,protect:1};
  let r=play(s,{type:'use',item:'violentSeed',target:'B'});assert.equal(stageOf(r.units.B,'atk'),3);assert.equal(stageOf(r.units.B,'spa'),3);assert.equal(r.prog.items.violentSeed,0);
  r=play(r,{type:'use',item:'maxElixir',target:'B'});assert.deepEqual(r.units.B.pp,r.units.B.maxPp);assert.equal(r.units.A.pp.tackle,5);assert.equal(r.prog.items.maxElixir,0);
  const invalid=applyCommand(r,{type:'round',action:{type:'use',item:'maxElixir',target:'B'}});assert.equal(invalid.ok,false);
});
test('M191 camp content-5 migrates strictly and writes content-7; malformed old profiles keep original bytes',async()=>{
  const make=raw=>{const port={value:raw,getItem(){return this.value;},setItem(k,v){this.value=v;},removeItem(){this.value=null;}};return {port,store:new TrialStore(port)};};
  const old={format:2,rules:'trial-rules-5',content:'trial-content-5',build:BUILD_ID,sequence:9,profile:initialProfile()};
  const {port,store}=make(JSON.stringify(old));await store.whenReady;assert.equal(store.status,'ready');assert.equal(CONTENT_VERSION,'trial-content-7');
  const saved=JSON.parse(port.value);assert.equal(saved.content,CONTENT_VERSION);assert.equal(saved.sequence,10);assert.deepEqual(saved.profile,old.profile);
  const bad=JSON.stringify({...old,profile:{...old.profile,unknown:true}}),failed=make(bad);await failed.store.whenReady;
  assert.equal(failed.store.status,'blocked');assert.equal(failed.port.value,bad);
});
test('M191 two new room items can be collected once and remain in the backpack across a real floor change',()=>{
  const found=new Set();
  for(let seed=1;seed<=100&&found.size<2;seed++){
    let s=createExpedition('items191-'+seed,seed,3,squadOf(initialProfile()),0,undefined,4);
    const room=s.adventureRooms.find(r=>['violentSeed','maxElixir'].includes(r.item)&&!found.has(r.item));if(!room)continue;
    const item=room.item;for(const e of s.enemies)s.units[e].waitOnly=true;
    s.units[s.leader].pos={...room.interaction};s.seen=s.floor.map(key);
    s=play(s,{type:'interact',exit:false});assert.equal(s.prog.items[item],1);
    assert.equal(s.adventureRooms.find(r=>r.room===room.room).state,'done');
    const next=jumpToFloor(s,2);assert.equal(next.dungeon.level,2);assert.equal(next.prog.items[item],1);found.add(item);
  }
  assert.deepEqual([...found].sort(),['maxElixir','violentSeed']);
  for(let seed=1;seed<=1000;seed++){const r=generateChallengeEncounter(seed,1,'normal',true,4);assert.ok(!r.rewardItem||['bigBerry','teamTonic','slumberOrb','totterOrb','luminousOrb','rollcallOrb','reviverSeed'].includes(r.rewardItem),'the Violent Seed and Max Elixir do not enter challenge rewards');}
});
test('M191 the v4 pool preserves v3 and all six new machines can be learned, saved, equipped and brought into the next expedition',async()=>{
  assert.deepEqual(TM_MOVES_V4,[...TM_MOVES_V3,'calmmind','toxic','bulkup','willowisp','thunderwave','swordsdance']);
  assert.deepEqual(tmPool({boss:true,tmPool:3}),TM_MOVES_V3);assert.deepEqual(tmPool({boss:true,tmPool:4}),TM_MOVES_V4);
  for(const move of TM_MOVES_V4.slice(9)){
    const species=Object.values(SPECIES).find(s=>s.learnable.some(m=>m.move===move)&&!s.kit.some(m=>m.move===move));assert.ok(species);
    const p=newGameProfile('bulbasaur','charmander').profile;p.roster[0]={...p.roster[0],species:species.id,learned:species.kit.map(m=>({...m})),carry:species.kit.map(m=>m.move)};p.vault[move]=1;
    const port={value:null,getItem(){return this.value;},setItem(k,v){this.value=v;}};let store=new TrialStore(port);
    assert.equal(await store.beginNewGame(p,false),true,store.error);assert.equal((await store.baseAction({type:'learn',inst:'P1',move})).ok,true);
    assert.equal((await store.baseAction({type:'carry',inst:'P1',moves:[move]})).ok,true);
    store=new TrialStore(port);assert.equal(store.status,'ready',store.error);assert.equal(store.profile.vault[move],undefined);
    assert.equal(await store.depart('tm191-'+move,38),true,store.error);assert.equal(store.state.dungeon.tmPool,5);
    const unit=Object.values(store.state.units).find(u=>u.inst==='P1');assert.ok(unit);assert.deepEqual(unit.learned,[move]);
    assert.equal(unit.pp[move],SPECIES[species.id].learnable.find(m=>m.move===move).pp);
  }
});
test('M191 displayed texts come from the engine data: Soft-Boiled heals the whole room party',()=>{
  assert.match(moveEffectText('softboiled'),/范围内全队各自回复最大HP的一半/);
  assert.match(moveEffectText('minimize'),/自身闪避\+1/);assert.match(moveEffectText('toxic'),/使对方剧毒/);
});
