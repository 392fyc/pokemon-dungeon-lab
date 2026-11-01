// 8.5b 地形与图块的可行性验证（main 云端工作者，只读调用 src/core/dungeon.ts）。
//
// 回答三个问题：
// 1 现行 8.2 生成器的通道有多长、有没有死路（基准）；
// 2 草案的“曲折通道”（每段 3—5 步、按概率转弯、允许小幅横移）在同样的房间上能不能连通、通道多长、死路多少；
//   房间间隔 gap 从 2 提到 3、4 时房间还放不放得下；
// 3 第二地形（河流＋小湖）只占“非地面格”时，画面里能看到多少，会不会改变地面（不改变连通性）；
// 另外输出 8 邻位掩码归并后的 47 种形状及其帧号（规格第 4 节的映射表）。
//
// 运行（Node 24）：node --experimental-strip-types tools/verify/terrain-85b.mjs [--seeds 300] [--json 路径] [--maps 目录]
// --maps：每个主题取种子 1—3，按建议的生成（间隔 3、曲折通道）加第二地形，各写一张俯视 PNG（每格 4 像素）和同名字符画 .txt。
//   放进被忽略的目录（例如 .artifacts/terrain-maps），不入库。字符：# 墙  . 通道  : 房间地面  ~ 水  ^ 岩浆
import {writeFileSync,mkdirSync} from 'node:fs';
import {deflateSync,crc32} from 'node:zlib';
import {generateFloor,mulberry32,center,roomCells} from '../../src/core/dungeon.ts';

const args=process.argv.slice(2);
const opt=(n,d)=>{const i=args.indexOf(n);return i>=0?args[i+1]:d;};
const SEEDS=Number(opt('--seeds',300)),JSON_OUT=opt('--json',null),MAPS=opt('--maps',null);
const W=36,H=24;
const k=p=>`${p.x},${p.y}`;
const DIRS=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];
const inRect=(p,r)=>p.x>=r.x&&p.x<r.x+r.w&&p.y>=r.y&&p.y<r.y+r.h;

// ---------- 47 种形状：PDMN 的位序（北1 东北2 东4 东南8 南16 西南32 西64 西北128），斜角只在两侧正方向都同类时保留 ----------
export const BIT={N:1,NE:2,E:4,SE:8,S:16,SW:32,W:64,NW:128};
export function reduceMask(m){
  if(!((m&BIT.N)&&(m&BIT.E)))m&=~BIT.NE;
  if(!((m&BIT.E)&&(m&BIT.S)))m&=~BIT.SE;
  if(!((m&BIT.S)&&(m&BIT.W)))m&=~BIT.SW;
  if(!((m&BIT.W)&&(m&BIT.N)))m&=~BIT.NW;
  return m;
}
export const SHAPES=[...new Set(Array.from({length:256},(_,m)=>reduceMask(m)))].sort((a,b)=>a-b);
export const FRAME_OF=new Map(SHAPES.map((m,i)=>[m,i]));
/** 一格的形状帧号：same(dx,dy) 判断邻格是否与本格同类。 */
export function shapeFrame(same){
  let m=0;const n=[[0,-1,BIT.N],[1,-1,BIT.NE],[1,0,BIT.E],[1,1,BIT.SE],[0,1,BIT.S],[-1,1,BIT.SW],[-1,0,BIT.W],[-1,-1,BIT.NW]];
  for(const [dx,dy,b] of n)if(same(dx,dy))m|=b;
  return FRAME_OF.get(reduceMask(m));
}

