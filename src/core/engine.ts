/** Approved trial rules, research 5f354788. Pure JSON state; no storage or renderer. */
import {generateFloor,generateChallengeEncounter,serviceRoll,ENEMY_DIFFICULTY,DIFFICULTY,isDifficulty,BOSS,BOSS_CONFIG,INITIAL_LEVEL,streamSeed,mulberry32,type Difficulty,type GeneratedFloor,type AdventureRoom} from './dungeon.ts';
import {ECON} from './economy.ts';
import {currentStats} from './stats.ts';
import {SPECIES,speciesOf,tmPool,learnableMove,speciesMaxHp,movesAtLevel,type KitMove} from './roster.ts';
import {typeEffectiveness,stabMultiplier} from './type-chart.ts';
import {TACTICS,isTactic,type Tactic} from './tactics.ts';
import {MOVE_DEFS,moveOf,moveCategory,moveEffects,type MoveSpec,type StageKey,type StageChange,type StatusId} from './moves.ts';
import names from '../data/names-zh.json' with {type:'json'};
import commissionData from '../data/commissions.json' with {type:'json'};
import blessingData from '../data/blessings.json' with {type:'json'};
import rarityData from '../data/blessing-rarity.json' with {type:'json'};
export type Pos = {x:number;y:number};
export type {StatusId,StageKey} from './moves.ts';
export type StatusState={left?:number;tick?:number;fresh?:boolean};
/** Skills are move ids; PP and learned use the same keys. */
export type Skill = string;
/** Camp talent levels copied into a new camp expedition; absent on developer and legacy worlds. */
export type ExpeditionTalents=Partial<Record<'vitality'|'offense'|'supplies',number>>;
export type Unit = {id:string; side:'friend'|'enemy'; hp:number; maxHp:number; pos:Pos|null;
  pp:Partial<Record<Skill,number>>; maxPp:Partial<Record<Skill,number>>; learned:Skill[];
  /** `atk`/`def` always exist; the 8.8 stages (special attack/defence, accuracy, evasion) appear only once changed and read as 0 when missing. Speed has no stage (the game has no speed). */
  stages:{atk:number;def:number;spa?:number;spd?:number;acc?:number;eva?:number}; protect:number; counter:number; lastMove:string|null;
  reflect?:number; lightscreen?:number;
  /** 8.8 (#165) status conditions, absent when none. `left` counts the unit's own remaining action opportunities (par, frz, confusion, flinch); `tick` counts round ends until the next damage (psn, tox, brn last the whole floor). */
  status?:Partial<Record<StatusId,StatusState>>;
  tactic?:Tactic; level?:number; entrySpecies?:string;
  post?:Pos;
  /** Blessings: thick skin and last stand each work once per member per floor. */
  thickUsed?:boolean; standUsed?:boolean;
  asleep?:boolean; wakeSkip?:boolean; targetMemory?:Pos|null; lostSightTurns?:number; roamTarget?:Pos|null; direction?:Pos|null;
  waitOnly?:true; recruit?:Unit; species?:string;
  deferredEvolutionLevel?:number;
  /** Facing is learned from the unit's last movement or attack; old worlds omit it. */
  facing?:Pos;
  /** 6.5: base-roster instance this unit was made from, and the names of its carried moves (aligned with `learned`). Absent for recruits made in the run and for fixtures. */
  inst?:string; moves?:string[];
  /** 7.2: true for a founding member of the base profile (the initial two, or the three starters of an old profile); never goes missing in a wipe. */
  protected?:true;
  /** 7.3: the regional boss. Only the generator sets it (an enemy of the species in `BOSS` in dungeon.ts; its traits — level bonus, HP multiplier, whether it moves or can be blown away — come from `BOSS_CONFIG` in roster.ts; when it sees no opponent it heads inside its room for whoever last hit it, and waits in place if nobody has. Recruiting it yields an ordinary version without these traits). */
  boss?:true};
// Precondition: generated expedition enemies never carry `recruit`; expedition invitations come only from the
// round-end draw. A preset `recruit` would issue a species-less invitation that save.ts rejects.
export type Action = {type:'move';to:Pos}|{type:'basic';target:string}|{type:'skill';skill:Skill;target:string}
  |{type:'basicForward'}|{type:'wait'}|{type:'swap';target:string}|{type:'interact';exit:boolean}|{type:'use';item:Item;target:string}
  /** 7.2 exchanger: send one living non-leader companion home, with up to two held technique machines (indexes into `World.tms`). Occupies the leader's action. */
  |{type:'exchange';target:string;cargo:number[]};
export type Command = {type:'switch';actor:string}|{type:'round';action:Action;override?:{actor:string;action:Action}}
  |{type:'tactic';actor:string;tactic:Tactic}|{type:'face';direction:Pos}|{type:'evolve';species:string|null}
  |{type:'invite';choice:'accept'|'reject'|'camp';outgoing?:string}|{type:'finishExit'}|{type:'finishTransit'}
  |{type:'commissionChoice';choice:'accept'|'reject'}|{type:'blessingChoice';blessing:BlessingId|null}|{type:'blessingRefresh'}|{type:'tmChoice';move:string}
  /** 7.2 shop purchase: needs the leader on the shop cell; takes no round. */
  |{type:'buy';item:ShopItem}|{type:'learnMove';replace:string|null}
  /** Playtest round 2: give up the run; it settles exactly like a wipe. */
  |{type:'abandon'};
export type Invitation = {id:string;unit:Unit;status:'pending'|'accepted'|'rejected'|'cancelled'};
/** `to` is set only for a stairs request (the target floor number); a plain exit request has no `to`. */
export type ExitRequest = {actor:string;pos:Pos;locked:boolean;to?:number};
export type PointKind='goal'|'item'|'exit'|'down'|'up'|'berry'|'tonic'|'pechaBerry'|'rawstBerry'|'cheriBerry'|'chestoBerry'|'healSeed'|'slumberOrb'|'totterOrb'|'luminousOrb'|'rollcallOrb'|'rest'|'shop'|'exchange';
export type ShopItem='berry'|'tonic'|'tm'|'pechaBerry'|'healSeed'|'slumberOrb'|'totterOrb'|'luminousOrb'|'rollcallOrb'|'reviverSeed';
/** 6.4 backpack items (expedition only): berry restores HP, tonic restores PP. Names are display text. */
export type Item='berry'|'tonic'|'bigBerry'|'teamTonic'|'pechaBerry'|'rawstBerry'|'cheriBerry'|'chestoBerry'|'healSeed'|'violentSeed'|'maxElixir'|'slumberOrb'|'totterOrb'|'luminousOrb'|'rollcallOrb'|'reviverSeed';
/** 8.8 (#165, G9.1): items lying on the floor, picked up by walking onto them. */
export type PickupKind=Extract<PointKind,Item>;
export const PICKUP_KINDS:readonly PickupKind[]=['berry','tonic','pechaBerry','rawstBerry','cheriBerry','chestoBerry','healSeed','slumberOrb','totterOrb','luminousOrb','rollcallOrb'];
export const isPickupKind=(kind:string):kind is PickupKind=>(PICKUP_KINDS as readonly string[]).includes(kind);
export const SKILL_CN:Record<Skill,string>=(names as unknown as {moves:Record<string,string>}).moves;
export const ITEM_NAMES:Record<Item,string>={berry:'橙橙果',tonic:'PP多项小补剂',bigBerry:'大树果',teamTonic:'全员 PP 补剂',pechaBerry:'桃桃果',rawstBerry:'莓莓果',cheriBerry:'樱子果',chestoBerry:'零余果',healSeed:'治愈之种',violentSeed:'暴力种子',maxElixir:'单人满 PP 补剂',slumberOrb:'睡眠宝珠',totterOrb:'慌乱宝珠',luminousOrb:'发光宝珠',rollcallOrb:'邀回宝珠',reviverSeed:'复活种子'};
/** Items that are used by the member itself, on its own cell, and need no target. */
export const ORB_ITEMS:readonly Item[]=['slumberOrb','totterOrb','luminousOrb','rollcallOrb'];
/** Cure berries also restore a little HP (the original games do). */
export const ITEM_HEALS:Partial<Record<Item,number>>={pechaBerry:4,rawstBerry:4,cheriBerry:4};
/** Orange Berry: 30% of the target's maximum HP, but never less than the old flat 8. */
export const berryBaseHeal=(maxHp:number):number=>Math.max(PROG.berryHeal,Math.floor(maxHp*0.3));
/** 8.8 (#165, G9.1): which status conditions each cure item removes (Heal Seed: all of them). */
export const ITEM_CURES:Partial<Record<Item,readonly StatusId[]>>={pechaBerry:['psn','tox'],rawstBerry:['brn'],cheriBerry:['par'],chestoBerry:['slp'],healSeed:['psn','tox','brn','par','frz','slp','confusion','flinch']};
export const STATUS_NAMES:Record<StatusId,string>={psn:'中毒',tox:'剧毒',brn:'灼伤',par:'麻痹',frz:'冰冻',slp:'睡眠',nap:'打盹',confusion:'混乱',flinch:'畏缩'};
export const STAGE_NAMES:Record<StageKey,string>={atk:'攻击',def:'防御',spa:'特攻',spd:'特防',spe:'速度',acc:'命中',eva:'闪避'};
export type CommissionId='hunter'|'collector'|'scout'|'guardian'|'speedrun';
export type BlessingId='berryBoost'|'floorHeal'|'battleSpirit'|'lullaby'|'rally'|'tmChoice'|'nemesis'|'headhunter'|'fullpower'|'scholar'|'killheal'|'regen'|'thickskin'|'laststand';
export type CommissionDefinition={name:string;description:string;progressTarget:number|null;equivalentEnemies:number;penalty:'defenseMinusOne'|'berryHealHalf'|null;floors:number[];speedMultiplier?:number;requiresRoomTypes?:AdventureRoom['type'][]};
export const INITIAL_BLESSING_REFRESHES=1;
export type BlessingRarity='common'|'rare'|'epic';
export type BlessingDefinition={name:string;description:string;rarity:BlessingRarity;floors:number[];effect:BlessingId;berryHealBonus?:number;berryHealRate?:number;floorHealHp?:number;floorHealRate?:number;floorHealMin?:number;value?:number;every?:number;threshold?:number;attackStage?:number;sleepChance?:number;recruitChance?:number;choiceCount?:number};
export const COMMISSIONS=commissionData as Record<CommissionId,CommissionDefinition>;
export const BLESSINGS=blessingData as Record<BlessingId,BlessingDefinition>;
export const BLESSING_RARITY=rarityData as {weights:Record<BlessingRarity,number>;order:BlessingRarity[];names:Record<BlessingRarity,string>};
export type ActiveCommission={id:CommissionId;floor:number;acceptedRound:number;progress:number;progressTarget:number;speedLimit:number|null};
export type PendingChoice=
  |{type:'commission';room:number;commission:CommissionId}
  |{type:'blessing';source:'room'|'challenge';room:number|null;options:BlessingId[]}
  |{type:'tmChoice';source:'target'|'challenge'|'boss'|'blessing';options:string[]};
export type Rect={x:number;y:number;w:number;h:number};
/**
 * 6.4 shared run level and counters (expedition only; absent in the fixed map and in expeditions saved before 6.4).
 * `rng` is the recruit-draw state (a 32-bit integer, separate from `dungeon.seed`); `kills` holds defeated enemies of the current round
 * until the round-end settlement and is empty at every checkpoint; `made` counts recruits created so far (ids N1, N2...).
 */
export type Progress={level:number;exp:number;rng:number;made:number;kills:string[];items:{berry:number;tonic:number;bigBerry?:number;teamTonic?:number;pechaBerry?:number;rawstBerry?:number;cheriBerry?:number;chestoBerry?:number;healSeed?:number;violentSeed?:number;maxElixir?:number;slumberOrb?:number;totterOrb?:number;luminousOrb?:number;rollcallOrb?:number;reviverSeed?:number}};
/** Cumulative experience thresholds: reaching Lv L costs the sum of levels 5 through L-1. */
const expThreshold=(level:number)=>level<=INITIAL_LEVEL?0:level*(level-1)/2-((INITIAL_LEVEL-1)*INITIAL_LEVEL)/2;
export const PROG={recruitChance:0.3,thresholds:Array.from({length:101},(_,level)=>expThreshold(level)),initialLevel:INITIAL_LEVEL,maxLevel:100,hpPerLevel:1,damagePerLevel:1,damageEveryLevels:4,expMultiplier:2,goalExp:0,bossExp:0,berryHeal:8,tonicPp:10,teamTonicPp:5,restPp:5,bagLimit:null as number|null};
export const levelFor=(exp:number)=>Math.max(INITIAL_LEVEL,PROG.thresholds.reduce((best,t,level)=>t<=exp?level:best,INITIAL_LEVEL));
export const levelDamageBonus=(level:number)=>Math.floor(Math.max(0,level-INITIAL_LEVEL)/PROG.damageEveryLevels);
export type Point={pos:Pos;kind:PointKind;used:boolean};
/** A floor that is not the current one: its terrain, revealed cells, real enemies (with their HP and positions) and points. */
export type StoredFloor={floor:Pos[];liquid?:string[];arrival?:Pos;seen:string[];seenWalls?:string[];enemies:string[];units:Record<string,Unit>;points:Point[];rooms?:Rect[];bossRoom?:number;enemyAiRng?:number;adventureRooms?:AdventureRoom[]};
/** Expedition-only data. `stored` holds every visited floor except the current one; unvisited floors are generated from `seed` on first entry. */
/** `base` (6.5): true for a run started from the base; only those runs get the floor-2 rest point (older generated runs keep their exact floors). */
/** `services` (7.2): true for a run that may hold a shop and an exchanger (decided by `serviceRoll` from the seed). Older runs never get them. */
/** `boss` (7.3): themed floors and a regional boss on the last floor. `roguelike` marks the new one-way rules; absent means a legacy run. */
export type Dungeon={seed:number;width:number;height:number;floors:number;level:number;stored:Record<string,StoredFloor>;base?:true;services?:true;boss?:true;tmPool?:3|4|5;roguelike?:true};
/** A technique machine obtained in this run; `sent` remains a possible in-run fate, while final rogue fate is decided by win or wipe. */
export type TmItem={move:string;source:'target'|'shop'|'boss'|'challenge'|'blessing';fate:'held'|'brought'|'sent'|'lost'};
/** 7.2 the shop of this run: fixed stock decided at the start, and every sale so far. `tm` is null once sold. */
export type Shop={level:number;stock:{berry:number;tonic:number;tm:string|null;pechaBerry?:number;healSeed?:number;slumberOrb?:number;totterOrb?:number;luminousOrb?:number;rollcallOrb?:number;reviverSeed?:number};trades:{item:ShopItem;price:number}[]};
/** 7.2 the exchanger of this run: used at most once; `sent` is the companion it took home. */
export type Exchange={level:number;used:boolean;sent:string|null};
/**
 * The finished run. Fields after `brought` exist only for expedition runs with `prog` (7.2) and are fixed at the end, saved together with it:
 * `tms` final fate of every technique machine, `lost` who went missing in the wipe draw, `effective`/`reasons` the effective-expedition judgement
 * (reasons: 'goal' | 'recruit' | 'tm'), `reward` the base reward owed, `purse` the purse balance at the end and `refund` how much of it returns to the account. Rogue outcomes are `won` or `wipe`; `normal` is retained for legacy runs.
 */
export type End = {id:string;outcome:'normal'|'won'|'wipe';team:string[];camp:string[];goal:boolean;acquired:number;brought:number;
  /** 7.3 (boss-marked runs only): whether the boss was defeated (its HP is 0 in the final state). */
  boss?:boolean;tms?:TmItem[];lost?:string[];effective?:boolean;reasons?:string[];reward?:number;purse?:number;refund?:number};
export type World = {runId:string;scenario:string;round:number;floor:Pos[];liquid?:string[];arrival?:Pos;seen:string[];seenWalls?:string[];units:Record<string,Unit>;
  queue:string[];enemies:string[];camp:string[];leader:string;points:Point[];
  goal:boolean;bag:number;phase:'playing'|'learning'|'evolution'|'invitation'|'commission'|'blessing'|'tmChoice'|'exit'|'transit'|'ended';invitations:Invitation[];anchor:Pos|null;
  request:ExitRequest|null;end:End|null;log:string[];dungeon?:Dungeon;difficulty?:Difficulty;prog?:Progress;rooms?:Rect[];bossRoom?:number;
  /** 8.3 room state stays in the in-memory expedition (current World or StoredFloor) and is never saved. */
  adventureRooms?:AdventureRoom[];pendingAdventureStart?:{room:number;actor:string;pos:Pos};
  /** 8.4 contract and blessing state is run-only and is never serialized. */
  commissions?:ActiveCommission[];blessings?:BlessingId[];/** Refreshes of the blessing choice left this run (shared by every choice; talents and floor content will add to it) and how many were used (the salt of the next draw). */blessingRefreshes?:number;blessingRefreshUsed?:number;pendingChoices?:PendingChoice[];pendingEnd?:'won'|'wipe'|'normal';
  /** 8.5: only a new camp expedition has these; missing completedCommissions marks a legacy/developer world with no new score. */
  talents?:ExpeditionTalents;completedCommissions?:number;
  /** 8.8 (#165): state of the separate battle random stream (hits, secondary effects, status durations, confusion). Derived from the dungeon seed on first use; never saved. */
  battleRng?:number;
  /** Test fixtures that need exact damage numbers set this to switch critical hits off; real runs never do. */
  noCrit?:boolean;
  /** Luminous Orb: the whole floor's terrain is drawn (not units); cleared on every floor change. */
  mapRevealed?:boolean;
  /** Latest round events for the interface (see `RoundEvent`): the animation reads them, in the order the log lines were written; reset by each round command and never saved (the expedition is memory-only). */
  events?:RoundEvent[];
  /** Interface-only record of the log: one entry per `note()` line, with the units, moves and species it names as data (see `LogEntry`). Capped at 80 like `log`, never saved (the expedition is memory-only), and read by no rule. `logSeq` numbers the entries so the interface can tell which are new. */
  entries?:LogEntry[];logSeq?:number;
  /** Transient, never saved: the confused unit whose random strike was the last log line (see `RoundEvent` `hpLoss.strike`); removed at the start and the end of each round. */
  strikePending?:string;
  enemyAiRng?:number;quickguard?:{owner:'friend'|'enemy';units:string[]};
  pendingEvolutions?:{actor:string;choices:string[]}[];pendingLearnMoves?:{actor:string;move:string;pp:number}[];pendingSettlement?:{bossDrop:boolean;kills:string[]};
  /** 7.2 (expedition runs with `prog` only): purse money, technique machines of this run, the shop and the exchanger (only runs with `dungeon.services`). */
  purse?:number;tms?:TmItem[];shop?:Shop;exchange?:Exchange};
export type RoundEvent=
  |{type:'miss';actor:string;target:string;skill:string|null}
  /** The move reached the target but cannot affect it (type immunity and the like): shown as a hit that does nothing, never as a miss. */
  |{type:'immune';actor:string;target:string;skill:string}
  /** One per damage line written by a move or basic attack: who was hit, for how much, and whether it was a critical hit. The log panel reads `crit` from here (the animation reads `hpLoss`). */
  |{type:'damage';actor:string;target:string;amount:number;crit?:true}
  |{type:'airAttack';actor:string;from:Pos;to:Pos}
  |{type:'status';target:string;status:StatusId;change:'apply'|'refresh'|'cure'|'expire'|'unchanged'}
  |{type:'statusDamage';target:string;status:'psn'|'tox'|'brn';amount:number}
  |{type:'pickup';actor:string;item:Item;ok:boolean}
  /* Presentation events (batch 13): one per log line the board animates, written in the same order as the log so the animation never reads the log text. */
  /** A step to `to`; the unit's earlier position is known from the state before the round. */
  |{type:'move';unit:string;to:Pos}
  |{type:'swap';unit:string;mate:string}
  /** A move starts. `viaSleeptalk` marks a move called by a sleeper's Sleep Talk. */
  |{type:'cast';unit:string;skill:string;viaSleeptalk?:true}
  |{type:'sleeptalk';unit:string;skill:string}
  /** A confused user's move found no target on its random line. */
  |{type:'castNoTarget';unit:string}
  /** A confused unit struck in a random direction (its own action; the next damage is what it hit, see `hpLoss.strike`). */
  |{type:'confusedStrike';unit:string}
  /** The unit's own action ended without a hit it could be credited with. */
  |{type:'fail';unit:string;reason:'basicNoTarget'|'frozen'|'nap'|'sleep'|'paralyzed'|'flinch'|'invalid'|'noPath'|'wait'|'confusedWander'|'swapPartnerFrozen'}
  |{type:'blowaway';unit:string;target:string;to:Pos}
  /** HP lost: a plain hit (no `cause`) or status/recoil damage. `hp` is the HP left; `revive` the HP restored by a Reviver Seed in the same blow; `strike` the confused unit whose random strike this was; `crit` a critical hit. */
  |{type:'hpLoss';unit:string;amount:number;hp:number;cause?:string;crit?:true;strike?:string;revive?:number}
  /** A frozen unit took no damage from a hit. */
  |{type:'frozenBlock';unit:string}
  |{type:'revive';unit:string;hp:number}
  |{type:'heal';unit:string;from:number;to:number}
  |{type:'drain';unit:string;from:number;to:number}
  |{type:'stage';unit:string;stat:StageKey;value:number}
  |{type:'rest';unit:string}
  /** A unit born asleep had its sleeping flags turned into the move's sleep status. */
  |{type:'sleepConverted';unit:string}
  |{type:'guard';unit:string;kind:'protect'|'counter'|'reflect'|'lightscreen'}
  |{type:'quickguard';unit:string;targets:string[]}
  /** An item used. `target` is absent for items that act on the room or the party. */
  /** `moved` (the Rollcall Orb): the companions that were called next to the user and the cells they now stand on, so a replay moves them before later events of the round. */
  |{type:'itemUse';unit:string;item:Item;target?:string;from?:number;to?:number;pp?:number;moved?:{unit:string;to:Pos}[]};
/** One name inside a log entry. Units carry the species and side they had when the line was written, so the line stays readable after the unit is gone (a floor change removes the floor's enemies). */
export type LogSlot={unit:string;species?:string;side?:'friend'|'enemy'}|{move:string}|{species:string};
export type LogPart=string|LogSlot;
/**
 * The structured twin of one `log` line. `parts` is the line itself, with every unit, move and species id kept as a slot instead of text; `s.log` is `parts` printed with the raw ids.
 * `player` is only present where the player-facing wording differs from the log wording. `routine` marks plain movement, swaps and waiting (not shown in the record).
 * `damage` marks a plain damage line: the interface joins the critical-hit flag and the type notes ("效果绝佳") into it. `reward` holds a challenge reward line without its "挑战奖励：" prefix (the challenge panel shows it). `folded` marks a type note that the interface has already joined into its damage entry.
 */
