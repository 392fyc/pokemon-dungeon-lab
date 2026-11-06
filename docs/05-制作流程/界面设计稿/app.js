const D=window.GD,M=D.moves,S=D.species;
const TC={Normal:'#5f5e50',Water:'#2b5f8a',Fire:'#a8482a',Grass:'#3f7a3a',Electric:'#9a7a24',Ice:'#4f8196',Fighting:'#963f45',Poison:'#765196',Ground:'#86643b',Flying:'#54799b',Psychic:'#a25891',Bug:'#55753a',Rock:'#776749',Ghost:'#5b4e81',Dragon:'#4f4c9b',Dark:'#49413b',Steel:'#627381',Fairy:'#9d6688'};
const TZ={Normal:'一般',Fire:'火',Water:'水',Grass:'草',Electric:'电',Ice:'冰',Fighting:'格斗',Poison:'毒',Ground:'地面',Flying:'飞行',Psychic:'超能力',Bug:'虫',Rock:'岩石',Ghost:'幽灵',Dragon:'龙',Dark:'恶',Steel:'钢',Fairy:'妖精'};
const stage=document.getElementById('stage'),fit=document.getElementById('fit'),cap=document.getElementById('caption');
const mon=(k,alt='')=>`<img class="mon" src="img/${k}.png" alt="${alt}">`;
const typeChips=ids=>ids.map(t=>`<span class="chip" style="background:${TC[t]}">${TZ[t]}</span>`).join(' ');
const G=(p)=>`<svg viewBox="0 0 12 12" aria-hidden="true" fill="currentColor">${p}</svg>`;
const r=(x,y,w,h)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`;
/* 六种方针：含义取自 G4.5，用词按 README 的界面用词 */
const TACTICS=[
 {id:'together',n:'一起行动',say:'攻击领队 3 格内和相邻的敌人，并靠近领队',g:G(r(2,4,3,3)+r(7,4,3,3)+r(2,8,3,2)+r(7,8,3,2))},
 {id:'followme',n:'跟着我',say:'只攻击相邻的敌人，并紧跟领队',g:G(r(1,5,7,2)+r(6,3,2,6)+r(8,4,2,4)+r(10,5,1,2))},
 {id:'gofoes',n:'主动出击',say:'追击视野内最近的敌人，看不到时靠近领队',g:G(r(8,1,3,2)+r(6,3,3,2)+r(4,5,3,2)+r(2,7,3,2)+r(1,9,2,2))},
 {id:'wait',n:'原地待命',say:'不移动，只攻击射程内的敌人',g:G(r(3,1,2,10)+r(5,1,6,5))},
 {id:'nomoves',n:'不用招式',say:'只使用普通攻击，其余与“一起行动”相同',g:G(r(5,1,2,10)+r(1,5,10,2)+r(1,1,2,2)+r(9,9,2,2))},
 {id:'avoid',n:'远离敌人',say:'不攻击，只使用自身和己方招式；敌人相邻时后退',g:G(r(1,5,4,2)+r(7,5,4,2)+r(1,3,2,6)+r(9,3,2,6))}];
const rangeCells=rg=>{let h='';for(let y=-2;y<=2;y++)for(let x=-2;x<=2;x++){const c=Math.max(Math.abs(x),Math.abs(y)),line=x===0||y===0||Math.abs(x)===Math.abs(y);let k='';
 if(!x&&!y)k='me';else if(rg==='room')k='b';else if(rg==='around')k=c===1?'b':'';else if(rg==='user')k='';
 else{const n=rg==='front'?1:rg==='front2'?2:9;if(line&&c<=n)k=(x===0&&y<0)?'b':'d';}
 h+=`<i class="${k}"></i>`;}return `<div class="rng" aria-hidden="true">${h}</div>`;};
const areaName=m=>m.range==='room'?'全体':m.range==='around'?'全体':m.range==='user'?'自己':'单体';
const fields=m=>`<dl><div><dt>威力</dt><dd>${m.power??'—'}</dd></div><div><dt>命中</dt><dd>${m.acc==null?'必中':m.acc+'%'}</dd></div><div><dt>PP</dt><dd>${m.pp??'—'}</dd></div><div><dt>射程</dt><dd>${m.reach}</dd></div><div><dt>范围</dt><dd>${areaName(m)}</dd></div><div><dt>分类</dt><dd>${m.cat}</dd></div></dl>`;
const moveRow=(id,pp,attr='')=>{const m=M[id];return `<button type="button" class="mv" data-tip="${id}" ${attr}><span class="t" style="background:${TC[m.type]}">${m.typeZh}</span><b>${m.name}</b><span>${m.cat}</span>${pp==null?'':`<span class="pp num">${pp}</span>`}</button>`;};
function tipOn(el){const t=document.getElementById('tip');if(!t)return;const m=M[el.dataset.tip];if(!m)return;
 t.innerHTML=`<div class="r">${rangeCells(m.range)}<div><h4><span class="chip" style="background:${TC[m.type]}">${m.typeZh}</span>${m.name}</h4>${fields(m)}</div></div><p>${m.desc}</p>`;
 t.style.display='block';const s=fit.clientWidth/1280,a=el.getBoundingClientRect(),b=stage.getBoundingClientRect();
 let x=(a.left-b.left)/s-384,y=(a.top-b.top)/s-20;if(x<8)x=(a.right-b.left)/s+12;if(x>900)x=896;y=Math.max(8,Math.min(y,720-t.offsetHeight-8));t.style.left=x+'px';t.style.top=y+'px';}
const tipOff=()=>{const t=document.getElementById('tip');if(t)t.style.display='none';};
stage.addEventListener('mouseover',e=>{const b=e.target.closest('[data-tip]');b?tipOn(b):tipOff();});
stage.addEventListener('focusin',e=>{const b=e.target.closest('[data-tip]');if(b)tipOn(b);});
stage.addEventListener('focusout',tipOff);
/* 六边图：配色同起始伙伴页 */
const STATS=[['hp','HP','#3f8f3a'],['atk','攻击','#c2491f'],['def','防御','#a07a10'],['spa','特攻','#2b6fb0'],['spd','特防','#2f8f7f'],['spe','速度','#b0417f']];
function hex(base,stg={}){const cx=125,cy=128,R=78,max=120,P=(i,k)=>{const a=-Math.PI/2+i*Math.PI/3;return[cx+Math.cos(a)*R*k,cy+Math.sin(a)*R*k];};
 const ring=k=>STATS.map((_,i)=>P(i,k).join(',')).join(' ');
 const poly=STATS.map(([k],i)=>P(i,Math.min(1,base[k]/max)).join(',')).join(' ');
 const lab=STATS.map(([k,n,c],i)=>{const[x,y]=P(i,1.3),st=stg[k];return `<circle cx="${P(i,1)[0]}" cy="${P(i,1)[1]}" r="4" fill="${c}"/><text x="${x}" y="${y-3}" text-anchor="middle" font-size="13" font-weight="700" fill="${c}">${n}</text><text x="${x}" y="${y+13}" text-anchor="middle" font-size="15" font-weight="900" fill="#2a1c14">${base[k]}${st?(st>0?' ↑':' ↓')+Math.abs(st):''}</text>`;}).join('');
 return `<svg viewBox="0 0 250 250" role="img" aria-label="六项种族值"><polygon points="${ring(1)}" fill="#e0cfa4" stroke="#b89a56" stroke-width="2"/><polygon points="${ring(.66)}" fill="none" stroke="#cdb985"/><polygon points="${ring(.33)}" fill="none" stroke="#cdb985"/><polygon points="${poly}" fill="rgba(217,98,43,.45)" stroke="#a64217" stroke-width="2"/>${lab}</svg>`;}
const st={dt:'treecko',tac:{treecko:'together',mudkip:'gofoes'},set:'keys',anim:true,res:'won',hutSel:'treecko',team:['treecko','mudkip','charmander'],leader:'treecko',ctac:{treecko:'together',mudkip:'together',charmander:'gofoes',pidgey:'together',rattata:'together'},carry:{treecko:['pound','leafage','protect'],mudkip:['tackle','watergun'],charmander:['scratch','ember'],pidgey:['tackle','gust'],rattata:['tackle']},tm:'protect',who:'mudkip',now:'dungeon',sTab:'tm',sBy:'type',sF:'all',frag:'rattata',tal:{体质:1,攻势:0,补给:0},dep:false,diff:'普通',fxT:'melee',fxY:'Fire',fxS:false};
const LEARNED={treecko:['pound','leafage','protect'],mudkip:['tackle','watergun'],charmander:['scratch','ember'],pidgey:['tackle','gust'],rattata:['tackle']};
const DT={treecko:{hp:[20,20],pp:{pound:'27/27',leafage:'38/40'},stats:[['up','攻击↑1']],stg:{atk:1}},mudkip:{hp:[22,22],pp:{tackle:'30/30',watergun:'14/17'},stats:[['dn','防御↓1'],['ab','灼伤']],stg:{def:-1}},rattata:{hp:[7,7],pp:{tackle:'30/30'},stats:[['ab','睡眠']],stg:{},enemy:true}};
const V={};
V.detail=()=>{const id=st.dt,d=DT[id],sp=S[id],moves=(d.kit?S[d.kit].kit:sp.kit);const cur=st.tac[id];
 const rows=[...moves.map(m=>moveRow(m,d.pp[m])),...Array(4-moves.length).fill('<div class="mv empty"></div>')].join('');
 const tabs=['treecko','mudkip','rattata'].map(k=>`<button type="button" aria-label="${S[k].name}" aria-pressed="${k===id}" data-a="dt:${k}">${mon(k)}</button>`).join('');
 const tac=d.enemy?'':`<div class="tac"><h3 class="hd">作战方针</h3><div class="tac-row">${TACTICS.map(t=>`<button type="button" class="tile" aria-pressed="${t.id===cur}" data-a="tac:${t.id}" data-say="${t.say}">${t.g}<span>${t.n}</span></button>`).join('')}</div><div class="tac-say" id="say">${TACTICS.find(t=>t.id===cur).say}</div></div>`;
 return `<img class="bg" src="img/dungeon.png" alt=""><div class="dim"></div><section class="win dt-win ${d.enemy?"foe":""}" aria-label="详情"><div class="plaque">详情</div><div class="dt-tabs">${tabs}</div><button type="button" class="close" aria-label="关闭">✕</button>
 <div class="dt-l"><div class="dt-sprite">${mon(id,sp.name)}</div><div class="dt-name">${sp.name}</div><div>${typeChips(sp.typeIds)} <b>Lv5</b></div><div style="display:flex;justify-content:space-between;margin:8px 0 4px;font-weight:900"><span>HP</span><span class="num">${d.hp[0]}/${d.hp[1]}</span></div><div class="bar"><i style="width:${d.hp[0]/d.hp[1]*100}%"></i></div><div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;min-height:24px">${d.stats.map(([c,t])=>`<span class="st ${c}">${t}</span>`).join('')}</div></div>
 <div class="dt-m">${hex(sp.base,d.stg)}</div><div class="dt-r">${rows}</div>${tac}</section><div id="tip"></div>`;};
V.settings=()=>{const tab=st.set,side=[['show','画面'],['keys','键位'],['save','存档']].map(([k,n])=>`<button type="button" aria-pressed="${k===tab}" data-a="set:${k}">${n}</button>`).join('');
 const kc=k=>`<span class="kc">${k}</span>`;
 const pane=tab==='show'?`<div class="opt"><span>动作动画</span><div class="sw"><button type="button" aria-pressed="${st.anim}" data-a="anim:1">开</button><button type="button" aria-pressed="${!st.anim}" data-a="anim:0">关</button></div></div><div class="opt"><span>按住跳过动画</span>${kc('Shift')}</div>`:
 tab==='keys'?`<div class="keys"><div class="keyg tall"><div class="wasd">${['W','A','S','D'].map(kc).join('')}</div><b>移动</b></div><div class="keyg tall"><div class="kline">${kc('W')}${kc('D')}</div><span>同时按下</span><b>斜向移动</b></div><div class="keyg"><div class="kline">${['1','2','3','4'].map(kc).join('')}</div><b>招式</b></div><div class="keyg"><div class="kline">${['5','6','7','8','9','0'].map(kc).join('')}</div><b>快捷物品</b></div><div class="keyg">${kc('F')}<b>向前普通攻击</b></div><div class="keyg">${kc('Tab')}<b>切换操控</b></div><div class="keyg">${kc('B')}<b>背包</b></div><div class="keyg">${kc('.')}<b>等待</b></div></div>`:
 `<div class="slot"><div class="team">${mon('treecko')}${mon('mudkip')}${mon('charmander')}</div><div class="facts"><div><span>探险队</span><b>Lv3</b></div><div><span>远征</span><b>4 次</b></div><div><span>伙伴</span><b>5 只</b></div></div></div><div class="row"><button type="button" class="btn">导出存档</button><button type="button" class="btn">导入存档</button></div><p style="margin:0;font-size:14px;color:var(--muted)">存档保存在当前设备的浏览器中。</p>`;
 return `<img class="bg" src="img/camp.png" alt=""><div class="dim"></div><section class="win set-win" aria-label="设置"><div class="plaque">设置</div><button type="button" class="close" aria-label="关闭">✕</button><div class="side">${side}<div class="sp"></div><button type="button" class="out">返回标题</button></div><div class="pane">${pane}</div></section>`;};
const TMTILE=(id,o='')=>`<div class="disc" style="background:${TC[M[id].type]}"></div>${M[id].name}${o}`;
const RES={won:{title:'击败首领',sub:'灰烬裂谷 · 普通',reach:3,team:[['treecko',0],['mudkip',0],['charmander',1]],gain:16,rows:[['到达第 3 层','+3'],['击败首领','+6'],['完成委托 2 个','+2'],['新伙伴经验','+1'],['招式机经验','+4']],lv:'探险队 Lv3',bar:83,barT:'15/18',up:'升至 Lv3',pts:'天赋点 +1',mons:[['pidgey','波波']],shards:[['rattata','小拉达碎片',1]],tms:['protect','thunderwave'],lost:[]},
 lost:{title:'全队倒下',sub:'潮湿水窟 · 普通',reach:2,team:[['treecko',1],['mudkip',1],['charmander',1]],gain:4,rows:[['到达第 2 层','+2'],['完成委托 1 个','+1'],['新伙伴经验','+1']],lv:'探险队 Lv3',bar:17,barT:'3/18',up:'升至 Lv3',pts:'天赋点 +1',mons:[['pidgey','波波']],shards:[],tms:[],lost:['roar']},
 many:{title:'击败首领',sub:'灰烬裂谷 · 困难',reach:3,team:[['treecko',0],['mudkip',0],['charmander',0]],gain:28,rows:[['到达第 3 层','+3'],['击败首领','+6'],['完成委托 3 个','+3'],['新伙伴经验','+2'],['招式机经验','+4'],['示例：挑战房全部通过','+3'],['示例：无人倒下','+2'],['示例：探索全部房间','+2'],['示例：名称特别长的未来奖励条目也不换行','+3']],lv:'探险队 Lv5',bar:40,barT:'12/30',up:'升至 Lv5',pts:'天赋点 +1',mons:[['pidgey','波波'],['rattata','小拉达']],shards:[['rattata','小拉达碎片',2],['pidgey','波波碎片',1]],tms:['protect','thunderwave','roar','toxic','swordsdance'],lost:[]}};
V.result=()=>{const R=RES[st.res],won=st.res!=='lost';
 const floors=['苔石洞','潮湿水窟','灰烬裂谷'].map((n,i)=>`<div class="fl ${i<R.reach?'on':''}"><i></i>${n}</div>`).join('');
 const tms=[...R.tms.map(id=>`<div class="lt">${TMTILE(id)}</div>`),...R.lost.map(id=>`<div class="lt lost"><span class="tag">丢失</span>${TMTILE(id)}</div>`)].join('');
 const gets=[...R.mons.map(([k,n])=>`<div class="lt"><span class="tag">新伙伴</span>${mon(k)}${n}</div>`),...R.shards.map(([k,n,c])=>`<div class="lt">${mon(k)}${n}<span class="cnt">×${c}</span></div>`)].join('');
 return `${won?'<img class="bg" src="img/camp.png" alt=""><div class="dim"></div>':'<div class="view" style="background:#16110d"></div>'}
 <header class="res-head ${won?'won':'lost'}"><button type="button" aria-label="设置与存档" data-a="go:settings" style="position:absolute;right:12px;top:12px;z-index:2;width:36px;height:36px;padding:0;border:2px solid #2a1c14;background:#e0cfa4;color:#2a1c14;font-size:22px;font-weight:900;line-height:1">⚙</button><h2>${R.title}</h2><div class="res-sub">${R.sub}</div><div class="floors">${floors}</div></header>
 <section class="res-team" aria-label="队伍"><div class="line">${R.team.map(([k,d])=>`<div class="${d?'down':''}">${mon(k,S[k].name)}</div>`).join('')}</div></section>
 <section class="res-xp"><div class="res-top"><h3 class="hd">探险队经验</h3><strong>+${R.gain}</strong></div><div class="tally-box"><div class="tally" id="tally" tabindex="0" aria-label="经验明细">${R.rows.map(([a,b])=>`<span title="${a}">${a}</span><b class="num">${b}</b>`).join('')}</div><div class="more" id="more" hidden></div></div><div class="res-lv"><span>${R.lv}</span><span class="num">${R.barT}</span></div><div class="bar"><i style="width:${R.bar}%"></i></div>${R.up?`<div class="lvup"><span>${R.up}</span><span>${R.pts}</span></div>`:''}</section>
 <section class="res-loot"><h3 class="hd">本次收获 ${R.mons.length+R.shards.length}</h3>${gets?`<div class="loot" tabindex="0">${gets}</div>`:'<p class="nil">本局无此项奖励</p>'}<h3 class="hd">招式机 ${R.tms.length+R.lost.length}</h3>${tms?`<div class="loot" tabindex="0">${tms}</div>`:'<p class="nil">本局无此项奖励</p>'}</section>
 <div class="res-foot"><span>营地任务 · 本局无此项奖励</span><button type="button" class="btn go">返回营地</button></div>`;};
V.camp=()=>{const sg=(x,y,n,b='')=>`<div class="sign" style="left:${x}px;top:${y}px">${n}${b}</div>`;
 const hit=(x,y,w,h,go,n)=>`<button type="button" class="hit" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px" aria-label="${n}" data-a="${go}"></button>`;
 const team=[['treecko',578,392],['mudkip',636,412],['charmander',694,392]].map(([k,x,y])=>`<img class="mon camp-mon" src="img/${k}.png" alt="${S[k].name}" style="left:${x}px;top:${y}px">`).join('');
 const dep=st.dep?`<div class="dim"></div><section class="win dep-win" aria-label="出发"><div class="plaque">出发</div><button type="button" class="close" aria-label="关闭" data-a="dep:0">✕</button><div class="dep-in"><div class="dep-team">${st.team.map(k=>mon(k)).join('')}</div><div class="diff">${[['简单','敌人较弱'],['普通','标准'],['困难','敌人较强']].map(([n,s])=>`<button type="button" aria-pressed="${n===st.diff}" data-a="diff:${n}">${n}<small>${s}</small></button>`).join('')}</div><button type="button" class="btn go" style="min-height:56px;font-size:20px">进入迷宫</button></div></section>`:'';
 return `<img class="bg" src="img/camp.png" alt="">
 ${hit(590,0,100,108,'dep:1','迷宫入口')}${sg(640,104,'迷宫入口')}
 ${hit(196,84,206,226,'go:hut','伙伴小屋')}${sg(300,318,'伙伴小屋')}
 ${hit(860,84,280,226,'go:store','仓库')}${sg(1000,318,'仓库')}
 ${hit(216,430,190,200,'go:stele','天赋石碑')}${sg(304,636,'天赋石碑','<span class="bang">!</span>')}
 ${hit(866,462,194,160,'go:board','记录板')}${sg(962,630,'记录板')}
 ${team}<div class="camp-top"><div><span>探险队 Lv3</span><span>远征 4 次</span></div><div class="bar"><i style="width:83%"></i></div></div>
 <button type="button" class="btn camp-menu" data-a="go:settings">菜单</button>${dep}`;};
