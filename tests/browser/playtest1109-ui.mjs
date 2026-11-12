/* Round 14 through the real page: one scrollbar style everywhere, bag drag does not dim the screen, the target hint floats (party cards do not move),
   stage badges and the details page explain stages, move cards state engine effects, and a companion who takes over after the leader fell opens rooms
   (animations on) and can be switched to with Tab.   TRIAL_URL=<server> node tests/browser/playtest1109-ui.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});

// ---- static: the only scrollbar declarations live in src/render/scrollbar.css
{
 const dir=new URL('../../src/',import.meta.url);
 const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(new URL(e.name+'/',d)):[new URL(e.name,d)]);
 const offenders=walk(dir).filter(u=>u.pathname.endsWith('.css')&&!u.pathname.endsWith('scrollbar.css')&&/scrollbar/.test(fs.readFileSync(u,'utf8'))).map(u=>u.pathname);
 assert.deepEqual(offenders,[],'no other CSS file declares a scrollbar');
}
async function open(size={width:1280,height:720},anim=false,seed=7){
 const ctx=await b.newContext({viewport:size});
 await ctx.addInitScript(a=>{window.__trialNoAutoSleep=true;if(!a)window.__trialNoAnim=true;},anim);
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed='+seed);await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());
 return {ctx,p};
}
/** Every element that can scroll (overflow auto or scroll, in either direction) and its ::-webkit-scrollbar width. */
const scrollers=p=>p.evaluate(()=>[...document.querySelectorAll('*')].filter(el=>{const c=getComputedStyle(el);return /auto|scroll/.test(c.overflowX+' '+c.overflowY)&&el.getBoundingClientRect().width>0;}).map(el=>({tag:el.tagName+(el.id?'#'+el.id:'')+(el.className&&typeof el.className==='string'?'.'+el.className.split(' ')[0]:''),w:getComputedStyle(el,'::-webkit-scrollbar').width,thumb:getComputedStyle(el,'::-webkit-scrollbar-thumb').borderRadius})));
// ---- scrollbars, drag, target hint, stages, move text, in one dungeon
{
 const {ctx,p}=await open();
 await p.evaluate(()=>{const s=window.trial.store.world;for(const id of s.enemies)s.units[id].waitOnly=true;Object.assign(s.prog.items,{berry:5,tonic:2,bigBerry:1});
  for(let i=0;i<80;i++)(s.log.push('测试日志行 '+i),(s.entries??=[]).push({n:(s.logSeq=(s.logSeq??0)+1),parts:['测试日志行 '+i]}));window.dispatchEvent(new Event('blur'));});
 const seen=new Set();
 const check=async name=>{const list=await scrollers(p);for(const e of list){seen.add(e.tag);assert.equal(e.w,'10px','('+name+') '+e.tag+' uses the shared scrollbar: '+e.w);assert.equal(e.thumb,'6px','('+name+') '+e.tag+' thumb is the shared rounded one');}};
 await check('dungeon');
 await p.keyboard.press('l');await p.locator('#log-dialog[open]').waitFor();await check('log');await p.screenshot({path:out+'r14-scroll-log.png'});await p.keyboard.press('Escape');
 await p.keyboard.press('h');await p.locator('#wiki-dialog[open]').waitFor();await check('wiki');await p.screenshot({path:out+'r14-scroll-wiki.png'});
 assert.equal(await p.locator('[data-wiki-cat="controls"]').count(),0,'the wiki has no controls category (the keys are in the settings window)');await p.keyboard.press('Escape');
 await p.locator('#bag-open').click();await p.waitForSelector('.c195-bag');await check('bag');
 // item 8: dragging from the bag does not dim the screen
 {const from=await p.locator('[data-bag-item="berry"]').first().boundingBox(),to=await p.locator('[data-bag-slot="3"]').first().boundingBox();
  await p.mouse.move(from.x+from.width/2,from.y+from.height/2);await p.mouse.down();await p.mouse.move(from.x+from.width/2+14,from.y+from.height/2+10,{steps:3});await p.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:8});
  assert.equal(await p.evaluate(()=>document.body.classList.contains('is-dragging')),true,'a drag is in progress');
  const o=await p.evaluate(()=>({body:getComputedStyle(document.body).opacity,html:getComputedStyle(document.documentElement).opacity,source:getComputedStyle(document.querySelector('[data-bag-item="berry"]')).opacity}));
  assert.equal(o.body,'1','the page keeps full brightness while dragging');assert.equal(o.html,'1');assert.ok(Number(o.source)<1,'only the dragged item dims: '+o.source);
  await p.screenshot({path:out+'r14-drag-no-dim.png'});await p.mouse.up();await p.waitForTimeout(250);}
 // item 9: the target hint floats; the party cards stay put
 const rects=()=>p.evaluate(()=>[...document.querySelectorAll('#party .hud-party-card')].map(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(Math.round);}));
 await p.keyboard.press('Escape');await p.waitForTimeout(150);
 if(await p.locator('.c195-bag').count()&&await p.locator('.c195-bag').isVisible()){await p.keyboard.press('Escape');await p.waitForTimeout(150);}
 await p.evaluate(()=>{const s=window.trial.store.world;for(const id of s.queue)s.units[id].hp=Math.min(s.units[id].hp,5);window.dispatchEvent(new Event('blur'));});
 const before=await rects();
 await p.locator('#bag-open').click();await p.waitForSelector('.c195-bag');
 await p.locator('[data-bag-item="berry"]').click();await p.locator('#bag-use').click();await p.waitForSelector('#target-hint');
 const after=await rects();assert.deepEqual(after,before,'the party cards do not move when the hint appears');
 const hint=await p.locator('#target-hint').boundingBox();assert.ok(hint.x>250&&hint.x+hint.width<1280-200,'the hint floats over the map, clear of the party column and the map card: '+JSON.stringify(hint));
 assert.equal(await p.locator('#party #target-hint').count(),0,'the hint is not inside the party list');
 assert.ok(Math.abs(hint.x+hint.width/2-640)<2,'centred');assert.equal(await p.locator('.hud-target-arrow').count()>0,true,'arrows kept');
 await p.screenshot({path:out+'r14-target-hint.png'});await p.locator('#target-cancel').click();assert.equal(await p.locator('#target-hint').count(),0);assert.deepEqual(await rects(),before);
 // item 7: stage badges and the details block
 await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader];L.stages={atk:8,def:-2,eva:3};window.dispatchEvent(new Event('blur'));});
 const badge=k=>p.locator(`.hud-party-card.is-leader .hud-status-badge[data-stage="${k}"]`);
 assert.match(await badge('atk').getAttribute('title'),/^攻击 \+8：物理招式造成的伤害×1\.\d+，持续到换层。普通攻击按.+$/);
 assert.equal(await badge('eva').getAttribute('title'),'闪避 +3：对方招式的命中率×0.5，持续到换层。与对方命中阶段相抵，差值限于±6；普攻和必中招式不受影响','evasion +3: 3/(3+3), moves only (limit ±6, D-20261110-08)');
 assert.equal(await badge('def').getAttribute('title'),'防御 −2：受到的物理伤害×2，持续到换层。受到的普通攻击按攻击者的类别取防御或特防','defence -2: 256/128');
 await p.locator('.hud-party-card.is-leader [data-hud-details]').click();await p.waitForSelector('#unit-details-dialog[open]');
 const rows=await p.locator('#detail-stages li').allInnerTexts();assert.equal(rows.length,3,'one row per non-zero stage: '+rows);assert.ok(rows.some(r=>/攻击 \+8/.test(r)&&/物理招式造成的伤害×/.test(r)),rows.join('|'));
 const box=await p.locator('#unit-details-dialog').boundingBox(),ul=await p.locator('#detail-stages').boundingBox(),tactics=await p.locator('.detail-tactics').boundingBox();
 assert.ok(ul.y+ul.height<=tactics.y+1&&ul.x>=box.x&&ul.x+ul.width<=box.x+box.width,'the block sits inside the window above the tactics row: '+JSON.stringify({ul,tactics}));
 await check('details');await p.screenshot({path:out+'r14-details-stages.png'});
 await p.locator('#unit-detail-close').click();
 await p.evaluate(()=>{const s=window.trial.store.world;for(const u of Object.values(s.units))u.stages={atk:0,def:0};window.dispatchEvent(new Event('blur'));});
 await p.locator('.hud-party-card.is-leader [data-hud-details]').click();await p.waitForSelector('#unit-details-dialog[open]');
 assert.equal(await p.locator('#detail-stages').count(),0,'no stages, no block');
 const sizeNone=await p.locator('#unit-details-dialog').boundingBox();assert.equal(sizeNone.height,box.height,'the window size does not change');await p.locator('#unit-detail-close').click();
 // moves: the hover card shows the engine text, not the official prose
 const first=p.locator('#hud-bottom [data-hud-skill]').first();await first.hover();await p.locator('#hud-tooltip').waitFor({state:'visible'});
 const desc=p.locator('#hud-tooltip [data-move-description]'),text=await desc.count()?(await desc.innerText()).trim():'';   // D-20261110-09: only effects the card does not show; a pure damage move has none
 assert.ok(!/按攻击对防御结算|命中率|（/.test(text)&&(text===''||/。$/.test(text)),'engine effect text without category, hit-rate or bracket notes: '+text);
 await p.evaluate(()=>{
  const s=window.trial.store.world,leader=s.units[s.leader];
  leader.learned=['snore','reflect'];leader.pp={snore:5,reflect:2};leader.maxPp={...leader.pp};
  window.dispatchEvent(new Event('blur'));
 });
 for(const [move,pattern] of [['snore',/受到对方直接攻击.*不能主动使用/],['reflect',/10回合内受到的物理伤害减半；重复使用刷新计时/]]){
  await p.locator('#hud-bottom [data-hud-skill="'+move+'"]').hover();
  await p.locator('#hud-tooltip').waitFor({state:'visible'});
  const description=await p.locator('#hud-tooltip [data-move-description]').innerText();
  assert.match(description,pattern);assert.doesNotMatch(description,/不造成畏缩/);
  await p.screenshot({path:out+'r8-hover-'+move+'.png'});
 }
 assert.ok(seen.size>=5,'scrollers seen: '+[...seen].join(','));
 assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- item 6: the companion who takes over opens a blessing room (animations on); Tab to a non-successor works too
