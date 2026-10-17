"""Enrich PopFolio with carefully verified product imagery.

Sources:
  1. Curated images.json: owner-approved image URLs, per unique Pop key.
  2. Wikimedia Commons: explicitly reusable images, strict identity match.
  3. Open Library covers: not used (book covers are not Pop product photos).

Commercial catalog imagery (Funko, hobbyDB, retailer listings) is deliberately
NOT scraped or hotlinked without a license or approved API arrangement.
"""
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path("data")
API = "https://commons.wikimedia.org/w/api.php"
ALLOWED = ("cc-by", "cc0", "public domain", "pd-", "cc-by-sa")

def tokens(value):
    return re.findall(r"[a-z0-9]+", str(value).lower())

def identity(item):
    return "|".join(str(item.get(field) or "").strip().casefold() for field in ("franchise","name","number","variant"))

def approved_images():
    path = ROOT / "images.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("images", {})

def commons(item):
    number = str(item.get("number") or "").strip()
    if not number.isdigit():
        return None
    query = "Funko Pop " + str(item["name"]) + " " + number
    params = urllib.parse.urlencode({
        "action":"query","generator":"search","gsrsearch":query,
        "gsrnamespace":6,"gsrlimit":5,"prop":"imageinfo",
        "iiprop":"url|extmetadata","iiurlwidth":320,"format":"json"
    })
    req = urllib.request.Request(API+"?"+params,headers={"User-Agent":"PopFolioCollectionDashboard/1.1 (public Github project)"})
    with urllib.request.urlopen(req,timeout=12) as response:
        pages = json.load(response).get("query",{}).get("pages",{})
    wanted = set(tokens(item["name"]))
    variant = set(tokens(item.get("variant","")))
    critical = {"chase","flocked","diamond","metallic","glow","gitd","blacklight","pearlescent"}
    for page in pages.values():
        title = page.get("title","")
        title_tokens = set(tokens(title))
        if not {"funko","pop"}.issubset(title_tokens) or number not in title_tokens or not wanted.issubset(title_tokens):
            continue
        if not (variant & critical).issubset(title_tokens):
            continue
        info = (page.get("imageinfo") or [{}])[0]
        license_name = str((info.get("extmetadata",{}).get("LicenseShortName") or {}).get("value","")).lower()
        if not any(license_name.startswith(p) for p in ALLOWED):
            continue
        url = info.get("thumburl") or info.get("url")
        if url and url.startswith("https://upload.wikimedia.org/"):
            return {"image":url,"imageSource":info.get("descriptionurl"),"imageLicense":license_name,"imageProvider":"Wikimedia Commons"}
    return None


def openverse(item):
    """Find an explicitly licensed photo using the Openverse image API."""
    number = str(item.get("number") or "").strip()
    if not number.isdigit():
        return None
    params = urllib.parse.urlencode({"q":"Funko Pop "+str(item["name"])+" "+number,"page_size":10})
    req = urllib.request.Request("https://api.openverse.org/v1/images/?"+params,headers={"User-Agent":"PopFolioCollectionDashboard/1.1"})
    with urllib.request.urlopen(req,timeout=12) as response:
        hits = json.load(response).get("results",[])
    needed = set(tokens(item["name"]))
    critical = set(tokens(item.get("variant",""))) & {"chase","flocked","diamond","metallic","glow","gitd","blacklight","pearlescent"}
    for hit in hits:
        title = set(tokens(hit.get("title","")))
        if not {"funko","pop"}.issubset(title) or number not in title or not needed.issubset(title) or not critical.issubset(title):
            continue
        license_name = str(hit.get("license") or "").lower()
        if license_name not in ("cc0","pdm","by","by-sa"):
            continue
        url = hit.get("thumbnail") or hit.get("url")
        if url and url.startswith("https://"):
            return {"image":url,"imageSource":hit.get("foreign_landing_url"),"imageLicense":license_name,"imageProvider":"Openverse","imageCreator":hit.get("creator")}
    return None


CATALOG_URL = "https://raw.githubusercontent.com/kennymkchan/funko-pop-data/master/funko_pop.json"

