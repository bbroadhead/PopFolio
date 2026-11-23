// Run: node --test tests/image-finder.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../image-finder.js'),'utf8');
function evaluate(expression){
 const context={window:{},document:{addEventListener(){}},URL,Set,Image:function(){}};
 vm.runInNewContext(source.replace(/\}\)\(\);\s*$/,';globalThis.__test={filename,normalizeImageName,matchCandidate,needsImage,csvCell,batchMatch,officialProductUrl,officialProductMatch,parseAuthorizedManifest,state};})();'),context);
 return vm.runInNewContext(expression,context);
}
test('normalizes indexed image filenames regardless of extension and path',()=>{
 assert.equal(evaluate("__test.normalizeImageName('assets/pop_images/Geralt-1317.JPG')"),'geralt-1317');
 assert.equal(evaluate("__test.normalizeImageName('Geralt-1317.png')"),'geralt-1317');
});
test('recognizes saved JPEG as existing image for matching Pop',()=>{
 assert.equal(evaluate("(__test.state.savedFiles.add('Geralt-1317.JPG'),__test.needsImage({name:'Geralt',number:'1317',variant:'',image:null}))"),false);
});
test('rejects wrong numbered image candidate',()=>{
 assert.equal(evaluate("__test.matchCandidate({name:'Geralt',number:'1317',variant:''},{title:'Geralt #1321'}).score"),-1);
});
test('rejects variant mismatches',()=>{
 assert.equal(evaluate("__test.matchCandidate({name:'Geralt',number:'1317',variant:'Chase'},{title:'Geralt #1317'}).score"),-1);
});
test('allows matching number and name for human review',()=>{
 assert.ok(evaluate("__test.matchCandidate({name:'Geralt',number:'1317',variant:''},{title:'Geralt #1317'}).score")>0);
});

test('CSV quotes and commas are escaped',()=>{
 assert.equal(evaluate("__test.csvCell('Geralt, \"The Witcher\"')"),'"Geralt, ""The Witcher"""');
});
test('CSV cells cannot start spreadsheet formulas',()=>{
 assert.equal(evaluate("__test.csvCell('=HYPERLINK(\"https://example.com\")')"),'\x22\x27=HYPERLINK(\x22\x22https://example.com\x22\x22)\x22');
 assert.equal(evaluate("__test.csvCell('  +SUM(1,2)')"),'\x22\x27  +SUM(1,2)\x22');
});

test('batch matches exact image filename',()=>{
 assert.equal(evaluate("__test.batchMatch({name:'Geralt-1317.png',type:'image/png',size:100},[{id:1,name:'Geralt',number:'1317',variant:''}]).pop.id"),1);
});
test('batch rejects invalid image type',()=>{
 assert.equal(evaluate("__test.batchMatch({name:'Geralt-1317.svg',type:'image/svg+xml',size:100},[{id:1,name:'Geralt',number:'1317',variant:''}]).pop"),null);
});
test('batch rejects ambiguous figure numbers',()=>{
 assert.equal(evaluate("__test.batchMatch({name:'Geralt-1317-1321.jpg',type:'image/jpeg',size:100},[{id:1,name:'Geralt',number:'1317',variant:''}]).pop"),null);
});
test('batch refuses missing chase marker for variant',()=>{
 assert.equal(evaluate("__test.batchMatch({name:'Geralt-special-1317.jpg',type:'image/jpeg',size:100},[{id:1,name:'Geralt',number:'1317',variant:'Chase'}]).pop"),null);
});

test('batch recognizes low figure numbers beginning with 20',()=>{
 assert.equal(evaluate("__test.batchMatch({name:'Geralt-20.jpg',type:'image/jpeg',size:100},[{id:20,name:'Geralt',number:'20',variant:''}]).pop.id"),20);
});
test('batch rejects zero-byte images',()=>{
 assert.equal(evaluate("__test.batchMatch({name:'Geralt-1317.png',type:'image/png',size:0},[{id:1,name:'Geralt',number:'1317',variant:''}]).pop"),null);
});
test('batch rejects images over 10 MB',()=>{
 assert.equal(evaluate("__test.batchMatch({name:'Geralt-1317.png',type:'image/png',size:10485761},[{id:1,name:'Geralt',number:'1317',variant:''}]).pop"),null);
});

