/** Compare command-state copies on the fixed baseline and current worktree.
 * Run from this worktree with --baseline <project-root>:
 * node --experimental-strip-types tools/perf227-clone.mjs --baseline <project-root>
 * The command sequence is fixed wait input for seeds 1..N; every resulting
 * canonical byte stream is compared before the next command. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as candidate from '../src/core/engine.ts';
import {cloneGameValue,setCloneObserver} from '../src/core/clone.ts';
import {serialize} from './perf227-serialize.mjs';

const args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf('--'+name);return i>=0?args[i+1]:fallback;};
const seeds=Number(option('seeds','30')),turns=Number(option('turns','10'));
if(!Number.isSafeInteger(seeds)||seeds<1||!Number.isSafeInteger(turns)||turns<1)throw new Error('--seeds and --turns must be positive integers');
const baselineProjectValue=option('baseline',undefined);
if(!baselineProjectValue)throw new Error('pass --baseline <path-to-baseline-project>');
const baselineProject=path.resolve(baselineProjectValue);
const baselineCore=path.join(baselineProject,'src','core');
const baseline=await import(pathToFileURL(path.join(baselineCore,'engine.ts')).href);

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonicalBytes=value=>Buffer.from(serialize(value),'utf8');
async function sourceHashes(project){
  const hashes={};
  const visit=async directory=>{
    for(const entry of await fs.readdir(directory,{withFileTypes:true})){
      const file=path.join(directory,entry.name);
      if(entry.isDirectory())await visit(file);
      else if(entry.isFile()&&entry.name.endsWith('.ts')){
        const relative=path.relative(path.join(project,'src','core'),file).split(path.sep).join('/');
        hashes[relative]=digest(await fs.readFile(file));
      }
    }
  };
  await visit(path.join(project,'src','core'));
  return Object.fromEntries(Object.entries(hashes).sort(([a],[b])=>a.localeCompare(b)));
}
const stats=values=>{
  const sorted=[...values].sort((a,b)=>a-b);
  return {n:sorted.length,avgMs:+(sorted.reduce((a,b)=>a+b,0)/sorted.length).toFixed(3),p95Ms:+sorted[Math.ceil(.95*sorted.length)-1].toFixed(3),maxMs:+sorted.at(-1).toFixed(3)};
};
const sameBytes=(a,b,label)=>{
  const left=canonicalBytes(a),right=canonicalBytes(b);
  if(!left.equals(right))throw new Error('canonical bytes differ: '+label);
  return digest(left);
};

const sourceSha256={baseline:await sourceHashes(baselineProject),candidate:await sourceHashes(process.cwd())};

// Direct World-copy distribution. Each sample uses the same generated World.
const worlds=[];
for(let seed=1;seed<=seeds;seed++){
  const baseState=baseline.createExpedition('perf227-'+seed,seed,3);
  const candidateState=cloneGameValue(baseState);
  sameBytes(baseState,candidateState,'initial world seed '+seed);
  worlds.push(candidateState);
}
const nativeWorldCopyMs=[],customWorldCopyMs=[];
for(const world of worlds)for(let repeat=0;repeat<10;repeat++){
  let started;
  if(repeat%2){started=performance.now();structuredClone(world);nativeWorldCopyMs.push(performance.now()-started);started=performance.now();cloneGameValue(world);customWorldCopyMs.push(performance.now()-started);}
  else{started=performance.now();cloneGameValue(world);customWorldCopyMs.push(performance.now()-started);started=performance.now();structuredClone(world);nativeWorldCopyMs.push(performance.now()-started);}
}

// Instrument native and task-local copies. Root identity separates the two
// complete World copies from the smaller copied positions/actions in a command.
const nativeStructuredClone=globalThis.structuredClone;
let active=null;
globalThis.structuredClone=(source,options)=>{
  const started=performance.now();
  try{return nativeStructuredClone(source,options);}
  finally{if(active?.kind==='baseline')active.copies.push({world:source===active.world,ms:performance.now()-started});}
};
setCloneObserver((source,milliseconds)=>{
  if(active?.kind==='candidate')active.copies.push({world:source===active.world,ms:milliseconds});
});
const commands={baseline:[],candidate:[]},sequences=[];let byteComparisons=0;
for(let seed=1;seed<=seeds;seed++){
  let left=baseline.createExpedition('perf227-'+seed,seed,3),right=cloneGameValue(left);
  sameBytes(left,right,'initial command state seed '+seed);
  for(let turn=0;turn<turns&&left.phase==='playing'&&right.phase==='playing';turn++){
    const command={type:'round',action:{type:'wait'}};
    const baseContext={kind:'baseline',world:left,copies:[]};active=baseContext;
    const baseStart=performance.now();const baseResult=baseline.applyCommand(left,command);const baseMs=performance.now()-baseStart;active=null;
    const candidateContext={kind:'candidate',world:right,copies:[]};active=candidateContext;
    const candidateStart=performance.now();const candidateResult=candidate.applyCommand(right,command);const candidateMs=performance.now()-candidateStart;active=null;
    if(baseResult.ok!==candidateResult.ok)throw new Error('command acceptance differs at seed '+seed+' turn '+turn);
    const stateDigest=sameBytes(baseResult.state,candidateResult.state,'command state seed '+seed+' turn '+turn);byteComparisons++;
    for(const [name,elapsed,context] of [['baseline',baseMs,baseContext],['candidate',candidateMs,candidateContext]]){
      const worldCopies=context.copies.filter(x=>x.world),smallCopies=context.copies.filter(x=>!x.world);
      commands[name].push({seed,turn,elapsedMs:elapsed,worldCopies:worldCopies.length,worldCopyMs:worldCopies.reduce((n,x)=>n+x.ms,0),smallCopies:smallCopies.length,smallCopyMs:smallCopies.reduce((n,x)=>n+x.ms,0),allCopyMs:context.copies.reduce((n,x)=>n+x.ms,0)});
    }
    sequences.push({seed,turn,stateSha256:stateDigest});
    if(!baseResult.ok)break;
    left=baseResult.state;right=candidateResult.state;
  }
}
setCloneObserver(undefined);
globalThis.structuredClone=nativeStructuredClone;

const commandSummary=Object.fromEntries(Object.entries(commands).map(([name,rows])=>[name,{
  commands:rows.length,elapsedMs:stats(rows.map(r=>r.elapsedMs)),worldCopies:stats(rows.map(r=>r.worldCopies)),
  worldCopyMs:stats(rows.map(r=>r.worldCopyMs)),smallCopies:stats(rows.map(r=>r.smallCopies)),
  smallCopyMs:stats(rows.map(r=>r.smallCopyMs)),allCopyMs:stats(rows.map(r=>r.allCopyMs))
}]));
const report={task:'perf227',collectedAt:new Date().toISOString(),baselineProject,sourceSha256,candidateHead:'uncommitted worktree',node:process.version,machine:{platform:process.platform,release:os.release(),cpu:os.cpus()[0]?.model,logicalCpus:os.cpus().length,memoryBytes:os.totalmem()},seeds,turnLimit:turns,worldCloneSamplesPerMethod:nativeWorldCopyMs.length,worldCloneMs:{structuredClone:stats(nativeWorldCopyMs),cloneGameValue:stats(customWorldCopyMs)},commandSummary,byteComparison:{encoding:'ordered properties; explicit undefined and array holes; ordered Map/Set; references encoded by traversal order',commandsCompared:byteComparisons,allEqual:true,sha256:sequences},samples:commands};
const out=option('out',path.resolve('.tmp','perf227-clone.json'));
await fs.mkdir(path.dirname(out),{recursive:true});
await fs.writeFile(out,JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify({out,baselineProject,sourceSha256,seeds,turnLimit:turns,worldCloneMs:report.worldCloneMs,commandSummary,byteComparison:{commandsCompared:byteComparisons,allEqual:true}},null,2));