export type LogEntry={n:number;parts:LogPart[];player?:LogPart[];routine?:true;folded?:true;reward?:LogPart[];damage?:{target:string;amount:number;crit?:true;notes:string[]}};
export type Result = {ok:true;state:World}|{ok:false;state:World;error:string};
export const RULE_VERSION='trial-rules-6';
export const CONTENT_VERSION='trial-content-7';
export const SPEC_SOURCE='5f3547889b30e59f6cdfebc5af8c91e46cba4ee4';
export const key=(p:Pos)=>`${p.x},${p.y}`;
export const same=(a:Pos|null,b:Pos|null)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
export const distance=(a:Pos,b:Pos)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export const DIRS:Pos[]=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
/** 8.8 (4.1): eight movement directions. The four straight ones come first so equal-length paths still prefer them (right/down/left/up, then the diagonals). */
export const DIRS8:Pos[]=[...DIRS,{x:1,y:1},{x:-1,y:1},{x:-1,y:-1},{x:1,y:-1}];
export const plus=(a:Pos,b:Pos):Pos=>({x:a.x+b.x,y:a.y+b.y});
export const clone=<T>(v:T):T=>structuredClone(v);
const isDirection=(value:unknown):value is Pos=>!!value&&typeof value==='object'&&Number.isInteger((value as Pos).x)&&Number.isInteger((value as Pos).y)&&DIRS8.some(d=>d.x===(value as Pos).x&&d.y===(value as Pos).y);
/** A unit's saved facing, or the legacy default when it has never moved or attacked. */
export function facingOf(unit:Pick<Unit,'side'|'facing'>):Pos {
  if(isDirection(unit.facing))return {x:unit.facing.x,y:unit.facing.y};
  return unit.side==='friend'?{x:1,y:0}:{x:-1,y:0};
}
function faceToward(unit:Unit,from:Pos,to:Pos):void {
  const direction={x:Math.sign(to.x-from.x),y:Math.sign(to.y-from.y)};
  if(isDirection(direction))unit.facing=direction;
}
const freshCombatState=()=>({stages:{atk:0,def:0} as Unit['stages'],protect:0,counter:0,lastMove:null as string|null});
export function friend(id:string,x:number,y:number,hp=20,pp:Unit['pp']={}):Unit {
  return {id,side:'friend',hp,maxHp:20,pos:hp>0?{x,y}:null,pp:{...pp},maxPp:Object.fromEntries(Object.keys(pp).map(k=>[k,2])),learned:Object.keys(pp),...freshCombatState(),reflect:0,lightscreen:0,tactic:'together',level:INITIAL_LEVEL};
}
export type EnemyFixtureRole='melee'|'ranged'|'chase';
const FIXTURE_SPECIES:Record<EnemyFixtureRole,string>={melee:'geodude',ranged:'pidgey',chase:'growlithe'};
export function enemy(id:string,x:number,y:number,hp:number,role:EnemyFixtureRole,damage:number,range=1):Unit {
  // `hp` and `range` remain in the helper signature for old scenario fixtures.
  // The roster, level and HP formula define the enemy's actual stats; a species-generated enemy
  // gets the enemy difficulty multiplier on HP just like its damage (spec 5.1). Callers that need a
  // literal HP (test fixtures, developer scenarios) assign it afterwards.
  void hp;void range;
  const species=FIXTURE_SPECIES[role],u=speciesUnit(id,species,INITIAL_LEVEL,{x,y});
  u.maxHp=speciesMaxHp(species,INITIAL_LEVEL,ENEMY_DIFFICULTY);u.hp=u.maxHp;
  u.side='enemy';u.tactic='gofoes';if(damage===0)u.waitOnly=true;return u;
}
export function newcomer(id='N'):Unit {return friend(id,0,0,10,{tackle:1,roar:1});}
/** A roster unit at the shared or individual level: list HP formula, full HP and full kit PP. */
export function speciesUnit(id:string,speciesId:string,level=INITIAL_LEVEL,pos:Pos|null=null):Unit {
  const sp=SPECIES[speciesId],maxHp=speciesMaxHp(speciesId,level);
  return {id,side:'friend',hp:maxHp,maxHp,pos,pp:Object.fromEntries(sp.kit.map(k=>[k.move,k.pp])),maxPp:Object.fromEntries(sp.kit.map(k=>[k.move,k.pp])),learned:sp.kit.map(k=>k.move),species:speciesId,entrySpecies:speciesId,level,...freshCombatState(),reflect:0,lightscreen:0,tactic:'together'};
}
function setUnitLoadout(u:Unit,loadout:KitMove[]):void {
  u.learned=loadout.map(move=>move.move);
  u.pp=Object.fromEntries(loadout.map(move=>[move.move,move.pp]));
  u.maxPp=Object.fromEntries(loadout.map(move=>[move.move,move.pp]));
}
/** Integer percentages keep exact half points from rounding down due to a binary float multiplier. */
export function applyTalentBonus(value:number,percent:number):number {
  return Math.floor((value*(100+percent)+50)/100);
}
function vitalityMaxHp(speciesId:string,level:number,vitality=0):number {
  return applyTalentBonus(speciesMaxHp(speciesId,level),5*vitality);
}
/** R07 half snapshot of a new recruit: HP floor(max/2) (at least 1). 8.8 (#165, G8.2): PP is full, not halved. */
export function recruitUnit(id:string,speciesId:string,level:number,vitality=0):Unit {
  const u=speciesUnit(id,speciesId,level);setUnitLoadout(u,movesAtLevel(speciesId,level));u.maxHp=vitalityMaxHp(speciesId,level,vitality);u.hp=Math.max(1,Math.floor(u.maxHp/2));
  return u;
}
/** Recoverable recruit-draw stream: mulberry32 stepped from an explicit state, so the state can be saved and resumed without redrawing. */
export function rngStep(state:number):{value:number;state:number} {
  const a=(state+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;
  return {value:((t^(t>>>14))>>>0)/4294967296,state:a>>>0};
}
export function createMain(runId:string,invitation=true):World {
  const e=enemy('E',4,1,16,'melee',4);if(invitation)e.recruit=newcomer();
  const s:World={runId,scenario:invitation?'main-invite':'main-none',round:0,
    floor:Array.from({length:10},(_,x)=>({x,y:1})),seen:[],
    units:{A:friend('A',0,1,20,{tackle:2}),B:friend('B',1,1,20,{protect:2}),C:friend('C',2,1,20,{tackle:2,quickattack:2}),E:e,R:enemy('R',9,1,6,'ranged',6,3)},
    queue:['A','B','C'],enemies:['E','R'],camp:[],leader:'C',points:[{pos:{x:4,y:1},kind:'goal',used:false},{pos:{x:7,y:1},kind:'item',used:false}],
    goal:false,bag:0,phase:'playing',invitations:[],anchor:null,request:null,end:null,log:[]};
  reveal(s);return s;
}
const walk=(s:World,p:Pos)=>s.floor.some(q=>same(p,q));
/** The side cells a diagonal step a to b passes beside, as keys; straight steps have none. */
const sideKeys=(a:Pos,b:Pos):string[]=>a.x===b.x||a.y===b.y?[]:[`${b.x},${a.y}`,`${a.x},${b.y}`];
/** 8.8 (4.1): a diagonal step may not cut a corner, i.e. both side cells must be floor (a wall or second terrain on either side forbids it). */
const floorStepOk=(floor:ReadonlySet<string>,a:Pos,b:Pos)=>sideKeys(a,b).every(k=>floor.has(k));
/** The side cells that make the diagonal step a to b cut a corner (not floor); empty when the step is allowed. */
function cornerBlockers(s:World,a:Pos,b:Pos):Pos[] {
  if(a.x===b.x||a.y===b.y)return [];
  return [{x:b.x,y:a.y},{x:a.x,y:b.y}].filter(c=>!walk(s,c));
}
const stepOk=(s:World,a:Pos,b:Pos)=>cornerBlockers(s,a,b).length===0;
const chebyshev=(a:Pos,b:Pos)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
/** 8.8 (4.1): "adjacent" for attacks, swaps and items: one of the eight neighbours, and a diagonal one only when it does not cut a wall corner. */
const adjacent=(s:World,a:Pos,b:Pos)=>chebyshev(a,b)===1&&stepOk(s,a,b);
const active=(s:World)=>[...s.queue,...s.enemies].map(id=>s.units[id]).filter(u=>u.hp>0&&u.pos);
const occupied=(s:World,p:Pos)=>active(s).some(u=>same(u.pos,p));
const alive=(u:Unit|undefined):u is Unit&{pos:Pos}=>!!u&&u.hp>0&&u.pos!==null;
/** Any log line drops `s.strikePending`: only the line right after a confused strike (the damage it caused) may claim it. */
/** A log line being written: a template whose interpolated values are resolved against the world when it is noted (see `note`). */
type Msg={strs:readonly string[];vals:readonly unknown[]};
type Joined={list:readonly unknown[];sep:string};
const L=(strs:TemplateStringsArray,...vals:unknown[]):Msg=>({strs,vals});
const joined=(list:readonly unknown[],sep:string):Joined=>({list,sep});
/** Turns a message into parts. A string value that is exactly the id of a unit (in the world, an invitation or the camp), a roster species or a move becomes a slot; no text is ever searched. */
function resolveMsg(s:World,m:Msg):LogPart[]{
  const out:LogPart[]=[];const text=(t:string)=>{if(!t)return;const last=out[out.length-1];if(typeof last==='string')out[out.length-1]=last+t;else out.push(t);};
  const unitOf=(id:string)=>s.units[id]??s.invitations?.find(i=>i.unit.id===id)?.unit;
  const value=(v:unknown):void=>{
    if(v&&typeof v==='object'&&'strs' in v){for(const part of resolveMsg(s,v as Msg)){if(typeof part==='string')text(part);else out.push(part);}return;}
    if(v&&typeof v==='object'&&'list' in v){const j=v as Joined;j.list.forEach((item,i)=>{if(i)text(j.sep);value(item);});return;}
    if(typeof v!=='string'){text(String(v));return;}
    const u=unitOf(v);
    if(u)out.push({unit:v,...(u.species?{species:u.species}:{}),side:u.side});
    else if(Object.hasOwn(SPECIES,v))out.push({species:v});
    else if(Object.hasOwn(MOVE_DEFS,v))out.push({move:v});
    else text(v);
  };
  m.strs.forEach((t,i)=>{text(t);if(i<m.vals.length)value(m.vals[i]);});
  return out;
}
const printParts=(parts:readonly LogPart[]):string=>parts.map(p=>typeof p==='string'?p:'unit' in p?p.unit:'move' in p?p.move:p.species).join('');
/** Writes one log line and its structured entry together. Any log line drops `s.strikePending`: only the line right after a confused strike (the damage it caused) may claim it. */
const note=(s:World,m:Msg,extra:{player?:Msg;routine?:true;folded?:true;damage?:{target:string;amount:number;crit?:true;notes:string[]}}={}):LogEntry=>{
  if(s.strikePending!==undefined)delete s.strikePending;
  const parts=resolveMsg(s,m),entry:LogEntry={n:(s.logSeq=(s.logSeq??0)+1),parts,...(extra.player?{player:resolveMsg(s,extra.player)}:{}),...(extra.routine?{routine:true as const}:{}),...(extra.folded?{folded:true as const}:{}),...(extra.damage?{damage:extra.damage}:{})};
  s.log.push(printParts(parts));s.log=s.log.slice(-80);
  s.entries=[...(s.entries??[]),entry].slice(-80);
  return entry;
};
/** A challenge reward line: logged as "挑战奖励：<detail>"; the entry keeps the detail apart so the challenge panel can show it. */
const rewardNote=(s:World,detail:Msg):void=>{note(s,L`挑战奖励：${detail}`).reward=resolveMsg(s,detail);};
/* ---------- 8.8 (#165): battle random stream, hit chance, status conditions ---------- */
const BATTLE_STREAM=0x3B1F6A27;
/** The battle stream is separate from recruit draws (`prog.rng`), drops and enemy AI: adding hits and statuses leaves those draws unchanged. */
function battleRandom(s:World):number {
  const state=s.battleRng??((Math.imul((s.dungeon?.seed??hashText(s.runId))>>>0,0x9E3779B1)^BATTLE_STREAM)>>>0),next=rngStep(state);
  s.battleRng=next.state;return next.value;
}
const battleInt=(s:World,lo:number,hi:number)=>lo+Math.floor(battleRandom(s)*(hi-lo+1));
const emit=(s:World,e:RoundEvent)=>{(s.events??=[]).push(e);};
/** Stage of a unit; the missing keys of old units read as 0 and speed never has one. */
export const stageOf=(u:Unit,k:StageKey):number=>k==='spe'?0:((u.stages as Record<string,number|undefined>|undefined)?.[k]??0);
/** G5.1 (D-20261110-08): stage difference n is clamped to -6...+6; n>=0 gives (3+n)/3, n<0 gives 3/(3-n). */
/** G5.1: accuracy and evasion stages run -6...+6 as in the main series (Showdown hitStepAccuracy; D-20261110-08). G4.3: at most three travellers. G5.13: a status without a duration range (flinch) lasts this many of its owner's action chances. */
export const ACCURACY_STAGE_LIMIT=6,PARTY_LIMIT=3,STATUS_DEFAULT_LEFT=1;
/** G5.6, G5.7, G5.8, G5.9: how long guard, counter and screens last (in opposing action phases), and the blow-away reach and impact. Read by the move texts. */
export const PROTECT_PHASES=3,COUNTER_PHASES=3,SCREEN_PHASES=10,BLOWAWAY_CELLS=10,COLLISION_DAMAGE=5;
export const accuracyMultiplier=(n:number):number=>{const c=Math.max(-ACCURACY_STAGE_LIMIT,Math.min(ACCURACY_STAGE_LIMIT,n));return c>=0?(3+c)/3:3/(3-c);};
/** Moves are judged for a hit when they target opponents or everyone (a line attack that can also catch a companion); self buffs, guards, Helping Hand, screens and Quick Guard never roll. */
const needsHitRoll=(spec:MoveSpec)=>spec.target==='enemy'||spec.target==='all';
/**
 * Percent chance (0-100, may be fractional) that `sourceId` connects with `targetId`. `skill` undefined means a basic attack: 100 unless the attacker's
 * accuracy stage is negative. Moves with no accuracy data or "always hits" data are 100. Interface and auto-selection read this; resolution rolls it.
 */
export function hitChance(s:World,sourceId:string,targetId:string,skill?:Skill):number {
  const src=s.units[sourceId],tgt=s.units[targetId];if(!src||!tgt)return 0;
  if(skill===undefined)return Math.min(100,100*accuracyMultiplier(Math.min(0,stageOf(src,'acc'))));
  const spec=moveOf(skill),base=moveEffects(skill)?.acc;
  if(!spec||!needsHitRoll(spec)||base===null||base===undefined)return 100;
  return Math.min(100,base*accuracyMultiplier(stageOf(src,'acc')-stageOf(tgt,'eva')));
}
function rollHit(s:World,sourceId:string,targetId:string,skill?:Skill):boolean {
  const chance=hitChance(s,sourceId,targetId,skill);
  return chance>=100||battleRandom(s)*100<chance;
}
export const STATUS_DURATION:Partial<Record<StatusId,[number,number]>>={par:[2,3],frz:[1,3],slp:[3,6],nap:[2,3],confusion:[7,12]};
export const STATUS_INTERVAL:Partial<Record<StatusId,number>>={psn:20,tox:2,brn:20};
/** G5.13: poison, bad poison and burn take max(1, floor(maxHp / divisor)) every STATUS_INTERVAL round ends; a burnt attacker deals BURN_DAMAGE_RATIO of its damage. */
export const STATUS_DAMAGE_DIVISOR={psn:12,tox:8,brn:12} as const;
export const BURN_DAMAGE_RATIO=[4,5] as const;
/** G5.13: the chance that a sleeper wakes up when a move really costs it HP. */
export const WAKE_ON_HIT_CHANCE=0.25;
export const hasStatus=(u:Unit|undefined,k:StatusId):boolean=>!!u&&u.status?.[k]!==undefined;
/** Returns true only for the slp and nap conditions; enemies born asleep use separate flags. */
export const sleeping=(u:Unit|undefined):boolean=>hasStatus(u,'slp')||hasStatus(u,'nap');
function dropStatus(u:Unit,k:StatusId):boolean {
  if(!u.status||u.status[k]===undefined)return false;
  delete u.status[k];if(!Object.keys(u.status).length)delete u.status;return true;
}
/** Applies one status condition under the stacking rules (G5.13): all may coexist; frz and brn replace each other; tox replaces psn and psn never replaces tox. */
function applyStatus(s:World,targetId:string,kind:StatusId):void {
  const t=s.units[targetId];if(!alive(t))return;
  const name=STATUS_NAMES[kind];
  if(kind==='slp'&&(hasStatus(t,'slp')||hasStatus(t,'nap')))return;
  if(kind==='psn'&&hasStatus(t,'tox')){note(s,L`${targetId}已经是剧毒，仍保持剧毒`);emit(s,{type:'status',target:targetId,status:'tox',change:'unchanged'});return;}
  const had=hasStatus(t,kind),interval=STATUS_INTERVAL[kind];
  if(kind==='slp'&&t.asleep){t.asleep=false;t.wakeSkip=false;note(s,L`${targetId}出生时的睡眠转为招式造成的睡眠状态`);emit(s,{type:'sleepConverted',unit:targetId});}
  if(kind==='frz'&&dropStatus(t,'brn'))note(s,L`${targetId}的灼伤被冰冻顶掉`);
  if(kind==='brn'&&dropStatus(t,'frz'))note(s,L`${targetId}的冰冻被灼伤顶掉`);
  if(kind==='tox'&&dropStatus(t,'psn'))note(s,L`${targetId}的中毒被剧毒顶掉`);
  if(interval!==undefined){
    if(had){emit(s,{type:'status',target:targetId,status:kind,change:'unchanged'});return;}
    (t.status??={})[kind]={tick:1};
  }else{
    const range=STATUS_DURATION[kind];
    (t.status??={})[kind]={left:range?battleInt(s,range[0],range[1]):STATUS_DEFAULT_LEFT};
  }
  note(s,L`${targetId}${had?'的':'陷入'}${name}${had?'持续时间重新计算':'状态'}`);
  emit(s,{type:'status',target:targetId,status:kind,change:had?'refresh':'apply'});
}
function speciesTypes(u:Unit):readonly string[]{return u.species?speciesOf(u.species)?.types??[]:[];}
/** Which types a status cannot be inflicted on (G5.13), which move ids have a type that cannot be hit by them, and which type shrugs off powder moves. The move texts read these tables. */
export const STATUS_IMMUNE_TYPES:Partial<Record<StatusId,readonly string[]>>={psn:['poison','steel'],tox:['poison','steel'],brn:['fire'],frz:['ice'],par:['electric']};
export const POWDER_IMMUNE_TYPES:readonly string[]=['grass'];
export const MOVE_IMMUNE_TYPES:Record<string,readonly string[]>={thunderwave:['ground']};
/** Every type (lower case) that takes no effect from this move's `status` (including powder and move-specific immunity). */
export function statusImmuneTypes(moveId:string,status:StatusId):string[] {
  return [...new Set([...(STATUS_IMMUNE_TYPES[status]??[]),...(moveEffects(moveId)?.powder?POWDER_IMMUNE_TYPES:[]),...(MOVE_IMMUNE_TYPES[moveId]??[])])];
}
function statusTypeBlockReason(moveId:string,target:Unit,status:StatusId):string|null {
  const types=speciesTypes(target).map(t=>t.toLowerCase());
  if(types.some(t=>STATUS_IMMUNE_TYPES[status]?.includes(t)))return '属性免疫'+STATUS_NAMES[status];
  if(moveEffects(moveId)?.powder&&types.some(t=>POWDER_IMMUNE_TYPES.includes(t)))return '草系免疫粉末招式';
  const moveImmune=types.find(t=>MOVE_IMMUNE_TYPES[moveId]?.includes(t));
  if(moveImmune){const zh=(names as unknown as {types:Record<string,string>}).types,typeName=Object.entries(zh).find(([k])=>k.toLowerCase()===moveImmune)?.[1]??moveImmune;return typeName+'系免疫'+(SKILL_CN[moveId as Skill]??moveId);}
  return null;
}
function statusMoveBlockReason(moveId:string,target:Unit,status:StatusId):string|null {
  if(status==='slp'&&(hasStatus(target,'slp')||hasStatus(target,'nap')))return '已经睡眠或打盹';
  return statusTypeBlockReason(moveId,target,status);
}
function noEffectReason(moveId:string,target:Unit,spec:MoveSpec):string|null {
  if((spec.effects.includes('damage')||moveId==='snore')&&typeEffectiveness(moveId,speciesTypes(target))===0)return '属性相性为零';
  if(!spec.effects.includes('damage')){
    const statuses=spec.effects.filter(e=>e.startsWith('status:')).map(e=>e.slice(7) as StatusId);
    if(statuses.length&&statuses.every(status=>!!statusMoveBlockReason(moveId,target,status)))return statusMoveBlockReason(moveId,target,statuses[0]!)??'状态无效';
  }
  return null;
}
/** Removes the listed conditions; returns the ones that were present. */
function cureStatuses(s:World,u:Unit,kinds:readonly StatusId[]):StatusId[] {
  const cured=kinds.filter(k=>dropStatus(u,k));
  for(const k of cured)emit(s,{type:'status',target:u.id,status:k,change:'cure'});
  return cured;
}
/** End of one of the unit's own action opportunities: action-counted conditions advance once per turn. */
function endOwnTurn(s:World,id:string):void {
  const u=s.units[id];if(!alive(u)||!u.status)return;
  for(const k of ['slp','nap','par','frz','confusion','flinch'] as const){
    const st=u.status?.[k];if(!st)continue;
    if(st.fresh){delete st.fresh;continue;}
    st.left=(st.left??1)-1;
    if(st.left<=0){
      dropStatus(u,k);note(s,L`${id}的${STATUS_NAMES[k]}解除`);emit(s,{type:'status',target:id,status:k,change:'expire'});
      if(k==='nap'){
        const before=u.hp;u.hp=u.maxHp;
        const cured=cureStatuses(s,u,Object.keys(u.status??{}) as StatusId[]);
        note(s,L`${id}打盹结束，HP ${before}→${u.hp}，异常状态全部解除${cured.length?'：'+cured.map(v=>STATUS_NAMES[v]).join('、'):''}`);
      }
    }
  }
}
/** Round end: poison, bad poison and burn tick (first damage at the first round end after being applied, then every 20 / 2 / 20 rounds). */
function statusRoundEnd(s:World):void {
  for(const id of [...s.queue,...s.enemies]){
    for(const k of ['psn','tox','brn'] as const){
      const u=s.units[id],st=u?.status?.[k];if(!alive(u)||!st)continue;
      st.tick=(st.tick??1)-1;if(st.tick>0)continue;
      st.tick=STATUS_INTERVAL[k]!;
      const amount=Math.max(1,Math.floor(u.maxHp/STATUS_DAMAGE_DIVISOR[k]));
      emit(s,{type:'statusDamage',target:id,status:k,amount:hit(s,id,amount,STATUS_NAMES[k])});
    }
  }
}
/** Cells in sight of any living party member. This is separate from enemy/ally AI sight. */
export function playerVisibleCells(s:World):Set<string> {
  const visible=new Set<string>();
  const mark=(x:number,y:number)=>{
    if(!s.dungeon||(x>=0&&y>=0&&x<s.dungeon.width&&y<s.dungeon.height))visible.add(`${x},${y}`);
  };
  for(const id of s.queue){
    const unit=s.units[id];
    if(!alive(unit))continue;
    const room=roomAt(s,unit.pos);
    if(room){
      for(let y=room.y-1;y<=room.y+room.h;y++)for(let x=room.x-1;x<=room.x+room.w;x++)mark(x,y);
    }else{
      mark(unit.pos.x,unit.pos.y);
      for(const dir of DIRS8)mark(unit.pos.x+dir.x,unit.pos.y+dir.y);
    }
  }
  return visible;
}
/** Keep explored ground separate from explored walls/liquid for movement and legacy saves. */
export function reveal(s:World):void {
  const seen=new Set(s.seen),walls=new Set(s.seenWalls??[]),floor=new Set(s.floor.map(key));
  if(s.dungeon){
    for(const cell of playerVisibleCells(s))(floor.has(cell)?seen:walls).add(cell);
  }else{
    // Fixed single-floor developer scenarios keep the original trial sight.
    const mark=(p:Pos)=>(floor.has(key(p))?seen:walls).add(key(p));
    for(const id of s.queue){
      const u=s.units[id];if(!alive(u))continue;
      seen.add(key(u.pos));
      const room=roomAt(s,u.pos);
      for(const d of DIRS){
        let p=u.pos;
        for(let n=0;n<4;n++){
          p=plus(p,d);
          if(room){if(!floor.has(key(p)))break;seen.add(key(p));}
          else {mark(p);mark({x:p.x-d.y,y:p.y+d.x});mark({x:p.x+d.y,y:p.y-d.x});if(!floor.has(key(p)))break;}
        }
      }
      if(room)for(let y=room.y;y<room.y+room.h;y++)for(let x=room.x;x<room.x+room.w;x++)if(floor.has(x+','+y))seen.add(x+','+y);
    }
  }
  s.seen=[...seen].sort();if(walls.size)s.seenWalls=[...walls].sort();
}
/** BFS insertion order is also the right/down/left/up final tie break. */
function paths(s:World,start:Pos,blocked:boolean):Map<string,{p:Pos;len:number;first:Pos}> {
  const result=new Map<string,{p:Pos;len:number;first:Pos}>();const seen=new Set(s.seen);
  // Query-local indexes: callers may edit fixture arrays or move units between searches.
  // Keep BFS insertion order intact; only replace repeated membership scans.
  const floor=new Set(s.floor.map(key)),occupiedCells=blocked?new Set(active(s).map(u=>key(u.pos!))):null;
  result.set(key(start),{p:start,len:0,first:start});const q=[start];
  for(let i=0;i<q.length;i++){const cur=result.get(key(q[i]))!;
    for(const d of DIRS8){const p=plus(cur.p,d),k=key(p);if(!floor.has(k)||!seen.has(k)||result.has(k)||occupiedCells?.has(k)||!floorStepOk(floor,cur.p,p))continue;
      result.set(k,{p,len:cur.len+1,first:cur.len===0?p:cur.first});q.push(p);}}
  return result;
}
function defaultAction(s:World,id:string,blockingGuard:ReadonlySet<string>=new Set(),createdGuard:ReadonlySet<string>=new Set()):Action {
  return chooseAllyAction(s,id,blockingGuard,createdGuard);
}
function clearRay(s:World,a:Pos,b:Pos,range:number):boolean {
  const dx=b.x-a.x,dy=b.y-a.y,n=Math.max(Math.abs(dx),Math.abs(dy));
  if(n<1||n>range||(dx!==0&&dy!==0&&Math.abs(dx)!==Math.abs(dy)))return false;
  const d={x:Math.sign(dx),y:Math.sign(dy)};let p=a;
  for(let i=1;i<=n;i++){const next=plus(p,d);if(!stepOk(s,p,next)||(i<n&&(!walk(s,next)||occupied(s,next))))return false;p=next;}
  return true;
}
/** Names the first reason a straight-line move cannot reach its target. */
function rayProblem(s:World,a:Pos,b:Pos,range:number):string|null {
  const dx=b.x-a.x,dy=b.y-a.y,n=Math.max(Math.abs(dx),Math.abs(dy));
  if(dx!==0&&dy!==0&&Math.abs(dx)!==Math.abs(dy))return '招式只能指定同排、同列或正斜线上的目标';
  if(n<1)return '招式不能指定自己所在的格';
  if(n>range)return `目标相距${n}格，超出招式射程${range}格`;
  const d={x:Math.sign(dx),y:Math.sign(dy)};let p=a;
  for(let i=1;i<=n;i++){const next=plus(p,d),corners=cornerBlockers(s,p,next);
    if(corners.length)return `射线斜向穿过墙角，${corners.map(c=>`(${c.x},${c.y})`).join('、')}是墙或第二地形`;
    if(i<n){if(!walk(s,next))return `射线在(${next.x},${next.y})被墙挡住`;const blocker=active(s).find(v=>same(v.pos,next));if(blocker)return `射线被${blocker.id}挡住`;}
    p=next;}
  return null;
}
const inRect=(p:Pos,r:Rect)=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h;
function inRoomReach(s:World,actor:Pos,target:Pos):boolean {
  const room=(s.rooms??[]).find(r=>inRect(actor,r));
  return room?inRect(target,room):chebyshev(actor,target)<=2;
}
function targetKindMatches(s:World,actorId:string,target:Unit,spec:MoveSpec):boolean {
  const actor=s.units[actorId];if(!actor)return false;
  const allies=actor.side==='friend'?s.queue:s.enemies,opponents=actor.side==='friend'?s.enemies:s.queue;
  switch(spec.target){
    case 'enemy':return target.side!==actor.side&&opponents.includes(target.id);
    case 'user':return target.id===actorId;
    case 'teammates':return target.id!==actorId&&target.side===actor.side&&allies.includes(target.id);
    case 'party':return target.side===actor.side&&allies.includes(target.id);
    case 'all':return allies.includes(target.id)||opponents.includes(target.id);
  }
}
/** Units affected by a move's geometry and target category, before special use restrictions. */
function moveTargetsInReach(s:World,actorId:string,spec:MoveSpec):Unit[] {
  const actor=s.units[actorId];if(!alive(actor))return [];
  if(spec.range==='user')return targetKindMatches(s,actorId,actor,spec)?[actor]:[];
  const candidates=active(s).filter(t=>targetKindMatches(s,actorId,t,spec));
  if(spec.range==='room')return candidates.filter(t=>inRoomReach(s,actor.pos,t.pos!));
  if(spec.range==='around')return candidates.filter(t=>t.id!==actorId&&adjacent(s,actor.pos,t.pos!));
  return candidates.filter(t=>{
    switch(spec.range){
      case 'front':return adjacent(s,actor.pos,t.pos!);
      case 'front2':return clearRay(s,actor.pos,t.pos!,2);
      case 'line10':return clearRay(s,actor.pos,t.pos!,10);
      default:return false;
    }
  });
}
/** Boss species that cannot be blown away (BOSS_CONFIG); the move texts name them. */
export const BLOWAWAY_IMMUNE_BOSSES:string[]=Object.entries(BOSS_CONFIG).filter(([,c])=>c.canBeBlownAway===false).map(([k])=>k);
function bossCanBeBlownAway(target:Unit):boolean {
  return !target.boss||BOSS_CONFIG[target.species??'']?.canBeBlownAway!==false;
}
function rejectedForBoss(spec:MoveSpec,target:Unit):boolean {
  return !!target.boss&&!bossCanBeBlownAway(target)&&spec.effects.includes('blowaway')&&!spec.effects.includes('damage');
}
const isProtectionMove=(spec:MoveSpec)=>spec.effects.includes('protect')||spec.effects.includes('quickguard');
const isProtectionMoveId=(move:string|null)=>move==='protect'||move==='quickguard';
/** Legal command targets for UI highlighting. User/room moves use the actor id in Action.target by contract. */
export function skillTargets(s:World,actorId:string,skill:Skill):string[] {
  const actor=s.units[actorId],spec=moveOf(skill);
  if(!alive(actor)||!spec||!actor.learned.includes(skill)||(actor.pp[skill]??0)<1)return [];
  if(isProtectionMove(spec)&&isProtectionMoveId(actor.lastMove))return [];
  const affected=moveTargetsInReach(s,actorId,spec);
  if(spec.range==='user')return affected.length?[actorId]:[];
  if(spec.range==='room')return affected.length?[actorId]:[];
  return affected.filter(t=>!!t.pos&&s.seen.includes(key(t.pos))&&!rejectedForBoss(spec,t)).map(t=>t.id);
}
function moveRangeProblem(s:World,actor:Unit,target:Unit,spec:MoveSpec):string {
  switch(spec.range){
    case 'front':return chebyshev(actor.pos!,target.pos!)===1?`斜向相邻，但(${actor.pos!.x},${actor.pos!.y})到(${target.pos!.x},${target.pos!.y})会穿过墙角，不能攻击`:'目标不在八个相邻格内';
    case 'front2':return rayProblem(s,actor.pos!,target.pos!,2)??'目标不在两格直线射程内';
    case 'line10':return rayProblem(s,actor.pos!,target.pos!,10)??'目标不在直线射程内';
    case 'around':return '目标不在使用者周围八格内';
    case 'room':return '目标不在同一房间或走廊范围内';
    case 'user':return '招式只能指定使用者自己';
  }
}
const sideIds=(s:World,side:Unit['side'])=>side==='friend'?s.queue:s.enemies;
const opponentIds=(s:World,side:Unit['side'])=>side==='friend'?s.enemies:s.queue;
function roomAt(s:World,p:Pos):Rect|undefined{return (s.rooms??[]).find(r=>inRect(p,r));}
const hashText=(text:string):number=>{let h=0x811C9DC5;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),0x01000193);return h>>>0;};
const COMMISSION_STREAM=0x6A09E667;
function choiceRandom(s:World,purpose:string,room:number|null=null,salt=''):()=>number {
  const seed=s.dungeon?.seed??hashText(s.runId),level=s.dungeon?.level??0,roomTag=room===null?0:room+1;
  return mulberry32((Math.imul(seed>>>0,0x9E3779B1)^Math.imul(level,0x85EBCA6B)^Math.imul(roomTag,0xC2B2AE35)^COMMISSION_STREAM^hashText(`${purpose}:${salt}`))>>>0);
}
function sampleWithoutReplacement<T>(items:readonly T[],count:number,random:()=>number):T[] {
  const pool=[...items],out:T[]=[];while(out.length<count&&pool.length){const i=Math.floor(random()*pool.length);out.push(pool.splice(i,1)[0]);}return out;
}
function currentFloorLevel(s:World):number{return s.dungeon?.level??1;}
function scoutTargetExists(s:World,fromRoom:number):boolean {
  const target=COMMISSIONS.scout.requiresRoomTypes??['blessing','item'];
  return (s.adventureRooms??[]).some(r=>r.room!==fromRoom&&target.includes(r.type));
}
function commissionChoicesForRoom(s:World,room:AdventureRoom):CommissionId[] {
  const level=currentFloorLevel(s),hasDown=s.points.some(p=>p.kind==='down');
  return (Object.keys(COMMISSIONS) as CommissionId[]).filter(id=>{
    const def=COMMISSIONS[id];if(!def.floors.includes(level))return false;
    if((id==='guardian'||id==='speedrun'||id==='scout')&&!hasDown)return false;
    if(id==='scout'&&!scoutTargetExists(s,room.room))return false;
    return true;
  });
}
function commissionOffer(s:World,room:AdventureRoom):CommissionId|null {
  const available=commissionChoicesForRoom(s,room);if(!available.length)return null;
  const random=choiceRandom(s,'commission',room.room);return available[Math.floor(random()*available.length)];
}
function eligibleBlessings(s:World):BlessingId[] {
  const level=currentFloorLevel(s),owned=new Set(s.blessings??[]);
  return (Object.keys(BLESSINGS) as BlessingId[]).filter(id=>BLESSINGS[id].floors.includes(level)&&!owned.has(id));
}
/** Three slots, each: draw a rarity by weight (common 60, rare 30, epic 10) among the rarities that still have a pick left, then one blessing of that rarity
 *  with equal chance. A rarity with nothing left drops out and the weights of the others apply as they are. Fewer than three picks: as many as exist.
 *  `fallback` (a refresh: the options shown before) fills the slots the main pool could not, by the same rule and the same random stream (D-20261109-08). */
