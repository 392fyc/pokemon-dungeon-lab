import test from 'node:test';
import assert from 'node:assert/strict';
import {createExpedition,createMain,PROG,RULE_VERSION,CONTENT_VERSION} from '../../src/core/engine.ts';
import {initialProfile,newGameProfile,profileProblem} from '../../src/core/base.ts';
import {TrialStore,BUILD_ID} from '../../src/core/save.ts';
import {ECON} from '../../src/core/economy.ts';

/*
 * Stage 6.6 (automatic part): full-loop soak.
 * One deterministic bot plays real expeditions through a real TrialStore (in-memory storage port):
 *   base -> depart -> expedition (until ended or the round cap) -> return to base -> learn / carry / team -> depart again.
 * The bot sees only what a player sees: revealed floor cells, units, points and the backpack. It never reads hidden terrain.
 * Every accepted step is read back through a brand-new TrialStore and compared with deepEqual; every rejected command must leave state and bytes unchanged.
 * Statistics are printed, never asserted (this is a soak, not a balance test). Specification: docs/项目框架/阶段6—完整循环自测报告.md.
 */
const SEEDS=+(process.env.SOAK_SEEDS??30),GAMES=3,ROUND_CAP=400,COMMAND_CAP=1500;
const key=p=>`${p.x},${p.y}`;
const DIRS=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const dist=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const same=(a,b)=>!!a&&!!b&&a.x===b.x&&a.y===b.y;
const aliveU=u=>!!u&&u.hp>0&&u.pos!==null;
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>{m.set(k,v);},map:m};};

/* ---------- invariants ---------- */
function checkWorld(s,where){
 const at=`${where} (${s.runId} round ${s.round} phase ${s.phase})`;
 assert.ok(s.queue.length>=1&&s.queue.length<=3,`${at}: queue size ${s.queue.length}`);
 assert.ok(s.queue.includes(s.leader),`${at}: leader not in queue`);
 assert.ok(s.phase==='ended'||aliveU(s.units[s.leader]),`${at}: leader fallen while the run continues`);
 const cells=new Set(s.floor.map(key)),taken=new Map();
 for(const [id,u] of Object.entries(s.units)){
  assert.ok(u.hp>=0&&u.hp<=u.maxHp,`${at}: ${id} hp ${u.hp}/${u.maxHp}`);
  for(const [k,n] of Object.entries(u.pp))assert.ok(n>=0&&n<=u.maxPp[k],`${at}: ${id} pp ${k} ${n}/${u.maxPp[k]}`);
  if(u.hp===0)assert.equal(u.pos,null,`${at}: fallen ${id} still on the map`);
 }
 for(const id of [...s.queue,...s.enemies]){const u=s.units[id];if(!aliveU(u))continue;
  assert.ok(cells.has(key(u.pos)),`${at}: ${id} stands off the floor`);
  assert.ok(!taken.has(key(u.pos)),`${at}: ${id} overlaps ${taken.get(key(u.pos))} at ${key(u.pos)}`);taken.set(key(u.pos),id);}
 assert.ok(s.bag>=0,`${at}: bag ${s.bag}`);
 assert.ok(s.prog.level>=1&&s.prog.level<=PROG.maxLevel,`${at}: level ${s.prog.level}`);
 assert.ok(s.prog.items.berry>=0&&s.prog.items.tonic>=0,`${at}: negative item count`);
 assert.equal(s.queue.filter(id=>s.camp.includes(id)).length,0,`${at}: member both in queue and camp`);
}
function checkEnvelope(env,where){
 if(env.current)checkWorld(env.current,where);
 if(env.recent)assert.equal(env.recent.phase,'ended',`${where}: recent is not an ended run`);
 if(env.profile)assert.equal(profileProblem(env.profile),null,`${where}: profile fails validation`);
 else assert.ok(env.current,`${where}: no profile and no run`);
}
/** After every accepted write: a fresh store reading the same storage must hold exactly what the writing store holds. */
function roundTrip(port,store,where){
 assert.equal(store.status,'ready',`${where}: store not ready (${store.error})`);
 const re=new TrialStore(port);
 assert.equal(re.status,'ready',`${where}: reload ${re.status} ${re.error}`);
 assert.deepEqual(re.envelope,store.envelope,`${where}: reloaded record differs`);
 checkEnvelope(re.envelope,where);
}

