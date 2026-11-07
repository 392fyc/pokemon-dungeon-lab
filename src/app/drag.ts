/**
 * Pointer-based drag and drop for mouse, pen and touch (Pointer Events; HTML5 drag does not work with a finger).
 * Pattern from Pokemon Mystery Dungeon: Gates to Infinity's bag, where an item is dragged onto a quick slot to pin it
 * (research note docs/06-研究/参考项目/pdmn/招式特效与手机布局.md, section 4). Clicking still works: a drag starts only after the pointer moves.
 * While dragging, a ghost copy follows the pointer and every legal drop target is highlighted (`drop-ok`, and `drop-hover` under the pointer).
 * Touch: vertical swipes keep scrolling the list (touch-action: pan-y on the sources); a drag starts after a ~250 ms press or a sideways move.
 */
export type DragRule={
  /** CSS selector of what can be picked up (matched with closest()). */
  source:string;
  /** CSS selector of where it can be dropped. */
  targets:string;
  /** Extra check for one source/target pair; a target that fails is not highlighted and does not accept. */
  accept?:(source:HTMLElement,target:HTMLElement)=>boolean;
  drop:(source:HTMLElement,target:HTMLElement)=>void;
};
const THRESHOLD=8,HOLD_MS=250;
type Active={rule:DragRule;source:HTMLElement;x:number;y:number;id:number;touch:boolean;armed:boolean;timer:ReturnType<typeof setTimeout>|null;ghost:HTMLElement|null;originX:number;originY:number;hover:HTMLElement|null;valid:HTMLElement[]};
let active:Active|null=null,installed=false,afterRelease:number|null=null;
const legal=(rule:DragRule,source:HTMLElement):HTMLElement[]=>Array.from(document.querySelectorAll<HTMLElement>(rule.targets)).filter(t=>t!==source&&!source.contains(t)&&(rule.accept?.(source,t)??true));
function targetAt(a:Active,x:number,y:number):HTMLElement|null{
  // elementsFromPoint, not elementFromPoint: a modal scrim may sit above a legal target such as the bottom quick bar.
  for(const el of document.elementsFromPoint(x,y)){
    if(el===a.ghost||a.ghost?.contains(el))continue;
    const hit=(el as HTMLElement).closest?.(a.rule.targets) as HTMLElement|null;
    if(hit&&a.valid.includes(hit))return hit;
  }
  return null;
}
function clear():void{
  if(!active)return;
  if(active.timer)clearTimeout(active.timer);
  active.ghost?.remove();active.valid.forEach(el=>el.classList.remove('drop-ok','drop-hover'));
  active.source.classList.remove('is-dragging');document.body.classList.remove('is-dragging');active=null;
}
/** The click that follows a finished drag must not also select or toggle something. */
function swallowNextClick():void{
  const stop=(e:Event)=>{e.stopPropagation();e.preventDefault();};
  document.addEventListener('click',stop,{capture:true,once:true});
  setTimeout(()=>document.removeEventListener('click',stop,true),60);
}
/** Ends the drag (drop target already decided). While the button or finger is still down, the release that follows is swallowed too. */
function finish(pointerStillDown:boolean):void{
  const id=active?.id??null,dragged=!!active?.ghost;clear();
  if(pointerStillDown&&dragged&&id!==null)afterRelease=id;else if(dragged)swallowNextClick();
}
function begin(a:Active,x:number,y:number):void{
  const box=a.source.getBoundingClientRect(),ghost=a.source.cloneNode(true) as HTMLElement;
  ghost.removeAttribute('id');ghost.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
  ghost.classList.add('drag-ghost');
  Object.assign(ghost.style,{position:'fixed',left:'0',top:'0',width:box.width+'px',height:box.height+'px',margin:'0',pointerEvents:'none',zIndex:'2147483647',opacity:'.9',transform:'translate(0px,0px)'});
  // Inside the source's own dialog, so a modal window cannot cover it (the top layer ignores z-index of body children).
  (a.source.closest('dialog')??document.body).append(ghost);
  // A transformed ancestor makes `fixed` relative to itself; measure where (0,0) really lands and correct for it.
  const at=ghost.getBoundingClientRect();a.originX=at.left;a.originY=at.top;
  a.ghost=ghost;a.valid=legal(a.rule,a.source);a.valid.forEach(el=>el.classList.add('drop-ok'));
  a.source.classList.add('is-dragging');document.body.classList.add('is-dragging');
  place(a,x,y);
}
function place(a:Active,x:number,y:number):void{
  const g=a.ghost!,w=parseFloat(g.style.width),h=parseFloat(g.style.height);
  g.style.transform=`translate(${x-w/2-a.originX}px,${y-h/2-a.originY}px) scale(1.04)`;
  const over=targetAt(a,x,y);
  if(over!==a.hover){a.hover?.classList.remove('drop-hover');over?.classList.add('drop-hover');a.hover=over;}
}
export function installDrag(rules:DragRule[]):void{
  if(installed)return;installed=true;
  document.addEventListener('pointerdown',e=>{
    if(active||(e.pointerType==='mouse'&&e.button!==0))return;
    const from=e.target as HTMLElement|null;if(!from?.closest)return;
    for(const rule of rules){
      const source=from.closest<HTMLElement>(rule.source);
      if(source&&!source.hasAttribute('disabled')&&legal(rule,source).length){
        const a:Active={rule,source,x:e.clientX,y:e.clientY,id:e.pointerId,touch:e.pointerType==='touch',armed:false,timer:null,ghost:null,originX:0,originY:0,hover:null,valid:[]};
        // A finger must press and hold before the drag starts, so a swipe along a list still scrolls it.
        if(a.touch)a.timer=setTimeout(()=>{if(active===a&&!a.ghost){a.armed=true;begin(a,a.x,a.y);}},HOLD_MS);
        active=a;return;
      }
    }
  });
  document.addEventListener('pointermove',e=>{
    const a=active;if(!a||e.pointerId!==a.id)return;
    if(!a.source.isConnected){clear();return;}   // the list was redrawn under the pointer
    if(!a.ghost){
      const dx=e.clientX-a.x,dy=e.clientY-a.y,moved=Math.hypot(dx,dy);
      if(a.touch){
        if(moved<THRESHOLD*1.5)return;
        if(Math.abs(dy)>Math.abs(dx)){clear();return;}   // vertical: the browser scrolls the list, this is not a drag
      }else if(moved<THRESHOLD)return;
      begin(a,e.clientX,e.clientY);
    }
    e.preventDefault();place(a,e.clientX,e.clientY);
  },{passive:false});
  // Once a long press armed the drag the page must not scroll under the finger.
  document.addEventListener('touchmove',e=>{if(active?.ghost&&e.cancelable)e.preventDefault();},{passive:false});
  const end=(e:PointerEvent,cancelled:boolean)=>{
    if(afterRelease===e.pointerId){afterRelease=null;swallowNextClick();return;}
    const a=active;if(!a||e.pointerId!==a.id)return;
    if(!a.ghost){clear();return;}   // never became a drag: let the click through
    const connected=a.source.isConnected,target=cancelled||!connected?null:targetAt(a,e.clientX,e.clientY),rule=a.rule,source=a.source;
    finish(false);
    if(target)rule.drop(source,target);
  };
  document.addEventListener('pointerup',e=>end(e,false));
  window.addEventListener('pointerup',e=>end(e,false));
  document.addEventListener('pointercancel',e=>end(e,true));
  window.addEventListener('blur',()=>clear());
  // Esc cancels a drag, and must not also close the window the drag happens in (keydown default, and the dialog's own cancel event).
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active?.ghost){e.preventDefault();e.stopPropagation();finish(true);}},true);
  document.addEventListener('cancel',e=>{if(active?.ghost)e.preventDefault();},true);
}
/** The interface calls this after it redraws: a drag whose source element is gone ends and its ghost is removed. */
export function reconcileDrag():void{if(active&&!active.source.isConnected)clear();}
/** Test hook: whether a drag is in progress. */
export const dragging=():boolean=>!!active?.ghost;
