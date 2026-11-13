// Compare fixed baseline/current checkouts using the real five-game bot.
// node tools/perf227-soak.mjs --baseline <checkout> --seeds 4 --out <report.json>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {serialize} from './perf227-serialize.mjs';

const args=process.argv.slice(2),option=(key,fallback)=>{const i=args.indexOf('--'+key);return i<0?fallback:args[i+1];};
const root=fileURLToPath(new URL('..',import.meta.url)),baseline=option('baseline');
if(!baseline)throw new Error('--baseline must name the fixed baseline checkout');
const seeds=Number(option('seeds','4'));
if(!Number.isSafeInteger(seeds)||seeds<1)throw new Error('--seeds must be a positive integer');
const policies=option('policies','naive,tactical,tactical-stand,cautious').split(',');
if(!policies.length||new Set(policies).size!==policies.length||policies.some(p=>!['naive','tactical','tactical-stand','cautious'].includes(p)))throw new Error('invalid --policies');
const output=path.resolve(option('out','.tmp/perf227-soak.json'));
fs.mkdirSync(path.dirname(output),{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
function sourceFiles(directory){
 const files=['src/core/engine.ts','src/core/dungeon.ts','src/core/clone.ts','tests/core/soak-bot.mjs'].filter(file=>fs.existsSync(path.join(directory,file)));
 return Object.fromEntries(files.map(file=>[file,hash(fs.readFileSync(path.join(directory,file)))]));
}
const before=await import(pathToFileURL(path.resolve(baseline,'tests/core/soak-bot.mjs')).href);
const after=await import(new URL('../tests/core/soak-bot.mjs',import.meta.url));
const report={createdAt:new Date().toISOString(),machine:{platform:os.platform(),release:os.release(),cpu:os.cpus()[0]?.model,node:process.version},baseline:path.resolve(baseline),candidate:root,sourceFiles:{before:sourceFiles(baseline),after:sourceFiles(root)},seeds,policies,rows:[]};
const write=()=>fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
for(const policy of policies)for(let seed=0;seed<seeds;seed++){
 const options={policy,difficulty:'normal',talents:0};
 const first=performance.now(),oldResult=await before.playSeed(seed,options),beforeMs=performance.now()-first;
 const second=performance.now(),newResult=await after.playSeed(seed,options),afterMs=performance.now()-second;
 const oldBytes=serialize(oldResult),newBytes=serialize(newResult),equal=oldBytes===newBytes;
 report.rows.push({policy,seed,games:oldResult.games.length,beforeMs,afterMs,bytes:Buffer.byteLength(oldBytes),beforeSha256:hash(oldBytes),afterSha256:hash(newBytes),equal});
 write();console.log(JSON.stringify(report.rows.at(-1)));
 if(newResult.games.some(game=>game.outcome==='timeout'))throw new Error('game timed out for '+policy+' seed '+seed);
 if(!equal){
  fs.writeFileSync(output+'.before-mismatch.json',oldBytes);fs.writeFileSync(output+'.after-mismatch.json',newBytes);
  throw new Error('game result bytes changed for '+policy+' seed '+seed);
 }
}
report.total={games:report.rows.reduce((sum,row)=>sum+row.games,0),beforeMs:report.rows.reduce((sum,row)=>sum+row.beforeMs,0),afterMs:report.rows.reduce((sum,row)=>sum+row.afterMs,0),allEqual:true};
report.total.reductionPercent=100*(1-report.total.afterMs/report.total.beforeMs);
write();console.log(JSON.stringify(report.total));
