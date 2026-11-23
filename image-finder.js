(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slug=s=>String(s||'').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,110);
const state={pops:[],selected:null,candidates:[],image:null,token:'',license:'',searchId:0,previewId:0,savedFiles:new Set(),batch:[],batchBusy:false};
const api='https://api.github.com/repos/bbroadhead/PopFolio/contents/';
const filename=p=>slug(p.name)+'-'+slug(p.number)+(p.variant?'-'+slug(p.variant).slice(0,38):'')+'.png';
const normalizeImageName=value=>String(value||'').split('/').pop().replace(/\.[^.]+$/,'').toLowerCase();
const existingImageNames=()=>new Set([...state.savedFiles].map(normalizeImageName));
const setStatus=(message,error=false)=>{const el=$('finder-status');if(el){el.textContent=message;el.classList.toggle('finder-error',error)}};
function selectedPop(){return state.pops.find(p=>String(p.id)===String($('finder-pop')?.value))}
function needsImage(p){
 if(p.image&&String(p.image).trim())return false;
 // Image indexing is asynchronous; do not re-queue an image already saved
 // under its deterministic local filename.
 return !existingImageNames().has(normalizeImageName(filename(p)));
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
// Escape cells and neutralize spreadsheet formula injection, including leading whitespace.
function csvCell(value){
 const raw=String(value??'');
 const safe=/^[\\s]*[=+@-]/.test(raw)?"'"+raw:raw;
 return '"'+safe.replace(/"/g,'""')+'"';
}
function exportQueue(){
 const rows=queue();
 if(!rows.length)return setStatus('No Pops in the current review queue.');
 const cell=csvCell;
 const header=['ID','Franchise','Name','Number','Variant','Expected filename','Existing image','Official Funko search'];
 const lines=[header.map(cell).join(',')];
 for(const p of rows){
  const q=encodeURIComponent(['Funko Pop',p.name,p.number,p.variant].filter(Boolean).join(' '));
  lines.push([p.id,p.franchise,p.name,p.number,p.variant,filename(p),p.image||'','https://funko.com/search/?q='+q].map(cell).join(','));
 }
 const blob=new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download='popfolio-image-review-queue.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 setStatus('Exported '+rows.length+' Pops for manual image review. No images were downloaded or uploaded.');
}
function batchMatch(file,pops){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>10*1024*1024||file.size===0)return {pop:null,reason:'Unsupported or oversized image'};
 const base=normalizeImageName(file.name);
 const exact=pops.filter(p=>normalizeImageName(filename(p))===base);
 if(exact.length===1)return {pop:exact[0],reason:'Exact expected filename'};
 if(exact.length>1)return {pop:null,reason:'Ambiguous filename'};
 const tokens=new Set(base.split(/[^a-z0-9]+/).filter(Boolean));
 // A file that explicitly identifies another figure number must not be
 // attached to a different number just because its character name matches.
 const numbered=[...tokens].filter(t=>t.length>=2&&t.length<=4&&[...t].every(ch=>ch>='0'&&ch<='9')&&!t.startsWith('19')&&!t.startsWith('20'));
 if(numbered.length>1)return {pop:null,reason:'Multiple figure numbers in filename'};
 const numberMatches=pops.filter(p=>p.number&&tokens.has(String(p.number).toLowerCase())&&slug(p.name).toLowerCase().split('-').filter(Boolean).every(t=>tokens.has(t)));
 if(numberMatches.length!==1)return {pop:null,reason:numberMatches.length?'Ambiguous match':'No confident match'};
 const pop=numberMatches[0];
 const variants=variantMarkers.filter(marker=>String(pop.variant||'').toLowerCase().includes(marker));
 const fileVariants=variantMarkers.filter(marker=>base.replace(/-/g,' ').includes(marker));
 if(variants.some(v=>!fileVariants.includes(v))||fileVariants.some(v=>!variants.includes(v)))return {pop:null,reason:'Variant needs manual matching'};
 return {pop,reason:'Name and number matched'};
}
function reviewBatch(){
 if(state.batchBusy)return setStatus('Wait for the current batch upload to finish.',true);
 state.batch=[];
 $('finder-bulk-upload').disabled=true;
 $('finder-bulk-progress').textContent='';
 const files=[...($('finder-bulk-files')?.files||[])];
 const root=$('finder-bulk-results');root.replaceChildren();
 if(!files.length)return setStatus('Choose image files for batch review first.',true);
 const matches=files.map(file=>({file,...batchMatch(file,state.pops),approved:false}));
 state.batch=matches;
 const counts=new Map();
 for(const item of matches)if(item.pop)counts.set(String(item.pop.id),(counts.get(String(item.pop.id))||0)+1);
 for(const item of matches){
  if(item.pop&&counts.get(String(item.pop.id))>1){item.pop=null;item.reason='Duplicate match in batch'}
  const row=document.createElement('div');row.className='finder-bulk-row';
  const label=document.createElement('span');
  label.textContent=item.file.name+' — '+item.reason;
  const select=document.createElement('select');select.setAttribute('aria-label','Match Pop for '+item.file.name);
  const blank=document.createElement('option');blank.value='';blank.textContent='Skip / unmatched';select.append(blank);
  for(const pop of state.pops){
   const option=document.createElement('option');option.value=String(pop.id);
   option.textContent=(pop.franchise||'')+' · '+pop.name+' #'+(pop.number||'—')+(pop.variant?' · '+pop.variant:'')+(needsImage(pop)?'':' · HAS IMAGE');
   select.append(option);
  }
  select.value=item.pop?String(item.pop.id):'';
  const button=document.createElement('button');button.type='button';button.textContent='Review selected image';
  button.addEventListener('click',async()=>{
   item.approved=false;item.rightsConfirmed=false;approve.disabled=true;approve.textContent='Approve for batch';
   $('finder-bulk-upload').disabled=!state.batch.some(x=>x.approved);
   const pop=state.pops.find(p=>String(p.id)===select.value);
   if(!pop)return setStatus('Choose a Pop for this image first.',true);
   const duplicates=[...root.querySelectorAll('.finder-bulk-row select')].filter(x=>x.value===select.value);
   if(duplicates.length>1&&!confirm('Multiple files are assigned to this Pop. Review this file anyway?'))return;
   if(!needsImage(pop)&&!confirm('This Pop already has an image. Continue to review a possible replacement?'))return;
   $('finder-pop').value=String(pop.id);selectPopChanged();
   const dt=new DataTransfer();dt.items.add(item.file);$('finder-file').files=dt.files;
   const objectUrl=URL.createObjectURL(item.file);
   try{
    const loaded=await preview(objectUrl,'Local file',item.file.name,item.file);
    if(loaded&&String(selectedPop()?.id)===String(pop.id)&&select.value===String(pop.id)){
     approve.disabled=false;
     setStatus('Preview ready. Verify the edition and check image rights, then approve this file.');
    }
   }finally{setTimeout(()=>URL.revokeObjectURL(objectUrl),60000)}
  });
  const approve=document.createElement('button');approve.type='button';approve.textContent='Approve for batch';approve.disabled=true;
  select.addEventListener('change',()=>{item.approved=false;item.rightsConfirmed=false;approve.disabled=true;approve.textContent='Approve for batch';$('finder-bulk-upload').disabled=!state.batch.some(x=>x.approved)});

  approve.addEventListener('click',()=>{
   const pop=state.pops.find(p=>String(p.id)===select.value);
   if(!pop||!needsImage(pop))return setStatus('Batch uploads skip Pops with existing images. Use individual save to replace one.',true);
   if(!state.image||state.image.file!==item.file||String(selectedPop()?.id)!==String(pop.id))return setStatus('Preview this exact image and Pop again before approval.',true);
   if(!$('finder-rights').checked)return setStatus('Confirm you have permission to store and republish this image first.',true);
   item.pop=pop;item.approved=true;item.rightsConfirmed=true;approve.disabled=true;approve.textContent='Approved';
   $('finder-bulk-upload').disabled=false;
  });
  row.append(label,select,button,approve);root.append(row);
 }
 setStatus('Prepared '+files.length+' local images. Review and correct each match; no images were uploaded.');
}


async function uploadBatch(){
 if(state.batchBusy)return;
 const items=state.batch.filter(x=>x.approved);
 if(!items.length)return setStatus('Review and approve at least one image first.',true);
 if(items.some(x=>!x.rightsConfirmed))return setStatus('Each approved image needs its own reuse-rights confirmation.',true);
 const token=$('finder-token').value.trim();
 if(!token)return setStatus('Enter your GitHub token before uploading.',true);
 if(new Set(items.map(x=>String(x.pop.id))).size!==items.length)return setStatus('Duplicate Pop assignments in approved batch. Correct them before uploading.',true);
 if(!confirm('Upload '+items.length+' individually approved images? Existing images will be skipped.'))return;
 state.batchBusy=true;state.token=token;
 $('finder-bulk-upload').disabled=true;$('finder-bulk-review').disabled=true;
 let uploaded=0,skipped=0,failed=0;
 try{
  for(let i=0;i<items.length;i++){
   const item=items[i],p=item.pop,name=filename(p),path='assets/pop_images/'+encodeURIComponent(name);
   const progress=$('finder-bulk-progress');
   progress.textContent='Processing '+(i+1)+'/'+items.length+': '+name+' (uploaded '+uploaded+', skipped '+skipped+', failed '+failed+')';
   try{
    if(!needsImage(p)){skipped++;continue}
    const existing=await gh(path,'GET');
    if(existing){skipped++;continue}
    const png=await toPng(item.file);
    await gh(path,'PUT',{message:'Add approved Pop image for '+p.name+' #'+p.number,content:await bytesBase64(png),branch:'main'});
    p.image='assets/pop_images/'+name;state.savedFiles.add(name);item.approved=false;item.rightsConfirmed=false;
    window.dispatchEvent(new CustomEvent('popfolio-image-uploaded',{detail:{id:p.id,file:name}}));
    uploaded++;
   }catch(e){failed++;item.error=e.message}
  }
  updateQueueCount();filterOptions();
  $('finder-bulk-progress').textContent='Finished: '+uploaded+' uploaded, '+skipped+' skipped, '+failed+' failed. Failed approvals remain available to retry.';
  setStatus('Batch finished. The repository image index will update after GitHub Actions runs.',failed>0);
 }finally{
  state.batchBusy=false;state.token='';$('finder-token').value='';
  $('finder-bulk-review').disabled=false;
  $('finder-bulk-upload').disabled=!state.batch.some(x=>x.approved);
 }
}

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
async function preview(url,source,description,file=null){
 const previewId=++state.previewId;
 state.image=null;
 $('finder-preview').hidden=true;
 $('finder-selected').textContent='Checking selected image…';
 const loaded=await imageLoads(url);
 if(previewId!==state.previewId)return false;
 if(!loaded){
  state.image=null;
  $('finder-selected').textContent='Image unavailable: '+description;
  setStatus('This image URL does not load. The source may have removed or blocked the image. Choose another candidate or upload a downloaded file.',true);
  return false;
 }
 state.image={url,source,description,file};
 $('finder-preview').src=url;
 $('finder-preview').hidden=false;
 $('finder-selected').textContent='Selected: '+description;
 setStatus('Image preview loaded. Note: a preview does not guarantee that the source permits browser downloads.');
 return true;
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
 // A pasted URL must be previewed for this Pop before it can be saved.
 // This also prevents a URL edited after preview from silently changing the upload.
 if(!file&&(!state.image||state.image.url!==url))return setStatus('Preview the current image URL before saving it.',true);
 if(file&&(!state.image||state.image.source!=='Local file'||state.image.file!==file))return setStatus('Wait for the selected local file to finish previewing before saving.',true);
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
  // The index can contain a JPEG/JPG for this same figure. Never silently
  // add a competing PNG and make display precedence ambiguous.
  const conflicts=[...state.savedFiles].filter(file=>normalizeImageName(file)===normalizeImageName(name)&&file.toLowerCase()!==name.toLowerCase());
  if(conflicts.length&&!confirm('A different image file already exists for this Pop: '+conflicts.join(', ')+'. Saving will add a PNG alongside it, not remove the original. Continue?'))return setStatus('Save canceled; existing image preserved.');
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
 $('finder-export')?.addEventListener('click',exportQueue);
 $('finder-bulk-review')?.addEventListener('click',reviewBatch);
 $('finder-bulk-upload')?.addEventListener('click',uploadBatch);
 $('finder-missing-only')?.addEventListener('change',()=>{updateQueueCount();filterOptions()});
 $('finder-results').addEventListener('click',e=>{const b=e.target.closest('[data-candidate]');if(!b)return;const x=state.candidates[Number(b.dataset.candidate)];if(!x)return;preview(x.workingUrl||x.url,x.source,x.title);$('finder-url').value=x.workingUrl||x.url;$('finder-file').value='';$('finder-source-credit').textContent='Source: '+x.source+(x.license?' · License information: '+x.license:' · Check usage rights on the source page');$('finder-source-credit').dataset.url=x.descriptionUrl||''});
 $('finder-url-preview').addEventListener('click',()=>{state.image=null;const url=$('finder-url').value.trim();if(!/^https:\/\//i.test(url))return setStatus('Enter a secure HTTPS image URL.',true);$('finder-file').value='';preview(url,'URL',url)});
 $('finder-file').addEventListener('change',()=>{const f=$('finder-file').files[0];if(!f)return;preview(URL.createObjectURL(f),'Local file',f.name,f)});
 $('finder-save').addEventListener('click',save);
 $('finder-pop-filter').addEventListener('input',filterOptions);
}
document.addEventListener('DOMContentLoaded',init);
window.PopFolioImageFinder={setPops};
})();