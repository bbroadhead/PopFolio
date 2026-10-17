"""Read-only extraction of embedded Google Sheet images from a temporary XLSX export.

Uses the same publicly readable spreadsheet as refresh.py. No write access to
Google Sheets, credentials, or manual exports are required. If the spreadsheet
export is not publicly accessible, keep the previously published images.
"""
import io,json,os,pathlib,re,urllib.request,zipfile,xml.etree.ElementTree as ET
from urllib.parse import quote
from refresh import SHEET_ID

ROOT=pathlib.Path("data")
IMAGE_DIR=pathlib.Path("images/sheet")
NS={"x":"http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r":"http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "d":"http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
    "p":"http://schemas.openxmlformats.org/package/2006/relationships"}
R="{"+NS["r"]+"}id"
def rel_target(base,target):
    import posixpath
    return posixpath.normpath(posixpath.join(posixpath.dirname(base),target.lstrip("/"))) if not target.startswith("/") else target.lstrip("/")
def relationships(z,path):
    import posixpath
    relpath=posixpath.join(posixpath.dirname(path),"_rels",posixpath.basename(path)+".rels")
    if relpath not in z.namelist():return {}
    return {node.get("Id"):rel_target(path,node.get("Target","")) for node in ET.fromstring(z.read(relpath))}
def sheet_paths(z):
    book=ET.fromstring(z.read("xl/workbook.xml"))
    rels=relationships(z,"xl/workbook.xml")
    return {s.get("name"):rels.get(s.get(R)) for s in book.findall("x:sheets/x:sheet",NS)}
def anchor_images(z,tab,path):
    rels=relationships(z,path)
    sheet=ET.fromstring(z.read(path))
    result=[]
    for draw in sheet.findall("x:drawing",NS):
        drawing=rels.get(draw.get(R))
        if not drawing or drawing not in z.namelist():continue
        media=relationships(z,drawing)
        root=ET.fromstring(z.read(drawing))
        for anchor in root:
            if not anchor.tag.endswith(("oneCellAnchor","twoCellAnchor")):continue
            origin=anchor.find("d:from",NS)
            if origin is None:continue
            row=origin.find("d:row",NS)
            col=origin.find("d:col",NS)
            if row is None or col is None or row.text is None or col.text is None:continue
            # The sheet's Image column is A. Ignore sticker photos in B.
            if int(col.text)!=0:continue
            for blip in anchor.findall(".//{http://schemas.openxmlformats.org/drawingml/2006/main}blip"):
                target=media.get(blip.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed"))
                if target and target in z.namelist():
                    result.append((int(row.text)+1,target))
    return result
def main():
    items_path=ROOT/"pops.json"
    data=json.loads(items_path.read_text(encoding="utf-8"))\n    # Retain already published image URLs if the sheet export becomes unavailable.\n    prior_images={}\n    try:\n        prior=json.loads((ROOT/"previous-pops.json").read_text(encoding="utf-8"))\n        prior_images={p["id"]:p for p in prior.get("items",[]) if p.get("image")}\n    except (OSError,ValueError,KeyError):pass\n    for item in data["items"]:\n        if not item.get("image") and item["id"] in prior_images:\n            old=prior_images[item["id"]]\n            for field in ("image","imageProvider","imageSource"):\n                if field in old:item[field]=old[field]
    report={"status":"pending","exportDownloaded":False,"imagesExtracted":0,"imagesAssigned":0}
    report_path=ROOT/"sheet-image-report.json"
    try:
        url=f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=xlsx"
        req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; PopFolio/1.0)"})
        with urllib.request.urlopen(req,timeout=120) as response:
            content=response.read(100*1024*1024+1)
        if len(content)>100*1024*1024:raise ValueError("Export exceeds 100 MB safety limit")
        with zipfile.ZipFile(io.BytesIO(content)) as z:
            report["exportDownloaded"]=True
            sheets=sheet_paths(z)
            report["sheetsInExport"]=len(sheets)
            by_id={p["id"]:p for p in data["items"]}
            IMAGE_DIR.mkdir(parents=True,exist_ok=True)
            assigned=0
            for tab,path in sheets.items():
                if not path or path not in z.namelist():continue
                for row,media in anchor_images(z,tab,path):
                    item=by_id.get(f"{tab}:{row}")
                    if item is None:continue
                    ext=pathlib.PurePosixPath(media).suffix.lower()
                    if ext not in (".png",".jpg",".jpeg",".webp",".gif"):continue
                    raw=z.read(media)
                    if len(raw)>6*1024*1024:continue
                    # Stable per-row path, with a hash to bust browser caches.
                    import hashlib
                    digest=hashlib.sha256(raw).hexdigest()[:16]
                    name=hashlib.sha256(item["id"].encode()).hexdigest()[:16]+"-"+digest+ext
                    destination=IMAGE_DIR/name
                    if not destination.exists():destination.write_bytes(raw)
                    item["image"]="./images/sheet/"+name
                    item["imageProvider"]="Google Sheet embedded image"
                    item["imageSource"]="Google Sheet: "+tab+"!A"+str(row)
                    assigned+=1
            report["imagesAssigned"]=assigned
            report["imagesExtracted"]=assigned
            report["status"]="ok"
        items_path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    except Exception as exc:
        report["status"]="unavailable"
        report["error"]=str(exc)[:350]
        print("Sheet image extraction unavailable:",exc)
        # Do not fail the whole collection refresh if export is private.
    report_path.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print("Sheet image extraction:",json.dumps(report))
if __name__=="__main__":main()
