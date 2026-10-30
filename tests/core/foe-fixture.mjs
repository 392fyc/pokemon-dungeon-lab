/**
 * Test-only enemy builder. The engine's `enemy()` ignores the old hp/damage/range arguments (7.8: an enemy is a roster
 * species at its level and attacks only with its roster moves). Tests that need a specific HP set it explicitly here;
 * `damage===0` still means "waits only", every other damage value is ignored.
 */
import {enemy as rosterEnemy} from '../../src/core/engine.ts';
export function enemy(id,x,y,hp,role,damage,range=1){
  const e=rosterEnemy(id,x,y,hp,role,damage,range);
  e.hp=hp;e.maxHp=hp;
  return e;
}

import {speciesUnit} from '../../src/core/engine.ts';
/** An enemy of a named roster species at level 5 with explicit HP; `moves` ({id:pp}) replaces its kit when given. */
export function foeOf(id,species,x,y,hp,moves){
  const e=speciesUnit(id,species,5,{x,y});
  e.side='enemy';e.tactic='gofoes';e.hp=hp;e.maxHp=hp;
  if(moves){e.learned=Object.keys(moves);e.pp={...moves};e.maxPp={...moves};}
  return e;
}
/** A boss-marked arcanine (the only boss species): it never moves and cannot be blown away. */
export function bossOf(id,x,y,hp,moves){const b=foeOf(id,'arcanine',x,y,hp,moves);b.boss=true;return b;}
