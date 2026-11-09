/* #213: the record panel and the lower-left events are built from the engine's structured log entries (World.entries), not from log text.
   The entries are the log lines kept as data: printed with the raw ids they equal `log` exactly, and printed through the interface they name every unit, move and species in Chinese. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {TrialStore} from '../../src/core/save.ts';
import {applyCommand,createMain,enemy,friend,key,SKILL_CN} from '../../src/core/engine.ts';
import {logEntryText,logEntryShown,logPartsText} from '../../src/core/describe.ts';
import {speciesZh,moveZh} from '../../src/core/names.ts';
import {SPECIES} from '../../src/core/roster.ts';
import {MOVE_DEFS} from '../../src/core/moves.ts';
import {playSeed} from './soak-bot.mjs';

const print=parts=>parts.map(p=>typeof p==='string'?p:'unit' in p?p.unit:'move' in p?p.move:p.species).join('');
const edge='[A-Za-z0-9-]';
// The interface's old filter (before #213 round 5), kept here to check the engine's routine marks.
const ROUTINE=/^[A-Za-z0-9_:-]+(?:移动到-?\d+,-?\d+|与[A-Za-z0-9_:-]+换位|(?:无路可走，)?等待)$/;
const hasId=(text,id)=>new RegExp(`(?<!${edge})${id.replace(/[.*+?^$|()[\]{}\\]/g,'\\$&')}(?!${edge})`).test(text);

test('entries printed with their raw ids are exactly the log, and the interface text never shows an id (two full soak seeds)',async()=>{
 const seen=[],original=TrialStore.prototype.dispatch;
 TrialStore.prototype.dispatch=async function(cmd){
  const result=await original.call(this,cmd);
  const s=this.state;if(s)seen.push(structuredClone(s));
  const raw=this.exportRecord();if(raw!==null){assert.ok(!raw.includes('"entries"')&&!raw.includes('"logSeq"'),'the saved record carries no log entries');}
  return result;
 };
 try{for(const seed of [0,3])await playSeed(seed);}finally{TrialStore.prototype.dispatch=original;}
 assert.ok(seen.length>200,'the soak produced many worlds: '+seen.length);
 const ids=new Set([...Object.keys(SPECIES),...Object.keys(MOVE_DEFS)]);let checked=0,slots=0;
 for(const s of seen){
  const entries=s.entries??[];
  assert.deepEqual(entries.map(e=>print(e.parts)),s.log.slice(-entries.length),'entries are the tail of the log, line for line');
  assert.equal(entries.length,s.log.length,'both keep the last 80');
  const unitIds=new Set([...Object.keys(s.units),...(s.invitations??[]).map(i=>i.unit.id)]);
  for(const e of entries){
   const text=logEntryText(e);checked++;
   for(const p of [...e.parts,...(e.player??[])])if(typeof p==='object')slots++;
   assert.ok(text.length>0);
   for(const id of unitIds)assert.ok(!hasId(text,id),`unit id ${id} left in "${text}" (log "${print(e.parts)}")`);
   for(const id of ids)assert.ok(!hasId(text,id),`id ${id} left in "${text}"`);
   assert.ok(!/普攻|没打中|倒下退图/.test(text),'player wording: '+text);
   assert.equal(typeof logEntryShown(s,e),'boolean');
   // The engine marks routine steps itself: a printed line in the old routine shape (move, swap, plain wait) carries the mark, and nothing else does.
   assert.equal(!!e.routine,ROUTINE.test(print(e.parts)),`routine mark for "${print(e.parts)}"`);
  }
  const seqs=entries.map(e=>e.n);assert.deepEqual(seqs,[...seqs].sort((a,b)=>a-b),'entry numbers only grow');
  assert.equal(new Set(seqs).size,seqs.length);
 }
 assert.ok(checked>2000&&slots>1000,`${checked} entries and ${slots} slots were checked`);
});

test('stripping entries and logSeq from two runs of one seed leaves identical states (the interface fields do not feed back into the rules)',()=>{
 const run=()=>{let s=createMain('entries-det',false);const out=[];for(let i=0;i<12;i++){const r=applyCommand(s,{type:'round',action:{type:'wait'}});if(!r.ok)break;s=r.state;const {entries,logSeq,...rest}=s;out.push(JSON.stringify(rest));}return out;};
 assert.deepEqual(run(),run());
});

function duelWorld(){
 const s=createMain('entries-duel',false);
 const floor=Array.from({length:36},(_,i)=>({x:i%6,y:Math.floor(i/6)}));
 s.floor=floor;s.seen=floor.map(key);s.queue=['A'];s.enemies=['T'];s.leader='A';s.points=[];s.log=[];s.rooms=[{x:0,y:0,w:6,h:6}];
 const a=friend('A',1,1,30,{tackle:5});a.species='mudkip';a.entrySpecies='mudkip';a.level=5;a.stages.acc=3;
 const t=enemy('T',2,1,500,'melee',0);t.species='pidgey';t.entrySpecies='pidgey';t.level=5;t.hp=t.maxHp=500;t.waitOnly=true;t.stages.acc=3;
 s.units={A:a,T:t};s.battleRng=1;s.difficulty='normal';s.noCrit=true;
 return s;
}
test('a damage line carries its type note as data and reads "X受到N伤害，效果绝佳"; the engine log keeps its separate note line',()=>{
 const s=duelWorld();s.units.T.species='geodude';s.units.T.entrySpecies='geodude';   // water against rock/ground is super effective
 s.units.A.learned=['watergun'];s.units.A.pp={watergun:5};s.units.A.maxPp={watergun:5};
 const r=applyCommand(s,{type:'round',action:{type:'skill',skill:'watergun',target:'T'}});assert.ok(r.ok,r.error);
 const hit=r.state.entries.find(e=>e.damage);assert.ok(hit,JSON.stringify(r.state.entries));
 assert.deepEqual(hit.damage.notes,['效果绝佳']);
 assert.equal(logEntryText(hit),`${speciesZh('geodude')}受到${hit.damage.amount}伤害，效果绝佳`);
 assert.ok(r.state.log.includes('效果绝佳'),'the log still has the note line');
 const folded=r.state.entries.find(e=>e.folded);assert.ok(folded&&!logEntryShown(r.state,folded),'the note line itself is not shown');
});
test('a plain hit keeps its HP; a critical hit is joined; immune and missed read as their own lines',()=>{
 const plain={n:1,parts:[{unit:'T',species:'pidgey',side:'enemy'},'受到5伤害，HP 7'],damage:{target:'T',amount:5,notes:[]}};
 assert.equal(logEntryText(plain),`${speciesZh('pidgey')}受到5伤害，HP 7`);
 assert.equal(logEntryText({...plain,damage:{...plain.damage,crit:true}}),`${speciesZh('pidgey')}受到5伤害，命中要害`);
 assert.equal(logEntryText({...plain,damage:{...plain.damage,crit:true,notes:['效果不好']}}),`${speciesZh('pidgey')}受到5伤害，命中要害，效果不好`);
 const immune={n:2,parts:[{move:'thunderbolt'},'对',{unit:'w1a',species:'geodude',side:'enemy'},'没有效果（地面系免疫电系招式）']};
 assert.equal(logEntryText(immune),`${moveZh('thunderbolt')}对${speciesZh('geodude')}没有效果（地面系免疫电系招式）`);
 const miss={n:3,parts:[{unit:'A',species:'mudkip',side:'friend'},'的',SKILL_CN.tackle??'撞击','没打中',{unit:'T',species:'pidgey',side:'enemy'}],player:[{unit:'A',species:'mudkip',side:'friend'},'的撞击没有命中',{unit:'T',species:'pidgey',side:'enemy'}]};
 assert.equal(logEntryText(miss),`${speciesZh('mudkip')}的撞击没有命中${speciesZh('pidgey')}`);
 assert.equal(logPartsText([{unit:'x',side:'enemy'}]),'敌人');assert.equal(logPartsText([{unit:'x',side:'friend'}]),'队员');assert.equal(logPartsText([{unit:'x'}]),'单位');
});
test('hidden enemies, routine steps and rows about a gone floor stay out of the record',()=>{
 const s=duelWorld();s.units.T.pos={x:4,y:4};s.seen=['1,1'];
 const say=(...parts)=>({n:1,parts});
 assert.equal(logEntryShown(s,say({unit:'T',species:'pidgey',side:'enemy'},'使用撞击')),false,'an enemy on an unseen cell');
 s.seen.push('4,4');
 assert.equal(logEntryShown(s,say({unit:'T',species:'pidgey',side:'enemy'},'使用撞击')),true,'once its cell is seen');
 assert.equal(logEntryShown(s,{n:2,parts:[{unit:'A',side:'friend'},'移动到1,2'],routine:true}),false,'plain movement');
 assert.equal(logEntryShown(s,say({unit:'A',species:'mudkip',side:'friend'},'使用撞击')),true);
 assert.equal(logEntryShown(s,say({unit:'w9z',species:'pidgey',side:'enemy'},'倒下了')),false,'an enemy that is no longer in the world');
 assert.equal(logEntryShown(s,say({unit:'A',species:'mudkip',side:'friend'},'走下楼梯')),true);
});
test('a challenge reward entry keeps its detail apart for the panel',()=>{
 const e={n:1,parts:['挑战奖励：钱袋+12'],reward:['钱袋+12']};
 assert.equal(logPartsText(e.reward),'钱袋+12');assert.ok(logEntryText(e).startsWith('挑战奖励：'));
});
