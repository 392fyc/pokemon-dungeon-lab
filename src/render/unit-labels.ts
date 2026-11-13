import type Phaser from 'phaser';
import {animKey,groundOriginY} from './sprites.ts';

type VisibleBox={right:number;bottom:number};
const bounds=new WeakMap<Phaser.Textures.Frame,VisibleBox>();
/** Cache the original frame alpha bounds, so transparent padding never separates HP from the model. */
function visibleBox(frame:Phaser.Textures.Frame):VisibleBox {
 const saved=bounds.get(frame);if(saved)return saved;
 const canvas=document.createElement('canvas');canvas.width=frame.cutWidth;canvas.height=frame.cutHeight;
 const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
 ctx.drawImage(frame.source.image as CanvasImageSource,frame.cutX,frame.cutY,frame.cutWidth,frame.cutHeight,0,0,frame.cutWidth,frame.cutHeight);
 const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;let right=0,bottom=0;
 for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(rgba[(y*canvas.width+x)*4+3]){right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
 const box={right:right||frame.cutWidth,bottom:bottom||frame.cutHeight};bounds.set(frame,box);return box;
}
/** Keep the HP right and bottom edges inside the owner's cell. */
export function placeHp(sprite:Phaser.GameObjects.Sprite,label:Phaser.GameObjects.Text,cell:number,cellY:number):void {
 const box=visibleBox(sprite.frame);
 const right=sprite.x+(box.right-sprite.originX*sprite.frame.cutWidth)*sprite.scaleX+1;
 const bottom=sprite.y+(box.bottom-sprite.originY*sprite.frame.cutHeight)*sprite.scaleY+1;
 label.setOrigin(1,1).setPosition(Math.round(Math.min(right,sprite.x+cell/2-1)),Math.round(Math.min(bottom,cellY+cell/2-1)));
}

export const HP_HURT_RECOIL_PIXELS=3;
export type HpLabelBounds={left:number;top:number;right:number;bottom:number};
/** Union of the real placeHp positions across idle and the currently playing animation, including the requested label values. */
export function hpLabelMotionBounds(scene:Phaser.Scene,sprite:Phaser.GameObjects.Sprite,label:Phaser.GameObjects.Text,cell:number,cellY:number,dex:string,row:number,baseX:number,values:readonly string[]):HpLabelBounds {
 const candidates:{frame:Phaser.Textures.Frame;originY:number}[]=[];
 for(const name of ['Idle','Hurt','Attack']){
  const animation=scene.anims.get(animKey(dex,name,row)),originY=groundOriginY(dex,name);
  if(animation)candidates.push(...animation.frames.map(frame=>({frame:frame.frame,originY})));
 }
 const current=sprite.anims.currentAnim;
 if(current)candidates.push(...current.frames.map(frame=>({frame:frame.frame,originY:sprite.originY})));
 if(!candidates.length)candidates.push({frame:sprite.frame,originY:sprite.originY});
 const original=label.text,dimensions:{width:number;height:number}[]=[];
 for(const value of new Set([original,...values])){label.setText(value);const bounds=label.getBounds();dimensions.push({width:bounds.width,height:bounds.height});}
 label.setText(original);
 const stroke=(label.style.strokeThickness??0)*Math.max(Math.abs(label.scaleX),Math.abs(label.scaleY))/2;
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 for(const {frame,originY} of candidates){
  const box=visibleBox(frame);
  for(const recoil of [0,HP_HURT_RECOIL_PIXELS]){
   const spriteX=baseX+recoil;
   const anchorRight=Math.round(Math.min(spriteX+(box.right-sprite.originX*frame.cutWidth)*sprite.scaleX+1,spriteX+cell/2-1));
   const anchorBottom=Math.round(Math.min(sprite.y+(box.bottom-originY*frame.cutHeight)*sprite.scaleY+1,cellY+cell/2-1));
   for(const size of dimensions){left=Math.min(left,anchorRight-size.width-stroke);top=Math.min(top,anchorBottom-size.height-stroke);right=Math.max(right,anchorRight+stroke);bottom=Math.max(bottom,anchorBottom+stroke);}
  }
 }
 return {left,top,right,bottom};
}