test('accepts official Funko product detail URLs',()=>{
 assert.equal(evaluate("__test.officialProductUrl('https://funko.com/pop-superman-2025/85642.html')"),'https://funko.com/pop-superman-2025/85642.html');
});
test('rejects impersonator hosts and insecure official links',()=>{
 assert.equal(evaluate("__test.officialProductUrl('https://funko.com.evil.test/pop-superman-2025/85642.html')"),null);
 assert.equal(evaluate("__test.officialProductUrl('http://funko.com/pop-superman-2025/85642.html')"),null);
});
test('rejects non-product official pages',()=>{
 assert.equal(evaluate("__test.officialProductUrl('https://funko.com/search/?term=superman')"),null);
});

test('official product matcher recognizes matching product slug',()=>{
 assert.equal(evaluate("__test.officialProductMatch({name:'Superman',variant:''},'https://funko.com/pop-superman/85642.html').score"),1);
});
test('official product matcher warns on mismatched product',()=>{
 assert.equal(evaluate("__test.officialProductMatch({name:'Batman',variant:''},'https://funko.com/pop-superman/85642.html').score"),0);
});
test('official product matcher warns on mismatched chase edition',()=>{
 assert.equal(evaluate("__test.officialProductMatch({name:'Superman',variant:'Chase'},'https://funko.com/pop-superman/85642.html').score"),0);
});

test('authorized manifest parses a valid image candidate',()=>{
 assert.equal(evaluate("__test.parseAuthorizedManifest(JSON.stringify([{id:1,imageUrl:'https://example.com/pop.png',source:'Licensed provider',license:'Permission confirmed'}]),[{id:1,name:'Pop'}]).length"),1);
});
test('authorized manifest rejects duplicate Pop identifiers',()=>{
 assert.equal(evaluate("(()=>{try{__test.parseAuthorizedManifest(JSON.stringify([{id:1,imageUrl:'https://example.com/a.png',source:'Provider',license:'Allowed'},{id:1,imageUrl:'https://example.com/b.png',source:'Provider',license:'Allowed'}]),[{id:1,name:'Pop'}]);return false}catch{return true}})()"),true);
});
test('authorized manifest rejects insecure image URLs',()=>{
 assert.equal(evaluate("(()=>{try{__test.parseAuthorizedManifest(JSON.stringify([{id:1,imageUrl:'http://example.com/a.png',source:'Provider',license:'Allowed'}]),[{id:1,name:'Pop'}]);return false}catch{return true}})()"),true);
});

test('manifest accepts an official Funko product reference',()=>{
 assert.equal(evaluate("__test.parseAuthorizedManifest(JSON.stringify([{id:1,imageUrl:'https://example.com/pop.png',source:'Provider',license:'Allowed',productUrl:'https://funko.com/pop-superman/85642.html'}]),[{id:1,name:'Superman'}])[0].productMatch.score"),1);
});
test('manifest rejects unofficial product reference domains',()=>{
 assert.equal(evaluate("(()=>{try{__test.parseAuthorizedManifest(JSON.stringify([{id:1,imageUrl:'https://example.com/pop.png',source:'Provider',license:'Allowed',productUrl:'https://funko.com.evil.test/pop-superman/85642.html'}]),[{id:1,name:'Superman'}]);return false}catch{return true}})()"),true);
});

test('manifest rejects local network hostname candidates',()=>{
 assert.equal(evaluate("(()=>{try{__test.parseAuthorizedManifest(JSON.stringify([{id:1,imageUrl:'https://localhost/pop.png',source:'Provider',license:'Allowed'}]),[{id:1,name:'Pop'}]);return false}catch{return true}})()"),true);
});
test('manifest rejects local subdomains',()=>{
 assert.equal(evaluate("(()=>{try{__test.parseAuthorizedManifest(JSON.stringify([{id:1,imageUrl:'https://images.localhost/pop.png',source:'Provider',license:'Allowed'}]),[{id:1,name:'Pop'}]);return false}catch{return true}})()"),true);
});
test('manifest normalizes whitespace around Pop IDs',()=>{
 assert.equal(evaluate("__test.parseAuthorizedManifest(JSON.stringify([{id:' 1 ',imageUrl:'https://example.com/pop.png',source:'Provider',license:'Allowed'}]),[{id:1,name:'Pop'}])[0].pop.id"),1);
});
