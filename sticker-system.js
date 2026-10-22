(()=>{'use strict';
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const split=s=>String(s||'').split(/[,;|\n]+|\s+\/\s+/).map(x=>x.trim()).filter(Boolean);
let files=[],overrides={};
const ready=Promise.all([
 fetch('./assets/stickers/index.json?ts='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():[]).then(v=>{files=Array.isArray(v)?v.filter(x=>typeof x==='string'&&/\.(png|jpe?g|webp|svg)$/i.test(x)):[]}).catch(()=>{}),
 fetch('./assets/stickers/overrides.json?ts='+Date.now(),{cache:'no-store'}).then(r=>r.ok?r.json():{}).then(v=>{overrides=v&&typeof v==='object'?v:{}}).catch(()=>{})
]);
function key(p){return [p.franchise,p.number,p.name].map(norm).join('|')}
const aliasRules=[
 [/\b(?:gitd|glows?\s+in\s+the\s+dark|glow\s+in\s+the\s+dark)\b/i,'Glow-In-The-Dark'],
 [/\bblack\s*light\b/i,'Black_Light_Sticker'],
 [/\bdiamond(?:\s+collection)?\b/i,'Diamond_Collection'],
 [/\bflocked\s+chase\b/i,'Flocked-Chase'],
 [/\bglow\s+in\s+the\s+dark\s+chase\b/i,'Glow_In_The_Dark_Chase'],
 [/\bflocked\b/i,'Flocked'],
 [/\bmetallic\b/i,'Metallic'],
 [/\bchase\b/i,'Chase'],
 [/\b(?:gamestop|game\s*stop)\b/i,'GameStop_Exclusive'],
 [/\b(?:hot\s*topic)\b/i,'Hot_Topic_Exclusive'],
 [/\b(?:box\s*lunch)\b/i,'Box_Lunch_Exclusive'],
 [/\b(?:amazon)\b/i,'Amazon_Exclusive'],
 [/\b(?:target)\b/i,'Target-Exclusive'],
 [/\b(?:walmart|wal\s*mart)\b/i,'Walmart-Exclusive'],
 [/\b(?:best\s*buy)\b/i,'Best-Buy-Exclusive'],
 [/\b(?:fye|f\.y\.e\.)\b/i,'F.Y.E._Exclusive'],
 [/\b(?:entertainment\s*earth)\b/i,'Entertainment_Earth_Exclusive'],
 [/\b(?:barnes\s*(?:and|&)\s*noble)\b/i,'Barnes_and_Noble_Exclusive'],
 [/\b(?:books\s*a\s*million|\bbam\b)\b/i,'BAM_Books-a-Million_Exclusive'],
 [/\b(?:funko\s*(?:shop|web)|funko\s+exclusive)\b/i,'Funko_Shop_Exclusive'],
 [/\b(?:px|previews)\b/i,'PX_Previews_Exclusive'],
 [/\b(?:walgreens)\b/i,'Walgreens_Exclusive'],
 [/\b(?:7\s*eleven)\b/i,'7-Eleven_Exclusive'],
 [/\b(?:loot\s*crate)\b/i,'Loot_Crate_Exclusive'],
 [/\b(?:fugitive\s*toys)\b/i,'Fugitive_Toys_Exclusive'],
 [/\b(?:marvel\s*collector\s*corps|mcc)\b/i,'Marvel_Collector_Corps_Exclusive'],
 [/\b(?:special\s+edition)\b/i,'Special_edition_sticker'],
 [/\b(?:pop!?\s*tees|pop\s+and\s+tee)\b/i,'POP_Tees']
];
function available(base){
 const matches=files.filter(f=>norm(f.replace(/\.[^.]+$/,''))===norm(base.replace(/\.[^.]+$/,'')));
 return matches.find(f=>/\.webp$/i.test(f))||matches[0]||null;
}
function get(p){
 const override=overrides[key(p)]??overrides[String(p.id||'')];
 const manual=override!==undefined;
 const labels=Array.isArray(override)?override:override&&typeof override==='object'&&Array.isArray(override.stickers)?override.stickers:null;
 const source=manual?(labels||[]):split(p.variant);
 const list=[],seen=new Set();
 function add(base,label){
  const file=available(base);if(!file||seen.has(file))return;
  seen.add(file);list.push({file,label});
 }
 // The spreadsheet Variant/Exclusive column determines sticker selection.
 // Sticker artwork is loaded exclusively from assets/stickers in the repository.
 const raw=source.join(' ; ');
 for(const label of manual?source:source){
  const direct=available(label);if(direct)add(direct,label);
 }
 const lower=raw.toLowerCase();
 const exclusiveHint=manual||/exclusive|shared\s+sticker|\bsticker\b/i.test(raw);
 const retailerBases=new Set(['GameStop_Exclusive','Hot_Topic_Exclusive','Box_Lunch_Exclusive','Amazon_Exclusive','Target-Exclusive','Walmart-Exclusive','Best-Buy-Exclusive','F.Y.E._Exclusive','Entertainment_Earth_Exclusive','Barnes_and_Noble_Exclusive','BAM_Books-a-Million_Exclusive','Funko_Shop_Exclusive','PX_Previews_Exclusive','Walgreens_Exclusive','7-Eleven_Exclusive','Loot_Crate_Exclusive','Fugitive_Toys_Exclusive','Marvel_Collector_Corps_Exclusive']);
 for(const [re,base] of aliasRules)if(re.test(lower)&&(!retailerBases.has(base)||exclusiveHint))add(base,base.replace(/[_-]/g,' '));
 // Combined stickers take precedence over their generic counterparts.
 if(/flocked\s+chase/i.test(raw))return list.filter(x=>!['Flocked','Chase'].includes(x.file.replace(/\.[^.]+$/,'')));
 if(/(?:glow\s+in\s+the\s+dark|gitd)\s+chase/i.test(raw))return list.filter(x=>!['Chase','Glow-In-The-Dark'].includes(x.file.replace(/\.[^.]+$/,'')));
 // Convention variants require an explicit year and identifiable event.
 const year=raw.match(/\b(20(?:1[1-9]|2[0-9]))\b/)?.[1];
 if(year){
  const summer=/\b(?:summer\s+convention|sdcc|san\s+diego)\b/i.test(raw);
  const fall=/\b(?:fall\s+convention|nycc|new\s+york)\b/i.test(raw);
  const spring=/\b(?:spring\s+convention|eccc|emerald\s+city)\b/i.test(raw);
  if(summer)add('Summer_Convention_'+year,'Summer Convention '+year);
  if(fall)add('Fall_Convention_'+year,'Fall Convention '+year);
  if(spring)add('Spring_Convention_'+year,'Spring Convention '+year);
  if(/\bsdcc\b|san\s+diego/i.test(raw))add('SDCC-'+year,'SDCC '+year);
  if(/\bnycc\b|new\s+york/i.test(raw))add('NYCC-'+year,'NYCC '+year);
 }
 return list;
}
function html(p,large=false){
 const items=get(p);if(!items.length)return '';
 return '<div class="sticker-strip'+(large?' sticker-strip-large':'')+'" aria-label="Stickers">'+items.map(x=>'<img loading="lazy" class="sticker-art" src="./assets/stickers/'+encodeURIComponent(x.file)+'" alt="'+String(x.label).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'" title="'+String(x.label).replace(/"/g,'&quot;')+'" onerror="this.hidden=true">').join('')+'</div>';
}
function gallery(){
 return '<section class="sticker-gallery"><h3>Sticker Gallery</h3><p class="muted">Sticker artwork is matched using the spreadsheet Variant/Exclusive column. Upload transparent images with filenames matching the sticker labels.</p><div class="sticker-gallery-grid">'+files.map(f=>'<figure><img loading="lazy" src="./assets/stickers/'+encodeURIComponent(f)+'" alt="'+f.replace(/\.[^.]+$/,'')+'"><figcaption>'+f.replace(/\.[^.]+$/,'').replace(/[-_]/g,' ')+'</figcaption></figure>').join('')+'</div></section>';
}
window.PopFolioStickers={ready,get,html,gallery,key};
})();