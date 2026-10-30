import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createExpedition,applyCommand,jumpToFloor,rngStep,closeOut,key,PROG} from '../../src/core/engine.ts';
import {initialProfile,newGameProfile,squadOf,settleRun} from '../../src/core/base.ts';
import {TrialStore,decodeLegacy,BUILD_ID} from '../../src/core/save.ts';
import {generateFloor,farthestRoom,roomCells,center,THEME_FLOORS,themeOfLevel,LEGACY_WILD,WILD_SPECIES,BOSS,serviceRoll} from '../../src/core/dungeon.ts';
import {LEGACY_TM_MOVES,TM_MOVES,tmPool,BOSS_SPECIES,SPECIES,learnableMove} from '../../src/core/roster.ts';
import {NAME_TABLE,speciesZh,moveZh,tmZh} from '../../src/core/names.ts';
import {enemyInfo,localizeLog} from '../../src/core/describe.ts';
import {friend,enemy,pos,row} from '../acceptance/fixtures.mjs';

/*
 * Stage 7.3 tests: docs/玩法研究/内容扩充与首领.md, section "验收" (groups D, T, L, B, S). Expected values are literals: either the spec's numbers, or values
 * observed once from the Showdown import / the generator and then frozen (each such literal says so). Seeds for "some seed shows X" cases were searched first.
 */
const roster=JSON.parse(readFileSync(new URL('../../src/data/roster.json',import.meta.url),'utf8'));
const by=Object.fromEntries(roster.species.map(s=>[s.id,s]));
const memory=()=>{const m=new Map();let writes=0;return {getItem:k=>m.get(k)??null,setItem:(k,v)=>{m.set(k,v);writes++;},map:m,writes:()=>writes};};
const NEW8=['sandshrew','growlithe','magnemite','onix','dratini','wooper','houndour','makuhita'];
const ESTABLISHED23=['bulbasaur','charmander','squirtle','pidgey','rattata','spearow','pikachu','zubat','geodude','chikorita','cyndaquil','totodile','treecko','torchic','mudkip',...NEW8];
const FLOORS3={width:20,height:14,floors:3,boss:true};
const kitOf=id=>by[id].kit.map(k=>[k.move,k.pp]);
const frozenSpecies=s=>({id:s.id,starter:s.starter,maxHp:s.maxHp,kit:s.kit});

/* ---------- D: data chain ---------- */
test('D1 the expanded roster keeps the established 23 species first and freezes only their starter, HP and kit fields',()=>{
 assert.equal(roster.species.length,160);
 assert.deepEqual(roster.species.slice(0,23).map(s=>s.id),ESTABLISHED23);
 // The new import expands learnable and adds generation/availability metadata. Only these four fields were frozen by the Pokédex batch-import specification.
 assert.equal(createHash('sha256').update(JSON.stringify(roster.species.slice(0,23).map(frozenSpecies))).digest('hex'),'3419bec7d22f9269b39f11810276f78544d248197c68b1aa8fb6f74f3712a962');
});
test('D2 the eight new species are not starters, have a kit of 1-2 moves and a non-empty learnable list; kits are the importer output (assumptions A1-A3, observed 2026-10-30)',()=>{
 for(const id of NEW8){assert.equal(by[id].starter,false);assert.ok(by[id].kit.length>=1&&by[id].kit.length<=2,id);assert.ok(by[id].learnable.length>0,id);}
 assert.deepEqual(kitOf('sandshrew'),[['scratch',3],['defensecurl',4]]);
 assert.deepEqual(kitOf('growlithe'),[['ember',2],['bite',2]]);
 assert.deepEqual(kitOf('magnemite'),[['tackle',3],['thundershock',3]]);
 assert.deepEqual(kitOf('onix'),[['tackle',3],['harden',3]]);
 assert.deepEqual(kitOf('dratini'),[['dragontail',1],['slam',2]]);
 assert.deepEqual(kitOf('wooper'),[['watergun',2],['slam',2]]);
 assert.deepEqual(kitOf('houndour'),[['ember',2],['roar',2]]);
 assert.deepEqual(kitOf('makuhita'),[['tackle',3],['whirlwind',2]]);
});
test('D3 gate: at least 2 of the new species have push in the kit and at least 2 have guard (shellder failed the gate and onix replaced it)',()=>{
 const pools=new Set(THEME_FLOORS.flatMap(t=>Object.values(t.pool).flat()));
 assert.deepEqual(NEW8.filter(id=>by[id].kit.some(k=>['dragontail','roar','whirlwind'].includes(k.move))),['dratini','houndour','makuhita']);
 assert.deepEqual(NEW8.filter(id=>by[id].kit.some(k=>['defensecurl','harden'].includes(k.move))),['sandshrew','onix']);
 assert.ok(by.shellder,'the full Pokédex now includes shellder');
 assert.ok(!NEW8.includes('shellder')&&!pools.has('shellder'),'the previous appearance-pool gate still selects onix instead of shellder');
});
test('D4 the established encounter pool stays fixed; Arcanine is in the Pokédex but remains boss-only',()=>{
 const pools=new Set(THEME_FLOORS.flatMap(t=>Object.values(t.pool).flat()));
 for(const id of NEW8)assert.ok(pools.has(id),id);
 assert.deepEqual(Object.keys(LEGACY_WILD),['pidgey','rattata','spearow','zubat','geodude']);
 assert.deepEqual(Object.keys(WILD_SPECIES).sort(),[...new Set([...Object.keys(LEGACY_WILD),...pools])].sort());
 for(const id of Object.keys(LEGACY_WILD))assert.ok(id in WILD_SPECIES);
 for(const id of pools)assert.equal(WILD_SPECIES[id],by[id].dex,id);
 assert.ok(!('arcanine' in WILD_SPECIES));assert.deepEqual(Object.keys(BOSS_SPECIES),['arcanine']);assert.equal(by.arcanine.dex,'0059');assert.equal(BOSS_SPECIES.arcanine,by.arcanine.dex);
});
test('D5 the Chinese name table has the eight new species, the boss and the four new machine moves',()=>{
 assert.deepEqual(NEW8.map(speciesZh),['穿山鼠','卡蒂狗','小磁怪','大岩蛇','迷你龙','乌波','戴鲁比','幕下力士']);
 assert.equal(speciesZh('arcanine'),'风速狗');
 assert.deepEqual(['dragontail','helpinghand','mudslap','terablast'].map(tmZh),['龙尾','帮助','掷泥','太晶爆发']);
 assert.deepEqual(['protect','whirlwind','roar'].map(tmZh),['守住','吹飞','吼叫']);
 for(const s of roster.species)for(const m of [...s.kit,...s.learnable])if(m.move!=='visegrip')assert.ok(NAME_TABLE.moves[m.move],m.move);
 assert.equal(moveZh('visegrip'),'visegrip','the documented PokeAPI spelling exception falls back to its Showdown id');
});

