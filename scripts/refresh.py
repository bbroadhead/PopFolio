import csv, io, json, pathlib, urllib.request
from datetime import datetime, timezone

SHEET_ID = "1Bltl_J8zQUjkhhvS-nWtfh4KzrTIMoVBt_umQlMab8I"
URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Dashboard"

def num(value):
    text = str(value or "").strip().replace("$", "").replace(",", "").replace("%", "")
    negative = text.startswith("(") and text.endswith(")")
    try:
        value = float(text.strip("()"))
        return round(-value if negative else value, 2)
    except ValueError:
        return 0.0


# Franchise tabs are read-only CSV exports. This list intentionally excludes the
# Dashboard, Wishlist and archived collection.
FRANCHISE_TABS = [
"Back to the Future","Cyberpunk 2077","DC Comics","Dexter","Diablo","Disney",
"Dungeons & Dragons","Elf","Elder Scrolls, The","Funko","God of War",
"Good Place, The","Game of Thrones","Halloween","Harry Potter","Horror: Miscellaneous",
"House of the Dragon","Hunger Games, The","IT (1990)","IT: Chapter One",
"IT: Chapter Two","IT: Welcome to Derry","Jurassic Park",
"Knight of the Seven Kingdoms, A","Lord of the Rings, The","Mandalorian, The",
"Marvel","Miscellaneous","Monty Python and the Holy Grail","Myths","Outlander",
"Overwatch","Parks and Recreation","Pokémon","Sonic the Hedgehog","Squid Game",
"Stranger Things","Vampire Diaries, The","World of Warcraft","Willy Wonka",
"Witcher 3: Wild Hunt, The","Witcher (Netflix), The","USAF"
]

def nullable_num(value):
    text = str(value or "").strip().replace("$", "").replace(",", "")
    if not text:
        return None
    try:
        return round(float(text), 2)
    except ValueError:
        return None

def read_csv_tab(name):
    from urllib.parse import quote
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:csv&sheet={quote(name)}"
    request = urllib.request.Request(url, headers={"User-Agent": "PopFolio/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return list(csv.reader(io.StringIO(response.read().decode("utf-8-sig"))))

def fetch_items():
    items = []
    errors = []
    for tab in FRANCHISE_TABS:
        try:
            rows = read_csv_tab(tab)
            if not rows or "Name" not in rows[0]:
                raise ValueError("Missing expected Name header")
            for index, row in enumerate(rows[1:], start=2):
                row += [""] * max(0, 18 - len(row))
                name = row[2].strip()
                if not name or name.lower().startswith("total"):
                    continue
                items.append(dict(
                    id=f"{tab}:{index}", franchise=tab, name=name, number=row[3].strip(),
                    variant=row[4].strip(), platform=row[6].strip(), date=row[7].strip(),
                    itemPrice=nullable_num(row[9]), cost=nullable_num(row[10]),
                    marketValue=nullable_num(row[11]), sold=nullable_num(row[14]),
                    image=None))
        except Exception as exc:
            errors.append(f"{tab}: {exc}")
    if errors:
        raise ValueError("Item import incomplete; retaining prior item snapshot. " + "; ".join(errors))
    if len(items) < 100:
        raise ValueError("Unexpectedly few items; retaining prior item snapshot.")
    return items

def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "PopFolio/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response:
        content = response.read().decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(content)))
    start = next((i for i, row in enumerate(rows) if row and row[0].strip().upper() == "FRANCHISE"), None)
    if start is None:
        raise ValueError("Expected FRANCHISE header was not found; existing snapshot preserved.")
    groups = []
    for row in rows[start + 1:]:
        if not row or not row[0].strip():
            continue
        if row[0].strip().upper() == "TOTAL":
            break
        if len(row) < 6:
            continue
        groups.append(dict(name=row[0].strip(), count=int(num(row[1])),
                           itemCost=num(row[2]), cost=num(row[3]), value=num(row[4]),
                           gain=num(row[5]), sold=num(row[6]) if len(row) > 6 else 0))
    if len(groups) < 10:
        raise ValueError("Insufficient franchise data; existing snapshot preserved.")
    totals = dict(count=sum(x["count"] for x in groups),
                  cost=round(sum(x["cost"] for x in groups), 2),
                  value=round(sum(x["value"] for x in groups), 2),
                  gain=round(sum(x["gain"] for x in groups), 2))
    totals["roi"] = round(totals["gain"] / totals["cost"] * 100, 2) if totals["cost"] else 0
    output = dict(updatedAt=datetime.now(timezone.utc).isoformat(), source="Google Sheets Dashboard", groups=groups, totals=totals)
    items = fetch_items()
    pathlib.Path("data").mkdir(exist_ok=True)
    pathlib.Path("data/portfolio.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    pathlib.Path("data/pops.json").write_text(json.dumps({"updatedAt": output["updatedAt"], "items": items}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Refreshed", len(groups), "franchises and", len(items), "individual Pops")

if __name__ == "__main__":
    main()