/* ---------- the bot ---------- */
const stats=()=>({wipes:0,lostPartners:0,paid:0,returned:0,goneForGood:0,bought:0,exchanged:0,doomedWipes:0,invites:0,accepted:0,rejected:0,swapped:0,levelUps:0,tmGot:0,tmBrought:0,transits:0,cancelledTransits:0,berries:0,tonics:0,rests:0,guards:0,lines:0,switches:0,declined:0,rejections:0,probes:0,learned:0});
const adjacentEnemies=s=>s.enemies.map(i=>s.units[i]).filter(u=>aliveU(u)&&dist(u.pos,s.units[s.leader].pos)===1);
function ppDeficit(u){return u.learned.some(k=>(u.pp[k]??0)<(u.maxPp[k]??0));}
/** BFS over revealed floor cells only. Allies and enemies do not block the search (the bot swaps with allies and attacks enemies in the way). */
function route(s,from,wanted){
 const seen=new Set(s.seen),first=new Map([[key(from),null]]),len=new Map([[key(from),0]]),q=[from];
 for(let i=0;i<q.length;i++){const cur=q[i];
  if(len.get(key(cur))>0&&wanted(cur))return {to:cur,step:first.get(key(cur)),len:len.get(key(cur))};
  for(const d of DIRS){const p={x:cur.x+d.x,y:cur.y+d.y};if(!seen.has(key(p))||first.has(key(p)))continue;
   first.set(key(p),first.get(key(cur))??p);len.set(key(p),len.get(key(cur))+1);q.push(p);}}
 return null;
}
const affordable=s=>s.shop&&s.dungeon.level===s.shop.level?['berry','tonic','tm'].filter(i=>(i==='tm'?s.shop.stock.tm!==null:s.shop.stock[i]>0)&&s.purse>=ECON.price[i]):[];
/** Where the bot wants to go: the plan is goal G on floor 1, then T on floor 2, then back up and out; cheap pickups on the way. */
function objective(s,memo){
 const L=s.units[s.leader],level=s.dungeon.level,seen=new Set(s.seen);
 const pts=s.points.filter(p=>seen.has(key(p.pos)));
 const near=(kinds,max)=>{let best=null;for(const p of pts){if(!kinds.includes(p.kind)||p.used||memo.declined.has(`${level}:${key(p.pos)}`))continue;
   const r=route(s,L.pos,c=>same(c,p.pos));const d=same(L.pos,p.pos)?0:r?.len;if(d===undefined||d>max)continue;if(!best||d<best.d)best={p,d};}return best?.p;};
 const members=s.queue.map(i=>s.units[i]).filter(aliveU);
 const pick=near(["berry","tonic",...(affordable(s).length?['shop']:[]),...(s.exchange&&!s.exchange.used&&memo.useExchange?['exchange']:[])],8)??(members.some(m=>ppDeficit(m))||members.some(m=>m.hp<m.maxHp)?near(["rest"],6):undefined);
 if(pick)return pick;
 let want;
 if(level===1)want=!s.goal?'goal':s.bag>0?'exit':'down';else want=s.bag===0?'item':'up';
 return pts.find(p=>p.kind===want&&(want!=='goal'&&want!=='item'||!p.used))||null;
}
function stepToward(s,memo,target){
 const L=s.units[s.leader];
 const r=target?route(s,L.pos,c=>same(c,target.pos)):null;
 const visited=memo.visited[s.dungeon.level]??=new Set();
 const go=r??route(s,L.pos,c=>!visited.has(key(c)));
 if(!go)return null;
 const occ=[...s.queue,...s.enemies].map(i=>s.units[i]).find(u=>aliveU(u)&&same(u.pos,go.step));
 if(!occ)return {type:'move',to:go.step};
 if(occ.side==='enemy')return {type:'basic',target:occ.id};
 return {type:'swap',target:occ.id};
}
/** Ordered list of commands; the driver sends them in order and keeps the first one the rules accept. */
function candidates(s,memo){
 const L=s.units[s.leader],out=[];(memo.visited[s.dungeon.level]??=new Set()).add(key(L.pos));
 const members=s.queue.map(i=>s.units[i]).filter(aliveU);
 const low=u=>u.hp/u.maxHp;
 // switch the lead to a much healthier member (cooldown 6 rounds)
 const healthiest=members.filter(m=>m.id!==L.id).sort((a,b)=>low(b)-low(a))[0];
 if(!memo.reckless&&healthiest&&low(L)<=0.34&&low(healthiest)-low(L)>=0.3&&s.round-memo.lastSwitch>=6)out.push({type:'switch',actor:healthiest.id});
 const act=a=>out.push({type:'round',action:a});
 const here=s.points.find(p=>same(p.pos,L.pos));
 if(!memo.doomed&&here?.kind==='shop')for(const item of affordable(s))out.push({type:'buy',item});
 if(!memo.doomed&&here?.kind==='exchange'&&s.exchange&&!s.exchange.used&&memo.useExchange){
  const mates=members.filter(m=>m.id!==L.id).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp);
  if(mates.length)act({type:'exchange',target:mates[0].id,cargo:s.tms.map((t,i)=>[t,i]).filter(([t])=>t.fate==='held').slice(0,2).map(([,i])=>i)});
 }
 if(memo.doomed&&memo.suicidal){ // after the tide has turned: walk to the nearest enemy and stand still next to it
  const adj0=adjacentEnemies(s);
  if(adj0.length){act({type:'wait'});}
  else{const foes=s.enemies.map(i=>s.units[i]).filter(u=>aliveU(u)&&s.seen.includes(key(u.pos)));
   const r=foes.length?route(s,L.pos,c=>foes.some(e=>same(e.pos,c))):null;
   if(r){const occ=[...s.queue,...s.enemies].map(i=>s.units[i]).find(u=>aliveU(u)&&same(u.pos,r.step));
    if(!occ)act({type:'move',to:r.step});else if(occ.side==='friend')act({type:'swap',target:occ.id});else act({type:'wait'});}}
 }
 // backpack: berry on the weakest of self/adjacent, tonic on whoever lost most PP
 const reachable=members.filter(m=>m.id===L.id||dist(m.pos,L.pos)===1);
 const hurt=reachable.filter(m=>low(m)<=0.5).sort((a,b)=>low(a)-low(b))[0];
 if(!memo.reckless&&hurt&&s.prog.items.berry>0)act({type:'use',item:'berry',target:hurt.id});
 const dry=reachable.find(m=>m.learned.some(k=>(m.pp[k]??0)===0));
 if(!memo.reckless&&dry&&s.prog.items.tonic>0)act({type:'use',item:'tonic',target:dry.id});
 // fight: guard a hurt neighbour when an enemy is near, then strike
 const adj=adjacentEnemies(s).sort((a,b)=>a.hp-b.hp);
 const visible=s.enemies.map(i=>s.units[i]).filter(u=>aliveU(u)&&s.seen.includes(key(u.pos)));
 const guardTarget=reachable.find(m=>m.id!==L.id&&low(m)<=0.5);
 if(guardTarget&&(L.pp.guard??0)>0&&visible.some(e=>dist(e.pos,L.pos)<=4))act({type:'skill',skill:'guard',target:guardTarget.id});
 for(const e of adj){if((L.pp.strong??0)>0)act({type:'skill',skill:'strong',target:e.id});act({type:'basic',target:e.id});}
 if(!adj.length&&(L.pp.line??0)>0)for(const e of visible)if((e.pos.x===L.pos.x||e.pos.y===L.pos.y)&&dist(e.pos,L.pos)<=3)act({type:'skill',skill:'line',target:e.id});
 const target=objective(s,memo);
 if(target&&same(target.pos,L.pos)){
  const k=target.kind;act({type:'interact',exit:k==='exit'||k==='down'||k==='up'});
 }
 const step=stepToward(s,memo,target);if(step)act(step);
 act({type:'wait'});
 return out;
}
function chooseInvite(s,memo){
 const inv=s.invitations.find(i=>i.status==='pending'),out=[];
 if(s.queue.length<3)out.push({type:'invite',choice:'accept'});
 else{memo.fullInvites++;
  if(memo.fullInvites%2===0){const members=s.queue.filter(i=>i!==s.leader&&aliveU(s.units[i])||(i!==s.leader));
   const weakest=[...members].sort((a,b)=>s.units[a].hp/s.units[a].maxHp-s.units[b].hp/s.units[b].maxHp)[0];
   if(weakest)out.push({type:'invite',choice:'accept',outgoing:weakest});}}
 out.push({type:'invite',choice:'reject'});
 return {out,inv};
}

