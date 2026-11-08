/* Critical hits (playtest round 4): 1 in 24 per target on the battle stream, x1.5 before the type step, ignoring the attacker's negative attack stage, the defender's positive defence stage and the screens; none on an immune target. Real applyCommand. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createMain,enemy,friend,key,rngStep} from '../../src/core/engine.ts';
import {inferEvents} from '../../src/render/animation.ts';
import {mergeLogLines} from '../../src/core/describe.ts';

const rect=(x1,x2,y1,y2)=>Array.from({length:(x2-x1+1)*(y2-y1+1)},(_,i)=>({x:x1+i%(x2-x1+1),y:y1+Math.floor(i/(x2-x1+1))}));
function duel({species='pidgey',moves=[],seed=1,noCrit=false}={}){
 const s=createMain('crit-test',false),floor=rect(0,5,0,5);
 s.floor=floor;s.seen=floor.map(key);s.queue=['A'];s.enemies=['T'];s.leader='A';s.points=[];s.log=[];s.rooms=[{x:0,y:0,w:6,h:6}];
 const a=friend('A',1,1,30,Object.fromEntries(moves.map(m=>[m,5])));a.species='mudkip';a.entrySpecies='mudkip';a.level=5;a.stages.acc=3;
 const t=enemy('T',2,1,500,'melee',0);t.species=species;t.entrySpecies=species;t.level=5;t.hp=t.maxHp=500;t.waitOnly=true;t.stages.acc=3;
 s.units={A:a,T:t};s.battleRng=seed;s.difficulty='normal';if(noCrit)s.noCrit=true;
 return s;
}
const basic={type:'round',action:{type:'basic',target:'T'}};
const run=(s,cmd=basic)=>{const r=applyCommand(s,cmd);assert.equal(r.ok,true,r.error);return r.state;};
const lost=s=>500-s.units.T.hp;
/** The engine says it with a field on the damage event, not with a log line. */
const isCrit=s=>(s.events??[]).some(e=>e.type==='damage'&&e.crit);
/** A battle seed whose draws give (or avoid) a critical hit for this exact setup. */
function seedWhere(setup,wantCrit,cmd=basic){for(let seed=1;seed<=400;seed++){const after=run(duel({...setup,seed}),cmd);if(isCrit(after)===wantCrit)return seed;}throw Error('no seed');}

test('a critical hit does x1.5 before the type step and writes one merged log line',()=>{
 const seed=seedWhere({},true);
 const crit=run(duel({seed})),plain=run(duel({seed,noCrit:true}));
 assert.ok(lost(plain)>0&&lost(crit)===Math.round(lost(plain)*1.5),`crit ${lost(crit)} vs plain ${lost(plain)}`);
 assert.ok(!crit.log.includes('命中要害'),'no marker line in the engine log: the field is on the event');
 const ev=crit.events.filter(e=>e.type==='damage');assert.equal(ev.length,1);assert.deepEqual([ev[0].target,ev[0].amount,ev[0].crit],['T',lost(crit),true]);
 const {merged,skipped}=mergeLogLines(crit.log,crit.events);const at=crit.log.findIndex(l=>/^T受到\d+伤害，HP \d+$/.test(l));
 assert.equal(merged.get(at),`T受到${lost(crit)}伤害，命中要害`,'the display line is built from the event');assert.equal(skipped.size,0);
 assert.equal(mergeLogLines(plain.log,plain.events).merged.size,0,'a plain hit is left alone');
});
test('the roll is 1 in 24: about that many of 2400 fixed seeds crit',()=>{
 let n=0;for(let seed=1;seed<=2400;seed++)if(isCrit(run(duel({seed}))))n++;
 assert.ok(n>=70&&n<=130,`2400 seeds gave ${n} critical hits (1/24 is 100)`);
});
test('a critical hit ignores a negative attack stage, a positive defence stage and the screens',()=>{
 const seed=seedWhere({},true);
 const clean=run(duel({seed}));
 const hampered=duel({seed});hampered.units.A.stages.atk=-2;hampered.units.T.stages.def=2;hampered.units.T.reflect=5;
 assert.equal(lost(run(hampered)),lost(clean),'stages and reflect do not matter to a critical hit');
 const boosted=duel({seed});boosted.units.A.stages.atk=2;
 assert.ok(lost(run(boosted))>lost(clean),'a positive attack stage still adds (and is multiplied too)');
});
test('no roll and no critical hit on an immune target; the stream is untouched by it',()=>{
 for(let seed=1;seed<=60;seed++){
  const on=duel({species:'geodude',moves:['thunderbolt'],seed}),off=duel({species:'geodude',moves:['thunderbolt'],seed,noCrit:true});
  const cmd={type:'round',action:{type:'skill',skill:'thunderbolt',target:'T'}};
  const a=run(on,cmd),b=run(off,cmd);
  assert.ok(!isCrit(a));assert.equal(a.battleRng,b.battleRng,'the immune target consumed no crit draw');assert.equal(a.units.T.hp,500);
 }
});
test('the animation marks the hit as critical and carries the HP after it',()=>{
 const seed=seedWhere({},true),before=duel({seed}),after=run(before);
 const hit=inferEvents(before,after,basic).find(e=>e.k==='hit');
 assert.equal(hit.crit,true);assert.equal(hit.hpAfter,after.units.T.hp);assert.equal(hit.amount,lost(after));
 const n=seedWhere({},false),b2=duel({seed:n}),a2=run(b2);
 const h2=inferEvents(b2,a2,basic).find(e=>e.k==='hit');assert.equal(h2.crit,undefined);assert.equal(h2.hpAfter,a2.units.T.hp);
});

