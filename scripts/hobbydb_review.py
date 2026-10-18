"""Read-only hobbyDB-first image discovery. No images are downloaded or republished."""
import html, json, os, pathlib, re, time, urllib.parse, urllib.request, urllib.robotparser
from collections import defaultdict
from html.parser import HTMLParser

ROOT=pathlib.Path("data")
OUT=pathlib.Path("image-review")
OUT.mkdir(exist_ok=True)
items=json.loads((ROOT/"pops.json").read_text(encoding="utf-8"))["items"]
def clean(value): return " ".join(str(value or "").split())
def identity(p): return "|".join(clean(p.get(k)).casefold() for k in ("franchise","name","number","variant"))
unique={identity(p):p for p in items if p.get("name")}
by_franchise=defaultdict(list)
for key,p in sorted(unique.items()):
    by_franchise[clean(p.get("franchise"))].append((key,p))
# Round robin: test different franchises, not 25 consecutive records in one franchise.
sample=[]
while any(by_franchise.values()):
    for franchise in sorted(by_franchise):
        if by_franchise[franchise]:sample.append(by_franchise[franchise].pop(0))
    if len(sample)>=100:break
limit=min(100,max(1,int(os.environ.get("MAX_LOOKUPS","25"))))
sample=sample[:limit]
KNOWN={
    "freddy funko as strongheart":"https://www.hobbydb.com/marketplaces/hobbydb/catalog_items/freddy-funko-as-strongheart"
}
def slug(value):
    value=clean(value).lower().replace("&"," and ")
    return re.sub(r"^-|-$","",re.sub(r"[^a-z0-9]+","-",value))
class Meta(HTMLParser):
    def __init__(self):super().__init__();self.meta={};self.title=""
    def handle_starttag(self,tag,attrs):
        if tag!="meta":return
        a=dict(attrs);name=a.get("property") or a.get("name")
        if name and a.get("content"):self.meta[name.lower()]=a["content"]
def allowed(url):
    parsed=urllib.parse.urlparse(url)
    if parsed.scheme!="https" or parsed.hostname!="www.hobbydb.com":return False,"unsupported host"
    robots="https://www.hobbydb.com/robots.txt"
    try:
        req=urllib.request.Request(robots,headers={"User-Agent":"PopFolioImageReview/1.0"})
        with urllib.request.urlopen(req,timeout=15) as response:lines=response.read(300000).decode("utf-8","replace").splitlines()
        parser=urllib.robotparser.RobotFileParser();parser.parse(lines)
        return parser.can_fetch("PopFolioImageReview/1.0",url),"robots.txt"
    except Exception as exc:return False,"robots check unavailable: "+str(exc)[:90]
def inspect(url):
    ok,reason=allowed(url)
    if not ok:return {"url":url,"status":"skipped","reason":reason}
    try:
        req=urllib.request.Request(url,headers={"User-Agent":"PopFolioImageReview/1.0","Accept":"text/html"})
        with urllib.request.urlopen(req,timeout=18) as response:
            final=response.geturl()
            if urllib.parse.urlparse(final).hostname!="www.hobbydb.com":return {"url":url,"status":"skipped","reason":"redirected off hobbyDB"}
            if "text/html" not in response.headers.get("Content-Type",""):return {"url":url,"status":"skipped","reason":"not HTML"}
            page=response.read(350000).decode("utf-8","replace")
        parser=Meta();parser.feed(page)
        image=parser.meta.get("og:image") or parser.meta.get("twitter:image")
        title=parser.meta.get("og:title") or parser.meta.get("twitter:title") or ""
        return {"url":final,"status":"page found","title":html.unescape(title),"imageCandidateUrl":image,"imageType":"unverified combined/boxed/unboxed"}
    except Exception as exc:return {"url":url,"status":"unavailable","reason":str(exc)[:130]}
report=[]
for key,p in sample:
    name=clean(p["name"])
    url=KNOWN.get(name.casefold()) or "https://www.hobbydb.com/marketplaces/hobbydb/catalog_items/"+slug(name)
    result=inspect(url)
    # A matching slug alone is never proof of the correct number, sticker or edition.
    report.append({"key":key,"franchise":p.get("franchise"),"name":name,"number":p.get("number"),"variant":p.get("variant"),"catalogCandidate":result,"matchStatus":"manual verification required","boxedImage":None,"unboxedImage":None})
    time.sleep(1.0)
(OUT/"candidates.json").write_text(json.dumps({"source":"hobbyDB candidate catalog pages","tested":len(report),"totalUnique":len(unique),"records":report},indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
lines=["# hobbyDB-first Pop image discovery","","Read-only report: **no images downloaded, approved or published**.","Catalog URL guesses are candidates, not verified matches. Check number, franchise, exclusivity, sticker and boxed/unboxed presentation manually.","Robots rules are checked before each request; unavailable/disallowed pages are skipped.","",f"Tested {len(report)} Pops across {len(set(p['franchise'] for p in report))} franchises (of {len(unique)} unique).","","| Franchise | Pop | Catalog result |","|---|---|---|"]
for p in report:
    c=p["catalogCandidate"]
    url=c["url"]
    link="["+html.escape(c["status"])+"]("+url+")" if c["status"]=="page found" else html.escape(c["status"]+" — "+c.get("reason",""))
    lines.append("| "+html.escape(clean(p["franchise"])).replace("|","/")+" | "+html.escape(p["name"]).replace("|","/")+" | "+link+" |")
(OUT/"README.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
print("Image discovery complete:",len(report),"records; page candidates:",sum(p["catalogCandidate"]["status"]=="page found" for p in report))
