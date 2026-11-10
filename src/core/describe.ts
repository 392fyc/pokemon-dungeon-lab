/** Stage 7.1 readability helpers: plain-language text built from the world state. Pure functions; no DOM, no rule changes. */
import {attackStageMultiplier,defenceStageMultiplier,damageStage,levelDamageBonus,ITEM_NAMES,ORB_ITEMS,SKILL_CN,STAGE_NAMES,STATUS_NAMES,key,estimateAttackDamage,type Action,type LogEntry,type LogPart,type Pos,type Skill,type TraceStep,type Unit,type World} from './engine.ts';
import {SPECIES} from './roster.ts';
import {currentStats,type StatKey} from './stats.ts';
import {MOVE_DEFS,moveOf,moveEffects,type StageKey,type StatusId,type MoveRange} from './moves.ts';
import {adventureRoomMark,adventureRoomStateZh,adventureRoomTypeZh,speciesZh,moveZh,typeZh,itemZh,type AdventureRoomType} from './names.ts';
import {TACTIC_LABELS,isTactic,type Tactic} from './tactics.ts';
import moveTypeSnapshot from '../data/move-types.json' with {type:'json'};
const MOVE_TYPES=(moveTypeSnapshot as unknown as {types:Record<string,string>}).types;

/** Species name, or a readable side-based fallback for species-less fixtures. */
export const unitName=(u:Unit|undefined,fallback=''):string=>u?.species?speciesZh(u.species):fallback||(u?.side==='enemy'?'敌人':u?'队员':'单位');
/** Visible labels contain a species name or readable fallback, never an internal world id. */
export const unitLabel=(u:Unit|undefined,_id:string):string=>unitName(u);
/** A skill is a move id, so its label is the move's Chinese name with no behavior suffix. */
export const skillLabel=(_u:Unit|undefined,skill:Skill):string=>SKILL_CN[skill]??moveZh(skill);
const RANGE_CN:Record<MoveRange,string>={front:'相邻1格（含斜向，斜向不穿墙角）',front2:'同排、同列或斜线1–2格，无遮挡，斜向不穿墙角',line10:'同排、同列或斜线至多10格，命中首个单位（队友也会被命中），斜向不穿墙角',around:'使用者周围8格（斜向不穿墙角）',room:'同房间；走廊或无房间数据时周围2格',user:'自身'};
/** The short range tag, only for a non-default reach: an adjacent single target (and self) says nothing. */
export function moveRangeTag(id:string):string{const r=moveOf(id)?.range;return r==='front2'?'2格':r==='line10'?'直线 10 格':r==='around'?'周围':r==='room'?'同房间':'';}
const STAT_ZH:Record<string,string>={atk:'攻击',def:'防御',spa:'特攻',spd:'特防',acc:'命中',eva:'闪避'};
/** What a move does in a few words ("攻击 +2", "使对手睡眠"), for status moves where power and hit chance say nothing. Damage moves return ''. */
export function moveShortEffect(id:string):string{
  const spec=moveOf(id);if(!spec||spec.effects.includes('damage')||id==='snore')return '';
  const foe=spec.target==='enemy'||spec.target==='all',parts:string[]=[];
  for(const e of spec.effects){
    const st=/^stage:(\w+):([+-]\d+)$/.exec(e);
    if(st){parts.push((foe?'对手':'')+(STAT_ZH[st[1]]??st[1])+' '+st[2]);continue;}
    if(e.startsWith('status:'))parts.push((foe?'使对手':'使自身')+STATUS_NAMES[e.slice(7) as StatusId]);
    else if(e==='protect')parts.push('守住');else if(e==='counter')parts.push('反击');else if(e==='quickguard')parts.push('快速防守');
    else if(e==='reflect')parts.push('反射壁');else if(e==='lightscreen')parts.push('光墙');else if(e==='rest')parts.push('睡眠并回满');
    else if(e==='sleeptalk')parts.push('梦话');else if(e==='blowaway')parts.push('吹飞');else if(e.startsWith('heal:'))parts.push('回复一半 HP');
  }
  return parts.join('、');
}
/** The range as plain card text, always shown: "射程 1" for an adjacent target, "射程 1–2", "直线 10", "周围 1", "同房间", "自身". */
export function moveRangeText(id:string):string{const r=moveOf(id)?.range;return r?({front:'射程 1',front2:'射程 1–2',line10:'直线 10',around:'周围 1',room:'同房间',user:'自身'} as Record<MoveRange,string>)[r]:'—';}
/** The added effect of a move as short tags for a card ("畏缩", "灼伤", "攻击↑", "防御↓", "回复", "吸取", "吹飞"); '' when the move only deals damage. A stage change that lands on the user of a move aimed at a foe says "自身". */
export function moveEffectTags(id:string):string[]{
  const spec=moveOf(id);if(!spec)return [];
  const fx=moveEffects(id),foe=spec.target==='enemy'||spec.target==='all',out:string[]=[];
  const stage=(c:Partial<Record<StageKey,number>>|undefined,own:boolean)=>{for(const [k,n] of Object.entries(c??{})){if(k==='spe'||!n)continue;out.push((own&&foe?'自身':'')+STAT_ZH[k]+(n>0?'↑':'↓'));}};
  for(const e of spec.effects){
    const st=/^stage:(\w+):([+-]\d+)$/.exec(e);
    if(st){out.push(STAT_ZH[st[1]]+(Number(st[2])>0?'↑':'↓'));continue;}
    if(e.startsWith('status:'))out.push(STATUS_NAMES[e.slice(7) as StatusId]);
    else if(e==='drain')out.push('吸取');else if(e==='recoil')out.push('反伤');else if(e==='blowaway')out.push('吹飞');
    else if(e.startsWith('heal:'))out.push('回复');else if(e==='rest')out.push('睡眠回复');
    else if(e==='protect')out.push('守住');else if(e==='counter')out.push('反击');else if(e==='quickguard')out.push('快速防守');
    else if(e==='reflect')out.push('反射壁');else if(e==='lightscreen')out.push('光墙');else if(e==='sleeptalk')out.push('梦话');
  }
  if(spec.effects.includes('damage'))for(const f of fx?.fx??[]){if(f.status)out.push(STATUS_NAMES[f.status]);stage(f.foe,false);stage(f.self,true);}
  stage(fx?.cost,true);
  return [...new Set(out)];
}
export const moveEffectTag=(id:string):string=>moveEffectTags(id).join('、');
export function moveRangeLabel(id:string):string{const spec=moveOf(id);return spec?RANGE_CN[spec.range]:'未知射程';}
export type DamageSummaryContext={s:World;sourceId:string;targetId?:string};
/** Uses the engine estimate for player-facing action previews; without context, existing reference text stays intact. */
export function damageEstimateText(s:World,sourceId:string,targetId?:string,skill?:Skill):string {
  const source=s.units[sourceId],quickguard=source&&s.quickguard&&s.quickguard.owner!==source.side?new Set(s.quickguard.units):undefined;
  const amount=estimateAttackDamage(s,sourceId,targetId,skill,quickguard);
  return `约${amount}点${targetId===undefined?'（对普通目标）':''}`;
}
/** `side` is the side of whoever uses the move: duration and "enemy" wording in the fixed texts name the opposing side (#204). Defaults to the context's source, else the player's side. */
/** `level` (the level the move is used at) adds the level bonus to the fixed base-damage text; without a context and without a level (the camp) the text says plainly that it leaves the level bonus out. */
export function moveEffectLabel(id:string,context?:DamageSummaryContext,side?:Unit['side'],level?:number):string{
  const spec=moveOf(id);if(!spec)return '招式数据缺失';
  const user=side??context?.s.units[context.sourceId]?.side??'friend',foe=user==='enemy'?'我方':'敌方',foeUnit=user==='enemy'?'我方单位':'敌人';
  const parts:string[]=[];
  for(const effect of spec.effects){
    if(effect==='damage')parts.push(spec.power===null?'造成伤害':context?`造成${damageEstimateText(context.s,context.sourceId,context.targetId,id)}`:level===undefined?`造成${6+Math.ceil(spec.power/2)}点基础伤害（不含等级加成）`:`造成${6+Math.ceil(spec.power/2)+levelDamageBonus(level)}点基础伤害`);
    else if(effect==='drain')parts.push('按实际伤害的50%回复HP');
    else if(effect==='recoil'){const r=moveEffects(id)?.recoil;if(r)parts.push(`承受实际伤害的${r[0]}/${r[1]}反作用（向下取整，至少1；未造成伤害时不扣HP）`);}
    else if(effect==='rest')parts.push('自身进入打盹2—3轮；结束时回满HP并解除全部异常');
    else if(effect==='snore')parts.push(`睡眠或打盹中受到${foeUnit}直接攻击且未醒来时，对攻击者发动；不受射程限制且不造成畏缩`);
    else if(effect==='sleeptalk')parts.push(`睡眠或打盹中受到${foeUnit}直接攻击且未醒来时，随机发动一招；不受射程限制`);
    else if(effect==='heal:1:2')parts.push(`${spec.target==='party'?'同房间全队':'自身'}回复各自最大HP的一半`);
    else if(effect.startsWith('status:'))parts.push(`命中后施加${STATUS_NAMES[effect.slice(7) as StatusId]}`);
    else if(effect==='protect')parts.push(`自身受到${foe}攻击伤害为0（3个${foe}阶段）`);
    else if(effect==='counter')parts.push(`反击相邻${foeUnit}的有效伤害（3个${foe}阶段）`);
    else if(effect==='quickguard')parts.push(`使用时范围内全队在本回合挡下距离大于1格的${foe}攻击；与守住不能连续使用`);
    else if(effect==='reflect')parts.push(`使用时范围内全队受到的物理攻击伤害减半（10个${foe}阶段）`);
    else if(effect==='lightscreen')parts.push(`使用时范围内全队受到的特殊攻击伤害减半（10个${foe}阶段）`);
    else if(effect==='blowaway')parts.push(spec.effects.includes('damage')?'伤害后沿直线最多吹飞10格，撞墙或碰单位时各受5点撞击伤害':'沿直线最多吹飞10格，撞墙或碰单位时各受5点撞击伤害');
    else {const stage=/^stage:(atk|def|spa|spd|acc|eva):([+-]\d+)$/.exec(effect);if(stage){const who=spec.range==='room'&&spec.target==='teammates'?'同房间队友':spec.range==='user'?'自身':'目标';parts.push(`${who}${STAGE_NAMES[stage[1] as StageKey]}${stage[2]}`);}}
  }
  return parts.join('；')||'无效果说明';
}
export const moveSummary=(id:string,context?:DamageSummaryContext,side?:Unit['side'],level?:number):string=>`${moveRangeTag(id)?moveRangeTag(id)+' · ':''}${moveEffectLabel(id,context,side,level)}`;

