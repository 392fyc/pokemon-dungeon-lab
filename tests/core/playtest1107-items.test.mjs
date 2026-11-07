/* Playtest 1107: new items (orbs, Reviver Seed, berry formulas), drop and shop tables, and the 14 blessings, all through the real applyCommand. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {inferEvents} from '../../src/render/animation.ts';
import {applyCommand,BLESSINGS,ITEM_NAMES,PROG,buyProblem,speciesUnit,jumpToFloor} from '../../src/core/engine.ts';
import {FLOOR_ITEM_WEIGHTS} from '../../src/core/dungeon.ts';
import {ECON} from '../../src/core/economy.ts';
import rooms83 from '../../src/data/rooms-83.json' with {type:'json'};
import {friend,world,row,open,pos} from '../acceptance/fixtures.mjs';
import {foeOf,bossOf} from './foe-fixture.mjs';
import {sureHit} from './sure-hit.mjs';

const apply=(s,cmd)=>{const before=structuredClone(s),r=applyCommand(s,cmd);assert.deepEqual(s,before,'applyCommand must not mutate its input');assert.equal(r.ok,true,r.error);return r.state;};
const refuse=(s,cmd)=>{const before=structuredClone(s),r=applyCommand(s,cmd);assert.equal(r.ok,false,'expected a refusal');assert.deepEqual(s,before);return r.error;};
const act=(s,action)=>apply(s,{type:'round',action});
const use=(s,item,target='A')=>act(s,{type:'use',item,target});
const wait={type:'wait'};

/** A one-room run: friends A (leader, x=1), B (x=0) and C (x=12) on a row, waiting, so only A is next to an enemy placed at x=2; `extra` are enemy units. */
function scene({hp=100,floor=row(12),extra=[],queue=['A','B','C'],rooms=[{x:0,y:0,w:8,h:3}]}={}){
 const units={A:friend('A',1,1,hp,{tackle:20},hp),B:friend('B',0,1,hp,{tackle:20},hp),C:friend('C',12,1,hp,{tackle:20},hp)};
 for(const u of Object.values(units)){u.tactic='wait';u.species='mudkip';u.entrySpecies='mudkip';u.level=5;}
 for(const e of extra)units[e.id]=e;
 const s=world(units,{floor,leader:'A',queue,enemies:extra.map(e=>e.id),points:[{pos:pos(11),kind:'down',used:false}]});
 s.dungeon={seed:5,width:36,height:24,floors:3,level:1,stored:{},boss:true,roguelike:true,tmPool:3};
 s.difficulty='normal';s.rooms=rooms;s.enemyAiRng=1;
 s.prog={level:5,exp:0,rng:5,made:0,kills:[],items:{berry:0,tonic:0,bigBerry:0,teamTonic:0}};
 s.purse=100;s.tms=[];
 return sureHit(s);
}
const dummy=(id,x,y,hp=200,species='pidgey')=>{const e=foeOf(id,species,x,y,hp);e.waitOnly=true;return e;};

test('Orange Berry heals 30% of max HP (at least 8); the berry blessing adds 50% on top; cure berries heal 4 and the Chesto Berry does not',()=>{
 let s=scene();s.prog.items.berry=1;s.units.A.hp=10;s=use(s,'berry');assert.equal(s.units.A.hp,40);
 let small=scene({hp:20});small.prog.items.berry=1;small.units.A.hp=5;small=use(small,'berry');assert.equal(small.units.A.hp,13,'30% of 20 is 6, so the old flat 8 applies');
 let boosted=scene();boosted.blessings=['berryBoost'];boosted.prog.items.berry=1;boosted.units.A.hp=10;boosted=use(boosted,'berry');assert.equal(boosted.units.A.hp,55,'30 x 1.5 = 45');
 for(const [item,status] of [['pechaBerry','psn'],['rawstBerry','brn'],['cheriBerry','par']]){
  let c=scene();c.prog.items[item]=1;c.units.A.hp=50;c.units.A.status={[status]:{tick:1,left:3}};c=use(c,item);
  assert.equal(c.units.A.status?.[status],undefined,item+' cures');assert.equal(c.units.A.hp,54,item+' also heals 4');
 }
 let chesto=scene();chesto.prog.items.chestoBerry=1;chesto.units.A.hp=50;chesto.units.A.status={slp:{left:3}};chesto=use(chesto,'chestoBerry');assert.equal(chesto.units.A.hp,50);
});

