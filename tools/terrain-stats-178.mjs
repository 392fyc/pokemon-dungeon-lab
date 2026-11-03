// #178: count terrain shapes that 47-shape tiles render badly (thin walls, pillars, liquid fragments, diagonal-only contacts) plus generation cost.
// Usage: node --experimental-strip-types tools/terrain-stats-178.mjs [seeds] [first-seed]
// DUNGEON_MODULE=<file URL or path of another dungeon.ts> compares an older generator (for example the main checkout before #178).
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const mod=process.env.DUNGEON_MODULE?pathToFileURL(resolve(process.env.DUNGEON_MODULE)).href:new URL('../src/core/dungeon.ts',import.meta.url).href;
const {generateFloor,DEFAULT_PARAMS}=await import(mod);
const N=+process.argv[2]||300,FIRST=+process.argv[3]||1;
const tot={floors:0,
 thinWall:0,          // any wall cell with non-wall cells on two opposite sides
 thinWallFloor:0,     // ... both of them ground  (target 0)
 thinWallLiquid:0,    // ... at least one of them liquid (reported; the shaping fills what it can)
 pillar:0,            // wall cell whose four orthogonal neighbours are all non-wall (target 0)
 liqIso:0,            // liquid cell with no liquid orthogonal neighbour (target 0)
 liqThin:0,           // liquid cell 1 wide (no liquid on both ends of an axis) (target 0)
 diagFloor:0,         // 2x2 window whose only ground cells are diagonal (target 0)
 diagLiq:0,           // same for liquid (target 0)
 liqTotal:0,floorsWith:{},};
const flag=name=>tot.floorsWith[name]=(tot.floorsWith[name]??0)+1;
const byLevel={},times=[],stat={layoutAttempts:0,connectionRetries:0,shapeRetries:0,liquidRetries:0,liquidLayoutRetries:0},statMax={};
for(let seed=FIRST;seed<FIRST+N;seed++)for(let level=1;level<=3;level++){
 const t0=performance.now();
 const g=generateFloor(seed,level,DEFAULT_PARAMS);
 times.push(performance.now()-t0);
 for(const key of Object.keys(stat))if(g.generationStats[key]!==undefined){stat[key]+=g.generationStats[key];statMax[key]=Math.max(statMax[key]??0,g.generationStats[key]);}
 const W=g.width,H=g.height;
 const F=new Set(g.floor.map(c=>c.x+','+c.y)),L=new Set((g.liquid??[]).map(c=>c.x+','+c.y));
 const kind=(x,y)=>x<0||y<0||x>=W||y>=H?'w':F.has(x+','+y)?'f':L.has(x+','+y)?'l':'w';
 const n_={thinWall:0,thinWallFloor:0,thinWallLiquid:0,pillar:0,liqIso:0,liqThin:0,diagFloor:0,diagLiq:0};
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const k=kind(x,y),n=kind(x,y-1),s=kind(x,y+1),e=kind(x+1,y),w=kind(x-1,y);
  if(k==='w'){
   for(const [a,b] of [[n,s],[e,w]])if(a!=='w'&&b!=='w'){
    n_.thinWall++;
    if(a==='f'&&b==='f')n_.thinWallFloor++;else if(a==='l'||b==='l')n_.thinWallLiquid++;
   }
   if(n!=='w'&&s!=='w'&&e!=='w'&&w!=='w')n_.pillar++;
  }
  if(k==='l'){
   if(![n,s,e,w].includes('l'))n_.liqIso++;
   else if((n!=='l'&&s!=='l')||(e!=='l'&&w!=='l'))n_.liqThin++;
  }
  const a=kind(x,y),b=kind(x+1,y),c=kind(x,y+1),d=kind(x+1,y+1);
  for(const t of ['f','l'])if((a===t&&d===t&&b!==t&&c!==t)||(b===t&&c===t&&a!==t&&d!==t))n_[t==='f'?'diagFloor':'diagLiq']++;
 }
 tot.floors++;tot.liqTotal+=L.size;
 for(const key of Object.keys(n_)){tot[key]+=n_[key];if(n_[key])flag(key);}
 let has2=false;
 for(let y=0;y<H-1&&!has2;y++)for(let x=0;x<W-1;x++)if(kind(x,y)==='l'&&kind(x+1,y)==='l'&&kind(x,y+1)==='l'&&kind(x+1,y+1)==='l'){has2=true;break;}
 const bl=byLevel[level]??={floors:0,liq:0,liqMin:1e9,liqMax:0,liqShareMax:0,thinWall:0,thinWallLiquid:0,liqIso:0,diagFloor:0,floorsWith2x2Liquid:0};
 bl.floors++;bl.liq+=L.size;bl.liqMin=Math.min(bl.liqMin,L.size);bl.liqMax=Math.max(bl.liqMax,L.size);bl.liqShareMax=+Math.max(bl.liqShareMax,L.size/(W*H-F.size)).toFixed(3);bl.thinWall+=n_.thinWall;bl.thinWallLiquid+=n_.thinWallLiquid;bl.liqIso+=n_.liqIso;bl.diagFloor+=n_.diagFloor;
 if(has2)bl.floorsWith2x2Liquid++;
}
times.sort((a,b)=>a-b);
const q=p=>+times[Math.min(times.length-1,Math.floor(times.length*p))].toFixed(1);
const perFloor=Object.fromEntries(Object.entries(stat).map(([key,v])=>[key,+(v/tot.floors).toFixed(3)]));
console.log(JSON.stringify({seeds:N,firstSeed:FIRST,tot,byLevel,
 generation:{perFloorAverage:perFloor,perFloorMax:statMax,ms:{avg:+(times.reduce((a,b)=>a+b,0)/times.length).toFixed(2),p50:q(0.5),p99:q(0.99),max:+times[times.length-1].toFixed(1)}}},null,1));
