// Planning sees only revealed floor, drawn walls, revealed points and enemies, and our own team.
// Hidden cells, enemy data outside revealed cells, and unknown points are not supplied to the planner.
// Game actions still go through keyboard input, canvas clicks, or visible buttons.
import assert from 'node:assert/strict';
import {campControl} from './camp-ui.mjs';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {inferEvents,newLines} from '../../src/render/animation.ts';
import {applyCommand,createExpedition,rngStep,defaultLearningCommand,sleeping} from '../../src/core/engine.ts';
import {moveOf} from '../../src/core/moves.ts';
import {SPECIES} from '../../src/core/roster.ts';
import {typeEffectiveness} from '../../src/core/type-chart.ts';
import {floorIndex,adjacentReachable,rayReachable} from '../../src/render/reach.ts';

const artifactDir='.artifacts/trial';
fs.mkdirSync(artifactDir,{recursive:true});
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TRIAL_URL;
if(!base)throw Error('Set TRIAL_URL.');
const routes=JSON.parse(fs.readFileSync(new URL('./five-game-routes.json',import.meta.url),'utf8'));
const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true,timeout:15000});
const suiteStarted=performance.now();
const report={platform:process.platform,browser:await browser.version(),url:base,visibleInfoOnly:true,startedAt:new Date().toISOString(),games:[],status:'FAIL'};
let gameTiming=null;
// Linux exceeded 20 minutes after three games; the paired Windows run took
// 294.3 s on main and 299.5 s on the candidate. Only the wall-clock budget grows:
// the five seeds, per-game action cap and all real-input/save assertions stay.
const deadline=setTimeout(()=>{report.deadlineReached=true;console.error('Five-game browser check exceeded its 40-minute deadline');void browser.close();},40*60*1000);
const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
await context.addInitScript(()=>{
 window.__trialNoAnim=true;window.__trialNoAutoSleep=true;window.__movementInputTrace=[];
 for(const type of ['keydown','keyup'])addEventListener(type,event=>{if(!['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;const s=window.trial?.getState(),entry={type,key:event.key,at:event.timeStamp,round:s?.round};window.__movementInputTrace.push(entry);if(window.__movementInputTrace.length>64)window.__movementInputTrace.shift();queueMicrotask(()=>{entry.afterRound=window.trial?.getState()?.round;});},true);
});
const page=await context.newPage(),errors=[];
page.setDefaultTimeout(15000);
page.on('pageerror',e=>errors.push(e.message));
page.on('requestfailed',r=>errors.push(r.url()));
page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
const ready=()=>page.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
const state=()=>page.evaluate(()=>window.trial.getState());
const envelope=()=>page.evaluate(()=>window.trial.store.envelope);
const raw=()=>page.evaluate(()=>localStorage.getItem(window.trial.store.key));
const click=async id=>{
 if(id==='open-settings'&&await page.locator('#hud-settings').isVisible())id='hud-settings';
 if(id.startsWith('use-')){
  const item=id.slice(4),inventory=await state();
  assert.ok((inventory.prog?.items?.[item]??0)>0,'the selected consumable must exist in the visible party inventory');
  const bag=page.locator('#hud-bag');
  if(!(await bag.isVisible())){await page.locator('#bag-open').click();await ready();}
  await bag.locator('[data-bag-slot="0"]').click();await ready();
  await bag.locator('[data-bag-category="all"]').click();await ready();
  const itemButton=bag.locator('[data-bag-item="'+item+'"]');
  assert.equal(await itemButton.count(),1,'the held consumable must appear in the all-items category');
  const itemName=(await itemButton.locator('.hud-item-name').innerText()).trim();
  await itemButton.click();await ready();
  const slotLabel=await bag.locator('[data-bag-slot="0"]').getAttribute('aria-label');
  assert.ok(slotLabel?.includes(itemName),'the selected item must appear in the assigned quick slot');
  await page.locator('#bag-close').click();await ready();
  const quick=page.locator('[data-hud-quick="0"]');
  assert.ok(await quick.isEnabled(),'the assigned quick slot must be usable while inventory remains');
  await quick.click();await ready();return;
 }
 id=await campControl(page,id);
 const target=page.locator('#'+id),actions=page.locator('#hud-actions'),actionsOpen=page.locator('#actions-open');
 if(await target.count()&&await actions.count()&&await actions.isHidden()&&await actionsOpen.isVisible()&&await target.evaluate(el=>!!(el.closest('#controls,#hud-actions')||(el.closest('#save')&&!el.closest('#flow'))))){await actionsOpen.click();await ready();}
 await target.click();await ready();
};
async function cell(pos){
 await page.waitForTimeout(400);   // let the camera finish following before converting a cell to pixels
 // Read the live map geometry and camera viewport so the click follows the
 // responsive HUD canvas at its current size and position.
 const actions=page.locator('#hud-actions');if(await actions.count()&&await actions.isVisible()&&await page.locator('#actions-open').isVisible()){await page.locator('#actions-open').click();await ready();}
 const bag=page.locator('#hud-bag');if(await bag.count()&&await bag.isVisible()){await page.locator('#bag-close').click();await ready();}
 for(let attempt=0;attempt<4;attempt++){
  const view=await page.evaluate(()=>window.trial.view()),g=view.geometry,v=view.cameraView;
  const camera=await page.evaluate(()=>window.trial.camera()),box=await page.locator('canvas').boundingBox();
  const x=(g.ox+(pos.x-g.minX+.5)*g.cell-camera.x)*box.width/v.width;
  const y=(g.oy+(pos.y-g.minY+.5)*g.cell-camera.y)*box.height/v.height;
  assert.ok(x>=0&&x<box.width&&y>=0&&y<box.height,'target must be visible on canvas');
  await page.mouse.move(box.x+x,box.y+y);await page.waitForTimeout(150);
  const after=await page.locator('canvas').boundingBox(),afterCamera=await page.evaluate(()=>window.trial.camera());
  if(['x','y','width','height'].every(k=>Math.abs(after[k]-box[k])<0.5)&&afterCamera.x===camera.x&&afterCamera.y===camera.y){
   await page.mouse.click(box.x+x,box.y+y);await ready();return;
  }
 }
 assert.fail('canvas position must settle after hovering before the real click');
}

// This projection is the only input accepted by the route planner. A point or enemy
// is copied only when its position is in seen; the planner never receives the raw state.
function visibleView(s){
 const seen=new Set(s.seen);
 const seenWalls=new Set(s.seenWalls??[]);
 const team=s.queue.map(id=>{
  const u=s.units[id],status={};
  for(const key of ['frz','confusion'])if(u?.status?.[key]!==undefined)status[key]={...u.status[key]};
  return {id,...(u?.species?{species:u.species}:{}),hp:u?.hp??0,maxHp:u?.maxHp??0,pos:u?.pos?{x:u.pos.x,y:u.pos.y}:null,learned:[...(u?.learned??[])],pp:{...(u?.pp??{})},maxPp:{...(u?.maxPp??{})},...(Object.keys(status).length?{status}:{})};
 });
 const enemies=s.enemies.map(id=>{
  const u=s.units[id];
  if(!u||!u.pos||!seen.has(u.pos.x+','+u.pos.y)||u.hp<=0)return null;
  return {id,...(u.species?{species:u.species}:{}),pos:{x:u.pos.x,y:u.pos.y},hp:u.hp,asleep:!!u.asleep};
 }).filter(Boolean);
 const points=s.points.filter(p=>seen.has(p.pos.x+','+p.pos.y))
  .map(p=>({kind:p.kind,pos:{x:p.pos.x,y:p.pos.y},used:!!p.used}));
 const leader=team.find(u=>u.id===s.leader);
 return {level:s.dungeon?.level??1,seen:[...seen],seenWalls:[...seenWalls],team,leaderId:s.leader,leaderPos:leader?.pos??null,enemies,points,items:{...(s.prog?.items??{})}};
}

// Replays actual UI input. State reads here only translate a chosen visible
// action into input; they do not choose a route or dispatch game commands.
async function command(c){
 if(c.type==='invite'){
  const s=await state();
  assert.equal(s.phase,'invitation');
  const pending=s.invitations.find(i=>i.status==='pending');assert.ok(pending);
  if(c.choice==='accept'){
   if(c.outgoing)await click('out-'+s.queue.indexOf(c.outgoing));else await click('out-none');
   await click('accept');
   const after=await state();
   assert.equal(after.invitations.find(i=>i.id===pending.id).status,'accepted');
   assert.ok(after.queue.includes(pending.unit.id),'accepted recruit must actually join the party');
  }else{await click('reject');await click('reject-confirm');}
  assert.notEqual((await state()).invitations.find(i=>i.id===pending.id)?.status,'pending','the chosen invitation must be resolved');
  return;
 }
 if(c.type==='buy'){await click('buy-'+c.item);return;}
 assert.equal(c.type,'round');
 const a=c.action,movementBefore=a.type==='move'?await state():null;
 if(a.type==='move'){
  assert.ok(Array.isArray(a.keys)&&a.keys.length>=1&&a.keys.length<=2,'movement uses one cardinal key or a two-key diagonal chord');
  await page.keyboard.press(a.keys.join('+'));
  await ready();
 }else if(a.type==='basic')await cell(a.targetPos);
 else if(a.type==='skill'){await click('skill-'+a.skill);await cell(a.targetPos);}
 else if(a.type==='wait')await click('wait');
 else if(a.type==='swap'){await click('swap');await click('partner-'+a.target);await click('submit');}
 else if(a.type==='use'){await click('use-'+a.item);await click(a.item==='teamTonic'?'item-use-teamTonic':a.item==='bigBerry'?'item-target-bigBerry-'+a.target:'item-target-'+a.target);}
 else if(a.type==='rest')await click('rest');
 else if(a.type==='interact'){
  if(a.exit){await click('take-exit');await click('exit-confirm');}else await click('take');
 }else throw Error('Unsupported route action '+JSON.stringify(a));
 const after=await state();
 assert.ok(after.round>c.beforeRound,'UI action must advance a complete round; action: '+JSON.stringify(a)+'; notice: '+await page.locator('#message').innerText()+'; visible state: '+JSON.stringify(visibleView(after)));
 if(a.type==='move'){
  const id=movementBefore.leader,pos=movementBefore.units[id].pos,to={x:pos.x+a.dx,y:pos.y+a.dy};
  try{assertMovementOutcome(movementBefore,after,to);}catch(error){fs.writeFileSync(artifactDir+'/five-games-input-failure.json',JSON.stringify({keys:a.keys,before:{round:movementBefore.round,pos:movementBefore.units[id].pos},after:{round:after.round,pos:after.units[id].pos},trace:await page.evaluate(()=>window.__movementInputTrace)},null,2));throw error;}
 }
}
function movementEventsFor(events,id){
 return events.flatMap(ev=>{
  if(ev.k==='move'&&ev.by===id&&ev.id===id)return [{to:ev.to,kind:'move'}];
  if(ev.k==='swap'&&ev.by===id){
   if(ev.a===id)return [{to:ev.pb,kind:'swap'}];
   if(ev.b===id)return [{to:ev.pa,kind:'swap'}];
  }
  return [];
 });
}
function samePos(a,b){return a.x===b.x&&a.y===b.y;}
function assertMovementOutcome(before,after,requested){
 const id=before.leader,pos=before.units[id].pos;
 assert.equal(after.round,before.round+1,'one cardinal key or two-key chord must produce exactly one round');
 const lines=newLines(before.log,after.log),events=inferEvents(before,after,{type:'round',action:{type:'move',to:requested}});
 const ownMoves=movementEventsFor(events,id),status=visibleView(before).team.find(u=>u.id===id)?.status;
 if(status?.frz){
  assert.equal(ownMoves.length,0,'a frozen leader cannot produce a movement event');
  assert.ok(lines.includes(id+'冰冻中，无法行动，本次行动落空，未扣PP'),'a frozen no-move result requires an exact lost-action log from this round');
  return 'frozen-action-lost';
 }
 const confusedLines=status?.confusion?lines.filter(line=>line.startsWith(id+'因混乱朝')):[];
 if(status?.confusion)assert.equal(confusedLines.length,1,"an active confusion status must be proven by this round's leader log");
 if(ownMoves.length===1&&samePos(ownMoves[0].to,requested))return 'arrived';
 if(status?.confusion&&confusedLines.length===1&&confusedLines[0].endsWith('，被挡住，原地不动')){
  assert.equal(ownMoves.length,0,'a blocked confused move has no leader move/swap event');
  return 'confused-step-blocked';
 }
 if(status?.confusion&&confusedLines.length===1&&confusedLines[0].endsWith('乱走')){
  assert.equal(ownMoves.length,1,'a redirected confused move must have one real leader move/swap event');
  const actual=ownMoves[0].to;
  assert.equal(Math.max(Math.abs(actual.x-pos.x),Math.abs(actual.y-pos.y)),1,'a redirected move still travels exactly one neighboring cell');
  assert.notDeepEqual(actual,requested,'this exception only accepts a logged confusion redirection away from the planned destination');
  return 'confused-direction-replaced';
 }
 assert.fail('keyboard move lacks a matching movement event or specific status proof; leader='+id+'; status='+JSON.stringify(status)+'; round log='+JSON.stringify(lines)+'; movement events='+JSON.stringify(ownMoves));
}
async function roundTrip(label){
 const before=await envelope();
 assert.deepEqual(Object.keys(before).sort(),['build','content','format','profile','rules','sequence'],label+' contains only camp data');
 await click('open-settings');
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#save-export').click()]);
 const bytes=fs.readFileSync(await download.path(),'utf8');
 assert.deepEqual(JSON.parse(bytes),before,label+' export');
 page.once('dialog',async d=>{assert.match(d.message(),/覆盖当前存档/);await d.accept();});
 await page.locator('#save-file').setInputFiles({name:'five-games.json',mimeType:'application/json',buffer:Buffer.from(bytes)});
 await page.waitForFunction(()=>document.querySelector('#transfer-message').textContent.includes('已导入并保存'));
 assert.deepEqual(await envelope(),before,label+' import');
 await click('settings-close');await page.reload();await ready();
 assert.deepEqual(await envelope(),before,label+' reload');
 assert.equal(await state(),null,label+' reload starts from camp');
}

const directions=[
 {dx:1,dy:0,keys:['ArrowRight']},
 {dx:0,dy:1,keys:['ArrowDown']},
 {dx:-1,dy:0,keys:['ArrowLeft']},
 {dx:0,dy:-1,keys:['ArrowUp']},
 {dx:1,dy:1,keys:['d','s']},
 {dx:-1,dy:1,keys:['a','s']},
 {dx:-1,dy:-1,keys:['a','w']},
 {dx:1,dy:-1,keys:['d','w']}
];
const posKey=p=>p.x+','+p.y;
const chebyshev=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
function floorStepAllowed(floor,from,to){
 const dx=to.x-from.x,dy=to.y-from.y;
 if(chebyshev(from,to)!==1||!floor.has(posKey(to)))return false;
 return dx===0||dy===0||(floor.has(posKey({x:to.x,y:from.y}))&&floor.has(posKey({x:from.x,y:to.y})));
}
const fromKey=k=>{const [x,y]=k.split(',').map(Number);return {x,y};};
const visibleFloor=view=>floorIndex(view.seen.map(fromKey));
const add=(p,d)=>({x:p.x+d.dx,y:p.y+d.dy});
function unknownExitMayBeReached(floor,known,from,d){
 const to=add(from,d);if(known.has(posKey(to)))return false;
 return d.dx===0||d.dy===0||(floor.has(posKey({x:from.x+d.dx,y:from.y}))&&floor.has(posKey({x:from.x,y:from.y+d.dy})));
}
function refreshScoutMemory(view,memory){
 const now=new Set([...view.seen,...(view.seenWalls??[])]);
 for(const k of now)if(!memory.known.has(k)){
  const p=fromKey(k);
  for(const d of directions)memory.tried.delete(posKey(add(p,d)));
 }
 memory.known=now;
}
function visibleDistances(view,start){
 const floor=new Set(view.seen);
 const blocked=new Set(view.enemies.map(e=>posKey(e.pos)));
 const distance=new Map([[posKey(start),0]]),queue=[start];
 for(let i=0;i<queue.length;i++){
  const cur=queue[i],nextDistance=distance.get(posKey(cur))+1;
  for(const d of directions){
   const next=add(cur,d),k=posKey(next);
   if(!floor.has(k)||blocked.has(k)||distance.has(k)||!floorStepAllowed(floor,cur,next))continue;
   distance.set(k,nextDistance);queue.push(next);
  }
 }
 return distance;
}
function nextStep(view,target){
 const start=view.leaderPos;
 if(!start)return null;
 if(posKey(start)===posKey(target))return {arrived:true};
 const distances=visibleDistances(view,target);
 const currentDistance=distances.get(posKey(start));
 if(currentDistance===undefined)return null;
 const floor=new Set(view.seen),blocked=new Set(view.enemies.map(e=>posKey(e.pos)));
 const options=directions.map(d=>({d,p:add(start,d),k:posKey(add(start,d))}))
  .filter(o=>distances.has(o.k)&&!blocked.has(o.k)&&floorStepAllowed(floor,start,o.p)&&distances.get(o.k)<currentDistance)
  .sort((a,b)=>distances.get(a.k)-distances.get(b.k));
 if(!options.length)return null;
 const first=options[0];
 const ally=view.team.find(u=>u.id!==view.leaderId&&u.hp>0&&u.pos&&posKey(u.pos)===first.k);
 return ally?{action:{type:'swap',target:ally.id}}:{action:{type:'move',keys:first.d.keys,dx:first.d.dx,dy:first.d.dy}};
}
function nearestRevealedEdge(view,memory){
 const start=view.leaderPos;
 if(!start)return null;
 const floor=new Set(view.seen),known=new Set([...floor,...(view.seenWalls??[])]),distances=visibleDistances(view,start),edges=[];
 for(const k of view.seen){
  if(memory.tried.has(k)||!distances.has(k))continue;
  const p=fromKey(k);
  if(!directions.some(d=>unknownExitMayBeReached(floor,known,p,d)))continue;
  edges.push({pos:p,key:k,distance:distances.get(k)});
 }
 edges.sort((a,b)=>a.distance-b.distance||a.pos.y-b.pos.y||a.pos.x-b.pos.x);
 return edges[0]??null;
}
function adjacentEnemy(view,{awakeOnly=false}={}){
 if(!view.leaderPos)return null;
 const floor=new Set(view.seen);
 return view.enemies.filter(e=>floorStepAllowed(floor,view.leaderPos,e.pos)&&(!awakeOnly||!e.asleep))
  .sort((a,b)=>a.hp-b.hp||a.pos.y-b.pos.y||a.pos.x-b.pos.x)[0]??null;
}
function recoverBlockedRoute(view,memory){
 const adjacent=adjacentEnemy(view);
 if(adjacent)return {kind:'round',action:{type:'basic',targetPos:adjacent.pos}};
 const edge=nearestRevealedEdge(view,memory);
 if(edge)return {kind:'scout',edge};
 // A sleeping enemy cannot approach us. Walk to a reachable, revealed cell beside
 // a visible enemy instead of waiting forever on this side of the obstruction.
 const distances=visibleDistances(view,view.leaderPos),approaches=[],floor=new Set(view.seen);
 for(const enemy of view.enemies)for(const d of directions){
  const pos=add(enemy.pos,d),distance=distances.get(posKey(pos));
  if(floorStepAllowed(floor,enemy.pos,pos)&&distance!==undefined&&distance>0)approaches.push({pos,distance});
 }
 approaches.sort((a,b)=>a.distance-b.distance||a.pos.y-b.pos.y||a.pos.x-b.pos.x);
 for(const approach of approaches){
  const step=nextStep(view,approach.pos);
  if(step?.action)return {kind:'round',action:step.action};
 }
 return null;
}
function visibleDamageTarget(view,actor,target,spec){
 if(spec.target!=='enemy'||!spec.effects.includes('damage'))return false;
 const floor=visibleFloor(view);if(!new Set(view.seen).has(posKey(target.pos)))return false;
 if(spec.range==='front'||spec.range==='around')return adjacentReachable(floor,actor.pos,target.pos);
 if(spec.range!=='front2'&&spec.range!=='line10')return false;
 const occupied=new Set([...view.team,...view.enemies].filter(unit=>unit.id!==actor.id&&unit.id!==target.id&&unit.hp>0&&unit.pos).map(unit=>posKey(unit.pos)));
 return rayReachable(floor,occupied,actor.pos,target.pos,spec.range==='front2'?2:10);
}
function planVisibleDamage(view,requirePp=true){
 const actor=view.team.find(unit=>unit.id===view.leaderId);if(!actor||actor.hp<=0||!actor.pos)return null;
 const candidates=[];
 for(const skill of actor.learned??[]){
  const spec=moveOf(skill);if(['snore','sleeptalk'].includes(skill)||!spec||!spec.effects.includes('damage')||spec.target!=='enemy'||(requirePp&&(actor.pp[skill]??0)<1))continue;
  for(const target of view.enemies)if(typeEffectiveness(skill,SPECIES[target.species]?.types??[])>0&&visibleDamageTarget(view,actor,target,spec))candidates.push({skill,target,power:spec.power??0});
 }
 candidates.sort((a,b)=>b.power-a.power||a.target.hp-b.target.hp||a.target.pos.y-b.target.pos.y||a.target.pos.x-b.target.pos.x||a.skill.localeCompare(b.skill));
 const best=candidates[0];return best?{type:'skill',skill:best.skill,target:best.target.id,targetPos:{x:best.target.pos.x,y:best.target.pos.y}}:null;
}
function planVisibleBerry(view){
 const actor=view.team.find(unit=>unit.id===view.leaderId);
 return (view.items?.berry??0)>0&&actor?.pos&&actor.hp>0&&actor.hp<actor.maxHp?{type:'use',item:'berry',target:actor.id}:null;
}
function planVisibleTonic(view){
 const actor=view.team.find(unit=>unit.id===view.leaderId);
 if((view.items?.tonic??0)<1||!actor?.pos||actor.hp<=0||!planVisibleDamage(view,false))return null;
 return (actor.learned??[]).some(skill=>(actor.pp[skill]??0)<(actor.maxPp[skill]??0))?{type:'use',item:'tonic',target:actor.id}:null;
}
function planVisibleAction(view,route,memory,shopBought){
 // Self-target supplies stay legal if a companion moves earlier in the same round.
 const berry=planVisibleBerry(view);if(berry)return {kind:'round',action:berry};
 const damage=planVisibleDamage(view);if(damage)return {kind:'round',action:damage};
 const tonic=planVisibleTonic(view);if(tonic)return {kind:'round',action:tonic};
 const awake=adjacentEnemy(view,{awakeOnly:true});
 if(awake)return {kind:'round',action:{type:'basic',targetPos:awake.pos}};
 const pickup=view.points.find(p=>!p.used&&(p.kind==='berry'||p.kind==='tonic')&&posKey(p.pos)===posKey(view.leaderPos));
 if(pickup)return {kind:'round',action:{type:'interact',exit:false}};
 // Prioritize visible pickups, then the downward stair. There is no retreat destination.
 const target=view.points.find(p=>!p.used&&(p.kind==='goal'||p.kind==='item'))??view.points.find(p=>p.kind==='down');
 if(target){
  if(posKey(view.leaderPos)===posKey(target.pos))return {kind:'round',action:{type:'interact',exit:target.kind==='down'}};
  const step=nextStep(view,target.pos);
  if(step?.action)return {kind:'round',action:step.action};
  return recoverBlockedRoute(view,memory);
 }
 const edge=nearestRevealedEdge(view,memory);
 if(edge)return {kind:'scout',edge};
 return recoverBlockedRoute(view,memory);

}
// Invitations can replace a fallen or badly hurt non-leader through the existing UI.
// These are our own displayed HP values; no hidden enemies or future outcomes enter the decision.
function planInvitation(view){
 if(view.team.length<3)return {choice:'accept'};
 const outgoing=view.team.filter(u=>u.id!==view.leaderId)
  .sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
 return outgoing&&outgoing.hp/outgoing.maxHp<0.5?{choice:'accept',outgoing:outgoing.id}:{choice:'reject'};
}
let acceptedInRun=0,replacementsInRun=0;
async function playRun(index,route){
 acceptedInRun=0;replacementsInRun=0;
 const memory={known:new Set(),tried:new Set()};
 let shopBought=false,roundActions=0,invitationActions=0;
 const maxActions=1200;let floorLevel=0;
 while(roundActions<maxActions){
  const s=await state();
  if(s.phase==='ended')return acceptedInRun;
  if(s.phase==='invitation'){
   assert.ok(++invitationActions<=maxActions,'single-run invitation handling exceeded its limit');
   const view=visibleView(s);
   const decision=planInvitation(view);
   await command({type:'invite',...decision});
   if(decision.choice==='accept')acceptedInRun++;
   if(decision.outgoing)replacementsInRun++;
   continue;
  }
  if(s.phase==='learning'){const cmd=defaultLearningCommand(s);assert.ok(cmd);await click(cmd.replace?'learn-replace-'+cmd.replace:'learn-skip');continue;}
  if(s.phase==='evolution'){await click('evolution-close');continue;}
  assert.equal(s.phase,'playing','game must remain playable while routing');
  if(sleeping(s.units[s.leader])){await page.keyboard.press('.');await ready();roundActions++;continue;}
  if(floorLevel!==s.dungeon.level){memory.known.clear();memory.tried.clear();floorLevel=s.dungeon.level;}
  const view=visibleView(s);
  refreshScoutMemory(view,memory);
  const plan=planVisibleAction(view,route,memory,shopBought);
  if(!plan)throw Error('没有可走的已揭示边缘且目标尚未发现；可见状态：'+JSON.stringify(view));
  if(plan.kind==='buy'){
   await command({type:'buy',item:plan.item});shopBought=true;continue;
  }
  if(plan.kind==='scout'){
   const currentKey=posKey(view.leaderPos);
   if(currentKey===plan.edge.key){memory.tried.add(plan.edge.key);continue;}
   const step=nextStep(view,plan.edge.pos);
   if(!step)throw Error('最近已揭示边缘无法到达；可见状态：'+JSON.stringify(view));
   const before=new Set([...view.seen,...(view.seenWalls??[])]);
   await command({type:'round',action:step.action,beforeRound:s.round});
   roundActions++;
   const after=visibleView(await state());
   refreshScoutMemory(after,memory);
   const newTerrain=[...after.seen,...(after.seenWalls??[])].some(k=>!before.has(k));
   if(after.leaderPos&&posKey(after.leaderPos)===plan.edge.key&&!newTerrain)memory.tried.add(plan.edge.key);
   continue;
  }
  await command({type:'round',action:plan.action,beforeRound:s.round});
  roundActions++;
 }
 const last=visibleView(await state());
 throw Error('单局超过 '+maxActions+' 个真实回合动作上限；可见状态：'+JSON.stringify(last));
}

try{
 const projectionState=extraFloor=>({seen:['0,0'],seenWalls:['0,1'],floor:[{x:0,y:0},{x:10,y:10},...extraFloor],queue:['A'],units:{A:{id:'A',hp:10,pos:{x:0,y:0}}},leader:'A',enemies:[],points:[],dungeon:{level:1}});
 const nearProjection=visibleView(projectionState([])),farProjection=visibleView(projectionState([{x:11,y:10},{x:10,y:11}]));
 assert.deepEqual(nearProjection.seenWalls,['0,1'],'the planner receives only walls actually revealed');
 const adjacentProjection=visibleView(projectionState([{x:1,y:0}]));
 assert.deepEqual(adjacentProjection,nearProjection,'adjacent hidden floor changes do not enter the visible planner projection');
 assert.deepEqual(farProjection,nearProjection,'far hidden floor changes do not enter the visible planner projection');
 const statusProjection=visibleView({...projectionState([]),units:{A:{id:'A',hp:10,pos:{x:0,y:0},status:{frz:{left:2},confusion:{left:4},brn:{tick:3}}}}});
 assert.deepEqual(statusProjection.team[0].status,{frz:{left:2},confusion:{left:4}},'movement reasoning receives only the leader-relevant visible freeze and confusion fields');
 report.movementStatusProjectionRegression=true;
 const projectionEdge=view=>nearestRevealedEdge(view,{known:new Set([...view.seen,...view.seenWalls]),tried:new Set()});
 assert.deepEqual(projectionEdge(farProjection),projectionEdge(nearProjection),'far hidden floor changes do not change the selected exploration edge');
 report.hiddenTerrainProjectionRegression=true;
 const moveFixture=status=>{
  const w=createExpedition('five-games-status-smoke',24681357,1),id=w.leader;
  w.queue=[id];w.enemies=[];w.points=[];w.floor=[];
  for(let y=0;y<3;y++)for(let x=0;x<3;x++)w.floor.push({x,y});
  w.seen=w.floor.map(posKey);w.units[id].pos={x:1,y:1};w.units[id].status=structuredClone(status);w.round=0;
  return w;
 };
 const requested={x:2,y:1};
 const paralysedBefore=moveFixture({par:{left:2}}),paralysedResult=applyCommand(paralysedBefore,{type:'round',action:{type:'move',to:requested}});
 assert.equal(assertMovementOutcome(paralysedBefore,paralysedResult.state,requested),'arrived','paralysis blocks moves and basic attacks, not walking');
 const frozenBefore=moveFixture({frz:{left:2}}),frozenResult=applyCommand(frozenBefore,{type:'round',action:{type:'move',to:requested}});
 assert.equal(frozenResult.ok,true,'the engine accepts a geometrically valid move even while frozen');
 assert.equal(assertMovementOutcome(frozenBefore,frozenResult.state,requested),'frozen-action-lost','only the exact same-round freeze log permits a no-move result');
 const confusedBefore=moveFixture({confusion:{left:2}});
 let confusionRng=0,confusionDirection=Math.floor(rngStep(confusionRng).value*8);
 while(confusionDirection===0){confusionRng++;confusionDirection=Math.floor(rngStep(confusionRng).value*8);}
 confusedBefore.battleRng=confusionRng;
 const confusedResult=applyCommand(confusedBefore,{type:'round',action:{type:'move',to:requested}});
 assert.equal(confusedResult.ok,true);
 const confusedPos=confusedResult.state.units[confusedBefore.leader].pos;
 assert.notDeepEqual(confusedPos,requested,'the deterministic fixture chooses a different direction, without changing the fresh-run random stream');
 assert.equal(assertMovementOutcome(confusedBefore,confusedResult.state,requested),'confused-direction-replaced','the actual confusion log and actual move event prove the changed destination');
 const blockedBefore=moveFixture({confusion:{left:2}});
 blockedBefore.floor=blockedBefore.floor.filter(p=>p.x!==0||p.y!==1);blockedBefore.seen=blockedBefore.floor.map(posKey);blockedBefore.battleRng=confusionRng;
 const blockedResult=applyCommand(blockedBefore,{type:'round',action:{type:'move',to:requested}});
 assert.equal(blockedResult.ok,true);
 assert.equal(assertMovementOutcome(blockedBefore,blockedResult.state,requested),'confused-step-blocked','the no-move exception needs the engine log that the drawn direction was blocked');
 report.statusMovementCoreRegression=true;
 const wallView={level:1,seen:['0,0'],seenWalls:['1,0','0,1','-1,0','0,-1','1,1','-1,1','-1,-1','1,-1'],leaderId:'A',leaderPos:{x:0,y:0},team:[{id:'A',hp:10,pos:{x:0,y:0}}],enemies:[],points:[]};
 const wallMemory={known:new Set(['0,0']),tried:new Set()};
 assert.equal(nearestRevealedEdge(wallView,wallMemory),null,'drawn walls are known terrain, not unexplored edges');
 wallView.seenWalls.pop();
 assert.equal(nearestRevealedEdge(wallView,wallMemory),null,'an unknown diagonal behind two known wall sides is not treated as an exploration entrance');
 const wallRevealMemory={known:new Set(['0,0']),tried:new Set(['0,0'])};
 refreshScoutMemory({seen:['0,0'],seenWalls:['1,0']},wallRevealMemory);
 assert.ok(!wallRevealMemory.tried.has('0,0'),'newly drawn wall terrain refreshes adjacent frontier memory');
 report.wallKnowledgeRegression=true;
 const openCornerView={level:1,seen:['0,0','1,1','1,0','0,1'],seenWalls:[],leaderId:'A',leaderPos:{x:0,y:0},team:[{id:'A',hp:10,pos:{x:0,y:0}}],enemies:[],points:[]};
 assert.equal(visibleDistances(openCornerView,openCornerView.leaderPos).get('1,1'),1,'the planner can use an eight-direction step when both revealed side cells are floor');
 assert.deepEqual(nextStep(openCornerView,{x:1,y:1})?.action,{type:'move',keys:['d','s'],dx:1,dy:1},'a diagonal route becomes a real two-key input chord');
 const blockedCornerView={...openCornerView,seen:['0,0','1,1','1,0']};
 const blockedCornerDistances=visibleDistances(blockedCornerView,blockedCornerView.leaderPos);
 assert.equal(blockedCornerDistances.get('1,1'),2,'the destination remains reachable by the two legal orthogonal steps');
 assert.deepEqual(nextStep(blockedCornerView,{x:1,y:1})?.action,{type:'move',keys:['ArrowRight'],dx:1,dy:0},'nextStep must not choose the unreachable direct diagonal edge');
 const diagonalEnemy={id:'E',hp:5,asleep:false,pos:{x:1,y:1}};
 assert.equal(adjacentEnemy({...openCornerView,enemies:[diagonalEnemy]},{awakeOnly:true})?.id,'E','a visible diagonal enemy is attackable when both side cells are revealed floor');
 assert.equal(adjacentEnemy({...blockedCornerView,enemies:[diagonalEnemy]},{awakeOnly:true}),null,'a diagonal enemy is not selected through an unknown or wall corner');
 const frontierFloor=new Set(['0,0','1,0','0,-1']),frontierWalls=new Set();
 for(const k of frontierFloor){const p=fromKey(k);for(const d of directions){const candidate=posKey(add(p,d));if(!frontierFloor.has(candidate)&&candidate!=='1,-1')frontierWalls.add(candidate);}}
 const openDiagonalFrontier={...wallView,seen:[...frontierFloor],seenWalls:[...frontierWalls]};
 assert.deepEqual(nearestRevealedEdge(openDiagonalFrontier,{known:new Set(),tried:new Set()})?.pos,{x:0,y:0},'an unknown diagonal is a frontier when both side cells are revealed floor');
 const attackView={level:1,seen:['0,0','1,0','2,0'],seenWalls:[],leaderId:'A',leaderPos:{x:0,y:0},team:[{id:'A',hp:10,maxHp:10,pos:{x:0,y:0},learned:['quickattack'],pp:{quickattack:1},maxPp:{quickattack:2}}],enemies:[{id:'E',hp:10,pos:{x:2,y:0}}],points:[],items:{berry:0,tonic:0}};
 assert.deepEqual(planVisibleDamage(attackView),{type:'skill',skill:'quickattack',target:'E',targetPos:{x:2,y:0}},'a learned damaging move with PP can target a visible legal enemy');
 assert.equal(planVisibleDamage({...attackView,team:[{...attackView.team[0],pp:{quickattack:0}}]}),null,'a damaging move is not issued at zero PP');
 assert.equal(planVisibleDamage({...attackView,seen:['0,0','1,0']}),null,'an enemy outside revealed floor is never selected');
 assert.equal(planVisibleDamage({...attackView,team:[attackView.team[0],{id:'B',hp:10,pos:{x:1,y:0},learned:[],pp:{},maxPp:{}}]}),null,'a visible teammate blocks the intermediate ray cell');
 const cornerAttack={...attackView,leaderPos:{x:0,y:0},seen:['0,0','1,0','1,1'],team:[{...attackView.team[0],pos:{x:0,y:0}}],enemies:[{id:'E',hp:10,pos:{x:1,y:1}}]};
 assert.equal(planVisibleDamage(cornerAttack),null,'an unknown side floor blocks a diagonal attack ray');
 const injuredWithBerry={...attackView,team:[{...attackView.team[0],hp:5}],items:{berry:1,tonic:0}};
 assert.deepEqual(planVisibleBerry(injuredWithBerry),{type:'use',item:'berry',target:'A'});
 assert.equal(planVisibleBerry({...injuredWithBerry,items:{berry:0,tonic:0}}),null,'no berry means no item action');
 const exhaustedWithTonic={...attackView,team:[{...attackView.team[0],pp:{quickattack:0}}],items:{berry:0,tonic:1}};
 assert.deepEqual(planVisibleTonic(exhaustedWithTonic),{type:'use',item:'tonic',target:'A'},'tonic is used only for a real PP gap and a legal visible attack');
 assert.equal(planVisibleTonic({...exhaustedWithTonic,items:{berry:0,tonic:0}}),null,'no tonic means ordinary fallback remains available');
 report.visibleMoveAndSupplyRegression=true;
 report.eightDirectionAndCornerRegression=true;
 // Regression: the known corridor to a goal/shop is blocked by a distant sleeper.
 // Exhausted edges must lead toward that visible blocker, then attack when adjacent.
 for(const kind of ['goal','down']){
  const seen=['0,0','1,0','2,0','3,0'];
  const view={seen,leaderId:'A',leaderPos:{x:0,y:0},team:[{id:'A',hp:10,pos:{x:0,y:0}}],enemies:[{id:'E',hp:5,asleep:true,pos:{x:2,y:0}}],points:[{kind:'goal',pos:{x:3,y:0},used:kind==='down'},...(kind==='down'?[{kind:'down',pos:{x:3,y:0},used:false}]:[])]};
  const memory={known:new Set(seen),tried:new Set(seen)},route={purse:20};
  assert.deepEqual(planVisibleAction(view,route,memory,false),{kind:'round',action:{type:'move',keys:['ArrowRight'],dx:1,dy:0}},kind+' approaches a visible sleeping blocker');
  view.leaderPos={x:1,y:0};view.team[0].pos=view.leaderPos;
  assert.deepEqual(planVisibleAction(view,route,memory,false),{kind:'round',action:{type:'basic',targetPos:{x:2,y:0}}},kind+' attacks the now-adjacent visible blocker');
 }
 report.sleepingBlockerRegression=true;
 await page.goto(base);await page.locator('#title-new').waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('dungeon-trial.player.v1')),null);
 await page.locator('#title-new').click();await page.locator('#pick-main-'+routes.main).click();
 await page.locator('#main-next').click();await page.locator('#pick-deputy-'+routes.deputy).click();
 await page.locator('#newgame-start').click();await ready();
 assert.equal((await envelope()).profile.expeditions,0);
 const runIds=new Set();let accepted=0,learned=false,carriedIntoRun=false,trainedMove=null,trainedInst=null;
 assert.equal(routes.games.length,5);
 assert.equal(new Set(routes.games.map(g=>g.seed)).size,5,'five games must use five distinct seeds');
 for(const [index,route] of routes.games.entries()){
  gameTiming={game:index+1,seed:route.seed,startedAt:new Date().toISOString(),started:performance.now()};
  // The developer URL fixes only generation seed and preserves the freshly-created save.
  const before=await envelope();await page.goto(base+'?dev=1&seed='+route.seed);await ready();
  assert.deepEqual(await envelope(),before,'selecting a seed must not replace the player save');
  assert.deepEqual(Object.keys(before).sort(),['build','content','format','profile','rules','sequence']);assert.equal(before.profile.expeditions,index);
  assert.equal(await page.locator('#depart').isEnabled(),true);const campBytes=await raw();await click('depart');assert.equal(await raw(),campBytes,'departure retains the exact camp bytes');assert.deepEqual(await envelope(),before);
  let s=await state();assert.equal(s.dungeon.seed,route.seed);assert.ok(!runIds.has(s.runId));runIds.add(s.runId);
  if(learned){const u=Object.values(s.units).find(u=>u.inst===trainedInst);assert.ok(u?.learned.includes(trainedMove),'the next expedition actually carries the trained move');carriedIntoRun=true;}
  try{accepted+=await playRun(index,route);}
  catch(error){throw new Error('第 '+(index+1)+' 局：'+(error instanceof Error?error.message:String(error)),{cause:error});}
  s=await state();assert.equal(s.phase,'ended');assert.ok(['won','wipe'].includes(s.end.outcome));
  if(s.end.outcome==='won')assert.equal(s.end.boss,true,'victory must actually defeat the boss');
  await roundTrip('game '+(index+1)+' terminal');
  assert.equal(await state(),null);assert.equal((await envelope()).profile.expeditions,index+1);
  if(routes.training.afterGame===index+1){
   const t=routes.training,p=(await envelope()).profile;
   // A fresh save starts with an empty vault. Every available TM here was brought back through real play.
   const moves=[...new Set([t.move,...Object.keys(p.vault)])].filter(move=>p.vault[move]>0);
   const squad=[...new Set([t.inst,...p.team])].filter(inst=>p.team.includes(inst));
   if(moves.length){
    let choice;
    for(const move of moves){
     await click('tm-'+move);
     for(const inst of squad){
      const learn=page.locator('#learn-'+inst);
      // An incompatible button is clickable so the game can explain why it rejects the action.
      if((await learn.innerText()).trim().endsWith(' · 可学习')){choice={move,inst};break;}
     }
     if(choice)break;
    }
    assert.ok(choice,'real vault TMs are present but no departing member can learn them: '+moves.join(', '));
    ({move:trainedMove,inst:trainedInst}=choice);
    const unit=p.roster.find(u=>u.id===trainedInst);
    await click('learn-'+trainedInst);
    const afterLearn=(await envelope()).profile;
    assert.ok(afterLearn.roster.find(u=>u.id===trainedInst)?.learned.some(k=>k.move===trainedMove),'training actually adds the move');
    assert.equal(afterLearn.vault[trainedMove]??0,p.vault[trainedMove]-1,'training consumes exactly one of the selected TM');
    const removed=unit.carry.includes(t.removeMove)?t.removeMove:unit.carry[0];
    if(removed)await click('carry-'+trainedInst+'-'+removed);
    await click('carry-'+trainedInst+'-'+trainedMove);
    const equipped=(await envelope()).profile.roster.find(u=>u.id===trainedInst);
    assert.deepEqual(equipped?.carry,[...unit.carry.filter(move=>move!==removed),trainedMove],'the trained move replaces only the selected slot');
    report.training={inst:trainedInst,move:trainedMove,removed:removed??null,consumed:true,equipped:true};
    learned=true;
   }
  }
  await roundTrip('game '+(index+1)+' base');
  assert.equal(await state(),null);assert.equal(await page.locator('#depart').isEnabled(),true);
  report.games.push({game:index+1,seed:route.seed,runId:s.runId,rounds:s.round,outcome:s.end.outcome,bossDefeated:s.end.boss===true,replacements:replacementsInRun,effective:s.end.effective,terminalAndBaseRoundTrip:true,readyToDepart:true,startedAt:gameTiming.startedAt,durationMs:performance.now()-gameTiming.started});
  gameTiming=null;
  console.log('PASS fresh-save game',index+1,JSON.stringify(report.games.at(-1)));
 }
 assert.ok(report.games.some(g=>g.outcome==='won'&&g.bossDefeated),'the five real-input games must include a boss victory');
 assert.ok(report.games.some(g=>g.replacements>0),'the UI must exercise full-party replacement');
 assert.ok(accepted>=1);if(learned)assert.ok(carriedIntoRun);assert.equal(runIds.size,5);assert.deepEqual(errors,[]);
 await page.screenshot({path:artifactDir+'/five-games-base.png',fullPage:true});
 Object.assign(report,{accepted,learned,carriedIntoRun,pageErrors:errors,status:'PASS'});
}catch(e){report.error=String(e.stack??e);await page.screenshot({path:artifactDir+'/five-games-failure.png',fullPage:true}).catch(()=>{});throw e;}
finally{clearTimeout(deadline);report.durationMs=performance.now()-suiteStarted;if(gameTiming)report.interruptedGame={game:gameTiming.game,seed:gameTiming.seed,startedAt:gameTiming.startedAt,durationMs:performance.now()-gameTiming.started};fs.writeFileSync(artifactDir+'/five-games-results.json',JSON.stringify(report,null,2));await context.close();await browser.close();}