test('Sleep and Totter Orbs affect every enemy in the user room, not the ones outside it, and need the user as target',()=>{
 for(const [orb,status] of [['slumberOrb','slp'],['totterOrb','confusion']]){
  let s=scene({extra:[dummy('E1',4,1),dummy('E2',7,1),dummy('E3',10,1)]});s.prog.items[orb]=1;
  assert.match(refuse(s,{type:'round',action:{type:'use',item:orb,target:'B'}}),/使用者自己/);
  s=use(s,orb);
  assert.ok(s.units.E1.status?.[status]&&s.units.E2.status?.[status],orb+' reaches both enemies in the room');
  assert.equal(s.units.E3.status?.[status],undefined,'the enemy outside the room is untouched');
  assert.equal(s.prog.items[orb],0,'one action, one orb');
 }
 let none=scene({extra:[dummy('E3',10,1)]});none.prog.items.slumberOrb=1;
 assert.match(refuse(none,{type:'round',action:{type:'use',item:'slumberOrb',target:'A'}}),/没有.*敌人|不会有效果/);
 let corridor=scene({extra:[dummy('E4',3,1),dummy('E5',9,1)],rooms:[]});corridor.prog.items.slumberOrb=1;corridor=use(corridor,'slumberOrb');
 assert.ok(corridor.units.E4.status?.slp,'corridor: 2 cells around the user');assert.equal(corridor.units.E5.status?.slp,undefined);
});

test('Luminous Orb shows the terrain but never an enemy; Roll Call Orb brings the team next to the user',()=>{
 let s=scene({extra:[dummy('E1',9,1)]});s.seen=['0,1','1,1','2,1'];s.prog.items.luminousOrb=1;
 s=use(s,'luminousOrb');assert.equal(s.mapRevealed,true);assert.ok(!s.seen.includes('9,1'),'the enemy cell is still unseen, so the enemy stays hidden');
 s.prog.items.luminousOrb=1;assert.match(refuse(s,{type:'round',action:{type:'use',item:'luminousOrb',target:'A'}}),/已经显现/);
 const f=open(8);let r=scene({floor:f,rooms:[{x:1,y:1,w:8,h:8}]});
 r.units.A.pos=pos(2,2);r.units.B.pos=pos(7,7);r.units.C.pos=pos(8,8);r.units.A.tactic=r.units.B.tactic=r.units.C.tactic='wait';r.prog.items.rollcallOrb=1;
 r=use(r,'rollcallOrb');const near=id=>Math.max(Math.abs(r.units[id].pos.x-2),Math.abs(r.units[id].pos.y-2))===1;
 assert.ok(near('B')&&near('C'),'both allies stand next to the user');assert.notDeepEqual(r.units.B.pos,r.units.C.pos);
 let tight=scene({floor:[pos(1),pos(2),pos(3),pos(9)],rooms:[{x:0,y:0,w:10,h:3}]});tight.units.B.pos=pos(9);tight.units.C.pos=pos(2);tight.prog.items.rollcallOrb=1;
 tight=use(tight,'rollcallOrb');assert.deepEqual(tight.units.B.pos,pos(9),'with no free cell next to the user, an ally stays where it was');
});

