/* Playtest round 10 #2-#5: move cards (key badge, power, reach icon), HP colours and the damage trail, stage and status floaters on the map, and on-demand sprite loading.
   TRIAL_URL=<server> node tests/browser/playtest1107-r10.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {SPECIES} from '../../src/core/roster.ts';
import {plannedEnemySpecies} from '../../src/core/dungeon.ts';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
async function open(query='&anim=on',size={width:1280,height:720}){
 const ctx=await b.newContext({viewport:size});await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));p.reqs=[];p.on('request',r=>p.reqs.push(r.url()));
 await p.goto(base+'/?dev=1&seed=7'+query);await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());await p.waitForTimeout(800);
 return {ctx,p};
}
/** The leader stands next to the first enemy, the rest of the party is out of the way, and the leader carries `moves`. */
const duel=(p,moves,hp=60)=>p.evaluate(({moves,hp})=>{
 const s=window.trial.store.world,e=s.units.w1a,L=s.units[s.leader],k=(x,y)=>x+','+y;
 const adj=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if((dx||dy)&&s.floor.some(f=>f.x===x&&f.y===y)&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===x&&u.pos.y===y))adj.push({x,y});}
 for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if(s.floor.some(f=>f.x===x&&f.y===y)&&!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}
 L.pos=adj[0];for(const id of s.queue){s.units[id].tactic='wait';if(id!==s.leader)s.units[id].pos=null;}
 e.waitOnly=true;e.asleep=false;L.hp=L.maxHp=hp;if(moves){L.learned=moves;L.pp=Object.fromEntries(moves.map(m=>[m,20]));L.maxPp=Object.fromEntries(moves.map(m=>[m,20]));L.stages.acc=3;}
 window.dispatchEvent(new Event('blur'));window.trial.repaint(s);window.trial.render();return s.leader;
},{moves,hp});
/** A real click on a map cell (the camera follows the leader, so it is measured right before the click). */
async function clickCell(p,pos){
 for(let attempt=0;attempt<4;attempt++){
  const view=await p.evaluate(()=>window.trial.view()),g=view.geometry,v=view.cameraView,camera=await p.evaluate(()=>window.trial.camera()),box=await p.locator('canvas').boundingBox();
  const x=(g.ox+(pos.x-g.minX+.5)*g.cell-camera.x)*box.width/v.width,y=(g.oy+(pos.y-g.minY+.5)*g.cell-camera.y)*box.height/v.height;
  await p.mouse.move(box.x+x,box.y+y);await p.waitForTimeout(120);
  const camera2=await p.evaluate(()=>window.trial.camera());
  if(camera2.x===camera.x&&camera2.y===camera.y){await p.mouse.click(box.x+x,box.y+y);return;}
 }
 assert.fail('camera did not settle');
}
const unitPos=(p,id)=>p.evaluate(i=>({...window.trial.getState().units[i].pos}),id);
/** Presses a move card's key, then clicks `target` (a unit id; default: the leader itself). */
async function cast(p,key,target){const leader=await p.evaluate(()=>window.trial.getState().leader);await p.keyboard.press(key);await p.waitForTimeout(120);await clickCell(p,await unitPos(p,target??leader));}
const fills=(p,id)=>p.evaluate(i=>{const f=document.querySelector('#unit-card-'+i+' .hud-hp-fill'),g=document.querySelector('#hud-bottom .hud-hp-fill');return {card:f?.className??'',bottom:g?.className??''};},id);
const setHp=(p,hp)=>p.evaluate(h=>{const s=window.trial.store.world,L=s.units[s.leader];L.hp=h;window.trial.render();},hp);