V.hut=()=>{const sel=st.hutSel,sp=S[sel],inTeam=st.team.includes(sel);
 const slots=[0,1,2].map(i=>{const k=st.team[i];return k?`<button type="button" class="slt" aria-pressed="${k===sel}" data-a="hs:${k}">${k===st.leader?'<span class="lead">操控</span>':''}${mon(k)}${S[k].name}</button>`:`<div class="slt none">＋</div>`;}).join('');
 const all=['treecko','mudkip','charmander','pidgey','rattata'];
 const tiles=[...all.map(k=>{const n=st.team.indexOf(k);return `<button type="button" class="rt" aria-label="${S[k].name}" aria-pressed="${k===sel}" data-a="hs:${k}">${n>=0?`<span class="n">${n+1}</span>`:''}${mon(k)}</button>`;}),...Array(16).fill('<div class="rt none"></div>')].join('');
 const carry=st.carry[sel],learned=LEARNED[sel];
 const pool=learned.filter(m=>!carry.includes(m));
 const ppOf=m=>M[m].pp;
 return `<img class="bg" src="img/camp.png" alt=""><div class="dim"></div><section class="win hut" aria-label="伙伴小屋"><div class="plaque">伙伴小屋</div><button type="button" class="close" aria-label="关闭" data-a="go:camp" style="right:36px;top:40px">✕</button>
 <div class="say">${mon('chansey','吉利蛋')}<p>大家都在这里休息。要带谁出发呢？</p></div>
 <div class="slots">${slots}</div><div class="grid-h"><h3 class="hd">全部伙伴</h3><div class="pager"><span class="num">5 只</span></div></div><div class="roster">${tiles}</div>
 <div class="pd"><div class="pd-h">${mon(sel,sp.name)}<div><h3>${sp.name}</h3>${typeChips(sp.typeIds)}</div><div class="pd-act" style="margin-right:44px"><button type="button" class="btn" data-a="tog:${sel}">${inTeam?'留在营地':'加入队伍'}</button><button type="button" class="btn" data-a="lead:${sel}" ${!inTeam||sel===st.leader?'disabled':''}>设为操控</button></div></div>
 <div><h3 class="hd">作战方针</h3><div class="tac-row">${TACTICS.map(t=>`<button type="button" class="tile" aria-pressed="${t.id===st.ctac[sel]}" data-a="ct:${t.id}">${t.g}<span>${t.n}</span></button>`).join('')}</div></div>
 <div><h3 class="hd">携带招式 ${carry.length}/4</h3><div class="carry">${[...carry.map(m=>moveRow(m,ppOf(m),`data-a="unc:${m}"`)),...Array(4-carry.length).fill('<div class="mv empty"></div>')].join('')}</div></div>
 <div><h3 class="hd">已学会</h3><div class="pool">${pool.length?pool.map(m=>moveRow(m,ppOf(m),`data-a="car:${m}"`)).join(''):'<p class="nil">已全部携带</p>'}</div></div></div></section><div id="tip"></div>`;};
