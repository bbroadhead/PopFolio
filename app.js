(()=>{'use strict';
const $=id=>document.getElementById(id),currency=v=>(v<0?'−':'')+'$'+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}),signed=v=>(v>=0?'+':'−')+currency(Math.abs(v)),escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let source=null,inventory=[];
// Match local photos by collectible number and identity; do not guess across variants.
const localPopImages=[
 {file:'Yennefer-1318.PNG',number:'1318',name:/\byennefer\b/i},
 {file:'Byers-House-Will-1187.PNG',number:'1187',name:/\bwill\b/i,franchise:/stranger things/i},
 {file:'Reinhardt-400.JPG',number:'400',name:/\breinhardt\b/i,franchise:/overwatch/i},
 {file:'Geralt-1321.JPG',number:'1321',name:/\bgeralt\b/i},
 {file:'Reinhardt-178.JPG',number:'178',name:/\breinhardt\b/i,franchise:/overwatch/i},
 {file:'Boba-Fett-297-Futura-Red.JPG',number:'297',name:/\bboba\s+fett\b/i,variant:/futura|red/i},
 {file:'Campaign-Eddie-1477.png',number:'1477',name:/\bcampaign\s+eddie\b/i,franchise:/stranger things/i},
 {file:'Geralt-1317.png',number:'1317',name:/\bgeralt\b/i},
 {file:'Steve-1542.png',number:'1542',name:/\bsteve\b/i,franchise:/stranger things/i},
 {file:'Boba-Fett-and-Fennec-on-Throne-486.png',number:'486',name:/\bboba\b.*\bfennec\b|\bfennec\b.*\bboba\b/i,franchise:/star wars|mandalorian|book of boba/i}
];
function applyLocalPopImages(items){
 for(const p of items){
  const number=String(p.number||'').trim();
  const name=String(p.name||'').replace(/[^a-z0-9]+/gi,' ');
  const variant=String(p.variant||'')+' '+String(p.name||'');
  const match=localPopImages.find(x=>x.number===number&&x.name.test(name)&&(!x.franchise||x.franchise.test(p.franchise||''))&&(!x.variant||x.variant.test(variant)));
  if(match)p.image='./assets/pop_images/'+encodeURIComponent(match.file);
 }
 return items;
}
let selectedFranchises=new Set();
function groups(){if(!source)return[];return source.groups.filter(g=>selectedFranchises.size===0||selectedFranchises.has(g.name))}
function updateFranchiseDropdown(){
 if(!source)return;
 const names=[...new Set(source.groups.map(g=>g.name))].sort((a,b)=>a.localeCompare(b));
 selectedFranchises=new Set([...selectedFranchises].filter(n=>names.includes(n)));
 const text=selectedFranchises.size===0?'All franchises':selectedFranchises.size===1?[...selectedFranchises][0]:selectedFranchises.size+' franchises selected';
 for(const prefix of ['', 'overview-']){
  const menu=$(prefix+'franchise-options');
  menu.innerHTML='<label class="franchise-option"><input type="checkbox" value="__all__" '+(selectedFranchises.size===0?'checked':'')+'><span>All franchises</span></label>'+names.map(n=>'<label class="franchise-option"><input type="checkbox" value="'+escape(n)+'" '+(selectedFranchises.has(n)?'checked':'')+'><span>'+escape(n)+'</span></label>').join('');
  $(prefix+'group-text').textContent=text;
 }
}
function closeFranchiseMenu(){
 for(const prefix of ['', 'overview-']){$(prefix+'franchise-options').hidden=true;$(prefix+'group').setAttribute('aria-expanded','false')}
}
for(const prefix of ['', 'overview-']){
 $(prefix+'group').addEventListener('click',()=>{
  const menu=$(prefix+'franchise-options'),open=menu.hidden;
  closeFranchiseMenu();menu.hidden=!open;$(prefix+'group').setAttribute('aria-expanded',String(open));
 });
 $(prefix+'franchise-options').addEventListener('change',event=>{
  const input=event.target;if(!input.matches('input[type="checkbox"]'))return;
  if(input.value==='__all__')selectedFranchises.clear();
  else if(input.checked)selectedFranchises.add(input.value);
  else selectedFranchises.delete(input.value);
  updateFranchiseDropdown();render();
 });
}
document.addEventListener('click',event=>{if(!event.target.closest('.franchise-multi'))closeFranchiseMenu()});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeFranchiseMenu()});
function renderActualSales(){
 const target=$('actual-sales-card');if(!target)return;
 const selected=inventory.filter(p=>selectedFranchises.size===0||selectedFranchises.has(p.franchise));
 const number=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
 const sold=selected.filter(p=>number(p.sold)!==null);
 const revenue=sold.reduce((sum,p)=>sum+number(p.sold),0);
 const complete=sold.filter(p=>number(p.netProfit)!==null&&number(p.cost)!==null);
 const profit=complete.reduce((sum,p)=>sum+number(p.netProfit),0);
 const basis=complete.reduce((sum,p)=>sum+number(p.cost),0);
 $('actual-sales-total').textContent=sold.length?currency(revenue):'—';
 $('actual-profit-total').textContent=complete.length?currency(profit):'—';
 $('actual-roi-total').textContent=complete.length&&basis>0?(profit>=0?'+':'')+(profit/basis*100).toFixed(1)+'%':'—';
 for(const key of ['actual-profit-total','actual-roi-total']){$(key).classList.toggle('positive',complete.length>0&&profit>=0);$(key).classList.toggle('negative',complete.length>0&&profit<0)}
 const portfolioCost=selected.reduce((sum,p)=>sum+(number(p.cost)||0),0);
 const portfolioDifference=revenue-portfolioCost;
 const differenceNode=$('sales-minus-portfolio-cost');
 differenceNode.textContent=sold.length?currency(portfolioDifference):'—';
 differenceNode.classList.toggle('positive',sold.length>0&&portfolioDifference>=0);
 differenceNode.classList.toggle('negative',sold.length>0&&portfolioDifference<0);
 $('actual-sales-count').textContent=sold.length?complete.length===sold.length?sold.length+' sold Pops recorded':complete.length+' of '+sold.length+' sold Pops have complete profit and cost data':'No recorded sales';
}
function render(){renderActualSales();renderRecentPurchases();renderRecentImports();renderNumberAudit();if(!source)return;const filtered=groups(),sum=k=>filtered.reduce((v,x)=>v+(Number(x[k])||0),0),cost=sum('cost'),value=sum('value'),gain=value-cost,roi=cost?100*gain/cost:0;
$('market').textContent=currency(value);$('cost').textContent=currency(cost);$('gain').textContent=signed(gain);$('roi').textContent=(roi>=0?'+':'')+roi.toFixed(1)+'%';$('count').textContent=sum('count')+' Pops in selection';
for(const id of ['gain','roi']){$(id).classList.toggle('positive',gain>=0);$(id).classList.toggle('negative',gain<0)}
const parts=gain>=0?[{value:cost,color:'#64748b'},{value:gain,color:'#65e0b1'}]:[{value:value,color:'#64748b'},{value:-gain,color:'#f87171'}],total=parts.reduce((a,x)=>a+x.value,0);
$('allocation').innerHTML=parts.map(x=>'<div style="width:'+(total?x.value/total*100:0)+'%;background:'+x.color+'"></div>').join('');
$('insight-count').textContent=sum('count').toLocaleString();$('insight-franchises').textContent=filtered.length;
const byValue=[...filtered].sort((a,b)=>b.value-a.value),byGain=[...filtered].sort((a,b)=>b.gain-a.gain);$('insight-top').textContent=byValue[0]?.name||'—';$('insight-gain').textContent=byGain[0]?byGain[0].name+' ('+signed(byGain[0].gain)+')':'—';
const metric=$('metric').value,score=x=>metric==='roi'?(x.cost?x.gain/x.cost*100:0):x[metric],top=[...filtered].sort((a,b)=>score(b)-score(a)),max=Math.max(1,...top.map(x=>Math.abs(score(x))));
$('bars').innerHTML=top.map(x=>{const v=score(x),label=metric==='roi'?(v>=0?'+':'')+v.toFixed(1)+'%':metric==='count'?v:Math.abs(v)>=1000?'$'+(v/1000).toFixed(2)+'k':currency(v);return '<div class="barrow"><span class="barname" title="'+escape(x.name)+'">'+escape(x.name)+'</span><div class="track"><div class="fill" style="width:'+Math.max(.6,Math.abs(v)/max*100)+'%;background:'+(v<0?'#f87171':'linear-gradient(90deg,#7664e8,#b49bff)')+'"></div></div><span class="barvalue '+(v<0?'negative':'')+'">'+label+'</span></div>'}).join('')||'<p>No franchises match these filters.</p>';
const sorted=[...filtered].sort((a,b)=>b.value-a.value);
$('matches').textContent=filtered.length+' franchises';$('rows').innerHTML=sorted.map(x=>{const pct=x.cost?x.gain/x.cost*100:0;return '<tr><td>'+escape(x.name)+'</td><td>'+x.count+'</td><td>'+currency(x.cost)+'</td><td>'+currency(x.value)+'</td><td class="'+(x.gain>=0?'positive':'negative')+'">'+signed(x.gain)+'</td><td class="'+(pct>=0?'positive':'negative')+'">'+(pct>=0?'+':'')+pct.toFixed(1)+'%</td></tr>'}).join('');
}
async function init(){try{const response=await fetch('./data/portfolio.json?nocache='+Date.now(),{cache:'no-store'});if(!response.ok)throw Error('HTTP '+response.status);const data=await response.json();if(!Array.isArray(data.groups)||!data.groups.length)throw Error('Empty data');source=data;updateFranchiseDropdown();const stamp=data.updatedAt?new Date(data.updatedAt):null;const date=stamp&&!isNaN(stamp.getTime())?stamp.toLocaleString():'Date unavailable';$('sync').textContent='Data snapshot · '+date;$('updated').textContent='Last successful data sync: '+date;render()}catch(error){$('sync').textContent='Data unavailable';$('updated').textContent='Could not load portfolio data: '+String(error.message||error)}}
$('metric').addEventListener('change',render);
for(const id of ['reset','overview-reset'])$(id).addEventListener('click',()=>{selectedFranchises.clear();updateFranchiseDropdown();closeFranchiseMenu();render()});
document.querySelectorAll('[data-collection-tab]').forEach(button=>button.addEventListener('click',()=>{
 const tab=button.dataset.collectionTab;
 document.querySelectorAll('[data-collection-tab]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});
 for(const key of ['overview','pops','franchises'])$('collection-'+key).hidden=key!==tab;
 closeFranchiseMenu();
}));
const recentCardItems={purchases:[],imports:[]};
let syncButtonResetTimer;
let syncProgressHideTimer;
async function syncNow(){
 const button=$('sync-now'),panel=$('sync-progress'),meter=$('sync-meter'),stage=$('sync-stage'),pct=$('sync-percent'),detail=$('sync-detail');
 clearTimeout(syncButtonResetTimer);
 clearTimeout(syncProgressHideTimer);
 const normalLabel=button.dataset.normalLabel||button.textContent;
 button.dataset.normalLabel=normalLabel;
 button.textContent='Syncing…';button.disabled=true;panel.hidden=false;
 meter.value=5;pct.textContent='5%';stage.textContent='Fetching live spreadsheet';detail.textContent='Reading Google Sheets directly';
 try{
  const result=await window.PopFolioLive.fetchAll((done,total)=>{meter.value=Math.round(5+90*done/total);pct.textContent=meter.value+'%'});
  source=result.portfolio;inventory=applyLocalPopImages(result.items);wishlist=result.wishlist;recordImports(inventory);updateFranchiseDropdown();
  const names=[...new Set(inventory.map(p=>p.franchise))].sort();
  $('pop-franchise').innerHTML='<option value="all">Every franchise</option>'+names.map(n=>'<option value="'+escape(n)+'">'+escape(n)+'</option>').join('');
  render();drawPops();renderFeatures();renderRecentPurchases();
  window.dispatchEvent(new CustomEvent('popfolio-data-updated',{detail:{items:inventory,source:'Google Sheets'}}));
  meter.value=100;pct.textContent='100%';stage.textContent='Live spreadsheet sync complete';
  detail.textContent=inventory.length+' Pops · '+inventory.filter(p=>p.sold!==null).length+' sales · '+inventory.filter(p=>!String(p.number||'').trim()).length+' blank Pop number fields (see audit)';
  $('sync').textContent='Live Google Sheets · '+new Date().toLocaleTimeString();
  $('updated').textContent='Last live spreadsheet sync: '+new Date().toLocaleString();
  button.textContent='✓ Synced';
  syncProgressHideTimer=setTimeout(()=>{panel.hidden=true},4000);
 }catch(error){
  stage.textContent='Sync failed';detail.textContent=String(error.message||error)+' · Existing collection retained';
  button.textContent='✕ Sync failed';
 }finally{
  button.disabled=false;
  syncButtonResetTimer=setTimeout(()=>{button.textContent=normalLabel},4000);
 }
}
function parseCsv(input){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<input.length;i++){const c=input[i];if(c==='"'){if(quoted&&input[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}return rows}
const importStoreKey='popfolio-import-tracker-v1';
let importTracker={seen:null,recent:[]};
try{const saved=JSON.parse(localStorage.getItem(importStoreKey)||'null');if(saved&&Array.isArray(saved.seen)&&Array.isArray(saved.recent))importTracker=saved}catch(e){console.warn('Import history storage unavailable',e)}
function importIdentity(p){return [p.franchise,p.name,p.variant,p.date,p.platform].map(x=>String(x??'').trim().toLowerCase()).join('|')}
function recordImports(list){
 const current=new Set(list.map(importIdentity));
 if(importTracker.seen===null){importTracker.seen=[...current]}
 else{
  const prior=new Set(importTracker.seen);
  const now=new Date().toISOString();
  const additions=list.filter(p=>!prior.has(importIdentity(p)));
  for(const p of additions){const key=importIdentity(p);if(!importTracker.recent.some(x=>x.key===key))importTracker.recent.unshift({key,importedAt:now,pop:p})}
  importTracker.recent=importTracker.recent.slice(0,50);
  importTracker.seen=[...current];
 }
 try{localStorage.setItem(importStoreKey,JSON.stringify(importTracker))}catch(e){console.warn('Import history could not be saved',e)}
 renderRecentImports();
}
function renderRecentImports(){
 const target=$('recent-imports-list');if(!target)return;
 const rows=importTracker.recent.filter(x=>selectedFranchises.size===0||selectedFranchises.has(x.pop.franchise)).slice(0,5);recentCardItems.imports=rows.map(x=>inventory.find(p=>importIdentity(p)===x.key)||x.pop);
 target.innerHTML=rows.map(({pop:p,importedAt},i)=>'<article class="recent-pop" role="button" tabindex="0" data-recent-index="'+(typeof i==='number'?i:0)+'" aria-label="View details for '+escape(p.name)+'"><div class="recent-pop-image">'+(p.image?'<img loading="lazy" src="'+escape(p.image)+'" alt="">':'◈')+'</div><div class="recent-pop-info"><strong>'+escape(p.name)+'</strong><span>'+escape(p.franchise)+' · #'+escape(p.number||'Not recorded')+'</span><span>'+escape(p.variant||'Standard')+'</span><span>Detected '+escape(new Date(importedAt).toLocaleString())+'</span></div><div class="recent-pop-values"><span><small>All-in cost</small>'+(p.cost==null?'—':currency(p.cost))+'</span><span><small>Market value</small>'+(p.marketValue==null?'Not recorded':currency(p.marketValue))+'</span></div></article>').join('')||'<p class="muted">'+(importTracker.seen===null?'Sync to establish an initial inventory baseline.':'No new imports detected yet. New entries will appear after a subsequent sync on this device.')+'</p>';
}
function renderNumberAudit(){
 const box=$('pop-number-audit'),summary=$('pop-number-audit-summary');if(!box||!summary)return;
 const blanks=inventory.filter(p=>!String(p.number||'').trim());
 const byFranchise=new Map();for(const p of blanks){const name=p.franchise||'Other';if(!byFranchise.has(name))byFranchise.set(name,[]);byFranchise.get(name).push(p)}
 summary.textContent=blanks.length+' blank fields';
 box.innerHTML='<p class="muted">These entries have no Pop number in the imported data. Some products (such as Bitty Pops, Soda, and keychains) may not have a standard Pop number. This list does not invent numbers or modify the spreadsheet.</p>'+([...byFranchise].sort((a,b)=>b[1].length-a[1].length).map(([franchise,rows])=>'<details style="margin:10px 0"><summary>'+escape(franchise)+' ('+rows.length+')</summary><ul>'+rows.map(p=>'<li>'+escape(p.name)+' — '+escape(p.variant||'No variant')+'</li>').join('')+'</ul></details>').join('')||'<p>No blank Pop numbers detected.</p>');
}
function purchaseTimestamp(value){
 const raw=String(value||'').trim();if(!raw)return null;
 const iso=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]|$)/);
 const us=raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s|$)/);
 let y,m,d;
 if(iso){y=+iso[1];m=+iso[2];d=+iso[3]}
 else if(us){m=+us[1];d=+us[2];y=+us[3];if(y<100)y+=2000}
 else return null;
 const date=Date.UTC(y,m-1,d);
 return new Date(date).getUTCFullYear()===y&&new Date(date).getUTCMonth()===m-1&&new Date(date).getUTCDate()===d?date:null;
}
function renderRecentPurchases(){
 const target=$('recent-purchases-list');if(!target)return;
 const today=new Date();const todayUTC=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate());
 const selected=inventory.map((p,index)=>({p,index,time:purchaseTimestamp(p.date)})).filter(x=>(selectedFranchises.size===0||selectedFranchises.has(x.p.franchise))&&x.time!==null&&x.time<=todayUTC);
 selected.sort((a,b)=>b.time-a.time||b.index-a.index);
 const recent=selected.slice(0,5).map(x=>x.p);recentCardItems.purchases=recent;
 target.innerHTML=recent.map((p,i)=>'<article class="recent-pop" role="button" tabindex="0" data-recent-index="'+(typeof i==='number'?i:0)+'" aria-label="View details for '+escape(p.name)+'"><div class="recent-pop-image">'+(p.image?'<img loading="lazy" src="'+escape(p.image)+'" alt="" onerror="this.replaceWith(document.createTextNode(\'◈\'))">':'◈')+'</div><div class="recent-pop-info"><strong>'+escape(p.name)+'</strong><span>'+escape(p.franchise)+' · #'+escape(p.number||'—')+'</span><span>'+escape(p.variant||'Standard')+'</span><span>'+escape(p.platform||'Retailer not recorded')+' · '+escape(p.date)+'</span></div><div class="recent-pop-values"><span><small>All-in cost</small>'+(p.cost===null||p.cost===undefined?'—':currency(p.cost))+'</span><span><small>Market value</small>'+(p.marketValue===null||p.marketValue===undefined?'—':currency(p.marketValue))+'</span></div></article>').join('')||'<p class="muted">No purchases with recognizable dates for the selected franchises. Try Sync to load the latest spreadsheet.</p>';
}
function drawPops(){const q=$('pop-search').value.toLowerCase(),filter=$('pop-filter').value,franchise=$('pop-franchise').value;const counts=new Map();for(const p of inventory){const key=(p.franchise+'|'+p.name+'|'+p.number+'|'+p.variant).toLowerCase();counts.set(key,(counts.get(key)||0)+1)}const matched=inventory.filter(p=>{const key=(p.franchise+'|'+p.name+'|'+p.number+'|'+p.variant).toLowerCase();return (franchise==='all'||p.franchise===franchise)&&[p.name,p.number,p.variant,p.franchise].join(' ').toLowerCase().includes(q)&&(filter==='all'||filter==='duplicates'&&counts.get(key)>1||filter==='missing'&&p.marketValue===null||filter==='exclusive'&&/exclusive|limited|le [0-9]|fundays/i.test(p.variant)||filter==='sticker'&&/sticker|chase|convention|comic.con|exclusive/i.test(p.variant))});$('item-count').textContent=matched.length+' Pops';$('pop-results').innerHTML=matched.slice(0,120).map(p=>'<article class="pop-card" data-pop-id="'+escape(p.id)+'" tabindex="0" role="button" aria-label="View details for '+escape(p.name)+'"><div class="pop-image">'+(p.image?'<img loading="lazy" alt="" src="'+escape(p.image)+'" onerror="this.replaceWith(document.createTextNode(\'◈\'))">':'◈')+'</div><div class="pop-details"><strong>'+escape(p.name)+'</strong><small>'+escape(p.franchise)+' · #'+escape(p.number||'—')+'</small><small>'+escape(p.variant||'Standard')+'</small><small class="pop-retailer">Purchased from: '+escape(p.platform||'Not recorded')+'</small><div class="pop-money"><span>Cost: '+(p.cost===null?'—':currency(p.cost))+'</span><span>Value: '+(p.marketValue===null?'—':currency(p.marketValue))+'</span></div><a class="image-lookup" target="_blank" rel="noopener noreferrer" href="https://www.google.com/search?tbm=isch&q='+encodeURIComponent('Funko Pop '+p.name+' '+p.number+' '+p.variant)+'">Find photo ↗</a></div></article>').join('')||'<div class="muted">No matching Pops found.</div>';if(matched.length>120)$('item-count').textContent+=' (first 120 shown)'}
async function loadPops(){try{const res=await fetch('./data/pops.json?cache='+Date.now(),{cache:'no-store'});if(res.ok){const data=await res.json();inventory=Array.isArray(data.items)?applyLocalPopImages(data.items):[]}else{const chunks=await Promise.all([1,2,3].map(async n=>{const response=await fetch('./data/pops-'+n+'.json',{cache:'no-store'});if(!response.ok)throw Error('Inventory chunk '+n+' unavailable');return (await response.json()).items}));inventory=applyLocalPopImages(chunks.flat())}const names=[...new Set(inventory.map(p=>p.franchise))].sort();$('pop-franchise').innerHTML='<option value="all">Every franchise</option>'+names.map(n=>'<option value="'+escape(n)+'">'+escape(n)+'</option>').join('');drawPops();renderFeatures();renderRecentPurchases();renderRecentImports();renderNumberAudit();renderActualSales()}catch(e){$('pop-results').innerHTML='<div class="muted">Individual Pop data is not yet available. Franchise dashboard remains usable.</div>'}}
$('pop-clear').addEventListener('click',event=>{event.preventDefault();$('pop-search').value='';$('pop-franchise').value='all';$('pop-filter').value='all';drawPops();$('pop-clear').blur()});$('sync-now').addEventListener('click',syncNow);for(const id of ['pop-search','pop-filter','pop-franchise'])$(id).addEventListener(id==='pop-search'?'input':'change',drawPops);

