#!/usr/bin/env python3
"""Verify the packaged Pages data and prevent raw data from being published."""

import json
from prepare_pages import OUTPUT, SITE, strip_profile_links


def verify(output=OUTPUT, site=SITE):
    if not (output / 'index.html').is_file():
        raise ValueError('Pages index is missing; run prepare:pages first.')
    expected = strip_profile_links(json.loads((site / 'data/victims.json').read_text(encoding='utf-8')))
    actual = json.loads((output / 'data/victims.json').read_text(encoding='utf-8'))
    if actual != expected:
        raise ValueError('Published victim data does not match the sanitized source.')
    files = {p.relative_to(output / 'data').as_posix() for p in (output / 'data').rglob('*') if p.is_file()}
    if files != {'victims.json'}:
        raise ValueError('Unexpected raw files in published data directory.')
    for path in (site / 'dist').rglob('*'):
        relative = path.relative_to(site / 'dist')
        if path.is_file() and 'data' not in relative.parts:
            if not (output / relative).is_file() or (output / relative).read_bytes() != path.read_bytes():
                raise ValueError(f'Published asset differs from the verified build: {relative}')


if __name__ == '__main__':
    verify()
    print('Public Pages artifact verified.')