const FRAGS=[['rattata',2],['pidgey',1]];
V.store=()=>{const own={protect:1,roar:1,thunderwave:1},frag=st.sTab==='frag';
 const tabs=`<div class="s-tabs" role="tablist"><button type="button" role="tab" aria-selected="${!frag}" data-a="stab:tm">招式机<span class="num">${Object.values(own).reduce((a,b)=>a+b,0)}</span></button><button type="button" role="tab" aria-selected="${frag}" data-a="stab:frag">伙伴碎片<span class="num">${FRAGS.reduce((a,f)=>a+f[1],0)}</span></button></div>`;
 const head=`<img class="bg" src="img/camp.png" alt=""><div class="dim"></div><section class="win hut" aria-label="仓库"><div class="plaque">仓库</div><button type="button" class="close" aria-label="关闭" data-a="go:camp" style="right:36px;top:40px">✕</button>
 <div class="say">${mon('snorlax','卡比兽')}<p>……呼噜……带回来的东西都放好了……</p></div>${tabs}`;
 if(frag){const[k,c]=FRAGS.find(f=>f[0]===st.frag)??FRAGS[0];
  return head+`<div class="frags">${FRAGS.map(([id,n])=>`<button type="button" class="tm" aria-pressed="${id===k}" data-a="frag:${id}">${mon(id)}${S[id].name}碎片<span class="cnt num">×${n}</span></button>`).join('')}</div>
  <div class="pd"><div class="pd-h">${mon(k,S[k].name)}<div><h3>${S[k].name}碎片</h3>${typeChips(S[k].typeIds)}</div></div><div class="card frag-card"><dl><div><dt>持有</dt><dd>${c}</dd></div></dl></div><p class="desc">再次招募已有的同一种伙伴时获得。</p></div></section>`;}
 const byType=st.sBy==='type',key=id=>byType?M[id].type:M[id].cat;
 const opts=byType?[...new Set(D.tm.map(id=>M[id].type))].map(t=>[t,TZ[t],TC[t]]):['物理','特殊','变化'].map(c=>[c,c,'']);
 const list=D.tm.filter(id=>st.sF==='all'||key(id)===st.sF);
 const tmId=list.includes(st.tm)?st.tm:list[0],m=M[tmId];
 const can=k=>S[k].tm.includes(tmId),has=k=>LEARNED[k]?.includes(tmId);
 const who=['treecko','mudkip','charmander','pidgey','rattata'].map(k=>{const ok=can(k)&&!has(k);return `<button type="button" class="wh ${ok?'':'no'}" aria-pressed="${ok&&st.who===k}" ${ok?`data-a="who:${k}"`:'disabled'}>${mon(k)}${S[k].name}<span>${has(k)?'已学会':ok?'可学习':'无法学习'}</span></button>`;}).join('');
 const learner=['treecko','mudkip','charmander','pidgey','rattata'].includes(st.who)&&can(st.who)&&!has(st.who)?st.who:['treecko','mudkip','charmander','pidgey','rattata'].find(k=>can(k)&&!has(k));
 const canTeach=(own[tmId]||0)>0&&!!learner;
 const filters=`<div class="s-filter"><div class="seg">${[['type','属性'],['cat','分类']].map(([k,n])=>`<button type="button" aria-pressed="${st.sBy===k}" data-a="sby:${k}">${n}</button>`).join('')}</div><div class="s-chips"><button type="button" class="fc" aria-pressed="${st.sF==='all'}" data-a="sf:all">全部</button>${opts.map(([k,n,c])=>`<button type="button" class="fc" ${c?`style="--c:${c}"`:''} aria-pressed="${st.sF===k}" data-a="sf:${k}">${n}</button>`).join('')}</div></div>`;
 const grid=`<div class="tms" tabindex="0">${list.map(id=>`<button type="button" class="tm ${own[id]?'':'none'}" aria-pressed="${id===tmId}" data-a="tm:${id}">${TMTILE(id,`<span class="cnt num">×${own[id]||0}</span>`)}</button>`).join('')}</div>`;
 const panel=m?`<div class="pd"><div class="pd-h" style="min-height:44px"><h3>${m.name}</h3><span class="chip" style="background:${TC[m.type]}">${m.typeZh}</span></div><div class="card">${rangeCells(m.range)}${fields(m)}</div><p class="desc">${m.desc}</p><div><h3 class="hd">学习对象</h3><div class="who">${who}</div></div><button type="button" class="btn go push" ${canTeach?'':'disabled'}>${learner?`由${S[learner].name}学习`:'学习'}</button></div>`:'<div class="pd"><p class="nil">没有符合条件的招式机</p></div>';
 return head+filters+(list.length?grid:'<div class="tms"><p class="nil">没有符合条件的招式机</p></div>')+panel+`</section>`;};