export type AdventureRoomMarker={room:number;at:Pos;kind:'door'|'interaction';roomType:AdventureRoomType;state:'idle'|'sealed'|'cleared'|'done';label:string;typeLabel:string;stateLabel:string;dimmed:boolean;itemLabel?:string};
/** Show a room label on its first discovered door and keep the interaction marker separate. Hidden doors produce no marker. */
export function adventureRoomMarkers(s:World):AdventureRoomMarker[] {
  const seen=new Set(s.seen),markers:AdventureRoomMarker[]=[];
  for(const room of s.adventureRooms??[]){
    const dimmed=room.state==='cleared'||room.state==='done';
    const typeLabel=adventureRoomTypeZh(room.type),stateLabel=adventureRoomStateZh(room.type,room.state);
    const discoveredDoor=room.doors.find(at=>seen.has(key(at)));
    if(discoveredDoor)markers.push({room:room.room,at:{...discoveredDoor},kind:'door',roomType:room.type,state:room.state,
      label:room.state==='sealed'?'封闭':typeLabel,typeLabel,stateLabel,dimmed});
    if(seen.has(key(room.interaction)))markers.push({room:room.room,at:{...room.interaction},kind:'interaction',roomType:room.type,state:room.state,
      label:room.type==='challenge'&&room.state==='sealed'?'战':adventureRoomMark(room.type,room.item),typeLabel,stateLabel,dimmed,
      ...(room.item?{itemLabel:ITEM_NAMES[room.item]}:{})});
  }
  return markers;
}

