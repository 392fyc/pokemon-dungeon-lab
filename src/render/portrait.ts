import characters from './characters.json' with { type: 'json' };

export type PortraitRect={x:number;y:number;w:number;h:number};
export type PortraitOptions={boxClass:string;spriteClass:string;label:string;animated?:boolean};
type IdleMeta={file:string;w:number;h:number;durations:number[];visible?:PortraitRect};
type PortraitData=IdleMeta&{visible:PortraitRect};
const INDEX=characters as Record<string,Record<string,IdleMeta>>;
const html=(value:unknown)=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** A source rectangle must be a positive integer box contained by its animation frame. */
export function portraitVisibleRect(meta:Pick<IdleMeta,'w'|'h'|'visible'>|undefined):PortraitRect|null {
  if(!meta||!Number.isInteger(meta.w)||!Number.isInteger(meta.h)||meta.w<1||meta.h<1)return null;
  const v=meta.visible;
  if(v&&Number.isInteger(v.x)&&Number.isInteger(v.y)&&Number.isInteger(v.w)&&Number.isInteger(v.h)&&
    v.x>=0&&v.y>=0&&v.w>0&&v.h>0&&v.x+v.w<=meta.w&&v.y+v.h<=meta.h)return {x:v.x,y:v.y,w:v.w,h:v.h};
  return {x:0,y:0,w:meta.w,h:meta.h};
}

/** One shared frame clock keeps matching animated portraits in the same stable duration window. */
export function portraitFrameIndex(nowMs:number,durations:readonly number[],animated:boolean):number {
  if(!animated||!Number.isFinite(nowMs)||nowMs<0||!durations.length||durations.some(d=>!Number.isFinite(d)||d<=0))return 0;
  const total=durations.reduce((sum,d)=>sum+d,0)*1000/60;
  if(!Number.isFinite(total)||total<=0)return 0;
  let t=nowMs%total;
  for(let i=0;i<durations.length;i++){
    const window=durations[i]*1000/60;
    if(t<window)return i;
    t-=window;
  }
  return 0;
}

function portraitData(dex:string):PortraitData|null {
  const meta=INDEX[dex]?.Idle;
  if(!meta||!Number.isInteger(meta.w)||!Number.isInteger(meta.h)||meta.w<1||meta.h<1||
    typeof meta.file!=='string'||!meta.file||!Array.isArray(meta.durations)||!meta.durations.length||
    meta.durations.some(d=>!Number.isInteger(d)||d<1))return null;
  const visible=portraitVisibleRect(meta);
  if(!visible)return null;
  return {...meta,visible};
}

/** Render an Idle row with its visible pixel union centered in the caller-sized box. */
export function portraitMarkup(dex:string,{boxClass,spriteClass,label,animated=false}:PortraitOptions):string {
  const meta=portraitData(dex),w=meta?.w??1,h=meta?.h??1,durations=meta?.durations??[1],visible=meta?.visible??{x:0,y:0,w:1,h:1};
  const source=meta?'assets/'+meta.file:null;
  const asset=source&&typeof document!=='undefined'?new URL(source,document.baseURI).href:source;
  const style=[
    `--portrait-sheet:${asset?`url("${asset}")`:'none'}`,
    `--portrait-frame-w:${w}`,`--portrait-frame-h:${h}`,`--portrait-frame-count:${durations.length}`,
    `--portrait-visible-x:${visible.x}`,`--portrait-visible-y:${visible.y}`,
    `--portrait-visible-w:${visible.w}`,`--portrait-visible-h:${visible.h}`,
    `--portrait-visible-center-x:${visible.x+visible.w/2}`,
    `--portrait-visible-center-y:${visible.y+visible.h/2}`,
    '--portrait-frame:0',
  ].join(';');
  const fallback=meta?'':` data-portrait-fallback="${html(label)}"`;
  return `<span class="sprite-portrait ${html(boxClass)}"${fallback} role="img" aria-label="${html(label)}"><span class="sprite-portrait-frame ${html(spriteClass)}" data-w="${w}" data-h="${h}" data-d="${durations.join(',')}" data-portrait="${html(dex)}" data-portrait-animated="${animated?'true':'false'}" style="${html(style)}"></span></span>`;
}

/** Set the shared CSS frame variable; static HUD portraits stay on frame zero. */
export function tickPortraits(nowMs:number,animated:boolean):void {
  if(typeof document==='undefined')return;
  document.querySelectorAll<HTMLElement>('.sprite-portrait-frame[data-portrait]').forEach(el=>{
    const durations=(el.dataset.d??'').split(',').map(Number);
    const frame=portraitFrameIndex(nowMs,durations,animated&&el.dataset.portraitAnimated==='true');
    if(el.dataset.frameIndex!==String(frame)){
      el.style.setProperty('--portrait-frame',String(frame));
      el.dataset.frameIndex=String(frame);
    }
  });
}