V.stele=()=>{const n=st.tal,used=n.体质+n.攻势+n.补给,pts=2-used;
 const E={体质:k=>`全队最大 HP +${k*5}%`,攻势:k=>`对敌伤害 +${k*3}%`,补给:k=>`橙橙果回复 +${k} HP${k>=3?'，出发带 1 个':''}`};
 const pil=Object.keys(E).map(k=>{const v=n[k];return `<div class="pil"><h3>${k}</h3><div class="pips">${[0,1,2,3,4].map(i=>`<i class="${i<v?'on':''}"></i>`).join('')}</div><div class="now">${E[k](v)}</div><div class="nx">${v<5?'下一级：'+E[k](v+1):'已满'}</div><button type="button" class="btn add" data-a="tal:${k}" ${pts<1||v>=5?'disabled':''}>刻下一级</button></div>`;}).join('');
 return `<img class="bg" src="img/camp.png" alt=""><div class="dim"></div><section class="slab" aria-label="天赋石碑"><h2>天赋石碑</h2><button type="button" class="close" aria-label="关闭" data-a="go:camp">✕</button><div class="pts">天赋点<b>${pts}</b></div><div class="lv"><span>探险队 Lv3</span><div class="bar"><i style="width:83%"></i></div><span class="num">15/18</span></div><div class="pillars">${pil}</div><div class="foot"><button type="button" class="btn" data-a="talr:1" ${used?'':'disabled'}>全部重置</button></div></section>`;};
