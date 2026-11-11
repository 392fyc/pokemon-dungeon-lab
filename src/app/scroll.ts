/** Delegate wheel input so horizontal panes keep working after a redraw. */
export function scrollHorizontalWithWheel(event:WheelEvent):void {
  if(event.defaultPrevented||!event.cancelable||event.ctrlKey||event.shiftKey||Math.abs(event.deltaX)>=Math.abs(event.deltaY))return;

  for(let el=event.target instanceof Element?event.target:null;el;el=el.parentElement){
    if(!(el instanceof HTMLElement))continue;
    const {overflowX,overflowY,lineHeight}=getComputedStyle(el);
    if((overflowY==='auto'||overflowY==='scroll')&&el.scrollHeight>el.clientHeight)return;
    if((overflowX!=='auto'&&overflowX!=='scroll')||el.scrollWidth<=el.clientWidth)continue;

    const scale=event.deltaMode===WheelEvent.DOM_DELTA_LINE?Number.parseFloat(lineHeight)||16
      :event.deltaMode===WheelEvent.DOM_DELTA_PAGE?el.clientWidth:1;
    const before=el.scrollLeft;
    el.scrollLeft+=event.deltaY*scale;
    if(el.scrollLeft!==before)event.preventDefault();
    return;
  }
}
