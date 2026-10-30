import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {THEME_FLOORS,ARENA_TILE} from '../../src/core/dungeon.ts';
import {BOSS_SPECIES} from '../../src/core/roster.ts';

/* Stage 7.3 asset completeness (docs/玩法研究/内容扩充与首领.md, section 四 "素材清单完整性测试"). Everything is read from files; nothing is generated here. */
const root=new URL('../../public/assets/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
const roster=JSON.parse(readFileSync(new URL('../../src/data/roster.json',import.meta.url),'utf8'));
const index=JSON.parse(readFileSync(new URL('../../src/render/characters.json',import.meta.url),'utf8'));
const notices=readFileSync(new URL('../../public/THIRD-PARTY-NOTICES.txt',import.meta.url),'utf8');
const ACTIONS=['Walk','Idle','Attack','Hurt','Shoot'];
const dexes=[...roster.species.map(s=>s.dex),...Object.values(BOSS_SPECIES)];

/** Animation name -> the sheet that really holds it (AnimData.xml may say CopyOf another action). */
function sheets(dex){
 const xml=readFileSync(new URL(`characters/${dex}/AnimData.xml`,root),'utf8');
 const out={};
 for(const block of xml.split('<Anim>').slice(1)){const name=/<Name>([^<]+)<\/Name>/.exec(block)[1],copy=/<CopyOf>([^<]+)<\/CopyOf>/.exec(block)?.[1];out[name]=copy??name;}
 return out;
}
test('A1 the roster has 23 species plus the boss: 24 character folders in the manifest, each with AnimData.xml and credits.txt',()=>{
 assert.equal(dexes.length,24);assert.equal(new Set(dexes).size,24);
 for(const dex of dexes)for(const f of ['AnimData.xml','credits.txt'])assert.ok(`characters/${dex}/${f}` in manifest.files,`${dex}/${f}`);
});
test('A2 each character has the animation sheet and the shadow sheet of every required action',()=>{
 for(const dex of dexes){
  const map=sheets(dex);
  for(const action of ACTIONS){
   assert.ok(action in map,`${dex} lacks ${action} in AnimData.xml`);
   for(const kind of ['Anim','Shadow']){const f=`characters/${dex}/${map[action]}-${kind}.png`;assert.ok(f in manifest.files,`manifest lacks ${f}`);assert.ok(existsSync(new URL(f,root)),`file lacks ${f}`);}
  }
 }
});
test('A3 every manifest file exists, and its recorded size and sha256 equal the real ones',()=>{
 const names=Object.keys(manifest.files);assert.ok(names.length>=300,'manifest has '+names.length);
 for(const name of names){
  const data=readFileSync(new URL(name,root)),m=manifest.files[name];
  assert.equal(data.length,m.bytes,`${name}: size`);assert.equal(createHash('sha256').update(data).digest('hex'),m.sha256,`${name}: sha256`);
 }
});
test('A4 every file of the new characters records its source, author list and licence; sheets credited to CHUNSOFT are private-build only',()=>{
 for(const dex of dexes){
  for(const name of Object.keys(manifest.files).filter(n=>n.startsWith(`characters/${dex}/`))){
   const m=manifest.files[name];assert.equal(m.source,'PMDCollab/SpriteCollab',name);assert.equal(m.commit,'448d3af85e2cfa85a8c5ead076eddb145251b473',name);
   assert.equal(m.sourcePath,`sprite/${dex}`,name);assert.ok(Array.isArray(m.authors)&&m.authors.length>0,name);assert.match(m.licence,/Private build only/,name);
  }
  assert.ok(notices.includes(`  ${dex}: `),`THIRD-PARTY-NOTICES lists ${dex}`);
 }
});
test('A5 the render index has the four drawn actions for every character',()=>{
 for(const dex of dexes){assert.ok(index[dex],dex);for(const a of ['Idle','Walk','Attack','Hurt'])assert.ok(index[dex][a]?.file&&index[dex][a].durations.length>0,`${dex} ${a}`);}
});
test('A6 every tile a floor theme uses (floor, wall, and the boss-room arena) is in the manifest, exists, and is a real PNG',()=>{
 const need=[...THEME_FLOORS.flatMap(t=>[t.floorTile,t.wallTile]),ARENA_TILE];
 assert.deepEqual([...new Set(need)].sort(),['floor-arena','floor-ash','floor-stone','floor-wet','wall-basalt','wall-rock','wall-wet']);
 for(const t of need){
  const f=`tiles/${t}.png`;assert.ok(f in manifest.files,`manifest lacks ${f}`);
  const data=readFileSync(new URL(f,root));assert.deepEqual([...data.subarray(0,8)],[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],`${f} is a PNG`);
 }
});
