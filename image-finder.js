(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s||'').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,110);
const state={pops:[],selected:null,candidates:[],image:null,token:'',license:'',searchId:0,previewId:0,savedFiles:new Set()};
const api='https://api.github.com/repos/bbroadhead/PopFolio/contents/';
const filename=p=>slug(p.name)+'-'+slug(p.number)+(p.variant?'-'+slug(p.variant).slice(0,38):'')+'.png';
const setStatus=(message,error=false)=>{const el=$('finder-status');if(el){el.textContent=message;el.classList.toggle('finder-error',error)}};
function selectedPop(){return state.pops.find(p=>String(p.id)===String($('finder-pop')?.value))}
function needsImage(p){
 if(p.image&&String(p.image).trim())return false;
 // Image indexing is asynchronous; do not re-queue an image already saved
 // under its deterministic local filename.
 return !state.savedFiles.has(filename(p));
}
function queue(){return state.pops.filter(p=>!$('finder-missing-only')?.checked||needsImage(p))}
function updateQueueCount(){const el=$('finder-queue-count');if(el)el.textContent=state.pops.filter(needsImage).length+' Pops without images · '+queue().length+' in review queue'}
function clearSelection(){
 state.searchId++;
 state.previewId++;
 state.image=null;
 state.candidates=[];
 $('finder-results').replaceChildren();
 $('finder-preview').hidden=true;
 $('finder-preview').removeAttribute('src');
 $('finder-selected').textContent='';
 $('finder-source-credit').textContent='';
 $('finder-url').value='';
 $('finder-file').value='';
 $('finder-rights').checked=false;
}
function selectPopChanged(){
 clearSelection();
 const p=selectedPop();
 if(p){searchLinks(p);setStatus('Selected '+p.name+'. Review its exact number and edition before saving.')}
 else{$('finder-source-links').replaceChildren();setStatus('Choose a Pop to search for images.')}
}
function nextMissing(){const options=queue();if(!options.length)return setStatus('No Pops in the current review queue.');const select=$('finder-pop');const current=options.findIndex(p=>String(p.id)===select.value);const next=options[(current+1)%options.length];select.value=String(next.id);clearSelection();searchLinks(next);setStatus('Reviewing '+next.name+' #'+(next.number||'—')+'. Select Find images or open official Funko search.')}
function filterOptions(){const q=String($('finder-pop-filter')?.value||'').toLowerCase();const missingOnly=!!$('finder-missing-only')?.checked;for(const option of $('finder-pop').options){if(!option.value)continue;const p=state.pops.find(x=>String(x.id)===option.value);option.hidden=!option.textContent.toLowerCase().includes(q)||(missingOnly&&p&&!needsImage(p))}}
function populate(){
 const select=$('finder-pop');if(!select)return;
 const current=select.value;
 select.innerHTML='<option value="">Select a Pop…</option>'+state.pops.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.franchise+' · '+p.name+' #'+(p.number||'—')+' · '+(p.variant||'Standard'))+'</option>').join('');
 if(state.pops.some(p=>String(p.id)===current))select.value=current;
 updateQueueCount();filterOptions();
}
async function loadIndexedImages(){
 try{
  const response=await fetch('./assets/pop_images/index.json',{cache:'no-store'});
  if(!response.ok)return;
  const index=await response.json();
  // The index format is maintained by the repository workflow; inspect
  // both indexed filenames and item paths without assuming a single shape.
  const entries=Array.isArray(index)?index:Array.isArray(index.files)?index.files:Array.isArray(index.items)?index.items:[];
  for(const entry of entries){
   const path=typeof entry==='string'?entry:entry?.file||entry?.path||entry?.filename;
   if(path)state.savedFiles.add(String(path).split('/').pop());
  }
  updateQueueCount();filterOptions();
 }catch(e){/* Offline and first-run installations can lack an index. */}
}
function setPops(pops){state.pops=Array.isArray(pops)?pops:[];populate()}
function originalWikiUrls(url){
 if(!url||!url.includes('static.wikia.nocookie.net/'))return [url].filter(Boolean);
 const base=url.split('/revision/')[0].split('?')[0];
 const latest=base+'/revision/latest?format=original';
 return [base+'?format=original',latest,base,url].filter(Boolean);
}
async function imageLoads(url){
 return new Promise(resolve=>{
  const img=new Image();let finished=false;
  const done=ok=>{if(!finished){finished=true;clearTimeout(timer);resolve(ok)}};
  const timer=setTimeout(()=>done(false),6500);
  img.onload=()=>done(img.naturalWidth>0&&img.naturalHeight>0);
  img.onerror=()=>done(false);
  img.referrerPolicy='no-referrer';
  img.src=url;
 });
}
function wikiRedirect(title){
 return 'https://funko.fandom.com/wiki/Special:Redirect/file/'+encodeURIComponent(title.replace(/^File:/,'').replace(/ /g,'_'));
}
async function resolveCandidate(x){
 // Fandom's scaled /revision/latest/scale-to-width-down URLs can return
 // a 200-status generic placeholder rather than the collectible image.
 const urls=[...originalWikiUrls(x.url),...originalWikiUrls(x.thumb),x.fileTitle?wikiRedirect(x.fileTitle):null].filter(Boolean);
 for(const url of [...new Set(urls)])if(await imageLoads(url))return {...x,thumb:url,workingUrl:url};
 return null;
}
async function preview(url,source,description){
 const previewId=++state.previewId;
 state.image=null;
 $('finder-preview').hidden=true;
 $('finder-selected').textContent='Checking selected image…';
 const loaded=await imageLoads(url);
 if(previewId!==state.previewId)return;
 if(!loaded){
  state.image=null;
  $('finder-selected').textContent='Image unavailable: '+description;
  setStatus('This image URL does not load. The source may have removed or blocked the image. Choose another candidate or upload a downloaded file.',true);
  return;
 }
 state.image={url,source,description};
 $('finder-preview').src=url;
 $('finder-preview').hidden=false;
 $('finder-selected').textContent='Selected: '+description;
 setStatus('Image preview loaded. Note: a preview does not guarantee that the source permits browser downloads.');
}
// Candidate ranking is advisory only; a human must verify the exact edition.
const variantMarkers=['chase','flocked','diamond','metallic','blacklight','black light','glow','gitd','pearlescent'];
function matchCandidate(pop,candidate){
 const words=value=>new Set(String(value||'').toLowerCase().match(/[a-z0-9]+/g)||[]);
 const title=words(candidate.title),name=words(pop.name);
 const number=String(pop.number||'').trim();
 const explicitNumbers=[...title].filter(x=>/^[0-9]{2,4}$/.test(x)&&!(/^(19|20)[0-9]{2}$/.test(x)));
 if(number&&explicitNumbers.length&&!title.has(number))return {score:-1,reason:'Different figure number'};
 const required=variantMarkers.filter(x=>String(pop.variant||'').toLowerCase().includes(x));
 const present=variantMarkers.filter(x=>String(candidate.title||'').toLowerCase().includes(x));
 if(required.some(x=>!present.includes(x))||present.some(x=>!required.includes(x)))return {score:-1,reason:'Different variant'};
 const meaningful=[...name].filter(x=>x.length>2);
 const overlap=meaningful.filter(x=>title.has(x)).length/Math.max(1,meaningful.length);
 if(overlap<0.5)return {score:-1,reason:'Name mismatch'};
 return {score:overlap+(number&&title.has(number)?0.4:0),reason:number&&title.has(number)?'Number matched':'Verify number and edition'};
}
function showCandidates(items){
 state.candidates=items;
 $('finder-results').innerHTML=items.length?items.map((x,i)=>'<button type="button" class="finder-candidate" data-candidate="'+i+'"><img loading="lazy" referrerpolicy="no-referrer" src="'+esc(x.thumb||x.url)+'" alt="'+esc(x.title)+'"><span>'+esc(x.title)+'</span><small>'+esc(x.source)+'</small></button>').join(''):'<p>No working image previews found. Use the source links or upload an image file.</p>';
}
async function wikiQuery(params){
 const query=new URLSearchParams({action:'query',format:'json',origin:'*',...params});
 const response=await fetch('https://funko.fandom.com/api.php?'+query,{signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Funko Wiki API returned HTTP '+response.status);
 const json=await response.json();
 if(json.error)throw Error(json.error.info||json.error.code||'Wiki API error');
 return json;
}
function wikiCandidates(pages){
 return Object.values(pages||{}).flatMap(page=>(page.imageinfo||[])
  .filter(info=>/^image\/(png|jpeg|webp)$/i.test(info.mime||''))
  .map(info=>({title:page.title.replace(/^File:/,''),fileTitle:page.title,url:info.url,thumb:info.thumburl||info.url,source:'Funko Wiki',descriptionUrl:info.descriptionurl,license:info.extmetadata?.LicenseShortName?.value||''})));
}
async function fandomSearch(p){
 // Wiki articles live in namespace 0; searching only namespace 6 (files)
 // misses product pages even when they contain suitable images.
 const terms=[[p.name,p.number].filter(Boolean).join(' '),p.name].filter(Boolean);
 const seen=new Map();
 for(const term of [...new Set(terms)]){
  for(const ns of ['0','6']){
   const search=await wikiQuery({list:'search',srsearch:term,srnamespace:ns,srlimit:'20'});
   const titles=(search.query?.search||[]).map(x=>x.title);
   if(!titles.length)continue;
   if(ns==='6'){
    const files=await wikiQuery({titles:titles.join('|'),prop:'imageinfo',iiprop:'url|mime|extmetadata',iiurlwidth:'240'});
    for(const x of wikiCandidates(files.query?.pages))seen.set(x.url,x);
   }else{
    // Resolve article lead images instead of assuming every product has a
    // searchable filename that contains its name and number.
    const pages=await wikiQuery({titles:titles.join('|'),prop:'pageimages',piprop:'thumbnail|original',pithumbsize:'240'});
    for(const page of Object.values(pages.query?.pages||{})){
     const url=page.original?.source||page.thumbnail?.source;
     if(url&&/^https:\/\//.test(url))seen.set(url,{title:page.title,url,thumb:page.thumbnail?.source||url,source:'Funko Wiki article',descriptionUrl:'https://funko.fandom.com/wiki/'+encodeURIComponent(page.title.replace(/ /g,'_'))});
    }
   }
   if(seen.size>=24)return [...seen.values()].slice(0,24);
  }
 }
 return [...seen.values()].slice(0,24);
}
function searchLinks(p){
 const q=encodeURIComponent(['Funko Pop',p.name,p.number,p.variant].filter(Boolean).join(' '));
 $('finder-source-links').innerHTML='<a href="https://funko.com/search/?q='+q+'" target="_blank" rel="noopener">Search official Funko catalog ↗</a> <a href="https://funko.fandom.com/wiki/Special:Search?query='+q+'" target="_blank" rel="noopener">Search Funko Wiki ↗</a> <a href="https://www.popcultcha.com.au/catalogsearch/result/?q='+q+'" target="_blank" rel="noopener">Search Popcultcha ↗</a>';
}
async function search(){
 const p=selectedPop();if(!p){setStatus('Select a Pop first.',true);return}
 clearSelection();
 const searchId=state.searchId;searchLinks(p);
 setStatus('Searching Funko Wiki pages and image records…');
 try{const items=await fandomSearch(p);if(searchId!==state.searchId)return;const ranked=items.map(x=>({...x,match:matchCandidate(p,x)})).filter(x=>x.match.score>=0).sort((a,b)=>b.match.score-a.match.score);setStatus('Checking '+ranked.length+' plausible image URLs…');const verified=(await Promise.all(ranked.slice(0,24).map(resolveCandidate))).filter(Boolean);if(searchId!==state.searchId)return;showCandidates(verified);setStatus(verified.length?verified.length+' plausible images passed preview checks. Verify the exact Pop and variant before saving.':'No plausible image previews loaded. Try official Funko search or upload an authorized local image.',!verified.length)}
 catch(e){if(searchId!==state.searchId)return;showCandidates([]);setStatus('Automatic wiki lookup unavailable ('+e.message+'). Use the source search links, then paste an image URL or upload a permitted image.',true)}
}
async function readFile(file){
 if(!file||!/^image\/(png|jpeg|webp)$/i.test(file.type))throw Error('Choose a PNG, JPEG, or WebP image.');
 if(file.size>10*1024*1024)throw Error('Image must be 10 MB or smaller.');
 return await createImageBitmap(file);
}
async function toPng(blob){
 const bitmap=await readFile(blob);
 const canvas=document.createElement('canvas');
 const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height));
 canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
 canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
 return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Unable to encode image.')),'image/png'));
}
async function bytesBase64(blob){
 const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
 for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(binary);
}
async function gh(path,method,body){
 const r=await fetch(api+path,{method,headers:{Accept:'application/vnd.github+json','Content-Type':'application/json','Authorization':'Bearer '+state.token,'X-GitHub-Api-Version':'2022-11-28'},body:body?JSON.stringify(body):undefined});
 if(r.status===404&&method==='GET')return null;
 const json=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(json.message||'GitHub HTTP '+r.status);
 return json;
}
async function save(){
 const p=selectedPop(),file=$('finder-file').files[0],url=$('finder-url').value.trim()||state.image?.url;
 if(!p||(!file&&!url))return setStatus('Select a Pop and an image first.',true);
 if(!$('finder-rights').checked)return setStatus('Confirm you have permission to store and republish this image.',true);
 state.token=$('finder-token').value.trim();
 if(!state.token)return setStatus('Enter a GitHub fine-grained token with Contents: Read and write access to PopFolio.',true);
 $('finder-save').disabled=true;
 try{
  setStatus('Preparing image…');
  let blob=file;
  if(!blob){
   if(!/^https:\/\//i.test(url))throw Error('Use a secure HTTPS image URL.');
   const response=await fetch(url,{mode:'cors',signal:AbortSignal.timeout(15000)});
   if(!response.ok)throw Error('Image source returned HTTP '+response.status+' even though it appeared in search results. This source may use expired or blocked image links. Download an authorized copy from its page and select the local file instead.');
   blob=await response.blob();
  }
  const png=await toPng(blob);
  const name=filename(p),path='assets/pop_images/'+encodeURIComponent(name);
  const existing=await gh(path,'GET');
  if(existing&&!confirm('An image named '+name+' already exists. Replace it?'))return setStatus('Save canceled.');
  setStatus('Uploading '+name+' to GitHub…');
  await gh(path,'PUT',{message:'Add reviewed Pop image for '+p.name+' #'+p.number,content:await bytesBase64(png),branch:'main',...(existing?{sha:existing.sha}:{})});
  p.image='assets/pop_images/'+name;state.savedFiles.add(name);updateQueueCount();filterOptions();window.dispatchEvent(new CustomEvent('popfolio-image-uploaded',{detail:{id:p.id,file:name}}));
  setStatus('Saved '+name+' to GitHub. The Pop image has been updated in this session; the GitHub Action will update the persistent image index shortly.');
 }catch(e){setStatus('Could not save: '+e.message+'. If this is a cross-origin restriction, download the image and use the local file picker instead.',true)}
 finally{$('finder-save').disabled=false;state.token='';$('finder-token').value=''}
}
function init(){
 const root=$('image-finder');if(!root)return;
 loadIndexedImages();
 $('finder-search').addEventListener('click',search);
 $('finder-pop').addEventListener('change',selectPopChanged);
 $('finder-next')?.addEventListener('click',nextMissing);
 $('finder-missing-only')?.addEventListener('change',()=>{updateQueueCount();filterOptions()});
 $('finder-results').addEventListener('click',e=>{const b=e.target.closest('[data-candidate]');if(!b)return;const x=state.candidates[Number(b.dataset.candidate)];if(!x)return;preview(x.workingUrl||x.url,x.source,x.title);$('finder-url').value=x.workingUrl||x.url;$('finder-file').value='';$('finder-source-credit').textContent='Source: '+x.source+(x.license?' · License information: '+x.license:' · Check usage rights on the source page');$('finder-source-credit').dataset.url=x.descriptionUrl||''});
 $('finder-url-preview').addEventListener('click',()=>{state.image=null;const url=$('finder-url').value.trim();if(!/^https:\/\//i.test(url))return setStatus('Enter a secure HTTPS image URL.',true);$('finder-file').value='';preview(url,'URL',url)});
 $('finder-file').addEventListener('change',()=>{const f=$('finder-file').files[0];if(!f)return;preview(URL.createObjectURL(f),'Local file',f.name)});
 $('finder-save').addEventListener('click',save);
 $('finder-pop-filter').addEventListener('input',filterOptions);
}
document.addEventListener('DOMContentLoaded',init);
window.PopFolioImageFinder={setPops};
})();