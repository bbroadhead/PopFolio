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
            result=commons(item)
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
