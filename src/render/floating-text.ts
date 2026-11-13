import type Phaser from 'phaser';

export type TextBounds={left:number;top:number;right:number;bottom:number};

/** Phaser's getBounds includes the displayed text size and transform; add half the canvas stroke on each edge. */
export function strokedTextBounds(text:Phaser.GameObjects.Text):TextBounds{
 const bounds=text.getBounds(),stroke=(text.style.strokeThickness??0)*Math.max(Math.abs(text.scaleX),Math.abs(text.scaleY))/2;
 return {left:bounds.x-stroke,top:bounds.y-stroke,right:bounds.right+stroke,bottom:bounds.bottom+stroke};
}

/** The full rectangle a moving text can cover, including its largest scale during the bounce. */
export function sweptTextBounds(text:Phaser.GameObjects.Text,x:number,fromY:number,toY:number,maxScale=1):TextBounds{
 const bounds=text.getBounds(),stroke=(text.style.strokeThickness??0)*Math.max(Math.abs(text.scaleX),Math.abs(text.scaleY))*maxScale/2;
 const halfW=bounds.width*maxScale/2+stroke,halfH=bounds.height*maxScale/2+stroke;
 return {left:x-halfW,top:Math.min(fromY,toY)-halfH,right:x+halfW,bottom:Math.max(fromY,toY)+halfH};
}

/** Pick the closest whole-pixel vertical move that keeps a text's entire path outside every blocker. */
export function nearestClearVerticalOffset(swept:TextBounds,blockers:readonly TextBounds[],limit:number):number{
 const blocked=blockers.filter(b=>swept.left<b.right&&swept.right>b.left)
  .map(b=>[b.top-swept.bottom,b.bottom-swept.top] as const).sort((a,b)=>a[0]-b[0]);
 const safe=(dy:number)=>blocked.every(([top,bottom])=>dy<top||dy>bottom);
 if(safe(0))return 0;
 for(let distance=1;distance<=limit;distance++){
  if(safe(-distance))return -distance;
  if(safe(distance))return distance;
 }
 // The finite search normally ends after clearing the local HP labels. If a dense test fixture has more blockers,
 // choose just beyond the nearest outer edge so the label still cannot cover a bar or number.
 const top=Math.min(...blocked.map(interval=>interval[0])),bottom=Math.max(...blocked.map(interval=>interval[1]));
 return Math.abs(top)<Math.abs(bottom)?Math.floor(top)-1:Math.ceil(bottom)+1;
}

export type TextOffset={dx:number;dy:number};
/** Keep the vertical placement near the target; if it exceeds 0.75 cell, find the nearest visible side position. */
export function nearestClearTextOffset(swept:TextBounds,blockers:readonly TextBounds[],cell:number,viewport?:TextBounds):TextOffset{
 const verticalThreshold=Math.ceil(cell*.75),verticalLimit=cell*3;
 const inside=(box:TextBounds)=>!viewport||(box.left>=viewport.left&&box.right<=viewport.right&&box.top>=viewport.top&&box.bottom<=viewport.bottom);
 const vertical=nearestClearVerticalOffset(swept,blockers,verticalLimit),verticalBox={left:swept.left,top:swept.top+vertical,right:swept.right,bottom:swept.bottom+vertical};
 if(Math.abs(vertical)<=verticalThreshold&&inside(verticalBox))return {dx:0,dy:vertical};
 let best:TextOffset|undefined,bestDistance=Infinity;
 const horizontalLimit=cell*2;
 for(let dx=1;dx<=horizontalLimit;dx++)for(const signedX of [-dx,dx]){
  const moved={left:swept.left+signedX,top:swept.top,right:swept.right+signedX,bottom:swept.bottom};
  const dy=nearestClearVerticalOffset(moved,blockers,verticalThreshold);
  if(Math.abs(dy)>verticalThreshold)continue;
  const placed={left:moved.left,top:moved.top+dy,right:moved.right,bottom:moved.bottom+dy};
  if(!inside(placed))continue;
  const distance=signedX*signedX+dy*dy;
  if(distance<bestDistance){best={dx:signedX,dy};bestDistance=distance;}
 }
 return best??{dx:0,dy:vertical};
}