export function drawBlessings(available:readonly BlessingId[],random:()=>number,count=3,fallback:readonly BlessingId[]=[]):BlessingId[] {
  const out:BlessingId[]=[];
  for(const source of [available,fallback]){
    const pools=new Map<BlessingRarity,BlessingId[]>(BLESSING_RARITY.order.map(r=>[r,source.filter(id=>BLESSINGS[id].rarity===r&&!out.includes(id))]));
    while(out.length<count){
      const open=BLESSING_RARITY.order.filter(r=>pools.get(r)!.length>0);if(!open.length)break;
      const total=open.reduce((n,r)=>n+BLESSING_RARITY.weights[r],0);let roll=random()*total,tier=open[open.length-1];
      for(const r of open){if(roll<BLESSING_RARITY.weights[r]){tier=r;break;}roll-=BLESSING_RARITY.weights[r];}
      const pool=pools.get(tier)!;out.push(pool.splice(Math.floor(random()*pool.length),1)[0]);
    }
  }
  return out;
}
/** `previous`: the options of a refreshed choice; they are left out of the draw and only fill what the rest of the pool cannot (D-20261109-08). */
function blessingOffer(s:World,source:'room'|'challenge',room:number|null,salt='',previous:readonly BlessingId[]=[]):BlessingId[] {
  const eligible=eligibleBlessings(s),fresh=eligible.filter(id=>!previous.includes(id));
  return drawBlessings(fresh,choiceRandom(s,`blessing:${source}`,room,salt),3,eligible.filter(id=>previous.includes(id)));
}
function queueBlessingChoice(s:World,source:'room'|'challenge',room:number|null):boolean {
  const options=blessingOffer(s,source,room);if(!options.length)return false;
  (s.pendingChoices??=[]).push({type:'blessing',source,room,options});return true;
}
function shortestFloorDistance(s:World,start:Pos,goal:Pos):number|null {
  const floor=new Set(s.floor.map(key)),depth=new Map<string,number>([[key(start),0]]),queue=[start];
  for(let i=0;i<queue.length;i++){
    const p=queue[i],n=depth.get(key(p))!;if(same(p,goal))return n;
    for(const d of DIRS8){const next=plus(p,d),k=key(next);if(floor.has(k)&&!depth.has(k)&&floorStepOk(floor,p,next)){depth.set(k,n+1);queue.push(next);}}   // 8.8: eight directions, no corner cutting
  }
  return null;
}
function speedLimitFor(s:World,room:AdventureRoom):number|null {
  const down=s.points.find(p=>p.kind==='down'),distance=down?shortestFloorDistance(s,room.interaction,down.pos):null;
  return distance===null?null:Math.ceil(distance*(COMMISSIONS.speedrun.speedMultiplier??2.5));
}
function tmChoiceOptions(s:World,source:Extract<PendingChoice,{type:'tmChoice'}>['source'],room:number|null,salt=''):string[] {
  const count=BLESSINGS.tmChoice.choiceCount??3,pool=tmPool(s.dungeon),random=choiceRandom(s,`tm:${source}`,room,salt);
  return sampleWithoutReplacement([...new Set(pool)],Math.min(count,new Set(pool).size),random);
}
function addPendingTmChoice(s:World,source:'target'|'challenge'|'boss'|'blessing',room:number|null,salt=''):boolean {
  const options=tmChoiceOptions(s,source,room,salt);if(!options.length)return false;
  (s.pendingChoices??=[]).push({type:'tmChoice',source,options});return true;
}
function setPendingChoicePhase(s:World):boolean {
  const next=s.pendingChoices?.[0];if(!next)return false;
  s.phase=next.type==='tmChoice'?'tmChoice':next.type;return true;
}
function queueTmItem(s:World,move:string,source:TmItem['source']):void {
  (s.tms??=[]).push({move,source,fate:'held'});
}
function activeCommission(s:World,id:CommissionId):ActiveCommission|undefined{return s.commissions?.find(c=>c.id===id);}
function commissionRewardExp(c:ActiveCommission):number {
  const midpoint=({1:5.5,2:9.5,3:16} as Record<number,number>)[c.floor]??5.5;
  return Math.round(COMMISSIONS[c.id].equivalentEnemies*PROG.expMultiplier*midpoint);
}
function finishCommission(s:World,c:ActiveCommission):void {
  s.commissions=(s.commissions??[]).filter(v=>v!==c);
  if(s.completedCommissions!==undefined)s.completedCommissions++;
  const exp=hasBless(s,'scholar')?Math.round(commissionRewardExp(c)*1.15):commissionRewardExp(c);if(s.prog)s.prog.exp+=exp;
  note(s,L`${COMMISSIONS[c.id].name}委托完成，队伍经验+${exp}`);
}
function failCommission(s:World,c:ActiveCommission,reason:string):void {
  s.commissions=(s.commissions??[]).filter(v=>v!==c);
  note(s,L`${COMMISSIONS[c.id].name}委托失败（${reason}），负面效果解除`);
}
function progressCommission(s:World,id:CommissionId,amount=1):void {
  for(const c of [...(s.commissions??[])].filter(v=>v.id===id)){
    c.progress=Math.min(c.progressTarget,c.progress+amount);
    if(c.progress>=c.progressTarget)finishCommission(s,c);
    else note(s,L`${COMMISSIONS[id].name}委托进度${c.progress}/${c.progressTarget}`);
  }
}
function onRoomEntry(s:World,from:Pos,to:Pos):void {
  const room=roomAt(s,to);if(!room||inRect(from,room))return;
  const roomIndex=s.rooms?.indexOf(room)??-1;
  const target=COMMISSIONS.scout.requiresRoomTypes??['blessing','item'];
  const adventure=(s.adventureRooms??[]).find(r=>r.room===roomIndex&&target.includes(r.type));
  if(!adventure)return;
  for(const c of s.commissions??[])if(c.id==='scout'&&c.progress===0){c.progress=1;note(s,L`探路委托已发现本层目标房`);}
}
function applyBlessing(s:World,id:BlessingId):void {
  const def=BLESSINGS[id];(s.blessings??=[]).push(id);
  if(def.effect==='battleSpirit')for(const member of s.queue)if(alive(s.units[member]))changeStage(s,member,'atk',def.attackStage??1);
  note(s,L`获得祝福：${def.name}`);
  if(def.effect==='tmChoice'){if(addPendingTmChoice(s,'blessing',s.dungeon?.level??null,'blessing'))note(s,L`${def.name}：立即从${def.choiceCount??3}张招式机里选一张`);else note(s,L`${def.name}：没有可选的招式机`);}
}
function updateLevelsAfterCommissionReward(s:World):boolean {
  const p=s.prog;if(!p)return false;let changed=false;const before=p.level;
  while(p.level<PROG.maxLevel&&p.exp>=PROG.thresholds[p.level+1]){p.level++;changed=true;refreshPartyLevel(s);note(s,L`升到 Lv${p.level}`);}
  if(!changed)return false;
  queueLevelUpMoves(s,before,p.level);s.pendingEvolutions=undefined;
  note(s,L`委托经验使队伍成长`);advanceAfterLevelGrowth(s);return true;
}