test('Reviver Seed is spent automatically when a member falls, brings it back at 50% HP in place, and cannot be used by hand',()=>{
 const foe=foeOf('E','geodude',2,1,300,{tackle:30});
 let s=scene({extra:[foe]});s.units.A.hp=1;s.units.A.maxHp=40;s.prog.items.reviverSeed=1;
 assert.match(refuse(s,{type:'round',action:{type:'use',item:'reviverSeed',target:'A'}}),/不能主动使用/);
 const before=s;s=act(s,wait);
 // the animation shows the blow but not a fall: the member is not removed from the map and no hit is marked dead
 const events=inferEvents(before,s,{type:'round',action:wait}),hitsOnA=events.filter(e=>e.k==='hit'&&e.target==='A');
 assert.ok(hitsOnA.length>=1&&hitsOnA.every(e=>!e.dead),'the revived member is not shown as fallen');
 assert.equal(s.prog.items.reviverSeed,0,'the seed was consumed');assert.equal(s.units.A.hp,20,'half of 40');assert.deepEqual(s.units.A.pos,pos(1),'it stands where it fell');
 assert.ok(s.queue.includes('A')&&s.phase!=='ended');
 // Two members fall in the same enemy phase with one seed: exactly one is saved, the other stays down.
 let two=scene({extra:[foeOf('E1','geodude',2,1,300,{tackle:30}),foeOf('E2','geodude',9,1,300,{tackle:30})]});
 two.units.A.hp=1;two.units.A.maxHp=40;two.units.B.pos=pos(8);two.units.B.hp=1;two.units.B.maxHp=40;two.prog.items.reviverSeed=1;
 two=act(two,wait);assert.equal(two.prog.items.reviverSeed,0);
 const standing=['A','B'].filter(id=>two.units[id].hp>0&&two.units[id].pos);
 assert.equal(standing.length,1,'one seed saves exactly one of the two fallen members');
 assert.equal(two.units[standing[0]].hp,20);
});

test('damage blessings: Nemesis +10% on afflicted enemies, Headhunter +15% on the boss, Full Power +8% above 80% HP',()=>{
 const hitOf=(blessings,target,mutate=s=>s,attackerHp)=>{
  let s=scene({extra:[target]});s.blessings=blessings;if(attackerHp)s.units.A.hp=attackerHp;mutate(s);
  const before=s.units[target.id].hp;s=act(s,{type:'skill',skill:'tackle',target:target.id});return before-s.units[target.id].hp;
 };
 const near=()=>dummy('E',2,1,500);
 const base=hitOf([],near());assert.ok(base>=9);
 const afflicted=s=>{s.units.E.status={confusion:{left:3}};};
 assert.equal(hitOf([],near(),afflicted),base,'without the blessing nothing changes');
 assert.equal(hitOf(['nemesis'],near(),afflicted),Math.round(base*1.1));
 assert.equal(hitOf(['nemesis'],near()),base,'a clean enemy is not boosted');
 const boss=()=>{const b=bossOf('E',2,1,900);b.waitOnly=true;return b;};
 const bossBase=hitOf([],boss());assert.equal(hitOf(['headhunter'],boss()),Math.round(bossBase*1.15));assert.equal(hitOf(['headhunter'],near()),base);
 assert.equal(hitOf(['fullpower'],near(),undefined,100),Math.round(base*1.08));
 assert.equal(hitOf(['fullpower'],near(),undefined,70),base,'below 80% HP there is no bonus');
});