/* ---------- driver ---------- */
async function send(port,store,cmd,st,where){
 const before=store.envelope,rawBefore=port.getItem(store.key);
 const r=await store.dispatch(cmd);
 if(r.ok){roundTrip(port,store,where);return r;}
 st.rejections++;
 assert.deepEqual(store.envelope,before,`${where}: rejected ${JSON.stringify(cmd)} changed the record`);
 assert.deepEqual(r.state,before.current,`${where}: rejected result state differs`);
 assert.equal(port.getItem(store.key),rawBefore,`${where}: rejected command wrote storage`);
 return r;
}
/** Commands that must be refused in the current phase. Each one is checked to change nothing. */
async function probe(port,store,st,where){
 const s=store.state;st.probes++;
 const bad=s.phase==='playing'?[{type:'finishExit'},{type:'finishTransit'},{type:'invite',choice:'reject'},{type:'round',action:{type:'move',to:{x:-5,y:-5}}},{type:'round',action:{type:'interact',exit:true},override:{actor:s.leader,action:{type:'wait'}}}]
  :s.phase==='invitation'?[{type:'round',action:{type:'wait'}},{type:'finishExit'},{type:'switch',actor:s.leader}]
  :s.phase==='ended'?[{type:'round',action:{type:'wait'}},{type:'invite',choice:'reject'},{type:'finishExit'},{type:'finishTransit'}]
  :[{type:'round',action:{type:'wait'}}];
 for(const cmd of bad){const r=await send(port,store,cmd,st,where+' probe');assert.equal(r.ok,false,`${where}: ${JSON.stringify(cmd)} was accepted in phase ${s.phase}`);}
}

