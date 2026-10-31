/* Stage 7.8 behaviour tests for https://github.com/392fyc/pokemon-dungeon-lab/blob/d03ef5144f5671b3b8d5418b94353223742e911a/docs/04-%E8%A7%84%E6%A0%BC/%E6%95%8C%E6%88%91%E5%AF%B9%E7%AD%89%E6%8B%9B%E5%BC%8F%E4%B8%8E%E5%BC%BA%E5%8C%96%E6%A8%A1%E5%9E%8B%E8%A7%84%E6%A0%BC.md: section 3 (relative sides), section 4 (shared move choice),
   section 11.6 (six tactics) and section 12.3 (sight, sleep, chase memory, roaming).
   Every expected value is a literal worked out by hand from the move table (src/data/pmd-moves.json power) and the damage rule
   "6 + ceil(power/2) + floor(max(0, level-5)/4), minus the target's defence stage": tackle(6)=9, scratch(6)=9, ember(7)=10, absorb(1)=7,
   quickattack(4)=8, dragontail(3)=8, flamethrower(18)=15, basic attack=6. Units are Lv5, so the level bonus is 0.
   Damage dealt BY an enemy is then multiplied by the confirmed 0.4 difficulty (round, at least 1): 9->4, 10->4, 8->3, 15->6, 11->4; damage dealt by the player is not. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {speciesUnit,applyCommand,traceRound,currentlyVisible} from '../../src/core/engine.ts';
import {generateFloor} from '../../src/core/dungeon.ts';
import {world,row,open,pos} from '../acceptance/fixtures.mjs';
import {foeOf,bossOf} from './foe-fixture.mjs';

const wait={type:'wait'};
/** A friendly roster unit with an explicit HP and kit ({move:pp}); `tactic` is its battle policy. */
const mate=(id,x,y,{species='bulbasaur',hp=40,maxHp=hp,moves={tackle:5},tactic='together'}={})=>{
 const u=speciesUnit(id,species,5,{x,y});u.hp=hp;u.maxHp=maxHp;u.learned=Object.keys(moves);u.pp={...moves};u.maxPp={...moves};u.tactic=tactic;return u;
};
/** Mark a geometric unit as species-less so non-stat behavior tests use the specified 1:1 ratio. */
const withoutSpecies=u=>{delete u.species;delete u.entrySpecies;return u;};
/** An enemy that only waits (a harmless target); every other enemy acts by the shared move choice. */
const dummy=(id,x,y,hp=40,species='geodude')=>{const e=foeOf(id,species,x,y,hp);e.waitOnly=true;return e;};
/** Builds a world from friend and enemy units; `rooms` makes the area a room (whole room visible), otherwise it is a corridor (2-step sight). */
function W(units,{floor=row(12),leader='A',rooms,aiRng=12345}={}){
 const list=Object.values(units);
 const s=world(units,{floor,leader,queue:list.filter(u=>u.side==='friend').map(u=>u.id),enemies:list.filter(u=>u.side==='enemy').map(u=>u.id)});
 if(rooms)s.rooms=rooms;s.enemyAiRng=aiRng;return s;
}
const bigRoom=[{x:0,y:1,w:13,h:1}];
const round=(s,action=wait,override)=>{
 const before=structuredClone(s),r=applyCommand(s,{type:'round',action,...(override?{override}:{})});
 assert.deepEqual(s,before,'applyCommand mutated its input');assert.equal(r.ok,true,r.error);return r.state;
};
const actionOf=(s,id)=>traceRound(s,{type:'round',action:wait}).find(t=>t.id===id).action;
const sorted=a=>[...a].sort();

/* ====================================================================== section 3: relative sides */

test('3.a an enemy guards against the player: protect covers the next three player action phases, then lapses',()=>{
 // E has only one protect; A (adjacent, with tackle) can hit it, so E counts as threatened and guards at the end of round 1.
 // (E also basic-attacks A every round; that is not what this test is about.)
 let s=round(W({A:withoutSpecies(mate('A',3,1,{moves:{tackle:6}})),E:foeOf('E','geodude',4,1,40,{protect:1})}));   // round 1: A waits, E guards
 assert.equal(s.units.E.protect,3);
 const seen=[];
 for(let i=0;i<3;i++){seen.push(s.units.E.protect);const before=s.units.E.hp;s=round(s,{type:'skill',skill:'tackle',target:'E'});assert.equal(s.units.E.hp,before,'attack '+(i+1)+' is blocked');}
 assert.deepEqual(seen,[3,2,1],'one guard cast covers three player action phases');
 assert.equal(s.units.E.protect,0);
 s=round(s,{type:'skill',skill:'tackle',target:'E'});
 assert.equal(s.units.E.hp,31,'E has no PP for a second guard, so the fourth attack lands: tackle 6 -> 9 damage');
});
test('3.a reverse: a player guard blocks an enemy attack in the same way',()=>{
 const s0=W({A:mate('A',3,1,{moves:{protect:2}}),E:foeOf('E','geodude',4,1,40,{tackle:5})});
 const s=round(s0,{type:'skill',skill:'protect',target:'A'});
 assert.equal(s.units.A.hp,40,'E found nothing to gain from attacking a guarded A, and A took no damage');
 assert.equal(s.units.E.pp.tackle,5,'E did not waste a tackle on a guarded target');
});

