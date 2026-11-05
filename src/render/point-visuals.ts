import {ITEM_NAMES,type PointKind} from '../core/engine.ts';
export type PointVisual={icon:'goal'|'item'|'exit'|'stairs-down'|'stairs-up'|'berry'|'tonic'|'seed'|'rest'|'shop'|'exchange';name:string;color:number};
/** Every point has an explicit visual; consumables must never fall through to the exit marker. */
export const POINT_VISUALS:Record<PointKind,PointVisual>={
 goal:{icon:'goal',name:'基础目标',color:0xf0d779},item:{icon:'item',name:'招式机',color:0xe7d68b},exit:{icon:'exit',name:'出口',color:0xe4efb0},
 down:{icon:'stairs-down',name:'下楼梯',color:0xe4efb0},up:{icon:'stairs-up',name:'上楼梯',color:0xe4efb0},
 berry:{icon:'berry',name:ITEM_NAMES.berry,color:0xf39842},tonic:{icon:'tonic',name:ITEM_NAMES.tonic,color:0x8cc8f6},
 pechaBerry:{icon:'berry',name:ITEM_NAMES.pechaBerry,color:0xf39fb7},rawstBerry:{icon:'berry',name:ITEM_NAMES.rawstBerry,color:0x77b8e8},cheriBerry:{icon:'berry',name:ITEM_NAMES.cheriBerry,color:0xe94e4a},healSeed:{icon:'seed',name:ITEM_NAMES.healSeed,color:0xd7bd75},
 rest:{icon:'rest',name:'休整点',color:0x6ec3ff},shop:{icon:'shop',name:'商店',color:0xf2b84b},exchange:{icon:'exchange',name:'交换机',color:0xc58bff},
};
/** Integer multiples preserve source pixels while showing about nine cells vertically. */
export const dungeonCellSize=(height:number)=>{
 const lower=Math.max(48,Math.floor(height/(9*24))*24),upper=lower+24;
 return Math.abs(height/upper-9)<=Math.abs(height/lower-9)?upper:lower;
};
