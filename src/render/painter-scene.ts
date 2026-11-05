import type Phaser from 'phaser';
import {frameOf,maskAt,terrainVariant,selectDecorations,type PreparedTerrainMap,type TerrainThemeKey,type TerrainLayer,type RGB} from './terrain.ts';
import {TILE} from './sprites.ts';

type ImageSpec={texture:string;frame:string;x:number;y:number;depth:number;originY?:number};
type PaintArgs={map:PreparedTerrainMap;theme:TerrainThemeKey;seed:number;level:number;scale:number;excluded:readonly {x:number;y:number}[];center:(p:{x:number;y:number})=>{x:number;y:number}};
/** Keep unchanged ground images alive; only newly revealed or reshaped cells change objects. */
export class PainterTerrainLayer {
 private floor='';private cells=new Map<string,{image:Phaser.GameObjects.Image;signature:string}>();private underlay?:Phaser.GameObjects.TileSprite;private color:RGB=[30,30,30];private builds=0;private changes=0;
 constructor(private scene:Phaser.Scene){}
 get images():readonly Phaser.GameObjects.Image[]{return [...this.cells.values()].map(c=>c.image);}
 wallColor():RGB{return this.color;}
 clear(){for(const c of this.cells.values())c.image.destroy();this.cells.clear();this.underlay?.destroy();this.underlay=undefined;this.floor='';}
 show(floor:string,args:PaintArgs){
  const {map,theme,seed,level,scale,center}=args,cell=TILE*scale,texture='terrain-'+theme+'-wall',wallFrame='v0-f'+frameOf(255);
  if(floor!==this.floor){this.clear();this.floor=floor;this.builds++;const frame=this.scene.textures.getFrame(texture,wallFrame),canvas=document.createElement('canvas');canvas.width=TILE;canvas.height=TILE;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(frame.source.image as CanvasImageSource,frame.cutX,frame.cutY,TILE,TILE,0,0,TILE,TILE);const data=ctx.getImageData(0,0,TILE,TILE).data,sum=[0,0,0];let count=0;for(let i=0;i<data.length;i+=4)if(data[i+3]){for(let c=0;c<3;c++)sum[c]+=data[i+c];count++;}this.color=sum.map(n=>Math.round(n/Math.max(1,count))) as [number,number,number];
   this.underlay=this.scene.add.tileSprite(-64*cell,-64*cell,(map.width+128)*cell,(map.height+128)*cell,texture,wallFrame).setOrigin(0).setDepth(.5).setTileScale(scale);
  }
  this.underlay?.setPosition(-64*cell,-64*cell).setSize((map.width+128)*cell,(map.height+128)*cell).setTileScale(scale);
  const desired=new Map<string,ImageSpec>();
  const tile=(x:number,y:number,layer:TerrainLayer|'floor')=>{const c=center({x,y}),frame=layer==='floor'?((x%16+16)%16)+','+((y%16+16)%16):'v'+terrainVariant(x,y,layer,seed,level,theme)+'-f'+frameOf(maskAt(map,x,y,layer));desired.set(x+','+y+':'+layer,{texture:'terrain-'+theme+'-'+layer,frame,x:c.x,y:c.y,depth:layer==='floor'?1:layer==='edge'?1.1:layer==='liquid'?1.2:1.3});};
  for(const k of map.known){const [x,y]=k.split(',').map(Number);if(map.floor.has(k)){tile(x,y,'floor');tile(x,y,'edge');}else tile(x,y,map.liquid.has(k)?'liquid':'wall');}
  const decoKey='deco-'+theme,atlas=this.scene.textures.exists(decoKey)?{frames:this.scene.textures.get(decoKey).getFrameNames()}:null;
  for(const deco of selectDecorations({map,theme,seed,level,excluded:args.excluded,atlas})){const c=center(deco);desired.set('deco:'+deco.x+','+deco.y,{texture:decoKey,frame:deco.frame,x:c.x,y:c.y+cell/2,depth:1.5,originY:1});}
  this.changes=0;for(const [key,spec]of desired){const signature=spec.texture+'|'+spec.frame+'|'+spec.depth;let saved=this.cells.get(key);if(saved?.signature!==signature){saved?.image.destroy();const image=this.scene.add.image(spec.x,spec.y,spec.texture,spec.frame).setDepth(spec.depth).setOrigin(.5,spec.originY??.5);saved={image,signature};this.cells.set(key,saved);this.changes++;}saved.image.setPosition(spec.x,spec.y).setScale(scale);}
  for(const [key,saved]of this.cells)if(!desired.has(key)){saved.image.destroy();this.cells.delete(key);this.changes++;}
 }
 debug(){return {floor:this.floor,buildCount:this.builds,changedCells:this.changes,images:this.cells.size,wallColor:this.color,margin:64};}
}
