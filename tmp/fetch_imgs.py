#!/usr/bin/env python3
"""Curate one matching photo per product from Wikimedia Commons (strict).

Rules: JPEG photos only, title must match a product keyword group,
review/benchmark graphics rejected, no duplicate titles across products.
Scores candidates by border brightness/uniformity (studio-style shots).
Existing outputs are skipped so reruns resume.
"""
import json, os, re, subprocess, sys, threading, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

OUT = "/workspace/elrctropc/client/public/img/products"
TMP = "/tmp/imgwork"
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)

UA = {"User-Agent": "ElectroPC-catalog/1.0 (image curation)"}
LOCK = threading.Lock()
USED = set()

BAD = re.compile(
    r"logo|icon\b|diagram|chart|schematic|map\b|screenshot|benchmark|review|"
    r"im vergleich|geekerwan|极客湾|teardown|disassembl|advertis|packaging|"
    r"comparison|\bvs\b|test result|performance|score|graph\b", re.I)

# slug, search terms, fallback terms, required title pattern
PRODUCTS = [
    ("p1-asus-rog-strix-g16", "ASUS ROG Strix laptop", "ROG gaming notebook", r"rog|strix|gaming laptop|notebook"),
    ("p2-lenovo-ideapad-slim-5", "Lenovo IdeaPad laptop", "Lenovo notebook", r"ideapad|lenovo.*(laptop|notebook)|laptop|notebook"),
    ("p3-rtx-4070-super", "GeForce RTX 4070 graphics card", "Nvidia GeForce RTX 40", r"4070|geforce|rtx"),
    ("p4-rx-7800-xt", "Radeon RX 7800 XT", "AMD Radeon RX 7000", r"7800|radeon|rx ?7"),
    ("p5-core-i7-14700k", "Intel Core i7-14700K CPU", "Intel Core i7 LGA 1700", r"14700|core i7|intel core"),
    ("p6-ryzen-7-7800x3d", "AMD Ryzen 7 7800X3D", "AMD Ryzen AM5 processor", r"7800x3d|ryzen"),
    ("p7-corsair-ddr5-32gb", "Corsair Vengeance DDR5", "DDR5 memory module", r"ddr5|corsair|vengeance"),
    ("p8-kingston-fury-ddr4", "Kingston Fury DDR4", "DDR4 memory module", r"ddr4|kingston|fury"),
    ("p9-samsung-990-pro-2tb", "Samsung 990 Pro SSD", "Samsung NVMe SSD", r"990|samsung.*(ssd|nvme)|nvme"),
    ("p10-wd-blue-sn580-1tb", "Western Digital WD Blue SSD", "M.2 NVMe SSD", r"sn580|wd blue|western digital|nvme"),
    ("p11-samsung-odyssey-g5-27", "Samsung Odyssey gaming monitor", "Samsung monitor", r"odyssey|samsung.*monitor|monitor"),
    ("p12-lg-ultragear-24", "LG UltraGear monitor", "LG computer monitor", r"ultragear|lg.*(monitor|display)|monitor"),
    ("p13-keychron-k8-pro", "Keychron K8 keyboard", "Keychron mechanical keyboard", r"keychron"),
    ("p14-logitech-gpro-x-superlight", "Logitech G Pro Superlight mouse", "Logitech G Pro mouse", r"logitech|superlight|g pro"),
    ("p15-hyperx-cloud-3", "HyperX Cloud headset", "HyperX gaming headset", r"hyperx|cloud"),
    ("p16-corsair-rm850e", "Corsair RM850 power supply", "Corsair power supply", r"corsair.*(rm|psu|power)|power supply"),
    ("p17-logitech-k380", "Logitech K380 keyboard", "Logitech wireless keyboard", r"k380|logitech"),
    ("p18-redragon-k552", "Redragon K552 keyboard", "Redragon mechanical keyboard", r"redragon|k552|mechanical keyboard"),
    ("p19-razer-deathadder-v3", "Razer DeathAdder mouse", "Razer gaming mouse", r"razer|deathadder"),
    ("p20-logitech-m170", "Logitech M170 wireless mouse", "wireless computer mouse", r"m170|logitech|wireless mouse"),
    ("p21-steelseries-arctis-nova-1", "SteelSeries Arctis Nova headset", "SteelSeries Arctis", r"steelseries|arctis"),
    ("p22-jbl-quantum-100", "JBL Quantum headset", "JBL gaming headset", r"jbl|quantum|headset"),
    ("p23-coolermaster-mwe-650", "Cooler Master MWE power supply", "Cooler Master power supply", r"cooler master|mwe|power supply"),
    ("p24-be-quiet-pure-power-12m", "be quiet Pure Power power supply", "be quiet power supply", r"be ?quiet|pure power|power supply"),
]


