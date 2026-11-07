import {ITEM_NAMES,type Item,type PointKind,type World} from '../core/engine.ts';
import {ITEM_ICON_FILE} from './item-icons.ts';
export type PointVisual={icon:'goal'|'item'|'exit'|'stairs-down'|'stairs-up'|'drop'|'rest'|'shop'|'exchange';name:string;color:number;texture?:string};
const drop=(item:Item,color:number):PointVisual=>({icon:'drop',name:ITEM_NAMES[item],color,texture:ITEM_ICON_FILE[item]});
/** Every point has an explicit visual; consumables must never fall through to the exit marker. */
export const POINT_VISUALS:Record<PointKind,PointVisual>={
 goal:{icon:'goal',name:'基础目标',color:0xf0d779},item:{icon:'item',name:'招式机',color:0xe7d68b},exit:{icon:'exit',name:'出口',color:0xe4efb0},
 down:{icon:'stairs-down',name:'下楼梯',color:0xe4efb0},up:{icon:'stairs-up',name:'上楼梯',color:0xe4efb0},
 berry:drop('berry',0xf39842),tonic:drop('tonic',0x8cc8f6),pechaBerry:drop('pechaBerry',0xf39fb7),rawstBerry:drop('rawstBerry',0x77b8e8),cheriBerry:drop('cheriBerry',0xe94e4a),chestoBerry:drop('chestoBerry',0xb6a778),healSeed:drop('healSeed',0xd7bd75),
 slumberOrb:drop('slumberOrb',0x9b8ad8),totterOrb:drop('totterOrb',0xd88ab0),luminousOrb:drop('luminousOrb',0xf0e08a),rollcallOrb:drop('rollcallOrb',0x8ad8b0),
 rest:{icon:'rest',name:'休整点',color:0x6ec3ff},shop:{icon:'shop',name:'商店',color:0xf2b84b},exchange:{icon:'exchange',name:'交换机',color:0xc58bff},
};
/** Integer multiples preserve source pixels while showing about nine cells vertically. */
export const dungeonCellSize=(height:number)=>{
 const lower=Math.max(48,Math.floor(height/(9*24))*24),upper=lower+24;
 return Math.abs(height/upper-9)<=Math.abs(height/lower-9)?upper:lower;
};
/** What the player knows of the terrain: the explored cells, or the whole floor once a Luminous Orb was used. Units still follow `s.seen` only. */
export function terrainKnown(s:World):{seen:string[];seenWalls:string[]}{
 if(!s.mapRevealed)return {seen:s.seen,seenWalls:s.seenWalls??[]};
 const floor=new Set(s.floor.map(p=>p.x+','+p.y)),walls=new Set(s.seenWalls??[]),w=s.dungeon?.width??Infinity,h=s.dungeon?.height??Infinity;
 for(const p of s.floor)for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const x=p.x+dx,y=p.y+dy,k=x+','+y;if(x>=0&&y>=0&&x<w&&y<h&&!floor.has(k))walls.add(k);}
 for(const c of s.liquid??[])walls.add(typeof c==='string'?c:(c as {x:number;y:number}).x+','+(c as {x:number;y:number}).y);
 return {seen:[...new Set([...s.seen,...floor])],seenWalls:[...walls]};
}
