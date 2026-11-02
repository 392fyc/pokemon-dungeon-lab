// #178: count terrain shapes that 47-shape tiles render badly (thin walls, pillars, liquid fragments, diagonal-only contacts). Usage: node --experimental-strip-types tools/terrain-stats-178.mjs [seeds]
import {generateFloor,DEFAULT_PARAMS} from '../src/core/dungeon.ts';
const N=+process.argv[2]||300;
const tot={floors:0,thinWall:0,thinWallFloor:0,pillar:0,floorsThinWall:0,floorsPillar:0,liqIso:0,liqThin:0,floorsLiqIso:0,floorsLiqThin:0,diagFloor:0,floorsDiagFloor:0,diagLiq:0,floorsDiagLiq:0,liqTotal:0};
const byLevel={};
for(let seed=1;seed<=N;seed++)for(let level=1;level<=3;level++){
 const g=generateFloor(seed,level,DEFAULT_PARAMS);const W=g.width,H=g.height;
 const F=new Set(g.floor.map(c=>c.x+','+c.y));const L=new Set((g.liquid??[]).map(c=>c.x+','+c.y));
 const kind=(x,y)=>x<0||y<0||x>=W||y>=H?'w':F.has(x+','+y)?'f':L.has(x+','+y)?'l':'w';
 let tw=0,twf=0,pl=0,li=0,lt=0,df=0,dl=0;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const k=kind(x,y);
  const n=kind(x,y-1),s=kind(x,y+1),e=kind(x+1,y),w=kind(x-1,y);
  if(k==='w'){const ns=n!=='w'&&s!=='w',ew=e!=='w'&&w!=='w';if(ns||ew)tw++;if((n==='f'&&s==='f')||(e==='f'&&w==='f'))twf++;if(n!=='w'&&s!=='w'&&e!=='w'&&w!=='w')pl++;}
  if(k==='l'){const c=[n,s,e,w].filter(v=>v==='l').length;if(c===0)li++;else if((n!=='l'&&s!=='l')||(e!=='l'&&w!=='l'))lt++;}
  // 2x2 diagonal-only
  const a=kind(x,y),b=kind(x+1,y),c=kind(x,y+1),d=kind(x+1,y+1);
  for(const t of ['f','l']){if((a===t&&d===t&&b!==t&&c!==t)||(b===t&&c===t&&a!==t&&d!==t)){if(t==='f')df++;else dl++;}}
 }
 tot.floors++;tot.thinWall+=tw;tot.thinWallFloor+=twf;tot.pillar+=pl;tot.liqIso+=li;tot.liqThin+=lt;tot.diagFloor+=df;tot.diagLiq+=dl;tot.liqTotal+=L.size;
 if(tw)tot.floorsThinWall++;if(pl)tot.floorsPillar++;if(li)tot.floorsLiqIso++;if(lt)tot.floorsLiqThin++;if(df)tot.floorsDiagFloor++;if(dl)tot.floorsDiagLiq++;
 let has2=false;for(let y=0;y<H-1&&!has2;y++)for(let x=0;x<W-1;x++)if(kind(x,y)==='l'&&kind(x+1,y)==='l'&&kind(x,y+1)==='l'&&kind(x+1,y+1)==='l'){has2=true;break;}
 const bl=byLevel[level]??={floors:0,liq:0,thinWall:0,liqIso:0,diagFloor:0};bl.floors++;bl.liq+=L.size;bl.thinWall+=tw;bl.liqIso+=li;bl.diagFloor+=df;bl.liq2x2=(bl.liq2x2??0)+(has2?1:0);
}
console.log(JSON.stringify({seeds:N,tot,byLevel},null,1));