test('3.b a countering enemy reflects a player melee hit, of either category; a ranged hit is not reflected',()=>{
 // counter state is set directly (no move in the roster list makes the AI choose it)
 const base=()=>{const s=W({A:withoutSpecies(mate('A',3,1,{moves:{tackle:5,ember:5,quickattack:5}})),E:dummy('E',4,1,40)});s.units.E.counter=3;return s;};
 let s=round(base(),{type:'basic',target:'E'});                 // physical basic 6
 assert.deepEqual([s.units.E.hp,s.units.A.hp],[34,34],'basic attack: E loses 6 and A takes the same 6 back');
 s=round(base(),{type:'skill',skill:'ember',target:'E'});       // special move 10: counter is not limited to physical
 assert.deepEqual([s.units.E.hp,s.units.A.hp],[30,30]);
 const far=base();far.units.A.pos=pos(2);
 s=round(far,{type:'skill',skill:'quickattack',target:'E'});    // two cells away: 8 damage, no reflection
 assert.deepEqual([s.units.E.hp,s.units.A.hp],[32,40]);
});
test('3.b reverse: a countering player reflects an enemy melee hit',()=>{
 const s0=W({A:withoutSpecies(mate('A',3,1,{moves:{tackle:5}})),E:foeOf('E','geodude',4,1,40,{tackle:5})});
 s0.units.A.counter=3;
 const s=round(s0);                                    // A waits; E tackles A for round(9 x 0.4) = 4 and takes 4 back
 assert.deepEqual([s.units.A.hp,s.units.E.hp],[36,36]);
});

test('3.c an enemy helps another enemy: helping hand raises that enemy\'s attack stage and its next hit; it never targets the player',()=>{
 // E1 only knows helpinghand, E2 tackles A. Both stand in the same room. E1 acts first, E2's tackle becomes round(9 x 0.4) = 4, then its +1 attack stage raises the hit to 5.
 const s0=W({A:withoutSpecies(mate('A',3,1,{moves:{tackle:5}})),E1:foeOf('E1','geodude',6,1,40,{helpinghand:3}),E2:foeOf('E2','geodude',4,1,40,{tackle:5})},{rooms:bigRoom});
 const s=round(s0);
 assert.equal(s.units.E2.stages.atk,1);assert.equal(s.units.A.stages.atk,0);
 assert.equal(s.units.A.hp,35,'A takes the boosted 5 (round(tackle 9 x 0.4) = 4, +1 attack stage)');
 // the stage is capped at +2 for the choice: with E2 already at +2 there is nothing to help
 const capped=W({A:withoutSpecies(mate('A',3,1,{moves:{tackle:5}})),E1:foeOf('E1','geodude',6,1,40,{helpinghand:3}),E2:foeOf('E2','geodude',4,1,40,{tackle:5})},{rooms:bigRoom});
 capped.units.E2.stages.atk=2;
 assert.equal(round(capped).units.E1.pp.helpinghand,3,'E1 did not cast: E2 is already at +2');
});
test('3.c reverse: a player helping hand raises a friend only, never an enemy in the same room',()=>{
 const s0=W({A:mate('A',2,1,{moves:{helpinghand:3}}),B:mate('B',3,1),E:dummy('E',9,1)},{rooms:bigRoom});
 const s=round(s0,{type:'skill',skill:'helpinghand',target:'A'});   // a room move names its user as the target; the effect reaches room mates
 assert.equal(s.units.B.stages.atk,1);
 assert.equal(s.units.E.stages.atk,0,'the enemy in the same room is not a teammate and gets nothing');
});

test('3.d quick guard blocks an enemy front2, line10 and room move from a distance, but not a melee hit; it lasts one enemy phase',()=>{
 const attackers=[['quickattack',{x:2,y:1},3],['flamethrower',{x:6,y:1},6],['earthpower',{x:6,y:1},4]];  // base 8, 15, 11 times 0.4 -> round(3.2), 6, round(4.4)
 for(const [move,at,damage] of attackers){
  const mk=()=>W({A:withoutSpecies(mate('A',0,1,{moves:{quickguard:3}})),E:foeOf('E','geodude',at.x,at.y,40,{[move]:5})},{rooms:bigRoom});
  const open_=round(mk());
  assert.equal(open_.units.A.hp,40-damage,move+' hits an unguarded A');
  const guarded=round(mk(),{type:'skill',skill:'quickguard',target:'A'});
  assert.equal(guarded.units.A.hp,40,move+' is blocked by the quick guard');
  assert.equal(guarded.units.E.pp[move],5,move+': E did not spend PP on a blocked hit');
 }
 const melee=round(W({A:withoutSpecies(mate('A',0,1,{moves:{quickguard:3}})),E:foeOf('E','geodude',1,1,40,{tackle:5})},{rooms:bigRoom}),{type:'skill',skill:'quickguard',target:'A'});
 assert.equal(melee.units.A.hp,36,'an adjacent tackle deals round(9 x 0.4) = 4; quick guard does not stop it');
});
test('3.d reverse: an enemy quick guard blocks the player\'s front2, line10 and room moves, and not a melee hit',()=>{
 for(const [move,from,kit] of [['quickattack',2,{quickattack:5}],['flamethrower',6,{flamethrower:5}],['earthpower',6,{earthpower:5}]]){
  const s0=W({A:withoutSpecies(mate('A',from,1,{moves:kit})),E:dummy('E',0,1)},{rooms:bigRoom});
  s0.quickguard={owner:'enemy',units:['E']};            // the guard an enemy cast in the previous enemy phase
  const s=round(s0,{type:'skill',skill:move,target:move==='earthpower'?'A':'E'});
  assert.equal(s.units.E.hp,40,move+' is blocked');
 }
 const melee=W({A:withoutSpecies(mate('A',1,1,{moves:{tackle:5}})),E:dummy('E',0,1)},{rooms:bigRoom});melee.quickguard={owner:'enemy',units:['E']};
 assert.equal(round(melee,{type:'skill',skill:'tackle',target:'E'}).units.E.hp,31);
});
test('3.d an enemy casts quick guard when a player can hit it from a distance (section 4 step 3)',()=>{
 // E has only quickguard; A stands two cells away with quickattack (a front2 move), so E counts as threatened at range.
 const s=round(W({A:mate('A',2,1,{moves:{quickattack:5}}),E:foeOf('E','geodude',0,1,40,{quickguard:3})},{rooms:bigRoom}));
 assert.equal(s.units.E.pp.quickguard,2);
 assert.deepEqual(s.quickguard,{owner:'enemy',units:['E']});
});

