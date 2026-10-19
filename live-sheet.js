(()=>{'use strict';
const sheet='1Bltl_J8zQUjkhhvS-nWtfh4KzrTIMoVBt_umQlMab8I';
const tabs=["Back to the Future","Cyberpunk 2077","DC Comics","Dexter","Diablo","Disney","Dungeons & Dragons","Elf","Elder Scrolls, The","Funko","God of War","Good Place, The","Game of Thrones","Halloween","Harry Potter","Horror: Miscellaneous","House of the Dragon","Hunger Games, The","IT (1990)","IT: Chapter One","IT: Chapter Two","IT: Welcome to Derry","Jurassic Park","Knight of the Seven Kingdoms, A","Lord of the Rings, The","Mandalorian, The","Marvel","Miscellaneous","Monty Python and the Holy Grail","Myths","Outlander","Overwatch","Parks and Recreation","Pokémon","Sonic the Hedgehog","Squid Game","Star Wars","Stranger Things","Vampire Diaries, The","World of Warcraft","Willy Wonka","Witcher 3: Wild Hunt, The","Witcher (Netflix), The","USAF"];
const sheetGids={"Dashboard":1695208779,"Back to the Future":485102494,"Cyberpunk 2077":1310617453,"DC Comics":374605221,"Dexter":1366434587,"Diablo":1895486023,"Disney":66439918,"Dungeons & Dragons":355456082,"Elf":1067680104,"Elder Scrolls, The":1505055688,"Funko":1596280228,"God of War":590242127,"Good Place, The":386460720,"Game of Thrones":1811328803,"Halloween":1300422317,"Harry Potter":1233166844,"Horror: Miscellaneous":141200484,"House of the Dragon":96563991,"Hunger Games, The":1034673412,"IT (1990)":764862115,"IT: Chapter One":965171171,"IT: Chapter Two":1578071777,"IT: Welcome to Derry":1178628852,"Jurassic Park":834033639,"Knight of the Seven Kingdoms, A":1927960626,"Lord of the Rings, The":1578406865,"Mandalorian, The":1434325190,"Marvel":1009144772,"Miscellaneous":199858629,"Monty Python and the Holy Grail":438781456,"Myths":1458966824,"Outlander":158962482,"Overwatch":22791012,"Parks and Recreation":1914975756,"Pokémon":1472037690,"Sonic the Hedgehog":437857923,"Squid Game":1211192767,"Stranger Things":650226239,"Vampire Diaries, The":1252891,"World of Warcraft":1255529491,"Willy Wonka":96375151,"Witcher 3: Wild Hunt, The":182968141,"Witcher (Netflix), The":1008229555,"USAF":2078579711,"Wishlist":1680017429,"Star Wars":1770653340};
function csv(s){let rows=[],row=[],cell='',q=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(q&&s[i+1]==='"'){cell+='"';i++}else q=!q}else if(c===','&&!q){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&s[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}return rows}
function num(x){const t=String(x??'').trim().replace(/[$,%]/g,'').replace(/,/g,'');if(!t)return null;const v=Number(t.replace(/^\((.*)\)$/,'-$1'));return Number.isFinite(v)?v:null}
async function read(tab){
 const base='https://docs.google.com/spreadsheets/d/'+sheet+'/';
 const exportUrl=base+'export?format=csv&gid='+sheetGids[tab]+'&t='+Date.now();
 const gvizUrl=base+'gviz/tq?tqx=out:csv&sheet='+encodeURIComponent(tab)+'&t='+Date.now();
 // The Dashboard is a summary with non-table rows. Its previous gviz
 // endpoint works; the raw CSV export is preferred for collectible tabs.
 const urls=tab==='Dashboard'?[gvizUrl,exportUrl]:[exportUrl,gvizUrl];
 let error;
 for(const url of urls){
  try{
   const response=await fetch(url,{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const body=await response.text();
   if(/^\s*<!doctype html|^\s*<html/i.test(body))throw Error('HTML returned instead of CSV');
   const rows=csv(body);
   if(!rows.length)throw Error('Empty CSV');
   if(tab==='Dashboard'){
    if(!rows.some(r=>String(r[0]||'').replace(/^\ufeff/,'').trim().toUpperCase()==='FRANCHISE'))throw Error('Dashboard summary header missing');
   }else if(tab==='Wishlist'){
    if(!rows.some(r=>r.some(x=>String(x||'').trim())))throw Error('Wishlist CSV empty');
   }else if(!rows[0].some(x=>String(x||'').replace(/^\ufeff/,'').trim().toLowerCase()==='name')){
    throw Error('Collection Name header missing');
   }
   return rows;
  }catch(e){error=e;console.warn('Spreadsheet endpoint failed',tab,e)}
 }
 throw Error(tab+': '+(error?.message||'CSV unavailable'));
}
function items(tab,rows){
 const h=rows[0].map(x=>String(x||'').toLowerCase().trim().replace(/^\ufeff/,''));
 const idx=(name,fallback)=>{const i=h.indexOf(name.toLowerCase());return i<0?fallback:i};
 const c={name:idx('Name',2),number:idx('Pop #',3),variant:idx('Variant / Exclusive',4),platform:idx('Purchased From',6),date:idx('Purchase Date',7),item:idx('Item Price',9),cost:idx('All-in Price',10),market:idx('Current Market Value',11),sold:idx('Sold for',17),profit:idx('Net Profit',18),saleId:idx('Sales ID',22)};
 const val=(r,k)=>String(r[c[k]]??'').trim();
 return rows.slice(1).flatMap((r,i)=>{const name=val(r,'name');if(!name||/^total\b/i.test(name))return [];
 return [{id:tab+':'+(i+2),franchise:tab,name,number:val(r,'number'),variant:val(r,'variant'),platform:val(r,'platform'),date:val(r,'date'),itemPrice:num(val(r,'item')),cost:num(val(r,'cost')),marketValue:num(val(r,'market')),sold:num(val(r,'sold')),netProfit:num(val(r,'profit')),saleId:val(r,'saleId'),image:null}]});
}
function repairKnownNumbers(list){
 const known=[
  ['Horror: Miscellaneous','Danny Torrance','458'],
  ['Back to the Future','Marty with Hoverboard','964'],
  ['Stranger Things','Campaign Eddie','1477'],
  ['Stranger Things','Steve Harrington','1542'],
  ['Stranger Things','Byers House: Will','1187']
 ];
 for(const p of list){
  if(p.number)continue;
  const match=known.find(([franchise,name])=>p.franchise===franchise&&p.name.toLowerCase()===name.toLowerCase());
  if(match)p.number=match[2];
 }
}
function portfolio(rows){const start=rows.findIndex(r=>String(r[0]||'').trim().toUpperCase()==='FRANCHISE');if(start<0)throw Error('Dashboard header missing');const groups=[];for(const r of rows.slice(start+1)){const name=String(r[0]||'').trim();if(name.toUpperCase()==='TOTAL')break;if(!name||r.length<6)continue;groups.push({name,count:num(r[1])||0,itemCost:num(r[2])||0,cost:num(r[3])||0,value:num(r[4])||0,gain:num(r[5])||0,sold:num(r[6])||0})}if(groups.length<10)throw Error('Dashboard summary incomplete');return {groups,updatedAt:new Date().toISOString()}}
function fillNumbers(list){const known=new Map();for(const p of list){if(!p.number)continue;const k=[p.franchise,p.name,p.variant].join('|').toLowerCase();if(!known.has(k))known.set(k,new Set());known.get(k).add(p.number)}for(const p of list){if(p.number)continue;const nums=known.get([p.franchise,p.name,p.variant].join('|').toLowerCase());if(nums?.size===1)p.number=[...nums][0]}}
async function fetchAll(progress=()=>{}){const all=['Dashboard','Wishlist',...tabs],result=new Map(),errors=[];let next=0,done=0;await Promise.all(Array.from({length:4},async()=>{while(next<all.length){const tab=all[next++];try{result.set(tab,await read(tab))}catch(e){errors.push(tab+': '+e.message)}progress(++done,all.length)}}));if(errors.length)throw Error('Unable to fetch '+errors.length+' tab(s): '+errors.slice(0,3).join('; '));const list=tabs.flatMap(tab=>items(tab,result.get(tab)));if(list.length<100)throw Error('Collection incomplete');fillNumbers(list);repairKnownNumbers(list);const wish=result.get('Wishlist').slice(1).filter(r=>r[2]&&!/^total$/i.test(r[2])).map(r=>({name:r[2],number:r[3]||'',marketValue:num(r[4])}));const summary=portfolio(result.get('Dashboard'));const existing=new Set(summary.groups.map(g=>g.name));for(const tab of tabs){if(existing.has(tab))continue;const own=list.filter(p=>p.franchise===tab);if(!own.length)continue;const cost=own.reduce((sum,p)=>sum+(p.cost||0),0),value=own.reduce((sum,p)=>sum+(p.marketValue||0),0);summary.groups.push({name:tab,count:own.length,itemCost:own.reduce((sum,p)=>sum+(p.itemPrice||0),0),cost,value,gain:value-cost,sold:own.reduce((sum,p)=>sum+(p.sold||0),0)})}return {portfolio:summary,items:list,wishlist:wish}}
window.PopFolioLive={fetchAll};
})();