let activeView='gallery',wishlist=[],galleryQuery='',retailerFilter='all',galleryPage=0,galleryRetailer='all',gallerySort='name',galleryMin='',galleryMax='';
const goalStore='popfolio-completion-goals-v1';let completionGoals={};try{completionGoals=JSON.parse(localStorage.getItem(goalStore)||'{}')||{}}catch(e){completionGoals={}}
const itemKey=p=>[p.franchise,p.name,p.number,p.variant].join('|').toLowerCase();
const val=x=>Number.isFinite(Number(x))&&x!==null&&x!==''?Number(x):null;
const fmt=x=>val(x)===null?'Not recorded':currency(Number(x));
const popPhoto=p=>p.image&&/^(https:\/\/|\.\/assets\/pop_images\/)/i.test(p.image)?'<img loading="lazy" src="'+escape(p.image)+'" alt="'+escape(p.name)+'" onerror="this.replaceWith(document.createTextNode(\'◈\'))">':'<span class="no-photo">◈</span>';
function openPop(id){const p=typeof id==='object'&&id?inventory.find(x=>x.id===id.id)||id:inventory.find(x=>String(x.id)===String(id));if(!p)return;const cost=val(p.cost),mv=val(p.marketValue),gain=cost!==null&&mv!==null?mv-cost:null,duplicates=inventory.filter(x=>itemKey(x)===itemKey(p)).length;const details=[['Franchise',p.franchise],['Pop number',p.number||'Not recorded'],['Edition / sticker',p.variant||'Standard'],['Purchased from',p.platform||'Not recorded'],['Purchase date',p.date||'Not recorded'],['Item price',fmt(p.itemPrice)],['All-in cost',fmt(cost)],['Market value',fmt(mv)],['Unrealized gain',gain===null?'Not available':signed(gain)],['ROI',gain===null||!cost?'Not available':(gain/cost*100).toFixed(1)+'%'],['Number owned',String(duplicates)]];const d=$('pop-dialog');$('pop-dialog-content').innerHTML='<div class="detail-layout"><div class="detail-image">'+popPhoto(p)+'</div><div><p class="eyebrow">COLLECTION DETAILS</p><h2>'+escape(p.name)+'</h2><div class="detail-grid">'+details.map(([k,v])=>'<div><span>'+escape(k)+'</span><strong>'+escape(v)+'</strong></div>').join('')+'</div><a class="image-lookup" target="_blank" rel="noopener noreferrer" href="https://www.google.com/search?tbm=isch&q='+encodeURIComponent('Funko Pop '+p.name+' '+p.number+' '+p.variant)+'">Find product photo ↗</a></div></div>';d.showModal()}
function renderFeatures(){const root=$('feature-content');if(!root)return;if(activeView==='gallery'){const q=galleryQuery.toLowerCase(),retailers=[...new Set(inventory.map(p=>p.platform||'Not recorded'))].sort();const filtered=inventory.filter(p=>[p.name,p.franchise,p.number,p.variant,p.platform].join(' ').toLowerCase().includes(q)&&(galleryRetailer==='all'||(p.platform||'Not recorded')===galleryRetailer)&&(galleryMin===''||Number(p.marketValue)>=Number(galleryMin))&&(galleryMax===''||Number(p.marketValue)<=Number(galleryMax)));filtered.sort((a,b)=>gallerySort==='value-desc'?(Number(b.marketValue)||0)-(Number(a.marketValue)||0):gallerySort==='value-asc'?(Number(a.marketValue)||0)-(Number(b.marketValue)||0):gallerySort==='date'?String(b.date||'').localeCompare(String(a.date||'')):a.name.localeCompare(b.name));root.innerHTML='<div class="feature-toolbar"><input id="gallery-search" aria-label="Search gallery" placeholder="Search figures, franchises, variants, retailers…" value="'+escape(galleryQuery)+'"><span>'+filtered.length+' figures</span></div><div class="gallery-filters"><select id="gallery-retailer" aria-label="Filter by retailer"><option value="all">All retailers</option>'+retailers.map(x=>'<option value="'+escape(x)+'" '+(galleryRetailer===x?'selected':'')+'>'+escape(x)+'</option>').join('')+'</select><select id="gallery-sort" aria-label="Sort gallery"><option value="name" '+(gallerySort==='name'?'selected':'')+'>Name A–Z</option><option value="value-desc" '+(gallerySort==='value-desc'?'selected':'')+'>Value: high to low</option><option value="value-asc" '+(gallerySort==='value-asc'?'selected':'')+'>Value: low to high</option><option value="date" '+(gallerySort==='date'?'selected':'')+'>Newest purchase</option></select><input id="gallery-min" type="number" min="0" placeholder="Min value $" value="'+escape(galleryMin)+'"><input id="gallery-max" type="number" min="0" placeholder="Max value $" value="'+escape(galleryMax)+'"></div><div class="gallery-grid">'+filtered.slice(galleryPage*60,(galleryPage+1)*60).map(p=>'<button class="gallery-card" type="button" data-pop-id="'+escape(p.id)+'"><div class="gallery-photo">'+popPhoto(p)+'</div><strong>'+escape(p.name)+'</strong><small>'+escape(p.franchise)+' · '+escape(p.platform||'Unknown retailer')+'</small><span>'+fmt(p.marketValue)+'</span></button>').join('')+'</div><div class="gallery-pager"><button type="button" data-page="-1" '+(galleryPage===0?'disabled':'')+'>Previous</button><span>Page '+(galleryPage+1)+' of '+Math.max(1,Math.ceil(filtered.length/60))+'</span><button type="button" data-page="1" '+((galleryPage+1)*60>=filtered.length?'disabled':'')+'>Next</button></div>'}else if(activeView==='insights'){const usable=inventory.filter(p=>val(p.cost)!==null&&val(p.marketValue)!==null),gains=usable.map(p=>({...p,delta:p.marketValue-p.cost})),best=[...gains].sort((a,b)=>b.delta-a.delta).slice(0,8),worst=[...gains].sort((a,b)=>a.delta-b.delta).slice(0,8),missing=inventory.filter(p=>val(p.marketValue)===null),copies=new Map();inventory.forEach(p=>copies.set(itemKey(p),(copies.get(itemKey(p))||0)+1));root.innerHTML='<div class="insight-kpis"><div><strong>'+missing.length+'</strong><span>Missing market values</span></div><div><strong>'+[...copies.values()].filter(n=>n>1).length+'</strong><span>Duplicate figure groups</span></div><div><strong>'+inventory.filter(p=>p.image).length+'/'+inventory.length+'</strong><span>Product images</span></div></div><div class="insight-columns"><div><h3>Biggest gains</h3>'+best.map(p=>'<button data-pop-id="'+escape(p.id)+'">'+escape(p.name)+' <strong class="positive">'+signed(p.delta)+'</strong></button>').join('')+'</div><div><h3>Largest losses</h3>'+worst.map(p=>'<button data-pop-id="'+escape(p.id)+'">'+escape(p.name)+' <strong class="negative">'+signed(p.delta)+'</strong></button>').join('')+'</div></div>'}else if(activeView==='retailers'){const grouped=new Map();inventory.forEach(p=>{const key=p.platform?.trim()||'Not recorded',v=grouped.get(key)||{count:0,cost:0,value:0,valued:0};v.count++;v.cost+=val(p.cost)||0;if(val(p.marketValue)!==null){v.value+=p.marketValue;v.valued++}grouped.set(key,v)});const entries=[...grouped].sort((a,b)=>b[1].count-a[1].count);root.innerHTML='<p class="muted">ROI is estimated using recorded values; missing valuations can distort results.</p><div class="tablewrap"><table><thead><tr><th>Retailer</th><th>Pops</th><th>All-in cost</th><th>Known value</th><th>Valued</th></tr></thead><tbody>'+entries.map(([name,x])=>'<tr><td>'+escape(name)+'</td><td>'+x.count+'</td><td>'+currency(x.cost)+'</td><td>'+currency(x.value)+'</td><td>'+x.valued+'/'+x.count+'</td></tr>').join('')+'</tbody></table></div>'}else{const id=p=>(p.name+'|'+p.number+'|'+(p.variant||'')).toLowerCase(),owned=new Set(inventory.map(id)),w=wishlist.map(p=>({...p,owned:[...inventory].some(x=>x.name.toLowerCase()===p.name.toLowerCase()&&String(x.number)===String(p.number))}));const byFranchise=new Map();inventory.forEach(p=>{const set=byFranchise.get(p.franchise)||new Set();set.add(id(p));byFranchise.set(p.franchise,set)});const goalRows=[...byFranchise].map(([name,set])=>{const count=set.size,goal=Number(completionGoals[name])||null;return {name,count,goal,percent:goal?Math.min(100,100*count/goal):null}}).sort((a,b)=>a.name.localeCompare(b.name));root.innerHTML='<p class="muted">Completion is based on unique figures/variants owned, not duplicate copies. Enter your target total for each franchise to track progress. Targets are stored on this device only and are not claims about the official release catalog.</p><div class="insight-kpis"><div><strong>'+w.length+'</strong><span>Wishlist entries</span></div><div><strong>'+w.filter(p=>p.owned).length+'</strong><span>Wishlist figures owned</span></div><div><strong>'+goalRows.filter(p=>p.goal).length+'/'+goalRows.length+'</strong><span>Franchises with targets</span></div></div><h3>Franchise completion goals</h3><div class="completion-list">'+goalRows.map(p=>'<div class="completion-row"><div class="completion-heading"><strong>'+escape(p.name)+'</strong><span>'+p.count+' unique owned'+(p.goal?' / '+p.goal+' target · '+p.percent.toFixed(1)+'%':' · Set a target')+'</span></div><div class="completion-track"><div style="width:'+(p.percent||0)+'%"></div></div><label>Target total <input type="number" min="1" step="1" class="completion-goal" data-franchise="'+escape(p.name)+'" value="'+(p.goal||'')+'" placeholder="Enter total"></label></div>').join('')+'</div><h3>Wishlist</h3><div class="wishlist-list">'+w.map(p=>'<div><strong>'+escape(p.name)+'</strong><span>#'+escape(p.number||'—')+' · '+fmt(p.marketValue)+'</span><span class="'+(p.owned?'positive':'')+'">'+(p.owned?'Owned':'On wishlist')+'</span></div>').join('')+'</div>'}}
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{activeView=b.dataset.view;document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));renderFeatures()}));
$('feature-content').addEventListener('click',e=>{const pop=e.target.closest('[data-pop-id]');if(pop){openPop(pop.dataset.popId);return}const page=e.target.closest('[data-page]');if(page){galleryPage+=Number(page.dataset.page);renderFeatures()}});
$('feature-content').addEventListener('change',e=>{if(e.target.classList.contains('completion-goal')){const n=Number(e.target.value),franchise=e.target.dataset.franchise;if(Number.isSafeInteger(n)&&n>0)completionGoals[franchise]=n;else delete completionGoals[franchise];try{localStorage.setItem(goalStore,JSON.stringify(completionGoals))}catch(err){}renderFeatures();return;}if(e.target.id==='gallery-retailer')galleryRetailer=e.target.value;else if(e.target.id==='gallery-sort')gallerySort=e.target.value;else if(e.target.id==='gallery-min')galleryMin=e.target.value;else if(e.target.id==='gallery-max')galleryMax=e.target.value;else return;galleryPage=0;renderFeatures()});
$('feature-content').addEventListener('input',e=>{if(e.target.id==='gallery-search'){galleryQuery=e.target.value;galleryPage=0;const pos=e.target.selectionStart;renderFeatures();const input=$('gallery-search');input.focus();input.setSelectionRange(pos,pos)}});
for(const [listId,kind] of [['recent-purchases-list','purchases'],['recent-imports-list','imports']]){
 const list=$(listId);if(!list)continue;
 const activate=card=>{const index=Number(card.dataset.recentIndex);const pop=recentCardItems[kind][index];if(pop)openPop(pop)};
 list.addEventListener('click',event=>{const card=event.target.closest('[data-recent-index]');if(card&&list.contains(card))activate(card)});
 list.addEventListener('keydown',event=>{
  if(event.key!=='Enter'&&event.key!==' ')return;
  const card=event.target.closest('[data-recent-index]');
  if(!card||!list.contains(card)||event.target!==card)return;
  event.preventDefault();activate(card);
 });
}
$('close-pop-dialog').addEventListener('click',()=>$('pop-dialog').close());
$('pop-results').addEventListener('click',e=>{const card=e.target.closest('[data-pop-id]');if(card&&!e.target.closest('a'))openPop(card.dataset.popId)});
async function loadWishlist(){try{const r=await fetch('./data/wishlist.json?cache='+Date.now(),{cache:'no-store'});if(r.ok){const d=await r.json();wishlist=d.items||[];if(activeView==='wishlist')renderFeatures()}}catch(e){console.warn('Wishlist unavailable',e)}}
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
loadWishlist();

init();loadPops().then(()=>syncNow()).catch(error=>console.warn('Automatic spreadsheet refresh unavailable; showing saved snapshot',error));
})();