def normalize_catalog_image(value):
    """Accept common legacy URL formats while keeping HTTPS-only browser output."""
    if isinstance(value,dict):
        value=value.get("src") or value.get("url") or value.get("original") or ""
    if isinstance(value,list):
        value=value[0] if value else ""
    if not isinstance(value,str):
        return None
    value=value.strip()
    if value.startswith("//"):
        value="https:"+value
    elif value.startswith("http://"):
        value="https://"+value[7:]
    if not value.startswith("https://"):
        return None
    parsed=urllib.parse.urlsplit(value)
    if not parsed.hostname or parsed.username or parsed.password:
        return None
    return value

def catalog_images(items):
    """Match the catalog by normalized character names, Pop number, and series.

    The upstream catalog has only handle, image, title, and series fields.
    Its title often does NOT include a Pop number, and some owned records
    also lack one. Do not make either absence an automatic rejection.
    """
    from difflib import SequenceMatcher
    diagnostics={"downloaded":False,"entries":0,"withImage":0,
                 "candidates":0,"accepted":0,"ambiguous":0,"imageSamples":[],"invalidImageSamples":[],"legacyHttp":0}
    try:
        req=urllib.request.Request(CATALOG_URL,headers={"User-Agent":"PopFolio/2.0"})
        with urllib.request.urlopen(req,timeout=90) as response:
            catalog=json.load(response)
        diagnostics["downloaded"]=True
    except Exception as exc:
        diagnostics["error"]=str(exc)
        print("CATALOG DOWNLOAD FAILED:",exc)
        return {},diagnostics
    if isinstance(catalog,dict):
        catalog=catalog.get("data") or catalog.get("products") or catalog.get("items") or []
    if not isinstance(catalog,list):
        diagnostics["error"]="Unexpected catalog JSON structure"
        return {},diagnostics
    diagnostics["entries"]=len(catalog)
    stop={"funko","pop","vinyl","figure","figures","the","and","with","of","as","from","exclusive","edition"}
    def norm(value):
        return set(tokens(value))-stop
    indexed={}
    valid=[]
    for entry in catalog:
        if not isinstance(entry,dict):continue
        raw=entry.get("image")
        title=str(entry.get("title") or "")
        if not title:continue
        if raw and len(diagnostics["imageSamples"])<3:
            diagnostics["imageSamples"].append(str(raw)[:180])
        if isinstance(raw,str) and raw.startswith("http://"):
            diagnostics["legacyHttp"]+=1
        url=normalize_catalog_image(raw)
        if not url:
            if len(diagnostics["invalidImageSamples"])<3:
                diagnostics["invalidImageSamples"].append({"title":title[:80],"image":str(raw)[:120]})
            continue
        entry=dict(entry,image=url)
        diagnostics["withImage"]+=1
        title_tokens=norm(title)
        record=(entry,title_tokens)
        valid.append(record)
        for t in title_tokens:
            if len(t)>2:indexed.setdefault(t,[]).append(record)
    results={}
    for item in items:
        wanted=norm(item.get("name",""))
        if not wanted:continue
        searchable=[t for t in wanted if len(t)>2 and t in indexed]
        if not searchable:continue
        rare=min(searchable,key=lambda t:len(indexed[t]))
        possibilities=[]
        for entry,words in indexed[rare]:
            overlap=len(wanted&words)/len(wanted)
            if overlap<0.75:continue
            number=str(item.get("number") or "").strip()
            title_tokens=set(tokens(entry.get("title","")))
            if number.isdigit() and number in title_tokens:bonus=.12
            elif number.isdigit() and any(t.isdigit() and len(t)>=2 for t in title_tokens):
                # A different explicit figure number is disqualifying.
                if number not in title_tokens:continue
                bonus=0
            else:bonus=0
            variant=str(item.get("variant") or "").lower()
            title=str(entry.get("title","")).lower()
            markers={"chase","flocked","diamond","metallic","blacklight","pearlescent"}
            required={x for x in markers if x in variant}
            if not required.issubset(set(tokens(title))):continue
            # Do not use standard images for an explicitly marked variant.
            if not required and ("chase" in title or "flocked" in title or "diamond" in title):
                continue
            franchise=norm(item.get("franchise",""))
            series=" ".join(str(x) for x in entry.get("series",[]) ) if isinstance(entry.get("series"),list) else str(entry.get("series") or "")
            context=norm(series+" "+title)
            series_score=len(franchise&context)/max(1,len(franchise)) if franchise else 0
            name_score=SequenceMatcher(None," ".join(sorted(wanted))," ".join(sorted(words))).ratio()
            score=overlap*.68+series_score*.18+name_score*.14+bonus
            if score>=.68:possibilities.append((score,entry))
        if not possibilities:continue
        diagnostics["candidates"]+=1
        possibilities.sort(key=lambda p:p[0],reverse=True)
        # Ambiguous matches are not displayed as the wrong variant.
        if len(possibilities)>1 and possibilities[0][0]-possibilities[1][0]<.055:
            diagnostics["ambiguous"]+=1
            continue
        best=possibilities[0][1]
        results[identity(item)]={"image":best["image"],"imageSource":CATALOG_URL,
          "imageProvider":"Community Funko catalog",
          "imageLicense":"Third-party product image; rights retained by owner"}
    diagnostics["accepted"]=len(results)
    print("Catalog diagnostics:",json.dumps(diagnostics))
    return results,diagnostics

