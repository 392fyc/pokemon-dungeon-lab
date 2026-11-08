/* Round 5: a blessing or commission room opens its choice as soon as the leader stands on the cell (no panel with one button first); challenge and item rooms keep a short notice panel.
   TRIAL_URL=<server> node tests/browser/playtest1107-rooms.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
async function open(){
 const ctx=await b.newContext({viewport:{width:1280,height:720}});
 await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
 const p=await ctx.newPage();p.errs=[];p.on('pageerror',e=>p.errs.push(e.message));
 await p.goto(base+'/?dev=1&seed=7');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
 await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());
 return {ctx,p};
}
const room=(type,extra={})=>({room:60,type,state:'idle',doors:[],sealedCells:[],enemyIds:[],reward:null,rewardCurrency:null,item:null,rewardItem:null,rewardMove:null,...extra});
const place=(p,r)=>p.evaluate(r=>{const s=window.trial.store.world,L=s.units[s.leader];s.points=s.points.filter(q=>!(q.pos.x===L.pos.x&&q.pos.y===L.pos.y));s.shop=undefined;for(const id of s.enemies)s.units[id].waitOnly=true;s.adventureRooms=[{...r,interaction:{...L.pos}}];window.dispatchEvent(new Event('blur'));},r);
for(const [type,phase,name] of [['blessing','blessing','blessing-room'],['commission','commission','commission-room']]){
 const {ctx,p}=await open();
 await place(p,room(type));
 await p.waitForFunction(ph=>window.trial.getState().phase===ph,phase,{timeout:4000});
 assert.equal(await p.locator('#adventure-room-panel').count(),0,'no panel with a single button in between');
 assert.doesNotMatch(await p.locator('body').innerText(),/查看祝福|查看委托/);
 await p.waitForSelector('#flow:not([hidden])');
 if(type==='blessing'){
  const n=await p.locator('#flow button[id^="blessing-"]').count();assert.ok(n>=4,'three choices and a way out: '+n);   // three blessings and the give-up button
  assert.ok(await p.locator('#flow button:has-text("放弃")').count()>=1,'a give-up button');
 }else{
  assert.equal(await p.locator('#commission-accept').count(),1);assert.equal(await p.locator('#commission-reject').count(),1);
 }
 await p.waitForTimeout(300);await p.screenshot({path:out+`r5-${name}.png`});
 assert.deepEqual(p.errs,[]);await ctx.close();
}
// challenge and item rooms keep a notice panel; the challenge one lists the goal and says the reward is one of the five
{
 const {ctx,p}=await open();await place(p,room('challenge'));await p.waitForSelector('#adventure-room-panel');
 const text=await p.locator('#adventure-room-panel').innerText();
 assert.match(text,/目标[\s\S]*打倒房内全部敌人/);assert.match(text,/奖励（其一）/);assert.equal(await p.locator('#start-challenge').count(),1);
 await p.waitForTimeout(300);await p.screenshot({path:out+'r5-challenge-room.png'});await ctx.close();
}
{
 const {ctx,p}=await open();await place(p,room('item',{item:'berry'}));await p.waitForSelector('#adventure-room-panel');
 assert.equal(await p.locator('#adventure-room-panel .notice-tag').count(),0,'no tag repeating the title');assert.equal(await p.locator('#adventure-room-panel .notice-icon-img').count(),1,'icon and name, then the button');
 assert.equal(await p.locator('#take-adventure-item').count(),1);
 await p.waitForTimeout(300);await p.screenshot({path:out+'r5-item-room.png'});await ctx.close();
}
await b.close();console.log('rooms checks passed');