function adventureAt(s:World,p:Pos):AdventureRoom|undefined{return s.adventureRooms?.find(r=>same(r.interaction,p));}
/** Current sight is recomputed from the unit's position; `seen` remains only the player's remembered map. */
export function currentlyVisible(s:World,from:Pos,to:Pos):boolean {
  const room=roomAt(s,from);
  if(room){
    if(inRect(to,room))return true;
    for(let y=room.y;y<room.y+room.h;y++)for(let x=room.x;x<room.x+room.w;x++){
      if(x!==room.x&&x!==room.x+room.w-1&&y!==room.y&&y!==room.y+room.h-1)continue;
      const edge={x,y};if(DIRS.some(d=>same(plus(edge,d),to)&&walk(s,to)))return true;
    }
    return false;
  }
  const q:[Pos,number][]=[[from,0]],seen=new Set([key(from)]);
  for(let i=0;i<q.length;i++){
    const [p,n]=q[i];if(same(p,to))return true;if(n===2)continue;
    for(const d of DIRS){const next=plus(p,d),k=key(next);if(walk(s,next)&&!seen.has(k)){seen.add(k);q.push([next,n+1]);}}
  }
  return false;
}
function firstStepTo(s:World,start:Pos,target:Pos,seenOnly:boolean):Pos|null {
  if(same(start,target))return null;
  const q:{p:Pos;first:Pos|null}[]=[{p:start,first:null}],seen=new Set([key(start)]);
  const floor=new Set(s.floor.map(key)),known=seenOnly?new Set(s.seen):null,occupiedCells=new Set(active(s).map(u=>key(u.pos!)));
  for(let i=0;i<q.length;i++){
    const cur=q[i];for(const d of DIRS8){const p=plus(cur.p,d),k=key(p);if(!floor.has(k)||seen.has(k)||(known&&!known.has(k))||!floorStepOk(floor,cur.p,p))continue;
      const first=cur.first??p;if(same(p,target))return first;
      if(occupiedCells.has(k))continue;seen.add(k);q.push({p,first});
    }
  }
  return null;
}
function towardLeader(s:World,id:string,avoid:Pos[]=[]):Action {
  const u=s.units[id],lead=s.units[s.leader];if(!alive(u)||!alive(lead)||id===s.leader)return {type:'wait'};
  const terrain=paths(s,lead.pos,false),current=terrain.get(key(u.pos))?.len;if(current===undefined)return {type:'wait'};
  let best:{p:Pos;len:number}|undefined;
  for(const d of DIRS8){const p=plus(u.pos,d),k=key(p),td=terrain.get(k)?.len;
    if(td===undefined||td>=current||occupied(s,p)||!stepOk(s,u.pos,p)||avoid.some(o=>chebyshev(o,p)<=1))continue;
    const len=chebyshev(u.pos,p);if(!best||td<best.len)best={p,len:td};
  }
  return best?{type:'move',to:best.p}:{type:'wait'};
}
function attackableTargets(s:World,id:string,spec:MoveSpec):Unit[] {
  return moveTargetsInReach(s,id,spec).filter(t=>alive(t)&&t.side!==s.units[id].side);
}
/** Playtest round 2: "together" and "no moves" members fight what the member or the leader can see within this many cells of the leader. */
export const TOGETHER_ZONE=6;
function inLeaderZone(s:World,actor:Unit,anchorPos:Pos,target:Unit):boolean {
  return chebyshev(anchorPos,target.pos!)<=TOGETHER_ZONE&&(currentlyVisible(s,actor.pos!,target.pos!)||currentlyVisible(s,anchorPos,target.pos!));
}
function tacticalTargetAllowed(s:World,actor:Unit,target:Unit,tactic:Tactic):boolean {
  if(tactic==='avoid')return false;
  if(tactic==='followme')return chebyshev(actor.pos!,target.pos!)===1;
  if(tactic==='together'||tactic==='nomoves'){
    // The leader may already have fallen during this phase: fall back to the first living queue member, then to no restriction.
    const anchor=alive(s.units[s.leader])?s.units[s.leader]:s.queue.map(i=>s.units[i]).find(alive);
    const anchorPos=anchor?.pos;
    return chebyshev(actor.pos!,target.pos!)===1||!anchorPos||inLeaderZone(s,actor,anchorPos,target);
  }
  return true;
}
type ScoredAction={action:Action;score:number;pp:number;moveIndex:number;distance:number;targetIndex:number};
function blowawayCollision(s:World,actor:Unit,target:Unit):'wall'|'opponent'|'friend'|null {
  if(!bossCanBeBlownAway(target)||!alive(actor)||!alive(target))return null;
  const delta={x:Math.sign(target.pos.x-actor.pos.x),y:Math.sign(target.pos.y-actor.pos.y)};let at=target.pos;
  for(let i=0;i<10;i++){const next=plus(at,delta);if(!walk(s,next)||!stepOk(s,at,next))return 'wall';
    const blocker=active(s).find(u=>u.id!==target.id&&same(u.pos,next));if(blocker)return blocker.side===actor.side?'friend':'opponent';at=next;}
  return null;
}
function pickDamageAction(s:World,id:string,tactic:Tactic,quickguard:ReadonlySet<string>,visibleOnly?:ReadonlySet<string>):Action|null {
  const actor=s.units[id];if(!alive(actor)||tactic==='avoid')return null;
  const candidates:ScoredAction[]=[];const opponents=opponentIds(s,actor.side);
  actor.learned.forEach((move,moveIndex)=>{
    const spec=moveOf(move),pp=actor.pp[move]??0;if(!spec||pp<1||['rest','snore','sleeptalk'].includes(move)||(!spec.effects.includes('damage')&&!spec.effects.includes('blowaway'))||isProtectionMove(spec)&&isProtectionMoveId(actor.lastMove))return;
    const targets=attackableTargets(s,id,spec);
    for(const target of targets){
      if(visibleOnly&&!visibleOnly.has(target.id))continue;
      if(!tacticalTargetAllowed(s,actor,target,tactic)||rejectedForBoss(spec,target))continue;
      if(spec.effects.includes('damage')&&typeEffectiveness(move,speciesTypes(target))===0)continue;
      const dist=chebyshev(actor.pos!,target.pos!);
      let score=0;
      if(spec.effects.includes('damage')&&spec.power!==null){
        score+=estimateAttackDamage(s,id,target.id,move,quickguard)*hitChance(s,id,target.id,move)/100;
      }
      if(spec.effects.includes('blowaway')){
        const collision=blowawayCollision(s,actor,target);
        if(collision==='friend')continue;
        if(collision==='wall'||collision==='opponent')score+=5;
      }
      if(spec.effects.includes('drain')&&actor.hp<actor.maxHp/2)score*=2;
      if(score<=0)continue;
      const commandTarget=spec.range==='room'||spec.range==='user'?id:target.id;
      candidates.push({action:{type:'skill',skill:move,target:commandTarget},score,pp,moveIndex,distance:dist,targetIndex:opponents.indexOf(target.id)});
    }
  });
  candidates.sort((a,b)=>b.score-a.score||b.pp-a.pp||a.moveIndex-b.moveIndex||a.distance-b.distance||a.targetIndex-b.targetIndex);
  return candidates[0]?.action??null;
}
function canMoveRepeatedGuard(actor:Unit,skill:string):boolean{return !isProtectionMoveId(actor.lastMove)||!isProtectionMoveId(skill);}
function legalSupportTarget(s:World,id:string,skill:string):boolean {
  const u=s.units[id];if(!u||!u.learned.includes(skill)||(u.pp[skill]??0)<1||!canMoveRepeatedGuard(u,skill))return false;
  const spec=moveOf(skill);return !!spec&&moveTargetsInReach(s,id,spec).length>0;
}
function threatenedByOpponent(s:World,id:string,quickguard:ReadonlySet<string>,rangedOnly=false):boolean {
  const target=s.units[id];if(!alive(target))return false;
  for(const sourceId of opponentIds(s,target.side)){
    const source=s.units[sourceId];if(!alive(source)||source.asleep||source.wakeSkip||source.waitOnly||!currentlyVisible(s,source.pos,target.pos))continue;
    for(const move of source.learned){const spec=moveOf(move);if(!spec||!spec.effects.includes('damage')||(source.pp[move]??0)<1||rangedOnly&&chebyshev(source.pos,target.pos)<=1)continue;
      if(target.protect>0||quickguard.has(id)&&chebyshev(source.pos,target.pos)>1)continue;
      if(moveTargetsInReach(s,sourceId,spec).some(t=>t.id===id))return true;
    }
  }
  return false;
}
function sameRoomUnits(s:World,id:string):Unit[] {
  const actor=s.units[id];if(!alive(actor))return [];
  const room=roomAt(s,actor.pos);if(!room)return [];
  return sideIds(s,actor.side).map(i=>s.units[i]).filter(u=>alive(u)&&inRect(u.pos!,room));
}
/** Preparation moves only pay off in a fight: an opponent must be in the unit's sight (or among the opponents its tactic already sees). */
function opponentInSight(s:World,actor:Unit,visibleOnly?:ReadonlySet<string>):boolean{
  return opponentIds(s,actor.side).some(i=>{const t=s.units[i];return alive(t)&&(visibleOnly?visibleOnly.has(i):currentlyVisible(s,actor.pos!,t.pos!));});
}
function supportAction(s:World,id:string,quickguard:ReadonlySet<string>,tactic:Tactic='together',visibleOnly?:ReadonlySet<string>):Action|null {
  const actor=s.units[id];if(!alive(actor))return null;
  const fight=opponentInSight(s,actor,visibleOnly);   // self-raising, Defense Curl family, Helping Hand and screens only pay off with an opponent in sight
  // 8.9a: the caller has already preferred any usable damage combination.
  for(const kind of ['status','foeStages','heal','selfStages'] as const){
    for(const skill of actor.learned){
      if(!legalSupportTarget(s,id,skill))continue;
      const spec=moveOf(skill)!;
      if(spec.effects.includes('damage')||spec.effects.includes('blowaway'))continue;
      const stages=spec.effects.map(stageEffect).filter(v=>v!==null);
      if(kind==='status'||kind==='foeStages'){
        if(tactic==='avoid'||spec.target!=='enemy')continue;
        const status=spec.effects.find(e=>e.startsWith('status:'))?.slice(7) as StatusId|undefined;
        if(kind==='status'?!status:!stages.some(e=>e.change<0))continue;
        const target=moveTargetsInReach(s,id,spec).find(t=>
          (!visibleOnly||visibleOnly.has(t.id))&&tacticalTargetAllowed(s,actor,t,tactic)&&!effectBlocked(s,actor,t,quickguard)&&
          (kind==='status'?(!hasStatus(t,status!)&&!(status==='psn'&&hasStatus(t,'tox'))&&!statusMoveBlockReason(skill,t,status!)&&(status!=='slp'||!t.asleep)):stages.some(e=>e.change<0&&stageOf(t,e.stat)>-3)));
        if(target)return {type:'skill',skill,target:spec.range==='room'||spec.range==='user'?id:target.id};
      }else if(kind==='heal'){
        if(spec.effects.includes('heal:1:2')&&actor.hp<actor.maxHp/2)return {type:'skill',skill,target:id};
        if(skill==='rest'&&(actor.hp<actor.maxHp/2||!!actor.status&&Object.keys(actor.status).some(k=>k!=='nap')))return {type:'skill',skill,target:id};
      }else if(spec.target==='user'&&!['defensecurl','harden'].includes(skill)&&stages.some(e=>e.change>0&&stageOf(actor,e.stat)<3)&&fight){
        return {type:'skill',skill,target:id};
      }
    }
  }
  if(actor.protect===0&&threatenedByOpponent(s,id,quickguard)&&legalSupportTarget(s,id,'protect'))return {type:'skill',skill:'protect',target:id};
  if(fight&&actor.stages.def<1){const defMove=actor.learned.find(k=>moveOf(k)?.effects.includes('stage:def:+1')&&legalSupportTarget(s,id,k));if(defMove){const spec=moveOf(defMove)!;return {type:'skill',skill:defMove,target:spec.range==='user'||spec.range==='room'?id:moveTargetsInReach(s,id,spec)[0].id};}}
  const helpTargets=moveTargetsInReach(s,id,moveOf('helpinghand')!).filter(u=>u.stages.atk<2);
  if(fight&&helpTargets.length&&legalSupportTarget(s,id,'helpinghand'))return {type:'skill',skill:'helpinghand',target:helpTargets[0].id};
  const allies=sideIds(s,actor.side).filter(i=>alive(s.units[i]));
  if(allies.some(i=>threatenedByOpponent(s,i,quickguard,true))&&legalSupportTarget(s,id,'quickguard'))return {type:'skill',skill:'quickguard',target:id};
  for(const screen of ['reflect','lightscreen'] as const){
    if(fight&&allies.every(i=>(s.units[i][screen]??0)===0)&&legalSupportTarget(s,id,screen))return {type:'skill',skill:screen,target:id};
  }
  return null;
}
function enemyDisruptAction(s:World,id:string,quickguard:ReadonlySet<string>,visibleOnly:ReadonlySet<string>):Action|null {
  const actor=s.units[id];if(!alive(actor))return null;
  for(const kind of ['status','foeStages'] as const)for(const skill of actor.learned){
    if(!legalSupportTarget(s,id,skill))continue;
    const spec=moveOf(skill)!;
    if(spec.target!=='enemy'||spec.effects.includes('damage')||spec.effects.includes('blowaway'))continue;
    const status=spec.effects.find(e=>e.startsWith('status:'))?.slice(7) as StatusId|undefined;
    const stages=spec.effects.map(stageEffect).filter((v):v is {stat:StageKey;change:number}=>v!==null);
    if(kind==='status'?!status:!stages.some(e=>e.change<0))continue;
    const target=moveTargetsInReach(s,id,spec).find(t=>visibleOnly.has(t.id)&&tacticalTargetAllowed(s,actor,t,'gofoes')&&!effectBlocked(s,actor,t,quickguard)&&(kind==='status'?(!hasStatus(t,status!)&&!(status==='psn'&&hasStatus(t,'tox'))&&!statusMoveBlockReason(skill,t,status!)&&(status!=='slp'||!t.asleep)):stages.some(e=>e.change<0&&stageOf(t,e.stat)>-3)));
    if(target)return {type:'skill',skill,target:spec.range==='room'||spec.range==='user'?id:target.id};
  }
  return null;
}
function legalBasicTarget(s:World,id:string,tactic:Tactic,visibleOnly?:ReadonlySet<string>):Unit|undefined {
  const actor=s.units[id];if(!alive(actor))return undefined;
  return opponentIds(s,actor.side).map(i=>s.units[i]).find(t=>alive(t)&&adjacent(s,actor.pos,t.pos)&&(!visibleOnly||visibleOnly.has(t.id))&&tacticalTargetAllowed(s,actor,t,tactic));
}
function chooseAllyAction(s:World,id:string,blockingGuard:ReadonlySet<string>=new Set(),createdGuard:ReadonlySet<string>=new Set()):Action {
  const actor=s.units[id];if(!alive(actor))return {type:'wait'};
  const actorPos=actor.pos;
  const lead=s.units[s.leader];
  if(id!==s.leader&&alive(lead)&&hasStatus(lead,'slp')&&!sleeping(actor)&&!hasStatus(actor,'frz')){
    const item=(s.prog?.items.chestoBerry??0)>0?'chestoBerry':(s.prog?.items.healSeed??0)>0?'healSeed':null;
    if(item){if(adjacent(s,actorPos,lead.pos))return {type:'use',item,target:lead.id};return towardLeader(s,id);}
  }
  const tactic=isTactic(actor.tactic)?actor.tactic:'together';
  const visible=tactic==='gofoes'?new Set(opponentIds(s,actor.side).map(i=>s.units[i]).filter(t=>alive(t)&&currentlyVisible(s,actorPos,t.pos)).map(t=>t.id)):undefined;
  const quickguard=new Set([...blockingGuard,...createdGuard]);
  if(tactic!=='nomoves'){
    const damage=pickDamageAction(s,id,tactic,quickguard,visible);if(damage)return damage;
    const support=supportAction(s,id,quickguard,tactic,visible);if(support)return support;
  }
  const basic=legalBasicTarget(s,id,tactic,visible);if(basic)return {type:'basic',target:basic.id};
  if(tactic==='wait')return {type:'wait'};
  if(tactic==='together'||tactic==='nomoves'){
    // Nothing to attack from here: close in on the nearest opponent the member or the leader can see inside the leader's zone (the same zone tacticalTargetAllowed uses), else rejoin the leader.
    const anchor=alive(s.units[s.leader])?s.units[s.leader]:s.queue.map(i=>s.units[i]).find(alive);
    if(anchor?.pos){
      const target=opponentIds(s,actor.side).map(i=>s.units[i]).filter(t=>alive(t)&&inLeaderZone(s,actor,anchor.pos!,t)).sort((a,b)=>chebyshev(actorPos,a.pos!)-chebyshev(actorPos,b.pos!))[0];
      const step=target?firstStepTo(s,actorPos,target.pos!,true):null;
      if(step&&!occupied(s,step))return {type:'move',to:step};
    }
  }
  if(tactic==='gofoes'&&visible?.size){
    const target=opponentIds(s,actor.side).map(i=>s.units[i]).filter(t=>alive(t)&&visible.has(t.id)).sort((a,b)=>chebyshev(actorPos,a.pos!)-chebyshev(actorPos,b.pos!))[0];
    const step=target?firstStepTo(s,actorPos,target.pos!,true):null;return step?{type:'move',to:step}:{type:'wait'};
  }
  if(tactic==='avoid'){
    const close=opponentIds(s,actor.side).map(i=>s.units[i]).filter(t=>alive(t)&&currentlyVisible(s,actorPos,t.pos!)&&chebyshev(actorPos,t.pos!)<=1);
    if(close.length){
      let best:{p:Pos;distance:number;leaderDistance:number;order:number}|undefined;
      for(const [order,d] of DIRS8.entries()){const p=plus(actorPos,d);if(!walk(s,p)||!s.seen.includes(key(p))||occupied(s,p)||!stepOk(s,actorPos,p))continue;
        const nearest=Math.min(...close.map(t=>chebyshev(t.pos!,p))),current=Math.min(...close.map(t=>chebyshev(t.pos!,actorPos)));
        if(nearest<=current)continue;const ld=alive(s.units[s.leader])?chebyshev(p,s.units[s.leader].pos!):0;
        if(!best||nearest>best.distance||nearest===best.distance&&ld<best.leaderDistance)best={p,distance:nearest,leaderDistance:ld,order};}
      return best?{type:'move',to:best.p}:{type:'wait'};
    }
    const visibleOpp=opponentIds(s,actor.side).map(i=>s.units[i]).filter(t=>alive(t)&&currentlyVisible(s,actorPos,t.pos!)).map(t=>t.pos!);
    return towardLeader(s,id,visibleOpp);
  }
  return towardLeader(s,id);
}
function chooseEnemyAction(s:World,id:string,blockingGuard:ReadonlySet<string>,createdGuard:ReadonlySet<string>):Action {
  const actor=s.units[id];if(!alive(actor)||actor.waitOnly)return {type:'wait'};
  const actorPos=actor.pos;
  const visible=opponentIds(s,actor.side).map(i=>s.units[i]).filter(t=>alive(t)&&currentlyVisible(s,actorPos,t.pos!));
  if(visible.length){
    const visibleIds=new Set(visible.map(t=>t.id));
    const ordered=visible.sort((a,b)=>chebyshev(actorPos,a.pos!)-chebyshev(actorPos,b.pos!)||opponentIds(s,actor.side).indexOf(a.id)-opponentIds(s,actor.side).indexOf(b.id));
    if(!actor.boss)actor.targetMemory=clone(ordered[0].pos!);   // G7.7: a boss remembers only whoever hit it (set when it is hit), never merely the nearest one it sees
    actor.lostSightTurns=0;
    const quickguard=new Set([...blockingGuard,...createdGuard]);
    const damage=pickDamageAction(s,id,'gofoes',quickguard,visibleIds);if(damage)return damage;
    const support=supportAction(s,id,quickguard,'gofoes',visibleIds);if(support)return support;
    const basic=legalBasicTarget(s,id,'gofoes',visibleIds);if(basic)return {type:'basic',target:basic.id};
    const target=ordered[0];
    if(actor.boss)return bossStepToward(s,actor,target.pos!);
    const step=firstStepTo(s,actorPos,target.pos!,false);return step?{type:'move',to:step}:{type:'wait'};
  }
  if(actor.boss){   // D-20261110-07: out of sight, the boss heads for whoever last hit it, inside its room
    if(actor.targetMemory&&!same(actor.pos,actor.targetMemory)){const a=bossStepToward(s,actor,actor.targetMemory);if(a.type==='move')return a;}
    actor.targetMemory=null;return {type:'wait'};
  }
  if(actor.targetMemory){
    actor.lostSightTurns=(actor.lostSightTurns??0)+1;
    if(actor.lostSightTurns>=4||same(actor.pos,actor.targetMemory)){actor.targetMemory=null;actor.lostSightTurns=0;actor.roamTarget=null;}
    else {const step=firstStepTo(s,actorPos,actor.targetMemory,false);return step?{type:'move',to:step}:{type:'wait'};}
  }
  if(actor.post){
    const step=firstStepTo(s,actorPos,actor.post,false);
    return step?{type:'move',to:step}:{type:'wait'};
  }
  return roamAction(s,actor);
}
/** D-20261110-07 (G7.7): a boss that stays in its room moves toward a target but never steps out of the boss room; when the next step would leave it, it waits at the edge. */
function bossStepToward(s:World,actor:Unit,target:Pos):Action {
  const step=firstStepTo(s,actor.pos!,target,false);if(!step)return {type:'wait'};
  if(!bossMayStand(s,actor,step))return {type:'wait'};
  return {type:'move',to:step};
}
/** G7.7: false when the unit is a room-bound boss and `p` lies outside its room. Checked on the final cell, so a confused random step cannot carry the boss out either. */
function bossMayStand(s:World,actor:Unit,p:Pos):boolean {
  const room=s.bossRoom!==undefined?s.rooms?.[s.bossRoom]:undefined,stays=BOSS_CONFIG[actor.species??'']?.staysInRoom!==false;
  return !(actor.boss&&stays&&room)||p.x>=room.x&&p.y>=room.y&&p.x<room.x+room.w&&p.y<room.y+room.h;
}
function randomEnemyAi(s:World):number {
  const state=s.enemyAiRng??streamSeed(s.dungeon?.seed??0,s.dungeon?.level??1,'enemy-ai'),next=rngStep(state);s.enemyAiRng=next.state;return next.value;
}
function roamAction(s:World,actor:Unit):Action {
  if(!alive(actor))return {type:'wait'};
  const room=roomAt(s,actor.pos);
  if(room){
    if(!actor.roamTarget){const exits:Pos[]=[];
      for(let y=room.y;y<room.y+room.h;y++)for(let x=room.x;x<room.x+room.w;x++)for(const d of DIRS){
        const edge={x,y},p=plus(edge,d);if(walk(s,p)&&!inRect(p,room)&&!exits.some(e=>same(e,p)))exits.push(p);}
      if(!exits.length)return {type:'wait'};
      actor.roamTarget=clone(exits[Math.floor(randomEnemyAi(s)*exits.length)]);
    }
    const target=actor.roamTarget,step=firstStepTo(s,actor.pos,target,false);
    if(!step)return {type:'wait'};return {type:'move',to:step};
  }
  const terrainDirs=DIRS.filter(d=>walk(s,plus(actor.pos,d)));if(!terrainDirs.length)return {type:'wait'};
  const direction=actor.direction;let chosen:Pos|undefined;
  if(!direction)chosen=terrainDirs[Math.floor(randomEnemyAi(s)*terrainDirs.length)];
  else{
    const forward=terrainDirs.find(d=>d.x===direction.x&&d.y===direction.y);
    if(forward)chosen=forward;
    else{
      const back={x:-direction.x,y:-direction.y},alternatives=terrainDirs.filter(d=>d.x!==back.x||d.y!==back.y);
      if(alternatives.length)chosen=alternatives[Math.floor(randomEnemyAi(s)*alternatives.length)];
      else chosen=terrainDirs.find(d=>d.x===back.x&&d.y===back.y);
    }
  }
  if(!chosen)return {type:'wait'};
  const target=plus(actor.pos,chosen);if(occupied(s,target))return {type:'wait'};
  return {type:'move',to:target};
}
/** 8.8 (4.2): the living companion standing on `p` when queue member `id` moves there (they swap places); undefined for enemies, other cells or an empty cell. */
function allyAt(s:World,id:string,p:Pos):Unit|undefined {
  if(!s.queue.includes(id))return undefined;
  return s.queue.map(i=>s.units[i]).find(v=>v.id!==id&&alive(v)&&same(v.pos,p));
}
function invalid(s:World,id:string,a:Action,moved:ReadonlySet<string>=new Set()):string|null {
  const u=s.units[id];if(!alive(u))return `${id}已倒下，不能行动`;
  if(a.type==='wait')return null;
  if(a.type==='basicForward')return null;
  if(a.type==='move'){
    const cell=`(${a.to.x},${a.to.y})`;
    if(chebyshev(u.pos,a.to)!==1)return `${id}只能移动到相邻格（含斜向相邻格）`;
    if(!walk(s,a.to))return `目标格${cell}是墙，不能进入`;
    if(!s.seen.includes(key(a.to)))return `目标格${cell}尚未揭示，不能进入`;
    const corners=cornerBlockers(s,u.pos,a.to);
    if(corners.length)return `斜向移动不能穿过墙角：${corners.map(c=>`(${c.x},${c.y})`).join('、')}是墙或第二地形`;
    const blocker=active(s).find(v=>same(v.pos,a.to));
    if(blocker&&allyAt(s,id,a.to))return null; // 8.8 (4.2): walking into a companion swaps places
    if(blocker)return `目标格${cell}被${blocker.id}占据，不能进入`;
    return null;
  }
  if(a.type==='exchange'){
    const point=s.points.find(p=>same(p.pos,u.pos)),ex=s.exchange;
    if(id!==s.leader)return '只有主控能操作交换机';
    if(!ex||!point||point.kind!=='exchange')return '主控必须站在交换机格上';
    if(ex.used)return '交换机本局已经用过，只能用一次';
    const t=s.units[a.target];
    if(!t||!s.queue.includes(t.id)||t.id===s.leader)return '只能送走主控以外的同行伙伴（主控要留下操作）';
    if(!alive(t))return `${t.id}已倒下，交换机只能送走仍存活的伙伴`;
    if(!Array.isArray(a.cargo)||a.cargo.length>ECON.exchangeCargo||new Set(a.cargo).size!==a.cargo.length)return `最多运送${ECON.exchangeCargo}份不同的招式机`;
    if(a.cargo.some(i=>!Number.isInteger(i)||s.tms?.[i]?.fate!=='held'))return '只能运送本局仍持有的招式机';
    return null;
  }
  if(a.type==='interact'){
    const room=adventureAt(s,u.pos);
    if(room){
      if(id!==s.leader)return '只有主控能操作探险房间点位';
      if(a.exit)return '这里不是出口，不能请求撤离';
      if(room.type==='challenge'){
        if(room.state==='sealed')return '挑战正在进行，石碑无法再次启动';
        if(room.state==='cleared')return '这座石碑的挑战已经完成，不能再次挑战';
        return room.state==='idle'?null:'这座石碑当前无法启动';
      }
      if(room.type==='item'){
        if(room.state==='done')return '道具房的道具已经取走';
        if(!room.item)return '道具房没有可领取的道具';
        return s.prog?null:'这里没有可领取本局道具的背包';
      }
      if(room.type==='commission'){
        if(room.state==='done')return '这间委托房已经处理过';
        if((s.commissions?.length??0)>=3)return '同时只能接下3条委托；本房间未完成，可先处理已接委托';
        return commissionOffer(s,room)?null:'本层没有可接的委托';
      }
      if(room.type==='blessing'){
        if(room.state==='done')return '这间祝福房已经处理过';
        return eligibleBlessings(s).length?null:'没有尚未拥有且适用于本层的祝福';
      }
      return '这个房间点位尚未开放';
    }
    const point=s.points.find(p=>same(p.pos,u.pos));
    if(id!==s.leader||!point)return '主控必须站在交互点';
    if(point.kind==='down'||point.kind==='up'){
      if(a.exit&&s.dungeon?.roguelike&&point.kind==='up')return '本局只能向下跨层';
      return a.exit?null:'楼梯上只能前进，不能取得';
    }
    if(s.dungeon?.roguelike&&a.exit){
      if(point.kind==='goal')return '目标G不是撤离点';
      if(point.kind==='item')return '目标T不是撤离点';
      return '本局没有撤离点，击败首领后结束';
    }
    if(isPickupKind(point.kind)){if(a.exit)return '这里不是出口，不能请求撤离';return point.used?`${ITEM_NAMES[point.kind]}已拾取`:null;}
    if(point.kind==='rest'){if(a.exit)return '这里不是出口，不能请求撤离';if(point.used)return '休整点已使用，每局只能用一次';
      return restTargets(s).length?null:'在场成员的所有招式PP都已满，没有可整理的补给；休整机会没有消耗';}
    if(point.kind==='shop')return a.exit?'这里不是出口，不能请求撤离':'商店格上直接购买，不用“取得”';
    if(point.kind==='exchange')return a.exit?'这里不是出口，不能请求撤离':'交换机用“交换”操作，不用“取得”';
    if(!a.exit&&(point.used||point.kind==='exit'))return point.kind==='goal'?'G已记录，仅可请求撤离':point.kind==='item'?'T已取得，仅可请求撤离':'此处是纯出口，仅可请求撤离';
    return null;
  }
  if(a.type==='use'){
    if(!s.prog)return '这里没有可用的背包物品';
    if((s.prog.items[a.item]??0)<1)return `背包里没有${ITEM_NAMES[a.item]}`;
    if(a.item==='reviverSeed')return '复活种子不能主动使用，队员倒下的瞬间会自动用掉';
    if(ORB_ITEMS.includes(a.item)){
      if(a.target!==id)return `${ITEM_NAMES[a.item]}由使用者发动，目标必须是使用者自己`;
      if((a.item==='slumberOrb'||a.item==='totterOrb')&&!orbAffected(s,u,a.item).length)return `房间范围内没有能被影响的敌人，${ITEM_NAMES[a.item]}不会有效果`;
      if(a.item==='luminousOrb'&&s.mapRevealed)return '本层的地形已经显现';
      if(a.item==='rollcallOrb'&&!s.queue.some(m=>m!==id&&alive(s.units[m])&&!adjacent(s,u.pos,s.units[m].pos)))return '所有存活同行都已在身边，邀回宝珠不会有效果';
      return null;
    }
    if(a.item==='teamTonic'&&a.target!==id)return '全员PP补剂由使用者发动，目标必须是使用者自己';
    if(a.item==='teamTonic'&&!s.queue.some(member=>alive(s.units[member])&&s.units[member].learned.some(k=>(s.units[member].pp[k]??0)<(s.units[member].maxPp[k]??0))))return `在场成员的所有招式PP已满，${ITEM_NAMES.teamTonic}不会有效果`;
    if(a.item==='bigBerry'||a.item==='berry'){
      const w=s.units[a.target];
      if(!w||w.side!=='friend'||!s.queue.includes(w.id))return '物品只能对同行伙伴使用';
      if(!alive(w))return `${w.id}已倒下，物品不能救起倒下的伙伴`;
      if(w.id!==id&&!adjacent(s,u.pos,w.pos))return `${w.id}不在相邻格，物品只能对自己或相邻同行使用`;
      if(w.hp>=w.maxHp)return `${w.id}的HP已满，${ITEM_NAMES[a.item]}不会有效果`;
      return null;
    }
    if(a.item==='teamTonic')return null;
    if(a.item==='violentSeed'){
      const w=s.units[a.target];
      if(!alive(w)||w.side!=='friend'||!s.queue.includes(w.id))return '物品只能对存活同行使用';
      if(w.id!==id&&!adjacent(s,u.pos,w.pos))return '物品只能对自己或相邻同行使用';
      return stageOf(w,'atk')>=3&&stageOf(w,'spa')>=3?'攻击和特攻已在+3以上，暴力种子不会有效果':null;
    }
    const cures=ITEM_CURES[a.item];
    if(cures){
      const w=s.units[a.target];
      if(!w||w.side!=='friend'||!s.queue.includes(w.id))return '物品只能对同行伙伴使用';
      if(!alive(w))return `${w.id}已倒下，物品不能救起倒下的伙伴`;
      if(w.id!==id&&!adjacent(s,u.pos,w.pos))return `${w.id}不在相邻格，物品只能对自己或相邻同行使用`;
      if(!cures.some(k=>hasStatus(w,k)))return `${w.id}没有${ITEM_NAMES[a.item]}能治好的状态，${ITEM_NAMES[a.item]}不会有效果`;
      return null;
    }
    const w=s.units[a.target];
    if(!w||w.side!=='friend'||!s.queue.includes(w.id))return '物品只能对同行伙伴使用';
    if(!alive(w))return `${w.id}已倒下，物品不能救起倒下的伙伴`;
    if(w.id!==id&&!adjacent(s,u.pos,w.pos))return `${w.id}不在相邻格，物品只能对自己或相邻同行使用`;
    if(!w.learned.some(k=>(w.pp[k]??0)<(w.maxPp[k]??0)))return `${w.id}的所有招式PP已满，${ITEM_NAMES[a.item]}不会有效果`;
    return null;
  }
  const t=s.units[a.target];if(!alive(t)||(!s.queue.includes(t.id)&&!s.enemies.includes(t.id)))return '目标不存在或已倒下';
  if(!s.seen.includes(key(t.pos)))return '目标尚未发现';
  if(a.type==='swap')return !s.queue.includes(t.id)||id===t.id||!adjacent(s,u.pos,t.pos)?'只能与相邻存活伙伴换位':null;
  if(a.type==='basic')return t.side===u.side||!adjacent(s,u.pos,t.pos)?'普通攻击只能指定相邻敌人（斜向相邻也算，但不能穿过墙角）':null;
  if(!u.learned.includes(a.skill)||(u.pp[a.skill]??0)<1)return '未装备该招式或PP不足';
  const spec=moveOf(a.skill);if(!spec)return '招式数据不存在';
  if(a.skill==='snore'||a.skill==='sleeptalk')return '打鼾和梦话只能在睡眠中受直接攻击时触发';
  if(spec.effects.includes('rest')&&u.hp>=u.maxHp&&!Object.keys(u.status??{}).some(k=>k!=='nap'))return 'HP已满且没有异常状态，不能使用睡觉';
  if(isProtectionMove(spec)&&isProtectionMoveId(u.lastMove))return '守住与快速防守不能连续使用';
  if((spec.range==='user'||spec.range==='room')&&a.target!==id)return spec.range==='user'?'这种招式的目标必须填使用者自己':'这种范围招式的目标必须填使用者自己';
  if(spec.range==='user'||spec.range==='room'){
    if(!moveTargetsInReach(s,id,spec).length)return spec.range==='room'?'范围内没有能受此招式影响的单位':'招式无法作用于使用者';
    return null;
  }
  if(!targetKindMatches(s,id,t,spec))return spec.target==='enemy'?'该招式只能指定与使用者不同阵营的目标':spec.target==='teammates'?'该招式只能指定己方其他单位':spec.target==='user'?'该招式只能指定使用者自己':'目标阵营不符合招式要求';
  if(!moveTargetsInReach(s,id,spec).some(v=>v.id===t.id))return moveRangeProblem(s,u,t,spec);
  if(t.boss&&!bossCanBeBlownAway(t)&&spec.effects.includes('blowaway')&&!spec.effects.includes('damage'))return '首领不能被吹飞';
  return null;
}
/** 8.8 (#165, G9.2): the rest point refills every move of every living member on the map that is below its maximum. */
function restTargets(s:World):{id:string;skill:Skill}[] {
  const out:{id:string;skill:Skill}[]=[];
  for(const id of s.queue){const u=s.units[id];if(!alive(u))continue;
    for(const k of u.learned){const max=u.maxPp[k]??0,cur=u.pp[k]??0;if(max>0&&cur<max)out.push({id,skill:k});}}
  return out;
}
/** Item count carried in the backpack. */
export const bagCount=(s:World):number=>Object.values(s.prog?.items??{}).reduce<number>((a,n)=>a+(n??0),0);
/** G9.1 (8.8): the rule layer only reports "picked up" or "bag full, not picked up"; the capacity itself (`PROG.bagLimit`, null = unlimited) is for the interface line to set. */
export const bagFull=(s:World):boolean=>PROG.bagLimit!==null&&bagCount(s)>=PROG.bagLimit;
/** G9.1 (8.8): a living team member standing on an unused floor item takes it without spending an action. */
function tryPickup(s:World,actorId:string):void {
  const u=s.units[actorId];if(!s.prog||!alive(u)||!s.queue.includes(actorId))return;
  const point=s.points.find(q=>!q.used&&isPickupKind(q.kind)&&same(q.pos,u.pos));if(!point)return;
  const item=point.kind as PickupKind;
  if(bagFull(s)){note(s,L`${actorId}脚下的${ITEM_NAMES[item]}没有拾取：背包已满`);emit(s,{type:'pickup',actor:actorId,item,ok:false});return;}
  const amount=(s.prog.items[item]??0)+1;s.prog.items[item]=amount;point.used=true;
  note(s,L`${actorId}拾取${ITEM_NAMES[item]}，背包共${amount}`);emit(s,{type:'pickup',actor:actorId,item,ok:true});progressCommission(s,'collector');
}
const hasBless=(s:World,id:BlessingId):boolean=>(s.blessings??[]).includes(id);
/** The attacker of the damage being resolved, for the kill-heal blessing. */
let currentKiller:string|null=null;
/** Experience goes through here so the scholar blessing (+15%) counts every source. */
function gainExp(s:World,n:number):void {if(!s.prog)return;s.prog.exp+=hasBless(s,'scholar')?Math.round(n*1.15):n;}
function healUnit(s:World,id:string,n:number,why:string):void {
  const u=s.units[id];if(!alive(u)||n<=0)return;const before=u.hp;u.hp=Math.min(u.maxHp,u.hp+n);if(u.hp>before)note(s,L`${why}：${id} HP ${before}→${u.hp}`);
}
/** Enemies inside the user's room (corridor: 2 cells), the reach of the sleep and confusion orbs. */
function orbFoes(s:World,u:Unit):Unit[] {return s.enemies.map(i=>s.units[i]).filter(e=>alive(e)&&!!u.pos&&inRoomReach(s,u.pos,e.pos));}
/** The enemies a sleep or confusion orb would really change: in reach and not already in that condition. */
function orbAffected(s:World,u:Unit,item:Item):Unit[] {
  const kind:StatusId=item==='slumberOrb'?'slp':'confusion';
  return orbFoes(s,u).filter(e=>kind==='slp'?!(hasStatus(e,'slp')||hasStatus(e,'nap')):!hasStatus(e,'confusion'));   // no type is immune to sleep or confusion in this game
}
/** Berry heal for one target: 30% of max HP (at least 8), +50% with the berry blessing, plus the supplies talent; guardian halves the lot. */
function berryHealAmount(s:World,t:Unit):number {
  let raw=berryBaseHeal(t.maxHp);if(hasBless(s,'berryBoost'))raw=Math.floor(raw*(1+(BLESSINGS.berryBoost.berryHealRate??0.5)));
  raw+=s.talents?.supplies??0;return activeCommission(s,'guardian')?Math.floor(raw/2):raw;
}
/** Applies HP loss and returns the HP actually lost. `cause` marks status damage (poison, burn), which has its own log line and does not wake a sleeper. A frozen unit takes no damage at all (8.8). */
function hit(s:World,id:string,n:number,cause?:string,afterDamage?:(actual:number,shown:number,entry:LogEntry)=>void,crit?:true):number {
  const u=s.units[id],before=u.hp;
  if(n>0&&hasStatus(u,'frz')){note(s,L`${id}冰冻中，不受伤害`);emit(s,{type:'frozenBlock',unit:id});return 0;}
  if(n>0&&!cause&&u.side==='friend'&&s.queue.includes(id)&&hasBless(s,'thickskin')&&!u.thickUsed){u.thickUsed=true;const halved=Math.max(1,Math.floor(n/2));note(s,L`厚皮：${id}本层第一次受到的伤害减半（${n}→${halved}）`);n=halved;}
  u.hp=Math.max(0,u.hp-n);const actual=before-u.hp;const strike=s.strikePending;const damageEntry=note(s,cause?L`${id}因${cause}损失${n}HP，HP ${u.hp}`:L`${id}受到${n}伤害，HP ${u.hp}`,cause?{}:{damage:{target:id,amount:n,...(crit?{crit:true as const}:{}),notes:[]}});
  const lossEvent:Extract<RoundEvent,{type:'hpLoss'}>={type:'hpLoss',unit:id,amount:n,hp:u.hp,...(cause?{cause}:{}),...(crit?{crit:true as const}:{}),...(strike&&!cause?{strike}:{})};emit(s,lossEvent);
  afterDamage?.(actual,n,damageEntry);   // `n` is the number in the log line (after Thick Skin halving), so the event and the line pair up
  if(!cause&&u.side==='enemy'&&before>u.hp&&u.asleep){u.asleep=false;u.wakeSkip=true;}
  if(before>0&&u.hp===0&&u.side==='friend'&&s.prog&&s.queue.includes(id)&&(s.prog.items.reviverSeed??0)>0){
    s.prog.items.reviverSeed=(s.prog.items.reviverSeed??0)-1;u.hp=Math.max(1,Math.floor(u.maxHp/2));
    note(s,L`${id}倒下的瞬间，${ITEM_NAMES.reviverSeed}发动，HP恢复到${u.hp}`);lossEvent.revive=u.hp;emit(s,{type:'revive',unit:id,hp:u.hp});return actual;
  }
  if(u.hp>0&&u.side==='friend'&&s.queue.includes(id)&&hasBless(s,'laststand')&&!u.standUsed&&u.hp<u.maxHp*(BLESSINGS.laststand.threshold??0.35)){
    u.standUsed=true;healUnit(s,id,Math.max(1,Math.floor(u.maxHp*(BLESSINGS.laststand.value??0.25))),'背水');
  }
  if(before>0&&u.hp===0){u.pos=null;note(s,L`${id}倒下退图`,{player:L`${id}倒下了`});
    if(u.side==='enemy'&&currentKiller&&hasBless(s,'killheal')){const k=s.units[currentKiller];if(alive(k)&&k.side==='friend')healUnit(s,k.id,Math.max(1,Math.floor(k.maxHp*(BLESSINGS.killheal.value??0.08))),'击倒回复');}
    if(u.side==='friend')for(const c of [...(s.commissions??[])].filter(c=>c.id==='guardian'))failCommission(s,c,'同行倒下');
    if(u.side==='enemy')progressCommission(s,'hunter');
    if(u.side==='enemy'&&s.prog){
      if(s.dungeon?.roguelike){const coins=Math.min(15,Math.max(5,u.level??INITIAL_LEVEL));s.purse=(s.purse??0)+coins;note(s,L`${id}被击败，钱袋增加${coins}`);}
      if(!u.recruit&&u.species)s.prog.kills.push(u.species);
      gainExp(s,Math.round((u.level??INITIAL_LEVEL)*PROG.expMultiplier));
    }
    if(u.side==='enemy'&&u.recruit){
    const unit=clone(u.recruit);unit.id=`${u.recruit.id}`; // fixture IDs are stable; each event initializes once
    if(s.units[unit.id]||s.invitations.some(i=>i.unit.id===unit.id))unit.id=`${unit.id}-${s.invitations.length+1}`;
    s.invitations.push({id:`${s.runId}:invite:${s.invitations.length+1}`,unit,status:'pending'});}}
  return actual;
}
/** Spec 3.1: a basic attack is Special when the actor's species has the higher base Sp. Atk than Atk, otherwise Physical (ties and units without a species count as Physical). */
function basicCategory(u:Unit):'Physical'|'Special' {
  const b=u.species?speciesOf(u.species)?.baseStats:undefined;
  return b&&b.spa>b.atk?'Special':'Physical';
}
/** G5.3 step 2: attacker's current ability value divided by the defender's, kept inside this range. */
/** Critical hits (main-series values, working numbers): 1 in 24 per target, damage x1.5. */
export const CRIT_CHANCE=1/24,CRIT_MULTIPLIER=1.5;
export const STAT_DAMAGE_RATIO=Object.freeze({min:0.5,max:2} as const);
/** Ability stages of attack, special attack, defence and special defence run -10...+10 (Mystery Dungeon, Bulbapedia "Stat (Mystery Dungeon)"); accuracy and evasion keep their own -6...+6 rule (G5.1). */
export const STAGE_LIMIT=10;
/** Stage multipliers in 256ths, index = stage + 10. Attack and special attack (attacker side), defence and special defence (defender side: the defence value is multiplied, so damage is divided). */
export const ATTACK_STAGE_256=[128,133,138,143,148,153,161,171,179,204,256,307,332,358,384,409,422,435,448,460,473] as const;
export const DEFENCE_STAGE_256=[7,12,25,38,51,64,76,102,128,179,256,332,409,486,537,588,640,691,742,793,844] as const;
const clampStage=(n:number)=>Math.max(-STAGE_LIMIT,Math.min(STAGE_LIMIT,Math.round(n)));
export const attackStageMultiplier=(stage:number):number=>ATTACK_STAGE_256[clampStage(stage)+STAGE_LIMIT]/256;
export const defenceStageMultiplier=(stage:number):number=>DEFENCE_STAGE_256[clampStage(stage)+STAGE_LIMIT]/256;
/** The ability stage the damage rule really uses for one stat: the stored stage, minus the hunter commission's penalty on the defence of the player's side, kept in -10...+10. */
export function damageStage(s:World,u:Unit,key:'atk'|'def'|'spa'|'spd'):number {
  if(key==='atk'||key==='spa')return clampStage(stageOf(u,key));
  const penalty=u.side==='friend'&&activeCommission(s,'hunter')?1:0;
  return clampStage(stageOf(u,key)-penalty);
}
/** Shared, side-effect-free damage calculation. An absent target represents an ordinary opposing ratio-1 target. The ratio uses the units' current ability values (stats.ts), clamped to 0.5-2. */
function damageAmount(s:World,source:Unit,target:Unit|undefined,baseDamage:number,category:'Physical'|'Special'|'Status',quickguard:ReadonlySet<string>,thaw=false,skill?:Skill,crit=false):number {
  const attackStats=currentStats(source),defenceStats=target?currentStats(target):null;
  const ratio=attackStats&&defenceStats&&category!=='Status'
    ?Math.max(STAT_DAMAGE_RATIO.min,Math.min(STAT_DAMAGE_RATIO.max,category==='Special'?attackStats.spa/defenceStats.spd:attackStats.atk/defenceStats.def)):1;
  const special=category==='Special';
  // Stages sit outside the 0.5-2 clamp, so a boost is never eaten by it. A critical hit counts a negative attack stage and a positive defence stage as 0.
  const attackStage=category==='Status'?0:damageStage(s,source,special?'spa':'atk'),defenceStageRaw=target&&category!=='Status'?damageStage(s,target,special?'spd':'def'):0;
  const stageFactor=attackStageMultiplier(crit?Math.max(0,attackStage):attackStage)/defenceStageMultiplier(crit?Math.min(0,defenceStageRaw):defenceStageRaw);
  const afterSpeciesRatio=Math.max(1,Math.round(baseDamage*ratio*stageFactor));
  const offense=source.side==='friend'&&(!target||target.side==='enemy')&&category!=='Status'?3*(s.talents?.offense??0):0;
  const scaled=Math.max(1,applyTalentBonus(afterSpeciesRatio,offense));
  const opposing=!!target&&source.side!==target.side;
  const attackDistance=source.pos&&target?.pos?chebyshev(source.pos,target.pos):0;
  const base=source.side==='enemy'?Math.max(1,Math.round(scaled*DIFFICULTY[s.difficulty??'normal'])):scaled;
  const raw=base;   // the stage step is inside the ratio line above; there is no flat +-1 per stage any more
  let amount=raw<=0?0:raw;
  if(opposing&&amount>0){
    if(!crit&&category==='Physical'&&(target!.reflect??0)>0)amount=Math.floor(amount/2);   // a critical hit goes through both screens
    if(!crit&&category==='Special'&&(target!.lightscreen??0)>0)amount=Math.floor(amount/2);
  }
  if(amount>0&&hasStatus(source,'brn'))amount=Math.max(1,Math.floor(amount*BURN_DAMAGE_RATIO[0]/BURN_DAMAGE_RATIO[1]));
  if(crit&&amount>0)amount=Math.max(1,Math.round(amount*CRIT_MULTIPLIER));   // before the type step
  const effectiveness=skill&&target?typeEffectiveness(skill,speciesTypes(target)):1;
  const stab=skill?stabMultiplier(skill,speciesTypes(source)):1;
  const immune=effectiveness===0;
  if(amount>0)amount=immune?0:Math.max(1,Math.round(amount*stab*effectiveness));
  const blocked=opposing&&(target!.protect>0||(quickguard.has(target!.id)&&attackDistance>1));
  if(blocked)amount=0;
  else if(raw>0&&!immune)amount=Math.max(1,amount);
  if(target&&hasStatus(target,'frz')&&!thaw)amount=0;
  if(amount>0&&opposing&&source.side==='friend'&&target){
    let bonus=0;
    if(hasBless(s,'nemesis')&&((target.status&&Object.keys(target.status).length>0)||target.asleep))bonus+=BLESSINGS.nemesis.value??0.1;
    if(hasBless(s,'headhunter')&&target.boss)bonus+=BLESSINGS.headhunter.value??0.15;
    if(hasBless(s,'fullpower')&&source.hp>source.maxHp*(BLESSINGS.fullpower.threshold??0.8))bonus+=BLESSINGS.fullpower.value??0.08;
    if(bonus>0)amount=Math.max(1,Math.round(amount*(1+bonus)));
  }
  return amount;
}
/** HP loss for the damage part of a move/basic attack; AI and UI use the same arithmetic as resolution. */
export function estimateAttackDamage(s:World,sourceId:string,targetId:string|undefined,skill?:Skill,quickguard:ReadonlySet<string>=new Set()):number {
  const source=s.units[sourceId],target=targetId===undefined?undefined:s.units[targetId];
  if(!source)return 0;
  const spec=skill===undefined?undefined:moveOf(skill);
  if(skill!==undefined&&(!spec||(!spec.effects.includes('damage')&&skill!=='snore')||spec.power===null))return 0;
  const level=source.side==='friend'?(s.prog?.level??source.level??INITIAL_LEVEL):(source.level??INITIAL_LEVEL);
  const base=6+(spec?Math.ceil(spec.power!/2):0)+levelDamageBonus(level);
  const category=skill===undefined?basicCategory(source):moveCategory(skill);
  if(!category)throw new Error('缺少招式类别：'+skill);
  const amount=damageAmount(s,source,target,base,category,quickguard,!!(skill&&moveEffects(skill)?.thaw),skill);
  return target?Math.min(target.hp,amount):amount;
}
/** Apply the shared damage amount; return actual HP lost for drain and counter. */
function onDirectDamageToSleeper(s:World,owner:Unit,attacker:Unit,blockingGuard:ReadonlySet<string>,createdGuard:Set<string>):void {
  if(!alive(owner)||!alive(attacker)||!sleeping(owner))return;
  if(hasStatus(owner,'slp')){
    if(battleRandom(s)<WAKE_ON_HIT_CHANCE){dropStatus(owner,'slp');note(s,L`${owner.id}被攻击后醒来`);emit(s,{type:'status',target:owner.id,status:'slp',change:'expire'});return;}
  }
  if(!sleeping(owner)||hasStatus(owner,'par')||hasStatus(owner,'flinch'))return;
  if(owner.learned.includes('snore')){
    if((owner.pp.snore??0)>0&&moveOf('snore'))executeSkill(s,owner.id,{type:'skill',skill:'snore',target:attacker.id},blockingGuard,createdGuard,{suppressSleepTrigger:true,forcedTarget:attacker,ignoreConfusion:true});
    return;
  }
  if(!owner.learned.includes('sleeptalk')||(owner.pp.sleeptalk??0)<1)return;
  const choices=owner.learned.filter(move=>move!=='rest'&&move!=='snore'&&move!=='sleeptalk'&&(owner.pp[move]??0)>0&&!['teammates','party'].includes(moveOf(move)?.target??''));
  if(!choices.length)return;
  const chosen=choices[Math.floor(battleRandom(s)*choices.length)],spec=moveOf(chosen);if(!spec)return;
  const target=spec.target==='user'?owner:attacker;
  owner.pp.sleeptalk=(owner.pp.sleeptalk??0)-1;
  note(s,L`${owner.id}在睡眠中使用梦话，发动${SKILL_CN[chosen]??chosen}`);emit(s,{type:'sleeptalk',unit:owner.id,skill:chosen});
  executeSkill(s,owner.id,{type:'skill',skill:chosen,target:target.id},blockingGuard,createdGuard,{suppressSleepTrigger:true,spendPp:false,lastMove:'sleeptalk',forcedTarget:target,ignoreConfusion:true});
}
function resolveDamage(s:World,sourceId:string,targetId:string,baseDamage:number,category:'Physical'|'Special'|'Status'='Physical',quickguard:ReadonlySet<string>=new Set(),thaw=false,skill?:Skill,suppressSleepTrigger=false,createdGuard:Set<string>=new Set()):number {
  const source=s.units[sourceId],target=s.units[targetId],opposing=source.side!==target.side;
  let amount=damageAmount(s,source,target,baseDamage,category,quickguard,thaw,skill);
  if(target.boss&&opposing&&source.pos&&alive(target))target.targetMemory=clone(source.pos);   // D-20261110-07: a boss that is hit turns on its attacker
  if(thaw&&amount>0&&hasStatus(target,'frz')){dropStatus(target,'frz');const keep=s.strikePending;note(s,L`${targetId}受到火系招式或热水攻击后解冻`);if(keep!==undefined)s.strikePending=keep;emit(s,{type:'status',target:targetId,status:'frz',change:'cure'});}
  const effectiveness=skill?typeEffectiveness(skill,speciesTypes(target)):1;
  // One roll per target on the battle stream, only for a hit that deals damage and is not immune (G5.3 step 7 comes first); a critical hit is rolled again through the same rule with its own stage handling.
  const crit=!s.noCrit&&category!=='Status'&&amount>0&&effectiveness>0&&battleRandom(s)<CRIT_CHANCE;
  if(crit)amount=damageAmount(s,source,target,baseDamage,category,quickguard,thaw,skill,true);
  const previousKiller=currentKiller;currentKiller=opposing?sourceId:null;let actual=0;
  try{actual=hit(s,targetId,amount,undefined,(actual,shown,entry)=>{emit(s,{type:'damage',actor:sourceId,target:targetId,amount:shown,...(crit?{crit:true as const}:{})});if(skill&&actual>0){if(effectiveness>1){note(s,L`效果绝佳`,{folded:true});entry.damage?.notes.push('效果绝佳');}else if(effectiveness>0&&effectiveness<1){note(s,L`效果不好`,{folded:true});entry.damage?.notes.push('效果不好');}}},crit?true:undefined);}finally{currentKiller=previousKiller;}
  // `actual` is the HP the hit really took; Last Stand or a Reviver Seed may have raised target.hp afterwards.
  if(opposing&&actual>0&&target.hp>0&&!suppressSleepTrigger)onDirectDamageToSleeper(s,target,source,quickguard,createdGuard);
  if(opposing&&actual>0&&target.hp>0&&target.counter>0&&source.pos&&target.pos&&adjacent(s,source.pos,target.pos)){const keep=currentKiller;currentKiller=targetId;try{hit(s,sourceId,actual);}finally{currentKiller=keep;}}
  return actual;
}
function collide(s:World,targetId:string,killer:string):void {
  // The specification fixes blowaway impact at five damage; defence stages do not change collision damage. The pusher gets the credit for a kill.
  const keep=currentKiller;currentKiller=s.units[targetId]?.side!==s.units[killer]?.side?killer:null;
  try{hit(s,targetId,COLLISION_DAMAGE);}finally{currentKiller=keep;}
}
function blowAway(s:World,actor:Unit,target:Unit):void {
  if(!alive(actor)||!alive(target))return;
  if(target.asleep){target.asleep=false;target.wakeSkip=true;}
  const start=target.pos;
  const delta={x:Math.sign(target.pos.x-actor.pos.x),y:Math.sign(target.pos.y-actor.pos.y)};
  let at=target.pos,wall=false,blocker:Unit|undefined;
  for(let i=0;i<BLOWAWAY_CELLS;i++){
    const next=plus(at,delta);
    if(!walk(s,next)||!stepOk(s,at,next)){wall=true;break;}
    blocker=active(s).find(u=>u.id!==target.id&&same(u.pos,next));
    if(blocker)break;
    at=next;
  }
  target.pos=at;
  if(!same(start,at))reveal(s);
  note(s,L`${actor.id}吹飞${target.id}到${key(at)}`);emit(s,{type:'blowaway',unit:actor.id,target:target.id,to:clone(at)});
  if(wall)collide(s,target.id,actor.id);
  else if(blocker){collide(s,target.id,actor.id);collide(s,blocker.id,actor.id);}
}
const stageEffect=(effect:string):{stat:StageKey;change:number}|null=>{
  const m=effect.match(/^stage:(atk|def|spa|spd|acc|eva):([+-]\d+)$/);
  return m?{stat:m[1] as StageKey,change:Number(m[2])}:null;
};
function effectBlocked(s:World,actor:Unit,target:Unit,guard:ReadonlySet<string>):boolean {
  return target.side!==actor.side&&(target.protect>0||(guard.has(target.id)&&!!actor.pos&&!!target.pos&&chebyshev(actor.pos,target.pos)>1));
}
function changeStage(s:World,targetId:string,stat:StageKey,change:number):void {
  if(stat==='spe')return; // the game has no speed: speed changes do not take effect (8.8, 4)
  const target=s.units[targetId],before=stageOf(target,stat);
  const limit=stat==='acc'||stat==='eva'?ACCURACY_STAGE_LIMIT:STAGE_LIMIT;
  target.stages[stat]=Math.max(-limit,Math.min(limit,before+change));
  note(s,L`${targetId}${STAGE_NAMES[stat]}阶段变为${target.stages[stat]}`);emit(s,{type:'stage',unit:targetId,stat,value:target.stages[stat] as number});
}
const applyStageChange=(s:World,targetId:string,change:StageChange)=>{for(const [k,v] of Object.entries(change))changeStage(s,targetId,k as StageKey,v as number);};
const RANGE_CELLS={front:1,front2:2,line10:10} as const;
const DIR_NAMES:Record<string,string>={'1,0':'右','0,1':'下','-1,0':'左','0,-1':'上','1,1':'右下','-1,1':'左下','-1,-1':'左上','1,-1':'右上'};
/** 8.8 (G5.14): the first unit a confused attacker's random-direction strike meets within `range` cells, whatever its side; undefined when the line is empty or blocked. */
function confusedStrike(s:World,actor:Unit&{pos:Pos},range:number):Unit|undefined {
  const dir=DIRS8[Math.floor(battleRandom(s)*8)];
  actor.facing=clone(dir);
  note(s,L`${actor.id}因混乱朝${DIR_NAMES[key(dir)]}出手`);emit(s,{type:'confusedStrike',unit:actor.id});s.strikePending=actor.id;
  let at=actor.pos;
  for(let i=0;i<range;i++){
    const next=plus(at,dir);if(!walk(s,next)||!stepOk(s,at,next))return undefined;
    const found=active(s).find(v=>v.id!==actor.id&&same(v.pos,next));if(found)return found;
    at=next;
  }
  return undefined;
}
type SkillExecutionOptions={suppressSleepTrigger?:boolean;forcedTarget?:Unit;spendPp?:boolean;lastMove?:string;ignoreConfusion?:boolean};
function executeSkill(s:World,id:string,a:Extract<Action,{type:'skill'}>,blockingGuard:ReadonlySet<string>,createdGuard:Set<string>,options:SkillExecutionOptions={}):void {
  const actor=s.units[id],spec=moveOf(a.skill)!,fx=moveEffects(a.skill),{suppressSleepTrigger=false,forcedTarget,spendPp=true,lastMove,ignoreConfusion=false}=options;
  if(spendPp)actor.pp[a.skill]=(actor.pp[a.skill]??0)-1;actor.lastMove=lastMove??a.skill;
  note(s,L`${id}使用${SKILL_CN[a.skill]??a.skill}`);emit(s,{type:'cast',unit:id,skill:a.skill,...(lastMove==='sleeptalk'?{viaSleeptalk:true as const}:{})});
  let targets=forcedTarget?[forcedTarget]:(spec.range==='room'||spec.range==='around'?moveTargetsInReach(s,id,spec):[s.units[a.target]]);
  if(spec.range==='user')targets=[actor];
  let confusedDirection=false;
  const attackTarget=spec.target==='enemy'||(spec.target==='all'&&spec.effects.includes('damage'));
  if(!ignoreConfusion&&hasStatus(actor,'confusion')&&alive(actor)&&(spec.range==='front'||spec.range==='front2'||spec.range==='line10')){
    confusedDirection=true;
    const found=confusedStrike(s,actor,RANGE_CELLS[spec.range]);
    targets=found?[found]:[];
    if(!found){note(s,L`${id}的招式未命中任何目标`);emit(s,{type:'castNoTarget',unit:id});}
  }
  if(!confusedDirection&&attackTarget&&actor.pos){
    const aimed=s.units[a.target];if(alive(aimed)&&aimed.id!==id)faceToward(actor,actor.pos,aimed.pos);
  }
  if((attackTarget||confusedDirection)&&actor.pos){
    for(const target of targets)if(alive(target)&&target.id!==id)faceToward(target,target.pos,actor.pos);
  }
  // Immunity is checked before a hit roll; an immune target takes no secondary effects and still costs PP.
  const eligible=targets.filter(t=>{
    if(!alive(t)||!needsHitRoll(spec))return alive(t);
    const reason=noEffectReason(a.skill,t,spec);
    if(reason){note(s,L`${SKILL_CN[a.skill]??a.skill}对${t.id}没有效果（${reason}）`);emit(s,{type:'immune',actor:id,target:t.id,skill:a.skill});return false;}   // no hit roll, no damage or side effect, PP already spent; the event lets the board show the move arriving
    return true;
  });
  const landed=eligible.filter(t=>{
    if(!needsHitRoll(spec))return true;
    if(rollHit(s,id,t.id,a.skill))return true;
    note(s,L`${id}的${SKILL_CN[a.skill]??a.skill}没打中${t.id}`,{player:L`${id}的${SKILL_CN[a.skill]??a.skill}没有命中${t.id}`});emit(s,{type:'miss',actor:id,target:t.id,skill:a.skill});return false;
  });
  let dealt=0;
  for(const effect of spec.effects){
    const stage=stageEffect(effect);
    if(stage){for(const target of landed)if(alive(target)&&!effectBlocked(s,actor,target,blockingGuard))changeStage(s,target.id,stage.stat,stage.change);continue;}
    if(effect.startsWith('status:')){
      const status=effect.slice(7) as StatusId;
      for(const target of landed)if(alive(target)&&!effectBlocked(s,actor,target,blockingGuard)){const blocked=statusTypeBlockReason(a.skill,target,status);if(blocked){note(s,L`${target.id}免疫${STATUS_NAMES[status]}`);continue;}applyStatus(s,target.id,status);}
      continue;
    }
    if(effect==='rest'){actor.status??={};actor.status.nap={left:battleInt(s,STATUS_DURATION.nap![0],STATUS_DURATION.nap![1]),fresh:true};note(s,L`${id}开始打盹`);emit(s,{type:'rest',unit:id});continue;}
    if(effect==='heal:1:2'){
      for(const target of landed)if(alive(target)){
        const before=target.hp;target.hp=Math.min(target.maxHp,target.hp+Math.round(target.maxHp/2));
        note(s,L`${target.id}回复HP ${before}→${target.hp}`);emit(s,{type:'heal',unit:target.id,from:before,to:target.hp});
      }
      continue;
    }
    if(effect==='protect'){actor.protect=PROTECT_PHASES;note(s,L`${id}进入守住状态`);emit(s,{type:'guard',unit:id,kind:'protect'});continue;}
    if(effect==='counter'){actor.counter=COUNTER_PHASES;note(s,L`${id}进入反击状态`);emit(s,{type:'guard',unit:id,kind:'counter'});continue;}
    if(effect==='quickguard'){
      const guarded=landed.filter(t=>alive(t)&&t.side===actor.side);
      for(const target of guarded)createdGuard.add(target.id);
      note(s,L`${id}为${joined(guarded.map(t=>t.id),'、')}开启快速防守`);emit(s,{type:'quickguard',unit:id,targets:guarded.map(t=>t.id)});continue;
    }
    if(effect==='reflect'||effect==='lightscreen'){
      for(const target of landed)if(alive(target)&&target.side===actor.side){
        target[effect]=SCREEN_PHASES;
        note(s,L`${target.id}受到${effect==='reflect'?'反射壁':'光墙'}保护，持续${SCREEN_PHASES}回合`);emit(s,{type:'guard',unit:target.id,kind:effect});
      }
      continue;
    }
    if((effect==='damage'||(effect==='snore'&&suppressSleepTrigger))&&spec.power!==null){
      const base=6+Math.ceil(spec.power/2)+levelDamageBonus(actor.side==='friend'?(s.prog?.level??actor.level??INITIAL_LEVEL):(actor.level??INITIAL_LEVEL));
      for(const target of landed)if(alive(target)){
        dealt+=resolveDamage(s,id,target.id,base,moveCategory(a.skill),blockingGuard,!!fx?.thaw,a.skill,suppressSleepTrigger,createdGuard);
      }
      continue;
    }
    if(effect==='blowaway'){
      for(const target of landed)if(alive(target)&&bossCanBeBlownAway(target))blowAway(s,actor,target);
    }
  }
  if(spec.effects.includes('drain')&&dealt>0&&actor.hp>0){
    const before=actor.hp,heal=Math.max(1,Math.floor(dealt/2));actor.hp=Math.min(actor.maxHp,actor.hp+heal);
    note(s,L`${id}吸取生命，HP ${before}→${actor.hp}`);emit(s,{type:'drain',unit:id,from:before,to:actor.hp});
  }
  if(fx?.recoil&&dealt>0&&actor.hp>0){
    const amount=Math.max(1,Math.floor(dealt*fx.recoil[0]/fx.recoil[1]));
    hit(s,id,amount,'反作用');
  }
  // 8.8 (G5.15): side effects, one independent chance per target that was hit and is still standing; a guarded target (Protect, Quick Guard) is untouched.
  let connected=false;
  if(fx?.fx&&spec.effects.includes('damage'))for(const target of landed){
    if(!alive(target)||(target.side!==actor.side&&(target.protect>0||(blockingGuard.has(target.id)&&chebyshev(actor.pos??target.pos,target.pos)>1))))continue;
    connected=true;
    for(const entry of fx.fx){
      if(entry.self)continue;
      if(!alive(target))break;
      if(entry.chance<100&&battleRandom(s)*100>=entry.chance)continue;
      if(entry.status){const blocked=statusTypeBlockReason(a.skill,target,entry.status);if(blocked)note(s,L`${target.id}免疫${STATUS_NAMES[entry.status]}`);else applyStatus(s,target.id,entry.status);}
      if(entry.foe)applyStageChange(s,target.id,entry.foe);
    }
  }
  // Raising the user's own stats is rolled once per use (not once per target), and only if the move connected with someone.
  if(connected&&alive(actor))for(const entry of fx!.fx!){
    if(!entry.self)continue;
    if(entry.chance<100&&battleRandom(s)*100>=entry.chance)continue;
    applyStageChange(s,id,entry.self);
  }
  // 8.8 (G5.15): the price of a few strong moves is paid when the move connects with at least one target; if every target was missed there is no price (main-series behaviour).
  if(fx?.cost&&alive(actor)&&landed.length>0)applyStageChange(s,id,fx.cost);
}
/** 7.2: the exchanger's effect. The companion leaves the queue (its slot stays empty), the chosen machines become 'sent', the exchanger is used up. */
function sendHome(s:World,a:Extract<Action,{type:'exchange'}>):void {
  const t=s.units[a.target];s.queue=s.queue.filter(i=>i!==a.target);t.pos=null;s.units[s.leader].lastMove=null;
  for(const i of a.cargo)s.tms![i].fate='sent';
  s.exchange!.used=true;s.exchange!.sent=a.target;
  const point=s.points.find(p=>p.kind==='exchange');if(point)point.used=true;
  note(s,L`${s.leader}启动交换机：${a.target}回到基地，运走${a.cargo.length}份招式机`,{player:L`${s.leader}启动交换机：${a.target}返回基地，运走${a.cargo.length}份招式机`});
}
function execute(s:World,id:string,a:Action,blockingGuard:ReadonlySet<string>,createdGuard:Set<string>):void {
  const u=s.units[id],level=u.side==='friend'?(s.prog?.level??u.level??INITIAL_LEVEL):(u.level??INITIAL_LEVEL),bonus=levelDamageBonus(level);
  if(a.type!=='skill')u.lastMove=null;
  if(a.type==='move'){const from=clone(u.pos!),mate=allyAt(s,id,a.to);faceToward(u,from,a.to);if(mate)faceToward(mate,a.to,from);u.pos=clone(a.to);if(mate)mate.pos=clone(from);
    if(u.side==='friend'){onRoomEntry(s,from,a.to);if(mate)onRoomEntry(s,a.to,from);}
    reveal(s);note(s,mate?L`${id}与${mate.id}换位`:L`${id}移动到${key(a.to)}`,{routine:true});emit(s,mate?{type:'swap',unit:id,mate:mate.id}:{type:'move',unit:id,to:clone(a.to)});
    if(u.side==='friend'){tryPickup(s,id);if(mate)tryPickup(s,mate.id);}}
  else if(a.type==='basic'){
    // 8.8 (G5.1): a basic attack always hits unless its user's accuracy stage is lowered; a confused attacker strikes a random direction.
    let target:string|undefined=a.target;
    const confused=hasStatus(u,'confusion');
    if(confused){const found=confusedStrike(s,u as Unit&{pos:Pos},1);target=found?.id;if(!found){note(s,L`${id}的普通攻击未命中任何目标`);emit(s,{type:'fail',unit:id,reason:'basicNoTarget'});}}
    if(target!==undefined){
      const victim=s.units[target];
      if(alive(victim)&&u.pos){if(!confused)faceToward(u,u.pos,victim.pos);if(victim.id!==id)faceToward(victim,victim.pos,u.pos);}
      if(rollHit(s,id,target))resolveDamage(s,id,target,6+bonus,basicCategory(u),blockingGuard);
      else{note(s,L`${id}的普攻没打中${target}`,{player:L`${id}的普通攻击没有命中${target}`});emit(s,{type:'miss',actor:id,target,skill:null});}
    }
  }
  else if(a.type==='basicForward'){
    const from=clone(u.pos!),confused=hasStatus(u,'confusion');
    const direction=confused?DIRS8[Math.floor(battleRandom(s)*8)]:facingOf(u);
    u.facing=clone(direction);
    if(confused){note(s,L`${id}因混乱朝${DIR_NAMES[key(direction)]}出手`);emit(s,{type:'confusedStrike',unit:id});s.strikePending=id;}
    const to=plus(from,direction),target=walk(s,to)&&s.seen.includes(key(to))&&stepOk(s,from,to)?active(s).find(v=>v.id!==id&&same(v.pos,to)):undefined;
    if(target&&target.pos&&target.side!==u.side){
      faceToward(target,target.pos,from);
      if(rollHit(s,id,target.id))resolveDamage(s,id,target.id,6+bonus,basicCategory(u),blockingGuard);
      else{note(s,L`${id}的普攻没打中${target.id}`,{player:L`${id}的普通攻击没有命中${target.id}`});emit(s,{type:'miss',actor:id,target:target.id,skill:null});}
    }else{
      emit(s,{type:'airAttack',actor:id,from,to});note(s,L`${id}向${key(to)}挥空`,{player:L`${id}普通攻击挥空`});
    }
  }
  else if(a.type==='use'){
    const t=s.units[a.target];s.prog!.items[a.item]=(s.prog!.items[a.item]??0)-1;
    if(a.item==='bigBerry'){
      const before=t.hp,heal=activeCommission(s,'guardian')?Math.floor(t.maxHp/2):t.maxHp;t.hp=Math.min(t.maxHp,t.hp+heal);note(s,L`${id}对${t.id}使用${ITEM_NAMES.bigBerry}，HP ${before}→${t.hp}`);emit(s,{type:'itemUse',unit:id,item:'bigBerry',target:t.id,from:before,to:t.hp});
    }else if(a.item==='berry'){
      const before=t.hp,heal=berryHealAmount(s,t);t.hp=Math.min(t.maxHp,t.hp+heal);note(s,L`${id}对${t.id}使用${ITEM_NAMES.berry}，HP ${before}→${t.hp}`);emit(s,{type:'itemUse',unit:id,item:'berry',target:t.id,from:before,to:t.hp});
    }else if(a.item==='violentSeed'){
      const raised:string[]=[];   // each stage rises to at least +3 and never drops; only the ones that really rose are logged
      for(const [k,name] of [['atk','攻击'],['spa','特攻']] as const){const cur=stageOf(t,k);if(cur<3){changeStage(s,t.id,k,3-cur);raised.push(name);}}
      note(s,L`${id}对${t.id}使用${ITEM_NAMES.violentSeed}，${raised.join('和')}升到+3级`);emit(s,{type:'itemUse',unit:id,item:'violentSeed',target:t.id});
    }else if(a.item==='maxElixir'){
      for(const k of t.learned)t.pp[k]=t.maxPp[k]??0;
      note(s,L`${id}对${t.id}使用${ITEM_NAMES.maxElixir}，所有招式PP回满`);emit(s,{type:'itemUse',unit:id,item:'maxElixir',target:t.id});
    }else if(a.item==='slumberOrb'||a.item==='totterOrb'){
      const kind:StatusId=a.item==='slumberOrb'?'slp':'confusion',foes=orbAffected(s,u,a.item);
      note(s,L`${id}使用${ITEM_NAMES[a.item]}，房间里的${foes.length}个敌人受到影响`);emit(s,{type:'itemUse',unit:id,item:a.item});
      for(const e of foes)applyStatus(s,e.id,kind);
    }else if(a.item==='luminousOrb'){
      s.mapRevealed=true;note(s,L`${id}使用${ITEM_NAMES.luminousOrb}，本层的地形全部显现`);emit(s,{type:'itemUse',unit:id,item:'luminousOrb'});
    }else if(a.item==='rollcallOrb'){
      const moved:string[]=[];
      for(const mid of s.queue){if(mid===id)continue;const m=s.units[mid];if(!alive(m)||adjacent(s,u.pos!,m.pos))continue;
        const spot=DIRS8.map(d=>plus(u.pos!,d)).find(c=>walk(s,c)&&s.seen.includes(key(c))&&stepOk(s,u.pos!,c)&&!active(s).some(v=>same(v.pos,c)));
        if(!spot)continue;m.pos=clone(spot);moved.push(mid);}
      const movedTo=moved.map(unit=>({unit,to:clone(s.units[unit].pos!)}));
      note(s,L`${id}使用${ITEM_NAMES.rollcallOrb}，${moved.length?L`${joined(moved,'、')}被召到身边`:'身边没有空位，同行留在原地'}`);emit(s,{type:'itemUse',unit:id,item:'rollcallOrb',...(movedTo.length?{moved:movedTo}:{})});if(moved.length)reveal(s);
    }else if(ITEM_CURES[a.item]){
      const cured=cureStatuses(s,t,ITEM_CURES[a.item]!);
      note(s,L`${id}对${t.id}使用${ITEM_NAMES[a.item]}，治好了${cured.map(k=>STATUS_NAMES[k]).join('、')}`);emit(s,{type:'itemUse',unit:id,item:a.item,target:t.id});
      const extra=ITEM_HEALS[a.item];if(extra){const half=activeCommission(s,'guardian')?Math.floor(extra/2):extra;healUnit(s,t.id,half,`${ITEM_NAMES[a.item]}同时回复`);}
    }else if(a.item==='teamTonic'){
      const restored:Msg[]=[];
      for(const member of s.queue){const ally=s.units[member];if(!alive(ally))continue;
        for(const skill of ally.learned){const before=ally.pp[skill]??0,max=ally.maxPp[skill]??0;if(before>=max)continue;
          ally.pp[skill]=Math.min(max,before+PROG.teamTonicPp);restored.push(L`${member}的${SKILL_CN[skill]??skill}PP ${before}→${ally.pp[skill]}`);}}
      note(s,L`${id}使用${ITEM_NAMES.teamTonic}，在场存活同行每招恢复${PROG.teamTonicPp}PP（${joined(restored,'，')}）`);emit(s,{type:'itemUse',unit:id,item:'teamTonic'});
    }else{
      for(const k of t.learned)t.pp[k]=Math.min(t.maxPp[k]??0,(t.pp[k]??0)+PROG.tonicPp);note(s,L`${id}对${t.id}使用${ITEM_NAMES.tonic}，每招PP+${PROG.tonicPp}（不超上限）`);emit(s,{type:'itemUse',unit:id,item:'tonic',target:t.id,pp:PROG.tonicPp});
    }
  }
  else if(a.type==='skill')executeSkill(s,id,a,blockingGuard,createdGuard);
  else if(a.type==='interact'){
    const room=adventureAt(s,u.pos!);
    if(room){
      if(room.type==='challenge'){
        s.pendingAdventureStart={room:room.room,actor:id,pos:clone(u.pos!)};
      }else if(room.type==='item'&&room.item){
        const item=room.item,amount=(s.prog!.items[item]??0)+1;
        s.prog!.items[item]=amount;room.state='done';
        note(s,L`道具房：取得${ITEM_NAMES[item]}，背包共${amount}`);progressCommission(s,'collector');
      }else if(room.type==='commission'){
        const commission=commissionOffer(s,room);
        if(commission)(s.pendingChoices??=[]).push({type:'commission',room:room.room,commission});
      }else if(room.type==='blessing'){
        queueBlessingChoice(s,'room',room.room);   // nothing is written when the room is entered: the log keeps what happens (the pick, the give-up)
      }
      return;
    }
    const p=s.points.find(p=>same(p.pos,u.pos))!;const stairs=p.kind==='down'||p.kind==='up';
    if(p.kind==='rest'){
      const parts:Msg[]=[];
      for(const t of restTargets(s)){const m=s.units[t.id],before=m.pp[t.skill]??0;m.pp[t.skill]=Math.min(m.maxPp[t.skill]??0,before+PROG.restPp);parts.push(L`${t.id}的${SKILL_CN[t.skill]}PP ${before}→${m.pp[t.skill]}`);}
      p.used=true;note(s,L`休整点：整理招式补给，${joined(parts,'，')}`);return;
    }
    if(isPickupKind(p.kind)){if(s.prog)tryPickup(s,id);else p.used=true;return;}
    if(!stairs&&!p.used){if(p.kind==='goal'){s.goal=true;if(s.prog)gainExp(s,PROG.goalExp);}
      if(p.kind==='item'){s.bag++;if(s.prog){
        {const r=rngStep(s.prog.rng);s.prog.rng=r.state;const pool=tmPool(s.dungeon),move=pool[Math.floor(r.value*pool.length)];queueTmItem(s,move,'target');note(s,L`${id}取得招式机：${move}`);}
      }}
      p.used=true;}
    if(a.exit)s.request={actor:id,pos:clone(u.pos!),locked:false,...(stairs?{to:s.dungeon!.level+(p.kind==='down'?1:-1)}:{})};
    note(s,stairs?L`${id}走${p.kind==='down'?'下':'上'}楼梯`:L`${id}交互${a.exit?'并请求撤离':''}`);
  }else{note(s,L`${id}等待`,{routine:true});emit(s,{type:'fail',unit:id,reason:'wait'});}
}
type MovePlan={id:string;pos:Pos};
function roomCells(r:Rect):Pos[]{const out:Pos[]=[];for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)out.push({x,y});return out;}
function roomBfs(s:World,r:Rect,start:Pos):Pos[]{
  if(!inRect(start,r)||!walk(s,start))return [];
  const out=[start],visited=new Set([key(start)]);
  for(let i=0;i<out.length;i++)for(const d of DIRS){const p=plus(out[i],d),k=key(p);if(inRect(p,r)&&walk(s,p)&&!visited.has(k)){visited.add(k);out.push(p);}}
  return out;
}
function challengeStartPlan(s:World,room:AdventureRoom,enemies:{id:string;species:string;level:number;hp:number;asleep:false}[]):{sealed:Pos[];enemyMoves:MovePlan[];friendMoves:MovePlan[];spawns:MovePlan[]}|null{
  const rect=s.rooms?.[room.room];if(!rect)return null;
  const sealed=[...new Map(room.doors.flatMap(door=>DIRS.map(d=>plus(door,d)).filter(p=>!inRect(p,rect)&&walk(s,p)).map(p=>[key(p),p] as const))).values()]
    .sort((a,b)=>a.y-b.y||a.x-b.x);
  const sealedKeys=new Set(sealed.map(key));
  const movingEnemies=s.enemies.filter(id=>{const u=s.units[id];return alive(u)&&sealedKeys.has(key(u.pos));});
  const outsideFriends=s.queue.filter(id=>{const u=s.units[id];return alive(u)&&!inRect(u.pos,rect);});
  const moving=new Set(movingEnemies);
  const occupied=new Set(active(s).filter(u=>!moving.has(u.id)).map(u=>key(u.pos!)));
  const enemyMoves:MovePlan[]=[];
  for(const id of movingEnemies){
    const u=s.units[id];if(!alive(u))continue;
    const target=s.floor.filter(p=>!sealedKeys.has(key(p))&&!inRect(p,rect)&&!occupied.has(key(p)))
      .sort((a,b)=>distance(u.pos,a)-distance(u.pos,b)||a.y-b.y||a.x-b.x)[0];
    if(!target)return null;
    occupied.add(key(target));enemyMoves.push({id,pos:clone(target)});
  }
  for(const id of outsideFriends){const u=s.units[id];if(alive(u))occupied.delete(key(u.pos));}
  const entry=s.units[s.leader]?.pos;if(!entry||!inRect(entry,rect))return null;
  const entryOrder=roomBfs(s,rect,entry);
  const friendMoves:MovePlan[]=[];
  for(const id of outsideFriends){
    const u=s.units[id];if(!alive(u))continue;
    const target=entryOrder.find(p=>!occupied.has(key(p)));
    if(!target)return null;
    occupied.add(key(target));friendMoves.push({id,pos:clone(target)});
  }
  const interaction=key(room.interaction),unavailablePoints=new Set(s.points.map(p=>key(p.pos)));
  const team=s.queue.map(id=>s.units[id]).filter(alive).map(u=>friendMoves.find(m=>m.id===u.id)?.pos??u.pos);
  const spawns:MovePlan[]=[];
  for(const enemy of enemies){
    const available=roomCells(rect).filter(p=>walk(s,p)&&key(p)!==interaction&&!unavailablePoints.has(key(p))&&!occupied.has(key(p)));
    if(!available.length)return null;
    const separated=available.filter(p=>team.every(ally=>chebyshev(ally,p)>1));   // 8.8: spawn cells diagonal to a team member count as adjacent; the push-away and "farthest cell" choices below stay Manhattan
    const pool=separated.length?separated:available;
    const ordered=pool.sort((a,b)=>Math.min(...team.map(t=>distance(t,a)))-Math.min(...team.map(t=>distance(t,b)))||b.y-a.y||b.x-a.x);
    const target=ordered[ordered.length-1];
    if(!target)return null;
    occupied.add(key(target));spawns.push({id:enemy.id,pos:clone(target)});
  }
  return {sealed,enemyMoves,friendMoves,spawns};
}
function startAdventureChallenge(s:World,room:AdventureRoom):boolean{
  const d=s.dungeon;if(!d?.roguelike||!s.prog)return false;
  const encounter=generateChallengeEncounter(d.seed,d.level,s.difficulty??'normal',!!d.boss,d.tmPool);
  const plan=challengeStartPlan(s,room,encounter.enemies);
  if(!plan)return false;
  for(const move of plan.enemyMoves){const u=s.units[move.id];u.pos=clone(move.pos);u.targetMemory=null;u.roamTarget=null;note(s,L`${move.id}被封门推到通道外${key(move.pos)}，不计入挑战`);}
  for(const id of s.queue){const u=s.units[id];if(alive(u)&&!inRect(u.pos,s.rooms![room.room]))s.units[id].pos=null;}
  for(const move of plan.friendMoves){s.units[move.id].pos=clone(move.pos);note(s,L`${move.id}随队入房到${key(move.pos)}`);}
  room.sealedCells=plan.sealed.map(clone);room.reward=encounter.reward;room.rewardCurrency=encounter.reward==='currency'||encounter.reward==='blessing'?encounter.currencyAmount:null;
  room.rewardItem=encounter.rewardItem;room.rewardMove=encounter.rewardMove;room.state='sealed';
  const battleEnemies=s.enemies.filter(id=>{const u=s.units[id];return alive(u)&&inRect(u.pos!,s.rooms![room.room]);});
  for(const move of plan.spawns){
    const spec=encounter.enemies.find(enemy=>enemy.id===move.id)!;
    const unit=speciesUnit(spec.id,spec.species,spec.level,move.pos);setUnitLoadout(unit,movesAtLevel(spec.species,spec.level));unit.side='enemy';unit.hp=spec.hp;unit.maxHp=spec.hp;unit.tactic='gofoes';
    unit.asleep=false;unit.wakeSkip=false;unit.targetMemory=null;unit.lostSightTurns=0;unit.roamTarget=null;unit.direction=null;
    s.units[unit.id]=unit;s.enemies.push(unit.id);battleEnemies.push(unit.id);
  }
  room.enemyIds=battleEnemies;
  const sealedKeys=new Set(plan.sealed.map(key));
  s.floor=s.floor.filter(p=>!sealedKeys.has(key(p)));
  const seen=new Set(s.seen),walls=new Set(s.seenWalls??[]);
  for(const p of plan.sealed){const k=key(p);if(seen.delete(k))walls.add(k);}
  s.seen=[...seen].sort();s.seenWalls=[...walls].sort();
  reveal(s);
  note(s,L`挑战开始：${encounter.enemies.length}只敌人`);
  return true;
}
function resolveAdventureStart(s:World):void{
  const pending=s.pendingAdventureStart;if(!pending)return;
  s.pendingAdventureStart=undefined;
  const room=s.adventureRooms?.find(r=>r.room===pending.room),actor=s.units[pending.actor];
  if(!room||room.type!=='challenge'||room.state!=='idle'||!alive(actor)||!same(actor.pos,pending.pos)){
    note(s,L`挑战未成立：主控已倒下或不在石碑上`);return;
  }
  if(!startAdventureChallenge(s,room))note(s,L`挑战未成立：房间没有足够的空格`);
}
/** One member's turn in a round, as the rules would run it (stage 7.1 preview). `explicit` is false for the default behaviour; `failed` means the action no longer applied and the member waited. */
export type TraceStep={id:string;action:Action;explicit:boolean;failed:boolean;swapWith?:string};
function decayOpponentStatuses(s:World,actedSide:Unit['side']):void {
  for(const u of Object.values(s.units))if(u.side!==actedSide){
    if(u.protect>0)u.protect--;if(u.counter>0)u.counter--;
    if((u.reflect??0)>0)u.reflect!--;if((u.lightscreen??0)>0)u.lightscreen!--;
  }
}
function wakeAdjacentEnemies(s:World):void {
  for(const id of s.enemies){const e=s.units[id];if(!alive(e)||!e.asleep)continue;
    if(s.queue.some(q=>alive(s.units[q])&&adjacent(s,e.pos,s.units[q].pos!))){e.asleep=false;e.wakeSkip=true;note(s,L`${id}被相邻的队员惊醒，本回合不行动`);}
  }
}
/** Why a unit's action is lost, as a code; the log text of each code is `BLOCK_TEXT` (a swap with a frozen partner has its own code). */
type BlockReason='frozen'|'nap'|'sleep'|'paralyzed'|'flinch';
const BLOCK_TEXT_PLAYER:Record<BlockReason,string>={frozen:'冰冻中，无法行动',nap:'打盹中，无法行动',sleep:'睡眠中，无法行动',paralyzed:'麻痹中，无法使用招式和普通攻击',flinch:'畏缩中，无法使用招式和普通攻击'};
const BLOCK_TEXT:Record<BlockReason,string>={frozen:'冰冻中，无法行动',nap:'打盹中，无法行动',sleep:'睡眠中，无法行动',paralyzed:'麻痹中，无法使用招式和普攻',flinch:'畏缩中，无法使用招式和普攻'};
/** 8.8 (G5.13): why the unit's chosen action cannot happen because of a status condition, or null. */
function statusBlock(u:Unit,a:Action):BlockReason|null {
  if(a.type==='wait')return null;
  if(hasStatus(u,'frz'))return 'frozen';
  if(sleeping(u))return hasStatus(u,'nap')?'nap':'sleep';
  if((a.type==='skill'||a.type==='basic'||a.type==='basicForward')&&hasStatus(u,'par'))return 'paralyzed';
  if((a.type==='skill'||a.type==='basic'||a.type==='basicForward')&&hasStatus(u,'flinch'))return 'flinch';
  return null;
}
/** 8.8 (G5.14): a confused member's chosen step is replaced by a random one of the eight directions; a step that cannot be taken leaves it standing (the action is still used). */
function confusedMove(s:World,id:string,chosen:Extract<Action,{type:'move'}>):Action {
  void chosen;
  const u=s.units[id] as Unit&{pos:Pos},dir=DIRS8[Math.floor(battleRandom(s)*8)],to=plus(u.pos,dir);
  const alt:Action={type:'move',to};
  if(invalid(s,id,alt)){note(s,L`${id}因混乱朝${DIR_NAMES[key(dir)]}乱走，被挡住，原地不动`);emit(s,{type:'fail',unit:id,reason:'confusedWander'});return {type:'wait'};}
  note(s,L`${id}因混乱朝${DIR_NAMES[key(dir)]}乱走`);emit(s,{type:'fail',unit:id,reason:'confusedWander'});return alt;
}
function ownPhase(s:World,cmd:Extract<Command,{type:'round'}>,preflight:boolean,trace?:TraceStep[]):string|null {
  const lead=s.leader,moved=new Set<string>(),friendGuard=new Set<string>(),enemyGuard=new Set<string>(),blockingFromEnemies=new Set(s.quickguard?.owner==='enemy'?s.quickguard.units:[]),leaderSleeping=sleeping(s.units[lead]);
  if(leaderSleeping&&cmd.override)return '主控睡眠时不能安排伙伴干预';
  if(cmd.override&&(cmd.override.actor===lead||!s.queue.includes(cmd.override.actor)||!alive(s.units[cmd.override.actor])))return '只能安排另一名存活伙伴';
  if(cmd.override?.action.type==='swap')return '换位须从主控发起';
  if(cmd.override?.action.type==='interact'||cmd.override?.action.type==='exchange')return '伙伴不能代替主控交互';
  const swap=!leaderSleeping&&cmd.action.type==='swap'?cmd.action.target:null;
  if(swap){if(cmd.override)return '换位已占唯一伙伴干预';const err=invalid(s,lead,cmd.action);if(err)return err;}
  const later=swap?Math.max(s.queue.indexOf(lead),s.queue.indexOf(swap)):-1;
  // 7.2 exchanger: the leader's whole action. The companion leaves at once (it takes no further part this round), then everyone else acts as usual.
  // 8.8: a frozen leader cannot operate it; then the command falls through to the normal turn below, where the action is lost.
  const ex=!leaderSleeping&&cmd.action.type==='exchange'&&!statusBlock(s.units[lead],cmd.action)?cmd.action:null;
  if(ex){const err=invalid(s,lead,ex);if(err)return err;if(cmd.override?.actor===ex.target)return '被送走的伙伴不能同时被安排动作';
    sendHome(s,ex);trace?.push({id:lead,action:ex,explicit:true,failed:false});}
  const order=[...s.queue];
  for(let i=0;i<order.length;i++){const id=order[i];if(!s.queue.includes(id)||!alive(s.units[id])||(ex&&id===lead)){if(ex&&id===lead&&alive(s.units[id]))endOwnTurn(s,id);continue;}
    // 8.8: whatever happens in this turn (even a swap or a refused action), it counts as one of the member's own action opportunities.
    try{
    if(swap&&(id===lead||id===swap)){
      if(i===later){const err=invalid(s,lead,cmd.action);if(err){if(preflight)return err;continue;}
        // 8.8: a frozen leader or a frozen partner turns the swap into a lost action (no PP); a confused leader's swap becomes a random step instead.
        const blockedBy=statusBlock(s.units[lead],cmd.action)??(hasStatus(s.units[swap],'frz')?'swapPartnerFrozen' as const:null);
        if(blockedBy){s.units[lead].lastMove=null;note(s,L`${lead}${blockedBy==='swapPartnerFrozen'?'的换位对象冰冻中':BLOCK_TEXT[blockedBy]}，换位落空，未扣PP`,{player:L`${lead}${blockedBy==='swapPartnerFrozen'?'的换位对象冰冻中':BLOCK_TEXT_PLAYER[blockedBy]}，换位落空，未扣PP`});emit(s,{type:'fail',unit:lead,reason:blockedBy});trace?.push({id:lead,action:cmd.action,explicit:true,failed:true});continue;}
        if(hasStatus(s.units[lead],'confusion')){const step=confusedMove(s,lead,{type:'move',to:s.units[swap].pos!});
          const mate2=step.type==='move'?allyAt(s,lead,step.to):undefined;execute(s,lead,step,blockingFromEnemies,friendGuard);if(step.type==='move')moved.add(lead);trace?.push({id:lead,action:step,explicit:true,failed:false,...(mate2?{swapWith:mate2.id}:{})});continue;}
        const p=s.units[lead].pos,q=s.units[swap].pos;if(p&&q){faceToward(s.units[lead],p,q);faceToward(s.units[swap],q,p);onRoomEntry(s,p,q);onRoomEntry(s,q,p);}
        s.units[lead].pos=q;s.units[swap].pos=p;s.units[lead].lastMove=null;s.units[swap].lastMove=null;moved.add(lead);moved.add(swap);reveal(s);note(s,L`${lead}与${swap}换位`,{routine:true});emit(s,{type:'swap',unit:lead,mate:swap});tryPickup(s,lead);tryPickup(s,swap);trace?.push({id:lead,action:cmd.action,explicit:true,failed:false,swapWith:swap});}continue;}
    const explicit=id===lead?(leaderSleeping?{type:'wait'} as Action:cmd.action):cmd.override?.actor===id?cmd.override.action:null;
    let a=explicit??defaultAction(s,id,blockingFromEnemies,friendGuard);const err=invalid(s,id,a,moved);
    if(err){if(explicit&&preflight)return err;s.units[id].lastMove=null;note(s,L`${id}动作失效，等待，未扣PP`);emit(s,{type:'fail',unit:id,reason:'invalid'});trace?.push({id,action:a,explicit:!!explicit,failed:true});continue;}
    // 8.8: a frozen member cannot act; a paralysed or flinching one cannot use moves or basic attacks. The command is accepted and the action is lost (no PP is spent).
    const lost=statusBlock(s.units[id],a);
    if(lost){s.units[id].lastMove=null;note(s,L`${id}${BLOCK_TEXT[lost]}，本次行动落空，未扣PP`,{player:L`${id}${BLOCK_TEXT_PLAYER[lost]}，本次行动落空，未扣PP`});emit(s,{type:'fail',unit:id,reason:lost});trace?.push({id,action:a,explicit:!!explicit,failed:true});continue;}
    if(a.type==='move'&&hasStatus(s.units[id],'confusion'))a=confusedMove(s,id,a);
    const mate=a.type==='move'?allyAt(s,id,a.to):undefined;
    execute(s,id,a,blockingFromEnemies,friendGuard);if(a.type==='move')moved.add(id);trace?.push({id,action:a,explicit:!!explicit,failed:false,...(mate?{swapWith:mate.id}:{})});
    }finally{endOwnTurn(s,id);}
  }
  if(preflight)return null;
  decayOpponentStatuses(s,'friend');
  s.quickguard=friendGuard.size?{owner:'friend',units:[...friendGuard]}:undefined;
  for(const id of s.enemies){const e=s.units[id];if(!alive(e))continue;
    try{
    if(e.asleep)continue;if(e.wakeSkip){e.wakeSkip=false;continue;}
    let action=chooseEnemyAction(s,id,friendGuard,enemyGuard);
    // 8.8: a frozen enemy cannot act; a paralysed or flinching one cannot use moves or basic attacks; a confused one walks in a random direction.
    const lost=statusBlock(e,action);
    if(lost){note(s,L`${id}${BLOCK_TEXT[lost]}`,{player:L`${id}${BLOCK_TEXT_PLAYER[lost]}`});emit(s,{type:'fail',unit:id,reason:lost});continue;}
    const visibleIds=new Set(s.queue.map(q=>s.units[q]).filter(t=>alive(t)&&currentlyVisible(s,e.pos,t.pos)).map(t=>t.id));
    if(!e.waitOnly&&!sleeping(e)&&!hasStatus(e,'frz')&&!hasStatus(e,'par')&&!hasStatus(e,'flinch')){
      const disrupt=enemyDisruptAction(s,id,friendGuard,visibleIds);
      if(disrupt&&battleRandom(s)<0.3)action=disrupt;
    }
    if(action.type==='move'&&hasStatus(e,'confusion')){const to=plus(e.pos,DIRS8[Math.floor(battleRandom(s)*8)]);note(s,L`${id}因混乱乱走`);emit(s,{type:'fail',unit:id,reason:'confusedWander'});action={type:'move',to};}
    if(action.type==='move'){
      if(!walk(s,action.to)||occupied(s,action.to)||!stepOk(s,e.pos,action.to)||!bossMayStand(s,e,action.to)){note(s,L`${id}无路可走，等待`,{routine:true});emit(s,{type:'fail',unit:id,reason:'noPath'});continue;}
      const previous=clone(e.pos);execute(s,id,action,friendGuard,enemyGuard);e.direction={x:Math.sign(action.to.x-previous.x),y:Math.sign(action.to.y-previous.y)};
      if(e.roamTarget&&same(action.to,e.roamTarget))e.roamTarget=null;
    }else if(action.type==='skill'||action.type==='basic'||action.type==='basicForward')execute(s,id,action,friendGuard,enemyGuard);
    else{note(s,L`${id}等待`,{routine:true});emit(s,{type:'fail',unit:id,reason:'wait'});}
    }finally{endOwnTurn(s,id);}
  }
  statusRoundEnd(s);
  decayOpponentStatuses(s,'enemy');wakeAdjacentEnemies(s);
  s.quickguard=enemyGuard.size?{owner:'enemy',units:[...enemyGuard]}:undefined;
  return null;
}
/** 7.3: the boss unit of a boss-marked run, wherever its floor is kept (current floor or stored), or undefined (not marked, or its floor was never generated). */
export function bossUnit(s:World):Unit|undefined {
  if(!s.dungeon?.boss)return undefined;
  return Object.values(s.units).find(u=>u.boss)??Object.values(s.dungeon.stored).flatMap(f=>Object.values(f.units)).find(u=>u.boss);
}
/** 7.3 "defeated": the boss exists and its HP is 0. */
export const bossDefeated=(s:World):boolean=>bossUnit(s)?.hp===0;
/** 7.2: a run started before the base existed has no profile; its A, B and C are the three founding starters and count as protected. */
const legacyStarter=(s:World,id:string)=>!s.dungeon?.base&&s.units[id].inst===undefined&&(id==='A'||id==='B'||id==='C');
export const isProtected=(s:World,id:string)=>s.units[id].protected===true||legacyStarter(s,id);
/** A unit made in this run (not from the roster and not a founding starter): the kind that counts as a new result when it is kept. */
export const isRecruit=(s:World,id:string)=>s.units[id].inst===undefined&&!legacyStarter(s,id)&&!!s.units[id].species;
/**
 * 7.2 end-of-run processing point, one fixed order, saved together with the end record (a reload never redraws or recomputes it):
 * 1. technique machines still held get their final fate; 2. in a wipe, each unprotected team member draws once from the saved stream (`prog.rng`)
 * and goes missing when the value is below `ECON.loseChance`; 3. the effective-expedition judgement and the reward; 4. the purse refund (normal exit only).
 */
