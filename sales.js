(()=>{'use strict';
const $=id=>document.getElementById(id);
const fmt=n=>n==null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let all=[],query='',sort='recent';
const hasValue=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const n=v=>hasValue(v)?Number(v):null;
function records(){return all.filter(p=>hasValue(p.sold)).map(p=>{const cost=n(p.cost),sale=n(p.sold),profit=n(p.netProfit);return {...p,cost,sale,profit,profitPct:profit!=null&&cost>0?100*profit/cost:null,market:n(p.marketValue)}})}

let estimateIds=[],estimateQuery='',estimatePrice=250,estimateShipping=15,estimateTax=7,estimateAds=0,estimateFee=13.6,estimateFixed=.40,estimatePlatform='ebay',estimateBuyerShipping=0;
const estimatePlatforms={ebay:{label:'eBay',rate:13.6,fixed:.40,shipping:15,note:'Typical US non-Store category estimate; actual category and Store rates may differ.'},mercari:{label:'Mercari',rate:10,fixed:0,shipping:0,note:'10% seller fee on item price plus buyer-paid shipping. Buyer-paid prepaid shipping is the default.'},depop:{label:'Depop',rate:3.3,fixed:.45,shipping:0,note:'US payment processing of 3.3% + $0.45; no standard selling commission. Buyer-paid shipping is the default.'},vinted:{label:'Vinted',rate:0,fixed:0,shipping:0,note:'No standard seller commission; buyer normally pays shipping and Vinted buyer protection fees.'}};
function estimateSelectPlatform(key){estimatePlatform=key;const p=estimatePlatforms[key];estimateFee=p.rate;estimateFixed=p.fixed;estimateShipping=p.shipping;estimateBuyerShipping=0;estimateAds=0;}
function estimateMount(){
 const root=$('sales-content');if(!root)return;
 const panel=document.createElement('details');panel.className='sales-panel';panel.id='sales-estimator';panel.innerHTML='<summary style="cursor:pointer;font-weight:700;font-size:1.15rem;padding:4px 0">Marketplace Sales Estimator <span class="muted" style="font-size:.85rem;font-weight:400">— expand to calculate potential profit</span></summary><div id="sales-estimator-body"></div>';
 root.insertBefore(panel,root.firstChild);
 function redraw(){
  const chosen=estimateIds.map(id=>all.find(p=>String(p.id)===id)).filter(Boolean);
  const costKnown=chosen.every(p=>n(p.cost)!==null),cost=chosen.reduce((sum,p)=>sum+(n(p.cost)||0),0);
  const feeBase=estimatePrice+estimateBuyerShipping;const fee=(estimatePlatform==='mercari'?feeBase:estimatePlatform==='vinted'?0:feeBase*(1+estimateTax/100))*estimateFee/100+estimateFixed+estimatePrice*estimateAds/100;
  const net=estimatePrice+estimateBuyerShipping-fee-estimateShipping-(costKnown?cost:0);
  const hits=estimateQuery.trim()?all.filter(p=>!estimateIds.includes(String(p.id))&&[p.name,p.number,p.variant,p.franchise].join(' ').toLowerCase().includes(estimateQuery.toLowerCase())).slice(0,18):[];
  const body=panel.querySelector('#sales-estimator-body');
  body.innerHTML='<h2>Marketplace Sales Estimator</h2><p class="muted">Select one or more Pops from your collection to estimate proceeds, fees and net profit. This calculator does not mark anything sold or edit Google Sheets.</p>'+
   '<label for="estimate-platform">Selling platform</label><div class="sales-controls"><select id="estimate-platform" aria-label="Selling platform">'+Object.entries(estimatePlatforms).map(([key,p])=>'<option value="'+key+'" '+(key===estimatePlatform?'selected':'')+'>'+p.label+'</option>').join('')+'</select></div><p class="muted">'+esc(estimatePlatforms[estimatePlatform].note)+'</p><label for="estimate-search">Find Pops by name, number, variant or franchise</label><div class="sales-controls"><input id="estimate-search" type="search" autocomplete="off" placeholder="Search collection…" value="'+esc(estimateQuery)+'"><button type="button" id="estimate-clear">Clear selection</button></div>'+
   '<div id="estimate-hits" style="max-height:250px;overflow:auto">'+hits.map(p=>'<button type="button" data-estimate-add="'+esc(p.id)+'" style="display:block;width:100%;text-align:left;margin:4px 0;padding:10px;border-radius:8px">'+esc(p.name)+' #'+esc(p.number||'—')+' · '+esc(p.franchise)+' · '+esc(p.variant||'Standard')+' · Cost '+fmt(n(p.cost))+'</button>').join('')+'</div>'+
   '<h3>Selected Pops ('+chosen.length+')</h3><div>'+ (chosen.length?chosen.map(p=>'<div style="display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--border,#354052)"><span>'+esc(p.name)+' #'+esc(p.number||'—')+' <small>'+esc(p.variant||'')+'</small></span><span>'+fmt(n(p.cost))+' <button type="button" data-estimate-remove="'+esc(p.id)+'" aria-label="Remove '+esc(p.name)+'">✕</button></span></div>').join(''):'<p class="muted">Search and select Pops to begin.</p>')+'</div>'+
   '<div class="estimate-slider-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin:18px 0">'+
   [['estimate-price','Sale price ($)',estimatePrice,0,1000,5,'money'],['estimate-shipping','Seller-paid shipping ($)',estimateShipping,0,60,1,'money'],['estimate-buyer-shipping','Buyer-paid shipping ($)',estimateBuyerShipping,0,60,1,'money'],['estimate-tax','Buyer sales tax (%)',estimateTax,0,12,.5,'percent'],['estimate-ads','Promoted listing (%)',estimateAds,0,20,.5,'percent'],['estimate-fee','Platform percentage fee (%)',estimateFee,0,25,.1,'percent'],['estimate-fixed','Per-order fee ($)',estimateFixed,0,5,.05,'money']].map(([id,label,value,min,max,step,format])=>'<label style="display:grid;gap:8px;padding:12px;border:1px solid var(--border,#354052);border-radius:12px"><span style="display:flex;justify-content:space-between;gap:8px"><span>'+label+'</span><strong id="'+id+'-value">'+(format==='money'?fmt(value):Number(value).toFixed(1)+'%')+'</strong></span><input id="'+id+'" type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+value+'" aria-label="'+label+'" style="width:100%;accent-color:#8b83ff"><span class="muted" style="display:flex;justify-content:space-between;font-size:.75rem"><span>'+(format==='money'?fmt(min):min+'%')+'</span><span>'+(format==='money'?fmt(max):max+'%')+'</span></span></label>').join('')+'</div>'+
   '<div class="sales-kpis"><article><small>Original all-in cost</small><strong>'+ (costKnown?fmt(cost):'Incomplete')+'</strong></article><article><small>Estimated platform fees</small><strong>'+fmt(fee)+'</strong></article><article><small>Estimated shipping</small><strong>'+fmt(estimateShipping)+'</strong></article><article><small>Estimated net profit</small><strong class="'+(net<0?'sales-negative':'sales-positive')+'">'+(chosen.length&&costKnown?fmt(net):'—')+'</strong></article><article><small>Estimated ROI</small><strong>'+(chosen.length&&costKnown&&cost>0?(100*net/cost).toFixed(1)+'%':'—')+'</strong></article></div>'+
   '<p class="muted">Seller-paid shipping is deducted; buyer-paid shipping is added to revenue and included in applicable fee bases. For buyer-paid prepaid labels, set seller-paid shipping to $0. Tax affects eBay and Depop percentage fees, not Mercari or Vinted. Ad fees are optional estimates. Actual labels, category rates, packaging and promotional fees may differ. Estimates only.</p>';
  $('estimate-platform').addEventListener('change',e=>{estimateSelectPlatform(e.target.value);redraw()});
  const search=$('estimate-search');search.addEventListener('input',e=>{estimateQuery=e.target.value;const pos=e.target.selectionStart;redraw();const input=$('estimate-search');input.focus();input.setSelectionRange(pos,pos)});
  panel.querySelectorAll('[data-estimate-add]').forEach(b=>b.addEventListener('click',()=>{estimateIds.push(b.dataset.estimateAdd);estimateQuery='';redraw()}));
  panel.querySelectorAll('[data-estimate-remove]').forEach(b=>b.addEventListener('click',()=>{estimateIds=estimateIds.filter(id=>id!==b.dataset.estimateRemove);redraw()}));
  $('estimate-clear').addEventListener('click',()=>{estimateIds=[];estimateQuery='';redraw()});
  [['estimate-price',v=>estimatePrice=v],['estimate-shipping',v=>estimateShipping=v],['estimate-buyer-shipping',v=>estimateBuyerShipping=v],['estimate-tax',v=>estimateTax=v],['estimate-ads',v=>estimateAds=v],['estimate-fee',v=>estimateFee=v],['estimate-fixed',v=>estimateFixed=v]].forEach(([id,set])=>$(id).addEventListener('input',e=>{set(Math.max(0,Number(e.target.value)||0));const selected=estimateIds.map(id=>all.find(p=>String(p.id)===id)).filter(Boolean),known=selected.every(p=>n(p.cost)!==null),cost=selected.reduce((sum,p)=>sum+(n(p.cost)||0),0),base=estimatePrice+estimateBuyerShipping,fee=(estimatePlatform==='mercari'?base:estimatePlatform==='vinted'?0:base*(1+estimateTax/100))*estimateFee/100+estimateFixed+estimatePrice*estimateAds/100,profit=base-fee-estimateShipping-cost;$(id+'-value').textContent=id==='estimate-tax'||id==='estimate-ads'||id==='estimate-fee'?Number(e.target.value).toFixed(1)+'%':fmt(Number(e.target.value));const k=panel.querySelectorAll('.sales-kpis article strong');if(k.length===5){k[1].textContent=fmt(fee);k[2].textContent=fmt(estimateShipping);k[3].textContent=selected.length&&known?fmt(profit):'—';k[3].className=profit<0?'sales-negative':'sales-positive';k[4].textContent=selected.length&&known&&cost>0?(100*profit/cost).toFixed(1)+'%':'—'}}));
 }
 redraw();
}

function render(){
 const list=records(),costs=list.reduce((s,p)=>s+(p.cost||0),0),sales=list.reduce((s,p)=>s+p.sale,0);
 const withProfit=list.filter(p=>p.profit!==null),profit=withProfit.reduce((s,p)=>s+p.profit,0);
 const profitCosts=withProfit.reduce((s,p)=>s+(p.cost||0),0);
 const missing=list.length-withProfit.length;
 const groups=new Map();
 for(const p of list){const g=groups.get(p.franchise)||{name:p.franchise,count:0,sales:0,profit:0,known:0};g.count++;g.sales+=p.sale;if(p.profit!==null){g.profit+=p.profit;g.known++}groups.set(p.franchise,g)}
 const ranked=[...groups.values()].sort((a,b)=>b.sales-a.sales).slice(0,8),max=Math.max(1,...ranked.map(x=>x.sales));
 const filtered=list.filter(p=>(p.name+' '+p.franchise+' '+p.number+' '+p.variant).toLowerCase().includes(query.toLowerCase()));
 filtered.sort((a,b)=>sort==='profit'?(b.profit??-Infinity)-(a.profit??-Infinity):sort==='sale'?b.sale-a.sale:sort==='name'?a.name.localeCompare(b.name):sort==='roi'?(b.profitPct??-Infinity)-(a.profitPct??-Infinity):String(b.date||'').localeCompare(String(a.date||'')));
 $('sales-content').innerHTML=`
 <div class="sales-kpis">
 <article><small>Items sold</small><strong>${list.length}</strong><span>Recorded sales</span></article>
 <article><small>Sale proceeds</small><strong>${fmt(sales)}</strong><span>Sold-for amounts</span></article>
 <article><small>All-in purchase cost</small><strong>${fmt(costs)}</strong><span>Cost of sold items</span></article>
 <article><small>Recorded net profit</small><strong class="${profit<0?'sales-negative':'sales-positive'}">${withProfit.length?fmt(profit):'—'}</strong><span>${missing?missing+' sale(s) missing net profit':'All sold items accounted for'}</span></article>
 <article><small>Net ROI</small><strong>${profitCosts>0?(100*profit/profitCosts).toFixed(1)+'%':'—'}</strong><span>Profit ÷ cost for ${withProfit.length} item(s) with recorded profit</span></article>
 </div>
 <div class="sales-charts">
 <article class="sales-panel"><h2>Sales vs. purchase cost</h2><p class="muted">Total proceeds and original all-in costs</p><div class="sales-barline"><span>Sales</span><div><i style="width:${100*sales/Math.max(1,sales,costs)}%"></i></div><strong>${fmt(sales)}</strong></div><div class="sales-barline sales-cost"><span>Cost</span><div><i style="width:${100*costs/Math.max(1,sales,costs)}%"></i></div><strong>${fmt(costs)}</strong></div></article>
 <article class="sales-panel"><h2>Sales by franchise</h2>${ranked.length?ranked.map(g=>`<div class="sales-barline"><span title="${esc(g.name)}">${esc(g.name)}</span><div><i style="width:${100*g.sales/max}%"></i></div><strong>${fmt(g.sales)}</strong></div>`).join(''):'<p class="muted">Franchise chart appears after your first sale.</p>'}</article>
 </div>
 <section class="sales-panel"><div class="sales-list-heading"><div><h2>Sold Pops</h2><p class="muted">Only items with a Sold for amount in the spreadsheet · ${filtered.length} shown</p></div></div>
 <div class="sales-controls"><input id="sales-search" aria-label="Search sold Pops" placeholder="Search sold Pops…" value="${esc(query)}"><select id="sales-sort" aria-label="Sort sold Pops"><option value="recent" ${sort==='recent'?'selected':''}>Purchase date</option><option value="profit" ${sort==='profit'?'selected':''}>Net profit</option><option value="roi" ${sort==='roi'?'selected':''}>Net ROI</option><option value="sale" ${sort==='sale'?'selected':''}>Sale price</option><option value="name" ${sort==='name'?'selected':''}>Name A–Z</option></select></div>
 <div class="sales-items">${filtered.length?filtered.map(p=>`<article class="sales-item"><div class="sales-item-title"><strong>${esc(p.name)} <span>${p.number?'#'+esc(p.number):''}</span></strong><small>${esc(p.franchise)} · ${esc(p.variant||'Standard')}</small></div><div class="sales-item-values"><div><small>All-in cost</small><strong>${fmt(p.cost)}</strong></div><div><small>Market value</small><strong>${fmt(p.market)}</strong></div><div><small>Sale price</small><strong>${fmt(p.sale)}</strong></div><div><small>Net profit</small><strong class="${p.profit<0?'sales-negative':'sales-positive'}">${fmt(p.profit)}</strong></div><div class="sales-roi"><small>Net profit %</small><strong class="${p.profitPct<0?'sales-negative':'sales-positive'}">${p.profitPct==null?'—':(p.profitPct>0?'+':'')+p.profitPct.toFixed(1)+'%'}</strong></div></div></article>`).join(''):'<p class="muted">No sold items match this search.</p>'}</div>
 <p class="sales-disclaimer muted">Net profit comes directly from the spreadsheet’s Net Profit column. Percentage is net profit divided by all-in purchase cost. Missing profit values are shown as —, not estimated. Sale price is the Sold for amount.</p></section>`;
 estimateMount();
 const input=$('sales-search');input.addEventListener('input',e=>{const pos=e.target.selectionStart;query=e.target.value;render();const el=$('sales-search');el.focus();el.setSelectionRange(pos,pos)});
 $('sales-sort').addEventListener('change',e=>{sort=e.target.value;render()});
}
async function load(){
 try{const res=await fetch('./data/pops.json?sales='+Date.now(),{cache:'no-store'});if(!res.ok)throw Error('HTTP '+res.status);const data=await res.json();all=Array.isArray(data.items)?data.items:[];render()}
 catch(e){$('sales-content').innerHTML='<p class="muted">Sales data could not be loaded: '+esc(e.message)+'</p>'}
}
document.querySelectorAll('[data-primary-tab]').forEach(button=>button.addEventListener('click',()=>{
 const sales=button.dataset.primaryTab==='sales';
 $('collection-view').hidden=sales;$('sales-view').hidden=!sales;
 document.querySelectorAll('[data-primary-tab]').forEach(b=>{const active=b===button;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});
 if(sales)load();window.scrollTo({top:0,behavior:'instant'});
}));
window.addEventListener('popfolio-data-updated',event=>{all=event.detail.items||[];render()});
window.addEventListener('pageshow',()=>{if(!$('sales-view').hidden&&all.length===0)load()});
load();
})();