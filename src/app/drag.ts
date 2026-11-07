/**
 * Pointer-based drag and drop for mouse, pen and touch (Pointer Events; HTML5 drag does not work with a finger).
 * Pattern from Pokemon Mystery Dungeon: Gates to Infinity's bag, where an item is dragged onto a quick slot to pin it
 * (research note docs/06-研究/参考项目/pdmn/招式特效与手机布局.md, section 4). Clicking still works: a drag starts only after the pointer moves.
 * While dragging, a ghost copy follows the pointer and every legal drop target is highlighted (`drop-ok`, and `drop-hover` under the pointer).
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
const THRESHOLD=8;
type Active={rule:DragRule;source:HTMLElement;x:number;y:number;id:number;ghost:HTMLElement|null;hover:HTMLElement|null;valid:HTMLElement[]};
let active:Active|null=null,installed=false;
const legal=(rule:DragRule,source:HTMLElement):HTMLElement[]=>Array.from(document.querySelectorAll<HTMLElement>(rule.targets)).filter(t=>t!==source&&!source.contains(t)&&(rule.accept?.(source,t)??true));
function targetAt(a:Active,x:number,y:number):HTMLElement|null{
  // elementsFromPoint, not elementFromPoint: a modal scrim may sit above a legal target such as the bottom quick bar.
  for(const el of document.elementsFromPoint(x,y)){
    if(el===a.ghost)continue;
    const hit=(el as HTMLElement).closest?.(a.rule.targets) as HTMLElement|null;
    if(hit&&a.valid.includes(hit))return hit;
  }
  return null;
}
function finish():void{
  if(!active)return;
  active.ghost?.remove();active.valid.forEach(el=>el.classList.remove('drop-ok','drop-hover'));
  active.source.classList.remove('is-dragging');document.body.classList.remove('is-dragging');active=null;
}
/** The click that follows a finished drag must not also select or toggle something. */
function swallowNextClick():void{
  const stop=(e:Event)=>{e.stopPropagation();e.preventDefault();};
  document.addEventListener('click',stop,{capture:true,once:true});
  setTimeout(()=>document.removeEventListener('click',stop,true),60);
}
export function installDrag(rules:DragRule[]):void{
  if(installed)return;installed=true;
  document.addEventListener('pointerdown',e=>{
    if(active||(e.pointerType==='mouse'&&e.button!==0))return;
    const from=e.target as HTMLElement|null;if(!from?.closest)return;
    for(const rule of rules){
      const source=from.closest<HTMLElement>(rule.source);
      if(source&&!source.hasAttribute('disabled')&&legal(rule,source).length){active={rule,source,x:e.clientX,y:e.clientY,id:e.pointerId,ghost:null,hover:null,valid:[]};return;}
    }
  });
  document.addEventListener('pointermove',e=>{
    const a=active;if(!a||e.pointerId!==a.id)return;
    if(!a.ghost){
      if(Math.hypot(e.clientX-a.x,e.clientY-a.y)<THRESHOLD)return;
      const box=a.source.getBoundingClientRect(),ghost=a.source.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('id');ghost.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
      ghost.classList.add('drag-ghost');Object.assign(ghost.style,{position:'fixed',left:'0',top:'0',width:box.width+'px',height:box.height+'px',margin:'0',pointerEvents:'none',zIndex:'200',opacity:'.88',transform:`translate(${e.clientX-box.width/2}px,${e.clientY-box.height/2}px) scale(1.04)`});
      document.body.append(ghost);a.ghost=ghost;a.valid=legal(a.rule,a.source);a.valid.forEach(el=>el.classList.add('drop-ok'));
      a.source.classList.add('is-dragging');document.body.classList.add('is-dragging');
    }
    e.preventDefault();
    const box=a.ghost.getBoundingClientRect();a.ghost.style.transform=`translate(${e.clientX-box.width/2}px,${e.clientY-box.height/2}px) scale(1.04)`;
    const over=targetAt(a,e.clientX,e.clientY);
    if(over!==a.hover){a.hover?.classList.remove('drop-hover');over?.classList.add('drop-hover');a.hover=over;}
  },{passive:false});
  const end=(e:PointerEvent,cancelled:boolean)=>{
    const a=active;if(!a||e.pointerId!==a.id)return;
    if(!a.ghost){active=null;return;}   // never became a drag: let the click through
    const target=cancelled?null:targetAt(a,e.clientX,e.clientY),rule=a.rule,source=a.source;
    finish();swallowNextClick();
    if(target)rule.drop(source,target);
  };
  document.addEventListener('pointerup',e=>end(e,false));
  document.addEventListener('pointercancel',e=>end(e,true));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active?.ghost){e.stopPropagation();finish();swallowNextClick();}},true);
}
/** Test hook: whether a drag is in progress. */
export const dragging=():boolean=>!!active?.ghost;