// ---- #2 move cards: key badge 1-4, power (a dash for a status move) and a reach icon; the hover card is the long text
{
 const {ctx,p}=await open();
 await duel(p,['tackle','aquajet','bugbuzz','blizzard']);
 const cards=await p.evaluate(()=>[...document.querySelectorAll('.hud-skill[data-hud-skill]')].map(c=>({key:c.querySelector('.hud-skill-key')?.textContent,power:c.querySelector('.hud-skill-power')?.textContent,reach:c.querySelector('.hud-skill-reach')?.dataset.reach,reachText:c.querySelector('.hud-skill-reach')?.textContent,text:c.innerText.replace(/\s+/g,' ')})));
 assert.deepEqual(cards.map(c=>c.key),['1','2','3','4']);
 assert.deepEqual(cards.map(c=>c.reach),['front','front2','around','room']);
 assert.deepEqual(cards.map(c=>c.reachText),['射程 1','射程 1–2','周围 1','同房间'],'the reach is written out, not drawn');assert.ok(cards.every(c=>/^威力 \d+$/.test(c.power)),'damaging moves show a number: '+JSON.stringify(cards.map(c=>c.power)));
 assert.ok(cards.every(c=>!/[。，；]/.test(c.text)),'no sentence on the card: '+cards[0].text);
 await p.screenshot({path:out+'r10-cards-ranges.png',clip:{x:300,y:600,width:700,height:120}});
 await duel(p,['acidarmor','glare','aurasphere','tackle']);
 const cards2=await p.evaluate(()=>[...document.querySelectorAll('.hud-skill[data-hud-skill]')].map(c=>({power:c.querySelector('.hud-skill-power')?.textContent,reach:c.querySelector('.hud-skill-reach')?.dataset.reach})));
 assert.deepEqual(cards2.map(c=>c.power),['威力 —','威力 —',cards2[2].power,cards2[3].power],'status moves show a dash');assert.equal(cards2[0].reach,'user');assert.equal(cards2[2].reach,'line10');
 await p.locator('.hud-skill').first().hover();await p.waitForTimeout(200);
 assert.ok(await p.locator('#hud-tooltip:not([hidden])').count()===1,'the hover card still opens');
 await p.keyboard.press('2');await p.waitForTimeout(150);assert.equal(await p.locator('.hud-skill[aria-pressed="true"] .hud-skill-key').textContent(),'2','the badge matches the key that selects the card');
 await p.screenshot({path:out+'r10-cards.png'});
 // a narrow window keeps the badge and the name readable
 await p.setViewportSize({width:800,height:600});await p.waitForTimeout(300);
 assert.ok(await p.locator('.hud-skill-key').first().isVisible());await p.screenshot({path:out+'r10-cards-800.png',clip:{x:200,y:480,width:600,height:120}});
 assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- #3 HP colours, then the trail
{
 const {ctx,p}=await open();const id=await duel(p,null,60);
 assert.deepEqual(await fills(p,id),{card:'hud-hp-fill',bottom:'hud-hp-fill'},'above half: green (no modifier class)');
 await setHp(p,31);assert.deepEqual(await fills(p,id),{card:'hud-hp-fill',bottom:'hud-hp-fill'},'just above half is still green');
 await setHp(p,30);assert.match((await fills(p,id)).card,/is-mid/,'exactly half is yellow');assert.match((await fills(p,id)).bottom,/is-mid/);
 await setHp(p,12);assert.match((await fills(p,id)).card,/is-low/,'a fifth or below is red');assert.match((await fills(p,id)).bottom,/is-low/);
 await setHp(p,16);assert.match((await fills(p,id)).card,/is-mid/);
 await p.screenshot({path:out+'r10-hp-yellow.png',clip:{x:0,y:0,width:260,height:220}});
 await setHp(p,11);await p.screenshot({path:out+'r10-hp-red.png',clip:{x:0,y:0,width:260,height:220}});
 const mapColor=await p.evaluate(()=>window.trial.view().leader.labels[0]&&window.trial.view().leader.labelPositions[0].text);assert.equal(mapColor,'11');
 // the HP number over the unit on the map uses the same three colours (60 max: 31 green, 30 yellow, 12 = a fifth: red, 13 yellow)
 const mapHp=async hp=>{await p.evaluate(h=>{const s=window.trial.store.world;s.units[s.leader].hp=h;window.trial.repaint(s);},hp);return p.evaluate(()=>window.trial.view().leader.labelColors[0]);};
 const green=await mapHp(31),yellow=await mapHp(30),yellow2=await mapHp(13),red=await mapHp(12);
 assert.equal(green.toLowerCase(),'#73ff7a');assert.equal(yellow.toLowerCase(),'#ffe04a');assert.equal(yellow2.toLowerCase(),'#ffe04a','just above a fifth is still yellow');assert.equal(red.toLowerCase(),'#ff6b5b');
 await setHp(p,14);
 // poison takes HP at the moment of the round's tick: the fill drops at once, the pale trail follows
 await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader];L.hp=L.maxHp=60;L.status={psn:{tick:1,left:9}};window.trial.render();});
 await p.waitForTimeout(300);
 const sample=p.evaluate(()=>new Promise(done=>{const rows=[],t0=performance.now(),tick=()=>{const f=document.querySelector('#hud-bottom .hud-hp-fill'),t=document.querySelector('#hud-bottom .hud-hp-trail'),tr=document.querySelector('#hud-bottom .hud-hp-track');
  if(f&&t&&tr){const w=tr.getBoundingClientRect().width||1;rows.push({ms:Math.round(performance.now()-t0),fill:f.getBoundingClientRect().width/w*100,trail:t.getBoundingClientRect().width/w*100});}
  if(performance.now()-t0<1800)requestAnimationFrame(tick);else done(rows);};tick();}));
 await p.keyboard.press('.');
 let shot=false;for(let i=0;i<40&&!shot;i++){const lag=await p.evaluate(()=>{const f=document.querySelector('#hud-bottom .hud-hp-fill'),t=document.querySelector('#hud-bottom .hud-hp-trail');return t&&f?t.getBoundingClientRect().width-f.getBoundingClientRect().width:0;});
  if(lag>2){await p.screenshot({path:out+'r10-hp-trail-mid.png',clip:{x:0,y:600,width:320,height:120}});shot=true;}else await p.waitForTimeout(25);}
 const rows=await sample;
 const dropped=rows.findIndex(r=>r.fill<99);assert.ok(dropped>=0,'the fill dropped');
 const lagging=rows.filter(r=>r.trail>r.fill+1.5);assert.ok(lagging.length>=3,'the trail lags behind the fill for a while ('+lagging.length+' frames)');
 assert.ok(rows.at(-1).trail-rows.at(-1).fill<0.5,'and has caught up at the end');
 const spanMs=lagging.at(-1).ms-lagging[0].ms;assert.ok(spanMs>150&&spanMs<700,'the shrink takes roughly 400 ms, measured '+spanMs);
 assert.ok(shot,'a mid-frame screenshot was taken');
 assert.deepEqual(p.errs,[]);await ctx.close();
}
// a heal grows at once (no trail) and with animations off a loss leaves no trail either
{
 const {ctx,p}=await open('&anim=off');await duel(p,null,60);
 await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader];L.hp=L.maxHp=60;L.status={psn:{tick:1,left:9}};window.trial.render();});
 const sample=p.evaluate(()=>new Promise(done=>{let worst=0,drops=0;const t0=performance.now(),tick=()=>{const f=document.querySelector('#hud-bottom .hud-hp-fill'),t=document.querySelector('#hud-bottom .hud-hp-trail');if(f&&t){worst=Math.max(worst,t.getBoundingClientRect().width-f.getBoundingClientRect().width);if(f.getBoundingClientRect().width<f.parentElement.getBoundingClientRect().width-2)drops++;}
  if(performance.now()-t0<1200)requestAnimationFrame(tick);else done({worst,drops});};tick();}));
 await p.keyboard.press('.');const r=await sample;assert.ok(r.drops>0,'the bar did drop');assert.ok(r.worst<0.5,'no trail with animations off: '+r.worst);
 await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader];L.hp=10;window.trial.render();});
 await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader];L.hp=50;window.trial.render();});
 const gap=await p.evaluate(()=>{const f=document.querySelector('#hud-bottom .hud-hp-fill'),t=document.querySelector('#hud-bottom .hud-hp-trail');return t.getBoundingClientRect().width-f.getBoundingClientRect().width;});assert.ok(Math.abs(gap)<0.5,'a heal just grows');
 assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- #4 stage and status words over the unit
{
 const {ctx,p}=await open();await duel(p,['acidarmor','glare','tackle','leer']);
 const seen=new Map();const watch=p.evaluate(()=>new Promise(done=>{const rows=[],t0=performance.now(),tick=()=>{const v=window.trial.view();for(const f of v?.floatTexts??[])rows.push({...f,ms:Math.round(performance.now()-t0)});
  if(performance.now()-t0<2600)requestAnimationFrame(tick);else done(rows);};tick();}));
 await cast(p,'1');
 let shot=false;for(let i=0;i<40&&!shot;i++){const t=await p.evaluate(()=>(window.trial.view()?.floatTexts??[]).map(f=>f.text));if(t.includes('防御↑↑')){await p.screenshot({path:out+'r10-stage-float.png'});shot=true;}else await p.waitForTimeout(30);}
 const rows=await watch;const texts=new Set(rows.map(r=>r.text));
 assert.ok(texts.has('防御↑↑'),'two steps up: two arrows. Seen: '+[...texts]);assert.ok(shot);
 const word=rows.find(r=>r.text==='防御↑↑');assert.match(word.color,/#ff9a62/i,'raised stages are warm');
 // the target's own stage shows over the target: growl lowers the enemy attack by one step
 await p.waitForFunction(()=>!window.trial.animating());await cast(p,'4','w1a');
 const w2=p.evaluate(()=>new Promise(done=>{const rows=[],t0=performance.now(),tick=()=>{for(const f of window.trial.view()?.floatTexts??[])rows.push(f);if(performance.now()-t0<2400)requestAnimationFrame(tick);else done(rows);};tick();}));
 const rows2=await w2;assert.ok(rows2.some(r=>r.text==='防御↓'),'leer: the enemy defence step is shown as one down arrow: '+JSON.stringify([...new Set(rows2.map(r=>r.text))]));
 assert.match(rows2.find(r=>r.text==='防御↓').color,/#6fb7ff/i,'lowered stages are cool');
 assert.deepEqual(p.errs,[]);await ctx.close();
}
{ // status: glare paralyses the enemy; waking a sleeper by hitting it ends the sleep
 const {ctx,p}=await open();await duel(p,['glare','tackle']);
 const collect=()=>p.evaluate(()=>new Promise(done=>{const rows=[],t0=performance.now(),tick=()=>{for(const f of window.trial.view()?.floatTexts??[])rows.push(f);if(performance.now()-t0<2200)requestAnimationFrame(tick);else done(rows);};tick();}));
 const a=collect();await cast(p,'1','w1a');
 let shot=false;for(let i=0;i<40&&!shot;i++){const t=await p.evaluate(()=>(window.trial.view()?.floatTexts??[]).map(f=>f.text));if(t.includes('麻痹')){await p.screenshot({path:out+'r10-status-float.png'});shot=true;}else await p.waitForTimeout(30);}
 const ra=await a;assert.ok(ra.some(r=>r.text==='麻痹'),'a status that was applied is named: '+JSON.stringify([...new Set(ra.map(r=>r.text))]));
 assert.match(ra.find(r=>r.text==='麻痹').color,/#ffe14d/i);
 await p.waitForFunction(()=>!window.trial.animating());
 await p.evaluate(()=>{const s=window.trial.store.world;s.units.w1a.asleep=true;s.units.w1a.hp=s.units.w1a.maxHp=500;});
 const c=collect();await cast(p,'2','w1a');const rc=await c;
 assert.ok(rc.some(r=>r.text==='睡眠×'),'a sleep that ended is crossed out: '+JSON.stringify([...new Set(rc.map(r=>r.text))]));
 assert.deepEqual(p.errs,[]);await ctx.close();
}
{ // skipping the show: no words (and no damage numbers)
 const {ctx,p}=await open('&anim=off');await duel(p,['acidarmor']);
 const rows=p.evaluate(()=>new Promise(done=>{const rows=[],t0=performance.now(),tick=()=>{for(const f of window.trial.view()?.floatTexts??[])rows.push(f);if(performance.now()-t0<1200)requestAnimationFrame(tick);else done(rows);};tick();}));
 await cast(p,'1');assert.deepEqual(await rows,[],'animations off: nothing floats');
 const def=await p.evaluate(()=>{const s=window.trial.getState();return s.units[s.leader].stages.def;});assert.equal(def,2,'the rule result is unchanged');
 await ctx.close();
}

// ---- #5 sprites load on demand
{
 const {ctx,p}=await open('&anim=on');await p.waitForTimeout(1500);
 const sheets=p.reqs.filter(u=>/\/characters\//.test(u));
 const view=await p.evaluate(()=>{const v=window.trial.view(),s=window.trial.getState();return {units:v.units,ids:[...s.queue,...s.enemies],dexes:Object.values(s.units).map(u=>({id:u.id,species:u.species}))};});
 assert.ok(sheets.length<120,'only the species this floor needs are fetched, not all 700 sheets: '+sheets.length);
 for(const id of view.ids){const u=view.units[id];if(u){assert.notEqual(u.texture,'__MISSING','no unit is drawn with the missing-texture box: '+id);assert.ok(u.animation,'every drawn unit has an animation: '+id);}}
 assert.ok(Object.keys(view.units).length>=3,'the party is drawn');
 // every action sheet of a drawn unit's species was requested before it appeared
 const s=await p.evaluate(()=>{const w=window.trial.getState();return {seed:w.dungeon.seed,species:[...w.queue,...w.enemies].map(i=>w.units[i].species)};});
 const dex=sp=>SPECIES[sp].dex;
 for(const sp of s.species)for(const a of ['Idle','Walk','Attack','Hurt'])assert.ok(sheets.some(u=>u.includes('/characters/'+dex(sp)+'/'+a+'-Anim.png')),sp+' '+a+' was loaded');
 // the next floor's planned species are fetched in the background, one species at a time while the player is idle
 const planned=[...new Set(plannedEnemySpecies(s.seed,2,true))];
 const got=sp=>p.reqs.some(u=>u.includes('/characters/'+dex(sp)+'/Idle-Anim.png'));
 for(let i=0;i<300&&!planned.every(got);i++)await p.waitForTimeout(100);
 for(const sp of planned)assert.ok(got(sp),'next floor species '+sp+' was prefetched');
 // a species nobody asked for yet appears only once its sheets are in (never as a blank box)
 const before=p.reqs.length;
 const unusedDex=await p.evaluate(()=>{const w=window.trial.store.world,L=w.units[w.leader],k=(x,y)=>x+','+y;
  const spot=w.floor.find(f=>w.seen.includes(k(f.x,f.y))&&!Object.values(w.units).some(u=>u.pos&&u.pos.x===f.x&&u.pos.y===f.y)&&Math.max(Math.abs(f.x-L.pos.x),Math.abs(f.y-L.pos.y))<=3);
  const e={...w.units[w.enemies[0]],id:'w9z',species:'mew',pos:spot,hp:30,maxHp:30,asleep:true,waitOnly:true};w.units.w9z=e;w.enemies.push('w9z');window.trial.repaint(w);return spot;});
 const bad=[];for(let i=0;i<40;i++){const t=await p.evaluate(()=>window.trial.view()?.units.w9z?.texture??null);if(t==='__MISSING')bad.push(i);await p.waitForTimeout(40);}
 const shown=await p.evaluate(()=>window.trial.view()?.units.w9z?.texture??null);
 assert.equal(bad.length,0,'never drawn as the missing-texture box');assert.ok(shown&&shown.startsWith(SPECIES.mew.dex+'-'),'the new species appears after loading: '+shown);
 assert.ok(p.reqs.slice(before).filter(u=>/\/characters\//.test(u)).length>=4,'its four sheets were fetched on demand');
 assert.deepEqual(p.errs,[]);await ctx.close();
}

// ---- #5 follow-ups: a late species never turns the canvas transparent or leaves a unit invisible; stairs fetch the next floor at once
const inject=p=>p.evaluate(()=>{const w=window.trial.store.world,L=w.units[w.leader],k=(x,y)=>x+','+y;
 const spot=w.floor.find(f=>w.seen.includes(k(f.x,f.y))&&!Object.values(w.units).some(u=>u.pos&&u.pos.x===f.x&&u.pos.y===f.y)&&Math.max(Math.abs(f.x-L.pos.x),Math.abs(f.y-L.pos.y))<=3);
 w.units.w9z={...w.units[w.enemies[0]],id:'w9z',species:'mew',pos:spot,hp:30,maxHp:30,asleep:true,waitOnly:true};w.enemies.push('w9z');window.trial.repaint(w);});
{ // slow: the sheets arrive after 2.5 s. The canvas stays visible; after 1.2 s a placeholder stands for the unit; when the sheets are in, the sprite replaces it.
 const {ctx,p}=await open();await p.waitForTimeout(1200);
 await p.route('**/characters/'+SPECIES.mew.dex+'/**',async route=>{await new Promise(r=>setTimeout(r,2500));await route.continue();});
 await inject(p);
 const opacities=[],holders=[];for(let i=0;i<20;i++){opacities.push(await p.evaluate(()=>getComputedStyle(document.querySelector('#board canvas')).opacity));holders.push(await p.evaluate(()=>window.trial.view()?.placeholders??[]));await p.waitForTimeout(90);}
 assert.ok(opacities.every(o=>o==='1'),'the canvas is never made transparent after the first picture: '+[...new Set(opacities)]);
 assert.ok(holders.slice(0,8).every(h=>!h.includes('w9z')),'for the first moments the late unit is simply not drawn');
 assert.ok(holders.some(h=>h.includes('w9z')),'after 1.2 s without its sheets the unit is drawn as a placeholder: '+JSON.stringify(holders.at(-1)));
 await p.waitForFunction(()=>window.trial.view()?.units.w9z?.texture?.startsWith('0151-'),null,{timeout:8000});
 assert.deepEqual(await p.evaluate(()=>window.trial.view().placeholders),[],'the sprite replaced the placeholder');
 assert.deepEqual(p.errs,[]);await ctx.close();
}
{ // refused: the files are not there. The unit still shows as a placeholder, for good.
 const {ctx,p}=await open();await p.waitForTimeout(800);
 await p.route('**/characters/'+SPECIES.mew.dex+'/**',route=>route.fulfill({status:404,body:''}));
 await inject(p);await p.waitForTimeout(2200);
 const held=await p.evaluate(()=>({holders:window.trial.view().placeholders,u:window.trial.view().units.w9z??null}));
 assert.ok(held.holders.includes('w9z')&&!held.u,'a refused species is drawn as a placeholder, not left invisible: '+JSON.stringify(held));
 assert.deepEqual(p.errs,[]);await ctx.close();
}
{ // standing on the stairs down fetches the next floor's species at once (the idle drip alone would take seconds)
 const {ctx,p}=await open();
 const planned=await p.evaluate(()=>{const w=window.trial.getState();return {seed:w.dungeon.seed};});
 const want=[...new Set(plannedEnemySpecies(planned.seed,2,true))].filter(sp=>!p.reqs.some(u=>u.includes('/characters/'+SPECIES[sp].dex+'/Idle-Anim.png')));
 assert.ok(want.length>=3,'most of the next floor is not fetched yet: '+want.length);
 await p.evaluate(()=>{const w=window.trial.store.world,L=w.units[w.leader];w.points.push({pos:{x:L.pos.x,y:L.pos.y},kind:'down',used:false});window.trial.render();});
 await p.waitForSelector('#stairs-prompt',{timeout:3000});
 for(let i=0;i<20&&!want.every(sp=>p.reqs.some(u=>u.includes('/characters/'+SPECIES[sp].dex+'/Hurt-Anim.png')));i++)await p.waitForTimeout(100);
 assert.ok(want.every(sp=>p.reqs.some(u=>u.includes('/characters/'+SPECIES[sp].dex+'/Hurt-Anim.png'))),'all of them were requested within 2 s of reaching the stairs');
 assert.deepEqual(p.errs,[]);await ctx.close();
}
await b.close();console.log('playtest1107-r10 ok');
