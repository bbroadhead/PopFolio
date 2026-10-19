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
function preview(url,source,description){
 state.image={url,source,description};
 $('finder-preview').src=url;
 $('finder-preview').hidden=false;
 $('finder-selected').textContent='Selected: '+description;
 setStatus('Review the exact Pop and image rights before saving.');
}
function showCandidates(items){
 state.candidates=items;
 $('finder-results').innerHTML=items.length?items.map((x,i)=>'<button type="button" class="finder-candidate" data-candidate="'+i+'"><img loading="lazy" src="'+esc(x.thumb||x.url)+'" alt="'+esc(x.title)+'"><span>'+esc(x.title)+'</span><small>'+esc(x.source)+'</small></button>').join(''):'<p>No previewable candidates found. Use the source links or paste an image URL below.</p>';
}
async function fandomSearch(p){
 const term=[p.name,p.number,p.variant].filter(Boolean).join(' ');
 const params=new URLSearchParams({action:'query',generator:'search',gsrsearch:term,gsrnamespace:'6',gsrlimit:'20',prop:'imageinfo',iiprop:'url|mime|extmetadata',iiurlwidth:'240',format:'json',origin:'*'});
 const response=await fetch('https://funko.fandom.com/api.php?'+params,{signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Wiki API returned '+response.status);
 const json=await response.json();
 return Object.values(json.query?.pages||{}).flatMap(x=>(x.imageinfo||[]).filter(i=>/^image\/(png|jpeg|webp)$/i.test(i.mime||'')).map(i=>({title:x.title.replace(/^File:/,''),url:i.url,thumb:i.thumburl||i.url,source:'Funko Wiki',descriptionUrl:i.descriptionurl,license:i.extmetadata?.LicenseShortName?.value||''}))).slice(0,24);
}
function searchLinks(p){
 const q=encodeURIComponent(['Funko Pop',p.name,p.number,p.variant].filter(Boolean).join(' '));
 $('finder-source-links').innerHTML='<a href="https://funko.fandom.com/wiki/Special:Search?query='+q+'" target="_blank" rel="noopener">Search Funko Wiki ↗</a> <a href="https://www.popcultcha.com.au/catalogsearch/result/?q='+q+'" target="_blank" rel="noopener">Search Popcultcha ↗</a>';
}
async function search(){
 const p=selectedPop();if(!p){setStatus('Select a Pop first.',true);return}
 state.image=null;$('finder-preview').hidden=true;$('finder-selected').textContent='';searchLinks(p);
 setStatus('Searching Funko Wiki image records…');
 try{const items=await fandomSearch(p);showCandidates(items);setStatus(items.length?items.length+' candidates found. Check the number and variant carefully.':'No candidates found; try the source search links.')}
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
   if(!response.ok)throw Error('Image download failed: HTTP '+response.status);
   blob=await response.blob();
  }
  const png=await toPng(blob);
  const name=filename(p),path='assets/pop_images/'+encodeURIComponent(name);
  const existing=await gh(path,'GET');
  if(existing&&!confirm('An image named '+name+' already exists. Replace it?'))return setStatus('Save canceled.');
  setStatus('Uploading '+name+' to GitHub…');
  await gh(path,'PUT',{message:'Add reviewed Pop image for '+p.name+' #'+p.number,content:await bytesBase64(png),branch:'main',...(existing?{sha:existing.sha}:{})});
  setStatus('Saved '+name+' to the repository. The automatic image index will update after the GitHub Action runs.');
 }catch(e){setStatus('Could not save: '+e.message+'. If this is a cross-origin restriction, download the image and use the local file picker instead.',true)}
 finally{$('finder-save').disabled=false;state.token=''}
}
function init(){
 const root=$('image-finder');if(!root)return;
 $('finder-search').addEventListener('click',search);
 $('finder-results').addEventListener('click',e=>{const b=e.target.closest('[data-candidate]');if(!b)return;const x=state.candidates[Number(b.dataset.candidate)];preview(x.url,x.source,x.title);$('finder-url').value=x.url;$('finder-file').value='';$('finder-source-credit').textContent='Source: '+x.source+(x.license?' · License information: '+x.license:' · Check usage rights on the source page');$('finder-source-credit').dataset.url=x.descriptionUrl||''});
 $('finder-url-preview').addEventListener('click',()=>{const url=$('finder-url').value.trim();if(!/^https:\/\//i.test(url))return setStatus('Enter a secure HTTPS image URL.',true);$('finder-file').value='';preview(url,'URL',url)});
 $('finder-file').addEventListener('change',()=>{const f=$('finder-file').files[0];if(!f)return;preview(URL.createObjectURL(f),'Local file',f.name)});
 $('finder-save').addEventListener('click',save);
 $('finder-pop-filter').addEventListener('input',e=>{const q=e.target.value.toLowerCase();const select=$('finder-pop');for(const option of select.options)option.hidden=!!option.value&&!option.textContent.toLowerCase().includes(q)});
}
document.addEventListener('DOMContentLoaded',init);
window.PopFolioImageFinder={setPops};
})();