/** Short plain text for one action. `s` is the state before the round, so ids can be turned into species names. */
export function actionText(s:World,actor:string,a:Action):string {
  const who=(id:string)=>unitLabel(s.units[id],id);
  switch(a.type){
    case 'move':return `移动到(${a.to.x},${a.to.y})`;
    case 'basic':return `普通攻击 ${who(a.target)}`;
    case 'basicForward':return '向前普通攻击';
    case 'skill':return `${skillLabel(s.units[actor],a.skill)} → ${a.target===actor?'自身':who(a.target)}`;
    case 'swap':return `与${who(a.target)}换位`;
    case 'use':return a.item==='teamTonic'?`使用${ITEM_NAMES[a.item]}恢复在场同行的PP`:ORB_ITEMS.includes(a.item)?`使用${ITEM_NAMES[a.item]}`:`使用${ITEM_NAMES[a.item]} → ${who(a.target)}`;
    case 'interact':return a.exit?'前进或撤离':'取得并继续';
    case 'exchange':return `启动交换机，把${who(a.target)}送回基地，运走${a.cargo.length}份招式机`;
    default:return '等待';
  }
}
/** The turn order of a combination draft, using species names and then the enemy phase. */
export function orderLine(s:World,steps:TraceStep[]):string {
  return [...steps.map(t=>unitLabel(s.units[t.id],t.id)),'敌方'].join(' → ');
}
/** One row per member: what that member does this round and whether it is the player's choice or the default behaviour. */
export function stepRows(s:World,steps:TraceStep[]):{id:string;text:string}[] {
  return steps.map(t=>({id:t.id,text:`${unitLabel(s.units[t.id],t.id)}：${t.failed?`原定“${actionText(s,t.id,t.action)}”已不成立，改为等待`:actionText(s,t.id,t.action)}${t.explicit?'':'（默认行为）'}`}));
}

