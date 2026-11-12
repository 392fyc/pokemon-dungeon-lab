/** The effect text of a move (G13.1, playtest round 14): written only from the data the engine reads, never from the official prose, so a card and
 *  the engine cannot disagree. Every number comes from an engine constant or from the move data (src/data/pmd-moves.json, move-effects.json). */
import {moveOf,moveEffects,type StageKey,type StatusId,type MoveSpec,type StageChange} from './moves.ts';
import {typeZh} from './names.ts';
import {
  STAGE_NAMES,STATUS_NAMES,STATUS_DURATION,PROTECT_PHASES,COUNTER_PHASES,SCREEN_PHASES,BLOWAWAY_CELLS,COLLISION_DAMAGE,
  attackStageMultiplier,defenceStageMultiplier,accuracyMultiplier,ACCURACY_STAGE_LIMIT,STATUS_INTERVAL,STATUS_DAMAGE_DIVISOR,BURN_DAMAGE_RATIO,statusImmuneTypes,
} from './engine.ts';

const sign=(n:number)=>(n>0?'+':n<0?'−':'±')+Math.abs(n);
/** Who a move's own (non-secondary) effect lands on, from the move's target field. */
function whoOf(spec:MoveSpec):string {
  switch(spec.target){
    case 'user':return '自身';
    case 'enemy':return '对方';
    case 'teammates':return '范围内队友';
    case 'party':return '范围内全队';
    default:return '命中的单位';
  }
}
const immuneText=(moveId:string,st:StatusId):string=>{const t=statusImmuneTypes(moveId,st);return t.length?'；'+t.map(x=>typeZh(x[0]!.toUpperCase()+x.slice(1))).join('、')+'系免疫':'';};
/** One status with how long it lasts, as the engine counts it: sleep, nap, paralysis, freeze, confusion and flinch count the sufferer's own actions
 *  (endOwnTurn); poison, bad poison and burn tick at round ends (STATUS_INTERVAL) until cured or the floor changes. `moveId` adds the types it cannot hit. */
export function statusWithDuration(st:StatusId,moveId?:string):string {
  const range=STATUS_DURATION[st],interval=STATUS_INTERVAL[st];
  const imm=moveId?immuneText(moveId,st):'';
  if(range||st==='flinch')return STATUS_NAMES[st]+imm;
  if(interval!==undefined){
    const div=(STATUS_DAMAGE_DIVISOR as Record<string,number>)[st];
    return STATUS_NAMES[st]+'，每'+interval+'回合末损失最大HP的1/'+div+(st==='brn'?'，攻击伤害×'+BURN_DAMAGE_RATIO[0]+'/'+BURN_DAMAGE_RATIO[1]:'')+'，持续至治愈或换层'+imm;
  }
  return STATUS_NAMES[st]+imm;
}
const stageParts=(who:string,c:StageChange|undefined)=>Object.entries(c??{}).filter(([k])=>k!=='spe').map(([k,n])=>who+STAGE_NAMES[k as StageKey]+sign(n as number));

/** Effect ids of pmd-moves.json the engine executes, and fields of move-effects.json it reads; the coverage test compares the data against these. */
export const HANDLED_EFFECTS=['damage','drain','recoil','blowaway','lightscreen','protect','counter','quickguard','heal:1:2','reflect','rest','sleeptalk','snore'] as const;
export const HANDLED_FX_FIELDS=['acc','fx','thaw','recoil','cost','powder','source'] as const;

/** Shared effect copy for cards and the wiki. The opposing side is relative to the move user. */
export function situationalMoveEffect(effect:string,foe='对方',foeUnit=foe):string|undefined {
  switch(effect){
    case 'blowaway':return '沿直线吹飞目标，最远'+BLOWAWAY_CELLS+'格；撞墙时目标受'+COLLISION_DAMAGE+'点伤害，撞到单位时两者各受'+COLLISION_DAMAGE+'点';
    case 'protect':return PROTECT_PHASES+'回合内免疫'+foe+'攻击的伤害、异常和能力降低；上一次行动是守住或快速防守时不能使用';
    case 'counter':return COUNTER_PHASES+'回合内，受到相邻'+foeUnit+'的伤害时，对其造成等量伤害';
    case 'quickguard':return '使用时范围内的己方，1回合内免疫距离大于1格的'+(foe==='对方'?'':foe)+'攻击及其异常和能力降低；上一次行动是守住或快速防守时不能使用';
    case 'reflect':
    case 'lightscreen':{
      const category=effect==='reflect'?'物理':'特殊';
      const source=foe==='对方'?'':foe+'造成的';
      return '使用时范围内的己方，'+SCREEN_PHASES+'回合内受到'+(source||'的')+category+'伤害减半；重复使用刷新计时';
    }
    case 'rest':{
      const [min,max]=STATUS_DURATION.nap!;
      return '自身打盹'+min+'—'+max+'回合，期间无法行动；自然醒来时回满HP并解除全部异常，换层会提前结束打盹；HP已满且没有异常时不能使用';
    }
    case 'sleeptalk':return '睡眠或打盹期间受到'+foeUnit+'直接攻击，未苏醒时随机对自身或攻击者发动符合条件的另一招，仅消耗梦话的PP；携带打鼾时优先判定打鼾；不能主动使用';
    case 'snore':return '睡眠或打盹期间受到'+foeUnit+'直接攻击，未苏醒时对攻击者发动反击，消耗打鼾的PP；不能主动使用';
  }
}