V.board=()=>`<img class="bg" src="img/camp.png" alt=""><div class="dim"></div><section class="cork" aria-label="记录板"><button type="button" class="close" aria-label="关闭" data-a="go:camp">✕</button>
 <div class="note" style="left:50px;top:52px;width:250px;height:190px;transform:rotate(-1.5deg)"><h3>累计远征</h3><div class="big">4 次</div></div>
 <div class="note" style="left:50px;top:278px;width:250px;height:250px;transform:rotate(1deg)"><h3>探险队</h3><div class="big">Lv3</div><p style="margin:14px 0 6px;font-weight:900">累计经验 33</p><p style="margin:0 0 6px;font-weight:900">伙伴 5 只</p><p style="margin:0;font-weight:900">碎片 3 个</p></div>
 <div class="note" style="left:350px;top:52px;width:560px;height:330px;transform:rotate(.5deg)"><h3>上一次远征</h3><div class="big" style="color:#b84a18">击败首领</div><p style="margin:8px 0 14px;font-size:15px">灰烬裂谷 · 普通 · 探险队经验 +16</p><div class="loot"><div class="lt"><span class="tag">新伙伴</span>${mon('pidgey')}波波</div><div class="lt">${TMTILE('protect')}</div><div class="lt">${TMTILE('thunderwave')}</div><div class="lt">${mon('rattata')}小拉达碎片<span class="cnt">×1</span></div></div></div></section>`;