/** One line of the details window's ability table. `value` is exactly what the damage rule divides (hp: the unit's real max HP); `stage` is the flat damage adjustment the rule applies for that stat. */
export type StatRow={key:'hp'|StatKey;label:string;value:number;base:number;stage:number;doesNotAffectAction?:true};
const STAT_LABELS:Record<'hp'|StatKey,string>={hp:'HP',atk:'攻击',def:'防御',spa:'特攻',spd:'特防',spe:'速度'};
export function statSheet(s:World,u:Unit):StatRow[]|null {
  const sp=u.species?SPECIES[u.species]:undefined,cur=currentStats(u),base=sp?.baseStats;if(!cur||!base)return null;
  const rows:StatRow[]=[{key:'hp',label:STAT_LABELS.hp,value:u.maxHp,base:base.hp,stage:0}];
  // The value shown is the one the damage rule uses: the level-based value times the stage multiplier (attack side or defence side).
  for(const k of ['atk','def','spa','spd'] as const){const stage=damageStage(s,u,k),mult=k==='atk'||k==='spa'?attackStageMultiplier(stage):defenceStageMultiplier(stage);rows.push({key:k,label:STAT_LABELS[k],value:Math.round(cur[k]*mult),base:base[k],stage});}
  rows.push({key:'spe',label:STAT_LABELS.spe,value:cur.spe,base:base.spe,stage:0,doesNotAffectAction:true});
  return rows;
}
/** The base damage a move does before any ratio: 6 + half the power (rounded up) + the level bonus, the same numbers estimateAttackDamage starts from. */
/** The level a unit's moves are used at, the same rule estimateAttackDamage applies (friends use the run level). */
export const unitMoveLevel=(s:World,u:Unit):number=>u.side==='friend'?(s.prog?.level??u.level??5):(u.level??5);
export function moveBaseDamage(s:World,u:Unit,move:string):number|null {
  const spec=moveOf(move);if(!spec||(!spec.effects.includes('damage')&&move!=='snore')||spec.power===null)return null;   // Snore hits through its own rule but uses the same base
  return 6+Math.ceil(spec.power/2)+levelDamageBonus(unitMoveLevel(s,u));
}
export type EnemyMoveRow={id:string;name:string;type:string;pp:number;maxPp:number;detail:string};
export type EnemyInfo={id:string;name:string;types:string;hp:number;maxHp:number;level:number|null;tactic:string;moves:string[];moveRows:EnemyMoveRow[];note:string;statuses:string[]};
export type TeammateInfo={id:string;name:string;level:number|null;tactic:Tactic;moves:string[]};
const tacticFor=(u:Unit):Tactic=>isTactic(u.tactic)?u.tactic:u.side==='enemy'?'gofoes':'together';
const moveRows=(u:Unit,context?:DamageSummaryContext):EnemyMoveRow[]=>u.learned.map(id=>{
  const pp=u.pp[id]??0,maxPp=u.maxPp[id]??pp,type=MOVE_TYPES[id];
  return {id,name:moveZh(id),type:type?typeZh(type):'—',pp,maxPp,detail:moveZh(id)+'（'+moveSummary(id,context,u.side)+'） PP '+pp+'/'+maxPp};
});
/** Names of the conditions a unit is under now, in STATUS_NAMES order; a unit born asleep (not yet woken) shows as sleeping. */
export function statusLabels(u:Unit):string[]{
  const out:string[]=[];
  for(const kind of Object.keys(STATUS_NAMES) as StatusId[]){const st=u.status?.[kind];if(!st)continue;const left=st.left??st.tick;out.push(STATUS_NAMES[kind]+(left===undefined?'':'（剩余'+left+'）'));}
  if(u.asleep&&!out.some(v=>v.startsWith(STATUS_NAMES.slp)))out.push(STATUS_NAMES.slp);
  return out;
}
/** What a revealed enemy shows. Returns null for anything the player cannot see yet (unrevealed cell, fallen, or not an enemy). */
export function enemyInfo(s:World,id:string):EnemyInfo|null {
  const u=s.units[id];
  if(!u||u.side!=='enemy'||u.hp<=0||!u.pos||!s.seen.includes(key(u.pos)))return null;
  const sp=u.species?SPECIES[u.species]:undefined;
  const tactic=tacticFor(u),note=u.boss?'区域首领；击败后有概率发出加入邀请，入队的是普通形态。':u.species?'击败后有概率发出加入邀请。':'';
  const rows=moveRows(u);
  return {id,name:u.boss?`${unitName(u,'敌人')}（首领）`:unitName(u,'敌人'),types:sp?(sp.types??[]).map(typeZh).join('／'):'',hp:u.hp,maxHp:u.maxHp,
    level:typeof u.level==='number'?u.level:null,tactic:TACTIC_LABELS[tactic],moves:rows.map(row=>row.detail),moveRows:rows,note,statuses:statusLabels(u)};
}
/** Read-only detail for a teammate card when the player explicitly opens it. */
export function teammateInfo(s:World,id:string,targetId?:string):TeammateInfo|null {
  const u=s.units[id];if(!u||u.side!=='friend')return null;
  const rows=moveRows(u,{s,sourceId:id,targetId});
  return {id,name:unitName(u,'队员'),level:typeof u.level==='number'?u.level:null,tactic:tacticFor(u),moves:rows.map(row=>row.detail)};
}

