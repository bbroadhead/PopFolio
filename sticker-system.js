(()=>{'use strict';
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const split=s=>String(s||'').split(/[,;|\n]+|\s+\/\s+/).map(x=>x.trim()).filter(Boolean);
let files=[],overrides={};
const ready=Promise.all([
 fetch('./assets/stickers/index.json?ts='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():[]).then(v=>{files=Array.isArray(v)?v.filter(x=>typeof x==='string'&&/\.(png|jpe?g|webp|svg)$/i.test(x)):[]}).catch(()=>{}),
 fetch('./assets/stickers/overrides.json?ts='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():{}).then(v=>{overrides=v&&typeof v==='object'?v:{}}).catch(()=>{})
]);
function key(p){return [p.franchise,p.number,p.name].map(norm).join('|')}
function get(p){
 const override=overrides[key(p)]??overrides[String(p.id||'')];
 const labels=Array.isArray(override)?override:override&&typeof override==='object'&&Array.isArray(override.stickers)?override.stickers:split(p.sticker);
 const list=[];
 for(const label of labels){
  const exact=files.find(f=>norm(f.replace(/\.[^.]+$/,''))===norm(label));
  if(exact&&!list.some(x=>x.file===exact))list.push({file:exact,label:String(label)});
 }
 return list;
}
function html(p,large=false){
 const items=get(p);if(!items.length)return '';
 return '<div class="sticker-strip'+(large?' sticker-strip-large':'')+'" aria-label="Stickers">'+items.map(x=>'<img loading="lazy" class="sticker-art" src="./assets/stickers/'+encodeURIComponent(x.file)+'" alt="'+String(x.label).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'" title="'+String(x.label).replace(/"/g,'&quot;')+'" onerror="this.hidden=true">').join('')+'</div>';
}
function gallery(){
 return '<section class="sticker-gallery"><h3>Sticker Gallery</h3><p class="muted">Sticker artwork is linked using the spreadsheet Sticker column. Upload transparent images with filenames matching the sticker labels.</p><div class="sticker-gallery-grid">'+files.map(f=>'<figure><img loading="lazy" src="./assets/stickers/'+encodeURIComponent(f)+'" alt="'+f.replace(/\.[^.]+$/,'')+'"><figcaption>'+f.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ')+'</figcaption></figure>').join('')+'</div></section>';
}
window.PopFolioStickers={ready,get,html,gallery,key};
})();