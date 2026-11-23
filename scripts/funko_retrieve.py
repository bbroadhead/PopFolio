#!/usr/bin/env python3
"""Retrieve official Funko product image candidates for manual review.

Usage:
  python scripts/funko_retrieve.py --input data/funko-products.json --output funko-candidates.json
  python scripts/funko_retrieve.py --input data/funko-products.json --output funko-candidates.json --download-dir funko-previews

Input: data/pops.json directly, or an array of records with id/name/number/variant.\nProduct URLs are optional: missing links are discovered from Funko search.
The default mode only reads public product pages and records image URLs. --download-dir
downloads preview files locally, never commits them or modifies collection records.
Only download/store/reuse images if you have the appropriate rights.
"""
import argparse
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import time
from urllib.parse import urlparse, urljoin, urlencode
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser

AGENT = "PopFolioProductImageReview/1.0"
MAX_HTML = 2_000_000
MAX_IMAGE = 10_000_000


def official_url(url):
    try:
        p = urlparse(url)
        return (p.scheme == "https" and p.hostname in ("funko.com", "www.funko.com")
                and not p.username and not p.password
                and bool(re.fullmatch(r"/[a-z0-9][a-z0-9-]*/[0-9]+\.html", p.path, re.I)))
    except (ValueError, TypeError):
        return False


class ProductMarkup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.images = []
        self._jsonld = False
        self._chunks = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "script" and attrs.get("type", "").lower() == "application/ld+json":
            self._jsonld = True
            self._chunks = []
        if tag == "meta" and attrs.get("property") in ("og:image", "og:image:secure_url"):
            if attrs.get("content"):
                self.images.append(attrs["content"])

    def handle_data(self, data):
        if self._jsonld:
            self._chunks.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._jsonld:
            self.scripts.append("".join(self._chunks))
            self._jsonld = False


def products(value):
    if isinstance(value, list):
        for x in value:
            yield from products(x)
    elif isinstance(value, dict):
        if value.get("@type") == "Product" or "Product" in value.get("@type", []):
            yield value
        if "@graph" in value:
            yield from products(value["@graph"])


def extract(html_text, page_url):
    parser = ProductMarkup()
    parser.feed(html_text)
    candidates = []
    for script in parser.scripts:
        try:
            records = list(products(json.loads(script)))
        except (ValueError, TypeError):
            continue
        for record in records:
            for item in (record.get("image") if isinstance(record.get("image"), list) else [record.get("image")]):
                if isinstance(item, dict):
                    item = item.get("url") or item.get("contentUrl")
                if isinstance(item, str):
                    candidates.append(item)
    candidates += parser.images
    urls = []
    for candidate in candidates:
        u = urljoin(page_url, html.unescape(candidate))
        p = urlparse(u)
        if p.scheme == "https" and p.hostname and not p.username and not p.password and u not in urls:
            urls.append(u)
    return urls


class SearchLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag != "a":
            return
        href = dict(attrs).get("href", "")
        if href:
            self.links.append(href)


def product_score(item, url):
    """Conservative URL-slug ranking; box number is NOT encoded in the product URL."""
    if not official_url(url):
        return 0
    slug = urlparse(url).path.strip("/").split("/")[0].replace("-", " ").lower()
    name = set(re.findall(r"[a-z0-9]+", str(item.get("name") or "").lower()))
    name -= {"pop", "funko", "the", "and", "with", "of", "a"}
    title = set(re.findall(r"[a-z0-9]+", slug))
    if not name or len(name & title) / len(name) < 0.75:
        return 0
    variant = str(item.get("variant") or "").lower()
    critical = {"chase", "flocked", "diamond", "metallic", "glow", "blacklight"}
    expected = {v for v in critical if v in variant}
    found = {v for v in critical if v in title}
    if expected != found:
        return 0
    return len(name & title) / len(name)


def discover(item, robots):
    """Discover likely official product pages from the public Funko search page."""
    query = " ".join(str(item.get(k) or "") for k in ("name", "number", "variant")).strip()
    if not query:
        return []
    url = "https://funko.com/search/?" + urlencode({"term": query})
    if not robots.can_fetch(AGENT, url):
        return []
    req = Request(url, headers={"User-Agent": AGENT, "Accept": "text/html"})
    with urlopen(req, timeout=20) as response:
        if urlparse(response.geturl()).hostname not in ("funko.com", "www.funko.com"):
            return []
        data = response.read(MAX_HTML + 1)
        if len(data) > MAX_HTML:
            return []
    parser = SearchLinks()
    parser.feed(data.decode("utf-8", errors="replace"))
    urls = list(dict.fromkeys(urljoin(url, html.unescape(h)) for h in parser.links))
    ranked = sorted(((product_score(item, u), u) for u in urls), reverse=True)
    return [u for score, u in ranked if score >= 0.75][:5]