// ---------- 通用度量 ----------
function metrics(floor,rooms){
  const cells=new Set(floor.map(k)),inRoom=c=>rooms.some(r=>inRect(c,r));
  // 连通
  const start=floor[0],seen=new Set([k(start)]),q=[start];
  for(let i=0;i<q.length;i++)for(const d of DIRS){const n={x:q[i].x+d.x,y:q[i].y+d.y};if(cells.has(k(n))&&!seen.has(k(n))){seen.add(k(n));q.push(n);}}
  const connected=seen.size===cells.size;
  // 2 格宽：每个地面格都属于某个全地面的 2×2 块
  const block=(x,y)=>cells.has(k({x,y}))&&cells.has(k({x:x+1,y}))&&cells.has(k({x,y:y+1}))&&cells.has(k({x:x+1,y:y+1}));
  const twoWide=floor.every(c=>block(c.x,c.y)||block(c.x-1,c.y)||block(c.x,c.y-1)||block(c.x-1,c.y-1));
  // 死路：不碰房间的全地面 2×2 块，四条边里只有一条朝外有地面
  let deadEnds=0;
  for(const c of floor){const {x,y}=c;if(!block(x,y))continue;
    const quad=[{x,y},{x:x+1,y},{x,y:y+1},{x:x+1,y:y+1}];if(quad.some(inRoom))continue;
    const open=[[{x,y:y-1},{x:x+1,y:y-1}],[{x:x+2,y},{x:x+2,y:y+1}],[{x,y:y+2},{x:x+1,y:y+2}],[{x:x-1,y},{x:x-1,y:y+1}]]
      .filter(side=>side.some(p=>cells.has(k(p)))).length;
    if(open===1)deadEnds++;}
  // 通道长度：从房间 A 的门外第一格出发，只走非房间地面，到达另一房间 B 门外所走的格数（每对直接相连的房间取最短）
  const lens=[];
  rooms.forEach((A,ai)=>{
    const dist=new Map(),qq=[];
    for(const c of roomCells(A))for(const d of DIRS){const n={x:c.x+d.x,y:c.y+d.y};if(cells.has(k(n))&&!inRoom(n)&&!dist.has(k(n))){dist.set(k(n),1);qq.push(n);}}
    const best=new Map();
    for(let i=0;i<qq.length;i++){const c=qq[i],dc=dist.get(k(c));
      for(const d of DIRS){const n={x:c.x+d.x,y:c.y+d.y};if(!cells.has(k(n)))continue;
        const bi=rooms.findIndex(r=>inRect(n,r));
        if(bi>=0){if(bi!==ai&&(!best.has(bi)||best.get(bi)>dc))best.set(bi,dc);continue;}
        if(!dist.has(k(n))){dist.set(k(n),dc+1);qq.push(n);}}}
    for(const [bi,l] of best)if(bi>ai)lens.push(l);
  });
  return {connected,twoWide,deadEnds,lens};
}

