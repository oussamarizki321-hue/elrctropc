#!/usr/bin/env python3
"""Fetch one good product photo per product from Wikimedia Commons.

Picks candidates by search relevance, scores them for clean/uniform borders
(product-on-white style), then crops to 4:3 and writes a webp.
Skips products that already have an output file so reruns resume.
"""
import json, os, re, subprocess, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

OUT = "/workspace/elrctropc/client/public/img/products"
TMP = "/tmp/imgwork"
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)

UA = {"User-Agent": "ElectroPC-catalog/1.0 (product image curation; contact: dev@example.com)"}

# slug -> (primary search terms, fallback terms)
PRODUCTS = [
    ("p1-asus-rog-strix-g16", "ASUS ROG Strix G16 gaming laptop", "gaming laptop ASUS ROG"),
    ("p2-lenovo-ideapad-slim-5", "Lenovo IdeaPad Slim 5 laptop", "Lenovo IdeaPad laptop"),
    ("p3-rtx-4070-super", "GeForce RTX 4070 Super graphics card", "GeForce RTX 4070"),
    ("p4-rx-7800-xt", "Radeon RX 7800 XT graphics card", "AMD Radeon graphics card"),
    ("p5-core-i7-14700k", "Intel Core i7-14700K processor", "Intel Core i7 processor LGA1700"),
    ("p6-ryzen-7-7800x3d", "AMD Ryzen 7 7800X3D processor", "AMD Ryzen processor AM5"),
    ("p7-corsair-ddr5-32gb", "Corsair Vengeance DDR5 memory module", "DDR5 RAM module"),
    ("p8-kingston-fury-ddr4", "Kingston Fury Beast DDR4 memory", "DDR4 RAM module"),
    ("p9-samsung-990-pro-2tb", "Samsung 990 Pro NVMe SSD", "NVMe M.2 SSD"),
    ("p10-wd-blue-sn580-1tb", "Western Digital WD Blue NVMe SSD", "M.2 NVMe SSD drive"),
    ("p11-samsung-odyssey-g5-27", "Samsung Odyssey G5 gaming monitor", "Samsung gaming monitor"),
    ("p12-lg-ultragear-24", "LG UltraGear gaming monitor", "computer monitor 24 inch"),
    ("p13-keychron-k8-pro", "Keychron K8 mechanical keyboard", "Keychron keyboard"),
    ("p14-logitech-gpro-x-superlight", "Logitech G Pro X Superlight mouse", "Logitech G Pro mouse"),
    ("p15-hyperx-cloud-3", "HyperX Cloud III headset", "HyperX Cloud headset"),
    ("p16-corsair-rm850e", "Corsair RM850 power supply", "Corsair power supply unit"),
    ("p17-logitech-k380", "Logitech K380 keyboard", "compact wireless keyboard"),
    ("p18-redragon-k552", "Redragon K552 mechanical keyboard", "mechanical keyboard RGB"),
    ("p19-razer-deathadder-v3", "Razer DeathAdder V3 mouse", "Razer DeathAdder mouse"),
    ("p20-logitech-m170", "Logitech M170 wireless mouse", "wireless computer mouse"),
    ("p21-steelseries-arctis-nova-1", "SteelSeries Arctis Nova headset", "SteelSeries Arctis headset"),
    ("p22-jbl-quantum-100", "JBL Quantum gaming headset", "gaming headset"),
    ("p23-coolermaster-mwe-650", "Cooler Master MWE power supply", "computer power supply unit"),
    ("p24-be-quiet-pure-power-12m", "be quiet! Pure Power power supply", "be quiet power supply"),
]

BAD = re.compile(r"logo|diagram|chart|icon\b|schematic|map\b|svg|screenshot|benchmark|packaging|box\b", re.I)


def api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)


