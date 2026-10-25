#!/usr/bin/env python3
"""
One-time script: fetch a portrait for each artist/writer offered in onboarding
from Wikipedia/Wikimedia Commons, keeping ONLY images under a free licence
(Creative Commons or public domain). Non-free ("fair use") portraits are
skipped, and those people fall back to their initials in the app.

    python3 scripts/fetch-creator-photos.py

Writes:
  assets/creators/<slug>.jpg               256x256 portrait (face-biased crop)
  src/lib/onboarding/creatorPhotos.ts      static require() map (generated)
  docs/creator-photo-sources.json          author, licence and source page per photo
"""
import io, json, re, time, urllib.parse, urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/creators"
MAP = ROOT / "src/lib/onboarding/creatorPhotos.ts"
SRC = ROOT / "docs/creator-photo-sources.json"
UA = {"User-Agent": "ComicPill/1.0 (personal reading app; contact: mukund.umashankar@gmail.com)"}
API = "https://en.wikipedia.org/w/api.php"

OVERRIDES = {
    "frank-miller": ["Frank Miller"], "sean-murphy": ["Sean Murphy (comics)", "Sean Gordon Murphy"],
    "jock": ["Jock (comics)"], "jae-lee": ["Jae Lee (comics)"], "tom-king": ["Tom King (writer)"],
    "marcos-martin": ["Marcos Martín"], "esad-ribic": ["Esad Ribić"], "george-perez": ["George Pérez"],
    "dan-mora": ["Dan Mora (artist)", "Dan Mora"], "david-aja": ["David Aja"], "g-willow-wilson": ["G. Willow Wilson"],
    "brian-k-vaughan": ["Brian K. Vaughan"], "john-romita-jr": ["John Romita Jr."], "james-tynion-iv": ["James Tynion IV"],
    "jim-lee": ["Jim Lee"], "mike-mignola": ["Mike Mignola"], "gail-simone": ["Gail Simone"],
}
KEYWORDS = re.compile(r"comic|artist|illustrator|writer|author|cartoonist|penciller|novelist|screenwriter", re.I)
FREE = re.compile(r"^(CC|Public domain|PD|Attribution|GFDL|Copyrighted free use)", re.I)

def get(url, binary=False):
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
                d = r.read()
                return d if binary else json.loads(d)
        except Exception:
            time.sleep(1.5 * (i + 1))
    return None

def q(**kw):
    return get(API + "?" + urllib.parse.urlencode({"format": "json", "formatversion": 2, **kw}))

def creators():
    text = (ROOT / "src/lib/onboarding/entities.ts").read_text()
    return re.findall(r"p\('([a-z0-9-]+)',\s*'([^']+)',\s*\[[^\]]*\]", text)

def find(slug, name):
    for title in OVERRIDES.get(slug, []) + [name, name + " (comics)", name + " (writer)", name + " (artist)"]:
        d = q(action="query", titles=title, redirects=1, prop="pageimages|description", piprop="name|thumbnail", pithumbsize=500)
        pages = (d or {}).get("query", {}).get("pages", [])
        if not pages or pages[0].get("missing"):
            continue
        pg = pages[0]
        if not KEYWORDS.search(pg.get("description", "") or ""):
            continue
        if pg.get("pageimage") and pg.get("thumbnail"):
            return pg["title"], pg["pageimage"], pg["thumbnail"]["source"]
    return None

def licence(file_name):
    d = q(action="query", titles="File:" + file_name, prop="imageinfo", iiprop="extmetadata|url")
    pages = (d or {}).get("query", {}).get("pages", [])
    if not pages or "imageinfo" not in pages[0]:
        return None
    m = pages[0]["imageinfo"][0].get("extmetadata", {})
    val = lambda k: re.sub(r"<[^>]+>", "", (m.get(k) or {}).get("value", "") or "").strip()
    return {"licence": val("LicenseShortName"), "author": val("Artist") or "Unknown", "licenceUrl": val("LicenseUrl"),
            "nonFree": val("NonFree").lower() in ("true", "1"), "page": pages[0]["imageinfo"][0].get("descriptionurl", "")}

def crop(raw):
    im = Image.open(io.BytesIO(raw)).convert("RGB")
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = 0 if h > w else 0           # portraits: faces sit in the upper part
    im = im.crop((left, top, left + side, top + side)).resize((256, 256), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=84, optimize=True)
    return buf.getvalue()

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    got, missing, sources = {}, [], {}
    for slug, name in creators():
        hit = find(slug, name)
        if not hit:
            missing.append((name, "no matching Wikipedia page with an image")); continue
        title, fname, thumb = hit
        lic = licence(fname)
        if not lic or lic["nonFree"] or not FREE.search(lic["licence"] or ""):
            missing.append((name, f"image not freely licensed ({(lic or {}).get('licence') or 'unknown'})")); continue
        raw = get(thumb, binary=True)
        if not raw:
            missing.append((name, "download failed")); continue
        (OUT / f"{slug}.jpg").write_bytes(crop(raw))
        got[slug] = name
        sources[f"creator:{slug}"] = {"name": name, "wikipediaPage": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")), "file": fname, **lic}
        print("ok  ", name, "-", lic["licence"])
        time.sleep(0.3)
    lines = ["// GENERATED by scripts/fetch-creator-photos.py — do not hand-edit.", "import type { ImageSourcePropType } from 'react-native';", "",
             "/** Free-licensed portraits only. Anyone missing here shows their initials. */", "export const CREATOR_PHOTOS: Record<string, ImageSourcePropType> = {"]
    for slug in sorted(got):
        lines.append(f"  'creator:{slug}': require('../../../assets/creators/{slug}.jpg'),")
    lines += ["};", ""]
    MAP.write_text("\n".join(lines))
    SRC.write_text(json.dumps(sources, indent=2, ensure_ascii=False))
    print(f"\n{len(got)} portraits, {len(missing)} without a free one:")
    for n, why in missing: print("  -", n, "|", why)

main()