// ---------- 参考生成器：房间放置与 8.2 相同（gap 可调），通道改为曲折 ----------
function referenceLayout(seed,level,{gap=2,meander=true,seg=[3,5],pTurn=0.35,pJog=0.25}={}){
  const bossFloor=level===3;
  const rng=mulberry32((Math.imul(seed>>>0,0x9E3779B1)^Math.imul(level,0x85EBCA6B)^0x2F1C3A5B)>>>0);
  const int=(lo,hi)=>lo+Math.floor(rng()*(hi-lo+1));
  const spots=['center','east','south','west','north'];
  const spot=bossFloor?(rng()<.5?'center':spots[int(1,4)]):null;
  const bossRect=s=>{const cx=Math.floor((W-7)/2),cy=Math.floor((H-7)/2);
    return {...({center:{x:cx,y:cy},east:{x:W-8,y:cy},west:{x:1,y:cy},north:{x:cx,y:1},south:{x:cx,y:H-8}})[s],w:7,h:7};};
  const target=int(9,12);
  const apart=(a,b)=>a.x>=b.x+b.w+gap||b.x>=a.x+a.w+gap||a.y>=b.y+b.h+gap||b.y>=a.y+a.h+gap;
  let rooms=[],boss=-1;
  for(let layout=0;layout<8&&rooms.length<9;layout++){
    rooms=bossFloor?[bossRect(spot)]:[];boss=bossFloor?0:-1;
    for(let t=0;(rooms.length<target&&t<3000)||(rooms.length<9&&t<6000);t++){
      const ord=rooms.length-(bossFloor?1:0),large=ord===1||ord===2,small=t>=3000&&!large;
      const w=large?int(7,8):small?4:int(4,8),h=large?int(5,6):small?3:int(3,6);
      const r={x:int(1,W-1-w),y:int(1,H-1-h),w,h};if(rooms.every(o=>apart(r,o)))rooms.push(r);}
  }
  if(rooms.length<9)return null;
  // 通道用独立随机序列：不改变房间（8.2 的房间、到达、敌人等固定值只受通道形状影响）
  const crng=mulberry32((Math.imul(seed>>>0,0x2545F491)^Math.imul(level,0x9E3779B9)^0x7F4A7C15)>>>0);
  const cint=(lo,hi)=>lo+Math.floor(crng()*(hi-lo+1));
  const cells=new Map();const carve=c=>{if(c.x>=1&&c.y>=1&&c.x<W-1&&c.y<H-1)cells.set(k(c),{x:c.x,y:c.y});};
  rooms.forEach(r=>roomCells(r).forEach(carve));
  const bossBox=boss>=0?{x:rooms[boss].x-1,y:rooms[boss].y-1,w:rooms[boss].w+2,h:rooms[boss].h+2}:null;
  const brush=(x,y)=>[{x,y},{x:x+1,y},{x,y:y+1},{x:x+1,y:y+1}];
  const anchor=r=>({x:Math.min(r.x+Math.floor((r.w-1)/2),r.x+r.w-2),y:Math.min(r.y+Math.floor((r.h-1)/2),r.y+r.h-2)});
  const grow=(r,n)=>({x:r.x-n,y:r.y-n,w:r.w+2*n,h:r.h+2*n});
  const stats={turns:[],fallback:0};
  const lPath=(p,q,hFirst)=>{const out=[];const hl=(y,x0,x1)=>{for(let x=Math.min(x0,x1);x<=Math.max(x0,x1);x++)out.push({x,y});};
    const vl=(x,y0,y1)=>{for(let y=Math.min(y0,y1);y<=Math.max(y0,y1);y++)out.push({x,y});};
    if(hFirst){hl(p.y,p.x,q.x);vl(q.x,p.y,q.y);}else{vl(p.x,p.y,q.y);hl(q.y,p.x,q.x);}return out;};
  // 一个笔刷位是否允许：在地图内；不进入两端以外任何房间的外扩 1 格范围；非首领连接不进首领房外框
  const allowed=(b,a,c)=>{if(b.x<1||b.y<1||b.x>W-3||b.y>H-3)return false;
    return brush(b.x,b.y).every(p=>rooms.every((r,i)=>i===a||i===c||!inRect(p,grow(r,1)))&&!(bossBox&&a!==boss&&c!==boss&&inRect(p,bossBox)));};
  const meanderPath=(a,c)=>{
    const goal=anchor(rooms[c]);let p=anchor(rooms[a]);const path=[p];let dir=null,turns=0,jogs=0;
    for(let guard=0;guard<200&&(p.x!==goal.x||p.y!==goal.y);guard++){
      const dx=Math.sign(goal.x-p.x),dy=Math.sign(goal.y-p.y);
      const toward=[];if(dx)toward.push({x:dx,y:0});if(dy)toward.push({x:0,y:dy});
      let d,len;
      const cont=dir&&toward.some(t=>t.x===dir.x&&t.y===dir.y);
      if(toward.length===1&&jogs<2&&crng()<pJog){const t=toward[0];d=crng()<.5?{x:t.y,y:t.x}:{x:-t.y,y:-t.x};len=cint(1,2);jogs++;}
      else if(cont&&crng()>=pTurn)d=dir;
      else{
        // 不立即反向（刚横移完不能马上折回，否则留下 2 格死角）：两个方向都可走时排除与上一段相反的那个
        const notBack=toward.filter(t=>!(dir&&t.x===-dir.x&&t.y===-dir.y));
        const pool=notBack.length?notBack:toward;d=pool.length===2?pool[crng()<.5?0:1]:pool[0];}
      if(!len){const rem=d.x?Math.abs(goal.x-p.x):Math.abs(goal.y-p.y);len=Math.min(cint(...seg),rem);}
      let moved=0;
      for(let s=0;s<len;s++){const n={x:p.x+d.x,y:p.y+d.y};if(!allowed(n,a,c))break;p=n;path.push(p);moved++;}
      if(!moved){const alt=toward.find(t=>!(t.x===d.x&&t.y===d.y)&&allowed({x:p.x+t.x,y:p.y+t.y},a,c));
        if(!alt)return null;p={x:p.x+alt.x,y:p.y+alt.y};path.push(p);d=alt;}
      if(dir&&(dir.x!==d.x||dir.y!==d.y))turns++;dir=d;
    }
    if(p.x!==goal.x||p.y!==goal.y)return null;
    stats.turns.push(turns);return path;};
  const link=(a,c)=>{
    if(meander){const path=meanderPath(a,c);if(path){path.forEach(b=>brush(b.x,b.y).forEach(carve));return true;}}
    for(const h of [true,false]){const path=lPath(anchor(rooms[a]),anchor(rooms[c]),h);
      if(path.every(b=>!(bossBox&&a!==boss&&c!==boss&&brush(b.x,b.y).some(p=>inRect(p,bossBox))))){
        if(meander)stats.fallback++;path.forEach(b=>brush(b.x,b.y).forEach(carve));return true;}}
    return false;};
  const d2=(a,b)=>{const p=center(rooms[a]),q=center(rooms[b]);return Math.abs(p.x-q.x)+Math.abs(p.y-q.y);};
  const order=rooms.map((_,i)=>i).filter(i=>i!==boss);let failed=0;
  for(let n=1;n<order.length;n++){const i=order[n];if(!order.slice(0,n).sort((a,b)=>d2(i,a)-d2(i,b)||a-b).some(j=>link(i,j)))failed++;}
  if(boss>=0&&!order.slice().sort((a,b)=>d2(boss,a)-d2(boss,b)||a-b).some(j=>link(boss,j)))failed++;
  let loops=0;for(let t=0;t<40&&loops<2;t++){const i=order[cint(0,order.length-1)],j=order[cint(0,order.length-1)];if(i!==j&&link(i,j))loops++;}
  return {rooms,floor:[...cells.values()],failed,stats,boss};
}

