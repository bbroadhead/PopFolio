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
    pathlib.Path("data").mkdir(exist_ok=True)
    pathlib.Path("data/portfolio.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Refreshed", len(groups), "franchises")

if __name__ == "__main__":
    main()
