/** Stage 7.1 readability helpers: plain-language text built from the world state. Pure functions; no DOM, no rule changes. */
import {SKILL_CN,key,type Action,type Skill,type TraceStep,type Unit,type World} from './engine.ts';
import {SPECIES} from './roster.ts';
import {MOVE_DEFS,moveOf,type MoveRange} from './moves.ts';
import {speciesZh,moveZh,typeZh,itemZh} from './names.ts';
import {TACTIC_LABELS,isTactic,type Tactic} from './tactics.ts';

/** Chinese species name, or the unit id when the unit has no species (fixed-map fixtures). */
export const unitName=(u:Unit|undefined,fallback=''):string=>u?.species?speciesZh(u.species):fallback;
/** "A 小火龙": the id players see on the board plus the species. */
export const unitLabel=(u:Unit|undefined,id:string):string=>{const n=unitName(u);return n?`${id} ${n}`:id;};
/** A skill is a move id, so its label is the move's Chinese name with no behavior suffix. */
export const skillLabel=(_u:Unit|undefined,skill:Skill):string=>SKILL_CN[skill]??moveZh(skill);
const RANGE_CN:Record<MoveRange,string>={front:'上下左右相邻',front2:'同排／列1–2格，无遮挡',line10:'同排／列至多10格，命中首个单位（队友也会被命中）',around:'使用者周围8格',room:'同房间；走廊或无房间数据时周围2格',user:'自身'};
export function moveRangeLabel(id:string):string{const spec=moveOf(id);return spec?RANGE_CN[spec.range]:'未知射程';}
export function moveEffectLabel(id:string):string{
  const spec=moveOf(id);if(!spec)return '招式数据缺失';
  const parts:string[]=[];
  for(const effect of spec.effects){
    if(effect==='damage')parts.push(spec.power===null?'造成伤害':`造成${6+Math.ceil(spec.power/2)}点基础伤害`);
    else if(effect==='drain')parts.push('按实际伤害的50%回复HP');
    else if(effect==='protect')parts.push('自身受到敌方攻击伤害为0（3个敌方阶段）');
    else if(effect==='counter')parts.push('反击相邻敌人的有效伤害（3个敌方阶段）');
    else if(effect==='quickguard')parts.push('使用时范围内全队在本回合挡下距离大于1格的敌方攻击；与守住不能连续使用');
    else if(effect==='reflect')parts.push('使用时范围内全队受到的物理攻击伤害减半（10个敌方阶段）');
    else if(effect==='lightscreen')parts.push('使用时范围内全队受到的特殊攻击伤害减半（10个敌方阶段）');
    else if(effect==='blowaway')parts.push(spec.effects.includes('damage')?'伤害后沿直线最多吹飞10格，撞墙或碰单位时各受5点撞击伤害':'沿直线最多吹飞10格，撞墙或碰单位时各受5点撞击伤害');
    else {const stage=/^stage:(atk|def):([+-]\d+)$/.exec(effect);if(stage){const who=spec.range==='room'&&spec.target==='teammates'?'同房间队友':spec.range==='user'?'自身':'目标';parts.push(`${who}${stage[1]==='atk'?'攻击':'防御'}${stage[2]}（上限±3）`);}}
  }
  return parts.join('；')||'无效果说明';
}
export const moveSummary=(id:string):string=>`${moveRangeLabel(id)} · ${moveEffectLabel(id)}`;

/** Short plain text for one action. `s` is the state before the round, so ids can be turned into species names. */
export function actionText(s:World,actor:string,a:Action):string {
  const who=(id:string)=>unitLabel(s.units[id],id);
  switch(a.type){
    case 'move':return `移动到(${a.to.x},${a.to.y})`;
    case 'basic':return `普攻 ${who(a.target)}`;
    case 'skill':return `${skillLabel(s.units[actor],a.skill)} → ${a.target===actor?'自身':who(a.target)}`;
    case 'swap':return `与${who(a.target)}换位`;
    case 'use':return `使用${itemZh(a.item)} → ${who(a.target)}`;
    case 'interact':return a.exit?'交互并请求撤离／跨层':'取得并继续';
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
const moveRows=(u:Unit):string[]=>u.learned.map(m=>`${moveZh(m)}（${moveSummary(m)}） PP ${u.pp[m]??0}/${u.maxPp[m]??u.pp[m]??0}`);
/** What a revealed enemy shows. Returns null for anything the player cannot see yet (unrevealed cell, fallen, or not an enemy). */
export function enemyInfo(s:World,id:string):EnemyInfo|null {
  const u=s.units[id];
  if(!u||u.side!=='enemy'||u.hp<=0||!u.pos||!s.seen.includes(key(u.pos)))return null;
  const sp=u.species?SPECIES[u.species]:undefined;
  const tactic=tacticFor(u),note=u.boss?'区域首领，不能招募。':u.species?'击败后有概率发出加入邀请。':'';
  return {id,name:u.boss?`${unitName(u)}（首领）`:unitLabel(u,id),types:sp?(sp.types??[]).map(typeZh).join('／'):'',hp:u.hp,maxHp:u.maxHp,
    level:typeof u.level==='number'?u.level:null,tactic:TACTIC_LABELS[tactic],moves:moveRows(u),note};
}
/** Read-only detail for a teammate card while it is hovered. */
export function teammateInfo(s:World,id:string):TeammateInfo|null {
  const u=s.units[id];if(!u||u.side!=='friend')return null;
  return {id,name:unitLabel(u,id),level:typeof u.level==='number'?u.level:null,tactic:tacticFor(u),moves:moveRows(u)};
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
  return out;
}
export const skillSummary=(u:Unit):string=>u.learned.length?u.learned.map(k=>skillLabel(u,k)).join('、'):'普攻';
