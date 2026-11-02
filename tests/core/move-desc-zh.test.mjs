import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Data check for src/data/move-desc-zh.json (issue #167): every move the roster or the TM list can show
// has a description or an explicit missing entry, and no description is empty.
const read=(f)=>JSON.parse(readFileSync(new URL(`../../src/data/${f}`,import.meta.url),'utf8'));
const desc=read('move-desc-zh.json');
const roster=read('roster.json');
const names=read('names-zh.json');
const ids=new Set(Object.keys(names.tms));
for(const s of roster.species)for(const k of ['kit','learnable'])for(const m of s[k]??[])ids.add(m.move);

test('every roster and TM move has a description or a missing entry',()=>{
 const lost=[...ids].filter(i=>!(i in desc.moves)&&!(i in desc.missing));
 assert.deepEqual(lost,[]);
});
test('descriptions are non-empty and carry their source fields',()=>{
 for(const [id,v] of Object.entries(desc.moves)){
  assert.ok(typeof v.desc==='string'&&v.desc.trim().length>0,id);
  assert.ok(v.name&&v.page&&v.game,id);
  assert.ok(Number.isInteger(v.revid)&&Number.isInteger(v.tplRevid),id);
 }
 assert.ok(desc.source.license.includes('D-20261103-05'));
});
