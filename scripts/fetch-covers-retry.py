#!/usr/bin/env python3
"""Retry pass for scripts/fetch-covers.py — only fetches covers still missing
after the first run, with retries and more conservative pacing (the first
pass hit connection resets/timeouts from Open Library partway through a
65-title burst, not genuine no-matches for most of them)."""
import json
import time
import urllib.request
import urllib.parse
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from pathlib import Path
from cover_catalog import load_cover_rows

ROOT = Path(__file__).resolve().parent.parent
COVERS_DIR = ROOT / "assets/covers"
ASSET_MAP_PATH = ROOT / "src/ui/coverAssets.ts"
SOURCES_PATH = ROOT / "docs/cover-sources.json"

USER_AGENT = "ComicPill/1.0 (personal reading app; contact: mukund.umashankar@gmail.com)"
HEADERS = {"User-Agent": USER_AGENT}
# Multiple workers hide network latency, but one shared gate keeps the total
# request rate within Open Library's documented 3 requests/second ceiling.
REQUEST_INTERVAL_SECONDS = 1 / 3
_request_lock = threading.Lock()
_next_request_at = 0.0


def open_url(request, timeout: int):
    global _next_request_at
    with _request_lock:
        now = time.monotonic()
        wait = max(0.0, _next_request_at - now)
        _next_request_at = max(now, _next_request_at) + REQUEST_INTERVAL_SECONDS
    if wait:
        time.sleep(wait)
    return urllib.request.urlopen(request, timeout=timeout)


def search_title(raw_title: str) -> str:
    t = re.sub(r"\s*\(.*?\)\s*", " ", raw_title)
    return re.sub(r"\s+", " ", t).strip()


