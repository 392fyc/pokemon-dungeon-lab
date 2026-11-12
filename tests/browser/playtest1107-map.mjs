/* Playtest round 12: the small map and the big map (key M).
 *  - Nothing unrevealed is drawn: every cell of the small and the big map is in the remembered set (checked cell by cell against `seen` and `seenWalls`).
 *  - Stairs get an icon only once revealed. Exit marks sit exactly on known ground that touches unknown cells.
 *  - The room counter is "rooms entered" (an icon and a number, no total: the total would show how many rooms are still hidden, G4.4).
 *  - M opens and closes the big map, the round does not advance and input is locked while it is open; Esc closes; it fits at 800 wide.
 *  - The map is not redrawn when nothing was revealed and nothing moved.
 *  TRIAL_URL=<server> node tests/browser/playtest1107-map.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const ready=p=>p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());
async function dungeon(size={width:1280,height:720}){
 const ctx=await b.newContext({viewport:size});await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();await ready(p);await p.waitForTimeout(500);
 await p.evaluate(()=>{const s=window.trial.store.world;for(const id of s.enemies)s.units[id].waitOnly=true;});
 return {ctx,p};
}
/** What a map picture shows, read from the DOM: cells by layer. */
const read=(p,root)=>p.evaluate(sel=>{
 const svg=document.querySelector(sel);const cell=e=>Math.floor(+e.getAttribute('x'))+','+Math.floor(+e.getAttribute('y'));
 const mid=e=>Math.floor(+e.getAttribute('cx'))+','+Math.floor(+e.getAttribute('cy'));
 const stairs=[...svg.querySelectorAll('.hud-map-stairs')].map(g=>{const m=/translate\(([\d.]+) ([\d.]+)\)/.exec(g.getAttribute('transform'));return {kind:g.classList.contains('is-down')?'down':'up',cell:Math.floor(+m[1])+','+Math.floor(+m[2])};});
 return {floor:[...svg.querySelectorAll('.hud-map-floor')].map(cell),wall:[...svg.querySelectorAll('.hud-map-wall')].map(cell),
  exits:[...svg.querySelectorAll('.hud-map-exit')].map(mid),stairs,points:[...svg.querySelectorAll('.hud-map-point')].map(e=>e.getAttribute('class')),
  units:[...svg.querySelectorAll('.hud-map-unit')].map(e=>({cell:mid(e),leader:e.classList.contains('is-leader'),enemy:e.classList.contains('is-enemy')}))};
},root);
/** The same facts computed independently from the game state. */
const expected=p=>p.evaluate(()=>{
 const s=window.trial.store.world,k=(x,y)=>x+','+y,seen=new Set(s.seen),walls=new Set(s.seenWalls??[]);
 const floorSet=new Set(s.floor.map(f=>k(f.x,f.y)));
 const exits=s.floor.filter(f=>seen.has(k(f.x,f.y))).filter(f=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>{const x=f.x+dx,y=f.y+dy;return x>=0&&y>=0&&x<s.dungeon.width&&y<s.dungeon.height&&!seen.has(k(x,y))&&!walls.has(k(x,y));})).map(f=>k(f.x,f.y));
 const rooms=s.rooms.filter(r=>{const cells=s.floor.filter(f=>f.x>=r.x&&f.x<r.x+r.w&&f.y>=r.y&&f.y<r.y+r.h);return cells.length>0&&cells.every(f=>seen.has(k(f.x,f.y)));}).length;
 return {seen:[...seen],walls:[...walls],floorSet:[...floorSet],exits,rooms,roomsTotal:s.rooms.length,round:s.round,leader:s.leader,leaderPos:{...s.units[s.leader].pos},mapRevealed:!!s.mapRevealed};
});
const sorted=a=>[...a].sort();
const checkNoLeak=async(p,sel,label)=>{
 const m=await read(p,sel),e=await expected(p);
 assert.deepEqual(sorted(m.floor),sorted(e.seen.filter(c=>e.floorSet.includes(c))),label+': floor cells drawn are exactly the revealed floor');
 assert.deepEqual(sorted(m.wall),sorted(e.walls),label+': wall cells drawn are exactly the revealed walls');
 const known=new Set([...e.seen,...e.walls]);
 for(const c of [...m.floor,...m.wall,...m.exits])assert.ok(known.has(c),label+': '+c+' is drawn but not revealed');
 assert.deepEqual(sorted(m.exits),sorted(e.exits),label+': exit marks are exactly the known floor cells that touch unknown cells');
 return {m,e};
};
const roomsText=p=>p.locator('#hud-map .hud-minimap-rooms b').innerText().then(Number);
const turnKey=async(p,key)=>{const r=await p.evaluate(()=>window.trial.getState().round);await p.keyboard.press(key);await p.waitForFunction(r=>window.trial.getState().round>r&&window.trial.store.status==='ready',r,{timeout:6000});};

