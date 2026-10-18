"""Build a review-only image candidate report; never edit PopFolio app or spreadsheet."""
import json, pathlib, re, time, urllib.parse, urllib.request, html
from collections import defaultdict

ROOT=pathlib.Path("data")
OUT=pathlib.Path("image-review")
OUT.mkdir(exist_ok=True)
items=json.loads((ROOT/"pops.json").read_text(encoding="utf-8"))["items"]
def clean(s): return re.sub(r"\\s+"," ",str(s or "")).strip()
def key(p): return "|".join(clean(p.get(k)).casefold() for k in ("franchise","name","number","variant"))
unique={key(p):p for p in items if p.get("name")}
def request(url):
    req=urllib.request.Request(url,headers={"User-Agent":"PopFolio-image-review/1.0 (GitHub project; contact via repository)"})
    with urllib.request.urlopen(req,timeout=15) as r:return json.load(r)
def query(p):
    return "Funko Pop "+clean(p["name"])+" "+clean(p.get("number"))+" "+clean(p.get("variant"))+" "+clean(p.get("franchise"))
def candidates(p):
    q=query(p); results=[]
    params=urllib.parse.urlencode({"action":"query","generator":"search","gsrsearch":q,"gsrnamespace":6,"gsrlimit":8,"prop":"imageinfo","iiprop":"url|extmetadata","iiurlwidth":450,"format":"json"})
    try:
        data=request("https://commons.wikimedia.org/w/api.php?"+params)
        for page in data.get("query",{}).get("pages",{}).values():
            info=(page.get("imageinfo") or [{}])[0]
            meta=info.get("extmetadata") or {}
            license_name=clean((meta.get("LicenseShortName") or {}).get("value")).lower()
            if not (license_name.startswith(("cc by","cc-by","cc0","public domain","pd-"))):continue
            url=info.get("thumburl") or info.get("url")
            if not url or not url.startswith("https://upload.wikimedia.org/"):continue
            results.append({"title":page.get("title"),"imageUrl":url,"sourceUrl":info.get("descriptionurl"),"license":license_name,"provider":"Wikimedia Commons"})
    except Exception as e:print("Commons search unavailable:",str(e)[:130])
    try:
        data=request("https://api.openverse.org/v1/images/?"+urllib.parse.urlencode({"q":q,"page_size":12}))
        for hit in data.get("results",[]):
            lic=clean(hit.get("license")).lower()
            if lic not in ("cc0","pdm","by","by-sa"):continue
            url=hit.get("thumbnail") or hit.get("url")
            if not url or not url.startswith("https://"):continue
            results.append({"title":hit.get("title"),"imageUrl":url,"sourceUrl":hit.get("foreign_landing_url"),"license":lic,"provider":"Openverse","creator":hit.get("creator")})
    except Exception as e:print("Openverse search unavailable:",str(e)[:130])
    words=lambda s:set(re.findall(r"[a-z0-9]+",clean(s).lower()))
    needed=words(p["name"]); number=clean(p.get("number"))
    variant=words(p.get("variant")); markers={"chase","flocked","diamond","metallic","glow","gitd","blacklight","pearlescent"}
    scored=[]
    for c in results:
        title=words(c["title"])
        score=round((len(needed & title)/max(len(needed),1))*60 + (20 if number and number in title else 0) + (20 if (variant & markers).issubset(title) else 0))
        c["matchScore"]=score
        # Text alone cannot verify the actual figure or distinguish box from unboxed.
        c["view"]="unverified"
        scored.append(c)
    return sorted(scored,key=lambda c:-c["matchScore"])[:8]
report=[]
limit=max(0,int(__import__("os").environ.get("MAX_LOOKUPS","40")))
for i,(ident,p) in enumerate(sorted(unique.items())):
    record={"key":ident,"franchise":p.get("franchise"),"name":p.get("name"),"number":p.get("number"),"variant":p.get("variant"),"existingImage":p.get("image"),"boxed":[],"unboxed":[],"candidates":[],"status":"not searched"}
    if i<limit:
        record["candidates"]=candidates(p)
        record["status"]="review required" if record["candidates"] else "no licensed candidates found"
        time.sleep(.3)
    report.append(record)
(OUT/"candidates.json").write_text(json.dumps({"searched":min(limit,len(report)),"totalUnique":len(report),"records":report},indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
lines=["# PopFolio image candidate review","","This report is read-only. No image is approved, downloaded or assigned automatically.","The candidate search uses openly licensed results only; verify actual license, exact Pop number, variant, and whether boxed or unboxed before reuse.","",f"Unique Pops: {len(report)}; searched: {min(limit,len(report))}","","| Pop | Candidates | Status |","|---|---:|---|"]
for p in report:lines.append("| "+html.escape(clean(p["franchise"])+" — "+clean(p["name"])).replace("|","/")+" | "+str(len(p["candidates"]))+" | "+p["status"]+" |")
(OUT/"README.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
print(f"Reviewed {min(limit,len(report))} of {len(report)} unique Pops; output in image-review/")
