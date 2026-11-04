/** Stage 7.1 readability helpers: plain-language text built from the world state. Pure functions; no DOM, no rule changes. */
import {SKILL_CN,STAGE_NAMES,STATUS_NAMES,key,estimateAttackDamage,type Action,type Pos,type Skill,type TraceStep,type Unit,type World} from './engine.ts';
import {SPECIES} from './roster.ts';
import {MOVE_DEFS,moveOf,moveEffects,type StageKey,type StatusId,type MoveRange} from './moves.ts';
import {adventureRoomMark,adventureRoomStateZh,adventureRoomTypeZh,speciesZh,moveZh,typeZh,itemZh,type AdventureRoomType} from './names.ts';
import {TACTIC_LABELS,isTactic,type Tactic} from './tactics.ts';

/** Chinese species name, or the unit id when the unit has no species (fixed-map fixtures). */
export const unitName=(u:Unit|undefined,fallback=''):string=>u?.species?speciesZh(u.species):fallback;
/** "A 小火龙": the id players see on the board plus the species. */
export const unitLabel=(u:Unit|undefined,id:string):string=>{const n=unitName(u);return n?`${id} ${n}`:id;};
/** A skill is a move id, so its label is the move's Chinese name with no behavior suffix. */
export const skillLabel=(_u:Unit|undefined,skill:Skill):string=>SKILL_CN[skill]??moveZh(skill);
const RANGE_CN:Record<MoveRange,string>={front:'相邻1格（含斜向，斜向不穿墙角）',front2:'同排、同列或斜线1–2格，无遮挡，斜向不穿墙角',line10:'同排、同列或斜线至多10格，命中首个单位（队友也会被命中），斜向不穿墙角',around:'使用者周围8格（斜向不穿墙角）',room:'同房间；走廊或无房间数据时周围2格',user:'自身'};
export function moveRangeLabel(id:string):string{const spec=moveOf(id);return spec?RANGE_CN[spec.range]:'未知射程';}
export type DamageSummaryContext={s:World;sourceId:string;targetId?:string};
/** Uses the engine estimate for player-facing action previews; without context, existing reference text stays intact. */
export function damageEstimateText(s:World,sourceId:string,targetId?:string,skill?:Skill):string {
  const source=s.units[sourceId],quickguard=source&&s.quickguard&&s.quickguard.owner!==source.side?new Set(s.quickguard.units):undefined;
  const amount=estimateAttackDamage(s,sourceId,targetId,skill,quickguard);
  return `约${amount}点${targetId===undefined?'（对普通目标）':''}`;
}
export function moveEffectLabel(id:string,context?:DamageSummaryContext):string{
  const spec=moveOf(id);if(!spec)return '招式数据缺失';
  const parts:string[]=[];
  for(const effect of spec.effects){
    if(effect==='damage')parts.push(spec.power===null?'造成伤害':context?`造成${damageEstimateText(context.s,context.sourceId,context.targetId,id)}`:`造成${6+Math.ceil(spec.power/2)}点基础伤害`);
    else if(effect==='drain')parts.push('按实际伤害的50%回复HP');
    else if(effect==='recoil'){const r=moveEffects(id)?.recoil;if(r)parts.push(`承受实际伤害的${r[0]}/${r[1]}反作用（向下取整，至少1；未造成伤害时不扣HP）`);}
    else if(effect==='heal:1:2')parts.push(`${spec.target==='party'?'同房间全队':'自身'}回复各自最大HP的一半（四舍五入，不超过上限）`);
    else if(effect.startsWith('status:'))parts.push(`命中后施加${STATUS_NAMES[effect.slice(7) as StatusId]}`);
    else if(effect==='protect')parts.push('自身受到敌方攻击伤害为0（3个敌方阶段）');
    else if(effect==='counter')parts.push('反击相邻敌人的有效伤害（3个敌方阶段）');
    else if(effect==='quickguard')parts.push('使用时范围内全队在本回合挡下距离大于1格的敌方攻击；与守住不能连续使用');
    else if(effect==='reflect')parts.push('使用时范围内全队受到的物理攻击伤害减半（10个敌方阶段）');
    else if(effect==='lightscreen')parts.push('使用时范围内全队受到的特殊攻击伤害减半（10个敌方阶段）');
    else if(effect==='blowaway')parts.push(spec.effects.includes('damage')?'伤害后沿直线最多吹飞10格，撞墙或碰单位时各受5点撞击伤害':'沿直线最多吹飞10格，撞墙或碰单位时各受5点撞击伤害');
    else {const stage=/^stage:(atk|def|spa|spd|acc|eva):([+-]\d+)$/.exec(effect);if(stage){const who=spec.range==='room'&&spec.target==='teammates'?'同房间队友':spec.range==='user'?'自身':'目标';parts.push(`${who}${STAGE_NAMES[stage[1] as StageKey]}${stage[2]}（上限±3）`);}}
  }
  return parts.join('；')||'无效果说明';
}
export const moveSummary=(id:string,context?:DamageSummaryContext):string=>`${moveRangeLabel(id)} · ${moveEffectLabel(id,context)}`;

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
      ...(room.item?{itemLabel:itemZh(room.item)}:{})});
  }
  return markers;
}