// ---------- 第二地形：只占非地面格（不改变地面，所以连通性不变） ----------
export const THEME_TERRAIN={moss:{rivers:[0,0],lakes:[0,1],width:[2,2]},wet:{rivers:[1,2],lakes:[1,2],width:[2,2]},ash:{rivers:[1,1],lakes:[1,1],width:[1,2]}};
function secondTerrain(floor,rooms,seed,level,theme){
  const cfg=THEME_TERRAIN[theme],cells=new Set(floor.map(k)),t=new Set();
  const rng=mulberry32((Math.imul(seed>>>0,0x68E31DA4)^Math.imul(level,0xB5297A4D)^0x1B56C4E9)>>>0);
  const int=(lo,hi)=>lo+Math.floor(rng()*(hi-lo+1));
  const put=p=>{if(p.x>=0&&p.y>=0&&p.x<W&&p.y<H&&!cells.has(k(p)))t.add(k(p));};
  const blockedByRoom=(x,w,y)=>rooms.some(r=>{for(let i=0;i<w;i++)if(inRect({x:x+i,y},{x:r.x-1,y:r.y-1,w:r.w+2,h:r.h+2}))return true;return false;});
  let riverCells=0,riverInterrupted=0;const nr=int(...cfg.rivers);
  for(let r=0;r<nr;r++){const w=int(...cfg.width),down=rng()<.5;let x=int(3,W-3-w);
    for(let s=0;s<H;s++){const y=down?s:H-1-s;
      // 前方一行会撞进房间（含外扩 1 格）时，优先横移避开
      const opts=[0,-1,1,-2,2,-3,3].map(d=>x+d).filter(v=>v>=1&&v<=W-1-w);
      const free=opts.filter(v=>!blockedByRoom(v,w,y));
      const r0=rng();let nx=r0<.5?x:r0<.75?x-1:x+1;nx=Math.min(Math.max(nx,1),W-1-w);
      if(blockedByRoom(nx,w,y)&&free.length)nx=free[int(0,free.length-1)];
      x=nx;
      for(let i=0;i<w;i++){const p={x:x+i,y};riverCells++;if(cells.has(k(p))){if(rooms.some(rr=>inRect(p,rr)))riverInterrupted++;}else put(p);}
    }}
  const nl=int(...cfg.lakes),cand=floor.length?rooms.map((_,i)=>i):[];
  for(let l=0;l<nl&&cand.length;l++){const r=rooms[cand[int(0,cand.length-1)]];
    const ring=[];for(let x=r.x-2;x<r.x+r.w+2;x++)for(let y=r.y-2;y<r.y+r.h+2;y++){const p={x,y};if(!cells.has(k(p))&&!inRect(p,{x:r.x-1,y:r.y-1,w:r.w+2,h:r.h+2})&&x>=0&&y>=0&&x<W&&y<H)ring.push(p);}
    if(!ring.length)continue;const size=int(6,14),lake=[ring[int(0,ring.length-1)]];put(lake[0]);
    for(let g=0;g<200&&lake.length<size;g++){const b=lake[int(0,lake.length-1)],d=DIRS[int(0,3)],n={x:b.x+d.x,y:b.y+d.y};
      if(n.x>=0&&n.y>=0&&n.x<W&&n.y<H&&!cells.has(k(n))&&!t.has(k(n))){t.add(k(n));lake.push(n);}}}
  // 画面里能看到的非地面格＝与某个地面格 8 邻相接（现行渲染只画这一圈）
  const ringOf=r=>{const s=new Set();for(const c of floor)for(let dx=-r;dx<=r;dx++)for(let dy=-r;dy<=r;dy++){const p={x:c.x+dx,y:c.y+dy};if(!cells.has(k(p)))s.add(k(p));}return s;};
  const ring=ringOf(1),ring2=ringOf(2);
  const visible=[...t].filter(p=>ring.has(p)).length,visible2=[...t].filter(p=>ring2.has(p)).length;
  return {cells:t,terrain:t.size,visible,visible2,ring:ring.size,riverCells,riverInterrupted};
}


