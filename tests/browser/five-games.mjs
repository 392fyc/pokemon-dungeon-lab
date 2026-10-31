// Planning sees only revealed walkable cells, revealed points, revealed enemies, and our own team.
// Hidden cells, enemy data outside revealed cells, and unknown points are not supplied to the planner.
// Game actions still go through keyboard input, canvas clicks, or visible buttons.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const artifactDir='.artifacts/trial';
fs.mkdirSync('.artifacts/visible-routes-99',{recursive:true});
fs.mkdirSync(artifactDir,{recursive:true});
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TRIAL_URL;
if(!base)throw Error('Set TRIAL_URL.');
const routes=JSON.parse(fs.readFileSync(new URL('./five-game-routes.json',import.meta.url),'utf8'));
const browser=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true,timeout:15000});
const report={platform:process.platform,browser:await browser.version(),url:base,visibleInfoOnly:true,games:[],status:'FAIL'};
const deadline=setTimeout(()=>void browser.close(),8*60*1000);
const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
await context.addInitScript(()=>{window.__trialNoAnim=true;});
const page=await context.newPage(),errors=[];
page.setDefaultTimeout(15000);
page.on('pageerror',e=>errors.push(e.message));
page.on('requestfailed',r=>errors.push(r.url()));
page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());});
const ready=()=>page.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
const state=()=>page.evaluate(()=>window.trial.getState());
const envelope=()=>page.evaluate(()=>window.trial.store.envelope);
const raw=()=>page.evaluate(()=>localStorage.getItem(window.trial.store.key));
const click=async id=>{await page.locator('#'+id).click();await ready();};
async function cell(pos){
 await page.waitForTimeout(400);   // let the camera finish following before converting a cell to pixels
 const camera=await page.evaluate(()=>window.trial.camera()),box=await page.locator('canvas').boundingBox();
 const x=(pos.x*40+20-camera.x)*box.width/680,y=(pos.y*40+20-camera.y)*box.height/350;
 assert.ok(x>=0&&x<box.width&&y>=0&&y<box.height,'target must be visible on canvas');
 await page.mouse.move(box.x+x,box.y+y);await page.waitForTimeout(150);   // Phaser maps the pointer to world coordinates once per frame
 await page.mouse.click(box.x+x,box.y+y);await ready();
}