export function reasonsOf(s:World):string[] {
  const reasons:string[]=[];
  if(s.goal)reasons.push('goal');
  if([...s.queue,...s.camp,...(s.exchange?.sent?[s.exchange.sent]:[])].some(id=>isRecruit(s,id)))reasons.push('recruit');
  if((s.tms??[]).some(t=>t.fate==='brought'||t.fate==='sent'))reasons.push('tm');
  return reasons;
}
/** Builds the end record and applies its side effects on the world (machine fates, the wipe draw's random state), without changing the phase. `draw` false skips the wipe draw (an old, already settled history record: nobody is marked as missing). */
export function closeOut(s:World,outcome:End['outcome'],draw=true):End {
  const wipe=outcome==='wipe',roguelike=s.dungeon?.roguelike===true;
  const e:End={id:`${s.runId}:end`,outcome,team:[...s.queue],camp:[...s.camp],goal:s.goal,acquired:s.bag,brought:wipe?0:s.bag};
  if(roguelike)s.purse=0;
  if(s.prog){
    const tms=s.tms??(s.tms=[]);
    if(roguelike){
      if(outcome==='won'||wipe)for(const t of tms)t.fate=wipe?'lost':'brought';
    }else for(const t of tms)if(t.fate==='held')t.fate=wipe?'lost':'brought';
    const lost:string[]=[];
    if(wipe&&draw&&!roguelike)for(const id of s.queue){if(isProtected(s,id))continue;const r=rngStep(s.prog.rng);s.prog.rng=r.state;if(r.value<ECON.loseChance)lost.push(id);}
    const reasons=reasonsOf(s);
    const purse=roguelike?0:s.purse??0;
    Object.assign(e,{...(s.dungeon?.boss?{boss:bossDefeated(s)}:{}),tms:clone(tms),lost,effective:reasons.length>0,reasons,reward:roguelike?0:s.goal?ECON.reward:0,purse,refund:roguelike||wipe?0:purse});
  }
  return e;
}
function end(s:World,outcome:End['outcome']):void {
  clearCombatState(s);
  s.end=closeOut(s,outcome);
  s.commissions=undefined;s.pendingChoices=undefined;s.pendingEnd=undefined;
  s.phase='ended';s.request=null;s.anchor=null;note(s,outcome==='won'?L`首领被击败，本局胜利`:outcome==='normal'?L`正常撤离`:L`全队倒下，本局结束`);
}
function clearUnitCombatState(u:Unit):void {
  u.stages={atk:0,def:0};u.protect=0;u.counter=0;u.lastMove=null;
  u.reflect=0;u.lightscreen=0;delete u.status;
}
function clearCombatState(s:World):void {
  for(const u of Object.values(s.units))clearUnitCombatState(u);
  for(const floor of Object.values(s.dungeon?.stored??{}))for(const u of Object.values(floor.units))clearUnitCombatState(u);
  s.quickguard=undefined;
}
/** After invitations are done: a locked plain request waits as `exit`, a locked stairs request as `transit`. */
const settled=(s:World):World['phase']=>s.request?.locked?(s.request.to!==undefined?'transit':'exit'):'playing';
/**
 * 6.4 round-end settlement, in one fixed order: experience from this round's defeats, level-ups, then the recruit draws in defeat order.
 * A level-up raises every current member's max HP (current HP unchanged, R07); recruit snapshots are taken after it, at the settled level.
 */
