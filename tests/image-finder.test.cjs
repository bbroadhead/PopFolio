// Run: node --test tests/image-finder.test.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../image-finder.js'),'utf8');
function evaluate(expression){
 const context={window:{},document:{addEventListener(){}},Set,Image:function(){}};
 vm.runInNewContext(source.replace(/\}\)\(\);\s*$/,';globalThis.__test={filename,normalizeImageName,matchCandidate,needsImage,state};})();'),context);
 return vm.runInNewContext(expression,context);
}
test('normalizes indexed image filenames regardless of extension and path',()=>{
 assert.equal(evaluate("normalizeImageName('assets/pop_images/Geralt-1317.JPG')"),'geralt-1317');
 assert.equal(evaluate("normalizeImageName('Geralt-1317.png')"),'geralt-1317');
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