def normalize_title(title: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", title.lower())).strip()


def query_variants(title: str) -> list[str]:
    """Try editions' common catalog forms, from most to least specific."""
    compact = re.sub(r"\b(?:vol(?:ume)?|book)\.?\s*\d+\b.*", "", title, flags=re.IGNORECASE).strip(" :.-")
    no_creator = re.sub(r"\s+by\s+[^:]+", "", title, flags=re.IGNORECASE).strip()
    before_colon = title.split(":", 1)[0].strip()
    variants = [title, no_creator, compact, before_colon]
    if title.lower().startswith("the "):
        variants.append(title[4:])
    seen: set[str] = set()
    return [variant for variant in variants if len(variant) >= 5 and not (variant in seen or seen.add(variant))]


def credible_match(requested_title: str, result_title: str | None) -> bool:
    """Allow a shorter series title, but never a one-word generic result."""
    requested = set(normalize_title(requested_title).split()) - {"the", "a", "an", "vol", "volume", "book", "by"}
    result = set(normalize_title(result_title or "").split()) - {"the", "a", "an", "vol", "volume", "book", "by"}
    if len(result) < 2 or not result:
        return False
    overlap = len(requested & result) / len(result)
    similarity = SequenceMatcher(None, normalize_title(requested_title), normalize_title(result_title or "")).ratio()
    return overlap >= 0.8 and (len(requested & result) >= 2 or similarity >= 0.72)


def with_retry(fn, attempts=3, base_delay=2.0):
    last_err = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:
            last_err = e
            time.sleep(base_delay * (i + 1))
    raise last_err


def open_library_search(title: str):
    # The title-only index now commonly omits cover_i for comics; q retains
    # cover metadata while still searching with the complete work title.
    for query_title in query_variants(title):
        q = urllib.parse.urlencode({"q": query_title, "limit": 10})
        url = f"https://openlibrary.org/search.json?{q}"
        def do():
            req = urllib.request.Request(url, headers=HEADERS)
            with open_url(req, timeout=20) as resp:
                return json.load(resp)
        data = with_retry(do)
        for doc in data.get("docs", []):
            if doc.get("cover_i") and credible_match(title, doc.get("title")):
                return doc
    return None


def fetch_cover_bytes(cover_i: int, size: str = "L"):
    url = f"https://covers.openlibrary.org/b/id/{cover_i}-{size}.jpg?default=false"
    def do():
        req = urllib.request.Request(url, headers=HEADERS)
        with open_url(req, timeout=20) as resp:
            if resp.status != 200:
                return None
            return resp.read()
    return with_retry(do)


def fetch_one(row: dict[str, str]):
    work_id, title = row["id"], row["title"]
    try:
        doc = open_library_search(search_title(title))
    except Exception as error:
        return work_id, title, None, None, f"search failed after retries: {error}"
    if not doc:
        return work_id, title, None, None, "no cover found"
    try:
        image = fetch_cover_bytes(doc["cover_i"])
    except Exception as error:
        return work_id, title, None, None, f"cover fetch failed after retries: {error}"
    if not image or len(image) < 500:
        return work_id, title, None, None, "placeholder-sized, skipping"
    return work_id, title, image, doc, None


def main():
    rows = load_cover_rows()
    sources = json.loads(SOURCES_PATH.read_text()) if SOURCES_PATH.exists() else {}
    # A prior interrupted run can leave an image without its attribution.
    # Re-fetch those rather than treating them as complete.
    already = {p.stem for p in COVERS_DIR.glob("*.jpg")} & set(sources)
    prefixes = tuple(sys.argv[1:])
    missing_rows = [r for r in rows if r["id"] not in already and (not prefixes or r["id"].startswith(prefixes))]
    print(f"Retrying {len(missing_rows)} missing covers (already have {len(already)})")

    found = 0
    still_missing = []
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(fetch_one, row): index for index, row in enumerate(missing_rows, 1)}
        for future in as_completed(futures):
            index = futures[future]
            work_id, title, image, doc, error = future.result()
            print(f"[{index}/{len(missing_rows)}] {title!r}")
            if error:
                print(f"    {error}")
                still_missing.append(title)
                continue

            (COVERS_DIR / f"{work_id}.jpg").write_bytes(image)
            found += 1
            print(f"    saved ({len(image)} bytes)")
            sources[work_id] = {
                "title": title, "matchedTitle": doc.get("title"),
                "openLibraryWorkKey": doc.get("key"), "coverId": doc.get("cover_i"),
                "coverUrl": f"https://covers.openlibrary.org/b/id/{doc['cover_i']}-L.jpg",
                "source": "Open Library",
            }
            # Persist attribution as the image is written; an interrupted batch
            # can then safely resume without orphaning a downloaded asset.
            SOURCES_PATH.write_text(json.dumps(sources, indent=2))

    SOURCES_PATH.write_text(json.dumps(sources, indent=2))

    # Regenerate the asset map from whatever's actually on disk now.
    all_covers = sorted(p.stem for p in COVERS_DIR.glob("*.jpg"))
    requires = [f"  '{wid}': require('../../assets/covers/{wid}.jpg')," for wid in all_covers]
    asset_map_ts = (
        "// GENERATED by scripts/fetch-covers.py + fetch-covers-retry.py — do not hand-edit.\n"
        "// Metro requires static, bundle-time-known require() paths, so this map\n"
        "// (rather than a runtime-constructed path) is how a workId resolves to a\n"
        "// bundled cover asset. Re-run the scripts after catalog changes.\n"
        "import type { ImageSourcePropType } from 'react-native';\n\n"
        "export const COVER_ASSETS: Record<string, ImageSourcePropType> = {\n"
        + "\n".join(requires) + "\n"
        "};\n"
    )
    ASSET_MAP_PATH.write_text(asset_map_ts)

    total = len(all_covers)
    print(f"\nRetry done: +{found} recovered. Total now: {total}/{len(rows)}")
    if still_missing:
        print(f"Still missing {len(still_missing)}: {still_missing}")


if __name__ == "__main__":
    main()
