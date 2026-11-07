import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import prepare_pages
from verify_pages import verify


class PagesPackagingTests(unittest.TestCase):
    def test_nested_private_links_are_removed_without_mutating_source(self):
        data = {'Profile_URL': 'private', 'rows': [{'watchguard_profile_url': 'private', 'source_host': 'WatchGuard.com', 'name': 'claim', 'nested': {'profile_url': 'private', 'url': 'https://public.example/'}}]}
        original = json.dumps(data)
        self.assertEqual(prepare_pages.strip_profile_links(data), {'rows': [{'name': 'claim', 'nested': {'url': 'https://public.example/'}}]})
        self.assertEqual(json.dumps(data), original)

    def test_packaging_excludes_raw_data_and_verifies_real_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary); site = root / 'site'; output = root / 'published'
            (site / 'data').mkdir(parents=True)
            (site / 'dist/data/nested').mkdir(parents=True)
            (site / 'dist/assets').mkdir()
            source = '{"rows":[{"profile_url":"private","name":"claim"}]}'
            (site / 'data/victims.json').write_text(source)
            (site / 'dist/index.html').write_text('<h1>Dashboard</h1>')
            (site / 'dist/assets/app.js').write_text('public code')
            (site / 'dist/data/raw.json').write_text('private')
            (site / 'dist/data/nested/secret.json').write_text('private')
            output.mkdir(); (output / 'stale.json').write_text('old output')
            with patch.object(prepare_pages, 'SITE', site), patch.object(prepare_pages, 'OUTPUT', output), patch.object(sys, 'argv', ['prepare_pages.py']):
                prepare_pages.main()
            self.assertEqual((site / 'data/victims.json').read_text(), source)
            self.assertFalse((output / 'stale.json').exists())
            self.assertEqual({p.name for p in (output / 'data').iterdir()}, {'victims.json'})
            verify(output, site)
            (output / 'data/raw.json').write_text('private')
            with self.assertRaisesRegex(ValueError, 'Unexpected raw'):
                verify(output, site)
            (output / 'data/raw.json').unlink()
            (output / 'data/victims.json').write_text(source)
            with self.assertRaisesRegex(ValueError, 'sanitized source'):
                verify(output, site)
            (output / 'data/victims.json').write_text('{"rows":[{"name":"claim"}]}')
            (output / 'assets/app.js').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'Published asset differs'):
                verify(output, site)


if __name__ == '__main__':
    unittest.main()