const NOW=[['title','标题'],['starter','选择起始伙伴'],['dungeon','迷宫主界面'],['bag','背包'],['learn','学招窗口'],['shop','迷宫商店']];
V.now=()=>`<div class="now-bg"></div><div class="now-list">${NOW.map(([k,n])=>`<button type="button" aria-pressed="${k===st.now}" data-a="now:${k}">${n}</button>`).join('')}</div><img class="now-img" src="img/now/${st.now}.png" alt="${NOW.find(n=>n[0]===st.now)[1]}的游戏截图">`;
const TPL=[['melee','近身物理',107,'拍击'],['special','近身特殊',51,'火花'],['shot','飞行道具',13,'垃圾射击'],['beam','光束',19,'极光束'],['around','周身爆发',11,'十万伏特'],['room','全房间',7,'暴风雪'],['up','能力上升',19,'剑舞'],['down','能力下降',17,'叫声'],['status','异常',10,'剧毒'],['heal','回复',4,'光合作用'],['guard','守护',5,'守住'],['blow','吹飞',4,'吹飞']];
V.fx=()=>{const cur=TPL.find(t=>t[0]===st.fxT);
 return `<div class="fx-bg"></div><div class="fx-list">${TPL.map(t=>`<button type="button" aria-pressed="${t[0]===st.fxT}" data-a="fxt:${t[0]}">${t[1]}<span>${t[2]} 招</span></button>`).join('')}</div>
 <canvas id="fxc" width="240" height="135" aria-label="招式特效演示"></canvas>
 <div class="fx-types">${Object.keys(TC).map(k=>`<button type="button" style="background:${TC[k]}" aria-pressed="${k===st.fxY}" data-a="fxy:${k}">${TZ[k]}</button>`).join('')}</div>
 <div class="fx-side"><label><input type="checkbox" id="fxsup" ${st.fxS?'checked':''}> 效果绝佳</label><button type="button" class="btn" data-a="fxp:1">重新播放</button></div>
 <div class="fx-info"><h3>${cur[1]} · ${TZ[st.fxY]}</h3><p>招式的范围和效果决定形状，属性决定颜色和粒子。例：${cur[3]}。</p><div class="steps"><div><b>启动</b>0.1 秒内</div><div><b>飞行或挥动</b>0.2 秒内</div><div><b>命中</b>白色闪光、击退、伤害数字</div><div><b>全程</b>不超过 0.5 秒</div></div></div>`;};