/* ====================================================================== section 4: shared move choice */
/* X is a non-leader friend with the full "gofoes" policy, so its choice is exactly steps 1-5 of the shared algorithm; traceRound shows the choice. */
const X=(moves,extra={})=>mate('X',5,1,{moves,tactic:'gofoes',...extra});
const L=()=>mate('A',0,1,{moves:{tackle:5}});
const skillOf=a=>a.type==='skill'?[a.skill,a.target]:[a.type,a.target];

test('4.1 the highest estimated damage wins; ties go to more PP, then move order, then the nearer target, then queue order',()=>{
 const adj=(moves)=>W({A:L(),X:X(moves),F:dummy('F',6,1)},{rooms:bigRoom});
 assert.deepEqual(skillOf(actionOf(adj({tackle:3,ember:3}),'X')),['ember','F'],'Bulbasaur versus Geodude: Ember is 13 after the capped 1.25 ratio; tackle is 7 after the 0.8 floor');
 assert.deepEqual(skillOf(actionOf(adj({scratch:2,tackle:4}),'X')),['tackle','F'],'the 0.8 ratio gives both 7 damage; tackle has more PP');
 assert.deepEqual(skillOf(actionOf(adj({scratch:3,tackle:3}),'X')),['scratch','F'],'equal damage and PP: the first learned move');
 // nearer target: quickattack reaches F1 two cells right and F2 one cell left; both are Geodude and take 6 after the 0.8 ratio
 const near=W({A:mate('A',0,1,{moves:{tackle:5}}),X:X({quickattack:3},{}),F1:dummy('F1',7,1),F2:dummy('F2',4,1)},{rooms:bigRoom});
 assert.deepEqual(skillOf(actionOf(near,'X')),['quickattack','F2'],'the target at distance 1 beats the one at distance 2');
 // equal distance: queue order (enemy list order F1 before F2)
 const both=W({A:mate('A',0,1,{moves:{tackle:5}}),X:X({tackle:3}),F1:dummy('F1',6,1),F2:dummy('F2',4,1)},{rooms:bigRoom});
 assert.deepEqual(skillOf(actionOf(both,'X')),['tackle','F1']);
});
test('4.1 a target under a working guard is worth 0 and is skipped',()=>{
 const s=W({A:L(),X:X({tackle:3}),F1:dummy('F1',6,1),F2:dummy('F2',4,1)},{rooms:bigRoom});s.units.F1.protect=3;
 assert.deepEqual(skillOf(actionOf(s,'X')),['tackle','F2']);
 s.units.F2.protect=3;
 assert.equal(actionOf(s,'X').type,'basic','with every target guarded no skill has a gain, so step 4 falls back to the basic attack');
});
test('4.1 line10 hits only the first unit on the ray: a friend in front makes the combination invalid; an enemy in front is the target',()=>{
 const mk=(middle)=>W({A:L(),X:mate('X',3,1,{moves:{flamethrower:3},tactic:'gofoes'}),...(middle?{[middle.id]:middle}:{}),F:dummy('F',9,1)},{rooms:bigRoom});
 assert.deepEqual(skillOf(actionOf(mk(null),'X')),['flamethrower','F'],'a clear line fires');
 assert.notEqual(actionOf(mk(mate('Y',6,1)),'X').type,'skill','a friend is the first unit on the ray: invalid');
 assert.deepEqual(skillOf(actionOf(mk(dummy('G',6,1)),'X')),['flamethrower','G'],'an enemy first on the ray is hit instead of F');
});
test('4.1 drain is worth twice when the user is below half HP (exactly half does not count)',()=>{
 // The target has no species so tackle stays 9 and absorb stays 7; only the below-half drain bonus changes their ranking.
 const pick=hp=>skillOf(actionOf(W({A:L(),X:X({tackle:3,absorb:3},{hp,maxHp:40}),F:withoutSpecies(dummy('F',6,1))},{rooms:bigRoom}),'X'));
 assert.deepEqual(pick(40),['tackle','F'],'full HP: tackle 9 beats absorb 7');
 assert.deepEqual(pick(20),['tackle','F'],'exactly half (20/40): no doubling');
 assert.deepEqual(pick(19),['absorb','F'],'below half: absorb 7 x 2 = 14 beats 9');
});
test('4.1 blow-away moves: +5 when the path ends at a wall or an opposing unit, invalid when a friend is hit, nothing for an open path',()=>{
 const mk=(behind,moves)=>{
  const units={A:L(),X:X(moves),F:dummy('F',6,1)};if(behind)units[behind.id]=behind;
  return W(units,{floor:behind&&behind.x===1?row(7):row(7),rooms:[{x:0,y:1,w:8,h:1}]});
 };
 // F at (6,1): the cell behind F is (7,1); with row(7) the next cell (8,1) is a wall, so a push ends at the wall after 1 cell
 assert.deepEqual(skillOf(actionOf(mk(null,{roar:3}),'X')),['roar','F'],'wall behind: roar gains 5');
 const open_=W({A:L(),X:X({roar:3}),F:dummy('F',6,1)},{floor:row(30),rooms:[{x:0,y:1,w:31,h:1}]});
 assert.equal(actionOf(open_,'X').type,'basic','open path (the wall is more than 10 cells away): roar has no gain, so basic');
 const foeBehind=W({A:L(),X:X({roar:3}),F:dummy('F',6,1),G:dummy('G',8,1)},{rooms:bigRoom});
 assert.deepEqual(skillOf(actionOf(foeBehind,'X')),['roar','F'],'an opposing unit behind: +5');
 const friendBehind=W({A:L(),X:X({roar:3}),F:dummy('F',6,1),Y:mate('Y',8,1)},{rooms:bigRoom});
 assert.equal(actionOf(friendBehind,'X').type,'basic','a friend behind would be hit: the combination is invalid');
 // Against Geodude, the 0.8 ratio makes Dragon Tail 6; collision adds 5, beating tackle's 7.
 assert.deepEqual(skillOf(actionOf(W({A:L(),X:X({tackle:3,dragontail:3}),F:dummy('F',6,1)},{floor:row(7),rooms:[{x:0,y:1,w:8,h:1}]}),'X')),['dragontail','F'],'6+5=11 beats tackle 7');
 assert.deepEqual(skillOf(actionOf(W({A:L(),X:X({tackle:3,dragontail:3}),F:dummy('F',6,1),Y:mate('Y',7,1)},{floor:row(8),rooms:[{x:0,y:1,w:9,h:1}]}),'X')),['tackle','F'],'a friend behind makes dragon tail invalid');
});
test('4.1 an unmovable boss cannot be targeted by roar, and dragon tail counts only its damage (6 < tackle 7)',()=>{
 const mk=moves=>W({A:L(),X:X(moves),F:bossOf('F',6,1,60)},{floor:row(7),rooms:[{x:0,y:1,w:8,h:1}]});
 assert.equal(actionOf(mk({roar:3}),'X').type,'basic');
 assert.deepEqual(skillOf(actionOf(mk({tackle:3,dragontail:3}),'X')),['tackle','F']);
 assert.deepEqual(skillOf(actionOf(mk({dragontail:3}),'X')),['dragontail','F'],'alone it still hits for its ratio-scaled 6 damage');
});

