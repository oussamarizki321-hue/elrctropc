#!/usr/bin/env python3
"""Curate one matching product photo per product from Wikimedia Commons.

Each product has an ordered query chain and a deny-list of competing brands /
unrelated subjects, so a "Logitech mouse" never resolves to a Jeep or a phone.
Photos are scored for clean borders (studio-style), cropped to 4:3 and saved
as webp. Existing outputs are skipped, so reruns resume where they stopped.
"""
import json, os, re, subprocess, sys, threading, time, urllib.parse, urllib.request
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
    r"comparison|\bvs\b|test result|performance|score|graph\b|feed|showing", re.I)

GLOBAL_DENY = re.compile(
    r"jeep|ambulance|truck|\bcar\b|vehicle|motorcycle|phone|smartphone|optimus|"
    r"tablet|watch|printer|keyboard layout|motherboard|water ?block|fan\b", re.I)

PRODUCTS = [
    ("p1-asus-rog-strix-g16",
     [("ASUS ROG Strix laptop", r"rog|strix"), ("ASUS ROG gaming notebook", r"rog|asus")], r""),
    ("p2-lenovo-ideapad-slim-5",
     [("Lenovo IdeaPad 5 laptop", r"ideapad|lenovo.*laptop"), ("Lenovo IdeaPad notebook", r"ideapad")], r"thinkpad"),
    ("p3-rtx-4070-super",
     [("GeForce RTX 4070 graphics card", r"4070|geforce"), ("Nvidia GeForce RTX 40 series card", r"geforce|nvidia")], r"radeon|amd"),
    ("p4-rx-7800-xt",
     [("Radeon RX 7800 XT graphics card", r"7800"), ("AMD Radeon RX 7000 graphics card", r"radeon")], r"geforce|nvidia"),
    ("p5-core-i7-14700k",
     [("Intel Core i7-14700K processor", r"14700"), ("Intel Core i7 LGA1700 processor", r"core i7")], r"ryzen|amd"),
    ("p6-ryzen-7-7800x3d",
     [("AMD Ryzen 7 7800X3D processor", r"7800x3d"), ("AMD Ryzen AM5 processor", r"ryzen")], r"intel|core i\d"),
    ("p7-corsair-ddr5-32gb",
     [("Corsair Vengeance DDR5 memory", r"vengeance|ddr5"), ("DDR5 memory module", r"ddr5")], r"kingston|samsung"),
    ("p8-kingston-fury-ddr4",
     [("Kingston Fury DDR4 memory", r"kingston|fury"), ("DDR4 memory module", r"ddr4")], r"corsair|samsung|hynix|g\.?skill|patriot|team ?group"),
    ("p9-samsung-990-pro-2tb",
     [("Samsung 990 Pro NVMe SSD", r"990"), ("Samsung NVMe SSD", r"samsung.*(ssd|nvme)|nvme")], r"wd blue|western digital|crucial|kingston"),
    ("p10-wd-blue-sn580-1tb",
     [("WD Blue SSD", r"wd blue|western digital"), ("M.2 NVMe SSD drive", r"nvme|ssd")], r"samsung|crucial|kingston"),
    ("p11-samsung-odyssey-g5-27",
     [("Samsung Odyssey gaming monitor", r"odyssey"), ("Samsung gaming monitor", r"samsung.*monitor")], r"lg|dell|acer|asus"),
    ("p12-lg-ultragear-24",
     [("LG UltraGear gaming monitor", r"ultragear"), ("LG computer monitor", r"lg.*(monitor|display)")], r"samsung|dell|acer|asus|benq"),
    ("p13-keychron-k8-pro",
     [("Keychron K8 mechanical keyboard", r"keychron"), ("Keychron keyboard", r"keychron")], r"logitech|razer"),
    ("p14-logitech-gpro-x-superlight",
     [("Logitech G Pro X Superlight mouse", r"superlight|g pro x"), ("Logitech G Pro wireless mouse", r"logitech.*(mouse|g pro)")], r"samsung|razer|steelseries|optimus|phone"),
    ("p15-hyperx-cloud-3",
     [("HyperX Cloud headset", r"hyperx"), ("HyperX gaming headset", r"hyperx")], r"steelseries|logitech|razer"),
    ("p16-corsair-rm850e",
     [("Corsair RM850 power supply", r"rm850|corsair"), ("Corsair power supply unit", r"corsair.*(power|psu)")], r"be ?quiet|cooler master"),
    ("p17-logitech-k380",
     [("Logitech K380 keyboard", r"k380"), ("Logitech wireless keyboard", r"logitech.*keyboard")], r"keychron|razer"),
    ("p18-redragon-k552",
     [("Redragon K552 keyboard", r"redragon"), ("Redragon mechanical keyboard", r"redragon")], r"logitech|razer|keychron"),
    ("p19-razer-deathadder-v3",
     [("Razer DeathAdder mouse", r"deathadder|razer"), ("Razer gaming mouse", r"razer")], r"logitech|steelseries"),
    ("p20-logitech-m170",
     [("Logitech M170 wireless mouse", r"m170"), ("Logitech wireless mouse", r"logitech.*mouse")], r"razer|steelseries|jeep|ambulance|car\b"),
    ("p21-steelseries-arctis-nova-1",
     [("SteelSeries Arctis Nova headset", r"arctis|steelseries"), ("SteelSeries Arctis headset", r"arctis")], r"hyperx|logitech|razer"),
    ("p22-jbl-quantum-100",
     [("JBL Quantum gaming headset", r"jbl.*quantum|quantum"), ("JBL gaming headset", r"jbl.*headset")], r"hyperx|steelseries"),
    ("p23-coolermaster-mwe-650",
     [("Cooler Master MWE power supply", r"cooler master|mwe"), ("Cooler Master power supply unit", r"cooler master")], r"corsair|be ?quiet"),
    ("p24-be-quiet-pure-power-12m",
     [("be quiet Pure Power power supply", r"be ?quiet"), ("be quiet power supply unit", r"be ?quiet")], r"corsair|cooler master"),
]


