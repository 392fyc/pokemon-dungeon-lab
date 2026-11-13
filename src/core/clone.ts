export type CloneObserver=(source:unknown,milliseconds:number)=>void;
let cloneObserver:CloneObserver|undefined;
/** Optional measurement hook. Leaving it unset adds only one predictable branch. */
export function setCloneObserver(observer:CloneObserver|undefined):void {cloneObserver=observer;}

// Any value outside the small World data model switches the whole graph to the
// platform clone, so aliases shared with supported values remain intact.
const USE_NATIVE_CLONE=Symbol('use native structuredClone');

/** Copy World data while keeping the ordering and reference behavior used by
 * command processing. Rich values are delegated as one graph to structuredClone. */
export function cloneGameValue<T>(value:T):T {
  const seen=new Map<object,unknown>();
  const define=(target:object,key:string,value:unknown):void=>{
    if(key==='__proto__')Object.defineProperty(target,key,{value,enumerable:true,writable:true,configurable:true});
    else (target as Record<string,unknown>)[key]=value;
  };
  const copy=(source:unknown):unknown=>{
    if(typeof source==='function'||typeof source==='symbol')throw USE_NATIVE_CLONE;
    if(source===null||typeof source!=='object')return source;
    if(seen.has(source))return seen.get(source);
    if(Array.isArray(source)){
      const result:unknown[]=new Array(source.length);seen.set(source,result);
      const record=source as unknown as Record<string,unknown>;
      for(const key of Object.keys(source))define(result,key,copy(record[key]));
      return result;
    }
    if(source instanceof Map){
      if(Object.getPrototypeOf(source)!==Map.prototype)throw USE_NATIVE_CLONE;
      const result=new Map();seen.set(source,result);
      for(const [key,value] of source)result.set(copy(key),copy(value));
      return result;
    }
    if(source instanceof Set){
      if(Object.getPrototypeOf(source)!==Set.prototype)throw USE_NATIVE_CLONE;
      const result=new Set();seen.set(source,result);
      for(const value of source)result.add(copy(value));
      return result;
    }
    if(Object.getPrototypeOf(source)!==Object.prototype)throw USE_NATIVE_CLONE;
    const result:Record<string,unknown>={};seen.set(source,result);
    const record=source as Record<string,unknown>;
    for(const key of Object.keys(record))define(result,key,copy(record[key]));
    return result;
  };
  const started=cloneObserver?performance.now():0;
  let result:T;
  try {
    result=copy(value) as T;
  } catch(error) {
    if(error!==USE_NATIVE_CLONE)throw error;
    result=structuredClone(value);
  }
  if(cloneObserver)cloneObserver(value,performance.now()-started);
  return result;
}