/** Short plain text for one action. `s` is the state before the round, so ids can be turned into species names. */
export function actionText(s:World,actor:string,a:Action):string {
  const who=(id:string)=>unitLabel(s.units[id],id);
  switch(a.type){
    case 'move':return `移动到(${a.to.x},${a.to.y})`;
    case 'basic':return `普攻 ${who(a.target)}`;
    case 'skill':return `${skillLabel(s.units[actor],a.skill)} → ${a.target===actor?'自身':who(a.target)}`;
    case 'swap':return `与${who(a.target)}换位`;
    case 'use':return a.item==='teamTonic'?`使用${itemZh(a.item)}恢复在场同行的PP`:`使用${itemZh(a.item)} → ${who(a.target)}`;
    case 'interact':return a.exit?'交互并请求跨层':'取得并继续';
    case 'exchange':return `启动交换机，把${who(a.target)}送回基地，运走${a.cargo.length}份招式机`;
    default:return '等待';
  }
}
/** The turn order of a combination draft, as one line: "A 小火龙 → B 杰尼龟 → 敌方". */
export function orderLine(s:World,steps:TraceStep[]):string {
  return [...steps.map(t=>unitLabel(s.units[t.id],t.id)),'敌方'].join(' → ');
}
/** One row per member: what that member does this round and whether it is the player's choice or the default behaviour. */
export function stepRows(s:World,steps:TraceStep[]):{id:string;text:string}[] {
  return steps.map(t=>({id:t.id,text:`${unitLabel(s.units[t.id],t.id)}：${t.failed?`原定“${actionText(s,t.id,t.action)}”已不成立，改为等待`:actionText(s,t.id,t.action)}${t.explicit?'':'（默认行为）'}`}));
}

export type EnemyInfo={id:string;name:string;types:string;hp:number;maxHp:number;level:number|null;tactic:string;moves:string[];note:string};
export type TeammateInfo={id:string;name:string;level:number|null;tactic:Tactic;moves:string[]};
const tacticFor=(u:Unit):Tactic=>isTactic(u.tactic)?u.tactic:u.side==='enemy'?'gofoes':'together';
const moveRows=(u:Unit,context?:DamageSummaryContext):string[]=>u.learned.map(m=>`${moveZh(m)}（${moveSummary(m,context)}） PP ${u.pp[m]??0}/${u.maxPp[m]??u.pp[m]??0}`);
/** What a revealed enemy shows. Returns null for anything the player cannot see yet (unrevealed cell, fallen, or not an enemy). */
export function enemyInfo(s:World,id:string):EnemyInfo|null {
  const u=s.units[id];
  if(!u||u.side!=='enemy'||u.hp<=0||!u.pos||!s.seen.includes(key(u.pos)))return null;
  const sp=u.species?SPECIES[u.species]:undefined;
  const tactic=tacticFor(u),note=u.boss?'区域首领；击败后有概率发出加入邀请，入队的是普通形态。':u.species?'击败后有概率发出加入邀请。':'';
  return {id,name:u.boss?`${unitName(u)}（首领）`:unitLabel(u,id),types:sp?(sp.types??[]).map(typeZh).join('／'):'',hp:u.hp,maxHp:u.maxHp,
    level:typeof u.level==='number'?u.level:null,tactic:TACTIC_LABELS[tactic],moves:moveRows(u),note};
}
/** Read-only detail for a teammate card while it is hovered. */
export function teammateInfo(s:World,id:string,targetId?:string):TeammateInfo|null {
  const u=s.units[id];if(!u||u.side!=='friend')return null;
  return {id,name:unitLabel(u,id),level:typeof u.level==='number'?u.level:null,tactic:tacticFor(u),moves:moveRows(u,{s,sourceId:id,targetId})};
}

const escapeRe=(t:string)=>t.replace(/[.*+?^$|()[\]{}\\]/g,'\\$&');
/** Turns ids in a log line into readable names: unit ids get their species, species ids and machine moves are translated. */
export function localizeLog(s:World,line:string):string {
  const ids=Object.keys(s.units).sort((a,b)=>b.length-a.length);
  const edge='[A-Za-z0-9-]';
  let out=line;
  const swaps:[string,string][]=[];
  const guard=(from:string,to:string)=>{const token=`@@${swaps.length}@@`;swaps.push([token,to]);out=out.replace(new RegExp(`(?<!${edge})${escapeRe(from)}(?!${edge})`,'g'),token);};
  for(const id of ids){const u=s.units[id];const n=unitName(u);if(n)guard(id,`${id} ${n}`);}
  for(const id of Object.keys(SPECIES))guard(id,speciesZh(id));
  for(const move of Object.keys(MOVE_DEFS))guard(move,moveZh(move));
  for(const [token,to] of swaps)out=out.split(token).join(to);
  return out.replace(/全员\s*PP\s*补剂/g,itemZh('teamTonic'));
}
export const skillSummary=(u:Unit):string=>u.learned.length?u.learned.map(k=>skillLabel(u,k)).join('、'):'普攻';