test('Scholar +15% experience, Kill Heal 8%, Regen every 10 rounds, Thick Skin and Last Stand once per floor',()=>{
 const kill=blessings=>{let s=scene({extra:[dummy('E',2,1,1)]});s.blessings=blessings;s.units.A.hp=50;s.prog.exp=-5000;return act(s,{type:'skill',skill:'tackle',target:'E'});};
 const plain=kill([]),scholar=kill(['scholar']);const gain=x=>x.prog.exp+5000;assert.ok(gain(plain)>0);assert.equal(gain(scholar),Math.round(gain(plain)*1.15));
 const heal=kill(['killheal']);assert.equal(heal.units.A.hp-plain.units.A.hp,8,'8% of 100');
 let r=scene();r.blessings=['regen'];r.units.A.hp=50;r.units.B.hp=99;r.round=8;r=act(r,wait);assert.equal(r.units.A.hp,50,'round 9: nothing yet');r=act(r,wait);
 assert.equal(r.round,10);assert.equal(r.units.A.hp,55,'5% of 100 at round 10');assert.equal(r.units.B.hp,100);
 const foe=()=>foeOf('E','geodude',2,1,500,{tackle:30});
 let plainHit=scene({extra:[foe()]});const before=plainHit.units.A.hp;plainHit=act(plainHit,wait);const full=before-plainHit.units.A.hp;assert.ok(full>=2,'the fixture enemy hurts');
 let thick=scene({extra:[foe()]});thick.blessings=['thickskin'];thick=act(thick,wait);
 assert.equal(100-thick.units.A.hp,Math.max(1,Math.floor(full/2)),'first hit halved');assert.equal(thick.units.A.thickUsed,true);
 const afterFirst=thick.units.A.hp;thick=act(thick,wait);assert.equal(afterFirst-thick.units.A.hp,full,'second hit in the same floor is full');
 let stand=scene({extra:[foe()]});stand.blessings=['laststand'];stand.units.A.hp=36;stand=act(stand,wait);
 assert.equal(stand.units.A.standUsed,true);assert.ok(stand.units.A.hp>=36-full+25-1,'below 35% it heals 25% of max HP once');
 const hpNow=stand.units.A.hp;stand=act(stand,wait);assert.equal(hpNow-stand.units.A.hp<=full,true,'no second heal');
});

test('Floor Heal is 20% of max HP (at least 4) per new floor; the once-per-floor flags reset; Lullaby persists',()=>{
 let s=scene();s.blessings=['floorHeal','thickskin'];s.units.A.hp=50;s.units.B.hp=99;s.units.A.thickUsed=true;
 s.units.A.pos=pos(11);s=act(s,{type:'interact',exit:true});assert.equal(s.phase,'transit');s=apply(s,{type:'finishTransit'});
 assert.equal(s.units.A.hp,70);assert.equal(s.units.B.hp,100);assert.equal(s.units.A.thickUsed,undefined,'thick skin works again on the new floor');
 let weak=scene({hp:10});weak.blessings=['floorHeal'];weak.units.A.hp=1;weak.units.A.pos=pos(11);weak=act(weak,{type:'interact',exit:true});weak=apply(weak,{type:'finishTransit'});
 assert.equal(weak.units.A.hp,5,'20% of 10 is 2, the minimum 4 applies');
 let lull=scene();lull.blessings=['lullaby'];lull.units.A.pos=pos(11);lull=act(lull,{type:'interact',exit:true});lull=apply(lull,{type:'finishTransit'});
 assert.ok(lull.log.some(l=>l.includes('安眠')),'the persistent effect is announced on a freshly generated floor');
});

test('Select-TM blessing opens the three-choice panel at once; all 14 blessings exist with floors; Floor Heal and Lullaby only on floors 1 and 2',()=>{
 const ids=Object.keys(BLESSINGS);assert.equal(ids.length,14);
 for(const id of ['nemesis','headhunter','fullpower','scholar','killheal','regen','thickskin','laststand'])assert.ok(BLESSINGS[id].name&&BLESSINGS[id].description,id);
 assert.deepEqual(BLESSINGS.floorHeal.floors,[1,2]);assert.deepEqual(BLESSINGS.lullaby.floors,[1,2]);assert.deepEqual(BLESSINGS.tmChoice.floors,[1,2,3]);
 let s=scene();s.phase='blessing';s.pendingChoices=[{type:'blessing',source:'challenge',room:null,options:['tmChoice','scholar','regen']}];
 const r=apply(s,{type:'blessingChoice',blessing:'tmChoice'});assert.equal(r.phase,'tmChoice');assert.equal(r.pendingChoices[0].options.length,3);
 const picked=r.pendingChoices[0].options[0],done=apply(r,{type:'tmChoice',move:picked});assert.ok(done.tms.some(t=>t.move===picked));assert.equal(done.phase,'playing');
 let owned=scene();owned.phase='blessing';owned.blessings=['scholar'];owned.pendingChoices=[{type:'blessing',source:'challenge',room:null,options:['scholar','regen','killheal']}];
 assert.match(refuse(owned,{type:'blessingChoice',blessing:'scholar'}),/已经拥有/);
});

