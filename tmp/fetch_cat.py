#!/usr/bin/env python3
"""Assign one distinct, subject-correct photo to every product.

Instead of free-text search (rate limited and noisy), this walks curated
Wikimedia Commons categories per product group, filters by brand allow/deny
lists, scores each photo for clean studio-style borders, and assigns a
different photo to each product in the group. Output: 1200x900 webp.
"""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request

OUT = "client/public/img/products"
TMP = "/tmp/imgwork"
os.makedirs(OUT, exist_ok=True)
os.makedirs(TMP, exist_ok=True)
UA = {"User-Agent": "ElectroPC-catalog/1.0 (product photo curation)"}

BAD = re.compile(
    r"logo|icon\b|diagram|chart|schematic|\bmap\b|screenshot|benchmark|review|"
    r"im vergleich|geekerwan|极客湾|teardown|disassembl|advertis|packaging|"
    r"comparison|\bvs\b|test result|performance|score|graph\b|feed|showing|"
    r"box\b|manual|sticker", re.I)

GLOBAL_DENY = re.compile(
    r"jeep|ambulance|truck|\bcar\b|vehicle|motorcycle|smartphone|optimus|"
    r"tablet|printer|motherboard|water ?block|server room|datacenter", re.I)

# group -> (candidate categories, brand allow, brand deny, [slugs in order])
GROUPS = {
    "laptop": (["Category:Laptops by brand", "Category:Laptops", "Category:Notebook computers"],
               r"", r"", ["p1-asus-rog-strix-g16", "p2-lenovo-ideapad-slim-5"]),
    "gpu_nv": (["Category:GeForce 40 series", "Category:Nvidia GeForce graphics cards",
                "Category:Graphics cards"], r"geforce|nvidia|rtx", r"radeon|amd", ["p3-rtx-4070-super"]),
    "gpu_amd": (["Category:AMD Radeon graphics cards", "Category:Radeon", "Category:Graphics cards"],
                r"radeon|amd|rx", r"geforce|nvidia", ["p4-rx-7800-xt"]),
    "cpu_intel": (["Category:Intel Core i7", "Category:Intel Core processors",
                   "Category:Computer processors"], r"intel|core", r"ryzen|amd", ["p5-core-i7-14700k"]),
    "cpu_amd": (["Category:AMD Ryzen", "Category:AMD processors", "Category:Computer processors"],
                r"ryzen|amd", r"intel|core i", ["p6-ryzen-7-7800x3d"]),
    "ddr5": (["Category:DDR5 SDRAM", "Category:DDR SDRAM", "Category:Computer memory"],
             r"ddr5", r"", ["p7-corsair-ddr5-32gb"]),
    "ddr4": (["Category:DDR4 SDRAM", "Category:DDR SDRAM", "Category:Computer memory"],
             r"ddr4", r"ddr5", ["p8-kingston-fury-ddr4"]),
    "ssd": (["Category:NVM Express SSDs", "Category:M.2 solid-state drives",
             "Category:Solid-state drives"], r"", r"", ["p9-samsung-990-pro-2tb", "p10-wd-blue-sn580-1tb"]),
    "mon_samsung": (["Category:Samsung monitors", "Category:Computer monitors"],
                    r"samsung|odyssey", r"lg|dell|acer|benq", ["p11-samsung-odyssey-g5-27"]),
    "mon_lg": (["Category:LG monitors", "Category:Computer monitors"],
               r"lg|ultragear", r"samsung|dell|acer|benq", ["p12-lg-ultragear-24"]),
    "keyboard": (["Category:Mechanical keyboards", "Category:Computer keyboards",
                  "Category:Keychron keyboards", "Category:Gaming keyboards"],
                 r"", r"", ["p13-keychron-k8-pro", "p17-logitech-k380", "p18-redragon-k552"]),
    "mouse": (["Category:Computer mice", "Category:Logitech mice", "Category:Gaming mice"],
              r"", r"", ["p14-logitech-gpro-x-superlight", "p19-razer-deathadder-v3",
                         "p20-logitech-m170"]),
    "headset": (["Category:Headphones", "Category:Headsets", "Category:Gaming headsets"],
                r"", r"", ["p15-hyperx-cloud-3", "p21-steelseries-arctis-nova-1",
                           "p22-jbl-quantum-100"]),
    "psu": (["Category:Computer power supply units", "Category:Power supply units"],
            r"", r"", ["p16-corsair-rm850e", "p23-coolermaster-mwe-650",
                       "p24-be-quiet-pure-power-12m"]),
}