/** One short sentence per effect, in the order the engine resolves them. */
export function moveEffectLines(id:string):string[] {
  const spec=moveOf(id);if(!spec)return [];
  const fx=moveEffects(id),who=whoOf(spec),out:string[]=[];
  const damaging=spec.effects.includes('damage');
  let stagesShown=false;
  for(const e of spec.effects){
    const st=/^stage:(atk|def|spa|spd|acc|eva):([+-]\d+)$/.exec(e);
    if(st){out.push(who+STAGE_NAMES[st[1] as StageKey]+sign(Number(st[2])));stagesShown=true;continue;}
    if(e.startsWith('status:')){out.push('使'+who+statusWithDuration(e.slice(7) as StatusId,id));continue;}
    const special=situationalMoveEffect(e);
    if(special){out.push(special);continue;}
    switch(e){
      case 'drain':out.push('回复实际伤害的一半');break;
      case 'recoil':if(fx?.recoil)out.push('自身承受实际伤害的'+Math.round(fx.recoil[0]/fx.recoil[1]*100)+'%作为反作用');break;
      case 'heal:1:2':out.push(who+(spec.target==='party'?'各自':'')+'回复最大HP的一半');break;
    }
  }
  if(damaging)for(const f of fx?.fx??[]){
    const parts=[...(f.status?['使对方'+statusWithDuration(f.status,id)]:[]),...stageParts('对方',f.foe),...stageParts('自身',f.self)];
    if(!parts.length)continue;
    if(f.foe&&Object.keys(f.foe).some(k=>k!=='spe')||f.self&&Object.keys(f.self).some(k=>k!=='spe'))stagesShown=true;
    out.push((f.chance>=100?'命中后':f.chance+'%概率')+parts.join('，'));
  }
  const cost=stageParts('自身',fx?.cost);
  if(cost.length){out.push('命中后'+cost.join('，'));stagesShown=true;}
  if(fx?.thaw)out.push('可打中冰冻的对方并使其解冻');
  if(fx?.powder)out.push('粉末招式');
  if(stagesShown)out.push('能力阶段持续到换层');
  return out;
}
/** The whole text, sentences joined by full stops. Empty for an unknown move. */
export function moveEffectText(id:string):string {
  const lines=moveEffectLines(id);
  return lines.length?lines.join('。')+'。':'';
}

const times=(n:number)=>'×'+Number(n.toFixed(2));
/** What an ability stage does, from the engine's own tables (G5.1, G5.3, G5.5): attack and special attack scale the damage a unit deals, defence and
 *  special defence divide the damage it takes. Accuracy and evasion work on the hit chance of moves (hitChance in the engine): the difference
 *  "attacker accuracy stage − target evasion stage" is clamped to ±ACCURACY_STAGE_LIMIT first, then turned into a multiplier; a basic attack ignores
 *  evasion and only a negative accuracy stage lowers it; a move that always hits stays at 100%. */
export function stageEffectLabel(stat:StageKey,stage:number):string {
  switch(stat){
    case 'atk':return '物理招式造成的伤害'+times(attackStageMultiplier(stage));
    case 'spa':return '特殊招式造成的伤害'+times(attackStageMultiplier(stage));
    case 'def':return '受到的物理伤害'+times(1/defenceStageMultiplier(stage));
    case 'spd':return '受到的特殊伤害'+times(1/defenceStageMultiplier(stage));
    case 'acc':return (stage<0?'招式和普攻的命中率':'招式的命中率')+times(accuracyMultiplier(stage));
    case 'eva':return '对方招式的命中率'+times(accuracyMultiplier(-stage));
    default:return '';
  }
}
/** The fine print of the accuracy and evasion stages, empty for the other stats. */
export function stageEffectNote(stat:StageKey,stage:number):string {
  if(stat==='atk'||stat==='spa')return '普通攻击按使用者种族值较高的一边归为物理或特殊，取对应的这一项';
  if(stat==='def'||stat==='spd')return '受到的普通攻击按攻击者的类别取防御或特防';
  if(stat==='acc')return '与对方闪避阶段相抵，差值限于±'+ACCURACY_STAGE_LIMIT+'；'+(stage<0?'':'普攻不受影响；')+'必中招式不受影响';
  if(stat==='eva')return '与对方命中阶段相抵，差值限于±'+ACCURACY_STAGE_LIMIT+'；普攻和必中招式不受影响';
  return '';
}
/** The hover text of a stage badge: "攻击 +1：造成的伤害×1.2，持续到换层". `effective` is the stage the engine really uses when it differs from the stored one (the hunter commission lowers a friend's defence stages by 1). */
export function stageTitle(stat:StageKey,stage:number,effective=stage):string {
  const note=effective!==stage?'猎人委托使实际生效为 '+sign(effective)+'，':'';
  const fine=stageEffectNote(stat,effective);
  return STAGE_NAMES[stat]+' '+sign(stage)+'：'+note+stageEffectLabel(stat,effective)+'，持续到换层'+(fine?'。'+fine:'');
}