const escapeRe=(t:string)=>t.replace(/[.*+?^$|()[\]{}\\]/g,'\\$&');
/** Player-facing prose only. Official move descriptions and keeper dialogue bypass this helper. */
export function playerText(text:string):string {
 let value=text.replace(/向-?\d+,-?\d+挥空/g,'普通攻击挥空');
 for(const [from,to] of [["普攻","普通攻击"],["朝前","向前"],["回到","返回"],["带上","携带"],["教给","学习"],["贴住","紧跟"],["贴身","相邻"],["追最近","追击最近"],["没打中","没有命中"],["打不到","无法攻击"],["打空","挥空"],["倒下退图","倒下了"]])value=value.split(from).join(to);
 return value;
}
/**
 * The record, built from the engine's structured entries (`World.entries`); no log text is read or parsed. A slot is named from the data it carries: a unit by the species it had when the line was written
 * (or "敌人"/"队员" when it has none), a move or species by its Chinese name.
 */
export function logPartsText(parts:readonly LogPart[]):string {
  return parts.map(p=>typeof p==='string'?p:'unit' in p?(p.species?speciesZh(p.species):p.side==='enemy'?'敌人':p.side==='friend'?'队员':'单位'):'move' in p?moveZh(p.move):speciesZh(p.species)).join('');
}
/** The player-facing line of one entry. A plain damage line that carried a critical hit or a type note reads "X受到N伤害，命中要害，效果绝佳" (the HP left is dropped); otherwise it is the entry's own wording. */
export function logEntryText(e:LogEntry):string {
  const d=e.damage;
  if(d&&(d.crit||d.notes.length)){
    const target=e.parts[0]!;   // a damage line always starts with the unit that was hit
    return `${logPartsText([target])}受到${d.amount}伤害，${[...(d.crit?['命中要害']:[]),...d.notes].join('，')}`;
  }
  return logPartsText(e.player??e.parts);
}
/** Whether an entry belongs in the player's record: not a plain move, swap or wait, not a type note already joined into its damage line, not about an enemy the player cannot see yet (its cell is not in `seen`), and not about an enemy of a floor that no longer exists. */
export function logEntryShown(s:World,e:LogEntry):boolean {
  if(e.folded||e.routine)return false;
  const first=e.parts[0];
  if(first&&typeof first==='object'&&'unit' in first){const u=s.units[first.unit];if(u&&s.enemies.includes(first.unit)&&u.pos&&!s.seen.includes(key(u.pos)))return false;}
  return !e.parts.some(p=>typeof p==='object'&&'unit' in p&&p.side==='enemy'&&!s.units[p.unit]);
}
/** Turns unit, species and move ids in a log line into readable player-facing names. */
export function localizeLog(s:World,line:string):string {
  const units:Record<string,Unit>={...s.units};
  for(const invitation of s.invitations??[])units[invitation.unit.id]=invitation.unit;
  for(const id of s.camp??[]){const u=s.units[id];if(u)units[id]=u;}
  const ids=Object.keys(units).sort((a,b)=>b.length-a.length);
  const edge='[A-Za-z0-9-]';
  let out=line;
  const swaps:[string,string][]=[];
  const guard=(from:string,to:string)=>{const token=`@@${swaps.length}@@`;swaps.push([token,to]);out=out.replace(new RegExp(`(?<!${edge})${escapeRe(from)}(?!${edge})`,'g'),token);};
  for(const id of ids){const u=units[id];guard(id,unitName(u));}
  for(const id of Object.keys(SPECIES))guard(id,speciesZh(id));
  for(const move of Object.keys(MOVE_DEFS))guard(move,moveZh(move));
  out=playerText(out);
  for(const [token,to] of swaps)out=out.split(token).join(to);
  return out.replace(/全员\s*PP\s*补剂/g,itemZh('teamTonic'));
}
export const skillSummary=(u:Unit):string=>u.learned.length?u.learned.map(k=>skillLabel(u,k)).join('、'):'普通攻击';
