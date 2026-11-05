import type Phaser from 'phaser';

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
/** Keep the HP number at its model's lower-right edge, contained in its own cell. */
export function placeHp(sprite:Phaser.GameObjects.Sprite,label:Phaser.GameObjects.Text,cell:number):void {
 const box=visibleBox(sprite.frame);
 const right=sprite.x+(box.right-sprite.originX*sprite.frame.cutWidth)*sprite.scaleX+1;
 label.setOrigin(1,1).setPosition(Math.round(Math.min(right,sprite.x+cell/2-1)),Math.round(sprite.y+(box.bottom-sprite.originY*sprite.frame.cutHeight)*sprite.scaleY+1));
}