/* ---------- T: technique machines ---------- */
test('T1 the machine list has 7 entries, the first three being 守住, 吹飞, 吼叫; the legacy list is the three',()=>{
 assert.equal(TM_MOVES.length,7);assert.deepEqual(TM_MOVES.slice(0,3),['protect','whirlwind','roar']);assert.deepEqual(TM_MOVES.slice(0,3).map(tmZh),['守住','吹飞','吼叫']);
 assert.deepEqual([...LEGACY_TM_MOVES],['protect','whirlwind','roar']);
 assert.deepEqual([...tmPool({boss:true})],[...TM_MOVES]);assert.deepEqual([...tmPool({})],[...LEGACY_TM_MOVES]);assert.deepEqual([...tmPool(undefined)],[...LEGACY_TM_MOVES]);
});
test('T2 each new machine move can be learned by at least 2 roster species, with the behavior and PP observed from the import',()=>{
 const learners=m=>roster.species.filter(s=>s.learnable.some(l=>l.move===m)).map(s=>s.id);
 for(const m of ['dragontail','helpinghand','mudslap','terablast'])assert.ok(learners(m).length>=2,m);
 for(const id of ['charmander','treecko','onix','dratini'])assert.ok(learners('dragontail').includes(id),id);
 assert.deepEqual(learnableMove('charmander','dragontail'),{move:'dragontail',pp:1});
 assert.deepEqual(learnableMove('bulbasaur','helpinghand'),{move:'helpinghand',pp:2});
 assert.deepEqual(learnableMove('rattata','mudslap'),{move:'mudslap',pp:1});
 assert.deepEqual(learnableMove('geodude','terablast'),{move:'terablast',pp:1});
});
const base=()=>squadOf(initialProfile());
test('T3 without the boss mark the shop machine is always one of the legacy three (seeds 1-200), and the machine seed 2 sells differs by mark',()=>{
 let shops=0;
 for(let seed=1;seed<=200;seed++){const w=createExpedition('t3',seed,2,base(),0);if(w.shop){shops++;assert.ok(['protect','whirlwind','roar'].includes(w.shop.stock.tm),`seed ${seed}`);}}
 assert.ok(shops>40,'the check really covered shops: '+shops);
 assert.equal(createExpedition('t3',2,2,base(),0).shop.stock.tm,'whirlwind');   // 7.2 value, also asserted in rescue.test R14
 assert.equal(createExpedition('t3',2,3,base(),0).shop.stock.tm,'dragontail'); // same seed, boss mark: draw index 0.49*7
});
function atItem(w){const it=w.points.find(p=>p.kind==='item');w.units[w.leader].pos={...it.pos};return w;}
test('T3b without the boss mark target T also draws from the legacy three (seeds 1-40)',()=>{
 for(let seed=1;seed<=40;seed++){const w=atItem(jumpToFloor(createExpedition('t3b',seed,2,base(),0),2));
  const r=applyCommand(w,{type:'round',action:{type:'interact',exit:false}});assert.equal(r.ok,true,r.error);
  assert.ok(['protect','whirlwind','roar'].includes(r.state.tms[0].move),`seed ${seed}: ${r.state.tms[0].move}`);}
});
test('T4 with the boss mark, T and the shop reach the four new machines (fixed seeds searched in advance)',()=>{
 const t=seed=>{const w=atItem(jumpToFloor(createExpedition('t4',seed,3,base(),0),3));const r=applyCommand(w,{type:'round',action:{type:'interact',exit:false}});assert.equal(r.ok,true,r.error);return r.state.tms;};
 assert.deepEqual(t(5),[{move:'dragontail',source:'target',fate:'held'}]);
 assert.deepEqual(t(2),[{move:'helpinghand',source:'target',fate:'held'}]);
 assert.deepEqual(t(6),[{move:'mudslap',source:'target',fate:'held'}]);
 assert.deepEqual(t(1),[{move:'terablast',source:'target',fate:'held'}]);
 assert.deepEqual([[2,1,'dragontail'],[6,1,'helpinghand'],[40,1,'mudslap'],[38,2,'terablast']].map(([seed])=>{const s=createExpedition('t4s',seed,3,base(),0).shop;return [seed,s.level,s.stock.tm];}),
  [[2,1,'dragontail'],[6,1,'helpinghand'],[40,1,'mudslap'],[38,2,'terablast']]);
});