test('drop, room-item, challenge-item and shop tables follow the playtest values',()=>{
 const floor=Object.fromEntries(FLOOR_ITEM_WEIGHTS);
 assert.deepEqual(floor,{berry:35,healSeed:13,pechaBerry:8,rawstBerry:8,cheriBerry:8,chestoBerry:8,slumberOrb:5,totterOrb:5,luminousOrb:5,rollcallOrb:5});
 assert.equal(Object.values(floor).reduce((a,n)=>a+n,0),100);
 const room=rooms83.roomItemWeights;assert.deepEqual([room.bigBerry,room.teamTonic,room.violentSeed,room.maxElixir,room.reviverSeed],[30,25,15,10,10]);
 assert.equal(room.slumberOrb+room.totterOrb+room.luminousOrb+room.rollcallOrb,10);assert.equal(Object.values(room).reduce((a,n)=>a+n,0),100);
 for(const k of ['slumberOrb','totterOrb','luminousOrb','rollcallOrb','reviverSeed'])assert.ok(rooms83.itemWeights[k]>0,'challenge rewards include '+k);
 assert.deepEqual([ECON.price.slumberOrb,ECON.price.totterOrb,ECON.price.luminousOrb,ECON.price.rollcallOrb,ECON.price.reviverSeed],[60,60,60,60,80]);
 let s=scene();s.points=[{pos:pos(1),kind:'shop',used:false}];s.shop={level:1,stock:{berry:2,tonic:1,tm:null,slumberOrb:1,reviverSeed:1},trades:[]};
 assert.equal(buyProblem(s,'reviverSeed'),null);const bought=apply(s,{type:'buy',item:'reviverSeed'});
 assert.equal(bought.prog.items.reviverSeed,1);assert.equal(bought.purse,20);assert.match(buyProblem(bought,'slumberOrb')??'', /钱袋不足/);
 assert.equal(ITEM_NAMES.reviverSeed,'复活种子');assert.ok(PROG.berryHeal===8);
});

test('every new pickup kind can be picked up from the floor and enters the backpack',()=>{
 for(const kind of ['slumberOrb','totterOrb','luminousOrb','rollcallOrb']){
  let s=scene();s.points=[{pos:pos(2),kind,used:false}];s.units.A.pos=pos(1);
  s=act(s,{type:'move',to:pos(2)});assert.equal(s.prog.items[kind],1,kind);assert.ok(s.points[0].used);
 }
});

/* ---- PR 214 review: B4 actual damage, B5 kill heal sources, orb refusals ---- */
test('B4 a last-stand heal does not hide the hit: a sleeping member still gets the wake-up check and the drain still heals the attacker',()=>{
 const attackOf=blessings=>{
  const foe=foeOf('E','geodude',2,1,300,{tackle:30,snore:5});
  let s=scene({extra:[foe]});s.blessings=blessings;s.units.A.hp=36;s.units.A.status={slp:{left:6}};s.units.A.learned=['tackle','snore'];s.units.A.pp={tackle:20,snore:5};s.units.A.maxPp={tackle:20,snore:5};
  return act(s,wait);
 };
 const plain=attackOf([]),stand=attackOf(['laststand']);
 const reacted=s=>s.log.some(l=>/被攻击后醒来|使用打鼾/.test(l));
 assert.ok(reacted(plain),'baseline: the sleeper reacts to the hit');
 assert.ok(stand.units.A.standUsed&&reacted(stand),'with Last Stand the sleeper still reacts (the heal must not cancel the damage)');
 const drainFoe=blessings=>{
  const foe=foeOf('E','oddish',2,1,40,{absorb:5});foe.hp=10;
  let s=scene({extra:[foe]});s.blessings=blessings;s.units.A.hp=36;return act(s,wait);
 };
 assert.ok(drainFoe([]).units.E.hp>10,'baseline: absorb heals the attacker');
 assert.ok(drainFoe(['laststand']).units.E.hp>10,'absorb heals by the damage actually dealt even when Last Stand heals the target afterwards');
});

