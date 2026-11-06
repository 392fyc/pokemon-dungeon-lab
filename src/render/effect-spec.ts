import {moveCategory, moveOf} from '../core/moves.ts';
import {moveType} from '../core/type-chart.ts';

export type EffectTemplate='melee'|'special'|'shot'|'beam'|'around'|'room'|'up'|'down'|'status'|'heal'|'guard'|'blow';
export type EffectStyle={move:string|null;template:EffectTemplate;type:string;superEffective?:boolean};

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