const VIEWS=[['detail','详情','画内窗口。上方小头像切换成员和敌人，敌人没有方针。方针是六个图标格，招式悬停显示范围和官方说明；攻防升降标在六边图顶点上，命中和闪避的升降用状态标签。'],
['settings','设置','只放游戏里真实存在的选项，分画面、键位、存档三页。标题、营地和迷宫共用这个窗口，“返回标题”只在营地显示。'],
['result','结算','整屏结果页：先看结果和到达的层，再看经验，最后看收获。值为 0 的项不显示。经验明细放不下时只在明细区内滚动，总经验、等级条和升级提示始终可见；收获放不下时横向滚动。'],
['camp','营地','建筑牌只留名字，有事要处理才亮感叹号（图中是还有天赋点）。用户已同意，列入第 2 批实现：难度移进“出发”窗口；点迷宫入口先弹窗确认阵容和难度；新增感叹号提示。'],
['hut','伙伴小屋','上面阵容、下面小图标、右边当前伙伴。点谁看谁，右侧改方针和配招。招式点一下进出携带格，左上数字是出发顺序。'],
['store','仓库','分招式机和伙伴碎片两页。招式机可按属性或分类（物理、特殊、变化）筛选，选中后右侧显示招式字段和学习对象。招式机图标暂时相同，靠颜色和名字区分。碎片在现行规则里还没有用途，所以碎片页只显示数量和来源。'],
['stele','天赋石碑','暂不改动。现有三项继续生效，天赋内容以后由用户和 main 一起重做。'],
['board','记录板','软木板上钉告示纸，只用档案里真有的数据。上一次远征只在本次打开游戏后有，现有存档不保存，没有时这张纸不显示。'],
['now','其他画面','这些画面还没有重做稿，这里放游戏实际截图，方便不开游戏也能讨论。'],
['fx','招式特效','不逐招做图：招式的范围和效果定形状，属性定颜色和粒子。12 种形状 × 18 种属性，全部用代码画方块粒子，不增加素材。左边选形状，右边选属性。']];
let view=(location.hash||'').slice(1);if(!VIEWS.some(v=>v[0]===view))view='result';
function go(v){view=v;try{location.hash=v;}catch(e){}render();}
function render(){const tabs=document.getElementById('tabs');
 tabs.innerHTML=VIEWS.map(([k,n])=>`<button type="button" aria-current="${['camp','hut','store','stele','board'].includes(k)?k===view:k===view}" data-v="${k}">${n}</button>`).join('');
 stage.innerHTML=`<div class="view">${V[view==='settings'?'settings':view==='result'?'result':view]()}</div>`;
 let c=VIEWS.find(v=>v[0]===view)[2];
 if(view==='result')c=`<span class="restog">${[['won','击败首领'],['lost','全队倒下'],['many','条目溢出示例']].map(([k,n])=>`<button type="button" aria-pressed="${st.res===k}" data-res="${k}">${n}</button>`).join('')}</span>`+c;
 cap.innerHTML=c;cap.querySelectorAll('[data-res]').forEach(b=>b.onclick=()=>{st.res=b.dataset.res;render();});
 const ty=document.getElementById('tally'),more=document.getElementById('more');if(ty&&more){const row=ty.firstElementChild.offsetHeight+4,left=()=>{const n=Math.ceil((ty.scrollHeight-ty.clientHeight-ty.scrollTop-1)/row);more.hidden=n<1;more.textContent=`还有 ${n} 项`;};ty.onscroll=left;requestAnimationFrame(left);}
 if(view==='fx'){const cv=document.getElementById('fxc');FX.mount(cv);FX.set({tpl:st.fxT,type:st.fxY,super:st.fxS});document.getElementById('fxsup').onchange=e=>{st.fxS=e.target.checked;FX.set({super:st.fxS});};}
 size();}
