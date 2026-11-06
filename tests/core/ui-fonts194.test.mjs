import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {collectUiCharacters,FONT_REPO} from '../../tools/art/font-characters.mjs';

test('local UI subsets cover current text and retain body weights within the font budget',async()=>{
 const coverage=JSON.parse(await fs.readFile(FONT_REPO+'/public/assets/fonts/coverage.json','utf8'));
 const current=await collectUiCharacters();let total=0;
 for(const role of ['body','display']){
  const face=coverage.faces[role],bytes=await fs.readFile(FONT_REPO+'/public/assets/'+face.file);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),face.sha256,'coverage is bound to the generated font bytes');
  assert.equal(bytes.length,face.bytes);total+=bytes.length;
  const available=new Set([...face.codepoints,...face.systemFallbackCodepoints]);
  const missing=current[role].filter(cp=>!available.has(cp));
  assert.deepEqual(missing,[],role+' text needs a regenerated subset: '+missing.map(cp=>String.fromCodePoint(cp)).join(''));
 }
 assert.ok(total<=5_000_000,'two subsets stay within the approved 5 MB limit');
 const axis=coverage.faces.body.axes.wght;
 for(const weight of [500,700,900])assert.ok(axis.min<=weight&&axis.max>=weight,'body variable font retains '+weight);
 const css=await fs.readFile(FONT_REPO+'/src/render/fonts.css','utf8');
 assert.equal((css.match(/font-display:swap/g)||[]).length,2);
 assert.match(css,/Microsoft YaHei/);assert.match(css,/sans-serif/);
});

test('font scan rejects a missing or empty settlement title declaration',async t=>{
 const parent=FONT_REPO+'/.artifacts/trial';await fs.mkdir(parent,{recursive:true});const root=await fs.mkdtemp(parent+'/font-title-');
 await fs.mkdir(root+'/src');const file=root+'/src/panels.ts';
 t.after(async()=>{await fs.unlink(file);await fs.rmdir(root+'/src');await fs.rmdir(root);});
 await fs.writeFile(file,"export const RENAMED_TITLES=['胜利'];\n");
 await assert.rejects(collectUiCharacters(root),/SETTLEMENT_TITLES must exist/);
 await fs.writeFile(file,'export const SETTLEMENT_TITLES=[];\n');
 await assert.rejects(collectUiCharacters(root),/SETTLEMENT_TITLES must exist/);
});