test('4.3 with no damage to gain, support moves come before the basic attack, in the listed order',()=>{
 const adjThreat=(moves,foe={tackle:5},extra)=>{const s=W({A:L(),X:X(moves),F:foeOf('F','geodude',6,1,40,foe)},{rooms:bigRoom});if(extra)extra(s);return s;};
 assert.deepEqual(skillOf(actionOf(adjThreat({tackle:3,protect:2}),'X')),['tackle','F'],'damage (step 1) comes before protect (step 3)');
 assert.deepEqual(skillOf(actionOf(adjThreat({protect:2}),'X')),['protect','X'],'threatened and not guarded: protect beats the basic attack');
 assert.equal(actionOf(adjThreat({protect:2},{tackle:5},s=>{s.units.X.protect=2;}),'X').type,'basic','already guarded: no protect');
 const harmless=W({A:L(),X:X({protect:2}),F:dummy('F',6,1)},{rooms:bigRoom});
 assert.equal(actionOf(harmless,'X').type,'basic','a wait-only enemy threatens nobody: no protect');
 // defence below 1: defense curl, once
 const curl=W({A:L(),X:X({defensecurl:3}),F:dummy('F',6,1)},{rooms:bigRoom});
 assert.deepEqual(skillOf(actionOf(curl,'X')),['defensecurl','X']);
 curl.units.X.stages.def=1;assert.equal(actionOf(curl,'X').type,'basic');
 // helping hand: helps a room mate whose attack stage is below +2
 const help=W({A:L(),X:mate('X',5,1,{moves:{helpinghand:3},tactic:'gofoes'}),F:dummy('F',11,1)},{rooms:bigRoom});
 assert.deepEqual(skillOf(actionOf(help,'X')),['helpinghand','A']);
 help.units.A.stages.atk=2;assert.equal(actionOf(help,'X').type,'move','everyone is already at +2: no support, no adjacent enemy, so step 5 (walk toward the visible enemy)');
 // quick guard: only when an ally can be hit from a distance; melee threats do not count
 const ranged=W({A:L(),X:mate('X',5,1,{moves:{quickguard:3},tactic:'gofoes'}),F:foeOf('F','geodude',2,1,40,{quickattack:3})},{rooms:bigRoom});
 assert.deepEqual(skillOf(actionOf(ranged,'X')),['quickguard','X'],'F can hit A from 2 cells away');
 const meleeOnly=W({A:L(),X:mate('X',5,1,{moves:{quickguard:3},tactic:'gofoes'}),F:foeOf('F','geodude',1,1,40,{tackle:3})},{rooms:bigRoom});
 assert.notEqual(actionOf(meleeOnly,'X').type,'skill');
 // screens: reflect when no ally has one
 const screen=W({A:L(),X:mate('X',5,1,{moves:{reflect:3},tactic:'gofoes'}),F:dummy('F',11,1)},{rooms:bigRoom});
 assert.deepEqual(skillOf(actionOf(screen,'X')),['reflect','X']);
 screen.units.A.reflect=5;assert.notEqual(actionOf(screen,'X').type,'skill');
});
test('4.4-4.5 basic attack when adjacent; otherwise move toward the nearest visible opponent',()=>{
 const adj=W({A:L(),X:X({}),F:dummy('F',6,1)},{rooms:bigRoom});
 assert.deepEqual(skillOf(actionOf(adj,'X')),['basic','F']);
 const far=W({A:L(),X:X({tackle:3}),F:dummy('F',9,1)},{rooms:bigRoom});
 assert.deepEqual(actionOf(far,'X'),{type:'move',to:{x:6,y:1}});
});
test('4.* the same algorithm drives an enemy: highest gain, never an ally, never a line shot that would hit its own side',()=>{
 // E1 holds flamethrower with its friend E2 in front of A on the line: the shot is invalid, so E1 walks instead of firing
 const blocked=W({A:withoutSpecies(mate('A',0,1)),E1:foeOf('E1','geodude',9,1,40,{flamethrower:3}),E2:dummy('E2',5,1)},{rooms:bigRoom});
 const s=round(blocked);assert.equal(s.units.E1.pp.flamethrower,3);assert.equal(s.units.A.hp,40);
 // with a clear line E1 fires: round(15 x 0.4) = 6 damage
 const clear=W({A:withoutSpecies(mate('A',0,1)),E1:foeOf('E1','geodude',9,1,40,{flamethrower:3})},{rooms:bigRoom});
 assert.equal(round(clear).units.A.hp,34);
 // Gain ordering: Ember 10 -> 4 and quickattack 8 -> 3; tackle 9 also rounds to 4, but is not in this kit.
 const pick=W({A:withoutSpecies(mate('A',3,1)),E:foeOf('E','geodude',4,1,40,{quickattack:3,ember:3})},{rooms:bigRoom});
 const t=round(pick);assert.equal(t.units.A.hp,36);assert.equal(t.units.E.pp.ember,2);
});