async function playRun(port,ref,gameId,st,reckless=false,doomed=false,useExchange=false){
 let store=ref.store;
 const memo={visited:{},declined:new Set(),lastSwitch:-99,fullInvites:0,reckless,doomed,useExchange,suicidal:false};
 let rounds=0,commands=0,levelBefore=1;const where=`${gameId}`;
 for(;;){
  const s=store.state;
  if(s.phase==='ended'){
   st.levelUps+=s.prog.level-1;
   for(const t of s.end.tms){st.tmGot++;if(t.fate==='brought'||t.fate==='sent')st.tmBrought++;}
   if(s.end.outcome==='wipe')st.wipes++;
   if(s.end.outcome==='wipe'&&doomed)st.doomedWipes++;
   await probe(port,store,st,where+' ended');
   if(store.envelope.profile){const before=store.envelope; // with a base, a finished expedition must go back to the base, not straight into a new trial
    assert.equal(await store.newTrial(createMain('soak-direct')),false,where+': newTrial accepted over a based expedition');assert.deepEqual(store.envelope,before);}
   return {outcome:s.end.outcome,rounds,commands,goal:s.goal,level:s.prog.level,floor:s.dungeon.level};
  }
  if(rounds>=ROUND_CAP||commands>=COMMAND_CAP){
   const L=s.units[s.leader],seen=new Set(s.seen),visited=memo.visited[s.dungeon.level]??new Set();
   const unseenFloor=s.floor.filter(c=>!seen.has(key(c))).length;
   const obj=objective(s,memo);
   if(process.env.SOAK_DEBUG)console.log(where,memo.trail.slice(-30).join(' '),s.log.slice(-6));
   return {outcome:'timeout',rounds,commands,goal:s.goal,level:s.prog.level,floor:s.dungeon.level,
    reason:`phase=${s.phase} floor=${s.dungeon.level} goal=${s.goal} bag=${s.bag} leader@${key(L.pos)} objective=${obj?obj.kind+'@'+key(obj.pos):'none'} visited=${visited.size}/${s.seen.length} seenCells unseenFloor=${unseenFloor} enemiesAlive=${s.enemies.filter(i=>aliveU(s.units[i])).length} cancelledTransits=${st.cancelledTransits}`};
  }
  // Forced-wipe variant: once G is done (or after round 60) every member is brought down to 1 HP in the saved record, and the bot stops defending.
  if(doomed&&!memo.suicidal&&s.phase==='playing'&&(s.goal||s.round>=60)){
   const env=JSON.parse(port.getItem(store.key));for(const id of env.current.queue){const u=env.current.units[id];if(u.hp>0)u.hp=1;}
   port.setItem(store.key,JSON.stringify(env));store=ref.store=new TrialStore(port);assert.equal(store.status,'ready',`${where}: reopened after the hp edit: ${store.error}`);memo.suicidal=true;continue;
  }
  commands++;(memo.trail??=[]).push(`${s.round}:${key(s.units[s.leader].pos)}:${s.phase}`);
  if(commands%9===0)await probe(port,store,st,where);
  if(s.phase==='invitation'){
   const {out}=chooseInvite(s,memo);st.invites++;let done=false;
   for(const cmd of out){const r=await send(port,store,cmd,st,where+' invite');if(r.ok){done=true;cmd.choice==='accept'?st.accepted++:st.rejected++;if(cmd.outgoing)st.swapped++;break;}}
   assert.ok(done,`${where}: no invitation answer accepted`);continue;
  }
  if(s.phase==='exit'){const r=await send(port,store,{type:'finishExit'},st,where);assert.ok(r.ok,`${where}: finishExit refused: ${r.error}`);continue;}
  if(s.phase==='transit'){
   const r=await send(port,store,{type:'finishTransit'},st,where);assert.ok(r.ok,`${where}: finishTransit refused: ${r.error}`);
   store.state.dungeon.level!==s.dungeon.level?st.transits++:st.cancelledTransits++;continue;
  }
  let moved=false;
  for(const cmd of candidates(s,memo)){
   const r=await send(port,store,cmd,st,where+' '+cmd.type);
   if(!r.ok){if(cmd.type==='round'&&cmd.action.type==='interact'){const p=s.points.find(p=>same(p.pos,s.units[s.leader].pos));if(p)memo.declined.add(`${s.dungeon.level}:${key(p.pos)}`);st.declined++;}continue;}
   if(cmd.type==='switch'){memo.lastSwitch=s.round;st.switches++;moved=true;break;}
   if(cmd.type==='buy'){st.bought++;moved=true;break;}
   rounds++;moved=true;
   const a=cmd.action;
   if(a.type==='exchange')st.exchanged++;
   if(a.type==='use')a.item==='berry'?st.berries++:st.tonics++;
   if(a.type==='skill'&&a.skill==='guard')st.guards++;
   if(a.type==='skill'&&a.skill==='line')st.lines++;
   if(a.type==='interact'){const p=s.points.find(p=>same(p.pos,s.units[s.leader].pos));if(p?.kind==='rest')st.rests++;}
   break;
  }
  assert.ok(moved,`${where}: no command was accepted, not even wait`);
 }
}