function refreshPartyLevel(s:World):void {
  const level=s.prog?.level??INITIAL_LEVEL;
  for(const id of s.queue){const u=s.units[id],previous=u.level??INITIAL_LEVEL;u.level=level;
    const max=u.species?vitalityMaxHp(u.species,level,s.talents?.vitality??0):u.maxHp+Math.max(0,level-previous);
    u.maxHp=max;u.hp=Math.min(u.hp,max);
  }
}
function evolveUnit(s:World,id:string,species:string):void {
  const u=s.units[id],level=u.level??s.prog?.level??INITIAL_LEVEL,before=u.hp;u.species=species;u.level=level;
  u.maxHp=vitalityMaxHp(species,level,s.talents?.vitality??0);u.hp=Math.min(before,u.maxHp);note(s,L`${id}进化为${species}，生命上限${u.maxHp}，当前HP${u.hp}`);
}
function recordKnown(u:Unit,move:string):boolean{return u.learned.includes(move);}
function queueLearnMove(s:World,actor:string,entry:KitMove):void {
  const u=s.units[actor];if(!alive(u)||!u.species||recordKnown(u,entry.move))return;
  if(s.pendingLearnMoves?.some(p=>p.actor===actor&&p.move===entry.move))return;
  if(u.learned.length<4){u.learned.push(entry.move);u.pp[entry.move]=entry.pp;u.maxPp[entry.move]=entry.pp;note(s,L`${actor}学会了招式：${SKILL_CN[entry.move]??entry.move}`);}
  else (s.pendingLearnMoves??=[]).push({actor,move:entry.move,pp:entry.pp});
}
function queueLevelUpMoves(s:World,from:number,to:number):void {
  if(to<=from)return;
  for(const actor of s.queue){const u=s.units[actor];if(!alive(u)||!u.species)continue;
    const records=SPECIES[u.species]?.levelUp??[];
    for(let level=from+1;level<=to;level++)for(const entry of records)if(entry.level===level)queueLearnMove(s,actor,entry);
  }
}
function queuePostEvolutionMoves(s:World,actor:string):void {
  const u=s.units[actor];if(!alive(u)||!u.species)return;
  const level=s.prog?.level??u.level??INITIAL_LEVEL;
  for(const entry of SPECIES[u.species]?.levelUp??[])if(entry.level===0||entry.level===level)queueLearnMove(s,actor,entry);
}
function advanceAfterLevelGrowth(s:World):void {
  const living=s.queue.find(id=>alive(s.units[id]));
  if(living&&!alive(s.units[s.leader]))s.leader=living;
  if(s.pendingLearnMoves?.length){s.phase='learning';return;}
  if(s.pendingEvolutions!==undefined){
    if(s.pendingEvolutions.length){s.phase='evolution';return;}
    s.pendingEvolutions=undefined;finishRoundSettlement(s);return;
  }
  const pending=findEvolutions(s);s.pendingEvolutions=pending;
  if(s.pendingLearnMoves?.length){s.phase='learning';return;}
  if(pending.length){s.phase='evolution';note(s,L`队伍成长后出现进化选择`);return;}
  s.pendingEvolutions=undefined;finishRoundSettlement(s);
}
function findEvolutions(s:World):{actor:string;choices:string[]}[] {
  const p=s.prog;if(!p)return [];
  const pending:{actor:string;choices:string[]}[]=[];
  for(const id of s.queue){const u=s.units[id];if(!alive(u)||!u.species)continue;
    const choices=(SPECIES[u.species]?.evos??[]).filter(id=>!!SPECIES[id]);if(!choices.length)continue;
    const at=Math.min(...choices.map(id=>SPECIES[id].evoLevel));if(p.level<at||u.deferredEvolutionLevel===p.level)continue;
    if(choices.length===1){evolveUnit(s,id,choices[0]);queuePostEvolutionMoves(s,id);}else pending.push({actor:id,choices});
  }
  return pending;
}
function drawRecruitmentAndBossTm(s:World):void {
  const p=s.prog,settlement=s.pendingSettlement;if(!settlement)return;
  if(!p){s.pendingSettlement=undefined;return;}
  if(settlement.bossDrop){
    {const r=rngStep(p.rng);p.rng=r.state;const pool=tmPool(s.dungeon),move=pool[Math.floor(r.value*pool.length)];
      (s.tms??=[]).push({move,source:'boss',fate:'held'});note(s,L`区域首领被讨伐，掉落招式机：${move}（持有中）`);}
  }
  for(const sp of settlement.kills){
    if(!speciesOf(sp))continue;
    const r=rngStep(p.rng);p.rng=r.state;
    const recruitChance=(s.blessings??[]).includes('rally')?(BLESSINGS.rally.recruitChance??PROG.recruitChance):PROG.recruitChance;
    if(r.value>=recruitChance)continue;
    do p.made++;while(s.units[`N${p.made}`]||s.invitations.some(i=>i.unit.id===`N${p.made}`));
    const unit=recruitUnit(`N${p.made}`,sp,p.level,s.talents?.vitality??0);
    s.invitations.push({id:`${s.runId}:invite:${s.invitations.length+1}`,unit,status:'pending'});
    note(s,L`${sp}被击败并发出邀请：${unit.id} Lv${p.level} ${unit.hp}/${unit.maxHp}HP`);
  }
  s.pendingSettlement=undefined;
}
function isDownRequestEstablished(s:World):boolean{return !!s.request?.locked&&s.request.to!==undefined&&s.request.to>(s.dungeon?.level??0);}
function updateSpeedrunProgress(s:World):void {
  const down=isDownRequestEstablished(s);
  for(const c of [...(s.commissions??[])].filter(v=>v.id==='speedrun')){
    const elapsed=Math.max(1,s.round-c.acceptedRound+1);c.progress=elapsed;
    if(!down&&c.speedLimit!==null&&elapsed>c.speedLimit)failCommission(s,c,'超过限时');
  }
}
function settleDownCommissions(s:World):void {
  if(!isDownRequestEstablished(s))return;
  const active=[...(s.commissions??[])];
  for(const c of active){
    if(c.id==='guardian'&&s.queue.every(id=>alive(s.units[id]))){c.progress=1;finishCommission(s,c);}
    else if(c.id==='speedrun'&&c.speedLimit!==null&&s.round-c.acceptedRound+1<=c.speedLimit){c.progress=Math.max(c.progress,s.round-c.acceptedRound+1);finishCommission(s,c);}
    else if(c.id==='scout'&&c.progress>=1)finishCommission(s,c);
  }
  for(const c of [...(s.commissions??[])])failCommission(s,c,'本层下楼时尚未完成');
}
function openAdventureRoom(s:World,room:AdventureRoom):void{
  const keys=new Set((room.sealedCells??[]).map(key)),floor=new Set(s.floor.map(key));
  for(const p of room.sealedCells??[])if(!floor.has(key(p))){s.floor.push(clone(p));floor.add(key(p));}
  const seen=new Set(s.seen),walls=new Set(s.seenWalls??[]);
  for(const k of keys){walls.delete(k);seen.add(k);}
  s.seen=[...seen].sort();if(walls.size)s.seenWalls=[...walls].sort();else delete s.seenWalls;
  room.sealedCells=[];room.state='cleared';reveal(s);
}
function awardAdventureChallenge(s:World,room:AdventureRoom):void{
  const amount=room.rewardCurrency??40;
  if(room.reward==='currency'){
    s.purse=(s.purse??0)+amount;rewardNote(s,L`钱袋+${amount}（当前零钱${s.purse}）`);
  }else if(room.reward==='blessing'){
    if(queueBlessingChoice(s,'challenge',room.room))rewardNote(s,L`祝福`);
    else rewardNote(s,L`没有尚未拥有且适用于本层的祝福可选`);
  }else if(room.reward==='item'&&room.rewardItem&&s.prog){
    const item=room.rewardItem,count=(s.prog.items[item]??0)+1;s.prog.items[item]=count;
    rewardNote(s,L`道具${ITEM_NAMES[item]}入包（共${count}件）`);progressCommission(s,'collector');
  }else if(room.reward==='tm'&&room.rewardMove){
    queueTmItem(s,room.rewardMove,'challenge');
    rewardNote(s,L`招式机${room.rewardMove}入包`);
  }
}
/** Returns true only when a challenge reward invitation has just been issued and must be answered first. */
function completeAdventureIfReady(s:World):boolean{
  const rooms=s.adventureRooms??[];
  const room=rooms.find(r=>r.type==='challenge'&&r.state==='sealed'&&r.enemyIds.length>0&&r.enemyIds.every(id=>(s.units[id]?.hp??0)<=0));
  if(!room)return false;
  if(room.reward==='invite'){
    const p=s.prog,species=s.units[`c${s.dungeon?.level??1}a`]?.species;
    if(p&&species){
      do p.made++;while(s.units[`N${p.made}`]||s.invitations.some(i=>i.unit.id===`N${p.made}`));
      const unit=recruitUnit(`N${p.made}`,species,p.level,s.talents?.vitality??0);
      s.invitations.push({id:`${s.runId}:invite:${s.invitations.length+1}`,unit,status:'pending'});
      openAdventureRoom(s,room);s.anchor=clone(s.units[s.leader].pos!);s.phase='invitation';
      rewardNote(s,L`邀请${species}/${unit.id}已送入现有邀请流程`);return true;
    }
    rewardNote(s,L`无法取得首只挑战敌人的物种，奖励邀请未能发出`);
  }else awardAdventureChallenge(s,room);
  openAdventureRoom(s,room);
  return false;
}
function finishRoundSettlement(s:World):void {
  if(updateLevelsAfterCommissionReward(s))return;
  drawRecruitmentAndBossTm(s);
  const living=s.queue.find(i=>alive(s.units[i]));
  if(!living){
    s.invitations.forEach(i=>{if(i.status==='pending')i.status='cancelled';});
    const outcome=s.dungeon?.roguelike&&bossDefeated(s)?'won':'wipe';
    if(outcome==='won'&&s.pendingChoices?.length){s.pendingEnd=outcome;setPendingChoicePhase(s);return;}
    end(s,outcome);return;
  }
  if(!alive(s.units[s.leader]))s.leader=living;
  if(s.invitations.some(i=>i.status==='pending')){s.anchor=clone(s.units[s.leader].pos);s.phase='invitation';}
  else if(completeAdventureIfReady(s))return;
  else if(updateLevelsAfterCommissionReward(s))return;
  else if(setPendingChoicePhase(s))return;
  else if(s.dungeon?.roguelike&&bossDefeated(s))end(s,'won');
  else s.phase=settled(s);
}

