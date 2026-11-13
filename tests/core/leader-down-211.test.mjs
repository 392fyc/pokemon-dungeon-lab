import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommand,createMain,friend,key,traceRound} from '../../src/core/engine.ts';
import {foeOf} from './foe-fixture.mjs';
import {sureHit} from './sure-hit.mjs';

// #211: deterministic synthetic reproduction; the historical seed 32676 snapshot is unavailable.
// Battle stream 7 makes N1's confusion redirect its attack right, into N3 before N3's turn.
function world(){
 const s=createMain('leader211-synthetic',false);
 s.floor=Array.from({length:49},(_,i)=>({x:i%7,y:Math.floor(i/7)}));s.seen=s.floor.map(key);s.seenWalls=[];
 const n1=friend('N1',2,2,50,{tackle:9});n1.status={confusion:{left:7}};
 const n3=friend('N3',3,2,1,{tackle:9});const e=foeOf('E','geodude',2,3,60,{tackle:9});e.waitOnly=true;
 s.units={N1:n1,N3:n3,E:e};s.queue=['N1','N3'];s.leader='N3';s.enemies=['E'];s.camp=[];s.points=[];s.log=[];s.noCrit=true;
 delete s.rooms;delete s.dungeon;delete s.prog;delete s.tms;delete s.shop;delete s.exchange;
 sureHit(s);s.battleRng=7;return s;
}
const badMove={type:'move',to:{x:-5,y:-5}},wait={type:'wait'};
const round=(action,override)=>({type:'round',action,...(override?{override}:{})});
function rejected(s,cmd,why){
 const before=structuredClone(s),r=applyCommand(s,cmd);
 assert.equal(r.ok,false);assert.match(r.error,why);assert.deepEqual(r.state,before);assert.deepEqual(s,before);
 assert.equal(traceRound(s,cmd),null);return r;
}
function accepted(s,cmd){const r=applyCommand(s,cmd);assert.equal(r.ok,true,r.error);assert.equal(r.state.round,s.round+1);return r.state;}

test('#211 fallen leader: illegal move is refused without committing the earlier friendly-fire attack',()=>{
 rejected(world(),round(badMove),/只能移动到相邻格/);
});
test('#211 ordinary click action: basic attack on an enemy two cells away is refused even when the leader would fall first',()=>{
 const s=world();s.units.E.pos={x:1,y:2};rejected(s,round({type:'basic',target:'E'}),/普通攻击只能指定相邻敌人/);
});
test('#211 fallen leader: legal move is discarded and succession takes effect at round end',()=>{
 const s=world(),cmd=round({type:'move',to:{x:4,y:2}}),r=accepted(s,cmd);
 assert.equal(r.units.N3.hp,0);assert.equal(r.leader,'N1');assert.deepEqual(r.units.N1.pos,s.units.N1.pos);
 assert.equal(traceRound(s,cmd).some(step=>step.id==='N3'),false);
 // The next input belongs to the successor: (4,2) is two cells away from N1.
 rejected(r,round({type:'move',to:{x:4,y:2}}),/只能移动到相邻格/);
});
test('#211 fallen leader: legal skill is discarded without PP consumption or transfer to the successor',()=>{
 const s=world(),r=accepted(s,round({type:'skill',skill:'tackle',target:'E'}));
 assert.equal(r.units.N3.hp,0);assert.equal(r.units.N3.pp.tackle,9);assert.equal(r.units.N1.pp.tackle,8);
 assert.equal(r.units.E.hp,s.units.E.hp);assert.equal(r.leader,'N1');
});
for(const sleeping of ['slp','nap'])test(`#211 ${sleeping} leader: even an invalid command remains a wait when the leader falls before its turn`,()=>{
 const s=world();s.units.N3.status={[sleeping]:{left:3}};
 const r=accepted(s,round(badMove));assert.equal(r.units.N3.hp,0);assert.equal(r.leader,'N1');
});
function intervention(){
 const s=world();s.units.N2=friend('N2',4,4,50,{tackle:9});s.queue.push('N2');s.leader='N2';return s;
}
test('#211 fallen intervention actor: illegal instruction is refused with no state changes',()=>{
 rejected(intervention(),round(wait,{actor:'N3',action:badMove}),/只能移动到相邻格/);
});
test('#211 fallen intervention actor: a legal skill is discarded without PP consumption',()=>{
 const s=intervention(),cmd=round(wait,{actor:'N3',action:{type:'skill',skill:'tackle',target:'E'}}),r=accepted(s,cmd);
 assert.equal(r.units.N3.hp,0);assert.equal(r.units.N3.pp.tackle,9);assert.equal(r.leader,'N2');
 assert.equal(r.units.E.hp,s.units.E.hp);assert.equal(traceRound(s,cmd).some(step=>step.id==='N3'),false);
});
test('#211 swap: leader falls between its own and its partner\'s turns, so the valid swap is discarded',()=>{
 const s=world();s.units.N2=friend('N2',4,2,50,{tackle:9});s.queue=['N3','N1','N2'];
 const cmd=round({type:'swap',target:'N2'}),r=accepted(s,cmd);
 assert.equal(r.units.N3.hp,0);assert.deepEqual(r.units.N2.pos,s.units.N2.pos);assert.equal(r.leader,'N1');
 assert.equal(traceRound(s,cmd).some(step=>step.action.type==='swap'),false);
});
for(const queue of [['N1','N3','N2'],['N1','N2','N3']])test(`#211 swap: a target that falls before the leader acts is refused, queue ${queue.join(',')}`,()=>{
 const s=world();s.units.N2=friend('N2',4,2,50,{tackle:9});s.queue=queue;s.leader='N2';
 rejected(s,round({type:'swap',target:'N3'}),/目标不存在或已倒下/);
});
test('#211 living actors still validate at their turn: an earlier intervention can bring an enemy into basic-attack reach',()=>{
 const s=world();delete s.units.N1.status;s.units.E.pos={x:1,y:2};
 const r=accepted(s,round({type:'basic',target:'E'},{actor:'N1',action:{type:'move',to:{x:3,y:2}}}));
 assert.deepEqual(r.units.N3.pos,{x:2,y:2});assert.ok(r.units.E.hp<s.units.E.hp);
});
test('#211 living actors still reject a command that becomes invalid after an earlier intervention',()=>{
 const s=world();delete s.units.N1.status;s.units.E.pos={x:4,y:2};
 rejected(s,round({type:'basic',target:'E'},{actor:'N1',action:{type:'move',to:{x:3,y:2}}}),/普通攻击只能指定相邻敌人/);
});
function frozenExchange(){
 const s=world();s.units.N1.learned=['firefang'];s.units.N1.pp={firefang:9};s.units.N1.maxPp={firefang:9};
 s.units.N3.status={frz:{left:3}};s.exchange={level:1,used:false,sent:null};s.tms=[];
 s.points=[{pos:{x:3,y:2},kind:'exchange',used:false}];return s;
}
test('#211 frozen exchange: illegal instruction is refused when earlier fire friendly-fire defeats the leader',()=>{
 const s=frozenExchange();s.points=[];
 rejected(s,round({type:'exchange',target:'N1',cargo:[]}),/主控必须站在交换机格上/);
});
test('#211 frozen exchange: legal instruction is discarded when earlier fire friendly-fire defeats the leader',()=>{
 const s=frozenExchange(),r=accepted(s,round({type:'exchange',target:'N1',cargo:[]}));
 assert.equal(r.units.N3.hp,0);assert.equal(r.leader,'N1');assert.equal(r.exchange.used,false);assert.equal(r.exchange.sent,null);
});
