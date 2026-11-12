/* Batch 13: the presentation reads the round's structured events (`World.events`), never the log text.
 * 1. every presentation event type the engine writes appears (a seeded random-world fuzz over real moves, statuses and items) and carries sane fields;
 * 2. targeted cases pin the values the animation relies on;
 * 3. rewording every log line leaves the animation plan unchanged. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createMain,friend as engineFriend,speciesUnit,BLESSINGS,key} from '../../src/core/engine.ts';
import {MOVE_DEFS} from '../../src/core/moves.ts';
import {SPECIES} from '../../src/core/roster.ts';
import {inferEvents,plan} from '../../src/render/animation.ts';
import {world,friend,row,pos} from '../acceptance/fixtures.mjs';
import {foeOf} from './foe-fixture.mjs';
import {sureHit} from './sure-hit.mjs';

/* ---------- seeded random worlds ---------- */
function makeRng(start){let seed=start>>>0;return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const moveIds=Object.keys(MOVE_DEFS),speciesIds=Object.keys(SPECIES),statuses=['slp','nap','par','frz','confusion','flinch','psn','tox','brn'];
const timed=k=>k==='psn'||k==='tox'||k==='brn';
function fuzzWorld(rnd){
  const pick=a=>a[Math.floor(rnd()*a.length)];
  const mk=(id,side,c)=>{
    const u=speciesUnit(id,pick(speciesIds),5,c);u.side=side;
    const learned=[...new Set([pick(moveIds),pick(moveIds),pick(moveIds),pick(moveIds)])];
    if(rnd()<0.12){learned.splice(0,2,'sleeptalk','snore');}
    u.learned=learned;u.pp=Object.fromEntries(learned.map(m=>[m,rnd()<0.1?0:3]));u.maxPp=Object.fromEntries(learned.map(m=>[m,5]));
    u.maxHp=u.hp=Math.floor(8+rnd()*50);if(rnd()<0.4)u.hp=Math.max(1,Math.floor(u.maxHp*rnd()*0.5));
    if(rnd()<0.35){const k=pick(statuses);u.status={[k]:timed(k)?{tick:rnd()<0.5?1:5}:{left:1+Math.floor(rnd()*3)}};}
    if(rnd()<0.15)u.protect=2;if(rnd()<0.15)u.counter=2;if(rnd()<0.1)u.reflect=5;if(rnd()<0.1)u.lightscreen=5;
    if(rnd()<0.3)u.stages={...u.stages,atk:Math.floor(rnd()*7)-3,acc:3*(rnd()<0.6?1:-1)};
    if(side==='enemy'&&rnd()<0.2)u.asleep=true;
    u.tactic=pick(['together','gofoes','wait']);
    return u;
  };
  const floor=[];for(let y=0;y<9;y++)for(let x=0;x<9;x++)if(rnd()>0.04||x<2)floor.push({x,y});
  const taken=new Set(),take=()=>{for(;;){const c=pick(floor);if(!taken.has(key(c))){taken.add(key(c));return {...c};}}};
  const units={},queue=[],enemies=[];
  for(const id of ['A','B','C']){units[id]=mk(id,'friend',take());queue.push(id);}
  const ne=2+Math.floor(rnd()*3);
  for(let i=0;i<ne;i++){const id='E'+i;units[id]=mk(id,'enemy',take());enemies.push(id);}
  const s=world(units,{floor,leader:'A',queue,enemies,points:[]});
  s.dungeon={seed:Math.floor(rnd()*1e6),width:36,height:24,floors:3,level:1,stored:{},boss:true,roguelike:true,tmPool:3};
  s.difficulty='normal';s.rooms=[{x:0,y:0,w:9,h:9}];s.enemyAiRng=Math.floor(rnd()*1000);s.noCrit=rnd()<0.4;
  s.prog={level:5,exp:0,rng:5,made:0,kills:[],items:{berry:2,tonic:2,bigBerry:1,teamTonic:1,pechaBerry:1,healSeed:1,violentSeed:1,maxElixir:1,slumberOrb:1,totterOrb:1,luminousOrb:1,rollcallOrb:1,reviverSeed:rnd()<0.6?2:0}};
  s.purse=50;s.tms=[];
  if(rnd()<0.4)s.blessings=[pick(Object.keys(BLESSINGS))];
  return s;
}
function fuzzCommand(rnd,s){
  const pick=a=>a[Math.floor(rnd()*a.length)];
  const lead=s.units[s.leader],live=[...s.queue,...s.enemies].filter(i=>s.units[i].hp>0&&s.units[i].pos),r=rnd();
  const near=lead.pos?[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},{x:1,y:1},{x:-1,y:-1}].map(d=>({x:lead.pos.x+d.x,y:lead.pos.y+d.y})):[];
  let action;
  if(r<0.45&&lead.learned.length)action={type:'skill',skill:pick(lead.learned),target:pick(rnd()<0.5?s.enemies:live)};
  else if(r<0.55)action={type:'basic',target:pick(s.enemies)};
  else if(r<0.62)action={type:'basicForward'};
  else if(r<0.72&&near.length)action={type:'move',to:pick(near)};
  else if(r<0.78)action={type:'swap',target:pick(s.queue.filter(i=>i!==s.leader))};
  else if(r<0.9)action={type:'use',item:pick(['berry','tonic','bigBerry','teamTonic','pechaBerry','healSeed','violentSeed','maxElixir','slumberOrb','totterOrb','luminousOrb','rollcallOrb']),target:pick(s.queue)};
  else action={type:'wait'};
  const cmd={type:'round',action};
  if(rnd()<0.3){const o=pick(s.queue.filter(i=>i!==s.leader));if(o)cmd.override={actor:o,action:{type:'skill',skill:pick(s.units[o].learned),target:pick(live)}};}
  return cmd;
}
/** Every accepted round of the seeded worlds: {before,cmd,after}. */
function fuzzRounds(worlds,seed){
  const rnd=makeRng(seed),out=[];
  for(let w=0;w<worlds;w++){
    let s=fuzzWorld(rnd);
    for(let n=0;n<8;n++){
      let done=false;
      for(let tries=0;tries<12&&!done;tries++){
        const cmd=fuzzCommand(rnd,s),res=applyCommand(s,cmd);
        if(res.ok){out.push({before:s,cmd,after:res.state});s=res.state;done=true;}
      }
      if(!done||s.phase!=='playing')break;
      if(s.units[s.leader].hp<=0){const nl=s.queue.find(i=>s.units[i].hp>0&&s.units[i].pos);if(!nl)break;s.leader=nl;}
    }
  }
  return out;
}
const rounds=fuzzRounds(500,7);
/* One fixed round per guard kind, so a rule change elsewhere that shifts the random walk cannot make a kind disappear from the fuzz (Pursuit is this game's counter move). */
for(const move of ['pursuit','protect','reflect','lightscreen']){
  const s=fuzzWorld(makeRng(11)),L=s.units[s.leader];
  Object.assign(L,{hp:Math.max(1,L.hp),status:undefined,asleep:false,protect:0,counter:0,reflect:0,lightscreen:0,lastMove:null,learned:[move],pp:{[move]:3},maxPp:{[move]:5}});
  for(const id of s.queue)s.units[id].reflect=0,s.units[id].lightscreen=0;
  const cmd={type:'round',action:{type:'skill',skill:move,target:s.leader}},res=applyCommand(s,cmd);
  if(res.ok)rounds.push({before:s,cmd,after:res.state});
}

