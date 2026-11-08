import {moveCategory, moveOf} from '../core/moves.ts';
import {moveType} from '../core/type-chart.ts';

/** Type chip colours (camp chips, machine discs) and the lighter variant used for damage numbers over the map. */
export const TYPE_COLORS:Record<string,string>={Normal:'#5f5e50',Water:'#2b5f8a',Fire:'#a8482a',Grass:'#3f7a3a',Electric:'#9a7a24',Ice:'#4f8196',Fighting:'#963f45',Poison:'#765196',Ground:'#86643b',Flying:'#54799b',Psychic:'#a25891',Bug:'#55753a',Rock:'#776749',Ghost:'#5b4e81',Dragon:'#4f4c9b',Dark:'#49413b',Steel:'#627381',Fairy:'#9d6688'};
const lighten=(hex:string,k:number)=>'#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*(1-k)+255*k).toString(16).padStart(2,'0')).join('');
export const damageNumberColor=(type:string)=>TYPE_COLORS[type]?lighten(TYPE_COLORS[type],.5):'#ffffff';
export type EffectTemplate='melee'|'special'|'shot'|'beam'|'around'|'room'|'up'|'down'|'status'|'heal'|'guard'|'blow';
export type EffectStyle={move:string|null;template:EffectTemplate;type:string;superEffective?:boolean;resisted?:boolean};

/** Pure presentation lookup. It reads the existing move rules and never changes them. */
export function effectForMove(move:string|null):EffectStyle|null {
  if(move===null)return {move:null,template:'melee',type:'Normal'};
  const spec=moveOf(move),category=moveCategory(move),type=moveType(move);
  if(!spec||!category||!type)return null;
  const effects=spec.effects;
  let template:EffectTemplate|null=null;
  if(effects.includes('blowaway'))template='blow';
  else if(effects.some(effect=>['protect','counter','quickguard','reflect','lightscreen'].includes(effect)))template='guard';
  else if(effects.includes('heal:1:2'))template='heal';
  else if(effects.some(effect=>/^stage:[a-z]+:\+\d+$/.test(effect)))template='up';
  else if(effects.some(effect=>/^stage:[a-z]+:-\d+$/.test(effect)))template='down';
  else if(effects.some(effect=>effect.startsWith('status:'))||effects.includes('rest'))template='status';
  else if(effects.includes('damage')||move==='snore'){
    if(spec.range==='around')template='around';
    else if(spec.range==='room')template='room';
    else if(spec.range==='front2'||spec.range==='line10')template=category==='Physical'?'shot':category==='Special'?'beam':null;
    else if(spec.range==='front')template=category==='Physical'?'melee':category==='Special'?'special':null;
  }
  return template?{move,template,type}:null;
}
