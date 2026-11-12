/* Immunity is a hit that does nothing, not a miss: the move is shown arriving, the target neither flashes nor is pushed, and "没有效果" floats over it.
   TRIAL_URL=<server> node tests/browser/playtest1107-immune.mjs */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.SHOT_DIR||'.artifacts/trial/';
const base=process.env.TRIAL_URL;if(!base)throw Error('Set TRIAL_URL to the local running trial.');
const b=await chromium.launch({...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{channel:'msedge'}),headless:true});
const ctx=await b.newContext({viewport:{width:1280,height:720}});
await ctx.addInitScript(()=>{window.__trialNoAutoSleep=true;});
const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(base+'/?dev=1&seed=7&anim=on');await p.locator('#config').selectOption('expedition');await p.locator('#start').click();
await p.waitForFunction(()=>window.trial?.store.status==='ready'&&window.trial.view()&&window.trial.spritesReady());
const target=await p.evaluate(()=>{const s=window.trial.store.world,e=s.units.w1a,L=s.units[s.leader],k=(x,y)=>x+','+y;
 const adj=[];for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if((dx||dy)&&s.floor.some(f=>f.x===x&&f.y===y)&&!Object.values(s.units).some(u=>u.pos&&u.pos.x===x&&u.pos.y===y))adj.push({x,y});}
 for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){const x=e.pos.x+dx,y=e.pos.y+dy;if(s.floor.some(f=>f.x===x&&f.y===y)&&!s.seen.includes(k(x,y)))s.seen.push(k(x,y));}
 L.pos=adj[0];e.species='geodude';e.entrySpecies='geodude';e.hp=e.maxHp=60;e.asleep=false;e.waitOnly=true;
 for(const id of s.queue){s.units[id].tactic='wait';if(id!==s.leader)s.units[id].pos=null&&s.units[id].pos;}
 L.learned=['thunderbolt'];L.pp={thunderbolt:5};L.maxPp={thunderbolt:5};
 window.dispatchEvent(new Event('blur'));window.trial.repaint(s);return {hp:e.hp};});
await p.waitForTimeout(400);
await p.locator('#skill-thunderbolt, [data-hud-skill="thunderbolt"]').first().click();
// an around move needs no aim: confirm by the key if the card is armed, else click the enemy
const pt=await p.evaluate(()=>{const v=window.trial.view().units.w1a,c=window.trial.camera();return {x:v.x-c.x,y:v.y-c.y-20};});
await p.mouse.move(pt.x,pt.y);await p.waitForTimeout(150);
const shots=[];
await p.mouse.click(pt.x,pt.y);
for(let i=0;i<14;i++){await p.waitForTimeout(20);shots.push(await p.screenshot({clip:{x:430,y:170,width:520,height:360}}));}   // the float lives for a few hundred ms after the effect lands
await p.waitForFunction(()=>!window.trial.animating(),null,{timeout:8000});
const s=await p.evaluate(()=>window.trial.getState());
assert.equal(s.units.w1a.hp,60,'the immune enemy took nothing');
assert.ok((s.events??[]).some(e=>e.type==='immune'&&e.target==='w1a'&&e.skill==='thunderbolt'),'the round carries an immune event');
assert.ok(!(s.events??[]).some(e=>e.type==='miss'&&e.target==='w1a'),'and no miss');
assert.equal(s.units[s.leader].pp.thunderbolt,4,'PP is spent');
const {writeFileSync}=await import('node:fs');
shots.forEach((buf,i)=>writeFileSync(out+`immune-float-${i}.png`,buf));
assert.deepEqual(errs,[]);await b.close();console.log('immune checks passed');