/* ---------- L: floors and themes ---------- */
test('L1 without the boss mark, 2-floor runs generate the same floors for seeds 1-50 (hash recorded before the change)',()=>{
 const out=[];
 for(let seed=1;seed<=50;seed++){const fl=[];for(const level of [1,2])fl.push(generateFloor(seed,level,{width:20,height:14,floors:2}));out.push(createHash('sha256').update(JSON.stringify(fl)).digest('hex'));}
 assert.deepEqual(out.slice(0,3),['41d9a6f6cd24fe78f5cf2264e4898b68e71c133745d37a5358417bade9f85a44','f64e7926e1dd87e604099735e4786fadfcd2457de816e95c65933ca434d9bf35','b75d81caaeebe18373ef2473d3c2bcbae50b3003afb60ce4bf295344a8048a9f']);
 assert.equal(createHash('sha256').update(out.join('\n')).digest('hex'),'9928ed52afc38563d9c9acddc23f9acf9b6c1b4cb324114e9fa092ebb6bd9463');
 for(let seed=1;seed<=50;seed++){const g=generateFloor(seed,2,{width:20,height:14,floors:2});assert.equal(g.theme,undefined);assert.equal(g.bossRoom,undefined);assert.ok(g.enemies.every(e=>e.boss===undefined&&e.species in LEGACY_WILD),'old path draws from the legacy five');}
});
test('L1b the old generator path and the departure with 2 floors never carry the boss mark',()=>{
 assert.equal(createExpedition('l1b',5,2,base(),0).dungeon.boss,undefined);
 assert.equal(createExpedition('l1b',5,3,base(),0).dungeon.boss,true);
 assert.equal(createExpedition('l1b',5,3).dungeon.boss,undefined,'no base, no boss');
 assert.equal(createExpedition('l1b',5,3,base(),0,false).dungeon.boss,undefined);
});
test('L2 boss-marked runs go 苔石洞, 潮湿水窟, 灰烬裂谷, with the tier mix and species pools of the theme table (seeds 1-200)',()=>{
 const pools=[{melee:['rattata','sandshrew','geodude'],ranged:['pidgey','spearow']},{melee:['onix','wooper'],ranged:['magnemite','zubat','dratini']},{melee:['makuhita','geodude'],chase:['growlithe','houndour']}];
 const mix=[['melee','ranged'],['melee','ranged','ranged'],['melee','chase','chase']];
 assert.deepEqual(THEME_FLOORS.map(t=>t.name),['苔石洞','潮湿水窟','灰烬裂谷']);assert.deepEqual(THEME_FLOORS.map(t=>t.theme),['moss','wet','ash']);
 assert.deepEqual([1,2,3].map(l=>themeOfLevel(true,l)),['moss','wet','ash']);assert.equal(themeOfLevel(false,3),'moss');
 for(let seed=1;seed<=200;seed++)for(let level=1;level<=3;level++){
  const g=generateFloor(seed,level,FLOORS3),normal=g.enemies.filter(e=>!e.boss);
  assert.equal(g.theme,['moss','wet','ash'][level-1]);
  assert.deepEqual(normal.map(e=>e.ai),mix[level-1],`seed ${seed} floor ${level}`);
  normal.forEach(e=>assert.ok(pools[level-1][e.ai].includes(e.species),`seed ${seed} floor ${level}: ${e.species} as ${e.ai}`));
  assert.equal(g.enemies.filter(e=>e.boss).length,level===3?1:0);
 }
 // the enemy numbers stay on the tier table: no hit-point multiplier per theme
 const g2=generateFloor(1,2,FLOORS3);assert.deepEqual(g2.enemies.map(e=>[e.ai,e.hp,e.damage]),[['melee',16,4],['ranged',6,6],['ranged',6,6]]);
 const g3=generateFloor(1,3,FLOORS3);assert.deepEqual(g3.enemies.map(e=>[e.id,e.species,e.ai,e.hp,e.damage]),[['w3a','makuhita','melee',16,4],['w3b','growlithe','chase',6,3],['w3c','houndour','chase',6,3],['boss','arcanine','melee',60,4]]);
});
const bossOf=g=>g.enemies.filter(e=>e.boss);
test('L3 floor 3: exactly one exit in the lobby, no down stairs, one boss at the centre of the farthest room, nothing else in the boss room, T outside it (seeds 1-200)',()=>{
 for(let seed=1;seed<=200;seed++){
  const g=generateFloor(seed,3,FLOORS3),D=[[1,0],[0,1],[-1,0],[0,-1]];
  // farthest room worked out again here: breadth-first path length from the first room's centre, ties to the lower index
  const cells=new Set(g.floor.map(key)),dist=new Map([[key(center(g.rooms[0])),0]]),q=[center(g.rooms[0])];
  for(let i=0;i<q.length;i++)for(const [dx,dy] of D){const c={x:q[i].x+dx,y:q[i].y+dy};if(cells.has(key(c))&&!dist.has(key(c))){dist.set(key(c),dist.get(key(q[i]))+1);q.push(c);}}
  let far=-1;g.rooms.forEach((r,n)=>{if(n>0&&(far<0||dist.get(key(center(r)))>dist.get(key(center(g.rooms[far])))))far=n;});
  const R=g.rooms[far];assert.equal(g.bossRoom,far,`seed ${seed}`);
  const exits=g.points.filter(p=>p.kind==='exit');assert.equal(exits.length,1,`seed ${seed}`);assert.equal(g.down,null);assert.ok(!g.points.some(p=>p.kind==='down'));
  // lobby: the free cell of the arrival room nearest the up stairs, ties top row then left
  const a=g.rooms[0],inA=c=>c.x>=a.x&&c.x<a.x+a.w&&c.y>=a.y&&c.y<a.y+a.h;assert.ok(inA(exits[0].pos),`seed ${seed}: exit in the arrival room`);
  const near=roomCells(a).filter(c=>!(c.x===g.up.x&&c.y===g.up.y)).sort((p,r)=>Math.abs(p.x-g.up.x)+Math.abs(p.y-g.up.y)-Math.abs(r.x-g.up.x)-Math.abs(r.y-g.up.y)||p.y-r.y||p.x-r.x)[0];
  assert.deepEqual(exits[0].pos,near,`seed ${seed}`);
  const b=bossOf(g);assert.equal(b.length,1);assert.deepEqual(b[0].pos,{x:R.x+Math.floor(R.w/2),y:R.y+Math.floor(R.h/2)});assert.equal(g.enemies.at(-1).boss,true);
  const inR=c=>c.x>=R.x&&c.x<R.x+R.w&&c.y>=R.y&&c.y<R.y+R.h;
  const others=[...g.enemies.filter(e=>!e.boss).map(e=>e.pos),...g.points.map(p=>p.pos),...g.pickups.map(p=>p.pos),...g.services.map(p=>p.pos),...(g.rest?[g.rest.pos]:[])];
  assert.ok(!others.some(inR),`seed ${seed}: something stands in the boss room`);
  assert.equal(g.points.filter(p=>p.kind==='item').length,1);
 }
});
test('L4 floor 3: all floor cells are connected and the boss room can be reached from the lobby exit (seeds 1-200)',()=>{
 for(let seed=1;seed<=200;seed++){
  const g=generateFloor(seed,3,FLOORS3),cells=new Set(g.floor.map(key)),exit=g.points.find(p=>p.kind==='exit').pos,boss=bossOf(g)[0].pos;
  const seen=new Set([key(exit)]),q=[exit];
  for(let i=0;i<q.length;i++)for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){const c={x:q[i].x+dx,y:q[i].y+dy};if(cells.has(key(c))&&!seen.has(key(c))){seen.add(key(c));q.push(c);}}
  assert.equal(seen.size,cells.size,`seed ${seed}: not connected`);assert.ok(seen.has(key(boss)),`seed ${seed}: boss unreachable`);
 }
});