function afterRound(s:World):void {
  if(hasBless(s,'regen')&&s.round>0&&s.round%(BLESSINGS.regen.every??10)===0)for(const id of s.queue){const m=s.units[id];if(alive(m))healUnit(s,id,Math.max(1,Math.floor(m.maxHp*(BLESSINGS.regen.value??0.05))),'再生');}
  resolveAdventureStart(s);
  if(s.request){const u=s.units[s.request.actor];if(alive(u)&&same(u.pos,s.request.pos))s.request.locked=true;else s.request=null;}
  settleDownCommissions(s);
  const bossWin=!!s.dungeon?.roguelike&&bossDefeated(s);
  updateSpeedrunProgress(s);
  if(!s.queue.some(i=>alive(s.units[i]))&&!bossWin){s.invitations.forEach(i=>{if(i.status==='pending')i.status='cancelled';});if(s.prog)s.prog.kills=[];end(s,'wipe');return;}
  const p=s.prog,kills=p?[...p.kills]:[];if(p)p.kills=[];
  const bossDrop=!!s.dungeon?.boss&&bossDefeated(s)&&!(s.tms??[]).some(t=>t.source==='boss');
  const previousLevel=p?.level??INITIAL_LEVEL;
  if(p)while(p.level<PROG.maxLevel&&p.exp>=PROG.thresholds[p.level+1]){p.level++;refreshPartyLevel(s);note(s,L`升到 Lv${p.level}`);}
  s.pendingSettlement={bossDrop,kills};
  queueLevelUpMoves(s,previousLevel,p?.level??previousLevel);
  s.pendingEvolutions=undefined;advanceAfterLevelGrowth(s);
}

export type InvitationPreview={ok:true;pos:Pos;queue:string[];leader:string}|{ok:false;error:string};
export function previewInvitation(s:World,outgoing?:string):InvitationPreview {
  if(s.phase!=='invitation'||!s.anchor)return {ok:false,error:'当前没有待处理邀请'};
  const invite=s.invitations.find(i=>i.status==='pending');if(!invite)return {ok:false,error:'邀请已处理'};
  if(outgoing&&!s.queue.includes(outgoing))return {ok:false,error:'回营对象不在同行名单'};
  if(s.queue.length>=PARTY_LIMIT&&!outgoing)return {ok:false,error:'满员须选择回营对象'};
  const q=s.queue.filter(i=>i!==outgoing);const aliveUnits=[...q,...s.enemies].map(i=>s.units[i]).filter(alive);
  const pos=[s.anchor,...DIRS.map(d=>plus(s.anchor!,d))].find(p=>walk(s,p)&&s.seen.includes(key(p))&&!aliveUnits.some(u=>same(u.pos,p)));
  if(!pos)return {ok:false,error:'集结格附近没有合法位置；可改选或拒绝'};
  const queue=[...q,invite.unit.id];const leader=outgoing===s.leader?q.find(i=>alive(s.units[i]))??invite.unit.id:s.leader;
  return {ok:true,pos:clone(pos),queue,leader};
}
/**
 * Stage 7.1: what each member would do this round, in execution order, by running the same round code on a copy. Nothing is executed on `original`.
 * Returns null when the command would be refused. The enemy phase always follows the last step.
 */