// ---------- 俯视小图（--maps）：不依赖第三方库的最小 PNG 编码 ----------
function png(w,h,rgb){const row=w*3+1,raw=Buffer.alloc(row*h);
  for(let y=0;y<h;y++){raw[y*row]=0;rgb.copy(raw,y*row+1,y*w*3,(y+1)*w*3);}
  const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(td)>>>0);return Buffer.concat([len,td,c]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);}
export function overviewMap(seed,level,theme){
  const g=referenceLayout(seed,level,{gap:3});if(!g)return null;
  const x=secondTerrain(g.floor,g.rooms,seed,level,theme),cells=new Set(g.floor.map(k));
  const liquid=theme==='ash'?'^':'~',lines=[];
  for(let y=0;y<H;y++){let l='';for(let xx=0;xx<W;xx++){const p={x:xx,y};
    l+=cells.has(k(p))?(g.rooms.some(r=>inRect(p,r))?':':'.'):x.cells.has(k(p))?liquid:'#';}lines.push(l);}
  return {lines,stats:x};
}
function writeMaps(dir){mkdirSync(dir,{recursive:true});
  const C={'#':[40,36,44],'.':[200,190,160],':':[150,170,110],'~':[60,120,220],'^':[235,110,30]},S=4;
  for(const [theme,level] of [['moss',1],['wet',2],['ash',3]])for(let seed=1;seed<=3;seed++){
    const m=overviewMap(seed,level,theme);if(!m)continue;const rgb=Buffer.alloc(W*S*H*S*3);
    m.lines.forEach((l,y)=>[...l].forEach((ch,x)=>{for(let dy=0;dy<S;dy++)for(let dx=0;dx<S;dx++){const o=((y*S+dy)*W*S+x*S+dx)*3;rgb[o]=C[ch][0];rgb[o+1]=C[ch][1];rgb[o+2]=C[ch][2];}}));
    const name=`${dir}/${theme}-L${level}-s${seed}`;writeFileSync(name+'.png',png(W*S,H*S,rgb));writeFileSync(name+'.txt',m.lines.join('\n')+'\n');
    console.log(`\n${theme} 第 ${level} 层 种子 ${seed}（第二地形 ${m.stats.terrain} 格；河道落在房间里 ${m.stats.riverInterrupted}／${m.stats.riverCells}）\n${m.lines.join('\n')}`);}
}

