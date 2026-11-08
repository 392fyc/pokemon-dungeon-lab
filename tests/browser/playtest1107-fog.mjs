/* Round 9: the fog is one even darkness with soft geometric holes. Measured on the real mask the game draws (window.trial.maskAlpha, cell units).
 *  - Outside every light (explored or not) neighbouring cells never differ: the largest step between two adjacent cell centres is under 0.01.
 *    A cell-patch fog would step by 0.15 to 0.3 here (the old explored 0.58 against unexplored 0.74), so 0.01 cleanly separates the two.
 *  - Across the edge of a light the alpha moves in steps of at most half of the full darkness per sixth of a cell: soft, not a cell edge.
 *  - A room is lit as one whole shape, and its fade is the same level on every cell of the room. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE??'playwright');
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const ctx=await b.newContext({viewport:{width:1280,height:720}});
await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(base+'/?dev=1&seed=7');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());
// walk the leader down a corridor by state, revealing as it goes, so there is explored ground behind it
const info=await p.evaluate(async()=>{
 const e={reveal:window.trial.reveal};const s=window.trial.store.world;for(const id of s.enemies)s.units[id].waitOnly=true;
 const inRoom=q=>s.rooms.find(r=>q.x>=r.x&&q.x<r.x+r.w&&q.y>=r.y&&q.y<r.y+r.h);
 const corr=new Map(s.floor.filter(f=>!inRoom(f)).map(f=>[f.x+','+f.y,f]));let door=null;
 for(const c of corr.values()){for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){const n={x:c.x+d[0],y:c.y+d[1]};if(s.floor.some(f=>f.x===n.x&&f.y===n.y)&&inRoom(n)){door={c,n};break;}}if(door)break;}
 const prev=new Map([[door.c.x+','+door.c.y,null]]),depth=new Map([[door.c.x+','+door.c.y,0]]),q=[door.c];let last=door.c;
 while(q.length){const c=q.shift();for(const d of [[1,0],[-1,0],[0,1],[0,-1]]){const n=corr.get((c.x+d[0])+','+(c.y+d[1]));if(!n)continue;const k=n.x+','+n.y;if(prev.has(k))continue;prev.set(k,c);depth.set(k,depth.get(c.x+','+c.y)+1);q.push(n);if(depth.get(k)>depth.get(last.x+','+last.y))last=n;if(depth.get(k)>=6){q.length=0;break;}}}
 const path=[];for(let c=last;c;c=prev.get(c.x+','+c.y))path.unshift(c);
 for(const id of s.queue)if(id!==s.leader){s.units[id].pos=null;s.units[id].hp=0;}
 s.units[s.leader].pos=door.n;e.reveal(s);for(const c of path){s.units[s.leader].pos=c;e.reveal(s);}
 window.dispatchEvent(new Event('blur'));window.trial.repaint(s);
 return {door,room:inRoom(door.n),pos:last,w:s.dungeon.width,h:s.dungeon.height};});
await p.waitForTimeout(400);
const view=await p.evaluate(()=>window.trial.view().darkness);
assert.equal(view.lights.length,1,'one living party member, one circle');
const L=view.lights[0],lx=L.centerX,ly=L.centerY;
// 1. far from the light and outside every lit room: one even darkness, explored or not
// (the local glow of revealed stairs is a separate, intended light: cells within 2.2 cells of a staircase are left out)
const far=await p.evaluate(({lx,ly,w,h})=>{const glows=window.trial.store.world.points.filter(q=>q.kind==='down'||q.kind==='up').map(q=>q.pos),grid=[];for(let y=0;y<h;y++){const row=[];for(let x=0;x<w;x++){const cx=x+.5,cy=y+.5;row.push(Math.hypot(cx-lx,cy-ly)>3.6&&glows.every(g=>Math.hypot(cx-g.x-.5,cy-g.y-.5)>2.2)?window.trial.maskAlpha(cx,cy):null);}grid.push(row);}return grid;},{lx,ly,w:info.w,h:info.h});
let samples=0,maxStep=0,value=null;
for(let y=0;y<far.length;y++)for(let x=0;x<far[y].length;x++){const v=far[y][x];if(v===null)continue;samples++;value??=v;assert.ok(Math.abs(v-value)<.01,`cell ${x},${y} carries the one darkness (${v} vs ${value})`);
 for(const [dx,dy] of [[1,0],[0,1]]){const u=far[y+dy]?.[x+dx];if(u!=null)maxStep=Math.max(maxStep,Math.abs(u-v));}}
assert.ok(samples>400,'a large out-of-sight area was sampled: '+samples);assert.ok(maxStep<.01,'adjacent cells outside the light differ by at most '+maxStep);
assert.ok(value>=.7&&value<=.9,'the one darkness is the research value '+value);
// 2. the edge of the circle: fine steps along a radius, monotone, soft
const radius=await p.evaluate(({lx,ly})=>{const v=[];for(let i=0;i<=30;i++)v.push(window.trial.maskAlpha(lx+i/6,ly+.0));return v;},{lx,ly:ly+.4});
let step=0;for(let i=1;i<radius.length;i++)step=Math.max(step,Math.abs(radius[i]-radius[i-1]));
assert.ok(step<=value*.5,`the light edge is soft: largest step per sixth of a cell ${step.toFixed(3)} of ${value.toFixed(3)}`);assert.ok(radius[0]<.01&&radius.at(-1)>value-.01,'lit at the centre, the even darkness at 5 cells');
// 3. a room is one shape: stand in the room, every cell of the room (and its ring) is lit alike, the outside is dark
await p.evaluate(async({n})=>{const e={reveal:window.trial.reveal};const s=window.trial.store.world;s.units[s.leader].pos=n;e.reveal(s);window.dispatchEvent(new Event('blur'));window.trial.repaint(s);},{n:info.door.n});
await p.waitForTimeout(400);
const room=info.room,cells=await p.evaluate(({room})=>{const v=[];for(let y=room.y-1;y<=room.y+room.h;y++)for(let x=room.x-1;x<=room.x+room.w;x++){const dx=Math.min(x-(room.x-1),room.x+room.w-x),dy=Math.min(y-(room.y-1),room.y+room.h-y);if(dx===0&&dy===0)continue;v.push([x,y,window.trial.maskAlpha(x+.5,y+.5)]);}return v;},{room});
for(const [x,y,a] of cells)assert.ok(a<.2,`room or ring cell ${x},${y} is lit (alpha ${a.toFixed(3)})`);
const mid=cells.filter(([x,y])=>x>=room.x&&x<room.x+room.w&&y>=room.y&&y<room.y+room.h);for(const [x,y,a] of mid)assert.ok(a<.01,`room cell ${x},${y} is fully lit`);
const outside=await p.evaluate(({room})=>window.trial.maskAlpha(room.x+room.w+3.5,room.y+room.h+3.5),{room});assert.ok(outside>value-.01||outside>.69,'a cell well outside the room stays dark: '+outside);
await p.screenshot({path:out+'r9-fog-room-check.png'});
assert.deepEqual(errs,[]);await b.close();console.log('fog checks passed',JSON.stringify({samples,maxStep,step:+step.toFixed(3),value:+value.toFixed(3)}));
