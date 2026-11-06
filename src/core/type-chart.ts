/** Pure type lookup helpers over the fixed modern 18-type Showdown snapshot. */
import moveTypes from '../data/move-types.json' with {type:'json'};
import chart from '../data/type-chart.json' with {type:'json'};

type MoveTypes={types:Record<string,string>};
type TypeChart={types:string[];effectiveness:Record<string,Record<string,number>>};
const moves=(moveTypes as unknown as MoveTypes).types;
const effectiveness=(chart as unknown as TypeChart).effectiveness;

/** Returns the move's modern type, or undefined when that move has no source record. */
export function moveType(moveId:string):string|undefined {
  return Object.prototype.hasOwnProperty.call(moves,moveId)?moves[moveId]:undefined;
}

/** Multiplies one move's type matchup across all defending types; missing data is neutral. */
export function typeEffectiveness(moveId:string,targetTypes:readonly string[]=[]):number {
  const attackType=moveType(moveId);
  if(!attackType||!Object.prototype.hasOwnProperty.call(effectiveness,attackType))return 1;
  const row=effectiveness[attackType];
  return targetTypes.reduce((multiplier,target)=>multiplier*(Object.prototype.hasOwnProperty.call(row,target)?row[target]:1),1);
}

/** Returns the modern same-type attack bonus (1.5) when the user shares the move type. */
export function stabMultiplier(moveId:string,attackerTypes:readonly string[]=[]):number {
  const type=moveType(moveId);
  return type&&attackerTypes.includes(type)?1.5:1;
}
