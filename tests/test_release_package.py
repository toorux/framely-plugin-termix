import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile
sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
from pack import pack
from submit_database import channel,release_url,validate_registration_manifest

class ReleasePackage(unittest.TestCase):
    def test_release_manifest_checksums_and_deterministic_package(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'payload').mkdir()
            source={'id':'tooru.termix','version':'0.1.8','files':{}}
            (root/'manifest.json').write_text(json.dumps(source))
            (root/'payload/page.js').write_bytes(b'fixture')
            first=pack(root,repository='toorux/framely-plugin-termix');content=first.read_bytes()
            with zipfile.ZipFile(first) as z:
                manifest=json.loads(z.read('manifest.json'))
                self.assertEqual(manifest['downloadUrl'],release_url(source,'toorux/framely-plugin-termix'))
                self.assertEqual(manifest['files']['page.js'],hashlib.sha256(b'fixture').hexdigest())
            self.assertEqual(json.loads((root/'manifest.json').read_text()),source)
            self.assertEqual(pack(root,repository='toorux/framely-plugin-termix').read_bytes(),content)
            self.assertEqual((root/'dist/SHA256SUMS').read_text(),f'{hashlib.sha256(content).hexdigest()}  {first.name}\n')
    def test_channel_and_registration_validation(self):
        self.assertEqual(channel('0.1.8'),'main');self.assertEqual(channel('0.1.9-preview.1'),'testing')
        validate_registration_manifest({'id':'tooru.termix','version':'0.1.8'})
        with self.assertRaises(ValueError):validate_registration_manifest({'id':'invalid','version':'0.1.8'})