/* ---------- B: boss rules ---------- */
/** A boss floor on an open row: the real run's units are replaced by plain fixtures so every number is a literal. */
/** Runs `fn` with the boss attack count set to `n` (the shared BOSS object), restoring it afterwards. */
function withBossAttacks(n,fn){const was=BOSS.attacks;BOSS.attacks=n;try{return fn();}finally{BOSS.attacks=was;}}
/* The hand-built boss below keeps the historical 80 HP / 6 damage on purpose: those are the numbers every literal in the B tests was written for, and they are
 * still a legal saved boss (save.ts BOSS_HISTORY), so the fixtures also exercise that old saves keep loading. The current numbers are pinned in the generator test and 'boss constants'. */
function arena({boss=[4],bossHp=80,units,floor=row(9),exit=null}={}){
 const s=jumpToFloor(createExpedition('b',1,3,base(),0),3);
 for(const id of s.enemies)delete s.units[id];
 delete s.units.A;delete s.units.B;delete s.rooms;
 s.floor=floor;s.seen=floor.map(key);s.enemies=['boss'];s.points=exit?[{pos:exit,kind:'exit',used:false}]:[];
 s.units.boss={...enemy('boss',boss[0],1,bossHp,'melee',6,3),maxHp:80,species:'arcanine',boss:true};
 Object.assign(s.units,units);s.queue=Object.keys(units).filter(i=>units[i].side==='friend');s.leader=s.queue[0];s.camp=[];
 s.prog.rng=7;return s;
}
const A=(x,hp=20,pp={tackle:2,roar:2})=>friend('A',x,1,hp,pp);
const B=(x,hp=20,pp={protect:2})=>friend('B',x,1,hp,pp);
const round=(s,action,override)=>{const r=applyCommand(s,{type:'round',action,...(override?{override}:{})});assert.equal(r.ok,true,r.error);return r.state;};
test('B1 defeating only the boss sends no invitation and moves the recruit stream by exactly one step',()=>{
 const s=arena({bossHp:1,units:{A:A(3),B:B(2)}});
 const after=round(s,{type:'basic',target:'boss'});
 assert.equal(after.units.boss.hp,0);assert.deepEqual(after.invitations,[]);assert.equal(after.phase,'playing');
 assert.equal(s.prog.rng,7);
 assert.equal(after.prog.rng,1831565820,'stream state 7 stepped once (value 0.0117)');
 assert.equal(after.prog.made,0);
});
test('B2 push on the boss is refused with the Chinese reason and costs no PP',()=>{
 const s=arena({units:{A:A(3),B:B(2)}});
 const r=applyCommand(s,{type:'round',action:{type:'skill',skill:'roar',target:'boss'}});
 assert.equal(r.ok,false);assert.equal(r.error,'首领不会被吹飞；本轮未执行');assert.deepEqual(r.state,s);assert.equal(s.units.A.pp.roar,2);assert.equal(s.units.boss.pos.x,4);
});
test('B3 with two attacks per round the boss hits twice for 6, never moves, and does not attack when everyone is out of reach and out of line',()=>withBossAttacks(2,()=>{
 const s=arena({units:{A:A(3),B:B(0)}});
 const hit=round(s,{type:'wait'});
 assert.equal(hit.units.A.hp,8,'two attacks of 6 on the adjacent member');assert.equal(hit.units.B.hp,20);assert.deepEqual(hit.units.boss.pos,{x:4,y:1});
 const far=arena({units:{A:A(8),B:B(9)}});const calm=round(far,{type:'wait'});
 assert.equal(calm.units.A.hp,20);assert.equal(calm.units.B.hp,20);assert.deepEqual(calm.units.boss.pos,{x:4,y:1},'the boss does not chase');
 // off the row (open 2-row floor): not adjacent and not in a straight line -> no attack
 const open=[...row(9),...row(9).map(p=>({x:p.x,y:2}))];
 const o=arena({floor:open,units:{A:{...A(6),pos:{x:6,y:2}},B:{...B(9),pos:{x:9,y:2}}}});
 const none=round(o,{type:'wait'});assert.equal(none.units.A.hp,20);assert.equal(none.units.B.hp,20);
 // within 3 cells on the row and clear: a ray attack, twice
 const ray=arena({units:{A:A(7),B:B(9)}});const shot=round(ray,{type:'wait'});assert.equal(shot.units.A.hp,8);
}));
test('B3b with the current BOSS the boss attacks once per round (same fixtures, one hit of 6 instead of two)',()=>{
 assert.equal(BOSS.attacks,1);
 const hit=round(arena({units:{A:A(3),B:B(0)}}),{type:'wait'});assert.equal(hit.units.A.hp,14);assert.equal(hit.units.B.hp,20);
 const shot=round(arena({units:{A:A(7),B:B(9)}}),{type:'wait'});assert.equal(shot.units.A.hp,14);
});
test('B4 protect blocks both boss hits on its user for the first enemy phase',()=>withBossAttacks(2,()=>{
 const s=arena({units:{A:A(3,20,{protect:2}),B:B(2)}});
 const r=round(s,{type:'skill',skill:'protect',target:'A'});
 assert.equal(r.units.A.hp,20);assert.equal(r.units.B.hp,20);assert.equal(r.units.A.pp.protect,1);assert.equal(r.units.A.protect,2);
}));
test('B10 when the first attack defeats the adjacent target, the second attack chooses the next one (here by ray); nothing left means no attack',()=>withBossAttacks(2,()=>{
 const s=arena({units:{A:A(3,6),B:B(2)}});
 const r=round(s,{type:'wait'});
 assert.equal(r.units.A.hp,0);assert.equal(r.units.B.hp,14,'second attack: 6 on the next member in the ray');
 const lone=arena({units:{A:A(3,6),B:B(0,20)}});lone.units.B.pos=null;lone.units.B.hp=0;
 const r2=round(lone,{type:'wait'});assert.equal(r2.phase,'ended');assert.equal(r2.end.outcome,'wipe');
 assert.equal(r2.log.filter(l=>l.includes('受到6伤害')).length,1,'one hit only: after the lone member fell the second attack found nothing');
}));
const exitAt=3;
test('B5 after the boss falls the last machine is the boss machine (held), the draw used one random step, experience rose by 3',()=>{
 const s=arena({bossHp:1,units:{A:A(3),B:B(2)}});
 const r=round(s,{type:'basic',target:'boss'});
 assert.deepEqual(r.tms,[{move:'protect',source:'boss',fate:'held'}],'stream value 0.0117 x 7 = index 0');
 assert.equal(r.prog.exp,3);assert.equal(r.prog.level,2);assert.equal(r.units.A.maxHp,22);
 assert.ok(r.log.some(l=>l.includes('区域首领被讨伐')));
 // a second round does not give a second machine or more experience
 const again=round(r,{type:'wait'});assert.equal(again.tms.length,1);assert.equal(again.prog.exp,3);assert.equal(again.prog.rng,r.prog.rng);
});
test('B6 after the boss fell, a normal exit brings the boss machine home: end.boss true, fate brought, reason includes 带回招式机',()=>{
 const s=arena({bossHp:1,units:{A:A(3),B:B(2)},exit:pos(1)});
 let w=round(s,{type:'basic',target:'boss'});
 w.units.A.pos=pos(1);w.units.B.pos=pos(2);
 w=round(w,{type:'interact',exit:true});assert.equal(w.phase,'exit');
 const f=applyCommand(w,{type:'finishExit'});assert.equal(f.ok,true,f.error);
 assert.equal(f.state.end.boss,true);assert.equal(f.state.end.outcome,'normal');
 assert.deepEqual(f.state.end.tms,[{move:'protect',source:'boss',fate:'brought'}]);
 assert.equal(f.state.end.effective,true);assert.deepEqual(f.state.end.reasons,['tm']);
});
test('B7 leaving by the lobby without challenging: end.boss false, the run ends normally, the reward is 100 once G was done',()=>{
 const s=arena({boss:[9],units:{A:A(1),B:B(0)},exit:pos(1)});s.goal=true;s.prog.exp=2;s.points[0].used=false;
 let w=round(s,{type:'interact',exit:true});assert.equal(w.phase,'exit');
 const f=applyCommand(w,{type:'finishExit'});assert.equal(f.ok,true,f.error);
 assert.equal(f.state.end.boss,false);assert.equal(f.state.end.reward,100);assert.equal(f.state.end.outcome,'normal');assert.equal(f.state.units.boss.hp,80);
});
function profileOf3(){
 const p=newGameProfile('chikorita','cyndaquil').profile;
 p.roster.push({id:'P3',species:'pidgey',learned:[{move:'tackle',pp:3},{move:'gust',pp:3}],carry:['tackle','gust'],protected:false});
 p.next=4;p.team=['P1','P2','P3'];p.leader='P1';return p;
}
test('B8 a wipe on the boss floor: machines are lost and one unprotected partner draw is recorded',()=>{
 const p=profileOf3();
 const w=jumpToFloor(createExpedition('b8',9,3,squadOf(p),0),3);
 const bossAt=w.units.boss.pos,ids=w.queue;
 // the three members stand beside the boss with 1 HP each (the middle row of the 3x3 boss room is inside the room whatever its size)
 const spots=[{x:bossAt.x-1,y:bossAt.y},{x:bossAt.x+1,y:bossAt.y},{x:bossAt.x,y:bossAt.y-1}];
 ids.forEach((id,i)=>{w.units[id].pos=spots[i];w.units[id].hp=1;});
 w.goal=true;w.prog.exp=2;w.tms=[{move:'protect',source:'target',fate:'held'}];w.bag=1;w.prog.rng=7;w.seen=w.floor.map(key);
 // the boss attacks once per round (BOSS.attacks): with 1 HP each it fells one member per round, so the wipe takes three rounds
 let s=round(w,{type:'wait'});
 while(s.phase==='playing')s=round(s,{type:'wait'});
 assert.equal(s.phase,'ended');assert.equal(s.end.outcome,'wipe');
 assert.deepEqual(s.end.tms,[{move:'protect',source:'target',fate:'lost'}]);
 assert.deepEqual(s.end.lost,['C'],'P3 is the only unprotected member and the first draw of stream 7 is 0.0117 < 0.5');
 assert.equal(s.end.reward,100);assert.equal(s.end.boss,false);
 assert.equal(settleRun(p,s).account,100);
});

