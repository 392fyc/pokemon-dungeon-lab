/**
 * Current ability values (playtest round 3, rule from the main series with individual and effort values 0 and a neutral nature):
 *   stat   = floor(2 x base x level / 100) + 5      (attack, defence, special attack, special defence, speed)
 *   max HP = floor(2 x base HP x level / 100) + level + 10   (before the stamina talent and the difficulty multiplier)
 * The damage rule (damageAmount in engine.ts) and the details window both read `currentStats`, so what the player sees is what is calculated.
 * Ability stages stay a separate flat adjustment applied in the damage rule (see STAGE_DAMAGE below); speed does not affect action order in this game.
 */
import {speciesOf} from './roster.ts';
export type StatKey='atk'|'def'|'spa'|'spd'|'spe';
export const STAT_KEYS:readonly StatKey[]=['atk','def','spa','spd','spe'];
export const statAtLevel=(base:number,level:number):number=>Math.floor(2*base*level/100)+5;
export const hpAtLevel=(base:number,level:number):number=>Math.floor(2*base*level/100)+level+10;
export type StatUnit={species?:string;level?:number};
/** The unit's five current ability values, or null for a unit without a species (fixtures), which then fights on a neutral 1:1 ratio. */
export function currentStats(u:StatUnit,defaultLevel=5):Record<StatKey,number>|null{
  const base=u.species?speciesOf(u.species)?.baseStats:undefined;if(!base)return null;
  const level=u.level??defaultLevel;
  return {atk:statAtLevel(base.atk,level),def:statAtLevel(base.def,level),spa:statAtLevel(base.spa,level),spd:statAtLevel(base.spd,level),spe:statAtLevel(base.spe,level)};
}