/* ====================================================================== section 11.6: the six tactics */
/* Leader A (wait) stands at x=0 in a one-row room unless stated; X is the non-leader friend whose tactic is under test. */
const T=(tactic,x,rest={},moves={tackle:5,quickattack:5},leaderAt=0)=>W({A:mate('A',leaderAt,1,{moves:{tackle:5}}),X:mate('X',x,1,{moves,tactic}),...rest},{rooms:bigRoom});
const goes=(a,x)=>assert.deepEqual(a,{type:'move',to:{x,y:1}});

test('11.6 together: hits opponents within 3 of the leader (even at range), never one farther away unless adjacent; otherwise walks to the leader',()=>{
 assert.deepEqual(skillOf(actionOf(T('together',1,{F:dummy('F',3,1)}),'X')),['quickattack','F'],'F is 3 from the leader and 2 from X: quickattack');
 goes(actionOf(T('together',2,{F:dummy('F',4,1)}),'X'),1);   // F is 4 from the leader: out of the allowed zone, X is not adjacent to F, so it follows the leader
 assert.deepEqual(skillOf(actionOf(T('together',5,{F:dummy('F',6,1)}),'X')),['tackle','F'],'an adjacent opponent is always fair game, even 6 from the leader');
 goes(actionOf(T('together',5,{F:dummy('F',11,1)}),'X'),4);  // far opponent, X far from the leader: walk toward the leader, do not chase
});
test('11.6 followme: attacks only adjacent opponents; stays adjacent to the leader',()=>{
 assert.equal(actionOf(T('followme',1,{F:dummy('F',3,1)}),'X').type,'wait','a front2 target 2 cells away is not attacked, and X already touches the leader');
 assert.deepEqual(skillOf(actionOf(T('followme',5,{F:dummy('F',6,1)}),'X')),['tackle','F']);
 goes(actionOf(T('followme',5,{F:dummy('F',9,1)}),'X'),4);
});
test('11.6 gofoes: full attack choice, then chases the nearest visible opponent and ignores the leader; with nobody visible it follows the leader',()=>{
 assert.deepEqual(skillOf(actionOf(T('gofoes',5,{F:dummy('F',7,1)}),'X')),['quickattack','F'],'no leader-distance limit');
 goes(actionOf(T('gofoes',5,{F:dummy('F',11,1)},{tackle:5}),'X'),6);
 // in a corridor (2-step sight) a far opponent is invisible, so X falls back to following the leader
 const corridor=W({A:mate('A',0,1),X:mate('X',5,1,{tactic:'gofoes'}),F:dummy('F',11,1)});
 goes(actionOf(corridor,'X'),4);
});
test('11.6 wait: never moves, but still attacks what is in reach',()=>{
 assert.equal(actionOf(T('wait',5,{F:dummy('F',11,1)}),'X').type,'wait');
 assert.deepEqual(skillOf(actionOf(T('wait',5,{F:dummy('F',7,1)}),'X')),['quickattack','F']);
 assert.deepEqual(skillOf(actionOf(T('wait',5,{F:dummy('F',6,1)}),'X')),['tackle','F']);
});
test('11.6 nomoves: only basic attacks (no PP spent), only on adjacent opponents; moves like together',()=>{
 const adj=T('nomoves',5,{F:dummy('F',6,1)});
 assert.deepEqual(skillOf(actionOf(adj,'X')),['basic','F']);
 assert.equal(actionOf(T('nomoves',1,{F:dummy('F',3,1)}),'X').type,'wait','a front2 target is out of basic range; X touches the leader, so it waits');
 goes(actionOf(T('nomoves',5,{F:dummy('F',11,1)}),'X'),4);
 assert.equal(round(adj).units.X.pp.tackle,5,'the round spent no PP');
});
test('11.6 avoid: never attacks; uses self/ally moves; steps away from an adjacent opponent; follows the leader but not next to opponents; waits when it cannot',()=>{
 const grid=(leader,extra={})=>W({A:mate('A',leader.x,leader.y),X:mate('X',3,3,{moves:{tackle:5},tactic:'avoid'}),F:dummy('F',3,2),...extra},{floor:open(5),rooms:[{x:1,y:1,w:5,h:5}]});
 // all free neighbours are 2 cells from F (1 cell now); (3,4) is held by a friend. Leader (3,5): right and left tie on leader distance 3, so DIRS order (right first) decides
 assert.deepEqual(actionOf(grid({x:3,y:5},{Y:mate('Y',3,4,{tactic:'wait'})}),'X'),{type:'move',to:{x:4,y:3}});
 // leader (1,5): the left cell is closer to the leader (3 against 5), which beats the DIRS order
 assert.deepEqual(actionOf(grid({x:1,y:5},{Y:mate('Y',3,4,{tactic:'wait'})}),'X'),{type:'move',to:{x:2,y:3}});
 // no cell strictly farther from F: a dead end, so X stays put and does not attack either
 const dead=W({A:mate('A',9,1),X:mate('X',1,1,{moves:{tackle:5},tactic:'avoid'}),F:dummy('F',2,1)},{floor:row(12).filter(p=>p.x>=1),rooms:[{x:1,y:1,w:12,h:1}]});
 assert.equal(actionOf(dead,'X').type,'wait');
 // not close: follow the leader but never into a cell adjacent to a visible opponent. Leader (1,1), X (3,1), F (2,2): the only closer cell (2,1) touches F
 const forbidden=W({A:mate('A',1,1),X:mate('X',3,1,{moves:{tackle:5},tactic:'avoid'}),F:dummy('F',2,2)},{floor:open(5),rooms:[{x:1,y:1,w:5,h:5}]});
 assert.equal(actionOf(forbidden,'X').type,'wait');
 // an unreachable leader: X waits
 const split=W({A:mate('A',0,1),X:mate('X',5,1,{moves:{tackle:5},tactic:'avoid'}),F:dummy('F',20,1)},{floor:[...row(2),...row(12).filter(p=>p.x>=5)]});
 assert.equal(actionOf(split,'X').type,'wait');
 // far from everything: walks toward the leader
 goes(actionOf(T('avoid',5,{F:dummy('F',11,1)},{tackle:5}),'X'),4);
 // self moves are allowed: protect against a real threat; no basic attack on an adjacent target
 const guardOnly=T('avoid',5,{F:foeOf('F','geodude',6,1,40,{tackle:3})},{protect:2});
 assert.deepEqual(skillOf(actionOf(guardOnly,'X')),['protect','X']);
});
test('11.6 when the leader falls the tactic follows the new leader',()=>{
 // A (leader, 1 HP) at x=2, B at x=12, X (together) at x=7; F beside A kills it in round 1
 const s0=W({A:mate('A',2,1,{hp:1,moves:{tackle:5},tactic:'wait'}),B:mate('B',12,1,{moves:{tackle:5},tactic:'wait'}),X:mate('X',7,1,{moves:{tackle:5},tactic:'together'}),F:foeOf('F','geodude',1,1,40,{tackle:5})},{floor:row(14),rooms:[{x:0,y:1,w:15,h:1}]});
 goes(actionOf(s0,'X'),6);
 const s1=round(s0);
 assert.equal(s1.units.A.hp,0);assert.equal(s1.leader,'B');
 goes(actionOf(s1,'X'),7);   // X walked left to 6 in round 1 (toward the old leader); now it turns around toward B at 12
});
test('11.6 changing a tactic inside the maze does not advance the round; invalid requests are refused',()=>{
 const s0=T('together',5,{F:dummy('F',11,1)});
 const r=applyCommand(s0,{type:'tactic',actor:'X',tactic:'avoid'});
 assert.equal(r.ok,true);assert.equal(r.state.units.X.tactic,'avoid');
 const same=structuredClone(r.state);same.units.X.tactic='together';
 assert.deepEqual(same,s0,'only the tactic changed: same round, same positions, same log, enemies untouched');
 assert.equal(applyCommand(s0,{type:'tactic',actor:'X',tactic:'sneak'}).ok,false);
 assert.equal(applyCommand(s0,{type:'tactic',actor:'F',tactic:'wait'}).ok,false,'only the player\'s own team');
 const away=structuredClone(s0);away.phase='invitation';
 assert.equal(applyCommand(away,{type:'tactic',actor:'X',tactic:'wait'}).ok,false,'not while another decision is pending');
});