/* ---------- B9 reaching the lobby of floor 3 with the initial two members and an empty account ---------- */
async function walk(store){
 for(let n=0;n<2500;n++){
  const s=store.state;
  if(s.phase==='ended')return {s,reached:false};
  if(s.phase==='exit')return {s,reached:s.dungeon.level===3};
  if(s.phase==='invitation'){await store.dispatch({type:'invite',choice:'reject'});continue;}
  if(s.phase==='transit'){await store.dispatch({type:'finishTransit'});continue;}
  const L=s.units[s.leader],level=s.dungeon.level,want=level<3?'down':'exit';
  const target=s.points.find(p=>p.kind===want).pos;
  if(L.pos.x===target.x&&L.pos.y===target.y){await store.dispatch({type:'round',action:{type:'interact',exit:true}});continue;}
  // shortest path over the whole floor (units do not block the search)
  const cells=new Set(s.floor.map(key)),first=new Map([[key(L.pos),null]]),q=[L.pos];let step=null;
  for(let i=0;i<q.length&&!step;i++)for(const [dx,dy] of [[1,0],[0,1],[-1,0],[0,-1]]){const c={x:q[i].x+dx,y:q[i].y+dy};if(!cells.has(key(c))||first.has(key(c)))continue;
   first.set(key(c),first.get(key(q[i]))??c);q.push(c);if(c.x===target.x&&c.y===target.y){step=first.get(key(c));break;}}
  const occ=[...s.queue,...s.enemies].map(i=>s.units[i]).find(u=>u.hp>0&&u.pos&&u.pos.x===step.x&&u.pos.y===step.y);
  const cmd=!occ?{type:'move',to:step}:occ.side==='enemy'?{type:'basic',target:occ.id}:{type:'swap',target:occ.id};
  let r=await store.dispatch({type:'round',action:cmd});
  if(!r.ok)r=await store.dispatch({type:'round',action:{type:'wait'}});
  if(!r.ok)return {s,reached:false,error:r.error};
 }
 return {s:store.state,reached:false,error:'round cap'};
}
test('B9 with only the initial two members and an empty account, a departure reaches floor 3 and its lobby exit (fixed seed searched in advance)',async()=>{
 const port=memory(),store=new TrialStore(port,'x');
 const profile=newGameProfile('chikorita','cyndaquil').profile;assert.equal(profile.account,0);assert.equal(squadOf(profile).members.length,2);
 assert.equal(await store.beginNewGame(profile,false),true);
 assert.equal(await store.depart('b9',B9_SEED,0),true);
 assert.equal(store.state.dungeon.floors,3);assert.equal(store.state.dungeon.boss,true);assert.equal(store.state.queue.length,2);
 const r=await walk(store);
 assert.equal(r.reached,true,JSON.stringify(r.error)+r.s.log.slice(-3));
 assert.equal(r.s.dungeon.level,3);assert.equal(r.s.phase,'exit');
 const exit=r.s.points.find(p=>p.kind==='exit').pos;assert.deepEqual(r.s.units[r.s.request.actor].pos,exit);
 assert.equal(r.s.units.boss.hp,BOSS.hp,'the boss was never touched');
 const beforeWrites=port.writes();
 assert.equal((await store.dispatch({type:'finishExit'})).ok,true);assert.equal(store.state.end.boss,false);assert.equal(store.state.end.outcome,'normal');
 assert.equal(store.status,'ready');assert.equal(port.writes(),beforeWrites+1,'the first persistent write after departure is terminal settlement');
 assert.equal(store.envelope.format,2);assert.equal(Object.hasOwn(store.envelope,'current'),false);
});
const B9_SEED=1;