// ---------- 运行 ----------
const q=(xs,p)=>{const s=[...xs].sort((a,b)=>a-b);return s.length?s[Math.floor(p*(s.length-1))]:null;};
const st=xs=>({n:xs.length,min:Math.min(...xs),p10:q(xs,.1),p50:q(xs,.5),p90:q(xs,.9),max:Math.max(...xs)});
const pct=(a,b)=>+(a/b*100).toFixed(1);
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  const R={seeds:SEEDS,platform:process.platform,node:process.version,shapes:SHAPES.map((m,i)=>({frame:i,mask:m}))};
  const sum=(name,fn)=>{const lens=[],dead=[],turns=[];let floors=0,bad=0,unplaced=0,notWide=0,failed=0,fallback=0,short2=0,short4=0,linksTotal=0;
    for(let seed=1;seed<=SEEDS;seed++)for(let level=1;level<=3;level++){const g=fn(seed,level);if(!g){unplaced++;continue;}floors++;
      const m=metrics(g.floor,g.rooms);if(!m.connected)bad++;if(!m.twoWide)notWide++;dead.push(m.deadEnds);lens.push(...m.lens);
      linksTotal+=m.lens.length;short2+=m.lens.filter(l=>l<=2).length;short4+=m.lens.filter(l=>l<=4).length;
      if(g.failed)failed++;if(g.stats){fallback+=g.stats.fallback;turns.push(...g.stats.turns);}}
    R[name]={floors,unplaced,disconnected:bad,notTwoWide:notWide,floorsWithFailedLink:failed,fallbackToL:fallback,
      corridorLen:st(lens),linksLE2:pct(short2,linksTotal),linksLE4:pct(short4,linksTotal),deadEndsPerFloor:st(dead),floorsWithDeadEnd:pct(dead.filter(d=>d>0).length,dead.length),
      ...(turns.length?{turnsPerMeander:st(turns)}:{})};
    const r=R[name];
    console.log(`${name}: 层 ${r.floors}；放不下 9 间房 ${r.unplaced}；不连通 ${r.disconnected}；非 2 格宽 ${r.notTwoWide}；连接失败层 ${r.floorsWithFailedLink}；退回 L 形 ${r.fallbackToL} 条`);
    console.log(`  通道长度 ${JSON.stringify(r.corridorLen)}；≤2 格 ${r.linksLE2}％，≤4 格 ${r.linksLE4}％；每层死路 ${JSON.stringify(r.deadEndsPerFloor)}（有死路的层 ${r.floorsWithDeadEnd}％）${r.turnsPerMeander?'；每条曲折通道转弯 '+JSON.stringify(r.turnsPerMeander):''}`);
  };
  console.log(`# 8.5b 地形验证（${SEEDS} 种子 × 3 层；${process.platform} ${process.version}）`);
  console.log(`47 种形状（帧号:掩码）：${SHAPES.map((m,i)=>i+':'+m).join(' ')}`);
  sum('现行 8.2 生成器',(s,l)=>{const g=generateFloor(s,l);return {rooms:g.rooms,floor:g.floor,failed:0};});
  for(const gap of [2,3,4])sum(`参考：曲折通道 gap=${gap}`,(s,l)=>referenceLayout(s,l,{gap}));
  sum('参考：曲折通道 gap=3，不横移',(s,l)=>referenceLayout(s,l,{gap:3,pJog:0}));
  // 第二地形（放在现行地图上：只占非地面格，所以与通道算法无关）
  for(const [theme,level] of [['moss',1],['wet',2],['ash',3]]){let t=0,v=0,v2=0,ring=0,rc=0,ri=0,floors=0;
    for(let seed=1;seed<=SEEDS;seed++){const g=generateFloor(seed,level),x=secondTerrain(g.floor,g.rooms,seed,level,theme);floors++;t+=x.terrain;v+=x.visible;v2+=x.visible2;ring+=x.ring;rc+=x.riverCells;ri+=x.riverInterrupted;}
    R['terrain_'+theme]={floors,terrainPerFloor:+(t/floors).toFixed(1),visiblePerFloor:+(v/floors).toFixed(1),visibleWithin2PerFloor:+(v2/floors).toFixed(1),visibleShareOfWallRing:pct(v,ring),riverCellsInsideRooms:rc?pct(ri,rc):0};
    console.log(`第二地形 ${theme}（第 ${level} 层）：每层 ${R['terrain_'+theme].terrainPerFloor} 格，其中贴着地面、画面可见 ${R['terrain_'+theme].visiblePerFloor} 格、2 格内 ${R['terrain_'+theme].visibleWithin2PerFloor} 格（1 格的占墙圈 ${R['terrain_'+theme].visibleShareOfWallRing}％）；河道落在房间里被打断 ${R['terrain_'+theme].riverCellsInsideRooms}％`);}
  if(JSON_OUT)writeFileSync(JSON_OUT,JSON.stringify(R,null,1));
  if(MAPS)writeMaps(MAPS);
}
