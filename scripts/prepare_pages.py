#!/usr/bin/env python3
"""Build the public Pages artifact without upstream profile-link fields."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"
OUTPUT = ROOT / ".pages-site"
REMOVED_KEYS = {"profile_url", "watchguard_profile_url"}


def strip_profile_links(value):
    if isinstance(value, dict):
        cleaned = {}
        for key, item in value.items():
            if key.casefold() in REMOVED_KEYS:
                continue
            if key.casefold() == "source_host" and "watchguard" in str(item).casefold():
                continue
            cleaned[key] = strip_profile_links(item)
        return cleaned
    if isinstance(value, list):
        return [strip_profile_links(item) for item in value]
    return value


def prepare_data(destination: Path) -> None:
    data = json.loads((SITE / "data" / "victims.json").read_text(encoding="utf-8"))
    public_data = strip_profile_links(data)
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "victims.json").write_text(
        json.dumps(public_data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-only", action="store_true")
    args = parser.parse_args()
    if args.data_only:
        prepare_data(SITE / "public" / "data")
        return

    build = SITE / "dist"
    if not (build / "index.html").is_file():
        parser.error("Astro build is missing; run npm run build in site first.")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(build, OUTPUT, ignore=shutil.ignore_patterns("data"))
    prepare_data(OUTPUT / "data")
    print(f"Prepared public Pages artifact at {OUTPUT}")


if __name__ == "__main__":
    main()