/** Base routine: every refusal is checked to change nothing; then learn the first compatible machine, set carry and team, depart. */
async function baseTurn(port,store,seed,game,st,where){
 const check=async(a,expectOk)=>{
  const before=store.envelope,raw=port.getItem(store.key);
  const r=await store.baseAction(a);
  if(r.ok){assert.equal(r.saved,true,`${where}: base write not saved`);roundTrip(port,store,where+' '+a.type);}
  else{st.rejections++;assert.deepEqual(store.envelope,before,`${where}: refused ${a.type} changed the record`);assert.equal(port.getItem(store.key),raw,`${where}: refused ${a.type} wrote storage`);}
  if(expectOk!==undefined)assert.equal(r.ok,expectOk,`${where}: ${JSON.stringify(a)} -> ${r.ok?'ok':r.error}`);
  return r;
 };
 st.probes+=4;
 await check({type:'carry',inst:'P1',moves:['scratch','ember','scratch']},false);
 await check({type:'team',team:[],leader:'P1'},false);
 await check({type:'team',team:['P1','P2','P3','P1'],leader:'P1'},false);
 await check({type:'learn',inst:'P1',move:'notamove'},false);
 for(const move of Object.keys(store.profile.vault)){
  let learnedOne=true;
  while(learnedOne&&(store.profile.vault[move]??0)>0){
   learnedOne=false;
   for(const inst of store.profile.roster.map(i=>i.id)){
    const r=await check({type:'learn',inst,move});
    if(!r.ok)continue;
    const learned=store.profile.roster.find(i=>i.id===inst).learned,m=learned.find(l=>l.move===move);
    const keep=store.profile.roster.find(i=>i.id===inst).carry.map(n=>learned.find(l=>l.move===n)).find(l=>l&&l.behavior!==m.behavior);
    const r2=await check({type:'carry',inst,moves:keep?[move,keep.move]:[move]});assert.ok(r2.ok,`${where}: carry after learn refused: ${r2.error}`);
    st.learned++;learnedOne=true;break;
   }
  }
 }
 const roster=store.profile.roster;
 if(game%2===1&&roster.length>3){const newest=roster.at(-1).id;await check({type:'team',team:[newest,'P2','P3'],leader:'P3'},true);}
 else if(game>0)await check({type:'team',team:['P1','P2','P3'],leader:'P3'},true);
 const gseed=(seed*2654435761+game*40503)>>>0;
 const purse=game%2===0?Math.min(40,Math.floor(store.profile.account/ECON.purseStep)*ECON.purseStep):0;
 assert.equal(await store.depart(`soak-${seed}-${game}`,gseed,purse),true,`${where}: depart refused`);
 if(purse)assert.equal(store.state.purse,purse);
 roundTrip(port,store,where+' depart');
}

