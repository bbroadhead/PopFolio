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

def catalog_images(items):
    """Match an open-source catalog's product-image links without guessing URLs.

    Product photos themselves are third-party assets and remain hosted by their
    original providers; catalog source licensing does not transfer photo rights.
    """
    try:
        req = urllib.request.Request(CATALOG_URL, headers={"User-Agent":"PopFolio/1.2"})
        with urllib.request.urlopen(req, timeout=90) as response:
            catalog = json.load(response)
    except Exception as exc:
        print("Catalog download unavailable:", exc)
        return {}
    if isinstance(catalog, dict):
        catalog = catalog.get("data") or catalog.get("products") or catalog.get("items") or []
    if not isinstance(catalog, list):
        print("Unexpected catalog format")
        return {}
    indexed = {}
    for entry in catalog:
        if not isinstance(entry, dict):
            continue
        title = str(entry.get("title") or "")
        url = str(entry.get("image") or "")
        if not title or not url.startswith("https://"):
            continue
        for token in set(tokens(title)):
            if len(token) >= 3:
                indexed.setdefault(token, []).append(entry)
    results = {}
    for item in items:
        name_tokens = set(tokens(item.get("name","")))
        if not name_tokens:
            continue
        rare = min((t for t in name_tokens if len(t)>=3), key=lambda t:len(indexed.get(t,[])), default=None)
        if not rare:
            continue
        candidates = []
        for entry in indexed.get(rare,[]):
            title = str(entry.get("title") or "")
            title_tokens = set(tokens(title))
            if not name_tokens.issubset(title_tokens):
                continue
            number = str(item.get("number") or "").strip()
            if number.isdigit() and number not in title_tokens:
                continue
            variant = str(item.get("variant") or "").lower()
            critical = ("chase","flocked","diamond","metallic","blacklight","pearlescent")
            if any(x in variant and x not in title.lower() for x in critical):
                continue
            # Require a high-confidence unique title rather than a fuzzy guess.
            extra = len(title_tokens - name_tokens - set(tokens(number)) - {"pop","funko","vinyl","figure","games","television","movies"})
            candidates.append((extra,entry))
        candidates.sort(key=lambda pair:pair[0])
        if not candidates or (len(candidates)>1 and candidates[0][0]==candidates[1][0]):
            continue
        entry=candidates[0][1]
        results[identity(item)]={"image":entry["image"],"imageSource":CATALOG_URL,"imageProvider":"Community Funko catalog","imageLicense":"Third-party product image; rights retained by owner"}
    print("Community catalog:",len(catalog),"entries,",len(results),"candidate images")
    return results

def main():
    path=ROOT/"pops.json"
    if not path.exists():
        print("No synced Pop feed; skipping image enrichment.")
        return
    data=json.loads(path.read_text(encoding="utf-8"))
    approved=approved_images()
    found=0
    missing=0
    for item in data.get("items",[]):
        key=identity(item)
        record=approved.get(key)
        if record and isinstance(record,dict) and str(record.get("url","")).startswith("https://"):
            item.update(image=record["url"],imageSource=record.get("source",""),imageLicense=record.get("license","Owner-approved"),imageProvider=record.get("provider","Curated"))
            found+=1
            continue
        try:
            result=commons(item) or openverse(item)
            if result:
                item.update(result)
                found+=1
            else:
                missing+=1
        except Exception as exc:
            print("Lookup unavailable for",item.get("name"),str(exc))
            missing+=1
        time.sleep(0.12)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (ROOT/"image-report.json").write_text(json.dumps({"total":len(data.get("items",[])),"matched":found,"unmatched":missing},indent=2)+"\n",encoding="utf-8")
    print("Product images:",found,"matched;",missing,"unmatched")

if __name__=="__main__":
    main()
