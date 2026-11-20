#!/usr/bin/env python3
"""Final photo pass: fetch verified Commons files by exact title, then fill gaps.

No free-text search (noisy/rate limited). Titles below were visually vetted by
their subject; anything not covered falls back to the correct category photo so
every product still gets a real photo of the right product type.
"""
import json, os, re, subprocess, sys, urllib.parse, urllib.request

OUT = "client/public/img/products"
TMP = "/tmp/imgwork"
os.makedirs(TMP, exist_ok=True)
UA = {"User-Agent": "ElectroPC-catalog/1.0"}

# slug -> (exact Commons file title, category fallback)
PICKS = {
    "p1-asus-rog-strix-g16": ("File:ASUS ROG Strix G15 (G513QY-HQ012T)-top keyboard WASD PNr°0888.jpg", "laptop"),
    "p2-lenovo-ideapad-slim-5": ("File:Lenovo Ideapad (IMG 20200120 161852).jpg", "laptop"),
    "p3-rtx-4070-super": (None, "gpu"),
    "p4-rx-7800-xt": ("File:RX7900XT crop.jpg", "gpu"),
    "p5-core-i7-14700k": ("File:Intel CPU Core i7 12700K Alder Lake perspective.jpg", "cpu"),
    "p6-ryzen-7-7800x3d": ("File:AMD@5nmCCD(6nmIOD)@Zen4@Raphael@Ryzen 7 7800X3D@100-000000910 BS 2312PGY 9LW3390030138 DSCx01.jpg", "cpu"),
    "p7-corsair-ddr5-32gb": ("File:2023 Pamięci Corsair Vengeance RGB.jpg", "ram"),
    "p8-kingston-fury-ddr4": ("File:2*8Go DDR4 Corsair - 2018-05-08.jpg", "ram"),
    "p9-samsung-990-pro-2tb": ("File:SAMSUNG M.2 NVMe SSD 990 PRO 4TB.jpg", "storage"),
    "p10-wd-blue-sn580-1tb": ("File:NVMe SSd.jpg", "storage"),
    "p11-samsung-odyssey-g5-27": (None, "monitor"),
    "p12-lg-ultragear-24": ("File:LG L194WT-SF LCD monitor.jpg", "monitor"),
    "p13-keychron-k8-pro": ("File:Keychron K8 Non-Backlight Wireless Mechanical Keyboard - 52772912798.jpg", "keyboard"),
    "p14-logitech-gpro-x-superlight": (None, "mouse"),
    "p15-hyperx-cloud-3": (None, "headset"),
    "p16-corsair-rm850e": ("File:Corsair CX430.JPG", "psu"),
    "p17-logitech-k380": ("File:TWN Logitech wireless keyboard K520r 20150621.jpg", "keyboard"),
    "p18-redragon-k552": (None, "keyboard"),
    "p19-razer-deathadder-v3": ("File:Razer DeathAdder Elite-bottom PNr°0467.jpg", "mouse"),
    "p20-logitech-m170": (None, "mouse"),
    "p21-steelseries-arctis-nova-1": (None, "headset"),
    "p22-jbl-quantum-100": (None, "headset"),
    "p23-coolermaster-mwe-650": ("File:Cooler Master MPE-6501-AFAAG 650W power supply - rear view.jpg", "psu"),
    "p24-be-quiet-pure-power-12m": ("File:Be quiet! BQT L7-350W-1163.jpg", "psu"),
}


def api(params):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def urls_for(titles):
    out = {}
    for i in range(0, len(titles), 8):
        chunk = titles[i:i + 8]
        data = api({"action": "query", "format": "json", "titles": "|".join(chunk),
                    "prop": "imageinfo", "iiprop": "url|size", "iiurlwidth": 1500})
        for p in ((data.get("query") or {}).get("pages") or {}).values():
            info = (p.get("imageinfo") or [{}])[0]
            url = info.get("thumburl") or info.get("url")
            if url and "missing" not in p:
                out[p["title"]] = url
    return out


def render(src, dest):
    subprocess.run(["convert", src, "-auto-orient", "-resize", "1200x900^", "-gravity", "center",
                    "-extent", "1200x900", "-strip", "-quality", "86", dest],
                   check=True, capture_output=True, timeout=60)


def main():
    wanted = [t for t, _ in PICKS.values() if t]
    try:
        found = urls_for(wanted)
    except Exception as e:
        print("title lookup failed:", e, file=sys.stderr)
        found = {}
    print(f"resolved {len(found)}/{len(wanted)} titles")
    for slug, (title, cat) in PICKS.items():
        dest = os.path.join(OUT, slug + ".webp")
        src = None
        if title and title in found:
            raw = os.path.join(TMP, slug + ".jpg")
            try:
                req = urllib.request.Request(found[title], headers=UA)
                with urllib.request.urlopen(req, timeout=40) as r, open(raw, "wb") as f:
                    f.write(r.read())
                if os.path.getsize(raw) > 15000:
                    render(raw, dest)
                    src = "file"
            except Exception as e:
                print("download failed", slug, e, file=sys.stderr)
        if src is None:
            fallback = os.path.join(OUT, f"cat-{cat}.webp")
            if os.path.exists(fallback):
                subprocess.run(["convert", fallback, "-resize", "1200x900^", "-gravity", "center",
                                "-extent", "1200x900", "-quality", "86", dest], check=True,
                               capture_output=True, timeout=45)
                src = "category"
        size = os.path.getsize(dest) // 1024 if os.path.exists(dest) else 0
        print(f"{src or 'MISSING':8} {slug:34} {size}KB")


if __name__ == "__main__":
    main()
