// Keep undefined, property order, sparse slots, shared references and Map/Set order.
export function serialize(value){
 const seen=new Map();
 const encode=v=>{
  if(v===undefined)return ['undefined'];
  if(v===null)return ['null'];
  if(typeof v==='number')return ['number',Number.isNaN(v)?'NaN':Object.is(v,-0)?'-0':String(v)];
  if(typeof v==='string'||typeof v==='boolean'||typeof v==='bigint')return [typeof v,String(v)];
  if(typeof v!=='object')throw new Error('unsupported result value: '+typeof v);
  if(seen.has(v))return ['ref',seen.get(v)];
  const id=seen.size;seen.set(v,id);
  if(v instanceof Map)return ['map',id,[...v].map(([k,x])=>[encode(k),encode(x)])];
  if(v instanceof Set)return ['set',id,[...v].map(encode)];
  if(Array.isArray(v))return ['array',id,v.length,Object.keys(v).map(k=>[k,encode(v[k])])];
  if(Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)throw new Error('unsupported result prototype');
  return ['object',id,Object.keys(v).map(k=>[k,encode(v[k])])];
 };
 return JSON.stringify(encode(value));
}