/** Forced-wipe variant: a profile with two ordinary partners (P3 pidgey, P4 zubat) next to the protected founder P1, and some money for rescues. */
const kit=(id,species,learned)=>({id,species,learned,carry:learned.map(l=>l.move),protected:false});
function doomedProfile(){
 const p=newGameProfile('chikorita','cyndaquil').profile;
 p.roster.push(kit('P3','pidgey',[{move:'tackle',behavior:'strong',pp:3},{move:'gust',behavior:'line',pp:3}]),kit('P4','zubat',[{move:'absorb',behavior:'line',pp:2},{move:'poisonfang',behavior:'strong',pp:1}]));
 p.next=5;p.team=['P1','P3','P4'];p.leader='P1';p.account=100;return p;
}
/** Base routine of the forced-wipe seeds: pay every rescue the account allows, put the first three roster members on the squad, set a purse, depart. */
async function doomedBase(port,store,seed,game,st,where){
 for(const r of [...store.profile.rescue])if(!r.paid&&store.profile.account>=ECON.rescueCost){
  const before=store.profile.account,res=await store.baseAction({type:'rescue',inst:r.inst.id});
  assert.ok(res.ok&&res.saved,`${where}: paying ${r.inst.id}: ${res.error}`);assert.equal(store.profile.account,before-ECON.rescueCost);st.paid++;roundTrip(port,store,where+' pay');
 }
 const poor=store.profile.rescue.find(r=>!r.paid);
 if(poor&&store.profile.account<ECON.rescueCost){ // refused with the missing amount, nothing written
  const raw=port.getItem(store.key),res=await store.baseAction({type:'rescue',inst:poor.inst.id});
  assert.equal(res.ok,false);assert.match(res.error,/还差\d+/);assert.equal(port.getItem(store.key),raw);st.rejections++;st.probes++;
 }
 const ids=store.profile.roster.map(i=>i.id).slice(0,3),origin=store.profile.origin;
 const res=await store.baseAction({type:'team',team:ids,leader:ids.includes(origin)?origin:ids[0]});assert.ok(res.ok&&res.saved,`${where}: team: ${res.error}`);roundTrip(port,store,where+' team');
 const purse=Math.min(40,Math.floor(store.profile.account/ECON.purseStep)*ECON.purseStep);
 assert.equal(await store.depart(`soak-${seed}-${game}`,(seed*2654435761+game*40503)>>>0,purse),true,`${where}: depart refused`);roundTrip(port,store,where+' depart');
}
/** The settlement rules written again independently of settleRun: what must hold between the profile before a run and the one after it. */
function checkSettlement(before,after,end,st,where){
 assert.equal(after.account,before.account+end.reward+end.refund,`${where}: account`);assert.ok(after.account>=0,`${where}: negative account`);
 const pool=new Map(before.rescue.map(r=>[r.inst.id,r]));
 for(const [id,r] of pool){
  const now=after.rescue.find(x=>x.inst.id===id),back=after.roster.some(i=>i.id===id),gone=after.lost.some(l=>l.id===id);
  if(!end.effective||r.left>1){
   const want=end.effective?r.left-1:r.left;
   assert.ok(now&&now.left===want&&now.paid===r.paid&&!back&&!gone,`${where}: ${id} should wait with ${want}`);
  }else if(r.paid){assert.ok(back&&!now&&!gone,`${where}: paid ${id} should return`);st.returned++;}
  else{assert.ok(gone&&!now&&!back,`${where}: unpaid ${id} should be lost for good`);st.goneForGood++;}
 }
 const fresh=after.rescue.filter(x=>!pool.has(x.inst.id));
 assert.equal(fresh.length,end.lost.length,`${where}: pool newcomers vs the draw`);
 for(const x of fresh){assert.equal(x.left,ECON.window);assert.equal(x.paid,false);}
 st.lostPartners+=fresh.length;
 assert.ok(after.rescue.every(x=>!x.inst.protected)&&after.lost.length>=before.lost.length,`${where}: protected member in the pool or lost record shrank`);
 for(const i of before.roster.filter(i=>i.protected))assert.ok(after.roster.some(j=>j.id===i.id),`${where}: protected ${i.id} left the roster`);
 assert.ok(after.team.length>=1&&after.team.every(id=>after.roster.some(i=>i.id===id)),`${where}: squad not departable`);
}
const seedOf=i=>1000+i*7919;
async function playSeed(i){
 const seed=seedOf(i),port=memory(),st=stats(),games=[],doomed=i%4===3;
 let store;const ref={};
 if(i%2===0){ // the real first-run path of the start page: a legacy expedition with no profile; the base profile appears when it returns
  store=new TrialStore(port);const gseed=(seed*2654435761)>>>0;
  assert.equal(await store.start(createExpedition(`soak-${seed}-0`,gseed)),true);roundTrip(port,store,`seed ${seed} start`);
 }else{ // a player at the base with the initial profile
  port.setItem('dungeon-trial.player.v1',JSON.stringify({format:1,rules:RULE_VERSION,content:CONTENT_VERSION,build:BUILD_ID,sequence:1,current:null,recent:null,profile:doomed?doomedProfile():initialProfile()}));
  store=new TrialStore(port);assert.equal(store.status,'ready');assert.equal(store.atBase,true);
  await (doomed?doomedBase:baseTurn)(port,store,seed,0,st,`seed ${seed} g0 base`);
 }
 for(let g=0;g<GAMES;g++){
  const id=`seed ${seed} game ${g}`;
  ref.store=store;const r=await playRun(port,ref,id,st,i%3===2&&!doomed,doomed,g%2===0);store=ref.store;games.push({seed,game:g,reckless:i%3===2,legacy:i%2===0&&g===0,doomed,...r});
  if(r.outcome==='timeout')break;
  const before=store.envelope.profile;const endRecord=structuredClone(store.state.end);
  assert.equal(await store.returnToBase(),true,`${id}: returnToBase refused`);roundTrip(port,store,`${id} return`);
  assert.equal(store.atBase,true);assert.ok(store.profile.expeditions>=1);
  if(before)assert.equal(store.profile.expeditions,before.expeditions+1);
  assert.equal(store.envelope.recent.phase,'ended');
  checkSettlement(before??initialProfile(),store.profile,endRecord,st,id);
  if(g===GAMES-1)break;
  await (doomed?doomedBase:baseTurn)(port,store,seed,g+1,st,`${id} base`);
 }
 return {seed,games,st,roster:store.profile?.roster.length??0,vault:store.profile?.vault??{}};
}

