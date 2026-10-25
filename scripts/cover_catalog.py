"""Read every seed-catalog row without needing a TypeScript runtime.

The catalog intentionally lives in a mix of JSON and concise TypeScript title
lists.  The cover scripts need stable work ids for all of them, so this module
mirrors the two slug formats used by the seed modules.
"""
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def slug(title: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", title.lower()))


def _template_lines(path: Path, const_name: str) -> list[str]:
    source = path.read_text()
    match = re.search(rf"const {re.escape(const_name)} = `(?P<lines>.*?)`\.trim\(\)", source, re.DOTALL)
    if not match:
        raise ValueError(f"Could not find {const_name} in {path}")
    return [line.strip() for line in match.group("lines").splitlines() if line.strip()]


def load_cover_rows() -> list[dict[str, str]]:
    """Return `{id, title}` for every bundled seed work, with no duplicates."""
    rows: list[dict[str, str]] = []
    for filename in ("catalog.data.json", "catalog.popular.data.json"):
        rows.extend(json.loads((ROOT / "src/lib/db/seed" / filename).read_text()))

    for line in _template_lines(ROOT / "src/lib/db/seed/catalog.more.ts", "LIST"):
        _lane, title = line.split("|", 1)
        rows.append({"id": f"popular-600-{slug(title)}", "title": title})

    expansion = ROOT / "src/lib/db/seed/catalog.marvel-dc.ts"
    for publisher, const_name, prefix in (
        ("DC", "DC_TITLES", "dc-800"),
        ("Marvel", "MARVEL_TITLES", "marvel-800"),
        ("DC", "DC_1000_TITLES", "dc-1000"),
        ("Marvel", "MARVEL_1000_TITLES", "marvel-1000"),
    ):
        for title in _template_lines(expansion, const_name):
            rows.append({"id": f"{prefix}-{slug(title)}", "title": title})

    ids = [row["id"] for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("Duplicate work IDs found while preparing cover rows")
    return [{"id": row["id"], "title": row["title"]} for row in rows]
