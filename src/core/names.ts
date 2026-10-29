/** Simplified-Chinese display names (hand-curated, see the `source` field of src/data/names-zh.json). Game data keeps the English ids; only the UI looks names up here. */
import zh from '../data/names-zh.json' with {type:'json'};
const table=zh as unknown as {species:Record<string,string>;types:Record<string,string>;moves:Record<string,string>;tms:Record<string,string>;items:Record<string,string>};
const pick=(map:Record<string,string>,id:string):string=>Object.prototype.hasOwnProperty.call(map,id)?map[id]:id;
export const speciesZh=(id:string)=>pick(table.species,id);
export const moveZh=(id:string)=>pick(table.moves,id);
export const typeZh=(id:string)=>pick(table.types,id);
export const itemZh=(id:string)=>pick(table.items,id);
/** The technique machine's move, by the same table as every other move (kept in its own section so a test can check the machine pool). */
export const tmZh=(id:string)=>pick(table.tms,id);
export const NAME_TABLE=table;
