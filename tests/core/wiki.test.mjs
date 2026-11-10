/* Playtest round 11 (D-20261109-03): the in-game wiki is data-driven. Every species and every obtainable move has an entry; the status and stage entries quote engine
   constants instead of copies; every hand-written entry names a category and rule numbers that exist in the rules page; links resolve. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import wikiData from '../../src/data/wiki-zh.json' with {type:'json'};
import {DIFFICULTY,ENEMY_SLEEP_CHANCE} from '../../src/core/dungeon.ts';
import {wikiCategories,wikiEntry,wikiEntryIds,wikiMoveIds,wikiTokens,searchWiki,WIKI_LINK,isCategoryLink,wikiRuleIds} from '../../src/core/wiki.ts';
import {SPECIES,ALL_TM_MOVES} from '../../src/core/roster.ts';
import {moveOf} from '../../src/core/moves.ts';
import {moveEffectText} from '../../src/core/move-text.ts';
import {moveZh,speciesZh} from '../../src/core/names.ts';
import {STATUS_NAMES,STAGE_NAMES,ITEM_NAMES,BLESSINGS,ITEM_CURES,STATUS_DURATION,STATUS_INTERVAL,STATUS_DAMAGE_DIVISOR,ATTACK_STAGE_256,DEFENCE_STAGE_256,STAGE_LIMIT,CRIT_CHANCE,CRIT_MULTIPLIER,ACCURACY_STAGE_LIMIT,PARTY_LIMIT,STATUS_DEFAULT_LEFT} from '../../src/core/engine.ts';
import {ITEM_DESCRIPTIONS} from '../../src/core/item-descriptions.ts';
import {TACTICS,TACTIC_LABELS} from '../../src/core/tactics.ts';

const cats=wikiCategories(),byCat=Object.fromEntries(cats.map(c=>[c.id,c]));
const rulesText=fs.readFileSync(new URL('../../docs/01-现行规则/游戏规则.md',import.meta.url),'utf8');
const ruleExists=rule=>{const [major,minor]=rule.slice(1).split('.');return minor?new RegExp('\\*\\*G'+major+'\\.'+minor+'[ 　*）（]').test(rulesText):new RegExp('^## G'+major+' ','m').test(rulesText);};
const blocksText=e=>e.blocks.map(b=>b.t==='p'?b.text:b.t==='facts'?b.rows.map(r=>r.text).join(' '):'').join('\n');

test('the categories are defined by the data file, in order, and each has entries',()=>{
  assert.deepEqual(cats.map(c=>c.id),['terms','moves','species','status','stages','items','blessings']);
  for(const c of cats){assert.ok(c.entries.length>0,c.id);assert.ok(c.name&&c.intro);}
});
test('every species of the roster has an entry with portrait data, types, six base stats and its kit',()=>{
  assert.equal(byCat.species.entries.length,Object.keys(SPECIES).length);
  for(const [id,sp] of Object.entries(SPECIES)){
    const e=wikiEntry('species:'+id);assert.ok(e,id);assert.equal(e.title,speciesZh(id));
    assert.equal(e.meta.dex,sp.dex);assert.deepEqual(e.meta.types,sp.types);
    assert.equal(e.blocks.find(b=>b.t==='stats').rows.length,6);
    const kit=e.blocks.find(b=>b.t==='chips'&&b.label==='初始招式');assert.deepEqual(kit.ids,sp.kit.map(m=>'moves:'+m.move));
  }
});
test('every move a game can hand out has an entry with name, type, category and an official description',()=>{
  const wanted=new Set(ALL_TM_MOVES);
  for(const sp of Object.values(SPECIES))for(const m of [...sp.kit,...sp.learnable,...sp.levelUp])wanted.add(m.move);
  assert.deepEqual([...wikiMoveIds()].sort(),[...wanted].sort());
  for(const id of wanted){
    const e=wikiEntry('moves:'+id);assert.ok(e,id);assert.ok(moveOf(id),id);
    assert.equal(e.title,moveZh(id));assert.ok(e.meta.types.length===1,id+' has a type');
    const facts=e.blocks.find(b=>b.t==='facts').rows.map(r=>r.label);for(const l of ['属性','类别','威力','命中','PP','射程'])assert.ok(facts.includes(l),id+' '+l);
    const text=moveEffectText(id);assert.equal(e.blocks.some(b=>b.t==='p'),text!=='',id+': a move with an added effect has its effect paragraph, a plain damage move has none (no filler sentence)');if(text)assert.ok(e.blocks.some(b=>b.t==='p'&&b.text.length>3),id+' has the effect text');
  }
});
test('a move links to its status and the status lists the move back',()=>{
  const flame=wikiEntry('moves:flamethrower');assert.ok(blocksText(flame).includes('[[status:brn|灼伤]]'));
  assert.ok(wikiEntry('status:brn').blocks.some(b=>b.t==='chips'&&b.ids.includes('moves:flamethrower')));
  assert.ok(blocksText(wikiEntry('moves:swordsdance')).includes('[[stages:atk|攻击]] +2'));
  assert.ok(wikiEntry('stages:atk').blocks.some(b=>b.t==='chips'&&b.ids.includes('moves:swordsdance')));
});
test('every status has a Chinese entry that quotes the engine constants',()=>{
  assert.deepEqual(byCat.status.entries.map(e=>e.key).sort(),Object.keys(STATUS_NAMES).sort());
  const t=wikiTokens();
  for(const [id,name] of Object.entries(STATUS_NAMES)){const e=wikiEntry('status:'+id);assert.equal(e.title,name);assert.ok(/[一-鿿]/.test(e.title));}
  for(const k of ['psn','tox','brn']){assert.equal(t[k+'.interval'],String(STATUS_INTERVAL[k]));assert.equal(t[k+'.div'],String(STATUS_DAMAGE_DIVISOR[k]));
    const text=blocksText(wikiEntry('status:'+k));assert.ok(text.includes(' '+STATUS_INTERVAL[k]+' 轮')&&text.includes('除以 '+STATUS_DAMAGE_DIVISOR[k]),k+' text carries the constants');}
  for(const k of ['par','frz','slp','nap','confusion']){const [lo,hi]=STATUS_DURATION[k];assert.ok(blocksText(wikiEntry('status:'+k)).includes(lo+'—'+hi),k+' duration '+lo+'—'+hi);}
  for(const [item,cures] of Object.entries(ITEM_CURES))for(const k of cures)assert.ok(wikiEntry('status:'+k).blocks.some(b=>b.t==='chips'&&b.ids.includes('items:'+item)),item+' listed under '+k);
});
test('stage entries show the engine multiplier tables, the stage limit and the crit numbers',()=>{
  for(const key of ['atk','def','spa','spd','acc','eva','spe'])assert.ok(wikiEntry('stages:'+key),key);
  const table=id=>wikiEntry(id).blocks.find(b=>b.t==='table');
  assert.deepEqual(table('stages:atk').rows.map(r=>Number(r[1])),[...ATTACK_STAGE_256]);
  assert.deepEqual(table('stages:spa').rows.map(r=>Number(r[1])),[...ATTACK_STAGE_256]);
  assert.deepEqual(table('stages:def').rows.map(r=>Number(r[1])),[...DEFENCE_STAGE_256]);
  assert.deepEqual(table('stages:spd').rows.map(r=>Number(r[1])),[...DEFENCE_STAGE_256]);
  assert.equal(table('stages:atk').rows.length,STAGE_LIMIT*2+1);
  assert.deepEqual(table('stages:acc').rows.map(r=>r[0]),['−6','−5','−4','−3','−2','−1','0','+1','+2','+3','+4','+5','+6']);
  const t=wikiTokens();assert.equal(t['stage.limit'],String(STAGE_LIMIT));assert.equal(t['crit.chance'],'1/'+Math.round(1/CRIT_CHANCE));assert.equal(t['crit.mult'],String(CRIT_MULTIPLIER));
  assert.ok(blocksText(wikiEntry('terms:crit')).includes('1/24')&&blocksText(wikiEntry('terms:crit')).includes('1.5'));
  for(const k of Object.keys(STAGE_NAMES).filter(k=>k!=='spe'))assert.equal(wikiEntry('stages:'+k).title,STAGE_NAMES[k]);
});
test('the evasion page lists the defender evasion stage: +1 evasion makes the attacker multiplier smaller than 1, -1 larger (G5.1 n = accuracy - evasion)',()=>{
  const rows=id=>wikiEntry(id).blocks.find(b=>b.t==='table').rows,mult=r=>Number(r[1].slice(1));
  const eva=rows('stages:eva'),acc=rows('stages:acc');
  assert.deepEqual(eva.map(r=>r[0]),['−6','−5','−4','−3','−2','−1','0','+1','+2','+3','+4','+5','+6']);
  assert.ok(mult(eva.find(r=>r[0]==='+1'))<1,'evasion +1: '+eva.find(r=>r[0]==='+1')[1]);assert.ok(mult(eva.find(r=>r[0]==='−1'))>1);
  assert.equal(mult(eva.find(r=>r[0]==='+1')).toFixed(2),(3/4).toFixed(2));assert.equal(mult(eva.find(r=>r[0]==='−1')).toFixed(2),(4/3).toFixed(2));
  assert.ok(mult(acc.find(r=>r[0]==='+1'))>1&&mult(acc.find(r=>r[0]==='−1'))<1,'accuracy +1 raises the chance');
  assert.ok(wikiEntry('stages:eva').blocks.find(b=>b.t==='table').head[0].includes('闪避'));
});
test('numbers in the texts come from engine and dungeon constants: difficulty, born asleep, stage limits, party size, flinch',()=>{
  const t=wikiTokens();
  assert.equal(t['diff.easy'],String(DIFFICULTY.easy));assert.equal(t['diff.normal'],String(DIFFICULTY.normal));assert.equal(t['diff.hard'],String(DIFFICULTY.hard));
  assert.equal(t['enemy.sleep.pct'],String(Math.round(ENEMY_SLEEP_CHANCE*100)));assert.equal(t['lullaby.pct'],String(Math.round(BLESSINGS.lullaby.sleepChance*100)));
  assert.equal(t['acc.limit'],String(ACCURACY_STAGE_LIMIT));assert.equal(t['party.max'],String(PARTY_LIMIT));assert.equal(t['flinch.dur'],String(STATUS_DEFAULT_LEFT));
  assert.ok(blocksText(wikiEntry('terms:difficulty')).includes(DIFFICULTY.easy+'／'+DIFFICULTY.normal+'／'+DIFFICULTY.hard));
  assert.ok(blocksText(wikiEntry('terms:enemy')).includes(t['enemy.sleep.pct']+'%')&&blocksText(wikiEntry('terms:enemy')).includes(t['lullaby.pct']+'%'));
  assert.equal(wikiEntry('terms:exchange'),undefined,'the exchange-machine entry is gone until the rules describe it');
});
test('every item and blessing has an entry that quotes the game data; tactics use the game labels',()=>{
  assert.deepEqual(byCat.items.entries.map(e=>e.key).sort(),Object.keys(ITEM_DESCRIPTIONS).sort());
  for(const e of byCat.items.entries){assert.equal(e.title,ITEM_NAMES[e.key]);assert.ok(blocksText(e).includes(ITEM_DESCRIPTIONS[e.key]));}
  assert.deepEqual(byCat.blessings.entries.map(e=>e.key).sort(),Object.keys(BLESSINGS).sort());
  for(const e of byCat.blessings.entries){assert.equal(e.title,BLESSINGS[e.key].name);assert.equal(e.meta.rarity,BLESSINGS[e.key].rarity);assert.ok(blocksText(e).includes(BLESSINGS[e.key].description));}
  const tactics=blocksText(wikiEntry('terms:tactics'));for(const k of TACTICS)assert.ok(tactics.includes(TACTIC_LABELS[k]),k);
});
test('wiki-zh.json: every hand-written entry has a category, text and rule numbers that exist in the rules page',()=>{
  const ids=new Set(wikiData.categories.map(c=>c.id)),seen=new Set();
  for(const e of wikiData.entries){
    assert.ok(ids.has(e.category),e.id+' category');assert.ok(e.id.startsWith(e.category+':'),e.id+' id prefix');assert.ok(!seen.has(e.id),'duplicate '+e.id);seen.add(e.id);
    assert.ok(Array.isArray(e.body)&&e.body.length>0&&e.body.every(t=>typeof t==='string'&&t.length>0),e.id+' body');
    assert.ok(Array.isArray(e.rules)&&e.rules.length>0,e.id+' has rule numbers');
    if(e.todo)assert.ok(e.todoNote,e.id+' todo has a note');
  }
  for(const c of wikiData.categories)assert.ok(c.rules.length>0,c.id+' category rule numbers');
  for(const rule of wikiRuleIds()){
    assert.match(rule,/^G\d+(\.\d+)?$/,rule);
    assert.ok(ruleExists(rule),rule+' exists in 游戏规则.md');
  }
  assert.equal(ruleExists('G5.99'),false);assert.equal(ruleExists('G99'),false);   // the check itself can fail
});
test('every link resolves, every placeholder is filled, and search finds names in every category',()=>{
  const ids=new Set(wikiEntryIds());
  for(const id of ids){
    const e=wikiEntry(id);
    const texts=e.blocks.flatMap(b=>b.t==='p'?[b.text]:b.t==='facts'?b.rows.map(r=>r.text):[]);
    for(const text of texts){assert.ok(!/\{[\w.]+\}/.test(text),id+' has an unfilled placeholder');
      for(const m of text.matchAll(WIKI_LINK)){const target=m[1];assert.ok(isCategoryLink(target)?byCat[target.split(':')[0]]:ids.has(target),id+' links to missing '+target);}}
    for(const b of e.blocks)if(b.t==='chips')for(const t of b.ids)assert.ok(ids.has(t),id+' chip '+t);
  }
  for(const c of cats){const first=c.entries[0];assert.ok(searchWiki(c.id,first.title).some(e=>e.id===first.id),c.id+' search');assert.equal(searchWiki(c.id,'').length,c.entries.length);assert.equal(searchWiki(c.id,'zzzz不存在').length,0);}
  assert.ok(searchWiki('moves','喷射火焰').some(e=>e.key==='flamethrower'));assert.ok(searchWiki('moves','flamethrower').some(e=>e.key==='flamethrower'));assert.ok(searchWiki('species','喷火龙').some(e=>e.key==='charizard'));
});