def api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.load(r)


def search(terms, limit=12):
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
        title = p.get("title", "")
        if info.get("mime") != "image/jpeg":
            continue
        if (info.get("width") or 0) < 900 or (info.get("height") or 0) < 600:
            continue
        if BAD.search(title):
            continue
        url = info.get("thumburl") or info.get("url")
        if url:
            out.append({"title": title, "url": url})
    return out


def download(url, path):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r, open(path, "wb") as f:
        f.write(r.read())
    return os.path.getsize(path) > 12000


def stats(path):
    try:
        mean = float(subprocess.run(
            ["convert", path, "-colorspace", "Gray", "-resize", "200x200!",
             "-format", "%[fx:mean]", "info:"],
            capture_output=True, text=True, timeout=20).stdout.strip() or 0)
        corners = []
        for geo in ["70x70+0+0", "70x70+130+0", "70x70+0+130", "70x70+130+130"]:
            corners.append(float(subprocess.run(
                ["convert", path, "-colorspace", "Gray", "-resize", "200x200!",
                 "-crop", geo, "+repage", "-format", "%[fx:mean]", "info:"],
                capture_output=True, text=True, timeout=20).stdout.strip() or 0))
        spread = max(corners) - min(corners)
        return mean, max(0.0, 1.0 - spread * 2.0)
    except Exception:
        return 0.5, 0.0


def build(slug, terms, fallback, pattern):
    dest = os.path.join(OUT, slug + ".webp")
    if os.path.exists(dest) and os.path.getsize(dest) > 15000:
        return slug, "cached"
    rx = re.compile(pattern, re.I)
    cands = [c for c in search(terms) if rx.search(c["title"])]
    if len(cands) < 3:
        cands += [c for c in search(fallback) if rx.search(c["title"]) and c not in cands]
    scored = []
    for i, c in enumerate(cands[:6]):
        with LOCK:
            if c["title"] in USED:
                continue
        raw = os.path.join(TMP, f"{slug}-{i}.jpg")
        try:
            if not download(c["url"], raw):
                continue
        except Exception:
            continue
        bright, unif = stats(raw)
        scored.append((bright * 0.5 + unif * 0.5, raw, c["title"]))
    if not scored:
        print("NO CANDIDATES", slug)
        return slug, "none"
    scored.sort(reverse=True, key=lambda x: x[0])
    score, raw, title = scored[0]
    with LOCK:
        if title in USED:
            print("dup", slug, title)
            return slug, "dup"
        USED.add(title)
    subprocess.run(
        ["convert", raw, "-auto-orient", "-resize", "1200x900^",
         "-gravity", "center", "-extent", "1200x900",
         "-strip", "-quality", "84", dest],
        check=True, capture_output=True, timeout=45)
    print(f"ok {slug} {score:.2f} {os.path.getsize(dest)//1024}KB <- {title}")
    return slug, {"title": title, "score": round(score, 3)}


if __name__ == "__main__":
    offset = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else len(PRODUCTS)
    batch = PRODUCTS[offset:offset + limit]
    results = {}
    with ThreadPoolExecutor(max_workers=4) as ex:
        for slug, res in ex.map(lambda a: build(*a), batch):
            results[slug] = res
    manifest = "/tmp/imgwork/manifest.json"
    old = json.load(open(manifest)) if os.path.exists(manifest) else {}
    old.update({k: v for k, v in results.items() if v != "cached"})
    json.dump(old, open(manifest, "w"), indent=1)
    print("done", len(results))