// ---- 1280x720: content, no leak, stairs, exits, room counter
{
 const {ctx,p}=await dungeon();
 const first=await checkNoLeak(p,'#hud-map .hud-minimap-map','small map at the start');
 assert.ok(first.m.exits.length>0,'the starting room has at least one way out marked');
 assert.equal(first.m.stairs.length,0,'no stairs icon before the stairs are revealed');
 assert.equal((await p.evaluate(()=>window.trial.store.world.points.filter(q=>q.kind==='down').length)),1,'the floor has a down staircase');
 assert.equal(first.m.units.filter(u=>u.leader).length,1,'exactly one party dot is the leader');
 assert.equal(first.m.units.filter(u=>!u.enemy).length,(await p.evaluate(()=>window.trial.store.world.queue.filter(id=>window.trial.store.world.units[id].hp>0).length)),'every living member has a dot');
 const rooms0=await roomsText(p);assert.equal(rooms0,first.e.rooms,'the counter equals rooms entered');assert.equal(rooms0,1,'only the arrival room is entered at the start');
 assert.ok(!/\//.test(await p.locator('#hud-map .hud-minimap-heading').innerText()),'the heading shows no total');
 assert.equal(await p.locator('#hud-map .hud-minimap-rooms .hud-room-icon').count(),1,'the counter is an icon and a number');
 await p.locator('#hud-map').screenshot({path:out+'r12-minimap-start.png'});

 // another room: move the leader into it (revealed as the game does) -> counter 2, stairs still hidden
 const other=await p.evaluate(()=>{const s=window.trial.store.world;const r=s.rooms.find((room,i)=>!s.floor.some(f=>false)&&!(s.units[s.leader].pos.x>=room.x&&s.units[s.leader].pos.x<room.x+room.w&&s.units[s.leader].pos.y>=room.y&&s.units[s.leader].pos.y<room.y+room.h)&&!s.points.some(q=>q.kind==='down'&&q.pos.x>=room.x&&q.pos.x<room.x+room.w&&q.pos.y>=room.y&&q.pos.y<room.y+room.h));
  const cell=s.floor.find(f=>f.x>=r.x&&f.x<r.x+r.w&&f.y>=r.y&&f.y<r.y+r.h&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===f.x&&u.pos.y===f.y));
  s.units[s.leader].pos=cell;window.trial.reveal(s);window.dispatchEvent(new Event('blur'));window.trial.repaint(s);return cell;});
 await p.waitForTimeout(300);
 const second=await checkNoLeak(p,'#hud-map .hud-minimap-map','small map after entering a second room');
 assert.equal(await roomsText(p),2);assert.equal(second.e.rooms,2);
 assert.equal(second.m.stairs.length,0,'still no stairs icon');
 await p.locator('#hud-map').screenshot({path:out+'r12-minimap-rooms.png'});

 // a corridor: exit marks follow the known set while exploring
 const corridor=await p.evaluate(()=>{const s=window.trial.store.world,inRoom=q=>s.rooms.some(r=>q.x>=r.x&&q.x<r.x+r.w&&q.y>=r.y&&q.y<r.y+r.h);
  const c=s.floor.find(f=>!inRoom(f)&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===f.x&&u.pos.y===f.y));s.units[s.leader].pos=c;window.trial.reveal(s);window.dispatchEvent(new Event('blur'));window.trial.repaint(s);return c;});
 await p.waitForTimeout(300);
 const third=await checkNoLeak(p,'#hud-map .hud-minimap-map','small map in a corridor');
 assert.ok(third.m.exits.length>=1,'marks remain on known ground that touches the fog');
 // the exit mark disappears once its fog neighbour is revealed: walk the leader onto a marked cell and look again
 const mark=third.m.exits[0];const [mx,my]=mark.split(',').map(Number);
 await p.evaluate(({mx,my})=>{const s=window.trial.store.world;if(!Object.values(s.units).some(u=>u.pos&&u.pos.x===mx&&u.pos.y===my)){s.units[s.leader].pos={x:mx,y:my};}window.trial.reveal(s);window.dispatchEvent(new Event('blur'));window.trial.repaint(s);},{mx,my});
 await p.waitForTimeout(300);
 const fourth=await checkNoLeak(p,'#hud-map .hud-minimap-map','small map after stepping onto a mark');
 assert.ok(!fourth.m.exits.includes(mark),'standing on the marked cell reveals its neighbours, so the mark is gone');

 // stairs: reveal the staircase and its icon appears at the right cell
 const stairs=await p.evaluate(()=>{const s=window.trial.store.world,st=s.points.find(q=>q.kind==='down');for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const x=st.pos.x+dx,y=st.pos.y+dy,key=x+','+y;if(s.floor.some(f=>f.x===x&&f.y===y)&&!s.seen.includes(key))s.seen.push(key);}
  window.dispatchEvent(new Event('blur'));window.trial.repaint(s);return st.pos;});
 await p.waitForTimeout(300);
 const fifth=await checkNoLeak(p,'#hud-map .hud-minimap-map','small map with the stairs revealed');
 assert.deepEqual(fifth.m.stairs,[{kind:'down',cell:stairs.x+','+stairs.y}],'the down stairs icon sits on the staircase cell');
 await p.locator('#hud-map').screenshot({path:out+'r12-minimap-stairs.png'});
 await p.screenshot({path:out+'r12-minimap-exits.png'});

 // the Luminous Orb: terrain only; no exit marks (nothing unknown left), still no unseen enemies
 await p.evaluate(()=>{const s=window.trial.store.world;s.mapRevealed=true;window.dispatchEvent(new Event('blur'));window.trial.repaint(s);});
 await p.waitForTimeout(300);
 const orb=await read(p,'#hud-map .hud-minimap-map');assert.equal(orb.exits.length,0,'after an orb the whole floor is known: no exit marks');
 await p.evaluate(()=>{const s=window.trial.store.world;delete s.mapRevealed;window.dispatchEvent(new Event('blur'));window.trial.repaint(s);});
 assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- M: open, locked, close; the big map shows the same layers
{
 const {ctx,p}=await dungeon();
 const before=await expected(p);
 assert.equal(await p.locator('#map-dialog[open]').count(),0);
 await p.keyboard.press('m');await p.locator('#map-dialog[open]').waitFor();
 const big=await checkNoLeak(p,'#map-dialog .hud-minimap-map','big map');
 const small=await read(p,'#hud-map .hud-minimap-map');
 assert.deepEqual({...big.m},{...small},'the big map draws exactly the layers of the small map');
 assert.equal(await p.locator('#map-dialog .hud-minimap-rooms b').innerText(),String(before.rooms),'the big map shows the same room counter');
 await p.waitForTimeout(200);await p.screenshot({path:out+'r12-bigmap.png'});
 // input is locked: movement keys and clicks do nothing, the round stays
 for(const key of ['d','w','a','s','f','.','b','Tab'])await p.keyboard.press(key);
 const during=await expected(p);
 assert.equal(during.round,before.round,'the round does not advance while the big map is open');
 assert.deepEqual(during.leaderPos,before.leaderPos,'the leader does not move');assert.equal(during.leader,before.leader);
 assert.equal(await p.locator('#hud-bag:not([hidden])').count(),0,'B does nothing while the map is open');
 await p.keyboard.press('h');assert.equal(await p.locator('#wiki-dialog[open]').count(),0,'H does nothing while the map is open');
 await p.keyboard.press('m');await p.waitForFunction(()=>!document.querySelector('#map-dialog[open]'));
 // after closing, input works again
 await turnKey(p,'.');assert.equal((await expected(p)).round,before.round+1,'after closing, a turn advances normally');
 // Esc closes too
 await p.keyboard.press('m');await p.locator('#map-dialog[open]').waitFor();await p.keyboard.press('Escape');
 assert.equal(await p.locator('#map-dialog[open]').count(),0,'Esc closes the map');
 // the close button
 await p.keyboard.press('m');await p.locator('#map-dialog[open]').waitFor();await p.locator('#map-close').click();assert.equal(await p.locator('#map-dialog[open]').count(),0);
 // M does nothing while another window is open (settings)
 await p.locator('#hud-settings').click();await p.locator('#settings[open]').waitFor();await p.keyboard.press('m');
 assert.equal(await p.locator('#map-dialog[open]').count(),0,'M does nothing while the settings window is open');
 await p.locator('#settings-tab-keys').click();assert.ok((await p.locator('#settings-pane-keys').innerText()).includes('地图'),'the key page lists M');
 assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- 800 wide: the small map and the big map are usable
{
 const size={width:800,height:600};const {ctx,p}=await dungeon(size);
 const box=await p.locator('#hud-map').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=size.width+1&&box.height>40,'the small map fits at 800 wide: '+JSON.stringify(box));
 assert.ok(await p.evaluate(()=>{const h=document.querySelector('#hud-map .hud-minimap-heading');return h.scrollWidth<=h.clientWidth+1;}),'the heading (floor, rooms, round) does not overflow at 800 wide');
 await p.locator('#hud-map').screenshot({path:out+'r12-minimap-800.png'});
 await p.keyboard.press('m');await p.locator('#map-dialog[open]').waitFor();await p.waitForTimeout(200);
 const d=await p.locator('#map-dialog').boundingBox(),svg=await p.locator('#map-dialog .hud-minimap-map').boundingBox();
 assert.ok(d.x>=0&&d.y>=0&&d.x+d.width<=size.width+1&&d.y+d.height<=size.height+1,'the big map window fits 800x600: '+JSON.stringify(d));
 assert.ok(svg.width>=400&&svg.height>=250,'the big map is large enough to read at 800 wide: '+JSON.stringify(svg));
 await p.screenshot({path:out+'r12-bigmap-800.png'});
 await p.keyboard.press('Escape');assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- performance: a call with nothing new draws nothing; real turns cost little
{
 const {ctx,p}=await dungeon();
 await p.evaluate(()=>window.trial.render());
 const idle=await p.evaluate(()=>{const st=window.trial.minimapStats,a={...st};for(let i=0;i<20;i++)window.trial.render();return {terrain:st.terrainDraws-a.terrainDraws,dynamic:st.dynamicDraws-a.dynamicDraws,calls:st.calls-a.calls};});
 assert.equal(idle.calls,20);assert.equal(idle.terrain,0,'no terrain redraw when nothing was revealed');assert.equal(idle.dynamic,0,'no redraw when nothing moved');
 await turnKey(p,'.');
 const waited=await p.evaluate(()=>({...window.trial.minimapStats}));
 // a few real moving turns: collect the cost of each redraw
 const costs=[];
 for(const key of ['d','a','d','a','s','w']){const before=await p.evaluate(()=>window.trial.minimapStats.dynamicDraws);const round=await p.evaluate(()=>window.trial.getState().round);await p.keyboard.press(key);
  await p.waitForFunction(r=>window.trial.getState().round>r&&window.trial.store.status==='ready',round,{timeout:6000}).catch(()=>{});
  const st=await p.evaluate(()=>({...window.trial.minimapStats}));costs.push({draws:st.dynamicDraws-before,ms:st.lastMs});}
 console.log('minimap redraw cost per turn (ms):',costs.map(c=>c.ms.toFixed(2)).join(' '),'| terrain draws',waited.terrainDraws,'| max ms',(await p.evaluate(()=>window.trial.minimapStats.maxMs)).toFixed(2));
 assert.ok(costs.every(c=>c.ms<16),'each redraw stays under one 60 fps frame (16 ms): '+JSON.stringify(costs));
 assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- review F1: with animation on, the big map opens during a round's animation and its x button (and Esc) still work
{
 const ctx=await b.newContext({viewport:{width:1280,height:720}});await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7&anim=on');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();await ready(p);await p.waitForTimeout(500);
 await p.evaluate(()=>{const s=window.trial.store.world;for(const id of s.enemies)s.units[id].waitOnly=true;});
 assert.equal(await p.evaluate(()=>window.trial.animationEnabled()),true,'animations are on in this page');
 let proven=0;
 for(const how of ['x','esc']){
  let done=false;
  for(let attempt=0;attempt<8&&!done;attempt++){
   const key=['d','a','s','w','d','a','s','w'][attempt];
   await p.keyboard.press(key);
   const playing=await p.waitForFunction(()=>window.trial.animating(),null,{timeout:1500,polling:'raf'}).then(()=>true,()=>false);
   if(!playing){await p.waitForFunction(()=>!window.trial.animating()&&window.trial.store.status==='ready');continue;}
   await p.keyboard.press('m');
   const open=await p.locator('#map-dialog[open]').count();
   const stillPlaying=await p.evaluate(()=>window.trial.animating());
   if(!open){await p.waitForFunction(()=>!window.trial.animating());continue;}
   if(!stillPlaying){await p.keyboard.press('Escape');await p.waitForFunction(()=>!window.trial.animating());continue;}
   if(how==='x')await p.locator('#map-close').click({timeout:2000});else await p.keyboard.press('Escape');
   assert.equal(await p.locator('#map-dialog[open]').count(),0,'the big map closes with '+(how==='x'?'its x button':'Esc')+' while the animation plays');
   done=true;proven++;
   await p.waitForFunction(()=>!window.trial.animating()&&window.trial.store.status==='ready',null,{timeout:8000});
  }
  assert.ok(done,'managed to open and close the big map during an animation ('+how+')');
 }
 assert.equal(proven,2);
 assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- review F3: M does not open over the panels that are not dialogs (stairs question, bag, invitation)
{
 const {ctx,p}=await dungeon();
 const mOpens=async()=>{await p.keyboard.press('m');await p.waitForTimeout(150);const n=await p.locator('#map-dialog[open]').count();if(n)await p.keyboard.press('Escape');return n===1;};
 const info=await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader],st=s.points.find(q=>q.kind==='down');
  for(const id of s.queue)if(id!==s.leader)s.units[id].pos=null;L.pos=st.pos;window.dispatchEvent(new Event('blur'));window.trial.repaint(s);return st.pos;});
 await p.waitForSelector('#stairs-prompt',{timeout:4000});
 assert.equal(await mOpens(),false,'M does nothing while the stairs question is showing');
 const roundAtPrompt=await p.evaluate(()=>window.trial.getState().round);
 await p.locator('#stairs-stay').click();assert.equal(await p.locator('#stairs-prompt').count(),0);
 assert.equal(await mOpens(),true,'after the stairs question is dismissed the map opens again');
 assert.equal(await p.evaluate(()=>window.trial.getState().round),roundAtPrompt);
 await p.evaluate(({pos})=>{const s=window.trial.store.world;const c=s.floor.find(f=>Math.max(Math.abs(f.x-pos.x),Math.abs(f.y-pos.y))===1);s.units[s.leader].pos=c;window.dispatchEvent(new Event('blur'));window.trial.repaint(s);},{pos:info});await p.waitForTimeout(300);
 await p.keyboard.press('b');await p.locator('#hud-bag:not([hidden])').waitFor();
 assert.equal(await mOpens(),false,'M does nothing while the bag is open');
 await p.keyboard.press('Escape');await p.waitForTimeout(150);
 assert.equal(await mOpens(),true,'with the bag closed M works');
 assert.deepEqual(p.errs,[]);await ctx.close();
}
{
 const ctx=await b.newContext({viewport:{width:1280,height:720}});await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();await ready(p);
 const found=await p.evaluate(()=>{const s=window.trial.store.world;const e=s.units.w1a;const k=(x,y)=>x+','+y;
  const adj=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if((dx||dy)&&s.floor.some(f=>f.x===x&&f.y===y)&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===x&&u.pos.y===y))adj.push({x,y});}
  for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if(s.floor.some(f=>f.x===x&&f.y===y)&&!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}
  s.units[s.leader].pos=adj[0];e.hp=1;e.asleep=false;
  let found=null;for(let r=1;r<400&&found===null;r++){const t=structuredClone(s);t.prog.rng=r;const res=window.trial.applyCommand(t,{type:'round',action:{type:'basic',target:'w1a'}});if(res.ok&&res.state.phase==='invitation')found=r;}
  if(found!==null)s.prog.rng=found;window.dispatchEvent(new Event('blur'));window.trial.repaint(s);return found;});
 assert.notEqual(found,null,'the scenario can reach an invitation');await p.waitForTimeout(400);
 {const pt=await p.evaluate(()=>{const v=window.trial.view().units.w1a,c=window.trial.camera();return {x:v.x-c.x,y:v.y-c.y-20};});await p.mouse.move(pt.x,pt.y);await p.waitForTimeout(150);await p.mouse.move(pt.x+1,pt.y);await p.waitForTimeout(150);await p.mouse.click(pt.x+1,pt.y);}
 await p.waitForFunction(()=>window.trial.getState().phase==='invitation'&&!document.getElementById('flow').hidden,null,{timeout:6000});
 await p.keyboard.press('m');await p.waitForTimeout(200);
 assert.equal(await p.locator('#map-dialog[open]').count(),0,'M does nothing while the invitation panel is showing');
 assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- D-20261112-01: shortcut labels live in settings at both viewports
{
 for(const [size,name] of [[{width:1280,height:720},'1280'],[{width:800,height:600},'800']]){
  const {ctx,p}=await dungeon(size);
  assert.equal(await p.locator('#shortcut-card').count(),0,'no shortcut instructions on the map at '+name);
  await p.locator('#hud-settings').click();await p.locator('#settings[open]').waitFor();await p.locator('#settings-tab-keys').click();
  const text=await p.locator('#settings-pane-keys').innerText();
  for(const w of ['日志','百科','地图','背包','等待'])assert.ok(text.includes(w),'settings key page says '+w);
  const caps=(await p.locator('#settings-pane-keys .key-caps').allInnerTexts()).join(' ').split(/\s+/);
  for(const k of ['L','H','M','B','Tab','F'])assert.ok(caps.includes(k),'settings key page lists the key '+k+': '+caps.join(' '));
  await p.keyboard.press('Escape');await p.waitForTimeout(150);
  await p.screenshot({path:out+'r12-shortcuts-'+name+'.png'});
  assert.deepEqual(p.errs,[]);await ctx.close();
 }
}
await b.close();console.log('map checks passed');
