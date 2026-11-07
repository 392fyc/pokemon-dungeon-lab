/* Playtest 1107 browser check (stand-alone: TRIAL_URL=<dev server> node tests/browser/playtest1107-sleep.mjs). Dev scenario state is edited through window.trial.store.world. */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const ctx=await b.newContext({viewport:{width:1280,height:720}});
await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;});
const p=await ctx.newPage();p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto(base+'/?dev=1&seed=7&anim=on');
await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view());
await p.evaluate(()=>{const s=window.trial.store.world;const e=s.units.w1a;const k=(x,y)=>x+','+y;
 for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if(s.floor.some(f=>f.x===x&&f.y===y)&&!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}
 s.units[s.leader].pos={x:e.pos.x+2,y:e.pos.y};e.asleep=true;s.units.w1e.asleep=true;window.dispatchEvent(new Event('blur'));});
await p.waitForTimeout(500);
const snap=()=>p.evaluate(()=>{const u=window.trial.view().units.w1a;return {n:u.sleepMarks.length,marks:u.sleepMarks.map(m=>[m.text,Math.round(m.x),Math.round(m.y),+m.alpha.toFixed(2)]),paused:u.spritePaused};});
const a=await snap();await p.waitForTimeout(700);const c=await snap();console.log(JSON.stringify(a),JSON.stringify(c));
assert.equal(a.n,3);assert.notDeepEqual(a.marks,c.marks);assert.ok(a.paused);
await p.screenshot({path:out+'sleep-z-animated.png',clip:{x:560,y:200,width:400,height:260}});
await p.evaluate(()=>{const s=window.trial.store.world;s.units.w1a.asleep=false;window.dispatchEvent(new Event('blur'));});await p.waitForTimeout(300);
const d=await snap();console.log('after wake',JSON.stringify(d));assert.equal(d.n,0);assert.equal(d.paused,false);
console.log('temp objects',await p.evaluate(()=>window.trial.view().temporaryObjects));
await b.close();