// This projection is the only input accepted by the route planner. A point or enemy
// is copied only when its position is in seen; the planner never receives the raw state.
function visibleView(s){
 const seen=new Set(s.seen);
 const team=s.queue.map(id=>{
  const u=s.units[id];
  return {id,hp:u?.hp??0,pos:u?.pos?{x:u.pos.x,y:u.pos.y}:null};
 });
 const enemies=s.enemies.map(id=>{
  const u=s.units[id];
  if(!u||!u.pos||!seen.has(u.pos.x+','+u.pos.y)||u.hp<=0)return null;
  return {id,pos:{x:u.pos.x,y:u.pos.y},hp:u.hp,asleep:!!u.asleep};
 }).filter(Boolean);
 const points=s.points.filter(p=>seen.has(p.pos.x+','+p.pos.y))
  .map(p=>({kind:p.kind,pos:{x:p.pos.x,y:p.pos.y},used:!!p.used}));
 const leader=team.find(u=>u.id===s.leader);
 return {seen:[...seen],team,leaderId:s.leader,leaderPos:leader?.pos??null,enemies,points};
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
  return;
 }
 if(c.type==='buy'){await click('buy-'+c.item);return;}
 assert.equal(c.type,'round');
 const a=c.action;
 if(a.type==='move'){
  assert.ok(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(a.key));
  await page.keyboard.press(a.key);await ready();
 }else if(a.type==='basic')await cell(a.targetPos);
 else if(a.type==='skill'){await click('skill-'+a.skill);await cell(a.targetPos);}
 else if(a.type==='wait')await click('wait');
 else if(a.type==='swap'){await click('swap');await click('partner-'+a.target);await click('submit');}
 else if(a.type==='use'){await click('use-'+a.item);await click('item-target-'+a.target);}
 else if(a.type==='rest')await click('rest');
 else if(a.type==='interact'){
  if(a.exit){await click('take-exit');await click('exit-confirm');}else await click('take');
 }else throw Error('Unsupported route action '+JSON.stringify(a));
 const after=await state();
 assert.ok(after.round>c.beforeRound,'UI action must advance a complete round; visible state: '+JSON.stringify(visibleView(after)));
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
 {dx:1,dy:0,key:'ArrowRight'},
 {dx:0,dy:1,key:'ArrowDown'},
 {dx:-1,dy:0,key:'ArrowLeft'},
 {dx:0,dy:-1,key:'ArrowUp'}
];
const posKey=p=>p.x+','+p.y;
const manhattan=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const fromKey=k=>{const [x,y]=k.split(',').map(Number);return {x,y};};
const add=(p,d)=>({x:p.x+d.dx,y:p.y+d.dy});
function refreshScoutMemory(view,memory){
 const now=new Set(view.seen);
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
   if(!floor.has(k)||blocked.has(k)||distance.has(k))continue;
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
 const blocked=new Set(view.enemies.map(e=>posKey(e.pos)));
 const options=directions.map(d=>({d,p:add(start,d),k:posKey(add(start,d))}))
  .filter(o=>distances.has(o.k)&&!blocked.has(o.k)&&distances.get(o.k)<currentDistance)
  .sort((a,b)=>distances.get(a.k)-distances.get(b.k));
 if(!options.length)return null;
 const first=options[0];
 const ally=view.team.find(u=>u.id!==view.leaderId&&u.hp>0&&u.pos&&posKey(u.pos)===first.k);
 return ally?{action:{type:'swap',target:ally.id}}:{action:{type:'move',key:first.d.key}};
}
function nearestRevealedEdge(view,memory){
 const start=view.leaderPos;
 if(!start)return null;
 const floor=new Set(view.seen),distances=visibleDistances(view,start),edges=[];
 for(const k of view.seen){
  if(memory.tried.has(k)||!distances.has(k))continue;
  const p=fromKey(k);
  if(!directions.some(d=>!floor.has(posKey(add(p,d)))))continue;
  edges.push({pos:p,key:k,distance:distances.get(k)});
 }
 edges.sort((a,b)=>a.distance-b.distance||a.pos.y-b.pos.y||a.pos.x-b.pos.x);
 return edges[0]??null;
}
function adjacentEnemy(view,{awakeOnly=false}={}){
 if(!view.leaderPos)return null;
 return view.enemies.filter(e=>manhattan(view.leaderPos,e.pos)===1&&(!awakeOnly||!e.asleep))
  .sort((a,b)=>a.hp-b.hp||a.pos.y-b.pos.y||a.pos.x-b.pos.x)[0]??null;
}
function planVisibleAction(view,route,memory,shopBought){
 // Combat uses only enemies whose positions are already in the revealed-cell set.
 const awake=adjacentEnemy(view,{awakeOnly:true});
 if(awake)return {kind:'round',action:{type:'basic',targetPos:awake.pos}};
 const visibleGoal=view.points.find(p=>p.kind==='goal');
 if(!visibleGoal){
  const edge=nearestRevealedEdge(view,memory);
  return edge?{kind:'scout',edge}:null;
 }
 if(!visibleGoal.used){
  if(posKey(view.leaderPos)===posKey(visibleGoal.pos))return {kind:'round',action:{type:'interact',exit:false}};
  const step=nextStep(view,visibleGoal.pos);
  if(step?.arrived)return {kind:'round',action:{type:'interact',exit:false}};
  if(step)return {kind:'round',action:step.action};
  const blocked=adjacentEnemy(view);
  return blocked?{kind:'round',action:{type:'basic',targetPos:blocked.pos}}:{kind:'round',action:{type:'wait'}};
 }
 if(route.purse>0&&!shopBought){
  const shop=view.points.find(p=>p.kind==='shop');
  if(shop){
   if(posKey(view.leaderPos)===posKey(shop.pos))return {kind:'buy',item:'tm'};
   const step=nextStep(view,shop.pos);
   if(step?.arrived)return {kind:'buy',item:'tm'};
   if(step)return {kind:'round',action:step.action};
   const blocked=adjacentEnemy(view);
   return blocked?{kind:'round',action:{type:'basic',targetPos:blocked.pos}}:{kind:'round',action:{type:'wait'}};
  }
  const edge=nearestRevealedEdge(view,memory);
  if(edge)return {kind:'scout',edge};
 }
 const exit=view.points.find(p=>p.kind==='exit');
 if(exit){
  if(posKey(view.leaderPos)===posKey(exit.pos))return {kind:'round',action:{type:'interact',exit:true}};
  const step=nextStep(view,exit.pos);
  if(step?.arrived)return {kind:'round',action:{type:'interact',exit:true}};
  if(step)return {kind:'round',action:step.action};
 }
 const edge=nearestRevealedEdge(view,memory);
 return edge?{kind:'scout',edge}:null;
}
let acceptedInRun=0;
async function playRun(index,route){
 acceptedInRun=0;
 const memory={known:new Set(),tried:new Set()};
 let shopBought=false,roundActions=0;
 const maxActions=200;
 while(roundActions<maxActions){
  const s=await state();
  if(s.phase==='ended')return acceptedInRun;
  if(s.phase==='invitation'){
   const view=visibleView(s);
   const choice=view.team.length<3?'accept':'reject';
   await command({type:'invite',choice});
   if(choice==='accept')acceptedInRun++;
   continue;
  }
  assert.equal(s.phase,'playing','game must remain playable while routing');
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
   const before=new Set(view.seen);
   await command({type:'round',action:step.action,beforeRound:s.round});
   roundActions++;
   const after=visibleView(await state());
   refreshScoutMemory(after,memory);
   const newCell=after.seen.some(k=>!before.has(k));
   if(after.leaderPos&&posKey(after.leaderPos)===plan.edge.key&&!newCell)memory.tried.add(plan.edge.key);
   continue;
  }
  await command({type:'round',action:plan.action,beforeRound:s.round});
  roundActions++;
 }
 const last=visibleView(await state());
 throw Error('单局超过 '+maxActions+' 个真实回合动作上限；可见状态：'+JSON.stringify(last));
}

