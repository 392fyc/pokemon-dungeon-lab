import test from 'node:test';
import assert from 'node:assert/strict';
import {createScenario} from '../../src/core/scenarios.ts';
import {V,K,K5} from './fixtures.mjs';

function unitView(u){const v=structuredClone(u);if(v.recruit)delete v.recruit.pos;return v;}

// Production scenarios are only the observed subject here, never an expectation generator.
for(const id of [3,4,5,6,7,8,9,10,11,12,13])test('shipped V'+id+' matches independent fixture inputs',()=>{
 const expected=V(id),actual=createScenario('V'+id,'acceptance');
 for(const field of ['floor','queue','camp','leader','points','goal','bag','phase','anchor'])assert.deepEqual(actual[field],expected[field],field);
 // Dead enemy registry entries and internal blocker names are not specification differences.
 const live=s=>s.enemies.map(i=>s.units[i]).filter(u=>u.hp>0).map(u=>{const v=unitView(u);delete v.id;return v;});
 assert.deepEqual(live(actual),live(expected),'live enemy inputs');
 for(const [name,u] of Object.entries(expected.units))if(u.side==='friend')assert.deepEqual(unitView(actual.units[name]),unitView(u),name);
});
for(const id of ['K1','K2','K5'])test('shipped '+id+' matches independent fixture inputs',()=>{
 const expected=id==='K5'?K5():K(id==='K2'),actual=createScenario(id,'acceptance');
 for(const field of ['floor','queue','enemies','camp','leader','points','goal','bag','phase','anchor'])assert.deepEqual(actual[field],expected[field],field);
 for(const [name,u] of Object.entries(expected.units))assert.deepEqual(actual.units[name],u,name);
});