test('B4 a Reviver Seed does not erase the damage: the drain attacker heals by the damage that downed the member',()=>{
 const foe=foeOf('E','oddish',2,1,40,{absorb:5});foe.hp=10;
 let s=scene({extra:[foe]});s.units.A.hp=1;s.units.A.maxHp=40;s.prog.items.reviverSeed=1;s=act(s,wait);
 assert.equal(s.prog.items.reviverSeed,0);assert.ok(s.units.E.hp>10,'the attacker still drained');
});

test('B5 Kill Heal also counts a counter-attack kill and a blow-away collision kill, healing the unit that defeated the enemy',()=>{
 const countered=blessings=>{
  const foe=foeOf('E','geodude',2,1,1,{tackle:30});let s=scene({extra:[foe]});s.blessings=blessings;s.prog.exp=-5000;
  s.units.A.hp=50;s.units.A.counter=3;return act(s,wait);
 };
 const base=countered([]),healed=countered(['killheal']);
 assert.equal(base.units.E.hp,0,'the counter killed the enemy');assert.equal(healed.units.A.hp-base.units.A.hp,8);
 const pushed=(blessings,enemyHp)=>{
  const foe=dummy('E',6,1,enemyHp);let s=scene({extra:[foe]});s.blessings=blessings;s.prog.exp=-5000;
  s.units.A.pos=pos(5);s.units.A.learned=['dragontail'];s.units.A.pp={dragontail:5};s.units.A.maxPp={dragontail:5};s.units.A.hp=50;s.units.B.pos=pos(0);s.units.C.pos=pos(2);
  s.floor=row(12);s.rooms=[{x:0,y:0,w:13,h:3}];
  return act(s,{type:'skill',skill:'dragontail',target:'E'});
 };
 const big=pushed([],500),lost=500-big.units.E.hp;
 assert.ok(lost>5,'the move hits and the push collides (loss '+lost+')');
 const attackPart=lost-5,low=pushed([],attackPart+3),lowHeal=pushed(['killheal'],attackPart+3);
 assert.equal(low.units.E.hp,0,'the collision finished the enemy');assert.equal(lowHeal.units.A.hp-low.units.A.hp,8);
});

test('orbs are refused, and not spent, when they would do nothing',()=>{
 let adjacent=scene({floor:open(8),rooms:[{x:1,y:1,w:8,h:8}]});adjacent.units.A.pos=pos(4,4);adjacent.units.B.pos=pos(5,4);adjacent.units.C.pos=pos(3,4);adjacent.prog.items.rollcallOrb=1;
 assert.match(refuse(adjacent,{type:'round',action:{type:'use',item:'rollcallOrb',target:'A'}}),/已在身边/);
 let asleep=scene({extra:[dummy('E1',4,1)]});asleep.units.E1.status={slp:{left:4}};asleep.prog.items.slumberOrb=1;
 assert.match(refuse(asleep,{type:'round',action:{type:'use',item:'slumberOrb',target:'A'}}),/没有|不会有效果/);
 let confused=scene({extra:[dummy('E1',4,1)]});confused.units.E1.status={confusion:{left:4}};confused.prog.items.totterOrb=1;
 assert.match(refuse(confused,{type:'round',action:{type:'use',item:'totterOrb',target:'A'}}),/没有|不会有效果/);
 let ok=scene({extra:[dummy('E1',4,1),dummy('E2',5,1)]});ok.units.E1.status={slp:{left:4}};ok.prog.items.slumberOrb=1;ok=use(ok,'slumberOrb');
 assert.ok(ok.units.E2.status?.slp,'one effective enemy is enough to use the orb');
});
