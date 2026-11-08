/* Round 5: the stairs. The icon has no caption; standing on the stairs opens one question with two buttons; "不前进" leaves a small button in the bottom bar that reopens it; "前进" is the same round as before (interact with exit).
   TRIAL_URL=<server> node tests/browser/playtest1107-stairs.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const ctx=await b.newContext({viewport:{width:1280,height:720}});
await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;window.__trialNoAnim=true;});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(base+'/?dev=1&seed=7');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
const info=await p.evaluate(()=>{const s=window.trial.store.world,L=s.units[s.leader],k=(x,y)=>x+','+y;const st=s.points.find(q=>q.kind==='down');
 for(let dx=-3;dx<=3;dx++)for(let dy=-3;dy<=3;dy++){const x=st.pos.x+dx,y=st.pos.y+dy;if(s.floor.some(f=>f.x===x&&f.y===y)&&!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}
 for(const id of s.enemies)s.units[id].waitOnly=true;for(const id of s.queue)if(id!==s.leader)s.units[id].pos=null;
 // stand one cell away first (the map picture without the leader on the stairs), then step on
 const near=s.floor.find(f=>Math.max(Math.abs(f.x-st.pos.x),Math.abs(f.y-st.pos.y))===1&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===f.x&&u.pos.y===f.y));
 L.pos=near;window.dispatchEvent(new Event('blur'));window.trial.repaint(s);return {stairs:st.pos,near,level:s.dungeon.level};});
await p.waitForTimeout(400);
assert.equal(await p.locator('#stairs-prompt').count(),0,'no prompt off the stairs');assert.equal(await p.locator('#stairs-reopen').count(),0);
await p.screenshot({path:out+'r5-stairs-map.png'});
// step onto the stairs with the real key
const dx=info.stairs.x-info.near.x,dy=info.stairs.y-info.near.y,key=dy===1?'s':dy===-1?'w':dx===1?'d':'a';
const dir=Math.abs(dx)+Math.abs(dy)===2?null:key;
if(dir)await p.keyboard.press(dir);else await p.evaluate(({st})=>{const s=window.trial.store.world;s.units[s.leader].pos=st;window.dispatchEvent(new Event('blur'));},{st:info.stairs});
await p.waitForSelector('#stairs-prompt',{timeout:4000});
const text=(await p.locator('#stairs-prompt').innerText()).replace(/\s+/g,' ').trim();
assert.equal(text,'要前进到下一层吗？ 前进 不前进','one question and two buttons, nothing else');
assert.doesNotMatch(await p.locator('body').innerText(),/请求跨层|消耗操控者行动|确认本轮跨层|继续查看|走下楼梯（/);
await p.waitForTimeout(300);await p.screenshot({path:out+'r5-stairs-prompt.png'});
// not now: the prompt closes and a button in the bottom bar reopens it; leaving the cell removes the button
await p.locator('#stairs-stay').click();assert.equal(await p.locator('#stairs-prompt').count(),0);
assert.equal(await p.locator('#stairs-reopen').innerText(),'楼梯');
await p.locator('#stairs-reopen').click();assert.equal(await p.locator('#stairs-prompt').count(),1,'the button reopens the prompt');
await p.locator('#stairs-stay').click();
await p.evaluate(({near})=>{const s=window.trial.store.world;s.units[s.leader].pos=near;window.dispatchEvent(new Event('blur'));},info);await p.waitForTimeout(300);
assert.equal(await p.locator('#stairs-reopen').count(),0,'off the stairs there is no button');assert.equal(await p.locator('#stairs-prompt').count(),0);
// forward: the same interact-with-exit round as before; the log says it plainly
await p.evaluate(({stairs})=>{const s=window.trial.store.world;s.units[s.leader].pos=stairs;window.dispatchEvent(new Event('blur'));},info);
await p.waitForSelector('#stairs-prompt');const round=await p.evaluate(()=>window.trial.getState().round);
await p.locator('#stairs-go').click();
await p.waitForFunction(l=>window.trial.getState().dungeon?.level>l&&window.trial.getState().phase==='playing',info.level,{timeout:8000});
const after=await p.evaluate(()=>window.trial.getState());
assert.equal(after.dungeon.level,info.level+1);assert.ok(after.round>round);
assert.ok(after.log.some(l=>/走下楼梯$/.test(l)),'the log says the leader took the stairs: '+JSON.stringify(after.log.slice(-6)));
assert.ok(!after.log.some(l=>/请求下楼梯跨层/.test(l)));
// the way back: an up staircase asks about going back, with matching button words
{const up=await p.evaluate(()=>{const s=window.trial.store.world;const spot=s.floor.find(f=>!s.points.some(q=>q.pos.x===f.x&&q.pos.y===f.y)&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===f.x&&u.pos.y===f.y));const q={pos:spot,kind:'up',used:false};s.points.push(q);for(const id of s.enemies)s.units[id].waitOnly=true;s.units[s.leader].pos=q.pos;window.dispatchEvent(new Event('blur'));return q.pos;});
 if(up){await p.waitForSelector('#stairs-prompt',{timeout:4000});assert.equal((await p.locator('#stairs-prompt').innerText()).replace(/\s+/g,' ').trim(),'要回到上一层吗？ 返回 不返回','up stairs ask about going back');}
}
assert.deepEqual(errs,[]);await b.close();console.log('stairs checks passed');