/* ---------- S: saves ---------- */
const load72=name=>readFileSync(new URL('./fixtures72/'+name,import.meta.url),'utf8');
const openRaw=raw=>{const port={raw,getItem:()=>port.raw,setItem:(k,v)=>{port.raw=v;}};return {port,store:new TrialStore(port,'k')};};
test('S1 a 7.2 in-progress World is discarded; the valid camp profile is migrated',async()=>{
 const raw=load72('save72-plain.json'),old=decodeLegacy(raw),{port,store}=openRaw(raw);
 assert.equal(old.current.dungeon.floors,2);assert.equal(old.current.round,3);assert.ok(old.current.enemies.every(id=>old.current.units[id].species in LEGACY_WILD));
 assert.equal(await store.whenReady,true,store.error);assert.equal(store.status,'ready',store.error);
 assert.equal(store.state,null);assert.equal(store.envelope.format,2);assert.equal(Object.hasOwn(store.envelope,'current'),false);
 const again=new TrialStore(port,'k');assert.equal(await again.whenReady,true);assert.equal(again.atBase,true);assert.deepEqual(again.profile,store.profile);
});
test('S2 a 7.2 in-progress shop World is discarded; no shop state enters the camp record',async()=>{
 const raw=load72('save72-shop.json'),old=decodeLegacy(raw),{port,store}=openRaw(raw);
 assert.deepEqual(old.current.shop,{level:1,stock:{berry:2,tonic:1,tm:'whirlwind'},trades:[]});
 assert.equal(await store.whenReady,true,store.error);assert.equal(store.state,null);assert.equal(store.envelope.format,2);
 assert.equal(Object.hasOwn(store.envelope,'recent'),false);assert.deepEqual(new TrialStore(port,'k').profile,store.profile);
});
const endedForLegacy=w=>{const s=structuredClone(w);if(s.phase!=='ended'){s.phase='ended';s.request=null;s.anchor=null;s.end=closeOut(s,'normal');}return s;};
function envelopeOf(w,profile=initialProfile(),extra={}){return {format:1,rules:'trial-rules-2',content:'trial-content-2',build:BUILD_ID,sequence:2,current:endedForLegacy(w),recent:null,profile,...extra};}
const accepted=w=>{const raw=JSON.stringify(envelopeOf(w));const e=decodeLegacy(raw);assert.ok(e.current);return raw;};
const rejects=(w,why)=>assert.throws(()=>decodeLegacy(JSON.stringify(envelopeOf(w))),/存档结构损坏|无法迁移/,why);
const fresh3=(seed=4)=>createExpedition('s3',seed,3,base(),0);
const floor3=(seed=4)=>jumpToFloor(fresh3(seed),3);
test('S3 tampering is rejected (each case first checked in its untouched form)',()=>{
 // the untouched forms load
 accepted(fresh3());accepted(floor3());accepted(jumpToFloor(fresh3(),2));accepted(createExpedition('s3',4,2,base(),0));
 // 1. an exit on floor 2
 {const w=jumpToFloor(fresh3(),2);w.points.push({pos:{...w.points.find(p=>p.kind==='down').pos},kind:'exit',used:false});rejects(w,'exit on floor 2');}
 // 2. a boss in a run without the boss mark
 {const w=createExpedition('s3',4,2,base(),0),src=floor3().units.boss;w.units.boss={...src,pos:{...w.floor[w.floor.length-1]}};w.enemies.push('boss');rejects(w,'boss without the mark');}
 // 3. two bosses
 {const w=floor3();const b=w.units.boss;const spare=w.floor.find(c=>!Object.values(w.units).some(u=>u.pos&&u.pos.x===c.x&&u.pos.y===c.y));w.units.boss2={...b,id:'boss2',pos:{...spare}};w.enemies.push('boss2');rejects(w,'two bosses');}
 // 4. boss numbers outside both legal sets: current (60 HP / 4) and the historical one (80 HP / 6). Above either maximum, and a mix of the two sets, are rejected; the historical set is still accepted.
 {const w=floor3();w.units.boss.maxHp=61;w.units.boss.hp=61;rejects(w,'boss HP above the current 60');}
 {const w=floor3();w.units.boss.maxHp=81;w.units.boss.hp=81;w.units.boss.damage=6;rejects(w,'boss HP above the historical 80');}
 {const w=floor3();w.units.boss.maxHp=81;w.units.boss.hp=81;rejects(w,'boss HP 81 with the current damage');}
 {const w=floor3();w.units.boss.maxHp=80;w.units.boss.hp=80;rejects(w,'historical HP with the current damage (mixed sets)');}
 {const w=floor3();w.units.boss.damage=6;rejects(w,'current HP with the historical damage (mixed sets)');}
 {const w=floor3();w.units.boss.maxHp=80;w.units.boss.hp=80;w.units.boss.damage=6;accepted(w);}
 // 5. a boss machine while the boss is alive
 {const w=floor3();w.tms=[{move:'protect',source:'boss',fate:'held'}];rejects(w,'boss machine without a defeat');}
 // 6. the end record's boss flag against the boss's final HP
 {let w=floor3();w.units[w.leader].pos={...w.points.find(p=>p.kind==='exit').pos};
  w=applyCommand(w,{type:'round',action:{type:'interact',exit:true}}).state;w=applyCommand(w,{type:'finishExit'}).state;
  assert.equal(w.phase,'ended');assert.equal(w.end.boss,false);accepted(w);
  const t=structuredClone(w);t.end.boss=true;rejects(t,'end.boss true with a living boss');
  const u=structuredClone(w);delete u.end.boss;rejects(u,'end.boss missing in a boss run');}
 // 7. the mark without base, without services, or with another floor count
 {const w=floor3();delete w.dungeon.services;rejects(w,'boss without services');}
 {const w=floor3();w.dungeon.floors=4;rejects(w,'boss with 4 floors');}
 {const w=fresh3();w.dungeon.floors=2;rejects(w,'boss with 2 floors');}
 // 8. the boss species on an ordinary enemy or a partner, and the mark on another species
 {const w=floor3();w.units.w3a.species='arcanine';rejects(w,'boss species on a wild enemy');}
 {const w=floor3();w.units.A.species='arcanine';rejects(w,'boss species on a partner');}
 {const w=floor3();w.units.boss.species='geodude';rejects(w,'boss mark on another species');}
 {const w=floor3();w.units.boss.recruit=friend('N',0,1,10,{tackle:1});rejects(w,'recruitable boss');}
 // Boss-as-recruit identity checks use expedition snapshots that can be valid historical saves.
 {const bossU=()=>structuredClone(floor3().units.boss);
  {const w=floor3();w.units.w3a.recruit={...bossU(),id:'N',pos:null};rejects(w,'boss as a recruit in a boss run');}
  {const w=createExpedition('s3',4,2,base(),0);w.units.w1a.recruit={...bossU(),id:'N',pos:null};rejects(w,'boss as a recruit in a 2 floor run');}
 }
 // a boss that is not the last enemy of its floor
 {const w=floor3();w.enemies=['boss',...w.enemies.filter(i=>i!=='boss')];rejects(w,'boss not last');}
});
test('S3b an old-format record still reads: a boss machine and boss fields are the only new things, so a 7.2 run with the new machines is not accepted',()=>{
 const w=createExpedition('s3b',4,2,base(),0);w.tms=[{move:'terablast',source:'target',fate:'held'}];w.bag=1;rejects(w,'new machine in a run without the mark');
 const v=floor3();v.tms=[{move:'terablast',source:'target',fate:'held'}];v.bag=1;accepted(v);
});
test('S4 a boss-marked run moves through transit, battle and exit in memory without persisting checkpoints',async()=>{
 const port=memory();let world=createExpedition('s4',4,3,squadOf(initialProfile()),0,undefined,3);
 const store={get state(){return world;},async dispatch(cmd){const r=applyCommand(world,cmd);if(r.ok)world=r.state;return r;}};
 const edit=fn=>fn(world);
 const check=label=>assert.equal(port.writes(),0,`${label}: no World checkpoint is written`);
 const send=async(cmd,label)=>{const r=await store.dispatch(cmd);assert.equal(r.ok,true,label+': '+r.error);check(label);};
 check('start');
 for(const level of [1,2]){
 const w=store.state,down=w.points.find(p=>p.kind==='down').pos;
  // stand the whole team next to the stairs by editing positions to free neighbouring cells, then cross for real
  edit(s=>{const cells=[down,...[[1,0],[0,1],[-1,0],[0,-1]].map(([dx,dy])=>({x:down.x+dx,y:down.y+dy}))].filter(c=>s.floor.some(f=>f.x===c.x&&f.y===c.y)&&!s.enemies.some(i=>s.units[i].hp>0&&s.units[i].pos.x===c.x&&s.units[i].pos.y===c.y));
   s.queue.forEach((id,i)=>{s.units[id].pos={...cells[i]};});s.leader=s.queue.find(id=>s.units[id].pos.x===down.x&&s.units[id].pos.y===down.y)??s.queue[0];s.units[s.leader].pos={...down};s.queue.filter(i=>i!==s.leader).forEach((id,i)=>{s.units[id].pos={...cells[i+1]};});
   s.seen=[...new Set([...s.seen,...cells.map(key)])].sort();});
  check('edited '+level);
  await send({type:'round',action:{type:'interact',exit:true}},'request '+level);assert.equal(store.state.phase,'transit');
  await send({type:'finishTransit'},'cross '+level);assert.equal(store.state.dungeon.level,level+1);
 }
 // floor 3: the boss falls to one blow, then the lobby exit
 edit(w=>{const b=w.units.boss;b.hp=1;const spots=[{x:b.pos.x-1,y:b.pos.y},{x:b.pos.x+1,y:b.pos.y},{x:b.pos.x,y:b.pos.y-1}];
  w.queue.forEach((id,i)=>{w.units[id].pos=spots[i];});w.leader=w.queue[0];w.seen=w.floor.map(key);});
 check('beside the boss');
 await send({type:'round',action:{type:'basic',target:'boss'}},'boss falls');
 assert.equal(store.state.units.boss.hp,0);assert.equal(store.state.tms.at(-1).source,'boss');assert.equal(store.state.tms.at(-1).fate,'held');assert.equal(store.state.prog.exp,3);
 // back to the lobby: put the team on the exit cell and its neighbour, then leave
 edit(w=>{const exit=w.points.find(p=>p.kind==='exit').pos,frees=[[0,1],[1,0],[-1,0],[0,-1]].map(([dx,dy])=>({x:exit.x+dx,y:exit.y+dy})).filter(c=>w.floor.some(f=>f.x===c.x&&f.y===c.y)&&!w.enemies.some(i=>w.units[i].hp>0&&w.units[i].pos.x===c.x&&w.units[i].pos.y===c.y));
  w.units[w.leader].pos={...exit};w.queue.filter(i=>i!==w.leader).forEach((id,i)=>{w.units[id].pos={...frees[i]};});});
 await send({type:'round',action:{type:'interact',exit:true}},'exit request');assert.equal(store.state.phase,'exit');
 await send({type:'finishExit'},'finish');assert.equal(store.state.phase,'ended');
 assert.equal(store.state.end.boss,true);assert.deepEqual(store.state.end.tms.at(-1),{move:store.state.tms.at(-1).move,source:'boss',fate:'brought'});assert.ok(store.state.end.reasons.includes('tm'));
 const settled=settleRun(initialProfile(),store.state);
 assert.equal(settled.vault[store.state.end.tms.at(-1).move]>=1,true,'the brought boss machine settles into the camp vault');
});

/* ---------- display ---------- */
test('boss info text names the species, HP, and the two refusals; log lines show the Chinese machine names',()=>{
 const s=arena({units:{A:A(3),B:B(2)}});
 const info=enemyInfo(s,'boss');
 assert.equal(info.name,'风速狗（首领）');assert.equal(info.hp,80);assert.equal(info.maxHp,80);assert.match(info.note,/不可招募、不会被吹飞/);
 assert.equal(localizeLog(s,'取得招式机：dragontail，mudslap，terablast，helpinghand'),'取得招式机：龙尾，掷泥，太晶爆发，帮助');
});
test('boss constants',()=>{assert.deepEqual(BOSS,{id:'boss',species:'arcanine',hp:60,damage:4,range:3,attacks:1});assert.equal(PROG.bossExp,2);});
