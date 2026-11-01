/** Measurement only. No game code is changed or invoked here.
 * node tools/soak/performance.mjs profile <file.cpuprofile>
 * node tools/soak/performance.mjs compare <before.json> <after.json>
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';

const [command,...files]=process.argv.slice(2);
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
if(command==='profile'&&files.length===1){
  const profile=read(files[0]),nodes=new Map(profile.nodes.map(n=>[n.id,n])),times=new Map();
  for(const [i,id] of profile.samples.entries()){
    const f=nodes.get(id).callFrame,label=`${f.functionName||'(anonymous)'} ${f.url}:${f.lineNumber+1}`;
    times.set(label,(times.get(label)??0)+profile.timeDeltas[i]);
  }
  const ordered=[...times].sort((a,b)=>b[1]-a[1]),total=ordered.reduce((sum,[,time])=>sum+time,0);
  console.log('Self time: top 10 sampled functions (inlined calls may be attributed to their caller)');
  for(const [label,time] of ordered.slice(0,10))console.log(`${(time/1e6).toFixed(3)}s ${(100*time/total).toFixed(2)}% ${label}`);
}else if(command==='compare'&&files.length===2){
  const before=read(files[0]),after=read(files[1]);
  // Report creation time is metadata, reported separately from elapsed duration.
  // Every other header field and every per-game/statistics field remains in the byte comparison.
  console.log(`Report timestamps: ${before.generated} -> ${after.generated}`);
  delete before.generated;delete after.generated;
  for(const policy of Object.keys(before.policies)){
    const b=before.policies[policy],a=after.policies[policy];
    assert.ok(a,`missing policy: ${policy}`);
    assert.ok(Number.isFinite(b.seconds)&&Number.isFinite(a.seconds),`missing elapsed seconds: ${policy}`);
    console.log(`${policy}: ${b.seconds}s -> ${a.seconds}s (${(100*(1-a.seconds/b.seconds)).toFixed(1)}% shorter)`);
    delete b.seconds;delete a.seconds;
  }
  assert.equal(JSON.stringify(after),JSON.stringify(before),'non-timing report bytes differ');
  const games=Object.values(after.policies).reduce((n,p)=>n+p.games.length,0);
  console.log(`PASS: ${games} games; normalized non-timing JSON bytes identical (only generated and policies.*.seconds excluded).`);
}else{
  throw new Error('Usage: performance.mjs profile <cpu-profile> | compare <before-json> <after-json>');
}