def search(terms, limit=8):
    try:
        data = api({
            "action": "query", "format": "json", "generator": "search",
            "gsrsearch": f"filetype:bitmap {terms}", "gsrlimit": limit,
            "gsrnamespace": 6, "prop": "imageinfo",
            "iiprop": "url|size|mime", "iiurlwidth": 1400,
        })
    except Exception as e:
        print("search failed", terms, e, file=sys.stderr)
        return []
    pages = (data.get("query") or {}).get("pages") or {}
    out = []
    for p in sorted(pages.values(), key=lambda x: x.get("index", 99)):
        info = (p.get("imageinfo") or [{}])[0]
        if info.get("mime") not in ("image/jpeg", "image/png"):
            continue
        if (info.get("width") or 0) < 800 or (info.get("height") or 0) < 600:
            continue
        if BAD.search(p.get("title", "")):
            continue
        url = info.get("thumburl") or info.get("url")
        if url:
            out.append({"title": p.get("title"), "url": url})
    return out


def download(url, path):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r, open(path, "wb") as f:
        f.write(r.read())
    return os.path.getsize(path) > 8000


def stats(path):
    """Return (corner_brightness 0..1, corner_uniformity 0..1, overall_sd)."""
    # Sample the four corners of a 200x200 normalised copy.
    try:
        out = subprocess.run(
            ["convert", path, "-colorspace", "Gray", "-resize", "200x200!",
             "-format", "%[fx:mean]", "info:"],
            capture_output=True, text=True, timeout=20)
        mean = float(out.stdout.strip() or 0)
        # corner crops
        corners = []
        for geo in ["70x70+0+0", "70x70+130+0", "70x70+0+130", "70x70+130+130"]:
            r = subprocess.run(
                ["convert", path, "-colorspace", "Gray", "-resize", "200x200!",
                 "-crop", geo, "+repage", "-format", "%[fx:mean]", "info:"],
                capture_output=True, text=True, timeout=20)
            corners.append(float(r.stdout.strip() or 0))
        spread = max(corners) - min(corners)
        return mean, max(0.0, 1.0 - spread * 2.2)
    except Exception:
        return 0.5, 0.0


def build(slug, terms, fallback):
    dest = os.path.join(OUT, slug + ".webp")
    if os.path.exists(dest) and os.path.getsize(dest) > 15000:
        print("skip", slug)
        return slug, "cached"
    cands = search(terms)
    if len(cands) < 3:
        cands += search(fallback)
    scored = []
    for i, c in enumerate(cands[:7]):
        raw = os.path.join(TMP, f"{slug}-{i}.img")
        try:
            if not download(c["url"], raw):
                continue
        except Exception:
            continue
        bright, unif = stats(raw)
        # prefer bright, uniform (studio/white background) product shots
        score = bright * 0.55 + unif * 0.45
        scored.append((score, raw, c["title"]))
    if not scored:
        print("NO CANDIDATES", slug)
        return slug, "none"
    scored.sort(reverse=True, key=lambda x: x[0])
    score, raw, title = scored[0]
    try:
        subprocess.run(
            ["convert", raw, "-auto-orient", "-resize", "1200x900^",
             "-gravity", "center", "-extent", "1200x900",
             "-strip", "-quality", "84", dest],
            check=True, capture_output=True, timeout=40)
    except Exception as e:
        print("convert failed", slug, e, file=sys.stderr)
        return slug, "convert-fail"
    size = os.path.getsize(dest)
    print(f"ok {slug} score={score:.2f} {size//1024}KB <- {title}")
    return slug, {"title": title, "score": round(score, 3), "bytes": size}


if __name__ == "__main__":
    offset = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else len(PRODUCTS)
    batch = PRODUCTS[offset:offset + limit]
    results = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        for slug, res in ex.map(lambda a: build(*a), batch):
            results[slug] = res
    manifest = "/tmp/imgwork/manifest.json"
    old = {}
    if os.path.exists(manifest):
        old = json.load(open(manifest))
    old.update(results)
    json.dump(old, open(manifest, "w"), indent=1)
    print("done", len(results))