const sum=(xs,f)=>xs.reduce((a,x)=>a+f(x),0);
const pct=(n,d)=>d?`${(100*n/d).toFixed(1)}%`:'-';
test('S66 loop soak: base -> expedition -> base -> expedition, many seeds, every step checked',async()=>{
 const t0=Date.now(),results=[];
 for(let i=0;i<SEEDS;i++)results.push(await playSeed(i));
 const games=results.flatMap(r=>r.games),total=games.length,st=stats();
 for(const r of results)for(const k of Object.keys(st))st[k]+=r.st[k];
 const by=o=>games.filter(g=>g.outcome===o);
 const rounds=games.map(g=>g.rounds).sort((a,b)=>a-b);
 const stuck=games.filter(g=>g.outcome==='timeout');
 const lines=[
  `seeds ${SEEDS}, games ${total}, wall time ${((Date.now()-t0)/1000).toFixed(1)} s`,
  `outcome: normal exit ${by('normal').length} (${pct(by('normal').length,total)}), wipe ${by('wipe').length} (${pct(by('wipe').length,total)}), timeout/stuck ${stuck.length} (${pct(stuck.length,total)})`,
  `rounds per game: mean ${(sum(games,g=>g.rounds)/total).toFixed(1)}, median ${rounds[Math.floor(total/2)]}, min ${rounds[0]}, max ${rounds[total-1]}`,
  `goal G reached in ${games.filter(g=>g.goal).length} games; ended on floor 2 in ${games.filter(g=>g.floor===2).length}`,
  `recruit invitations ${st.invites}: accepted ${st.accepted} (with a swap-out ${st.swapped}), rejected ${st.rejected}`,
  `run level-ups ${st.levelUps} (mean final level ${(sum(games,g=>g.level)/total).toFixed(2)})`,
  `technique machines obtained ${st.tmGot}, brought out ${st.tmBrought}, learned at base ${st.learned}`,
  `floor crossings ${st.transits} (cancelled ${st.cancelledTransits})`,
  `backpack: berries used ${st.berries}, tonics used ${st.tonics}, rest point used ${st.rests}, guard used ${st.guards}, line used ${st.lines}, lead switches ${st.switches}`,
  `failure and rescue: wipes ${st.wipes} (forced-wipe seeds ${st.doomedWipes}), partners gone missing ${st.lostPartners}, rescues paid ${st.paid}, paid partners returned ${st.returned}, lost for good ${st.goneForGood}; shop purchases ${st.bought}, exchanger uses ${st.exchanged}`,
  `commands refused (state verified unchanged) ${st.rejections}, deliberate illegal probes ${st.probes}`,
  `final rosters: mean ${(sum(results,r=>r.roster)/SEEDS).toFixed(1)}, max ${Math.max(...results.map(r=>r.roster))}; unused vault machines at the end ${sum(results,r=>sum(Object.values(r.vault),n=>n))} (${['protect','whirlwind','roar'].map(m=>m+' '+sum(results,r=>r.vault[m]??0)).join(', ')})`,
  `seeds with at least 2 completed games: ${results.filter(r=>r.games.filter(g=>g.outcome!=='timeout').length>=2).length}/${SEEDS}`,
  `stuck games (round cap ${ROUND_CAP}): ${stuck.length?stuck.map(g=>`seed ${g.seed} game ${g.game}: ${g.reason}`).join(' | '):'none'}`,
 ];
 console.log('\n[loop-soak]\n'+lines.map(l=>'  '+l).join('\n'));
 console.log('  per-game (seed:game outcome rounds): '+games.map(g=>`${g.seed}:${g.game} ${g.outcome[0]}${g.rounds}`).join(', '));
 // Hard requirements: the loop ran, and the rules held at every step (the checks above throw otherwise).
 assert.equal(results.length,SEEDS);
 assert.ok(total>=SEEDS,'every seed must complete at least one game');
 assert.ok(st.probes>0&&st.rejections>0);
 assert.ok(st.doomedWipes>=1,'the forced-wipe variant must produce at least one wipe');
});

test('S66 the soak is deterministic: the same seed replays to the same game records',async()=>{
 for(const i of [0,1]){const a=await playSeed(i),b=await playSeed(i);assert.deepEqual(a.games,b.games);assert.deepEqual(a.st,b.st);}
});