test('status damage, recoil and drain become hpchange events with the HP after them (shown when they happen, not at the end of the round)',()=>{
 const s=duel({noCrit:true});s.units.A.hp=20;s.units.A.status={psn:{tick:1,left:3}};
 const r=run(s,{type:'round',action:{type:'wait'}});
 const changes=inferEvents(s,r,{type:'round',action:{type:'wait'}}).filter(e=>e.k==='hpchange');
 assert.ok(changes.length>=1,'the poison tick is an event');
 const c=changes.find(e=>e.target==='A');assert.ok(c.delta<0&&c.hpAfter===r.units.A.hp,JSON.stringify(c));
});
test('recoil and drain also become hpchange events (loss on the attacker, gain on the drainer)',()=>{
 for(const [move,sign] of [['doubleedge',-1],['absorb',1]]){
  const s=duel({moves:[move],noCrit:true});s.units.A.hp=10;s.units.A.maxHp=40;s.units.A.stages.acc=3;
  const cmd={type:'round',action:{type:'skill',skill:move,target:'T'}},r=run(s,cmd);
  const c=inferEvents(s,r,cmd).filter(e=>e.k==='hpchange'&&e.target==='A');
  assert.ok(c.length>=1,move+' gives an hpchange event');assert.ok(Math.sign(c.at(-1).delta)===sign,move+' direction');assert.equal(c.at(-1).hpAfter,r.units.A.hp,move+': the HP after the event is the real one');
 }
});

test('Thick Skin: the damage event carries the halved number the log shows, and a critical hit keeps its flag',()=>{
 const setup=seed=>{const s=duel({seed});s.blessings=['thickskin'];s.units.A.hp=s.units.A.maxHp=100;s.units.A.tactic='wait';s.units.T.waitOnly=false;return s;};
 const wait={type:'round',action:{type:'wait'}};
 let found=null;for(let seed=1;seed<=400&&!found;seed++){const r=applyCommand(setup(seed),wait);if(r.ok&&(r.state.events??[]).some(e=>e.type==='damage'&&e.target==='A'&&e.crit))found=r.state;}
 assert.ok(found,'a seed with a critical hit on A exists');
 const ev=found.events.filter(e=>e.type==='damage'&&e.target==='A');assert.equal(ev.length,1);
 const halved=found.log.map(l=>/^厚皮：A本层第一次受到的伤害减半（(\d+)→(\d+)）$/.exec(l)).find(Boolean);assert.ok(halved,'the Thick Skin line is written');
 const line=found.log.map(l=>/^A受到(\d+)伤害，HP (\d+)$/.exec(l)).find(Boolean);assert.ok(line);
 assert.equal(Number(line[1]),Number(halved[2]),'the log line shows the halved number');
 assert.equal(ev[0].amount,Number(line[1]),'the damage event carries the same number as the log line');assert.equal(ev[0].crit,true);
 assert.equal(100-found.units.A.hp,ev[0].amount);
 const {merged}=mergeLogLines(found.log,found.events);const at=found.log.findIndex(l=>/^A受到\d+伤害，HP \d+$/.test(l));
 assert.equal(merged.get(at),`A受到${ev[0].amount}伤害，命中要害`,'the critical mark is paired with the line');
});
