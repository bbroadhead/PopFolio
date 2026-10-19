(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s||'').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,110);
const state={pops:[],selected:null,candidates:[],image:null,token:'',license:''};
const api='https://api.github.com/repos/bbroadhead/PopFolio/contents/';
const filename=p=>slug(p.name)+'-'+slug(p.number)+(p.variant?'-'+slug(p.variant).slice(0,38):'')+'.png';
const setStatus=(message,error=false)=>{const el=$('finder-status');if(el){el.textContent=message;el.classList.toggle('finder-error',error)}};
function selectedPop(){return state.pops.find(p=>String(p.id)===String($('finder-pop')?.value))}
function populate(){
 const select=$('finder-pop');if(!select)return;
 const current=select.value;
 select.innerHTML='<option value="">Select a Pop…</option>'+state.pops.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.franchise+' · '+p.name+' #'+(p.number||'—')+' · '+(p.variant||'Standard'))+'</option>').join('');
 if(state.pops.some(p=>String(p.id)===current))select.value=current;
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
 $('finder-preview').hidden=true;
 $('finder-selected').textContent='Checking selected image…';
 if(!await imageLoads(url)){
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
 $('finder-source-links').innerHTML='<a href="https://funko.fandom.com/wiki/Special:Search?query='+q+'" target="_blank" rel="noopener">Search Funko Wiki ↗</a> <a href="https://www.popcultcha.com.au/catalogsearch/result/?q='+q+'" target="_blank" rel="noopener">Search Popcultcha ↗</a>';
}
async function search(){
 const p=selectedPop();if(!p){setStatus('Select a Pop first.',true);return}
 state.image=null;$('finder-preview').hidden=true;$('finder-selected').textContent='';searchLinks(p);
 setStatus('Searching Funko Wiki pages and image records…');
 try{const items=await fandomSearch(p);setStatus('Checking '+items.length+' candidate image URLs…');const verified=(await Promise.all(items.slice(0,24).map(resolveCandidate))).filter(Boolean);showCandidates(verified);setStatus(verified.length?verified.length+' images passed preview checks. Verify the exact Pop and variant before saving.':'The Wiki returned results, but none of their image URLs loaded. Try the source links or upload a local image.',!verified.length)}
 catch(e){showCandidates([]);setStatus('Automatic wiki lookup unavailable ('+e.message+'). Use the source search links, then paste an image URL or upload a permitted image.',true)}
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
 const p=selectedPop(),file=$('finder-file').files[0],url=state.image?.url||$('finder-url').value.trim();
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
  window.dispatchEvent(new CustomEvent('popfolio-image-uploaded',{detail:{id:p.id,file:name}}));
  setStatus('Saved '+name+' to GitHub. The Pop image has been updated in this session; the GitHub Action will update the persistent image index shortly.');
 }catch(e){setStatus('Could not save: '+e.message+'. If this is a cross-origin restriction, download the image and use the local file picker instead.',true)}
 finally{$('finder-save').disabled=false;state.token='';$('finder-token').value=''}
}
function init(){
 const root=$('image-finder');if(!root)return;
 $('finder-search').addEventListener('click',search);
 $('finder-results').addEventListener('click',e=>{const b=e.target.closest('[data-candidate]');if(!b)return;const x=state.candidates[Number(b.dataset.candidate)];preview(x.workingUrl||x.url,x.source,x.title);$('finder-url').value=x.workingUrl||x.url;$('finder-file').value='';$('finder-source-credit').textContent='Source: '+x.source+(x.license?' · License information: '+x.license:' · Check usage rights on the source page');$('finder-source-credit').dataset.url=x.descriptionUrl||''});
 $('finder-url-preview').addEventListener('click',()=>{const url=$('finder-url').value.trim();if(!/^https:\/\//i.test(url))return setStatus('Enter a secure HTTPS image URL.',true);$('finder-file').value='';preview(url,'URL',url)});
 $('finder-file').addEventListener('change',()=>{const f=$('finder-file').files[0];if(!f)return;preview(URL.createObjectURL(f),'Local file',f.name)});
 $('finder-save').addEventListener('click',save);
 $('finder-pop-filter').addEventListener('input',e=>{const q=e.target.value.toLowerCase();const select=$('finder-pop');for(const option of select.options)option.hidden=!!option.value&&!option.textContent.toLowerCase().includes(q)});
}
document.addEventListener('DOMContentLoaded',init);
window.PopFolioImageFinder={setPops};
})();