def retrieve(url, limit):
    req = Request(url, headers={"User-Agent": AGENT, "Accept": "text/html,application/xhtml+xml"})
    with urlopen(req, timeout=20) as response:
        if not official_url(response.geturl()):
            raise ValueError("Product page redirected outside the official catalog")
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("Response exceeds size limit")
        return data.decode("utf-8", errors="replace")


def download_preview(url, dest):
    p = urlparse(url)
    if p.scheme != "https" or not p.hostname:
        raise ValueError("Image URL must be HTTPS")
    req = Request(url, headers={"User-Agent": AGENT, "Accept": "image/*"})
    with urlopen(req, timeout=20) as response:
        final = urlparse(response.geturl())
        if final.scheme != "https":
            raise ValueError("Insecure image redirect")
        kind = response.headers.get_content_type()
        ext = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}.get(kind)
        if not ext:
            raise ValueError("Unsupported image MIME type: " + kind)
        data = response.read(MAX_IMAGE + 1)
        if len(data) > MAX_IMAGE:
            raise ValueError("Image exceeds 10 MB")
        dest = dest.with_suffix(ext)
        dest.write_bytes(data)
        return str(dest)


def run(args):
    records = json.loads(Path(args.input).read_text(encoding="utf-8"))
    if isinstance(records, dict):
        records = records.get("items", [])
    if not isinstance(records, list) or len(records) > 10000:
        raise ValueError("Input must be an array of at most 10,000 product records")
    robots = RobotFileParser()
    robots.set_url("https://funko.com/robots.txt")
    robots.read()
    output = []
    review = []
    seen = set()
    folder = Path(args.download_dir) if args.download_dir else None
    if folder:
        folder.mkdir(parents=True, exist_ok=True)
    for i, item in enumerate(records):
        ident = str(item.get("id", "")).strip()
        url = item.get("productUrl", "")
        if not ident or ident in seen:
            print(f"Skipping invalid or duplicate entry {i + 1}")
            continue
        seen.add(ident)
        if not args.include_existing and item.get("image"):
            continue
        if not official_url(url):
            try:
                matches = discover(item, robots)
                if len(matches) != 1:
                    review.append({"id": ident, "name": item.get("name"), "number": item.get("number"), "variant": item.get("variant"), "candidates": matches, "reason": "ambiguous" if matches else "no matching product"})
                    print(f"Needs review {ident}: {len(matches)} possible official pages")
                    time.sleep(max(args.delay, 1.0))
                    continue
                url = matches[0]
                time.sleep(max(args.delay, 1.0))
            except Exception as exc:
                review.append({"id": ident, "reason": "discovery failed", "error": str(exc)[:250]})
                print(f"Discovery failed {ident}: {exc}")
                continue
        if not robots.can_fetch(AGENT, url):
            print(f"Skipping robots-disallowed page for {ident}")
            continue
        try:
            candidates = extract(retrieve(url, MAX_HTML), url)
            if not candidates:
                print(f"No product image metadata for {ident}")
                continue
            entry = {"id": ident, "productUrl": url, "imageUrl": candidates[0],
                     "source": "Funko.com product metadata", "license": "Unverified; review rights before uploading"}
            if folder:
                entry["localPreview"] = download_preview(candidates[0], folder / f"funko-{i + 1}")
            output.append(entry)
            print(f"Found {len(candidates)} candidate(s) for {ident}")
        except Exception as exc:
            print(f"Failed {ident}: {exc}")
        time.sleep(max(args.delay, 1.0))
    Path(args.output).write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    review_path = Path(args.review_output) if args.review_output else Path(args.output).with_name(Path(args.output).stem + "-review.json")
    review_path.write_text(json.dumps(review, indent=2) + "\\n", encoding="utf-8")
    print(f"Wrote {len(output)} candidates to {args.output}; {len(review)} entries need review in {review_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="funko-candidates.json")
    parser.add_argument("--download-dir", help="Opt-in local image downloads; never committed automatically")
    parser.add_argument("--delay", type=float, default=2.0)
    parser.add_argument("--review-output", help="JSON report for missing or ambiguous matches")
    parser.add_argument("--include-existing", action="store_true", help="Include collection entries that already have an image")
    run(parser.parse_args())
