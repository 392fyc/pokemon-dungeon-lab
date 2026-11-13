import assert from 'node:assert/strict';
import test from 'node:test';
import {cloneGameValue} from '../../src/core/clone.ts';
import {createExpedition} from '../../src/core/engine.ts';
import {serialize} from '../../tools/perf227-serialize.mjs';

const assertSameBytes=(actual,expected)=>assert.deepEqual(Buffer.from(serialize(actual),'utf8'),Buffer.from(serialize(expected),'utf8'));

test('game-state clone preserves key order, undefined, Map/Set order, aliases and cycles',()=>{
  const shared={missing:undefined};
  const source={second:2,first:1,unset:undefined,list:[,shared],map:new Map([['first',shared],[shared,'last']]),set:new Set([shared,undefined])};
  source.self=source;source.alias=shared;
  const actual=cloneGameValue(source),expected=structuredClone(source);
  assert.deepEqual(Object.keys(actual),Object.keys(expected));
  assert.equal(Object.hasOwn(actual,'unset'),true);
  assert.equal(actual.unset,undefined);
  assert.equal(0 in actual.list,false);
  assert.equal(actual.self,actual);
  assert.equal(actual.alias,actual.list[1]);
  assert.deepEqual([...actual.map.keys()].map(k=>typeof k==='string'?k:'shared'),['first','shared']);
  assert.equal(actual.map.get(actual.alias),'last');
  assert.deepEqual([...actual.set].map(v=>v===undefined?'undefined':'shared'),['shared','undefined']);
  assertSameBytes(actual,expected);
});

test('generated expedition remains byte-identical after copying its World',()=>{
  const state=createExpedition('perf227-seed-17',17,3);
  assertSameBytes(cloneGameValue(state),structuredClone(state));
});

test('native fallback preserves rich-value aliases and native RegExp state',()=>{
  const expression=/room/g;expression.lastIndex=3;
  const shared={expression};
  const source={first:shared,again:shared,expression};
  const actual=cloneGameValue(source),expected=structuredClone(source);
  assert.equal(actual.first===actual.again,expected.first===expected.again);
  assert.equal(actual.expression===actual.first.expression,expected.expression===expected.first.expression);
  assert.equal(actual.expression.lastIndex,expected.expression.lastIndex);
  assert.equal(actual.expression.lastIndex,0);
  assert.equal(actual.expression.source,expected.expression.source);
  assert.equal(actual.expression.flags,expected.expression.flags);

  const nullPrototype=Object.create(null);
  nullPrototype.present=undefined;
  const normalized=cloneGameValue(nullPrototype),native=structuredClone(nullPrototype);
  assert.equal(Object.getPrototypeOf(normalized),Object.getPrototypeOf(native));
  assertSameBytes(normalized,native);
});

test('plain object copies __proto__ as data and arrays copy own enumerable keys only',()=>{
  const object={value:1};
  Object.defineProperty(object,'__proto__',{value:{marker:true},enumerable:true,writable:true,configurable:true});
  const copiedObject=cloneGameValue(object),nativeObject=structuredClone(object);
  assert.equal(Object.getPrototypeOf(copiedObject),Object.prototype);
  assert.equal(Object.hasOwn(copiedObject,'__proto__'),true);
  assertSameBytes(copiedObject,nativeObject);

  const arrayPrototype=Object.create(Array.prototype);
  arrayPrototype[1]='inherited';
  const array=new Array(3);
  array[0]='own';
  array.extra=undefined;
  Object.defineProperty(array,'__proto__',{value:'data key',enumerable:true,writable:true,configurable:true});
  Object.setPrototypeOf(array,arrayPrototype);
  const copiedArray=cloneGameValue(array),nativeArray=structuredClone(array);
  assert.equal(1 in copiedArray,false);
  assert.equal(Object.hasOwn(copiedArray,'extra'),true);
  assert.equal(Object.hasOwn(copiedArray,'__proto__'),true);
  assertSameBytes(copiedArray,nativeArray);
});

test('function and symbol values use native rejection while symbol keys are ignored',()=>{
  for(const value of [()=>{},Symbol('value')]){
    const source={value};
    assert.throws(()=>structuredClone(source));
    assert.throws(()=>cloneGameValue(source));
  }
  const key=Symbol('ignored');
  const source={visible:1};
  Object.defineProperty(source,key,{value:'ignored',enumerable:true});
  const actual=cloneGameValue(source),expected=structuredClone(source);
  assert.equal(Object.hasOwn(actual,key),false);
  assertSameBytes(actual,expected);
});