export function traceRound(original:World,cmd:Command):TraceStep[]|null {
  if(cmd.type!=='round'||original.phase!=='playing')return null;
  if(ownPhase(clone(original),cmd,true)!==null)return null;
  const steps:TraceStep[]=[];ownPhase(clone(original),cmd,false,steps);return steps;
}
/** Names the first reason a purchase cannot happen now, or null. */
export function buyProblem(s:World,item:ShopItem):string|null {
  const sh=s.shop,lead=s.units[s.leader];
  if(s.phase!=='playing')return '先处理邀请、撤离或终局';
  if(!sh||!s.prog||s.dungeon?.level!==sh.level)return '这里没有商店';
  const point=lead?.pos?s.points.find(p=>same(p.pos,lead.pos)):undefined;
  if(!point||point.kind!=='shop')return '主控必须站在商店格上才能购买';
  if(!(item in ECON.price))return '没有这种商品';
  if(item==='tm'?sh.stock.tm===null:(sh.stock[item]??0)<1)return '这件商品已售罄，库存不会刷新';
  const price=ECON.price[item],purse=s.purse??0;
  if(purse<price)return `钱袋不足：需要${price}，还差${price-purse}`;
  return null;
}
function buy(original:World,item:ShopItem):World {
  const s=clone(original),sh=s.shop!,price=ECON.price[item];
  s.purse=(s.purse??0)-price;sh.trades.push({item,price});
  if(item==='tm'){(s.tms??=[]).push({move:sh.stock.tm!,source:'shop',fate:'held'});note(s,L`${s.leader}在商店买下招式机：${sh.stock.tm}，花费${price}`);sh.stock.tm=null;}
  else{sh.stock[item]=(sh.stock[item]??0)-1;const amount=(s.prog!.items[item]??0)+1;s.prog!.items[item]=amount;note(s,L`${s.leader}在商店买下${ITEM_NAMES[item]}，花费${price}，背包共${amount}`);}
  return s;
}
function resumeAfterChoice(s:World):void {
  if(setPendingChoicePhase(s))return;
  if(s.pendingEnd){const outcome=s.pendingEnd;s.pendingEnd=undefined;end(s,outcome);return;}
  if(s.invitations.some(i=>i.status==='pending')){s.anchor=clone(s.units[s.leader]?.pos??{x:0,y:0});s.phase='invitation';return;}
  s.anchor=null;
  if(s.dungeon?.roguelike&&bossDefeated(s))end(s,'won');else s.phase=settled(s);
}
/** Robot-only choice for level-up prompts: replace the first lowest-power move only when the new move is stronger. */
export function defaultLearningCommand(s:World):Extract<Command,{type:'learnMove'}>|null {
  const pending=s.pendingLearnMoves?.[0],unit=pending?s.units[pending.actor]:undefined;if(!pending||!unit)return null;
  const power=(move:string)=>moveOf(move)?.power??0;
  if(!unit.learned.length)return {type:'learnMove',replace:null};
  let weakest=unit.learned[0],minimum=power(weakest);
  for(const move of unit.learned.slice(1)){const value=power(move);if(value<minimum){weakest=move;minimum=value;}}
  return power(pending.move)>minimum?{type:'learnMove',replace:weakest}:{type:'learnMove',replace:null};
}
export function applyCommand(original:World,cmd:Command):Result {
  const fail=(error:string):Result=>({ok:false,state:original,error:`${error}；本回合未执行`});
  if(cmd.type==='learnMove'){
    if(original.phase!=='learning'||!original.pendingLearnMoves?.length)return fail('当前没有待处理的学招选择');
    const pending=original.pendingLearnMoves[0],unit=original.units[pending.actor];
    if(!alive(unit)||!original.queue.includes(pending.actor))return fail('学招对象已不在同行队伍');
    if(cmd.replace!==null&&!unit.learned.includes(cmd.replace))return fail('所选替换招式不在当前携带列表中');
    const s=clone(original),choice=s.pendingLearnMoves![0],learner=s.units[choice.actor];
    if(cmd.replace!==null){
      const slot=learner.learned.indexOf(cmd.replace);learner.learned[slot]=choice.move;
      delete learner.pp[cmd.replace];delete learner.maxPp[cmd.replace];
      learner.pp[choice.move]=choice.pp;learner.maxPp[choice.move]=choice.pp;
      note(s,L`${choice.actor}用${SKILL_CN[choice.move]??choice.move}替换了${SKILL_CN[cmd.replace]??cmd.replace}`);
    }else note(s,L`${choice.actor}放弃学习${SKILL_CN[choice.move]??choice.move}`);
    s.pendingLearnMoves!.shift();
    if(s.pendingLearnMoves!.length)s.phase='learning';
    else{s.pendingLearnMoves=undefined;advanceAfterLevelGrowth(s);}
    return {ok:true,state:s};
  }
  if(cmd.type==='commissionChoice'){
    const pending=original.pendingChoices?.[0];
    if(original.phase!=='commission'||pending?.type!=='commission')return fail('当前没有待处理的委托选择');
    const room=original.adventureRooms?.find(r=>r.room===pending.room);
    if(!room||room.type!=='commission'||room.state!=='idle')return fail('委托房状态已变化，无法处理选择');
    if(cmd.choice==='accept'&&(original.commissions?.length??0)>=3)return fail('同时只能接下3条委托');
    const s=clone(original),choice=s.pendingChoices!.shift() as Extract<PendingChoice,{type:'commission'}>,target=s.adventureRooms!.find(r=>r.room===choice.room)!;
    target.state='done';
    if(cmd.choice==='accept'){
      const def=COMMISSIONS[choice.commission],speedLimit=choice.commission==='speedrun'?speedLimitFor(s,target):null;
      if(choice.commission==='speedrun'&&speedLimit===null)return fail('委托点与楼梯之间没有可走路线');
      const progress=choice.commission==='speedrun'?1:0,progressTarget=speedLimit??def.progressTarget??1;
      (s.commissions??=[]).push({id:choice.commission,floor:currentFloorLevel(s),acceptedRound:s.round,progress,progressTarget,speedLimit});
      note(s,L`接下委托：${def.name}${speedLimit===null?'':`，限${speedLimit}回合`}`);
    }else note(s,L`拒绝委托`);
    resumeAfterChoice(s);return {ok:true,state:s};
  }
  if(cmd.type==='blessingChoice'){
    const pending=original.pendingChoices?.[0];if(original.phase!=='blessing'||pending?.type!=='blessing')return fail('当前没有待处理的祝福选择');
    if(cmd.blessing!==null&&!pending.options.includes(cmd.blessing))return fail('所选祝福不在本次选项中');
    if(cmd.blessing!==null&&(original.blessings??[]).includes(cmd.blessing))return fail('该祝福已经拥有');
    if(pending.source==='room'){
      const room=original.adventureRooms?.find(r=>r.room===pending.room);if(!room||room.type!=='blessing'||room.state!=='idle')return fail('祝福房状态已变化，无法处理选择');
    }
    const s=clone(original),choice=s.pendingChoices!.shift() as Extract<PendingChoice,{type:'blessing'}>;
    if(choice.source==='room')s.adventureRooms!.find(r=>r.room===choice.room)!.state='done';
    if(cmd.blessing===null)note(s,L`放弃祝福`);else applyBlessing(s,cmd.blessing);
    resumeAfterChoice(s);return {ok:true,state:s};
  }
  if(cmd.type==='blessingRefresh'){
    const pending=original.pendingChoices?.[0];if(original.phase!=='blessing'||pending?.type!=='blessing')return fail('当前没有待处理的祝福选择');
    if((original.blessingRefreshes??0)<=0)return fail('没有刷新次数了');
    const s=clone(original),choice=s.pendingChoices![0] as Extract<PendingChoice,{type:'blessing'}>;
    s.blessingRefreshes=(s.blessingRefreshes??0)-1;s.blessingRefreshUsed=(s.blessingRefreshUsed??0)+1;
    choice.options=blessingOffer(s,choice.source,choice.room,`refresh${s.blessingRefreshUsed}`,choice.options);
    note(s,L`刷新祝福，还剩${s.blessingRefreshes}次`);
    return {ok:true,state:s};
  }
  if(cmd.type==='tmChoice'){
    const pending=original.pendingChoices?.[0];if(original.phase!=='tmChoice'||pending?.type!=='tmChoice')return fail('当前没有待处理的招式机选择');
    if(!pending.options.includes(cmd.move))return fail('所选招式不在本次选项中');
    const s=clone(original),choice=s.pendingChoices!.shift() as Extract<PendingChoice,{type:'tmChoice'}>;
    (s.tms??=[]).push({move:cmd.move,source:choice.source,fate:'held'});note(s,L`取得${choice.source==='challenge'?'挑战奖励':choice.source==='boss'?'首领掉落':choice.source==='blessing'?'祝福奖励':'目标奖励'}招式机：${cmd.move}`);
    resumeAfterChoice(s);return {ok:true,state:s};
  }
  if(cmd.type==='abandon'){
    if(original.phase==='ended'||!original.prog)return fail('当前没有可以放弃的探险');
    if(original.pendingEnd==='won'||(original.dungeon?.roguelike&&bossDefeated(original)))return fail('首领已经倒下，本局会以胜利结算，不能再放弃');
    const s=clone(original);note(s,L`队伍放弃了探险`);
    s.invitations.forEach(i=>{if(i.status==='pending')i.status='cancelled';});
    s.prog!.kills=[];s.pendingSettlement=undefined;s.pendingLearnMoves=undefined;s.pendingEvolutions=undefined;s.pendingEnd=undefined;
    end(s,'wipe');return {ok:true,state:s};
  }
  if(cmd.type==='tactic'){
    const unit=original.units[cmd.actor];
    if(original.phase!=='playing'||!original.queue.includes(cmd.actor)||!alive(unit))return fail('只能更改当前存活的同行单位方针');
    if(!isTactic(cmd.tactic))return fail('未知的作战方针');
    const s=clone(original);s.units[cmd.actor].tactic=cmd.tactic;return {ok:true,state:s};
  }
  if(cmd.type==='face'){
    const leader=original.leader,unit=original.units[leader];
    if(original.phase!=='playing'||!original.queue.includes(leader)||!alive(unit))return fail('只有存活的当前主控能转向');
    if(!isDirection(cmd.direction))return fail('朝向必须是八个相邻方向之一');
    const s=clone(original);s.units[leader].facing=clone(cmd.direction);return {ok:true,state:s};
  }
  if(cmd.type==='evolve'){
    if(original.phase!=='evolution'||!original.pendingEvolutions?.length)return fail('当前没有待处理的进化选择');
    const s=clone(original),pending=s.pendingEvolutions![0],unit=s.units[pending.actor];
    if(cmd.species!==null&&!pending.choices.includes(cmd.species))return fail('所选形态不在这次进化选项中');
    if(cmd.species===null)unit.deferredEvolutionLevel=s.prog?.level??INITIAL_LEVEL;else{evolveUnit(s,pending.actor,cmd.species);queuePostEvolutionMoves(s,pending.actor);}
    s.pendingEvolutions!.shift();advanceAfterLevelGrowth(s);
    return {ok:true,state:s};
  }
  if(cmd.type==='buy'){const err=buyProblem(original,cmd.item);return err?{ok:false,state:original,error:`${err}；没有购买`}:{ok:true,state:buy(original,cmd.item)};}
  if(cmd.type==='switch'){
    if(original.phase!=='playing'||!original.queue.includes(cmd.actor)||!alive(original.units[cmd.actor]))return fail('此时不能切换主控');
    const s=clone(original);s.leader=cmd.actor;return {ok:true,state:s};
  }
  if(cmd.type==='round'){
    if(original.phase!=='playing')return fail('先处理邀请、撤离或终局');
    const err=ownPhase(clone(original),cmd,true);if(err)return fail(err);
    const s=clone(original);s.round++;delete s.events;delete s.strikePending;ownPhase(s,cmd,false);delete s.strikePending;afterRound(s);return {ok:true,state:s};
  }
  if(cmd.type==='finishTransit'){
    if(original.phase!=='transit'||!original.request?.locked||original.request.to===undefined||!original.dungeon)return fail('没有已成立且完成邀请处理的跨层请求');
    return {ok:true,state:transit(original)};
  }
  if(cmd.type==='finishExit'){
    if(original.dungeon?.roguelike)return fail('本局不能撤离，击败首领后结束');
    if(original.phase!=='exit'||!original.request?.locked)return fail('没有已成立且完成邀请处理的撤离请求');
    const s=clone(original);end(s,'normal');return {ok:true,state:s};
  }
  if(original.phase!=='invitation')return fail('当前没有待处理邀请');
  const pending=original.invitations.find(i=>i.status==='pending');if(!pending)return fail('当前没有待处理邀请');
  if(cmd.choice==='camp'&&original.queue.length<PARTY_LIMIT)return fail('只有队伍满员时才能让新人回营');
  if(cmd.choice==='camp'&&cmd.outgoing!==undefined)return fail('让新人回营时不能同时指定回营伙伴');
  const preview=cmd.choice==='accept'?previewInvitation(original,cmd.outgoing):null;
  if(preview&&!preview.ok)return fail(preview.error);
  const s=clone(original),invite=s.invitations.find(i=>i.status==='pending')!;
  if(cmd.choice==='camp'){
    const unit=clone(invite.unit);unit.pos=null;s.units[unit.id]=unit;s.camp.push(unit.id);invite.status='accepted';
    note(s,L`${unit.id}回营，本局不会同行`);
  }else if(cmd.choice==='accept'&&preview?.ok){
    if(cmd.outgoing){s.camp.push(cmd.outgoing);s.units[cmd.outgoing].pos=null;}
    const unit=clone(invite.unit);unit.pos=preview.pos;s.units[unit.id]=unit;s.queue=preview.queue;s.leader=preview.leader;invite.status='accepted';reveal(s);
    note(s,L`${unit.id}加入，${cmd.outgoing??'空名额'}回营；下回合才行动`);
  }else{invite.status='rejected';note(s,L`拒绝${invite.unit.id}`);}
  if(!s.invitations.some(i=>i.status==='pending')){
    if(completeAdventureIfReady(s))return {ok:true,state:s};
    s.anchor=null;resumeAfterChoice(s);
  }
  return {ok:true,state:s};
}

/* ---------- 6.3 expedition: seeded floors, stairs, crossing and return (R09 step 5, R10) ---------- */
function floorUnits(g:GeneratedFloor):{units:Record<string,Unit>;enemies:string[]} {
  const units:Record<string,Unit>={};
  for(const e of g.enemies){
    const u=speciesUnit(e.id,e.species,e.level,{x:e.pos.x,y:e.pos.y});u.side='enemy';u.hp=e.hp;u.maxHp=e.hp;u.tactic='gofoes';if(!e.boss)setUnitLoadout(u,movesAtLevel(e.species,e.level));
    u.asleep=!!e.asleep;u.wakeSkip=false;u.targetMemory=null;u.lostSightTurns=0;u.roamTarget=null;u.direction=null;
    if(e.boss)u.boss=true;if(e.post)u.post=clone(e.post);units[e.id]=u;
  }
  return {units,enemies:g.enemies.map(e=>e.id)};
}
/** Active expeditions use the current generator; legacy save validation never regenerates their historical maps. */
function freshFloor(d:Dungeon,level:number,run:boolean,difficulty:Difficulty='normal',enemySleepChance=0.25):StoredFloor&{arrival:Pos;adventureRooms?:AdventureRoom[]} {
  const g=generateFloor(d.seed,level,{width:d.width,height:d.height,floors:d.floors,...(d.boss?{boss:true}:{}),...(d.roguelike?{roguelike:true}:{}),difficulty,enemySleepChance});
  return {floor:g.floor,liquid:g.liquid.map(key),arrival:clone(g.arrival),seen:[],points:[...g.points,...(run?g.pickups:[]),...(run&&d.base&&g.rest?[g.rest]:[]),...(run&&d.services?g.services:[])].map(p=>({...p})),...floorUnits(g),enemyAiRng:g.enemyAiRng,...(run?{rooms:g.rooms.map(r=>({...r}))}:{}),...(run&&g.adventureRooms?{adventureRooms:clone(g.adventureRooms)}:{}),...(g.bossRoom!==undefined?{bossRoom:g.bossRoom}:{})};
}
function stashFloor(s:World):StoredFloor {
  const units:Record<string,Unit>={};for(const id of s.enemies)units[id]=s.units[id];
  return clone({floor:s.floor,...(s.liquid?{liquid:s.liquid}:{}),...(s.arrival?{arrival:s.arrival}:{}),seen:s.seen,...(s.seenWalls?{seenWalls:s.seenWalls}:{}),enemies:s.enemies,units,points:s.points,...(s.rooms?{rooms:s.rooms}:{}),...(s.bossRoom!==undefined?{bossRoom:s.bossRoom}:{}),...(s.enemyAiRng!==undefined?{enemyAiRng:s.enemyAiRng}:{}),...(s.adventureRooms?{adventureRooms:s.adventureRooms}:{})});
}
function loadFloor(s:World,f:StoredFloor):void {
  for(const id of s.enemies)delete s.units[id];
  delete s.pendingAdventureStart;
  if(f.adventureRooms)s.adventureRooms=clone(f.adventureRooms);else delete s.adventureRooms;
  if(f.seenWalls)s.seenWalls=f.seenWalls;else delete s.seenWalls;
  if(f.liquid)s.liquid=f.liquid;else delete s.liquid;
  if(f.arrival)s.arrival=clone(f.arrival);else delete s.arrival;
  s.floor=f.floor;s.seen=f.seen;s.enemies=f.enemies;s.points=f.points;Object.assign(s.units,f.units);
  if(f.rooms)s.rooms=f.rooms;else delete s.rooms;
  if(f.bossRoom!==undefined)s.bossRoom=f.bossRoom;else delete s.bossRoom;
  if(f.enemyAiRng!==undefined)s.enemyAiRng=f.enemyAiRng;else delete s.enemyAiRng;
}
/**
 * WORKING CANDIDATE (R10 leaves the exact order open): the leader takes the entry cell; each other living member, in queue order,
 * takes the first cell of a breadth-first walk outward from the entry (entry, then right, down, left, up, then further out)
 * that is already revealed (as seen from the leader at the entry) and holds no living unit. Fallen members get no cell.
 * Returns false when the entry is held by an enemy or any member finds no cell; the caller then discards the whole attempt.
 */
function placeTeam(s:World,entry:Pos):boolean {
  const team=s.queue.filter(i=>s.units[i].hp>0);
  if(!team.includes(s.leader)||!walk(s,entry))return false;
  for(const id of team)s.units[id].pos=null;
  if(s.enemies.some(i=>alive(s.units[i])&&same(s.units[i].pos,entry)))return false;
  s.units[s.leader].pos=clone(entry);reveal(s);
  const seen=new Set(s.seen),order=[entry],visited=new Set([key(entry)]);
  for(let i=0;i<order.length;i++)for(const d of DIRS){const p=plus(order[i],d);if(walk(s,p)&&!visited.has(key(p))){visited.add(key(p));order.push(p);}}
  for(const id of team){if(id===s.leader)continue;
    const spot=order.find(c=>seen.has(key(c))&&!active(s).some(u=>same(u.pos,c)));
    if(!spot)return false;s.units[id].pos=clone(spot);}
  reveal(s);return true;
}
/** One crossing: no enemy phase, no round, no resource change. On failure the source floor is kept and only the request is cancelled. */
function transit(original:World):World {
  const s=clone(original),d=s.dungeon!,to=s.request!.to!,from=d.level;
  const cancelled=(why:string)=>{const c=clone(original);c.request=null;c.phase='playing';note(c,L`跨层取消：${why}；动作已用，留在原层`);return c;};
  if(d.roguelike&&to<=from)return cancelled('本局只能向下');
  const cur=stashFloor(s);
  const generating=!d.stored[to],sleepChance=(hasBless(s,'lullaby')&&generating)?(BLESSINGS.lullaby.sleepChance??0.4):0.25;
  const next=d.stored[to]??freshFloor(d,to,!!s.prog,original.difficulty??'normal',sleepChance);
  loadFloor(s,clone(next));
  const stair=s.points.find(p=>p.kind===(to>from?'up':'down'));
  const entry:Pos|undefined=d.roguelike
    ?('arrival' in next?(next as StoredFloor&{arrival:Pos}).arrival:undefined)
    :stair?.pos;
  if(!entry)return cancelled('目标层没有对应楼梯');
  if(!placeTeam(s,entry))return cancelled('目标层入口附近没有合法位置');
  delete d.stored[to];d.stored[String(from)]=cur;clearCombatState(s);d.level=to;s.request=null;s.phase='playing';
  s.mapRevealed=undefined;for(const id of s.queue){const m=s.units[id];if(m){m.thickUsed=undefined;m.standUsed=undefined;}}
  if(hasBless(s,'floorHeal'))for(const id of s.queue){const u=s.units[id];if(!alive(u))continue;const before=u.hp;u.hp=Math.min(u.maxHp,u.hp+Math.max(BLESSINGS.floorHeal.floorHealMin??4,Math.floor(u.maxHp*(BLESSINGS.floorHeal.floorHealRate??0.2))));note(s,L`换层回复：${id} HP ${before}→${u.hp}`);}
  note(s,L`同行抵达第${to}层`);return s;
}
/**
 * Developer and test helper: the same crossing as a stairs request, but to any floor of the run and without walking there (the team lands on that floor's arrival stairs).
 * Returns the world unchanged when the crossing would be cancelled.
 */
export function jumpToFloor(original:World,to:number):World {
  const s=clone(original);s.request={actor:s.leader,pos:clone(s.units[s.leader].pos!),locked:true,to};
  const r=transit(s);r.request=null;r.phase='playing';return r;
}
/**
 * The expedition: `floors` (2) seeded floors. 6.4 team (WORKING CANDIDATE): A charmander, B squirtle, C bulbasaur, three roster starters at run level 1;
 * C leads, as before (so entry placement and the drawn skins are unchanged). Roguelike runs begin at the floor's arrival cell.
 */
export type SquadMember={inst:string;species:string;carry:KitMove[];protected?:boolean;tactic?:Tactic};
/** A roster instance enters at the dungeon start level, carrying its saved tactic and selected moves at full PP. */
export function carriedUnit(id:string,m:SquadMember,vitality=0):Unit {
  const sp=SPECIES[m.species],maxHp=vitalityMaxHp(m.species,INITIAL_LEVEL,vitality);
  return {id,side:'friend',hp:maxHp,maxHp,pos:null,pp:Object.fromEntries(m.carry.map(k=>[k.move,k.pp])),maxPp:Object.fromEntries(m.carry.map(k=>[k.move,k.pp])),
    learned:m.carry.map(k=>k.move),species:m.species,entrySpecies:m.species,level:INITIAL_LEVEL,tactic:m.tactic??'together',inst:m.inst,moves:m.carry.map(k=>k.move),...freshCombatState(),reflect:0,lightscreen:0,...(m.protected?{protected:true as const}:{})};
}
/** `boss` defaults to true for a base run of 3 floors. New expeditions start as one-way roguelike runs. */
export function createExpedition(runId:string,seed:number,floors=2,squad?:{members:SquadMember[];leader:number;talents?:ExpeditionTalents},purse=0,boss=!!squad&&floors===3,tmPoolVersion?:3|4|5,difficulty:Difficulty='normal'):World {
  const selectedDifficulty=isDifficulty(difficulty)?difficulty:'normal';
  const selectedTmPool=tmPoolVersion??5;
  const d:Dungeon={seed:seed>>>0,width:36,height:24,floors,level:1,stored:{},roguelike:true,...(squad?{base:true as const,services:true as const}:{}),...(squad&&boss?{boss:true as const,tmPool:selectedTmPool}:{})};
  const f=freshFloor(d,1,true,selectedDifficulty);
  const s:World={runId,scenario:'expedition',round:0,floor:f.floor,liquid:f.liquid,arrival:f.arrival,seen:[],
    units:{...(squad?Object.fromEntries(squad.members.map((m,i)=>['ABC'[i],carriedUnit('ABC'[i],m,squad.talents?.vitality??0)])):{A:speciesUnit('A','charmander',INITIAL_LEVEL),B:speciesUnit('B','squirtle',INITIAL_LEVEL),C:speciesUnit('C','bulbasaur',INITIAL_LEVEL)}),...f.units},
    queue:squad?squad.members.map((_,i)=>'ABC'[i]):['A','B','C'],enemies:f.enemies,camp:[],leader:squad?'ABC'[squad.leader]:'C',points:f.points,goal:false,bag:0,phase:'playing',invitations:[],anchor:null,request:null,end:null,log:[],dungeon:d,
    rooms:f.rooms,...(f.adventureRooms?{adventureRooms:clone(f.adventureRooms)}:{}),...(f.bossRoom!==undefined?{bossRoom:f.bossRoom}:{}),enemyAiRng:f.enemyAiRng,difficulty:selectedDifficulty,
    ...(squad?.talents!==undefined?{talents:{...squad.talents},completedCommissions:0}:{}),
    prog:{level:INITIAL_LEVEL,exp:0,rng:(seed^0xA5A5F00D)>>>0,made:0,kills:[],items:{berry:(squad?.talents?.supplies??0)>=3?1:0,tonic:0}},purse:0,tms:[],blessingRefreshes:INITIAL_BLESSING_REFRESHES};
  if(squad){
    const roll=serviceRoll(d.seed,floors);
    if(roll.shop)s.shop={level:roll.shop.level,stock:{berry:ECON.stock.berry,tonic:ECON.stock.tonic,pechaBerry:ECON.stock.pechaBerry,healSeed:ECON.stock.healSeed,slumberOrb:ECON.stock.slumberOrb,totterOrb:ECON.stock.totterOrb,luminousOrb:ECON.stock.luminousOrb,rollcallOrb:ECON.stock.rollcallOrb,reviverSeed:ECON.stock.reviverSeed,tm:tmPool(d)[Math.floor(roll.shop.tmDraw*tmPool(d).length)]},trades:[]};
    if(roll.exchange)s.exchange={level:roll.exchange.level,used:false,sent:null};
  }
  for(const id of s.queue)s.units[id].pos=null;
  if(!placeTeam(s,f.arrival))throw Error('expedition start has no legal cells');
  return s;
}
