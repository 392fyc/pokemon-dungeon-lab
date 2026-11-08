/* HP changes at the moment a hit lands, not when the whole round ends: the party card, the bottom bar and the map number show the old HP first and the new one while the animation is still playing.
   TRIAL_URL=<server> node tests/browser/playtest1107-hpflow.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const ctx=await b.newContext({viewport:{width:1280,height:720}});
await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(base+'/?dev=1&seed=7&anim=on');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
const info=await p.evaluate(()=>{const s=window.trial.store.world,e=s.units.w1a,L=s.units[s.leader],k=(x,y)=>x+','+y;
 const adj=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if((dx||dy)&&s.floor.some(f=>f.x===x&&f.y===y)&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===x&&u.pos.y===y))adj.push({x,y});}
 for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if(s.floor.some(f=>f.x===x&&f.y===y)&&!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}
 L.pos=adj[0];for(const id of s.queue){s.units[id].tactic='wait';if(id!==s.leader)s.units[id].pos=null;}
 e.waitOnly=false;e.asleep=false;e.tactic='gofoes';L.hp=L.maxHp=60;
 window.dispatchEvent(new Event('blur'));window.trial.repaint(s);return {leader:s.leader,before:60};});
await p.waitForTimeout(500);
const bottomHp=()=>p.evaluate(()=>document.querySelector('#hud-bottom')?.innerText.match(/HP\s*(\d+)\/(\d+)/)?.[1]??null);
const cardHp=id=>p.evaluate(i=>document.querySelector('#unit-card-'+i)?.innerText.match(/(\d+)\/(\d+)/)?.[1]??null,id);
await p.keyboard.press('.');   // wait: the enemy hits back
const samples=[];
for(let i=0;i<60;i++){samples.push({anim:await p.evaluate(()=>window.trial.animating()),card:await cardHp(info.leader),bottom:await bottomHp()});if(!samples.at(-1).anim&&i>3)break;await p.waitForTimeout(30);}
await p.waitForFunction(()=>!window.trial.animating(),null,{timeout:6000});
const final=await p.evaluate(id=>window.trial.getState().units[id].hp,info.leader);
assert.ok(final<60,'the enemy hurt the leader');
const during=samples.filter(s=>s.anim);
assert.ok(during.some(s=>Number(s.card)===60&&Number(s.bottom)===60),'while the animation starts the party card and the bottom bar still show the old HP: '+JSON.stringify(during.slice(0,4)));
assert.ok(during.some(s=>Number(s.card)===final&&Number(s.bottom)===final),'and both show the new HP while the animation is still playing, when the hit lands: '+JSON.stringify(during.slice(-4)));
assert.equal(Number(await cardHp(info.leader)),final);
// poison damage (like recoil and drain) also moves the HP when it happens, not at the end of the round. A mutation observer records every change of the card's HP together with whether the animation was still playing, so the check does not depend on polling speed.
await p.evaluate(({leader})=>{const s=window.trial.store.world;for(const id of s.enemies)s.units[id].waitOnly=true;const L=s.units[leader];L.hp=L.maxHp=60;L.status={psn:{tick:1,left:5}};window.dispatchEvent(new Event('blur'));window.trial.repaint(s);
 window.__hpLog=[];const read=()=>document.querySelector('#unit-card-'+leader)?.innerText.match(/(\d+)\/(\d+)/)?.[1]??null;
 window.__hpLog.push({a:false,v:read()});new MutationObserver(()=>{const v=read(),last=window.__hpLog.at(-1);if(!last||last.v!==v)window.__hpLog.push({a:window.trial.animating(),v});}).observe(document.querySelector('#party'),{subtree:true,childList:true,characterData:true});},info);
await p.waitForTimeout(400);
await p.keyboard.press('.');
await p.waitForFunction(()=>!window.trial.animating(),null,{timeout:6000});await p.waitForTimeout(200);
const after=await p.evaluate(id=>window.trial.getState().units[id].hp,info.leader),log=await p.evaluate(()=>window.__hpLog);
assert.ok(after<60,'the poison hurt the leader');
const first=log.findIndex(e=>Number(e.v)===60),moved=log.findIndex(e=>Number(e.v)===after);
assert.ok(first>=0&&moved>first,'the card shows the old HP first and the new one later: '+JSON.stringify(log));
assert.equal(log[moved].a,true,'and the change comes while the animation is still playing, not after it: '+JSON.stringify(log));
assert.deepEqual(errs,[]);await b.close();console.log('hp flow checks passed');