/* ====================================================================== section 12.3: sight, sleep, chase memory, roaming */
const cells=(x1,x2,y)=>Array.from({length:x2-x1+1},(_,i)=>({x:x1+i,y}));
test('12.2 sight: a room shows the whole room and its mouth cell; a corridor shows cells within 2 steps along floor, not through walls',()=>{
 // room x1..4,y1..3; corridor (5,2)..(9,2),(9,3),(9,4); U-shaped corridor (12,1)(12,2)(12,3)(13,3)(14,3)(14,2)(14,1)
 const floor=[...Array.from({length:12},(_,i)=>({x:1+i%4,y:1+Math.floor(i/4)})),...cells(5,9,2),{x:9,y:3},{x:9,y:4},{x:12,y:1},{x:12,y:2},{x:12,y:3},{x:13,y:3},{x:14,y:3},{x:14,y:2},{x:14,y:1}];
 const s=W({A:mate('A',1,1)},{floor,rooms:[{x:1,y:1,w:4,h:3}]});
 const see=(a,b)=>currentlyVisible(s,{x:a[0],y:a[1]},{x:b[0],y:b[1]});
 assert.equal(see([1,1],[4,3]),true,'inside a room: the whole room');
 assert.equal(see([1,1],[5,2]),true,'the corridor cell touching the room edge');
 assert.equal(see([1,1],[6,2]),false,'the second corridor cell is beyond the room');
 assert.equal(see([6,2],[8,2]),true,'corridor: 2 steps');
 assert.equal(see([6,2],[9,2]),false,'corridor: 3 steps');
 assert.equal(see([6,2],[4,2]),true,'corridor sight reaches into the room within 2 steps');
 assert.equal(see([9,2],[9,4]),true,'around a corner within 2 steps');
 assert.equal(see([8,2],[9,4]),false,'around a corner, 3 steps');
 assert.equal(see([12,1],[14,1]),false,'two cells apart across a wall, but 6 steps by floor');
 assert.equal(see([12,2],[13,3]),true,'a diagonal cell is within 2 steps through an adjacent floor cell');
 assert.equal(see([12,2],[14,2]),false,'wall in between');
});
test('12.2 sleep at birth: about a quarter of ordinary enemies sleep, never the boss, and the same seed gives the same sleepers',()=>{
 let ordinary=0,asleep=0;
 for(let seed=1;seed<=100;seed++)for(let level=1;level<=3;level++){
  const g=generateFloor(seed,level,{width:20,height:14,floors:3,boss:true}),again=generateFloor(seed,level,{width:20,height:14,floors:3,boss:true});
  assert.deepEqual(g.enemies.map(e=>e.asleep),again.enemies.map(e=>e.asleep));
  for(const e of g.enemies){if(e.boss){assert.equal(e.asleep,false);continue;}ordinary++;if(e.asleep)asleep++;}
 }
 assert.equal(ordinary,900); // 100 seeds x 3 floors x 3 ordinary enemies
 assert.ok(asleep>=0.2*ordinary&&asleep<=0.3*ordinary,`about 25% sleep, got ${asleep}/${ordinary}`);
});
test('12.2 a sleeping enemy does not act; an opposing unit ending the round next to it (diagonal counts) wakes it',()=>{
 const asleep=W({A:mate('A',1,1),E:foeOf('E','geodude',3,1,40,{tackle:5})},{floor:open(5),rooms:[{x:1,y:1,w:5,h:5}]});
 asleep.units.E.pos={x:4,y:3};asleep.units.E.asleep=true;
 const s1=round(asleep);
 assert.equal(s1.units.E.asleep,true);assert.deepEqual(s1.units.E.pos,{x:4,y:3});assert.equal(s1.units.A.hp,40);
 // A walks to (3,2): diagonal to E at (4,3)
 const near=W({A:mate('A',2,2),E:foeOf('E','geodude',4,3,40,{tackle:5})},{floor:open(5),rooms:[{x:1,y:1,w:5,h:5}]});near.units.E.asleep=true;
 const s2=round(near,{type:'move',to:{x:3,y:2}});
 assert.equal(s2.units.E.asleep,false,'woken by the diagonal neighbour at the end of the round');
 assert.equal(s2.units.A.hp,40,'it did not act in the round it woke');
});
test('12.2 being attacked wakes an enemy, and it does not act in that round; next round it fights back',()=>{
 const mk=()=>{const s=W({A:withoutSpecies(mate('A',3,1,{moves:{tackle:5,roar:5}})),E:foeOf('E','geodude',4,1,40,{tackle:5})},{rooms:bigRoom});s.units.E.asleep=true;return s;};
 let s=round(mk(),{type:'basic',target:'E'});
 assert.deepEqual([s.units.E.asleep,s.units.E.hp,s.units.A.hp],[false,34,40],'hit for 6, awake, and no reply this round');
 s=round(s);assert.equal(s.units.A.hp,36,'the next round E tackles: round(9 x 0.4) = 4');
 const pushed=round(mk(),{type:'skill',skill:'roar',target:'E'});
 assert.equal(pushed.units.E.asleep,false,'being blown away also wakes it');assert.equal(pushed.units.A.hp,40);
});
test('12.2 a visible opponent is chased and fought; the chase memory is dropped after 4 turns out of sight, or on arrival',()=>{
 // arrival: E sees A two cells away, steps next to it, remembers A's cell; A then vanishes from view
 const corridor=()=>W({A:mate('A',10,1),B:mate('B',19,1,{tactic:'wait'}),E:foeOf('E','geodude',12,1,40,{tackle:5})},{floor:row(20)});
 let s=round(corridor());
 assert.deepEqual(s.units.E.pos,{x:11,y:1});assert.deepEqual(s.units.E.targetMemory,{x:10,y:1});
 s.units.A.pos={x:20,y:1};                            // out of sight (position edit only)
 s=round(s);assert.deepEqual(s.units.E.pos,{x:10,y:1});assert.deepEqual(s.units.E.targetMemory,{x:10,y:1},'walking to the remembered cell');
 s=round(s);assert.equal(s.units.E.targetMemory,null,'arrived and still sees nobody: memory dropped');
 // 4 turns: a room lets E see far, so the remembered cell is 8 away
 const room=W({A:mate('A',8,1),B:mate('B',9,1,{tactic:'wait'}),E:foeOf('E','geodude',0,1,40,{tackle:5})},{floor:row(30),rooms:[{x:0,y:1,w:10,h:1}]});
 let r=round(room);assert.deepEqual(r.units.E.targetMemory,{x:8,y:1});assert.deepEqual(r.units.E.pos,{x:1,y:1});
 r.units.A.pos={x:28,y:1};r.units.B.pos={x:29,y:1};
 const trail=[];for(let i=0;i<3;i++){r=round(r);trail.push([r.units.E.pos.x,r.units.E.targetMemory?.x??null]);}
 assert.deepEqual(trail,[[2,8],[3,8],[4,8]],'three blind turns: still walking to the remembered cell');
 r=round(r);assert.equal(r.units.E.targetMemory,null,'the 4th blind turn drops it');
});

