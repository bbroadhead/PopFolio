"""Conservative licensed-image matcher for Wikimedia Commons.

Only accepts Commons files with an explicit reuse license and a filename that
contains Funko/Pop plus the exact character name and Pop number. Unmatched
products intentionally keep image=None. No image scraping or hotlink guessing.
"""
import json, pathlib, re, urllib.parse, urllib.request, time

API = "https://commons.wikimedia.org/w/api.php"
ALLOWED = ("cc-by", "cc0", "public domain", "pd-", "cc-by-sa")

def words(s):
    return re.findall(r"[a-z0-9]+", str(s).lower())

def lookup(item):
    name = item["name"]
    number = str(item.get("number") or "").strip()
    if not number.isdigit():
        return None
    query = "Funko Pop " + name + " " + number
    params = urllib.parse.urlencode({"action":"query","generator":"search","gsrsearch":query,"gsrnamespace":6,"gsrlimit":5,"prop":"imageinfo","iiprop":"url|extmetadata","iiurlwidth":320,"format":"json"})
    request = urllib.request.Request(API + "?" + params, headers={"User-Agent":"PopFolioCollectionDashboard/1.0 (GitHub public project)"})
    with urllib.request.urlopen(request,timeout=15) as response:
        pages=json.load(response).get("query",{}).get("pages",{})
    wanted=set(words(name))
    for page in pages.values():
        title=page.get("title","")
        tokens=set(words(title))
        if not {"funko","pop"}.issubset(tokens) or number not in tokens or not wanted.issubset(tokens):
            continue
        info=(page.get("imageinfo") or [{}])[0]
        metadata=info.get("extmetadata") or {}
        license_name=str((metadata.get("LicenseShortName") or {}).get("value","")).lower()
        if not any(license_name.startswith(p) for p in ALLOWED):
            continue
        url=info.get("thumburl") or info.get("url")
        if url and url.startswith("https://upload.wikimedia.org/"):
            return {"image":url,"imageSource":info.get("descriptionurl"),"imageLicense":license_name}
    return None

def main():
    path=pathlib.Path("data/pops.json")
    if not path.exists():
        print("No synced item data yet; image matching skipped.")
        return
    data=json.loads(path.read_text(encoding="utf-8"))
    matched=0
    # Wikimedia Commons is not a comprehensive product catalog. Strict matching
    # intentionally produces fewer images instead of incorrect figure variants.
    for item in data.get("items",[]):
        try:
            result=lookup(item)
            if result:
                item.update(result)
                matched+=1
        except Exception as exc:
            print("Image lookup skipped:",item.get("name"),str(exc))
        time.sleep(.15)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print("Matched",matched,"licensed Commons images")

if __name__=="__main__":
    main()