test('the seeded fuzz produces the common presentation events, every fail reason and every guard kind, with sane fields',()=>{
  const seen={},reasons=new Set(),guards=new Set();
  for(const {before,after} of rounds){
    for(const e of after.events??[]){
      seen[e.type]=(seen[e.type]??0)+1;
      if(e.type==='fail')reasons.add(e.reason);
      if(e.type==='guard')guards.add(e.kind);
      if(e.type==='hpLoss'){
        assert.ok(Number.isInteger(e.amount)&&e.amount>=0&&e.hp>=0,'hpLoss amount and HP left are whole numbers');
        if(e.revive!==undefined){assert.equal(e.hp,0);assert.ok(e.revive>=1);}
      }
      if(e.type==='move'||e.type==='blowaway')assert.ok(Number.isInteger(e.to.x)&&Number.isInteger(e.to.y));
      if(e.type==='heal'||e.type==='drain')assert.ok(e.to>=e.from);
    }
    assert.notEqual(before.events,after.events,'a round starts from a clean event list');
  }
  for(const type of ['move','swap','cast','castNoTarget','confusedStrike','fail','blowaway','hpLoss','revive','heal','drain','stage','rest','guard','quickguard','itemUse','damage','miss','immune','airAttack','status','statusDamage'])
    assert.ok(seen[type]>0,'the fuzz never produced a '+type+' event; seen: '+JSON.stringify(seen));
  for(const reason of ['basicNoTarget','frozen','nap','sleep','paralyzed','flinch','invalid','noPath','wait','confusedWander'])assert.ok(reasons.has(reason),'fail reason '+reason+' never produced; seen '+[...reasons]);
  for(const kind of ['protect','counter','reflect','lightscreen'])assert.ok(guards.has(kind),'guard kind '+kind+' never seen: '+[...guards]);
  assert.ok(rounds.some(({after})=>after.events?.some(e=>e.type==='hpLoss'&&e.crit)),'a critical hit is recorded on hpLoss');
  assert.ok(rounds.some(({after})=>after.events?.some(e=>e.type==='hpLoss'&&e.revive!==undefined)),'a Reviver Seed is recorded on hpLoss');
  const loss=rounds.map(r=>r.after.events?.find(e=>e.type==='hpLoss'&&e.strike)).find(Boolean);
  assert.ok(loss,'a confused strike is credited on hpLoss.strike');
});

