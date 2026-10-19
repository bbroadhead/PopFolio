(()=>{'use strict';
const root=document.getElementById('scanner-view'),status=document.getElementById('scan-status'),video=document.getElementById('scan-video'),result=document.getElementById('scan-result');
if(!root)return;
let stream=null,detector=null,loop=0,last='';
const clean=s=>String(s||'').replace(/[^0-9]/g,'');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function stop(){cancelAnimationFrame(loop);if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;document.getElementById('scan-start').disabled=false;document.getElementById('scan-stop').disabled=true}
async function identify(value){const code=clean(value);if(!/^\d{8,14}$/.test(code)){status.textContent='Enter a valid 8–14 digit barcode.';return}if(code===last)return;last=code;stop();status.textContent='Barcode '+code+' captured. Checking collection…';
let items=[];try{const response=await fetch('./data/pops.json',{cache:'no-store'});if(response.ok)items=(await response.json()).items||[]}catch{}
const matched=items.filter(p=>[p.upc,p.barcode,p.ean,p.gtin].some(x=>clean(x)===code));
result.hidden=false;
result.innerHTML='<strong>UPC / EAN: '+esc(code)+'</strong>'+(matched.length?'<p>Possible collection matches:</p>'+matched.map(p=>'<p>'+esc(p.franchise)+' — '+esc(p.name)+' #'+esc(p.number)+' ('+esc(p.variant||'Standard')+')</p>').join(''):'<p>No barcode match in the published collection data. Many spreadsheet records do not include UPCs; this does not mean you do not own it.</p>')+'<p>Confirm the exact sticker and variant before saving an image.</p><a target="_blank" rel="noopener noreferrer" href="https://www.google.com/search?tbm=isch&q='+encodeURIComponent('Funko Pop UPC '+code)+'">Find product images ↗</a>';
}
async function tick(){if(!stream||!detector)return;try{const codes=await detector.detect(video);if(codes.length){await identify(codes[0].rawValue);return}}catch{}loop=requestAnimationFrame(tick)}
document.getElementById('scan-start').addEventListener('click',async()=>{last='';result.hidden=true;if(!navigator.mediaDevices?.getUserMedia){status.textContent='Camera requires HTTPS and a supported browser.';return}if(!('BarcodeDetector'in window)){status.textContent='Automatic barcode detection is unavailable in this browser. Enter the UPC manually below.';return}try{detector=new BarcodeDetector({formats:['upc_a','upc_e','ean_13','ean_8']});stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});video.srcObject=stream;await video.play();document.getElementById('scan-start').disabled=true;document.getElementById('scan-stop').disabled=false;status.textContent='Point camera at the barcode.';tick()}catch(e){stop();status.textContent='Camera unavailable: '+e.message}});
document.getElementById('scan-stop').addEventListener('click',stop);
document.getElementById('scan-manual').addEventListener('submit',e=>{e.preventDefault();last='';identify(document.getElementById('scan-upc').value)});
document.querySelectorAll('[data-primary-tab]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.primaryTab!=='scanner')stop()}));
document.querySelector('[data-primary-tab="scanner"]')?.addEventListener('click',()=>{document.querySelectorAll('[data-primary-tab]').forEach(b=>{const active=b.dataset.primaryTab==='scanner';b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});document.getElementById('collection-view').hidden=true;document.getElementById('sales-view').hidden=true;root.hidden=false});
})();