def main():
    path=ROOT/"pops.json"
    if not path.exists():
        raise FileNotFoundError("Individual Pop snapshot missing")
    data=json.loads(path.read_text(encoding="utf-8"))
    items=data.get("items",[])
    approved=approved_images()
    cache_path=ROOT/"image-cache.json"
    cache=json.loads(cache_path.read_text(encoding="utf-8")) if cache_path.exists() else {}
    if not isinstance(cache,dict):cache={}
    catalog,diagnostics=catalog_images(items)
    # The historical catalog currently reports 23,940 entries but zero
    # nonempty image fields. Use Commons/Openverse as independent fallbacks.
    import os
    budget=max(0,min(40,int(os.getenv("IMAGE_LOOKUP_LIMIT","12"))))
    attempts=0
    lookup_errors=[]
    found=0
    sources={}
    missing=0
    for item in items:
        key=identity(item)
        record=approved.get(key)
        if isinstance(record,dict) and normalize_catalog_image(record.get("url")):
            item.update(image=normalize_catalog_image(record["url"]),
                imageSource=record.get("source",""),
                imageLicense=record.get("license","Owner-approved"),
                imageProvider=record.get("provider","Curated"))
        elif key in catalog:
            item.update(catalog[key])
        elif isinstance(cache.get(key),dict) and cache[key].get("image"):
            item.update(cache[key])
        else:
            item["image"]=None
            # Do not repeatedly search a figure that already had no matches.
            if key not in cache and attempts<budget:
                attempts+=1
                result=None
                for provider in (commons,openverse):
                    try:
                        result=provider(item)
                        if result:break
                    except Exception as exc:
                        if len(lookup_errors)<8:
                            lookup_errors.append(provider.__name__+": "+str(exc)[:150])
                cache[key]=result or {"searched":True}
                if result:item.update(result)
        if item.get("image"):
            found+=1
            provider=item.get("imageProvider","Unknown")
            sources[provider]=sources.get(provider,0)+1
        else:missing+=1
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    cache_path.write_text(json.dumps(cache,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    report={"total":len(items),"matched":found,"unmatched":missing,
        "sources":sources,"catalogCandidates":diagnostics["candidates"],
        "catalogDiagnostics":diagnostics,"fallbackSearchesThisRun":attempts,
        "fallbackSearchesCached":len(cache),"fallbackErrors":lookup_errors,
        "note":"The historical catalog currently contains no image URLs. Fallback searches are rate-limited and may not find many collectible images."}
    (ROOT/"image-report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print("Image enrichment:",json.dumps(report,ensure_ascii=False))

if __name__=="__main__":
    main()