try{
 await page.goto(base);await page.locator('#title-new').waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('dungeon-trial.player.v1')),null);
 await page.locator('#title-new').click();await page.locator('#pick-main-'+routes.main).click();
 await page.locator('#main-next').click();await page.locator('#pick-deputy-'+routes.deputy).click();
 await page.locator('#newgame-start').click();await ready();
 assert.equal((await envelope()).profile.expeditions,0);
 const runIds=new Set();let accepted=0,learned=false,carriedIntoRun=false,trainedMove=null;
 assert.equal(routes.games.length,5);
 for(const [index,route] of routes.games.entries()){
  // The developer URL fixes only generation seed and preserves the freshly-created save.
  const before=await envelope();await page.goto(base+'?dev=1&seed='+route.seed);await ready();
  assert.deepEqual(await envelope(),before,'selecting a seed must not replace the player save');
  assert.deepEqual(Object.keys(before).sort(),['build','content','format','profile','rules','sequence']);assert.equal(before.profile.expeditions,index);
  for(let n=0;n<route.purse/20;n++)await click('purse-up');
  assert.equal(Number(await page.locator('#purse-value').innerText()),route.purse);
  assert.equal(await page.locator('#depart').isEnabled(),true);const campBytes=await raw();await click('depart');assert.equal(await raw(),campBytes,'departure retains the exact camp bytes');assert.deepEqual(await envelope(),before);
  let s=await state();assert.equal(s.dungeon.seed,route.seed);assert.ok(!runIds.has(s.runId));runIds.add(s.runId);
  if(learned){const u=Object.values(s.units).find(u=>u.inst===routes.training.inst);assert.ok(u.learned.includes(trainedMove));carriedIntoRun=true;}
  try{accepted+=await playRun(index,route);}
  catch(error){throw new Error('第 '+(index+1)+' 局：'+(error instanceof Error?error.message:String(error)),{cause:error});}
  s=await state();assert.equal(s.phase,'ended');assert.equal(s.end.outcome,'normal');assert.equal(s.end.effective,true);
  await roundTrip('game '+(index+1)+' terminal');
  assert.equal(await state(),null);assert.equal((await envelope()).profile.expeditions,index+1);
  if(routes.training.afterGame===index+1){
   const t=routes.training,p=(await envelope()).profile;
   // The bought machine is defined by the visible shop action; its draw may vary by the locked game data.
   trainedMove=Object.keys(p.vault).find(m=>p.vault[m]>0);assert.ok(trainedMove,'the bought machine reached the vault');
   assert.ok(!p.roster.find(u=>u.id===t.inst).learned.some(k=>k.move===trainedMove));
   const removeMove=p.roster.find(u=>u.id===t.inst).carry[0];
   await click('tm-'+trainedMove);await click('learn-'+t.inst);
   await click('carry-'+t.inst+'-'+removeMove);await click('carry-'+t.inst+'-'+trainedMove);
   assert.ok((await envelope()).profile.roster.find(u=>u.id===t.inst).carry.includes(trainedMove));learned=true;
  }
  await roundTrip('game '+(index+1)+' base');
  assert.equal(await state(),null);assert.equal(await page.locator('#depart').isEnabled(),true);
  report.games.push({game:index+1,seed:route.seed,runId:s.runId,rounds:s.round,outcome:s.end.outcome,effective:s.end.effective,terminalAndBaseRoundTrip:true,readyToDepart:true});
  console.log('PASS fresh-save game',index+1,JSON.stringify(report.games.at(-1)));
 }
 assert.ok(accepted>=1);assert.ok(learned);assert.ok(carriedIntoRun);assert.equal(runIds.size,5);assert.deepEqual(errors,[]);
 await page.screenshot({path:artifactDir+'/five-games-base.png',fullPage:true});
 Object.assign(report,{accepted,learned,carriedIntoRun,pageErrors:errors,status:'PASS'});
}catch(e){report.error=String(e.stack??e);throw e;}
finally{clearTimeout(deadline);fs.writeFileSync(artifactDir+'/five-games-results.json',JSON.stringify(report,null,2));await context.close();await browser.close();}
