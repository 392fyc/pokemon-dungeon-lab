// Paired, ordered full-output comparison; instrumentation never enters the generated data.
// node tools/perf227-generation.mjs --baseline <checkout> --seeds 1000 --out <report.json>
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {serialize} from './perf227-serialize.mjs';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),opt=(name,fallback)=>{const at=args.indexOf('--'+name);return at<0?fallback:args[at+1];};
const baseline=opt('baseline');if(!baseline)throw Error('--baseline is required');
const seeds=Number(opt('seeds','1000'));if(!Number.isSafeInteger(seeds)||seeds<1)throw Error('invalid seed count');
const output=path.resolve(opt('out','.tmp/perf227-generation.json'));fs.mkdirSync(path.dirname(output),{recursive:true});
const old=await import(pathToFileURL(path.resolve(baseline,'src/core/dungeon.ts')).href),now=await import('../src/core/dungeon.ts');
const sha=content=>createHash('sha256').update(content).digest('hex');
const report={createdAt:new Date().toISOString(),machine:{platform:os.platform(),cpu:os.cpus()[0]?.model,node:process.version},seeds,baseline:path.resolve(baseline),sourceSha256:{before:sha(fs.readFileSync(path.resolve(baseline,'src/core/dungeon.ts'))),after:sha(fs.readFileSync(new URL('../src/core/dungeon.ts',import.meta.url)))},rows:[]};
for(let seed=1;seed<=seeds;seed++)for(let level=1;level<=3;level++){
 const started=performance.now(),a=old.generateFloor(seed,level,old.DEFAULT_PARAMS),beforeMs=performance.now()-started;
 const phases={layout:0,liquid:0,placement:0};
 const next=performance.now(),b=now.generateFloor(seed,level,now.DEFAULT_PARAMS,(phase,ms)=>phases[phase]+=ms),afterMs=performance.now()-next;
 const before=serialize(a),after=serialize(b);
 if(before!==after){fs.writeFileSync(output+'.before-mismatch.json',before);fs.writeFileSync(output+'.after-mismatch.json',after);throw Error('generated output changed at seed '+seed+' / level '+level);}
 report.rows.push({seed,level,beforeMs,afterMs,phases,bytes:Buffer.byteLength(after),sha256:sha(after),layoutAttempts:b.generationStats.layoutAttempts});
}
const stats=values=>{const xs=[...values].sort((a,b)=>a-b);return {mean:xs.reduce((a,b)=>a+b,0)/xs.length,p95:xs[Math.ceil(xs.length*.95)-1],max:xs.at(-1)};};
report.summary={floors:report.rows.length,allEqual:true,beforeMs:stats(report.rows.map(r=>r.beforeMs)),afterMs:stats(report.rows.map(r=>r.afterMs)),phases:Object.fromEntries(['layout','liquid','placement'].map(p=>[p,stats(report.rows.map(r=>r.phases[p]))]))};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary,null,2));