function size(){const w=Math.min(1280,document.documentElement.clientWidth-32),s=w/1280;fit.style.width=w+'px';fit.style.height=720*s+'px';stage.style.transform=`scale(${s})`;}
addEventListener('resize',size);addEventListener('hashchange',()=>{const v=location.hash.slice(1);if(v!==view&&VIEWS.some(x=>x[0]===v)){view=v;render();}});
document.getElementById('tabs').addEventListener('click',e=>{const b=e.target.closest('[data-v]');if(b)go(b.dataset.v);});
stage.addEventListener('mouseover',e=>{const b=e.target.closest('[data-say]'),s=document.getElementById('say');if(b&&s)s.textContent=b.dataset.say;});
stage.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;const[k,v]=b.dataset.a.split(':');
 const A={dt(){st.dt=v;},tac(){st.tac[st.dt]=v;},set(){st.set=v;},anim(){st.anim=v==='1';},dep(){st.dep=v==='1';},diff(){st.diff=v;},go(){const m={hut:'hut',store:'store',stele:'stele',board:'board',camp:'camp',settings:'settings'};view=m[v];try{location.hash=view;}catch(e){}},
 hs(){st.hutSel=v;},tog(){const i=st.team.indexOf(v);if(i>=0){if(st.team.length>1){st.team.splice(i,1);if(st.leader===v)st.leader=st.team[0];}}else if(st.team.length<3)st.team.push(v);},lead(){st.leader=v;},ct(){st.ctac[st.hutSel]=v;},
 unc(){const c=st.carry[st.hutSel];if(c.length>1)c.splice(c.indexOf(v),1);},car(){const c=st.carry[st.hutSel];if(c.length<4)c.push(v);},tm(){st.tm=v;const f=['treecko','mudkip','charmander','pidgey','rattata'].find(k=>S[k].tm.includes(v)&&!LEARNED[k].includes(v));if(f)st.who=f;},who(){st.who=v;},stab(){st.sTab=v;},sby(){st.sBy=v;st.sF='all';},sf(){st.sF=v;},frag(){st.frag=v;},now(){st.now=v;},tal(){st.tal[v]++;},talr(){st.tal={体质:0,攻势:0,补给:0};},
 fxt(){st.fxT=v;},fxy(){st.fxY=v;},fxp(){FX.play();return true;}};
 if(A[k]&&!A[k]())render();});
render();