BRAND_HINT = {
    "p1-asus-rog-strix-g16": r"rog|asus", "p2-lenovo-ideapad-slim-5": r"ideapad|lenovo",
    "p5-core-i7-14700k": r"i7|intel", "p6-ryzen-7-7800x3d": r"ryzen|amd",
    "p7-corsair-ddr5-32gb": r"corsair|vengeance", "p8-kingston-fury-ddr4": r"kingston|fury",
    "p9-samsung-990-pro-2tb": r"samsung|990", "p10-wd-blue-sn580-1tb": r"wd|western digital",
    "p13-keychron-k8-pro": r"keychron", "p17-logitech-k380": r"logitech", "p18-redragon-k552": r"redragon",
    "p14-logitech-gpro-x-superlight": r"logitech|g pro|superlight", "p19-razer-deathadder-v3": r"razer|deathadder",
    "p20-logitech-m170": r"logitech", "p15-hyperx-cloud-3": r"hyperx", "p21-steelseries-arctis-nova-1": r"steelseries|arctis",
    "p22-jbl-quantum-100": r"jbl|quantum", "p16-corsair-rm850e": r"corsair|rm850",
    "p23-coolermaster-mwe-650": r"cooler master|mwe", "p24-be-quiet-pure-power-12m": r"be ?quiet",
}


def api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    last = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except Exception as e:
            last = e
            time.sleep(6 + attempt * 7)
    print("api failed", last, file=sys.stderr)
    return {}


def category_files(cat, limit=60):
    data = api({"action": "query", "format": "json", "generator": "categorymembers",
                "gcmtitle": cat, "gcmtype": "file", "gcmlimit": limit,
                "prop": "imageinfo", "iiprop": "url|size|mime", "iiurlwidth": 1400})
    pages = (data.get("query") or {}).get("pages") or {}
    out = []
    for p in pages.values():
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


def score(path):
    try:
        mean = float(subprocess.run(["convert", path, "-colorspace", "Gray", "-resize", "200x200!",
                                     "-format", "%[fx:mean]", "info:"],
                                    capture_output=True, text=True, timeout=20).stdout.strip() or 0)
        corners = []
        for geo in ["70x70+0+0", "70x70+130+0", "70x70+0+130", "70x70+130+130"]:
            corners.append(float(subprocess.run(
                ["convert", path, "-colorspace", "Gray", "-resize", "200x200!", "-crop", geo,
                 "+repage", "-format", "%[fx:mean]", "info:"],
                capture_output=True, text=True, timeout=20).stdout.strip() or 0))
        unif = max(0.0, 1.0 - (max(corners) - min(corners)) * 2.2)
        return mean * 0.35 + unif * 0.65
    except Exception:
        return 0.3


def render(raw, dest):
    subprocess.run(["convert", raw, "-auto-orient", "-resize", "1200x900^", "-gravity", "center",
                    "-extent", "1200x900", "-strip", "-quality", "86", dest],
                   check=True, capture_output=True, timeout=60)


def run_group(name, cats, allow, deny, slugs):
    pool = []
    seen = set()
    for cat in cats:
        files = category_files(cat)
        for f in files:
            if f["title"] in seen:
                continue
            seen.add(f["title"])
            pool.append(f)
        if len(pool) >= len(slugs) * 4:
            break
        time.sleep(1.2)
    allow_rx = re.compile(allow, re.I) if allow else None
    deny_rx = re.compile(deny, re.I) if deny else None
    filtered = [f for f in pool
                if (not allow_rx or allow_rx.search(f["title"]))
                and not (deny_rx and deny_rx.search(f["title"]))]
    if len(filtered) < len(slugs):
        filtered = pool  # fall back to whole category rather than leaving a gap
    # rank: brand hint first, then clean-border score
    scored = []
    for i, f in enumerate(filtered[:22]):
        raw = os.path.join(TMP, f"{name}-{i}.jpg")
        try:
            req = urllib.request.Request(f["url"], headers=UA)
            with urllib.request.urlopen(req, timeout=35) as r, open(raw, "wb") as fh:
                fh.write(r.read())
            if os.path.getsize(raw) < 15000:
                continue
        except Exception:
            continue
        scored.append((score(raw), raw, f["title"]))
    for slug in slugs:
        hint = re.compile(BRAND_HINT.get(slug, r"$^"), re.I)
        hint_hits = [s for s in scored if hint.search(s[2])]
        pick = None
        for cand in hint_hits + sorted(scored, key=lambda x: -x[0]):
            if cand is None:
                continue
            pick = cand
            scored = [s for s in scored if s[2] != cand[2]]
            break
        if not pick:
            print("MISS", slug)
            continue
        dest = os.path.join(OUT, slug + ".webp")
        render(pick[1], dest)
        print(f"ok {slug} {pick[0]:.2f} {os.path.getsize(dest)//1024}KB <- {pick[2]}")


if __name__ == "__main__":
    only = sys.argv[1:] or list(GROUPS)
    for name in only:
        cats, allow, deny, slugs = GROUPS[name]
        print(f"== {name} ==")
        run_group(name, cats, allow, deny, slugs)
    print("files:", len([f for f in os.listdir(OUT) if f.startswith('p')]))