def api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.load(r)
        except Exception as e:
            last = e
            time.sleep(5 + attempt * 6)
    raise last


def search(terms, limit=10):
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
        if BAD.search(title) or GLOBAL_DENY.search(title):
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


def build(slug, chain, deny_pattern):
    dest = os.path.join(OUT, slug + ".webp")
    if os.path.exists(dest) and os.path.getsize(dest) > 15000:
        return slug, "cached"
    deny = re.compile(deny_pattern, re.I) if deny_pattern else None
    for query, pattern in chain:
        rx = re.compile(pattern, re.I)
        cands = [c for c in search(query)
                 if rx.search(c["title"]) and not (deny and deny.search(c["title"]))]
        scored = []
        for i, c in enumerate(cands[:5]):
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
            continue
        scored.sort(reverse=True, key=lambda x: x[0])
        score, raw, title = scored[0]
        with LOCK:
            if title in USED:
                continue
            USED.add(title)
        subprocess.run(
            ["convert", raw, "-auto-orient", "-resize", "1200x900^",
             "-gravity", "center", "-extent", "1200x900",
             "-strip", "-quality", "84", dest],
            check=True, capture_output=True, timeout=45)
        print(f"ok {slug} {score:.2f} {os.path.getsize(dest)//1024}KB <- {title}")
        return slug, {"title": title, "score": round(score, 3)}
    print("NO CANDIDATES", slug)
    return slug, "none"


if __name__ == "__main__":
    offset = int(sys.argv[1]) if len(sys.argv) > 1 else 0
    limit = int(sys.argv[2]) if len(sys.argv) > 2 else len(PRODUCTS)
    batch = PRODUCTS[offset:offset + limit]
    results = {}
    with ThreadPoolExecutor(max_workers=2) as ex:
        for slug, res in ex.map(lambda a: build(*a), batch):
            results[slug] = res
    manifest = "/tmp/imgwork/manifest.json"
    old = json.load(open(manifest)) if os.path.exists(manifest) else {}
    old.update({k: v for k, v in results.items() if v != "cached"})
    json.dump(old, open(manifest, "w"), indent=1)
    print("done", len(results))
