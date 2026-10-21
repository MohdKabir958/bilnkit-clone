const ts=require('../../backend/node_modules/typescript');
const fs=require('fs');
for(const file of JSON.parse(fs.readFileSync(0,'utf8'))){
 const src=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,src,ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 function walk(n){if(ts.isStringLiteralLike(n)||ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n)||ts.isJsxText(n)){const value=n.text?.trim();if(value)process.stdout.write(JSON.stringify({file,line:tree.getLineAndCharacterOfPosition(n.getStart(tree)).line+1,value})+'\n');}ts.forEachChild(n,walk);}walk(tree);
}
