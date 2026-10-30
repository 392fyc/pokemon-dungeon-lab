/** Official move reach, target and effect data for the current private trial. */
import source from '../data/pmd-moves.json' with {type:'json'};

export type MoveRange='front'|'front2'|'line10'|'around'|'room'|'user';
export type MoveTarget='enemy'|'user'|'teammates'|'party'|'all';
export type MoveSpec={
  range:MoveRange;
  target:MoveTarget;
  power:number|null;
  effects:string[];
  source?:string;
  game?:string;
  gameName?:string;
  note?:string;
  official?:Record<string,string>;
};

type MoveData={moves:Record<string,MoveSpec>};
/** The mutable table is exported so focused tests can inject a synthetic range/effect and restore it afterward. */
export const MOVE_DEFS:Record<string,MoveSpec>=Object.assign(Object.create(null), (source as unknown as MoveData).moves);
export function moveOf(id:string):MoveSpec|undefined {
  return Object.prototype.hasOwnProperty.call(MOVE_DEFS,id)?MOVE_DEFS[id]:undefined;
}
