/** Character input for the bundled UI fonts. Parse literals, never execute source files. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
export const FONT_REPO=fileURLToPath(new URL('../../',import.meta.url));
const printable=cp=>cp>=32&&!/\p{C}/u.test(String.fromCodePoint(cp));
const add=(set,text)=>{for(const ch of text){const cp=ch.codePointAt(0);if(printable(cp))set.add(cp);}};
export async function collectUiCharacters(root=FONT_REPO){
 const body=new Set(),display=new Set(),files=[];
 for(let cp=32;cp<=126;cp++){body.add(cp);display.add(cp);}
 async function walk(dir){
  for(const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name,'en'))){
   const file=path.join(dir,entry.name);
   if(entry.isDirectory())await walk(file);
   else if(entry.isFile()&&/\.(ts|json)$/.test(file)){
    files.push(path.relative(root,file).replaceAll('\\','/'));
    const raw=await fs.readFile(file,'utf8');
    if(file.endsWith('.json')){
     const visit=v=>{if(typeof v==='string')add(body,v);else if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')Object.values(v).forEach(visit);};
     visit(JSON.parse(raw));
    }else{
     const tree=ts.createSourceFile(file,raw,ts.ScriptTarget.Latest,true);
     const literal=n=>ts.isStringLiteralLike(n)||[ts.SyntaxKind.TemplateHead,ts.SyntaxKind.TemplateMiddle,ts.SyntaxKind.TemplateTail].includes(n.kind);
     const visit=n=>{
      if(literal(n))add(body,n.text);
      if(ts.isVariableDeclaration(n)&&n.name.getText(tree)==='SETTLEMENT_TITLES'){
       const title=q=>{if(literal(q))add(display,q.text);ts.forEachChild(q,title);};
       if(n.initializer)title(n.initializer);
      }
      ts.forEachChild(n,visit);
     };visit(tree);
    }
   }
  }
 }
 await walk(path.join(root,'src'));
 return {format:1,policy:'Conservative player-text superset: TypeScript string/template literals and JSON string values; source comments excluded.',files,body:[...body].sort((a,b)=>a-b),display:[...display].sort((a,b)=>a-b)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv[2];if(!output)throw Error('Usage: node tools/art/font-characters.mjs <ignored-output.json>');
 const data=await collectUiCharacters();await fs.writeFile(output,JSON.stringify(data,null,2)+'\n');
 console.log(JSON.stringify({body:data.body.length,display:data.display.length,files:data.files.length}));
}