/* ---------- targeted cases ---------- */
const open5=Array.from({length:25},(_,i)=>pos(i%5,Math.floor(i/5)));
const KIT={tackle:5,swordsdance:5,protect:5,pursuit:5,reflect:5,lightscreen:5,synthesis:5,rest:5,quickguard:5,whirlwind:5,absorb:5,ember:5,hypnosis:5};
function duel(extra=()=>{}){
  const s=createMain('anim-events',false);
  const a=engineFriend('A',1,1,30,KIT),b=engineFriend('B',0,1,30,{tackle:5});a.species='treecko';b.species='treecko';a.maxHp=b.maxHp=30;
  const e=foeOf('E','rattata',2,1,40,{tackle:5});e.waitOnly=true;
  s.floor=open5;s.seen=open5.map(key);s.queue=['A','B'];s.enemies=['E'];s.leader='A';s.points=[];s.log=[];s.rooms=[{x:0,y:0,w:5,h:5}];
  s.units={A:a,B:b,E:e};
  extra(s);return sureHit(s);
}
const play=(s,action,override)=>{const r=applyCommand(s,{type:'round',action,...(override?{override}:{})});assert.equal(r.ok,true,r.error);return r.state;};
const find=(s,type,pred=()=>true)=>(s.events??[]).find(e=>e.type===type&&pred(e));

