"""Audit local Pop inventory against the public GitHub Funko catalog; never fetch product images."""
import collections, difflib, json, pathlib, re, urllib.request
ROOT=pathlib.Path("data");OUT=pathlib.Path("image-review");OUT.mkdir(exist_ok=True)
items=json.loads((ROOT/"pops.json").read_text(encoding="utf-8"))["items"]
url="https://raw.githubusercontent.com/kennymkchan/funko-pop-data/master/funko_pop.json"
req=urllib.request.Request(url,headers={"User-Agent":"PopFolio-catalog-audit/1.0"})
with urllib.request.urlopen(req,timeout=90) as response:catalog=json.load(response)
if isinstance(catalog,dict):catalog=catalog.get("data") or catalog.get("products") or catalog.get("items") or []
if not isinstance(catalog,list):raise ValueError("Unexpected catalog structure")
def norm(v):return re.findall(r"[a-z0-9]+",str(v or "").lower())
def ident(p):return "|".join(str(p.get(k) or "").strip().casefold() for k in ("franchise","name","number","variant"))
unique={ident(p):p for p in items if p.get("name")}
stop={"funko","pop","vinyl","figure","figures","the","and","with","of","as","from","exclusive","edition"}
critical={"chase","flocked","diamond","metallic","glow","gitd","blacklight","pearlescent"}
entries=[]
for c in catalog:
 if not isinstance(c,dict) or not c.get("title"):continue
 title=str(c["title"]);series=str(c.get("series") or "");image=c.get("image")
 entries.append({"title":title,"series":series,"image":image if isinstance(image,str) else None,"tokens":set(norm(title))-stop,"seriesTokens":set(norm(series))-stop})
results=[]
for key,p in sorted(unique.items()):
 wanted=set(norm(p["name"]))-stop;franchise=set(norm(p.get("franchise")))-stop
 variant=set(norm(p.get("variant")))&critical
 candidates=[]
 for c in entries:
  if not wanted or not wanted.issubset(c["tokens"]):continue
  if franchise and c["seriesTokens"] and len(franchise & c["seriesTokens"])==0:continue
  if variant and not variant.issubset(c["tokens"]):continue
  score=difflib.SequenceMatcher(None," ".join(sorted(wanted))," ".join(sorted(c["tokens"]))).ratio()
  if franchise and franchise.issubset(c["seriesTokens"]):score+=0.12
  candidates.append((score,c))
 candidates.sort(key=lambda x:x[0],reverse=True)
 top=candidates[:3]
 status="no candidate"
 if top:
  status="candidate requires review"
  if len(top)==1 and top[0][0]>=1.05:status="strong title/series candidate (unverified)"
 results.append({"key":key,"franchise":p.get("franchise"),"name":p.get("name"),"number":p.get("number"),"variant":p.get("variant"),"status":status,"candidates":[{"title":c["title"],"series":c["series"],"imageUrl":c["image"],"score":round(score,3)} for score,c in top]})
counts=dict(collections.Counter(r["status"] for r in results))
output={"catalogUrl":url,"catalogEntries":len(entries),"uniquePops":len(results),"statusCounts":counts,"notes":["No images downloaded, hosted or displayed.","Catalog lacks reliable Pop number and variant identifiers; every candidate must be verified.","Image URLs are references only, not permission to reproduce photographs."],"results":results}
(OUT/"catalog-audit.json").write_text(json.dumps(output,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
lines=["# Funko catalog matching audit","",f"Catalog entries: {len(entries)}; unique collection Pops: {len(results)}.","","No images were downloaded or published. All matches require human verification of number and edition.","","## Results",""]
for k,v in sorted(counts.items()):lines.append(f"- {k}: {v}")
lines+=["","| Franchise | Pop | Status | Top candidate |","|---|---|---|---|"]
for r in results:
 c=r["candidates"][0] if r["candidates"] else None
 safe=lambda s:str(s or "").replace("|","/").replace("\n"," ")
 lines.append("| "+safe(r["franchise"])+" | "+safe(r["name"])+" | "+r["status"]+" | "+safe(c["title"] if c else "—")+" |")
(OUT/"catalog-audit.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
print("Audit complete",len(entries),"catalog entries,",len(results),"unique Pops",counts)