/* roaming: friends stand far away in a separate cell so nothing is ever visible; LOW/HIGH are enemy-ai states whose next draw is below/above one half */
import {rngStep} from '../../src/core/engine.ts';
const stateWith=(low)=>{for(let st=1;;st++)if((rngStep(st).value<0.5)===low)return st;};
const LOW=stateWith(true),HIGH=stateWith(false);
const roamWorld=(floor,at,{direction,aiRng=LOW,rooms,extra={}}={})=>{
 const far=[{x:60,y:1},{x:61,y:1}];
 const s=W({A:mate('A',60,1),B:mate('B',61,1,{tactic:'wait'}),E:foeOf('E','geodude',at.x,at.y,40,{tackle:5}),...extra},{floor:[...floor,...far],rooms,aiRng});
 s.units.E.direction=direction??null;return s;
};
test('12.2 roaming: in a room an exit is chosen from the room\'s exits by the enemy-ai stream, and the enemy steps toward it',()=>{
 const roomCells=Array.from({length:12},(_,i)=>({x:1+i%4,y:1+Math.floor(i/4)}));
 const floor=[...roomCells,{x:2,y:0},{x:5,y:2}];            // room x1..4,y1..3 with exits (2,0) north and (5,2) east, scanned in that order
 const mk=aiRng=>roamWorld(floor,{x:2,y:2},{aiRng,rooms:[{x:1,y:1,w:4,h:3}]});
 const lo=round(mk(LOW)),hi=round(mk(HIGH));
 assert.deepEqual(lo.units.E.roamTarget,{x:2,y:0});assert.deepEqual(lo.units.E.pos,{x:2,y:1});
 assert.deepEqual(hi.units.E.roamTarget,{x:5,y:2});assert.deepEqual(hi.units.E.pos,{x:3,y:2});
 assert.deepEqual(round(mk(LOW)),lo,'same state, same result');
});
test('12.2 roaming in a corridor: straight on first; at a fork go straight if possible else pick a side by the stream (never back); corner; dead end turns around; blocked ahead waits',()=>{
 const right={x:1,y:0};
 const line=cells(1,10,5);
 let s=round(roamWorld(line,{x:5,y:5},{direction:right}));
 assert.deepEqual(s.units.E.pos,{x:6,y:5});assert.equal(s.enemyAiRng,LOW,'going straight draws no random number');
 // T junction at (5,5): arms (5,4) and (5,6), nothing ahead (6,5)
 const tee=[...cells(1,5,5),{x:5,y:4},{x:5,y:6}];
 assert.deepEqual(round(roamWorld(tee,{x:5,y:5},{direction:right,aiRng:LOW})).units.E.pos,{x:5,y:6},'draw < 0.5: first of (down, up) in DIRS order');
 assert.deepEqual(round(roamWorld(tee,{x:5,y:5},{direction:right,aiRng:HIGH})).units.E.pos,{x:5,y:4},'draw >= 0.5: the second');
 // fork with a straight continuation: keeps going straight
 const cross=[...cells(1,9,5),{x:5,y:4},{x:5,y:6}];
 assert.deepEqual(round(roamWorld(cross,{x:5,y:5},{direction:right})).units.E.pos,{x:6,y:5});
 // corner: the only way besides back is up
 const corner=[...cells(1,5,5),{x:5,y:4},{x:5,y:3}];
 assert.deepEqual(round(roamWorld(corner,{x:5,y:5},{direction:right})).units.E.pos,{x:5,y:4});
 // dead end: only back
 assert.deepEqual(round(roamWorld(cells(1,5,5),{x:5,y:5},{direction:right})).units.E.pos,{x:4,y:5});
 // blocked ahead by another enemy: wait, direction unchanged
 const blocked=round(roamWorld(line,{x:5,y:5},{direction:right,extra:{G:dummy('G',6,5)}}));
 assert.deepEqual(blocked.units.E.pos,{x:5,y:5});assert.deepEqual(blocked.units.E.direction,right);
 // no direction yet: a random walkable direction (right first in DIRS order)
 assert.deepEqual(round(roamWorld(line,{x:5,y:5},{aiRng:LOW})).units.E.pos,{x:6,y:5});
 assert.deepEqual(round(roamWorld(line,{x:5,y:5},{aiRng:HIGH})).units.E.pos,{x:4,y:5});
});
test('12.2 roaming is reproducible: the same state and the same inputs give the same walk; different states can differ',()=>{
 const maze=[...cells(1,11,5),...cells(1,11,9),...Array.from({length:5},(_,i)=>({x:6,y:5+i}))];   // an H-like network
 const walk=aiRng=>{let s=roamWorld(maze,{x:6,y:7},{aiRng});const trail=[];for(let i=0;i<14;i++){s=round(s);trail.push(`${s.units.E.pos.x},${s.units.E.pos.y}`);}return trail.join(' ');};
 assert.equal(walk(LOW),walk(LOW));assert.equal(walk(HIGH),walk(HIGH));
 const variety=new Set([LOW,HIGH,7,99,2024,31337,424242].map(walk));
 assert.ok(variety.size>=2,'different enemy-ai states lead to different walks');
});
