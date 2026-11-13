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
/** Search the gaps inside the camera, so an offscreen gap cannot hide a farther visible one. */
function nearestVisibleVerticalOffset(swept:TextBounds,blockers:readonly TextBounds[],viewport:TextBounds):number|undefined{
 if(swept.left<viewport.left||swept.right>viewport.right)return undefined;
 const min=Math.ceil(viewport.top-swept.top),max=Math.floor(viewport.bottom-swept.bottom);
 const blocked=blockers.filter(b=>swept.left<b.right&&swept.right>b.left)
  .map(b=>[b.top-swept.bottom,b.bottom-swept.top] as const);
 const candidates=[0,min,max,...blocked.flatMap(([top,bottom])=>[Math.ceil(top)-1,Math.floor(bottom)+1])];
 return candidates.filter(dy=>dy>=min&&dy<=max&&blocked.every(([top,bottom])=>dy<top||dy>bottom))
  .sort((a,b)=>Math.abs(a)-Math.abs(b)||a-b)[0];
}
/** Keep the vertical placement near the target; if it exceeds 0.75 cell, find the nearest visible side position. */
export function nearestClearTextOffset(swept:TextBounds,blockers:readonly TextBounds[],cell:number,viewport?:TextBounds):TextOffset{
 const verticalThreshold=Math.ceil(cell*.75),verticalLimit=cell*3;
 const vertical=viewport?nearestVisibleVerticalOffset(swept,blockers,viewport):nearestClearVerticalOffset(swept,blockers,verticalLimit);
 if(vertical!==undefined&&Math.abs(vertical)<=verticalThreshold)return {dx:0,dy:vertical};
 let best:TextOffset|undefined,bestDistance=Infinity;
 let visibleFallback=vertical===undefined?undefined:{dx:0,dy:vertical},fallbackDistance=vertical===undefined?Infinity:vertical*vertical;
 const horizontalLimit=cell*2;
 for(let dx=1;dx<=horizontalLimit;dx++)for(const signedX of [-dx,dx]){
  const moved={left:swept.left+signedX,top:swept.top,right:swept.right+signedX,bottom:swept.bottom};
  const dy=viewport?nearestVisibleVerticalOffset(moved,blockers,viewport):nearestClearVerticalOffset(moved,blockers,verticalThreshold);
  if(dy===undefined)continue;
  const distance=signedX*signedX+dy*dy;
  if(viewport&&distance<fallbackDistance){visibleFallback={dx:signedX,dy};fallbackDistance=distance;}
  if(Math.abs(dy)>verticalThreshold)continue;
  if(distance<bestDistance){best={dx:signedX,dy};bestDistance=distance;}
 }
 // If no non-overlapping rectangle fits anywhere in the searched viewport region, preserve the existing HP-clear fallback.
 return best??visibleFallback??{dx:0,dy:nearestClearVerticalOffset(swept,blockers,verticalLimit)};
}