test('a plain hit writes cast, hpLoss (amount, HP left) and damage in the log order',()=>{
  const s=play(duel(),{type:'skill',skill:'tackle',target:'E'});
  assert.deepEqual(s.events.map(e=>e.type).filter(t=>['cast','hpLoss','damage'].includes(t)),['cast','hpLoss','damage']);
  const loss=find(s,'hpLoss');assert.equal(loss.unit,'E');assert.equal(loss.hp,s.units.E.hp);assert.equal(loss.amount,40-s.units.E.hp);
  assert.equal(find(s,'cast').skill,'tackle');
});
test('a Reviver Seed writes revive on the same hpLoss and a standalone revive event',()=>{
  const s=duel(w=>{w.units.A.hp=1;w.units.A.stages.def=-3;w.prog={level:5,exp:0,rng:5,made:0,kills:[],items:{berry:0,tonic:0,reviverSeed:1}};w.units.E.waitOnly=false;w.units.E.tactic='gofoes';w.queue=['A'];w.units.B.hp=0;w.units.B.pos=null;});
  const r=play(s,{type:'wait'}),loss=find(r,'hpLoss',e=>e.unit==='A'),rev=find(r,'revive');
  assert.ok(loss&&rev,'the enemy hit the 1 HP leader: '+JSON.stringify(r.events));
  assert.equal(loss.hp,0);assert.equal(loss.revive,rev.hp);assert.equal(rev.unit,'A');assert.equal(r.units.A.hp,rev.hp);
});
test('status blocks write fail events with their reason',()=>{
  for(const [status,reason] of [['frz','frozen'],['par','paralyzed'],['flinch','flinch']]){
    const r=play(duel(w=>{w.units.A.status={[status]:{left:3}};}),{type:'basic',target:'E'});
    assert.ok(r.events.some(e=>e.type==='fail'&&e.unit==='A'&&e.reason===reason),status+' -> '+reason+': '+JSON.stringify(r.events));
  }
  for(const [status,reason] of [['slp','sleep'],['nap','nap']]){
    const r=play(duel(w=>{w.units.A.status={[status]:{left:3}};}),{type:'wait'});
    assert.ok(r.events.some(e=>e.type==='fail'&&e.unit==='A'&&e.reason==='wait')||r.events.some(e=>e.type==='fail'&&e.unit==='A'&&e.reason===reason),status+': '+JSON.stringify(r.events));
  }
});
test('a swap writes swap; a frozen leader or partner writes its fail reason',()=>{
  const ok=play(duel(),{type:'swap',target:'B'});assert.deepEqual(find(ok,'swap'),{type:'swap',unit:'A',mate:'B'});
  const lead=play(duel(w=>{w.units.A.status={frz:{left:3}};}),{type:'swap',target:'B'});
  assert.ok(lead.events.some(e=>e.type==='fail'&&e.unit==='A'&&e.reason==='frozen'),JSON.stringify(lead.events));
  const partner=play(duel(w=>{w.units.B.status={frz:{left:3}};}),{type:'swap',target:'B'});
  assert.ok(partner.events.some(e=>e.type==='fail'&&e.unit==='A'&&e.reason==='swapPartnerFrozen'),JSON.stringify(partner.events));
  const step=play(duel(),{type:'move',to:pos(1,2)});assert.deepEqual(find(step,'move'),{type:'move',unit:'A',to:{x:1,y:2}});
});
test('self guards, quick guard, stage changes, rest and healing write their own events',()=>{
  const g=skill=>play(duel(),{type:'skill',skill,target:'A'});
  assert.deepEqual(find(g('protect'),'guard'),{type:'guard',unit:'A',kind:'protect'});
  assert.deepEqual(find(g('pursuit'),'guard'),{type:'guard',unit:'A',kind:'counter'});
  assert.ok(find(g('reflect'),'guard',e=>e.kind==='reflect'&&e.unit==='A'));
  assert.ok(find(g('lightscreen'),'guard',e=>e.kind==='lightscreen'&&e.unit==='A'));
  assert.ok(find(g('quickguard'),'quickguard',e=>e.unit==='A'&&e.targets.includes('A')));
  const up=g('swordsdance');assert.deepEqual(find(up,'stage'),{type:'stage',unit:'A',stat:'atk',value:up.units.A.stages.atk});
  assert.equal(find(play(duel(w=>{w.units.A.hp=20;}),{type:'skill',skill:'rest',target:'A'}),'rest')?.unit,'A');
  const h=play(duel(w=>{w.units.A.hp=5;}),{type:'skill',skill:'synthesis',target:'A'}),heal=find(h,'heal');
  assert.deepEqual([heal.unit,heal.from,heal.to],['A',5,h.units.A.hp]);
});
test('items write itemUse: berry carries HP before and after, tonic the PP gained, room items no target',()=>{
  const bag=w=>{w.prog={level:5,exp:0,rng:5,made:0,kills:[],items:{berry:2,tonic:2,teamTonic:1,luminousOrb:1}};w.units.A.hp=5;w.units.A.pp.tackle=0;};
  const berry=play(duel(bag),{type:'use',item:'berry',target:'A'});
  assert.deepEqual(find(berry,'itemUse'),{type:'itemUse',unit:'A',item:'berry',target:'A',from:5,to:berry.units.A.hp});
  const tonic=play(duel(bag),{type:'use',item:'tonic',target:'A'}),t=find(tonic,'itemUse');assert.ok(t.pp>0);assert.equal(t.target,'A');
  assert.deepEqual(find(play(duel(bag),{type:'use',item:'luminousOrb',target:'A'}),'itemUse'),{type:'itemUse',unit:'A',item:'luminousOrb'});
  assert.equal(find(play(duel(bag),{type:'use',item:'teamTonic',target:'A'}),'itemUse').target,undefined);
});
test('blowaway, drain, immune and a thaw are written by the matching moves',()=>{
  const blow=play(duel(),{type:'skill',skill:'whirlwind',target:'E'}),b=find(blow,'blowaway');
  assert.deepEqual([b.unit,b.target],['A','E']);assert.deepEqual(b.to,blow.units.E.pos);
  const drain=play(duel(w=>{w.units.A.hp=10;}),{type:'skill',skill:'absorb',target:'E'}),d=find(drain,'drain');
  assert.equal(d.unit,'A');assert.equal(d.from,10);assert.equal(d.to,drain.units.A.hp);
  const imm=play(duel(w=>{w.units.E.species='gastly';}),{type:'skill',skill:'tackle',target:'E'});
  assert.deepEqual(find(imm,'immune'),{type:'immune',actor:'A',target:'E',skill:'tackle'});
  const thaw=play(duel(w=>{w.units.E.status={frz:{left:3}};}),{type:'skill',skill:'ember',target:'E'});
  assert.ok(find(thaw,'status',e=>e.target==='E'&&e.status==='frz'&&e.change==='cure'));
});
test('a frozen target writes frozenBlock; a sleeper born asleep writes sleepConverted when a move puts it to sleep',()=>{
  const froze=play(duel(w=>{w.units.E.status={frz:{left:3}};}),{type:'skill',skill:'whirlwind',target:'E'});   // the wall collision (5 damage) is stopped by the ice
  assert.deepEqual(find(froze,'frozenBlock'),{type:'frozenBlock',unit:'E'});assert.equal(find(froze,'hpLoss'),undefined);
  const slept=play(duel(w=>{w.units.E.asleep=true;w.units.E.wakeSkip=false;}),{type:'skill',skill:'hypnosis',target:'E'});
  assert.ok(find(slept,'sleepConverted',e=>e.unit==='E'),JSON.stringify(slept.events));
});
test('a sleeper that answers a hit writes sleeptalk before its cast',()=>{
  let found=null;
  for(let seed=1;seed<80&&!found;seed++){
    const s=duel(w=>{const e=w.units.E;e.status={slp:{left:9}};e.learned=['sleeptalk','tackle'];e.pp={sleeptalk:5,tackle:5};e.maxPp={sleeptalk:5,tackle:5};w.battleRng=(seed*2654435761)>>>0;});
    const r=play(s,{type:'skill',skill:'tackle',target:'E'}),i=r.events.findIndex(e=>e.type==='sleeptalk');
    if(i>=0)found={r,i};
  }
  assert.ok(found,'a sleeping enemy answered with Sleep Talk in some seed');
  const next=found.r.events[found.i+1];assert.equal(next.type,'cast');assert.equal(next.viaSleeptalk,true);assert.equal(next.skill,found.r.events[found.i].skill);
});
test('a confused unit writes confusedStrike and the next hpLoss names it in strike',()=>{
  // The random direction is drawn from the battle stream: take the first stream state whose draw points A's strike at E (east).
  let r=null;
  for(let n=1;n<400&&!r;n++){
    const c=play(duel(w=>{w.units.A.status={confusion:{left:3}};w.battleRng=(n*2654435761)>>>0;}),{type:'basic',target:'E'});
    if(find(c,'hpLoss',e=>e.unit==='E'))r=c;
  }
  assert.ok(r,'some battle stream state strikes E');
  assert.ok(find(r,'confusedStrike',e=>e.unit==='A'));
  const loss=find(r,'hpLoss',e=>e.unit==='E');assert.equal(loss.strike,'A');
  assert.deepEqual(r.events.map(e=>e.type).slice(0,3),['confusedStrike','hpLoss','damage']);
  assert.equal(r.strikePending,undefined,'the transient field is not left on the state');
});

/* ---------- wording independence ---------- */
test('rewording every log line leaves every animation plan unchanged',()=>{
  const reword=lines=>lines.map((t,i)=>`[#${i}] ${[...t].reverse().join('')} (reworded)`);
  let checked=0,nonEmpty=0;
  for(const {before,cmd,after} of rounds){
    const same=inferEvents(before,after,cmd);
    const shuffled=inferEvents({...before,log:reword(before.log)},{...after,log:reword(after.log)},cmd);
    assert.deepEqual(shuffled,same);
    assert.deepEqual(plan(shuffled),plan(same));
    const emptyLog=inferEvents(before,{...after,log:[]},cmd);
    assert.deepEqual(emptyLog,same,'the log can be empty and the plan is the same');
    checked++;if(same.length)nonEmpty++;
  }
  assert.ok(checked>1500&&nonEmpty>1000,`checked ${checked} rounds, ${nonEmpty} with steps`);
});