for(const mode of ['successor','tab']){
 const {ctx,p}=await open({width:1280,height:720},true);
 const info=await p.evaluate(()=>{
  const s=window.trial.store.world;for(const id of s.enemies)s.units[id].waitOnly=true;
  const r=s.adventureRooms?.[0];if(!r)return null;r.type='blessing';r.state='idle';
  const t=r.interaction,floor=new Set(s.floor.map(f=>f.x+','+f.y));
  const free=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[2,0],[-2,0]].map(d=>({x:t.x+d[0],y:t.y+d[1]})).filter(q=>floor.has(q.x+','+q.y));
  const orig=s.leader,[B,C]=s.queue.filter(i=>i!==orig);
  s.units[orig].hp=0;s.units[orig].pos=null;
  s.units[B].pos=free[0];s.units[C].pos=free[1];s.leader=B;
  for(const q of [free[0],free[1],t])if(!s.seen.includes(q.x+','+q.y))s.seen.push(q.x+','+q.y);
  window.trial.reveal(s);window.dispatchEvent(new Event('blur'));window.trial.repaint(s);
  return {target:t,B,C,posB:free[0],posC:free[1]};});
 assert.ok(info,'the seed has an adventure room');await p.waitForTimeout(500);
 const who=mode==='tab'?info.C:info.B,from=mode==='tab'?info.posC:info.posB;
 if(mode==='tab'){await p.keyboard.press('Tab');await p.waitForFunction(c=>window.trial.getState().leader===c,info.C);}
 // put the controlled member next to the room cell by state, then step onto it with a real key press
 await p.evaluate(({who,from,t})=>{const s=window.trial.store.world;s.units[who].pos={...from};window.trial.reveal(s);window.dispatchEvent(new Event('blur'));window.trial.repaint(s);},{who,from,t:info.target});
 await p.waitForTimeout(400);
 const dir=[info.target.x-from.x,info.target.y-from.y];
 assert.ok(Math.abs(dir[0])+Math.abs(dir[1])===1,'the start cell is orthogonally next to the room cell: '+dir);
 await p.keyboard.press(dir[0]===1?'ArrowRight':dir[0]===-1?'ArrowLeft':dir[1]===1?'ArrowDown':'ArrowUp');
 await p.waitForFunction(()=>window.trial.getState().phase==='blessing',null,{timeout:6000}).catch(async()=>{throw Error('the blessing room did not open for '+who+': '+JSON.stringify(await p.evaluate(()=>{const s=window.trial.getState();return {phase:s.phase,leader:s.leader,pos:s.units[s.leader].pos};})));});
 assert.equal(await p.evaluate(()=>window.trial.getState().leader),who);
 await p.screenshot({path:out+'r14-leader-fallen-'+mode+'.png'});assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- review A: click-to-walk stops when a member lost HP during the step, even when a Reviver Seed restored it in the same blow
{
 const ctx=await b.newContext({viewport:{width:1280,height:720}});await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());await p.waitForTimeout(500);
 const lay=await p.evaluate(()=>{
  const s=window.trial.store.world,L=s.units[s.leader],k=(x,y)=>x+','+y,floor=new Set(s.floor.map(f=>k(f.x,f.y)));
  for(const id of s.enemies){s.units[id].waitOnly=true;s.units[id].asleep=true;}
  for(const id of s.queue)if(id!==s.leader)s.units[id].tactic='wait';
  for(let dx=-12;dx<=12;dx++)for(let dy=-12;dy<=12;dy++){const x=L.pos.x+dx,y=L.pos.y+dy;if(floor.has(k(x,y))&&!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}
  const taken=new Set(Object.values(s.units).filter(u=>u.pos&&u.hp>0).map(u=>k(u.pos.x,u.pos.y)));
  let best=null;for(const f of s.floor){let ok=true;for(let i=0;i<=6&&ok;i++)ok=floor.has(k(f.x+i,f.y))&&!taken.has(k(f.x+i,f.y))&&s.seen.includes(k(f.x+i,f.y));if(ok){best=f;break;}}
  if(!best)return null;
  L.pos={x:best.x,y:best.y};L.hp=1;L.status={psn:{tick:1}};s.prog.items.reviverSeed=1;window.dispatchEvent(new Event('blur'));window.trial.repaint(s);
  return {to:{x:best.x+6,y:best.y},round:s.round};});
 assert.ok(lay,'a free row of 7 cells exists');
 const view=await p.evaluate(()=>window.trial.view()),g=view.geometry,v=view.cameraView,camera=await p.evaluate(()=>window.trial.camera()),box=await p.locator('canvas').boundingBox();
 await p.mouse.move(box.x+(g.ox+(lay.to.x-g.minX+.5)*g.cell-camera.x)*box.width/v.width,box.y+(g.oy+(lay.to.y-g.minY+.5)*g.cell-camera.y)*box.height/v.height);await p.waitForTimeout(150);
 await p.mouse.click(box.x+(g.ox+(lay.to.x-g.minX+.5)*g.cell-camera.x)*box.width/v.width,box.y+(g.oy+(lay.to.y-g.minY+.5)*g.cell-camera.y)*box.height/v.height);
 await p.waitForFunction(()=>!window.trial.animating()&&!window.trial.walking(),null,{timeout:15000});await p.waitForTimeout(300);
 const st=await p.evaluate(()=>{const s=window.trial.getState();return {round:s.round,seed:s.prog.items.reviverSeed,hp:s.units[s.leader].hp};});
 assert.equal(st.seed,0,'the Reviver Seed was used by the poison tick (the HP loss happened): '+JSON.stringify(st));
 assert.equal(st.round,lay.round+1,'the walk stopped after the first step: '+JSON.stringify({st,lay}));
 assert.deepEqual(p.errs,[]);await ctx.close();
}
// ---- review P2: a Rollcall Orb slides the called companion (sprite, shadow, HP label) to the new cell while the round plays, not only at its end
{
 const ctx=await b.newContext({viewport:{width:1280,height:720}});await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7&anim=on');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());await p.waitForTimeout(500);
 const lay=await p.evaluate(()=>{
  const s=window.trial.store.world,L=s.units[s.leader],k=(x,y)=>x+','+y,floor=new Set(s.floor.map(f=>k(f.x,f.y)));
  for(const id of s.enemies){s.units[id].waitOnly=true;s.units[id].asleep=true;}
  const mates=s.queue.filter(i=>i!==s.leader),B=mates[0];for(const id of mates)s.units[id].tactic='wait';
  const taken=new Set(Object.values(s.units).filter(u=>u.pos&&u.hp>0&&u.id!==B).map(u=>k(u.pos.x,u.pos.y)));
  let best=null;for(const f of s.floor){let ok=true;for(let i=0;i<=4&&ok;i++)ok=floor.has(k(f.x+i,f.y))&&!taken.has(k(f.x+i,f.y));if(ok){best=f;break;}}
  if(!best)return null;
  for(let i=0;i<=4;i++)if(!s.seen.includes(k(best.x+i,best.y)))s.seen.push(k(best.x+i,best.y));
  for(const id of mates)if(id!==B){s.units[id].hp=0;s.units[id].pos=null;}
  L.pos={x:best.x,y:best.y};s.units[B].pos={x:best.x+4,y:best.y};s.units[B].hp=20;s.units[B].status={psn:{tick:1}};s.prog.items.rollcallOrb=1;
  window.dispatchEvent(new Event('blur'));window.trial.repaint(s);return {B,from:{x:best.x+4,y:best.y}};});
 assert.ok(lay,'a free row of 5 cells exists');await p.waitForTimeout(500);
 const sprite=()=>p.evaluate(id=>{const u=window.trial.view().units[id];return {x:u.x,y:u.y,animating:window.trial.animating()};},lay.B);
 const before=await sprite();
 await p.locator('#bag-open').click();await p.waitForSelector('.c195-bag');await p.locator('[data-bag-item="rollcallOrb"]').click();await p.locator('#bag-use').click();
 const samples=[];for(let i=0;i<40;i++){samples.push(await sprite());await p.waitForTimeout(40);}
 const after=await p.evaluate(id=>{const s=window.trial.getState();return {pos:s.units[id].pos};},lay.B);
 assert.notDeepEqual(after.pos,lay.from,'B was called to another cell');
 const moving=samples.filter(q=>q.animating);
 assert.ok(moving.length>0,'the round was animated');
 const last=samples.at(-1);assert.ok(Math.abs(last.x-before.x)>20,'B ends at the new cell: '+JSON.stringify({before,last}));
 assert.ok(moving.some(q=>Math.abs(q.x-before.x)>20),'while the round still plays, the sprite is already away from the old cell: '+JSON.stringify(moving.slice(0,8)));
 assert.deepEqual(p.errs,[]);await ctx.close();
}
await b.close();console.log('round 14 UI checks passed');
